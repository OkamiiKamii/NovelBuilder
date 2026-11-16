import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/vault_rail.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/status_window.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

typedef Vault = ({ProviderContainer c, String novel, String system, String systemName, Map<String, String> people});

/// A novel where Mira and Kai were made before its system (the LitRPG preset), and Orrin after it.
Future<Vault> vault(WidgetTester tester, {Size size = const Size(1200, 2400), String? at}) async {
  final c = await pumpApp(tester, size: size, location: '/organize');
  final novel = c.read(libraryServiceProvider).create({'title': 'The Ninth Key'}).id;
  final s = c.read(characterServiceProvider);
  final people = <String, String>{};
  for (final name in ['Mira', 'Kai']) {
    people[name] = s.change(novel, (x) => x.create(name: name)).id;
  }
  final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
  final system = c.read(progressionServiceProvider).systems(novel, (x) => x.createSystem(litrpg.content));
  people['Orrin'] = s.change(novel, (x) => x.create(name: 'Orrin', epithet: 'The Lantern-bearer')).id;
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(at ?? characterPath(people['Orrin']!));
  await tester.pumpAndSettle();
  return (c: c, novel: novel, system: system.id, systemName: system.name, people: people);
}

List<JsonMap> sheetsOf(Vault v, String name) => [
  for (final r in v.c.read(novelStoreProvider).rowsIn(v.novel, 'systemSheets'))
    if (r['entryId'] == v.people[name]) r,
];

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a character made in a novel with a system has a sheet on it; on each, when there are two', (
    tester,
  ) async {
    final v = await vault(tester);
    expect(sheetsOf(v, 'Orrin').map((r) => r['systemId']), [v.system], reason: 'made after the system');
    expect(sheetsOf(v, 'Mira'), isEmpty, reason: 'made before it: given one by hand');

    // A second system: the next character made has a sheet on both, once each.
    final service = v.c.read(progressionServiceProvider);
    final second = service.systems(v.novel, (x) => x.createSystem()).id;
    v.people['Sefa'] = v.c.read(characterServiceProvider).change(v.novel, (x) => x.create(name: 'Sefa')).id;
    expect(sheetsOf(v, 'Sefa').map((r) => r['systemId']).toSet(), {v.system, second});

    // A novel with no system: no sheet.
    final plain = v.c.read(libraryServiceProvider).create({'title': 'Plain'}).id;
    v.c.read(characterServiceProvider).change(plain, (x) => x.create(name: 'Nobody'));
    expect(v.c.read(novelStoreProvider).rowsIn(plain, 'systemSheets'), isEmpty);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('the vault leads with their status: their window, the summary, and one press to a sheet', (tester) async {
    final v = await vault(tester);
    // Orrin: on the Status tab without asking, his own window.
    expect(currentLocation(v.c), characterPath(v.people['Orrin']!));
    final tabs = find.byType(TabBar);
    expect(find.descendant(of: tabs, matching: find.text('Status')), findsOneWidget);
    expect(find.byType(StatusWindow), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^Status window for Orrin')), findsOneWidget);
    expect(find.text('PROFILE SUMMARY'), findsOneWidget);
    expect(find.text('Their whole sheet'), findsOneWidget, reason: 'he has one');

    // Mira, made before the system: as she would begin, and one press gives her the sheet.
    v.c.read(routerProvider).go(characterPath(v.people['Mira']!));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Status window for Mira')), findsOneWidget);
    final give = find.text('Give Mira a sheet in ${v.systemName}');
    expect(give, findsOneWidget);
    await tester.ensureVisible(give);
    await tester.tap(give);
    await tester.pumpAndSettle();
    expect(sheetsOf(v, 'Mira').map((r) => r['systemId']), [v.system]);
    expect(find.text('Their whole sheet'), findsOneWidget);

    // "Their whole sheet" goes to the sheet, on Progression.
    await tester.tap(find.text('Their whole sheet'));
    await tester.pumpAndSettle();
    expect(currentLocation(v.c), characterPath(v.people['Mira']!, tab: 'progression'));

    // Overview chosen is Overview (not the Status a bare link opens on).
    // (The tabs scroll: with Progression chosen, Overview is scrolled out of sight to the left.)
    final overview = find.descendant(of: tabs, matching: find.text('Overview'));
    await tester.ensureVisible(overview);
    await tester.pumpAndSettle();
    await tester.tap(overview);
    await tester.pumpAndSettle();
    expect(currentLocation(v.c), characterPath(v.people['Mira']!, tab: 'overview'));
    expect(find.byType(StatusWindow), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a novel with no system has no Status tab: its characters open on their Overview', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 2400), location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Plain'}).id;
    final id = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Nobody')).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    c.read(routerProvider).go(characterPath(id, tab: 'status'));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byType(TabBar), matching: find.text('Status')), findsNothing);
    expect(find.byType(StatusWindow), findsNothing);
    expect(find.descendant(of: find.byType(TabBar), matching: find.text('Overview')), findsOneWidget);
  });

  testWidgets('on a wide screen the cast is beside the page: searched, gone through on the same tab, added to', (
    tester,
  ) async {
    final v = await vault(tester, size: const Size(1900, 1200));
    final rail = find.byType(VaultRail);
    expect(rail, findsOneWidget);
    Finder tile(String name) => find.byKey(ValueKey('vault-${v.people[name]}'));
    for (final name in ['Mira', 'Kai', 'Orrin']) {
      expect(tile(name), findsOneWidget, reason: name);
    }
    expect(tester.widget<ListTile>(tile('Orrin')).selected, isTrue, reason: 'the one shown is marked');

    // A search: by an epithet, then a name; Enter goes to the first found.
    final search = find.descendant(of: rail, matching: find.byType(TextField));
    await tester.enterText(search, 'lantern');
    await tester.pumpAndSettle();
    expect(tile('Orrin'), findsOneWidget);
    expect(tile('Mira'), findsNothing);
    await tester.enterText(search, 'KA');
    await tester.pumpAndSettle();
    expect(tile('Kai'), findsOneWidget);
    expect(tile('Orrin'), findsNothing);
    await tester.testTextInput.receiveAction(TextInputAction.go);
    await tester.pumpAndSettle();
    expect(currentLocation(v.c), characterPath(v.people['Kai']!));
    // Going to them keeps the list beside the page as it was: its search, and what it found.
    final kept = find.descendant(of: find.byType(VaultRail), matching: find.byType(TextField));
    expect(tester.widget<TextField>(kept).controller!.text, 'KA');
    expect(tile('Kai'), findsOneWidget);
    expect(tile('Orrin'), findsNothing);

    // On Kai's Relationships, another from the list opens on the same tab.
    v.c.read(routerProvider).go(characterPath(v.people['Kai']!, tab: 'relationships'));
    await tester.pumpAndSettle();
    await tester.enterText(find.descendant(of: find.byType(VaultRail), matching: find.byType(TextField)), '');
    await tester.pumpAndSettle();
    await tester.tap(tile('Mira'));
    await tester.pumpAndSettle();
    expect(currentLocation(v.c), characterPath(v.people['Mira']!, tab: 'relationships'));

    // Alt+↓ and Alt+↑: the next and the one before, in the cast's order (as the list shows it), on the same tab.
    final order = [for (final l in vaultOrder(v.c.read(castProvider)!)) l.entry.id];
    final next = order[(order.indexOf(v.people['Mira']!) + 1) % order.length];
    expect(next, isNot(v.people['Mira']));
    await tester.sendKeyDownEvent(LogicalKeyboardKey.altLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.altLeft);
    await tester.pumpAndSettle();
    expect(currentLocation(v.c), characterPath(next, tab: 'relationships'));
    await tester.tap(find.byTooltip('Previous character (Alt+↑)'));
    await tester.pumpAndSettle();
    expect(currentLocation(v.c), characterPath(v.people['Mira']!, tab: 'relationships'));

    // A new character from the list: made, with a sheet on the system, and opened on their status.
    await tester.tap(find.descendant(of: find.byType(VaultRail), matching: find.text('Add character')));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name *'), 'Wren Hollis');
    await tester.tap(find.text('Add to the cast'));
    await tester.pumpAndSettle();
    final wren = v.c
        .read(novelStoreProvider)
        .rowsIn(v.novel, 'loreEntries')
        .firstWhere((r) => r['name'] == 'Wren Hollis');
    v.people['Wren'] = str(wren['id']);
    expect(currentLocation(v.c), characterPath(v.people['Wren']!));
    expect(sheetsOf(v, 'Wren').map((r) => r['systemId']), [v.system]);
    expect(find.bySemanticsLabel(RegExp('^Status window for Wren Hollis')), findsOneWidget);
    expect(tile('Wren'), findsOneWidget, reason: 'in the list beside');
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a phone, anyone is a search away: the sheet finds them and goes there', (tester) async {
    final v = await vault(tester, size: phone);
    expect(find.byType(VaultRail), findsNothing, reason: 'no room beside the page');
    await tester.tap(find.byTooltip('Find a character'));
    await tester.pumpAndSettle();
    final rail = find.byType(VaultRail);
    expect(rail, findsOneWidget);
    await tester.enterText(find.descendant(of: rail, matching: find.byType(TextField)), 'mi');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ValueKey('vault-${v.people['Mira']}')));
    await tester.pumpAndSettle();
    expect(find.byType(VaultRail), findsNothing, reason: 'the sheet closes');
    expect(currentLocation(v.c), characterPath(v.people['Mira']!));

    // On a phone the page's lesser actions are in its menu, not a column of buttons above her.
    expect(find.widgetWithText(OutlinedButton, 'This or that'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, 'Share their card'), findsNothing);
    await tester.tap(find.byTooltip('More options for Mira'));
    await tester.pumpAndSettle();
    expect(find.text('Mira’s journal'), findsOneWidget);
    expect(find.text('Share their card'), findsOneWidget);
    await tester.tap(find.text('This or that'));
    await tester.pumpAndSettle();
    expect(find.text('In a crowded room, Mira is…'), findsOneWidget, reason: 'the menu runs it');
    expect(tester.takeException(), isNull);
  });
}
