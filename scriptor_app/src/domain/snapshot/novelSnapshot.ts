// A whole novel as one JSON document: its details and every record it owns, grouped by collection. The unit of backup,
// export, import and duplication, in the same `.novel.json` format the Flutter app writes (format version 4).
// A port of flutter_app/lib/shared/domain/snapshot/novel_snapshot.dart.
//
// It keeps everything: collections Scriptor does not know, fields on records it does not know, and top-level keys it
// does not know. Reading and then writing a file changes nothing but the upgrades below.

import { type JsonMap, deepCopy, deepFreeze, idOrNull, isMap, jsonEquals, mapOrNull, numOrNull, str } from '../json';
import { upgradeBlueprintShape } from '../records/blueprintShape';
import { nodeStatusOf, upgradeNodeStatus } from '../records/nodeStatus';
import { knownCollectionNames, novelCollections } from './collections';

/** Why a file cannot be read as a novel. Nothing is imported when this is thrown. */
export class SnapshotError extends Error {
  constructor(readonly reason: string) {
    super(`This file cannot be opened: ${reason}.`);
    this.name = 'SnapshotError';
  }
}

export const snapshotFormat = 'novel-builder/project';

/** The version Scriptor reads and writes. Versions 1–3 are upgraded on the way in; newer ones are refused. */
export const currentSnapshotVersion = 4;

const knownTopLevel = new Set(['format', 'version', 'exportedAt', 'project', 'collections']);

export class NovelSnapshot {
  readonly project: JsonMap;
  readonly collections: Readonly<Record<string, readonly JsonMap[]>>;
  readonly exportedAt: number;
  /** Top-level keys of the file other than the known ones, kept as they were. */
  readonly extra: JsonMap;

  constructor(args: {
    project: JsonMap;
    collections: Record<string, readonly JsonMap[]>;
    exportedAt?: number;
    extra?: JsonMap;
  }) {
    this.project = deepFreeze(args.project);
    const collections: Record<string, readonly JsonMap[]> = {};
    for (const [name, rows] of Object.entries(args.collections)) collections[name] = deepFreeze([...rows]);
    this.collections = Object.freeze(collections);
    this.exportedAt = args.exportedAt ?? 0;
    this.extra = deepFreeze(args.extra ?? {});
  }

  get projectId(): string {
    return str(this.project['id']);
  }

  rows(collection: string): readonly JsonMap[] {
    return this.collections[collection] ?? [];
  }

  /** Collections in the file that Scriptor has never heard of. They are kept and exported unchanged. */
  get unknownCollections(): string[] {
    return Object.entries(this.collections)
      .filter(([name, rows]) => !knownCollectionNames.has(name) && rows.length > 0)
      .map(([name]) => name);
  }

  copyWith(args: {
    project?: JsonMap;
    collections?: Record<string, readonly JsonMap[]>;
    exportedAt?: number;
  }): NovelSnapshot {
    return new NovelSnapshot({
      project: args.project ?? this.project,
      collections: args.collections ?? this.collections,
      exportedAt: args.exportedAt ?? this.exportedAt,
      extra: this.extra,
    });
  }

  /** The same snapshot with one collection's rows replaced. */
  withRows(collection: string, rows: readonly JsonMap[]): NovelSnapshot {
    return this.copyWith({ collections: { ...this.collections, [collection]: rows } });
  }

  /** Replaces (by id) or adds one row. */
  putRow(collection: string, row: JsonMap): NovelSnapshot {
    const list = this.rows(collection);
    const at = list.findIndex((r) => r['id'] === row['id']);
    return this.withRows(collection, at < 0 ? [...list, row] : [...list.slice(0, at), row, ...list.slice(at + 1)]);
  }

  toJson(exportedAt?: number): JsonMap {
    const collections: JsonMap = {};
    // Every known collection is written, empty or not, as the Flutter app does, in its order.
    for (const [name] of novelCollections) collections[name] = deepCopy(this.rows(name));
    for (const [name, rows] of Object.entries(this.collections)) {
      if (!knownCollectionNames.has(name)) collections[name] = deepCopy(rows);
    }
    return {
      ...deepCopy(this.extra),
      format: snapshotFormat,
      version: currentSnapshotVersion,
      exportedAt: exportedAt ?? this.exportedAt,
      project: deepCopy(this.project),
      collections,
    };
  }

  /** Reads a decoded `.novel.json` file. Throws SnapshotError with a reason when it cannot be read safely; nothing is
   * partly read. */
  static fromJson(json: unknown): NovelSnapshot {
    const file = mapOrNull(json);
    if (!file) throw new SnapshotError('it is not a JSON object');
    if (file['format'] !== snapshotFormat) throw new SnapshotError('it is not a novel file');
    const version = file['version'];
    if (typeof version !== 'number') throw new SnapshotError('it does not say which version of the format it uses');
    if (version > currentSnapshotVersion) {
      throw new SnapshotError(
        `it was made by a newer version of the app (format ${version}; Scriptor reads up to ${currentSnapshotVersion})`,
      );
    }
    const project = mapOrNull(file['project']);
    if (!project) throw new SnapshotError('it has no novel details');
    if (idOrNull(project['id']) === null) throw new SnapshotError('its novel has no id');

    const raw = file['collections'];
    if (raw !== undefined && raw !== null && !isMap(raw)) throw new SnapshotError('its records are not grouped by kind');
    const collections: Record<string, JsonMap[]> = {};
    const unreadable: string[] = [];
    for (const [name, value] of Object.entries(mapOrNull(raw) ?? {})) {
      if (!Array.isArray(value)) throw new SnapshotError(`its ${name} are not a list`);
      const readable = value.filter((r): r is JsonMap => isMap(r) && typeof r['id'] === 'string');
      if (readable.length < value.length) {
        const n = value.length - readable.length;
        unreadable.push(`${n} ${n === 1 ? 'record' : 'records'} in ${name}`);
      }
      const seen = new Set<unknown>();
      for (const r of readable) {
        if (seen.has(r['id'])) throw new SnapshotError(`two records in ${name} share the id ${r['id']}`);
        seen.add(r['id']);
      }
      collections[name] = readable;
    }
    if (unreadable.length > 0) {
      throw new SnapshotError(`${unreadable.join(', ')} cannot be read (no id, or not a record)`);
    }

    const extra: JsonMap = {};
    for (const [key, value] of Object.entries(file)) if (!knownTopLevel.has(key)) extra[key] = value;
    return applySnapshotUpgrades(
      new NovelSnapshot({ project, collections, exportedAt: numOrNull(file['exportedAt']) ?? 0, extra }),
    );
  }
}

/** Upgrades applied to every snapshot on the way in. Each is safe to run on data already in shape, so they run for
 * every file, as the original app's import did, and none drops anything. */
export const snapshotUpgrades: ReadonlyArray<{ name: string; run: (s: NovelSnapshot) => NovelSnapshot }> = [
  // Original schema v8: a five-step progress plus a separate publication tag became one status pipeline.
  { name: 'chapter status pipeline', run: upgradeChapterStatus },
  // Original format v4: a blueprint's ranks and table rows and columns gained ids; items point at `rankId`.
  { name: 'blueprint ranks and tables by id', run: upgradeBlueprints },
];

export function applySnapshotUpgrades(snapshot: NovelSnapshot): NovelSnapshot {
  return snapshotUpgrades.reduce((s, step) => step.run(s), snapshot);
}

function upgradeChapterStatus(s: NovelSnapshot): NovelSnapshot {
  const inShape = (r: JsonMap) => !('publication' in r) && nodeStatusOf(r['status']) !== null;
  if (s.rows('chapters').every(inShape)) return s;
  return s.withRows(
    'chapters',
    s.rows('chapters').map((r) => {
      if (inShape(r)) return r;
      const out: JsonMap = {};
      for (const [key, value] of Object.entries(r)) if (key !== 'publication') out[key] = value;
      out['status'] = upgradeNodeStatus(r['status'], r['publication']);
      return out;
    }),
  );
}

function upgradeBlueprints(s: NovelSnapshot): NovelSnapshot {
  const rows = s.rows('systems');
  if (rows.length === 0) return s;
  const upgraded = rows.map((r) => upgradeBlueprintShape(r));
  return jsonEquals(upgraded, rows) ? s : s.withRows('systems', upgraded);
}
