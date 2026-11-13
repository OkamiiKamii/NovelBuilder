import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/outline_panel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import 'write_page_test.dart' show openWrite;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets(
    'the outline is a contents page: parts in capitals, chapters numbered with their lengths, scenes marked',
    (tester) async {
      final w = await openWrite(tester, select: false);
      final m = w.c.read(manuscriptServiceProvider);
      final part = m.create(w.novel, NodeKind.volume, title: 'The Fall');
      final two = m.create(w.novel, NodeKind.chapter, title: 'The River', parentId: part.id);
      m.save(w.novel, two.id, textToDoc('One two three four five.'), baseRev: 0);
      m.create(w.novel, NodeKind.scene, title: 'The ford', parentId: two.id);
      await tester.pumpAndSettle();

      expect(find.text('Contents'), findsOneWidget);
      expect(find.textContaining('Ash · '), findsOneWidget, reason: 'the book and its length under the heading');
      expect(find.text('The Fall'), findsOneWidget);
      expect(find.text('Volume'), findsOneWidget, reason: 'a part says what kind it is');
      expect(find.text('1'), findsOneWidget, reason: 'The Gate is chapter 1');
      // The day book and the road to the draft come first: chapter 2 and the scene are further down.
      final contents = find.descendant(of: find.byType(OutlinePanel), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.text('2'), 120, scrollable: contents);
      expect(find.text('2'), findsOneWidget, reason: 'The River is chapter 2, inside the volume');
      await tester.scrollUntilVisible(find.text('§'), 120, scrollable: contents);
      expect(find.text('§'), findsOneWidget, reason: 'the scene');
      expect(find.text('5'), findsOneWidget, reason: 'The River runs to five words');

      await tester.tap(find.text('The River'));
      await tester.pumpAndSettle();
      expect(w.c.read(selectedNodeProvider), two.id);
      expect(find.byTooltip('More for The River'), findsOneWidget, reason: 'every line keeps its menu');
    },
  );
}
