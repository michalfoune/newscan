import { useEffect, useRef, useState } from 'react';
import { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClearAll: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface MenuState { id: string; x: number; y: number }

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  const h = diff / 3600000;
  if (h < 1) return 'Just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 48) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onClearAll, onDelete, onRename, isOpen, onClose }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextMenuFired = useRef(false);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!confirmClear) return;
    const id = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(id);
  }, [confirmClear]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const openMenu = (id: string, x: number, y: number) => {
    const safeX = Math.min(x, window.innerWidth - 160);
    const safeY = Math.min(y, window.innerHeight - 90);
    setMenu({ id, x: safeX, y: safeY });
  };

  const startRename = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    setRenamingId(id);
    setRenameValue(conv?.query ?? '');
    setMenu(null);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const handleClear = () => {
    if (confirmClear) { onClearAll(); setConfirmClear(false); }
    else setConfirmClear(true);
  };

  const onLongPressStart = (id: string, x: number, y: number) => {
    contextMenuFired.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!contextMenuFired.current) {
        suppressClick.current = true;
        openMenu(id, x, y);
      }
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
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
          {conversations.map((c) =>
            renamingId === c.id ? (
              <input
                key={c.id}
                className="sidebar-rename-input"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                autoFocus
              />
            ) : (
              <button
                key={c.id}
                className={`sidebar-item${activeId === c.id ? ' sidebar-item--active' : ''}`}
                onClick={() => {
                  if (suppressClick.current) { suppressClick.current = false; return; }
                  onSelect(c.id); onClose();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  contextMenuFired.current = true;
                  cancelLongPress();
                  openMenu(c.id, e.clientX, e.clientY);
                }}
                onPointerDown={(e) => onLongPressStart(c.id, e.clientX, e.clientY)}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
              >
                <span className="sidebar-item-query">{c.query}</span>
                <span className="sidebar-item-time">{timeLabel(c.timestamp)}</span>
              </button>
            )
          )}
        </div>
      </aside>

      {menu && (
        <div ref={menuRef} className="sidebar-context-menu" style={{ top: menu.y, left: menu.x }}>
          <button className="sidebar-context-item" onClick={() => startRename(menu.id)}>Rename</button>
          <button className="sidebar-context-item sidebar-context-item--delete" onClick={() => { onDelete(menu.id); setMenu(null); }}>Delete</button>
        </div>
      )}
    </>
  );
}
