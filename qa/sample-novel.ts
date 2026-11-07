import { codex, collabGuard, connections, db, histories, manuscript, places, plot, projects, relationships, systems, timeline, tracker } from '@/core';
import { measure } from '@/modules/manuscript/metrics';
import type { EventDate } from '@/modules/timeline/types';

/**
 * QA SAMPLE NOVEL: TEST DATA ONLY
 *
 * A small, made-up novel for checking that the app's views agree with one
 * another. It is not part of the app: nothing under `src/` imports this
 * folder, so it is never in a build, and the app never creates or imports it
 * on its own. A developer can import `qa/qa-sample.novel.json` on purpose
 * (Library → Import), and delete it again like any novel (Settings → Delete).
 *
 * Every record is made through the app's own services, as an author would
 * make it through the pages, so the file holds records exactly as the app
 * stores them. `npm run qa:sample` writes the file again from this builder.
 *
 * What it holds, so each view has something to show:
 *  - five characters, a faction and an item;
 *  - places in a hierarchy (region → city → building) with levels;
 *  - two acts, six chapters (two scenes in Ch 3), four with words, two still to write;
 *  - seven events: two at the same moment in different places (parallel),
 *    one long before the story told late as a flashback (and foreshadowed early);
 *  - four relationships, two of which change over the story;
 *  - one plot thread, introduced, developed and resolved;
 *  - an ability tree (a blueprint with branches and a mutual exclusion),
 *    held on sheets and gained over the story;
 *  - an alternate history that changes one event and adds another.
 */

/** Names the tests look records up by: an import gives every record a new id, but keeps its name. */
export const SAMPLE = {
  title: 'QA Sample: The Glass Meridian (test data)',
  characters: { ilse: 'Ilse Varn', corin: 'Corin Ashe', tamsin: 'Tamsin Roe', hale: 'Odo Hale', wren: 'Wren Varn' },
  places: { coast: 'The Meridian Coast', calder: 'Port Calder', archive: 'The Glass Archive', hall: 'Council Hall', hills: 'The Hill Country', house: 'Ashe House' },
  faction: 'The Glasswrights’ Guild',
  item: 'The Ledger of Tides',
  acts: ['Act I: The Archive', 'Act II: The Hill Country'],
  chapters: ['Salt and Glass', 'The Guild Mark', 'The Night of Two Doors', 'Roads Inland', 'Ashe House', 'What the Fire Kept'],
  scenes: ['At the Archive', 'At the Council'],
  events: { fire: 'The fire at Ashe House', joins: 'Ilse joins the Guild', heist: 'The heist at the Glass Archive', vote: 'The council vote', flight: 'Flight inland', returns: 'Return to Ashe House', read: 'The ledger is read' },
  thread: 'The stolen ledger',
  system: 'Glasswork',
  abilities: { read: 'Read the Glass', step: 'Glass Step', mirror: 'Mirror Walk', shatter: 'Shatter' },
  history: 'If the vote had failed',
  removed: 'Hale is removed from office',
} as const;

const day = (year: number, month: number, d: number): EventDate => ({ precision: 'exact', year, month, day: d, hour: null, minute: null });

type Run = string | { text: string; entryId: string };
/** A chapter's text as the editor stores it, with names linked to their codex entries where the author would link them. */
function chapterText(...paragraphs: Run[][]) {
  const doc = {
    type: 'doc',
    content: paragraphs.map((runs) => ({ type: 'paragraph', content: runs.map((r) => (typeof r === 'string' ? { type: 'text', text: r } : { type: 'text', text: r.text, marks: [{ type: 'entityLink', attrs: { entryId: r.entryId } }] })) })),
  };
  const metrics = measure(paragraphs.map((runs) => runs.map((r) => (typeof r === 'string' ? r : r.text)).join('')));
  return { doc, metrics: { words: metrics.words, characters: metrics.characters } };
}

/** Makes the sample novel in the app's database, through its services. Returns the new novel's id. */
export async function buildSampleNovel(): Promise<string> {
  // An import arrives whole, not as anyone's edits; so does this: no "who changed what" is recorded for it.
  return collabGuard.quietly(async () => {
    const project = await projects.create({
      title: SAMPLE.title,
      synopsis: 'Test data for checking the app’s views, made by qa/sample-novel.ts. Not a real novel: safe to delete (Settings → Delete).',
      tags: ['qa-sample', 'test data'],
      status: 'drafting',
      primaryGenre: 'Fantasy',
    });
    const pid = project.id;
    const ms = manuscript.forProject(pid);
    const cx = codex.forProject(pid);
    const tl = timeline.forProject(pid);
    const pl = plot.forProject(pid);
    const rel = relationships.forProject(pid);
    const con = connections.forProject(pid);
    const pla = places.forProject(pid);
    const sys = systems.forProject(pid);
    const track = tracker.forProject(pid);
    const hist = histories.forProject(pid);

    // The cast, a faction and an item.
    const c = SAMPLE.characters;
    const ilse = await cx.create('character', c.ilse);
    const corin = await cx.create('character', c.corin);
    const tamsin = await cx.create('character', c.tamsin);
    const hale = await cx.create('character', c.hale);
    const wren = await cx.create('character', c.wren);
    await cx.update(ilse.id, { summary: 'A glass-reader from Port Calder; the point of view of most chapters.' });
    await cx.update(corin.id, { summary: 'Master glasswright, Ilse’s teacher.' });
    await cx.update(tamsin.id, { summary: 'A thief, first Ilse’s rival, then her friend.' });
    await cx.update(hale.id, { summary: 'The magistrate who holds the ledger.' });
    await cx.update(wren.id, { summary: 'Ilse’s younger brother.' });
    const guild = await cx.create('faction', SAMPLE.faction);
    const ledger = await cx.create('item', SAMPLE.item);

    // Places, in a hierarchy with levels.
    const p = SAMPLE.places;
    const coast = await cx.create('location', p.coast);
    const calder = await cx.create('location', p.calder);
    const archive = await cx.create('location', p.archive);
    const hall = await cx.create('location', p.hall);
    const hills = await cx.create('location', p.hills);
    const house = await cx.create('location', p.house);
    const settings = await pla.setLevels([{ name: 'Region' }, { name: 'City' }, { name: 'Building' }]);
    const [region, city, building] = settings.levels;
    for (const [entry, level] of [[coast, region], [hills, region], [calder, city], [archive, building], [hall, building], [house, building]] as const) await pla.setLevel(entry.id, level.id);
    await pla.setParent(calder.id, coast.id);
    await pla.setParent(archive.id, calder.id);
    await pla.setParent(hall.id, calder.id);
    await pla.setParent(house.id, hills.id);

    // The manuscript: two acts, six chapters; Ch 3 in two scenes. Ch 1–4 have words; Ch 5 and 6 are planned, not written.
    const [act1, act2] = [await ms.create('act', null, SAMPLE.acts[0]), await ms.create('act', null, SAMPLE.acts[1])];
    const t = SAMPLE.chapters;
    const ch1 = await ms.create('chapter', act1.id, t[0]);
    const ch2 = await ms.create('chapter', act1.id, t[1]);
    const ch3 = await ms.create('chapter', act1.id, t[2]);
    const atArchive = await ms.create('scene', ch3.id, SAMPLE.scenes[0]);
    const atCouncil = await ms.create('scene', ch3.id, SAMPLE.scenes[1]);
    const ch4 = await ms.create('chapter', act2.id, t[3]);
    const ch5 = await ms.create('chapter', act2.id, t[4]);
    const ch6 = await ms.create('chapter', act2.id, t[5]);
    const link = (entry: { id: string }, text: string) => ({ text, entryId: entry.id });
    const write = async (nodeId: string, ...paragraphs: Run[][]) => {
      const { doc, metrics } = chapterText(...paragraphs);
      await ms.saveDoc(nodeId, doc, metrics);
    };
    await write(ch1.id, ['The tide came in grey over ', link(calder, 'Port Calder'), ', and ', link(ilse, 'Ilse'), ' read it in the window glass before it reached the harbour wall.'], [link(wren, 'Wren'), ' asked her what she saw. She said rain, and a ledger, and a man who would want it back.'], ['Somewhere above the town, in the guild house, her old teacher was waiting for an answer she had not given.']);
    await write(ch2.id, [link(corin, 'Corin'), ' pressed the guild mark into the warm glass and handed it to her without a word.'], ['The burn on his wrist was older than she was. She had asked about it once, as a child, and he had looked at the hills and said nothing at all.'], [link(ilse, 'Ilse'), ' took the mark. From that night she was one of the ', link(guild, 'Glasswrights'), ', whatever came after.']);
    await write(atArchive.id, ['The Archive smelled of dust and lamp oil. ', link(tamsin, 'Tamsin'), ' had the door open before ', link(ilse, 'Ilse'), ' finished reading the lock.'], ['The ', link(ledger, 'Ledger of Tides'), ' was lighter than either of them had thought. They argued about who would carry it, and then ran.']);
    await write(atCouncil.id, ['Across the square, ', link(hale, 'Magistrate Hale'), ' counted the raised hands in ', link(hall, 'Council Hall'), ' and smiled at the number.'], ['He did not yet know the Archive stood open.']);
    await write(ch4.id, ['They left ', link(calder, 'Port Calder'), ' by the salt road before dawn. ', link(tamsin, 'Tamsin'), ' walked ahead; ', link(ilse, 'Ilse'), ' carried the ledger.'], ['By the third night they had stopped arguing. By the fourth they were friends, though neither said it.']);

    await ms.updatePlan(ch1.id, { appearIds: [ilse.id, wren.id], mentionIds: [corin.id], povIds: [ilse.id], objective: 'Ilse sees the ledger in the glass.' });
    await ms.updatePlan(ch2.id, { appearIds: [ilse.id, corin.id], povIds: [ilse.id], objective: 'Ilse joins the Guild.' });
    await ms.updatePlan(atArchive.id, { appearIds: [ilse.id, tamsin.id], povIds: [ilse.id], labels: ['action'] });
    await ms.updatePlan(atCouncil.id, { appearIds: [hale.id], povIds: [hale.id], labels: ['politics'] });
    await ms.updatePlan(ch4.id, { appearIds: [ilse.id, tamsin.id], mentionIds: [corin.id], povIds: [ilse.id], labels: ['journey'] });
    await ms.updatePlan(ch5.id, { appearIds: [ilse.id, corin.id, tamsin.id], povIds: [ilse.id], objective: 'Back at Ashe House; Corin and Ilse face the past.' });
    await ms.updatePlan(ch6.id, { appearIds: [ilse.id, corin.id], povIds: [corin.id], objective: 'The fire, remembered; the ledger read.' });

    // Events. The heist and the vote happen on the same night in different places; the fire happens long before the
    // story, is foreshadowed in Ch 2 and told as a flashback in Ch 6.
    const e = SAMPLE.events;
    const event = async (name: string, changes: Parameters<typeof tl.update>[1]) => {
      const made = await tl.create(name);
      await tl.update(made.id, changes);
      return made;
    };
    await event(e.fire, { when: day(800, 6, 12), importance: 'major', locationId: house.id, characters: [{ id: corin.id, age: 31 }, { id: ilse.id, age: 6 }], nodeIds: [ch2.id, ch6.id], reveals: [{ nodeId: ch2.id, role: 'foreshadowed' }, { nodeId: ch6.id, role: 'flashback' }] });
    await event(e.joins, { when: day(812, 3, 3), locationId: calder.id, characters: [{ id: ilse.id, age: 18 }, { id: corin.id, age: 43 }], entryIds: [guild.id], nodeIds: [ch2.id] });
    const heist = await event(e.heist, { when: day(812, 4, 9), importance: 'major', locationId: archive.id, characters: [{ id: ilse.id, age: 18 }, { id: tamsin.id, age: 19 }], entryIds: [ledger.id], nodeIds: [atArchive.id] });
    const vote = await event(e.vote, { when: day(812, 4, 9), locationId: hall.id, characters: [{ id: hale.id, age: 52 }], nodeIds: [atCouncil.id] });
    const flight = await event(e.flight, { when: day(812, 4, 12), duration: { amount: 4, unit: 'days' }, locationId: hills.id, characters: [{ id: ilse.id, age: 18 }, { id: tamsin.id, age: 19 }], entryIds: [ledger.id], nodeIds: [ch4.id] });
    await event(e.returns, { when: day(812, 4, 20), locationId: house.id, characters: [{ id: ilse.id, age: 18 }, { id: corin.id, age: 43 }, { id: tamsin.id, age: 19 }], nodeIds: [ch5.id] });
    const read = await event(e.read, { when: day(812, 4, 22), importance: 'climax', locationId: house.id, characters: [{ id: ilse.id, age: 18 }, { id: corin.id, age: 43 }], entryIds: [ledger.id], nodeIds: [ch6.id] });

    // The plot thread, and the events that belong to it.
    const thread = await pl.create(SAMPLE.thread);
    await pl.update(thread.id, { premise: 'Who wrote the Ledger of Tides, and why does Hale want it hidden?', category: 'main', status: 'active', characterIds: [ilse.id, tamsin.id, hale.id], locationIds: [archive.id], targetNodeId: ch6.id });
    await pl.addBeat(thread.id, { title: 'The ledger seen in the glass', nodeId: ch1.id, role: 'introduction' });
    await pl.addBeat(thread.id, { title: 'The heist', nodeId: atArchive.id, role: 'development' });
    await pl.addBeat(thread.id, { title: 'Carried inland', nodeId: ch4.id, role: 'development' });
    await pl.addBeat(thread.id, { title: 'The ledger is read', nodeId: ch6.id, role: 'resolution' });
    for (const ev of [heist, flight, read]) await tl.update(ev.id, { threadIds: [thread.id] });

    // Relationships: two change over the story, two hold throughout.
    const mentor = await rel.create(corin.id, ilse.id, 'mentor-student');
    await rel.updateStage(mentor.id, mentor.stages[0].id, { affinity: 'trusting', title: 'Teacher and pupil' });
    await rel.recordChange(mentor.id, { nodeId: ch5.id }, { affinity: 'reluctant', title: 'Old wounds', event: 'At Ashe House, Ilse learns what Corin never told her.' });
    await rel.recordChange(mentor.id, { nodeId: ch6.id }, { affinity: 'trusting', title: 'Reconciled', event: 'The fire, told at last.' });
    const rivals = await rel.create(ilse.id, tamsin.id, 'rivals');
    await rel.updateStage(rivals.id, rivals.stages[0].id, { affinity: 'reluctant', title: 'Two thieves, one lock' });
    await rel.recordChange(rivals.id, { nodeId: ch4.id }, { preset: 'friends', affinity: 'trusting', title: 'Friends on the salt road', event: 'Four nights on the road.' });
    const siblings = await rel.create(ilse.id, wren.id, 'siblings');
    await rel.updateStage(siblings.id, siblings.stages[0].id, { affinity: 'trusting' });
    const enemies = await rel.create(corin.id, hale.id, 'enemies');
    await rel.updateStage(enemies.id, enemies.stages[0].id, { affinity: 'hostile' });

    // Membership, from where it begins.
    await con.create({ from: { type: 'entry', id: corin.id }, to: { type: 'entry', id: guild.id }, type: 'member-of' });
    await con.create({ from: { type: 'entry', id: ilse.id }, to: { type: 'entry', id: guild.id }, type: 'member-of', validity: { from: { kind: 'node', nodeId: ch2.id }, until: null }, how: 'Given the guild mark.' });

    // The ability tree: Read the Glass branches into Glass Step (which evolves into Mirror Walk) and Shatter;
    // Shatter and Mirror Walk exclude each other.
    const a = SAMPLE.abilities;
    const system = await sys.create({
      name: SAMPLE.system,
      description: 'Reading and walking through glass.',
      variables: [],
      tracks: [],
      ranks: [{ id: 'novice', name: 'Novice' }, { id: 'adept', name: 'Adept' }, { id: 'master', name: 'Master' }],
      groups: [{ id: 'arts', name: 'Arts', single: false }],
      items: [
        { id: 'read', groupId: 'arts', name: a.read, description: 'See what a pane of glass has seen.', parentId: null, rankId: 'novice', requires: '', modifiers: [], costs: [], cooldown: '', affinity: 'glass', evolution: '' },
        { id: 'step', groupId: 'arts', name: a.step, description: 'Step from one window to another nearby.', parentId: 'read', rankId: 'adept', requires: '', modifiers: [], costs: [], cooldown: '', affinity: 'glass', evolution: 'Becomes Mirror Walk with mastery.' },
        { id: 'mirror', groupId: 'arts', name: a.mirror, description: 'Walk through any mirror to any other.', parentId: 'step', rankId: 'master', requires: '', modifiers: [], costs: [], cooldown: '', affinity: 'glass', evolution: '' },
        { id: 'shatter', groupId: 'arts', name: a.shatter, description: 'Break glass from a distance.', parentId: 'read', rankId: 'adept', requires: '', modifiers: [], costs: [], cooldown: '', affinity: 'glass', evolution: '' },
      ],
      matrices: [],
    });
    const item = (name: string) => system.items.find((i) => i.name === name)!.id;
    const ability = (name: string) => ({ type: 'ability' as const, id: `${system.id}/${item(name)}` });
    await con.create({ from: ability(a.step), to: ability(a.mirror), type: 'evolves-into' });
    await con.create({ from: ability(a.shatter), to: ability(a.mirror), type: 'excludes' });
    const ilseSheet = await sys.addSheet(system.id, ilse.id);
    await sys.updateSheet(ilseSheet.id, () => ({ itemIds: [item(a.read), item(a.step), item(a.mirror)] }));
    const corinSheet = await sys.addSheet(system.id, corin.id);
    await sys.updateSheet(corinSheet.id, () => ({ itemIds: [item(a.read), item(a.shatter)] }));
    const arts = await track.saveCategory(null, { name: 'Glasswork arts', shape: 'held', characterIds: [ilse.id, corin.id] });
    const gain = (entryId: string, name: string, at: Parameters<typeof track.record>[0]['at']) => track.record({ entryId, categoryId: arts.id, action: 'gain', abilityId: `${system.id}/${item(name)}`, at });
    await gain(ilse.id, a.read, null);
    await gain(ilse.id, a.step, { kind: 'node', nodeId: ch2.id });
    await gain(ilse.id, a.mirror, { kind: 'node', nodeId: ch6.id });
    await gain(corin.id, a.read, null);
    await gain(corin.id, a.shatter, null);

    // An alternate history: the vote fails, and Hale is removed the next day.
    const alt = await hist.create({ name: SAMPLE.history, kind: 'hypothetical', status: 'experimental', originEventId: vote.id, note: 'What if the council had voted against Hale?' });
    await hist.changeEvent(alt.id, vote.id, { name: 'The council vote fails', description: 'The raised hands fall short.' });
    const removed = await hist.addEvent(alt.id, SAMPLE.removed);
    await hist.updateAdded(alt.id, removed.id, { when: day(812, 4, 10), locationId: hall.id, characters: [{ id: hale.id, age: 52 }] });

    // Saving text logs writing sessions on the day it ran; they are about the person running this, not the story.
    await db.writingSessions.where('projectId').equals(pid).delete();
    return pid;
  });
}
