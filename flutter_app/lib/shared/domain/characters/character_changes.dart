import 'dart:math' as math;

import '../codex/codex_changes.dart';
import '../codex/field_values.dart';
import '../json.dart';
import '../model/delete_policy.dart';
import '../model/entity_ref.dart';
import '../records/category.dart';
import '../records/entry.dart';
import '../records/link.dart';
import '../snapshot/novel_snapshot.dart';
import '../stable_sort.dart';
import 'character_records.dart';
import 'knowledge.dart';
import 'templates.dart';

/// The collections a character change reads and writes (everything but deleting, which reaches further). A change
/// can be made from a snapshot holding only these, so a long book's text and history are not loaded for each edit.
const characterCollections = {
  'loreEntries',
  'loreSchemas',
  'loreLinks',
  'characterProfiles',
  'characterSecrets',
  'characterNotes',
  'characterHistory',
  'characterTemplates',
  'chapters',
  'timelineEvents',
  // For connections: their ends must exist.
  'plotThreads',
  'characterRelations',
  'systems',
  // The novel's own relationship types and tracked attributes.
  'relationSettings',
  // Dates in story time (a relationship stage's) are read in the novel's calendar.
  'storyCalendars',
};

/// Changes to who a character is: [IdentityChanges.image] is a record so a portrait can be removed (`(value: null)`).
class IdentityChanges {
  const IdentityChanges({
    this.name,
    this.summary,
    this.epithet,
    this.aliases,
    this.roles,
    this.status,
    this.image,
    this.focal,
    this.tags,
  });

  final String? name;
  final String? summary;
  final String? epithet;
  final List<String>? aliases;
  final List<String>? roles;
  final String? status;
  final ({String? value})? image;
  final Focal? focal;
  final List<String>? tags;
}

/// What refers to a character, for telling the author before they delete one.
class CharacterReferences {
  CharacterReferences(this.counts);

  /// By kind, in the order they are told: chapters, relationships, events, threads, links, sheets, snapshots,
  /// secrets, inSecrets, notes.
  final Map<String, int> counts;

  int operator [](String key) => counts[key] ?? 0;
  bool get any => counts.values.any((n) => n > 0);
}

/// Edits to the same thing within this long are one line of history, from the first value to the last.
const sameEditMs = 10 * 60 * 1000;

const _knowledgeKeys = ['knows', 'suspects', 'unaware'];

String _short(String text) => (text.length > 90 ? '${text.substring(0, 89)}…' : text).replaceAll(RegExp(r'\s+'), ' ');

/// JavaScript's `Math.round`: halves go up, also below zero.
int _round(num n) => (n + 0.5).floor();

/// Character changes, as the original app's character service makes them. A character is a codex entry in Characters;
/// its profile, secrets, notes and history hang off it by its id.
class CharacterChanges extends CodexChanges {
  CharacterChanges(super.snapshot, {required super.now, required super.createId});

  /// The character, or a refusal: only an entry of the Characters category is one.
  Entry character(String entryId) {
    final row = this.row('loreEntries', entryId);
    if (row == null || row['category'] != 'character') throw ChangeRefused('That character is not in this novel.');
    return Entry(row);
  }

  CharacterProfile? stored(String entryId) {
    final found = stableSorted(
      rows('characterProfiles').where((p) => p['entryId'] == entryId),
      (a, b) => str(a['id']).compareTo(str(b['id'])),
    );
    return found.isEmpty ? null : CharacterProfile(found.first);
  }

  /// The profile of a character that has none stored yet (one made before profiles existed, or in the Codex): the
  /// general layout, empty. Nothing is written by asking.
  CharacterProfile fresh(Entry entry, [CharacterTemplate? template]) =>
      freshProfile(entry, projectId, template ?? builtinTemplates.first);

  CharacterProfile profileOf(Entry entry) => stored(entry.id) ?? fresh(entry);

  void _save(JsonMap profile) => put('characterProfiles', {...profile, 'updatedAt': now});

  void _saveProfile(CharacterProfile profile, [JsonMap changes = const {}]) => _save(profile.merged(changes));

  List<CharacterTemplate> templates() => [
    ...builtinTemplates,
    ...stableSorted([
      for (final r in rows('characterTemplates'))
        if (r['projectId'] == projectId) CharacterTemplate.fromJson(r),
    ], (a, b) => a.createdAt.compareTo(b.createdAt)),
  ];

  /// Notes a change to the record. Typing in a field is many small saves: they are folded into one line, from the
  /// first value to the last, and dropped when the value ends where it began.
  void record(String entryId, String action, String label, [String from = '', String to = '']) {
    if (action == 'field' || action == 'identity') {
      final mine = [
        for (final h in rows('characterHistory'))
          if (h['entryId'] == entryId && h['kind'] == 'record' && h['action'] == action && h['label'] == label)
            CharacterHistoryLine(h),
      ];
      final last = stableSorted(mine, (a, b) => b.at.compareTo(a.at)).firstOrNull;
      if (last != null && now - last.at < sameEditMs) {
        if (last.from == _short(to)) {
          remove('characterHistory', last.id);
        } else {
          put('characterHistory', last.merged({'to': _short(to), 'at': now}));
        }
        return;
      }
      if (_short(from) == _short(to)) return;
    }
    put('characterHistory', {
      'id': newId(),
      'projectId': projectId,
      'entryId': entryId,
      'at': now,
      'kind': 'record',
      'action': action,
      'label': label,
      'from': _short(from),
      'to': _short(to),
      'text': '',
      'nodeId': null,
    });
  }

  /// Changes a profile as it is stored right now, and saves it.
  CharacterProfile _edit(String entryId, JsonMap Function(CharacterProfile profile, Entry entry) change) {
    final entry = character(entryId);
    final next = change(profileOf(entry), entry);
    _save(next);
    return CharacterProfile({...next, 'updatedAt': now});
  }

  ProfileSection _section(CharacterProfile profile, String sectionId) =>
      profile.sections.where((s) => s.id == sectionId).firstOrNull ??
      (throw ChangeRefused('That section is no longer on the profile.'));

  List<JsonMap> _sectionsWith(CharacterProfile profile, String sectionId, JsonMap Function(ProfileSection s) change) =>
      [for (final s in profile.sections) s.id == sectionId ? change(s) : s.toJson()];

  void _putFields(Entry entry, List<Object?> fields) => putEntry(entry, {'fields': fields});

  // ------------------------------------------------------------------------------------------------------ the record

  /// Creates a character: a codex entry in Characters, and its profile. Only a name is needed.
  Entry create({
    required String name,
    String epithet = '',
    List<String> roles = const [],
    String summary = '',
    String? templateId,
  }) {
    if (name.trim().isEmpty) throw ChangeRefused('Give the character a name.');
    var entry = createEntry('character', name.trim());
    if (summary.trim().isNotEmpty) {
      updateEntry(entry.id, summary: summary.trim());
      entry = owned(entry.id);
    }
    final template = templates().where((t) => t.id == templateId).firstOrNull ?? builtinTemplates.first;
    final last = rows('characterProfiles').fold<num>(0, (m, p) => math.max(m, numOrNull(p['order']) ?? 0));
    _save(
      fresh(entry, template).merged({
        'id': newId(),
        'epithet': epithet.trim(),
        'roles': cleanList(roles),
        'order': math.max(last + 1, entry.createdAt),
      }),
    );
    record(entry.id, 'created', name.trim());
    return owned(entry.id);
  }

  /// Changes who the character is: name, summary, portrait and tags on the entry; epithet, aliases, roles, status and
  /// portrait focus on the profile. Each change is noted in the character's history.
  void identity(String entryId, IdentityChanges changes) {
    final entry = character(entryId);
    final profile = profileOf(entry);
    if (changes.name != null || changes.summary != null || changes.image != null || changes.tags != null) {
      updateEntry(entryId, name: changes.name, summary: changes.summary, image: changes.image, tags: changes.tags);
    }
    final focal = changes.focal;
    final next = CharacterProfile(
      profile.merged({
        if (changes.epithet != null) 'epithet': changes.epithet!.trim(),
        if (changes.aliases != null) 'aliases': cleanList(changes.aliases!),
        if (changes.roles != null) 'roles': cleanList(changes.roles!),
        if (changes.status != null) 'status': changes.status!.trim(),
        if (focal != null) 'focal': {'x': _round(focal.x).clamp(0, 100), 'y': _round(focal.y).clamp(0, 100)},
      }),
    );
    _saveProfile(next);
    final said = <(String, String, String)>[
      if (changes.name != null && changes.name!.trim() != entry.name) ('Name', entry.name, changes.name!.trim()),
      if (changes.summary != null && changes.summary != entry.summary) ('Summary', entry.summary, changes.summary!),
      if (changes.epithet != null && next.epithet != profile.epithet) ('Title', profile.epithet, next.epithet),
      if (changes.aliases != null && next.aliases.join(',') != profile.aliases.join(','))
        ('Aliases', profile.aliases.join(', '), next.aliases.join(', ')),
      if (changes.roles != null && next.roles.join(',') != profile.roles.join(','))
        ('Role', profile.roles.join(', '), next.roles.join(', ')),
      if (changes.status != null && next.status != profile.status) ('Status', profile.status, next.status),
    ];
    for (final (label, from, to) in said) {
      record(entryId, 'identity', label, from, to);
    }
    final image = changes.image;
    if (image != null && image.value != entry.image) {
      record(entryId, 'portrait', image.value != null ? (entry.image != null ? 'replaced' : 'added') : 'removed');
    }
  }

  /// Puts a character away, or brings it back. Nothing is removed and nothing that refers to it changes.
  void setArchived(String entryId, bool archived) => _edit(entryId, (profile, _) {
    if (profile.archived != archived) record(entryId, archived ? 'archived' : 'restored', '');
    return profile.merged({'archived': archived});
  });

  /// Sets the author's own order of the library.
  void reorder(List<String> entryIds) {
    for (final (index, entryId) in entryIds.indexed) {
      _saveProfile(profileOf(character(entryId)), {'order': index + 1});
    }
  }

  // ------------------------------------------------------------------------------------------------------- sections

  void addSection(String entryId, String name, [ProfileTab tab = ProfileTab.overview]) => _edit(entryId, (profile, _) {
    if (name.trim().isEmpty) throw ChangeRefused('Give the section a name.');
    record(entryId, 'section', name.trim(), '', 'added');
    return profile.merged({
      'sections': [
        for (final s in profile.sections) s.toJson(),
        {'id': newId(), 'name': name.trim(), 'tab': tab.name, 'hidden': false, 'fieldIds': <String>[]},
      ],
    });
  });

  void updateSection(String entryId, String sectionId, {String? name, bool? hidden, ProfileTab? tab}) =>
      _edit(entryId, (profile, _) {
        _section(profile, sectionId);
        if (name != null && name.trim().isEmpty) throw ChangeRefused('Give the section a name.');
        return profile.merged({
          'sections': _sectionsWith(
            profile,
            sectionId,
            (s) => s.merged({
              if (name != null) 'name': name.trim(),
              'hidden': ?hidden,
              if (tab != null) 'tab': tab.name,
            }).toJson(),
          ),
        });
      });

  /// Moves a section one place earlier (-1) or later (+1) among the sections of its tab.
  void moveSection(String entryId, String sectionId, int by) => _edit(entryId, (profile, _) {
    final sections = profile.sections;
    final here = _section(profile, sectionId);
    final peers = [
      for (final s in sections)
        if (s.tab == here.tab) s.id,
    ];
    final at = peers.indexOf(here.id) + by;
    if (at < 0 || at >= peers.length) return profile.toJson();
    final otherId = peers[at];
    final byId = {for (final s in sections) s.id: s};
    return profile.merged({
      'sections': [
        for (final s in sections) (s.id == here.id ? byId[otherId]! : (s.id == otherId ? here : s)).toJson(),
      ],
    });
  });

  /// A copy of a section with the same fields, all empty.
  ProfileSection duplicateSection(String entryId, String sectionId) {
    final entry = character(entryId);
    final profile = profileOf(entry);
    final source = _section(profile, sectionId);
    final fields = entry.fields;
    final copies = [
      for (final id in source.fieldIds)
        if (fields.where((f) => f.id == id).firstOrNull case final field?)
          <String, Object?>{
            'id': newId(),
            'key': field.key,
            'value': '',
            if (field.raw['type'] != null) 'type': field.raw['type'],
            if (field.options.isNotEmpty) 'options': field.raw['options'],
          },
    ];
    // An empty field is kept by its name; the entry stores it like any other.
    _putFields(entry, [...listOf(entry.raw['fields']), ...copies]);
    final copy = <String, Object?>{
      'id': newId(),
      'name': '${source.name} (copy)',
      'tab': source.tab.name,
      'hidden': false,
      'fieldIds': [for (final c in copies) c['id']],
    };
    final at = profile.sections.indexWhere((s) => s.id == sectionId) + 1;
    final sections = [for (final s in profile.sections) s.toJson()]..insert(at, copy);
    _saveProfile(profile, {'sections': sections});
    return ProfileSection(copy);
  }

  /// Takes a section off the profile. With [deleteFields] its fields and what was written in them go too; without,
  /// they stay on the character and are listed under the fields that have no section.
  void removeSection(String entryId, String sectionId, {bool deleteFields = false}) {
    final entry = character(entryId);
    final profile = profileOf(entry);
    final gone = _section(profile, sectionId);
    if (deleteFields) {
      _putFields(entry, [
        for (final f in listOf(entry.raw['fields']))
          if (!(f is Map && gone.fieldIds.contains(f['id']))) f,
      ]);
    }
    _saveProfile(profile, {
      'sections': [
        for (final s in profile.sections)
          if (s.id != sectionId) s.toJson(),
      ],
    });
    record(entryId, 'section', gone.name, '', deleteFields ? 'removed with its fields' : 'removed');
  }

  /// Adds the sections of a template that the profile does not have yet (matched by name). Nothing already there is
  /// changed or removed.
  void applyTemplate(String entryId, String templateId) => _edit(entryId, (profile, _) {
    final template =
        templates().where((t) => t.id == templateId).firstOrNull ??
        (throw ChangeRefused('That template is no longer there.'));
    final have = {for (final s in profile.sections) s.name.trim().toLowerCase()};
    final added = [
      for (final s in sectionsOf(template))
        if (!have.contains(str(s['name']).trim().toLowerCase())) {...s, 'id': newId()},
    ];
    record(
      entryId,
      'template',
      template.name,
      '',
      '${added.length} ${added.length == 1 ? 'section' : 'sections'} added',
    );
    return profile.merged({
      'sections': [for (final s in profile.sections) s.toJson(), ...added],
    });
  });

  /// Saves this profile's layout (its sections and the names and types of their fields, not what is written in them)
  /// for use on the novel's other characters.
  CharacterTemplate saveTemplate(String entryId, String name) {
    if (name.trim().isEmpty) throw ChangeRefused('Give the template a name.');
    final entry = character(entryId);
    final profile = profileOf(entry);
    final fields = entry.fields;
    final template = <String, Object?>{
      'id': newId(),
      'projectId': projectId,
      'name': name.trim(),
      'description': 'Saved from ${entry.name}.',
      'createdAt': now,
      'sections': [
        for (final s in profile.sections)
          {
            'name': s.name,
            'tab': s.tab.name,
            'fields': [
              for (final id in s.fieldIds)
                if (fields.where((f) => f.id == id).firstOrNull case final f? when f.key.trim().isNotEmpty)
                  {
                    'name': f.key,
                    'type': f.raw['type'] ?? 'text',
                    if (f.options.isNotEmpty) 'options': f.raw['options'],
                  },
            ],
          },
      ],
    };
    put('characterTemplates', template);
    return CharacterTemplate.fromJson(template);
  }

  void removeTemplate(String templateId) {
    final template = row('characterTemplates', templateId);
    if (template != null && template['projectId'] == projectId) remove('characterTemplates', templateId);
  }

  // ------------------------------------------------------------------- fields (on the entry, where the Codex shows them)

  JsonMap addField(String entryId, String sectionId, FieldSuggestion field, {String value = ''}) {
    final entry = character(entryId);
    final profile = profileOf(entry);
    _section(profile, sectionId);
    if (field.name.trim().isEmpty) throw ChangeRefused('Give the field a name.');
    final made = <String, Object?>{
      'id': newId(),
      'key': field.name.trim(),
      'value': value,
      if (field.type != FieldType.text) 'type': field.type.name,
      if (field.options.isNotEmpty) 'options': cleanList(field.options),
    };
    _putFields(entry, [...listOf(entry.raw['fields']), made]);
    _saveProfile(profile, {
      'sections': _sectionsWith(
        profile,
        sectionId,
        (s) => s.merged({
          'fieldIds': [...s.fieldIds, made['id']],
        }).toJson(),
      ),
    });
    return made;
  }

  /// Changes a field's name, type, choices or value. A change of value is noted in the character's history, as a
  /// reader would read it (a linked entry by its name).
  void updateField(
    String entryId,
    String fieldId, {
    String? key,
    String? value,
    FieldType? type,
    List<String>? options,
  }) {
    final entry = character(entryId);
    final field =
        entry.fields.where((f) => f.id == fieldId).firstOrNull ??
        (throw ChangeRefused('That field is no longer on the character.'));
    if (key != null && key.trim().isEmpty && field.defId == null) throw ChangeRefused('Give the field a name.');
    final next = <String, Object?>{
      ...field.raw,
      if (key != null && field.defId == null) 'key': key.trim(),
      'value': ?value,
      if (type != null) 'type': type.name,
      if (options != null) 'options': cleanList(options),
    };
    _putFields(entry, [for (final f in listOf(entry.raw['fields'])) (f is Map && f['id'] == fieldId) ? next : f]);
    if (value != null && value != field.value) {
      final names = {for (final e in rows('loreEntries')) str(e['id']): str(e['name'])};
      String shown(String v) => displayValue(EntryField(next).type, v, (id) => names[id]);
      final label = str(next['key']);
      record(entryId, 'field', label.isNotEmpty ? label : 'A field', shown(field.value), shown(value));
    }
  }

  /// Moves a field one place within its section ([by] -1 or +1), or to the end of another section ([toSection]).
  void moveField(String entryId, String fieldId, {int? by, String? toSection}) => _edit(entryId, (profile, _) {
    if (by != null) {
      final from = profile.sections.where((s) => s.fieldIds.contains(fieldId)).firstOrNull;
      if (from == null) return profile.toJson();
      final ids = [...from.fieldIds];
      final at = ids.indexOf(fieldId);
      final swap = at + by;
      if (swap < 0 || swap >= ids.length) return profile.toJson();
      final moving = ids[at];
      ids[at] = ids[swap];
      ids[swap] = moving;
      return profile.merged({
        'sections': _sectionsWith(profile, from.id, (s) => s.merged({'fieldIds': ids}).toJson()),
      });
    }
    _section(profile, toSection!);
    return profile.merged({
      'sections': [
        for (final s in profile.sections)
          s.merged({
            'fieldIds': [
              for (final id in s.fieldIds)
                if (id != fieldId) id,
              if (s.id == toSection) fieldId,
            ],
          }).toJson(),
      ],
    });
  });

  void removeField(String entryId, String fieldId) {
    final entry = character(entryId);
    final profile = profileOf(entry);
    final field = entry.fields.where((f) => f.id == fieldId).firstOrNull;
    _putFields(entry, [
      for (final f in listOf(entry.raw['fields']))
        if (!(f is Map && f['id'] == fieldId)) f,
    ]);
    _saveProfile(profile, {
      'sections': [
        for (final s in profile.sections)
          s.merged({
            'fieldIds': [
              for (final id in s.fieldIds)
                if (id != fieldId) id,
            ],
          }).toJson(),
      ],
    });
    if (field != null && field.value.trim().isNotEmpty) {
      record(entryId, 'field', field.key.isNotEmpty ? field.key : 'A field', _short(field.value), 'removed');
    }
  }

  /// Records how a link to another entry stands (Active, Former, Secret…). The link itself belongs to the Codex.
  void setLinkStatus(String entryId, String linkId, String status) => _edit(
    entryId,
    (profile, _) => profile.merged({
      'linkStatus': {...profile.linkStatus, linkId: status.trim()},
    }),
  );

  // -------------------------------------------------------------------------------------------------------- secrets

  List<CharacterSecret> secrets(String entryId) => stableSorted([
    for (final r in rows('characterSecrets'))
      if (r['entryId'] == entryId) CharacterSecret(r),
  ], (a, b) => a.createdAt.compareTo(b.createdAt));

  /// Creates ([secretId] null) or changes a secret. [changes] holds only what changes, by its stored name. A character
  /// knows, suspects or is unaware: the list changed last wins, the secret's own character is in none of them, and
  /// someone whose knowledge has a recorded history is kept in it.
  CharacterSecret saveSecret(String entryId, String? secretId, JsonMap changes) {
    character(entryId);
    final was = secretId == null ? null : row('characterSecrets', secretId);
    if (secretId != null && (was == null || was['entryId'] != entryId)) {
      throw ChangeRefused('That secret is no longer there.');
    }
    final base =
        was ??
        <String, Object?>{
          'id': newId(),
          'projectId': projectId,
          'entryId': entryId,
          'title': '',
          'description': '',
          'status': 'Hidden',
          'self': 'knows',
          'knows': <String>[],
          'suspects': <String>[],
          'unaware': <String>[],
          'reader': 'unaware',
          'readerNodeId': null,
          'firstNodeId': null,
          'revealNodeId': null,
          'revealEventId': null,
          'nodeIds': <String>[],
          'threadIds': <String>[],
          'notes': '',
          'records': <Object?>[],
          'needs': <Object?>[],
          'createdAt': now,
          'updatedAt': now,
        };
    final next = <String, Object?>{...base, ...changes, 'updatedAt': now};
    final title = str(next['title']).trim();
    if (title.isEmpty) throw ChangeRefused('Give the secret a title.');
    final lists = {for (final k in _knowledgeKeys) k: cleanList(listOf(next[k]))};
    for (final moved in _knowledgeKeys.where(changes.containsKey)) {
      for (final other in _knowledgeKeys.where((k) => k != moved)) {
        lists[other] = [
          for (final id in lists[other]!)
            if (!lists[moved]!.contains(id)) id,
        ];
      }
    }
    final recorded = {for (final r in maps(next['records'])) str(r['characterId'])};
    final added = [
      for (final k in _knowledgeKeys)
        for (final id in strings(changes[k]))
          if (recorded.contains(id) && !strings(base[k]).contains(id)) id,
    ];
    if (added.isNotEmpty) {
      throw ChangeRefused('That character’s knowledge has a recorded history: add a record to it instead.');
    }
    String knowledge(Object? value, String fallback) => Knowledge.of(value)?.name ?? fallback;
    final tidy = <String, Object?>{
      ...next,
      'title': title,
      for (final k in _knowledgeKeys)
        k: [
          for (final id in lists[k]!)
            if (id != entryId && !recorded.contains(id)) id,
        ],
      'self': knowledge(next['self'], 'knows'),
      'reader': knowledge(next['reader'], 'unaware'),
      'nodeIds': cleanList(listOf(next['nodeIds'])),
      'threadIds': cleanList(listOf(next['threadIds'])),
    };
    put('characterSecrets', tidy);
    return CharacterSecret(tidy);
  }

  void removeSecret(String secretId) {
    if (row('characterSecrets', secretId) != null) remove('characterSecrets', secretId);
  }

  // ---------------------------------------------------------------------------------------------------------- notes

  /// Pinned first, then the most recently changed.
  List<CharacterNote> notes(String entryId) => stableSorted(
    [
      for (final r in rows('characterNotes'))
        if (r['entryId'] == entryId) CharacterNote(r),
    ],
    (a, b) {
      final pinned = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return pinned != 0 ? pinned : b.updatedAt.compareTo(a.updatedAt);
    },
  );

  CharacterNote saveNote(
    String entryId,
    String? noteId, {
    String? title,
    String? content,
    List<String>? tags,
    bool? pinned,
    List<String>? nodeIds,
  }) {
    character(entryId);
    final was = noteId == null ? null : row('characterNotes', noteId);
    if (noteId != null && (was == null || was['entryId'] != entryId)) {
      throw ChangeRefused('That note is no longer there.');
    }
    final next = <String, Object?>{
      ...was ??
          {
            'id': newId(),
            'projectId': projectId,
            'entryId': entryId,
            'title': '',
            'content': '',
            'tags': <String>[],
            'pinned': false,
            'nodeIds': <String>[],
            'createdAt': now,
            'updatedAt': now,
          },
      'title': ?title,
      'content': ?content,
      'tags': ?tags,
      'pinned': ?pinned,
      'nodeIds': ?nodeIds,
      'updatedAt': now,
    };
    final theTitle = str(next['title']).trim();
    final theContent = str(next['content']).trim();
    if (theTitle.isEmpty && theContent.isEmpty) throw ChangeRefused('Write the note first.');
    final firstLine = theContent.split('\n').first;
    final tidy = <String, Object?>{
      ...next,
      'title': theTitle.isNotEmpty ? theTitle : (firstLine.length > 60 ? firstLine.substring(0, 60) : firstLine),
      'tags': cleanList(listOf(next['tags'])),
      'nodeIds': cleanList(listOf(next['nodeIds'])),
    };
    put('characterNotes', tidy);
    return CharacterNote(tidy);
  }

  void removeNote(String noteId) {
    if (row('characterNotes', noteId) != null) remove('characterNotes', noteId);
  }

  /// Copies a note into the character's record, as a long-text field. The only way a note becomes part of what is
  /// established about a character, and only when the author asks. The note itself is kept.
  JsonMap promoteNote(String noteId, String sectionId, String fieldName) {
    final noteRow = row('characterNotes', noteId) ?? (throw ChangeRefused('That note is no longer there.'));
    final note = CharacterNote(noteRow);
    final entry = character(note.entryId);
    final profile = profileOf(entry);
    _section(profile, sectionId);
    if (fieldName.trim().isEmpty) throw ChangeRefused('Say which field it goes into.');
    final made = <String, Object?>{
      'id': newId(),
      'key': fieldName.trim(),
      'value': note.content.trim(),
      'type': 'longtext',
    };
    _putFields(entry, [...listOf(entry.raw['fields']), made]);
    _saveProfile(profile, {
      'sections': _sectionsWith(
        profile,
        sectionId,
        (s) => s.merged({
          'fieldIds': [...s.fieldIds, made['id']],
        }).toJson(),
      ),
    });
    record(entry.id, 'note', fieldName.trim(), '', 'copied from the note “${note.title}”');
    return made;
  }

  // -------------------------------------------------------------------------------------------------------- history

  /// Newest first.
  List<CharacterHistoryLine> history(String entryId) => stableSorted([
    for (final r in rows('characterHistory'))
      if (r['entryId'] == entryId) CharacterHistoryLine(r),
  ], (a, b) => b.at.compareTo(a.at));

  /// Writes down something that happens to the character in the story, optionally at a chapter.
  CharacterHistoryLine addMilestone(String entryId, String text, [String? nodeId]) {
    character(entryId);
    if (text.trim().isEmpty) throw ChangeRefused('Say what happens.');
    final line = <String, Object?>{
      'id': newId(),
      'projectId': projectId,
      'entryId': entryId,
      'at': now,
      'kind': 'story',
      'action': 'milestone',
      'label': '',
      'from': '',
      'to': '',
      'text': text.trim(),
      'nodeId': nodeId != null && row('chapters', nodeId) != null ? nodeId : null,
    };
    put('characterHistory', line);
    return CharacterHistoryLine(line);
  }

  /// Only the author's own story lines can be removed; the record of changes cannot.
  void removeMilestone(String historyId) {
    final line = row('characterHistory', historyId);
    if (line != null && line['kind'] == 'story') remove('characterHistory', historyId);
  }
}

/// The empty profile of [entry] in [template]'s layout, as the original app makes one for a character without a
/// stored profile. Its id is worked out from the entry's, so asking twice gives the same profile.
CharacterProfile freshProfile(Entry entry, String projectId, CharacterTemplate template) => CharacterProfile({
  'id': 'profile-${entry.id}',
  'projectId': projectId,
  'entryId': entry.id,
  'epithet': '',
  'aliases': <String>[],
  'roles': <String>[],
  'status': '',
  'archived': false,
  'focal': {'x': 50, 'y': 30},
  'order': entry.createdAt,
  'sections': sectionsOf(template),
  'linkStatus': <String, Object?>{},
  'createdAt': entry.createdAt,
  'updatedAt': entry.createdAt,
});

/// Everything in the novel that refers to this character. Reads only. [s] must hold the whole novel.
CharacterReferences referencesTo(NovelSnapshot s, String entryId) {
  int count(String collection, bool Function(JsonMap row) test) => s.rows(collection).where(test).length;
  final secrets = [for (final r in s.rows('characterSecrets')) CharacterSecret(r)];
  return CharacterReferences({
    'chapters': count('chapters', (n) => strings(n['mentions']).contains(entryId)),
    'relationships': count('characterRelations', (r) => r['fromId'] == entryId || r['toId'] == entryId),
    'events': count(
      'timelineEvents',
      (e) => maps(e['characters']).any((c) => c['id'] == entryId) || strings(e['entryIds']).contains(entryId),
    ),
    'threads': count('plotThreads', (t) => strings(t['characterIds']).contains(entryId)),
    'links': [
      for (final l in s.rows('loreLinks').map(Link.new))
        if (l.isEntryLink && (l.fromId == entryId || l.toId == entryId)) l,
    ].length,
    'sheets': count('systemSheets', (r) => r['entryId'] == entryId),
    'snapshots': count('progressSnapshots', (r) => r['entryId'] == entryId),
    'secrets': secrets.where((x) => x.entryId == entryId).length,
    'inSecrets': secrets.where((x) => x.entryId != entryId && peopleOf(x).contains(entryId)).length,
    'notes': count('characterNotes', (r) => r['entryId'] == entryId),
  });
}

/// Deleting a character for good, as the original app does it: other characters' secrets drop the character from
/// who knows or suspects, and their knowledge records and marks (a record of someone learning it from them keeps
/// everything but who it was from); then the entry goes the way every entry does ([planDelete]): with its links,
/// relationships, profile, secrets, notes and history. The manuscript's words are not touched; a linked name stays,
/// pointing at nothing. [s] must hold the whole novel.
DeleteOutcome planCharacterDelete(NovelSnapshot s, String entryId) {
  final entry = s.rows('loreEntries').where((r) => r['id'] == entryId).firstOrNull;
  if (entry == null || entry['category'] != 'character') throw ChangeRefused('That character is not in this novel.');
  final secrets = [
    for (final r in s.rows('characterSecrets'))
      () {
        final secret = CharacterSecret(r);
        if (secret.entryId == entryId || !peopleOf(secret).contains(entryId)) return r;
        return secret.merged({
          for (final k in _knowledgeKeys)
            k: [
              for (final id in secret.listed(Knowledge.values.byName(k)))
                if (id != entryId) id,
            ],
          'records': [
            for (final rec in maps(r['records']))
              if (rec['characterId'] != entryId) rec['fromId'] == entryId ? {...rec, 'fromId': null} : rec,
          ],
          'needs': [
            for (final n in maps(r['needs']))
              if (n['characterId'] != entryId) n,
          ],
        });
      }(),
  ];
  return planDelete(s.withRows('characterSecrets', secrets), EntityRef(EntityType.entry, entryId));
}
