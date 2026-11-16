import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/novel_art.dart';
import '../../../core/widgets/choice_field.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/foils.dart';
import '../../../shared/domain/characters/this_or_that.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'this_or_that.dart';
import 'vault.dart';

/// The fields a character's traits are kept in, as This or that keeps them (`record_look.dart`).
const _traitFields = ['core traits', 'traits', 'personality traits', 'personality'];

/// A character's temperament, from the traits in their profile.
Temperament temperamentOf(Listed l) {
  final field = l.entry.fields.where((f) => _traitFields.contains(f.key.trim().toLowerCase())).firstOrNull;
  return (id: l.entry.id, sides: field == null ? const {} : sidesOf(traitsIn(field.value)));
}

/// THE COMPASS, a view of the cast (`foils.dart` reads it): the cast's temperaments, from what This or that keeps in
/// their Core Traits. A board of two of its axes (the two the cast spreads across most, or any two chosen), each face
/// in the square of its answers (the middle row and column for not asked yet); then the **foils** (pairs opposed on
/// most of what both answered, with where they differ), the **twins** (alike nearly everywhere, whom a reader may mix
/// up), the traits the **whole cast shares**, and who is **not on the compass yet**, each a press from This or that.
/// It only reads.
class CastCompass extends StatefulWidget {
  const CastCompass({super.key, required this.found, required this.cast});

  final List<Listed> found;
  final CastData cast;

  @override
  State<CastCompass> createState() => _CastCompassState();
}

class _CastCompassState extends State<CastCompass> {
  String? _x;
  String? _y;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final people = [
      for (final l in widget.found)
        if (!l.profile.archived) l,
    ];
    final byId = {for (final l in people) l.entry.id: l};
    final temperaments = {for (final l in people) l.entry.id: temperamentOf(l)};
    final answered = [
      for (final t in temperaments.values)
        if (t.sides.isNotEmpty) t,
    ];
    final unasked = [
      for (final l in people)
        if (temperaments[l.entry.id]!.sides.isEmpty) l,
    ];
    final (spreadX, spreadY) = spreadAxes(answered);
    final x = _x ?? spreadX;
    final y = _y ?? (spreadY == x ? spreadX : spreadY);
    final read = foilsOf(answered);
    final actions = CharacterActions(context, widget.cast.novelId);
    TextStyle head() =>
        vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.6);

    Widget axisPicker(String label, String value, ValueChanged<String> onPick, String other) => Expanded(
      child: ChoiceField<String>(
        key: ValueKey('compass-$label-$value'),
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, isDense: true),
        items: [
          for (final a in traitAxes)
            if (a.id != other)
              DropdownMenuItem(
                value: a.id,
                child: Text('${a.leftTrait} or ${a.rightTrait}', overflow: TextOverflow.ellipsis),
              ),
        ],
        onChanged: (v) {
          if (v != null) onPick(v);
        },
      ),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'The cast’s temperaments set against each other, from what This or that keeps in their Core Traits: '
            'who are foils, who are too alike, and what the whole cast shares.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          if (answered.isEmpty)
            Text(
              'No one has answered This or that yet. A few quick choices each, and the cast’s temperaments are '
              'set side by side here.',
              style: vaultText(context, size: 16, color: scheme.onSurface),
            )
          else ...[
            Row(
              children: [
                axisPicker('Across', x, (v) => setState(() => _x = v), y),
                const SizedBox(width: 12),
                axisPicker('Down', y, (v) => setState(() => _y = v), x),
              ],
            ),
            const SizedBox(height: 12),
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: _Board(people: people, temperaments: temperaments, x: x, y: y),
              ),
            ),
            const SizedBox(height: 18),
            if (read.foils.isNotEmpty) ...[
              Text('FOILS', style: head()),
              const SizedBox(height: 4),
              Text(
                'Opposed on most of what both answered: the contrast a scene between them runs on.',
                style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 8),
              for (final p in read.foils.take(5))
                if (byId[p.a] case final a?)
                  if (byId[p.b] case final b?)
                    _PairRow(
                      key: ValueKey('foil-${p.a}-${p.b}'),
                      a: a,
                      b: b,
                      said: 'Opposite on ${p.opposed} of ${p.both}',
                      chips: [
                        for (final axis in p.differ)
                          '${traitOf(axis, temperaments[p.a]!.sides[axis]!)} · '
                              '${traitOf(axis, temperaments[p.b]!.sides[axis]!)}',
                      ],
                    ),
              const SizedBox(height: 12),
            ],
            if (read.twins.isNotEmpty) ...[
              Text('TOO ALIKE', style: head()),
              const SizedBox(height: 4),
              Text(
                'Alike on nearly everything both answered: a reader may mix them up. Set them apart, or make them one.',
                style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 8),
              for (final p in read.twins.take(5))
                if (byId[p.a] case final a?)
                  if (byId[p.b] case final b?)
                    _PairRow(
                      key: ValueKey('twin-${p.a}-${p.b}'),
                      a: a,
                      b: b,
                      said: 'Alike on ${p.alike} of ${p.both}',
                      chips: [
                        for (final axis in traitAxes)
                          if (temperaments[p.a]!.sides[axis.id] case final s?)
                            if (temperaments[p.b]!.sides[axis.id] == s) traitOf(axis.id, s),
                      ],
                    ),
              const SizedBox(height: 12),
            ],
            for (final s in read.shared)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.groups_outlined, size: 18, color: scheme.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Everyone who answered is ${traitOf(s.axis, s.side)} (${s.count} of ${s.count}). '
                        'No one in the cast to break it.',
                        style: vaultText(context, size: 14.5, color: scheme.onSurface),
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (unasked.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('NOT ON THE COMPASS YET', style: head()),
            const SizedBox(height: 6),
            for (final l in unasked)
              Padding(
                key: ValueKey('unasked-${l.entry.id}'),
                padding: const EdgeInsets.only(bottom: 4),
                // The name and the way to ask them, on two lines when large text needs them.
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 10,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _Face(listed: l, size: 32),
                        const SizedBox(width: 10),
                        Text(l.entry.name, style: vaultHeading(context, size: 14.5, color: scheme.onSurface)),
                      ],
                    ),
                    TextButton.icon(
                      onPressed: () => showThisOrThat(context, entry: l.entry, profile: l.profile, actions: actions),
                      icon: const Icon(Icons.swap_horiz, size: 18),
                      label: const Text('This or that'),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// The board: three columns (the left trait across, not asked, the right) by three rows (the same, down), each face
/// in its square.
class _Board extends StatelessWidget {
  const _Board({required this.people, required this.temperaments, required this.x, required this.y});

  final List<Listed> people;
  final Map<String, Temperament> temperaments;
  final String x;
  final String y;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ax = traitAxes.firstWhere((a) => a.id == x);
    final ay = traitAxes.firstWhere((a) => a.id == y);
    int col(int? side) => side == null ? 1 : (side < 0 ? 0 : 2);
    final cells = List.generate(9, (_) => <Listed>[]);
    for (final l in people) {
      final s = temperaments[l.entry.id]!.sides;
      if (s.isEmpty) continue;
      cells[col(s[y]) * 3 + col(s[x])].add(l);
    }
    final label = vaultHeading(
      context,
      size: 11,
      color: scheme.onSurfaceVariant,
      weight: 700,
    ).copyWith(letterSpacing: 1);
    Widget corner(String text, {TextAlign align = TextAlign.center}) =>
        // One line, made smaller to fit rather than broken mid-word ("METHODIC / AL" on a phone with large text).
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: align == TextAlign.right ? Alignment.centerRight : Alignment.center,
          child: Text(text.toUpperCase(), textAlign: align, maxLines: 1, softWrap: false, style: label),
        );
    return Semantics(
      container: true,
      label:
          'The compass: ${ax.leftTrait} to ${ax.rightTrait} across, ${ay.leftTrait} to ${ay.rightTrait} down. '
          '${[
            for (final (i, c) in cells.indexed)
              if (c.isNotEmpty) '${[for (final l in c) l.entry.name].join(', ')}: ${_where(i, ax, ay)}',
          ].join('; ')}',
      child: Column(
        children: [
          Row(
            children: [
              const SizedBox(width: 74),
              Expanded(child: corner(ax.leftTrait)),
              Expanded(child: corner('Not asked')),
              Expanded(child: corner(ax.rightTrait)),
            ],
          ),
          const SizedBox(height: 4),
          for (var r = 0; r < 3; r++)
            Row(
              children: [
                SizedBox(
                  width: 74,
                  height: 104,
                  child: Center(
                    child: corner(switch (r) {
                      0 => ay.leftTrait,
                      1 => 'Not asked',
                      _ => ay.rightTrait,
                    }, align: TextAlign.right),
                  ),
                ),
                for (var c = 0; c < 3; c++)
                  Expanded(
                    child: Container(
                      key: ValueKey('cell-$r-$c'),
                      height: 104,
                      margin: const EdgeInsets.all(2),
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: r == 1 || c == 1
                            ? scheme.onSurface.withValues(alpha: 0.03)
                            : scheme.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5)),
                      ),
                      child: SingleChildScrollView(
                        child: Wrap(
                          spacing: 2,
                          runSpacing: 2,
                          alignment: WrapAlignment.center,
                          children: [
                            for (final l in cells[r * 3 + c])
                              Tooltip(
                                message: l.entry.name,
                                child: GestureDetector(
                                  onTap: () => context.go(characterPath(l.entry.id)),
                                  // The face and the first name under it: on a phone there is no pointing to ask.
                                  child: SizedBox(
                                    width: 34,
                                    child: Column(
                                      children: [
                                        _Face(listed: l, size: 26),
                                        Text(
                                          l.entry.name.split(' ').first,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          textAlign: TextAlign.center,
                                          style: vaultText(context, size: 10.5, color: scheme.onSurface),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  static String _where(int i, TraitAxis ax, TraitAxis ay) {
    final row = i ~/ 3, col = i % 3;
    String side(TraitAxis a, int k) => switch (k) {
      0 => a.leftTrait,
      2 => a.rightTrait,
      _ => '${a.leftTrait} or ${a.rightTrait} not asked',
    };
    return '${side(ax, col)}, ${side(ay, row)}';
  }
}

/// Two characters side by side, what they are to each other, and the traits that say it.
class _PairRow extends StatelessWidget {
  const _PairRow({super.key, required this.a, required this.b, required this.said, required this.chips});

  final Listed a;
  final Listed b;
  final String said;
  final List<String> chips;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: scheme.surfaceContainerHigh, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 62,
            height: 44,
            child: Stack(
              children: [
                _Face(listed: a, size: 36),
                Positioned(left: 24, top: 6, child: _Face(listed: b, size: 36)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${a.entry.name} & ${b.entry.name}',
                  style: vaultHeading(context, size: 15, color: scheme.onSurface, weight: 700),
                ),
                Text(said, style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final c in chips)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: scheme.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(c, style: vaultText(context, size: 12.5, color: scheme.onSurface)),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A character's small cameo, as their card draws them.
class _Face extends StatelessWidget {
  const _Face({required this.listed, required this.size});

  final Listed listed;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tone = NovelArt.of(context).bound(castTone(listed.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size / 4),
        child: SizedBox(
          width: size,
          height: size * 1.2,
          child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
        ),
      ),
    );
  }
}
