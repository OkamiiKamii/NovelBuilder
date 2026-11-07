import '../characters/character_changes.dart';
import '../codex/codex_changes.dart';
import '../json.dart';
import '../records/calendar.dart';
import '../records/link.dart';
import '../records/relation.dart';
import '../timeline/dates.dart';
import 'relation_types.dart';

bool _same(String a, String b) => a.trim().toLowerCase() == b.trim().toLowerCase();

/// Changes to a stage. Only what is given changes; [attributes] may give one way at a time.
class StageInput {
  const StageInput({
    this.preset,
    this.label,
    this.fromRole,
    this.toRole,
    this.directional,
    this.category,
    this.title,
    this.affinity,
    this.event,
    this.notes,
    this.attributes,
    this.start,
    this.startUnknown,
    this.storyEventId,
    this.storyDate,
    this.causeEventId,
    this.causeNodeId,
  });

  final String? preset;
  final String? label;
  final String? fromRole;
  final String? toRole;
  final bool? directional;
  final RelationCategory? category;
  final String? title;
  final Affinity? affinity;

  /// What happened to bring it about, in the author's words.
  final String? event;
  final String? notes;

  /// By attribute key: each way, a value from 0 to 10, or null for "not said"; a side left out is unchanged.
  final Map<String, ({int? from, int? to, bool setFrom, bool setTo})>? attributes;

  /// Where the reader meets it: a volume, arc or chapter (`(value: null)` = the start of the story).
  final ({String? value})? start;

  /// True: where the reader meets it is not said. False: it is.
  final bool? startUnknown;

  /// When it changes in story time: at an event (`(value: null)` = not said).
  final ({String? value})? storyEventId;

  /// When it changes in story time, as a date as rough as the author knows it; an undated one clears it.
  final ({JsonMap? value})? storyDate;

  /// What brought it about (an event), and where it is shown (a chapter or scene): only what the author names.
  final ({String? value})? causeEventId;
  final ({String? value})? causeNodeId;
}

/// Relationship changes, as the original app's relationship service makes them. A relationship is its own record
/// between two characters, with a history of stages: a change adds a stage and never alters another.
class RelationChanges extends CharacterChanges {
  RelationChanges(super.snapshot, {required super.now, required super.createId});

  JsonMap? get _settingsRow => rows('relationSettings').firstOrNull;
  RelationSettings get settings => RelationSettings(_settingsRow);

  void _saveSettings(JsonMap changes) {
    final row = _settingsRow;
    put('relationSettings', {
      'types': <Object?>[],
      'hidden': <String>[],
      'attributes': <Object?>[],
      ...?row,
      'id': row?['id'] ?? newId(),
      'projectId': projectId,
      ...changes,
      'updatedAt': now,
    });
  }

  CharacterRelation relationOf(String relationId) {
    final row = this.row('characterRelations', relationId);
    if (row == null) throw ChangeRefused('That relationship is no longer in this novel.');
    return CharacterRelation(row);
  }

  void _saveStages(CharacterRelation relation, List<JsonMap> stages) =>
      put('characterRelations', relation.merged({'stages': stages, 'updatedAt': now}));

  String? _validStart(String? nodeId) => nodeId != null && row('chapters', nodeId) != null ? nodeId : null;
  String? _ownEvent(String? id) => id != null && row('timelineEvents', id) != null ? id : null;

  RelationPreset _typeOf(String key) {
    final types = settings.types;
    if (key.startsWith(typePrefix) && !types.any((t) => t.key == key)) {
      throw ChangeRefused('That relationship type no longer exists.');
    }
    return typeFor(key, types);
  }

  JsonMap _wording(RelationPreset p) => {
    'preset': p.key,
    'category': p.category.name,
    'label': p.label,
    'fromRole': p.fromRole,
    'toRole': p.toRole,
    'directional': p.directional,
  };

  JsonMap _newStage(RelationPreset preset, String? startNodeId) => {
    'id': newId(),
    'startNodeId': startNodeId,
    ..._wording(preset),
    'label': preset.key == 'custom' ? '' : preset.label,
    'title': '',
    'affinity': 'neutral',
    'event': '',
    'notes': '',
  };

  /// Every stage of every relationship using a type, given new wording.
  void _restage(String key, JsonMap wording) {
    for (final r in rows('characterRelations')) {
      final relation = CharacterRelation(r);
      if (!relation.stages.any((s) => s.preset == key)) continue;
      _saveStages(relation, [
        for (final s in relation.stages) s.preset == key ? {...s.raw, ...wording} : s.raw,
      ]);
    }
  }

  // ------------------------------------------------------------------------------------------------------ settings

  /// Makes ([typeId] null) or changes a type of the novel's own. Its name must be new; a one-way type needs both
  /// roles. Changing a type re-words every stage that uses it.
  RelationType saveType({
    String? label,
    RelationCategory? category,
    bool? directional,
    String? fromRole,
    String? toRole,
    String? typeId,
  }) {
    final current = settings;
    final was = typeId == null ? null : current.types.where((t) => t.id == typeId).firstOrNull;
    if (typeId != null && was == null) throw ChangeRefused('That relationship type no longer exists.');
    final name = (label ?? was?.label ?? '').trim();
    if (name.isEmpty) throw ChangeRefused('Give the type a name.');
    if (relationPresets.any((p) => p.key != 'custom' && _same(p.label, name)) ||
        current.types.any((t) => t.id != typeId && _same(t.label, name))) {
      throw ChangeRefused('There is already a type called “$name”.');
    }
    final oneWay = directional ?? was?.directional ?? false;
    final first = (fromRole ?? was?.fromRole ?? '').trim();
    final second = (toRole ?? was?.toRole ?? '').trim();
    if (oneWay && (first.isEmpty || second.isEmpty)) {
      throw ChangeRefused('A one-way type needs both roles: what the first character is, and what the second is.');
    }
    final type = <String, Object?>{
      'id': was?.id ?? newId(),
      'label': name,
      'category': (category ?? was?.category ?? RelationCategory.custom).name,
      'directional': oneWay,
      'fromRole': first.isNotEmpty ? first : name,
      'toRole': oneWay ? second : (first.isNotEmpty ? first : name),
    };
    _saveSettings({
      'types': was == null
          ? [for (final t in current.types) t.raw, type]
          : [for (final t in current.types) t.id == was.id ? type : t.raw],
    });
    final made = RelationType(type);
    if (was != null) _restage(made.key, _wording(typeFor(made.key, [made])));
    return made;
  }

  /// Deletes a type of the novel's own. Relationships that used it keep their wording, as Custom.
  void removeType(String typeId) {
    final current = settings;
    if (!current.types.any((t) => t.id == typeId)) return;
    _saveSettings({
      'types': [
        for (final t in current.types)
          if (t.id != typeId) t.raw,
      ],
    });
    _restage('$typePrefix$typeId', {'preset': 'custom'});
  }

  /// Whether a built-in type is offered when choosing a type. Hiding one changes no relationship that uses it.
  void offerBuiltIn(String presetKey, {required bool offered}) {
    if (presetKey == 'custom' || !relationPresets.any((p) => p.key == presetKey)) return;
    final hidden = settings.hidden;
    _saveSettings({
      'hidden': offered
          ? [
              for (final k in hidden)
                if (k != presetKey) k,
            ]
          : {...hidden, presetKey}.toList(),
    });
  }

  /// Starts tracking an attribute: a suggested one by its key or name, or one of the author's own by its name.
  TrackedAttribute trackAttribute(String keyOrLabel) {
    final current = settings;
    final suggested = suggestedAttributes.where((a) => a.key == keyOrLabel || _same(a.label, keyOrLabel)).firstOrNull;
    final label = suggested?.label ?? keyOrLabel.trim();
    if (label.isEmpty) throw ChangeRefused('Give the attribute a name.');
    final existing = current.attributes.where((a) => _same(a.label, label)).firstOrNull;
    if (existing != null) throw ChangeRefused('“${existing.label}” is already tracked.');
    final attribute = suggested ?? TrackedAttribute('own-${newId()}', label);
    _saveSettings({
      'attributes': [for (final a in current.attributes) a.toJson(), attribute.toJson()],
    });
    return attribute;
  }

  /// Stops tracking an attribute. Values already given stay in the stages.
  void untrackAttribute(String key) => _saveSettings({
    'attributes': [
      for (final a in settings.attributes)
        if (a.key != key) a.toJson(),
    ],
  });

  // -------------------------------------------------------------------------------------------------- relationships

  /// Links two characters. For a one-way type, the first is the first-named role (the Parent, the Mentor).
  CharacterRelation createRelation(String fromId, String toId, [String presetKey = 'friends']) {
    if (fromId == toId) throw ChangeRefused('Pick two different characters.');
    for (final id in [fromId, toId]) {
      final entry = row('loreEntries', id) ?? (throw ChangeRefused('That character no longer exists.'));
      if (entry['category'] != 'character') throw ChangeRefused('${str(entry['name'])} is not a character.');
    }
    final existing = rows(
      'characterRelations',
    ).any((r) => (r['fromId'] == fromId && r['toId'] == toId) || (r['fromId'] == toId && r['toId'] == fromId));
    if (existing) {
      throw ChangeRefused('These two characters already have a relationship. Add a stage to it to record a change.');
    }
    final relation = <String, Object?>{
      'id': newId(),
      'projectId': projectId,
      'fromId': fromId,
      'toId': toId,
      'stages': [_newStage(_typeOf(presetKey), null)],
      'createdAt': now,
      'updatedAt': now,
    };
    put('characterRelations', relation);
    return CharacterRelation(relation);
  }

  JsonMap _appendStage(CharacterRelation relation, String? startNodeId, {required bool unknown}) {
    final previous = relation.stages.lastOrNull;
    final stage = <String, Object?>{
      ..._newStage(typeFor(previous?.preset ?? 'friends', settings.types), unknown ? null : _validStart(startNodeId)),
      if (previous != null) ...{
        'preset': previous.preset,
        'category': previous.category,
        'label': previous.label,
        'fromRole': previous.fromRole,
        'toRole': previous.toRole,
        'directional': previous.directional,
        'affinity': previous.affinity,
        if (previous.raw['attributes'] != null) 'attributes': deepCopy(previous.raw['attributes']),
      },
      if (unknown) 'startUnknown': true,
    };
    _saveStages(relation, [for (final s in relation.stages) s.raw, stage]);
    return stage;
  }

  /// A new stage: how things stand from [startNodeId] onward (or from a point not said), beginning as things stood.
  RelationStage addStage(String relationId, String? startNodeId, {bool unknown = false}) =>
      RelationStage(_appendStage(relationOf(relationId), startNodeId, unknown: unknown));

  /// Records a change: a new stage holding the changes given. Every earlier stage is kept exactly as it was.
  RelationStage recordChange(
    String relationId, {
    String? nodeId,
    bool unknown = false,
    StageInput changes = const StageInput(),
  }) {
    final stage = _appendStage(relationOf(relationId), nodeId, unknown: unknown);
    updateStage(relationId, str(stage['id']), changes);
    return relationOf(relationId).stages.firstWhere((s) => s.id == stage['id']);
  }

  /// A correction to one stage; every field checked, the others exactly as they were.
  void updateStage(String relationId, String stageId, StageInput c) {
    final relation = relationOf(relationId);
    if (!relation.stages.any((s) => s.id == stageId)) throw ChangeRefused('That stage is no longer there.');
    final chosen = c.preset == null ? null : _typeOf(c.preset!);
    final tracked = settings.attributes;
    for (final e in (c.attributes ?? const {}).entries) {
      final attribute = tracked.where((a) => a.key == e.key).firstOrNull;
      if (attribute == null) throw ChangeRefused('That attribute is not tracked. Choose to track it first.');
      for (final v in [if (e.value.setFrom) e.value.from, if (e.value.setTo) e.value.to]) {
        if (v != null && (v < 0 || v > attributeMax)) {
          throw ChangeRefused('${attribute.label} is given as a whole number from 0 to $attributeMax.');
        }
      }
    }
    final storyEvent = c.storyEventId;
    if (storyEvent?.value != null && _ownEvent(storyEvent!.value) == null) {
      throw ChangeRefused('That event is not in this novel’s timeline.');
    }
    // A date is checked against the novel's calendar, as an event's is; one given from an event points at one of
    // this novel's, and an undated one says nothing.
    final storyDate = c.storyDate == null
        ? null
        : () {
            final given = c.storyDate!.value;
            if (given == null) return null;
            final when = normalizeDate(given, Calendar.fromJson(rows('storyCalendars').firstOrNull));
            if (when['precision'] == 'relative' &&
                when['anchorId'] != null &&
                _ownEvent(when['anchorId']! as String) == null) {
              when['anchorId'] = null;
            }
            return when['precision'] == 'unknown' ? null : <String, Object?>{'kind': 'date', 'when': when};
          }();
    final datePoint = c.storyDate != null;
    final cause = c.causeEventId;
    if (cause?.value != null && _ownEvent(cause!.value) == null) {
      throw ChangeRefused('That event is not in this novel’s timeline.');
    }
    final shown = c.causeNodeId;
    if (shown?.value != null && _validStart(shown!.value) == null) {
      throw ChangeRefused('That chapter or scene is not in this novel.');
    }
    _saveStages(relation, [
      for (final stage in relation.stages)
        if (stage.id != stageId)
          stage.raw
        else
          () {
            final next = <String, Object?>{...deepCopy(stage.raw)! as JsonMap};
            if (chosen != null && chosen.key != stage.preset) {
              // Choosing a type sets its wording; switching to Custom keeps the wording to edit.
              next['preset'] = chosen.key;
              next['category'] = chosen.category.name;
              if (chosen.key != 'custom') next.addAll(_wording(chosen));
            }
            final attrs = c.attributes;
            if (attrs != null) {
              final all = <String, Object?>{...stage.attributes};
              for (final e in attrs.entries) {
                final was = stage.attribute(e.key);
                final from = e.value.setFrom ? e.value.from : was.from;
                final to = e.value.setTo ? e.value.to : was.to;
                if (from == null && to == null) {
                  all.remove(e.key);
                } else {
                  all[e.key] = {'from': from, 'to': to};
                }
              }
              next['attributes'] = all;
            }
            if (next['preset'] == 'custom') {
              if (c.label != null) next['label'] = c.label!.trim();
              if (c.fromRole != null) next['fromRole'] = c.fromRole!.trim();
              if (c.toRole != null) next['toRole'] = c.toRole!.trim();
              if (c.directional != null) next['directional'] = c.directional;
              if (c.category != null) next['category'] = c.category!.name;
            }
            if (c.title != null) next['title'] = c.title!.trim();
            if (c.event != null) next['event'] = c.event;
            if (c.notes != null) next['notes'] = c.notes;
            if (c.affinity != null) next['affinity'] = c.affinity!.name;
            // A chapter given makes the reader's point known; "not said" clears the chapter.
            final start = c.start;
            if (start != null) {
              next['startNodeId'] = _validStart(start.value);
              next.remove('startUnknown');
            }
            if (c.startUnknown == true) {
              next['startNodeId'] = null;
              next['startUnknown'] = true;
            }
            if (c.startUnknown == false) next.remove('startUnknown');
            if (storyEvent != null) {
              next['storyAt'] = storyEvent.value == null ? null : {'kind': 'event', 'eventId': storyEvent.value};
            }
            if (datePoint) next['storyAt'] = storyDate;
            if (cause != null) next['causeEventId'] = cause.value;
            if (shown != null) next['causeNodeId'] = shown.value;
            return next;
          }(),
    ]);
  }

  /// Moves a stage whose chapter is not said earlier or later among the others; a stage at a chapter keeps its place.
  void moveStage(String relationId, String stageId, int by) {
    final relation = relationOf(relationId);
    final stages = [for (final s in relation.stages) s.raw];
    final i = stages.indexWhere((s) => s['id'] == stageId);
    final j = i + by;
    if (i < 0 || j < 0 || j >= stages.length || stages[i]['startUnknown'] != true) return;
    final moving = stages[i];
    stages[i] = stages[j];
    stages[j] = moving;
    _saveStages(relation, stages);
  }

  /// Removes one stage. The last remaining one cannot be removed; delete the relationship instead.
  void removeStage(String relationId, String stageId) {
    final relation = relationOf(relationId);
    if (relation.stages.length <= 1) {
      throw ChangeRefused('A relationship needs at least one stage. Delete the relationship instead.');
    }
    _saveStages(relation, [
      for (final s in relation.stages)
        if (s.id != stageId) s.raw,
    ]);
  }

  /// Swaps who is who (the Mentor becomes the Student), across the whole history.
  void reverse(String relationId) {
    final relation = relationOf(relationId);
    put('characterRelations', relation.merged({'fromId': relation.toId, 'toId': relation.fromId, 'updatedAt': now}));
  }

  /// Deletes a relationship, with the connections recorded on it. The two characters are not touched.
  void removeRelation(String relationId) {
    relationOf(relationId);
    remove('characterRelations', relationId);
    snapshot = snapshot.withRows('loreLinks', [
      for (final l in rows('loreLinks'))
        if (l['fromId'] != relationId && l['toId'] != relationId) l,
    ]);
  }

  // ------------------------------------------------------------------------------------ connections over story time

  void _checkAnchor(JsonMap anchor) => checkPoint(anchor);

  /// Records that a connection changed at a point in the story, keeping what was true before: this one stops there,
  /// and a new one, with the changes (another record at either end, another type or wording), starts there. Returns the
  /// new connection's id.
  String changeConnection(
    String linkId,
    JsonMap at, {
    String? fromId,
    String? toId,
    String? type,
    String? label,
    String? how,
  }) {
    _checkAnchor(at);
    final link = row('loreLinks', linkId) ?? (throw ChangeRefused('That connection is not in this novel.'));
    final validity = mapOrNull(link['validity']);
    put('loreLinks', {
      ...link,
      'validity': {'from': validity?['from'], 'until': at},
      'updatedAt': now,
    });
    final next = <String, Object?>{
      ...link,
      'id': newId(),
      'fromId': fromId ?? link['fromId'],
      'toId': toId ?? link['toId'],
      'type': type ?? link['type'] ?? 'related',
      'fromLabel': (label ?? str(link['fromLabel'])).trim(),
      'validity': {'from': at, 'until': validity?['until']},
      'createdAt': now,
      'updatedAt': now,
    }..remove('endHow');
    // How the new holding began ("stolen", "given"), when the author says; the old one's words are not carried over.
    if (how != null) {
      next.remove('how');
      if (how.trim().isNotEmpty) next['how'] = how.trim().length > 80 ? how.trim().substring(0, 80) : how.trim();
    }
    if (toId != null && !recordExists(Link(next).to)) throw ChangeRefused('That record is not in this novel.');
    if (fromId != null && !recordExists(Link(next).from)) throw ChangeRefused('That record is not in this novel.');
    put('loreLinks', next);
    return str(next['id']);
  }

  /// Records where in the story a connection begins to hold (a new holder from a chapter or an event). Where it ends,
  /// if anywhere, is kept.
  void startConnectionAt(String linkId, JsonMap at) {
    _checkAnchor(at);
    final link = row('loreLinks', linkId) ?? (throw ChangeRefused('That connection is not in this novel.'));
    final validity = mapOrNull(link['validity']);
    put('loreLinks', {
      ...link,
      'validity': {'from': at, 'until': validity?['until']},
      'updatedAt': now,
    });
  }

  /// Records that a connection stopped holding at a point in the story, and how, when the author says. It stays, as
  /// history.
  void endConnection(String linkId, JsonMap at, {String endHow = ''}) {
    _checkAnchor(at);
    final link = row('loreLinks', linkId) ?? (throw ChangeRefused('That connection is not in this novel.'));
    final validity = mapOrNull(link['validity']);
    final how = endHow.trim().length > 80 ? endHow.trim().substring(0, 80) : endHow.trim();
    put('loreLinks', {
      ...link,
      'validity': {'from': validity?['from'], 'until': at},
      if (how.isNotEmpty) 'endHow': how,
      'updatedAt': now,
    });
  }
}
