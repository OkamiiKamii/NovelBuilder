import { openLibrary } from '../src/data/library';
import { addSampleNovelOnFirstStart } from '../src/data/sampleNovel';
import { recentActivity } from '../src/domain/activity';
import { setIdGenerator } from '../src/domain/ids';
import { inCollection, matchesSearch, passesFilter, progressOf, readingTime, sortNovels } from '../src/domain/libraryView';
import { Novel, normalizeNovelDetails } from '../src/domain/novel';
import { foreignReferences } from '../src/domain/snapshot/copy';
import { levelForXp, rankForLevel, writerRank, xpForLevel } from '../src/domain/writerRank';
import { sampleJson, testIds } from './fixtures';
import { memoryLibrary } from './nodeSql';

setIdGenerator(testIds());

describe('novel details', () => {
  it('are cleaned as the Flutter app cleans them', () => {
    const d = normalizeNovelDetails({
      title: '  ',
      primaryGenre: ' Fantasy ',
      secondaryGenres: ['fantasy', 'Mystery', 'Mystery', ' '],
      tags: ['a', 'a', 'b'],
      status: 'nonsense',
      targetWordCount: '80000.4',
      deadline: '2027-3-1',
      cover: 'javascript:alert(1)',
      accent: 'red',
    });
    expect(d).toMatchObject({
      title: 'Untitled novel',
      primaryGenre: 'Fantasy',
      secondaryGenres: ['Mystery'],
      tags: ['a', 'b'],
      status: 'planning',
      targetWordCount: 80000,
      deadline: null,
      cover: null,
      language: 'en',
      accent: '#b4532a',
    });
    expect(normalizeNovelDetails({ cover: 'data:image/jpeg;base64,AAAA', deadline: '2027-03-01' })).toMatchObject({
      cover: 'data:image/jpeg;base64,AAAA',
      deadline: '2027-03-01',
    });
  });
});

describe('the writer rank', () => {
  it('needs 50 × (level − 1)² XP for a level', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(10)).toBe(4050);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(4050)).toBe(10);
  });

  it('names the rank by level, F to SSS', () => {
    expect([1, 9, 10, 29, 30, 45, 60, 80, 100, 119, 120, 125].map(rankForLevel)).toEqual([
      'F', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SS', 'SSS', 'SSS',
    ]);
  });

  it('counts words written, days written and chapters finished, never words deleted', () => {
    const r = writerRank(
      [
        { added: 500, day: '2026-11-15' },
        { added: 300, day: '2026-11-15' },
        { added: 0, day: '2026-11-16' },
        { added: -40, day: '2026-11-16' },
        { added: 200, day: '2026-11-16' },
      ],
      2,
    );
    expect(r.wordsWritten).toBe(1000);
    expect(r.daysWritten).toBe(2);
    expect(r.xp).toBe(1000 + 2 * 100 + 2 * 250);
    expect(r.level).toBe(levelForXp(1700));
    expect(r.progress).toBeGreaterThanOrEqual(0);
    expect(r.progress).toBeLessThan(1);
    expect(r.xpToNext).toBe(xpForLevel(r.level + 1) - 1700);
  });

  it('starts at level 1, rank F', () => {
    expect(writerRank([], 0)).toMatchObject({ xp: 0, level: 1, rank: 'F' });
  });

  it('never counts the sample novel, which the writer did not write', () => {
    const lib = openLibrary(memoryLibrary(), Date.now, testIds());
    const sample = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    expect(lib.novels.finishedChapters()).toBe(0);
    // A novel of the writer's own with a finished chapter counts.
    const { novel, chapterId } = lib.library.create({ title: 'Mine' }, { firstChapter: true });
    const row = lib.novels.row(novel.id, 'chapters', chapterId!)!;
    lib.novels.writeRows(novel.id, [{ collection: 'chapters', id: chapterId!, value: { ...row, status: 'final' } }]);
    lib.novels.writeRows(novel.id, [
      { collection: 'writingSessions', id: 's1', value: { id: 's1', day: '2026-11-16', added: 120 } },
    ]);
    lib.novels.writeRows(sample, [
      { collection: 'writingSessions', id: 's2', value: { id: 's2', day: '2026-11-16', added: 9000 } },
    ]);
    expect(lib.novels.finishedChapters()).toBe(1);
    expect(lib.novels.writingLog()).toEqual([{ added: 120, day: '2026-11-16' }]);
  });
});

describe('library views', () => {
  const n = (fields: Record<string, unknown>) => new Novel({ id: String(fields['id'] ?? 'x'), title: 'T', ...fields });

  it('filter by status, archived ones only under Archived', () => {
    const draft = n({ status: 'drafting' });
    const idea = n({ status: 'planning' });
    const done = n({ status: 'complete' });
    const held = n({ status: 'on-hold' });
    const gone = n({ status: 'drafting', archived: true });
    const all = [draft, idea, done, held, gone];
    expect(all.filter((x) => passesFilter(x, 'all'))).toHaveLength(4);
    expect(all.filter((x) => passesFilter(x, 'ongoing'))).toEqual([draft, idea]);
    expect(all.filter((x) => passesFilter(x, 'completed'))).toEqual([done]);
    expect(all.filter((x) => passesFilter(x, 'on-hold'))).toEqual([held]);
    expect(all.filter((x) => passesFilter(x, 'archived'))).toEqual([gone]);
  });

  it('search every word, ignoring case and accents', () => {
    const book = n({ title: 'The Élan of Vell', primaryGenre: 'Fantasy', synopsis: 'A drowned road.' });
    expect(matchesSearch(book, 'elan road')).toBe(true);
    expect(matchesSearch(book, 'elan sky')).toBe(false);
    expect(matchesSearch(book, '  ')).toBe(true);
  });

  it('sort with favorites first', () => {
    const a = n({ id: 'a', title: 'Alpha', updatedAt: 1 });
    const b = n({ id: 'b', title: 'Beta', updatedAt: 3 });
    const c = n({ id: 'c', title: 'Gamma', updatedAt: 2, pinned: true });
    expect(sortNovels([a, b, c], 'edited', () => 0).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(sortNovels([b, c, a], 'title', () => 0).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(sortNovels([a, b], 'words', (id) => (id === 'a' ? 10 : 5)).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('put novels in the automatic and custom collections', () => {
    const fav = n({ id: 'f', pinned: true, status: 'drafting' });
    const idea = n({ id: 'i', status: 'planning' });
    const custom = [{ id: 'c1', name: 'Space', novelIds: ['i'] }];
    expect(inCollection(fav, { kind: 'favorites' }, custom)).toBe(true);
    expect(inCollection(idea, { kind: 'drafts' }, custom)).toBe(true);
    expect(inCollection(idea, { kind: 'custom', id: 'c1' }, custom)).toBe(true);
    expect(inCollection(fav, { kind: 'custom', id: 'c1' }, custom)).toBe(false);
  });

  it('measure progress against the target, and reading time at 250 words a minute', () => {
    expect(progressOf(n({ targetWordCount: 1000 }), 250)).toBe(0.25);
    expect(progressOf(n({}), 250)).toBeNull();
    expect(progressOf(n({ status: 'complete' }), 0)).toBe(1);
    expect(readingTime(250 * 45)).toBe('45m');
    expect(readingTime(250 * (245 * 60 + 30))).toBe('245h 30m');
  });
});

describe('recent activity', () => {
  it('names what changed, newest first, once per thing', () => {
    const rows = [
      { projectId: 'p', collection: 'loreEntries', json: { category: 'character', name: 'Kael' }, updatedAt: 3 },
      { projectId: 'p', collection: 'loreEntries', json: { category: 'location', name: 'Vell' }, updatedAt: 5 },
      { projectId: 'p', collection: 'chapterContents', json: {}, updatedAt: 4 },
      { projectId: 'p', collection: 'chapterContents', json: {}, updatedAt: 2 },
      { projectId: 'p', collection: 'storyCalendars', json: {}, updatedAt: 6 },
    ];
    expect(recentActivity(rows).map((a) => a.what)).toEqual([
      'Updated world entry: Vell',
      'Wrote in a chapter',
      'Updated character: Kael',
    ]);
  });
});

describe('managing novels', () => {
  const fresh = () => {
    let t = 1000;
    return openLibrary(memoryLibrary(), () => ++t, testIds());
  };

  it('creates a novel, with chapter one when asked', () => {
    const lib = fresh();
    const { novel, chapterId } = lib.library.create({ title: ' My Book ', author: 'Me' }, { firstChapter: true });
    expect(novel.title).toBe('My Book');
    expect(novel.status).toBe('planning');
    const chapter = lib.novels.row(novel.id, 'chapters', chapterId!);
    expect(chapter).toMatchObject({ kind: 'chapter', title: 'Chapter 1', order: 0, status: 'idea', parentId: null });
  });

  it('starts organised like another novel, with none of its story', () => {
    const lib = fresh();
    const source = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    const sourceSnap = lib.novels.load(source)!;
    const { novel } = lib.library.create({ title: 'New' }, { setupFrom: source });
    const made = lib.novels.load(novel.id)!;
    expect(made.rows('chapters')).toHaveLength(0);
    expect(made.rows('loreEntries')).toHaveLength(0);
    expect(made.rows('loreSchemas').length).toBe(sourceSnap.rows('loreSchemas').length);
    expect(foreignReferences(sourceSnap, made)).toEqual([]);
    expect(made.project['title']).toBe('New');
  });

  it('starts writing an idea: Drafting, and its first chapter (made when there is none)', () => {
    const lib = fresh();
    const { novel } = lib.library.create({ title: 'Idea' });
    const { chapterId, previousStatus } = lib.library.startWriting(novel.id);
    expect(previousStatus).toBe('planning');
    expect(lib.library.novel(novel.id)?.status).toBe('drafting');
    expect(lib.novels.row(novel.id, 'chapters', chapterId)?.['title']).toBe('Chapter 1');
    // Again: the same chapter, not a second one.
    expect(lib.library.startWriting(novel.id).chapterId).toBe(chapterId);
    expect(lib.novels.countIn(novel.id, 'chapters')).toBe(1);
  });

  it('archives (unpinning), pins, marks opened, and keeps fields it does not know', () => {
    const lib = fresh();
    const { novel } = lib.library.create({ title: 'B' });
    lib.novels.putNovelDetails({ ...lib.novels.novel(novel.id)!.raw, fromTheFuture: 1 });
    lib.library.setPinned(novel.id, true);
    lib.library.setArchived(novel.id, true);
    lib.library.markOpened(novel.id);
    lib.library.updateDetails(novel.id, { title: 'B2' });
    const after = lib.library.novel(novel.id)!;
    expect(after).toMatchObject({ archived: true, pinned: false, title: 'B2' });
    expect(after.lastOpenedAt).not.toBeNull();
    expect(after.raw['fromTheFuture']).toBe(1);
  });

  it('duplicates a novel into a separate copy with a unique title', () => {
    const lib = fresh();
    const id = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    const copy = lib.library.duplicate(id);
    expect(copy.title).toBe('The Drowned Road (Copy)');
    expect(lib.library.duplicate(id).title).toBe('The Drowned Road (Copy) 2');
    expect(foreignReferences(lib.novels.load(id)!, lib.novels.load(copy.id)!)).toEqual([]);
  });

  it('deletes with a restore point, and Undo brings it back whole', () => {
    const lib = fresh();
    const id = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    const before = lib.novels.load(id)!.toJson(0);
    const point = lib.library.delete(id);
    expect(lib.library.novel(id)).toBeNull();
    lib.library.undoDelete(point);
    expect(lib.novels.load(id)!.toJson(0)).toEqual(before);
  });

  it('imports a backup as a copy beside the original', () => {
    const lib = fresh();
    const id = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    const preview = lib.backups.previewImport(lib.backups.exportBackup(id));
    expect(preview.existing?.id).toBe(id);
    const copy = lib.library.importAsCopy(preview);
    expect(copy.id).not.toBe(id);
    expect(copy.title).toBe('The Drowned Road 2');
    expect(lib.library.novels()).toHaveLength(2);
  });
});

describe('custom collections', () => {
  it('are made, filled, renamed and removed, and forget deleted novels', () => {
    const lib = openLibrary(memoryLibrary(), Date.now, testIds());
    const c = lib.collections.create(' Space ');
    expect(c.name).toBe('Space');
    lib.collections.setMember(c.id, 'n1', true);
    lib.collections.setMember(c.id, 'n2', true);
    lib.collections.setMember(c.id, 'n1', false);
    lib.collections.rename(c.id, 'Stars');
    expect(lib.collections.list()).toEqual([{ id: c.id, name: 'Stars', novelIds: ['n2'] }]);
    lib.collections.prune(new Set(['other']));
    expect(lib.collections.list()[0].novelIds).toEqual([]);
    expect(() => lib.collections.create('  ')).toThrow('needs a name');
    lib.collections.remove(c.id);
    expect(lib.collections.list()).toEqual([]);
  });
});
