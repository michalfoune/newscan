import { useState } from 'react';
import { BriefingRequest } from '../types';
import { Language, Translations } from '../translations';

interface Props {
  onSubmit: (req: BriefingRequest) => void;
  loading: boolean;
  hasResults: boolean;
  t: Translations;
  language: Language;
}

export function BriefingForm({ onSubmit, loading, hasResults, t, language }: Props) {
  const [request, setRequest] = useState('');
  const [preferences, setPreferences] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    setSubmittedRequest(request.trim());
    setCollapsed(true);
    onSubmit({
      request: request.trim(),
      system_preferences: preferences.trim() || undefined,
      language,
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

      <button
        type="button"
        className="toggle-prefs"
        onClick={() => setShowPreferences(!showPreferences)}
      >
        {showPreferences ? t.prefsToggleHide : t.prefsToggleShow}
      </button>

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
