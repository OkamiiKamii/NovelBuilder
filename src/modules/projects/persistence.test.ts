import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { BUILTIN_MODULES } from '@/modules/extensions/builtin';
import { createExtensionService, registerExtensions } from '@/modules/extensions/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { eventRecord } from '@/modules/model/events';
import { loadModel } from '@/modules/model/model';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { rankName } from '@/modules/systems/types';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate } from '@/modules/timeline/types';
import { createProjectService, InvalidSnapshotError } from './service';
import { SNAPSHOT_VERSION } from './types';

const exact = (year: number): EventDate => ({ precision: 'exact', year, month: null, day: null, hour: null, minute: null });
let n = 0;

function open(name: string) {
  const db = new NovelDB(name);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerSystems(registry);
  registerExtensions(registry);
  const codex = createCodexService(db, projects.contentChanged);
  const systems = createSystemsService(db, projects.contentChanged);
  return {
    db, projects, codex, systems,
    ms: createManuscriptService(db, projects.contentChanged),
    timeline: createTimelineService(db, projects.contentChanged),
    plot: createPlotService(db, projects.contentChanged),
    connections: createConnectionService(db, projects.contentChanged),
    extensions: createExtensionService(db, codex, systems, projects.contentChanged),
  };
}

/** A project using every record refined for the visual views: a typed connection that holds for a while, a full event, a ranked blueprint. */
async function story(app = open(`persistence-${++n}`)) {
  const p = await app.projects.create({ title: 'Ashfall' });
  const one = await app.ms.forProject(p.id).create('chapter', null, 'One');
  const two = await app.ms.forProject(p.id).create('chapter', null, 'Two');
  const lore = app.codex.forProject(p.id);
  const mira = await lore.create('character', 'Mira');
  const wardens = await lore.create('faction', 'The Wardens');
  const thread = await app.plot.forProject(p.id).create('The heir');
  const siege = await app.timeline.forProject(p.id).create('The siege');
  await app.timeline.forProject(p.id).update(siege.id, { when: exact(10), end: exact(11), threadIds: [thread.id], nodeIds: [one.id, two.id], reveals: [{ nodeId: two.id, role: 'flashback' }], status: 'planned', canon: 'provisional', characters: [{ id: mira.id, age: 19 }] });
  await app.connections.forProject(p.id).create({ from: { type: 'entry', id: mira.id }, to: { type: 'entry', id: wardens.id }, type: 'member-of', notes: 'Sworn in.', validity: { from: { kind: 'event', eventId: siege.id }, until: { kind: 'node', nodeId: two.id } } });
  const system = await app.systems.forProject(p.id).create({ name: 'Ranks', description: '', variables: [], tracks: [], ranks: [{ id: 'r1', name: 'Novice' }, { id: 'r2', name: 'Adept' }], groups: [{ id: 'g', name: 'Skills', single: false }], items: [{ id: 'i', groupId: 'g', name: 'Spark', description: '', parentId: null, rankId: 'r2', requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' }], matrices: [] });
  return { ...app, p, one, two, mira, wardens, thread, siege, system };
}

/** What a project holds, by names rather than ids, so a copy with new ids can be compared with its source. */
async function summary(app: ReturnType<typeof open>, projectId: string) {
  const model = (await loadModel(app.db, projectId))!;
  const name = (id: string) => model.entries.get(id)?.name ?? model.nodes.get(id)?.title ?? model.events.get(id)?.name ?? model.threads.get(id)?.title ?? id;
  const anchor = (a: unknown) => (a && typeof a === 'object' && 'nodeId' in a ? `node ${name((a as { nodeId: string }).nodeId)}` : a && typeof a === 'object' && 'eventId' in a ? `event ${name((a as { eventId: string }).eventId)}` : a);
  const event = [...model.events.values()][0];
  const record = eventRecord(model, event.id)!;
  const [link] = model.links;
  const [system] = model.systems.values();
  return {
    event: { title: record.title, start: record.start, end: record.end, shape: record.shape, status: record.status, canon: record.canon, threads: record.threads.map((t) => name(t.id)), told: record.told.map((t) => [name(t.ref.id), t.role]), people: record.participants.map((p) => [name(p.ref.id), p.age]) },
    link: { from: name(link.fromId), to: name(link.toId), type: link.type, notes: link.notes, validity: { from: anchor(link.validity?.from), until: anchor(link.validity?.until) } },
    ability: { name: system.items[0].name, rank: rankName(system, system.items[0]), ranks: system.ranks.map((r) => r.name) },
  };
}

describe('save and reload', () => {
  it('keeps every new field when the app is closed and opened again', async () => {
    const name = `persistence-reload-${++n}`;
    const first = await story(open(name));
    const before = await summary(first, first.p.id);
    first.db.close();
    const again = open(name);
    expect(await summary(again, first.p.id)).toEqual(before);
    expect(before).toEqual({
      event: { title: 'The siege', start: exact(10), end: exact(11), shape: 'span', status: 'planned', canon: 'provisional', threads: ['The heir'], told: [['One', 'told'], ['Two', 'flashback']], people: [['Mira', 19]] },
      link: { from: 'Mira', to: 'The Wardens', type: 'member-of', notes: 'Sworn in.', validity: { from: 'event The siege', until: 'node Two' } },
      ability: { name: 'Spark', rank: 'Adept', ranks: ['Novice', 'Adept'] },
    });
  });
});

describe('export and import', () => {
  it('round-trips a whole project file, every new field with its links rewritten to the new ids', async () => {
    const s = await story();
    const file = JSON.parse(JSON.stringify(await s.projects.exportSnapshot(s.p.id, { everything: true })));
    expect(file.version).toBe(SNAPSHOT_VERSION);
    expect(SNAPSHOT_VERSION).toBe(4);
    const copy = await s.projects.importSnapshot(file);
    expect(await summary(s, copy.id)).toEqual(await summary(s, s.p.id));
    const [link] = await s.db.loreLinks.where('projectId').equals(copy.id).toArray();
    expect([link.fromId, link.toId]).not.toContain(s.mira.id);
  });

  it('keeps fields it does not know, on rows and on the project, through import', async () => {
    const s = await story();
    const file = JSON.parse(JSON.stringify(await s.projects.exportSnapshot(s.p.id)));
    file.project.seriesOrder = 3;
    for (const table of ['loreEntries', 'timelineEvents', 'loreLinks', 'systems', 'chapters']) for (const row of file.collections[table]) row.fromTheFuture = { kept: table };
    file.collections.loreEntries[0].fields = [{ id: 'f', key: 'Mood', value: 'Grim', type: 'weather-dial' }];
    const copy = await s.projects.importSnapshot(file);
    expect((await s.db.projects.get(copy.id)) as unknown as { seriesOrder: number }).toMatchObject({ seriesOrder: 3, title: 'Ashfall 2' });
    for (const table of ['loreEntries', 'timelineEvents', 'loreLinks', 'systems', 'chapters']) {
      const rows = await s.db.table(table).where('projectId').equals(copy.id).toArray();
      expect(rows.every((r) => r.fromTheFuture?.kept === table), table).toBe(true);
    }
    const entries = await s.db.loreEntries.where('projectId').equals(copy.id).toArray();
    expect(entries.some((e) => e.fields.some((f) => (f.type as string) === 'weather-dial' && f.value === 'Grim'))).toBe(true);
  });

  it('refuses a file holding records this version has nowhere to keep, rather than importing the rest', async () => {
    const s = await story();
    const file = JSON.parse(JSON.stringify(await s.projects.exportSnapshot(s.p.id)));
    file.collections.starCharts = [{ id: 'x', projectId: s.p.id }];
    const before = await s.db.projects.count();
    await expect(s.projects.importSnapshot(file)).rejects.toThrow('it holds records this version of the app cannot keep: starCharts (1). Nothing was imported');
    expect(await s.db.projects.count()).toBe(before);
    // Empty collections from older files (the reserved placeholders) are no loss and are fine.
    file.collections.starCharts = [];
    file.collections.outlines = [];
    await s.projects.importSnapshot(file);
  });

  it('refuses a file from a newer version, and reads one from an older version', async () => {
    const s = await story();
    const file = JSON.parse(JSON.stringify(await s.projects.exportSnapshot(s.p.id)));
    await expect(s.projects.importSnapshot({ ...file, version: SNAPSHOT_VERSION + 1 })).rejects.toBeInstanceOf(InvalidSnapshotError);
    // As version 3 wrote it: ranks by name, events and links without the new fields.
    const old = JSON.parse(JSON.stringify(file));
    old.version = 3;
    for (const sys of old.collections.systems) {
      sys.items = sys.items.map(({ rankId, ...item }: { rankId: string }) => ({ ...item, rank: sys.ranks.find((r: { id: string }) => r.id === rankId)?.name ?? '' }));
      sys.ranks = sys.ranks.map((r: { name: string }) => r.name);
    }
    for (const e of old.collections.timelineEvents) for (const key of ['end', 'ongoing', 'threadIds', 'status', 'canon', 'reveals']) delete e[key];
    for (const l of old.collections.loreLinks) for (const key of ['fromType', 'toType', 'type', 'notes', 'canon', 'validity', 'updatedAt']) delete l[key];
    const copy = await s.projects.importSnapshot(old);
    expect(await summary(s, copy.id)).toMatchObject({
      event: { shape: 'instant', status: 'confirmed', canon: 'canon', threads: [], told: [['One', 'told'], ['Two', 'told']] },
      link: { from: 'Mira', to: 'The Wardens', type: undefined, validity: { from: undefined, until: undefined } },
      ability: { rank: 'Adept', ranks: ['Novice', 'Adept'] },
    });
  });
});

describe('upgrades', () => {
  it('opens a database holding a malformed blueprint, converting what it can and leaving the rest as it was', async () => {
    const name = `persistence-upgrade-${++n}`;
    const old = new Dexie(name);
    old.version(25).stores({ systems: 'id, projectId' });
    await old.table('systems').bulkAdd([
      { id: 'good', projectId: 'p', ranks: ['Low', 'High'], items: [{ id: 'i', groupId: 'g', rank: 'High' }], matrices: [] },
      { id: 'odd', projectId: 'p', ranks: 'not a list', items: [null, 7, { id: 'j', rank: 'Lost' }], matrices: [null, { id: 'm', rows: ['A'], columns: ['B'], cells: { 'A|B': 'x', 'A|C': 42 } }] },
      { id: 'bare', projectId: 'p' },
    ]);
    old.close();
    const db = new NovelDB(name);
    const [good, odd, bare] = (await db.systems.bulkGet(['good', 'odd', 'bare'])) as unknown as Record<string, unknown>[];
    expect(rankName(good as never, (good.items as never[])[0])).toBe('High');
    expect((odd.items as unknown[]).slice(0, 2)).toEqual([null, 7]);
    expect(rankName(odd as never, (odd.items as never[])[2])).toBe('Lost');
    const table = (odd.matrices as Record<string, unknown>[])[1];
    expect((odd.matrices as unknown[])[0]).toBeNull();
    expect(Object.values(table.cells as object)).toEqual(['x', 42]);
    expect(bare).toMatchObject({ id: 'bare', ranks: [], items: [], matrices: [] });
    db.close();
  });
});

describe('turning views and modules off', () => {
  it('leaves connections, events and blueprints exactly as they were', async () => {
    const s = await story();
    const module = BUILTIN_MODULES[0];
    const tables = ['loreLinks', 'timelineEvents', 'systems', 'loreEntries'];
    const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await s.db.table(t).where('projectId').equals(s.p.id).toArray()])));
    const before = await snapshot();
    await s.extensions.forProject(s.p.id).enable(module.id);
    await s.extensions.forProject(s.p.id).disable(module.id);
    const after = await snapshot();
    // The shared records are untouched. (Turning a module on may add things of its own; none of what was there changes.)
    for (const t of ['loreLinks', 'timelineEvents', 'systems']) expect(after[t], t).toEqual(before[t]);
    expect(after.loreEntries.filter((e: { id: string }) => before.loreEntries.some((b: { id: string }) => b.id === e.id))).toEqual(before.loreEntries);
  });
});
