// The test novel the character tests change one step at a time, as the app does.

import { CharacterChanges } from '../../src/domain/characters/characterChanges';
import { type CharacterHistoryLine, type CharacterProfile } from '../../src/domain/characters/characterRecords';
import { type JsonMap } from '../../src/domain/json';
import { type Entry } from '../../src/domain/records/entry';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

/** One novel, changed one step at a time as the app does: each step on the records as they are, all of it or none. */
export class World {
  snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'Ashfall' }, collections: {} });
  clock = 1000000;
  private ids = 0;

  act<T>(change: (c: CharacterChanges) => T, advance = 1): T {
    this.clock += advance;
    const c = new CharacterChanges(this.snapshot, { now: this.clock, createId: () => `id${++this.ids}` });
    const result = change(c);
    this.snapshot = c.snapshot;
    return result;
  }

  get read(): CharacterChanges {
    return new CharacterChanges(this.snapshot, {
      now: this.clock,
      createId: () => {
        throw new Error('reading');
      },
    });
  }

  rows(collection: string): readonly JsonMap[] {
    return this.snapshot.rows(collection);
  }
  entry(id: string): Entry {
    return this.read.owned(id);
  }
  profile(id: string): CharacterProfile {
    return this.read.profileOf(this.read.character(id));
  }
  history(id: string): CharacterHistoryLine[] {
    return this.read.history(id);
  }
  createCharacter(name: string, o: { epithet?: string; roles?: string[]; templateId?: string } = {}): string {
    return this.act((c) => c.create({ name, ...o })).id;
  }
  chapter(id: string, o: { order?: number; mentions?: string[] } = {}): void {
    const order = o.order ?? 0;
    this.snapshot = this.snapshot.putRow('chapters', {
      id,
      projectId: 'novel',
      parentId: null,
      kind: 'chapter',
      title: id,
      order,
      mentions: o.mentions ?? [],
      createdAt: order,
    });
  }
  sectionId(entryId: string, index: number): string {
    return this.profile(entryId).sections[index].id;
  }
}
