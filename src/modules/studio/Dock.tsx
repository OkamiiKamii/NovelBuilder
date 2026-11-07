import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { manuscript, progress } from '@/core';
import { setPrefs, usePrefs } from '@/modules/manuscript/preferences';
import { computeProgress } from '@/modules/progress/analytics';
import { formatNumber } from '@/shared/format';
import { useMe } from '@/modules/collab/identity';
import { useDevice } from '@/modules/platform/device';
import { can } from '@/modules/sync/access';
import { SyncBadge } from '@/modules/sync/components/SyncBits';
import { PanelContent } from './panels';
import { displayCombo } from './shortcuts';
import { MODES, MODE_HINTS, MODE_LABELS, PANELS, PANEL_LABELS, WIDTH, centerPath, slotOf, studio, useStudio, type Dock as DockState, type Host, type Mode, type Panel } from './store';

type Side = 'left' | 'right';
const DRAG_TYPE = 'application/x-novel-builder-dock';

/** Switches workspace: the layout changes at once, and the centre goes to that workspace's page. */
export function useSwitchMode(projectId: string): (mode: Mode) => void {
  const navigate = useNavigate();
  return (mode) => {
    studio.setMode(projectId, mode);
    const layout = studio.layout(projectId)[mode];
    setPrefs({ focus: layout.focus });
    navigate(`/project/${projectId}/${centerPath(layout.center)}`.replace(/\/$/, ''));
  };
}

/** Drag the edge of a panel to resize it; arrow keys do the same. The width is saved when the drag ends. */
function ResizeHandle({ side, width, onPreview, onCommit }: { side: Side; width: number; onPreview: (width: number | null) => void; onCommit: (width: number) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.min(WIDTH.max, Math.max(WIDTH.min, value)));
  const at = (clientX: number) => clamp(start.current!.width + (side === 'left' ? clientX - start.current!.x : start.current!.x - clientX));
  return (
    <div
      className={`dock-resize dock-resize-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${side} panel`}
      aria-valuenow={width}
      aria-valuemin={WIDTH.min}
      aria-valuemax={WIDTH.max}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => start.current && onPreview(at(e.clientX))}
      onPointerUp={(e) => {
        if (!start.current) return;
        const next = at(e.clientX);
        start.current = null;
        onPreview(null);
        onCommit(next);
      }}
      onPointerCancel={() => {
        start.current = null;
        onPreview(null);
      }}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0;
        if (!step) return;
        e.preventDefault();
        onCommit(clamp(width + (side === 'left' ? step : -step)));
      }}
    />
  );
}

interface DockProps {
  projectId: string;
  side: Side;
  /** Which pair of panels this is: the ones beside the app's pages, or the ones beside the manuscript. */
  host: Host;
  className?: string;
  label: string;
  /** What `Standard` means here, and anything this host draws itself instead of a shared panel. */
  render: (kind: Panel) => ReactNode | undefined;
  /** Shown above the panel's own controls. */
  header?: ReactNode;
  /** For a host that decides for itself whether the panel is showing (a drawer on a small screen). */
  open?: boolean;
  onClose?: () => void;
  /** False where the panel's width is fixed by the host. */
  resizable?: boolean;
  /** Where the panel's own controls go. */
  controls?: 'top' | 'bottom';
}

/**
 * One side panel of the current workspace: what it shows, whether it is
 * open and how wide it is all come from the layout, and every change is
 * saved as it is made.
 */
export function Dock({ projectId, side, host, className = '', label, render, header, open, onClose, resizable = true, controls = 'top' }: DockProps) {
  const { mode, current } = useStudio(projectId);
  const slot = slotOf(host, side);
  const state: DockState = current[slot];
  const [preview, setPreview] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  if (!(open ?? state.open)) return null;
  const custom = render(state.kind);
  const bar = (
    <div className="dock-controls" draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, side)} title="Drag to the other side to swap the two panels">
      <span className="dock-grip" aria-hidden="true">
        ⠿
      </span>
      <select value={state.kind} aria-label={`${label} shows`} onChange={(e) => studio.updateDock(projectId, mode, slot, { kind: e.target.value as Panel })}>
        {PANELS.map((panel) => (
          <option key={panel} value={panel}>
            {PANEL_LABELS[panel]}
          </option>
        ))}
      </select>
      <button type="button" className="tool" aria-label={`Move the ${side} panel to the other side`} title="Swap sides" onClick={() => studio.swapDocks(projectId, mode, host)}>
        ⇄
      </button>
      <button type="button" className="tool" aria-label={`Hide the ${side} panel`} onClick={() => (onClose ? onClose() : studio.updateDock(projectId, mode, slot, { open: false }))}>
        ✕
      </button>
    </div>
  );
  return (
    <aside
      className={`dock dock-${side} ${className}${over ? ' dock-over' : ''}`}
      style={resizable ? { width: preview ?? state.width } : undefined}
      aria-label={label}
      data-panel={state.kind}
      data-open
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        // A panel dragged over from the other side changes places with this one.
        if (e.dataTransfer.getData(DRAG_TYPE) && e.dataTransfer.getData(DRAG_TYPE) !== side) studio.swapDocks(projectId, mode, host);
      }}
    >
      {header}
      {controls === 'top' && bar}
      <div className="dock-body">{custom !== undefined ? custom : <PanelContent kind={state.kind === 'auto' ? 'reference' : state.kind} projectId={projectId} />}</div>
      {controls === 'bottom' && bar}
      {resizable && <ResizeHandle side={side} width={state.width} onPreview={setPreview} onCommit={(width) => studio.updateDock(projectId, mode, slot, { width })} />}
    </aside>
  );
}

/** Today's words against the daily goal, for the drafting workspace. */
function GoalBar({ projectId, target }: { projectId: string; target: number | null }) {
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const api = useMemo(() => progress.forProject(projectId), [projectId]);
  const sessions = useLiveQuery(() => api.sessions(), [api]);
  const goals = useLiveQuery(() => api.goals(), [api]);
  if (!nodes || !sessions || !goals) return null;
  const report = computeProgress({ targetWordCount: target, nodes, sessions, goals });
  const daily = report.daily;
  const percent = daily ? Math.min(100, daily.percent) : report.percent;
  return (
    <div className="goal-bar" role="status" aria-label="Word-count goal">
      <span>
        {daily ? `Today ${formatNumber(daily.words)} / ${formatNumber(daily.target)} words` : `Today ${formatNumber(report.today.net)} words`}
        {!daily && report.targetWords ? ` · ${formatNumber(report.totalWords)} / ${formatNumber(report.targetWords)} in all` : ''}
      </span>
      {percent !== null && (
        <span className="bar" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </span>
      )}
    </div>
  );
}

/** The strip above the centre: which workspace is active, and the two panels' switches. */
export function StudioBar({ projectId, target, writing = false }: { projectId: string; target: number | null; writing?: boolean }) {
  const { mode, current, shortcuts } = useStudio(projectId);
  const switchMode = useSwitchMode(projectId);
  const prefs = usePrefs();
  const location = useLocation();
  const host: Host = writing ? 'writing' : 'pages';
  const toggle = (side: Side) => studio.updateDock(projectId, mode, slotOf(host, side), { open: !current[slotOf(host, side)].open });
  // Where the panels are drawers, the bar across the top (or the editor's own bar) opens them, and a phone has no room for the rest.
  const dev = useDevice();
  const phone = dev.form === 'phone';
  // The workspaces are ways of arranging an author's tools; someone who only reads has the one page.
  const me = useMe(projectId);
  const tools = can(me.role, 'readPlanning');
  if (phone && !writing) return null;
  return (
    <div className="studio-bar" data-mode={mode}>
      {!dev.drawers && (
        <button type="button" className="tool" aria-label="Left panel" aria-pressed={current[slotOf(host, 'left')].open} title={`Left panel (${displayCombo(shortcuts['toggle-left'])})`} onClick={() => toggle('left')}>
          ◧
        </button>
      )}
      {!phone && tools && (
        <div className="segmented" role="radiogroup" aria-label="Workspace">
          {MODES.map((key) => (
            <button key={key} type="button" role="radio" aria-checked={mode === key} className={mode === key ? 'active' : ''} title={`${MODE_HINTS[key]} (${displayCombo(shortcuts[`mode-${key}`])})`} onClick={() => switchMode(key)}>
              {MODE_LABELS[key]}
            </button>
          ))}
        </div>
      )}
      {writing && current.goalBar && !prefs.focus && <GoalBar projectId={projectId} target={target} />}
      <span className="studio-bar-end">
        {(writing || !dev.drawers) && <SyncBadge projectId={projectId} />}
        {!phone && !location.pathname.endsWith('/studio') && (
          <Link to={`/project/${projectId}/studio`} className="small">
            Customize
          </Link>
        )}
        {!dev.drawers && (
          <button type="button" className="tool" aria-label="Right panel" aria-pressed={current[slotOf(host, 'right')].open} title={`Right panel (${displayCombo(shortcuts['toggle-right'])})`} onClick={() => toggle('right')}>
            ◨
          </button>
        )}
      </span>
    </div>
  );
}
