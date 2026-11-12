import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import '../characters/widgets/vault.dart';
import 'margin.dart';

/// A way forward when the writing stops: what kind of nudge it is ("Your plan", "Your last line", "A move"), and the
/// nudge itself. Prompts to think with; nothing is ever written for the author.
typedef Nudge = ({String kind, String text});

/// How long the page sits still, with the caret on it, before a nudge is offered.
const stuckAfter = Duration(seconds: 40);

/// Moves writers make when a scene stalls. Shuffled by the day, after the story's own.
const craftNudges = [
  'Make it worse: what is the next thing that could go wrong, right now?',
  'Cut to the moment after. Skip what the reader can imagine.',
  'Someone says the wrong thing, or the true thing at the wrong time.',
  'Add one sound from outside the room.',
  'Give someone a small lie to tell.',
  'Write the scene’s last line now, then find the way to it.',
  'A secret almost slips. Who notices?',
  'Slow down: one gesture, in more detail than feels right.',
  'Change the light, the weather, or the time. What does it show?',
  'What does the point-of-view character refuse to think about?',
];

/// The nudges for a page, the story's own first: the next of the chapter's planned beats, what the chapter is for, the
/// threads that move here, who is on the page, and how the last line ends; then the moves, in an order that changes
/// with [seed] (the day), so the same ones do not always come first.
List<Nudge> nudgesFor(MarginNotes notes, {required String lastLine, required int seed}) {
  final out = <Nudge>[];
  final line = lastLine.trim();
  if (line.isNotEmpty) {
    if (RegExp(r'[”"]\s*$').hasMatch(line) || RegExp(r'[”"][^“"”]*\b(said|asked)\b[^“"”]*$').hasMatch(line)) {
      out.add((kind: 'Your last line', text: 'Someone just spoke. What is said back, or pointedly not said?'));
    } else if (RegExp(r'\?[”"’]?\s*$').hasMatch(line)) {
      out.add((kind: 'Your last line', text: 'A question hangs there. Answer it, or have someone avoid it.'));
    } else if (RegExp(r'(…|\.\.\.|—|–)\s*$').hasMatch(line)) {
      out.add((kind: 'Your last line', text: 'You stopped mid-thought. Finish the sentence badly, then keep going.'));
    }
  }
  if (notes.beats.isNotEmpty) {
    out.add((kind: 'Your plan', text: 'A beat for this chapter: “${notes.beats.first}”. Write towards it.'));
    for (final b in notes.beats.skip(1).take(2)) {
      out.add((kind: 'Your plan', text: 'Later in the plan: “$b”. What has to happen first?'));
    }
  }
  if (notes.objective.isNotEmpty) {
    out.add((kind: 'Your plan', text: 'This chapter is for: “${notes.objective}”. What is the next step towards it?'));
  }
  for (final t in notes.threads.take(2)) {
    final how = t.development.trim().isEmpty ? '' : ': “${t.development.trim()}”';
    out.add((kind: 'A thread', text: '“${t.title}” moves here$how. Let it surface in a line.'));
  }
  final pov = notes.people.where((p) => p.pov).firstOrNull;
  if (pov != null) {
    out.add((kind: 'Who is here', text: 'Through ${pov.name}’s eyes: one thing only they would notice right now.'));
  }
  for (final p in notes.people.where((p) => !p.pov).take(2)) {
    out.add((kind: 'Who is here', text: 'What does ${p.name} want in this moment, and what is in the way?'));
  }
  if (notes.people.isEmpty && notes.mentioned.isNotEmpty) {
    out.add((kind: 'Who is here', text: '${notes.mentioned.first} is meant to come up. Bring them in sideways.'));
  }
  final moves = [...craftNudges]..shuffle(math.Random(seed));
  out.addAll([for (final m in moves) (kind: 'A move', text: m)]);
  return out;
}

/// Whether nudges are offered, kept on this device (on unless turned off).
const nudgesKey = 'write.nudges';

class NudgesOn extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(nudgesKey) != false;

  void set(bool on) {
    state = on;
    ref.read(settingsStoreProvider).write(nudgesKey, on);
  }
}

final nudgesProvider = NotifierProvider<NudgesOn, bool>(NudgesOn.new);

/// Watches a page for the writing stopping: [stuck] turns true once nothing has changed for [stuckAfter] while
/// [focused] says the caret is on the page, and false again with the next key, move of the caret, or loss of focus.
class StuckWatch extends ChangeNotifier {
  StuckWatch({this.after = stuckAfter, required this.focused});

  final Duration after;
  final bool Function() focused;
  Timer? _timer;
  bool _stuck = false;

  bool get stuck => _stuck;

  /// Something happened on the page: the wait starts again.
  void stirred() {
    _timer?.cancel();
    if (_stuck) {
      _stuck = false;
      notifyListeners();
    }
    if (focused()) _timer = Timer(after, _still);
  }

  void _still() {
    if (!focused() || _stuck) return;
    _stuck = true;
    notifyListeners();
  }

  /// Put away for now: offered again only after another whole wait.
  void dismiss() => stirred();

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

/// STUCK?: once the page has sat still a while with the caret on it, a small "Stuck?" fades in at its corner. A
/// press opens a card with one nudge (from the story's own plan first, then a writer's move), another a press away;
/// "Back to it" puts the caret back on the page. The next key puts it away. It never writes a word.
class StuckNudge extends ConsumerStatefulWidget {
  const StuckNudge({super.key, required this.watch, required this.nudges, required this.onBack});

  final StuckWatch watch;

  /// Read as the card opens, so they follow the page as it is then.
  final List<Nudge> Function() nudges;

  /// Back to the page: the caret where it was.
  final VoidCallback onBack;

  @override
  ConsumerState<StuckNudge> createState() => _StuckNudgeState();
}

class _StuckNudgeState extends ConsumerState<StuckNudge> {
  List<Nudge>? _open;
  int _at = 0;

  @override
  void initState() {
    super.initState();
    widget.watch.addListener(_changed);
  }

  @override
  void didUpdateWidget(StuckNudge old) {
    super.didUpdateWidget(old);
    if (!identical(old.watch, widget.watch)) {
      old.watch.removeListener(_changed);
      widget.watch.addListener(_changed);
    }
  }

  @override
  void dispose() {
    widget.watch.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (!mounted) return;
    setState(() {
      if (!widget.watch.stuck) _open = null;
    });
  }

  void _back() {
    setState(() => _open = null);
    widget.watch.dismiss();
    widget.onBack();
  }

  @override
  Widget build(BuildContext context) {
    final on = ref.watch(nudgesProvider);
    final scheme = Theme.of(context).colorScheme;
    final open = _open;
    final Widget child;
    if (!on || (!widget.watch.stuck && open == null)) {
      child = const SizedBox.shrink(key: ValueKey('none'));
    } else if (open == null) {
      child = ActionChip(
        key: const ValueKey('chip'),
        avatar: Icon(Icons.tips_and_updates_outlined, size: 18, color: scheme.primary),
        label: const Text('Stuck? A nudge'),
        backgroundColor: scheme.surfaceContainerHigh,
        side: BorderSide(color: scheme.primary.withValues(alpha: 0.6)),
        elevation: 3,
        onPressed: () => setState(() {
          _open = widget.nudges();
          _at = 0;
        }),
      );
    } else {
      final nudge = open[_at % open.length];
      child = ConstrainedBox(
        key: const ValueKey('card'),
        constraints: const BoxConstraints(maxWidth: 360),
        child: Material(
          elevation: 6,
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.tips_and_updates, size: 18, color: scheme.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        nudge.kind.toUpperCase(),
                        style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Don’t offer nudges',
                      onPressed: () {
                        ref.read(nudgesProvider.notifier).set(false);
                        _back();
                      },
                      icon: const Icon(Icons.notifications_off_outlined, size: 20),
                    ),
                  ],
                ),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: Text(
                    nudge.text,
                    key: ValueKey(_at),
                    style: vaultText(context, size: 17, style: FontStyle.italic),
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  alignment: WrapAlignment.end,
                  children: [
                    TextButton.icon(
                      onPressed: () => setState(() => _at++),
                      icon: const Icon(Icons.shuffle, size: 18),
                      label: const Text('Another'),
                    ),
                    TextButton.icon(
                      onPressed: _back,
                      icon: const Icon(Icons.edit_note, size: 18),
                      label: const Text('Back to it'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 350),
      transitionBuilder: (c, a) => FadeTransition(
        opacity: a,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.25), end: Offset.zero).animate(a),
          child: c,
        ),
      ),
      child: child,
    );
  }
}
