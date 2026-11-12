import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:super_editor/super_editor.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/save_status_indicator.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/prose.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/text/rhythm.dart';
import '../characters/character_actions.dart';
import '../characters/widgets/vault.dart';
import 'chapter_end.dart';
import 'chapter_spine.dart';
import 'data/manuscript_service.dart';
import 'drafts_dialog.dart';
import 'editor/find_bar.dart';
import 'editor/link_bar.dart';
import 'editor/prose_document.dart';
import 'first_page.dart';
import 'fresh_ink.dart';
import 'goal_pledge.dart';
import 'in_chapter.dart';
import 'margin.dart';
import 'next_note.dart';
import 'nudge.dart';
import 'red_pencil.dart';
import 'rhythm.dart';
import 'sprint.dart';
import 'time_lapse.dart';
import 'version_history.dart';
import 'voices.dart';
import 'write_providers.dart';
import 'writing_prefs.dart';
import 'writing_prefs_controls.dart';

/// Saves are made at most this long apart while the author keeps typing (as well as when typing pauses).
const _maxUnsaved = Duration(seconds: 5);

/// Crash copies are written this often while there is unsaved writing.
const _draftEvery = Duration(milliseconds: 250);

/// Where the typewriter keeps the line being written: this far down the page's height.
const typewriterLine = 0.45;

/// Writing one chapter or scene.
///
/// NON-INVASIVE EDITING: the editor is built with no automatic conversions (no Markdown shortcuts, no smart dashes,
/// no turning addresses into links, nothing fetched from the network) and opens no links. The author's keys are the
/// only thing that changes the text.
class ChapterEditor extends ConsumerStatefulWidget {
  const ChapterEditor({super.key, required this.novelId, required this.node, this.onBack});

  final String novelId;
  final StoryNode node;

  /// On phones: back to the outline.
  final VoidCallback? onBack;

  @override
  ConsumerState<ChapterEditor> createState() => _ChapterEditorState();
}

class _ChapterEditorState extends ConsumerState<ChapterEditor> with WidgetsBindingObserver {
  late final ManuscriptService _service = ref.read(manuscriptServiceProvider);
  late final _saves = ref.read(saveControllerProvider);
  late final _title = TextEditingController(text: widget.node.title);
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final _layout = GlobalKey();
  bool _centering = false;

  late OpenedText _opened;
  late int _rev;
  EditableProse? _prose;
  MutableDocument? _document;
  MutableDocumentComposer? _composer;
  Editor? _editor;
  ({JsonMap doc, DateTime at})? _recovered;
  bool _dirty = false;
  bool _conflict = false;
  bool _findOpen = false;

  /// The red pencil's marks are drawn by the editor's layout, never put in the text (`red_pencil.dart`).
  final _pencil = RedPencil();

  /// The voices are drawn the same way (`voices.dart`): dialogue in its speaker's colour.
  final _voices = VoicesLens();

  /// The paragraphs written or changed today, marked beside the text (`fresh_ink.dart`).
  final _ink = FreshInk();

  /// Who and what the page names (`in_chapter.dart`).
  final _company = InChapter();

  /// Watches for the writing stopping, to offer a nudge (`nudge.dart`).
  late final _stuck = StuckWatch(focused: () => _focus.hasFocus);
  void _stir([Object? _]) => _stuck.stirred();
  late final _pencilPhases = [_voices.styler, _pencil.styler];
  DateTime? _dirtySince;
  Timer? _draftTimer;
  Timer? _countTimer;
  ({int words, int characters, int paragraphs, int readingMinutes}) _counts = measure(const []);

  /// The chapter's words when this sitting began: a split or a restore starts a new one.
  int _sessionStart = 0;

  String get _saveKey => 'chapter:${widget.node.id}';

  /// Words to find when the chapter was opened from search, and the paragraph they were found in.
  ({String term, int block})? _findStart;

  @override
  void initState() {
    super.initState();
    // The keyboard coming up or going away moves the ink tray (below the page on a phone).
    WidgetsBinding.instance.addObserver(this);
    _focus.addListener(_stir);
    _stuck.addListener(_placeNudge);
    _pencil.on = ref.read(redPencilProvider);
    _voices.cast = voiceCastOf(ref.read(novelStoreProvider), widget.novelId);
    _voices.on = ref.read(voicesProvider);
    _load();
    final pending = ref.read(pendingFindProvider);
    if (pending != null && pending.nodeId == widget.node.id && _editor != null) {
      _findStart = (term: pending.term, block: pending.block);
      _findOpen = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ref.read(pendingFindProvider.notifier).request(null);
      });
    } else if (ref.read(pendingCaretEndProvider) == widget.node.id) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(pendingCaretEndProvider.notifier).request(null);
        _caretAtEnd();
      });
    }
    // Opened during a sprint (moving to another chapter): this one counts from its words now.
    if (ref.read(sprintProvider) != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ref.read(sprintProvider.notifier).report(widget.node.id, _counts.words);
      });
    }
  }

  /// The page's paragraphs as they stood when today began (null when that cannot be known).
  List<String>? _dayStartText() {
    final store = ref.read(novelStoreProvider);
    final now = DateTime.now();
    return textAtDayStart(
      node: store.row(widget.novelId, 'chapters', widget.node.id),
      saved: store.row(widget.novelId, 'chapterContents', widget.node.id),
      revisions: _service.revisions(widget.novelId, widget.node.id),
      dayStart: DateTime(now.year, now.month, now.day),
    );
  }

  /// The nudges for this page as it is now: its plan, and the line the caret is in (else the last with words).
  List<Nudge> _nudges() {
    final document = _document;
    var line = '';
    final at = _composer?.selection?.extent.nodeId;
    final here = at == null ? null : document?.getNodeById(at);
    if (here is TextNode && here.text.toPlainText().trim().isNotEmpty) {
      line = here.text.toPlainText();
    } else if (document != null) {
      for (final n in document) {
        if (n is TextNode && n.text.toPlainText().trim().isNotEmpty) line = n.text.toPlainText();
      }
    }
    final now = DateTime.now();
    return nudgesFor(
      marginNotesOf(ref.read(novelStoreProvider), widget.novelId, widget.node.id),
      lastLine: line,
      seed: now.year * 1000 + now.month * 40 + now.day + widget.node.id.hashCode,
    );
  }

  /// Back to the contents (on a phone). After a real sitting on a page with no note left for it, first the offer of
  /// one line for next time (`next_note.dart`); leaving without one is one press.
  Future<void> _back() async {
    final written = _counts.words - _sessionStart;
    if (written >= nextNoteAfterWords && ref.read(nextNotesProvider)[widget.node.id] == null) {
      _flush();
      _focus.unfocus();
      await leaveNextNote(context, ref, nodeId: widget.node.id, title: widget.node.displayTitle, leaving: true);
      if (!mounted) return;
    }
    widget.onBack?.call();
  }

  /// The caret after the chapter's last word, with the editor focused: from "Continue writing" in the library.
  void _caretAtEnd() {
    final editor = _editor;
    final last = _document?.lastWhere((n) => n is TextNode, orElse: () => _document!.last);
    if (editor == null || last is! TextNode) return;
    editor.execute([
      ChangeSelectionRequest(
        DocumentSelection.collapsed(
          position: DocumentPosition(
            nodeId: last.id,
            nodePosition: TextNodePosition(offset: last.text.length),
          ),
        ),
        SelectionChangeType.placeCaret,
        SelectionReason.userInteraction,
      ),
    ]);
    _focus.requestFocus();
  }

  void _load({JsonMap? override}) {
    _opened = _service.open(widget.novelId, widget.node.id);
    _rev = _opened.rev;
    _recovered = override == null ? _opened.recovered : null;
    _attach(override ?? _opened.doc);
  }

  void _attach(JsonMap? doc) {
    _detach();
    _prose = editableDocument(doc);
    _counts = measureDoc(doc);
    _sessionStart = _counts.words;
    final document = _prose!.document;
    if (document == null) return;
    _document = document;
    _composer = MutableDocumentComposer();
    _editor = Editor(
      editables: {Editor.documentKey: document, Editor.composerKey: _composer!},
      requestHandlers: List<EditRequestHandler>.of(defaultRequestHandlers.cast<EditRequestHandler>()),
      // Only keeps the typing style in step with the caret. Every converting reaction is left out on purpose.
      reactionPipeline: [UpdateComposerTextStylesReaction()],
      isHistoryEnabled: true,
    );
    document.addListener(_changed);
    _composer!.selectionNotifier.addListener(_keepCentred);
    document.addListener(_stir);
    _composer!.selectionNotifier.addListener(_stir);
    _pencil.attach(document);
    _voices.attach(document);
    _ink.attach(document, _dayStartText());
    _company.attach(document, pageCompanyOf(ref.read(novelStoreProvider), widget.novelId));
  }

  void _detach() {
    _pencil.detach();
    _voices.detach();
    _ink.detach();
    _company.detach();
    _document?.removeListener(_changed);
    _document?.removeListener(_stir);
    // The editor on screen may still be using its composer this frame: let it go first.
    final composer = _composer;
    composer?.selectionNotifier.removeListener(_keepCentred);
    composer?.selectionNotifier.removeListener(_stir);
    if (composer != null) WidgetsBinding.instance.addPostFrameCallback((_) => composer.dispose());
    _editor = null;
    _composer = null;
    _document = null;
  }

  /// TYPEWRITER: in focus mode, the page moves so the caret's line sits a little above the middle of the screen, the
  /// way paper feeds through a typewriter. Once a frame at most, after the caret has been laid out; only ever scrolls,
  /// never touches the text or the caret.
  void _keepCentred() {
    if (_centering || !ref.read(focusModeProvider) || !ref.read(typewriterProvider)) return;
    _centering = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _centering = false;
      if (mounted) _centre(glide: !MediaQuery.disableAnimationsOf(context));
    });
  }

  /// Moves the page so the caret's line is at [typewriterLine]. A glide that something else interrupts (the editor
  /// keeping a tapped caret in view, on a phone) is set straight once it stops, without gliding again.
  /// Whether the caret is in the lower half of the page on screen: the nudge then stands at the page's head, so it
  /// never covers the line being written.
  bool _caretLow() {
    final selection = _composer?.selection;
    final Object? layout = _layout.currentState;
    if (!_scroll.hasClients || selection == null || layout is! DocumentLayout) return true;
    final caret = layout.getRectForPosition(selection.extent);
    final viewport = _scroll.position.context.storageContext.findRenderObject();
    if (caret == null || viewport is! RenderBox) return true;
    final y = layout.getGlobalOffsetFromDocumentOffset(caret.center).dy - viewport.localToGlobal(Offset.zero).dy;
    return y > viewport.size.height / 2;
  }

  /// Where the nudge stands: re-read each time the page stops.
  bool _nudgeHigh = true;
  void _placeNudge() {
    if (!mounted || !_stuck.stuck) return;
    final high = _caretLow();
    if (high != _nudgeHigh) setState(() => _nudgeHigh = high);
  }

  void _centre({required bool glide}) {
    if (!mounted || !_scroll.hasClients) return;
    final selection = _composer?.selection;
    final Object? layout = _layout.currentState;
    if (selection == null || layout is! DocumentLayout) return;
    final caret = layout.getRectForPosition(selection.extent);
    final position = _scroll.position;
    final viewport = position.context.storageContext.findRenderObject();
    if (caret == null || viewport is! RenderBox) return;
    // The layout is a sliver here: it says where its own points are on the screen.
    final y = layout.getGlobalOffsetFromDocumentOffset(caret.center).dy - viewport.localToGlobal(Offset.zero).dy;
    final target = (position.pixels + y - viewport.size.height * typewriterLine).clamp(
      position.minScrollExtent,
      position.maxScrollExtent,
    );
    if ((target - position.pixels).abs() < 2) return;
    if (!glide) {
      position.jumpTo(target);
      return;
    }
    position
        .animateTo(target, duration: const Duration(milliseconds: 160), curve: Curves.easeOutCubic)
        .whenComplete(
          () => WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && ref.read(focusModeProvider) && ref.read(typewriterProvider)) _centre(glide: false);
          }),
        );
  }

  /// The margin's cards as a sheet over the page: on a phone, or where the window leaves no room beside it.
  void _openMarginSheet() => showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheet) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.92,
      builder: (sheet, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          ChapterMargin(
            novelId: widget.novelId,
            nodeId: widget.node.id,
            onLeave: () {
              Navigator.of(sheet).pop();
              _flush();
            },
          ),
        ],
      ),
    ),
  );

  JsonMap _currentDoc() => documentToProse(_document!, extras: _prose!.docExtras);

  void _changed(DocumentChangeLog _) {
    _dirty = true;
    final now = DateTime.now();
    _dirtySince ??= now;
    if (_conflict) return;
    if (now.difference(_dirtySince!) > _maxUnsaved) {
      _saves.saveNow(_saveKey, _save);
    } else {
      _saves.schedule(_saveKey, _save);
    }
    _draftTimer ??= Timer(_draftEvery, _writeDraft);
    _countTimer?.cancel();
    _countTimer = Timer(const Duration(milliseconds: 300), () {
      if (mounted && _document != null) {
        setState(() => _counts = measureDoc(_currentDoc()));
        ref.read(sprintProvider.notifier).report(widget.node.id, _counts.words);
      }
    });
  }

  void _writeDraft() {
    _draftTimer = null;
    if (_dirty && _document != null) _service.saveDraft(widget.novelId, widget.node.id, _currentDoc(), _rev);
  }

  /// The autosave: the editor's document exactly as it is, against the revision it was opened at.
  void _save() {
    if (_document == null || !_dirty) return;
    try {
      _rev = _service.save(widget.novelId, widget.node.id, _currentDoc(), baseRev: _rev);
      _dirty = false;
      _dirtySince = null;
    } on SaveConflict {
      if (!_conflict && mounted) {
        setState(() => _conflict = true);
        WidgetsBinding.instance.addPostFrameCallback((_) => _resolveConflict());
      }
      rethrow; // Shown as "Not saved" until the author decides.
    }
  }

  Future<void> _resolveConflict() async {
    final keepMine = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('This chapter was saved somewhere else'),
        content: const Text(
          'It was changed in another window since you opened it here. Which text should be kept? The other one is '
          'kept in the chapter\'s history either way, so nothing is lost.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Use the saved text')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Keep my text')),
        ],
      ),
    );
    if (!mounted) return;
    if (keepMine == true) {
      final doc = _currentDoc();
      _saves.saveNow(_saveKey, () {
        _rev = _service.save(widget.novelId, widget.node.id, doc, baseRev: _rev, force: true);
        _dirty = false;
      });
    } else {
      // My text goes into history before the saved one is loaded.
      _service.keepInHistory(
        widget.novelId,
        widget.node.id,
        _currentDoc(),
        reason: 'conflict',
        label: 'Your text, set aside in a conflict',
      );
      _saves.saveNow(_saveKey, () {}); // Nothing of mine is waiting any more.
      _dirty = false;
    }
    setState(() {
      _conflict = false;
      _dirtySince = null;
      _load();
    });
  }

  /// Saves now (Cmd/Ctrl+S, leaving the chapter, splitting).
  bool _flush() {
    _draftTimer?.cancel();
    _draftTimer = null;
    return _dirty ? _saves.saveNow(_saveKey, _save) : true;
  }

  void _rename() {
    final title = _title.text;
    if (title.trim() == widget.node.title) return;
    _saves.saveNow('node:${widget.node.id}:title', () => _service.rename(widget.novelId, widget.node.id, title));
  }

  @override
  void didChangeMetrics() {
    if (mounted && WindowSize.of(context) == WindowSize.compact) setState(() {});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _rename();
    _flush();
    _countTimer?.cancel();
    _detach();
    _pencil.dispose();
    _voices.dispose();
    _ink.dispose();
    _company.dispose();
    _focus.removeListener(_stir);
    _stuck.dispose();
    _title.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _tell(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  // ----------------------------------------------------------------------------------------------- actions

  void _keepRecovered() {
    final doc = _recovered!.doc;
    setState(() {
      _recovered = null;
      _attach(doc);
      _dirty = true;
      _dirtySince = DateTime.now();
    });
    _saves.saveNow(_saveKey, _save);
  }

  void _discardRecovered() {
    _service.discardDraft(widget.novelId, widget.node.id);
    setState(() => _recovered = null);
  }

  Future<void> _splitHere() async {
    final selection = _composer?.selection;
    if (selection == null) return _tell('Put the cursor in the paragraph that should start the new part.');
    final nodes = _document!.toList();
    final at = nodes.indexWhere((n) => n.id == selection.extent.nodeId);
    if (at <= 0) return _tell('The cursor is in the first paragraph: there is nothing before it to keep.');
    final ok = await showConfirmDialog(
      context,
      title: 'Split “${widget.node.displayTitle}” here?',
      message:
          'Everything from the paragraph with the cursor on becomes a new ${widget.node.kindKey} right after this one. '
          'This text is kept in the history first.',
      confirmLabel: 'Split',
    );
    if (!ok || !mounted || !_flush()) return;
    final head = documentToProse(MutableDocument(nodes: nodes.sublist(0, at)), extras: _prose!.docExtras);
    final tail = documentToProse(MutableDocument(nodes: nodes.sublist(at)), extras: _prose!.docExtras);
    try {
      _service.split(widget.novelId, widget.node.id, head, tail);
      setState(_load);
      _tell('Split. The second part is right after this one in the outline.');
    } on Object catch (e) {
      _tell('It could not be split, and nothing was changed: $e');
    }
  }

  Future<void> _openDrafts() async {
    if (!_flush()) return _tell('The latest changes are not saved yet, so the drafts cannot be changed.');
    final changed = await showDrafts(context, service: _service, novelId: widget.novelId, node: widget.node);
    if (mounted) setState(changed == true ? _load : () {});
  }

  /// The chapter's sentences as a waveform (`rhythm.dart`); the one chosen is selected, so it is brought into view.
  Future<void> _openRhythm() async {
    final document = _document;
    final editor = _editor;
    if (document == null || editor == null) return;
    final ids = <String>[];
    final texts = <String>[];
    for (final node in document) {
      if (node is TextNode) {
        ids.add(node.id);
        texts.add(node.text.toPlainText());
      }
    }
    final picked = await showRhythm(context, report: rhythmOf(texts), title: widget.node.displayTitle);
    if (picked == null || !mounted || picked.block >= ids.length) return;
    final node = document.getNodeById(ids[picked.block]);
    if (node is! TextNode) return;
    final length = node.text.length;
    editor.execute([
      ChangeSelectionRequest(
        DocumentSelection(
          base: DocumentPosition(
            nodeId: node.id,
            nodePosition: TextNodePosition(offset: picked.start.clamp(0, length)),
          ),
          extent: DocumentPosition(
            nodeId: node.id,
            nodePosition: TextNodePosition(offset: picked.end.clamp(0, length)),
          ),
        ),
        SelectionChangeType.placeCaret,
        SelectionReason.userInteraction,
      ),
    ]);
  }

  /// The chapter writing itself, from its first saved copy to now (`time_lapse.dart`). Saved first, so now is now.
  Future<void> _openTimeLapse() async {
    _flush();
    final store = ref.read(novelStoreProvider);
    final row = store.row(widget.novelId, 'chapters', widget.node.id);
    await showTimeLapse(
      context,
      frames: lapseFramesOf(
        _service,
        widget.novelId,
        row == null ? widget.node : StoryNode(row),
        store.row(widget.novelId, 'chapterContents', widget.node.id),
      ),
      title: widget.node.displayTitle,
    );
  }

  Future<void> _openHistory() async {
    if (!_flush()) return _tell('The latest changes are not saved yet, so history cannot be compared.');
    final restored = await showVersionHistory(
      context,
      service: _service,
      novelId: widget.novelId,
      node: widget.node,
      current: _document == null ? _opened.doc : _currentDoc(),
      rev: _rev,
    );
    if (restored == true && mounted) setState(_load);
  }

  Future<void> _linkEntry() async {
    final selection = _composer?.selection;
    if (selection == null || selection.isCollapsed) return _tell('Select the words to link to a codex entry first.');
    final entries = ref.read(novelStoreProvider).rowsIn(widget.novelId, 'loreEntries');
    if (entries.isEmpty) return _tell('This novel has no codex entries yet to link to.');
    final picked = await showDialog<String>(
      context: context,
      builder: (_) => _EntryPicker(entries: entries),
    );
    if (picked == null) return;
    _editor!.execute([
      AddTextAttributionsRequest(documentRange: selection, attributions: {EntityLinkAttribution(picked)}),
    ]);
  }

  void _unlink() {
    final selection = _composer?.selection;
    if (selection == null || selection.isCollapsed) return _tell('Select the linked words to unlink.');
    final node = _document!.getNodeById(selection.extent.nodeId);
    final links = <Attribution>{
      if (node is TextNode)
        for (var i = 0; i < node.text.length; i++)
          ...node.text.getAllAttributionsAt(i).whereType<EntityLinkAttribution>(),
    };
    if (links.isEmpty) return;
    _editor!.execute([RemoveTextAttributionsRequest(documentRange: selection, attributions: links)]);
  }

  void _openFind() {
    if (_editor != null) setState(() => _findOpen = true);
  }

  Future<void> _openPrefs() {
    const body = SingleChildScrollView(padding: EdgeInsets.fromLTRB(20, 0, 20, 24), child: WritingPrefsControls());
    if (WindowSize.of(context) == WindowSize.compact) {
      return showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => const SafeArea(child: body),
      );
    }
    return showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Writing settings'),
        contentPadding: const EdgeInsets.only(top: 12),
        content: const SizedBox(width: 460, child: body),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done'))],
      ),
    );
  }

  /// "Ch. 3", or "Ch. 3 · scene", or the title of a part: where in the book this page is, in a few letters.
  String _shortPlace() {
    final n = StoryOrder.of(ref.read(outlineProvider)).chapterNumber[widget.node.id];
    return switch (widget.node.kind) {
      NodeKind.chapter when n != null => 'Ch. $n',
      NodeKind.scene when n != null => 'Ch. $n · scene',
      _ => widget.node.displayTitle,
    };
  }

  /// THE CHAPTERS, AT HAND: on a phone, every chapter and scene in reading order in a sheet over the page, numbered,
  /// with its length; the one open marked; **Previous** and **Next** at its head. A press opens that page (what is
  /// typed here is saved first), without going back to the contents.
  Future<void> _openChapters() async {
    final nodes = ref.read(outlineProvider);
    final pages = [
      for (final n in readingOrder(nodes))
        if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene) n,
    ];
    final numbers = StoryOrder.of(nodes).chapterNumber;
    final at = pages.indexWhere((n) => n.id == widget.node.id);
    final chosen = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) {
        final scheme = Theme.of(sheet).colorScheme;
        Widget step(IconData icon, String label, StoryNode? to) => Expanded(
          child: OutlinedButton.icon(
            onPressed: to == null ? null : () => Navigator.of(sheet).pop(to.id),
            icon: Icon(icon),
            label: Text(label),
          ),
        );
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          maxChildSize: 0.92,
          builder: (sheet, scroll) => ListView(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(0, 0, 0, 16),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 10),
                child: Text('The chapters', style: vaultHeading(sheet, size: 18, weight: 700)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Row(
                  children: [
                    step(Icons.chevron_left, 'Previous', at > 0 ? pages[at - 1] : null),
                    const SizedBox(width: 10),
                    step(Icons.chevron_right, 'Next', at >= 0 && at + 1 < pages.length ? pages[at + 1] : null),
                  ],
                ),
              ),
              for (final n in pages)
                ListTile(
                  selected: n.id == widget.node.id,
                  contentPadding: EdgeInsets.fromLTRB(n.kind == NodeKind.scene ? 48 : 24, 0, 24, 0),
                  leading: n.kind == NodeKind.chapter
                      ? Text(
                          '${numbers[n.id] ?? ''}',
                          style: vaultText(sheet, size: 18, style: FontStyle.italic, color: scheme.primary),
                        )
                      : Icon(Icons.subdirectory_arrow_right, size: 18, color: scheme.onSurfaceVariant),
                  title: Text(
                    n.displayTitle,
                    style: vaultText(
                      sheet,
                      size: 17,
                      color: n.id == widget.node.id ? scheme.primary : scheme.onSurface,
                    ),
                  ),
                  trailing: Text(
                    n.wordCount == 0 ? 'Not begun' : plural(n.wordCount, 'word'),
                    style: Theme.of(sheet).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  onTap: () => Navigator.of(sheet).pop(n.id),
                ),
            ],
          ),
        );
      },
    );
    if (chosen == null || chosen == widget.node.id || !mounted) return;
    _flush();
    ref.read(selectedNodeProvider.notifier).select(chosen);
  }

  /// THE DESK'S DRAWER: on a phone, the tools beside the page are not four bare icons but a drawer that names each and
  /// says what it does, opened from Desk over the page. Choosing one closes the drawer and opens it.
  Future<void> _openDesk(VoidCallback toggleFocus) async {
    final chosen = await showModalBottomSheet<VoidCallback>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) {
        final scheme = Theme.of(sheet).colorScheme;
        Widget tool(IconData icon, String name, String what, VoidCallback open) => ListTile(
          leading: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: scheme.primary),
            ),
            child: Icon(icon, color: scheme.primary, size: 20),
          ),
          title: Text(name, style: vaultHeading(sheet, size: 13.5, weight: 700, color: scheme.onSurface)),
          subtitle: Text(what, style: vaultText(sheet, size: 15.5, color: scheme.onSurfaceVariant)),
          onTap: () => Navigator.of(sheet).pop(open),
        );
        return SafeArea(
          // Every tool built at once (eight), so each can be found and read, at any text size.
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                  child: Text('The desk', style: vaultHeading(sheet, size: 18, weight: 700)),
                ),
                tool(
                  Icons.view_sidebar_outlined,
                  'Notes for this chapter',
                  'How the chapter before ends, this one’s plan and beats, who is on the page.',
                  _openMarginSheet,
                ),
                if (_editor != null)
                  tool(
                    Icons.edit_outlined,
                    ref.read(redPencilProvider) ? 'Put the red pencil away' : 'Red pencil',
                    'Echoes, long sentences and fillers marked under the words. Nothing is changed.',
                    () => ref.read(redPencilProvider.notifier).set(!ref.read(redPencilProvider)),
                  ),
                if (_editor != null)
                  tool(
                    Icons.record_voice_over_outlined,
                    ref.read(voicesProvider) ? 'Put the voices away' : 'Voices',
                    'Every line of dialogue in its speaker’s colour, and who has the floor. Nothing is changed.',
                    () {
                      final on = !ref.read(voicesProvider);
                      ref.read(voicesProvider.notifier).set(on);
                      // A way of reading the page: the keyboard stays down, so the whole page shows.
                      if (on) _focus.unfocus();
                    },
                  ),
                tool(
                  Icons.fullscreen,
                  'Focus mode',
                  'Only the page; the line you write can stay in the middle.',
                  toggleFocus,
                ),
                tool(
                  Icons.alt_route,
                  'Alternate drafts',
                  'Another version of this chapter beside this one.',
                  _openDrafts,
                ),
                tool(Icons.history, 'Version history', 'Earlier versions: compare, and bring one back.', _openHistory),
                if (_editor != null)
                  tool(
                    Icons.graphic_eq,
                    'Rhythm',
                    'Your sentences as a waveform: how long they run, and where a run keeps one beat.',
                    _openRhythm,
                  ),
                tool(
                  Icons.slow_motion_video,
                  'Time-lapse',
                  'Watch this chapter write itself, from its first saved copy to now.',
                  _openTimeLapse,
                ),
              ],
            ),
          ),
        );
      },
    );
    if (chosen != null && mounted) chosen();
  }

  Future<void> _goals() async {
    await showDialog<void>(
      context: context,
      builder: (_) => GoalPledge(
        service: _service,
        novelId: widget.novelId,
        words: [for (final n in ref.read(outlineProvider)) n.wordCount].fold(0, (a, b) => a + b),
        target: ref.read(novelStoreProvider).novel(widget.novelId)?.targetWordCount,
      ),
    );
    if (mounted) setState(() {});
  }

  /// "CHAPTER 3" over a chapter, "CHAPTER 3 · SCENE" over one of its scenes; nothing over a volume or an arc.
  String? _kicker() {
    final n = StoryOrder.of(ref.watch(outlineProvider)).chapterNumber[widget.node.id];
    if (n == null) return null;
    return switch (widget.node.kind) {
      NodeKind.chapter => 'CHAPTER $n',
      NodeKind.scene => 'CHAPTER $n · SCENE',
      _ => null,
    };
  }

  // ------------------------------------------------------------------------------------------------- view

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final written = _service.wordsWritten(widget.novelId);
    final goals = _service.wordGoals(widget.novelId);

    final prefs = ref.watch(writingPrefsProvider)[deviceFormOf(context)]!;
    final focus = ref.watch(focusModeProvider);
    final pencilOn = ref.watch(redPencilProvider);
    // The pencil reads the chapter when it is taken out, and its colours follow the theme; both outside the build.
    ref.listen(redPencilProvider, (_, on) => _pencil.on = on);
    final voicesOn = ref.watch(voicesProvider);
    final freshOn = ref.watch(freshInkProvider);
    // The cast is read again as the voices come out, so a character added since is heard.
    ref.listen(voicesProvider, (_, on) {
      if (on) _voices.cast = voiceCastOf(ref.read(novelStoreProvider), widget.novelId);
      _voices.on = on;
    });
    final pencilColors = pencilColorsOf(theme);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _pencil.colors = pencilColors;
    });
    final sprint = ref.watch(sprintProvider);
    final sprintResult = ref.watch(sprintResultProvider);
    final typewriter = focus && ref.watch(typewriterProvider) && _editor != null;
    // Typing on a phone: the keyboard is up.
    // (Read from the screen itself: the frame around the page takes the keyboard's room out of what the page sees.)
    final typing = compact && View.of(context).viewInsets.bottom > 0;
    Widget toolbar() => _Toolbar(
      editor: _editor!,
      composer: _composer!,
      document: _document!,
      onLink: _linkEntry,
      onUnlink: _unlink,
      onSplit: _splitHere,
    );
    // Into focus mode (or the typewriter turned on): bring the caret's line to the middle at once.
    ref.listen(focusModeProvider, (_, on) {
      if (on) _keepCentred();
    });
    ref.listen(typewriterProvider, (_, on) {
      if (on) _keepCentred();
    });
    // A sprint starting while this chapter is open counts from its words now.
    ref.listen(sprintProvider, (before, now) {
      if (before == null && now != null) ref.read(sprintProvider.notifier).report(widget.node.id, _counts.words);
    });
    final page = pageColors(prefs.page);
    void toggleFocus() => ref.read(focusModeProvider.notifier).toggle();
    void escape() {
      if (_findOpen) {
        setState(() => _findOpen = false);
      } else if (focus) {
        ref.read(focusModeProvider.notifier).set(false);
      }
    }

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyS, meta: true): _flush,
        const SingleActivator(LogicalKeyboardKey.keyS, control: true): _flush,
        const SingleActivator(LogicalKeyboardKey.keyF, meta: true): _openFind,
        const SingleActivator(LogicalKeyboardKey.keyF, control: true): _openFind,
        const SingleActivator(LogicalKeyboardKey.keyF, meta: true, shift: true): toggleFocus,
        const SingleActivator(LogicalKeyboardKey.keyF, control: true, shift: true): toggleFocus,
        const SingleActivator(LogicalKeyboardKey.escape): escape,
      },
      // The editor's own width says whether the margin fits beside the page (always in the tree: nothing under it is
      // rebuilt when it changes).
      child: LayoutBuilder(
        builder: (context, box) {
          final paperWidth = prefs.width.maxWidth.isFinite ? prefs.width.maxWidth + 112 : 900.0;
          final room = !compact && box.maxWidth >= paperWidth * 0.85 + marginWidth + 68;
          final showMargin = room && !focus && ref.watch(marginProvider);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (focus)
                Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                    child: Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (_editor != null)
                          FilterChip(
                            avatar: const Icon(Icons.vertical_align_center, size: 18),
                            label: const Text('Typewriter'),
                            tooltip: 'Keep the line you are writing in the middle',
                            selected: ref.watch(typewriterProvider),
                            showCheckmark: false,
                            onSelected: (on) => ref.read(typewriterProvider.notifier).set(on),
                          ),
                        TextButton.icon(
                          onPressed: () => ref.read(focusModeProvider.notifier).set(false),
                          icon: const Icon(Icons.fullscreen_exit),
                          label: const Text('Exit focus'),
                        ),
                      ],
                    ),
                  ),
                )
              else
                Padding(
                  padding: EdgeInsets.fromLTRB(compact ? 4 : 16, 8, 8, 0),
                  child: Row(
                    children: [
                      if (widget.onBack != null)
                        IconButton(
                          tooltip: 'Back to the outline',
                          onPressed: _back,
                          icon: const Icon(Icons.arrow_back),
                        ),
                      // On a phone, which chapter this is, and every other one press away (`_openChapters`).
                      if (compact)
                        Expanded(
                          child: Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: TextButton(
                              onPressed: _openChapters,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Text(
                                      _shortPlace(),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      semanticsLabel: '${_shortPlace()}. All chapters',
                                    ),
                                  ),
                                  const Icon(Icons.arrow_drop_down),
                                ],
                              ),
                            ),
                          ),
                        ),
                      if (!compact) const Spacer(),
                      if (_editor != null)
                        IconButton(
                          tooltip: 'Find and replace (⌘F)',
                          onPressed: _openFind,
                          icon: const Icon(Icons.search),
                        ),
                      // On a phone the pencil is in the desk's drawer, so the chapter's name keeps its room.
                      if (_editor != null && !compact)
                        IconButton(
                          tooltip: 'Red pencil: echoes, long sentences, fillers',
                          isSelected: pencilOn,
                          onPressed: () => ref.read(redPencilProvider.notifier).set(!pencilOn),
                          icon: const Icon(Icons.edit_outlined),
                          selectedIcon: Icon(Icons.edit, color: pencilColorsOf(theme).echo),
                        ),
                      if (_editor != null && !compact)
                        IconButton(
                          tooltip: 'Voices: each line of dialogue in its speaker\'s colour',
                          isSelected: voicesOn,
                          onPressed: () => ref.read(voicesProvider.notifier).set(!voicesOn),
                          icon: const Icon(Icons.record_voice_over_outlined),
                          selectedIcon: Icon(Icons.record_voice_over, color: theme.colorScheme.primary),
                        ),
                      IconButton(
                        tooltip: 'Writing settings',
                        onPressed: _openPrefs,
                        icon: const Icon(Icons.text_fields),
                      ),
                      // On a phone the rest are the desk's drawer: named, with what each does (`_openDesk`).
                      if (compact)
                        TextButton.icon(
                          onPressed: () => _openDesk(toggleFocus),
                          icon: const Icon(Icons.inventory_2_outlined),
                          label: const Text('Desk'),
                        ),
                      // Beside the page where there is room (on and off), otherwise as a sheet over it.
                      if (!compact)
                        IconButton(
                          tooltip: room
                              ? (showMargin ? 'Hide the notes beside the page' : 'Show the notes beside the page')
                              : 'Notes for this chapter',
                          isSelected: room && showMargin,
                          onPressed: room
                              ? () => ref.read(marginProvider.notifier).set(!showMargin)
                              : () => _openMarginSheet(),
                          icon: const Icon(Icons.view_sidebar_outlined),
                          selectedIcon: const Icon(Icons.view_sidebar),
                        ),
                      if (!compact) ...[
                        IconButton(
                          tooltip: 'Focus mode (⇧⌘F)',
                          onPressed: toggleFocus,
                          icon: const Icon(Icons.fullscreen),
                        ),
                        IconButton(
                          tooltip: 'Alternate drafts',
                          onPressed: _openDrafts,
                          icon: const Icon(Icons.alt_route),
                        ),
                        IconButton(
                          tooltip: 'Version history',
                          onPressed: _openHistory,
                          icon: const Icon(Icons.history),
                        ),
                        if (_editor != null)
                          IconButton(
                            tooltip: 'Rhythm: your sentences as a waveform',
                            onPressed: _openRhythm,
                            icon: const Icon(Icons.graphic_eq),
                          ),
                        IconButton(
                          tooltip: 'Time-lapse: watch this chapter write itself',
                          onPressed: _openTimeLapse,
                          icon: const Icon(Icons.slow_motion_video),
                        ),
                      ],
                    ],
                  ),
                ),
              if (!focus)
                _DraftLine(service: _service, novelId: widget.novelId, nodeId: widget.node.id, onOpen: _openDrafts),
              if (_recovered != null)
                MaterialBanner(
                  content: Text(
                    'Unsaved writing from ${formatRelative(context, _recovered!.at.millisecondsSinceEpoch)} was recovered. '
                    'Keep it, or keep the saved text?',
                  ),
                  actions: [
                    TextButton(onPressed: _discardRecovered, child: const Text('Keep the saved text')),
                    FilledButton(onPressed: _keepRecovered, child: const Text('Keep the recovered writing')),
                  ],
                ),
              // On a computer or a tablet the formatting stands over the page; on a phone it rides on the keyboard (below).
              if (_editor != null && !focus && !compact) toolbar(),
              if (_findOpen && _editor != null)
                FindBar(
                  editor: _editor!,
                  document: _document!,
                  initialTerm: _findStart?.term,
                  initialBlock: _findStart?.block,
                  onClose: () => setState(() {
                    _findOpen = false;
                    _findStart = null;
                  }),
                ),
              if (pencilOn && _editor != null && !focus)
                RedPencilBar(
                  pencil: _pencil,
                  editor: _editor!,
                  onClose: () => ref.read(redPencilProvider.notifier).set(false),
                ),
              if (voicesOn && _editor != null && !focus)
                VoicesBar(lens: _voices, editor: _editor!, onClose: () => ref.read(voicesProvider.notifier).set(false)),
              if (_editor != null && !focus)
                LinkBar(
                  composer: _composer!,
                  document: _document!,
                  entryOf: (id) {
                    final row = ref.read(novelStoreProvider).row(widget.novelId, 'loreEntries', id);
                    return row == null ? null : Entry(row);
                  },
                  kindOf: (e) {
                    final rows = ref.read(novelStoreProvider).rowsIn(widget.novelId, 'loreSchemas');
                    final kinds = resolveCategories([for (final r in rows) Category(r)]);
                    return kinds.where((c) => c.key == e.category).firstOrNull?.singular ?? 'Entry';
                  },
                  onOpen: (entry) {
                    _flush();
                    context.go(entryPath(entry.id, character: entry.category == 'character'));
                  },
                ),
              // Keyed, so the page (and the editor on it) stays the same when bars above it come and go (focus mode, a
              // sprint): rebuilt from nothing, the editor would lose the caret and, on a phone, fail while it mounts.
              Expanded(
                key: const ValueKey('page'),
                child: _Desk(
                  compact: compact,
                  paper: page?.background,
                  width: prefs.width.maxWidth,
                  margin: showMargin
                      ? ChapterMargin(novelId: widget.novelId, nodeId: widget.node.id, onLeave: _flush)
                      : null,
                  // The typewriter's light: the text away from the line being written fades back. Always in the tree (clear
                  // when off), so turning it on or off never rebuilds the editor under it.
                  child: Stack(
                    children: [
                      LayoutBuilder(
                        builder: (context, box) => ShaderMask(
                          blendMode: BlendMode.dstIn,
                          shaderCallback: (rect) => LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: typewriter
                                ? const [Color(0x40000000), Color(0xFF000000), Color(0xFF000000), Color(0x40000000)]
                                : const [Color(0xFF000000), Color(0xFF000000)],
                            stops: typewriter ? const [0.05, typewriterLine - 0.12, typewriterLine + 0.1, 0.95] : null,
                          ).createShader(rect),
                          child: CustomScrollView(
                            controller: _scroll,
                            slivers: [
                              SliverToBoxAdapter(
                                child: _ChapterHeading(
                                  title: _title,
                                  kicker: _kicker(),
                                  hint: 'Untitled ${widget.node.kindKey}',
                                  compact: compact,
                                  ink: page?.text,
                                  muted: page?.muted,
                                  onRename: _rename,
                                ),
                              ),
                              // Who and what the chapter names, under its heading (`in_chapter.dart`). Always in the list (empty
                              // in focus mode), so the editor after it is never rebuilt.
                              SliverToBoxAdapter(
                                child: focus
                                    ? const SizedBox.shrink()
                                    : InChapterStrip(
                                        watch: _company,
                                        onLeave: _flush,
                                        ink: page?.text,
                                        muted: page?.muted,
                                      ),
                              ),
                              if (_editor == null)
                                _ReadOnly(doc: _opened.doc, reason: _prose?.reason)
                              else
                                SuperEditor(
                                  // A new editor (after a split or a restore) gets a fresh widget, not the old one's state.
                                  key: ObjectKey(_editor),
                                  editor: _editor!,
                                  documentLayoutKey: _layout,
                                  focusNode: _focus,
                                  autofocus: !compact,
                                  stylesheet: writingStylesheet(theme, prefs),
                                  customStylePhases: _pencilPhases,
                                  contentTapDelegateFactories: const [],
                                ),
                              // The note left for this sitting, pinned under the last line (`next_note.dart`).
                              if (_editor != null)
                                SliverToBoxAdapter(
                                  child: NextNoteSlip(
                                    nodeId: widget.node.id,
                                    title: widget.node.displayTitle,
                                    offer: !focus,
                                  ),
                                ),
                              // A page with no words yet: what is already known of it, and ways in (`first_page.dart`).
                              if (_editor != null && _document != null)
                                SliverToBoxAdapter(
                                  child: FirstPage(
                                    novelId: widget.novelId,
                                    nodeId: widget.node.id,
                                    document: _document!,
                                    onWrite: _caretAtEnd,
                                    onLeave: _flush,
                                    notesBeside: showMargin,
                                    ink: page?.text,
                                    muted: page?.muted,
                                  ),
                                ),
                              // The chapter's end: what follows, one press away (`chapter_end.dart`).
                              SliverToBoxAdapter(
                                child: ChapterEnd(
                                  novelId: widget.novelId,
                                  node: widget.node,
                                  ink: page?.text,
                                  muted: page?.muted,
                                ),
                              ),
                              // Room under the last line, so it too can come up to the middle.
                              if (typewriter)
                                SliverToBoxAdapter(child: SizedBox(height: box.maxHeight * (1 - typewriterLine))),
                            ],
                          ),
                        ),
                      ),
                      // Today's ink down the left margin, beside what was written today (`fresh_ink.dart`).
                      if (_editor != null && _document != null && freshOn)
                        Positioned(
                          top: 0,
                          bottom: 0,
                          left: compact ? 4 : 6,
                          width: 12,
                          child: FreshInkMargin(ink: _ink, document: _document!, layout: _layout, scroll: _scroll),
                        ),
                      // The chapter's spine down the page's edge (`chapter_spine.dart`).
                      Positioned(
                        top: 0,
                        bottom: 0,
                        right: 0,
                        width: 22,
                        child: ListenableBuilder(
                          listenable: _ink,
                          builder: (_, _) => ChapterSpine(
                            document: _document,
                            scroll: _scroll,
                            fresh: freshOn ? _ink.fresh : const {},
                          ),
                        ),
                      ),
                      // Stuck? A nudge at the page's corner once the writing has stopped a while (`nudge.dart`).
                      if (_editor != null)
                        Positioned(
                          left: 12,
                          right: 28,
                          top: _nudgeHigh ? 12 : null,
                          bottom: _nudgeHigh ? null : 12,
                          child: Align(
                            alignment: _nudgeHigh ? Alignment.topRight : Alignment.bottomRight,
                            heightFactor: 1,
                            child: StuckNudge(watch: _stuck, nudges: _nudges, onBack: _focus.requestFocus),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              // THE INK TRAY: on a phone, while the keyboard is up, the formatting sits on it, under the thumbs; put the
              // keyboard away to read and the tray goes with it, leaving the page the whole screen.
              if (_editor != null && !focus && typing) _InkTray(child: toolbar()),
              if (sprint != null)
                SprintBar(sprint: sprint)
              else if (sprintResult != null)
                SprintCard(result: sprintResult)
              else if (!focus && !typing)
                _Meter(
                  words: _counts.words,
                  minutes: _counts.readingMinutes,
                  session: _counts.words - _sessionStart,
                  today: written.today,
                  week: written.week,
                  daily: goals.daily,
                  weekly: goals.weekly,
                  onGoals: _goals,
                ),
            ],
          );
        },
      ),
    );
  }
}

/// THE WRITING DESK: on a tablet or a computer the chapter is a sheet of paper on a desk, as wide as the author's
/// line length plus its margins. On a phone the paper is the whole screen.
class _Desk extends StatelessWidget {
  const _Desk({required this.compact, required this.paper, required this.width, required this.child, this.margin});

  final bool compact;

  /// The page colour the author chose, or null for the app's own.
  final Color? paper;
  final double width;
  final Widget child;

  /// The margin's cards beside the page (`margin.dart`), when shown. The page is always the row's first child, so
  /// showing or hiding them never rebuilds the editor.
  final Widget? margin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = scheme.brightness == Brightness.dark;
    final sheet = paper ?? (dark ? scheme.surfaceContainerHigh : scheme.surfaceContainerLowest);
    if (compact) return ColoredBox(color: sheet, child: child);
    return ColoredBox(
      color: dark ? scheme.surfaceContainerLowest : scheme.surfaceContainer,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          // The text's own width, its 24-point margins, and the paper's edge; then the margin beside it.
          constraints: BoxConstraints(
            maxWidth: width.isFinite ? width + 112 + (margin == null ? 0 : marginWidth + _marginGap) : double.infinity,
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _paper(scheme, dark, sheet)),
                if (margin != null) ...[
                  const SizedBox(width: _marginGap),
                  SizedBox(
                    width: marginWidth,
                    child: SingleChildScrollView(padding: const EdgeInsets.only(bottom: 24), child: margin),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static const _marginGap = 20.0;

  Widget _paper(ColorScheme scheme, bool dark, Color sheet) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
      border: Border.all(color: scheme.outlineVariant.withValues(alpha: dark ? 0.6 : 0.45)),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: dark ? 0.45 : 0.10),
          blurRadius: 24,
          offset: const Offset(0, 8),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: dark ? 0.3 : 0.06),
          blurRadius: 3,
          offset: const Offset(0, 1),
        ),
      ],
    ),
    child: ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
      child: ColoredBox(
        color: sheet,
        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: child),
      ),
    ),
  );
}

/// The top of the page, set like a printed book's: where it sits, the title (typed here), and an ornament.
class _ChapterHeading extends StatelessWidget {
  const _ChapterHeading({
    required this.title,
    required this.kicker,
    required this.hint,
    required this.compact,
    required this.ink,
    required this.muted,
    required this.onRename,
  });

  final TextEditingController title;
  final String? kicker;
  final String hint;
  final bool compact;
  final Color? ink;
  final Color? muted;
  final VoidCallback onRename;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final faint = muted ?? scheme.onSurfaceVariant;
    final style = vaultHeading(context, size: compact ? 22 : 30, weight: 600, color: ink ?? scheme.onSurface);
    return Padding(
      padding: EdgeInsets.fromLTRB(24, compact ? 20 : 44, 24, 4),
      child: Column(
        children: [
          if (kicker != null)
            Text(
              kicker!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, letterSpacing: 3, fontWeight: FontWeight.w600, color: faint),
            ),
          TextField(
            controller: title,
            textAlign: TextAlign.center,
            style: style,
            maxLines: null,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              filled: false,
              border: InputBorder.none,
              hintText: hint,
              hintStyle: style.copyWith(color: faint.withValues(alpha: 0.6)),
              semanticCounterText: '',
            ),
            onSubmitted: (_) => onRename(),
            onTapOutside: (_) => onRename(),
          ),
          ExcludeSemantics(child: _Ornament(color: ink == null ? scheme.primary : faint)),
        ],
      ),
    );
  }
}

/// A rule, a diamond, a rule: the mark under a printed chapter heading.
class _Ornament extends StatelessWidget {
  const _Ornament({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) =>
      SizedBox(width: 148, height: 18, child: CustomPaint(painter: _OrnamentPainter(color)));
}

class _OrnamentPainter extends CustomPainter {
  _OrnamentPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final mid = size.center(Offset.zero);
    final line = Paint()
      ..color = color.withValues(alpha: 0.7)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, mid.dy), Offset(mid.dx - 12, mid.dy), line);
    canvas.drawLine(Offset(mid.dx + 12, mid.dy), Offset(size.width, mid.dy), line);
    final diamond = Path()
      ..moveTo(mid.dx, mid.dy - 5)
      ..lineTo(mid.dx + 5, mid.dy)
      ..lineTo(mid.dx, mid.dy + 5)
      ..lineTo(mid.dx - 5, mid.dy)
      ..close();
    canvas.drawPath(diamond, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_OrnamentPainter old) => old.color != color;
}

/// Under the page: the chapter's length, this sitting's words, and today's against the author's goal, as a ring
/// that closes when the goal is met.
class _Meter extends StatelessWidget {
  const _Meter({
    required this.words,
    required this.minutes,
    required this.session,
    required this.today,
    required this.week,
    required this.daily,
    required this.weekly,
    required this.onGoals,
  });

  final int words;
  final int minutes;
  final int session;
  final int today;
  final int week;
  final int? daily;
  final int? weekly;
  final VoidCallback onGoals;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant);
    final strong = theme.textTheme.bodySmall?.copyWith(color: scheme.onSurface, fontWeight: FontWeight.w600);
    final reached = daily != null && today >= daily!;
    return Material(
      color: scheme.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          child: Wrap(
            spacing: 12,
            runSpacing: 0,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Semantics(
                button: true,
                child: InkWell(
                  onTap: onGoals,
                  borderRadius: BorderRadius.circular(8),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox.square(
                            dimension: 22,
                            child: reached
                                ? Icon(Icons.check_circle, size: 22, color: scheme.primary)
                                : CircularProgressIndicator(
                                    value: daily == null || daily == 0 ? 0 : (today / daily!).clamp(0.0, 1.0),
                                    strokeWidth: 3,
                                    backgroundColor: scheme.outlineVariant,
                                    semanticsLabel: 'Today\'s goal',
                                  ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              daily == null
                                  ? 'Today: ${formatNumber(today)} words · Set a goal'
                                  : 'Today: ${formatNumber(today)} of ${formatNumber(daily!)} words'
                                        '${reached ? ' · goal reached' : ''}',
                              style: (reached ? strong : muted)?.copyWith(
                                decoration: daily == null ? TextDecoration.underline : null,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SprintButton(),
              if (session != 0)
                Text('${session > 0 ? '+' : '−'}${formatNumber(session.abs())} this session', style: strong),
              Text('${plural(words, 'word')} · $minutes min read', style: muted),
              if (weekly != null) Text('This week: ${formatNumber(week)} of ${formatNumber(weekly!)}', style: muted),
              const SaveStatusIndicator(compact: true),
            ],
          ),
        ),
      ),
    );
  }
}

/// The chapter's text as the author set it up (font, size, spacing, width, page colour), or in the app's colours.
/// Links to codex entries are underlined, in the accent colour.
Stylesheet writingStylesheet(ThemeData theme, WritingPrefs prefs) {
  final page = pageColors(prefs.page);
  final text = page?.text ?? theme.colorScheme.onSurface;
  final muted = page?.muted ?? theme.colorScheme.onSurfaceVariant;
  final font = fontFor(prefs.font, theme.platform);
  final size = prefs.fontSize;
  final gap = prefs.paragraphSpacing * size * prefs.lineHeight;
  TextStyle heading(double scale) =>
      TextStyle(color: text, fontSize: size * scale, fontWeight: FontWeight.w700, height: 1.3);
  return Stylesheet(
    rules: [
      StyleRule(
        BlockSelector.all,
        (doc, node) => {
          Styles.maxWidth: prefs.width.maxWidth,
          Styles.padding: const CascadingPadding.symmetric(horizontal: 24),
          Styles.textStyle: TextStyle(
            color: text,
            fontSize: size,
            height: prefs.lineHeight,
            fontFamily: font.family,
            fontFamilyFallback: font.fallback,
          ),
        },
      ),
      StyleRule(
        const BlockSelector('header1'),
        (doc, node) => {Styles.padding: CascadingPadding.only(top: size * 1.6), Styles.textStyle: heading(1.67)},
      ),
      StyleRule(
        const BlockSelector('header2'),
        (doc, node) => {Styles.padding: CascadingPadding.only(top: size * 1.3), Styles.textStyle: heading(1.33)},
      ),
      StyleRule(
        const BlockSelector('header3'),
        (doc, node) => {Styles.padding: CascadingPadding.only(top: size * 1.1), Styles.textStyle: heading(1.11)},
      ),
      StyleRule(const BlockSelector('paragraph'), (doc, node) => {Styles.padding: CascadingPadding.only(top: gap)}),
      StyleRule(
        const BlockSelector('blockquote'),
        (doc, node) => {
          Styles.padding: CascadingPadding.only(top: gap + 6),
          Styles.textStyle: TextStyle(color: muted),
          Styles.backgroundColor: (page?.muted ?? theme.colorScheme.onSurface).withValues(alpha: 0.08),
          Styles.borderRadius: BorderRadius.circular(6),
        },
      ),
      StyleRule(
        const BlockSelector('listItem'),
        (doc, node) => {Styles.padding: CascadingPadding.only(top: gap / 2 + 2)},
      ),
      StyleRule(BlockSelector.all.first(), (doc, node) => {Styles.padding: const CascadingPadding.only(top: 16)}),
      StyleRule(BlockSelector.all.last(), (doc, node) => {Styles.padding: const CascadingPadding.only(bottom: 96)}),
    ],
    inlineTextStyler: (attributions, style) {
      var s = defaultInlineTextStyler(attributions, style);
      if (attributions.any((a) => a is EntityLinkAttribution)) {
        s = s.copyWith(
          decoration: TextDecoration.combine([if (s.decoration != null) s.decoration!, TextDecoration.underline]),
          decorationStyle: TextDecorationStyle.dotted,
          decorationColor: theme.colorScheme.primary,
        );
      }
      return s;
    },
  );
}

/// Shown (as a sliver, under the heading) when a chapter holds something the editor cannot reproduce exactly: the text, readable, with the reason.
class _ReadOnly extends StatelessWidget {
  const _ReadOnly({required this.doc, required this.reason});

  final JsonMap? doc;
  final String? reason;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SliverPadding(
      padding: const EdgeInsets.all(24),
      sliver: SliverList.list(
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                'Shown read-only so nothing is lost: ${reason ?? 'this text cannot be edited here yet'}. Your text is '
                'stored exactly as it was.',
              ),
            ),
          ),
          const SizedBox(height: 16),
          for (final b in docBlocks(doc))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SelectableText(b.text, style: b.heading ? theme.textTheme.titleLarge : theme.textTheme.bodyLarge),
            ),
        ],
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.editor,
    required this.composer,
    required this.document,
    required this.onLink,
    required this.onUnlink,
    required this.onSplit,
  });

  final Editor editor;
  final MutableDocumentComposer composer;
  final MutableDocument document;
  final VoidCallback onLink;
  final VoidCallback onUnlink;
  final VoidCallback onSplit;

  void _style(Attribution a) {
    final selection = composer.selection;
    if (selection == null) return;
    if (selection.isCollapsed) {
      composer.preferences.toggleStyle(a); // Applies to what is typed next.
    } else {
      editor.execute([
        ToggleTextAttributionsRequest(documentRange: selection, attributions: {a}),
      ]);
    }
  }

  void _block(Attribution? blockType) {
    final id = composer.selection?.extent.nodeId;
    if (id == null) return;
    final node = document.getNodeById(id);
    if (node is ListItemNode) {
      editor.execute([
        ConvertListItemToParagraphRequest(
          nodeId: id,
          paragraphMetadata: {'blockType': blockType ?? paragraphAttribution},
        ),
      ]);
    } else if (node is ParagraphNode) {
      editor.execute([ChangeParagraphBlockTypeRequest(nodeId: id, blockType: blockType ?? paragraphAttribution)]);
    }
  }

  void _list(ListItemType type) {
    final id = composer.selection?.extent.nodeId;
    if (id == null) return;
    final node = document.getNodeById(id);
    if (node is ListItemNode && node.type == type) {
      editor.execute([ConvertListItemToParagraphRequest(nodeId: id)]);
    } else if (node is ListItemNode) {
      editor.execute([
        ConvertListItemToParagraphRequest(nodeId: id),
        ConvertParagraphToListItemRequest(nodeId: id, type: type),
      ]);
    } else if (node is ParagraphNode) {
      editor.execute([ConvertParagraphToListItemRequest(nodeId: id, type: type)]);
    }
  }

  void _align(TextAlign a) {
    final id = composer.selection?.extent.nodeId;
    if (id != null && document.getNodeById(id) is ParagraphNode) {
      editor.execute([ChangeParagraphAlignmentRequest(nodeId: id, alignment: a)]);
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget button(IconData icon, String label, VoidCallback onPressed) =>
        IconButton(tooltip: label, onPressed: onPressed, icon: Icon(icon));
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          button(Icons.undo, 'Undo', editor.undo),
          button(Icons.redo, 'Redo', editor.redo),
          const SizedBox(width: 8),
          button(Icons.format_bold, 'Bold (⌘B)', () => _style(boldAttribution)),
          button(Icons.format_italic, 'Italic (⌘I)', () => _style(italicsAttribution)),
          button(Icons.format_underline, 'Underline (⌘U)', () => _style(underlineAttribution)),
          button(Icons.strikethrough_s, 'Strikethrough', () => _style(strikethroughAttribution)),
          PopupMenuButton<Attribution?>(
            tooltip: 'Paragraph style',
            useRootNavigator: true,
            icon: const Icon(Icons.title),
            onSelected: _block,
            itemBuilder: (_) => const [
              PopupMenuItem(value: paragraphAttribution, child: Text('Paragraph')),
              PopupMenuItem(value: header1Attribution, child: Text('Heading 1')),
              PopupMenuItem(value: header2Attribution, child: Text('Heading 2')),
              PopupMenuItem(value: header3Attribution, child: Text('Heading 3')),
              PopupMenuItem(value: blockquoteAttribution, child: Text('Quotation')),
            ],
          ),
          button(Icons.format_list_bulleted, 'Bulleted list', () => _list(ListItemType.unordered)),
          button(Icons.format_list_numbered, 'Numbered list', () => _list(ListItemType.ordered)),
          PopupMenuButton<TextAlign>(
            tooltip: 'Alignment',
            useRootNavigator: true,
            icon: const Icon(Icons.format_align_left),
            onSelected: _align,
            itemBuilder: (_) => const [
              PopupMenuItem(value: TextAlign.left, child: Text('Align left')),
              PopupMenuItem(value: TextAlign.center, child: Text('Center')),
              PopupMenuItem(value: TextAlign.right, child: Text('Align right')),
              PopupMenuItem(value: TextAlign.justify, child: Text('Justify')),
            ],
          ),
          const SizedBox(width: 8),
          button(Icons.link, 'Link the selected words to a codex entry', onLink),
          button(Icons.link_off, 'Remove the link from the selected words', onUnlink),
          button(Icons.call_split, 'Split here: the paragraph with the cursor starts a new part', onSplit),
        ],
      ),
    );
  }
}

class _EntryPicker extends StatefulWidget {
  const _EntryPicker({required this.entries});
  final List<JsonMap> entries;

  @override
  State<_EntryPicker> createState() => _EntryPickerState();
}

class _EntryPickerState extends State<_EntryPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final shown = [
      for (final e in widget.entries)
        if (q.isEmpty || str(e['name']).toLowerCase().contains(q)) e,
    ];
    return AlertDialog(
      title: const Text('Link to a codex entry'),
      content: SizedBox(
        width: 420,
        height: 420,
        child: Column(
          children: [
            TextField(
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Search entries', prefixIcon: Icon(Icons.search)),
              onChanged: (v) => setState(() => _query = v),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: shown.isEmpty
                  ? const Center(child: Text('No entry matches.'))
                  : ListView(
                      children: [
                        for (final e in shown)
                          ListTile(
                            title: Text(str(e['name'], 'Unnamed')),
                            subtitle: Text(str(e['category'])),
                            onTap: () => Navigator.of(context).pop(str(e['id'])),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel'))],
    );
  }
}

/// Which draft is in the manuscript, shown once a chapter or scene has more than one.
class _DraftLine extends StatelessWidget {
  const _DraftLine({required this.service, required this.novelId, required this.nodeId, required this.onOpen});
  final ManuscriptService service;
  final String novelId;
  final String nodeId;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final String active;
    final int others;
    try {
      active = service.activeDraft(novelId, nodeId);
      others = service.alternateDrafts(novelId, nodeId).length;
    } on StateError {
      return const SizedBox.shrink();
    }
    if (others == 0 && active == mainDraft) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: ActionChip(
          avatar: const Icon(Icons.alt_route, size: 18),
          label: Text('Draft: $active · ${others == 1 ? '1 other' : '$others others'}'),
          onPressed: onOpen,
        ),
      ),
    );
  }
}

/// The ink tray on the keyboard: the formatting in a strip of the paper's colour with a rule along its head, so it
/// reads as part of the page, not of the keyboard.
class _InkTray extends StatelessWidget {
  const _InkTray({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.primary.withValues(alpha: 0.55))),
        ),
        child: child,
      ),
    );
  }
}
