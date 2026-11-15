import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/cast_compass.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// Mark and Kai, opposites; Ilse and Nan, alike in all; all four forgiving; Wren not asked yet.
  Future<void> cast(WidgetTester tester, {Size size = const Size(1200, 3000)}) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Doorwalker'}).id;
    final s = c.read(characterServiceProvider);
    String make(String name, Map<String, int?> sides) {
      final id = s.change(novel, (x) => x.create(name: name)).id;
      if (sides.isNotEmpty) s.change(novel, (x) => recordTraits(x, id, sides));
      return id;
    }

    make('Mark', {'head': -1, 'risk': 1, 'truth': -1, 'lead': -1, 'room': 1, 'grudge': -1});
    make('Kai', {'head': 1, 'risk': -1, 'truth': 1, 'lead': 1, 'room': -1, 'grudge': -1});
    make('Ilse', {'head': -1, 'risk': -1, 'truth': -1, 'lead': 1, 'grudge': -1});
    make('Nan', {'head': -1, 'risk': -1, 'truth': -1, 'lead': 1, 'grudge': -1});
    make('Wren', {});
    c.read(openNovelProvider.notifier).open(novel);
    c.read(castViewProvider.notifier).set(CastView.compass);
    await tester.pumpAndSettle();
  }

  testWidgets('the compass: the board, the foils and where they differ, the twins, what all share, who is not on it', (
    tester,
  ) async {
    await cast(tester);
    expect(find.byType(CastCompass), findsOneWidget);
    // In the cast’s order, whichever comes first.
    expect(find.textContaining(RegExp('Mark & Kai|Kai & Mark')), findsOneWidget);
    expect(find.text('Opposite on 5 of 6'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^(Rational · Emotional|Emotional · Rational)$')), findsOneWidget);
    expect(find.textContaining(RegExp(r'^(Commanding · Deferential|Deferential · Commanding)$')), findsOneWidget);

    expect(find.text('TOO ALIKE'), findsOneWidget);
    expect(find.textContaining(RegExp('Ilse & Nan|Nan & Ilse')), findsOneWidget);
    expect(find.text('Alike on 5 of 5'), findsOneWidget);

    expect(find.text('Everyone who answered is Forgiving (4 of 4). No one in the cast to break it.'), findsOneWidget);

    // Two axes chosen: the board shows them apart.
    final board = find.bySemanticsLabel(RegExp('^The compass: '));
    expect(board, findsOneWidget);
    await tester.tap(find.byWidgetPredicate((w) => w is DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rational or Emotional').last);
    await tester.pumpAndSettle();
    final said = tester.getSemantics(find.bySemanticsLabel(RegExp('^The compass: '))).label;
    expect(said, startsWith('The compass: Rational to Emotional across'));
    expect(said, contains('Kai: Emotional'));

    // Not on the compass yet: Wren, one press from This or that.
    expect(find.text('NOT ON THE COMPASS YET'), findsOneWidget);
  });

  testWidgets('Wren is asked from the compass; on a phone it fits', (tester) async {
    await cast(tester, size: const Size(390, 3400));
    expect(tester.takeException(), isNull);
    final wren = find.ancestor(of: find.text('Wren'), matching: find.byWidgetPredicate((w) => w is Padding)).first;
    await tester.ensureVisible(wren);
    await tester.tap(find.descendant(of: wren, matching: find.text('This or that')));
    await tester.pumpAndSettle();
    expect(find.text('In a crowded room, Wren is…'), findsOneWidget);
  });

  testWidgets('on a phone at twice the text size: the board’s names fit, none broken in two', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await cast(tester, size: const Size(390, 5200));
    expect(tester.takeException(), isNull);
    // The six labels of the board (three across, three down): each one line, made smaller to fit.
    final labels = find.descendant(
      of: find.bySemanticsLabel(RegExp('^The compass: ')),
      matching: find.byType(FittedBox),
    );
    expect(labels, findsNWidgets(6));
    for (final t in tester.widgetList<Text>(find.descendant(of: labels, matching: find.byType(Text)))) {
      expect((t.maxLines, t.softWrap), (1, false), reason: 'a label is one line, never broken in two');
    }
  });
}
