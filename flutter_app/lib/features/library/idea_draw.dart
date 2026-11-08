import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import 'bookshelf.dart' show BookJacket;
import 'library_actions.dart';

/// The ideas a draw picks from: every idea on the shelf, the last one drawn left out when there are others, so
/// "Draw another" always brings a different book.
Novel drawIdea(List<Novel> ideas, {Novel? last, math.Random? random}) {
  final pool = [
    for (final n in ideas)
      if (ideas.length == 1 || n.id != last?.id) n,
  ];
  return pool[(random ?? math.Random()).nextInt(pool.length)];
}

/// DRAW AN IDEA: with nothing being written and ideas waiting, the top shelf is not only an empty place but an offer:
/// "Not sure which? Draw one of your 18 ideas". A press takes one idea off the shelf at random and lays it on the
/// desk (its jacket, title, author and summary, sliding up into place), with **Start writing it** (the idea becomes
/// the book being written and opens on its page, as everywhere) and **Draw another**. Nothing changes until Start.
class IdeaDraw extends ConsumerStatefulWidget {
  const IdeaDraw({super.key, required this.ideas, this.random});

  final List<Novel> ideas;

  /// A test draws with its own.
  final math.Random? random;

  @override
  ConsumerState<IdeaDraw> createState() => _IdeaDrawState();
}

class _IdeaDrawState extends ConsumerState<IdeaDraw> {
  Novel? _drawn;

  void _draw() => setState(() => _drawn = drawIdea(widget.ideas, last: _drawn, random: widget.random));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    // An idea drawn earlier may have been started or deleted since.
    final drawn = widget.ideas.where((n) => n.id == _drawn?.id).firstOrNull;
    final still = MediaQuery.disableAnimationsOf(context);
    final ideas = widget.ideas.length;

    final empty = Row(
      children: [
        Icon(Icons.edit_note, size: 30, color: scheme.primary),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Nothing being written', style: vaultText(context, size: 18, color: scheme.onSurface)),
              Text(
                ideas == 1
                    ? 'Your idea is waiting below. Draw it to begin.'
                    : 'Not sure which to begin? Draw one of your ${formatNumber(ideas)} ideas.',
                style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );

    Widget card(Novel n) {
      final title = n.title.isEmpty ? 'Untitled novel' : n.title;
      return Column(
        key: ValueKey('drawn:${n.id}'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Drawn from your ideas', style: vaultHeading(context, size: 11.5, weight: 700)),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BookJacket(novel: n, width: 78),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      liveRegion: true,
                      child: Text(title, style: vaultHeading(context, size: 18, weight: 700, color: scheme.onSurface)),
                    ),
                    if (n.author.isNotEmpty) Text(n.author, style: vaultText(context, size: 16)),
                    const SizedBox(height: 6),
                    Text(
                      n.synopsis.trim().isEmpty ? 'No summary yet: the first page will tell.' : n.synopsis.trim(),
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(context, size: 16, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.outline.withValues(alpha: 0.6), width: 1.2),
        color: scheme.surfaceContainerLow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // The drawn book slides up onto the desk, as if taken from the shelf below.
          AnimatedSwitcher(
            duration: still ? Duration.zero : const Duration(milliseconds: 320),
            switchInCurve: Curves.easeOutCubic,
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.25), end: Offset.zero).animate(animation),
                child: child,
              ),
            ),
            layoutBuilder: (current, previous) =>
                Stack(alignment: Alignment.topLeft, children: [...previous, ?current]),
            child: drawn == null ? KeyedSubtree(key: const ValueKey('empty'), child: empty) : card(drawn),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            children: [
              if (drawn != null)
                FilledButton.icon(
                  onPressed: () => startWritingFlow(context, ref, drawn),
                  icon: const Icon(Icons.edit_note),
                  label: const Text('Start writing it'),
                ),
              (drawn == null ? FilledButton.icon : OutlinedButton.icon)(
                onPressed: _draw,
                icon: const Icon(Icons.style_outlined),
                label: Text(drawn == null ? 'Draw an idea' : 'Draw another'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
