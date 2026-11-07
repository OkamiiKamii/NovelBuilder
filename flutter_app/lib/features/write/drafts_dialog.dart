import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/prose.dart';
import '../../shared/domain/records/story_node.dart';
import 'data/manuscript_service.dart';

/// Alternate drafts of a chapter or scene, as in the original app: the draft in the manuscript (the only one counted,
/// searched, read and exported) and the others kept beside it. Starting a new draft sets the text aside under its own
/// name; switching swaps two drafts and keeps both. Returns true when the text in the manuscript changed, so the editor
/// opens it again.
Future<bool?> showDrafts(
  BuildContext context, {
  required ManuscriptService service,
  required String novelId,
  required StoryNode node,
}) {
  final body = _Drafts(service: service, novelId: novelId, node: node);
  return showDialog<bool>(
    context: context,
    builder: (context) => WindowSize.of(context) == WindowSize.compact
        ? Dialog.fullscreen(child: body)
        : Dialog(
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 640, maxHeight: 720), child: body),
          ),
  );
}

class _Drafts extends StatefulWidget {
  const _Drafts({required this.service, required this.novelId, required this.node});
  final ManuscriptService service;
  final String novelId;
  final StoryNode node;

  @override
  State<_Drafts> createState() => _DraftsState();
}

class _DraftsState extends State<_Drafts> {
  /// Whether the text in the manuscript changed while this was open.
  var _changed = false;

  String get _kind => widget.node.kindKey;

  void _tell(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  /// Makes a change; a change that cannot be made is said, and nothing is changed.
  bool _try(void Function() change) {
    try {
      change();
      setState(() {});
      return true;
    } on DraftRefused catch (e) {
      _tell(e.message);
    } on Object catch (e) {
      _tell('It could not be done, and nothing was changed: $e');
    }
    return false;
  }

  Future<void> _new() async {
    final picked = await showDialog<({String name, bool blank})>(context: context, builder: (_) => const _NewDraft());
    if (picked == null || !mounted) return;
    final done = _try(
      () => widget.service.createDraft(widget.novelId, widget.node.id, picked.name, blank: picked.blank),
    );
    if (done) {
      if (picked.blank) _changed = true;
      _tell(
        picked.blank
            ? 'Started “${picked.name.trim()}” on a blank page. The text before is kept as a draft.'
            : 'Started “${picked.name.trim()}” from a copy. The text before is kept as a draft too.',
      );
    }
  }

  Future<void> _rename(String? draftId, String current) async {
    final name = await showTextPrompt(
      context,
      title: 'Rename the draft',
      label: 'Name',
      initial: current,
      confirmLabel: 'Rename',
    );
    if (name == null || !mounted) return;
    _try(() => widget.service.renameDraft(widget.novelId, widget.node.id, draftId, name));
  }

  Future<void> _switch(JsonMap draft, String active) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Put “${str(draft['name'])}” in the manuscript?',
      message:
          'The text in the manuscript now, “$active”, is kept as an alternate draft. You can switch back at any time.',
      confirmLabel: 'Switch drafts',
    );
    if (!ok || !mounted) return;
    if (_try(() => widget.service.switchDraft(widget.novelId, widget.node.id, str(draft['id'])))) _changed = true;
  }

  Future<void> _delete(JsonMap draft) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Delete the draft “${str(draft['name'])}”?',
      message: 'Its text is deleted for good. The draft in the manuscript is not touched.',
      confirmLabel: 'Delete draft',
      destructive: true,
    );
    if (!ok || !mounted) return;
    _try(() => widget.service.deleteDraft(widget.novelId, str(draft['id'])));
  }

  void _read(JsonMap draft) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(str(draft['name'])),
      scrollable: true,
      content: SizedBox(
        width: 560,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final paragraph in blockTexts(draft['doc']))
              Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(paragraph)),
            if (blockTexts(draft['doc']).every((t) => t.trim().isEmpty)) const Text('This draft is empty.'),
          ],
        ),
      ),
      actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close'))],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final active = widget.service.activeDraft(widget.novelId, widget.node.id);
    final others = widget.service.alternateDrafts(widget.novelId, widget.node.id);
    final words = StoryNode(widget.service.store.row(widget.novelId, 'chapters', widget.node.id) ?? const {}).wordCount;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
            child: Row(
              children: [
                Expanded(child: Text('Drafts of “${widget.node.displayTitle}”', style: theme.textTheme.titleLarge)),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(_changed),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                Text(
                  'Only the draft in the manuscript is counted, searched, read and exported. The others are kept here, '
                  'whole, to switch to at any time.',
                  style: muted,
                ),
                const SizedBox(height: 12),
                Text('In the manuscript', style: theme.textTheme.titleSmall),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.edit_note),
                    title: Text(active),
                    subtitle: Text('${formatNumber(words)} words'),
                    trailing: IconButton(
                      tooltip: 'Rename “$active”',
                      icon: const Icon(Icons.drive_file_rename_outline),
                      onPressed: () => _rename(null, active),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text('Alternate drafts', style: theme.textTheme.titleSmall),
                if (others.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'None yet. Start a new draft to try another version of this $_kind without losing this one.',
                      style: muted,
                    ),
                  ),
                for (final d in others)
                  Card(
                    key: ValueKey(d['id']),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(str(d['name']), style: theme.textTheme.titleMedium),
                          Text('${formatNumber(intOrNull(d['wordCount']) ?? 0)} words', style: muted),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 4,
                            runSpacing: 4,
                            children: [
                              TextButton(
                                onPressed: () => _read(d),
                                child: Text('Read', semanticsLabel: 'Read “${str(d['name'])}”'),
                              ),
                              TextButton(
                                onPressed: () => _switch(d, active),
                                child: Text(
                                  'Put in the manuscript',
                                  semanticsLabel: 'Put “${str(d['name'])}” in the manuscript',
                                ),
                              ),
                              TextButton(
                                onPressed: () => _rename(str(d['id']), str(d['name'])),
                                child: Text('Rename', semanticsLabel: 'Rename “${str(d['name'])}”'),
                              ),
                              TextButton(
                                onPressed: () => _delete(d),
                                child: Text('Delete', semanticsLabel: 'Delete “${str(d['name'])}”'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: _new,
                icon: const Icon(Icons.add),
                label: const Text('Start a new draft…'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NewDraft extends StatefulWidget {
  const _NewDraft();

  @override
  State<_NewDraft> createState() => _NewDraftState();
}

class _NewDraftState extends State<_NewDraft> {
  final _name = TextEditingController();
  var _blank = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _done() {
    if (_name.text.trim().isEmpty) return;
    Navigator.of(context).pop((name: _name.text, blank: _blank));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Start a new draft'),
    scrollable: true,
    content: SizedBox(
      width: 420,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _name,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Name of the new draft', hintText: 'Alternate ending'),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _done(),
          ),
          const SizedBox(height: 12),
          RadioGroup<bool>(
            groupValue: _blank,
            onChanged: (v) => setState(() => _blank = v ?? false),
            child: const Column(
              children: [
                RadioListTile<bool>(
                  value: false,
                  contentPadding: EdgeInsets.zero,
                  title: Text('Start from a copy of the text now'),
                ),
                RadioListTile<bool>(value: true, contentPadding: EdgeInsets.zero, title: Text('Start on a blank page')),
              ],
            ),
          ),
          const Text('The text now is kept as a draft under its own name either way.'),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(onPressed: _name.text.trim().isEmpty ? null : _done, child: const Text('Start draft')),
    ],
  );
}
