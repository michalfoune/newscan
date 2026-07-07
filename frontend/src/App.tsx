import { useEffect, useRef, useState } from 'react';
import { BriefingForm } from './components/BriefingForm';
import { BriefingFeed } from './components/BriefingFeed';
import { ChatInterface } from './components/ChatInterface';
import { Sidebar } from './components/Sidebar';
import { ArticleCounts, BriefingRequest, BriefingResponse, ChatMessage, Conversation, Mode, ModelQuality, QueryType, ThreadItem } from './types';
import { Language, translations, Translations } from './translations';
import { renderMarkdown, stripMarkdown } from './utils/markdown';
import { TTSProvider, useTTSContext } from './contexts/TTSContext';
import { CopyIcon, HamburgerIcon, PlayIcon, SettingsIcon } from './components/icons';
import { TTSPlayerBar } from './components/TTSPlayerBar';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const STORAGE_KEY = 'rizma-conversations';
const PREFS_KEY = 'rizma-preferences';
const QUALITY_KEY = 'rizma-model-quality';
const COUNTS_KEY = 'rizma-article-counts';
const SHOW_KEYWORDS_KEY = 'rizma-show-keywords';
const NEWS_SOURCE_KEY = 'rizma-news-source';
const SAFE_TITLES_KEY = 'rizma-safe-titles';
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

const MODE_BG: Record<string, string> = {
  calm: '#eae9f5',
  balanced: '#e7eeea',
  brave: '#f0eae4',
};

function KnowledgeAnswer({ answer, streamingAnswer, knowledgeCutoff, mode, generationSeconds, generatedAt, t, apiUrl, relatedCoverageText }: {
  answer: string;
  streamingAnswer?: string;
  knowledgeCutoff?: string;
  mode: Mode;
  generationSeconds?: number | null;
  generatedAt?: string;
  t: Translations;
  apiUrl?: string;
  relatedCoverageText?: string;
}) {
  const displayText = streamingAnswer ?? answer;
  const time = generatedAt
    ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const { state, play } = useTTSContext();
  const buildPlayText = () => {
    const base = stripMarkdown(answer);
    return relatedCoverageText ? base + ' Related coverage. ' + relatedCoverageText : base;
  };
  return (
    <section className="briefing-feed">
      <div className="feed-header">
        <div className="feed-header-left">
          <span className="feed-mode-badge" style={{ background: MODE_COLORS[mode] }}>
            {t.modeLabels[mode]}
          </span>
          {apiUrl && answer && !streamingAnswer && state === 'idle' && (
            <button
              className="tts-btn"
              style={{ color: MODE_COLORS[mode] }}
              onClick={() => play(buildPlayText(), 'knowledge', mode)}
              title="Listen"
            >
              <PlayIcon />
            </button>
          )}
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

function SettingsPopover({ value, onChange, language, onLanguageChange, location, onLocationChange, modelQuality, onModelQualityChange, articleCounts, onArticleCountChange, showKeywords, onShowKeywordsChange, newsSource, onNewsSourceChange, safeTitles, onSafeTitlesChange, onClose }: {
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
  safeTitles: boolean;
  onSafeTitlesChange: (v: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'main' | 'advanced'>('main');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab${tab === 'main' ? ' settings-tab--active' : ''}`}
          onClick={() => setTab('main')}
        >
          Preferences
        </button>
        <button
          type="button"
          className={`settings-tab${tab === 'advanced' ? ' settings-tab--active' : ''}`}
          onClick={() => setTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {tab === 'main' && <>
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
          <p className="settings-section-label">Conversation titles</p>
          <div className="settings-lang-switcher">
            <button type="button" className={`settings-lang-btn${safeTitles ? ' settings-lang-btn--active' : ''}`} onClick={() => onSafeTitlesChange(true)}>Safe</button>
            <button type="button" className={`settings-lang-btn${!safeTitles ? ' settings-lang-btn--active' : ''}`} onClick={() => onSafeTitlesChange(false)}>Full</button>
          </div>
          <p className="settings-section-hint">Safe hides sensitive topics in the sidebar — useful when others can see your screen.</p>
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
          />
        </div>
      </>}

      {tab === 'advanced' && <>
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
      </>}
    </div>
  );
}

function buildChatContext(query: string, response: BriefingResponse, thread: ThreadItem[]): string {
  const lines: string[] = [];
  if (query) lines.push(`User's original question: ${query}\n`);
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

function ConversationTTSSync({ activeId }: { activeId: string | null }) {
  const { stop } = useTTSContext();
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => { stopRef.current(); }, [activeId]);
  return null;
}

function BottomPlayButton({ text, mode, answer, alwaysVisible }: { text: string; mode: Mode; answer: string; alwaysVisible: boolean }) {
  const { state, play } = useTTSContext();
  const [copied, setCopied] = useState(false);
  if (!answer) return null;
  const handleCopy = () => {
    navigator.clipboard.writeText(answer).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={`hover-actions${alwaysVisible ? ' hover-actions--visible' : ''}`} style={{ marginTop: 'calc(0.3rem - 2rem)' }}>
      <button
        type="button"
        tabIndex={-1}
        className="hover-action-btn"
        data-tooltip={copied ? 'Copied!' : 'Copy'}
        onClick={handleCopy}
      >
        <CopyIcon size={21} />
      </button>
      {state === 'idle' && text && (
        <button
          type="button"
          tabIndex={-1}
          className="hover-action-btn tts-btn tts-btn--sm"
          data-tooltip="Listen"
          onClick={() => play(text, 'knowledge', mode)}
        >
          <PlayIcon />
        </button>
      )}
    </div>
  );
}

function ConnectedTTSPlayerBar() {
  const { state, chunkIdx, totalChunks, currentMode, skipChunk, togglePause, stop } = useTTSContext();
  return (
    <TTSPlayerBar
      state={state}
      chunkIdx={chunkIdx}
      totalChunks={totalChunks}
      onPrev={() => skipChunk(-1)}
      onNext={() => skipChunk(1)}
      onPlayPause={togglePause}
      onStop={stop}
      mode={currentMode ?? undefined}
    />
  );
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
  const [safeTitles, setSafeTitles] = useState(() => localStorage.getItem(SAFE_TITLES_KEY) !== 'false');
  const [location, setLocation] = useState(() => localStorage.getItem(LOCATION_KEY) ?? 'us');
  const [streamingKnowledge, setStreamingKnowledge] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [formKey, setFormKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const lastScrollY = useRef(0);
  const isStreamingRef = useRef(false);
  const userScrolledUpRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const [showStickyNav, setShowStickyNav] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const settingsOpenRef = useRef(false);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);

  useEffect(() => {
    const onScroll = () => {
      if (settingsOpenRef.current) return;
      const scrollY = window.scrollY;
      const headerHeight = headerRef.current?.offsetHeight ?? 120;
      const distFromBottom = document.documentElement.scrollHeight - scrollY - window.innerHeight;
      const scrollingUp = scrollY < lastScrollY.current;
      lastScrollY.current = scrollY;
      if (isProgrammaticScrollRef.current) return;
      if (isStreamingRef.current && scrollingUp) userScrolledUpRef.current = true;
      setShowStickyNav(scrollY > headerHeight && scrollingUp);
      setShowScrollDown(distFromBottom > 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!streamingKnowledge || userScrolledUpRef.current) return;
    const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    if (distFromBottom < 300) {
      isProgrammaticScrollRef.current = true;
      window.scrollTo({ top: document.documentElement.scrollHeight });
      requestAnimationFrame(() => { isProgrammaticScrollRef.current = false; });
    }
  }, [streamingKnowledge]);

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
    userScrolledUpRef.current = false;
    isStreamingRef.current = true;
    setLoading(true);
    setError(null);
    setResponse(null);
    setThread([]);
    setGenerationSeconds(null);
    setStreamingKnowledge('');
    setCurrentQuery(req.request);
    const startTime = Date.now();

    let streamingItems: BriefingResponse['items'] = [];
    let convId: string | null = null;
    let accKnowledge = '';
    let queryType: QueryType = 'news';
    let pendingTitle: string | null = null;

    try {
      const briefingEndpoint = localStorage.getItem('rizma-use-agent') === 'true' ? '/api/briefing/agent-stream' : '/api/briefing/stream';
      console.warn(`[rizma] briefing endpoint: ${briefingEndpoint}`);
      const res = await fetch(`${API_URL}${briefingEndpoint}`, {
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
                  name: pendingTitle ?? undefined,
                  response: { items: [], generated_at: new Date().toISOString(), missing_topics: [], queryType: 'knowledge' },
                  thread: [],
                  mode: req.mode,
                  language: req.language,
                  timestamp: Date.now(),
                };
                setConversations(prev => [conv, ...prev].slice(0, 50));
                setActiveId(convId);
              }
            } else if (eventType === 'title' && dataLine) {
              const data = JSON.parse(dataLine) as { title: string; safe_title?: string };
              pendingTitle = data.title;
              if (convId) {
                const cid = convId;
                setConversations(prev => prev.map(c => c.id === cid ? { ...c, name: data.title, safeName: data.safe_title ?? data.title } : c));
              }
            } else if (eventType === 'fallback') {
              queryType = 'knowledge';
              setResponse(prev => prev ? { ...prev, queryType: 'knowledge' } : { items: [], generated_at: new Date().toISOString(), missing_topics: [], queryType: 'knowledge' });
              if (!convId) {
                convId = Date.now().toString();
                const conv: Conversation = {
                  id: convId,
                  query: req.request,
                  name: pendingTitle ?? undefined,
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
                  name: pendingTitle ?? undefined,
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
      isStreamingRef.current = false;
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
      const id = activeId;
      setConversations(prev => {
        const updated = prev.map(c => c.id === id ? { ...c, thread: newThread, timestamp: Date.now() } : c);
        const moved = updated.find(c => c.id === id);
        return moved ? [moved, ...updated.filter(c => c.id !== id)] : updated;
      });
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
    setCurrentQuery(conv.query);
    setError(null);
  };

  const handleNew = () => {
    setActiveId(null);
    setResponse(null);
    setThread([]);
    setCurrentQuery('');
    setError(null);
    setFormKey(k => k + 1);
  };

  const chatContext = response ? buildChatContext(currentQuery, response, thread) : '';

  const knowledgePlayText = (!streamingKnowledge && response?.knowledgeAnswer)
    ? (() => {
        const base = stripMarkdown(response.knowledgeAnswer);
        const relText = response.items.length > 0
          ? response.items.map(i => `${i.headline}. ${i.summary}${i.why_it_matters ? ' ' + i.why_it_matters : ''}`).join(' ')
          : undefined;
        return relText ? base + ' Related coverage. ' + relText : base;
      })()
    : '';

  return (
    <TTSProvider apiUrl={API_URL}>
    <ConversationTTSSync activeId={activeId} />
    <div className="app" style={{ background: MODE_BG[mode] }}>
      <div className={`sticky-nav${showStickyNav ? ' sticky-nav--visible' : ''}`}>
        <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle history">
          <HamburgerIcon />
        </button>
        <span className="sticky-nav-title">
          <img src="/android-chrome-192x192.png" alt="" className="sticky-nav-icon" />
          Rizma
        </span>
        <div className="settings-wrap">
          <button
            className={`settings-btn${settingsOpen ? ' settings-btn--active' : ''}${systemPreferences.trim() ? ' settings-btn--set' : ''}`}
            onClick={() => setSettingsOpen(o => !o)}
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
          {settingsOpen && showStickyNav && (
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
              safeTitles={safeTitles}
              onSafeTitlesChange={v => { setSafeTitles(v); localStorage.setItem(SAFE_TITLES_KEY, String(v)); }}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
      </div>
      <button
        className={`scroll-to-bottom-btn${showScrollDown ? ' scroll-to-bottom-btn--visible' : ''}`}
        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
        aria-label="Scroll to bottom"
      >
        <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
          <path d="M1 1.5l4 4 4-4" stroke="#888" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
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
        onRename={(id, name, isSafe) => setConversations(prev => prev.map(c => c.id === id ? (isSafe ? { ...c, safeName: name } : { ...c, name }) : c))}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        safeTitles={safeTitles}
      />
      <div className="app-content">
        <header className="app-header" ref={headerRef}>
          <div className="app-title-row">
            <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle history">
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            <h1 className="app-title">
              <img src="/android-chrome-192x192.png" alt="" className="app-title-icon" />
              Rizma
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
              {settingsOpen && !showStickyNav && (
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
                  safeTitles={safeTitles}
                  onSafeTitlesChange={v => { setSafeTitles(v); localStorage.setItem(SAFE_TITLES_KEY, String(v)); }}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>
          </div>
          <p className="app-tagline">{t.tagline}</p>
        </header>
        <main className="app-main">
          <BriefingForm
            key={activeId ?? `new-${formKey}`}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
            hasResults={!!response && (response.items.length > 0 || !!response.knowledgeAnswer || !!streamingKnowledge || response.queryType === 'knowledge')}
            t={t}
            language={language}
            mode={mode}
            onModeChange={setMode}
            initialRequest={activeId ? (conversations.find(c => c.id === activeId)?.query ?? '') : ''}
            apiUrl={API_URL}
          />
          {loading && (!response || (response.items.length === 0 && !streamingKnowledge && !response.knowledgeAnswer)) && (
            <div className="generating-status">
              <span className="thinking-dot" style={{ background: MODE_COLORS[mode] }} />
              Thinking… {elapsed}s
            </div>
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
              <div className="knowledge-block">
                <KnowledgeAnswer
                  answer={response?.knowledgeAnswer ?? ''}
                  streamingAnswer={streamingKnowledge || undefined}
                  knowledgeCutoff={response?.knowledgeCutoff}
                  mode={mode}
                  generationSeconds={response?.knowledgeAnswer ? generationSeconds : null}
                  generatedAt={response?.generated_at}
                  t={t}
                  apiUrl={API_URL}
                  relatedCoverageText={
                    response && response.items.length > 0
                      ? response.items.map(i => `${i.headline}. ${i.summary}${i.why_it_matters ? ' ' + i.why_it_matters : ''}`).join(' ')
                      : undefined
                  }
                />
                {response && response.items.length > 0 && (
                  <BriefingFeed response={response} t={t} mode={mode} generationSeconds={null} showKeywords={showKeywords} relatedCoverage apiUrl={API_URL} />
                )}
                <BottomPlayButton text={knowledgePlayText} mode={mode} answer={response?.knowledgeAnswer ?? ''} alwaysVisible={thread.length === 0} />
              </div>
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
                onModeChange={setMode}
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
              <BriefingFeed response={response} t={t} mode={mode} generationSeconds={generationSeconds} showKeywords={showKeywords} apiUrl={API_URL} />
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
                onModeChange={setMode}
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
    <ConnectedTTSPlayerBar />
    </TTSProvider>
  );
}
