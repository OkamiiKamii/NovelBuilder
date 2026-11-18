// The Visualize frame's screens, as logic (flutter_app/test/features/visualize/view_atlas_test.dart and the parts of
// kinds_screens_test.dart that are not the widgets themselves): every view offered is under one subject in the atlas's
// order; where plates open in Scriptor; a kind's line, its CSV's name; recording who holds a record; the shared
// filters as the query reads them; turning views off and on through saved-view changes.

import { join } from 'node:path';

import { CodexChanges } from '../../../src/domain/codex/codexChanges';
import { type JsonMap } from '../../../src/domain/json';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { kindHolders } from '../../../src/domain/visualize/kinds';
import { SavedViewChanges } from '../../../src/domain/visualize/savedViews';
import {
  atlasOf,
  frameFilter,
  matchingKeys,
  offeredViews,
  openLabel,
  plateTarget,
  progressionLine,
  selectionWords,
  viewsOffOf,
} from '../../../src/domain/visualize/screens/frame';
import { csvName, kindLine, recordHolder, showChip } from '../../../src/domain/visualize/screens/kindsView';
import { viewOf } from '../../../src/domain/visualize/views';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';

const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);

test('every view offered is under one subject, in the atlas’s order', () => {
  const parts = offeredViews([]);
  const atlas = atlasOf(parts);
  expect(atlas.map(([s]) => s)).toEqual(['People', 'Time', 'The story', 'The world', 'Numbers']);
  expect(atlas.flatMap(([, v]) => v).length).toBe(parts.length);
  expect(new Set(atlas.flatMap(([, v]) => v.map((x) => x.key))).size).toBe(parts.length);
  // Turned off, a view is left out of the atlas; its subject goes when it is the only one there.
  expect(atlasOf(offeredViews(['charts'])).map(([s]) => s)).not.toContain('Numbers');
});

test('a plate opens the view’s page here: the relationship map at Organize’s, Secrets and knowledge at its own', () => {
  expect(plateTarget(viewOf('journeys')!)).toBe('/visualize/journeys');
  expect(plateTarget(viewOf('relationships')!)).toBe('/organize/ties');
  expect(plateTarget(viewOf('knowledge')!)).toBe('/visualize/knowledge');
});

test('the shared filters narrow by name and by character, and narrow nothing when empty', () => {
  const model = StoryModel.fromSnapshot(NovelSnapshot.fromJson(readJson(samplePath) as JsonMap));
  expect(frameFilter('  ', null)).toEqual({});
  expect(matchingKeys(model, frameFilter('', null), ['entry'])).toBeNull();
  const wren = [...model.entries.values()].find((e) => e.name.startsWith('Wren'))!;
  const keys = matchingKeys(model, frameFilter('', wren.id), ['entry', 'event'])!;
  expect(keys.has(`entry:${wren.id}`)).toBe(true);
  expect(keys.size).toBeGreaterThan(1);
  const named = matchingKeys(model, frameFilter('wren', null), ['entry'])!;
  expect([...named]).toEqual([`entry:${wren.id}`]);
  expect(selectionWords(wren.id, null, wren.id)).toBe('Selected');
  expect(selectionWords('x', new Set([wren.id]), wren.id)).toBe('Connected to the selection');
  expect(openLabel(model, new EntityRef('entry', wren.id))).toBe('Open character profile');
  expect(openLabel(model, new EntityRef('thread', 'x'))).toBeNull();
});

test('a kind says how it is set up, and its table downloads under its own name', () => {
  const model = StoryModel.fromSnapshot(fixture('kinds'));
  const artifacts = model.categories.get('custom-artifacts')!;
  expect(kindLine(artifacts, 1)).toMatch(/^Artifacts: 1 record\. Set up to be shown /);
  expect(kindLine(artifacts, 3)).toContain('in the knowledge graph');
  expect(csvName(artifacts)).toBe('artifacts.csv');
  expect(showChip(null, [])).toBe('Table');
  expect(showChip('map', [])).toBe('On a map · not set up');
  expect(showChip('map', ['map'])).toBe('On a map');
});

test('recording who holds a record: a first holder, the holding passing on, then nobody', () => {
  let s = fixture('kinds');
  let clock = 1;
  let ids = 0;
  const run = (apply: (c: CodexChanges, model: StoryModel) => string): string => {
    const model = StoryModel.fromSnapshot(s);
    const c = new CodexChanges(s, { now: ++clock, createId: () => `h${++ids}` });
    const said = apply(c, model);
    s = c.snapshot;
    return said;
  };
  const model = StoryModel.fromSnapshot(s);
  const artifact = [...model.entries.values()].find((e) => e.category === 'custom-artifacts')!;
  const people = [...model.entries.values()].filter((e) => e.id !== artifact.id).slice(0, 2);
  const open = () =>
    kindHolders(StoryModel.fromSnapshot(s), 'custom-artifacts')
      .records.find((r) => r.entry.id === artifact.id)!
      .history.filter((h) => h.connection.validity?.until == null);
  const before = open().length;
  const firstChapter = StoryModel.fromSnapshot(s).order.chapters[0];
  if (before === 0) {
    expect(run((c, m) => recordHolder(c, m, artifact.id, people[0].id, '', open()))).toBe(`Recorded: ${people[0].name} holds ${artifact.name}.`);
    expect(open().length).toBe(1);
  }
  if (firstChapter !== undefined) {
    expect(() => run((c, m) => recordHolder(c, m, artifact.id, people[1].id, '', open()))).toThrow(/Choose when it passes to them/);
    if (open().length === 1) {
      expect(run((c, m) => recordHolder(c, m, artifact.id, people[1].id, `n:${firstChapter.id}`, open()))).toBe(
        `Recorded: ${people[1].name} holds ${artifact.name} from then on.`,
      );
      expect(open().map((h) => h.holder.id)).toEqual([people[1].id]);
    }
    expect(run((c, m) => recordHolder(c, m, artifact.id, 'nobody', `n:${firstChapter.id}`, open()))).toBe(`Recorded: nobody holds ${artifact.name} from then on.`);
  }
  expect(() => run((c, m) => recordHolder(c, m, artifact.id, 'nobody', '', open()))).toThrow();
});

test('turning views off is a setting of the novel, read back as it was set', () => {
  const s = fixture('qa-sample');
  const c = new SavedViewChanges(s, { now: 1, createId: () => 'v1' });
  expect(viewsOffOf(c.snapshot.project)).toEqual([]);
  c.setViewsOff(['charts', 'places']);
  expect(viewsOffOf(c.snapshot.project)).toEqual(['charts', 'places']);
  expect(offeredViews(viewsOffOf(c.snapshot.project)).some((v) => v.key === 'charts')).toBe(false);
});

test('a progression row says what is recorded, and nothing assumed', () => {
  expect(progressionLine({ id: 'a', name: 'A', abilities: 2, snapshots: 1, changes: 0, now: '' })).toBe('2 abilities on a sheet · 1 snapshot');
  expect(progressionLine({ id: 'a', name: 'A', abilities: 0, snapshots: 0, changes: 3, now: 'Level 4' })).toBe('Level 4 · 3 changes');
});
