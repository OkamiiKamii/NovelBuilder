import 'dart:math' as math;

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';

/// WRITING WEATHER: the room the page is written in. Rain on the glass, snow, fireflies, a candle, a night sky, or
/// nothing at all. On a tablet or a computer it is the desk around the paper, the paper itself left clean; on a phone,
/// where the paper is the whole screen, it is a faint layer behind the words, too quiet to read over.
///
/// It is drawn, not played: each frame is worked out from the time alone (nothing kept, nothing grown), at most thirty
/// times a second, and it holds still when the system asks for less motion. Nothing in the novel changes.

/// The weathers on offer.
enum Atmosphere {
  none('None'),
  rain('Rain'),
  snow('Snow'),
  fireflies('Fireflies'),
  candle('Candlelight'),
  stars('Stars');

  const Atmosphere(this.label);
  final String label;
}

/// The setting that remembers it, on this device.
const atmosphereKey = 'write.atmosphere';

/// The weather the page is written in. None, unless chosen; remembered on this device.
class AtmosphereChoice extends Notifier<Atmosphere> {
  @override
  Atmosphere build() {
    final saved = ref.watch(settingsStoreProvider).read(atmosphereKey);
    return Atmosphere.values.where((a) => a.name == saved).firstOrNull ?? Atmosphere.none;
  }

  void set(Atmosphere a) {
    state = a;
    ref.read(settingsStoreProvider).write(atmosphereKey, a.name);
  }
}

final atmosphereProvider = NotifierProvider<AtmosphereChoice, Atmosphere>(AtmosphereChoice.new);

/// The choice as chips: in the writing settings, and in the desk's drawer on a phone.
class AtmospherePicker extends ConsumerWidget {
  const AtmospherePicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chosen = ref.watch(atmosphereProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Atmosphere', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final a in Atmosphere.values)
              ChoiceChip(
                label: Text(a.label),
                selected: a == chosen,
                onSelected: (_) => ref.read(atmosphereProvider.notifier).set(a),
              ),
          ],
        ),
      ],
    );
  }
}

/// The weather, drawn over the area it is given: behind the words on a phone ([faint]), around the paper elsewhere.
class AtmosphereLayer extends StatefulWidget {
  const AtmosphereLayer({super.key, required this.kind, required this.ink, this.faint = false});

  final Atmosphere kind;

  /// The page's ink, which the rain, the snow and the stars are drawn in.
  final Color ink;

  /// Behind the words: drawn at a fraction of its strength.
  final bool faint;

  @override
  State<AtmosphereLayer> createState() => _AtmosphereLayerState();
}

class _AtmosphereLayerState extends State<AtmosphereLayer> with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker(_tick);
  final _time = ValueNotifier<double>(0);
  bool _still = false;

  void _tick(Duration elapsed) {
    final t = elapsed.inMicroseconds / 1e6;
    // Thirty frames a second are plenty for weather.
    if (t - _time.value >= 1 / 30) _time.value = t;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _still = MediaQuery.disableAnimationsOf(context);
    _run();
  }

  @override
  void didUpdateWidget(AtmosphereLayer old) {
    super.didUpdateWidget(old);
    _run();
  }

  void _run() {
    final move = !_still && widget.kind != Atmosphere.none;
    if (move && !_ticker.isActive) _ticker.start();
    if (!move && _ticker.isActive) _ticker.stop();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.kind == Atmosphere.none) return const SizedBox.shrink();
    return IgnorePointer(
      child: ExcludeSemantics(
        child: ClipRect(
          child: RepaintBoundary(
            child: CustomPaint(
              painter: AtmospherePainter(
                kind: widget.kind,
                time: _time,
                ink: widget.ink,
                strength: widget.faint ? 0.38 : 1,
              ),
              isComplex: true,
              willChange: true,
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
  }
}

/// Draws one frame of a weather at the time [time] holds.
class AtmospherePainter extends CustomPainter {
  AtmospherePainter({required this.kind, required this.time, required this.ink, this.strength = 1})
    : super(repaint: time);

  final Atmosphere kind;
  final ValueListenable<double> time;
  final Color ink;

  /// How strongly it is drawn, 0 to 1.
  final double strength;

  /// A steady pseudo-random number in 0..1 for a particle's [i]th trait, the same every frame.
  static double _r(int i, int salt) {
    final x = math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - x.floorToDouble();
  }

  /// Whether the page is dark (its ink light).
  bool get _darkPage => ink.computeLuminance() > 0.5;

  /// Rain and snow: a cool pale blue on a dark page, a slate blue on a light one, never the ink (which reads as dust).
  Color get _water => _darkPage ? const Color(0xFFDDE9F6) : const Color(0xFF6F8BA6);

  /// Stars: pale on a dark page, gold on a light one.
  Color get _light => _darkPage ? const Color(0xFFF4F1E6) : const Color(0xFFB8903A);

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final t = time.value;
    switch (kind) {
      case Atmosphere.none:
        return;
      case Atmosphere.rain:
        _rain(canvas, size, t);
      case Atmosphere.snow:
        _snow(canvas, size, t);
      case Atmosphere.fireflies:
        _fireflies(canvas, size, t);
      case Atmosphere.candle:
        _candle(canvas, size, t);
      case Atmosphere.stars:
        _stars(canvas, size, t);
    }
  }

  int _count(Size size, double per100k, int most) =>
      math.min(most, math.max(8, (size.width * size.height / 100000 * per100k).round()));

  /// Thin streaks falling on a slant, each at its own pace.
  void _rain(Canvas canvas, Size size, double t) {
    final paint = Paint()
      ..strokeWidth = 1.1
      ..strokeCap = StrokeCap.round;
    final n = _count(size, 9, 140);
    for (var i = 0; i < n; i++) {
      final speed = 520 + _r(i, 1) * 420;
      final length = 14 + _r(i, 2) * 22;
      final span = size.height + length + 40;
      final y = (t * speed + _r(i, 3) * span) % span - length;
      final x = (_r(i, 4) * (size.width + 80) - 40 + y * 0.18) % (size.width + 80) - 40;
      paint.color = _water.withValues(alpha: (0.10 + _r(i, 5) * 0.16) * strength);
      canvas.drawLine(Offset(x, y), Offset(x + length * 0.18, y + length), paint);
    }
  }

  /// Flakes drifting down, swaying as they go.
  void _snow(Canvas canvas, Size size, double t) {
    final paint = Paint();
    final n = _count(size, 7, 110);
    for (var i = 0; i < n; i++) {
      final speed = 18 + _r(i, 1) * 34;
      final radius = 1.2 + _r(i, 2) * 2.4;
      final span = size.height + 10;
      final y = (t * speed + _r(i, 3) * span) % span - 5;
      final sway = math.sin(t * (0.4 + _r(i, 4) * 0.6) + _r(i, 5) * 6.28) * (10 + _r(i, 6) * 18);
      final x = _r(i, 7) * size.width + sway;
      paint.color = _water.withValues(alpha: (0.18 + _r(i, 8) * 0.22) * strength);
      canvas.drawCircle(Offset(x, y), radius, paint);
    }
  }

  /// Small warm lights wandering, each glowing and dimming in its own time.
  void _fireflies(Canvas canvas, Size size, double t) {
    const warm = Color(0xFFFFCF6B);
    final glow = Paint()..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7);
    final core = Paint();
    final n = _count(size, 1.6, 28);
    for (var i = 0; i < n; i++) {
      final bx = _r(i, 1) * size.width;
      final by = _r(i, 2) * size.height;
      final x = bx + math.sin(t * (0.22 + _r(i, 3) * 0.3) + _r(i, 4) * 6.28) * size.width * 0.07;
      final y = by + math.cos(t * (0.18 + _r(i, 5) * 0.25) + _r(i, 6) * 6.28) * size.height * 0.05;
      final pulse = 0.5 + 0.5 * math.sin(t * (0.8 + _r(i, 7) * 1.4) + _r(i, 8) * 6.28);
      final a = (0.15 + 0.6 * pulse) * strength;
      glow.color = warm.withValues(alpha: a * 0.55);
      core.color = warm.withValues(alpha: a);
      canvas.drawCircle(Offset(x, y), 7, glow);
      canvas.drawCircle(Offset(x, y), 1.8, core);
    }
  }

  /// The warm light of a candle below the page, breathing and flickering.
  void _candle(Canvas canvas, Size size, double t) {
    const warm = Color(0xFFFFB347);
    final flicker = 1 + 0.05 * math.sin(t * 7.1) + 0.035 * math.sin(t * 13.3 + 1.7) + 0.02 * math.sin(t * 23.9 + 0.4);
    final centre = Offset(size.width / 2, size.height * 1.05);
    final radius = math.max(size.width, size.height) * 0.75 * flicker;
    final rect = Rect.fromCircle(center: centre, radius: radius);
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          warm.withValues(alpha: 0.30 * strength * flicker.clamp(0.9, 1.1)),
          warm.withValues(alpha: 0.10 * strength),
          warm.withValues(alpha: 0),
        ],
        stops: const [0, 0.45, 1],
      ).createShader(rect);
    canvas.drawRect(Offset.zero & size, paint);
  }

  /// A still sky, its stars twinkling slowly.
  void _stars(Canvas canvas, Size size, double t) {
    final paint = Paint();
    final n = _count(size, 10, 160);
    for (var i = 0; i < n; i++) {
      final x = _r(i, 1) * size.width;
      final y = _r(i, 2) * size.height;
      final twinkle = 0.5 + 0.5 * math.sin(t * (0.6 + _r(i, 3) * 1.8) + _r(i, 4) * 6.28);
      final radius = 0.6 + _r(i, 5) * 1.3;
      paint.color = _light.withValues(alpha: (0.10 + 0.45 * twinkle * _r(i, 6)) * strength);
      canvas.drawCircle(Offset(x, y), radius, paint);
    }
  }

  @override
  bool shouldRepaint(AtmospherePainter old) => old.kind != kind || old.ink != ink || old.strength != strength;
}
