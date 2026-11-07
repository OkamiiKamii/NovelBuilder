import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import type { Transport } from './engine';
import { canonical, comparable, fingerprint, mergeRows } from './merge';
import { emptyAccount, relayBackupNow, relaySnapshot, relaySnapshots, relaySync, type RelayAccount, type SyncRequest } from './relay';
import { createSyncService, registerSync, type SettingsAdapter } from './service';

let n = 0;
let cloud: RelayAccount;
let online: Record<string, boolean>;
let requests: SyncRequest[];

beforeEach(() => {
  cloud = emptyAccount();
  online = {};
  requests = [];
});

const doc = (...paragraphs: string[]) => ({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });
const textOf = (value: unknown): string => (JSON.stringify(value).match(/"text":"([^"]*)"/g) ?? []).map((m) => m.slice(8, -1)).join(' | ');

/** One device: its own database and services, talking to the shared relay unless it is offline. */
function device(name: string) {
  const db = new NovelDB(`sync-${++n}-${name}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerPlot(registry);
  registerSync(registry);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const codex = createCodexService(db, projects.contentChanged);
  const plot = createPlotService(db, projects.contentChanged);
  const stored = new Map<string, string>();
  const settings: SettingsAdapter = { read: () => new Map(stored), write: (key, value) => void (value === null ? stored.delete(key) : stored.set(key, value)) };
  const sync = createSyncService(db, registry, projects, manuscript, settings);
  online[name] = true;
  const transport: Transport = {
    async sync(request) {
      if (!online[name]) throw new Error('Failed to fetch');
      requests.push(structuredClone(request));
      return structuredClone(relaySync(cloud, structuredClone(request), Date.now()));
    },
  };
  const me = { id: `device-${name}`, name };
  return { name, db, projects, manuscript, codex, plot, sync, stored, run: (projectId: string) => sync.syncNow(projectId, transport, me) };
}
type Dev = ReturnType<typeof device>;

/** A project written on the desktop and then picked up on the laptop. */
async function pair() {
  const [desk, laptop] = [device('Desktop'), device('Laptop')];
  const p = await desk.projects.create({ title: 'Ashfall', targetWordCount: 5000 });
  const m = desk.manuscript.forProject(p.id);
  const one = await m.create('chapter', null, 'Chapter 1');
  const two = await m.create('chapter', null, 'Chapter 2');
  await m.saveDoc(one.id, doc('It began in ash.'), { words: 4, characters: 16 });
  await m.saveDoc(two.id, doc('The second day.'), { words: 3, characters: 15 });
  const kai = await desk.codex.forProject(p.id).create('character', 'Kai');
  await desk.codex.forProject(p.id).update(kai.id, { summary: 'A runner.', fields: [{ id: 'lvl', key: 'Level', value: '30' }, { id: 'cls', key: 'Class', value: 'Scout' }] });
  const thread = await desk.plot.forProject(p.id).create('The Heist');
  await desk.sync.enable(p.id);
  await desk.run(p.id);
  await laptop.sync.enable(p.id);
  await laptop.run(p.id);
  const both = async (action: (d: Dev) => Promise<unknown>) => Promise.all([action(desk), action(laptop)]);
  const settle = async () => {
    for (let i = 0; i < 2; i++) for (const d of [desk, laptop]) await d.run(p.id);
  };
  return { desk, laptop, p, one, two, kai, thread, both, settle };
}
const levelOf = async (d: Dev, projectId: string, entryId: string) => (await d.codex.forProject(projectId).get(entryId))!.fields.find((f) => f.key === 'Level')!.value;
const setField = async (d: Dev, projectId: string, entryId: string, key: string, value: string) => {
  const entry = (await d.codex.forProject(projectId).get(entryId))!;
  await d.codex.forProject(projectId).update(entryId, { fields: entry.fields.map((f) => (f.key === key ? { ...f, value } : f)) });
};

describe('fingerprints and combining', () => {
  it('reads the same data the same way, ignoring what is a device\'s own business', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}');
    expect(fingerprint('loreEntries', { id: 'x', name: 'Kai', updatedAt: 1 })).toBe(fingerprint('loreEntries', { updatedAt: 99, name: 'Kai', id: 'x' }));
    expect(fingerprint('loreEntries', { id: 'x', name: 'Kai' })).not.toBe(fingerprint('loreEntries', { id: 'x', name: 'Kay' }));
    expect(fingerprint('chapters', { id: 'c', title: 'One', wordCount: 5, mentions: ['a'] })).toBe(fingerprint('chapters', { id: 'c', title: 'One', wordCount: 900, mentions: [] }));
    expect(fingerprint('chapterContents', { id: 'c', doc: doc('x'), rev: 1, savedAt: 1 })).toBe(fingerprint('chapterContents', { id: 'c', doc: doc('x'), rev: 7, savedAt: 2 }));
    expect(fingerprint('projects', null)).toBeNull();
    expect(comparable('projects', { id: 'p', title: 'T', lastOpenedAt: 5, updatedAt: 6 })).toEqual({ id: 'p', title: 'T' });
  });

  it('combines changes to different fields, and reports fields both changed', () => {
    const base = { id: 'e', name: 'Kai', level: 30, tags: ['a'], updatedAt: 1 };
    expect(mergeRows('loreEntries', base, { ...base, level: 35, updatedAt: 2 }, { ...base, name: 'Kai Renner', updatedAt: 3 })).toEqual({ merged: { id: 'e', name: 'Kai Renner', level: 35, tags: ['a'], updatedAt: 2 }, conflicts: [] });
    expect(mergeRows('loreEntries', base, { ...base, level: 35 }, { ...base, level: 35, tags: ['a', 'b'] }).conflicts).toEqual([]);
    const clash = mergeRows('loreEntries', base, { ...base, level: 35 }, { ...base, level: 37, tags: ['b'] });
    expect(clash.conflicts).toEqual([{ field: 'level', base: 30, local: 35, remote: 37 }]);
    // The conflicting field stays at this device's value until the author decides; the other change is taken.
    expect(clash.merged).toMatchObject({ level: 35, tags: ['b'] });
  });
});

describe('the relay', () => {
  it('numbers changes, hands them to other devices, and refuses a change made from a stale version', () => {
    const account = emptyAccount();
    const send = (deviceId: string, cursor: number, changes: SyncRequest['changes']) => relaySync(account, { deviceId, deviceName: deviceId, projectId: 'p', cursor, changes }, 1000);
    expect(send('a', 0, [{ key: 'projects:p', row: { id: 'p', title: 'T' }, baseSeq: 0 }, { key: 'x:1', row: { id: '1', v: 1 }, baseSeq: 0 }])).toMatchObject({ accepted: [{ key: 'projects:p', seq: 1 }, { key: 'x:1', seq: 2 }], rejected: [], cursor: 2 });
    expect(send('b', 0, []).remote.map((r) => [r.key, r.seq, r.deviceId])).toEqual([['projects:p', 1, 'a'], ['x:1', 2, 'a']]);
    expect(send('b', 2, [{ key: 'x:1', row: { id: '1', v: 2 }, baseSeq: 2 }])).toMatchObject({ accepted: [{ key: 'x:1', seq: 3 }] });
    // Device a still thinks version 2 is current: its change is refused, not applied over b's.
    expect(send('a', 2, [{ key: 'x:1', row: { id: '1', v: 99 }, baseSeq: 2 }])).toMatchObject({ accepted: [], rejected: ['x:1'] });
    expect(account.projects.p.rows['x:1'].row).toEqual({ id: '1', v: 2 });
    expect(send('a', 2, []).devices.map((d) => d.id).sort()).toEqual(['a', 'b']);
  });

  it('takes backups on its own and on request, and can hand one back', () => {
    const account = emptyAccount();
    relaySync(account, { deviceId: 'a', deviceName: 'a', projectId: 'p', cursor: 0, changes: [{ key: 'projects:p', row: { id: 'p', title: 'First' }, baseSeq: 0 }] }, 1000);
    expect(relaySnapshots(account, 'p')).toMatchObject([{ seq: 1, rows: 1, title: 'First' }]);
    relaySync(account, { deviceId: 'a', deviceName: 'a', projectId: 'p', cursor: 1, changes: [{ key: 'projects:p', row: { id: 'p', title: 'Second' }, baseSeq: 1 }] }, 2000);
    expect(relaySnapshots(account, 'p')).toHaveLength(1);
    const backup = relayBackupNow(account, 'p', 3000)!;
    expect(relaySnapshot(account, 'p', backup.id)).toEqual({ 'projects:p': { id: 'p', title: 'Second' } });
    expect(relaySnapshot(account, 'p', relaySnapshots(account, 'p').at(-1)!.id)).toEqual({ 'projects:p': { id: 'p', title: 'First' } });
    expect(relayBackupNow(account, 'nope', 1)).toBeNull();
  });
});

describe('syncing a whole project', () => {
  it('brings the complete project to a second device: text, structure, lore and threads', async () => {
    const { desk, laptop, p, one, kai } = await pair();
    expect(await laptop.projects.get(p.id)).toMatchObject({ title: 'Ashfall', targetWordCount: 5000 });
    expect((await laptop.manuscript.forProject(p.id).list()).map((x) => `${x.title}: ${x.wordCount}`).sort()).toEqual(['Chapter 1: 4', 'Chapter 2: 3']);
    expect(textOf(await laptop.manuscript.forProject(p.id).loadDoc(one.id))).toBe('It began in ash.');
    expect(await laptop.codex.forProject(p.id).get(kai.id)).toMatchObject({ name: 'Kai', summary: 'A runner.' });
    expect((await laptop.plot.forProject(p.id).list()).map((t) => t.title)).toEqual(['The Heist']);
    expect((await laptop.projects.getStats(p.id)).wordCount).toBe(7);
    // The two devices now hold the same thing, row for row.
    const view = async (d: Dev) => [...(await d.sync.store(p.id).readLocal())].map(([key, row]) => `${key}=${fingerprint(key.split(':')[0], row)}`).sort();
    expect(await view(laptop)).toEqual(await view(desk));
    expect([await desk.sync.pending(p.id), await laptop.sync.pending(p.id)]).toEqual([0, 0]);
  });

  it('sends only what changed', async () => {
    const { desk, laptop, p, one, settle } = await pair();
    requests.length = 0;
    await desk.manuscript.forProject(p.id).saveDoc(one.id, doc('It began in ash.', 'And ended in rain.'), { words: 8, characters: 34 });
    expect(await desk.sync.pending(p.id)).toBe(2);
    await desk.run(p.id);
    // Two rows out: the chapter's text, and the earlier version that saving put into its history. Its word count is each device's own to work out.
    expect(requests.flatMap((r) => r.changes.map((c) => c.key.split(':')[0])).sort()).toEqual(['chapterContents', 'chapterRevisions']);
    await settle();
    expect(textOf(await laptop.manuscript.forProject(p.id).loadDoc(one.id))).toBe('It began in ash. | And ended in rain.');
    expect((await laptop.manuscript.forProject(p.id).get(one.id))!.wordCount).toBe(8);
  });

  it('does not count opening a project or refreshing its totals as changes', async () => {
    const { desk, p } = await pair();
    await desk.projects.markOpened(p.id);
    await desk.projects.recomputeStats(p.id);
    await desk.projects.contentChanged(p.id);
    expect(await desk.sync.pending(p.id)).toBe(0);
    requests.length = 0;
    await desk.run(p.id);
    expect(requests.every((r) => r.changes.length === 0)).toBe(true);
  });

  it('carries additions, edits and deletions both ways', async () => {
    const { desk, laptop, p, two, kai, settle } = await pair();
    await desk.codex.forProject(p.id).create('location', 'The Harbour');
    await laptop.manuscript.forProject(p.id).create('chapter', null, 'Chapter 3');
    await laptop.manuscript.forProject(p.id).remove(two.id);
    await laptop.codex.forProject(p.id).update(kai.id, { summary: 'A runner, and a liar.' });
    await settle();
    for (const d of [desk, laptop]) {
      expect((await d.manuscript.forProject(p.id).list()).map((x) => x.title).sort(), d.name).toEqual(['Chapter 1', 'Chapter 3']);
      expect((await d.codex.forProject(p.id).list()).map((e) => e.name).sort(), d.name).toEqual(['Kai', 'The Harbour']);
      expect((await d.codex.forProject(p.id).get(kai.id))!.summary, d.name).toBe('A runner, and a liar.');
      expect(await d.sync.conflicts(p.id), d.name).toEqual([]);
    }
    expect(await desk.db.chapterContents.get(two.id)).toBeUndefined();
  });

  it('leaves this device\'s working data and bookkeeping out of the cloud', async () => {
    const { desk, p, one } = await pair();
    await desk.manuscript.forProject(p.id).saveDraft(one.id, doc('half a thought') as never, 1);
    await desk.run(p.id);
    const tables = new Set(Object.keys(cloud.projects[p.id].rows).map((key) => key.split(':')[0]));
    for (const local of ['chapterDrafts', 'syncState', 'syncBase', 'syncConflicts', 'syncLog', 'projectStats']) expect(tables.has(local), local).toBe(false);
    expect([...tables].sort()).toEqual(['chapterContents', 'chapters', 'loreEntries', 'plotThreads', 'projects']);
    const copy = await desk.projects.duplicate(p.id);
    expect(await desk.sync.state(copy.id)).toMatchObject({ enabled: false, cursor: 0 });
  });
});

describe('working offline', () => {
  it('keeps every edit locally, and sends them when the connection is back', async () => {
    const { desk, laptop, p, one, kai, settle } = await pair();
    online.Desktop = false;
    await desk.manuscript.forProject(p.id).saveDoc(one.id, doc('Written on a train.'), { words: 4, characters: 19 });
    await desk.codex.forProject(p.id).update(kai.id, { summary: 'Offline edit.' });
    await desk.codex.forProject(p.id).create('item', 'A ticket');
    await expect(desk.run(p.id)).rejects.toThrow('Failed to fetch');
    expect(await desk.sync.state(p.id)).toMatchObject({ lastError: 'Failed to fetch', pending: 4, syncing: false });
    // Nothing was lost by failing.
    expect(textOf(await desk.manuscript.forProject(p.id).loadDoc(one.id))).toBe('Written on a train.');
    online.Desktop = true;
    expect(await desk.run(p.id)).toMatchObject({ pushed: 4, conflicts: 0 });
    expect(await desk.sync.state(p.id)).toMatchObject({ lastError: null, pending: 0 });
    await settle();
    expect(textOf(await laptop.manuscript.forProject(p.id).loadDoc(one.id))).toBe('Written on a train.');
    expect((await laptop.codex.forProject(p.id).list()).map((e) => e.name).sort()).toEqual(['A ticket', 'Kai']);
  });
});

describe('conflicts', () => {
  it('combines edits to different fields of the same entry without asking', async () => {
    const { desk, laptop, p, kai, settle } = await pair();
    await desk.codex.forProject(p.id).update(kai.id, { summary: 'The fastest runner in the city.' });
    await laptop.codex.forProject(p.id).update(kai.id, { description: 'Scar over the left eye.' });
    await desk.run(p.id);
    expect(await laptop.run(p.id)).toMatchObject({ merged: 1, conflicts: 0 });
    await settle();
    for (const d of [desk, laptop]) expect(await d.codex.forProject(p.id).get(kai.id), d.name).toMatchObject({ summary: 'The fastest runner in the city.', description: 'Scar over the left eye.' });
  });

  it('stops and asks when two devices set the same field differently, overwriting neither', async () => {
    const { desk, laptop, p, kai } = await pair();
    await setField(desk, p.id, kai.id, 'Level', '35');
    await setField(laptop, p.id, kai.id, 'Level', '37');
    await desk.run(p.id);
    expect(await laptop.run(p.id)).toMatchObject({ conflicts: 1 });
    const [conflict] = await laptop.sync.conflicts(p.id);
    expect(conflict).toMatchObject({ kind: 'fields', table: 'loreEntries', label: 'Codex entry: Kai', remoteDevice: 'Desktop' });
    expect(conflict.fields.map((f) => f.field)).toEqual(['fields']);
    expect([levelOf(laptop, p.id, kai.id), levelOf(desk, p.id, kai.id)].length).toBe(2);
    // Each device still has exactly what its author typed; the cloud still has the desktop's.
    expect([await levelOf(laptop, p.id, kai.id), await levelOf(desk, p.id, kai.id)]).toEqual(['37', '35']);
    expect(JSON.stringify(cloud.projects[p.id].rows[`loreEntries:${kai.id}`].row)).toContain('"value":"35"');
    // Syncing again while it is unsettled changes nothing and sends nothing for that entry.
    requests.length = 0;
    await laptop.run(p.id);
    expect(requests.flatMap((r) => r.changes)).toEqual([]);
    expect((await laptop.sync.conflicts(p.id)).length).toBe(1);
    expect((await laptop.sync.log(p.id)).filter((l) => l.kind === 'conflict').map((l) => l.message)).toEqual(['“Codex entry: Kai” was changed on this device and on Desktop. Both versions are kept until you choose.']);
  });

  it('settles a field conflict either way, and the choice reaches the other device', async () => {
    for (const choice of ['local', 'remote'] as const) {
      const { desk, laptop, p, kai, settle } = await pair();
      await setField(desk, p.id, kai.id, 'Level', '35');
      await setField(laptop, p.id, kai.id, 'Level', '37');
      await laptop.codex.forProject(p.id).update(kai.id, { summary: 'Changed only on the laptop.' });
      await desk.run(p.id);
      await laptop.run(p.id);
      const [conflict] = await laptop.sync.conflicts(p.id);
      await laptop.sync.resolve(p.id, conflict.id, { choice: 'fields', take: { fields: choice } });
      expect(await laptop.sync.conflicts(p.id)).toEqual([]);
      await settle();
      for (const d of [desk, laptop]) {
        expect(await levelOf(d, p.id, kai.id), `${choice} on ${d.name}`).toBe(choice === 'local' ? '37' : '35');
        // The field only the laptop changed survives whichever way the conflict went.
        expect((await d.codex.forProject(p.id).get(kai.id))!.summary, d.name).toBe('Changed only on the laptop.');
      }
      await expect(laptop.sync.resolve(p.id, conflict.id, { choice: 'local' })).rejects.toThrow('already been settled');
    }
  });

  it('treats the same chapter edited on two devices as a text conflict, with both versions kept whole', async () => {
    const { desk, laptop, p, one } = await pair();
    await desk.manuscript.forProject(p.id).saveDoc(one.id, doc('The desktop version.'), { words: 3, characters: 20 });
    await laptop.manuscript.forProject(p.id).saveDoc(one.id, doc('The laptop version.'), { words: 3, characters: 19 });
    await desk.run(p.id);
    await laptop.run(p.id);
    const [conflict] = await laptop.sync.conflicts(p.id);
    expect(conflict).toMatchObject({ kind: 'text', table: 'chapterContents', label: 'The text of Chapter 1', fields: [] });
    expect([textOf(conflict.local!.doc), textOf(conflict.remote!.doc)]).toEqual(['The laptop version.', 'The desktop version.']);
    expect(textOf(await laptop.manuscript.forProject(p.id).loadDoc(one.id))).toBe('The laptop version.');
  });

  it('keeps the cloud\'s text when asked, putting this device\'s into the chapter\'s history first', async () => {
    const { desk, laptop, p, one, settle } = await pair();
    await desk.manuscript.forProject(p.id).saveDoc(one.id, doc('The desktop version.'), { words: 3, characters: 20 });
    await laptop.manuscript.forProject(p.id).saveDoc(one.id, doc('The laptop version, with more words.'), { words: 6, characters: 36 });
    await desk.run(p.id);
    await laptop.run(p.id);
    const before = (await laptop.db.chapterContents.get(one.id))!.rev!;
    await laptop.sync.resolve(p.id, (await laptop.sync.conflicts(p.id))[0].id, { choice: 'remote' });
    expect(textOf(await laptop.manuscript.forProject(p.id).loadDoc(one.id))).toBe('The desktop version.');
    expect((await laptop.manuscript.forProject(p.id).get(one.id))!.wordCount).toBe(3);
    expect((await laptop.db.chapterContents.get(one.id))!.rev).toBeGreaterThan(before);
    const kept = (await laptop.db.chapterRevisions.where('projectId').equals(p.id).toArray()).find((r) => r.label === 'This device’s version, before a sync conflict was settled');
    expect(textOf(kept?.doc)).toBe('The laptop version, with more words.');
    await settle();
    expect(textOf(await desk.manuscript.forProject(p.id).loadDoc(one.id))).toBe('The desktop version.');
    expect([await desk.sync.conflicts(p.id), await laptop.sync.conflicts(p.id)]).toEqual([[], []]);
  });

  it('keeps this device\'s text, or a version merged by hand, and sends it on', async () => {
    for (const how of ['local', 'merged'] as const) {
      const { desk, laptop, p, one, settle } = await pair();
      await desk.manuscript.forProject(p.id).saveDoc(one.id, doc('The desktop version.'), { words: 3, characters: 20 });
      await laptop.manuscript.forProject(p.id).saveDoc(one.id, doc('The laptop version.'), { words: 3, characters: 19 });
      await desk.run(p.id);
      await laptop.run(p.id);
      const [conflict] = await laptop.sync.conflicts(p.id);
      await laptop.sync.resolve(p.id, conflict.id, how === 'local' ? { choice: 'local' } : { choice: 'merged', row: { ...conflict.local!, doc: doc('The laptop version.', 'The desktop version.') } });
      await settle();
      const expected = how === 'local' ? 'The laptop version.' : 'The laptop version. | The desktop version.';
      for (const d of [desk, laptop]) expect(textOf(await d.manuscript.forProject(p.id).loadDoc(one.id)), `${how} on ${d.name}`).toBe(expected);
      expect((await desk.manuscript.forProject(p.id).get(one.id))!.wordCount).toBe(how === 'local' ? 3 : 6);
    }
  });

  it('asks when one device deleted what another changed', async () => {
    const { desk, laptop, p, kai, settle } = await pair();
    await desk.codex.forProject(p.id).remove(kai.id);
    await laptop.codex.forProject(p.id).update(kai.id, { summary: 'Still needed.' });
    await desk.run(p.id);
    await laptop.run(p.id);
    const [conflict] = await laptop.sync.conflicts(p.id);
    expect(conflict).toMatchObject({ kind: 'removed', remote: null, label: 'Codex entry: Kai' });
    expect(await laptop.codex.forProject(p.id).get(kai.id)).toBeDefined();
    await laptop.sync.resolve(p.id, conflict.id, { choice: 'local' });
    await settle();
    expect((await desk.codex.forProject(p.id).get(kai.id))?.summary).toBe('Still needed.');
  });

  it('never deletes a project because another device deleted it', async () => {
    const { desk, laptop, p, settle } = await pair();
    await desk.projects.remove(p.id);
    expect(await desk.sync.state(p.id)).toMatchObject({ enabled: false });
    await laptop.manuscript.forProject(p.id).create('chapter', null, 'Chapter 3');
    await settle().catch(() => {});
    expect(await laptop.projects.get(p.id)).toMatchObject({ title: 'Ashfall' });
    expect((await laptop.manuscript.forProject(p.id).list()).length).toBe(3);
    expect(cloud.projects[p.id].rows[`projects:${p.id}`].row).not.toBeNull();
  });
});

describe('settings, safety and recovery', () => {
  it('carries workspace settings between devices, and keeps this device\'s when both changed them', async () => {
    const { desk, laptop, p, settle } = await pair();
    desk.stored.set('novel-builder:studio:layout', '{"mode":"wide"}');
    await settle();
    expect(laptop.stored.get('novel-builder:studio:layout')).toBe('{"mode":"wide"}');
    desk.stored.set('novel-builder:studio:layout', '{"mode":"desk"}');
    laptop.stored.set('novel-builder:studio:layout', '{"mode":"lap"}');
    await desk.run(p.id);
    await laptop.run(p.id);
    expect(laptop.stored.get('novel-builder:studio:layout')).toBe('{"mode":"lap"}');
    expect(await laptop.sync.conflicts(p.id)).toEqual([]);
    const note = (await laptop.sync.log(p.id)).find((l) => l.kind === 'settings')!;
    expect(note.message).toBe('The workspace layout was changed on this device and on Desktop. This device\'s was kept.');
    expect(note.detail).toContain('desk');
  });

  it('ignores anything from the cloud that is not this project\'s to hold', async () => {
    const { laptop, p, kai } = await pair();
    const other = await laptop.projects.create({ title: 'Private' });
    const secret = await laptop.codex.forProject(other.id).create('character', 'Untouchable');
    await laptop.sync.store(p.id).apply([
      { key: `loreEntries:${secret.id}`, row: { ...secret, name: 'Hijacked', projectId: other.id } },
      { key: `loreEntries:${secret.id}`, row: null },
      { key: `projects:${other.id}`, row: { id: other.id, title: 'Hijacked' } },
      { key: 'customModules:x', row: { id: 'x' } },
      { key: `projects:${p.id}`, row: null },
      { key: `loreEntries:${kai.id}`, row: { ...(await laptop.codex.forProject(p.id).get(kai.id))!, name: 'Kai R.' } },
    ]);
    expect((await laptop.codex.forProject(other.id).get(secret.id))?.name).toBe('Untouchable');
    expect((await laptop.projects.get(other.id))?.title).toBe('Private');
    expect(await laptop.db.customModules.count()).toBe(0);
    expect(await laptop.projects.get(p.id)).toBeDefined();
    expect((await laptop.codex.forProject(p.id).get(kai.id))?.name).toBe('Kai R.');
  });

  it('restores a cloud backup as a separate project, replacing nothing', async () => {
    const { desk, p, one } = await pair();
    const backup = relayBackupNow(cloud, p.id, Date.now())!;
    await desk.manuscript.forProject(p.id).saveDoc(one.id, doc('Rewritten since the backup.'), { words: 4, characters: 27 });
    const restored = await desk.sync.restoreBackup(relaySnapshot(cloud, p.id, backup.id)!, backup.at);
    expect(restored.id).not.toBe(p.id);
    expect(restored.title).toMatch(/^Ashfall \(cloud backup of /);
    const chapters = await desk.manuscript.forProject(restored.id).list();
    expect(textOf(await desk.manuscript.forProject(restored.id).loadDoc(chapters.find((c) => c.title === 'Chapter 1')!.id))).toBe('It began in ash.');
    expect((await desk.codex.forProject(restored.id).list()).map((e) => e.name)).toEqual(['Kai']);
    // The project as it is now is untouched, and the restored copy is not synced until the author says so.
    expect(textOf(await desk.manuscript.forProject(p.id).loadDoc(one.id))).toBe('Rewritten since the backup.');
    expect(await desk.sync.state(restored.id)).toMatchObject({ enabled: false });
    await expect(desk.sync.restoreBackup({}, 1)).rejects.toThrow('no project');
  });

  it('runs one sync at a time for a project, and records each one', async () => {
    const { desk, p, kai } = await pair();
    await desk.codex.forProject(p.id).update(kai.id, { summary: 'Once.' });
    const [a, b] = await Promise.all([desk.run(p.id), desk.run(p.id)]);
    expect(a).toBe(b);
    expect((await desk.sync.log(p.id)).filter((l) => l.kind === 'sync').map((l) => l.message)).toEqual(['7 sent.', '1 sent.']);
    await desk.sync.disable(p.id);
    expect(await desk.sync.enabled()).toEqual([]);
  });

  it('adds up a writing session continued on two devices instead of asking about it', () => {
    const base = { id: 's', projectId: 'p', day: '2026-10-11', startedAt: 100, lastActiveAt: 200, netWords: 50, added: 60, removed: 10, saves: 3 };
    const local = { ...base, lastActiveAt: 400, netWords: 80, added: 95, removed: 15, saves: 5 };
    const remote = { ...base, lastActiveAt: 300, netWords: 40, added: 60, removed: 20, saves: 4 };
    const result = mergeRows('writingSessions', base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.merged).toEqual({ ...base, lastActiveAt: 400, netWords: 70, added: 95, removed: 25, saves: 6 });
    // The same numbers in an ordinary row are a conflict like any other.
    expect(mergeRows('loreEntries', base, local, remote).conflicts.map((c) => c.field).sort()).toEqual(['lastActiveAt', 'netWords', 'removed', 'saves']);
  });
});
