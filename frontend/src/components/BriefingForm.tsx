import { useState } from 'react';
import { BriefingRequest, Mode } from '../types';
import { Language, Translations } from '../translations';

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
}

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

const MODE_COLORS: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

export function BriefingForm({ onSubmit, onCancel, loading, hasResults, t, language, mode, onModeChange, initialRequest = '' }: Props) {
  const [request, setRequest] = useState(initialRequest);
  const [submittedRequest, setSubmittedRequest] = useState(initialRequest);
  const [collapsed, setCollapsed] = useState(hasResults);
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    setSubmittedRequest(request.trim());
    setCollapsed(true);
    onSubmit({ request: request.trim(), language, mode });
  };

  const handleCategory = (index: number) => {
    setRequest(t.categoryPrompts[index]);
  };

  const copyQuery = () => {
    navigator.clipboard.writeText(submittedRequest).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (collapsed && hasResults && !loading) {
    return (
      <div className="briefing-collapsed-wrap">
        <div className="briefing-collapsed" onClick={() => setCollapsed(false)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsed(false); }}>
          <span className="briefing-collapsed-query">{submittedRequest}</span>
        </div>
        <div className="hover-actions">
          <button type="button" className="hover-action-btn" data-tooltip={copied ? 'Copied!' : 'Copy'}
            onClick={(e) => { e.stopPropagation(); copyQuery(); }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2 9V2h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button type="button" className="hover-action-btn" data-tooltip="Edit"
            onClick={() => setCollapsed(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="briefing-form">
      <div className="query-box">
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

        <div className="query-box-footer">
          <div />
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
                <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect width="11" height="11" rx="2"/></svg>
              </button>
            ) : (
              <button type="submit" className="query-submit-btn" disabled={!request.trim()}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 7.5h11M9 3l4 4.5L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        </div>
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
