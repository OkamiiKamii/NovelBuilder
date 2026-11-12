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
import '../../shared/domain/characters/from_line.dart';
import '../../shared/domain/records/relation.dart';
import '../../shared/domain/text/fold.dart';
import '../workspace/open_novel.dart';
import '../workspace/organize_switch.dart';
import 'character_actions.dart';
import 'characters_providers.dart';
import 'interview.dart';
import 'new_character_dialog.dart';
import 'widgets/cast_card.dart';
import 'widgets/cast_orbit.dart';
import 'widgets/cast_photo.dart';
import 'widgets/cast_ties.dart';
import 'widgets/empty_chairs.dart';
import 'widgets/manuscript_names.dart';
import 'widgets/playbill.dart';
import 'widgets/portrait.dart';
import 'widgets/together_on_page.dart';
import 'widgets/vault.dart';

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

  /// Ticks with every change of the page's state, so the Arrange sheet (drawn from it) follows each choice made in it.
  final _changed = ValueNotifier<int>(0);

  @override
  void setState(VoidCallback fn) {
    super.setState(fn);
    _changed.value++;
  }

  @override
  void dispose() {
    _search.dispose();
    _changed.dispose();
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
    final active = [
      for (final l in cast.list)
        if (!l.profile.archived) l,
    ];
    final relations = cast.snapshot.rows('characterRelations').map(CharacterRelation.new).toList();
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
          // A small cast: the lead on a stage, and the empty places round them, each a question and one name from
          // filled (`widgets/empty_chairs.dart`), in place of the photograph. Otherwise the whole cast stood together,
          // as for a company photograph (`cast_photo.dart`).
          if (chairsFor(ref, cast.novelId, active, relations) case final set?)
            EmptyChairs(
              lead: set.lead,
              chairs: set.chairs,
              onFill: (chair) => _create(cast, line: chair.line),
              onHide: () => setState(() => ref.read(settingsStoreProvider).write(emptyChairsKey(cast.novelId), true)),
            )
          else
            CastPhoto(cast: active, onOpen: (l) => CharacterActions(context, cast.novelId).openCharacter(l.entry.id)),
          // The ties the book already shows: who keeps being on the page together, with none recorded.
          TogetherOnPage(cast: cast),
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
            Playbill(novelId: cast.novelId, onCreate: () => _create(cast))
          else ...[
            // On a phone, the catalogue bar: search, and one row of views, order and roles; sort and filters in a sheet.
            if (WindowSize.of(context) == WindowSize.compact)
              _catalogueBar(context, view, list.length - archivedCount, archivedCount, roleTabs, cast, facets)
            else ...[
              _toolbar(context, view),
              if (_showFilters) ...[const SizedBox(height: 12), _filtersPanel(context, cast, facets)],
              const SizedBox(height: 12),
              _roleTabs(list.length - archivedCount, archivedCount, roleTabs),
            ],
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
                // How well each is known, and the interview to know them better (`interview.dart`).
                known: (l) => acquaintance(l.entry, l.profile, cast.templates),
                onInterview: (l) => interviewCharacter(
                  context,
                  CharacterActions(context, cast.novelId),
                  entry: l.entry,
                  profile: l.profile,
                  templates: cast.templates,
                ),
              )
            else if (view == CastView.ties)
              // Who they are to each other: every pair, one press to record a tie (`widgets/cast_ties.dart`).
              CastTies(found: found, cast: cast)
            else if (view == CastView.orbit)
              // The cast as an orrery round the heart of the book, and the one to know next (`widgets/cast_orbit.dart`).
              CastOrbit(
                found: found,
                order: cast.model.order,
                onOpen: (l) => context.go(characterPath(l.entry.id)),
                known: (l) => acquaintance(l.entry, l.profile, cast.templates),
                onInterview: (l) => interviewCharacter(
                  context,
                  CharacterActions(context, cast.novelId),
                  entry: l.entry,
                  profile: l.profile,
                  templates: cast.templates,
                ),
              )
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
                'Where each character is in the book is read from the text: a link to them, or their name, a part of '
                'it that is theirs alone, an alias or their title on the page.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ],
      ),
    );
  }

  Future<void> _create(CastData cast, {String? line}) async {
    final actions = CharacterActions(context, cast.novelId);
    final made = await showNewCharacterDialog(
      context,
      templates: cast.templates,
      cast: [for (final e in cast.characters()) (id: e.id, name: e.name)],
      line: line,
    );
    if (made == null) return;
    // The character, what their line said as fields, and the ties it named, in one change.
    final entry = actions.now((c) {
      final entry = c.create(
        name: made.name,
        epithet: made.epithet,
        roles: made.roles,
        summary: made.summary,
        templateId: made.templateId,
        // The id the card was drawn with, so the character keeps the colour shown while they were made.
        id: made.id,
      );
      recordFromLine(c, entry.id, made.fields, made.ties);
      return entry;
    });
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
        ButtonSegment(value: CastView.orbit, icon: Icon(Icons.track_changes), label: Text('Orbit')),
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
                  ButtonSegment(value: CastView.orbit, icon: Icon(Icons.track_changes), tooltip: 'Orbit'),
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

  /// THE CATALOGUE BAR, on a phone: a rounded search field with **Arrange** in it (sort and filters together, in a
  /// sheet, its count of filters on its badge), and under it one row swiped sideways: Cards, List or Ties, the order
  /// the cast is in ("Name"), and every role. In place of a sort menu cut to "SO… N…", a filter button, three view
  /// buttons and a second row of roles; the cast starts a third of a screen higher.
  Widget _catalogueBar(
    BuildContext context,
    CastView view,
    int count,
    int archivedCount,
    List<String> roles,
    CastData cast,
    Facets facets,
  ) {
    final scheme = Theme.of(context).colorScheme;
    final active = _filters.active;
    final search = TextField(
      controller: _search,
      onChanged: (_) => setState(() => _shown = _page),
      decoration: InputDecoration(
        hintText: 'Search the cast',
        prefixIcon: const Icon(Icons.search),
        filled: true,
        isDense: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
        suffixIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_search.text.isNotEmpty)
              IconButton(
                tooltip: 'Clear search',
                onPressed: () => setState(_search.clear),
                icon: const Icon(Icons.clear),
              ),
            Badge(
              isLabelVisible: active > 0,
              label: Text('$active'),
              child: IconButton(
                tooltip: active > 0 ? 'Arrange the cast ($active filters on)' : 'Arrange the cast',
                onPressed: () => _arrange(context, cast, facets),
                icon: Icon(Icons.tune, color: active > 0 ? scheme.primary : null),
              ),
            ),
          ],
        ),
      ),
    );
    final views = SegmentedButton<CastView>(
      segments: const [
        ButtonSegment(value: CastView.cards, icon: Icon(Icons.grid_view), tooltip: 'Cards'),
        ButtonSegment(value: CastView.list, icon: Icon(Icons.view_list), tooltip: 'List'),
        ButtonSegment(value: CastView.ties, icon: Icon(Icons.hub_outlined), tooltip: 'Ties'),
        ButtonSegment(value: CastView.orbit, icon: Icon(Icons.track_changes), tooltip: 'Orbit'),
      ],
      selected: {view},
      showSelectedIcon: false,
      style: const ButtonStyle(visualDensity: VisualDensity.compact),
      onSelectionChanged: (v) => ref.read(castViewProvider.notifier).set(v.first),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        search,
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              views,
              const SizedBox(width: 8),
              ActionChip(
                avatar: const Icon(Icons.sort, size: 18),
                label: Text(_sort.label),
                tooltip: 'In what order: ${_sort.label}',
                onPressed: () => _arrange(context, cast, facets),
              ),
              const SizedBox(width: 8),
              Container(width: 1, height: 28, color: scheme.outlineVariant),
              const SizedBox(width: 8),
              _roleTabs(count, archivedCount, roles, inRow: true),
            ],
          ),
        ),
      ],
    );
  }

  /// ARRANGE THE CAST, on a phone: in what order (each way, one press) and the filters, in a sheet that follows each
  /// choice as it is made; Done, or a swipe down, closes it.
  Future<void> _arrange(BuildContext context, CastData cast, Facets facets) => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => ValueListenableBuilder<int>(
      valueListenable: _changed,
      builder: (context, _, _) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Arrange the cast', style: vaultHeading(context, size: 18, weight: 700)),
              const SizedBox(height: 12),
              Text('In what order', style: vaultHeading(context, size: 12, weight: 700)),
              RadioGroup<CastSort>(
                groupValue: _sort,
                onChanged: (s) => setState(() => _sort = s ?? _sort),
                child: Column(
                  children: [
                    for (final s in CastSort.values)
                      RadioListTile<CastSort>(value: s, title: Text(s.label), contentPadding: EdgeInsets.zero),
                  ],
                ),
              ),
              const Divider(),
              Text('Show only', style: vaultHeading(context, size: 12, weight: 700)),
              const SizedBox(height: 10),
              _filtersPanel(context, cast, facets),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(onPressed: () => Navigator.of(sheet).pop(), child: const Text('Done')),
              ),
            ],
          ),
        ),
      ),
    ),
  );

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

  /// The roles as tabs; [inRow], one after another in a row that scrolls (the phone's catalogue bar).
  Widget _roleTabs(int count, int archivedCount, List<String> roles, {bool inRow = false}) {
    bool isRole(String role) => !_filters.archived && foldText(_filters.role) == foldText(role);
    // Default roles read as plural tabs ("Protagonists"); the author's own are shown as written.
    String tab(String role) =>
        role.endsWith('s') || !characterRoles.contains(role) || ['Supporting', 'Minor', 'Background'].contains(role)
        ? role
        : '${role}s';
    Widget laid(List<Widget> chips) => inRow
        ? Row(
            children: [
              for (final (i, c) in chips.indexed) ...[if (i > 0) const SizedBox(width: 8), c],
            ],
          )
        : Wrap(spacing: 8, runSpacing: 8, children: chips);
    return laid([
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
    ]);
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
                  l.seenIn.isEmpty
                      ? 'Not in the manuscript yet'
                      : 'In ${formatNumber(l.seenIn.length)} ${l.seenIn.length == 1 ? 'chapter' : 'chapters'}',
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
