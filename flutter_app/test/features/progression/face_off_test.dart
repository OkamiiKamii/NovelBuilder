import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/face_off_view.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

import '../../helpers/pump_app.dart';

/// Wren and Crane with sheets in the LitRPG preset, Crane the stronger.
Future<void> facingOff(WidgetTester tester, {Size size = const Size(1200, 3200), FakeBackupFiles? files}) async {
  final c = await pumpApp(tester, size: size, location: '/library', files: files);
  final store = c.read(novelStoreProvider);
  final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
  c.read(openNovelProvider.notifier).open(novel.id);
  String id(String name) => str(store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == name)['id']);
  final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
  c.read(progressionServiceProvider).systems(novel.id, (x) {
    final made = x.createSystem(litrpg.content);
    String v(String name) => made.variables.firstWhere((x) => x.name == name).id;
    final wren = x.addSheet(made.id, id('Wren Hollis'));
    x.updateSheet(
      wren.id,
      (_) => {
        'values': {v('Agility'): 16},
      },
    );
    final crane = x.addSheet(made.id, id('Aldous Crane'));
    x.updateSheet(
      crane.id,
      (_) => {
        'values': {v('Strength'): 25, v('Intelligence'): 18},
      },
    );
  });
  c.read(routerProvider).go('/organize/systems');
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the face-off: two sheets side by side, who leads, the widest gap; swapped; shared', (tester) async {
    final files = FakeBackupFiles();
    await facingOff(tester, files: files);
    Finder inFaceOff(Finder f) => find.descendant(of: find.byType(FaceOffView), matching: f);
    expect(find.text('THE FACE-OFF'), findsOneWidget);
    expect(inFaceOff(find.text('VS')), findsOneWidget);
    expect(inFaceOff(find.textContaining('Aldous Crane leads in')), findsOneWidget);
    expect(inFaceOff(find.textContaining('Wren Hollis only in Agility')), findsOneWidget);
    expect(
      inFaceOff(find.textContaining('The widest gap: Strength, Aldous Crane 25 to Wren Hollis 10')),
      findsOneWidget,
    );

    await tester.ensureVisible(find.text('Swap sides'));
    await tester.pumpAndSettle();
    final before = tester.getTopLeft(inFaceOff(find.text('Wren Hollis'))).dx;
    await tester.tap(find.text('Swap sides'));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(inFaceOff(find.text('Wren Hollis'))).dx, isNot(before), reason: 'the other side');

    await tester.runAsync(() async {
      await tester.tap(find.text('Share the face-off'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'face-off.png'));
    expect(img.decodePng(png.bytes)!.width, greaterThan(1000));
  });
}
