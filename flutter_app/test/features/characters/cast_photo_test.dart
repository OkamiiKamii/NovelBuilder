import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/cast_photo.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  test('who stands where: the principals in front, the most important in the middle; the minor cast behind', () {
    final cast = CastData('x', sampleNovel(now: 0));
    final rows = castPhotoRows(cast.list);
    final front = [for (final l in rows.front) l.entry.name];
    final back = [for (final l in rows.back) l.entry.name];
    expect(front, hasLength(5));
    expect(front[2], 'Wren Hollis', reason: 'the protagonist in the middle');
    expect(front.toSet(), {'Wren Hollis', 'Aldous Crane', 'Ilse Marrow', 'Tobiah Fenn', 'Sefa Quill'});
    expect(back.toSet(), {'Nan Ottilie', 'Kit Marrow', 'Jory'});
    expect(rows.more, 0);
  });

  testWidgets('the cast photograph heads Characters; a press on anyone opens them; one alone has none', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();

    expect(find.byType(CastPhoto), findsOneWidget);
    expect(find.textContaining('Front, from the left:'), findsOneWidget);
    expect(find.textContaining('Behind:'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(find.bySemanticsLabel('Wren Hollis, Protagonist'));
    await tester.pumpAndSettle();
    final wren = c.read(castProvider)!.entries.firstWhere((e) => e.name == 'Wren Hollis').id;
    expect(currentLocation(c), '/organize/character/$wren');
  });

  testWidgets('a cast of one has no photograph', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill'}).id;
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'James'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.textContaining('Front, from the left:'), findsNothing);
  });
}
