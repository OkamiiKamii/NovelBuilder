import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collab/review_files.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import '../workspace/open_novel.dart';
import 'backup_actions.dart';
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

Color _accentOf(Novel novel) {
  try {
    return Color(int.parse(novel.accent.substring(1), radix: 16) | 0xFF000000);
  } on FormatException {
    return const Color(0xFFB4532A);
  } on RangeError {
    return const Color(0xFFB4532A);
  }
}

/// A book's jacket: its cover picture when it has one; otherwise a cover designed from its title and author on its
/// colour, with a thin rule inside the edge, in the vault's typefaces. 2 : 3, as books are.
class BookJacket extends StatelessWidget {
  const BookJacket({super.key, required this.novel, required this.width});
  final Novel novel;
  final double width;

  @override
  Widget build(BuildContext context) {
    final height = width * 1.5;
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final bytes = coverBytes(novel.cover);
    final accent = _accentOf(novel);
    final dark = ThemeData.estimateBrightnessForColor(accent) == Brightness.dark;
    final ink = dark ? const Color(0xFFFFF8EC) : const Color(0xFF1B140E);
    final designed = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color.lerp(accent, Colors.white, 0.08)!, Color.lerp(accent, Colors.black, 0.35)!],
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(width * 0.06),
        child: DecoratedBox(
          decoration: BoxDecoration(border: Border.all(color: ink.withValues(alpha: 0.55))),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: width * 0.06, vertical: width * 0.1),
            child: Column(
              children: [
                const Spacer(),
                _Lettering(
                  title,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: vaultHeading(context, size: width * 0.1, color: ink, weight: 700),
                ),
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
                    style: vaultText(context, size: width * 0.075, color: ink.withValues(alpha: 0.9)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    return ExcludeSemantics(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.horizontal(left: Radius.circular(3), right: Radius.circular(6)),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(2, 4)),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (bytes == null)
              designed
            else
              Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true, errorBuilder: (_, _, _) => designed),
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

/// "Pick up where you left off": the book last opened, large, with the chapter it was left at and one button into it.
class ContinueWriting extends ConsumerWidget {
  const ContinueWriting({super.key, required this.novel});
  final Novel novel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final chapter = lastChapterOf(ref, novel);
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final narrow = MediaQuery.sizeOf(context).width < 600;
    final words = Column(
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
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: () => openNovel(context, ref, novel),
          icon: const Icon(Icons.edit_note),
          label: Text(chapter == null ? 'Continue writing' : 'Continue writing “${chapter.displayTitle}”'),
        ),
      ],
    );
    // Side by side at every width; on a phone the jacket is smaller, so the shelf is still in sight below.
    return VaultFrame(
      padding: EdgeInsets.all(narrow ? 14 : 20),
      child: Row(
        children: [
          BookJacket(novel: novel, width: narrow ? 86 : 150),
          SizedBox(width: narrow ? 16 : 28),
          Expanded(child: words),
        ],
      ),
    );
  }
}

/// One book on the shelf: its jacket (press it to open the book), its title and where it stands, and its menu.
class ShelfBook extends ConsumerWidget {
  const ShelfBook({super.key, required this.novel, required this.width});
  final Novel novel;
  final double width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          onTap: () => openNovel(context, ref, novel),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BookJacket(novel: novel, width: width),
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

class _BookMenu extends ConsumerWidget {
  const _BookMenu({required this.novel, required this.title});
  final Novel novel;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final review = ReviewMark.of(novel.raw) != null;
    return PopupMenuButton<String>(
      tooltip: 'More for $title',
      // Above everything, so a message at the bottom of the screen never covers its items.
      useRootNavigator: true,
      onSelected: (action) => switch (action) {
        'open' => openNovel(context, ref, novel),
        'edit' => editNovelFlow(context, ref, novel),
        'pin' => togglePinFlow(context, ref, novel),
        'duplicate' => duplicateNovelFlow(context, ref, novel),
        'archive' => toggleArchiveFlow(context, ref, novel),
        'export' => exportBackupFlow(context, ref, novel),
        'delete' => deleteNovelFlow(context, ref, novel),
        _ => null,
      },
      itemBuilder: (context) => [
        const PopupMenuItem(value: 'open', child: Text('Open')),
        if (!review) const PopupMenuItem(value: 'edit', child: Text('Edit details')),
        if (!novel.archived) PopupMenuItem(value: 'pin', child: Text(novel.pinned ? 'Unpin' : 'Pin to top')),
        if (!review) const PopupMenuItem(value: 'duplicate', child: Text('Duplicate')),
        PopupMenuItem(value: 'archive', child: Text(novel.archived ? 'Restore from archive' : 'Archive')),
        const PopupMenuItem(value: 'export', child: Text('Export backup')),
        const PopupMenuDivider(),
        const PopupMenuItem(value: 'delete', child: Text('Delete…')),
      ],
    );
  }
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
        Text(formatNumber(value), style: theme.textTheme.titleMedium),
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
      final painter = TextPainter(
        text: TextSpan(text: text, style: style),
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
