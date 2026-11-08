import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import '../records/calendar.dart';
import '../records/canon.dart';
import '../records/event.dart';
import 'dates.dart';
import 'histories.dart';

/// What the timeline screens read and change: events, the calendar, alternate histories, and the records an event
/// points at (entries, chapters, threads) to check those pointers against.
const timelineCollections = {
  'timelineEvents',
  'storyCalendars',
  'alternateHistories',
  'loreEntries',
  'loreLinks',
  'loreSchemas',
  'chapters',
  'plotThreads',
  'continuityRules',
  'continuityResolutions',
};

/// Labels offered for events and scenes, as the original suggests them.
const suggestedLabels = ['Action', 'Dialogue', 'Exposition', 'Romance', 'Mystery clue', 'Quiet moment'];
const _labelMax = 40;
const _labelsPerItem = 12;

/// Labels as kept: trimmed, spaces collapsed, at most 40 characters, a suggested one in its own spelling, no repeats
/// (ignoring case), at most 12.
List<String> cleanLabels(Object? list) {
  final out = <String>[];
  for (final value in listOf(list)) {
    if (value is! String) continue;
    var typed = value.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (typed.length > _labelMax) typed = typed.substring(0, _labelMax);
    final label = suggestedLabels.where((l) => l.toLowerCase() == typed.toLowerCase()).firstOrNull ?? typed;
    if (label.isNotEmpty && !out.any((l) => l.toLowerCase() == label.toLowerCase())) out.add(label);
  }
  return out.take(_labelsPerItem).toList();
}

int? _whole(Object? value, int min, int max) {
  final n = value is num ? value : (value is String && value.trim().isNotEmpty ? num.tryParse(value.trim()) : null);
  if (n == null || !n.isFinite) return null;
  final r = jsRound(n);
  return r >= min && r <= max ? r : null;
}

/// Changes to a novel's timeline: every way an event's date, length, ages or order can change, which is only by the
/// author editing the event. Each checks what it is given as the original's timeline service does.
class EventChanges extends RecordChanges {
  EventChanges(super.snapshot, {required super.now, required super.createId});

  Calendar get calendar => Calendar.fromJson(rows('storyCalendars').firstOrNull);

  TimelineEvent owned(String eventId) {
    final row = this.row('timelineEvents', eventId);
    if (row == null) throw ChangeRefused('That event is not in this novel.');
    return TimelineEvent(row);
  }

  /// Ids of this novel's rows in [collection] (of one codex category, when given), without blanks or repeats.
  List<String> existing(String collection, Object? ids, [String? category]) {
    final wanted = {
      for (final id in listOf(ids))
        if (id is String && id.isNotEmpty) id,
    };
    return [
      for (final id in wanted)
        if (row(collection, id) case final r? when category == null || r['category'] == category) id,
    ];
  }

  JsonMap _newEvent(String? name) => {
    'id': newId(),
    'projectId': projectId,
    'name': name?.trim().isNotEmpty == true ? name!.trim() : 'New event',
    'description': '',
    'when': {'precision': 'unknown'},
    'duration': null,
    'importance': 'minor',
    'locationId': null,
    'characters': <Object?>[],
    'entryIds': <Object?>[],
    'nodeIds': <Object?>[],
    'afterId': null,
    'createdAt': now,
    'updatedAt': now,
  };

  /// A new event: no date yet, so it appears under "Not placed in time" until the author gives it one.
  String createEvent([String? name]) {
    final event = _newEvent(name);
    put('timelineEvents', event);
    return event['id']! as String;
  }

  /// A first timeline from the chapters as told, for a novel with none: an event for each chapter (in [chapterIds]'
  /// order), named as the chapter, its summary as the event's, linked to the chapter it is told in, each coming after
  /// the one before. None has a date: they wait under "Not placed in time", in the order the story tells them, until
  /// the author moves them where they happen. Refused when the timeline already has events.
  List<String> eventsFromChapters(List<String> chapterIds) {
    if (rows('timelineEvents').isNotEmpty) throw ChangeRefused('The timeline already has events.');
    final made = <String>[];
    for (final (i, id) in chapterIds.indexed) {
      final chapter = row('chapters', id);
      if (chapter == null) continue;
      final title = str(chapter['title']).trim();
      final event = {
        ..._newEvent(title.isEmpty ? 'Chapter ${i + 1}' : title),
        'description': str(chapter['summary']),
        'nodeIds': [id],
        'afterId': made.lastOrNull,
        // A millisecond apart, so events of the same moment keep the chapters' order.
        'createdAt': now + i,
      };
      put('timelineEvents', event);
      made.add(event['id']! as String);
    }
    if (made.isEmpty) throw ChangeRefused('There are no chapters to start from.');
    return made;
  }

  /// Updates an event from what it holds now. Anything that does not fit is not stored: ids that are not this novel's,
  /// statuses that do not exist, a date the calendar does not have. How long it lasts is said one way at a time.
  void updateEvent(String eventId, JsonMap Function(TimelineEvent stored) edit) {
    final current = owned(eventId);
    final changes = edit(current);
    final next = <String, Object?>{'updatedAt': now};
    if (changes['name'] is String) {
      final name = (changes['name']! as String).trim();
      next['name'] = name.isEmpty ? 'Untitled event' : name;
    }
    if (changes['description'] is String) next['description'] = changes['description'];
    if (const ['minor', 'major', 'climax'].contains(changes['importance'])) next['importance'] = changes['importance'];
    final c = calendar;
    String? anchorOf(Object? id) =>
        id is String && id.isNotEmpty && id != eventId ? existing('timelineEvents', [id]).firstOrNull : null;
    if (changes.containsKey('when')) {
      final when = normalizeDate(changes['when'], c);
      // A relative date must point at another event of this novel.
      if (when['precision'] == 'relative') when['anchorId'] = anchorOf(when['anchorId']);
      next['when'] = when;
    }
    if (changes.containsKey('duration')) {
      final d = mapOrNull(changes['duration']);
      final amount = d == null ? null : (d['amount'] is num ? d['amount']! as num : num.tryParse('${d['amount']}'));
      next['duration'] = amount != null && amount.isFinite && amount > 0
          ? {'amount': amount, 'unit': (timeUnitOf(d!['unit']) ?? TimeUnit.years).name}
          : null;
    }
    if (changes.containsKey('locationId')) {
      next['locationId'] = existing('loreEntries', [changes['locationId']], 'location').firstOrNull;
    }
    if (changes.containsKey('characters')) {
      final given = maps(changes['characters']);
      final ids = existing('loreEntries', [for (final c in given) c['id']], 'character');
      next['characters'] = [
        for (final id in ids) {'id': id, 'age': _whole(given.firstWhere((c) => c['id'] == id)['age'], 0, 100000)},
      ];
    }
    if (changes.containsKey('entryIds')) next['entryIds'] = existing('loreEntries', changes['entryIds']);
    if (changes.containsKey('nodeIds')) next['nodeIds'] = existing('chapters', changes['nodeIds']);
    if (changes.containsKey('afterId')) next['afterId'] = anchorOf(changes['afterId']);
    // How long it lasts is said one way at a time: a duration, an end date, or "still going on".
    if (next['duration'] != null) next.addAll({'end': null, 'ongoing': false});
    if (changes.containsKey('end')) {
      final end = changes['end'] == null ? null : normalizeDate(changes['end'], c);
      if (end != null && end['precision'] == 'relative') end['anchorId'] = anchorOf(end['anchorId']);
      next['end'] = end;
      if (end != null) next.addAll({'duration': null, 'ongoing': false});
    }
    if (changes.containsKey('ongoing')) {
      next['ongoing'] = changes['ongoing'] == true;
      if (next['ongoing'] == true) next.addAll({'end': null, 'duration': null});
    }
    if (changes.containsKey('threadIds')) next['threadIds'] = existing('plotThreads', changes['threadIds']);
    if (changes.containsKey('labels')) next['labels'] = cleanLabels(changes['labels']);
    if (changes.containsKey('status')) {
      next['status'] = const ['idea', 'planned', 'confirmed'].contains(changes['status'])
          ? changes['status']
          : 'confirmed';
    }
    if (changes.containsKey('canon')) {
      next['canon'] = CanonStatus.of(changes['canon']) != null ? changes['canon'] : 'canon';
    }
    // A chapter's role in telling the event lasts as long as the event is told there; "told" is not stored.
    if (changes.containsKey('reveals') || changes.containsKey('nodeIds')) {
      final told = {...listOf(next['nodeIds'] ?? current.raw['nodeIds'])};
      final given = changes.containsKey('reveals') ? maps(changes['reveals']) : maps(current.raw['reveals']);
      final seen = <String>{};
      next['reveals'] = [
        for (final r in given)
          if (r['nodeId'] case final String nodeId
              when told.contains(nodeId) && RevealRole.of(r['role']) != null && r['role'] != 'told' && seen.add(nodeId))
            {'nodeId': nodeId, 'role': r['role']},
      ];
    }
    put('timelineEvents', current.merged(next));
  }

  /// Saves the calendar settings, checked first: nothing is written when they have a problem. Saving one never changes
  /// an event; each date is read in whichever calendar is in use.
  JsonMap saveCalendar(JsonMap input) {
    final settings = cleanCalendar(input);
    final was = rows('storyCalendars').firstOrNull;
    put('storyCalendars', {...settings, 'id': was?['id'] ?? newId(), 'projectId': projectId, 'updatedAt': now});
    return settings;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Alternate histories

  Map<String, AlternateHistory> get histories => {
    for (final r in rows('alternateHistories')) str(r['id']): AlternateHistory(r),
  };
  Map<String, TimelineEvent> get mainEvents => {for (final r in rows('timelineEvents')) str(r['id']): TimelineEvent(r)};

  AlternateHistory history(String id) {
    final row = this.row('alternateHistories', id);
    if (row == null) throw ChangeRefused('That alternate history is not in this novel.');
    return AlternateHistory(row);
  }

  Map<String, TimelineEvent> _baseOf(AlternateHistory h) => historyEvents(mainEvents, histories, h.baseId);

  void _save(String id, JsonMap changes) =>
      put('alternateHistories', {...history(id).merged(changes), 'updatedAt': now});

  /// A change as it can be stored: each field checked as the timeline checks it, ids kept only when they name a record
  /// of this novel (an event, when this history has it), the length said one way at a time. Fields the same as
  /// [against] are dropped, so a history only ever holds what is different.
  JsonMap _clean(JsonMap change, Map<String, TimelineEvent> events, TimelineEvent? against) {
    final c = calendar;
    final entries = {for (final r in rows('loreEntries')) str(r['id']): r};
    JsonMap anchored(JsonMap when) =>
        when['precision'] == 'relative' && when['anchorId'] != null && !events.containsKey(when['anchorId'])
        ? {...when, 'anchorId': null}
        : when;
    final out = <String, Object?>{};
    if (change.containsKey('name')) {
      final name = '${change['name'] ?? ''}'.trim();
      out['name'] = name.isEmpty ? 'Untitled event' : name;
    }
    if (change.containsKey('description')) out['description'] = '${change['description'] ?? ''}';
    if (change.containsKey('when')) out['when'] = anchored(normalizeDate(change['when'], c));
    if (change.containsKey('end')) {
      out['end'] = change['end'] == null ? null : anchored(normalizeDate(change['end'], c));
    }
    if (change.containsKey('duration')) {
      final d = mapOrNull(change['duration']);
      final amount = d == null ? null : numOrNull(d['amount']);
      out['duration'] = amount != null && amount > 0
          ? {'amount': amount, 'unit': (timeUnitOf(d!['unit']) ?? TimeUnit.days).name}
          : null;
    }
    if (change.containsKey('ongoing')) out['ongoing'] = change['ongoing'] == true;
    if (change.containsKey('importance')) {
      out['importance'] = const ['minor', 'major', 'climax'].contains(change['importance'])
          ? change['importance']
          : 'minor';
    }
    if (change.containsKey('locationId')) {
      final id = change['locationId'];
      out['locationId'] = id is String && entries[id]?['category'] == 'location' ? id : null;
    }
    if (change.containsKey('characters')) {
      final seen = <String>{};
      out['characters'] = [
        for (final ch in maps(change['characters']))
          if (ch['id'] case final String id when entries[id]?['category'] == 'character' && seen.add(id))
            {'id': id, 'age': ch['age'] is int && (ch['age']! as int) >= 0 ? ch['age'] : null},
      ];
    }
    if (change.containsKey('entryIds')) {
      out['entryIds'] = [
        for (final id in {...strings(change['entryIds'])})
          if (entries.containsKey(id)) id,
      ];
    }
    if (change.containsKey('afterId')) {
      final id = change['afterId'];
      out['afterId'] = id is String && events.containsKey(id) ? id : null;
    }
    if (out['duration'] != null) out.addAll({'end': null, 'ongoing': false});
    if (out['end'] != null) out.addAll({'duration': null, 'ongoing': false});
    if (out['ongoing'] == true) out.addAll({'end': null, 'duration': null});
    if (against != null) {
      for (final field in changeableFields.keys) {
        if (out.containsKey(field) && jsonEquals(fieldValue(out, field), fieldValue(against.raw, field))) {
          out.remove(field);
        }
      }
    }
    return out;
  }

  /// Starts a history: no differences yet, so it reads exactly as its base until the author changes something.
  String createHistory({
    String? name,
    String? baseId,
    String? kind,
    String? status,
    String? originEventId,
    String? causeEventId,
    String? note,
  }) {
    final all = histories;
    final base = baseId != null && all.containsKey(baseId) ? baseId : null;
    final events = historyEvents(mainEvents, all, base);
    final id = newId();
    put('alternateHistories', {
      'id': id,
      'projectId': projectId,
      'name': name?.trim().isNotEmpty == true ? name!.trim() : 'Untitled alternate history',
      'baseId': base,
      'kind': HistoryKind.of(kind)?.key ?? HistoryKind.hypothetical.key,
      'status': historyStatusOf(status)?.key ?? 'experimental',
      'originEventId': originEventId != null && events.containsKey(originEventId) ? originEventId : null,
      'causeEventId': causeEventId != null && events.containsKey(causeEventId) ? causeEventId : null,
      'note': note?.trim() ?? '',
      'changed': <String, Object?>{},
      'removed': <Object?>[],
      'added': <Object?>[],
      'createdAt': now,
      'updatedAt': now,
    });
    return id;
  }

  /// Its name, kind, canon status, where it departs and why. Its base is fixed once it is made.
  void updateHistory(String id, JsonMap input) {
    final h = history(id);
    final base = _baseOf(h);
    final next = <String, Object?>{};
    if (input['name'] is String) {
      final name = (input['name']! as String).trim();
      next['name'] = name.isEmpty ? h.name : name;
    }
    if (HistoryKind.of(input['kind']) != null) next['kind'] = input['kind'];
    if (historyStatusOf(input['status']) != null) next['status'] = input['status'];
    for (final key in ['originEventId', 'causeEventId']) {
      if (!input.containsKey(key)) continue;
      final value = input[key];
      next[key] = value is String && base.containsKey(value) ? value : null;
    }
    if (input['note'] is String) next['note'] = (input['note']! as String).trim();
    _save(id, next);
  }

  /// A base event goes differently in this history. Only the fields that differ from the base are kept; none left
  /// restores it.
  void changeHistoryEvent(String id, String eventId, JsonMap change) {
    final h = history(id);
    final event = _baseOf(h)[eventId];
    if (event == null) throw ChangeRefused('That event is not in the timeline this history branches from.');
    final merged = _clean({...?h.changed[eventId], ...change}, historyEvents(mainEvents, histories, id), event);
    final changed = {...h.changed};
    if (merged.isNotEmpty) {
      changed[eventId] = merged;
    } else {
      changed.remove(eventId);
    }
    _save(id, {
      'changed': changed,
      'removed': [
        for (final r in h.removed)
          if (r != eventId) r,
      ],
    });
  }

  /// A base event does not happen in this history.
  void removeHistoryEvent(String id, String eventId) {
    final h = history(id);
    if (!_baseOf(h).containsKey(eventId)) {
      throw ChangeRefused('That event is not in the timeline this history branches from.');
    }
    _save(id, {
      'changed': {...h.changed}..remove(eventId),
      'removed': {...h.removed, eventId}.toList(),
    });
  }

  /// Back as the base has it: the history's change or removal is dropped.
  void restoreHistoryEvent(String id, String eventId) {
    final h = history(id);
    _save(id, {
      'changed': {...h.changed}..remove(eventId),
      'removed': [
        for (final r in h.removed)
          if (r != eventId) r,
      ],
    });
  }

  /// An event that happens only in this history. It is kept in the history, never in the main timeline.
  String addHistoryEvent(String id, [String? name]) {
    final h = history(id);
    final event = _newEvent(name);
    _save(id, {
      'added': [...maps(h.raw['added']), event],
    });
    return event['id']! as String;
  }

  void updateAddedEvent(String id, String eventId, JsonMap change) {
    final h = history(id);
    if (!h.added.any((e) => e.id == eventId)) throw ChangeRefused('That event is not one this history adds.');
    final cleaned = _clean(change, historyEvents(mainEvents, histories, id), null);
    _save(id, {
      'added': [
        for (final e in maps(h.raw['added']))
          if (e['id'] == eventId) {...e, ...cleaned, 'updatedAt': now} else e,
      ],
    });
  }

  void deleteAddedEvent(String id, String eventId) {
    final h = history(id);
    _save(id, {
      'added': [
        for (final e in maps(h.raw['added']))
          if (e['id'] != eventId) e,
      ],
    });
  }

  /// Drops changes and removals that point at events the base no longer has.
  void forgetStale(String id) {
    final h = history(id);
    final stale = staleChanges(mainEvents, histories, h).toSet();
    _save(id, {
      'changed': {
        for (final e in h.changed.entries)
          if (!stale.contains(e.key)) e.key: e.value,
      },
      'removed': [
        for (final r in h.removed)
          if (!stale.contains(r)) r,
      ],
    });
  }

  /// Deletes a history. Histories based on it are based on its base instead, keeping their own differences; the main
  /// timeline is untouched.
  void removeHistory(String id) {
    final h = history(id);
    for (final other in histories.values) {
      if (other.baseId == id) _save(other.id, {'baseId': h.baseId});
    }
    remove('alternateHistories', id);
  }

  /// Whether basing a history on [baseId] would loop back to itself.
  bool loops(String id, String baseId) => lineage(histories, baseId).any((h) => h.id == id);
}
