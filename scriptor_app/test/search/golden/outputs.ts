// What golden/dump.dart writes, made the same way in TypeScript: each novel's blocks, its queries' results in every
// scope and its index of names; `misc` for "Go to", the lesson for each address, and the buttons each lesson names.

import { categoriesOf } from '../../../src/domain/codex/codexChanges';
import { type JsonMap, str } from '../../../src/domain/json';
import { readingOrder } from '../../../src/domain/model/storyOrder';
import { isDocument } from '../../../src/domain/outline';
import { blockTexts } from '../../../src/domain/prose';
import { Category } from '../../../src/domain/records/category';
import { Entry } from '../../../src/domain/records/entry';
import { StoryNode } from '../../../src/domain/records/storyNode';
import { type BookIndex, bookIndex } from '../../../src/domain/search/bookIndex';
import { jumpScore, jumpsFor } from '../../../src/domain/search/jumps';
import {
  type GroupResult,
  type SearchBlock,
  SearchIndex,
  entryBlocks,
  nodeBlocks,
  queryTerms,
  searchScopes,
} from '../../../src/domain/search/search';
import type { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { namesIn } from '../../../src/domain/tutorial/tour';
import { topicFor } from '../../../src/domain/tutorial/topics';
import { tutorialTopics } from '../../../src/domain/tutorial/topicsData';

export function blocksOf(s: NovelSnapshot): SearchBlock[] {
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']]));
  const plans = new Map(s.rows('chapterPlans').map((r) => [str(r['id']), r]));
  const categories = categoriesOf(s);
  const names = new Map(s.rows('loreEntries').map((r) => [str(r['id']), str(r['name'])]));
  return [
    ...s.rows('chapters').flatMap((r) => nodeBlocks(new StoryNode(r), docs.get(str(r['id'])), plans.get(str(r['id'])) ?? null)),
    ...s
      .rows('loreEntries')
      .flatMap((r) =>
        entryBlocks(new Entry(r), categories.get(str(r['category'])) ?? Category.unknown(str(r['category'])), (id) => names.get(id) ?? null),
      ),
  ];
}

export const blockJson = (b: SearchBlock): JsonMap => ({ ...b });

export function resultJson(g: GroupResult): JsonMap {
  return {
    group: g.group,
    matchCount: g.matchCount,
    items: g.items.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      title: e.title,
      kind: e.kind,
      group: e.group,
      matchCount: e.matchCount,
      snippets: e.snippets.map((s) => ({
        blockId: s.blockId,
        field: s.field,
        label: s.label,
        index: s.index,
        before: s.before,
        parts: s.parts.map((p) => ({ text: p.text, hit: p.hit })),
        after: s.after,
        term: s.term,
      })),
    })),
  };
}

function indexJson(i: BookIndex): JsonMap {
  return {
    entries: i.entries.map((e) => ({ term: e.term, count: e.count, places: e.places.map((p) => ({ ...p })) })),
    lookAlikes: i.lookAlikes.map((l) => [l.a.term, l.b.term]),
  };
}

function queriesOf(blocks: readonly SearchBlock[]): string[] {
  const out = ['a', 'the', 'road wall', 'zzzz nothing', '  ', 'ink', 'bell', 'Wren', 'WREN hollis', 'of the'];
  for (let i = 0; i < blocks.length && out.length < 40; i += 5) {
    const words = [...blocks[i].text.matchAll(/[A-Za-z’]{4,}/g)].map((m) => m[0]);
    if (words.length === 0) continue;
    if (!out.includes(words[0])) out.push(words[0]);
    if (words.length > 1) {
      const pair = `${words[0]} ${words[1]}`.toLowerCase();
      if (!out.includes(pair)) out.push(pair);
    }
  }
  return out;
}

export function reads(s: NovelSnapshot): Record<string, unknown> {
  const blocks = blocksOf(s);
  const index = new SearchIndex(blocks);
  const results: Record<string, unknown> = {};
  for (const q of queriesOf(blocks)) {
    for (const scope of searchScopes) results[`${scope}|${q}`] = index.search(q, scope).map(resultJson);
  }
  const nodes = s.rows('chapters').map((r) => new StoryNode(r));
  const order = readingOrder(nodes)
    .filter((n) => isDocument(n.kind))
    .map((n) => n.id);
  const pages = new Map(s.rows('chapterContents').map((r) => [str(r['id']), blockTexts(r['doc'])]));
  const idx = bookIndex(order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })));
  return { blocks: blocks.map(blockJson), results, index: indexJson(idx) };
}

export function misc(): Record<string, unknown> {
  const j = (title: string, kind: string, words: string[]) => ({ title, kind, words });
  const jumps = [
    j('Library', 'Area', []),
    j('Write', 'Area', []),
    j('Organize', 'Area', []),
    j('Plan', 'Organize', []),
    j('Places', 'Visualize', ['map', 'locations']),
    j('Plot lanes', 'Visualize', ['threads', 'arcs', 'lanes']),
    j('Analytics', 'Analytics', ['stats', 'statistics', 'streak', 'numbers']),
    j('Trailer', 'Keepsake', ['film', 'movie', 'poster']),
    j('The book quiz', 'Keepsake', ['quiz', 'game', 'test', 'who said it', 'trivia', 'play']),
    j('Wren Hollis', 'Character', []),
    j('Chapter 12: Ünder the Sea', 'Chapter 12', ['chapter', '12']),
    j('Ilse Marrow', 'Character', []),
    j('The Provost’s Table', 'Chapter 10', ['chapter', '10']),
  ];
  const queries = [
    'p', 'pl', 'plan', 'Plo', 'plot lanes', 'lan', 'arcs', 'pltln', 'pz', '   ', 'movie', 'stats', 'wren', 'w h',
    'hollis', 'chapter 12', 'under', 'ünder', 'provost', 'the', 'quiz game', 'mrrw', 'ilse marrow', 'x', 'ana',
  ];
  const paths = [
    '/', '/write', '/write/read', '/write/book', '/organize', '/organize/world', '/organize/world/entry/abc',
    '/organize/world/kinds?kind=x', '/organize/character/abc?tab=history', '/organize/modules/mystery?tool=cases',
    '/organize/systems', '/organize/relationship/r1', '/visualize', '/visualize/', '/visualize/kinds',
    '/visualize/timeline', '/visualize/places', '/visualize/journeys', '/plan', '/plan/threads', '/plan/thread/t1',
    '/plan/board', '/plan/chapter/c1', '/plan/event/e1', '/plan/calendar', '/plan/histories', '/review',
    '/review/records', '/review/timeline', '/review/canon', '/review/continuity', '/review/consequences?node=n',
    '/review/team', '/review/proof', '/progress', '/progress/analytics', '/keepsakes', '/settings',
    '/settings/import-export', '/somewhere-new', '/write/names',
  ];
  return {
    scores: queries.map((q) => jumps.map((x) => jumpScore(x, q))),
    picked: queries.map((q) => jumpsFor(q, jumps).map((x) => x.title)),
    topicFor: Object.fromEntries(paths.map((p) => [p, topicFor(p).id])),
    names: Object.fromEntries(tutorialTopics.map((t) => [t.id, namesIn(t.steps)])),
    queryTerms: ['', 'A a  b', 'Wren wren WREN', 'one two three four five six seven eight nine ten eleven twelve thirteen'].map(queryTerms),
  };
}
