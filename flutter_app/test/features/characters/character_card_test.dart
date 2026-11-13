import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/widgets/character_card_share.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  test('a line out of its sentence ends as an excerpt does', () {
    expect(quoted('You want to go out there,'), 'You want to go out there.');
    expect(quoted('Master, it’s the tide bell.'), 'Master, it’s the tide bell.');
    expect(quoted('Who is there?'), 'Who is there?');
    expect(quoted('  '), '');
  });

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form a character’s card: their facts and ties, a line they say or their summary, shared as a '
        'post-sized picture', (tester) async {
      final files = FakeBackupFiles();
      final c = await pumpApp(tester, size: size, location: '/organize', files: files);
      final store = c.read(novelStoreProvider);
      final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));
      final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis')['id'];
      c.read(routerProvider).go('/organize/character/$wren');
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Share their card'));
      await tester.tap(find.text('Share their card'));
      await tester.pumpAndSettle();
      Finder card(String text) => find.descendant(of: find.byType(CharacterShareCard), matching: find.text(text));
      expect(card('Wren Hollis'), findsOneWidget);
      expect(card('the apprentice'), findsOneWidget);
      expect(card('PROTAGONIST'), findsOneWidget);
      expect(card('THE DROWNED ROAD'), findsOneWidget);
      expect(
        find.descendant(of: find.byType(CharacterShareCard), matching: find.textContaining('Ilse Marrow’s')),
        findsOneWidget,
      );
      expect(card('“Master, it’s the tide bell.”'), findsOneWidget, reason: 'a line she says in the book');

      await tester.tap(find.text('A line they say'));
      await tester.pumpAndSettle();
      expect(card('Apprentice cartographer, nineteen.'), findsOneWidget, reason: 'else her summary');

      await tester.runAsync(() async {
        await tester.tap(find.text('Share'));
        for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 50));
          await tester.pump();
        }
      });
      await tester.pumpAndSettle();
      final png = files.savedFiles.single;
      expect(png.kind, FileKind.png);
      expect(png.name, 'wren-hollis-card.png');
      final picture = img.decodePng(png.bytes)!;
      expect((picture.width, picture.height), (1080, 1350));
      expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'nothing in the novel changed');
    });
  }
}
