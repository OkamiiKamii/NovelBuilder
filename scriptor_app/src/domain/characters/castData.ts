// The open novel's characters and what their screens show about them, read from the stored records (without the
// chapter text). A port of `CastData` (and the pure parts of the providers around it) from
// flutter_app/lib/features/characters/characters_providers.dart. Nothing here is a copy that could drift: the app makes
// it again after every change to what it is made of (CharacterService.castSource; NovelStore.versionOf says when), and
// again when where names are on the page (namedIn.ts, read away from the screen) arrives.

import { categoriesOf, type RelatedEntry, relatedTo } from '../codex/codexChanges';
import { localeCompare } from '../collation';
import { str } from '../json';
import { deriveConnections } from '../model/connections';
import { StoryModel } from '../model/storyModel';
import { StateError } from '../model/deletePolicy';
import { stableSorted } from '../reader/stableSort';
import { Category } from '../records/category';
import { type Entry } from '../records/entry';
import { type Link } from '../records/link';
import { type StoryNode } from '../records/storyNode';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { type Listed, listCharacters } from './cast';
import { CharacterChanges } from './characterChanges';
import {
  type CharacterHistoryLine,
  type CharacterNote,
  CharacterProfile,
  type CharacterSecret,
  type CharacterTemplate,
} from './characterRecords';
import { namesToFind } from './namedIn';

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The cast of one novel, made from a snapshot of it (CharacterService.read: everything but the chapter text). */
export class CastData {
  readonly novelId: string;
  readonly snapshot: NovelSnapshot;
  /** Where each entry's name is on the page, by entry: chapters and scenes (namedIn.ts). */
  readonly named: ReadonlyMap<string, readonly string[]>;
  readonly model: StoryModel;
  /** As the original app reads them: in id order, which decides the order of characters with the same name. */
  readonly entries: readonly Entry[];
  /** Stored profiles by character (the one with the lowest id, when there are several). A character without one shows
   * the empty general layout. */
  readonly profiles: ReadonlyMap<string, CharacterProfile>;
  /** The links between two codex entries, in id order. */
  readonly links: readonly Link[];
  readonly list: readonly Listed[];
  readonly templates: readonly CharacterTemplate[];
  /** The fields every character of the novel shares (a genre's "Sanity", a template's "Power Rank"). */
  readonly characterCategory: Category;

  private readonly read: CharacterChanges;

  constructor(
    novelId: string,
    snapshot: NovelSnapshot,
    options: { named?: ReadonlyMap<string, readonly string[]> } = {},
  ) {
    this.novelId = novelId;
    this.snapshot = snapshot;
    this.named = options.named ?? new Map();
    this.model = StoryModel.fromSnapshot(snapshot);
    this.read = new CharacterChanges(snapshot, {
      now: 0,
      createId: () => {
        throw new StateError('Reading only.');
      },
    });
    this.entries = stableSorted(this.model.entries.values(), (a, b) => byText(a.id, b.id));
    const profiles = new Map<string, CharacterProfile>();
    for (const r of stableSorted(snapshot.rows('characterProfiles'), (a, b) => byText(str(b['id']), str(a['id'])))) {
      profiles.set(str(r['entryId']), new CharacterProfile(r));
    }
    this.profiles = profiles;
    this.links = stableSorted(
      this.model.links.filter((l) => l.isEntryLink),
      (a, b) => byText(a.id, b.id),
    );
    this.list = listCharacters(
      this.entries,
      this.profiles,
      this.links,
      this.model.nodes.values(),
      this.model.order.position,
      (e) => this.read.fresh(e),
      { named: this.named },
    );
    this.templates = this.read.templates();
    this.characterCategory = categoriesOf(snapshot).get('character') ?? Category.builtin('character');
  }

  private chapters: ReadonlyMap<string, ReadonlySet<number>> | null = null;

  /** For each entry, the chapters (by number) it is in: linked in their text, or named there. Worked out once for this
   * cast and shared. */
  chaptersOf(): ReadonlyMap<string, ReadonlySet<number>> {
    if (this.chapters !== null) return this.chapters;
    const out = new Map<string, Set<number>>();
    const add = (id: string, n: number) => {
      let set = out.get(id);
      if (set === undefined) out.set(id, (set = new Set()));
      set.add(n);
    };
    for (const node of this.model.nodes.values()) {
      const n = this.model.order.chapterNumber.get(node.id);
      if (n === undefined) continue;
      for (const id of node.mentions) add(id, n);
    }
    for (const [id, nodes] of this.named) {
      for (const node of nodes) {
        const n = this.model.order.chapterNumber.get(node);
        if (n !== undefined) add(id, n);
      }
    }
    return (this.chapters = out);
  }

  get novelTitle(): string {
    return str(this.snapshot.project['title']);
  }

  private connections: ReturnType<typeof deriveConnections> | null = null;

  /** Every connection the records make, read once per cast (and those pointing at something gone). */
  get derived(): ReturnType<typeof deriveConnections> {
    return (this.connections ??= deriveConnections(this.model));
  }

  listed(entryId: string): Listed | null {
    return this.list.find((l) => l.entry.id === entryId) ?? null;
  }

  nameOf(id: string): string | null {
    return this.model.entries.get(id)?.name ?? null;
  }

  secrets(entryId: string): CharacterSecret[] {
    return this.read.secrets(entryId);
  }

  notes(entryId: string): CharacterNote[] {
    return this.read.notes(entryId);
  }

  history(entryId: string): CharacterHistoryLine[] {
    return this.read.history(entryId);
  }

  /** Other characters, by name, for choosing who knows, who is related… */
  characters(options: { except?: string | null } = {}): Entry[] {
    return stableSorted(
      this.entries.filter((e) => e.category === 'character' && e.id !== options.except),
      (a, b) => localeCompare(a.name, b.name),
    );
  }

  private names: Record<string, string[]> | null = null;

  /** Every entry's names to find in the text (namesToFind), worked out once a cast. */
  get findNames(): Record<string, string[]> {
    return (this.names ??= namesToFind(this.entries, this.profiles));
  }

  private ids: string[] | null = null;

  /** The chapters and scenes, by id, in reading order: once a cast. */
  get documentIds(): string[] {
    return (this.ids ??= this.documents.map((n) => n.id));
  }

  /** Chapters and scenes in reading order, for choosing where something happens. */
  get documents(): StoryNode[] {
    return stableSorted(
      [...this.model.nodes.values()].filter((n) => n.kind === 'chapter' || n.kind === 'scene'),
      (a, b) => (this.model.order.position.get(a.id) ?? 0) - (this.model.order.position.get(b.id) ?? 0),
    );
  }

  relatedOf(entryId: string): RelatedEntry[] {
    return relatedTo(entryId, this.entries, this.links);
  }
}

/** Whether two readings of where names are hold the same (each a fresh map from the background, often the same): the
 * cast is made again only when they differ. */
export function sameNamed(
  a: ReadonlyMap<string, readonly string[]> | null,
  b: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (a === b) return true;
  if (a === null || a.size !== b.size) return false;
  for (const [key, value] of b) {
    const was = a.get(key);
    if (was === undefined || was.length !== value.length) return false;
    for (let i = 0; i < value.length; i++) if (was[i] !== value[i]) return false;
  }
  return true;
}

/** The collections where names are on the page is read from: it is read again only when one of them was written. */
export const namedInSource: readonly string[] = ['chapterContents', 'loreEntries', 'characterProfiles'];

/** The views of the cast (cards, a list, the ties, the orbit…), remembered on this device under `castViewKey`. */
export type CastView =
  | 'cards'
  | 'list'
  | 'ties'
  | 'orbit'
  | 'stakes'
  | 'arcs'
  | 'compass'
  | 'roll'
  | 'eyes'
  | 'entrances'
  | 'tableRead'
  | 'names';
export const castViews: readonly CastView[] = [
  'cards',
  'list',
  'ties',
  'orbit',
  'stakes',
  'arcs',
  'compass',
  'roll',
  'eyes',
  'entrances',
  'tableRead',
  'names',
];
export const castViewKey = 'characters.view';

/** The view remembered, cards when none (or one this version does not have). */
export function castViewOf(value: unknown): CastView {
  return castViews.find((v) => v === value) ?? 'cards';
}
