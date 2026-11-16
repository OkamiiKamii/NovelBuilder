import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/widgets/gradually.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/cast_card.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart' show RowWrite;
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart' show IdentityChanges;
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/large_novel.dart';
import '../../helpers/pump_app.dart';
import '../../helpers/scroll_to_end.dart';

/// Characters on a large novel (400 characters, 300,000 words): the cast kept between visits until what it is made
/// of is written, and the cards built a screenful at a time so the page is there at once.
void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Finder cards() => find.descendant(
    of: find.byType(CastWall),
    matching: find.byWidgetPredicate((w) => w.runtimeType.toString() == '_CastCard'),
  );

  testWidgets(
    'the cast is kept between visits, through a chapter written, and made again when the cast changes',
    (tester) async {
      final c = await pumpApp(tester, size: phone);
      final s = largeNovel();
      c.read(novelStoreProvider).putNovel(s);
      c.read(openNovelProvider.notifier).open(s.projectId);
      c.read(routerProvider).go('/organize');
      await tester.pumpAndSettle();
      final first = c.read(castProvider)!;

      Future<void> away() async {
        c.read(routerProvider).go('/write');
        await tester.pumpAndSettle();
      }

      Future<void> back() async {
        c.read(routerProvider).go('/organize');
        await tester.pumpAndSettle();
      }

      await away();
      await back();
      expect(identical(c.read(castProvider), first), isTrue, reason: 'nothing changed: the same cast, not made again');

      // Only a chapter's text written (the novel's time touched with it): the cast is not made of the text.
      await away();
      final store = c.read(novelStoreProvider);
      final contents = store.rowsIn(s.projectId, 'chapterContents').first;
      store.writeRows(s.projectId, [
        RowWrite.put('chapterContents', {...contents, 'doc': textToDoc('A new line.')}),
      ]);
      await back();
      expect(identical(c.read(castProvider), first), isTrue, reason: 'the text alone written: the same cast');

      // A chapter saved from the editor changes the outline too (its words counted): made again once, then kept.
      await away();
      final m = c.read(manuscriptServiceProvider);
      final chapter = s.rows('chapters').firstWhere((r) => r['kind'] == 'chapter')['id']! as String;
      m.save(s.projectId, chapter, textToDoc('A new first line.'), baseRev: m.open(s.projectId, chapter).rev);
      await back();
      final remade = c.read(castProvider)!;
      expect(identical(remade, first), isFalse, reason: 'the outline changed: made again');
      await away();
      await back();
      expect(identical(c.read(castProvider), remade), isTrue, reason: 'and kept again after');
      final first2 = remade;

      // A character renamed: made again, with the new name.
      final someone = first2.list.first.entry;
      c
          .read(characterServiceProvider)
          .change(s.projectId, (x) => x.identity(someone.id, const IdentityChanges(name: 'Zed')));
      await tester.pumpAndSettle();
      final next = c.read(castProvider)!;
      expect(identical(next, first2), isFalse);
      expect(next.list.any((l) => l.entry.name == 'Zed'), isTrue);
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );

  testWidgets(
    'the first frame builds a screenful of cards; the rest follow in the frames after, as far as can be reached; '
    'all sixty as the page is scrolled to its end',
    (tester) async {
      final c = await pumpApp(tester, size: phone);
      final s = largeNovel();
      c.read(novelStoreProvider).putNovel(s);
      c.read(openNovelProvider.notifier).open(s.projectId);
      await tester.pumpAndSettle();
      c.read(castViewProvider.notifier).set(CastView.cards);
      c.read(routerProvider).go('/organize');
      await tester.pump();
      expect(cards().evaluate().length, 8, reason: 'a screenful, so the page is there at once');
      // A handful more the next frame, if the end of the first is within reach of what is seen (the page's view and
      // two more of it below).
      final view =
          Scrollable.of(tester.element(find.byType(CastWall)), axis: Axis.vertical).context.findRenderObject()!
              as RenderBox;
      final end = tester.getRect(find.byType(CastWall)).bottom - view.localToGlobal(Offset.zero).dy;
      await tester.pump();
      expect(
        cards().evaluate().length,
        end < view.size.height * (1 + Gradually.ahead) ? 20 : 8,
        reason: 'a handful more each frame, while within reach',
      );
      await tester.pumpAndSettle();
      expect(cards().evaluate().length, lessThan(60), reason: 'only as far as the reader can reach');
      await scrollToEnd(tester, find.byType(CastWall), done: () => cards().evaluate().length == 60);
      expect(cards().evaluate().length, 60, reason: 'all of the first page of the cast, as the page is scrolled');
      expect(
        find.textContaining(RegExp(r'^Show \d+ more')),
        findsOneWidget,
        reason: 'the rest of the cast a press away',
      );
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
