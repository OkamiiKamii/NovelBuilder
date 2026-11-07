import '../json.dart';

/// Manuscript text is stored as ProseMirror document JSON, exactly as the original app stores it (`chapterContents.doc`).
/// These helpers read it without changing it. Editing goes through the editor's converter, which only saves documents
/// it can reproduce exactly (see `features/write/editor/prose_document.dart`).

/// A new, empty chapter: one empty paragraph, as the original editor writes it.
JsonMap emptyDoc() => {
  'type': 'doc',
  'content': [
    {
      'type': 'paragraph',
      'attrs': {'textAlign': null},
    },
  ],
};

String _inlineText(Object? nodes) => [
  for (final n in maps(nodes))
    switch (n['type']) {
      'text' => str(n['text']),
      'hardBreak' => '\n',
      _ => _inlineText(n['content']),
    },
].join();

/// The paragraphs and headings of a document in reading order, each with its text (soft line breaks as newlines).
/// The position of each is the paragraph number the editor uses, which links in canon and comments rely on.
List<({bool heading, String text})> docBlocks(Object? doc) {
  final blocks = <({bool heading, String text})>[];
  void walk(JsonMap? node) {
    if (node == null) return;
    final type = node['type'];
    if (type == 'paragraph' || type == 'heading') {
      blocks.add((heading: type == 'heading', text: _inlineText(node['content'])));
    } else {
      for (final c in maps(node['content'])) {
        walk(c);
      }
    }
  }

  walk(mapOrNull(doc));
  return blocks;
}

List<String> blockTexts(Object? doc) => [for (final b in docBlocks(doc)) b.text];

/// The closing words of a document, to show where the writing stopped: its last paragraphs (headings left out), up to
/// about [max] characters, cut at a space so no word is broken. [cut] says whether earlier text was left out. Empty
/// when nothing is written. Reads only: the text is the author's exactly, paragraph breaks kept.
({String text, bool cut}) closingWords(Object? doc, {int max = 320}) {
  final paragraphs = [
    for (final b in docBlocks(doc))
      if (!b.heading && b.text.trim().isNotEmpty) b.text.trim(),
  ];
  final kept = <String>[];
  var length = 0;
  var cut = false;
  for (final p in paragraphs.reversed) {
    final room = max - length;
    final runes = p.runes.toList();
    if (runes.length <= room) {
      kept.insert(0, p);
      length += runes.length + 2;
      continue;
    }
    cut = true;
    if (kept.isEmpty || room > 40) {
      // The end of this paragraph, from the first space that leaves it within the room.
      final take = room > 40 ? room : 40;
      final from = runes.length > take ? runes.length - take : 0;
      var start = from;
      while (start > 0 && start < runes.length && String.fromCharCode(runes[start]).trim().isNotEmpty) {
        start++;
      }
      final tail = String.fromCharCodes(runes.skip(start)).trimLeft();
      if (tail.isNotEmpty) {
        kept.insert(0, tail);
      } else if (kept.isEmpty) {
        // One unbroken run longer than the room: its end, as it is.
        kept.insert(0, String.fromCharCodes(runes.skip(from)));
      }
    }
    break;
  }
  return (text: kept.join('\n\n'), cut: cut);
}

/// Codex entries linked inside the text, in the order first linked.
List<String> mentionsIn(Object? doc) {
  final ids = <String>{};
  void walk(Object? node) {
    final m = mapOrNull(node);
    if (m == null) return;
    for (final mark in maps(m['marks'])) {
      final id = mapOrNull(mark['attrs'])?['entryId'];
      if (mark['type'] == 'entityLink' && id is String) ids.add(id);
    }
    for (final c in listOf(m['content'])) {
      walk(c);
    }
  }

  walk(doc);
  return ids.toList();
}

/// A document from plain text: one paragraph per line, blank lines kept as empty paragraphs, spaces and tabs kept.
JsonMap textToDoc(String text) {
  final lines = text.replaceAll(RegExp(r'\r\n?'), '\n').split('\n');
  return {
    'type': 'doc',
    'content': [
      for (final line in lines)
        {
          'type': 'paragraph',
          'attrs': {'textAlign': null},
          if (line.isNotEmpty)
            'content': [
              {'type': 'text', 'text': line},
            ],
        },
    ],
  };
}

// ------------------------------------------------------------------------------------------------- counting words

const _midLetter = {0x3A, 0xB7, 0x387, 0x5F4, 0x2027, 0xFE13, 0xFE55, 0xFF1A};
const _midNumLet = {0x2E, 0x27, 0x2019, 0x2018, 0xFE52, 0xFF07, 0xFF0E};
const _midNum = {
  0x2C,
  0x3B,
  0x37E,
  0x589,
  0x60C,
  0x60D,
  0x66C,
  0x7F8,
  0x2044,
  0xFE10,
  0xFE14,
  0xFE50,
  0xFE54,
  0xFF0C,
  0xFF1B,
};

final _letter = RegExp(r'[\p{L}]', unicode: true);
final _mark = RegExp(r'[\p{M}]', unicode: true);
final _digit = RegExp(r'[\p{Nd}]', unicode: true);
final _connector = RegExp(r'[\p{Pc}]', unicode: true);

enum _Kind { letter, digit, connector, other }

_Kind _kind(int rune) {
  final c = String.fromCharCode(rune);
  if (_letter.hasMatch(c)) return _Kind.letter;
  if (_digit.hasMatch(c)) return _Kind.digit;
  if (_connector.hasMatch(c)) return _Kind.connector;
  return _Kind.other;
}

/// How many words a text has, the way the original app counted them (Unicode word boundaries, as a browser's
/// `Intl.Segmenter` finds them): "don't", "e.g.", "U.S.A", "3.14", "1,000" and "_snake_case" are one word each;
/// "well-known" is two. Accents, diacritics and connected scripts count as part of their word.
///
/// Not matched exactly: Chinese and Japanese, which browsers split with a dictionary; here each run of one script
/// counts as one word.
int countWords(String text) {
  final runes = text.runes.toList();
  final kinds = [for (final r in runes) _mark.hasMatch(String.fromCharCode(r)) ? null : _kind(r)];
  var words = 0;
  var i = 0;
  bool isWordish(_Kind? k) => k == _Kind.letter || k == _Kind.digit || k == _Kind.connector;
  while (i < runes.length) {
    if (!isWordish(kinds[i])) {
      i++;
      continue;
    }
    words++;
    var last = kinds[i]!;
    i++;
    while (i < runes.length) {
      final k = kinds[i];
      if (k == null) {
        i++; // A combining mark belongs to the character before it.
        continue;
      }
      if (isWordish(k)) {
        last = k;
        i++;
        continue;
      }
      // A joiner between two word characters keeps the word going: letter·letter, digit,digit, letter.letter…
      final next = i + 1 < runes.length ? kinds[i + 1] : null;
      final r = runes[i];
      final joinsLetters =
          last == _Kind.letter && next == _Kind.letter && (_midLetter.contains(r) || _midNumLet.contains(r));
      final joinsDigits = last == _Kind.digit && next == _Kind.digit && (_midNum.contains(r) || _midNumLet.contains(r));
      if (joinsLetters || joinsDigits) {
        i += 2;
        last = next!;
        continue;
      }
      break;
    }
  }
  return words;
}

/// Words, characters (Unicode code points), non-empty paragraphs and reading time at 250 words a minute.
({int words, int characters, int paragraphs, int readingMinutes}) measure(List<String> blocks) {
  var words = 0;
  var characters = 0;
  var paragraphs = 0;
  for (final b in blocks) {
    words += countWords(b);
    characters += b.runes.length;
    if (b.trim().isNotEmpty) paragraphs++;
  }
  return (
    words: words,
    characters: characters,
    paragraphs: paragraphs,
    readingMinutes: words == 0 ? 0 : ((words / 250).round() < 1 ? 1 : (words / 250).round()),
  );
}

/// The measure of a stored document.
({int words, int characters, int paragraphs, int readingMinutes}) measureDoc(Object? doc) => measure(blockTexts(doc));

// ----------------------------------------------------------------------------------------------- exporting text

/// A document as plain text: one line per paragraph, a blank line between paragraphs.
String docToPlainText(Object? doc) => blockTexts(doc).join('\n\n');

/// A document as Markdown: headings, quotes, lists, rules, bold, italic and strikethrough. Underline has no Markdown
/// form and is left as plain text; links to codex entries become their text.
String docToMarkdown(Object? doc) {
  String inline(Object? nodes) => [
    for (final n in maps(nodes))
      switch (n['type']) {
        'text' => () {
          var t = str(n['text']);
          final marks = {for (final m in maps(n['marks'])) m['type']};
          if (marks.contains('strike')) t = '~~$t~~';
          if (marks.contains('italic')) t = '*$t*';
          if (marks.contains('bold')) t = '**$t**';
          return t;
        }(),
        'hardBreak' => '  \n',
        _ => inline(n['content']),
      },
  ].join();

  final out = <String>[];
  void block(JsonMap node, {String prefix = ''}) {
    switch (node['type']) {
      case 'paragraph':
        out.add('$prefix${inline(node['content'])}');
      case 'heading':
        final level = intOrNull(mapOrNull(node['attrs'])?['level']) ?? 1;
        out.add('$prefix${'#' * level.clamp(1, 6)} ${inline(node['content'])}');
      case 'blockquote':
        for (final c in maps(node['content'])) {
          block(c, prefix: '$prefix> ');
        }
      case 'bulletList' || 'orderedList':
        var n = intOrNull(mapOrNull(node['attrs'])?['start']) ?? 1;
        for (final item in maps(node['content'])) {
          final marker = node['type'] == 'bulletList' ? '- ' : '${n++}. ';
          final children = maps(item['content']);
          for (final (i, c) in children.indexed) {
            block(c, prefix: i == 0 ? '$prefix$marker' : '$prefix${' ' * marker.length}');
          }
        }
      case 'horizontalRule':
        out.add('$prefix---');
      default:
        for (final c in maps(node['content'])) {
          block(c, prefix: prefix);
        }
    }
  }

  for (final c in maps(mapOrNull(doc)?['content'])) {
    block(c);
  }
  return out.join('\n\n');
}
