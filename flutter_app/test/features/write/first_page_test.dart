import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/plot/plot_providers.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'margin_test.dart' show wide;
import 'write_page_test.dart' show openWrite, storedText;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('an empty chapter opens on what is known of it; a way in, then the first word, and it is gone', (
    tester,
  ) async {
    final w = await openWrite(tester, size: phone, text: 'The gate was open.\nNobody guarded it.', select: false);
    final m = w.c.read(manuscriptServiceProvider);
    final two = m.create(w.novel, NodeKind.chapter, title: 'The River');
    final s = w.c.read(characterServiceProvider);
    final mira = s.change(w.novel, (x) => x.create(name: 'Mira Vance')).id;
    final kai = s.change(w.novel, (x) => x.create(name: 'Kai')).id;
    w.c.read(plotServiceProvider).change(w.novel, (x) {
      x.updatePlan(
        two.id,
        (stored) => {
          ...stored,
          'objective': 'Get across before dawn',
          'beats': [
            {'id': 'b1', 'text': 'The ford is gone'},
            {'id': 'b2', 'text': 'Kai goes under'},
          ],
          'povIds': [mira],
          'appearIds': [kai],
        },
      );
      final crown = x.createThread('The stolen crown');
      x.addBeat(crown, title: 'A false lead', nodeId: two.id);
      return crown;
    });
    w.c.read(selectedNodeProvider.notifier).select(two.id);
    await tester.pumpAndSettle();

    expect(find.text('Where the story stands'), findsOneWidget);
    expect(find.textContaining('Nobody guarded it.'), findsWidgets, reason: 'how the chapter before ends');
    expect(find.text('Get across before dawn'), findsOneWidget);
    expect(find.text('The ford is gone'), findsOneWidget);
    expect(find.text('Kai goes under'), findsOneWidget);
    expect(find.text('Mira Vance (point of view), Kai'), findsOneWidget);
    expect(find.text('The stolen crown: A false lead'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    // A way in: its prompt, and the caret on the page.
    await tester.ensureVisible(find.text('A line of dialogue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('A line of dialogue'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Someone speaks.'), findsOneWidget);
    expect(SuperEditorInspector.hasFocus(), isTrue, reason: 'ready to write');

    await tester.typeImeText('Rain.');
    await tester.pumpAndSettle();
    expect(find.text('Where the story stands'), findsNothing, reason: 'gone with the first word');
    expect(find.text('A way in'), findsNothing);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, two.id), 'Rain.', reason: 'only what was typed; the page wrote nothing');
  });

  testWidgets('with no plan, the first page offers to plan the chapter; a chapter with words has no first page', (
    tester,
  ) async {
    final w = await openWrite(tester, size: phone, select: false);
    final two = w.c.read(manuscriptServiceProvider).create(w.novel, NodeKind.chapter, title: 'The River');
    w.c.read(selectedNodeProvider.notifier).select(w.chapter);
    await tester.pumpAndSettle();
    expect(find.text('A way in'), findsNothing, reason: 'the first chapter has words');

    w.c.read(selectedNodeProvider.notifier).select(two.id);
    await tester.pumpAndSettle();
    expect(find.text('A way in'), findsOneWidget);
    await tester.ensureVisible(find.text('Plan this chapter'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Plan this chapter'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), chapterPlanPath(two.id));
  });

  testWidgets('with the notes beside the page, the first page has only the ways in; hidden, it holds the notes', (
    tester,
  ) async {
    final w = await openWrite(tester, size: wide, select: false);
    final two = w.c.read(manuscriptServiceProvider).create(w.novel, NodeKind.chapter, title: 'The River');
    w.c.read(plotServiceProvider).change(w.novel, (x) {
      x.updatePlan(two.id, (stored) => {...stored, 'objective': 'Get across before dawn'});
      return null;
    });
    w.c.read(selectedNodeProvider.notifier).select(two.id);
    await tester.pumpAndSettle();
    expect(find.text('A way in'), findsOneWidget);
    expect(find.textContaining('beside the page.'), findsOneWidget);
    expect(find.textContaining('Get across before dawn'), findsOneWidget, reason: 'in the margin, not twice');

    await tester.tap(find.byTooltip('Hide the notes beside the page'));
    await tester.pumpAndSettle();
    expect(find.text('This chapter is for'), findsOneWidget);
    expect(find.text('Get across before dawn'), findsOneWidget, reason: 'now on the first page');
  });
}
