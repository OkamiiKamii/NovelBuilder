import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { registerCollab, targetKeyOf } from '@/modules/collab/service';
import type { Activity, Comment, Suggestion } from '@/modules/collab/types';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { createProjectService } from './service';

/**
 * STABLE IDENTITY
 * A record's id is what everything else holds on to. It never changes when
 * the record is renamed or moved, and every place that holds it is carried
 * along when a project is copied, imported or forked.
 */

let n = 0;

async function world() {
  const db = new NovelDB(`identity-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerCharacters(registry);
  registerCollab(registry);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const codex = createCodexService(db, projects.contentChanged);
  const relationships = createRelationshipService(db, projects.contentChanged);
  const timeline = createTimelineService(db, projects.contentChanged);
  const plot = createPlotService(db, projects.contentChanged);
  const characters = createCharacterService(db, codex, projects.contentChanged);
  const p = await projects.create({ title: 'Ashfall' });
  return { db, projects, manuscript, codex, relationships, timeline, plot, characters, p };
}

describe('renaming and reordering never changes an id', () => {
  it('keeps chapter and scene ids through renames, nudges and moves, and links still resolve', async () => {
    const { manuscript, codex, plot, timeline, p } = await world();
    const ms = manuscript.forProject(p.id);
    const one = await ms.create('chapter', null, 'One');
    const two = await ms.create('chapter', null, 'Two');
    const scene = await ms.create('scene', one.id, 'The gate');
    const mira = await codex.forProject(p.id).create('character', 'Mira');
    const thread = await plot.forProject(p.id).create('The heir');
    await plot.forProject(p.id).addBeat(thread.id, { nodeId: scene.id, title: 'Found' });
    const event = await timeline.forProject(p.id).create('The siege');
    await timeline.forProject(p.id).update(event.id, { nodeIds: [scene.id], characters: [{ id: mira.id, age: null }] });

    await ms.update(scene.id, { title: 'The broken gate' });
    await ms.update(one.id, { title: 'Arrival' });
    await ms.nudge(two.id, -1);
    await ms.move(scene.id, two.id);

    const tree = await ms.list();
    expect(tree.map((node) => node.id).sort()).toEqual([one.id, two.id, scene.id].sort());
    const moved = tree.find((node) => node.id === scene.id)!;
    expect(moved).toMatchObject({ title: 'The broken gate', parentId: two.id });
    // The order changed; the ids that point at the scene did not need to.
    expect(tree.find((node) => node.id === two.id)!.order).toBeLessThan(tree.find((node) => node.id === one.id)!.order);
    expect((await plot.forProject(p.id).get(thread.id))!.beats[0].nodeId).toBe(scene.id);
    expect((await timeline.forProject(p.id).get(event.id))!.nodeIds).toEqual([scene.id]);
  });

  it('keeps entry, event, thread and relationship ids through renames, and every link follows the new name', async () => {
    const { codex, relationships, timeline, plot, p } = await world();
    const lore = codex.forProject(p.id);
    const mira = await lore.create('character', 'Mira');
    const orrin = await lore.create('character', 'Orrin');
    const keep = await lore.create('location', 'The Keep');
    await lore.link(mira.id, keep.id, 'Lives at');
    const relation = await relationships.forProject(p.id).create(mira.id, orrin.id);
    const event = await timeline.forProject(p.id).create('The siege');
    await timeline.forProject(p.id).update(event.id, { locationId: keep.id, characters: [{ id: mira.id, age: 19 }] });
    const thread = await plot.forProject(p.id).create('The heir');
    await plot.forProject(p.id).update(thread.id, { characterIds: [mira.id], locationIds: [keep.id] });

    await lore.update(mira.id, { name: 'Mira Vale' });
    await lore.update(keep.id, { name: 'Ashkeep' });
    await timeline.forProject(p.id).update(event.id, { name: 'The long siege' });
    await plot.forProject(p.id).update(thread.id, { title: 'The lost heir' });

    expect((await lore.list()).map((e) => [e.id, e.name]).sort()).toEqual([[mira.id, 'Mira Vale'], [orrin.id, 'Orrin'], [keep.id, 'Ashkeep']].sort());
    expect((await lore.links()).map((l) => [l.fromId, l.toId])).toEqual([[mira.id, keep.id]]);
    expect((await relationships.forProject(p.id).get(relation.id))!).toMatchObject({ fromId: mira.id, toId: orrin.id });
    expect((await timeline.forProject(p.id).get(event.id))!).toMatchObject({ id: event.id, name: 'The long siege', locationId: keep.id, characters: [{ id: mira.id, age: 19 }] });
    expect((await plot.forProject(p.id).get(thread.id))!).toMatchObject({ id: thread.id, title: 'The lost heir', characterIds: [mira.id], locationIds: [keep.id] });
  });
});

describe('ids held inside rows are carried into copies', () => {
  it('moves a character’s tie statuses to the copied links, on duplicate and on import', async () => {
    const { db, projects, codex, characters, p } = await world();
    const lore = codex.forProject(p.id);
    const mira = await lore.create('character', 'Mira');
    const orrin = await lore.create('character', 'Orrin');
    await lore.link(mira.id, orrin.id, 'Sister');
    const [link] = await lore.links();
    await characters.forProject(p.id).setLinkStatus(mira.id, link.id, 'Estranged');

    const statusesIn = async (projectId: string) => {
      const [copyLink] = await db.loreLinks.where('projectId').equals(projectId).toArray();
      const copyMira = (await db.loreEntries.where('projectId').equals(projectId).toArray()).find((e) => e.name === 'Mira')!;
      const profile = (await db.characterProfiles.where('entryId').equals(copyMira.id).toArray())[0];
      return { linkId: copyLink.id, statuses: profile.linkStatus };
    };

    const copy = await projects.duplicate(p.id);
    const duplicated = await statusesIn(copy.id);
    expect(duplicated.linkId).not.toBe(link.id);
    expect(duplicated.statuses).toEqual({ [duplicated.linkId]: 'Estranged' });

    const imported = await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id))));
    const fromFile = await statusesIn(imported.id);
    expect(fromFile.statuses).toEqual({ [fromFile.linkId]: 'Estranged' });
  });

  it('keeps conversations, proposals and the record of who did what pointing at the restored project', async () => {
    const { db, projects, manuscript, codex, plot, p } = await world();
    const chapter = await manuscript.forProject(p.id).create('chapter', null, 'One');
    const mira = await codex.forProject(p.id).create('character', 'Mira');
    const thread = await plot.forProject(p.id).create('The heir');
    const now = Date.now();
    const member = { id: 'm-sarah', projectId: p.id, name: 'Sarah', email: '', role: 'editor' as const, status: 'active' as const, createdAt: now, joinedAt: now, lastSyncAt: null, updatedAt: now };
    const base = { projectId: p.id, threadAuthorId: member.id, targetLabel: '', kind: 'comment' as const, body: 'Hm.', authorId: member.id, authorName: 'Sarah', authorRole: 'editor' as const, status: 'open' as const, resolvedBy: null, resolvedAt: null, createdAt: now, updatedAt: now };
    const root: Comment = { ...base, id: 'c-root', threadId: 'c-root', parentId: null, target: { kind: 'entry', entryId: mira.id }, targetKey: targetKeyOf({ kind: 'entry', entryId: mira.id }), converted: { kind: 'beat', label: 'A development', to: `/project/${p.id}/plot`, by: 'Sarah', at: now } };
    const reply: Comment = { ...base, id: 'c-reply', threadId: 'c-root', parentId: 'c-root', target: root.target, targetKey: root.targetKey, authorId: 'owner' };
    const onText: Comment = { ...base, id: 'c-text', threadId: 'c-text', parentId: null, target: { kind: 'text', chapterId: chapter.id, quote: 'gate', block: 0, offset: 4 }, targetKey: `chapter:${chapter.id}` };
    const onThread: Comment = { ...base, id: 'c-thread', threadId: 'c-thread', parentId: null, target: { kind: 'thread', threadId: thread.id }, targetKey: `thread:${thread.id}` };
    const suggestion: Suggestion = { id: 's-1', projectId: p.id, kind: 'fields', targetId: mira.id, targetLabel: 'Mira', authorId: member.id, authorName: 'Sarah', authorRole: 'editor', note: '', status: 'accepted', decisions: { all: { verdict: 'accepted', by: member.id, byName: 'Sarah', at: now } }, decidedBy: 'Sarah', decidedAt: now, createdAt: now, updatedAt: now };
    const activity: Activity = { id: 'a-1', projectId: p.id, at: now, actorId: member.id, actorName: 'Sarah', actorRole: 'editor', verb: 'edited', table: 'chapters', rowId: chapter.id, label: 'One', count: 1 };
    // What a line is about may also be a comment's target, or a part of a suggestion.
    const onTarget: Activity = { ...activity, id: 'a-2', verb: 'commented on', table: 'comments', rowId: `chapter:${chapter.id}` };
    const onPart: Activity = { ...activity, id: 'a-3', verb: 'accepted a change in', table: 'suggestions', rowId: 's-1:h1' };
    await db.members.add(member);
    await db.comments.bulkAdd([root, reply, onText, onThread]);
    await db.suggestions.add(suggestion);
    await db.activity.bulkAdd([activity, onTarget, onPart]);
    // The text is signed by whoever wrote it.
    await db.chapterContents.put({ id: chapter.id, projectId: p.id, doc: { type: 'doc', content: [] }, rev: 1, updatedAt: now, by: { id: member.id, name: 'Sarah' } } as never);

    // Conversations travel only with a full archive; a plain copy starts without them.
    const copy = await projects.duplicate(p.id);
    expect(await db.comments.where('projectId').equals(copy.id).count()).toBe(0);

    const restored = await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))));
    const of = <T,>(table: string) => db.table<T>(table).where('projectId').equals(restored.id).toArray();
    const [newChapter] = await of<{ id: string }>('chapters');
    const newMira = (await of<{ id: string; name: string }>('loreEntries')).find((e) => e.name === 'Mira')!;
    const [newThread] = await of<{ id: string }>('plotThreads');
    const [newMember] = await of<{ id: string }>('members');
    const comments = await of<Comment>('comments');
    const byBody = (kind: string) => comments.find((c) => c.target.kind === kind && c.parentId === null)!;
    const newRoot = byBody('entry');
    const newReply = comments.find((c) => c.parentId !== null)!;

    expect(newMember.id).not.toBe(member.id);
    expect(newRoot).toMatchObject({ threadId: newRoot.id, threadAuthorId: newMember.id, authorId: newMember.id, target: { kind: 'entry', entryId: newMira.id }, targetKey: `entry:${newMira.id}` });
    expect(newRoot.converted!.to).toBe(`/project/${restored.id}/plot`);
    expect(newReply).toMatchObject({ threadId: newRoot.id, parentId: newRoot.id, authorId: 'owner' });
    expect(byBody('text')).toMatchObject({ target: { kind: 'text', chapterId: newChapter.id, quote: 'gate', block: 0, offset: 4 }, targetKey: `chapter:${newChapter.id}` });
    expect(byBody('thread')).toMatchObject({ target: { kind: 'thread', threadId: newThread.id }, targetKey: `thread:${newThread.id}` });
    const [newSuggestion] = await of<Suggestion>('suggestions');
    expect(newSuggestion).toMatchObject({ targetId: newMira.id, authorId: newMember.id, decidedBy: 'Sarah', decisions: { all: { by: newMember.id, byName: 'Sarah' } } });
    const lines = new Map((await of<Activity>('activity')).map((a) => [a.verb, a]));
    expect(lines.get('edited')).toMatchObject({ actorId: newMember.id, rowId: newChapter.id });
    expect(lines.get('commented on')!.rowId).toBe(`chapter:${newChapter.id}`);
    expect(lines.get('accepted a change in')!.rowId).toBe(`${newSuggestion.id}:h1`);
    // A restored text is still signed by whoever wrote it, as a member of the restored team.
    expect(((await db.chapterContents.get(newChapter.id)) as unknown as { by: unknown }).by).toEqual({ id: newMember.id, name: 'Sarah' });
    // The original project is untouched.
    expect((await db.comments.get('c-root'))!.target).toEqual({ kind: 'entry', entryId: mira.id });
  });
});
