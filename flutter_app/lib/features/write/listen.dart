import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/data/speech.dart';
import '../../shared/domain/text/rhythm.dart';

/// Whether the Listen bar is out over the page. Kept while the app is open, from chapter to chapter.
class ListenOn extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool on) => state = on;
}

final listenProvider = NotifierProvider<ListenOn, bool>(ListenOn.new);

/// The paces offered, each the voice's own times this.
const listenPaces = [1.0, 1.25, 0.8];

/// The sentence being read, on the layout's own copy of the text (never the stored one).
@immutable
class ReadingAttribution implements Attribution {
  const ReadingAttribution();

  @override
  String get id => 'reading';

  @override
  bool canMergeWith(Attribution other) => other is ReadingAttribution;
}

/// LISTEN: the chapter read aloud by the device's own voice, a sentence at a time, from the one the caret is in; the
/// sentence being read lit on the page and kept in view. Writers hear what the eye passes over: the sentence that
/// trips, the word said twice. Pressing a key stops it (the text is moving under it). It reads only: the voice is
/// given the text and nothing else, and the light on the line is drawn by the editor's layout ([styler]), never
/// stored.
class ListenReader extends ChangeNotifier {
  ListenReader(this.speaker);

  final Speaker speaker;
  late final styler = _ReadingStyler(this);

  MutableDocument? _document;
  List<String> _ids = const [];
  RhythmReport _report = RhythmReport.empty;
  int _at = 0;
  bool _playing = false;
  bool? _available;
  int _run = 0;
  double _pace = listenPaces.first;
  bool _on = false;

  /// Moves the page so a line is in view: given by the editor.
  void Function(String nodeId, int start, int end)? show;

  int get at => _at;
  int get count => _report.sentences.length;
  bool get playing => _playing;
  bool? get available => _available;
  double get pace => _pace;

  RhythmSentence? get current => _at < count ? _report.sentences[_at] : null;
  String? get currentNode => current == null || current!.block >= _ids.length ? null : _ids[current!.block];

  void attach(MutableDocument document) {
    detach();
    _document = document..addListener(_typed);
  }

  void detach() {
    _halt();
    _document?.removeListener(_typed);
    _document = null;
  }

  /// Out over the page from [startNode] at [startOffset] (the caret), or put away.
  Future<void> setOn(bool on, {String? startNode, int startOffset = 0}) async {
    if (on == _on) return;
    _on = on;
    if (!on) {
      _halt();
      styler.redraw();
      notifyListeners();
      return;
    }
    _read();
    _at = _sentenceAt(startNode, startOffset);
    _available ??= await speaker.available();
    notifyListeners();
    if (_available == true && _on) unawaited(play());
  }

  void _read() {
    final document = _document;
    final ids = <String>[];
    final texts = <String>[];
    if (document != null) {
      for (final node in document) {
        if (node is TextNode) {
          ids.add(node.id);
          texts.add(node.text.toPlainText());
        }
      }
    }
    _ids = ids;
    _report = rhythmOf(texts);
  }

  int _sentenceAt(String? nodeId, int offset) {
    if (nodeId == null) return 0;
    final block = _ids.indexOf(nodeId);
    if (block < 0) return 0;
    final s = _report.sentences;
    for (var i = 0; i < s.length; i++) {
      if (s[i].block == block && offset < s[i].end) return i;
      if (s[i].block > block) return i;
    }
    return 0;
  }

  /// Reads from the sentence it is at to the end, unless stopped.
  Future<void> play() async {
    if (_playing || count == 0) return;
    if (_at >= count) _at = 0;
    _playing = true;
    final run = ++_run;
    notifyListeners();
    while (_playing && run == _run && _at < count) {
      final s = _report.sentences[_at];
      final text = _textOf(s);
      styler.redraw();
      final node = currentNode;
      if (node != null) show?.call(node, s.start, s.end);
      notifyListeners();
      final said = await speaker.say(text, rate: _pace);
      if (!said || run != _run || !_playing) break;
      _at++;
    }
    if (run == _run) {
      _playing = false;
      styler.redraw();
      notifyListeners();
    }
  }

  String _textOf(RhythmSentence s) {
    final node = s.block < _ids.length ? _document?.getNodeById(_ids[s.block]) : null;
    if (node is! TextNode) return '';
    final text = node.text.toPlainText();
    return s.end <= text.length ? text.substring(s.start, s.end) : '';
  }

  void pause() {
    _halt();
    styler.redraw();
    notifyListeners();
  }

  void _halt() {
    _run++;
    if (_playing) unawaited(speaker.stop());
    _playing = false;
  }

  /// A sentence on, or back; reading carries on from there if it was.
  void step(int by) {
    if (count == 0) return;
    final was = _playing;
    _halt();
    _at = (_at + by).clamp(0, count - 1);
    styler.redraw();
    final node = currentNode;
    if (node != null) show?.call(node, current!.start, current!.end);
    notifyListeners();
    if (was) unawaited(play());
  }

  /// The next pace; the sentence being read starts again at it.
  void nextPace() {
    _pace = listenPaces[(listenPaces.indexOf(_pace) + 1) % listenPaces.length];
    if (_playing) {
      _halt();
      unawaited(play());
    }
    notifyListeners();
  }

  // A key pressed: the text is moving, so reading stops, and the sentences are read again for the next time.
  void _typed(DocumentChangeLog _) {
    if (!_on) return;
    final was = _playing;
    _halt();
    _read();
    if (_at >= count) _at = count == 0 ? 0 : count - 1;
    styler.redraw();
    if (was) notifyListeners();
  }

  @override
  void dispose() {
    detach();
    super.dispose();
  }
}

class _ReadingStyler extends SingleColumnLayoutStylePhase {
  _ReadingStyler(this.reader);
  final ListenReader reader;

  void redraw() => markDirty();

  @override
  SingleColumnLayoutViewModel style(Document document, SingleColumnLayoutViewModel viewModel) {
    final node = reader._on ? reader.currentNode : null;
    final s = reader.current;
    if (node == null || s == null) return viewModel;
    return SingleColumnLayoutViewModel(
      padding: viewModel.padding,
      componentViewModels: [
        for (final vm in viewModel.componentViewModels)
          if (vm is TextComponentViewModel && vm.nodeId == node) _lit(vm.copy() as TextComponentViewModel, s) else vm,
      ],
    );
  }

  SingleColumnLayoutComponentViewModel _lit(TextComponentViewModel vm, RhythmSentence s) {
    final length = vm.text.length;
    if (s.start >= length) return vm as SingleColumnLayoutComponentViewModel;
    final text = vm.text.copy()
      ..addAttribution(const ReadingAttribution(), SpanRange(s.start, (s.end < length ? s.end : length) - 1));
    vm.text = text;
    final base = vm.textStyleBuilder;
    vm.textStyleBuilder = (attributions) {
      final style = base(attributions);
      if (!attributions.any((a) => a is ReadingAttribution)) return style;
      final ink = style.color ?? const Color(0xFF000000);
      final light = ink.computeLuminance() > 0.5;
      return style.copyWith(
        backgroundColor: (light ? const Color(0xFFF2B33D) : const Color(0xFFE8A317)).withValues(
          alpha: light ? 0.28 : 0.3,
        ),
      );
    };
    return vm as SingleColumnLayoutComponentViewModel;
  }
}

/// The Listen bar over the page: where it is (sentence 12 of 58), back a sentence, play or pause, on a sentence, the
/// pace, and a way to put it away. Says so plainly when the device has no voice to read with.
class ListenBar extends StatelessWidget {
  const ListenBar({super.key, required this.reader, required this.onClose});

  final ListenReader reader;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: reader,
    builder: (context, _) {
      final scheme = Theme.of(context).colorScheme;
      final muted = Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant);
      final none = reader.available == false;
      final where = reader.count == 0
          ? 'Nothing to read on this page yet'
          : none
          ? 'This device has no voice to read with'
          // Two short lines, so a phone's bar shows them whole beside its buttons.
          : '${reader.playing ? 'Reading' : 'Paused'}\n${reader.at + 1} of ${reader.count}';
      final said = where.replaceFirst('\n', ' · sentence ');
      return Material(
        color: scheme.surfaceContainer,
        child: Semantics(
          container: true,
          label: 'Listen',
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
            child: Row(
              children: [
                Icon(Icons.headphones, size: 20, color: scheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      where,
                      style: muted,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      semanticsLabel: said,
                    ),
                  ),
                ),
                if (!none && reader.count > 0) ...[
                  IconButton(
                    tooltip: 'Back a sentence',
                    onPressed: reader.at == 0 ? null : () => reader.step(-1),
                    icon: const Icon(Icons.skip_previous),
                  ),
                  IconButton.filled(
                    tooltip: reader.playing ? 'Pause' : 'Read aloud',
                    onPressed: reader.playing ? reader.pause : reader.play,
                    icon: Icon(reader.playing ? Icons.pause : Icons.play_arrow),
                  ),
                  IconButton(
                    tooltip: 'On a sentence',
                    onPressed: reader.at >= reader.count - 1 ? null : () => reader.step(1),
                    icon: const Icon(Icons.skip_next),
                  ),
                  TextButton(
                    onPressed: reader.nextPace,
                    style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                    child: Text(
                      '${reader.pace == reader.pace.roundToDouble() ? reader.pace.round() : reader.pace}×',
                      semanticsLabel: 'Pace ${reader.pace} times. Press for another.',
                    ),
                  ),
                ],
                IconButton(tooltip: 'Stop listening', onPressed: onClose, icon: const Icon(Icons.close)),
              ],
            ),
          ),
        ),
      );
    },
  );
}
