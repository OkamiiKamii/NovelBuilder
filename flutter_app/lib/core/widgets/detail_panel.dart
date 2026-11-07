import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../layout/breakpoints.dart';

/// A page with a details panel: beside the content on wide screens, a sheet on phones.
///
/// Used later for a selected record's details next to a list, timeline or graph.
class DetailPanelLayout extends StatelessWidget {
  const DetailPanelLayout({
    super.key,
    required this.main,
    this.panel,
    this.panelTitle,
    this.onClose,
    this.panelWidth = 360,
  });

  final Widget main;

  /// The details to show, or null when nothing is selected.
  final Widget? panel;
  final String? panelTitle;
  final VoidCallback? onClose;
  final double panelWidth;

  @override
  Widget build(BuildContext context) {
    final panel = this.panel;
    if (panel == null || WindowSize.of(context) == WindowSize.compact) return main;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: main),
        const VerticalDivider(width: 1),
        SizedBox(
          width: panelWidth,
          child: DetailPanel(title: panelTitle, onClose: onClose, child: panel),
        ),
      ],
    );
  }
}

/// The panel itself: a title row with a close button over scrolling content. Escape closes it.
class DetailPanel extends StatelessWidget {
  const DetailPanel({super.key, this.title, this.onClose, required this.child});

  final String? title;
  final VoidCallback? onClose;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final close = onClose;
    return CallbackShortcuts(
      bindings: {const SingleActivator(LogicalKeyboardKey.escape): ?close},
      child: FocusTraversalGroup(
        child: Material(
          color: Theme.of(context).colorScheme.surface,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                child: Row(
                  children: [
                    Expanded(child: Text(title ?? '', style: Theme.of(context).textTheme.titleMedium)),
                    if (close != null) IconButton(tooltip: 'Close', onPressed: close, icon: const Icon(Icons.close)),
                  ],
                ),
              ),
              const Divider(),
              Expanded(
                child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: child),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// On phones, details open as a bottom sheet instead of a side panel.
Future<void> showDetailSheet(BuildContext context, {String? title, required Widget child}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(title, style: Theme.of(context).textTheme.titleMedium),
            ),
          child,
        ],
      ),
    ),
  );
}
