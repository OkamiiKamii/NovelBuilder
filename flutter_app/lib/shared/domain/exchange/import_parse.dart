import 'compile.dart' show Align, Run;

/// What a source file is read into, whatever its format.
sealed class ImportBlock {
  const ImportBlock();
}

/// A heading the file itself marked as one. Level 0 is a document title.
class ImportHeading extends ImportBlock {
  const ImportHeading(this.level, this.text);
  final int level;
  final String text;
}

class ImportParagraph extends ImportBlock {
  const ImportParagraph(this.runs, {this.align, this.quote = false});
  final List<Run> runs;
  final Align? align;
  final bool quote;
  String get text => runs.map((r) => r.text).join();
}

/// A scene break or horizontal rule.
class ImportDivider extends ImportBlock {
  const ImportDivider();
}

/// Why a file cannot be read. Nothing is imported when this is thrown.
class ImportException implements Exception {
  ImportException(this.reason);
  final String reason;
  @override
  String toString() => reason;
}

String _normalise(String text) => text.replaceFirst(RegExp('^\uFEFF'), '').replaceAll(RegExp(r'\r\n?'), '\n');

/// Plain text. One paragraph per line, blank lines dropped; unless the file is hard-wrapped (short lines in blocks
/// separated by blank lines), in which case each block is re-joined into one paragraph. Indents are kept as typed.
List<ImportBlock> parseText(String source) {
  final lines = _normalise(source).split('\n').map((line) => line.trimRight());
  final chunks = <List<String>>[];
  var current = <String>[];
  for (final line in lines) {
    if (line.trim().isNotEmpty) {
      current.add(line);
    } else if (current.isNotEmpty) {
      chunks.add(current);
      current = [];
    }
  }
  if (current.isNotEmpty) chunks.add(current);

  final inner = [for (final chunk in chunks) ...chunk.sublist(0, chunk.length - 1)];
  final wrapped =
      inner.length >= 5 && inner.where((line) => line.length >= 45 && line.length <= 100).length / inner.length > 0.7;
  final paragraphs = wrapped
      ? [
          for (final chunk in chunks) [for (final (i, line) in chunk.indexed) i > 0 ? line.trim() : line].join(' '),
        ]
      : [for (final chunk in chunks) ...chunk];
  return [
    for (final text in paragraphs) ImportParagraph([Run(text)]),
  ];
}

final _inline = RegExp(
  r'\\([\\`*_{}[\]<>#|~-])|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\2|(\*|_)(?=\S)([\s\S]+?)(?<=\S)\4|~~([\s\S]+?)~~|<u>([\s\S]+?)</u>',
);

/// Inline Markdown (bold, italic, strikethrough, underline, escapes) to formatted runs.
List<Run> parseInline(String text, [Run style = const Run('')]) {
  final runs = <Run>[];
  void push(String value) {
    if (value.isNotEmpty) {
      runs.add(Run(value, bold: style.bold, italic: style.italic, underline: style.underline, strike: style.strike));
    }
  }

  Run withStyle({bool? bold, bool? italic, bool? underline, bool? strike}) => Run(
    '',
    bold: bold ?? style.bold,
    italic: italic ?? style.italic,
    underline: underline ?? style.underline,
    strike: strike ?? style.strike,
  );

  var rest = text;
  for (var match = _inline.firstMatch(rest); match != null; match = _inline.firstMatch(rest)) {
    push(rest.substring(0, match.start));
    if (match[1] != null) {
      push(match[1]!);
    } else if (match[2] != null) {
      runs.addAll(parseInline(match[3]!, withStyle(bold: true)));
    } else if (match[4] != null) {
      runs.addAll(parseInline(match[5]!, withStyle(italic: true)));
    } else if (match[6] != null) {
      runs.addAll(parseInline(match[6]!, withStyle(strike: true)));
    } else {
      runs.addAll(parseInline(match[7]!, withStyle(underline: true)));
    }
    rest = rest.substring(match.end);
  }
  push(rest);
  return runs;
}

final _rule = RegExp(r'^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$');

/// Markdown: `#` and underlined headings, rules as scene breaks, block quotes, inline formatting.
List<ImportBlock> parseMarkdown(String source) {
  final blocks = <ImportBlock>[];
  var lines = <String>[];
  var quote = false;
  void flush() {
    if (lines.isEmpty) return;
    // Lines of one paragraph are joined; a trailing backslash or two spaces is a real line break.
    final text = [
      for (final (i, line) in lines.indexed)
        i == lines.length - 1
            ? line.trimRight()
            : RegExp(r'(\\| {2,})$').hasMatch(line)
            ? '${line.replaceFirst(RegExp(r'(\\| {2,})$'), '')}\n'
            : '${line.trimRight()} ',
    ].join();
    blocks.add(
      ImportParagraph(
        text == '&nbsp;'
            ? const []
            : parseInline(text.replaceFirstMapped(RegExp(r'^(\s*)(\d+)\\\. '), (m) => '${m[1]}${m[2]}. ')),
        quote: quote,
      ),
    );
    lines = [];
  }

  for (final raw in _normalise(source).split('\n')) {
    final heading = RegExp(r'^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$').firstMatch(raw);
    final isQuote = RegExp(r'^ {0,3}>').hasMatch(raw);
    if (heading != null) {
      flush();
      blocks.add(ImportHeading(heading[1]!.length, parseInline(heading[2]!).map((r) => r.text).join()));
    } else if (RegExp(r'^\s*=+\s*$').hasMatch(raw) && lines.length == 1 && !quote) {
      blocks.add(ImportHeading(1, parseInline(lines.removeLast().trim()).map((r) => r.text).join()));
    } else if (_rule.hasMatch(raw)) {
      flush();
      blocks.add(const ImportDivider());
    } else if (raw.trim().isEmpty) {
      flush();
    } else {
      if (isQuote != quote) flush();
      quote = isQuote;
      lines.add(isQuote ? raw.replaceFirst(RegExp(r'^ {0,3}> ?'), '') : raw);
    }
  }
  flush();
  return blocks;
}

const _cp1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', //
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', //
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/// Groups that hold settings or binary data rather than text.
const _skipped = {
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', //
  'footerr', 'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'generator', 'listtable', //
  'listoverridetable', 'rsidtbl', 'xmlnstbl', 'fldinst',
};
const _symbols = {
  'tab': '\t', 'emdash': '—', 'endash': '–', 'lquote': '‘', 'rquote': '’', 'ldblquote': '“', 'rdblquote': '”', //
  'bullet': '•', 'emspace': ' ', 'enspace': ' ', '~': '\u00A0', '_': '-',
};

class _RtfState {
  _RtfState({
    this.bold = false,
    this.italic = false,
    this.underline = false,
    this.strike = false,
    this.align,
    this.skip = false,
    this.uc = 1,
  });
  bool bold;
  bool italic;
  bool underline;
  bool strike;
  Align? align;
  bool skip;

  /// How many fallback characters follow each `\u` escape.
  int uc;

  _RtfState copy() =>
      _RtfState(bold: bold, italic: italic, underline: underline, strike: strike, align: align, skip: skip, uc: uc);
}

/// Rich Text Format: paragraphs, bold/italic/underline/strikethrough, alignment, and all the usual character escapes.
List<ImportBlock> parseRtf(String source) {
  if (!source.trimLeft().startsWith(r'{\rtf')) throw ImportException('This does not look like an RTF file.');
  final blocks = <ImportBlock>[];
  final stack = <_RtfState>[];
  var state = _RtfState();
  var runs = <Run>[];
  Align? align;
  var pending = 0; // fallback characters to ignore after a \u escape

  void emit(String text) {
    if (state.skip || text.isEmpty) return;
    if (pending > 0) {
      final dropped = pending < text.length ? pending : text.length;
      pending -= dropped;
      text = text.substring(dropped);
      if (text.isEmpty) return;
    }
    final last = runs.isEmpty ? null : runs.last;
    if (last != null &&
        last.bold == state.bold &&
        last.italic == state.italic &&
        last.underline == state.underline &&
        last.strike == state.strike) {
      runs[runs.length - 1] = Run(
        last.text + text,
        bold: last.bold,
        italic: last.italic,
        underline: last.underline,
        strike: last.strike,
      );
    } else {
      runs.add(Run(text, bold: state.bold, italic: state.italic, underline: state.underline, strike: state.strike));
    }
    align = state.align;
  }

  void endParagraph() {
    if (runs.any((r) => r.text.trim().isNotEmpty)) blocks.add(ImportParagraph(runs, align: align));
    runs = [];
    align = null;
  }

  final token = RegExp(r"\\([a-z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|([^\\{}]+)", caseSensitive: false);
  for (final m in token.allMatches(source)) {
    final word = m[1];
    final number = m[2];
    final hex = m[3];
    final symbol = m[4];
    final brace = m[5];
    final text = m[6];
    if (brace == '{') {
      stack.add(state.copy());
    } else if (brace == '}') {
      state = stack.isNotEmpty ? stack.removeLast() : state;
    } else if (hex != null) {
      final code = int.parse(hex, radix: 16);
      emit(_cp1252[code] ?? String.fromCharCode(code));
    } else if (symbol != null) {
      if (symbol == '*') {
        state.skip = true;
      } else if (symbol == '\n' || symbol == '\r') {
        endParagraph();
      } else {
        emit(_symbols[symbol] ?? symbol);
      }
    } else if (text != null) {
      emit(text.replaceAll(RegExp(r'[\r\n]'), ''));
    } else if (word != null) {
      final on = number != '0';
      if (_skipped.contains(word)) {
        state.skip = true;
      } else if (word == 'par' || word == 'sect' || word == 'page') {
        endParagraph();
      } else if (word == 'line') {
        emit('\n');
      } else if (word == 'b') {
        state.bold = on;
      } else if (word == 'i') {
        state.italic = on;
      } else if (word == 'ul') {
        state.underline = on;
      } else if (word == 'ulnone') {
        state.underline = false;
      } else if (word == 'strike') {
        state.strike = on;
      } else if (word == 'plain') {
        state
          ..bold = false
          ..italic = false
          ..underline = false
          ..strike = false;
      } else if (word == 'pard' || word == 'ql') {
        state.align = null;
      } else if (word == 'qc') {
        state.align = Align.center;
      } else if (word == 'qr') {
        state.align = Align.right;
      } else if (word == 'qj') {
        state.align = Align.justify;
      } else if (word == 'uc') {
        state.uc = int.tryParse(number ?? '1') ?? 1;
      } else if (word == 'u' && number != null) {
        final code = int.parse(number);
        emit(String.fromCharCode(code < 0 ? code + 65536 : code));
        pending = state.uc;
      } else if (_symbols.containsKey(word)) {
        emit(_symbols[word]!);
      }
    }
  }
  endParagraph();
  return blocks;
}
