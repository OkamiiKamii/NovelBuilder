import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import type { AssistantService } from '@/modules/assistant/service';
import type { CodexService } from '@/modules/codex/service';
import { measure } from '@/modules/manuscript/metrics';
import type { ManuscriptService } from '@/modules/manuscript/service';
import type { DocJSON } from '@/modules/manuscript/types';
import type { PlotService } from '@/modules/plot/service';
import type { ProgressService } from '@/modules/progress/service';
import { docBlocks } from '@/modules/search/extract';
import { can } from '@/modules/sync/access';
import type { RelayMemberInfo } from '@/modules/sync/relay';
import { PermissionError, type CollabGuard } from './guard';
import { applyHunk, textHunks, type Hunk } from './hunks';
import type { Me } from './identity';
import type { Activity, Comment, CommentTarget, FieldChange, Member, Suggestion, Verdict } from './types';

/** The team's tables travel with sync and with a full archive, but a copy or a new timeline of the project starts with no team and no conversations. */
export function registerCollab(registry: ProjectRegistry): void {
  const team = { optional: true, fork: () => [] };
  // Member ids are remapped like any row id, so who wrote what still matches the team in a restored archive. `OWNER_ID` is no row and stays as it is.
  registry.registerCollection({ table: 'members', ...team });
  registry.registerCollection({
    table: 'comments',
    ...team,
    refs: ['threadId', 'parentId', 'threadAuthorId', 'authorId'],
    remap: (row, mapId) => {
      const target = remapTarget(row.target as CommentTarget, mapId);
      const converted = row.converted as Comment['converted'];
      // A converted comment links to a page of its project; the project has a new id now.
      return { ...row, target, targetKey: targetKeyOf(target), ...(converted ? { converted: { ...converted, to: converted.to.replace(/^\/project\/[^/]+/, `/project/${row.projectId}`) } } : {}) };
    },
  });
  registry.registerCollection({
    table: 'suggestions',
    ...team,
    refs: ['targetId', 'authorId'],
    remap: (row, mapId) => ({ ...row, decisions: Object.fromEntries(Object.entries((row.decisions ?? {}) as Record<string, Verdict>).map(([hunk, verdict]) => [hunk, { ...verdict, by: mapId(verdict.by) }])) }),
  });
  // What a line is about is a record's id, a comment's target ("chapter:<id>") or a suggestion's part ("<id>:<part>"): each id in it follows the copies.
  registry.registerCollection({ table: 'activity', ...team, refs: ['actorId'], remap: (row, mapId) => ({ ...row, rowId: typeof row.rowId === 'string' ? row.rowId.split(/([:|/?=&])/).map(mapId).join('') : row.rowId }) });
}

function remapTarget(target: CommentTarget, mapId: (id: string) => string): CommentTarget {
  switch (target.kind) {
    case 'text':
    case 'chapter':
      return { ...target, chapterId: mapId(target.chapterId) };
    case 'entry':
      return { ...target, entryId: mapId(target.entryId) };
    case 'thread':
      return { ...target, threadId: mapId(target.threadId) };
    case 'beat':
      return { ...target, threadId: mapId(target.threadId), beatId: mapId(target.beatId) };
  }
}

export interface Thread {
  root: Comment;
  replies: Comment[];
}

export type Conversion = { kind: 'task' } | { kind: 'note' } | { kind: 'beat'; plotThreadId: string };

export const targetKeyOf = (target: CommentTarget): string => (target.kind === 'entry' ? `entry:${target.entryId}` : target.kind === 'thread' || target.kind === 'beat' ? `thread:${target.threadId}` : `chapter:${target.chapterId}`);

/** The changes of a text suggestion that no author has ruled on yet. */
export const openHunks = (suggestion: Suggestion): Hunk[] => (suggestion.kind === 'text' ? textHunks(suggestion.base, suggestion.proposed).filter((hunk) => !suggestion.decisions[hunk.id]) : []);
/** Whether anything in a suggestion is still waiting for a verdict. */
export const isOpen = (suggestion: Suggestion): boolean => (suggestion.kind === 'text' ? openHunks(suggestion).length > 0 : suggestion.status === 'pending');

interface Deps {
  guard: CollabGuard;
  who: (projectId: string) => Me;
  manuscript: ManuscriptService;
  codex: CodexService;
  plot: PlotService;
  progress: ProgressService;
  assistant: AssistantService;
  onChanged: (projectId: string) => Promise<void> | void;
}

export function createCollabService(db: NovelDB, deps: Deps) {
  // Two things made in the same millisecond still have an order: the one made first comes first, on every device.
  let last = 0;
  const stamp = (): number => (last = Math.max(Date.now(), last + 1));
  return {
    forProject(projectId: string) {
      const me = () => deps.who(projectId);
      const need = (capability: Parameters<typeof can>[1], message: string) => {
        if (!can(me().role, capability)) throw new PermissionError(message);
      };
      /** One piece of work, saved whole. `note` is the line it leaves in the record, written with it: both are saved or neither is. */
      const write = async <T>(task: () => Promise<T>, note?: [verb: string, table: string, rowId: string, label: string]): Promise<T> => {
        const result = await db.transaction('rw', db.tables, async () => {
          const done = await task();
          if (note) await deps.guard.note(projectId, ...note);
          return done;
        });
        await deps.onChanged(projectId);
        return result;
      };
      const mine = async <T extends { projectId: string }>(row: T | undefined, what: string): Promise<T> => {
        if (!row || row.projectId !== projectId) throw new Error(`That ${what} is not in this project.`);
        return row;
      };

      async function labelOf(target: CommentTarget): Promise<string> {
        if (target.kind === 'entry') return (await db.loreEntries.get(target.entryId))?.name ?? 'a codex entry';
        if (target.kind === 'thread' || target.kind === 'beat') {
          const thread = await db.plotThreads.get(target.threadId);
          const beat = target.kind === 'beat' ? thread?.beats.find((b) => b.id === target.beatId) : undefined;
          return beat ? `${thread?.title ?? 'a plot thread'}: ${beat.title || 'a development'}` : (thread?.title ?? 'a plot thread');
        }
        return (await db.chapters.get(target.chapterId))?.title ?? 'a chapter';
      }

      return {
        me,

        // ---------------------------------------------------------------- conversations

        /** Conversations, oldest first, each with its replies. Narrowed to one chapter, entry or plot thread when a key is given. */
        async threads(targetKey?: string): Promise<Thread[]> {
          const rows = targetKey ? await db.comments.where('[projectId+targetKey]').equals([projectId, targetKey]).toArray() : await db.comments.where('projectId').equals(projectId).toArray();
          const roots = rows.filter((row) => row.parentId === null).sort((a, b) => a.createdAt - b.createdAt);
          return roots.map((root) => ({ root, replies: rows.filter((row) => row.threadId === root.id && row.parentId !== null).sort((a, b) => a.createdAt - b.createdAt) }));
        },

        /** Starts a conversation about a stretch of text, a chapter, a codex entry, a plot thread or one of its developments. */
        async comment(target: CommentTarget, body: string, extra: { kind?: Comment['kind']; ratings?: Record<string, number> } = {}): Promise<Comment> {
          need('comment', 'Viewers cannot comment.');
          const kind = extra.kind ?? 'comment';
          if (!body.trim() && kind !== 'feedback') throw new Error('Write the comment first.');
          const [who, now, id] = [me(), stamp(), createId()];
          const targetLabel = await labelOf(target);
          const row: Comment = {
            id, projectId, threadId: id, threadAuthorId: who.id, parentId: null, target, targetKey: targetKeyOf(target), targetLabel, kind, body: body.trim(), ...(extra.ratings ? { ratings: extra.ratings } : {}),
            authorId: who.id, authorName: who.name, authorRole: who.role, status: 'open', resolvedBy: null, resolvedAt: null, createdAt: now, updatedAt: now,
          };
          await write(() => db.comments.add(row), [kind === 'feedback' ? 'gave feedback on' : kind === 'reaction' ? 'reacted to' : 'commented on', 'comments', row.targetKey, targetLabel]);
          return row;
        },

        async reply(threadId: string, body: string): Promise<Comment> {
          need('comment', 'Viewers cannot comment.');
          if (!body.trim()) throw new Error('Write the reply first.');
          const root = await mine(await db.comments.get(threadId), 'conversation');
          const [who, now] = [me(), stamp()];
          const row: Comment = {
            id: createId(), projectId, threadId: root.id, threadAuthorId: root.threadAuthorId, parentId: root.id, target: root.target, targetKey: root.targetKey, targetLabel: root.targetLabel, kind: 'comment', body: body.trim(),
            authorId: who.id, authorName: who.name, authorRole: who.role, status: 'open', resolvedBy: null, resolvedAt: null, createdAt: now, updatedAt: now,
          };
          await write(() => db.comments.add(row), ['replied on', 'comments', root.targetKey, root.targetLabel]);
          return row;
        },

        async edit(commentId: string, body: string): Promise<void> {
          const row = await mine(await db.comments.get(commentId), 'comment');
          if (row.authorId !== me().id) throw new PermissionError('Only its writer can reword a comment.');
          if (!body.trim()) throw new Error('A comment cannot be empty. Delete it instead.');
          await write(() => db.comments.update(commentId, { body: body.trim(), updatedAt: Date.now() }));
        },

        /** Resolves a conversation, or opens it again. */
        async setStatus(threadId: string, status: Comment['status']): Promise<void> {
          const root = await mine(await db.comments.get(threadId), 'conversation');
          const who = me();
          await write(() => db.comments.update(root.id, { status, resolvedBy: status === 'resolved' ? who.name : null, resolvedAt: status === 'resolved' ? Date.now() : null, updatedAt: Date.now() }), [status === 'resolved' ? 'resolved a comment on' : 're-opened a comment on', 'comments', root.targetKey, root.targetLabel]);
        },

        /**
         * Deletes a message. A reply simply goes. The first message of a
         * conversation takes the conversation with it if nobody else has
         * replied; if they have, its words are removed and theirs stay.
         */
        async remove(commentId: string): Promise<void> {
          const row = await mine(await db.comments.get(commentId), 'comment');
          const who = me();
          if (row.authorId !== who.id && !can(who.role, 'decide')) throw new PermissionError('Only its writer or an author can delete a comment.');
          await write(async () => {
            if (row.parentId !== null) return db.comments.delete(row.id);
            const replies = await db.comments.where('threadId').equals(row.id).filter((r) => r.parentId !== null).toArray();
            const others = replies.filter((r) => r.authorId !== who.id);
            if (others.length && !can(who.role, 'decide')) return void (await db.comments.update(row.id, { body: '', deleted: true, updatedAt: Date.now() }));
            await db.comments.bulkDelete([row.id, ...replies.map((r) => r.id)]);
          });
        },

        /**
         * Turns a conversation into something to act on: a task on the
         * progress page, a note, or a development on a plot thread. The
         * conversation is marked with what it became, and resolved.
         */
        async convert(threadId: string, to: Conversion): Promise<NonNullable<Comment['converted']>> {
          need('decide', 'Only an author turns a comment into a task or a note.');
          const root = await mine(await db.comments.get(threadId), 'conversation');
          const quote = root.target.kind === 'text' ? `“${root.target.quote}” ` : '';
          const text = `${quote}${root.body}`.trim();
          const signed = `${text} (${root.authorName}, on ${root.targetLabel})`;
          const who = me();
          let made: Pick<NonNullable<Comment['converted']>, 'kind' | 'label' | 'to'>;
          if (to.kind === 'task') {
            const goal = await deps.progress.forProject(projectId).addGoal('task', { title: signed.slice(0, 200), category: 'editing' });
            made = { kind: 'task', label: `Task: ${goal.title}`, to: `/project/${projectId}/progress` };
          } else if (to.kind === 'note') {
            await deps.assistant.forProject(projectId).addIdea(signed);
            made = { kind: 'note', label: 'A note in Notes / Ideas', to: `/project/${projectId}/assistant?tab=ideas` };
          } else {
            const thread = await db.plotThreads.get(to.plotThreadId);
            if (!thread || thread.projectId !== projectId) throw new Error('Choose a plot thread.');
            const chapterId = root.target.kind === 'text' || root.target.kind === 'chapter' ? root.target.chapterId : null;
            await deps.plot.forProject(projectId).addBeat(thread.id, { title: root.body.slice(0, 80) || 'From a comment', note: signed, nodeId: chapterId });
            made = { kind: 'beat', label: `A development on “${thread.title}”`, to: `/project/${projectId}/plot` };
          }
          const converted = { ...made, by: who.name, at: Date.now() };
          await write(() => db.comments.update(root.id, { converted, status: 'resolved', resolvedBy: who.name, resolvedAt: Date.now(), updatedAt: Date.now() }), [`turned a comment into ${to.kind === 'task' ? 'a task' : to.kind === 'note' ? 'a note' : 'a plot development'}, from`, 'comments', root.targetKey, root.targetLabel]);
          return converted;
        },

        // ---------------------------------------------------------------- suggestions

        async suggestions(targetId?: string): Promise<Suggestion[]> {
          const rows = targetId ? await db.suggestions.where('[projectId+targetId]').equals([projectId, targetId]).toArray() : await db.suggestions.where('projectId').equals(projectId).toArray();
          return rows.sort((a, b) => a.createdAt - b.createdAt);
        },

        /** This person's own suggestion for a chapter that still has changes waiting: the one they carry on with. */
        async myTextSuggestion(chapterId: string): Promise<Suggestion | null> {
          const who = me();
          const rows = await db.suggestions.where('[projectId+targetId]').equals([projectId, chapterId]).toArray();
          return rows.filter((s) => s.kind === 'text' && s.authorId === who.id && isOpen(s)).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
        },

        /**
         * TRACK CHANGES. Keeps the chapter as this person would have it,
         * beside the text as they found it. The manuscript is not touched.
         * Saving the text back to how it was found withdraws the suggestion.
         */
        async saveTextSuggestion(chapterId: string, base: DocJSON, proposed: DocJSON): Promise<Suggestion | null> {
          need('suggest', 'Your role comments; it does not suggest changes.');
          const who = me();
          const chapter = await mine(await db.chapters.get(chapterId), 'chapter');
          const rows = await db.suggestions.where('[projectId+targetId]').equals([projectId, chapterId]).toArray();
          const existing = rows.filter((s) => s.kind === 'text' && s.authorId === who.id && s.status === 'pending').sort((a, b) => b.updatedAt - a.updatedAt)[0];
          const now = stamp();
          const from = existing?.base ?? base;
          if (textHunks(from, proposed).length === 0) {
            if (existing && Object.keys(existing.decisions).length === 0) await write(() => db.suggestions.delete(existing.id));
            return null;
          }
          if (existing) {
            await write(() => db.suggestions.update(existing.id, { proposed, updatedAt: now }));
            return { ...existing, proposed, updatedAt: now };
          }
          const row: Suggestion = {
            id: createId(), projectId, kind: 'text', targetId: chapterId, targetLabel: chapter.title, authorId: who.id, authorName: who.name, authorRole: who.role, note: '', base, proposed,
            status: 'pending', decisions: {}, decidedBy: null, decidedAt: null, createdAt: now, updatedAt: now,
          };
          await write(() => db.suggestions.add(row), ['suggested changes to', 'suggestions', chapterId, chapter.title]);
          return row;
        },

        /** Proposes new values for a codex entry. The entry is not changed. */
        async suggestFields(entryId: string, changes: FieldChange[], note = ''): Promise<Suggestion> {
          need('suggest', 'Your role comments; it does not suggest changes.');
          const entry = await mine(await db.loreEntries.get(entryId), 'entry');
          const real = changes.filter((change) => change.from !== change.to);
          if (!real.length) throw new Error('Change something first.');
          const [who, now] = [me(), stamp()];
          const row: Suggestion = {
            id: createId(), projectId, kind: 'fields', targetId: entryId, targetLabel: entry.name, authorId: who.id, authorName: who.name, authorRole: who.role, note: note.trim(), changes: real,
            status: 'pending', decisions: {}, decidedBy: null, decidedAt: null, createdAt: now, updatedAt: now,
          };
          await write(() => db.suggestions.add(row), ['suggested an edit to', 'suggestions', entryId, entry.name]);
          return row;
        },

        /** Takes back a suggestion of one's own. */
        async withdraw(suggestionId: string): Promise<void> {
          const row = await mine(await db.suggestions.get(suggestionId), 'suggestion');
          if (row.authorId !== me().id) throw new PermissionError('Only its writer can withdraw a suggestion.');
          await write(() => db.suggestions.delete(row.id));
        },

        /**
         * An author's verdict on one change of a text suggestion. Accepting
         * makes that change, and only that change, to the chapter as it
         * stands now, in the author's own name and through the ordinary
         * save (so the earlier text goes to version history). If the
         * passage has been rewritten since, nothing is changed and this
         * says so. Rejecting changes nothing but the record.
         */
        async decideHunk(suggestionId: string, hunkId: string, verdict: Verdict['verdict']): Promise<void> {
          need('decide', 'Only an author accepts or rejects a suggestion.');
          const row = await mine(await db.suggestions.get(suggestionId), 'suggestion');
          const hunk = textHunks(row.base, row.proposed).find((h) => h.id === hunkId);
          if (row.kind !== 'text' || !hunk) throw new Error('That change is no longer part of the suggestion.');
          const who = me();
          if (verdict === 'accepted') {
            const content = await db.chapterContents.get(row.targetId);
            const current = content?.doc ?? ({ type: 'doc', content: [] } as DocJSON);
            const next = applyHunk(current, hunk);
            if (next === null) throw new Error('The text here has been rewritten since this was suggested, so it cannot be applied as it stands. Reject it, or make the change by hand.');
            if (next !== current) await deps.manuscript.forProject(projectId).saveDoc(row.targetId, next, measure(docBlocks(next).map((b) => b.text)), { force: true });
          }
          const decisions = { ...row.decisions, [hunkId]: { verdict, by: who.id, byName: who.name, at: Date.now() } };
          const left = textHunks(row.base, row.proposed).filter((h) => !decisions[h.id]).length;
          const status: Suggestion['status'] = left ? 'pending' : Object.values(decisions).some((d) => d.verdict === 'accepted') ? 'accepted' : 'rejected';
          await write(() => db.suggestions.update(row.id, { decisions, status, decidedBy: left ? null : who.name, decidedAt: left ? null : Date.now(), updatedAt: Date.now() }), [`${verdict} a change suggested by ${row.authorName} in`, 'suggestions', `${row.id}:${hunkId}`, row.targetLabel]);
        },

        /** An author's verdict on a proposed edit to a codex entry. Accepting writes the proposed values to the entry; rejecting changes nothing. */
        async decideFields(suggestionId: string, verdict: Verdict['verdict']): Promise<void> {
          need('decide', 'Only an author accepts or rejects a suggestion.');
          const row = await mine(await db.suggestions.get(suggestionId), 'suggestion');
          if (row.kind !== 'fields' || row.status !== 'pending') throw new Error('That suggestion has already been settled.');
          const who = me();
          if (verdict === 'accepted') {
            const entry = await mine(await db.loreEntries.get(row.targetId), 'entry');
            const changes: Parameters<ReturnType<CodexService['forProject']>['update']>[1] = {};
            let fields = entry.fields;
            for (const change of row.changes ?? []) {
              if (change.field === 'name' || change.field === 'summary' || change.field === 'description') changes[change.field] = change.to;
              else if (change.field.startsWith('field:')) {
                const key = change.field.slice(6);
                fields = fields.some((f) => f.key === key) ? fields.map((f) => (f.key === key ? { ...f, value: change.to } : f)) : [...fields, { id: createId(), key, value: change.to }];
                changes.fields = fields;
              }
            }
            await deps.codex.forProject(projectId).update(entry.id, changes);
          }
          const now = Date.now();
          await write(() => db.suggestions.update(row.id, { status: verdict, decisions: { all: { verdict, by: who.id, byName: who.name, at: now } }, decidedBy: who.name, decidedAt: now, updatedAt: now }), [`${verdict} an edit suggested by ${row.authorName} to`, 'suggestions', row.id, row.targetLabel]);
        },

        // ---------------------------------------------------------------- the team and the record

        members: async (): Promise<Member[]> => (await db.members.where('projectId').equals(projectId).toArray()).sort((a, b) => a.createdAt - b.createdAt),

        /** Keeps the team list everyone sees in step with the relay's. Only the owner's device does this. */
        async mirrorMembers(infos: RelayMemberInfo[]): Promise<void> {
          need('manage', 'Only the owner manages who is on the project.');
          const have = new Map((await db.members.where('projectId').equals(projectId).toArray()).map((m) => [m.id, m]));
          const rows: Member[] = [];
          for (const info of infos) {
            const was = have.get(info.id);
            const next: Member = { id: info.id, projectId, name: info.name, email: info.email, role: info.role, status: info.status, createdAt: info.createdAt, joinedAt: info.joinedAt, lastSyncAt: null, updatedAt: was?.updatedAt ?? Date.now() };
            if (!was || was.name !== next.name || was.role !== next.role || was.status !== next.status || was.email !== next.email || was.joinedAt !== next.joinedAt) rows.push({ ...next, updatedAt: Date.now() });
          }
          if (rows.length) await write(() => db.members.bulkPut(rows));
        },

        /** Notes a change to the team itself in the record. */
        noteTeam(verb: string, memberId: string, name: string): Promise<void> {
          return deps.guard.note(projectId, verb, 'members', memberId, name);
        },

        /** The record of who did what, newest first. */
        async activity(): Promise<Activity[]> {
          await deps.guard.flush();
          return (await db.activity.where('projectId').equals(projectId).toArray()).sort((a, b) => b.at - a.at);
        },
      };
    },
  };
}

export type CollabService = ReturnType<typeof createCollabService>;
export type ProjectCollab = ReturnType<CollabService['forProject']>;
