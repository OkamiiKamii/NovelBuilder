import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/characters/this_or_that.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// THIS OR THAT, full screen (`this_or_that.dart` holds the deck): a character's temperament a card at a time. Each
/// card asks one thing ("In a crowded room, they are…") and holds its two answers side by side, Quiet or Loud: swipe
/// the card towards one, or press it. Skip passes; Back returns. What their Core Traits already say is chosen when the
/// card comes up. At the end, their **compass**: every axis with where they fell, and **Keep these traits** writes them
/// into Core Traits (traits not on the deck kept). Nothing changes until Keep.
Future<void> showThisOrThat(
  BuildContext context, {
  required Entry entry,
  required CharacterProfile profile,
  required CharacterActions actions,
}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (_) => ThisOrThatDeck(entry: entry, profile: profile, actions: actions),
  ),
);

class ThisOrThatDeck extends StatefulWidget {
  const ThisOrThatDeck({super.key, required this.entry, required this.profile, required this.actions});

  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;

  @override
  State<ThisOrThatDeck> createState() => _ThisOrThatDeckState();
}

class _ThisOrThatDeckState extends State<ThisOrThatDeck> with SingleTickerProviderStateMixin {
  late final Map<String, int?> _sides = {
    ...sidesOf(
      traitsIn(
        widget.entry.fields
                .where(
                  (f) => const [
                    'core traits',
                    'traits',
                    'personality traits',
                    'personality',
                  ].contains(f.key.trim().toLowerCase()),
                )
                .firstOrNull
                ?.value ??
            '',
      ),
    ),
  };

  /// Where they were when the deck was dealt (taken then, before any choice), so Keep knows what changed.
  late final Map<String, int?> _was;
  int _at = 0;
  double _dx = 0;
  late final AnimationController _fly = AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  double _from = 0;
  double _to = 0;
  VoidCallback? _then;

  String get _name => widget.entry.name.trim().isEmpty ? 'They' : widget.entry.name.trim();

  @override
  void initState() {
    super.initState();
    _was = {..._sides};
    _fly.addListener(() => setState(() => _dx = _from + (_to - _from) * Curves.easeOut.transform(_fly.value)));
    _fly.addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        final then = _then;
        _then = null;
        then?.call();
      }
    });
  }

  @override
  void dispose() {
    _fly.dispose();
    super.dispose();
  }

  void _animate(double to, {VoidCallback? then}) {
    if (MediaQuery.disableAnimationsOf(context)) {
      setState(() => _dx = 0);
      then?.call();
      return;
    }
    _from = _dx;
    _to = to;
    _then = then;
    _fly.forward(from: 0);
  }

  void _choose(int side) {
    final axis = traitAxes[_at];
    setState(() => _sides[axis.id] = side);
    final width = MediaQuery.sizeOf(context).width;
    _animate(side * width * 1.2, then: _next);
  }

  void _next() => setState(() {
    _dx = 0;
    _at++;
  });

  void _skip() => _next();

  void _back() => setState(() {
    _dx = 0;
    if (_at > 0) _at--;
  });

  void _keep() {
    widget.actions.now((c) => recordTraits(c, widget.entry.id, _sides));
    Navigator.of(context).pop();
    widget.actions.tell('$_name’s traits are in their profile, under Core Traits.');
  }

  bool get _changed => traitAxes.any((a) => _sides[a.id] != _was[a.id]);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final done = _at >= traitAxes.length;
    final tone = NovelArt.of(context).bound(castTone(widget.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    final face = ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 48,
          height: 58,
          child: Cameo(look: cameoLookOf(widget.entry, widget.profile), ground: tone.ground, ink: tone.ink),
        ),
      ),
    );
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.close),
        ),
        title: Text('This or that', style: vaultHeading(context, size: 18, weight: 700)),
        actions: [
          if (!done)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text(
                  '${_at + 1} of ${traitAxes.length}',
                  style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: done ? _compass(context, face) : _deck(context, face),
            ),
          ),
        ),
      ),
    );
  }

  Widget _deck(BuildContext context, Widget face) {
    final scheme = Theme.of(context).colorScheme;
    final axis = traitAxes[_at];
    final chosen = _sides[axis.id];
    final width = MediaQuery.sizeOf(context).width;
    final lean = (_dx / (width * 0.3)).clamp(-1.0, 1.0);
    Widget half(int side, String word) {
      final on = chosen == side;
      final pull = side < 0 ? (-lean).clamp(0.0, 1.0) : lean.clamp(0.0, 1.0);
      return Expanded(
        child: Semantics(
          button: true,
          selected: on,
          label: '$_name is: $word',
          excludeSemantics: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => _choose(side),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 24),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                color: Color.lerp(
                  on ? scheme.primary.withValues(alpha: 0.16) : Colors.transparent,
                  scheme.primary.withValues(alpha: 0.28),
                  pull,
                ),
                border: Border.all(color: on ? scheme.primary : scheme.outlineVariant, width: on ? 2 : 1),
              ),
              alignment: Alignment.center,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    side < 0 ? Icons.arrow_back : Icons.arrow_forward,
                    size: 18,
                    color: scheme.onSurfaceVariant.withValues(alpha: 0.7),
                  ),
                  const SizedBox(height: 10),
                  // A word is made smaller to fit, never broken across lines ("improvise / r").
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      word,
                      textAlign: TextAlign.center,
                      style: vaultHeading(
                        context,
                        size: 21,
                        weight: 700,
                        color: on ? scheme.primary : scheme.onSurface,
                      ),
                    ),
                  ),
                  if (on) ...[const SizedBox(height: 6), Icon(Icons.check_circle, size: 18, color: scheme.primary)],
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            face,
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                askOf(axis, _name),
                style: vaultText(context, size: 19, style: FontStyle.italic, color: scheme.onSurface),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ExcludeSemantics(
          child: LinearProgressIndicator(
            value: _at / traitAxes.length,
            minHeight: 3,
            color: scheme.primary,
            backgroundColor: scheme.outlineVariant.withValues(alpha: 0.5),
          ),
        ),
        Expanded(
          child: Center(
            // The card: dragged towards a side, it leans; let go far enough, it goes that way.
            child: GestureDetector(
              onHorizontalDragUpdate: (d) => setState(() => _dx += d.delta.dx),
              onHorizontalDragEnd: (d) {
                final v = d.primaryVelocity ?? 0;
                if (_dx.abs() > width * 0.25 || v.abs() > 700) {
                  _choose((_dx.abs() > 4 ? _dx : v).sign.toInt());
                } else {
                  _animate(0);
                }
              },
              child: Transform.translate(
                offset: Offset(_dx, 0),
                child: Transform.rotate(
                  angle: lean * 0.12,
                  child: Material(
                    elevation: 6,
                    shadowColor: Colors.black45,
                    color: scheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(24),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            half(-1, axis.left),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              child: Center(
                                child: Text(
                                  'or',
                                  style: vaultText(
                                    context,
                                    size: 16,
                                    style: FontStyle.italic,
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            ),
                            half(1, axis.right),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        Text(
          'Swipe the card towards one, or press it.',
          textAlign: TextAlign.center,
          style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            TextButton.icon(
              onPressed: _at == 0 ? null : _back,
              icon: const Icon(Icons.undo),
              label: const Text('Back'),
            ),
            const Spacer(),
            TextButton(onPressed: _skip, child: Text(chosen == null ? 'Skip' : 'Next')),
          ],
        ),
      ],
    );
  }

  Widget _compass(BuildContext context, Widget face) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            face,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$_name’s compass', style: vaultHeading(context, size: 20, weight: 700)),
                  Text(
                    'Where they fell on each. Keep it, and it is in their Core Traits.',
                    style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Expanded(
          child: ListView(
            children: [for (final a in traitAxes) _CompassLine(axis: a, side: _sides[a.id])],
          ),
        ),
        const SizedBox(height: 8),
        OverflowBar(
          alignment: MainAxisAlignment.end,
          spacing: 8,
          overflowAlignment: OverflowBarAlignment.end,
          children: [
            TextButton(onPressed: () => setState(() => _at = 0), child: const Text('Back to the deck')),
            FilledButton.icon(
              onPressed: _changed ? _keep : null,
              icon: const Icon(Icons.check),
              label: const Text('Keep these traits'),
            ),
          ],
        ),
      ],
    );
  }
}

/// One axis of the compass: the two words, and a mark where they fell (in the middle when unchosen).
class _CompassLine extends StatelessWidget {
  const _CompassLine({required this.axis, required this.side});
  final TraitAxis axis;
  final int? side;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    TextStyle word(bool on) => vaultText(
      context,
      size: 15,
      color: on ? scheme.primary : scheme.onSurfaceVariant,
    ).copyWith(fontWeight: on ? FontWeight.w700 : FontWeight.w400);
    return Semantics(
      label: side == null ? '${axis.left} or ${axis.right}: not chosen' : (side! < 0 ? axis.left : axis.right),
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            SizedBox(
              width: 112,
              child: Text(axis.left, textAlign: TextAlign.end, style: word(side == -1)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: SizedBox(
                height: 16,
                child: CustomPaint(
                  painter: _Track(side: side, line: scheme.outlineVariant, mark: scheme.primary),
                ),
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(width: 112, child: Text(axis.right, style: word(side == 1))),
          ],
        ),
      ),
    );
  }
}

class _Track extends CustomPainter {
  _Track({required this.side, required this.line, required this.mark});
  final int? side;
  final Color line;
  final Color mark;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height / 2;
    canvas.drawLine(
      Offset(0, y),
      Offset(size.width, y),
      Paint()
        ..color = line
        ..strokeWidth = 2,
    );
    canvas.drawCircle(Offset(size.width / 2, y), 2.5, Paint()..color = line);
    final x = switch (side) {
      null => size.width / 2,
      final s => s < 0 ? size.width * 0.12 : size.width * 0.88,
    };
    canvas.drawCircle(Offset(x, y), side == null ? 4 : 7, Paint()..color = side == null ? line : mark);
    if (side != null) {
      canvas.drawCircle(
        Offset(x, y),
        7 + math.max(2, size.height * 0.15),
        Paint()..color = mark.withValues(alpha: 0.18),
      );
    }
  }

  @override
  bool shouldRepaint(_Track old) => old.side != side || old.mark != mark || old.line != line;
}
