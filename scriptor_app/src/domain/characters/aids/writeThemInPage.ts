// WRITE THEM IN (writeThemIn.ts): from a character straight to the page. Where the scene goes (a chapter still blank,
// a new chapter at the end, a new scene in the latest chapter), who else is in it (those they are tied to first) and
// whether it is told through their eyes, and the spark to start from, made of what is written about them (or the
// author's own). **Start writing** makes the chapter or scene when it is a new one, keeps the spark as its objective
// and the cast as who appears in its plan, and opens it in the editor. No words of the story are written. The pure
// parts of flutter_app/lib/features/characters/widgets/write_them_in_page.dart.
//
// What a press changes: a place, a person, the eyes switch, a spark (or typing "Or your own", which chooses it) only
// change the page. "Start writing" (pressable unless "your own" is chosen and empty): `start()` says what to make:
// for a new chapter, ManuscriptService.create(novelId, 'chapter', <the parent of the chapter it follows, or the top
// level>); for a new scene, create(novelId, 'scene', <the latest chapter>); a blank chapter is used as it is. Then the
// plan of that chapter or scene, `updatePlan(c, nodeId, start.edit)` (a PlotChanges.updatePlan port, below): the spark
// as its objective (when not empty), the character and those chosen added to who appears, and with "Told through
// their eyes" the character as its point of view. Then it is selected and the editor opens (/write).

import { type RecordChanges, ChangeRefused } from '../../codex/codexChanges';
import { type JsonMap, listOf } from '../../json';
import { readingOrder } from '../../model/storyOrder';
import { maps, strings } from '../../records/jsonRecord';
import { CharacterRelation } from '../../records/relation';
import { StoryNode } from '../../records/storyNode';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { stakesOf } from '../stakes';
import { type PlaceKind, type SceneSpark, type ScenePlace, placesFor, sparksFor } from '../writeThemIn';

/** Those `me` is tied to (not archived, each once), each with what they are to them: the latest stage of the tie, its
 * title else its label. */
export function writeThemInTies(cast: CastData, me: Listed): { id: string; other: string; tie: string }[] {
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const out: { id: string; other: string; tie: string }[] = [];
  for (const r of cast.snapshot.rows('characterRelations').map((row) => new CharacterRelation(row))) {
    const other = r.fromId === me.entry.id ? r.toId : r.toId === me.entry.id ? r.fromId : null;
    const them = other === null ? undefined : byId.get(other);
    if (them === undefined || them.profile.archived || out.some((t) => t.id === other)) continue;
    const stages = r.stages;
    const stage = stages.length > 0 ? stages[stages.length - 1] : null;
    const tie = stage === null ? '' : dartTrim(stage.title).length > 0 ? dartTrim(stage.title) : dartTrim(stage.label);
    out.push({ id: them.entry.id, other: them.entry.name, tie });
  }
  return out;
}

/** The chapters and scenes, in reading order. */
export function writeThemInDocuments(cast: CastData): StoryNode[] {
  return readingOrder(cast.snapshot.rows('chapters').map((r) => new StoryNode(r))).filter(
    (n) => n.kind === 'chapter' || n.kind === 'scene',
  );
}

export const writeThemInWords = {
  title: (name: string) => `Write ${name} in`,
  intro: (name: string) =>
    `A scene with ${name}, started from what you know of them. Nothing is written for you: the spark is kept as the scene’s objective, and the page is yours.`,
  where: 'WHERE IT GOES',
  who: 'WHO ELSE IS THERE',
  alone: (name: string) => `No one else in the cast yet: ${name} alone.`,
  eyes: (name: string) => `Told through ${name}’s eyes`,
  spark: 'THE SPARK',
  own: 'Or your own',
  start: 'Start writing',
} as const;

/** What the page offers for a character of the cast. */
export type WriteThemInView = {
  me: Listed;
  name: string;
  places: ScenePlace[];
  sparks: SceneSpark[];
  /** Who else can be there: those they are tied to first (with the tie), then the rest of the cast not archived; at
   * most 16. Each chip reads "Kai · Rival", or the name alone. */
  others: { id: string; name: string; tie: string; label: string }[];
};

export function writeThemInView(cast: CastData, entryId: string): WriteThemInView | null {
  const me = cast.listed(entryId);
  if (me === null) return null;
  const name = me.entry.name;
  const places = placesFor(
    writeThemInDocuments(cast).map((n) => ({
      id: n.id,
      kind: n.kindKey,
      parentId: n.parentId,
      title: n.title,
      words: n.wordCount,
      planned: dartTrim(cast.model.plans.get(n.id)?.objective ?? '').length > 0,
    })),
  );
  const ties = writeThemInTies(cast, me);
  const fields = new Map<string, string>();
  for (const f of me.entry.fields) fields.set(dartToLowerCase(dartTrim(f.key)), f.value);
  const sparks = sparksFor(
    name,
    stakesOf(fields),
    ties.map((t) => ({ other: t.other, tie: t.tie })),
  );
  const others = [
    ...ties.map((t) => ({ id: t.id, name: t.other, tie: t.tie })),
    ...cast.list
      .filter((l) => l.entry.id !== me.entry.id && !l.profile.archived && !ties.some((t) => t.id === l.entry.id))
      .map((l) => ({ id: l.entry.id, name: l.entry.name, tie: '' })),
  ]
    .slice(0, 16)
    .map((o) => ({ ...o, label: o.tie.length === 0 ? o.name : `${o.name} · ${o.tie}` }));
  return { me, name, places, sparks, others };
}

/** What Start writing makes and keeps. */
export type WriteThemInStart = {
  kind: PlaceKind;
  /** The chapter or scene to make first (null: the blank chapter, `nodeId`, is used). */
  create: { kind: 'chapter' | 'scene'; parentId: string | null } | null;
  nodeId: string | null;
  /** The plan's change, given the plan as stored (PlotChanges.updatePlan's `edit`). */
  edit: (stored: JsonMap) => JsonMap;
};

/** The page's choices: the place (by index), the spark (by index; `sparks.length` is "your own"), the eyes, those
 * chosen to be there, what is typed as their own. */
export class WriteThemInState {
  place = 0;
  spark = 0;
  eyes = true;
  readonly with = new Set<string>();
  own = '';

  /** A person's chip pressed. */
  toggle(id: string, on: boolean): void {
    if (on) this.with.add(id);
    else this.with.delete(id);
  }

  /** Typing "Or your own" (or pressing into it) chooses it. */
  typeOwn(text: string, sparks: number): void {
    this.own = text;
    this.spark = sparks;
  }

  ready(sparks: number): boolean {
    return this.spark !== sparks || dartTrim(this.own).length > 0;
  }

  start(view: WriteThemInView, documents: readonly StoryNode[]): WriteThemInStart {
    const places = view.places;
    const place = places[Math.min(Math.max(this.place, 0), places.length - 1)];
    const spark = this.spark === view.sparks.length ? dartTrim(this.own) : view.sparks[this.spark].text;
    let create: WriteThemInStart['create'] = null;
    let nodeId: string | null = null;
    if (place.kind === 'blank') {
      nodeId = place.nodeId;
    } else if (place.kind === 'newChapter') {
      const after = documents.find((n) => n.id === place.nodeId);
      create = { kind: 'chapter', parentId: after?.parentId ?? null };
    } else {
      create = { kind: 'scene', parentId: place.nodeId };
    }
    const me = view.me.entry.id;
    const chosen = [...this.with];
    const eyes = this.eyes;
    return {
      kind: place.kind,
      create,
      nodeId,
      edit: (plan) => ({
        ...(spark.length > 0 ? { objective: spark } : {}),
        appearIds: [...new Set([...strings(plan['appearIds']), me, ...chosen])],
        ...(eyes ? { povIds: [me] } : {}),
      }),
    };
  }
}

// ---------------------------------------------------------------------------------------------------- the plan

/** A chapter's or scene's planning fields, as the original names them. */
export const planTextFields: readonly string[] = [
  'objective',
  'conflict',
  'emotionalArc',
  'dialogue',
  'foreshadowing',
  'reveals',
  'openQuestions',
  'ending',
];

/** A blank plan. */
export function emptyPlan(id: string, projectId: string): JsonMap {
  return {
    id,
    projectId,
    objective: '',
    beats: [],
    entityIds: [],
    conflict: '',
    emotionalArc: '',
    dialogue: '',
    foreshadowing: '',
    reveals: '',
    openQuestions: '',
    ending: '',
    updatedAt: 0,
  };
}

function existing(c: RecordChanges, collection: string, ids: unknown, only: string | null = null): string[] {
  const wanted = new Set<string>();
  for (const id of listOf(ids)) if (typeof id === 'string' && id.length > 0) wanted.add(id);
  return [...wanted].filter((id) => {
    const r = c.row(collection, id);
    return r !== null && (only === null || r['category'] === only);
  });
}

/** A port of PlotChanges.updatePlan (flutter_app/lib/shared/domain/plot/plot_changes.dart), for Start writing until
 * the plot's changes are ported: writes the plan and the node's "last edited" time, and nothing else. Of what `edit`
 * may give: the text fields, beats, entityIds, appearIds and mentionIds (only this novel's characters, each in one
 * list; the list changed now wins) and povIds. (`labels`, which Start writing never gives, are not handled here.) */
export function updatePlan(c: RecordChanges, nodeId: string, edit: (stored: JsonMap) => JsonMap): void {
  const r = c.row('chapters', nodeId);
  if (r === null || (r['kind'] !== 'chapter' && r['kind'] !== 'scene')) {
    throw new ChangeRefused('That chapter or scene is not in this novel.');
  }
  const node = new StoryNode(r);
  const plan: JsonMap = { ...(c.row('chapterPlans', nodeId) ?? emptyPlan(nodeId, c.projectId)), updatedAt: c.now };
  const changes = edit(plan);
  for (const f of planTextFields) if (typeof changes[f] === 'string') plan[f] = changes[f];
  if (Array.isArray(changes['beats'])) {
    plan['beats'] = maps(changes['beats'])
      .filter((b) => typeof b['text'] === 'string' && dartTrim(b['text']).length > 0)
      .map((b) => ({ id: typeof b['id'] === 'string' && b['id'].length > 0 ? b['id'] : c.newId(), text: b['text'] }));
  }
  if (Array.isArray(changes['entityIds'])) plan['entityIds'] = existing(c, 'loreEntries', changes['entityIds']);
  for (const [field, other] of [
    ['appearIds', 'mentionIds'],
    ['mentionIds', 'appearIds'],
  ] as const) {
    if (!Array.isArray(changes[field])) continue;
    const ids = existing(c, 'loreEntries', changes[field], 'character');
    plan[field] = ids;
    plan[other] = strings(plan[other]).filter((id) => !ids.includes(id));
  }
  if (Array.isArray(changes['povIds'])) plan['povIds'] = existing(c, 'loreEntries', changes['povIds'], 'character');
  c.put('chapterPlans', plan);
  c.put('chapters', node.merged({ updatedAt: c.now }));
}
