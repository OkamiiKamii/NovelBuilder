import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/cameo.dart';
import 'package:novel_builder/features/characters/widgets/cast_card.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/pump_app.dart';

Entry _entry(Map<String, String> fields, [String id = 'c1']) => Entry({
  'id': id,
  'name': 'Someone',
  'category': 'character',
  'fields': [
    for (final MapEntry(:key, :value) in fields.entries) {'id': key, 'key': key, 'value': value},
  ],
});

void main() {
  test('the cameo reads its look from what is recorded, and draws plainly what is not', () {
    expect(cameoLookOf(_entry({'Gender': 'Female'}), null).hair, CameoHair.long);
    expect(cameoLookOf(_entry({'Gender': 'Male'}), null).hair, CameoHair.short);
    expect(cameoLookOf(_entry({'Gender': 'non-binary'}), null).hair, CameoHair.shoulder);
    expect(cameoLookOf(_entry({}), null).hair, CameoHair.shoulder, reason: 'nothing recorded: nothing guessed');
    expect(cameoLookOf(_entry({'Age': '64'}), null).silver, isTrue);
    expect(cameoLookOf(_entry({'Age': 'very old'}), null).silver, isTrue);
    expect(cameoLookOf(_entry({'Age': '20'}), null).silver, isFalse);
    expect(cameoLookOf(_entry({'Species': 'High Elf'}), null).pointedEars, isTrue);
    expect(cameoLookOf(_entry({'Species': 'Human'}), null).pointedEars, isFalse);
    final dead = CharacterProfile({'id': 'p', 'entryId': 'c1', 'status': 'Deceased'});
    expect(cameoLookOf(_entry({}), dead).gone, isTrue);
    expect(cameoLookOf(_entry({}), CharacterProfile({'id': 'p', 'status': 'Alive'})).gone, isFalse);
    expect(cameoLookOf(_entry({}, 'a'), null).seed, isNot(cameoLookOf(_entry({}, 'b'), null).seed));
  });

  testWidgets('the cast wall and a character’s page draw a cameo for someone with no picture', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill'}).id;
    final james = c
        .read(characterServiceProvider)
        .change(novel, (x) => x.create(name: 'James', roles: ['Protagonist']))
        .id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    // On the wall (a small cast also stands them on the empty-chairs stage).
    expect(find.descendant(of: find.byType(CastWall), matching: find.byType(Cameo)), findsOneWidget);
    expect(find.text('J'), findsNothing, reason: 'no bare initial in its place');

    c.read(routerProvider).go('/organize/character/$james');
    await tester.pumpAndSettle();
    expect(find.byType(Cameo), findsWidgets);
    expect(find.bySemanticsLabel(RegExp('James has no portrait')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
