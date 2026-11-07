import 'dart:convert';

import 'package:flutter/material.dart' hide Align;
import 'package:flutter/services.dart';

import '../../shared/domain/reader/book.dart';
import 'book_layout.dart';

/// A place in the book as the reader shows it: a section, and a page of it (paged), or the section's start.
typedef ReaderPlace = ({int section, int page});

/// Draws one part of a page: the item's runs from start to end, exactly as measured.
Widget drawPart(FlowItem item, PagePart part) {
  final text = Text.rich(
    spanOf(item, start: part.start, end: part.end),
    textAlign: item.align,
  );
  final heading = item.role == FlowRole.heading;
  return Padding(
    padding: EdgeInsets.only(top: part.spaceBefore, left: item.left),
    child: heading ? Semantics(header: true, child: text) : text,
  );
}

/// The ebook's cover: the novel's picture when it is one, else its title and author on its colour.
class BookCover extends StatelessWidget {
  const BookCover({super.key, required this.book, required this.look});
  final Book book;
  final BookLook look;

  @override
  Widget build(BuildContext context) {
    final cover = book.cover;
    if (cover != null && cover.startsWith('data:image/') && cover.contains(';base64,')) {
      try {
        final bytes = base64Decode(cover.substring(cover.indexOf(',') + 1));
        return Center(
          child: Image.memory(
            bytes,
            fit: BoxFit.contain,
            semanticLabel: 'Cover of ${book.title}',
            errorBuilder: (_, _, _) => _drawn(),
          ),
        );
      } on FormatException {
        // drawn below
      }
    }
    return _drawn();
  }

  Widget _drawn() {
    Color accent;
    try {
      accent = Color(int.parse(book.accent.substring(1), radix: 16) | 0xFF000000);
    } on FormatException {
      accent = const Color(0xFFB4532A);
    }
    final light = ThemeData.estimateBrightnessForColor(accent) == Brightness.dark;
    final ink = light ? Colors.white : Colors.black;
    return Semantics(
      label: 'Cover: ${book.title}${book.author.isEmpty ? '' : ' by ${book.author}'}',
      child: Container(
        color: accent,
        alignment: Alignment.center,
        padding: const EdgeInsets.all(24),
        child: ExcludeSemantics(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                book.title.isEmpty ? 'Untitled' : book.title,
                textAlign: TextAlign.center,
                style: look.body.copyWith(
                  color: ink,
                  fontSize: (look.body.fontSize ?? 18) * 2,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (book.author.isNotEmpty) ...[
                const SizedBox(height: 24),
                Text(
                  book.author,
                  textAlign: TextAlign.center,
                  style: look.body.copyWith(color: ink),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The ebook's contents page: every part and chapter, each one a button to it.
class ContentsList extends StatelessWidget {
  const ContentsList({super.key, required this.book, required this.look, required this.onJump, this.current});
  final Book book;
  final BookLook look;
  final ValueChanged<int> onJump;
  final int? current;

  @override
  Widget build(BuildContext context) {
    final entries = [
      for (final (i, s) in book.sections.indexed)
        if (s.kind == SectionKind.part ||
            s.kind == SectionKind.chapter ||
            s.kind == SectionKind.acknowledgements ||
            s.kind == SectionKind.about)
          (i, s),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, s) in entries)
          Padding(
            padding: EdgeInsets.only(left: 16.0 * s.depth),
            child: TextButton(
              style: TextButton.styleFrom(alignment: Alignment.centerLeft, foregroundColor: look.foreground),
              onPressed: () => onJump(i),
              child: Text(
                s.showsLabel ? '${s.label}: ${s.title}' : s.title,
                style: look.body.copyWith(fontWeight: i == current ? FontWeight.bold : null),
              ),
            ),
          ),
      ],
    );
  }
}

/// The book a page at a time: each section starts a new page, and pages are measured from the text as it is drawn. The
/// arrow keys, Page Up and Page Down, a swipe, or the buttons turn them.
class PagedBook extends StatefulWidget {
  const PagedBook({
    super.key,
    required this.book,
    required this.look,
    required this.place,
    required this.onPlace,
    this.startFraction,
  });
  final Book book;
  final BookLook look;
  final ReaderPlace place;

  /// When reopening at a remembered place: how far through the place's section to open, which becomes a page once
  /// the section has been laid out on this screen.
  final double? startFraction;

  /// A new place, with how far through the section it is (0 to 1).
  final void Function(ReaderPlace place, double fraction) onPlace;

  @override
  State<PagedBook> createState() => _PagedBookState();
}

class _PagedBookState extends State<PagedBook> {
  final _cache = <int, List<List<PagePart>>>{};
  final _items = <int, List<FlowItem>>{};
  Object? _cacheKey;
  final _focus = FocusNode(debugLabel: 'book pages');
  late double? _start = widget.startFraction;

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  List<FlowItem> _itemsOf(int section) =>
      _items[section] ??= sectionItems(widget.book, widget.book.sections[section], widget.look);

  List<List<PagePart>> _pagesOf(int section, Size size, TextScaler scaler) {
    final key = (widget.book, widget.look, size, scaler);
    if (key != _cacheKey) {
      _cache.clear();
      _items.clear();
      _cacheKey = key;
    }
    final kind = widget.book.sections[section].kind;
    if (kind == SectionKind.cover || kind == SectionKind.contents) return const [[]];
    return _cache[section] ??= paginate(_itemsOf(section), size, scaler);
  }

  void _go(int delta, Size size, TextScaler scaler) {
    final sections = widget.book.sections;
    var (:section, :page) = widget.place;
    final pages = _pagesOf(section, size, scaler).length;
    if (delta > 0) {
      if (page + 1 < pages) {
        page++;
      } else if (section + 1 < sections.length) {
        section++;
        page = 0;
      } else {
        return;
      }
    } else {
      if (page > 0) {
        page--;
      } else if (section > 0) {
        section--;
        page = _pagesOf(section, size, scaler).length - 1;
      } else {
        return;
      }
    }
    final count = _pagesOf(section, size, scaler).length;
    widget.onPlace((section: section, page: page), count <= 1 ? 0 : page / (count - 1));
  }

  @override
  Widget build(BuildContext context) {
    final look = widget.look;
    final scaler = MediaQuery.textScalerOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        const controls = 48.0;
        final margin = constraints.maxWidth < 420 ? 16.0 : 32.0;
        final width = look.columnWidth(constraints.maxWidth - margin * 2);
        final size = Size(
          width,
          (constraints.maxHeight - margin * 2 - controls).clamp(look.lineHeight * 3, double.infinity),
        );
        final sections = widget.book.sections;
        final section = widget.place.section.clamp(0, sections.length - 1);
        final pages = _pagesOf(section, size, scaler);
        if (_start != null) {
          final fraction = _start!;
          _start = null;
          final opened = pages.length <= 1 ? 0 : (fraction * (pages.length - 1)).round();
          if (opened != widget.place.page) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) widget.onPlace((section: section, page: opened), fraction);
            });
          }
        }
        final page = widget.place.page.clamp(0, pages.length - 1);
        final s = sections[section];
        final atStart = section == 0 && page == 0;
        final atEnd = section == sections.length - 1 && page == pages.length - 1;
        Widget content;
        if (s.kind == SectionKind.cover) {
          content = BookCover(book: widget.book, look: look);
        } else if (s.kind == SectionKind.contents) {
          content = SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    'Contents',
                    textAlign: TextAlign.center,
                    style: look.body.copyWith(fontSize: (look.body.fontSize ?? 18) * 1.5),
                  ),
                ),
                const SizedBox(height: 16),
                ContentsList(book: widget.book, look: look, onJump: (i) => widget.onPlace((section: i, page: 0), 0)),
              ],
            ),
          );
        } else {
          final items = _itemsOf(section);
          // A page holds what fits; only a block taller than a whole page (a long title at a large size on a small
          // screen) is more, and then the page scrolls rather than cutting it off.
          content = SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final part in pages[page]) drawPart(items[part.item], part)],
            ),
          );
        }
        return Focus(
          focusNode: _focus,
          autofocus: true,
          onKeyEvent: (node, event) {
            if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
            final key = event.logicalKey;
            if (key == LogicalKeyboardKey.arrowRight ||
                key == LogicalKeyboardKey.pageDown ||
                key == LogicalKeyboardKey.space) {
              _go(1, size, scaler);
              return KeyEventResult.handled;
            }
            if (key == LogicalKeyboardKey.arrowLeft || key == LogicalKeyboardKey.pageUp) {
              _go(-1, size, scaler);
              return KeyEventResult.handled;
            }
            return KeyEventResult.ignored;
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => _focus.requestFocus(),
            onHorizontalDragEnd: (d) {
              final v = d.primaryVelocity ?? 0;
              if (v < -200) _go(1, size, scaler);
              if (v > 200) _go(-1, size, scaler);
            },
            child: Column(
              children: [
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(margin),
                    child: Center(
                      child: SizedBox(
                        width: s.kind == SectionKind.cover ? null : width,
                        height: size.height,
                        child: Semantics(
                          container: true,
                          label: 'Page ${page + 1} of ${pages.length}: ${s.title}',
                          child: DefaultTextStyle(style: look.body, child: content),
                        ),
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  height: controls,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        tooltip: 'Previous page',
                        color: look.foreground,
                        onPressed: atStart ? null : () => _go(-1, size, scaler),
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Flexible(
                        child: Text(
                          pages.length > 1 ? '${s.title} · page ${page + 1} of ${pages.length}' : s.title,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: look.muted, fontSize: 13),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Next page',
                        color: look.foreground,
                        onPressed: atEnd ? null : () => _go(1, size, scaler),
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// The book in one long column, a section after another.
class ScrolledBook extends StatefulWidget {
  const ScrolledBook({super.key, required this.book, required this.look, required this.place, required this.onPlace});
  final Book book;
  final BookLook look;
  final ReaderPlace place;
  final void Function(ReaderPlace place, double fraction) onPlace;

  @override
  State<ScrolledBook> createState() => _ScrolledBookState();
}

class _ScrolledBookState extends State<ScrolledBook> {
  final _keys = <int, GlobalKey>{};
  late final _controller = ScrollController();
  int _shown = -1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _jump(widget.place.section));
  }

  @override
  void didUpdateWidget(ScrolledBook old) {
    super.didUpdateWidget(old);
    if (widget.place.section != _shown) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _jump(widget.place.section));
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _jump(int section) {
    _shown = section;
    final context = _keys[section]?.currentContext;
    if (context != null) Scrollable.ensureVisible(context);
  }

  @override
  Widget build(BuildContext context) {
    final look = widget.look;
    final book = widget.book;
    return LayoutBuilder(
      builder: (context, constraints) {
        final margin = constraints.maxWidth < 420 ? 16.0 : 32.0;
        final width = look.columnWidth(constraints.maxWidth - margin * 2);
        return NotificationListener<ScrollEndNotification>(
          onNotification: (_) {
            // The first section whose top is on screen is where the reader is.
            for (var i = 0; i < book.sections.length; i++) {
              final box = _keys[i]?.currentContext?.findRenderObject() as RenderBox?;
              if (box == null || !box.attached) continue;
              final top = box.localToGlobal(Offset.zero).dy;
              if (top + box.size.height > 0) {
                if (i != widget.place.section) {
                  _shown = i;
                  widget.onPlace((section: i, page: 0), 0);
                }
                break;
              }
            }
            return false;
          },
          child: SingleChildScrollView(
            controller: _controller,
            padding: EdgeInsets.symmetric(horizontal: margin, vertical: margin),
            child: Center(
              child: SizedBox(
                width: width,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final (i, s) in book.sections.indexed)
                      Padding(
                        key: _keys[i] ??= GlobalKey(),
                        padding: EdgeInsets.only(bottom: look.lineHeight * 3),
                        child: switch (s.kind) {
                          SectionKind.cover => SizedBox(
                            height: width * 1.4,
                            child: BookCover(book: book, look: look),
                          ),
                          SectionKind.contents => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Semantics(
                                header: true,
                                child: Text(
                                  'Contents',
                                  textAlign: TextAlign.center,
                                  style: look.body.copyWith(fontSize: (look.body.fontSize ?? 18) * 1.5),
                                ),
                              ),
                              ContentsList(
                                book: book,
                                look: look,
                                onJump: (j) => widget.onPlace((section: j, page: 0), 0),
                              ),
                            ],
                          ),
                          _ => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final (j, item) in sectionItems(book, s, look).indexed)
                                drawPart(item, (
                                  item: j,
                                  start: 0,
                                  end: item.text.length,
                                  spaceBefore: item.spaceBefore,
                                )),
                            ],
                          ),
                        },
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// A web serial: one chapter at a time, as posted online, with the author's notes before and after and links to the
/// chapters either side. Always scrolls.
class SerialBook extends StatelessWidget {
  const SerialBook({super.key, required this.book, required this.look, required this.place, required this.onPlace});
  final Book book;
  final BookLook look;
  final ReaderPlace place;
  final void Function(ReaderPlace place, double fraction) onPlace;

  @override
  Widget build(BuildContext context) {
    final chapters = [
      for (final (i, s) in book.sections.indexed)
        if (s.kind == SectionKind.chapter) i,
    ];
    if (chapters.isEmpty) {
      return Center(child: Text('No chapters yet.', style: look.body));
    }
    final at = chapters.contains(place.section) ? chapters.indexOf(place.section) : 0;
    final s = book.sections[chapters[at]];
    Widget note(String text, String label) => Semantics(
      label: label,
      container: true,
      child: Container(
        margin: EdgeInsets.symmetric(vertical: look.lineHeight * 0.75),
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        decoration: BoxDecoration(
          border: Border(left: BorderSide(color: look.muted, width: 3)),
        ),
        child: Text(
          text,
          style: look.body.copyWith(fontStyle: FontStyle.italic, color: look.muted),
        ),
      ),
    );
    final previous = at > 0 ? book.sections[chapters[at - 1]] : null;
    final next = at + 1 < chapters.length ? book.sections[chapters[at + 1]] : null;
    Widget nav() => Wrap(
      alignment: WrapAlignment.spaceBetween,
      spacing: 8,
      runSpacing: 8,
      children: [
        OutlinedButton.icon(
          onPressed: previous == null ? null : () => onPlace((section: chapters[at - 1], page: 0), 0),
          icon: const Icon(Icons.chevron_left),
          label: Text(previous == null ? 'Previous' : 'Previous: ${previous.title}', overflow: TextOverflow.ellipsis),
        ),
        OutlinedButton.icon(
          onPressed: next == null ? null : () => onPlace((section: chapters[at + 1], page: 0), 0),
          icon: const Icon(Icons.chevron_right),
          label: Text(next == null ? 'Next' : 'Next: ${next.title}', overflow: TextOverflow.ellipsis),
        ),
      ],
    );
    final items = sectionItems(book, s, look);
    return LayoutBuilder(
      builder: (context, constraints) {
        final margin = constraints.maxWidth < 420 ? 16.0 : 32.0;
        return SingleChildScrollView(
          key: ValueKey('serial:${s.id}'),
          padding: EdgeInsets.all(margin),
          child: Center(
            child: SizedBox(
              width: look.columnWidth(constraints.maxWidth - margin * 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  nav(),
                  for (final (j, item) in items.take(s.showsLabel ? 2 : 1).indexed)
                    drawPart(item, (
                      item: j,
                      start: 0,
                      end: item.text.length,
                      spaceBefore: j == 0 ? look.lineHeight : item.spaceBefore,
                    )),
                  if (s.noteBefore.isNotEmpty) note(s.noteBefore, 'Author’s note before the chapter'),
                  for (final (j, item) in items.skip(s.showsLabel ? 2 : 1).indexed)
                    drawPart(item, (item: j, start: 0, end: item.text.length, spaceBefore: item.spaceBefore)),
                  if (s.noteAfter.isNotEmpty) note(s.noteAfter, 'Author’s note after the chapter'),
                  SizedBox(height: look.lineHeight),
                  nav(),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
