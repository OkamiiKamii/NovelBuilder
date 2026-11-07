import 'dart:convert';

import '../collation.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validity.dart' show Anchor;

/// EXPORTING RECORDS
/// What a view, or a chosen set of kinds, exports as data: the records as the app keeps them (every field, with
/// stable ids), narrowed by the page's filters, with the names of everything they point at so the file reads on its
/// own. It is not a backup: the whole novel is Library → Export backup. Private notes are left out unless asked for,
/// and secrets are only ever included on purpose. A port of the original app's `viewRecords`.

/// The kinds of record an export can hold.
const recordKinds = [
  'events', 'nodes', 'characters', 'entries', 'places', 'factions', 'items', 'relations', 'links', 'threads', //
  'journeys', 'progress', 'abilities', 'appearances', 'secrets', 'charts',
];

/// What each kind is called, as one and as many.
const recordKindWords = {
  'events': ('event', 'Events'),
  'nodes': ('chapter or scene', 'Chapters and scenes (without their text)'),
  'characters': ('character', 'Characters'),
  'entries': ('codex entry', 'All codex entries'),
  'places': ('place', 'Places'),
  'factions': ('faction', 'Factions'),
  'items': ('item', 'Items'),
  'relations': ('relationship', 'Relationships'),
  'links': ('connection', 'Connections'),
  'threads': ('plot thread', 'Plot threads'),
  'journeys': ('journey', 'Journeys'),
  'progress': ('progression change', 'Progression changes'),
  'abilities': ('ability', 'Abilities'),
  'appearances': ('appearance', 'Character appearances'),
  'secrets': ('secret', 'Secrets'),
  'charts': ('chart', 'Charts'),
};

/// What each view's data holds.
const viewData = <String, List<String>>{
  'timeline': ['events'],
  'order': ['events', 'nodes'],
  'relationships': ['relations', 'characters', 'links'],
  'plot': ['threads', 'events', 'nodes'],
  'structure': ['nodes'],
  'graph': ['entries', 'events', 'nodes', 'threads', 'relations', 'links'],
  'places': ['places', 'links'],
  'progression': ['progress', 'characters'],
  'history': ['characters', 'events', 'relations'],
  'appearances': ['appearances', 'characters', 'nodes'],
  'knowledge': ['secrets', 'characters'],
  'kinds': ['entries'],
  'abilities': ['abilities', 'links'],
  'journeys': ['journeys', 'places'],
  'factions': ['factions', 'links'],
  'ownership': ['items', 'links'],
  'charts': ['charts'],
};

/// Fields the app keeps private to the author: a codex entry's notes, a chapter's or scene's notes.
const privateFields = <String, List<String>>{
  'entries': ['notes'],
  'characters': ['notes'],
  'places': ['notes'],
  'factions': ['notes'],
  'items': ['notes'],
  'nodes': ['notes'],
};

class ExportedRecords {
  ExportedRecords(this.records, this.names);

  /// By kind, in the order the original writes them.
  final Map<String, List<JsonMap>> records;

  /// The name of every record the records point at, by id.
  final Map<String, String> names;

  int get count => records.values.fold(0, (n, rows) => n + rows.length);
}

List<Object?> _list(Object? v) => v is List ? v : const [];

// The original's model fills in what older records lack; its exports carry those defaults, and so do these.
JsonMap _node(JsonMap r) => {...r, 'mentions': _list(r['mentions'])};
JsonMap _entry(JsonMap r) => {...r, 'fields': _list(r['fields']), 'tags': _list(r['tags'])};
JsonMap _relation(JsonMap r) => {...r, 'stages': _list(r['stages'])};
JsonMap _event(JsonMap r) => {
  ...r,
  'characters': _list(r['characters']),
  'entryIds': _list(r['entryIds']),
  'nodeIds': _list(r['nodeIds']),
  'afterId': r['afterId'],
  'locationId': r['locationId'],
  'end': r['end'],
  'ongoing': r['ongoing'] == true,
  'threadIds': _list(r['threadIds']),
  'status': r['status'] ?? 'confirmed',
  'canon': r['canon'] ?? 'canon',
  'reveals': _list(r['reveals']),
};
JsonMap _thread(JsonMap r) => {
  ...r,
  'characterIds': _list(r['characterIds']),
  'locationIds': _list(r['locationIds']),
  'beats': _list(r['beats']),
  'targetNodeId': r['targetNodeId'],
};
JsonMap _progress(JsonMap r) => {...r, 'at': r['at'], 'refId': r['refId'], 'abilityId': r['abilityId']};
JsonMap _journey(JsonMap r) => {
  ...r,
  'travellerIds': _list(r['travellerIds']),
  'via': _list(r['via']),
  'eventIds': _list(r['eventIds']),
  'fromId': r['fromId'],
  'toId': r['toId'],
  'departure': r['departure'],
  'arrival': r['arrival'],
  'afterId': r['afterId'],
};

/// The records of [kinds], as kept, and the names of every record they point at. [keep] says whether the page's
/// filters keep a record (by id).
ExportedRecords exportRecords(
  StoryModel model,
  List<String> kinds, {
  bool Function(String id)? keep,
  bool includePrivate = false,
  List<JsonMap>? secrets,
  List<JsonMap>? charts,
}) {
  final kept = keep ?? (_) => true;
  final records = <String, List<JsonMap>>{};
  final entries = model.entries.values.toList();
  void put(String kind, Iterable<JsonMap> rows) {
    final hide = includePrivate ? const <String>[] : (privateFields[kind] ?? const <String>[]);
    records[kind] = [
      for (final r in rows)
        {
          for (final e in r.entries)
            if (!hide.contains(e.key)) e.key: deepCopy(e.value),
        },
    ];
  }

  List<JsonMap> sorted(Iterable<JsonMap> rows, String Function(JsonMap r) name) => rows.toList()
    ..sort((a, b) {
      final byName = localeCompare(name(a), name(b));
      return byName != 0 ? byName : localeCompare(str(a['id']), str(b['id']));
    });
  Iterable<JsonMap> byCategory(String category) => [
    for (final e in entries)
      if (e.category == category && kept(e.id)) _entry(e.raw),
  ];
  String nameOf(JsonMap r) => str(r['name']);

  for (final kind in kinds) {
    switch (kind) {
      case 'events':
        put(
          kind,
          sorted([
            for (final e in model.events.values)
              if (kept(e.id)) _event(e.raw),
          ], nameOf),
        );
      case 'nodes':
        put(kind, [
          for (final n
              in model.nodes.values.where((n) => kept(n.id)).toList()
                ..sort((a, b) => (model.order.position[a.id] ?? 0).compareTo(model.order.position[b.id] ?? 0)))
            _node(n.raw),
        ]);
      case 'characters':
        put(kind, sorted(byCategory('character'), nameOf));
      case 'places':
        put(kind, sorted(byCategory('location'), nameOf));
      case 'factions':
        put(kind, sorted(byCategory('faction'), nameOf));
      case 'items':
        put(kind, sorted(byCategory('item'), nameOf));
      case 'entries':
        put(
          kind,
          sorted([
            for (final e in entries)
              if (kept(e.id)) _entry(e.raw),
          ], nameOf),
        );
      case 'relations':
        put(
          kind,
          sorted([
            for (final r in model.relations.values)
              if (kept(r.id)) _relation(r.raw),
          ], (r) => str(r['id'])),
        );
      case 'threads':
        put(
          kind,
          sorted([
            for (final t in model.threads.values)
              if (kept(t.id)) _thread(t.raw),
          ], (r) => str(r['title'])),
        );
      case 'journeys':
        put(kind, [for (final j in model.journeys) _journey(j.raw)]);
      case 'progress':
        put(kind, [
          for (final c in model.progress)
            if (kept(c.entryId)) _progress(c.raw),
        ]);
      case 'abilities':
        put(kind, [
          for (final MapEntry(key: id, value: a) in model.abilities.entries)
            {'id': id, 'system': a.system.name, 'group': a.group, 'item': a.item.raw},
        ]);
      case 'appearances':
        put(kind, [
          for (final p in model.plans.values)
            if ((p.appearIds.isNotEmpty || p.mentionIds.isNotEmpty || p.povIds.isNotEmpty) && kept(p.id))
              {'nodeId': p.id, 'appearIds': p.appearIds, 'mentionIds': p.mentionIds, 'povIds': p.povIds},
        ]);
      case 'secrets':
        if (secrets != null) put(kind, secrets);
      case 'charts':
        if (charts != null) put(kind, charts);
    }
  }
  // Connections whose ends are among what is exported.
  if (kinds.contains('links')) {
    final ids = {
      for (final rows in records.values)
        for (final r in rows)
          if (r['id'] is String) r['id'],
    };
    records['links'] = [
      for (final l in model.links)
        if (ids.contains(l.fromId) || ids.contains(l.toId)) deepCopy(l.raw)! as JsonMap,
    ];
  }
  // The names of everything the records point at: every string they hold that is the id of one of the novel's records.
  final held = <String>{};
  void walk(Object? v) {
    if (v is String) {
      held.add(v);
    } else if (v is List) {
      v.forEach(walk);
    } else if (v is Map) {
      v.values.forEach(walk);
    }
  }

  walk(records);
  final names = <String, String>{};
  for (final id in held) {
    for (final type in EntityType.values) {
      final found = model.resolve(EntityRef(type, id));
      if (found != null) {
        names[id] = found.label;
        break;
      }
    }
  }
  return ExportedRecords(records, names);
}

/// One CSV cell: quoted when it holds a comma, quote or line break; formulas a spreadsheet would run are made text.
String csvCell(Object? value) {
  var text = switch (value) {
    null => '',
    final String s => s,
    final num n => n.toString(),
    final bool b => b ? 'yes' : 'no',
    _ => value.toString(),
  };
  if (RegExp(r'^[=+\-@\t\r]').hasMatch(text) && value is String) text = "'$text";
  return RegExp(r'[",\r\n]').hasMatch(text) ? '"${text.replaceAll('"', '""')}"' : text;
}

/// Records as tables for a spreadsheet: one table per kind, a column per field, lists joined with "; " and the ids in
/// them shown as names. Every table is headed by its kind; the file opens in any spreadsheet and reads every script.
String recordsCsv(ExportedRecords exported, {required List<String> heading}) {
  String cell(Object? v) => switch (v) {
    final String s => exported.names[s] ?? s,
    final List<Object?> l => l.map(cell).join('; '),
    final Map<String, Object?> m =>
      m.containsKey('id') && exported.names.containsKey(m['id']) ? exported.names[m['id']]! : jsonEncode(m),
    _ => v?.toString() ?? '',
  };
  final out = StringBuffer('﻿');
  out.writeln([for (final h in heading) csvCell(h)].join(','));
  for (final MapEntry(key: kind, value: rows) in exported.records.entries) {
    out
      ..write('\r\n')
      ..write(csvCell(recordKindWords[kind]?.$2 ?? kind))
      ..write('\r\n');
    final columns = <String>['id', 'name', 'title'].where((c) => rows.any((r) => r.containsKey(c))).toList();
    for (final r in rows) {
      for (final k in r.keys) {
        if (!columns.contains(k) && k != 'projectId') columns.add(k);
      }
    }
    out.write('${columns.map(csvCell).join(',')}\r\n');
    for (final r in rows) {
      out.write('${columns.map((c) => csvCell(c == 'id' ? r[c] : cell(r[c]))).join(',')}\r\n');
    }
  }
  return out.toString();
}

// ---------------------------------------------------------------------------------------------------- the file

/// What every view or records export says about itself: it is not a backup.
const notABackup =
    'This file holds some of the novel’s records, with the filters used. It is not a backup: to keep or move the whole '
    'novel, use Library → Export backup (or Settings → Import & export).';

/// A file name in the novel's own words (letters of any script kept): "the-ember-crown-timeline-2026-10-22.json".
String exportFileName(String title, String what, DateTime at, String extension) {
  final slug = title.replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '-').replaceAll(RegExp(r'^-|-$'), '');
  final cut = slug.runes.length > 60 ? String.fromCharCodes(slug.runes.take(60)) : slug;
  final day = '${at.year}-${at.month.toString().padLeft(2, '0')}-${at.day.toString().padLeft(2, '0')}';
  return '${cut.isEmpty ? 'untitled' : cut}-$what-$day.$extension';
}

/// The page's filters, in words. Ids are named; nothing is left out. As the original app words them.
List<String> filterWords(JsonMap filter, StoryModel model, {required String Function(Anchor? at) when}) {
  String named(Object? ids) =>
      [for (final id in strings(ids)) model.entries[id]?.name ?? model.threads[id]?.title ?? id].join(', ');
  final words = <String>[];
  final text = str(filter['text']).trim();
  if (text.isNotEmpty) words.add('Name contains “$text”');
  if (strings(filter['characters']).isNotEmpty) words.add('Involving: ${named(filter['characters'])}');
  if (strings(filter['locations']).isNotEmpty) words.add('At: ${named(filter['locations'])}');
  if (strings(filter['factions']).isNotEmpty) words.add('Faction: ${named(filter['factions'])}');
  if (strings(filter['threads']).isNotEmpty) words.add('Plot thread: ${named(filter['threads'])}');
  if (strings(filter['canon']).isNotEmpty) words.add('Canon status: ${strings(filter['canon']).join(', ')}');
  if (strings(filter['status']).isNotEmpty) words.add('Planning status: ${strings(filter['status']).join(', ')}');
  if (strings(filter['significance']).isNotEmpty) {
    words.add('Significance: ${strings(filter['significance']).join(', ')}');
  }
  if (strings(filter['categories']).isNotEmpty) {
    words.add('Kinds of record: ${strings(filter['categories']).join(', ')}');
  }
  final chapters = mapOrNull(filter['chapters']);
  if (chapters != null && (chapters['from'] != null || chapters['to'] != null)) {
    String at(Object? id) => id is String ? when(Anchor.fromJson({'kind': 'node', 'nodeId': id})) : '';
    words.add(
      'Chapters: from ${chapters['from'] != null ? at(chapters['from']) : 'the start'} to '
      '${chapters['to'] != null ? at(chapters['to']) : 'the end'}',
    );
  }
  final time = mapOrNull(filter['time']);
  if (time != null && (time['from'] != null || time['until'] != null)) {
    words.add(
      'Story time: from ${time['from'] != null ? when(Anchor.fromJson(time['from'])) : 'the start'} until '
      '${time['until'] != null ? when(Anchor.fromJson(time['until'])) : 'the end'}',
    );
  }
  return words;
}
