// The logic of the story views' tests: flutter_app/test/shared/domain/ability_standing_test.dart (every test), the
// parts of flutter_app/test/features/progression/skill_tree_test.dart that are not about the widgets (seen through no
// one, through a character, as of an earlier chapter; what the inspector says), and checks of the structure view's
// scale, the appearance records and the markers. What those widget tests check of the widgets themselves (zoom buttons,
// Esc, text at twice the size), and plot_lanes_window_test.dart (the painter drawing only a window of columns, pixel
// for pixel), belong to the screens and are not here.

import { join } from 'node:path';

import { type AbilityNode, type AbilityTree, type PathEdge, type PathRole, abilityTree, heldBy, lockedBecause, pathRoleLabel, standings } from '../../../src/domain/abilities/paths';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { PlotChanges } from '../../../src/domain/plot/plotChanges';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { snapshotsOf } from '../../../src/domain/systems/systemsService';
import { MarkerChanges, lengthBars, markersIn } from '../../../src/domain/visualize/story/pacing';
import { niceMax, ownAppearance, recordAppearance, shortName, standingLine } from '../../../src/domain/visualize/story/screens';
import { flutterFixturesDir, readJson } from '../../fixtures';

const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
const fixtureNames = ['qa-sample', 'made-in-the-app', 'growth'];

const node = (key: string): AbilityNode => ({
  key,
  ref: new EntityRef('entry', key),
  name: key,
  source: 'Test',
  sourceKey: 'test',
  color: '#000000',
  rank: null,
  requires: '',
  limits: [],
  holders: [],
  acquired: [],
});
const edge = (from: string, to: string, role: PathRole): PathEdge => ({ id: `${from}>${to}`, from, to, role, label: pathRoleLabel[role], directed: true, linkId: null });

describe('ability standing (ability_standing_test.dart)', () => {
  test('at the end, what a character holds is what the tree says they hold, on every novel with abilities', () => {
    let checked = 0;
    for (const name of fixtureNames) {
      const s = fixture(name);
      const model = StoryModel.fromSnapshot(s);
      const snapshots = snapshotsOf(s);
      const tree = abilityTree(model, snapshots);
      const ids = new Set(tree.nodes.flatMap((n) => n.holders.map((h) => h.id)));
      for (const id of ids) {
        const fromTree = new Set(tree.nodes.filter((n) => n.holders.some((h) => h.id === id)).map((n) => n.key));
        const drawn = new Set(tree.nodes.map((n) => n.key));
        const held = [...heldBy(model, snapshots, id)].filter((k) => drawn.has(k));
        expect([name, id, new Set(held)]).toEqual([name, id, fromTree]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('as of a chapter, only what was held by then', () => {
    const s = fixture('growth');
    const model = StoryModel.fromSnapshot(s);
    const snapshots = snapshotsOf(s);
    const reading = [...model.nodes.values()].sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
    let differs = false;
    for (const id of new Set(snapshots.map((p) => p.entryId))) {
      const end = heldBy(model, snapshots, id);
      for (const n of reading) {
        const then = heldBy(model, snapshots, id, n.id);
        if (then.size !== end.size || ![...end].every((k) => then.has(k))) differs = true;
      }
      // At the last chapter, everything that is held at the end.
      expect(heldBy(model, snapshots, id, reading[reading.length - 1].id)).toEqual(end);
    }
    expect(differs).toBe(true);
  });

  test('held, can be gained, or locked: by the prerequisites, alternatives and exclusions recorded', () => {
    const tree: AbilityTree = {
      nodes: ['root', 'next', 'both', 'either', 'other', 'excluded', 'rival', 'free'].map(node),
      edges: [
        edge('root', 'next', 'prerequisite'),
        edge('root', 'both', 'prerequisite'),
        edge('next', 'both', 'rule'),
        edge('root', 'either', 'alternative'),
        edge('other', 'either', 'alternative'),
        edge('excluded', 'rival', 'exclusive'),
        // An upgrade or evolution is not a requirement: it does not lock what it leads to.
        edge('root', 'free', 'evolution'),
      ],
      notDrawn: [],
    };
    const name = (k: string) => k;
    expect(Object.fromEntries(standings(tree, new Set(['root', 'excluded'])))).toEqual({
      root: 'held',
      next: 'available',
      both: 'locked',
      either: 'available',
      other: 'available',
      excluded: 'held',
      rival: 'locked',
      free: 'available',
    });
    expect(lockedBecause(tree, 'both', new Set(['root']), name)).toBe('Needs next.');
    expect(lockedBecause(tree, 'either', new Set(), name)).toBe('Needs one of root, other.');
    expect(lockedBecause(tree, 'rival', new Set(['excluded']), name)).toBe('Excluded by excluded, which is held.');
    const none = standings(tree, new Set());
    expect(['root', 'next', 'either'].map((k) => none.get(k))).toEqual(['available', 'locked', 'locked']);
  });
});

describe('ability paths seen through a character (skill_tree_test.dart)', () => {
  const s = fixture('growth');
  const model = StoryModel.fromSnapshot(s);
  const snapshots = snapshotsOf(s);
  const tree = abilityTree(model, snapshots);
  const counts = new Map<string, number>();
  for (const n of tree.nodes) for (const h of n.holders) counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
  const who = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const whoName = model.entries.get(who)!.name;
  const name = (k: string) => tree.nodes.find((n) => n.key === k)?.name ?? 'something deleted';

  test('the inspector says where the selected one stands, and why when locked', () => {
    const heldSet = new Set(tree.nodes.filter((n) => n.holders.some((h) => h.id === who)).map((n) => n.key));
    const st = standings(tree, heldSet);
    const held = tree.nodes.find((n) => n.holders.some((h) => h.id === who))!;
    expect(standingLine(tree, held.key, st.get(held.key)!, whoName, 'at the end of the story', heldSet, name)).toBe(
      `${whoName} holds it at the end of the story.`,
    );
    const locked = tree.nodes.find((n) => st.get(n.key) === 'locked')!;
    const line = standingLine(tree, locked.key, 'locked', whoName, 'at the end of the story', heldSet, name);
    expect(line.startsWith(`Locked for ${whoName} at the end of the story.`)).toBe(true);
    expect(/Needs|Excluded by/.test(line)).toBe(true);
    // Both held and locked are counted.
    expect([...st.values()].filter((x) => x === 'held').length).toBeGreaterThan(0);
    expect([...st.values()].filter((x) => x === 'locked').length).toBeGreaterThan(0);
  });

  test('as of an earlier chapter, what was held by then', () => {
    const atEnd = [...standings(tree, heldBy(model, snapshots, who)).values()].filter((x) => x === 'held').length;
    const first = model.order.chapters[0];
    const then = [...standings(tree, heldBy(model, snapshots, who, first.id)).values()].filter((x) => x === 'held').length;
    expect(then).not.toBe(atEnd);
  });
});

describe('structure, appearances and markers', () => {
  test('the scale tops out at a round number at or above the longest', () => {
    expect([0, 7, 10, 11, 99, 101, 1234, 5000].map(niceMax)).toEqual([100, 7, 10, 20, 100, 200, 2000, 5000]);
  });

  test('a chapter with several bars names each scene after a point', () => {
    const model = StoryModel.fromSnapshot(fixture('saga'));
    const bars = lengthBars(model, { grain: 'scenes' });
    const names = bars.map((_, i) => shortName(bars, i));
    expect(names.some((n) => n.includes('.'))).toBe(true);
    const chapters = lengthBars(model);
    expect(chapters.map((_, i) => shortName(chapters, i))).toEqual(chapters.map((b) => `${b.chapterNumber}`));
  });

  test('recording a character as appearing, mentioned, or neither, in a chapter', () => {
    let snapshot = fixture('qa-sample');
    const model = StoryModel.fromSnapshot(snapshot);
    const who = [...model.entries.values()].find((e) => e.category === 'character')!.id;
    const nodeId = model.order.chapters[0].id;
    let n = 0;
    for (const as of ['appears', 'mentioned', null] as const) {
      const c = new PlotChanges(snapshot, { now: 1, createId: () => `x${n++}` });
      recordAppearance(nodeId, who, as)(c);
      snapshot = c.snapshot;
      const after = StoryModel.fromSnapshot(snapshot);
      expect(ownAppearance(after, nodeId, who)).toBe(as);
      // A character is in one list or the other, never both.
      const plan = after.plans.get(nodeId)!;
      expect(plan.appearIds.includes(who) && plan.mentionIds.includes(who)).toBe(false);
    }
  });

  test('markers need a kind, are tidied, and are kept inside another change of the novel', () => {
    const s = fixture('qa-sample');
    const model = StoryModel.fromSnapshot(s);
    const c = new PlotChanges(s, { now: 9, createId: () => 'mk' });
    const id = markersIn(c, (m) => m.save(null, { kind: '  Act   break ', nodeId: model.order.chapters[0].id }));
    expect(id).toBe('mk');
    const kept = new MarkerChanges(c.snapshot, { now: 10, createId: () => 'z' }).list();
    expect(kept.map((m) => [m.kind, m.nodeId])).toEqual([['Act break', model.order.chapters[0].id]]);
    expect(() => markersIn(c, (m) => m.save(null, { kind: ' ' }))).toThrow('Say what kind of marker it is.');
  });
});
