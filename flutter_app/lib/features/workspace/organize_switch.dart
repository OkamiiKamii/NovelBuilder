import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/breakpoints.dart';

/// The parts of Organize: the cast, the rest of the world, the systems characters grow by, and the genre modules.
enum OrganizePart {
  characters('Characters', '/organize', Icons.people_outline),
  world('World', '/organize/world', Icons.public),
  systems('Systems', '/organize/systems', Icons.account_tree_outlined),
  modules('Modules', '/organize/modules', Icons.extension_outlined);

  const OrganizePart(this.label, this.path, this.icon);
  final String label;
  final String path;
  final IconData icon;
}

class OrganizeSwitch extends StatelessWidget {
  const OrganizeSwitch({super.key, required this.current});

  final OrganizePart current;

  @override
  // Sideways scrolling keeps every part on one line when the text is large.
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: SegmentedButton<OrganizePart>(
      // On a phone the labels alone fit on one line.
      segments: [
        for (final p in OrganizePart.values)
          ButtonSegment(
            value: p,
            icon: WindowSize.of(context) == WindowSize.compact ? null : Icon(p.icon),
            label: Text(p.label),
          ),
      ],
      selected: {current},
      showSelectedIcon: false,
      onSelectionChanged: (v) => context.go(v.first.path),
    ),
  );
}
