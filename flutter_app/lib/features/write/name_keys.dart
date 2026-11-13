import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/domain/codex/in_chapter.dart' show Present;
import '../../shared/domain/text/name_keys.dart';
import 'in_chapter.dart';
import 'notify_after_build.dart';

/// NAME KEYS at the page (`shared/domain/text/name_keys.dart` says which): while a name is being typed, the book's names
/// that complete it, a press (or Tab, on a computer) putting the whole name in as it is recorded; while nothing is, on
/// a phone, the names already on this page, a press putting one in at the caret.
///
/// It follows the caret and the page's company ([InChapter]); it writes only when a key is pressed, and then exactly
/// what was asked: the name, in place of the letters typed of it.
class NameKeys extends ChangeNotifier with NotifyAfterBuild {
  Editor? _editor;
  MutableDocumentComposer? _composer;
  MutableDocument? _document;
  InChapter? _company;

  List<NameKey> _keys = const [];
  ({String nodeId, int start, int end})? _word;

  /// The keys to show now.
  List<NameKey> get keys => _keys;

  /// Whether the keys complete a word being typed (else they are the page's names).
  bool get completing => _word != null;

  void attach(Editor editor, MutableDocumentComposer composer, MutableDocument document, InChapter company) {
    detach();
    _editor = editor;
    _composer = composer..selectionNotifier.addListener(_read);
    _document = document;
    _company = company..addListener(_read);
    _read();
  }

  void detach() {
    _composer?.selectionNotifier.removeListener(_read);
    _company?.removeListener(_read);
    _editor = null;
    _composer = null;
    _document = null;
    _company = null;
    _keys = const [];
    _word = null;
  }

  /// The kind of record a key names ("character", "location"…), for its icon.
  String kindOf(NameKey key) => _company?.company?.entries[key.id]?.category ?? '';

  void _read() {
    var keys = const <NameKey>[];
    ({String nodeId, int start, int end})? word;
    final selection = _composer?.selection;
    final company = _company;
    final names = company?.company?.names ?? const <String, List<String>>{};
    final present = <String>[for (final p in company?.present ?? const <Present>[]) p.id];
    if (selection != null && selection.isCollapsed && names.isNotEmpty) {
      final at = selection.extent.nodePosition;
      final node = _document?.getNodeById(selection.extent.nodeId);
      if (at is TextNodePosition && node is TextNode) {
        final text = node.text.toPlainText();
        final typed = wordAt(text, at.offset);
        if (typed != null) {
          keys = completionsFor(typed.word, names, present: present);
          // The name is written out already ("Ilse| Marrow"): nothing to complete.
          if (keys.any((k) => text.startsWith(k.name, typed.start))) keys = const [];
          if (keys.isNotEmpty) word = (nodeId: node.id, start: typed.start, end: at.offset);
        }
        if (keys.isEmpty) keys = pageKeys(names, present);
      }
    }
    if (_same(keys, _keys) && word == _word) return;
    _keys = keys;
    _word = word;
    notifyWhenSafe();
  }

  static bool _same(List<NameKey> a, List<NameKey> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  /// Puts [key]'s name in: over the letters typed of it, or at the caret (after a space, when it would otherwise join
  /// the word before). The caret lands after the name.
  void press(NameKey key) {
    final editor = _editor;
    final composer = _composer;
    final selection = composer?.selection;
    if (editor == null || composer == null || selection == null || !selection.isCollapsed) return;
    final at = selection.extent.nodePosition;
    final node = _document?.getNodeById(selection.extent.nodeId);
    if (at is! TextNodePosition || node is! TextNode) return;
    DocumentPosition pos(int offset) => DocumentPosition(
      nodeId: node.id,
      nodePosition: TextNodePosition(offset: offset),
    );
    final style = composer.preferences.currentAttributions.toSet();
    final word = _word;
    late final int end;
    if (word != null && word.nodeId == node.id && word.end == at.offset) {
      editor.execute([
        const ClearComposingRegionRequest(),
        DeleteContentRequest(
          documentRange: DocumentRange(start: pos(word.start), end: pos(word.end)),
        ),
        InsertTextRequest(documentPosition: pos(word.start), textToInsert: key.name, attributions: style),
      ]);
      end = word.start + key.name.length;
    } else {
      final text = node.text.toPlainText();
      final before = at.offset > 0 ? text[at.offset - 1] : ' ';
      final lead = before.trim().isEmpty || '(“"‘\'—–-'.contains(before) ? '' : ' ';
      editor.execute([
        const ClearComposingRegionRequest(),
        InsertTextRequest(documentPosition: pos(at.offset), textToInsert: '$lead${key.name}', attributions: style),
      ]);
      end = at.offset + lead.length + key.name.length;
    }
    editor.execute([
      ChangeSelectionRequest(
        DocumentSelection.collapsed(position: pos(end)),
        SelectionChangeType.placeCaret,
        SelectionReason.userInteraction,
      ),
    ]);
  }

  /// Tab puts in the first name that completes the word being typed; otherwise Tab does what it always does.
  ExecutionInstruction tab({required SuperEditorContext editContext, required KeyEvent keyEvent}) {
    if (keyEvent is! KeyDownEvent || keyEvent.logicalKey != LogicalKeyboardKey.tab) {
      return ExecutionInstruction.continueExecution;
    }
    if (HardwareKeyboard.instance.isShiftPressed || !completing || _keys.isEmpty) {
      return ExecutionInstruction.continueExecution;
    }
    press(_keys.first);
    return ExecutionInstruction.haltExecution;
  }

  @override
  void dispose() {
    stopNotifying();
    detach();
    super.dispose();
  }
}

/// The keys as a row: in the ink tray over a phone's keyboard, or under the formatting on a computer (there only while
/// a name is being typed, its first key marked Tab).
class NameKeysRow extends StatelessWidget {
  const NameKeysRow({super.key, required this.keys, this.tabHint = false});

  final NameKeys keys;

  /// Whether the first key says Tab puts it in (a computer).
  final bool tabHint;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: keys,
      builder: (context, _) {
        final shown = keys.keys;
        if (shown.isEmpty || (tabHint && !keys.completing)) return const SizedBox.shrink();
        final scheme = Theme.of(context).colorScheme;
        return Semantics(
          container: true,
          label: keys.completing ? 'Names that complete the word' : 'Names on this page',
          child: SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: [
                for (final (i, k) in shown.indexed)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Center(
                      child: _Key(
                        name: k.name,
                        icon: kindIconOf(keys.kindOf(k)),
                        first: keys.completing && i == 0,
                        tab: tabHint && i == 0,
                        scheme: scheme,
                        onPressed: () => keys.press(k),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({
    required this.name,
    required this.icon,
    required this.first,
    required this.tab,
    required this.scheme,
    required this.onPressed,
  });

  final String name;
  final IconData icon;
  final bool first;
  final bool tab;
  final ColorScheme scheme;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final ink = first ? scheme.onPrimaryContainer : scheme.onSurface;
    // A full thumb's height to press (the room round the chip presses it too); the chip itself is drawn slimmer.
    return Semantics(
      button: true,
      label: tab ? 'Write $name (Tab)' : 'Write $name',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: onPressed,
        child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: _chip(ink)),
      ),
    );
  }

  Widget _chip(Color ink) {
    return Material(
      color: first ? scheme.primaryContainer : scheme.surfaceContainerHigh,
      shape: StadiumBorder(side: BorderSide(color: first ? scheme.primary : scheme.outlineVariant)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 40, minWidth: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16, color: first ? ink : scheme.onSurfaceVariant),
                const SizedBox(width: 6),
                Text(
                  name,
                  style: TextStyle(color: ink, fontWeight: FontWeight.w600),
                ),
                if (tab) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: ink.withValues(alpha: 0.5)),
                    ),
                    child: Text('Tab', style: TextStyle(color: ink, fontSize: 11)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
