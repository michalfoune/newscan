import { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
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

export function Sidebar({ conversations, activeId, onSelect, onNew, isOpen, onClose }: Props) {
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
