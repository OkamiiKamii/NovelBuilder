// The keepsakes' screens, what they say and draw, as the Flutter app's feature tests check them
// (test/app/keepsakes_test.dart, test/features/progress/{full_jacket,trailer,book_story,book_quiz,gazette,postcards,
// sampler,submission,best_lines,book_print}_test.dart): the row and the shelf (every keepsake once, the new ones first,
// what is remembered), the spine, a shot's length, the poster, the front page's columns, the sample's pages, the kit,
// the letter's gaps, the quiz's choices, the story's pages, the postcard's back; and the sample novel made into each.

import { bookStoryJob } from '../../src/domain/analytics/bookStory';
import { samplerJob } from '../../src/domain/exchange/sampler';
import { bookRead, gazetteCast, keptPlaces, storyInputsOf } from '../../src/domain/keepsakes/inputs';
import {
  barcodeBars,
  choiceState,
  kitAction,
  letterFile,
  letterParts,
  posterWords,
  pressLine,
  quizProgress,
  samplerEndPage,
  samplerFile,
  samplerPages,
  scoreFoot,
  secondColumn,
  shotFrame,
  shotLength,
  spineWidth,
  storyFoot,
  storyPages,
  townOf,
  twoColumns,
  whatIsInIt,
} from '../../src/domain/keepsakes/pages';
import { backWords, postcardFile, postcardScene } from '../../src/domain/keepsakes/postcardScene';
import {
  keepsakesOf,
  openedAfter,
  openedOf,
  rowCount,
  rowOrder,
  shelfAcross,
  shelfLine,
  shelvesOf,
  tileLabel,
} from '../../src/domain/keepsakes/shelf';
import { gazetteJob } from '../../src/domain/manuscript/gazette';
import { type Postcard, postcardsJob } from '../../src/domain/manuscript/postcards';
import { submissionKit } from '../../src/domain/manuscript/submission';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath } from '../fixtures';

const sample = () => NovelSnapshot.fromJson(readJson(samplePath));

describe('the row and the shelf', () => {
  const all = keepsakesOf('The Drowned Road');

  test('every keepsake once, in one list; none opened yet: all new, the heading says how many', () => {
    expect(all.map((k) => k.id)).toEqual(['gazette', 'quiz', 'postcards', 'trailer', 'lines', 'sampler', 'story', 'print', 'jacket']);
    expect(new Set(all.map((k) => k.path)).size).toBe(9);
    expect(rowCount(all, new Set())).toBe('  ·  9 new');
    expect(tileLabel(all[1], true)).toMatch(/^The book quiz.*, not yet opened$/);
    expect(all[1].label).toContain('The Drowned Road');
    expect(keepsakesOf('  ')[0].label).toContain('your novel');
  });

  test('a keepsake opened loses its ribbon, goes to the end of the row, and is remembered', () => {
    const stored = openedAfter(new Set(), 'quiz');
    expect(stored).toEqual(['quiz']);
    const opened = openedOf(stored);
    expect(rowOrder(all, opened).map((k) => k.id).at(-1)).toBe('quiz');
    expect(rowCount(all, opened)).toBe('  ·  8 new');
    expect(tileLabel(all[1], !opened.has('quiz'))).not.toMatch(/not yet opened/);
    expect(openedAfter(opened, 'quiz')).toBeNull();
    expect(openedAfter(opened, 'gazette')).toEqual(['gazette', 'quiz']);
    expect(openedOf('nonsense').size).toBe(0);
    expect(openedOf(['quiz', 3, null]).size).toBe(1);
  });

  test('the shelf: all standing, two to four to a shelf; and when all are opened it says so', () => {
    expect(shelfLine(all, new Set(['quiz']))).toBe('Everything your book can be made into. 8 of 9 not yet opened.');
    const every = new Set(all.map((k) => k.id));
    expect(shelfLine(all, every)).toBe('Everything your book can be made into. You have opened them all.');
    expect(rowCount(all, every)).toBe('  ·  9');
    expect(shelfAcross(320)).toBe(2);
    expect(shelfAcross(2000)).toBe(4);
    expect(shelvesOf(all, 4).map((s) => s.length)).toEqual([4, 4, 1]);
  });
});

describe('the jacket, the trailer and the poster', () => {
  test('the spine is as thick as the book', () => {
    expect(spineWidth(0)).toBe(10);
    expect(spineWidth(9645)).toBeLessThan(spineWidth(90000));
    expect(spineWidth(10000000)).toBe(46);
  });

  test('a barcode stays inside its box and is the same for the same book', () => {
    const bars = barcodeBars(12345, 30);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((b) => b.x < 30)).toBe(true);
    expect(barcodeBars(12345, 30)).toEqual(bars);
  });

  test('a shot holds long enough to read', () => {
    expect(shotLength({ kind: 'line', text: 'Go.' })).toBe(3000);
    expect(shotLength({ kind: 'line', text: Array(40).fill('word').join(' ') })).toBe(6000);
    expect(shotLength({ kind: 'title', text: 'T' })).toBeGreaterThan(shotLength({ kind: 'name', text: 'N' }));
  });

  test('a shot fades up and down again, but the title stays for the poster; standing still with reduce motion', () => {
    expect(shotFrame({ kind: 'line', text: 'x' }, 0, false).opacity).toBe(0);
    expect(shotFrame({ kind: 'line', text: 'x' }, 0.5, false).opacity).toBe(1);
    expect(shotFrame({ kind: 'line', text: 'x' }, 1, false).opacity).toBe(0);
    expect(shotFrame({ kind: 'title', text: 'x' }, 1, false).opacity).toBe(1);
    expect(shotFrame({ kind: 'line', text: 'x' }, 0.9, true)).toMatchObject({ drift: 0, scale: 1, flare: 1 });
  });

  test('the poster bills its names, the author and where it was made', () => {
    const w = posterWords({ title: 'the drowned road', author: 'A. Writer', cast: ['Mara'], words: 12345, chapters: 3 });
    expect(w.title).toBe('THE DROWNED ROAD');
    expect(w.top).toBe('MARA');
    expect(w.byline).toBe('A NOVEL BY A. WRITER');
    expect(w.billing).toContain('12,345 WORDS AND COUNTING');
    expect(w.billing).toContain('MADE WITH SCRIPTOR');
    expect(posterWords({ title: '', author: '', cast: [], words: 0, chapters: 0 })).toMatchObject({ title: 'UNTITLED', top: '', byline: null });
  });
});

describe('the gazette', () => {
  test('the lead story in two columns of about the same length, and where it goes on', () => {
    const [a, b] = twoColumns(['One. Two. Three.', 'Four. Five. Six.']);
    expect(a.length + b.length).toBeGreaterThan(1);
    expect([...a, ...b].join(' ')).toBe('One. Two. Three. Four. Five. Six.');
    const e = { chapter: 2, continues: true } as Parameters<typeof secondColumn>[1];
    expect(secondColumn([a, b], e).at(-1)).toBe('→ Continued in chapter 2.');
  });

  test('the press is the town’s', () => {
    expect(townOf('The Old Merrow Gazette')).toBe('Old Merrow');
    expect(pressLine('The Gazette')).toBe('PRINTED BY THE TOWN PRESS · MADE WITH SCRIPTOR');
  });

  test('the sample novel: a front page a chapter', () => {
    const s = sample();
    const b = bookRead(s);
    const cast = gazetteCast(s);
    const paper = gazetteJob(b.novel.title, b.stored, b.order, b.titles, cast.people, cast.places)();
    expect(paper.editions.length).toBeGreaterThan(0);
    expect(paper.name).toMatch(/\S/);
  });
});

describe('the postcards', () => {
  const card: Postcard = {
    place: 'the Grey Tower',
    line: 'The lamp burned all night.',
    chapter: 3,
    chapterTitle: ' The Light ',
    nodeId: 'n',
    block: 0,
    scenery: { water: true, trees: true, peaks: true, roofs: true, tower: true, beacon: true, dunes: false },
    light: 3,
    kept: true,
  };

  test('the back: the greeting, the chapter, who it is from, the stamp, the reader', () => {
    const w = backWords(card, 'The Drowned Road', 'A. Writer');
    expect(w.greeting).toBe('Greetings from the Grey Tower,');
    expect(w.chapter).toBe('Chapter 3 · The Light');
    expect(w.from).toBe('The Drowned Road, by A. Writer');
    expect(backWords(card, 'B', 'Scriptor').from).toBe('B');
    expect(w.stamp).toBe('TOWER');
    expect(w.address).toEqual(['A reader', 'of The Drowned Road', '']);
    expect(postcardFile('the Grey Tower', true)).toBe('postcard-from-the-grey-tower-back.png');
  });

  test('a place is always painted the same, everything it shows drawn', () => {
    const shapes = postcardScene(card, 430, 280);
    expect(postcardScene(card, 430, 280)).toEqual(shapes);
    expect(shapes[0].kind).toBe('sky');
    expect(shapes.filter((s) => s.kind === 'circle').length).toBeGreaterThanOrEqual(26 + 1);
    expect(shapes.some((s) => s.kind === 'rect' && s.clip !== undefined)).toBe(true);
  });

  test('the sample novel: its places as postcards, at most sixteen', () => {
    const s = sample();
    const b = bookRead(s);
    const cards = postcardsJob(b.stored, b.order, b.titles, keptPlaces(s))();
    expect(cards.length).toBeLessThanOrEqual(16);
  });
});

describe('the sampler and the submission kit', () => {
  test('the sample novel’s sample: a title page, its chapters, and an end page', () => {
    const b = bookRead(sample());
    const made = samplerJob(b.stored, b.order, b.titles, { title: b.novel.title, author: b.novel.author, synopsis: b.novel.synopsis })();
    const pages = samplerPages(made);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(samplerEndPage(pages.at(-1)!)).toBe(true);
    expect(samplerEndPage(pages[0])).toBe(false);
    expect(whatIsInIt(made)).toMatch(/^A title page, the first (chapter|\d chapters) · [\d,]+ words · about \d+ minutes? to read$/);
    expect(samplerFile('The Drowned Road')).toBe('the-drowned-road-sampler.pdf');
  });

  test('a way to make each thing ready, where it is not', () => {
    const kit = submissionKit({ title: '', author: 'A', genre: 'Fantasy', words: 100000, synopsis: '', openingSlips: 2 });
    const of = (item: string) => kit.find((k) => k.item === item)!;
    expect(kitAction(of('title'), 2)).toBe('details');
    expect(kitAction(of('author'), 2)).toBeNull();
    expect(kitAction(of('length'), 2)).toBeNull();
    expect(kitAction(of('opening'), 2)).toBe('slips');
    expect(kitAction(of('opening'), 0)).toBe('sampler');
  });

  test('the letter’s gaps are marked, its words kept', () => {
    const parts = letterParts('Dear [[agent name]], my book.');
    expect(parts).toEqual([
      { text: 'Dear ', gap: false },
      { text: ' agent name ', gap: true },
      { text: ', my book.', gap: false },
    ]);
    expect(letterFile('  ')).toBe('query-letter-your-book.txt');
  });
});

describe('the quiz and the story', () => {
  test('a choice once answered: the answer right, the one picked wrong, the rest passed', () => {
    expect(choiceState(1, 1, null)).toBe('open');
    expect(choiceState(1, 1, 0)).toBe('right');
    expect(choiceState(0, 1, 0)).toBe('wrong');
    expect(choiceState(2, 1, 0)).toBe('passed');
    expect(quizProgress(1, 10, false)).toBe(0);
    expect(quizProgress(10, 10, true)).toBe(1);
    expect(scoreFoot('Novel Builder')).toBe('MADE WITH SCRIPTOR');
    expect(scoreFoot('a. writer')).toBe('A. WRITER · MADE WITH SCRIPTOR');
  });

  test('the sample novel told as a story: page by page, ending on the next stop', () => {
    const s = sample();
    const story = bookStoryJob(storyInputsOf(s), bookRead(s).stored)();
    const pages = storyPages(story);
    expect(pages[0][0]).toEqual({ kind: 'kicker', text: 'YOUR BOOK SO FAR' });
    expect(pages[1][0]).toEqual({ kind: 'kicker', text: 'YOU HAVE WRITTEN' });
    expect(pages.at(-1)![0]).toEqual({ kind: 'kicker', text: 'NEXT STOP' });
    expect(storyFoot(0, pages.length)).toBe(`SCRIPTOR  ·  1 / ${pages.length}`);
  });
});
