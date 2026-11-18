// GO ANYWHERE (FEATURES.md #356): search is not only for words. Typed into it, a place in the app comes first, under
// "Go to": an area, a view, a chapter, a character, a place, a thread or an event by its name, a keepsake, the index. A
// word a page is known by finds it too ("stats" is Analytics, "movie" the trailer). The scoring is a port of
// flutter_app/lib/features/search/jumps.dart (`jumpScore`, `jumpsFor`); the list is Scriptor's own places (its areas
// and tabs, places.ts), with the Flutter app's names and words where it has the same page.

import { type JsonMap, str } from '../json';
import { readingOrder } from '../model/storyOrder';
import { isDocument } from '../outline';
import { StoryNode } from '../records/storyNode';
import { dartTrim , dartToLowerCase } from '../text/dartString';
import { type Place, scriptorPlace } from './places';

/** A place to go: its name, what kind it is, its sign (a Material Community icon name), other words it is known by,
 * and where it is. */
export type Jump = { title: string; kind: string; icon: string; words: readonly string[]; to: Place };

/** How many places "Go to" shows. */
export const jumpsShown = 6;

/** Words some pages are known by besides their names (the Flutter app's, by its paths). */
export const knownAs: Readonly<Record<string, readonly string[]>> = {
  '/progress/analytics': ['stats', 'statistics', 'streak', 'numbers'],
  '/visualize/plot': ['threads', 'arcs', 'lanes'],
  '/visualize/places': ['map', 'locations'],
  '/visualize/knowledge': ['secrets', 'knows'],
  '/review/canon': ['facts', 'lore'],
  '/review/continuity': ['rules', 'mistakes', 'errors'],
  '/write/read': ['read', 'preview', 'book', 'pages'],
  '/write/book': ['details', 'dedication', 'blurb', 'synopsis', 'title'],
  '/plan/board': ['corkboard', 'cards', 'scenes'],
  '/settings': ['preferences', 'options', 'font', 'appearance', 'theme', 'export', 'import', 'backup'],
  '/progress': ['goals', 'words', 'target', 'deadline'],
};

/** Scriptor's areas (DESIGN.md: five), by the Flutter app's path for each. */
const areaJumps: readonly [string, string, string][] = [
  ['/', 'Library', 'book-open-page-variant-outline'],
  ['/write', 'Write', 'feather'],
  ['/organize', 'Organize', 'sitemap-outline'],
  ['/progress', 'Analytics', 'chart-bar'],
  ['/settings', 'Settings', 'cog-outline'],
];

/** The pages and tabs inside the areas: [the Flutter app's path, name, what it is in Scriptor, icon]. The names are the
 * Flutter app's (trail.dart's `namedPages`) where Scriptor has the page, with Scriptor's place as the kind. */
const pageJumps: readonly [string, string, string, string][] = [
  ['/organize/world', 'World', 'Organize', 'earth'],
  ['/organize/systems', 'Systems', 'Organize', 'family-tree'],
  ['/organize/modules', 'Modules', 'Organize', 'puzzle-outline'],
  ['/plan', 'Plan', 'Organize', 'timeline-text-outline'],
  ['/visualize/', 'Visualize', 'Organize', 'graph-outline'],
  ['/review', 'Review', 'Organize', 'check-decagram-outline'],
  ['/plan/threads', 'Threads', 'Plan', 'source-branch'],
  ['/plan/board', 'The board', 'Plan', 'view-column-outline'],
  ['/plan/calendar', 'Calendar', 'Plan', 'calendar-month-outline'],
  ['/plan/histories', 'Histories', 'Plan', 'call-split'],
  ['/organize/world/kinds', 'Kinds of things', 'World', 'shape-outline'],
  ['/organize/relationships/settings', 'Kinds of ties', 'Organize', 'link-variant'],
  ['/visualize', 'Relationship map', 'Visualize', 'graph-outline'],
  ['/visualize/timeline', 'Timeline', 'Visualize', 'chart-timeline'],
  ['/visualize/order', 'Story order', 'Visualize', 'swap-vertical'],
  ['/visualize/plot', 'Plot lanes', 'Visualize', 'source-branch'],
  ['/visualize/structure', 'Structure', 'Visualize', 'chart-bar'],
  ['/visualize/appearances', 'Appearances', 'Visualize', 'grid'],
  ['/visualize/graph', 'Graph', 'Visualize', 'graph-outline'],
  ['/visualize/kinds', 'Kinds', 'Visualize', 'shape-outline'],
  ['/visualize/abilities', 'Abilities', 'Visualize', 'family-tree'],
  ['/visualize/progression', 'Progression', 'Visualize', 'trending-up'],
  ['/visualize/places', 'Places', 'Visualize', 'map-outline'],
  ['/visualize/knowledge', 'Who knows what', 'Visualize', 'eye-outline'],
  ['/visualize/journeys', 'Journeys', 'Visualize', 'map-marker-path'],
  ['/visualize/factions', 'Factions', 'Visualize', 'account-group-outline'],
  ['/visualize/ownership', 'Who owns what', 'Visualize', 'treasure-chest'],
  ['/visualize/charts', 'Charts', 'Visualize', 'chart-box-outline'],
  ['/visualize/history', 'Life history', 'Visualize', 'account-clock-outline'],
  ['/review/records', 'Records check', 'Review', 'clipboard-check-outline'],
  ['/review/team', 'Team', 'Review', 'account-group-outline'],
  ['/review/consequences', 'Consequences', 'Review', 'source-fork'],
  ['/review/timeline', 'Timeline check', 'Review', 'calendar-text-outline'],
  ['/review/canon', 'Canon', 'Review', 'check-decagram-outline'],
  ['/review/continuity', 'Continuity', 'Review', 'spellcheck'],
  ['/review/proof', 'Proofreading', 'Review', 'text-search'],
  ['/progress/analytics', 'Analytics', 'Analytics', 'chart-bar'],
  ['/keepsakes', 'Keepsakes', 'Analytics', 'gift-outline'],
  ['/write/read', 'Reader', 'Your book as a reader sees it', 'book-open-variant'],
  ['/write/book', 'Book details', 'The front and back of the book', 'book-information-variant'],
];

/** The keepsakes, with the Flutter app's names and words, at Scriptor's pages. */
const keepsakeJumps: readonly [string, string, string, readonly string[]][] = [
  ['trailer', 'Trailer', 'play-circle-outline', ['film', 'movie', 'poster']],
  ['lines', 'Best lines', 'format-quote-close', ['quotes', 'quote', 'lines', 'share']],
  ['quiz', 'The book quiz', 'head-question-outline', ['quiz', 'game', 'test', 'who said it', 'trivia', 'play']],
  ['gazette', 'The Gazette', 'newspaper-variant-outline', ['newspaper', 'gazette', 'front page', 'news', 'headline', 'paper']],
  ['postcards', 'Postcards', 'mailbox-outline', ['postcard', 'places', 'greetings', 'world', 'travel']],
  ['sampler', 'The sampler', 'file-pdf-box', ['sample', 'pdf', 'beta reader', 'agent', 'query', 'send', 'opening']],
  ['story', 'Your book so far', 'book-open-page-variant-outline', ['story', 'recap', 'wrapped']],
  ['print', 'Fingerprint', 'fingerprint', ['print', 'colours']],
  ['jacket', 'Full jacket', 'book-outline', ['cover', 'spine', 'back']],
  ['submission', 'Submission kit', 'email-fast-outline', ['submit', 'agent', 'query letter', 'publisher']],
];

/** Where the index of names is (a page of Write: it reads the manuscript, and opens chapters in Write). */
export const indexPath = '/write/names';


/** Every place in a book, in the order "Go to" prefers them: the areas and their pages, the keepsakes and the index,
 * the chapters, the cast and the world, threads and events. `rows(collection)` reads the novel as stored. */
export function bookJumps(rows: (collection: string) => readonly JsonMap[]): Jump[] {
  const jumps: Jump[] = [];
  for (const [path, title, icon] of areaJumps) {
    const to = scriptorPlace(path);
    if (to !== null) jumps.push({ title, kind: 'Area', icon, words: knownAs[path] ?? [], to });
  }
  for (const [path, title, kind, icon] of pageJumps) {
    const to = scriptorPlace(path);
    if (to !== null) jumps.push({ title, kind, icon, words: knownAs[path] ?? [], to });
  }
  for (const [page, title, icon, words] of keepsakeJumps) {
    jumps.push({ title, kind: 'Keepsake', icon, words, to: { kind: 'route', path: `/keepsakes/${page}` } });
  }
  jumps.push({
    title: 'The index',
    kind: 'Every name, A to Z',
    icon: 'format-list-bulleted',
    words: ['names', 'spelling'],
    to: { kind: 'route', path: indexPath },
  });
  jumps.push({ title: 'Tutorial', kind: 'A lesson for each feature', icon: 'help-circle-outline', words: ['help', 'lessons', 'how'], to: { kind: 'tutorial' } });
  const nodes = rows('chapters').map((r) => new StoryNode(r));
  readingOrder(nodes)
    .filter((n) => isDocument(n.kind))
    .forEach((n, i) => {
      jumps.push({
        title: n.displayTitle,
        kind: `Chapter ${i + 1}`,
        icon: 'file-document-edit-outline',
        words: ['chapter', `${i + 1}`],
        to: { kind: 'chapter', nodeId: n.id },
      });
    });
  for (const r of rows('loreEntries')) {
    const name = dartTrim(str(r['name']));
    if (name.length === 0) continue;
    const category = str(r['category']);
    const character = category === 'character';
    jumps.push({
      title: name,
      kind: character
        ? 'Character'
        : category.length === 0
          ? 'Entry'
          : `${category[0].toUpperCase()}${category.substring(1)}`,
      icon: character ? 'account-outline' : 'earth',
      words: [],
      to: { kind: 'route', path: character ? `/organize/character/${str(r['id'])}` : `/organize/world/entry/${str(r['id'])}` },
    });
  }
  for (const r of rows('plotThreads')) {
    const title = dartTrim(str(r['title']));
    if (title.length === 0) continue;
    jumps.push({ title, kind: 'Thread', icon: 'source-branch', words: ['thread'], to: { kind: 'route', path: `/plan/thread/${str(r['id'])}` } });
  }
  for (const r of rows('timelineEvents')) {
    const title = dartTrim(str(r['title']));
    if (title.length === 0) continue;
    jumps.push({ title, kind: 'Event', icon: 'calendar-star', words: ['event'], to: { kind: 'route', path: `/plan/event/${str(r['id'])}` } });
  }
  return jumps;
}

const wordPattern = /[\p{L}\p{N}]+/gu;
function wordsOf(text: string): string[] {
  return [...dartToLowerCase(text).matchAll(wordPattern)].map((m) => m[0]);
}

/** How well `jump` answers `query` (0: not at all): the name begun with it, every word of it beginning a word of the
 * name, or of what the page is known by, or its letters in order through the name. */
export function jumpScore(jump: { title: string; kind: string; words: readonly string[] }, query: string): number {
  const q = dartToLowerCase(dartTrim(query));
  if (q.length === 0) return 0;
  const title = dartToLowerCase(jump.title);
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  const asked = wordsOf(q);
  if (asked.length === 0) return 0;
  const named = wordsOf(jump.title);
  const begins = (words: readonly string[]) => asked.every((a) => words.some((w) => w.startsWith(a)));
  if (begins(named)) return 60;
  if (begins([...named, ...wordsOf(jump.kind), ...jump.words.flatMap(wordsOf)])) return 40;
  // Its letters in order through the name ("pltln" is Plot lanes), from three letters.
  const letters = q.replace(/\s/g, '');
  if (letters.length >= 3) {
    let at = 0;
    for (const ch of title.split('')) {
      if (at < letters.length && ch === letters[at]) at++;
    }
    if (at === letters.length) return 10;
  }
  return 0;
}

/** The places that answer `query`, the best first (in `jumps`' order between equals), at most `jumpsShown`. */
export function jumpsFor<J extends { title: string; kind: string; words: readonly string[] }>(query: string, jumps: readonly J[]): J[] {
  const scored = jumps
    .map((jump, at) => ({ jump, score: jumpScore(jump, query), at }))
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.at - b.at));
  return scored.slice(0, jumpsShown).map((s) => s.jump);
}

