import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// SCRAMBLE TEXT (dqnamo's Kitchen; anime.js's `scrambleText`): when its words change, the characters that changed run
/// through stand-ins (digits for a digit, letters for a letter) and settle into the new words from the first to the
/// last, in a third of a second. Shown the first time, or with less motion asked for, the words are simply there; a
/// screen reader hears only the words.
class ScrambleText extends StatefulWidget {
  const ScrambleText(this.text, {super.key, this.style, this.textAlign});

  final String text;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  State<ScrambleText> createState() => _ScrambleTextState();
}

class _ScrambleTextState extends State<ScrambleText> with SingleTickerProviderStateMixin {
  late final AnimationController _run;
  String _before = '';

  @override
  void initState() {
    super.initState();
    _run = AnimationController(vsync: this, duration: const Duration(milliseconds: 340));
  }

  @override
  void didUpdateWidget(ScrambleText old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text && !Motion.reduced(context)) {
      _before = old.text;
      _run.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _run.dispose();
    super.dispose();
  }

  static const _digits = '0123456789';
  static const _letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  /// The words part way through settling, at [t] (0 to 1): those before the settling point are the new ones; after
  /// it, a character that changed is a stand-in, one that did not is itself.
  String _at(double t) {
    final to = widget.text;
    final settled = (t * to.length).floor();
    final step = (t * 24).floor();
    final out = StringBuffer();
    for (var i = 0; i < to.length; i++) {
      final c = to[i];
      final same = i < _before.length && _before[i] == c;
      if (i < settled || same || c.trim().isEmpty) {
        out.write(c);
      } else {
        final pool = RegExp(r'\d').hasMatch(c) ? _digits : (RegExp('[A-Za-z]').hasMatch(c) ? _letters : null);
        out.write(pool == null ? c : pool[(i * 7 + step * 13) % pool.length]);
      }
    }
    return out.toString();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _run,
    builder: (context, _) => Text(
      _run.isAnimating ? _at(_run.value) : widget.text,
      style: widget.style,
      textAlign: widget.textAlign,
      semanticsLabel: widget.text,
    ),
  );
}
