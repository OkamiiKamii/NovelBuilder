import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/timeline/widgets/what_if.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';
import 'timeline_screens_test.dart' show setUpNovel, timelineIn;

void main() {
  test('starters come out of the story, then a few for any story', () {
    final s = whatIfStarters(events: [(id: 'e1', name: 'The Fall of Emberhold')], people: ['Mira']);
    expect(s.first, (question: 'What if The Fall of Emberhold never happened?', eventId: 'e1'));
    expect(s[1].question, 'What if Mira chose otherwise?');
    expect(s.length, lessThanOrEqualTo(6));
    expect(whatIfName('  What if the Keep had held  '), 'What if the Keep had held?');
  });

  testWidgets('with no histories, a question branches the story in one press, departing at its event', (tester) async {
    final w = await setUpNovel(tester, size: phone, location: '/plan/histories');
    final fall = timelineIn(w.c, w.novel, (x) => x.createEvent('The Fall of Emberhold'));
    await tester.pumpAndSettle();
    expect(find.text('What if…?'), findsOneWidget);
    expect(find.text('What if Mira chose otherwise?'), findsOneWidget, reason: 'from the cast');
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(find.text('What if The Fall of Emberhold never happened?'));
    await tester.pumpAndSettle();
    final branch = find.text('Branch the story');
    await tester.ensureVisible(branch);
    await tester.pumpAndSettle();
    await tester.tap(branch);
    await tester.pumpAndSettle();

    final made = w.c.read(novelStoreProvider).rowsIn(w.novel, 'alternateHistories').single;
    expect(made['name'], 'What if The Fall of Emberhold never happened?');
    expect(made['originEventId'], fall);
    expect(currentLocation(w.c), '/plan/histories?history=${made['id']}', reason: 'opened');
    expect(find.text('What if…?'), findsNothing, reason: 'the card is for the first one');
  });
}
