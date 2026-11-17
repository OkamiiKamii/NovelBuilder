// A port of flutter_app/test/features/write/todays_page_test.dart: its pure test of the line quoted, and what its
// widget test reads off the card (the words today, the streak, the novel, the footer, the line only when asked, the
// file's name), from a novel made as its `openWrite` makes one; the picture itself (1080 × 1350 PNG), the tap targets
// and the share sheet are the screen's. Sentences, dates and the marks' sums at the edges were printed by Dart 3.10
// (Flutter 3.38.9) running todays_page.dart's functions.

import { openLibrary } from '../../src/data/library';
import { type BookDay, lastNodeKey } from '../../src/domain/desk/dayBook';
import { weekdayMonthDay } from '../../src/domain/goals/days';
import {
  blotOf,
  firstSentence,
  goalRingOf,
  includeLineSubtitle,
  lineWrittenToday,
  todaysPageCardOf,
  todaysPageFileName,
  todaysPageOf,
  todaysPageSize,
  todaysPagePixelRatio,
} from '../../src/domain/goals/todaysPage';
import { wordGoalWrite } from '../../src/domain/goals/wordGoals';
import { textToDoc } from '../../src/domain/prose';
import { testIds } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

describe('a line to quote', () => {
  test('the first sentence, cut at a word when long (the Dart test)', () => {
    expect(firstSentence('The gate was open. Nobody guarded it.')).toBe('The gate was open.');
    expect(firstSentence('“Go,” she said. Then she left.')).toBe('“Go,” she said.');
    expect(firstSentence('No end mark here')).toBe('No end mark here');
    const long = firstSentence(`${Array(40).fill('word').join(' ')}.`, 60);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('word…')).toBe(true);
  });

  test('as Dart reads the edges', () => {
    const words40 = `${Array(40).fill('word').join(' ')}.`;
    const cases: [string, string][] = [
      [words40, `${Array(30).fill('word').join(' ')}…`],
      ['  Wait…  what?  ', 'Wait…'],
      ['Is it (really) true?) Yes.', 'Is it (really) true?)'],
      ['Dr. Who came.', 'Dr.'],
      ['One.Two. Three', 'One.Two.'],
      ['\u0085Hi there.\u0085', 'Hi there.'],
      ['Tab\there\tand  there! Yes', 'Tab here and there!'],
      ['x'.repeat(200), `${'x'.repeat(149)}…`],
      [`${'a'.repeat(30)} ${'b'.repeat(200)}`, `${'a'.repeat(30)} ${'b'.repeat(118)}…`],
      ['Hello!” he said', 'Hello!”'],
      ['End.)', 'End.)'],
      ['', ''],
      ['   ', ''],
    ];
    for (const [paragraph, line] of cases) expect(firstSentence(paragraph)).toBe(line);
    expect(firstSentence(words40, 60)).toBe(`${Array(12).fill('word').join(' ')}…`);
  });
});

// Tuesday 17 November 2026, nine in the morning.
const now = new Date(2026, 10, 17, 9).getTime();

function openWrite(text = 'The gate was open.\nNobody guarded it.') {
  const lib = openLibrary(memoryLibrary(), () => now, testIds());
  const { novel } = lib.library.create({ title: 'Ash' });
  const p = novel.id;
  const chapter = lib.manuscript.create(p, 'chapter', null, 'The Gate');
  lib.manuscript.save(p, chapter.id, textToDoc(text), { baseRev: 0 });
  const page = (withLine: boolean) =>
    todaysPageOf({
      project: lib.novels.novel(p)?.raw ?? null,
      nodes: lib.manuscript.nodes(p),
      sessionRows: lib.novels.rowsIn(p, 'writingSessions'),
      goalRows: lib.novels.rowsIn(p, 'goals'),
      remembered: lib.settings.read(lastNodeKey(p)),
      withLine,
      nowMs: now,
      rowsFor: (id) => ({
        node: lib.novels.row(p, 'chapters', id),
        saved: lib.novels.row(p, 'chapterContents', id),
        revisions: lib.manuscript.revisions(p, id),
      }),
    });
  return { lib, p, chapter, page };
}

describe('today’s page', () => {
  test('what the card says, quoting only if asked', () => {
    const { page } = openWrite();
    const card = todaysPageCardOf(page(false));
    expect(card.kicker.text).toBe('TODAY AT THE DESK');
    expect(card.date.text).toBe('Tuesday, Nov 17');
    expect(card.number.text).toBe('7'); // the words written today
    expect(card.under.text).toBe('words today');
    expect(card.streak.text).toBe('Written today');
    expect(card.novel.text).toBe('Ash');
    expect(card.footer.text).toBe('The Gate · 7 words so far');
    expect(card.line).toBeNull(); // no prose unless asked
    expect(card.tag.text).toBe('#amwriting');
    expect(card.days.map((d) => d.initial.text)).toEqual(['W', 'T', 'F', 'S', 'S', 'M', 'T']);
    expect(card.days.map((d) => d.key)).toEqual([
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ]);
    expect(card.days[6].blot).toEqual({ kind: 'dot', radius: 9 * 0.95, opacity: 1 });
    expect(card.days[0].blot).toEqual({ kind: 'ring', radius: 9 * 0.35, strokeWidth: 1.2, opacity: 0.35 });
    expect(card.ring).toEqual({ part: null, trackOpacity: 0.4, trackWidth: 2, arcSweep: 0, arcWidth: 8 });

    const asked = page(true);
    expect(asked.line).toBe('Nobody guarded it.'); // the last paragraph written today
    expect(todaysPageCardOf(asked).line?.text).toBe('“Nobody guarded it.”');
    expect(includeLineSubtitle(true, asked.line)).toBe('Your own words, quoted');
  });

  test('the goal, the author and the streak', () => {
    const { lib, p, page } = openWrite();
    const goals = () => lib.novels.rowsIn(p, 'goals');
    const set = (words: number) => {
      const w = wordGoalWrite(goals(), 'daily', words, { projectId: p, nowMs: now, createId: () => 'g1' });
      lib.novels.writeRows(p, w ? [w] : [], false);
    };
    set(500);
    expect(todaysPageCardOf(page(false)).under.text).toBe('of 500 words');
    expect(todaysPageCardOf(page(false)).ring).toMatchObject({ part: 7 / 500, trackOpacity: 0.16, trackWidth: 8 });
    set(7);
    expect(todaysPageCardOf(page(false)).under.text).toBe('goal of 7 met');
    expect(todaysPageCardOf(page(false)).ring.arcSweep).toBe(1);

    lib.novels.putNovelDetails({ ...lib.novels.novel(p)!.raw, title: '  ', author: ' Wren ' });
    const card = todaysPageCardOf(page(false));
    expect(card.novel.text).toBe('Untitled novel');
    expect(card.footer.text).toBe('Wren · The Gate · 7 words so far');

    // Yesterday and the day before written too: days in a row.
    lib.novels.writeRows(p, [
      { collection: 'writingSessions', id: 's1', value: { id: 's1', day: '2026-11-16', netWords: 300, added: 300 } },
      { collection: 'writingSessions', id: 's2', value: { id: 's2', day: '2026-11-15', netWords: -20, added: 0 } },
      { collection: 'writingSessions', id: 's3', value: { id: 's3', day: '2026-11-14', netWords: 0, added: 5 } },
    ]);
    const later = todaysPageCardOf(page(false));
    expect(later.streak.text).toBe('2 days in a row');
    expect(later.days[3].blot).toEqual({ kind: 'dot', radius: 9 * 0.45, opacity: 0.45 }); // a day of nothing net
    expect(later.days[4].blot.kind).toBe('ring'); // a day of cutting only is not written
  });

  test('with nothing written today the line is not there, and the switch says so', () => {
    const { lib, p, chapter } = openWrite();
    // The page as it was saved yesterday: nothing of it is today's ink.
    const node = lib.novels.row(p, 'chapters', chapter.id)!;
    const saved = lib.novels.row(p, 'chapterContents', chapter.id)!;
    const yesterday = now - 24 * 3600 * 1000;
    const line = lineWrittenToday({
      node: { ...node, createdAt: yesterday },
      saved: { ...saved, savedAt: yesterday },
      revisions: [],
      nowMs: now,
    });
    expect(line).toBeNull();
    expect(includeLineSubtitle(true, line)).toBe('Nothing written today on this page yet');
    expect(includeLineSubtitle(false, null)).toBe('Your own words, quoted');
    // No chapters at all: no chapter, no line.
    const empty = todaysPageOf({
      project: null,
      nodes: [],
      sessionRows: [],
      goalRows: [],
      remembered: null,
      withLine: true,
      nowMs: now,
      rowsFor: () => {
        throw new Error('not asked');
      },
    });
    expect(empty).toMatchObject({ novel: 'Untitled novel', author: '', chapter: null, line: null, total: 0, streak: 0 });
    expect(todaysPageCardOf(empty).streak.text).toBe('A page at a time');
    expect(todaysPageCardOf(empty).footer.text).toBe('0 words so far');
  });

  test('the picture: 360 × 450 made at three times, named for the day', () => {
    expect([todaysPageSize.width * todaysPagePixelRatio, todaysPageSize.height * todaysPagePixelRatio]).toEqual([
      1080, 1350,
    ]);
    expect(todaysPageFileName(now)).toMatch(/^todays-page-\d{4}-\d\d-\d\d\.png$/);
    expect(todaysPageFileName(now)).toBe('todays-page-2026-11-17.png');
  });

  test('dates and marks as Dart makes them', () => {
    expect(
      [new Date(2026, 10, 17, 9), new Date(2026, 10, 22, 23, 59), new Date(2027, 0, 4)].map((d) =>
        weekdayMonthDay(d.getTime()),
      ),
    ).toEqual(['Tuesday, Nov 17', 'Sunday, Nov 22', 'Monday, Jan 4']);
    const day = (written: boolean, words: number): BookDay => ({ key: '2026-11-17', words, written, today: false, ahead: false });
    const week = (most: number) => [day(true, most)];
    const blot = (written: boolean, words: number, most: number) => {
      const b = blotOf(day(written, words), week(most));
      return [b.radius, b.opacity];
    };
    expect([
      blot(false, 0, 0),
      blot(true, 0, 0),
      blot(true, 100, 400),
      blot(true, 400, 400),
      blot(true, 37, 1234),
      blot(true, 5, 0),
    ]).toEqual([
      [3.15, 0.35],
      [4.05, 0.45],
      [6.3, 0.7250000000000001],
      [8.549999999999999, 1.0],
      [4.829212293940202, 0.545237058148247],
      [8.549999999999999, 1.0],
    ]);
    expect(goalRingOf(-5, 100)).toMatchObject({ part: 0, arcSweep: 0 });
    expect(goalRingOf(50, 0).part).toBeNull();
  });
});
