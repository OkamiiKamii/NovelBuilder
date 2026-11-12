import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/together.dart';
import '../../../shared/domain/records/relation.dart';
import '../../../shared/domain/relationships/relation_types.dart';
import '../../relationships/relationship_page.dart' show relate;
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cast_card.dart' show castTone, monogram;
import 'portrait.dart';
import 'vault.dart';

/// Where the pairs set aside as "Not tied" are kept, per novel.
String notTiedKey(String novelId) => 'cast.notTied.$novelId';

/// TOGETHER ON THE PAGE: the ties the book already shows. Characters the manuscript keeps putting on the page together
/// ([togetherAtLeast] chapters or more, linked or named there) with no relationship recorded, as cards: the two
/// portraits overlapping with a question between them, "Together in 5 chapters · 11–15", and **How are they tied?**,
/// which records the tie in a press (friends, rivals, mentor and student…), or **Not tied**, which sets the pair
/// aside for this novel. The most together first; three, then "Show all".
///
/// It only says who is on the page together. Nothing is recorded until a press, and then only what was chosen.
class TogetherOnPage extends ConsumerStatefulWidget {
  const TogetherOnPage({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<TogetherOnPage> createState() => _TogetherOnPageState();
}

class _TogetherOnPageState extends ConsumerState<TogetherOnPage> {
  static const _first = 3;
  bool _all = false;

  Set<String> _setAside() {
    final stored = ref.read(settingsStoreProvider).read(notTiedKey(widget.cast.novelId));
    return {
      if (stored is List)
        for (final s in stored) '$s',
    };
  }

  void _notTied(Together t) {
    ref.read(settingsStoreProvider).write(notTiedKey(widget.cast.novelId), [..._setAside(), pairKey(t.a, t.b)]);
    setState(() {});
  }

  void _tie(Together t, String preset, String aName, String bName) {
    final actions = CharacterActions(context, widget.cast.novelId);
    final made = relate(actions, (c) => c.createRelation(t.a, t.b, preset));
    if (made != null) {
      actions.tell(
        '$aName and $bName: ${typeFor(preset).label}.',
        actionLabel: 'Open',
        onAction: () => actions.router.go('/organize/relationship/${made.id}'),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cast = widget.cast;
    final related = {
      for (final r in cast.snapshot.rows('characterRelations').map(CharacterRelation.new)) pairKey(r.fromId, r.toId),
    };
    final pairs = untiedTogether(cast.list, cast.model.order, related: related, setAside: _setAside());
    if (pairs.isEmpty) return const SizedBox.shrink();
    final shown = _all ? pairs : pairs.take(_first).toList();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text('Together on the page', style: vaultHeading(context, size: 13, weight: 700)),
          ),
          const SizedBox(height: 2),
          Text(
            'The book keeps putting them side by side, and no tie is recorded.',
            style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, box) {
              final columns = ((box.maxWidth + 12) / 300).floor().clamp(1, 3);
              final width = (box.maxWidth - 12 * (columns - 1)) / columns;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final t in shown)
                    SizedBox(
                      width: width,
                      child: _PairCard(
                        cast: cast,
                        pair: t,
                        onTie: (preset, a, b) => _tie(t, preset, a, b),
                        onNotTied: () => _notTied(t),
                      ),
                    ),
                ],
              );
            },
          ),
          if (pairs.length > _first)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: TextButton(
                onPressed: () => setState(() => _all = !_all),
                child: Text(_all ? 'Show fewer' : 'Show all ${formatNumber(pairs.length)}'),
              ),
            ),
          const SizedBox(height: 4),
          Divider(color: scheme.outlineVariant),
        ],
      ),
    );
  }
}

class _PairCard extends StatefulWidget {
  const _PairCard({required this.cast, required this.pair, required this.onTie, required this.onNotTied});

  final CastData cast;
  final Together pair;
  final void Function(String preset, String aName, String bName) onTie;
  final VoidCallback onNotTied;

  @override
  State<_PairCard> createState() => _PairCardState();
}

class _PairCardState extends State<_PairCard> {
  // So a screen reader's press opens the same menu a tap does.
  final _menu = GlobalKey<PopupMenuButtonState<String>>();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = widget.pair;
    final a = widget.cast.listed(t.a);
    final b = widget.cast.listed(t.b);
    if (a == null || b == null) return const SizedBox.shrink();
    final aName = a.entry.name;
    final bName = b.entry.name;
    final span = t.chapters.first == t.chapters.last ? '' : ' · ${t.chapters.first}–${t.chapters.last}';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // The two portraits overlapping, a question where they meet.
              ExcludeSemantics(
                child: SizedBox(
                  width: 72,
                  height: 42,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Positioned(
                        left: 0,
                        child: _Face(id: t.a, name: aName, image: a.entry.image),
                      ),
                      Positioned(
                        left: 30,
                        child: _Face(id: t.b, name: bName, image: b.entry.image),
                      ),
                      Positioned(
                        left: 26,
                        bottom: -4,
                        child: Container(
                          width: 18,
                          height: 18,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: scheme.primary,
                            shape: BoxShape.circle,
                            border: Border.all(color: scheme.surfaceContainerLow, width: 2),
                          ),
                          child: Text(
                            '?',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: scheme.onPrimary),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$aName & $bName',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultHeading(context, size: 14.5, weight: 700, color: scheme.onSurface),
                    ),
                    Text(
                      'Together in ${plural(t.chapters.length, 'chapter')}$span',
                      style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 4,
            children: [
              Semantics(
                button: true,
                label: 'How are $aName and $bName tied?',
                onTap: () => _menu.currentState?.showButtonMenu(),
                excludeSemantics: true,
                child: PopupMenuButton<String>(
                  key: _menu,
                  tooltip: 'Who is $aName to $bName?',
                  useRootNavigator: true,
                  onSelected: (preset) => widget.onTie(preset, aName, bName),
                  itemBuilder: (_) => [
                    for (final p in relationPresets)
                      if (p.key != 'custom')
                        PopupMenuItem(
                          value: p.key,
                          child: Text(p.directional ? '${p.label} ($aName the ${p.fromRole.toLowerCase()})' : p.label),
                        ),
                  ],
                  // Drawn as the page's own text buttons are; the menu takes the press.
                  child: IgnorePointer(
                    child: TextButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.link, size: 18),
                      label: const Text('How are they tied?'),
                    ),
                  ),
                ),
              ),
              TextButton(
                onPressed: widget.onNotTied,
                style: TextButton.styleFrom(foregroundColor: scheme.onSurfaceVariant),
                child: const Text('Not tied'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One of the two: their portrait, or their monogram on their own colour (as on the cast wall), in a ring of the
/// card's colour so the two read apart where they overlap.
class _Face extends StatelessWidget {
  const _Face({required this.id, required this.name, required this.image});

  final String id;
  final String name;
  final String? image;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = castTone(id);
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: tone,
        border: Border.all(color: scheme.surfaceContainerLow, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: image != null
          ? Portrait(name: name, image: image, size: 42)
          : Text(monogram(name), style: vaultHeading(context, size: 13, weight: 700, color: ink)),
    );
  }
}
