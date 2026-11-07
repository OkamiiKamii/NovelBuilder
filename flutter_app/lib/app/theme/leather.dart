import 'package:flutter/material.dart';

/// BOUND IN LEATHER: the app's frame (the navigation rail on a computer or tablet, the bottom bar on a phone) is the
/// binding of the book: dark leather, a stitched gilt edge, gilt bands, gilt lettering, with the area being worked in
/// picked out in brighter gold. The same binding by day and by night (a shade darker at night). Everything on it is
/// drawn from [leatherTheme], so the search button, the tutorial and the save status read on leather as they do on paper.
@immutable
class Leather {
  const Leather({required this.top, required this.bottom, required this.gilt, required this.giltMuted});
  final Color top;
  final Color bottom;
  final Color gilt;
  final Color giltMuted;

  static const day = Leather(
    top: Color(0xFF4A2E1C),
    bottom: Color(0xFF34200F),
    gilt: Color(0xFFF0D59A),
    giltMuted: Color(0xFFD7BE8C),
  );

  static const night = Leather(
    top: Color(0xFF33200F),
    bottom: Color(0xFF221508),
    gilt: Color(0xFFEBCF92),
    giltMuted: Color(0xFFCDB485),
  );

  static Leather of(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? night : day;
}

/// The theme for what sits on the binding: gilt on leather.
ThemeData leatherTheme(ThemeData base, Leather l) {
  final scheme = base.colorScheme.copyWith(
    brightness: Brightness.dark,
    primary: l.gilt,
    onPrimary: l.bottom,
    surface: l.bottom,
    onSurface: l.gilt,
    onSurfaceVariant: l.giltMuted,
    outline: l.giltMuted,
    outlineVariant: l.giltMuted.withValues(alpha: 0.4),
  );
  final indicator = l.gilt.withValues(alpha: 0.22);
  return base.copyWith(
    colorScheme: scheme,
    iconTheme: IconThemeData(color: l.giltMuted),
    textTheme: base.textTheme.apply(bodyColor: l.gilt, displayColor: l.gilt),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: l.gilt)),
    navigationRailTheme: base.navigationRailTheme.copyWith(
      backgroundColor: Colors.transparent,
      indicatorColor: indicator,
      selectedIconTheme: IconThemeData(color: l.gilt),
      unselectedIconTheme: IconThemeData(color: l.giltMuted),
      selectedLabelTextStyle: TextStyle(
        color: l.gilt,
        fontFamily: 'Cinzel',
        fontWeight: FontWeight.w700,
        fontSize: 12,
        letterSpacing: 0.6,
      ),
      unselectedLabelTextStyle: TextStyle(color: l.giltMuted, fontFamily: 'Cinzel', fontSize: 12, letterSpacing: 0.6),
    ),
    navigationBarTheme: base.navigationBarTheme.copyWith(
      backgroundColor: Colors.transparent,
      indicatorColor: indicator,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? l.gilt : l.giltMuted),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontFamily: 'Cinzel',
          letterSpacing: 0.4,
          color: states.contains(WidgetState.selected) ? l.gilt : l.giltMuted,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
    ),
    tooltipTheme: base.tooltipTheme,
  );
}

/// The binding itself, behind its child: leather shading, a stitched gilt edge (on the side facing the pages, or the
/// top on a phone) and a gilt band at each end.
class LeatherBinding extends StatelessWidget {
  const LeatherBinding({super.key, required this.child, this.horizontal = false});

  final Widget child;

  /// The bottom bar (stitched along its top edge) rather than the rail (stitched along its right edge).
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final l = Leather.of(context);
    return CustomPaint(
      painter: _BindingPainter(l, horizontal: horizontal),
      child: Theme(data: leatherTheme(Theme.of(context), l), child: child),
    );
  }
}

class _BindingPainter extends CustomPainter {
  _BindingPainter(this.l, {required this.horizontal});
  final Leather l;
  final bool horizontal;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    // The leather, darker towards the spine's edges as on a rounded binding.
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: horizontal ? Alignment.topCenter : Alignment.centerLeft,
          end: horizontal ? Alignment.bottomCenter : Alignment.centerRight,
          colors: [l.bottom, l.top, l.top, l.bottom],
          stops: const [0, 0.3, 0.7, 1],
        ).createShader(rect),
    );
    final gilt = Paint()
      ..color = l.gilt.withValues(alpha: 0.55)
      ..strokeWidth = 1.2;
    // The stitching: short gilt dashes a little in from the edge facing the pages.
    const dash = 5.0, gap = 4.0, inset = 5.0;
    if (horizontal) {
      for (var x = 6.0; x < size.width - 6; x += dash + gap) {
        canvas.drawLine(Offset(x, inset), Offset(x + dash, inset), gilt);
      }
    } else {
      final x = size.width - inset;
      for (var y = 6.0; y < size.height - 6; y += dash + gap) {
        canvas.drawLine(Offset(x, y), Offset(x, y + dash), gilt);
      }
      // Gilt bands across the head and the foot.
      final band = Paint()
        ..color = l.gilt.withValues(alpha: 0.5)
        ..strokeWidth = 1.5;
      for (final y in [10.0, 14.0, size.height - 14, size.height - 10]) {
        canvas.drawLine(Offset(8, y), Offset(size.width - 12, y), band);
      }
    }
  }

  @override
  bool shouldRepaint(_BindingPainter old) => old.l != l || old.horizontal != horizontal;
}
