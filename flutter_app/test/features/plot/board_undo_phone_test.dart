// Found on a real phone (a 372 × 827 screen): after scrolling down the scene board to a chapter and moving it, its Undo
// was above, out of sight. It now stays in view.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('on a short phone, the Undo of a move on the scene board stays in view and works', (tester) async {
    final c = await pumpApp(tester, size: const Size(372, 827), location: '/');
    final novel = c.read(libraryServiceProvider).create({'title': 'Device Plot'});
    final ms = c.read(manuscriptServiceProvider);
    final gate = ms.create(novel.id, NodeKind.chapter, title: 'The Gate');
    ms.create(novel.id, NodeKind.chapter, title: 'The River');
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(routerProvider).go('/plan/board');
    await tester.pumpAndSettle();
    final later = find.byTooltip('Move The Gate later');
    await tester.scrollUntilVisible(later, 200, scrollable: find.byType(Scrollable).first);
    // As far as it goes: the button at the top of the screen, the head of the board well out of sight.
    await tester.ensureVisible(later);
    await tester.pumpAndSettle();
    await tester.tap(later);
    await tester.pumpAndSettle();
    expect(ms.nodes(novel.id).firstWhere((n) => n.id == gate.id).order, 1);
    // Where the author is, not above them: on screen and pressable.
    final undo = find.text('Undo move of “The Gate”');
    expect(undo.hitTestable(), findsOneWidget);
    await tester.tap(undo);
    await tester.pumpAndSettle();
    expect(ms.nodes(novel.id).firstWhere((n) => n.id == gate.id).order, 0);
  });
}
