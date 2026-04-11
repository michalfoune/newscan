import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { Translations } from '../translations';

interface Props {
  context: string;
  language: string;
  t: Translations;
  apiUrl: string;
}

export function ChatInterface({ context, language, t, apiUrl }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
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
        body: JSON.stringify({ messages: next, context, language }),
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
              {m.content}
            </div>
          ))}
          {sending && <div className="chat-msg chat-msg--assistant chat-msg--typing">…</div>}
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
    </div>
  );
}
