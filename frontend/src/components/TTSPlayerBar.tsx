import { Mode } from '../types';
import { TTSState } from '../hooks/useTTS';
import { CloseIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from './icons';

const MODE_ACCENT: Record<Mode, string> = {
  calm: '#7b6fd4',
  balanced: '#4aab73',
  brave: '#e07040',
};

interface Props {
  state: TTSState;
  chunkIdx: number;
  totalChunks: number;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  mode?: Mode;
}

export function TTSPlayerBar({ state, chunkIdx, totalChunks, onPrev, onNext, onPlayPause, onStop, mode }: Props) {
  if (state === 'idle') return null;

  const isLoading = state === 'loading';
  const canPrev = chunkIdx > 0;
  const canNext = chunkIdx < totalChunks - 1;
  const progress = totalChunks > 0 ? (chunkIdx / totalChunks) * 100 : 0;
  const accent = MODE_ACCENT[mode ?? 'calm'];

  return (
    <div className="tts-player-bar">
      <div className="tts-player-progress">
        <div className="tts-player-progress-fill" style={{ width: `${progress}%`, background: accent }} />
      </div>
      <div className="tts-player-controls">
        <div className="tts-player-spacer" />
        <div className="tts-player-center-btns">
          <button
            className="tts-player-btn"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous chunk"
          >
            <SkipBackIcon />
          </button>
          <button
            className={`tts-player-btn tts-player-btn--main${isLoading ? ' tts-player-btn--pulsing' : ''}`}
            onClick={onPlayPause}
            aria-label={state === 'playing' ? 'Pause' : 'Play'}
          >
            {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="tts-player-btn"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next chunk"
          >
            <SkipForwardIcon />
          </button>
        </div>
        <button
          className="tts-player-btn tts-player-btn--close"
          onClick={onStop}
          aria-label="Stop"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
