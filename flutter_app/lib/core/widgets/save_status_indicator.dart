import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/autosave.dart';
import '../../shared/data/providers.dart';
import '../motion/motion.dart';

/// Whether everything is saved, shown wherever the author is. A failed save is shown in the error colour with a way
/// to try again, and stays shown until it is saved: the app never reports success that did not happen.
class SaveStatusIndicator extends ConsumerWidget {
  const SaveStatusIndicator({super.key, this.compact = false});

  /// Icon only (with the words as a tooltip), except when a save failed.
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(saveStatusProvider);
    final scheme = Theme.of(context).colorScheme;
    final failed = status.state == SaveState.failed;
    final color = failed ? scheme.error : scheme.onSurfaceVariant;
    final icon = switch (status.state) {
      SaveState.saved => Icons.cloud_done_outlined,
      SaveState.pending => Icons.edit_outlined,
      SaveState.saving => Icons.sync,
      SaveState.failed => Icons.error_outline,
    };
    final detail = failed
        ? '${status.label}: ${status.error ?? 'unknown problem'}. It will be tried again.'
        : status.label;
    final showLabel = !compact || failed;
    // A DYNAMIC BUTTON (dqnamo's Kitchen, on Motion's springs): one pill that changes its words in place. The new
    // words rise in as the old leave, the pill settles to their width on a spring, and the sign turns to the next.
    final short = Motion.of(context, Motion.short);
    final medium = Motion.of(context, Motion.medium);
    Widget rise(Widget child, Animation<double> a) => FadeTransition(
      opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0, 0.45),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
        child: child,
      ),
    );
    final pill = AnimatedContainer(
      duration: short,
      curve: Curves.easeOut,
      padding: EdgeInsets.symmetric(horizontal: showLabel ? 10 : 6, vertical: 4),
      decoration: BoxDecoration(
        // A tint of its own words' colour: it reads on the page and on the leather of the rail alike.
        color: color.withValues(alpha: failed ? 0.14 : 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: failed ? 0.6 : 0.25)),
      ),
      child: _Settling(
        duration: medium,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: short,
              layoutBuilder: (current, previous) => current ?? const SizedBox.shrink(),
              transitionBuilder: (child, a) => RotationTransition(
                turns: Tween(begin: -0.25, end: 0.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
                child: FadeTransition(opacity: a, child: child),
              ),
              child: Icon(icon, key: ValueKey(icon), size: 18, color: color),
            ),
            if (showLabel) ...[
              const SizedBox(width: 6),
              Flexible(
                child: ClipRect(
                  child: AnimatedSwitcher(
                    duration: short,
                    // The words that leave go at once (a failed save never shows "Saved" fading): the new rise in.
                    layoutBuilder: (current, previous) => current ?? const SizedBox.shrink(),
                    transitionBuilder: (child, a) => rise(child, a),
                    child: Text(
                      status.label,
                      key: ValueKey(status.label),
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: color),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
    return Semantics(
      liveRegion: true,
      label: detail,
      child: ExcludeSemantics(
        child: Tooltip(
          message: detail,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(child: pill),
              if (failed)
                TextButton(onPressed: () => ref.read(saveControllerProvider).retry(), child: const Text('Retry')),
            ],
          ),
        ),
      ),
    );
  }
}

/// Settles to its child's size on a spring; with less motion asked for, is its size at once (an `AnimatedSize` of no
/// duration may not be laid out).
class _Settling extends StatelessWidget {
  const _Settling({required this.duration, required this.child});
  final Duration duration;
  final Widget child;

  @override
  Widget build(BuildContext context) => duration == Duration.zero
      ? child
      : AnimatedSize(
          duration: duration,
          curve: Motion.settle,
          alignment: AlignmentDirectional.centerStart,
          child: child,
        );
}
