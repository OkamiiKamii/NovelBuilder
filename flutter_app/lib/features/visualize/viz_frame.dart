import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/domain/canon/overlay.dart';
import '../../shared/domain/codex/codex_changes.dart' show ChangeRefused;
import '../../shared/domain/graph/knowledge.dart' show refOf;
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/navigate.dart';
import '../../shared/domain/records/saved_view.dart';
import '../../shared/domain/visualize/modules.dart';
import '../../shared/domain/visualize/saved_views.dart';
import '../../shared/domain/visualize/views.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../codex/widgets/connections_panel.dart' show openRecord;
import '../exchange/data_export_dialog.dart';
import '../workspace/area_switch.dart';
import 'view_atlas.dart';
import 'visualize_providers.dart';
import 'widgets/canon_badge.dart';

const _icons = {
  'timeline': Icons.view_timeline_outlined,
  'order': Icons.compare_arrows,
  'relationships': Icons.hub_outlined,
  'plot': Icons.view_kanban_outlined,
  'graph': Icons.account_tree_outlined,
  'places': Icons.place_outlined,
  'progression': Icons.trending_up,
  'history': Icons.person_search_outlined,
  'structure': Icons.bar_chart,
  'appearances': Icons.grid_on,
  'kinds': Icons.category_outlined,
  'abilities': Icons.auto_awesome_outlined,
  'journeys': Icons.route_outlined,
  'knowledge': Icons.lock_outline,
  'factions': Icons.groups_outlined,
  'ownership': Icons.inventory_2_outlined,
  'charts': Icons.bar_chart_outlined,
};

final _pictureKeys = <String, GlobalKey>{};

/// One key per view for its picture, the same on every rebuild, so the view keeps its state.
GlobalKey vizPictureKey(String view) => _pictureKeys.putIfAbsent(view, () => GlobalKey(debugLabel: 'picture of $view'));

/// The views a novel offers now: those built so far that it has not turned off.
List<AreaPart> offeredViews(List<String> viewsOff) => [
  for (final v in viewsOn(viewsOff))
    if (isBuilt(v)) AreaPart(v.label, v.path, _icons[v.key] ?? Icons.insights),
];

List<String> viewsOffOf(CastData cast) => strings(cast.snapshot.project['viewsOff']);

/// Every view sits in the same frame: the view picker, the shared filters, saved views, the view itself, and the
/// details of what is selected. The frame reads and writes nothing of the novel's records.
class VizFrame extends ConsumerWidget {
  const VizFrame({
    super.key,
    required this.view,
    required this.title,
    required this.child,
    required this.config,
    required this.onApply,
    this.subtitle,
    this.actions = const [],
    this.filters = true,
  });

  /// The view's key, as saved views and the novel's `viewsOff` name it.
  final String view;
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final Widget child;

  /// What the view shows now, besides the shared filters: its mode, layers, scale and layout.
  final JsonMap Function() config;

  /// Shows what a saved view keeps (its mode, layers, scale and layout).
  final void Function(JsonMap config) onApply;

  /// Whether the shared filters narrow this view.
  final bool filters;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    if (cast == null) {
      return PageScaffold(
        title: Destination.visualize.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No novel open',
              message: 'Visualize works inside one novel. Open one from the Library.',
              action: FilledButton(
                onPressed: () => CharacterActions(context, '').router.go(Destination.library.path),
                child: const Text('Go to Library'),
              ),
            ),
          ],
        ),
      );
    }
    final actions = CharacterActions(context, cast.novelId);
    final off = viewsOffOf(cast);
    final me = viewOf(view)!;
    final parts = offeredViews(off);
    if (!isViewOn(off, view)) {
      return PageScaffold(
        title: me.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (parts.isNotEmpty) ...[
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: SizedBox(
                  width: 280,
                  child: _ViewMenu(parts: parts, current: null, onGo: (path) => context.go(path)),
                ),
              ),
              const SizedBox(height: 16),
            ],
            EmptyState(
              icon: Icons.visibility_off_outlined,
              title: 'This view is turned off in this novel',
              message:
                  'Its records are all still there, on their own pages and in the other views, and its saved views are kept. Turning it on brings it back as it was.',
              action: FilledButton(
                onPressed: () => _turnOn(context, ref, cast.novelId, off, view),
                child: const Text('Turn this view on'),
              ),
            ),
          ],
        ),
      );
    }
    final state = ref.watch(vizStateProvider);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final selectedLabel = state.selection == null ? null : cast.model.resolve(state.selection!)?.label;
    return PageScaffold(
      title: title,
      subtitle: subtitle,
      maxWidth: 1400,
      actions: actions_(context, ref, cast, off),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // The views are one menu, beside the search, the character filter and the saved views: one row on a wide
          // screen, so the view itself starts near the top.
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: compact ? double.infinity : 280,
                child: _ViewMenu(parts: parts, current: me.path, onGo: actions.router.go),
              ),
              if (filters) _FilterBar(cast: cast),
              _SavedViewsBar(view: view, cast: cast, config: config, onApply: onApply),
            ],
          ),
          if (state.missing > 0) ...[
            const SizedBox(height: 6),
            Semantics(
              liveRegion: true,
              child: Text(
                state.missing == 1
                    ? '1 record this saved view names no longer exists; it shows the rest.'
                    : '${state.missing} records this saved view names no longer exist; it shows the rest.',
              ),
            ),
          ],
          if (_markedViews.containsKey(view)) ...[const SizedBox(height: 8), _MarksBar(view: view)],
          // On a phone the details open over the view, so they are never a long scroll away.
          if (compact && state.selection != null) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('Selected: ${selectedLabel ?? 'a record no longer here'}'),
                TextButton(
                  onPressed: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => DraggableScrollableSheet(
                      expand: false,
                      initialChildSize: 0.6,
                      maxChildSize: 0.95,
                      builder: (context, scroll) => Consumer(
                        builder: (context, ref, _) {
                          final now = ref.watch(vizStateProvider).selection;
                          final fresh = ref.watch(castProvider);
                          if (now == null || fresh == null) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (context.mounted) Navigator.of(context).maybePop();
                            });
                            return const SizedBox.shrink();
                          }
                          return SingleChildScrollView(
                            controller: scroll,
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                            child: RecordDetailsPanel(cast: fresh, selection: now, actions: actions),
                          );
                        },
                      ),
                    ),
                  ),
                  child: const Text('Details'),
                ),
                TextButton(
                  onPressed: () => ref.read(vizStateProvider.notifier).select(null),
                  child: const Text('Clear'),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          // What a picture of the view is made from: the view as drawn, without the frame's controls.
          RepaintBoundary(key: vizPictureKey(view), child: child),
          if (!compact)
            if (state.selection case final selection?) ...[
              const SizedBox(height: 16),
              RecordDetailsPanel(cast: cast, selection: selection, actions: actions),
            ],
        ],
      ),
    );
  }

  List<Widget> actions_(BuildContext context, WidgetRef ref, CastData cast, List<String> off) => [
    ...actions,
    IconButton(
      tooltip: 'Export this view',
      onPressed: () {
        final filter = ref.read(vizStateProvider).filter;
        final keys = filters ? matchingKeys(cast.model, filter, EntityType.values) : null;
        final ids = keys == null ? null : {for (final k in keys) k.substring(k.indexOf(':') + 1)};
        showDataExportDialog(
          context,
          source: CastSource(cast.snapshot, cast.model),
          view: ExportedView(
            key: view,
            filter: filters ? filter : const {},
            config: config(),
            keep: (id) => ids == null || ids.contains(id),
            picture: vizPictureKey(view),
          ),
        );
      },
      icon: const Icon(Icons.ios_share),
    ),
    IconButton(
      tooltip: 'Turn views on or off',
      onPressed: () => showDialog<void>(
        context: context,
        builder: (_) => _ManageViews(novelId: cast.novelId),
      ),
      icon: const Icon(Icons.tune),
    ),
  ];
}

void _turnOn(BuildContext context, WidgetRef ref, String novelId, List<String> off, String key) {
  final (off: next, :alsoOn) = turnOn(off, key);
  ref.read(visualizeServiceProvider).change(novelId, (x) => x.setViewsOff(next));
  if (alsoOn.isNotEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${viewLabel(key)} is on, with ${alsoOn.map(viewLabel).join(' and ')}, which it needs.')),
    );
  }
}

/// The shared filters: search by name, and records involving a character (the character, or anything with a
/// recorded connection to them). Every view filters through the same query.
class _FilterBar extends ConsumerStatefulWidget {
  const _FilterBar({required this.cast});
  final CastData cast;

  @override
  ConsumerState<_FilterBar> createState() => _FilterBarState();
}

class _FilterBarState extends ConsumerState<_FilterBar> {
  late final _search = TextEditingController(text: str(ref.read(vizStateProvider).filter['text']));

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(vizStateProvider).filter;
    final notifier = ref.read(vizStateProvider.notifier);
    final text = str(filter['text']);
    if (text != _search.text.trim()) _search.text = text;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final characters = widget.cast.characters();
    final involving = strings(filter['characters']);
    final chosen = involving.isNotEmpty && characters.any((c) => c.id == involving.first) ? involving.first : '';
    final count = activeFilters(filter);
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: compact ? double.infinity : 240,
          child: TextField(
            controller: _search,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), labelText: 'Search by name'),
            onChanged: (v) => notifier.setFilter({...filter, 'text': v}),
          ),
        ),
        SizedBox(
          width: compact ? double.infinity : 240,
          child: DropdownButtonFormField<String>(
            key: ValueKey('involving:$chosen'),
            initialValue: chosen,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Involving character'),
            items: [
              const DropdownMenuItem(value: '', child: Text('Anyone')),
              for (final c in characters)
                DropdownMenuItem(
                  value: c.id,
                  child: Text(c.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => notifier.setFilter({
              ...filter,
              'characters': v == null || v.isEmpty ? <String>[] : [v],
            }),
          ),
        ),
        if (count > 0)
          TextButton(
            onPressed: () {
              _search.clear();
              notifier.setFilter({});
            },
            child: Text('Clear filters ($count)'),
          ),
      ],
    );
  }
}

/// Saved views of this view: open one, save what is shown under a name, and keep them up to date. A saved view holds
/// settings and record ids only; opening one reads the records as they are now.
class _SavedViewsBar extends ConsumerWidget {
  const _SavedViewsBar({required this.view, required this.cast, required this.config, required this.onApply});

  final String view;
  final CastData cast;
  final JsonMap Function() config;
  final void Function(JsonMap config) onApply;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final state = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    final service = ref.read(visualizeServiceProvider);
    final saved = [
      for (final r in cast.snapshot.rows('savedViews'))
        if (r['view'] == view) SavedView(r),
    ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    final open = saved.where((s) => s.id == state.openSaved[view]).firstOrNull;
    JsonMap current() => cleanConfig({...config(), 'filter': state.filter});
    final changed = open != null && !jsonEquals(current(), cleanConfig(open.raw));
    void tell(String message) =>
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), persist: false));
    T? run<T>(T Function(SavedViewChanges x) apply) {
      try {
        return service.change(cast.novelId, apply);
      } on ChangeRefused catch (e) {
        tell(e.message);
      }
      return null;
    }

    void openView(SavedView s) {
      final opened = openSaved(cast.model, s.filter);
      notifier.openSaved(view, s.id, filter: opened.filter, missing: opened.missing.length);
      onApply(cleanConfig(s.raw));
    }

    Future<void> act(String action) async {
      switch (action) {
        case 'save-as':
          final name = await showTextPrompt(
            context,
            title: 'Save this view',
            label: 'Name of the saved view',
            confirmLabel: 'Save',
          );
          if (name == null) return;
          final id = run((x) => x.save(view, name, current()));
          if (id != null) notifier.openSaved(view, id);
        case 'save':
          run((x) => x.update(open!.id, current()));
        case 'rename':
          final name = await showTextPrompt(
            context,
            title: 'Rename the saved view',
            label: 'Name',
            initial: open!.name,
            confirmLabel: 'Rename',
          );
          if (name != null) run((x) => x.rename(open.id, name));
        case 'duplicate':
          final id = run((x) => x.duplicate(open!.id));
          if (id != null) notifier.openSaved(view, id);
        case 'restore':
          run((x) => x.restoreDefault(open!.id));
          notifier.openSaved(view, open!.id, filter: const {});
          onApply(defaultViewConfig());
        case 'delete':
          if (!context.mounted) return;
          final yes = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: Text('Delete the saved view “${open!.name}”?'),
              content: const Text('Only the saved view goes. No record is changed.'),
              actions: [
                TextButton(
                  autofocus: true,
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Cancel'),
                ),
                FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Delete')),
              ],
            ),
          );
          if (yes == true) {
            run((x) => x.removeView(open!.id));
            notifier.openSaved(view, null);
          }
        case 'plain':
          notifier.openSaved(view, null, filter: const {});
          onApply(defaultViewConfig());
        default:
          final s = saved.where((s) => s.id == action).firstOrNull;
          if (s != null) openView(s);
      }
    }

    return Wrap(
      spacing: 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        PopupMenuButton<String>(
          tooltip: 'Saved views',
          useRootNavigator: true,
          onSelected: act,
          itemBuilder: (_) => [
            if (saved.isEmpty) const PopupMenuItem(enabled: false, child: Text('No saved views of this view yet')),
            for (final s in saved) CheckedPopupMenuItem(value: s.id, checked: s.id == open?.id, child: Text(s.name)),
            const PopupMenuDivider(),
            const PopupMenuItem(value: 'save-as', child: Text('Save view as…')),
            if (open != null) ...[
              PopupMenuItem(value: 'save', enabled: changed, child: Text('Save changes to “${open.name}”')),
              const PopupMenuItem(value: 'rename', child: Text('Rename…')),
              const PopupMenuItem(value: 'duplicate', child: Text('Duplicate')),
              const PopupMenuItem(value: 'restore', child: Text('Restore default')),
              const PopupMenuItem(value: 'delete', child: Text('Delete…')),
              const PopupMenuItem(value: 'plain', child: Text('Close the saved view')),
            ],
          ],
          // At least 48 pixels tall, so it is easy to tap.
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.bookmarks_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    open == null ? 'Saved views (${saved.length})' : 'Saved view: ${open.name}',
                    style: TextStyle(color: theme.colorScheme.primary),
                  ),
                ),
                Icon(Icons.arrow_drop_down, color: theme.colorScheme.primary),
              ],
            ),
          ),
        ),
        if (changed) TextButton(onPressed: () => act('save'), child: Text('Save changes to “${open.name}”')),
      ],
    );
  }
}

/// Where a record is kept, as the rest of the app opens it; null when it has no page in this app yet.
String? openLabel(CastData cast, EntityRef ref) => switch (ref.type) {
  EntityType.entry => cast.model.entries[ref.id]?.category == 'character' ? 'Open character profile' : 'Open in World',
  EntityType.node => 'Open in the editor',
  EntityType.event => 'Open the event',
  EntityType.relation => 'Open the relationship',
  _ => null,
};

/// The selected record's details, the same in every view: its facts, and everything it is connected to, each of which
/// can be selected in turn. It opens on the page where it is kept.
class RecordDetailsPanel extends ConsumerWidget {
  const RecordDetailsPanel({super.key, required this.cast, required this.selection, required this.actions});

  final CastData cast;
  final EntityRef selection;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final notifier = ref.read(vizStateProvider.notifier);
    final details = detailsOf(cast.model, selection);
    final close = IconButton(
      tooltip: 'Close the details',
      onPressed: () => notifier.select(null),
      icon: const Icon(Icons.close),
    );
    if (details == null) {
      return ProfileBox(
        title: 'Not found',
        trailing: close,
        children: [
          const Text('This record is no longer in this novel; it may have been deleted. Nothing else has changed.'),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(onPressed: () => notifier.select(null), child: const Text('Clear the selection')),
          ),
        ],
      );
    }
    final open = openLabel(cast, selection);
    return Semantics(
      container: true,
      label: 'Details of ${details.view.label}',
      child: ProfileBox(
        title: details.view.label,
        trailing: Wrap(
          spacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (open != null)
              FilledButton.tonal(onPressed: () => openRecord(actions, cast, selection), child: Text(open)),
            close,
          ],
        ),
        children: [
          for (final f in details.facts)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: '${f.label}: ',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: f.value),
                  ],
                ),
              ),
            ),
          for (final g in details.groups) ...[
            const SizedBox(height: 8),
            Semantics(header: true, child: Text(g.title, style: theme.textTheme.titleSmall)),
            Wrap(
              spacing: 4,
              children: [
                for (final i in g.items)
                  TextButton(
                    onPressed: () => notifier.select(i.ref),
                    child: Text(i.note.isEmpty ? i.label : '${i.label} · ${i.note}'),
                  ),
              ],
            ),
          ],
          if (details.groups.isEmpty) const NotRecorded('Not connected to anything yet.'),
          _SelectionMarks(selection: selection, actions: actions),
        ],
      ),
    );
  }
}

/// How a row of a list stands to the selection, in words as well as shading.
String? selectionWords(VizState state, Set<String>? related, String id) {
  if (state.selection?.id == id) return 'Selected';
  if (related != null && related.contains(id)) return 'Connected to the selection';
  return null;
}

/// Turning views off and on. Off, a view is hidden; nothing is deleted, and its saved views are kept.
class _ManageViews extends ConsumerWidget {
  const _ManageViews({required this.novelId});
  final String novelId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final off = cast == null ? const <String>[] : viewsOffOf(cast);
    final service = ref.read(visualizeServiceProvider);
    void set(List<String> next) => service.change(novelId, (x) => x.setViewsOff(next));
    final built = [
      for (final v in visualViews)
        if (isBuilt(v)) v,
    ];
    final coming = [
      for (final v in visualViews)
        if (!isBuilt(v)) v,
    ];
    return AlertDialog(
      title: const Text('Views in this novel'),
      scrollable: true,
      content: SizedBox(
        width: 520,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'A view that is off is hidden from Visualize. Nothing is deleted: its records stay on their own pages and in the other views, and its saved views are kept.',
            ),
            const SizedBox(height: 8),
            for (final v in built)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: isViewOn(off, v.key),
                title: Text(v.label),
                subtitle: Text(v.description, maxLines: 3, overflow: TextOverflow.ellipsis),
                onChanged: (on) {
                  if (on) {
                    set(turnOn(off, v.key).off);
                    return;
                  }
                  final result = turnOff(off, [v.key]);
                  if (result.blocked.isEmpty) {
                    set(result.off);
                    return;
                  }
                  final by = result.blocked.first.by;
                  showDialog<void>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: Text('${v.label} stays on'),
                      content: Text(
                        '${v.label} stays on while ${by.map((b) => viewLabel(b.key)).join(' and ')} ${by.length == 1 ? 'is' : 'are'} on: ${by.map((b) => '${viewLabel(b.key)} needs it, because ${b.why}').join('; ')}.',
                      ),
                      actions: [
                        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Keep ${v.label} on')),
                        FilledButton(
                          onPressed: () {
                            set(turnOff(off, [v.key, ...by.map((b) => b.key)]).off);
                            Navigator.of(context).pop();
                          },
                          child: Text('Turn off ${[...by.map((b) => viewLabel(b.key)), v.label].join(' and ')}'),
                        ),
                      ],
                    ),
                  );
                },
              ),
            if (coming.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Coming in later phases', style: Theme.of(context).textTheme.titleSmall),
              for (final v in coming) Text('${v.label} (phase ${v.phase})'),
            ],
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done'))],
    );
  }
}

/// The views canon and continuity marks are laid over, and the kinds of record each draws.
const _markedViews = {
  'timeline': ['event'],
  'relationships': ['entry', 'relation', 'link'],
  'plot': ['thread', 'node'],
  'graph': <String>[],
};

/// Turning the canon and continuity marks on, and what is marked in this view, in words: every marked record, its
/// status and how many findings are still open about it, each selectable.
class _MarksBar extends ConsumerWidget {
  const _MarksBar({required this.view});
  final String view;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final on = ref.watch(canonMarksProvider);
    final marks = ref.watch(canonMarksOfProvider);
    final cast = ref.watch(castProvider);
    final theme = Theme.of(context);
    final kinds = _markedViews[view]!;
    final shown = marks == null || cast == null
        ? const <MapEntry<String, OverlayMark>>[]
        : [
            for (final e in marks.entries)
              if ((kinds.isEmpty || kinds.contains(e.key.split(':').first)) && badgeOf(e.value) != null) e,
          ];
    String name(String key) {
      final ref = refOf(key);
      if (ref != null && cast != null) {
        if (cast.model.resolve(ref)?.label case final label?) return label;
      }
      if (key.startsWith('link:') && cast != null) {
        final link = cast.model.links.where((l) => 'link:${l.id}' == key).firstOrNull;
        if (link != null) {
          return '${cast.model.resolve(link.from)?.label ?? '?'} – ${cast.model.resolve(link.to)?.label ?? '?'}';
        }
      }
      return 'A record';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            FilterChip(
              avatar: const Icon(Icons.flag_outlined, size: 18),
              label: const Text('Canon & continuity marks'),
              selected: on,
              onSelected: (v) => ref.read(canonMarksProvider.notifier).set(v),
            ),
            if (on)
              Text(
                shown.isEmpty
                    ? 'Nothing marked here: no canon status set, and no open finding.'
                    : '${shown.length} ${shown.length == 1 ? 'record' : 'records'} marked here.',
                style: theme.textTheme.bodySmall,
              ),
          ],
        ),
        if (on && shown.isNotEmpty)
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text('Marked records, in words'),
            childrenPadding: const EdgeInsets.only(bottom: 8),
            children: [
              Text(
                'A mark is a record’s canon status when it is not plain canon (? provisional, ≠ conflicting, ↺ '
                'retconned, ✕ non-canon, A an alternate branch), and ! with how many findings about it are still open. '
                'Decided findings are left out.',
                style: theme.textTheme.bodySmall,
              ),
              for (final e in shown)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: CanonBadgeChip(badgeOf(e.value)!),
                  title: Text(name(e.key)),
                  subtitle: Text(markWords(e.value)),
                  onTap: refOf(e.key) == null ? null : () => ref.read(vizStateProvider.notifier).select(refOf(e.key)),
                ),
            ],
          ),
      ],
    );
  }
}

/// The selected record's canon status and open findings, when the marks are on: each with its rule and where it is
/// checked.
class _SelectionMarks extends ConsumerWidget {
  const _SelectionMarks({required this.selection, required this.actions});
  final EntityRef selection;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final marks = ref.watch(canonMarksOfProvider);
    final mark = marks?['${selection.type.name}:${selection.id}'];
    if (mark == null || (mark.status == null && mark.warnings.isEmpty)) return const SizedBox.shrink();
    final theme = Theme.of(context);
    const pages = {
      OverlaySource.records: '/review/records',
      OverlaySource.timeline: '/review/timeline',
      OverlaySource.canon: '/review/canon',
      OverlaySource.continuity: '/review/continuity',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Semantics(header: true, child: Text('Canon and continuity', style: theme.textTheme.titleSmall)),
        if (mark.status case final s?) Text('Canon status: ${s.label}. ${s.hint}'),
        for (final w in mark.warnings)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${w.severity.label} · ${w.title}. ${w.message}'),
                Text('The rule: ${w.rule}', style: theme.textTheme.bodySmall),
                Text('Because: ${w.because}', style: theme.textTheme.bodySmall),
                TextButton(
                  onPressed: () {
                    actions.flush();
                    actions.router.go(pages[w.source]!);
                  },
                  child: Text('Where it is checked: ${w.source.label}'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// The views of Visualize as one menu, each with its icon.
class _ViewMenu extends StatelessWidget {
  const _ViewMenu({required this.parts, required this.current, required this.onGo});
  final List<AreaPart> parts;
  final String? current;
  final ValueChanged<String> onGo;

  /// The view shown, as a field: a press opens the atlas of every view (`view_atlas.dart`).
  @override
  Widget build(BuildContext context) {
    final shown = parts.where((p) => p.path == current).firstOrNull;
    void open() => showViewAtlas(context, parts: parts, current: current, onGo: onGo);
    return Tooltip(
      message: 'All views',
      child: Semantics(
        button: true,
        label: 'View: ${shown?.label ?? 'choose a view'}. All views',
        excludeSemantics: true,
        onTap: open,
        child: InkWell(
          onTap: open,
          // At least 48 tall, to be easy to press.
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'View', isDense: true),
              child: Row(
                children: [
                  if (shown != null) ...[Icon(shown.icon, size: 20), const SizedBox(width: 8)],
                  Expanded(child: Text(shown?.label ?? 'Choose a view', overflow: TextOverflow.ellipsis)),
                  const Icon(Icons.apps, size: 20),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
