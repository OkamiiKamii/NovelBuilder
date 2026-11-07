export type Row = Record<string, unknown>;

/** What this device knew of a row the last time it agreed with the cloud. */
export interface BaseEntry {
  /** `${projectId}|${key}` */
  id: string;
  projectId: string;
  key: string;
  /** Fingerprint of the row then; null when it did not exist. */
  hash: string | null;
  /** The cloud's number for that version. */
  seq: number;
  /** The row itself, kept for everything except long text, so that changes to different fields can be combined. */
  row: Row | null;
}

export type ConflictKind = 'text' | 'fields' | 'removed';

export interface FieldConflict {
  field: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}

/**
 * ZERO SILENT DATA OVERWRITE RULE
 * Two devices changed the same thing. Nothing has been chosen for the
 * author: this device still has its own version exactly as it was, and the
 * cloud's version is held here, in full, until the author says which stands.
 */
export interface SyncConflict {
  id: string;
  projectId: string;
  key: string;
  table: string;
  rowId: string;
  kind: ConflictKind;
  /** What both started from, when this device still has it. */
  base: Row | null;
  /** This device's version when the conflict was found. Null: deleted here. */
  local: Row | null;
  /** The cloud's version. Null: deleted there. */
  remote: Row | null;
  remoteSeq: number;
  /** For `fields`: the fields that differ in both. Fields changed on only one side have already been combined. */
  fields: FieldConflict[];
  /** The other fields, already combined: what the row will be once the conflicting fields are settled. */
  merged: Row | null;
  /** A name for the thing in conflict: a chapter's title, an entry's name. */
  label: string;
  remoteDevice: string;
  detectedAt: number;
}

export type SyncStatus = 'off' | 'synced' | 'syncing' | 'offline' | 'conflict' | 'error';
export const STATUS_LABELS: Record<SyncStatus, string> = { off: 'Not synced', synced: 'Synced', syncing: 'Syncing', offline: 'Offline', conflict: 'Conflict detected', error: 'Could not sync' };

/** Where one project stands with the cloud, on this device. */
export interface SyncState {
  /** The project id. */
  id: string;
  projectId: string;
  enabled: boolean;
  /** The last change number taken in from the cloud. */
  cursor: number;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Local changes not yet sent. */
  pending: number;
  syncing: boolean;
  /** Changes the cloud refused because this person's role does not allow them. They stay on this device and are reported once. */
  denied?: string[];
}

export interface SyncLogEntry {
  id: string;
  projectId: string;
  at: number;
  /** Order within the same moment. */
  seq: number;
  kind: 'sync' | 'conflict' | 'resolved' | 'restore' | 'settings' | 'error';
  message: string;
  /** Anything worth keeping with the entry, such as a setting that was replaced. */
  detail?: string;
}

export interface SyncSummary {
  pulled: number;
  pushed: number;
  merged: number;
  conflicts: number;
  /** Changes refused for lack of permission. */
  denied: number;
}

/**
 * Measurements that two devices both add to, and how the two are combined.
 * A writing session continued on a second device is the plain case: the words
 * counted on each device add up, the session began at the earlier start and
 * was last active at the later moment. Nothing an author wrote is involved,
 * and no count is lost, so these are combined without asking.
 */
export const TALLIES: Record<string, Record<string, 'sum' | 'min' | 'max'>> = {
  writingSessions: { netWords: 'sum', added: 'sum', removed: 'sum', saves: 'sum', startedAt: 'min', lastActiveAt: 'max' },
};

/** Fields that differ between devices by their nature and are never compared or sent as changes. */
export const IGNORED: Record<string, string[]> = {
  '*': ['updatedAt'],
  projects: ['lastOpenedAt'],
  // Counts and link lists are worked out from the text on each device.
  chapters: ['wordCount', 'charCount', 'mentions'],
  // A device's own save counter and clock.
  chapterContents: ['rev', 'savedAt'],
};
/** Tables whose rows are long text: compared as a whole, and settled with the text tools. */
export const TEXT_TABLES = ['chapterContents'];
/** Tables too bulky to keep a second copy of for combining fields. */
export const NO_BASE_ROW = ['chapterContents', 'chapterRevisions', 'chapterBranches'];
