import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collab/access.dart';
import '../../shared/domain/collab/collab_changes.dart';
import '../../shared/domain/collab/records.dart';
import '../../shared/domain/collab/review_files.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/records/thread.dart';
import 'collab_providers.dart';
import 'collab_widgets.dart';

enum _Tab { chapters, codex, threads, conversations, suggestions }

/// The book as a review copy holds it: its chapters and text, and (for an editor) its codex and plot threads.
typedef _Book = ({List<StoryNode> nodes, Map<String, JsonMap> docs, List<Entry> entries, List<PlotThread> threads});

final _bookProvider = Provider.autoDispose.family<_Book, (String, int)>((ref, key) {
  final store = ref.read(novelStoreProvider);
  final (id, _) = key;
  return (
    nodes: readingOrder([for (final r in store.rowsIn(id, 'chapters')) StoryNode(r)]),
    docs: {for (final r in store.rowsIn(id, 'chapterContents')) str(r['id']): mapOrNull(r['doc']) ?? const {}},
    entries: [for (final r in store.rowsIn(id, 'loreEntries')) Entry(r)]..sort((a, b) => a.name.compareTo(b.name)),
    threads: [for (final r in store.rowsIn(id, 'plotThreads')) PlotThread(r)],
  );
});

/// Write, in a review copy: read the book as its owner shared it, and comment, react, give feedback and (as an
/// editor) suggest changes. Nothing done here changes the author's book: it all goes back in the feedback file, and
/// the author accepts or rejects each suggestion.
class ReviewWorkspace extends ConsumerStatefulWidget {
  const ReviewWorkspace({super.key, required this.mark});
  final ReviewMark mark;

  @override
  ConsumerState<ReviewWorkspace> createState() => _ReviewWorkspaceState();
}

class _ReviewWorkspaceState extends ConsumerState<ReviewWorkspace> {
  var _tab = _Tab.chapters;
  String? _chapterId;
  String? _entryId;

  Future<void> _send(BuildContext context) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    String? message;
    try {
      final result = await ref.read(collabActionsProvider).sendFeedback(origin: origin);
      if (result != null) message = '$result. Send it to ${widget.mark.ownerName}; nothing is sent by the app.';
    } on CollabException catch (e) {
      message = e.message;
    }
    if (message != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(collabProvider);
    if (data == null) return const LoadingState();
    final store = ref.watch(novelStoreProvider);
    final book = ref.watch(_bookProvider((data.novelId, store.revision)));
    final me = data.me;
    final mark = widget.mark;
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final editor = can(me.role, Capability.readLore);
    final doing = switch (me.role) {
      Role.editor => 'read everything but the author’s private notes, comment anywhere, and suggest changes',
      Role.reader => 'read the manuscript, comment on it, react and fill in the feedback form',
      _ => 'read the chapters marked final or published',
    };
    final pending = ReviewMark.of(data.novel.raw)?.changed.length ?? 0;
    final banner = Card.filled(
      margin: EdgeInsets.zero,
      color: theme.colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text('Review copy of “${mark.title}” from ${mark.ownerName}', style: theme.textTheme.titleMedium),
            ),
            const SizedBox(height: 4),
            Text(
              'You are ${mark.memberName}, ${me.role.label}: you can $doing. Nothing you do here changes the '
              'author’s book. When you are ready, send your feedback file back to them.',
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (can(me.role, Capability.comment))
                  FilledButton.icon(
                    onPressed: () => _send(context),
                    icon: const Icon(Icons.outbox_outlined),
                    label: const Text('Send feedback…'),
                  ),
                OutlinedButton.icon(
                  onPressed: () => context.go('${Destination.write.path}/read'),
                  icon: const Icon(Icons.menu_book_outlined),
                  label: const Text('Read as a book'),
                ),
                if (can(me.role, Capability.comment))
                  Text(
                    pending == 0 ? 'Nothing new to send yet.' : '${plural(pending, 'change')} in your feedback.',
                    style: muted,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
    final tabs = [
      _Tab.chapters,
      if (editor) _Tab.codex,
      if (editor) _Tab.threads,
      if (can(me.role, Capability.comment)) _Tab.conversations,
      if (can(me.role, Capability.suggest)) _Tab.suggestions,
    ];
    final mine = [
      for (final s in data.suggestions)
        if (s.authorId == me.id) s,
    ];
    final chips = Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final t in tabs)
          ChoiceChip(
            selected: _tab == t,
            onSelected: (_) => setState(() => _tab = t),
            label: Text(switch (t) {
              _Tab.chapters => 'Chapters',
              _Tab.codex => 'Codex',
              _Tab.threads => 'Plot threads',
              _Tab.conversations => 'Conversations (${data.threads().length})',
              _Tab.suggestions => 'My suggestions (${mine.length})',
            }),
          ),
      ],
    );

    Widget list(List<Widget> children) => ListView(padding: const EdgeInsets.all(16), children: children);
    final documents = [
      for (final n in book.nodes)
        if (isDocument(n.kind) && book.docs.containsKey(n.id)) n,
    ];
    final chapter = documents.where((n) => n.id == _chapterId).firstOrNull;
    final entry = book.entries.where((e) => e.id == _entryId).firstOrNull;

    Widget chapters() {
      if (documents.isEmpty) {
        return list([
          banner,
          const SizedBox(height: 12),
          chips,
          const SizedBox(height: 12),
          const EmptyState(
            icon: Icons.menu_book_outlined,
            title: 'No chapters to read in this copy',
            message: 'A viewer reads the chapters the author has marked final or published.',
          ),
        ]);
      }
      final picker = [
        for (final n in documents)
          ListTile(
            selected: n.id == _chapterId,
            contentPadding: EdgeInsets.only(left: n.kind == NodeKind.scene ? 32 : 16, right: 16),
            title: Text(n.displayTitle),
            subtitle: Text(plural(data.threads(targetKey: 'chapter:${n.id}').length, 'conversation'), style: muted),
            onTap: () => setState(() => _chapterId = n.id),
          ),
      ];
      final detail = chapter == null
          ? const EmptyState(icon: Icons.chrome_reader_mode_outlined, title: 'Choose a chapter to read')
          : _ChapterReview(
              key: ValueKey(chapter.id),
              node: chapter,
              doc: book.docs[chapter.id]!,
              data: data,
              onBack: compact ? () => setState(() => _chapterId = null) : null,
            );
      if (compact) {
        return chapter != null
            ? detail
            : list([banner, const SizedBox(height: 12), chips, const SizedBox(height: 8), ...picker]);
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [banner, const SizedBox(height: 12), chips],
            ),
          ),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(width: 300, child: ListView(children: picker)),
                const VerticalDivider(width: 1),
                Expanded(child: detail),
              ],
            ),
          ),
        ],
      );
    }

    return switch (_tab) {
      _Tab.chapters => chapters(),
      _Tab.codex => list([
        banner,
        const SizedBox(height: 12),
        chips,
        const SizedBox(height: 12),
        if (entry != null)
          _EntryReview(key: ValueKey(entry.id), entry: entry, data: data, onBack: () => setState(() => _entryId = null))
        else if (book.entries.isEmpty)
          const Text('The codex is empty.')
        else
          for (final e in book.entries)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(e.name.isEmpty ? 'Untitled entry' : e.name),
              subtitle: e.summary.isEmpty ? null : Text(e.summary, maxLines: 2, overflow: TextOverflow.ellipsis),
              onTap: () => setState(() => _entryId = e.id),
            ),
      ]),
      _Tab.threads => list([
        banner,
        const SizedBox(height: 12),
        chips,
        const SizedBox(height: 12),
        if (book.threads.isEmpty) const Text('No plot threads.'),
        for (final t in book.threads) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t.title.isEmpty ? 'Untitled thread' : t.title),
            subtitle: t.premise.isEmpty ? null : Text(t.premise),
            trailing: IconButton(
              tooltip: 'Comment on ${t.title}',
              icon: const Icon(Icons.add_comment_outlined),
              onPressed: () => _commentOn(context, {'kind': 'thread', 'threadId': t.id}, t.title),
            ),
          ),
          for (final th in data.threads(targetKey: 'thread:${t.id}')) ThreadCard(thread: th, me: me, showTarget: false),
        ],
      ]),
      _Tab.conversations => list([
        banner,
        const SizedBox(height: 12),
        chips,
        const SizedBox(height: 12),
        if (data.threads().isEmpty) const Text('No conversations yet.'),
        for (final t in data.threads()) ThreadCard(key: ValueKey(t.root.id), thread: t, me: me),
      ]),
      _Tab.suggestions => list([
        banner,
        const SizedBox(height: 12),
        chips,
        const SizedBox(height: 12),
        if (mine.isEmpty) const Text('No suggestions yet. Open a chapter and choose “Suggest changes”.'),
        for (final s in mine) SuggestionCard(key: ValueKey(s.id), suggestion: s, me: me),
      ]),
    };
  }

  Future<void> _commentOn(BuildContext context, JsonMap target, String label) async {
    final body = await showTextPrompt(
      context,
      title: 'Comment on “$label”',
      label: 'Comment',
      confirmLabel: 'Add comment',
    );
    if (body == null || !context.mounted) return;
    runCollab(
      context,
      () => ref.read(collabActionsProvider).comment(target, targetLabel: label, body: body),
      done: 'Comment added.',
    );
  }
}

/// One chapter: its text to read and comment on, reactions and the feedback form, and (for an editor) changes to
/// suggest, paragraph by paragraph.
class _ChapterReview extends ConsumerStatefulWidget {
  const _ChapterReview({super.key, required this.node, required this.doc, required this.data, this.onBack});
  final StoryNode node;
  final JsonMap doc;
  final CollabData data;
  final VoidCallback? onBack;

  @override
  ConsumerState<_ChapterReview> createState() => _ChapterReviewState();
}

class _ChapterReviewState extends ConsumerState<_ChapterReview> {
  /// While suggesting: each paragraph (the stored one, and its new words when changed).
  List<({Object? original, TextEditingController text, bool changed})>? _editing;

  @override
  void dispose() {
    for (final p in _editing ?? const []) {
      p.text.dispose();
    }
    super.dispose();
  }

  Suggestion? get _mine => widget.data.suggestions
      .where((s) => s.isText && s.targetId == widget.node.id && s.authorId == widget.data.me.id && s.isOpen)
      .fold<Suggestion?>(null, (best, s) => best == null || s.updatedAt > best.updatedAt ? s : best);

  void _startSuggesting() {
    final from = mapOrNull(_mine?.proposed) ?? widget.doc;
    final blocks = [...?(from['content'] as List?)];
    final texts = paragraphTexts({'type': 'doc', 'content': blocks});
    setState(() {
      _editing = [
        for (final (i, b) in blocks.indexed)
          (original: b, text: TextEditingController(text: i < texts.length ? texts[i] : ''), changed: false),
      ];
    });
  }

  void _save() {
    final editing = _editing!;
    final proposed = docWithParagraphs(widget.doc, [
      for (final p in editing)
        (
          original: p.original,
          text:
              p.original != null &&
                  paragraphTexts({
                        'type': 'doc',
                        'content': [p.original],
                      }).firstOrNull ==
                      p.text.text
              ? null
              : p.text.text,
        ),
    ]);
    final ok = runCollab(
      context,
      () => ref
          .read(collabActionsProvider)
          .saveText(
            chapterId: widget.node.id,
            chapterTitle: widget.node.displayTitle,
            base: widget.doc,
            proposed: proposed,
          ),
      done: 'Your suggested changes are kept, ready for your feedback file. The chapter itself is unchanged.',
    );
    if (ok) setState(() => _editing = null);
  }

  Future<void> _comment(JsonMap target, String what) async {
    final body = await showTextPrompt(
      context,
      title: 'Comment on $what',
      label: 'Comment',
      confirmLabel: 'Add comment',
    );
    if (body == null || !mounted) return;
    runCollab(
      context,
      () => ref.read(collabActionsProvider).comment(target, targetLabel: widget.node.displayTitle, body: body),
      done: 'Comment added.',
    );
  }

  Future<void> _feedback() async {
    final result = await showDialog<({Map<String, num> ratings, String note})>(
      context: context,
      builder: (_) => const _FeedbackDialog(),
    );
    if (result == null || !mounted) return;
    runCollab(
      context,
      () => ref
          .read(collabActionsProvider)
          .comment(
            {'kind': 'chapter', 'chapterId': widget.node.id},
            targetLabel: widget.node.displayTitle,
            body: result.note,
            kind: 'feedback',
            ratings: result.ratings,
          ),
      done: 'Feedback added.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final me = widget.data.me;
    final comments = can(me.role, Capability.comment);
    final suggests = can(me.role, Capability.suggest);
    final texts = paragraphTexts(widget.doc);
    final editing = _editing;
    final threads = widget.data.threads(targetKey: 'chapter:${widget.node.id}');
    final actions = ref.read(collabActionsProvider);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            if (widget.onBack != null)
              IconButton(tooltip: 'Back to the chapters', onPressed: widget.onBack, icon: const Icon(Icons.arrow_back)),
            Expanded(
              child: Semantics(
                header: true,
                child: Text(widget.node.displayTitle, style: theme.textTheme.headlineSmall),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (comments)
              OutlinedButton.icon(
                onPressed: () => _comment({'kind': 'chapter', 'chapterId': widget.node.id}, 'the chapter'),
                icon: const Icon(Icons.add_comment_outlined),
                label: const Text('Comment on the chapter'),
              ),
            if (comments)
              OutlinedButton.icon(
                onPressed: _feedback,
                icon: const Icon(Icons.rate_review_outlined),
                label: const Text('Feedback form…'),
              ),
            if (suggests && editing == null)
              FilledButton.tonalIcon(
                onPressed: _startSuggesting,
                icon: const Icon(Icons.edit_note),
                label: Text(_mine == null ? 'Suggest changes' : 'Go on with my suggested changes'),
              ),
          ],
        ),
        if (comments) ...[
          const SizedBox(height: 8),
          Text('React to the chapter', style: theme.textTheme.labelLarge),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final r in reactions)
                ActionChip(
                  label: Text(r),
                  onPressed: () => runCollab(
                    context,
                    () => actions.comment(
                      {'kind': 'chapter', 'chapterId': widget.node.id},
                      targetLabel: widget.node.displayTitle,
                      body: r,
                      kind: 'reaction',
                    ),
                    done: 'Reaction added: $r.',
                  ),
                ),
            ],
          ),
        ] else
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('As a viewer you read; you cannot comment.', style: muted),
          ),
        const Divider(height: 32),
        if (editing != null) ...[
          Text(
            'Suggesting changes: edit any paragraph, remove one or add one after it. Formatting in a paragraph you '
            'change is not kept in the suggestion. The chapter itself is not changed.',
            style: muted,
          ),
          const SizedBox(height: 8),
          for (final (i, p) in editing.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextField(
                      controller: p.text,
                      minLines: 1,
                      maxLines: null,
                      decoration: InputDecoration(labelText: 'Paragraph ${i + 1}', isDense: true),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove paragraph ${i + 1}',
                    onPressed: () => setState(() => editing.removeAt(i).text.dispose()),
                    icon: const Icon(Icons.delete_outline),
                  ),
                  IconButton(
                    tooltip: 'Add a paragraph after paragraph ${i + 1}',
                    onPressed: () => setState(
                      () => editing.insert(i + 1, (original: null, text: TextEditingController(), changed: true)),
                    ),
                    icon: const Icon(Icons.add),
                  ),
                ],
              ),
            ),
          if (editing.isEmpty)
            TextButton(
              onPressed: () =>
                  setState(() => editing.add((original: null, text: TextEditingController(), changed: true))),
              child: const Text('Add a paragraph'),
            ),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(onPressed: _save, child: const Text('Keep my suggested changes')),
              TextButton(
                onPressed: () => setState(() {
                  for (final p in editing) {
                    p.text.dispose();
                  }
                  _editing = null;
                }),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ] else
          for (final (i, text) in texts.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: SelectableText(text, style: theme.textTheme.bodyLarge)),
                  if (comments && text.trim().isNotEmpty)
                    IconButton(
                      tooltip: 'Comment on paragraph ${i + 1}',
                      onPressed: () => _comment({
                        'kind': 'text',
                        'chapterId': widget.node.id,
                        'quote': text.length > 120 ? '${text.substring(0, 120)}…' : text,
                        'block': i,
                        'offset': 0,
                      }, 'paragraph ${i + 1}'),
                      icon: const Icon(Icons.add_comment_outlined),
                    ),
                ],
              ),
            ),
        if (threads.isNotEmpty) ...[
          const Divider(height: 32),
          Text('Conversations on this chapter', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          for (final t in threads) ThreadCard(key: ValueKey(t.root.id), thread: t, me: me, showTarget: false),
        ],
      ],
    );
  }
}

class _FeedbackDialog extends StatefulWidget {
  const _FeedbackDialog();

  @override
  State<_FeedbackDialog> createState() => _FeedbackDialogState();
}

class _FeedbackDialogState extends State<_FeedbackDialog> {
  final _ratings = {for (final q in feedbackQuestions) q.key: 3.0};
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Feedback on this chapter'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final q in feedbackQuestions) ...[
            Text('${q.label}: ${_ratings[q.key]!.round()} of 5'),
            Slider(
              value: _ratings[q.key]!,
              min: 1,
              max: 5,
              divisions: 4,
              label: '${_ratings[q.key]!.round()}',
              semanticFormatterCallback: (v) => '${q.label}: ${v.round()} of 5',
              onChanged: (v) => setState(() => _ratings[q.key] = v),
            ),
          ],
          TextField(
            controller: _note,
            minLines: 2,
            maxLines: 5,
            decoration: const InputDecoration(labelText: 'Anything else (optional)'),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: () => Navigator.of(
          context,
        ).pop((ratings: {for (final e in _ratings.entries) e.key: e.value.round()}, note: _note.text)),
        child: const Text('Add feedback'),
      ),
    ],
  );
}

/// One codex entry, read-only, to comment on or to suggest an edit to.
class _EntryReview extends ConsumerWidget {
  const _EntryReview({super.key, required this.entry, required this.data, required this.onBack});
  final Entry entry;
  final CollabData data;
  final VoidCallback onBack;

  Future<void> _suggest(BuildContext context, WidgetRef ref) async {
    final rows = [
      (field: 'name', label: 'Name', from: entry.name),
      (field: 'summary', label: 'Summary', from: entry.summary),
      (field: 'description', label: 'Description', from: entry.description),
      for (final f in entry.fields)
        if (f.key.isNotEmpty) (field: 'field:${f.key}', label: f.key, from: f.value),
    ];
    final result = await showDialog<({List<String> values, String note})>(
      context: context,
      builder: (_) => _EntryEditDialog(name: entry.name, rows: rows),
    );
    if (result == null || !context.mounted) return;
    runCollab(
      context,
      () => ref
          .read(collabActionsProvider)
          .suggestEntry(
            entryId: entry.id,
            entryName: entry.name,
            changes: [
              for (final (i, r) in rows.indexed) (field: r.field, label: r.label, from: r.from, to: result.values[i]),
            ],
            note: result.note,
          ),
      done: 'Your suggested edit is kept, ready for your feedback file. The entry itself is unchanged.',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final me = data.me;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(tooltip: 'Back to the codex', onPressed: onBack, icon: const Icon(Icons.arrow_back)),
            Expanded(
              child: Semantics(header: true, child: Text(entry.name, style: theme.textTheme.headlineSmall)),
            ),
          ],
        ),
        if (entry.summary.isNotEmpty) Text(entry.summary),
        if (entry.description.isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(entry.description)),
        for (final f in entry.fields)
          if (f.key.isNotEmpty && f.value.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 4), child: Text('${f.key}: ${f.value}')),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () async {
                final body = await showTextPrompt(
                  context,
                  title: 'Comment on “${entry.name}”',
                  label: 'Comment',
                  confirmLabel: 'Add comment',
                );
                if (body == null || !context.mounted) return;
                runCollab(
                  context,
                  () => ref
                      .read(collabActionsProvider)
                      .comment({'kind': 'entry', 'entryId': entry.id}, targetLabel: entry.name, body: body),
                  done: 'Comment added.',
                );
              },
              icon: const Icon(Icons.add_comment_outlined),
              label: const Text('Comment'),
            ),
            if (can(me.role, Capability.suggest))
              FilledButton.tonalIcon(
                onPressed: () => _suggest(context, ref),
                icon: const Icon(Icons.edit_note),
                label: const Text('Suggest an edit…'),
              ),
          ],
        ),
        const SizedBox(height: 12),
        for (final t in data.threads(targetKey: 'entry:${entry.id}')) ThreadCard(thread: t, me: me, showTarget: false),
      ],
    );
  }
}

class _EntryEditDialog extends StatefulWidget {
  const _EntryEditDialog({required this.name, required this.rows});
  final String name;
  final List<({String field, String label, String from})> rows;

  @override
  State<_EntryEditDialog> createState() => _EntryEditDialogState();
}

class _EntryEditDialogState extends State<_EntryEditDialog> {
  late final _controllers = [for (final r in widget.rows) TextEditingController(text: r.from)];
  final _note = TextEditingController();

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Suggest an edit to “${widget.name}”'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, r) in widget.rows.indexed)
            TextField(
              controller: _controllers[i],
              minLines: 1,
              maxLines: r.field == 'description' ? 6 : 3,
              decoration: InputDecoration(labelText: r.label),
            ),
          const SizedBox(height: 8),
          TextField(
            controller: _note,
            decoration: const InputDecoration(labelText: 'A note for the author (optional)'),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: () => Navigator.of(context).pop((values: [for (final c in _controllers) c.text], note: _note.text)),
        child: const Text('Keep my suggested edit'),
      ),
    ],
  );
}
