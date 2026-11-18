// ALL WARNINGS (FEATURES.md #306–#309): every warning the checks raise, in one place, by severity and category, each a
// confirmed data error or a possible inconsistency, with its rule, the data it rests on, the records it is about and
// where to see it; worked through one at a time, most serious first, each decided as Resolved, Intentional, Needs
// review or Ignored with a note; filtered by To look at / Decided / Everything, certainty, severity, category, check
// and words; and, when nothing is raised, the "In good order" certificate. Only the decision is stored.
//
// The pure parts of flutter_app/lib/features/review/review_page.dart, widgets/review_parts.dart and
// widgets/all_clear.dart; and the words Scriptor shows for the Flutter app's (World for the codex) and its routes for
// the Flutter app's paths.

import { type Severity, severities, severityLabel } from '../../continuity/rules';
import { formatNumber } from '../../desk/format';
import type { StoryModel } from '../../model/storyModel';
import { type ReviewDecision, reviewDecisionLabel } from '../../records/review';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import {
  type Certainty,
  type ReviewCategory,
  type ReviewSource,
  type ReviewedWarning,
  type Warning,
  certaintyWords,
  reviewCategories,
  reviewCategoryLabel,
  reviewSourceWords,
  reviewSources,
} from '../collect';

// ------------------------------------------------------------------------------------------------ Scriptor's words

/** The Flutter app calls the world's records "the codex"; Scriptor calls that part World. The phrases as they are
 * shown (the domain keeps the original's words, so its agreement with the Dart is checked word for word). */
const worldPhrases: readonly (readonly [RegExp, string])[] = [
  [/\bcodex entry\b/g, 'World entry'],
  [/\bcodex entries\b/g, 'World entries'],
  [/\bcodex fields\b/g, 'World fields'],
  [/\bcodex field\b/g, 'World field'],
  [/\bCodex page\b/g, 'World page'],
  [/\bthe Codex\b/g, 'World'],
  [/\bthe codex\b/g, 'World'],
  [/\bcodex\b/g, 'World'],
  [/\bCodex\b/g, 'World'],
];

/** Text as Scriptor shows it: "World" wherever the Flutter app says "codex". */
export function worldWords(text: string): string {
  let s = text;
  for (const [pattern, words] of worldPhrases) s = s.replace(pattern, words);
  return s;
}

/** Where a path of the Flutter app is in Scriptor: a route, a chapter to open in Write, or nothing yet. */
export type ScriptorPlace = { kind: 'route'; path: string } | { kind: 'chapter'; nodeId: string } | { kind: 'later' };

export function scriptorPlace(path: string): ScriptorPlace {
  if (path.startsWith('/write?node=')) return { kind: 'chapter', nodeId: decodeURIComponent(path.substring('/write?node='.length)) };
  if (path === '/visualize') return { kind: 'route', path: '/organize/ties' };
  if (path.startsWith('/organize/world/kinds')) return { kind: 'route', path: path.replace('/organize/world/kinds', '/organize/kinds') };
  return { kind: 'route', path };
}

// ------------------------------------------------------------------------------------------------- the page

export type Show = 'todo' | 'decided' | 'all';
export const shows: readonly Show[] = ['todo', 'decided', 'all'];
export const showLabel: Readonly<Record<Show, string>> = { todo: 'To look at', decided: 'Decided', all: 'Everything' };

export type WarningFilters = {
  certainty: Certainty | null;
  severity: Severity | null;
  category: ReviewCategory | null;
  source: ReviewSource | null;
  text: string;
};

export const noWarningFilters: WarningFilters = { certainty: null, severity: null, category: null, source: null, text: '' };

export const isFiltered = (f: WarningFilters): boolean =>
  f.certainty !== null || f.severity !== null || f.category !== null || f.source !== null || f.text.length > 0;

/** To look at: no decision, or "needs review". */
export const isTodo = (i: ReviewedWarning): boolean => i.status === 'open' || i.status === 'review';

const plural = (n: number, one: string, many: string = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export type Group = { heading: string; count: number; inner: { heading: string; items: ReviewedWarning[] }[] };

export type WarningsView = {
  items: ReviewedWarning[];
  todo: ReviewedWarning[];
  decided: ReviewedWarning[];
  listed: ReviewedWarning[];
  /** "3 to look at: 2 confirmed data errors, 1 possible inconsistency · 0 need review · 4 decided". */
  status: string;
  /** The open warnings, most serious first, in the order the list groups them. */
  queue: ReviewedWarning[];
  /** "2 critical · 3 warnings". */
  bySeverity: string;
  headline: { count: number; words: string };
  /** The share decided, for the gauge. */
  decidedShare: number;
  showCounts: Readonly<Record<Show, number>>;
  groups: Group[];
  /** In place of the list when it is empty. */
  empty: { title: string; message: string; clear: boolean } | null;
};

export function warningsView(items: readonly ReviewedWarning[], show: Show, byCategory: boolean, filters: WarningFilters): WarningsView {
  const todo = items.filter(isTodo);
  const decided = items.filter((i) => !isTodo(i));
  const count = (list: readonly ReviewedWarning[], c: Certainty) => list.filter((i) => i.warning.certainty === c).length;
  const text = dartToLowerCase(dartTrim(filters.text));
  const source = show === 'todo' ? todo : show === 'decided' ? decided : [...items];
  const listed = source.filter(
    (i) =>
      (filters.certainty === null || i.warning.certainty === filters.certainty) &&
      (filters.severity === null || i.warning.severity === filters.severity) &&
      (filters.category === null || i.warning.category === filters.category) &&
      (filters.source === null || i.warning.source === filters.source) &&
      (text.length === 0 || dartToLowerCase(`${i.warning.title} ${i.warning.message} ${i.warning.because}`).includes(text)),
  );
  const needReview = items.filter((i) => i.status === 'review').length;
  const errors = count(todo, 'error');
  const possible = count(todo, 'possible');
  const summary =
    todo.length === 0
      ? 'Nothing to look at'
      : `${todo.length} to look at: ${errors} confirmed data ${errors === 1 ? 'error' : 'errors'}, ${possible} possible ` +
        `${possible === 1 ? 'inconsistency' : 'inconsistencies'}`;
  const queue = [...todo].sort((a, b) => {
    const s = severities.indexOf(a.warning.severity) - severities.indexOf(b.warning.severity);
    return s !== 0 ? s : reviewCategories.indexOf(a.warning.category) - reviewCategories.indexOf(b.warning.category);
  });
  const bySeverity = severities
    .map((s) => {
      const n = todo.filter((i) => i.warning.severity === s).length;
      return n > 0 ? `${n} ${dartToLowerCase(severityLabel[s])}${s === 'warning' && n !== 1 ? 's' : ''}` : null;
    })
    .filter((x): x is string => x !== null)
    .join(' · ');
  const outer: (Severity | ReviewCategory)[] = byCategory
    ? reviewCategories.filter((c) => listed.some((i) => i.warning.category === c))
    : severities.filter((s) => listed.some((i) => i.warning.severity === s));
  const groups: Group[] = outer.map((o) => {
    const inOuter = listed.filter((i) => (byCategory ? i.warning.category === o : i.warning.severity === o));
    const innerKeys: (Severity | ReviewCategory)[] = byCategory ? [...severities] : [...reviewCategories];
    return {
      heading: byCategory ? reviewCategoryLabel[o as ReviewCategory] : severityLabel[o as Severity],
      count: inOuter.length,
      inner: innerKeys
        .map((k) => ({
          heading: byCategory ? severityLabel[k as Severity] : reviewCategoryLabel[k as ReviewCategory],
          items: inOuter.filter((i) => (byCategory ? i.warning.severity === k : i.warning.category === k)),
        }))
        .filter((g) => g.items.length > 0),
    };
  });
  const filtered = isFiltered(filters);
  return {
    items: [...items],
    todo,
    decided,
    listed,
    status: `${summary} · ${needReview} need review · ${decided.length} decided`,
    queue,
    bySeverity,
    headline: { count: todo.length, words: todo.length === 1 ? 'warning to look at' : 'warnings to look at' },
    decidedShare: items.length === 0 ? 1 : decided.length / items.length,
    showCounts: { todo: todo.length, decided: decided.length, all: items.length },
    groups,
    empty:
      listed.length > 0
        ? null
        : {
            title: filtered
              ? 'Nothing matches these filters'
              : show === 'todo'
                ? items.length === 0
                  ? 'No check has found anything'
                  : 'Nothing to look at'
                : show === 'decided'
                  ? 'Nothing decided yet'
                  : 'No check has found anything',
            message: filtered
              ? 'Clear the filters to see every warning.'
              : show === 'todo' && items.length > 0
                ? 'Every warning has a decision.'
                : 'Your records agree with each other, as far as each rule can tell from what is recorded.',
            clear: filtered,
          },
  };
}

/** Where the one-at-a-time card stands after a decision: one that closes it takes it out of the queue, so the next
 * moves up; "needs review" stays, so the next one is shown. */
export function afterDecision(at: number, kind: ReviewDecision): number {
  return kind === 'review' ? at + 1 : at;
}

/** The card in front: within the queue. */
export function clampAt(at: number, queueLength: number): number {
  return queueLength === 0 ? 0 : Math.max(0, Math.min(at, queueLength - 1));
}

/** The decisions in the order the one-at-a-time card offers them. */
export const focusDecisions: readonly ReviewDecision[] = ['resolved', 'intentional', 'review', 'dismissed'];

/** What each decision means. */
export const decisionHints: Readonly<Record<ReviewDecision, string>> = {
  review: 'Still open, and flagged to come back to. It stays on every list of things to look at.',
  resolved: 'Dealt with: settled, or fixed somewhere the records do not show.',
  intentional: 'Meant: the story explains it (a flashback, a disguise, an unreliable narrator…).',
  dismissed: 'Not worth acting on. The other pages call this Dismiss.',
};

export const openHint = 'No decision: it stays on the list to look at.';

/** Every warning comes from a check with its own rule, raised only when the records hold what that rule needs. */
export const reviewPromise =
  'Every warning comes from one of the checks below, each with its own stated rule, and is raised only when your ' +
  'records hold what that rule needs: no date, no place, no tracked rule means no warning, never a guess. Nothing here ' +
  'changes a record, canon or the manuscript; only your decision about each warning is kept.';

/** The node a continuity warning's decision is kept with (its passage's chapter or scene). */
export function decisionNode(w: Warning): string | null {
  return w.source === 'continuity' ? (w.refs.find((r) => r.type === 'node')?.id ?? null) : null;
}

/** A decision's label, as the review says it. */
export const decisionLabel = (d: ReviewDecision): string => reviewDecisionLabel[d];

/** The tags over a warning: its certainty (with its hint), its check, and its decision when it has one. */
export function warningTags(item: ReviewedWarning): { label: string; hint: string | null }[] {
  const w = item.warning;
  return [
    { label: certaintyWords[w.certainty].label, hint: certaintyWords[w.certainty].hint },
    { label: reviewSourceWords[w.source].label, hint: null },
    ...(item.decision !== null ? [{ label: reviewDecisionLabel[item.decision.decision], hint: null }] : []),
  ];
}

/** "Where it is checked: Timeline review". */
export const whereChecked = (w: Warning): string => `Where it is checked: ${reviewSourceWords[w.source].label}`;

// ---------------------------------------------------------------------------------------------- what was checked

/** One check, as the certificate and "What was checked" say it. */
export type CheckLine = { label: string; what: string; extra: string | null };

const sentence = (what: string) => `${what[0].toUpperCase()}${what.substring(1)}.`;

const listWords = (items: readonly string[]): string =>
  items.length === 1 ? items[0] : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** IN GOOD ORDER: what the checks read, and each check with what it looks at. */
export function allClear(model: StoryModel, scanned: { documents: number; rules: number }): {
  title: string;
  said: string;
  checks: { label: string; what: string }[];
  footer: string;
} {
  const characters = [...model.entries.values()].filter((e) => e.category === 'character').length;
  const others = model.entries.size - characters;
  const looked = [
    ...(scanned.documents > 0 ? [plural(scanned.documents, 'chapter or scene', 'chapters and scenes')] : []),
    ...(characters > 0 ? [plural(characters, 'character')] : []),
    ...(others > 0 ? [plural(others, 'world entry', 'world entries')] : []),
    ...(model.events.size > 0 ? [plural(model.events.size, 'timeline event')] : []),
  ];
  return {
    title: 'In good order',
    said: looked.length === 0 ? 'Nothing is recorded yet for the checks to compare.' : `Every check read ${listWords(looked)}, and none found anything to look at.`,
    checks: reviewSources.map((s) => {
      const extra = s === 'continuity' && scanned.rules > 0 ? `With ${plural(scanned.rules, 'tracked rule')}.` : null;
      return { label: reviewSourceWords[s].label, what: worldWords(extra === null ? sentence(reviewSourceWords[s].what) : `${sentence(reviewSourceWords[s].what)} ${extra}`) };
    }),
    footer: 'Judged only from what is recorded; nothing was changed. As records grow, this page lists anything that disagrees.',
  };
}

/** "What was checked": each check, what it looks at, and how many it raised. */
export function whatWasChecked(warnings: readonly Warning[], scanned: { documents: number; rules: number }): string[] {
  const bySource = new Map<ReviewSource, number>();
  for (const w of warnings) bySource.set(w.source, (bySource.get(w.source) ?? 0) + 1);
  return reviewSources.map(
    (s) =>
      worldWords(
        `${reviewSourceWords[s].label}: ${reviewSourceWords[s].what}. ${bySource.get(s) ?? 0} raised.` +
          `${s === 'continuity' ? ` ${scanned.documents} chapters and scenes, ${scanned.rules} tracked rules.` : ''}`,
      ),
  );
}

/** The words the filters offer. */
export const filterWords = {
  groupBy: 'Group by',
  bySeverity: 'Severity, then category',
  byCategory: 'Category, then severity',
  certainty: 'Certainty',
  severity: 'Severity',
  category: 'Category',
  check: 'Check',
  both: 'Both',
  any: 'Any',
  search: 'Search the warnings',
  clear: 'Clear filters',
  oneAtATime: 'One at a time',
  wholeList: 'The whole list',
  whatWasChecked: 'What was checked',
  setStatus: 'Set the status…',
  saveStatus: 'Save the status',
  cancel: 'Cancel',
  open: 'Open',
  note: 'Note (optional)',
  noteHint: 'Why, or what was done',
  previous: 'Previous warning',
  next: 'Skip to the next warning',
  rule: 'The rule: ',
  because: 'Because: ',
  yourNote: 'Your note: ',
  goneHeading: 'Decisions about warnings no longer raised',
  goneCaption:
    'The records changed since, so these warnings are not raised now. The decisions are kept; remove one to ' + 'tidy up.',
  remove: 'Remove',
  title: 'Continuity review',
  noNovel: 'Review works inside one novel. Open one from the Library.',
} as const;

export const certaintyChoices = (['error', 'possible'] as const).map((c) => ({ value: c, label: certaintyWords[c].label }));
export const severityChoices = severities.map((s) => ({ value: s, label: severityLabel[s] }));
export const categoryChoices = reviewCategories.map((c) => ({ value: c, label: reviewCategoryLabel[c] }));
export const sourceChoices = reviewSources.map((s) => ({ value: s, label: reviewSourceWords[s].label }));

/** A "gone" decision as the list says it. */
export function goneLine(d: { message: string; key: string; decision: ReviewDecision; note: string }): { title: string; subtitle: string } {
  return {
    title: d.message.length === 0 ? d.key : d.message,
    subtitle: `${reviewDecisionLabel[d.decision]}${d.note.length > 0 ? ` · ${d.note}` : ''}`,
  };
}
