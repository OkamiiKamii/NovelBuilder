import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/together.dart';
import '../../../shared/domain/records/relation.dart';
import '../../../shared/domain/relationships/relation_types.dart';
import '../../relationships/relationship_page.dart' show relate;
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cast_card.dart' show castTone, monogram;
import 'vault.dart';

/// TIES: the cast as a table of who they are to each other, each character down the side and across the top, a cell
/// for every pair. A pair with a relationship shows it as it stands now (its latest stage), marked by its kind; a press
/// opens it. A pair with none is a faint "+": a press offers the common ties and records the one chosen (for a
/// one-way tie, the character on the row takes the first role: Mira the Mentor, Kai the Student). One relationship per
/// pair, as everywhere; its history is kept on its own page.
class CastTies extends ConsumerWidget {
  const CastTies({super.key, required this.found, required this.cast});

  final List<Listed> found;
  final CastData cast;

  // Narrower on a phone, so more of the table is seen before it scrolls sideways.
  static bool _narrow(BuildContext context) => MediaQuery.sizeOf(context).width < 600;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final people = [for (final l in found) l.entry];
    final cellSize = _narrow(context) ? const Size(92, 58) : const Size(112, 58);
    final head = _narrow(context) ? 112.0 : 168.0;
    if (people.length < 2) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text(
          'Ties need at least two characters.',
          style: vaultText(context, size: 17, style: FontStyle.italic, color: scheme.onSurfaceVariant),
        ),
      );
    }
    final relations = <String, CharacterRelation>{
      for (final r in cast.snapshot.rows('characterRelations').map(CharacterRelation.new)) _pair(r.fromId, r.toId): r,
    };
    final actions = CharacterActions(context, cast.novelId);
    final together = chaptersTogether(cast.list, cast.model.order);

    Widget header(String id, String name) => Tooltip(
      message: name,
      // At least 56 tall, taller when the text is larger, so a name is never cut off.
      child: ConstrainedBox(
        constraints: BoxConstraints.tightFor(width: cellSize.width).copyWith(minHeight: 56),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            _Monogram(id: id, name: name),
            const SizedBox(height: 4),
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: vaultHeading(context, size: 11, weight: 700, color: scheme.onSurface),
            ),
          ],
        ),
      ),
    );

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(width: head),
              for (final p in people) header(p.id, p.name),
            ],
          ),
          const SizedBox(height: 6),
          for (final (i, row) in people.indexed)
            Row(
              children: [
                SizedBox(
                  width: head,
                  height: cellSize.height,
                  child: Row(
                    children: [
                      _Monogram(id: row.id, name: row.name),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          row.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: vaultHeading(context, size: 13, weight: 700, color: scheme.onSurface),
                        ),
                      ),
                    ],
                  ),
                ),
                for (final (j, col) in people.indexed)
                  SizedBox.fromSize(
                    size: cellSize,
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: i == j
                          ? DecoratedBox(
                              decoration: BoxDecoration(
                                color: scheme.outlineVariant.withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(6),
                              ),
                            )
                          : _Tie(
                              row: row.name,
                              col: col.name,
                              relation: relations[_pair(row.id, col.id)],
                              // Each pair once: the lower half mirrors the upper and offers the same.
                              onOpen: (r) => actions.router.go('/organize/relationship/${r.id}'),
                              onAdd: (preset) => relate(actions, (c) => c.createRelation(row.id, col.id, preset)),
                              together: together[_pair(row.id, col.id)]?.length ?? 0,
                            ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  static String _pair(String a, String b) => a.compareTo(b) < 0 ? '$a|$b' : '$b|$a';
}

/// Colours for the kinds of tie, with the kind always said in words too.
Color _kindColour(String category, String preset, ColorScheme scheme) => switch (category) {
  // Opposition apart from friendship, though both are social.
  'social' when preset == 'rivals' || preset == 'enemies' => const Color(0xFFB4532A),
  'family' => const Color(0xFF3F7D4E),
  'romance' => const Color(0xFFA8436B),
  'mentorship' => const Color(0xFF2B7A8C),
  'hierarchy' => const Color(0xFF8A6D1F),
  'social' => const Color(0xFF3D5FA8),
  _ => scheme.outline,
};

class _Tie extends StatefulWidget {
  const _Tie({
    required this.row,
    required this.col,
    required this.relation,
    required this.onOpen,
    required this.onAdd,
    this.together = 0,
  });

  final String row;
  final String col;
  final CharacterRelation? relation;
  final void Function(CharacterRelation r) onOpen;
  final void Function(String preset) onAdd;

  /// Chapters the two share on the page (`together.dart`): said in an empty square, so a tie the book shows is seen.
  final int together;

  @override
  State<_Tie> createState() => _TieState();
}

class _TieState extends State<_Tie> {
  // So a screen reader's press opens the same menu a tap does.
  final _menu = GlobalKey<PopupMenuButtonState<String>>();

  String get row => widget.row;
  String get col => widget.col;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final r = widget.relation;
    if (r != null && r.stages.isNotEmpty) {
      final stage = r.stages.last;
      final colour = _kindColour(stage.category, stage.preset, scheme);
      final label = stage.label.isNotEmpty ? stage.label : typeFor(stage.preset).label;
      return Semantics(
        button: true,
        label: '$row and $col: $label',
        onTap: () => widget.onOpen(r),
        excludeSemantics: true,
        child: Material(
          color: colour.withValues(alpha: 0.14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(6),
            side: BorderSide(color: colour.withValues(alpha: 0.7)),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: () => widget.onOpen(r),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 14.5, color: scheme.onSurface),
                ),
              ),
            ),
          ),
        ),
      );
    }
    return Semantics(
      button: true,
      label: widget.together > 0
          ? '$row and $col: no tie yet, together in ${widget.together} chapters. Add one'
          : '$row and $col: no tie yet. Add one',
      onTap: () => _menu.currentState?.showButtonMenu(),
      excludeSemantics: true,
      child: PopupMenuButton<String>(
        key: _menu,
        tooltip: 'Who is $row to $col?',
        useRootNavigator: true,
        onSelected: widget.onAdd,
        itemBuilder: (_) => [
          for (final p in relationPresets)
            if (p.key != 'custom')
              PopupMenuItem(
                value: p.key,
                child: Text(p.directional ? '${p.label} ($row the ${p.fromRole.toLowerCase()})' : p.label),
              ),
        ],
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
          ),
          child: Center(
            child: widget.together >= togetherAtLeast
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add, size: 16, color: scheme.primary),
                      Text(
                        '${widget.together} together',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 13, style: FontStyle.italic, color: scheme.primary),
                      ),
                    ],
                  )
                : Icon(Icons.add, size: 18, color: scheme.onSurfaceVariant.withValues(alpha: 0.7)),
          ),
        ),
      ),
    );
  }
}

class _Monogram extends StatelessWidget {
  const _Monogram({required this.id, required this.name});
  final String id;
  final String name;

  @override
  Widget build(BuildContext context) {
    final tone = castTone(id);
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    return ExcludeSemantics(
      child: Container(
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
        child: Text(monogram(name), style: vaultHeading(context, size: 11, weight: 700, color: ink)),
      ),
    );
  }
}
