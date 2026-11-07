import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import '../json.dart';
import '../reader/book.dart';
import 'compile.dart';

/// PUBLISHING OUTPUTS
/// Files made from the book the reader shows (`reader/book.dart`): an EPUB ebook, and a web serial's chapters as a web
/// page, Markdown or plain text. They read the book and nothing else; the stored manuscript is never touched, and the
/// author's text goes out exactly as written (no quotes or dashes changed, nothing added to it).

/// The blocks of a section's text, with the author's scene breaks kept as breaks.
List<Block> blocksOf(Section section) => [
  for (final piece in section.pieces)
    ...switch (piece) {
      BreakPiece() => const <Block>[DividerBlock()],
      TextPiece() => docToBlocks({
        'type': 'doc',
        'content': [piece.node],
      }, 3),
    },
];

/// Something about an output the author should know: what was left out, and what to do about it.
class OutputNote {
  const OutputNote(this.text);
  final String text;
}

/// A book that cannot be made, with what to do about it.
class BookOutputException implements Exception {
  const BookOutputException(this.message);
  final String message;
  @override
  String toString() => message;
}

String _xml(String text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

String _runsHtml(List<Run> runs) => runs.map((run) {
  var t = _xml(run.text).replaceAll('\n', '<br/>');
  if (run.strike) t = '<s>$t</s>';
  if (run.underline) t = '<u>$t</u>';
  if (run.italic) t = '<em>$t</em>';
  if (run.bold) t = '<strong>$t</strong>';
  return t;
}).join();

String _linesHtml(String text, {String? className}) => [
  for (final line in text.split('\n'))
    line.trim().isEmpty
        ? '<p class="blank">&#160;</p>'
        : '<p${className == null ? '' : ' class="$className"'}>${_xml(line)}</p>',
].join('\n');

/// The story text of a section as XHTML: paragraphs, headings inside the text, quotes, lists and scene breaks. The first
/// paragraph after a heading or a break is marked so it is not indented, as printed books do.
String _bodyHtml(Section section, String sceneBreak) {
  final out = <String>[];
  var first = true;
  for (final block in blocksOf(section)) {
    switch (block) {
      case DividerBlock():
        out.add(
          sceneBreak.trim().isEmpty ? '<p class="break blank">&#160;</p>' : '<p class="break">${_xml(sceneBreak)}</p>',
        );
        first = true;
      case HeadingBlock():
        final level = block.level.clamp(3, 6);
        out.add('<h$level>${_xml(block.text)}</h$level>');
        first = true;
      case ParagraphBlock():
        final classes = [
          if (first) 'first',
          if (block.quote) 'quote',
          if (block.align != null && block.align != Align.left) block.align!.name,
        ];
        out.add('<p${classes.isEmpty ? '' : ' class="${classes.join(' ')}"'}>${_runsHtml(block.runs)}</p>');
        first = false;
      case ListBlock():
        final tag = block.ordered ? 'ol' : 'ul';
        out.add('<$tag>${[for (final item in block.items) '<li>${_xml(item)}</li>'].join()}</$tag>');
        first = false;
      case FieldBlock():
        out.add('<p><strong>${_xml(block.label)}:</strong> ${_xml(block.text)}</p>');
        first = false;
    }
  }
  return out.join('\n');
}

String _chapterHeading(Section section, {int level = 2}) =>
    '<h$level class="chapter">${section.showsLabel ? '<span class="label">${_xml(section.label)}</span> ' : ''}${_xml(section.title)}</h$level>';

const _css = '''
body { margin: 0 5%; font-family: serif; line-height: 1.5; }
h1, h2 { text-align: center; font-weight: normal; margin: 2em 0 1.5em; page-break-before: always; }
h2 .label { display: block; font-size: 0.75em; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5em; }
p { margin: 0; text-indent: 1.5em; }
p.first, p.break, p.center, p.right, p.blank, .matter p, .note p { text-indent: 0; }
p.break { text-align: center; margin: 1em 0; }
p.center { text-align: center; }
p.right { text-align: right; }
p.justify { text-align: justify; }
p.quote { margin: 0 2em; text-indent: 0; font-style: italic; }
.matter { text-align: center; margin-top: 20%; }
.matter p { margin: 0.4em 0; }
.epigraph .source { margin-top: 1em; font-style: italic; }
.title h1 { font-size: 2em; page-break-before: auto; }
.title .subtitle { font-size: 1.2em; margin-bottom: 2em; }
.cover { text-align: center; margin: 0; }
.cover img { max-width: 100%; max-height: 100%; }
nav ol { list-style: none; padding-left: 1em; }
''';

String _page(String title, String language, String body, {String? epubType}) =>
    '''
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${_xml(language)}" lang="${_xml(language)}">
<head>
<meta charset="utf-8"/>
<title>${_xml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body${epubType == null ? '' : ' epub:type="$epubType"'}>
$body
</body>
</html>
''';

/// A picture given as a `data:` address that an ebook can carry: JPEG, PNG, GIF or WebP, read by its first bytes.
({Uint8List bytes, String mediaType, String extension})? _coverImage(String? cover) {
  if (cover == null || !cover.startsWith('data:')) return null;
  final comma = cover.indexOf(',');
  if (comma < 0 || !cover.substring(0, comma).endsWith(';base64')) return null;
  final Uint8List bytes;
  try {
    bytes = base64Decode(cover.substring(comma + 1));
  } on FormatException {
    return null;
  }
  bool starts(List<int> sig) =>
      bytes.length >= sig.length && [for (var i = 0; i < sig.length; i++) bytes[i]].join(',') == sig.join(',');
  if (starts([0xFF, 0xD8, 0xFF])) return (bytes: bytes, mediaType: 'image/jpeg', extension: 'jpg');
  if (starts([0x89, 0x50, 0x4E, 0x47])) return (bytes: bytes, mediaType: 'image/png', extension: 'png');
  if (starts([0x47, 0x49, 0x46, 0x38])) return (bytes: bytes, mediaType: 'image/gif', extension: 'gif');
  if (starts([0x52, 0x49, 0x46, 0x46]) && bytes.length > 12 && String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
    return (bytes: bytes, mediaType: 'image/webp', extension: 'webp');
  }
  return null;
}

String _utcStamp(DateTime when) {
  final t = when.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${t.year}-${two(t.month)}-${two(t.day)}T${two(t.hour)}:${two(t.minute)}:${two(t.second)}Z';
}

/// An ebook and what the author should know about it.
class EpubResult {
  const EpubResult(this.bytes, this.notes);
  final Uint8List bytes;
  final List<OutputNote> notes;
}

/// The book as an EPUB 3 file: the ebook format's pages in order (cover, title page, matter, contents, parts and
/// chapters), a contents list that readers can jump from, the novel's title, author and language, and the cover picture
/// when it is one an ebook can carry. Web addresses are never fetched: this app stays offline.
EpubResult renderEpub(Book book, {required String identifier, required String language, required DateTime modified}) {
  if (book.sections.every((s) => s.kind != SectionKind.chapter || s.words == 0)) {
    throw const BookOutputException(
      'This novel has no chapter with text yet, so there is nothing to put in an ebook. Write a chapter, then try again.',
    );
  }
  final lang = language.trim().isEmpty ? 'en' : language.trim();
  final notes = <OutputNote>[];
  final title = book.title.trim().isEmpty ? 'Untitled' : book.title.trim();
  final cover = _coverImage(book.cover);
  if (book.cover != null && book.cover!.isNotEmpty && cover == null) {
    notes.add(
      OutputNote(
        book.cover!.startsWith('data:')
            ? 'The cover picture is not a JPEG, PNG, GIF or WebP, so the ebook has a title cover instead. Choose another picture under the novel\'s details to use it.'
            : 'The cover is a web address, which this app never fetches (it stays offline), so the ebook has a title cover instead. Choose a picture from this device under the novel\'s details to use it.',
      ),
    );
  }

  final files = <String, String>{};
  final spine = <String>[];
  final toc = <({String file, String title, int depth})>[];
  var n = 0;
  String? firstChapter;
  String fileFor(Section s) =>
      s.kind == SectionKind.contents ? 'nav.xhtml' : 'p${(n++).toString().padLeft(3, '0')}.xhtml';

  String navBody() {
    final items = StringBuffer();
    for (final e in toc) {
      items.writeln('<li style="margin-left:${e.depth}em"><a href="${e.file}">${_xml(e.title)}</a></li>');
    }
    return '<nav epub:type="toc" id="toc"><h1>Contents</h1>\n<ol>\n$items</ol>\n</nav>\n'
        '<nav epub:type="landmarks" hidden="hidden"><ol>'
        '<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>'
        '${firstChapter == null ? '' : '<li><a epub:type="bodymatter" href="$firstChapter">Start reading</a></li>'}'
        '</ol></nav>';
  }

  for (final s in book.sections) {
    final file = fileFor(s);
    spine.add(file);
    switch (s.kind) {
      case SectionKind.cover:
        files[file] = _page(
          'Cover',
          lang,
          cover != null
              ? '<div class="cover"><img src="cover.${cover.extension}" alt="${_xml(title)}"/></div>'
              : '<div class="matter title"><h1>${_xml(title)}</h1>${book.author.trim().isEmpty ? '' : '<p>${_xml(book.author)}</p>'}</div>',
          epubType: 'cover',
        );
      case SectionKind.title:
        files[file] = _page(
          'Title page',
          lang,
          '<div class="matter title"><h1>${_xml(title)}</h1>'
              '${book.subtitle.trim().isEmpty ? '' : '<p class="subtitle">${_xml(book.subtitle)}</p>'}'
              '${book.author.trim().isEmpty ? '' : '<p>${_xml(book.author)}</p>'}</div>',
          epubType: 'titlepage',
        );
      case SectionKind.copyright || SectionKind.dedication:
        files[file] = _page(s.title, lang, '<div class="matter">${_linesHtml(s.text)}</div>');
      case SectionKind.epigraph:
        files[file] = _page(
          s.title,
          lang,
          '<div class="matter epigraph">${_linesHtml(s.text)}${s.source.isEmpty ? '' : '<p class="source">— ${_xml(s.source)}</p>'}</div>',
          epubType: 'epigraph',
        );
      case SectionKind.contents:
        // Written below, once every entry is known.
        break;
      case SectionKind.part:
        toc.add((file: file, title: s.title, depth: s.depth));
        files[file] = _page(
          s.title,
          lang,
          '<h1>${s.label.isNotEmpty && s.label.toLowerCase() != s.title.toLowerCase() ? '<span class="label">${_xml(s.label)}</span><br/>' : ''}${_xml(s.title)}</h1>',
          epubType: 'part',
        );
      case SectionKind.chapter:
        firstChapter ??= file;
        toc.add((file: file, title: s.showsLabel ? '${s.label}: ${s.title}' : s.title, depth: s.depth));
        files[file] = _page(
          s.title,
          lang,
          '${_chapterHeading(s)}\n${_bodyHtml(s, book.sceneBreak)}',
          epubType: 'chapter',
        );
      case SectionKind.acknowledgements || SectionKind.about:
        toc.add((file: file, title: s.title, depth: 0));
        files[file] = _page(s.title, lang, '<h2>${_xml(s.title)}</h2>\n${_linesHtml(s.text)}');
    }
  }
  if (!spine.contains('nav.xhtml')) spine.add('nav.xhtml');
  files['nav.xhtml'] = _page('Contents', lang, navBody());

  final manifest = StringBuffer()
    ..writeln('<item id="css" href="style.css" media-type="text/css"/>')
    ..writeln('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  if (cover != null) {
    manifest.writeln(
      '<item id="cover-image" href="cover.${cover.extension}" media-type="${cover.mediaType}" properties="cover-image"/>',
    );
  }
  for (final f in spine.where((f) => f != 'nav.xhtml')) {
    manifest.writeln('<item id="${f.split('.').first}" href="$f" media-type="application/xhtml+xml"/>');
  }
  final itemrefs = [
    for (final f in spine) '<itemref idref="${f == 'nav.xhtml' ? 'nav' : f.split('.').first}"/>',
  ].join('\n');
  final opf =
      '''
<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${_xml(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${_xml(identifier)}</dc:identifier>
<dc:title>${_xml(title)}</dc:title>
${book.author.trim().isEmpty ? '' : '<dc:creator>${_xml(book.author.trim())}</dc:creator>\n'}<dc:language>${_xml(lang)}</dc:language>
<meta property="dcterms:modified">${_utcStamp(modified)}</meta>
</metadata>
<manifest>
$manifest</manifest>
<spine>
$itemrefs
</spine>
</package>
''';
  const container = '''
<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
''';

  final archive = Archive();
  // The first entry, stored as it is: how a reader knows the file is an ebook.
  final mimetype = utf8.encode('application/epub+zip');
  archive
    ..addFile(ArchiveFile.noCompress('mimetype', mimetype.length, mimetype))
    ..addFile(ArchiveFile.string('META-INF/container.xml', container.trimLeft()))
    ..addFile(ArchiveFile.string('OEBPS/content.opf', opf.trimLeft()))
    ..addFile(ArchiveFile.string('OEBPS/style.css', _css));
  if (cover != null) archive.addFile(ArchiveFile.bytes('OEBPS/cover.${cover.extension}', cover.bytes));
  for (final e in files.entries) {
    archive.addFile(ArchiveFile.string('OEBPS/${e.key}', e.value.trimLeft()));
  }
  return EpubResult(Uint8List.fromList(ZipEncoder().encode(archive)), notes);
}

/// The ways a web serial's chapter goes out.
enum SerialFormat {
  html('Web page', 'html'),
  markdown('Markdown', 'md'),
  text('Plain text', 'txt');

  const SerialFormat(this.label, this.extension);
  final String label;
  final String extension;
}

String _mdEscape(String text) => text.replaceAllMapped(RegExp(r'([\\`*_{}[\]<>#|])'), (m) => '\\${m[1]}');

String _mdRuns(List<Run> runs) => runs.map((run) {
  if (run.text.trim().isEmpty) return run.text.replaceAll('\n', '  \n');
  // Emphasis around the words only, so a run's own spaces stay outside the marks.
  final match = RegExp(r'^(\s*)(.*?)(\s*)$', dotAll: true).firstMatch(run.text)!;
  var t = _mdEscape(match[2]!).replaceAll('\n', '  \n');
  if (run.strike) t = '~~$t~~';
  if (run.italic) t = '*$t*';
  if (run.bold) t = '**$t**';
  return '${match[1]}$t${match[3]}';
}).join();

/// The heading a serial chapter goes out under: "Chapter 3: The Bell", or the title alone when it says the same.
String serialHeading(Section s) => s.showsLabel ? '${s.label}: ${s.title}' : s.title;

/// One chapter as posted online: its heading, the author's note before, the text with the book's scene breaks, the
/// note after. The text is exactly as written.
String renderSerialChapter(Book book, Section s, SerialFormat format) {
  final blocks = blocksOf(s);
  final mark = book.sceneBreak.trim();
  switch (format) {
    case SerialFormat.html:
      String note(String text, String which) =>
          text.isEmpty ? '' : '<aside class="note $which">\n${_linesHtml(text)}\n</aside>\n';
      return '''
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${_xml(serialHeading(s))}</title>
<style>body{max-width:40em;margin:2em auto;padding:0 1em;font-family:Georgia,serif;line-height:1.6}p{margin:0 0 1em}p.break{text-align:center}.note{font-style:italic;border-left:3px solid #999;padding-left:1em;margin:1em 0}</style>
</head>
<body>
<h1>${_xml(serialHeading(s))}</h1>
${note(s.noteBefore, 'before')}${_bodyHtml(s, book.sceneBreak)}
${note(s.noteAfter, 'after')}</body>
</html>
''';
    case SerialFormat.markdown:
      final out = <String>['# ${_mdEscape(serialHeading(s))}', ''];
      if (s.noteBefore.isNotEmpty) {
        out.addAll([for (final line in s.noteBefore.split('\n')) '> ${_mdEscape(line)}', '']);
      }
      for (final b in blocks) {
        switch (b) {
          case DividerBlock():
            out.addAll([mark.isEmpty ? '&nbsp;' : _mdEscape(mark), '']);
          case HeadingBlock():
            out.addAll(['${'#' * b.level.clamp(2, 6)} ${_mdEscape(b.text)}', '']);
          case ParagraphBlock():
            if (b.text.trim().isEmpty) continue;
            out.addAll(['${b.quote ? '> ' : ''}${_mdRuns(b.runs)}', '']);
          case ListBlock():
            out.addAll([
              for (final (i, item) in b.items.indexed) '${b.ordered ? '${i + 1}.' : '-'} ${_mdEscape(item)}',
              '',
            ]);
          case FieldBlock():
            out.addAll(['**${_mdEscape(b.label)}:** ${_mdEscape(b.text)}', '']);
        }
      }
      if (s.noteAfter.isNotEmpty) out.addAll([for (final line in s.noteAfter.split('\n')) '> ${_mdEscape(line)}', '']);
      return '${out.join('\n').trimRight()}\n';
    case SerialFormat.text:
      final out = <String>[serialHeading(s), ''];
      if (s.noteBefore.isNotEmpty) out.addAll([s.noteBefore, '']);
      for (final b in blocks) {
        switch (b) {
          case DividerBlock():
            out.addAll([mark, '']);
          case HeadingBlock():
            out.addAll([b.text, '']);
          case ParagraphBlock():
            if (b.text.trim().isEmpty) continue;
            out.addAll([b.text, '']);
          case ListBlock():
            out.addAll([for (final (i, item) in b.items.indexed) '${b.ordered ? '${i + 1}.' : '-'} $item', '']);
          case FieldBlock():
            out.addAll(['${b.label}: ${b.text}', '']);
        }
      }
      if (s.noteAfter.isNotEmpty) out.addAll([s.noteAfter, '']);
      return '${out.join('\n').trimRight()}\n';
  }
}

/// A file name for a serial chapter: its place in the book and its title, kept to safe characters.
String serialFileName(Section s, int index, SerialFormat format) {
  final slug = s.title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');
  return '${(index + 1).toString().padLeft(3, '0')}-${slug.isEmpty ? 'chapter' : slug}.${format.extension}';
}

/// Every chapter of a web serial, one file each, in one zip.
Uint8List renderSerialZip(Book book, SerialFormat format) {
  final chapters = [
    for (final s in book.sections)
      if (s.kind == SectionKind.chapter) s,
  ];
  if (chapters.every((s) => s.words == 0)) {
    throw const BookOutputException(
      'This novel has no chapter with text yet, so there is nothing to post. Write a chapter, then try again.',
    );
  }
  final archive = Archive();
  for (final (i, s) in chapters.indexed) {
    archive.addFile(ArchiveFile.string(serialFileName(s, i, format), renderSerialChapter(book, s, format)));
  }
  return Uint8List.fromList(ZipEncoder().encode(archive));
}

/// The ebook's identifier: the novel's own id, so every export of the same novel is the same book to a reader app.
String epubIdentifier(JsonMap project) => 'urn:uuid:${str(project['id'])}';
