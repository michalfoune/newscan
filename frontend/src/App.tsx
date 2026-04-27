import { useEffect, useRef, useState } from 'react';
import { BriefingForm } from './components/BriefingForm';
import { BriefingFeed } from './components/BriefingFeed';
import { ChatInterface } from './components/ChatInterface';
import { Sidebar } from './components/Sidebar';
import { BriefingRequest, BriefingResponse, ChatMessage, Conversation, Mode } from './types';
import { Language, translations } from './translations';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const STORAGE_KEY = 'rizma-conversations';
const PREFS_KEY = 'rizma-preferences';

const LANGUAGES: Language[] = ['en', 'cs'];
const LANG_LABELS: Record<Language, string> = { en: 'EN', cs: 'CS' };

function SettingsPopover({ value, onChange, language, onLanguageChange, onClose }: {
  value: string;
  onChange: (v: string) => void;
  language: Language;
  onLanguageChange: (l: Language) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="settings-popover" ref={ref}>
      <p className="settings-popover-title">Preferences</p>
      <div className="settings-section">
        <p className="settings-section-label">Language</p>
        <div className="settings-lang-switcher">
          {LANGUAGES.map(l => (
            <button
              key={l}
              type="button"
              className={`settings-lang-btn${language === l ? ' settings-lang-btn--active' : ''}`}
              onClick={() => onLanguageChange(l)}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <p className="settings-section-label">Content preferences</p>
        <p className="settings-section-hint">Applies to every briefing you generate.</p>
        <textarea
          className="settings-prefs-textarea"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. Keep summaries short. Avoid political news."
          rows={4}
          autoFocus
        />
      </div>
    </div>
  );
}

function buildChatContext(response: BriefingResponse): string {
  const lines: string[] = [];
  if (response.overall_summary) lines.push(`Overview: ${response.overall_summary}\n`);
  for (const item of response.items) {
    lines.push(`Headline: ${item.headline}`);
    lines.push(`Summary: ${item.summary}`);
    if (item.why_it_matters) lines.push(`Why it matters: ${item.why_it_matters}`);
    lines.push('');
  }
  return lines.join('\n');
}

function loadConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<Mode>('balanced');
  const [response, setResponse] = useState<BriefingResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generationSeconds, setGenerationSeconds] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemPreferences, setSystemPreferences] = useState(() => localStorage.getItem(PREFS_KEY) ?? '');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const handlePrefsChange = (v: string) => {
    setSystemPreferences(v);
    localStorage.setItem(PREFS_KEY, v);
  };

  const t = translations[language];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  const handleSubmit = async (req: BriefingRequest) => {
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    setResponse(null);
    setChatMessages([]);
    setGenerationSeconds(null);
    const startTime = Date.now();

    // Use a ref-like local object so the closure always sees the latest items
    let streamingItems: BriefingResponse['items'] = [];
    let convId: string | null = null;

    try {
      const res = await fetch(`${API_URL}/api/briefing/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, language, system_preferences: systemPreferences.trim() || undefined }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      let dataLine = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6);
          } else if (line === '') {
            if (eventType === 'item' && dataLine) {
              const item = JSON.parse(dataLine) as BriefingResponse['items'][0];
              streamingItems = [...streamingItems, item];
              const snap = streamingItems;
              setResponse(prev => ({
                items: snap,
                overall_summary: prev?.overall_summary,
                generated_at: prev?.generated_at ?? new Date().toISOString(),
                missing_topics: prev?.missing_topics ?? [],
              }));
              // Create/update history entry on first item
              if (snap.length === 1) {
                convId = Date.now().toString();
                const conv: Conversation = {
                  id: convId,
                  query: req.request,
                  response: { items: snap, overall_summary: undefined, generated_at: new Date().toISOString(), missing_topics: [] },
                  chatMessages: [],
                  mode: req.mode,
                  language: req.language,
                  timestamp: Date.now(),
                };
                setConversations(prev => [conv, ...prev].slice(0, 50));
                setActiveId(convId);
              } else if (convId) {
                const cid = convId;
                setConversations(prev => prev.map(c => c.id === cid ? { ...c, response: { ...c.response, items: snap } } : c));
              }
            } else if (eventType === 'done' && dataLine) {
              const doneData = JSON.parse(dataLine) as { overall_summary?: string; generated_at: string; missing_topics: string[] };
              setGenerationSeconds(Math.round((Date.now() - startTime) / 1000));
              setResponse(prev => ({
                items: prev?.items ?? [],
                overall_summary: doneData.overall_summary,
                generated_at: doneData.generated_at,
                missing_topics: doneData.missing_topics,
              }));
              if (convId) {
                const cid = convId;
                setConversations(prev => prev.map(c => c.id === cid ? {
                  ...c,
                  response: {
                    ...c.response,
                    overall_summary: doneData.overall_summary,
                    generated_at: doneData.generated_at,
                    missing_topics: doneData.missing_topics,
                  },
                } : c));
              }
            }
            eventType = '';
            dataLine = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleChatMessagesChange = (msgs: ChatMessage[]) => {
    setChatMessages(msgs);
    if (activeId) {
      setConversations(prev =>
        prev.map(c => c.id === activeId ? { ...c, chatMessages: msgs } : c)
      );
    }
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    setActiveId(id);
    setResponse(conv.response);
    setChatMessages(conv.chatMessages);
    setMode(conv.mode);
    setLanguage(conv.language as Language);
    setError(null);
  };

  const handleNew = () => {
    setActiveId(null);
    setResponse(null);
    setChatMessages([]);
    setError(null);
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNew}
        onClearAll={() => { setConversations([]); handleNew(); }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="app-content">
        <header className="app-header">
          <div className="app-title-row">
            <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle history">
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            <h1 className="app-title">
              <img src="/android-chrome-192x192.png" alt="" className="app-title-icon" />
              Rizma Brief
            </h1>
            <div className="settings-wrap">
              <button
                className={`settings-btn${settingsOpen ? ' settings-btn--active' : ''}${systemPreferences.trim() ? ' settings-btn--set' : ''}`}
                onClick={() => setSettingsOpen(o => !o)}
                aria-label="Settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
              </button>
              {settingsOpen && (
                <SettingsPopover
                  value={systemPreferences}
                  onChange={handlePrefsChange}
                  language={language}
                  onLanguageChange={setLanguage}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>
          </div>
          <p className="app-tagline">{t.tagline}</p>
        </header>
        <main className="app-main">
          <BriefingForm
            key={activeId ?? 'new'}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
            hasResults={!!response && response.items.length > 0}
            t={t}
            language={language}
            mode={mode}
            onModeChange={setMode}
            initialRequest={activeId ? (conversations.find(c => c.id === activeId)?.query ?? '') : ''}
          />
          {loading && (!response || response.items.length === 0) && (
            <p className="generating-status">Generating… {elapsed}s</p>
          )}
          {error && <div className="error-banner">{error}</div>}
          {response && response.items.length === 0 && (
            <p className="no-results">{t.noResults}</p>
          )}
          {response && response.items.length > 0 && (
            <>
              <BriefingFeed response={response} t={t} generationSeconds={generationSeconds} />
              <div className="section-divider" />
              <ChatInterface
                key={activeId ?? 'new'}
                context={buildChatContext(response)}
                language={language}
                t={t}
                apiUrl={API_URL}
                initialMode={mode}
                messages={chatMessages}
                onMessagesChange={handleChatMessagesChange}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
