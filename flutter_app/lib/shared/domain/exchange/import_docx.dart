import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import 'compile.dart' show Align, Run;
import 'import_parse.dart';

String _decode(String text) => text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAllMapped(
      RegExp(r'&#x([0-9a-f]+);', caseSensitive: false),
      (m) => String.fromCharCode(int.parse(m[1]!, radix: 16)),
    )
    .replaceAllMapped(RegExp(r'&#(\d+);'), (m) => String.fromCharCode(int.parse(m[1]!)))
    .replaceAll('&amp;', '&');

/// True when a toggle such as `<w:b/>` is present and not switched off with `w:val="0"`.
bool _toggle(String xml, String tag) {
  final match = RegExp('<w:$tag(?:\\s+w:val="([^"]*)")?\\s*/>').firstMatch(xml);
  return match != null && !const {'0', 'false', 'none'}.contains(match[1] ?? '');
}

/// Maps each paragraph style to a heading level (0 for the document title), whatever language Word named it in.
Map<String, int> _headingStyles(String stylesXml) {
  final levels = <String, int>{};
  for (final style in RegExp(r'<w:style\b[\s\S]*?</w:style>').allMatches(stylesXml)) {
    final xml = style[0]!;
    final id = RegExp(r'w:styleId="([^"]+)"').firstMatch(xml)?[1];
    final name = RegExp(r'<w:name w:val="([^"]+)"').firstMatch(xml)?[1]?.toLowerCase() ?? '';
    if (id == null) continue;
    final heading = RegExp(r'^heading (\d)$').firstMatch(name);
    if (heading != null) {
      levels[id] = int.parse(heading[1]!);
    } else if (name == 'title') {
      levels[id] = 0;
    }
  }
  return levels;
}

/// Word documents. Reads paragraphs with their heading styles, bold, italic, underline, strikethrough, alignment,
/// tabs and line breaks. Images, tables' layout, footnotes and tracked-change markup are not carried over.
List<ImportBlock> parseDocx(Uint8List file) {
  final Archive zip;
  try {
    zip = ZipDecoder().decodeBytes(file);
  } on Object {
    throw ImportException('This file could not be opened as a Word document.');
  }
  String? part(String name) {
    final entry = zip.findFile(name);
    final bytes = entry?.readBytes();
    return bytes == null ? null : utf8.decode(bytes, allowMalformed: true);
  }

  final documentXml = part('word/document.xml');
  if (documentXml == null) throw ImportException('This file could not be opened as a Word document.');
  final levels = _headingStyles(part('word/styles.xml') ?? '');
  // Text Word has marked as deleted (tracked changes) is not part of the document.
  final body = documentXml.replaceAll(RegExp(r'<w:del\b[\s\S]*?</w:del>'), '');
  final blocks = <ImportBlock>[];

  for (final p in RegExp(r'<w:p[\s>][\s\S]*?</w:p>').allMatches(body)) {
    final paragraph = p[0]!;
    final props = RegExp(r'<w:pPr>[\s\S]*?</w:pPr>').firstMatch(paragraph)?[0] ?? '';
    final styleId = RegExp(r'<w:pStyle w:val="([^"]+)"').firstMatch(props)?[1];
    final outline = RegExp(r'<w:outlineLvl w:val="(\d)"').firstMatch(props)?[1];
    final jc = RegExp(r'<w:jc w:val="(\w+)"').firstMatch(props)?[1];
    final runs = <Run>[];

    for (final r in RegExp(r'<w:r[\s>][\s\S]*?</w:r>').allMatches(paragraph)) {
      final run = r[0]!;
      final runProps = RegExp(r'<w:rPr>[\s\S]*?</w:rPr>').firstMatch(run)?[0] ?? '';
      var text = '';
      for (final piece in RegExp(
        r'<w:t(?:\s[^>]*)?>([\s\S]*?)</w:t>|<w:tab\s*/>|<w:(?:br|cr)(?:\s[^>]*)?/>',
      ).allMatches(run)) {
        if (piece[1] != null) {
          text += _decode(piece[1]!);
        } else if (piece[0]!.startsWith('<w:tab')) {
          text += '\t';
        } else if (!RegExp(r'w:type="(page|column)"').hasMatch(piece[0]!)) {
          text += '\n';
        }
      }
      if (text.isEmpty) continue;
      final style = Run(
        '',
        bold: _toggle(runProps, 'b'),
        italic: _toggle(runProps, 'i'),
        strike: _toggle(runProps, 'strike'),
        underline: RegExp(r'<w:u\s+w:val="(?!none)').hasMatch(runProps),
      );
      if (runs.isNotEmpty && runs.last.sameStyle(style)) {
        final last = runs.removeLast();
        runs.add(
          Run(last.text + text, bold: last.bold, italic: last.italic, underline: last.underline, strike: last.strike),
        );
      } else {
        runs.add(Run(text, bold: style.bold, italic: style.italic, underline: style.underline, strike: style.strike));
      }
    }

    final text = runs.map((r) => r.text).join();
    if (text.trim().isEmpty) continue; // Word uses empty paragraphs for spacing
    final int? level = styleId != null && levels.containsKey(styleId)
        ? levels[styleId]
        : styleId != null && RegExp(r'^heading(\d)$', caseSensitive: false).hasMatch(styleId)
        ? int.parse(RegExp(r'\d').firstMatch(styleId)![0]!)
        : styleId?.toLowerCase() == 'title'
        ? 0
        : outline != null
        ? int.parse(outline) + 1
        : null;
    if (level != null) {
      blocks.add(ImportHeading(level, text.replaceAll(RegExp(r'\s+'), ' ').trim()));
    } else {
      final align = switch (jc) {
        'center' => Align.center,
        'right' || 'end' => Align.right,
        'both' => Align.justify,
        _ => null,
      };
      blocks.add(ImportParagraph(runs, align: align));
    }
  }
  return blocks;
}
