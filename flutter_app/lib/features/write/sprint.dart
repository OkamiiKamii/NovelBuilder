import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/providers.dart';
import '../characters/widgets/vault.dart';
import 'writing_prefs.dart';

/// WRITING SPRINTS: a stretch of time to write in without stopping. The author picks a length, the desk clears into
/// focus mode, a ring of time runs out beside the words added in the sprint, and when it ends a card says what was
/// written. Words are counted from the chapters themselves, as the meter's "this session" is (net: deleting counts
/// against), across every chapter written in during the sprint. Nothing is stored but the best sprint on this device
/// (`write.bestSprint`, in the device's settings); a sprint is for the moment, like focus mode.

/// The lengths offered, in minutes.
const sprintLengths = [10, 15, 25, 45];

const bestSprintKey = 'write.bestSprint';

/// A sprint under way: its length, the seconds gone, and for each chapter written in, its words when it joined the
/// sprint ([bases]) and now ([counts]). Leaving a chapter and coming back keeps its first count, so nothing is lost or
/// counted twice.
typedef Sprint = ({int minutes, int elapsed, Map<String, int> bases, Map<String, int> counts});

/// The words a sprint has added, over every chapter written in.
int sprintWords(Sprint s) => s.counts.entries.fold(0, (sum, e) => sum + e.value - (s.bases[e.key] ?? e.value));

/// What a finished (or stopped) sprint came to. [best] when it is the most words in a sprint on this device.
typedef SprintResult = ({int words, int seconds, int minutes, bool finished, bool best});

class SprintNotifier extends Notifier<Sprint?> {
  Timer? _tick;

  @override
  Sprint? build() {
    ref.onDispose(() => _tick?.cancel());
    return null;
  }

  void start(int minutes) {
    _tick?.cancel();
    ref.read(sprintResultProvider.notifier).show(null);
    state = (minutes: minutes, elapsed: 0, bases: const {}, counts: const {});
    // Counted in seconds that pass, so the ring and the end follow the timer itself.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      final s = state;
      if (s == null) return;
      final elapsed = s.elapsed + 1;
      if (elapsed >= s.minutes * 60) {
        _finish(finished: true, elapsed: elapsed);
      } else {
        state = (minutes: s.minutes, elapsed: elapsed, bases: s.bases, counts: s.counts);
      }
    });
  }

  /// A chapter's words now. Its first report during the sprint is where it starts from.
  void report(String nodeId, int words) {
    final s = state;
    if (s == null || s.counts[nodeId] == words) return;
    state = (
      minutes: s.minutes,
      elapsed: s.elapsed,
      bases: s.bases.containsKey(nodeId) ? s.bases : {...s.bases, nodeId: words},
      counts: {...s.counts, nodeId: words},
    );
  }

  /// Stopped early. Under a minute in, nothing is said; after that, what was written.
  void stop() {
    final s = state;
    if (s == null) return;
    if (s.elapsed < 60) {
      _tick?.cancel();
      state = null;
      ref.read(focusModeProvider.notifier).set(false);
    } else {
      _finish(finished: false, elapsed: s.elapsed);
    }
  }

  void _finish({required bool finished, required int elapsed}) {
    _tick?.cancel();
    final s = state!;
    final words = sprintWords(s);
    final settings = ref.read(settingsStoreProvider);
    final stored = settings.read(bestSprintKey);
    final before = stored is Map ? (stored['words'] is int ? stored['words'] as int : 0) : 0;
    final best = words > 0 && words > before;
    if (best) settings.write(bestSprintKey, {'words': words, 'seconds': elapsed});
    state = null;
    ref.read(focusModeProvider.notifier).set(false);
    ref.read(sprintResultProvider.notifier).show((
      words: words,
      seconds: elapsed,
      minutes: s.minutes,
      finished: finished,
      best: best,
    ));
  }
}

final sprintProvider = NotifierProvider<SprintNotifier, Sprint?>(SprintNotifier.new);

class SprintResultNotifier extends Notifier<SprintResult?> {
  @override
  SprintResult? build() => null;

  void show(SprintResult? result) => state = result;
}

final sprintResultProvider = NotifierProvider<SprintResultNotifier, SprintResult?>(SprintResultNotifier.new);

/// "Sprint": a press that offers the lengths, then starts one and clears the desk.
class SprintButton extends ConsumerWidget {
  const SprintButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => PopupMenuButton<int>(
    tooltip: 'Start a writing sprint',
    useRootNavigator: true,
    onSelected: (minutes) {
      ref.read(sprintProvider.notifier).start(minutes);
      ref.read(focusModeProvider.notifier).set(true);
    },
    itemBuilder: (_) => [for (final m in sprintLengths) PopupMenuItem(value: m, child: Text('Sprint for $m minutes'))],
    child: ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.timer_outlined, size: 20, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 6),
            Text(
              'Sprint',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.primary),
            ),
          ],
        ),
      ),
    ),
  );
}

String clockOf(int seconds) => '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

/// The sprint under way, at the foot of the page: the ring of time left, the clock, the words added, and Stop.
class SprintBar extends ConsumerWidget {
  const SprintBar({super.key, required this.sprint});
  final Sprint sprint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final total = sprint.minutes * 60;
    final left = total - sprint.elapsed;
    final words = sprintWords(sprint);
    return Material(
      color: scheme.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            children: [
              SizedBox.square(
                dimension: 30,
                child: CircularProgressIndicator(
                  // What is left of the time: the ring empties as the sprint runs.
                  value: 1 - sprint.elapsed / total,
                  strokeWidth: 4,
                  backgroundColor: scheme.outlineVariant,
                  semanticsLabel: 'Time left in the sprint',
                  semanticsValue: '${clockOf(left)} of ${sprint.minutes} minutes',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Wrap(
                  spacing: 14,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      clockOf(left),
                      style: vaultHeading(
                        context,
                        size: 18,
                        weight: 700,
                        color: scheme.onSurface,
                      ).copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                    Text(
                      '${words < 0 ? '−' : '+'}${formatNumber(words.abs())} ${words.abs() == 1 ? 'word' : 'words'} '
                      'this sprint',
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              TextButton(onPressed: () => ref.read(sprintProvider.notifier).stop(), child: const Text('Stop')),
            ],
          ),
        ),
      ),
    );
  }
}

/// The sprint done: what was written, in how long, at what pace, and whether it is the best yet; another, or done.
class SprintCard extends ConsumerWidget {
  const SprintCard({super.key, required this.result});
  final SprintResult result;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final minutes = (result.seconds / 60).round().clamp(1, 1 << 30);
    // A pace only once there is enough to make one: "1 word a minute" says nothing.
    final pace = result.words >= 50 ? (result.words / (result.seconds / 60)).round() : 0;
    final words = result.words;
    return Material(
      color: scheme.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.primary.withValues(alpha: 0.6))),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
          child: Semantics(
            container: true,
            liveRegion: true,
            child: Wrap(
              spacing: 18,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.finished ? 'Sprint complete' : 'Sprint stopped',
                      style: vaultHeading(context, size: 12),
                    ),
                    Text(
                      '${words < 0 ? '−' : '+'}${formatNumber(words.abs())} ${words.abs() == 1 ? 'word' : 'words'}',
                      style: vaultHeading(context, size: 26, weight: 700, color: scheme.onSurface),
                    ),
                  ],
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.finished
                          ? 'in ${plural(result.minutes, 'minute')}'
                          : 'in ${plural(minutes, 'minute')} of ${result.minutes}',
                      style: vaultText(context, size: 17),
                    ),
                    if (pace > 0)
                      Text(
                        '${formatNumber(pace)} ${pace == 1 ? 'word' : 'words'} a minute',
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                  ],
                ),
                if (result.best)
                  Chip(
                    avatar: Icon(Icons.emoji_events_outlined, size: 18, color: scheme.primary),
                    label: const Text('Your best sprint yet'),
                    visualDensity: VisualDensity.compact,
                  ),
                Wrap(
                  spacing: 8,
                  children: [
                    FilledButton.tonal(
                      onPressed: () {
                        ref.read(sprintProvider.notifier).start(result.minutes);
                        ref.read(focusModeProvider.notifier).set(true);
                      },
                      child: const Text('Another sprint'),
                    ),
                    TextButton(
                      onPressed: () => ref.read(sprintResultProvider.notifier).show(null),
                      child: const Text('Done'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
