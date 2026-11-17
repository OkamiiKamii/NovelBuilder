// The story tree's nodes (`chapters`) and chapter plans (`chapterPlans`) as records. A port of
// flutter_app/lib/shared/domain/records/story_node.dart.
//
// The node kinds and the status pipeline were ported before (../outline.ts, ./nodeStatus.ts) and are re-exported from
// there. ../outline.ts also has a plain `StoryNode` object type for the outline's own edits (made by `storyNode(raw)`);
// the class here is Dart's record, which the model and everything built on it read. Both read the same row;
// `asOutlineNode` turns one into the other.

import { type JsonMap, idOrNull, numOrNull, str } from '../json';
import { type NodeKind, kindLabel, nodeKinds, type StoryNode as OutlineNode, storyNode as outlineNode } from '../outline';
import { type NodeStatusKey, upgradeNodeStatus } from './nodeStatus';
import { JsonRecord, freezeMap, intOrNull, maps, strings } from './jsonRecord';

export {
  type NodeKind,
  canContain,
  isDocument,
  isGroup,
  kindLabel,
  kindsInside,
  nodeKinds,
} from '../outline';
export { type NodeStatusKey, nodeStatusOf, nodeStatuses, upgradeNodeStatus } from './nodeStatus';

/** Dart's `NodeStatus`: the stored key (`idea` … `draft-complete` … `final`, `published`). */
export type NodeStatus = NodeStatusKey;

/** Dart's `NodeKind.of`. */
export function nodeKindOf(value: unknown): NodeKind | null {
  return nodeKinds.find((k) => k === value) ?? null;
}

/** One node of the story tree: a volume/act/arc, a chapter or a scene.
 *
 * STABLE ID RULE: structure is only `parentId` + `order`. Reordering or moving a node changes those two fields and
 * nothing else, so text, plans and every link (which hang off `id`) cannot be detached or mixed up.
 *
 * READING ORDER is this tree, read depth first. It is never the story's chronology: that lives on events. */
export class StoryNode extends JsonRecord {
  get parentId(): string | null {
    return idOrNull(this.raw['parentId']);
  }
  /** Null when the stored kind is not one this version knows (reported by validation; kept as stored). */
  get kind(): NodeKind | null {
    return nodeKindOf(this.raw['kind']);
  }
  get kindKey(): string {
    return str(this.raw['kind']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  /** Position among siblings. Never used to identify a node. */
  get order(): number {
    return numOrNull(this.raw['order']) ?? 0;
  }
  get summary(): string {
    return str(this.raw['summary']);
  }
  get notes(): string {
    return str(this.raw['notes']);
  }
  get status(): NodeStatus {
    return upgradeNodeStatus(this.raw['status'], this.raw['publication']);
  }
  /** Codex entries linked inside this node's text, kept up to date on every save. */
  get mentions(): string[] {
    return strings(this.raw['mentions']);
  }
  get wordCount(): number {
    return intOrNull(this.raw['wordCount']) ?? 0;
  }
  get charCount(): number {
    return intOrNull(this.raw['charCount']) ?? 0;
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  /** The name shown for it: its title, or "Untitled chapter" and the like. */
  get displayTitle(): string {
    const kind = this.kind;
    return this.title.length > 0 ? this.title : `Untitled ${kind === null ? 'item' : kindLabel[kind].toLowerCase()}`;
  }

  withFields(changes: JsonMap): StoryNode {
    return new StoryNode(this.merged(changes));
  }

  renamed(title: string): StoryNode {
    return this.withFields({ title });
  }

  /** Moves the node in the tree. Only `parentId` and `order` change. */
  movedTo(args: { parentId: string | null; order: number }): StoryNode {
    return this.withFields({ parentId: args.parentId, order: args.order });
  }
}

/** The outline's view of the same row. */
export function asOutlineNode(node: StoryNode): OutlineNode {
  return outlineNode(node.raw);
}

/** A planned beat of a chapter or scene. */
export class PlanBeat {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get text(): string {
    return str(this.raw['text']);
  }
}

/** The plan for a chapter or scene (`id` is the node's id). Kept apart from the manuscript text: nothing ever copies a
 * plan into the text. */
export class ChapterPlan extends JsonRecord {
  /** The chapter or scene this plans: plans share their node's id. */
  get nodeId(): string {
    return this.id;
  }
  get objective(): string {
    return str(this.raw['objective']);
  }
  get beats(): PlanBeat[] {
    return maps(this.raw['beats']).map((b) => new PlanBeat(freezeMap(b)));
  }
  /** Codex entries present in this chapter or scene, by their permanent ids. */
  get entityIds(): string[] {
    return strings(this.raw['entityIds']);
  }
  get labels(): string[] {
    return strings(this.raw['labels']);
  }
  /** Characters recorded as on the page here. A character is here or in `mentionIds`, not both. */
  get appearIds(): string[] {
    return strings(this.raw['appearIds']);
  }
  /** Characters recorded as mentioned but not on the page. */
  get mentionIds(): string[] {
    return strings(this.raw['mentionIds']);
  }
  /** Whose point of view it is told from, as the author records it. */
  get povIds(): string[] {
    return strings(this.raw['povIds']);
  }

  withFields(changes: JsonMap): ChapterPlan {
    return new ChapterPlan(this.merged(changes));
  }
}
