import { useEffect, useRef, useState } from 'react';
import { ChatMessage, Mode } from '../types';
import { Translations } from '../translations';

function renderMarkdown(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

interface Props {
  context: string;
  language: string;
  t: Translations;
  apiUrl: string;
  initialMode: Mode;
}

export function ChatInterface({ context, language, t, apiUrl, initialMode }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatMode, setChatMode] = useState<Mode>(initialMode);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);

    try {
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context, language, mode: chatMode }),
      });
      const data = await res.json();
      setMessages([...next, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: '⚠ Something went wrong. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat">
      {messages.length > 0 && (
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg--${m.role}`}>
              {renderMarkdown(m.content)}
            </div>
          ))}
          {sending && (
        <div className="chat-msg chat-msg--assistant chat-msg--typing">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={t.chatPlaceholder}
          disabled={sending}
        />
        <button className="chat-send-btn" onClick={send} disabled={sending || !input.trim()}>
          {sending ? t.chatSending : t.chatSend}
        </button>
      </div>
      <div className="mode-pills">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`mode-pill mode-pill--${m}${chatMode === m ? ' mode-pill--active' : ''}`}
            onClick={() => setChatMode(m)}
            disabled={sending}
          >
            {t.modeLabels[m]}
          </button>
        ))}
        <div className="mode-tooltip-wrap">
          <button
            type="button"
            className="mode-help-btn"
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
            onFocus={() => setTooltipVisible(true)}
            onBlur={() => setTooltipVisible(false)}
            aria-label="Mode descriptions"
          >?</button>
          {tooltipVisible && (
            <div className="mode-tooltip">
              {t.modeTooltip.split('\n').map((line, i) => {
                const colon = line.indexOf(':');
                return colon > -1
                  ? <p key={i}><strong>{line.slice(0, colon)}</strong>{line.slice(colon)}</p>
                  : <p key={i}>{line}</p>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
