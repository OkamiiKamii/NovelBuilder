import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/vault.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';
import 'vault_test_data.dart';

Future<({ProviderContainer c, String novel, String kael})> _open(
  WidgetTester tester, {
  Size size = const Size(1300, 1800),
}) async {
  final c = await pumpApp(tester, size: size, location: '/');
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  final kael = addKaelen(c, novel.id);
  c.read(openNovelProvider.notifier).open(novel.id);
  c.read(routerProvider).go('/organize/character/$kael');
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, kael: kael);
}

void main() {
  testWidgets('the vault shows who they are from their own record: name, epithet, identity facts, traits, symbol', (
    tester,
  ) async {
    await _open(tester);
    expect(find.text('Character Vault'), findsOneWidget);
    expect(find.text('Kaelen Draven'), findsOneWidget);
    expect(find.text('The Oathbreaker'), findsOneWidget);
    // The first fields of the first Overview section, in order, as facts.
    for (final label in ['Age: 27', 'Gender: Male', 'Occupation: Warrior', 'Alignment: Chaotic Neutral']) {
      expect(find.bySemanticsLabel(label), findsOneWidget, reason: label);
    }
    // Traits are chips; the symbol has its own row.
    expect(find.descendant(of: find.byType(VaultChips), matching: find.text('Protective')), findsOneWidget);
    expect(find.bySemanticsLabel('Symbol: Broken Sword'), findsOneWidget);
    expect(find.text('Betrayed by the king he swore to protect.'), findsOneWidget);
  });

  testWidgets('the web shows the people they have a relationship with, joined, and opens them', (tester) async {
    final w = await _open(tester);
    final web = find.byType(RelationWeb);
    expect(web, findsOneWidget);
    expect(find.bySemanticsLabel('Kaelen Draven, in the middle'), findsOneWidget);
    for (final said in [
      'Mira Vale: Rival',
      'Ren Ashford: Ally',
      'Sera Lune: Romantic interest',
      'Tomas Hale: Mentor',
      'Ilya Thorn: Enemy',
    ]) {
      expect(
        find.bySemanticsLabel(RegExp('^${RegExp.escape(said)}\\. Open their profile\$')),
        findsOneWidget,
        reason: said,
      );
    }
    await tester.ensureVisible(find.bySemanticsLabel(RegExp('^Mira Vale: ')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: web, matching: find.text('Mira Vale')));
    await tester.pumpAndSettle();
    final mira = w.c.read(castProvider)!.characters().firstWhere((e) => e.name == 'Mira Vale');
    expect(currentLocation(w.c), '/organize/character/${mira.id}');
  });

  testWidgets('with no relationships, the web says so; with no identity facts, none are made up', (tester) async {
    final c = await pumpApp(tester, size: const Size(1300, 1400), location: '/');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
    final id = c.read(characterServiceProvider).change(novel.id, (ch) => ch.create(name: 'Nobody Yet').id);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(routerProvider).go('/organize/character/$id');
    await tester.pumpAndSettle();
    expect(find.textContaining('No relationships recorded yet'), findsOneWidget);
    expect(find.byType(VaultFact), findsNothing);
    expect(find.bySemanticsLabel(RegExp('^Symbol:')), findsNothing);
  });

  testWidgets('on a phone at twice the text size, the vault stacks and fits', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _open(tester, size: phone);
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.byType(RelationWeb), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
