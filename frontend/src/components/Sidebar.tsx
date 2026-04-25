import { useEffect, useState } from 'react';
import { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClearAll: () => void;
  isOpen: boolean;
  onClose: () => void;
}

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  const h = diff / 3600000;
  if (h < 1) return 'Just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 48) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onClearAll, isOpen, onClose }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const id = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(id);
  }, [confirmClear]);

  const handleClear = () => {
    if (confirmClear) { onClearAll(); setConfirmClear(false); }
    else setConfirmClear(true);
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-top">
          <button className="sidebar-new-btn" onClick={() => { onNew(); onClose(); }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New
          </button>
        </div>
        <div className="sidebar-list">
          {conversations.length > 0 && (
            <div className="sidebar-section-row">
              <p className="sidebar-section-label">Recents</p>
              <button className={`sidebar-clear-btn${confirmClear ? ' sidebar-clear-btn--confirm' : ''}`} onClick={handleClear}>
                {confirmClear
                  ? 'Clear all?'
                  : <svg width="10" height="12" viewBox="0 0 12 12" fill="none" preserveAspectRatio="none"><path d="M1 3h10M4 3V2h4v1M5 5v4M7 5v4M2 3l.5 7h7L10 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                }
              </button>
            </div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              className={`sidebar-item${activeId === c.id ? ' sidebar-item--active' : ''}`}
              onClick={() => { onSelect(c.id); onClose(); }}
            >
              <span className="sidebar-item-query">{c.query}</span>
              <span className="sidebar-item-time">{timeLabel(c.timestamp)}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
