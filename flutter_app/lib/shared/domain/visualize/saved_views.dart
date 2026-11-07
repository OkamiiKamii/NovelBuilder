import 'dart:convert';

import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../collation.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../records/canon.dart';
import '../records/saved_view.dart';
import '../stable_sort.dart';
import '../timeline/dates.dart' show jsNum, precisions;

/// A SAVED VIEW is a way of looking, not a copy of what is looked at: which view, its filters (record ids and query
/// settings), drawn or listed, its layers, the zoom, and the view's own layout choices, under a name. Opening it reads
/// the records as they are now; a record deleted since is simply not there, and the view says so.
///
/// Filters are kept in the original's shape (`types`, `ids`, `categories`, `text`, `chapters: {from, to}`,
/// `time: {from, until}`, `characters`, `locations`, `factions`, `threads`, `canon`, `status`, `significance`).

const _lists = [
  'types',
  'ids',
  'categories',
  'characters',
  'locations',
  'factions',
  'threads',
  'canon',
  'status',
  'significance',
];

final _allowed = <String, List<String>>{
  'types': [for (final t in EntityType.values) t.name],
  'canon': [for (final s in CanonStatus.values) s.key],
  'status': const ['idea', 'planned', 'confirmed'],
  'significance': const ['minor', 'major', 'climax'],
};

String? _anchorText(Object? a) {
  final m = mapOrNull(a);
  if (m == null) return null;
  return switch (m['kind']) {
    'node' => 'n:${m['nodeId']}',
    'event' => 'e:${m['eventId']}',
    _ => 'd:${jsonEncode(m['when'])}',
  };
}

JsonMap? _anchorFrom(String? text) {
  if (text == null || text.length <= 2) return null;
  final kind = text.substring(0, 2);
  final rest = text.substring(2);
  if (kind == 'n:') return {'kind': 'node', 'nodeId': rest};
  if (kind == 'e:') return {'kind': 'event', 'eventId': rest};
  if (kind == 'd:') {
    try {
      final when = mapOrNull(jsonDecode(rest));
      return when != null && precisions.contains(when['precision']) ? {'kind': 'date', 'when': when} : null;
    } on FormatException {
      return null;
    }
  }
  return null;
}

String _value(Object? v) => v == null ? '' : (v is num ? jsNum(v) : '$v');

/// A filter as the page address would hold it and read it back: lists trimmed and without repeats, unknown values of
/// fixed lists (types, canon, status, significance) dropped, empty parts left out. What a filter can hold, and nothing
/// else, is kept.
JsonMap cleanFilter(Object? input) {
  final filter = mapOrNull(input) ?? const <String, Object?>{};
  final out = <String, Object?>{};
  for (final key in _lists) {
    final values = listOf(filter[key]);
    if (values.isEmpty) continue;
    final allowed = _allowed[key];
    // As the address reads it: one comma-separated list.
    final read = {
      for (final v in values.map(_value).join(',').split(','))
        if (v.trim().isNotEmpty && (allowed == null || allowed.contains(v.trim()))) v.trim(),
    };
    if (read.isNotEmpty) out[key] = read.toList();
  }
  final text = filter['text'] is String ? (filter['text']! as String).trim() : '';
  if (text.isNotEmpty) out['text'] = text;
  final chapters = mapOrNull(filter['chapters']);
  final from = chapters?['from'];
  final to = chapters?['to'];
  final fromText = from is String && from.isNotEmpty ? from : null;
  final toText = to is String && to.isNotEmpty ? to : null;
  if (fromText != null || toText != null) out['chapters'] = {'from': ?fromText, 'to': ?toText};
  final time = mapOrNull(filter['time']);
  final after = _anchorFrom(_anchorText(time?['from']));
  final before = _anchorFrom(_anchorText(time?['until']));
  if (after != null || before != null) out['time'] = {'from': ?after, 'until': ?before};
  return out;
}

/// How many filters are set, for "Clear filters (3)". A range counts once.
int activeFilters(JsonMap filter) =>
    _lists.where((k) => listOf(filter[k]).isNotEmpty).length +
    (str(filter['text']).trim().isNotEmpty ? 1 : 0) +
    (filter['chapters'] != null ? 1 : 0) +
    (filter['time'] != null ? 1 : 0);

/// What a view opens with on its own: no filters, drawn, fitted.
JsonMap defaultViewConfig() => {
  'filter': <String, Object?>{},
  'mode': 'visual',
  'layers': <Object?>[],
  'scale': null,
  'layout': <String, Object?>{},
};

bool _finite(Object? v) => v is num && v.isFinite;

/// A config made safe to store: the filter through the same reading as the page address, the rest checked.
JsonMap cleanConfig(JsonMap input) {
  final s = mapOrNull(input['scale']);
  final scale = s != null && _finite(s['x']) && _finite(s['y']) && _finite(s['k']) && (s['k']! as num) > 0
      ? {'x': s['x'], 'y': s['y'], 'k': s['k']}
      : null;
  final layout = input['layout'];
  return {
    'filter': cleanFilter(input['filter']),
    'mode': input['mode'] == 'list' ? 'list' : 'visual',
    'layers': {
      for (final l in listOf(input['layers']))
        if (l is String && l.isNotEmpty) l,
    }.toList(),
    'scale': scale,
    'layout': layout is Map ? {...layout.cast<String, Object?>()} : <String, Object?>{},
  };
}

/// A saved view's filter as it can be opened now: the ids of records deleted since it was saved are left out and
/// listed, so the view can say how many. The stored view is not changed.
({JsonMap filter, List<String> missing}) openSaved(StoryModel model, JsonMap saved) {
  final missing = <String>[];
  List<String>? keep(Object? ids, bool Function(String) exists) {
    if (ids == null) return null;
    final kept = <String>[];
    for (final id in strings(ids)) {
      if (exists(id)) {
        kept.add(id);
      } else {
        missing.add(id);
      }
    }
    return kept.isEmpty ? null : kept;
  }

  bool anyRecord(String id) =>
      model.nodes.containsKey(id) ||
      model.entries.containsKey(id) ||
      model.events.containsKey(id) ||
      model.threads.containsKey(id) ||
      model.relations.containsKey(id) ||
      model.abilities.containsKey(id);
  bool entry(String id) => model.entries.containsKey(id);
  JsonMap? point(Object? a) {
    final m = mapOrNull(a);
    if (m == null) return null;
    final when = mapOrNull(m['when']);
    final id = switch (m['kind']) {
      'node' => m['nodeId'],
      'event' => m['eventId'],
      _ => when?['precision'] == 'relative' ? when!['anchorId'] : null,
    };
    if (id is String &&
        id.isNotEmpty &&
        !(m['kind'] == 'node' ? model.nodes.containsKey(id) : model.events.containsKey(id))) {
      missing.add(id);
      return null;
    }
    return m;
  }

  final f = saved;
  final filter = <String, Object?>{...f};
  for (final (key, exists) in [
    ('ids', anyRecord),
    ('characters', entry),
    ('locations', entry),
    ('factions', entry),
    ('threads', model.threads.containsKey),
  ]) {
    final kept = keep(f[key], exists);
    if (kept != null) {
      filter[key] = kept;
    } else {
      filter.remove(key);
    }
  }
  final chapters = mapOrNull(f['chapters']);
  if (chapters != null) {
    String? end(Object? id) {
      if (id is! String || id.isEmpty) return null;
      if (model.nodes.containsKey(id)) return id;
      missing.add(id);
      return null;
    }

    final from = end(chapters['from']);
    final to = end(chapters['to']);
    if (from != null || to != null) {
      filter['chapters'] = {'from': ?from, 'to': ?to};
    } else {
      filter.remove('chapters');
    }
  }
  final time = mapOrNull(f['time']);
  if (time != null) {
    final from = point(time['from']);
    final until = point(time['until']);
    if (from != null || until != null) {
      filter['time'] = {'from': ?from, 'until': ?until};
    } else {
      filter.remove('time');
    }
  }
  return (filter: filter, missing: {...missing}.toList());
}

/// Changes to a novel's saved views. They hold settings and record ids only, never copies of records.
class SavedViewChanges extends RecordChanges {
  SavedViewChanges(super.snapshot, {required super.now, required super.createId});

  /// This novel's saved views, of one view or all, by name.
  List<SavedView> list([String? view]) => stableSorted(
    [
      for (final r in rows('savedViews'))
        if (view == null || r['view'] == view) SavedView(r),
    ],
    (a, b) {
      final byName = localeCompare(a.name, b.name);
      return byName != 0 ? byName : (numOrNull(a.raw['createdAt']) ?? 0).compareTo(numOrNull(b.raw['createdAt']) ?? 0);
    },
  );

  SavedView owned(String id) {
    final r = row('savedViews', id);
    if (r == null) throw ChangeRefused('That saved view is not in this novel.');
    return SavedView(r);
  }

  String _name(Object? name) {
    final n = name is String ? name.trim() : '';
    return n.isEmpty ? 'Untitled view' : n;
  }

  /// Saves the settings under a name, as a new saved view of [view].
  String save(String view, String name, JsonMap config) {
    final id = newId();
    put('savedViews', {
      'id': id,
      'projectId': projectId,
      'view': view.trim().isEmpty ? 'timeline' : view.trim(),
      'name': _name(name),
      ...cleanConfig(config),
      'createdAt': now,
      'updatedAt': now,
    });
    return id;
  }

  /// Replaces what a saved view shows, keeping its name.
  void update(String id, JsonMap config) {
    final current = owned(id);
    put('savedViews', {
      ...current.toJson(),
      ...cleanConfig({...current.raw, ...config}),
      'updatedAt': now,
    });
  }

  void rename(String id, String name) =>
      put('savedViews', {...owned(id).toJson(), 'name': _name(name), 'updatedAt': now});

  String duplicate(String id) {
    final current = owned(id);
    final copy = newId();
    put('savedViews', {
      ...current.toJson(),
      'id': copy,
      'name': '${current.name} (copy)',
      'createdAt': now,
      'updatedAt': now,
    });
    return copy;
  }

  /// Puts a saved view back to how the view opens on its own, keeping its name.
  void restoreDefault(String id) =>
      put('savedViews', {...owned(id).toJson(), ...defaultViewConfig(), 'updatedAt': now});

  void removeView(String id) {
    owned(id);
    remove('savedViews', id);
  }

  /// Turns views off or on: a setting of the novel, which deletes nothing.
  void setViewsOff(List<String> off) => snapshot = snapshot.copyWith(project: {...snapshot.project, 'viewsOff': off});
}
