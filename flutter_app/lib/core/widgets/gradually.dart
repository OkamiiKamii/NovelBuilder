import 'package:flutter/widgets.dart';

/// PROGRESSIVELY BUILT: [total] things (cards, rows, articles), a screenful in the first frame and a handful in each
/// frame after, so a page with many of them is there at once instead of after all are built. Only this part is built
/// again as they come, not the page round it; once all are built, it is as if they had been built at once.
///
/// [builder] is given how many to build now. A [GraduallyController] can ask for all of them at once (to jump to one
/// further down, say), and says when they are.
class Gradually extends StatefulWidget {
  const Gradually({super.key, required this.total, required this.builder, this.controller});

  final int total;
  final Widget Function(int count) builder;
  final GraduallyController? controller;

  /// How many the first frame builds, and how many each frame after adds.
  static const first = 8;
  static const perFrame = 12;

  @override
  State<Gradually> createState() => _GraduallyState();
}

/// Asks a [Gradually] to build all it has at once.
class GraduallyController {
  _GraduallyState? _state;

  /// Builds all of them now; [then] runs once they are laid out.
  void buildAll({VoidCallback? then}) => _state?._all(then);
}

class _GraduallyState extends State<Gradually> {
  int _built = Gradually.first;
  bool _waiting = false;

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
  }

  @override
  void didUpdateWidget(Gradually old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      if (old.controller?._state == this) old.controller!._state = null;
      widget.controller?._state = this;
    }
  }

  @override
  void dispose() {
    if (widget.controller?._state == this) widget.controller!._state = null;
    super.dispose();
  }

  void _all(VoidCallback? then) {
    if (_built >= widget.total) {
      then?.call();
      return;
    }
    setState(() => _built = widget.total);
    if (then != null) WidgetsBinding.instance.addPostFrameCallback((_) => then());
  }

  @override
  Widget build(BuildContext context) {
    if (_built < widget.total && !_waiting) {
      _waiting = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _waiting = false;
        if (mounted && _built < widget.total) setState(() => _built += Gradually.perFrame);
      });
    }
    return widget.builder(_built < widget.total ? _built : widget.total);
  }
}
