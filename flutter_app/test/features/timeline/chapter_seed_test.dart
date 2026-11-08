import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/timeline/chronology.dart';

import '../../helpers/pump_app.dart';
import 'timeline_screens_test.dart' show eventsOf, setUpNovel, timelineIn;

void main() {
  testWidgets('an empty timeline offers the chapters as told; one press makes them its events, in that order', (
    tester,
  ) async {
    final w = await setUpNovel(tester, size: phone);
    JsonMap chapter(String id, String title, int order, [String summary = '']) => {
      'id': id,
      'projectId': w.novel,
      'parentId': null,
      'kind': 'chapter',
      'title': title,
      'summary': summary,
      'order': order,
      'status': 'drafting',
      'wordCount': 0,
      'createdAt': order,
      'updatedAt': 0,
    };
    w.c.read(novelStoreProvider).writeRows(w.novel, [
      RowWrite.put('chapters', chapter('c2', 'The Crossing', 1)),
      RowWrite.put('chapters', chapter('c1', 'The Call', 0, 'Mira hears the bell.')),
      RowWrite.put('chapters', chapter('c3', '', 2)),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('The Call'), findsOneWidget);
    expect(find.text('The Crossing'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    await tester.ensureVisible(find.text('Make 3 events from the chapters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make 3 events from the chapters'));
    await tester.pumpAndSettle();
    final events = eventsOf(w.c, w.novel);
    final byName = {for (final e in events) e.name: e};
    expect(byName.keys.toSet(), {'The Call', 'The Crossing', 'Chapter 3'});
    expect(byName['The Call']!.description, 'Mira hears the bell.');
    expect(byName['The Crossing']!.nodeIds, ['c2']);
    expect(byName['The Crossing']!.afterId, byName['The Call']!.id);
    expect(byName['The Call']!.when?.precision ?? 'unknown', 'unknown', reason: 'no date is made up');
    final order = resolveChronology(events).map((p) => p.event.name).toList();
    expect(order, ['The Call', 'The Crossing', 'Chapter 3'], reason: 'the order the story tells them');
    expect(find.textContaining('3 events made from your chapters'), findsOneWidget);

    expect(
      () => timelineIn(w.c, w.novel, (x) => x.eventsFromChapters(['c1'])),
      throwsA(isA<ChangeRefused>()),
      reason: 'only for an empty timeline',
    );
  });
}
