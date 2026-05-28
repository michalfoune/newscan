import { TTSState } from '../hooks/useTTS';
import { CloseIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from './icons';

interface Props {
  state: TTSState;
  chunkIdx: number;
  totalChunks: number;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onStop: () => void;
}

export function TTSPlayerBar({ state, chunkIdx, totalChunks, onPrev, onNext, onPlayPause, onStop }: Props) {
  if (state === 'idle') return null;

  const isLoading = state === 'loading';
  const canPrev = chunkIdx > 0 && !isLoading;
  const canNext = chunkIdx < totalChunks - 1 && !isLoading;
  const progress = totalChunks > 0 ? ((chunkIdx + 1) / totalChunks) * 100 : 0;

  return (
    <div className="tts-player-bar">
      <div className="tts-player-progress">
        <div className="tts-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="tts-player-controls">
        <button
          className="tts-player-btn"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous chunk"
        >
          <SkipBackIcon />
        </button>
        <button
          className="tts-player-btn tts-player-btn--main"
          onClick={onPlayPause}
          disabled={isLoading}
          aria-label={state === 'playing' ? 'Pause' : 'Play'}
        >
          {isLoading
            ? <span className="tts-spinner" />
            : state === 'playing' ? <PauseIcon /> : <PlayIcon />
          }
        </button>
        <button
          className="tts-player-btn"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next chunk"
        >
          <SkipForwardIcon />
        </button>
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
