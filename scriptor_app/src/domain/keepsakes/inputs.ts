// What each keepsake reads from a book, gathered from the novel as stored (a NovelSnapshot: its rows in the order they
// are kept, as the Flutter app's store gives them): the chapters and scenes in reading order, their titles, the people
// and places to find, the days written. Each keepsake page of the Flutter app gathers its own the same way (the
// `initState` of best_lines_page.dart, book_quiz_page.dart, book_story.dart's `storyInputsOf`, book_print_page.dart,
// full_jacket.dart, gazette_page.dart, postcards_page.dart, trailer.dart, sampler_page.dart and submission_page.dart);
// these are those, side by side.

import { type StoryInputs } from '../analytics/bookStory';
import { WritingSession } from '../analytics/progress';
import { CharacterProfile } from '../characters/characterRecords';
import { namesToFind } from '../characters/namedIn';
import { str } from '../json';
import { type KeptPlace } from '../manuscript/postcards';
import { type GazettePerson } from '../manuscript/gazette';
import { type TrailerPerson } from '../manuscript/trailer';
import { readingOrder } from '../model/storyOrder';
import { isDocument } from '../outline';
import { Entry } from '../records/entry';
import { Novel } from '../records/novel';
import { StoryNode } from '../records/storyNode';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartTrim } from '../text/dartString';

/** The book as the keepsakes read it. */
export type BookRead = {
  novel: Novel;
  /** The chapters and scenes, in reading order. */
  documents: StoryNode[];
  order: string[];
  /** Each document's title as stored (the Flutter pages pass `n.title`). */
  titles: Map<string, string>;
  /** The chapters' text as stored, a row of JSON each (`NovelStore.rawJsonIn`). */
  stored: string[];
  entries: Entry[];
};

export function bookRead(s: NovelSnapshot): BookRead {
  const documents = readingOrder(s.rows('chapters').map((r) => new StoryNode(r))).filter((n) => isDocument(n.kind));
  return {
    novel: new Novel(s.project),
    documents,
    order: documents.map((n) => n.id),
    titles: new Map(documents.map((n) => [n.id, n.title] as const)),
    stored: s.rows('chapterContents').map((r) => JSON.stringify(r)),
    entries: s.rows('loreEntries').map((r) => new Entry(r)),
  };
}

/** The profiles by character, the last stored winning (book_story.dart, trailer.dart). */
function profilesInOrder(s: NovelSnapshot): Map<string, CharacterProfile> {
  return new Map(s.rows('characterProfiles').map((r) => [str(r['entryId']), new CharacterProfile(r)] as const));
}

/** The profiles by character, the lowest id winning (book_quiz_page.dart, gazette_page.dart: sorted by id, last
 * first). Dart's sort of distinct ids: any sort gives this order. */
function profilesByLowestId(s: NovelSnapshot): Map<string, CharacterProfile> {
  const rows = [...s.rows('characterProfiles')].sort((a, b) => {
    const x = str(a['id']);
    const y = str(b['id']);
    return x < y ? 1 : x > y ? -1 : 0;
  });
  return new Map(rows.map((r) => [str(r['entryId']), new CharacterProfile(r)] as const));
}

/** Every chapter's words, as the chapter rows keep them (full_jacket.dart, submission_page.dart's `bookWords`). */
export function bookWords(s: NovelSnapshot): number {
  return s.rows('chapters').reduce((n, r) => n + new StoryNode(r).wordCount, 0);
}

/** What "Your book so far" is told from (book_story.dart's `storyInputsOf`). */
export function storyInputsOf(s: NovelSnapshot): StoryInputs {
  const novel = new Novel(s.project);
  const nodes = s.rows('chapters').map((r) => new StoryNode(r));
  const perDay = new Map<string, number>();
  for (const r of s.rows('writingSessions')) {
    const w = new WritingSession(r);
    if (w.day.length > 0) perDay.set(w.day, (perDay.get(w.day) ?? 0) + w.netWords);
  }
  const entries = s.rows('loreEntries').map((r) => new Entry(r));
  const names = namesToFind(entries, profilesInOrder(s));
  return {
    title: novel.title,
    target: novel.targetWordCount,
    chapters: readingOrder(nodes)
      .filter((n) => isDocument(n.kind))
      .map((n) => ({ id: n.id, title: n.displayTitle, words: n.wordCount })),
    days: [...perDay].map(([day, words]) => ({ day, words })),
    people: entries
      .filter((e) => e.category === 'character' && dartTrim(e.name).length > 0)
      .map((e) => ({ id: e.id, name: dartTrim(e.name), names: names[e.id] ?? [dartTrim(e.name)] })),
  };
}

/** The people the quiz asks about: each character with names to find, by id (book_quiz_page.dart). */
export function quizPeople(s: NovelSnapshot): Map<string, string[]> {
  const entries = s.rows('loreEntries').map((r) => new Entry(r));
  const names = namesToFind(entries, profilesByLowestId(s));
  return new Map(
    entries
      .filter((e) => e.category === 'character' && (names[e.id] ?? []).length > 0)
      .map((e) => [e.id, names[e.id]] as const),
  );
}

/** The paper's people (characters not archived, with names) and places (locations with names) (gazette_page.dart). */
export function gazetteCast(s: NovelSnapshot): { people: GazettePerson[]; places: string[][] } {
  const entries = s.rows('loreEntries').map((r) => new Entry(r));
  const profiles = profilesByLowestId(s);
  const names = namesToFind(entries, profiles);
  return {
    people: entries
      .filter((e) => e.category === 'character' && !(profiles.get(e.id)?.archived ?? false) && (names[e.id] ?? []).length > 0)
      .map((e) => ({ name: dartTrim(e.name), names: names[e.id] })),
    places: entries.filter((e) => e.category === 'location' && (names[e.id] ?? []).length > 0).map((e) => names[e.id]),
  };
}

/** The world's places for the postcards: each location with names, and what is said of it (postcards_page.dart). */
export function keptPlaces(s: NovelSnapshot): KeptPlace[] {
  const entries = s.rows('loreEntries').map((r) => new Entry(r));
  const names = namesToFind(entries, new Map());
  return entries
    .filter((e) => e.category === 'location' && (names[e.id] ?? []).length > 0)
    .map((e) => ({ names: names[e.id], about: `${e.summary} ${e.description}` }));
}

/** The people a trailer may name (trailer.dart). */
export function trailerCast(s: NovelSnapshot): TrailerPerson[] {
  const entries = s.rows('loreEntries').map((r) => new Entry(r));
  const names = namesToFind(entries, profilesInOrder(s));
  return entries
    .filter((e) => e.category === 'character' && dartTrim(e.name).length > 0)
    .map((e) => ({ name: dartTrim(e.name), names: names[e.id] ?? [dartTrim(e.name)] }));
}
