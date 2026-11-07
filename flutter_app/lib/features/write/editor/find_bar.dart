import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:super_editor/super_editor.dart';

import '../../../core/format.dart';
import 'find_replace.dart';

/// Find (and, when asked, replace) in the chapter. Finding only selects; text changes only on Replace or Replace all,
/// and Undo reverts them.
class FindBar extends StatefulWidget {
  const FindBar({
    super.key,
    required this.editor,
    required this.document,
    required this.onClose,
    this.initialTerm,
    this.initialBlock,
  });

  final Editor editor;
  final MutableDocument document;
  final VoidCallback onClose;

  /// Words to find straight away, and the paragraph whose match to select first (from search across the novel).
  final String? initialTerm;
  final int? initialBlock;

  @override
  State<FindBar> createState() => _FindBarState();
}

class _FindBarState extends State<FindBar> {
  final _find = TextEditingController();
  final _replace = TextEditingController();
  bool _matchCase = false;
  bool _wholeWords = false;
  bool _replacing = false;
  List<TextMatch> _matches = const [];
  int _current = -1;

  @override
  void initState() {
    super.initState();
    widget.document.addListener(_documentChanged);
    final term = widget.initialTerm;
    if (term != null && term.isNotEmpty) {
      _find.text = term;
      _search();
      final block = widget.initialBlock ?? 0;
      final at = _matches.indexWhere((m) => widget.document.getNodeIndexById(m.nodeId) >= block);
      if (_matches.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _select(at < 0 ? 0 : at);
        });
      }
    }
  }

  @override
  void dispose() {
    widget.document.removeListener(_documentChanged);
    _find.dispose();
    _replace.dispose();
    super.dispose();
  }

  void _documentChanged(DocumentChangeLog _) {
    if (mounted) setState(_search);
  }

  void _search() {
    _matches = findInDocument(widget.document, _find.text, matchCase: _matchCase, wholeWords: _wholeWords);
    if (_matches.isEmpty) {
      _current = -1;
    } else if (_current < 0 || _current >= _matches.length) {
      _current = 0;
    }
  }

  void _select(int index) {
    if (_matches.isEmpty) return;
    setState(() => _current = index % _matches.length);
    final m = _matches[_current];
    widget.editor.execute([
      ChangeSelectionRequest(
        DocumentSelection(base: m.range.start, extent: m.range.end),
        SelectionChangeType.placeCaret,
        SelectionReason.userInteraction,
      ),
    ]);
  }

  void _replaceCurrent() {
    if (_current < 0 || _current >= _matches.length) return;
    final m = _matches[_current];
    widget.editor.execute(replaceRequests(widget.document, [m], _replace.text));
    setState(_search);
    if (_matches.isNotEmpty) _select(_current);
  }

  void _replaceAll() {
    final n = _matches.length;
    if (n == 0) return;
    widget.editor.execute(replaceRequests(widget.document, _matches, _replace.text));
    setState(_search);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Replaced ${plural(n, 'place')}.'),
          action: SnackBarAction(label: 'Undo', onPressed: widget.editor.undo),
          persist: false,
          duration: const Duration(seconds: 6),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = _find.text.isEmpty
        ? ''
        : _matches.isEmpty
        ? 'No matches'
        : '${_current + 1} of ${_matches.length}';
    return CallbackShortcuts(
      bindings: {const SingleActivator(LogicalKeyboardKey.escape): widget.onClose},
      child: Material(
        color: theme.colorScheme.surfaceContainer,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _find,
                      autofocus: true,
                      decoration: InputDecoration(labelText: 'Find', isDense: true, suffixText: count),
                      onChanged: (_) => setState(() {
                        _current = -1;
                        _search();
                        if (_matches.isNotEmpty) _select(0);
                      }),
                      onSubmitted: (_) => _select(_current + 1),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Previous match',
                    onPressed: _matches.isEmpty ? null : () => _select(_current - 1),
                    icon: const Icon(Icons.keyboard_arrow_up),
                  ),
                  IconButton(
                    tooltip: 'Next match',
                    onPressed: _matches.isEmpty ? null : () => _select(_current + 1),
                    icon: const Icon(Icons.keyboard_arrow_down),
                  ),
                  IconButton(
                    tooltip: _replacing ? 'Hide replace' : 'Replace…',
                    onPressed: () => setState(() => _replacing = !_replacing),
                    icon: Icon(_replacing ? Icons.unfold_less : Icons.find_replace),
                  ),
                  IconButton(tooltip: 'Close find (Esc)', onPressed: widget.onClose, icon: const Icon(Icons.close)),
                ],
              ),
              Wrap(
                spacing: 8,
                children: [
                  FilterChip(
                    label: const Text('Match case'),
                    selected: _matchCase,
                    onSelected: (v) => setState(() {
                      _matchCase = v;
                      _search();
                    }),
                  ),
                  FilterChip(
                    label: const Text('Whole words'),
                    selected: _wholeWords,
                    onSelected: (v) => setState(() {
                      _wholeWords = v;
                      _search();
                    }),
                  ),
                ],
              ),
              if (_replacing)
                Padding(
                  padding: const EdgeInsets.only(top: 8, right: 8),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      SizedBox(
                        width: 260,
                        child: TextField(
                          controller: _replace,
                          decoration: const InputDecoration(labelText: 'Replace with', isDense: true),
                        ),
                      ),
                      OutlinedButton(onPressed: _current < 0 ? null : _replaceCurrent, child: const Text('Replace')),
                      OutlinedButton(
                        onPressed: _matches.isEmpty ? null : _replaceAll,
                        child: const Text('Replace all'),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
