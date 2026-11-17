// The writer's own collections ("Custom Collection" in the Library): named shelves holding novels by id. Kept with the
// app's settings on this device, not inside any novel, so a backup of a novel does not carry them.

import { newId } from '../domain/ids';
import { isMap, listOf, str } from '../domain/json';
import type { CustomCollection } from '../domain/libraryView';
import type { SettingsStore } from './settingsStore';

const key = 'library.collections';

export class CollectionsStore {
  constructor(
    private readonly settings: SettingsStore,
    private readonly createId: () => string = newId,
  ) {}

  list(): CustomCollection[] {
    return listOf(this.settings.read(key))
      .filter(isMap)
      .map((c) => ({
        id: str(c['id']),
        name: str(c['name']),
        novelIds: listOf(c['novelIds']).filter((v): v is string => typeof v === 'string'),
      }))
      .filter((c) => c.id && c.name);
  }

  private save(all: CustomCollection[]): void {
    this.settings.write(key, all);
  }

  create(name: string): CustomCollection {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A collection needs a name.');
    const made = { id: this.createId(), name: trimmed, novelIds: [] };
    this.save([...this.list(), made]);
    return made;
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A collection needs a name.');
    this.save(this.list().map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
  }

  /** Removes the collection only; its novels stay in the library. */
  remove(id: string): void {
    this.save(this.list().filter((c) => c.id !== id));
  }

  setMember(id: string, novelId: string, member: boolean): void {
    this.save(
      this.list().map((c) => {
        if (c.id !== id) return c;
        const rest = c.novelIds.filter((n) => n !== novelId);
        return { ...c, novelIds: member ? [...rest, novelId] : rest };
      }),
    );
  }

  /** Forgets novels that are no longer in the library. */
  prune(existing: ReadonlySet<string>): void {
    const all = this.list();
    const pruned = all.map((c) => ({ ...c, novelIds: c.novelIds.filter((n) => existing.has(n)) }));
    if (pruned.some((c, i) => c.novelIds.length !== all[i].novelIds.length)) this.save(pruned);
  }
}
