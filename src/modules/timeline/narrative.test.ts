import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { eventRecords } from '@/modules/model/events';
import { loadModel } from '@/modules/model/model';
import { createProjectService } from '@/modules/projects/service';
import { orderSummary, orderWords, ordinal, tellingNotes, twoOrders } from './narrative';
import { createTimelineService, registerTimeline } from './service';
import type { EventDate, EventReveal } from './types';

const year = (y: number): EventDate => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });

/**
 * "The Last Duel", told out of order on purpose:
 *   Prologue      the duel (Year 20), shown first as a flash-forward
 *   Childhood     childhood (Year 1)
 *   Training      training (Year 10); the betrayal foreshadowed; a rumour mentioned
 *   The Well      the mother's death (Year 0), as a flashback
 *   Betrayal      the betrayal (Year 15); the secret pact (Year 5) revealed afterwards
 *   The Duel      the duel again, told in full
 * and an aftermath (Year 21) not told in any chapter yet.
 */
async function lastDuel(roles: 'marked' | 'plain' = 'marked') {
  const db = new NovelDB(`narrative-${crypto.randomUUID()}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerTimeline(registry);
  const p = await projects.create({ title: 'The Last Duel' });
  const m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  const t = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const ch: Record<string, string> = {};
  for (const title of ['Prologue', 'Childhood', 'Training', 'The Well', 'Betrayal', 'The Duel']) ch[title] = (await m.create('chapter', null, title)).id;
  const ev: Record<string, string> = {};
  const event = async (name: string, when: EventDate, tellings: [string, EventReveal['role']][]) => {
    const e = await t.create(name);
    await t.update(e.id, { when, nodeIds: tellings.map(([c]) => ch[c]), reveals: roles === 'marked' ? tellings.map(([c, role]) => ({ nodeId: ch[c], role })) : [] });
    ev[name] = e.id;
  };
  await event('The duel', year(20), [['Prologue', 'flashforward'], ['The Duel', 'told']]);
  await event('Childhood', year(1), [['Childhood', 'told']]);
  await event('Training', year(10), [['Training', 'told']]);
  await event('The betrayal', year(15), [['Training', 'foreshadowed'], ['Betrayal', 'told']]);
  await event('A rumour', { precision: 'unknown' }, [['Training', 'mentioned']]);
  await event('Mother’s death', year(0), [['The Well', 'flashback']]);
  await event('The secret pact', year(5), [['Betrayal', 'revealed']]);
  await event('Aftermath', year(21), []);
  return { db, p, m, t, ch, ev, model: async () => (await loadModel(db, p.id))! };
}

describe('story order and reading order, a deliberately nonlinear book', () => {
  it('puts the events in story order and the chapters in reading order, side by side', async () => {
    const s = await lastDuel();
    const orders = twoOrders(await s.model());
    expect(orders.events.map((e) => [e.title, e.storyRank])).toEqual([
      ['Mother’s death', 0],
      ['Childhood', 1],
      ['The secret pact', 2],
      ['Training', 3],
      ['The betrayal', 4],
      ['The duel', 5],
      ['Aftermath', 6],
      ['A rumour', null],
    ]);
    expect(orders.placed).toBe(7);
    expect(orders.nodes.map((n) => [n.label, n.tellings.map((t) => t.role)])).toEqual([
      ['Ch 1: Prologue', ['flashforward']],
      ['Ch 2: Childhood', ['told']],
      ['Ch 3: Training', ['told', 'foreshadowed', 'mentioned']],
      ['Ch 4: The Well', ['flashback']],
      ['Ch 5: Betrayal', ['revealed', 'told']],
      ['Ch 6: The Duel', ['told']],
    ]);
    // One event, told twice: a glimpse in the prologue, the whole of it at the end.
    expect(orders.events.find((e) => e.title === 'The duel')!.tellings.map((t) => t.nodeId)).toEqual([s.ch.Prologue, s.ch['The Duel']]);
    expect(orders.events.find((e) => e.title === 'Aftermath')!.tellings).toEqual([]);
  });

  it('says where each telling steps out of the story told plainly, back or ahead', async () => {
    const s = await lastDuel();
    const model = await s.model();
    const orders = twoOrders(model);
    const name = (id: string) => model.events.get(id)!.name;
    expect(orders.tellings.map((t) => `${name(t.eventId)}: ${orderWords(t)}`)).toEqual([
      'The duel: goes ahead in time',
      'Childhood: in story order',
      'Training: in story order',
      'The betrayal: goes ahead in time',
      'A rumour: not placed in time yet',
      'Mother’s death: goes back in time',
      'The secret pact: goes back in time',
      'The betrayal: in story order',
      'The duel: in story order',
    ]);
    expect(orders.linear).toBe(false);
    expect(orderSummary(orders)).toBe('Not told in story order: 2 tellings go back in time, and 2 go ahead.');
    // Every telling is marked as what it is: nothing to suggest.
    expect(tellingNotes(orders, model)).toEqual([]);
  });

  it('when nothing is marked, suggests what might be a flashback or a flash-forward, and changes nothing', async () => {
    const s = await lastDuel('plain');
    const model = await s.model();
    const orders = twoOrders(model);
    expect(tellingNotes(orders, model).map((n) => n.note)).toEqual([
      '“Childhood” is told in Ch 2: Childhood, after “The duel” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?',
      '“Training” is told in Ch 3: Training, after “The duel” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?',
      '“The betrayal” is told in Ch 3: Training, after “The duel” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?',
      '“Mother’s death” is told in Ch 4: The Well, after “The duel” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?',
      '“The secret pact” is told in Ch 5: Betrayal, after “The duel” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?',
      '“The betrayal” is told in Ch 5: Betrayal, after “The duel” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?',
    ]);
    // Marking the prologue as a flash-forward is the author's call; here it is made, and most suggestions go.
    await s.t.update(s.ev['The duel'], { reveals: [{ nodeId: s.ch.Prologue, role: 'flashforward' }] });
    const after = await s.model();
    expect(tellingNotes(twoOrders(after), after).map((n) => after.events.get(n.telling.eventId)!.name)).toEqual(['Mother’s death', 'The secret pact']);
  });

  it('a book told in story order says so', async () => {
    const s = await lastDuel();
    for (const [name, chapter] of [['The duel', 'The Duel'], ['The betrayal', 'Betrayal'], ['Mother’s death', 'Childhood'], ['The secret pact', 'Training']] as const) {
      await s.t.update(s.ev[name], { nodeIds: [s.ch[chapter]], reveals: [] });
    }
    await s.t.update(s.ev['A rumour'], { nodeIds: [] });
    const orders = twoOrders(await s.model());
    expect(orders.linear).toBe(true);
    expect(orderSummary(orders)).toBe('Told in story order: the reader meets the events in the order they happen.');
    expect(ordinal(1) + ordinal(2) + ordinal(3) + ordinal(11) + ordinal(22) + ordinal(113)).toBe('1st2nd3rd11th22nd113th');
  });

  it('moving chapters changes only the reading order; reading never moves a chapter or an event', async () => {
    const s = await lastDuel();
    const rows = async () => ({ chapters: await s.db.chapters.where('projectId').equals(s.p.id).sortBy('order'), events: await s.db.timelineEvents.where('projectId').equals(s.p.id).sortBy('id') });
    const before = await rows();
    const model = await s.model();
    twoOrders(model);
    tellingNotes(twoOrders(model), model);
    eventRecords(model);
    expect(await rows()).toEqual(before);

    // The author moves the flashback chapter to the very start: now the book opens on the mother's death.
    await s.m.move(s.ch['The Well'], null, s.ch.Prologue);
    const movedModel = await s.model();
    const moved = twoOrders(movedModel);
    expect(moved.nodes[0].label).toBe('Ch 1: The Well');
    // Story order is exactly as it was.
    expect(moved.events.map((e) => [e.id, e.storyRank])).toEqual(twoOrders(model).events.map((e) => [e.id, e.storyRank]));
    // Told first, before the story told plainly begins, it no longer goes back.
    expect(moved.tellings.find((t) => t.eventId === s.ev['Mother’s death'])).toMatchObject({ back: false, ahead: false });
    expect(tellingNotes(moved, movedModel).map((n) => n.note)).toEqual(['“Mother’s death” is marked as a flashback in Ch 1: The Well, but the story told plainly has not got past it yet there.']);
    // And the events' own dates are untouched.
    expect((await s.db.timelineEvents.get(s.ev['Mother’s death']))!.when).toEqual(year(0));
  });
});
