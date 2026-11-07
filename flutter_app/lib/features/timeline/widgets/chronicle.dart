import 'package:flutter/material.dart';

import '../../../shared/domain/timeline/chronology.dart';
import '../../characters/widgets/vault.dart';

/// Events of one year (or of no known time), under its heading.
typedef ChronicleGroup = ({String key, String heading, List<Placed> items});

/// THE CHRONICLE: the timeline as one line of time running down the page. Each year is a mark on it, each event hangs
/// from it by a node sized by its importance (on a wide screen, to either side in turn), a jump of years is said on the
/// line itself, and events not yet placed in time follow on a broken line.
class Chronicle extends StatelessWidget {
  const Chronicle({super.key, required this.groups, required this.card});

  final List<ChronicleGroup> groups;
  final Widget Function(Placed p) card;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final wide = box.maxWidth >= 840;
      final rows = <Widget>[];
      var side = 0;
      int? lastYear;
      for (final g in groups) {
        final year = int.tryParse(g.key);
        final undated = year == null;
        if (year != null && lastYear != null && year - lastYear > 1) {
          rows.add(_Gap(text: '${year - lastYear} years later', wide: wide));
        }
        rows.add(_YearMark(heading: g.heading, wide: wide, undated: undated, first: rows.isEmpty));
        for (final p in g.items) {
          rows.add(
            _EventRow(
              wide: wide,
              left: wide && side.isEven,
              importance: p.event.importanceKey,
              dashed: undated,
              child: card(p),
            ),
          );
          side++;
        }
        if (year != null) lastYear = year;
      }
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
    },
  );
}

const _wideGutter = 72.0;
const _narrowGutter = 44.0;
const _nodeY = 26.0;

/// Where the line runs in a row [width] wide.
double _lineX(bool wide, double width) => wide ? width / 2 : _narrowGutter / 2;

class _EventRow extends StatelessWidget {
  const _EventRow({
    required this.wide,
    required this.left,
    required this.importance,
    required this.dashed,
    required this.child,
  });

  final bool wide;
  final bool left;
  final String importance;
  final bool dashed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final body = Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: wide
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: left ? child : const SizedBox.shrink()),
                const SizedBox(width: _wideGutter),
                Expanded(child: left ? const SizedBox.shrink() : child),
              ],
            )
          : Padding(
              padding: const EdgeInsets.only(left: _narrowGutter),
              child: SizedBox(width: double.infinity, child: child),
            ),
    );
    return Stack(
      children: [
        Positioned.fill(
          child: ExcludeSemantics(
            child: CustomPaint(
              painter: _LinePainter(
                wide: wide,
                line: scheme.outlineVariant,
                dashed: dashed,
                node: importance,
                nodeColor: scheme.primary,
                ground: scheme.surface,
                reach: wide ? (left ? -1 : 1) : 1,
              ),
            ),
          ),
        ),
        body,
      ],
    );
  }
}

class _YearMark extends StatelessWidget {
  const _YearMark({required this.heading, required this.wide, required this.undated, required this.first});

  final String heading;
  final bool wide;
  final bool undated;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Semantics(
      header: true,
      child: Text(
        heading,
        textAlign: wide ? TextAlign.center : TextAlign.start,
        style: vaultHeading(
          context,
          size: undated ? 16 : 20,
          weight: 700,
          color: undated ? scheme.onSurfaceVariant : scheme.onSurface,
        ),
      ),
    );
    return Stack(
      children: [
        Positioned.fill(
          child: CustomPaint(
            painter: _LinePainter(
              wide: wide,
              line: scheme.outlineVariant,
              dashed: undated,
              node: 'year',
              nodeColor: undated ? scheme.outline : scheme.primary,
              ground: scheme.surface,
              startAtNode: first,
              // Level with the middle of the heading.
              at: wide ? null : (first ? 4 : 14) + 12 + 13,
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: first ? 4 : 14, bottom: 14),
          child: wide
              ? Center(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: scheme.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: undated ? scheme.outlineVariant : scheme.primary.withValues(alpha: 0.6),
                      ),
                    ),
                    child: Padding(padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8), child: text),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.only(left: _narrowGutter, top: 12, bottom: 2),
                  child: text,
                ),
        ),
      ],
    );
  }
}

/// A stretch of years with nothing recorded, said on the line.
class _Gap extends StatelessWidget {
  const _Gap({required this.text, required this.wide});

  final String text;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = Text(
      text,
      style: vaultText(context, size: 15, color: scheme.onSurfaceVariant, style: FontStyle.italic),
    );
    return Stack(
      children: [
        Positioned.fill(
          child: CustomPaint(
            painter: _LinePainter(
              wide: wide,
              line: scheme.outlineVariant,
              dashed: true,
              node: null,
              nodeColor: scheme.primary,
              ground: scheme.surface,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: wide
              ? Center(
                  child: ColoredBox(
                    color: scheme.surface,
                    child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: label),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.only(left: _narrowGutter),
                  child: label,
                ),
        ),
      ],
    );
  }
}

/// The line through a row, its node (an event's by importance, or a year's ring) and the reach from node to card.
class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.wide,
    required this.line,
    required this.dashed,
    required this.node,
    required this.nodeColor,
    required this.ground,
    this.reach = 0,
    this.startAtNode = false,
    this.at,
  });

  final bool wide;
  final Color line;
  final bool dashed;

  /// `minor`, `major`, `climax`, `year`, or null for the line alone.
  final String? node;
  final Color nodeColor;
  final Color ground;

  /// Which way the card hangs: -1 left, 1 right, 0 none.
  final int reach;

  /// The first mark: the line begins at it rather than above it.
  final bool startAtNode;

  /// How far down the node sits, when not the usual place.
  final double? at;

  @override
  void paint(Canvas canvas, Size size) {
    final x = _lineX(wide, size.width);
    final y = at ?? (node == 'year' ? size.height / 2 : _nodeY);
    final stroke = Paint()
      ..color = line
      ..strokeWidth = 2;
    final top = startAtNode ? y : 0.0;
    if (dashed) {
      for (var t = top; t < size.height; t += 9) {
        canvas.drawLine(Offset(x, t), Offset(x, (t + 5).clamp(0, size.height)), stroke);
      }
    } else {
      canvas.drawLine(Offset(x, top), Offset(x, size.height), stroke);
    }
    if (node == null) return;
    if (reach != 0) {
      final to = wide ? x + reach * (_wideGutter / 2) : _narrowGutter;
      canvas.drawLine(
        Offset(x, y),
        Offset(to, y),
        Paint()
          ..color = line
          ..strokeWidth = 1.5,
      );
    }
    final fill = Paint()..color = nodeColor;
    final ring = Paint()
      ..color = nodeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    switch (node) {
      case 'year':
        if (!wide) {
          canvas.drawCircle(Offset(x, y), 8, Paint()..color = ground);
          canvas.drawCircle(Offset(x, y), 8, ring);
          canvas.drawCircle(Offset(x, y), 3.5, fill);
        }
      case 'climax':
        canvas.drawCircle(Offset(x, y), 14, Paint()..color = nodeColor.withValues(alpha: 0.22));
        canvas.drawCircle(Offset(x, y), 9, fill);
        canvas.drawCircle(
          Offset(x, y),
          9,
          Paint()
            ..color = ground
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      case 'major':
        canvas.drawCircle(Offset(x, y), 7, fill);
      default:
        canvas.drawCircle(Offset(x, y), 5, Paint()..color = ground);
        canvas.drawCircle(Offset(x, y), 5, ring);
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.wide != wide ||
      old.line != line ||
      old.dashed != dashed ||
      old.node != node ||
      old.nodeColor != nodeColor ||
      old.ground != ground ||
      old.reach != reach ||
      old.startAtNode != startAtNode ||
      old.at != at;
}
