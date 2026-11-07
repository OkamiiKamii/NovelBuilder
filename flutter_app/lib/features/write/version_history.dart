import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/diff.dart';
import '../../shared/domain/records/story_node.dart';
import 'data/manuscript_service.dart';

String reasonLabel(JsonMap r) {
  final label = str(r['label']).trim();
  return switch (r['reason']) {
    'manual' => label.isEmpty ? 'Saved version' : label,
    'restore' => label.isEmpty ? 'Before restoring an earlier version' : label,
    'recovery' => label.isEmpty ? 'Unsaved writing from an earlier session' : label,
    'conflict' => label.isEmpty ? 'Set aside in a conflict' : label,
    _ => 'Automatic',
  };
}

/// A chapter's earlier versions, each compared word by word with the text now. Restoring keeps the current text in
/// history first. Returns true when a version was restored.
Future<bool?> showVersionHistory(
  BuildContext context, {
  required ManuscriptService service,
  required String novelId,
  required StoryNode node,
  required JsonMap? current,
  required int rev,
}) {
  final body = _History(service: service, novelId: novelId, node: node, current: current, rev: rev);
  return showDialog<bool>(
    context: context,
    builder: (context) => WindowSize.of(context) == WindowSize.compact
        ? Dialog.fullscreen(child: body)
        : Dialog(
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1000, maxHeight: 760), child: body),
          ),
  );
}

class _History extends StatefulWidget {
  const _History({
    required this.service,
    required this.novelId,
    required this.node,
    required this.current,
    required this.rev,
  });

  final ManuscriptService service;
  final String novelId;
  final StoryNode node;
  final JsonMap? current;
  final int rev;

  @override
  State<_History> createState() => _HistoryState();
}

class _HistoryState extends State<_History> {
  late List<JsonMap> _versions = widget.service.revisions(widget.novelId, widget.node.id);
  JsonMap? _selected;

  Future<void> _restore(JsonMap version) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Restore this version?',
      message: 'It replaces the text now. The text now is kept in the history first, so this can be undone.',
      confirmLabel: 'Restore',
    );
    if (!ok || !mounted) return;
    try {
      widget.service.restoreRevision(widget.novelId, widget.node.id, str(version['id']), baseRev: widget.rev);
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('It could not be restored, and nothing was changed: $e')));
    }
  }

  Future<void> _saveVersion() async {
    final name = await showTextPrompt(
      context,
      title: 'Save a version',
      label: 'Name (optional)',
      hint: 'Before the big rewrite',
      confirmLabel: 'Save version',
    );
    if (name == null) return;
    widget.service.saveVersion(widget.novelId, widget.node.id, label: name);
    setState(() => _versions = widget.service.revisions(widget.novelId, widget.node.id));
  }

  @override
  Widget build(BuildContext context) {
    final compact = WindowSize.of(context) == WindowSize.compact;
    final local = MaterialLocalizations.of(context);
    String when(JsonMap r) {
      final t = DateTime.fromMillisecondsSinceEpoch((numOrNull(r['capturedAt']) ?? 0).toInt());
      return '${local.formatMediumDate(t)} ${local.formatTimeOfDay(TimeOfDay.fromDateTime(t))}';
    }

    final list = _versions.isEmpty
        ? const EmptyState(
            icon: Icons.history,
            title: 'No earlier versions yet',
            message: 'A copy is kept every few minutes while you write, and whenever you save a version.',
          )
        : ListView(
            children: [
              for (final r in _versions)
                ListTile(
                  selected: identical(r, _selected),
                  title: Text(reasonLabel(r)),
                  subtitle: Text('${when(r)} · ${formatNumber(intOrNull(r['wordCount']) ?? 0)} words'),
                  onTap: () => setState(() => _selected = r),
                ),
            ],
          );
    final selected = _selected;
    final comparison = selected == null
        ? const EmptyState(
            icon: Icons.compare_arrows,
            title: 'Choose a version',
            message: 'It is compared with the text now.',
          )
        : _Comparison(version: selected, current: widget.current, onRestore: () => _restore(selected));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
          child: Row(
            children: [
              if (compact && selected != null)
                IconButton(
                  tooltip: 'Back to the list',
                  onPressed: () => setState(() => _selected = null),
                  icon: const Icon(Icons.arrow_back),
                ),
              Expanded(
                child: Text('History of “${widget.node.displayTitle}”', style: Theme.of(context).textTheme.titleLarge),
              ),
              TextButton(onPressed: _saveVersion, child: const Text('Save a version')),
              IconButton(tooltip: 'Close', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
            ],
          ),
        ),
        const Divider(),
        Expanded(
          child: compact
              ? (selected == null ? list : comparison)
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SizedBox(width: 300, child: list),
                    const VerticalDivider(width: 1),
                    Expanded(child: comparison),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Paragraphs added, removed, changed or moved since the version: marked with a sign and a style, not by colour alone.
class _Comparison extends StatelessWidget {
  const _Comparison({required this.version, required this.current, required this.onRestore});

  final JsonMap version;
  final JsonMap? current;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final result = diffDocs(version['doc'], current);
    final stats = result.stats;
    final added = theme.textTheme.bodyLarge?.copyWith(
      decoration: TextDecoration.underline,
      color: theme.colorScheme.primary,
      fontWeight: FontWeight.w600,
    );
    final removed = theme.textTheme.bodyLarge?.copyWith(
      decoration: TextDecoration.lineThrough,
      color: theme.colorScheme.onSurfaceVariant,
    );
    Widget para(String sign, String semantics, List<InlineSpan> spans) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 20,
            child: Text(sign, semanticsLabel: semantics, style: theme.textTheme.bodyLarge),
          ),
          Expanded(
            child: Text.rich(TextSpan(style: theme.textTheme.bodyLarge, children: spans)),
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                result.identical
                    ? 'The same text as now (formatting may differ).'
                    : '+${stats['wordsAdded']} words, −${stats['wordsRemoved']} words, ${plural(stats['paragraphsChanged']!, 'paragraph')} changed since this version',
              ),
              FilledButton(onPressed: onRestore, child: const Text('Restore this version')),
            ],
          ),
        ),
        const Divider(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              for (final b in result.blocks)
                switch (b.kind) {
                  'same' => para('', '', [TextSpan(text: b.text)]),
                  'added' => para('+', 'Added: ', [TextSpan(text: b.text, style: added)]),
                  'removed' => para('−', 'Removed: ', [TextSpan(text: b.text, style: removed)]),
                  'moved' => para('↕', 'Moved: ', [
                    TextSpan(text: '${b.side == 'to' ? 'Moved here: ' : 'Moved from here: '}${b.text}'),
                  ]),
                  _ => para('~', 'Changed: ', [
                    for (final p in b.parts)
                      TextSpan(
                        text: p.text,
                        style: switch (p.op) {
                          DiffOp.add => added,
                          DiffOp.del => removed,
                          DiffOp.same => null,
                        },
                      ),
                  ]),
                },
            ],
          ),
        ),
      ],
    );
  }
}
