// Scriptor's outputs for the readings of the cast, keyed and shaped exactly as dump.dart makes the Flutter app's (see
// there). Hashes are as ../../golden/outputs.ts makes them (canonical JSON, FNV-1a), in both languages.

import { type Listed } from '../../../../src/domain/characters/cast';
import { CastData } from '../../../../src/domain/characters/castData';
import { type CastMember, castCheck } from '../../../../src/domain/characters/castCheck';
import { CastNames, type EyesPerson, standingAt } from '../../../../src/domain/characters/castNames';
import { type Entrances, entrancesIn, entrancesJob } from '../../../../src/domain/characters/entrances';
import { type ArcPoint, type FeelingArcs, feelingArcs, feelingArcsJob, shapeOf } from '../../../../src/domain/characters/feelingArcs';
import { foilsOf, spreadAxes } from '../../../../src/domain/characters/foils';
import { sidesOf, traitsIn } from '../../../../src/domain/characters/thisOrThat';
import { byLetter, freeLetters, initialOf, lookAlikes, nameWords } from '../../../../src/domain/characters/nameBoard';
import { namedInJob } from '../../../../src/domain/characters/namedIn';
import { type ChapterEyes, chapterEyes, chapterEyesJob, eyesSummary } from '../../../../src/domain/characters/pov';
import { type CastVoice, type ReadPart, castVoices, tableRead, tableReadJob, voiceWord } from '../../../../src/domain/characters/tableRead';
import { chaptersTogether, untiedTogether } from '../../../../src/domain/characters/together';
import { type UnnamedRole, unnamedRoles, unnamedRolesJob } from '../../../../src/domain/characters/unnamedRoles';
import { type Spoken, spokenBy, spokenByEach, spokenJob } from '../../../../src/domain/characters/voice';
import { type VoicePrint, readVoice, voicePrintsJob } from '../../../../src/domain/characters/voicePrint';
import { manuscriptNames } from '../../../../src/domain/characters/nameFinder';
import { castMembers } from '../../../../src/domain/characters/views/castCheck';
import { temperamentOf } from '../../../../src/domain/characters/views/castCompass';
import { type Known, nextToKnow, orbitPlan, orbitSky } from '../../../../src/domain/characters/views/castOrbit';
import { DartRandom, easeOutBack, easeOutCubic } from '../../../../src/domain/characters/views/common';
import { namesInManuscript } from '../../../../src/domain/characters/views/manuscriptNames';
import { bookReading } from '../../../../src/domain/characters/views/readings';
import { relatedPairs } from '../../../../src/domain/characters/views/togetherOnPage';
import { waitingInputs } from '../../../../src/domain/characters/views/waitingForAName';
import { voiceInputs } from '../../../../src/domain/characters/views/theirVoice';
import { gendersOf } from '../../../../src/domain/characters/views/tableReadView';
import { blockTexts } from '../../../../src/domain/prose';
import { type JsonMap, str } from '../../../../src/domain/json';
import { type NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { dartTrim } from '../../../../src/domain/text/dartString';

const pairs = <K, V>(m: ReadonlyMap<K, V>, f: (v: V) => unknown) => [...m].map(([k, v]) => [String(k), f(v)]);

const eyesJson = (e: ChapterEyes) => ({ ...e });
const placeJson = (p: { chapter: number; nodeId: string; block: number; sentence: string } | null) =>
  p === null ? null : { chapter: p.chapter, nodeId: p.nodeId, block: p.block, sentence: p.sentence };
const entrancesJson = (e: Entrances) => ({
  order: e.order.map((x) => ({
    id: x.id,
    at: placeJson(x.at),
    gives: [...x.gives],
    talkedOf: placeJson(x.talkedOf),
    onStage: x.onStage,
  })),
  unseen: e.unseen,
  perChapter: e.perChapter,
  crowds: e.crowds.map((c) => ({ chapter: c.chapter, nodeId: c.nodeId, block: c.block, ids: c.ids })),
});
const pointJson = (p: ArcPoint | null) =>
  p === null
    ? null
    : {
        chapter: p.chapter,
        nodeId: p.nodeId,
        mentions: p.mentions,
        feeling: p.feeling,
        lines: p.lines.map((l) => ({ sentence: l.sentence, block: l.block, score: l.score })),
      };
const arcsJson = (a: FeelingArcs) => ({
  chapters: a.chapters,
  arcs: a.arcs.map((c) => ({
    id: c.id,
    points: c.points.map(pointJson),
    mentions: c.mentions,
    shape: c.shape,
    high: pointJson(c.high),
    low: pointJson(c.low),
  })),
  thin: a.thin,
});
const partJson = (p: ReadPart) => ({ block: p.block, text: p.text, line: p.line, speaker: p.speaker, likely: p.likely });
const voicesJson = (v: ReadonlyMap<string, CastVoice>) => pairs(v, (x) => ({ pitch: x.pitch, rate: x.rate }));
const roleJson = (r: UnnamedRole) => ({ ...r });
const spokenJson = (l: readonly Spoken[]) => l.map((s) => ({ nodeId: s.nodeId, block: s.block, words: s.words }));
const printJson = (p: VoicePrint) => ({ ...p });

export function reads(s: NovelSnapshot): Record<string, unknown> {
  const stored = s.rows('chapterContents').map((r) => JSON.stringify(r));
  const names = new CastData('novel', s).findNames;
  const named = namedInJob(stored, names)();
  const cast = new CastData('novel', s, { named });
  const model = cast.model;
  const list = cast.list;
  const documentIds = cast.documentIds;

  const { nodes, people } = bookReading(cast);
  const order = nodes.map((n) => n.id);
  const genders = gendersOf(cast);
  const eyes = chapterEyesJob(stored, order, new Map(nodes.map((n) => [n.id, n.title])), people)();

  const tables: Record<string, unknown> = {};
  const voices: Record<string, unknown> = {};
  for (const n of nodes) {
    const parts = tableReadJob(stored, n.id, people, { genders })();
    tables[n.id] = parts.map(partJson);
    const heard: string[] = [];
    for (const p of parts) if (p.speaker !== null && !heard.includes(p.speaker)) heard.push(p.speaker);
    voices[n.id] = voicesJson(
      castVoices(
        heard.map((id) => ({ id, gender: genders.get(id) ?? '' })),
        { nudged: new Map(heard.length > 0 ? [[heard[0], 2]] : []) },
      ),
    );
  }

  const { taken } = waitingInputs(cast, null, 0);
  const unnamed = unnamedRolesJob(stored, order, { taken })();
  const manuscript = namesInManuscript(cast, s.rows('chapterContents') as JsonMap[]);

  const pages = new Map<string, string[]>();
  for (const r of s.rows('chapterContents')) if (documentIds.includes(str(r['id']))) pages.set(str(r['id']), blockTexts(r['doc']));
  const speakers = voiceInputs(cast, '').people;
  const spoken = new Map([...speakers].map(([k, v]) => [k, spokenBy(pages, documentIds, v)]));
  const each = spokenByEach(pages, documentIds, speakers, { limit: 400 });
  const prints = voicePrintsJob(stored, documentIds, speakers)();
  const entryNames = new Map(cast.entries.map((e) => [e.id, dartTrim(e.name)]));

  const boardNames = [...model.entries.values()]
    .filter((e) => dartTrim(e.name).length > 0)
    .map((e) => ({ name: dartTrim(e.name), id: e.id, kind: e.category }));
  const board = byLetter(boardNames);

  const members: CastMember[] = castMembers(cast);
  const temperaments = list.filter((l) => !l.profile.archived).map(temperamentOf);
  const answered = temperaments.filter((t) => t.sides.size > 0);
  const foils = foilsOf(answered);

  const plan = orbitPlan(list, { hasChapters: model.order.chapters.length > 0 });
  const known = (l: Listed): Known => ({ known: Math.min(l.entry.fields.length, 6), of: 6 });
  const next = nextToKnow(plan, known);
  const skies: Record<string, unknown> = {};
  for (const width of [390.0, 900.0]) {
    for (const rise of [0.0, 0.5, 1.0]) {
      const sky = orbitSky(list, model.order, width, rise, { lit: list.length === 0 ? null : list[list.length - 1].entry.id });
      skies[`${width.toFixed(1)}@${rise.toFixed(1)}`] = rounded({
        height: sky.height,
        sun: sky.sun,
        heartT: sky.heartShown,
        heartAt: [sky.heartAt.x, sky.heartAt.y],
        hearts: sky.hearts.map((h) => ({ id: h.listed.entry.id, at: [h.at.x, h.at.y], size: h.size })),
        orbits: sky.orbits.map((o) => ({ ring: o.ring, rx: o.rx, ry: o.ry, dashed: o.dashed, shown: o.shown })),
        bodies: sky.bodies.map((b) => ({
          id: b.listed.entry.id,
          ring: b.ring,
          at: [b.at.x, b.at.y],
          size: b.size,
          share: b.share,
          shown: b.shown,
          named: b.named,
        })),
        tethers: sky.tethers.map((t) => ({ id: t.id, bend: [t.bend.x, t.bend.y], width: t.width, mix: t.mix, alpha: t.alpha })),
        stars: sky.stars.map((x) => [x.x, x.y, x.alpha, x.radius]),
      });
    }
  }

  return {
    people: people.map((p) => [p.id, p.names]),
    eyes: eyes.map(eyesJson),
    eyesSummary: (() => {
      const sum = eyesSummary(eyes);
      return {
        each: pairs(sum.each, (v) => ({ chapters: v.chapters, words: v.words })),
        words: sum.words,
        longestRun: sum.longestRun,
        since: pairs(sum.since, (v) => v),
      };
    })(),
    entrances: entrancesJson(entrancesJob(stored, order, people)()),
    arcs: arcsJson(feelingArcsJob(stored, order, people)()),
    tables,
    voices,
    taken: [...taken],
    unnamed: unnamed.map(roleJson),
    manuscript: manuscript.map((n) => ({ ...n })),
    spoken: pairs(spoken, spokenJson),
    spokenEach: pairs(each, spokenJson),
    spokenJob: Object.fromEntries([...speakers].map(([k, v]) => [k, spokenJson(spokenJob(stored, documentIds, v)())])),
    prints: prints.map(printJson),
    readVoice: Object.fromEntries(prints.map((p) => [p.id, readVoice(p.id, prints, entryNames)])),
    board: pairs(board, (v) => v.map((n) => ({ ...n }))),
    lookAlikes: lookAlikes(boardNames).map((a) => ({
      wordA: a.wordA,
      wordB: a.wordB,
      inA: a.inA.map((n) => n.id),
      inB: a.inB.map((n) => n.id),
      why: a.why,
    })),
    free: freeLetters(board),
    castCheck: castCheck(members, { chapters: model.order.chapters.length, most: 40 }).map((n) => ({ ...n })),
    together: pairs(chaptersTogether(list, model.order), (v) => v),
    untied: untiedTogether(list, model.order, { related: relatedPairs(cast) }).map((t) => ({ ...t })),
    temperaments: temperaments.map((t) => [t.id, pairs(t.sides, (v) => v)]),
    foils: {
      foils: foils.foils.map((p) => ({ ...p })),
      twins: foils.twins.map((p) => ({ ...p })),
      shared: foils.shared.map((x) => ({ ...x })),
      spread: spreadAxes(answered),
    },
    orbit: {
      heart: plan.heart.map((l) => l.entry.id),
      rings: pairs(plan.rings, (v) => v.map((l) => l.entry.id)),
      next: next?.entry.id ?? null,
      skies,
    },
  };
}

export function misc(): Record<string, unknown> {
  const cast: EyesPerson[] = [
    { id: 'wren', names: ['Wren Hollis', 'Wren'] },
    { id: 'kai', names: ['Kai'] },
    { id: 'mj', names: ['Mary-Jane'] },
    { id: 'ren', names: ['Ren Vane', 'Ren'] },
    { id: 'short', names: ['W'] },
    { id: 'droid', names: ['3PO'] },
    { id: 'zoe', names: ['Zoë'] },
    { id: 'obrien', names: ['O’Brien'] },
    { id: 'king1', names: ['the King'] },
    { id: 'king2', names: ['the King'] },
  ];
  const hard = [
    '“We cross at dawn,” said Wren Hollis. Wren looked at the water; a wren sang on the rail.',
    'Kai whispered: “Not before the tide.” Kai2 laughed. Mikai said nothing.',
    '“Is it far?” asked Mary-Jane. “Far enough,” Wren said. Wren and Kai went on.',
    'Nobody spoke.',
    '',
    'Ren Vane said, “Rank one is D tier.” Ren said nothing more.',
    'Kade Ash came. Kade’s bow, Kaden’s too, and kade. Zoë and Zoëy; O’Brien. the King spoke to 3PO and Mary-Jane, not Mary-Janet. “ 3PO R3PO',
    'I made it to the tower. My hands were raw, and I did not look back. Wren knew. Wren could see. Ren could run.',
    '“You’re late,” she said. Kai shook the water from his coat. “The road was out.” “Which road?” “The low one.”',
    'The waitress came over. The old guard slept; the guard’s dog barked. A Warden smiled. The guards marched. The waitress left.',
  ];
  const names = new CastNames(cast);
  const pages = new Map([['h1', hard]]);
  const hardNames = new Map(cast.map((p) => [p.id, p.names]));
  return {
    castNames: hard.map((t) => names.all(t).map((h) => [h.start, h.end, h.id, h.name])),
    standingAt: [
      standingAt('“ 3PO R3PO', '3PO'),
      standingAt('Kai said. Mikai said. Kai2.', 'Kai'),
      standingAt('Ölaf and Olaf, Olafsson', 'Olaf'),
      standingAt('anything', ''),
      standingAt('𝒜lan Alan', 'Alan'),
    ],
    spoken: Object.fromEntries([...hardNames].map(([k, v]) => [k, spokenJson(spokenBy(pages, ['h1'], v))])),
    spokenEach: Object.fromEntries(
      [1, 2, 60].map((limit) => [String(limit), pairs(spokenByEach(pages, ['h1'], hardNames, { limit }), spokenJson)]),
    ),
    eyes: chapterEyes([{ id: 'h1', title: 'Ferry', paragraphs: hard }], cast).map(eyesJson),
    entrances: entrancesJson(entrancesIn([{ id: 'h1', blocks: hard.map((t) => ({ heading: false, text: t })) }], cast)),
    arcs: arcsJson(feelingArcs(hard.map((t, i) => ({ id: `c${i}`, blocks: [{ heading: false, text: t }] })), cast)),
    table: tableRead(
      hard.map((t) => ({ heading: false, text: t })),
      cast,
      { genders: new Map([['kai', 'Male']]) },
    ).map(partJson),
    unnamed: unnamedRoles([
      { id: 'h1', paragraphs: hard },
      { id: 'h2', paragraphs: [...hard].reverse() },
    ]).map(roleJson),
    manuscript: manuscriptNames([
      [1, hard],
      [2, hard],
    ]).map((n) => ({ ...n })),
    shapes: [
      [-0.5, -0.4, 0.0, 0.3, 0.5],
      [0.5, 0.3, 0.0, -0.3, -0.5],
      [-0.4, 0.0, 0.5, 0.5, 0.0, -0.4],
      [0.1, 0.12, 0.08, 0.1],
      [0.4, 0.4, -0.3, 0.4],
      [0.2, -0.1, 0.3, -0.2, 0.25, -0.15, 0.1],
      [0.3, 0.1, -0.2, -0.3, -0.1, 0.2, 0.3, 0.33],
    ].map(shapeOf),
    voices: voicesJson(
      castVoices(
        [
          { id: 'mark', gender: 'Male' },
          { id: 'kai', gender: 'male' },
          { id: 'wren', gender: 'Female' },
          { id: 'sefa', gender: '' },
          { id: 'tam', gender: 'boy' },
          { id: 'ada', gender: 'girl' },
          { id: 'x', gender: 'm' },
        ],
        {
          nudged: new Map([
            ['mark', 2],
            ['sefa', -20],
            ['ada', 7],
          ]),
        },
      ),
    ),
    voiceWords: [0.6, 0.79, 0.8, 0.96, 0.97, 1.1, 1.11, 1.29, 1.3, 1.6].map((p) => voiceWord({ pitch: p, rate: 1.0 })),
    random: [0, 1, 7, 24, -3, 123456789].map((seed) => {
      const r = new DartRandom(seed);
      return [0, 1, 2, 3].map(() => r.nextDouble());
    }),
    nextInt: (() => {
      const r = new DartRandom(24);
      return Array.from({ length: 40 }, (_, i) => r.nextInt([60, 9, 11, 6, 2, 64, 1000, 3, 2 ** 31, 4294967296][i % 10]));
    })(),
    easing: [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0].map((t) => [easeOutCubic(t), easeOutBack(t)]),
    board: ['The Drowned Road', 'Wren Hollis', 'A Salt Ship', 'Élodie', 'the', '9 Lives', '', 'ßeta', 'An'].map(initialOf),
    nameWords: [nameWords('The Wardens’ Tower'), nameWords('Kit of the Quay'), nameWords('al-Rashid'), nameWords('Ilse’s Ö-Marrow')],
    foils: (() => {
      const traits: [string, string][] = [
        ['mark', 'Rational\nBold\nHonest\nCommanding\nLoud'],
        ['kai', 'Emotional, Cautious, Deceitful, Commanding, Quiet'],
        ['wren', 'Heart\nCautious\nHonest\nA night owl'],
        ['ilse', 'Rational\nCautious\nHonest\nDeferential\nQuiet\nTrusting'],
        ['nan', 'Rational\nCautious\nHonest\nCommanding\nQuiet\nTrusting'],
        ['tam', 'Honest\nTalkative\nGenerous'],
        ['jory', 'Honest, Quiet, Bold, Bold, Loud'],
        ['sefa', 'Nothing on the deck'],
      ];
      const cast = traits.map(([id, value]) => ({ id, sides: sidesOf(traitsIn(value)) }));
      const read = foilsOf(cast);
      return {
        sides: cast.map((t) => [t.id, pairs(t.sides, (v) => v)]),
        foils: read.foils.map((p) => ({ ...p })),
        twins: read.twins.map((p) => ({ ...p })),
        shared: read.shared.map((s) => ({ ...s })),
        spread: spreadAxes(cast),
        spreadFew: spreadAxes(cast.slice(0, 2)),
      };
    })(),
    castCheck: castCheck(
      ['Wren', 'Ilse', 'Crane', 'Nan', 'Kit', 'Jory', 'Doran', 'Tam', 'Bram', 'Ada'].map((name, i) => ({
        id: name.toLowerCase(),
        name,
        roles: [['Protagonist'], ['Supporting'], [' antagonist '], [], ['Mentor'], [], [], ['Love interest'], [], ['Minor']][i],
        chapters: new Set(
          [
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            [2, 9],
            [],
            [3, 5, 8],
            [1, 2, 3],
            [4, 6, 7],
            [4, 6, 7],
            [9, 1, 12],
            [5],
            [11],
          ][i],
        ),
        ties: i % 3 === 0 ? 0 : 1,
        gone: i === 4,
      })),
      { chapters: 12, most: 40 },
    ).map((n) => ({ ...n })),
  };
}

/** The orbit's numbers to nine places (as dump.dart's `rounded`): its sines and cosines are the platform's. */
function rounded(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? Number(v.toPrecision(9)) : v;
  if (Array.isArray(v)) return v.map(rounded);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)]));
  return v;
}
