import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_theme.dart';
import '../../app/theme/book_faces.dart';
import '../../app/theme/novel_art.dart';
import '../../core/format.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collab/review_files.dart';
import '../../shared/domain/manuscript/prose.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import '../workspace/open_novel.dart';
import '../write/writing_prefs.dart';
import 'backup_actions.dart';
import 'book_opening.dart';
import 'cover_art.dart';
import 'cover_picker.dart';
import 'library_actions.dart';

/// THE BOOKSHELF: the library as books, not records. Each novel is a jacket (its cover picture, or one designed from
/// its title, author and colour) on a shelf that fills the width; the book you were last in waits at the top, one
/// press from the chapter you were writing.

/// The chapter or scene last open in [novel]'s editor on this device, when it is still there.
StoryNode? lastChapterOf(WidgetRef ref, Novel novel) {
  final id = ref.read(settingsStoreProvider).read('write.lastNode.${novel.id}');
  if (id is! String) return null;
  final row = ref.read(novelStoreProvider).row(novel.id, 'chapters', id);
  return row == null ? null : StoryNode(row);
}

/// A novel's cover colour, from its stored `#rrggbb` (the app's rust when it cannot be read).
Color accentOf(Novel novel) {
  try {
    return Color(int.parse(novel.accent.substring(1), radix: 16) | 0xFF000000);
  } on FormatException {
    return const Color(0xFFB4532A);
  } on RangeError {
    return const Color(0xFFB4532A);
  }
}

/// A book's jacket: its cover picture when it has one; otherwise a cover designed from its title and author, in the
/// theme's way of drawing books (`novel_art.dart`): on the book's colour with a thin rule inside the edge (the book's
/// themes), or near-black framed in gold with the book's colour down its spine edge (System Monolith). 2 : 3.
class BookJacket extends StatelessWidget {
  const BookJacket({super.key, required this.novel, required this.width});
  final Novel novel;
  final double width;

  @override
  Widget build(BuildContext context) {
    final height = width * 1.5;
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final bytes = coverBytes(novel.cover);
    final accent = accentOf(novel);
    // The theme's way of drawing a book (`novel_art.dart`); the book's colour is the author's either way.
    final art = NovelArt.of(context);
    final look = art.bound(accent);
    final ink = look.ink;
    final lettering = Column(
      children: [
        const Spacer(),
        _Lettering(
          title,
          maxLines: 4,
          overflow: TextOverflow.ellipsis,
          style: vaultHeading(context, size: width * 0.1, color: ink, weight: 700),
        ),
        if (art.system) ...[
          SizedBox(height: width * 0.04),
          Container(width: width * 0.22, height: 1.5, color: look.frame),
        ],
        if (novel.subtitle.isNotEmpty) ...[
          SizedBox(height: width * 0.04),
          _Lettering(
            novel.subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: vaultText(context, size: width * 0.075, color: ink.withValues(alpha: 0.85)),
          ),
        ],
        const Spacer(),
        if (novel.author.isNotEmpty)
          _Lettering(
            novel.author,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: vaultText(
              context,
              size: width * 0.075,
              color: art.system ? MonolithTokens.textSecondary : ink.withValues(alpha: 0.9),
            ),
          ),
        // The system style signs the jacket off with a status line, as its windows are (at the foot, clear of the
        // shelf's menu button over the top corner).
        if (art.system && width >= 90) ...[
          SizedBox(height: width * 0.03),
          Text(
            'NOVEL · ${novel.status.label.toUpperCase()}',
            maxLines: 1,
            overflow: TextOverflow.fade,
            softWrap: false,
            style: TextStyle(
              fontFamily: BookFaces.of(context).numbers,
              fontSize: width * 0.05,
              letterSpacing: width * 0.006,
              color: look.motif,
            ),
          ),
        ],
      ],
    );
    final framed = Padding(
      padding: EdgeInsets.all(width * 0.06),
      child: CustomPaint(
        foregroundPainter: art.system ? BracketsPainter(look.motif, arm: width * 0.08) : null,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: art.system ? look.frame.withValues(alpha: 0.6) : look.frame),
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: width * 0.06, vertical: width * 0.1),
            child: lettering,
          ),
        ),
      ),
    );
    final designed = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: look.ground),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // The system style: the book's own colour as a glow behind the title.
          if (look.band case final band?)
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -0.15),
                  radius: 0.75,
                  colors: [band.withValues(alpha: 0.32), band.withValues(alpha: 0)],
                ),
              ),
            ),
          // The book's own motif, faint, behind its frame and lettering (`cover_art.dart`).
          CustomPaint(
            painter: CoverArtPainter(motif: motifOf(novel), seed: coverSeed(novel.id), ink: look.motif),
            child: framed,
          ),
        ],
      ),
    );
    return ExcludeSemantics(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: art.system
              ? BorderRadius.circular(2)
              : const BorderRadius.horizontal(left: Radius.circular(3), right: Radius.circular(6)),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(2, 4)),
          ],
        ),
        // A cover picture is the author's and is shown as it is; the system style frames it in gold.
        foregroundDecoration: art.system && bytes != null
            ? BoxDecoration(border: Border.all(color: look.frame.withValues(alpha: 0.8)))
            : null,
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (bytes == null)
              designed
            else
              Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true, errorBuilder: (_, _, _) => designed),
            if (look.band case final band? when bytes == null)
              // The system style: the book's own colour down the spine edge.
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: width * 0.055,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color.lerp(band, Colors.white, 0.15)!, band, Color.lerp(band, Colors.black, 0.4)!],
                    ),
                  ),
                ),
              )
            else
              // The spine's shadow on the left, as on a real book.
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: width * 0.05,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [Colors.black.withValues(alpha: 0.35), Colors.transparent]),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// "Pick up where you left off": the book last opened, large, with the chapter it was left at, **the last lines written
/// there** on a sheet of the author's own page colour (ending in a caret where the next word goes), and one press back
/// into it with the caret after the last word. An empty chapter shows a blank page waiting.
class ContinueWriting extends ConsumerStatefulWidget {
  const ContinueWriting({super.key, required this.novel});
  final Novel novel;

  @override
  ConsumerState<ContinueWriting> createState() => _ContinueWritingState();
}

class _ContinueWritingState extends ConsumerState<ContinueWriting> {
  final _jacket = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final novel = widget.novel;
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final chapter = lastChapterOf(ref, novel);
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final narrow = MediaQuery.sizeOf(context).width < 600;
    final closing = chapter == null
        ? null
        : closingWords(
            ref.read(novelStoreProvider).row(novel.id, 'chapterContents', chapter.id)?['doc'],
            max: narrow ? 220 : 340,
          );
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Pick up where you left off', style: vaultHeading(context, size: 13)),
        const SizedBox(height: 8),
        Semantics(
          header: true,
          child: Text(
            title,
            style: vaultHeading(context, size: narrow ? 20 : 30, color: theme.colorScheme.onSurface, weight: 700),
          ),
        ),
        if (novel.author.isNotEmpty) Text(novel.author, style: vaultText(context, size: 18)),
        const SizedBox(height: 8),
        Text(
          chapter == null
              ? 'Opened ${formatRelative(context, novel.lastOpenedAt)}'
              : '${chapter.displayTitle} · opened ${formatRelative(context, novel.lastOpenedAt)}',
          style: muted,
        ),
      ],
    );
    final button = FilledButton.icon(
      onPressed: () => openWithBook(
        context,
        ref,
        novel,
        from: _jacket,
        chapter: chapter?.displayTitle,
        go: chapter == null
            ? () => openNovel(context, ref, novel)
            : () => continueWritingFlow(context, ref, novel, chapter),
      ),
      icon: const Icon(Icons.edit_note),
      label: Text(chapter == null ? 'Continue writing' : 'Continue writing “${chapter.displayTitle}”'),
    );
    final page = closing == null ? null : LastPage(closing: closing);
    // On a phone the page runs the full width under the jacket; wider, it sits beside the jacket under the title.
    return VaultFrame(
      padding: EdgeInsets.all(narrow ? 14 : 20),
      child: narrow
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    BookJacket(key: _jacket, novel: novel, width: 86),
                    const SizedBox(width: 16),
                    Expanded(child: heading),
                  ],
                ),
                if (page != null) ...[const SizedBox(height: 14), page],
                const SizedBox(height: 14),
                button,
              ],
            )
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BookJacket(key: _jacket, novel: novel, width: 150),
                const SizedBox(width: 28),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      heading,
                      if (page != null) ...[const SizedBox(height: 14), page],
                      const SizedBox(height: 16),
                      button,
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

/// The last lines written, on a sheet of the page colour the author writes on (or the theme's paper), set in the
/// book face, the start fading in when earlier text is left out, and a caret after the last word where the writing
/// stopped. A blank chapter is a blank sheet with the caret alone. Reads only; never changes the text.
class LastPage extends ConsumerWidget {
  const LastPage({super.key, required this.closing});
  final ({String text, bool cut}) closing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final prefs = ref.watch(writingPrefsProvider)[deviceFormOf(context)]!;
    final colours = pageColors(prefs.page);
    // Without a chosen colour, paper a touch lighter than the frame around it, so it reads as a fresh sheet.
    final paper =
        colours?.background ??
        (dark ? scheme.surfaceContainerHigh : Color.lerp(scheme.surfaceContainerLowest, Colors.white, 0.7)!);
    final ink = colours?.text ?? scheme.onSurface;
    final blank = closing.text.isEmpty;
    final style = vaultText(context, size: 17, color: ink).copyWith(height: 1.5);
    // On a phone the page is a glimpse, not a reading: paragraphs run line after line, without the blank lines between
    // them, and only the last few lines show, so the shelves are not pushed a screen down.
    final narrow = MediaQuery.sizeOf(context).width < 600;
    final shown = narrow ? closing.text.replaceAll(RegExp(r'\n\s*\n+'), '\n') : closing.text;
    final lineHeight = MediaQuery.textScalerOf(context).scale(style.fontSize ?? 17) * (style.height ?? 1.5);
    final words = Text.rich(
      TextSpan(
        children: [
          if (closing.cut) const TextSpan(text: '…'),
          if (blank)
            TextSpan(
              text: 'A blank page. ',
              style: style.copyWith(fontStyle: FontStyle.italic, color: colours?.muted ?? scheme.onSurfaceVariant),
            )
          else
            TextSpan(text: '$shown '),
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: _Caret(color: scheme.primary, height: (style.fontSize ?? 17) * 1.2),
          ),
        ],
      ),
      style: style,
    );
    return Semantics(
      container: true,
      label: blank ? 'The chapter is a blank page' : 'The last lines you wrote: ${closing.text}',
      excludeSemantics: true,
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(maxWidth: 680),
        padding: const EdgeInsets.fromLTRB(22, 16, 22, 18),
        decoration: BoxDecoration(
          color: paper,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: dark ? 0.6 : 0.45)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: dark ? 0.4 : 0.08),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: narrow
            ? LayoutBuilder(
                builder: (context, box) {
                  // Five lines at most, the last ones: the page is shown from its foot, the lines above faded.
                  final max = lineHeight * 5 + 4;
                  final painter = TextPainter(
                    text: TextSpan(text: '${closing.cut ? '…' : ''}$shown  ', style: style),
                    textDirection: Directionality.of(context),
                    textScaler: MediaQuery.textScalerOf(context),
                  )..layout(maxWidth: box.maxWidth);
                  final over = painter.height > max;
                  painter.dispose();
                  final page = over
                      ? SizedBox(
                          height: max,
                          child: ClipRect(
                            child: OverflowBox(
                              alignment: Alignment.bottomLeft,
                              maxHeight: double.infinity,
                              child: words,
                            ),
                          ),
                        )
                      : words;
                  return over || closing.cut ? _fadeIn(page) : page;
                },
              )
            : closing.cut
            ? _fadeIn(words)
            : words,
      ),
    );
  }

  /// The text runs on from above: its first lines fade in, as if the page were turned to its foot.
  static Widget _fadeIn(Widget child) => ShaderMask(
    blendMode: BlendMode.dstIn,
    shaderCallback: (rect) => const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0x33000000), Color(0xFF000000)],
      stops: [0, 0.45],
    ).createShader(rect),
    child: child,
  );
}

/// A caret where the next word goes. It blinks a few times, as an invitation, then stays lit (steady from the start
/// when the device asks for less motion), so the page is never left animating.
class _Caret extends StatefulWidget {
  const _Caret({required this.color, required this.height});
  final Color color;
  final double height;

  @override
  State<_Caret> createState() => _CaretState();
}

class _CaretState extends State<_Caret> {
  // Lit for the first half of each second, out for the second, four times; then lit. A switch every half second (eight
  // in all), so the screen is drawn eight times for it: an animation running through each second asked for every frame
  // of the four (some 240), measured on a phone, though the caret changes only at the half seconds.
  var _lit = true;
  var _switched = 0;
  Timer? _blink;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _blink?.cancel();
      _lit = true;
    } else if (_blink == null && _switched == 0) {
      _blink = Timer.periodic(const Duration(milliseconds: 500), (timer) {
        if (!mounted) return timer.cancel();
        setState(() {
          _switched++;
          _lit = _switched.isEven;
        });
        if (_switched >= 8) timer.cancel();
      });
    }
  }

  @override
  void dispose() {
    _blink?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    // Only the caret is drawn again when it switches.
    child: Opacity(
      opacity: _lit ? 1 : 0,
      child: Container(width: 2, height: widget.height, color: widget.color),
    ),
  );
}

/// One book on the shelf: its jacket (press it to open the book), its title and where it stands, and its menu.
class ShelfBook extends ConsumerStatefulWidget {
  const ShelfBook({super.key, required this.novel, required this.width});
  final Novel novel;
  final double width;

  @override
  ConsumerState<ShelfBook> createState() => _ShelfBookState();
}

class _ShelfBookState extends ConsumerState<ShelfBook> {
  final _jacket = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final novel = widget.novel;
    final width = widget.width;
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final isOpen = ref.watch(openNovelProvider) == novel.id;
    final review = ReviewMark.of(novel.raw);
    final genres = [novel.primaryGenre, ...novel.secondaryGenres].where((g) => g.isNotEmpty).join(', ');
    // The whole book opens it: jacket, title and all. Only its menu is apart, over the jacket's corner.
    final book = Semantics(
      button: true,
      label: 'Open $title',
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(6),
          onTap: () => openWithBook(context, ref, novel, from: _jacket, go: () => openNovel(context, ref, novel)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BookJacket(key: _jacket, novel: novel, width: width),
              const SizedBox(height: 8),
              Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
              Text(
                [novel.status.label, if (genres.isNotEmpty) genres].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: muted,
              ),
            ],
          ),
        ),
      ),
    );
    return SizedBox(
      width: width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              book,
              if (novel.pinned)
                Positioned(
                  left: 8,
                  top: 8,
                  child: CircleAvatar(
                    radius: 14,
                    backgroundColor: theme.colorScheme.surface.withValues(alpha: 0.9),
                    child: Icon(Icons.push_pin, size: 16, color: theme.colorScheme.primary, semanticLabel: 'Pinned'),
                  ),
                ),
              Positioned(
                right: 4,
                top: 4,
                child: Material(
                  color: theme.colorScheme.surface.withValues(alpha: 0.9),
                  shape: const CircleBorder(),
                  child: _BookMenu(novel: novel, title: title),
                ),
              ),
            ],
          ),
          if (review != null || isOpen)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  if (review != null)
                    Tooltip(
                      message: 'From ${review.ownerName}, for ${review.memberName} as ${review.role.label}',
                      child: const Chip(label: Text('Review copy'), visualDensity: VisualDensity.compact),
                    ),
                  if (isOpen) const Chip(label: Text('Open'), visualDensity: VisualDensity.compact),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// What can be done with a book, as (action, label): its menu on a cover, and its buttons when taken off the shelf.
List<(String, String)> bookActions(Novel novel) {
  final review = ReviewMark.of(novel.raw) != null;
  return [
    // An idea, or a book set aside, can become the one being written.
    if (!review && !novel.archived && (novel.status == NovelStatus.planning || novel.status == NovelStatus.onHold))
      ('start', 'Start writing it'),
    ('open', 'Open'),
    if (!review) ('edit', 'Edit details'),
    if (!novel.archived) ('pin', novel.pinned ? 'Unpin' : 'Pin to top'),
    if (!review) ('duplicate', 'Duplicate'),
    ('archive', novel.archived ? 'Restore from archive' : 'Archive'),
    ('export', 'Export backup'),
    ('delete', 'Delete…'),
  ];
}

/// Does one of [bookActions] to [novel].
void runBookAction(BuildContext context, WidgetRef ref, Novel novel, String action) => switch (action) {
  'start' => startWritingFlow(context, ref, novel),
  'open' => openNovel(context, ref, novel),
  'edit' => editNovelFlow(context, ref, novel),
  'pin' => togglePinFlow(context, ref, novel),
  'duplicate' => duplicateNovelFlow(context, ref, novel),
  'archive' => toggleArchiveFlow(context, ref, novel),
  'export' => exportBackupFlow(context, ref, novel),
  'delete' => deleteNovelFlow(context, ref, novel),
  _ => null,
};

class _BookMenu extends ConsumerWidget {
  const _BookMenu({required this.novel, required this.title});
  final Novel novel;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) => PopupMenuButton<String>(
    tooltip: 'More for $title',
    // Above everything, so a message at the bottom of the screen never covers its items.
    useRootNavigator: true,
    onSelected: (action) => runBookAction(context, ref, novel, action),
    itemBuilder: (context) => [
      for (final (value, label) in bookActions(novel)) ...[
        if (value == 'delete') const PopupMenuDivider(),
        PopupMenuItem(value: value, child: Text(label)),
      ],
    ],
  );
}

/// The books as a shelf that fills the width: as many columns as fit, never fewer than two.
class Bookshelf extends StatelessWidget {
  const Bookshelf({super.key, required this.novels});
  final List<Novel> novels;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      const gap = 20.0;
      final columns = ((box.maxWidth + gap) / (170 + gap)).floor().clamp(2, 8);
      final width = (box.maxWidth - gap * (columns - 1)) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: 24,
        children: [for (final n in novels) ShelfBook(key: ValueKey(n.id), novel: n, width: width)],
      );
    },
  );
}

/// What the library holds, in a line: books, those in progress, those complete. Words belong inside a book.
class ShelfTotals extends StatelessWidget {
  const ShelfTotals({super.key, required this.active});
  final List<Novel> active;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inProgress = active.where((n) => n.status == NovelStatus.drafting || n.status == NovelStatus.revising).length;
    final complete = active.where((n) => n.status == NovelStatus.complete).length;
    Widget pair(int value, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(formatNumber(value), style: numberStyle(context, theme.textTheme.titleMedium!)),
        const SizedBox(width: 6),
        Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      ],
    );
    return Semantics(
      container: true,
      label: 'Library totals',
      child: Wrap(
        spacing: 24,
        runSpacing: 6,
        children: [
          pair(active.length, active.length == 1 ? 'Novel' : 'Novels'),
          pair(inProgress, 'In progress'),
          pair(complete, 'Complete'),
        ],
      ),
    );
  }
}

/// The book to pick up again: the one opened last, when one has been opened and is still on the shelf.
Novel? bookToContinue(List<Novel> active) {
  Novel? best;
  for (final n in active) {
    if (n.lastOpenedAt == null) continue;
    if (best == null || n.lastOpenedAt! > best.lastOpenedAt!) best = n;
  }
  return best;
}

/// Words painted on a jacket, centred: decoration, so not text the page reads out or finds.
class _Lettering extends StatelessWidget {
  const _Lettering(this.text, {required this.maxLines, required this.overflow, required this.style});
  final String text;
  final int maxLines;
  final TextOverflow overflow;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      // Smaller lettering when the longest word would not fit a line, so no word is ever broken ("CONVERGEN / CE").
      var fitted = style;
      final widest = [
        for (final word in text.split(RegExp(r'\s+')))
          if (word.isNotEmpty)
            (TextPainter(
              text: TextSpan(text: word, style: style),
              textDirection: Directionality.of(context),
              textScaler: MediaQuery.textScalerOf(context),
              maxLines: 1,
            )..layout()).width,
      ].fold(0.0, (a, b) => a > b ? a : b);
      if (widest > box.maxWidth && widest > 0 && style.fontSize != null) {
        fitted = style.copyWith(
          fontSize: style.fontSize! * box.maxWidth / widest * 0.97,
          letterSpacing: (style.letterSpacing ?? 0) * box.maxWidth / widest * 0.97,
        );
      }
      final painter = TextPainter(
        text: TextSpan(text: text, style: fitted),
        textAlign: TextAlign.center,
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
        maxLines: maxLines,
        ellipsis: '…',
      )..layout(maxWidth: box.maxWidth);
      return SizedBox(
        width: box.maxWidth,
        height: painter.height,
        child: CustomPaint(painter: _LetteringPainter(painter)),
      );
    },
  );
}

class _LetteringPainter extends CustomPainter {
  _LetteringPainter(this.painter);
  final TextPainter painter;

  @override
  void paint(Canvas canvas, Size size) => painter.paint(canvas, Offset((size.width - painter.width) / 2, 0));

  @override
  bool shouldRepaint(_LetteringPainter old) => old.painter.text != painter.text;
}
