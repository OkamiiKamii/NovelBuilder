import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import '../model/story_model.dart';
import '../records/event.dart';
import '../records/journey.dart';
import '../records/link.dart';
import '../travel/travel.dart';
import 'explore.dart' show parentsOf;
import 'places.dart';

/// The collections a change to places or journeys reads and writes.
const placeCollections = {
  'placeSettings',
  'worldMaps',
  'mapPins',
  'travelSettings',
  'journeys',
  'loreEntries',
  'loreLinks',
  'chapters',
  'chapterPlans',
  'timelineEvents',
  'loreSchemas',
  'storyCalendars',
};

const _precisions = ['exact', 'approximate', 'relative', 'unknown'];

String _text(Object? v, [int max = 80]) {
  final s = v is String ? v.trim() : '';
  return s.length > max ? s.substring(0, max) : s;
}

double? _positive(Object? v) => v is num && v.isFinite && v > 0 ? v.toDouble() : null;

final _imagePattern = RegExp(r'^data:image/(png|jpe?g|gif|webp|svg\+xml);base64,');

/// Levels of place, what is inside what, maps and pins, as in the original's place service.
class PlaceChanges extends RecordChanges {
  PlaceChanges(super.snapshot, {required super.now, required super.createId});

  PlaceSettings? settings() => rows('placeSettings').map(PlaceSettings.new).firstOrNull;
  List<WorldMap> maps() => [for (final r in rows('worldMaps')) WorldMap(r)];
  List<MapPin> pins() => [for (final r in rows('mapPins')) MapPin(r)];

  JsonMap _place(Object? id, [String what = 'That place']) {
    final entry = id is String ? row('loreEntries', id) : null;
    if (entry == null || entry['category'] != 'location') throw ChangeRefused('$what is not a location in this novel.');
    return entry;
  }

  WorldMap _map(String id) => WorldMap(row('worldMaps', id) ?? (throw ChangeRefused('That map is not in this novel.')));

  /// Levels as stored: each named once, ids kept, largest first. A level some place still has is never dropped.
  PlaceSettings setLevels(List<({String? id, String name})> levels) {
    final clean = <JsonMap>[];
    for (final level in levels) {
      final name = _text(level.name, 40);
      if (name.isNotEmpty && !clean.any((l) => str(l['name']).toLowerCase() == name.toLowerCase())) {
        clean.add({'id': level.id == null || level.id!.isEmpty ? newId() : level.id, 'name': name});
      }
    }
    final current = settings();
    for (final level in current?.levels ?? const <PlaceLevel>[]) {
      if (clean.any((c) => c['id'] == level.id)) continue;
      final using = rows('loreEntries').where((e) => e['placeLevel'] == level.id).length;
      if (using > 0) {
        throw ChangeRefused(
          '$using ${using == 1 ? 'place is' : 'places are'} a ${level.name}. Give ${using == 1 ? 'it' : 'them'} '
          'another level first.',
        );
      }
    }
    final saved = {
      'id': current?.id ?? newId(),
      'projectId': projectId,
      'levels': clean,
      'createdAt': current?.raw['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('placeSettings', saved);
    return PlaceSettings(saved);
  }

  /// Starts from a set of levels; with levels already, only adds the ones missing, after them.
  PlaceSettings applyPreset(String presetId) {
    final preset = levelPresets.where((p) => p.id == presetId).firstOrNull;
    if (preset == null) throw ChangeRefused('There is no such set of levels.');
    final current = settings()?.levels ?? const <PlaceLevel>[];
    return setLevels([
      for (final l in current) (id: l.id, name: l.name),
      for (final n in preset.levels)
        if (!current.any((l) => l.name.toLowerCase() == n.toLowerCase())) (id: null, name: n),
    ]);
  }

  /// A place's level, or none.
  void setLevel(String entryId, String? levelId) {
    final entry = _place(entryId);
    if (levelId != null && !(settings()?.levels.any((l) => l.id == levelId) ?? false)) {
      throw ChangeRefused('That level is not one of this novel’s.');
    }
    put('loreEntries', {...entry, 'placeLevel': levelId, 'updatedAt': now});
  }

  /// What a place is inside: its "Located in" connection to another place, or none (at the top). A place cannot go
  /// inside itself, or inside a place that is inside it. A connection that has ended stays, as history.
  void setParent(String entryId, String? parentId) {
    _place(entryId);
    if (parentId != null) {
      _place(parentId, 'The place it is in');
      if (parentId == entryId) throw ChangeRefused('A place cannot be inside itself.');
      final model = StoryModel.fromSnapshot(snapshot);
      final parent = parentsOf(model).parent;
      var steps = 0;
      for (String? at = parentId; at != null && steps < 10000; at = parent[at], steps++) {
        if (at == entryId) {
          throw ChangeRefused(
            '${model.entries[parentId]!.name} is inside ${model.entries[entryId]!.name}, so it cannot also be what it '
            'is in.',
          );
        }
      }
    }
    final places = {
      for (final e in rows('loreEntries'))
        if (e['category'] == 'location') e['id'],
    };
    for (final l in rows('loreLinks').map(Link.new).toList()) {
      if (l.fromId == entryId && l.type == 'located-in' && l.isEntryLink && l.validity?.until == null) {
        if (places.contains(l.toId)) remove('loreLinks', l.id);
      }
    }
    if (parentId != null) {
      put('loreLinks', {
        'id': newId(),
        'projectId': projectId,
        'fromId': entryId,
        'toId': parentId,
        'fromType': 'entry',
        'toType': 'entry',
        'type': 'located-in',
        'fromLabel': '',
        'toLabel': '',
        'createdAt': now,
      });
    }
  }

  /// Creates a map ([id] null) or changes one. Its size is in its own units; a grid of 0 draws none.
  WorldMap saveMap(
    String? id, {
    String? name,
    ({String? value})? placeId,
    double? width,
    double? height,
    String? unit,
    double? grid,
  }) {
    final current = id == null ? null : _map(id);
    final named = _text(name ?? current?.name, 80);
    if (named.isEmpty) throw ChangeRefused('Give the map a name.');
    final place = placeId != null ? placeId.value : current?.placeId;
    if (place != null) _place(place, 'The place it is a map of');
    final g = grid ?? current?.grid ?? 10;
    final saved = {
      ...?current?.toJson(),
      'id': current?.id ?? newId(),
      'projectId': projectId,
      'name': named,
      'placeId': place,
      'width': _positive(width) ?? current?.width ?? 100,
      'height': _positive(height) ?? current?.height ?? 100,
      'unit': _text(unit ?? current?.unit, 30),
      'grid': g.isFinite && g >= 0 ? g : 0,
      'image': current?.image,
      'createdAt': current?.raw['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('worldMaps', saved);
    return WorldMap(saved);
  }

  /// The map's background image, chosen from the author's own device, or none. Kept in this novel; never sent
  /// anywhere.
  void setImage(String id, String? image) {
    final map = _map(id);
    if (image != null) {
      if (!_imagePattern.hasMatch(image)) throw ChangeRefused('That is not an image this app can show.');
      if (image.length > mapImageLimit * 1.37) {
        throw ChangeRefused(
          'That image is too large for a map background (more than ${mapImageLimit ~/ 1024 ~/ 1024} MB).',
        );
      }
    }
    put('worldMaps', {...map.toJson(), 'image': image, 'updatedAt': now});
  }

  /// Removes a map and its pins. The places themselves are not touched.
  void removeMap(String id) {
    _map(id);
    for (final p in pins().where((p) => p.mapId == id).toList()) {
      remove('mapPins', p.id);
    }
    remove('worldMaps', id);
  }

  /// Puts a place on a map, or moves it there. Coordinates must be numbers; outside the map's edges is allowed, and
  /// said.
  MapPin pin(String mapId, String entryId, double x, double y) {
    _map(mapId);
    _place(entryId);
    if (!x.isFinite || !y.isFinite) throw ChangeRefused('Coordinates must be numbers.');
    final existing = pins().where((p) => p.mapId == mapId && p.entryId == entryId).firstOrNull;
    final saved = {
      'id': existing?.id ?? newId(),
      'projectId': projectId,
      'mapId': mapId,
      'entryId': entryId,
      'x': x,
      'y': y,
      'createdAt': existing?.raw['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('mapPins', saved);
    return MapPin(saved);
  }

  /// Takes a place off a map: it stays in the tree, and on other maps.
  void unpin(String mapId, String entryId) {
    _map(mapId);
    for (final p in pins().where((p) => p.mapId == mapId && p.entryId == entryId).toList()) {
      remove('mapPins', p.id);
    }
  }

  // ---------------------------------------------------------------------------------------------------- journeys

  TravelSettings? travelSettings() => rows('travelSettings').map(TravelSettings.new).firstOrNull;
  List<Journey> journeys() => [for (final r in rows('journeys')) Journey(r)];

  String? _placeOrNone(Object? id, String what) {
    if (id == null || id == '') return null;
    final entry = id is String ? row('loreEntries', id) : null;
    if (entry?['category'] != 'location') throw ChangeRefused('$what is not a place in this novel.');
    return id as String;
  }

  bool _mine(String collection, Object? id) => id is String && id.isNotEmpty && row(collection, id) != null;

  /// A point in the story: a chapter or scene or event of this novel, or a date the timeline can read; null when not
  /// known.
  JsonMap? _point(Object? at, String which) {
    final a = mapOrNull(at);
    if (a == null) return null;
    if (a['kind'] == 'node' && _mine('chapters', a['nodeId'])) return {'kind': 'node', 'nodeId': a['nodeId']};
    if (a['kind'] == 'event' && _mine('timelineEvents', a['eventId'])) {
      return {'kind': 'event', 'eventId': a['eventId']};
    }
    final when = mapOrNull(a['when']);
    if (a['kind'] == 'date' && when != null && _precisions.contains(when['precision'])) {
      if (when['precision'] == 'relative' && !_mine('timelineEvents', when['anchorId'])) {
        throw ChangeRefused('When it $which: the event the date counts from is not in this novel.');
      }
      return when['precision'] == 'unknown' ? null : {'kind': 'date', 'when': when};
    }
    throw ChangeRefused('When it $which: that chapter, scene or event is not in this novel.');
  }

  /// Records a journey ([id] null) or changes one. Only who travels is needed; everything else is as far as the
  /// author says. [input] holds the fields to set, as the original's journey input.
  Journey saveJourney(String? id, JsonMap input) {
    final current = id == null ? null : row('journeys', id);
    if (id != null && current == null) throw ChangeRefused('That journey is not in this novel.');
    final next = {...?current, ...input};
    final travellerIds = <String>[];
    for (final t in {...strings(next['travellerIds'])}) {
      final found = row('loreEntries', t);
      if (found == null || found['category'] == 'location') {
        throw ChangeRefused('Who travels must be characters, factions or other records of this novel, not places.');
      }
      travellerIds.add(t);
    }
    if (travellerIds.isEmpty) throw ChangeRefused('Say who travels.');
    final via = [for (final v in strings(next['via'])) ?_placeOrNone(v, 'A place it passes through')];
    final all = journeys();
    final afterId = idOrNull(next['afterId']);
    if (afterId != null) {
      if (!all.any((j) => j.id == afterId)) throw ChangeRefused('The journey it comes after is not in this novel.');
      // It cannot come after itself, or after one that comes after it.
      var n = 0;
      for (String? at = afterId; at != null && n < 10000; at = all.where((j) => j.id == at).firstOrNull?.afterId, n++) {
        if (at == id) throw ChangeRefused('A journey cannot come after itself, or after one that comes after it.');
      }
    }
    final methods = travelSettings()?.methods ?? const <TravelMethod>[];
    final asked = idOrNull(next['methodId']);
    final methodId = asked != null && methods.any((m) => m.id == asked) ? asked : null;
    if (asked != null && methodId == null) throw ChangeRefused('That travel method is not one of this novel’s.');
    final d = mapOrNull(next['duration']);
    final amount = d?['amount'];
    final unit = timeUnitOf(d?['unit']);
    final duration = d != null && amount is num && amount.isFinite && amount >= 0 && unit != null
        ? {'amount': amount, 'unit': unit.name}
        : null;
    if (d != null && duration == null) {
      throw ChangeRefused('A duration is a number of minutes, hours, days, weeks, months or years.');
    }
    final dist = next['distance'];
    final distance = dist is num && dist.isFinite && dist >= 0 ? dist : null;
    if (dist != null && distance == null) throw ChangeRefused('A distance is a number, 0 or more.');
    final eventIds = <String>[];
    for (final e in {...strings(next['eventIds'])}) {
      if (!_mine('timelineEvents', e)) throw ChangeRefused('A related event is not in this novel.');
      eventIds.add(e);
    }
    final saved = {
      'id': current?['id'] ?? newId(),
      'projectId': projectId,
      'travellerIds': travellerIds,
      'fromId': _placeOrNone(next['fromId'], 'Where it starts'),
      'toId': _placeOrNone(next['toId'], 'Where it ends'),
      'via': via,
      'departure': _point(next['departure'], 'leaves'),
      'arrival': _point(next['arrival'], 'arrives'),
      'afterId': afterId,
      'method': _text(next['method'], 120),
      'methodId': methodId,
      'duration': duration,
      'distance': distance,
      'distanceUnit': _text(next['distanceUnit'], 30),
      'eventIds': eventIds,
      'note': _text(next['note'], 4000),
      'createdAt': current?['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('journeys', saved);
    return Journey(saved);
  }

  /// Removes a journey. One that came after it now comes after what it came after.
  void removeJourney(String id) {
    final gone = row('journeys', id);
    if (gone == null) throw ChangeRefused('That journey is not in this novel.');
    for (final j in journeys().where((j) => j.afterId == id).toList()) {
      put('journeys', {...j.toJson(), 'afterId': gone['afterId'], 'updatedAt': now});
    }
    remove('journeys', id);
  }

  /// The novel's travel methods. A speed is only ever the author's; a method some journey uses cannot be removed.
  TravelSettings setMethods(List<TravelMethod> methods) {
    final clean = <JsonMap>[];
    for (final m in methods) {
      final name = _text(m.name, 60);
      if (name.isEmpty || clean.any((c) => str(c['name']).toLowerCase() == name.toLowerCase())) continue;
      final speed = m.speed;
      clean.add({
        'id': m.id.isEmpty ? newId() : m.id,
        'name': name,
        'speed': speed != null && speed.isFinite && speed > 0 ? speed : null,
        'distanceUnit': _text(m.distanceUnit, 30),
        'per': m.per.name,
      });
    }
    final current = travelSettings();
    for (final gone in (current?.methods ?? const <TravelMethod>[]).where((m) => !clean.any((c) => c['id'] == m.id))) {
      final using = journeys().where((j) => j.methodId == gone.id).length;
      if (using > 0) {
        throw ChangeRefused(
          '$using ${using == 1 ? 'journey uses' : 'journeys use'} “${gone.name}”. Change ${using == 1 ? 'it' : 'them'} '
          'first.',
        );
      }
    }
    final saved = {
      'id': current?.id ?? newId(),
      'projectId': projectId,
      'methods': clean,
      'createdAt': current?.raw['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('travelSettings', saved);
    return TravelSettings(saved);
  }
}
