import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';
const _war = '9b149a4b-9c56-44d6-bb6c-a0e18aa36220-c3';

Future<ProviderContainer> start(WidgetTester tester, String location, {Size size = const Size(1400, 2600)}) async {
  final c = await pumpApp(tester, size: size, location: '/');
  c.read(novelStoreProvider).putNovel(loadFixture('made-in-the-app'));
  c.read(openNovelProvider.notifier).open(_novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return c;
}

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f.first);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('from a chapter\'s plan: what is recorded there, what may be affected, and nothing changed', (
    tester,
  ) async {
    final c = await start(tester, '/plan/chapter/$_war');
    final before = c.read(novelStoreProvider).load(_novel)!.toJson()['collections'];
    await tap(tester, find.textContaining('What depends on this'));
    expect(currentLocation(c), '/review/consequences?node=$_war');
    expect(find.text('If The War changes'), findsOneWidget);
    expect(find.textContaining('3 Characters, 1 Relationship, 3 Events'), findsOneWidget);
    expect(find.textContaining('Bren and Kai become “Enemies” starting in The War.'), findsOneWidget);
    expect(find.textContaining('Recorded at this point'), findsOneWidget);
    expect(find.textContaining('May be affected later'), findsOneWidget);
    // A tick for what has been looked at, kept on this device.
    final box = find.byType(Checkbox).first;
    await tap(tester, box);
    expect(tester.widget<Checkbox>(box).value, isTrue);
    final looked = c.read(settingsStoreProvider).read('consequences.looked.$_novel.node:$_war');
    expect(looked, isA<List<Object?>>().having((l) => l.length, 'length', 1));
    // Nothing in the novel changed.
    expect(c.read(novelStoreProvider).load(_novel)!.toJson()['collections'], before);
    // Opening a recorded relationship goes to it.
    await tap(tester, find.widgetWithText(TextButton, 'Open'));
    expect(currentLocation(c), startsWith('/organize/relationship/'));
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('who it involves can be changed: an entry left out is no longer counted', (tester) async {
    final c = await start(tester, '/review/consequences?node=$_war');
    expect(find.textContaining('3 Characters'), findsOneWidget);
    final chip = find.byType(InputChip).first;
    final name = (tester.widget<InputChip>(chip).label as Text).data!;
    await tap(tester, find.byTooltip('Leave out $name'));
    expect(find.widgetWithText(InputChip, name), findsNothing);
    expect(currentLocation(c), '/review/consequences?node=$_war');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('an event and a plot development can be picked too; a page with nothing chosen says what to do', (
    tester,
  ) async {
    final c = await start(tester, '/review/consequences');
    expect(find.text('Pick the point you are thinking of changing'), findsOneWidget);
    await tap(tester, find.text('An event'));
    await tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'Event'));
    await tester.tap(find.text('The false coronation').last);
    await tester.pumpAndSettle();
    expect(currentLocation(c), startsWith('/review/consequences?event='));
    expect(find.textContaining('If the event'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('on a phone at twice the text size, the page fits', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await start(tester, '/review/consequences?node=$_war', size: phone);
    expect(tester.takeException(), isNull);
    expect(find.text('If The War changes'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
  });
}
