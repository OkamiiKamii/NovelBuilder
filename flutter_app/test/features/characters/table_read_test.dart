import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/table_read_view.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/data/speech.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

/// A voice that says at once, and keeps what it was asked to say, how fast and how high.
class _Voice implements Speaker {
  _Voice({this.there = true});
  final bool there;
  final said = <({String text, double rate, double pitch})>[];

  @override
  Future<bool> available() async => there;

  @override
  Future<bool> say(String text, {double rate = 1, double pitch = 1}) async {
    said.add((text: text, rate: rate, pitch: pitch));
    return true;
  }

  @override
  Future<void> stop() async {}
}

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Future<({ProviderContainer c, String novel, String wren, String ilse})> open(
    WidgetTester tester,
    Speaker voice, {
    Size size = const Size(1200, 14000),
  }) async {
    final c = await pumpApp(tester, size: size, location: '/organize', speaker: voice);
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 15).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(castViewProvider.notifier).set(CastView.tableRead);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    String id(String name) => c.read(castProvider)!.list.firstWhere((l) => l.entry.name == name).entry.id;
    return (c: c, novel: novel.id, wren: id('Wren Hollis'), ilse: id('Ilse Marrow'));
  }

  testWidgets('the first chapter as a script, each line under who says it, and read aloud in the cast’s voices', (
    tester,
  ) async {
    final voice = _Voice();
    final o = await open(tester, voice);
    expect(find.byType(CastTableRead), findsOneWidget);
    expect(find.text('THE CAST’S VOICES'), findsOneWidget);
    expect(find.byKey(ValueKey('voice-${o.wren}')), findsOneWidget);
    expect(find.byKey(ValueKey('voice-${o.ilse}')), findsOneWidget);
    expect(find.text('WREN HOLLIS'), findsWidgets, reason: 'named saying it');
    expect(find.text('ILSE MARROW (likely)'), findsWidgets, reason: '“So soon,” she said: followed from the talk');
    expect(find.text('WHO SAYS THIS?'), findsWidgets, reason: '“Master Marrow” is not one of her names');
    expect(find.textContaining('cannot be told whose they are'), findsOneWidget);

    await tester.tap(find.text('Read it aloud'));
    await tester.pumpAndSettle();
    expect(voice.said.first.text, startsWith('The bell in the Wardens’ tower'));
    expect(voice.said.first.pitch, 1, reason: 'the narration in the device’s own voice');
    final wrens = voice.said.firstWhere((s) => s.text == 'The tide bell,');
    final ilses = voice.said.firstWhere((s) => s.text == 'So soon,');
    expect(wrens.pitch, isNot(ilses.pitch), reason: 'two voices that do not sound alike');
    expect(voice.said.length, greaterThan(20), reason: 'the whole chapter, part by part');

    // Wren's voice raised: kept for the novel, and the next reading higher.
    final before = wrens.pitch;
    await tester.tap(find.byTooltip('Raise Wren Hollis’s voice'));
    await tester.pumpAndSettle();
    expect(o.c.read(settingsStoreProvider).read(tableReadVoicesKey(o.novel)), {o.wren: 1});
    voice.said.clear();
    await tester.tap(find.text('Read it aloud'));
    await tester.pumpAndSettle();
    expect(voice.said.firstWhere((s) => s.text == 'The tide bell,').pitch, greaterThan(before));
  });

  testWidgets('a press on a part reads from there', (tester) async {
    final voice = _Voice();
    await open(tester, voice);
    final part = find.ancestor(of: find.text('Master, it’s the tide bell.'), matching: find.byType(InkWell)).first;
    await tester.tap(part);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Go on'));
    await tester.pumpAndSettle();
    expect(voice.said.first.text, 'Master, it’s the tide bell.');
  });

  testWidgets('no voice on the device: said so, and the script still there; on a phone it fits', (tester) async {
    await open(tester, _Voice(there: false), size: const Size(390, 16000));
    expect(
      find.text('This device has no voice to read with. The script is here to read all the same.'),
      findsOneWidget,
    );
    expect(find.text('Read it aloud'), findsNothing);
    expect(find.text('WREN HOLLIS'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
