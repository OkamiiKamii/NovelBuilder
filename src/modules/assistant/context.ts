import type { CanonFact } from '@/modules/canon/types';
import { filledFields, unknownCategory } from '@/modules/codex/schema';
import type { Category, LoreEntry } from '@/modules/codex/types';
import type { ChapterPlan, StoryNode } from '@/modules/manuscript/types';
import { CATEGORY_LABELS, STATUS_LABELS, OPEN_STATUSES, type PlotThread } from '@/modules/plot/types';
import { storyOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation } from '@/modules/relationships/types';
import { computeSheet } from '@/modules/systems/compute';
import type { SystemBlueprint, SystemSheet } from '@/modules/systems/types';
import type { Calendar } from '@/modules/timeline/calendar';
import { resolveChronology } from '@/modules/timeline/chronology';
import type { TimelineEvent } from '@/modules/timeline/types';
import type { Attachments, Fact, FactSource } from './types';

/** What the context is built from: the project's own records, as they are saved. */
export interface ProjectData {
  entries: LoreEntry[];
  nodes: StoryNode[];
  plans: ChapterPlan[];
  relations: CharacterRelation[];
  threads: PlotThread[];
  events: TimelineEvent[];
  canon: CanonFact[];
  systems: SystemBlueprint[];
  sheets: SystemSheet[];
  categoryOf: (key: string) => Category | undefined;
  /** The calendar dates are read in; the standard one when not given. */
  calendar?: Calendar;
}

export const LIMITS = { facts: 90, text: 600, fields: 8 };
const clip = (text: string, max = LIMITS.text): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/**
 * CONTEXT-AWARE KNOWLEDGE INJECTION
 * Turns what the author attached into numbered facts. For each attached
 * entry it also brings what the project records about it: its fields, its
 * relationships, the open threads and events it is part of, canon about it
 * and where it stands in a system. Everything here is read from the project;
 * nothing is invented, summarised by a model or taken from the manuscript's
 * text. Private notes are left out: they are drafts, not what is established.
 */
export function buildContext(data: ProjectData, attached: Attachments): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const add = (label: string, text: string, source: FactSource) => {
    const clean = clip(text);
    const key = `${source.type}:${source.id}:${clean}`;
    if (!clean || seen.has(key) || facts.length >= LIMITS.facts) return;
    seen.add(key);
    facts.push({ id: `F${facts.length + 1}`, label, text: clean, source });
  };
  const entryById = new Map(data.entries.map((e) => [e.id, e]));
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const name = (id: string | null | undefined) => (id ? entryById.get(id)?.name : undefined);
  const title = (id: string | null | undefined) => (id ? nodeById.get(id)?.title : undefined);
  const kind = (entry: LoreEntry) => (data.categoryOf(entry.category) ?? unknownCategory(entry.category)).singular;
  const entries = attached.entryIds.flatMap((id) => entryById.get(id) ?? []);
  const attachedIds = new Set(entries.map((e) => e.id));
  const order = storyOrder(data.nodes);

  for (const entry of entries) {
    const label = `${entry.name} · ${kind(entry)}`;
    add(label, [`${entry.name} is a ${kind(entry).toLowerCase()}.`, entry.summary, entry.description].filter((part) => part.trim()).join(' '), { type: 'entry', id: entry.id });
    for (const field of filledFields(entry, data.categoryOf(entry.category) ?? unknownCategory(entry.category), name).slice(0, LIMITS.fields)) add(label, `${entry.name} — ${field.label}: ${field.text}`, { type: 'entry', id: entry.id });
    if (entry.tags.length) add(label, `${entry.name} is tagged: ${entry.tags.join(', ')}.`, { type: 'entry', id: entry.id });
  }

  // How the attached people stand with one another, and with anyone else they are tied to.
  for (const relation of data.relations) {
    if (!attachedIds.has(relation.fromId) && !attachedIds.has(relation.toId)) continue;
    const latest = [...relation.stages].sort((a, b) => (a.startNodeId ? (order.position.get(a.startNodeId) ?? -1) : -1) - (b.startNodeId ? (order.position.get(b.startNodeId) ?? -1) : -1)).at(-1);
    const [a, b] = [name(relation.fromId), name(relation.toId)];
    if (!latest || !a || !b) continue;
    add('Relationship', `${a} and ${b}: ${latest.title.trim() || latest.label} (${latest.affinity})${latest.startNodeId && title(latest.startNodeId) ? `, since ${title(latest.startNodeId)}` : ''}.${latest.event.trim() ? ` ${latest.event.trim()}` : ''}`, { type: 'relation', id: relation.id });
  }

  const threads = data.threads.filter((t) => attached.threadIds.includes(t.id) || (OPEN_STATUSES.includes(t.status) && [...t.characterIds, ...t.locationIds].some((id) => attachedIds.has(id))));
  for (const thread of threads) {
    const beats = thread.beats.filter((b) => b.nodeId && nodeById.has(b.nodeId)).sort((a, b) => (order.position.get(a.nodeId!) ?? 0) - (order.position.get(b.nodeId!) ?? 0)).map((b) => `${title(b.nodeId)}: ${b.title}`);
    const cast = thread.characterIds.flatMap((id) => name(id) ?? []);
    add('Plot thread', `“${thread.title}” (${CATEGORY_LABELS[thread.category]}, ${STATUS_LABELS[thread.status]}). ${thread.premise.trim()}${cast.length ? ` Involves ${cast.join(', ')}.` : ''}${beats.length ? ` Developments so far: ${beats.join('; ')}.` : ' No developments recorded yet.'}`, { type: 'thread', id: thread.id });
  }

  for (const { event, label } of resolveChronology(data.events, data.calendar)) {
    if (![...event.characters.map((c) => c.id), event.locationId, ...event.entryIds].some((id) => id && attachedIds.has(id))) continue;
    const who = event.characters.flatMap((c) => name(c.id) ?? []);
    add('Timeline', `“${event.name}” (${label})${name(event.locationId) ? ` at ${name(event.locationId)}` : ''}${who.length ? `, involving ${who.join(', ')}` : ''}. ${event.description.trim()}`, { type: 'event', id: event.id });
  }

  for (const fact of data.canon) {
    if (!fact.entryIds.some((id) => attachedIds.has(id)) || !fact.statement.trim()) continue;
    if (fact.status === 'canon') add('Canon', `${fact.subject}: ${fact.statement}`, { type: 'canon', id: fact.id });
    // A working idea is passed on as exactly that, so it cannot be mistaken for settled canon.
    else if (fact.status === 'provisional') add('Provisional (not settled)', `${fact.subject}: ${fact.statement} (a working idea of the author's, not yet canon)`, { type: 'canon', id: fact.id });
  }

  for (const sheet of data.sheets) {
    const [entry, system] = [entryById.get(sheet.entryId), data.systems.find((s) => s.id === sheet.systemId)];
    if (!entry || !system || !attachedIds.has(entry.id)) continue;
    const computed = computeSheet(system, sheet);
    const parts = [...computed.tracks.map((t) => `${t.track.name} ${t.label}`), ...system.groups.flatMap((g) => {
      const held = computed.items.filter((i) => i.item.groupId === g.id).map((i) => i.item.name);
      return held.length ? [`${g.name}: ${held.join(', ')}`] : [];
    }), ...computed.rows.filter((r) => r.value !== null && r.variable.kind !== 'derived').slice(0, 8).map((r) => `${r.variable.name} ${r.display}`)];
    if (parts.length) add(`${entry.name} · ${system.name}`, `${entry.name} in ${system.name}: ${parts.join('; ')}.`, { type: 'sheet', id: sheet.id });
  }

  for (const node of attached.nodeIds.flatMap((id) => nodeById.get(id) ?? [])) {
    const plan = data.plans.find((p) => p.id === node.id);
    const parts = [node.summary.trim(), plan?.objective.trim() ? `Objective: ${plan.objective.trim()}` : '', plan?.conflict.trim() ? `Conflict: ${plan.conflict.trim()}` : ''].filter(Boolean);
    if (parts.length) add(`${node.title} · plan`, `${node.title}: ${parts.join(' ')}`, { type: 'chapter', id: node.id });
  }

  return facts;
}

/** Codex entries the author named in their question, so they can be offered as attachments. */
export function mentionedIn(prompt: string, entries: LoreEntry[]): LoreEntry[] {
  return entries.filter((entry) => entry.name.trim().length > 1 && new RegExp(`(?<![\\p{L}\\p{N}])${entry.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(prompt));
}
