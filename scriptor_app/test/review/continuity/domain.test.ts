// The proofreader's slips (flutter_app/test/shared/domain/proof_test.dart) and the tracked rules' changes
// (canon_changes_test.dart's "tracked rules keep only this novel's records; Update canon changes only what it says"),
// ported.

import { ChangeRefused, CodexChanges } from '../../../src/domain/codex/codexChanges';
import { ContinuityChanges } from '../../../src/domain/continuity/continuityChanges';
import { str } from '../../../src/domain/json';
import { type Proof, type Slip, plainOf, proofsOf } from '../../../src/domain/proof/proof';
import { maps } from '../../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';

describe('the proofreader’s slips', () => {
  const proofs = (paragraphs: (string | null)[], options: { title?: string; names?: string[] } = {}) =>
    proofsOf([{ id: 'c1', title: options.title ?? 'One', paragraphs }], { names: options.names ?? [] });
  /** What each slip marks, as the kind and the words marked. */
  const marks = (ps: Proof[]): [Slip, string][] => ps.map((p) => [p.kind, p.text.substring(p.start, p.end)]);

  test('the plain verb of a past form', () => {
    expect(['looked', 'tried', 'stopped', 'liked', 'hoped', 'walked', 'filled'].map(plainOf)).toEqual([
      'look',
      'try',
      'stop',
      'like',
      'hope',
      'walk',
      'fill',
    ]);
  });

  test('a name a letter off one of the book’s names, said rarely, where the name is said often', () => {
    const ps = proofs(
      [
        'James ran. James stopped. James looked back.',
        'Then Jmaes laughed, and Jame waved.',
        'Jamie is someone else entirely, said often: Jamie, Jamie, Jamie.',
      ],
      { names: ['James Hollis'] },
    );
    expect(marks(ps.filter((p) => p.kind === 'name'))).toEqual([
      ['name', 'Jmaes'],
      ['name', 'Jame'],
    ]);
    expect(ps.find((p) => p.kind === 'name')!.note).toBe('“Jmaes”: is it James?');
  });

  test('not a name slip: the name’s plural or possessive, or a word the book also writes small', () => {
    const ps = proofs(
      [
        'Fenn ran. Fenn sat. Fenn slept in Vell, and Vell slept in Vell.',
        'The Fenns had worked the crossings. Fenn’s boat was gone.',
        '“Well?” she said. It was well enough.',
      ],
      { names: ['Tobiah Fenn', 'Vell'] },
    );
    expect(ps.filter((p) => p.kind === 'name')).toEqual([]);
  });

  test('doubled words, but not the doubles English keeps', () => {
    expect(marks(proofs(['She went to the the quay. He had had enough. That that was it.']))).toEqual([['doubled', 'the the']]);
  });

  test('after didn’t, the plain verb', () => {
    const ps = proofs(['With that the waitress left and didn’t looked back. She did not tried. He didn’t need it.']);
    expect(marks(ps)).toEqual([
      ['didnt', 'didn’t looked'],
      ['didnt', 'did not tried'],
    ]);
    expect(ps[0].note).toBe('After “didn’t”, the plain verb: “look”?');
    expect(ps[0].find).toBe('didn’t looked');
  });

  test('a speech not closed, unless the next paragraph opens one', () => {
    const ps = proofs(['“Wait, she said. The road is gone.', 'Then it was quiet.', '“This one runs on, as speeches do,', '“and closes here.”']);
    expect(ps.filter((p) => p.kind === 'unclosed').map((p) => p.block)).toEqual([0]);
  });

  test('the few quotes that do not match the book’s', () => {
    const ps = proofs(['“One,” she said.', '“Two,” he said.', '"Three," they said.']);
    expect(ps.filter((p) => p.kind === 'quotes').map((p) => p.block)).toEqual([2]);
    expect(ps.find((p) => p.kind === 'quotes')!.note).toBe('A straight quote in a book of curly ones.');
  });

  test('spacing: a space before a stop or comma, two between words; in the order they come', () => {
    const ps = proofs(['He came , then went  away . Wait...  no.']);
    expect(ps.filter((p) => p.kind === 'spacing').map((p) => p.note)).toEqual([
      'A space before the “,”.',
      'Two spaces between words.',
      'A space before the “.”.',
      'Two spaces between words.',
    ]);
  });

  test('a sentence starting small, and i for I; not after Mr. or Dr.', () => {
    expect(marks(proofs(['He left. she stayed. Mr. black came, and i saw Dr. grey.']))).toEqual([
      ['small', 's'],
      ['small', 'i'],
    ]);
  });

  test('chapters with no title, or no words', () => {
    const ps = proofsOf([
      { id: 'a', title: '', paragraphs: ['Some words here.'] },
      { id: 'b', title: 'Empty', paragraphs: [null, ''] },
    ]);
    expect(ps.map((p) => [p.kind, p.chapter, p.note])).toEqual([
      ['chapter', 1, 'Chapter 1 has no title.'],
      ['chapter', 2, 'This chapter has no words yet.'],
    ]);
  });

  test('clean prose: nothing', () => {
    expect(
      proofs(['“The water is going,” Wren said. “Nine days.”', 'The bell in the tower rang, and nobody slept. Mr. Crane came at dawn.'], {
        names: ['Wren Hollis'],
      }),
    ).toEqual([]);
  });

  test('at most 60 of a kind', () => {
    const ps = proofs(Array.from({ length: 70 }, () => 'He went to the the quay.'));
    expect(ps.length).toBe(60);
  });
});

/** A novel of the test's own, changed in turn with ids and times handed out in order. */
class Novel {
  snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'Canon' }, collections: {} });
  clock = 1000;
  ids = 0;
  private run<C extends { snapshot: NovelSnapshot }, T>(make: (s: NovelSnapshot, now: number, id: () => string) => C, change: (c: C) => T): T {
    const c = make(this.snapshot, ++this.clock, () => `id${++this.ids}`);
    const result = change(c);
    this.snapshot = c.snapshot;
    return result;
  }
  rules<T>(change: (c: ContinuityChanges) => T): T {
    return this.run((s, now, createId) => new ContinuityChanges(s, { now, createId }), change);
  }
  codex<T>(change: (c: CodexChanges) => T): T {
    return this.run((s, now, createId) => new CodexChanges(s, { now, createId }), change);
  }
}

test('tracked rules keep only this novel’s records; "Update canon" changes only what it says', () => {
  const n = new Novel();
  const mira = n.codex((c) => c.createEntry('character', 'Mira')).id;
  const rule = n.rules((c) =>
    c.createRule('status', { entryId: mira, state: 'nope', aliases: 'the heir, , The Heir', fromNodeId: 'gone', amount: 5 }),
  );
  expect([rule.state, rule.aliases, rule.fromNodeId, rule.amount]).toEqual(['deceased', ['the heir', 'The Heir'], null, null]);
  expect(() => n.rules((c) => c.createRule('weather'))).toThrow(ChangeRefused);
  const power = n.rules((c) => c.createRule('power', { entryId: mira, words: 'underground, Night' }));
  n.rules((c) => c.applyFix({ type: 'unblock', ruleId: power.id, word: 'night' }));
  expect(n.rules((c) => c.owned(power.id)).words).toEqual(['underground']);
  const travel = n.rules((c) => c.createRule('travel', { amount: 10 }));
  n.rules((c) => c.applyFix({ type: 'travel', ruleId: travel.id, amount: 2, unit: 'days' }));
  expect([n.rules((c) => c.owned(travel.id)).amount, n.rules((c) => c.owned(travel.id)).unit]).toEqual([2, 'days']);
  n.codex((c) => c.setOwnFields(mira, [{ id: 'age', key: 'Age', value: '19', type: 'text' }]));
  const fieldId = str(maps(n.snapshot.rows('loreEntries')[0]['fields'])[0]['id']);
  n.rules((c) => c.applyFix({ type: 'field', entryId: mira, fieldId, value: '20' }));
  expect(maps(n.snapshot.rows('loreEntries')[0]['fields'])[0]['value']).toBe('20');
  expect(() => n.rules((c) => c.applyFix({ type: 'field', entryId: mira, fieldId: 'nope', value: '1' }))).toThrow(ChangeRefused);
});

test('a decision is kept under its finding’s key, replaced by the next, and withdrawn by reopening', () => {
  const n = new Novel();
  n.rules((c) => c.decide('status|r1|c1|abc', 'Mira speaks.', 'intentional', { note: '  Flashback sequence  ', nodeId: 'gone' }));
  const first = n.snapshot.rows('continuityResolutions');
  expect(first.length).toBe(1);
  expect([first[0]['kind'], first[0]['note'], first[0]['nodeId'], first[0]['message']]).toEqual(['intentional', 'Flashback sequence', null, 'Mira speaks.']);
  n.rules((c) => c.decide('status|r1|c1|abc', 'Mira speaks.', 'dismissed'));
  const second = n.snapshot.rows('continuityResolutions');
  expect([second.length, second[0]['id'], second[0]['kind'], second[0]['createdAt']]).toEqual([1, first[0]['id'], 'dismissed', first[0]['createdAt']]);
  n.rules((c) => c.reopen(str(second[0]['id'])));
  expect(n.snapshot.rows('continuityResolutions')).toEqual([]);
});
