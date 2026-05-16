import { useEffect, useRef, useState } from 'react';

export type TTSState = 'idle' | 'loading' | 'playing' | 'paused';

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

  const play = async (text: string) => {
    cleanup();
    const controller = new AbortController();
    abortRef.current = controller;
    setState('loading');
    try {
      const res = await fetch(`${apiUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { cleanup(); setState('idle'); };
      audio.onerror = () => { cleanup(); setState('idle'); };
      await audio.play();
      setState('playing');
    } catch {
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
