import 'compile.dart';

String _plain(List<Run> runs) => runs.map((r) => r.text).join();

/// Plain text. Headings are set off by blank lines (volume and chapter titles in capitals), paragraphs are separated
/// by one blank line, and the text inside a paragraph is written exactly as typed.
String renderText(Compiled compiled) {
  final out = <String>[];
  for (final block in compiled.blocks) {
    switch (block) {
      case HeadingBlock():
        final loud = const {
          HeadingRole.title,
          HeadingRole.part,
          HeadingRole.chapter,
          HeadingRole.section,
        }.contains(block.role);
        final title = loud ? block.text.toUpperCase() : block.text;
        final length = title.runes.length;
        final rule = block.role == HeadingRole.title
            ? '=' * length
            : block.role == HeadingRole.part || block.role == HeadingRole.section
            ? '-' * length
            : '';
        out.addAll([
          ...block.pageBreak ? ['', ''] : [''],
          title,
          if (rule.isNotEmpty) rule,
          '',
        ]);
      case ParagraphBlock():
        final indent = block.quote ? '    ' : '';
        out.addAll([_plain(block.runs).split('\n').map((line) => indent + line).join('\n'), '']);
      case DividerBlock():
        out.addAll(['* * *', '']);
      case FieldBlock():
        out.addAll([
          block.text.isNotEmpty ? '${block.label}: ${block.text}' : '${block.label}:',
          if (block.text.isNotEmpty) '',
        ]);
      case ListBlock():
        out.addAll([for (final (i, item) in block.items.indexed) '${block.ordered ? '${i + 1}.' : '-'} $item', '']);
    }
  }
  return '${out.join('\n').trim()}\n';
}

String _escapeMd(String text) => text.replaceAllMapped(RegExp(r'([\\`*_{}[\]<>#|])'), (m) => '\\${m[1]}');

String _mdRuns(List<Run> runs) => runs.map((run) {
  if (run.text == '\n') return '  \n';
  // Emphasis markers must hug the words, so surrounding spaces stay outside them.
  final m = RegExp(r'^(\s*)([\s\S]*?)(\s*)$').firstMatch(run.text)!;
  final core = m[2]!;
  if (core.isEmpty) return run.text;
  var text = _escapeMd(core);
  if (run.strike) text = '~~$text~~';
  if (run.underline) text = '<u>$text</u>';
  if (run.italic) text = '*$text*';
  if (run.bold) text = '**$text**';
  return '${m[1]}$text${m[3]}';
}).join();

/// Markdown: `#` headings that mirror the hierarchy, `* * *` scene breaks, and inline formatting.
String renderMarkdown(Compiled compiled) {
  final out = <String>[];
  for (final block in compiled.blocks) {
    switch (block) {
      case HeadingBlock():
        out.addAll([
          block.role == HeadingRole.subtitle
              ? '*${_escapeMd(block.text)}*'
              : '${'#' * block.level} ${_escapeMd(block.text)}',
          '',
        ]);
      case ParagraphBlock():
        final body = _mdRuns(block.runs)
            .replaceFirstMapped(RegExp(r'^(\s*)(\d+)\. '), (m) => '${m[1]}${m[2]}\\. ')
            .replaceFirstMapped(RegExp(r'^(\s*)([-+]) '), (m) => '${m[1]}\\${m[2]} ');
        // A blank line the author left is kept as a non-breaking space, or Markdown would swallow it.
        out.addAll([
          body.trim().isNotEmpty ? (block.quote ? body.split('\n').map((l) => '> $l').join('\n') : body) : '&nbsp;',
          '',
        ]);
      case DividerBlock():
        out.addAll(['* * *', '']);
      case FieldBlock():
        out.addAll([
          block.text.isNotEmpty
              ? '**${_escapeMd(block.label)}:** ${_escapeMd(block.text).replaceAll('\n', '  \n')}'
              : '**${_escapeMd(block.label)}:**',
          '',
        ]);
      case ListBlock():
        out.addAll([
          for (final (i, item) in block.items.indexed)
            '${block.ordered ? '${i + 1}.' : '-'} ${_escapeMd(item).replaceAll('\n', ' ')}',
          '',
        ]);
    }
  }
  return '${out.join('\n').trim()}\n';
}

String _escapeHtml(String text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

String _htmlRuns(List<Run> runs) => runs.map((run) {
  if (run.text == '\n') return '<br>';
  var text = _escapeHtml(run.text);
  if (run.strike) text = '<s>$text</s>';
  if (run.underline) text = '<u>$text</u>';
  if (run.italic) text = '<em>$text</em>';
  if (run.bold) text = '<strong>$text</strong>';
  return text;
}).join();

String _blockHtml(Block block) => switch (block) {
  HeadingBlock(role: HeadingRole.subtitle) => '<p class="subtitle">${_escapeHtml(block.text)}</p>',
  HeadingBlock() =>
    '<h${block.level} class="${block.role.name}${block.pageBreak ? ' new-page' : ''}">${_escapeHtml(block.text)}</h${block.level}>',
  ParagraphBlock() => () {
    final style = block.align == null ? '' : ' style="text-align:${block.align!.name}"';
    final body = _htmlRuns(block.runs).isEmpty ? '<br>' : _htmlRuns(block.runs);
    return block.quote ? '<blockquote><p$style>$body</p></blockquote>' : '<p$style>$body</p>';
  }(),
  DividerBlock() => '<p class="scene-break">* * *</p>',
  FieldBlock() =>
    '<p class="field"><strong>${_escapeHtml(block.label)}:</strong> ${_escapeHtml(block.text).replaceAll('\n', '<br>')}</p>',
  ListBlock() =>
    '<${block.ordered ? 'ol' : 'ul'}>${block.items.map((item) => '<li>${_escapeHtml(item).replaceAll('\n', '<br>')}</li>').join()}</${block.ordered ? 'ol' : 'ul'}>',
};

/// A self-contained web page. It also prints cleanly: each volume and chapter starts on a new page.
String renderHtml(Compiled compiled) =>
    '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${_escapeHtml(compiled.title)}</title>
${compiled.author.isNotEmpty ? '<meta name="author" content="${_escapeHtml(compiled.author)}">\n' : ''}<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; max-width: 40em; margin: 3em auto; padding: 0 1.2em; color: #111; }
  p { margin: 0 0 0.6em; white-space: pre-wrap; tab-size: 4; overflow-wrap: break-word; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2em 0 0.8em; }
  h1.title { font-size: 2.2em; text-align: center; margin-top: 3em; }
  .subtitle { text-align: center; font-style: italic; font-size: 1.3em; }
  .part { text-align: center; }
  .scene-break { text-align: center; margin: 1.6em 0; }
  blockquote { margin: 0.8em 2em; }
  .field { margin-left: 1em; }
  @media print { body { margin: 0; max-width: none; } .new-page { break-before: page; } h1, h2, h3, h4 { break-after: avoid; } }
</style>
</head>
<body>
${compiled.blocks.map(_blockHtml).join('\n')}
</body>
</html>
''';
