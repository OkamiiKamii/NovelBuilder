import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { checkFormula, computeSheet, curveTable, settle, xpHistory } from './compute';
import { evaluate, FormulaError, parse, unmet, type Scope } from './formula';
import { BLANK, SYSTEM_PRESETS } from './presets';
import { createSystemsService, instantiate, registerSystems, tidy, type SystemsService } from './service';
import { rankName, toKey, type BlueprintContent } from './types';

const scope = (values: Record<string, number | string>, held: Record<string, string[]> = {}): Scope => ({
  value: (name) => values[name.toLowerCase()],
  holds: (group, name) => (group.toLowerCase() in held ? held[group.toLowerCase()].some((x) => x.toLowerCase() === name.toLowerCase()) : undefined),
});
const run = (text: string, values: Record<string, number | string> = {}, held: Record<string, string[]> = {}) => evaluate(parse(text), scope(values, held));
const preset = (id: string): BlueprintContent => SYSTEM_PRESETS.find((p) => p.id === id)!.content;

describe('formulas', () => {
  it('does arithmetic the way it is written', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('2 ^ 3 ^ 2')).toBe(512);
    expect(run('-2 ^ 2')).toBe(-4);
    expect(run('10 % 4 + 7 / 2')).toBe(5.5);
    expect(run('strength × 1.5', { strength: 10 })).toBe(15);
    expect(run('Intelligence ÷ 10', { intelligence: 25 })).toBe(2.5);
    expect(run('[Max Health] - 5', { 'max health': 50 })).toBe(45);
    expect(run('max(1, floor(agility / 5)) + min(2, 9) + clamp(50, 0, 10) + abs(-3) + round(2.5) + ceil(0.1) + sqrt(16)', { agility: 12 })).toBe(25);
    expect(run('if(level >= 10, 100, 5)', { level: 12 })).toBe(100);
  });

  it('compares and combines conditions', () => {
    expect(run('level >= 50', { level: 50 })).toBe(true);
    expect(run('level ≥ 51 OR level = 50', { level: 50 })).toBe(true);
    expect(run('NOT (level < 3) and level != 4', { level: 4 })).toBe(false);
    expect(run('affinity = "fire"', { affinity: 'Fire' })).toBe(true);
    expect(run('1 < 2 && 2 <= 2 || false')).toBe(true);
  });

  it('asks what a profile holds, with names of any length', () => {
    const held = { class: ['Void Mage'], 'cultivation realm': ['Core Formation'], title: [] };
    expect(run('Class: Void Mage AND Level >= 50', { level: 50 }, held)).toBe(true);
    expect(run('Class: Void Mage AND Level >= 50', { level: 49 }, held)).toBe(false);
    expect(run('level >= 1 and Cultivation Realm: Core Formation', { level: 1 }, held)).toBe(true);
    expect(run('(Class: Mage OR Class: Void Mage) AND NOT Title: Chosen One', {}, held)).toBe(true);
    expect(run('Class:Void Mage', {}, held)).toBe(true);
  });

  it('says which parts of a condition are not met', () => {
    const tree = parse('Class: Void Mage AND level >= 50 AND (mana > 10 OR Title: Sage)');
    expect(unmet(tree, scope({ level: 12, mana: 5 }, { class: ['Void Mage'], title: [] }))).toEqual(['level >= 50', 'mana > 10 OR Title: Sage']);
    expect(unmet(tree, scope({ level: 60, mana: 50 }, { class: ['Void Mage'], title: [] }))).toEqual([]);
    expect(unmet(parse('Class: Mage'), scope({}, { class: [] }))).toEqual(['Class: Mage']);
  });

  it('explains what is wrong in plain words', () => {
    const fails = (text: string, values: Record<string, number | string> = {}) => {
      try {
        run(text, values, { class: [] });
        return 'no error';
      } catch (err) {
        expect(err).toBeInstanceOf(FormulaError);
        return (err as Error).message;
      }
    };
    expect(fails('')).toBe('The formula is empty.');
    expect(fails('2 +')).toBe('The formula stops before it is finished.');
    expect(fails('(2 + 3')).toBe('A bracket is not closed.');
    expect(fails('2 3')).toBe('“3” is not expected here.');
    expect(fails('2 $ 3')).toBe('“$” is not something a formula can use.');
    expect(fails('strenght * 2')).toBe('Nothing here is called “strenght”.');
    expect(fails('1 / (2 - 2)')).toBe('This divides by zero.');
    expect(fails('Job: Smith')).toBe('There is no “Job” to look in for “Smith”.');
    expect(fails('Class:')).toBe('Say what comes after “Class:”.');
    expect(fails('affinity * 2', { affinity: 'Fire' })).toBe('“affinity * 2” is a label, not a number.');
    expect(fails('nope(1)')).toContain('“nope” is not a function');
  });
});

describe('working out a sheet', () => {
  const litrpg = () => tidy(preset('litrpg'));
  const id = (system: BlueprintContent, name: string) => (system.items.find((i) => i.name === name) ?? system.variables.find((v) => v.name === name) ?? system.tracks.find((t) => t.name === name))!.id;
  const row = (system: BlueprintContent, profile: Parameters<typeof computeSheet>[1], name: string) => computeSheet(system, profile).rows.find((r) => r.variable.name === name)!;

  it('starts from the blueprint and works out its formulas', () => {
    const system = litrpg();
    const sheet = computeSheet(system);
    expect(Object.fromEntries(sheet.rows.map((r) => [r.variable.name, r.display]))).toEqual({
      Strength: '10', Agility: '10', Intelligence: '10', Vitality: '10', Health: '100 HP', Mana: '50 MP', Stamina: '100 SP',
      'Max Health': '200 HP', 'Max Mana': '100 MP', Damage: '15', 'Mana Regen': '1 per minute', 'Skill Slots': '3 slots',
    });
    expect(sheet.tracks.map((t) => `${t.track.name} ${t.label} · ${t.next}`)).toEqual(['Level 1 of 100 · Next level: 100 XP']);
  });

  it('gives a character what their class, skills and titles bring', () => {
    const system = litrpg();
    const profile = { values: { [id(system, 'Strength')]: 14 }, progress: { [id(system, 'Level')]: 30 }, itemIds: [id(system, 'Mage'), id(system, 'Void Mage'), id(system, 'Void Step'), id(system, 'Giant Slayer')] };
    const sheet = computeSheet(system, profile);
    const shown = Object.fromEntries(sheet.rows.map((r) => [r.variable.name, r.display]));
    // Intelligence 10 + 6 + 12; Mana (50 + 40) × 2; Damage 14 × 1.5 × 1.1 from the title.
    expect([shown.Intelligence, shown.Mana, shown['Max Mana'], shown.Damage, shown['Skill Slots']]).toEqual(['28', '180 MP', '320 MP', '23.1', '6 slots']);
    expect(row(system, profile, 'Mana').sources).toEqual(['Mage', 'Void Mage']);
    expect(row(system, profile, 'Damage').sources).toEqual(['Giant Slayer']);

    const step = sheet.items.find((i) => i.item.name === 'Void Step')!;
    expect(step).toMatchObject({ requires: 'Class: Void Mage AND level >= 50', unmet: ['level >= 50'], costs: [{ label: '70 Mana', error: null }], error: null });
    expect(step.group?.name).toBe('Skills');
    expect(sheet.items.find((i) => i.item.name === 'Void Mage')).toMatchObject({ unmet: [], effects: ['Intelligence +12', 'Mana × 2'] });
    expect(computeSheet(system, { ...profile, progress: { [id(system, 'Level')]: 50 } }).items.find((i) => i.item.name === 'Void Step')!.unmet).toEqual([]);
    expect(computeSheet(system, { ...profile, progress: { [id(system, 'Level')]: 500 } }).tracks[0]).toMatchObject({ label: '100 of 100', next: 'At the cap' });
  });

  it('follows the blueprint when it changes: nothing is copied onto the sheet', () => {
    const system = litrpg();
    const profile = { values: {}, progress: {}, itemIds: [id(system, 'Warrior')] };
    expect(row(system, profile, 'Damage').display).toBe('22.5');
    const changed = tidy({ ...system, variables: system.variables.map((v) => (v.name === 'Damage' ? { ...v, formula: 'strength * 2 + agility' } : v)), items: system.items.map((i) => (i.name === 'Warrior' ? { ...i, modifiers: [{ ...i.modifiers[0], value: '20' }] } : i)) });
    expect(row(changed, profile, 'Damage').display).toBe('70');
  });

  it('tracks named stages, their order and what the next one needs', () => {
    const system = tidy(preset('cultivation'));
    const realm = system.tracks[0];
    const at = (stage: string, more: Partial<Parameters<typeof computeSheet>[1] & object> = {}) => computeSheet(system, { values: {}, itemIds: [], ...more, progress: { [realm.id]: realm.stages.find((s) => s.name === stage)!.id } });
    expect(computeSheet(system).tracks[0]).toMatchObject({ label: 'Qi Condensation', next: 'Next: Foundation Establishment (needs qi >= 1000 AND Pill: Foundation Pill)', unmet: ['qi >= 1000', 'Pill: Foundation Pill'] });
    const ready = at('Qi Condensation', { values: { [id(system, 'Qi')]: 1200 }, itemIds: [id(system, 'Foundation Pill')] });
    expect(ready.tracks[0].unmet).toEqual([]);
    expect(at('Core Formation').rows.find((r) => r.variable.name === 'Lifespan')!.display).toBe('320 years');
    expect(at('Nascent Soul').tracks[0]).toMatchObject({ label: 'Nascent Soul', next: null });
    // A skill can ask for a stage by name, or by how far up the ladder it is.
    const art = (stage: string) => at(stage, { itemIds: [id(system, 'Soul Nurturing Art'), id(system, 'Spirit Sword')] }).items.map((i) => i.unmet);
    expect(art('Qi Condensation')).toEqual([['Cultivation Realm: Core Formation'], ['cultivation_realm >= 2']]);
    expect(art('Core Formation')).toEqual([[], []]);
  });

  it('reads choices, and reports a broken formula without breaking the rest', () => {
    const system = tidy(preset('hard-magic'));
    const lance = { values: { [id(system, 'Affinity')]: 'Fire' }, progress: {}, itemIds: [id(system, 'Flame Lance')] };
    expect(computeSheet(system, lance).items[0]).toMatchObject({ unmet: ['circle >= 2'], costs: [{ label: '100 Mana Capacity', error: null }] });
    expect(computeSheet(system, { ...lance, values: { [id(system, 'Affinity')]: 'Water' } }).items[0].unmet).toEqual(['Affinity: Fire', 'circle >= 2']);

    const broken = tidy({ ...BLANK, variables: [
      { id: 'a', name: 'A', key: 'a', kind: 'derived', unit: '', base: 0, formula: 'b + 1', options: [], note: '' },
      { id: 'b', name: 'B', key: 'b', kind: 'derived', unit: '', base: 0, formula: 'a + 1', options: [], note: '' },
      { id: 'c', name: 'C', key: 'c', kind: 'derived', unit: '', base: 0, formula: 'missing * 2', options: [], note: '' },
      { id: 'd', name: 'D', key: 'd', kind: 'number', unit: 'pts', base: 4, formula: '', options: [], note: '' },
    ] });
    expect(computeSheet(broken).rows.map((r) => `${r.display} | ${r.error}`)).toEqual(['— | “A” depends on itself.', '— | “A” depends on itself.', '— | Nothing here is called “missing”.', '4 pts | null']);
  });

  it('checks a formula as it is typed, against the names in the blueprint', () => {
    const system = litrpg();
    expect(checkFormula(system, 'strength * 1.5', 'number')).toEqual({ ok: true, error: null, preview: '15' });
    expect(checkFormula(system, '  ', 'number')).toEqual({ ok: true, error: null, preview: null });
    expect(checkFormula(system, 'Max Health / 2', 'number').ok).toBe(false);
    expect(checkFormula(system, '[Max Health] / 2', 'number').preview).toBe('100');
    expect(checkFormula(system, 'strenght * 2', 'number').error).toBe('Nothing here is called “strenght”.');
    expect(checkFormula(system, 'Class: Void Mage AND level >= 50', 'condition')).toEqual({ ok: true, error: null, preview: null });
    // A misspelling is caught even where the rest of the condition is already false.
    expect(checkFormula(system, 'level >= 50 AND Class: Void Mge', 'condition').error).toBe('“Classes” has nothing called “Void Mge”.');
    expect(checkFormula(system, 'level >= 50 AND Guild: Ravens', 'condition').error).toBe('There is no “Guild” to look in for “Ravens”.');
    expect(curveTable(system, system.tracks[0], [1, 2, 10, 100])).toEqual([{ level: 1, cost: '100 XP' }, { level: 2, cost: '282.84 XP' }, { level: 10, cost: '3162.28 XP' }]);
  });
});

describe('levelling', () => {
  const game = preset('litrpg');
  const level = game.tracks[0];
  const v = (name: string) => game.variables.find((x) => x.name === name)!;
  const xp = (amount: number, nodeId: string | null = null, source = 'Combat') => ({ id: `x-${amount}-${nodeId}`, trackId: level.id, amount, source, nodeId, note: '' });
  const base = { values: {}, progress: {}, itemIds: [] as string[] };

  it('works the level out from logged experience on the track\'s curve, from where the character started', () => {
    // 100 XP to pass level 1, about 283 to pass level 2, about 520 to pass level 3.
    const sheet = computeSheet(game, { ...base, xp: [xp(250), xp(150)] });
    expect(sheet.tracks[0]).toMatchObject({ label: '3 of 100', level: 3, xp: { total: 400, gained: 2 } });
    expect(Math.round(sheet.tracks[0].xp!.into)).toBe(17);
    expect(Math.round(sheet.tracks[0].xp!.needed!)).toBe(520);
    expect(sheet.tracks[0].next).toBe(sheet.tracks[0].xp!.progress);
    expect(sheet.tracks[0].xp!.progress).toMatch(/^17\.\d+ of 519\.\d+ XP to the next$/);
    // Formulas that read the level see the level reached.
    expect(computeSheet(game, { ...base, progress: { [level.id]: 9 }, xp: [xp(2700)] }).rows.find((r) => r.variable.name === 'Skill Slots')!.value).toBe(4);
    // A starting level is where the counting begins, not something experience has to pay for again.
    expect(computeSheet(game, { ...base, progress: { [level.id]: 20 }, xp: [xp(50)] }).tracks[0]).toMatchObject({ level: 20, xp: { gained: 0, into: 50 } });
    // With nothing logged the level is the number on the sheet, as it always was.
    expect(computeSheet(game, { ...base, progress: { [level.id]: 12 } }).tracks[0]).toMatchObject({ label: '12 of 100', level: 12, xp: null, next: 'Next level: 4156.92 XP' });
  });

  it('takes losses, stops at the cap, and does not climb a curve that asks for nothing', () => {
    expect(computeSheet(game, { ...base, xp: [xp(400), xp(-350)] }).tracks[0]).toMatchObject({ level: 1, xp: { total: 50 } });
    expect(computeSheet(game, { ...base, xp: [xp(400), xp(-900)] }).tracks[0]).toMatchObject({ level: 1, xp: { total: 0 } });
    const capped = { ...game, tracks: [{ ...level, cap: 3 }] };
    expect(computeSheet(capped, { ...base, xp: [xp(1e9)] }).tracks[0]).toMatchObject({ level: 3, next: 'At the cap' });
    const free = { ...game, tracks: [{ ...level, curve: '0' }] };
    expect(computeSheet(free, { ...base, xp: [xp(500)] }).tracks[0]).toMatchObject({ level: 1, xp: { gained: 0, needed: null } });
    const broken = { ...game, tracks: [{ ...level, curve: 'nonsense * 2' }] };
    expect(computeSheet(broken, { ...base, xp: [xp(500)] }).tracks[0]).toMatchObject({ level: 1 });
    expect(computeSheet(broken, { ...base, xp: [xp(500)] }).tracks[0].error).toBeTruthy();
    // Experience logged against something that is not a numbered track is ignored.
    expect(computeSheet(game, { ...base, xp: [{ ...xp(999), trackId: 'gone' }] }).tracks[0]).toMatchObject({ level: 1, xp: null });
  });

  it('gives points for each level gained, adds placed points to the attribute, and only reports overspending', () => {
    const none = computeSheet(game, base);
    expect(none.points).toBeNull();
    const sheet = computeSheet(game, { ...base, xp: [xp(400)], spent: { [v('Strength').id]: 4, [v('Vitality').id]: 1 } });
    expect(sheet.points).toEqual({ name: 'Points', earned: 6, spent: 5, unspent: 1 });
    const value = (name: string) => sheet.rows.find((r) => r.variable.name === name)!.value;
    expect([value('Strength'), value('Vitality'), value('Damage'), value('Max Health')]).toEqual([14, 11, 21, 210]);
    // A class adds on top of placed points, and the author's own number is the base they are placed on.
    const warrior = game.items.find((i) => i.name === 'Warrior')!;
    expect(computeSheet(game, { values: { [v('Strength').id]: 20 }, progress: {}, itemIds: [warrior.id], spent: { [v('Strength').id]: 2 } }).rows.find((r) => r.variable.name === 'Strength')!.value).toBe(27);
    // More placed than earned is the author's business: shown, never refused or trimmed.
    const over = computeSheet(game, { ...base, spent: { [v('Strength').id]: 2 } });
    expect(over.points).toEqual({ name: 'Points', earned: 0, spent: 2, unspent: -2 });
    expect(over.rows.find((r) => r.variable.name === 'Strength')!.value).toBe(12);
    // Points cannot be placed on a formula.
    expect(computeSheet(game, { ...base, spent: { [v('Damage').id]: 9 } }).points).toBeNull();
    // A blueprint whose levels bring nothing has no points to speak of.
    expect(computeSheet({ ...game, tracks: [{ ...level, points: 0 }] }, { ...base, xp: [xp(400)] }).points).toBeNull();
  });

  it('opens up skills as the level and attributes that gate them are reached', () => {
    const mage = game.items.find((i) => i.name === 'Mage')!;
    const names = (sheet: Parameters<typeof computeSheet>[1]) => computeSheet(game, sheet).available.map((i) => i.name);
    expect(names({ ...base, itemIds: [mage.id] })).toEqual(['Fireball']); // intelligence 10 + 6 from Mage
    expect(names(base)).toEqual([]);
    expect(names({ ...base, spent: { [v('Intelligence').id]: 5 } })).toEqual(['Fireball']);
    expect(names({ ...base, itemIds: [mage.id], progress: { [level.id]: 24 }, xp: [xp(11000)] })).toEqual(['Fireball']);
    expect(names({ ...base, itemIds: [mage.id], progress: { [level.id]: 24 }, xp: [xp(12000)] })).toEqual(['Void Mage', 'Fireball']); // 11,758 XP passes level 24
  });

  it('reads the level history off the log in story order, and settles a sheet as of a chapter', () => {
    const order = ['c1', 'c2', 'c3'];
    const position = (id: string | null) => (id === null ? -1 : order.indexOf(id));
    const sheet = { ...base, xp: [xp(300, 'c3', 'Boss'), xp(100, 'c1', 'Quest'), xp(20, null, 'Training')], spent: { [v('Agility').id]: 2 } };
    expect(xpHistory(game, sheet, position).map((h) => [h.entry.source, h.level])).toEqual([['Training', 1], ['Quest', 2], ['Boss', 3]]);
    expect(settle(game, sheet)).toEqual({ values: { [v('Agility').id]: 12 }, progress: { [level.id]: 3 }, itemIds: [] });
    expect(settle(game, sheet, (id) => position(id) <= 1).progress).toEqual({ [level.id]: 2 });
    // Nothing logged: the sheet's own numbers, untouched.
    expect(settle(game, { values: { [v('Agility').id]: 30 }, progress: { [level.id]: 7 }, itemIds: ['x'] })).toEqual({ values: { [v('Agility').id]: 30 }, progress: { [level.id]: 7 }, itemIds: ['x'] });
  });
});

describe('presets', () => {
  it('offers the four genres, and every formula and condition in them works', () => {
    expect(SYSTEM_PRESETS.map((p) => p.name)).toEqual(['LitRPG / Game System', 'Progression / Cultivation', 'Hard Magic / Elemental', 'Superhero / Mutant']);
    for (const { name, content } of SYSTEM_PRESETS) {
      const system = tidy(content);
      const problems = [
        ...system.variables.filter((v) => v.kind === 'derived').map((v) => [v.name, checkFormula(system, v.formula, 'number').error]),
        ...system.tracks.flatMap((t) => [[t.name, checkFormula(system, t.curve, 'number').error], ...t.stages.map((s) => [s.name, checkFormula(system, s.requires, 'condition').error])]),
        ...system.items.flatMap((i) => [[i.name, checkFormula(system, i.requires, 'condition').error], ...i.modifiers.map((m) => [i.name, checkFormula(system, m.value, 'number').error]), ...i.costs.map((c) => [i.name, checkFormula(system, c.amount, 'number').error])]),
        ...system.items.flatMap((i) => [...i.modifiers, ...i.costs].filter((x) => !system.variables.some((v) => v.key === x.target)).map((x) => [i.name, `unknown target ${x.target}`])),
        ...computeSheet(system, { values: {}, progress: {}, itemIds: system.items.map((i) => i.id) }).rows.map((r) => [r.variable.name, r.error]),
      ].filter(([, error]) => error);
      expect(problems, name).toEqual([]);
      expect(system.items.every((i) => !i.rankId || system.ranks.some((r) => r.id === i.rankId)), name).toBe(true);
      // Tidying a preset changes nothing: it is already well formed.
      expect(tidy(content), name).toEqual(content);
    }
  });

  it('makes a fresh, independent copy each time', () => {
    const [a, b] = [instantiate(preset('litrpg')), instantiate(preset('litrpg'))];
    const ids = (s: BlueprintContent) => [...s.variables, ...s.tracks, ...s.groups, ...s.items].map((x) => x.id);
    expect(new Set([...ids(a), ...ids(b)]).size).toBe(ids(a).length * 2);
    const voidMage = a.items.find((i) => i.name === 'Void Mage')!;
    expect(a.items.find((i) => i.id === voidMage.parentId)?.name).toBe('Mage');
    expect(a.groups.find((g) => g.id === voidMage.groupId)?.name).toBe('Classes');
    expect(preset('litrpg').items[0].id).toBe('i-warrior');
  });
});

describe('blueprints are whatever the author makes them', () => {
  it('accepts names, units, ranks and ladders that belong to no game', () => {
    // Written in the shape earlier versions stored: ranks, rows and columns as plain names, cells keyed by them.
    const odd = tidy({
      name: 'Tea Ceremony', description: '',
      variables: [
        { id: '', name: 'Steeping Patience', key: '', kind: 'number', unit: 'breaths', base: 7, formula: '', options: [], note: '' },
        { id: '', name: 'Steeping Patience', key: '', kind: 'number', unit: '', base: 1, formula: '', options: [], note: '' },
        { id: '', name: 'Leaf Grade', key: '', kind: 'choice', unit: '', base: 0, formula: '', options: ['Dust', ' Whole ', ''], note: '' },
        { id: '', name: 'Bitterness', key: 'bite', kind: 'derived', unit: '% of a frown', base: 0, formula: 'steeping_patience ^ 2 / if(Leaf Grade: Dust, 1, 7)', options: [], note: '' },
      ],
      tracks: [{ id: '', name: 'Standing', key: '', kind: 'stages', cap: 0, curve: '', curveUnit: '', stages: [{ id: '', name: 'Kettle-Carrier', requires: '', note: '' }, { id: '', name: 'Pourer of the Third Cup', requires: 'bite < 10', note: '' }] }],
      ranks: ['Lukewarm', 'Scalding'], groups: [{ id: 'g', name: 'Vows', single: false }],
      items: [{ id: '', groupId: 'g', name: 'Vow of Silence', description: '', parentId: 'nope', rank: 'Scalding', requires: 'Standing: Pourer of the Third Cup', modifiers: [{ id: '', target: 'steeping_patience', op: 'add', value: '3' }], costs: [], cooldown: 'until dawn', affinity: 'Smoke', evolution: '' },
        { id: '', groupId: 'gone', name: 'Orphan', description: '', parentId: null, rank: '', requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' }],
      matrices: [{ id: '', name: 'Pairings', rows: ['Smoke', 'Jasmine'], columns: ['Rain', ''], cells: { 'Smoke|Rain': 'Melancholy', 'Jasmine|Rain': ' ' } }],
    } as unknown as Partial<BlueprintContent>);
    expect(odd.variables.map((v) => v.key)).toEqual(['steeping_patience', 'steeping_patience_2', 'leaf_grade', 'bite']);
    expect(odd.variables[2].options).toEqual(['Dust', 'Whole']);
    expect(odd.items.map((i) => [i.name, i.parentId])).toEqual([['Vow of Silence', null]]);
    const [smoke, jasmine] = odd.matrices[0].rows;
    const [rain] = odd.matrices[0].columns;
    expect([smoke.name, jasmine.name, odd.matrices[0].columns.map((c) => c.name)]).toEqual(['Smoke', 'Jasmine', ['Rain']]);
    expect(odd.matrices[0].cells).toEqual({ [`${smoke.id}|${rain.id}`]: 'Melancholy' });
    expect(odd.ranks.map((r) => r.name)).toEqual(['Lukewarm', 'Scalding']);
    expect(rankName(odd, odd.items[0])).toBe('Scalding');
    expect([...odd.variables, ...odd.tracks, ...odd.tracks[0].stages, ...odd.items].every((x) => x.id)).toBe(true);
    const sheet = computeSheet(odd, { values: {}, progress: {}, itemIds: [odd.items[0].id] });
    expect(sheet.rows.map((r) => r.display)).toEqual(['10 breaths', '1', 'Dust', '100 % of a frown']);
    expect(sheet.items[0].unmet).toEqual(['Standing: Pourer of the Third Cup']);
    expect(toKey('Élan Vital (max)')).toBe('elan_vital_max');
  });
});

describe('systems in a project', () => {
  let db: NovelDB;
  let projects: ProjectService;
  let codex: CodexService;
  let systems: SystemsService;
  let n = 0;

  beforeEach(() => {
    db = new NovelDB(`systems-${++n}`);
    const registry = createProjectRegistry();
    projects = createProjectService(db, registry);
    registerCodex(registry);
    registerSystems(registry);
    codex = createCodexService(db, projects.contentChanged);
    systems = createSystemsService(db, projects.contentChanged);
  });

  it('creates blueprints empty or from a preset, edits them, and deletes them with their sheets', async () => {
    const p = await projects.create({ title: 'P' });
    const s = systems.forProject(p.id);
    const blank = await s.create();
    expect(blank).toMatchObject({ name: 'New system', variables: [], groups: [], items: [] });
    const game = await s.create(preset('litrpg'));
    expect([game.name, game.variables.length, game.items.length, game.tracks[0].cap]).toEqual(['The System', 12, 7, 100]);

    await Promise.all([
      s.update(game.id, () => ({ name: 'The Lattice' })),
      s.update(game.id, (c) => ({ ranks: [...c.ranks, { id: 'r-mythic', name: 'Mythic' }] })),
      s.update(game.id, (c) => ({ variables: [...c.variables, { id: '', name: 'Luck', key: '', kind: 'number', unit: '', base: 1, formula: '', options: [], note: '' }] })),
    ]);
    const stored = (await s.get(game.id))!;
    expect([stored.name, stored.ranks.at(-1)!.name, stored.variables.at(-1)!.key]).toEqual(['The Lattice', 'Mythic', 'luck']);

    const hero = await codex.forProject(p.id).create('character', 'Kai');
    await s.addSheet(game.id, hero.id);
    await s.remove(game.id);
    expect([(await s.list()).map((x) => x.name), await s.sheets()]).toEqual([['New system'], []]);
    expect(await codex.forProject(p.id).get(hero.id)).toBeDefined();
  });

  it('puts codex entries on a blueprint and keeps only what is theirs on the sheet', async () => {
    const p = await projects.create({ title: 'P' });
    const s = systems.forProject(p.id);
    const game = await s.create(preset('litrpg'));
    const kai = await codex.forProject(p.id).create('character', 'Kai');
    const blade = await codex.forProject(p.id).create('item', 'Sunblade');
    const sheet = await s.addSheet(game.id, kai.id);
    expect((await s.addSheet(game.id, kai.id)).id).toBe(sheet.id);
    await s.addSheet(game.id, blade.id);
    await expect(s.addSheet(game.id, 'nope')).rejects.toThrow('not in this project');

    const item = (name: string) => game.items.find((i) => i.name === name)!.id;
    const strength = game.variables[0].id;
    await s.updateSheet(sheet.id, (c) => ({ values: { ...c.values, [strength]: 18, nope: 3 }, progress: { [game.tracks[0].id]: 12, nope: 1 }, itemIds: [item('Warrior'), item('Mage'), item('Fireball'), item('Fireball'), 'nope'], note: 'ch. 3' }));
    const stored = (await s.sheets()).find((x) => x.id === sheet.id)!;
    // Classes are one at a time: the later choice stands. Unknown ids are dropped.
    expect(stored).toMatchObject({ values: { [strength]: 18 }, progress: { [game.tracks[0].id]: 12 }, itemIds: [item('Mage'), item('Fireball')], note: 'ch. 3' });
    expect(Object.keys(stored)).toEqual(expect.not.arrayContaining(['rows', 'computed']));
    const computed = computeSheet((await s.get(game.id))!, stored);
    expect(computed.rows.find((r) => r.variable.name === 'Damage')!.display).toBe('27');
    expect(computed.items.map((i) => i.item.name)).toEqual(['Mage', 'Fireball']);

    // Editing the blueprint reaches the character at once.
    await s.update(game.id, (c) => ({ items: c.items.map((i) => (i.name === 'Mage' ? { ...i, modifiers: [{ id: 'm', target: 'strength', op: 'multiply' as const, value: '2' }] } : i)) }));
    expect(computeSheet((await s.get(game.id))!, stored).rows.find((r) => r.variable.name === 'Damage')!.display).toBe('54');
    // Removing a skill from the blueprint takes it off the sheet's reckoning without touching the sheet.
    await s.update(game.id, (c) => ({ items: c.items.filter((i) => i.name !== 'Fireball') }));
    expect(computeSheet((await s.get(game.id))!, stored).items.map((i) => i.item.name)).toEqual(['Mage']);
    await s.removeSheet(sheet.id);
    expect(await s.sheets()).toHaveLength(1);
  });

  it('keeps experience and placed points on the sheet as entered, dropping only what points at nothing', async () => {
    const p = await projects.create({ title: 'P' });
    const s = systems.forProject(p.id);
    const game = await s.create(preset('litrpg'));
    expect(game.tracks[0]).toMatchObject({ points: 3, sources: ['Combat', 'Quest', 'Discovery', 'Training'] });
    const kai = await codex.forProject(p.id).create('character', 'Kai');
    const sheet = await s.addSheet(game.id, kai.id);
    expect(sheet).toMatchObject({ xp: [], spent: {} });
    const [level, strength, damage] = [game.tracks[0].id, game.variables.find((v) => v.name === 'Strength')!.id, game.variables.find((v) => v.name === 'Damage')!.id];
    await s.updateSheet(sheet.id, () => ({
      xp: [
        { id: '', trackId: level, amount: 400, source: ' Combat ', nodeId: 'not-a-chapter', note: ' Wolves ' },
        { id: 'keep', trackId: level, amount: -20, source: '', nodeId: null, note: '' },
        { id: 'zero', trackId: level, amount: 0, source: '', nodeId: null, note: '' },
        { id: 'lost', trackId: 'no-such-track', amount: 50, source: '', nodeId: null, note: '' },
        { id: 'nan', trackId: level, amount: Number.NaN, source: '', nodeId: null, note: '' },
      ],
      spent: { [strength]: 9, [damage]: 2, nowhere: 3 },
    }));
    const stored = (await s.sheets())[0];
    expect(stored.xp!.map((e) => [e.amount, e.source, e.nodeId, e.note])).toEqual([[400, 'Combat', null, 'Wolves'], [-20, '', null, '']]);
    expect(stored.xp![0].id).toBeTruthy();
    // Nine points placed with three earned (380 XP reaches level 2): stored as entered.
    expect(stored.spent).toEqual({ [strength]: 9 });
    expect(computeSheet(game, stored).points).toMatchObject({ earned: 3, spent: 9, unspent: -6 });
    // Editing something else leaves the log alone; a sheet from before levelling existed reads as having none.
    await s.updateSheet(sheet.id, (c) => ({ note: 'x', xp: c.xp }));
    expect((await s.sheets())[0].xp).toHaveLength(2);
    await db.systemSheets.update(sheet.id, { xp: undefined, spent: undefined });
    expect(computeSheet(game, (await s.sheets())[0])).toMatchObject({ points: null, tracks: [{ level: 1, xp: null }] });
    await s.updateSheet(sheet.id, () => ({ note: 'y' }));
    expect((await s.sheets())[0]).toMatchObject({ xp: [], spent: {} });
    // Named stages carry no levelling settings.
    const sect = await s.create(preset('cultivation'));
    expect(sect.tracks.filter((t) => t.kind === 'stages').every((t) => !('points' in t) && !('sources' in t))).toBe(true);
  });

  it('keeps systems inside their project, and carries them through copies and backups', async () => {
    const p = await projects.create({ title: 'P' });
    const s = systems.forProject(p.id);
    const realm = await s.create(preset('cultivation'));
    const kai = await codex.forProject(p.id).create('character', 'Kai');
    const sheet = await s.addSheet(realm.id, kai.id);
    await s.updateSheet(sheet.id, () => ({ progress: { [realm.tracks[0].id]: realm.tracks[0].stages[2].id }, itemIds: [realm.items[0].id] }));

    const other = systems.forProject((await projects.create({ title: 'Other' })).id);
    expect([await other.list(), await other.sheets(), await other.get(realm.id)]).toEqual([[], [], undefined]);
    await expect(other.update(realm.id, () => ({ name: 'x' }))).rejects.toThrow('not found');
    await expect(other.remove(realm.id)).rejects.toThrow('not found');
    await expect(other.addSheet(realm.id, kai.id)).rejects.toThrow('not found');
    await expect(other.updateSheet(sheet.id, () => ({ note: 'x' }))).rejects.toThrow('not in this project');
    const theirs = await other.create();
    await expect(other.addSheet(theirs.id, kai.id)).rejects.toThrow('not in this project');

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const copy = systems.forProject(projectId);
      const [system] = await copy.list();
      const [copied] = await copy.sheets();
      const entries = await codex.forProject(projectId).list();
      expect(system.id).not.toBe(realm.id);
      expect(copied.systemId).toBe(system.id);
      expect(entries.find((e) => e.id === copied.entryId)?.name).toBe('Kai');
      const computed = computeSheet(system, copied);
      expect([computed.tracks[0].label, computed.items[0].item.name, computed.rows.find((r) => r.variable.name === 'Lifespan')!.display]).toEqual(['Core Formation', 'Azure Breathing', '320 years']);
    }
    await projects.remove(p.id);
    expect([await s.list(), await s.sheets()]).toEqual([[], []]);
    expect(await other.list()).toHaveLength(1);
  });
});

describe('NAMES ARE NOT LINKS: ranks and tables', () => {
  let n = 0;
  const setup = () => {
    const db = new NovelDB(`systems-names-${++n}`);
    const registry = createProjectRegistry();
    const projects = createProjectService(db, registry);
    registerCodex(registry);
    registerSystems(registry);
    return { db, projects, systems: createSystemsService(db, projects.contentChanged) };
  };

  it('keeps items on a renamed rank and cells in a renamed row or column', async () => {
    const { projects, systems } = setup();
    const p = await projects.create({ title: 'P' });
    const s = systems.forProject(p.id);
    const game = await s.create(preset('litrpg'));
    const fireball = game.items.find((i) => i.name === 'Fireball')!;
    expect(rankName(game, fireball)).toBe('Advanced');
    await s.update(game.id, (c) => ({ ranks: c.ranks.map((r) => (r.name === 'Advanced' ? { ...r, name: 'Adept' } : r)) }));
    const renamed = (await s.get(game.id))!;
    expect(rankName(renamed, renamed.items.find((i) => i.id === fireball.id)!)).toBe('Adept');

    const magic = await s.create(preset('hard-magic'));
    const table = magic.matrices[0];
    const fire = table.rows.find((r) => r.name === 'Fire')!;
    const water = table.columns.find((c) => c.name === 'Water')!;
    expect(table.cells[`${fire.id}|${water.id}`]).toBe('Quenched');
    await s.update(magic.id, (c) => ({ matrices: c.matrices.map((m) => ({ ...m, rows: m.rows.map((r) => (r.id === fire.id ? { ...r, name: 'Flame' } : r)), columns: m.columns.map((col) => (col.id === water.id ? { ...col, name: 'Tide' } : col)) })) }));
    const after = (await s.get(magic.id))!.matrices[0];
    expect([after.rows.find((r) => r.id === fire.id)!.name, after.columns.find((c) => c.id === water.id)!.name, after.cells[`${fire.id}|${water.id}`]]).toEqual(['Flame', 'Tide', 'Quenched']);
  });

  it('brings blueprints stored by earlier versions to the new shape when the database opens, dropping nothing', async () => {
    const name = `systems-upgrade-${++n}`;
    const old = new Dexie(name);
    old.version(25).stores({ systems: 'id, projectId' });
    await old.table('systems').add({
      id: 'sys', projectId: 'p', name: 'Tea', description: '', variables: [], tracks: [], ranks: ['Lukewarm', 'Scalding'], groups: [{ id: 'g', name: 'Vows', single: false }],
      items: [
        { id: 'a', groupId: 'g', name: 'Vow of Silence', rank: 'Scalding' },
        { id: 'b', groupId: 'g', name: 'Vow of Dawn', rank: 'Boiling' },
        { id: 'c', groupId: 'gone', name: 'Kept though its group is gone', rank: '' },
      ],
      matrices: [{ id: 'm', name: 'Pairings', rows: ['Smoke'], columns: ['Rain'], cells: { 'Smoke|Rain': 'Melancholy', 'Ash|Rain': 'Kept, though no row is called Ash' } }],
      createdAt: 1, updatedAt: 1,
    });
    old.close();

    const db = new NovelDB(name);
    const row = (await db.systems.get('sys'))!;
    expect(row.ranks.map((r) => r.name)).toEqual(['Lukewarm', 'Scalding', 'Boiling']);
    expect(row.items.map((i) => [i.name, rankName(row, i)])).toEqual([['Vow of Silence', 'Scalding'], ['Vow of Dawn', 'Boiling'], ['Kept though its group is gone', '']]);
    expect(row.items.some((i) => 'rank' in i)).toBe(false);
    const [smoke] = row.matrices[0].rows;
    const [rain] = row.matrices[0].columns;
    expect(row.matrices[0].cells).toEqual({ [`${smoke.id}|${rain.id}`]: 'Melancholy', 'Ash|Rain': 'Kept, though no row is called Ash' });
    expect(row).toMatchObject({ name: 'Tea', updatedAt: 1 });
    db.close();
  });

  it('imports a project file from an earlier version with its ranks and cells attached', async () => {
    const { projects, systems } = setup();
    const p = await projects.create({ title: 'P' });
    await systems.forProject(p.id).create(preset('hard-magic'));
    const file = JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id)));
    // As an earlier version wrote it: ranks, rows and columns by name, items naming their rank.
    for (const sys of file.collections.systems) {
      const rank = new Map(sys.ranks.map((r: { id: string; name: string }) => [r.id, r.name]));
      sys.items = sys.items.map(({ rankId, ...item }: { rankId: string | null }) => ({ ...item, rank: rankId ? rank.get(rankId) : '' }));
      sys.ranks = sys.ranks.map((r: { name: string }) => r.name);
      for (const m of sys.matrices) {
        const label = new Map([...m.rows, ...m.columns].map((x: { id: string; name: string }) => [x.id, x.name]));
        m.cells = Object.fromEntries(Object.entries(m.cells).map(([key, value]) => [key.split('|').map((id) => label.get(id)).join('|'), value]));
        m.rows = m.rows.map((r: { name: string }) => r.name);
        m.columns = m.columns.map((c: { name: string }) => c.name);
      }
    }
    const copy = await projects.importSnapshot(file);
    const [imported] = await systems.forProject(copy.id).list();
    expect(rankName(imported, imported.items.find((i) => i.name === 'Flame Lance')!)).toBe('Lesser');
    const table = imported.matrices[0];
    const air = table.rows.find((r) => r.name === 'Air')!;
    const earth = table.columns.find((c) => c.name === 'Earth')!;
    expect(table.cells[`${air.id}|${earth.id}`]).toBe('Wears down');
  });
});
