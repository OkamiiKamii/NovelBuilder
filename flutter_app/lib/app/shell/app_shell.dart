import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/widgets/save_status_indicator.dart';
import '../../features/collab/review_gate.dart';
import '../../features/search/search_dialog.dart';
import '../../features/tutorial/tutorial.dart';
import '../../features/write/writing_prefs.dart';
import '../../shared/data/autosave.dart';
import '../../shared/data/providers.dart';
import '../destinations.dart';
import '../theme/leather.dart';
import 'app_shortcuts.dart';
import 'contents_sheet.dart';
import 'page_turn.dart';

/// The frame around every page: a navigation rail on wide screens, a bottom bar on phones.
///
/// Phones show the first three areas in the bottom bar and the rest under "More", because a bottom bar
/// stays readable only up to about five items.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  /// The areas shown directly in the phone's bottom bar; the rest are under "More".
  static const compactPrimary = [Destination.library, Destination.write, Destination.organize];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = Destination.forLocation(location);
    final size = WindowSize.of(context);
    // Focus mode while writing: no navigation, only the page. The editor shows how to leave it.
    final focus = current == Destination.write && ref.watch(focusModeProvider);
    // The page between areas turns like a leaf of the book (`page_turn.dart`).
    return PageTurner(
      builder: (context, bind) => _frame(
        context,
        ref,
        current,
        size,
        focus,
        bind(
          FocusTraversalGroup(
            child: ReviewGate(location: location, child: child),
          ),
        ),
      ),
    );
  }

  Widget _frame(BuildContext context, WidgetRef ref, Destination? current, WindowSize size, bool focus, Widget body) {
    final Widget layout = switch (size) {
      _ when focus => Scaffold(body: SafeArea(child: body)),
      WindowSize.compact => Scaffold(
        body: SafeArea(bottom: false, child: body),
        bottomNavigationBar: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _CompactSaveStatus(),
            LeatherBinding(horizontal: true, child: _BottomBar(current: current)),
          ],
        ),
      ),
      _ => Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              FocusTraversalGroup(
                child: LeatherBinding(
                  child: _Rail(current: current, extended: size == WindowSize.expanded),
                ),
              ),
              Expanded(child: body),
            ],
          ),
        ),
      ),
    };

    return Shortcuts(
      shortcuts: destinationShortcuts(),
      child: Actions(
        actions: {
          GoToDestinationIntent: CallbackAction<GoToDestinationIntent>(
            onInvoke: (intent) {
              goToArea(context, current, intent.destination);
              return null;
            },
          ),
          SearchNovelIntent: CallbackAction<SearchNovelIntent>(
            onInvoke: (_) {
              showNovelSearch(context, ref);
              return null;
            },
          ),
        },
        // Keeps the shortcuts working before anything on the page has been focused.
        child: Focus(autofocus: true, child: layout),
      ),
    );
  }
}

class _Rail extends StatelessWidget {
  const _Rail({required this.current, required this.extended});

  final Destination? current;
  final bool extended;

  @override
  Widget build(BuildContext context) {
    // Eight areas do not fit a short landscape window, so the rail scrolls when it must.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: IntrinsicHeight(child: _rail(context)),
        ),
      ),
    );
  }

  Widget _rail(BuildContext context) {
    return NavigationRail(
      extended: extended,
      minExtendedWidth: 200,
      labelType: extended ? NavigationRailLabelType.none : NavigationRailLabelType.all,
      leading: Padding(
        // Clear of the gilt bands across the head of the spine.
        padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
        child: Column(
          children: [
            if (extended)
              Text(
                'Novel Builder',
                style: TextStyle(
                  fontFamily: 'Cinzel',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: Theme.of(context).colorScheme.primary,
                ),
              )
            else
              const Icon(Icons.auto_stories_outlined),
            const SizedBox(height: 8),
            Consumer(
              builder: (context, ref, _) => IconButton(
                tooltip: 'Search the whole novel (${primaryModifierLabel}K)',
                onPressed: () => showNovelSearch(paperContext(context), ref),
                icon: const Icon(Icons.search),
              ),
            ),
            Consumer(
              builder: (context, ref, _) => ref.watch(tutorialShownProvider)
                  ? IconButton(
                      tooltip: 'Tutorial',
                      onPressed: () => showTutorial(paperContext(context)),
                      icon: const Icon(Icons.school_outlined),
                    )
                  : const SizedBox.shrink(),
            ),
          ],
        ),
      ),
      // Whether everything is saved, under the areas.
      trailing: Padding(
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
        child: SizedBox(
          width: extended ? 176 : 56,
          child: SaveStatusIndicator(compact: !extended),
        ),
      ),
      selectedIndex: current?.index,
      onDestinationSelected: (index) => goToArea(context, current, Destination.values[index]),
      destinations: [
        for (final d in Destination.values)
          NavigationRailDestination(
            icon: Tooltip(message: '${d.label} (${shortcutLabel(d)})', child: Icon(d.icon)),
            selectedIcon: Icon(d.selectedIcon),
            label: Text(d.label),
          ),
      ],
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.current});

  final Destination? current;

  @override
  Widget build(BuildContext context) {
    const primary = AppShell.compactPrimary;
    final inMore = current != null && !primary.contains(current);
    final selected = current == null ? null : (inMore ? primary.length : primary.indexOf(current!));
    return NavigationBar(
      selectedIndex: selected ?? 0,
      // With nothing selected (an unknown page), no item is highlighted.
      indicatorColor: selected == null ? Colors.transparent : null,
      onDestinationSelected: (index) {
        if (index < primary.length) {
          goToArea(context, current, primary[index]);
        } else {
          _showMore(context);
        }
      },
      destinations: [
        for (final d in primary)
          NavigationDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selectedIcon), label: d.label),
        const NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
      ],
    );
  }

  void _showMore(BuildContext context) {
    final rest = Destination.values.where((d) => !AppShell.compactPrimary.contains(d));
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      // As tall as its items need (up to the whole screen), so on a short phone every area shows without scrolling.
      isScrollControlled: true,
      // In the app's own paper colours, not the binding's it was opened from.
      builder: (sheetContext) => Theme(
        data: Theme.of(Navigator.of(context, rootNavigator: true).context),
        child: SafeArea(
          child: ContentsSheet(
            areas: rest.toList(),
            current: current,
            onArea: (d) {
              Navigator.of(sheetContext).pop();
              goToArea(context, current, d);
            },
            search: Consumer(
              builder: (context, ref, _) => ListTile(
                leading: const Icon(Icons.search),
                title: const Text('Search the novel'),
                subtitle: const Text('Every chapter, entry and note', maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  showNovelSearch(paperContext(context), ref);
                },
              ),
            ),
            extras: [
              Consumer(
                builder: (context, ref, _) => ref.watch(tutorialShownProvider)
                    ? ListTile(
                        leading: const Icon(Icons.school_outlined),
                        title: const Text('Tutorial'),
                        subtitle: const Text(
                          'A short lesson for this page',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onTap: () {
                          Navigator.of(sheetContext).pop();
                          showTutorial(paperContext(context));
                        },
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// On phones, the save status takes no room while everything is saved; it appears above the bottom bar while there are
/// unsaved changes, while saving, and (in the error colour, with Retry) when a save failed.
class _CompactSaveStatus extends ConsumerWidget {
  const _CompactSaveStatus();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(saveStatusProvider).state == SaveState.saved) return const SizedBox.shrink();
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Align(alignment: Alignment.centerLeft, child: SaveStatusIndicator()),
      ),
    );
  }
}

/// Opens another area, turning the page being left like a leaf of the book: to the left going forward through the
/// areas, to the right going back. The same area, or no known one to leave, just opens.
void goToArea(BuildContext context, Destination? from, Destination to) {
  void go() => context.go(to.path);
  final turner = PageTurner.of(context);
  if (turner == null || from == null || from == to) {
    go();
    return;
  }
  turner.turn(forward: to.index > from.index, go: go);
}

/// Where a dialog opened from the binding (the rail, the bottom bar) takes its colours from: the app's own paper, not
/// the gilt-on-leather of the binding it was pressed on. A dialog takes the theme of the place it is opened from.
BuildContext paperContext(BuildContext context) => Navigator.of(context, rootNavigator: true).context;
