import { useEffect, useRef, useState } from 'react';
import { BriefingForm } from './components/BriefingForm';
import { BriefingFeed } from './components/BriefingFeed';
import { ChatInterface } from './components/ChatInterface';
import { Sidebar } from './components/Sidebar';
import { ArticleCounts, BriefingRequest, BriefingResponse, ChatMessage, Conversation, Mode, ModelQuality, QueryType, ThreadItem } from './types';
import { Language, translations, Translations } from './translations';
import { renderMarkdown } from './utils/markdown';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const STORAGE_KEY = 'rizma-conversations';
const PREFS_KEY = 'rizma-preferences';
const QUALITY_KEY = 'rizma-model-quality';
const COUNTS_KEY = 'rizma-article-counts';
const SHOW_KEYWORDS_KEY = 'rizma-show-keywords';
const NEWS_SOURCE_KEY = 'rizma-news-source';
const DEFAULT_COUNTS: ArticleCounts = { calm: 2, balanced: 3, brave: 4 };

const LANGUAGES: Language[] = ['en', 'cs'];
const QUALITIES: ModelQuality[] = ['fast', 'standard', 'best'];
const QUALITY_LABELS: Record<ModelQuality, string> = { fast: 'Fast', standard: 'Standard', best: 'Best' };
const MODES: Mode[] = ['calm', 'balanced', 'brave'];
const LANG_LABELS: Record<Language, string> = { en: 'EN', cs: 'CS' };
const NEWS_SOURCES = [{ value: 'eventregistry', label: 'NewsAPI' }, { value: 'gnews', label: 'GNews' }];
const LOCATION_KEY = 'rizma-location';
const LOCATIONS = [
  { value: 'us', label: 'U.S.' },
  { value: 'california', label: 'Calif.' },
  { value: 'europe', label: 'EU' },
  { value: 'global', label: 'Global' },
];

const MODE_COLORS: Record<string, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

function KnowledgeAnswer({ answer, streamingAnswer, knowledgeCutoff, mode, generationSeconds, generatedAt, t }: {
  answer: string;
  streamingAnswer?: string;
  knowledgeCutoff?: string;
  mode: Mode;
  generationSeconds?: number | null;
  generatedAt?: string;
  t: Translations;
}) {
  const displayText = streamingAnswer ?? answer;
  const time = generatedAt
    ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <section className="briefing-feed">
      <div className="feed-header">
        <div className="feed-header-left">
          <span className="feed-mode-badge" style={{ background: MODE_COLORS[mode] }}>
            {t.modeLabels[mode]}
          </span>
        </div>
        <span className="feed-time">
          {time ? t.generatedAt(time) : ''}{generationSeconds != null ? ` (${generationSeconds}s)` : ''}
        </span>
      </div>
      <div className="ai-fallback-card">
        <div className="ai-fallback-body">{renderMarkdown(displayText)}</div>
        {knowledgeCutoff && !streamingAnswer && (
          <p className="ai-fallback-notice">Knowledge cutoff: {knowledgeCutoff}. This response is not based on current news.</p>
        )}
      </div>
    </section>
  );
}

function CountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? value : Math.max(1, Math.min(10, n));
    setRaw(String(clamped));
    onChange(clamped);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      className="settings-count-input"
      value={raw}
      onChange={e => setRaw(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
    />
  );
}

function SettingsPopover({ value, onChange, language, onLanguageChange, location, onLocationChange, modelQuality, onModelQualityChange, articleCounts, onArticleCountChange, showKeywords, onShowKeywordsChange, newsSource, onNewsSourceChange, onClose }: {
  value: string;
  onChange: (v: string) => void;
  language: Language;
  onLanguageChange: (l: Language) => void;
  location: string;
  onLocationChange: (l: string) => void;
  modelQuality: ModelQuality;
  onModelQualityChange: (q: ModelQuality) => void;
  articleCounts: ArticleCounts;
  onArticleCountChange: (mode: Mode, count: number) => void;
  showKeywords: boolean;
  onShowKeywordsChange: (v: boolean) => void;
  newsSource: string;
  onNewsSourceChange: (s: string) => void;
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
        <p className="settings-section-label">Location</p>
        <div className="settings-lang-switcher">
          {LOCATIONS.map(loc => (
            <button
              key={loc.value}
              type="button"
              className={`settings-lang-btn${location === loc.value ? ' settings-lang-btn--active' : ''}`}
              onClick={() => onLocationChange(loc.value)}
            >
              {loc.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <p className="settings-section-label">Quality</p>
        <div className="settings-lang-switcher">
          {QUALITIES.map(q => (
            <button
              key={q}
              type="button"
              className={`settings-lang-btn${modelQuality === q ? ' settings-lang-btn--active' : ''}`}
              onClick={() => onModelQualityChange(q)}
            >
              {QUALITY_LABELS[q]}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <p className="settings-section-label">Max stories per briefing</p>
        <div className="settings-counts-row">
          {MODES.map(m => (
            <label key={m} className="settings-count-item">
              <span className="settings-count-label">{m.charAt(0).toUpperCase() + m.slice(1)}</span>
              <CountInput value={articleCounts[m]} onChange={v => onArticleCountChange(m, v)} />
            </label>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            className="settings-checkbox"
            checked={showKeywords}
            onChange={e => onShowKeywordsChange(e.target.checked)}
          />
          <span className="settings-checkbox-label">Show used keywords</span>
        </label>
      </div>
      <div className="settings-section">
        <p className="settings-section-label">News source</p>
        <div className="settings-lang-switcher">
          {NEWS_SOURCES.map(s => (
            <button
              key={s.value}
              type="button"
              className={`settings-lang-btn${newsSource === s.value ? ' settings-lang-btn--active' : ''}`}
              onClick={() => onNewsSourceChange(s.value)}
            >
              {s.label}
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

function buildChatContext(response: BriefingResponse, thread: ThreadItem[]): string {
  const lines: string[] = [];
  if (response.knowledgeAnswer) lines.push(`AI Knowledge Response: ${response.knowledgeAnswer}\n`);
  if (response.overall_summary) lines.push(`Overview: ${response.overall_summary}\n`);
  for (const item of response.items) {
    lines.push(`Headline: ${item.headline}`);
    lines.push(`Summary: ${item.summary}`);
    if (item.why_it_matters) lines.push(`Why it matters: ${item.why_it_matters}`);
    lines.push('');
  }
  for (const ti of thread) {
    if (ti.type === 'briefing') {
      lines.push(`\n=== Additional briefing: ${ti.query} ===`);
      if (ti.response.overall_summary) lines.push(`Overview: ${ti.response.overall_summary}\n`);
      for (const item of ti.response.items) {
        lines.push(`Headline: ${item.headline}`);
        lines.push(`Summary: ${item.summary}`);
        if (item.why_it_matters) lines.push(`Why it matters: ${item.why_it_matters}`);
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

function loadConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const raw = JSON.parse(stored);
    return raw.map((c: any) => ({
      ...c,
      thread: c.thread ?? (c.chatMessages ?? []).map((m: ChatMessage) => ({
        type: 'message' as const,
        role: m.role,
        content: m.content,
      })),
    }));
  } catch {
    return [];
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<Mode>('calm');
  const [response, setResponse] = useState<BriefingResponse | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generationSeconds, setGenerationSeconds] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemPreferences, setSystemPreferences] = useState(() => localStorage.getItem(PREFS_KEY) ?? '');
  const [modelQuality, setModelQuality] = useState<ModelQuality>(() => (localStorage.getItem(QUALITY_KEY) as ModelQuality) ?? 'fast');
  const [articleCounts, setArticleCounts] = useState<ArticleCounts>(() => {
    try { return { ...DEFAULT_COUNTS, ...JSON.parse(localStorage.getItem(COUNTS_KEY) ?? '{}') }; }
    catch { return DEFAULT_COUNTS; }
  });
  const [showKeywords, setShowKeywords] = useState(() => localStorage.getItem(SHOW_KEYWORDS_KEY) !== 'false');
  const [newsSource, setNewsSource] = useState(() => localStorage.getItem(NEWS_SOURCE_KEY) ?? 'gnews');
  const [location, setLocation] = useState(() => localStorage.getItem(LOCATION_KEY) ?? 'us');
  const [streamingKnowledge, setStreamingKnowledge] = useState('');
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

  const handleQualityChange = (q: ModelQuality) => {
    setModelQuality(q);
    localStorage.setItem(QUALITY_KEY, q);
  };

  const handleShowKeywordsChange = (v: boolean) => {
    setShowKeywords(v);
    localStorage.setItem(SHOW_KEYWORDS_KEY, String(v));
  };

  const handleNewsSourceChange = (s: string) => {
    setNewsSource(s);
    localStorage.setItem(NEWS_SOURCE_KEY, s);
  };

  const handleLocationChange = (l: string) => {
    setLocation(l);
    localStorage.setItem(LOCATION_KEY, l);
  };

  const handleArticleCountChange = (m: Mode, count: number) => {
    const next = { ...articleCounts, [m]: Math.max(1, Math.min(10, count)) };
    setArticleCounts(next);
    localStorage.setItem(COUNTS_KEY, JSON.stringify(next));
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
    setThread([]);
    setGenerationSeconds(null);
    setStreamingKnowledge('');
    const startTime = Date.now();

    let streamingItems: BriefingResponse['items'] = [];
    let convId: string | null = null;
    let accKnowledge = '';
    let queryType: QueryType = 'news';

    try {
      const res = await fetch(`${API_URL}/api/briefing/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, language, system_preferences: systemPreferences.trim() || undefined, model_quality: modelQuality, article_counts: articleCounts, news_source: newsSource, location }),
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
            if (eventType === 'query_type' && dataLine) {
              const data = JSON.parse(dataLine) as { type: QueryType };
              queryType = data.type;
              setResponse({ items: [], generated_at: new Date().toISOString(), missing_topics: [], queryType: data.type });
              if (queryType === 'knowledge') {
                convId = Date.now().toString();
                const conv: Conversation = {
                  id: convId,
                  query: req.request,
                  response: { items: [], generated_at: new Date().toISOString(), missing_topics: [], queryType: 'knowledge' },
                  thread: [],
                  mode: req.mode,
                  language: req.language,
                  timestamp: Date.now(),
                };
                setConversations(prev => [conv, ...prev].slice(0, 50));
                setActiveId(convId);
              }
            } else if (eventType === 'k_chunk' && dataLine) {
              const data = JSON.parse(dataLine) as { chunk: string };
              accKnowledge += data.chunk;
              setStreamingKnowledge(accKnowledge);
            } else if (eventType === 'k_done' && dataLine) {
              const data = JSON.parse(dataLine) as { knowledge_cutoff: string };
              const finalAnswer = accKnowledge;
              setStreamingKnowledge('');
              setResponse(prev => prev ? { ...prev, knowledgeAnswer: finalAnswer, knowledgeCutoff: data.knowledge_cutoff } : prev);
              if (convId) {
                const cid = convId;
                setConversations(prev => prev.map(c => c.id === cid ? { ...c, response: { ...c.response, knowledgeAnswer: finalAnswer, knowledgeCutoff: data.knowledge_cutoff } } : c));
              }
            } else if (eventType === 'item' && dataLine) {
              const item = JSON.parse(dataLine) as BriefingResponse['items'][0];
              streamingItems = [...streamingItems, item];
              const snap = streamingItems;
              setResponse(prev => ({
                items: snap,
                overall_summary: prev?.overall_summary,
                generated_at: prev?.generated_at ?? new Date().toISOString(),
                missing_topics: prev?.missing_topics ?? [],
                queryType: prev?.queryType,
                knowledgeAnswer: prev?.knowledgeAnswer,
                knowledgeCutoff: prev?.knowledgeCutoff,
              }));
              if (snap.length === 1 && queryType === 'news') {
                convId = Date.now().toString();
                const conv: Conversation = {
                  id: convId,
                  query: req.request,
                  response: { items: snap, overall_summary: undefined, generated_at: new Date().toISOString(), missing_topics: [] },
                  thread: [],
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
              const doneData = JSON.parse(dataLine) as { overall_summary?: string; generated_at: string; missing_topics: string[]; keyword_trimmed?: boolean; topics?: string[] };
              setGenerationSeconds(Math.round((Date.now() - startTime) / 1000));
              setResponse(prev => ({
                items: prev?.items ?? [],
                overall_summary: doneData.overall_summary,
                generated_at: doneData.generated_at,
                missing_topics: doneData.missing_topics,
                keyword_trimmed: doneData.keyword_trimmed,
                topics: doneData.topics,
                queryType: prev?.queryType,
                knowledgeAnswer: prev?.knowledgeAnswer,
                knowledgeCutoff: prev?.knowledgeCutoff,
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
                    keyword_trimmed: doneData.keyword_trimmed,
                    topics: doneData.topics,
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

  const handleThreadChange = (newThread: ThreadItem[]) => {
    setThread(newThread);
    if (activeId) {
      setConversations(prev =>
        prev.map(c => c.id === activeId ? { ...c, thread: newThread } : c)
      );
    }
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    setActiveId(id);
    setResponse(conv.response);
    setThread(conv.thread ?? []);
    setMode(conv.mode);
    setLanguage(conv.language as Language);
    setError(null);
  };

  const handleNew = () => {
    setActiveId(null);
    setResponse(null);
    setThread([]);
    setError(null);
  };

  const chatContext = response ? buildChatContext(response, thread) : '';

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNew}
        onClearAll={() => { setConversations([]); handleNew(); }}
        onDelete={(id) => {
          setConversations(prev => prev.filter(c => c.id !== id));
          if (activeId === id) handleNew();
        }}
        onRename={(id, name) => setConversations(prev => prev.map(c => c.id === id ? { ...c, query: name } : c))}
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
                  modelQuality={modelQuality}
                  onModelQualityChange={handleQualityChange}
                  articleCounts={articleCounts}
                  onArticleCountChange={handleArticleCountChange}
                  location={location}
                  onLocationChange={handleLocationChange}
                  showKeywords={showKeywords}
                  onShowKeywordsChange={handleShowKeywordsChange}
                  newsSource={newsSource}
                  onNewsSourceChange={handleNewsSourceChange}
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
            hasResults={!!response && (response.items.length > 0 || !!response.knowledgeAnswer || !!streamingKnowledge || response.queryType === 'knowledge')}
            t={t}
            language={language}
            mode={mode}
            onModeChange={setMode}
            initialRequest={activeId ? (conversations.find(c => c.id === activeId)?.query ?? '') : ''}
          />
          {loading && (!response || (response.items.length === 0 && !streamingKnowledge && !response.knowledgeAnswer)) && (
            <p className="generating-status">Generating… {elapsed}s</p>
          )}
          {error && <div className="error-banner">{error}</div>}
          {response && response.items.length === 0 && !loading && !response.knowledgeAnswer && !streamingKnowledge && (
            <div className="no-results">
              <p>{t.noResults}</p>
            </div>
          )}

          {/* Knowledge path */}
          {(streamingKnowledge || response?.knowledgeAnswer) && (
            <>
              <KnowledgeAnswer
                answer={response?.knowledgeAnswer ?? ''}
                streamingAnswer={streamingKnowledge || undefined}
                knowledgeCutoff={response?.knowledgeCutoff}
                mode={mode}
                generationSeconds={response?.knowledgeAnswer ? generationSeconds : null}
                generatedAt={response?.generated_at}
                t={t}
              />
              {response && response.items.length > 0 && (
                <BriefingFeed response={response} t={t} mode={mode} generationSeconds={null} showKeywords={showKeywords} relatedCoverage />
              )}
              <div className="section-divider" />
              <ChatInterface
                key={activeId ?? 'new'}
                context={chatContext}
                language={language}
                t={t}
                apiUrl={API_URL}
                initialMode={mode}
                thread={thread}
                onThreadChange={handleThreadChange}
                systemPreferences={systemPreferences}
                modelQuality={modelQuality}
                articleCounts={articleCounts}
                newsSource={newsSource}
                location={location}
              />
            </>
          )}

          {/* News path */}
          {response && response.queryType !== 'knowledge' && response.items.length > 0 && (
            <>
              <BriefingFeed response={response} t={t} mode={mode} generationSeconds={generationSeconds} showKeywords={showKeywords} />
              <div className="section-divider" />
              <ChatInterface
                key={activeId ?? 'new'}
                context={chatContext}
                language={language}
                t={t}
                apiUrl={API_URL}
                initialMode={mode}
                thread={thread}
                onThreadChange={handleThreadChange}
                systemPreferences={systemPreferences}
                modelQuality={modelQuality}
                articleCounts={articleCounts}
                newsSource={newsSource}
                location={location}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
