// A port of flutter_app/test/features/write/nudge_test.dart (its pure tests, and what its widget tests time), with the
// cases nudge.dart's comments and chapter_editor.dart's `_nudges` describe. The orders under "the day's shuffle" were
// printed by Dart 3.10 running nudge.dart's shuffle and seed.

import { craftNudges, nudgeLine, nudgeSeed, nudgesFor, nudgesKey, stuckAfterMs } from '../../src/domain/desk/nudges';
import type { MarginNotes, MarginPerson, MarginThread } from '../../src/domain/desk/pageAround';

function notes({
  beats = [],
  objective = '',
  people = [],
  threads = [],
  mentioned = [],
}: {
  beats?: string[];
  objective?: string;
  people?: MarginPerson[];
  threads?: MarginThread[];
  mentioned?: string[];
} = {}): MarginNotes {
  return { summary: '', objective, beats, people, mentioned, threads, before: null };
}

describe('nudgesFor', () => {
  test('the story’s own nudges come first: the last line, the plan, the threads, who is here; then the moves', () => {
    const n = nudgesFor(
      notes({
        beats: ['Wren finds the ledger', 'The flood'],
        objective: 'Wren learns the truth',
        people: [
          { id: 'w', name: 'Wren', pov: true },
          { id: 'n', name: 'Nan', pov: false },
        ],
        threads: [{ id: 't', title: 'The ledger', development: 'It is found' }],
      }),
      { lastLine: '“Where were you?” Nan asked.', seed: 1 },
    );
    expect(n.slice(0, 7).map((x) => x.kind)).toEqual([
      'Your last line',
      'Your plan',
      'Your plan',
      'Your plan',
      'A thread',
      'Who is here',
      'Who is here',
    ]);
    expect(n[0].text).toContain('What is said back');
    expect(n[1].text).toContain('“Wren finds the ledger”');
    expect(n[5].text).toContain('Wren’s eyes');
    expect(n[6].text).toContain('What does Nan want');
    expect(new Set(n.slice(7).map((x) => x.kind))).toEqual(new Set(['A move']));
    expect(n).toHaveLength(7 + craftNudges.length);
  });

  test('a plain page gets the moves alone, in an order that changes with the day', () => {
    const a = nudgesFor(notes(), { lastLine: 'The river rose.', seed: 1 });
    const b = nudgesFor(notes(), { lastLine: 'The river rose.', seed: 2 });
    expect(new Set(a.map((x) => x.kind))).toEqual(new Set(['A move']));
    expect(new Set(a.map((x) => x.text))).toEqual(new Set(b.map((x) => x.text)));
    expect(a.map((x) => x.text)).not.toEqual(b.map((x) => x.text));
    expect(nudgesFor(notes(), { lastLine: 'Is it?', seed: 1 })[0].text).toContain('A question hangs');
    expect(nudgesFor(notes(), { lastLine: 'And then—', seed: 1 })[0].text).toContain('mid-thought');
  });

  test('how the last line ends: a closing quote, a question (in quotes too), a trailing off; else nothing', () => {
    const first = (line: string) => nudgesFor(notes(), { lastLine: line, seed: 1 })[0];
    expect(first('He said, "Go."  ').text).toBe('Someone just spoke. What is said back, or pointedly not said?');
    expect(first('“Go,” she said quietly.').kind).toBe('Your last line');
    expect(first('“Are you sure?”').text).toBe('Someone just spoke. What is said back, or pointedly not said?');
    expect(first('Was it her?’').text).toBe('A question hangs there. Answer it, or have someone avoid it.');
    for (const end of ['Well…', 'Well...', 'Well—', 'Well–']) {
      expect(first(end).text).toBe('You stopped mid-thought. Finish the sentence badly, then keep going.');
    }
    expect(first('The river rose.').kind).toBe('A move');
    expect(first('   ').kind).toBe('A move');
  });

  test('the plan: the first beat to write towards, the two after it, then what the chapter is for', () => {
    const n = nudgesFor(notes({ beats: ['One', 'Two', 'Three', 'Four'], objective: 'Escape' }), { lastLine: '', seed: 1 });
    expect(n.slice(0, 4).map((x) => x.text)).toEqual([
      'A beat for this chapter: “One”. Write towards it.',
      'Later in the plan: “Two”. What has to happen first?',
      'Later in the plan: “Three”. What has to happen first?',
      'This chapter is for: “Escape”. What is the next step towards it?',
    ]);
    expect(n[4].kind).toBe('A move');
  });

  test('two threads at most, each with its development when it has one', () => {
    const n = nudgesFor(
      notes({
        threads: [
          { id: 'a', title: 'The crown', development: '  A false lead ' },
          { id: 'b', title: 'The debt', development: '   ' },
          { id: 'c', title: 'The third', development: 'Never shown' },
        ],
      }),
      { lastLine: '', seed: 1 },
    );
    expect(n.slice(0, 2)).toEqual([
      { kind: 'A thread', text: '“The crown” moves here: “A false lead”. Let it surface in a line.' },
      { kind: 'A thread', text: '“The debt” moves here. Let it surface in a line.' },
    ]);
    expect(n[2].kind).toBe('A move');
  });

  test('who is here: the first point of view, two others; with nobody on the page, the first one mentioned', () => {
    const n = nudgesFor(
      notes({
        people: [
          { id: 'a', name: 'Ana', pov: false },
          { id: 'b', name: 'Bo', pov: true },
          { id: 'c', name: 'Cy', pov: true },
          { id: 'd', name: 'Di', pov: false },
          { id: 'e', name: 'Ed', pov: false },
        ],
        mentioned: ['Orrin'],
      }),
      { lastLine: '', seed: 1 },
    );
    expect(n.slice(0, 3).map((x) => x.text)).toEqual([
      'Through Bo’s eyes: one thing only they would notice right now.',
      'What does Ana want in this moment, and what is in the way?',
      'What does Di want in this moment, and what is in the way?',
    ]);
    expect(n[3].kind).toBe('A move');
    const mentioned = nudgesFor(notes({ mentioned: ['Orrin', 'Kai'] }), { lastLine: '', seed: 1 });
    expect(mentioned[0]).toEqual({ kind: 'Who is here', text: 'Orrin is meant to come up. Bring them in sideways.' });
  });

  test('the day’s shuffle: seeded by the date and the chapter, in the order Dart gives', () => {
    const now = new Date(2026, 10, 17, 9, 30).getTime();
    expect(nudgeSeed(now, 'c1')).toBe(990376471);
    expect(nudgeSeed(now, '0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(634708372);
    const order = (seed: number) =>
      nudgesFor(notes(), { lastLine: '', seed }).map((x) => craftNudges.indexOf(x.text));
    expect(order(nudgeSeed(now, 'c1'))).toEqual([3, 5, 9, 2, 7, 0, 4, 6, 1, 8]);
    expect(order(634708372)).toEqual([4, 7, 0, 2, 9, 1, 5, 8, 6, 3]);
    // The same all day; another the next.
    expect(nudgeSeed(new Date(2026, 10, 17, 23, 59).getTime(), 'c1')).toBe(990376471);
    expect(nudgeSeed(new Date(2026, 10, 18, 0, 1).getTime(), 'c1')).toBe(990376472);
  });
});

describe('the nudge’s line and timing', () => {
  test('the line the caret is in, when it has words; else the last with words', () => {
    const page = ['The gate was open.', 'Nobody guarded it.', '  ', ''];
    expect(nudgeLine(page, 0)).toBe('The gate was open.');
    expect(nudgeLine(page, 2)).toBe('Nobody guarded it.');
    expect(nudgeLine(page, null)).toBe('Nobody guarded it.');
    expect(nudgeLine(['', ' '], 0)).toBe('');
  });

  test('offered after 40 seconds still (not at 20); kept on or off on this device', () => {
    expect(stuckAfterMs).toBe(40000);
    expect(stuckAfterMs).toBeGreaterThan(20000);
    expect(nudgesKey).toBe('write.nudges');
  });
});
