// Scriptor's outputs for what dump.dart dumps of the Flutter app's Systems core, keyed and shaped the same way, made by
// the ported code (src/domain/systems/*, its screens' pure parts).

import { canonical } from '../../characters/golden/outputs';
import { ChangeRefused } from '../../../src/domain/codex/codexChanges';
import { type JsonMap, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { maps } from '../../../src/domain/records/jsonRecord';
import { SystemBlueprint, type SystemSheet } from '../../../src/domain/records/system';
import { type NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { climbsOf } from '../../../src/domain/systems/climb';
import { type ComputedSheet, SheetProfile, computeSheet, xpHistory } from '../../../src/domain/systems/compute';
import { faceOff } from '../../../src/domain/systems/faceOff';
import { ownSystemJob, systemFromPages } from '../../../src/domain/systems/fromPages';
import { SystemChanges } from '../../../src/domain/systems/systemChanges';
import { type MessageParts, brackets, messageLines } from '../../../src/domain/systems/systemMessage';
import { systemPresets } from '../../../src/domain/systems/systemPresets';
import { blueprintLines } from '../../../src/domain/systems/screens/gallery';
import { exampleHeld, statusWindowView } from '../../../src/domain/systems/screens/statusWindow';
import { windowKindOf } from '../../../src/domain/systems/screens/systemSpeaks';
import { dartTrim } from '../../../src/domain/text/dartString';

/** The status window's parts, from the screen's view, in the dump's shape. */
export function window(content: JsonMap, held: readonly string[], profile: SheetProfile | null, holder: string, compact: boolean): unknown {
  const view = statusWindowView({ content, presetId: 'litrpg', holder, held, caption: '', compact, profile });
  const standing: unknown[][] = [];
  for (const row of view.standing) {
    if (row.kind === 'line') standing.push(standing.length === 0 || compact ? [row.label, row.value] : [row.label, row.value, null]);
    else if (row.kind === 'next') standing[standing.length - 1][2] = row.text;
  }
  return {
    standing,
    resources: view.resources.map((r) => (r.kind === 'bar' ? [r.name, r.value, r.part] : null)),
    attributes: view.attributes.map((r) => (r.kind === 'line' ? [r.label, r.value, r.raised] : null)),
    follows: view.follows.map((r) => (r.kind === 'line' ? [r.label, r.value] : null)),
    groups: view.groups.map((g) => [g.label, g.held.map((h) => [h.name, h.rank, h.effects, h.from])]),
  };
}

export function sheetOut(s: ComputedSheet): unknown {
  return {
    rows: s.rows.map((r) => [r.variable.id, r.value, r.display, r.sources, r.error]),
    tracks: s.tracks.map((t) => [t.track.id, t.label, t.level, t.next, t.unmet, t.xp?.progress ?? null, t.error]),
    items: s.items.map((i) => [i.item.id, i.group?.id ?? null, i.requires, i.unmet, i.costs.map((c) => c.label), i.effects, i.error, i.from]),
    available: s.available.map((i) => i.id),
    points: s.points === null ? null : [s.points.earned, s.points.spent, s.points.unspent],
  };
}

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const systems = [...model.systems.values()];
  const sheets = model.sheets;
  const nameOf = (sh: SystemSheet): string => dartTrim(model.entries.get(sh.entryId)?.name ?? '');

  const windows: JsonMap = {};
  for (const system of systems) {
    const own: JsonMap = {};
    for (const sh of sheets) if (sh.systemId === system.id) own[sh.id] = window(system.raw, sh.itemIds, SheetProfile.of(sh), nameOf(sh), false);
    windows[system.id] = {
      kind: windowKindOf(system),
      example: exampleHeld(system.raw),
      lines: blueprintLines(system.raw),
      blank: window(system.raw, exampleHeld(system.raw), null, 'Your hero', false),
      sheets: own,
    };
  }

  const climbs: JsonMap = {};
  const history: JsonMap = {};
  const sheetsOut: JsonMap = {};
  const position = model.order.position;
  for (const sh of sheets) {
    const system = model.systems.get(sh.systemId);
    if (system === undefined) continue;
    sheetsOut[sh.id] = sheetOut(computeSheet(system, SheetProfile.of(sh)));
    climbs[sh.id] = climbsOf(system, sh, { chapterOf: model.order.chapterNumber, chapters: model.order.chapters.length, who: nameOf(sh) }).map((c) => ({
      track: c.track,
      cap: c.cap,
      actual: c.actual,
      projected: c.projected,
      perChapter: c.perChapter,
      unit: c.unit,
      says: c.says,
    }));
    history[sh.id] = xpHistory(system, SheetProfile.of(sh), (id) => (id === null ? -1 : (position.get(id) ?? 9007199254740991))).map((h) => [h.entry.id, h.level, h.track.id]);
  }

  const faces: JsonMap = {};
  for (const system of systems) {
    const mine = sheets.filter((sh) => sh.systemId === system.id && model.entries.has(sh.entryId));
    let n = 0;
    for (let i = 0; i < mine.length; i++) {
      for (let j = 0; j < mine.length; j++) {
        if (i === j || n >= 12) continue;
        n++;
        const f = faceOff(computeSheet(system, SheetProfile.of(mine[i])), computeSheet(system, SheetProfile.of(mine[j])), {
          aName: nameOf(mine[i]),
          bName: nameOf(mine[j]),
        });
        faces[`${mine[i].id}|${mine[j].id}`] = { rows: f.rows.map((r) => [r.name, r.a, r.b, r.unit, r.level]), says: f.says };
      }
    }
  }

  const entryPowers = [...model.entries.values()].filter((e) => e.category === 'power').map((e) => e.name);
  const own = ownSystemJob(
    s.rows('chapterContents').map((r) => JSON.stringify(r)),
    model.order.chapterNumber,
    entryPowers,
  )();

  return {
    windows,
    sheets: sheetsOut,
    climbs,
    history,
    faces,
    own:
      own === null
        ? null
        : {
            preset: own.preset.id,
            signs: own.signs.map((w) => [w.word, w.times]),
            powers: own.powers,
            abilityGroup: own.abilityGroup,
            items: maps(own.content['items']).map((i) => [i['id'], i['groupId'], i['name']]),
          },
    changes: changes(s, model),
  };
}

/** The dump's script of changes, its made-up ids renamed. */
function changes(s: NovelSnapshot, model: StoryModel): unknown {
  let n = 0;
  // UUID-shaped, as the Flutter app's are, so both sides' are renamed alike.
  const fresh = () => `fedcba98-7654-4321-8fed-${(n++).toString(16).padStart(12, '0')}`;
  const c = new SystemChanges(s, { now: 1700000000000, createId: fresh });
  const out: JsonMap = {};
  const stored = () => ({ systems: c.rows('systems'), sheets: c.rows('systemSheets'), links: c.rows('loreLinks').length });
  const refused = (f: () => void): string | null => {
    try {
      f();
      return null;
    } catch (e) {
      if (e instanceof ChangeRefused) return e.message;
      throw e;
    }
  };

  const made = systemPresets.map((p) => c.createSystem(p.content));
  const blank = c.createSystem();
  out['made'] = made.map((m) => m.id);
  out['blank'] = blank.raw;
  const entries = [...model.entries.keys()];
  const chapters = model.order.chapters.map((ch) => ch.id);
  if (entries.length > 0) {
    const game = made[0];
    const sheet = c.addSheet(game.id, entries[0]);
    out['again'] = c.addSheet(game.id, entries[0]).id === sheet.id;
    const system = c.systems().find((x) => x.id === game.id)!;
    const v = system.variables;
    const t = system.tracks;
    const spent: JsonMap = { [v[0].id]: 2 };
    for (const x of v) if (x.kind === 'derived') spent[x.id] = 3;
    if (v.length > 1) spent[v[1].id] = 0;
    c.updateSheet(sheet.id, () => ({
      itemIds: [...system.items.map((i) => i.id), 'nope', system.items[0].id],
      values: { [v[0].id]: 15, ...(v.length > 1 ? { [v[1].id]: 'x' } : {}), zz: 3 },
      progress: { [t[0].id]: 4, zz: 1 },
      xp: [
        { trackId: t[0].id, amount: 500, nodeId: chapters.length === 0 ? 'gone' : chapters[0], source: ' Combat ', note: ' n ' },
        { trackId: t[0].id, amount: 0 },
        { trackId: 'zz', amount: 5 },
        { trackId: t[0].id, amount: '5' },
        { id: 'keep', trackId: t[0].id, amount: -20, nodeId: 'gone' },
      ],
      spent,
      note: 7,
    }));
    out['sheet'] = c.row('systemSheets', sheet.id);
    // An item taken out takes the paths recorded to or from it.
    const first = system.items[0];
    c.put('loreLinks', { id: 'link-a', projectId: s.projectId, fromType: 'ability', fromId: `${game.id}/${first.id}`, toType: 'entry', toId: entries[0] });
    c.put('loreLinks', {
      id: 'link-b',
      projectId: s.projectId,
      fromType: 'entry',
      fromId: entries[0],
      toType: 'ability',
      toId: `${game.id}/${system.items[system.items.length - 1].id}`,
    });
    c.updateSystem(game.id, (cur) => ({ items: maps(cur.raw['items']).filter((i) => i['id'] !== first.id), name: '  ' }));
    out['updated'] = stored();
    const second = c.addSheet(made[1].id, entries[entries.length - 1]);
    out['second'] = second.id;
    c.removeSystem(made[1].id);
    out['removed'] = stored();
    c.removeSheet(sheet.id);
  }
  out['refusals'] = [
    refused(() => c.updateSheet('missing', () => ({}))),
    refused(() => c.addSheet(blank.id, 'missing')),
    refused(() => c.addSheet('missing', 'missing')),
    refused(() => c.removeSystem('missing')),
    refused(() => c.removeSheet('missing')),
    refused(() => c.updateSystem('missing', () => ({}))),
  ];
  out['end'] = stored();
  return renamed(out);
}

/** The ids the changes make are random in the Flutter app: each is named by where it is first met, walking the output
 * in its own order (a map's keys before its values); then the output is written canonically. */
function renamed(out: unknown): string {
  const names = new Map<string, string>();
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;
  const name = (s: string): string =>
    s.replace(new RegExp(uuid.source, 'g'), (m) => {
      if (!names.has(m)) names.set(m, `u${names.size}`);
      return names.get(m)!;
    });
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return name(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      // A row's key order is not its meaning: plain keys in order, keys holding an id as they were made.
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      const plain = keys.filter((k) => !uuid.test(k)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const ids = keys.filter((k) => uuid.test(k));
      const result: Record<string, unknown> = {};
      for (const k of [...plain, ...ids]) result[name(k)] = walk(o[k]);
      return result;
    }
    return v;
  };
  return canonical(walk(out));
}

const part = (kind: MessageParts['kind'], more: Partial<MessageParts>): MessageParts => ({
  kind,
  who: '',
  track: '',
  level: 1,
  name: '',
  rank: '',
  stat: '',
  from: 0,
  by: 1,
  detail: '',
  ...more,
});

export function misc(): Record<string, unknown> {
  const parts: MessageParts[] = [
    part('levelUp', { who: 'Wren', track: 'Level', level: 5, detail: '+5 points\n\n  to assign  ' }),
    part('levelUp', { who: '  ', track: '  ' }),
    part('skill', { name: 'Fireball', rank: 'F', detail: 'Burns' }),
    part('skill', { rank: ' ' }),
    part('stat', { stat: 'Strength', from: 12, by: 2 }),
    part('stat', { from: 1.25, by: -0.5 }),
    part('stat', { stat: 'Luck', from: 9.95, by: 0.1 }),
    part('title', { name: 'Chosen', rank: 'S' }),
    part('quest', { name: 'Find the bell', detail: 'Reward: 100 XP\nTime: a day' }),
    part('questDone', {}),
    part('warning', { name: 'Mana low' }),
  ];
  const messages = parts.flatMap((p) => brackets.map((b) => messageLines(p, b)));
  const books: [string[], string[]][] = [
    [['She gained a level. The skill rose; skills, skills, Skill.', 'Her class: Mage. The system spoke.'], []],
    [['Qi gathered in the dantian. The realm broke; realms; Realms.', 'The sect elder gave a pill.'], ['Iron Body']],
    [['A spell, a rune, mana and mana.', 'The wizard cast spells.'], ['Fireball', ' fireball ', '', 'Ward']],
    [['The hero and the villain. Powers! Superpowers.'], []],
    [['Nothing here at all.'], []],
    [['Nothing here at all.'], ['Shadow Step']],
    [['level qi spell hero'], []],
    [[], []],
  ];
  const pages = books.map(([texts, powers]) => {
    const f = systemFromPages(texts, powers);
    return f === null
      ? null
      : [f.preset.id, f.signs.map((w) => [w.word, w.times]), f.powers, f.abilityGroup, maps(f.content['items']).map((i) => [i['id'], i['groupId'], i['name']])];
  });
  const presets: JsonMap = {};
  for (const p of systemPresets) {
    presets[p.id] = {
      kind: windowKindOf(new SystemBlueprint(p.content)),
      example: exampleHeld(p.content),
      lines: blueprintLines(p.content),
      window: window(p.content, exampleHeld(p.content), null, 'Your hero', true),
    };
  }
  return { messages, pages, presets };
}

/** For a test's own check: a name made safe for a key. */
export const key = (v: unknown): string => str(v);
