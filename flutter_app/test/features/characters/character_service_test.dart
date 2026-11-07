import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/data/character_service.dart';
import 'package:novel_builder/features/write/data/manuscript_service.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import '../write/manuscript_service_test.dart' show linked;

void main() {
  late AppDatabase db;
  late NovelStore store;
  late CharacterService characters;
  late ManuscriptService manuscript;
  late DateTime now;
  const p = 'novel';

  setUp(() {
    now = DateTime(2026, 10, 24, 9);
    db = AppDatabase.inMemory();
    store = NovelStore(db, clock: () => now)
      ..putNovel(NovelSnapshot(project: {'id': p, 'title': 'T', 'updatedAt': 1}, collections: const {}));
    final backups = BackupService(store, RestorePointStore(db, clock: () => now), clock: () => now);
    characters = CharacterService(store, backups, clock: () => now);
    manuscript = ManuscriptService(store, DraftStore(db, clock: () => now), backups, clock: () => now);
  });
  tearDown(() => db.close());

  test('a change is saved in one go, builds on the one before, and marks the novel as changed', () {
    final kael = characters.change(p, (c) => c.create(name: 'Kael', roles: ['Protagonist']));
    now = now.add(const Duration(minutes: 1));
    characters.change(p, (c) => c.identity(kael.id, const IdentityChanges(epithet: 'The Oathbreaker')));
    final profile = CharacterProfile(store.rowsIn(p, 'characterProfiles').single);
    expect((profile.epithet, profile.roles.single), ('The Oathbreaker', 'Protagonist'));
    expect(store.novel(p)!.updatedAt, now.millisecondsSinceEpoch);
    // A refused change writes nothing at all.
    final before = store.load(p)!.toJson();
    expect(() => characters.change(p, (c) => c.addSection(kael.id, ' ')), throwsA(isA<ChangeRefused>()));
    expect(jsonEquals(store.load(p)!.toJson(), before), isTrue);
  });

  test('a change never overwrites something saved elsewhere since it was read', () {
    final kael = characters.change(p, (c) => c.create(name: 'Kael'));
    expect(
      () => characters.change(p, (c) {
        final result = c.addSection(kael.id, 'Magic');
        // Someone else saves the same profile while this change is being made.
        store.writeRows(p, [
          RowWrite.put('characterProfiles', {...store.rowsIn(p, 'characterProfiles').single, 'epithet': 'Elsewhere'}),
        ]);
        return result;
      }),
      throwsA(isA<StaleWriteException>()),
    );
    expect(CharacterProfile(store.rowsIn(p, 'characterProfiles').single).epithet, 'Elsewhere');
  });

  test('a character change does not load or touch chapter text', () {
    final chapter = manuscript.create(p, NodeKind.chapter, title: 'One');
    final kael = characters.change(p, (c) => c.create(name: 'Kael'));
    manuscript.save(p, chapter.id, linked('Kael', kael.id), baseRev: 0);
    final text = store.row(p, 'chapterContents', chapter.id);
    characters.change(p, (c) => c.identity(kael.id, const IdentityChanges(name: 'Kael Draven')));
    expect(jsonEquals(store.row(p, 'chapterContents', chapter.id), text), isTrue);
    expect(characters.read(p)!.rows('chapterContents'), isEmpty, reason: 'the cast is read without the text');
    expect(characters.nameMentions(p, ['Kael Draven', 'Kael']), 1);
  });

  test('deleting asks nothing of the text, keeps a restore point, and Undo brings everything back', () {
    final chapter = manuscript.create(p, NodeKind.chapter, title: 'One');
    final kael = characters.change(p, (c) => c.create(name: 'Kael'));
    final mira = characters.change(p, (c) => c.create(name: 'Mira'));
    manuscript.save(p, chapter.id, linked('Kael', kael.id), baseRev: 0);
    characters.change(
      p,
      (c) => c.saveSecret(mira.id, null, {
        'title': 'Spy',
        'knows': [kael.id],
      }),
    );
    expect(characters.references(p, kael.id)['chapters'], 1);
    final before = store.load(p)!;
    final kept = characters.delete(p, kael.id, name: 'Kael');
    expect(store.row(p, 'loreEntries', kael.id), isNull);
    expect(CharacterSecret(store.rowsIn(p, 'characterSecrets').single).knows, isEmpty);
    expect(store.row(p, 'chapterContents', chapter.id)!['doc'], before.rows('chapterContents').single['doc']);
    characters.undoDelete(kept);
    expect(store.row(p, 'loreEntries', kael.id), isNotNull);
    expect(CharacterSecret(store.rowsIn(p, 'characterSecrets').single).knows, [kael.id]);
  });
}
