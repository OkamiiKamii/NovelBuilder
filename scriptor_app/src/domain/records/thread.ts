// Plot threads (`plotThreads`). A port of flutter_app/lib/shared/domain/records/thread.dart.

import { type JsonMap, idOrNull, str, strOrNull } from '../json';
import { JsonRecord, freezeMap, maps, strings } from './jsonRecord';

export type ThreadStatus = 'planned' | 'active' | 'paused' | 'resolved' | 'abandoned' | 'retconned' | 'custom';
export const threadStatuses: readonly ThreadStatus[] = [
  'planned',
  'active',
  'paused',
  'resolved',
  'abandoned',
  'retconned',
  'custom',
];

/** What a beat is to its thread, as the author records it. A beat stored before roles existed is a development. */
export type BeatRole = 'introduction' | 'development' | 'intersection' | 'resolution' | 'appears';
export const beatRoles: readonly BeatRole[] = ['introduction', 'development', 'intersection', 'resolution', 'appears'];

/** One recorded development of a thread, in a chapter or scene. */
export class ThreadBeat {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get role(): BeatRole {
    return beatRoles.find((r) => r === this.raw['role']) ?? 'development';
  }
  /** For an intersection: the other threads it crosses here. */
  get withThreadIds(): string[] {
    return strings(this.raw['withThreadIds']);
  }
  /** A chapter or scene by id. Null while the author has not placed it. */
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

/** A storyline followed across the manuscript. It points at chapters, scenes and entries by id only and never changes
 * manuscript text. Its status is only ever set by the author; missing beats are never invented. */
export class PlotThread extends JsonRecord {
  get title(): string {
    return str(this.raw['title']);
  }
  get premise(): string {
    return str(this.raw['premise']);
  }
  get category(): string {
    return str(this.raw['category'], 'main');
  }
  get statusKey(): string {
    return str(this.raw['status'], 'planned');
  }
  get status(): ThreadStatus {
    return threadStatuses.find((s) => s === this.raw['status']) ?? 'planned';
  }
  /** The author's own name for a custom status. */
  get customStatus(): string | null {
    return strOrNull(this.raw['customStatus']);
  }
  get characterIds(): string[] {
    return strings(this.raw['characterIds']);
  }
  get locationIds(): string[] {
    return strings(this.raw['locationIds']);
  }
  /** Where it is meant to resolve: a volume, act, arc, chapter or scene. */
  get targetNodeId(): string | null {
    return idOrNull(this.raw['targetNodeId']);
  }
  get beats(): ThreadBeat[] {
    return maps(this.raw['beats']).map((b) => new ThreadBeat(b));
  }

  withFields(changes: JsonMap): PlotThread {
    return new PlotThread(this.merged(changes));
  }
}
