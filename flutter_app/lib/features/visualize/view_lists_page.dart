import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/navigate.dart';
import '../../shared/domain/visualize/summaries.dart';
import '../../shared/domain/visualize/views.dart';
import '../characters/characters_providers.dart';
import 'visualize_providers.dart';
import 'viz_frame.dart';

/// The written form of a view whose drawing comes in a later phase: everything it will draw, in words, read from the
/// shared records. Character progression (as the original shows it: a table).
class ViewListPage extends ConsumerWidget {
  const ViewListPage({super.key, required this.view});

  final String view;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final me = viewOf(view)!;
    final state = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    return VizFrame(
      view: view,
      title: me.label,
      config: () => const {'mode': 'list'},
      onApply: (_) {},
      child: cast == null ? const SizedBox.shrink() : _content(context, cast, state, notifier),
    );
  }

  Widget _content(BuildContext context, CastData cast, VizState state, VizStateNotifier notifier) {
    final theme = Theme.of(context);
    final model = cast.model;
    final related = state.selection == null ? null : relatedIds(model, state.selection!);
    Widget row(EntityRef ref, String title, String subtitle, {int depth = 0}) {
      final mark = selectionWords(state, related, ref.id);
      return Padding(
        padding: EdgeInsetsDirectional.only(start: 16.0 * depth),
        child: Card(
          margin: const EdgeInsets.only(bottom: 6),
          color: mark == 'Selected'
              ? theme.colorScheme.secondaryContainer
              : (mark != null ? theme.colorScheme.surfaceContainerHighest : null),
          child: ListTile(
            title: Text(title.isEmpty ? 'Untitled' : title),
            subtitle: Text([subtitle, ?mark].where((s) => s.isNotEmpty).join(' · ')),
            selected: mark == 'Selected',
            onTap: () => notifier.select(ref),
          ),
        ),
      );
    }

    Widget empty(String title, String message) =>
        EmptyState(icon: Icons.insights_outlined, title: title, message: message);
    Widget noMatch() => NoResultsState(onClear: () => notifier.setFilter({}));
    final rows = progressionRows(model, cast.snapshot.rows('progressSnapshots'));
    final keep = matchingKeys(model, state.filter, [EntityType.entry]);
    final shown = [
      for (final r in rows)
        if (keep == null || keep.contains('entry:${r.id}')) r,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (rows.isEmpty)
          empty(
            'Nothing tracked yet',
            'Characters appear here once something about how they change is recorded: abilities on a sheet, snapshots or progression changes. Nobody is assumed to have a level.',
          )
        else if (shown.isEmpty)
          noMatch()
        else
          for (final r in shown)
            row(
              EntityRef(EntityType.entry, r.id),
              r.name,
              [
                if (r.now.isNotEmpty) r.now,
                if (r.abilities > 0) '${plural(r.abilities, 'ability', 'abilities')} on a sheet',
                if (r.snapshots > 0) plural(r.snapshots, 'snapshot'),
                if (r.changes > 0) plural(r.changes, 'change'),
              ].join(' · '),
            ),
      ],
    );
  }

  VisualView get me => viewOf(view)!;
}
