import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/states.dart';
import 'collab_providers.dart';

/// The pages a review copy opens on: the library, the review workspace (Write), the book reader, the team page (which
/// says it is the owner's) and the settings. Everything else in a review copy is the author's own working pages, which
/// a review cannot change.
bool reviewPageAllowed(String location) {
  final path = Uri.parse(location).path;
  return path == '/' ||
      path == Destination.write.path ||
      path == '${Destination.write.path}/read' ||
      path == '/review/team' ||
      path == Destination.settings.path;
}

/// Shows [child], or, in a review copy, a page that says where the review is done instead of the author's own working
/// pages. The store refuses changes there in any case; this keeps the person from meeting refusals.
class ReviewGate extends ConsumerWidget {
  const ReviewGate({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mark = ref.watch(reviewMarkProvider);
    if (mark == null || reviewPageAllowed(location)) return child;
    // Scrolls, so the explanation fits at any text size.
    return SingleChildScrollView(
      child: EmptyState(
        icon: Icons.rate_review_outlined,
        title: 'Not part of a review copy',
        message:
            '“${mark.title}” is a review copy from ${mark.ownerName}. You read, comment and suggest in Write; the '
            'author’s own working pages stay with the author.',
        action: Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.center,
          children: [
            FilledButton(onPressed: () => context.go(Destination.write.path), child: const Text('Go to the review')),
            OutlinedButton(onPressed: () => context.go(Destination.library.path), child: const Text('Library')),
          ],
        ),
      ),
    );
  }
}
