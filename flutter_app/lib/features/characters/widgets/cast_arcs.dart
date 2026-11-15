import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/feeling_arcs.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../write/write_providers.dart';
import '../character_actions.dart' show characterPath;
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// ARCS, a view of the cast (`feeling_arcs.dart` reads it): each character's line through the book, from the words of
/// feeling in the sentences that name them, bright above the line and dark below; its shape said plainly, with its
/// classic name; its highest and lowest chapters. A chapter pressed shows the lines that made it, with **Read it
/// there**. Beside each, the arc the author planned in the profile (Starting Point, Intended Resolution), or the way to
/// write one. It only reads.
class CastArcs extends ConsumerStatefulWidget {
  const CastArcs({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<CastArcs> createState() => _CastArcsState();
}

class _CastArcsState extends ConsumerState<CastArcs> {
  FeelingArcs? _arcs;
  Object? _readFor;

  /// The chapter pressed on each line, by character.
  final Map<String, int> _picked = {};

  void _read() {
    final store = ref.read(novelStoreProvider);
    final novelId = widget.cast.novelId;
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final names = namesToFind(widget.cast.entries, widget.cast.profiles);
    final people = [
      for (final l in widget.cast.list)
        if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty)
          (id: l.entry.id, names: names[l.entry.id]!),
    ];
    final key = (
      [for (final n in nodes) '${n.id}:${n.wordCount}'].join(','),
      [for (final p in people) '${p.id}:${p.names.join('|')}'].join(','),
    );
    if (key == _readFor) return;
    _readFor = key;
    ref
        .read(runAsideProvider)(
          feelingArcsJob(store.rawJsonIn(novelId, 'chapterContents'), [for (final n in nodes) n.id], people),
        )
        .then(
          (arcs) {
            if (mounted && _readFor == key) setState(() => _arcs = arcs);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
        );
  }

  @override
  Widget build(BuildContext context) {
    _read();
    final scheme = Theme.of(context).colorScheme;
    final arcs = _arcs;
    if (arcs == null) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final byId = {for (final l in widget.cast.list) l.entry.id: l};
    // One scale for the cast, set by the strongest feeling in the book, so the lines can be compared and still fill
    // their height.
    final scale = [
      0.25,
      for (final a in arcs.arcs)
        for (final p in a.points)
          if (p.feeling case final f?) f.abs(),
    ].reduce((a, b) => a > b ? a : b);
    if (arcs.arcs.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          arcs.chapters == 0
              ? 'No chapter has words yet. Once there are, each character’s line through the book is drawn here.'
              : 'No one in the cast is in enough of the book to draw a line yet: one is drawn once a character is named '
                    'in $arcChapters chapters, with something felt about them in $arcReadings.',
          textAlign: TextAlign.center,
          style: vaultText(context, size: 16, color: scheme.onSurfaceVariant),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Each character’s line through the book, read from the words of feeling in the sentences that name them. '
            'Above the line, bright: hope, laughed, safe. Below, dark: fear, wept, alone.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          for (final arc in arcs.arcs)
            if (byId[arc.id] case final l?)
              _ArcCard(
                arc: arc,
                listed: l,
                chapters: arcs.chapters,
                scale: scale,
                picked: _picked[arc.id],
                onPick: (c) => setState(() => _picked[arc.id] == c ? _picked.remove(arc.id) : _picked[arc.id] = c),
              ),
          if (arcs.thin.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Too little on the page to draw yet: ${([for (final id in arcs.thin) byId[id]?.entry.name ?? 'someone']..sort()).join(', ')}.',
                style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );
  }
}

/// One character's line, its shape, the chapter pressed, and the arc they were meant to have.
class _ArcCard extends ConsumerWidget {
  const _ArcCard({
    required this.arc,
    required this.listed,
    required this.chapters,
    required this.scale,
    required this.picked,
    required this.onPick,
  });

  final CharacterArc arc;
  final Listed listed;
  final int chapters;

  /// The feeling that reaches the top or the foot of the line, the same for every one.
  final double scale;
  final int? picked;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final tone = NovelArt.of(context).bound(castTone(arc.id), lift: 0.1, sink: 0.45, tinted: true);
    final line = castTone(arc.id);
    final shape = arc.shape;
    final name = listed.entry.name;
    final point = picked == null ? null : arc.points.where((p) => p.chapter == picked).firstOrNull;
    final from = fieldNamed(listed.entry, 'Starting Point');
    final to = fieldNamed(listed.entry, 'Intended Resolution');
    final now = fieldNamed(listed.entry, 'Current State');
    return Padding(
      key: ValueKey('arc-${arc.id}'),
      padding: const EdgeInsets.only(bottom: 14),
      child: VaultFrame(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                GestureDetector(
                  onTap: () => context.go(characterPath(arc.id)),
                  child: ExcludeSemantics(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(9),
                      child: SizedBox(
                        width: 40,
                        height: 48,
                        child: Cameo(
                          look: cameoLookOf(listed.entry, listed.profile),
                          ground: tone.ground,
                          ink: tone.ink,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: vaultHeading(context, size: 16, color: scheme.onSurface, weight: 700)),
                      Text(
                        shape == null
                            ? 'Too short a line yet to name its shape'
                            : shape.classic.isEmpty
                            ? shape.label
                            : '${shape.label}: ${shape.classic}',
                        style: vaultText(
                          context,
                          size: 14.5,
                          color: scheme.primary,
                        ).copyWith(fontStyle: FontStyle.italic),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Semantics(
              container: true,
              label:
                  '$name through the book: ${[for (final p in arc.points) 'chapter ${p.chapter} ${_word(p.feeling)}'].join(', ')}',
              child: _Line(arc: arc, chapters: chapters, scale: scale, colour: line, picked: picked, onPick: onPick),
            ),
            const SizedBox(height: 6),
            Text(
              [
                'Named in ${arc.points.length} of $chapters chapters',
                if (arc.high case final h? when (h.feeling ?? 0) > 0) 'brightest in chapter ${h.chapter}',
                if (arc.low case final l? when (l.feeling ?? 0) < 0) 'darkest in chapter ${l.chapter}',
              ].join(' · '),
              style: vaultText(context, size: 13, color: scheme.onSurfaceVariant),
            ),
            if (point == null)
              Text(
                'Press the line at a chapter to see the words that put it there.',
                style: vaultText(context, size: 12.5, color: scheme.onSurfaceVariant),
              )
            else
              _Picked(point: point, colour: line),
            if (shape == ArcShape.flat)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'A flat line can be a choice (a steady one who changes others), or a sign the book has not moved '
                  '$name yet.',
                  style: vaultText(context, size: 14, color: scheme.onSurface),
                ),
              ),
            const SizedBox(height: 8),
            // The arc as planned in the profile, beside the one on the page.
            if (from.isNotEmpty || to.isNotEmpty)
              Container(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                decoration: BoxDecoration(color: scheme.surfaceContainerHigh, borderRadius: BorderRadius.circular(8)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'THE ARC YOU PLANNED',
                      style: vaultHeading(
                        context,
                        size: 10.5,
                        color: scheme.primary,
                        weight: 700,
                      ).copyWith(letterSpacing: 1.4),
                    ),
                    const SizedBox(height: 4),
                    if (from.isNotEmpty) _Planned(label: 'From', text: from),
                    if (now.isNotEmpty) _Planned(label: 'Now', text: now),
                    if (to.isNotEmpty) _Planned(label: 'To', text: to),
                  ],
                ),
              )
            else
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                  onPressed: () => context.go(characterPath(arc.id)),
                  icon: const Icon(Icons.edit_note, size: 18),
                  label: const Text('Plan their arc'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _word(double? feeling) => switch (feeling) {
  null => 'no feeling written',
  > 0.15 => 'bright',
  < -0.15 => 'dark',
  _ => 'mixed',
};

class _Planned extends StatelessWidget {
  const _Planned({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label  ',
              style: vaultHeading(context, size: 12, color: scheme.onSurfaceVariant, weight: 700),
            ),
            TextSpan(text: text),
          ],
        ),
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
        style: vaultText(context, size: 14, color: scheme.onSurface),
      ),
    );
  }
}

/// The line itself: the book across, a chapter a step; a mark below for every chapter they are named in, the line
/// through those with a reading, filled toward the middle, bright above and dark below.
class _Line extends StatelessWidget {
  const _Line({
    required this.arc,
    required this.chapters,
    required this.scale,
    required this.colour,
    required this.picked,
    required this.onPick,
  });

  final CharacterArc arc;
  final int chapters;
  final double scale;
  final Color colour;
  final int? picked;
  final ValueChanged<int> onPick;

  static const height = 96.0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, box) {
        final width = box.maxWidth;
        double xOf(int chapter) => chapters <= 1 ? width / 2 : 8 + (chapter - 1) * (width - 16) / (chapters - 1);
        return GestureDetector(
          key: ValueKey('arc-line-${arc.id}'),
          behavior: HitTestBehavior.opaque,
          onTapUp: (d) {
            ArcPoint? best;
            for (final p in arc.points) {
              if (best == null ||
                  (xOf(p.chapter) - d.localPosition.dx).abs() < (xOf(best.chapter) - d.localPosition.dx).abs()) {
                best = p;
              }
            }
            if (best != null) onPick(best.chapter);
          },
          child: CustomPaint(
            size: Size(width, height),
            painter: _LinePainter(
              arc: arc,
              xOf: xOf,
              scale: scale,
              colour: colour,
              bright: scheme.primary,
              dark: scheme.error,
              rule: scheme.outlineVariant,
              picked: picked,
              ring: scheme.onSurface,
            ),
          ),
        );
      },
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.arc,
    required this.scale,
    required this.xOf,
    required this.colour,
    required this.bright,
    required this.dark,
    required this.rule,
    required this.picked,
    required this.ring,
  });

  final CharacterArc arc;

  /// The feeling that reaches the top or the foot, the same for the whole cast.
  final double scale;
  final double Function(int chapter) xOf;
  final Color colour;
  final Color bright;
  final Color dark;
  final Color rule;
  final int? picked;
  final Color ring;

  @override
  void paint(Canvas canvas, Size size) {
    const ticks = 8.0;
    final mid = (size.height - ticks) / 2;
    final reach = mid - 8;
    double yOf(double f) => mid - (f / scale).clamp(-1.0, 1.0) * reach;

    // The middle, dashed.
    final dash = Paint()
      ..color = rule
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 8) {
      canvas.drawLine(Offset(x, mid), Offset(x + 4, mid), dash);
    }
    // A mark for every chapter they are named in.
    final tick = Paint()
      ..color = colour.withValues(alpha: 0.55)
      ..strokeWidth = 2;
    for (final p in arc.points) {
      canvas.drawLine(Offset(xOf(p.chapter), size.height - ticks + 2), Offset(xOf(p.chapter), size.height), tick);
    }

    final readings = [
      for (final p in arc.points)
        if (p.feeling != null) p,
    ];
    if (readings.isEmpty) return;
    final pts = [for (final p in readings) Offset(xOf(p.chapter), yOf(p.feeling!))];

    // The line, smoothed between its points.
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (var i = 1; i < pts.length; i++) {
      final a = pts[i - 1], b = pts[i];
      final cx = (a.dx + b.dx) / 2;
      path.cubicTo(cx, a.dy, cx, b.dy, b.dx, b.dy);
    }
    // Filled toward the middle: bright above, dark below.
    final area = Path.from(path)
      ..lineTo(pts.last.dx, mid)
      ..lineTo(pts.first.dx, mid)
      ..close();
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, 0, size.width, mid));
    canvas.drawPath(area, Paint()..color = bright.withValues(alpha: 0.18));
    canvas.restore();
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, mid, size.width, size.height));
    canvas.drawPath(area, Paint()..color = dark.withValues(alpha: 0.16));
    canvas.restore();

    canvas.drawPath(
      path,
      Paint()
        ..color = colour
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
    );
    for (final (i, p) in readings.indexed) {
      final at = pts[i];
      canvas.drawCircle(at, p.chapter == picked ? 6 : 3.5, Paint()..color = colour);
      if (p.chapter == picked) {
        canvas.drawCircle(
          at,
          9,
          Paint()
            ..color = ring
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) => old.arc != arc || old.picked != picked || old.colour != colour;
}

/// The chapter pressed: how it reads, and the lines that put it there.
class _Picked extends ConsumerWidget {
  const _Picked({required this.point, required this.colour});

  final ArcPoint point;
  final Color colour;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final p = point;
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: colour, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Chapter ${p.chapter}: ${_word(p.feeling)} · named ${p.mentions} ${p.mentions == 1 ? 'time' : 'times'}',
            style: vaultHeading(context, size: 14, color: scheme.onSurface, weight: 700),
          ),
          if (p.lines.isEmpty)
            Text(
              'No word of feeling in the sentences that name them here.',
              style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
            ),
          for (final line in p.lines)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '“${line.sentence}”',
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(
                        context,
                        size: 14.5,
                        color: scheme.onSurface,
                      ).copyWith(fontStyle: FontStyle.italic),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Read it there',
                  icon: const Icon(Icons.menu_book_outlined, size: 18),
                  onPressed: () {
                    ref.read(pendingFindProvider.notifier).request((
                      nodeId: p.nodeId,
                      term: line.sentence,
                      block: line.block,
                    ));
                    ref.read(selectedNodeProvider.notifier).select(p.nodeId);
                    context.go('/write');
                  },
                ),
              ],
            ),
        ],
      ),
    );
  }
}
