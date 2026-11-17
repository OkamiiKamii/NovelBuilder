import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

typedef Sheeted = ({ProviderContainer c, String novel, String id, SystemBlueprint system});

/// A novel with [preset]'s system and Protagonist on it, at their Status; [setUp] changes their sheet first.
Future<Sheeted> sheeted(
  WidgetTester tester, {
  String preset = 'litrpg',
  Size size = phone,
  JsonMap Function(SystemBlueprint system, SystemSheet sheet)? setUp,
}) async {
  final c = await pumpApp(tester, size: size, location: '/organize');
  final novel = c.read(libraryServiceProvider).create({'title': 'Super Power'}).id;
  final content = systemPresets.firstWhere((p) => p.id == preset).content;
  final system = c.read(progressionServiceProvider).systems(novel, (x) => x.createSystem(content));
  final id = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Protagonist')).id;
  if (setUp != null) {
    c.read(progressionServiceProvider).systems(novel, (x) {
      final sheet = x.sheets().firstWhere((s) => s.entryId == id);
      x.updateSheet(sheet.id, (s) => setUp(system, s));
    });
  }
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(characterPath(id));
  await tester.pumpAndSettle();
  return (c: c, novel: novel, id: id, system: system);
}

SystemSheet sheetOf(Sheeted s) =>
    SystemSheet(s.c.read(novelStoreProvider).rowsIn(s.novel, 'systemSheets').firstWhere((r) => r['entryId'] == s.id));

String variable(Sheeted s, String name) => s.system.variables.firstWhere((v) => v.name == name).id;

Future<void> press(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('their numbers changed in the window itself: a step, a number typed, within what it can be', (
    tester,
  ) async {
    final s = await sheeted(tester);
    expect(find.byTooltip('More Strength'), findsNothing, reason: 'it only shows, until asked');
    await press(tester, find.text('Change their numbers'));

    // Strength: two steps up, kept at once; what follows from it is worked out again.
    await press(tester, find.byTooltip('More Strength'));
    await press(tester, find.byTooltip('More Strength'));
    expect(sheetOf(s).values[variable(s, 'Strength')], 12);
    expect(find.text('12'), findsOneWidget);

    // A level: not below 1; one up.
    final less = tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.remove).first);
    expect(less.onPressed, isNull, reason: 'Level 1: none lower');
    await press(tester, find.byTooltip('More Level'));
    final level = s.system.tracks.firstWhere((t) => t.kind == 'levels');
    expect(sheetOf(s).progress[level.id], 2);

    // A number typed: Agility 17.
    await press(tester, find.bySemanticsLabel(RegExp(r'^Agility: 10\. Press to type a number\.')));
    await tester.enterText(find.byType(TextField).last, '17');
    await press(tester, find.text('Set'));
    expect(sheetOf(s).values[variable(s, 'Agility')], 17);

    // What is left of a resource is not more than its most: HP typed as 999 is kept as its most.
    await press(tester, find.bySemanticsLabel(RegExp(r'^HP: 100\. Press to type a number\.')));
    final most = find.textContaining('at most');
    final cap = double.parse(tester.widget<Text>(most).data!.replaceAll(RegExp(r'[^0-9.]'), ''));
    await tester.enterText(find.byType(TextField).last, '999');
    await press(tester, find.text('Set'));
    final hp = s.system.variables.firstWhere((v) => v.kind == 'resource');
    expect(sheetOf(s).values[hp.id], cap);

    // Done: shown again, as the window shows it, with what was changed.
    await press(tester, find.text('Done'));
    expect(find.byTooltip('More Strength'), findsNothing);
    expect(find.bySemanticsLabel(RegExp('^Status window for Protagonist')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('what a class adds stays the class\'s: a step changes their own number, shown with what it comes to', (
    tester,
  ) async {
    final s = await sheeted(
      tester,
      setUp: (system, sheet) => {
        // The Warrior class: Strength +5.
        'itemIds': [system.items.firstWhere((i) => i.name == 'Warrior').id],
      },
    );
    await press(tester, find.text('Change their numbers'));
    expect(find.text('→ 15 ▲'), findsNothing);
    expect(find.text('→ 15'), findsOneWidget, reason: 'their own 10, and what it comes to with the class');
    await press(tester, find.byTooltip('More Strength'));
    expect(sheetOf(s).values[variable(s, 'Strength')], 11, reason: 'their own number, not 16');
    expect(find.text('→ 16'), findsOneWidget);
  });

  testWidgets('what they hold changed in the window: a class given, its numbers with it; one at a time; taken away', (
    tester,
  ) async {
    final s = await sheeted(tester);
    final classes = s.system.groupList.firstWhere((g) => g.name == 'Classes');
    final skills = s.system.groupList.firstWhere((g) => g.name == 'Skills');
    final classItems = s.system.items.where((i) => i.groupId == classes.id).toList();
    final skill = s.system.items.firstWhere((i) => i.groupId == skills.id);
    expect(classItems.length, greaterThan(1), reason: 'a choice of class');
    expect(find.byTooltip('Add to Classes'), findsNothing, reason: 'only while their sheet is being changed');
    await press(tester, find.text('Change their numbers'));
    expect(find.text('CLASSES · ONE AT A TIME'), findsOneWidget);
    expect(find.text('None held'), findsWidgets);

    // Warrior given: held, and Strength comes to 15 with it.
    await press(tester, find.byTooltip('Add to Classes'));
    await press(tester, find.text(classItems.first.name).last);
    expect(sheetOf(s).itemIds, [classItems.first.id]);
    expect(find.text('→ 15'), findsOneWidget, reason: 'their own 10, and what the class adds');

    // Another class: one at a time, the one chosen last kept. And a skill beside it.
    await press(tester, find.byTooltip('Add to Classes'));
    await press(tester, find.text(classItems[1].name).last);
    expect(sheetOf(s).itemIds, [classItems[1].id]);
    await press(tester, find.byTooltip('Add to Skills'));
    await press(tester, find.textContaining(skill.name).last);
    expect(sheetOf(s).itemIds.toSet(), {classItems[1].id, skill.id});

    // Taken away.
    await press(tester, find.byTooltip('Take away ${skill.name}'));
    expect(sheetOf(s).itemIds, [classItems[1].id]);
    expect(find.byTooltip('Take away ${skill.name}'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a power the system does not have yet: named in the window, made in its group and held, never twice', (
    tester,
  ) async {
    final s = await sheeted(tester);
    final skills = s.system.groupList.firstWhere((g) => g.name == 'Skills');
    await press(tester, find.text('Change their numbers'));

    Future<void> newSkill(String name) async {
      await press(tester, find.byTooltip('Add to Skills'));
      await press(tester, find.text('New in Skills…'));
      await tester.enterText(find.byType(TextField).last, name);
      await press(tester, find.text('Give it to Protagonist'));
    }

    await newSkill('Sandman');
    SystemBlueprint stored() => SystemBlueprint(
      s.c.read(novelStoreProvider).rowsIn(s.novel, 'systems').firstWhere((r) => r['id'] == s.system.id),
    );
    final sandman = stored().items.where((i) => i.name == 'Sandman').toList();
    expect(sandman, hasLength(1), reason: 'in the system now');
    expect(sandman.single.groupId, skills.id, reason: 'among its skills');
    expect(sheetOf(s).itemIds, [sandman.single.id], reason: 'and held');
    expect(find.text('Sandman'), findsWidgets, reason: 'in the window, as held');
    expect(find.byTooltip('Take away Sandman'), findsOneWidget);

    // The same name again (letter case aside): the one there is, not a second.
    await newSkill('  sandman ');
    expect(stored().items.where((i) => i.name.toLowerCase() == 'sandman'), hasLength(1));
    expect(sheetOf(s).itemIds, [sandman.single.id]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a level their experience gives is not stepped here; a stage is chosen', (tester) async {
    final s = await sheeted(
      tester,
      setUp: (system, sheet) => {
        'xp': [
          {'trackId': system.tracks.firstWhere((t) => t.kind == 'levels').id, 'amount': 250, 'source': 'The wolves'},
        ],
      },
    );
    await press(tester, find.text('Change their numbers'));
    expect(sheetOf(s).xp, isNotEmpty, reason: 'their level comes of experience logged');
    expect(find.byTooltip('More Level'), findsNothing, reason: 'where it started is changed on the whole sheet');
    expect(find.byTooltip('More Strength'), findsOneWidget);

    // A system of stages (cultivation's realms): one chosen from all of them.
    await tester.pumpWidget(const SizedBox());
    final t = await sheeted(tester, preset: 'cultivation');
    await press(tester, find.text('Change their numbers'));
    final realms = t.system.tracks.firstWhere((x) => x.kind == 'stages');
    await press(tester, find.byType(DropdownButton<String>).first);
    await press(tester, find.text(realms.stages[1].name).last);
    expect(sheetOf(t).progress[realms.id], realms.stages[1].id);
  });

  testWidgets('every new tier, a new power: a tier chosen in the window gives what the blueprint says it gives', (
    tester,
  ) async {
    final s = await sheeted(tester, preset: 'superhero');
    final tiers = s.system.tracks.firstWhere((x) => x.kind == 'stages');
    final power = s.system.items.firstWhere((i) => i.name == 'Kinetic Release');
    final second = tiers.stages[1];
    s.c
        .read(progressionServiceProvider)
        .systems(
          s.novel,
          (x) => x.updateSystem(
            s.system.id,
            (c) => {
              'tracks': [
                for (final t in maps(c.raw['tracks']))
                  t['id'] != tiers.id
                      ? t
                      : {
                          ...t,
                          'stages': [
                            for (final st in maps(t['stages']))
                              st['id'] == second.id
                                  ? {
                                      ...st,
                                      'grants': [power.id],
                                    }
                                  : st,
                          ],
                        },
              ],
            },
          ),
        );
    await tester.pumpAndSettle();
    expect(find.text(power.name), findsNothing, reason: 'at ${tiers.stages.first.name}: not yet');

    await press(tester, find.text('Change their numbers'));
    final choose = find.ancestor(of: find.text(tiers.stages.first.name), matching: find.byType(DropdownButton<String>));
    await press(tester, choose.first);
    await press(tester, find.text(second.name).last);
    expect(sheetOf(s).progress[tiers.id], second.id);
    expect(find.text(power.name), findsOneWidget, reason: 'reaching ${second.name} gives it');
    expect(find.text('from ${second.name}'), findsOneWidget);
    expect(find.byTooltip('Take away ${power.name}'), findsNothing, reason: 'it goes with the tier, not from here');
    expect(sheetOf(s).itemIds, isNot(contains(power.id)), reason: 'given by the tier, not written on the sheet');

    // Back down a tier: it goes with it.
    await press(tester, find.ancestor(of: find.text(second.name), matching: find.byType(DropdownButton<String>)).first);
    await press(tester, find.text(tiers.stages.first.name).last);
    expect(find.text(power.name), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final size in [phone, const Size(1900, 1200)]) {
    testWidgets('changing their numbers is pressable, named and readable (${size.width.toInt()} wide)', (tester) async {
      final semantics = tester.ensureSemantics();
      // Holding a class: its card and its button to take it away are checked too, beside each group's Add.
      await sheeted(
        tester,
        size: size,
        setUp: (system, sheet) => {
          'itemIds': [system.items.firstWhere((i) => i.name == 'Warrior').id],
        },
      );
      await press(tester, find.text('Change their numbers'));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      semantics.dispose();
    });
  }

  testWidgets('changing their numbers fits a phone at twice the text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    for (final preset in systemPresets) {
      await tester.pumpWidget(const SizedBox());
      await sheeted(tester, preset: preset.id);
      await press(tester, find.text('Change their numbers'));
      expect(tester.takeException(), isNull, reason: preset.id);
    }
  });

  testWidgets(
    'a character\'s Overview fits a phone at twice the text size (their voice\'s key once ran off the edge)',
    (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final c = await pumpApp(tester, size: phone);
      final store = c.read(novelStoreProvider);
      final novel = addSampleNovel(store, now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
      final wren = str(store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis')['id']);
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      c.read(routerProvider).go(characterPath(wren, tab: 'overview'));
      await tester.pumpAndSettle();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pumpAndSettle();
      expect(find.text('the rest of the cast'), findsOneWidget, reason: 'their voice, with the cast to set it against');
      expect(tester.takeException(), isNull);
    },
  );
}
