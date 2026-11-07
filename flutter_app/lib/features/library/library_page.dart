import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/records/novel.dart';
import 'backup_actions.dart';
import 'bookshelf.dart';
import 'library_actions.dart';
import 'title_page.dart';

enum LibrarySort {
  updated('Last edited'),
  opened('Last opened'),
  title('Title'),
  created('Date created'),
  words('Word count');

  const LibrarySort(this.label);
  final String label;
}

/// The novels on this device. Every novel is separate: nothing in one points into another.
class LibraryPage extends ConsumerStatefulWidget {
  const LibraryPage({super.key});

  @override
  ConsumerState<LibraryPage> createState() => _LibraryPageState();
}

class _LibraryPageState extends ConsumerState<LibraryPage> {
  final _search = TextEditingController();
  NovelStatus? _status;
  String? _genre;
  LibrarySort _sort = LibrarySort.updated;
  bool _archived = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool get _filtering => _search.text.trim().isNotEmpty || _status != null || _genre != null;

  void _clearFilters() => setState(() {
    _search.clear();
    _status = null;
    _genre = null;
  });

  @override
  Widget build(BuildContext context) {
    final all = ref.watch(libraryProvider);
    final stats = ref.watch(novelStatsProvider);
    final active = [
      for (final n in all)
        if (!n.archived) n,
    ];
    final archivedCount = all.length - active.length;
    final genres = {
      for (final n in all) ...[n.primaryGenre, ...n.secondaryGenres].where((g) => g.isNotEmpty),
    }.toList()..sort(localeCompare);
    int words(Novel n) => (stats[n.id] ?? NovelStats.empty).words;

    final needle = _search.text.trim().toLowerCase();
    final visible =
        [
          for (final n in all)
            if (n.archived == _archived &&
                (_status == null || n.status == _status) &&
                (_genre == null || n.primaryGenre == _genre || n.secondaryGenres.contains(_genre)) &&
                (needle.isEmpty ||
                    [
                      n.title,
                      n.subtitle,
                      n.author,
                      n.primaryGenre,
                      ...n.secondaryGenres,
                      ...n.tags,
                      n.synopsis,
                    ].any((t) => t.toLowerCase().contains(needle))))
              n,
        ]..sort((a, b) {
          if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
          return switch (_sort) {
            LibrarySort.updated => b.updatedAt.compareTo(a.updatedAt),
            LibrarySort.opened => (b.lastOpenedAt ?? 0).compareTo(a.lastOpenedAt ?? 0),
            LibrarySort.title => localeCompare(a.title, b.title),
            LibrarySort.created => b.createdAt.compareTo(a.createdAt),
            LibrarySort.words => words(b).compareTo(words(a)),
          };
        });

    return PageScaffold(
      title: 'Library',
      actions: [
        if (all.isNotEmpty) ...[
          FilledButton.icon(
            onPressed: () => showTitlePage(context, ref),
            icon: const Icon(Icons.add),
            label: const Text('New novel'),
          ),
          OutlinedButton.icon(
            onPressed: () => importBackupFlow(context, ref),
            icon: const Icon(Icons.file_open_outlined),
            label: const Text('Import backup'),
          ),
        ],
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (all.isEmpty)
            // An empty library is a title page: the first novel begins on its cover.
            Center(
              child: TitlePage(
                autofocus: WindowSize.of(context) != WindowSize.compact,
                onBegin: (d) => beginNovelFlow(context, ref, d),
                onMore: (d) => createNovelFlow(context, ref, draft: d),
                onImport: () => importBackupFlow(context, ref),
              ),
            )
          else ...[
            // The book last opened waits at the top, one press from the chapter it was left at.
            if (!_archived && !_filtering)
              if (bookToContinue(active) case final current?) ...[
                ContinueWriting(key: ValueKey('continue:${current.id}'), novel: current),
                const SizedBox(height: 24),
              ],
            ShelfTotals(active: active),
            const SizedBox(height: 16),
            _Toolbar(
              search: _search,
              status: _status,
              genre: _genre,
              genres: genres,
              sort: _sort,
              archived: _archived,
              archivedCount: archivedCount,
              onChanged: () => setState(() {}),
              onStatus: (s) => setState(() => _status = s),
              onGenre: (g) => setState(() => _genre = g),
              onSort: (s) => setState(() => _sort = s),
              onArchived: (v) => setState(() => _archived = v),
            ),
            const SizedBox(height: 16),
            if (visible.isEmpty)
              _filtering
                  ? NoResultsState(query: _search.text.trim(), onClear: _clearFilters)
                  : EmptyState(
                      icon: _archived ? Icons.inventory_2_outlined : Icons.collections_bookmark_outlined,
                      title: _archived ? 'No archived novels' : 'Every novel is archived',
                      message: _archived
                          ? 'Archiving hides a novel from the main list without changing anything in it.'
                          : null,
                    )
            else
              Semantics(
                label: '${plural(visible.length, 'novel')} shown',
                container: true,
                child: Bookshelf(novels: visible),
              ),
          ],
        ],
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.search,
    required this.status,
    required this.genre,
    required this.genres,
    required this.sort,
    required this.archived,
    required this.archivedCount,
    required this.onChanged,
    required this.onStatus,
    required this.onGenre,
    required this.onSort,
    required this.onArchived,
  });

  final TextEditingController search;
  final NovelStatus? status;
  final String? genre;
  final List<String> genres;
  final LibrarySort sort;
  final bool archived;
  final int archivedCount;
  final VoidCallback onChanged;
  final ValueChanged<NovelStatus?> onStatus;
  final ValueChanged<String?> onGenre;
  final ValueChanged<LibrarySort> onSort;
  final ValueChanged<bool> onArchived;

  @override
  Widget build(BuildContext context) {
    final compact = WindowSize.of(context) == WindowSize.compact;
    final searchField = TextField(
      controller: search,
      onChanged: (_) => onChanged(),
      decoration: InputDecoration(
        labelText: 'Search novels',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: search.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Clear search',
                onPressed: () {
                  search.clear();
                  onChanged();
                },
                icon: const Icon(Icons.clear),
              ),
      ),
    );
    final statusField = DropdownButtonFormField<NovelStatus?>(
      initialValue: status,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Status'),
      items: [
        const DropdownMenuItem<NovelStatus?>(child: Text('All statuses', overflow: TextOverflow.ellipsis)),
        for (final s in NovelStatus.values) DropdownMenuItem(value: s, child: Text(s.label)),
      ],
      onChanged: onStatus,
    );
    final genreField = genres.isEmpty
        ? null
        : DropdownButtonFormField<String?>(
            initialValue: genres.contains(genre) ? genre : null,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Genre'),
            items: [
              const DropdownMenuItem<String?>(child: Text('All genres', overflow: TextOverflow.ellipsis)),
              for (final g in genres)
                DropdownMenuItem(
                  value: g,
                  child: Text(g, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: onGenre,
          );
    final sortField = DropdownButtonFormField<LibrarySort>(
      initialValue: sort,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Sort by'),
      items: [
        for (final s in LibrarySort.values)
          DropdownMenuItem(
            value: s,
            child: Text(s.label, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (s) => onSort(s ?? sort),
    );
    final archivedChip = archivedCount > 0 || archived
        ? FilterChip(label: Text('Archived ($archivedCount)'), selected: archived, onSelected: onArchived)
        : null;

    // On a phone the controls share rows, so the novels themselves stay near the top of the screen.
    if (compact) {
      const gap = SizedBox(width: 12, height: 12);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          searchField,
          gap,
          Row(
            children: [
              Expanded(child: statusField),
              gap,
              Expanded(child: sortField),
            ],
          ),
          if (genreField != null || archivedChip != null) ...[
            gap,
            Row(
              children: [
                if (genreField != null) Expanded(child: genreField) else const Spacer(),
                if (archivedChip != null) ...[gap, archivedChip],
              ],
            ),
          ],
        ],
      );
    }
    Widget box(Widget child) => SizedBox(width: 190, child: child);
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(width: 280, child: searchField),
        box(statusField),
        if (genreField != null) box(genreField),
        box(sortField),
        ?archivedChip,
      ],
    );
  }
}
