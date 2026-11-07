import { useLiveQuery } from 'dexie-react-hooks';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExportDialog } from './ExportDialog';
import { Link, useParams } from 'react-router-dom';
import { db, histories, projects, savedViews, timeline } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { eventRecords } from '@/modules/model/events';
import { can } from '@/modules/sync/access';
import { TimelineChart } from '@/modules/timeline/components/TimelineChart';
import { TrackPanel } from '@/modules/timeline/components/TrackPanel';
import { TwoOrdersChart } from '@/modules/timeline/components/TwoOrdersChart';
import { EventDetails } from '@/modules/timeline/components/EventDetails';
import { resolveChronology } from '@/modules/timeline/chronology';
import { nodeLabel, orderSummary, orderWords, ordinal, tellingNotes, twoOrders, type Telling } from '@/modules/timeline/narrative';
import { REVEAL_CHOICES } from '@/modules/timeline/types';
import { RelationMap } from '@/modules/relationships/components/RelationMap';
import { relationNetwork, type Layer } from '@/modules/relationships/network';
import { networkAddress, networkLayout, readNetwork, type NetworkState } from '@/modules/relationships/networkParams';
import { AFFINITY_LABELS, RELATION_CATEGORIES, RELATION_CATEGORY_LABELS } from '@/modules/relationships/types';
import { Legend, type SwatchShape } from '@/modules/viz/components/Legend';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import { ageLabel } from '@/modules/timeline/ages';
import { HISTORY_STATUS_LABELS, lineage, withHistory, type AlternateHistory } from '@/modules/timeline/histories';
import type { Overlay, ShownHistory } from '@/modules/canon/overlay';
import { useCanonOverlay } from '@/modules/canon/useOverlay';
import { MARKED_VIEWS, MarkSection, MarksBar, MarkText } from './CanonMarks';
import { HISTORY_KINDS, lifeHistory, type HistoryItem } from '@/modules/characters/lifeHistory';
import { knowledgeLayout } from '@/modules/characters/knowledge';
import { KnowledgeView } from './KnowledgeView';
import { PlotView } from './PlotView';
import { StructureView } from './StructureView';
import { GraphView } from './GraphView';
import { graphLayout } from '@/modules/graph/knowledge';
import { AppearancesView } from './AppearancesView';
import { HolderEditor, KindsView } from './KindsView';
import { abilityLayout, AbilityPathDetails, AbilityPathsView } from './AbilityPathsView';
import { PlaceDetails, placeLayout, PlacesView } from './PlacesView';
import { journeyLayout, JourneysView } from './JourneysView';
import { factionLayout, FactionsView } from './FactionsView';
import { ownershipLayout, OwnershipView } from './OwnershipView';
import { ChartsView } from './ChartsView';
import { chartLayout } from '@/modules/analytics/charts';
import { kindLayout } from './kinds';
import { appearanceLayout } from '@/modules/characters/appearances';
import { structureLayout } from '@/modules/structure/pacing';
import { arrange, decodeGrouping, encodeGrouping, groupings, NO_PREFS, readTracks, trackAddress, trackLayout, tracksFor, type Grouping, type TrackPrefs } from '@/modules/timeline/tracks';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { useStoryModel } from '@/modules/model/hooks';
import { select, type Undecided } from '@/modules/model/query';
import type { EntityRef, EntityType, StoryModel } from '@/modules/model/types';
import { FilterBar } from '@/modules/viz/components/FilterBar';
import { ViewHeader } from '@/modules/viz/components/ViewHeader';
import { VizState } from '@/modules/viz/components/VizState';
import { useAddress } from '@/modules/viz/hooks';
import { VizLayout } from '@/modules/viz/components/DetailPanel';
import { relatedIds } from '@/modules/model/navigate';
import { activeFilters, decodeFilter, decodeSelection, encodeSelection, FILTER_PARAMS, viewModeOf } from '@/modules/viz/params';
import { RecordDetails } from './RecordDetails';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { openSaved, type ViewConfig } from './saved';
import { addressFor, SavedViewsBar, type Applied } from './SavedViewsBar';
import { progressionRows, timelineRows } from './summaries';
import { VIEWS, viewFor, type VisualView } from './views';
import { isViewOn, moduleOf, turnOn, viewLabel, viewsOn } from './modules';
import { useLinkAllowed } from './ViewLink';

/** The kind of record each view lists, for its filters. The graph summary is not a list of one kind, so filters do not narrow it. */
const LISTS: Record<string, EntityType | null> = { timeline: 'event', order: 'event', relationships: 'relation', plot: 'thread', graph: null, places: 'entry', progression: 'entry', history: null, knowledge: null, structure: null, appearances: null, kinds: 'entry', abilities: null, journeys: null, factions: null, ownership: null, charts: null };

/** What a view's filters leave in and could not decide about, and what is selected. */
interface Scope {
  filtered: boolean;
  keep: (id: string) => boolean;
  undecided: Undecided[];
  clear: () => void;
  selectedId: string | null;
  /** Directly connected to the selection: marked in every view. */
  related: (id: string) => boolean;
  pick: (ref: EntityRef) => void;
  /** Drawn or as a list, from the page address. */
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  /** The page address, for a view's own settings (the timeline's tracks). */
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  /** Canon and continuity markers, when they are on: what to mark on each record. */
  marks: Overlay | null;
}

/** A record's name in a list: selecting it shows its details; marked when selected, or connected to what is. */
function Pick({ target, label, scope }: { target: EntityRef; label: string; scope: Scope }) {
  const selected = scope.selectedId === target.id;
  return (
    <>
      <button type="button" className="link viz-pick" aria-pressed={selected} onClick={() => scope.pick(target)}>
        {label}
      </button>
      {selected ? <span className="badge viz-mark">Selected</span> : scope.related(target.id) && <span className="badge viz-mark">Connected to the selection</span>}
    </>
  );
}

const rowClass = (scope: Scope, id: string) => (scope.selectedId === id ? 'viz-row selected' : scope.related(id) ? 'viz-row related' : 'viz-row');

/**
 * VISUALIZE
 * One place for every view of the novel. Each view reads the project's own
 * records live, through the shared model, so it always shows this novel and
 * nothing is copied: change a record anywhere and every view follows. The
 * filters and the open saved view live in the page address.
 */
export function VisualizePage() {
  const project = useCurrentProject();
  // The views this novel has on (Optional Prompt D). With no view asked for, the first of them opens.
  const viewsOff = project.viewsOff ?? [];
  const shownViews = viewsOn(viewsOff);
  const askedView = useParams().view;
  const view = viewFor(askedView && VIEWS.some((v) => v.key === askedView) ? askedView : shownViews[0]?.key);
  const turnedOff = shownViews.length === 0 || !isViewOn(viewsOff, view.key);
  const stored = useStoryModel(project.id);
  const me = useMe(project.id);
  const base = `/project/${project.id}`;
  const { params, set } = useAddress();
  // The timeline view can show an alternate history instead of the main timeline: its events stand in, everything else is the novel's own records.
  const historyList = useLiveQuery(() => histories.forProject(project.id).list(), [project.id]);
  const historyMap = useMemo(() => new Map((historyList ?? []).map((h) => [h.id, h])), [historyList]);
  // An alternate history stands in for the main timeline's events where a view reads them by when they happen.
  const histId = ['timeline', 'factions', 'ownership'].includes(view.key) && historyMap.has(params.get('hist') ?? '') ? params.get('hist') : null;
  const model = useMemo(() => (stored ? withHistory(stored, historyMap, histId) : stored), [stored, historyMap, histId]);
  // Canon and continuity markers: on for the views that draw them, while the address says so.
  const marking = view.key in MARKED_VIEWS && params.get('marks') === '1';
  const shownHistory = useMemo<ShownHistory | null>(() => {
    const active = histId ? historyMap.get(histId) : undefined;
    if (!active) return null;
    const chain = lineage(historyMap, active.id);
    return { name: active.name, status: HISTORY_STATUS_LABELS[active.status], changed: new Set(chain.flatMap((h) => Object.keys(h.changed))), added: new Set(chain.flatMap((h) => h.added.map((e) => e.id))) };
  }, [historyMap, histId]);
  const overlay = useCanonOverlay(project.id, model, stored, marking, shownHistory);
  const [error, setError] = useState<string | null>(null);
  // Exporting: the view as shown, and (while the dialog is open on a drawn view) the same view as a list, out of sight, to read its records from.
  const [exporting, setExporting] = useState(false);
  const shownRef = useRef<HTMLDivElement>(null);
  const listedRef = useRef<HTMLDivElement>(null);
  const asked = useMemo(() => decodeFilter(params), [params]);
  const mode = viewModeOf(params);
  const savedId = params.get('saved');
  const saved = useLiveQuery(() => (savedId ? savedViews.forProject(project.id).get(savedId) : undefined), [project.id, savedId]);
  const clear = () => set(Object.fromEntries(FILTER_PARAMS.map((p) => [p, null])));
  // Whatever the address asks for (a saved view, a reload, a shared link), records deleted since are left out, and the page says how many.
  const opened = useMemo(() => (model ? openSaved(model, { filter: asked }) : { filter: asked, missing: [] }), [model, asked]);
  const filter = opened.filter;

  const type = LISTS[view.key];
  const result = useMemo(() => (model && type && activeFilters(filter) ? select(model, { ...filter, types: [type] }) : null), [model, filter, type]);
  const kept = useMemo(() => (result ? new Set(result.items.map((i) => i.ref.id)) : null), [result]);
  // The selection is in the address too, added to the history, so Back returns to what was selected before.
  const selected = decodeSelection(params.get('select'));
  const related = useMemo(() => (model && selected ? relatedIds(model, selected) : null), [model, selected?.type, selected?.id]);
  const pick = (ref: EntityRef | null) => set({ select: ref ? encodeSelection(ref) : null }, { push: true });
  const scope: Scope = { filtered: Boolean(result), keep: (id) => !kept || kept.has(id), undecided: result?.undecided ?? [], clear, selectedId: selected?.id ?? null, related: (id) => Boolean(related?.has(id)) && id !== selected?.id, pick, mode, setMode: (m) => set({ as: m === 'list' ? 'list' : null }), params, setParams: (changes) => set(changes), marks: marking ? overlay.overlay : null };
  // Moving to another view keeps the filters and the selection; a saved view belongs to its own view.
  const carried = new URLSearchParams(params);
  carried.delete('saved');
  const search = carried.toString() ? `?${carried}` : '';

  // The timeline's tracks are its layout: saved with a view, and put back when it is opened.
  const tracking = readTracks(params);
  const current: ViewConfig = { filter, mode, layers: [], scale: null, layout: view.key === 'timeline' ? trackLayout(tracking.grouping, tracking.prefs) : view.key === 'relationships' ? networkLayout(readNetwork(params)) : view.key === 'knowledge' ? knowledgeLayout(params) : view.key === 'structure' ? structureLayout(params) : view.key === 'appearances' ? appearanceLayout(params) : view.key === 'graph' ? graphLayout(params) : view.key === 'kinds' ? kindLayout(params) : view.key === 'abilities' ? abilityLayout(params) : view.key === 'places' ? placeLayout(params) : view.key === 'journeys' ? journeyLayout(params) : view.key === 'factions' ? factionLayout(params) : view.key === 'ownership' ? ownershipLayout(params) : view.key === 'charts' ? chartLayout(params) : {} };
  // The markers are saved with a view that can show them.
  if (marking) current.layout = { ...current.layout, marks: '1' };
  // A saved view opens without the records deleted since it was saved.
  const apply = (config: Applied, id: string | null) => set(addressFor({ ...config, filter: model ? openSaved(model, config).filter : config.filter }, id), { push: true });
  const missing = opened.missing.length;
  const characters = model ? [...model.entries.values()].filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name)) : [];
  // The view picker is one row that scrolls sideways: the open view is brought into it, without moving the page.
  const viewsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = viewsRef.current;
    const open = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && open) nav.scrollLeft = Math.max(0, open.offsetLeft - nav.offsetLeft - (nav.clientWidth - open.offsetWidth) / 2);
  }, [view.key]);

  return (
    <div className="page stack visualize">
      <ViewHeader title="Visualize" description="Every view of this novel, read from the records you keep on its other pages. Nothing here is a copy." />
      <nav ref={viewsRef} className="viz-views" aria-label="Views">
        {shownViews.map((v) => (
          <Link key={v.key} to={`${base}/visualize/${v.key}${search}`} className={`chip-toggle${v.key === view.key ? ' on' : ''}`} aria-current={v.key === view.key ? 'page' : undefined}>
            {v.label}
          </Link>
        ))}
      </nav>
      {turnedOff ? (
        <ViewTurnedOff projectId={project.id} viewKey={shownViews.length ? view.key : null} viewsOff={viewsOff} writes={can(me.role, 'write')} />
      ) : (
      <section className="stack viz-frame" aria-labelledby="viz-view-title">
        <div className="viz-view-head">
          <h2 id="viz-view-title">{view.label}</h2>
          <p className="muted small">{view.description}</p>
        </div>
        <div className="viz-toolbar-row">
          <FilterBar label="Filters" active={activeFilters(filter)} onClear={clear}>
            <input type="search" aria-label="Search by name" placeholder="Search by name" value={filter.text ?? ''} onChange={(e) => set({ q: e.target.value || null })} />
            <select aria-label="Involving character" value={filter.characters?.[0] ?? ''} onChange={(e) => set({ chars: e.target.value || null })}>
              <option value="">Any character</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FilterBar>
          <div className="viz-export-bar">
            <SavedViewsBar projectId={project.id} view={view.key} savedId={savedId} current={current} apply={apply} onError={(e) => setError(e instanceof Error ? e.message : String(e))} />
            {model && (
              <button type="button" className="btn ghost" onClick={() => setExporting(true)}>
                Export…
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {missing > 0 && (
          <p className="muted small" role="status">
            {missing === 1 ? '1 record' : `${missing} records`} this {saved ? 'saved view names' : 'view names'} no longer {missing === 1 ? 'exists' : 'exist'}; it shows the rest.
          </p>
        )}
        <VizLayout detail={model && selected ? <RecordDetails projectId={project.id} model={model} selected={selected} onSelect={pick} onClose={() => pick(null)} marks={marking ? <MarkSection mark={overlay.overlay?.get(`${selected.type}:${selected.id}`)} projectId={project.id} /> : null} destination={histId && selected.type === 'event' ? { to: `${base}/histories?history=${histId}`, label: 'Open in its alternate history' } : undefined} extra={view.key === 'timeline' && !histId && selected.type === 'event' && can(me.role, 'write') ? <EventEditor key={selected.id} model={model} eventId={selected.id} projectId={project.id} /> : view.key === 'relationships' && selected.type === 'entry' && model.entries.get(selected.id)?.category === 'character' ? <button type="button" className="btn" onClick={() => set(networkAddress({ ...readNetwork(params), focus: { id: selected.id, depth: readNetwork(params).focus?.depth ?? 1 } }))}>Focus the map on {model.entries.get(selected.id)!.name}</button> : view.key === 'graph' && selected.type !== 'relation' ? <button type="button" className="btn" onClick={() => set({ gfocus: `${selected.type}:${selected.id}` })}>Focus the graph on this</button> : view.key === 'kinds' && params.get('kshow') === 'ownership' && selected.type === 'entry' && can(me.role, 'write') ? <HolderEditor key={selected.id} model={model} projectId={project.id} entryId={selected.id} /> : view.key === 'abilities' && (selected.type === 'entry' || selected.type === 'ability') ? <AbilityPathDetails key={`${selected.type}:${selected.id}`} model={model} projectId={project.id} selected={selected} /> : view.key === 'places' && selected.type === 'entry' && model.entries.get(selected.id)?.category === 'location' ? <PlaceDetails key={selected.id} model={model} projectId={project.id} entryId={selected.id} setParams={(changes) => set(changes)} /> : null} /> : null}>
          {model && view.key in MARKED_VIEWS && <MarksBar view={view.key} on={marking} onChange={(on) => set({ marks: on ? '1' : null })} state={overlay} model={model} projectId={project.id} pick={pick} />}
          <div ref={shownRef} className="viz-export-root">
            {model === undefined ? <VizState status={{ kind: 'loading' }} /> : model === null ? <VizState status={{ kind: 'error', message: 'this novel could not be found.' }} /> : <Panel view={view} model={model} projectId={project.id} scope={scope} histories={historyList ?? []} histId={histId} />}
          </div>
          {exporting && model && mode === 'visual' && (
            <div ref={listedRef} hidden>
              <Panel view={view} model={model} projectId={project.id} scope={{ ...scope, mode: 'list', setMode: () => {}, pick: () => {}, setParams: () => {} }} histories={historyList ?? []} histId={histId} />
            </div>
          )}
          {exporting && model && <ExportDialog view={view} model={model} params={params} mode={mode} shown={() => shownRef.current} listed={() => (mode === 'visual' ? listedRef.current : shownRef.current)} keep={scope.keep} name={(id) => historyMap.get(id)?.name ?? null} privileged={can(me.role, 'write')} onClose={() => setExporting(false)} />}
          <p className="muted small">
            To add or change these records, open <Link to={`${base}/${view.page}`}>{view.pageLabel}</Link>.
          </p>
        </VizLayout>
      </section>
      )}
    </div>
  );
}

/**
 * A view this novel has turned off, opened by its address (an old link, a
 * bookmark): it says so, keeps every record, and can be turned on again
 * here, with any view it needs. With every view off, it says that.
 */
function ViewTurnedOff({ projectId, viewKey, viewsOff, writes }: { projectId: string; viewKey: string | null; viewsOff: string[]; writes: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const manager = <Link to={`/project/${projectId}/modules#views`}>Views in the Module Manager</Link>;
  if (!viewKey) {
    return (
      <section className="panel stack viz-off" aria-labelledby="viz-view-title">
        <h2 id="viz-view-title">Every view is turned off</h2>
        <p>This novel has turned off every view of the Visualize page. Nothing was deleted: the records are kept on their own pages, and each view comes back as it was when it is turned on.</p>
        <p className="small">Turn views on under {manager}.</p>
      </section>
    );
  }
  const module = moduleOf(viewKey);
  const plan = turnOn(viewsOff, viewKey);
  return (
    <section className="panel stack viz-off" aria-labelledby="viz-view-title">
      <h2 id="viz-view-title">{viewLabel(viewKey)} is turned off</h2>
      <p>This novel has turned the {viewLabel(viewKey)} view off. Nothing of it was deleted: the records it shows are kept on their own pages, and the checks that read them still run. Turning it on brings it back as it was, saved views included.</p>
      {module?.editsHere && <p className="small">Its {module.editsHere} are made only in this view: they are kept, and can be changed again once it is on.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions start wrap">
        {writes ? (
          <button type="button" className="btn primary" onClick={() => void projects.setViewsOff(projectId, plan.off).catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
            Turn the {viewLabel(viewKey)} view on{plan.alsoOn.length ? ` (with ${plan.alsoOn.map(viewLabel).join(', ')}, which it needs)` : ''}
          </button>
        ) : (
          <p className="muted small">Someone who can edit this novel can turn it on.</p>
        )}
      </div>
      <p className="small">Or see every view, and what each needs, under {manager}.</p>
    </section>
  );
}

/**
 * Editing an event from the drawn timeline: the Timeline page's own editor,
 * saving through the same timeline service, so a change made here is the
 * same change made there, checked the same way.
 */
function EventEditor({ model, eventId, projectId }: { model: StoryModel; eventId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placed = useMemo(() => resolveChronology([...model.events.values()], model.calendar), [model]);
  const here = placed.find((p) => p.event.id === eventId);
  if (!here) return null;
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Edit this event here
      </button>
    );
  }
  return (
    <section className="stack viz-editor" aria-label={`Editing “${here.event.name}”`}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <EventDetails placed={here} all={placed} entries={[...model.entries.values()]} nodes={[...model.nodes.values()]} api={timeline.forProject(projectId)} projectId={projectId} calendar={model.calendar} onClose={() => setOpen(false)} onError={(e) => setError(e instanceof Error ? e.message : String(e))} />
    </section>
  );
}

function Panel({ view, model, projectId, scope, histories, histId }: { view: VisualView; model: StoryModel; projectId: string; scope: Scope; histories: AlternateHistory[]; histId: string | null }) {
  switch (view.key) {
    case 'relationships':
      return <Relationships model={model} scope={scope} />;
    case 'plot':
      return <PlotView model={model} projectId={projectId} marks={scope.marks} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} keep={scope.keep} undecided={scope.undecided} clear={scope.clear} />;
    case 'charts':
      return <ChartsView model={model} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} />;
    case 'graph':
      return <GraphView model={model} marks={scope.marks} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} />;
    case 'places':
      return <Places model={model} scope={scope} projectId={projectId} />;
    case 'progression':
      return <Progression model={model} projectId={projectId} scope={scope} />;
    case 'order':
      return <Orders model={model} scope={scope} projectId={projectId} />;
    case 'history':
      return <History model={model} scope={scope} projectId={projectId} />;
    case 'structure':
      return <StructureView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} />;
    case 'appearances':
      return <AppearancesView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} clear={scope.clear} />;
    case 'factions':
    case 'ownership': {
      const shown = histId ? (histories.find((h) => h.id === histId)?.name ?? null) : null;
      const picker = histories.length > 0 && (
        <label className="field viz-who">
          <span>Timeline shown</span>
          <select aria-label="Timeline shown" value={histId ?? ''} onChange={(e) => scope.setParams({ hist: e.target.value || null })}>
            <option value="">The main timeline (canon)</option>
            {histories.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      );
      return (
        <>
          {picker}
          {view.key === 'factions' ? <FactionsView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} history={shown} /> : <OwnershipView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} history={shown} />}
        </>
      );
    }
    case 'journeys':
      return <JourneysView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} />;
    case 'abilities':
      return <AbilityPathsView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} />;
    case 'kinds':
      return <KindsView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} keep={scope.keep} undecided={scope.undecided} clear={scope.clear} />;
    case 'knowledge':
      return <KnowledgeView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} />;
    default:
      return <Timeline model={model} scope={scope} projectId={projectId} histories={histories} histId={histId} />;
  }
}

const empty = (message: string, action?: ReactNode) => <VizState status={{ kind: 'empty', message, action }} />;

/**
 * The same three cases for every list: nothing recorded yet (an empty state
 * that says where to add some), nothing matching the filters (with a way to
 * clear them), or the list, followed by what the filters could not decide on.
 */
function shown<T extends { id: string }>(rows: T[], scope: Scope, emptyMessage: string, render: (rows: T[]) => ReactNode, action?: ReactNode) {
  if (!rows.length) return empty(emptyMessage, action);
  const kept = rows.filter((r) => scope.keep(r.id));
  if (!kept.length) return <VizState status={{ kind: 'no-results', onClearFilters: scope.clear }} undecided={scope.undecided} />;
  return (
    <VizState status={{ kind: 'ready' }} undecided={scope.undecided}>
      {render(kept)}
    </VizState>
  );
}

/**
 * The timeline: drawn along story time, or as a list in the same order. A
 * new event is made in the timeline's own records, so the Timeline page and
 * every other view have it at once, and it opens here selected.
 */
function Timeline({ model, scope, projectId, histories, histId }: { model: StoryModel; scope: Scope; projectId: string; histories: AlternateHistory[]; histId: string | null }) {
  const active = histories.find((h) => h.id === histId) ?? null;
  const me = useMe(projectId);
  const [failed, setFailed] = useState<string | null>(null);
  const add = can(me.role, 'write') ? (
    <button type="button" className="btn" onClick={() => void timeline.forProject(projectId).create().then((e) => scope.pick({ type: 'event', id: e.id }), (e) => setFailed(e instanceof Error ? e.message : String(e)))}>
      + Add event
    </button>
  ) : null;
  const records = eventRecords(model);
  const { grouping, prefs } = readTracks(scope.params);
  const setTracks = (g: Grouping, p: TrackPrefs) => scope.setParams(trackAddress(g, p));
  const item = (r: ReturnType<typeof timelineRows>[number]) => (
    <li key={r.id} className={rowClass(scope, r.id)}>
      <strong>
        <Pick target={{ type: 'event', id: r.id }} label={r.title} scope={scope} />
      </strong>{' '}
      <span className="muted">{r.when}</span>
      <div className="muted small">{r.told.length ? `Told in ${r.told.join(', ')}` : 'Not told in any chapter yet'}</div>
      {scope.marks && <MarkText mark={scope.marks.get(`event:${r.id}`)} />}
    </li>
  );
  return (
    <>
      <div className="viz-toolbar">
        <ViewSwitch mode={scope.mode} onChange={scope.setMode} visualLabel="Timeline" />
        {records.length > 0 && !active && add}
        {histories.length > 0 && (
          <label className="field viz-who">
            <span>Timeline shown</span>
            <select aria-label="Timeline shown" value={histId ?? ''} onChange={(e) => scope.setParams({ hist: e.target.value || null })}>
              <option value="">The main timeline (canon)</option>
              {histories.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({HISTORY_STATUS_LABELS[h.status]})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {active && (
        <p className="notice history-shown" role="status">
          <span>
            Showing the alternate history “{active.name}” ({HISTORY_STATUS_LABELS[active.status]}), not the main timeline. The main timeline and its events are unchanged. <Link to={`/project/${projectId}/histories?history=${active.id}`}>Open it in Alternate histories</Link>
          </span>
        </p>
      )}
      {failed && (
        <p className="error" role="alert">
          {failed}
        </p>
      )}
      {shown(
        timelineRows(model),
        scope,
        'No events yet. Add one here or on the Timeline page, and it appears in the order it happens.',
        (rows) => {
          // Tracks are made from the events the filters leave, so the two work together.
          const kept = records.filter((r) => rows.some((row) => row.id === r.id));
          const all = tracksFor(model, kept, grouping);
          const { shown: tracks } = arrange(all, prefs);
          const panel = <TrackPanel grouping={encodeGrouping(grouping)} options={groupings(model)} onGrouping={(value) => setTracks(decodeGrouping(value), NO_PREFS)} tracks={all} prefs={prefs} onPrefs={(p) => setTracks(grouping, p)} />;
          if (grouping.kind !== 'none' && all.length > 0 && tracks.length === 0) {
            return (
              <>
                {panel}
                {empty(
                  'Every track is hidden, so there is nothing to show.',
                  <button type="button" className="btn" onClick={() => setTracks(grouping, { ...prefs, hidden: [], focus: null })}>
                    Show all tracks
                  </button>,
                )}
              </>
            );
          }
          if (scope.mode === 'visual') {
            return (
              <>
                {panel}
                <TimelineChart events={kept} calendar={model.calendar} tracks={grouping.kind === 'none' ? null : tracks} selectedId={scope.selectedId} isRelated={scope.related} onSelect={(id) => scope.pick({ type: 'event', id })} marks={scope.marks ? (id) => scope.marks!.get(`event:${id}`) : undefined} />
              </>
            );
          }
          if (grouping.kind === 'none') {
            return (
              <>
                {panel}
                <ol className="viz-list" aria-label="Events in story order">
                  {rows.map(item)}
                </ol>
              </>
            );
          }
          // As a list, each track is a heading with its events in story order; an event on two tracks is listed under both.
          return (
            <>
              {panel}
              {tracks.map((track) => (
                <section key={track.id} className="tl-list-track" aria-label={`${track.label} track`}>
                  <h3>{track.label}</h3>
                  {track.folded ? (
                    <p className="muted small">Folded: {track.eventIds.length} {track.eventIds.length === 1 ? 'event' : 'events'}.</p>
                  ) : (
                    <ol className="viz-list" aria-label={`Events on the ${track.label} track, in story order`}>
                      {rows.filter((r) => track.eventIds.includes(r.id)).map(item)}
                    </ol>
                  )}
                </section>
              ))}
            </>
          );
        },
        add,
      )}
    </>
  );
}

/**
 * Story order beside reading order. Drawn: chapters on one side, events on
 * the other, a line for each telling. As a list: every telling as the reader
 * meets it, then every event as it happens. Read only: chapters and events
 * are never moved from here; how a chapter tells an event is set on the
 * Timeline page.
 */
function Orders({ model, scope, projectId }: { model: StoryModel; scope: Scope; projectId: string }) {
  const all = twoOrders(model);
  const name = (id: string) => model.events.get(id)?.name ?? 'A deleted event';
  return (
    <>
      <div className="viz-toolbar">
        <ViewSwitch mode={scope.mode} onChange={scope.setMode} visualLabel="Side by side" />
      </div>
      {shown(all.events, scope, 'No events yet. Add events on the Timeline page and link them to the chapters that tell them, and both orders appear here.', (kept) => {
        // The filters narrow the events; the chapters shown are those that tell one of them.
        const ids = new Set(kept.map((e) => e.id));
        const tellings = all.tellings.filter((t) => ids.has(t.eventId));
        const nodes = all.nodes.map((n) => ({ ...n, tellings: n.tellings.filter((t) => ids.has(t.eventId)) })).filter((n) => n.tellings.length);
        const orders = { ...all, events: kept, nodes, tellings, linear: tellings.every((t) => !t.back && !t.ahead) };
        const notes = tellingNotes(orders, model);
        const where = (t: Telling) => <Pick target={{ type: 'node', id: t.nodeId }} label={nodeLabel(model, t.nodeId)} scope={scope} />;
        return (
          <div className="stack">
            <p role="status">{orderSummary(orders)}</p>
            {notes.length > 0 && (
              <section aria-label="Worth a look">
                <h3>Worth a look</h3>
                <p className="muted small">Where how a chapter tells an event and where the event falls do not seem to agree. Suggestions only: nothing is changed. Set how a chapter tells it on the <Link to={`/project/${projectId}/timeline`}>Timeline</Link> page.</p>
                <ul className="order-notes small">
                  {notes.map((n) => (
                    <li key={`${n.telling.nodeId}:${n.telling.eventId}`}>{n.note}</li>
                  ))}
                </ul>
              </section>
            )}
            {scope.mode === 'visual' ? (
              <TwoOrdersChart nodes={nodes} events={kept} tellings={tellings} eventName={name} nodeName={(id) => nodeLabel(model, id)} selectedId={scope.selectedId} isRelated={scope.related} onSelect={scope.pick} />
            ) : (
              <>
                <h3>As the reader meets it</h3>
                {tellings.length === 0 ? (
                  <p className="muted">No chapter or scene tells these events yet.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="sessions" aria-label="Every telling, in reading order">
                      <thead>
                        <tr>
                          <th scope="col">Chapter or scene</th>
                          <th scope="col">Event</th>
                          <th scope="col">How</th>
                          <th scope="col">When it happens</th>
                          <th scope="col">In story order</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tellings.map((t) => {
                          const event = kept.find((e) => e.id === t.eventId)!;
                          return (
                            <tr key={`${t.nodeId}:${t.eventId}`} className={rowClass(scope, t.eventId)}>
                              <td>{where(t)}</td>
                              <td>
                                <Pick target={{ type: 'event', id: t.eventId }} label={event.title} scope={scope} />
                              </td>
                              <td>{REVEAL_CHOICES[t.role]}</td>
                              <td>{event.when}</td>
                              <td>{t.storyRank === null ? 'Not placed in time' : `${ordinal(t.storyRank + 1)} · ${orderWords(t)}`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <h3>As it happens</h3>
                <ol className="viz-list" aria-label="Events in story order, with where the reader meets them">
                  {kept.map((e) => (
                    <li key={e.id} className={rowClass(scope, e.id)}>
                      <strong>
                        <Pick target={{ type: 'event', id: e.id }} label={e.title} scope={scope} />
                      </strong>{' '}
                      <span className="muted">{e.storyRank === null ? 'Not placed in time' : e.when}</span>
                      <div className="muted small">{e.tellings.length ? `The reader meets it in ${e.tellings.map((t) => `${nodeLabel(model, t.nodeId)}${t.role === 'told' ? '' : ` (${REVEAL_CHOICES[t.role].toLowerCase()})`}`).join(', ')}` : 'Not told in any chapter yet'}</div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * One character's life history, gathered from every record that mentions
 * them. Each line is the record itself, to select here or open where it is
 * kept; ages are worked out as exactly as the dates allow. Chosen by
 * "Whose history", or by selecting a character in any view.
 */
function History({ model, scope, projectId }: { model: StoryModel; scope: Scope; projectId: string }) {
  const allowed = useLinkAllowed();
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).toArray(), [projectId]);
  const milestones = useLiveQuery(() => db.characterHistory.where('projectId').equals(projectId).filter((h) => h.kind === 'story').toArray(), [projectId]);
  const people = [...model.entries.values()].filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name));
  if (!people.length) return empty('No characters yet. Make one on the Characters page, and their history gathers here from everything recorded about them.');
  const asked = scope.params.get('who');
  const chosen = scope.selectedId && model.entries.get(scope.selectedId)?.category === 'character' ? scope.selectedId : null;
  const who = asked && model.entries.get(asked)?.category === 'character' ? asked : chosen;
  const picker = (
    <label className="field viz-who">
      <span>Whose history</span>
      <select aria-label="Whose history" value={who ?? ''} onChange={(e) => scope.setParams({ who: e.target.value || null })}>
        <option value="">Choose a character…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (!who) return (
    <>
      {picker}
      {empty('Choose a character to see their life history.')}
    </>
  );
  if (!snapshots || !milestones) return <VizState status={{ kind: 'loading' }} />;
  const history = lifeHistory(model, who, { snapshots, milestones })!;
  const line = (item: HistoryItem) => {
    const age = item.age ? ageLabel(item.age) : '';
    return (
      <li key={item.key} className={item.ref ? rowClass(scope, item.ref.id) : 'viz-row'}>
        <span className="muted small history-when">{item.when}</span>{' '}
        {item.ref ? (
          <Pick target={item.ref} label={item.title} scope={scope} />
        ) : (
          (() => {
            const to = item.to?.page === 'progression' ? `/project/${projectId}/progression?entry=${who}&snap=${item.to.id}` : item.to?.page === 'tracker' ? `/project/${projectId}/characters/${who}/progression` : item.to?.page === 'journeys' ? `/project/${projectId}/visualize/journeys?jwho=${who}` : `/project/${projectId}/characters/${who}/history`;
            // A journey opens in the Journeys view: while that view is off, its line is said, not linked.
            return allowed(to) ? <Link to={to}>{item.title}</Link> : <span>{item.title}</span>;
          })()
        )}{' '}
        <span className="badge">{HISTORY_KINDS[item.kind]}</span>
        {age && <strong className="history-age"> {age}</strong>}
        {item.age?.kind === 'unknown' && (
          <span className="muted small" title={`Age unknown: ${item.age.reason}`}>
            {' '}
            · age unknown
          </span>
        )}
        {item.detail && <span className="muted small"> · {item.detail}</span>}
      </li>
    );
  };
  const part = (title: string, intro: string, items: HistoryItem[], none: string) => (
    <section className="stack" aria-label={title}>
      <h3>{title}</h3>
      <p className="muted small">{intro}</p>
      {items.length ? <ol className="viz-list history-list">{items.map(line)}</ol> : <p className="muted">{none}</p>}
    </section>
  );
  return (
    <div className="stack">
      {picker}
      <div>
        <h3>{history.name}</h3>
        <p>{history.born}</p>
      </div>
      {history.issues.length > 0 && (
        <section aria-label="Worth a look">
          <h3>Worth a look</h3>
          <p className="muted small">Things the records do not agree on. Nothing is changed: correct the record where it is kept.</p>
          <ul className="order-notes small">
            {history.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
      {part('In story time', 'In the order things happen in the story, with their age at each event and where they were. Ages are as exact as the dates allow: 25–26 means the dates cannot say which.', history.story, 'No dated events or ties yet.')}
      {part('As the reader meets them', 'In reading order: the chapters they appear in, how their relationships change, how they progress, and the milestones on their profile.', history.reading, 'Nothing tied to a chapter yet.')}
      {part('Throughout', 'Ties with no time given, and the abilities on their sheet.', history.throughout, 'Nothing else recorded.')}
    </div>
  );
}

/**
 * The map's layers, each a checkbox. They live in the page address, which
 * updates a moment after a click: each box shows its change at once (so it
 * never flicks back) and follows the address when it changes another way.
 */
function LayerChecks({ hidden, isolated, focused, onChange }: { hidden: Layer[]; isolated: boolean; focused: boolean; onChange: (hidden: Layer[], isolated: boolean) => void }) {
  const key = JSON.stringify([hidden, isolated]);
  const [local, setLocal] = useState({ from: key, hidden, isolated });
  if (local.from !== key) setLocal({ from: key, hidden, isolated });
  const now = local.from === key ? local : { hidden, isolated };
  const change = (next: Layer[], all: boolean) => {
    setLocal({ from: key, hidden: next, isolated: all });
    onChange(next, all);
  };
  const box = (layer: Layer, label: string) => (
    <label key={layer} className="check wrap">
      <input type="checkbox" checked={!now.hidden.includes(layer)} onChange={(e) => change(e.target.checked ? now.hidden.filter((l) => l !== layer) : [...now.hidden, layer], now.isolated)} /> {label}
    </label>
  );
  return (
    <div className="rel-layers" role="group" aria-label="Layers">
      {RELATION_CATEGORIES.map((c) => box(c, RELATION_CATEGORY_LABELS[c]))}
      {box('connection', 'Other connections')}
      {box('labels', 'Labels on the lines')}
      <label className="check wrap">
        <input type="checkbox" checked={now.isolated} disabled={focused} onChange={(e) => change(now.hidden, e.target.checked)} /> Characters with no ties shown
      </label>
    </div>
  );
}

/** How each relationship group's line is drawn: a pattern of its own, named in the legend, so no group is told by colour alone. */
const GROUP_LINES: Record<string, { label: string; shape: SwatchShape }> = {
  family: { label: 'Family', shape: 'line' },
  social: { label: 'Social (friends, allies, rivals, enemies)', shape: 'longdash' },
  mentorship: { label: 'Mentorship', shape: 'dotted' },
  romance: { label: 'Romance', shape: 'dashdot' },
  hierarchy: { label: 'Work and rank (employment, rule, politics)', shape: 'dashed' },
  custom: { label: 'Custom', shape: 'double' },
  connection: { label: 'Other connections (distrusts, considers a rival…)', shape: 'thin' },
};

/**
 * The relationship map: every character and relationship, drawn as a
 * network or read as a table, narrowed by when (now, as of a chapter, across
 * chapters, the whole history), by type, by faction, by the page's own
 * filters, and to one character's neighbourhood; with layers to hide. All of
 * it lives in the page address, and nothing is changed by looking.
 */
function Relationships({ model, scope }: { model: StoryModel; scope: Scope }) {
  const state = readNetwork(scope.params);
  const set = (changes: Partial<NetworkState>) => scope.setParams(networkAddress({ ...state, ...changes }));
  const network = relationNetwork(model, { ...state, keep: scope.filtered ? scope.keep : undefined });
  const selected = decodeSelection(scope.params.get('select'));
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone deleted';
  const characters = [...model.entries.values()].filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name));
  const factions = [...model.entries.values()].filter((e) => e.category === 'faction').sort((a, b) => a.name.localeCompare(b.name));
  const chapters = flatten(buildTree([...model.nodes.values()])).filter((t) => t.node.kind === 'chapter');
  const types = new Map<string, string>();
  for (const r of model.relations.values()) for (const s of r.stages) types.set(s.preset, s.preset === 'custom' ? 'Custom' : s.label || 'Related');
  const hidden = new Set(state.hidden);
  const anything = model.relations.size > 0 || [...model.links].some((l) => l.type && model.entries.get(l.fromId)?.category === 'character' && model.entries.get(l.toId)?.category === 'character');
  if (!anything) return empty('No relationships yet. Link two characters on the Relationships page, and the map draws them.');
  const relationshipsShown = network.edges.filter((e) => e.kind === 'relationship').length;
  const chapterOptions = chapters.map(({ node }) => (
    <option key={node.id} value={node.id}>
      {model.order.chapterNumber.get(node.id)}. {node.title || 'Untitled chapter'}
    </option>
  ));

  return (
    <div className="stack">
      <div className="viz-toolbar">
        <ViewSwitch mode={scope.mode} onChange={scope.setMode} visualLabel="Map" />
      </div>
      <fieldset className="plan-group rel-filters">
        <legend>Which relationships</legend>
        <div className="rel-filter-grid">
          <label className="field">
            <span>When</span>
            <select value={state.when.kind} aria-label="Relationships as they stand" onChange={(e) => set({ when: e.target.value === 'at' ? { kind: 'at', nodeId: chapters[0]?.node.id ?? '' } : e.target.value === 'range' ? { kind: 'range', from: null, to: null } : e.target.value === 'ever' ? { kind: 'ever' } : { kind: 'current' } })}>
              <option value="current">Now: at the end of the story so far</option>
              {chapters.length > 0 && <option value="at">As of a chapter</option>}
              {chapters.length > 0 && <option value="range">Across chapters</option>}
              <option value="ever">At any time in their history</option>
            </select>
          </label>
          {state.when.kind === 'at' && (
            <label className="field">
              <span>As of</span>
              <select value={state.when.nodeId} aria-label="As of chapter" onChange={(e) => set({ when: { kind: 'at', nodeId: e.target.value } })}>
                {chapterOptions}
              </select>
            </label>
          )}
          {state.when.kind === 'range' && (
            <>
              <label className="field">
                <span>From</span>
                <select value={state.when.from ?? ''} aria-label="From chapter" onChange={(e) => set({ when: { kind: 'range', from: e.target.value || null, to: state.when.kind === 'range' ? state.when.to : null } })}>
                  <option value="">The start</option>
                  {chapterOptions}
                </select>
              </label>
              <label className="field">
                <span>To</span>
                <select value={state.when.to ?? ''} aria-label="To chapter" onChange={(e) => set({ when: { kind: 'range', from: state.when.kind === 'range' ? state.when.from : null, to: e.target.value || null } })}>
                  <option value="">The end</option>
                  {chapterOptions}
                </select>
              </label>
            </>
          )}
          <label className="field">
            <span>Type</span>
            <select value={state.type ?? ''} aria-label="Relationship type shown" onChange={(e) => set({ type: e.target.value || null })}>
              <option value="">Every type</option>
              {[...types].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {factions.length > 0 && (
            <label className="field">
              <span>Faction</span>
              <select value={state.factionId ?? ''} aria-label="Faction" onChange={(e) => set({ factionId: e.target.value || null })}>
                <option value="">Any faction, or none</option>
                {factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Focus on</span>
            <select value={state.focus?.id ?? ''} aria-label="Focus on character" onChange={(e) => set({ focus: e.target.value ? { id: e.target.value, depth: state.focus?.depth ?? 1 } : null })}>
              <option value="">Everyone</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {state.focus && (
            <label className="field">
              <span>Reach</span>
              <select value={state.focus.depth} aria-label="Steps out from the focus" onChange={(e) => set({ focus: { id: state.focus!.id, depth: e.target.value === '2' ? 2 : 1 } })}>
                <option value="1">Their own ties</option>
                <option value="2">And their ties’ ties</option>
              </select>
            </label>
          )}
        </div>
        <LayerChecks hidden={state.hidden} isolated={state.isolated} focused={Boolean(state.focus)} onChange={(next, isolated) => set({ hidden: next, isolated })} />
      </fieldset>
      <p role="status" className="small">
        Showing {network.nodes.length} {network.nodes.length === 1 ? 'character' : 'characters'} and {relationshipsShown} of {network.total} {network.total === 1 ? 'relationship' : 'relationships'}
        {network.edges.length > relationshipsShown && `, with ${network.edges.length - relationshipsShown} other ${network.edges.length - relationshipsShown === 1 ? 'connection' : 'connections'}`}
        {state.focus && ` around ${name(state.focus.id)}`}.
      </p>
      {network.edges.length === 0 && network.nodes.length <= 1 ? (
        <VizState status={{ kind: 'no-results', onClearFilters: () => (scope.setParams(networkAddress({ when: { kind: 'current' }, type: null, factionId: null, focus: null, hidden: [], isolated: false })), scope.clear()) }} />
      ) : scope.mode === 'visual' ? (
        <>
          <RelationMap network={network} labels={!hidden.has('labels')} selected={selected} onSelect={scope.pick} onFocus={(id) => set({ focus: { id, depth: state.focus?.depth ?? 1 } })} marks={scope.marks ? (key) => scope.marks!.get(key) : undefined} />
          <Legend title="What the lines mean" items={[...RELATION_CATEGORIES, 'connection'].filter((c) => !hidden.has(c as Layer)).map((c) => ({ key: c, label: GROUP_LINES[c].label, color: `var(--rel-${c})`, shape: GROUP_LINES[c].shape }))} />
          <p className="muted small">An arrow points from the first role to the second (Mentor → Student). Bigger circles have more ties. Selecting a character lights up their ties and dims the rest; drag a character to move them.</p>
        </>
      ) : (
        <div className="table-scroll">
          <table className="sessions" aria-label="Relationships and connections shown">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">How</th>
                <th scope="col">To</th>
                <th scope="col">Feeling</th>
                <th scope="col">Applies</th>
                {scope.marks && <th scope="col">Canon and checks</th>}
              </tr>
            </thead>
            <tbody>
              {[...network.edges].sort((a, b) => name(a.from).localeCompare(name(b.from)) || name(a.to).localeCompare(name(b.to))).map((e) => (
                <tr key={e.id} className={rowClass(scope, e.id)}>
                  <td>
                    <Pick target={{ type: 'entry', id: e.from }} label={name(e.from)} scope={scope} />
                    {e.directed && e.fromRole && <span className="muted small"> ({e.fromRole})</span>}
                  </td>
                  <td>{e.kind === 'relationship' ? <Pick target={{ type: 'relation', id: e.id }} label={`${e.label}${e.directed ? ' →' : ''}`} scope={scope} /> : `${e.label} (a connection)`}</td>
                  <td>
                    <Pick target={{ type: 'entry', id: e.to }} label={name(e.to)} scope={scope} />
                    {e.directed && e.toRole && <span className="muted small"> ({e.toRole})</span>}
                  </td>
                  <td>{e.affinity ? AFFINITY_LABELS[e.affinity] : '—'}</td>
                  <td>{e.range || '—'}</td>
                  {scope.marks && <td>{markedEdge(scope.marks, e) ? <MarkText mark={markedEdge(scope.marks, e)} /> : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A line's marks: a relationship's own, or a stored connection's. */
const markedEdge = (marks: Overlay, e: { id: string; kind: 'relationship' | 'connection' }) => marks.get(e.kind === 'relationship' ? `relation:${e.id}` : e.id);

function Places({ model, scope, projectId }: { model: StoryModel; scope: Scope; projectId: string }) {
  return <PlacesView model={model} projectId={projectId} params={scope.params} setParams={scope.setParams} mode={scope.mode} setMode={scope.setMode} pick={scope.pick} selectedId={scope.selectedId} related={scope.related} keep={scope.keep} filtered={scope.filtered} undecided={scope.undecided} clear={scope.clear} />;
}

function Progression({ model, projectId, scope }: { model: StoryModel; projectId: string; scope: Scope }) {
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).toArray(), [projectId]);
  if (snapshots === undefined) return <VizState status={{ kind: 'loading' }} />;
  return shown(progressionRows(model, snapshots), scope, 'Nobody’s progression is recorded yet. Record a change on a character’s Progression tab, give them a system sheet, or log a snapshot of their state.', (rows) => (
    <div className="table-scroll">
      <table className="sessions">
        <caption className="visually-hidden">Characters whose progression is tracked</caption>
        <thead>
          <tr>
            <th scope="col">Character</th>
            <th scope="col">As of the end</th>
            <th scope="col">Changes recorded</th>
            <th scope="col">Abilities held</th>
            <th scope="col">States logged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={rowClass(scope, r.id)}>
              <td>
                <Pick target={{ type: 'entry', id: r.id }} label={r.name} scope={scope} />
              </td>
              <td>{r.now || <span className="muted">nothing recorded</span>}</td>
              <td>{r.changes}</td>
              <td>{r.abilities}</td>
              <td>{r.snapshots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ));
}
