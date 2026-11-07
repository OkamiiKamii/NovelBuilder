import type { CanonFact } from '@/modules/canon/types';
import type { LoreEntry } from '@/modules/codex/types';
import { excerptAround, find, paragraphsOf } from '@/modules/continuity/text';
import type { ContinuityRule } from '@/modules/continuity/types';
import { isDocument, subtreeIds } from '@/modules/manuscript/tree';
import type { ChapterPlan, StoryNode } from '@/modules/manuscript/types';
import { OPEN_STATUSES, type PlotThread } from '@/modules/plot/types';
import { compare, inStoryOrder } from '@/modules/progression/state';
import type { ProgressSnapshot } from '@/modules/progression/types';
import { storyOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation } from '@/modules/relationships/types';
import type { SystemBlueprint } from '@/modules/systems/types';
import type { TimelineEvent } from '@/modules/timeline/types';

/** What the author is thinking of changing. */
export type Subject = { type: 'node'; nodeId: string } | { type: 'event'; eventId: string } | { type: 'beat'; threadId: string; beatId: string };

/** Everything the analysis reads. It is given the data; it fetches and stores nothing. */
export interface World {
  nodes: StoryNode[];
  /** Saved text by chapter or scene id. */
  docs: Map<string, unknown>;
  plans: ChapterPlan[];
  entries: LoreEntry[];
  relations: CharacterRelation[];
  threads: PlotThread[];
  events: TimelineEvent[];
  facts: CanonFact[];
  rules: ContinuityRule[];
  snapshots: ProgressSnapshot[];
  systems: SystemBlueprint[];
}

/** Where a consequence can be looked at. The page turns these into links. */
export type Target =
  | { type: 'node'; nodeId: string; block?: number; term?: string }
  | { type: 'entry'; entryId: string }
  | { type: 'thread'; threadId: string }
  | { type: 'relation'; relationId: string }
  | { type: 'snapshot'; snapshotId: string; entryId: string }
  | { type: 'rule' }
  | { type: 'fact'; factId: string }
  | { type: 'event'; eventId: string };

export type ConsequenceKind = 'thread' | 'relationship' | 'character-state' | 'possession' | 'canon' | 'chronology' | 'introduction' | 'appearance';
export const KIND_LABELS: Record<ConsequenceKind, string> = {
  thread: 'Plot thread', relationship: 'Relationship', 'character-state': 'Character state', possession: 'Tracked rule', canon: 'Canon', chronology: 'Chronology', introduction: 'First appearance', appearance: 'Later appearance',
};

/**
 * SPECULATION CONTROL RULE
 * `established`: something the author has recorded that is tied to this
 * exact point: a development placed in this chapter, a snapshot logged here,
 * a relationship stage that starts here. If this point changes, that record
 * is, as a matter of fact, hanging on something that is no longer there.
 *
 * `potential`: something later in the story that involves the same people,
 * places or threads. It may depend on this point, or not at all; nothing in
 * the data says. These are worded as possibilities and are never treated as
 * facts, rules or canon.
 */
export type Tier = 'established' | 'potential';

export interface Consequence {
  /** Stable for the same finding, so the author's "looked at" ticks hold. */
  key: string;
  tier: Tier;
  kind: ConsequenceKind;
  message: string;
  /** For established ones: the record this rests on. For potential ones: why it is being raised. */
  basis: string;
  target: Target;
  /** A quoted passage, for consequences found in the text. */
  excerpt?: string;
  match?: string;
  /** The chapter or scene this is in, when it is in one. */
  nodeId?: string;
  entryIds: string[];
  threadId?: string;
  relationId?: string;
  eventId?: string;
  factId?: string;
}

export interface Report {
  /** The subject in words: "Chapter 25", "the event “The Siege”". */
  title: string;
  /** False when the subject no longer exists. */
  found: boolean;
  /** The chapters and scenes the change is in. */
  anchorIds: string[];
  /** The codex entries the change is taken to involve. */
  seeds: LoreEntry[];
  /** The ones worked out from the subject, before the author's additions and removals. */
  suggested: LoreEntry[];
  established: Consequence[];
  potential: Consequence[];
  summary: { label: string; count: number }[];
  /** "3 Characters, 2 Locations, 4 Plot Threads, 6 Chapters". */
  summaryLine: string;
  downstream: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (names: string[]): string => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * Works out what hangs on a point in the story. A pure function: it reads
 * what it is given and returns a report. It changes nothing, proposes no
 * edits, and never rewrites text.
 */
export function analyze(world: World, subject: Subject, options: { include?: string[]; exclude?: string[] } = {}): Report {
  const { nodes, docs, plans, entries, relations, threads, events, facts, rules, snapshots, systems } = world;
  const order = storyOrder(nodes);
  const position = (id: string) => order.position.get(id) ?? -1;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const name = (id: string | null | undefined) => (id ? entryById.get(id)?.name : undefined);
  const title = (id: string | null | undefined) => (id ? nodeById.get(id)?.title : undefined);
  const documents = nodes.filter((n) => isDocument(n.kind)).sort((a, b) => position(a.id) - position(b.id));
  const text = new Map(documents.map((d) => [d.id, paragraphsOf(docs.get(d.id)).filter((p) => p.text.trim())]));
  const planOf = new Map(plans.map((p) => [p.id, p]));

  // ---- What the change is, and where it sits.
  let label = '';
  let found = true;
  let anchor: string[] = [];
  const auto = new Set<string>();
  const event = subject.type === 'event' ? events.find((e) => e.id === subject.eventId) : undefined;
  const thread = subject.type === 'beat' ? threads.find((t) => t.id === subject.threadId) : undefined;
  const beat = thread?.beats.find((b) => b.id === (subject as { beatId: string }).beatId);

  if (subject.type === 'node') {
    const node = nodeById.get(subject.nodeId);
    found = Boolean(node);
    label = node?.title ?? 'A chapter that was removed';
    anchor = node ? subtreeIds(nodes, node.id).filter((id) => isDocument(nodeById.get(id)!.kind)) : [];
  } else if (subject.type === 'event') {
    found = Boolean(event);
    label = event ? `the event “${event.name}”` : 'An event that was removed';
    anchor = (event?.nodeIds ?? []).filter((id) => nodeById.has(id));
    for (const id of [...(event?.characters.map((c) => c.id) ?? []), event?.locationId, ...(event?.entryIds ?? [])]) if (id && entryById.has(id)) auto.add(id);
  } else {
    found = Boolean(thread && beat);
    label = beat ? `“${beat.title}” in the thread “${thread!.title}”` : 'A development that was removed';
    anchor = beat?.nodeId && nodeById.has(beat.nodeId) ? [beat.nodeId] : [];
    for (const id of [...(thread?.characterIds ?? []), ...(thread?.locationIds ?? [])]) if (entryById.has(id)) auto.add(id);
  }
  const inAnchor = new Set(anchor);
  // Group nodes count too: a relationship stage can start at a volume.
  const anchorNodes = subject.type === 'node' && found ? new Set(subtreeIds(nodes, subject.nodeId)) : inAnchor;
  const from = anchor.length ? Math.min(...anchor.map(position)) : -1;
  const downstream = documents.filter((d) => !inAnchor.has(d.id) && (anchor.length === 0 ? subject.type !== 'node' : position(d.id) > from));
  const isLater = (nodeId: string | null | undefined) => Boolean(nodeId) && downstream.some((d) => d.id === nodeId || subtreeIds(nodes, nodeId!).includes(d.id)) && !anchorNodes.has(nodeId!);

  /** Whether a chapter or scene names an entry: by a link, in its plan, or in its words. */
  const namedIn = (nodeId: string, entry: LoreEntry) => {
    const node = nodeById.get(nodeId);
    if (node?.mentions?.includes(entry.id) || planOf.get(nodeId)?.entityIds.includes(entry.id)) return true;
    return (text.get(nodeId) ?? []).some((p) => p.links.some((l) => l.entryId === entry.id) || find(p.text, [entry.name]).length > 0);
  };
  if (subject.type === 'node') for (const id of anchor) for (const entry of entries) if (namedIn(id, entry)) auto.add(entry.id);

  const established: Consequence[] = [];
  const potential: Consequence[] = [];
  const hard = (c: Omit<Consequence, 'tier'>) => established.push({ tier: 'established', ...c });
  const soft = (c: Omit<Consequence, 'tier'>) => potential.push({ tier: 'potential', ...c });

  // ---- Established: records tied to this exact point.
  // For a chapter, that is everything recorded at it. An event or a single development is narrower: only what hangs on that one record.
  const recordedAt = subject.type === 'node' ? anchorNodes : new Set<string>();
  if (subject.type !== 'beat') {
    for (const t of threads) {
      for (const b of t.beats.filter((x) => x.nodeId && recordedAt.has(x.nodeId))) {
        hard({ key: `beat:${b.id}`, kind: 'thread', message: `The thread “${t.title}” has its development “${b.title}” recorded in ${title(b.nodeId)}.`, basis: 'A development placed in this chapter', target: { type: 'thread', threadId: t.id }, entryIds: [...t.characterIds, ...t.locationIds], threadId: t.id, nodeId: b.nodeId! });
        for (const id of [...t.characterIds, ...t.locationIds]) if (entryById.has(id)) auto.add(id);
      }
      if (t.targetNodeId && recordedAt.has(t.targetNodeId)) hard({ key: `target:${t.id}`, kind: 'thread', message: `The thread “${t.title}” is meant to resolve in ${title(t.targetNodeId)}.`, basis: 'The thread’s target resolution', target: { type: 'thread', threadId: t.id }, entryIds: [], threadId: t.id });
    }
  }
  if (thread && beat) {
    const later = thread.beats.filter((b) => b.id !== beat.id && isLater(b.nodeId));
    for (const b of later) hard({ key: `beat:${b.id}`, kind: 'thread', message: `“${b.title}” in ${title(b.nodeId)} is the thread’s next recorded step after this one.`, basis: 'A later development of the same thread', target: { type: 'thread', threadId: thread.id }, entryIds: [], threadId: thread.id, nodeId: b.nodeId! });
  }
  for (const relation of relations) {
    for (const stage of relation.stages.filter((s) => s.startNodeId && recordedAt.has(s.startNodeId))) {
      const pair = `${name(relation.fromId) ?? 'Someone'} and ${name(relation.toId) ?? 'someone'}`;
      hard({ key: `stage:${stage.id}`, kind: 'relationship', message: `${pair} become “${stage.title.trim() || stage.label}” starting in ${title(stage.startNodeId)}${stage.event.trim() ? ` (${stage.event.trim()})` : ''}.`, basis: 'A relationship stage that starts here', target: { type: 'relation', relationId: relation.id }, entryIds: [relation.fromId, relation.toId], relationId: relation.id });
      for (const id of [relation.fromId, relation.toId]) if (entryById.has(id)) auto.add(id);
    }
  }
  for (const entry of entries) {
    const mine = inStoryOrder(snapshots, nodes, entry.id);
    mine.forEach((snapshot, i) => {
      if (!snapshot.nodeId || !recordedAt.has(snapshot.nodeId)) return;
      const previous = mine[i - 1];
      const diff = previous ? compare(previous, snapshot, systems) : null;
      const gains = diff ? [...diff.advancement.map((x) => `${x.name} ${x.from} → ${x.to}`), ...diff.gained.map((x) => `gains ${x.name}`), ...diff.gear.filter((g) => g.change === 'gained').map((g) => `receives ${g.name}`), ...diff.gear.filter((g) => g.change === 'lost').map((g) => `loses ${g.name}`), ...diff.status.flatMap((s) => s.added.map((line) => `now “${line}”`))] : [];
      hard({ key: `snapshot:${snapshot.id}`, kind: 'character-state', message: `${entry.name}’s state${snapshot.label ? ` “${snapshot.label}”` : ''} is logged at ${title(snapshot.nodeId)}${gains.length ? `: ${gains.slice(0, 6).join('; ')}${gains.length > 6 ? '; and more' : ''}.` : '.'}`, basis: 'A progression snapshot logged here', target: { type: 'snapshot', snapshotId: snapshot.id, entryId: entry.id }, entryIds: [entry.id, ...snapshot.gear.flatMap((g) => (g.entryId && entryById.has(g.entryId) ? [g.entryId] : []))] });
      auto.add(entry.id);
    });
  }
  for (const rule of rules) {
    const starts = rule.fromNodeId && recordedAt.has(rule.fromNodeId);
    const ends = rule.untilNodeId && recordedAt.has(rule.untilNodeId);
    if (!starts && !ends) continue;
    const who = name(rule.entryId) ?? 'Something';
    const what = rule.kind === 'status' ? (rule.state === 'deceased' ? 'deceased' : rule.label || 'changed') : rule.state === 'held' ? `held by ${name(rule.holderId) ?? 'someone'}` : (rule.state ?? 'changed');
    hard({ key: `rule:${rule.id}:${starts ? 'from' : 'until'}`, kind: 'possession', message: starts ? `${who} is tracked as ${what} from ${title(rule.fromNodeId)}.` : `${who} stops being ${what} from ${title(rule.untilNodeId)}.`, basis: 'A tracked continuity rule', target: { type: 'rule' }, entryIds: [rule.entryId, rule.holderId].filter((id): id is string => Boolean(id)) });
    if (rule.entryId && entryById.has(rule.entryId)) auto.add(rule.entryId);
  }
  for (const fact of facts) {
    const here = fact.sources.filter((s) => s.type === 'chapter' && s.refId && recordedAt.has(s.refId));
    if (!here.length) continue;
    const others = fact.sources.length - here.length;
    hard({ key: `fact:${fact.id}`, kind: 'canon', message: `The ${fact.status === 'canon' ? 'canon ' : ''}fact “${fact.subject}: ${fact.statement}” cites ${title(here[0].refId)} as ${others ? 'one of its sources' : 'its only source'}.`, basis: 'A canon fact’s source', target: { type: 'fact', factId: fact.id }, entryIds: fact.entryIds, factId: fact.id });
  }
  for (const e of events) {
    if (e.id === event?.id) continue;
    if (e.nodeIds.some((id) => recordedAt.has(id))) hard({ key: `told:${e.id}`, kind: 'chronology', message: `The event “${e.name}” is told in ${title(e.nodeIds.find((id) => recordedAt.has(id)))}.`, basis: 'A timeline event linked to this chapter', target: { type: 'event', eventId: e.id }, entryIds: e.characters.map((c) => c.id), eventId: e.id });
    if (event && (e.afterId === event.id || (e.when.precision === 'relative' && e.when.anchorId === event.id))) {
      hard({ key: `follows:${e.id}`, kind: 'chronology', message: `The event “${e.name}” is ${e.afterId === event.id ? 'set to come after' : 'dated relative to'} this one.`, basis: 'A chronological dependency', target: { type: 'event', eventId: e.id }, entryIds: e.characters.map((c) => c.id), eventId: e.id });
    }
  }
  if (event) for (const id of anchor) hard({ key: `telling:${id}`, kind: 'chronology', message: `${title(id)} is where this event is told.`, basis: 'A chapter linked to this event', target: { type: 'node', nodeId: id }, entryIds: [], nodeId: id });

  // ---- Who the change involves: worked out, then adjusted by the author.
  const suggested = [...auto].flatMap((id) => entryById.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set([...[...auto].filter((id) => !options.exclude?.includes(id)), ...(options.include ?? []).filter((id) => entryById.has(id))]);
  const seeds = [...chosen].flatMap((id) => entryById.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const involves = (ids: (string | null | undefined)[]) => seeds.filter((s) => ids.includes(s.id));

  // An entry met for the first time here is a recorded fact about the manuscript, not a guess.
  if (subject.type === 'node') {
    for (const entry of seeds) {
      const firstSeen = documents.find((d) => namedIn(d.id, entry));
      const laterCount = downstream.filter((d) => namedIn(d.id, entry)).length;
      if (firstSeen && inAnchor.has(firstSeen.id) && laterCount > 0) hard({ key: `intro:${entry.id}`, kind: 'introduction', message: `${entry.name} first appears in ${firstSeen.title}, and is named in ${plural(laterCount, 'later chapter or scene', 'later chapters and scenes')}.`, basis: 'The first place this entry is named', target: { type: 'entry', entryId: entry.id }, entryIds: [entry.id] });
    }
  }

  // ---- Potential: later things that involve the same people, places and threads.
  for (const doc of downstream) {
    const named = seeds.filter((s) => namedIn(doc.id, s));
    if (!named.length) continue;
    // Point at the first passage that names one of them, so the link lands on the line.
    let where: { block: number; term: string; excerpt: string } | undefined;
    for (const paragraph of text.get(doc.id) ?? []) {
      const [hit] = find(paragraph.text, named.flatMap((s) => [s.name, ...paragraph.links.filter((l) => l.entryId === s.id).map((l) => l.text)]));
      if (hit) {
        where = { block: paragraph.index, term: hit.text, excerpt: excerptAround(paragraph.text, hit.index, 180) };
        break;
      }
    }
    soft({ key: `appearance:${doc.id}`, kind: 'appearance', message: `${doc.title} involves ${list(named.map((s) => s.name))} and may need to account for the change.`, basis: where ? 'Named in the text after this point' : 'Listed in this chapter’s plan', target: { type: 'node', nodeId: doc.id, block: where?.block, term: where?.term }, excerpt: where?.excerpt, match: where?.term, nodeId: doc.id, entryIds: named.map((s) => s.id) });
  }
  const touched = new Set(established.flatMap((c) => (c.threadId ? [c.threadId] : [])));
  for (const t of threads) {
    if (t.id === thread?.id) continue;
    const later = t.beats.filter((b) => isLater(b.nodeId));
    const cast = involves([...t.characterIds, ...t.locationIds]);
    if (touched.has(t.id) && later.length) {
      soft({ key: `thread-later:${t.id}`, kind: 'thread', message: `The thread “${t.title}” continues in ${list(later.slice(0, 3).map((b) => title(b.nodeId)!))}${later.length > 3 ? ' and beyond' : ''}; ${later.length === 1 ? 'that development' : 'those developments'} may lack what set ${later.length === 1 ? 'it' : 'them'} in motion.`, basis: 'Later developments of a thread that develops here', target: { type: 'thread', threadId: t.id }, entryIds: cast.map((s) => s.id), threadId: t.id });
    } else if (!touched.has(t.id) && cast.length && OPEN_STATUSES.includes(t.status) && (later.length || t.beats.length === 0)) {
      soft({ key: `thread-open:${t.id}`, kind: 'thread', message: `The open thread “${t.title}” involves ${list(cast.map((s) => s.name))}${later.length ? ` and develops in ${list(later.slice(0, 3).map((b) => title(b.nodeId)!))}` : ''}; it could be affected.`, basis: 'An open thread with the same people or places', target: { type: 'thread', threadId: t.id }, entryIds: cast.map((s) => s.id), threadId: t.id });
    }
  }
  for (const relation of relations) {
    const pair = involves([relation.fromId, relation.toId]);
    if (!pair.length) continue;
    for (const stage of relation.stages.filter((s) => isLater(s.startNodeId))) {
      soft({ key: `stage-later:${stage.id}`, kind: 'relationship', message: `${name(relation.fromId) ?? 'Someone'} and ${name(relation.toId) ?? 'someone'} become “${stage.title.trim() || stage.label}” in ${title(stage.startNodeId)}; that turn may rest on what happens here.`, basis: 'A later stage of a relationship involving them', target: { type: 'relation', relationId: relation.id }, entryIds: [relation.fromId, relation.toId], relationId: relation.id });
    }
  }
  for (const entry of seeds) {
    const later = inStoryOrder(snapshots, nodes, entry.id).filter((s) => isLater(s.nodeId));
    if (later.length) soft({ key: `snapshots-later:${entry.id}`, kind: 'character-state', message: `${entry.name} has ${plural(later.length, 'later snapshot')} (${list(later.slice(0, 3).map((s) => title(s.nodeId)!))}${later.length > 3 ? ', …' : ''}) that carry forward from this point and may need revisiting.`, basis: 'Later progression snapshots of the same character', target: { type: 'snapshot', snapshotId: later[0].id, entryId: entry.id }, entryIds: [entry.id] });
  }
  for (const rule of rules) {
    const about = involves([rule.entryId, rule.holderId, rule.toEntryId]);
    if (about.length && isLater(rule.fromNodeId)) soft({ key: `rule-later:${rule.id}`, kind: 'possession', message: `A tracked rule about ${list(about.map((s) => s.name))} takes effect in ${title(rule.fromNodeId)}; it may assume what happens here.`, basis: 'A later continuity rule about them', target: { type: 'rule' }, entryIds: about.map((s) => s.id) });
  }
  const cited = new Set(established.flatMap((c) => (c.factId ? [c.factId] : [])));
  for (const fact of facts) {
    const about = involves(fact.entryIds);
    if (about.length && !cited.has(fact.id) && (fact.status === 'canon' || fact.status === 'provisional')) soft({ key: `fact-about:${fact.id}`, kind: 'canon', message: `The ${fact.status} fact “${fact.subject}: ${fact.statement}” is about ${list(about.map((s) => s.name))}; check that it still holds.`, basis: 'A fact about the same entry', target: { type: 'fact', factId: fact.id }, entryIds: about.map((s) => s.id), factId: fact.id });
  }
  const tied = new Set(established.flatMap((c) => (c.eventId ? [c.eventId] : [])));
  for (const e of events) {
    if (e.id === event?.id || tied.has(e.id)) continue;
    const about = involves([...e.characters.map((c) => c.id), e.locationId, ...e.entryIds]);
    if (about.length && e.nodeIds.some((id) => isLater(id))) soft({ key: `event-later:${e.id}`, kind: 'chronology', message: `The event “${e.name}”, told in ${title(e.nodeIds.find((id) => isLater(id)))}, involves ${list(about.map((s) => s.name))} and might play out differently.`, basis: 'A later-told event with the same people or places', target: { type: 'event', eventId: e.id }, entryIds: about.map((s) => s.id), eventId: e.id });
  }

  // The same project always gives the same report in the same order: by kind, then by where in the book, then by wording.
  const kindOrder: ConsequenceKind[] = ['appearance', 'thread', 'relationship', 'character-state', 'possession', 'canon', 'chronology', 'introduction'];
  const byOrder = (a: Consequence, b: Consequence) =>
    kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || (a.nodeId ? position(a.nodeId) : Number.MAX_SAFE_INTEGER) - (b.nodeId ? position(b.nodeId) : Number.MAX_SAFE_INTEGER) || a.message.localeCompare(b.message);
  established.sort(byOrder);
  potential.sort(byOrder);

  // ---- The size of it.
  const all = [...established, ...potential];
  const affected = new Set([...seeds.map((s) => s.id), ...all.flatMap((c) => c.entryIds)].filter((id) => entryById.has(id)));
  const inCategory = (test: (category: string) => boolean) => [...affected].filter((id) => test(entryById.get(id)!.category)).length;
  const distinct = (pick: (c: Consequence) => string | undefined) => new Set(all.flatMap((c) => pick(c) ?? [])).size;
  const summary = [
    { label: 'Characters', count: inCategory((c) => c === 'character') },
    { label: 'Locations', count: inCategory((c) => c === 'location') },
    { label: 'Lore Entries', count: inCategory((c) => c !== 'character' && c !== 'location') },
    { label: 'Plot Threads', count: distinct((c) => c.threadId) },
    { label: 'Chapters', count: new Set(all.flatMap((c) => (c.nodeId && !inAnchor.has(c.nodeId) ? [c.nodeId] : []))).size },
    { label: 'Relationships', count: distinct((c) => c.relationId) },
    { label: 'Events', count: distinct((c) => c.eventId) },
    { label: 'Canon Facts', count: distinct((c) => c.factId) },
  ].filter((part) => part.count > 0);
  const one: Record<string, string> = { Characters: 'Character', Locations: 'Location', 'Lore Entries': 'Lore Entry', 'Plot Threads': 'Plot Thread', Chapters: 'Chapter', Relationships: 'Relationship', Events: 'Event', 'Canon Facts': 'Canon Fact' };

  return {
    title: label, found, anchorIds: anchor, seeds, suggested, established, potential, summary,
    summaryLine: summary.length ? summary.map((part) => `${part.count} ${part.count === 1 ? one[part.label] : part.label}`).join(', ') : 'Nothing recorded depends on this',
    downstream: downstream.length,
  };
}
