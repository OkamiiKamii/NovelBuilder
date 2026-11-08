import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/visualize/view_atlas.dart';
import 'package:novel_builder/features/visualize/viz_frame.dart' show offeredViews;
import 'package:novel_builder/shared/domain/visualize/views.dart';

import '../../helpers/pump_app.dart';
import 'visualize_screens_test.dart' show plateOf, setUpNovel;

void main() {
  test('every view offered is under one subject, in the atlas’s order', () {
    final parts = offeredViews(const []);
    final atlas = atlasOf(parts);
    expect([for (final (s, _) in atlas) s], ['People', 'Time', 'The story', 'The world', 'Numbers']);
    expect(atlas.expand((s) => s.$2).length, parts.length, reason: 'none left out, none twice');
  });

  testWidgets('the views are an atlas of plates: each says what it shows, one press opens it', (tester) async {
    final w = await setUpNovel(tester, size: phone);
    await tester.tap(find.byTooltip('All views'));
    await tester.pumpAndSettle();
    expect(find.text('The views'), findsOneWidget);
    expect(find.text('The world'), findsOneWidget);
    expect(plateOf('Relationship map'), findsOneWidget);
    expect(find.text('Showing now'), findsOneWidget);
    expect(find.text(viewOf('journeys')!.description), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    final journeys = plateOf('Journeys');
    await tester.ensureVisible(journeys);
    await tester.pumpAndSettle();
    await tester.tap(journeys);
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/visualize/journeys');
    expect(find.text('The views'), findsNothing);
    expect(find.bySemanticsLabel(RegExp('^View: Journeys')), findsOneWidget);
  });
}
