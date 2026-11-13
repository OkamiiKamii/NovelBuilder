import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/full_jacket.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  test('the spine is as thick as the book', () {
    expect(spineWidth(0), 10);
    expect(spineWidth(9645), lessThan(spineWidth(90000)));
    expect(spineWidth(10000000), 46);
  });

  testWidgets('from More, the full jacket: back, spine and front, shared as a picture', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^The full jacket'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();

    Finder jacket(String text) => find.descendant(of: find.byType(FullJacket), matching: find.text(text));
    expect(jacket('THE DROWNED ROAD'), findsOneWidget, reason: 'down the spine');
    expect(jacket('“Master, it’s the tide bell.”'), findsOneWidget, reason: 'a line from the book, set large');
    expect(find.descendant(of: find.byType(FullJacket), matching: find.textContaining('A NOVEL')), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('Share the jacket'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'book-jacket.png'));
    final picture = img.decodePng(png.bytes)!;
    expect((picture.width, picture.height), (1440, 990));

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.byType(FullJacketScreen), findsNothing);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'nothing changed');
  });
}
