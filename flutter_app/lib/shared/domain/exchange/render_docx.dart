import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import 'compile.dart';

String _esc(String text) => text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(RegExp(r'[\x00-\x08\x0b\x0c\x0e-\x1f]'), '');

/// Text with tabs and line breaks as Word elements; spaces are kept exactly (`xml:space="preserve"`).
String _content(String text) {
  final out = StringBuffer();
  var start = 0;
  for (final m in RegExp(r'\n|\t').allMatches(text)) {
    if (m.start > start) out.write('<w:t xml:space="preserve">${_esc(text.substring(start, m.start))}</w:t>');
    out.write(m[0] == '\n' ? '<w:br/>' : '<w:tab/>');
    start = m.end;
  }
  if (start < text.length) out.write('<w:t xml:space="preserve">${_esc(text.substring(start))}</w:t>');
  return out.toString();
}

String _run(Run r) {
  final props =
      '${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.strike ? '<w:strike/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}';
  return '<w:r>${props.isNotEmpty ? '<w:rPr>$props</w:rPr>' : ''}${_content(r.text)}</w:r>';
}

String _paragraph(String? style, String body, [String extra = '']) =>
    '<w:p>${style != null || extra.isNotEmpty ? '<w:pPr>${style != null ? '<w:pStyle w:val="$style"/>' : ''}$extra</w:pPr>' : ''}$body</w:p>';

const _jc = {Align.left: 'left', Align.center: 'center', Align.right: 'right', Align.justify: 'both'};

String _block(Block b) => switch (b) {
  HeadingBlock() => _paragraph(
    b.role == HeadingRole.title
        ? 'Title'
        : b.role == HeadingRole.subtitle
        ? 'Subtitle'
        : 'Heading${(b.level - 1).clamp(1, 6)}',
    _run(Run(b.text)),
    b.pageBreak ? '<w:pageBreakBefore/>' : '',
  ),
  ParagraphBlock() => _paragraph(
    b.quote ? 'Quote' : null,
    b.runs.map(_run).join(),
    b.align != null ? '<w:jc w:val="${_jc[b.align]}"/>' : '',
  ),
  DividerBlock() => _paragraph('SceneBreak', _run(const Run('* * *'))),
  FieldBlock() => _paragraph(
    'Field',
    _run(Run('${b.label}:', bold: true)) + (b.text.isNotEmpty ? _run(Run(' ${b.text}')) : ''),
  ),
  ListBlock() => [
    for (final (i, item) in b.items.indexed)
      _paragraph('ListItem', _run(Run('${b.ordered ? '${i + 1}.' : '•'}\t$item'))),
  ].join(),
};

const _ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
String _heading(int n, int size, [String extra = '']) =>
    '<w:style w:type="paragraph" w:styleId="Heading$n"><w:name w:val="heading $n"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="${n - 1}"/>$extra</w:pPr><w:rPr><w:b/><w:sz w:val="$size"/></w:rPr></w:style>';

final _styles =
    '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles $_ns>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="32"/></w:rPr></w:style>
${_heading(1, 40, '<w:jc w:val="center"/>')}${_heading(2, 32)}${_heading(3, 28)}${_heading(4, 26)}${_heading(5, 24)}${_heading(6, 24)}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="SceneBreak"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Field"><w:name w:val="Field"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListItem"><w:name w:val="List Item"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>''';

/// The body of a Word document: what the agreement tests compare with the original's.
String docxDocumentXml(Compiled compiled) => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document $_ns><w:body>${compiled.blocks.map(_block).join()}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>''';

/// A Word document. Volumes and chapters use real heading styles (so Word's navigation pane and table of contents see
/// the hierarchy) and start on a new page; scene breaks are centred; bold, italic, underline, strikethrough,
/// alignment, tabs and line breaks carry over.
Uint8List renderDocx(Compiled compiled) {
  final files = <String, String>{
    '[Content_Types].xml': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>''',
    '_rels/.rels': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>''',
    'word/_rels/document.xml.rels': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>''',
    'word/document.xml': docxDocumentXml(compiled),
    'word/styles.xml': _styles,
    'docProps/core.xml': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${_esc(compiled.title)}</dc:title><dc:creator>${_esc(compiled.author)}</dc:creator></cp:coreProperties>''',
  };
  final archive = Archive();
  for (final e in files.entries) {
    final bytes = utf8.encode(e.value);
    archive.addFile(ArchiveFile(e.key, bytes.length, bytes));
  }
  return Uint8List.fromList(ZipEncoder().encode(archive));
}
