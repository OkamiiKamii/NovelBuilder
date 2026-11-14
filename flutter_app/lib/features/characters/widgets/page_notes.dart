import 'package:flutter/material.dart';

import 'vault.dart';

/// FROM YOUR PAGES: what the book says about the cast (who is on the page together with no tie, what an editor would
/// ask, people waiting for a name, names in the pages not in the cast yet) is kept under the cast, so the cast itself
/// comes first. At the top, a strip of notes says how many of each there are, a press from each.

/// A kind of note from the pages.
enum PageNote {
  together(Icons.people_outline),
  check(Icons.fact_check_outlined),
  waiting(Icons.person_search_outlined),
  names(Icons.badge_outlined);

  const PageNote(this.icon);

  final IconData icon;

  /// What [n] of them are called, in a few words.
  String said(int n) => switch (this) {
    PageNote.together => n == 1 ? '1 pair often together' : '$n pairs often together',
    PageNote.check => n == 1 ? '1 note on the cast' : '$n notes on the cast',
    PageNote.waiting => '$n waiting for a name',
    PageNote.names => n == 1 ? '1 name in your pages' : '$n names in your pages',
  };
}

/// A panel that tells the page how many it shows, after the frame it was built in, and only when that changes.
mixin CountReporter<T extends StatefulWidget> on State<T> {
  int? _reported;

  void report(ValueChanged<int>? to, int count) {
    if (to == null || count == _reported) return;
    _reported = count;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) to(count);
    });
  }
}

/// The strip of notes under the cast's photograph: a chip for each kind with something to say, a press to it.
class NotesStrip extends StatelessWidget {
  const NotesStrip({super.key, required this.counts, required this.onNote});

  final Map<PageNote, int> counts;
  final ValueChanged<PageNote> onNote;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shown = [
      for (final n in PageNote.values)
        if ((counts[n] ?? 0) > 0) n,
    ];
    if (shown.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'FROM YOUR PAGES',
            style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final n in shown)
                ActionChip(
                  key: ValueKey('note-${n.name}'),
                  avatar: Icon(n.icon, size: 18, color: scheme.primary),
                  label: Text(n.said(counts[n]!)),
                  onPressed: () => onNote(n),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
