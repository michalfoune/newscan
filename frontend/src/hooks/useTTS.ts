import { useEffect, useRef, useState } from 'react';

export type TTSState = 'idle' | 'loading' | 'playing' | 'paused';

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
    cleanup();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setState('loading');

    const chunks = splitSentences(text);
    if (chunks.length === 0) { setState('idle'); return; }

    try {
      // Pre-fetch first two chunks immediately to build a buffer
      const pending: Promise<string | null>[] = [];
      pending.push(fetchAudioUrl(chunks[0], signal));
      if (chunks.length > 1) pending.push(fetchAudioUrl(chunks[1], signal));

      for (let i = 0; i < chunks.length; i++) {
        // Always stay two chunks ahead
        if (i + 2 < chunks.length) {
          pending.push(fetchAudioUrl(chunks[i + 2], signal));
        }

        const url = await pending[i];
        if (!url || signal.aborted) break;

        setState('playing');
        await playUrl(url, signal);
        if (signal.aborted) break;
      }
    } catch {
      // AbortError or playback error
    } finally {
      cleanup();
      setState('idle');
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
