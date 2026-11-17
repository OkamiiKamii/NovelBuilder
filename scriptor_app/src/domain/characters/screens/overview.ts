// THE OVERVIEW TAB: the profile's own sections beside the character's web of relationships, their symbol when they
// have one, then what other parts of the novel say about the character. Each of those shows records that live
// elsewhere and leads to them; none is a copy. The pure parts of
// flutter_app/lib/features/characters/tabs/overview_tab.dart (in the manuscript, the timeline, the plot threads, the
// progression line). The sentence (oneSentence.ts), the sections (sections.ts), the web and the symbol (vault.ts) and
// the passages (theirPages.ts) are their own.

import { formatNumber, plural } from '../../desk/format';
import { type TimelineEvent } from '../../records/event';
import { type PlotThread } from '../../records/thread';
import { stableSorted } from '../../reader/stableSort';
import { TimeContext, spanOfEvent } from '../../model/validity';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { capitalized, documentName } from './parts';

/** A chapter or scene to go to (openChapter), by its title. */
export type ChapterLink = { nodeId: string; label: string };

/** "In the manuscript": where the character is linked and named, and the author's appearance records. */
export function inTheManuscript(
  cast: CastData,
  listed: Listed,
): {
  title: string;
  /** When they are neither linked nor named. */
  empty: string | null;
  linked: { text: string; chapters: ChapterLink[]; more: string | null } | null;
  named: { text: string; chapters: ChapterLink[]; more: string | null } | null;
  appears: { text: string; chapters: ChapterLink[] } | null;
  mentioned: { text: string; chapters: ChapterLink[] } | null;
} {
  const entry = listed.entry;
  const linked = listed.linkedIn;
  const reading = (ids: Iterable<string>) =>
    stableSorted(
      [...ids].filter((id) => cast.model.nodes.has(id)),
      (a, b) => (cast.model.order.position.get(a) ?? 0) - (cast.model.order.position.get(b) ?? 0),
    );
  const plans = [...cast.model.plans.values()];
  const appears = reading(plans.filter((p) => p.appearIds.includes(entry.id)).map((p) => p.id));
  const mentioned = reading(plans.filter((p) => p.mentionIds.includes(entry.id)).map((p) => p.id));
  const link = (id: string): ChapterLink => ({ nodeId: id, label: documentName(cast, id) });
  const named = listed.namedIn;
  const some = (ids: readonly string[]) => ids.slice(0, 24).map(link);
  const more = (ids: readonly string[]) => (ids.length > 24 ? `and ${formatNumber(ids.length - 24)} more` : null);
  return {
    title: 'In the manuscript',
    empty:
      linked.length === 0 && named.length === 0
        ? `No chapter links to ${entry.name} yet. In the editor, select their name (or a title they go by) and link it ` +
          'to this character.'
        : null,
    linked:
      linked.length === 0
        ? null
        : {
            text:
              `Linked in ${plural(linked.length, 'chapter or scene', 'chapters and scenes')}. ` +
              `First: ${documentName(cast, linked[0])}` +
              `${linked.length > 1 ? `; latest: ${documentName(cast, linked[linked.length - 1])}` : ''}.`,
            chapters: some(linked),
            more: more(linked),
          },
    // Found by name, where nobody linked them (namedIn.ts).
    named:
      named.length === 0
        ? null
        : {
            text:
              `${linked.length === 0 ? 'Named' : 'Also named'} in ` +
              `${plural(named.length, 'chapter or scene', 'chapters and scenes')}` +
              ' (their name, an alias or their title on the page):',
            chapters: some(named),
            more: more(named),
          },
    appears:
      appears.length === 0 ? null : { text: 'Appears in (your appearance record):', chapters: appears.map(link) },
    mentioned:
      mentioned.length === 0
        ? null
        : { text: 'Mentioned, not on the page (your appearance record):', chapters: mentioned.map(link) },
  };
}

/** One event on the character's timeline. */
export type TimelineLine = { event: TimelineEvent; title: string; age: string | null };

/** "Timeline": the events the character takes part in, in story time where the dates say so; events with no place in
 * time are listed apart, never guessed at. */
export function characterTimeline(
  cast: CastData,
  entryId: string,
  name: string,
): { title: string; empty: string | null; dated: TimelineLine[]; undatedTitle: string | null; undated: TimelineLine[] } {
  const context = new TimeContext({
    position: cast.model.order.position,
    events: cast.model.events,
    calendar: cast.model.calendar,
  });
  const mine = [...cast.model.events.values()].filter((e) => e.characters.some((c) => c.id === entryId));
  const dated: [TimelineEvent, number][] = [];
  const undated: TimelineEvent[] = [];
  for (const e of mine) {
    const span = spanOfEvent(e.id, context);
    if (span === null) undated.push(e);
    else dated.push([e, span.lo]);
  }
  const ordered = stableSorted(dated, (a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const line = (e: TimelineEvent): TimelineLine => {
    const age = e.characters.find((c) => c.id === entryId)!.age;
    return {
      event: e,
      title: e.name.length === 0 ? 'An unnamed event' : e.name,
      age: age === null ? null : `Age ${formatNumber(age)} (as you recorded it)`,
    };
  };
  return {
    title: 'Timeline',
    empty: mine.length === 0 ? `No timeline event includes ${name} yet.` : null,
    dated: ordered.map(([e]) => line(e)),
    undatedTitle: undated.length > 0 ? 'Not placed in time:' : null,
    undated: undated.map(line),
  };
}

/** "Plot threads": the threads that name the character, each with its status. */
export function characterThreads(
  cast: CastData,
  entryId: string,
  name: string,
): { title: string; empty: string | null; threads: { thread: PlotThread; title: string; status: string }[] } {
  const threads = [...cast.model.threads.values()].filter((t) => t.characterIds.includes(entryId));
  const status = (t: PlotThread) => (t.status === 'custom' ? (t.customStatus ?? 'Custom') : capitalized(t.statusKey));
  return {
    title: 'Plot threads',
    empty: threads.length === 0 ? `No plot thread names ${name} yet.` : null,
    threads: threads.map((t) => ({ thread: t, title: t.title.length === 0 ? 'An untitled thread' : t.title, status: status(t) })),
  };
}

/** "Character progression": what is recorded about how the character changes, in a line, with the way to the
 * Progression tab; null when nothing is. */
export function progressionLine(
  cast: CastData,
  entryId: string,
): { title: string; text: string; open: string } | null {
  const sheets = cast.model.sheets.filter((s) => s.entryId === entryId).length;
  const snapshots = cast.snapshot.rows('progressSnapshots').filter((s) => s['entryId'] === entryId).length;
  const changes = cast.model.progress.filter((c) => c.entryId === entryId).length;
  if (sheets + snapshots + changes === 0) return null;
  return {
    title: 'Character progression',
    text: [
      ...(sheets > 0 ? [plural(sheets, 'system sheet')] : []),
      ...(snapshots > 0 ? [plural(snapshots, 'progression snapshot')] : []),
      ...(changes > 0 ? [plural(changes, 'recorded change')] : []),
    ].join(', '),
    open: 'Open the Progression tab',
  };
}

/** The overview's own headings. */
export const overviewWords = { relationships: 'Relationships', symbol: 'Symbol' } as const;
