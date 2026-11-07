import 'dart:typed_data';

import 'package:pdf/pdf.dart';

import 'compile.dart';

/// Characters beyond Latin-1 that the PDF's built-in fonts can still draw, at their Windows-1252 positions: curly
/// quotes, dashes, the ellipsis, the euro and a few more. The fonts are declared with that encoding.
const _cp1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, //
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, //
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/// Whether the built-in fonts can draw every character of [text]. Text in other scripts (Cyrillic, Greek, Chinese,
/// many accented letters) cannot be drawn with them, and a PDF with missing letters is never made: the author is told
/// to choose Word or a web page instead.
bool pdfCanDraw(String text) => text.runes.every((r) => r < 256 || _cp1252.containsKey(String.fromCharCode(r)));

/// Every character an export would draw, for [pdfCanDraw].
String pdfTextOf(Compiled compiled) => compiled.blocks
    .map(
      (b) => switch (b) {
        HeadingBlock() => b.text,
        ParagraphBlock() => b.text,
        FieldBlock() => b.label + b.text,
        ListBlock() => b.items.join(),
        DividerBlock() => '',
      },
    )
    .join();

/// The characters the fonts can not draw, each once, for saying which they are.
List<String> pdfMissing(String text) => [
  for (final r in {...text.runes})
    if (r >= 256 && !_cp1252.containsKey(String.fromCharCode(r))) String.fromCharCode(r),
];

/// Text as the font's single-byte encoding.
String _encode(String text) =>
    text.split('').map((c) => _cp1252.containsKey(c) ? String.fromCharCode(_cp1252[c]!) : c).join();

class PdfCannotDraw implements Exception {
  PdfCannotDraw(this.characters);
  final List<String> characters;
  @override
  String toString() =>
      'The PDF fonts cannot draw some characters in this text (${characters.take(8).join(' ')}${characters.length > 8 ? ' …' : ''}). Choose Word or a web page instead: they keep every character.';
}

const _pageWidth = 612.0;
const _pageHeight = 792.0;
const _margin = 72.0;
const _body = 12.0;
const _leading = 18.0;

typedef _Spec = ({double size, bool center, double before, double after, bool bold, bool italic});
const Map<HeadingRole, _Spec> _headings = {
  HeadingRole.title: (size: 30, center: true, before: 150, after: 14, bold: true, italic: false),
  HeadingRole.subtitle: (size: 16, center: true, before: 0, after: 14, bold: false, italic: true),
  HeadingRole.part: (size: 22, center: true, before: 90, after: 24, bold: true, italic: false),
  HeadingRole.chapter: (size: 18, center: false, before: 36, after: 18, bold: true, italic: false),
  HeadingRole.section: (size: 18, center: false, before: 24, after: 14, bold: true, italic: false),
  HeadingRole.entry: (size: 14, center: false, before: 16, after: 8, bold: true, italic: false),
  HeadingRole.minor: (size: 12, center: false, before: 14, after: 6, bold: true, italic: false),
};

class _Piece {
  _Piece(this.text, this.run, this.width);
  String text;
  final Run run;
  double width;
}

/// A paginated PDF on US Letter with one-inch margins, Times 12pt, as the original app makes it. Volumes and chapters
/// start a new page, headings never sit alone at the foot of a page, and pages are numbered. Layout is done here, word
/// by word, so bold and italic can change mid-line. Throws [PdfCannotDraw] rather than leave letters out.
Future<Uint8List> renderPdf(Compiled compiled, {bool compress = true}) async {
  final missing = pdfMissing(pdfTextOf(compiled));
  if (missing.isNotEmpty) throw PdfCannotDraw(missing);

  final doc = PdfDocument(compress: compress);
  PdfInfo(doc, title: compiled.title, author: compiled.author, creator: 'Novel Builder');
  final regular = PdfFont.times(doc);
  final bold = PdfFont.timesBold(doc);
  final italic = PdfFont.timesItalic(doc);
  final boldItalic = PdfFont.timesBoldItalic(doc);
  PdfFont fontOf(Run run) => run.bold && run.italic
      ? boldItalic
      : run.bold
      ? bold
      : run.italic
      ? italic
      : regular;
  double widthOf(String text, Run run, double size) =>
      text.isEmpty ? 0 : fontOf(run).stringMetrics(_encode(text)).advanceWidth * size;

  const width = _pageWidth - _margin * 2;
  const bottom = _pageHeight - _margin;
  final pages = <PdfPage>[];
  late PdfGraphics g;
  var y = _margin;
  var fresh = true; // nothing drawn on this page yet

  void newPage() {
    final page = PdfPage(doc, pageFormat: PdfPageFormat.letter);
    pages.add(page);
    g = page.getGraphics();
    g.setLineWidth(0.6);
    y = _margin;
    fresh = true;
  }

  void room(double height) {
    if (y + height > bottom && !fresh) newPage();
  }

  /// Breaks runs into lines that fit, keeping the author's spaces and forced line breaks.
  List<List<_Piece>> lines(List<Run> runs, double size, double maxWidth) {
    final out = <List<_Piece>>[[]];
    var used = 0.0;
    for (final run in runs) {
      final text = run.text.replaceAll('\t', '    ');
      for (final m in RegExp(r'\n| +|[^\n ]+').allMatches(text)) {
        final token = m[0]!;
        if (token == '\n') {
          out.add([]);
          used = 0;
          continue;
        }
        final tokenWidth = widthOf(token, run, size);
        final line = out.last;
        if (used + tokenWidth > maxWidth && line.isNotEmpty && token.trim().isNotEmpty) {
          while (line.isNotEmpty && line.last.text.trim().isEmpty) {
            used -= line.removeLast().width; // no trailing spaces
          }
          out.add([]);
          used = 0;
        }
        out.last.add(_Piece(token, run, tokenWidth));
        used += tokenWidth;
      }
    }
    return out;
  }

  void draw(List<Run> runs, {double size = _body, Align? align, double indent = 0, double after = 0}) {
    final leading = size * 1.5;
    for (final line in lines(runs, size, width - indent * 2)) {
      room(leading);
      final lineWidth = line.fold(0.0, (n, p) => n + p.width);
      var x =
          _margin +
          indent +
          (align == Align.center
              ? (width - indent * 2 - lineWidth) / 2
              : align == Align.right
              ? width - indent * 2 - lineWidth
              : 0);
      final baseline = y + size;
      // Neighbouring words in the same style are drawn as one string.
      final stretches = <_Piece>[];
      for (final piece in line) {
        if (stretches.isNotEmpty && identical(stretches.last.run, piece.run)) {
          stretches.last
            ..text += piece.text
            ..width += piece.width;
        } else {
          stretches.add(_Piece(piece.text, piece.run, piece.width));
        }
      }
      for (final piece in stretches) {
        final pdfY = _pageHeight - baseline;
        g.drawString(fontOf(piece.run), size, _encode(piece.text), x, pdfY);
        if (piece.run.underline) {
          g
            ..drawLine(x, pdfY - 1.5, x + piece.width, pdfY - 1.5)
            ..strokePath();
        }
        if (piece.run.strike) {
          g
            ..drawLine(x, pdfY + size * 0.28, x + piece.width, pdfY + size * 0.28)
            ..strokePath();
        }
        x += piece.width;
      }
      y += leading;
      fresh = false;
    }
    y += after;
  }

  newPage();
  for (final block in compiled.blocks) {
    switch (block) {
      case HeadingBlock():
        final spec = _headings[block.role]!;
        if (block.pageBreak && !fresh) newPage();
        // Keep a heading with at least two lines of what follows.
        room(spec.before + spec.size * 1.5 + spec.after + _leading * 2);
        if (!fresh || block.role == HeadingRole.title || block.role == HeadingRole.part) y += spec.before;
        draw(
          [Run(block.text, bold: spec.bold, italic: spec.italic)],
          size: spec.size,
          align: spec.center ? Align.center : null,
          after: spec.after,
        );
      case ParagraphBlock():
        if (block.runs.isEmpty) {
          y += _leading; // a blank line the author left
        } else {
          draw(
            block.runs,
            align: block.align == Align.justify ? null : block.align,
            indent: block.quote ? 36 : 0,
            after: 6,
          );
        }
      case DividerBlock():
        y += 6;
        draw([const Run('* * *')], align: Align.center, after: 12);
      case FieldBlock():
        draw(
          [Run('${block.label}:', bold: true), if (block.text.isNotEmpty) Run(' ${block.text}')],
          indent: 18,
          after: 4,
        );
      case ListBlock():
        for (final (i, item) in block.items.indexed) {
          draw([Run('${block.ordered ? '${i + 1}.' : '•'}  $item')], indent: 36, after: 2);
        }
        y += 4;
    }
  }

  for (var i = 1; i < pages.length; i++) {
    final number = '${i + 1}';
    final pageGraphics = pages[i].getGraphics();
    final w = regular.stringMetrics(number).advanceWidth * 10;
    pageGraphics.drawString(regular, 10, number, _pageWidth / 2 - w / 2, _margin / 2);
  }
  return doc.save();
}
