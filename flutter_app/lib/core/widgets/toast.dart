import 'dart:async';

import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// TOASTS (shadcn/ui's Toast, after Sonner; on Motion's springs): what the app has to say after something is done
/// ("Deleted “Chapter 3”.", with Undo) comes in from the foot as a card, newest in front, the ones before stacked
/// behind it (three at most), and goes on its own. A card can be swiped away; one under the pointer or with focus
/// stays while it is there.
///
/// The cards stand at the foot of the page ([ToastHost], in the app's frame): above a phone's bottom bar and the
/// keyboard, under a menu or a dialog (a message never covers a menu). Said with [showToast] from anywhere in the app,
/// dialogs too. With no page to stand on (a widget shown on its own), it is said as a snack bar, as before.
class Toast {
  Toast(this.message, {this.actionLabel, this.onAction, this.duration, this.error = false});

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// How long it stays; by default 4 seconds, 6 with an action to take.
  final Duration? duration;

  /// Something did not work: marked in the error colour.
  final bool error;

  final int id = _ids++;
  static var _ids = 0;
}

/// Says [message] where the author is: as a toast, or (with no page to stand on) a snack bar.
void showToast(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
  Duration? duration,
  bool error = false,
}) => Toasts.sayer(context)(
  Toast(message, actionLabel: actionLabel, onAction: onAction, duration: duration, error: error),
);

/// The toasts being said. One for the app ([Toaster]); shown by the page's [ToastHost].
class Toasts extends ChangeNotifier {
  final _shown = <Toast>[];
  final _leaving = <int>{};
  final _timers = <int, Timer>{};
  final _held = <int>{};
  int _hosts = 0;

  List<Toast> get shown => List.unmodifiable(_shown);
  bool isLeaving(Toast t) => _leaving.contains(t.id);

  /// Whether a page is there to show them.
  bool get hosted => _hosts > 0;

  /// The toasts of the app [context] is in, if it has them.
  static Toasts? maybeOf(BuildContext context) => context.getInheritedWidgetOfExactType<_ToastsScope>()?.toasts;

  /// A way to say a toast from [context], found now: kept, it still says after an `await` that took the page away.
  static void Function(Toast) sayer(BuildContext context) {
    final toasts = maybeOf(context);
    final messenger = ScaffoldMessenger.maybeOf(context);
    void snack(Toast t) => messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(t.message),
          action: t.actionLabel == null ? null : SnackBarAction(label: t.actionLabel!, onPressed: t.onAction ?? () {}),
          persist: false,
          duration: t.duration ?? Duration(seconds: t.actionLabel == null ? 4 : 6),
        ),
      );
    return (t) => toasts != null && toasts.hosted ? toasts.say(t) : snack(t);
  }

  void say(Toast t) {
    _shown.add(t);
    // Three at most: the oldest goes.
    final standing = _shown.where((s) => !_leaving.contains(s.id)).toList();
    if (standing.length > 3) dismiss(standing.first);
    _time(t);
    notifyListeners();
  }

  void _time(Toast t) {
    _timers.remove(t.id)?.cancel();
    if (_held.contains(t.id)) return;
    _timers[t.id] = Timer(t.duration ?? Duration(seconds: t.actionLabel == null ? 4 : 6), () => dismiss(t));
  }

  /// Kept while [held] (under the pointer, or with focus), and timed again after.
  void hold(Toast t, bool held) {
    if (held) {
      _held.add(t.id);
      _timers.remove(t.id)?.cancel();
    } else {
      _held.remove(t.id);
      if (_shown.contains(t) && !_leaving.contains(t.id)) _time(t);
    }
  }

  /// Sends [t] away (it leaves, then is gone: [gone]).
  void dismiss(Toast t) {
    _timers.remove(t.id)?.cancel();
    if (!_shown.contains(t) || !_leaving.add(t.id)) return;
    notifyListeners();
  }

  /// Every toast sent away.
  void dismissAll() {
    for (final t in [..._shown]) {
      dismiss(t);
    }
  }

  void gone(Toast t) {
    _timers.remove(t.id)?.cancel();
    _shown.remove(t);
    _leaving.remove(t.id);
    _held.remove(t.id);
    notifyListeners();
  }

  @override
  void dispose() {
    for (final t in _timers.values) {
      t.cancel();
    }
    super.dispose();
  }
}

class _ToastsScope extends InheritedWidget {
  const _ToastsScope({required this.toasts, required super.child});
  final Toasts toasts;
  @override
  bool updateShouldNotify(_ToastsScope old) => old.toasts != toasts;
}

/// The app's toasts, for everything in [child] (its pages and dialogs) to say.
class Toaster extends StatefulWidget {
  const Toaster({super.key, required this.child});
  final Widget child;

  @override
  State<Toaster> createState() => _ToasterState();
}

class _ToasterState extends State<Toaster> {
  final _toasts = Toasts();

  @override
  void dispose() {
    _toasts.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _ToastsScope(toasts: _toasts, child: widget.child);
}

/// Where the toasts stand: at the foot of [child] (the page).
class ToastHost extends StatefulWidget {
  const ToastHost({super.key, required this.child});
  final Widget child;

  @override
  State<ToastHost> createState() => _ToastHostState();
}

class _ToastHostState extends State<ToastHost> {
  Toasts? _toasts;
  bool _open = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final toasts = Toasts.maybeOf(context);
    if (toasts != _toasts) {
      _toasts?._hosts--;
      toasts?._hosts++;
      _toasts = toasts;
    }
  }

  @override
  void dispose() {
    _toasts?._hosts--;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final toasts = _toasts;
    if (toasts == null) return widget.child;
    return Stack(
      children: [
        widget.child,
        ListenableBuilder(
          listenable: toasts,
          builder: (context, _) {
            final shown = toasts.shown;
            if (shown.isEmpty) return const SizedBox.shrink();
            final standing = shown.where((t) => !toasts.isLeaving(t)).toList();
            return Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Align(
                alignment: Alignment.bottomCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: MouseRegion(
                    onEnter: (_) => setState(() => _open = true),
                    onExit: (_) => setState(() => _open = false),
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.bottomCenter,
                      children: [
                        for (final t in shown)
                          _ToastCard(
                            key: ValueKey(t.id),
                            toast: t,
                            toasts: toasts,
                            // Places from the front: 0 the newest. Behind it, the others stacked, or (under the
                            // pointer) laid out above it.
                            depth: toasts.isLeaving(t) ? 0 : standing.length - 1 - standing.indexOf(t),
                            open: _open,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _ToastCard extends StatefulWidget {
  const _ToastCard({super.key, required this.toast, required this.toasts, required this.depth, required this.open});
  final Toast toast;
  final Toasts toasts;
  final int depth;
  final bool open;

  @override
  State<_ToastCard> createState() => _ToastCardState();
}

class _ToastCardState extends State<_ToastCard> with SingleTickerProviderStateMixin {
  late final _in = AnimationController(vsync: this, duration: Motion.medium);
  double _height = 64;
  final _measured = GlobalKey();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _in.duration = Motion.of(context, Motion.medium);
    if (_in.isDismissed && !widget.toasts.isLeaving(widget.toast)) _in.forward();
  }

  @override
  void didUpdateWidget(_ToastCard old) {
    super.didUpdateWidget(old);
    if (widget.toasts.isLeaving(widget.toast) && _in.status != AnimationStatus.reverse) {
      _in.duration = Motion.of(context, Motion.short);
      _in.reverse().whenCompleteOrCancel(() {
        if (mounted) widget.toasts.gone(widget.toast);
      });
    }
  }

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final size = _measured.currentContext?.size;
      if (size != null && size.height != _height && mounted) setState(() => _height = size.height);
    });
    final scheme = Theme.of(context).colorScheme;
    final t = widget.toast;
    final mark = t.error ? scheme.error : scheme.primary;
    // On a phone a card is swiped away (or goes on its own), and its words have the width: a close button only on a
    // wider screen, or for a screen reader, where a swipe is not to hand.
    final media = MediaQuery.of(context);
    final closable = media.size.width >= 600 || media.accessibleNavigation;
    final depth = widget.depth;
    // Stacked: each one further back a little higher, smaller and fainter (four back: out of sight). Laid out: one
    // above the other.
    final lift = widget.open ? depth * (_height + 8) : depth * 10.0;
    final scale = widget.open ? 1.0 : 1 - depth * 0.05;
    final fade = depth >= 3 ? 0.0 : (widget.open ? 1.0 : 1 - depth * 0.15);
    final move = Motion.of(context, Motion.medium);
    // In the app's own slip (its snack bar theme: the paper, the book's type, the accent rule along the top edge),
    // as a card.
    final slip = Theme.of(context).snackBarTheme;
    final rule = t.error ? scheme.error : (slip.shape is Border ? (slip.shape! as Border).top.color : mark);
    final card = Material(
      color: slip.backgroundColor ?? scheme.surfaceContainerHigh,
      elevation: 3,
      shadowColor: Colors.black38,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: rule, width: 2)),
        ),
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 6, closable ? 4 : 10, 6),
          child: Row(
            children: [
              if (t.error) ...[Icon(Icons.error_outline, size: 20, color: scheme.error), const SizedBox(width: 10)],
              Expanded(child: Text(t.message, style: slip.contentTextStyle ?? Theme.of(context).textTheme.bodyMedium)),
              if (t.actionLabel case final label?)
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: slip.actionTextColor),
                  onPressed: () {
                    widget.toasts.dismiss(t);
                    t.onAction?.call();
                  },
                  child: Text(label),
                ),
              if (closable)
                IconButton(
                  tooltip: 'Dismiss',
                  iconSize: 18,
                  color: slip.closeIconColor,
                  onPressed: () => widget.toasts.dismiss(t),
                  icon: const Icon(Icons.close),
                ),
            ],
          ),
        ),
      ),
    );
    final arrive = CurvedAnimation(parent: _in, curve: Motion.arrive, reverseCurve: Curves.easeIn);
    return AnimatedSlide(
      offset: Offset(0, -lift / (_height == 0 ? 1 : _height)),
      duration: move,
      curve: Motion.settle,
      child: AnimatedScale(
        scale: scale,
        alignment: Alignment.bottomCenter,
        duration: move,
        curve: Motion.settle,
        child: AnimatedOpacity(
          opacity: fade,
          duration: move,
          curve: Curves.easeOut,
          child: IgnorePointer(
            ignoring: depth > 0 && !widget.open,
            child: FadeTransition(
              opacity: CurvedAnimation(parent: _in, curve: Curves.easeOut),
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 1), end: Offset.zero).animate(arrive),
                child: Focus(
                  onFocusChange: (f) => widget.toasts.hold(t, f),
                  child: MouseRegion(
                    onEnter: (_) => widget.toasts.hold(t, true),
                    onExit: (_) => widget.toasts.hold(t, false),
                    child: Dismissible(
                      key: ValueKey('swipe-${t.id}'),
                      direction: DismissDirection.horizontal,
                      onDismissed: (_) => widget.toasts.gone(t),
                      child: Semantics(
                        liveRegion: true,
                        container: true,
                        child: KeyedSubtree(key: _measured, child: card),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
