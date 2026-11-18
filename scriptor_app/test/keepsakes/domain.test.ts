// The keepsakes' readings of a book: ports of flutter_app/test/shared/domain/{best_lines,book_print,book_story,
// jacket_copy,book_quiz,gazette,postcards,sampler,submission,trailer}_test.dart.

import { bookPrint, namePatterns, printLines } from '../../src/domain/analytics/bookPrint';
import { bookStory, type StoryInputs } from '../../src/domain/analytics/bookStory';
import { HeadingBlock, ParagraphBlock } from '../../src/domain/exchange/compile';
import { layoutPdf, renderPdf } from '../../src/domain/exchange/renderPdf';
import { type SampleChapter, sampleChapters, samplerOf } from '../../src/domain/exchange/sampler';
import { bestLines, lineScore } from '../../src/domain/manuscript/bestLines';
import { bookQuiz, type QuizChapter, type QuizSpeaker, quizAtLeast, quizGap, quizLength, quizVerdict } from '../../src/domain/manuscript/bookQuiz';
import { gazette, gazetteName, leadOf, weatherOf } from '../../src/domain/manuscript/gazette';
import { blurbWords, jacketCopy } from '../../src/domain/manuscript/jacketCopy';
import { type KeptPlace, type PostcardChapter, lightOf, placesNamedIn, postcards, sceneryOf } from '../../src/domain/manuscript/postcards';
import { lengthFor, queryLetter, submissionKit } from '../../src/domain/manuscript/submission';
import { type Trailer, trailerOf } from '../../src/domain/manuscript/trailer';

const repeat = (word: string, n: number) => Array.from({ length: n }, () => word).join(' ');

describe('best lines', () => {
  test('a line to quote: a turn, a truth, the senses; not business, a fragment, a number or a broken-off line', () => {
    expect(lineScore('The sea does not care how excited you are.')).toBeGreaterThan(lineScore('He walked to the door.'));
    expect(lineScore('Everyone in Vell knew what the bell meant.')).toBeGreaterThanOrEqual(5);
    expect(lineScore('He walked to the door and then he turned to the window.')).toBeLessThan(3);
    expect(lineScore('and the tide went out.')).toBe(0);
    expect(lineScore('Too short.')).toBe(0);
    expect(lineScore('“Master, if you knew the tables were wrong—”')).toBe(0);
    expect(lineScore('There were 400 stones on the road to the sea.')).toBeLessThan(
      lineScore('There were stones on the road to the sea.'),
    );
  });

  test('the best first, one from a paragraph, no line twice, twelve at most', () => {
    const lines = bestLines([
      {
        id: 'c1',
        paragraphs: [
          'He sat down. The sea does not care how excited you are. The sea is cold and the night is long.',
          'He walked to the door.',
          'The sea does not care how excited you are.',
        ],
      },
      { id: 'c2', paragraphs: Array.from({ length: 20 }, () => 'Nobody listened, and the bell rang on in the dark.') },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.filter((l) => l.chapter === 1)).toHaveLength(1);
    expect(lines[0].score).toBeGreaterThanOrEqual(lines[lines.length - 1].score);
    expect(bestLines([])).toEqual([]);
  });
});

describe('the fingerprint', () => {
  const names = new Map([
    ['wren', ['Wren Hollis', 'Wren']],
    ['ilse', ['Ilse']],
  ]);

  test('each paragraph to the one named most in it, else to whom the scene was with; marked where someone speaks', () => {
    const lines = printLines(
      [
        'The bell rang over the town.',
        'Wren dropped the ink. Wren ran.',
        '“Is it the tide?” she asked.',
        'Ilse said nothing, and Wren waited for Ilse.',
        'The sea went out.',
      ],
      namePatterns(names),
    );
    expect(lines.map((l) => l.who)).toEqual([null, 'wren', 'wren', 'ilse', 'ilse']);
    expect(lines.map((l) => l.spoken)).toEqual([false, false, true, false, false]);
    expect(lines[0].words).toBe(6);
  });

  test('the print: chapters in order, and whose paragraphs are whose', () => {
    const print = bookPrint(
      [
        { id: 'b', title: 'Two' },
        { id: 'a', title: 'One' },
      ],
      new Map([
        ['a', ['Wren lit the lamp.', 'She waited.']],
        ['b', ['Ilse came in.']],
      ]),
      names,
    );
    expect(print.chapters.map((c) => c.title)).toEqual(['Two', 'One']);
    expect(Object.fromEntries(print.shares)).toEqual({ ilse: 1, wren: 2 });
    expect(print.chapters[1].lines[1].who).toBe('wren');
  });

  test('a chapter with no text is an empty column', () => {
    const print = bookPrint([{ id: 'a', title: 'One' }], new Map(), names);
    expect(print.chapters[0].lines).toEqual([]);
    expect(print.shares.size).toBe(0);
  });
});

describe('your book so far', () => {
  const inputs: StoryInputs = {
    title: 'Ash Road',
    target: 20000,
    chapters: [
      { id: 'c1', title: 'The Gate', words: 30 },
      { id: 'c2', title: 'The Lantern', words: 45 },
    ],
    days: [
      { day: '2026-11-08', words: 400 },
      { day: '2026-11-09', words: 900 },
      { day: '2026-11-10', words: 0 },
      { day: '2026-11-11', words: 300 },
    ],
    people: [
      { id: 'wren', name: 'Wren Hollis', names: ['Wren Hollis', 'Wren'] },
      { id: 'kai', name: 'Kai', names: ['Kai'] },
    ],
  };
  const pages = new Map([
    ['c1', ['The gate was open. Wren lit the lantern.', '“Is anyone there?” Wren said. “The lantern will not last.”']],
    [
      'c2',
      ['Kai carried the lantern down. Wren followed the lantern light.', '“Go,” said Kai. The lantern swung in the dark, and Wren ran.'],
    ],
  ]);

  test('the book told back: its words, its days, its biggest chapter', () => {
    const s = bookStory(inputs, pages);
    expect([s.title, s.words, s.chapters, s.pages, s.minutes]).toEqual(['Ash Road', 75, 2, 1, 1]);
    expect(s.daysWritten).toBe(3);
    expect(s.longestRun).toBe(2);
    expect(s.bestDay).toEqual({ day: '2026-11-09', words: 900 });
    expect(s.firstDay).toBe('2026-11-08');
    expect(s.biggest?.title).toBe('The Lantern');
  });

  test('who it is about, who talks most and a line of theirs, the words leaned on', () => {
    const s = bookStory(inputs, pages);
    expect(s.lead?.name).toBe('Wren Hollis');
    expect(s.lead?.mentions).toBe(4);
    expect(s.talker?.name).toBe('Wren Hollis');
    expect(s.talker?.line).toBe('The lantern will not last.');
    expect(s.leanWords[0]).toEqual({ word: 'lantern', count: 5 });
    expect(s.leanWords.filter((w) => w.word === 'wren')).toEqual([]);
  });

  test('where it begins and stands; the next stop on the road', () => {
    const s = bookStory(inputs, pages);
    expect(s.opening).toBe('The gate was open.');
    expect(s.latest).toBe('The lantern swung in the dark, and Wren ran.');
    expect(s.next).toEqual({ name: 'the first thousand', words: 925 });
  });

  test('nothing written: nothing claimed', () => {
    const s = bookStory({ title: '', target: null, chapters: [], days: [], people: [] }, new Map());
    expect([s.words, s.daysWritten, s.biggest, s.lead, s.talker, s.opening]).toEqual([0, 0, null, null, null, '']);
    expect(s.leanWords).toEqual([]);
  });
});

describe('the jacket copy', () => {
  test('the synopsis is the blurb; the quote is a spoken line short enough to set large', () => {
    const copy = jacketCopy(
      [
        'The bell rang over the town at dawn.',
        '“Go,” said Kai. “The water will not wait for anyone at all, not even you, not even the Wardens,” he added.',
        '“Master, it’s the tide bell,” Wren said.',
      ],
      'A girl, a chart, and nine days of low water.',
    );
    expect(copy.blurb).toBe('A girl, a chart, and nine days of low water.');
    expect(copy.quote).toBe('Master, it’s the tide bell.');
  });

  test('no synopsis: the book’s own opening, cut at a sentence, marked as cut', () => {
    const long = Array.from({ length: 30 }, () => 'The road ran on.').join(' ');
    const copy = jacketCopy([long], '');
    expect(copy.blurb.endsWith('The road ran on. …')).toBe(true);
    expect(copy.blurb.split(' ').length).toBeLessThanOrEqual(blurbWords + 1);
    expect(jacketCopy(['It rained. Then it stopped.'], '').blurb).toBe('It rained. Then it stopped.');
  });

  test('no spoken line: the first sentence, if it is short enough', () => {
    expect(jacketCopy(['The gate was open. Nobody came.'], '').quote).toBe('The gate was open.');
    expect(jacketCopy([repeat('word', 30)], '').quote).toBe('');
  });

  test('nothing written: nothing to say', () => {
    const copy = jacketCopy([], '');
    expect([copy.quote, copy.blurb]).toEqual(['', '']);
  });
});

describe('the book quiz', () => {
  const one = [
    'The bell in the tower had not rung in thirty years, but tonight it rang through the cold stone.',
    'Wren dropped the good ink, and the black ran across the floorboards like spilled night.',
    'Nobody in the town ever forgot the sound of the sea going out across the old salt flats.',
    '“The water is going, and it will not wait for us,” Wren said.',
  ];
  const two = [
    'The causeway rose out of the grey bay, yet no one dared to walk it before the morning light.',
    'Kit counted the lanterns along the harbour wall, but the smoke hid half of them from view.',
    '“Never trust the tide bell, whatever the wardens tell you,” Kit said.',
    'The chart on the wall had a blank where the drowned town should be, and nobody ever asked why.',
  ];
  const chapters: QuizChapter[] = [
    { id: 'c1', title: 'The Bell', paragraphs: [null, ...one] },
    { id: 'c2', title: '', paragraphs: two },
  ];
  const speakers = new Map<string, QuizSpeaker>([
    ['w', { name: 'Wren Hollis', lines: [{ nodeId: 'c1', block: 4, words: 'The water is going, and it will not wait for us' }] }],
    ['k', { name: 'Kit Marrow', lines: [{ nodeId: 'c2', block: 2, words: 'Never trust the tide bell, whatever the wardens tell you' }] }],
    ['i', { name: 'Ilse Marrow', lines: [] }],
  ]);

  test('the kinds take turn about, each right answer among the choices, no line asked twice', () => {
    const quiz = bookQuiz(chapters, speakers, { seed: 7 });
    expect(quiz.length).toBeGreaterThanOrEqual(quizAtLeast);
    expect(quiz.length).toBeLessThanOrEqual(quizLength);
    const firstKinds = new Set(quiz.slice(0, 4).map((q) => q.kind));
    expect(firstKinds.has('whoSaid') && firstKinds.has('missingWord')).toBe(true);
    for (const q of quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThanOrEqual(q.options.length - 1);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
    const asked = quiz.filter((q) => q.kind !== 'whichFirst').map((q) => q.line);
    expect(new Set(asked).size).toBe(asked.length);
  });

  test('who said it: the speaker among the cast; which chapter: the chapter said as it is titled', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const q of bookQuiz(chapters, speakers, { seed })) {
        switch (q.kind) {
          case 'whoSaid': {
            const right = q.options[q.answer];
            const said = [...speakers.values()].find((s) => s.name === right)!.lines.map((l) => `“${l.words}”`);
            expect(said).toContain(q.line);
            expect(q.options).toHaveLength(3);
            break;
          }
          case 'whichChapter':
            expect(q.options).toEqual(['Chapter 1 · The Bell', 'Chapter 2']);
            expect(q.options[q.answer]).toBe(q.nodeId === 'c1' ? 'Chapter 1 · The Bell' : 'Chapter 2');
            break;
          case 'missingWord': {
            expect(q.line).toContain(quizGap);
            const [before, after] = q.line.split(quizGap);
            const whole = [...one, ...two].find((p) => p.includes(before) && p.includes(after))!;
            expect(whole).toContain(q.options[q.answer]);
            break;
          }
          case 'whichFirst': {
            expect(q.options).toHaveLength(2);
            const all = [...one, ...two];
            const at = q.options.map((o) => all.findIndex((p) => p.includes(o)));
            expect(at[q.answer]).toBeLessThan(at[1 - q.answer]);
            break;
          }
        }
      }
    }
  });

  test('a seed picks the game: the same seed the same, another seed another', () => {
    const game = (seed: number) => bookQuiz(chapters, speakers, { seed }).map((q) => `${q.kind}${q.line}`).join('');
    expect(game(3)).toBe(game(3));
    expect(new Set(Array.from({ length: 6 }, (_, s) => game(s))).size).toBeGreaterThan(1);
  });

  test('one chapter and one character still make a game; too little makes none', () => {
    const alone = bookQuiz([chapters[0], { id: 'c2', title: '', paragraphs: two }], new Map([['w', speakers.get('w')!]]), {
      seed: 1,
    });
    expect(alone.map((q) => q.kind)).not.toContain('whoSaid');
    expect(alone.length).toBeGreaterThan(0);
    expect(bookQuiz([{ id: 'c', title: '', paragraphs: ['Short.'] }], new Map(), { seed: 1 })).toEqual([]);
  });

  test('what a score says', () => {
    expect(quizVerdict(10, 10)).toContain('by heart');
    expect(quizVerdict(7, 10)).toContain('know it well');
    expect(quizVerdict(4, 10)).toContain('reread');
    expect(quizVerdict(1, 10)).toContain('read it again');
  });
});

describe('the gazette', () => {
  test('the paper is named for the place named most, else for the book', () => {
    expect(gazetteName('Vell', 'The Drowned Road')).toBe('The Vell Gazette');
    expect(gazetteName('The Mimir Forest', 'x')).toBe('The Mimir Forest Gazette');
    expect(gazetteName(null, 'The Ash Road')).toBe('The Ash Road Herald');
    expect(gazetteName('', '')).toBe('The Morning Herald');
  });

  test('the lead story: the opening, cut at a sentence near its length', () => {
    const short = leadOf(['One line here.', '', 'Another line.']);
    expect(short.lead).toEqual(['One line here.', 'Another line.']);
    expect(short.continues).toBe(false);
    const long = leadOf([repeat('word', 100), `${repeat('more', 15)}. ${repeat('gone', 30)}.`]);
    expect(long.continues).toBe(true);
    expect(long.lead[long.lead.length - 1].endsWith('more.')).toBe(true);
    expect(leadOf([repeat('word', 300)]).lead).toHaveLength(1);
  });

  test('the weather the words bring: twice is weather, a storm over rain, else fair', () => {
    expect(weatherOf('The fog came in. Fog on the quay, fog in the street.')).toEqual({ weather: 'fog', word: 'fog', count: 3 });
    expect(weatherOf('Rain fell. Thunder, then the storm, then rain again.').weather).toBe('storm');
    expect(weatherOf('Rain fell once.').weather).toBe('fair');
  });

  test('an edition a chapter with words: headline, deck, lead, what was said, the news', () => {
    const paper = gazette(
      'The Drowned Road',
      [
        {
          id: 'c1',
          title: 'The Bell',
          paragraphs: [
            'The bell in the tower rang across Vell, and nobody in the town slept again that night.',
            '“The water is going,” Wren said.',
            '“So soon, after all,” said Ilse, and the fog came up the street. Fog everywhere.',
            'Wren went down to the quay in Vell. The salt ran white on every stone, but the sea did not care.',
          ],
        },
        { id: 'c2', title: '', paragraphs: [] },
        { id: 'c3', title: '', paragraphs: ['Wren walked the road alone, and the mist followed her the whole way.'] },
      ],
      [
        { name: 'Wren Hollis', names: ['Wren Hollis', 'Wren'] },
        { name: 'Ilse Marrow', names: ['Ilse Marrow', 'Ilse'] },
        { name: 'Kit Marrow', names: ['Kit Marrow', 'Kit'] },
      ],
      { places: [['Vell'], ['Old Merrow']] },
    );
    expect(paper.name).toBe('The Vell Gazette');
    expect(paper.editions.map((e) => [e.chapter, e.headline])).toEqual([
      [1, 'The Bell'],
      [3, 'Chapter 3'],
    ]);
    const first = paper.editions[0];
    expect(first.said.map((s) => s.speaker)).toEqual(['Wren Hollis', 'Ilse Marrow']);
    expect(first.said[0].words.startsWith('The water is going')).toBe(true);
    expect(first.said[1].words.startsWith('So soon, after all')).toBe(true);
    expect(first.inTheNews).toEqual([
      { name: 'Wren Hollis', count: 2 },
      { name: 'Ilse Marrow', count: 1 },
    ]);
    expect([first.weather, first.weatherWord, first.weatherCount]).toEqual(['fog', 'fog', 2]);
    expect(first.deck.length).toBeGreaterThan(0);
    expect(first.continues).toBe(false);
  });
});

describe('postcards', () => {
  test('places named in the pages, by the look of the name, without the word before', () => {
    expect(placesNamedIn('A top of the Mimir Forest, a figure was flying.')).toEqual(['Mimir Forest']);
    expect(placesNamedIn('They rode to the Kingdom of Aldia and the Grey Tower.')).toEqual(['Kingdom of Aldia', 'Grey Tower']);
    expect(placesNamedIn('The Forest was dark. In Town Hall he waited.')).toEqual(['Town Hall']);
    expect(placesNamedIn('He went into the forest and the old tower.')).toEqual([]);
  });

  test('what the painting shows, and its light always the same for a name', () => {
    expect(sceneryOf('Hollow Light: the lighthouse on its spur of black rock at the east end of the bay')).toEqual({
      water: true,
      trees: false,
      peaks: false,
      roofs: false,
      tower: true,
      beacon: true,
      dunes: false,
    });
    expect(sceneryOf('A town by the sea with a bell tower').beacon).toBe(false);
    expect(sceneryOf('The Grey Peaks').peaks).toBe(true);
    expect(sceneryOf('Mimir Forest').trees).toBe(true);
    expect(sceneryOf('Lantern Street').roofs).toBe(true);
    expect(sceneryOf('Somewhere')).toEqual({
      water: false,
      trees: false,
      peaks: false,
      roofs: false,
      tower: false,
      beacon: false,
      dunes: false,
    });
    expect(lightOf('Old Merrow')).toBe(lightOf('Old Merrow'));
    expect(new Set(['Vell', 'Old Merrow', 'Hollow Light', 'Mimir Forest', 'Aldia', 'Grey Tower'].map(lightOf)).size).toBeGreaterThan(1);
  });

  const one = [
    null,
    'Wren ran down Lantern Street to the quay.',
    'From the top of Lantern Street the sea was a silver ribbon, and nobody had seen it go out like that.',
    'Far off, beyond the Mimir Forest, the bells were ringing in the cold.',
  ];
  const two = ['Old Merrow lay under the water, but its stones were still there.', 'Vell was quiet.'];
  const chapters: PostcardChapter[] = [
    { id: 'c1', title: 'The Bell', paragraphs: one },
    { id: 'c2', title: '', paragraphs: two },
  ];
  const kept: KeptPlace[] = [
    { names: ['Old Merrow'], about: 'The salt town the sea took three hundred years ago.' },
    { names: ['Lantern Street'], about: 'Where the chart shop stands.' },
    { names: ['Vell'], about: 'The harbour town.' },
    { names: ['The Moon Gate'], about: 'Never named in the pages.' },
  ];

  test('a postcard for each place the book names in a sentence, its best line, in the order the book names them', () => {
    const cards = postcards(chapters, kept);
    expect(cards.map((c) => c.place)).toEqual(['Lantern Street', 'Mimir Forest', 'Old Merrow']);
    const street = cards[0];
    expect(street.line.startsWith('From the top of Lantern Street')).toBe(true);
    expect([street.chapter, street.chapterTitle, street.nodeId, street.block, street.kept]).toEqual([1, 'The Bell', 'c1', 2, true]);
    expect(street.scenery.roofs).toBe(true);
    expect([cards[1].kept, cards[1].scenery.trees]).toEqual([false, true]);
    expect(cards[2].scenery.water).toBe(true);
  });

  test('too short a sentence is no line: Vell, said only in three words, has no postcard', () => {
    expect(postcards(chapters, kept).map((c) => c.place)).not.toContain('Vell');
    expect(postcards([], [])).toEqual([]);
  });
});

describe('the sampler', () => {
  const chapter = (title: string, words: number): SampleChapter => ({ title, paragraphs: [repeat('word', words)] });

  test('the opening: chapters until a reader has enough, three at most, empty ones passed over', () => {
    expect(sampleChapters([chapter('One', 2000), chapter('Two', 500)]).map((c) => c.title)).toEqual(['One']);
    expect(
      sampleChapters([chapter('One', 400), chapter('', 0), chapter('Two', 600), chapter('Three', 900)]).map((c) => c.title),
    ).toEqual(['One', 'Two', 'Three']);
    expect(sampleChapters(Array.from({ length: 6 }, (_, i) => chapter(`${i}`, 100)))).toHaveLength(3);
  });

  test('a title page, the chapters each on a new page, and a last page that says how much more', () => {
    const sample = samplerOf({
      title: 'The Drowned Road',
      author: 'R. Hollis',
      quote: 'The sea does not care how excited you are.',
      blurb: 'A girl, a chart, and nine days of low water.',
      chapters: [chapter('The Bell', 1600), chapter('Half a Map', 700)],
      allChapters: 15,
      allWords: 9645,
    });
    const heads = sample.blocks.filter((b): b is HeadingBlock => b instanceof HeadingBlock).map((b) => [b.role, b.text, b.pageBreak]);
    expect(heads).toEqual([
      ['title', 'The Drowned Road', false],
      ['subtitle', 'by R. Hollis', false],
      ['chapter', 'The Bell', true],
    ]);
    const last = sample.blocks.filter((b): b is ParagraphBlock => b instanceof ParagraphBlock);
    expect(last[last.length - 2].runs[0].text).toBe('End of the sample. The Drowned Road runs to 15 chapters and 9,645 words so far.');
    expect(last[last.length - 1].runs[0].text).toBe('Made with Scriptor');
    expect([sample.wordCount, sample.chapterCount]).toEqual([1600, 1]);
    const pdf = renderPdf(sample);
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-');
    expect(layoutPdf(sample).length).toBeGreaterThan(2);
  });

  test('a short book: all of it, and said so', () => {
    const sample = samplerOf({ title: '', author: '', quote: '', blurb: '', chapters: [chapter('One', 300)], allChapters: 1, allWords: 300 });
    const texts = sample.blocks.filter((b): b is ParagraphBlock => b instanceof ParagraphBlock).map((b) => b.runs[0].text);
    expect(texts).toContain('End of the sample: all of Untitled so far, 300 words.');
    expect(sample.blocks.find((b): b is HeadingBlock => b instanceof HeadingBlock)!.text).toBe('Untitled');
  });
});

describe('the submission kit', () => {
  test('a genre’s usual length; most adult fiction when it says nothing', () => {
    expect(lengthFor('Fantasy')).toEqual({ genre: 'Fantasy and science fiction', low: 90000, high: 120000 });
    expect(lengthFor('Cozy Mystery').low).toBe(70000);
    expect(lengthFor('Young Adult Fantasy').genre).toBe('Young adult');
    expect(lengthFor('LitRPG').high).toBe(120000);
    expect(lengthFor('')).toEqual({ genre: 'Most adult fiction', low: 70000, high: 100000 });
  });

  test('the kit: each thing ready or not, and what is said of it', () => {
    const kit = submissionKit({ title: 'The Drowned Road', author: '', genre: 'Fantasy', words: 9645, synopsis: repeat('word', 71), openingSlips: 2 });
    expect(kit.map((k) => [k.item, k.ready])).toEqual([
      ['title', true],
      ['author', false],
      ['genre', true],
      ['length', false],
      ['synopsis', false],
      ['opening', false],
    ]);
    expect(kit[3].said).toBe('9,645 words. Fantasy and science fiction usually runs 90,000 to 120,000, when the draft is done.');
    expect(kit[4].said).toBe('71 words. A page is about 300 to 600, the ending told.');
    expect(kit[5].said).toBe('2 slips to put right in the first 3 chapters.');
    const ready = submissionKit({ title: 'A', author: 'R. Hollis', genre: 'Thriller', words: 82000, synopsis: repeat('word', 450), openingSlips: 0 });
    expect(ready.every((k) => k.ready)).toBe(true);
    expect(submissionKit({ title: 'Untitled', author: 'x', genre: 'x', words: 0, synopsis: '', openingSlips: 0 })[0].ready).toBe(false);
  });

  test('the query letter: the book’s own details in the shape agents ask for, the rest left as gaps', () => {
    const letter = queryLetter({
      title: 'The Drowned Road',
      author: 'R. Hollis',
      genre: 'Fantasy',
      more: ['Adventure', 'Mystery'],
      words: 104321,
      finished: true,
      synopsis: 'Once in a generation the sea goes out. Wren means to finish the chart.',
    });
    expect(letter.startsWith('Dear [[the agent’s name]],')).toBe(true);
    expect(letter).toContain(
      'I am seeking representation for THE DROWNED ROAD, a fantasy novel with elements of adventure and mystery, ' +
        'complete at 104,000 words. It will appeal to readers of [[two or three recent books like it]].',
    );
    expect(letter).toContain('Once in a generation the sea goes out. Wren means to finish the chart.');
    expect(letter.endsWith('With best wishes,\nR. Hollis')).toBe(true);
    const draft = queryLetter({ title: '', author: '', genre: 'Epic fantasy', words: 9000, finished: false, synopsis: '' });
    expect(draft).toContain('[[the title]], an epic fantasy novel, complete at [[its length]] words');
    expect(draft).toContain('[[the story in two short paragraphs');
    expect(draft.endsWith('[[your name]]')).toBe(true);
  });
});

describe('the trailer', () => {
  const kinds = (t: Trailer) => t.shots.map((s) => s.kind);
  const lines = (t: Trailer) => t.shots.filter((s) => s.kind === 'line').map((s) => s.text);

  test('from the author, lines from the book, the names it is about, the strongest last, the title', () => {
    const book = [
      'The bell rang over the town at dawn, and nobody in the town of Low Harrow thought anything of it at all.',
      '“Is the water going?” Wren asked.',
      'Wren ran down to the quay.',
      'Kai said nothing for a long while.',
      '“Nobody crosses the road at night!” Kai said.',
      'Wren looked at Kai.',
      'Wren went home.',
      'The tide came in.',
      'Wren slept.',
      '“Kai, the road will drown us all, will it not?” Wren cried, and that was the ending of it.',
    ];
    const t = trailerOf(book, {
      title: 'The Drowned Road',
      author: 'R. G. A.',
      cast: [
        { name: 'Wren Hollis', names: ['Wren'] },
        { name: 'Kai Marrow', names: ['Kai'] },
        { name: 'Orrin', names: ['Orrin'] },
      ],
    });
    expect(t.shots[0]).toEqual({ kind: 'from', text: 'From R. G. A.' });
    expect(t.shots[t.shots.length - 1]).toEqual({ kind: 'title', text: 'The Drowned Road' });
    expect(t.cast).toEqual(['Wren Hollis', 'Kai Marrow']);
    expect(lines(t)).toContain('“Is the water going?”');
    expect(lines(t)).toContain('“Nobody crosses the road at night!”');
    expect(lines(t)[lines(t).length - 1]).toBe(t.sting);
    expect(lines(t).some((l) => l.includes('drown us all'))).toBe(false);
    expect(lines(t).some((l) => l.startsWith('The bell rang'))).toBe(false);
    expect(kinds(t).filter((k) => k === 'name')).toHaveLength(2);
    expect(kinds(t)[kinds(t).length - 2]).toBe('line');
  });

  test('not all questions; a spoken line ending in a comma ends as a sentence', () => {
    const book = [
      ...Array.from({ length: 6 }, (_, i) => `“Where is the bell number ${'abcdef'[i]}?”`),
      '“Go home now,” she said.',
      'The dark came down over the water.',
      'It was late.',
      'It was later.',
      'It was much later than that.',
    ];
    const t = trailerOf(book, { title: 'T', author: '' });
    expect(lines(t).filter((l) => l.endsWith('?”')).length).toBeLessThanOrEqual(2);
    expect(lines(t)).toContain('“Go home now.”');
    expect(t.shots[0].text).toBe('A new novel');
  });

  test('fragments, lists and long sentences are not lines a trailer takes', () => {
    expect(lines(trailerOf(['and then she went.', 'The list: bread; salt.', 'He waited.'], { title: 'T', author: 'A' }))).toEqual([]);
  });

  test('nothing written: who it is from, and the title', () => {
    const t = trailerOf([], { title: '', author: 'A' });
    expect(kinds(t)).toEqual(['from', 'title']);
    expect(t.shots[t.shots.length - 1].text).toBe('Untitled');
    expect(t.sting).toBe('');
  });
});
