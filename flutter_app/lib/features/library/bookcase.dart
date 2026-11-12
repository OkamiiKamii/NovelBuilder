import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/novel_art.dart';
import '../../shared/domain/collab/review_files.dart';
import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import 'book_opening.dart';
import 'bookshelf.dart';
import 'cover_art.dart';

/// THE BOOKCASE: the library as spines standing on wooden shelves, so a long shelf of novels is seen at a glance. Each
/// spine carries the book's colour, its title down the spine in the vault's capitals and its author's initials at the
/// foot; a pinned book has a ribbon. Pressing a spine takes the book off the shelf: its jacket, details and every
/// action, large (`showBookInHand`). The Covers view is one press away on the toolbar.

/// A spine's width: from the book's id, so each keeps its own and the row looks like books, not bars. Never under the
/// 48 pixels a finger needs.
double spineWidth(Novel novel) {
  var h = 0;
  for (final c in novel.id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return 48.0 + (h % 5) * 4;
}

/// Up to three initials of the author, for the spine's foot: "R. Gonzalez" is "RG".
String authorInitials(String author) => author
    .split(RegExp(r'[\s.]+'))
    .where((w) => w.isNotEmpty && RegExp(r'^\p{L}', unicode: true).hasMatch(w))
    .take(3)
    .map((w) => w.characters.first.toUpperCase())
    .join();

class Bookcase extends StatelessWidget {
  const Bookcase({super.key, required this.novels});
  final List<Novel> novels;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 600;
    final height = compact ? 190.0 : 230.0;
    return LayoutBuilder(
      builder: (context, box) {
        const gap = 3.0;
        const inset = 14.0;
        // Books fill a shelf left to right; the next shelf takes what does not fit.
        final rows = <List<Novel>>[];
        var used = double.infinity;
        for (final n in novels) {
          final w = spineWidth(n);
          if (used + w + gap > box.maxWidth - inset * 2) {
            rows.add([]);
            used = 0;
          }
          rows.last.add(n);
          used += w + gap;
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final row in rows)
              _Shelf(
                inset: inset,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (final n in row) ...[
                      Spine(key: ValueKey('spine:${n.id}'), novel: n, height: height - (spineWidth(n) % 3) * 6),
                      const SizedBox(width: gap),
                    ],
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// One shelf: the back of the case behind the books and the plank they stand on, in the wood of the theme.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.child, required this.inset});
  final Widget child;
  final double inset;

  @override
  Widget build(BuildContext context) {
    // The theme's bookcase (`novel_art.dart`): wood, or dark metal lit along its edge.
    final art = NovelArt.of(context);
    final dark = art.dark;
    final wood = art.plank;
    final back = art.shelfBack;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [back, Color.lerp(back, Colors.black, dark ? 0.25 : 0.08)!],
            ),
          ),
          child: Padding(padding: EdgeInsets.fromLTRB(inset, 18, inset, 0), child: child),
        ),
        // The plank: a lit front edge, its face, and the shadow it throws on the shelf below.
        Container(
          height: 14,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color.lerp(wood, Colors.white, 0.18)!, wood, Color.lerp(wood, Colors.black, 0.35)!],
              stops: const [0, 0.3, 1],
            ),
            border: art.plankLight == null ? null : Border(top: BorderSide(color: art.plankLight!, width: 1.5)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: dark ? 0.6 : 0.25),
                blurRadius: 6,
                offset: const Offset(0, 4),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

/// A book standing on the shelf: rounded like a bound spine, with gilt bands, its title down it and the author's
/// initials at its foot. It rises a little under the pointer; pressing it takes the book off the shelf.
class Spine extends ConsumerStatefulWidget {
  const Spine({super.key, required this.novel, required this.height});
  final Novel novel;
  final double height;

  @override
  ConsumerState<Spine> createState() => _SpineState();
}

class _SpineState extends ConsumerState<Spine> {
  bool _raised = false;
  final _spine = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final novel = widget.novel;
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final colour = accentOf(novel);
    // The theme's spine (`novel_art.dart`); the book's colour is the author's either way.
    final look = NovelArt.of(context).spine(colour);
    final ink = look.ink;
    final width = spineWidth(novel);
    final review = ReviewMark.of(novel.raw) != null;
    final initials = authorInitials(novel.author);
    final noMotion = MediaQuery.disableAnimationsOf(context);

    final spine = Container(
      key: _spine,
      width: width,
      height: widget.height,
      // Clipped to its rounding only where the system style caps it in the book's colour.
      clipBehavior: look.core == null ? Clip.none : Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(3), bottom: Radius.circular(2)),
        // Light across the middle and dark at both edges, as on a rounded spine.
        gradient: LinearGradient(colors: look.ground, stops: const [0, 0.35, 0.65, 1]),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: _raised ? 0.45 : 0.3),
            blurRadius: _raised ? 8 : 3,
            offset: const Offset(1, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // The system style: the book's own colour as a cap at the head of the spine (and at its foot).
          if (look.core case final core?) Container(height: 4, color: core),
          SizedBox(height: look.core == null ? 10 : 6),
          _Bands(ink: look.bands),
          // The book's motif, small, under the head bands (`cover_art.dart`).
          const SizedBox(height: 8),
          SizedBox.square(
            dimension: 14,
            child: CustomPaint(
              painter: SpineEmblemPainter(motif: motifOf(novel), ink: look.emblem),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              // Down the spine, top to bottom, as English-language books are lettered; shrunk to fit, never cut.
              child: RotatedBox(
                quarterTurns: 1,
                child: Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      title.toUpperCase(),
                      maxLines: 1,
                      textScaler: TextScaler.noScaling,
                      style: vaultHeading(context, size: 15, weight: 700, color: ink),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (initials.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                initials,
                textScaler: TextScaler.noScaling,
                style: vaultText(context, size: 12, color: ink.withValues(alpha: 0.9)),
              ),
            ),
          _Bands(ink: look.bands),
          SizedBox(height: look.core == null ? 8 : 4),
          if (look.core case final core?) Container(height: 4, color: core),
        ],
      ),
    );

    return Semantics(
      button: true,
      label: [
        title,
        if (novel.author.isNotEmpty) novel.author,
        novel.status.label,
        if (novel.pinned) 'Pinned',
        if (review) 'Review copy',
      ].join(', '),
      hint: 'Takes the book off the shelf',
      // Its own node, never merged into the shelf around it: each book is read and pressed alone.
      container: true,
      onTap: () => showBookInHand(context, ref, novel, from: _spine),
      excludeSemantics: true,
      child: Tooltip(
        message: title,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: () => showBookInHand(context, ref, novel, from: _spine),
            onHover: (h) => setState(() => _raised = h),
            onFocusChange: (f) => setState(() => _raised = f),
            borderRadius: BorderRadius.circular(3),
            child: AnimatedSlide(
              offset: Offset(0, _raised ? -0.04 : 0),
              duration: noMotion ? Duration.zero : const Duration(milliseconds: 140),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  spine,
                  if (novel.pinned)
                    // A ribbon marker hanging over the top of the book.
                    Positioned(
                      right: 8,
                      top: -2,
                      child: Container(
                        width: 8,
                        height: 26,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          borderRadius: const BorderRadius.vertical(bottom: Radius.circular(1)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Two thin bands across the spine: gilt, or the system style's gold rules.
class _Bands extends StatelessWidget {
  const _Bands({required this.ink});
  final Color ink;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Container(height: 1.5, margin: const EdgeInsets.symmetric(horizontal: 5), color: ink),
      const SizedBox(height: 3),
      Container(height: 1.5, margin: const EdgeInsets.symmetric(horizontal: 5), color: ink),
    ],
  );
}

/// The book off the shelf: its jacket large beside its title, author, status, genres and synopsis, with Open first
/// and then everything its menu holds. The action runs once the book is put down, from the library's own page.
Future<void> showBookInHand(BuildContext context, WidgetRef ref, Novel novel, {GlobalKey? from}) async {
  final action = await showDialog<String>(
    context: context,
    useRootNavigator: true,
    builder: (context) => _BookInHand(novel: novel),
  );
  if (action == null || !context.mounted) return;
  if ((action == 'open' || action == 'start') && from != null) {
    // The book opens from its place on the shelf.
    openWithBook(context, ref, novel, from: from, go: () => runBookAction(context, ref, novel, action));
  } else {
    runBookAction(context, ref, novel, action);
  }
}

class _BookInHand extends StatelessWidget {
  const _BookInHand({required this.novel});
  final Novel novel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final narrow = MediaQuery.sizeOf(context).width < 600;
    final genres = [novel.primaryGenre, ...novel.secondaryGenres].where((g) => g.isNotEmpty).join(', ');
    final all = bookActions(novel);
    final startable = all.any((a) => a.$1 == 'start');
    final actions = all.where((a) => a.$1 != 'open' && a.$1 != 'start').toList();
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: vaultHeading(context, size: 22, weight: 700, color: theme.colorScheme.onSurface)),
        ),
        if (novel.subtitle.isNotEmpty)
          Text(novel.subtitle, style: vaultText(context, size: 17, style: FontStyle.italic)),
        if (novel.author.isNotEmpty) Text(novel.author, style: vaultText(context, size: 17)),
        const SizedBox(height: 6),
        Text(
          [novel.status.label, if (genres.isNotEmpty) genres].join(' · '),
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        if (novel.synopsis.trim().isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            novel.synopsis.trim(),
            maxLines: 6,
            overflow: TextOverflow.ellipsis,
            style: vaultText(context, size: 16),
          ),
        ],
      ],
    );
    return Dialog(
      insetPadding: EdgeInsets.all(narrow ? 16 : 40),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (narrow) ...[
                Center(child: BookJacket(novel: novel, width: 130)),
                const SizedBox(height: 16),
                details,
              ] else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    BookJacket(novel: novel, width: 160),
                    const SizedBox(width: 22),
                    Expanded(child: details),
                  ],
                ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  // An idea's first press is to start writing it; Open stays beside it.
                  if (startable)
                    FilledButton.icon(
                      autofocus: true,
                      onPressed: () => Navigator.of(context).pop('start'),
                      icon: const Icon(Icons.edit_note),
                      label: const Text('Start writing it'),
                    ),
                  (startable ? OutlinedButton.icon : FilledButton.icon)(
                    autofocus: !startable,
                    onPressed: () => Navigator.of(context).pop('open'),
                    icon: const Icon(Icons.menu_book),
                    label: Text('Open $title'),
                  ),
                  for (final (value, label) in actions)
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(value),
                      style: value == 'delete' ? TextButton.styleFrom(foregroundColor: theme.colorScheme.error) : null,
                      child: Text(label),
                    ),
                  TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back on the shelf')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
