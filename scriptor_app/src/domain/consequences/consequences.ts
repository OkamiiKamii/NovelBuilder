// WHAT DEPENDS ON THIS, as the original app's `src/modules/consequences`: before changing a chapter, an event or a
// development of a plot thread, what is recorded that hangs on it and what later in the story may. A pure reading of
// the novel as saved: it changes nothing, proposes no edit, and never rewrites text. A port of
// flutter_app/lib/shared/domain/consequences/consequences.dart and features/consequences/consequences_job.dart.

import { type Paragraph, WordIndex, excerptAround, findWords, paragraphsOf } from '../continuity/text';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, listOf, mapOrNull, str, strOrNull } from '../json';
import { StoryOrder } from '../model/storyOrder';
import { isDocument } from '../outline';
import { openStatuses } from '../plot/diagnostics';
import { ProgressSnapshot, compareSnapshots, inStoryOrder } from '../progression/snapshots';
import { maps } from '../records/jsonRecord';
import { StoryNode } from '../records/storyNode';
import { SystemBlueprint } from '../records/system';
import { stableSorted } from '../reader/stableSort';
import { dartTrim } from '../text/dartString';

/** What the author is thinking of changing: a chapter or scene, an event, or a development of a plot thread. */
export type Subject =
  | { kind: 'node'; nodeId: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'beat'; threadId: string; beatId: string };

/** Everything the analysis reads, as saved. */
export type World = {
  nodes: StoryNode[];
  docs: ReadonlyMap<string, unknown>;
  plans: JsonMap[];
  entries: JsonMap[];
  relations: JsonMap[];
  threads: JsonMap[];
  events: JsonMap[];
  facts: JsonMap[];
  rules: JsonMap[];
  snapshots: ProgressSnapshot[];
  systems: SystemBlueprint[];
};

export type ConsequenceKind =
  | 'appearance'
  | 'thread'
  | 'relationship'
  | 'characterState'
  | 'possession'
  | 'canon'
  | 'chronology'
  | 'introduction';

export const consequenceKindLabel: Readonly<Record<ConsequenceKind, string>> = {
  appearance: 'Later appearance',
  thread: 'Plot thread',
  relationship: 'Relationship',
  characterState: 'Character state',
  possession: 'Tracked rule',
  canon: 'Canon',
  chronology: 'Chronology',
  introduction: 'First appearance',
};

/** SPECULATION CONTROL RULE. `established`: recorded and tied to this exact point. `potential`: later things involving
 * the same people, places or threads; worded as a possibility, never treated as fact. */
export type Tier = 'established' | 'potential';

/** Where a consequence can be looked at: `{type: node, nodeId, block?, term?}`, `{type: entry, entryId}`,
 * `{type: thread, threadId}`, `{type: relation, relationId}`, `{type: snapshot, snapshotId, entryId}`, `{type: rule}`,
 * `{type: fact, factId}` or `{type: event, eventId}`. */
export type Target = JsonMap;

export type Consequence = {
  /** The same for the same finding, so ticks the author gives it hold. */
  key: string;
  tier: Tier;
  kind: ConsequenceKind;
  message: string;
  basis: string;
  target: Target;
  excerpt: string | null;
  match: string | null;
  nodeId: string | null;
  entryIds: string[];
  threadId: string | null;
  relationId: string | null;
  eventId: string | null;
  factId: string | null;
};

function consequence(c: Partial<Consequence> & Pick<Consequence, 'key' | 'tier' | 'kind' | 'message' | 'basis' | 'target'>): Consequence {
  return {
    excerpt: null,
    match: null,
    nodeId: null,
    entryIds: [],
    threadId: null,
    relationId: null,
    eventId: null,
    factId: null,
    ...c,
  };
}

export type Report = {
  /** The subject in words. */
  title: string;
  /** False when the subject no longer exists. */
  found: boolean;
  /** The chapters and scenes the change is in. */
  anchorIds: string[];
  /** The codex entries the change is taken to involve (after the author's additions and removals). */
  seeds: JsonMap[];
  /** The ones worked out from the subject, before the author's choices. */
  suggested: JsonMap[];
  established: Consequence[];
  potential: Consequence[];
  summary: { label: string; count: number }[];
  summaryLine: string;
  downstream: number;
};

const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
const list = (names: readonly string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, names.length - 1).join(', ')} and ${names[names.length - 1]}`;

const ids = (v: unknown): string[] => listOf(v).flatMap((x) => (strOrNull(x) === null ? [] : [x as string]));
const idOf = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** storyOrder's subtreeIds, taking each node once: the same list wherever that finishes, and an end on a parent cycle. */
function subtreeOnce(nodes: readonly StoryNode[], rootId: string): string[] {
  const out = [rootId];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const node of nodes) {
      if (node.parentId === out[i] && !seen.has(node.id)) {
        seen.add(node.id);
        out.push(node.id);
      }
    }
  }
  return out;
}

/** Works out what hangs on a point in the story. Reads what it is given and returns a report; changes nothing. */
export function analyze(
  world: World,
  subject: Subject,
  options: { include?: readonly string[]; exclude?: readonly string[] } = {},
): Report {
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];
  const nodes = world.nodes;
  const order = StoryOrder.of(nodes);
  const position = (id: string | null) => (id === null ? -1 : (order.position.get(id) ?? -1));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const entryById = new Map(world.entries.map((e) => [str(e['id']), e]));
  const name = (id: string | null) => (id === null ? null : entryById.has(id) ? str(entryById.get(id)!['name']) : null);
  const title = (id: string | null) => (id === null ? null : (nodeById.get(id)?.title ?? null));
  const documents = stableSorted(
    nodes.filter((n) => isDocument(n.kind)),
    (a, b) => position(a.id) - position(b.id),
  );
  const text = new Map<string, Paragraph[]>(
    documents.map((d) => [d.id, paragraphsOf(world.docs.get(d.id)).filter((p) => dartTrim(p.text).length > 0)]),
  );
  const planOf = new Map(world.plans.map((p) => [str(p['id']), p]));
  // subtreeIds never ends on a parent cycle (a damaged novel can have one); here each node is taken once, which is the
  // original's answer wherever it finishes.
  const subtree = (id: string) => subtreeOnce(nodes, id);

  // ---- What the change is, and where it sits.
  let label = '';
  let found = true;
  let anchor: string[] = [];
  const auto = new Set<string>();
  const event = subject.kind === 'event' ? (world.events.find((e) => e['id'] === subject.eventId) ?? null) : null;
  const thread = subject.kind === 'beat' ? (world.threads.find((t) => t['id'] === subject.threadId) ?? null) : null;
  const beat = subject.kind === 'beat' ? (maps(thread?.['beats']).find((b) => b['id'] === subject.beatId) ?? null) : null;

  switch (subject.kind) {
    case 'node': {
      const node = nodeById.get(subject.nodeId) ?? null;
      found = node !== null;
      label = node?.title ?? 'A chapter that was removed';
      anchor = node === null ? [] : subtree(node.id).filter((id) => isDocument(nodeById.get(id)?.kind ?? null));
      break;
    }
    case 'event': {
      found = event !== null;
      label = event !== null ? `the event “${str(event['name'])}”` : 'An event that was removed';
      anchor = ids(event?.['nodeIds']).filter((id) => nodeById.has(id));
      for (const id of [
        ...maps(event?.['characters']).map((c) => str(c['id'])),
        ...(idOf(event?.['locationId']) === null ? [] : [idOf(event?.['locationId'])!]),
        ...ids(event?.['entryIds']),
      ]) {
        if (id.length > 0 && entryById.has(id)) auto.add(id);
      }
      break;
    }
    case 'beat': {
      found = thread !== null && beat !== null;
      label = beat !== null ? `“${str(beat['title'])}” in the thread “${str(thread!['title'])}”` : 'A development that was removed';
      const at = idOf(beat?.['nodeId']);
      anchor = at !== null && nodeById.has(at) ? [at] : [];
      for (const id of [...ids(thread?.['characterIds']), ...ids(thread?.['locationIds'])]) {
        if (entryById.has(id)) auto.add(id);
      }
      break;
    }
  }
  const inAnchor = new Set(anchor);
  // Group nodes count too: a relationship stage can start at a volume.
  const anchorNodes = subject.kind === 'node' && found ? new Set(subtree(subject.nodeId)) : inAnchor;
  const from = anchor.length === 0 ? -1 : Math.min(...anchor.map(position));
  const downstream = documents.filter(
    (d) => !inAnchor.has(d.id) && (anchor.length === 0 ? subject.kind !== 'node' : position(d.id) > from),
  );
  const downIds = new Set(downstream.map((d) => d.id));
  const isLater = (nodeId: string | null) =>
    nodeId !== null &&
    nodeId.length > 0 &&
    (downIds.has(nodeId) || subtree(nodeId).some((id) => downIds.has(id))) &&
    !anchorNodes.has(nodeId);

  // Each chapter's words, read once when first asked.
  const words = new Map<string, WordIndex>();
  const wordsOf = (nodeId: string) => {
    let w = words.get(nodeId);
    if (w === undefined) words.set(nodeId, (w = new WordIndex((text.get(nodeId) ?? []).map((p) => p.text).join('\n'))));
    return w;
  };
  const namedIn = (nodeId: string, entry: JsonMap): boolean => {
    const id = str(entry['id']);
    const node = nodeById.get(nodeId);
    if (ids(node?.raw['mentions']).includes(id) || ids(planOf.get(nodeId)?.['entityIds']).includes(id)) return true;
    const paragraphs = text.get(nodeId) ?? [];
    return paragraphs.some((p) => p.links.some((l) => l.entryId === id)) || wordsOf(nodeId).has(str(entry['name']));
  };

  if (subject.kind === 'node') {
    for (const id of anchor) {
      for (const entry of world.entries) {
        if (namedIn(id, entry)) auto.add(str(entry['id']));
      }
    }
  }

  const established: Consequence[] = [];
  const potential: Consequence[] = [];

  // ---- Established: records tied to this exact point.
  const recordedAt = subject.kind === 'node' ? anchorNodes : new Set<string>();
  if (subject.kind !== 'beat') {
    for (const t of world.threads) {
      const cast = [...ids(t['characterIds']), ...ids(t['locationIds'])];
      for (const b of maps(t['beats'])) {
        const at = idOf(b['nodeId']);
        if (at === null || !recordedAt.has(at)) continue;
        established.push(
          consequence({
            key: `beat:${str(b['id'])}`,
            tier: 'established',
            kind: 'thread',
            message: `The thread “${str(t['title'])}” has its development “${str(b['title'])}” recorded in ${title(at)}.`,
            basis: 'A development placed in this chapter',
            target: { type: 'thread', threadId: str(t['id']) },
            entryIds: cast,
            threadId: str(t['id']),
            nodeId: at,
          }),
        );
        for (const id of cast) if (entryById.has(id)) auto.add(id);
      }
      const target = idOf(t['targetNodeId']);
      if (target !== null && recordedAt.has(target)) {
        established.push(
          consequence({
            key: `target:${str(t['id'])}`,
            tier: 'established',
            kind: 'thread',
            message: `The thread “${str(t['title'])}” is meant to resolve in ${title(target)}.`,
            basis: 'The thread’s target resolution',
            target: { type: 'thread', threadId: str(t['id']) },
            threadId: str(t['id']),
          }),
        );
      }
    }
  }
  if (thread !== null && beat !== null) {
    for (const b of maps(thread['beats'])) {
      if (b['id'] === beat['id'] || !isLater(idOf(b['nodeId']))) continue;
      established.push(
        consequence({
          key: `beat:${str(b['id'])}`,
          tier: 'established',
          kind: 'thread',
          message: `“${str(b['title'])}” in ${title(idOf(b['nodeId']))} is the thread’s next recorded step after this one.`,
          basis: 'A later development of the same thread',
          target: { type: 'thread', threadId: str(thread['id']) },
          threadId: str(thread['id']),
          nodeId: idOf(b['nodeId']),
        }),
      );
    }
  }
  for (const relation of world.relations) {
    const fromId = str(relation['fromId']);
    const toId = str(relation['toId']);
    for (const stage of maps(relation['stages'])) {
      const at = idOf(stage['startNodeId']);
      if (at === null || !recordedAt.has(at)) continue;
      const pair = `${name(fromId) ?? 'Someone'} and ${name(toId) ?? 'someone'}`;
      const ev = dartTrim(str(stage['event']));
      established.push(
        consequence({
          key: `stage:${str(stage['id'])}`,
          tier: 'established',
          kind: 'relationship',
          message:
            `${pair} become “${dartTrim(str(stage['title'])).length > 0 ? dartTrim(str(stage['title'])) : str(stage['label'])}” ` +
            `starting in ${title(at)}${ev.length > 0 ? ` (${ev})` : ''}.`,
          basis: 'A relationship stage that starts here',
          target: { type: 'relation', relationId: str(relation['id']) },
          entryIds: [fromId, toId],
          relationId: str(relation['id']),
        }),
      );
      for (const id of [fromId, toId]) if (entryById.has(id)) auto.add(id);
    }
  }
  for (const entry of world.entries) {
    const id = str(entry['id']);
    const mine = inStoryOrder(world.snapshots, nodes, id);
    mine.forEach((snapshot, i) => {
      const at = snapshot.nodeId;
      if (at === null || !recordedAt.has(at)) return;
      const previous = i > 0 ? mine[i - 1] : null;
      const diff = previous === null ? null : compareSnapshots(previous, snapshot, world.systems);
      const gains =
        diff === null
          ? []
          : [
              ...diff.advancement.map((x) => `${x.name} ${x.from} → ${x.to}`),
              ...diff.gained.map((x) => `gains ${x.name}`),
              ...diff.gear.filter((g) => g.change === 'gained').map((g) => `receives ${g.name}`),
              ...diff.gear.filter((g) => g.change === 'lost').map((g) => `loses ${g.name}`),
              ...diff.status.flatMap((st) => st.added.map((line) => `now “${line}”`)),
            ];
      established.push(
        consequence({
          key: `snapshot:${snapshot.id}`,
          tier: 'established',
          kind: 'characterState',
          message:
            `${str(entry['name'])}’s state${snapshot.label.length > 0 ? ` “${snapshot.label}”` : ''} is logged at ` +
            `${title(at)}${gains.length > 0 ? `: ${gains.slice(0, 6).join('; ')}${gains.length > 6 ? '; and more' : ''}.` : '.'}`,
          basis: 'A progression snapshot logged here',
          target: { type: 'snapshot', snapshotId: snapshot.id, entryId: id },
          entryIds: [id, ...snapshot.gear.flatMap((g) => (g.entryId !== null && entryById.has(g.entryId) ? [g.entryId] : []))],
        }),
      );
      auto.add(id);
    });
  }
  for (const rule of world.rules) {
    const fromNode = idOf(rule['fromNodeId']);
    const untilNode = idOf(rule['untilNodeId']);
    const starts = fromNode !== null && recordedAt.has(fromNode);
    const ends = untilNode !== null && recordedAt.has(untilNode);
    if (!starts && !ends) continue;
    const who = name(idOf(rule['entryId'])) ?? 'Something';
    const state = typeof rule['state'] === 'string' ? (rule['state'] as string) : null;
    const what =
      rule['kind'] === 'status'
        ? state === 'deceased'
          ? 'deceased'
          : str(rule['label']).length > 0
            ? str(rule['label'])
            : 'changed'
        : state === 'held'
          ? `held by ${name(idOf(rule['holderId'])) ?? 'someone'}`
          : (state ?? 'changed');
    established.push(
      consequence({
        key: `rule:${str(rule['id'])}:${starts ? 'from' : 'until'}`,
        tier: 'established',
        kind: 'possession',
        message: starts ? `${who} is tracked as ${what} from ${title(fromNode)}.` : `${who} stops being ${what} from ${title(untilNode)}.`,
        basis: 'A tracked continuity rule',
        target: { type: 'rule' },
        entryIds: [idOf(rule['entryId']), idOf(rule['holderId'])].filter((x): x is string => x !== null),
      }),
    );
    const entryId = idOf(rule['entryId']);
    if (entryId !== null && entryById.has(entryId)) auto.add(entryId);
  }
  for (const fact of world.facts) {
    const sources = maps(fact['sources']);
    const here = sources.filter((s) => s['type'] === 'chapter' && idOf(s['refId']) !== null && recordedAt.has(s['refId'] as string));
    if (here.length === 0) continue;
    const others = sources.length - here.length;
    established.push(
      consequence({
        key: `fact:${str(fact['id'])}`,
        tier: 'established',
        kind: 'canon',
        message:
          `The ${fact['status'] === 'canon' ? 'canon ' : ''}fact “${str(fact['subject'])}: ${str(fact['statement'])}” cites ` +
          `${title(idOf(here[0]['refId']))} as ${others > 0 ? 'one of its sources' : 'its only source'}.`,
        basis: 'A canon fact’s source',
        target: { type: 'fact', factId: str(fact['id']) },
        entryIds: ids(fact['entryIds']),
        factId: str(fact['id']),
      }),
    );
  }
  for (const e of world.events) {
    if (event !== null && e['id'] === event['id']) continue;
    const told = ids(e['nodeIds']);
    const characters = maps(e['characters']).map((c) => str(c['id']));
    if (told.some((id) => recordedAt.has(id))) {
      established.push(
        consequence({
          key: `told:${str(e['id'])}`,
          tier: 'established',
          kind: 'chronology',
          message: `The event “${str(e['name'])}” is told in ${title(told.find((id) => recordedAt.has(id))!)}.`,
          basis: 'A timeline event linked to this chapter',
          target: { type: 'event', eventId: str(e['id']) },
          entryIds: characters,
          eventId: str(e['id']),
        }),
      );
    }
    const when = mapOrNull(e['when']) ?? {};
    if (event !== null && (e['afterId'] === event['id'] || (when['precision'] === 'relative' && when['anchorId'] === event['id']))) {
      established.push(
        consequence({
          key: `follows:${str(e['id'])}`,
          tier: 'established',
          kind: 'chronology',
          message: `The event “${str(e['name'])}” is ${e['afterId'] === event['id'] ? 'set to come after' : 'dated relative to'} this one.`,
          basis: 'A chronological dependency',
          target: { type: 'event', eventId: str(e['id']) },
          entryIds: characters,
          eventId: str(e['id']),
        }),
      );
    }
  }
  if (event !== null) {
    for (const id of anchor) {
      established.push(
        consequence({
          key: `telling:${id}`,
          tier: 'established',
          kind: 'chronology',
          message: `${title(id)} is where this event is told.`,
          basis: 'A chapter linked to this event',
          target: { type: 'node', nodeId: id },
          nodeId: id,
        }),
      );
    }
  }

  // ---- Who the change involves: worked out, then adjusted by the author.
  const byName = (a: JsonMap, b: JsonMap) => localeCompare(str(a['name']), str(b['name']));
  const suggested = stableSorted(
    [...auto].flatMap((id) => (entryById.has(id) ? [entryById.get(id)!] : [])),
    byName,
  );
  const chosen = new Set([...[...auto].filter((id) => !exclude.includes(id)), ...include.filter((id) => entryById.has(id))]);
  const seeds = stableSorted(
    [...chosen].flatMap((id) => (entryById.has(id) ? [entryById.get(id)!] : [])),
    byName,
  );
  const involves = (wanted: readonly (string | null)[]) => seeds.filter((s) => wanted.includes(str(s['id'])));

  // An entry met for the first time here is a recorded fact about the manuscript, not a guess.
  if (subject.kind === 'node') {
    for (const entry of seeds) {
      const firstSeen = documents.find((d) => namedIn(d.id, entry)) ?? null;
      const laterCount = downstream.filter((d) => namedIn(d.id, entry)).length;
      if (firstSeen !== null && inAnchor.has(firstSeen.id) && laterCount > 0) {
        established.push(
          consequence({
            key: `intro:${str(entry['id'])}`,
            tier: 'established',
            kind: 'introduction',
            message:
              `${str(entry['name'])} first appears in ${firstSeen.title}, and is named in ` +
              `${plural(laterCount, 'later chapter or scene', 'later chapters and scenes')}.`,
            basis: 'The first place this entry is named',
            target: { type: 'entry', entryId: str(entry['id']) },
            entryIds: [str(entry['id'])],
          }),
        );
      }
    }
  }

  // ---- Potential: later things that involve the same people, places and threads.
  for (const doc of downstream) {
    const named = seeds.filter((s) => namedIn(doc.id, s));
    if (named.length === 0) continue;
    // Point at the first passage that names one of them, so the link lands on the line.
    let where: { block: number; term: string; excerpt: string } | null = null;
    for (const paragraph of text.get(doc.id) ?? []) {
      const terms = named.flatMap((s) => [str(s['name']), ...paragraph.links.filter((l) => l.entryId === s['id']).map((l) => l.text)]);
      const hit = findWords(paragraph.text, terms)[0];
      if (hit !== undefined) {
        where = { block: paragraph.index, term: hit.text, excerpt: excerptAround(paragraph.text, hit.index, 180) };
        break;
      }
    }
    potential.push(
      consequence({
        key: `appearance:${doc.id}`,
        tier: 'potential',
        kind: 'appearance',
        message: `${doc.title} involves ${list(named.map((s) => str(s['name'])))} and may need to account for the change.`,
        basis: where !== null ? 'Named in the text after this point' : 'Listed in this chapter’s plan',
        target: { type: 'node', nodeId: doc.id, ...(where !== null ? { block: where.block, term: where.term } : {}) },
        excerpt: where?.excerpt ?? null,
        match: where?.term ?? null,
        nodeId: doc.id,
        entryIds: named.map((s) => str(s['id'])),
      }),
    );
  }
  const touched = new Set(established.flatMap((c) => (c.threadId === null ? [] : [c.threadId])));
  for (const t of world.threads) {
    if (thread !== null && t['id'] === thread['id']) continue;
    const later = maps(t['beats']).filter((b) => isLater(idOf(b['nodeId'])));
    const cast = involves([...ids(t['characterIds']), ...ids(t['locationIds'])]);
    const laterTitles = later.slice(0, 3).map((b) => title(idOf(b['nodeId']))!);
    const tid = str(t['id']);
    if (touched.has(tid) && later.length > 0) {
      potential.push(
        consequence({
          key: `thread-later:${tid}`,
          tier: 'potential',
          kind: 'thread',
          message:
            `The thread “${str(t['title'])}” continues in ${list(laterTitles)}${later.length > 3 ? ' and beyond' : ''}; ` +
            `${later.length === 1 ? 'that development' : 'those developments'} may lack what set ` +
            `${later.length === 1 ? 'it' : 'them'} in motion.`,
          basis: 'Later developments of a thread that develops here',
          target: { type: 'thread', threadId: tid },
          entryIds: cast.map((s) => str(s['id'])),
          threadId: tid,
        }),
      );
    } else if (
      !touched.has(tid) &&
      cast.length > 0 &&
      openStatuses.includes(str(t['status'])) &&
      (later.length > 0 || maps(t['beats']).length === 0)
    ) {
      potential.push(
        consequence({
          key: `thread-open:${tid}`,
          tier: 'potential',
          kind: 'thread',
          message:
            `The open thread “${str(t['title'])}” involves ${list(cast.map((s) => str(s['name'])))}` +
            `${later.length > 0 ? ` and develops in ${list(laterTitles)}` : ''}; it could be affected.`,
          basis: 'An open thread with the same people or places',
          target: { type: 'thread', threadId: tid },
          entryIds: cast.map((s) => str(s['id'])),
          threadId: tid,
        }),
      );
    }
  }
  for (const relation of world.relations) {
    const fromId = str(relation['fromId']);
    const toId = str(relation['toId']);
    if (involves([fromId, toId]).length === 0) continue;
    for (const stage of maps(relation['stages'])) {
      const at = idOf(stage['startNodeId']);
      if (!isLater(at)) continue;
      potential.push(
        consequence({
          key: `stage-later:${str(stage['id'])}`,
          tier: 'potential',
          kind: 'relationship',
          message:
            `${name(fromId) ?? 'Someone'} and ${name(toId) ?? 'someone'} become ` +
            `“${dartTrim(str(stage['title'])).length > 0 ? dartTrim(str(stage['title'])) : str(stage['label'])}” in ${title(at)}; ` +
            'that turn may rest on what happens here.',
          basis: 'A later stage of a relationship involving them',
          target: { type: 'relation', relationId: str(relation['id']) },
          entryIds: [fromId, toId],
          relationId: str(relation['id']),
        }),
      );
    }
  }
  for (const entry of seeds) {
    const id = str(entry['id']);
    const later = inStoryOrder(world.snapshots, nodes, id).filter((s) => isLater(s.nodeId));
    if (later.length === 0) continue;
    potential.push(
      consequence({
        key: `snapshots-later:${id}`,
        tier: 'potential',
        kind: 'characterState',
        message:
          `${str(entry['name'])} has ${plural(later.length, 'later snapshot')} ` +
          `(${list(later.slice(0, 3).map((s) => title(s.nodeId)!))}${later.length > 3 ? ', …' : ''}) that carry forward ` +
          'from this point and may need revisiting.',
        basis: 'Later progression snapshots of the same character',
        target: { type: 'snapshot', snapshotId: later[0].id, entryId: id },
        entryIds: [id],
      }),
    );
  }
  for (const rule of world.rules) {
    const about = involves([idOf(rule['entryId']), idOf(rule['holderId']), idOf(rule['toEntryId'])]);
    const at = idOf(rule['fromNodeId']);
    if (about.length === 0 || !isLater(at)) continue;
    potential.push(
      consequence({
        key: `rule-later:${str(rule['id'])}`,
        tier: 'potential',
        kind: 'possession',
        message: `A tracked rule about ${list(about.map((s) => str(s['name'])))} takes effect in ${title(at)}; it may assume what happens here.`,
        basis: 'A later continuity rule about them',
        target: { type: 'rule' },
        entryIds: about.map((s) => str(s['id'])),
      }),
    );
  }
  const cited = new Set(established.flatMap((c) => (c.factId === null ? [] : [c.factId])));
  for (const fact of world.facts) {
    const about = involves(ids(fact['entryIds']));
    const status = str(fact['status']);
    if (about.length === 0 || cited.has(fact['id'] as string) || (status !== 'canon' && status !== 'provisional')) continue;
    potential.push(
      consequence({
        key: `fact-about:${str(fact['id'])}`,
        tier: 'potential',
        kind: 'canon',
        message:
          `The ${status} fact “${str(fact['subject'])}: ${str(fact['statement'])}” is about ` +
          `${list(about.map((s) => str(s['name'])))}; check that it still holds.`,
        basis: 'A fact about the same entry',
        target: { type: 'fact', factId: str(fact['id']) },
        entryIds: about.map((s) => str(s['id'])),
        factId: str(fact['id']),
      }),
    );
  }
  const tied = new Set(established.flatMap((c) => (c.eventId === null ? [] : [c.eventId])));
  for (const e of world.events) {
    if ((event !== null && e['id'] === event['id']) || tied.has(e['id'] as string)) continue;
    const about = involves([...maps(e['characters']).map((c) => str(c['id'])), idOf(e['locationId']), ...ids(e['entryIds'])]);
    const told = ids(e['nodeIds']);
    if (about.length === 0 || !told.some(isLater)) continue;
    potential.push(
      consequence({
        key: `event-later:${str(e['id'])}`,
        tier: 'potential',
        kind: 'chronology',
        message:
          `The event “${str(e['name'])}”, told in ${title(told.find(isLater)!)}, involves ` +
          `${list(about.map((s) => str(s['name'])))} and might play out differently.`,
        basis: 'A later-told event with the same people or places',
        target: { type: 'event', eventId: str(e['id']) },
        entryIds: about.map((s) => str(s['id'])),
        eventId: str(e['id']),
      }),
    );
  }

  // The same novel always gives the same report in the same order: by kind, then by where in the book, then wording.
  const kindOrder: readonly ConsequenceKind[] = [
    'appearance',
    'thread',
    'relationship',
    'characterState',
    'possession',
    'canon',
    'chronology',
    'introduction',
  ];
  const far = 9007199254740991;
  const byOrder = (a: Consequence, b: Consequence) => {
    const k = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (k !== 0) return k;
    const pa = a.nodeId !== null ? position(a.nodeId) : far;
    const pb = b.nodeId !== null ? position(b.nodeId) : far;
    const p = pa < pb ? -1 : pa > pb ? 1 : 0;
    return p !== 0 ? p : localeCompare(a.message, b.message);
  };
  const est = stableSorted(established, byOrder);
  const pot = stableSorted(potential, byOrder);

  // ---- The size of it.
  const all = [...est, ...pot];
  const affected = new Set(
    [...seeds.map((s) => str(s['id'])), ...all.flatMap((c) => c.entryIds)].filter((id) => entryById.has(id)),
  );
  const inCategory = (test: (category: string) => boolean) => [...affected].filter((id) => test(str(entryById.get(id)!['category']))).length;
  const distinct = (pick: (c: Consequence) => string | null) => new Set(all.flatMap((c) => (pick(c) === null ? [] : [pick(c)!]))).size;
  const summary = [
    { label: 'Characters', count: inCategory((c) => c === 'character') },
    { label: 'Locations', count: inCategory((c) => c === 'location') },
    { label: 'Lore Entries', count: inCategory((c) => c !== 'character' && c !== 'location') },
    { label: 'Plot Threads', count: distinct((c) => c.threadId) },
    { label: 'Chapters', count: new Set(all.flatMap((c) => (c.nodeId !== null && !inAnchor.has(c.nodeId) ? [c.nodeId] : []))).size },
    { label: 'Relationships', count: distinct((c) => c.relationId) },
    { label: 'Events', count: distinct((c) => c.eventId) },
    { label: 'Canon Facts', count: distinct((c) => c.factId) },
  ].filter((p) => p.count > 0);
  const one: Readonly<Record<string, string>> = {
    Characters: 'Character',
    Locations: 'Location',
    'Lore Entries': 'Lore Entry',
    'Plot Threads': 'Plot Thread',
    Chapters: 'Chapter',
    Relationships: 'Relationship',
    Events: 'Event',
    'Canon Facts': 'Canon Fact',
  };
  return {
    title: label,
    found,
    anchorIds: anchor,
    seeds,
    suggested,
    established: est,
    potential: pot,
    summary,
    summaryLine:
      summary.length > 0 ? summary.map((p) => `${p.count} ${p.count === 1 ? one[p.label] : p.label}`).join(', ') : 'Nothing recorded depends on this',
    downstream: downstream.length,
  };
}

// ---------------------------------------------------------------------------------------------------------- the job

/** What "What depends on this" reads of a novel. */
export const consequenceCollections: readonly string[] = [
  'chapters',
  'chapterContents',
  'chapterPlans',
  'loreEntries',
  'characterRelations',
  'plotThreads',
  'timelineEvents',
  'canonFacts',
  'continuityRules',
  'progressSnapshots',
  'systems',
];

/** The novel as the analysis reads it, from its records (each collection's, in their stored order). */
export function worldFromRows(rows: (collection: string) => readonly JsonMap[]): World {
  return {
    nodes: rows('chapters').map((r) => new StoryNode(r)),
    docs: new Map(rows('chapterContents').map((r) => [str(r['id']), r['doc']])),
    plans: [...rows('chapterPlans')],
    entries: [...rows('loreEntries')],
    relations: [...rows('characterRelations')],
    threads: [...rows('plotThreads')],
    events: [...rows('timelineEvents')],
    facts: [...rows('canonFacts')],
    rules: [...rows('continuityRules')],
    snapshots: rows('progressSnapshots').map((r) => new ProgressSnapshot(r)),
    systems: rows('systems').map((r) => new SystemBlueprint(r)),
  };
}

/** The address of "What depends on this" for a chapter or scene, an event, or a development of a plot thread. */
export function consequencesPath(args: { nodeId?: string | null; eventId?: string | null; threadId?: string | null; beatId?: string | null }): string {
  const q: string[] = [];
  const add = (k: string, v: string | null | undefined) => {
    if (v !== null && v !== undefined) q.push(`${k}=${encodeURIComponent(v)}`);
  };
  add('node', args.nodeId);
  add('event', args.eventId);
  add('thread', args.threadId);
  add('beat', args.beatId);
  return `/review/consequences${q.length > 0 ? `?${q.join('&')}` : ''}`;
}
