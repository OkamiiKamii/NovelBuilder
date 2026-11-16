import 'package:flutter/widgets.dart';

/// ROWS BUILT AS THEY COME INTO VIEW: [count] rows, each [height] tall, in a page that scrolls as a whole (not a list
/// of its own: a list is lazy only when it is the thing that scrolls). Only the rows within a screen of what is seen
/// are built; the rest is room of the right size, so the page is as long and scrolls as it always did. As the page
/// scrolls, the rows coming into view are built and those far out of it let go.
///
/// For long runs of rows in a page with other things above and below: the book's chapters beside its events, a table
/// of every record of a kind. A row keeps its state while it stays built (each is keyed by its place).
class InViewRows extends StatefulWidget {
  const InViewRows({super.key, required this.count, required this.height, required this.builder});

  final int count;
  final double height;
  final Widget Function(BuildContext context, int index) builder;

  @override
  State<InViewRows> createState() => _InViewRowsState();
}

class _InViewRowsState extends State<InViewRows> {
  ScrollableState? _scrollable;

  /// The rows built: from [_from] up to (not including) [_to]. Until the page is laid out, a screenful or two from the
  /// top.
  int _from = 0;
  int _to = 0;
  bool _placed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scrollable = Scrollable.maybeOf(context, axis: Axis.vertical);
    if (scrollable != _scrollable) {
      _scrollable?.position.removeListener(_follow);
      _scrollable = scrollable?..position.addListener(_follow);
    }
    if (!_placed) _to = (MediaQuery.maybeSizeOf(context)?.height ?? 800) * 2 ~/ widget.height + 1;
  }

  @override
  void dispose() {
    _scrollable?.position.removeListener(_follow);
    super.dispose();
  }

  bool _waiting = false;

  /// The page scrolled: where the rows stand is known only once it is laid out again, so they are measured after the
  /// frame (measured as the scroll is heard, they would be where they were, one step behind, and stay so when it
  /// stops).
  void _follow() {
    if (_waiting) return;
    _waiting = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _waiting = false;
      _measure();
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  /// Which rows are near what is seen now, worked out from where these rows stand in the page that scrolls.
  void _measure() {
    if (!mounted) return;
    final box = context.findRenderObject();
    final view = _scrollable?.context.findRenderObject();
    if (box is! RenderBox || !box.hasSize || !box.attached || view is! RenderBox || !view.hasSize) return;
    final top = box.localToGlobal(Offset.zero, ancestor: view).dy;
    final seen = view.size.height;
    final h = widget.height;
    final from = ((-top - seen) / h).floor().clamp(0, widget.count);
    final to = ((-top + seen * 2) / h).ceil().clamp(0, widget.count);
    _placed = true;
    if (from != _from || to != _to) {
      setState(() {
        _from = from;
        _to = to;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // After every layout: something above may have grown or gone, moving these rows without a scroll.
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    final h = widget.height;
    // In nothing that scrolls, every row is seen: all are built.
    final to = _scrollable == null ? widget.count : _to.clamp(0, widget.count);
    final from = _scrollable == null ? 0 : _from.clamp(0, to);
    return SizedBox(
      height: widget.count * h,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = from; i < to; i++)
            Positioned(
              key: ValueKey<int>(i),
              top: i * h,
              left: 0,
              right: 0,
              height: h,
              child: widget.builder(context, i),
            ),
        ],
      ),
    );
  }
}
