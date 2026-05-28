import { createContext, useContext, useEffect, useState } from 'react';
import { Mode } from '../types';
import { useTTS, TTSState } from '../hooks/useTTS';

interface TTSContextValue {
  state: TTSState;
  chunkIdx: number;
  totalChunks: number;
  currentSource: string | null;
  currentMode: Mode | null;
  play: (text: string, source: string, mode?: Mode) => void;
  stop: () => void;
  togglePause: () => void;
  skipChunk: (delta: number) => void;
}

const TTSContext = createContext<TTSContextValue | null>(null);

export function TTSProvider({ apiUrl, children }: { apiUrl: string; children: React.ReactNode }) {
  const tts = useTTS(apiUrl);
  const [currentSource, setCurrentSource] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<Mode | null>(null);

  useEffect(() => {
    if (tts.state === 'idle') {
      setCurrentSource(null);
      setCurrentMode(null);
    }
  }, [tts.state]);

  const play = (text: string, source: string, mode?: Mode) => {
    setCurrentSource(source);
    if (mode) setCurrentMode(mode);
    tts.play(text);
  };

  const stop = () => {
    tts.stop();
    setCurrentSource(null);
    setCurrentMode(null);
  };

  return (
    <TTSContext.Provider value={{
      state: tts.state,
      chunkIdx: tts.chunkIdx,
      totalChunks: tts.totalChunks,
      currentSource,
      currentMode,
      play,
      stop,
      togglePause: tts.togglePause,
      skipChunk: tts.skipChunk,
    }}>
      {children}
    </TTSContext.Provider>
  );
}

export function useTTSContext(): TTSContextValue {
  const ctx = useContext(TTSContext);
  if (!ctx) throw new Error('useTTSContext must be used within TTSProvider');
  return ctx;
}
