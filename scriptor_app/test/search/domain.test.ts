// Ports of the Flutter app's tests for search (test/shared/domain/search_test.dart, replaying the original app's own
// golden), the index of names (book_index_test.dart), "Go to" (jumps_test.dart's scoring), the tutorial
// (tutorial_test.dart, tutorial_path_test.dart) and the tour's naming; and Scriptor's own words and places.

import { join } from 'node:path';

import { type JsonMap, isMap, listOf } from '../../src/domain/json';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { bookIndex } from '../../src/domain/search/bookIndex';
import { bookJumps, jumpScore, jumpsFor, jumpsShown } from '../../src/domain/search/jumps';
import { flutterPathOf, scriptorPlace } from '../../src/domain/search/places';
import { SearchIndex, type SearchScope } from '../../src/domain/search/search';
import {
  inScriptorWords,
  lessonPhrases,
  lessonsNotInScriptor,
  scriptorOnlyLesson,
  scriptorTopic,
  scriptorTopics,
  toFlutterWords,
} from '../../src/domain/tutorial/scriptorLessons';
import { topicFor } from '../../src/domain/tutorial/topics';
import { tutorialButtonNames, tutorialGroups, tutorialTopics } from '../../src/domain/tutorial/topicsData';
import { tourOf } from '../../src/domain/tutorial/tour';
import { yourPath, yourPathOrder } from '../../src/domain/tutorial/yourPath';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { blockJson, blocksOf, resultJson } from './golden/outputs';

// ---------------------------------------------------------------------------------------------------- search

const original = readJson(join(flutterFixturesDir, 'golden', 'search.golden.json')) as Record<string, JsonMap>;

for (const name of Object.keys(original)) {
  test(`${name}: the original app’s blocks, and its results for every query in every scope`, () => {
    const expected = original[name];
    const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
    const blocks = blocksOf(s);
    // The original's blocks carry the project id; the rest must match exactly.
    expect(JSON.parse(JSON.stringify(blocks.map(blockJson)))).toEqual(
      listOf(expected['blocks'])
        .filter(isMap)
        .map((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'projectId'))),
    );
    const index = new SearchIndex(blocks);
    let withResults = 0;
    for (const [key, value] of Object.entries(expected['results'] as JsonMap)) {
      const at = key.indexOf('|');
      const found = index.search(key.substring(at + 1), key.substring(0, at) as SearchScope);
      expect([key, JSON.parse(JSON.stringify(found.map(resultJson)))]).toEqual([key, value]);
      if (found.length > 0) withResults++;
    }
    expect(withResults).toBeGreaterThan(20);
  });
}

// ---------------------------------------------------------------------------------------------------- the index

const index = (chapters: string[][]) => bookIndex(chapters.map((c, i) => ({ id: `c${i + 1}`, paragraphs: c })));
const terms = (i: ReturnType<typeof index>) => i.entries.map((e) => e.term);

test('names, A to Z, with the chapters they are in, and how often', () => {
  const i = index([
    ['Wren walked to the Mimir Forest. She met Kai there.', '“Go,” said Kai.'],
    ['The road led to Vell, and Wren followed it into the Order of the Lamp.'],
  ]);
  expect(terms(i)).toEqual(['Kai', 'Mimir Forest', 'Order of the Lamp', 'Vell', 'Wren']);
  const kai = i.entries.find((e) => e.term === 'Kai')!;
  expect([kai.count, kai.places[0].number, kai.places[0].block, kai.places.length]).toEqual([2, 1, 0, 1]);
  expect(i.entries.find((e) => e.term === 'Wren')!.places.map((p) => p.number)).toEqual([1, 2]);
});

test('not names: words that only begin sentences, I, pronouns after dialogue, shouting, possessives apart', () => {
  const i = index([['Then the bell rang. Nobody came.', '“Run.” He turned. I saw it: NINE DAYS.', 'Wren’s ink spilled, and then Wren laughed.']]);
  expect(terms(i)).toEqual(['Wren']);
  expect(i.entries[0].count).toBe(2);
});

test('a sentence’s first word beside a name: the name alone (“Then Wren” is Wren)', () => {
  expect(terms(index([['Then Wren ran. Later she saw Wren again.']]))).toEqual(['Wren']);
});

test('names written two ways, a letter apart: perhaps a slip; plurals and short words are not', () => {
  const i = index([['Tobiah came. Then Tobias left, and Tobiah stayed. The Warden saw the Wardens. Kai met Kat.']]);
  expect(i.lookAlikes.map((l) => `${l.a.term}/${l.b.term}`)).toEqual(['Tobiah/Tobias']);
});

test('nothing written, nothing indexed', () => {
  const i = index([[]]);
  expect(i.entries).toEqual([]);
  expect(i.lookAlikes).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------- go anywhere

const j = (title: string, kind = 'Page', words: string[] = []) => ({ title, kind, words });

test('a place answers its name begun, its words begun, what it is known by, or its letters in order', () => {
  const lanes = j('Plot lanes', 'Visualize', ['threads', 'arcs']);
  expect(jumpScore(lanes, 'plot lanes')).toBe(100);
  expect(jumpScore(lanes, 'Plo')).toBe(80);
  expect(jumpScore(lanes, 'lan')).toBe(60);
  expect(jumpScore(lanes, 'arcs')).toBe(40);
  expect(jumpScore(lanes, 'pltln')).toBe(10);
  expect(jumpScore(lanes, 'pl')).toBe(80);
  expect(jumpScore(lanes, 'pz')).toBe(0);
  expect(jumpScore(lanes, '   ')).toBe(0);
});

test('the best first, in the given order between equals, at most six; the sample’s places all lead somewhere', () => {
  const s = NovelSnapshot.fromJson(readJson(samplePath));
  const all = bookJumps((c) => s.rows(c));
  expect(jumpsFor('p', all)).toHaveLength(jumpsShown);
  expect(jumpsFor('plan', all)[0].title).toBe('Plan');
  expect(jumpsFor('stats', all)[0].title).toBe('Analytics');
  expect(jumpsFor('movie', all)[0].title).toBe('Trailer');
  expect(jumpsFor('wren', all)[0]).toMatchObject({ title: 'Wren Hollis', kind: 'Character' });
  expect(jumpsFor('index', all)[0]).toMatchObject({ title: 'The index', to: { kind: 'route', path: '/write/names' } });
  // Every chapter, character, entry, thread and event of the sample is a place to go.
  expect(all.filter((x) => x.kind.startsWith('Chapter ')).length).toBe(15);
  expect(all.filter((x) => x.kind === 'Thread').length).toBe(5);
});

test('the Flutter app’s pages are Scriptor’s places, and where someone is reads back as the Flutter path', () => {
  expect(scriptorPlace('/plan/board')).toEqual({ kind: 'organize', tab: 'plan', part: 'board' });
  expect(scriptorPlace('/review/canon')).toEqual({ kind: 'organize', tab: 'review', part: 'canon' });
  expect(scriptorPlace('/progress/analytics')).toEqual({ kind: 'analytics', tab: 'analytics' });
  expect(scriptorPlace('/organize/world/kinds')).toEqual({ kind: 'route', path: '/organize/kinds' });
  expect(scriptorPlace('/visualize')).toEqual({ kind: 'route', path: '/organize/ties' });
  expect(scriptorPlace('/visualize/graph')).toEqual({ kind: 'route', path: '/visualize/graph' });
  expect(scriptorPlace('/nowhere')).toBeNull();
  const showing = { organize: 'plan', plan: 'threads', review: 'canon', analytics: 'keepsakes' } as const;
  expect(flutterPathOf('/organize', showing)).toBe('/plan/threads');
  expect(flutterPathOf('/organize', { ...showing, organize: 'review' })).toBe('/review/canon');
  expect(flutterPathOf('/analytics', showing)).toBe('/keepsakes');
  expect(flutterPathOf('/organize/ties', showing)).toBe('/visualize');
  // Every lesson with a page has a place in Scriptor ("Take me there").
  for (const t of scriptorTopics) if (t.path !== undefined) expect([t.id, scriptorPlace(t.path)]).not.toEqual([t.id, null]);
});

// ---------------------------------------------------------------------------------------------------- the tutorial

test('each lesson has steps, an example, and a page or a place to find it, as the original app requires', () => {
  expect(new Set(tutorialTopics.map((t) => t.id)).size).toBe(tutorialTopics.length);
  expect(tutorialTopics).toHaveLength(94);
  for (const t of tutorialTopics) {
    expect([t.id, tutorialGroups.includes(t.group)]).toEqual([t.id, true]);
    expect(t.steps.length).toBeGreaterThanOrEqual(3);
    expect(t.steps.length).toBeLessThanOrEqual(5);
    expect(t.what.length).toBeLessThanOrEqual(190);
    expect(t.example.trim().length).toBeGreaterThan(30);
    expect(t.path !== undefined || t.where !== undefined).toBe(true);
  }
  for (const g of tutorialGroups) expect(tutorialTopics.some((t) => t.group === g)).toBe(true);
});

test('nothing in them is about what this app does not have', () => {
  const all = scriptorTopics
    .map((t) => [t.title, t.what, ...t.steps, t.example, t.where ?? ''].join(' '))
    .join(' ')
    .toLowerCase();
  for (const word of ['cloud', 'sync', 'relay', 'assistant', 'ai', 'invitation link', 'studio', 'ctrl/⌘+k']) {
    expect([word, new RegExp(`\\b${word.replace(/[+/]/g, '\\$&')}\\b`).test(all)]).toEqual([word, false]);
  }
});

test('the lesson for each address, as the Flutter app chooses it', () => {
  expect(topicFor('/').id).toBe('library');
  expect(topicFor('/organize/world').id).toBe('world');
  expect(topicFor('/organize/world/entry/abc').id).toBe('world');
  expect(topicFor('/organize/world/kinds?kind=x').id).toBe('kinds');
  expect(topicFor('/organize/character/abc?tab=history').id).toBe('characters');
  expect(topicFor('/visualize').id).toBe('relationships');
  expect(topicFor('/visualize/kinds').id).toBe('graph');
  expect(topicFor('/plan/thread/t1').id).toBe('threads');
  expect(topicFor('/review/consequences?node=n').id).toBe('consequences');
  expect(topicFor('/somewhere-new').id).toBe('areas');
  expect(scriptorOnlyLesson('/keepsakes/gazette')).toBe('gazette');
  expect(scriptorOnlyLesson('/keepsakes')).toBe('keepsakeshelf');
  expect(scriptorOnlyLesson('/write/names')).toBe('index');
});

test('Scriptor’s words turn back into the Flutter app’s, every lesson word for word; three lessons are not shown', () => {
  for (const t of tutorialTopics) {
    const shown = scriptorTopic(t);
    expect([t.id, toFlutterWords(shown.what), shown.steps.map(toFlutterWords), toFlutterWords(shown.example), shown.where === undefined ? undefined : toFlutterWords(shown.where)]).toEqual([
      t.id,
      t.what,
      t.steps,
      t.example,
      t.where,
    ]);
  }
  // Every phrase is used by some lesson (none is stale).
  const all = tutorialTopics.map((t) => [t.what, ...t.steps, t.example, t.where ?? ''].join('\n')).join('\n');
  for (const [flutter] of lessonPhrases) expect([flutter, all.includes(flutter)]).toEqual([flutter, true]);
  expect(scriptorTopics).toHaveLength(94 - lessonsNotInScriptor.size);
  expect(inScriptorWords('Open Plan → Scene board.')).toBe('Open Organize → Plan → Scene board.');
});

test('every lesson on the path is a lesson of the tutorial, once; what the books hold ticks lessons', () => {
  const ids = new Set(tutorialTopics.map((t) => t.id));
  expect(new Set(yourPathOrder).size).toBe(yourPathOrder.length);
  for (const id of yourPathOrder) expect(ids.has(id)).toBe(true);
  const s = NovelSnapshot.fromJson(readJson(samplePath));
  const path = yourPath(
    { count: (_id, c) => s.rows(c).length, rows: (_id, c) => s.rows(c), setting: () => undefined },
    ['the-sample'],
    scriptorTopics,
  );
  expect([...path.tried]).toEqual(expect.arrayContaining(['library', 'write', 'outline', 'characters', 'world', 'timeline', 'threads']));
  expect(path.tried.has('ribbons')).toBe(false);
  expect(path.counted).not.toContain('ribbons');
  expect(path.next).not.toBeNull();
  expect(path.tried.has(path.next!.id)).toBe(false);
});

test('the tour: each step at the first button it names that is on the screen; steps naming nothing shown are left out', () => {
  const steps = ['Press New novel, then Begin chapter one.', 'Nothing here.', 'Press Continue writing or New novel.'];
  const tour = tourOf(steps, new Map([['New novel', 1], ['Continue writing', 2]]));
  expect(tour).toEqual([
    { step: 0, name: 'New novel', at: 1 },
    { step: 2, name: 'Continue writing', at: 2 },
  ]);
  expect(tutorialButtonNames).toContain('Show me on this page');
});
