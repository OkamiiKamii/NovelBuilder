import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a phone every chapter is a press away from the page, and Next steps on', (tester) async {
    final w = await openWrite(tester, size: phone);
    final m = w.c.read(manuscriptServiceProvider);
    final crossing = m.create(w.novel, NodeKind.chapter, title: 'The Crossing');
    m.save(w.novel, crossing.id, textToDoc('They crossed at dawn.'), baseRev: 0);
    final ashes = m.create(w.novel, NodeKind.chapter, title: 'Ashes');
    await tester.pumpAndSettle();

    expect(find.text('Ch. 1'), findsOneWidget);
    await tester.tap(find.text('Ch. 1'));
    await tester.pumpAndSettle();
    expect(find.text('The chapters'), findsOneWidget);
    expect(find.text('7 words'), findsWidgets, reason: 'each with its length');
    expect(find.text('Not begun'), findsWidgets);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    await tester.tap(find.text('Ashes'));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), ashes.id);
    expect(find.text('Ch. 3'), findsOneWidget);

    // Previous steps back; at the first chapter there is none.
    await tester.tap(find.text('Ch. 3'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Previous'));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), crossing.id);
    expect(tester.takeException(), isNull);
  });
}
