import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/in_one_sentence.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// Mark, 21, male, and nothing more said of him; open on his page.
  Future<({ProviderContainer c, String novel, String mark})> mark(WidgetTester tester, Size size) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Doorwalker'}).id;
    final s = c.read(characterServiceProvider);
    final mark = s.change(novel, (x) => x.create(name: 'Mark')).id;
    s.change(novel, (x) {
      recordIn(x, mark, 'Age', ['age'], '21', sections: const ['identity'], newSection: 'Core Identity');
      recordIn(x, mark, 'Gender', ['gender'], 'Male', sections: const ['identity'], newSection: 'Core Identity');
    });
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go(characterPath(mark));
    await tester.pumpAndSettle();
    return (c: c, novel: novel, mark: mark);
  }

  String field(ProviderContainer c, String novel, String id, String name) {
    final entry = c.read(castProvider)!.list.firstWhere((l) => l.entry.id == id).entry;
    return fieldNamed(entry, name);
  }

  Future<void> fill(WidgetTester tester, String part, String answer) async {
    await tester.tap(find.byKey(ValueKey('sentence-$part')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, answer);
    await tester.pump();
    await tester.tap(find.text('Keep it'));
    await tester.pumpAndSettle();
  }

  testWidgets('Mark in one sentence: the blanks filled in place, each kept in his profile, then whole', (tester) async {
    final m = await mark(tester, const Size(1200, 2400));
    expect(find.byType(InOneSentence), findsOneWidget);
    expect(find.text('4 blanks to fill. Press one: what you write is kept in Mark’s profile.'), findsOneWidget);
    expect(find.text('who he is'), findsOneWidget);
    expect(find.text('what he wants'), findsOneWidget);
    expect(find.byTooltip('Copy the sentence'), findsNothing, reason: 'not a sentence until it is whole');

    await fill(tester, 'wants', 'To open the last door.');
    expect(field(m.c, m.novel, m.mark, 'What they want'), 'To open the last door.');
    expect(find.text('to open the last door'), findsOneWidget);
    expect(find.text('3 blanks to fill. Press one: what you write is kept in Mark’s profile.'), findsOneWidget);

    await fill(tester, 'who', 'A locksmith’s apprentice');
    await fill(tester, 'inTheWay', 'The Architect');
    await fill(tester, 'atStake', 'His sister');
    expect(field(m.c, m.novel, m.mark, 'Occupation'), 'A locksmith’s apprentice');
    expect(find.text('a locksmith’s apprentice'), findsOneWidget);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    await tester.tap(find.byTooltip('Copy the sentence'));
    await tester.pump();
    expect(
      copied,
      'Mark, 21, a locksmith’s apprentice, wants to open the last door, but the Architect stands in his way. '
      'If he fails, he loses his sister.',
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null);
    expect(find.byTooltip('Copy the sentence'), findsOneWidget);
    expect(find.textContaining('Mark in one sentence: the pitch'), findsOneWidget);

    // A part changed: the same field, written over.
    await fill(tester, 'wants', 'To close every door');
    expect(field(m.c, m.novel, m.mark, 'What they want'), 'To close every door');

    // What he wants now sparks a scene with him.
    await tester.tap(find.text('Write Mark in'));
    await tester.pumpAndSettle();
    expect(find.text('Mark goes after what they want: “To close every door”'), findsOneWidget);
  });

  testWidgets('cancelled, nothing is kept; on a phone it fits', (tester) async {
    final m = await mark(tester, const Size(390, 2400));
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const ValueKey('sentence-atStake')));
    await tester.pumpAndSettle();
    expect(find.text('What could Mark lose?'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Everything');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(field(m.c, m.novel, m.mark, 'What they stand to lose'), isEmpty);
    expect(find.text('what is at stake'), findsOneWidget);
  });
}
