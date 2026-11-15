import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/entrances_view.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/cast_views.dart';
import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// The sample novel, open on the Entrances view of the cast.
  Future<({ProviderContainer c, String novel, String before})> open(WidgetTester tester, Size size) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 14).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));
    // Chosen as a person would: the view chooser on a phone, its button on a wide screen.
    await showCastView(tester, CastView.entrances);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    return (c: c, novel: novel.id, before: before);
  }

  testWidgets('the cast in order of appearance: the doors, each entrance and what it gives, what an editor would say, '
      'and read there', (tester) async {
    final o = await open(tester, const Size(1200, 5000));
    expect(o.c.read(castViewProvider), CastView.entrances);
    expect(find.byType(CastEntrances), findsOneWidget);
    expect(find.text('IN ORDER OF APPEARANCE'), findsOneWidget);

    // A door a chapter.
    for (var n = 1; n <= 15; n++) {
      expect(find.byKey(ValueKey('door-$n')), findsOneWidget);
    }
    // In the order the book brings them on.
    final order = [
      'WREN HOLLIS',
      'ILSE MARROW',
      'KIT MARROW',
      'TOBIAH FENN',
      'NAN OTTILIE',
      'ALDOUS CRANE',
      'SEFA QUILL',
      'JORY',
    ];
    final ys = [for (final name in order) tester.getTopLeft(find.text(name)).dy];
    expect(ys, [...ys]..sort(), reason: 'billed in order of appearance');
    expect(find.text('1.'), findsOneWidget);
    expect(find.text('8.'), findsOneWidget);

    // What the first moment gives.
    final ilse = find.byKey(const ValueKey('entrance-${'ilse'}'));
    expect(ilse, findsNothing, reason: 'keyed by id, not name');
    expect(find.text('Only named'), findsNWidgets(2));
    expect(find.text('Seen'), findsNWidgets(2));
    expect(find.text('Enters: “It was signed in a sharp black hand: Aldous Crane.”'), findsOneWidget);
    expect(find.text('Talked of first in chapter 2.'), findsOneWidget);

    // What an editor would say.
    expect(find.text('WHAT AN EDITOR WOULD SAY'), findsOneWidget);
    expect(
      find.text(
        'Kit Marrow and Aldous Crane enter with nothing but a name. A look, a line or something done gives the reader '
        'someone to hold.',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining('Talked of before they appear: Aldous Crane (chapter 2, on the page in 4)'),
      findsOneWidget,
    );

    // A door pressed: only who comes through it.
    await tester.tap(find.byKey(const ValueKey('door-3')));
    await tester.pumpAndSettle();
    expect(find.text('Chapter 3: 2 entrances. Press it again for the whole cast.'), findsOneWidget);
    expect(find.text('TOBIAH FENN'), findsOneWidget);
    expect(find.text('NAN OTTILIE'), findsOneWidget);
    expect(find.text('WREN HOLLIS'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('door-3')));
    await tester.pumpAndSettle();
    expect(find.text('WREN HOLLIS'), findsOneWidget);

    expect(
      jsonEncode(o.c.read(novelStoreProvider).load(o.novel)!.toJson(exportedAt: 0)),
      o.before,
      reason: 'it only reads',
    );

    await tester.tap(find.text('Read it there').first);
    await tester.pumpAndSettle();
    expect(currentLocation(o.c), '/write');
    expect(o.c.read(selectedNodeProvider), isNotNull);
    expect(o.c.read(pendingFindProvider), isNull, reason: 'the editor took the find');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('on a phone: the doors and the playbill fit', (tester) async {
    await open(tester, const Size(390, 6000));
    expect(find.byType(CastEntrances), findsOneWidget);
    expect(find.text('IN ORDER OF APPEARANCE'), findsOneWidget);
    expect(find.text('JORY'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
