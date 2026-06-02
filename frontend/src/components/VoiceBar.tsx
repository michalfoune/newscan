import { useEffect, useRef } from 'react';
import { VoiceState } from '../hooks/useVoiceInput';
import { CloseIcon, SubmitArrowIcon } from './icons';

const N_BARS = 28;

function VoiceWaveform({ analyserRef }: { analyserRef: React.MutableRefObject<AnalyserNode | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animId: number;
    const data = new Uint8Array(256);

    const tick = () => {
      const analyser = analyserRef.current;
      const container = containerRef.current;
      if (analyser && container) {
        analyser.getByteTimeDomainData(data);
        const spans = container.children;
        const segLen = Math.floor(data.length / spans.length);
        for (let i = 0; i < spans.length; i++) {
          let maxAmp = 0;
          for (let j = i * segLen; j < (i + 1) * segLen; j++) {
            maxAmp = Math.max(maxAmp, Math.abs((data[j] ?? 128) - 128));
          }
          const amp = maxAmp / 128;
          (spans[i] as HTMLElement).style.height = `${Math.max(3, amp * 26 + 3)}px`;
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []); // analyserRef is a stable ref object

  return (
    <div className="voice-waveform" ref={containerRef}>
      {Array.from({ length: N_BARS }, (_, i) => <span key={i} />)}
    </div>
  );
}

interface Props {
  state: VoiceState;
  errorMsg: string | null;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  onStop: () => void;
  onCancel: () => void;
}

export function VoiceBar({ state, errorMsg, analyserRef, onStop, onCancel }: Props) {
  const canSend = state === 'recording';

  return (
    <div className="voice-bar">
      <button type="button" className="voice-bar-cancel" onClick={onCancel} title="Cancel">
        <CloseIcon />
      </button>

      <div className="voice-bar-center">
        {state === 'recording' && (
          <>
            <VoiceWaveform analyserRef={analyserRef} />
            <span className="voice-bar-label">Listening…</span>
          </>
        )}
        {state === 'processing' && (
          <>
            <div className="voice-bar-spinner" />
            <span className="voice-bar-label">Transcribing…</span>
          </>
        )}
        {state === 'error' && (
          <span className="voice-bar-error">{errorMsg}</span>
        )}
      </div>

      <button
        type="button"
        className="voice-bar-send"
        onClick={canSend ? onStop : undefined}
        disabled={!canSend}
        title="Send"
      >
        <SubmitArrowIcon />
      </button>
    </div>
  );
}
