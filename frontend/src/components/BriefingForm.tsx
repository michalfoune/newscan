import { useState } from 'react';
import { BriefingRequest } from '../types';

interface Props {
  onSubmit: (req: BriefingRequest) => void;
  loading: boolean;
}

export function BriefingForm({ onSubmit, loading }: Props) {
  const [request, setRequest] = useState('');
  const [preferences, setPreferences] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    onSubmit({
      request: request.trim(),
      system_preferences: preferences.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="briefing-form">
      <label className="field-label" htmlFor="request">
        What would you like to know?
      </label>
      <textarea
        id="request"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        placeholder="e.g. Give me one update on the Russia-Ukraine situation, then some good news from science or wildlife."
        rows={3}
        disabled={loading}
      />

      <button
        type="button"
        className="toggle-prefs"
        onClick={() => setShowPreferences(!showPreferences)}
      >
        {showPreferences ? '− Hide preferences' : '+ Persistent preferences'}
      </button>

      {showPreferences && (
        <>
          <label className="field-label" htmlFor="preferences">
            General rules for every briefing
          </label>
          <textarea
            id="preferences"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder="e.g. Never include more than 1 concerning story. Keep tone calm and factual. No detailed war coverage."
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
        {loading ? 'Generating…' : 'Generate briefing'}
      </button>
    </form>
  );
}
