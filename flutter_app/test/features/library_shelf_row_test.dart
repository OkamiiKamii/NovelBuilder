import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/bookshelf.dart';
import 'package:novel_builder/features/library/shelf_row.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('on a phone a long shelf is a row to swipe, and See all lays every book out', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final library = c.read(libraryServiceProvider);
    for (var i = 1; i <= 4; i++) {
      library.create({'title': 'Idea $i', 'status': 'planning'});
    }
    library.create({'title': 'Being written', 'status': 'drafting'});
    await tester.pumpAndSettle();

    final row = find.byType(ShelfRow);
    expect(row, findsOneWidget, reason: 'four ideas: a row');
    final first = tester.getRect(find.descendant(of: row, matching: find.byType(ShelfBook)).first);
    final second = tester.getRect(find.descendant(of: row, matching: find.byType(ShelfBook)).at(1));
    expect((first.top - second.top).abs(), lessThan(1), reason: 'side by side, one row');
    expect(find.byType(Bookshelf), findsOneWidget, reason: 'a shelf of one stays as it is');

    // Swiped, the later books come into view.
    final last = find.text('Idea 4');
    await tester.ensureVisible(row);
    await tester.pumpAndSettle();
    await tester.drag(find.descendant(of: row, matching: find.byType(Scrollable)).first, const Offset(-900, 0));
    await tester.pumpAndSettle();
    expect(tester.getRect(last.first).right, lessThanOrEqualTo(phone.width));

    await tester.ensureVisible(find.text('See all 4'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('See all 4'));
    await tester.pumpAndSettle();
    expect(row, findsNothing);
    expect(find.byType(Bookshelf), findsNWidgets(2));
    await tester.ensureVisible(find.text('Back to the shelf'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Back to the shelf'));
    await tester.pumpAndSettle();
    expect(find.byType(ShelfRow), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a computer the shelves stay laid out in full', (tester) async {
    final c = await pumpApp(tester);
    for (var i = 1; i <= 6; i++) {
      c.read(libraryServiceProvider).create({'title': 'Idea $i', 'status': 'planning'});
    }
    await tester.pumpAndSettle();
    expect(find.byType(ShelfRow), findsNothing);
  });
}
