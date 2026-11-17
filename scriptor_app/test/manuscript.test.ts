import { openLibrary } from '../src/data/library';
import { maxRevisions, revisionIntervalMs, SaveConflict } from '../src/data/manuscriptService';
import { setIdGenerator } from '../src/domain/ids';
import type { JsonMap } from '../src/domain/json';
import { readingOrder, storyNode } from '../src/domain/outline';
import { countWords, measureDoc, mentionsIn, textToDoc } from '../src/domain/prose';
import { testIds } from './fixtures';
import { memoryLibrary } from './nodeSql';

setIdGenerator(testIds());

function setup() {
  let now = 1_700_000_000_000;
  const clock = { now: () => now, advance: (ms: number) => (now += ms) };
  const lib = openLibrary(memoryLibrary(), clock.now, testIds());
  const { novel } = lib.library.create({ title: 'Book' });
  return { lib, ms: lib.manuscript, p: novel.id, clock };
}

const para = (text: string, marks?: JsonMap[]): JsonMap => ({
  type: 'paragraph',
  attrs: { textAlign: null },
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});
const doc = (...texts: string[]): JsonMap => ({ type: 'doc', content: texts.map((t) => para(t)) });

describe('counting words as the Flutter app counts them', () => {
  it.each([
    ['', 0],
    ['One two three.', 3],
    ["Don't stop, e.g. now.", 4],
    ['It cost 1,000 coins at 3.14 each.', 7],
    ['A well-known road', 4],
    ['_snake_case and naïve café', 4],
  ])('“%s” has %i words', (text, n) => {
    expect(countWords(text)).toBe(n);
  });

  it('measures a document and finds the entries it links', () => {
    const d: JsonMap = {
      type: 'doc',
      content: [para('Wren met '), para('Kai', [{ type: 'entityLink', attrs: { entryId: 'k' } }]), { type: 'heading', attrs: { level: 1, textAlign: null }, content: [{ type: 'text', text: 'End' }] }],
    };
    expect(measureDoc(d)).toMatchObject({ words: 4, paragraphs: 3, readingMinutes: 1 });
    expect(mentionsIn(d)).toEqual(['k']);
    expect(textToDoc('a\n\nb').content).toHaveLength(3);
  });
});

describe('the outline', () => {
  it('adds parts, chapters and scenes where they may go, numbered across the book', () => {
    const { ms, p } = setup();
    const v = ms.create(p, 'volume');
    const c1 = ms.create(p, 'chapter', v.id);
    const c2 = ms.create(p, 'chapter');
    const s1 = ms.create(p, 'scene', c1.id);
    expect([v.title, c1.title, c2.title, s1.title]).toEqual(['Volume 1', 'Chapter 1', 'Chapter 2', 'Scene 1']);
    expect(() => ms.create(p, 'scene')).toThrow('A scene must be inside a chapter.');
    expect(() => ms.create(p, 'volume', c1.id)).toThrow();
    expect(readingOrder(ms.nodes(p)).map((e) => [e.node.title, e.depth])).toEqual([
      ['Volume 1', 0],
      ['Chapter 1', 1],
      ['Scene 1', 2],
      ['Chapter 2', 0],
    ]);
  });

  it('renames, sets status, nudges and moves, refusing moves that cannot be', () => {
    const { ms, p } = setup();
    const a = ms.create(p, 'chapter');
    const b = ms.create(p, 'chapter');
    const act = ms.create(p, 'act');
    ms.rename(p, a.id, '  ');
    ms.setStatus(p, a.id, 'drafting');
    ms.nudge(p, b.id, -1);
    expect(ms.nodes(p).find((n) => n.id === a.id)).toMatchObject({ title: 'Untitled', status: 'drafting' });
    expect(readingOrder(ms.nodes(p)).map((e) => e.node.id)).toEqual([b.id, a.id, act.id]);
    ms.move(p, a.id, act.id);
    expect(ms.nodes(p).find((n) => n.id === a.id)?.parentId).toBe(act.id);
    expect(() => ms.move(p, act.id, act.id)).toThrow('cannot be moved inside itself');
  });

  it('duplicates a chapter with its scenes and text', () => {
    const { ms, p } = setup();
    const c = ms.create(p, 'chapter');
    const s = ms.create(p, 'scene', c.id);
    ms.save(p, s.id, doc('Scene text'), { baseRev: 0 });
    const copyId = ms.duplicate(p, c.id);
    const nodes = ms.nodes(p);
    expect(nodes.find((n) => n.id === copyId)?.title).toBe('Chapter 1 (Copy)');
    const copiedScene = nodes.find((n) => n.parentId === copyId)!;
    expect(ms.open(p, copiedScene.id).doc).toEqual(doc('Scene text'));
    expect(readingOrder(nodes).filter((e) => e.depth === 0).map((e) => e.node.id)).toEqual([c.id, copyId]);
  });

  it('splits at a paragraph, keeping the text before it in history', () => {
    const { ms, p } = setup();
    const c = ms.create(p, 'chapter');
    ms.save(p, c.id, doc('One', 'Two', 'Three'), { baseRev: 0 });
    const tailId = ms.split(p, c.id, doc('One'), doc('Two', 'Three'));
    expect(ms.open(p, c.id).doc).toEqual(doc('One'));
    expect(ms.open(p, tailId).doc).toEqual(doc('Two', 'Three'));
    expect(ms.nodes(p).find((n) => n.id === tailId)?.title).toBe('Chapter 1 (continued)');
    expect(ms.revisions(p, c.id)[0]).toMatchObject({ reason: 'manual', label: 'Before splitting' });
  });

  it('merges the next one in, re-pointing what pointed at it', () => {
    const { lib, ms, p } = setup();
    const a = ms.create(p, 'chapter');
    const b = ms.create(p, 'chapter');
    ms.save(p, a.id, doc('A'), { baseRev: 0 });
    ms.save(p, b.id, doc('B'), { baseRev: 0 });
    lib.novels.writeRows(p, [{ collection: 'timelineEvents', id: 'e', value: { id: 'e', chapterIds: [a.id, b.id] } }]);
    expect(ms.canMerge(p, a.id)).toBe(true);
    ms.merge(p, a.id);
    expect(ms.nodes(p).map((n) => n.id)).toEqual([a.id]);
    expect(ms.open(p, a.id).doc).toEqual(doc('A', 'B'));
    expect(lib.novels.row(p, 'timelineEvents', 'e')?.['chapterIds']).toEqual([a.id]);
    expect(ms.canMerge(p, a.id)).toBe(false);
  });

  it('deletes a chapter with everything in it, and Undo brings it all back', () => {
    const { lib, ms, p } = setup();
    const c = ms.create(p, 'chapter');
    const s = ms.create(p, 'scene', c.id);
    ms.save(p, s.id, doc('Kept'), { baseRev: 0 });
    const point = ms.delete(p, c.id, c.title);
    expect(ms.nodes(p)).toHaveLength(0);
    expect(lib.novels.countIn(p, 'chapterContents')).toBe(0);
    ms.undoDelete(point);
    expect(ms.nodes(p)).toHaveLength(2);
    expect(ms.open(p, s.id).doc).toEqual(doc('Kept'));
  });
});

describe('saving text', () => {
  it('stores the text exactly, with counts, links and a new revision', () => {
    const { lib, ms, p } = setup();
    const c = ms.create(p, 'chapter');
    const d: JsonMap = { type: 'doc', content: [para('Wren', [{ type: 'entityLink', attrs: { entryId: 'w' } }]), para('walked on.')] };
    expect(ms.save(p, c.id, d, { baseRev: 0 })).toBe(1);
    expect(ms.open(p, c.id)).toEqual({ doc: d, rev: 1, recovered: null });
    expect(storyNode(lib.novels.row(p, 'chapters', c.id)!)).toMatchObject({ wordCount: 3 });
    expect(lib.novels.row(p, 'chapters', c.id)?.['mentions']).toEqual(['w']);
  });

  it('refuses a save based on older text, unless the writer keeps theirs', () => {
    const { ms, p } = setup();
    const c = ms.create(p, 'chapter');
    ms.save(p, c.id, doc('First'), { baseRev: 0 });
    expect(() => ms.save(p, c.id, doc('Stale'), { baseRev: 0 })).toThrow(SaveConflict);
    expect(ms.open(p, c.id).doc).toEqual(doc('First'));
    expect(ms.save(p, c.id, doc('Mine'), { baseRev: 0, force: true })).toBe(2);
    expect(ms.revisions(p, c.id)[0]).toMatchObject({ reason: 'conflict', doc: doc('First') });
  });

  it('keeps an automatic history copy at most every five minutes, and at most fifty', () => {
    const { ms, p, clock } = setup();
    const c = ms.create(p, 'chapter');
    let rev = ms.save(p, c.id, doc('v1'), { baseRev: 0 });
    rev = ms.save(p, c.id, doc('v2'), { baseRev: rev });
    rev = ms.save(p, c.id, doc('v3'), { baseRev: rev });
    expect(ms.revisions(p, c.id)).toHaveLength(1); // v1, kept when v2 replaced it
    clock.advance(revisionIntervalMs);
    rev = ms.save(p, c.id, doc('v4'), { baseRev: rev });
    expect(ms.revisions(p, c.id).map((r) => r['doc'])).toEqual([doc('v3'), doc('v1')]);
    for (let i = 0; i < 60; i++) {
      clock.advance(revisionIntervalMs);
      rev = ms.save(p, c.id, doc(`more ${i}`), { baseRev: rev });
    }
    expect(ms.revisions(p, c.id)).toHaveLength(maxRevisions);
  });

  it('logs the writing in sessions: a new one after half an hour', () => {
    const { lib, ms, p, clock } = setup();
    const c = ms.create(p, 'chapter');
    let rev = ms.save(p, c.id, doc('one two three'), { baseRev: 0 });
    rev = ms.save(p, c.id, doc('one two'), { baseRev: rev });
    clock.advance(31 * 60 * 1000);
    ms.save(p, c.id, doc('one two three four five'), { baseRev: rev });
    const sessions = lib.novels.rowsIn(p, 'writingSessions');
    expect(sessions.map((s) => [s['added'], s['removed'], s['netWords']])).toEqual([
      [3, 1, 2],
      [3, 0, 3],
    ]);
  });

  it('counts the words written today and since Monday, net of cuts', () => {
    const { ms, p, clock } = setup();
    const c = ms.create(p, 'chapter');
    let rev = ms.save(p, c.id, doc('one two three four'), { baseRev: 0 });
    expect(ms.wordsWritten(p)).toEqual({ today: 4, week: 4 });
    // The clock starts on Tuesday 14 November 2023; Wednesday is still this week, the next Monday is not.
    clock.advance(24 * 60 * 60 * 1000);
    rev = ms.save(p, c.id, doc('one two'), { baseRev: rev });
    expect(ms.wordsWritten(p)).toEqual({ today: -2, week: 2 });
    clock.advance(5 * 24 * 60 * 60 * 1000);
    ms.save(p, c.id, doc('one two three'), { baseRev: rev });
    expect(ms.wordsWritten(p)).toEqual({ today: 1, week: 1 });
  });

  it('keeps one daily and one weekly goal, and removes one set to nothing', () => {
    const { lib, ms, p } = setup();
    expect(ms.wordGoals(p)).toEqual({ daily: null, weekly: null });
    ms.setWordGoal(p, 'daily', 500);
    ms.setWordGoal(p, 'weekly', 2000);
    ms.setWordGoal(p, 'daily', 250);
    expect(ms.wordGoals(p)).toEqual({ daily: 250, weekly: 2000 });
    expect(lib.novels.rowsIn(p, 'goals')).toHaveLength(2);
    ms.setWordGoal(p, 'weekly', null);
    expect(ms.wordGoals(p)).toEqual({ daily: 250, weekly: null });
    expect(lib.novels.rowsIn(p, 'goals')[0]).toMatchObject({ kind: 'daily', targetWords: 250, done: false, dueDate: null });
  });

  it('offers back a crash copy typed on the saved text, and keeps an older one in history', () => {
    const { ms, p } = setup();
    const c = ms.create(p, 'chapter');
    const rev = ms.save(p, c.id, doc('Saved'), { baseRev: 0 });
    ms.saveDraft(p, c.id, doc('Saved and more'), rev);
    expect(ms.open(p, c.id).recovered?.doc).toEqual(doc('Saved and more'));
    // A crash copy on top of a revision that moved on: kept in history, not offered.
    ms.save(p, c.id, doc('Saved again'), { baseRev: rev });
    ms.saveDraft(p, c.id, doc('Old typing'), rev);
    expect(ms.open(p, c.id).recovered).toBeNull();
    expect(ms.revisions(p, c.id).some((r) => r['reason'] === 'recovery')).toBe(true);
  });

  it('restores an earlier version, keeping the text it replaces', () => {
    const { ms, p, clock } = setup();
    const c = ms.create(p, 'chapter');
    let rev = ms.save(p, c.id, doc('old'), { baseRev: 0 });
    clock.advance(revisionIntervalMs);
    rev = ms.save(p, c.id, doc('new'), { baseRev: rev });
    const oldVersion = ms.revisions(p, c.id).find((r) => JSON.stringify(r['doc']) === JSON.stringify(doc('old')))!;
    ms.restoreRevision(p, c.id, String(oldVersion['id']), rev);
    expect(ms.open(p, c.id).doc).toEqual(doc('old'));
    expect(ms.revisions(p, c.id)[0]).toMatchObject({ reason: 'restore', doc: doc('new') });
  });
});

describe('alternate drafts', () => {
  it('sets the text aside as a draft, starts a copy or a blank page, and swaps back without losing either', () => {
    const { ms, p } = setup();
    const c = ms.create(p, 'chapter');
    ms.save(p, c.id, doc('First version'), { baseRev: 0 });
    expect(ms.activeDraft(p, c.id)).toBe('Main draft');
    ms.createDraft(p, c.id, 'Second try');
    expect(ms.activeDraft(p, c.id)).toBe('Second try');
    expect(ms.open(p, c.id).doc).toEqual(doc('First version'));
    expect(ms.alternateDrafts(p, c.id).map((d) => d['name'])).toEqual(['Main draft']);

    ms.createDraft(p, c.id, 'Blank', true);
    expect(ms.open(p, c.id).doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    const main = ms.alternateDrafts(p, c.id).find((d) => d['name'] === 'Main draft')!;
    ms.switchDraft(p, c.id, String(main['id']));
    expect(ms.activeDraft(p, c.id)).toBe('Main draft');
    expect(ms.open(p, c.id).doc).toEqual(doc('First version'));
    expect(ms.alternateDrafts(p, c.id).map((d) => d['name']).sort()).toEqual(['Blank', 'Second try']);
  });

  it('refuses a name already taken (any case) or empty, renames, and deletes an alternate for good', () => {
    const { ms, p } = setup();
    const c = ms.create(p, 'chapter');
    ms.createDraft(p, c.id, 'Two');
    expect(() => ms.createDraft(p, c.id, 'main DRAFT')).toThrow('already has a draft called');
    expect(() => ms.createDraft(p, c.id, '  ')).toThrow('Give the draft a name.');
    ms.renameDraft(p, c.id, null, 'Two-B');
    expect(ms.activeDraft(p, c.id)).toBe('Two-B');
    const alt = ms.alternateDrafts(p, c.id)[0];
    ms.renameDraft(p, c.id, String(alt['id']), 'Original');
    expect(ms.alternateDrafts(p, c.id)[0]['name']).toBe('Original');
    ms.deleteDraft(p, String(alt['id']));
    expect(ms.alternateDrafts(p, c.id)).toEqual([]);
  });
});
