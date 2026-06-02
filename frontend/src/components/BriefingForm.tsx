import { useRef, useState } from 'react';
import { BriefingRequest, Mode } from '../types';
import { Language, Translations } from '../translations';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, CopyIcon, EditIcon, MicIcon, StopSquareIcon, SubmitArrowIcon } from './icons';

interface Props {
  onSubmit: (req: BriefingRequest) => void;
  onCancel: () => void;
  loading: boolean;
  hasResults: boolean;
  t: Translations;
  language: Language;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  initialRequest?: string;
  apiUrl: string;
}

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

const MODE_COLORS: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

export function BriefingForm({ onSubmit, onCancel, loading, hasResults, t, language, mode, onModeChange, initialRequest = '', apiUrl }: Props) {
  const [request, setRequest] = useState(initialRequest);
  const [submittedRequest, setSubmittedRequest] = useState(initialRequest);
  const [collapsed, setCollapsed] = useState(hasResults);
  const [copied, setCopied] = useState(false);
  const [queryExpanded, setQueryExpanded] = useState(false);
  const [queryOverflow, setQueryOverflow] = useState(false);
  const queryOverflowMeasured = useRef(false);

  const submitRequest = (text: string) => {
    setSubmittedRequest(text);
    setCollapsed(true);
    onSubmit({ request: text, language, mode });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    submitRequest(request.trim());
  };

  const { state: voiceState, errorMsg: voiceError, startRecording, stopRecording, cancel: cancelVoice } = useVoiceInput({
    apiUrl,
    onTranscript: (text, autoSubmit) => {
      setRequest(text);
      if (autoSubmit) submitRequest(text);
    },
  });

  const handleCategory = (index: number) => {
    setRequest(t.categoryPrompts[index]);
  };

  const copyQuery = () => {
    navigator.clipboard.writeText(submittedRequest).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const queryClampRef = (el: HTMLSpanElement | null) => {
    if (el && !queryOverflowMeasured.current && el.scrollHeight > el.clientHeight) {
      queryOverflowMeasured.current = true;
      setQueryOverflow(true);
    }
  };

  if (collapsed && hasResults && !loading) {
    return (
      <div className="briefing-collapsed-wrap">
        <div className="briefing-collapsed" onClick={(e) => { if (!(e.target as Element).closest('button')) setCollapsed(false); }} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsed(false); }}>
          <span ref={!queryExpanded ? queryClampRef : undefined} className={!queryExpanded ? 'briefing-collapsed-query msg-text-clamped' : 'briefing-collapsed-query'}>{submittedRequest}</span>
          {queryOverflow && (
            <button className="msg-chevron-btn msg-chevron-btn--dark" type="button"
              onClick={(e) => { e.stopPropagation(); setQueryExpanded(p => !p); }}>
              {queryExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
          )}
        </div>
        <div className="hover-actions">
          <button type="button" tabIndex={-1} className="hover-action-btn" data-tooltip={copied ? 'Copied!' : 'Copy'}
            onClick={(e) => { e.stopPropagation(); copyQuery(); }}>
            <CopyIcon />
          </button>
          <button type="button" tabIndex={-1} className="hover-action-btn" data-tooltip="Edit"
            onClick={() => setCollapsed(false)}>
            <EditIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="briefing-form">
      <div className="query-box" style={{ '--voice-color': MODE_COLORS[mode] } as React.CSSProperties}>
        <textarea
          id="request"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (request.trim() && !loading) handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder={t.requestPlaceholder}
          rows={2}
          disabled={loading}
        />

        {voiceState !== 'idle' ? (
          <div className="query-box-footer query-box-footer--voice">
            <button type="button" className="voice-cancel-btn" onClick={cancelVoice} title="Cancel">
              <CloseIcon />
            </button>
            <div className="voice-indicator">
              {voiceState === 'recording' && (
                <>
                  <div className="voice-bars"><span/><span/><span/><span/></div>
                  <span className="voice-label">Listening…</span>
                </>
              )}
              {voiceState === 'processing' && (
                <>
                  <div className="voice-spinner" />
                  <span className="voice-label">Transcribing…</span>
                </>
              )}
              {voiceState === 'error' && (
                <span className="voice-error-inline">{voiceError}</span>
              )}
            </div>
            <button
              type="button"
              className="query-submit-btn"
              onClick={voiceState === 'recording' ? stopRecording : undefined}
              disabled={voiceState !== 'recording'}
            >
              <SubmitArrowIcon />
            </button>
          </div>
        ) : (
          <div className="query-box-footer">
            <button
              type="button"
              className="mic-btn"
              onClick={() => { setRequest(''); startRecording(); }}
              disabled={loading}
              title="Voice input"
            >
              <MicIcon />
            </button>
            <div className="query-box-actions">
              <div className="mode-buttons">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`mode-btn${mode === m ? ' mode-btn--active' : ''}`}
                    style={{ background: MODE_COLORS[m] }}
                    onClick={() => onModeChange(m)}
                    disabled={loading}
                  >
                    {t.modeLabels[m]}
                  </button>
                ))}
              </div>
              {loading ? (
                <button type="button" className="query-submit-btn query-submit-btn--stop" onClick={onCancel}>
                  <StopSquareIcon />
                </button>
              ) : (
                <button type="submit" className="query-submit-btn" disabled={!request.trim()}>
                  <SubmitArrowIcon />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="category-pills">
        {t.categories.map((cat, i) => (
          <button key={cat} type="button" className="category-pill" onClick={() => handleCategory(i)} disabled={loading}>
            {cat}
          </button>
        ))}
      </div>
    </form>
  );
}
