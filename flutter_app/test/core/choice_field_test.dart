import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/widgets/choice_field.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/large_novel.dart';
import '../helpers/pump_app.dart';

/// A choice from a list as long as the book makes it: a short list is the dropdown it always was; a long one shows
/// only what is chosen, and opens a list to type in, built a screenful at a time.
void main() {
  List<DropdownMenuItem<String>> chapters(int n) => [
    const DropdownMenuItem(value: '', child: Text('The first')),
    for (var i = 1; i <= n; i++) DropdownMenuItem(value: 'c$i', child: Text('$i. Chapter $i')),
  ];

  Future<List<String?>> show(WidgetTester tester, int n, {String? value, bool enabled = true, Size? size}) async {
    if (size != null) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }
    final chosen = <String?>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: ChoiceField<String>(
              initialValue: value,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'From chapter'),
              items: chapters(n),
              onChanged: enabled ? chosen.add : null,
            ),
          ),
        ),
      ),
    );
    return chosen;
  }

  testWidgets('a short list is the dropdown it always was', (tester) async {
    await show(tester, 5, value: 'c2');
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    expect(find.text('2. Chapter 2'), findsWidgets);
  });

  testWidgets('a long list: only what is chosen is built; the list opens, narrows as one types, and chooses', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final chosen = await show(tester, 300, value: 'c7', size: const Size(800, 1600));
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(find.text('7. Chapter 7'), findsOneWidget, reason: 'what is chosen');
    expect(find.text('8. Chapter 8', skipOffstage: false), findsNothing, reason: 'nothing else is built');
    expect(find.bySemanticsLabel(RegExp('From chapter')), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(ChoiceField<String>)),
      containsSemantics(isButton: true, hasTapAction: true, value: '7. Chapter 7', label: 'From chapter'),
    );

    await tester.tap(find.byType(ChoiceField<String>));
    await tester.pumpAndSettle();
    expect(find.text('Type to find one of 301'), findsOneWidget);
    final rows = find.byType(ListTile).evaluate().length;
    expect(rows, lessThan(40), reason: 'a screenful of 301, not all of them');
    await tester.enterText(find.byType(TextField), '7. chapter 7');
    await tester.pumpAndSettle();
    final now = tester.widget<ListTile>(find.widgetWithText(ListTile, '7. Chapter 7'));
    expect(now.selected, isTrue, reason: 'the one chosen is marked');

    await tester.enterText(find.byType(TextField), '23');
    await tester.pumpAndSettle();
    // "23", "123", "223", "230" to "239": every chapter whose words hold it, and only those.
    expect(find.byType(ListTile), findsNWidgets(13));
    await tester.enterText(find.byType(TextField), 'chapter 237');
    await tester.pumpAndSettle();
    expect(find.byType(ListTile), findsOneWidget, reason: 'every word typed, in any order');
    await tester.tap(find.text('237. Chapter 237'));
    await tester.pumpAndSettle();
    expect(chosen, ['c237']);
    expect(find.text('237. Chapter 237'), findsOneWidget, reason: 'shown as chosen');

    // Nothing that holds it: said so. Enter with one left chooses it; closing chooses nothing.
    await tester.tap(find.byType(ChoiceField<String>));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'ashes');
    await tester.pumpAndSettle();
    expect(find.text('Nothing here holds “ashes”.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'first');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(chosen, ['c237', ''], reason: 'the one left, chosen with Enter');
    await tester.tap(find.byType(ChoiceField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(chosen, ['c237', ''], reason: 'closed: nothing chosen');
    handle.dispose();
  });

  testWidgets('a long list that cannot be changed does not open', (tester) async {
    await show(tester, 50, value: 'c3', enabled: false);
    await tester.tap(find.byType(ChoiceField<String>));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsNothing);
  });

  testWidgets('on a phone the list is the whole screen and the keyboard waits to be asked', (tester) async {
    await show(tester, 100, size: const Size(390, 844));
    await tester.tap(find.byType(ChoiceField<String>));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget);
    expect(tester.getSize(find.byType(Dialog)), const Size(390, 844));
    expect(tester.widget<TextField>(find.byType(TextField)).autofocus, isFalse);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  test('the words of an item, for finding it', () {
    expect(textOf(const Text('Mira')), 'Mira');
    expect(
      textOf(
        const Text.rich(
          TextSpan(
            text: 'Ch 3',
            children: [TextSpan(text: ': Ashes')],
          ),
        ),
      ),
      'Ch 3: Ashes',
    );
    expect(textOf(const Row(children: [Icon(Icons.person), Text('Kai'), Text('(rival)')])), 'Kai (rival)');
    expect(textOf(const Padding(padding: EdgeInsets.zero, child: Text('Ren'))), 'Ren');
    expect(textOf(const Icon(Icons.close)), '');
  });

  testWidgets(
    'a page with chapter and place pickers on a long book builds their rows only when opened',
    (tester) async {
      BlinkController.indeterminateAnimationsEnabled = false;
      addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
      final c = await pumpApp(tester, size: phone);
      final s = largeNovel();
      c.read(novelStoreProvider).putNovel(s);
      c.read(openNovelProvider.notifier).open(s.projectId);
      await tester.pumpAndSettle();
      c.read(routerProvider).go('/visualize/appearances');
      await tester.pumpAndSettle();
      // Only the short lists (a status) are dropdowns still; no chapter, thread or place is built until its list opens.
      expect(
        find.byWidgetPredicate((w) => w is DropdownMenuItem, skipOffstage: false).evaluate().length,
        lessThanOrEqualTo(ChoiceField.longFrom),
      );
      expect(find.textContaining('Chapter 150', skipOffstage: false), findsNothing);
      var elements = 0;
      void visit(Element e) {
        elements++;
        e.visitChildren(visit);
      }

      tester.binding.rootElement!.visitChildren(visit);
      expect(elements, lessThan(4000), reason: 'was 19,274 with every chapter and place built in its dropdown');
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
