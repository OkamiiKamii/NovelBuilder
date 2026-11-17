// The readings of the cast, as the Flutter app's own tests hold them: ports of flutter_app/test/shared/domain/
// cast_names_test, cast_check_test, foils_test, entrances_test, feeling_arcs_test, name_board_test, name_finder_test,
// pov_test, table_read_test, unnamed_roles_test, voice_test, voice_print_test, and the parts of name_reading_test and
// fingerprint_and_voices_test about the cast's names and lines (the old searches they compare with are replaced by the
// rule itself and by spokenBy, and every output is held to the real Dart by agreement.test.ts).

import { type CastMember, castCheck } from '../../../src/domain/characters/castCheck';
import { CastNames, type EyesPerson, standingAt } from '../../../src/domain/characters/castNames';
import { type Gives, entrancesIn } from '../../../src/domain/characters/entrances';
import { type ArcChapter, arcShapeClassic, feelingArcs, shapeOf } from '../../../src/domain/characters/feelingArcs';
import { type Temperament, foilsOf, spreadAxes, traitOf } from '../../../src/domain/characters/foils';
import { type BoardName, byLetter, freeLetters, initialOf, lookAlikes, nameWords, oneApart } from '../../../src/domain/characters/nameBoard';
import { knownWords, manuscriptNames, plainName } from '../../../src/domain/characters/nameFinder';
import { type ChapterEyes, chapterEyes, eyesSummary } from '../../../src/domain/characters/pov';
import { type ReadPart, castVoices, lowestPitch, tableRead, voiceWord } from '../../../src/domain/characters/tableRead';
import { unnamedRoles } from '../../../src/domain/characters/unnamedRoles';
import { spokenBy, spokenByEach } from '../../../src/domain/characters/voice';
import { readVoice, voicePrints } from '../../../src/domain/characters/voicePrint';
import { dartEscape } from '../../../src/domain/characters/pageText';
import { blockTexts } from '../../../src/domain/prose';
import { str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath } from '../../fixtures';
import { largeNovelText } from './largeNovel';

// ---------------------------------------------------------------------------------------------------- cast_names

/** What the searches the finder replaces found: every place each name stands, per name, per character. */
function searched(text: string, people: readonly EyesPerson[]): Set<string> {
  const out = new Set<string>();
  for (const p of people) {
    p.names.forEach((n, i) => {
      if (n.trim().length === 0) return;
      for (const m of text.matchAll(new RegExp(`(?<![\\p{L}])${dartEscape(n.trim())}(?![\\p{L}])`, 'gu'))) {
        out.add(`${m.index},${m.index + m[0].length},${p.id},${i}`);
      }
    });
  }
  return out;
}
const found = (text: string, names: CastNames) => new Set(names.all(text).map((h) => `${h.start},${h.end},${h.id},${h.name}`));

describe('the cast’s names, found', () => {
  test('the same places the per-name searches found, over a whole large novel and its four hundred characters', () => {
    const { cast, scenes } = largeNovelText();
    const people = cast.map((e) => ({ id: e.id, names: [e.name, e.name.split(' ')[0]] }));
    expect(people).toHaveLength(400);
    const names = new CastNames(people);
    let paragraphs = 0;
    let hits = 0;
    for (const scene of scenes.slice(0, 120)) {
      for (const text of scene.paragraphs) {
        paragraphs++;
        const want = searched(text, people);
        expect(found(text, names)).toEqual(want);
        hits += want.size;
      }
    }
    expect(paragraphs).toBeGreaterThan(500);
    expect(hits).toBeGreaterThan(100);
  });

  test('a word of its own, case and all; possessives, punctuation, accents, shared names, names not starting with a letter', () => {
    const people = [
      { id: 'kade', names: ['Kade Ash', 'Kade'] },
      { id: 'zoe', names: ['Zoë'] },
      { id: 'obrien', names: ['O’Brien'] },
      { id: 'king1', names: ['the King'] },
      { id: 'king2', names: ['the King'] },
      { id: 'droid', names: ['3PO'] },
      { id: 'mary', names: ['Mary-Jane'] },
    ];
    const text =
      'Kade Ash came. Kade’s bow, Kaden’s too, and kade. Zoë and Zoëy; O’Brien. the King spoke to 3PO and Mary-Jane, ' +
      'not Mary-Janet.';
    const names = new CastNames(people);
    expect(found(text, names)).toEqual(searched(text, people));
    expect(names.all(text).map((h) => text.substring(h.start, h.end))).toEqual([
      'Kade Ash', 'Kade', 'Kade', 'Zoë', 'O’Brien', 'the King', 'the King', '3PO', 'Mary-Jane',
    ]);
    expect(names.named('Nothing here but Kaden.').size).toBe(0);
    expect(names.named('the King nodded.')).toEqual(new Set(['king1', 'king2']));
    expect(new CastNames([]).isEmpty).toBe(true);
  });

  test('a name that is not a word of letters is found by the rule: no letter just before it, none just after', () => {
    expect(standingAt('“ 3PO R3PO', '3PO')).toEqual([2]);
    expect(standingAt('Kai said. Mikai said. Kai2.', 'Kai')).toEqual([0, 22]);
    expect(standingAt('Ölaf and Olaf, Olafsson', 'Olaf')).toEqual([9]);
    expect(standingAt('anything', '')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------- cast_check

const member = (
  name: string,
  chapters: number[],
  o: { roles?: string[]; ties?: number; gone?: boolean } = {},
): CastMember => ({
  id: name.toLowerCase(),
  name,
  roles: o.roles ?? [],
  chapters: new Set(chapters),
  ties: o.ties ?? 0,
  gone: o.gone ?? false,
});

describe('the cast, checked', () => {
  test('a principal the book forgets', () => {
    const notes = castCheck(
      [
        member('Wren', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { roles: ['Protagonist'] }),
        member('Ilse', [2, 9], { roles: ['Supporting'], ties: 2 }),
        member('Crane', [], { roles: ['Antagonist'] }),
      ],
      { chapters: 10 },
    );
    expect(notes.map((n) => n.says)).toEqual([
      'Ilse is one of your principals, but in 2 of 10 chapters.',
      'Crane is your antagonist, but not yet in any of the 10 chapters.',
    ]);
  });

  test('gone quiet: there for a stretch, then nothing long before the end; not the dead', () => {
    const notes = castCheck(
      [member('Nan', [3, 5, 8], { ties: 1 }), member('Kit', [1, 2, 3], { ties: 1, gone: true }), member('Sefa', [4, 9, 15], { ties: 1 })],
      { chapters: 15 },
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].says).toBe('Nan is in chapters 3 to 8, then gone: 7 chapters without them. A thread left hanging?');
  });

  test('always together: two, neither a lead, on the same pages; once each', () => {
    const notes = castCheck(
      [
        member('Jory', [3, 5, 8], { ties: 1 }),
        member('Doran', [3, 5, 8], { ties: 1 }),
        member('Wren', [3, 5, 8], { roles: ['Protagonist'], ties: 3 }),
        member('Tam', [3, 5, 8, 9], { ties: 1 }),
      ],
      { chapters: 9 },
    );
    const together = notes.filter((n) => n.kind === 'together');
    expect(together).toHaveLength(1);
    expect(together[0].who).toEqual(['jory', 'doran']);
    expect(together[0].says).toContain('every time (chapters 3, 5 and 8)');
  });

  test('light: one chapter, no ties, not a principal; and nothing said of a young book', () => {
    const notes = castCheck([member('Bram', [2]), member('Ada', [2], { ties: 1 })], { chapters: 4 });
    expect(notes.map((n) => n.who[0])).toEqual(['bram']);
    expect(castCheck([member('Bram', [2])], { chapters: 2 })).toEqual([]);
  });

  test('the weightiest kind first, at most four', () => {
    const cast = [member('Lead', [1], { roles: ['Protagonist'] }), ...[0, 1, 2, 3, 4, 5].map((i) => member(`Extra${i}`, [i + 2]))];
    const notes = castCheck(cast, { chapters: 10 });
    expect(notes).toHaveLength(4);
    expect(notes[0].kind).toBe('forgotten');
  });
});

// ---------------------------------------------------------------------------------------------------- foils

describe('foils and twins', () => {
  const t = (id: string, sides: Record<string, number>): Temperament => ({ id, sides: new Map(Object.entries(sides)) });

  test('a foil: opposed on most of what both answered, the most opposed first', () => {
    const f = foilsOf([
      t('mark', { head: -1, risk: 1, truth: -1, lead: -1, room: 1 }),
      t('kai', { head: 1, risk: -1, truth: 1, lead: -1, room: -1 }),
      t('wren', { head: 1, risk: -1, truth: -1 }),
    ]);
    const first = f.foils[0];
    expect([first.a, first.b, first.both, first.opposed]).toEqual(['mark', 'kai', 5, 4]);
    expect(first.differ).toEqual(['room', 'head', 'risk', 'truth']);
    expect(f.foils.map((p) => `${p.a}-${p.b}`)).toEqual(['mark-kai', 'mark-wren']);
  });

  test('twins: alike on all but one of four or more; too few in common, not compared', () => {
    const f = foilsOf([
      t('ilse', { head: -1, risk: -1, truth: -1, lead: 1 }),
      t('nan', { head: -1, risk: -1, truth: -1, lead: -1 }),
      t('jory', { head: 1, risk: 1 }),
    ]);
    expect(f.twins.map((p) => `${p.a}-${p.b}:${p.alike}`)).toEqual(['ilse-nan:3']);
    expect(f.foils).toEqual([]);
  });

  test('a trait the whole cast shares, from four or more; the trait words', () => {
    const f = foilsOf(['a', 'b', 'c', 'd'].map((id) => t(id, { truth: -1, risk: id === 'a' ? 1 : -1 })));
    expect(f.shared.map((s) => [s.axis, s.side, s.count])).toEqual([['truth', -1, 4]]);
    expect(traitOf('truth', -1)).toBe('Honest');
    expect(traitOf('head', 1)).toBe('Emotional');
  });

  test('the axes the cast spreads across most, for the compass', () => {
    expect(spreadAxes([])).toEqual(['room', 'plan']);
    const [x, y] = spreadAxes([
      t('a', { head: -1, risk: 1, room: 1 }),
      t('b', { head: 1, risk: -1, room: 1 }),
      t('c', { head: 1, risk: 1, room: 1 }),
    ]);
    expect(new Set([x, y])).toEqual(new Set(['head', 'risk']));
  });
});

// ---------------------------------------------------------------------------------------------------- entrances

describe('entrances', () => {
  const people = [
    { id: 'kade', names: ['Kade Ash', 'Kade'] },
    { id: 'mira', names: ['Mira'] },
    { id: 'abbot', names: ['the Grey Abbot', 'Abbot'] },
    { id: 'tobin', names: ['Tobin'] },
    { id: 'wren', names: ['Wren'] },
  ];
  const book = (chapters: string[][]) =>
    chapters.map((paragraphs, i) => ({ id: `c${i + 1}`, blocks: paragraphs.map((text) => ({ heading: false, text })) }));

  test('the cast in order of appearance, each with the sentence they enter in', () => {
    const e = entrancesIn(
      book([['The road was empty.', 'Kade Ash drew his bow. The wolves were close.'], ['Mira watched the gate.'], ['Rain.', 'At last Tobin came down the stair.']]),
      people,
    );
    expect(e.order.map((x) => [x.id, x.at.chapter, x.at.block])).toEqual([
      ['kade', 1, 1],
      ['mira', 2, 0],
      ['tobin', 3, 1],
    ]);
    expect(e.order[0].at.sentence).toBe('Kade Ash drew his bow.');
    expect(e.unseen).toEqual(['abbot', 'wren']);
    expect(e.perChapter).toEqual([1, 1, 1]);
  });

  test('what the first moment gives: seen, speaks, acts, in their head, or nothing but a name', () => {
    const gives = (paragraphs: string[]) =>
      Object.fromEntries(entrancesIn(book([paragraphs]), people).order.map((x) => [x.id, [...x.gives].sort()]));
    const of = (...g: Gives[]) => g.sort();
    expect(gives(['Kade drew his bow.'])).toEqual({ kade: of('acts') });
    expect(gives(['Mira was tall, her grey hair cut short.'])).toEqual({ mira: of('seen') });
    expect(gives(['“Run,” Tobin said.'])).toEqual({ tobin: of('speaks') });
    expect(gives(['Wren knew the forest better than anyone.'])).toEqual({ wren: of('thinks') });
    expect(gives(['There was a letter from Kade on the table.'])).toEqual({ kade: [] });
    expect(gives(['Tobin was mending a net when Mira had fallen through the floor.'])).toEqual({ tobin: of('acts'), mira: of('acts') });
    expect(gives(['Tobin was nothing to her.'])).toEqual({ tobin: [] });
    expect(gives(['Then the Grey Abbot.'])).toEqual({ abbot: [] });
  });

  test('talked of before they appear; only ever talked of', () => {
    const e = entrancesIn(
      book([
        ['“The Abbot will come for us,” said Kade.'],
        ['Rain all day.'],
        ['The Grey Abbot stepped through the door, his robes black with water.'],
        ['“Wren would know,” Kade said.'],
      ]),
      people,
    );
    const abbot = e.order.find((x) => x.id === 'abbot')!;
    expect([abbot.at.chapter, abbot.talkedOf?.chapter, abbot.onStage]).toEqual([3, 1, true]);
    expect(abbot.gives).toEqual(new Set(['acts', 'seen']));
    const wren = e.order.find((x) => x.id === 'wren')!;
    expect([wren.at.chapter, wren.onStage]).toEqual([4, false]);
    expect(e.order.map((x) => x.id)).toEqual(['kade', 'abbot', 'wren']);
  });

  test('a crowded door: three or more entering in one paragraph', () => {
    const e = entrancesIn(book([['Kade, Mira, Tobin and Wren sat round the fire.', 'Then the Abbot came.']]), people);
    expect(e.crowds[0].ids).toEqual(['kade', 'mira', 'tobin', 'wren']);
    expect(e.crowds).toHaveLength(1);
    expect(e.perChapter).toEqual([5]);
  });

  test('headings are skipped but counted as blocks, so read it there finds the paragraph', () => {
    const e = entrancesIn(
      [{ id: 'c1', blocks: [{ heading: true, text: 'Kade' }, { heading: false, text: 'Kade ran.' }] }],
      people,
    );
    expect(e.order).toHaveLength(1);
    expect(e.order[0].at.block).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------- feeling arcs

describe('arcs', () => {
  const people = [
    { id: 'kade', names: ['Kade Ash', 'Kade'] },
    { id: 'mira', names: ['Mira'] },
  ];
  const book = (chapters: string[]): ArcChapter[] =>
    chapters.map((text, i) => ({ id: `c${i + 1}`, blocks: [{ heading: false, text }] }));

  test('a man in a hole: bright, then dark, then bright again', () => {
    const arcs = feelingArcs(
      book([
        'Kade laughed with his friends, happy and safe.',
        'Kade was glad of the warm fire. Kade smiled.',
        'Kade was afraid. Kade wept, alone and lost.',
        'Kade was hurt, ashamed, and afraid of the dark.',
        'Kade was terrified and broken.',
        'Kade felt hope again. Kade smiled.',
        'Kade laughed, safe and proud, and free.',
      ]),
      people,
    );
    expect(arcs.arcs).toHaveLength(1);
    const kade = arcs.arcs[0];
    expect(kade.id).toBe('kade');
    expect(kade.points).toHaveLength(7);
    expect(kade.shape).toBe('fallsThenRises');
    expect(arcShapeClassic[kade.shape!]).toBe('a man in a hole');
    expect(kade.low!.chapter).toBeGreaterThanOrEqual(3);
    expect(kade.low!.chapter).toBeLessThanOrEqual(5);
    expect([1, 7]).toContain(kade.high!.chapter);
    expect(kade.points[2].feeling!).toBeLessThan(0);
    expect(kade.points[0].feeling!).toBeGreaterThan(0);
    expect(kade.points[2].lines[0].sentence.startsWith('Kade wept')).toBe(true);
  });

  test('a negation turns a word over; a chapter with no feeling has no reading', () => {
    const p = feelingArcs(book(['Kade was not afraid.', 'Kade walked to the market.', 'Kade never felt happy there.']), people)
      .arcs[0].points;
    expect(p[0].feeling!).toBeGreaterThan(0);
    expect(p[1].feeling).toBeNull();
    expect(p[2].feeling!).toBeLessThan(0);
  });

  test('the shapes', () => {
    expect(shapeOf([-0.5, -0.4, 0, 0.3, 0.5])).toBe('rises');
    expect(shapeOf([0.5, 0.3, 0, -0.3, -0.5])).toBe('falls');
    expect(shapeOf([-0.4, 0, 0.5, 0.5, 0, -0.4])).toBe('risesThenFalls');
    expect(shapeOf([0.1, 0.12, 0.08, 0.1])).toBe('flat');
    expect(shapeOf([0.1, 0.2])).toBeNull();
    expect(shapeOf([0.4, 0.4, -0.3, 0.4])).toBe('fallsThenRises');
  });

  test('named too little to draw; never named, not there; the most named first', () => {
    const arcs = feelingArcs(book(['Kade was happy. Mira was sad.', 'Kade was afraid.', 'Kade was glad. Kade was safe.']), people);
    expect(arcs.arcs.map((a) => a.id)).toEqual(['kade']);
    expect(arcs.thin).toEqual(['mira']);
    expect(arcs.chapters).toBe(3);
    expect(feelingArcs(book(['Rain.']), people).thin).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------- name board

describe('the name board', () => {
  const n = (name: string, kind = 'character'): BoardName => ({ name, id: name, kind });

  test('the letter a name is shelved under: its first word, "The" and "A" left off, accents plain', () => {
    expect(['The Drowned Road', 'Wren Hollis', 'A Salt Ship', 'Élodie', 'the', '9 Lives', ''].map(initialOf)).toEqual([
      'D', 'W', 'S', 'E', 'T', '#', '#',
    ]);
  });

  test('by letter, A to Z, each sorted; free letters are the empty ones', () => {
    const board = byLetter([n('Wren Hollis'), n('Vell', 'location'), n('Warden'), n('The Wardens’ Tower', 'location')]);
    expect([...board.keys()][0]).toBe('A');
    expect(board.get('W')!.map((b) => b.name)).toEqual(['Warden', 'The Wardens’ Tower', 'Wren Hollis']);
    expect(board.get('V')!.map((b) => b.name)).toEqual(['Vell']);
    const free = freeLetters(board);
    expect(free).toHaveLength(24);
    expect(free).not.toContain('W');
  });

  test('one letter apart: changed, added, dropped, or two swapped', () => {
    expect(oneApart('marrow', 'merrow')).toBe(true);
    expect(oneApart('kate', 'kat')).toBe(true);
    expect(oneApart('isle', 'ilse')).toBe(true);
    expect(oneApart('wren', 'warden')).toBe(false);
    expect(oneApart('same', 'same')).toBe(false);
  });

  test('look-alikes between different names, the closest first; a family’s shared name is not one', () => {
    const alike = lookAlikes([
      n('Ilse Marrow'), n('Kit Marrow'), n('Old Merrow', 'location'), n('Aldous Crane'), n('Aldric'), n('Iona'), n('Ilsa'), n('Tobiah Fenn'),
    ]);
    expect(alike.map((a) => [a.wordA, a.wordB, a.why])).toEqual([
      ['Ilsa', 'Ilse', 'one letter apart'],
      ['Marrow', 'Merrow', 'one letter apart'],
      ['Aldous', 'Aldric', 'the same first three letters'],
    ]);
    expect(alike[1].inA.map((x) => x.name)).toEqual(['Ilse Marrow', 'Kit Marrow']);
    expect(alike[1].inB.map((x) => x.name)).toEqual(['Old Merrow']);
    expect(lookAlikes([n('Elara Fell'), n('Elena Fell')]).map((a) => a.why)).toEqual(['beginning and ending alike']);
    expect(lookAlikes([n('The Ferry Song'), n('The Ferrymen’s Company')])).toEqual([]);
  });

  test('the words a reader goes by', () => {
    expect(nameWords('The Wardens’ Tower')).toEqual(['Wardens', 'Tower']);
    expect(nameWords('Kit of the Quay')).toEqual(['Kit', 'Quay']);
    expect(nameWords('al-Rashid')).toEqual(['Rashid']);
  });
});

// ---------------------------------------------------------------------------------------------------- name finder

describe('names in the manuscript', () => {
  const text: [number, string[]][] = [
    [1, ['Mira looked at Kai. Then Mira turned to the gate, where Kai waited with Orrin.', 'It was Monday. A rose grew.']],
    [2, ['Rose said nothing. Later, Kai and Mira crossed the river; Mira’s horse slipped.', 'Kai laughed at Mira.']],
    [3, ['The Ash Guild met. “Mira,” he said. Nobody answered Kai.']],
  ];

  test('names are capitalised words that recur mid-sentence, counted with their chapters', () => {
    const found = manuscriptNames(text);
    expect(found.map((n) => n.name)).toEqual(['Mira', 'Kai']);
    const mira = found.find((n) => n.name === 'Mira')!;
    expect([mira.times, mira.chapters, mira.first]).toEqual([6, 3, 1]);
    const kai = found.find((n) => n.name === 'Kai')!;
    expect([kai.times, kai.chapters, kai.first]).toEqual([5, 3, 1]);
  });

  test('known names, names set aside, common words and words usually lower case are left out', () => {
    expect(manuscriptNames(text, { known: knownWords(['Kai Ren']) }).map((n) => n.name)).toEqual(['Mira']);
    expect(manuscriptNames(text, { setAside: new Set([plainName('Mira')]) }).map((n) => n.name)).toEqual(['Kai']);
    expect(manuscriptNames([[1, ['On a Monday we left, and by Monday we were home, and every Monday since.']]])).toEqual([]);
    expect(manuscriptNames([[1, ['She gave Rose a rose, and Rose kept the rose, and a rose and a rose and a rose.']]])).toEqual([]);
    expect(manuscriptNames([[1, ['RANKS from E to SSS, then SSS again and SSS.']]])).toEqual([]);
  });

  test('at most the limit, most written first', () => {
    const many: [number, string[]][] = Array.from({ length: 20 }, (_, i) => {
      const c = String.fromCharCode(97 + i);
      return [i + 1, [`Then Na${c}o came, and Na${c}o left, and stayed.`]];
    });
    expect(manuscriptNames(many, { limit: 5 })).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------------------------------- pov

describe('whose eyes', () => {
  const people = [
    { id: 'wren', names: ['Wren Hollis', 'Wren'] },
    { id: 'ilse', names: ['Ilse Marrow', 'Ilse'] },
  ];

  test('told through the one the narration shows thinking, feeling and noticing', () => {
    const eyes = chapterEyes(
      [
        {
          id: 'c1',
          title: 'The Bell',
          paragraphs: [
            'Wren knew the bell at once. Wren felt the floor shake under her.',
            '“Ilse,” she called. Ilse came down the stair.',
            'Wren could see the wet stone along the wall.',
          ],
        },
      ],
      people,
    );
    expect(eyes).toHaveLength(1);
    expect(eyes[0].telling).toBe('through');
    expect(eyes[0].who).toBe('wren');
    expect(eyes[0].evidence).toBe('Wren knew the bell at once.');
  });

  test('what is said aloud does not count: a name in a speech is no one’s eyes', () => {
    const eyes = chapterEyes(
      [{ id: 'c1', title: '', paragraphs: ['“Wren knew, Wren saw, Wren felt it,” said the man.', 'Ilse thought of the chart. Ilse knew.'] }],
      people,
    );
    expect(eyes[0].who).toBe('ilse');
  });

  test('“could” counts only before seeing or feeling', () => {
    expect(chapterEyes([{ id: 'c', title: '', paragraphs: ['Wren could run. Wren could swim. Wren could climb.'] }], people)[0].telling).toBe(
      'unclear',
    );
    expect(chapterEyes([{ id: 'c', title: '', paragraphs: ['Wren could see the road. Wren could hear the sea.'] }], people)[0].who).toBe(
      'wren',
    );
  });

  test('a narration of “I” is the first person; no one clearly ahead is unclear; an empty chapter is left out', () => {
    const eyes = chapterEyes(
      [
        { id: 'a', title: '', paragraphs: ['I made it to the tower. My hands were raw, and I did not look back at the road behind me.'] },
        { id: 'b', title: '', paragraphs: ['The sea came in. The road went under. Nobody was there to see it.'] },
        { id: 'c', title: '', paragraphs: [] },
      ],
      people,
    );
    expect(eyes.map((e) => [e.chapter, e.telling])).toEqual([
      [1, 'firstPerson'],
      [2, 'unclear'],
    ]);
    expect(eyes[0].evidence).toBe('I made it to the tower.');
  });

  test('two leading together is unclear, not given to either', () => {
    expect(chapterEyes([{ id: 'c', title: '', paragraphs: ['Wren knew. Ilse knew. Wren saw. Ilse saw.'] }], people)[0].telling).toBe('unclear');
  });

  test('what it means: shares, the longest run, how long since each', () => {
    const e = (n: number, who: string | null, words: number): ChapterEyes => ({
      chapter: n,
      nodeId: `${n}`,
      title: '',
      words,
      telling: who === null ? 'unclear' : 'through',
      who,
      evidence: '',
    });
    const summary = eyesSummary([e(1, 'wren', 100), e(2, 'wren', 100), e(3, 'wren', 100), e(4, 'ilse', 50), e(5, null, 50), e(6, 'wren', 100)]);
    expect(summary.each.get('wren')).toEqual({ chapters: 4, words: 400 });
    expect(summary.each.get('ilse')).toEqual({ chapters: 1, words: 50 });
    expect(summary.words).toBe(500);
    expect(summary.longestRun).toEqual({ who: 'wren', from: 1, to: 3 });
    expect([...summary.since]).toEqual([
      ['wren', 0],
      ['ilse', 2],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------- table read

describe('the table read', () => {
  const people = [
    { id: 'wren', names: ['Wren Hollis', 'Wren'] },
    { id: 'nan', names: ['Nan'] },
    { id: 'kai', names: ['Kai'] },
  ];
  const blocks = (paragraphs: string[]) => paragraphs.map((text) => ({ heading: false, text }));
  const script = (parts: ReadPart[]) =>
    parts.map((p) => (p.line ? `${(p.speaker ?? '?').toUpperCase()}${p.likely ? '~' : ''}: ${p.text}` : `(${p.text})`)).join(' | ');

  test('a chapter as a script: narration and lines in order, each line given to who is named saying it', () => {
    const parts = tableRead(
      blocks([
        'The bell rang over the harbour.',
        '“Go,” Wren said. “Now, before the tide.”',
        'Nan whispered, “Not without the map.”',
        '“Who is there?” someone called from the dark.',
      ]),
      people,
    );
    expect(script(parts)).toBe(
      '(The bell rang over the harbour.) | WREN: Go, | (Wren said.) | WREN: Now, before the tide. | ' +
        '(Nan whispered,) | NAN: Not without the map. | ?: Who is there? | (someone called from the dark.)',
    );
    expect(parts[1].block).toBe(1);
  });

  test('two named speaking in one paragraph: a line tied to neither is no one’s; a heading is read', () => {
    const parts = tableRead(
      [
        { heading: true, text: 'Chapter One' },
        { heading: false, text: '“Here,” said Nan. Wren answered, “Where?” “There.”' },
      ],
      people,
    );
    expect(script(parts)).toBe('(Chapter One) | NAN: Here, | (said Nan. Wren answered,) | WREN: Where? | ?: There.');
  });

  test('as a reader follows talk, marked likely: she said, an action beat, the other one’s turn', () => {
    const parts = tableRead(
      blocks([
        'Kai came in from the rain. Nan looked up from the fire.',
        '“You’re late,” she said.',
        'Kai shook the water from his coat. “The road was out.”',
        '“Which road?”',
        '“The low one.”',
      ]),
      people,
      { genders: new Map([['kai', 'Male'], ['nan', 'Female']]) },
    );
    expect(parts.filter((p) => p.line).map((p) => `${p.speaker}${p.likely ? '~' : ''}`)).toEqual(['nan~', 'kai~', 'nan~', 'kai~']);
  });

  test('"he said" never goes to a woman; with no gender written, to the last named', () => {
    const he = tableRead(blocks(['Nan and Kai stood at the door.', '“Open it,” he said.']), people, {
      genders: new Map([['nan', 'Female'], ['kai', 'Male']]),
    });
    expect(he.filter((p) => p.line).map((p) => p.speaker)).toEqual(['kai']);
    const unsaid = tableRead(blocks(['Wren turned.', '“Again,” she said.']), people);
    expect(unsaid.filter((p) => p.line).map((p) => p.speaker)).toEqual(['wren']);
  });

  test('voices spread so no two sound alike: low for men, high for women, between for others; nudged', () => {
    const v = castVoices([
      { id: 'mark', gender: 'Male' },
      { id: 'kai', gender: 'male' },
      { id: 'wren', gender: 'Female' },
      { id: 'sefa', gender: '' },
    ]);
    expect(v.get('mark')!.pitch).toBe(0.72);
    expect(v.get('kai')!.pitch).toBe(0.95);
    expect(v.get('wren')!.pitch).toBe(1.26);
    expect(v.get('sefa')!.pitch).toBe(1.02);
    expect(v.get('mark')!.rate).not.toBe(v.get('kai')!.rate);
    expect(castVoices([{ id: 'mark', gender: 'Male' }], { nudged: new Map([['mark', 2]]) }).get('mark')!.pitch).toBeCloseTo(0.995, 1);
    expect(castVoices([{ id: 'x', gender: '' }], { nudged: new Map([['x', -20]]) }).get('x')!.pitch).toBe(lowestPitch);
    expect([voiceWord(v.get('mark')!), voiceWord(v.get('wren')!), voiceWord(v.get('sefa')!)]).toEqual(['deep', 'high', 'middle']);
  });
});

// ---------------------------------------------------------------------------------------------------- unnamed roles

describe('waiting for a name', () => {
  const read = (chapters: string[][], o: { taken?: Set<string>; aside?: Set<string> } = {}) =>
    unnamedRoles(
      chapters.map((paragraphs, i) => ({ id: `c${i}`, paragraphs })),
      { taken: o.taken, setAside: o.aside },
    );

  test('the people the pages keep coming back to without a name, the most first, as the page puts them', () => {
    const found = read([
      ['James sat down. The waitress came over at once.', '"One Elegant Cat," he said. The waitress nodded and left. A guard watched the door.'],
      ['The old guard was asleep. The waitress returned with the cat.', 'The guard snored.'],
    ]);
    expect(found.map((r) => [r.role, r.phrase, r.times, r.chapters])).toEqual([
      ['waitress', 'the waitress', 3, 2],
      ['guard', 'the guard', 3, 2],
    ]);
    expect(found[0].said).toBe('The waitress came over at once.');
    expect([found[0].chapter, found[0].block]).toEqual([1, 0]);
  });

  test('not once only, not too general to be anyone, not one the cast already is, not set aside', () => {
    expect(read([['The captain spoke once. The man left. The man came back.']])).toEqual([]);
    expect(
      read([['The innkeeper laughed. The innkeeper poured. The smith hammered. The smith swore.']], {
        taken: new Set(['the innkeeper']),
        aside: new Set(['smith']),
      }),
    ).toEqual([]);
    expect(read([['The guards marched. The guards halted.']])).toEqual([]);
  });

  test('a title written with a capital is the names’ business, not one waiting for a name', () => {
    expect(read([['A Warden stood there. The Warden smiled.']])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------- voice

describe('in their own words', () => {
  const said = (paragraphs: string[], names: string[]) => spokenBy(new Map([['c', paragraphs]]), ['c'], names).map((s) => s.words);

  test('their lines, by how dialogue is written', () => {
    expect(said(['“It’s going,” Wren said.'], ['Wren'])).toEqual(['It’s going']);
    expect(said(['“Go home,” said Nan, and smiled.'], ['Nan'])).toEqual(['Go home']);
    expect(said(['Ilse whispered: “Close the drawer.”'], ['Ilse'])).toEqual(['Close the drawer.']);
    expect(said(['Wren said, "Not yet."'], ['Wren'])).toEqual(['Not yet.']);
  });

  test('the only speaker of a paragraph says all its lines; two speakers, only what is tied to each', () => {
    expect(said(['“Nine days,” Wren said. “Nine days of low water.”'], ['Wren'])).toEqual(['Nine days', 'Nine days of low water.']);
    expect(said(['“Tell her no,” Ilse said. “I already did,” said Wren. “Tell her again.”'], ['Wren'])).toEqual(['I already did']);
  });

  test('a pronoun names no one; a quotation no one says is no one’s', () => {
    expect(said(['“Morning,” he said.'], ['Tobiah'])).toEqual([]);
    expect(said(['The sign read “Closed”.'], ['Wren'])).toEqual([]);
    expect(said(['“Go,” Tobiah said.'], ['Wren'])).toEqual([]);
  });

  test('the sample novel gives Wren her voice', () => {
    const s = NovelSnapshot.fromJson(readJson(samplePath));
    const pages = new Map(s.rows('chapterContents').map((r) => [str(r['id']), blockTexts(r['doc'])]));
    const ids = StoryModel.fromSnapshot(s).order.chapters.map((c) => c.id);
    const lines = spokenBy(pages, ids, ['Wren Hollis', 'Wren']).map((x) => x.words);
    expect(lines).toContain('The tide bell');
    expect(lines).toContain('She’s my master.');
    expect(lines).not.toContain('I want to finish it.');
    expect(lines.length).toBeGreaterThan(15);
    const nan = spokenBy(pages, ids, ['Nan Ottilie', 'Nan']).map((x) => x.words);
    expect(nan).toContain('What do you want, child?');
    expect(nan).not.toContain('Ilse Marrow’s apprentice');
  });

  test('everyone’s lines in one reading: for each, the same lines as asking for them alone', () => {
    const hard = new Map([
      [
        'h1',
        [
          '“We cross at dawn,” said Wren Hollis. Wren looked at the water; a wren sang on the rail.',
          'Kai whispered: “Not before the tide.” Kai2 laughed. Mikai said nothing.',
          '“Is it far?” asked Mary-Jane. “Far enough,” Wren said. Wren and Kai went on.',
          'Nobody spoke.',
          '',
          'Ren Vane said, “Rank one is D tier.” Ren said nothing more.',
        ],
      ],
    ]);
    const hardNames = new Map([
      ['wren', ['Wren Hollis', 'Wren']],
      ['kai', ['Kai']],
      ['mj', ['Mary-Jane']],
      ['ren', ['Ren Vane', 'Ren']],
      ['short', ['W']],
    ]);
    let total = 0;
    for (const limit of [1, 2, 60]) {
      const each = spokenByEach(hard, ['h1'], hardNames, { limit });
      for (const [who, list] of hardNames) {
        expect(each.get(who)).toEqual(spokenBy(hard, ['h1'], list, { limit }));
        if (limit === 60) total += each.get(who)!.length;
      }
    }
    expect(total).toBeGreaterThanOrEqual(4);
    expect(spokenByEach(hard, ['missing'], hardNames).get('wren')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------- voice print

describe('their voice', () => {
  const lines = new Map([
    ['wren', ['Is it going?', 'Can’t we wait?', 'Where’s the chart?', 'We’re late, aren’t we?', 'Go on, then.', 'Tide’s turning?', 'What’s that, there?', 'I’ll go.']],
    [
      'crane',
      [
        'The road has been closed for thirty-one years and it shall remain closed for as long as I am Provost.',
        'Fear is cheaper than walls, apprentice, and considerably more reliable than any chart.',
        'You will return the chart to the archive before the evening bell, and we shall say no more of it.',
        'The tables are kept for the protection of the town, not for the amusement of cartographers.',
        'I have watched this harbour for longer than you have been alive, and the archive remembers.',
        'Nothing that the archive keeps is lost; it is merely kept from those who would misuse it.',
      ],
    ],
    ['nan', ['Too few.', 'Lines.']],
  ]);

  test('each voice in numbers, only with enough lines; their own words', () => {
    const prints = voicePrints(lines);
    expect(prints.map((p) => p.id)).toEqual(['wren', 'crane']);
    expect(prints[0].questions).toBeCloseTo(6 / 8, 9);
    expect(prints[0].wordsPerLine).toBeLessThan(4);
    expect(prints[1].contractions).toBe(0);
    expect(prints[1].signature).toContain('archive');
    expect(prints[1].signature).toContain('shall');
  });

  test('what sets a voice apart, against the others; whom it sounds most like', () => {
    const prints = voicePrints(lines);
    const names = new Map([['wren', 'Wren'], ['crane', 'Crane']]);
    const wren = readVoice('wren', prints, names)!;
    expect(wren.traits.some((t) => t.startsWith('Shorter lines than the others'))).toBe(true);
    expect(wren.traits.some((t) => t.startsWith('Asks more than the others (75%, the others 0%)'))).toBe(true);
    expect(wren.traits.some((t) => t.startsWith('Speaks loosely: more contractions'))).toBe(true);
    expect(wren.soundsLike).toBe('Crane');
    expect(wren.alike).toBe(false);
    expect(readVoice('nan', prints, names)).toBeNull();
  });

  test('two who talk the same: alike', () => {
    const same = Array.from({ length: 9 }, () => 'We should go to the harbour before it is dark tonight.');
    const prints = voicePrints(new Map([['a', same], ['b', [...same]]]));
    const reading = readVoice('a', prints, new Map([['a', 'Ann'], ['b', 'Bea']]))!;
    expect(reading.traits).toEqual([]);
    expect([reading.soundsLike, reading.alike]).toEqual(['Bea', true]);
  });
});
