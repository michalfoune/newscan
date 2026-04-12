import { useState } from 'react';
import { BriefingForm } from './components/BriefingForm';
import { BriefingFeed } from './components/BriefingFeed';
import { ChatInterface } from './components/ChatInterface';
import { BriefingRequest, BriefingResponse, Mode } from './types';
import { Language, translations } from './translations';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const LANG_LABELS: Record<Language, string> = { en: '🇺🇸 EN', cs: '🇨🇿 CS' };
const OTHER_LANG: Record<Language, Language> = { en: 'cs', cs: 'en' };

function buildChatContext(response: BriefingResponse): string {
  const lines: string[] = [];
  if (response.overall_summary) lines.push(`Overview: ${response.overall_summary}\n`);
  for (const item of response.items) {
    lines.push(`Headline: ${item.headline}`);
    lines.push(`Summary: ${item.summary}`);
    if (item.why_it_matters) lines.push(`Why it matters: ${item.why_it_matters}`);
    if (item.excerpt) lines.push(`Source excerpt: ${item.excerpt}`);
    lines.push('');
  }
  return lines.join('\n');
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<Mode>('balanced');
  const [response, setResponse] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = translations[language];

  const handleSubmit = async (req: BriefingRequest) => {
    setLoading(true);
    setError(null);
    setResponse(null);
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
        <div className="app-title-row">
          <h1 className="app-title">
            <img src="/android-chrome-192x192.png" alt="" className="app-title-icon" />
            Rizma Brief
          </h1>
          <button className="lang-btn" onClick={() => setLanguage(OTHER_LANG[language])}>
            {LANG_LABELS[OTHER_LANG[language]]}
          </button>
        </div>
        <p className="app-tagline">{t.tagline}</p>
      </header>
      <main className="app-main">
        <BriefingForm onSubmit={handleSubmit} loading={loading} hasResults={!!response && response.items.length > 0} t={t} language={language} mode={mode} onModeChange={setMode} />
        {error && <div className="error-banner">{error}</div>}
        {response && response.items.length === 0 && (
          <p className="no-results">{t.noResults}</p>
        )}
        {response && response.items.length > 0 && (
          <>
            <BriefingFeed response={response} t={t} />
            <div className="section-divider" />
            <ChatInterface
              context={buildChatContext(response)}
              language={language}
              t={t}
              apiUrl={API_URL}
              initialMode={mode}
            />
          </>
        )}
      </main>
    </div>
  );
}
