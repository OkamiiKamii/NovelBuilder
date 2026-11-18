// THE LESSONS IN SCRIPTOR'S WORDS. The Flutter app's lessons (topicsData.ts, word for word) speak of its eight areas,
// its rail, its phone menu "More" and its keyboard shortcuts. Scriptor has five areas (DESIGN.md): Plan, Visualize and
// Review are tabs of Organize; Progress, Analytics and the Keepsakes are tabs of Analytics; search is the magnifier at
// the top of every area. These exact phrases are said Scriptor's way when a lesson is shown; `toFlutterWords` turns
// them back, so the test still checks every lesson against the Dart word for word (as 5b's scriptorWords.ts does).
//
// Where a whole step (or what a lesson is, where it is, its example) describes a screen Scriptor lays out differently,
// it is rewritten whole in lessonRewrites.ts, which says how the Dart's text began.
//
// Six lessons are about what Scriptor does not have: ribbons; pinning an area to the phone's bar; the phone menu "More"
// laid out as a book's contents; "Today from your book", the daily card on that menu; "Where you were", the trail that
// menu kept; and "The app wears your book" (Scriptor has one look, System Monolith, and no cover-colour theme). They are
// not shown.

import { type Topic } from './topics';
import { lessonRewrites } from './lessonRewrites';
import { tutorialTopics } from './topicsData';

/** Lessons about what Scriptor does not have. */
export const lessonsNotInScriptor: ReadonlySet<string> = new Set([
  'ribbons',
  'pinbar',
  'contentsparts',
  'todayfromyourbook',
  'trail',
  'wearbook',
]);

/** [the Flutter app's phrase, Scriptor's], applied in this order (longer phrases first). */
export const lessonPhrases: readonly (readonly [string, string])[] = [
  [
    'Open a book and its areas appear: Write, Organize, Plan, Visualize, Review and Progress.',
    'Open a book and its areas appear: Write, Organize (with Plan, Visualize and Review as its tabs) and Analytics (with Progress and the Keepsakes).',
  ],
  ['The rail on the left on wide screens; inside a book on a phone, the bar at the bottom (and More).', 'The rail on the left on wide screens; on a phone, the bar at the bottom.'],
  ['Open a novel from the Library: its areas appear in the rail, or in the bar at the bottom on a phone.', 'Open a novel from the Library: its areas are in the rail, or in the bar at the bottom on a phone.'],
  [
    'Move between them with the rail or the bar (or Ctrl/⌘ and a number from 1 to 8); the tabs at the top of an area switch between its pages.',
    'Move between them with the rail or the bar; the tabs at the top of an area switch between its pages.',
  ],
  ['The gear beside the Library is Settings (or Ctrl/⌘ and comma from anywhere).', 'Settings is the last area, the gear.'],
  ['Press Ctrl/⌘+3 to go to Organize, then World to see every place and faction of “Ashfall”.', 'Press Organize, then World to see every place and faction of “Ashfall”.'],
  ['Ctrl/⌘+K anywhere, the search button at the top of the rail, or More → Search, or go anywhere on a phone.', 'The magnifier at the top of the Library, Write’s contents, Organize and Analytics.'],
  ['Press Ctrl/⌘+K. Before you type, it lists where you were.', 'Press the magnifier. Before you type, it offers the main places to go.'],
  ['Open Settings with the gear beside the Library (or Ctrl/⌘+comma).', 'Open Settings, the last area (the gear).'],
  ['Under More, at the top: So far.', 'In Analytics → Keepsakes: Your book so far.'],
  ['Open More and press So far.', 'Open Analytics → Keepsakes and press Your book so far.'],
  ['Under More, at the top: Fingerprint, beside So far.', 'In Analytics → Keepsakes: Fingerprint.'],
  ['Under More, below Search: The index.', 'Search for “index”, in the magnifier at the top of Write.'],
  ['Open More and press The index.', 'Press the magnifier, type “index” and press The index.'],
  ['Under More, at the top: swipe the keepsakes to Full jacket.', 'In Analytics → Keepsakes: Full jacket.'],
  ['Open More, swipe the row of keepsakes and press Full jacket.', 'Open Analytics → Keepsakes and press Full jacket.'],
  ['Under More, at the top: the keepsakes, Best lines.', 'In Analytics → Keepsakes: Best lines.'],
  ['Under More, above the keepsakes: See the shelf.', 'In Analytics → Keepsakes: See the shelf.'],
  ['Under More, under Before a reader sees it: Send it out.', 'In Analytics → Keepsakes: the Submission kit.'],
  ['Under More, the first of the keepsakes: The Gazette.', 'In Analytics → Keepsakes: The Gazette.'],
  ['Under More, among the keepsakes: Postcards.', 'In Analytics → Keepsakes: Postcards.'],
  ['Under More, at the top: the first of the keepsakes, Quiz.', 'In Analytics → Keepsakes: Quiz.'],
  ['Under More, at the top: the keepsakes, Sampler.', 'In Analytics → Keepsakes: Sampler.'],
  ['Under More, at the top: the first of the keepsakes, Trailer.', 'In Analytics → Keepsakes: Trailer.'],
  ['Under More, above the keepsakes: Before a reader sees it.', 'In Organize → Review: Proofreading.'],
  ['Open More: the card says how many there are, and of which kinds, or that the book reads clean.', 'Open Organize → Review → Proofreading: it says how many there are, and of which kinds, or that the book reads clean.'],
  ['Open More: the card says how many of the six are ready, and which is next.', 'Open Analytics → Keepsakes → Submission kit: it says how many of the six are ready, and which is next.'],
  ['Open More. The keepsakes row says how many you have not opened yet, and those come first.', 'Open Analytics → Keepsakes. The row says how many you have not opened yet, and those come first.'],
  ['Open More and press ', 'Open Analytics → Keepsakes and press '],
  ['Open Visualize → ', 'Open Organize → Visualize → '],
  ['(Plan → Calendar)', '(Organize → Plan → Calendar)'],
  ['in Visualize → Timeline', 'in Organize → Visualize → Timeline'],
  ['Open Plan → ', 'Open Organize → Plan → '],
  ['or from Review.', 'or from Organize → Review.'],
  ['Open Visualize and press View: every view is a card, gathered by subject, saying what it shows.', 'Open Organize → Visualize: every view is a card, gathered by subject, saying what it shows.'],
  ['Open Review: ', 'Open Organize → Review: '],
  ['Open Review → ', 'Open Organize → Review → '],
  ['Open Progress → Analytics.', 'Open Analytics → Analytics.'],
  ['The Tutorial button in the rail; on a phone, beside the gear in the Library and in More inside a book; and in Settings.', 'The question mark at the top of the Library, Write’s contents, Organize and Analytics; or search for “tutorial”.'],
  ['At the top of More, inside a book.', 'In search, before you type.'],
  ['bring it back, or open it once, from Settings.', 'bring it back from the tutorial itself (search for “tutorial” to open it).'],
];

/** `text` in Scriptor's words. */
export function inScriptorWords(text: string): string {
  let s = text;
  for (const [flutter, scriptor] of lessonPhrases) s = s.split(flutter).join(scriptor);
  return s;
}

/** Scriptor's words turned back into the Flutter app's (for comparing with the Dart). */
export function toFlutterWords(text: string): string {
  let s = text;
  // In the same order: a specific phrase is turned back before the general one it contains.
  for (const [flutter, scriptor] of lessonPhrases) s = s.split(scriptor).join(flutter);
  return s;
}

/** A lesson in Scriptor's words. */
export function scriptorTopic(t: Topic): Topic {
  const r = lessonRewrites[t.id] ?? {};
  const said = (text: string, rewrite: readonly [string, string | null] | undefined): string =>
    rewrite === undefined ? inScriptorWords(text) : (rewrite[1] ?? '');
  return {
    ...t,
    title: inScriptorWords(t.title),
    what: said(t.what, r.what),
    steps: t.steps.flatMap((step, i) => {
      const rewrite = r.steps?.[i];
      if (rewrite === undefined) return [inScriptorWords(step)];
      return rewrite[1] === null ? [] : [rewrite[1]];
    }),
    example: said(t.example, r.example),
    ...(t.where !== undefined ? { where: said(t.where, r.where) } : {}),
  };
}

/** The lessons Scriptor shows, in its words, in the Flutter app's order. */
export const scriptorTopics: readonly Topic[] = tutorialTopics.filter((t) => !lessonsNotInScriptor.has(t.id)).map(scriptorTopic);

/** The keepsakes' pages and their lessons. */
const keepsakeLessons: Readonly<Record<string, string>> = {
  shelf: 'keepsakeshelf',
  lines: 'bestlines',
  quiz: 'bookquiz',
  story: 'bookstory',
  print: 'fingerprint',
  jacket: 'jacket',
  gazette: 'gazette',
  postcards: 'postcards',
  trailer: 'trailer',
  sampler: 'sampler',
  submission: 'submissionkit',
};

/** The lesson for a page that only Scriptor has (its keepsakes' pages, the index, proofreading), or null. */
export function scriptorOnlyLesson(flutterPath: string): string | null {
  const keep = /^\/keepsakes(?:\/([a-z]+))?$/.exec(flutterPath);
  if (keep !== null) return keepsakeLessons[keep[1] ?? 'shelf'] ?? 'keepsakeshelf';
  if (flutterPath === '/write/names') return 'index';
  if (flutterPath === '/review/proof') return 'beforeareader';
  return null;
}
