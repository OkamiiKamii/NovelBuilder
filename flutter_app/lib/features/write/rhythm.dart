import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/domain/text/rhythm.dart';
import '../characters/widgets/vault.dart';

/// The chapter's rhythm, over the page: a sheet on a phone, a window elsewhere. Resolves with the sentence chosen
/// (pressed in the waveform, or the start of a run), or null.
Future<RhythmSentence?> showRhythm(BuildContext context, {required RhythmReport report, required String title}) {
  final body = RhythmView(report: report, title: title);
  if (WindowSize.of(context) == WindowSize.compact) {
    return showModalBottomSheet<RhythmSentence>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SafeArea(child: body),
    );
  }
  return showDialog<RhythmSentence>(
    context: context,
    builder: (_) => Dialog(
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 820), child: body),
    ),
  );
}

/// Each sentence's bar, and the room between them; a paragraph's end leaves a little more.
const _bar = 4.0;
const _gap = 2.0;
const _paragraphGap = 5.0;

/// RHYTHM: the chapter as a waveform, a bar to a sentence as tall as it is long, mirrored about the middle the way a
/// sound is drawn; dialogue in the accent, the telling quieter; runs that keep one beat underlined, each a press away;
/// and, over it, how long the sentences run. A press on a bar is that sentence, chosen. Reads only.
class RhythmView extends StatefulWidget {
  const RhythmView({super.key, required this.report, required this.title});
  final RhythmReport report;
  final String title;

  @override
  State<RhythmView> createState() => _RhythmViewState();
}

class _RhythmViewState extends State<RhythmView> {
  /// Where each bar starts, left to right.
  late final List<double> _xs = () {
    final out = <double>[];
    var x = 0.0;
    final s = widget.report.sentences;
    for (var i = 0; i < s.length; i++) {
      if (i > 0) x += s[i].block != s[i - 1].block ? _paragraphGap + _gap : _gap;
      out.add(x);
      x += _bar;
    }
    return out;
  }();

  double get _width => _xs.isEmpty ? 0 : _xs.last + _bar;

  int? _at(double x) {
    if (_xs.isEmpty) return null;
    var best = 0;
    for (var i = 0; i < _xs.length; i++) {
      if ((_xs[i] + _bar / 2 - x).abs() < (_xs[best] + _bar / 2 - x).abs()) best = i;
    }
    return best;
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.report;
    final scheme = Theme.of(context).colorScheme;
    final muted = vaultText(context, size: 15, color: scheme.onSurfaceVariant);
    final runs = r.runs;
    final summary = r.sentences.isEmpty
        ? 'No sentences here yet.'
        : '${plural(r.sentences.length, 'sentence')} · ${r.shortest}–${r.longest} words, most about ${r.usual}'
              '${runs.isEmpty ? '' : ' · ${plural(runs.length, 'run')} keeping one beat'}';
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('RHYTHM', style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700)),
          Semantics(
            header: true,
            child: Text('How “${widget.title}” runs', style: vaultHeading(context, size: 18, weight: 700)),
          ),
          const SizedBox(height: 2),
          Text(summary, style: muted),
          const SizedBox(height: 14),
          if (r.sentences.isNotEmpty) ...[
            Semantics(
              label:
                  'The chapter’s sentences as a waveform, one bar each, as tall as it is long. $summary. '
                  'Press a bar to go to its sentence.',
              // The whole chapter across the width at a glance: drawn narrower or wider to fit, and scrolled
              // sideways only when even its narrowest would not fit.
              child: LayoutBuilder(
                builder: (context, box) {
                  final k = (box.maxWidth / math.max(_width, 1)).clamp(0.35, 2.5);
                  return SizedBox(
                    height: 150,
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapUp: (d) {
                          final i = _at(d.localPosition.dx / k);
                          if (i != null) Navigator.of(context).pop(r.sentences[i]);
                        },
                        child: CustomPaint(
                          size: Size(math.max(_width * k, 1), 150),
                          painter: _Wave(
                            report: r,
                            xs: _xs,
                            scale: k,
                            spoken: scheme.primary,
                            told: scheme.onSurfaceVariant.withValues(alpha: 0.7),
                            run: scheme.tertiary,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            ExcludeSemantics(
              child: Wrap(
                spacing: 16,
                runSpacing: 4,
                children: [
                  _Key(color: scheme.primary, label: 'Dialogue'),
                  _Key(color: scheme.onSurfaceVariant.withValues(alpha: 0.7), label: 'Telling'),
                  if (runs.isNotEmpty)
                    _Key(color: scheme.tertiary, label: 'One beat, $sameBeatRun+ in a row', line: true),
                ],
              ),
            ),
            if (runs.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text('Runs that keep one beat', style: vaultHeading(context, size: 13, weight: 700)),
              const SizedBox(height: 2),
              Text(
                'Sentences of nearly one length, one after another. Sometimes the scene wants that; often a short '
                'line or a long one breaks it.',
                style: muted,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final run in runs)
                    ActionChip(
                      avatar: Icon(Icons.graphic_eq, size: 18, color: scheme.tertiary),
                      label: Text(
                        '${run.to - run.from} at about ${r.sentences[run.from].words} words · '
                        'paragraph ${r.sentences[run.from].block + 1}',
                      ),
                      onPressed: () => Navigator.of(context).pop(r.sentences[run.from]),
                    ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({required this.color, required this.label, this.line = false});
  final Color color;
  final String label;
  final bool line;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: line ? 16 : 8,
        height: line ? 3 : 14,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
      ),
      const SizedBox(width: 6),
      Text(label, style: Theme.of(context).textTheme.labelMedium),
    ],
  );
}

class _Wave extends CustomPainter {
  _Wave({
    required this.report,
    required this.xs,
    required this.scale,
    required this.spoken,
    required this.told,
    required this.run,
  });
  final RhythmReport report;
  final List<double> xs;
  final double scale;
  final Color spoken;
  final Color told;
  final Color run;

  @override
  void paint(Canvas canvas, Size size) {
    final s = report.sentences;
    if (s.isEmpty) return;
    final mid = (size.height - 12) / 2;
    // Square-rooted, so a sentence of three words still shows beside one of forty.
    final most = math.sqrt(math.max(1, report.longest));
    for (var i = 0; i < s.length; i++) {
      final h = math.max(2.0, (mid - 2) * math.sqrt(s[i].words) / most);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(xs[i] * scale, mid - h, (xs[i] + _bar) * scale, mid + h),
          const Radius.circular(2),
        ),
        Paint()..color = s[i].spoken ? spoken : told,
      );
    }
    for (final r in report.runs) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(xs[r.from] * scale, size.height - 6, (xs[r.to - 1] + _bar) * scale, size.height - 2),
          const Radius.circular(2),
        ),
        Paint()..color = run,
      );
    }
  }

  @override
  bool shouldRepaint(_Wave old) =>
      old.report != report || old.scale != scale || old.spoken != spoken || old.told != told;
}
