import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { connections } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { useMe } from '@/modules/collab/identity';
import { connectionType } from '@/modules/connections/types';
import { factionAt, factionNetwork, factionsOf, factionTies, TIE_LABELS, TIE_ROLES, type Tie, type TieRole } from '@/modules/factions/ties';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import type { Anchor } from '@/modules/model/validity';
import { whenWords } from '@/modules/progression/track';
import { can } from '@/modules/sync/access';
import { WhenPicker } from '@/modules/travel/components/TravelForms';
import { nodeLabel } from '@/modules/timeline/narrative';
import { nearestInDirection } from '@/modules/viz/focus';
import { decodeAnchor, encodeAnchor } from '@/modules/viz/params';
import { Legend } from '@/modules/viz/components/Legend';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { ArrowMarker } from '@/modules/viz/components/Arrow';
import { Modal } from '@/shared/Modal';
import { timelineRows } from './summaries';

/** The page address: as of when, and the faction looked at. */
export const FACTION_PARAMS = ['fat', 'ffaction'] as const;
export const factionLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(FACTION_PARAMS.flatMap((p) => (params.get(p) ? [[p, params.get(p)!]] : [])));

/** A point to look at the story from: the end, a chapter or scene, or an event. Shared by the faction and ownership views. */
export function AsOf({ model, label, value, onChange }: { model: StoryModel; label: string; value: Anchor | 'end'; onChange: (value: string | null) => void }) {
  const chapters = [...model.nodes.values()].filter((n) => model.order.position.has(n.id)).sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
  return (
    <label className="field viz-who">
      <span>As of</span>
      <select aria-label={label} value={value === 'end' ? '' : encodeAnchor(value)} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">The end of the story</option>
        {chapters.length > 0 && (
          <optgroup label="A chapter or scene">
            {chapters.map((n) => (
              <option key={n.id} value={encodeAnchor({ kind: 'node', nodeId: n.id })}>
                {nodeLabel(model, n.id)}
              </option>
            ))}
          </optgroup>
        )}
        {model.events.size > 0 && (
          <optgroup label="An event">
            {timelineRows(model).map((e) => (
              <option key={e.id} value={encodeAnchor({ kind: 'event', eventId: e.id })}>
                {e.title}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/** Which timeline this is: a forked one, or an alternate history shown, so what is recorded is read as holding there only. */
export function TimelineNote({ model, history }: { model: StoryModel; history: string | null }): ReactNode {
  const forked = model.timeline && model.timeline.status !== 'main';
  if (!forked && !history) return null;
  return (
    <p className="notice history-shown" role="status">
      {forked && `This novel is a forked timeline (${model.timeline!.forkLabel ? `after ${model.timeline!.forkLabel}` : 'before the story'}): what is recorded here holds in it alone. `}
      {history && `Showing the alternate history “${history}”: what hangs on an event it does not have is read as not happening.`}
    </p>
  );
}

// The views' shared palette (global.css): it follows the light or dark theme. Each kind of tie also has its own line.
const TIE_STYLE: Partial<Record<TieRole, { color: string; dash?: string; shape: 'line' | 'dashed' | 'arrow' | 'dotted' }>> = {
  ally: { color: 'var(--cat-2)', shape: 'line' },
  rival: { color: 'var(--cat-3)', dash: '6 4', shape: 'dashed' },
  influence: { color: 'var(--cat-6)', shape: 'arrow' },
  territory: { color: 'var(--cat-other)', dash: '1 4', shape: 'dotted' },
  other: { color: 'var(--cat-7)', dash: '4 2 1 2', shape: 'dashed' },
};

interface FactionsViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
  history: string | null;
}

/**
 * FACTIONS
 * Who belongs to each faction and who leads it, its allies and enemies, what
 * it controls and influences, where it is based, as of any point in the
 * story, and how all of that changed: read from the typed connections and
 * when each holds. A map of the factions and their sway when wanted; always
 * a table.
 */
export function FactionsView({ model, projectId, params, setParams, mode, setMode, pick, selectedId, history }: FactionsViewProps) {
  const me = useMe(projectId);
  const [adding, setAdding] = useState(false);
  const factions = factionsOf(model);
  const at: Anchor | 'end' = decodeAnchor(params.get('fat')) ?? 'end';
  const focus = factions.find((f) => f.id === params.get('ffaction')) ?? null;
  const writes = can(me.role, 'write');
  const toolbar = (
    <div className="viz-toolbar">
      <AsOf model={model} label="Factions as of" value={at} onChange={(v) => setParams({ fat: v })} />
      {factions.length > 0 && (
        <label className="field viz-who">
          <span>Faction</span>
          <select aria-label="Faction looked at" value={focus?.id ?? ''} onChange={(e) => setParams({ ffaction: e.target.value || null })}>
            <option value="">Every faction</option>
            {factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {factions.length > 0 && <ViewSwitch mode={mode} onChange={setMode} visualLabel="Map" />}
      {writes && (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Record a tie
        </button>
      )}
    </div>
  );
  const form = adding && <TieForm model={model} projectId={projectId} faction={focus?.id ?? null} onClose={() => setAdding(false)} />;
  if (!factions.length)
    return (
      <>
        {toolbar}
        <VizState status={{ kind: 'empty', message: 'No factions yet. Add factions in the Codex, or record that someone is a member of something, or that something controls a place.' }} />
        {form}
      </>
    );
  const pointWords = at === 'end' ? 'the end of the story' : whenWords(at, model);
  const cell = (ties: Tie[] | undefined) =>
    ties?.length ? (
      ties.map((t, i) => (
        <span key={t.link.id}>
          {i > 0 && ', '}
          {t.role === 'other' ? t.words : t.otherName}
          {t.holds === 'unknown' && <span className="muted small"> (may hold)</span>}
          {t.timeless && <span className="muted small"> (no time given)</span>}
        </span>
      ))
    ) : (
      <span className="muted">—</span>
    );
  const shown = focus ? [focus] : factions;
  return (
    <>
      {toolbar}
      <TimelineNote model={model} history={history} />
      {mode === 'visual' && <FactionMap model={model} at={at} pick={pick} selectedId={selectedId} />}
      <div className="table-scroll">
        <table className="sessions faction-table">
          <caption className="visually-hidden">Factions as of {pointWords}</caption>
          <thead>
            <tr>
              <th scope="col">Faction</th>
              {TIE_ROLES.map((r) => (
                <th key={r} scope="col">
                  {TIE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const { byRole } = factionAt(model, f.id, at);
              return (
                <tr key={f.id} className={selectedId === f.id ? 'viz-row selected' : 'viz-row'}>
                  <th scope="row">
                    <button type="button" className="link viz-pick" aria-pressed={selectedId === f.id} onClick={() => pick({ type: 'entry', id: f.id })}>
                      {f.name}
                    </button>
                  </th>
                  {TIE_ROLES.map((r) => (
                    <td key={r}>{cell(byRole.get(r))}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">As of {pointWords}. A tie with no time given holds as far as anyone has said: nothing here is assumed to last. “May hold” marks a tie whose time cannot be compared with this point (a chapter against an event).</p>
      {focus && <FactionHistory model={model} projectId={projectId} faction={focus.id} writes={writes} />}
      {form}
    </>
  );
}

/** Every tie of one faction, in order, with when and how each began and ended, and ending one that still holds. */
function FactionHistory({ model, projectId, faction, writes }: { model: StoryModel; projectId: string; faction: string; writes: boolean }) {
  const [ending, setEnding] = useState<{ id: string; at: Anchor | null; how: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ties = factionTies(model, faction);
  return (
    <section className="stack tight" aria-label={`History of ${model.entries.get(faction)?.name}`}>
      <h3>How {model.entries.get(faction)?.name} changed</h3>
      <ol className="viz-list faction-history">
        {ties.map((t) => (
          <li key={t.link.id}>
            <strong>{t.words}</strong> <span className="muted small">{t.when}</span> <span className="badge">{TIE_LABELS[t.role]}</span>
            {writes && !t.link.validity?.until && ending?.id !== t.link.id && (
              <button type="button" className="link" aria-label={`End: ${t.words}`} onClick={() => setEnding({ id: t.link.id, at: null, how: '' })}>
                {' '}
                End…
              </button>
            )}
            {ending?.id === t.link.id && (
              <form
                className="stack tight tie-end"
                aria-label={`When ${t.words} ends`}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!ending.at) return setError('Choose when it ends.');
                  void connections
                    .forProject(projectId)
                    .end(t.link.id, ending.at, ending.how)
                    .then(
                      () => (setEnding(null), setError(null)),
                      (err) => setError(err instanceof Error ? err.message : String(err)),
                    );
                }}
              >
                <WhenPicker label="Ends" value={ending.at} onChange={(at) => setEnding({ ...ending, at })} model={model} />
                <input aria-label="How it ends" placeholder="left, expelled, dissolved, a truce…" value={ending.how} onChange={(e) => setEnding({ ...ending, how: e.target.value })} />
                <span className="toolbar">
                  <button type="submit" className="btn">
                    End it
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setEnding(null)}>
                    Cancel
                  </button>
                </span>
              </form>
            )}
          </li>
        ))}
      </ol>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Factions on a circle, their territory beyond them, and the ties holding at the point: allies, enemies, influence, control. */
function FactionMap({ model, at, pick, selectedId }: { model: StoryModel; at: Anchor | 'end'; pick: (ref: EntityRef) => void; selectedId: string | null }) {
  const refs = useRef(new Map<string, SVGGElement>());
  const [current, setCurrent] = useState<string | null>(null);
  const { factions, edges, territories } = factionNetwork(model, at);
  const R = Math.max(150, factions.length * 45);
  const pos = new Map<string, { x: number; y: number }>();
  factions.forEach((f, i) => {
    const a = (i / factions.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(f.id, { x: Math.cos(a) * R, y: Math.sin(a) * R });
  });
  // Territory just beyond the first faction that controls or influences it.
  territories.forEach((t, i) => {
    const owner = edges.find((e) => e.other.id === t.id)!;
    const from = pos.get(owner.link.fromId) ?? { x: 0, y: 0 };
    const len = Math.hypot(from.x, from.y) || 1;
    const spread = (i % 3) - 1;
    pos.set(t.id, { x: from.x + (from.x / len) * 110 - (from.y / len) * spread * 60, y: from.y + (from.y / len) * 110 + (from.x / len) * spread * 60 });
  });
  const marks = [...factions, ...territories].map((e) => ({ id: e.id, ...pos.get(e.id)!, entry: e }));
  const xs = marks.map((m) => m.x);
  const ys = marks.map((m) => m.y);
  const bounds = { minX: Math.min(...xs) - 120, minY: Math.min(...ys) - 60, maxX: Math.max(...xs) + 120, maxY: Math.max(...ys) + 60 };
  const focusId = current && pos.has(current) ? current : marks[0]?.id;
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick({ type: 'entry', id });
      return;
    }
    const next = nearestInDirection(marks, id, e.key);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setCurrent(next.id);
    refs.current.get(next.id)?.focus();
  };
  const legend = (['ally', 'rival', 'influence', 'territory', 'other'] as TieRole[]).filter((r) => edges.some((e) => e.role === r)).map((r) => ({ key: r, label: TIE_LABELS[r], color: TIE_STYLE[r]!.color, shape: TIE_STYLE[r]!.shape }));
  return (
    <section className="stack tight faction-map" aria-label="Faction map">
      <Viewport label={`Faction map: ${factions.length} ${factions.length === 1 ? 'faction' : 'factions'} and ${edges.length} ${edges.length === 1 ? 'tie' : 'ties'} holding. Arrow keys move between them, Enter selects. The table gives the same in words.`} bounds={bounds} of="the map">
        {(view) => (
          <>
            <defs>
              <ArrowMarker id="fm-arrow" color={TIE_STYLE.influence!.color} />
            </defs>
            {edges.map((t) => {
              const [a, b] = [pos.get(t.link.fromId), pos.get(t.link.toId)];
              if (!a || !b) return null;
              const s = TIE_STYLE[t.role] ?? TIE_STYLE.other!;
              return (
                <g key={t.link.id} className="fm-edge">
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={s.color} strokeWidth={t.role === 'territory' ? 2 : 3} strokeDasharray={s.dash} markerEnd={t.role === 'influence' ? 'url(#fm-arrow)' : undefined} />
                  <title>{`${model.entries.get(t.link.fromId)?.name}: ${connectionType(t.link.type).label} ${model.entries.get(t.link.toId)?.name}${t.holds === 'unknown' ? ' (may hold)' : ''}`}</title>
                </g>
              );
            })}
            {marks.map(({ id, x, y, entry }) => {
              const faction = factions.includes(entry);
              const selected = selectedId === id;
              return (
                <g
                  key={id}
                  ref={(el) => void (el ? refs.current.set(id, el) : refs.current.delete(id))}
                  className={`fm-node${faction ? ' faction' : ' territory'}${selected ? ' selected' : ''}`}
                  data-mark
                  role="button"
                  tabIndex={id === focusId ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={faction ? `${entry.name}, a faction` : `${entry.name}, held in sway`}
                  transform={`translate(${x} ${y})`}
                  onClick={() => pick({ type: 'entry', id })}
                  onKeyDown={(e) => onKey(e, id)}
                  onFocus={() => setCurrent(id)}
                >
                  {faction ? <circle r={22} /> : <rect x={-12} y={-12} width={24} height={24} rx={3} />}
                  <text y={faction ? 38 : 28} textAnchor="middle" className="viz-label" style={{ fontSize: 13 / Math.max(view.k, 0.6) }}>
                    {entry.name}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </Viewport>
      <Legend title="Ties" items={legend} />
    </section>
  );
}

/** Recording a tie: who or what, what kind of tie (or the author's own), to what, from when, and how it began. */
function TieForm({ model, projectId, faction, onClose }: { model: StoryModel; projectId: string; faction: string | null; onClose: () => void }) {
  const [from, setFrom] = useState('');
  const [type, setType] = useState('member-of');
  const [own, setOwn] = useState('');
  const [to, setTo] = useState(faction ?? '');
  const [begins, setBegins] = useState<Anchor | null>(null);
  const [how, setHow] = useState('');
  const [error, setError] = useState<string | null>(null);
  const entries = [...model.entries.values()];
  const kinds = ['member-of', 'leads', 'allied-with', 'at-war-with', 'considers-rival', 'controls', 'influences', 'located-in'];
  return (
    <Modal title="Record a tie" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const kind = type === 'own' ? own.trim() : type;
          if (!from || !to || !kind) return setError('Choose both ends, and the kind of tie.');
          void connections
            .forProject(projectId)
            .create({ from: { type: 'entry', id: from }, to: { type: 'entry', id: to }, type: kind, how, ...(begins ? { validity: { from: begins, until: null } } : {}) })
            .then(onClose, (err) => setError(err instanceof Error ? err.message : String(err)));
        }}
      >
        <label className="field">
          <span>Who or what</span>
          <select aria-label="Who or what" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Choose…</option>
            <EntryOptions entries={entries} />
          </select>
        </label>
        <label className="field">
          <span>Tie</span>
          <select aria-label="Kind of tie" value={type} onChange={(e) => setType(e.target.value)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {connectionType(k).label}
              </option>
            ))}
            <option value="own">Your own…</option>
          </select>
        </label>
        {type === 'own' && <input aria-label="Your own kind of tie" placeholder="Owes a debt to, Sworn to, Pays tribute to…" value={own} onChange={(e) => setOwn(e.target.value)} />}
        <label className="field">
          <span>To</span>
          <select aria-label="Tied to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            <EntryOptions entries={entries} />
          </select>
        </label>
        <WhenPicker label="Begins" value={begins} onChange={setBegins} model={model} />
        <input aria-label="How it began" placeholder="joined, elected, a treaty… (optional)" value={how} onChange={(e) => setHow(e.target.value)} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions start">
          <button type="submit" className="btn primary">
            Record the tie
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
