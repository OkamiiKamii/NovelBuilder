import { useEffect, useId, useState, useSyncExternalStore, type DragEvent, type FormEvent } from 'react';
import { useStoryModel } from '@/modules/model/hooks';
import { addWidget, configureWidget, dashboards, HEIGHT_LABELS, isWidgetKind, KIND_INFO, MAX_WIDGETS, moveWidget, removeWidget, resizeWidget, restoreWidget, STARTER, titleOf, WIDGET_KINDS, WIDTH_LABELS, type Height, type Layout, type Widget, type WidgetKind, type Width } from './layout';
import { WidgetBody, WidgetBoundary, WidgetSettings } from './WidgetBodies';

const useLayout = (projectId: string): Layout => useSyncExternalStore(dashboards.subscribe, () => dashboards.layout(projectId));

/** Where a new widget goes: the end, the start, or after one already there. */
function AddWidget({ layout, onAdd }: { layout: Layout; onAdd: (kind: WidgetKind, at: number) => void }) {
  const [kind, setKind] = useState<WidgetKind>('upcoming');
  const [at, setAt] = useState(-1);
  const whereId = useId();
  const full = layout.widgets.length >= MAX_WIDGETS;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onAdd(kind, at < 0 ? layout.widgets.length : at);
    setAt(-1);
  };
  return (
    <form id="dash-add" className="panel dash-add" aria-labelledby="dash-add-title" onSubmit={submit}>
      <h3 id="dash-add-title" tabIndex={-1}>
        Add a widget
      </h3>
      <fieldset className="dash-kinds">
        <legend className="muted small">What it shows</legend>
        {WIDGET_KINDS.map((k) => (
          <label key={k} className={`dash-kind${k === kind ? ' on' : ''}`}>
            <input type="radio" name="dash-kind" value={k} checked={k === kind} onChange={() => setKind(k)} />
            <span>
              <strong>{KIND_INFO[k].title}</strong>
              <span className="muted small">{KIND_INFO[k].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="dash-add-row">
        <label className="field" htmlFor={whereId}>
          <span>Where</span>
          <select id={whereId} value={at} onChange={(e) => setAt(Number(e.target.value))}>
            <option value={-1}>At the end</option>
            {layout.widgets.length > 0 && <option value={0}>At the start</option>}
            {layout.widgets.slice(0, -1).map((w, i) => (
              <option key={w.id} value={i + 1}>
                After “{titleOf(w)}”
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={full}>
          Add widget
        </button>
      </div>
      {full && <p className="muted small">The dashboard holds up to {MAX_WIDGETS} widgets. Remove one to add another.</p>}
    </form>
  );
}

interface CardProps {
  widget: Widget;
  index: number;
  count: number;
  editing: boolean;
  open: boolean;
  dragging: boolean;
  dropping: boolean;
  projectId: string;
  model: ReturnType<typeof useStoryModel>;
  onMove: (to: number, control: 'earlier' | 'later') => void;
  onResize: (size: { w?: Width; h?: Height }) => void;
  onConfigure: (settings: Record<string, unknown>, title?: string) => void;
  onToggleSettings: () => void;
  onRemove: () => void;
  drag: { start: (e: DragEvent) => void; over: (e: DragEvent) => void; drop: (e: DragEvent) => void; end: () => void };
}

function Card({ widget, index, count, editing, open, dragging, dropping, projectId, model, onMove, onResize, onConfigure, onToggleSettings, onRemove, drag }: CardProps) {
  const title = titleOf(widget);
  const known = isWidgetKind(widget.kind);
  const base = `dash-${widget.id}`;
  return (
    <li className={`dash-card dash-w${widget.w} dash-h${widget.h}${dragging ? ' dragging' : ''}${dropping ? ' dropping' : ''}`} onDragOver={editing ? drag.over : undefined} onDrop={editing ? drag.drop : undefined}>
      <section className="dash-card-inner" aria-labelledby={`${base}-title`}>
        <header className="dash-card-head">
          {editing && (
            <span className="dash-grip" draggable onDragStart={drag.start} onDragEnd={drag.end} title="Drag to move" aria-hidden="true">
              ⠿
            </span>
          )}
          <h3 id={`${base}-title`} tabIndex={-1}>
            {title}
          </h3>
        </header>
        {editing && (
          <div className="dash-tools" role="group" aria-label={`Arrange “${title}”`}>
            <button type="button" id={`${base}-earlier`} className="btn" disabled={index === 0} onClick={() => onMove(index - 1, 'earlier')} aria-label={`Move “${title}” earlier`}>
              ↑ Earlier
            </button>
            <button type="button" id={`${base}-later`} className="btn" disabled={index === count - 1} onClick={() => onMove(index + 1, 'later')} aria-label={`Move “${title}” later`}>
              ↓ Later
            </button>
            <select aria-label={`Width of “${title}”`} value={widget.w} onChange={(e) => onResize({ w: Number(e.target.value) as Width })}>
              {([1, 2, 3] as const).map((w) => (
                <option key={w} value={w}>
                  {WIDTH_LABELS[w]}
                </option>
              ))}
            </select>
            <select aria-label={`Height of “${title}”`} value={widget.h} onChange={(e) => onResize({ h: Number(e.target.value) as Height })}>
              {([1, 2, 3] as const).map((h) => (
                <option key={h} value={h}>
                  {HEIGHT_LABELS[h]}
                </option>
              ))}
            </select>
            {known && (
              <button type="button" id={`${base}-settings`} className="btn" aria-expanded={open} aria-controls={`${base}-form`} onClick={onToggleSettings}>
                Settings
              </button>
            )}
            <button type="button" className="btn danger" onClick={onRemove} aria-label={`Remove “${title}”`}>
              Remove
            </button>
          </div>
        )}
        {editing && open && known && (
          <div id={`${base}-form`} className="dash-settings" role="group" aria-label={`Settings of “${title}”`}>
            <label className="field">
              <span>Title</span>
              <input value={widget.title} placeholder={KIND_INFO[widget.kind as WidgetKind].title} maxLength={80} onChange={(e) => onConfigure({}, e.target.value)} />
            </label>
            <WidgetSettings widget={widget} model={model ?? undefined} onChange={(settings) => onConfigure(settings)} />
          </div>
        )}
        <div className="dash-body">
          <WidgetBoundary>
            <WidgetBody widget={widget} model={model ?? undefined} projectId={projectId} />
          </WidgetBoundary>
        </div>
      </section>
    </li>
  );
}

/**
 * The author's own dashboard for a novel: the widgets they place, in their
 * order and sizes, each reading the records as they are now. Arranging it
 * changes a preference of this browser, never the novel.
 */
export function DashboardBoard({ projectId }: { projectId: string }) {
  const layout = useLayout(projectId);
  const model = useStoryModel(projectId);
  const [editing, setEditing] = useState(false);
  // While arranging, the choice of a new widget is open only when asked for, so it does not push the widgets out of sight.
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [removed, setRemoved] = useState<{ widget: Widget; index: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const unsaved = dashboards.unsaved(projectId);
  const widgets = layout.widgets;

  // After a change that moves or removes what had focus, put it somewhere that makes sense.
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus) as HTMLElement | null;
    if (el && !(el as HTMLButtonElement).disabled) el.focus();
    else document.getElementById(focus.replace(/-(earlier|later)$/, (_, c) => (c === 'earlier' ? '-later' : '-earlier')))?.focus();
    setFocus(null);
  }, [focus, layout]);

  const save = (next: Layout) => dashboards.save(projectId, next);
  const add = (kind: WidgetKind, at: number) => {
    const next = addWidget(layout, kind, at);
    const made = next.widgets.find((w) => !widgets.some((old) => old.id === w.id));
    if (!made) return;
    save(next);
    setRemoved(null);
    setStatus(`Added “${KIND_INFO[kind].title}” at position ${next.widgets.indexOf(made) + 1} of ${next.widgets.length}.`);
    setFocus(`dash-${made.id}-title`);
  };
  const starter = () => {
    const next = STARTER.reduce((l, kind) => addWidget(l, kind), layout);
    save(next);
    setStatus(`Added ${STARTER.map((k) => `“${KIND_INFO[k].title}”`).join(', ')}.`);
    if (next.widgets[0]) setFocus(`dash-${next.widgets[0].id}-title`);
  };
  const move = (widget: Widget, to: number, control?: 'earlier' | 'later') => {
    const next = moveWidget(layout, widget.id, to);
    if (next === layout) return;
    save(next);
    setStatus(`Moved “${titleOf(widget)}” to position ${next.widgets.findIndex((w) => w.id === widget.id) + 1} of ${next.widgets.length}.`);
    if (control) setFocus(`dash-${widget.id}-${control}`);
  };
  const remove = (widget: Widget) => {
    const { layout: next, removed: gone } = removeWidget(layout, widget.id);
    if (!gone) return;
    save(next);
    setRemoved(gone);
    setStatus(`Removed “${titleOf(widget)}”. Nothing in the novel was changed.`);
    setFocus('dash-undo');
  };
  const undo = () => {
    if (!removed) return;
    save(restoreWidget(layout, removed.widget, removed.index));
    setStatus(`Put “${titleOf(removed.widget)}” back.`);
    setFocus(`dash-${removed.widget.id}-title`);
    setRemoved(null);
  };

  const dragFor = (widget: Widget) => ({
    start: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', widget.id);
      const card = (e.currentTarget as HTMLElement).closest('.dash-card');
      if (card) e.dataTransfer.setDragImage(card, 16, 16);
      setDragId(widget.id);
    },
    over: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overId !== widget.id) setOverId(widget.id);
    },
    drop: (e: DragEvent) => {
      e.preventDefault();
      const moving = widgets.find((w) => w.id === dragId);
      if (moving && moving.id !== widget.id) move(moving, widgets.findIndex((w) => w.id === widget.id));
      setDragId(null);
      setOverId(null);
    },
    end: () => {
      setDragId(null);
      setOverId(null);
    },
  });

  const toggleEditing = () => {
    setEditing(!editing);
    setAdding(false);
    setOpen(null);
    setStatus(editing ? 'Done arranging.' : '');
  };

  return (
    <section className="dash" aria-labelledby="dash-title">
      <div className="dash-head">
        <div>
          <h2 id="dash-title">Your dashboard</h2>
          <p className="muted small">Widgets you choose, each reading this novel’s records as they are now. The arrangement is kept in this browser with your other personal settings; no record is copied into it.</p>
        </div>
        {(widgets.length > 0 || editing) && (
          <div className="actions wrap">
            {editing && widgets.length > 0 && (
              <button
                type="button"
                className="btn"
                aria-expanded={adding}
                aria-controls="dash-add"
                onClick={() => {
                  setAdding(!adding);
                  if (!adding) setFocus('dash-add-title');
                }}
              >
                Add a widget
              </button>
            )}
            <button type="button" className={`btn${editing ? ' primary' : ''}`} aria-pressed={editing} onClick={toggleEditing}>
              {editing ? 'Done' : 'Customize'}
            </button>
          </div>
        )}
      </div>
      <div className="dash-status">
        <span role="status">{status}</span>
        {removed && (
          <button type="button" id="dash-undo" className="btn" onClick={undo}>
            Undo
          </button>
        )}
      </div>
      {unsaved && (
        <p className="dash-note" role="alert">
          This browser would not keep the arrangement (its storage is full or turned off), so it lasts only until the page is closed.
        </p>
      )}
      {editing && (adding || widgets.length === 0) && <AddWidget layout={layout} onAdd={add} />}
      {widgets.length === 0 ? (
        !editing && (
          <div className="panel dash-start">
            <p>
              <strong>Nothing on your dashboard yet.</strong> Place widgets to keep an eye on what matters to you in this novel. Each one reads your records as they are, and shows nothing it did not find.
            </p>
            <div className="actions start">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setEditing(true);
                  setAdding(true);
                  setFocus('dash-add-title');
                }}
              >
                Add a widget
              </button>
              <button type="button" className="btn" onClick={starter}>
                Start with four widgets
              </button>
            </div>
            <p className="muted small">The four: {STARTER.map((k) => KIND_INFO[k].title.toLowerCase()).join(', ')}. You can change or remove any of them.</p>
          </div>
        )
      ) : (
        <ol className={`dash-grid${editing ? ' editing' : ''}`} aria-label="Widgets">
          {widgets.map((widget, index) => (
            <Card
              key={widget.id}
              widget={widget}
              index={index}
              count={widgets.length}
              editing={editing}
              open={open === widget.id}
              dragging={dragId === widget.id}
              dropping={overId === widget.id && dragId !== widget.id}
              projectId={projectId}
              model={model}
              onMove={(to, control) => move(widget, to, control)}
              onResize={(size) => {
                save(resizeWidget(layout, widget.id, size));
                setStatus(`“${titleOf(widget)}” is now ${WIDTH_LABELS[size.w ?? widget.w].toLowerCase()} and ${HEIGHT_LABELS[size.h ?? widget.h].toLowerCase()}.`);
              }}
              onConfigure={(settings, title) => save(configureWidget(layout, widget.id, settings, title))}
              onToggleSettings={() => setOpen(open === widget.id ? null : widget.id)}
              onRemove={() => remove(widget)}
              drag={dragFor(widget)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
