// What people do with conversations, suggestions and the team, as the records to write. Each function returns the
// writes; the caller saves them in one transaction, each only if the stored record is still as read. A port of
// flutter_app/lib/shared/domain/collab/collab_changes.dart.

import { type JsonMap, mapOrNull, str } from '../json';
import { blockTexts } from '../prose';
import { type Capability, PermissionError, can } from './access';
import { applyHunk, textHunks } from './hunks';
import { type Activity, type Comment, type FieldChange, type Me, type Suggestion, targetKeyOf } from './records';

/** One record to write: `value` (null to delete), written only if the stored record is still `before`. */
export type CollabWrite = { collection: string; id: string; value: JsonMap | null; before: JsonMap | null };

const put = (collection: string, value: JsonMap, before: JsonMap | null): CollabWrite => ({
  collection,
  id: str(value['id']),
  value,
  before,
});
const remove = (collection: string, before: JsonMap): CollabWrite => ({
  collection,
  id: str(before['id']),
  value: null,
  before,
});

/** A change the person's role does not allow, or a request that cannot be met. The message is fit to show them. */
export class CollabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollabError';
  }
}

function need(me: Me, capability: Capability, message: string): void {
  if (!can(me.role, capability)) throw new PermissionError(message);
}

/** Saves of the same thing by the same person within this long are one line of the record. */
const coalesceMs = 15 * 60 * 1000;

type Clocked = { now: number; newId: () => string; activity?: Iterable<Activity> };

/** The line a person's action leaves in the record of who did what: a new one, or their last line about the same
 * thing, counted once more, when it was within a quarter of an hour (as the original folds repeated saves). */
export function activityLine(
  me: Me,
  args: {
    projectId: string;
    verb: string;
    table: string;
    rowId: string;
    label: string;
    now: number;
    newId: () => string;
    existing?: Iterable<Activity>;
  },
): CollabWrite {
  let last: Activity | null = null;
  for (const a of args.existing ?? []) {
    if (a.actorId !== me.id || a.verb !== args.verb || a.table !== args.table || a.rowId !== args.rowId) continue;
    if (last === null || a.at > last.at) last = a;
  }
  if (last !== null && args.now - last.at < coalesceMs) {
    return put('activity', { ...last.toJson(), at: args.now, count: last.count + 1 }, last.toJson());
  }
  return put(
    'activity',
    {
      id: args.newId(),
      projectId: args.projectId,
      at: args.now,
      actorId: me.id,
      actorName: me.name,
      actorRole: me.role,
      verb: args.verb,
      table: args.table,
      rowId: args.rowId,
      label: args.label.trim(),
      count: 1,
    },
    null,
  );
}

/** Starts a conversation about a stretch of text, a chapter, a world entry or a plot thread: the comment, and the
 * line it leaves in the record. */
export function newComment(
  me: Me,
  args: Clocked & {
    projectId: string;
    target: JsonMap;
    targetLabel: string;
    body: string;
    kind?: string;
    ratings?: Record<string, number> | null;
  },
): CollabWrite[] {
  need(me, 'comment', 'Viewers cannot comment.');
  const kind = args.kind ?? 'comment';
  if (args.body.trim().length === 0 && kind !== 'feedback') throw new CollabError('Write the comment first.');
  const id = args.newId();
  const key = targetKeyOf(args.target);
  const row: JsonMap = {
    id,
    projectId: args.projectId,
    threadId: id,
    threadAuthorId: me.id,
    parentId: null,
    target: args.target,
    targetKey: key,
    targetLabel: args.targetLabel,
    kind,
    body: args.body.trim(),
    ...(args.ratings === undefined || args.ratings === null ? {} : { ratings: args.ratings }),
    authorId: me.id,
    authorName: me.name,
    authorRole: me.role,
    status: 'open',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  };
  const verb = kind === 'feedback' ? 'gave feedback on' : kind === 'reaction' ? 'reacted to' : 'commented on';
  return [
    put('comments', row, null),
    activityLine(me, {
      projectId: args.projectId,
      verb,
      table: 'comments',
      rowId: key,
      label: args.targetLabel,
      now: args.now,
      newId: args.newId,
      existing: args.activity,
    }),
  ];
}

export function reply(me: Me, root: Comment, args: Clocked & { body: string }): CollabWrite[] {
  need(me, 'comment', 'Viewers cannot comment.');
  if (args.body.trim().length === 0) throw new CollabError('Write the reply first.');
  const row: JsonMap = {
    id: args.newId(),
    projectId: root.projectId,
    threadId: root.id,
    threadAuthorId: root.threadAuthorId,
    parentId: root.id,
    target: root.target,
    targetKey: root.targetKey,
    targetLabel: root.targetLabel,
    kind: 'comment',
    body: args.body.trim(),
    authorId: me.id,
    authorName: me.name,
    authorRole: me.role,
    status: 'open',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  };
  return [
    put('comments', row, null),
    activityLine(me, {
      projectId: root.projectId,
      verb: 'replied on',
      table: 'comments',
      rowId: root.targetKey,
      label: root.targetLabel,
      now: args.now,
      newId: args.newId,
      existing: args.activity,
    }),
  ];
}

export function editComment(me: Me, row: Comment, body: string, now: number): CollabWrite {
  if (row.authorId !== me.id) throw new PermissionError('Only its writer can reword a comment.');
  if (body.trim().length === 0) throw new CollabError('A comment cannot be empty. Delete it instead.');
  return put('comments', { ...row.toJson(), body: body.trim(), updatedAt: now }, row.toJson());
}

/** Resolves a conversation, or opens it again. */
export function setThreadStatus(me: Me, root: Comment, args: Clocked & { resolved: boolean }): CollabWrite[] {
  return [
    put(
      'comments',
      {
        ...root.toJson(),
        status: args.resolved ? 'resolved' : 'open',
        resolvedBy: args.resolved ? me.name : null,
        resolvedAt: args.resolved ? args.now : null,
        updatedAt: args.now,
      },
      root.toJson(),
    ),
    activityLine(me, {
      projectId: root.projectId,
      verb: args.resolved ? 'resolved a comment on' : 're-opened a comment on',
      table: 'comments',
      rowId: root.targetKey,
      label: root.targetLabel,
      now: args.now,
      newId: args.newId,
      existing: args.activity,
    }),
  ];
}

/** Deletes a message. A reply simply goes. The first message of a conversation takes the conversation with it if
 * nobody else has replied; if they have, its words are removed and theirs stay (unless an author deletes it). */
export function removeComment(me: Me, row: Comment, all: Iterable<Comment>, now: number): CollabWrite[] {
  if (row.authorId !== me.id && !can(me.role, 'decide')) {
    throw new PermissionError('Only its writer or an author can delete a comment.');
  }
  if (!row.isRoot) return [remove('comments', row.toJson())];
  const replies = [...all].filter((r) => r.threadId === row.id && !r.isRoot);
  const others = replies.filter((r) => r.authorId !== me.id);
  if (others.length > 0 && !can(me.role, 'decide')) {
    return [put('comments', { ...row.toJson(), body: '', deleted: true, updatedAt: now }, row.toJson())];
  }
  return [remove('comments', row.toJson()), ...replies.map((r) => remove('comments', r.toJson()))];
}

/** TRACK CHANGES. Keeps the chapter as this person would have it, beside the text as they found it. The manuscript is
 * not touched. Saving the text back to how it was found withdraws the suggestion. `existing` are the suggestions about
 * this chapter. */
export function saveTextSuggestion(
  me: Me,
  args: Clocked & {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    base: JsonMap;
    proposed: JsonMap;
    existing: Iterable<Suggestion>;
  },
): CollabWrite[] {
  need(me, 'suggest', 'Your role comments; it does not suggest changes.');
  const mine = [...args.existing]
    .filter((s) => s.isText && s.authorId === me.id && s.status === 'pending')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const current = mine[0] ?? null;
  const from = current?.base ?? args.base;
  if (textHunks(from, args.proposed).length === 0) {
    return current !== null && Object.keys(current.decisions).length === 0 ? [remove('suggestions', current.toJson())] : [];
  }
  if (current !== null) {
    return [put('suggestions', { ...current.toJson(), proposed: args.proposed, updatedAt: args.now }, current.toJson())];
  }
  return [
    put(
      'suggestions',
      {
        id: args.newId(),
        projectId: args.projectId,
        kind: 'text',
        targetId: args.chapterId,
        targetLabel: args.chapterTitle,
        authorId: me.id,
        authorName: me.name,
        authorRole: me.role,
        note: '',
        base: args.base,
        proposed: args.proposed,
        status: 'pending',
        decisions: {},
        decidedBy: null,
        decidedAt: null,
        createdAt: args.now,
        updatedAt: args.now,
      },
      null,
    ),
    activityLine(me, {
      projectId: args.projectId,
      verb: 'suggested changes to',
      table: 'suggestions',
      rowId: args.chapterId,
      label: args.chapterTitle,
      now: args.now,
      newId: args.newId,
      existing: args.activity,
    }),
  ];
}

/** Proposes new values for a world entry. The entry is not changed. */
export function suggestFields(
  me: Me,
  args: Clocked & { projectId: string; entryId: string; entryName: string; changes: readonly FieldChange[]; note?: string },
): CollabWrite[] {
  need(me, 'suggest', 'Your role comments; it does not suggest changes.');
  const real = args.changes.filter((c) => c.from !== c.to);
  if (real.length === 0) throw new CollabError('Change something first.');
  return [
    put(
      'suggestions',
      {
        id: args.newId(),
        projectId: args.projectId,
        kind: 'fields',
        targetId: args.entryId,
        targetLabel: args.entryName,
        authorId: me.id,
        authorName: me.name,
        authorRole: me.role,
        note: (args.note ?? '').trim(),
        changes: real.map((c) => ({ field: c.field, label: c.label, from: c.from, to: c.to })),
        status: 'pending',
        decisions: {},
        decidedBy: null,
        decidedAt: null,
        createdAt: args.now,
        updatedAt: args.now,
      },
      null,
    ),
    activityLine(me, {
      projectId: args.projectId,
      verb: 'suggested an edit to',
      table: 'suggestions',
      rowId: args.entryId,
      label: args.entryName,
      now: args.now,
      newId: args.newId,
      existing: args.activity,
    }),
  ];
}

/** Takes back a suggestion of one's own. */
export function withdrawSuggestion(me: Me, row: Suggestion): CollabWrite {
  if (row.authorId !== me.id) throw new PermissionError('Only its writer can withdraw a suggestion.');
  return remove('suggestions', row.toJson());
}

/** An author's verdict on one change of a text suggestion. Accepting makes that change, and only that change, to the
 * chapter as it stands now (`currentDoc`); the new text is returned for the ordinary save (so the earlier text goes
 * to version history). If the passage has been rewritten since, nothing is changed and this says so. Rejecting
 * changes nothing but the record. */
export function decideHunk(
  me: Me,
  row: Suggestion,
  hunkId: string,
  args: Clocked & { accept: boolean; currentDoc: unknown },
): { doc: JsonMap | null; writes: CollabWrite[] } {
  need(me, 'decide', 'Only an author accepts or rejects a suggestion.');
  const all = textHunks(row.base, row.proposed);
  const hunk = all.find((h) => h.id === hunkId) ?? null;
  if (!row.isText || hunk === null) throw new CollabError('That change is no longer part of the suggestion.');
  let doc: JsonMap | null = null;
  if (args.accept) {
    const applied = applyHunk(args.currentDoc, hunk);
    if (applied.kind === 'appliedTo') doc = applied.doc;
    else if (applied.kind === 'rewritten') {
      throw new CollabError(
        'The text here has been rewritten since this was suggested, so it cannot be applied as it stands. ' +
          'Reject it, or make the change by hand.',
      );
    }
  }
  const verdict = args.accept ? 'accepted' : 'rejected';
  const decisions: JsonMap = { ...row.decisions, [hunkId]: { verdict, by: me.id, byName: me.name, at: args.now } };
  const left = all.filter((h) => !Object.prototype.hasOwnProperty.call(decisions, h.id)).length;
  const status =
    left > 0 ? 'pending' : Object.values(decisions).some((d) => mapOrNull(d)?.['verdict'] === 'accepted') ? 'accepted' : 'rejected';
  return {
    doc,
    writes: [
      put(
        'suggestions',
        {
          ...row.toJson(),
          decisions,
          status,
          decidedBy: left > 0 ? null : me.name,
          decidedAt: left > 0 ? null : args.now,
          updatedAt: args.now,
        },
        row.toJson(),
      ),
      activityLine(me, {
        projectId: row.projectId,
        verb: `${verdict} a change suggested by ${row.authorName} in`,
        table: 'suggestions',
        rowId: `${row.id}:${hunkId}`,
        label: row.targetLabel,
        now: args.now,
        newId: args.newId,
        existing: args.activity,
      }),
    ],
  };
}

/** An author's verdict on a proposed edit to a world entry. Accepting writes the proposed values to the entry (every
 * field the edit does not name is kept); rejecting changes nothing but the record. */
export function decideFields(
  me: Me,
  row: Suggestion,
  args: Clocked & { accept: boolean; entry: JsonMap | null },
): CollabWrite[] {
  need(me, 'decide', 'Only an author accepts or rejects a suggestion.');
  if (row.isText || row.status !== 'pending') throw new CollabError('That suggestion has already been settled.');
  const writes: CollabWrite[] = [];
  if (args.accept) {
    const entry = args.entry;
    if (entry === null) throw new CollabError('That entry is no longer in the novel.');
    const next: JsonMap = { ...entry };
    let fields = [...(Array.isArray(entry['fields']) ? entry['fields'] : [])].filter(
      (f): f is JsonMap => typeof f === 'object' && f !== null && !Array.isArray(f),
    );
    for (const c of row.changes) {
      if (c.field === 'name' || c.field === 'summary' || c.field === 'description') {
        next[c.field] = c.to;
      } else if (c.field.startsWith('field:')) {
        const key = c.field.substring(6);
        fields = fields.some((f) => f['key'] === key)
          ? fields.map((f) => (f['key'] === key ? { ...f, value: c.to } : f))
          : [...fields, { id: args.newId(), key, value: c.to }];
        next['fields'] = fields;
      }
    }
    next['updatedAt'] = args.now;
    writes.push(put('loreEntries', next, entry));
  }
  const verdict = args.accept ? 'accepted' : 'rejected';
  writes.push(
    put(
      'suggestions',
      {
        ...row.toJson(),
        status: verdict,
        decisions: { all: { verdict, by: me.id, byName: me.name, at: args.now } },
        decidedBy: me.name,
        decidedAt: args.now,
        updatedAt: args.now,
      },
      row.toJson(),
    ),
    activityLine(me, {
      projectId: row.projectId,
      verb: `${verdict} an edit suggested by ${row.authorName} to`,
      table: 'suggestions',
      rowId: row.id,
      label: row.targetLabel,
      now: args.now,
      newId: args.newId,
      existing: args.activity,
    }),
  );
  return writes;
}

/** A suggested text as the person edits it, paragraph by paragraph: unchanged paragraphs are kept exactly as stored
 * (formatting and all); a changed paragraph keeps its kind and alignment and holds the new words as plain text. */
export function docWithParagraphs(base: unknown, paragraphs: readonly { original: unknown; text: string | null }[]): JsonMap {
  const doc = mapOrNull(base) ?? { type: 'doc' };
  const plain = (like: unknown, text: string): JsonMap => {
    const m = mapOrNull(like);
    return {
      type: m?.['type'] === 'heading' ? 'heading' : 'paragraph',
      attrs: m?.['attrs'] !== undefined && m?.['attrs'] !== null ? m['attrs'] : { textAlign: null },
      content: text.length > 0 ? [{ type: 'text', text }] : [],
    };
  };
  return { ...doc, content: paragraphs.map((p) => (p.text === null ? p.original : plain(p.original, p.text))) };
}

/** The words of each paragraph of a document, in order (as the editor numbers them). */
export function paragraphTexts(doc: unknown): string[] {
  return blockTexts(doc);
}
