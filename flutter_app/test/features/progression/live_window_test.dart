import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/live_window.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('the window: a sheet as it stands, changing as the system is changed, shared as a picture', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: const Size(1200, 2600), location: '/library', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    final service = c.read(progressionServiceProvider);
    final systemId = service.systems(novel.id, (x) {
      final made = x.createSystem(litrpg.content);
      final sheet = x.addSheet(made.id, str(wren['id']));
      x.updateSheet(
        sheet.id,
        (_) => {
          'values': {made.variables.firstWhere((v) => v.name == 'Strength').id: 17},
        },
      );
      return made.id;
    });
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();

    Finder inWindow(String text) => find.descendant(of: find.byType(LiveWindow), matching: find.text(text));
    expect(find.text('THE WINDOW'), findsOneWidget);
    expect(inWindow('Wren Hollis'), findsOneWidget, reason: 'her sheet, by name');
    expect(inWindow('Strength'), findsOneWidget);
    expect(inWindow('17'), findsOneWidget, reason: 'her own value, not the blueprint’s starting 10');

    // The system changed: the window follows at once.
    service.systems(novel.id, (x) {
      x.updateSystem(systemId, (current) {
        final variables = [
          for (final v in maps(current.raw['variables'])) v['name'] == 'Strength' ? {...v, 'name': 'Might'} : v,
        ];
        return {'variables': variables};
      });
    });
    await tester.pumpAndSettle();
    expect(inWindow('Might'), findsOneWidget);
    expect(inWindow('Strength'), findsNothing);

    await tester.runAsync(() async {
      await tester.tap(find.text('Share the window'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'status-window.png'));
    expect(img.decodePng(png.bytes)!.width, greaterThan(1000), reason: 'three times over');
  });

  testWidgets('with no sheet yet: a hero, as a sheet in it would begin', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 2600), location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    c.read(progressionServiceProvider).systems(novel.id, (x) => x.createSystem(litrpg.content));
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byType(LiveWindow), matching: find.text('Your hero')), findsOneWidget);
  });
}
