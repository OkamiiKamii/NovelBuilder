import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/cast_arcs.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/cast_views.dart';
import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// The sample novel, open on the Arcs view of the cast.
  Future<({ProviderContainer c, String novel, String before})> open(WidgetTester tester, Size size) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 14).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));
    // Chosen as a person would: the view chooser on a phone, its button on a wide screen.
    await showCastView(tester, CastView.arcs);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    return (c: c, novel: novel.id, before: before);
  }

  testWidgets('each one’s line through the book: its shape, a chapter pressed for the words, read there', (
    tester,
  ) async {
    final o = await open(tester, const Size(1200, 9000));
    expect(o.c.read(castViewProvider), CastView.arcs);
    expect(find.byType(CastArcs), findsOneWidget);

    // The most named first, each with the shape of their line.
    expect(tester.getTopLeft(find.text('Wren Hollis')).dy, lessThan(tester.getTopLeft(find.text('Tobiah Fenn')).dy));
    expect(find.text('Rises: rags to riches'), findsOneWidget);
    expect(find.text('Falls, then rises: a man in a hole'), findsOneWidget);
    expect(find.text('Named in 15 of 15 chapters · brightest in chapter 14 · darkest in chapter 12'), findsOneWidget);
    expect(
      find.text('Too little on the page to draw yet: Aldous Crane, Ilse Marrow, Jory, Kit Marrow.'),
      findsOneWidget,
    );
    // No arc planned in the sample's profiles: the way to plan one.
    expect(find.text('Plan their arc'), findsWidgets);

    // Wren's darkest chapter (12) pressed: what it reads, and the lines that put it there.
    final wren = o.c.read(castProvider)!.list.firstWhere((l) => l.entry.name == 'Wren Hollis').entry.id;
    final line = find.byKey(ValueKey('arc-line-$wren'));
    final box = tester.getRect(line);
    await tester.tapAt(Offset(box.left + 8 + 11 * (box.width - 16) / 14, box.center.dy));
    await tester.pumpAndSettle();
    expect(find.textContaining('Chapter 12: dark'), findsOneWidget);
    expect(find.byTooltip('Read it there'), findsWidgets);
    expect(
      jsonEncode(o.c.read(novelStoreProvider).load(o.novel)!.toJson(exportedAt: 0)),
      o.before,
      reason: 'it only reads',
    );

    await tester.tap(find.byTooltip('Read it there').first);
    await tester.pumpAndSettle();
    expect(currentLocation(o.c), '/write');
    expect(o.c.read(selectedNodeProvider), isNotNull);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('the arc planned in the profile, beside the one on the page', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 6000), location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 14).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final wren = c.read(castProvider)!.list.firstWhere((l) => l.entry.name == 'Wren Hollis').entry.id;
    c.read(characterServiceProvider).change(novel.id, (x) {
      recordIn(
        x,
        wren,
        'Starting Point',
        ['starting point'],
        'A mapmaker who never leaves the shop.',
        sections: const ['arc'],
        newSection: 'Character Arc',
      );
      recordIn(
        x,
        wren,
        'Intended Resolution',
        ['intended resolution'],
        'Walks the drowned road herself.',
        sections: const ['arc'],
        newSection: 'Character Arc',
      );
    });
    c.read(castViewProvider.notifier).set(CastView.arcs);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    expect(find.text('THE ARC YOU PLANNED'), findsOneWidget);
    expect(find.text('From  A mapmaker who never leaves the shop.', findRichText: true), findsOneWidget);
    expect(find.text('To  Walks the drowned road herself.', findRichText: true), findsOneWidget);
  });

  testWidgets('on a phone: the lines fit', (tester) async {
    await open(tester, const Size(390, 7000));
    expect(find.byType(CastArcs), findsOneWidget);
    expect(find.text('Rises: rags to riches'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
