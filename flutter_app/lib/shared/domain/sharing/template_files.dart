import 'dart:convert';

import '../codex/capabilities.dart' show cleanUses;
import '../codex/codex_changes.dart' show cleanDefs;
import '../json.dart';
import '../records/category.dart';
import '../systems/system_changes.dart' show tidyBlueprint;

/// TEMPLATE FILES. Templates shared as files the author chooses to send: never through the app, never published.
///
/// A template is plain data (names, colours, field types, options, the words of a system's rules), rebuilt here from a
/// short list of known parts: anything else in a file is left out and counted. Nothing in it is ever run as code (a
/// system's formulas are read by the app's own small arithmetic language, which can only compute numbers and
/// compare them). An exported template is built from definitions alone, never from a novel's entries, text, notes or
/// records, so it cannot carry a manuscript. A file that breaks a limit is refused whole, and nothing changes.

const templateFormat = 'novel-builder/template';
const templateFormatVersion = 1;

enum TemplateKind {
  categories('Categories & fields', 'Kinds of record and the fields each has, for the codex.'),
  profileLayout('Profile layout', 'The sections of a character profile and the fields each offers.'),
  system('Progression system', 'A system’s attributes, levels or stages, ranks, groups, items and tables.');

  const TemplateKind(this.label, this.hint);
  final String label;
  final String hint;

  String get key => switch (this) {
    TemplateKind.categories => 'categories',
    TemplateKind.profileLayout => 'profile-layout',
    TemplateKind.system => 'system',
  };

  static TemplateKind? of(Object? key) => TemplateKind.values.where((k) => k.key == key).firstOrNull;
}

/// The terms a template is shared under, chosen by whoever shares it and shown to whoever receives it.
enum TemplateLicense {
  useAndShare('Free to use, change and share', 'Use it, change it and pass it on. Credit is appreciated.'),
  ccBy('CC BY 4.0', 'Use, change and share it, also commercially, giving credit to its maker.'),
  ccByNc('CC BY-NC 4.0', 'Use, change and share it with credit, but not for commercial use.'),
  cc0('CC0 (no rights reserved)', 'Use it in any way, with no conditions.'),
  personal('Personal use only', 'Use it for your own writing; please do not pass it on.');

  const TemplateLicense(this.label, this.terms);
  final String label;
  final String terms;

  static TemplateLicense of(Object? key) =>
      TemplateLicense.values.where((l) => l.name == key).firstOrNull ?? TemplateLicense.personal;
}

/// What a template file may hold at most. A file over any of these is refused whole.
const templateLimits = (
  fileBytes: 1000000,
  categories: 100,
  fieldsPerCategory: 200,
  options: 500,
  sections: 50,
  systemParts: 500,
  tableCells: 10000,
  text: 2000,
  name: 200,
);

/// A template file that cannot be taken in. The message is fit to show the person.
class TemplateFileException implements Exception {
  const TemplateFileException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// One template, as a file carries it: what it is, who made it, under what terms, which version, and its content.
class SharedTemplate {
  const SharedTemplate({
    required this.kind,
    required this.id,
    required this.version,
    required this.name,
    required this.description,
    required this.author,
    required this.license,
    required this.madeAt,
    required this.content,
    this.leftOut = 0,
  });

  final TemplateKind kind;

  /// The same on every version of one template, so a newer version is recognised as such.
  final String id;
  final int version;
  final String name;
  final String description;
  final String author;
  final TemplateLicense license;
  final num madeAt;

  /// Categories: `{categories: [...]}`. Profile layout: `{sections: [...]}`. System: a blueprint.
  final JsonMap content;

  /// Parts of the file that were not template data and were left out on reading it.
  final int leftOut;

  /// What it holds, in words.
  List<String> get summary => switch (kind) {
    TemplateKind.categories => [
      for (final c in maps(content['categories']))
        '${str(c['name'])}: ${[for (final f in maps(c['fields'])) '${str(f['name'])} (${FieldType.of(f['type'])?.label ?? 'text'})'].join(', ').ifEmpty('no fields')}',
    ],
    TemplateKind.profileLayout => [
      for (final s in maps(content['sections']))
        '${str(s['name'])}: ${[for (final f in maps(s['fields'])) str(f['name'])].join(', ').ifEmpty('no fields')}',
    ],
    TemplateKind.system => [
      if (maps(content['variables']).isNotEmpty)
        'Attributes: ${[for (final v in maps(content['variables'])) str(v['name'])].join(', ')}',
      if (maps(content['tracks']).isNotEmpty)
        'Levels and stages: ${[for (final t in maps(content['tracks'])) str(t['name'])].join(', ')}',
      if (maps(content['ranks']).isNotEmpty)
        'Ranks: ${[for (final r in maps(content['ranks'])) str(r['name'])].join(', ')}',
      for (final g in maps(content['groups']))
        '${str(g['name'])}: ${[for (final i in maps(content['items']))
          if (i['groupId'] == g['id']) str(i['name'])].join(', ').ifEmpty('none yet')}',
      if (maps(content['matrices']).isNotEmpty)
        'Tables: ${[for (final m in maps(content['matrices'])) str(m['name'])].join(', ')}',
    ],
  };

  JsonMap toJson() => {
    'format': templateFormat,
    'version': templateFormatVersion,
    'kind': kind.key,
    'id': id,
    'templateVersion': version,
    'name': name,
    'description': description,
    'author': author,
    'license': license.name,
    'madeAt': madeAt,
    'content': content,
  };

  String toFileText() => const JsonEncoder.withIndent('  ').convert(toJson());
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

// ------------------------------------------------------------------------------------------------------- cleaning

class _Reading {
  int leftOut = 0;

  String text(Object? value, {int? limit, String fallback = ''}) {
    final max = limit ?? templateLimits.text;
    if (value == null) return fallback;
    if (value is! String) {
      leftOut++;
      return fallback;
    }
    if (value.length > max) throw TemplateFileException('A piece of text in it is longer than $max characters.');
    return value;
  }

  List<Object?> list(Object? value, int limit, String what) {
    if (value == null) return const [];
    if (value is! List) {
      leftOut++;
      return const [];
    }
    if (value.length > limit) throw TemplateFileException('It holds more than $limit $what.');
    return value;
  }

  /// Keeps only [keys] of [map], counting what else there was.
  JsonMap only(JsonMap map, Set<String> keys) {
    leftOut += map.keys.where((k) => !keys.contains(k)).length;
    return {
      for (final e in map.entries)
        if (keys.contains(e.key)) e.key: e.value,
    };
  }
}

const _fieldKeys = {'id', 'name', 'type', 'options', 'required', 'help', 'min', 'max', 'target'};
const _categoryKeys = {'key', 'name', 'singular', 'color', 'builtin', 'fields', 'uses'};

JsonMap _categoriesContent(Object? content, _Reading r, String Function() newId) {
  final c = mapOrNull(content) ?? const <String, Object?>{};
  final categories = <JsonMap>[];
  for (final raw in r.list(c['categories'], templateLimits.categories, 'categories')) {
    final given = mapOrNull(raw);
    if (given == null) {
      r.leftOut++;
      continue;
    }
    final cat = r.only(given, _categoryKeys);
    final fields = <JsonMap>[];
    for (final f in r.list(cat['fields'], templateLimits.fieldsPerCategory, 'fields in one category')) {
      final def = mapOrNull(f);
      if (def == null) {
        r.leftOut++;
        continue;
      }
      if (def['type'] != null && FieldType.of(def['type']) == null) {
        throw TemplateFileException('It has a field of a kind this app does not know (“${def['type']}”).');
      }
      r.list(def['options'], templateLimits.options, 'choices in one field');
      for (final o in listOf(def['options'])) {
        r.text(o, limit: templateLimits.name);
      }
      r
        ..text(def['name'], limit: templateLimits.name)
        ..text(def['help']);
      if (def['archived'] == true) continue;
      fields.add(r.only(def, _fieldKeys));
    }
    final cleaned = [for (final d in cleanDefs(fields, newId)) r.only(d, _fieldKeys)];
    final name = r.text(cat['name'], limit: templateLimits.name).trim();
    final key = r.text(cat['key'], limit: 64).trim();
    final builtin = cat['builtin'] == true && builtinCategoryKeys.contains(key);
    final color = r.text(cat['color'], limit: 16).trim();
    categories.add({
      'key': builtin ? key : (RegExp(r'^[a-z0-9-]{1,64}$').hasMatch(key) ? key : 'custom-${newId()}'),
      'name': name.isEmpty ? 'Untitled category' : name,
      'singular': r.text(cat['singular'], limit: templateLimits.name).trim(),
      'color': RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color) ? color : '#5c6370',
      'builtin': builtin,
      'fields': cleaned,
      'uses': ?cleanUses(cat['uses'], [for (final d in cleaned) str(d['id'])]),
    });
  }
  return {'categories': categories};
}

JsonMap _layoutContent(Object? content, _Reading r) {
  final c = mapOrNull(content) ?? const <String, Object?>{};
  return {
    'sections': [
      for (final raw in r.list(c['sections'], templateLimits.sections, 'sections'))
        if (mapOrNull(raw) case final s?)
          () {
            final section = r.only(s, const {'name', 'tab', 'fields'});
            return {
              'name': r.text(section['name'], limit: templateLimits.name).trim().ifEmpty('Untitled section'),
              'tab': section['tab'] == 'details' ? 'details' : 'overview',
              'fields': [
                for (final f in r.list(section['fields'], templateLimits.fieldsPerCategory, 'fields in one section'))
                  if (mapOrNull(f) case final field?)
                    () {
                      final kept = r.only(field, const {'name', 'type', 'options'});
                      final type = kept['type'] ?? 'text';
                      if (FieldType.of(type) == null) {
                        throw TemplateFileException('It has a field of a kind this app does not know (“$type”).');
                      }
                      final options = [
                        for (final o in r.list(kept['options'], templateLimits.options, 'choices in one field'))
                          if (r.text(o, limit: templateLimits.name).trim() case final t when t.isNotEmpty) t,
                      ];
                      return {
                        'name': r.text(kept['name'], limit: templateLimits.name).trim().ifEmpty('Untitled field'),
                        'type': type,
                        if (options.isNotEmpty) 'options': options,
                      };
                    }(),
              ],
            };
          }(),
    ],
  };
}

JsonMap _systemContent(Object? content, _Reading r, String Function() newId) {
  final c = mapOrNull(content) ?? const <String, Object?>{};
  for (final part in ['variables', 'tracks', 'ranks', 'groups', 'items', 'matrices']) {
    r.list(c[part], templateLimits.systemParts, 'parts of one kind');
  }
  // Every piece of text is checked against the limit before the blueprint is tidied (which keeps only known parts).
  void texts(Object? value, int depth) {
    if (depth > 8) throw const TemplateFileException('It is nested more deeply than a template ever is.');
    if (value is String) {
      r.text(value);
    } else if (value is List) {
      if (value.length > templateLimits.tableCells) throw const TemplateFileException('It holds too many parts.');
      for (final v in value) {
        texts(v, depth + 1);
      }
    } else if (value is Map) {
      if (value.length > templateLimits.tableCells) throw const TemplateFileException('It holds too many parts.');
      for (final v in value.values) {
        texts(v, depth + 1);
      }
    }
  }

  texts(c, 0);
  final tidy = tidyBlueprint(c, newId);
  // Ranks and table rows and columns are kept as names and ids only.
  JsonMap named(Object? raw) {
    final m = mapOrNull(raw) ?? const <String, Object?>{};
    return {'id': str(m['id']).ifEmpty(newId()), 'name': str(m['name']).trim().ifEmpty('Unnamed')};
  }

  final before = jsonEncode(c).length;
  final result = {
    ...tidy,
    'ranks': [for (final rank in maps(tidy['ranks'])) named(rank)],
    'matrices': [
      for (final m in maps(tidy['matrices']))
        {
          ...m,
          'rows': [for (final row in listOf(m['rows'])) named(row)],
          'columns': [for (final col in listOf(m['columns'])) named(col)],
        },
    ],
  };
  if (jsonEncode(result).length < before) r.leftOut++;
  return result;
}

/// Reads a template file, keeping only template data. Throws [TemplateFileException] with the reason when it cannot
/// be taken in; nothing is written either way.
SharedTemplate readTemplateFile(String text, {required String Function() newId}) {
  if (text.length > templateLimits.fileBytes) {
    throw const TemplateFileException('The file is larger than any template is (over 1 MB).');
  }
  final Object? data;
  try {
    data = jsonDecode(text);
  } on FormatException {
    throw const TemplateFileException('It is not a template file: it could not be read.');
  }
  final file = mapOrNull(data);
  if (file == null || file['format'] != templateFormat) {
    throw const TemplateFileException('It is not a Novel Builder template file.');
  }
  if ((numOrNull(file['version']) ?? 0) > templateFormatVersion) {
    throw const TemplateFileException('It was made by a newer version of Novel Builder.');
  }
  final kind = TemplateKind.of(file['kind']);
  if (kind == null) {
    throw TemplateFileException('It holds a kind of template this app does not know (“${file['kind']}”).');
  }
  final r = _Reading();
  final content = switch (kind) {
    TemplateKind.categories => _categoriesContent(file['content'], r, newId),
    TemplateKind.profileLayout => _layoutContent(file['content'], r),
    TemplateKind.system => _systemContent(file['content'], r, newId),
  };
  final empty = switch (kind) {
    TemplateKind.categories => maps(content['categories']).isEmpty,
    TemplateKind.profileLayout => maps(content['sections']).isEmpty,
    TemplateKind.system => false,
  };
  if (empty) throw const TemplateFileException('It holds nothing to use.');
  final known = {
    'format',
    'version',
    'kind',
    'id',
    'templateVersion',
    'name',
    'description',
    'author',
    'license',
    'madeAt',
    'content',
  };
  r.leftOut += file.keys.where((k) => !known.contains(k)).length;
  final version = numOrNull(file['templateVersion']);
  return SharedTemplate(
    kind: kind,
    id: r.text(file['id'], limit: 100).trim().ifEmpty(newId()),
    version: version == null || version < 1 || version > 100000 ? 1 : version.toInt(),
    name: r.text(file['name'], limit: templateLimits.name).trim().ifEmpty('Untitled template'),
    description: r.text(file['description']).trim(),
    author: r.text(file['author'], limit: templateLimits.name).trim(),
    license: TemplateLicense.of(file['license']),
    madeAt: numOrNull(file['madeAt']) ?? 0,
    content: content,
    leftOut: r.leftOut,
  );
}

/// A template to share, built from definitions only, and read back through the same checks a received file gets, so
/// what is sent is exactly what would be taken in.
SharedTemplate makeSharedTemplate({
  required TemplateKind kind,
  required String id,
  required int version,
  required String name,
  required String description,
  required String author,
  required TemplateLicense license,
  required num now,
  required JsonMap content,
  required String Function() newId,
}) {
  final draft = SharedTemplate(
    kind: kind,
    id: id,
    version: version,
    name: name,
    description: description,
    author: author,
    license: license,
    madeAt: now,
    content: content,
  );
  final read = readTemplateFile(jsonEncode(draft.toJson()), newId: newId);
  return SharedTemplate(
    kind: read.kind,
    id: read.id,
    version: read.version,
    name: read.name,
    description: read.description,
    author: read.author,
    license: read.license,
    madeAt: read.madeAt,
    content: read.content,
  );
}

/// The content of a profile layout to share: its sections and the names, kinds and choices of their fields.
JsonMap layoutContent(JsonMap layout) => {
  'sections': [
    for (final s in maps(layout['sections']))
      {
        'name': s['name'],
        'tab': s['tab'],
        'fields': [
          for (final f in maps(s['fields']))
            {'name': f['name'], 'type': f['type'] ?? 'text', if (f['options'] != null) 'options': f['options']},
        ],
      },
  ],
};

/// The content of a system to share: its blueprint, without what belongs to the novel (its id, dates and any sheets).
JsonMap systemContent(JsonMap system) => {
  for (final key in const ['name', 'description', 'variables', 'tracks', 'ranks', 'groups', 'items', 'matrices'])
    key: system[key],
};

/// Where a received template stands against the ones already here with the same id.
enum TemplateStanding { added, newer, sameOrOlder }

TemplateStanding standingOf(SharedTemplate incoming, Iterable<({String id, int version})> held) {
  final same = [
    for (final h in held)
      if (h.id == incoming.id) h.version,
  ];
  if (same.isEmpty) return TemplateStanding.added;
  final best = same.reduce((a, b) => a > b ? a : b);
  return incoming.version > best ? TemplateStanding.newer : TemplateStanding.sameOrOlder;
}
