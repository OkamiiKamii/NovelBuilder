import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/cast.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/text/fold.dart';
import '../workspace/open_novel.dart';
import '../workspace/organize_switch.dart';
import 'character_actions.dart';
import 'characters_providers.dart';
import 'new_character_dialog.dart';
import 'widgets/cast_card.dart';
import 'widgets/cast_ties.dart';
import 'widgets/manuscript_names.dart';
import 'widgets/portrait.dart';

const _page = 60;

/// CHARACTER LIBRARY: where the cast is found and managed. Every card and row is one of the novel's character records;
/// searching, filtering and sorting only choose among them. Selecting one opens its profile.
class CharactersPage extends ConsumerStatefulWidget {
  const CharactersPage({super.key});

  @override
  ConsumerState<CharactersPage> createState() => _CharactersPageState();
}

class _CharactersPageState extends ConsumerState<CharactersPage> {
  final _search = TextEditingController();
  CastFilters _filters = CastFilters.none;
  CastSort _sort = CastSort.name;
  bool _showFilters = false;
  int _shown = _page;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final novelId = ref.watch(openNovelProvider);
    final cast = ref.watch(castProvider);
    final novel = novelId == null ? null : ref.watch(libraryProvider).where((n) => n.id == novelId).firstOrNull;
    if (novelId == null || novel == null || cast == null) {
      return PageScaffold(
        title: Destination.organize.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No novel open',
              message: 'Characters and the rest of what Organize holds belong to a novel. Open one from the Library.',
              action: FilledButton(
                onPressed: () => context.go(Destination.library.path),
                child: const Text('Go to Library'),
              ),
            ),
          ],
        ),
      );
    }
    final view = ref.watch(castViewProvider);
    final list = cast.list;
    final kept = [
      for (final l in list)
        if (l.profile.archived == _filters.archived) l,
    ];
    final facets = facetsOf(kept);
    final query = _search.text;
    final found = sortCharacters([
      for (final l in list)
        if (passesFilters(l, _filters) && matchesQuery(l, query, cast.nameOf)) l,
    ], _sort);
    final archivedCount = list.where((l) => l.profile.archived).length;
    final roleTabs = {
      for (final role in characterRoles)
        if (facets.roles.any((r) => r.toLowerCase() == role.toLowerCase())) role,
      ...facets.roles,
    }.toList();

    return PageScaffold(
      title: Destination.organize.label,
      subtitle: novel.title,
      actions: [
        FilledButton.icon(
          onPressed: () => _create(cast),
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('New character'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: OrganizeSwitch(current: OrganizePart.characters),
          ),
          const SizedBox(height: 16),
          // The names written in the manuscript that are not in the cast yet, one press from it.
          ManuscriptNames(
            cast: cast,
            onAdd: (name) {
              final actions = CharacterActions(context, cast.novelId);
              final made = actions.now((c) => c.create(name: name));
              if (made != null) {
                actions.tell(
                  '$name is in the cast.',
                  actionLabel: 'Open',
                  onAction: () => actions.openCharacter(made.id),
                );
              }
            },
          ),
          if (list.isEmpty)
            EmptyState(
              icon: Icons.people_outline,
              title: 'No characters yet',
              message:
                  'A character you create here is the same record the manuscript, relationships, the timeline and plot '
                  'threads refer to. Only a name is needed.',
              action: FilledButton(onPressed: () => _create(cast), child: const Text('Create a character')),
            )
          else ...[
            _toolbar(context, view),
            if (_showFilters) ...[const SizedBox(height: 12), _filtersPanel(context, cast, facets)],
            const SizedBox(height: 12),
            _roleTabs(list.length - archivedCount, archivedCount, roleTabs),
            const SizedBox(height: 8),
            Semantics(
              liveRegion: true,
              child: Text(
                found.length == kept.length && query.trim().isEmpty
                    ? plural(found.length, 'character')
                    : '${formatNumber(found.length)} of ${plural(kept.length, 'character')}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: 8),
            if (found.isEmpty)
              NoResultsState(
                query: query.trim().isEmpty ? null : query.trim(),
                onClear: () => setState(() {
                  _search.clear();
                  _filters = CastFilters(archived: _filters.archived);
                }),
              )
            else if (view == CastView.cards)
              CastWall(
                found: found.take(_shown).toList(),
                order: cast.model.order,
                onOpen: (l) => context.go(characterPath(l.entry.id)),
              )
            else if (view == CastView.ties)
              // Who they are to each other: every pair, one press to record a tie (`widgets/cast_ties.dart`).
              CastTies(found: found, cast: cast)
            else
              _ListView(
                found.take(_shown).toList(),
                reorder: _sort == CastSort.custom && query.trim().isEmpty
                    ? (l, by) => _move(found, l, by, cast.novelId)
                    : null,
              ),
            if (found.length > _shown)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Center(
                  child: OutlinedButton(
                    onPressed: () => setState(() => _shown += _page),
                    child: Text(
                      'Show ${formatNumber(found.length - _shown < _page ? found.length - _shown : _page)} more',
                    ),
                  ),
                ),
              ),
            if (cast.model.nodes.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                '“Linked” counts chapters and scenes whose text has a link to the character. A name that is only '
                'mentioned is not counted there.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ],
      ),
    );
  }

  Future<void> _create(CastData cast) async {
    final actions = CharacterActions(context, cast.novelId);
    final made = await showNewCharacterDialog(context, templates: cast.templates);
    if (made == null) return;
    final entry = actions.now(
      (c) => c.create(
        name: made.name,
        epithet: made.epithet,
        roles: made.roles,
        summary: made.summary,
        templateId: made.templateId,
        // The id the card was drawn with, so the character keeps the colour shown while they were made.
        id: made.id,
      ),
    );
    if (entry != null) actions.openCharacter(entry.id);
  }

  void _move(List<Listed> found, Listed l, int by, String novelId) {
    final ids = [for (final x in found) x.entry.id];
    final at = ids.indexOf(l.entry.id);
    if (at + by < 0 || at + by >= ids.length) return;
    final other = ids[at + by];
    ids[at + by] = l.entry.id;
    ids[at] = other;
    CharacterActions(context, novelId).now((c) => c.reorder(ids));
  }

  Widget _toolbar(BuildContext context, CastView view) {
    final compact = WindowSize.of(context) == WindowSize.compact;
    final search = TextField(
      controller: _search,
      onChanged: (_) => setState(() => _shown = _page),
      decoration: InputDecoration(
        labelText: 'Search characters',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: _search.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Clear search',
                onPressed: () => setState(_search.clear),
                icon: const Icon(Icons.clear),
              ),
      ),
    );
    final sort = DropdownButtonFormField<CastSort>(
      initialValue: _sort,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Sort by'),
      items: [
        for (final s in CastSort.values)
          DropdownMenuItem(
            value: s,
            child: Text(s.label, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (s) => setState(() => _sort = s ?? _sort),
    );
    final active = _filters.active;
    final filters = OutlinedButton.icon(
      onPressed: () => setState(() => _showFilters = !_showFilters),
      icon: Icon(_showFilters ? Icons.filter_alt_off_outlined : Icons.filter_alt_outlined),
      label: Text(active > 0 ? 'Filters ($active)' : 'Filters'),
    );
    final views = SegmentedButton<CastView>(
      segments: const [
        ButtonSegment(value: CastView.cards, icon: Icon(Icons.grid_view), label: Text('Cards')),
        ButtonSegment(value: CastView.list, icon: Icon(Icons.view_list), label: Text('List')),
        ButtonSegment(value: CastView.ties, icon: Icon(Icons.hub_outlined), label: Text('Ties')),
      ],
      selected: {view},
      showSelectedIcon: false,
      onSelectionChanged: (v) => ref.read(castViewProvider.notifier).set(v.first),
    );
    // On a phone the controls share a row, so the cast itself stays near the top of the screen.
    if (compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          search,
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: sort),
              const SizedBox(width: 8),
              Badge(
                isLabelVisible: active > 0,
                label: Text('$active'),
                child: IconButton.outlined(
                  tooltip: _showFilters ? 'Hide filters' : 'Filters',
                  isSelected: _showFilters,
                  onPressed: () => setState(() => _showFilters = !_showFilters),
                  icon: const Icon(Icons.filter_alt_outlined),
                ),
              ),
              const SizedBox(width: 8),
              SegmentedButton<CastView>(
                segments: const [
                  ButtonSegment(value: CastView.cards, icon: Icon(Icons.grid_view), tooltip: 'Cards'),
                  ButtonSegment(value: CastView.list, icon: Icon(Icons.view_list), tooltip: 'List'),
                  ButtonSegment(value: CastView.ties, icon: Icon(Icons.hub_outlined), tooltip: 'Ties'),
                ],
                selected: {view},
                showSelectedIcon: false,
                onSelectionChanged: (v) => ref.read(castViewProvider.notifier).set(v.first),
              ),
            ],
          ),
        ],
      );
    }
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(width: 280, child: search),
        SizedBox(width: 220, child: sort),
        filters,
        views,
      ],
    );
  }

  Widget _filtersPanel(BuildContext context, CastData cast, Facets facets) {
    Widget menu(String label, String value, List<String> choices, CastFilters Function(String v) set) => SizedBox(
      width: 200,
      child: DropdownButtonFormField<String>(
        initialValue: choices.contains(value) ? value : '',
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [
          const DropdownMenuItem(value: '', child: Text('Any')),
          for (final c in choices)
            DropdownMenuItem(
              value: c,
              child: Text(c, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => setState(() => _filters = set(v ?? '')),
      ),
    );
    final chapters = cast.model.order.chapters;
    final menus = [
      if (facets.statuses.isNotEmpty)
        menu('Status', _filters.status, facets.statuses, (v) => _filters.copyWith(status: v)),
      if (facets.tags.isNotEmpty) menu('Tag', _filters.tag, facets.tags, (v) => _filters.copyWith(tag: v)),
      if (facets.species.isNotEmpty)
        menu('Species', _filters.species, facets.species, (v) => _filters.copyWith(species: v)),
      if (facets.occupations.isNotEmpty)
        menu('Occupation', _filters.occupation, facets.occupations, (v) => _filters.copyWith(occupation: v)),
      if (facets.factions.isNotEmpty)
        menu('Faction', _filters.faction, facets.factions, (v) => _filters.copyWith(faction: v)),
      if (chapters.isNotEmpty)
        SizedBox(
          width: 260,
          child: DropdownButtonFormField<int?>(
            initialValue: _filters.firstBy,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'First appears by'),
            items: [
              const DropdownMenuItem<int?>(child: Text('Any chapter')),
              for (final c in chapters)
                DropdownMenuItem<int?>(
                  value: cast.model.order.position[c.id],
                  child: Text(c.displayTitle, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setState(() => _filters = _filters.copyWith(firstBy: () => v)),
          ),
        ),
    ];
    return Semantics(
      container: true,
      label: 'Filters',
      child: Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          ...menus,
          if (menus.isEmpty)
            Text(
              'Filters appear as your characters gain a status, tags, a species, an occupation or a faction.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (_filters.active > 0)
            TextButton(
              onPressed: () => setState(() => _filters = _filters.cleared()),
              child: const Text('Clear filters'),
            ),
        ],
      ),
    );
  }

  Widget _roleTabs(int count, int archivedCount, List<String> roles) {
    bool isRole(String role) => !_filters.archived && foldText(_filters.role) == foldText(role);
    // Default roles read as plural tabs ("Protagonists"); the author's own are shown as written.
    String tab(String role) =>
        role.endsWith('s') || !characterRoles.contains(role) || ['Supporting', 'Minor', 'Background'].contains(role)
        ? role
        : '${role}s';
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ChoiceChip(
          label: Text('All ($count)'),
          selected: _filters.role.isEmpty && !_filters.archived,
          onSelected: (_) => setState(() => _filters = _filters.copyWith(role: '', archived: false)),
        ),
        for (final role in roles)
          ChoiceChip(
            label: Text(tab(role)),
            selected: isRole(role),
            onSelected: (_) => setState(() => _filters = _filters.copyWith(role: role, archived: false)),
          ),
        if (archivedCount > 0 || _filters.archived)
          ChoiceChip(
            label: Text('Archived ($archivedCount)'),
            selected: _filters.archived,
            onSelected: (_) => setState(() => _filters = _filters.copyWith(role: '', archived: true)),
          ),
      ],
    );
  }
}

class _ListView extends StatelessWidget {
  const _ListView(this.found, {this.reorder});

  final List<Listed> found;

  /// With "My order" and no search, rows can be moved.
  final void Function(Listed l, int by)? reorder;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Column(
        children: [
          for (final (i, l) in found.indexed) ...[
            if (i > 0) const Divider(height: 1),
            ListTile(
              leading: Portrait(name: l.entry.name, image: l.entry.image, focal: l.profile.focal, size: 40),
              title: Text([l.entry.name, if (l.profile.epithet.isNotEmpty) l.profile.epithet].join(' · ')),
              subtitle: Text(
                [
                  if (l.profile.roles.isNotEmpty) l.profile.roles.join(', '),
                  if (l.entry.summary.isNotEmpty) l.entry.summary,
                  l.linkedIn.isEmpty ? 'Not linked yet' : '${formatNumber(l.linkedIn.length)} linked',
                ].join(' · '),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall,
              ),
              onTap: () => context.go(characterPath(l.entry.id)),
              trailing: reorder == null
                  ? null
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Move ${l.entry.name} up',
                          onPressed: i == 0 ? null : () => reorder!(l, -1),
                          icon: const Icon(Icons.arrow_upward),
                        ),
                        IconButton(
                          tooltip: 'Move ${l.entry.name} down',
                          onPressed: i == found.length - 1 ? null : () => reorder!(l, 1),
                          icon: const Icon(Icons.arrow_downward),
                        ),
                      ],
                    ),
            ),
          ],
        ],
      ),
    );
  }
}
