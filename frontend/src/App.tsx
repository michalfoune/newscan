import { useState } from 'react';
import { BriefingForm } from './components/BriefingForm';
import { BriefingFeed } from './components/BriefingFeed';
import { BriefingRequest, BriefingResponse } from './types';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function App() {
  const [response, setResponse] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (req: BriefingRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
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
        <h1 className="app-title">
          <img src="/android-chrome-192x192.png" alt="" className="app-title-icon" />
          Rizma Brief
        </h1>
        <p className="app-tagline">Stay informed without emotional overload.</p>
      </header>
      <main className="app-main">
        <BriefingForm onSubmit={handleSubmit} loading={loading} />
        {error && <div className="error-banner">{error}</div>}
        {response && <BriefingFeed response={response} />}
      </main>
    </div>
  );
}
