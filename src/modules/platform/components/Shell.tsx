import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { assistant } from '@/core';
import { QuickReference } from '@/modules/codex/components/QuickReference';
import { SyncBadge } from '@/modules/sync/components/SyncBits';
import { Modal } from '@/shared/Modal';
import { useDictation, useShell } from '../shell';

/** The strip across the top of a narrow screen: the menu, where you are, search, and the reference panel. */
export function AppBar({ projectId, title }: { projectId: string; title: string }) {
  const { drawer, setDrawer, openSearch } = useShell();
  return (
    <header className="app-bar">
      <button type="button" className="tool" aria-label="Menu" aria-expanded={drawer === 'left'} onClick={() => setDrawer(drawer === 'left' ? null : 'left')}>
        ☰
      </button>
      <Link to={`/project/${projectId}`} className="app-bar-title">
        {title}
      </Link>
      <SyncBadge projectId={projectId} />
      <button type="button" className="tool" aria-label="Search project" onClick={openSearch}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      <button type="button" className="tool" aria-label="Reference panel" aria-expanded={drawer === 'right'} onClick={() => setDrawer(drawer === 'right' ? null : 'right')}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
        </svg>
      </button>
    </header>
  );
}

/** The phone's way around: the four things done on the go, and everything else behind More. */
export function TabBar({ projectId, pages = () => true, notes = true }: { projectId: string; pages?: (page: string) => boolean; notes?: boolean }) {
  const { setDrawer, openNote } = useShell();
  const base = `/project/${projectId}`;
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab');
  return (
    <nav className="tab-bar" aria-label="Quick access">
      <NavLink to={`${base}/manuscript`} className={tab}>
        <span aria-hidden="true">✎</span>Write
      </NavLink>
      {pages('codex') && (
        <NavLink to={`${base}/codex`} className={tab}>
          <span aria-hidden="true">❖</span>Lore
        </NavLink>
      )}
      {notes && (
        <button type="button" className="tab tab-note" onClick={openNote}>
          <span aria-hidden="true">＋</span>Note
        </button>
      )}
      {pages('progress') && (
        <NavLink to={`${base}/progress`} className={tab}>
          <span aria-hidden="true">◔</span>Goals
        </NavLink>
      )}
      {pages('team') && !pages('progress') && (
        <NavLink to={`${base}/team`} className={tab}>
          <span aria-hidden="true">☺</span>Team
        </NavLink>
      )}
      <button type="button" className="tab" onClick={() => setDrawer('left')}>
        <span aria-hidden="true">☰</span>More
      </button>
    </nav>
  );
}

/**
 * A note taken down in a few seconds, from anywhere in the project. It is
 * saved to the project's Notes / Ideas, the same records every device
 * reads, exactly as typed or dictated.
 */
export function QuickNote({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dictation = useDictation((heard) => setText((current) => (current && !/\s$/.test(current) ? `${current} ${heard.trim()}` : `${current}${heard.trim()}`)));
  const save = async () => {
    if (!text.trim()) return;
    try {
      await assistant.forProject(projectId).addIdea(text);
      setText('');
      setSaved(saved + 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The note could not be saved.');
    }
  };
  return (
    <Modal title="Quick note" onClose={onClose}>
      <div className="stack quick-note">
        <textarea rows={5} value={text} autoFocus aria-label="Note" placeholder="A line of dialogue, a thought about chapter nine…" onChange={(e) => setText(e.target.value)} />
        {(error ?? dictation.error) && (
          <p className="error small" role="alert">
            {error ?? dictation.error}
          </p>
        )}
        {saved > 0 && (
          <p className="muted small" role="status">
            {saved === 1 ? 'Saved' : `${saved} notes saved`} to{' '}
            <Link to={`/project/${projectId}/assistant?tab=ideas`} onClick={onClose}>
              Notes / Ideas
            </Link>
            .
          </p>
        )}
        <div className="actions">
          {dictation.supported && (
            <button type="button" className="btn" aria-pressed={dictation.listening} onClick={dictation.toggle}>
              {dictation.listening ? 'Stop dictating' : 'Dictate'}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
          <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => void save()}>
            Save note
          </button>
        </div>
      </div>
    </Modal>
  );
}

const CARD_KEY = 'novel-builder:float-card';
const CARD = { width: 340, margin: 8 };

/**
 * A reference card that floats over the page and can be dragged anywhere on
 * it, for a screen with room to look something up without giving a side of
 * the page to a panel. Where it was left is remembered on this device.
 */
export function FloatingCard({ projectId, entryId, onEntry, onDock, onClose }: { projectId: string; entryId: string; onEntry: (entryId: string | null) => void; onDock: () => void; onClose: () => void }) {
  const clamp = (x: number, y: number) => ({ x: Math.max(CARD.margin, Math.min(window.innerWidth - CARD.width - CARD.margin, x)), y: Math.max(CARD.margin, Math.min(window.innerHeight - 120, y)) });
  const [at, setAt] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CARD_KEY) ?? 'null') as { x: number; y: number } | null;
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return clamp(stored.x, stored.y);
    } catch {
      // not essential
    }
    return clamp(window.innerWidth - CARD.width - 24, 96);
  });
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const latest = useRef(at);
  latest.current = at;
  useEffect(() => {
    const refit = () => setAt((current) => clamp(current.x, current.y));
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, []);
  return (
    <aside className="float-card" role="dialog" aria-label="Reference card" style={{ left: at.x, top: at.y, width: CARD.width }}>
      <header
        className="float-card-head"
        aria-label="Move the reference card"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          grab.current = { dx: e.clientX - at.x, dy: e.clientY - at.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => grab.current && setAt(clamp(e.clientX - grab.current.dx, e.clientY - grab.current.dy))}
        onPointerUp={() => {
          if (!grab.current) return;
          grab.current = null;
          try {
            localStorage.setItem(CARD_KEY, JSON.stringify(latest.current));
          } catch {
            // not essential
          }
        }}
        onPointerCancel={() => (grab.current = null)}
      >
        <span className="dock-grip" aria-hidden="true">
          ⠿
        </span>
        <strong>Reference</strong>
        <button type="button" className="tool" aria-label="Open in the side panel" title="Open in the side panel" onClick={onDock}>
          ◨
        </button>
        <button type="button" className="tool" aria-label="Close the reference card" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="float-card-body">
        <QuickReference projectId={projectId} openId={entryId} onOpen={onEntry} />
      </div>
    </aside>
  );
}

function QuickButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    // Keeps the caret (and the phone's keyboard) where it is while the button is pressed.
    <button type="button" className={`quick${active ? ' active' : ''}`} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

/**
 * The phone's writing toolbar, at the thumb: formatting, search across the
 * project, the Codex, a quick note and dictation, each one tap away.
 */
export function QuickBar({ formatting, onFormatting, onLore, onDictated, editing = true, lore = true, notes = true }: { formatting: boolean; onFormatting: () => void; onLore: () => void; onDictated: (text: string) => void; editing?: boolean; lore?: boolean; notes?: boolean }) {
  const { openNote, openSearch } = useShell();
  const dictation = useDictation(onDictated);
  return (
    <div className="quick-bar" role="toolbar" aria-label="Quick actions">
      {editing && (
        <QuickButton label="Format" active={formatting} onClick={onFormatting}>
          <span className="aa" aria-hidden="true">
            B<i>I</i>
          </span>
        </QuickButton>
      )}
      <QuickButton label="Search" onClick={openSearch}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </QuickButton>
      {lore && (
        <QuickButton label="Lore" onClick={onLore}>
          <span aria-hidden="true">❖</span>
        </QuickButton>
      )}
      {notes && (
        <QuickButton label="Note" onClick={openNote}>
          <span aria-hidden="true">＋</span>
        </QuickButton>
      )}
      {editing && dictation.supported && (
        <QuickButton label={dictation.listening ? 'Stop' : 'Dictate'} active={dictation.listening} onClick={dictation.toggle}>
          <span aria-hidden="true">{dictation.listening ? '■' : '●'}</span>
        </QuickButton>
      )}
      {dictation.error && (
        <span className="error small" role="alert">
          {dictation.error}
        </span>
      )}
    </div>
  );
}
