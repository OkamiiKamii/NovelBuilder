import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/widgets/in_their_words.dart';
import 'package:novel_builder/features/characters/widgets/their_voice.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/kept_readings.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../../helpers/pump_app.dart';

/// A character's page reads the book away from the screen (where they are, what they say, how they talk, how they
/// look); the readings are kept by what they were read from: a character gone back to reads nothing again and shows
/// it all at once, how everyone talks is read once for the whole cast, and a chapter written is read again.
void main() {
  testWidgets(
    'kept and shared: back to a character reads nothing; the cast\'s voices read once; text written is read',
    (tester) async {
      final c = await pumpApp(tester, size: const Size(1200, 4000), location: '/library');
      final store = c.read(novelStoreProvider);
      final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
      c.read(openNovelProvider.notifier).open(novel.id);
      String id(String name) => str(store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == name)['id']);
      final wren = id('Wren Hollis');
      final tobiah = id('Tobiah Fenn');
      final kept = c.read(keptReadingsProvider);

      Future<void> settle() async {
        await tester.pumpAndSettle();
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
        await tester.pumpAndSettle();
      }

      Finder voice(String text) => find.descendant(of: find.byType(TheirVoice), matching: find.text(text));

      c.read(routerProvider).go(characterPath(wren, tab: 'overview'));
      await settle();
      expect(voice('Their voice'), findsOneWidget);
      final afterWren = kept.runs;
      expect(afterWren, greaterThan(0));

      // Tobiah: how he talks, against the cast, in his page's very first frame (the cast's voices are read already).
      c.read(routerProvider).go(characterPath(tobiah, tab: 'overview'));
      await tester.pump();
      expect(voice('Their voice'), findsOneWidget, reason: 'shown at once: read for Wren, the same for everyone');
      await settle();
      final afterTobiah = kept.runs;

      // Back to Wren: nothing read again, and everything there at once.
      c.read(routerProvider).go(characterPath(wren, tab: 'overview'));
      await tester.pump();
      expect(voice('Their voice'), findsOneWidget, reason: 'in the first frame');
      expect(find.text('In their own words'), findsOneWidget, reason: 'in the first frame');
      await settle();
      expect(kept.runs, afterTobiah, reason: 'nothing read again');

      // A line of hers written while her page is open: read again, and it is among her words.
      final m = c.read(manuscriptServiceProvider);
      final chapter = str(store.rowsIn(novel.id, 'chapterContents').first['id']);
      m.save(
        novel.id,
        chapter,
        textToDoc('“The bells are ringing for us,” said Wren.'),
        baseRev: m.open(novel.id, chapter).rev,
      );
      await settle();
      expect(kept.runs, greaterThan(afterTobiah), reason: 'the text changed');
      final words = find.byType(InTheirWords);
      await tester.ensureVisible(words);
      final all = find.descendant(of: words, matching: find.textContaining('Show all'));
      if (all.evaluate().isNotEmpty) {
        await tester.ensureVisible(all.first);
        await tester.pumpAndSettle();
        await tester.tap(all.first);
        await tester.pumpAndSettle();
      }
      expect(
        find.descendant(of: words, matching: find.textContaining('The bells are ringing for us', findRichText: true)),
        findsOneWidget,
      );
    },
  );
}
