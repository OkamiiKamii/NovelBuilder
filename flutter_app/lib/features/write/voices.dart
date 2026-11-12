import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:super_editor/super_editor.dart';

import '../../core/format.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/text/voices.dart';
import '../characters/widgets/cast_card.dart' show castTone, monogram;

/// Whether the voices are shown. Kept while the app is open, from chapter to chapter; it starts off.
class VoicesOn extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool on) => state = on;
}

final voicesProvider = NotifierProvider<VoicesOn, bool>(VoicesOn.new);

/// The cast as the voices read it: the names each character goes by in the text, and the name to show for them.
typedef VoiceCast = ({Map<String, List<String>> names, Map<String, String> shown});

VoiceCast voiceCastOf(NovelStore store, String novelId) {
  final characters = [
    for (final r in store.rowsIn(novelId, 'loreEntries'))
      if (Entry(r) case final e when e.category == 'character' && e.name.trim().isNotEmpty) e,
  ]..sort((a, b) => a.id.compareTo(b.id));
  final profiles = <String, CharacterProfile>{
    for (final r in [
      ...store.rowsIn(novelId, 'characterProfiles'),
    ]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };
  return (names: namesToFind(characters, profiles), shown: {for (final e in characters) e.id: e.name.trim()});
}

/// A line of dialogue on the page, by who says it (null: nobody named). Only ever on the layout's copy of the text.
@immutable
class VoiceAttribution implements Attribution {
  const VoiceAttribution(this.speaker);
  final String? speaker;

  @override
  String get id => 'voice';

  @override
  bool canMergeWith(Attribution other) => other == this;

  @override
  bool operator ==(Object other) => other is VoiceAttribution && other.speaker == speaker;

  @override
  int get hashCode => Object.hash('voice', speaker);
}

/// THE VOICES on the page: a reading of the chapter that sets every line of dialogue in its speaker's own colour (the
/// colour the cast wears everywhere in the app) and lets the telling around it fall back, so a conversation reads
/// like a script with each part highlighted. A line nobody is named for stays in ink, dotted under: a reader may not
/// know who says it either. Beside it, the slip says how much of the chapter is dialogue and who has the floor.
///
/// It is a view, not an edit: the colours are drawn by the editor's layout ([styler], a style phase) on its own copy
/// of the text, never stored, never saved, gone the moment the voices are put away. While a paragraph is being typed
/// in it loses its colours (their places are moving), and the chapter is read again a moment after typing stops.
class VoicesLens extends ChangeNotifier {
  VoicesLens();

  late final styler = _VoicesStyler(this);

  MutableDocument? _document;
  Timer? _again;
  bool _on = false;
  VoiceReport _report = VoiceReport.empty;
  List<String> _nodeIds = const [];
  VoiceCast _cast = (names: const {}, shown: const {});
  final _lifted = <String>{};
  final _tones = <(String, bool), Color>{};

  VoiceReport get report => _report;
  bool get on => _on;
  String nameOf(String id) => _cast.shown[id] ?? 'Someone';

  /// The paragraph a line is in.
  String nodeOf(VoiceLine l) => _nodeIds[l.block];

  set on(bool value) {
    if (value == _on) return;
    _on = value;
    _readNow();
  }

  set cast(VoiceCast value) {
    _cast = value;
    if (_on) _readNow();
  }

  /// A speaker's colour, made light enough on a dark page and deep enough on a light one to be read as text.
  Color toneOf(String speaker, {required bool darkPage}) => _tones.putIfAbsent((speaker, darkPage), () {
    final hsl = HSLColor.fromColor(castTone(speaker));
    final l = darkPage ? math.max(hsl.lightness, 0.7) : math.min(hsl.lightness, 0.4);
    return hsl.withLightness(l).withSaturation(math.max(hsl.saturation, 0.55)).toColor();
  });

  void attach(MutableDocument document) {
    detach();
    _document = document..addListener(_changed);
    _readNow();
  }

  void detach() {
    _again?.cancel();
    _document?.removeListener(_changed);
    _document = null;
    _report = VoiceReport.empty;
    _nodeIds = const [];
  }

  void _changed(DocumentChangeLog log) {
    if (!_on) return;
    final touched = {
      for (final c in log.changes)
        if (c is NodeDocumentChange) c.nodeId,
    };
    if (touched.isNotEmpty) {
      _lifted.addAll(touched);
      styler.redraw();
    }
    _again?.cancel();
    _again = Timer(const Duration(milliseconds: 400), _readNow);
  }

  void _readNow() {
    _again?.cancel();
    _lifted.clear();
    final document = _document;
    if (!_on || document == null) {
      _report = VoiceReport.empty;
      _nodeIds = const [];
    } else {
      final ids = <String>[];
      final texts = <String>[];
      for (final node in document) {
        if (node is TextNode) {
          ids.add(node.id);
          texts.add(node.text.toPlainText());
        }
      }
      _nodeIds = ids;
      _report = voicesOf(texts, _cast.names);
    }
    styler.redraw();
    notifyListeners();
  }

  @override
  void dispose() {
    detach();
    super.dispose();
  }
}

class _VoicesStyler extends SingleColumnLayoutStylePhase {
  _VoicesStyler(this.lens);
  final VoicesLens lens;

  void redraw() => markDirty();

  @override
  SingleColumnLayoutViewModel style(Document document, SingleColumnLayoutViewModel viewModel) {
    if (!lens._on) return viewModel;
    final byNode = <String, List<VoiceLine>>{};
    for (final l in lens._report.lines) {
      if (l.block >= lens._nodeIds.length) continue;
      byNode.putIfAbsent(lens._nodeIds[l.block], () => []).add(l);
    }
    return SingleColumnLayoutViewModel(
      padding: viewModel.padding,
      componentViewModels: [
        for (final vm in viewModel.componentViewModels)
          if (vm is TextComponentViewModel)
            _voiced(
              vm.copy() as TextComponentViewModel,
              lens._lifted.contains(vm.nodeId) ? const [] : byNode[vm.nodeId] ?? const [],
            )
          else
            vm,
      ],
    );
  }

  SingleColumnLayoutComponentViewModel _voiced(TextComponentViewModel vm, List<VoiceLine> lines) {
    if (lines.isNotEmpty) {
      final text = vm.text.copy();
      final length = text.length;
      for (final l in lines) {
        // Never past the end of the text as it is now.
        if (l.start >= length) continue;
        text.addAttribution(VoiceAttribution(l.speaker), SpanRange(l.start, math.min(l.end, length) - 1));
      }
      vm.text = text;
    }
    final base = vm.textStyleBuilder;
    vm.textStyleBuilder = (attributions) {
      final style = base(attributions);
      final ink = style.color ?? const Color(0xFF000000);
      final voice = attributions.whereType<VoiceAttribution>().firstOrNull;
      // The telling falls back; the dialogue stands out of it.
      if (voice == null) return style.copyWith(color: ink.withValues(alpha: ink.a * 0.42));
      final speaker = voice.speaker;
      if (speaker == null) {
        return style.copyWith(
          decoration: TextDecoration.underline,
          decorationStyle: TextDecorationStyle.dotted,
          decorationColor: ink.withValues(alpha: 0.6),
        );
      }
      return style.copyWith(color: lens.toneOf(speaker, darkPage: ink.computeLuminance() > 0.5));
    };
    return vm as SingleColumnLayoutComponentViewModel;
  }
}

/// The voices' slip over the page: how much of the chapter is dialogue, a bar of who has the floor (each speaker's
/// share of the words, in their colour, the telling after), and each speaker a press away (their next line is selected
/// and brought into view). Lines nobody is named for are counted and found the same way.
class VoicesBar extends StatefulWidget {
  const VoicesBar({super.key, required this.lens, required this.editor, required this.onClose});

  final VoicesLens lens;
  final Editor editor;
  final VoidCallback onClose;

  @override
  State<VoicesBar> createState() => _VoicesBarState();
}

class _VoicesBarState extends State<VoicesBar> {
  final _next = <String?, int>{};

  @override
  void initState() {
    super.initState();
    widget.lens.addListener(_update);
  }

  @override
  void didUpdateWidget(VoicesBar old) {
    super.didUpdateWidget(old);
    if (!identical(old.lens, widget.lens)) {
      old.lens.removeListener(_update);
      widget.lens.addListener(_update);
    }
  }

  @override
  void dispose() {
    widget.lens.removeListener(_update);
    super.dispose();
  }

  void _update() {
    if (mounted) setState(() {});
  }

  void _go(String? speaker) {
    final all = widget.lens.report.of(speaker);
    if (all.isEmpty) return;
    final i = (_next[speaker] ?? 0) % all.length;
    _next[speaker] = i + 1;
    final l = all[i];
    final node = widget.lens.nodeOf(l);
    widget.editor.execute([
      ChangeSelectionRequest(
        DocumentSelection(
          base: DocumentPosition(
            nodeId: node,
            nodePosition: TextNodePosition(offset: l.start),
          ),
          extent: DocumentPosition(
            nodeId: node,
            nodePosition: TextNodePosition(offset: l.end),
          ),
        ),
        SelectionChangeType.placeCaret,
        SelectionReason.userInteraction,
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final lens = widget.lens;
    final report = lens.report;
    final speakers = report.speakers;
    final dark = theme.brightness == Brightness.dark;
    final muted = theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant);
    final share = report.chapterWords == 0 ? 0 : (100 * report.dialogueWords / report.chapterWords).round();
    final telling = math.max(0, report.chapterWords - report.dialogueWords);
    Color colorOf(String? s) => s == null ? scheme.outline : lens.toneOf(s, darkPage: dark);
    final headline = report.lines.isEmpty
        ? 'Voices · no dialogue on this page yet'
        : 'Voices · $share% of this chapter is dialogue · nothing is changed';
    return Material(
      color: scheme.surfaceContainer,
      child: Semantics(
        container: true,
        label: 'Voices',
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 4, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.record_voice_over, size: 18, color: scheme.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(headline, style: muted, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ),
                  IconButton(tooltip: 'Put the voices away', onPressed: widget.onClose, icon: const Icon(Icons.close)),
                ],
              ),
              if (report.lines.isNotEmpty) ...[
                // Who has the floor: each speaker's words, then the telling, across the chapter.
                Padding(
                  padding: const EdgeInsets.only(right: 8, bottom: 6),
                  child: ExcludeSemantics(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: SizedBox(
                        height: 6,
                        child: Row(
                          children: [
                            for (final s in speakers)
                              Expanded(
                                flex: s.words,
                                child: ColoredBox(color: colorOf(s.speaker)),
                              ),
                            if (telling > 0)
                              Expanded(
                                flex: telling,
                                child: ColoredBox(color: scheme.outlineVariant),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final s in speakers)
                        Padding(
                          padding: const EdgeInsetsDirectional.only(end: 8),
                          child: Tooltip(
                            message: s.speaker == null
                                ? 'Dialogue with no name beside it: ${plural(s.words, 'word')}. Press for the next one.'
                                : '${plural(s.words, 'word')} spoken. Press for their next line.',
                            child: ActionChip(
                              avatar: s.speaker == null
                                  ? Icon(Icons.help_outline, size: 18, color: scheme.onSurfaceVariant)
                                  : CircleAvatar(
                                      backgroundColor: colorOf(s.speaker),
                                      child: Text(
                                        monogram(lens.nameOf(s.speaker!)),
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: dark ? Colors.black : Colors.white,
                                        ),
                                      ),
                                    ),
                              label: Text(
                                '${s.speaker == null ? 'Not named' : lens.nameOf(s.speaker!)} · '
                                '${plural(s.lines, 'line')}',
                              ),
                              onPressed: () => _go(s.speaker),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
