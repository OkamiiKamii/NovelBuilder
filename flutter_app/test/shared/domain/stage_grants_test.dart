// "Every new tier, a new power": a stage of a system gives items, and a sheet at that stage or one after it holds
// them, with their effects counted, marked as from the stage that gave them.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/compute.dart';
import 'package:novel_builder/shared/domain/systems/system_changes.dart';

JsonMap tiers({
  List<String> dTier = const [],
  List<String> cTier = const ['sand'],
  List<String> bTier = const ['ice'],
}) => {
  'name': 'Super Power',
  'variables': [
    {'id': 'str', 'name': 'Strength', 'key': 'str', 'kind': 'number', 'base': 10},
  ],
  'tracks': [
    {
      'id': 'rank',
      'name': 'Tier',
      'key': 'tier',
      'kind': 'stages',
      'stages': [
        {'id': 'd', 'name': 'D Tier', 'grants': dTier},
        {'id': 'c', 'name': 'C Tier', 'grants': cTier},
        {'id': 'b', 'name': 'B Tier', 'grants': bTier},
      ],
    },
  ],
  'groups': [
    {'id': 'powers', 'name': 'Powers'},
  ],
  'items': [
    {
      'id': 'sand',
      'groupId': 'powers',
      'name': 'Sandman',
      'requires': 'str >= 1',
      'modifiers': [
        {'id': 'm1', 'target': 'str', 'op': 'add', 'value': '5'},
      ],
    },
    {'id': 'ice', 'groupId': 'powers', 'name': 'IceMan', 'requires': 'str >= 1'},
    {'id': 'fly', 'groupId': 'powers', 'name': 'Flight', 'requires': 'str >= 1'},
  ],
};

SystemBlueprint system([JsonMap? raw]) => SystemBlueprint({'id': 'sys', ...tidyBlueprint(raw ?? tiers())});

Iterable<String> held(ComputedSheet s) => s.items.map((i) => i.item.name);
double strength(ComputedSheet s) => s.rows.firstWhere((r) => r.variable.id == 'str').value! as double;

void main() {
  test('a stage gives its items at that stage and every one after it, not before', () {
    final sys = system();
    final atD = computeSheet(sys, const SheetProfile(progress: {'rank': 'd'}));
    expect(held(atD), isEmpty);
    expect(strength(atD), 10);

    final atC = computeSheet(sys, const SheetProfile(progress: {'rank': 'c'}));
    expect(held(atC), ['Sandman']);
    expect(atC.items.single.from, 'C Tier');
    expect(strength(atC), 15, reason: "the power's effects are counted");

    final atB = computeSheet(sys, const SheetProfile(progress: {'rank': 'b'}));
    expect(held(atB), unorderedEquals(['Sandman', 'IceMan']));
    expect({for (final i in atB.items) i.item.name: i.from}, {'Sandman': 'C Tier', 'IceMan': 'B Tier'});
  });

  test('no stage chosen is the first stage', () {
    final sys = system(tiers(dTier: ['fly']));
    expect(held(computeSheet(sys)), ['Flight']);
  });

  test('chosen as well as given: held once, as its own', () {
    final sys = system();
    final s = computeSheet(sys, const SheetProfile(progress: {'rank': 'b'}, itemIds: ['sand']));
    expect(held(s).where((n) => n == 'Sandman'), hasLength(1));
    expect(s.items.firstWhere((i) => i.item.name == 'Sandman').from, isNull);
    expect(s.items.firstWhere((i) => i.item.name == 'IceMan').from, 'B Tier');
    expect(strength(s), 15, reason: 'counted once');
    expect(s.available.map((i) => i.name), ['Flight'], reason: 'what is held, given or chosen, is not offered');
  });

  test('tidying keeps what a stage gives, once, and drops what is no longer in the blueprint', () {
    final tidy = tidyBlueprint(tiers(cTier: ['sand', 'sand', 'gone', '']));
    final stages = maps(maps(tidy['tracks']).single['stages']).toList();
    expect(strings(stages[1]['grants']), ['sand']);
    expect(strings(stages[2]['grants']), ['ice']);

    // An item taken out of the blueprint: no stage gives it any more.
    final without = tidyBlueprint({
      ...tidy,
      'items': [
        for (final i in maps(tidy['items']))
          if (i['id'] != 'ice') i,
      ],
    });
    expect(strings(maps(maps(without['tracks']).single['stages']).last['grants']), isEmpty);
  });

  test('a copy of a blueprint gives its own copies of the items', () {
    var n = 0;
    final copy = instantiateBlueprint(tidyBlueprint(tiers()), () => 'new${n++}');
    final items = {for (final i in maps(copy['items'])) str(i['name']): str(i['id'])};
    final stages = maps(maps(copy['tracks']).single['stages']).toList();
    expect(strings(stages[1]['grants']), [items['Sandman']]);
    expect(strings(stages[2]['grants']), [items['IceMan']]);
    expect(items.values, isNot(contains('sand')));
    final sys = SystemBlueprint({'id': 'copy', ...copy});
    final atB = computeSheet(sys, SheetProfile(progress: {sys.tracks.single.id: stages[2]['id']! as String}));
    expect(held(atB), unorderedEquals(['Sandman', 'IceMan']));
  });
}
