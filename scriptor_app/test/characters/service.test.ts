// The character service on the app's own stores: a port of flutter_app/test/features/characters/character_service_test.dart
// and the logic of name_mentions_test.dart (the figure itself is a widget's).

import { openLibrary } from '../../src/data/library';
import { StaleWriteError, putRow } from '../../src/data/novelStore';
import { CharacterProfile, CharacterSecret } from '../../src/domain/characters/characterRecords';
import { CharacterService } from '../../src/domain/characters/characterService';
import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { setIdGenerator } from '../../src/domain/ids';
import { type JsonMap, jsonEquals, numOrNull } from '../../src/domain/json';
import { textToDoc } from '../../src/domain/prose';
import { testIds } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

setIdGenerator(testIds());

const linked = (text: string, entryId: string): JsonMap => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: null },
      content: [{ type: 'text', text, marks: [{ type: 'entityLink', attrs: { entryId } }] }],
    },
  ],
});

function setup() {
  let now = Date.UTC(2026, 9, 24, 9);
  const clock = () => now;
  const lib = openLibrary(memoryLibrary(), clock, testIds());
  const { novel } = lib.library.create({ title: 'T' });
  const characters = new CharacterService(lib.novels, lib.backups, { clock, createId: testIds() });
  return { lib, store: lib.novels, characters, p: novel.id, advance: (ms: number) => (now += ms), now: () => now };
}

test('a change is saved in one go, builds on the one before, and marks the novel as changed', () => {
  const { store, characters, p, advance, now } = setup();
  const kael = characters.change(p, (c) => c.create({ name: 'Kael', roles: ['Protagonist'] }));
  advance(60000);
  characters.change(p, (c) => c.identity(kael.id, { epithet: 'The Oathbreaker' }));
  const profile = new CharacterProfile(store.rowsIn(p, 'characterProfiles')[0]);
  expect([profile.epithet, profile.roles[0]]).toEqual(['The Oathbreaker', 'Protagonist']);
  expect(numOrNull(store.novel(p)!.raw['updatedAt'])).toBe(now());
  // A refused change writes nothing at all.
  const before = store.load(p)!.toJson();
  expect(() => characters.change(p, (c) => c.addSection(kael.id, ' '))).toThrow(ChangeRefused);
  expect(jsonEquals(store.load(p)!.toJson(), before)).toBe(true);
});

test('a change never overwrites something saved elsewhere since it was read', () => {
  const { store, characters, p } = setup();
  const kael = characters.change(p, (c) => c.create({ name: 'Kael' }));
  expect(() =>
    characters.change(p, (c) => {
      c.addSection(kael.id, 'Magic');
      // Someone else saves the same profile while this change is being made.
      store.writeRows(p, [putRow('characterProfiles', { ...store.rowsIn(p, 'characterProfiles')[0], epithet: 'Elsewhere' })]);
    }),
  ).toThrow(StaleWriteError);
  expect(new CharacterProfile(store.rowsIn(p, 'characterProfiles')[0]).epithet).toBe('Elsewhere');
});

test('a character change does not load or touch chapter text', () => {
  const { lib, store, characters, p } = setup();
  const chapter = lib.manuscript.create(p, 'chapter', null, 'One');
  const kael = characters.change(p, (c) => c.create({ name: 'Kael' }));
  lib.manuscript.save(p, chapter.id, linked('Kael', kael.id), { baseRev: 0 });
  const text = store.row(p, 'chapterContents', chapter.id);
  characters.change(p, (c) => c.identity(kael.id, { name: 'Kael Draven' }));
  expect(jsonEquals(store.row(p, 'chapterContents', chapter.id), text)).toBe(true);
  expect(characters.read(p)!.rows('chapterContents')).toEqual([]);
  expect(characters.nameMentions(p, ['Kael Draven', 'Kael'])).toBe(1);
});

test('a profile counts how often the name is written, from the saved chapters (name_mentions_test.dart)', () => {
  const { lib, characters, p } = setup();
  const one = lib.manuscript.create(p, 'chapter', null, 'One');
  lib.manuscript.save(p, one.id, textToDoc('Kael ran. “Kael!” she called.\n\nKaelen did not answer.'), { baseRev: 0 });
  const two = lib.manuscript.create(p, 'chapter', null, 'Two');
  lib.manuscript.save(p, two.id, textToDoc('Then Kael slept.'), { baseRev: 0 });
  characters.change(p, (c) => c.create({ name: 'Kael' }));
  // Twice in the first chapter (not in “Kaelen”), once in the second.
  expect(characters.nameMentions(p, ['Kael'])).toBe(3);
});

test('deleting asks nothing of the text, keeps a restore point, and Undo brings everything back', () => {
  const { lib, store, characters, p } = setup();
  const chapter = lib.manuscript.create(p, 'chapter', null, 'One');
  const kael = characters.change(p, (c) => c.create({ name: 'Kael' }));
  const mira = characters.change(p, (c) => c.create({ name: 'Mira' }));
  lib.manuscript.save(p, chapter.id, linked('Kael', kael.id), { baseRev: 0 });
  characters.change(p, (c) => c.saveSecret(mira.id, null, { title: 'Spy', knows: [kael.id] }));
  expect(characters.references(p, kael.id).get('chapters')).toBe(1);
  const before = store.load(p)!;
  const kept = characters.delete(p, kael.id, { name: 'Kael' });
  expect(store.row(p, 'loreEntries', kael.id)).toBeNull();
  expect(new CharacterSecret(store.rowsIn(p, 'characterSecrets')[0]).knows).toEqual([]);
  expect(store.row(p, 'chapterContents', chapter.id)!['doc']).toEqual(before.rows('chapterContents')[0]['doc']);
  characters.undoDelete(kept);
  expect(store.row(p, 'loreEntries', kael.id)).not.toBeNull();
  expect(new CharacterSecret(store.rowsIn(p, 'characterSecrets')[0]).knows).toEqual([kael.id]);
});
