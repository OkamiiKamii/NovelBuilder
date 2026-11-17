// Changes to plot threads, chapter and scene plans, and a chapter's own planning fields. A thread's status is only ever
// set by the author; no beat, role or chapter is made up for one. A port of
// flutter_app/lib/shared/domain/plot/plot_changes.dart.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap, listOf, str } from '../json';
import { maps, strings } from '../records/jsonRecord';
import type { NodeStatus } from '../records/storyNode';
import { PlotThread } from '../records/thread';
import { dartTrim } from '../text/dartString';
import { cleanLabels } from './labels';

/** What the plot, board and plan screens read and change. */
export const plotCollections: ReadonlySet<string> = new Set([
  'plotThreads',
  'chapters',
  'chapterPlans',
  'loreEntries',
  'loreLinks',
  'timelineEvents',
  'structureMarkers',
]);

export const threadCategories: readonly string[] = [
  'main',
  'subplot',
  'character-arc',
  'mystery',
  'romance',
  'conflict',
  'foreshadowing',
  'political',
  'worldbuilding',
  'villain',
  'personal-goal',
  'custom',
];
export const threadCategoryLabels: Readonly<Record<string, string>> = {
  main: 'Main Plot',
  subplot: 'Subplot',
  'character-arc': 'Character Arc',
  mystery: 'Mystery',
  romance: 'Romance',
  conflict: 'Conflict',
  foreshadowing: 'Foreshadowing',
  political: 'Political Storyline',
  worldbuilding: 'Worldbuilding Storyline',
  villain: 'Villain Storyline',
  'personal-goal': 'Personal Goal',
  custom: 'Custom',
};
export const threadStatusKeys: readonly string[] = ['planned', 'active', 'paused', 'resolved', 'abandoned', 'retconned', 'custom'];

/** The order statuses are shown in: what is in play first. */
export const threadStatusOrder: readonly string[] = ['active', 'paused', 'planned', 'resolved', 'abandoned', 'retconned', 'custom'];

/** A thread's category as the author names it: their own words for a custom one. */
export function categoryName(t: PlotThread): string {
  const custom = dartTrim(str(t.raw['customCategory']));
  return t.category === 'custom' && custom.length > 0 ? custom : (threadCategoryLabels[t.category] ?? t.category);
}

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
export const planLabels: Readonly<Record<string, string>> = {
  objective: 'Objective',
  conflict: 'Main conflict',
  emotionalArc: 'Emotional arc',
  dialogue: 'Key dialogue',
  foreshadowing: 'Foreshadowing',
  reveals: 'Information revealed',
  openQuestions: 'Open questions',
  ending: 'Ending target',
};

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

const roles = ['introduction', 'development', 'intersection', 'resolution', 'appears'];

export class PlotChanges extends RecordChanges {
  owned(threadId: string): PlotThread {
    const r = this.row('plotThreads', threadId);
    if (r === null) throw new ChangeRefused('That plot thread is not in this novel.');
    return new PlotThread(r);
  }

  /** Ids of this novel's rows: entries of one category, or chapters and scenes (`document`). */
  private existing(collection: string, ids: unknown, only?: string): string[] {
    const wanted = new Set<string>();
    for (const id of listOf(ids)) if (typeof id === 'string' && id.length > 0) wanted.add(id);
    return [...wanted].filter((id) => {
      const r = this.row(collection, id);
      if (r === null) return false;
      return only === undefined || (only === 'document' ? r['kind'] === 'chapter' || r['kind'] === 'scene' : r['category'] === only);
    });
  }

  private document(id: unknown): string | null {
    return this.existing('chapters', [id], 'document')[0] ?? null;
  }

  /** The other threads of this novel an intersection names; never the thread itself. */
  private crossed(threadId: string, ids: unknown): string[] {
    const wanted = new Set<string>();
    for (const x of listOf(ids)) if (typeof x === 'string' && x.length > 0 && x !== threadId) wanted.add(x);
    return [...wanted].filter((id) => this.row('plotThreads', id) !== null);
  }

  private role(role: unknown): string | null {
    return typeof role === 'string' && roles.includes(role) ? role : null;
  }

  createThread(title?: string | null): string {
    const id = this.newId();
    const t = title === null || title === undefined ? '' : dartTrim(title);
    this.put('plotThreads', {
      id,
      projectId: this.projectId,
      title: t.length > 0 ? t : 'New thread',
      premise: '',
      category: 'subplot',
      customCategory: '',
      status: 'planned',
      characterIds: [],
      locationIds: [],
      targetNodeId: null,
      targetNote: '',
      beats: [],
      notes: '',
      muted: false,
      createdAt: this.now,
      updatedAt: this.now,
    });
    return id;
  }

  /** Updates a thread from what it holds now. This is the only way a thread's status ever changes: by the author. */
  updateThread(threadId: string, edit: (stored: PlotThread) => JsonMap): void {
    const current = this.owned(threadId);
    const c = edit(current);
    const next: JsonMap = { updatedAt: this.now };
    if (typeof c['title'] === 'string') {
      const t = dartTrim(c['title']);
      next['title'] = t.length === 0 ? 'Untitled thread' : t;
    }
    for (const k of ['premise', 'notes', 'targetNote']) if (typeof c[k] === 'string') next[k] = c[k];
    if (typeof c['customCategory'] === 'string') {
      const s = c['customCategory'];
      next['customCategory'] = s.length > 60 ? s.substring(0, 60) : s;
    }
    if (typeof c['muted'] === 'boolean') next['muted'] = c['muted'];
    if (threadCategories.includes(c['category'] as string)) next['category'] = c['category'];
    if (threadStatusKeys.includes(c['status'] as string)) next['status'] = c['status'];
    if (typeof c['customStatus'] === 'string') {
      const s = c['customStatus'];
      next['customStatus'] = s.length > 40 ? s.substring(0, 40) : s;
    }
    if ('characterIds' in c) next['characterIds'] = this.existing('loreEntries', c['characterIds'], 'character');
    if ('locationIds' in c) next['locationIds'] = this.existing('loreEntries', c['locationIds'], 'location');
    if ('targetNodeId' in c) next['targetNodeId'] = this.existing('chapters', [c['targetNodeId']])[0] ?? null;
    this.put('plotThreads', current.merged(next));
  }

  private editBeats(threadId: string, edit: (beats: JsonMap[]) => JsonMap[]): void {
    const thread = this.owned(threadId);
    this.put('plotThreads', thread.merged({ beats: edit(maps(thread.raw['beats'])), updatedAt: this.now }));
  }

  /** Records a development. A chapter or scene that is not this novel's is left unplaced. One that only marks the thread
   * as appearing needs no title: none is made up for it. */
  addBeat(
    threadId: string,
    args: { title?: string | null; nodeId?: unknown; role?: string | null; note?: unknown; withThreadIds?: unknown } = {},
  ): string {
    const r = this.role(args.role);
    const t = args.title === null || args.title === undefined ? '' : dartTrim(args.title);
    const beat: JsonMap = {
      id: this.newId(),
      nodeId: this.document(args.nodeId),
      title: t.length > 0 ? t : r === 'appears' ? '' : 'New development',
      note: typeof args.note === 'string' ? args.note : '',
      createdAt: this.now,
    };
    if (r !== null) beat['role'] = r;
    if (args.withThreadIds !== undefined && args.withThreadIds !== null) beat['withThreadIds'] = this.crossed(threadId, args.withThreadIds);
    this.editBeats(threadId, (beats) => [...beats, beat]);
    return beat['id'] as string;
  }

  /** Changes one development. The others are left exactly as stored, including any whose chapter has since gone. */
  updateBeat(threadId: string, beatId: string, changes: JsonMap): void {
    const nodeId = 'nodeId' in changes ? { value: this.document(changes['nodeId']) } : null;
    const crossed = 'withThreadIds' in changes ? this.crossed(threadId, changes['withThreadIds']) : null;
    const r = this.role(changes['role']);
    this.editBeats(threadId, (beats) =>
      beats.map((b) => {
        if (b['id'] !== beatId) return b;
        const out: JsonMap = { ...b };
        if (nodeId !== null) out['nodeId'] = nodeId.value;
        if (r !== null) out['role'] = r;
        if (crossed !== null) out['withThreadIds'] = crossed;
        if (typeof changes['title'] === 'string') {
          const t = dartTrim(changes['title']);
          out['title'] = t.length > 0 ? t : (r ?? b['role']) === 'appears' ? '' : 'Untitled development';
        }
        if (typeof changes['note'] === 'string') out['note'] = changes['note'];
        return out;
      }),
    );
  }

  removeBeat(threadId: string, beatId: string): void {
    this.editBeats(threadId, (beats) => beats.filter((b) => b['id'] !== beatId));
  }

  /** The plan of a chapter or scene, or a blank one. */
  planOf(nodeId: string): JsonMap {
    return this.row('chapterPlans', nodeId) ?? emptyPlan(nodeId, this.projectId);
  }

  private documentRow(nodeId: string): JsonMap {
    const r = this.row('chapters', nodeId);
    if (r === null || (r['kind'] !== 'chapter' && r['kind'] !== 'scene')) {
      throw new ChangeRefused('That chapter or scene is not in this novel.');
    }
    return r;
  }

  /** Updates planning fields. This writes the plan and the node's "last edited" time, and nothing else: manuscript text
   * is out of reach. */
  updatePlan(nodeId: string, edit: (stored: JsonMap) => JsonMap): void {
    const node = this.documentRow(nodeId);
    const plan: JsonMap = { ...this.planOf(nodeId), updatedAt: this.now };
    const c = edit(plan);
    for (const f of planTextFields) if (typeof c[f] === 'string') plan[f] = c[f];
    if (Array.isArray(c['beats'])) {
      plan['beats'] = maps(c['beats'])
        .filter((b) => typeof b['text'] === 'string' && dartTrim(b['text']).length > 0)
        .map((b) => ({ id: typeof b['id'] === 'string' && b['id'].length > 0 ? b['id'] : this.newId(), text: b['text'] }));
    }
    if (Array.isArray(c['entityIds'])) plan['entityIds'] = this.existing('loreEntries', c['entityIds']);
    if ('labels' in c) plan['labels'] = cleanLabels(c['labels']);
    // Who appears and who is only mentioned: only this novel's characters, each in one list; the list changed now wins.
    for (const [field, other] of [
      ['appearIds', 'mentionIds'],
      ['mentionIds', 'appearIds'],
    ] as const) {
      if (!Array.isArray(c[field])) continue;
      const ids = this.existing('loreEntries', c[field], 'character');
      plan[field] = ids;
      plan[other] = strings(plan[other]).filter((id) => !ids.includes(id));
    }
    if (Array.isArray(c['povIds'])) plan['povIds'] = this.existing('loreEntries', c['povIds'], 'character');
    this.put('chapterPlans', plan);
    this.put('chapters', { ...node, updatedAt: this.now });
  }

  /** A chapter's or scene's own planning fields: its summary, notes and status; and, for a web serial, the author's
   * notes printed before and after the chapter (`noteBefore`, `noteAfter`, as the original app keeps them). */
  updateNode(
    nodeId: string,
    fields: { summary?: string | null; notes?: string | null; status?: NodeStatus | null; noteBefore?: string | null; noteAfter?: string | null },
  ): void {
    const r = this.row('chapters', nodeId);
    if (r === null) throw new ChangeRefused('That chapter or scene is not in this novel.');
    const out: JsonMap = { ...r };
    if (fields.summary !== undefined && fields.summary !== null) out['summary'] = fields.summary;
    if (fields.notes !== undefined && fields.notes !== null) out['notes'] = fields.notes;
    if (fields.status !== undefined && fields.status !== null) out['status'] = fields.status;
    if (fields.noteBefore !== undefined && fields.noteBefore !== null) out['noteBefore'] = fields.noteBefore;
    if (fields.noteAfter !== undefined && fields.noteAfter !== null) out['noteAfter'] = fields.noteAfter;
    out['updatedAt'] = this.now;
    this.put('chapters', out);
  }
}
