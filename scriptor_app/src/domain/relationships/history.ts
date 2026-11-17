// A relationship's history in words. A port of flutter_app/lib/shared/domain/relationships/history.dart.

import { type StoryOrder, sortedStages } from '../model/storyOrder';
import { type CharacterRelation, type RelationStage } from '../records/relation';
import { dartToLowerCase } from '../text/dartString';
import { type TrackedAttribute, feelingLabel } from './relationTypes';

/** A stage and where in the book it applies, in words. */
export class TimelineEntry {
  constructor(
    readonly stage: RelationStage,
    /** "Chapters 1–10", "Chapter 11", "Chapters 21+", "Stage 3, chapter not said". */
    readonly range: string,
    /** The starting point no longer exists in the manuscript. */
    readonly orphaned: boolean,
  ) {}
}

/** A relationship's history as labelled chapter ranges, as the original app reads it. A stage whose chapter is not
 * said claims no range, and the one before it reads "From chapter N". */
export function timelineOf(relation: CharacterRelation, order: StoryOrder): TimelineEntry[] {
  const stages = sortedStages(relation, order);
  const total = order.chapters.length;
  const first = (s: RelationStage) => (s.startNodeId === null ? 1 : (order.chapterNumber.get(s.startNodeId) ?? 1));
  return stages.map((stage, i) => {
    if (stage.startUnknown) {
      return new TimelineEntry(stage, total === 0 ? `Stage ${i + 1}` : `Stage ${i + 1}, chapter not said`, false);
    }
    const max = total > 1 ? total : 1;
    const from = first(stage) < max ? first(stage) : max;
    const following = stages.slice(i + 1);
    const next = following.find((s) => !s.startUnknown) ?? null;
    const open = following.length > 0 && following[0].startUnknown;
    const to = next === null ? null : first(next) - 1 > from ? first(next) - 1 : from;
    const range =
      total === 0
        ? i === stages.length - 1 && i === 0
          ? 'Whole story'
          : `Stage ${i + 1}`
        : open
          ? `From chapter ${from}`
          : to === null
            ? from >= total
              ? `Chapter ${from}+`
              : `Chapters ${from}+`
            : to === from
              ? `Chapter ${from}`
              : `Chapters ${from}–${to}`;
    return new TimelineEntry(stage, range, stage.startNodeId !== null && !order.position.has(stage.startNodeId));
  });
}

/** A stage's type in words: its label, or "Related". */
export function stageTypeLabel(stage: RelationStage): string {
  return stage.label.length === 0 ? 'Related' : stage.label;
}

/** What a stage changes from the one before it, in words: type, feeling, each tracked attribute each way, title. */
export function stageDifferences(
  before: RelationStage | null,
  stage: RelationStage,
  args: { fromName: string; toName: string; attributes?: readonly TrackedAttribute[] },
): string[] {
  if (before === null) return [];
  const out: string[] = [];
  const said = (v: number | null) => (v === null ? 'not said' : `${v}`);
  if (stageTypeLabel(before) !== stageTypeLabel(stage)) {
    out.push(`type: ${stageTypeLabel(before)} → ${stageTypeLabel(stage)}`);
  }
  if (before.affinity !== stage.affinity) {
    out.push(`feeling: ${feelingLabel(before.affinity)} → ${feelingLabel(stage.affinity)}`);
  }
  for (const a of args.attributes ?? []) {
    for (const [side, who, toward] of [
      ['from', args.fromName, args.toName],
      ['to', args.toName, args.fromName],
    ] as const) {
      const was = side === 'from' ? before.attribute(a.key).from : before.attribute(a.key).to;
      const now = side === 'from' ? stage.attribute(a.key).from : stage.attribute(a.key).to;
      if (was !== now) out.push(`${who}’s ${dartToLowerCase(a.label)} toward ${toward}: ${said(was)} → ${said(now)}`);
    }
  }
  if (before.title !== stage.title && stage.title.length > 0) out.push(`now called “${stage.title}”`);
  return out;
}

/** How one side describes the other under a stage: "Mentor", "Rival"… */
export function roleOf(stage: RelationStage, relation: CharacterRelation, entryId: string): string {
  const role = relation.fromId === entryId ? stage.fromRole : stage.toRole;
  return role.length > 0 ? role : stage.label.length > 0 ? stage.label : 'Related';
}
