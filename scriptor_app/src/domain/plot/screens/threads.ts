// PLAN › PLOT THREADS: every storyline the reader will expect to be followed up, with where each develops. Reminders
// about quiet threads are facts, never rulings: a thread stays exactly as the author marked it. The pure parts of
// flutter_app/lib/features/plot/threads_page.dart (search, filters, grouping, Worth a look, the footer) and
// widgets/story_questions.dart (the questions an empty list asks). Each thread is drawn as a strand on the loom
// (./loom.ts).

import { localeCompare } from '../../collation';
import { plural } from '../../desk/format';
import type { StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import type { Entry } from '../../records/entry';
import { type PlotThread, threadStatuses } from '../../records/thread';
import { foldText } from '../../text/fold';
import { dartTrim } from '../../text/dartString';
import { type PlotReport, type ThreadReport, defaultQuietAfter, diagnose, quietChoices, threadStatusLabels } from '../diagnostics';
import { type PlotChanges, categoryName, threadCategories, threadCategoryLabels, threadStatusOrder } from '../plotChanges';

const statusNames: Readonly<Record<string, string>> = {
  planned: 'Planned',
  active: 'Active',
  paused: 'Paused',
  resolved: 'Resolved',
  abandoned: 'Abandoned',
  retconned: 'Retconned',
  custom: 'Custom',
};

/** A thread's status as the author names it: their own words for a custom one. Null for a status this app does not know
 * (an edited file), which is shown as nothing rather than guessed. (`threadStatusName` in shared/domain/model/navigate.dart.) */
export function threadStatusName(t: PlotThread): string | null {
  const known = threadStatuses.find((s) => s === t.statusKey);
  if (known === undefined) return null;
  const custom = t.customStatus === null ? '' : dartTrim(t.customStatus);
  return known === 'custom' && custom.length > 0 ? custom : statusNames[known];
}

/** How the list is grouped (remembered on this device under `plot.group`). */
export type ThreadGrouping = 'status' | 'category' | 'character';
export const threadGroupings: Readonly<Record<ThreadGrouping, string>> = { status: 'Status', category: 'Category', character: 'Character' };
export const groupingKey = 'plot.group';
export const groupingOf = (stored: unknown): ThreadGrouping =>
  stored === 'status' || stored === 'category' || stored === 'character' ? stored : 'status';

/** The quiet limit, per novel, on this device: "Flag quiet threads after". */
export const quietKey = (novelId: string): string => `plot.quiet.${novelId}`;
export const quietOf = (stored: unknown): number => (typeof stored === 'number' && Number.isInteger(stored) ? stored : defaultQuietAfter);
export function quietChooser(quietAfter: number): { label: string; value: number; choices: { value: number; label: string }[] } {
  return {
    label: 'Flag quiet threads after',
    value: quietChoices.includes(quietAfter) ? quietAfter : defaultQuietAfter,
    choices: quietChoices.map((n) => ({ value: n, label: `${n} quiet chapters` })),
  };
}

export type ThreadFilters = { query: string; status: string | null; category: string | null; onlyFlagged: boolean };
export const noThreadFilters: ThreadFilters = { query: '', status: null, category: null, onlyFlagged: false };

export type ThreadGroup = { key: string; heading: string; label: string; items: ThreadReport[] };

export type ThreadsView = {
  report: PlotReport;
  subtitle: string;
  /** Worth a look: each observation, with the thread it is about. */
  flagged: { threadId: string; title: string; message: string }[];
  flaggedTitle: string;
  flaggedCaption: string;
  /** Nothing yet: the questions your story asks take the list's place. */
  empty: boolean;
  /** Something, but nothing matches: the no-results state. */
  noResults: boolean;
  showLegend: boolean;
  groups: ThreadGroup[];
  statusChoices: { value: string; label: string }[];
  categoryChoices: { value: string; label: string }[];
  footer: string | null;
};

/** The page for the novel's threads: reported against the manuscript, found, filtered and grouped. */
export function threadsView(model: StoryModel, novelTitle: string, filters: ThreadFilters, grouping: ThreadGrouping, quietAfter: number): ThreadsView {
  const report = diagnose([...model.threads.values()], [...model.nodes.values()], quietAfter);
  const needle = foldText(dartTrim(filters.query));
  const visible = stableSorted(
    report.reports.filter(
      (r) =>
        (filters.category === null || r.thread.category === filters.category) &&
        (filters.status === null || r.thread.statusKey === filters.status) &&
        (!filters.onlyFlagged || r.issues.length > 0) &&
        (needle.length === 0 ||
          [r.thread.title, r.thread.premise, categoryName(r.thread), ...r.thread.beats.map((b) => b.title)].some((t) => foldText(t).includes(needle))),
    ),
    (a, b) => localeCompare(a.thread.title, b.thread.title),
  );
  const groups: { key: string; heading: string; items: ThreadReport[] }[] = [];
  if (grouping === 'status') {
    for (const key of threadStatusOrder) groups.push({ key, heading: threadStatusLabels[key], items: visible.filter((r) => r.thread.statusKey === key) });
  } else if (grouping === 'category') {
    const rank = (name: string) => {
      const i = threadCategories.findIndex((c) => threadCategoryLabels[c] === name);
      return i === -1 ? threadCategories.length : i;
    };
    const names = stableSorted(new Set(visible.map((r) => categoryName(r.thread))), (a, b) => {
      const byRank = rank(a) - rank(b);
      return byRank !== 0 ? byRank : localeCompare(a, b);
    });
    for (const name of names) groups.push({ key: name, heading: name, items: visible.filter((r) => categoryName(r.thread) === name) });
  } else {
    const people = new Map<string, Entry>();
    for (const r of visible) {
      for (const id of r.thread.characterIds) {
        const e = model.entries.get(id);
        if (e !== undefined && !people.has(e.id)) people.set(e.id, e);
      }
    }
    for (const c of stableSorted(people.values(), (a, b) => localeCompare(a.name, b.name))) {
      groups.push({ key: c.id, heading: c.name, items: visible.filter((r) => r.thread.characterIds.includes(c.id)) });
    }
    groups.push({
      key: 'nobody',
      heading: 'No character attached',
      items: visible.filter((r) => !r.thread.characterIds.some((id) => model.entries.has(id))),
    });
  }
  const flagged = stableSorted(
    report.reports.filter((r) => r.issues.length > 0),
    (a, b) => localeCompare(a.thread.title, b.thread.title),
  );
  const active = report.reports.filter((r) => r.thread.statusKey === 'active').length;
  const total = report.reports.length;
  const subtitle =
    `${novelTitle} · ${plural(total, 'thread')}` +
    (total > 0 ? ` · ${active} active` : '') +
    (flagged.length > 0 ? ` · ${flagged.length} to check` : '');
  return {
    report,
    subtitle,
    flagged: flagged.flatMap((r) => r.issues.map((i) => ({ threadId: r.thread.id, title: r.thread.title, message: i.message }))),
    flaggedTitle: 'Worth a look',
    flaggedCaption: 'These are reminders, not rulings. A thread stays exactly as you marked it until you change it yourself.',
    empty: total === 0,
    noResults: total > 0 && visible.length === 0,
    showLegend: total > 0 && report.chapterCount > 0,
    groups: groups.filter((g) => g.items.length > 0).map((g) => ({ ...g, label: `${g.heading}  ${g.items.length}` })),
    statusChoices: [{ value: '', label: 'Any status' }, ...threadStatusOrder.map((s) => ({ value: s, label: threadStatusLabels[s] }))],
    categoryChoices: [
      { value: '', label: 'Any category' },
      ...threadCategories.filter((c) => report.reports.some((r) => r.thread.category === c)).map((c) => ({ value: c, label: threadCategoryLabels[c] })),
    ],
    footer:
      total === 0
        ? null
        : (report.frontier > 0
            ? `The manuscript has words up to chapter ${report.frontier} of ${report.chapterCount}; quiet threads are measured against that.`
            : 'Quiet threads are measured against the last chapter that has words. Nothing is written yet, so only gaps between developments are flagged.') +
          (visible.length !== total ? ` Showing ${visible.length} of ${total} threads.` : ''),
  };
}

export const threadsWords = {
  title: 'Plot threads',
  newThread: 'New thread',
  search: 'Search threads',
  filters: 'Filters and grouping',
  hideFilters: 'Hide filters',
  status: 'Status',
  category: 'Category',
  onlyFlagged: 'To check only',
  noNovel: 'Plot threads belong to one novel. Open one from the Library.',
} as const;

// ------------------------------------------------------------------------------------------- the questions your story asks

/** One question a reader carries through a book: how it is asked, an example, and the kind of thread it becomes. */
export type StoryQuestion = { asks: string; hint: string; category: string };

export const storyQuestions: readonly StoryQuestion[] = [
  { asks: 'The question the whole book answers', hint: 'Will Ren master his deadly skill?', category: 'main' },
  { asks: 'A mystery the reader wants solved', hint: 'Who sealed the SSS rank, and why?', category: 'mystery' },
  { asks: 'Who might fall for whom', hint: 'Will Ilse forgive him?', category: 'romance' },
  { asks: 'What someone is hiding', hint: 'What is the Grey Abbot not saying?', category: 'villain' },
];

/** Makes a thread for each question written, as written (a question mark added when it has none), of its kind, in one
 * change (inside PlotService.change). Returns how many were made: 0 makes nothing. */
export function askTheQuestions(c: PlotChanges, lines: readonly (readonly [StoryQuestion, string])[]): number {
  const asked = lines.flatMap(([q, text]) => (dartTrim(text).length > 0 ? [[q, dartTrim(text)] as const] : []));
  for (const [q, text] of asked) {
    const id = c.createThread(/[?!.…]$/.test(text) ? text : `${text}?`);
    c.updateThread(id, () => ({ category: q.category }));
  }
  return asked.length;
}

/** Whether any question has words (Ask them is offered then). */
export const anyAsked = (texts: readonly string[]): boolean => texts.some((t) => dartTrim(t).length > 0);

/** What is said once the threads are made. */
export function askedMessage(made: number): string | null {
  if (made <= 0) return null;
  return made === 1 ? 'Your first thread is ready. Mark the chapters where it moves.' : `Your ${made} threads are ready. Mark the chapters where each moves.`;
}

export const storyQuestionsWords = {
  title: 'The questions your story asks',
  intro:
    'Every question you raise is a promise to the reader. Write the ones your book makes; each becomes a thread to follow, and you will be told when one has gone quiet.',
  ask: 'Ask them',
  newThread: 'New thread',
} as const;
