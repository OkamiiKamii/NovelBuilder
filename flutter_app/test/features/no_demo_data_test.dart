import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/features/library/bookshelf.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('the library starts empty and offers no fake novels', (tester) async {
    await pumpApp(tester);
    // An empty library is a blank title page: nothing on it until the author types.
    expect(find.byType(BookJacket), findsOneWidget);
    expect(find.text('Begin chapter one'), findsOneWidget);
    expect(find.text('Import backup'), findsOneWidget);
  });

  testWidgets('novel areas say no novel is open, and lead back to the library', (tester) async {
    for (final d in Destination.values.where((d) => d.needsNovel)) {
      final container = await pumpApp(tester, location: d.path);
      expect(container.read(openNovelProvider), isNull);
      expect(find.text('No novel open'), findsOneWidget, reason: d.label);
      await tester.tap(find.text('Go to Library'));
      await tester.pumpAndSettle();
      expect(currentLocation(container), '/');
    }
  });

  testWidgets('with a novel open, areas stop asking for one', (tester) async {
    final container = await pumpApp(tester, location: Destination.write.path);
    final novel = container.read(libraryServiceProvider).create({'title': 'Ash'});
    container.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    expect(find.text('No novel open'), findsNothing);
    container.read(openNovelProvider.notifier).close();
    await tester.pumpAndSettle();
    expect(find.text('No novel open'), findsOneWidget);
  });
}
