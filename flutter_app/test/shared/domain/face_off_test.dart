import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/compute.dart';
import 'package:novel_builder/shared/domain/systems/face_off.dart';

void main() {
  final system = SystemBlueprint({
    'name': 'Test',
    'variables': [
      {'id': 's', 'name': 'Strength', 'key': 'strength', 'kind': 'number', 'base': 10},
      {'id': 'a', 'name': 'Agility', 'key': 'agility', 'kind': 'number', 'base': 10},
      {'id': 'h', 'name': 'Health', 'key': 'health', 'kind': 'derived', 'formula': 'strength * 10', 'unit': 'HP'},
      {
        'id': 'c',
        'name': 'Path',
        'key': 'path',
        'kind': 'choice',
        'options': ['Light', 'Dark'],
      },
    ],
    'groups': [
      {'id': 'g', 'name': 'Skills'},
    ],
    'items': [
      {'id': 'i1', 'groupId': 'g', 'name': 'Spark'},
      {'id': 'i2', 'groupId': 'g', 'name': 'Ward'},
    ],
  });
  ComputedSheet sheet(Map<String, Object> values, List<String> held) =>
      computeSheet(system, SheetProfile(values: values, itemIds: held));

  test('each number both have, side by side; who leads, the widest gap, what each alone holds', () {
    final f = faceOff(
      sheet({'s': 24.0, 'a': 9.0}, ['i1', 'i2']),
      sheet({'s': 12.0, 'a': 11.0}, ['i1']),
      aName: 'Crane',
      bName: 'Wren',
    );
    expect(
      [for (final r in f.rows) (r.name, r.a, r.b)],
      [('Strength', 24.0, 12.0), ('Agility', 9.0, 11.0), ('Health', 240.0, 120.0)],
      reason: 'not the choice',
    );
    expect(f.says, [
      'Crane leads in 2 of 3; Wren only in Agility.',
      'The widest gap: Strength, Crane 24 to Wren 12 (2 times).',
      'Only Crane holds Ward.',
    ]);
  });

  test('even in everything; a smaller gap as a share; none worth naming under half again', () {
    expect(faceOff(sheet({}, []), sheet({}, []), aName: 'A', bName: 'B').says, ['A and B are even in everything.']);
    final f = faceOff(sheet({'s': 15.0}, []), sheet({'s': 10.0}, []), aName: 'A', bName: 'B');
    expect(f.says, ['A leads in all 2.', 'The widest gap: Strength, A 15 to B 10 (50% more).']);
    final close = faceOff(sheet({'s': 12.0}, []), sheet({'s': 10.0}, []), aName: 'A', bName: 'B');
    expect(close.says, ['A leads in all 2.']);
  });
}
