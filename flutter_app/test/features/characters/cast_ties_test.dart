import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('ties: every pair of the cast, a tie recorded in one press, a pair with one opens it', (tester) async {
    final c = await pumpApp(tester, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final s = c.read(characterServiceProvider);
    final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
    final kai = s.change(novel, (x) => x.create(name: 'Kai')).id;
    final orrin = s.change(novel, (x) => x.create(name: 'Orrin')).id;
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ties'));
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.ties);
    expect(find.bySemanticsLabel('Kai and Mira: no tie yet. Add one'), findsOneWidget);

    await tester.tap(find.byTooltip('Who is Kai to Mira?'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rivals').last);
    await tester.pumpAndSettle();
    List<CharacterRelation> relations() => [
      for (final r in c.read(novelStoreProvider).rowsIn(novel, 'characterRelations')) CharacterRelation(r),
    ];
    expect([for (final r in relations()) (r.fromId, r.toId)], [(kai, mira)]);
    expect(find.bySemanticsLabel('Kai and Mira: Rivals'), findsOneWidget);
    expect(find.bySemanticsLabel('Mira and Kai: Rivals'), findsOneWidget, reason: 'the pair, both ways round');

    // A one-way tie: the character on the row takes the first role.
    await tester.tap(find.byTooltip('Who is Orrin to Kai?'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Mentor / Student (Orrin the mentor)').last);
    await tester.pumpAndSettle();
    final mentor = relations().firstWhere((r) => r.fromId == orrin);
    expect((mentor.toId, mentor.stages.single.fromRole, mentor.stages.single.toRole), (kai, 'Mentor', 'Student'));

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(find.bySemanticsLabel('Kai and Mira: Rivals'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/relationship/${relations().firstWhere((r) => r.fromId == kai).id}');
  });
}
