// The logic of flutter_app/test/features/review/canon_screens_test.dart's canon, knowledge and canon-marks cases, run
// on a real library through CanonService (what the screens call): a statement set to Canon and revised, its earlier
// wording kept as a retcon; acting on a secret while recorded as unaware said, and dismissed (then reopened); a
// retconned event marked, with its finding. Plus the pages' words: the canon list, a step of the history, the knowledge
// cells, the timeline review's subtitle and Scriptor's World wording. What those tests check of the widgets themselves
// (taps, scrolling, 200% text) belongs to the screens.

import { openLibrary } from '../../../src/data/library';
import { CanonService } from '../../../src/domain/canon/canonService';
import { checkRecords } from '../../../src/domain/canon/checks';
import { badgeOf, canonOverlay, markWords } from '../../../src/domain/canon/overlay';
import { reviewCanon } from '../../../src/domain/canon/review';
import {
  canonCardLines,
  canonGroups,
  canonMatches,
  cellWords,
  decisionWord,
  historyStepWords,
  inScriptorWords,
  pairWords,
  timelineReviewSubtitle,
} from '../../../src/domain/canon/screens';
import { CharacterService } from '../../../src/domain/characters/characterService';
import { CharacterSecret } from '../../../src/domain/characters/characterRecords';
import { checkKnowledge, knowledgeSpread } from '../../../src/domain/characters/knowledge';
import { type JsonMap } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { textToDoc } from '../../../src/domain/prose';
import { CanonFact } from '../../../src/domain/records/canon';
import { maps } from '../../../src/domain/records/jsonRecord';
import { ReviewItem } from '../../../src/domain/records/review';
import { reviewTimeline } from '../../../src/domain/timeline/review';
import { testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';

function setUp() {
  let now = 1_000_000;
  const lib = openLibrary(memoryLibrary(), () => (now += 1000), testIds());
  const novel = lib.library.create({ title: 'Canon' }).novel.id;
  for (const n of lib.manuscript.nodes(novel)) lib.manuscript.delete(novel, n.id, n.title);
  const chapter = (id: string, title: string, order: number): JsonMap => ({
    id,
    projectId: novel,
    parentId: null,
    kind: 'chapter',
    title,
    order,
    createdAt: order,
    updatedAt: 0,
  });
  lib.novels.writeRows(novel, [
    { collection: 'chapters', id: 'c1', value: chapter('c1', 'Chapter 1', 0) },
    { collection: 'chapters', id: 'c2', value: chapter('c2', 'Chapter 2', 1) },
    { collection: 'chapterContents', id: 'c1', value: { id: 'c1', projectId: novel, doc: textToDoc('The war began.') } },
    { collection: 'chapterContents', id: 'c2', value: { id: 'c2', projectId: novel, doc: textToDoc('Mira smiled at the guard.') } },
  ]);
  const people = new CharacterService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const mira = people.change(novel, (x) => x.create({ name: 'Mira' })).id;
  const orrin = people.change(novel, (x) => x.create({ name: 'Orrin' })).id;
  const canon = new CanonService(lib.novels, { clock: () => (now += 1000), createId: testIds() });
  const rows = (collection: string) => lib.novels.rowsIn(novel, collection);
  const model = () => StoryModel.fromSnapshot(lib.novels.load(novel)!);
  return { lib, novel, mira, orrin, canon, rows, model };
}

test('a statement is set to Canon, then revised: the earlier wording is kept as a retcon', () => {
  const n = setUp();
  const f = n.canon.canon(n.novel, (c) => c.create());
  n.canon.canon(n.novel, (c) => c.update(f.id, { statement: 'Founded 1,000 years ago' }));
  n.canon.canon(n.novel, (c) => c.setStatus(f.id, 'canon'));
  expect(n.rows('canonFacts')[0]['status']).toBe('canon');
  n.canon.canon(n.novel, (c) => c.revise(f.id, 'Founded 500 years ago', { reason: 'Book two' }));
  const fact = n.rows('canonFacts')[0];
  expect(fact['statement']).toBe('Founded 500 years ago');
  expect(maps(fact['history']).map((h) => h['kind'])).toEqual(['created', 'status', 'retcon']);
  expect(historyStepWords(maps(fact['history'])[2])).toBe('Retconned: “Founded 1,000 years ago” became “Founded 500 years ago”');
  // The list shows it under Canon, with no source yet.
  const reviews = reviewCanon([new CanonFact(fact)], [], []).reviews;
  expect(canonGroups(reviews).map((g) => g.heading)).toEqual(['Canon (1)']);
  expect(canonCardLines(reviews[0])).toEqual({ title: 'New fact', statement: 'Founded 500 years ago', details: 'Lore statement · No source recorded yet' });
  expect(canonMatches(new CanonFact(fact), { query: '1,000', status: null, kind: null, about: null })).toBe(true);
});

test('knowledge: acting on a secret while recorded as unaware is said, and dismissed', () => {
  const n = setUp();
  n.lib.novels.writeRows(n.novel, [
    {
      collection: 'characterSecrets',
      id: 's1',
      value: {
        id: 's1',
        projectId: n.novel,
        entryId: n.mira,
        title: 'The heir',
        description: 'Mira is the heir',
        status: 'Hidden',
        self: 'knows',
        knows: [],
        suspects: [],
        unaware: [],
        reader: 'unaware',
        records: [{ id: 'k1', characterId: n.orrin, state: 'unaware', belief: '', nodeId: 'c1', eventId: null, how: '', fromId: null }],
        needs: [{ id: 'n1', characterId: n.orrin, nodeId: 'c2', eventId: null, note: 'uses it' }],
        createdAt: 0,
        updatedAt: 0,
      },
    },
  ]);
  const model = n.model();
  const secrets = n.rows('characterSecrets').map((r) => new CharacterSecret(r));
  const findings = checkKnowledge(secrets, model);
  expect(findings.map((f) => f.message)).toEqual(['Orrin acts on “The heir” in Ch 2: Chapter 2, but is recorded as unaware of it there.']);
  const spread = knowledgeSpread(secrets[0], model, 'reading');
  const orrin = spread.rows.find((r) => r.characterId === n.orrin)!;
  expect(cellWords(orrin.name, spread.points[0].label, orrin.cells[0]).label).toMatch(/^Orrin at Ch 1: Chapter 1: Unaware/);
  n.canon.decide(n.novel, findings[0].key, findings[0].message, 'dismissed');
  const decision = n.rows('continuityResolutions');
  expect(decision.map((d) => d['kind'])).toEqual(['dismissed']);
  expect(decisionWord(new ReviewItem(decision[0]).decision)).toBe('Dismissed');
  // Kept again under the same key: replaced, not added.
  n.canon.decide(n.novel, findings[0].key, findings[0].message, 'intentional', { note: 'A bluff' });
  expect(n.rows('continuityResolutions').map((d) => [d['kind'], d['note']])).toEqual([['intentional', 'A bluff']]);
  n.canon.reopen(n.novel, str(n.rows('continuityResolutions')[0]['id']));
  expect(n.rows('continuityResolutions')).toEqual([]);
});

test('canon marks: a retconned event is marked, with its finding', () => {
  const n = setUp();
  n.lib.novels.writeRows(n.novel, [
    {
      collection: 'timelineEvents',
      id: 'e1',
      value: {
        id: 'e1',
        projectId: n.novel,
        name: 'The false dawn',
        description: '',
        when: { precision: 'exact', year: 10, month: null, day: null, hour: null, minute: null },
        duration: null,
        importance: 'minor',
        locationId: null,
        characters: [],
        entryIds: [],
        nodeIds: ['c1'],
        afterId: null,
        canon: 'retconned',
        createdAt: 0,
      },
    },
  ]);
  const model = n.model();
  const overlay = canonOverlay(model, {
    records: checkRecords(model, { facts: [], rules: [] }),
    timeline: reviewTimeline(model, []),
    canon: [],
    continuity: [],
  });
  const marked = [...overlay.entries()].filter(([key, m]) => key.startsWith('event:') && badgeOf(m) !== null);
  expect(marked.map(([key]) => key)).toEqual(['event:e1']);
  const mark = overlay.get('event:e1')!;
  expect(markWords(mark)).toBe('Canon status: Retconned. 1 to check.');
  expect(badgeOf(mark)).toEqual({ glyph: '↺!', tone: mark.warnings[0].severity });
  // The selected record's findings say each one's title ("Warning · Set aside, but still told. …").
  expect(mark.warnings.map((w) => `${w.title}.`)).toContain('Set aside, but still told.');
});

test('the pages’ words: the timeline review’s subtitle, a pair, and World for the Codex', () => {
  expect(timelineReviewSubtitle(0, 2, 1)).toBe('Nothing to look at · 2 decided · checked 1 event');
  expect(timelineReviewSubtitle(3, 5, 14)).toBe('3 to look at · 2 decided · checked 14 events');
  const a = new CanonFact({ id: 'a', subject: 'Moons', statement: 'Two moons', status: 'canon' });
  const b = new CanonFact({ id: 'b', subject: 'Moons', statement: 'One moon', status: 'provisional' });
  expect(pairWords({ a, b, stated: false })).toBe('“Two moons” (Canon) and “One moon” (Provisional) appear to conflict.');
  expect(inScriptorWords("This statement appears to differ from Mira's codex profile, which gives Age as “19”.")).toBe(
    "This statement appears to differ from Mira's World profile, which gives Age as “19”.",
  );
  expect(inScriptorWords('A codex entry that was removed')).toBe('A World entry that was removed');
  expect(inScriptorWords('Codex entry')).toBe('World entry');
});

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
