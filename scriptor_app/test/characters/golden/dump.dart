// The Flutter app's own outputs for the characters domain (characters.golden.json pins them; outputs.ts makes
// Scriptor's, keyed the same way). For every novel given: the cast as the library reads it (with and without where
// names are on the page), every sort, the filter menus, searches, filters, name counts, the names looked for and
// where they are found, the passages, secrets (who knows, the spread on both axes, the checks), the appearance matrix,
// references, profiles, a line about each character, their sentence, and the stakes; then script.json's changes,
// step by step (each step's result, and a hash of the novel after it). And `misc`: the pure helpers on their own.
//
// To make the golden again (as for test/model/golden/dump.dart):
//   1. A package config like flutter_app/.dart_tool/package_config.json, with `flutter` pointing at a stand-in package
//      whose lib/foundation.dart is `export 'package:meta/meta.dart' show immutable;` and `novel_builder` at
//      flutter_app. Keep it outside both apps.
//   2. dart run --packages=<that config> dump.dart script.json characters.golden.json \
//        ../../../../flutter_app/test/fixtures/*.novel.json ../../model/edge.novel.json \
//        ../../../assets/sample/the-drowned-road.novel.json knowledge.novel.json
//      (its output is the golden as it is: the reads as hashes, the steps and `misc` whole).
// With FULL=<file> set, the reads are written there whole, to compare with outputs.ts's (CHAR_DUMP).

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/characters/appearances.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/field_kinds.dart';
import 'package:novel_builder/shared/domain/characters/from_line.dart';
import 'package:novel_builder/shared/domain/characters/knowledge.dart';
import 'package:novel_builder/shared/domain/characters/logline.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/characters/one_line.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';
import 'package:novel_builder/shared/domain/characters/templates.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/novel.dart' show novelAccents;
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/text/fold.dart';

// ---------------------------------------------------------------------------------------------------- hashing

String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

// ---------------------------------------------------------------------------------------------------- feature code

/// cast_card.dart's `castTone`, as its hex.
String castToneHex(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return novelAccents[h % novelAccents.length];
}

/// cast_card.dart's `monogram` (first code unit for the first character: the inputs are plain letters).
String monogram(String name) {
  final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty && RegExp(r'\w').hasMatch(w[0])).toList();
  if (words.isEmpty) return '?';
  return words.take(2).map((w) => w[0].toUpperCase()).join();
}

/// history_tab.dart's `recordWords`.
String historyWords(CharacterHistoryLine h) {
  final (label, from, to) = (h.label, h.from, h.to);
  return switch (h.action) {
    'created' => 'Created the character “$label”.',
    'field' =>
      to == 'removed'
          ? 'Removed the field $label (it said “$from”).'
          : from.isNotEmpty
          ? (to.isNotEmpty ? 'Changed $label from “$from” to “$to”.' : 'Cleared $label (it said “$from”).')
          : 'Set $label to “$to”.',
    'identity' =>
      from.isNotEmpty
          ? (to.isNotEmpty ? 'Changed $label from “$from” to “$to”.' : 'Cleared $label (it was “$from”).')
          : 'Set $label to “$to”.',
    'section' => 'Section “$label” $to.',
    'archived' => 'Archived the character.',
    'restored' => 'Restored the character from the archive.',
    'portrait' => 'Portrait $label.',
    'template' => 'Applied the layout “$label” ($to).',
    'note' => 'Added the field $label, $to.',
    _ => label,
  };
}

/// vault.dart's `identityFacts`, with the cast's category and names.
List<List<String>> identityFacts(Category characterCategory, String? Function(String) nameOf, Entry entry,
    CharacterProfile profile, {int max = 6}) {
  final first = profile.sections.where((s) => s.tab == ProfileTab.overview && !s.hidden).firstOrNull;
  if (first == null) return const [];
  final byId = {for (final f in entry.fields) f.id: f};
  final facts = <List<String>>[];
  for (final id in first.fieldIds) {
    final f = byId[id];
    if (f == null) continue;
    final def = f.defId == null ? null : characterCategory.fields.where((d) => d.id == f.defId).firstOrNull;
    final kind = def == null ? kindOf(f.key) : null;
    final type = def?.type ?? kind?.type ?? f.type ?? FieldType.text;
    if (type == FieldType.longtext || type == FieldType.references || type == FieldType.tags) continue;
    final name = def != null && def.name.isNotEmpty ? def.name : f.key;
    final value = displayValue(type, settled(kind, f.value), nameOf);
    if (name.trim().isEmpty || value.trim().isEmpty || name.trim().toLowerCase() == 'symbol') continue;
    facts.add([name, value]);
    if (facts.length == max) break;
  }
  return facts;
}

// ---------------------------------------------------------------------------------------------------- reads

int _byId(JsonMap a, JsonMap b) => str(a['id']).compareTo(str(b['id']));

Map<String, Object?> reads(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final read = CharacterChanges(s, now: 0, createId: () => throw StateError('reading'));
  // As CastData reads them.
  final entries = [...model.entries.values]..sort((a, b) => a.id.compareTo(b.id));
  final profiles = {
    for (final r in [...s.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };
  final links = [
    for (final l in model.links)
      if (l.isEntryLink) l,
  ]..sort((a, b) => a.id.compareTo(b.id));
  final names = namesToFind(entries, profiles);
  final named = namedInJob([for (final r in s.rows('chapterContents')) jsonEncode(r)], names)();
  List<Listed> listOf(Map<String, List<String>> n) =>
      listCharacters(entries, profiles, links, model.nodes.values, model.order.position, read.fresh, named: n);
  final plain = listOf(const {});
  final list = listOf(named);
  String? nameOf(String id) => model.entries[id]?.name;
  List<String> ids(Iterable<Listed> l) => [for (final x in l) x.entry.id];
  Object listedJson(Listed l) => {
    'id': l.entry.id,
    'profile': l.profile.raw,
    'linkedIn': l.linkedIn,
    'namedIn': l.namedIn,
    'seenIn': l.seenIn,
    'first': l.first,
    'latest': l.latest,
    'factions': l.factions,
  };
  final facets = facetsOf(list);
  final queries = <String>{
    '',
    'the',
    'a',
    'zzz',
    'é',
    'MIRA kai',
    for (final l in list) ...[
      if (l.entry.name.length >= 3) l.entry.name.substring(0, 3),
      l.entry.name.toUpperCase(),
      ...l.entry.tags,
      ...l.profile.roles,
      ...l.factions,
      l.profile.epithet,
    ],
  }.toList();
  final filters = <String, CastFilters>{
    'none': CastFilters.none,
    'archived': const CastFilters(archived: true),
    for (final r in facets.roles) ...{'role:$r': CastFilters(role: r), 'role-lower:$r': CastFilters(role: r.toLowerCase())},
    for (final v in facets.statuses) 'status:$v': CastFilters(status: v.toUpperCase()),
    for (final v in facets.tags) 'tag:$v': CastFilters(tag: v),
    for (final v in facets.species) 'species:$v': CastFilters(species: v),
    for (final v in facets.occupations) 'occupation:$v': CastFilters(occupation: v),
    for (final v in facets.factions) 'faction:$v': CastFilters(faction: v),
    for (final c in model.order.chapters) 'firstBy:${c.id}': CastFilters(firstBy: model.order.position[c.id]),
  };
  final texts = [
    for (final c in s.rows('chapterContents'))
      for (final b in docBlocks(c['doc'])) b.text,
  ];
  final pages = {for (final r in s.rows('chapterContents')) str(r['id']): blockTexts(r['doc'])};
  final documents = [
    for (final n in stableSorted(
      model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
      (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
    ))
      n.id,
  ];
  final secrets = [for (final r in s.rows('characterSecrets')) CharacterSecret(r)];
  JsonMap spreadJson(Spread sp) => {
    'points': [
      for (final p in sp.points) {'id': p.id, 'label': p.label, 'marks': p.marks},
    ],
    'rows': [
      for (final r in sp.rows)
        {
          'id': r.characterId,
          'name': r.name,
          'cells': [
            for (final c in r.cells)
              {
                'record': c.record?.id,
                'here': [for (final x in c.here) x.id],
                'needs': [for (final x in c.needs) x.id],
              },
          ],
          'now': r.now.state?.key,
          'unplaced': [for (final x in r.unplaced) x.id],
        },
    ],
    'tellings': [
      for (final t in sp.tellings) [t.recordId, t.fromId, t.toId, t.point],
    ],
  };
  final cast = [for (final e in entries) if (e.category == 'character') e];
  final firstPlace = model.entries.values.where((e) => e.category == 'location').firstOrNull?.name ?? 'Nowhere';
  final castLine = [for (final e in cast) (id: e.id, name: e.name)];
  final characterCategory = categoriesOf(s)['character'] ?? Category.builtin('character');
  Map<String, String> fieldsOf(Entry e) => {for (final f in e.fields) f.key.trim().toLowerCase(): f.value};
  return {
    'listedPlain': [for (final l in plain) listedJson(l)],
    'listed': [for (final l in list) listedJson(l)],
    'sorts': {for (final so in CastSort.values) so.name: ids(sortCharacters(list, so))},
    'facets': [facets.roles, facets.statuses, facets.tags, facets.species, facets.occupations, facets.factions],
    'queries': {for (final q in queries) q: ids(list.where((l) => matchesQuery(l, q, nameOf)))},
    'filters': {for (final MapEntry(:key, :value) in filters.entries) key: ids(list.where((l) => passesFilters(l, value)))},
    'mentions': {
      for (final l in list) l.entry.id: countMentions(texts, [l.entry.name, l.profile.epithet, ...l.profile.aliases]),
    },
    'names': names,
    'named': named,
    'sightings': {
      for (final e in entries)
        e.id: [
          for (final x in sightings(pages, documents, names[e.id] ?? const []))
            [x.nodeId, x.block, x.before, x.name, x.after],
        ],
    },
    'secrets': [
      for (final sc in secrets)
        {
          'id': sc.id,
          'groups': [
            for (final g in whoKnowsWhat(sc)) [g.state?.key, g.ids],
          ],
          'reading': spreadJson(knowledgeSpread(sc, model, KnowledgeAxis.reading)),
          'story': spreadJson(knowledgeSpread(sc, model, KnowledgeAxis.story)),
          'words': [for (final r in sc.records) recordWords(r, model)],
        },
    ],
    'checks': [
      for (final f in checkKnowledge(secrets, model)) [f.key, f.rule.name, f.secretId, f.ownerId, f.message, f.because, f.characterIds],
    ],
    'matrix': {
      for (final (key, filter) in [
        ('chapters', const MatrixFilter(all: true)),
        ('scenes', const MatrixFilter(grain: Grain.scenes)),
        ('thread', MatrixFilter(grain: Grain.scenes, threadId: model.threads.keys.firstOrNull, all: true)),
      ])
        key: () {
          final m = appearanceMatrix(model, filter);
          return {
            'columns': [for (final c in m.columns) [c.nodeId, c.chapterId, c.chapterNumber, c.label, c.short, c.status.key]],
            'rows': [
              for (final r in m.rows)
                [r.characterId, r.name, r.recorded, [for (final c in r.cells) [c.state.name, c.evidence.length]]],
            ],
            'hidden': m.hidden,
            'characters': m.characters,
          };
        }(),
    },
    'refs': {for (final e in cast) e.id: referencesTo(s, e.id).counts},
    'templates': [for (final t in read.templates()) [t.id, t.name, t.sections.length]],
    'characters': {
      for (final e in cast)
        e.id: {
          'profile': read.profileOf(e).raw,
          'secrets': [for (final x in read.secrets(e.id)) x.id],
          'notes': [for (final x in read.notes(e.id)) x.id],
          'history': [for (final x in read.history(e.id)) [x.id, historyWords(x)]],
          'facts': identityFacts(characterCategory, nameOf, e, read.profileOf(e)),
          'tone': castToneHex(e.id),
          'monogram': monogram(e.name),
          'line': () {
            final other = cast.where((c) => c.id != e.id).firstOrNull;
            final first = other == null ? 'Nobody' : other.name.split(' ').first;
            final o = readOneLine('${e.name}, 34, a smuggler from $firstPlace, $first’s sister, hates the sea',
                cast: castLine);
            return [o.name, o.age, o.gender, o.species, o.occupation, o.origin, o.role, o.epithet,
              [for (final t in o.ties) [t.otherId, t.otherName, t.preset, t.newIsFrom, t.said]], o.summary];
          }(),
          'logline': () {
            final fields = fieldsOf(e);
            final who = [for (final n in whoFields) fields[n]?.trim() ?? ''].firstWhere((v) => v.isNotEmpty, orElse: () => '');
            final pieces = loglineOf(
              name: e.name,
              age: fields['age'] ?? '',
              gender: fields['gender'] ?? fields['sex'] ?? '',
              who: who.isNotEmpty ? who : read.profileOf(e).epithet,
              stakes: stakesOf(fields),
            );
            return [
              [for (final p in pieces) [p.text, p.part?.name, p.gap]],
              loglineText(pieces),
              [for (final f in e.fields) inSentence(f.value)],
            ];
          }(),
        },
    },
    'collisions': [
      for (final c in collisions([
        for (final e in cast)
          (
            id: e.id,
            name: e.name,
            names: [e.name, ...read.profileOf(e).aliases],
            stakes: stakesOf(fieldsOf(e)),
          ),
      ], most: 50))
        [c.a, c.b, c.why],
    ],
  };
}

// ---------------------------------------------------------------------------------------------------- the script

Object? _v(void Function() f) {
  f();
  return null;
}

List<Object?> runScript(NovelSnapshot start, List<Object?> script) {
  var snapshot = start;
  var clock = 1700000000000;
  var ids = 0;
  final firstCharacter = ([
    for (final r in start.rows('loreEntries'))
      if (r['category'] == 'character') str(r['id']),
  ]..sort()).firstOrNull;
  final faction = start.rows('loreEntries').where((r) => r['category'] == 'faction').firstOrNull;
  final location = start.rows('loreEntries').where((r) => r['category'] == 'location').firstOrNull;
  final chapter = start.rows('chapters').firstOrNull;
  String who(Object? name) {
    final n = name as String;
    if (n == r'$first') return firstCharacter ?? 'no-character';
    if (n == r'$faction') return faction == null ? 'no-faction' : str(faction['id']);
    return snapshot
            .rows('loreEntries')
            .where((r) => r['category'] == 'character' && r['name'] == n)
            .map((r) => str(r['id']))
            .firstOrNull ??
        n;
  }

  String value(Object? v) {
    final s = v as String;
    if (s == r'$faction') return faction == null ? 'no-faction' : str(faction['id']);
    if (s == r'$chapter') return chapter == null ? 'no-chapter' : str(chapter['id']);
    if (s == r'$locationName') return location == null ? 'Nowhere' : str(location['name']);
    if (s.startsWith(r'$template:')) {
      return snapshot.rows('characterTemplates').where((r) => r['name'] == s.substring(10)).map((r) => str(r['id'])).firstOrNull ??
          'missing-template';
    }
    if (s.startsWith('@')) return who(s.substring(1));
    return s;
  }

  Object? deep(Object? v) => v is String ? value(v) : (v is List ? [for (final x in v) deep(x)] : (v is Map ? <String, Object?>{for (final e in v.entries) e.key as String: deep(e.value)} : v));
  String byTitle(String collection, Object? title) =>
      snapshot.rows(collection).where((r) => r['title'] == title).map((r) => str(r['id'])).firstOrNull ?? 'missing';
  final out = <Object?>[];
  for (final raw in script) {
    final op = raw! as Map<String, Object?>;
    clock += 1000;
    final c = CharacterChanges(snapshot, now: clock, createId: () => 'id-${++ids}');
    String section(String entryId, Object? name) {
      final sections = c.profileOf(c.character(entryId)).sections;
      if (name == r'$0') return sections.isEmpty ? 'missing-section' : sections.first.id;
      return sections.where((x) => x.name == name).map((x) => x.id).firstOrNull ?? 'missing-section';
    }

    String field(String entryId, Object? key) =>
        c.character(entryId).fields.where((f) => f.key == key).map((f) => f.id).firstOrNull ?? 'missing-field';
    Object? result;
    Object? outcome;
    try {
      result = switch (op['op']) {
        'create' => c
            .create(
              name: op['name']! as String,
              epithet: (op['epithet'] as String?) ?? '',
              roles: [for (final r in (op['roles'] as List?) ?? const []) r as String],
              summary: (op['summary'] as String?) ?? '',
              templateId: op['templateId'] == null ? null : value(op['templateId']),
            )
            .id,
        'identity' => () {
          final focal = op['focal'] as Map?;
          c.identity(
            who(op['who']),
            IdentityChanges(
              name: op['name'] as String?,
              summary: op['summary'] as String?,
              epithet: op['epithet'] as String?,
              aliases: (op['aliases'] as List?)?.cast<String>(),
              roles: (op['roles'] as List?)?.cast<String>(),
              status: op['status'] as String?,
              image: op.containsKey('image') ? (value: op['image'] as String?) : null,
              focal: focal == null ? null : (x: (focal['x'] as num).toDouble(), y: (focal['y'] as num).toDouble()),
              tags: (op['tags'] as List?)?.cast<String>(),
            ),
          );
          return null;
        }(),
        'setArchived' => _v(() => c.setArchived(who(op['who']), op['archived']! as bool)),
        'reorder' => _v(() => c.reorder([for (final n in op['who']! as List) who(n)])),
        'addSection' => _v(() => c.addSection(who(op['who']), op['name']! as String, ProfileTab.of(op['tab']))),
        'updateSection' => () {
          final id = who(op['who']);
          c.updateSection(
            id,
            section(id, op['section']),
            name: op['name'] as String?,
            hidden: op['hidden'] as bool?,
            tab: op['tab'] == null ? null : ProfileTab.of(op['tab']),
          );
          return null;
        }(),
        'moveSection' => () {
          final id = who(op['who']);
          c.moveSection(id, section(id, op['section']), op['by']! as int);
          return null;
        }(),
        'addField' => () {
          final id = who(op['who']);
          return c.addField(
            id,
            section(id, op['section']),
            FieldSuggestion(
              op['name']! as String,
              FieldType.of(op['type']) ?? FieldType.text,
              [for (final o in (op['options'] as List?) ?? const []) o as String],
            ),
            value: op['value'] == null ? '' : value(op['value']),
          );
        }(),
        'updateField' => () {
          final id = who(op['who']);
          c.updateField(
            id,
            field(id, op['field']),
            key: op['key'] as String?,
            value: op['value'] as String?,
            type: FieldType.of(op['type']),
            options: (op['options'] as List?)?.cast<String>(),
          );
          return null;
        }(),
        'moveField' => () {
          final id = who(op['who']);
          c.moveField(
            id,
            field(id, op['field']),
            by: op['by'] as int?,
            toSection: op['toSection'] == null ? null : section(id, op['toSection']),
          );
          return null;
        }(),
        'duplicateSection' => () {
          final id = who(op['who']);
          return c.duplicateSection(id, section(id, op['section'])).raw;
        }(),
        'removeSection' => () {
          final id = who(op['who']);
          c.removeSection(id, section(id, op['section']), deleteFields: (op['deleteFields'] as bool?) ?? false);
          return null;
        }(),
        'applyTemplate' => _v(() => c.applyTemplate(who(op['who']), value(op['template']))),
        'saveTemplate' => c.saveTemplate(who(op['who']), op['name']! as String).raw,
        'removeTemplate' => _v(() => c.removeTemplate(value(op['template']))),
        'setLinkStatus' => _v(() => c.setLinkStatus(who(op['who']), op['link']! as String, op['status']! as String)),
        'linkEntries' => c.linkEntries(who(op['who']), who(op['other']), op['label']! as String).raw,
        'saveSecret' => c
            .saveSecret(
              who(op['who']),
              op['secret'] == null ? null : byTitle('characterSecrets', op['secret']),
              deep(op['changes'])! as JsonMap,
            )
            .raw,
        'saveNote' => c
            .saveNote(
              who(op['who']),
              op['note'] == null ? null : byTitle('characterNotes', op['note']),
              title: op['title'] as String?,
              content: op['content'] as String?,
              tags: (op['tags'] as List?)?.cast<String>(),
              pinned: op['pinned'] as bool?,
              nodeIds: (deep(op['nodeIds']) as List?)?.cast<String>(),
            )
            .raw,
        'promoteNote' => () {
          final noteId = byTitle('characterNotes', op['note']);
          final note = snapshot.rows('characterNotes').where((r) => r['id'] == noteId).firstOrNull;
          final sectionId = note == null ? 'missing-section' : section(str(note['entryId']), op['section']);
          return c.promoteNote(noteId, sectionId, op['field']! as String);
        }(),
        'addMilestone' => c.addMilestone(who(op['who']), op['text']! as String, op['node'] == null ? null : value(op['node'])).raw,
        'removeMilestone' => () {
          final id = who(op['who']);
          final line = snapshot
              .rows('characterHistory')
              .where((r) => r['entryId'] == id && r['kind'] == op['line'])
              .map((r) => str(r['id']))
              .firstOrNull;
          c.removeMilestone(line ?? 'missing');
          return null;
        }(),
        'removeField' => () {
          final id = who(op['who']);
          c.removeField(id, field(id, op['field']));
          return null;
        }(),
        'recordIn' => _v(() => recordIn(
          c,
          who(op['who']),
          op['label']! as String,
          (op['names']! as List).cast<String>(),
          op['value']! as String,
          sections: (op['sections']! as List).cast<String>(),
          newSection: op['newSection']! as String,
        )),
        'recordStake' => _v(() => recordStake(c, who(op['who']), Stake.values.byName(op['stake']! as String), op['value']! as String)),
        'recordFromLine' => _v(() => recordFromLine(
          c,
          who(op['who']),
          {for (final f in op['fields']! as List) (f as List)[0] as String: value(f[1])},
          [
            for (final t in op['ties']! as List)
              (
                otherId: value((t as List)[0]),
                otherName: '',
                preset: t[1] as String,
                newIsFrom: t[2] as bool,
                said: '',
              ),
          ],
        )),
        'removeNote' => _v(() => c.removeNote(byTitle('characterNotes', op['note']))),
        'removeSecret' => _v(() => c.removeSecret(byTitle('characterSecrets', op['secret']))),
        'delete' => () {
          c.snapshot = planCharacterDelete(c.snapshot, who(op['who'])).snapshot;
          return null;
        }(),
        _ => throw StateError('Unknown op ${op['op']}'),
      };
      snapshot = c.snapshot;
      outcome = {'ok': result};
    } on ChangeRefused catch (e) {
      outcome = {'refused': e.message};
    } on StateError {
      outcome = {'error': 'StateError'};
    } on Object {
      outcome = {'error': 'other'};
    }
    final collections = <String, Object?>{
      for (final MapEntry(:key, :value) in snapshot.collections.entries)
        if (value.isNotEmpty) key: value,
    };
    out.add({'op': op['op'], 'outcome': outcome, 'hash': hashOf(collections)});
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

Map<String, Object?> misc() {
  const lines = [
    'Mira Vance, 34, a smuggler from Glass River, Kai’s sister',
    'Tam, Ilse’s apprentice',
    'Orla, Kit’s mother; an old woman — from Vell',
    'Ned, Marrow’s cousin',
    'Sefa Quill the Factor, an elf, aged 120, the villain, hates the sea',
    'Bram, called the Ox, an old man, from Vell',
    'James',
    '',
    '  ,  ,',
    'Kit Marrow, 12 years old, the hero, a thief of the Salt Guild',
    'Lena, known as Wren, a young witch, KAI DOYLE’S RIVAL, half-elf',
    'Old Tam, aged 70, born in Merrow, an android, ilse’s friend and Kai’s enemy',
    'Ana, 300 yrs, a dragon-rider from the North, a woman of the sea',
    'Él, the Prince, the protagonist',
  ];
  const cast = [(id: 'kai', name: 'Kai Doyle'), (id: 'ilse', name: 'Ilse Marrow'), (id: 'kit', name: 'Kit Marrow')];
  const values = [
    'To open the last door.',
    'Revenge on his father',
    'The Architect',
    'Kai’s betrayal',
    'Old Tam',
    'NASA',
    '  his   sister;  ',
    'A',
    'a b',
    'Élan vital',
    'İstanbul',
    '',
    '...',
    'X.',
  ];
  const kindNames = ['Gender', ' sex ', 'PRONOUNS', 'age', 'Date of Birth', 'birthday', 'Alignment', 'Loyalty', 'Occupation', ''];
  const sayings = ['male', 'Man', 'boy', 'F', 'woman', 'She', 'he', 'his', 'Unknown', '', ' 21 ', 'chaotic neutral', 'lawful EVIL', 'she / her'];
  return {
    'lines': [
      for (final l in lines)
        () {
          final o = readOneLine(l, cast: cast);
          return [o.name, o.age, o.gender, o.species, o.occupation, o.origin, o.role, o.epithet,
            [for (final t in o.ties) [t.otherId, t.otherName, t.preset, t.newIsFrom, t.said]], o.summary];
        }(),
    ],
    'inSentence': [for (final v in values) inSentence(v)],
    'pronouns': [for (final g in ['Male', ' woman ', 'm', 'F', 'boy', 'x', '']) pronounsFor(g).they],
    'kinds': [
      for (final n in kindNames)
        () {
          final k = kindOf(n);
          return k == null ? null : [k.type.name, k.options, kindNote(n, k)];
        }(),
    ],
    'settled': [
      for (final n in ['Gender', 'Pronouns', 'Alignment', 'Age'])
        [for (final v in sayings) settled(kindOf(n), v)],
    ],
    'slugs': [for (final t in ['Core Identity', '  ', 'Lineage & Magic', 'Ünïcode', '--a--', 'Goals & Stakes!']) slug(t)],
    'suggestions': [
      for (final (section, have) in [
        ('Core Identity', <String>[]),
        (' core identity ', ['Age', 'gender']),
        ('Character Arc', ['Starting Point']),
        ('The Case', ['MOTIVE']),
        ('Nope', <String>[]),
      ])
        [for (final f in suggestionsFor(section, builtinTemplates, have)) f.toJson()],
    ],
    'mentions': [
      countMentions(['Kael drew. "Kaelen!" The Oathbreaker. Mikael. kael_x kael'], ['Kaelen Draven', 'Kael', 'The Oathbreaker']),
      countMentions(['Dr. A.B. Stone and AxB, A.B.C.'], ['A.B.', 'Dr.']),
      countMentions(['ÉMILE émile Emile'], ['Émile']),
    ],
    'sightings': [
      for (final x in sightings(
        {
          'c1': ['The bell rang.', 'Wren dropped the ink. It went across the floor.'],
          'c2': ['Nobody came. Wren?” he asked.'],
          'c3': ['“Wren,” said Ilse Marrow. “Wipe it up.”'],
          'c4': ['${List.filled(60, 'and the sea').join(' ')} Wren ${List.filled(60, 'went out').join(' ')}.'],
          'c5': ['Wren Hollis came.', 'Wren went.'],
        },
        ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
        ['Wren', 'Wren Hollis', ' ', 'Wren'],
      ))
        [x.nodeId, x.block, x.before, x.name, x.after],
    ],
    'namedIn': namedIn(
      {
        'c1': 'Wren looked up. The Drowned Road rose out of the bay.',
        'c2': 'A wren sang on the wall. Wrenfield was quiet. O’Brien came.',
        'c3': 'They spoke of the drowned road, and of Wren’s map. Mira  Vance.',
        'c4': '',
        'c5': 'Mira Vance and O’Brien',
      },
      {
        'wren': ['Wren Hollis', 'Wren'],
        'road': ['The Drowned Road', 'Drowned Road'],
        'mira': ['Mira Vance'],
        'ob': ['O’Brien'],
        'none': ['', '  '],
      },
    ),
    'names': namesToFind(
      [
        for (final (id, name, category) in [
          ('ilse', 'Ilse Marrow', 'character'),
          ('kit', 'Kit Marrow', 'character'),
          ('crane', 'Aldous Crane', 'character'),
          ('rose', 'Rose Hale', 'character'),
          ('north', 'Jon North', 'character'),
          ('van', 'Piet van Dyke', 'character'),
          ('road', 'The Drowned Road', 'location'),
          ('the', 'The Fen', 'location'),
          ('wren', 'Wren', 'character'),
          ('blank', '   ', 'character'),
        ])
          Entry({'id': id, 'name': name, 'category': category}),
      ],
      {
        'crane': CharacterProfile({'id': 'p', 'entryId': 'crane', 'epithet': 'the Provost', 'aliases': ['Old Crane', ' ', 'X']}),
        'wren': CharacterProfile({'id': 'q', 'entryId': 'wren', 'epithet': 'the Grey', 'aliases': <String>[]}),
      },
    ),
    'logline': [
      for (final (gender, stakes) in [
        ('Male', {Stake.wants: 'To open the last door.', Stake.inTheWay: 'The Architect.', Stake.atStake: 'His sister.'}),
        ('', <Stake, String>{}),
        ('woman', {Stake.wants: 'out'}),
      ])
        () {
          final pieces = loglineOf(name: 'Mark', age: gender.isEmpty ? '' : '21', gender: gender, who: 'A locksmith', stakes: stakes);
          return [[for (final p in pieces) [p.text, p.part?.name, p.gap]], loglineText(pieces)];
        }(),
    ],
    'stakes': [
      for (final f in [
        {'what they want': ' x ', 'goal': 'y', 'motivations': 'm'},
        {'motivations': ' m '},
        {'obstacles': 'o', 'stakes': 's', 'ending': 'e', 'needs': 'n'},
      ])
        {for (final MapEntry(:key, :value) in stakesOf(f).entries) key.name: value},
    ],
    'collisions': [
      for (final c in collisions([
        (id: 'a', name: 'Ann', names: ['Ann', 'Annie'], stakes: {Stake.wants: 'To find the chart before Bo does'}),
        (id: 'b', name: 'Bo', names: ['Bo'], stakes: {Stake.wants: 'The charts of the bay', Stake.inTheWay: 'annie'}),
        (id: 'c', name: 'Cy', names: ['Cy'], stakes: {Stake.wants: 'Chartered ships'}),
        (id: 'd', name: 'Di', names: ['D'], stakes: {Stake.wants: 'Something else entirely, the chartroom'}),
      ]))
        [c.a, c.b, c.why],
    ],
    'tones': [for (final id in ['a', 'kael-1', '00000000-0000-4000-8000-000000000002', 'ü']) castToneHex(id)],
    'monograms': [for (final n in ['Kai & Ren', 'Mira', '  ', 'Old Tam', 'élan Vital', '_x y', '1 2 3']) monogram(n)],
    'freshOrder': () {
      final w = CharacterChanges(
        NovelSnapshot(project: {'id': 'p'}, collections: const {}),
        now: 5,
        createId: () => 'x',
      );
      return w.templates().map((t) => t.id).toList();
    }(),
  };
}

void main(List<String> args) {
  final script = jsonDecode(File(args[0]).readAsStringSync()) as List<Object?>;
  final out = <String, Object?>{'misc': misc()};
  final full = <String, Object?>{};
  for (final path in args.skip(2)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final snapshot = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()));
    final r = reads(snapshot);
    full[name] = r;
    out[name] = {
      'reads': {for (final MapEntry(:key, :value) in r.entries) key: hashOf(value)},
      'steps': runScript(snapshot, script),
    };
  }
  File(args[1]).writeAsStringSync(jsonEncode(out));
  final fullPath = Platform.environment['FULL'];
  if (fullPath != null) File(fullPath).writeAsStringSync(jsonEncode(full));
}
