// Scriptor's outputs for phase 5c's page readings and character progression, keyed and shaped as dump.dart's, so the
// agreement test can compare them with the Flutter app's (progression.golden.json). See dump.dart for what is read.

import { CharacterProfile } from '../../../src/domain/characters/characterRecords';
import { namesToFind } from '../../../src/domain/characters/namedIn';
import { ChangeRefused } from '../../../src/domain/codex/codexChanges';
import { type JsonMap, mapOrNull, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { readingOrder } from '../../../src/domain/model/storyOrder';
import { isDocument } from '../../../src/domain/outline';
import { type ChartSeries, chartSeries } from '../../../src/domain/progression/screens/progressChart';
import { addNames } from '../../../src/domain/progression/screens/pagesNamesView';
import {
  type Comparison,
  ProgressSnapshot,
  SnapshotChanges,
  type SystemState,
  compareSnapshots,
  resolveSystem,
} from '../../../src/domain/progression/snapshots';
import { TrackChanges } from '../../../src/domain/progression/trackChanges';
import { maps } from '../../../src/domain/records/jsonRecord';
import { type NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { SheetProfile, computeSheet } from '../../../src/domain/systems/compute';
import { type LevelChapter, type LevelStep, type Levelled, cleanLevelName, levelsInPages, levelsInPagesJob, ownerIn } from '../../../src/domain/systems/levelsInPages';
import { type Ledger, type LedgerEntry, numberLedger, numberLedgerJob } from '../../../src/domain/systems/numberLedger';
import { type PageName, namesInPages, namesInPagesJob } from '../../../src/domain/systems/pagesNames';
import { SystemChanges } from '../../../src/domain/systems/systemChanges';
import { dartToLowerCase } from '../../../src/domain/text/dartString';

// ---------------------------------------------------------------------------------------------------- as JSON

const stepJson = (s: LevelStep) => ({ ...s });
const levelledJson = (l: Levelled) => ({
  name: l.name,
  family: l.family,
  steps: l.steps.map(stepJson),
  mentions: l.mentions,
  owner: l.owner,
  self: l.self,
});
const entryJson = (e: LedgerEntry) => ({ ...e });
const ledgerJson = (l: Ledger) => ({
  lines: l.lines.map((x) => ({ name: x.name, track: x.track, entries: x.entries.map(entryJson) })),
  slips: l.slips.map((s) => ({ kind: s.kind, name: s.name, at: entryJson(s.at), says: s.says })),
});
const nameJson = (n: PageName) => ({ ...n });

/** A number as JSON carries it: non-finite ones as words. */
const js = (v: unknown): unknown =>
  typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity') : v;

const resolvedJson = (r: SystemState) => ({
  auto: r.auto,
  rows: r.rows.map((row) => ({
    id: row.variable.id,
    value: js(row.value),
    display: row.display,
    byHand: row.byHand,
    systemSays: row.systemSays,
    sources: row.sources,
    error: row.error,
  })),
  tracks: r.tracks.map((t) => ({ id: t.track.id, label: t.label, level: t.level, unmet: t.unmet, error: t.error })),
  items: r.items.map((i) => ({ id: i.item.id, unmet: i.unmet, effects: i.effects, error: i.error, from: i.from })),
  available: r.available.map((a) => a.id),
});

const comparisonJson = (c: Comparison) => ({
  stats: c.stats.map((x) => ({ ...x, delta: js(x.delta) })),
  advancement: c.advancement,
  gained: c.gained,
  lost: c.lost,
  gear: c.gear,
  status: c.status,
  same: c.same,
});

const seriesJson = (s: ChartSeries) => ({
  name: s.name,
  points: s.points.map((p) => ({ at: p.at, y: js(p.y), value: p.value, when: p.when })),
  ladder: s.ladder,
});

// ---------------------------------------------------------------------------------------------------- reads

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Ids handed out in turn. */
function idsFrom(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}

/** A step of a script: what it gave (as JSON), or the refusal. */
function step(run: () => unknown): unknown {
  try {
    return { ok: run() ?? null };
  } catch (e) {
    if (e instanceof ChangeRefused) return { refused: e.message };
    throw e;
  }
}

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const entries = [...model.entries.values()].sort((a, b) => byCodeUnits(a.id, b.id));
  const profiles = new Map<string, CharacterProfile>();
  for (const r of [...s.rows('characterProfiles')].sort((a, b) => byCodeUnits(str(b['id']), str(a['id'])))) {
    profiles.set(str(r['entryId']), new CharacterProfile(r));
  }
  const names = namesToFind(entries, profiles);
  const people = entries
    .filter((e) => e.category === 'character' && (names[e.id] ?? []).length > 0)
    .map((e) => ({ id: e.id, names: names[e.id] }));
  const stored = s.rows('chapterContents').map((r) => JSON.stringify(r));
  const order = readingOrder(model.nodes.values())
    .filter((n) => isDocument(n.kind))
    .map((n) => n.id);
  const out: Record<string, unknown> = {};

  // Levels: as the pages give them; and with the author's word on the first and the second set aside.
  const levels = levelsInPagesJob(stored, order, new Set(), { people })();
  out['levels'] = levels.map(levelledJson);
  if (levels.length > 0) {
    const word = new Map([[dartToLowerCase(levels[0].name), people.length === 0 ? '' : people[people.length - 1].id]]);
    const aside = new Set(levels.length > 1 ? [dartToLowerCase(levels[1].name)] : []);
    out['levelsGiven'] = levelsInPagesJob(stored, order, aside, { people, assigned: word })().map(levelledJson);
  }

  // The ledger and the names in the pages, for each system; the names with none.
  const systems = [...model.systems.values()].sort((a, b) => byCodeUnits(a.id, b.id));
  out['names'] = namesInPagesJob(stored, order)().map(nameJson);
  for (const system of systems) {
    const sheets = model.sheets.filter((x) => x.systemId === system.id && model.entries.has(x.entryId));
    const sheet = new Map<string, number>();
    if (sheets.length === 1) {
      const c = computeSheet(system, SheetProfile.of(sheets[0]));
      for (const r of c.rows) if (typeof r.value === 'number') sheet.set(r.variable.name, r.value);
      for (const t of c.tracks) if (t.level !== null) sheet.set(t.track.name, t.level);
    }
    out[`ledger:${system.id}`] = ledgerJson(
      numberLedgerJob(stored, order, {
        stats: system.variables.map((v) => v.name),
        tracks: system.tracks.filter((t) => t.kind === 'levels').map((t) => t.name),
        sheet,
      })(),
    );
    out[`names:${system.id}`] = namesInPagesJob(stored, order, { known: system.items.map((i) => i.name) })().map(nameJson);
    // Names added to it, as the view adds them.
    const x = new SystemChanges(s, { now: 1000, createId: idsFrom('add') });
    const add = (name: string, thing: PageName['thing'], rank: string): PageName => ({
      name,
      thing,
      rank,
      times: 1,
      chapter: 1,
      nodeId: 'n',
      block: 0,
      said: '',
    });
    const added = addNames(model, system.id, [
      add('Tide Sense', 'skill', 'E'),
      add('Giant Slayer', 'title', ''),
      add('Warden', 'kit', 'Common'),
      add('Tide Glass', 'item', ''),
    ]).change(x);
    out[`added:${system.id}`] = {
      ids: added,
      system: x.row('systems', system.id),
      sheets: x.rows('systemSheets').filter((r) => r['systemId'] === system.id),
    };
  }

  // Each person's chart series.
  const persons = [...new Set(model.progress.map((p) => p.entryId))].sort(byCodeUnits);
  out['charts'] = Object.fromEntries(persons.map((id) => [id, chartSeries(model, id).map(seriesJson)]));

  // The tracker's changes, on a copy.
  const who = entries.filter((e) => e.category === 'character').map((e) => e.id);
  const first = who[0] ?? entries[0]?.id ?? null;
  const other = entries.find((e) => e.id !== first)?.id ?? null;
  const chapter = order[0] ?? null;
  const event = [...model.events.keys()][0] ?? null;
  const t = new TrackChanges(s, { now: 1000, createId: idsFrom('track') });
  let level: string | null = null;
  let titles: string | null = null;
  let oaths: JsonMap | null = null;
  let recorded: string | null = null;
  const script: unknown[] = [
    step(() => (level = t.addPreset('Level').id)),
    step(() => (titles = t.addPreset('Titles').id)),
    step(() => t.addPreset('Attributes').id),
    step(() => t.addPreset('Milestones').id),
    step(() => t.addPreset('level').id),
    step(() => t.addPreset('Level').id),
    step(() => (oaths = t.saveCategory(null, { name: '  Oaths ', shape: 'held' }).raw)),
    step(() => t.saveCategory(null, { name: 'oaths' }).raw),
    step(() => t.saveCategory(null, { name: '   ' }).raw),
    step(() => t.saveCategory(null, { name: 'Odd', shape: 'weird' }).raw),
  ];
  if (first !== null) {
    const attributes = t.categories().find((c) => c.name === 'Attributes')!.id;
    const milestones = t.categories().find((c) => c.name === 'Milestones')!.id;
    script.push(
      step(
        () =>
          (recorded = t.record({
            entryId: first,
            categoryId: level,
            action: 'set',
            value: ' 4 ',
            at: chapter === null ? null : { kind: 'node', nodeId: chapter },
          }).id),
      ),
      step(() => t.record({ entryId: first, categoryId: level, action: 'set', value: '6' }).raw),
      step(
        () =>
          t.record({
            entryId: first,
            categoryId: titles,
            action: 'gain',
            subject: 'Giant Slayer',
            at: event === null ? { kind: 'date', when: { precision: 'unknown' } } : { kind: 'event', eventId: event },
            cost: ' A friend ',
          }).raw,
      ),
      step(() => t.record({ entryId: first, categoryId: titles, action: 'lose', refId: other, at: null }).raw),
      step(() => t.record({ entryId: first, categoryId: milestones, action: 'happen', subject: 'First kill', note: 'n' }).raw),
      step(() => t.record({ entryId: first, categoryId: attributes, action: 'set', subject: 'Strength', value: '12' }).raw),
      step(() => t.record({ entryId: first, categoryId: attributes, action: 'set', value: '12' }).raw),
      step(() => t.record({ entryId: first, categoryId: level, action: 'gain', value: '1' }).raw),
      step(() => t.record({ entryId: first, categoryId: level, action: 'set', value: '  ' }).raw),
      step(() => t.record({ entryId: 'nobody', categoryId: level, action: 'set', value: '1' }).raw),
      step(() => t.record({ entryId: first, categoryId: 'nope', action: 'set', value: '1' }).raw),
      step(() => t.record({ entryId: first, categoryId: titles, action: 'gain', abilityId: 'x/y' }).raw),
      step(() => t.record({ entryId: first, categoryId: level, action: 'set', value: '2', at: { kind: 'node', nodeId: 'gone' } }).raw),
      step(
        () =>
          t.record({
            entryId: first,
            categoryId: level,
            action: 'set',
            value: '2',
            at: { kind: 'date', when: { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'day', before: false } },
          }).raw,
      ),
      step(
        () => t.record({ entryId: first, categoryId: level, action: 'set', value: '2', at: { kind: 'date', when: { precision: 'exact', year: 12 } } }).raw,
      ),
      step(() => t.record({ entryId: first, categoryId: level, action: 'set', value: '2', at: 'nonsense' }).raw),
      step(() => t.updateChange(recorded ?? 'none', { value: '5' }).raw),
      step(() => t.updateChange(recorded ?? 'none', { at: null, note: 'moved' }).raw),
      step(() => t.updateChange('none', { value: '5' }).raw),
      step(() => t.saveCategory(level, { shape: 'held' }).raw),
      step(() => t.saveCategory(level, { ladder: ['Squire', ' Knight ', '', 'Squire'], characterIds: [first, 'nope', first], order: 7 }).raw),
      step(() => t.saveCategory(level, { archived: true }).raw),
      step(() => t.record({ entryId: first, categoryId: level, action: 'set', value: '9' }).raw),
      step(() => t.updateChange(recorded ?? 'none', { value: '8' }).raw),
      step(() => {
        t.removeCategory(level!);
        return true;
      }),
      step(() => {
        t.removeCategory((oaths as JsonMap | null)!['id'] as string);
        return true;
      }),
      step(() => {
        t.removeChange(recorded!);
        return true;
      }),
      step(() => {
        t.removeChange('none');
        return true;
      }),
    );
  }
  out['track'] = {
    script,
    categories: t.rows('progressCategories'),
    changes: t.rows('progressChanges'),
    ordered: t.categories().map((c) => c.id),
  };

  // Snapshots, on a copy: for each person with a sheet or a snapshot (else the first character).
  const holders = [...new Set([...model.sheets.map((x) => x.entryId), ...s.rows('progressSnapshots').map((r) => str(r['entryId']))])].sort(byCodeUnits);
  const logged: unknown[] = [];
  const snaps = new SnapshotChanges(s, { now: 2000, createId: idsFrom('snap') });
  for (const id of holders.length === 0 ? (first === null ? [] : [first]) : holders) {
    let a: ProgressSnapshot | null = null;
    let b: ProgressSnapshot | null = null;
    logged.push(step(() => (a = snaps.createSnapshot(id, { label: ' Start ' })).raw));
    logged.push(step(() => (b = snaps.createSnapshot(id, { nodeId: chapter, label: 'Ch1' })).raw));
    logged.push(step(() => snaps.createSnapshot(id, { nodeId: 'missing' }).raw));
    const made = b as ProgressSnapshot | null;
    if (made !== null) {
      logged.push(
        step(() => {
          snaps.updateSnapshot(made.id, (c) => ({
            label: ' New ',
            gear: [
              ...maps(c.raw['gear']),
              { name: 'Sword', kind: 'Weapon' },
              { name: '  ' },
              { id: 'kept', name: ' Shield ', entryId: other, note: 'dented' },
            ],
            status: { condition: 'Hurt\n\n Tired ', goals: 'Home' },
            systems: { ...(mapOrNull(c.raw['systems']) ?? {}), nope: {} },
          }));
          return snaps.row('progressSnapshots', made.id);
        }),
      );
      logged.push(
        step(() => {
          snaps.updateSnapshot(made.id, () => ({ nodeId: order.length > 1 ? order[1] : 'missing', notes: 'n' }));
          return snaps.row('progressSnapshots', made.id);
        }),
      );
      const now = new ProgressSnapshot(snaps.row('progressSnapshots', made.id)!);
      const resolved: Record<string, unknown> = {};
      for (const [sid, st] of now.systems) {
        const system = model.systems.get(sid);
        if (system !== undefined) resolved[sid] = resolvedJson(resolveSystem(system, st));
      }
      const start = a as ProgressSnapshot | null;
      logged.push({
        resolved,
        ...(start !== null ? { compared: comparisonJson(compareSnapshots(start, now, [...model.systems.values()])) } : {}),
      });
    }
    const start = a as ProgressSnapshot | null;
    if (start !== null) {
      logged.push(
        step(() => {
          snaps.removeSnapshot(start.id);
          return true;
        }),
      );
    }
  }
  logged.push(step(() => snaps.createSnapshot('nobody').raw));
  logged.push(
    step(() => {
      snaps.updateSnapshot('none', () => ({}));
      return true;
    }),
  );
  logged.push(
    step(() => {
      snaps.removeSnapshot('none');
      return true;
    }),
  );
  out['snapshots'] = { script: logged, rows: snaps.rows('progressSnapshots') };
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

const book = (chapters: readonly string[]): LevelChapter[] => chapters.map((text, i) => ({ id: `c${i + 1}`, paragraphs: [text] }));

const levelTexts = [
  'The armor answered him. Archer Armor Level 1. The bow settled into his hands.',
  'He drew on it again, and the Archer Armor reached Level 2. Then Hunter Armor (Lv. 1) woke.',
  'Hunter Armor Level 2 hummed. The Hunter Armor’s level rose to 4. It was a Level 6 Hunter Armor now.',
  '[Hunter Armor: Lv 7] Then Hunter Armor hit level 9! The Hunter Armor leveled up. [Hunter Armor Level Up!]',
  'Then James’s Hunter Armor reached Level 3. Wren reached Level 5. Tide Sense Lv. 2 flickered.',
  'His Spear of the Deep was now at Level 4. Suddenly Fireball reached Level 10. LVL. 3 Fireball?',
  'The curse struck, and the Hunter Armor dropped to Level 30. The Hunter Armor was Level 20.',
  'Kade and Mira watched the Ember Lamp reach Level 3. Kade’s Ember Lamp reached Level 4.',
  'Kade knew the forest. Kade felt the cold come down. Kade saw the wolves. His Wolf Fang reached Level 2.',
  'Mira lifted the Tide Spear, and the Tide Spear hit Level 2. The Tide Spear has finally reached Level 5.',
  'He wore the Hunter Armor into the rain. The level of the river rose. Floor Level 3 was dark.',
  'The Blade of the North Wind evolved into Level 12. The Old Crown became Level 2… and fell to Level 1.',
  '[Ash Ring Lv.4] [Ash Ring — Level 5] [Ash Ring- Level 6] Ash Ring LVL 7. Ash Ring lvl8.',
  'The Mirror’s level was 3. Mirror Level 3 again. Kira’s Mirror rose to Level 99999.',
];

const people = [
  { id: 'kade', names: ['Kade Ash', 'Kade'] },
  { id: 'mira', names: ['Mira'] },
  { id: 'kira', names: ['Kira'] },
];

const ledgerTexts = [
  ['Kael checked his status. Strength 10. Level 1.', 'HP: 100 / 230'],
  ['[Strength +2 (10 → 12)]', 'He had reached Level 2 at last.', 'Agility = 7. Agility is now 9.'],
  ['Strength 13. Level 4.', '[Strength +2 (12 → 15)]', 'By then he was Level 3.'],
  ['Strength 13. Level 2. Then Strength +2 (12 -> 14). Level 1.', 'By dusk her HP 3.5 and falling. Later.'],
  ['Superstrength 40. Strength 50% of his best. Levelled 3 times.', 'Strength −1 (14 to 13). HP of 12.5.'],
  ['【Strength +0 (13 → 13)】 Level at 9. Agility +1.5 (9 → 10.5).', 'Strength 007. Level 99999999999999999999.'],
];

const nameTexts = [
  ['[Skill acquired: Tide Sense (E)]', 'Title earned: Giant Slayer.'],
  ['【Class unlocked: Warden】', '<Item obtained: Tide Glass>', 'New skill: Spark, and then nothing.'],
  ['He used [Power Strike] again.', '[Power Strike] missed.', 'Skills gained: Storm Step (B).'],
  ['[Title earned: Ironside]', 'They called him [Ironside].', '[Power Strike] hit.', 'spell: fire bolt.'],
  ['[Status]', '[Level up!]', '[Warning]', '[This is a whole sentence in brackets here]', '[Fireball]', '[Spark]'],
  ['Ability unlocked: Shadow Veil (SSS). Technique learned: Iron Body! Power granted: Flame Heart (Rare)'],
  ['Item received: a cracked lantern', 'Class chosen: Rune Knight (A)', '[Rune Knight]', '[New Quest]'],
];

export function misc(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out['levels'] = levelsInPages(book(levelTexts)).map(levelledJson);
  out['levelsPeople'] = levelsInPages(book(levelTexts), { people }).map(levelledJson);
  out['levelsAside'] = levelsInPages(book(levelTexts), {
    setAside: new Set(['hunter armor', 'fireball']),
    people,
    assigned: new Map([
      ['tide spear', 'kade'],
      ['ember lamp', ''],
      ['wolf fang', 'nobody'],
    ]),
  }).map(levelledJson);
  out['levelsUp'] = levelsInPages(book(['The Hunter Armor leveled up.'])).map(levelledJson);
  out['cleaned'] = ['Then The', 'He', 'James’s Hunter Armor', 'Now the Spear of the', "Kade's", 'Status', '  The Old Crown  '].map((raw) => [
    cleanLevelName(raw),
    ownerIn(raw),
  ]);
  const chapters = (texts: readonly (readonly string[])[]) => texts.map((p, i) => ({ id: `c${i}`, paragraphs: p }));
  out['ledger'] = ledgerJson(numberLedger(chapters(ledgerTexts), { stats: ['Strength', 'HP', 'Agility', ' ', 'S'], tracks: ['Level'] }));
  out['ledgerSheet'] = ledgerJson(
    numberLedger(chapters(ledgerTexts), {
      stats: ['Strength', 'HP', 'Agility'],
      tracks: ['Level'],
      sheet: new Map([
        ['level', 6],
        ['HP', 40],
        ['strength', 13],
        ['Agility', 10.5],
      ]),
    }),
  );
  out['names'] = namesInPages(chapters(nameTexts)).map(nameJson);
  out['namesKnown'] = namesInPages(chapters(nameTexts), { known: ['fireball', ' Power Strike '], setAside: ['Spark'] }).map(nameJson);
  return out;
}
