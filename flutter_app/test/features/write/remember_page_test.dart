import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('back to the contents on a phone, the Library still knows the page to pick up', (tester) async {
    final w = await openWrite(tester, size: phone);
    await tester.tap(find.byTooltip('Back to the outline'));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), isNull, reason: 'the contents are shown');
    expect(w.c.read(settingsStoreProvider).read('write.lastNode.${w.novel}'), w.chapter, reason: 'still remembered');

    w.c.read(openNovelProvider.notifier).close();
    w.c.read(routerProvider).go('/');
    await tester.pumpAndSettle();
    expect(find.textContaining('Continue writing “The Gate”'), findsOneWidget);
  });
}
