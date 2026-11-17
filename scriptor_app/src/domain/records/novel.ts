// A novel (the original app's `Project`): its metadata. A port of flutter_app/lib/shared/domain/records/novel.dart.
// The statuses, colours, genre suggestions and cleaning were ported before, in ../novel.ts, and are re-exported from
// there; this adds the record the model reads (Dart's `Novel extends JsonRecord`).

import { type JsonMap, numOrNull, str, strOrNull } from '../json';
import { type NovelStatus, novelStatusOf } from '../novel';
import { JsonRecord, boolOf, intOrNull, strings } from './jsonRecord';

export {
  type NovelStatus,
  genreSuggestions,
  normalizeNovelDetails,
  novelAccents,
  novelStatusLabel,
  novelStatusOf,
  novelStatuses,
  splitList,
} from '../novel';

/** A novel's details as a record. Everything else it owns lives in its own collections, each row naming it by
 * `projectId`. (../novel.ts has a lighter `Novel` the library screens use; this one is the model's.) */
export class Novel extends JsonRecord {
  /** A novel's own id is `id`; `projectId` reads the same, so code can treat it like any other row. */
  override get projectId(): string {
    return this.id;
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get subtitle(): string {
    return str(this.raw['subtitle']);
  }
  get author(): string {
    return str(this.raw['author']);
  }
  get primaryGenre(): string {
    return str(this.raw['primaryGenre']);
  }
  get secondaryGenres(): string[] {
    return strings(this.raw['secondaryGenres']);
  }
  get tags(): string[] {
    return strings(this.raw['tags']);
  }
  get synopsis(): string {
    return str(this.raw['synopsis']);
  }
  get status(): NovelStatus {
    return novelStatusOf(this.raw['status']);
  }
  get targetWordCount(): number | null {
    return intOrNull(this.raw['targetWordCount']);
  }
  /** yyyy-mm-dd, or null. */
  get deadline(): string | null {
    return strOrNull(this.raw['deadline']);
  }
  get language(): string {
    return str(this.raw['language']);
  }
  get accent(): string {
    return str(this.raw['accent'], '#b4532a');
  }
  get pinned(): boolean {
    return boolOf(this.raw['pinned']);
  }
  get archived(): boolean {
    return boolOf(this.raw['archived']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }
  /** When it was last opened. Null: never, on this or any device it came from. */
  get lastOpenedAt(): number | null {
    return numOrNull(this.raw['lastOpenedAt']);
  }
  /** An http(s) image URL, or an uploaded image stored as a data URL. */
  get cover(): string | null {
    return strOrNull(this.raw['cover']);
  }
  /** Visualize views this novel has turned off, by key. Keys this version does not know are kept. */
  get viewsOff(): string[] {
    return strings(this.raw['viewsOff']);
  }

  withFields(changes: JsonMap): Novel {
    return new Novel(this.merged(changes));
  }
}
