import { CANON_STATUSES } from '@/modules/canon/types';
import type { Filter } from '@/modules/model/query';
import { ENTITY_TYPES, type EntityRef, type EntityType } from '@/modules/model/types';
import type { Anchor } from '@/modules/model/validity';
import { EVENT_STATUSES, IMPORTANCE, PRECISIONS } from '@/modules/timeline/types';

/**
 * A view's filters live in the page address, so reloading, going back and
 * sharing a link all bring back the same view. Lists are comma-separated
 * ids; points in time are `n:<chapter id>`, `e:<event id>` or `d:<date>`.
 * Anything that cannot be read (an old link, a hand-edited address) is
 * ignored, never an error.
 */
const LISTS = { types: 'types', ids: 'ids', categories: 'cat', characters: 'chars', locations: 'places', factions: 'factions', threads: 'threads', canon: 'canon', status: 'status', significance: 'sig' } as const;
const ALLOWED: Partial<Record<keyof typeof LISTS, readonly string[]>> = { types: ENTITY_TYPES, canon: CANON_STATUSES, status: EVENT_STATUSES, significance: IMPORTANCE };

/** The address parameters a view uses for its filters, so other parameters (the open record, a tab) are left alone. */
export const FILTER_PARAMS: string[] = [...Object.values(LISTS), 'q', 'from', 'to', 'after', 'before'];

export function encodeAnchor(anchor: Anchor): string {
  return anchor.kind === 'node' ? `n:${anchor.nodeId}` : anchor.kind === 'event' ? `e:${anchor.eventId}` : `d:${JSON.stringify(anchor.when)}`;
}

export function decodeAnchor(text: string | null): Anchor | null {
  if (!text) return null;
  const [kind, rest] = [text.slice(0, 2), text.slice(2)];
  if (!rest) return null;
  if (kind === 'n:') return { kind: 'node', nodeId: rest };
  if (kind === 'e:') return { kind: 'event', eventId: rest };
  if (kind === 'd:') {
    try {
      const when = JSON.parse(rest);
      return when && PRECISIONS.includes(when.precision) ? { kind: 'date', when } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** A filter as address parameters, in a fixed order, leaving out what is empty. */
export function encodeFilter(filter: Filter): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, param] of Object.entries(LISTS) as [keyof typeof LISTS, string][]) {
    const values = filter[key] as string[] | undefined;
    if (values?.length) out.push([param, values.join(',')]);
  }
  if (filter.text?.trim()) out.push(['q', filter.text.trim()]);
  if (filter.chapters?.from) out.push(['from', filter.chapters.from]);
  if (filter.chapters?.to) out.push(['to', filter.chapters.to]);
  if (filter.time?.from) out.push(['after', encodeAnchor(filter.time.from)]);
  if (filter.time?.until) out.push(['before', encodeAnchor(filter.time.until)]);
  return out;
}

/** A filter read back from address parameters. Unknown values in fixed lists (types, canon…) are dropped; ids are kept for the query to judge. */
export function decodeFilter(params: URLSearchParams): Filter {
  const filter: Filter = {};
  for (const [key, param] of Object.entries(LISTS) as [keyof typeof LISTS, string][]) {
    const raw = params.get(param);
    if (!raw) continue;
    const allowed = ALLOWED[key];
    const values = [...new Set(raw.split(',').map((v) => v.trim()).filter((v) => v && (!allowed || allowed.includes(v))))];
    if (values.length) (filter as Record<string, unknown>)[key] = values;
  }
  const text = params.get('q')?.trim();
  if (text) filter.text = text;
  const [from, to] = [params.get('from'), params.get('to')];
  if (from || to) filter.chapters = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const [after, before] = [decodeAnchor(params.get('after')), decodeAnchor(params.get('before'))];
  if (after || before) filter.time = { ...(after ? { from: after } : {}), ...(before ? { until: before } : {}) };
  return filter;
}

/** How many filters are set, for "Clear filters (3)". A range counts once. */
export function activeFilters(filter: Filter): number {
  const lists = Object.keys(LISTS).filter((key) => ((filter as Record<string, unknown>)[key] as unknown[] | undefined)?.length).length;
  return lists + (filter.text?.trim() ? 1 : 0) + (filter.chapters?.from || filter.chapters?.to ? 1 : 0) + (filter.time?.from || filter.time?.until ? 1 : 0);
}

/** The selected record in the address (`?select=entry:<id>`), read back safely. */
export function decodeSelection(text: string | null): EntityRef | null {
  if (!text) return null;
  const at = text.indexOf(':');
  const type = text.slice(0, at) as EntityType;
  const id = text.slice(at + 1);
  return at > 0 && id && ENTITY_TYPES.includes(type) ? { type, id } : null;
}

export const encodeSelection = (ref: EntityRef): string => `${ref.type}:${ref.id}`;

/** Whether the view is drawn or shown as a list (`?as=list`). Drawn unless the address says list. */
export const viewModeOf = (params: URLSearchParams): 'visual' | 'list' => (params.get('as') === 'list' ? 'list' : 'visual');

