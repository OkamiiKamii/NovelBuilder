// The logic of Review's screen tests (flutter_app/test/features/review/all_clear_test.dart, record_check_test.dart and
// review_kept_test.dart): with nothing raised, the certificate of what was checked, and the list back once something
// is; a broken reference found and only that reference taken out; look-alikes marked "Not duplicates" and reopened, a
// merge shown in full, confirmed by name, and undone; the review made from what was written. What those check of the
// widgets themselves (taps, 200% text, contrast) belongs to the screens; the presses are run here as the changes they
// make, on a real library, as the screens run them (IntegrityService, CanonService, CharacterService).
//
// And the review page's own logic: the queue most serious first, a decision moving it on, the filters, the groups.

import { openLibrary } from '../../../src/data/library';
import { CanonService } from '../../../src/domain/canon/canonService';
import { CharacterService } from '../../../src/domain/characters/characterService';
import { IntegrityService } from '../../../src/domain/integrity/integrityService';
import { type JsonMap, str } from '../../../src/domain/json';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { textToDoc } from '../../../src/domain/prose';
import { reviewSourceWords, reviewSources } from '../../../src/domain/review/collect';
import { ReviewData } from '../../../src/domain/review/reviewData';
import { brokenLine, mergeConfirmed, mergeWords, recordCheck } from '../../../src/domain/review/screens/recordCheck';
import {
  afterDecision,
  allClear,
  clampAt,
  noWarningFilters,
  scriptorPlace,
  warningsView,
  worldWords,
} from '../../../src/domain/review/screens/warnings';
import { testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';

function setUp() {
  let now = Date.UTC(2026, 10, 17, 9);
  const lib = openLibrary(memoryLibrary(), () => (now += 1000), testIds());
  const novel = lib.library.create({ title: 'Ashfall' }).novel.id;
  const ids = testIds();
  const characters = new CharacterService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: ids });
  const canon = new CanonService(lib.novels, { clock: () => (now += 1000), createId: ids });
  const integrity = new IntegrityService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: ids });
  const review = () => {
    const s = lib.novels.load(novel)!;
    const docs = new Map(lib.novels.rowsIn(novel, 'chapterContents').map((r) => [str(r['id']), r['doc']]));
    return new ReviewData(novel, s, StoryModel.fromSnapshot(s), docs);
  };
  const row = (collection: string, id: string): JsonMap | null => lib.novels.rowsIn(novel, collection).find((r) => r['id'] === id) ?? null;
  return { lib, novel, characters, canon, integrity, review, row };
}

test('with nothing raised, Review is a certificate of what was checked; once a check raises something, the list returns', () => {
  const w = setUp();
  // A new novel comes with chapter one, empty: the review reads it, finds nothing.
  w.characters.change(w.novel, (x) => x.create({ name: 'Mira' }));
  w.characters.change(w.novel, (x) => x.createEntry('location', 'Vell'));
  const data = w.review();
  expect(data.status.items).toEqual([]);
  const clear = allClear(data.model, data.manuscript.scanned);
  expect(clear.title).toBe('In good order');
  expect(clear.said).toContain('1 character and 1 world entry');
  expect(clear.checks.map((c) => c.label)).toEqual(reviewSources.map((s) => reviewSourceWords[s].label));
  expect(clear.checks.some((c) => c.what.includes('codex'))).toBe(false);

  w.canon.canon(w.novel, (x) => x.create({ subject: 'Weather', status: 'conflicting' }));
  const after = w.review();
  const v = warningsView(after.status.items, 'todo', false, noWarningFilters);
  expect(v.items.length).toBeGreaterThan(0);
  expect(v.queue.length).toBeGreaterThan(0);
  expect(v.status.startsWith('1 to look at')).toBe(true);
});

test('the record check finds a broken reference and takes only that reference out', () => {
  const w = setUp();
  w.lib.novels.writeRows(w.novel, [
    {
      collection: 'timelineEvents',
      id: 'siege',
      value: {
        id: 'siege',
        projectId: w.novel,
        name: 'The siege',
        characters: [{ id: 'a1b2c3d4-0000-4000-8000-000000000099', age: null }],
        nodeIds: [],
      },
    },
  ]);
  const load = () => {
    const s = w.lib.novels.load(w.novel)!;
    return recordCheck(s, StoryModel.fromSnapshot(s), 'Ashfall');
  };
  const check = load();
  expect(check.broken).toHaveLength(1);
  const line = brokenLine(check.broken[0]);
  expect(check.broken[0].says).toContain('points at a codex entry that no longer exists');
  expect(line.message).toContain('points at a World entry that no longer exists');
  expect(line.fix).toBe('Take this reference out');
  const b = check.broken[0];
  w.integrity.removeReference(w.novel, b.table, b.rowId, b.missing.id);
  const event = w.row('timelineEvents', 'siege')!;
  expect([event['name'], event['characters']]).toEqual(['The siege', []]);
  expect(load().broken).toEqual([]);
});

test('look-alikes: “Not duplicates” holds and can be reopened; a merge is confirmed by name and undone', () => {
  const w = setUp();
  const keep = w.characters.change(w.novel, (x) => x.createEntry('location', 'The Ember Keep')).id;
  const twin = w.characters.change(w.novel, (x) => x.createEntry('location', 'ember keep')).id;
  const other = w.characters.change(w.novel, (x) => x.createEntry('faction', 'Wardens')).id;
  w.characters.change(w.novel, (x) => x.createConnection({ from: new EntityRef('entry', other), to: new EntityRef('entry', twin), type: 'controls' }));
  const load = () => {
    const s = w.lib.novels.load(w.novel)!;
    return recordCheck(s, StoryModel.fromSnapshot(s), 'Ashfall');
  };
  let check = load();
  expect(check.openDuplicates.map((d) => `${d.a.name} and ${d.b.name}`).filter((t) => ['The Ember Keep and ember keep', 'ember keep and The Ember Keep'].includes(t))).toHaveLength(1);
  const pair = check.openDuplicates[0];
  w.integrity.decide(w.novel, pair.key, `${pair.a.name} and ${pair.b.name} are not duplicates.`, 'dismissed');
  check = load();
  expect([check.openDuplicates.length, check.decidedDuplicates.length]).toEqual([0, 1]);
  w.integrity.reopen(w.novel, check.decidedDuplicates[0].decision.id);
  check = load();
  expect([check.openDuplicates.length, check.decidedDuplicates.length]).toEqual([1, 0]);

  // Keep the one named “The Ember Keep”.
  const plan = w.integrity.mergePlan(w.novel, keep, twin);
  expect(plan.repointed.map(mergeWords.repointed).join('\n')).toContain('connections: 1');
  expect(mergeConfirmed('', plan.mergeName)).toBe(false);
  expect(mergeConfirmed(' ember keep ', plan.mergeName)).toBe(true);
  const kept = w.integrity.merge(w.novel, keep, twin, mergeWords.names(plan.mergeName, plan.keepName));
  expect(w.row('loreEntries', twin)).toBeNull();
  expect(w.lib.novels.rowsIn(w.novel, 'loreLinks').map((l) => l['toId'])).toEqual([keep]);
  expect(str(w.row('loreEntries', keep)!['notes'])).toContain('Merged “ember keep”');
  w.integrity.undo(kept);
  expect(w.row('loreEntries', twin)).not.toBeNull();
  expect(w.lib.novels.rowsIn(w.novel, 'loreLinks').map((l) => l['toId'])).toEqual([twin]);
});

test('the review is made from what was written: a paragraph more is a paragraph more checked', () => {
  const w = setUp();
  const first = w.review();
  const node = w.lib.manuscript.nodes(w.novel)[0] ?? w.lib.manuscript.create(w.novel, 'chapter', null, 'One');
  const contents = w.lib.novels.rowsIn(w.novel, 'chapterContents').find((r) => r['id'] === node.id);
  w.lib.novels.writeRows(w.novel, [
    { collection: 'chapterContents', id: node.id, value: { ...(contents ?? { id: node.id, projectId: w.novel }), doc: textToDoc('The war began.\nNo one came home.') } },
  ]);
  const second = w.review();
  expect(second.manuscript.scanned.paragraphs).toBeGreaterThan(first.manuscript.scanned.paragraphs);
});

test('the queue is most serious first; a decision that closes it moves the next one up; filters and groups', () => {
  const w = setUp();
  // Two look-alike pairs (info) and a broken reference (warning).
  w.characters.change(w.novel, (x) => x.createEntry('location', 'The Keep'));
  w.characters.change(w.novel, (x) => x.createEntry('location', 'keep'));
  w.lib.novels.writeRows(w.novel, [
    {
      collection: 'timelineEvents',
      id: 'siege',
      value: { id: 'siege', projectId: w.novel, name: 'The siege', characters: [{ id: 'a1b2c3d4-0000-4000-8000-000000000099', age: null }], nodeIds: [] },
    },
  ]);
  const data = w.review();
  const v = warningsView(data.status.items, 'todo', false, noWarningFilters);
  expect(v.queue.map((i) => i.warning.severity)).toEqual(['warning', 'info']);
  expect(v.bySeverity).toBe('1 warning · 1 info');
  expect(v.groups.map((g) => g.heading)).toEqual(['Warning', 'Info']);
  const byCategory = warningsView(data.status.items, 'todo', true, noWarningFilters);
  expect(byCategory.groups.map((g) => g.heading)).toEqual(['References and links', 'Records that look alike']);
  const filtered = warningsView(data.status.items, 'todo', false, { ...noWarningFilters, certainty: 'possible' });
  expect(filtered.listed.map((i) => i.warning.category)).toEqual(['duplicates']);
  const searched = warningsView(data.status.items, 'todo', false, { ...noWarningFilters, text: 'NOTHING LIKE THIS' });
  expect(searched.empty).toEqual({ title: 'Nothing matches these filters', message: 'Clear the filters to see every warning.', clear: true });

  // Resolved: out of the queue, the next moves up (the card stays at its place); needs review: stays, the next shown.
  expect(afterDecision(0, 'resolved')).toBe(0);
  expect(afterDecision(0, 'review')).toBe(1);
  const first = v.queue[0].warning;
  w.integrity.decide(w.novel, first.key, first.message, 'resolved');
  const later = warningsView(w.review().status.items, 'todo', false, noWarningFilters);
  expect(later.queue.map((i) => i.warning.key)).not.toContain(first.key);
  expect(later.showCounts).toEqual({ todo: 1, decided: 1, all: 2 });
  expect(clampAt(5, later.queue.length)).toBe(0);
});

test('Scriptor’s words and routes for the Flutter app’s', () => {
  expect(worldWords('points at a codex entry; the Codex; a codex field; on its Codex page')).toBe('points at a World entry; World; a World field; on its World page');
  expect(scriptorPlace('/write?node=n1')).toEqual({ kind: 'chapter', nodeId: 'n1' });
  expect(scriptorPlace('/visualize')).toEqual({ kind: 'route', path: '/organize/ties' });
  expect(scriptorPlace('/organize/world/kinds')).toEqual({ kind: 'route', path: '/organize/kinds' });
  expect(scriptorPlace('/review/canon?fact=f1')).toEqual({ kind: 'route', path: '/review/canon?fact=f1' });
});
