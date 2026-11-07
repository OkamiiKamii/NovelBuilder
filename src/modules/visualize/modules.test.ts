import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { db, projects, savedViews } from '@/core';
import { loadModel } from '@/modules/model/model';
import { isViewOn, moduleOf, neededBy, turnOff, turnOn, VIEW_MODULES, viewOfPath, viewsOn } from './modules';
import { timelineRows } from './summaries';
import { VIEWS } from './views';

describe('the views as modules', () => {
  it('every view is a module, and every dependency names a real view, with its reason', () => {
    expect(VIEW_MODULES.map((m) => m.key)).toEqual(VIEWS.map((v) => v.key));
    for (const m of VIEW_MODULES) {
      expect(m.reads.length).toBeGreaterThan(0);
      for (const need of m.needs ?? []) {
        expect(VIEWS.some((v) => v.key === need.key)).toBe(true);
        expect(need.why.length).toBeGreaterThan(10);
      }
    }
    // The one dependency between views: Journeys draws on the maps made in Places.
    expect(VIEW_MODULES.filter((m) => m.needs?.length).map((m) => [m.key, m.needs!.map((n) => n.key)])).toEqual([['journeys', ['places']]]);
    expect(neededBy('places').map((m) => m.key)).toEqual(['journeys']);
    // Records made only in a view are said, so turning it off can warn about them.
    expect(VIEW_MODULES.filter((m) => m.editsHere).map((m) => m.key)).toEqual(['structure', 'places', 'journeys']);
  });

  it('every view is on unless the novel turned it off', () => {
    expect(viewsOn(undefined).length).toBe(VIEWS.length);
    expect(viewsOn([]).length).toBe(VIEWS.length);
    expect(isViewOn(['charts'], 'charts')).toBe(false);
    expect(viewsOn(['charts', 'timeline']).map((v) => v.key)).not.toContain('timeline');
  });

  it('a view another view needs stays on, says why, and goes when turned off together', () => {
    const blocked = turnOff([], ['places']);
    expect(blocked.off).toEqual([]);
    expect(blocked.blocked).toEqual([{ key: 'places', by: [{ key: 'journeys', why: moduleOf('journeys')!.needs![0].why }] }]);
    expect(turnOff([], ['places', 'journeys'])).toEqual({ off: ['journeys', 'places'], blocked: [] });
    // With Journeys off already, Places can go on its own.
    expect(turnOff(['journeys'], ['places'])).toEqual({ off: ['journeys', 'places'], blocked: [] });
    expect(turnOff([], ['charts'])).toEqual({ off: ['charts'], blocked: [] });
    // A key from a newer version is kept as it is.
    expect(turnOff(['from-a-newer-version'], ['charts']).off).toEqual(['charts', 'from-a-newer-version']);
  });

  it('turning a view on turns on what it needs, and nothing else', () => {
    expect(turnOn(['journeys', 'places', 'charts'], 'journeys')).toEqual({ off: ['charts'], alsoOn: ['places'] });
    expect(turnOn(['places', 'charts'], 'charts')).toEqual({ off: ['places'], alsoOn: [] });
    expect(turnOn([], 'timeline')).toEqual({ off: [], alsoOn: [] });
  });

  it('reads which view a page address opens', () => {
    expect(viewOfPath('/project/p/visualize/journeys?jwho=x')).toBe('journeys');
    expect(viewOfPath('/project/p/visualize/timeline')).toBe('timeline');
    expect(viewOfPath('/project/p/visualize')).toBeNull();
    expect(viewOfPath('/project/p/timeline?event=e')).toBeNull();
  });
});

/** Every row the novel owns, in every table, with the novel's own row apart from the setting being changed. */
const rowsOf = async (projectId: string) => {
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    const rows = (await table.toArray()).filter((r) => (r as { projectId?: string }).projectId === projectId);
    if (rows.length) out[table.name] = [...rows].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
  }
  const { viewsOff: _off, updatedAt: _at, lastOpenedAt: _opened, ...project } = (await projects.get(projectId))!;
  return JSON.stringify({ project, ...out });
};

describe('turning views off and on keeps the novel exactly as it was', () => {
  const sample = () => projects.importSnapshot(JSON.parse(readFileSync(join(__dirname, '../../../qa/qa-sample.novel.json'), 'utf8')));

  it('the setting is the novel’s: kept in order, without repeats, with keys it does not know, and only it changes', async () => {
    const p = await projects.create({ title: 'Views' });
    await projects.setViewsOff(p.id, ['places', 'charts', 'charts', '', 'from-a-newer-version', 'journeys']);
    expect((await projects.get(p.id))!.viewsOff).toEqual(['charts', 'from-a-newer-version', 'journeys', 'places']);
    await projects.update(p.id, { title: 'Views, renamed' });
    expect((await projects.get(p.id))!.viewsOff).toEqual(['charts', 'from-a-newer-version', 'journeys', 'places']);
    await projects.setViewsOff(p.id, []);
    expect((await projects.get(p.id))!.viewsOff).toEqual([]);
    await projects.remove(p.id);
  });

  it('travels with the novel: in its backup file, and in a copy', async () => {
    const p = await sample();
    await projects.setViewsOff(p.id, ['journeys', 'places']);
    const file = await projects.exportSnapshot(p.id, { everything: true });
    expect(file.project.viewsOff).toEqual(['journeys', 'places']);
    const restored = await projects.importSnapshot(JSON.parse(JSON.stringify(file)));
    const copy = await projects.duplicate(p.id);
    expect([(await projects.get(restored.id))!.viewsOff, (await projects.get(copy.id))!.viewsOff]).toEqual([['journeys', 'places'], ['journeys', 'places']]);
    for (const id of [p.id, restored.id, copy.id]) await projects.remove(id);
  });

  it('off and on, view by view and all at once, three times over: every record, saved view and reading stays the same', async () => {
    const p = await sample();
    // A saved view of a view that will be turned off: it belongs to the novel, and stays.
    await savedViews.forProject(p.id).save('places', 'The coast', { mode: 'list' });
    const before = await rowsOf(p.id);
    const reading = JSON.stringify(timelineRows((await loadModel(db, p.id))!));
    for (let round = 0; round < 3; round++) {
      // One at a time, in an order the dependency allows (Journeys before Places).
      let off: string[] = [];
      for (const key of [...VIEW_MODULES.map((m) => m.key).filter((k) => k !== 'places'), 'places']) {
        const plan = turnOff(off, [key]);
        expect(plan.blocked).toEqual([]);
        off = plan.off;
        await projects.setViewsOff(p.id, off);
        expect(await rowsOf(p.id)).toBe(before);
      }
      expect((await projects.get(p.id))!.viewsOff).toEqual([...VIEWS.map((v) => v.key)].sort());
      // Back on, one at a time: Journeys brings Places with it.
      for (const key of VIEW_MODULES.map((m) => m.key)) {
        off = turnOn(off, key).off;
        await projects.setViewsOff(p.id, off);
        expect(await rowsOf(p.id)).toBe(before);
      }
      expect(off).toEqual([]);
      // All off and on at once.
      await projects.setViewsOff(p.id, VIEWS.map((v) => v.key));
      await projects.setViewsOff(p.id, []);
      expect(await rowsOf(p.id)).toBe(before);
    }
    expect(JSON.stringify(timelineRows((await loadModel(db, p.id))!))).toBe(reading);
    expect((await savedViews.forProject(p.id).list('places')).map((s) => s.name)).toEqual(['The coast']);
    await projects.remove(p.id);
  }, 60_000);
});
