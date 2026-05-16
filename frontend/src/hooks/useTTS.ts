import { useEffect, useRef, useState } from 'react';

export type TTSState = 'idle' | 'loading' | 'playing' | 'paused';

function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const s of raw) {
    buf = buf ? buf + ' ' + s : s;
    if (buf.length >= 60) {
      chunks.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

export function useTTS(apiUrl: string) {
  const [state, setState] = useState<TTSState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
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
    try {
      const res = await fetch(`${apiUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (signal.aborted) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  };

  const playUrl = (url: string, signal: AbortSignal): Promise<void> => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    return new Promise((resolve, reject) => {
      const onAbort = () => { audio.pause(); reject(new DOMException('Aborted', 'AbortError')); };
      signal.addEventListener('abort', onAbort, { once: true });
      audio.onended = () => { signal.removeEventListener('abort', onAbort); resolve(); };
      audio.onerror = () => { signal.removeEventListener('abort', onAbort); reject(new Error('Audio error')); };
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
      // Pre-fetch first chunk immediately
      let nextFetch: Promise<string | null> = fetchAudioUrl(chunks[0], signal);

      for (let i = 0; i < chunks.length; i++) {
        // Kick off the next chunk's fetch while we await the current one
        const futureFetch: Promise<string | null> | null =
          i + 1 < chunks.length ? fetchAudioUrl(chunks[i + 1], signal) : null;

        const url = await nextFetch;
        if (!url || signal.aborted) break;

        setState('playing');
        await playUrl(url, signal);
        if (signal.aborted) break;

        nextFetch = futureFetch ?? Promise.resolve(null);
      }
    } catch {
      // AbortError or playback error — fall through to cleanup
    } finally {
      cleanup();
      setState('idle');
    }
  };

  const togglePause = () => {
    if (!audioRef.current) return;
    if (state === 'playing') {
      audioRef.current.pause();
      setState('paused');
    } else if (state === 'paused') {
      audioRef.current.play();
      setState('playing');
    }
  };

  return { state, play, stop, togglePause };
}
