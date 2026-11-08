import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/bookshelf.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('on a phone the books come up the screen: a short last page, the sorting folded away', (tester) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final c = await pumpApp(tester, size: phone);
    final library = c.read(libraryServiceProvider);
    final ash = library.create({'title': 'Ash', 'status': 'drafting', 'primaryGenre': 'Fantasy'});
    library.create({'title': 'Ember', 'status': 'idea', 'primaryGenre': 'Mystery'});
    final m = c.read(manuscriptServiceProvider);
    final gate = m.create(ash.id, NodeKind.chapter, title: 'The Gate');
    final text = [for (var i = 1; i <= 9; i++) 'Line $i.'].join('\n\n');
    m.save(ash.id, gate.id, textToDoc(text), baseRev: 0);
    c.read(openNovelProvider.notifier).open(ash.id);
    c.read(selectedNodeProvider.notifier).select(gate.id);
    c.read(openNovelProvider.notifier).close();
    await tester.pumpAndSettle();

    // The page shows its foot, five lines at most, and is said whole to a screen reader.
    final page = tester.getSize(find.byType(LastPage));
    expect(page.height, lessThan(200));
    expect(find.bySemanticsLabel(RegExp(r'^The last lines you wrote: .*Line 9\.$', dotAll: true)), findsOneWidget);

    // Sort and filter are one button; pressed, they open, and a choice is counted on it.
    expect(find.text('Status'), findsNothing);
    await tester.ensureVisible(find.text('Sort & filter'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sort & filter'));
    await tester.pumpAndSettle();
    expect(find.text('Status'), findsOneWidget);
    await tester.ensureVisible(find.text('All genres'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All genres'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mystery').last);
    await tester.pumpAndSettle();
    expect(find.text('Sort & filter · 1'), findsOneWidget);
    expect(find.text('Ember'), findsWidgets);
    expect(find.text('Covers'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    expect(tester.takeException(), isNull);
  });
}
