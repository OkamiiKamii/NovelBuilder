import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import 'open_novel.dart';

/// An area of the workspace (Write, Organize, Plan, …). Each phase replaces its area's body with the real feature.
class SectionPage extends ConsumerWidget {
  const SectionPage({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final novelId = ref.watch(openNovelProvider);
    final novel = novelId == null ? null : ref.watch(libraryProvider).where((n) => n.id == novelId).firstOrNull;
    return PageScaffold(
      title: destination.label,
      subtitle: novel?.title,
      actions: [
        if (novel != null)
          TextButton.icon(
            onPressed: () => context.go(Destination.library.path),
            icon: const Icon(Icons.swap_horiz),
            label: const Text('Switch novel'),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (novel == null)
            EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No novel open',
              message: '${destination.label} works inside one novel. Open one from the Library.',
              action: FilledButton(
                onPressed: () => context.go(Destination.library.path),
                child: const Text('Go to Library'),
              ),
            ),
        ],
      ),
    );
  }
}
