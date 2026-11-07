import 'package:flutter/material.dart' hide Align;

import '../../shared/domain/exchange/compile.dart'
    show Align, DividerBlock, FieldBlock, HeadingBlock, ListBlock, ParagraphBlock, Run;
import '../../shared/domain/exchange/render_book.dart' show blocksOf;
import '../../shared/domain/reader/book.dart';
import '../../shared/domain/reader/reader_prefs.dart';

/// How the book is drawn: the reader's preferences turned into styles. Only how text is shown: the stored text is never
/// touched, and what is drawn is the author's text exactly as written.
@immutable
class BookLook {
  const BookLook({
    required this.body,
    required this.background,
    required this.foreground,
    required this.muted,
    required this.indented,
    required this.indent,
    required this.spacing,
    required this.justify,
    required this.measure,
    required this.sceneBreak,
  });

  factory BookLook.of(ReaderPrefs prefs, String sceneBreak, TargetPlatform platform) {
    final look = resolveLook(prefs);
    Color parse(String hex) => Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);
    final fg = parse(look.text);
    final font = readerFontFor(prefs.font, platform);
    return BookLook(
      body: TextStyle(
        fontFamily: font.family,
        fontFamilyFallback: font.fallback,
        fontSize: prefs.size,
        height: prefs.leading,
        color: fg,
      ),
      background: parse(look.background),
      foreground: fg,
      muted: fg.withValues(alpha: 0.65),
      indented: look.indented,
      indent: prefs.indent,
      spacing: prefs.spacing,
      justify: look.justify,
      measure: prefs.measure,
      sceneBreak: sceneBreak,
    );
  }

  final TextStyle body;
  final Color background;
  final Color foreground;
  final Color muted;
  final bool indented;

  /// First-line indent, in ems.
  final double indent;

  /// Space between paragraphs when they are spaced apart, in lines.
  final double spacing;
  final bool justify;

  /// The longest a line may be, in characters.
  final double measure;
  final String sceneBreak;

  double get lineHeight => (body.fontSize ?? 18) * (body.height ?? 1.5);

  /// The width of the text column for a page this wide: the measure in characters, at an average half an em each.
  double columnWidth(double available) => available.clamp(0, measure * (body.fontSize ?? 18) * 0.5).toDouble();

  /// The first-line indent as spaces of known widths (an em, an en and a quarter em), so it is drawn and measured
  /// alike. Shown only: never part of the text.
  String get indentPrefix {
    if (!indented || indent <= 0) return '';
    var rest = indent;
    final out = StringBuffer();
    while (rest >= 1) {
      out.write(' ');
      rest -= 1;
    }
    if (rest >= 0.5) {
      out.write(' ');
      rest -= 0.5;
    }
    if (rest >= 0.25) out.write(' ');
    return out.toString();
  }
}

/// Typefaces already on each device: nothing is downloaded. Where a face is not installed, the nearest one there is used.
({String? family, List<String> fallback}) readerFontFor(ReaderFont font, TargetPlatform platform) {
  final apple = platform == TargetPlatform.iOS || platform == TargetPlatform.macOS;
  final windows = platform == TargetPlatform.windows;
  return switch (font) {
    ReaderFont.book => (
      family: apple ? 'Iowan Old Style' : (windows ? 'Palatino Linotype' : 'serif'),
      fallback: const ['Palatino', 'Book Antiqua', 'Georgia', 'Noto Serif', 'serif'],
    ),
    ReaderFont.garamond => (
      family: apple ? 'Garamond' : (windows ? 'Garamond' : 'serif'),
      fallback: const ['EB Garamond', 'Times New Roman', 'Noto Serif', 'serif'],
    ),
    ReaderFont.charter => (
      family: apple ? 'Charter' : (windows ? 'Cambria' : 'serif'),
      fallback: const ['Georgia', 'Noto Serif', 'serif'],
    ),
    ReaderFont.georgia => (family: apple || windows ? 'Georgia' : 'serif', fallback: const ['Noto Serif', 'serif']),
    ReaderFont.sans => (family: null, fallback: const []),
    ReaderFont.humanist => (
      family: apple ? 'Optima' : (windows ? 'Trebuchet MS' : 'sans-serif'),
      fallback: const ['Gill Sans', 'Verdana', 'sans-serif'],
    ),
  };
}

enum FlowRole { body, heading, label, breakMark, matter, source, quote, list, note }

/// One block of a page, measured and drawn the same way: the author's text in runs, its style and alignment, its
/// first-line indent, and the space before it. Body paragraphs can be split between pages at a line break.
@immutable
class FlowItem {
  const FlowItem({
    required this.runs,
    required this.style,
    required this.role,
    this.align = TextAlign.start,
    this.indentFirst = '',
    this.left = 0,
    this.spaceBefore = 0,
    this.splittable = false,
    this.keepWithNext = false,
  });

  final List<Run> runs;
  final TextStyle style;
  final FlowRole role;
  final TextAlign align;

  /// Drawn before the first line only (and never on a continued part).
  final String indentFirst;

  /// Space on the left (a quotation, a list).
  final double left;
  final double spaceBefore;
  final bool splittable;

  /// A heading stays on the page of what follows it.
  final bool keepWithNext;

  String get text => runs.map((r) => r.text).join();
}

/// The runs of [item] between [start] and [end] (offsets in its text), as a span; the indent only on the first part.
InlineSpan spanOf(FlowItem item, {int start = 0, int? end}) {
  final stop = end ?? item.text.length;
  final children = <InlineSpan>[];
  if (start == 0 && item.indentFirst.isNotEmpty) children.add(TextSpan(text: item.indentFirst));
  var at = 0;
  for (final run in item.runs) {
    final from = at;
    final to = at + run.text.length;
    at = to;
    final a = from < start ? start : from;
    final b = to > stop ? stop : to;
    if (a >= b) continue;
    children.add(
      TextSpan(
        text: run.text.substring(a - from, b - from),
        style: TextStyle(
          fontWeight: run.bold ? FontWeight.bold : null,
          fontStyle: run.italic ? FontStyle.italic : null,
          decoration: TextDecoration.combine([
            if (run.underline) TextDecoration.underline,
            if (run.strike) TextDecoration.lineThrough,
          ]),
        ),
      ),
    );
  }
  return TextSpan(style: item.style, children: children);
}

List<Run> _plainRuns(String text) => text.isEmpty ? const [] : [Run(text)];

/// The blocks of one section, in order, styled by [look]. Covers and the contents page are drawn by the view itself.
List<FlowItem> sectionItems(Book book, Section s, BookLook look) {
  final body = look.body;
  final size = body.fontSize ?? 18;
  final line = look.lineHeight;
  final paraGap = look.indented ? 0.0 : look.spacing * line;
  final heading = body.copyWith(fontSize: size * 1.5, height: 1.25, fontWeight: FontWeight.w600);
  final small = body.copyWith(fontSize: size * 0.8, letterSpacing: 1.2, color: look.muted);
  final items = <FlowItem>[];
  List<FlowItem> lines(
    String text,
    TextStyle style, {
    TextAlign align = TextAlign.center,
    FlowRole role = FlowRole.matter,
  }) => [
    for (final l in text.split('\n'))
      FlowItem(runs: _plainRuns(l.isEmpty ? ' ' : l), style: style, role: role, align: align, splittable: true),
  ];

  switch (s.kind) {
    case SectionKind.cover || SectionKind.contents:
      return const [];
    case SectionKind.title:
      return [
        FlowItem(
          runs: _plainRuns(book.title.trim().isEmpty ? 'Untitled' : book.title),
          style: heading.copyWith(fontSize: size * 2),
          role: FlowRole.heading,
          align: TextAlign.center,
          spaceBefore: line * 4,
        ),
        if (book.subtitle.trim().isNotEmpty)
          FlowItem(
            runs: _plainRuns(book.subtitle),
            style: body.copyWith(fontStyle: FontStyle.italic),
            role: FlowRole.matter,
            align: TextAlign.center,
            spaceBefore: line,
          ),
        if (book.author.trim().isNotEmpty)
          FlowItem(
            runs: _plainRuns(book.author),
            style: body,
            role: FlowRole.matter,
            align: TextAlign.center,
            spaceBefore: line * 3,
          ),
      ];
    case SectionKind.copyright || SectionKind.dedication:
      final style = s.kind == SectionKind.dedication
          ? body.copyWith(fontStyle: FontStyle.italic)
          : body.copyWith(fontSize: size * 0.85);
      return [
        FlowItem(runs: const [], style: body, role: FlowRole.matter, spaceBefore: line * 4),
        ...lines(s.text, style),
      ];
    case SectionKind.epigraph:
      return [
        FlowItem(runs: const [], style: body, role: FlowRole.matter, spaceBefore: line * 4),
        ...lines(s.text, body.copyWith(fontStyle: FontStyle.italic)),
        if (s.source.isNotEmpty)
          FlowItem(
            runs: _plainRuns('— ${s.source}'),
            style: body,
            role: FlowRole.source,
            align: TextAlign.center,
            spaceBefore: line,
          ),
      ];
    case SectionKind.part:
      return [
        if (s.label.isNotEmpty && s.label.toLowerCase() != s.title.toLowerCase())
          FlowItem(
            runs: _plainRuns(s.label.toUpperCase()),
            style: small,
            role: FlowRole.label,
            align: TextAlign.center,
            spaceBefore: line * 5,
            keepWithNext: true,
          ),
        FlowItem(
          runs: _plainRuns(s.title),
          style: heading.copyWith(fontSize: size * 1.8),
          role: FlowRole.heading,
          align: TextAlign.center,
          spaceBefore: s.showsLabel ? line : line * 5,
        ),
      ];
    case SectionKind.acknowledgements || SectionKind.about:
      return [
        FlowItem(
          runs: _plainRuns(s.title),
          style: heading,
          role: FlowRole.heading,
          align: TextAlign.center,
          spaceBefore: line * 2,
          keepWithNext: true,
        ),
        for (final (i, l) in s.text.split('\n').indexed)
          FlowItem(
            runs: _plainRuns(l.isEmpty ? ' ' : l),
            style: body,
            role: FlowRole.body,
            spaceBefore: i == 0 ? line : paraGap,
            splittable: true,
          ),
      ];
    case SectionKind.chapter:
      break;
  }

  // A chapter: its label, its title, then the author's text.
  if (s.showsLabel) {
    items.add(
      FlowItem(
        runs: _plainRuns(s.label.toUpperCase()),
        style: small,
        role: FlowRole.label,
        align: TextAlign.center,
        spaceBefore: line * 2,
        keepWithNext: true,
      ),
    );
  }
  items.add(
    FlowItem(
      runs: _plainRuns(s.title),
      style: heading,
      role: FlowRole.heading,
      align: TextAlign.center,
      spaceBefore: s.showsLabel ? line * 0.5 : line * 2,
      keepWithNext: true,
    ),
  );
  var first = true;
  var gapNext = line * 1.5;
  TextAlign alignOf(Align? a) => switch (a) {
    Align.center => TextAlign.center,
    Align.right => TextAlign.right,
    Align.justify => TextAlign.justify,
    _ => look.justify ? TextAlign.justify : TextAlign.start,
  };
  for (final block in blocksOf(s)) {
    switch (block) {
      case DividerBlock():
        items.add(
          FlowItem(
            runs: _plainRuns(look.sceneBreak.trim().isEmpty ? ' ' : look.sceneBreak),
            style: body,
            role: FlowRole.breakMark,
            align: TextAlign.center,
            spaceBefore: line * 0.5,
          ),
        );
        first = true;
        gapNext = line * 0.5;
      case HeadingBlock():
        items.add(
          FlowItem(
            runs: _plainRuns(block.text),
            style: body.copyWith(fontWeight: FontWeight.w600),
            role: FlowRole.heading,
            spaceBefore: line,
            keepWithNext: true,
          ),
        );
        first = true;
        gapNext = line * 0.5;
      case ParagraphBlock():
        final indent = !first && look.indented && block.align == null && !block.quote;
        items.add(
          FlowItem(
            runs: block.runs.isEmpty ? _plainRuns(' ') : block.runs,
            style: block.quote ? body.copyWith(fontStyle: FontStyle.italic) : body,
            role: block.quote ? FlowRole.quote : FlowRole.body,
            align: alignOf(block.align),
            indentFirst: indent ? look.indentPrefix : '',
            left: block.quote ? size * 2 : 0,
            spaceBefore: first ? gapNext : paraGap,
            splittable: true,
          ),
        );
        first = false;
      case ListBlock():
        for (final (i, item) in block.items.indexed) {
          items.add(
            FlowItem(
              runs: _plainRuns('${block.ordered ? '${i + 1}.' : '•'} $item'),
              style: body,
              role: FlowRole.list,
              left: size * 1.5,
              spaceBefore: i == 0 ? line * 0.5 : 0,
              splittable: true,
            ),
          );
        }
        first = false;
      case FieldBlock():
        items.add(
          FlowItem(
            runs: [Run('${block.label}: ', bold: true), Run(block.text)],
            style: body,
            role: FlowRole.body,
            spaceBefore: paraGap,
            splittable: true,
          ),
        );
        first = false;
    }
  }
  return items;
}

/// A part of one item placed on a page: the whole item, or the lines from [start] to [end] of it.
typedef PagePart = ({int item, int start, int end, double spaceBefore});

/// Lays [items] out on pages of [page] size, measuring every block exactly as it is drawn ([scaler] included). A body
/// paragraph that does not fit goes on over the page at a line break; a heading never ends a page alone.
List<List<PagePart>> paginate(List<FlowItem> items, Size page, TextScaler scaler) {
  final pages = <List<PagePart>>[];
  var current = <PagePart>[];
  var used = 0.0;
  TextPainter painter(FlowItem item, int start) {
    final width = (page.width - item.left).clamp(1.0, double.infinity);
    return TextPainter(
      text: spanOf(item, start: start),
      textAlign: item.align,
      textDirection: TextDirection.ltr,
      textScaler: scaler,
    )..layout(maxWidth: width);
  }

  void newPage() {
    if (current.isNotEmpty) pages.add(current);
    current = [];
    used = 0;
  }

  for (var i = 0; i < items.length; i++) {
    final item = items[i];
    var start = 0;
    var spaceBefore = item.spaceBefore;
    while (true) {
      final space = current.isEmpty && start > 0 ? 0.0 : spaceBefore;
      final p = painter(item, start);
      final h = p.height;
      // A heading keeps a line of what follows on its page.
      final keep = item.keepWithNext && i + 1 < items.length
          ? painter(items[i + 1], 0).computeLineMetrics().firstOrNull?.height ?? 0
          : 0.0;
      if (used + space + h + keep <= page.height || (current.isEmpty && !item.splittable)) {
        current.add((item: i, start: start, end: item.text.length, spaceBefore: space));
        used += space + h;
        p.dispose();
        break;
      }
      if (item.splittable && !item.keepWithNext) {
        final room = page.height - used - space;
        final lines = p.computeLineMetrics();
        var fit = 0;
        var height = 0.0;
        while (fit < lines.length && height + lines[fit].height <= room) {
          height += lines[fit].height;
          fit++;
        }
        if (fit > 0 && fit < lines.length) {
          final prefix = start == 0 ? item.indentFirst.length : 0;
          final at = p.getPositionForOffset(Offset(0, height + lines[fit].height / 2)).offset - prefix;
          final cut = start + at;
          if (cut > start && cut < item.text.length) {
            current.add((item: i, start: start, end: cut, spaceBefore: space));
            p.dispose();
            newPage();
            start = cut;
            spaceBefore = 0;
            continue;
          }
        }
      }
      p.dispose();
      if (current.isEmpty) {
        // Taller than a whole page and cannot be split: it goes on a page of its own.
        current.add((item: i, start: start, end: item.text.length, spaceBefore: 0));
        newPage();
        break;
      }
      newPage();
    }
  }
  if (current.isNotEmpty || pages.isEmpty) pages.add(current);
  return pages;
}
