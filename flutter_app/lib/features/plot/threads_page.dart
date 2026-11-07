import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/plot/diagnostics.dart';
import '../../shared/domain/plot/plot_changes.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/text/fold.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../characters/widgets/vault.dart';
import '../workspace/area_switch.dart';
import 'plot_providers.dart';
import 'widgets/loom.dart';

const _groupings = {'status': 'Status', 'category': 'Category', 'character': 'Character'};

/// Plan → Plot threads: every storyline the reader will expect to be followed up, with where each develops. Reminders
/// about quiet threads are facts, never rulings: a thread stays exactly as the author marked it. Each thread is a strand
/// on a loom across the chapters, knotted where it develops (`widgets/loom.dart`).
class ThreadsPage extends ConsumerStatefulWidget {
  const ThreadsPage({super.key});

  @override
  ConsumerState<ThreadsPage> createState() => _ThreadsPageState();
}

class _ThreadsPageState extends ConsumerState<ThreadsPage> {
  String _query = '';
  String? _status;
  String? _category;
  bool _onlyFlagged = false;
  bool? _showFilters;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) {
      return PageScaffold(
        title: 'Plot threads',
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'Plot threads belong to one novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => PlotActions(context, '').router.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final theme = Theme.of(context);
    final actions = PlotActions(context, cast.novelId);
    final settings = ref.read(settingsStoreProvider);
    final grouping = _groupings.containsKey(settings.read('plot.group'))
        ? settings.read('plot.group')! as String
        : 'status';
    final quietKey = 'plot.quiet.${cast.novelId}';
    final quietAfter = settings.read(quietKey) is int ? settings.read(quietKey)! as int : defaultQuietAfter;
    final model = cast.model;
    final report = diagnose([...model.threads.values], [...model.nodes.values], quietAfter);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final showFilters = _showFilters ?? !compact;
    final needle = foldText(_query.trim());
    final visible = stableSorted([
      for (final r in report.reports)
        if ((_category == null || r.thread.category == _category) &&
            (_status == null || r.thread.statusKey == _status) &&
            (!_onlyFlagged || r.issues.isNotEmpty) &&
            (needle.isEmpty ||
                [
                  r.thread.title,
                  r.thread.premise,
                  categoryName(r.thread),
                  ...r.thread.beats.map((b) => b.title),
                ].any((t) => foldText(t).contains(needle))))
          r,
    ], (a, b) => localeCompare(a.thread.title, b.thread.title));
    final groups = <({String key, String heading, List<ThreadReport> items})>[];
    if (grouping == 'status') {
      for (final key in threadStatusOrder) {
        groups.add((
          key: key,
          heading: threadStatusLabels[key]!,
          items: [
            for (final r in visible)
              if (r.thread.statusKey == key) r,
          ],
        ));
      }
    } else if (grouping == 'category') {
      int rank(String name) {
        final i = threadCategories.indexWhere((c) => threadCategoryLabels[c] == name);
        return i == -1 ? threadCategories.length : i;
      }

      final names = stableSorted({for (final r in visible) categoryName(r.thread)}, (a, b) {
        final byRank = rank(a) - rank(b);
        return byRank != 0 ? byRank : localeCompare(a, b);
      });
      for (final name in names) {
        groups.add((
          key: name,
          heading: name,
          items: [
            for (final r in visible)
              if (categoryName(r.thread) == name) r,
          ],
        ));
      }
    } else {
      final cast0 = stableSorted({
        for (final r in visible)
          for (final id in r.thread.characterIds) ?model.entries[id],
      }, (a, b) => localeCompare(a.name, b.name));
      for (final c in cast0) {
        groups.add((
          key: c.id,
          heading: c.name,
          items: [
            for (final r in visible)
              if (r.thread.characterIds.contains(c.id)) r,
          ],
        ));
      }
      groups.add((
        key: 'nobody',
        heading: 'No character attached',
        items: [
          for (final r in visible)
            if (!r.thread.characterIds.any(model.entries.containsKey)) r,
        ],
      ));
    }
    final flagged = stableSorted([
      for (final r in report.reports)
        if (r.issues.isNotEmpty) r,
    ], (a, b) => localeCompare(a.thread.title, b.thread.title));
    final active = report.reports.where((r) => r.thread.statusKey == 'active').length;
    final usedCategories = [
      for (final c in threadCategories)
        if (report.reports.any((r) => r.thread.category == c)) c,
    ];
    void newThread() {
      final id = actions.edit((x) => x.createThread());
      if (id != null) actions.openThread(id);
    }

    Widget box(double width, Widget child) => SizedBox(width: compact ? double.infinity : width, child: child);
    return PageScaffold(
      title: 'Plot threads',
      subtitle:
          '${cast.novelTitle} · ${plural(report.reports.length, 'thread')}'
          '${report.reports.isNotEmpty ? ' · $active active' : ''}'
          '${flagged.isNotEmpty ? ' · ${flagged.length} to check' : ''}',
      actions: [FilledButton.icon(onPressed: newThread, icon: const Icon(Icons.add), label: const Text('New thread'))],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: planParts, current: '/plan/threads'),
          const SizedBox(height: 12),
          if (flagged.isNotEmpty) ...[
            ProfileBox(
              title: 'Worth a look',
              caption:
                  'These are reminders, not rulings. A thread stays exactly as you marked it until you change it yourself.',
              children: [
                for (final r in flagged)
                  for (final issue in r.issues)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          TextButton(onPressed: () => actions.openThread(r.thread.id), child: Text(r.thread.title)),
                          Text(issue.message),
                        ],
                      ),
                    ),
              ],
            ),
            const SizedBox(height: 16),
          ],
          if (report.reports.isNotEmpty) ...[
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), labelText: 'Search threads'),
              onChanged: (v) => setState(() => _query = v),
            ),
            if (compact)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => setState(() => _showFilters = !showFilters),
                  icon: Icon(showFilters ? Icons.expand_less : Icons.tune),
                  label: Text(showFilters ? 'Hide filters' : 'Filters and grouping'),
                ),
              ),
            if (showFilters) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SegmentedButton<String>(
                    segments: [for (final e in _groupings.entries) ButtonSegment(value: e.key, label: Text(e.value))],
                    selected: {grouping},
                    showSelectedIcon: false,
                    onSelectionChanged: (v) => setState(() => settings.write('plot.group', v.first)),
                  ),
                  box(
                    180,
                    DropdownButtonFormField<String>(
                      key: ValueKey('status:$_status'),
                      initialValue: _status ?? '',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Status'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('Any status')),
                        for (final s in threadStatusOrder)
                          DropdownMenuItem(value: s, child: Text(threadStatusLabels[s]!)),
                      ],
                      onChanged: (v) => setState(() => _status = v == null || v.isEmpty ? null : v),
                    ),
                  ),
                  box(
                    200,
                    DropdownButtonFormField<String>(
                      key: ValueKey('category:$_category'),
                      initialValue: _category ?? '',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('Any category')),
                        for (final c in usedCategories)
                          DropdownMenuItem(value: c, child: Text(threadCategoryLabels[c]!)),
                      ],
                      onChanged: (v) => setState(() => _category = v == null || v.isEmpty ? null : v),
                    ),
                  ),
                  box(
                    250,
                    DropdownButtonFormField<int>(
                      key: ValueKey('quiet:$quietAfter'),
                      initialValue: quietChoices.contains(quietAfter) ? quietAfter : defaultQuietAfter,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Flag quiet threads after'),
                      items: [
                        for (final n in quietChoices) DropdownMenuItem(value: n, child: Text('$n quiet chapters')),
                      ],
                      onChanged: (v) => setState(() => settings.write(quietKey, v ?? defaultQuietAfter)),
                    ),
                  ),
                  FilterChip(
                    label: const Text('To check only'),
                    selected: _onlyFlagged,
                    onSelected: (v) => setState(() => _onlyFlagged = v),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            if (report.chapterCount > 0) ...[const LoomLegend(), const SizedBox(height: 8)],
          ],
          if (report.reports.isEmpty)
            EmptyState(
              icon: Icons.timeline,
              title: 'Keep every promise you make',
              message:
                  'A thread is anything the reader will expect you to follow up: the main plot, a mystery, a romance, a line of foreshadowing. Record where each one develops, and you will be told when one has gone quiet for a long time.',
              action: FilledButton.icon(
                onPressed: newThread,
                icon: const Icon(Icons.add),
                label: const Text('New thread'),
              ),
            )
          else if (visible.isEmpty)
            NoResultsState(
              query: _query.trim().isEmpty ? null : _query.trim(),
              onClear: () => setState(() {
                _query = '';
                _status = null;
                _category = null;
                _onlyFlagged = false;
              }),
            )
          else
            for (final group in groups)
              if (group.items.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 6),
                  child: Semantics(
                    header: true,
                    child: Text(
                      '${group.heading}  ${group.items.length}',
                      style: vaultHeading(context, size: 15, weight: 700),
                    ),
                  ),
                ),
                for (final r in group.items)
                  ThreadStrandCard(
                    report: r,
                    cast: cast,
                    frontier: report.frontier,
                    chapterCount: report.chapterCount,
                    onOpen: () => actions.openThread(r.thread.id),
                  ),
              ],
          if (report.reports.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${report.frontier > 0 ? 'The manuscript has words up to chapter ${report.frontier} of ${report.chapterCount}; quiet threads are measured against that.' : 'Quiet threads are measured against the last chapter that has words. Nothing is written yet, so only gaps between developments are flagged.'}'
                '${visible.length != report.reports.length ? ' Showing ${visible.length} of ${report.reports.length} threads.' : ''}',
                style: theme.textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}
