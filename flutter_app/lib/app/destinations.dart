import 'package:flutter/material.dart';

/// The app's top-level areas, in the order of the specification (section 4).
///
/// The order here is also the keyboard order: Cmd/Ctrl+1 is [library], Cmd/Ctrl+8 is [settings].
enum Destination {
  library(
    path: '/',
    label: 'Library',
    icon: Icons.collections_bookmark_outlined,
    selectedIcon: Icons.collections_bookmark,
    needsNovel: false,
  ),
  write(path: '/write', label: 'Write', icon: Icons.edit_note_outlined, selectedIcon: Icons.edit_note),
  organize(path: '/organize', label: 'Organize', icon: Icons.people_outline, selectedIcon: Icons.people),
  plan(path: '/plan', label: 'Plan', icon: Icons.view_kanban_outlined, selectedIcon: Icons.view_kanban),
  visualize(path: '/visualize', label: 'Visualize', icon: Icons.hub_outlined, selectedIcon: Icons.hub),
  review(path: '/review', label: 'Review', icon: Icons.fact_check_outlined, selectedIcon: Icons.fact_check),
  progress(path: '/progress', label: 'Progress', icon: Icons.insights_outlined, selectedIcon: Icons.insights),
  settings(
    path: '/settings',
    label: 'Settings',
    icon: Icons.settings_outlined,
    selectedIcon: Icons.settings,
    needsNovel: false,
  );

  const Destination({
    required this.path,
    required this.label,
    required this.icon,
    required this.selectedIcon,
    this.needsNovel = true,
  });

  final String path;
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  /// Whether the area works inside one open novel (everything except the library and settings).
  final bool needsNovel;

  /// The destination a location belongs to, or null for one outside the main areas.
  static Destination? forLocation(String location) {
    final path = Uri.parse(location).path;
    if (path == '/' || path.isEmpty) return library;
    for (final d in values) {
      if (d != library && (path == d.path || path.startsWith('${d.path}/'))) return d;
    }
    return null;
  }
}
