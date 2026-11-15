import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/dramatis_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// The sample novel's Characters, with the cast list open.
  Future<({ProviderContainer c, String novel})> open(WidgetTester tester, Size size) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 14).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Cast list for the book'));
    await tester.tap(find.text('Cast list for the book'));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    return (c: c, novel: novel.id);
  }

  String castIn(ProviderContainer c, String novel) {
    final rows = c.read(novelStoreProvider).rowsIn(novel, 'bookMatter');
    return rows.isEmpty ? '' : BookMatter(rows.first).castList;
  }

  testWidgets('the cast list for the book: made from the cast, shown as printed, put in the book on a press', (
    tester,
  ) async {
    final o = await open(tester, const Size(1200, 3000));
    expect(find.byType(DramatisPage), findsOneWidget);
    expect(find.text('DRAMATIS PERSONAE'), findsOneWidget);
    // By faction, in the order they are met; those with no faction last.
    expect(find.text('THE FERRYMEN’S COMPANY'), findsOneWidget);
    expect(find.text('OTHERS'), findsOneWidget);
    expect(
      find.text('Tobiah Fenn — A ferryman’s son who knows how the water moves in the bay', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Wren Hollis — the apprentice', findRichText: true), findsOneWidget);
    expect(castIn(o.c, o.novel), isEmpty, reason: 'nothing in the book until it is asked for');

    await tester.tap(find.text('Put it in the book'));
    await tester.pumpAndSettle();
    expect(castIn(o.c, o.novel), startsWith('The Ferrymen’s Company:\nTobiah Fenn — '));
    expect(find.text('This is the cast list in the book.'), findsOneWidget);
    expect(find.text('In the book, before chapter one. Book details can change it.'), findsOneWidget);

    // Another arrangement: it asks before replacing the one in the book.
    final kept = castIn(o.c, o.novel);
    await tester.tap(find.text('One list'));
    await tester.pumpAndSettle();
    expect(find.text('OTHERS'), findsNothing);
    await tester.tap(find.text('Put this one in the book'));
    await tester.pumpAndSettle();
    expect(find.text('Replace the cast list in the book?'), findsOneWidget);
    await tester.tap(find.text('Keep the one there'));
    await tester.pumpAndSettle();
    expect(castIn(o.c, o.novel), kept);
    await tester.tap(find.text('Put this one in the book'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Replace it'));
    await tester.pumpAndSettle();
    expect(castIn(o.c, o.novel), startsWith('Wren Hollis — the apprentice\n'));

    // The book prints it before the story.
    final book = buildBook(BookSource.fromSnapshot(o.c.read(novelStoreProvider).load(o.novel)!), BookFormat.ebook);
    final cast = book.sections.firstWhere((s) => s.kind == SectionKind.cast);
    expect(cast.title, 'Dramatis Personae');
    expect(book.sections.indexOf(cast), lessThan(book.sections.indexWhere((s) => s.kind == SectionKind.chapter)));
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a cast no page has met yet: the whole cast by name, with no order of appearance to choose', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: const Size(1200, 2000), location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Doorway'}).id;
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mark'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cast list for the book'));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    expect(find.text('No one is on the page yet, so the whole cast is listed, by name.'), findsOneWidget);
    expect(find.text('As they appear'), findsNothing);
    expect(find.textContaining('Only those on the page'), findsNothing);
    expect(tester.widget<CastListPage>(find.byType(CastListPage)).text, 'Mark');
  });

  testWidgets('on a phone: the page fits', (tester) async {
    await open(tester, const Size(390, 2600));
    expect(find.byType(CastListPage), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
