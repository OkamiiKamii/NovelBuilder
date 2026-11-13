import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../app/router.dart';
import '../../app/shell/trail.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart' show categoriesOf;
import '../../shared/domain/json.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/search/search.dart';
import '../characters/character_actions.dart' show entryPath;
import '../collab/collab_providers.dart';
import '../workspace/open_novel.dart';
import '../write/write_providers.dart';
import 'jumps.dart';

/// The open novel's search index and the names of its groups, built from what is saved when search opens.
({SearchIndex index, Map<String, String> groups, String title})? _openIndex(WidgetRef ref) {
  final id = ref.read(openNovelProvider);
  if (id == null) return null;
  final s = ref.read(novelStoreProvider).loadPart(id, const {
    'chapters',
    'chapterContents',
    'chapterPlans',
    'loreEntries',
    'loreSchemas',
  });
  if (s == null) return null;
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final plans = {for (final r in s.rows('chapterPlans')) str(r['id']): r};
  final categories = categoriesOf(s);
  final names = {for (final r in s.rows('loreEntries')) str(r['id']): str(r['name'])};
  final blocks = [
    for (final r in s.rows('chapters')) ...nodeBlocks(StoryNode(r), docs[r['id']], plans[r['id']]),
    for (final r in s.rows('loreEntries'))
      ...entryBlocks(Entry(r), categories[r['category']] ?? Category.unknown(str(r['category'])), (id) => names[id]),
  ];
  return (
    index: SearchIndex(blocks),
    groups: {'manuscript': 'Manuscript', 'notes': 'Notes and plans', for (final c in categories.values) c.key: c.name},
    title: str(s.project['title'], 'this novel'),
  );
}

/// Opens search across the open novel (Ctrl/⌘+K). Says so when no novel is open or the novel is a review copy.
Future<void> showNovelSearch(BuildContext context, WidgetRef ref) async {
  String? problem;
  if (ref.read(openNovelProvider) == null) problem = 'Open a novel from the Library to search it.';
  if (ref.read(reviewMarkProvider) != null) problem = 'A review copy is read and searched from its chapters in Write.';
  if (problem != null) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(problem)));
    return;
  }
  final opened = _openIndex(ref);
  if (opened == null) return;
  // Places and things to do, and where the author has just been (`jumps.dart`).
  final novelId = ref.read(openNovelProvider)!;
  final store = ref.read(novelStoreProvider);
  final jumps = bookJumps(store, novelId, onKeepWriting: () => GoRouter.of(context).go(Destination.write.path));
  final here = ref.read(routerProvider).routerDelegate.currentConfiguration.uri.path;
  final recent = trailJumps(ref.read(trailProvider), store, novelId, here: here);
  if (!context.mounted) return;
  final compact = WindowSize.of(context) == WindowSize.compact;
  await showDialog<void>(
    context: context,
    useRootNavigator: true,
    builder: (dialogContext) {
      final panel = _SearchPanel(
        index: opened.index,
        groups: opened.groups,
        title: opened.title,
        jumps: jumps,
        recent: recent,
        onOpen: (item, snippet) {
          Navigator.of(dialogContext).pop();
          _open(context, ref, item, snippet);
        },
        onJump: (jump) {
          Navigator.of(dialogContext).pop();
          ref.read(saveControllerProvider).flush();
          if (context.mounted) jump.go(context, ref);
        },
      );
      return compact
          ? Dialog.fullscreen(child: panel)
          : Dialog(
              insetPadding: const EdgeInsets.all(32),
              child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 760, maxHeight: 820), child: panel),
            );
    },
  );
}

/// Goes to a result: a chapter or scene in Write, with find on the matched words in that paragraph; an entry where it
/// lives.
void _open(BuildContext context, WidgetRef ref, EntityResult item, Snippet? snippet) {
  ref.read(saveControllerProvider).flush();
  if (item.entityType == SearchEntityType.node) {
    final text = snippet != null && (snippet.field == SearchField.body || snippet.field == SearchField.heading);
    ref
        .read(pendingFindProvider.notifier)
        .request(
          text && snippet.term.isNotEmpty ? (nodeId: item.entityId, term: snippet.term, block: snippet.index) : null,
        );
    ref.read(selectedNodeProvider.notifier).select(item.entityId);
    GoRouter.of(context).go(Destination.write.path);
  } else {
    GoRouter.of(context).go(entryPath(item.entityId, character: item.kind == 'character'));
  }
}

const _fieldLabels = {
  SearchField.title: 'Title',
  SearchField.heading: 'Heading',
  SearchField.summary: 'Summary',
  SearchField.notes: 'Notes',
  SearchField.name: 'Name',
  SearchField.description: 'Description',
  SearchField.tags: 'Tags',
};

class _SearchPanel extends StatefulWidget {
  const _SearchPanel({
    required this.index,
    required this.groups,
    required this.title,
    required this.onOpen,
    this.jumps = const [],
    this.recent = const [],
    this.onJump,
  });
  final SearchIndex index;
  final Map<String, String> groups;
  final String title;
  final void Function(EntityResult item, Snippet? snippet) onOpen;

  /// Every place and thing to do; and, before anything is typed, where the author has just been.
  final List<Jump> jumps;
  final List<Jump> recent;
  final ValueChanged<Jump>? onJump;

  @override
  State<_SearchPanel> createState() => _SearchPanelState();
}

class _SearchPanelState extends State<_SearchPanel> {
  final _query = TextEditingController();
  var _scope = SearchScope.all;
  var _settled = '';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _changed(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 150), () {
      if (mounted) setState(() => _settled = text);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final results = widget.index.search(_settled, _scope);
    final total = results.fold(0, (n, g) => n + g.matchCount);
    final tooShort = _settled.trim().length < minQueryLength;
    // Go to: what answers the words typed; with nothing typed, where the author has just been.
    final empty = _settled.trim().isEmpty;
    final going = widget.onJump == null
        ? const <Jump>[]
        : empty
        ? widget.recent
        : jumpsFor(_settled, widget.jumps);
    return Material(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _query,
                    autofocus: true,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search),
                      hintText: widget.onJump == null ? 'Search ${widget.title}…' : 'A word, a name, or a page…',
                      labelText: 'Search the whole novel',
                    ),
                    onChanged: _changed,
                    onSubmitted: (text) {
                      // Return goes to a place named by what was typed; else to the first match in the text.
                      final place = jumpsFor(text, widget.jumps).firstOrNull;
                      if (place != null && widget.onJump != null && jumpScore(place, text) >= 40) {
                        widget.onJump!(place);
                        return;
                      }
                      final found = widget.index.search(text, _scope);
                      final first = found.firstOrNull?.items.firstOrNull;
                      if (first != null) widget.onOpen(first, first.snippets.firstOrNull);
                    },
                  ),
                ),
                IconButton(
                  tooltip: 'Close search',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final s in SearchScope.values)
                  ChoiceChip(
                    label: Text(s.label),
                    selected: _scope == s,
                    onSelected: (_) => setState(() => _scope = s),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Semantics(
              liveRegion: true,
              child: Text(
                empty && going.isNotEmpty
                    ? 'Type to search the words, or go to a page by its name.'
                    : tooShort
                    ? 'Type at least two letters. Every word must appear in a chapter or entry for it to be found.'
                    : results.isEmpty
                    ? 'Nothing matches “${_settled.trim()}”${_scope == SearchScope.all ? '' : ' in ${_scope.label.toLowerCase()}'}.'
                    : '${plural(total, 'match', 'matches')} in ${plural(results.fold(0, (n, g) => n + g.items.length), 'place')}. '
                          'Read only: nothing is changed.',
                style: muted,
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                if (going.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: Semantics(
                      header: true,
                      child: Text(empty ? 'Where you were' : 'Go to', style: theme.textTheme.titleSmall),
                    ),
                  ),
                  for (final j in going)
                    ListTile(
                      leading: CircleAvatar(
                        radius: 16,
                        backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.14),
                        child: Icon(j.icon, size: 18, color: theme.colorScheme.primary),
                      ),
                      title: Text(j.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(j.kind, style: muted),
                      trailing: Icon(Icons.north_east, size: 18, color: theme.colorScheme.onSurfaceVariant),
                      onTap: () => widget.onJump!(j),
                    ),
                  if (results.isNotEmpty) const Divider(indent: 16, endIndent: 16),
                ],
                for (final g in results) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Semantics(
                      header: true,
                      child: Text(
                        '${widget.groups[g.group] ?? g.group} · ${plural(g.matchCount, 'match', 'matches')}',
                        style: theme.textTheme.titleSmall,
                      ),
                    ),
                  ),
                  for (final item in g.items) _Result(item: item, onOpen: widget.onOpen),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.item, required this.onOpen});
  final EntityResult item;
  final void Function(EntityResult item, Snippet? snippet) onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final hit = TextStyle(
      fontWeight: FontWeight.w700,
      decoration: TextDecoration.underline,
      color: theme.colorScheme.primary,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ListTile(
          title: Text(item.title.isEmpty ? 'Untitled' : item.title),
          subtitle: Text(plural(item.matchCount, 'match', 'matches'), style: muted),
          onTap: () => onOpen(item, item.snippets.firstOrNull),
        ),
        for (final s in item.snippets)
          InkWell(
            onTap: () => onOpen(item, s),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(32, 4, 16, 8),
              child: Text.rich(
                TextSpan(
                  children: [
                    if ((s.label.isNotEmpty ? s.label : _fieldLabels[s.field]) case final l?)
                      TextSpan(
                        text: '$l · ',
                        style: muted?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    if (s.before.isNotEmpty) TextSpan(text: '${s.before} ', style: muted),
                    for (final p in s.parts) TextSpan(text: p.text, style: p.hit ? hit : null),
                    if (s.after.isNotEmpty) TextSpan(text: ' ${s.after}', style: muted),
                  ],
                ),
                semanticsLabel: [
                  ?(s.label.isNotEmpty ? s.label : _fieldLabels[s.field]),
                  s.parts.map((p) => p.text).join(),
                  'Open ${item.title}',
                ].join('. '),
              ),
            ),
          ),
      ],
    );
  }
}
