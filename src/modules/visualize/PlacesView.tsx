import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { connections, manuscript, places, timeline } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { useMe } from '@/modules/collab/identity';
import { connectionType } from '@/modules/connections/types';
import type { Undecided } from '@/modules/model/query';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { mapPlaces, placeLinks, placeTree, placesWithin, type PlaceRow } from '@/modules/places/explore';
import { LevelsDialog, MapsDialog } from '@/modules/places/components/PlaceDialogs';
import type { WorldMap } from '@/modules/places/types';
import { can } from '@/modules/sync/access';
import { nodeLabel } from '@/modules/timeline/narrative';
import { nearestInDirection } from '@/modules/viz/focus';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { Legend } from '@/modules/viz/components/Legend';

/** The page address: the map shown, the place whose inside is explored, and the place being put on the map by a click. */
export const PLACE_PARAMS = ['pmap', 'pplace'] as const;
export const placeLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(PLACE_PARAMS.flatMap((p) => (params.get(p) ? [[p, params.get(p)!]] : [])));

interface PlacesViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
  related: (id: string) => boolean;
  keep: (id: string) => boolean;
  filtered: boolean;
  undecided: Undecided[];
  clear: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * THE PLACE EXPLORER
 * Every place as a tree, inside what it is located in, at its level, with
 * how much of the story it holds; and, when the novel has one, a map with
 * the places the author has pinned on it. The tree needs no map: a place
 * with no coordinates is as usable as one with them, and a map lists the
 * places it covers that are not on it.
 */
export function PlacesView({ model, projectId, params, setParams, mode, setMode, pick, selectedId, related, keep, filtered, undecided, clear }: PlacesViewProps) {
  const api = places.forProject(projectId);
  const settings = useLiveQuery(() => api.settings(), [projectId]);
  const maps = useLiveQuery(() => api.maps(), [projectId]);
  const pins = useLiveQuery(() => api.pins(), [projectId]);
  const me = useMe(projectId);
  const [dialog, setDialog] = useState<'levels' | 'maps' | null>(null);
  if (settings === undefined || !maps || !pins) return <VizState status={{ kind: 'loading' }} />;
  const writes = can(me.role, 'write');
  const rows = placeTree(model, { settings, pins });
  const tools = writes && (
    <span className="toolbar">
      <button type="button" className="btn ghost" onClick={() => setDialog('levels')}>
        Levels of place…
      </button>
      <button type="button" className="btn ghost" onClick={() => setDialog('maps')}>
        Maps…
      </button>
    </span>
  );
  const dialogs = (
    <>
      {dialog === 'levels' && <LevelsDialog model={model} settings={settings} onClose={() => setDialog(null)} />}
      {dialog === 'maps' && <MapsDialog model={model} maps={maps} pins={pins} onClose={() => setDialog(null)} />}
    </>
  );
  if (!rows.length)
    return (
      <>
        <div className="viz-toolbar">{tools}</div>
        <VizState status={{ kind: 'empty', message: 'No places yet. Add locations in the Codex; places inside other places are nested here.' }} />
        {dialogs}
      </>
    );

  // Exploring inside one place: it and what lies within it.
  const inside = params.get('pplace') && rows.some((r) => r.entry.id === params.get('pplace')) ? params.get('pplace')! : null;
  const scoped = inside ? rows.filter((r) => r.entry.id === inside || placesWithin(rows, inside).includes(r.entry.id)) : rows;
  const trail: PlaceRow[] = [];
  for (let at = inside ? rows.find((r) => r.entry.id === inside) : undefined; at; at = at.parentId ? rows.find((r) => r.entry.id === at!.parentId) : undefined) trail.unshift(at);
  const shown = scoped.filter((r) => keep(r.entry.id));
  const map = maps.find((m) => m.id === params.get('pmap')) ?? maps[0] ?? null;
  const baseDepth = inside ? (rows.find((r) => r.entry.id === inside)?.depth ?? 0) : 0;
  const mapName = new Map(maps.map((m) => [m.id, m.name]));

  const pickPlace = (id: string) => pick({ type: 'entry', id });
  const nameButton = (id: string, label: string) => (
    <>
      <button type="button" className="link viz-pick" aria-pressed={selectedId === id} onClick={() => pickPlace(id)}>
        {label}
      </button>
      {selectedId === id ? <span className="badge viz-mark">Selected</span> : related(id) && <span className="badge viz-mark">Connected to the selection</span>}
    </>
  );

  const tree = (
    <ul className="viz-list viz-tree" aria-label="Places">
      {shown.map((r) => (
        <li key={r.entry.id} className={selectedId === r.entry.id ? 'viz-row selected' : related(r.entry.id) ? 'viz-row related' : 'viz-row'} style={{ paddingLeft: `${(filtered ? 0 : r.depth - baseDepth) * 1.25}rem` }}>
          {nameButton(r.entry.id, r.entry.name)}{' '}
          <span className="muted small">
            {r.events ? `${plural(r.events, 'event')} here` : 'no events here yet'}
            {r.eventsWithin > 0 && ` · ${plural(r.eventsWithin, 'event')} within`}
            {r.characters > 0 && ` · ${plural(r.characters, 'character')}`}
            {r.factions > 0 && ` · ${plural(r.factions, 'faction')}`}
            {r.chapters > 0 && ` · ${plural(r.chapters, 'chapter or scene', 'chapters and scenes')}`}
            {maps.length > 0 && (r.maps.length ? ` · on ${r.maps.map((id) => mapName.get(id)).join(', ')}` : ' · no coordinates')}
          </span>
          {r.levelWords && <span className="badge place-level"> {r.levelWords}</span>}
          {r.notes.map((note) => (
            <div key={note} className="field-issue small">
              {note}
            </div>
          ))}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div className="viz-toolbar">
        {maps.length > 0 && <ViewSwitch mode={mode} onChange={setMode} visualLabel="Map" />}
        {maps.length > 1 && mode === 'visual' && (
          <label className="field viz-who">
            <span>Map shown</span>
            <select aria-label="Map shown" value={map?.id ?? ''} onChange={(e) => setParams({ pmap: e.target.value })}>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {tools}
      </div>
      {inside && (
        <nav className="place-trail small" aria-label="Exploring inside">
          {trail.map((r, i) => (
            <span key={r.entry.id}>
              {i > 0 && ' › '}
              {i === trail.length - 1 ? <strong>{r.entry.name}</strong> : <button type="button" className="link" onClick={() => setParams({ pplace: r.entry.id })}>{r.entry.name}</button>}
            </span>
          ))}{' '}
          <button type="button" className="btn ghost" onClick={() => setParams({ pplace: null })}>
            Show every place
          </button>
        </nav>
      )}
      {mode === 'visual' && map && <PlaceMap model={model} rows={scoped} map={map} pins={pins} params={params} setParams={setParams} pick={pickPlace} selectedId={selectedId} keep={keep} />}
      {shown.length ? (
        <VizState status={{ kind: 'ready' }} undecided={undecided}>
          {tree}
        </VizState>
      ) : (
        <VizState status={{ kind: 'no-results', onClearFilters: clear }} undecided={undecided} />
      )}
      {dialogs}
    </>
  );
}

/** One map: its grid or image, the places pinned on it, and the places it covers that are not on it. */
function PlaceMap({ model, rows, map, pins, params, setParams, pick, selectedId, keep }: { model: StoryModel; rows: PlaceRow[]; map: WorldMap; pins: Parameters<typeof mapPlaces>[2]; params: URLSearchParams; setParams: (changes: Record<string, string | null>) => void; pick: (id: string) => void; selectedId: string | null; keep: (id: string) => boolean }) {
  const refs = useRef(new Map<string, SVGGElement>());
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = mapPlaces(rows, map, pins);
  const pinned = on.pinned.filter((p) => keep(p.entry.id));
  const putting = params.get('pput') && model.entries.has(params.get('pput')!) ? params.get('pput')! : null;
  // One scale both ways, about 800 drawing units across the larger side.
  const S = 800 / Math.max(map.width, map.height);
  const [w, h] = [map.width * S, map.height * S];
  const marks = pinned.map((p) => ({ id: p.entry.id, x: p.pin.x * S, y: p.pin.y * S, place: p }));
  const focusId = current && marks.some((m) => m.id === current) ? current : marks[0]?.id;
  const grid: number[][] = [[], []];
  if (map.grid > 0 && map.width / map.grid <= 200 && map.height / map.grid <= 200) {
    for (let x = map.grid; x < map.width; x += map.grid) grid[0].push(x * S);
    for (let y = map.grid; y < map.height; y += map.grid) grid[1].push(y * S);
  }
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick(id);
      return;
    }
    const next = nearestInDirection(marks, id, e.key);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setCurrent(next.id);
    refs.current.get(next.id)?.focus();
  };
  const putAt = (e: MouseEvent<SVGRectElement>, view: { x: number; y: number; k: number }) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const [x, y] = [(e.clientX - box.left - view.x) / view.k / S, (e.clientY - box.top - view.y) / view.k / S];
    const round = (v: number) => Math.round(v * 100) / 100;
    void places
      .forProject(model.project.id)
      .pin(map.id, putting!, round(x), round(y))
      .then(
        () => setParams({ pput: null }),
        (err) => setError(err instanceof Error ? err.message : String(err)),
      );
  };
  return (
    <section className="stack tight place-map" aria-label={`Map: ${map.name}`}>
      {putting && (
        <p className="notice" role="status">
          Click where {model.entries.get(putting)!.name} is on {map.name}.{' '}
          <button type="button" className="link" onClick={() => setParams({ pput: null })}>
            Cancel
          </button>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Viewport label={`${map.name}: ${plural(pinned.length, 'place')} placed on it${map.unit ? `, ${map.width} by ${map.height} ${map.unit}` : ''}. Arrow keys move between places, Enter selects.`} bounds={{ minX: -20, minY: -20, maxX: w + 20, maxY: h + 20 }} of="the map">
        {(view) => (
          <>
            {map.image ? <image href={map.image} x={0} y={0} width={w} height={h} preserveAspectRatio="none" /> : <rect x={0} y={0} width={w} height={h} className="pm-ground" />}
            {grid[0].map((x) => (
              <line key={`x${x}`} x1={x} y1={0} x2={x} y2={h} className="pm-grid" />
            ))}
            {grid[1].map((y) => (
              <line key={`y${y}`} x1={0} y1={y} x2={w} y2={y} className="pm-grid" />
            ))}
            <rect x={0} y={0} width={w} height={h} className="pm-edge" />
            {putting && <rect x={-2000} y={-2000} width={w + 4000} height={h + 4000} className="pm-catch" data-mark aria-hidden="true" onClick={(e) => putAt(e, view)} />}
            {marks.map(({ id, x, y, place }) => {
              const selected = selectedId === id;
              const words = `${place.entry.name}: ${place.pin.x} across, ${place.pin.y} down${map.unit ? ` ${map.unit}` : ''}${place.outside ? ', outside the map’s edges' : ''}`;
              return (
                <g
                  key={id}
                  ref={(el) => void (el ? refs.current.set(id, el) : refs.current.delete(id))}
                  className={`pm-pin${selected ? ' selected' : ''}`}
                  data-mark
                  role="button"
                  tabIndex={id === focusId ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={words}
                  transform={`translate(${x} ${y})`}
                  onClick={() => pick(id)}
                  onKeyDown={(e) => onKey(e, id)}
                  onFocus={() => setCurrent(id)}
                >
                  <circle r={7 / Math.max(view.k, 0.6)} />
                  <text x={10 / Math.max(view.k, 0.6)} dy="0.35em" className="viz-label" style={{ fontSize: 13 / Math.max(view.k, 0.6) }}>
                    {place.entry.name}
                  </text>
                  <title>{words}</title>
                </g>
              );
            })}
          </>
        )}
      </Viewport>
      <Legend
        title="What the map shows"
        items={[
          { key: 'pin', label: 'A place, where you put it', color: 'var(--accent)', shape: 'circle' },
          ...(grid[0].length || grid[1].length ? [{ key: 'grid', label: `A grid line every ${map.grid}${map.unit ? ` ${map.unit}` : ''}`, color: 'var(--border)', shape: 'thin' as const }] : []),
          { key: 'edge', label: 'The map’s edge', color: 'var(--muted)', shape: 'outline' },
        ]}
      />
      {on.missing.length > 0 && (
        <p className="small" role="note">
          <span className="muted">Not on this map ({on.missing.length}), still in the tree: </span>
          {on.missing.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ', '}
              <button type="button" className="link" onClick={() => pick(e.id)}>
                {e.name}
              </button>
            </span>
          ))}
          . Select one to give it coordinates.
        </p>
      )}
      {on.pinned.some((p) => p.outside) && <p className="field-issue small">Outside the map’s edges: {on.pinned.filter((p) => p.outside).map((p) => p.entry.name).join(', ')}.</p>}
    </section>
  );
}

/**
 * Beside the view, for a selected place: its level, what it is in, what it
 * is tied to (characters, factions, events, chapters), tying more to it, and
 * where it is on each map. Every change goes through the service that keeps
 * that record.
 */
export function PlaceDetails({ model, projectId, entryId, setParams }: { model: StoryModel; projectId: string; entryId: string; setParams: (changes: Record<string, string | null>) => void }) {
  const api = places.forProject(projectId);
  const settings = useLiveQuery(() => api.settings(), [projectId]);
  const maps = useLiveQuery(() => api.maps(), [projectId]);
  const pins = useLiveQuery(() => api.pins(), [projectId]);
  const me = useMe(projectId);
  const [tie, setTie] = useState({ record: '', type: 'located-in', event: '', node: '' });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (settings === undefined || !maps || !pins) return null;
  const entry = model.entries.get(entryId);
  if (!entry || entry.category !== 'location') return null;
  const writes = can(me.role, 'write');
  const rows = placeTree(model, { settings, pins });
  const row = rows.find((r) => r.entry.id === entryId);
  const within = new Set(placesWithin(rows, entryId));
  const links = placeLinks(model, entryId);
  const act = (task: Promise<unknown>, done: string) => void task.then(() => setMessage({ text: done }), (e) => setMessage({ text: e instanceof Error ? e.message : String(e), error: true }));
  const others = [...model.entries.values()].filter((e) => e.category !== 'location');
  const chapters = [...model.nodes.values()].filter((n) => model.order.position.has(n.id)).sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
  const listOf = (title: string, items: { key: string; text: string }[]) =>
    items.length > 0 && (
      <div>
        <strong className="small">{title}</strong>
        <ul className="small">
          {items.map((i) => (
            <li key={i.key}>{i.text}</li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="stack tight viz-editor place-details" aria-label={`Place: ${entry.name}`}>
      {writes ? (
        <div className="grid-2 tight">
          <label className="field">
            <span>Level</span>
            <select aria-label="Level of place" value={entry.placeLevel ?? ''} onChange={(e) => act(api.setLevel(entryId, e.target.value || null), 'Level saved.')}>
              <option value="">Not set</option>
              {settings?.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Located in</span>
            <select aria-label="Located in" value={row?.parentId ?? ''} onChange={(e) => act(api.setParent(entryId, e.target.value || null), 'Saved.')}>
              <option value="">Nothing (at the top)</option>
              {rows
                .filter((r) => r.entry.id !== entryId && !within.has(r.entry.id))
                .map((r) => (
                  <option key={r.entry.id} value={r.entry.id}>
                    {'  '.repeat(r.depth)}
                    {r.entry.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="small">{[row?.levelWords, row?.parentId ? `in ${model.entries.get(row.parentId)?.name}` : 'at the top'].filter(Boolean).join(', ')}</p>
      )}
      {!settings?.levels.length && writes && <p className="muted small">No levels of place yet: set them under “Levels of place…”.</p>}
      {row && row.childIds.length > 0 && (
        <button type="button" className="btn" onClick={() => setParams({ pplace: entryId })}>
          Explore what is inside {entry.name}
        </button>
      )}
      {listOf('Characters', links.characters.map((c) => ({ key: c.entry.id, text: `${c.entry.name}: ${c.how.join('; ')}` })))}
      {listOf('Factions', links.factions.map((c) => ({ key: c.entry.id, text: `${c.entry.name}: ${c.how.join('; ')}` })))}
      {listOf('Other records', links.others.map((c) => ({ key: c.entry.id, text: `${c.entry.name}: ${c.how.join('; ')}` })))}
      {listOf('Events here', links.events.map((e) => ({ key: e.id, text: e.name })))}
      {row && row.eventsWithin > 0 && <p className="small">{plural(row.eventsWithin, 'event')} in places inside it.</p>}
      {listOf('Chapters and scenes', links.chapters.map((c) => ({ key: c.node.id, text: `${nodeLabel(model, c.node.id)}: ${c.how.join('; ')}` })))}
      {writes && (
        <details className="place-tie">
          <summary>Tie something to {entry.name}</summary>
          <form
            className="stack tight"
            onSubmit={(e) => {
              e.preventDefault();
              if (!tie.record) return;
              act(connections.forProject(projectId).create({ from: { type: 'entry', id: tie.record }, to: { type: 'entry', id: entryId }, type: tie.type }).then(() => setTie({ ...tie, record: '' })), 'Tied.');
            }}
          >
            <select aria-label="Record to tie" value={tie.record} onChange={(e) => setTie({ ...tie, record: e.target.value })}>
              <option value="">A character, faction or other record…</option>
              <EntryOptions entries={others} />
            </select>
            <select aria-label="How it is tied" value={tie.type} onChange={(e) => setTie({ ...tie, type: e.target.value })}>
              {['located-in', 'controls', 'influences', 'owns', 'leads', 'related'].map((t) => (
                <option key={t} value={t}>
                  {connectionType(t).label} {entry.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={!tie.record}>
              Tie it
            </button>
          </form>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              if (tie.event) act(timeline.forProject(projectId).update(tie.event, { locationId: entryId }).then(() => setTie({ ...tie, event: '' })), 'The event now takes place here.');
            }}
          >
            <select aria-label="Event that takes place here" value={tie.event} onChange={(e) => setTie({ ...tie, event: e.target.value })}>
              <option value="">An event that takes place here…</option>
              {[...model.events.values()]
                .filter((ev) => ev.locationId !== entryId)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
            </select>
            <button type="submit" className="btn" disabled={!tie.event}>
              Set
            </button>
          </form>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              if (tie.node) act(manuscript.forProject(projectId).updatePlan(tie.node, { entityIds: [...new Set([...(model.plans.get(tie.node)?.entityIds ?? []), entryId])] }).then(() => setTie({ ...tie, node: '' })), 'Added to the chapter’s plan.');
            }}
          >
            <select aria-label="Chapter or scene set here" value={tie.node} onChange={(e) => setTie({ ...tie, node: e.target.value })}>
              <option value="">A chapter or scene set here (its plan)…</option>
              {chapters.map((n) => (
                <option key={n.id} value={n.id}>
                  {nodeLabel(model, n.id)}
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={!tie.node}>
              Add
            </button>
          </form>
        </details>
      )}
      {maps.length > 0 && (
        <div className="stack tight place-coords">
          <strong className="small">On the maps</strong>
          {maps.map((m) => {
            const pin = pins.find((p) => p.mapId === m.id && p.entryId === entryId);
            return (
              <form
                key={`${m.id}:${pin?.x}:${pin?.y}`}
                className="place-coord"
                aria-label={`${entry.name} on ${m.name}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const [x, y] = [String(data.get('x') ?? '').trim(), String(data.get('y') ?? '').trim()];
                  if (!x || !y) return setMessage({ text: 'Give both coordinates.', error: true });
                  act(api.pin(m.id, entryId, Number(x), Number(y)), `Placed on ${m.name}.`);
                }}
              >
                <span className="small">
                  {m.name}
                  {pin ? '' : ': no coordinates'}
                </span>
                <input name="x" type="number" step="any" defaultValue={pin?.x ?? ''} aria-label={`${m.name}: across`} placeholder="across" disabled={!writes} />
                <input name="y" type="number" step="any" defaultValue={pin?.y ?? ''} aria-label={`${m.name}: down`} placeholder="down" disabled={!writes} />
                {writes && (
                  <>
                    <button type="submit" className="btn">
                      {pin ? 'Move' : 'Place'}
                    </button>
                    <button type="button" className="link" onClick={() => setParams({ pmap: m.id, pput: entryId, as: null })}>
                      by clicking the map
                    </button>
                    {pin && (
                      <button type="button" className="link" onClick={() => act(api.unpin(m.id, entryId), `Taken off ${m.name}.`)}>
                        Take it off
                      </button>
                    )}
                  </>
                )}
              </form>
            );
          })}
        </div>
      )}
      {message && (
        <p className={message.error ? 'error' : 'notice'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
