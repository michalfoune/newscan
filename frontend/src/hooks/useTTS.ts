import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../utils/getAuthToken';

export type TTSState = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';

function splitSentences(text: string): string[] {
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
  const [chunkIdx, setChunkIdx] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const chunkAbortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<{ text: string; chunks: string[]; idx: number } | null>(null);
  const currentPlayRef = useRef<{ text: string; chunks: string[]; idx: number } | null>(null);
  const generationRef = useRef(0);

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }

  const cleanup = () => {
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    chunkAbortRef.current?.abort();
    chunkAbortRef.current = null;
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
    currentPlayRef.current = null;
    setChunkIdx(0);
    setTotalChunks(0);
    setState('idle');
  };

  const fetchAudioUrl = async (text: string, signal: AbortSignal): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${apiUrl}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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

  const playUrl = (url: string, sessionSignal: AbortSignal, chunkSignal: AbortSignal): Promise<void> => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    const audio = getAudio();

    return new Promise((resolve, reject) => {
      const removeListeners = () => {
        sessionSignal.removeEventListener('abort', onSessionAbort);
        chunkSignal.removeEventListener('abort', onChunkAbort);
      };
      // Session abort = stop everything
      const onSessionAbort = () => { removeListeners(); audio.pause(); reject(new DOMException('Aborted', 'AbortError')); };
      // Chunk abort = skip: resolve so the loop advances to the next chunk
      const onChunkAbort = () => { removeListeners(); audio.pause(); resolve(); };

      sessionSignal.addEventListener('abort', onSessionAbort);
      chunkSignal.addEventListener('abort', onChunkAbort);

      // Set src and call load() before play() — critical for iOS Safari when reusing element
      audio.src = url;
      audio.load();
      audio.onended = () => { removeListeners(); resolve(); };
      audio.onerror = () => { removeListeners(); reject(new Error('Audio error')); };
      audio.play().catch(reject);
    });
  };

  const play = async (text: string) => {
    const gen = ++generationRef.current;

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

    // Unlock audio for iOS Safari — must happen synchronously within the user gesture,
    // before any async work consumes the gesture token.
    const audio = getAudio();
    audio.play().catch(() => {});
    audio.pause();

    const sessionController = new AbortController();
    sessionAbortRef.current = sessionController;
    const { signal: sessionSignal } = sessionController;

    setState('loading');
    setTotalChunks(chunks.length);
    setChunkIdx(startIdx);
    currentPlayRef.current = { text, chunks, idx: startIdx };

    if (chunks.length === 0 || startIdx >= chunks.length) {
      if (gen === generationRef.current) { currentPlayRef.current = null; setState('idle'); }
      return;
    }

    let networkFailed = false;
    try {
      // Pre-fetch first two chunks from startIdx to build a buffer
      const pending: Promise<string | null>[] = [];
      pending.push(fetchAudioUrl(chunks[startIdx], sessionSignal));
      if (startIdx + 1 < chunks.length) pending.push(fetchAudioUrl(chunks[startIdx + 1], sessionSignal));

      for (let i = startIdx; i < chunks.length; i++) {
        const pi = i - startIdx;

        if (i + 2 < chunks.length) {
          pending.push(fetchAudioUrl(chunks[i + 2], sessionSignal));
        }

        const url = await pending[pi];
        if (sessionSignal.aborted) break;
        if (!url) {
          resumeRef.current = { text, chunks, idx: i };
          networkFailed = true;
          break;
        }

        // Per-chunk controller: aborting it skips this chunk without ending the session
        chunkAbortRef.current?.abort();
        const chunkController = new AbortController();
        chunkAbortRef.current = chunkController;

        setState('playing');
        currentPlayRef.current = { text, chunks, idx: i };

        // Advance to 100% when the last chunk starts so the bar completes before it finishes
        if (i === chunks.length - 1) setChunkIdx(chunks.length);

        await playUrl(url, sessionSignal, chunkController.signal);
        if (sessionSignal.aborted) break;
        if (i < chunks.length - 1) setChunkIdx(i + 1);
      }
    } catch {
      // session AbortError or playback error — handled in finally
    } finally {
      if (gen === generationRef.current) {
        cleanup();
        currentPlayRef.current = null;
        if (networkFailed) {
          setState('failed');
        } else {
          resumeRef.current = null;
          setState('idle');
        }
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

  // Skip forward or backward by delta chunks; restarts playback from the new position
  const skipChunk = (delta: number) => {
    if (!currentPlayRef.current) return;
    const { text, chunks, idx } = currentPlayRef.current;
    const newIdx = Math.max(0, Math.min(chunks.length - 1, idx + delta));
    resumeRef.current = { text, chunks, idx: newIdx };
    play(text);
  };

  return { state, chunkIdx, totalChunks, play, stop, togglePause, skipChunk };
}
