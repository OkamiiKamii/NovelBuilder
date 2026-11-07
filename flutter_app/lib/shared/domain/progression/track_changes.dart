import 'dart:math' as math;

import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import '../records/progress.dart';
import '../records/system.dart';
import 'track.dart';

/// The collections a change to progression reads and writes.
const trackerCollections = {
  'progressCategories',
  'progressChanges',
  'progressSnapshots',
  'loreEntries',
  'chapters',
  'timelineEvents',
  'systems',
  'systemSheets',
};

const _precisions = ['exact', 'approximate', 'relative', 'unknown'];

String _text(Object? v, [int max = 500]) {
  final s = v is String ? v.trim() : '';
  return s.length > max ? s.substring(0, max) : s;
}

List<String> _strings(Object? v) => {
  for (final x in listOf(v))
    if (_text(x, 120).isNotEmpty) _text(x, 120),
}.take(100).toList();

/// What the novel tracks about its characters, and each change recorded, as in the original's tracker service. The
/// values themselves are never judged: "over nine thousand" is a level if the author says so.
class TrackChanges extends RecordChanges {
  TrackChanges(super.snapshot, {required super.now, required super.createId});

  List<ProgressCategory> categories() {
    final all = [for (final r in rows('progressCategories')) ProgressCategory(r)]
      ..sort((a, b) {
        final o = a.order.compareTo(b.order);
        return o != 0 ? o : a.name.compareTo(b.name);
      });
    return all;
  }

  List<ProgressChange> changes() => [for (final r in rows('progressChanges')) ProgressChange(r)];

  ProgressCategory _category(String id) => ProgressCategory(
    row('progressCategories', id) ?? (throw ChangeRefused('That progression category is not in this novel.')),
  );

  bool _mine(String collection, Object? id) => id is String && id.isNotEmpty && row(collection, id) != null;

  /// Creates a category ([id] null) or changes one. Its shape is fixed once changes are recorded in it, so none of them
  /// stops making sense.
  ProgressCategory saveCategory(
    String? id, {
    String? name,
    String? shape,
    List<String>? ladder,
    List<String>? characterIds,
    num? order,
    bool? archived,
  }) {
    final all = categories();
    final current = id == null ? null : _category(id);
    final named = _text(name ?? current?.name, 60);
    if (named.isEmpty) throw ChangeRefused('Give the category a name.');
    final clash = all.where((c) => c.id != current?.id && c.name.toLowerCase() == named.toLowerCase()).firstOrNull;
    if (clash != null) throw ChangeRefused('There is already a category called “${clash.name}”.');
    final shaped = shape ?? current?.shape ?? 'held';
    if (!progressShapes.contains(shaped)) throw ChangeRefused('That is not a shape a category can have.');
    if (current != null && shaped != current.shape && changes().any((c) => c.categoryId == current.id)) {
      throw ChangeRefused('“${current.name}” has changes recorded in it, so its shape stays as it is.');
    }
    final people = [
      for (final characterId in _strings(characterIds ?? current?.characterIds))
        if (_mine('loreEntries', characterId)) characterId,
    ];
    final saved = <String, Object?>{
      ...?current?.raw,
      'id': current?.id ?? newId(),
      'projectId': projectId,
      'name': named,
      'shape': shaped,
      'ladder': shaped == 'value' ? _strings(ladder ?? current?.ladder) : <String>[],
      'characterIds': people,
      'order': order != null && order.isFinite
          ? order
          : (current?.order ?? all.fold<num>(-1, (m, c) => math.max(m, c.order)) + 1),
      'createdAt': current?.raw['createdAt'] ?? now,
      'updatedAt': now,
    }..remove('archived');
    if (archived ?? current?.archived ?? false) saved['archived'] = true;
    put('progressCategories', saved);
    return ProgressCategory(saved);
  }

  /// Adds one of the offered categories, by name; one already here by that name is returned as it is.
  ProgressCategory addPreset(String name) {
    final preset = progressPresets.where((p) => p.name == name).firstOrNull;
    if (preset == null) throw ChangeRefused('There is no such category to start from.');
    final all = categories();
    final here = all.where((c) => c.name.toLowerCase() == preset.name.toLowerCase()).firstOrNull;
    if (here != null) return here;
    final saved = {
      'id': newId(),
      'projectId': projectId,
      'name': preset.name,
      'shape': preset.shape,
      'ladder': <String>[],
      'characterIds': <String>[],
      'order': all.fold<num>(-1, (m, c) => math.max(m, c.order)) + 1,
      'createdAt': now,
      'updatedAt': now,
    };
    put('progressCategories', saved);
    return ProgressCategory(saved);
  }

  /// Removes a category with nothing recorded in it. One with changes is archived instead, so nothing is lost.
  void removeCategory(String id) {
    final category = _category(id);
    final used = changes().where((c) => c.categoryId == id).length;
    if (used > 0) {
      throw ChangeRefused(
        '“${category.name}” has $used ${used == 1 ? 'change' : 'changes'} recorded. Archive it instead: they are kept.',
      );
    }
    remove('progressCategories', id);
  }

  /// A point in the story must be a chapter or scene or event of this novel, or a date; null is before the story.
  Object? _cleanAt(Object? at, {required bool given}) {
    if (!given) return unknownTime;
    if (at == null) return null;
    final a = mapOrNull(at);
    if (a == null) return unknownTime;
    if (a['kind'] == 'node' && _mine('chapters', a['nodeId'])) return {'kind': 'node', 'nodeId': a['nodeId']};
    if (a['kind'] == 'event' && _mine('timelineEvents', a['eventId'])) {
      return {'kind': 'event', 'eventId': a['eventId']};
    }
    final when = mapOrNull(a['when']);
    if (a['kind'] == 'date' && when != null && _precisions.contains(when['precision'])) {
      if (when['precision'] == 'relative' && !_mine('timelineEvents', when['anchorId'])) {
        throw ChangeRefused('When it happens: the event the date counts from is not in this novel.');
      }
      return {'kind': 'date', 'when': when};
    }
    throw ChangeRefused('When it happens: that chapter, scene or event is not in this novel.');
  }

  /// An ability of one of this novel's blueprints, by `<systemId>/<itemId>`; null for none. One not there is refused.
  String? _ability(Object? id) {
    if (id == null || id == '') return null;
    final s = id is String ? id : '';
    final slash = s.indexOf('/');
    final system = slash > 0 ? row('systems', s.substring(0, slash)) : null;
    final item = system == null
        ? null
        : SystemBlueprint(system).items.where((i) => i.id == s.substring(slash + 1)).firstOrNull;
    if (item == null) throw ChangeRefused('That ability is not in any of this novel’s systems.');
    return item.name;
  }

  /// What the change says, checked against its category's shape. Nothing about the values themselves is judged.
  JsonMap _clean(JsonMap input, {ProgressChange? current}) {
    if (!_mine('loreEntries', input['entryId'])) throw ChangeRefused('That character is not in this novel.');
    final category = _category(str(input['categoryId']));
    if (category.archived && input['categoryId'] != current?.categoryId) {
      throw ChangeRefused('“${category.name}” is archived: restore it to record changes in it.');
    }
    final action = str(input['action']);
    final allowed = actionsOf[category.shape]!;
    if (!allowed.contains(action)) {
      final words = allowed
          .map(
            (a) => switch (a) {
              'set' => 'a value set',
              'happen' => 'something that happened',
              'gain' => 'something gained',
              _ => 'something lost',
            },
          )
          .join(' or ');
      throw ChangeRefused('A change in “${category.name}” is $words.');
    }
    final refId = _mine('loreEntries', input['refId']) ? input['refId']! as String : null;
    final ability = _ability(input['abilityId']);
    // Named by its codex entry or ability alone, it keeps that name, so it still says what it was if the record goes.
    var subject = _text(input['subject'], 120);
    if (subject.isEmpty) {
      subject = refId != null ? str(row('loreEntries', refId)?['name']) : (ability ?? '');
    }
    final value = _text(input['value'], 120);
    if (category.shape != 'value' && subject.isEmpty && refId == null && ability == null) {
      throw ChangeRefused(switch (category.shape) {
        'named' => 'Say which value changes, such as Strength.',
        'held' => 'Say what is gained or lost, or choose its codex entry.',
        _ => 'Say what happened.',
      });
    }
    if (action == 'set' && value.isEmpty) throw ChangeRefused('Say what it is set to.');
    return {
      'entryId': input['entryId'],
      'categoryId': category.id,
      'action': action,
      'subject': category.shape == 'value' ? '' : subject,
      'value': action == 'set' ? value : '',
      'refId': refId,
      'abilityId': ability != null ? input['abilityId'] : null,
      'at': _cleanAt(input['at'], given: input.containsKey('at')),
      'cost': _text(input['cost']),
      'note': _text(input['note'], 4000),
    };
  }

  /// Records a change. With no time given ("at" left out), its time is "not known": nothing is assumed. "at" null is
  /// before the story.
  ProgressChange record(JsonMap input) {
    final saved = {'id': newId(), 'projectId': projectId, ..._clean(input), 'createdAt': now, 'updatedAt': now};
    put('progressChanges', saved);
    return ProgressChange(saved);
  }

  /// Changes a recorded change, worked out from it as stored.
  ProgressChange updateChange(String id, JsonMap edit) {
    final current = ProgressChange(
      row('progressChanges', id) ?? (throw ChangeRefused('That change is not in this novel.')),
    );
    final next = _clean({
      'entryId': current.entryId,
      'categoryId': current.categoryId,
      'action': current.action,
      'subject': current.subject,
      'value': current.value,
      'refId': current.refId,
      'abilityId': current.abilityId,
      'at': current.raw['at'],
      'cost': current.cost,
      'note': current.note,
      ...edit,
    }, current: current);
    final saved = {...current.raw, ...next, 'updatedAt': now};
    put('progressChanges', saved);
    return ProgressChange(saved);
  }

  void removeChange(String id) {
    if (row('progressChanges', id) == null) throw ChangeRefused('That change is not in this novel.');
    remove('progressChanges', id);
  }
}
