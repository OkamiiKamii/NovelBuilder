import { useLiveQuery } from 'dexie-react-hooks';
import { DecisionNote, useDecisions } from '@/modules/continuity/components/DecisionNote';
import { useState } from 'react';
import { places, travel } from '@/core';
import { useMe } from '@/modules/collab/identity';
import type { StoryModel } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { journeyRecord, routeOf, travelProblems, type RouteItem } from '@/modules/travel/routes';
import { JourneyForm, MethodsDialog } from '@/modules/travel/components/TravelForms';
import type { Journey } from '@/modules/travel/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ArrowMarker } from '@/modules/viz/components/Arrow';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { Legend } from '@/modules/viz/components/Legend';

/** The page address: whose journeys, and the map they are drawn on. */
export const JOURNEY_PARAMS = ['jwho', 'jmap'] as const;
export const journeyLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(JOURNEY_PARAMS.flatMap((p) => (params.get(p) ? [[p, params.get(p)!]] : [])));
/** One colour a traveller, in the views' shared palette's order (global.css), so they follow the light or dark theme. */
const COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)'];
const OTHER = 'var(--cat-other)';

interface JourneysViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
}

/**
 * JOURNEYS
 * Who travels from where to where, and when; each traveller's route and
 * where they were between journeys; drawn on a map where the places have
 * coordinates on it, and always listed in order. Possible conflicts are
 * flagged by stated rules, only when the records give enough to settle
 * them, and never changed.
 */
export function JourneysView({ model, projectId, params, setParams, mode, setMode }: JourneysViewProps) {
  const settings = useLiveQuery(() => travel.forProject(projectId).settings(), [projectId]);
  const journeys = useLiveQuery(() => travel.forProject(projectId).journeys(), [projectId]);
  const maps = useLiveQuery(() => places.forProject(projectId).maps(), [projectId]);
  const pins = useLiveQuery(() => places.forProject(projectId).pins(), [projectId]);
  const me = useMe(projectId);
  const decided = useDecisions(projectId);
  const [form, setForm] = useState<{ journey?: Journey } | null>(null);
  const [methods, setMethods] = useState(false);
  const [removing, setRemoving] = useState<Journey | null>(null);
  if (settings === undefined || !journeys || !maps || !pins) return <VizState status={{ kind: 'loading' }} />;
  const writes = can(me.role, 'write');
  const travellerIds = [...new Set(journeys.flatMap((j) => j.travellerIds))].filter((id) => model.entries.has(id)).sort((a, b) => model.entries.get(a)!.name.localeCompare(model.entries.get(b)!.name));
  const who = params.get('jwho') && model.entries.has(params.get('jwho')!) ? params.get('jwho')! : null;
  const theirs = who ? journeys.filter((j) => j.travellerIds.includes(who)) : journeys;
  const problems = travelProblems(model, journeys, settings, maps, pins).filter((p) => !who || p.journeyIds.length === 0 || p.journeyIds.some((id) => theirs.some((j) => j.id === id)) || p.message.startsWith(model.entries.get(who)!.name));
  const record = (j: Journey) => journeyRecord(model, j, settings, maps, pins);
  // In story order where dated, then as recorded: the order routes are numbered and listed in.
  const dated = (j: Journey) => {
    const r = record(j);
    return r.leaves?.axis === 'story' ? r.leaves.lo : r.arrives?.axis === 'story' ? r.arrives.lo : Infinity;
  };
  const inOrder = (list: Journey[]) => [...list].sort((a, b) => dated(a) - dated(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  // A map is offered when some journey shown has places with coordinates on it.
  const usable = maps.filter((m) => theirs.some((j) => [j.fromId, j.toId].every((id) => id && pins.some((p) => p.mapId === m.id && p.entryId === id))));
  const map = usable.find((m) => m.id === params.get('jmap')) ?? usable[0] ?? null;

  const toolbar = (
    <div className="viz-toolbar">
      <label className="field viz-who">
        <span>Whose journeys</span>
        <select aria-label="Whose journeys" value={who ?? ''} onChange={(e) => setParams({ jwho: e.target.value || null })}>
          <option value="">Everyone’s</option>
          {travellerIds.map((id) => (
            <option key={id} value={id}>
              {model.entries.get(id)!.name}
            </option>
          ))}
        </select>
      </label>
      {map && <ViewSwitch mode={mode} onChange={setMode} visualLabel="Map" />}
      {map && usable.length > 1 && mode === 'visual' && (
        <select aria-label="Map shown" value={map.id} onChange={(e) => setParams({ jmap: e.target.value })}>
          {usable.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
      {writes && (
        <span className="toolbar">
          <button type="button" className="btn" onClick={() => setForm({})}>
            Record a journey
          </button>
          <button type="button" className="btn ghost" onClick={() => setMethods(true)}>
            Travel methods…
          </button>
        </span>
      )}
    </div>
  );
  const dialogs = (
    <>
      {form && <JourneyForm model={model} settings={settings} journeys={journeys} initial={form.journey} defaultTraveller={who} onClose={() => setForm(null)} />}
      {methods && <MethodsDialog model={model} settings={settings} onClose={() => setMethods(false)} />}
      {removing && (
        <ConfirmDialog
          title="Delete this journey"
          confirmLabel="Delete the journey"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const gone = removing;
            setRemoving(null);
            void travel.forProject(projectId).removeJourney(gone.id);
          }}
        >
          <p>Delete the journey “{record(removing).words}”? The travellers, places and events are not changed.</p>
        </ConfirmDialog>
      )}
    </>
  );
  if (!journeys.length)
    return (
      <>
        {toolbar}
        <VizState status={{ kind: 'empty', message: 'No journeys yet. Record who travels from where to where, and when, as far as you know it.' }} />
        {dialogs}
      </>
    );

  const actions = (j: Journey) =>
    writes && (
      <span className="journey-actions">
        <button type="button" className="link" aria-label={`Edit the journey ${record(j).words}`} onClick={() => setForm({ journey: j })}>
          Edit
        </button>
        <button type="button" className="link" aria-label={`Delete the journey ${record(j).words}`} onClick={() => setRemoving(j)}>
          Delete
        </button>
      </span>
    );
  const line = (item: RouteItem) => {
    const j = item.journeyId ? journeys.find((x) => x.id === item.journeyId) : undefined;
    return (
      <li key={item.key} className={`route-${item.kind}`}>
        <span className="muted small">{item.when}</span> <strong>{item.title}</strong>
        {item.detail && <span className="muted small"> · {item.detail}</span>}
        {j && actions(j)}
      </li>
    );
  };
  const route = who ? routeOf(model, who, journeys, settings, maps, pins) : null;

  return (
    <>
      {toolbar}
      <section className="stack tight travel-problems" aria-label="Possible conflicts">
        <h3>Possible conflicts</h3>
        <p className="muted small">Flagged by stated rules, only when the records settle them: a journey too fast for its dates (with a speed you set, over a distance in the same unit), a duration its dates cannot hold, arriving before leaving, two journeys at once, an event elsewhere during a journey or a stay, being located in two places at once. An approximate date counts as all the time it may mean. Nothing is flagged from a time that is not known, from a chapter against an event, or from a speed you have not set.</p>
        {problems.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {problems.map((p) => (
              <li key={p.key} className={`thread issue${p.severity === 'note' ? ' reviewed' : ''}`}>
                <span className={`badge ${p.severity === 'problem' ? 'conn-disputed' : ''}`}>{p.severity === 'problem' ? 'Conflict' : 'Note'}</span> {p.message} <DecisionNote decision={decided.get(p.key)} projectId={projectId} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {mode === 'visual' && map && <RouteMap model={model} journeys={inOrder(theirs)} map={map} pins={pins} words={(j) => record(j).words} />}
      {route ? (
        <section className="stack tight" aria-label={`${model.entries.get(who!)!.name}’s route`}>
          <h3>{model.entries.get(who!)!.name}’s route</h3>
          {route.story.length > 0 && (
            <>
              <h4>In story time</h4>
              <ol className="viz-list route-list" aria-label="In story time">
                {route.story.map(line)}
              </ol>
            </>
          )}
          {route.reading.length > 0 && (
            <>
              <h4>As the reader meets them</h4>
              <ol className="viz-list route-list" aria-label="As the reader meets them">
                {route.reading.map(line)}
              </ol>
            </>
          )}
          {route.unknown.length > 0 && (
            <>
              <h4>When not known</h4>
              <ol className="viz-list route-list" aria-label="When not known">
                {route.unknown.map(line)}
              </ol>
            </>
          )}
        </section>
      ) : (
        <section className="stack tight" aria-label="Every journey">
          <h3>Every journey</h3>
          <ol className="viz-list route-list" aria-label="Every journey, those with a date first">
            {inOrder(journeys).map((j) => {
                const r = record(j);
                return (
                  <li key={j.id}>
                    <strong>{r.words}</strong> <span className="muted small">leaves {r.leavesWords}, arrives {r.arrivesWords}</span>
                    {actions(j)}
                  </li>
                );
              })}
          </ol>
        </section>
      )}
      {dialogs}
    </>
  );
}

/** Routes on a map: a line through each journey's places, numbered in order, one colour a traveller. What cannot be drawn on it is listed. */
function RouteMap({ model, journeys, map, pins, words }: { model: StoryModel; journeys: Journey[]; map: { id: string; name: string; width: number; height: number; image: string | null; unit: string }; pins: { mapId: string; entryId: string; x: number; y: number }[]; words: (j: Journey) => string }) {
  const S = 800 / Math.max(map.width, map.height);
  const at = (id: string | null) => {
    const pin = id ? pins.find((p) => p.mapId === map.id && p.entryId === id) : undefined;
    return pin ? { x: pin.x * S, y: pin.y * S } : null;
  };
  const travellers = [...new Set(journeys.flatMap((j) => j.travellerIds))];
  // Colours are never repeated: the first seven travellers have their own, and everyone after them shares the neutral.
  const colour = (j: Journey) => COLORS[Math.max(0, travellers.indexOf(j.travellerIds[0] ?? ''))] ?? OTHER;
  const drawable = journeys.filter((j) => [j.fromId, ...j.via, j.toId].every((id) => at(id)));
  const missing = journeys.filter((j) => !drawable.includes(j));
  const stops = [...new Set(drawable.flatMap((j) => [j.fromId!, ...j.via, j.toId!]))];
  return (
    <section className="stack tight route-map" aria-label={`Routes on ${map.name}`}>
      <Viewport label={`${map.name}: ${drawable.length} ${drawable.length === 1 ? 'journey' : 'journeys'} drawn. The list below gives every journey in words.`} bounds={{ minX: -20, minY: -20, maxX: map.width * S + 20, maxY: map.height * S + 20 }} of="the map">
        {(view) => (
          <>
            <defs>
              {[...COLORS, OTHER].map((c, i) => (
                <ArrowMarker key={c} id={`route-arrow-${i}`} color={c} />
              ))}
            </defs>
            {map.image ? <image href={map.image} x={0} y={0} width={map.width * S} height={map.height * S} preserveAspectRatio="none" /> : <rect x={0} y={0} width={map.width * S} height={map.height * S} className="pm-ground" />}
            <rect x={0} y={0} width={map.width * S} height={map.height * S} className="pm-edge" />
            {drawable.map((j, i) => {
              const points = [j.fromId, ...j.via, j.toId].map((id) => at(id)!);
              const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
              return (
                <g key={j.id} className="route-line" role="img" aria-label={`${i + 1}. ${words(j)}`}>
                  <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colour(j)} strokeWidth={3} markerEnd={`url(#route-arrow-${[...COLORS, OTHER].indexOf(colour(j))})`} />
                  <circle cx={mid.x} cy={mid.y} r={9 / Math.max(view.k, 0.6)} className="route-number" />
                  <text x={mid.x} y={mid.y} dy="0.35em" textAnchor="middle" className="route-number-text" style={{ fontSize: 11 / Math.max(view.k, 0.6) }}>
                    {i + 1}
                  </text>
                  <title>{`${i + 1}. ${words(j)}`}</title>
                </g>
              );
            })}
            {stops.map((id) => (
              <g key={id} className="pm-pin" transform={`translate(${at(id)!.x} ${at(id)!.y})`} aria-hidden="true">
                <circle r={6 / Math.max(view.k, 0.6)} />
                <text x={9 / Math.max(view.k, 0.6)} dy="0.35em" className="viz-label" style={{ fontSize: 12 / Math.max(view.k, 0.6) }}>
                  {model.entries.get(id)?.name}
                </text>
              </g>
            ))}
          </>
        )}
      </Viewport>
      <Legend
        title="What the routes show"
        items={[
          ...travellers.slice(0, COLORS.length).map((id, i) => ({ key: id, label: model.entries.get(id)?.name ?? 'Someone', color: COLORS[i], shape: 'line' as const })),
          ...(travellers.length > COLORS.length ? [{ key: 'others', label: `Everyone else (${travellers.length - COLORS.length})`, color: OTHER, shape: 'line' as const }] : []),
          { key: 'way', label: 'The way the journey goes', color: 'var(--text)', shape: 'arrow' },
          { key: 'number', label: 'Its number in the list below', color: 'var(--text)', shape: 'ring' },
          { key: 'stop', label: 'A place on the way', color: 'var(--accent)', shape: 'circle' },
        ]}
      />
      {missing.length > 0 && <p className="muted small">Not drawn on {map.name} (a place on the way has no coordinates on it): {missing.map(words).join('; ')}.</p>}
    </section>
  );
}
