// The Flutter app's own outputs for phase 9's import and export (files.golden.json pins them; files.outputs.ts makes
// Scriptor's, keyed and shaped the same way). For every novel given: its categories, profile layouts and systems made
// into template files (the file's text, what it says it holds, read back again) and how each stands against templates
// already held; its records for every view as a spreadsheet (CSV) and for every kind of record; the page's filters in
// words; the Word file of its complete bible; and a manuscript imported into it (novel.md, under every split). And
// `misc`: template files that are refused or trimmed, text, Markdown and RTF that is hard to read, CSV cells, file names
// and malformed UTF-8. Ids are made by a counter, the same on both sides.
//
// To make the golden again: run.sh in the scratchpad's `xfiles` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:novel_builder/shared/domain/exchange/import_parse.dart';
import 'package:novel_builder/shared/domain/exchange/import_structure.dart';
import 'package:novel_builder/shared/domain/exchange/records_export.dart';
import 'package:novel_builder/shared/domain/exchange/render_docx.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/track.dart' show whenWords;
import 'package:novel_builder/shared/domain/sharing/template_files.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

var _n = 0;
String nextId() => 'id${++_n}';

Object? runJson(Run r) => r.toJson();

Object? blockJson(ImportBlock b) => switch (b) {
  ImportHeading() => {'type': 'heading', 'level': b.level, 'text': b.text},
  ImportParagraph() => {
    'type': 'paragraph',
    'runs': [for (final r in b.runs) runJson(r)],
    if (b.align != null) 'align': b.align!.name,
    if (b.quote) 'quote': true,
  },
  ImportDivider() => {'type': 'divider'},
};

Object? nodeJson(ImportNode n) => {
  'kind': n.kind.name,
  'title': n.title,
  'words': metricsOf(n.blocks).words,
  'doc': toDoc(n.blocks),
  'children': [for (final c in n.children) nodeJson(c)],
};

Object? templateJson(SharedTemplate t) => {
  'file': t.toFileText(),
  'summary': t.summary,
  'leftOut': t.leftOut,
  'json': t.toJson(),
};

Object? made(TemplateKind kind, String name, JsonMap content) {
  try {
    final t = makeSharedTemplate(
      kind: kind,
      id: 'lineage',
      version: 3,
      name: name,
      description: ' A description. ',
      author: ' Ana ',
      license: TemplateLicense.ccBy,
      now: 1700000000000,
      content: content,
      newId: nextId,
    );
    final back = readTemplateFile(t.toFileText(), newId: nextId);
    return {
      'made': templateJson(t),
      'back': templateJson(back),
      'standing': [
        for (final held in [
          <({String id, int version})>[],
          [(id: 'lineage', version: 2)],
          [(id: 'lineage', version: 3)],
          [(id: 'other', version: 9), (id: 'lineage', version: 4)],
        ])
          standingOf(back, held).name,
      ],
    };
  } on TemplateFileException catch (e) {
    return {'refused': e.message};
  }
}

Object? tryRead(String text) {
  try {
    return templateJson(readTemplateFile(text, newId: nextId));
  } on TemplateFileException catch (e) {
    return {'refused': e.message};
  }
}

Object? tryParse(String name, List<int> bytes) {
  try {
    final blocks = parseFile(name, bytes);
    return {
      'blocks': [for (final b in blocks) blockJson(b)],
      'splits': {
        for (final (key, ch, sc) in [('both', true, true), ('chapters', true, false), ('scenes', false, true), ('none', false, false)])
          key: [
            for (final n in buildStructure(blocks, ImportOptions(splitChapters: ch, splitScenes: sc, fallbackTitle: 'File')))
              nodeJson(n),
          ],
      },
    };
  } on ImportException catch (e) {
    return {'refused': e.reason};
  }
}

Map<String, String> zipParts(List<int> bytes) => {
  for (final f in ZipDecoder().decodeBytes(bytes).files) f.name: utf8.decode(f.readBytes()!),
};

Map<String, Object?> novel(NovelSnapshot s, String importMd) {
  _n = 0;
  final model = StoryModel.fromSnapshot(s);
  final out = <String, Object?>{};

  // Templates: the novel's categories (as the share dialog offers them), each profile layout and each system.
  final categories = [
    for (final c in categoriesOf(s).values)
      if (!c.archived) CodexChanges.kindTemplate(c),
  ];
  out['categoriesTemplate'] = made(TemplateKind.categories, 'Categories', {'categories': categories});
  out['layoutTemplates'] = [
    for (final r in s.rows('characterTemplates')) made(TemplateKind.profileLayout, str(r['name']), layoutContent(r)),
  ];
  out['systemTemplates'] = [
    for (final r in s.rows('systems')) made(TemplateKind.system, str(r['name']), systemContent(r)),
  ];

  // Records: every view's, as a spreadsheet, and every kind with private notes.
  final heading = ['Records of the novel', 'Exported 2026-10-22T10:00:00.000Z', 'No filters', notABackup];
  out['csv'] = {
    for (final MapEntry(key: view, value: kinds) in viewData.entries)
      view: recordsCsv(exportRecords(model, kinds), heading: heading),
  };
  final all = exportRecords(model, recordKinds, includePrivate: true);
  out['allKinds'] = {'records': all.records, 'names': all.names, 'count': all.count};
  out['allCsv'] = recordsCsv(all, heading: heading);

  // The page's filters in words, with ids from the novel.
  final characters = [for (final e in model.entries.values) if (e.category == 'character') e.id];
  final threads = model.threads.keys.toList();
  final nodes = model.order.chapters.map((c) => c.id).toList();
  final events = model.events.keys.toList();
  out['filters'] = filterWords(
    {
      'text': '  the  ',
      'characters': characters.take(2).toList(),
      'locations': ['not-a-record'],
      'threads': threads.take(1).toList(),
      'canon': ['canon', 'provisional'],
      'status': ['draft'],
      'significance': ['major'],
      'categories': ['character', 'location'],
      if (nodes.isNotEmpty) 'chapters': {'from': nodes.first, 'to': null},
      if (events.isNotEmpty)
        'time': {
          'from': {'kind': 'event', 'eventId': events.first},
          'until': null,
        },
    },
    model,
    when: (at) => whenWords(at, model),
  );

  // The complete bible as a Word file.
  out['bibleDocx'] = zipParts(renderDocx(compileNovel(s, ExportOptions.bible)));

  // A manuscript imported into it, at the top level and (when it has one) into its first volume.
  final blocks = parseMarkdown(importMd);
  final structure = buildStructure(blocks, const ImportOptions(fallbackTitle: 'novel'));
  ImportItem item(ImportNode n) =>
      ImportItem(kind: n.kind, title: n.title, doc: toDoc(n.blocks), children: [for (final c in n.children) item(c)]);
  Object? imported(String? parentId, List<ImportNode> nodes) {
    try {
      final r = addImportedTree(s, parentId, [for (final n in nodes) item(n)], now: 1700000000000, createId: nextId);
      return {
        'created': r.created,
        'rows': [for (final id in r.created) r.snapshot.rows('chapters').firstWhere((x) => x['id'] == id)],
        'contents': [
          for (final id in r.created) ...r.snapshot.rows('chapterContents').where((x) => x['id'] == id),
        ],
      };
    } on OutlineException catch (e) {
      return {'refused': e.message};
    }
  }

  out['importTop'] = imported(null, structure);
  final volume = model.nodes.values.where((n) => n.kindKey == 'volume').firstOrNull;
  final chaptersOnly = buildStructure(blocks, const ImportOptions(splitScenes: false, fallbackTitle: 'novel'))
      .where((n) => n.kind.name == 'chapter')
      .toList();
  out['importIntoVolume'] = volume == null ? null : imported(volume.id, chaptersOnly);
  final chapter = model.order.chapters.firstOrNull;
  out['importRefused'] = chapter == null ? null : imported(chapter.id, structure);
  return out;
}

Map<String, Object?> misc() {
  _n = 0;
  final good = {
    'format': 'novel-builder/template',
    'version': 1,
    'kind': 'categories',
    'id': 'abc',
    'templateVersion': 2,
    'name': '  Spells  ',
    'author': 'Ana',
    'license': 'cc0',
    'madeAt': 1700000000000,
    'extra': true,
    'content': {
      'categories': [
        {
          'key': 'spells',
          'name': 'Spells',
          'singular': 'Spell',
          'color': '#aabbcc',
          'fields': [
            {'id': 'f1', 'name': 'Cost', 'type': 'number', 'min': 0, 'max': 10, 'secret': 'x'},
            {'name': 'School', 'type': 'select', 'options': ['Fire', 'Water', ' ']},
            {'name': 'Old', 'type': 'text', 'archived': true},
            'not a field',
          ],
          'uses': {'rank': {'field': 'f1'}, 'nonsense': 1},
          'icon': 'star',
        },
        {'key': 'Bad Key!', 'name': '', 'color': 'red', 'builtin': true, 'fields': []},
        {'key': 'character', 'name': 'People', 'builtin': true},
        7,
      ],
    },
  };
  final layout = {
    'format': 'novel-builder/template',
    'version': 1,
    'kind': 'profile-layout',
    'name': 'Layout',
    'content': {
      'sections': [
        {
          'name': ' Basics ',
          'tab': 'details',
          'fields': [
            {'name': 'Age', 'type': 'number'},
            {'name': '', 'options': ['a', '', ' b '], 'color': 1},
          ],
          'icon': 'x',
        },
        {'name': '', 'tab': 'weird'},
        'nope',
      ],
    },
  };
  final system = {
    'format': 'novel-builder/template',
    'version': 1,
    'kind': 'system',
    'name': 'Sys',
    'templateVersion': 0,
    'content': {
      'name': 'Sys',
      'variables': [
        {'id': 'v1', 'name': 'Strength', 'kind': 'attribute', 'base': 5, 'junk': 1},
      ],
      'ranks': [
        {'id': 'r1', 'name': ' E ', 'colour': '#fff'},
        {'name': ''},
      ],
      'groups': [
        {'id': 'g1', 'name': 'Skills'},
      ],
      'items': [
        {'id': 'i1', 'name': 'Slash', 'groupId': 'g1'},
      ],
      'matrices': [
        {
          'id': 'm1',
          'name': 'Elements',
          'rows': [
            {'id': 'a', 'name': 'Fire', 'x': 1},
          ],
          'columns': [
            {'name': 'Water'},
          ],
          'cells': {},
        },
      ],
      'secretField': 'gone',
    },
  };
  String deep(int n) => n == 0 ? '"x"' : '{"a":${deep(n - 1)}}';
  final texts = <String, String>{
    'good': jsonEncode(good),
    'layout': jsonEncode(layout),
    'system': jsonEncode(system),
    'notJson': '{nope',
    'notTemplate': jsonEncode({'format': 'something-else'}),
    'newer': jsonEncode({...good, 'version': 2}),
    'unknownKind': jsonEncode({...good, 'kind': 'spells'}),
    'empty': jsonEncode({...good, 'content': {'categories': []}}),
    'emptyLayout': jsonEncode({...layout, 'content': {}}),
    'badField': jsonEncode({
      ...good,
      'content': {
        'categories': [
          {
            'name': 'X',
            'fields': [
              {'name': 'Y', 'type': 'hologram'},
            ],
          },
        ],
      },
    }),
    'longName': jsonEncode({...good, 'name': 'n' * 201}),
    'tooMany': jsonEncode({
      ...good,
      'content': {'categories': List.filled(101, {'name': 'c'})},
    }),
    'deep': '{"format":"novel-builder/template","version":1,"kind":"system","content":${deep(10)}}',
    'nameNotText': jsonEncode({...good, 'name': 7, 'author': ['x'], 'license': 'nope', 'templateVersion': 2.7}),
  };

  final parse = <String, Object?>{
    'wrapped.txt': tryParse('wrapped.txt', utf8.encode([
      for (var p = 0; p < 3; p++) ...[
        'The sea came in over the causeway at dusk, as it did every night',
        'of the year, and the bell in the tower rang its long single note.',
        'Nobody in Vell thought anything of it, not then, not yet, never.',
        '',
      ],
    ].join('\r\n'))),
    'short.txt': tryParse('short.txt', utf8.encode('﻿One.\n\n  Two, indented.\nThree.\n\n\n')),
    'hard.md': tryParse('hard.md', utf8.encode('''
Title Line
==========

# Chapter One #

Some **bold *and italic*** text, ~~struck~~, <u>under</u>, \\*not\\* emphasis.
A line with two spaces at the end${"  "}
and a backslash\\
then more.

> A quote
> over two lines

1\\. A numbered line

* * *

## A scene heading

&nbsp;

---
Last words.
''')),
    'hard.rtf': tryParse('hard.rtf', latin1.encode(r"{\rtf1\ansi{\fonttbl{\f0 Times;}}{\*\generator Word;}\pard\qc\b Bold\b0  plain \i it\i0\par"
        r"\pard\qj caf\'e9 \u8212? dash \emdash\ \ldblquote q\rdblquote \line next\par"
        r"{\pard\ul under\ulnone  \strike s\strike0\par}\uc2\u9731 xx after\par\page\par}")),
    'fake.rtf': tryParse('fake.rtf', utf8.encode('plain')),
    'odd.pages': tryParse('odd.pages', utf8.encode('x')),
    'noext': tryParse('README', utf8.encode('Just words\nand more')),
    'groups.md': tryParse('groups.md', utf8.encode('''
# The Book

## Part One

### Chapter 1

Text one.

### Chapter 2

Text two.

#### A named scene

Scene text.

## Part Two

Act I

Chapter Three

Text three.

Chapter one was the hardest.

* * *

More.

#

After a hash.
''')),
  };

  final cells = [
    null, '', 'plain', 'a,b', 'say "hi"', 'line\nbreak', '=SUM(A1)', '+1', '-2', '@x', '\tTab', 3, 3.5, -1, true, false,
    ['a', 'b'], {'k': 'v'},
  ];
  final at = DateTime(2026, 10, 22, 10, 30);
  final names = [
    'The Ember Crown', '', '!!!', 'Ελληνικά & 日本語 — Title', 'x' * 80, '  spaced   out  ', 'Ünïcödé-Ñame',
  ];
  final malformed = <String, List<int>>{
    'ascii': [72, 105],
    'truncated': [0xe2, 0x82],
    'overlong': [0xc0, 0xaf, 65],
    'surrogate': [0xed, 0xa0, 0x80, 66],
    'tooBig': [0xf4, 0x90, 0x80, 0x80],
    'mixed': [0x41, 0xf0, 0x9f, 0x98, 0x80, 0xff, 0xe2, 0x82, 0xac, 0x80],
    'bomTxt': [0xef, 0xbb, 0xbf, 0x48, 0x69],
  };
  return {
    'templates': {for (final e in texts.entries) e.key: tryRead(e.value)},
    'tooLarge': tryRead(' ' * 1000001),
    'parse': parse,
    'cells': [for (final c in cells) csvCell(c)],
    'fileNames': [for (final n in names) exportFileName(n, 'timeline', at, 'json')],
    'utf8': {for (final e in malformed.entries) e.key: tryParse('${e.key}.txt', e.value)},
  };
}

/// The test's canonical JSON and its FNV-1a hash (as test/characters/golden/dump.dart).
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

/// JSON numbers as JavaScript reads them: a whole number written "1200.0" is 1200 there (it has one kind of number),
/// so the files are compared on what both apps can hold.
Object? wholeNumbers(Object? v) => switch (v) {
  final double d when d.isFinite && d == d.truncateToDouble() && d.abs() < 9007199254740992 => d.toInt(),
  final List<Object?> l => [for (final x in l) wholeNumbers(x)],
  final Map<String, Object?> m => {for (final e in m.entries) e.key: wholeNumbers(e.value)},
  _ => v,
};

/// With FULL set, every part whole; else each part of each novel as its hash (`misc` is always whole).
void main(List<String> args) {
  final full = Platform.environment['FULL'] != null;
  final importMd = File(args[1]).readAsStringSync();
  final out = <String, Object?>{};
  for (final path in args.skip(2)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(wholeNumbers(jsonDecode(File(path).readAsStringSync())) as JsonMap);
    final parts = novel(s, importMd);
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
  }
  out['misc'] = misc();
  File(args.first).writeAsStringSync(jsonEncode(out));
}
