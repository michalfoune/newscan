import { useState, useRef, useEffect } from 'react';
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
  const [preferences, setPreferences] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState(initialRequest);
  const [collapsed, setCollapsed] = useState(hasResults);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    setSubmittedRequest(request.trim());
    setCollapsed(true);
    onSubmit({ request: request.trim(), system_preferences: preferences.trim() || undefined, language, mode });
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
            <button type="button" className="toggle-prefs-icon" title={showPreferences ? t.prefsToggleHide : t.prefsToggleShow} onClick={() => setShowPreferences(!showPreferences)}>
              {showPreferences ? '−' : '+'}
            </button>
            <div className="mode-dropdown-wrap" ref={dropdownRef}>
              <button
                type="button"
                className="mode-dropdown-btn"
                style={{ background: MODE_COLORS[mode], borderColor: MODE_COLORS[mode] }}
                onClick={() => { setDropdownOpen(!dropdownOpen); setShowHint(false); }}
                disabled={loading}
              >
                {t.modeLabels[mode]}
                <span className="mode-dropdown-caret">▾</span>
              </button>
              {dropdownOpen && (
                <div className={`mode-dropdown${showHint ? ' mode-dropdown--wide' : ''}`}>
                  {MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`mode-dropdown-item${mode === m ? ' mode-dropdown-item--active' : ''}`}
                      style={{ color: MODE_COLORS[m] }}
                      onClick={() => { onModeChange(m); setDropdownOpen(false); setShowHint(false); }}
                    >
                      {t.modeLabels[m]}
                    </button>
                  ))}
                  <div className="mode-dropdown-footer">
                    <button
                      type="button"
                      className="mode-dropdown-hint-toggle"
                      onClick={() => setShowHint(!showHint)}
                    >?</button>
                    {showHint && (
                      <div className="mode-dropdown-hint">
                        {t.modeTooltip.split('\n').map((line, i) => {
                          const colon = line.indexOf(':');
                          return colon > -1
                            ? <p key={i}><strong>{line.slice(0, colon)}</strong>{line.slice(colon)}</p>
                            : <p key={i}>{line}</p>;
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {loading ? (
              <button type="button" className="query-submit-btn query-submit-btn--timing" onClick={onCancel}>
                <span className="elapsed-time">{elapsed}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
              </button>
            ) : (
              <button type="submit" className="query-submit-btn" disabled={!request.trim()}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 7.5h11M9 3l4 4.5L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {showPreferences && (
        <>
          <label className="field-label" htmlFor="preferences">{t.prefsLabel}</label>
          <textarea
            id="preferences"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder={t.prefsPlaceholder}
            rows={3}
            disabled={loading}
          />
        </>
      )}

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
