import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/novel.dart' show novelAccents;
import 'portrait.dart';
import 'vault.dart';

/// A character's own colour: one of the cover colours, chosen by their id, so it stays theirs whatever the sort,
/// filter or name.
Color castTone(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  final hex = novelAccents[h % novelAccents.length];
  return Color(int.parse('ff${hex.substring(1)}', radix: 16));
}

/// Up to two initials: "Kai & Ren" is "KR", "Mira" is "M".
String monogram(String name) {
  final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty && RegExp(r'\w').hasMatch(w[0])).toList();
  if (words.isEmpty) return '?';
  return words.take(2).map((w) => w.characters.first.toUpperCase()).join();
}

/// Where a character is in the book: for each chapter, whether a chapter or one of its scenes links to them.
({List<bool> chapters, int count, int? first, int? last}) presenceOf(Listed l, StoryOrder order) {
  final marks = List.filled(order.chapters.length, false);
  for (final id in l.linkedIn) {
    final n = order.chapterNumber[id];
    if (n != null && n >= 1 && n <= marks.length) marks[n - 1] = true;
  }
  final first = marks.indexOf(true);
  final last = marks.lastIndexOf(true);
  return (
    chapters: marks,
    count: marks.where((m) => m).length,
    first: first < 0 ? null : first + 1,
    last: last < 0 ? null : last + 1,
  );
}

/// THE CAST WALL: each character as a portrait card (their picture, or their monogram on their own colour), their
/// name and epithet set like the vault's, and their thread through the book: a tick for every chapter, lit where they
/// are in it.
class CastWall extends StatelessWidget {
  const CastWall({super.key, required this.found, required this.order, required this.onOpen});

  final List<Listed> found;
  final StoryOrder order;
  final void Function(Listed l) onOpen;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final columns = ((box.maxWidth + 14) / 184).floor().clamp(2, 8);
      final width = (box.maxWidth - 14 * (columns - 1)) / columns;
      return Wrap(
        spacing: 14,
        runSpacing: 18,
        children: [
          for (final l in found)
            SizedBox(
              width: width,
              child: _CastCard(listed: l, order: order, onOpen: () => onOpen(l)),
            ),
        ],
      );
    },
  );
}

class _CastCard extends StatelessWidget {
  const _CastCard({required this.listed, required this.order, required this.onOpen});

  final Listed listed;
  final StoryOrder order;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final l = listed;
    final tone = castTone(l.entry.id);
    final presence = presenceOf(l, order);
    final where = order.chapters.isEmpty
        ? null
        : presence.count == 0
        ? 'Not in the manuscript yet'
        : presence.first == presence.last
        ? 'In chapter ${presence.first}'
        : 'In ${formatNumber(presence.count)} of ${formatNumber(order.chapters.length)} chapters · '
              '${presence.first}–${presence.last}';

    return Semantics(
      button: true,
      label: [
        l.entry.name,
        if (l.profile.epithet.isNotEmpty) l.profile.epithet,
        ...l.profile.roles,
        if (l.profile.status.isNotEmpty) l.profile.status,
        ?where,
      ].join(', '),
      excludeSemantics: true,
      child: Material(
        color: scheme.surfaceContainerLow,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        ),
        child: InkWell(
          onTap: onOpen,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _Picture(listed: l, tone: tone),
                    if (l.profile.status.isNotEmpty)
                      Positioned(
                        left: 8,
                        top: 8,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            child: Text(
                              l.profile.status,
                              style: theme.textTheme.labelSmall?.copyWith(color: Colors.white, letterSpacing: 0.6),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l.entry.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultHeading(context, size: 16, weight: 700, color: scheme.onSurface),
                    ),
                    if (l.profile.epithet.isNotEmpty)
                      Text(
                        l.profile.epithet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 15, color: scheme.onSurfaceVariant, style: FontStyle.italic),
                      ),
                    if (l.entry.summary.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        l.entry.summary,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurface),
                      ),
                    ],
                    if (l.profile.roles.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        l.profile.roles.join(' · ').toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(color: scheme.primary, letterSpacing: 1.2),
                      ),
                    ],
                    if (where != null) ...[
                      const SizedBox(height: 10),
                      ChapterThread(marks: presence.chapters, tone: tone),
                      const SizedBox(height: 4),
                      Text(where, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The portrait, or the monogram on the character's colour inside a thin frame.
class _Picture extends StatelessWidget {
  const _Picture({required this.listed, required this.tone});

  final Listed listed;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final l = listed;
    final bytes = uploadedImageBytes(l.entry.image);
    if (bytes != null) {
      final f = l.profile.focal;
      return Image.memory(
        bytes,
        fit: BoxFit.cover,
        alignment: Alignment(f.x / 50 - 1, f.y / 50 - 1),
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => _monogram(context),
      );
    }
    return _monogram(context);
  }

  Widget _monogram(BuildContext context) {
    final dark = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark;
    final ink = dark ? const Color(0xFFFFF8EC) : const Color(0xFF1B140E);
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color.lerp(tone, Colors.white, 0.1)!, Color.lerp(tone, Colors.black, 0.45)!],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: DecoratedBox(
          decoration: BoxDecoration(border: Border.all(color: ink.withValues(alpha: 0.45))),
          child: Center(
            child: LayoutBuilder(
              builder: (context, box) => Text(
                monogram(listed.entry.name),
                style: vaultHeading(context, size: box.maxWidth * 0.3, weight: 700, color: ink),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A tick for every chapter of the book, in reading order; lit in the record's colour where it figures (the cast wall
/// and the World's encyclopedia).
class ChapterThread extends StatelessWidget {
  const ChapterThread({super.key, required this.marks, required this.tone});

  final List<bool> marks;
  final Color tone;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 10,
    width: double.infinity,
    child: CustomPaint(
      painter: _ChapterThreadPainter(marks: marks, lit: tone, unlit: Theme.of(context).colorScheme.outlineVariant),
    ),
  );
}

class _ChapterThreadPainter extends CustomPainter {
  _ChapterThreadPainter({required this.marks, required this.lit, required this.unlit});

  final List<bool> marks;
  final Color lit;
  final Color unlit;

  @override
  void paint(Canvas canvas, Size size) {
    if (marks.isEmpty) return;
    final step = size.width / marks.length;
    final gap = step > 4 ? 1.5 : 0.0;
    final base = Paint()..color = unlit.withValues(alpha: 0.5);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(0, size.height / 2 - 1, size.width, 2), const Radius.circular(1)),
      base,
    );
    final on = Paint()..color = lit;
    for (var i = 0; i < marks.length; i++) {
      if (!marks[i]) continue;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(i * step + gap / 2, 0, (step - gap).clamp(2.0, double.infinity), size.height),
          const Radius.circular(2),
        ),
        on,
      );
    }
  }

  @override
  bool shouldRepaint(_ChapterThreadPainter old) => old.marks != marks || old.lit != lit || old.unlit != unlit;
}
