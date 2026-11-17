import 'package:flutter/material.dart';

/// A TICKET (dqnamo's Kitchen): what was done, set as a ticket: its main part and a stub, a perforated line between
/// them, and a notch cut top and bottom where the line runs, as a ticket is torn.
class Ticket extends StatelessWidget {
  const Ticket({super.key, required this.main, required this.stub, required this.paper});

  final Widget main;
  final Widget stub;
  final Color paper;

  static const notch = 7.0;

  @override
  Widget build(BuildContext context) {
    final dash = Theme.of(context).colorScheme.outline.withValues(alpha: 0.6);
    return IntrinsicHeight(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Each half takes a share of a narrow width (large text on a phone), its words wrapping within it.
          Flexible(
            flex: 3,
            child: CustomPaint(
              painter: _Half(paper: paper, stubSide: false),
              child: Padding(padding: const EdgeInsets.fromLTRB(16, 10, 16, 10), child: main),
            ),
          ),
          Flexible(
            flex: 2,
            child: CustomPaint(
              painter: _Half(paper: paper, stubSide: true, dash: dash),
              child: Padding(padding: const EdgeInsets.fromLTRB(16, 10, 16, 10), child: stub),
            ),
          ),
        ],
      ),
    );
  }
}

/// One half of the ticket's paper: rounded at its outer corners, a half notch cut at its inner ones; the stub's half
/// carries the perforation along its inner edge.
class _Half extends CustomPainter {
  _Half({required this.paper, required this.stubSide, this.dash});
  final Color paper;
  final bool stubSide;
  final Color? dash;

  @override
  void paint(Canvas canvas, Size size) {
    const r = Radius.circular(8);
    final rect = Offset.zero & size;
    final paperShape = Path()
      ..addRRect(
        stubSide
            ? RRect.fromRectAndCorners(rect, topRight: r, bottomRight: r)
            : RRect.fromRectAndCorners(rect, topLeft: r, bottomLeft: r),
      );
    final x = stubSide ? 0.0 : size.width;
    final bites = Path()
      ..addOval(Rect.fromCircle(center: Offset(x, 0), radius: Ticket.notch))
      ..addOval(Rect.fromCircle(center: Offset(x, size.height), radius: Ticket.notch));
    final shape = Path.combine(PathOperation.difference, paperShape, bites);
    canvas.drawShadow(shape, Colors.black26, 2, false);
    canvas.drawPath(shape, Paint()..color = paper);
    if (dash case final d?) {
      final line = Paint()
        ..color = d
        ..strokeWidth = 1.2;
      for (var y = Ticket.notch + 3; y < size.height - Ticket.notch - 3; y += 7) {
        canvas.drawLine(Offset(0, y), Offset(0, y + 3.5), line);
      }
    }
  }

  @override
  bool shouldRepaint(_Half old) => old.paper != paper || old.stubSide != stubSide || old.dash != dash;
}
