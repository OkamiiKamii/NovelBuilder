import { existsSync, statSync } from 'node:fs';

import { BackupService } from '../src/data/backupService';
import { AppDatabase, DatabaseOpenError, latestSchemaVersion, migrations } from '../src/data/database';
import { openLibrary } from '../src/data/library';
import { StaleWriteError, putRow } from '../src/data/novelStore';
import { addSampleNovelOnFirstStart, sampleNovelSetting } from '../src/data/sampleNovel';
import { setIdGenerator } from '../src/domain/ids';
import { type JsonMap, jsonEquals } from '../src/domain/json';
import { NovelSnapshot, SnapshotError } from '../src/domain/snapshot/novelSnapshot';
import { flutterFixtures, sampleJson, testIds } from './fixtures';
import { diskLibrary, memoryLibrary, nodeConnection } from './nodeSql';

setIdGenerator(testIds());

const novel = (id: string, title = 'A novel', collections: Record<string, JsonMap[]> = {}) =>
  new NovelSnapshot({ project: { id, title }, collections });

describe('opening the library', () => {
  it('creates the schema on first open', () => {
    const lib = openLibrary(memoryLibrary());
    expect(lib.db.schemaVersion).toBe(latestSchemaVersion);
  });

  it('keeps what was saved across closing and reopening, with WAL and full sync', () => {
    const file = diskLibrary();
    const a = openLibrary(file);
    expect(a.db.raw.all<{ journal_mode: string }>('PRAGMA journal_mode')[0].journal_mode).toBe('wal');
    expect(Number(a.db.raw.all<{ synchronous: number }>('PRAGMA synchronous')[0].synchronous)).toBe(2);
    a.novels.putNovel(novel('n1', 'Kept'));
    a.db.close();
    const b = openLibrary(file);
    expect(b.novels.novel('n1')?.title).toBe('Kept');
    b.db.close();
  });

  it('refuses a library saved by a newer version, and leaves it untouched', () => {
    const file = diskLibrary();
    const raw = nodeConnection(file.location!);
    raw.exec('CREATE TABLE future (x)');
    raw.exec('PRAGMA user_version = 99');
    raw.close();
    const before = statSync(file.location!).size;
    expect(() => AppDatabase.open(file)).toThrow(DatabaseOpenError);
    expect(() => AppDatabase.open(file)).toThrow('newer version of Scriptor');
    expect(statSync(file.location!).size).toBe(before);
  });

  it('keeps a copy of the file before upgrading it', () => {
    const file = diskLibrary();
    const v1 = AppDatabase.open(file, migrations.slice(0, 1));
    v1.raw.run("INSERT INTO settings (key, json) VALUES ('k', '1')");
    v1.close();
    const v2 = AppDatabase.open(file);
    expect(v2.schemaVersion).toBe(2);
    expect(existsSync(`${file.location}.before-v2`)).toBe(true);
    v2.close();
  });

  it('saves all of a transaction or none of it', () => {
    const lib = openLibrary(memoryLibrary());
    expect(() =>
      lib.db.transaction(() => {
        lib.settings.write('a', 1);
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(lib.settings.read('a')).toBeNull();
  });
});

describe('novels', () => {
  it.each(flutterFixtures().map((f) => [f.name, f.json] as const))(
    'stores and loads %s without changing a thing',
    (_, json) => {
      const lib = openLibrary(memoryLibrary());
      const s = NovelSnapshot.fromJson(json);
      lib.novels.putNovel(s);
      const back = lib.novels.load(s.projectId)!;
      expect(jsonEquals(back.toJson(0), s.toJson(0))).toBe(true);
    },
  );

  it('saves only what changed, and refuses to overwrite a newer save', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('n', 'T', { goals: [{ id: 'g1', n: 1 }, { id: 'g2', n: 2 }] }));
    const read = lib.novels.load('n')!;
    lib.novels.saveChanges(read, read.putRow('goals', { id: 'g1', n: 10 }).putRow('goals', { id: 'g3', n: 3 }));
    expect(lib.novels.rowsIn('n', 'goals').map((r) => r['n'])).toEqual([10, 2, 3]);
    // `read` is now out of date for g1: saving from it again is refused, and nothing is written.
    expect(() => lib.novels.saveChanges(read, read.putRow('goals', { id: 'g1', n: 99 }))).toThrow(StaleWriteError);
    expect(lib.novels.row('n', 'goals', 'g1')?.['n']).toBe(10);
  });

  it('writes several records all together, or none if one is out of date', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('n'));
    lib.novels.writeRows('n', [putRow('goals', { id: 'a', v: 1 })]);
    expect(() =>
      lib.novels.writeRows('n', [putRow('goals', { id: 'b', v: 2 }), putRow('goals', { id: 'a', v: 3 }, { id: 'a', v: 0 })]),
    ).toThrow(StaleWriteError);
    expect(lib.novels.row('n', 'goals', 'b')).toBeNull();
    expect(lib.novels.row('n', 'goals', 'a')?.['v']).toBe(1);
  });

  it('finds a chapter’s records by the index on nodeId', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(
      novel('n', 'T', {
        chapterRevisions: [
          { id: 'r1', nodeId: 'c1' },
          { id: 'r2', nodeId: 'c2' },
          { id: 'r3', nodeId: 'c1' },
        ],
      }),
    );
    expect(lib.novels.rowsForNode('n', 'chapterRevisions', 'c1').map((r) => r['id'])).toEqual(['r1', 'r3']);
  });

  it('counts what each novel holds without loading it', () => {
    const lib = openLibrary(memoryLibrary());
    const id = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    const stats = lib.novels.stats().get(id)!;
    expect(stats.chapters).toBe(15);
    expect(stats.words).toBeGreaterThan(9000);
    expect(stats.characters).toBeGreaterThan(0);
  });

  it('lists only one novel’s recent records', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('a'));
    lib.novels.putNovel(novel('b'));
    lib.novels.writeRows('a', [putRow('plotThreads', { id: 't1', title: 'Debt' })]);
    lib.novels.writeRows('b', [putRow('plotThreads', { id: 't2', title: 'Flood' })]);
    expect(lib.novels.recentRows('a', 10).map((r) => r.projectId)).toEqual(['a']);
    expect(lib.novels.recentRows('b', 10).map((r) => r.json['title'])).toEqual(['Flood']);
  });

  it('notifies listeners after every write', () => {
    const lib = openLibrary(memoryLibrary());
    const seen: number[] = [];
    lib.novels.subscribe(() => seen.push(lib.novels.revision));
    lib.novels.putNovel(novel('n'));
    lib.novels.writeRows('n', [putRow('goals', { id: 'a' })]);
    expect(seen).toEqual([1, 2]);
  });
});

describe('the sample novel', () => {
  it('is added on the first start only, with new ids, credited to Scriptor', () => {
    const lib = openLibrary(memoryLibrary());
    const id = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1);
    expect(id).not.toBeNull();
    expect(id).not.toBe((sampleJson() as { project: { id: string } }).project.id);
    expect(lib.novels.novel(id!)?.raw['author']).toBe('Scriptor');
    expect(lib.settings.read(sampleNovelSetting)).toBe('added');
    // Deleted, it stays deleted.
    lib.novels.deleteNovel(id!);
    expect(addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 2)).toBeNull();
    expect(lib.novels.listNovels()).toHaveLength(0);
  });

  it('is not added to a library that already has novels', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('mine'));
    expect(addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)).toBeNull();
    expect(lib.novels.listNovels().map((n) => n.id)).toEqual(['mine']);
  });
});

describe('drafts and restore points', () => {
  it('keeps crash-recovery drafts until discarded, and removes them with their novel', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('n'));
    lib.drafts.put('n', 'chapter:c1', { text: 'unsaved words' }, 3);
    expect(lib.drafts.get('n', 'chapter:c1')?.value).toEqual({ text: 'unsaved words' });
    expect(lib.drafts.leftIn('n')).toHaveLength(1);
    lib.drafts.discard('n', 'chapter:c1');
    expect(lib.drafts.leftIn('n')).toHaveLength(0);
    lib.drafts.put('n', 'chapter:c2', 'x');
    lib.novels.deleteNovel('n');
    expect(lib.drafts.leftIn('n')).toHaveLength(0);
  });

  it('deletes a novel after keeping a restore point, and brings it back from it', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('n', 'Precious', { goals: [{ id: 'g', n: 1 }] }));
    const point = lib.backups.deleteWithRestorePoint('n');
    expect(lib.novels.exists('n')).toBe(false);
    expect(lib.restorePoints.list('n')[0]).toMatchObject({ id: point, title: 'Precious', reason: 'Before deleting it' });
    lib.backups.restore(point);
    expect(lib.novels.novel('n')?.title).toBe('Precious');
    expect(lib.novels.rowsIn('n', 'goals')).toEqual([{ id: 'g', n: 1 }]);
  });

  it('keeps at most 20 restore points per novel, the newest', () => {
    let t = 0;
    const lib = openLibrary(memoryLibrary(), () => ++t);
    lib.novels.putNovel(novel('n'));
    for (let i = 0; i < 25; i++) lib.backups.keepRestorePoint('n', `point ${i}`);
    const points = lib.restorePoints.list('n');
    expect(points).toHaveLength(20);
    expect(points[0].reason).toBe('point 24');
  });
});

describe('backups', () => {
  it('exports a novel as a file the import reads back exactly', () => {
    const lib = openLibrary(memoryLibrary());
    const id = addSampleNovelOnFirstStart(lib.novels, lib.settings, sampleJson(), 1)!;
    const text = lib.backups.exportBackup(id);
    const other = openLibrary(memoryLibrary());
    const preview = other.backups.previewImport(text);
    expect(preview.existing).toBeNull();
    other.backups.importBackup(preview);
    expect(jsonEquals(other.novels.load(id)!.toJson(0), lib.novels.load(id)!.toJson(0))).toBe(true);
  });

  it('says what replacing a novel would change, and keeps a restore point before it does', () => {
    const lib = openLibrary(memoryLibrary());
    lib.novels.putNovel(novel('n', 'T', { goals: [{ id: 'a' }, { id: 'b' }] }));
    const file = JSON.stringify(novel('n', 'T', { goals: [{ id: 'a', x: 1 }, { id: 'c' }] }).toJson(0));
    const preview = lib.backups.previewImport(file);
    expect(preview.changes.get('goals')).toEqual({ added: 1, changed: 1, removed: 1, kept: 0 });
    const point = lib.backups.importBackup(preview);
    expect(point).not.toBeNull();
    expect(lib.novels.rowsIn('n', 'goals').map((r) => r['id'])).toEqual(['a', 'c']);
  });

  it('changes nothing when a file cannot be read', () => {
    const lib = openLibrary(memoryLibrary());
    expect(() => lib.backups.previewImport('not json')).toThrow(SnapshotError);
    expect(lib.novels.listNovels()).toHaveLength(0);
  });

  it('names backup files safely', () => {
    expect(BackupService.fileNameFor('The: Road/North?')).toBe('The RoadNorth.novel.json');
    expect(BackupService.fileNameFor('   ')).toBe('Untitled novel.novel.json');
  });
});

describe('settings', () => {
  it('reads what was written, and a damaged value as unset', () => {
    const lib = openLibrary(memoryLibrary());
    lib.settings.write('x', { a: [1] });
    expect(lib.settings.read('x')).toEqual({ a: [1] });
    lib.db.raw.run("INSERT INTO settings (key, json) VALUES ('bad', '{oops')");
    expect(lib.settings.read('bad')).toBeNull();
  });
});
