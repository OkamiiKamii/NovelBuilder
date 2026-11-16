import 'package:flutter/widgets.dart';

/// PROGRESSIVELY BUILT: [total] things (cards, rows, articles), a screenful in the first frame and a handful in each
/// frame after, so a page with many of them is there at once instead of after all are built. Only this part is built
/// again as they come, not the page round it.
///
/// In a page that scrolls, only as far as the reader can see and [Gradually.ahead] screens beyond: then it waits, and
/// builds on as the page is scrolled towards the end of what is built. A world of a thousand entries builds the few
/// dozen within reach, not every one of them a frame at a time for seconds (each frame laying out all built so far).
/// In nothing that scrolls, all of them in the end.
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

  /// How many screens past the bottom of what is seen are built before it waits for a scroll.
  static const ahead = 2.0;

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
  ScrollableState? _scrollable;

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scrollable = Scrollable.maybeOf(context, axis: Axis.vertical);
    if (scrollable != _scrollable) {
      _scrollable?.position.removeListener(_more);
      _scrollable = scrollable?..position.addListener(_more);
    }
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
    _scrollable?.position.removeListener(_more);
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

  /// After the frame (when it is known where the end of what is built stands), a handful more if that end is within
  /// reach of what is seen. Asked after every build and on every scroll.
  void _more() {
    if (_waiting || _built >= widget.total) return;
    _waiting = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _waiting = false;
      if (mounted && _built < widget.total && _withinReach()) setState(() => _built += Gradually.perFrame);
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  /// Whether the end of what is built is less than [Gradually.ahead] screens below the bottom of what is seen; always,
  /// in nothing that scrolls.
  bool _withinReach() {
    final box = context.findRenderObject();
    final view = _scrollable?.context.findRenderObject();
    if (box is! RenderBox || !box.hasSize || !box.attached || view is! RenderBox || !view.hasSize) return true;
    final end = box.localToGlobal(Offset(0, box.size.height), ancestor: view).dy;
    return end < view.size.height * (1 + Gradually.ahead);
  }

  @override
  Widget build(BuildContext context) {
    _more();
    return widget.builder(_built < widget.total ? _built : widget.total);
  }
}
