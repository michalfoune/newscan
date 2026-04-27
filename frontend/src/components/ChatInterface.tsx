import { useEffect, useRef, useState } from 'react';
import { BriefingItem, BriefingResponse, Mode, ThreadItem } from '../types';
import { Translations } from '../translations';
import { BriefingFeed } from './BriefingFeed';

function renderMarkdown(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

const MODE_COLORS: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

interface Props {
  context: string;
  language: string;
  t: Translations;
  apiUrl: string;
  initialMode: Mode;
  thread: ThreadItem[];
  onThreadChange: (thread: ThreadItem[]) => void;
  systemPreferences?: string;
}

export function ChatInterface({ context, language, t, apiUrl, initialMode, thread, onThreadChange, systemPreferences }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatMode, setChatMode] = useState<Mode>(initialMode);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Streaming pending state
  const [pendingText, setPendingText] = useState('');
  const [pendingBriefItems, setPendingBriefItems] = useState<BriefingItem[]>([]);
  const [pendingBriefActive, setPendingBriefActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fetchElapsed, setFetchElapsed] = useState(0);

  useEffect(() => {
    if (statusMsg === 'Retrieving news…') {
      setFetchElapsed(0);
      const id = setInterval(() => setFetchElapsed(s => s + 1), 1000);
      return () => clearInterval(id);
    } else {
      setFetchElapsed(0);
    }
  }, [statusMsg]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const briefStartRef = useRef<number>(0);
  const stickyScroll = useRef(true); // false when user has scrolled up

  // Track whether user has scrolled away from the bottom
  useEffect(() => {
    const onScroll = () => {
      const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stickyScroll.current = distFromBottom < 150;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // When user sends, re-enable sticky scroll and jump to bottom
  useEffect(() => {
    if (sending) {
      stickyScroll.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sending]);

  // While streaming, follow only if sticky
  useEffect(() => {
    if (stickyScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' } as ScrollIntoViewOptions);
    }
  }, [pendingText, pendingBriefItems.length]);

  // When a finalized item lands, scroll if sticky
  useEffect(() => {
    if (stickyScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread.length]);

  const copyMsg = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userItem: ThreadItem = { type: 'message', role: 'user', content: text };
    const threadWithUser = [...thread, userItem];
    onThreadChange(threadWithUser);

    setInput('');
    setSending(true);
    setStatusMsg(null);
    setPendingText('');
    setPendingBriefItems([]);
    setPendingBriefActive(false);

    abortRef.current = new AbortController();

    const messages = thread
      .filter((item): item is Extract<ThreadItem, { type: 'message' }> => item.type === 'message')
      .map(item => ({ role: item.role, content: item.content }));

    try {
      const res = await fetch(`${apiUrl}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          new_message: text,
          context,
          language,
          mode: chatMode,
          system_preferences: systemPreferences?.trim() || undefined,
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      let dataLine = '';
      let accText = '';
      let accBriefItems: BriefingItem[] = [];
      let briefQuery = '';

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
            if (eventType === 'status' && dataLine) {
              const data = JSON.parse(dataLine);
              if (data.stage === 'fetching') {
                setStatusMsg('Retrieving news…');
                briefStartRef.current = Date.now();
              } else {
                setStatusMsg(null);
              }

            } else if (eventType === 'reply_chunk' && dataLine) {
              const data = JSON.parse(dataLine);
              accText += data.chunk;
              setPendingText(accText);
              setStatusMsg(null);

            } else if (eventType === 'reply_done') {
              const assistantItem: ThreadItem = { type: 'message', role: 'assistant', content: accText };
              onThreadChange([...threadWithUser, assistantItem]);
              setPendingText('');
              accText = '';

            } else if (eventType === 'brief_item' && dataLine) {
              const item = JSON.parse(dataLine) as BriefingItem;
              accBriefItems = [...accBriefItems, item];
              setPendingBriefItems(accBriefItems);
              setPendingBriefActive(true);
              setStatusMsg(null);

            } else if (eventType === 'brief_done' && dataLine) {
              const data = JSON.parse(dataLine);
              briefQuery = data.query || text;
              const briefSecs = briefStartRef.current ? Math.round((Date.now() - briefStartRef.current) / 1000) : undefined;
              if (accBriefItems.length === 0) {
                const noResultsItem: ThreadItem = {
                  type: 'message',
                  role: 'assistant',
                  content: `No recent articles found for "${briefQuery}". Try rephrasing or asking a follow-up question.`,
                };
                onThreadChange([...threadWithUser, noResultsItem]);
              } else {
                const briefingResponse: BriefingResponse = {
                  items: accBriefItems,
                  overall_summary: data.overall_summary,
                  generated_at: data.generated_at,
                  missing_topics: data.missing_topics ?? [],
                };
                const briefItem: ThreadItem = {
                  type: 'briefing',
                  mode: chatMode,
                  query: briefQuery,
                  response: briefingResponse,
                  generationSeconds: briefSecs,
                };
                onThreadChange([...threadWithUser, briefItem]);
              }
              setPendingBriefItems([]);
              setPendingBriefActive(false);
              accBriefItems = [];

            } else if (eventType === 'done') {
              setSending(false);
              setStatusMsg(null);
            }

            eventType = '';
            dataLine = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        const errorItem: ThreadItem = {
          type: 'message',
          role: 'assistant',
          content: '⚠ Something went wrong. Please try again.',
        };
        onThreadChange([...threadWithUser, errorItem]);
      }
    } finally {
      setSending(false);
      setStatusMsg(null);
      setPendingText('');
      setPendingBriefItems([]);
      setPendingBriefActive(false);
      abortRef.current = null;
    }
  };

  const cancelSend = () => abortRef.current?.abort();

  const showTypingDots = sending && pendingText === '' && !pendingBriefActive;

  return (
    <div className="chat">
      {(thread.length > 0 || sending) && (
        <div className="chat-thread">
          {thread.map((item, i) => {
            if (item.type === 'message') {
              return (
                <div key={i} className={`chat-msg-wrap chat-msg-wrap--${item.role}`}>
                  <div className={`chat-msg chat-msg--${item.role}`}>
                    {renderMarkdown(item.content)}
                  </div>
                  <div className="hover-actions">
                    <button
                      type="button"
                      className="hover-action-btn"
                      data-tooltip={copiedIdx === i ? 'Copied!' : 'Copy'}
                      onClick={() => copyMsg(item.content, i)}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M2 9V2h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            } else {
              // type === 'briefing'
              return (
                <div key={i} className="thread-brief-wrap">
                  <BriefingFeed response={item.response} t={t} mode={item.mode} generationSeconds={item.generationSeconds ?? null} />
                </div>
              );
            }
          })}

          {/* Pending streaming content */}
          {showTypingDots && (
            <div className="chat-msg-wrap chat-msg-wrap--assistant">
              <div className="chat-msg chat-msg--assistant chat-msg--typing">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
              {statusMsg && <span className="chat-status-msg">{statusMsg}{fetchElapsed > 0 ? ` ${fetchElapsed}s` : ''}</span>}
            </div>
          )}

          {pendingText !== '' && (
            <div className="chat-msg-wrap chat-msg-wrap--assistant">
              <div className="chat-msg chat-msg--assistant">
                {renderMarkdown(pendingText)}
              </div>
            </div>
          )}

          {pendingBriefActive && (
            <div className="thread-brief-wrap">
              {statusMsg && pendingBriefItems.length === 0 && (
                <span className="chat-status-msg">{statusMsg}{fetchElapsed > 0 ? ` ${fetchElapsed}s` : ''}</span>
              )}
              {pendingBriefItems.length > 0 && (
                <BriefingFeed
                  response={{
                    items: pendingBriefItems,
                    generated_at: new Date().toISOString(),
                    missing_topics: [],
                  }}
                  t={t}
                  mode={chatMode}
                />
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      <div className="query-box">
        <input
          className="chat-query-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={t.chatPlaceholder}
          disabled={sending}
        />
        <div className="query-box-footer">
          <div />
          <div className="query-box-actions">
            <div className="mode-buttons">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mode-btn${chatMode === m ? ' mode-btn--active' : ''}`}
                  style={{ background: MODE_COLORS[m] }}
                  onClick={() => setChatMode(m)}
                  disabled={sending}
                >
                  {t.modeLabels[m]}
                </button>
              ))}
            </div>
            <button
              className="query-submit-btn"
              onClick={sending ? cancelSend : send}
              disabled={!sending && !input.trim()}
            >
              {sending
                ? <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect width="11" height="11" rx="2"/></svg>
                : <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 7.5h11M9 3l4 4.5L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
