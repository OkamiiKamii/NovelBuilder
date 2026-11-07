import '../codex/codex_changes.dart';
import '../json.dart';
import '../snapshot/copy.dart';
import '../snapshot/novel_snapshot.dart';
import 'rules.dart';

/// The fixes the record check offers, made only when the author chooses one. Each takes the whole novel and gives it
/// back changed, to be saved against what was read.

/// "When is not known", as a progression change or journey keeps a point in time that is gone.
const _unknownTime = {
  'kind': 'date',
  'when': {'precision': 'unknown'},
};

bool _anchorNames(Object? anchor, String id) {
  final a = mapOrNull(anchor);
  if (a == null) return false;
  final when = mapOrNull(a['when']) ?? const {};
  return (a['kind'] == 'node' && a['nodeId'] == id) ||
      (a['kind'] == 'event' && a['eventId'] == id) ||
      (a['kind'] == 'date' && when['precision'] == 'relative' && when['anchorId'] == id);
}

/// Takes one broken reference out of the record that holds it. A connection or relationship whose end is gone goes
/// whole; anything else loses only the reference (a beat stays, unplaced; an event keeps everything but the missing
/// character). Text is never changed from here.
NovelSnapshot removeReference(NovelSnapshot s, String table, String rowId, String missingId, {required num now}) {
  if (!fixable.contains(table)) throw ChangeRefused('That reference is changed where it is kept, not from here.');
  final row = s.rows(table).where((r) => r['id'] == rowId).firstOrNull;
  if (row == null) throw ChangeRefused('That record is no longer there.');
  if (goesWhole.contains(table)) {
    return s.withRows(table, [
      for (final r in s.rows(table))
        if (r['id'] != rowId) r,
    ]);
  }
  final JsonMap next;
  if (table == 'progressChanges') {
    next = {
      ...row,
      'at': _anchorNames(row['at'], missingId) ? _unknownTime : row['at'],
      'refId': row['refId'] == missingId ? null : row['refId'],
      'abilityId': row['abilityId'] == missingId ? null : row['abilityId'],
    };
  } else if (table == 'journeys') {
    List<Object?> without(Object? list) => [
      for (final v in listOf(list))
        if (v != missingId) v,
    ];
    next = {
      ...row,
      'travellerIds': without(row['travellerIds']),
      'fromId': row['fromId'] == missingId ? null : row['fromId'],
      'toId': row['toId'] == missingId ? null : row['toId'],
      'via': without(row['via']),
      'eventIds': without(row['eventIds']),
      'departure': _anchorNames(row['departure'], missingId) ? null : row['departure'],
      'arrival': _anchorNames(row['arrival'], missingId) ? null : row['arrival'],
      'afterId': row['afterId'] == missingId ? null : row['afterId'],
    };
  } else {
    next = withoutReference(row, missingId)! as JsonMap;
  }
  return s.putRow(table, next.containsKey('updatedAt') ? {...next, 'updatedAt': now} : next);
}

/// Points a reference field holding words at the entry the author chooses.
NovelSnapshot pointField(
  NovelSnapshot s,
  String entryId,
  String fieldId,
  String words,
  String targetId, {
  required num now,
}) {
  final owner = s.rows('loreEntries').where((r) => r['id'] == entryId).firstOrNull;
  if (owner == null || !s.rows('loreEntries').any((r) => r['id'] == targetId)) {
    throw ChangeRefused('That entry is no longer there.');
  }
  return s.putRow('loreEntries', {
    ...owner,
    'fields': [
      for (final f in listOf(owner['fields']))
        if (f is Map && f['id'] == fieldId)
          {
            ...f.cast<String, Object?>(),
            'value': [
              for (final part in str(f['value']).split('\n')) part.trim() == words.trim() ? targetId : part,
            ].join('\n'),
          }
        else
          f,
    ],
    'updatedAt': now,
  });
}

/// What merging one entry into another would do, before anything is done.
class MergePlan {
  MergePlan(this.keep, this.merge, this.repointed, this.combined, this.dropped);

  final JsonMap keep;
  final JsonMap merge;

  /// Records that point at the one merged, which would point at the one kept: how many in each collection.
  final List<({String table, int rows})> repointed;

  /// What of the merged entry is added to the one kept.
  final List<String> combined;

  /// What is not kept, because the one kept already has it, or it would point at itself.
  final List<String> dropped;

  String get keepName => str(keep['name']);
  String get mergeName => str(merge['name']);
}

const _tableWords = {
  'loreLinks': 'connections',
  'characterRelations': 'character relationships',
  'loreEntries': 'fields of other entries',
  'chapters': 'chapters and scenes linking it in their text',
  'chapterContents': 'chapters’ and scenes’ text',
  'chapterRevisions': 'saved versions of chapters',
  'chapterBranches': 'alternate drafts',
  'chapterPlans': 'chapter and scene plans',
  'timelineEvents': 'timeline events',
  'plotThreads': 'plot threads',
  'characterProfiles': 'character profile',
  'characterSecrets': 'secrets',
  'characterNotes': 'character notes',
  'characterHistory': 'character history',
  'systemSheets': 'system sheets',
  'progressSnapshots': 'progression snapshots',
  'canonFacts': 'canon facts',
  'structureMarkers': 'structural markers',
  'progressChanges': 'progression changes',
  'journeys': 'journeys',
};

String tableWords(String table) => _tableWords[table] ?? table;

/// One id, wherever it appears in a value, re-pointed at another: the same substitution a copy of the novel uses, so
/// every kind of reference follows (links in the text and its saved versions too; the words are never changed). Where
/// that makes a list hold the kept one twice (Mira and her twin at the same event), it is kept once.
Object? _repoint(Object? value, String fromId, String toId) {
  final swapped = substituteIds(value, {fromId: toId});
  // Only what the merge changed is tidied: a list that already held something twice is left as it was.
  return jsonEquals(swapped, value) ? value : _once(swapped, toId);
}

Object? _once(Object? value, String id) {
  if (value is List) {
    var seen = false;
    final out = <Object?>[];
    for (final v in value) {
      final isIt = v == id || (v is Map && v['id'] == id);
      if (isIt && seen) continue;
      if (isIt) seen = true;
      out.add(isIt ? v : _once(v, id));
    }
    return out;
  }
  if (value is Map) return <String, Object?>{for (final e in value.entries) '${e.key}': _once(e.value, id)};
  return value;
}

JsonMap _entry(NovelSnapshot s, String id) =>
    s.rows('loreEntries').where((r) => r['id'] == id).firstOrNull ??
    (throw ChangeRefused('That entry is no longer there.'));

String _norm(String s) => normalizeName(s);

/// Every row that would change, by collection, with its new form. The merged entry's own row is left out.
List<({String table, JsonMap before, JsonMap after})> _repointed(NovelSnapshot s, String fromId, String toId) => [
  for (final e in s.collections.entries)
    for (final row in e.value)
      if (!(e.key == 'loreEntries' && row['id'] == fromId))
        if (_repoint(row, fromId, toId)! as JsonMap case final after when !jsonEquals(after, row))
          (table: e.key, before: row, after: after),
];

/// What merging [mergeId] into [keepId] would do. Reads only.
MergePlan mergePlan(NovelSnapshot s, String keepId, String mergeId) {
  if (keepId == mergeId) throw ChangeRefused('Choose two different entries.');
  final keep = _entry(s, keepId);
  final merge = _entry(s, mergeId);
  if (keep['category'] != merge['category']) throw ChangeRefused('Only entries of the same category can be merged.');
  final counts = <String, int>{};
  for (final c in _repointed(s, mergeId, keepId)) {
    counts[c.table] = (counts[c.table] ?? 0) + 1;
  }
  final (keepName, mergeName) = (str(keep['name']), str(merge['name']));
  bool between(JsonMap r) =>
      (r['fromId'] == keepId && r['toId'] == mergeId) || (r['fromId'] == mergeId && r['toId'] == keepId);
  final links = s.rows('loreLinks').where(between).length;
  final relations = s.rows('characterRelations').where(between).length;
  final profiles = s.rows('characterProfiles').where((p) => p['entryId'] == keepId || p['entryId'] == mergeId).length;
  final sheets = s.rows('systemSheets').where((r) => r['entryId'] == keepId || r['entryId'] == mergeId).toList();
  final doubled = sheets
      .where(
        (r) => r['entryId'] == mergeId && sheets.any((k) => k['entryId'] == keepId && k['systemId'] == r['systemId']),
      )
      .length;
  final keys = {for (final f in maps(keep['fields'])) _norm(str(f['key']))};
  final newFields = [
    for (final f in maps(merge['fields']))
      if (str(f['key']).trim().isNotEmpty && !keys.contains(_norm(str(f['key'])))) str(f['key']),
  ];
  final keepTags = strings(keep['tags']);
  final newTags = [
    for (final t in strings(merge['tags']))
      if (!keepTags.contains(t)) t,
  ];
  final mergeDescription = str(merge['description']).trim();
  return MergePlan(
    keep,
    merge,
    [for (final e in (counts.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))) (table: e.key, rows: e.value)],
    [
      if (newFields.isNotEmpty)
        '${newFields.length} ${newFields.length == 1 ? 'field' : 'fields'} “$keepName” does not have: '
            '${newFields.join(', ')}',
      if (newTags.isNotEmpty) 'tags: ${newTags.join(', ')}',
      if (mergeDescription.isNotEmpty && mergeDescription != str(keep['description']).trim())
        str(keep['description']).trim().isNotEmpty
            ? 'its description, added after the description of the one kept'
            : 'its description',
      if (str(merge['summary']).trim().isNotEmpty && str(keep['summary']).trim().isEmpty) 'its summary',
      if (merge['image'] != null && keep['image'] == null) 'its picture',
      'a note on “$keepName” saying “$mergeName” was merged into it',
    ],
    [
      if (links > 0) '$links ${links == 1 ? 'connection' : 'connections'} between the two, which would point at itself',
      if (relations > 0) '$relations ${relations == 1 ? 'relationship' : 'relationships'} between the two',
      if (profiles > 1) 'the profile layout of “$mergeName” (its name and aliases become aliases of “$keepName”)',
      if (doubled > 0)
        '$doubled system ${doubled == 1 ? 'sheet' : 'sheets'} of “$mergeName” in a system “$keepName” already has a '
            'sheet in',
    ],
  );
}

/// Merges one entry into another of the same category, once the author has seen the plan and said yes. Every
/// reference to the merged entry is re-pointed at the one kept; what that makes point at itself, or double, goes; the
/// merged entry's content is added; then the merged entry is deleted. Nothing is left pointing at nothing.
NovelSnapshot mergeEntries(NovelSnapshot s, String keepId, String mergeId, {required num now}) {
  mergePlan(s, keepId, mergeId); // the same refusals
  final keep = _entry(s, keepId);
  final merge = _entry(s, mergeId);
  final goneProfile = s.rows('characterProfiles').where((p) => p['entryId'] == mergeId).firstOrNull;
  final keptProfile = s.rows('characterProfiles').where((p) => p['entryId'] == keepId).firstOrNull;
  final goneSheets = {
    for (final r in s.rows('systemSheets'))
      if (r['entryId'] == mergeId) r['id'],
  };

  // 1. Every reference follows.
  var out = s;
  for (final c in _repointed(s, mergeId, keepId)) {
    out = out.putRow(c.table, c.after);
  }

  // 2. What now points at itself, or is there twice, goes.
  final seen = <String>{};
  out = out.withRows('loreLinks', [
    for (final l in out.rows('loreLinks'))
      if (l['fromId'] != l['toId'] &&
          seen.add(
            [l['fromId'], l['toId'], l['type'] ?? '', l['fromType'] ?? 'entry', l['toType'] ?? 'entry'].join('|'),
          ))
        l,
  ]);
  out = out.withRows('characterRelations', [
    for (final r in out.rows('characterRelations'))
      if (r['fromId'] != r['toId']) r,
  ]);
  if (goneProfile != null) {
    final gone = out.rows('characterProfiles').firstWhere((p) => p['id'] == goneProfile['id']);
    final keepName = str(keep['name']);
    if (keptProfile != null) {
      final kept = out.rows('characterProfiles').firstWhere((p) => p['id'] == keptProfile['id']);
      final aliases = cleanList([
        ...strings(kept['aliases']),
        str(merge['name']),
        ...strings(gone['aliases']),
      ]).where((a) => a != keepName).toList();
      out = out.withRows('characterProfiles', [
        for (final p in out.rows('characterProfiles'))
          if (p['id'] == gone['id'])
            ...[]
          else if (p['id'] == kept['id'])
            {...p, 'aliases': aliases, 'updatedAt': now}
          else
            p,
      ]);
    } else {
      out = out.putRow('characterProfiles', {
        ...gone,
        'aliases': cleanList([...strings(gone['aliases']), str(merge['name'])]).where((a) => a != keepName).toList(),
        'updatedAt': now,
      });
    }
  }
  final keptSheets = out.rows('systemSheets').where((r) => r['entryId'] == keepId).toList();
  out = out.withRows('systemSheets', [
    for (final r in out.rows('systemSheets'))
      if (!(goneSheets.contains(r['id']) &&
          keptSheets.any((k) => !goneSheets.contains(k['id']) && k['systemId'] == r['systemId'])))
        r,
  ]);

  // 3. The merged entry's own content joins the one kept.
  final keys = {for (final f in maps(keep['fields'])) _norm(str(f['key']))};
  final keepNow = out.rows('loreEntries').firstWhere((r) => r['id'] == keepId);
  final (kd, md) = (str(keep['description']).trim(), str(merge['description']).trim());
  out = out.putRow('loreEntries', {
    ...keepNow,
    'fields': [
      ...listOf(keepNow['fields']),
      for (final f in maps(_repoint(merge['fields'], mergeId, keepId)))
        if (str(f['key']).trim().isNotEmpty && !keys.contains(_norm(str(f['key'])))) f,
    ],
    'tags': cleanList([...strings(keep['tags']), ...strings(merge['tags'])]),
    'summary': str(keep['summary']).trim().isNotEmpty ? keep['summary'] : merge['summary'],
    'description': md.isNotEmpty && md != kd ? [kd, md].where((d) => d.isNotEmpty).join('\n\n') : keep['description'],
    'image': keep['image'] ?? merge['image'],
    'notes': [
      str(keep['notes']).trim(),
      str(merge['notes']).trim(),
      'Merged “${str(merge['name'])}” into this entry.',
    ].where((n) => n.isNotEmpty).join('\n\n'),
    'updatedAt': now,
  });
  return out.withRows('loreEntries', [
    for (final r in out.rows('loreEntries'))
      if (r['id'] != mergeId) r,
  ]);
}
