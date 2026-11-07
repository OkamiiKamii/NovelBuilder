import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { select } from '@/modules/model/query';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { cleanConfig, createSavedViewService, DEFAULT_CONFIG, openSaved, registerSavedViews, SavedViewNotFoundError } from './saved';

let n = 0;
function open(name = `saved-${++n}`) {
  const db = new NovelDB(name);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  for (const register of [registerManuscript, registerCodex, registerRelationships, registerTimeline, registerSavedViews]) register(registry);
  return { db, projects, saved: createSavedViewService(db, projects.contentChanged), codex: createCodexService(db, projects.contentChanged), ms: createManuscriptService(db, projects.contentChanged), timeline: createTimelineService(db, projects.contentChanged), relationships: createRelationshipService(db, projects.contentChanged) };
}

async function story(app = open()) {
  const p = await app.projects.create({ title: 'Ashfall' });
  const mira = await app.codex.forProject(p.id).create('character', 'Mira');
  const orrin = await app.codex.forProject(p.id).create('character', 'Orrin');
  const one = await app.ms.forProject(p.id).create('chapter', null, 'One');
  const siege = await app.timeline.forProject(p.id).create('The siege');
  await app.timeline.forProject(p.id).update(siege.id, { characters: [{ id: mira.id, age: null }], nodeIds: [one.id] });
  return { ...app, p, mira, orrin, one, siege, views: app.saved.forProject(p.id) };
}

describe('saving a view', () => {
  it('keeps its settings and record ids, not the records, through closing and reopening', async () => {
    const name = `saved-reload-${++n}`;
    const s = await story(open(name));
    const view = await s.views.save('timeline', '  Mira’s events  ', {
      filter: { characters: [s.mira.id], text: 'siege', chapters: { from: s.one.id } },
      mode: 'list', layers: ['tracks', 'tracks', ''], scale: { x: 10, y: 20, k: 1.5 }, layout: { groupBy: 'character', trackOrder: [s.orrin.id, s.mira.id] },
    });
    expect(view).toMatchObject({ view: 'timeline', name: 'Mira’s events', mode: 'list', layers: ['tracks'], scale: { x: 10, y: 20, k: 1.5 } });
    // Only ids and settings: no names, no copies of the character or the event.
    expect(JSON.stringify(view)).not.toContain('Mira"');
    expect(JSON.stringify(view)).not.toContain('The siege');
    s.db.close();
    const again = open(name);
    expect(await again.saved.forProject(s.p.id).get(view.id)).toEqual(view);
    // Opening it reads the records as they are now: a renamed character is found by its id.
    await again.codex.forProject(s.p.id).update(s.mira.id, { name: 'Mira Vale' });
    const model = (await loadModel(again.db, s.p.id))!;
    expect(select(model, { ...openSaved(model, view).filter, types: ['event'] }).items.map((i) => i.label)).toEqual(['The siege']);
  });

  it('renames, duplicates, restores the default and deletes, touching nothing else', async () => {
    const s = await story();
    const view = await s.views.save('places', 'North', { filter: { text: 'keep' }, mode: 'list' });
    await s.views.rename(view.id, ' The north ');
    await s.views.rename(view.id, '   ');
    expect((await s.views.get(view.id))!.name).toBe('Untitled view');
    await s.views.rename(view.id, 'The north');
    const copy = await s.views.duplicate(view.id);
    expect(copy).toMatchObject({ name: 'The north (copy)', view: 'places', filter: { text: 'keep' }, mode: 'list' });
    expect(copy.id).not.toBe(view.id);
    await s.views.restoreDefault(copy.id);
    expect(await s.views.get(copy.id)).toMatchObject({ name: 'The north (copy)', ...DEFAULT_CONFIG });
    expect((await s.views.get(view.id))!.filter).toEqual({ text: 'keep' });
    await s.views.update(view.id, { filter: { text: 'reach' } });
    expect(await s.views.get(view.id)).toMatchObject({ name: 'The north', filter: { text: 'reach' }, mode: 'list' });
    const before = { entries: await s.db.loreEntries.count(), events: await s.db.timelineEvents.count() };
    await s.views.remove(view.id);
    expect((await s.views.list()).map((v) => v.name)).toEqual(['The north (copy)']);
    expect({ entries: await s.db.loreEntries.count(), events: await s.db.timelineEvents.count() }).toEqual(before);
    await expect(s.views.rename(view.id, 'x')).rejects.toBeInstanceOf(SavedViewNotFoundError);
    expect(await s.views.list('timeline')).toEqual([]);
  });

  it('is kept to its project', async () => {
    const s = await story();
    const other = await s.projects.create({ title: 'Other' });
    const view = await s.views.save('timeline', 'Mine', {});
    expect(await s.saved.forProject(other.id).get(view.id)).toBeUndefined();
    await expect(s.saved.forProject(other.id).remove(view.id)).rejects.toBeInstanceOf(SavedViewNotFoundError);
  });
});

describe('records that are gone', () => {
  it('opens without them, says how many, and leaves the saved view as it was', async () => {
    const s = await story();
    const view = await s.views.save('timeline', 'Both of them', { filter: { characters: [s.mira.id, s.orrin.id], chapters: { from: s.one.id }, time: { from: { kind: 'event', eventId: s.siege.id } } } });
    await s.codex.forProject(s.p.id).remove(s.orrin.id);
    await s.ms.forProject(s.p.id).remove(s.one.id);
    const model = (await loadModel(s.db, s.p.id))!;
    const opened = openSaved(model, view);
    expect(opened.filter).toEqual({ characters: [s.mira.id], time: { from: { kind: 'event', eventId: s.siege.id } } });
    expect(opened.missing.sort()).toEqual([s.orrin.id, s.one.id].sort());
    expect((await s.views.get(view.id))!.filter.characters).toEqual([s.mira.id, s.orrin.id]);
    // Everything it named gone: it opens as the plain view.
    await s.codex.forProject(s.p.id).remove(s.mira.id);
    await s.timeline.forProject(s.p.id).remove(s.siege.id);
    const bare = openSaved((await loadModel(s.db, s.p.id))!, view);
    expect(bare.filter).toEqual({});
    expect(bare.missing).toHaveLength(4);
  });
});

describe('copies and project files', () => {
  it('points a copy’s saved views at the copy’s records', async () => {
    const s = await story();
    await s.views.save('timeline', 'Mira', { filter: { characters: [s.mira.id], time: { from: { kind: 'event', eventId: s.siege.id } } }, layout: { trackOrder: [s.mira.id, 'not-an-id'] } });
    for (const copy of [await s.projects.duplicate(s.p.id), await s.projects.importSnapshot(JSON.parse(JSON.stringify(await s.projects.exportSnapshot(s.p.id))))]) {
      const [view] = await s.saved.forProject(copy.id).list();
      const model = (await loadModel(s.db, copy.id))!;
      const mira = [...model.entries.values()].find((e) => e.name === 'Mira')!;
      const siege = [...model.events.values()][0];
      expect(view).toMatchObject({ name: 'Mira', filter: { characters: [mira.id], time: { from: { kind: 'event', eventId: siege.id } } }, layout: { trackOrder: [mira.id, 'not-an-id'] } });
      expect(openSaved(model, view).missing).toEqual([]);
    }
  });
});

describe('what is stored', () => {
  it('keeps only settings it can read, and the view’s own layout as given', () => {
    expect(cleanConfig({ filter: { types: ['event', 'planet' as never], canon: ['maybe' as never] }, mode: 'table' as never, layers: [1 as never, 'a'], scale: { x: NaN, y: 0, k: 1 }, layout: { anything: { goes: true } } })).toEqual({
      filter: { types: ['event'] }, mode: 'visual', layers: ['a'], scale: null, layout: { anything: { goes: true } },
    });
    expect(cleanConfig({})).toEqual(DEFAULT_CONFIG);
  });
});
