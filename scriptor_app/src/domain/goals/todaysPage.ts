// TODAY'S PAGE: the day's writing as a card to share, the way writers post their counts: ink on dark paper, the words
// written today large over a ring that closes on the goal, the days in a row and the last week as ink marks, the
// novel and the page written in, and a line written today only when the author chooses to include one. The card is
// laid out at 360 × 450 and made into a picture at three times that (1080 × 1350, a portrait post). Nothing about the
// novel is changed.
// Pure TypeScript. A port of everything in flutter_app/lib/features/write/todays_page.dart that decides what is on the
// card (the texts, the numbers, the seven days, the line quoted, the ring and the marks, the colours and the layout's
// measures), so the screen only draws it.

import { type JsonMap, str } from '../json';
import { type StoryNode, isDocument } from '../outline';
import { blockTexts } from '../prose';
import { type BookDay, carryOnNode, dayBookOf, dayOf, lastNodeKey, weekdayOf, writingSessionOf } from '../desk/dayBook';
import { formatNumber } from '../desk/format';
import { dayStartOf, freshParagraphs, textAtDayStart } from '../desk/freshInk';
import { displayTitle } from '../desk/pageAround';
import { dartTrim, dartTrimRight } from '../text/dartString';
import { weekdayMonthDay } from './days';
import { wordGoalsOf } from './wordGoals';

// ---------------------------------------------------------------------------------------------------- the line

const sentenceEnd = /[.!?…]["”’)]*(\s|$)/;

/** The first sentence of [paragraph] (its white space run together), at most [max] characters (UTF-16 units, as
 * Dart counts), cut at a word (when a space falls after the 40th) and ended "…". */
export function firstSentence(paragraph: string, max = 150): string {
  const t = dartTrim(paragraph).replace(/\s+/g, ' ');
  const end = sentenceEnd.exec(t);
  let s = end === null ? t : dartTrim(t.substring(0, end.index + end[0].length));
  if (s.length > max) {
    const cut = s.lastIndexOf(' ', max - 1);
    s = `${dartTrimRight(s.substring(0, cut > 40 ? cut : max - 1))}…`;
  }
  return s;
}

/** The last line written today in a chapter: the last of its paragraphs in today's ink (`freshInk.ts`), its first
 * sentence. Null when none. [node] is the chapter's `chapters` row, [saved] its `chapterContents` row, [revisions] its
 * history as the service lists it (`ManuscriptService.revisions`, newest first). */
export function lineWrittenToday({
  node,
  saved,
  revisions,
  nowMs,
}: {
  node: JsonMap | null;
  saved: JsonMap | null;
  revisions: readonly JsonMap[];
  nowMs: number;
}): string | null {
  const texts = blockTexts(saved?.['doc']);
  const before = textAtDayStart({ node, saved, revisions, dayStart: dayStartOf(nowMs) });
  const fresh = [...freshParagraphs(texts, before)].sort((a, b) => a - b);
  if (fresh.length === 0) return null;
  const line = firstSentence(texts[fresh[fresh.length - 1]]);
  return line === '' ? null : line;
}

// ---------------------------------------------------------------------------------------------------- the page

/** What today's page says: the novel, the day, the words and the goal, the days in a row and the last week, the page
 * written in, and (only when the author asks for it) a line written today. */
export type TodaysPage = {
  novel: string;
  author: string;
  /** The moment the page is of (milliseconds); its local day is the page's day. */
  day: number;
  today: number;
  goal: number | null;
  streak: number;
  /** The seven days ending today, oldest first. */
  week: BookDay[];
  chapter: string | null;
  total: number;
  line: string | null;
};

/** The rows a chapter's line is read from (see `lineWrittenToday`). */
export type ChapterRows = { node: JsonMap | null; saved: JsonMap | null; revisions: readonly JsonMap[] };

/** Today's page of a novel at [nowMs]: [project] its project row (`title`, `author`), [nodes] its outline,
 * [sessionRows] its `writingSessions`, [goalRows] its `goals`, [remembered] what the device's settings hold under
 * `write.lastNode.<novelId>` (`lastNodeKey`); the chapter is the one the day book carries on in. With [withLine], the
 * last line written today in that chapter, read from [rowsFor] it (called only then). */
export function todaysPageOf({
  project,
  nodes,
  sessionRows,
  goalRows,
  remembered,
  withLine,
  nowMs,
  rowsFor,
}: {
  project: JsonMap | null;
  nodes: readonly StoryNode[];
  sessionRows: Iterable<JsonMap>;
  goalRows: Iterable<JsonMap>;
  remembered: unknown;
  withLine: boolean;
  nowMs: number;
  rowsFor?: (nodeId: string) => ChapterRows;
}): TodaysPage {
  const book = dayBookOf([...sessionRows].map(writingSessionOf), nowMs);
  const title = project === null ? '' : dartTrim(str(project['title']));
  const next = nodes.some((n) => isDocument(n.kind)) ? carryOnNode(nodes, remembered) : null;
  const shown = book.days.filter((d) => !d.ahead);
  return {
    novel: title === '' ? 'Untitled novel' : title,
    author: project === null ? '' : dartTrim(str(project['author'])),
    day: nowMs,
    today: book.today,
    goal: wordGoalsOf(goalRows).daily,
    streak: book.streak,
    week: shown.slice(Math.max(0, shown.length - 7)),
    chapter: next === null ? null : displayTitle(next),
    total: nodes.reduce((a, n) => a + n.wordCount, 0),
    line: withLine && next !== null && rowsFor ? lineWrittenToday({ ...rowsFor(next.id), nowMs }) : null,
  };
}

export { lastNodeKey };

// ---------------------------------------------------------------------------------------------------- the card

/** The size the card is laid out at, and the scale the picture is made at (1080 × 1350). */
export const todaysPageSize = { width: 360, height: 450 } as const;
export const todaysPagePixelRatio = 3;

/** The card's colours, whatever the app's theme: ink on dark paper, in gold. */
export const todaysPageColors = {
  /** The paper, and the outer colour of its glow. */
  paper: '#14161F',
  /** The glow's inner colour, at its centre. */
  glow: '#232637',
  gold: '#F2B33D',
  ink: '#F4EFE4',
  soft: '#B9B3A6',
} as const;

/** The typefaces: the theme's heading and text faces (`BookFaces`): System Monolith's, or the book themes'. */
export const todaysPageFaces = {
  monolith: { heading: 'Outfit', text: 'Merriweather' },
  book: { heading: 'Cinzel', text: 'EB Garamond' },
} as const;

/** A text on the card: the face (`heading` is the theme's heading face at weight 700, line height 1.1; `text` its
 * text face at weight 400, line height 1.3), size, colour, letter spacing (a heading's is its size times a factor),
 * italic, alignment, and the lines it may take (cut with "…"). */
export type CardText = {
  text: string;
  face: 'heading' | 'text';
  size: number;
  color: keyof typeof todaysPageColors;
  letterSpacing: number;
  lineHeight: number;
  italic: boolean;
  align: 'start' | 'center';
  maxLines: number | null;
};

type TextOptions = { align?: CardText['align']; maxLines?: number | null; italic?: boolean };

function heading(
  text: string,
  size: number,
  color: CardText['color'],
  spacing = 0.12,
  { align = 'center', maxLines = null }: TextOptions = {},
): CardText {
  const letterSpacing = size * spacing;
  return { text, face: 'heading', size, color, letterSpacing, lineHeight: 1.1, italic: false, align, maxLines };
}

function body(
  text: string,
  size: number,
  color: CardText['color'],
  { italic = false, align = 'center', maxLines = null }: TextOptions = {},
): CardText {
  return { text, face: 'text', size, color, letterSpacing: 0, lineHeight: 1.3, italic, align, maxLines };
}

/** The ring of the goal: [part] how far to the goal, 0 to 1 (null: no goal set, a quiet full ring). */
export type GoalRing = {
  part: number | null;
  /** The track, a full circle: gold at this opacity and width. */
  trackOpacity: number;
  trackWidth: number;
  /** The arc, from the top clockwise over [part] of the circle, gold, width 8, round ends; none at 0 or no goal. */
  arcSweep: number;
  arcWidth: number;
};

export function goalRingOf(today: number, goal: number | null): GoalRing {
  const part = goal === null || goal <= 0 ? null : Math.min(1, Math.max(0, today / goal));
  return {
    part,
    trackOpacity: part === null ? 0.4 : 0.16,
    trackWidth: part === null ? 2 : 8,
    arcSweep: part !== null && part > 0 ? part : 0,
    arcWidth: 8,
  };
}

/** A day's ink mark, in an 18 × 18 box: a day not written is a small open circle (radius 3.15, a 1.2 line of gold at
 * 0.35); a day written, a gold dot, larger and darker by the square root of its share of the week's best day. */
export type Blot =
  | { kind: 'ring'; radius: number; strokeWidth: number; opacity: number }
  | { kind: 'dot'; radius: number; opacity: number };

const blotSize = 18;

export function blotOf(day: BookDay, week: readonly BookDay[]): Blot {
  const r = blotSize / 2;
  if (!day.written) return { kind: 'ring', radius: r * 0.35, strokeWidth: 1.2, opacity: 0.35 };
  const most = Math.max(1, week.reduce((m, d) => Math.max(m, d.words), 0));
  const share = Math.min(1, Math.max(0, Math.sqrt(day.words / most)));
  return { kind: 'dot', radius: r * (0.45 + 0.5 * share), opacity: 0.45 + 0.55 * share };
}

/** Each day's letter under its mark, Monday first. */
const initials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The measures of the card, top to bottom (see `todaysPageCardOf`). */
export const todaysPageLayout = {
  padding: { left: 26, top: 24, right: 26, bottom: 20 },
  afterKicker: 3,
  ring: { size: 150, inset: 6, numberPadding: 18 },
  afterRing: 14,
  afterStreak: 8,
  day: { blot: blotSize, padding: 6, afterBlot: 2 },
  afterLine: 10,
  rule: { height: 1, opacity: 0.35 },
  afterRule: 10,
  afterNovel: 2,
  afterFooter: 8,
} as const;

/** Everything drawn on the card, in order. */
export type TodaysPageCard = {
  kicker: CardText;
  date: CardText;
  ring: GoalRing;
  number: CardText;
  under: CardText;
  streak: CardText;
  days: { key: string; blot: Blot; initial: CardText }[];
  line: CardText | null;
  novel: CardText;
  footer: CardText;
  tag: CardText;
};

export function todaysPageCardOf(page: TodaysPage): TodaysPageCard {
  const goal = page.goal;
  const reached = goal !== null && goal > 0 && page.today >= goal;
  const under =
    goal === null || goal <= 0
      ? 'words today'
      : reached
        ? `goal of ${formatNumber(goal)} met`
        : `of ${formatNumber(goal)} words`;
  const streak =
    page.streak >= 2 ? `${page.streak} days in a row` : page.streak === 1 ? 'Written today' : 'A page at a time';
  const footer = [
    ...(page.author !== '' ? [page.author] : []),
    ...(page.chapter !== null ? [page.chapter] : []),
    `${formatNumber(page.total)} words so far`,
  ].join(' · ');
  return {
    kicker: heading('TODAY AT THE DESK', 10.5, 'gold', 0.22, { align: 'start' }),
    date: body(weekdayMonthDay(page.day), 13, 'soft', { align: 'start' }),
    ring: goalRingOf(page.today, goal),
    number: heading(formatNumber(Math.max(0, page.today)), 44, 'ink', 0),
    under: body(under, 12.5, 'soft'),
    streak: heading(streak, 15, 'ink', 0.06),
    days: page.week.map((d) => ({
      key: d.key,
      blot: blotOf(d, page.week),
      initial: body(initials[weekdayOf(d.key) - 1], 9.5, 'soft'),
    })),
    line: page.line === null ? null : body(`“${page.line}”`, 14, 'ink', { italic: true, maxLines: 3 }),
    novel: heading(page.novel, 15, 'ink', 0.08, { maxLines: 1 }),
    footer: body(footer, 11.5, 'soft', { maxLines: 1 }),
    tag: heading('#amwriting', 9.5, 'gold', 0.16),
  };
}

// ---------------------------------------------------------------------------------------------------- the dialog

export const todaysPageTitle = 'Today’s page';
export const includeLineLabel = 'Include a line I wrote today';
export const todaysPageClose = 'Close';
export const todaysPageShare = 'Share';

/** The preview in the dialog: at most this wide, the card's shape, its corners rounded by this. */
export const todaysPagePreview = { maxWidth: 300, radius: 10 } as const;

/** Under "Include a line I wrote today": when asked for and there is none, so. */
export function includeLineSubtitle(asked: boolean, line: string | null): string {
  return line === null && asked ? 'Nothing written today on this page yet' : 'Your own words, quoted';
}

/** The picture's file name: `todays-page-2026-11-17.png`, the local day it is made. */
export function todaysPageFileName(nowMs: number): string {
  return `todays-page-${dayOf(new Date(Math.trunc(nowMs)))}.png`;
}

/** What is said when the picture could not be made. */
export function pictureFailed(error: unknown): string {
  return `The picture could not be made: ${String(error)}`;
}
