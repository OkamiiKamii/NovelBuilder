// Ports of flutter_app/test/shared/domain/closing_words_test.dart and of what the widget tests in
// flutter_app/test/features/write/margin_test.dart, first_page_test.dart, chapter_end_test.dart and next_note_test.dart
// read off the page, with the cases margin.dart, first_page.dart, chapter_end.dart and next_note.dart's comments
// describe.

import {
  type DeskRows,
  canPinNote,
  chapterEndOf,
  closingWords,
  displayTitle,
  documentIsEmpty,
  firstPageView,
  firstPageWays,
  hasPlan,
  marginCards,
  marginKey,
  marginNotesOf,
  nextNoteAfterWords,
  nextNoteMaxLength,
  nextNoteSheet,
  nextNoteSlip,
  nextNoteStarts,
  nextNotesKey,
  offersNoteOnLeaving,
  readNextNotes,
  storedNextNotes,
  withNextNote,
} from '../../src/domain/desk/pageAround';
import type { JsonMap } from '../../src/domain/json';
import { storyNode } from '../../src/domain/outline';
import { emptyDoc, textToDoc } from '../../src/domain/prose';

describe('closingWords', () => {
  test('the closing words are the last paragraphs, exactly as written, headings left out', () => {
    expect(closingWords(textToDoc('One.\n\nTwo, then three.'))).toEqual({ text: 'One.\n\nTwo, then three.', cut: false });
    expect(closingWords(emptyDoc())).toEqual({ text: '', cut: false });
    expect(closingWords(null)).toEqual({ text: '', cut: false });
    expect(
      closingWords({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Part one' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'It began.' }] },
        ],
      }),
    ).toEqual({ text: 'It began.', cut: false });
  });

  test('a long ending is cut at a space, never inside a word, and says it was cut', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const closing = closingWords(textToDoc(`Earlier.\n\n${words}`), 60);
    expect(closing.cut).toBe(true);
    expect(words.endsWith(closing.text)).toBe(true);
    expect(closing.text.startsWith('word')).toBe(true); // starts on a whole word
    expect(closing.text.length).toBeLessThanOrEqual(60);
    expect(closing.text.endsWith('word199')).toBe(true);
  });

  test('earlier paragraphs that do not fit are left out whole', () => {
    const closing = closingWords(textToDoc(`${'a '.repeat(100)}\n\nShort end.`), 50);
    expect(closing).toEqual({ text: 'Short end.', cut: true }); // too little room is left for a useful part of it
    const roomy = closingWords(textToDoc(`${'a '.repeat(100)}\n\nShort end.`), 80);
    expect(roomy.text.endsWith('a a\n\nShort end.')).toBe(true); // with room, the end of the earlier one too
  });

  test('one unbroken run longer than the room keeps its end', () => {
    expect(closingWords(textToDoc('x'.repeat(100)), 60)).toEqual({ text: 'x'.repeat(60), cut: true });
  });

  test('the room is counted in characters, not UTF-16 units', () => {
    expect(closingWords(textToDoc('😀'.repeat(10)), 10)).toEqual({ text: '😀'.repeat(10), cut: false });
  });
});

// The novel of the Flutter tests: "The Gate" (written) and "The River" (planned, not begun).
function novel({ plan = true }: { plan?: boolean } = {}) {
  const collections: Record<string, JsonMap[]> = {
    chapters: [
      { id: 'gate', kind: 'chapter', title: 'The Gate', order: 0, wordCount: 7 },
      { id: 'river', kind: 'chapter', title: 'The River', order: 1, wordCount: 0, summary: '  They cross. ' },
    ],
    chapterContents: [
      { id: 'gate', doc: textToDoc('The gate was open.\nNobody guarded it.') },
      { id: 'river', doc: emptyDoc() },
    ],
    loreEntries: [
      { id: 'mira', name: 'Mira Vance' },
      { id: 'kai', name: 'Kai' },
      { id: 'orrin', name: 'Orrin' },
      { id: 'nameless', name: '' },
    ],
    chapterPlans: plan
      ? [
          {
            id: 'river',
            objective: 'Get across before dawn ',
            beats: [
              { id: 'b1', text: 'The ford is gone' },
              { id: 'b2', text: ' Kai goes under' },
              { id: 'b3', text: '   ' },
            ],
            povIds: ['mira'],
            appearIds: ['kai', 'mira', 'gone'],
            mentionIds: ['orrin', 'nameless', 'gone'],
          },
        ]
      : [],
    plotThreads: [
      {
        id: 'crown',
        title: 'The stolen crown',
        beats: [
          { id: 't1', title: 'A false lead', nodeId: 'river' },
          { id: 't2', title: 'Elsewhere', nodeId: 'gate' },
        ],
      },
      { id: 'debt', title: '', beats: [{ id: 't3', title: '', nodeId: 'river' }] },
    ],
  };
  const rows: DeskRows = (c) => collections[c] ?? [];
  return { rows, nodes: collections.chapters.map(storyNode) };
}

describe('the margin', () => {
  test('how the chapter before ends, the plan, who is on the page (point of view first) and the threads here', () => {
    const { rows } = novel();
    const n = marginNotesOf(rows, 'river');
    expect(n).toEqual({
      summary: 'They cross.',
      objective: 'Get across before dawn',
      beats: ['The ford is gone', 'Kai goes under'],
      people: [
        { id: 'mira', name: 'Mira Vance', pov: true },
        { id: 'kai', name: 'Kai', pov: false },
      ],
      mentioned: ['Orrin'],
      threads: [
        { id: 'crown', title: 'The stolen crown', development: 'A false lead' },
        { id: 'debt', title: 'Untitled thread', development: '' },
      ],
      before: { title: 'The Gate', text: 'The gate was open.\n\nNobody guarded it.', cut: false },
    });
    expect(hasPlan(n)).toBe(true);
    expect(marginCards(n)).toEqual([
      { card: 'lastTime', title: 'Last time', subtitle: 'The Gate', text: 'The gate was open.\n\nNobody guarded it.' },
      {
        card: 'thisChapter',
        title: 'This chapter',
        summary: 'They cross.',
        objective: 'Get across before dawn',
        actionTooltip: "Open the chapter's plan",
      },
      {
        card: 'beats',
        title: 'Beats',
        beats: [
          { number: 1, text: 'The ford is gone' },
          { number: 2, text: 'Kai goes under' },
        ],
      },
      { card: 'onThePage', title: 'On the page', people: n.people, mentioned: 'Mentioned: Orrin' },
      { card: 'threads', title: 'Threads here', threads: n.threads },
    ]);
  });

  test('a chapter with no plan offers to plan it; the first chapter has nothing before it', () => {
    const { rows } = novel({ plan: false });
    const n = marginNotesOf(rows, 'gate');
    expect(n.before).toBeNull();
    expect(n.threads).toEqual([{ id: 'crown', title: 'The stolen crown', development: 'Elsewhere' }]);
    const bare = { ...n, threads: [] };
    expect(hasPlan(bare)).toBe(false);
    expect(marginCards(bare)).toEqual([
      { card: 'noPlan', title: 'This chapter', text: 'No plan yet.', action: 'Plan this chapter' },
    ]);
  });

  test('the chapter before is the nearest with words: one without words is passed over, and one with no text ends the search', () => {
    const rows: DeskRows = (c) =>
      ((
        {
          chapters: [
            { id: 'a', kind: 'chapter', title: 'A', order: 0, wordCount: 3 },
            { id: 'v', kind: 'volume', title: 'Part', order: 1, wordCount: 9 },
            { id: 'b', kind: 'chapter', title: '', order: 2, wordCount: 0 },
            { id: 'c', kind: 'chapter', title: 'C', order: 3, wordCount: 0 },
          ],
          chapterContents: [{ id: 'a', doc: textToDoc('It ends here.') }],
        } as Record<string, JsonMap[]>
      )[c] ?? []);
    expect(marginNotesOf(rows, 'c').before).toEqual({ title: 'A', text: 'It ends here.', cut: false });
    const counted: DeskRows = (c) =>
      c === 'chapters'
        ? [
            { id: 'a', kind: 'chapter', title: 'A', order: 0, wordCount: 3 },
            { id: 'b', kind: 'scene', title: '', order: 1, wordCount: 4 },
            { id: 'c', kind: 'chapter', title: 'C', order: 2, wordCount: 0 },
          ]
        : c === 'chapterContents'
          ? [{ id: 'a', doc: textToDoc('It ends here.') }]
          : [];
    expect(marginNotesOf(counted, 'c').before).toBeNull();
  });

  test('kept on or off on this device; untitled chapters named by their kind', () => {
    expect(marginKey).toBe('write.margin');
    expect(displayTitle(storyNode({ id: 'x', kind: 'scene', title: '' }))).toBe('Untitled scene');
    expect(displayTitle(storyNode({ id: 'x', kind: 'bogus', title: '' }))).toBe('Untitled item');
  });
});

describe('the first page', () => {
  test('an empty chapter opens on what is known of it, and a few ways in', () => {
    const { rows } = novel();
    const view = firstPageView(marginNotesOf(rows, 'river'), false);
    expect(view.intro).toBe('Nothing written here yet. What you already know of it:');
    expect(view.before).toEqual({
      heading: 'Where the story stands',
      ends: 'The Gate ends:',
      text: 'The gate was open.\n\nNobody guarded it.',
    });
    expect(view.purpose).toBe('Get across before dawn');
    expect(view.beats).toEqual([
      { number: '1.', text: 'The ford is gone' },
      { number: '2.', text: 'Kai goes under' },
    ]);
    expect(view.onThePage).toBe('Mira Vance (point of view), Kai');
    expect(view.movingHere).toEqual(['The stolen crown: A false lead', 'Untitled thread']);
    expect(view.offerPlan).toBe(false);
    expect(view.waysIn.map((w) => w.label)).toEqual(['A line of dialogue', 'A place', 'The middle of things']);
    expect(firstPageWays[0].prompt).toContain('Someone speaks.');
    expect(view.footer).toBe('Write on the first line above; this page goes with your first word.');
  });

  test('the purpose is the objective, else the summary; with no plan, the offer to plan it', () => {
    const { rows } = novel({ plan: false });
    const n = marginNotesOf(rows, 'river');
    expect(firstPageView(n, false).purpose).toBe('They cross.');
    const none = firstPageView({ ...n, summary: '', threads: [] }, false);
    expect(none.offerPlan).toBe(true);
    expect(none.purpose).toBe('');
  });

  test('with the notes beside the page, only the ways in; hidden, it holds the notes', () => {
    const { rows } = novel();
    const n = marginNotesOf(rows, 'river');
    const beside = firstPageView(n, true);
    expect(beside.intro).toBe('Nothing written here yet. What you know of it is beside the page.');
    expect([beside.before, beside.purpose, beside.beats, beside.onThePage, beside.movingHere]).toEqual([null, '', [], null, []]);
    expect(beside.offerPlan).toBe(false);
    expect(firstPageView(n, false).purpose).toBe('Get across before dawn');
  });

  test('only a page without words has a first page', () => {
    expect(documentIsEmpty([])).toBe(true);
    expect(documentIsEmpty(['', '   ', ' '])).toBe(true);
    expect(documentIsEmpty(['', 'Rain.'])).toBe(false);
  });
});

describe('the chapter’s end', () => {
  test('names what follows, with its length, and continues to it', () => {
    const { nodes } = novel();
    const withWords = nodes.map((n) => (n.id === 'river' ? storyNode({ ...n.raw, wordCount: 3 }) : n));
    const end = chapterEndOf(withWords, withWords[0], 'Ana Ash');
    expect(end.next?.id).toBe('river');
    expect([end.heading, end.title, end.detail, end.action, end.signature]).toEqual([
      'Next',
      'The River',
      '3 words',
      'Continue to “The River”',
      '',
    ]);
    expect(chapterEndOf(nodes, nodes[0], '').detail).toBe('Not begun');
  });

  test('a chapter’s first scene follows it, named as a scene', () => {
    const nodes = [
      storyNode({ id: 'c', kind: 'chapter', title: 'One', order: 0, wordCount: 0 }),
      storyNode({ id: 's', kind: 'scene', title: '', parentId: 'c', order: 0, wordCount: 1200 }),
    ];
    const end = chapterEndOf(nodes, nodes[0], '');
    expect([end.title, end.detail]).toEqual(['Untitled scene', 'A scene · 1,200 words']);
  });

  test('at the end of the manuscript, the next chapter to begin, after this one in the same part; signed once it has words', () => {
    const nodes = [
      storyNode({ id: 'p', kind: 'volume', title: 'Part', order: 0 }),
      storyNode({ id: 'c', kind: 'chapter', title: 'The Gate', parentId: 'p', order: 0, wordCount: 7 }),
      storyNode({ id: 's', kind: 'scene', title: 'Dusk', parentId: 'c', order: 0, wordCount: 0 }),
    ];
    const end = chapterEndOf(nodes, nodes[2], 'Ana Ash');
    expect(end.next).toBeNull();
    expect([end.heading, end.title, end.detail, end.action]).toEqual([
      'The end, so far',
      'Chapter 2',
      null,
      'Begin the next chapter',
    ]);
    expect(end.beginIn).toBe('p');
    expect(end.signature).toBe('Ana Ash');
    const unwritten = nodes.map((n) => storyNode({ ...n.raw, wordCount: 0 }));
    expect(chapterEndOf(unwritten, unwritten[2], 'Ana Ash').signature).toBe('');
    expect(chapterEndOf(nodes, nodes[1], 'Ana Ash').beginIn).toBe('p');
  });
});

describe('a note for next time', () => {
  test('kept in this device’s settings by novel, trimmed, read back, and put away', () => {
    expect(nextNotesKey('n1')).toBe('write.nextNotes.n1');
    let notes = withNextNote(new Map(), 'gate', '  Next, Orrin finds the gate unguarded. ', 1000);
    expect(notes.get('gate')).toEqual({ text: 'Next, Orrin finds the gate unguarded.', at: 1000 });
    const kept = storedNextNotes(notes);
    expect(kept).toEqual({ gate: { text: 'Next, Orrin finds the gate unguarded.', at: 1000 } });
    expect(readNextNotes(JSON.parse(JSON.stringify(kept)))).toEqual(notes);
    notes = withNextNote(notes, 'gate', '   ', 2000);
    expect(notes.size).toBe(0);
  });

  test('read leniently: notes without words are left out; a missing time is 0', () => {
    expect(readNextNotes(null).size).toBe(0);
    expect(readNextNotes(['x']).size).toBe(0);
    const notes = readNextNotes({ a: { text: ' ' }, b: { text: 3 }, c: 'x', d: { text: ' Kept ' }, e: { text: 'At', at: 12.7 } });
    expect([...notes.entries()]).toEqual([
      ['d', { text: ' Kept ', at: 0 }],
      ['e', { text: 'At', at: 12 }],
    ]);
  });

  test('offered on leaving after a hundred words, when no note is left; the sheet’s words', () => {
    expect(nextNoteAfterWords).toBe(100);
    expect(offersNoteOnLeaving(99, false)).toBe(false);
    expect(offersNoteOnLeaving(100, false)).toBe(true);
    expect(offersNoteOnLeaving(300, true)).toBe(false);
    expect(nextNoteMaxLength).toBe(280);
    expect(nextNoteStarts).toEqual(['Next, ', 'Finish the scene where ', 'Remember: ', 'The line I want: ']);
    const leaving = nextNoteSheet('The Gate', true);
    expect([leaving.heading, leaving.dismiss, leaving.pin]).toEqual(['Before you go', 'Leave without one', 'Pin the note']);
    expect(leaving.body).toBe(
      'One line for when you come back to “The Gate”: what happens next, while you still know. It waits under your last line.',
    );
    expect(leaving.starts[0]).toEqual({ label: 'Next,', text: 'Next, ' });
    const later = nextNoteSheet('The Gate', false);
    expect([later.heading, later.dismiss]).toEqual(['A note for next time', 'Cancel']);
    expect(canPinNote('')).toBe(false); // nothing to pin yet
    expect(canPinNote('Next, ')).toBe(true);
    expect(nextNoteSlip(undefined, true)).toBe('offer');
    expect(nextNoteSlip(undefined, false)).toBe('none');
    expect(nextNoteSlip({ text: 'x', at: 0 }, false)).toBe('pinned');
  });
});
