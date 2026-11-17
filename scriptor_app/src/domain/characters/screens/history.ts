// THE HISTORY TAB: two records, side by side and never mixed: what happens to the character in the story, and what the
// author has done to the character's record. Nothing is made up for changes made before this history existed. The
// pure parts of flutter_app/lib/features/characters/tabs/history_tab.dart.
//
// What a press changes: "Add milestone", CharacterChanges.addMilestone(entryId, text, nodeId) (nothing for blank
// text); a milestone's ×, removeMilestone(id).

import { sortedStages } from '../../model/storyOrder';
import { stableSorted } from '../../reader/stableSort';
import { type Entry } from '../../records/entry';
import { type CastData } from '../castData';
import { type CharacterHistoryLine } from '../characterRecords';
import { documentChooser, documentName, formatMediumDate, formatTimeOfDay } from './parts';

/** A record line in words, as the original app says it. */
export function recordWords(h: CharacterHistoryLine): string {
  const { label, from, to } = h;
  switch (h.action) {
    case 'created':
      return `Created the character “${label}”.`;
    case 'field':
      return to === 'removed'
        ? `Removed the field ${label} (it said “${from}”).`
        : from.length > 0
          ? to.length > 0
            ? `Changed ${label} from “${from}” to “${to}”.`
            : `Cleared ${label} (it said “${from}”).`
          : `Set ${label} to “${to}”.`;
    case 'identity':
      return from.length > 0
        ? to.length > 0
          ? `Changed ${label} from “${from}” to “${to}”.`
          : `Cleared ${label} (it was “${from}”).`
        : `Set ${label} to “${to}”.`;
    case 'section':
      return `Section “${label}” ${to}.`;
    case 'archived':
      return 'Archived the character.';
    case 'restored':
      return 'Restored the character from the archive.';
    case 'portrait':
      return `Portrait ${label}.`;
    case 'template':
      return `Applied the layout “${label}” (${to}).`;
    case 'note':
      return `Added the field ${label}, ${to}.`;
    default:
      return label;
  }
}

/** A line of "In the story": a milestone (removable), a relationship's stage, or a timeline event. */
export type StoryLine = {
  key: string;
  /** Where in reading order (-1 before the story; a large number when not placed). */
  at: number;
  nodeId: string | null;
  text: string;
  source: 'Milestone' | 'Relationship' | 'Timeline event';
  /** The milestone's id, for removeMilestone; null for lines that belong to other records. */
  removable: string | null;
  /** Beside it: the chapter's title, or "Before the story" / "Not placed". */
  where: string;
  removeTooltip: string | null;
};

/** What happens to the character, in reading order: their milestones, their relationships' stages, and the events
 * they take part in. */
export function storyLines(cast: CastData, entry: Entry): StoryLine[] {
  const lines = cast.history(entry.id);
  const place = (nodeId: string | null) =>
    nodeId === null ? -1 : (cast.model.order.position.get(nodeId) ?? 2 ** 30);
  const where = (nodeId: string | null, at: number) =>
    nodeId !== null && cast.model.nodes.has(nodeId)
      ? documentName(cast, nodeId)
      : at < 0
        ? 'Before the story'
        : 'Not placed';
  const story: Omit<StoryLine, 'where' | 'removeTooltip'>[] = [];
  for (const h of lines) {
    if (h.isStory) {
      story.push({ key: h.id, at: place(h.nodeId), nodeId: h.nodeId, text: h.text, source: 'Milestone', removable: h.id });
    }
  }
  for (const relation of cast.model.relations.values()) {
    if (relation.fromId !== entry.id && relation.toId !== entry.id) continue;
    const other = cast.nameOf(relation.fromId === entry.id ? relation.toId : relation.fromId);
    if (other === null) continue;
    sortedStages(relation, cast.model.order).forEach((stage, i) => {
      story.push({
        key: `${relation.id}-${stage.id}`,
        at: place(stage.startNodeId),
        nodeId: stage.startNodeId,
        text:
          `${i === 0 ? 'Relationship with' : 'Relationship changes with'} ${other}: ` +
          `${stage.title.length > 0 ? stage.title : stage.label.length > 0 ? stage.label : 'related'}`,
        source: 'Relationship',
        removable: null,
      });
    });
  }
  for (const event of cast.model.events.values()) {
    if (!event.characters.some((c) => c.id === entry.id)) continue;
    story.push({
      key: event.id,
      at: event.nodeIds.length === 0 ? 2 ** 30 - 1 : event.nodeIds.map(place).reduce((a, b) => (a < b ? a : b)),
      nodeId: event.nodeIds[0] ?? null,
      text: event.name,
      source: 'Timeline event',
      removable: null,
    });
  }
  return stableSorted(story, (a, b) => a.at - b.at).map((l) => ({
    ...l,
    where: where(l.nodeId, l.at),
    removeTooltip: l.removable === null ? null : `Remove the milestone ${l.text}`,
  }));
}

/** When a record line was written: "Tue, Nov 17, 3:04 PM" (the app's English, local time). */
export function historyWhen(at: number): string {
  const t = new Date(Math.trunc(at));
  return `${formatMediumDate(t)}, ${formatTimeOfDay(t)}`;
}

/** "Changes to the record": the record lines, newest first, each in words and with when. */
export function recordLines(cast: CastData, entry: Entry): { line: CharacterHistoryLine; text: string; when: string }[] {
  return cast
    .history(entry.id)
    .filter((h) => !h.isStory)
    .map((h) => ({ line: h, text: recordWords(h), when: historyWhen(h.at) }));
}

/** The tab's boxes and the milestone form. */
export function historyWords(
  cast: CastData,
  entry: Entry,
  nodeId: string | null,
): {
  story: { title: string; caption: string; lifeLink: { label: string; path: string }; empty: string };
  milestone: { label: string; hint: string; where: ReturnType<typeof documentChooser>; whereLabel: string; add: string };
  record: { title: string; caption: string; empty: string };
} {
  return {
    story: {
      title: 'In the story',
      caption:
        `What happens to ${entry.name}, in reading order. Lines from relationships and the timeline belong to those ` +
        'records; milestones are yours to write here.',
      lifeLink: { label: `${entry.name}’s whole life history`, path: `/visualize/history?who=${entry.id}` },
      empty: 'Nothing recorded yet.',
    },
    milestone: {
      label: 'A milestone in the story',
      hint: 'Became commander of the guard',
      where: documentChooser(cast, nodeId, 'Before the story / not placed'),
      whereLabel: 'Where',
      add: 'Add milestone',
    },
    record: {
      title: 'Changes to the record',
      caption:
        'What you have done to this profile, newest first. Changes made before this history existed are not listed: ' +
        'nothing here is reconstructed.',
      empty: 'No changes recorded yet.',
    },
  };
}
