import 'package:flutter/material.dart';

/// Shown in place of a part of the screen that failed to build (release builds only).
/// The rest of the app keeps working, and nothing is lost.
class BrokenWidget extends StatelessWidget {
  const BrokenWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error),
            const SizedBox(width: 8),
            const Flexible(child: Text('This part of the screen could not be shown. Your work is not affected.')),
          ],
        ),
      ),
    );
  }
}
