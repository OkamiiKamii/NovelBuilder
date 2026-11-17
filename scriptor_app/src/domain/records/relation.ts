// Relationships between two codex entries, with their history (`characterRelations`). A port of
// flutter_app/lib/shared/domain/records/relation.dart.

import { type JsonMap, idOrNull, mapOrNull, str } from '../json';
import { JsonRecord, freezeMap, intOrNull, maps } from './jsonRecord';

/** One state of a relationship, from one point in the story until the next stage begins. A relationship's history is
 * its list of stages: nothing is overwritten when it changes, a stage is added. */
export class RelationStage {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  /** The volume, arc or chapter where this state begins, by permanent id; null: from the start of the story. */
  get startNodeId(): string | null {
    return idOrNull(this.raw['startNodeId']);
  }
  /** Where the reader meets this change is not said: it follows the stage recorded before it. */
  get startUnknown(): boolean {
    return this.raw['startUnknown'] === true;
  }
  get preset(): string {
    return str(this.raw['preset'], 'custom');
  }
  get category(): string {
    return str(this.raw['category'], 'custom');
  }
  get label(): string {
    return str(this.raw['label']);
  }
  /** What the first character is to the second, and the second to the first. Equal when mutual. */
  get fromRole(): string {
    return str(this.raw['fromRole']);
  }
  get toRole(): string {
    return str(this.raw['toRole']);
  }
  get directional(): boolean {
    return this.raw['directional'] === true;
  }
  get title(): string {
    return str(this.raw['title']);
  }
  /** `hostile` … `trusting`, as the author set it. */
  get affinity(): string {
    return str(this.raw['affinity'], 'neutral');
  }
  /** What happened to bring this state about, in the author's words. */
  get event(): string {
    return str(this.raw['event']);
  }
  get notes(): string {
    return str(this.raw['notes']);
  }
  /** Tracked attributes at this stage, each way: how the first feels toward the second (`from`) and back (`to`). A
   * missing key or null value: not said. */
  get attributes(): JsonMap {
    return mapOrNull(this.raw['attributes']) ?? {};
  }
  /** One tracked attribute each way (0–10), or null for "not said". */
  attribute(key: string): { from: number | null; to: number | null } {
    const v = mapOrNull(this.attributes[key]) ?? {};
    return { from: intOrNull(v['from']), to: intOrNull(v['to']) };
  }
  /** When it changes in the story's own time: `{kind: event, eventId}` or `{kind: date, when}`. Null: not said. */
  get storyAt(): JsonMap | null {
    return mapOrNull(this.raw['storyAt']);
  }
  /** A timeline event the author says brought it about, and the chapter where it happens. */
  get causeEventId(): string | null {
    return idOrNull(this.raw['causeEventId']);
  }
  get causeNodeId(): string | null {
    return idOrNull(this.raw['causeNodeId']);
  }
}

/** A relationship between two codex entries, with its history. It refers to them by id only, and is deleted with
 * either of them. Direction is the author's: A may see B as a rival while B sees A as a friend (two roles, or two
 * relationships), and nothing is ever inferred. */
export class CharacterRelation extends JsonRecord {
  get fromId(): string {
    return str(this.raw['fromId']);
  }
  get toId(): string {
    return str(this.raw['toId']);
  }
  get stages(): RelationStage[] {
    return maps(this.raw['stages']).map((s) => new RelationStage(s));
  }

  withFields(changes: JsonMap): CharacterRelation {
    return new CharacterRelation(this.merged(changes));
  }
}
