import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/data/providers.dart';
import '../workspace/open_novel.dart';
import 'topics.dart';

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
Future<void> showTutorial(BuildContext context) {
  final here = topicFor(GoRouter.of(context).routerDelegate.currentConfiguration.uri.toString());
  return showDialog<void>(
    context: context,
    builder: (context) => WindowSize.of(context) == WindowSize.compact
        ? Dialog.fullscreen(child: _Tutorial(here: here))
        : Dialog(
            alignment: Alignment.centerRight,
            insetPadding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480, maxHeight: 760),
              child: _Tutorial(here: here),
            ),
          ),
  );
}

class _Tutorial extends ConsumerStatefulWidget {
  const _Tutorial({required this.here});
  final Topic here;

  @override
  ConsumerState<_Tutorial> createState() => _TutorialState();
}

class _TutorialState extends ConsumerState<_Tutorial> {
  late var _index = tutorialTopics.indexOf(widget.here);
  var _listing = false;

  void _show(Topic t) => setState(() {
    _index = tutorialTopics.indexOf(t);
    _listing = false;
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final topic = tutorialTopics[_index];
    final shown = ref.watch(tutorialShownProvider);
    final novelOpen = ref.watch(openNovelProvider) != null;
    final path = topic.path;
    final needsNovel = path != null && (Destination.forLocation(path)?.needsNovel ?? false);

    final lesson = ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      children: [
        Text(topic.group, style: muted),
        Semantics(header: true, child: Text(topic.title, style: theme.textTheme.headlineSmall)),
        const SizedBox(height: 8),
        Text(topic.what),
        const SizedBox(height: 16),
        Semantics(header: true, child: Text('How to use it', style: theme.textTheme.titleMedium)),
        const SizedBox(height: 4),
        for (final (i, step) in topic.steps.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 24, child: Text('${i + 1}.')),
                Expanded(child: Text(step)),
              ],
            ),
          ),
        const SizedBox(height: 16),
        Semantics(header: true, child: Text('Example', style: theme.textTheme.titleMedium)),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(topic.example),
        ),
        if (topic.where != null) ...[const SizedBox(height: 12), Text('Where: ${topic.where}', style: muted)],
        if (path != null && topic != widget.here) ...[
          const SizedBox(height: 12),
          if (needsNovel && !novelOpen)
            Text('Open a novel to try this.', style: muted)
          else
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  GoRouter.of(context).go(path);
                },
                child: const Text('Take me there'),
              ),
            ),
        ],
      ],
    );

    final topics = ListView(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
      children: [
        for (final group in tutorialGroups) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 12, 8, 4),
            child: Semantics(header: true, child: Text(group, style: theme.textTheme.titleSmall)),
          ),
          for (final t in tutorialTopics.where((t) => t.group == group))
            ListTile(
              dense: true,
              selected: t == topic,
              title: Text(t.title),
              trailing: t == widget.here
                  ? const Chip(label: Text('This page'), visualDensity: VisualDensity.compact)
                  : null,
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
            padding: const EdgeInsets.fromLTRB(20, 12, 8, 0),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                Text('Tutorial', style: theme.textTheme.titleMedium),
                Text('${_index + 1} of ${tutorialTopics.length}', style: muted),
                TextButton(
                  onPressed: () => setState(() => _listing = !_listing),
                  child: Text(_listing ? 'Back to the lesson' : 'All topics'),
                ),
                IconButton(
                  tooltip: 'Close the tutorial',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          const Divider(),
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
                      onPressed: _index == tutorialTopics.length - 1 ? null : () => _show(tutorialTopics[_index + 1]),
                      child: const Text('Next →'),
                    ),
                  ],
                ),
                const TutorialSwitch(),
                if (!shown)
                  Text(
                    'The button is gone from the rail and More. Open the tutorial, or bring the button back, from '
                    'Settings.',
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
