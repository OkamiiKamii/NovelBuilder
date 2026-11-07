import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createAssistantService, registerAssistant } from '@/modules/assistant/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { quoteIn } from '@/modules/manuscript/editor/comments';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProgressService, registerProgress } from '@/modules/progress/service';
import { createProjectService } from '@/modules/projects/service';
import { ROLES, pageAllowed, refusal, visible, type Role } from '@/modules/sync/access';
import type { Transport } from '@/modules/sync/engine';
import { emptyAccount, relayInvite, relayJoin, relayMember, relaySync, relayUpdateMember, type RelayAccount, type RelayMember, type SyncRequest } from '@/modules/sync/relay';
import { createSyncService, registerSync } from '@/modules/sync/service';
import { PermissionError, installCollab } from './guard';
import { applyHunk, textHunks, textOf } from './hunks';
import type { Me } from './identity';
import { createCollabService, isOpen, openHunks, registerCollab } from './service';

let n = 0;
let cloud: RelayAccount;
beforeEach(() => {
  cloud = emptyAccount();
});

const doc = (...paragraphs: string[]) => ({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) });
const words = (value: unknown): string[] => ((value as { content?: unknown[] })?.content ?? []).map((block) => textOf([block]));
const metrics = { words: 4, characters: 20 };

/** One person at one device. Without an invitation they are the owner, with the account's key. */
function person(name: string, member?: RelayMember) {
  const db = new NovelDB(`collab-${++n}-${name}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  const me: Me = member ? { id: member.id, name, role: member.role } : { id: 'owner', name, role: 'owner' };
  const guard = installCollab(db, { shared: () => ['projects', 'timelines', ...registry.collections.filter((c) => !c.transient).map((c) => c.table)], who: () => me });
  registerProgress(registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerPlot(registry);
  registerAssistant(registry);
  registerCollab(registry);
  registerSync(registry);
  const progress = createProgressService(db);
  const manuscript = createManuscriptService(db, projects.contentChanged, progress.recordWriting);
  const codex = createCodexService(db, projects.contentChanged);
  const plot = createPlotService(db, projects.contentChanged);
  const assistant = createAssistantService(db, codex, plot, projects.contentChanged);
  const collab = createCollabService(db, { guard, who: () => me, manuscript, codex, plot, progress, assistant, onChanged: projects.contentChanged });
  const stored = new Map<string, string>(member ? [] : [['novel-builder:studio:layout', '{"mine":true}']]);
  const sync = createSyncService(db, registry, projects, manuscript, { read: () => new Map(stored), write: (key, value) => void (value === null ? stored.delete(key) : stored.set(key, value)) }, guard.exempt);
  const requests: SyncRequest[] = [];
  const transport: Transport = {
    async sync(request) {
      requests.push(structuredClone(request));
      const live = member ? relayMember(cloud, member.id, member.secretHash) : undefined;
      if (member && !live) throw new Error('This invitation is not valid, or access has been removed.');
      const response = structuredClone(relaySync(cloud, structuredClone(request), Date.now(), live ?? undefined));
      if (response.member) me.role = response.member.role;
      return response;
    },
  };
  return { name, db, me, guard, projects, manuscript, codex, plot, progress, assistant, collab, sync, stored, requests, run: (projectId: string) => sync.syncNow(projectId, transport, { id: `dev-${name}`, name }) };
}
type Person = ReturnType<typeof person>;

const invite = (projectId: string, role: Role, name: string): RelayMember => {
  const id = `m-${name.toLowerCase()}`;
  relayInvite(cloud, { projectId, role, name, email: `${name.toLowerCase()}@example.com` }, id, `hash-${name}`, Date.now());
  relayJoin(cloud.members![id], name, Date.now());
  return cloud.members![id];
};

/** A project with two chapters (one published), lore, a plot thread, a private idea and a goal; and one person in every role. */
async function team() {
  const owner = person('Raciel');
  const p = await owner.projects.create({ title: 'Ashfall', synopsis: 'The secret ending.' });
  const m = owner.manuscript.forProject(p.id);
  const one = await m.create('chapter', null, 'Chapter 1');
  const two = await m.create('chapter', null, 'Chapter 2');
  await m.saveDoc(one.id, doc('It began in ash.', 'Nobody ran.', 'The bell rang.'), metrics);
  await m.saveDoc(two.id, doc('The second day.'), metrics);
  await m.update(one.id, { status: 'published', notes: 'Private plan for one.', summary: 'A summary.' });
  const marcus = await owner.codex.forProject(p.id).create('character', 'Marcus');
  await owner.codex.forProject(p.id).update(marcus.id, { summary: 'A smith.', notes: 'He dies in book three.', fields: [{ id: 'lvl', key: 'Level', value: '35' }] });
  const heist = await owner.plot.forProject(p.id).create('The Heist');
  const beat = await owner.plot.forProject(p.id).addBeat(heist.id, { title: 'The plan', nodeId: one.id });
  await owner.assistant.forProject(p.id).addIdea('A private idea.');
  await owner.progress.forProject(p.id).addGoal('task', { title: 'Finish act one' });
  await owner.sync.enable(p.id);
  await owner.run(p.id);
  const people = {} as Record<Exclude<Role, 'owner'>, Person>;
  for (const [role, name] of [['coauthor', 'Sarah'], ['editor', 'David'], ['reader', 'Dana'], ['viewer', 'Vic']] as const) {
    people[role] = person(name, invite(p.id, role, name));
    await people[role].sync.enable(p.id);
    await people[role].run(p.id);
  }
  const settle = async (...who: Person[]) => {
    for (let i = 0; i < 2; i++) for (const d of who) await d.run(p.id);
  };
  return { owner, ...people, p, one, two, marcus, heist, beat, settle };
}

const tablesOn = async (who: Person, projectId: string): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const table of ['chapters', 'chapterContents', 'chapterRevisions', 'loreEntries', 'plotThreads', 'ideas', 'goals', 'members', 'comments', 'suggestions']) out[table] = await who.db.table(table).where('projectId').equals(projectId).count();
  return out;
};

describe('the roles', () => {
  it('give each role what it is described as having', () => {
    const table = Object.fromEntries(ROLES.map((role) => [role, ['manuscript', 'codex', 'plot', 'progress', 'team', 'settings', 'sync'].filter((page) => pageAllowed(role, page))]));
    expect(table).toEqual({
      owner: ['manuscript', 'codex', 'plot', 'progress', 'team', 'settings', 'sync'],
      coauthor: ['manuscript', 'codex', 'plot', 'progress', 'team', 'settings', 'sync'],
      editor: ['manuscript', 'codex', 'plot', 'team'],
      reader: ['manuscript', 'team'],
      viewer: ['manuscript'],
    });
  });

  it('send each role only what it may see, with private parts blanked', async () => {
    const t = await team();
    expect(await tablesOn(t.coauthor, t.p.id)).toMatchObject({ chapters: 2, chapterContents: 2, loreEntries: 1, plotThreads: 1, ideas: 1, goals: 1 });
    expect(await tablesOn(t.editor, t.p.id)).toMatchObject({ chapters: 2, chapterContents: 2, loreEntries: 1, plotThreads: 1, ideas: 0, goals: 0, chapterRevisions: 0 });
    expect(await tablesOn(t.reader, t.p.id)).toMatchObject({ chapters: 2, chapterContents: 2, loreEntries: 0, plotThreads: 0, ideas: 0, goals: 0, chapterRevisions: 0 });
    // A viewer has the published chapter and nothing else.
    expect(await tablesOn(t.viewer, t.p.id)).toMatchObject({ chapters: 1, chapterContents: 1, loreEntries: 0, plotThreads: 0, ideas: 0, goals: 0 });
    expect((await t.viewer.db.chapters.toArray()).map((c) => c.title)).toEqual(['Chapter 1']);

    // Private planning and notes do not travel to those who may not have them.
    expect((await t.reader.db.chapters.get(t.one.id))!).toMatchObject({ title: 'Chapter 1', notes: '', summary: '' });
    expect((await t.editor.db.chapters.get(t.one.id))!).toMatchObject({ notes: 'Private plan for one.' });
    expect((await t.editor.db.loreEntries.get(t.marcus.id))!).toMatchObject({ summary: 'A smith.', notes: '' });
    expect((await t.coauthor.db.loreEntries.get(t.marcus.id))!.notes).toBe('He dies in book three.');
    expect((await t.reader.db.projects.get(t.p.id))!).toMatchObject({ title: 'Ashfall', synopsis: '' });
    // Nobody is sent the owner's own workspace settings, and nobody's settings are sent up.
    for (const who of [t.coauthor, t.editor, t.reader, t.viewer]) expect(who.stored.size).toBe(0);
    expect(JSON.stringify(cloud.projects[t.p.id].rows)).toContain('"mine');
  });

  it('follow a chapter being published and unpublished, for a viewer', async () => {
    const t = await team();
    await t.owner.manuscript.forProject(t.p.id).update(t.two.id, { status: 'final' });
    await t.settle(t.owner, t.viewer);
    expect((await t.viewer.db.chapters.toArray()).map((c) => c.title).sort()).toEqual(['Chapter 1', 'Chapter 2']);
    expect(words((await t.viewer.db.chapterContents.get(t.two.id))!.doc)).toEqual(['The second day.']);
    await t.owner.manuscript.forProject(t.p.id).update(t.one.id, { status: 'revising' });
    await t.settle(t.owner, t.viewer);
    expect((await t.viewer.db.chapters.toArray()).map((c) => c.title)).toEqual(['Chapter 2']);
    expect(await t.viewer.db.chapterContents.get(t.one.id)).toBeUndefined();
    // The owner's copy is, of course, whole.
    expect(await t.owner.db.chapterContents.count()).toBe(2);
  });

  it('take effect when a role is changed, and stop when access is removed', async () => {
    const t = await team();
    relayUpdateMember(cloud, t.editor.me.id, { role: 'reader' });
    await t.editor.run(t.p.id);
    expect(t.editor.me.role).toBe('reader');
    expect(await tablesOn(t.editor, t.p.id)).toMatchObject({ chapters: 2, loreEntries: 0, plotThreads: 0 });
    expect((await t.editor.db.chapters.get(t.one.id))!.notes).toBe('');
    relayUpdateMember(cloud, t.editor.me.id, { role: 'coauthor' });
    await t.editor.run(t.p.id);
    expect(await tablesOn(t.editor, t.p.id)).toMatchObject({ chapters: 2, loreEntries: 1, plotThreads: 1, ideas: 1 });
    expect((await t.editor.db.loreEntries.get(t.marcus.id))!.notes).toBe('He dies in book three.');
    relayUpdateMember(cloud, t.editor.me.id, { status: 'revoked' });
    await expect(t.editor.run(t.p.id)).rejects.toThrow('access has been removed');
    expect(relayMember(cloud, t.reader.me.id, 'the-wrong-secret')).toBeNull();
    expect(() => relayUpdateMember(cloud, t.reader.me.id, { role: 'owner' })).toThrow();
  });

  it('are enforced by the relay whatever a device sends', async () => {
    const t = await team();
    const base = (key: string) => cloud.projects[t.p.id].rows[key]?.seq ?? 0;
    const send = (who: Person, key: string, row: Record<string, unknown> | null) => relaySync(cloud, { deviceId: 'x', deviceName: 'x', projectId: t.p.id, cursor: 0, changes: [{ key, row, baseSeq: base(key) }] }, Date.now(), cloud.members![who.me.id]);
    const lore = `loreEntries:${t.marcus.id}`;
    const hacked = { ...cloud.projects[t.p.id].rows[lore].row!, name: 'Hacked' };
    for (const who of [t.editor, t.reader, t.viewer]) {
      const result = send(who, lore, hacked);
      expect(result.accepted).toEqual([]);
      expect(result.denied).toHaveLength(1);
      expect(send(who, `chapterContents:${t.one.id}`, { id: t.one.id, projectId: t.p.id, doc: doc('Mine now.') }).denied).toHaveLength(1);
      expect(send(who, lore, null).denied).toHaveLength(1);
    }
    expect(cloud.projects[t.p.id].rows[lore].row!.name).toBe('Marcus');
    expect(send(t.coauthor, lore, { ...hacked, name: 'Marcus the Elder' }).accepted).toHaveLength(1);
    // Even a co-author does not manage the team, change the project itself, or touch another person's settings.
    expect(send(t.coauthor, `members:${t.reader.me.id}`, { id: t.reader.me.id, projectId: t.p.id, role: 'coauthor' }).denied![0].reason).toMatch(/owner/);
    expect(send(t.coauthor, `projects:${t.p.id}`, { id: t.p.id, title: 'Mine' }).denied).toHaveLength(1);
    expect(send(t.coauthor, 'settings:novel-builder:studio:layout', { id: 'x', value: '{}' }).denied).toHaveLength(1);
    // Established canon is the owner's.
    expect(refusal('coauthor', 'm', 'canonFacts:f', null, { id: 'f', status: 'provisional' })).toBeNull();
    expect(refusal('coauthor', 'm', 'canonFacts:f', { id: 'f', status: 'provisional' }, { id: 'f', status: 'canon' })).toMatch(/owner/);
    expect(refusal('coauthor', 'm', 'canonFacts:f', { id: 'f', status: 'canon' }, null)).toMatch(/owner/);
    expect(refusal('owner', 'owner', 'canonFacts:f', { id: 'f', status: 'canon' }, null)).toBeNull();
    // An invitation reaches one project only.
    expect(() => relaySync(cloud, { deviceId: 'x', deviceName: 'x', projectId: 'another', cursor: 0, changes: [] }, Date.now(), cloud.members![t.reader.me.id])).toThrow();
    expect(visible('viewer', 'v', 'comments:c', { id: 'c', threadAuthorId: 'v' }, () => null)).toBeNull();
  });

  it('are enforced on the device too, before anything is written', async () => {
    const t = await team();
    for (const who of [t.editor, t.reader, t.viewer]) {
      await expect(who.manuscript.forProject(t.p.id).saveDoc(t.one.id, doc('Rewritten.'), metrics)).rejects.toThrow(PermissionError);
      await expect(who.manuscript.forProject(t.p.id).update(t.one.id, { title: 'Mine' })).rejects.toThrow(PermissionError);
      expect(words((await who.db.chapterContents.get(t.one.id))!.doc)[0]).toBe('It began in ash.');
    }
    await expect(t.editor.codex.forProject(t.p.id).update(t.marcus.id, { summary: 'A baker.' })).rejects.toThrow(/suggestions and comments/);
    await expect(t.editor.plot.forProject(t.p.id).create('My thread')).rejects.toThrow(PermissionError);
    expect((await t.editor.db.loreEntries.get(t.marcus.id))!.summary).toBe('A smith.');
    // Opening the project (which only notes when it was opened) is not a change to it.
    await t.reader.projects.markOpened(t.p.id);
    // Anyone may remove their own copy from their own device; nothing is deleted for anyone else.
    await t.reader.projects.remove(t.p.id).catch(() => {});
    await t.reader.guard.exempt(t.p.id, () => t.reader.projects.remove(t.p.id));
    expect(await t.reader.db.chapters.count()).toBe(0);
    await t.owner.run(t.p.id);
    expect(await t.owner.db.chapters.count()).toBe(2);
    // A co-author writes freely.
    await t.coauthor.manuscript.forProject(t.p.id).saveDoc(t.two.id, doc('The second day.', 'Sarah was here.'), metrics);
    await t.coauthor.codex.forProject(t.p.id).update(t.marcus.id, { summary: 'A master smith.' });
    await t.settle(t.coauthor, t.owner);
    expect(words((await t.owner.db.chapterContents.get(t.two.id))!.doc)).toEqual(['The second day.', 'Sarah was here.']);
    expect((await t.owner.db.loreEntries.get(t.marcus.id))!.summary).toBe('A master smith.');
  });

  it('never lose a change made by someone else in the moment between a device receiving and sending', async () => {
    const t = await team();
    const member = cloud.members![t.editor.me.id];
    const ask = (changes: SyncRequest['changes']) => relaySync(cloud, { deviceId: 'dev-David', deviceName: 'David', projectId: t.p.id, cursor: 0, changes }, Date.now(), member);
    const lore = `loreEntries:${t.marcus.id}`;
    // The editor's device asks what is new (nothing), and before it sends its own comment the owner changes Marcus.
    expect(ask([]).remote).toEqual([]);
    await t.owner.codex.forProject(t.p.id).update(t.marcus.id, { summary: 'Changed in between.' });
    await t.owner.run(t.p.id);
    const sent = ask([{ key: 'comments:c1', row: { id: 'c1', projectId: t.p.id, authorId: member.id, threadAuthorId: member.id, body: 'Hello' }, baseSeq: 0 }]);
    expect(sent.accepted).toHaveLength(1);
    // The answer to a request that brought changes carries none back, and nothing is counted as delivered by it…
    expect(sent.remote).toEqual([]);
    // …so the next time the device asks, the owner's change is there for it.
    await t.editor.run(t.p.id);
    expect((await t.editor.db.loreEntries.get(t.marcus.id))!.summary).toBe('Changed in between.');
    // A change made against a row that has since moved on is out of date, not forbidden: it is not reported as refused.
    const stale = ask([{ key: lore, row: { id: t.marcus.id, projectId: t.p.id, name: 'Old news' }, baseSeq: 1 }]);
    expect([stale.rejected, stale.denied]).toEqual([[lore], []]);
  });

  it('report, once, a change the cloud refused, and keep it on the device', async () => {
    const t = await team();
    // The device's own check is bypassed, as a tampered copy of the app would.
    await t.editor.guard.exempt(t.p.id, () => t.editor.db.loreEntries.update(t.marcus.id, { summary: 'Forced.' }));
    const first = await t.editor.run(t.p.id);
    expect(first.denied).toBe(1);
    await t.editor.run(t.p.id);
    const log = (await t.editor.sync.log(t.p.id)).filter((entry) => entry.kind === 'error');
    expect(log).toHaveLength(1);
    expect(log[0].message).toMatch(/did not take one change your role does not allow: Codex entry: Marcus/);
    expect((await t.editor.sync.state(t.p.id)).pending).toBe(1);
    expect((await t.editor.db.loreEntries.get(t.marcus.id))!.summary).toBe('Forced.');
    await t.owner.run(t.p.id);
    expect((await t.owner.db.loreEntries.get(t.marcus.id))!.summary).toBe('A smith.');
  });
});

describe('conversations', () => {
  it('quote the selected words without the spaces around them, keeping where they start', () => {
    // A double-click on Windows selects “Nobody ” with the space after it.
    expect(quoteIn('Nobody ran.', 0, 7)).toEqual({ quote: 'Nobody', offset: 0 });
    expect(quoteIn('It began  in ash.', 8, 12)).toEqual({ quote: 'in', offset: 10 });
    expect(quoteIn('Nobody ran.', 6, 7)).toBeNull();
    expect(quoteIn('Nobody ran.', 7, 99)).toEqual({ quote: 'ran.', offset: 7 });
  });

  it('attach to text, entries and plot developments, with replies, resolving and re-opening', async () => {
    const t = await team();
    const editor = t.editor.collab.forProject(t.p.id);
    const onText = await editor.comment({ kind: 'text', chapterId: t.one.id, quote: 'Nobody ran', block: 1, offset: 0 }, 'Would they not run?');
    await editor.comment({ kind: 'entry', entryId: t.marcus.id }, 'Level 35 seems high here.');
    await editor.comment({ kind: 'beat', threadId: t.heist.id, beatId: t.beat.id }, 'This needs setting up earlier.');
    expect(onText).toMatchObject({ targetKey: `chapter:${t.one.id}`, targetLabel: 'Chapter 1', authorName: 'David', authorRole: 'editor', status: 'open' });
    await t.settle(t.editor, t.owner);

    const owner = t.owner.collab.forProject(t.p.id);
    expect((await owner.threads()).map((th) => [th.root.targetLabel, th.root.body])).toEqual([['Chapter 1', 'Would they not run?'], ['Marcus', 'Level 35 seems high here.'], ['The Heist: The plan', 'This needs setting up earlier.']]);
    expect((await owner.threads(`entry:${t.marcus.id}`)).length).toBe(1);
    await owner.reply(onText.id, 'They are too tired to.');
    await owner.setStatus(onText.id, 'resolved');
    await t.settle(t.owner, t.editor);
    const [seen] = await editor.threads(`chapter:${t.one.id}`);
    expect(seen.replies.map((r) => [r.authorName, r.body])).toEqual([['Raciel', 'They are too tired to.']]);
    expect(seen.root).toMatchObject({ status: 'resolved', resolvedBy: 'Raciel' });
    await editor.setStatus(onText.id, 'open');
    await editor.edit(onText.id, 'Would they not at least look up?');
    await expect(editor.edit(seen.replies[0].id, 'Changed.')).rejects.toThrow(/Only its writer/);
    await t.settle(t.editor, t.owner);
    expect((await owner.threads(`chapter:${t.one.id}`))[0].root).toMatchObject({ status: 'open', body: 'Would they not at least look up?' });
  });

  it('keep a reader to their own conversations, and a viewer out of all of them', async () => {
    const t = await team();
    await t.editor.collab.forProject(t.p.id).comment({ kind: 'chapter', chapterId: t.one.id }, 'An editor’s private remark.');
    const reader = t.reader.collab.forProject(t.p.id);
    const mine = await reader.comment({ kind: 'text', chapterId: t.one.id, quote: 'The bell rang', block: 2, offset: 0 }, 'Loved this', { kind: 'reaction' });
    await reader.comment({ kind: 'chapter', chapterId: t.one.id }, 'Slow start, strong end.', { kind: 'feedback', ratings: { pacing: 2, clarity: 5, engagement: 4 } });
    await t.settle(t.editor, t.reader, t.owner);
    await t.owner.collab.forProject(t.p.id).reply(mine.id, 'Thank you!');
    await t.settle(t.owner, t.reader, t.editor, t.viewer);
    expect((await reader.threads()).map((th) => [th.root.kind, th.root.body, th.replies.map((r) => r.body)])).toEqual([['reaction', 'Loved this', ['Thank you!']], ['feedback', 'Slow start, strong end.', []]]);
    expect((await t.owner.collab.forProject(t.p.id).threads()).length).toBe(3);
    expect((await t.owner.db.comments.toArray()).find((c) => c.kind === 'feedback')!.ratings).toEqual({ pacing: 2, clarity: 5, engagement: 4 });
    expect(await t.viewer.db.comments.count()).toBe(0);
    await expect(t.viewer.collab.forProject(t.p.id).comment({ kind: 'chapter', chapterId: t.one.id }, 'Hello')).rejects.toThrow(/Viewers cannot comment/);
    // A reader cannot pass a comment off as someone else's, or resolve one that is not theirs.
    expect(refusal('reader', 'r', 'comments:c', null, { id: 'c', authorId: 'someone', threadAuthorId: 'r' })).toMatch(/signed/);
    expect(refusal('reader', 'r', 'comments:c', { id: 'c', authorId: 'e', threadAuthorId: 'e', status: 'open' }, { id: 'c', authorId: 'e', threadAuthorId: 'e', status: 'resolved' })).not.toBeNull();
    expect(refusal('editor', 'e', 'comments:c', { id: 'c', authorId: 'x', body: 'a', status: 'open' }, { id: 'c', authorId: 'x', body: 'a', status: 'resolved' })).toBeNull();
    expect(refusal('editor', 'e', 'comments:c', { id: 'c', authorId: 'x', body: 'a', status: 'open' }, { id: 'c', authorId: 'x', body: 'rewritten', status: 'open' })).not.toBeNull();
  });

  it('turn into a task, a note or a plot development, and say what they became', async () => {
    const t = await team();
    const editor = t.editor.collab.forProject(t.p.id);
    const a = await editor.comment({ kind: 'text', chapterId: t.one.id, quote: 'Nobody ran', block: 1, offset: 0 }, 'The guards vanish after this scene.');
    const b = await editor.comment({ kind: 'entry', entryId: t.marcus.id }, 'Give him a limp?');
    const c = await editor.comment({ kind: 'chapter', chapterId: t.two.id }, 'Tighten the opening.');
    await expect(editor.convert(a.id, { kind: 'task' })).rejects.toThrow(/Only an author/);
    await t.settle(t.editor, t.owner);
    const owner = t.owner.collab.forProject(t.p.id);
    expect(await owner.convert(a.id, { kind: 'beat', plotThreadId: t.heist.id })).toMatchObject({ kind: 'beat', label: 'A development on “The Heist”', by: 'Raciel' });
    await owner.convert(b.id, { kind: 'note' });
    await owner.convert(c.id, { kind: 'task' });
    const thread = (await t.owner.db.plotThreads.get(t.heist.id))!;
    expect(thread.beats.at(-1)).toMatchObject({ title: 'The guards vanish after this scene.', nodeId: t.one.id, note: '“Nobody ran” The guards vanish after this scene. (David, on Chapter 1)' });
    expect((await t.owner.db.ideas.toArray()).map((i) => i.text)).toContain('Give him a limp? (David, on Marcus)');
    expect((await t.owner.db.goals.toArray()).filter((g) => g.kind === 'task').map((g) => g.title)).toContain('Tighten the opening. (David, on Chapter 2)');
    await t.settle(t.owner, t.editor);
    expect((await editor.threads()).map((th) => [th.root.status, th.root.converted?.kind]).sort()).toEqual([['resolved', 'beat'], ['resolved', 'note'], ['resolved', 'task']]);
  });

  it('delete a reply outright, and a conversation only when nobody else is in it', async () => {
    const t = await team();
    const reader = t.reader.collab.forProject(t.p.id);
    const alone = await reader.comment({ kind: 'chapter', chapterId: t.one.id }, 'Never mind.');
    const joined = await reader.comment({ kind: 'chapter', chapterId: t.one.id }, 'Who is the bell for?');
    await t.settle(t.reader, t.owner);
    const reply = await t.owner.collab.forProject(t.p.id).reply(joined.id, 'You will see.');
    await t.settle(t.owner, t.reader);
    await reader.remove(alone.id);
    await reader.remove(joined.id);
    await expect(reader.remove(reply.id)).rejects.toThrow(/Only its writer or an author/);
    await t.settle(t.reader, t.owner);
    const left = await t.owner.collab.forProject(t.p.id).threads();
    expect(left.map((th) => [th.root.deleted, th.root.body, th.replies.map((r) => r.body)])).toEqual([[true, '', ['You will see.']]]);
    await t.owner.collab.forProject(t.p.id).remove(joined.id);
    expect(await t.owner.db.comments.count()).toBe(0);
  });
});

describe('changes to text, one at a time', () => {
  const base = doc('One.', 'Two.', 'Three.', 'Four.');
  it('are found paragraph by paragraph', () => {
    const hunks = textHunks(base, doc('One.', 'Two, rewritten.', 'Three.', 'A new one.', 'Four.'));
    expect(hunks.map((h) => [h.at, textOf(h.remove), textOf(h.insert)])).toEqual([[1, 'Two.', 'Two, rewritten.'], [3, '', 'A new one.']]);
    expect(textHunks(base, base)).toEqual([]);
    expect(textHunks(base, doc('One.', 'Four.')).map((h) => [h.at, textOf(h.remove), textOf(h.insert)])).toEqual([[1, 'Two.\nThree.', '']]);
    expect(textHunks(doc(), doc('First words.')).map((h) => [h.at, h.before, textOf(h.insert)])).toEqual([[0, null, 'First words.']]);
    // The same change has the same id however many times it is worked out, so a verdict on it sticks.
    expect(textHunks(base, doc('One.', 'Two, rewritten.', 'Three.', 'Four.'))[0].id).toBe(hunks[0].id);
  });

  it('apply to the text as it is now, by what the paragraphs say', () => {
    const [edit, add] = textHunks(base, doc('One.', 'Two, rewritten.', 'Three.', 'A new one.', 'Four.'));
    // The author has since added a paragraph at the top and changed the last one.
    const now = doc('A prologue.', 'One.', 'Two.', 'Three.', 'Four, by the author.');
    expect(words(applyHunk(now, edit))).toEqual(['A prologue.', 'One.', 'Two, rewritten.', 'Three.', 'Four, by the author.']);
    expect(words(applyHunk(now, add))).toEqual(['A prologue.', 'One.', 'Two.', 'Three.', 'A new one.', 'Four, by the author.']);
    expect(words(applyHunk(applyHunk(now, edit)!, add))).toEqual(['A prologue.', 'One.', 'Two, rewritten.', 'Three.', 'A new one.', 'Four, by the author.']);
    expect(words(now)).toEqual(['A prologue.', 'One.', 'Two.', 'Three.', 'Four, by the author.']);
  });

  it('refuse to overwrite a passage the author has rewritten since', () => {
    const [edit] = textHunks(base, doc('One.', 'Two, rewritten.', 'Three.', 'Four.'));
    expect(applyHunk(doc('One.', 'Two, as the author now has it.', 'Three.', 'Four.'), edit)).toBeNull();
    // Already made (accepted before, or the author did the same): nothing to do, and no harm.
    const done = doc('One.', 'Two, rewritten.', 'Three.', 'Four.');
    expect(applyHunk(done, edit)).toBe(done);
    const [add] = textHunks(base, doc('One.', 'Two.', 'Inserted.', 'Three.', 'Four.'));
    expect(applyHunk(doc('One.', 'Three.', 'Four.'), add)).toBeNull();
  });
});

describe('OWNER FINAL AUTHORITY RULE: suggestions', () => {
  it('track an editor’s changes to a chapter without touching the manuscript, until an author rules on each', async () => {
    const t = await team();
    const editor = t.editor.collab.forProject(t.p.id);
    const found = (await t.editor.db.chapterContents.get(t.one.id))!.doc;
    const wanted = doc('It began in ash and silence.', 'Nobody ran.', 'A dog barked.', 'The bell rang.');
    const made = (await editor.saveTextSuggestion(t.one.id, found, doc('It began in ash and silence.', 'Nobody ran.', 'The bell rang.')))!;
    expect((await editor.saveTextSuggestion(t.one.id, found, wanted))!.id).toBe(made.id);
    expect((await editor.myTextSuggestion(t.one.id))!.id).toBe(made.id);
    expect(words((await t.editor.db.chapterContents.get(t.one.id))!.doc)).toEqual(['It began in ash.', 'Nobody ran.', 'The bell rang.']);
    await t.settle(t.editor, t.owner);
    expect(words((await t.owner.db.chapterContents.get(t.one.id))!.doc)).toEqual(['It began in ash.', 'Nobody ran.', 'The bell rang.']);

    // Meanwhile the owner has kept writing.
    await t.owner.manuscript.forProject(t.p.id).saveDoc(t.one.id, doc('It began in ash.', 'Nobody ran.', 'The bell rang.', 'Then nothing.'), metrics);
    const owner = t.owner.collab.forProject(t.p.id);
    const [suggestion] = await owner.suggestions(t.one.id);
    expect(suggestion).toMatchObject({ authorName: 'David', authorRole: 'editor', status: 'pending', targetLabel: 'Chapter 1' });
    const [first, second] = openHunks(suggestion);
    expect([textOf(first.insert), textOf(second.insert)]).toEqual(['It began in ash and silence.', 'A dog barked.']);
    await expect(editor.decideHunk(suggestion.id, first.id, 'accepted')).rejects.toThrow(/Only an author/);

    await owner.decideHunk(suggestion.id, first.id, 'accepted');
    expect(words((await t.owner.db.chapterContents.get(t.one.id))!.doc)).toEqual(['It began in ash and silence.', 'Nobody ran.', 'The bell rang.', 'Then nothing.']);
    expect((await t.owner.db.suggestions.get(suggestion.id))!).toMatchObject({ status: 'pending', decidedBy: null });
    await owner.decideHunk(suggestion.id, second.id, 'rejected');
    const settled = (await t.owner.db.suggestions.get(suggestion.id))!;
    expect(settled).toMatchObject({ status: 'accepted', decidedBy: 'Raciel' });
    expect(Object.values(settled.decisions).map((d) => [d.verdict, d.byName])).toEqual([['accepted', 'Raciel'], ['rejected', 'Raciel']]);
    expect(isOpen(settled)).toBe(false);
    expect(words((await t.owner.db.chapterContents.get(t.one.id))!.doc)).toEqual(['It began in ash and silence.', 'Nobody ran.', 'The bell rang.', 'Then nothing.']);
    // What it replaced is in the chapter's history, under the name of whoever had written it.
    const history = await t.owner.db.chapterRevisions.where('nodeId').equals(t.one.id).toArray();
    expect(history.some((r) => words(r.doc)[0] === 'It began in ash.' && (r as unknown as { by: { name: string } }).by.name === 'Raciel')).toBe(true);

    await t.settle(t.owner, t.editor);
    expect(words((await t.editor.db.chapterContents.get(t.one.id))!.doc)).toEqual(['It began in ash and silence.', 'Nobody ran.', 'The bell rang.', 'Then nothing.']);
    expect(await editor.myTextSuggestion(t.one.id)).toBeNull();
    // An editor cannot hand themselves a verdict, even past their own device's check.
    expect(refusal('editor', t.editor.me.id, `suggestions:${suggestion.id}`, { ...settled, status: 'pending', decisions: {} }, { ...settled, status: 'accepted' })).toMatch(/Only an author/);
    expect(refusal('editor', t.editor.me.id, 'suggestions:new', null, { id: 'new', authorId: t.editor.me.id, status: 'accepted', decisions: {} })).not.toBeNull();
    expect(refusal('reader', 'r', 'suggestions:new', null, { id: 'new', authorId: 'r', status: 'pending', decisions: {} })).toMatch(/does not suggest/);
  });

  it('will not apply a change over text the author has rewritten since', async () => {
    const t = await team();
    const found = (await t.editor.db.chapterContents.get(t.one.id))!.doc;
    await t.editor.collab.forProject(t.p.id).saveTextSuggestion(t.one.id, found, doc('It began in ash.', 'Nobody ran, at first.', 'The bell rang.'));
    await t.settle(t.editor, t.owner);
    await t.owner.manuscript.forProject(t.p.id).saveDoc(t.one.id, doc('It began in ash.', 'Everybody ran.', 'The bell rang.'), metrics);
    const owner = t.owner.collab.forProject(t.p.id);
    const [suggestion] = await owner.suggestions(t.one.id);
    await expect(owner.decideHunk(suggestion.id, openHunks(suggestion)[0].id, 'accepted')).rejects.toThrow(/rewritten since/);
    expect(words((await t.owner.db.chapterContents.get(t.one.id))!.doc)[1]).toBe('Everybody ran.');
    expect(isOpen((await t.owner.db.suggestions.get(suggestion.id))!)).toBe(true);
  });

  it('withdraw when the text is put back as it was found', async () => {
    const t = await team();
    const editor = t.editor.collab.forProject(t.p.id);
    const found = (await t.editor.db.chapterContents.get(t.one.id))!.doc;
    await editor.saveTextSuggestion(t.one.id, found, doc('Changed.'));
    expect(await t.editor.db.suggestions.count()).toBe(1);
    expect(await editor.saveTextSuggestion(t.one.id, found, found)).toBeNull();
    expect(await t.editor.db.suggestions.count()).toBe(0);
    await expect(t.reader.collab.forProject(t.p.id).saveTextSuggestion(t.one.id, found, doc('Changed.'))).rejects.toThrow(/does not suggest/);
  });

  it('propose an edit to a character without changing them: “Level 35” stays until the owner says otherwise', async () => {
    const t = await team();
    const editor = t.editor.collab.forProject(t.p.id);
    await editor.suggestFields(t.marcus.id, [{ field: 'field:Level', label: 'Level', from: '35', to: '37' }, { field: 'summary', label: 'Short summary', from: 'A smith.', to: 'A master smith.' }, { field: 'name', label: 'Name', from: 'Marcus', to: 'Marcus' }], 'He levels up in chapter 9.');
    const second = await editor.suggestFields(t.marcus.id, [{ field: 'description', label: 'Detailed description', from: '', to: 'Tall.' }]);
    await expect(editor.suggestFields(t.marcus.id, [{ field: 'name', label: 'Name', from: 'Marcus', to: 'Marcus' }])).rejects.toThrow('Change something first.');
    await t.settle(t.editor, t.owner);
    const entry = async (who: Person) => (await who.db.loreEntries.get(t.marcus.id))!;
    expect((await entry(t.owner)).fields[0].value).toBe('35');
    const owner = t.owner.collab.forProject(t.p.id);
    const [first] = await owner.suggestions(t.marcus.id);
    expect(first).toMatchObject({ kind: 'fields', authorName: 'David', note: 'He levels up in chapter 9.', status: 'pending' });
    expect(first.changes!.map((c) => c.label)).toEqual(['Level', 'Short summary']);
    await expect(t.coauthor.collab.forProject(t.p.id).decideFields('missing', 'accepted')).rejects.toThrow();
    await owner.decideFields(first.id, 'accepted');
    await owner.decideFields(second.id, 'rejected');
    expect(await entry(t.owner)).toMatchObject({ summary: 'A master smith.', description: '', notes: 'He dies in book three.' });
    expect((await entry(t.owner)).fields[0]).toMatchObject({ key: 'Level', value: '37' });
    await expect(owner.decideFields(first.id, 'rejected')).rejects.toThrow(/already been settled/);
    await t.settle(t.owner, t.editor);
    expect((await entry(t.editor)).fields[0].value).toBe('37');
    expect((await t.editor.db.suggestions.toArray()).map((s) => [s.status, s.decidedBy]).sort()).toEqual([['accepted', 'Raciel'], ['rejected', 'Raciel']]);
  });
});

describe('the record of who did what', () => {
  it('attributes each change to the person who made it, across devices', async () => {
    const t = await team();
    await t.coauthor.manuscript.forProject(t.p.id).saveDoc(t.two.id, doc('The second day.', 'More.'), metrics);
    await t.coauthor.manuscript.forProject(t.p.id).saveDoc(t.two.id, doc('The second day.', 'More still.'), metrics);
    await t.coauthor.codex.forProject(t.p.id).update(t.marcus.id, { summary: 'A master smith.' });
    await t.editor.collab.forProject(t.p.id).comment({ kind: 'chapter', chapterId: t.two.id }, 'Good.');
    await t.owner.codex.forProject(t.p.id).update(t.marcus.id, { description: 'Broad.' });
    for (const who of [t.owner, t.coauthor, t.editor]) await who.guard.flush();
    await t.settle(t.coauthor, t.editor, t.owner, t.coauthor, t.editor);
    const lines = (await t.owner.collab.forProject(t.p.id).activity()).map((a) => `${a.actorName} ${a.verb} ${a.label}${a.count > 1 ? ` ×${a.count}` : ''}`);
    expect(lines).toEqual(expect.arrayContaining(['Sarah edited Chapter 2 ×2', "Sarah updated Marcus's profile", 'David commented on Chapter 2', "Raciel updated Marcus's profile ×2"]));
    // The same record on every device that may see it, and not on the others.
    const sameOn = async (who: Person) => (await who.collab.forProject(t.p.id).activity()).map((a) => a.id).sort();
    expect(await sameOn(t.editor)).toEqual(await sameOn(t.owner));
    expect(await sameOn(t.coauthor)).toEqual(await sameOn(t.owner));
    await t.settle(t.reader, t.viewer);
    expect(await t.reader.db.activity.count()).toBe(0);
    expect(await t.viewer.db.activity.count()).toBe(0);
    // Text carries the name of whoever last saved it.
    expect((await t.owner.db.chapterContents.get(t.two.id)) as unknown as { by: { name: string } }).toMatchObject({ by: { name: 'Sarah' } });
    // Nobody can write a line in someone else's name, or rewrite one.
    expect(refusal('editor', 'e', 'activity:a', null, { id: 'a', actorId: 'someone-else' })).not.toBeNull();
    expect(refusal('coauthor', 'c', 'activity:a', { id: 'a', actorId: 'owner' }, { id: 'a', actorId: 'c' })).not.toBeNull();
    expect(refusal('editor', 'e', 'activity:a', null, { id: 'a', actorId: 'e' })).toBeNull();
  });

  it('does not get in the way of recovering a draft whose chapter moved on (a version saved without the text beside it)', async () => {
    const t = await team();
    const m = t.owner.manuscript.forProject(t.p.id);
    await m.saveDraft(t.one.id, doc('Typed in another tab.'), 99);
    const opened = await m.openDoc(t.one.id);
    expect(opened.recovered).toBeNull();
    expect((await t.owner.db.chapterRevisions.where('nodeId').equals(t.one.id).toArray()).some((r) => r.reason === 'recovery')).toBe(true);
  });

  it('does not record what merely arrived from the cloud, or a bulk copy, as someone’s doing', async () => {
    const t = await team();
    for (const who of [t.owner, t.coauthor]) await who.guard.flush();
    await t.settle(t.owner, t.coauthor);
    const before = await t.coauthor.db.activity.count();
    await t.owner.codex.forProject(t.p.id).update(t.marcus.id, { summary: 'Changed by the owner.' });
    await t.owner.guard.flush();
    await t.settle(t.owner, t.coauthor);
    await t.coauthor.guard.flush();
    const after = await t.coauthor.db.activity.toArray();
    // One more line (the owner's coalesces with their earlier edit of the same entry): none of them Sarah's.
    expect(after.length).toBe(before);
    expect(after.find((a) => a.label === "Marcus's profile" && a.verb === 'updated')).toMatchObject({ actorName: 'Raciel', count: 2 });
    expect(after.filter((a) => a.actorName === 'Sarah')).toEqual([]);
    const copy = await t.owner.guard.quietly(() => t.owner.projects.duplicate(t.p.id));
    await t.owner.guard.flush();
    expect(await t.owner.db.activity.where('projectId').equals(copy.id).count()).toBe(0);
    expect(await t.owner.db.comments.where('projectId').equals(copy.id).count()).toBe(0);
    expect(await t.owner.db.members.where('projectId').equals(copy.id).count()).toBe(0);
  });
});
