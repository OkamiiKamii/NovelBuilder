// The ability tree seen through one character: what they hold (at the end, or as of a chapter), and where every other
// ability stands for them.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/abilities/paths.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';

import 'fixtures.dart';

AbilityNode _node(String key) => AbilityNode(
  key: key,
  ref: EntityRef(EntityType.entry, key),
  name: key,
  source: 'Test',
  sourceKey: 'test',
  color: '#000000',
  rank: null,
  requires: '',
  limits: const [],
);

PathEdge _edge(String from, String to, PathRole role) => PathEdge('$from>$to', from, to, role, role.label, true, null);

void main() {
  test('at the end, what a character holds is what the tree says they hold, on every novel with abilities', () {
    var checked = 0;
    for (final name in [...fixtureNames, 'growth']) {
      final s = loadFixture(name);
      final model = StoryModel.fromSnapshot(s);
      final snapshots = [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)];
      final tree = abilityTree(model, snapshots);
      final ids = {
        for (final n in tree.nodes)
          for (final h in n.holders) h.id,
      };
      for (final id in ids) {
        final fromTree = {
          for (final n in tree.nodes)
            if (n.holders.any((h) => h.id == id)) n.key,
        };
        final drawn = {for (final n in tree.nodes) n.key};
        expect(heldBy(model, snapshots, id).intersection(drawn), fromTree, reason: '$name: $id');
        checked++;
      }
    }
    expect(checked, greaterThan(0), reason: 'some character holds an ability');
  });

  test('as of a chapter, only what was held by then', () {
    final s = loadFixture('growth');
    final model = StoryModel.fromSnapshot(s);
    final snapshots = [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)];
    final reading = [...model.nodes.values]
      ..sort((a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!));
    var differs = false;
    for (final id in {for (final p in snapshots) p.entryId}) {
      final end = heldBy(model, snapshots, id);
      for (final node in reading) {
        final then = heldBy(model, snapshots, id, atNodeId: node.id);
        if (then.length != end.length || !then.containsAll(end)) differs = true;
      }
      // At the last chapter, everything that is held at the end.
      expect(heldBy(model, snapshots, id, atNodeId: reading.last.id), end, reason: id);
    }
    expect(differs, isTrue, reason: 'the fixture has someone whose abilities change over the story');
  });

  test('held, can be gained, or locked: by the prerequisites, alternatives and exclusions recorded', () {
    final tree = AbilityTree(
      [
        for (final k in ['root', 'next', 'both', 'either', 'other', 'excluded', 'rival', 'free']) _node(k),
      ],
      [
        _edge('root', 'next', PathRole.prerequisite),
        _edge('root', 'both', PathRole.prerequisite),
        _edge('next', 'both', PathRole.rule),
        _edge('root', 'either', PathRole.alternative),
        _edge('other', 'either', PathRole.alternative),
        _edge('excluded', 'rival', PathRole.exclusive),
        // An upgrade or evolution is not a requirement: it does not lock what it leads to.
        _edge('root', 'free', PathRole.evolution),
      ],
      const [],
    );
    String name(String k) => k;
    expect(standings(tree, {'root', 'excluded'}), {
      'root': Standing.held,
      'next': Standing.available,
      'both': Standing.locked,
      'either': Standing.available,
      'other': Standing.available,
      'excluded': Standing.held,
      'rival': Standing.locked,
      'free': Standing.available,
    });
    expect(lockedBecause(tree, 'both', {'root'}, name), 'Needs next.');
    expect(lockedBecause(tree, 'either', {}, name), 'Needs one of root, other.');
    expect(lockedBecause(tree, 'rival', {'excluded'}, name), 'Excluded by excluded, which is held.');
    // Someone who holds nothing: what needs nothing can be gained; the rest is locked.
    final none = standings(tree, {});
    expect(
      [
        for (final k in ['root', 'next', 'either']) none[k],
      ],
      [Standing.available, Standing.locked, Standing.locked],
    );
  });
}
