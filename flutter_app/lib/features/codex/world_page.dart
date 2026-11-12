import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../workspace/organize_switch.dart';
import 'widgets/encyclopedia.dart';
import 'widgets/found_in_pages.dart';
import 'widgets/world_chart.dart';
import 'widgets/world_charter.dart';

/// THE WORLD: places, factions, items, powers, lore and the author's own kinds of record. Characters live in their own
/// library and are the same entries; they can be linked from here. The kinds are volumes on a shelf and the entries an
/// encyclopedia filed by letter (`widgets/encyclopedia.dart`).
class WorldPage extends ConsumerStatefulWidget {
  const WorldPage({super.key});

  @override
  ConsumerState<WorldPage> createState() => _WorldPageState();
}

class _WorldPageState extends ConsumerState<WorldPage> {
  final _search = TextEditingController();
  String? _category;
  String? _tag;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) {
      return PageScaffold(
        title: Destination.organize.label,
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'The world belongs to a novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => context.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final kinds = [
      for (final c in cast.model.categories.values)
        if (c.key != 'character') c,
    ]..sort((a, b) => a.order != b.order ? a.order.compareTo(b.order) : localeCompare(a.name, b.name));
    final all = [
      for (final e in cast.entries)
        if (e.category != 'character') e,
    ];
    final tags = {for (final e in all) ...e.tags}.toList()..sort(localeCompare);
    final query = _search.text;
    final visible = stableSorted([
      for (final e in all)
        if ((_category == null || e.category == _category) &&
            (_tag == null || e.tags.contains(_tag)) &&
            matchesEntry(e, query))
          e,
    ], (a, b) => localeCompare(a.name, b.name));
    int count(String key) => all.where((e) => e.category == key).length;
    Category kindOf(Entry e) => cast.model.categories[e.category] ?? Category.unknown(e.category);
    final compact = WindowSize.of(context) == WindowSize.compact;

    return PageScaffold(
      title: Destination.organize.label,
      subtitle: cast.novelTitle,
      actions: [
        PopupMenuButton<String>(
          tooltip: 'New entry',
          useRootNavigator: true,
          onSelected: (key) {
            final actions = CharacterActions(context, cast.novelId);
            final made = actions.now((c) => c.createEntry(key));
            if (made != null) actions.openEntry(made.id, character: false);
          },
          itemBuilder: (_) => [
            for (final k in kinds)
              if (!k.archived) PopupMenuItem(value: k.key, child: Text(k.singular)),
          ],
          child: IgnorePointer(
            child: FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.add), label: const Text('New entry')),
          ),
        ),
        OutlinedButton.icon(
          onPressed: () => context.go('/organize/world/kinds'),
          icon: const Icon(Icons.tune),
          label: const Text('Categories & fields'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: OrganizeSwitch(current: OrganizePart.world),
          ),
          const SizedBox(height: 16),
          // What the chapters name that the world does not hold yet, one press from it (`found_in_pages.dart`).
          FoundInPages(cast: cast),
          if (all.isEmpty)
            WorldCharter(novelId: cast.novelId, kinds: cast.model.categories)
          else ...[
            WorldVolumes(
              kinds: [
                for (final k in kinds)
                  if (!k.archived || count(k.key) > 0) k,
              ],
              count: count,
              total: all.length,
              selected: _category,
              onSelect: (key) => setState(() => _category = key),
            ),
            const SizedBox(height: 16),
            // The whole world as a sea chart: places as islands, what is linked to them on their shores, the rest
            // adrift and one press from a place (`widgets/world_chart.dart`).
            if (_category == null)
              WorldChart(
                model: cast.model,
                chapters: cast.chaptersOf(),
                kindOf: kindOf,
                title: cast.novelTitle,
                novelId: cast.novelId,
                onOpen: (e) => context.go(entryPath(e.id, character: false)),
              ),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: compact ? double.infinity : 300,
                  child: TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: 'Search names, tags, fields',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: query.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              onPressed: () => setState(_search.clear),
                              icon: const Icon(Icons.clear),
                            ),
                    ),
                  ),
                ),
                if (tags.isNotEmpty)
                  SizedBox(
                    width: compact ? double.infinity : 200,
                    child: DropdownButtonFormField<String?>(
                      initialValue: _tag,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Tag'),
                      items: [
                        const DropdownMenuItem<String?>(child: Text('All tags')),
                        for (final t in tags)
                          DropdownMenuItem<String?>(
                            value: t,
                            child: Text(t, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => _tag = v),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              visible.length == all.length
                  ? plural(all.length, 'entry', 'entries')
                  : '${formatNumber(visible.length)} of ${plural(all.length, 'entry', 'entries')}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            if (visible.isEmpty)
              NoResultsState(
                query: query.trim().isEmpty ? null : query.trim(),
                onClear: () => setState(() {
                  _search.clear();
                  _category = null;
                  _tag = null;
                }),
              )
            else
              Encyclopedia(
                entries: visible,
                kindOf: kindOf,
                mentions: cast.chaptersOf(),
                chapterCount: cast.model.order.chapters.length,
                onOpen: (e) => context.go(entryPath(e.id, character: false)),
              ),
          ],
        ],
      ),
    );
  }
}
