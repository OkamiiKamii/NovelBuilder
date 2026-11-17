// Modules in a novel: every change one transaction, made on the records as stored at that moment; where the core
// pages a module points at are; the Module Manager's and a workspace's addresses; and ToolData, everything a module's
// tools read in the terms modules use (categories and fields by name). A port of
// flutter_app/lib/features/modules/module_service.dart (its pure parts; the toast on a refusal is the screen's).

import type { CharacterStore } from '../characters/characterService';
import { displayValue } from '../codex/fieldValues';
import { localeCompare } from '../exchange/collation';
import { newId as makeId } from '../ids';
import { type JsonMap } from '../json';
import { StateError } from '../model/deletePolicy';
import { StoryModel } from '../model/storyModel';
import { readingOrder } from '../model/storyOrder';
import { isDocument } from '../outline';
import { type Category, type FieldDef } from '../records/category';
import { type Entry, viewFields } from '../records/entry';
import { type StoryNode } from '../records/storyNode';
import { knownCollectionNames } from '../snapshot/collections';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartSort } from '../manuscript/dartSort';
import { ModuleChanges } from './moduleChanges';
import { type Bindings, resolveCategory, resolveField } from './moduleDefs';

/** Everything but the chapters' text: what modules read and change. */
export const moduleCollections: ReadonlySet<string> = new Set(
  [...knownCollectionNames].filter((c) => !['chapterContents', 'chapterRevisions', 'chapterBranches'].includes(c)),
);

export class ModuleService {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  read(novelId: string): NovelSnapshot | null {
    return this.store.loadPart(novelId, moduleCollections);
  }

  /** Applies `apply` to the novel as stored now and saves the result in one transaction (nothing is saved when it
   * throws: a ChangeRefused is said by the screen). */
  change<T>(novelId: string, apply: (m: ModuleChanges) => T): T {
    const before = this.read(novelId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new ModuleChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }
}

/** Where a core page a module points at is in this app (the Flutter app's paths; the screens map those not built yet). */
export function corePagePath(to: string): string | null {
  switch (to) {
    case 'systems':
      return '/organize/systems';
    case 'progression':
      return '/visualize/progression';
    case 'graph':
      return '/visualize/graph';
    case 'timeline':
      return '/plan';
    case 'relationships':
      return '/visualize';
    case 'plot':
      return '/plan/threads';
    case 'canon':
      return '/review/canon';
    case 'characters':
      return '/organize';
    case 'branches':
      return '/plan/histories';
    case 'continuity':
      return '/review/continuity';
    default:
      return null;
  }
}

/** The address of the Module Manager, and of one module's workspace (its dashboard, or one of its tools). */
export const modulesPath = '/organize/modules';

/** Dart's `Uri.encodeComponent` (RFC 2396's unreserved characters stay, as with encodeURIComponent). */
const encode = (s: string): string => encodeURIComponent(s);

export function modulePath(moduleId: string, options: { tool?: string | null; record?: string | null } = {}): string {
  const query: string[] = [];
  if (options.tool !== null && options.tool !== undefined) query.push(`tool=${encodeQuery(options.tool)}`);
  if (options.record !== null && options.record !== undefined) query.push(`record=${encodeQuery(options.record)}`);
  return `${modulesPath}/${encode(moduleId)}${query.length === 0 ? '' : `?${query.join('&')}`}`;
}

/** Dart's query encoding: a space is `+`; letters, digits and `-._~` stay; everything else is %-escaped. */
function encodeQuery(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Everything a module's tools read, in the terms modules use: categories and fields by name. */
export class ToolData {
  readonly model: StoryModel;
  /** Chapters and scenes in reading order. */
  readonly documents: { node: StoryNode; depth: number }[];
  private readonly positions: Map<string, number>;

  constructor(
    readonly novelId: string,
    readonly snapshot: NovelSnapshot,
    readonly bindings: Bindings | null,
  ) {
    this.model = StoryModel.fromSnapshot(snapshot);
    const reading = readingOrder(this.model.nodes.values());
    const depth = new Map<string, number>();
    for (const n of reading) {
      depth.set(n.id, n.parentId !== null && depth.has(n.parentId) ? depth.get(n.parentId)! + 1 : 0);
    }
    this.documents = reading.filter((n) => isDocument(n.kind)).map((node) => ({ node, depth: depth.get(node.id)! }));
    this.positions = new Map(this.documents.map((d, i) => [d.node.id, i]));
  }

  get categories(): Category[] {
    return [...this.model.categories.values()];
  }
  get entries(): Entry[] {
    return [...this.model.entries.values()];
  }
  get records(): readonly JsonMap[] {
    return this.snapshot.rows('moduleRecords');
  }

  /** A category by the name a module uses for it. */
  category(name: string): Category | null {
    return resolveCategory(name, this.categories, this.bindings);
  }

  entriesOf(category: Category | null): Entry[] {
    if (category === null) return [];
    return dartSort(
      [...this.model.entries.values()].filter((e) => e.category === category.key),
      (a, b) => localeCompare(a.name, b.name),
    );
  }

  /** A field by the name a module uses for it. `as` is the module's name for the category. */
  field(category: Category | null, name: string, as?: string | null): FieldDef | null {
    return resolveField(as ?? category?.name ?? '', category, name, this.bindings);
  }

  /** An entry's stored value for a field, as text. */
  raw(entry: Entry, category: Category, def: FieldDef): string {
    return viewFields(entry, category).category.find(([d]) => d.id === def.id)?.[1]?.value ?? '';
  }

  /** The same, as a reader should see it. */
  shown(entry: Entry, category: Category, def: FieldDef): string {
    return displayValue(def.type, this.raw(entry, category, def), (id) => this.model.entries.get(id)?.name ?? null);
  }

  /** Where a chapter or scene is in reading order: before everything when there is none, after everything when it is
   * not a chapter or scene of this novel. */
  position(nodeId: string | null): number {
    return nodeId === null ? -1 : (this.positions.get(nodeId) ?? 2 ** 52);
  }
}
