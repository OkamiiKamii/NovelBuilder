import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { eventRecords } from '@/modules/model/events';
import { loadModel } from '@/modules/model/model';
import { select } from '@/modules/model/query';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { domainOf, layoutAxis } from './axis';
import { createTimelineService, registerTimeline } from './service';
import { arrange, decodeGrouping, encodeGrouping, groupings, moveTrack, NO_PREFS, readTracks, toggle, trackAddress, trackLayout, tracksFor, tracksFromLayout, UNLINKED, type Grouping } from './tracks';
import type { EventDate } from './types';

const exact = (year: number): EventDate => ({ precision: 'exact', year, month: null, day: null, hour: null, minute: null });
let n = 0;

async function story() {
  const db = new NovelDB(`tracks-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  for (const register of [registerCodex, registerTimeline, registerPlot]) register(registry);
  const p = await projects.create({ title: 'Ashfall' });
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  const timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const plot = createPlotService(db, projects.contentChanged).forProject(p.id);
  const connections = createConnectionService(db, projects.contentChanged).forProject(p.id);
  const ships = await codex.saveCategory(null, { name: 'Ships', singular: 'Ship' });
  const [mira, orrin, keep, wardens, gull] = [await codex.create('character', 'Mira'), await codex.create('character', 'Orrin'), await codex.create('location', 'The Keep'), await codex.create('faction', 'The Wardens'), await codex.create(ships.key, 'The Gull')];
  const heir = await plot.create('The heir');
  const event = async (name: string, year: number, changes: Parameters<typeof timeline.update>[1]) => {
    const e = await timeline.create(name);
    await timeline.update(e.id, { when: exact(year), ...changes });
    return e;
  };
  const siege = await event('The siege', 10, { characters: [{ id: mira.id, age: null }, { id: orrin.id, age: null }], locationId: keep.id, threadIds: [heir.id] });
  const voyage = await event('The voyage', 12, { characters: [{ id: mira.id, age: null }], entryIds: [gull.id] });
  const council = await event('The council', 14, {});
  await connections.create({ from: { type: 'event', id: council.id }, to: { type: 'entry', id: wardens.id }, type: 'caused' });
  return { db, p, mira, orrin, keep, wardens, gull, heir, siege, voyage, council, ships, model: async () => (await loadModel(db, p.id))! };
}

const summary = (tracks: { label: string; eventIds: string[] }[], names: Map<string, string>) => tracks.map((t) => [t.label, t.eventIds.map((id) => names.get(id)).sort()]);

describe('tracks', () => {
  it('puts an event on every track it is connected to, as one record, and keeps the rest on a track of their own', async () => {
    const s = await story();
    const model = await s.model();
    const events = eventRecords(model);
    const names = new Map(events.map((e) => [e.id, e.title]));
    const byCharacter = tracksFor(model, events, { kind: 'category', key: 'character' });
    expect(summary(byCharacter, names)).toEqual([
      ['Mira', ['The siege', 'The voyage']],
      ['Orrin', ['The siege']],
      ['Not linked to any character', ['The council']],
    ]);
    // The siege is on two tracks, and it is the same event: one id, one record in the model.
    expect(byCharacter.filter((t) => t.eventIds.includes(s.siege.id))).toHaveLength(2);
    expect([...model.events.keys()].filter((id) => id === s.siege.id)).toHaveLength(1);
    expect(byCharacter.at(-1)!.id).toBe(UNLINKED);
  });

  it('groups by places, factions, plot threads, or any kind of record the author made', async () => {
    const s = await story();
    const model = await s.model();
    const events = eventRecords(model);
    const names = new Map(events.map((e) => [e.id, e.title]));
    const by = (g: Grouping) => summary(tracksFor(model, events, g), names);
    expect(by({ kind: 'category', key: 'location' })).toEqual([['The Keep', ['The siege']], ['Not linked to any place', ['The council', 'The voyage']]]);
    expect(by({ kind: 'category', key: 'faction' })).toEqual([['The Wardens', ['The council']], ['Not linked to any faction / species', ['The siege', 'The voyage']]]);
    expect(by({ kind: 'thread' })).toEqual([['The heir', ['The siege']], ['Not part of any plot thread', ['The council', 'The voyage']]]);
    expect(by({ kind: 'category', key: s.ships.key })).toEqual([['The Gull', ['The voyage']], ['Not linked to any ship', ['The council', 'The siege']]]);
    expect(by({ kind: 'none' })).toEqual([['All events', ['The council', 'The siege', 'The voyage']]]);
    expect(groupings(model).map((g) => g.label)).toEqual(['One line', 'Characters', 'Places', 'Factions & Species', 'Ships', 'Plot threads']);
  });

  it('works with filters: tracks hold only the events the filters leave', async () => {
    const s = await story();
    const model = await s.model();
    const kept = select(model, { types: ['event'], characters: [s.orrin.id] }).items.map((i) => i.ref.id);
    const events = eventRecords(model).filter((e) => kept.includes(e.id));
    expect(tracksFor(model, events, { kind: 'category', key: 'character' }).map((t) => [t.label, t.eventIds.length])).toEqual([['Mira', 1], ['Orrin', 1]]);
    expect(tracksFor(model, [], { kind: 'category', key: 'character' })).toEqual([]);
  });
});

describe('arranging tracks', () => {
  const tracks = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id.toUpperCase(), eventIds: [id] }));

  it('orders, hides, folds and focuses, ignoring tracks that are no longer there', () => {
    const shown = (prefs: Partial<typeof NO_PREFS>) => arrange(tracks, { ...NO_PREFS, ...prefs });
    expect(shown({}).shown.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(shown({ order: ['c', 'gone', 'a'] }).shown.map((t) => t.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(shown({ hidden: ['b', 'gone'] })).toMatchObject({ shown: [{ id: 'a' }, { id: 'c' }, { id: 'd' }], hidden: [{ id: 'b' }] });
    expect(shown({ folded: ['c'] }).shown.map((t) => t.folded)).toEqual([false, false, true, false]);
    expect(shown({ focus: 'c', folded: ['c'] })).toMatchObject({ shown: [{ id: 'c', folded: false }], focused: { id: 'c' } });
    expect(shown({ focus: 'gone' }).shown).toHaveLength(4);
    expect(moveTrack(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveTrack(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveTrack(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'b', 'c']);
    expect([toggle(['a'], 'a'), toggle(['a'], 'b')]).toEqual([[], ['a', 'b']]);
  });

  it('never changes when an event happens: every track, in any order, draws it at the same moment', async () => {
    const s = await story();
    const model = await s.model();
    const events = eventRecords(model);
    const all = tracksFor(model, events, { kind: 'category', key: 'character' });
    const domain = domainOf(events);
    const placeOf = (order: string[]) => {
      const places = new Map<string, number[]>();
      for (const track of arrange(all, { ...NO_PREFS, order }).shown) {
        for (const m of layoutAxis(events.filter((e) => track.eventIds.includes(e.id)), 1200, domain).marks) (places.get(m.id) ?? places.set(m.id, []).get(m.id)!).push(m.x);
      }
      return places;
    };
    const usual = placeOf([]);
    const reversed = placeOf(all.map((t) => t.id).reverse());
    expect(usual.get(s.siege.id)).toHaveLength(2);
    expect(new Set(usual.get(s.siege.id)).size).toBe(1);
    expect([...reversed].sort()).toEqual([...usual].sort());
    // And nothing stored changed: arranging is only a way of looking.
    expect((await s.model()).events.get(s.siege.id)!.when).toEqual(exact(10));
  });
});

describe('tracks in the address and in saved views', () => {
  it('writes the arrangement down and reads it back, the plain timeline setting nothing', () => {
    const grouping: Grouping = { kind: 'category', key: 'character' };
    const prefs = { order: ['b', 'a'], hidden: ['c'], folded: ['a'], focus: null };
    const address = new URLSearchParams(Object.entries(trackAddress(grouping, prefs)).filter(([, v]) => v) as [string, string][]);
    expect(readTracks(address)).toEqual({ grouping, prefs });
    expect(tracksFromLayout(trackLayout(grouping, prefs))).toEqual({ grouping, prefs });
    expect(trackLayout({ kind: 'none' }, NO_PREFS)).toEqual({});
    expect(Object.values(trackAddress({ kind: 'none' }, NO_PREFS)).every((v) => v === null)).toBe(true);
    expect([decodeGrouping('category:'), decodeGrouping('planets'), decodeGrouping(null)]).toEqual([{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }]);
    expect(encodeGrouping({ kind: 'thread' })).toBe('thread');
  });
});
