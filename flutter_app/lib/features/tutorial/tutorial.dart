import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/data/providers.dart';
import '../characters/widgets/vault.dart';
import '../workspace/open_novel.dart';
import 'spotlight.dart';
import 'topics.dart';
import 'your_path.dart';

const _key = 'tutorial.shown';

/// Whether the Tutorial button is showing. Kept on this device: it is a preference, not part of any novel.
class TutorialShown extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(_key) != false;

  void set(bool shown) {
    ref.read(settingsStoreProvider).write(_key, shown);
    state = shown;
  }
}

final tutorialShownProvider = NotifierProvider<TutorialShown, bool>(TutorialShown.new);

/// The switch that shows or hides the Tutorial button: in the tutorial itself, and in Settings.
class TutorialSwitch extends ConsumerWidget {
  const TutorialSwitch({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    title: const Text('Show the Tutorial button'),
    value: ref.watch(tutorialShownProvider),
    onChanged: (v) => ref.read(tutorialShownProvider.notifier).set(v),
  );
}

/// Opens the tutorial on the lesson for the page in view. It only explains: nothing in it changes a novel.
///
/// The lesson for this page can point at its buttons on the page itself (`spotlight.dart`): which of them are on the
/// screen is read before the tutorial covers it, and again as it closes for the tour.
Future<void> showTutorial(BuildContext context) async {
  final here = topicFor(GoRouter.of(context).routerDelegate.currentConfiguration.uri.toString());
  final pointable = tourOf(here).isNotEmpty;
  final tour = await showDialog<bool>(
    context: context,
    builder: (context) => KeyedSubtree(
      key: tutorialMark,
      child: WindowSize.of(context) == WindowSize.compact
          ? Dialog.fullscreen(
              child: _Tutorial(here: here, pointable: pointable),
            )
          : Dialog(
              alignment: Alignment.centerRight,
              insetPadding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480, maxHeight: 760),
                child: _Tutorial(here: here, pointable: pointable),
              ),
            ),
    ),
  );
  if (tour != true || !context.mounted) return;
  showSpotlight(context, here, tourOf(here));
}

class _Tutorial extends ConsumerStatefulWidget {
  const _Tutorial({required this.here, required this.pointable});
  final Topic here;

  /// Whether the page in view shows any of the buttons the lesson for it names.
  final bool pointable;

  @override
  ConsumerState<_Tutorial> createState() => _TutorialState();
}

class _TutorialState extends ConsumerState<_Tutorial> {
  late var _index = tutorialTopics.indexOf(widget.here);
  var _listing = false;
  final _find = TextEditingController();

  /// What the library shows has been tried, read once as the tutorial opens (`your_path.dart`).
  late final YourPath _path = yourPath(
    store: ref.read(novelStoreProvider),
    settings: ref.read(settingsStoreProvider),
    novelIds: [for (final n in ref.read(libraryProvider)) n.id],
  );

  @override
  void dispose() {
    _find.dispose();
    super.dispose();
  }

  void _show(Topic t) => setState(() {
    _index = tutorialTopics.indexOf(t);
    _listing = false;
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant);
    final topic = tutorialTopics[_index];
    final shown = ref.watch(tutorialShownProvider);
    final novelOpen = ref.watch(openNovelProvider) != null;
    final path = topic.path;
    final needsNovel = path != null && (Destination.forLocation(path)?.needsNovel ?? false);
    final last = _index == tutorialTopics.length - 1;

    // THE LESSON as a page of the book: its group over its name in the book's capitals, what it is for in the book's
    // italic, the steps numbered in rings down the margin, and the example framed as a thing to try.
    final lesson = ListView(
      key: const ValueKey('tutorial-lesson'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      children: [
        Text(topic.group.toUpperCase(), style: vaultHeading(context, size: 12, color: scheme.onSurfaceVariant)),
        const SizedBox(height: 4),
        Semantics(header: true, child: Text(topic.title, style: vaultHeading(context, size: 24, weight: 700))),
        if (_path.tried.contains(topic.id))
          _PathMark(icon: Icons.check_circle, text: 'You have tried this already', colour: scheme.primary)
        else if (_path.next == topic)
          _PathMark(icon: Icons.flag_outlined, text: 'Next on your path', colour: scheme.primary),
        const SizedBox(height: 8),
        Text(topic.what, style: vaultText(context, size: 17, style: FontStyle.italic)),
        // On the lesson for this page: its buttons pointed out on the page itself.
        if (topic == widget.here && widget.pointable) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(true),
              icon: const Icon(Icons.highlight_alt),
              label: const Text('Show me on this page'),
            ),
          ),
        ],
        const VaultRule(),
        Semantics(header: true, child: Text('How to use it', style: vaultHeading(context, size: 15))),
        const SizedBox(height: 6),
        for (final (i, step) in topic.steps.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(child: _Step(number: i + 1)),
                const SizedBox(width: 12),
                Expanded(
                  child: Semantics(
                    label: 'Step ${i + 1}. $step',
                    excludeSemantics: true,
                    child: Text(step, style: vaultText(context, size: 16)),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 20),
        VaultFrame(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text('Example', style: vaultHeading(context, size: 13))),
              const SizedBox(height: 6),
              Text(topic.example, style: vaultText(context, size: 16, style: FontStyle.italic)),
            ],
          ),
        ),
        if (topic.where != null) ...[
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.place_outlined, size: 18, color: scheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(child: Text('Where: ${topic.where}', style: muted)),
            ],
          ),
        ],
        if (path != null && topic != widget.here) ...[
          const SizedBox(height: 14),
          if (needsNovel && !novelOpen)
            Text('Open a novel to try this.', style: muted)
          else
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  GoRouter.of(context).go(path);
                },
                icon: const Icon(Icons.arrow_forward),
                label: const Text('Take me there'),
              ),
            ),
        ],
      ],
    );

    // ALL TOPICS as the tutorial's contents, with a line to find a lesson by any word in it.
    final words = _find.text.trim().toLowerCase();
    bool fits(Topic t) =>
        words.isEmpty || [t.title, t.what, ...t.steps, t.where ?? ''].join(' ').toLowerCase().contains(words);
    final found = tutorialTopics.where(fits).toList();
    final topics = ListView(
      key: const ValueKey('tutorial-topics'),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
          child: _PathCard(path: _path, onShow: _show),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: TextField(
            controller: _find,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Find a lesson',
              hintText: 'ribbon, sprint, backup…',
              prefixIcon: Icon(Icons.search),
            ),
          ),
        ),
        if (found.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 16, 8, 0),
            child: Text('No lesson mentions “${_find.text.trim()}”.', style: muted),
          ),
        for (final group in tutorialGroups)
          if (found.any((t) => t.group == group)) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 4),
              child: Semantics(header: true, child: Text(group.toUpperCase(), style: vaultHeading(context, size: 13))),
            ),
            for (final t in found.where((t) => t.group == group))
              ListTile(
                dense: true,
                selected: t == topic,
                title: Text(t.title, style: vaultText(context, size: 17, color: t == topic ? scheme.primary : null)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (t == widget.here) const Chip(label: Text('This page'), visualDensity: VisualDensity.compact),
                    if (_path.tried.contains(t.id))
                      Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Icon(Icons.check_circle, size: 20, color: scheme.primary, semanticLabel: 'Tried'),
                      )
                    else if (_path.next == t)
                      Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Icon(Icons.flag_outlined, size: 20, color: scheme.primary, semanticLabel: 'Next to try'),
                      ),
                  ],
                ),
                onTap: () => _show(t),
              ),
          ],
      ],
    );

    return Semantics(
      label: 'Tutorial',
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 8, 6),
            // Close stays at the head's right end; the rest wraps beside it at large text sizes.
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    children: [
                      Text('Tutorial', style: vaultHeading(context, size: 17, weight: 700)),
                      Text('Lesson ${_index + 1} of ${tutorialTopics.length}', style: muted),
                      TextButton(
                        onPressed: () => setState(() => _listing = !_listing),
                        child: Text(_listing ? 'Back to the lesson' : 'All topics'),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close the tutorial',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          // How far through the lessons this one is.
          ExcludeSemantics(
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: (_index + 1) / tutorialTopics.length),
              duration: const Duration(milliseconds: 300),
              builder: (context, v, _) => LinearProgressIndicator(
                value: v,
                minHeight: 3,
                backgroundColor: scheme.primary.withValues(alpha: 0.15),
              ),
            ),
          ),
          Expanded(child: _listing ? topics : lesson),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: _index == 0 ? null : () => _show(tutorialTopics[_index - 1]),
                      child: const Text('← Back'),
                    ),
                    FilledButton(
                      onPressed: last ? null : () => _show(tutorialTopics[_index + 1]),
                      child: Text(
                        'Next →',
                        semanticsLabel: last ? 'Next' : 'Next: ${tutorialTopics[_index + 1].title}',
                      ),
                    ),
                  ],
                ),
                // What comes next, so walking on is not a guess.
                if (!last && !_listing)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Next: ${tutorialTopics[_index + 1].title}', textAlign: TextAlign.end, style: muted),
                  ),
                const TutorialSwitch(),
                if (!shown)
                  Text(
                    'The button is gone from the rail, the Library and More. Open the tutorial, or bring the button '
                    'back, from Settings.',
                    style: muted,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A step's number in a ring, in the accent.
class _Step extends StatelessWidget {
  const _Step({required this.number});
  final int number;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: scheme.primary),
        color: scheme.primary.withValues(alpha: 0.08),
      ),
      child: Text('$number', style: vaultHeading(context, size: 13, weight: 700)),
    );
  }
}

/// A line under a lesson's name: tried already, or the next on the path.
class _PathMark extends StatelessWidget {
  const _PathMark({required this.icon, required this.text, required this.colour});
  final IconData icon;
  final String text;
  final Color colour;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 6),
    child: Row(
      children: [
        Icon(icon, size: 18, color: colour),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            text,
            style: vaultText(context, size: 15, color: colour, style: FontStyle.italic),
          ),
        ),
      ],
    ),
  );
}

/// YOUR PATH at the head of the contents: a ring filling as lessons are put to use, how many of them, and the next one
/// worth trying, with Show me to open it.
class _PathCard extends StatelessWidget {
  const _PathCard({required this.path, required this.onShow});
  final YourPath path;
  final void Function(Topic topic) onShow;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tried = path.counted.where(path.tried.contains).length;
    final of = path.counted.length;
    final next = path.next;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: SizedBox(
              width: 56,
              height: 56,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: of == 0 ? 0 : tried / of),
                duration: const Duration(milliseconds: 900),
                curve: Curves.easeOutCubic,
                builder: (context, v, _) => Stack(
                  fit: StackFit.expand,
                  children: [
                    CircularProgressIndicator(
                      value: v,
                      strokeWidth: 5,
                      backgroundColor: scheme.primary.withValues(alpha: 0.15),
                    ),
                    Center(child: Text('$tried', style: vaultHeading(context, size: 18, weight: 700))),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Your path', style: vaultHeading(context, size: 16, weight: 700))),
                const SizedBox(height: 2),
                Text(
                  '$tried of $of lessons tried in your books',
                  style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 6),
                if (next == null)
                  Text('Every lesson on the path is tried.', style: vaultText(context, size: 15))
                else ...[
                  Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(text: 'Next to try: '),
                        TextSpan(
                          text: next.title,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                    style: vaultText(context, size: 16),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => onShow(next),
                      icon: const Icon(Icons.flag_outlined),
                      label: const Text('Show me'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
