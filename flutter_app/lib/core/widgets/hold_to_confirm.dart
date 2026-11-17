import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// HOLD TO CONFIRM (dqnamo's Kitchen): what cannot be taken back is done by holding its button, not by a press made by
/// reflex. Held, the button fills from its leading edge, and when full it is done; let go before, the fill drains back
/// and the button says to hold. Held from the keyboard too (Enter or Space, kept down). For a screen reader, where a
/// hold is not to hand, one press does it, as any button.
class HoldToConfirm extends StatefulWidget {
  const HoldToConfirm({
    super.key,
    required this.label,
    required this.onConfirmed,
    this.hold = const Duration(milliseconds: 900),
  });

  /// What it does: "Delete", "Remove picture".
  final String label;
  final VoidCallback onConfirmed;

  /// How long it is held.
  final Duration hold;

  @override
  State<HoldToConfirm> createState() => _HoldToConfirmState();
}

class _HoldToConfirmState extends State<HoldToConfirm> with SingleTickerProviderStateMixin {
  late final _fill = AnimationController(vsync: this, duration: widget.hold)..addStatusListener(_filled);
  bool _told = false;
  bool _done = false;

  void _filled(AnimationStatus s) {
    if (s != AnimationStatus.completed || _done) return;
    _done = true;
    HapticFeedback.mediumImpact();
    widget.onConfirmed();
  }

  void _press() {
    if (_done) return;
    _fill.duration = widget.hold;
    _fill.forward();
  }

  void _let() {
    if (_done || _fill.isCompleted) return;
    // Let go: the fill stops (even one not begun: a press let go before its first frame does nothing) and drains.
    _fill.stop();
    if (_fill.value > 0) {
      _fill.duration = widget.hold ~/ 3;
      _fill.reverse();
    }
    if (!_told) setState(() => _told = true);
  }

  @override
  void dispose() {
    _fill.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final reader = MediaQuery.accessibleNavigationOf(context);
    final words = _told && !reader ? 'Hold to ${widget.label.toLowerCase()}' : widget.label;
    // Lettered as the app's other buttons are.
    final theme = Theme.of(context);
    final style = (theme.filledButtonTheme.style?.textStyle?.resolve(const {}) ?? theme.textTheme.labelLarge)?.copyWith(
      color: scheme.onError,
    );
    return Semantics(
      button: true,
      label: widget.label,
      hint: reader ? null : 'Hold to confirm',
      onTap: reader ? widget.onConfirmed : null,
      excludeSemantics: true,
      child: Focus(
        onKeyEvent: (node, event) {
          final key = event.logicalKey;
          if (key != LogicalKeyboardKey.enter && key != LogicalKeyboardKey.space) return KeyEventResult.ignored;
          if (event is KeyDownEvent) {
            reader ? widget.onConfirmed() : _press();
          } else if (event is KeyUpEvent) {
            _let();
          }
          return KeyEventResult.handled;
        },
        child: Builder(
          builder: (context) {
            final focused = Focus.of(context).hasFocus;
            // The fill starts as the finger touches (a tap would wait a moment to be sure), and drains as it lifts.
            return Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: reader ? null : (_) => _press(),
              onPointerUp: reader ? null : (_) => _let(),
              onPointerCancel: reader ? null : (_) => _let(),
              child: GestureDetector(
                onTap: reader ? widget.onConfirmed : null,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: scheme.error,
                        border: focused ? Border.all(color: scheme.onSurface, width: 2) : null,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Stack(
                        children: [
                          // The fill, from the leading edge, as it is held.
                          Positioned.fill(
                            child: AnimatedBuilder(
                              animation: _fill,
                              builder: (context, _) => FractionallySizedBox(
                                alignment: AlignmentDirectional.centerStart,
                                widthFactor: _fill.value,
                                child: ColoredBox(color: Colors.black.withValues(alpha: 0.28)),
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.touch_app_outlined, size: 18, color: scheme.onError),
                                const SizedBox(width: 8),
                                Flexible(
                                  child: AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 180),
                                    child: Text(words, key: ValueKey(words), style: style, textAlign: TextAlign.center),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
