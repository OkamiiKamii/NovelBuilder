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

/// Moves between the parts of an area. Chips wrap onto more lines rather than squeeze, so they fit a phone at any
/// text size.
class AreaSwitch extends StatelessWidget {
  const AreaSwitch({super.key, required this.parts, required this.current});

  final List<AreaPart> parts;

  /// The path of the part shown now.
  final String current;

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    label: 'Views',
    child: Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        for (final p in parts)
          ChoiceChip(
            avatar: Icon(p.icon, size: 18),
            label: Text(p.label),
            selected: p.path == current,
            showCheckmark: false,
            onSelected: (_) {
              if (p.path != current) context.go(p.path);
            },
          ),
      ],
    ),
  );
}
