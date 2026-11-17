// The manuscript of one novel: its structure, its text, its history and the writing logged against it. A port of
// flutter_app/lib/features/write/data/manuscript_service.dart (alternate drafts come in a later part of Phase 3).
//
// NON-INVASIVE RULE: text is stored exactly as the editor gives it. Nothing here changes prose on its own.

import { newId } from '../domain/ids';
import { type JsonMap, isMap, numOrNull, str } from '../domain/json';
import {
  createNode,
  deleteNodeTree,
  duplicateNode,
  mergeCandidate,
  mergeWithNext,
  type NodeKind,
  nodesOf,
  nudgeNode,
  OutlineError,
  placeNode,
  renameNode,
  setNodeStatus,
  splitNode,
  type StoryNode,
  storyNode,
} from '../domain/outline';
import { emptyDoc, measureDoc, mentionsIn } from '../domain/prose';
import { wordsWritten as wordsWrittenOf } from '../domain/goals/days';
import { type WordGoalKind, type WordGoals, wordGoalsOf, wordGoalWrite } from '../domain/goals/wordGoals';
import type { NovelSnapshot } from '../domain/snapshot/novelSnapshot';
import type { BackupService } from './backupService';
import type { DraftStore } from './draftStore';
import { deleteRow, type NovelStore, putRow, type RowWrite } from './novelStore';

/** The name of the draft a chapter or scene starts with, as the original app names it. */
export const mainDraft = 'Main draft';

/** A change to drafts that cannot be made as asked (a name missing or already taken). Nothing is changed. */
export class DraftRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftRefused';
  }
}

/** An empty page, as the original app starts a blank draft. */
function blankDoc(): JsonMap {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** A save based on text that has been saved differently since it was opened. Nothing is saved; the writer chooses. */
export class SaveConflict extends Error {
  constructor() {
    super('This chapter was saved somewhere else since it was opened. Nothing was overwritten.');
    this.name = 'SaveConflict';
  }
}

/** A chapter's text as opened for editing, and any unsaved writing a crash left behind. */
export type OpenedText = {
  doc: JsonMap | null;
  rev: number;
  /** Writing typed after the last save that the app never got to save. Offered back; never applied on its own. */
  recovered: { doc: JsonMap; at: number } | null;
};

/** How often history keeps an automatic copy while writing, and how many copies a chapter keeps. */
export const revisionIntervalMs = 5 * 60 * 1000;
export const maxRevisions = 50;
/** Pauses longer than this, or a new day, start a new writing session. */
export const sessionGapMs = 30 * 60 * 1000;

export function dayKey(t: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(t.getFullYear(), 4)}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export class ManuscriptService {
  constructor(
    private readonly store: NovelStore,
    private readonly drafts: DraftStore,
    private readonly backups: BackupService,
    private readonly clock: () => number = Date.now,
    private readonly createId: () => string = newId,
  ) {}

  private load(projectId: string): NovelSnapshot {
    const s = this.store.loadPart(projectId, [
      'chapters',
      'chapterContents',
      'chapterPlans',
      'chapterBranches',
      'chapterRevisions',
      'loreLinks',
    ]);
    if (!s) throw new Error('That novel is no longer in the library.');
    return s;
  }

  /** Applies a structural change to the stored novel, in one transaction. Only the manuscript's collections are read;
   * merge, which re-points references everywhere, reads the whole novel. */
  private change<T>(projectId: string, change: (s: NovelSnapshot) => { snapshot: NovelSnapshot; result: T }, whole = false): T {
    const before = whole ? this.store.load(projectId) : this.load(projectId);
    if (!before) throw new Error('That novel is no longer in the library.');
    const after = change(before);
    this.store.saveChanges(before, after.snapshot);
    return after.result;
  }

  nodes(projectId: string): StoryNode[] {
    return this.store.rowsIn(projectId, 'chapters').map(storyNode);
  }

  create(projectId: string, kind: NodeKind, parentId: string | null = null, title?: string): StoryNode {
    return this.change(projectId, (s) => {
      const r = createNode(s, kind, { parentId, title, now: this.clock(), createId: this.createId });
      return { snapshot: r.snapshot, result: r.node };
    });
  }

  rename(projectId: string, id: string, title: string): void {
    this.change(projectId, (s) => ({ snapshot: renameNode(s, id, title, this.clock()), result: null }));
  }

  setStatus(projectId: string, id: string, status: string): void {
    this.change(projectId, (s) => ({ snapshot: setNodeStatus(s, id, status, this.clock()), result: null }));
  }

  move(projectId: string, id: string, parentId: string | null, beforeId: string | null = null): void {
    this.change(projectId, (s) => ({ snapshot: placeNode(s, id, parentId, beforeId, this.clock()), result: null }));
  }

  nudge(projectId: string, id: string, delta: number): void {
    this.change(projectId, (s) => ({ snapshot: nudgeNode(s, id, delta, this.clock()), result: null }));
  }

  duplicate(projectId: string, id: string): string {
    return this.change(projectId, (s) => {
      const r = duplicateNode(s, id, this.clock(), this.createId);
      return { snapshot: r.snapshot, result: r.id };
    });
  }

  /** Splits a chapter or scene: it keeps `head`, a new one right after it gets `tail`. Its text before the split is
   * kept in its history first. */
  split(projectId: string, id: string, head: JsonMap, tail: JsonMap): string {
    this.keepVersion(projectId, id, 'Before splitting');
    return this.change(projectId, (s) => {
      const r = splitNode(s, id, head, tail, this.clock(), this.createId);
      return { snapshot: r.snapshot, result: r.id };
    });
  }

  canMerge(projectId: string, id: string): boolean {
    return mergeCandidate(this.load(projectId), id) !== null;
  }

  /** Merges the next chapter or scene of the same kind into this one. Both texts are kept in history first. */
  merge(projectId: string, id: string): void {
    const next = mergeCandidate(this.load(projectId), id);
    if (!next) throw new OutlineError('There is nothing of the same kind right after this to merge with.');
    this.keepVersion(projectId, id, 'Before merging');
    this.keepVersion(projectId, next.id, 'Before merging into the one before it');
    this.change(projectId, (s) => ({ snapshot: mergeWithNext(s, id, this.clock()), result: null }), true);
  }

  /** Deletes a node and everything inside it, after keeping a restore point. Returns the restore point, for Undo. */
  delete(projectId: string, id: string, title: string): string {
    const kept = this.backups.keepRestorePoint(projectId, `Before deleting “${title}”`);
    if (kept === null) throw new Error('That novel is no longer in the library.');
    this.change(projectId, (s) => ({ snapshot: deleteNodeTree(s, id), result: null }));
    return kept;
  }

  undoDelete(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }

  // ------------------------------------------------------------------------------------------------------------ text

  private draftKey(nodeId: string): string {
    return `chapter:${nodeId}`;
  }

  /** The text to edit. A crash copy typed on top of the saved text comes back as `recovered`; one typed on top of an
   * older save (the text moved on since) is kept in history rather than guessed about. */
  open(projectId: string, nodeId: string): OpenedText {
    const content = this.store.row(projectId, 'chapterContents', nodeId);
    const rev = numOrNull(content?.['rev']) ?? 0;
    const draft = this.drafts.get(projectId, this.draftKey(nodeId));
    const draftDoc = draft && isMap(draft.value) ? draft.value : null;
    const doc = isMap(content?.['doc']) ? (content!['doc'] as JsonMap) : null;
    if (draft && draftDoc && draft.baseRev !== rev) {
      const node = storyNode(this.store.row(projectId, 'chapters', nodeId) ?? {});
      this.store.writeRows(
        projectId,
        [
          putRow('chapterRevisions', {
            id: this.createId(),
            projectId,
            nodeId,
            doc: draftDoc,
            wordCount: node.wordCount,
            charCount: node.charCount,
            savedAt: draft.updatedAt,
            capturedAt: this.clock(),
            sourceRev: -1,
            reason: 'recovery',
            label: 'Unsaved writing from an earlier session',
          }),
        ],
        false,
      );
      this.drafts.discard(projectId, this.draftKey(nodeId));
      return { doc, rev, recovered: null };
    }
    return { doc, rev, recovered: draft && draftDoc ? { doc: draftDoc, at: draft.updatedAt } : null };
  }

  /** A quick copy of what is in the editor right now, for crash recovery. Touches nothing else. */
  saveDraft(projectId: string, nodeId: string, doc: JsonMap, baseRev: number): void {
    this.drafts.put(projectId, this.draftKey(nodeId), doc, baseRev);
  }

  discardDraft(projectId: string, nodeId: string): void {
    this.drafts.discard(projectId, this.draftKey(nodeId));
  }

  /** Saves the text exactly as given, with its counts, the entries it links, a history copy of what it replaces (at
   * most every five minutes unless `reason` is given) and the writing logged, all in one transaction. Returns the new
   * revision number. Throws SaveConflict if the saved text is no longer the one `baseRev` names. With `force` (the
   * writer chose to keep their own text after a conflict) the check is skipped; the text it replaces still goes into
   * history. */
  save(
    projectId: string,
    nodeId: string,
    doc: JsonMap,
    options: { baseRev: number; reason?: string; label?: string; force?: boolean },
  ): number {
    let rev = 0;
    this.store.db.transaction(() => {
      const nodeRow = this.store.row(projectId, 'chapters', nodeId);
      if (!nodeRow) throw new Error('That chapter no longer exists.');
      const node = storyNode(nodeRow);
      const content = this.store.row(projectId, 'chapterContents', nodeId);
      const current = numOrNull(content?.['rev']) ?? 0;
      if (options.baseRev !== current && !options.force) throw new SaveConflict();
      const conflict = options.baseRev !== current;
      const why = conflict ? 'conflict' : options.reason;
      const whyLabel = conflict ? 'Replaced by text kept after a conflict' : (options.label ?? '');
      const m = measureDoc(doc);
      const now = this.clock();
      rev = current + 1;
      this.store.writeRows(projectId, [
        ...(content ? this.capture(projectId, node, content, why, whyLabel) : []),
        ...this.recordWriting(projectId, m.words - node.wordCount),
        putRow(
          'chapterContents',
          { ...(content ?? {}), id: nodeId, projectId, doc, rev, savedAt: now },
          content,
        ),
        putRow(
          'chapters',
          { ...nodeRow, wordCount: m.words, charCount: m.characters, mentions: mentionsIn(doc), updatedAt: now },
          nodeRow,
        ),
      ]);
      this.drafts.discard(projectId, this.draftKey(nodeId));
    });
    return rev;
  }

  /** Version history of a chapter or scene, newest first. */
  revisions(projectId: string, nodeId: string): JsonMap[] {
    return this.store
      .rowsForNode(projectId, 'chapterRevisions', nodeId)
      .filter((r) => r['nodeId'] === nodeId)
      .sort(byCapture)
      .reverse();
  }

  /** Keeps any text in a chapter's history (the writer's own text set aside in a conflict, say), without changing what
   * is saved. */
  keepInHistory(projectId: string, nodeId: string, doc: JsonMap, reason: string, label: string): void {
    const m = measureDoc(doc);
    const now = this.clock();
    this.store.writeRows(
      projectId,
      [
        putRow('chapterRevisions', {
          id: this.createId(),
          projectId,
          nodeId,
          doc,
          wordCount: m.words,
          charCount: m.characters,
          savedAt: now,
          capturedAt: now,
          sourceRev: -1,
          reason,
          label,
        }),
      ],
      false,
    );
  }

  /** Keeps the saved text as a named version. */
  saveVersion(projectId: string, nodeId: string, label = ''): void {
    this.keepVersion(projectId, nodeId, label);
  }

  private keepVersion(projectId: string, nodeId: string, label: string): void {
    const content = this.store.row(projectId, 'chapterContents', nodeId);
    const nodeRow = this.store.row(projectId, 'chapters', nodeId);
    if (!content || !nodeRow) return;
    this.store.writeRows(projectId, this.capture(projectId, storyNode(nodeRow), content, 'manual', label), false);
  }

  /** Brings back an earlier version. The text it replaces goes into history first, so restoring is undoable. */
  restoreRevision(projectId: string, nodeId: string, revisionId: string, baseRev: number): number {
    const revision = this.store.row(projectId, 'chapterRevisions', revisionId);
    if (!revision) throw new Error('That version no longer exists.');
    return this.save(projectId, nodeId, isMap(revision['doc']) ? revision['doc'] : emptyDoc(), {
      baseRev,
      reason: 'restore',
      label: 'Before restoring an earlier version',
    });
  }

  /** A copy of `content` for history, unless it is already there or (for an automatic copy) one was kept moments ago.
   * The oldest automatic copies make room first, the writer's own last. */
  private capture(projectId: string, node: StoryNode, content: JsonMap, reason?: string, label = ''): RowWrite[] {
    const history = this.store
      .rowsForNode(projectId, 'chapterRevisions', node.id)
      .filter((r) => r['nodeId'] === node.id)
      .sort(byCapture);
    const latest = history[history.length - 1];
    const sourceRev = numOrNull(content['rev']) ?? 0;
    const now = this.clock();
    if (latest && numOrNull(latest['sourceRev']) === sourceRev) {
      if (reason === undefined) return [];
      return [putRow('chapterRevisions', { ...latest, reason, label: label || latest['label'] })];
    }
    if (reason === undefined && latest && now - (numOrNull(latest['capturedAt']) ?? 0) < revisionIntervalMs) return [];
    const revision: JsonMap = {
      id: this.createId(),
      projectId,
      nodeId: node.id,
      doc: content['doc'],
      wordCount: node.wordCount,
      charCount: node.charCount,
      savedAt: content['savedAt'] ?? node.raw['updatedAt'],
      capturedAt: now,
      sourceRev,
      reason: reason ?? 'auto',
      label,
      branchName: node.raw['branchName'] ?? mainDraft,
    };
    const all = [...history, revision];
    const excess = all.length - maxRevisions;
    const expendable = [...all.filter((r) => r['reason'] === 'auto'), ...all.filter((r) => r['reason'] !== 'auto')];
    return [
      putRow('chapterRevisions', revision),
      ...(excess > 0 ? expendable.slice(0, excess).map((r) => deleteRow('chapterRevisions', str(r['id']))) : []),
    ];
  }

  // ---------------------------------------------------------------------------------------------- alternate drafts
  // (FEATURES.md #117) A chapter or scene can keep several drafts. The one in the manuscript (`branchName` on the node,
  // "Main draft" when unnamed) is the only one counted, searched, read and exported; the others are `chapterBranches`.

  /** The name of the draft in the manuscript now. */
  activeDraft(projectId: string, nodeId: string): string {
    return str(this.document(projectId, nodeId)['branchName'], mainDraft);
  }

  /** The alternate drafts of a chapter or scene that are not in the manuscript, oldest first. */
  alternateDrafts(projectId: string, nodeId: string): JsonMap[] {
    this.document(projectId, nodeId);
    return this.store
      .rowsForNode(projectId, 'chapterBranches', nodeId)
      .filter((r) => r['nodeId'] === nodeId)
      .sort((a, b) => (numOrNull(a['createdAt']) ?? 0) - (numOrNull(b['createdAt']) ?? 0));
  }

  private document(projectId: string, nodeId: string): JsonMap {
    const row = this.store.row(projectId, 'chapters', nodeId);
    const kind = row ? storyNode(row).kind : null;
    if (!row || (kind !== 'chapter' && kind !== 'scene')) throw new Error('That chapter or scene is not in this novel.');
    return row;
  }

  private nameFree(node: StoryNode, name: string, taken: readonly string[]): void {
    if (!name) throw new DraftRefused('Give the draft a name.');
    if (taken.some((n) => n.toLowerCase() === name.toLowerCase())) {
      throw new DraftRefused(`This ${node.kind} already has a draft called "${name}".`);
    }
  }

  /** Sets the text in the manuscript aside as an alternate draft under its own name, and carries on with a copy of it
   * (or, with `blank`, an empty page) as a new draft called `newName`. Nothing is lost: both drafts now exist. A copy
   * leaves the saved text as it is, so an open editor carries on; a blank page replaces it, so an open editor's next
   * save is refused as a conflict rather than overwriting it. */
  createDraft(projectId: string, nodeId: string, newName: string, blank = false): void {
    this.store.db.transaction(() => {
      const nodeRow = this.document(projectId, nodeId);
      const node = storyNode(nodeRow);
      const name = newName.trim();
      const current = str(nodeRow['branchName'], mainDraft);
      this.nameFree(node, name, [current, ...this.alternateDrafts(projectId, nodeId).map((b) => str(b['name']))]);
      const content = this.store.row(projectId, 'chapterContents', nodeId);
      const now = this.clock();
      const renamed = { ...nodeRow, branchName: name, updatedAt: now };
      this.store.writeRows(projectId, [
        putRow(
          'chapterBranches',
          {
            id: this.createId(),
            projectId,
            nodeId,
            name: current,
            doc: content?.['doc'],
            wordCount: node.wordCount,
            charCount: node.charCount,
            createdAt: now,
            updatedAt: now,
          },
          null,
        ),
        ...(blank
          ? this.writeText(projectId, storyNode(renamed), blankDoc(), 0, 0, content, nodeRow)
          : [putRow('chapters', renamed, nodeRow)]),
      ]);
      if (blank) this.drafts.discard(projectId, this.draftKey(nodeId));
    });
  }

  /** Makes an alternate draft the one in the manuscript. The outgoing text is kept as an alternate under its own name
   * in the same transaction, so a swap can always be swapped back. Word counts follow; it is not logged as writing. */
  switchDraft(projectId: string, nodeId: string, draftId: string): void {
    this.store.db.transaction(() => {
      const nodeRow = this.document(projectId, nodeId);
      const node = storyNode(nodeRow);
      const incoming = this.store.row(projectId, 'chapterBranches', draftId);
      if (!incoming || incoming['nodeId'] !== nodeId) throw new Error('That draft is not in this novel.');
      const content = this.store.row(projectId, 'chapterContents', nodeId);
      this.store.writeRows(projectId, [
        putRow(
          'chapterBranches',
          {
            ...incoming,
            name: str(nodeRow['branchName'], mainDraft),
            doc: content?.['doc'],
            wordCount: node.wordCount,
            charCount: node.charCount,
            updatedAt: this.clock(),
          },
          incoming,
        ),
        ...this.writeText(
          projectId,
          storyNode({ ...nodeRow, branchName: str(incoming['name']) }),
          isMap(incoming['doc']) ? incoming['doc'] : blankDoc(),
          numOrNull(incoming['wordCount']) ?? 0,
          numOrNull(incoming['charCount']) ?? 0,
          content,
          nodeRow,
        ),
      ]);
      this.drafts.discard(projectId, this.draftKey(nodeId));
    });
  }

  /** Renames a draft: `draftId` for an alternate, or null for the one in the manuscript. */
  renameDraft(projectId: string, nodeId: string, draftId: string | null, newName: string): void {
    this.store.db.transaction(() => {
      const nodeRow = this.document(projectId, nodeId);
      const node = storyNode(nodeRow);
      const name = newName.trim();
      const others = this.alternateDrafts(projectId, nodeId);
      this.nameFree(node, name, [
        ...(draftId !== null ? [str(nodeRow['branchName'], mainDraft)] : []),
        ...others.filter((b) => b['id'] !== draftId).map((b) => str(b['name'])),
      ]);
      if (draftId === null) {
        this.store.writeRows(projectId, [putRow('chapters', { ...nodeRow, branchName: name }, nodeRow)]);
        return;
      }
      const draft = others.find((b) => b['id'] === draftId);
      if (!draft) throw new Error('That draft is not in this novel.');
      this.store.writeRows(projectId, [putRow('chapterBranches', { ...draft, name }, draft)]);
    });
  }

  /** Deletes an alternate draft for good. The draft in the manuscript cannot be deleted this way. */
  deleteDraft(projectId: string, draftId: string): void {
    const draft = this.store.row(projectId, 'chapterBranches', draftId);
    if (!draft) throw new Error('That draft is not in this novel.');
    this.store.writeRows(projectId, [deleteRow('chapterBranches', draftId, draft)]);
  }

  /** Puts `doc` in the manuscript as the saved text, with its counts and links: a new revision, so an editor opened on
   * the old text cannot overwrite it. No history copy and no writing logged: the old text is kept as a draft. */
  private writeText(
    projectId: string,
    node: StoryNode,
    doc: JsonMap,
    words: number,
    characters: number,
    content: JsonMap | null,
    expectNode: JsonMap,
  ): RowWrite[] {
    const now = this.clock();
    return [
      putRow(
        'chapterContents',
        { ...(content ?? {}), id: node.id, projectId, doc, rev: (numOrNull(content?.['rev']) ?? 0) + 1, savedAt: now },
        content,
      ),
      putRow(
        'chapters',
        { ...node.raw, wordCount: words, charCount: characters, mentions: mentionsIn(doc), updatedAt: now },
        expectNode,
      ),
    ];
  }

  // ------------------------------------------------------------------------------------------- writing and goals

  /** Net words written today, and since Monday. */
  wordsWritten(projectId: string): { today: number; week: number } {
    return wordsWrittenOf(this.store.rowsIn(projectId, 'writingSessions'), this.clock());
  }

  /** The author's daily and weekly word targets, when set. */
  wordGoals(projectId: string): WordGoals {
    return wordGoalsOf(this.store.rowsIn(projectId, 'goals'));
  }

  /** Sets (or with null, removes) the daily or weekly word target. One of each per novel. */
  setWordGoal(projectId: string, kind: WordGoalKind, words: number | null): void {
    const w = wordGoalWrite(this.store.rowsIn(projectId, 'goals'), kind, words, {
      projectId,
      nowMs: this.clock(),
      createId: this.createId,
    });
    if (w) this.store.writeRows(projectId, [w.value === null ? deleteRow('goals', w.id) : putRow('goals', w.value)], false);
  }

  /** Logs a save against today's writing session: words added, removed and the net change. */
  private recordWriting(projectId: string, delta: number): RowWrite[] {
    const nowMs = this.clock();
    const day = dayKey(new Date(nowMs));
    const todays = this.store
      .rowsIn(projectId, 'writingSessions')
      .filter((r) => r['day'] === day)
      .sort((a, b) => (numOrNull(a['lastActiveAt']) ?? 0) - (numOrNull(b['lastActiveAt']) ?? 0));
    const last = todays[todays.length - 1];
    const added = delta > 0 ? delta : 0;
    const removed = delta < 0 ? -delta : 0;
    if (last && nowMs - (numOrNull(last['lastActiveAt']) ?? 0) < sessionGapMs) {
      return [
        putRow('writingSessions', {
          ...last,
          lastActiveAt: nowMs,
          netWords: (numOrNull(last['netWords']) ?? 0) + delta,
          added: (numOrNull(last['added']) ?? 0) + added,
          removed: (numOrNull(last['removed']) ?? 0) + removed,
          saves: (numOrNull(last['saves']) ?? 0) + 1,
        }),
      ];
    }
    return [
      putRow('writingSessions', {
        id: this.createId(),
        projectId,
        day,
        startedAt: nowMs,
        lastActiveAt: nowMs,
        netWords: delta,
        added,
        removed,
        saves: 1,
      }),
    ];
  }
}

function byCapture(a: JsonMap, b: JsonMap): number {
  const t = (numOrNull(a['capturedAt']) ?? 0) - (numOrNull(b['capturedAt']) ?? 0);
  if (t !== 0) return t;
  const r = (numOrNull(a['sourceRev']) ?? 0) - (numOrNull(b['sourceRev']) ?? 0);
  if (r !== 0) return r;
  return str(a['id']) < str(b['id']) ? -1 : 1;
}

export { nodesOf };

