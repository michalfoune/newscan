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

const LANGUAGES: Language[] = ['en', 'cs'];
const LANG_LABELS: Record<Language, string> = { en: 'EN', cs: 'CS' };

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
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
    try {
      const res = await fetch(`${API_URL}/api/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, language }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`);
      }
      const data: BriefingResponse = await res.json();
      setResponse(data);
      if (data.items.length > 0) {
        const conv: Conversation = {
          id: Date.now().toString(),
          query: req.request,
          response: data,
          chatMessages: [],
          mode: req.mode,
          language: req.language,
          timestamp: Date.now(),
        };
        setConversations(prev => [conv, ...prev].slice(0, 50));
        setActiveId(conv.id);
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
            <div className="lang-switcher">
              {LANGUAGES.map((l) => (
                <button
                  key={l}
                  className={`lang-btn${language === l ? ' lang-btn--active' : ''}`}
                  onClick={() => setLanguage(l)}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
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
          {error && <div className="error-banner">{error}</div>}
          {response && response.items.length === 0 && (
            <p className="no-results">{t.noResults}</p>
          )}
          {response && response.items.length > 0 && (
            <>
              <BriefingFeed response={response} t={t} />
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
