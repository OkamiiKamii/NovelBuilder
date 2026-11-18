// Scriptor's outputs for what dump.dart dumps of the Flutter app's review by file, keyed and shaped the same way and
// run with the same clock and ids, made by the ported code (src/domain/collab/*). Like the dump, the store's guard is
// copied here (src/data/novelStore.ts `guarded` and `marked`), working on snapshots rather than a database.

import { PermissionError, type Role, can, refusal, reviewRoles, roleLabel, roleSummary, roles } from '../../../src/domain/collab/access';
import {
  CollabError,
  type CollabWrite,
  decideFields,
  decideHunk,
  docWithParagraphs,
  editComment,
  newComment,
  paragraphTexts,
  removeComment,
  reply,
  saveTextSuggestion,
  setThreadStatus,
  suggestFields,
  withdrawSuggestion,
} from '../../../src/domain/collab/collabChanges';
import { textHunks, textOf } from '../../../src/domain/collab/hunks';
import { Activity, Comment, type FieldChange, type Me, Member, Suggestion, ownerId, targetKeyOf, threadsOf } from '../../../src/domain/collab/records';
import {
  ReviewMark,
  feedbackFileText,
  makeFeedback,
  makeReviewCopy,
  mergeReviewCopy,
  newMember,
  readFeedback,
  reviewCopyId,
} from '../../../src/domain/collab/reviewFiles';
import { type JsonMap, mapOrNull, str } from '../../../src/domain/json';
import { textToDoc } from '../../../src/domain/prose';
import { maps } from '../../../src/domain/records/jsonRecord';
import { type NovelSnapshot, SnapshotError } from '../../../src/domain/snapshot/novelSnapshot';

const capabilities = ['manage', 'write', 'decide', 'suggest', 'comment', 'readLore', 'readPlanning', 'seeAllComments', 'seeActivity'] as const;

const writeJson = (w: CollabWrite) => ({ collection: w.collection, id: w.id, value: w.value, before: w.before });

/** The writes applied to a snapshot, as the store applies them (no checks). */
function applied(s: NovelSnapshot, writes: readonly CollabWrite[]): NovelSnapshot {
  let out = s;
  for (const w of writes) {
    out = w.value === null ? out.withRows(w.collection, out.rows(w.collection).filter((r) => r['id'] !== w.id)) : out.putRow(w.collection, w.value);
  }
  return out;
}

class Refused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** The writes applied to a review copy as the store guards them. */
function guarded(copy: NovelSnapshot, writes: readonly CollabWrite[]): NovelSnapshot {
  const mark = ReviewMark.of(copy.project)!;
  let out = copy;
  const keys: string[] = [];
  for (const w of writes) {
    const before = out.rows(w.collection).find((r) => r['id'] === w.id) ?? null;
    const reason = refusal(mark.role, mark.memberId, `${w.collection}:${w.id}`, before, w.value);
    if (reason !== null) throw new Refused(reason);
    keys.push(`${w.collection}:${w.id}`);
    out = applied(out, [w]);
  }
  if (keys.length === 0) return out;
  return out.copyWith({ project: { ...out.project, review: { ...mark.toJson(), changed: [...new Set([...mark.changed, ...keys])] } } });
}

function errorOf(e: unknown): string {
  if (e instanceof PermissionError) return `permission: ${e.message}`;
  if (e instanceof CollabError) return `collab: ${e.message}`;
  if (e instanceof SnapshotError) return `snapshot: ${e.reason}`;
  return `other: ${String(e)}`;
}

const team = (s: NovelSnapshot) => ({
  comments: s.rows('comments'),
  suggestions: s.rows('suggestions'),
  activity: s.rows('activity'),
  review: s.project['review'] ?? null,
});

type Run = () => (copy: NovelSnapshot) => NovelSnapshot;

export function novel(input: NovelSnapshot): Record<string, unknown> {
  let clock = 1800000000000;
  let ids = 0;
  const id = () => `id-${ids++}`;
  const now = () => (clock += 1000);
  const parts: Record<string, unknown> = {};
  const novelId = input.projectId;
  let owner = input;
  const ownerMe: Me = { id: ownerId, name: 'The author', role: 'owner' };

  // ---- the team
  const add = (name: string, role: Role): Member => {
    const row = newMember({ projectId: novelId, name, email: `${name}@example.org`, role, now: now(), id: id() });
    owner = applied(owner, [{ collection: 'members', id: str(row['id']), value: row, before: null }]);
    return new Member(row);
  };
  const sam = add('Sam', 'editor');
  const ria = add('Ria', 'reader');
  const vic = add('Vic', 'viewer');
  const rex = add('Rex', 'reader');
  const refusedMembers: unknown[] = [];
  for (const [name, email, role] of [
    ['', 'x', 'reader'],
    ['Cora', '', 'coauthor'],
    ['Olly', '', 'owner'],
  ] as const) {
    try {
      newMember({ projectId: novelId, name, email, role, now: 1, id: 'x' });
      refusedMembers.push('made');
    } catch (e) {
      refusedMembers.push(errorOf(e));
    }
  }
  parts['members'] = { rows: owner.rows('members'), refused: refusedMembers };

  // ---- review copies
  const copyFor = (m: Member) => makeReviewCopy(owner, m, { ownerName: 'The author', now: now() });
  let samCopy = copyFor(sam);
  let riaCopy = copyFor(ria);
  const riaFirst = riaCopy;
  let vicCopy = copyFor(vic);
  let rexCopy = copyFor(rex);
  const rexRow = owner.rows('members').find((r) => r['id'] === rex.id)!;
  owner = owner.putRow('members', { ...rexRow, status: 'revoked' });
  const copyErrors: unknown[] = [];
  for (const m of [
    new Member({ ...rexRow, status: 'revoked' }),
    new Member({ ...rexRow, role: 'coauthor' }),
    new Member({ ...rexRow, role: 'owner' }),
  ]) {
    try {
      copyFor(m);
      copyErrors.push('made');
    } catch (e) {
      copyErrors.push(errorOf(e));
    }
  }
  for (const [role, copy] of [
    ['editor', samCopy],
    ['reader', riaCopy],
    ['viewer', vicCopy],
  ] as const) {
    parts[`copy:${role}`] = { project: copy.project, collections: copy.collections };
  }
  parts['copy:errors'] = copyErrors;

  const docs = input
    .rows('chapterContents')
    .filter((r) => paragraphTexts(r['doc']).length > 0)
    .slice(0, 2);
  const entry = input.rows('loreEntries')[0] ?? null;
  const thread = input.rows('plotThreads')[0] ?? null;
  const chapterTitle = new Map(input.rows('chapters').map((r) => [str(r['id']), str(r['title'], 'Untitled')]));

  // ---- the scripts
  const steps: unknown[] = [];
  const copies: Record<string, () => NovelSnapshot> = { sam: () => samCopy, ria: () => riaCopy, vic: () => vicCopy, rex: () => rexCopy };
  const setCopy = (who: string, s: NovelSnapshot) => {
    if (who === 'sam') samCopy = s;
    else if (who === 'ria') riaCopy = s;
    else if (who === 'vic') vicCopy = s;
    else rexCopy = s;
  };
  const step = (op: string, run: Run, who: string) => {
    let outcome: string;
    try {
      const next = run()(copies[who]());
      outcome = 'ok';
      setCopy(who, next);
    } catch (e) {
      outcome = e instanceof Refused ? `refused: ${e.reason}` : errorOf(e);
    }
    steps.push({ who, op, outcome, state: team(copies[who]()) });
  };
  const writing = (writes: CollabWrite[]) => (copy: NovelSnapshot) => guarded(copy, writes);
  const activityOf = (s: NovelSnapshot) => s.rows('activity').map((r) => new Activity(r));
  const commentsOf = (s: NovelSnapshot) => s.rows('comments').map((r) => new Comment(r));
  const suggestionsOf = (s: NovelSnapshot) => s.rows('suggestions').map((r) => new Suggestion(r));
  const meOf = (copy: NovelSnapshot) => ReviewMark.of(copy.project)!.me;
  const comment =
    (copy: () => NovelSnapshot, target: JsonMap, label: string, body: string, kind = 'comment', ratings?: Record<string, number>): Run =>
    () => {
      const c = copy();
      return writing(
        newComment(meOf(c), {
          projectId: c.projectId,
          target,
          targetLabel: label,
          body,
          kind,
          ratings: ratings ?? null,
          now: now(),
          newId: id,
          activity: activityOf(c),
        }),
      );
    };

  for (const doc of docs) {
    const cid = str(doc['id']);
    const title = chapterTitle.get(cid) ?? 'Untitled';
    const texts = paragraphTexts(doc['doc']);
    step(
      'comment on text',
      comment(
        () => samCopy,
        { kind: 'text', chapterId: cid, quote: texts[0].length > 120 ? `${texts[0].substring(0, 120)}…` : texts[0], block: 0, offset: 0 },
        title,
        '  This line sings.  ',
      ),
      'sam',
    );
    step('comment on chapter', comment(() => samCopy, { kind: 'chapter', chapterId: cid }, title, 'Strong ending.'), 'sam');
    step('comment again soon', comment(() => samCopy, { kind: 'chapter', chapterId: cid }, title, 'And the middle.'), 'sam');
    step('reaction', comment(() => samCopy, { kind: 'chapter', chapterId: cid }, title, 'Loved this', 'reaction'), 'sam');
    step(
      'feedback form',
      comment(() => samCopy, { kind: 'chapter', chapterId: cid }, title, '', 'feedback', { pacing: 4, clarity: 3, engagement: 5 }),
      'sam',
    );
    step('empty comment', comment(() => samCopy, { kind: 'chapter', chapterId: cid }, title, '   '), 'sam');
    const blocks = maps(mapOrNull(doc['doc'])?.['content']);
    const suggest =
      (paragraphs: { original: unknown; text: string | null }[]): Run =>
      () => {
        const c = samCopy;
        const base = mapOrNull(doc['doc'])!;
        return writing(
          saveTextSuggestion(meOf(c), {
            projectId: c.projectId,
            chapterId: cid,
            chapterTitle: title,
            base,
            proposed: docWithParagraphs(base, paragraphs),
            existing: suggestionsOf(c).filter((s) => s.targetId === cid),
            now: now(),
            newId: id,
            activity: activityOf(c),
          }),
        );
      };
    const edited: { original: unknown; text: string | null }[] = [];
    blocks.forEach((b, i) => {
      if (i === 0) edited.push({ original: b, text: 'A sharper opening.' });
      else if (!(i === blocks.length - 1 && blocks.length > 2)) edited.push({ original: b, text: null });
    });
    edited.splice(1, 0, { original: null, text: 'A new paragraph.' });
    step('suggest text', suggest(edited), 'sam');
    step('suggest text again', suggest([...edited, { original: null, text: 'One more at the end.' }]), 'sam');
    step('suggest back to as found', suggest(blocks.map((b) => ({ original: b, text: null }))), 'sam');
    step('suggest text once more', suggest(edited), 'sam');
  }
  if (entry !== null) {
    const eid = str(entry['id']);
    const name = str(entry['name']);
    step('comment on entry', comment(() => samCopy, { kind: 'entry', entryId: eid }, name, 'Who is this?'), 'sam');
    const fields =
      (changes: FieldChange[], note: string): Run =>
      () => {
        const c = samCopy;
        return writing(
          suggestFields(meOf(c), {
            projectId: c.projectId,
            entryId: eid,
            entryName: name,
            changes,
            note,
            now: now(),
            newId: id,
            activity: activityOf(c),
          }),
        );
      };
    const firstField = maps(entry['fields'])[0] ?? null;
    step(
      'suggest an edit',
      fields(
        [
          { field: 'name', label: 'Name', from: name, to: `${name} the Second` },
          { field: 'summary', label: 'Summary', from: str(entry['summary']), to: str(entry['summary']) },
          ...(firstField !== null
            ? [{ field: `field:${str(firstField['key'])}`, label: str(firstField['key']), from: str(firstField['value']), to: 'Changed' }]
            : []),
          { field: 'field:Brand new', label: 'Brand new', from: '', to: 'A value' },
        ],
        '  A note.  ',
      ),
      'sam',
    );
    step('suggest nothing', fields([{ field: 'name', label: 'Name', from: name, to: name }], ''), 'sam');
    step('suggest another edit', fields([{ field: 'description', label: 'Description', from: '', to: 'Words.' }], ''), 'sam');
    step(
      'withdraw it',
      () => {
        const all = suggestionsOf(samCopy).filter((s) => !s.isText);
        const s = all[all.length - 1];
        if (s === undefined) throw new Error('Bad state: No element');
        return writing([withdrawSuggestion(meOf(samCopy), s)]);
      },
      'sam',
    );
  }
  if (thread !== null) {
    step(
      'comment on thread',
      comment(() => samCopy, { kind: 'thread', threadId: str(thread['id']) }, str(thread['title']), 'Where does this go?'),
      'sam',
    );
  }
  const samRoots = [
    ...commentsOf(samCopy).filter((c) => c.isRoot && c.kind === 'comment' && c.authorId === sam.id),
    ...commentsOf(samCopy).filter((c) => c.isRoot && c.kind === 'comment' && c.authorId !== sam.id),
  ];
  if (samRoots.length > 0) {
    const root = samRoots[0];
    const now_ = (cid: string) => commentsOf(samCopy).find((c) => c.id === cid)!;
    step('reply', () => writing(reply(meOf(samCopy), root, { body: 'Agreed, on reflection.', now: now(), newId: id, activity: activityOf(samCopy) })), 'sam');
    step('empty reply', () => writing(reply(meOf(samCopy), root, { body: '', now: now(), newId: id })), 'sam');
    step(
      'resolve',
      () => {
        const r = now_(root.id);
        return writing(setThreadStatus(meOf(samCopy), r, { resolved: true, now: now(), newId: id, activity: activityOf(samCopy) }));
      },
      'sam',
    );
    step(
      're-open',
      () => {
        const r = now_(root.id);
        return writing(setThreadStatus(meOf(samCopy), r, { resolved: false, now: now(), newId: id, activity: activityOf(samCopy) }));
      },
      'sam',
    );
    step(
      'reword',
      () => {
        const r = now_(root.id);
        return writing([editComment(meOf(samCopy), r, ' Reworded. ', now())]);
      },
      'sam',
    );
    step(
      'reword empty',
      () => {
        const r = now_(root.id);
        return writing([editComment(meOf(samCopy), r, '  ', now())]);
      },
      'sam',
    );
    for (const other of samRoots.slice(1, 3)) {
      step(
        'delete a conversation',
        () => {
          const r = now_(other.id);
          return writing(removeComment(meOf(samCopy), r, commentsOf(samCopy), now()));
        },
        'sam',
      );
    }
    const others = commentsOf(samCopy).filter((c) => c.isRoot && c.authorId !== sam.id);
    if (others.length > 0) {
      step('reword someone else’s', () => writing([editComment(meOf(samCopy), others[0], 'Mine.', now())]), 'sam');
      step(
        'resolve someone else’s',
        () => writing(setThreadStatus(meOf(samCopy), others[0], { resolved: true, now: now(), newId: id, activity: activityOf(samCopy) })),
        'sam',
      );
    }
  }
  const firstChapter = samCopy.rows('chapters')[0] ?? null;
  if (firstChapter !== null) {
    step(
      'rename a chapter',
      () => writing([{ collection: 'chapters', id: str(firstChapter['id']), value: { ...firstChapter, title: 'Mine' }, before: firstChapter }]),
      'sam',
    );
  }
  const firstText = samCopy.rows('chapterContents')[0] ?? null;
  if (firstText !== null) {
    step(
      'change the text',
      () =>
        writing([{ collection: 'chapterContents', id: str(firstText['id']), value: { ...firstText, doc: textToDoc('Mine now.') }, before: firstText }]),
      'sam',
    );
  }
  step('add to the team', () => writing([{ collection: 'members', id: 'm-new', value: { id: 'm-new', name: 'X' }, before: null }]), 'sam');
  step(
    'a comment in the owner’s name',
    () => {
      const rows = newComment(
        { id: ownerId, name: 'The author', role: 'owner' },
        { projectId: samCopy.projectId, target: { kind: 'chapter', chapterId: 'c' }, targetLabel: 'C', body: 'Forged.', now: now(), newId: id },
      );
      return writing(rows);
    },
    'sam',
  );

  for (const doc of docs.slice(0, 1)) {
    const cid = str(doc['id']);
    const title = chapterTitle.get(cid) ?? 'Untitled';
    step('reader comments', comment(() => riaCopy, { kind: 'chapter', chapterId: cid }, title, 'I was lost here.'), 'ria');
    step('reader reacts', comment(() => riaCopy, { kind: 'chapter', chapterId: cid }, title, 'Confused', 'reaction'), 'ria');
    step(
      'reader suggests',
      () => {
        const base = mapOrNull(doc['doc'])!;
        return writing(
          saveTextSuggestion(meOf(riaCopy), {
            projectId: riaCopy.projectId,
            chapterId: cid,
            chapterTitle: title,
            base,
            proposed: textToDoc('Other.'),
            existing: [],
            now: now(),
            newId: id,
          }),
        );
      },
      'ria',
    );
    const mine = commentsOf(riaCopy).find((c) => c.isRoot) ?? null;
    if (mine !== null) {
      step(
        'reader replies to themselves',
        () => writing(reply(meOf(riaCopy), mine, { body: 'Still lost.', now: now(), newId: id, activity: activityOf(riaCopy) })),
        'ria',
      );
      step(
        'reader resolves',
        () => writing(setThreadStatus(meOf(riaCopy), mine, { resolved: true, now: now(), newId: id, activity: activityOf(riaCopy) })),
        'ria',
      );
    }
    step('viewer comments', comment(() => vicCopy, { kind: 'chapter', chapterId: cid }, title, 'Hello.'), 'vic');
    step('removed person comments', comment(() => rexCopy, { kind: 'chapter', chapterId: cid }, title, 'Still here.'), 'rex');
  }
  parts['steps'] = steps;

  // ---- feedback, back with the owner
  const feedback = makeFeedback(samCopy, now());
  parts['feedback:editor'] = feedback;
  parts['feedback:text'] = feedbackFileText(makeFeedback(riaCopy, 1));
  const members = owner.rows('members').map((r) => new Member(r));
  const stored = (c: string, i: string) => owner.rows(c).find((r) => r['id'] === i) ?? null;
  const previewOf = (text: string, forNovel: string): unknown => {
    try {
      const p = readFeedback(text, { novelId: forNovel, members, stored });
      return {
        member: p.member.id,
        sentAt: p.sentAt,
        writes: p.writes.map(writeJson),
        refused: p.refused.map((r) => ({ what: r.what, reason: r.reason })),
        unchanged: p.unchanged,
        counts: [p.count('comments'), p.count('suggestions'), p.count('activity'), p.count('comments', (r) => r['kind'] === 'reaction')],
      };
    } catch (e) {
      return errorOf(e);
    }
  };
  const tampered = [
    ...maps(feedback['changes']),
    { collection: 'chapterContents', id: 'x', row: { id: 'x', doc: textToDoc('Hacked.') } },
    { collection: 'comments', id: 'other', row: { id: 'wrong' } },
    { collection: 'comments', id: 'proj', row: { id: 'proj', projectId: 'elsewhere' } },
    { collection: 'activity', id: 'a1', row: { id: 'a1', actorId: ownerId } },
    { collection: 'suggestions', id: 'gone', row: null },
  ];
  const preview: Record<string, unknown> = {};
  preview['honest'] = previewOf(JSON.stringify(feedback), novelId);
  preview['tampered'] = previewOf(JSON.stringify({ ...feedback, changes: tampered }), novelId);
  preview['reader'] = previewOf(JSON.stringify(makeFeedback(riaCopy, now())), novelId);
  preview['removed'] = previewOf(JSON.stringify(makeFeedback(rexCopy, now())), novelId);
  preview['another novel'] = previewOf(JSON.stringify(feedback), 'another');
  preview['not a file'] = previewOf('{not json', novelId);
  preview['not feedback'] = previewOf('{"format":"novel-builder/project"}', novelId);
  preview['newer'] = previewOf(JSON.stringify({ ...feedback, version: 2 }), novelId);
  preview['stranger'] = previewOf(JSON.stringify({ ...feedback, memberId: 'nobody', memberName: 'Nemo' }), novelId);
  parts['preview'] = preview;
  try {
    makeFeedback(owner, 1);
  } catch (e) {
    parts['feedback:owner'] = errorOf(e);
  }

  const honest = readFeedback(JSON.stringify(feedback), { novelId, members, stored });
  owner = applied(owner, honest.writes);
  const decisions: unknown[] = [];
  let turn = 0;
  for (const row of [...owner.rows('suggestions')]) {
    const s = new Suggestion(row);
    if (s.isText) {
      for (const h of textHunks(s.base, s.proposed)) {
        const current = new Suggestion(owner.rows('suggestions').find((r) => r['id'] === s.id)!);
        const content = owner.rows('chapterContents').find((r) => r['id'] === s.targetId) ?? null;
        const accept = turn++ % 2 === 0;
        try {
          const d = decideHunk(ownerMe, current, h.id, {
            accept,
            currentDoc: content?.['doc'],
            now: now(),
            newId: id,
            activity: owner.rows('activity').map((r) => new Activity(r)),
          });
          if (d.doc !== null) owner = owner.putRow('chapterContents', { ...(content ?? {}), doc: d.doc });
          owner = applied(owner, d.writes);
          decisions.push({ hunk: h.id, accept, doc: d.doc, writes: d.writes.map(writeJson) });
        } catch (e) {
          decisions.push({ hunk: h.id, accept, error: errorOf(e) });
        }
      }
      try {
        decideHunk(ownerMe, s, 'no-such', { accept: true, currentDoc: null, now: now(), newId: id });
      } catch (e) {
        decisions.push(errorOf(e));
      }
    } else {
      const accept = turn++ % 2 === 0;
      const e = owner.rows('loreEntries').find((r) => r['id'] === s.targetId) ?? null;
      try {
        const writes = decideFields(ownerMe, s, { accept, entry: e, now: now(), newId: id });
        owner = applied(owner, writes);
        decisions.push({ suggestion: s.id, accept, writes: writes.map(writeJson) });
      } catch (err) {
        decisions.push({ suggestion: s.id, error: errorOf(err) });
      }
      try {
        decideFields(ownerMe, new Suggestion(owner.rows('suggestions').find((r) => r['id'] === s.id)!), {
          accept: true,
          entry: e,
          now: now(),
          newId: id,
        });
      } catch (err) {
        decisions.push(errorOf(err));
      }
    }
  }
  for (const row of owner.rows('suggestions')) {
    try {
      decideFields({ id: sam.id, name: 'Sam', role: 'editor' }, new Suggestion(row), { accept: true, entry: null, now: now(), newId: id });
    } catch (e) {
      decisions.push(errorOf(e));
    }
  }
  parts['decisions'] = decisions;

  const ownerComments = owner.rows('comments').map((r) => new Comment(r));
  const withReplies = ownerComments.find((c) => c.isRoot && ownerComments.some((r) => r.threadId === c.id && !r.isRoot)) ?? null;
  const ownerSide: unknown[] = [];
  if (withReplies !== null) ownerSide.push(removeComment(ownerMe, withReplies, ownerComments, now()).map(writeJson));
  for (const c of ownerComments.slice(0, 3)) {
    try {
      ownerSide.push(writeJson(editComment(ownerMe, c, 'Mine.', 5)));
    } catch (e) {
      ownerSide.push(errorOf(e));
    }
    try {
      ownerSide.push(removeComment({ id: 'stranger', name: 'X', role: 'reader' }, c, ownerComments, 5).map(writeJson));
    } catch (e) {
      ownerSide.push(errorOf(e));
    }
  }
  ownerSide.push({ threads: threadsOf(ownerComments).map((t) => [t.root.id, ...t.replies.map((r) => r.id)]) });
  ownerSide.push({
    open: owner.rows('suggestions').map((r) => new Suggestion(r).isOpen),
    openHunks: owner.rows('suggestions').map((r) => new Suggestion(r).openHunks.map((h) => h.id)),
  });
  parts['owner'] = {
    side: ownerSide,
    book: { chapterContents: owner.rows('chapterContents'), loreEntries: owner.rows('loreEntries') },
    team: team(owner),
  };

  const merges: unknown[] = [];
  const newer = copyFor(ria);
  try {
    const merged = mergeReviewCopy(newer, riaCopy);
    merges.push({ project: merged.project, collections: merged.collections });
    try {
      mergeReviewCopy(riaFirst, merged);
      merges.push('merged');
    } catch (e) {
      merges.push(errorOf(e));
    }
  } catch (e) {
    merges.push(errorOf(e));
  }
  merges.push(mergeReviewCopy(newer, null) === newer);
  merges.push(mergeReviewCopy(newer, owner) === newer);
  merges.push(mergeReviewCopy(newer, samCopy) === newer);
  try {
    mergeReviewCopy(owner, null);
  } catch (e) {
    merges.push(errorOf(e));
  }
  parts['merge'] = merges;

  parts['paragraphs'] = Object.fromEntries(input.rows('chapterContents').map((r) => [str(r['id']), paragraphTexts(r['doc'])]));
  const contents = input.rows('chapterContents').slice(0, 6);
  const hunks: unknown[] = [];
  for (let i = 0; i + 1 < contents.length; i++) {
    hunks.push(
      textHunks(contents[i]['doc'], contents[i + 1]['doc']).map((h) => ({
        id: h.id,
        at: h.at,
        remove: h.remove.length,
        insert: h.insert.length,
        text: [textOf(h.remove), textOf(h.insert)],
      })),
    );
  }
  parts['hunks'] = hunks;
  return parts;
}

export function misc(): Record<string, unknown> {
  return {
    roles: roles.map((r) => [r, roleLabel[r], roleSummary[r], ...capabilities.map((c) => can(r, c))]),
    reviewRoles: [...reviewRoles],
    targets: [
      { kind: 'text', chapterId: 'c1' },
      { kind: 'chapter', chapterId: 'c2' },
      { kind: 'entry', entryId: 'e1' },
      { kind: 'thread', threadId: 't1' },
      { kind: 'beat', threadId: 't2', beatId: 'b' },
      {},
    ].map(targetKeyOf),
    docWithParagraphs: [
      docWithParagraphs(null, [
        { original: null, text: 'One' },
        { original: null, text: '' },
      ]),
      docWithParagraphs({ type: 'doc', extra: 1, content: [] }, [
        { original: { type: 'heading', attrs: { level: 2 }, content: [] }, text: 'Head' },
        { original: { type: 'paragraph', attrs: null }, text: 'Plain' },
        { original: { type: 'paragraph', content: [{ type: 'text', text: 'Kept' }] }, text: null },
      ]),
    ],
    reviewCopyId: reviewCopyId('n', 'm'),
    marks: [
      { review: { role: 'editor', novelId: 'n', memberId: 'm', changed: ['a:b', 3] } },
      { review: { role: 'owner' } },
      { review: { role: 'coauthor' } },
      { review: { role: 'nobody' } },
      { review: 'x' },
      {},
    ].map((p) => ReviewMark.of(p)?.toJson() ?? null),
  };
}
