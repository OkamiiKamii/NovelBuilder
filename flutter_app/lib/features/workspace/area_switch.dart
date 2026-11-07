import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// One part of an area, with its own page.
class AreaPart {
  const AreaPart(this.label, this.path, this.icon);
  final String label;
  final String path;
  final IconData icon;
}

/// The parts of Plan.
const planParts = [
  AreaPart('Timeline', '/plan', Icons.timeline),
  AreaPart('Plot threads', '/plan/threads', Icons.linear_scale),
  AreaPart('Scene board', '/plan/board', Icons.view_column_outlined),
  AreaPart('Alternate histories', '/plan/histories', Icons.alt_route),
  AreaPart('Calendar', '/plan/calendar', Icons.calendar_month_outlined),
];

/// The checks of Review.
const reviewParts = [
  AreaPart('All warnings', '/review', Icons.rule),
  AreaPart('Record check', '/review/records', Icons.fact_check_outlined),
  AreaPart('Timeline review', '/review/timeline', Icons.event_note_outlined),
  AreaPart('Canon', '/review/canon', Icons.verified_outlined),
  AreaPart('Continuity check', '/review/continuity', Icons.spellcheck),
  AreaPart('What depends on this', '/review/consequences', Icons.account_tree_outlined),
  AreaPart('Team and feedback', '/review/team', Icons.groups_outlined),
];

/// The pages of Progress.
const progressParts = [
  AreaPart('Writing progress', '/progress', Icons.trending_up),
  AreaPart('Analytics', '/progress/analytics', Icons.insights_outlined),
];

/// Moves between the parts of an area, as index tabs.
class AreaSwitch extends StatelessWidget {
  const AreaSwitch({super.key, required this.parts, required this.current});

  final List<AreaPart> parts;

  /// The path of the part shown now.
  final String current;

  @override
  Widget build(BuildContext context) => IndexTabs(
    tabs: [
      for (final p in parts)
        (
          label: p.label,
          icon: p.icon,
          selected: p.path == current,
          onTap: () {
            if (p.path != current) context.go(p.path);
          },
        ),
    ],
  );
}

/// One index tab: what it says, its sign, whether it is the part shown, and what pressing it does.
typedef IndexTab = ({String label, IconData icon, bool selected, VoidCallback onTap});

/// INDEX TABS: an area's parts as the paper tabs of a ledger's dividers, standing up from a ruled line in the vault's
/// capitals. The part shown is raised, the colour of the page and joined to it, with an accent edge; the others sit
/// back in the binder. The row scrolls sideways rather than cutting a name short, and keeps the part shown in sight.
/// Each tab is a full-size button that says whether it is the one shown.
class IndexTabs extends StatefulWidget {
  const IndexTabs({super.key, required this.tabs});
  final List<IndexTab> tabs;

  @override
  State<IndexTabs> createState() => _IndexTabsState();
}

class _IndexTabsState extends State<IndexTabs> {
  final _scroll = ScrollController();
  final _shown = GlobalKey();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _keepShownInSight());
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Scrolls the row (only the row) so the tab shown is in sight.
  void _keepShownInSight() {
    if (!mounted || !_scroll.hasClients) return;
    final tab = _shown.currentContext?.findRenderObject();
    final row = context.findRenderObject();
    if (tab is! RenderBox || row is! RenderBox) return;
    final left = tab.localToGlobal(Offset.zero, ancestor: row).dx;
    final right = left + tab.size.width;
    final view = row.size.width;
    final offset = _scroll.offset;
    if (left < 0) {
      _scroll.jumpTo((offset + left - 16).clamp(0.0, _scroll.position.maxScrollExtent));
    } else if (right > view) {
      _scroll.jumpTo((offset + right - view + 16).clamp(0.0, _scroll.position.maxScrollExtent));
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      label: 'Views',
      // As wide as the page, so the ruled line runs right across it.
      child: SizedBox(
        width: double.infinity,
        child: Stack(
          children: [
            // The ruled line the tabs stand on; the tab shown is drawn over it, joined to the page.
            Positioned(left: 0, right: 0, bottom: 0, child: Container(height: 1, color: scheme.outlineVariant)),
            SingleChildScrollView(
              controller: _scroll,
              scrollDirection: Axis.horizontal,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final t in widget.tabs)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: _Tab(key: t.selected ? _shown : null, tab: t),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({super.key, required this.tab});
  final IndexTab tab;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final on = tab.selected;
    final ink = on ? scheme.onSurface : scheme.onSurfaceVariant;
    return Semantics(
      button: true,
      selected: on,
      label: tab.label,
      excludeSemantics: true,
      onTap: tab.onTap,
      child: CustomPaint(
        painter: _TabPainter(
          fill: on ? theme.scaffoldBackgroundColor : scheme.surfaceContainer,
          edge: scheme.outlineVariant,
          accent: on ? scheme.primary : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: tab.onTap,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: on ? 52 : 48),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(tab.icon, size: 17, color: on ? scheme.primary : ink),
                    const SizedBox(width: 8),
                    Text(
                      tab.label,
                      style: TextStyle(
                        fontFamily: 'Cinzel',
                        fontSize: 13.5,
                        letterSpacing: 0.8,
                        fontWeight: on ? FontWeight.w700 : FontWeight.w600,
                        color: ink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A tab's paper: rounded at the top, open at the foot (so the tab shown joins the page), with an accent edge on it.
class _TabPainter extends CustomPainter {
  _TabPainter({required this.fill, required this.edge, this.accent});
  final Color fill;
  final Color edge;
  final Color? accent;

  @override
  void paint(Canvas canvas, Size size) {
    const r = 8.0;
    final w = size.width;
    final h = size.height;
    final outline = Path()
      ..moveTo(0, h)
      ..lineTo(0, r)
      ..quadraticBezierTo(0, 0, r, 0)
      ..lineTo(w - r, 0)
      ..quadraticBezierTo(w, 0, w, r)
      ..lineTo(w, h);
    canvas.drawPath(Path.from(outline)..close(), Paint()..color = fill);
    // Down over the ruled line, so the tab shown and the page are one sheet.
    if (accent != null) canvas.drawRect(Rect.fromLTWH(0.5, h - 1, w - 1, 1.5), Paint()..color = fill);
    canvas.drawPath(
      outline,
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    if (accent case final a?) {
      canvas.drawPath(
        Path()
          ..moveTo(1.5, r)
          ..quadraticBezierTo(1.5, 1.5, r, 1.5)
          ..lineTo(w - r, 1.5)
          ..quadraticBezierTo(w - 1.5, 1.5, w - 1.5, r),
        Paint()
          ..color = a
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5,
      );
    }
  }

  @override
  bool shouldRepaint(_TabPainter old) => old.fill != fill || old.edge != edge || old.accent != accent;
}
