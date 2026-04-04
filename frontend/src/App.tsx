import { useState } from 'react';
import { BriefingForm } from './components/BriefingForm';
import { BriefingFeed } from './components/BriefingFeed';
import { BriefingRequest, BriefingResponse } from './types';
import { Language, translations } from './translations';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const LANG_LABELS: Record<Language, string> = { en: '🇺🇸 English', cs: '🇨🇿 Čeština' };
const OTHER_LANG: Record<Language, Language> = { en: 'cs', cs: 'en' };

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [response, setResponse] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = translations[language];

  const handleSubmit = async (req: BriefingRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, language }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`);
      }
      setResponse(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="lang-switcher">
          <button
            className="lang-btn"
            onClick={() => setLanguage(OTHER_LANG[language])}
          >
            {LANG_LABELS[OTHER_LANG[language]]}
          </button>
        </div>
        <h1 className="app-title">
          <img src="/android-chrome-192x192.png" alt="" className="app-title-icon" />
          Rizma Brief
        </h1>
        <p className="app-tagline">{t.tagline}</p>
      </header>
      <main className="app-main">
        <BriefingForm onSubmit={handleSubmit} loading={loading} t={t} language={language} />
        {error && <div className="error-banner">{error}</div>}
        {response && response.items.length === 0 && (
          <p className="no-results">{t.noResults}</p>
        )}
        {response && response.items.length > 0 && <BriefingFeed response={response} t={t} />}
        {response && response.items.length > 0 && response.missing_topics.length > 0 && (
          <p className="no-results">{t.noResultsForTopics(response.missing_topics)}</p>
        )}
      </main>
    </div>
  );
}
