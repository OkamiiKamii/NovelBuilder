import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../app/theme/book_faces.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../exchange/export_dialog.dart';
import '../exchange/import_dialog.dart';
import '../plot/plot_providers.dart' show chapterPlanPath;
import '../workspace/open_novel.dart';
import 'day_book.dart';
import 'draft_road.dart';
import 'write_providers.dart';

/// The manuscript in reading order: volumes, acts and arcs grouping chapters and scenes. Selecting a chapter or scene
/// opens it in the editor. Every change here is to structure only; the text is never touched.
class OutlinePanel extends ConsumerWidget {
  const OutlinePanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodes = ref.watch(outlineProvider);
    final selected = ref.watch(selectedNodeProvider);
    final novelId = ref.watch(openNovelProvider)!;
    final reading = readingOrder(nodes);
    final depth = <String, int>{};
    // Chapters are numbered in reading order, as on a contents page.
    final number = <String, int>{};
    for (final n in reading) {
      depth[n.id] = n.parentId == null ? 0 : (depth[n.parentId] ?? -1) + 1;
      if (n.kind == NodeKind.chapter) number[n.id] = number.length + 1;
    }
    final total = nodes.fold(0, (sum, n) => sum + n.wordCount);
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 4, 4),
            child: Row(
              children: [
                // Headed like a printed book's contents page.
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        child: Text(
                          'Contents',
                          style: TextStyle(
                            fontFamily: BookFaces.of(context).heading,
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                            letterSpacing: 1.6,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                      ),
                      Text(
                        '${ref.watch(libraryProvider).where((n) => n.id == novelId).firstOrNull?.title ?? 'Manuscript'} · ${formatNumber(total)} words',
                        style: TextStyle(
                          fontFamily: BookFaces.of(context).text,
                          fontStyle: FontStyle.italic,
                          fontSize: 15.5,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                _AddMenu(novelId: novelId, parentId: null, label: 'Add to the manuscript'),
                PopupMenuButton<String>(
                  tooltip: 'Import and export',
                  useRootNavigator: true,
                  icon: const Icon(Icons.ios_share),
                  onSelected: (v) async {
                    switch (v) {
                      case 'export':
                        await showExportManuscriptDialog(context, novelId);
                      case 'import':
                        final created = await importManuscriptFlow(context, ref, novelId);
                        if (created != null && created.isNotEmpty) {
                          ref.read(selectedNodeProvider.notifier).select(created.first);
                        }
                      case 'page':
                        GoRouter.of(context).go('${Destination.settings.path}/import-export');
                      case 'read':
                        GoRouter.of(context).go('${Destination.write.path}/read');
                      case 'book':
                        GoRouter.of(context).go('${Destination.write.path}/book');
                    }
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'read', child: Text('Read as a book and publish…')),
                    PopupMenuItem(value: 'book', child: Text('Book details…')),
                    PopupMenuDivider(),
                    PopupMenuItem(value: 'export', child: Text('Export manuscript…')),
                    PopupMenuItem(value: 'import', child: Text('Import a manuscript…')),
                    PopupMenuItem(value: 'page', child: Text('All import and export…')),
                  ],
                ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: reading.isEmpty
                ? EmptyState(
                    icon: Icons.edit_note,
                    title: 'No chapters yet',
                    message: 'Add a chapter to start writing. Volumes, acts and arcs can group chapters later.',
                    action: FilledButton.icon(
                      onPressed: () => _create(context, ref, novelId, NodeKind.chapter, null),
                      icon: const Icon(Icons.add),
                      label: const Text('Add chapter'),
                    ),
                  )
                : ListView.builder(
                    // The day book (`day_book.dart`) and the road to the draft (`draft_road.dart`) head the contents,
                    // scrolling away with them. On a computer, beside a chapter being written, they follow the
                    // chapters instead, so the contents stay at hand.
                    itemCount: reading.length + 2,
                    itemBuilder: (context, i) {
                      final deskLast = selected != null && WindowSize.of(context) != WindowSize.compact;
                      final desk = deskLast ? i - reading.length : i;
                      if (desk == 0) return DayBookCard(novelId: novelId);
                      if (desk == 1) return DraftRoad(novelId: novelId);
                      final n = reading[deskLast ? i : i - 2];
                      return _OutlineRow(
                        node: n,
                        depth: depth[n.id] ?? 0,
                        selected: n.id == selected,
                        novelId: novelId,
                        number: number[n.id],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

IconData kindIcon(NodeKind? kind) => switch (kind) {
  NodeKind.volume => Icons.library_books_outlined,
  NodeKind.act => Icons.theater_comedy_outlined,
  NodeKind.arc => Icons.timeline,
  NodeKind.chapter => Icons.article_outlined,
  NodeKind.scene => Icons.notes,
  null => Icons.help_outline,
};

void _tell(BuildContext context, String message, {SnackBarAction? action}) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(
    SnackBar(content: Text(message), action: action, persist: false, duration: const Duration(seconds: 6)),
  );

bool _attempt(BuildContext context, void Function() change) {
  try {
    change();
    return true;
  } on OutlineException catch (e) {
    _tell(context, e.message);
  } on Object catch (e) {
    _tell(context, 'That could not be done, and nothing was changed: $e');
  }
  return false;
}

void _create(BuildContext context, WidgetRef ref, String novelId, NodeKind kind, String? parentId) {
  late StoryNode created;
  if (_attempt(
    context,
    () => created = ref.read(manuscriptServiceProvider).create(novelId, kind, parentId: parentId),
  )) {
    if (isDocument(kind)) ref.read(selectedNodeProvider.notifier).select(created.id);
  }
}

class _AddMenu extends ConsumerWidget {
  const _AddMenu({required this.novelId, required this.parentId, required this.label});

  final String novelId;
  final String? parentId;
  final String label;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kinds = [
      for (final k in NodeKind.values)
        if (canContain(null, k)) k,
    ];
    return PopupMenuButton<NodeKind>(
      tooltip: label,
      useRootNavigator: true,
      icon: const Icon(Icons.add),
      onSelected: (k) => _create(context, ref, novelId, k, parentId),
      itemBuilder: (_) => [for (final k in kinds) PopupMenuItem(value: k, child: Text('Add ${k.label.toLowerCase()}'))],
    );
  }
}

class _OutlineRow extends ConsumerWidget {
  const _OutlineRow({
    required this.node,
    required this.depth,
    required this.selected,
    required this.novelId,
    this.number,
  });

  final StoryNode node;
  final int depth;
  final bool selected;
  final String novelId;

  /// Its number among the chapters, in reading order (chapters only).
  final int? number;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final service = ref.read(manuscriptServiceProvider);
    final doc = isDocument(node.kind);
    final title = node.displayTitle;
    final menu = PopupMenuButton<String>(
      tooltip: 'More for $title',
      useRootNavigator: true,
      onSelected: (action) async {
        switch (action) {
          case 'rename':
            final t = await showTextPrompt(context, title: 'Rename', label: 'Title', initial: node.title);
            if (t != null && context.mounted) _attempt(context, () => service.rename(novelId, node.id, t));
          case 'up':
            _attempt(context, () => service.nudge(novelId, node.id, -1));
          case 'down':
            _attempt(context, () => service.nudge(novelId, node.id, 1));
          case 'move':
            await _moveTo(context, ref);
          case 'plan':
            GoRouter.of(context).go(chapterPlanPath(node.id));
          case 'duplicate':
            _attempt(context, () => service.duplicate(novelId, node.id));
          case 'merge':
            final ok = await showConfirmDialog(
              context,
              title: 'Merge with the next ${node.kindKey}?',
              message:
                  'Its text follows this one\'s, its scenes and plan come along, and anything that pointed at it points '
                  'here. Both texts are kept in their history first.',
              confirmLabel: 'Merge',
            );
            if (ok && context.mounted) _attempt(context, () => service.merge(novelId, node.id));
          case 'delete':
            final ok = await showConfirmDialog(
              context,
              title: 'Delete “$title”?',
              message:
                  'It is removed with everything inside it and its text. A restore point of the novel is kept first, '
                  'so it can be brought back.',
              confirmLabel: 'Delete',
              destructive: true,
            );
            if (!ok || !context.mounted) return;
            late String kept;
            if (_attempt(context, () => kept = service.delete(novelId, node.id, title: title))) {
              if (selected) ref.read(selectedNodeProvider.notifier).select(null);
              _tell(
                context,
                'Deleted “$title”.',
                action: SnackBarAction(label: 'Undo', onPressed: () => service.undoDelete(kept)),
              );
            }
          default:
            if (action.startsWith('add:')) {
              _create(context, ref, novelId, NodeKind.values.byName(action.substring(4)), node.id);
            } else if (action.startsWith('status:')) {
              _attempt(
                context,
                () => service.setStatus(novelId, node.id, NodeStatus.values.byName(action.substring(7))),
              );
            }
        }
      },
      itemBuilder: (_) {
        // Merging needs the next sibling to be the same kind (a chapter after a chapter, a scene after a scene).
        final siblings = siblingsOf(ref.read(outlineProvider), node.parentId);
        final at = siblings.indexWhere((n) => n.id == node.id);
        final mergeable = doc && at + 1 < siblings.length && siblings[at + 1].kind == node.kind;
        return [
          const PopupMenuItem(value: 'rename', child: Text('Rename…')),
          if (doc) const PopupMenuItem(value: 'plan', child: Text('Plan…')),
          for (final k in NodeKind.values)
            if (node.kind != null && canContain(node.kind, k))
              PopupMenuItem(value: 'add:${k.name}', child: Text('Add ${k.label.toLowerCase()} inside')),
          const PopupMenuItem(value: 'up', child: Text('Move up')),
          const PopupMenuItem(value: 'down', child: Text('Move down')),
          const PopupMenuItem(value: 'move', child: Text('Move to…')),
          const PopupMenuItem(value: 'duplicate', child: Text('Duplicate')),
          if (mergeable) const PopupMenuItem(value: 'merge', child: Text('Merge with the next one')),
          if (doc) ...[
            const PopupMenuDivider(),
            for (final s in NodeStatus.values)
              CheckedPopupMenuItem(value: 'status:${s.name}', checked: node.status == s, child: Text(s.label)),
          ],
          const PopupMenuDivider(),
          const PopupMenuItem(value: 'delete', child: Text('Delete…')),
        ];
      },
    );
    return _ContentsLine(
      node: node,
      title: title,
      depth: depth,
      number: number,
      selected: selected,
      menu: menu,
      onTap: doc ? () => ref.read(selectedNodeProvider.notifier).select(node.id) : null,
      theme: theme,
    );
  }

  /// Choose where it goes: the top level, or any group or chapter that can hold it (never inside itself).
  Future<void> _moveTo(BuildContext context, WidgetRef ref) async {
    final nodes = ref.read(outlineProvider);
    final targets = <(String?, String)>[
      if (moveError(nodes, node.id, null) == null) (null, 'The top level'),
      for (final n in readingOrder(nodes))
        if (n.id != node.id && moveError(nodes, node.id, n.id) == null)
          (n.id, '${n.kind?.label ?? ''}: ${n.displayTitle}'),
    ];
    final choice = await showDialog<(String?, String)>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text('Move “${node.displayTitle}” to…'),
        children: [
          if (targets.isEmpty)
            const Padding(padding: EdgeInsets.all(24), child: Text('There is nowhere else it can go.')),
          for (final t in targets) SimpleDialogOption(onPressed: () => Navigator.of(context).pop(t), child: Text(t.$2)),
        ],
      ),
    );
    if (choice == null || !context.mounted) return;
    _attempt(context, () => ref.read(manuscriptServiceProvider).move(novelId, node.id, choice.$1));
  }
}

/// One line of the contents page. A part (volume, act, arc) is set in capitals between rules; a chapter is its
/// number, its title in the book face and a dotted leader to its length, as a printed contents page runs to page
/// numbers; a scene is indented in italic with a section mark. The chapter being written is marked by a ribbon down
/// its side. Its menu sits at the end.
class _ContentsLine extends StatelessWidget {
  const _ContentsLine({
    required this.node,
    required this.title,
    required this.depth,
    required this.number,
    required this.selected,
    required this.menu,
    required this.onTap,
    required this.theme,
  });

  final StoryNode node;
  final String title;
  final int depth;
  final int? number;
  final bool selected;
  final Widget menu;
  final VoidCallback? onTap;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final scheme = theme.colorScheme;
    final doc = isDocument(node.kind);
    final scene = node.kind == NodeKind.scene;
    final muted = scheme.onSurfaceVariant;
    final indent = 14.0 + depth * 16;
    // The line's own paper, under the title and the length, so the leader's dots stop at them.
    final paper = selected ? Color.alphaBlend(scheme.primary.withValues(alpha: 0.08), scheme.surface) : scheme.surface;

    if (!doc) {
      // A part: its kind and title in capitals, between rules.
      return Padding(
        padding: EdgeInsets.fromLTRB(indent, 14, 0, 2),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                header: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      node.kind?.label ?? node.kindKey,
                      style: TextStyle(
                        fontFamily: BookFaces.of(context).heading,
                        fontSize: 11,
                        letterSpacing: 1.4,
                        color: muted,
                      ),
                    ),
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontFamily: BookFaces.of(context).heading,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        letterSpacing: 1,
                        color: scheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(height: 1, color: scheme.outlineVariant),
                  ],
                ),
              ),
            ),
            menu,
          ],
        ),
      );
    }

    final text = TextStyle(
      fontFamily: BookFaces.of(context).text,
      fontSize: scene ? 15.5 : 17,
      fontStyle: scene ? FontStyle.italic : FontStyle.normal,
      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
      color: scheme.onSurface,
    );
    return Semantics(
      selected: selected,
      child: Material(
        color: selected ? scheme.primary.withValues(alpha: 0.08) : Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 52),
            child: Stack(
              children: [
                // The ribbon bookmark at the chapter being written.
                if (selected)
                  Positioned(
                    left: 4,
                    top: 0,
                    bottom: 0,
                    child: Container(
                      width: 4,
                      decoration: BoxDecoration(
                        color: scheme.primary,
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(1)),
                      ),
                    ),
                  ),
                Padding(
                  padding: EdgeInsets.only(left: indent),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 28,
                        child: Text(
                          scene ? '§' : '${number ?? ''}',
                          style: TextStyle(
                            fontFamily: BookFaces.of(context).heading,
                            fontWeight: FontWeight.w700,
                            fontSize: scene ? 14 : 15,
                            color: selected ? scheme.primary : muted,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // As a printer sets it: dots across the whole line, the title laid over them on the
                            // paper at the left and the length at the right, so the dots fill exactly the gap.
                            Stack(
                              children: [
                                Positioned(
                                  left: 0,
                                  right: 0,
                                  bottom: 6,
                                  child: CustomPaint(painter: _LeaderPainter(muted), size: const Size(0, 2)),
                                ),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Expanded(
                                      child: Align(
                                        alignment: AlignmentDirectional.bottomStart,
                                        child: ColoredBox(
                                          color: paper,
                                          child: Padding(
                                            padding: const EdgeInsets.only(right: 6),
                                            child: Text(
                                              title,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: text,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    ColoredBox(
                                      color: paper,
                                      child: Padding(
                                        padding: const EdgeInsets.only(left: 6),
                                        child: Text(
                                          formatNumber(node.wordCount),
                                          style: TextStyle(
                                            fontFamily: BookFaces.of(context).text,
                                            fontSize: 15,
                                            color: muted,
                                            fontFeatures: const [FontFeature.oldstyleFigures()],
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            Text(
                              node.status.label,
                              style: theme.textTheme.labelSmall?.copyWith(color: muted, letterSpacing: 0.6),
                            ),
                          ],
                        ),
                      ),
                      menu,
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Dots along a contents line, from the title to the length.
class _LeaderPainter extends CustomPainter {
  _LeaderPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final dot = Paint()..color = color.withValues(alpha: 0.55);
    // Stopping short of the end: the length covers the dots under it, and none peeks out after its last figure.
    for (var x = 0.0; x < size.width - 8; x += 5) {
      canvas.drawCircle(Offset(x + 1, size.height / 2), 0.9, dot);
    }
  }

  @override
  bool shouldRepaint(_LeaderPainter old) => old.color != color;
}
