// Reference outputs of the original app's systems, progression and ability paths: the formula language, sheets
// worked out from blueprints (presets included), tidying, levels from experience, change-by-change progression at
// every point, snapshots and their comparison, and the ability tree with what does not add up. On real files and a
// generated novel of growth (written beside the goldens so the Dart tests read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/growth.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { abilityTree, pathProblems, pathsOf, treeLayout } from '@/modules/abilities/paths';
import { buildModel } from '@/modules/model/model';
import { compare, inStoryOrder, resolveSystem, stateAt } from '@/modules/progression/state';
import { changeLog, inOrder, progressAt, progressSummary, whenWords, withoutProgressReference } from '@/modules/progression/track';
import { checkFormula, computeSheet, curveTable, settle, xpHistory } from '@/modules/systems/compute';
import { evaluate, formatNumber, namesIn, parse, unmet } from '@/modules/systems/formula';
import { SYSTEM_PRESETS } from '@/modules/systems/presets';
import { tidy } from '@/modules/systems/service';
import { toKey } from '@/modules/systems/types';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity') : v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v), 1);
const safe = <T>(f: () => T): T | { error: string } => {
  try {
    return f();
  } catch (e) {
    return { error: (e as Error).message };
  }
};

// ---------------------------------------------------------------------------------------------------- the growth novel

function growthNovel() {
  const P = 'growth';
  const year = (y: number) => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });
  const node = (id: string, title: string, order: number) => ({ id, projectId: P, parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: order, updatedAt: 0 });
  const entry = (id: string, name: string, category: string, fields: unknown[] = []) => ({ id, projectId: P, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields, createdAt: 0, updatedAt: 0 });
  const link = (id: string, fromId: string, toId: string, type: string, ends: Record<string, string> = {}) => ({ id, projectId: P, fromId, toId, fromLabel: '', toLabel: '', createdAt: 0, type, ...ends });
  const ab = { fromType: 'ability', toType: 'ability' };
  const item = (id: string, name: string, groupId: string, more: Record<string, unknown> = {}) => ({ id, groupId, name, description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '', ...more });
  const system = (id: string, name: string, more: Record<string, unknown>) => ({ id, projectId: P, name, description: '', variables: [], tracks: [], ranks: [], groups: [], items: [], matrices: [], createdAt: 0, updatedAt: 0, ...more });
  const ember = system('ember', 'Ember Arts', {
    variables: [{ id: 'v', name: 'Mana', key: 'mana', kind: 'resource', unit: '', base: 10, formula: '', options: [], note: '' }],
    ranks: [{ id: 'r1', name: 'Novice' }, { id: 'r2', name: 'Adept' }],
    groups: [{ id: 'g', name: 'Skills', single: false }],
    items: [
      item('spark', 'Spark', 'g', { rankId: 'r1' }),
      item('lance', 'Fire Lance', 'g', { parentId: 'spark', costs: [{ id: 'c', target: 'mana', amount: '5' }], cooldown: '1 turn' }),
      item('wall', 'Flame Wall', 'g', { requires: 'Skill: Fire Lance' }),
      item('nova', 'Nova', 'g', { requires: 'levl >= 5' }),
      item('inferno', 'Inferno', 'g'),
      item('loop1', 'Loop One', 'g', { parentId: 'loop2' }),
      item('loop2', 'Loop Two', 'g', { parentId: 'loop1' }),
    ],
  });
  const court = system('court', 'Court Ranks', { groups: [{ id: 'cl', name: 'Classes', single: true }], items: [item('squire', 'Squire', 'cl'), item('knight', 'Knight', 'cl')] });
  const lit = SYSTEM_PRESETS[0].content;
  const litrpg = { id: 'lit', projectId: P, ...lit, createdAt: 1, updatedAt: 0 };
  const techniques = { id: 's-tech', projectId: P, key: 'custom-tech', name: 'Techniques', singular: 'Technique', color: '#6b7a2b', builtin: false, order: 9, fields: [{ id: 'grade', name: 'Grade', type: 'select', options: ['Low', 'High'] }], uses: { tree: true, rank: 'grade' }, createdAt: 0, updatedAt: 0 };
  const tech = (id: string, name: string, grade = '') => entry(id, name, 'custom-tech', grade ? [{ id: `${id}-g`, key: '', value: grade, defId: 'grade' }] : []);
  const entries = [
    entry('mira', 'Mira', 'character'), entry('orrin', 'Orrin', 'character'), entry('pell', 'Pell', 'character'),
    tech('stance', 'Iron Stance'), tech('ember-stance', 'Ember Stance'), tech('fortress', 'Iron Fortress', 'High'),
    tech('palm', 'Palm Strike'), tech('kick', 'Kick'), tech('combo', 'Combo'),
    tech('ouro', 'Ouro'), tech('boros', 'Boros'), tech('tail', 'Tail Whip'), tech('solo', 'Solo Fusion'),
    entry('rusty', 'Rusty Blade', 'item'), entry('ashen', 'Ashen Blade', 'item'), entry('crown', 'Ember Crown', 'item'),
  ];
  const links = [
    link('l1', 'stance', 'fortress', 'prerequisite-for'), link('l2', 'ember-stance', 'fortress', 'prerequisite-for'), link('l3', 'stance', 'ember-stance', 'excludes'),
    link('l4', 'rusty', 'ashen', 'upgrades-to'),
    link('l5', 'court/squire', 'court/knight', 'evolves-into', ab), link('l6', 'court/knight', 'court/squire', 'evolves-into', ab),
    link('l7', 'palm', 'combo', 'alternative-for'), link('l8', 'kick', 'combo', 'alternative-for'),
    link('l9', 'ember/lance', 'ember/inferno', 'fuses-into', ab),
    link('l10', 'ouro', 'boros', 'prerequisite-for'), link('l11', 'boros', 'ouro', 'prerequisite-for'), link('l12', 'boros', 'tail', 'prerequisite-for'),
    link('l13', 'stance', 'kick', 'teaches'),
    link('l14', 'mira', 'stance', 'prerequisite-for'),
    link('l15', 'palm', 'solo', 'fuses-into'),
    link('l16', 'ember/spark', 'ember/lance', 'prerequisite-for', ab),
  ];
  const nodes = [node('c1', 'Chapter 1', 0), node('c2', 'Chapter 2', 1), node('c3', 'Chapter 3', 2)];
  const events = [
    { id: 'coronation', projectId: P, name: 'The coronation', description: '', when: year(10), end: null, ongoing: false, nodeIds: ['c2'], characters: [], entryIds: [], threadIds: [], labels: [], locationId: null, createdAt: 1 },
    { id: 'siege', projectId: P, name: 'The siege', description: '', when: year(12), end: null, ongoing: false, nodeIds: [], characters: [], entryIds: [], threadIds: [], labels: [], locationId: null, createdAt: 2 },
    { id: 'undated', projectId: P, name: 'Somewhen', description: '', when: { precision: 'unknown' }, end: null, ongoing: false, nodeIds: [], characters: [], entryIds: [], threadIds: [], labels: [], locationId: null, createdAt: 3 },
  ];
  const cat = (id: string, name: string, shape: string, order: number, more: Record<string, unknown> = {}) => ({ id, projectId: P, name, shape, ladder: [], characterIds: [], order, createdAt: 0, updatedAt: 0, ...more });
  const progressCategories = [
    cat('abilities', 'Abilities', 'held', 3), cat('level', 'Level', 'value', 0), cat('rank', 'Rank', 'value', 1, { ladder: ['Squire', 'Knight', 'Captain'] }),
    cat('attrs', 'Attributes', 'named', 2), cat('moments', 'Milestones', 'moment', 4), cat('scars', 'Scars', 'held', 5, { characterIds: ['mira'] }), cat('old', 'Old', 'value', 6, { archived: true }),
  ];
  const unknown = { kind: 'date', when: { precision: 'unknown' } };
  let n = 0;
  const change = (entryId: string, categoryId: string, action: string, more: Record<string, unknown> = {}) => ({ id: `p${++n}`, projectId: P, entryId, categoryId, action, subject: '', value: '', refId: null, abilityId: null, at: unknown, cost: '', note: '', createdAt: n, updatedAt: 0, ...more });
  const nodeAt = (id: string) => ({ kind: 'node', nodeId: id });
  const eventAt = (id: string) => ({ kind: 'event', eventId: id });
  const progress = [
    change('mira', 'abilities', 'gain', { refId: 'stance', subject: 'Iron Stance', at: nodeAt('c1') }),
    change('mira', 'abilities', 'gain', { refId: 'ember-stance', subject: 'Ember Stance' }),
    change('orrin', 'abilities', 'gain', { abilityId: 'ember/lance', subject: 'Fire Lance', at: nodeAt('c2') }),
    change('mira', 'level', 'set', { value: '1', at: null }),
    change('mira', 'level', 'set', { value: '3', at: nodeAt('c2'), cost: 'A scar', note: 'Hard won' }),
    change('mira', 'level', 'set', { value: '5', at: eventAt('siege') }),
    change('mira', 'rank', 'set', { value: 'Knight', at: nodeAt('c1') }),
    change('mira', 'rank', 'set', { value: 'Warlord', at: nodeAt('c3') }),
    change('mira', 'attrs', 'set', { subject: 'Strength', value: '6', at: eventAt('coronation') }),
    change('mira', 'attrs', 'set', { subject: 'strength', value: '8', at: nodeAt('c3') }),
    change('mira', 'attrs', 'set', { subject: 'Wits', value: '4', at: null }),
    change('mira', 'abilities', 'gain', { subject: 'Fire Lance', at: nodeAt('c1') }),
    change('mira', 'abilities', 'lose', { subject: 'Fire Lance', at: nodeAt('c3') }),
    change('mira', 'abilities', 'gain', { refId: 'crown', subject: '', at: eventAt('coronation') }),
    change('mira', 'abilities', 'lose', { refId: 'crown', subject: 'Ember Crown', at: nodeAt('c3') }),
    change('mira', 'moments', 'happen', { subject: 'First kill', at: nodeAt('c2') }),
    change('mira', 'moments', 'happen', { subject: 'Crowned', at: eventAt('coronation') }),
    change('mira', 'scars', 'gain', { subject: 'Burned hand', at: { kind: 'date', when: year(11) } }),
    change('mira', 'old', 'set', { value: 'kept', at: nodeAt('gone') }),
    change('pell', 'level', 'set', { value: 'over nine thousand', at: eventAt('undated') }),
    change('orrin', 'rank', 'set', { value: 'Squire', at: null }),
    change('orrin', 'rank', 'set', { value: 'Captain', at: eventAt('siege') }),
  ];
  const sheets = [
    { id: 'sh', projectId: P, systemId: 'ember', entryId: 'mira', values: {}, progress: {}, itemIds: ['spark', 'wall'], note: '', createdAt: 0, updatedAt: 0 },
    {
      id: 'sh-lit', projectId: P, systemId: 'lit', entryId: 'pell', values: { 'v-strength': 14 }, progress: { 't-level': 2 }, itemIds: ['i-mage', 'i-fireball', 'i-giant-slayer'],
      xp: [
        { id: 'x1', trackId: 't-level', amount: 300, source: 'Combat', nodeId: 'c1', note: '' },
        { id: 'x2', trackId: 't-level', amount: 900, source: 'Quest', nodeId: 'c3', note: '' },
        { id: 'x3', trackId: 't-level', amount: 50, source: '', nodeId: null, note: '' },
        { id: 'x4', trackId: 't-level', amount: -20, source: 'Curse', nodeId: 'c2', note: '' },
      ],
      spent: { 'v-agility': 4, 'v-damage': 3 }, note: '', createdAt: 0, updatedAt: 0,
    },
  ];
  const status = { condition: '', transformations: '', reputation: '', knowledge: '', goals: '' };
  const snapshot = (id: string, entryId: string, nodeId: string | null, systems: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ id, projectId: P, entryId, nodeId, label: '', systems, gear: [], status, notes: '', createdAt: Number(id.slice(1)), updatedAt: 0, ...more });
  const sys = (itemIds: string[], more: Record<string, unknown> = {}) => ({ auto: true, values: {}, progress: {}, itemIds, overrides: {}, ...more });
  const progressSnapshots = [
    snapshot('s1', 'orrin', 'c1', { court: sys(['squire']) }),
    snapshot('s2', 'orrin', 'c2', { court: sys(['knight']) }),
    snapshot('s3', 'pell', null, { lit: sys(['i-warrior'], { values: { 'v-strength': 12 }, progress: { 't-level': 1 } }) }, { gear: [{ id: 'g1', name: 'Rusty sword', kind: 'Weapon', entryId: 'rusty', note: '' }], status: { ...status, condition: 'Tired\nHungry', goals: 'Find the crown' } }),
    snapshot('s4', 'pell', 'c2', { lit: sys(['i-warrior', 'i-power-strike'], { values: { 'v-strength': 15 }, progress: { 't-level': 6 }, overrides: { 'v-damage': 99, 'v-mana': 'x' } }) }, { gear: [{ id: 'g2', name: 'rusty SWORD', kind: 'Carried', entryId: null, note: 'dull' }, { id: 'g3', name: 'Shield', kind: '', entryId: null, note: '' }], status: { ...status, condition: 'tired', goals: 'Find the crown\nAvenge Mira' } }),
    snapshot('s5', 'pell', 'c3', { lit: sys(['i-mage'], { auto: false, values: { 'v-strength': 3, 'v-max-health': 7 }, overrides: { 'v-mana': 1 } }) }),
    snapshot('s6', 'pell', 'gone', { lit: sys([]) }),
    snapshot('s7', 'pell', 'c2', { lit: sys(['i-warrior', 'i-power-strike']) }),
  ];
  return {
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 0,
    project: { id: P, title: 'Growth', subtitle: '', author: '', primaryGenre: '', secondaryGenres: [], cover: null, tags: [], synopsis: '', status: 'planning', targetWordCount: null, deadline: null, language: 'en', accent: '#b4532a', pinned: false, archived: false, createdAt: 1, updatedAt: 1, lastOpenedAt: null },
    collections: { chapters: nodes, loreSchemas: [techniques], loreEntries: entries, loreLinks: links, timelineEvents: events, systems: [ember, court, litrpg], systemSheets: sheets, progressCategories, progressChanges: progress, progressSnapshots },
  };
}

// ---------------------------------------------------------------------------------------------------- reports

const sheetOut = (s: ReturnType<typeof computeSheet>) => ({
  rows: s.rows.map((r) => ({ id: r.variable.id, value: r.value, display: r.display, sources: r.sources, error: r.error })),
  tracks: s.tracks.map((t) => ({ id: t.track.id, label: t.label, level: t.level, next: t.next, unmet: t.unmet, xp: t.xp, error: t.error })),
  items: s.items.map((i) => ({ id: i.item.id, group: i.group?.id ?? null, requires: i.requires, unmet: i.unmet, costs: i.costs, effects: i.effects, error: i.error })),
  available: s.available.map((i) => i.id),
  points: s.points,
});

function formulas() {
  const scope = {
    value: (name: string) => ({ strength: 12, level: 30, mana: 0, label: 'Fire', half: 0.5, neg: -3 } as Record<string, number | string>)[name.toLowerCase()],
    holds: (group: string, name: string) => (group.toLowerCase() === 'class' ? name.toLowerCase() === 'void mage' : group.toLowerCase() === 'title' ? false : undefined),
  };
  const texts = [
    'strength * 1.5', '100 * level ^ 1.5', 'max(1, floor(strength / 5))', 'min(3, 1, 2)', 'clamp(strength, 0, 10)', 'round(2.5)', 'round(-2.5)', 'ceil(half)', 'abs(neg)', 'sqrt(16)',
    'Class: Void Mage AND level >= 50', 'NOT (level < 3) OR Title: Chosen', 'Class: Void Mage and Title: Chosen', 'label = "fire"', "label != 'Water'", 'label = “Fire”', 'strength ≥ 10 × 1', '10 ÷ 4', '7 % 3', '-7 % 3', '2 ^ 3 ^ 2', '-2 ^ 2',
    'strength / mana', 'strength % mana', 'unknown + 1', 'Guild: Ash', 'label + 1', 'foo(1)', 'floor(1, 2)', 'clamp(1)', 'if(level > 10, 1, 2)', 'if(1, 2)', '[strength] + 1', 'true and yes', 'no or false',
    '', '(1 + 2', '1 +', '1 2', 'Class:', '§', 'max()', 'strength >= 10 && level > 1 || 0', '!strength', 'level <> 30', 'level == 30', '.5 + 1', 'strength = 12', 'label = 3',
  ];
  return texts.map((text) => {
    const parsed = safe(() => parse(text));
    if ('error' in (parsed as object) && !(parsed as { type?: string }).type) return { text, parse: parsed };
    const tree = parsed as ReturnType<typeof parse>;
    return { text, names: namesIn(tree), value: safe(() => evaluate(tree, scope)), unmet: safe(() => unmet(tree, scope)) };
  });
}

function systemsReport() {
  const profiles = (content: (typeof SYSTEM_PRESETS)[number]['content']) => {
    const item = (i: number) => content.items[i]?.id;
    const stage = (t: number, s: number) => content.tracks[t]?.stages[s]?.id;
    const v = (i: number) => content.variables[i]?.id;
    const t = (i: number) => content.tracks[i]?.id;
    const full = (x: Record<string, unknown>) => ({ values: {}, progress: {}, itemIds: [], ...x });
    return Object.fromEntries(Object.entries({
      empty: {},
      holding: { values: { [v(0)]: 20 }, progress: { [t(0)]: stage(0, 2) ?? 30 }, itemIds: [item(0), item(1), item(2), item(4), item(5)].filter(Boolean) },
      xp: { progress: { [t(0)]: 3 }, itemIds: [item(1)], xp: [{ id: 'a', trackId: t(0), amount: 5000, source: '', nodeId: null, note: '' }, { id: 'b', trackId: t(0), amount: -100, source: '', nodeId: null, note: '' }, { id: 'c', trackId: 'nope', amount: 3, source: '', nodeId: null, note: '' }], spent: { [v(0)]: 2, [v(1)]: 1, [v(4) ?? 'x']: 7 } },
      overrides: { overrides: { [v(0)]: 99, [v(content.variables.length - 1)]: 3 }, itemIds: content.items.map((i) => i.id) },
      odd: { values: { [v(0)]: 'text' }, progress: { [t(0)]: 'nonsense' }, itemIds: ['nope'] },
    }).map(([k, x]) => [k, full(x)])) as Record<string, Parameters<typeof computeSheet>[1]>;
  };
  const presets = Object.fromEntries(
    SYSTEM_PRESETS.map((p) => {
      const c = p.content;
      const sheets = Object.fromEntries(Object.entries(profiles(c)).map(([k, prof]) => [k, sheetOut(computeSheet(c, prof))]));
      const checks = Object.fromEntries(
        [...c.variables.map((v) => v.formula), ...c.items.map((i) => i.requires), ...c.tracks.flatMap((t) => [t.curve, ...t.stages.map((s) => s.requires)]), 'levl >= 5', 'Class: Nobody', 'Spirit Root: Lava', 'Cultivation Realm: Nowhere', 'Skill: Fireball', 'strength + 1', 'label', '"text"', 'Planet: Mars']
          .filter((x, i, l) => l.indexOf(x) === i)
          .map((text) => [text, { number: checkFormula(c, text, 'number'), condition: checkFormula(c, text, 'condition') }]),
      );
      const curves = Object.fromEntries(c.tracks.map((t) => [t.id, curveTable(c, t, [0, 1, 2, 3, 10, 99, 100, 101])]));
      const prof = profiles(c).xp!;
      return [p.id, { sheets, checks, curves, settle: settle(c, prof), settleNone: settle(c, prof, () => false), history: xpHistory(c, prof, () => 0).map((h) => ({ entry: h.entry.id, level: h.level, track: h.track.id })) }];
    }),
  );
  const tidied = tidy({
    name: '  ', description: 5 as never,
    variables: [{ name: 'Max Health', kind: 'odd' }, { name: 'Max Health', key: 'max_health' }, { id: 'x', name: '', base: 'x', options: ['a', '', 3] }, { name: 'Élan Vital' }] as never,
    tracks: [{ name: 'Level', points: -2, sources: ['A', 'A', ' ', 'B'] }, { name: 'Realm', kind: 'stages', stages: [{ name: '' }, { id: 'keep', name: 'Two', requires: 'x' }] }] as never,
    ranks: ['Low', { id: 'r', name: 'High' }, ''] as never,
    groups: [{ id: 'g', name: '' }, { id: 'h', name: 'Classes', single: true }] as never,
    items: [{ id: 'a', groupId: 'g', name: 'A', parentId: 'a', rank: 'Low' }, { id: 'b', groupId: 'h', name: '', parentId: 'a', rankId: 'r', modifiers: [{ target: 'x', op: 'pow', value: 2 }], costs: [{}] }, { id: 'c', groupId: 'none', name: 'Lost' }] as never,
    matrices: [{ name: '', rows: ['R'], columns: ['C'], cells: { 'R|C': 'hit', 'R|D': '  ', 'Q|C': 5 } }] as never,
  });
  // Ids made up by `tidy` are random: the report names them by where they are.
  const fresh = new Map<string, string>();
  const name = (id: string, where: string) => (/^[0-9a-f-]{36}$/.test(id) ? (fresh.get(id) ?? (fresh.set(id, `new:${where}`), `new:${where}`)) : id);
  const tidyOut = JSON.parse(JSON.stringify(tidied), function (key, value) {
    return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) ? name(value, key) : value;
  });
  return { presets, tidy: tidyOut, keys: ['Max Health', 'Élan  Vital!', '', '---', 'ﬁre', 'Strength 2', 'ÆON'].map(toKey), formatNumbers: [0, 1.005, 2.345, -1.5, 1e21, 1 / 3, NaN, Infinity].map(formatNumber), formulas: formulas() };
}

function novelReport(c: Record<string, any[]>, project: unknown) {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const snapshots = rows('progressSnapshots');
  const nodes = [...model.nodes.values()];
  const people = [...new Set([...model.progress.map((p) => p.entryId), ...snapshots.map((s) => s.entryId), ...model.sheets.map((s) => s.entryId)])].sort();
  const anchors: [string, any][] = [['end', 'end'], ...nodes.map((n) => [`node:${n.id}`, { kind: 'node', nodeId: n.id }] as [string, any]), ...[...model.events.keys()].map((id) => [`event:${id}`, { kind: 'event', eventId: id }] as [string, any]), ['date:11', { kind: 'date', when: { precision: 'exact', year: 11, month: null, day: null, hour: null, minute: null } }]];
  const stateOut = (s: ReturnType<typeof progressAt>) => ({
    categories: s.categories.map((x) => ({ category: x.category.id, lines: x.lines.map((l) => ({ subject: l.subject, value: l.value, change: l.change.id, step: l.step, uncertain: l.uncertain.map((u) => u.id) })), moments: x.moments.map((m) => m.id), lost: x.lost })),
    unplaced: s.unplaced.map((u) => u.id),
    untracked: s.untracked.map((u) => u.id),
  });
  const progression = Object.fromEntries(
    people.map((id) => {
      const ordered = inStoryOrder(snapshots, nodes, id);
      const systemsOf = [...model.systems.values()];
      return [
        id,
        {
          order: inOrder(model, id).map((x) => x.id),
          at: Object.fromEntries(anchors.map(([k, a]) => [k, stateOut(progressAt(model, id, a))])),
          summary: progressSummary(progressAt(model, id, 'end')),
          log: changeLog(model, id).map((l) => ({ change: l.change.id, words: l.words, before: l.before, when: l.when })),
          snapshots: ordered.map((s) => s.id),
          stateAt: Object.fromEntries([null, ...nodes.map((n) => n.id), 'gone'].map((n) => [String(n), stateAt(snapshots, nodes, id, n)?.id ?? null])),
          resolved: Object.fromEntries(ordered.flatMap((s) => Object.entries(s.systems).filter(([sid]) => model.systems.has(sid)).map(([sid, st]) => [`${s.id}/${sid}`, (() => {
            const r = resolveSystem(model.systems.get(sid)!, st as any);
            return { auto: r.auto, rows: r.rows.map((x) => ({ id: x.variable.id, value: x.value, display: x.display, byHand: x.byHand, systemSays: x.systemSays, sources: x.sources, error: x.error })), tracks: r.tracks.map((t) => ({ id: t.track.id, label: t.label, unmet: t.unmet, error: t.error })), items: r.items.map((i) => ({ id: i.item.id, unmet: i.unmet, effects: i.effects, error: i.error })), available: r.available.map((a) => a.id) };
          })()]))),
          compared: ordered.slice(1).map((s, i) => compare(ordered[i], s, systemsOf)),
        },
      ];
    }),
  );
  const sheets = model.sheets.map((s) => ({ id: s.id, sheet: model.systems.has(s.systemId) ? sheetOut(computeSheet(model.systems.get(s.systemId)!, s as any)) : null }));
  const tree = abilityTree(model, snapshots);
  const layout = treeLayout(tree.nodes.map((n) => n.key), tree.edges);
  return {
    progression,
    sheets,
    words: model.progress.map((p) => [p.id, whenWords(p.at, model)]),
    without: model.progress.slice(0, 6).map((p) => withoutProgressReference(p, (p.at as any)?.nodeId ?? (p.at as any)?.eventId ?? p.refId ?? 'x')),
    tree: {
      nodes: tree.nodes.map((n) => ({ key: n.key, name: n.name, source: n.source, sourceKey: n.sourceKey, color: n.color, rank: n.rank, requires: n.requires, limits: n.limits, holders: n.holders, acquired: n.acquired })),
      edges: tree.edges,
      notDrawn: tree.notDrawn.map((x) => ({ connection: x.connection.id, reason: x.reason })),
    },
    problems: pathProblems(tree, model),
    layout: { at: Object.fromEntries(layout.at), back: [...layout.back].sort(), width: layout.width, height: layout.height },
    pathsOf: Object.fromEntries(tree.nodes.slice(0, 20).map((n) => [n.key, [...pathsOf(tree, n.key)].sort()])),
  };
}

test('growth', () => {
  const out: Record<string, unknown> = {};
  writeFileSync(join(OUT, 'growth.novel.json'), JSON.stringify(growthNovel(), null, 1));
  writeFileSync(join(OUT, 'system_presets.json'), JSON.stringify(SYSTEM_PRESETS, null, 1));
  const files = { ...FIXTURES, growth: `${OUT}/growth.novel.json` };
  for (const [name, path] of Object.entries(files)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = novelReport(file.collections, file.project);
  }
  out.systems = systemsReport();
  writeFileSync(join(OUT, 'growth.golden.json'), json(out));
});
