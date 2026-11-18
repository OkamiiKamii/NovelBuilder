// The logic of flutter_app/test/features/review/proof_test.dart (the book read for its slips, said and listed a kind at a
// time, each read where it is; a book that reads clean; a chapter with no title opening its chapter) and the
// continuity page end to end on a real library: rules recorded through the service, the saved text checked, decisions
// kept and withdrawn, "Update canon" changing only the rule, and the manuscript never written to. What those tests check
// of the widgets themselves (taps, the More card, the router) belongs to the screens.

import { openLibrary } from '../../../src/data/library';
import { addSampleNovel } from '../../../src/data/sampleNovel';
import { CharacterService } from '../../../src/domain/characters/characterService';
import { audit } from '../../../src/domain/continuity/audit';
import { ContinuityService } from '../../../src/domain/continuity/continuityService';
import { ContinuityRule } from '../../../src/domain/continuity/rules';
import { continuityView, rulesInOrder } from '../../../src/domain/continuity/screens/continuityPage';
import { str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { proofsOf } from '../../../src/domain/proof/proof';
import { proofCard, proofChipPressed, proofReading, proofTitle, proofView } from '../../../src/domain/proof/screens/proofPage';
import { textToDoc } from '../../../src/domain/prose';
import { ReviewItem } from '../../../src/domain/records/review';
import { sampleJson, testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';

/** A book of one chapter, "The Hooded Figures", with `text` in it, and James in the cast. */
function book(text: string) {
  let now = Date.UTC(2026, 10, 17, 9);
  const lib = openLibrary(memoryLibrary(), () => (now += 1000), testIds());
  const novel = lib.library.create({ title: 'Skill In Fantasy' }).novel.id;
  for (const n of lib.manuscript.nodes(novel)) lib.manuscript.delete(novel, n.id, n.title);
  lib.novels.writeRows(novel, [
    { collection: 'loreEntries', id: 'james', value: { id: 'james', projectId: novel, category: 'character', name: 'James', fields: [] } },
  ]);
  const chapter = lib.manuscript.create(novel, 'chapter', null, 'The Hooded Figures').id;
  lib.manuscript.save(novel, chapter, textToDoc(text), { baseRev: lib.manuscript.open(novel, chapter).rev });
  const characters = new CharacterService(lib.novels, lib.backups);
  return { lib, novel, chapter, characters, clock: () => (now += 1000) };
}

const read = (b: ReturnType<typeof book>) =>
  proofReading(b.characters.storedChapters(b.novel), b.lib.novels.rowsIn(b.novel, 'chapters'), b.lib.novels.rowsIn(b.novel, 'loreEntries'));

test('the book read for what a proofreader would mark; said, a kind at a time, each read where it is; it only reads', () => {
  const b = book(
    'James ran. James stopped. James looked back.\n' + 'With that the waitress left and didn’t looked back.\n' + 'Then Jmaes laughed, and the the door closed.',
  );
  const before = JSON.stringify(b.lib.novels.load(b.novel)!.rows('chapterContents'));
  const reading = read(b);
  const proofs = reading.run();
  const view = proofView(proofs, proofTitle('Skill In Fantasy'), null);
  expect(view.said.startsWith('3 things to check in Skill In Fantasy')).toBe(true);
  expect(view.chips.map((c) => c.label)).toEqual(['All 3', 'Name slips 1', 'Doubled words 1', 'After “didn’t” 1']);
  expect(proofs.map((p) => p.note)).toEqual(['After “didn’t”, the plain verb: “look”?', '“Jmaes”: is it James?', '“the” twice.']);
  // A kind at a time; pressed again, all.
  const only = proofChipPressed(null, 'doubled');
  expect(proofView(proofs, 'x', only).shown.map((p) => p.note)).toEqual(['“the” twice.']);
  expect(proofChipPressed(only, 'doubled')).toBeNull();
  // Read it there: the chapter, by its id, with the words to find.
  const card = proofCard(proofs[2], reading.titles.get(proofs[2].nodeId)!);
  expect([card.where, card.findsWords, proofs[2].nodeId, proofs[2].find]).toEqual(['Chapter 1 · The Hooded Figures', true, b.chapter, 'the the']);
  expect(JSON.stringify(b.lib.novels.load(b.novel)!.rows('chapterContents'))).toBe(before);
});

test('a book that reads clean: said so, and nothing to press', () => {
  const lib = openLibrary(memoryLibrary(), () => Date.UTC(2026, 10, 13), testIds());
  const id = addSampleNovel(lib.novels, sampleJson(), Date.UTC(2026, 10, 13));
  const characters = new CharacterService(lib.novels, lib.backups);
  const proofs = proofReading(characters.storedChapters(id), lib.novels.rowsIn(id, 'chapters'), lib.novels.rowsIn(id, 'loreEntries')).run();
  const view = proofView(proofs, proofTitle('The Drowned Road'), null);
  expect([view.said, view.chips]).toEqual(['Nothing to check in The Drowned Road: it reads clean.', []]);
});

test('a chapter with no title opens its chapter', () => {
  const proofs = proofsOf([{ id: 'c1', title: '', paragraphs: ['Some words here.'] }]);
  const card = proofCard(proofs[0], '');
  expect([proofs[0].note, card.findsWords, card.where, proofTitle('  ')]).toEqual(['Chapter 1 has no title.', false, 'Chapter 1', 'your book']);
});

test('the continuity page end to end: a rule recorded, the text checked, decided, reopened, and canon updated', () => {
  const b = book('James smiled at the crowd.\nThey spoke of James, who had said nothing.');
  const service = new ContinuityService(b.lib.novels, { clock: b.clock, createId: testIds() });
  const check = () => {
    const s = b.lib.novels.load(b.novel)!;
    const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']] as const));
    const rules = rulesInOrder(s.rows('continuityRules'), (r) => new ContinuityRule(r));
    return { rules, result: audit(StoryModel.fromSnapshot(s), docs, rules, s.rows('continuityResolutions').map((r) => new ReviewItem(r))) };
  };
  expect(continuityView(check().result, [], { severity: null, category: null, nodeId: null }).empty?.title).toBe('Tell the checker what must stay true');
  const before = JSON.stringify(b.lib.novels.load(b.novel)!.rows('chapterContents'));

  const rule = service.change(b.novel, (c) => c.createRule('status', { entryId: 'james', state: 'deceased' }));
  let { rules, result } = check();
  expect(result.open.map((i) => [i.severity, i.match])).toEqual([['critical', 'James']]);
  expect(continuityView(result, rules, { severity: null, category: null, nodeId: null }).header).toBe('1 open issue · 1 critical · 0 warnings · 0 info');

  // Marked intentional: off the open list, with its note; reopened, back.
  const issue = result.open[0];
  service.change(b.novel, (c) => c.decide(issue.key, issue.message, 'intentional', { note: 'Flashback sequence', nodeId: issue.nodeId }));
  ({ result } = check());
  expect([result.open.length, result.resolved.map((r) => [r.resolution.decision, r.resolution.note])]).toEqual([0, [['intentional', 'Flashback sequence']]]);
  service.change(b.novel, (c) => c.reopen(result.resolved[0].resolution.id));
  ({ result } = check());
  expect(result.open.length).toBe(1);

  // Update canon: the rule ends at the chapter; the finding goes; the text is as it was.
  service.change(b.novel, (c) => c.applyFix(result.open[0].fix!));
  ({ rules, result } = check());
  expect([rules[0].id, rules[0].untilNodeId, result.open.length]).toEqual([rule.id, b.chapter, 0]);
  expect(JSON.stringify(b.lib.novels.load(b.novel)!.rows('chapterContents'))).toBe(before);
});
