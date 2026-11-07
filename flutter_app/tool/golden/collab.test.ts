// Reference outputs of the original app's collaboration rules (who may see and change what) and of its suggested-edit
// changes (splitting a suggestion into changes, and applying one to a chapter as it is now), for the Flutter rebuild.
// Each case carries its inputs, so the Dart tests run exactly these cases.
// Run as the other golden scripts: GOLDEN_OUT=<dir> FIXTURES=<flutter_app/test/fixtures> npx vitest run golden/collab.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { ROLES, refusal, visible } from '@/modules/sync/access';
import { applyHunk, textHunks, textOf } from '@/modules/collab/hunks';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES = process.env.FIXTURES!;
const NOVELS = ['qa-sample', 'canon', 'book'];
type Row = Record<string, unknown>;

const para = (text: string) => ({ type: 'paragraph', attrs: { textAlign: null }, content: text ? [{ type: 'text', text }] : [] });

// Rows of the team, in the original's shapes, written by the owner and by two members.
function teamRows(projectId: string, chapterId: string, entryId: string): Record<string, Row[]> {
  const base = { type: 'doc', content: [para('One.'), para('Two.'), para('Three.')] };
  return {
    members: [
      { id: 'm-ed', projectId, name: 'Sam', email: 'sam@example.com', role: 'editor', status: 'active', createdAt: 1, joinedAt: 2, lastSyncAt: null, updatedAt: 2 },
      { id: 'm-rd', projectId, name: 'Ria', email: 'ria@example.com', role: 'reader', status: 'active', createdAt: 1, joinedAt: 2, lastSyncAt: null, updatedAt: 2 },
    ],
    comments: [
      { id: 'c1', projectId, threadId: 'c1', threadAuthorId: 'm-rd', parentId: null, target: { kind: 'text', chapterId, quote: 'Two', block: 1, offset: 0 }, targetKey: `chapter:${chapterId}`, targetLabel: 'A chapter', kind: 'comment', body: 'Lovely.', authorId: 'm-rd', authorName: 'Ria', authorRole: 'reader', status: 'open', resolvedBy: null, resolvedAt: null, createdAt: 10, updatedAt: 10 },
      { id: 'c2', projectId, threadId: 'c1', threadAuthorId: 'm-rd', parentId: 'c1', target: { kind: 'text', chapterId, quote: 'Two', block: 1, offset: 0 }, targetKey: `chapter:${chapterId}`, targetLabel: 'A chapter', kind: 'comment', body: 'Thanks!', authorId: 'owner', authorName: 'The owner', authorRole: 'owner', status: 'open', resolvedBy: null, resolvedAt: null, createdAt: 11, updatedAt: 11 },
      { id: 'c3', projectId, threadId: 'c3', threadAuthorId: 'm-ed', parentId: null, target: { kind: 'entry', entryId }, targetKey: `entry:${entryId}`, targetLabel: 'An entry', kind: 'comment', body: 'Check this.', authorId: 'm-ed', authorName: 'Sam', authorRole: 'editor', status: 'open', resolvedBy: null, resolvedAt: null, createdAt: 12, updatedAt: 12 },
      { id: 'c4', projectId, threadId: 'c4', threadAuthorId: 'm-rd', parentId: null, target: { kind: 'chapter', chapterId }, targetKey: `chapter:${chapterId}`, targetLabel: 'A chapter', kind: 'feedback', body: '', ratings: { pacing: 4, clarity: 5, engagement: 3 }, authorId: 'm-rd', authorName: 'Ria', authorRole: 'reader', status: 'open', resolvedBy: null, resolvedAt: null, createdAt: 13, updatedAt: 13 },
    ],
    suggestions: [
      { id: 's1', projectId, kind: 'text', targetId: chapterId, targetLabel: 'A chapter', authorId: 'm-ed', authorName: 'Sam', authorRole: 'editor', note: '', base, proposed: { type: 'doc', content: [para('One.'), para('Two, better.'), para('Three.')] }, status: 'pending', decisions: {}, decidedBy: null, decidedAt: null, createdAt: 20, updatedAt: 20 },
      { id: 's2', projectId, kind: 'fields', targetId: entryId, targetLabel: 'An entry', authorId: 'm-ed', authorName: 'Sam', authorRole: 'editor', note: 'Typo', changes: [{ field: 'name', label: 'Name', from: 'A', to: 'B' }], status: 'pending', decisions: {}, decidedBy: null, decidedAt: null, createdAt: 21, updatedAt: 21 },
    ],
    activity: [
      { id: 'a1', projectId, at: 30, actorId: 'm-ed', actorName: 'Sam', actorRole: 'editor', verb: 'suggested changes to', table: 'suggestions', rowId: chapterId, label: 'A chapter', count: 1 },
      { id: 'a2', projectId, at: 31, actorId: 'owner', actorName: 'The owner', actorRole: 'owner', verb: 'edited', table: 'chapterContents', rowId: chapterId, label: 'A chapter', count: 2 },
    ],
  };
}

// Changes someone might send: each row as it is, signed as each member, changed a little, and deleted.
function variants(row: Row, memberId: string): { before: Row | null; after: Row | null }[] {
  const signed = (r: Row): Row => ({
    ...r,
    ...('authorId' in r ? { authorId: memberId } : {}),
    ...('threadAuthorId' in r ? { threadAuthorId: memberId } : {}),
    ...('actorId' in r ? { actorId: memberId } : {}),
  });
  const touched = (r: Row): Row => ({ ...r, updatedAt: Number(r.updatedAt ?? 0) + 1, body: 'body' in r ? `${String(r.body)}!` : undefined });
  const resolved = (r: Row): Row => ({ ...r, status: 'resolved', resolvedBy: 'Someone', resolvedAt: 99, updatedAt: 99 });
  const decided = (r: Row): Row => ({ ...r, status: 'accepted', decisions: { all: { verdict: 'accepted', by: memberId, byName: 'X', at: 1 } } });
  return [
    { before: null, after: row },
    { before: null, after: signed(row) },
    { before: row, after: touched(row) },
    { before: signed(row), after: touched(signed(row)) },
    { before: row, after: resolved(row) },
    { before: signed(row), after: decided(signed(row)) },
    { before: row, after: null },
    { before: signed(row), after: null },
  ];
}

// Paragraph edits of a chapter: one changed, one added at the start, the end and the middle, one removed, several.
function edits(doc: { content: unknown[] }): { name: string; proposed: unknown }[] {
  const c = doc.content;
  const out: { name: string; proposed: unknown }[] = [{ name: 'unchanged', proposed: doc }];
  if (c.length) out.push({ name: 'first changed', proposed: { ...doc, content: [para('A new first paragraph.'), ...c.slice(1)] } });
  out.push({ name: 'added at start', proposed: { ...doc, content: [para('Added before.'), ...c] } });
  out.push({ name: 'added at end', proposed: { ...doc, content: [...c, para('Added after.')] } });
  if (c.length >= 2) {
    out.push({ name: 'added in the middle', proposed: { ...doc, content: [c[0], para('Between.'), ...c.slice(1)] } });
    out.push({ name: 'second removed', proposed: { ...doc, content: [c[0], ...c.slice(2)] } });
    out.push({ name: 'several', proposed: { ...doc, content: [para('Changed one.'), ...c.slice(1, -1), para('Changed last.'), para('And more.')] } });
  }
  return out;
}

// The chapter as it might be NOW: as it was, with an unrelated paragraph added at the start, and with everything rewritten.
function nows(doc: { content: unknown[] }): { name: string; doc: unknown }[] {
  return [
    { name: 'as it was', doc },
    { name: 'a paragraph added at the start since', doc: { ...doc, content: [para('Written since.'), ...doc.content] } },
    { name: 'rewritten since', doc: { ...doc, content: doc.content.map((_, i) => para(`Rewritten ${i}.`)) } },
  ];
}

test('collab goldens', () => {
  const access: unknown[] = [];
  const hunks: unknown[] = [];
  for (const name of NOVELS) {
    const file = JSON.parse(readFileSync(join(FIXTURES, `${name}.novel.json`), 'utf8'));
    const projectId = file.project.id as string;
    const chapters = (file.collections.chapters ?? []) as Row[];
    const chapterId = String(chapters.find((r) => r.kind === 'chapter')?.id ?? 'none');
    const entryId = String(((file.collections.loreEntries ?? []) as Row[])[0]?.id ?? 'none');
    const collections: Record<string, Row[]> = { ...file.collections, ...teamRows(projectId, chapterId, entryId) };
    const lookup = (key: string): Row | null => {
      const [table, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      return (collections[table] ?? []).find((r) => r.id === id) ?? null;
    };
    const rows: [string, Row][] = [[`projects:${projectId}`, file.project]];
    for (const [table, list] of Object.entries(collections)) for (const row of list) rows.push([`${table}:${String(row.id)}`, row]);
    for (const role of ROLES) {
      for (const memberId of ['m-ed', 'm-rd']) {
        for (const [key, row] of rows) {
          const seen = visible(role, memberId, key, row, lookup);
          const lookupNeeds = key.startsWith('chapterContents:') ? lookup(`chapters:${key.slice(key.indexOf(':') + 1)}`) : null;
          access.push({ novel: name, kind: 'visible', role, memberId, key, row, chapter: lookupNeeds, expected: seen === row ? 'same' : seen });
        }
        // Only the team's rows and a sample of the book's are tried as changes: the rule for the book is the same for every row.
        const tried = rows.filter(([key]) => /^(members|comments|suggestions|activity|projects|chapters|chapterContents|loreEntries|canonFacts|settings|timelines):/.test(key)).slice(0, 60);
        for (const [key, row] of tried) for (const { before, after } of variants(row, memberId)) access.push({ novel: name, kind: 'refusal', role, memberId, key, before, after, expected: refusal(role, memberId, key, before, after) });
      }
    }
    for (const content of (file.collections.chapterContents ?? []) as Row[]) {
      const doc = content.doc as { content: unknown[] };
      if (!doc?.content) continue;
      for (const edit of edits(doc)) {
        const found = textHunks(doc, edit.proposed);
        const applied = nows(doc).map((now) =>
          found.map((hunk) => {
            const next = applyHunk(now.doc, hunk);
            return { now: now.name, hunk: hunk.id, result: next === null ? null : next === now.doc ? 'same' : next };
          }),
        );
        hunks.push({
          novel: name,
          chapter: content.id,
          edit: edit.name,
          base: doc,
          proposed: edit.proposed,
          nows: nows(doc),
          hunks: found.map((h) => ({ id: h.id, at: h.at, remove: h.remove, insert: h.insert, before: h.before, text: [textOf(h.remove), textOf(h.insert)] })),
          applied,
        });
      }
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'collab.golden.json'), JSON.stringify({ access, hunks }));
});
