import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/shell/contents_parts.dart';
import 'package:novel_builder/app/shell/keepsakes.dart';
import 'package:novel_builder/app/shell/proof_card.dart';
import 'package:novel_builder/app/shell/today_from_your_book.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Future<ProviderContainer> more(WidgetTester tester, {bool sample = true}) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final id = sample
        ? addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch).id
        : c.read(libraryServiceProvider).create({'title': 'Blank'}).id;
    c.read(openNovelProvider.notifier).open(id);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pumpAndSettle();
    return c;
  }

  double top(WidgetTester tester, Finder f) => tester.getTopLeft(f).dy;
  Finder heading(ContentsPart p) => find.byWidgetPredicate((w) => w is PartHeading && w.part == p);

  testWidgets('More in four parts, each under its heading, in order', (tester) async {
    await more(tester);
    for (final p in ContentsPart.values) {
      expect(heading(p), findsOneWidget);
    }
    final tops = [for (final p in ContentsPart.values) top(tester, heading(p))];
    expect(tops, orderedEquals([...tops]..sort()), reason: 'one, two, three, four, down the page');

    // Each part holds its own.
    bool under(Finder f, ContentsPart p) {
      final y = top(tester, f);
      final next = ContentsPart.values.indexOf(p) + 1;
      return y > top(tester, heading(p)) &&
          (next == ContentsPart.values.length || y < top(tester, heading(ContentsPart.values[next])));
    }

    expect(under(find.byType(TodayFromYourBook), ContentsPart.today), isTrue);
    expect(under(find.text('Loose ends'), ContentsPart.today), isTrue);
    expect(under(find.byType(ProofCard), ContentsPart.polish), isTrue);
    expect(under(find.byType(KeepsakeRow), ContentsPart.keepsakes), isTrue);
    expect(under(find.text('Plan'), ContentsPart.book), isTrue);
    expect(find.bySemanticsLabel(RegExp(r'^Part two: Before it goes out\.')), findsOneWidget);
  });

  testWidgets('the strip of parts goes straight to each', (tester) async {
    await more(tester);
    // To the last part and back again: the strip is held at the top all the while, so each press reaches it.
    for (final p in [ContentsPart.book, ContentsPart.keepsakes, ContentsPart.polish, ContentsPart.today]) {
      await tester.tap(find.byTooltip('Part ${p.ordinal.toLowerCase()}: ${p.title}'));
      await tester.pumpAndSettle();
      final strip = tester.getRect(find.byType(PartStrip));
      final y = top(tester, heading(p));
      expect(y, greaterThanOrEqualTo(strip.bottom - 1), reason: '${p.title} not under the strip');
      expect(y, lessThan(strip.bottom + 120), reason: '${p.title} at the top, under the strip');
    }
  });

  testWidgets('a book with no words yet: its areas alone, no parts', (tester) async {
    await more(tester, sample: false);
    expect(find.byType(PartStrip), findsNothing);
    expect(find.byType(PartHeading), findsNothing);
    expect(find.text('Plan'), findsOneWidget);
  });
}
