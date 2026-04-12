import { useState } from 'react';
import { BriefingRequest, Mode } from '../types';
import { Language, Translations } from '../translations';

interface Props {
  onSubmit: (req: BriefingRequest) => void;
  loading: boolean;
  hasResults: boolean;
  t: Translations;
  language: Language;
  mode: Mode;
  onModeChange: (m: Mode) => void;
}

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

export function BriefingForm({ onSubmit, loading, hasResults, t, language, mode, onModeChange }: Props) {
  const [request, setRequest] = useState('');
  const [preferences, setPreferences] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    setSubmittedRequest(request.trim());
    setCollapsed(true);
    onSubmit({
      request: request.trim(),
      system_preferences: preferences.trim() || undefined,
      language,
      mode,
    });
  };

  const handleEdit = () => {
    setCollapsed(false);
  };

  if (collapsed && hasResults && !loading) {
    return (
      <div className="briefing-collapsed" onClick={handleEdit} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEdit(); }}>
        <span className="briefing-collapsed-query">{submittedRequest}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="briefing-form">
      <label className="field-label" htmlFor="request">
        {t.requestLabel}
      </label>
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
        rows={3}
        disabled={loading}
      />

      <div className="mode-row">
        <div className="mode-pills">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-pill mode-pill--${m}${mode === m ? ' mode-pill--active' : ''}`}
              onClick={() => onModeChange(m)}
              disabled={loading}
            >
              {t.modeLabels[m]}
            </button>
          ))}
          <div className="mode-tooltip-wrap">
            <button
              type="button"
              className="mode-help-btn"
              onMouseEnter={() => setTooltipVisible(true)}
              onMouseLeave={() => setTooltipVisible(false)}
              onFocus={() => setTooltipVisible(true)}
              onBlur={() => setTooltipVisible(false)}
              aria-label="Mode descriptions"
            >?</button>
            {tooltipVisible && (
              <div className="mode-tooltip">
                {t.modeTooltip.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="toggle-prefs"
          onClick={() => setShowPreferences(!showPreferences)}
        >
          {showPreferences ? t.prefsToggleHide : t.prefsToggleShow}
        </button>
      </div>

      {showPreferences && (
        <>
          <label className="field-label" htmlFor="preferences">
            {t.prefsLabel}
          </label>
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

      <button
        type="submit"
        className="submit-btn"
        disabled={loading || !request.trim()}
      >
        {loading ? <span className="spinner" /> : t.submit}
      </button>
    </form>
  );
}
