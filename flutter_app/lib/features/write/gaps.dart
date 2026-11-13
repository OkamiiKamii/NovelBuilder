import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:super_editor/super_editor.dart';

import '../../core/format.dart';
import '../../shared/data/background.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/text/gaps.dart';
import '../characters/widgets/vault.dart';
import '../workspace/open_novel.dart';
import 'write_providers.dart';

/// WRITE PAST IT: a writer who stops to look up a name, a date or the word they want loses the sentence they were in.
/// Writers long ago learned to leave a mark and keep going ("TK", or a note in [[double brackets]], as
/// `shared/domain/text/gaps.dart` reads them). This app holds them to it: each gap stands out on the page like a sticky
/// note, the contents keep every one in the book a press away, and the editor's ink tray leaves one in a press.
///
/// The gaps are the author's own text: found, never stored apart, never changed. Filling one is writing over it.

/// The sticky note's colour, on this page's paper.
Color gapColorOf(ColorScheme scheme) {
  final dark = scheme.brightness == Brightness.dark;
  return Color.alphaBlend(const Color(0xFFF5C542).withValues(alpha: dark ? 0.26 : 0.42), scheme.surface);
}

/// A gap on the page, drawn as a sticky note (by the layout only: never put in the text).
class GapAttribution implements Attribution {
  const GapAttribution();

  @override
  String get id => 'gap';

  @override
  bool canMergeWith(Attribution other) => other is GapAttribution;
}

/// The brackets round a gap's note, drawn faint so the note reads as a note.
class GapBracketAttribution implements Attribution {
  const GapBracketAttribution();

  @override
  String get id => 'gap-bracket';

  @override
  bool canMergeWith(Attribution other) => other is GapBracketAttribution;
}

/// Draws every gap on the page as a sticky note. Always on: a gap is there to be seen.
class GapStyler extends SingleColumnLayoutStylePhase {
  GapStyler();

  Color? _color;

  set color(Color value) {
    if (value == _color) return;
    _color = value;
    markDirty();
  }

  @override
  SingleColumnLayoutViewModel style(Document document, SingleColumnLayoutViewModel viewModel) {
    final color = _color;
    if (color == null) return viewModel;
    var any = false;
    final vms = <SingleColumnLayoutComponentViewModel>[];
    for (final vm in viewModel.componentViewModels) {
      if (vm is TextComponentViewModel) {
        final gaps = gapsIn(vm.text.toPlainText());
        if (gaps.isNotEmpty) {
          any = true;
          vms.add(_marked(vm.copy() as TextComponentViewModel, gaps, color));
          continue;
        }
      }
      vms.add(vm);
    }
    if (!any) return viewModel;
    return SingleColumnLayoutViewModel(padding: viewModel.padding, componentViewModels: vms);
  }

  SingleColumnLayoutComponentViewModel _marked(TextComponentViewModel vm, List<GapSpan> gaps, Color color) {
    final text = vm.text.copy();
    for (final g in gaps) {
      text.addAttribution(const GapAttribution(), SpanRange(g.start, g.end - 1));
      if (text.toPlainText().startsWith('[[', g.start)) {
        text
          ..addAttribution(const GapBracketAttribution(), SpanRange(g.start, g.start + 1))
          ..addAttribution(const GapBracketAttribution(), SpanRange(g.end - 2, g.end - 1));
      }
    }
    vm.text = text;
    final base = vm.textStyleBuilder;
    vm.textStyleBuilder = (attributions) {
      final style = base(attributions);
      if (!attributions.any((a) => a is GapAttribution)) return style;
      final ink = style.color ?? const Color(0xFF000000);
      return style.copyWith(
        backgroundColor: color,
        color: attributions.any((a) => a is GapBracketAttribution) ? ink.withValues(alpha: 0.35) : null,
      );
    };
    return vm as SingleColumnLayoutComponentViewModel;
  }
}

/// Leaves a gap where the caret is: "[[ ]]" with the caret inside, to note what goes there (or nothing, and write
/// on). With words selected in one paragraph, they become the gap's note.
void leaveGap(Editor editor, MutableDocumentComposer composer, MutableDocument document) {
  final selection = composer.selection;
  if (selection == null) return;
  final base = selection.base.nodePosition;
  final extent = selection.extent.nodePosition;
  if (base is! TextNodePosition || extent is! TextNodePosition) return;
  final nodeId = selection.extent.nodeId;
  void caret(int offset) => editor.execute([
    ChangeSelectionRequest(
      DocumentSelection.collapsed(
        position: DocumentPosition(
          nodeId: nodeId,
          nodePosition: TextNodePosition(offset: offset),
        ),
      ),
      SelectionChangeType.placeCaret,
      SelectionReason.userInteraction,
    ),
  ]);
  DocumentPosition at(int offset) => DocumentPosition(
    nodeId: nodeId,
    nodePosition: TextNodePosition(offset: offset),
  );

  if (!selection.isCollapsed && selection.base.nodeId == nodeId) {
    final start = base.offset < extent.offset ? base.offset : extent.offset;
    final end = base.offset < extent.offset ? extent.offset : base.offset;
    editor.execute([
      InsertTextRequest(documentPosition: at(end), textToInsert: ']]', attributions: const {}),
      InsertTextRequest(documentPosition: at(start), textToInsert: '[[', attributions: const {}),
    ]);
    caret(end + 4);
    return;
  }
  if (!selection.isCollapsed) return;
  final offset = extent.offset;
  final node = document.getNodeById(nodeId);
  final before = node is TextNode && offset > 0 ? node.text.toPlainText()[offset - 1] : ' ';
  // A space before the gap when it would otherwise join the word before.
  final lead = before.trim().isEmpty ? '' : ' ';
  editor.execute([InsertTextRequest(documentPosition: at(offset), textToInsert: '$lead[[]]', attributions: const {})]);
  caret(offset + lead.length + 2);
}

/// A gap to go to: the editor of [Gap.nodeId] selects it when it opens (or at once, when it is open already).
class PendingGapNotifier extends Notifier<Gap?> {
  @override
  Gap? build() => null;

  void request(Gap? gap) => state = gap;
}

final pendingGapProvider = NotifierProvider<PendingGapNotifier, Gap?>(PendingGapNotifier.new);

/// Where [gap] is in [document] now: its paragraph when the gap is still where it was, otherwise the same gap as
/// written in the paragraph nearest to it. Null when it is no longer in the text.
({String nodeId, int start, int end})? findGap(Document document, Gap gap) {
  final texts = [
    for (final n in document)
      if (n is TextNode) (id: n.id, text: n.text.toPlainText()),
  ];
  if (gap.block < texts.length) {
    final t = texts[gap.block];
    if (t.text.startsWith(gap.written, gap.start)) return (nodeId: t.id, start: gap.start, end: gap.end);
  }
  ({String nodeId, int start, int end})? best;
  var distance = 1 << 30;
  for (final (i, t) in texts.indexed) {
    final at = t.text.indexOf(gap.written);
    if (at < 0) continue;
    final d = (i - gap.block).abs();
    if (d < distance) {
      distance = d;
      best = (nodeId: t.id, start: at, end: at + gap.written.length);
    }
  }
  return best;
}

/// Every gap in the open novel, in reading order, read away from the screen after each save.
class GapsNotifier extends Notifier<List<Gap>> {
  @override
  List<Gap> build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const [];
    final store = ref.watch(novelStoreProvider);
    final run = ref.watch(runAsideProvider);
    final service = ref.read(manuscriptServiceProvider);
    var alive = true;
    String? readAt;
    var running = false;
    var again = false;
    var queued = false;

    String stamp() => [
      for (final c in const ['chapterContents', 'chapters'])
        if (store.stampOf(novelId, c) case (:final count, :final latest)) '$count:$latest',
    ].join('|');

    void read() {
      if (!alive || !store.exists(novelId)) return;
      if (running) {
        again = true;
        return;
      }
      final now = stamp();
      if (now == readAt) return;
      readAt = now;
      running = true;
      final order = [
        for (final n in readingOrder(service.nodes(novelId)))
          if (isDocument(n.kind)) n.id,
      ];
      run(gapsJob(store.rawJsonIn(novelId, 'chapterContents'), order))
          .then(
            (found) {
              if (alive && readAt == now) state = found;
            },
            onError: (Object e, StackTrace s) =>
                FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'write')),
          )
          .whenComplete(() {
            running = false;
            if (again) {
              again = false;
              read();
            }
          });
    }

    void changed() {
      if (queued) return;
      queued = true;
      scheduleMicrotask(() {
        queued = false;
        read();
      });
    }

    store.addListener(changed);
    ref.onDispose(() {
      alive = false;
      store.removeListener(changed);
    });
    changed();
    return const [];
  }
}

/// Kept while the novel is open: it is in view beside the page whenever there is writing to read, and it reads only
/// when the chapters change.
final gapsProvider = NotifierProvider<GapsNotifier, List<Gap>>(GapsNotifier.new);

/// How many gaps the card lists before "Show all".
const gapsShown = 4;

/// GAPS TO FILL, in the contents under the day book: every gap in the book, in reading order, each with its note (or
/// the words round it) and its chapter, a press from the very spot. Nothing at all while the book has none.
class GapsCard extends ConsumerStatefulWidget {
  const GapsCard({super.key});

  @override
  ConsumerState<GapsCard> createState() => _GapsCardState();
}

class _GapsCardState extends ConsumerState<GapsCard> {
  bool _all = false;

  @override
  Widget build(BuildContext context) {
    final gaps = ref.watch(gapsProvider);
    if (gaps.isEmpty) return const SizedBox.shrink();
    final nodes = {for (final n in ref.watch(outlineProvider)) n.id: n};
    final scheme = Theme.of(context).colorScheme;
    final chapters = {for (final g in gaps) g.nodeId}.length;
    final shown = _all ? gaps : gaps.take(gapsShown).toList();
    final sticky = gapColorOf(scheme);

    void go(Gap g) {
      ref.read(pendingGapProvider.notifier).request(g);
      ref.read(selectedNodeProvider.notifier).select(g.nodeId);
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('GAPS TO FILL', style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700)),
              const SizedBox(height: 4),
              Semantics(
                header: true,
                child: Text(
                  '${plural(gaps.length, 'gap')} left to fill'
                  '${chapters > 1 ? ' in $chapters chapters' : ''}',
                  style: vaultHeading(context, size: 16, color: scheme.onSurface, weight: 700),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'You wrote past them. Press one to fill it in.',
                style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 8),
              for (final g in shown)
                _GapLine(gap: g, chapter: nodes[g.nodeId]?.displayTitle ?? '', sticky: sticky, onTap: () => go(g)),
              if (gaps.length > gapsShown)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _all = !_all),
                    child: Text(_all ? 'Show fewer' : 'Show all ${gaps.length}'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GapLine extends StatelessWidget {
  const _GapLine({required this.gap, required this.chapter, required this.sticky, required this.onTap});

  final Gap gap;
  final String chapter;
  final Color sticky;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final page = vaultText(context, size: 15.5, color: scheme.onSurface);
    final faint = page.copyWith(color: scheme.onSurfaceVariant);
    // The note, when there is one; otherwise the words round the gap, the gap a sticky note among them.
    final line = gap.note.isNotEmpty
        ? Text(
            gap.note,
            style: page.copyWith(fontStyle: FontStyle.italic),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          )
        : Text.rich(
            TextSpan(
              children: [
                TextSpan(text: gap.before, style: faint),
                TextSpan(
                  text: gap.written,
                  style: page.copyWith(backgroundColor: sticky, fontWeight: FontWeight.w700),
                ),
                TextSpan(text: gap.after, style: faint),
              ],
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          );
    return Semantics(
      button: true,
      label: 'Gap in $chapter: ${gap.note.isNotEmpty ? gap.note : '${gap.before} ${gap.written} ${gap.after}'}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // A little sticky note, its corner turned.
                Container(
                  width: 22,
                  height: 22,
                  margin: const EdgeInsets.only(top: 2, right: 12),
                  decoration: BoxDecoration(
                    color: sticky,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(3),
                      topRight: Radius.circular(3),
                      bottomLeft: Radius.circular(3),
                      bottomRight: Radius.circular(9),
                    ),
                    border: Border.all(color: scheme.outline.withValues(alpha: 0.35)),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      line,
                      if (chapter.isNotEmpty)
                        Text(
                          chapter,
                          style: vaultText(context, size: 13.5, color: scheme.primary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
