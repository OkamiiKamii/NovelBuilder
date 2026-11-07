import { toCsv } from '@/modules/analytics/charts';
import type { CharacterSecret } from '@/modules/characters/types';
import { resolveRef } from '@/modules/model/model';
import { ENTITY_TYPES, type EntityType, type StoryModel } from '@/modules/model/types';
import { whenWords } from '@/modules/progression/track';
import { decodeFilter, FILTER_PARAMS } from '@/modules/viz/params';
import { fileSlug } from '@/shared/download';

/**
 * EXPORTING A VIEW
 * What a view exports as data: the records it is about, as the app keeps
 * them (every field, with stable ids), narrowed by the page's filters, with
 * the names of everything they point at so the file reads on its own. Each
 * export says when it was made, from which novel and view, and with which
 * filters and settings. It is not a backup: the Import & Export page keeps
 * the whole novel. Private notes are left out unless asked for, and secrets
 * are only ever included on purpose.
 */

/** What each view's data holds. */
type Kind = 'events' | 'nodes' | 'characters' | 'entries' | 'places' | 'factions' | 'items' | 'relations' | 'links' | 'threads' | 'journeys' | 'progress' | 'abilities' | 'appearances' | 'secrets' | 'charts';
export const VIEW_DATA: Record<string, Kind[]> = {
  timeline: ['events'],
  order: ['events', 'nodes'],
  relationships: ['relations', 'characters', 'links'],
  plot: ['threads', 'events', 'nodes'],
  structure: ['nodes'],
  graph: ['entries', 'events', 'nodes', 'threads', 'relations', 'links'],
  places: ['places', 'links'],
  progression: ['progress', 'characters'],
  history: ['characters', 'events', 'relations'],
  appearances: ['appearances', 'characters', 'nodes'],
  knowledge: ['secrets', 'characters'],
  kinds: ['entries'],
  abilities: ['abilities', 'links'],
  journeys: ['journeys', 'places'],
  factions: ['factions', 'links'],
  ownership: ['items', 'links'],
  charts: ['charts'],
};

/** Fields the app keeps private to the author: a codex entry's notes, a chapter's or scene's notes. */
export const PRIVATE_FIELDS: Partial<Record<Kind, string[]>> = { entries: ['notes'], characters: ['notes'], places: ['notes'], factions: ['notes'], items: ['notes'], nodes: ['notes'] };

export interface ExportOptions {
  /** The page's filters: whether a record of the view's own kind is kept. */
  keep: (id: string) => boolean;
  includePrivate: boolean;
  /** Secrets, only when the author chooses to include them (and may see them). */
  secrets?: CharacterSecret[] | null;
  /** The charts' tables, for the charts view. */
  charts?: { key: string; title: string; table: { columns: string[]; rows: (string | number)[][] } }[];
}

const without = (row: object, fields: string[] | undefined) => (fields?.length ? Object.fromEntries(Object.entries(row).filter(([k]) => !fields.includes(k))) : { ...row });

/** The records a view is about, as kept, and the names of every record they point at. */
export function viewRecords(model: StoryModel, viewKey: string, options: ExportOptions): { records: Record<string, unknown[]>; names: Record<string, string>; count: number } {
  const kinds = VIEW_DATA[viewKey] ?? [];
  const records: Record<string, unknown[]> = {};
  const entries = [...model.entries.values()];
  const byCategory = (category: string) => entries.filter((e) => e.category === category && options.keep(e.id));
  const put = (kind: Kind, rows: object[]) => (records[kind] = rows.map((r) => (options.includePrivate ? { ...r } : without(r, PRIVATE_FIELDS[kind]))));
  const sorted = <T extends { id: string }>(rows: T[], name: (r: T) => string) => [...rows].sort((a, b) => name(a).localeCompare(name(b)) || a.id.localeCompare(b.id));
  for (const kind of kinds) {
    if (kind === 'events') put(kind, sorted([...model.events.values()].filter((e) => options.keep(e.id)), (e) => e.name));
    if (kind === 'nodes') put(kind, [...model.nodes.values()].filter((n) => options.keep(n.id)).sort((a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0)));
    if (kind === 'characters') put(kind, sorted(byCategory('character'), (e) => e.name));
    if (kind === 'places') put(kind, sorted(byCategory('location'), (e) => e.name));
    if (kind === 'factions') put(kind, sorted(byCategory('faction'), (e) => e.name));
    if (kind === 'items') put(kind, sorted(byCategory('item'), (e) => e.name));
    if (kind === 'entries') put(kind, sorted(entries.filter((e) => options.keep(e.id)), (e) => e.name));
    if (kind === 'relations') put(kind, sorted([...model.relations.values()].filter((r) => options.keep(r.id)), (r) => r.id));
    if (kind === 'threads') put(kind, sorted([...model.threads.values()].filter((t) => options.keep(t.id)), (t) => t.title));
    if (kind === 'journeys') put(kind, model.journeys);
    if (kind === 'progress') put(kind, model.progress.filter((c) => options.keep(c.entryId)));
    if (kind === 'abilities') put(kind, [...model.abilities].map(([id, a]) => ({ id, system: a.system.name, group: a.group, item: a.item })));
    if (kind === 'appearances') put(kind, [...model.plans.values()].filter((p) => (p.appearIds?.length || p.mentionIds?.length || p.povIds?.length) && options.keep(p.id)).map((p) => ({ nodeId: p.id, appearIds: p.appearIds ?? [], mentionIds: p.mentionIds ?? [], povIds: p.povIds ?? [] })));
    if (kind === 'secrets' && options.secrets) put(kind, options.secrets);
    if (kind === 'charts' && options.charts) put(kind, options.charts);
  }
  // Connections whose ends are both among what is exported, or any for a view about connections between kinds.
  if (kinds.includes('links')) {
    const ids = new Set(Object.values(records).flat().map((r) => (r as { id?: string }).id).filter(Boolean));
    records.links = model.links.filter((l) => ids.has(l.fromId) || ids.has(l.toId)).map((l) => ({ ...l }));
  }
  // The names of everything the records point at, so the file reads on its own.
  const names: Record<string, string> = {};
  // Every string the records hold, gathered in one pass: those that are ids of the novel's records are named.
  const held = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') held.add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(records);
  for (const id of held) {
    for (const type of ENTITY_TYPES) {
      const found = resolveRef(model, { type: type as EntityType, id });
      if (found.found) {
        names[id] = found.view.label;
        break;
      }
    }
  }
  return { records, names, count: Object.values(records).reduce((n, rows) => n + rows.length, 0) };
}

/** The page's filters and the view's own settings, in words. Ids are named; nothing is left out. */
export function filterWords(params: URLSearchParams, model: StoryModel, name: (id: string) => string | null = () => null): string[] {
  const filter = decodeFilter(params);
  const named = (ids: string[]) => ids.map((id) => name(id) ?? (model.entries.get(id)?.name || model.threads.get(id)?.title || id)).join(', ');
  const words: string[] = [];
  if (filter.text) words.push(`Name contains “${filter.text}”`);
  if (filter.characters?.length) words.push(`Involving: ${named(filter.characters)}`);
  if (filter.locations?.length) words.push(`At: ${named(filter.locations)}`);
  if (filter.factions?.length) words.push(`Faction: ${named(filter.factions)}`);
  if (filter.threads?.length) words.push(`Plot thread: ${named(filter.threads)}`);
  if (filter.canon?.length) words.push(`Canon status: ${filter.canon.join(', ')}`);
  if (filter.status?.length) words.push(`Planning status: ${filter.status.join(', ')}`);
  if (filter.significance?.length) words.push(`Significance: ${filter.significance.join(', ')}`);
  if (filter.categories?.length) words.push(`Kinds of record: ${filter.categories.join(', ')}`);
  if (filter.chapters?.from || filter.chapters?.to) words.push(`Chapters: from ${filter.chapters.from ? whenWords({ kind: 'node', nodeId: filter.chapters.from }, model) : 'the start'} to ${filter.chapters.to ? whenWords({ kind: 'node', nodeId: filter.chapters.to }, model) : 'the end'}`);
  if (filter.time?.from || filter.time?.until) words.push(`Story time: from ${filter.time.from ? whenWords(filter.time.from, model) : 'the start'} until ${filter.time.until ? whenWords(filter.time.until, model) : 'the end'}`);
  // The view's own settings, as they stand in the address; ids by their names.
  for (const [key, value] of params) {
    if (FILTER_PARAMS.includes(key) || ['select', 'saved', 'as'].includes(key)) continue;
    if (key === 'marks') words.push('Canon and continuity markers: on');
    else words.push(`View setting ${key}: ${value.split(',').map((v) => name(v) ?? (model.entries.get(v)?.name || model.events.get(v)?.name || model.nodes.get(v)?.title || model.threads.get(v)?.title || v)).join(', ')}`);
  }
  return words;
}

export interface Envelope {
  format: 'novel-builder/view-export';
  version: 1;
  exportedAt: string;
  novel: { id: string; title: string };
  view: { key: string; label: string; description: string; shownAs: 'drawing' | 'list' };
  filters: string[];
  /** A view's export is a picture of part of the novel, not a copy of it. */
  notABackup: string;
  /** What was left out on purpose. */
  leftOut: string[];
  /** When the view has nothing to show: what it says. */
  empty: string | null;
  names: Record<string, string>;
  records: Record<string, unknown[]>;
}

export const NOT_A_BACKUP = 'This file holds the records one view is about, with its filters. It is not a backup: to keep or move the whole novel, use Import & Export → Export entire project data.';

/** A dated file name in the novel's own words (letters of any script kept): "the-ember-crown-timeline-2026-10-22.json". */
export const exportFileName = (title: string, viewKey: string, at: Date, extension: string) => `${fileSlug(title).slice(0, 60)}-${viewKey}-${at.toISOString().slice(0, 10)}.${extension}`;

/** Several tables as one CSV file, each headed by its title, with a byte-order mark so a spreadsheet reads every script. */
export function tablesCsv(tables: { title: string; columns: string[]; rows: (string | number)[][] }[]): string {
  return `﻿${tables.map((t) => (tables.length > 1 ? `${toCsv([t.title], [])}\r\n` : '') + toCsv(t.columns, t.rows)).join('\r\n\r\n')}`;
}
