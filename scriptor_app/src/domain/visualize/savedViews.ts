// A SAVED VIEW is a way of looking, not a copy of what is looked at: which view, its filters (record ids and query
// settings), drawn or listed, its layers, the zoom, and the view's own layout choices, under a name. Opening it reads
// the records as they are now; a record deleted since is simply not there, and the view says so. Filters are kept in
// the original's shape (`types`, `ids`, `categories`, `text`, `chapters: {from, to}`, `time: {from, until}`,
// `characters`, `locations`, `factions`, `threads`, `canon`, `status`, `significance`). A port of
// flutter_app/lib/shared/domain/visualize/saved_views.dart.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, isMap, listOf, mapOrNull, numOrNull, str } from '../json';
import { entityTypes } from '../model/entityRef';
import { type StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { canonStatuses } from '../records/canon';
import { strings } from '../records/jsonRecord';
import { SavedView } from '../records/savedView';
import { dartTrim } from '../text/dartString';
import { jsNum, precisions } from '../timeline/dates';

const listKeys = ['types', 'ids', 'categories', 'characters', 'locations', 'factions', 'threads', 'canon', 'status', 'significance'];

const allowed: Record<string, readonly string[]> = {
  types: entityTypes,
  canon: canonStatuses,
  status: ['idea', 'planned', 'confirmed'],
  significance: ['minor', 'major', 'climax'],
};

function anchorText(a: unknown): string | null {
  const m = mapOrNull(a);
  if (m === null) return null;
  switch (m['kind']) {
    case 'node':
      return `n:${String(m['nodeId'])}`;
    case 'event':
      return `e:${String(m['eventId'])}`;
    default:
      return `d:${JSON.stringify(m['when'] ?? null)}`;
  }
}

function anchorFrom(text: string | null): JsonMap | null {
  if (text === null || text.length <= 2) return null;
  const kind = text.substring(0, 2);
  const rest = text.substring(2);
  if (kind === 'n:') return { kind: 'node', nodeId: rest };
  if (kind === 'e:') return { kind: 'event', eventId: rest };
  if (kind === 'd:') {
    try {
      const when = mapOrNull(JSON.parse(rest));
      return when !== null && precisions.includes(when['precision'] as string) ? { kind: 'date', when } : null;
    } catch {
      return null;
    }
  }
  return null;
}

const valueText = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'number' ? jsNum(v) : String(v));

/** A filter as the page address would hold it and read it back: lists trimmed and without repeats, unknown values of
 * fixed lists (types, canon, status, significance) dropped, empty parts left out. */
export function cleanFilter(input: unknown): JsonMap {
  const filter = mapOrNull(input) ?? {};
  const out: JsonMap = {};
  for (const key of listKeys) {
    const values = listOf(filter[key]);
    if (values.length === 0) continue;
    const ok = allowed[key];
    // As the address reads it: one comma-separated list.
    const read: string[] = [];
    for (const v of values.map(valueText).join(',').split(',')) {
      const t = dartTrim(v);
      if (t.length > 0 && (ok === undefined || ok.includes(t)) && !read.includes(t)) read.push(t);
    }
    if (read.length > 0) out[key] = read;
  }
  const text = typeof filter['text'] === 'string' ? dartTrim(filter['text']) : '';
  if (text.length > 0) out['text'] = text;
  const chapters = mapOrNull(filter['chapters']);
  const from = chapters?.['from'];
  const to = chapters?.['to'];
  const fromText = typeof from === 'string' && from.length > 0 ? from : null;
  const toText = typeof to === 'string' && to.length > 0 ? to : null;
  if (fromText !== null || toText !== null) {
    out['chapters'] = { ...(fromText !== null ? { from: fromText } : {}), ...(toText !== null ? { to: toText } : {}) };
  }
  const time = mapOrNull(filter['time']);
  const after = anchorFrom(anchorText(time?.['from']));
  const before = anchorFrom(anchorText(time?.['until']));
  if (after !== null || before !== null) {
    out['time'] = { ...(after !== null ? { from: after } : {}), ...(before !== null ? { until: before } : {}) };
  }
  return out;
}

/** How many filters are set, for "Clear filters (3)". A range counts once. */
export function activeFilters(filter: JsonMap): number {
  return (
    listKeys.filter((k) => listOf(filter[k]).length > 0).length +
    (dartTrim(str(filter['text'])).length > 0 ? 1 : 0) +
    (filter['chapters'] !== null && filter['chapters'] !== undefined ? 1 : 0) +
    (filter['time'] !== null && filter['time'] !== undefined ? 1 : 0)
  );
}

/** What a view opens with on its own: no filters, drawn, fitted. */
export function defaultViewConfig(): JsonMap {
  return { filter: {}, mode: 'visual', layers: [], scale: null, layout: {} };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A config made safe to store: the filter through the same reading as the page address, the rest checked. */
export function cleanConfig(input: JsonMap): JsonMap {
  const s = mapOrNull(input['scale']);
  const scale = s !== null && finite(s['x']) && finite(s['y']) && finite(s['k']) && s['k'] > 0 ? { x: s['x'], y: s['y'], k: s['k'] } : null;
  const layout = input['layout'];
  const layers: string[] = [];
  for (const l of listOf(input['layers'])) if (typeof l === 'string' && l.length > 0 && !layers.includes(l)) layers.push(l);
  return {
    filter: cleanFilter(input['filter']),
    mode: input['mode'] === 'list' ? 'list' : 'visual',
    layers,
    scale,
    layout: isMap(layout) ? { ...layout } : {},
  };
}

/** A saved view's filter as it can be opened now: the ids of records deleted since it was saved are left out and
 * listed, so the view can say how many. The stored view is not changed. */
export function openSaved(model: StoryModel, saved: JsonMap): { filter: JsonMap; missing: string[] } {
  const missing: string[] = [];
  const keep = (ids: unknown, exists: (id: string) => boolean): string[] | null => {
    if (ids === null || ids === undefined) return null;
    const kept: string[] = [];
    for (const id of strings(ids)) {
      if (exists(id)) kept.push(id);
      else missing.push(id);
    }
    return kept.length === 0 ? null : kept;
  };
  const anyRecord = (id: string) =>
    model.nodes.has(id) || model.entries.has(id) || model.events.has(id) || model.threads.has(id) || model.relations.has(id) || model.abilities.has(id);
  const entry = (id: string) => model.entries.has(id);
  const point = (a: unknown): JsonMap | null => {
    const m = mapOrNull(a);
    if (m === null) return null;
    const when = mapOrNull(m['when']);
    const id = m['kind'] === 'node' ? m['nodeId'] : m['kind'] === 'event' ? m['eventId'] : when?.['precision'] === 'relative' ? when['anchorId'] : null;
    if (typeof id === 'string' && id.length > 0 && !(m['kind'] === 'node' ? model.nodes.has(id) : model.events.has(id))) {
      missing.push(id);
      return null;
    }
    return m;
  };

  const f = saved;
  const filter: JsonMap = { ...f };
  for (const [key, exists] of [
    ['ids', anyRecord],
    ['characters', entry],
    ['locations', entry],
    ['factions', entry],
    ['threads', (id: string) => model.threads.has(id)],
  ] as const) {
    const kept = keep(f[key], exists);
    if (kept !== null) filter[key] = kept;
    else delete filter[key];
  }
  const chapters = mapOrNull(f['chapters']);
  if (chapters !== null) {
    const end = (id: unknown): string | null => {
      if (typeof id !== 'string' || id.length === 0) return null;
      if (model.nodes.has(id)) return id;
      missing.push(id);
      return null;
    };
    const from = end(chapters['from']);
    const to = end(chapters['to']);
    if (from !== null || to !== null) filter['chapters'] = { ...(from !== null ? { from } : {}), ...(to !== null ? { to } : {}) };
    else delete filter['chapters'];
  }
  const time = mapOrNull(f['time']);
  if (time !== null) {
    const from = point(time['from']);
    const until = point(time['until']);
    if (from !== null || until !== null) filter['time'] = { ...(from !== null ? { from } : {}), ...(until !== null ? { until } : {}) };
    else delete filter['time'];
  }
  return { filter, missing: [...new Set(missing)] };
}

/** Changes to a novel's saved views. They hold settings and record ids only, never copies of records. */
export class SavedViewChanges extends RecordChanges {
  /** This novel's saved views, of one view or all, by name. */
  list(view?: string | null): SavedView[] {
    return stableSorted(
      this.rows('savedViews')
        .filter((r) => view === undefined || view === null || r['view'] === view)
        .map((r) => new SavedView(r)),
      (a, b) => {
        const byName = localeCompare(a.name, b.name);
        return byName !== 0 ? byName : (numOrNull(a.raw['createdAt']) ?? 0) - (numOrNull(b.raw['createdAt']) ?? 0);
      },
    );
  }

  owned(id: string): SavedView {
    const r = this.row('savedViews', id);
    if (r === null) throw new ChangeRefused('That saved view is not in this novel.');
    return new SavedView(r);
  }

  private nameOf(name: unknown): string {
    const n = typeof name === 'string' ? dartTrim(name) : '';
    return n.length === 0 ? 'Untitled view' : n;
  }

  /** Saves the settings under a name, as a new saved view of `view`. */
  save(view: string, name: string, config: JsonMap): string {
    const id = this.newId();
    this.put('savedViews', {
      id,
      projectId: this.projectId,
      view: dartTrim(view).length === 0 ? 'timeline' : dartTrim(view),
      name: this.nameOf(name),
      ...cleanConfig(config),
      createdAt: this.now,
      updatedAt: this.now,
    });
    return id;
  }

  /** Replaces what a saved view shows, keeping its name. */
  update(id: string, config: JsonMap): void {
    const current = this.owned(id);
    this.put('savedViews', { ...current.toJson(), ...cleanConfig({ ...current.raw, ...config }), updatedAt: this.now });
  }

  rename(id: string, name: string): void {
    this.put('savedViews', { ...this.owned(id).toJson(), name: this.nameOf(name), updatedAt: this.now });
  }

  duplicate(id: string): string {
    const current = this.owned(id);
    const copy = this.newId();
    this.put('savedViews', { ...current.toJson(), id: copy, name: `${current.name} (copy)`, createdAt: this.now, updatedAt: this.now });
    return copy;
  }

  /** Puts a saved view back to how the view opens on its own, keeping its name. */
  restoreDefault(id: string): void {
    this.put('savedViews', { ...this.owned(id).toJson(), ...defaultViewConfig(), updatedAt: this.now });
  }

  removeView(id: string): void {
    this.owned(id);
    this.remove('savedViews', id);
  }

  /** Turns views off or on: a setting of the novel, which deletes nothing. */
  setViewsOff(off: readonly string[]): void {
    this.snapshot = this.snapshot.copyWith({ project: { ...this.snapshot.project, viewsOff: [...off] } });
  }
}
