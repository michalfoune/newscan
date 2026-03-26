import { useState } from 'react';
import { BriefingRequest } from '../types';
import { Language, Translations } from '../translations';

interface Props {
  onSubmit: (req: BriefingRequest) => void;
  loading: boolean;
  t: Translations;
  language: Language;
}

export function BriefingForm({ onSubmit, loading, t, language }: Props) {
  const [request, setRequest] = useState('');
  const [preferences, setPreferences] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    onSubmit({
      request: request.trim(),
      system_preferences: preferences.trim() || undefined,
      language,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="briefing-form">
      <label className="field-label" htmlFor="request">
        {t.requestLabel}
      </label>
      <textarea
        id="request"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
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
        {loading ? t.generating : t.submit}
      </button>
    </form>
  );
}
