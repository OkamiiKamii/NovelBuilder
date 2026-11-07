import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/autosave.dart';
import '../../shared/data/providers.dart';

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
    final label = Text(
      status.label,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: color),
      overflow: TextOverflow.ellipsis,
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
              Icon(icon, size: 18, color: color),
              if (!compact || failed) ...[const SizedBox(width: 6), Flexible(child: label)],
              if (failed)
                TextButton(onPressed: () => ref.read(saveControllerProvider).retry(), child: const Text('Retry')),
            ],
          ),
        ),
      ),
    );
  }
}
