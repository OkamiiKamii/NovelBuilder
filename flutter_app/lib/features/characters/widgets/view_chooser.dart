import 'package:flutter/material.dart';

import '../../../core/motion/motion.dart';
import '../characters_providers.dart';
import 'vault.dart';

/// A way to see the cast: the view, its icon and name, the group it is in, and what it shows, in a line.
typedef CastViewInfo = ({CastView view, IconData icon, String name, String group, String about});

/// The ways to see the cast, in the order they are offered, grouped: the cast itself, what is between them, and what
/// the pages say of them.
const castViews = <CastViewInfo>[
  (
    view: CastView.cards,
    icon: Icons.grid_view,
    name: 'Cards',
    group: 'The cast',
    about: 'Their portraits, how well each is known, and whom to interview next.',
  ),
  (
    view: CastView.list,
    icon: Icons.view_list,
    name: 'List',
    group: 'The cast',
    about: 'A compact list, in the order you choose.',
  ),
  (
    view: CastView.roll,
    icon: Icons.table_rows_outlined,
    name: 'Roll call',
    group: 'The cast',
    about: 'Everyone’s basics in one table, written in place.',
  ),
  (
    view: CastView.names,
    icon: Icons.sort_by_alpha,
    name: 'Names',
    group: 'The cast',
    about: 'Every name on a board of the alphabet: the look-alikes and the free letters.',
  ),
  (
    view: CastView.ties,
    icon: Icons.hub_outlined,
    name: 'Ties',
    group: 'Between them',
    about: 'Every pair, who they are to each other, one press to record it.',
  ),
  (
    view: CastView.stakes,
    icon: Icons.flag_outlined,
    name: 'Stakes',
    group: 'Between them',
    about: 'What drives each of them, and where their wants collide.',
  ),
  (
    view: CastView.compass,
    icon: Icons.explore_outlined,
    name: 'Compass',
    group: 'Between them',
    about: 'Their temperaments side by side: the foils, the ones too alike, what all share.',
  ),
  (
    view: CastView.orbit,
    icon: Icons.track_changes,
    name: 'Orbit',
    group: 'Between them',
    about: 'The cast circling the heart of the book, and the one to know next.',
  ),
  (
    view: CastView.eyes,
    icon: Icons.visibility_outlined,
    name: 'Eyes',
    group: 'In your pages',
    about: 'Whose eyes each chapter is told through.',
  ),
  (
    view: CastView.entrances,
    icon: Icons.door_front_door_outlined,
    name: 'Entrances',
    group: 'In your pages',
    about: 'The order a reader meets them, and what each first moment gives.',
  ),
  (
    view: CastView.tableRead,
    icon: Icons.theater_comedy_outlined,
    name: 'Table read',
    group: 'In your pages',
    about: 'A chapter as a script, read aloud by the cast, each in a voice of their own.',
  ),
  (
    view: CastView.arcs,
    icon: Icons.show_chart,
    name: 'Arcs',
    group: 'In your pages',
    about: 'Each one’s line through the book, from the feeling in the words around them.',
  ),
];

/// The way of seeing [view].
CastViewInfo infoOf(CastView view) => castViews.firstWhere((v) => v.view == view);

/// THE VIEW CHOOSER, on a phone: the view in use, by its icon and name, in place of a strip of icons that runs off the
/// screen. Pressed, **Ways to see your cast**: every view by name, what it shows in a line, in its group, the one in
/// use marked; a press on one shows it.
class CastViewButton extends StatelessWidget {
  const CastViewButton({super.key, required this.view, required this.onPick});

  final CastView view;
  final ValueChanged<CastView> onPick;

  @override
  Widget build(BuildContext context) {
    final info = infoOf(view);
    return FilledButton.tonalIcon(
      key: const ValueKey('cast-views'),
      onPressed: () async {
        final picked = await showCastViews(context, view);
        if (picked != null && picked != view) onPick(picked);
      },
      style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
      icon: Icon(info.icon, size: 18),
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(info.name, semanticsLabel: 'Seeing the cast as ${info.name}. Ways to see your cast'),
          const Icon(Icons.arrow_drop_down, size: 20),
        ],
      ),
    );
  }
}

/// Every way to see the cast, in a sheet; the one chosen, or null.
Future<CastView?> showCastViews(BuildContext context, CastView current) => showModalBottomSheet<CastView>(
  context: context,
  sheetAnimationStyle: sheetMotion(context),
  // Over the whole app, the bar at the foot of the screen included, so every view is in sight.
  useRootNavigator: true,
  showDragHandle: true,
  isScrollControlled: true,
  builder: (sheet) {
    final scheme = Theme.of(sheet).colorScheme;
    final groups = <String, List<CastViewInfo>>{};
    for (final v in castViews) {
      groups.putIfAbsent(v.group, () => []).add(v);
    }
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheet).height * 0.85),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Ways to see your cast', style: vaultHeading(sheet, size: 19, weight: 700)),
              const SizedBox(height: 2),
              Text(
                'The same cast, many ways: each shows something the others do not.',
                style: vaultText(sheet, size: 14.5, color: scheme.onSurfaceVariant),
              ),
              for (final MapEntry(key: group, value: views) in groups.entries) ...[
                const SizedBox(height: 14),
                Text(
                  group.toUpperCase(),
                  style: vaultHeading(
                    sheet,
                    size: 11.5,
                    color: scheme.primary,
                    weight: 700,
                  ).copyWith(letterSpacing: 1.6),
                ),
                const SizedBox(height: 6),
                for (final v in views) _ViewTile(info: v, chosen: v.view == current),
              ],
            ],
          ),
        ),
      ),
    );
  },
);

class _ViewTile extends StatelessWidget {
  const _ViewTile({required this.info, required this.chosen});

  final CastViewInfo info;
  final bool chosen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Semantics(
        selected: chosen,
        button: true,
        child: Material(
          color: chosen ? scheme.primary.withValues(alpha: 0.12) : scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            key: ValueKey('view-${info.view.name}'),
            borderRadius: BorderRadius.circular(12),
            onTap: () => Navigator.of(context).pop(info.view),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: chosen ? scheme.primary : scheme.primary.withValues(alpha: 0.12),
                    ),
                    child: Icon(info.icon, size: 21, color: chosen ? scheme.onPrimary : scheme.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(info.name, style: vaultHeading(context, size: 15.5, color: scheme.onSurface, weight: 700)),
                        Text(info.about, style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                  if (chosen) Icon(Icons.check_circle, color: scheme.primary),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
