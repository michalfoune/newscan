import { useEffect, useRef, useState } from 'react';

export type TTSState = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';

function splitSentences(text: string): string[] {
  // Split on sentence endings and natural pause points including semicolons and em-dashes
  const raw = text.split(/(?<=[.!?;])\s+|(?<=—)\s+/).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';

  for (const s of raw) {
    const joined = buf ? buf + ' ' + s : s;
    if (buf && joined.length > 280) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = joined;
      if (buf.length >= 150) {
        chunks.push(buf.trim());
        buf = '';
      }
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  // Hard-break any chunk still over 280 chars (no sentence ending found) at a word boundary
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= 280) {
      result.push(chunk);
    } else {
      let rem = chunk;
      while (rem.length > 280) {
        const cut = rem.lastIndexOf(' ', 250);
        const at = cut > 80 ? cut : 250;
        result.push(rem.slice(0, at).trim());
        rem = rem.slice(at).trim();
      }
      if (rem) result.push(rem);
    }
  }

  return result.filter(Boolean);
}

export function useTTS(apiUrl: string) {
  const [state, setState] = useState<TTSState>('idle');
  // Single reused audio element — required for iOS Safari autoplay chaining
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<{ text: string; chunks: string[]; idx: number } | null>(null);

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }

  const cleanup = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => cleanup, []);

  const stop = () => {
    cleanup();
    resumeRef.current = null;
    setState('idle');
  };

  const fetchAudioUrl = async (text: string, signal: AbortSignal): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${apiUrl}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal,
        });
        if (!res.ok) {
          if (attempt === 0) continue;
          return null;
        }
        const blob = await res.blob();
        if (signal.aborted) return null;
        return URL.createObjectURL(blob);
      } catch {
        if (signal.aborted) return null;
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        return null;
      }
    }
    return null;
  };

  const playUrl = (url: string, signal: AbortSignal): Promise<void> => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    const audio = getAudio();

    return new Promise((resolve, reject) => {
      const onAbort = () => { audio.pause(); reject(new DOMException('Aborted', 'AbortError')); };
      signal.addEventListener('abort', onAbort, { once: true });
      audio.onended = () => { signal.removeEventListener('abort', onAbort); resolve(); };
      audio.onerror = () => { signal.removeEventListener('abort', onAbort); reject(new Error('Audio error')); };

      // Set src and call load() before play() — critical for iOS Safari when reusing element
      audio.src = url;
      audio.load();
      audio.play().catch(reject);
    });
  };

  const play = async (text: string) => {
    // Resume from failure if same text, otherwise start fresh
    let startIdx = 0;
    let chunks: string[];
    if (resumeRef.current && resumeRef.current.text === text) {
      startIdx = resumeRef.current.idx;
      chunks = resumeRef.current.chunks;
    } else {
      chunks = splitSentences(text);
      resumeRef.current = null;
    }

    cleanup();

    // Unlock audio element for iOS Safari — must happen synchronously within the user gesture,
    // before any async work consumes the gesture token.
    const audio = getAudio();
    audio.play().catch(() => {});
    audio.pause();

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setState('loading');

    if (chunks.length === 0 || startIdx >= chunks.length) { setState('idle'); return; }

    let networkFailed = false;
    try {
      // Pre-fetch two chunks ahead from the start index
      const pending: Promise<string | null>[] = [];
      pending.push(fetchAudioUrl(chunks[startIdx], signal));
      if (startIdx + 1 < chunks.length) pending.push(fetchAudioUrl(chunks[startIdx + 1], signal));

      for (let i = startIdx; i < chunks.length; i++) {
        const pi = i - startIdx;
        if (i + 2 < chunks.length) {
          pending.push(fetchAudioUrl(chunks[i + 2], signal));
        }

        const url = await pending[pi];
        if (signal.aborted) break;
        if (!url) {
          resumeRef.current = { text, chunks, idx: i };
          networkFailed = true;
          break;
        }

        setState('playing');
        await playUrl(url, signal);
        if (signal.aborted) break;
      }
    } catch {
      // AbortError or playback error
    } finally {
      cleanup();
      if (networkFailed) {
        setState('failed');
      } else {
        resumeRef.current = null;
        setState('idle');
      }
    }
  };

  const togglePause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === 'playing') {
      audio.pause();
      setState('paused');
    } else if (state === 'paused') {
      audio.play();
      setState('playing');
    }
  };

  return { state, play, stop, togglePause };
}
