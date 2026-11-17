// Ports of the Flutter app's tests of the Systems core: flutter_app/test/shared/domain/{stage_grants,climb,face_off,
// from_pages,system_message}_test.dart.

import { worldFinds } from '../../src/domain/codex/worldFinder';
import { type JsonMap, str } from '../../src/domain/json';
import { blockTexts, textToDoc } from '../../src/domain/prose';
import { maps, strings } from '../../src/domain/records/jsonRecord';
import { SystemBlueprint, SystemSheet } from '../../src/domain/records/system';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { instantiateBlueprint, tidyBlueprint } from '../../src/domain/systems/blueprints';
import { climbsOf } from '../../src/domain/systems/climb';
import { type ComputedSheet, SheetProfile, computeSheet } from '../../src/domain/systems/compute';
import { faceOff } from '../../src/domain/systems/faceOff';
import { ownSystemJob, systemFromPages } from '../../src/domain/systems/fromPages';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { type MessageParts, messageLines } from '../../src/domain/systems/systemMessage';
import { systemPresets } from '../../src/domain/systems/systemPresets';
import { readJson, samplePath } from '../fixtures';

// ---------------------------------------------------------------------------------------------------- stage grants

function tiers(args: { dTier?: string[]; cTier?: string[]; bTier?: string[] } = {}): JsonMap {
  return {
    name: 'Super Power',
    variables: [{ id: 'str', name: 'Strength', key: 'str', kind: 'number', base: 10 }],
    tracks: [
      {
        id: 'rank',
        name: 'Tier',
        key: 'tier',
        kind: 'stages',
        stages: [
          { id: 'd', name: 'D Tier', grants: args.dTier ?? [] },
          { id: 'c', name: 'C Tier', grants: args.cTier ?? ['sand'] },
          { id: 'b', name: 'B Tier', grants: args.bTier ?? ['ice'] },
        ],
      },
    ],
    groups: [{ id: 'powers', name: 'Powers' }],
    items: [
      { id: 'sand', groupId: 'powers', name: 'Sandman', requires: 'str >= 1', modifiers: [{ id: 'm1', target: 'str', op: 'add', value: '5' }] },
      { id: 'ice', groupId: 'powers', name: 'IceMan', requires: 'str >= 1' },
      { id: 'fly', groupId: 'powers', name: 'Flight', requires: 'str >= 1' },
    ],
  };
}
const system = (raw?: JsonMap) => new SystemBlueprint({ id: 'sys', ...tidyBlueprint(raw ?? tiers()) });
const held = (s: ComputedSheet) => s.items.map((i) => i.item.name);
const strength = (s: ComputedSheet) => s.rows.find((r) => r.variable.id === 'str')!.value as number;
const at = (stage: string) => new SheetProfile({ progress: new Map([['rank', stage]]) });

describe('every new tier, a new power', () => {
  test('a stage gives its items at that stage and every one after it, not before', () => {
    const sys = system();
    const atD = computeSheet(sys, at('d'));
    expect(held(atD)).toEqual([]);
    expect(strength(atD)).toBe(10);
    const atC = computeSheet(sys, at('c'));
    expect(held(atC)).toEqual(['Sandman']);
    expect(atC.items[0].from).toBe('C Tier');
    expect(strength(atC)).toBe(15);
    const atB = computeSheet(sys, at('b'));
    expect(held(atB).sort()).toEqual(['IceMan', 'Sandman']);
    expect(Object.fromEntries(atB.items.map((i) => [i.item.name, i.from]))).toEqual({ Sandman: 'C Tier', IceMan: 'B Tier' });
  });

  test('no stage chosen is the first stage', () => {
    expect(held(computeSheet(system(tiers({ dTier: ['fly'] }))))).toEqual(['Flight']);
  });

  test('chosen as well as given: held once, as its own', () => {
    const s = computeSheet(system(), new SheetProfile({ progress: new Map([['rank', 'b']]), itemIds: ['sand'] }));
    expect(held(s).filter((n) => n === 'Sandman')).toHaveLength(1);
    expect(s.items.find((i) => i.item.name === 'Sandman')!.from).toBeNull();
    expect(s.items.find((i) => i.item.name === 'IceMan')!.from).toBe('B Tier');
    expect(strength(s)).toBe(15);
    expect(s.available.map((i) => i.name)).toEqual(['Flight']);
  });

  test('tidying keeps what a stage gives, once, and drops what is no longer in the blueprint', () => {
    const tidy = tidyBlueprint(tiers({ cTier: ['sand', 'sand', 'gone', ''] }));
    const stages = maps(maps(tidy['tracks'])[0]['stages']);
    expect(strings(stages[1]['grants'])).toEqual(['sand']);
    expect(strings(stages[2]['grants'])).toEqual(['ice']);
    const without = tidyBlueprint({ ...tidy, items: maps(tidy['items']).filter((i) => i['id'] !== 'ice') });
    const after = maps(maps(without['tracks'])[0]['stages']);
    expect(strings(after[after.length - 1]['grants'])).toEqual([]);
  });

  test('a copy of a blueprint gives its own copies of the items', () => {
    let n = 0;
    const copy = instantiateBlueprint(tidyBlueprint(tiers()), () => `new${n++}`);
    const items = Object.fromEntries(maps(copy['items']).map((i) => [str(i['name']), str(i['id'])]));
    const stages = maps(maps(copy['tracks'])[0]['stages']);
    expect(strings(stages[1]['grants'])).toEqual([items['Sandman']]);
    expect(strings(stages[2]['grants'])).toEqual([items['IceMan']]);
    expect(Object.values(items)).not.toContain('sand');
    const sys = new SystemBlueprint({ id: 'copy', ...copy });
    const atB = computeSheet(sys, new SheetProfile({ progress: new Map([[sys.tracks[0].id, stages[2]['id'] as string]]) }));
    expect(held(atB).sort()).toEqual(['IceMan', 'Sandman']);
  });
});

// ---------------------------------------------------------------------------------------------------- the climb

describe('the climb', () => {
  // A level costs 100 XP each, from Level 1, to a cap of 50.
  const sys = new SystemBlueprint({
    name: 'Test',
    tracks: [{ id: 't', name: 'Level', key: 'level', kind: 'levels', cap: 50, curve: '100', curveUnit: 'XP' }],
  });
  const sheet = (xp: [string | null, number][]) =>
    new SystemSheet({ id: 's', systemId: 'x', entryId: 'e', xp: xp.map(([node, amount], i) => ({ id: `x${i}`, trackId: 't', amount, nodeId: node })) });
  const chapterOf = new Map(Array.from({ length: 20 }, (_, i) => [`c${i + 1}`, i + 1]));

  test('the level at the end of each chapter, by the system’s curve; the pace and where it leads', () => {
    const [climb] = climbsOf(sys, sheet([['c1', 100], ['c2', 100], ['c4', 200]]), { chapterOf, chapters: 10, who: 'Wren' });
    expect(climb.actual).toEqual([[0, 1], [1, 2], [2, 3], [3, 3], [4, 5]]);
    expect(climb.perChapter).toBe(100);
    expect(climb.projected[0]).toEqual([5, 6]);
    expect(climb.says).toEqual([
      'At this pace (100 XP a chapter), Level 11 by the end of chapter 10, the last written.',
      'Level 10 in chapter 9.',
      'The cap, Level 50, in chapter 49.',
    ]);
  });

  test('a chapter that gives far more than the others', () => {
    const [climb] = climbsOf(sys, sheet([['c1', 100], ['c3', 100], ['c5', 600]]), { chapterOf, chapters: 5, who: 'Wren' });
    expect(climb.says[climb.says.length - 1]).toBe('Chapter 5 alone gives Wren 6 levels, of 8 in the book so far.');
  });

  test('no experience, or a node not in the book: no climb; before the story is chapter 0', () => {
    expect(climbsOf(sys, sheet([]), { chapterOf, chapters: 5 })).toEqual([]);
    expect(climbsOf(sys, sheet([['gone', 500]]), { chapterOf, chapters: 5 })).toEqual([]);
    const climbs = climbsOf(sys, sheet([[null, 300]]), { chapterOf, chapters: 5 });
    expect(climbs).toHaveLength(1);
    expect(climbs[0].actual).toEqual([[0, 4]]);
    expect(climbs[0].projected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------- the face-off

describe('the face-off', () => {
  const sys = new SystemBlueprint({
    name: 'Test',
    variables: [
      { id: 's', name: 'Strength', key: 'strength', kind: 'number', base: 10 },
      { id: 'a', name: 'Agility', key: 'agility', kind: 'number', base: 10 },
      { id: 'h', name: 'Health', key: 'health', kind: 'derived', formula: 'strength * 10', unit: 'HP' },
      { id: 'c', name: 'Path', key: 'path', kind: 'choice', options: ['Light', 'Dark'] },
    ],
    groups: [{ id: 'g', name: 'Skills' }],
    items: [
      { id: 'i1', groupId: 'g', name: 'Spark' },
      { id: 'i2', groupId: 'g', name: 'Ward' },
    ],
  });
  const sheet = (values: Record<string, number>, ids: string[]) => computeSheet(sys, new SheetProfile({ values: new Map(Object.entries(values)), itemIds: ids }));

  test('each number both have, side by side; who leads, the widest gap, what each alone holds', () => {
    const f = faceOff(sheet({ s: 24, a: 9 }, ['i1', 'i2']), sheet({ s: 12, a: 11 }, ['i1']), { aName: 'Crane', bName: 'Wren' });
    expect(f.rows.map((r) => [r.name, r.a, r.b])).toEqual([
      ['Strength', 24, 12],
      ['Agility', 9, 11],
      ['Health', 240, 120],
    ]);
    expect(f.says).toEqual(['Crane leads in 2 of 3; Wren only in Agility.', 'The widest gap: Strength, Crane 24 to Wren 12 (2 times).', 'Only Crane holds Ward.']);
  });

  test('even in everything; a smaller gap as a share; none worth naming under half again', () => {
    expect(faceOff(sheet({}, []), sheet({}, []), { aName: 'A', bName: 'B' }).says).toEqual(['A and B are even in everything.']);
    expect(faceOff(sheet({ s: 15 }, []), sheet({ s: 10 }, []), { aName: 'A', bName: 'B' }).says).toEqual([
      'A leads in all 2.',
      'The widest gap: Strength, A 15 to B 10 (50% more).',
    ]);
    expect(faceOff(sheet({ s: 12 }, []), sheet({ s: 10 }, []), { aName: 'A', bName: 'B' }).says).toEqual(['A leads in all 2.']);
  });
});

// ---------------------------------------------------------------------------------------------------- from the pages

const sample = () => NovelSnapshot.fromJson(readJson(samplePath));

describe('your book’s own system', () => {
  test('a sheet holds a skill with no class (a group held one at a time, holding none, used to fail)', () => {
    let n = 0;
    const c = new SystemChanges(sample(), { now: 0, createId: () => `id${n++}` });
    const sys = c.createSystem(systemPresets.find((p) => p.id === 'litrpg')!.content);
    const wren = c.snapshot.rows('loreEntries').find((e) => e['name'] === 'Wren Hollis')!['id'] as string;
    const sheet = c.addSheet(sys.id, wren);
    const skill = c.systems()[0].items.find((i) => i.name === 'Fireball')!;
    c.updateSheet(sheet.id, () => ({ itemIds: [skill.id] }));
    expect(c.sheets()[0].itemIds).toEqual([skill.id]);
  });

  test('a game system, from its words, holding the novel’s own skills in place of the examples', () => {
    const s = systemFromPages(
      ['James gained a level. His new skill was Smart Atoms; the skill tree glowed.', 'Every skill has a cost. His class was Reincarnator, and his level climbed.'],
      ['Empathic Mimicry', 'Smart Atoms', 'smart atoms'],
    )!;
    expect(s.preset.id).toBe('litrpg');
    expect(s.signs[0]).toEqual({ word: 'skill', times: 3 });
    expect(s.powers).toEqual(['Empathic Mimicry', 'Smart Atoms']);
    expect(s.abilityGroup).toBe('Skills');
    const groups = Object.fromEntries(maps(s.content['groups']).map((g) => [str(g['name']), str(g['id'])]));
    expect(maps(s.content['items']).filter((i) => i['groupId'] === groups['Skills']).map((i) => str(i['name']))).toEqual(['Empathic Mimicry', 'Smart Atoms']);
    expect(maps(s.content['items']).some((i) => i['groupId'] === groups['Classes'])).toBe(true);
  });

  test('cultivation from its words; nothing offered where the pages speak of no system', () => {
    const s = systemFromPages(['Her qi surged; the sect elder watched her reach the next realm.'], [])!;
    expect(s.preset.id).toBe('cultivation');
    expect(s.powers).toEqual([]);
    expect(systemFromPages(['The bell rang. The sea went out.'], [])).toBeNull();
  });

  test('the sample novel, a book with no system, is offered none', () => {
    const texts = sample()
      .rows('chapterContents')
      .flatMap((r) => blockTexts(r['doc']));
    expect(systemFromPages(texts, [])).toBeNull();
  });

  test('read away from the screen: the chapters as stored, in reading order, the same system as read in place', () => {
    const row = (id: string, text: string) => JSON.stringify({ id, doc: textToDoc(text) });
    const stored = [
      row('b', 'Every skill has a cost. His class was Reincarnator, and his level climbed.'),
      row('a', 'James gained a level. His new skill was Smart Atoms; the skill tree glowed.'),
      row('cut', 'A spell, a spell, a spell, a spell: mana and runes, cut from the book.'),
      'not a record',
    ];
    const read = ownSystemJob(stored, new Map([['a', 1], ['b', 2]]), ['Empathic Mimicry'])()!;
    const chapters: [number, string[]][] = [
      [1, ['James gained a level. His new skill was Smart Atoms; the skill tree glowed.']],
      [2, ['Every skill has a cost. His class was Reincarnator, and his level climbed.']],
    ];
    const inPlace = systemFromPages(
      chapters.flatMap(([, blocks]) => blocks),
      ['Empathic Mimicry', ...worldFinds(chapters, { limit: 40 }).filter((f) => f.kind === 'power').map((f) => f.name)],
    )!;
    expect(read.preset.id).toBe('litrpg');
    expect(read.signs).toEqual(inPlace.signs);
    expect(read.powers).toEqual(inPlace.powers);
    expect(JSON.stringify(read.content)).toBe(JSON.stringify(inPlace.content));
    expect(ownSystemJob([], new Map(), [])()).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------- the system speaks

const m = (kind: MessageParts['kind'], more: Partial<MessageParts> = {}): MessageParts => ({
  kind,
  who: 'Wren',
  track: 'Level',
  level: 5,
  name: '',
  rank: '',
  stat: '',
  from: 0,
  by: 1,
  detail: '',
  ...more,
});

describe('the system speaks', () => {
  test('each kind in the system’s own words, a line each, in the book’s brackets', () => {
    expect(messageLines(m('levelUp', { detail: '+5 attribute points to assign' }), 'square')).toEqual([
      '[Level up!]',
      '[Wren has reached Level 5.]',
      '[+5 attribute points to assign]',
    ]);
    expect(messageLines(m('levelUp', { who: '' }), 'square')[1]).toBe('[You have reached Level 5.]');
    expect(messageLines(m('skill', { name: 'Fireball', rank: 'F' }), 'lenticular')).toEqual(['【Skill acquired: Fireball (F)】']);
    expect(messageLines(m('stat', { stat: 'Strength', from: 12, by: 2 }), 'angle')).toEqual(['<Strength +2 (12 → 14)>']);
    expect(messageLines(m('stat', { stat: 'Luck', from: 3.5, by: -1 }), 'none')).toEqual(['Luck −1 (3.5 → 2.5)']);
    expect(messageLines(m('title', { name: 'Tidewalker' }), 'square')).toEqual(['[Title earned: Tidewalker]']);
    expect(messageLines(m('quest', { name: 'The Drowned Road', detail: 'Objective: reach the third stone\nReward: ?' }), 'square')).toEqual([
      '[New quest: The Drowned Road]',
      '[Objective: reach the third stone]',
      '[Reward: ?]',
    ]);
    expect(messageLines(m('questDone', { name: 'The Bell' }), 'square')).toEqual(['[Quest complete: The Bell]']);
    expect(messageLines(m('warning', { name: 'Mana low' }), 'square')).toEqual(['[Warning: Mana low]']);
  });

  test('a name not given yet is marked, not left as an empty bracket', () => {
    expect(messageLines(m('skill'), 'square')).toEqual(['[Skill acquired: …]']);
  });
});
