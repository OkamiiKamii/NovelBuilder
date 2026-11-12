import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/domain/text/red_pencil.dart';

/// Whether the red pencil is out. Kept while the app is open, from chapter to chapter; it starts put away.
class RedPencilOn extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool on) => state = on;
}

final redPencilProvider = NotifierProvider<RedPencilOn, bool>(RedPencilOn.new);

/// The colours of the marks, from the page's ink and the theme.
typedef PencilColors = ({Color echo, Color long, Color filler});

PencilColors pencilColorsOf(ThemeData theme) {
  final s = theme.colorScheme;
  return (echo: s.error, long: s.tertiary, filler: s.primary);
}

/// THE RED PENCIL on the page: a revision view that marks the chapter as an editor's pencil would, under the words
/// themselves (`red_pencil.dart` in the domain says what is marked). Echoes are a wavy line, long sentences a thin
/// straight one, fillers a dotted one.
///
/// It is a view, not an edit: the marks are drawn by the editor's layout ([styler], a style phase), never stored in
/// the text, never saved, and they go the moment the pencil is put away. While a paragraph is being typed in its marks
/// are lifted, and the chapter is read again a moment after typing stops.
class RedPencil extends ChangeNotifier {
  RedPencil();

  late final styler = _PencilStyler(this);

  MutableDocument? _document;
  Timer? _again;
  bool _on = false;
  PencilReport _report = PencilReport.empty;
  List<String> _nodeIds = const [];
  PencilColors? _colors;

  PencilReport get report => _report;
  bool get on => _on;

  /// The paragraph a finding is in.
  String nodeOf(PencilFinding f) => _nodeIds[f.block];

  set on(bool value) {
    if (value == _on) return;
    _on = value;
    _readNow();
  }

  set colors(PencilColors value) {
    if (value == _colors) return;
    _colors = value;
    styler.redraw();
  }

  void attach(MutableDocument document) {
    detach();
    _document = document..addListener(_changed);
    _readNow();
  }

  void detach() {
    _again?.cancel();
    _document?.removeListener(_changed);
    _document = null;
    _report = PencilReport.empty;
    _nodeIds = const [];
  }

  void _changed(DocumentChangeLog log) {
    if (!_on) return;
    // The paragraphs being typed in lose their marks at once (their places are moving); all are read again soon.
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

  final _lifted = <String>{};

  void _readNow() {
    _again?.cancel();
    _lifted.clear();
    final document = _document;
    if (!_on || document == null) {
      _report = PencilReport.empty;
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
      _report = redPencil(texts);
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

class _PencilStyler extends SingleColumnLayoutStylePhase {
  _PencilStyler(this.pencil);
  final RedPencil pencil;

  /// Lays the page out again with the marks as they are now.
  void redraw() => markDirty();

  static const _types = {
    PencilMark.echo: 'pencil-echo',
    PencilMark.long: 'pencil-long',
    PencilMark.filler: 'pencil-filler',
  };

  @override
  SingleColumnLayoutViewModel style(Document document, SingleColumnLayoutViewModel viewModel) {
    final report = pencil._report;
    final colors = pencil._colors;
    if (!pencil._on || report.findings.isEmpty || colors == null) return viewModel;
    final byNode = <String, List<PencilFinding>>{};
    for (final f in report.findings) {
      if (f.block >= pencil._nodeIds.length) continue;
      byNode.putIfAbsent(pencil._nodeIds[f.block], () => []).add(f);
    }
    final styles = {
      _types[PencilMark.echo]!: SquiggleUnderlineStyle(color: colors.echo, thickness: 1.5, jaggedDeltaX: 3),
      _types[PencilMark.long]!: StraightUnderlineStyle(color: colors.long.withValues(alpha: 0.7), thickness: 1.5),
      _types[PencilMark.filler]!: DottedUnderlineStyle(color: colors.filler, dotDiameter: 2.5, dotSpace: 2),
    };
    return SingleColumnLayoutViewModel(
      padding: viewModel.padding,
      componentViewModels: [
        for (final vm in viewModel.componentViewModels)
          if (vm is TextComponentViewModel && byNode[vm.nodeId] != null && !pencil._lifted.contains(vm.nodeId))
            _marked(vm.copy() as TextComponentViewModel, byNode[vm.nodeId]!, styles)
          else
            vm,
      ],
    );
  }

  SingleColumnLayoutComponentViewModel _marked(
    TextComponentViewModel vm,
    List<PencilFinding> findings,
    Map<String, UnderlineStyle> styles,
  ) {
    final length = vm.text.length;
    for (final f in findings) {
      // Never past the end of the text as it is now.
      if (f.start >= length) continue;
      vm.customUnderlines.add(CustomUnderline(_types[f.kind]!, TextRange(start: f.start, end: f.end.clamp(0, length))));
    }
    vm.customUnderlineStyles = vm.customUnderlineStyles?.addStyles(styles) ?? CustomUnderlineStyles(styles);
    return vm as SingleColumnLayoutComponentViewModel;
  }
}

/// The pencil's slip over the page: how many of each mark, each a press away (the next one is selected and brought
/// into view), the words the chapter leans on most, and a way to put the pencil away.
class RedPencilBar extends StatefulWidget {
  const RedPencilBar({super.key, required this.pencil, required this.editor, required this.onClose});

  final RedPencil pencil;
  final Editor editor;
  final VoidCallback onClose;

  @override
  State<RedPencilBar> createState() => _RedPencilBarState();
}

class _RedPencilBarState extends State<RedPencilBar> {
  final _next = <PencilMark, int>{};

  @override
  void initState() {
    super.initState();
    widget.pencil.addListener(_update);
  }

  @override
  void didUpdateWidget(RedPencilBar old) {
    super.didUpdateWidget(old);
    if (!identical(old.pencil, widget.pencil)) {
      old.pencil.removeListener(_update);
      widget.pencil.addListener(_update);
    }
  }

  @override
  void dispose() {
    widget.pencil.removeListener(_update);
    super.dispose();
  }

  void _update() {
    if (mounted) setState(() {});
  }

  void _go(PencilMark kind) {
    final all = widget.pencil.report.of(kind).toList();
    if (all.isEmpty) return;
    final i = (_next[kind] ?? 0) % all.length;
    _next[kind] = i + 1;
    final f = all[i];
    final node = widget.pencil.nodeOf(f);
    widget.editor.execute([
      ChangeSelectionRequest(
        DocumentSelection(
          base: DocumentPosition(
            nodeId: node,
            nodePosition: TextNodePosition(offset: f.start),
          ),
          extent: DocumentPosition(
            nodeId: node,
            nodePosition: TextNodePosition(offset: f.end),
          ),
        ),
        SelectionChangeType.placeCaret,
        SelectionReason.userInteraction,
      ),
    ]);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = pencilColorsOf(theme);
    final report = widget.pencil.report;
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    Color colorOf(PencilMark k) => switch (k) {
      PencilMark.echo => colors.echo,
      PencilMark.long => colors.long,
      PencilMark.filler => colors.filler,
    };
    return Material(
      color: theme.colorScheme.surfaceContainer,
      child: Semantics(
        container: true,
        label: 'Red pencil',
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 4, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.edit, size: 18, color: colors.echo),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      report.findings.isEmpty ? 'Red pencil · nothing to mark here' : 'Red pencil · nothing is changed',
                      style: muted,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Put the red pencil away',
                    onPressed: widget.onClose,
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              // One row, swiped sideways where it does not fit: the slip stays small over a phone's page.
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final kind in PencilMark.values)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: Tooltip(
                          message: '${kind.meaning}. Press for the next one.',
                          child: ActionChip(
                            avatar: CustomPaint(size: const Size(18, 10), painter: _MarkSample(kind, colorOf(kind))),
                            label: Text('${kind.label} ${report.count(kind)}'),
                            onPressed: report.count(kind) == 0 ? null : () => _go(kind),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (report.leanedOn.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4, right: 8),
                  child: Text(
                    'Leaned on: ${[for (final w in report.leanedOn) '${w.word} ×${w.count}'].join(' · ')}',
                    style: muted,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A short sample of a mark's line, so the chips say which line is which without colour alone.
class _MarkSample extends CustomPainter {
  _MarkSample(this.kind, this.color);
  final PencilMark kind;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke;
    final y = size.height / 2;
    switch (kind) {
      case PencilMark.echo:
        final path = Path()..moveTo(0, y);
        for (var x = 0.0; x < size.width; x += 3) {
          path.lineTo(x + 1.5, (x / 3).floor().isEven ? y - 2 : y + 2);
        }
        canvas.drawPath(path, paint);
      case PencilMark.long:
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      case PencilMark.filler:
        paint.style = PaintingStyle.fill;
        for (var x = 1.5; x < size.width; x += 4.5) {
          canvas.drawCircle(Offset(x, y), 1.3, paint);
        }
    }
  }

  @override
  bool shouldRepaint(_MarkSample old) => old.kind != kind || old.color != color;
}
