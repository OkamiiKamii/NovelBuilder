import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'area_switch.dart';

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

/// Moves between the parts of Organize, as the same index tabs as every area (`area_switch.dart`).
class OrganizeSwitch extends StatelessWidget {
  const OrganizeSwitch({super.key, required this.current});

  final OrganizePart current;

  @override
  Widget build(BuildContext context) => IndexTabs(
    tabs: [
      for (final p in OrganizePart.values)
        (
          label: p.label,
          icon: p.icon,
          selected: p == current,
          onTap: () {
            if (p != current) context.go(p.path);
          },
        ),
    ],
  );
}
