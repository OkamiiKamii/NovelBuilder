import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/day_book.dart';
import 'package:novel_builder/features/write/goal_pledge.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('carrying on: the page last open, else the last with words, else the first', () {
    StoryNode n(String id, String kind, int words, {String? parent, int order = 0}) =>
        StoryNode({'id': id, 'kind': kind, 'title': id, 'wordCount': words, 'parentId': parent, 'order': order});
    final nodes = [
      n('v', 'volume', 0),
      n('a', 'chapter', 100, order: 0),
      n('b', 'chapter', 50, order: 1),
      n('c', 'chapter', 0, order: 2),
    ];
    expect(carryOnNode(nodes, 'a')!.id, 'a');
    expect(carryOnNode(nodes, 'gone')!.id, 'b');
    expect(carryOnNode([n('x', 'chapter', 0), n('y', 'chapter', 0, order: 1)], null)!.id, 'x');
  });

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form the day book heads the contents and carries on where the writing stopped', (tester) async {
      final w = await openWrite(tester, size: size, select: false);
      final before = w.c.read(novelStoreProvider).rowsIn(w.novel, 'writingSessions').length;
      expect(find.text('THE DAY BOOK'), findsOneWidget);
      // The chapter's text was saved today: today is written.
      expect(find.text('Written today'), findsOneWidget);
      expect(find.textContaining('Today: 7 words'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp(r', today: 7 words$')), findsOneWidget);
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      // A goal, from here: the ring and the line then count towards it.
      await tester.tap(find.text('Set a daily goal'));
      await tester.pumpAndSettle();
      expect(find.byType(GoalPledge), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(RegExp('^250 words a day')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save goals'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Today: 7 of 250 words'), findsOneWidget);
      expect(find.text('Set a daily goal'), findsNothing);

      // One press: the chapter open, the caret after its last word.
      await tester.tap(find.text('Carry on in “The Gate”'));
      await tester.pumpAndSettle();
      expect(w.c.read(selectedNodeProvider), w.chapter);
      final caret = SuperEditorInspector.findDocumentSelection()!;
      final last = SuperEditorInspector.findDocument()!.last as TextNode;
      expect(caret.extent.nodeId, last.id);
      expect((caret.extent.nodePosition as TextNodePosition).offset, last.text.length);
      expect(w.c.read(novelStoreProvider).rowsIn(w.novel, 'writingSessions').length, before, reason: 'nothing logged');
      expect(tester.takeException(), isNull);
    });
  }
}
