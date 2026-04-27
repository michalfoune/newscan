import { useEffect, useRef, useState } from 'react';
import { ChatMessage, Mode } from '../types';
import { Translations } from '../translations';

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
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
}

export function ChatInterface({ context, language, t, apiUrl, initialMode, messages, onMessagesChange }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatMode, setChatMode] = useState<Mode>(initialMode);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyMsg = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    onMessagesChange(next);
    setInput('');
    setSending(true);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context, language, mode: chatMode }),
        signal: abortRef.current.signal,
      });
      const data = await res.json();
      onMessagesChange([...next, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onMessagesChange([...next, { role: 'assistant', content: '⚠ Something went wrong. Please try again.' }]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const cancelSend = () => abortRef.current?.abort();

  return (
    <div className="chat">
      {messages.length > 0 && (
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg-wrap chat-msg-wrap--${m.role}`}>
              <div className={`chat-msg chat-msg--${m.role}`}>
                {renderMarkdown(m.content)}
              </div>
              <div className="hover-actions">
                <button type="button" className="hover-action-btn" data-tooltip={copiedIdx === i ? 'Copied!' : 'Copy'} onClick={() => copyMsg(m.content, i)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2 9V2h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          ))}
          {sending && (
            <div className="chat-msg chat-msg--assistant chat-msg--typing">
              <span className="dot" /><span className="dot" /><span className="dot" />
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
