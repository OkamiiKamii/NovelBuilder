import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { bigNovel } from '../../../e2e/bigNovel.mjs';
import { codex, db, extensions, projects, registry } from '@/core';
import { BUILTIN_MODULES } from '@/modules/extensions/builtin';
import { NovelDB } from '@/core/db';
import { loadModel } from '@/modules/model/model';
import { rankName } from '@/modules/systems/types';

/**
 * DATA OWNERSHIP
 * Everything a novel holds is stored in tables the project registry knows, so
 * that backup files, restores, copies and deletion reach all of it. Upgrades
 * of the database keep every record, and one that fails leaves the stored
 * novel as it was. These tests use the app's own wiring (`@/core`), so a table
 * added later and not registered fails the first of them.
 */

/** Tables that are not one novel's: the novels themselves, their totals, and what belongs to the author across novels. */
const APP_WIDE = ['projects', 'projectStats', 'templates', 'timelines', 'customModules'];

/** A table's schema as Dexie writes it, to create a database as an earlier version of the app did. */
const schemaOf = (database: Dexie, leaveOut: string[] = []) =>
  Object.fromEntries(database.tables.filter((t) => !leaveOut.includes(t.name)).map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')]));

const byId = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));

/** Every row a project owns, table by table, in order of id. */
const rowsOf = async (database: Dexie, projectId: string) =>
  Object.fromEntries(
    (await Promise.all(database.tables.filter((t) => t.schema.indexes.some((i) => i.name === 'projectId')).map(async (t) => [t.name, byId(await t.where('projectId').equals(projectId).toArray())] as const))).filter(([, rows]) => rows.length),
  );

let n = 0;

describe('where a novel is kept', () => {
  it('every table holding a novel’s records is known to the registry, so backups, copies and deletion reach it', () => {
    const owned = db.tables.filter((t) => t.schema.indexes.some((i) => i.name === 'projectId')).map((t) => t.name);
    const registered = registry.collections.map((c) => c.table);
    expect([...registered].sort()).toEqual([...owned].sort());
    expect(db.tables.map((t) => t.name).filter((t) => !owned.includes(t)).sort()).toEqual([...APP_WIDE].sort());
  });
});

// These write and read a novel of about 10,000 records several times: given a minute, as the speed test is.
describe('upgrading a database written by an earlier version', () => {
  // The large benchmark novel, as stored: 3 acts, 120 chapters, 480 scenes, 2,000 events, 1,550 entries, 4,000 connections…
  const novel = bigNovel('p', 1_700_000_000_000, 1) as Record<string, Record<string, unknown>[]>;
  const project = { id: 'p', title: 'Large Novel', subtitle: '', author: '', primaryGenre: 'Fantasy', secondaryGenres: [], cover: null, tags: [], synopsis: '', status: 'drafting', targetWordCount: null, deadline: null, language: 'en', accent: '#b4532a', pinned: false, archived: false, createdAt: 1, updatedAt: 1, lastOpenedAt: null };

  // Version 33 is the one before this; version 25 is before the last upgrade that rewrites records (blueprint ranks, version 26).
  for (const [version, missing] of [
    [33, ['journeys', 'travelSettings']],
    [25, ['journeys', 'travelSettings', 'placeSettings', 'worldMaps', 'mapPins', 'progressCategories', 'progressChanges', 'structureMarkers', 'relationSettings', 'alternateHistories', 'storyCalendars', 'savedViews']],
  ] as const) {
    it(`opens a novel stored by schema version ${version}, keeping every record as it was`, async () => {
      const name = `ownership-upgrade-${++n}`;
      const old = new Dexie(name);
      old.version(version).stores(schemaOf(new NovelDB('schema-reference'), [...missing]));
      const written: Record<string, Record<string, unknown>[]> = Object.fromEntries(Object.entries(novel).filter(([table, rows]) => rows.length && !missing.includes(table as never)));
      // A blueprint as version 25 stored it, ranks by name; version 33 already has ids.
      written.systems = [version < 26 ? { id: 'sys', projectId: 'p', name: 'Ranks', ranks: ['Novice', 'Adept'], items: [{ id: 'i', groupId: 'g', name: 'Spark', rank: 'Adept' }], groups: [{ id: 'g', name: 'Skills' }], matrices: [] } : { id: 'sys', projectId: 'p', name: 'Ranks', ranks: [{ id: 'r1', name: 'Novice' }, { id: 'r2', name: 'Adept' }], items: [{ id: 'i', groupId: 'g', name: 'Spark', rankId: 'r2' }], groups: [{ id: 'g', name: 'Skills' }], matrices: [] }];
      await old.table('projects').add(project);
      for (const [table, rows] of Object.entries(written)) await old.table(table).bulkAdd(rows);
      old.close();

      const upgraded = new NovelDB(name);
      await upgraded.open();
      expect(upgraded.verno).toBe(34);
      const stored = await rowsOf(upgraded, 'p');
      const { systems: blueprints, ...rest } = stored;
      const { systems: _written, ...expected } = written;
      expect(rest).toEqual(Object.fromEntries(Object.entries(expected).map(([table, rows]) => [table, byId(rows)])));
      expect(rankName(blueprints[0] as never, (blueprints[0] as { items: never[] }).items[0])).toBe('Adept');
      // …and the app reads it.
      const model = (await loadModel(upgraded, 'p'))!;
      expect([model.events.size, model.entries.size, model.links.length, model.nodes.size]).toEqual([2000, 1550, 4000, 603]);
      upgraded.close();
    }, 60_000);
  }

  it('an upgrade that fails part-way leaves the stored novel exactly as it was, and the app opens it again', async () => {
    const name = `ownership-failed-upgrade-${++n}`;
    const first = new NovelDB(name);
    await first.projects.add(project as never);
    for (const [table, rows] of Object.entries(novel)) if (rows.length) await first.table(table).bulkAdd(rows);
    const before = await rowsOf(first, 'p');
    first.close();

    // A later version whose upgrade rewrites every event's name and then fails.
    class Failing extends NovelDB {
      constructor(dbName: string) {
        super(dbName);
        this.version(35)
          .stores({ futureTable: 'id, projectId' })
          .upgrade(async (tx) => {
            await tx.table('timelineEvents').toCollection().modify((event) => {
              event.name = 'Rewritten';
            });
            throw new Error('the upgrade failed');
          });
      }
    }
    const failing = new Failing(name);
    await expect(failing.open()).rejects.toThrow();
    failing.close();

    const again = new NovelDB(name);
    await again.open();
    expect(again.verno).toBe(34);
    expect(await rowsOf(again, 'p')).toEqual(before);
    expect(again.tables.map((t) => t.name)).not.toContain('futureTable');
    again.close();
  }, 60_000);
});

describe('a backup file that cannot be restored', () => {
  const file = async () => {
    const p = await projects.create({ title: `Restore ${++n}` });
    const rows = bigNovel(p.id, 1, 0.05) as Record<string, Record<string, unknown>[]>;
    for (const [table, list] of Object.entries(rows)) if (list.length) await db.table(table).bulkAdd(list);
    return JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true })));
  };
  const everything = async () => Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.count()])));

  it('is refused before anything is written when two records share an id, or a record has none, and says so', async () => {
    const good = await file();
    const before = await everything();
    const twice = structuredClone(good);
    twice.collections.loreEntries.push({ ...twice.collections.loreEntries[0], name: 'Another' });
    await expect(projects.importSnapshot(twice)).rejects.toThrow(/two records in loreEntries share the id .+\. Nothing was imported/);
    const nameless = structuredClone(good);
    nameless.collections.timelineEvents.push({ projectId: 'x', name: 'No id' }, null);
    await expect(projects.importSnapshot(nameless)).rejects.toThrow('2 records in timelineEvents cannot be read (no id, or not a record). Nothing was imported');
    expect(await everything()).toEqual(before);
  });

  it('writes nothing at all when it fails part-way through, whatever the reason', async () => {
    const good = await file();
    const before = await everything();
    // A record the restore cannot rewrite, far down the file: the tables before it have been written by then.
    const broken = structuredClone(good);
    broken.collections.brainstorms = [{ id: 'b', projectId: 'x', items: [{ added: { to: 42 } }] }];
    await expect(projects.importSnapshot(broken)).rejects.toThrow('The project could not be restored, and nothing was imported');
    expect(await everything()).toEqual(before);
  });
});

/**
 * A novel made through the app's own pages: the backup files of the novels an end-to-end run made, joined into one
 * by `scripts/project-fixture.mjs`. Between them they hold every field of the 42 kinds of record the run makes,
 * with the shapes the pages really write, and every record any of them points at.
 */
const madeInTheApp = () => JSON.parse(readFileSync(new URL('./fixtures/made-in-the-app.novel.json', import.meta.url), 'utf8'));

/** Where a stored value still holds the id of one of the original's records, or of the original itself: whole, or as part of an address or a key. */
function stillPointingAt(rows: Record<string, unknown[]>, ids: Set<string>): string[] {
  const found: string[] = [];
  const hit = (s: string) => s.split(/[:|/?=&~,\s]/).some((part) => ids.has(part));
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      if (hit(value)) found.push(`${path} = ${value}`);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) {
        if (hit(k)) found.push(`${path} key ${k}`);
        walk(v, `${path}.${k}`);
      }
  };
  for (const [table, list] of Object.entries(rows)) list.forEach((row, i) => walk(row, `${table}[${i}]`));
  return found;
}
const idsIn = (projectId: string, rows: Record<string, unknown[]>) => new Set([projectId, ...Object.values(rows).flat().map((r) => (r as { id: string }).id)]);

/** Puts a numbered field this version does not know on the project, on every record, and on every object inside a record, as a later version might. */
function markEverything(file: { project: Record<string, unknown>; collections: Record<string, unknown[]> }) {
  const where = new Map<number, string>();
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) walk(v, `${path}.${key}`);
      const mark = where.size + 1;
      where.set(mark, path);
      (value as Record<string, unknown>).fromLater = { mark };
    }
  };
  walk(file.project, 'project');
  for (const [table, rows] of Object.entries(file.collections)) rows.forEach((row, i) => walk(row, `${table}[${i}]`));
  return where;
}

/** The marks found anywhere in some stored values. */
function marksIn(values: unknown[]): Set<number> {
  const found = new Set<number>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const mark = (value as { fromLater?: { mark?: unknown } }).fromLater?.mark;
      if (typeof mark === 'number') found.add(mark);
      Object.values(value).forEach(walk);
    }
  };
  values.forEach(walk);
  return found;
}

describe('a novel made in the app, through every way it is kept', () => {
  it('a backup file restored keeps every record and every field, known or not, at every depth', async () => {
    const file = madeInTheApp();
    const where = markEverything(file);
    const restored = await projects.importSnapshot(JSON.parse(JSON.stringify(file)));
    const stored = await rowsOf(db, restored.id);
    const found = marksIn([await db.projects.get(restored.id), ...Object.values(stored).flat()]);
    const lost = [...where].filter(([mark]) => !found.has(mark)).map(([, path]) => path);
    expect(lost).toEqual([]);
    expect(Object.fromEntries(Object.entries(stored).map(([t, rows]) => [t, rows.length]))).toEqual(Object.fromEntries(Object.entries(file.collections as Record<string, unknown[]>).filter(([, rows]) => rows.length).map(([t, rows]) => [t, rows.length])));
    // Every reference was rewritten: nothing in the restored novel names a record of the file, or the novel it came from.
    expect(stillPointingAt(stored, idsIn(file.project.id, file.collections))).toEqual([]);
  });
});

describe('a novel made in the app, used as the author uses it', () => {
  const tables = (rows: Record<string, Record<string, unknown>[]>, leaveOut: string[]) => Object.fromEntries(Object.entries(rows).filter(([t]) => !leaveOut.includes(t)));

  it('a copy keeps every field, known or not, at every depth, of everything a copy takes', async () => {
    const file = madeInTheApp();
    // A copy leaves out the version history and the team, as it always has: those go only into backup files.
    const kept = registry.collections.filter((c) => !c.transient && !c.optional).map((c) => c.table);
    for (const table of Object.keys(file.collections)) if (!kept.includes(table)) file.collections[table] = [];
    const where = markEverything(file);
    const original = await projects.importSnapshot(JSON.parse(JSON.stringify(file)));
    const copy = await projects.duplicate(original.id);
    const found = marksIn([await db.projects.get(copy.id), ...Object.values(await rowsOf(db, copy.id)).flat()]);
    // The project row of a copy is the author's new one: only its fields are compared, under the copy's own title.
    const lost = [...where].filter(([mark, path]) => !found.has(mark) && path !== 'project').map(([, path]) => path);
    expect(lost).toEqual([]);
    expect(stillPointingAt(await rowsOf(db, copy.id), idsIn(original.id, await rowsOf(db, original.id)))).toEqual([]);
  });

  it('turning every built-in module on and off again changes no record of the novel; only the module’s own categories are put away', async () => {
    const restored = await projects.importSnapshot(madeInTheApp());
    const before = await rowsOf(db, restored.id);
    const modules = extensions.forProject(restored.id);
    for (const module of BUILTIN_MODULES) {
      await modules.enable(module.id);
      await modules.disable(module.id);
    }
    const after = await rowsOf(db, restored.id);
    // Everything but the categories and the modules' own rows is exactly as it was.
    expect(tables(after, ['loreSchemas', 'projectModules'])).toEqual(tables(before, ['loreSchemas', 'projectModules']));
    // The categories the novel had are all there, with every field they had.
    const fields = (rows: Record<string, unknown>[] = []) => rows.flatMap((c) => ((c.fields as { id: string }[] | undefined) ?? []).map((f) => `${c.key}/${f.id}`));
    expect(fields(after.loreSchemas)).toEqual(expect.arrayContaining(fields(before.loreSchemas)));
    // Turned on again, a module brings back what it had put away.
    await modules.enable(BUILTIN_MODULES[0].id);
    expect(tables(await rowsOf(db, restored.id), ['loreSchemas', 'projectModules'])).toEqual(tables(before, ['loreSchemas', 'projectModules']));
  });

  it('archiving a field keeps every value entries hold for it, and restoring it brings it back as it was', async () => {
    const restored = await projects.importSnapshot(madeInTheApp());
    const lore = codex.forProject(restored.id);
    const before = await rowsOf(db, restored.id);
    // The field with the most values.
    const entries = before.loreEntries as { category: string; fields: { defId?: string; value: string }[] }[];
    const held = entries.flatMap((e) => e.fields.filter((f) => f.defId && f.value).map((f) => `${e.category}/${f.defId}`));
    const [category, defId] = [...new Set(held)].sort((a, b) => held.filter((h) => h === b).length - held.filter((h) => h === a).length)[0].split('/');
    const toggle = (archived: boolean) => lore.saveCategory(category, (current) => ({ fields: current.fields.map((d) => (d.id === defId ? { ...d, archived } : d)) }));
    await toggle(true);
    const archived = await rowsOf(db, restored.id);
    expect(archived.loreEntries).toEqual(before.loreEntries);
    await toggle(false);
    expect((await rowsOf(db, restored.id)).loreEntries).toEqual(before.loreEntries);
    expect((await lore.categories()).find((c) => c.key === category)!.fields.find((d) => d.id === defId)!.archived).toBeFalsy();
  });

  it('renaming a record changes that record only: everything else points at it by id', async () => {
    const restored = await projects.importSnapshot(madeInTheApp());
    const before = await rowsOf(db, restored.id);
    // The record most pointed at.
    const text = JSON.stringify(before);
    const [entry] = [...(before.loreEntries as { id: string; name: string }[])].sort((a, b) => text.split(b.id).length - text.split(a.id).length);
    await codex.forProject(restored.id).update(entry.id, { name: `${entry.name} the Renamed` });
    const after = await rowsOf(db, restored.id);
    // The team's record of who did what gains a line for the rename; nothing else changes.
    const others = (rows: Record<string, Record<string, unknown>[]>) => ({ ...rows, loreEntries: rows.loreEntries.filter((e) => e.id !== entry.id), activity: [] });
    expect(others(after)).toEqual(others(before));
    expect((after.activity ?? []).filter((line) => !(before.activity ?? []).some((b) => b.id === line.id)).map((line) => line.rowId)).toEqual(before.activity ? [entry.id] : []);
    expect(after.loreEntries.find((e) => e.id === entry.id)).toMatchObject({ name: `${entry.name} the Renamed` });
  });
});
