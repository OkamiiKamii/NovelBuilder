import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app/theme/book_faces.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/codex/field_values.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/entry.dart';
import '../../../shared/domain/relationships/history.dart';
import '../characters_providers.dart';
import 'portrait.dart';

/// THE CHARACTER VAULT LOOK: the profile framed in thin accent lines, its headings in a classical capital face
/// (Cinzel) and its writing in a book face (EB Garamond), both bundled with the app. The colours are the app theme's:
/// the accent where the design has gold, so the vault follows parchment by day and midnight by night.

/// The faces of the book look (other themes bring their own, read through [BookFaces]).
const vaultHeadingFont = 'Cinzel';
const vaultTextFont = 'EB Garamond';

/// A heading in the vault's capitals, in the accent colour, widely spaced.
TextStyle vaultHeading(BuildContext context, {double size = 15, Color? color, double weight = 600}) => TextStyle(
  fontFamily: BookFaces.of(context).heading,
  fontSize: size,
  fontVariations: [FontVariation.weight(weight)],
  fontWeight: weight >= 600 ? FontWeight.w600 : FontWeight.w400,
  letterSpacing: size * 0.09,
  height: 1.25,
  color: color ?? Theme.of(context).colorScheme.primary,
);

/// Writing in the vault's book face.
TextStyle vaultText(BuildContext context, {double size = 17, Color? color, FontStyle? style}) => TextStyle(
  fontFamily: BookFaces.of(context).text,
  fontSize: size,
  fontStyle: style,
  height: 1.35,
  color: color ?? Theme.of(context).colorScheme.onSurface,
);

/// A thin accent line, as between the vault's parts.
class VaultRule extends StatelessWidget {
  const VaultRule({super.key, this.vertical = false});
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final colour = Theme.of(context).colorScheme.primary.withValues(alpha: 0.45);
    return vertical
        ? VerticalDivider(width: 33, thickness: 1, color: colour)
        : Divider(height: 25, thickness: 1, color: colour);
  }
}

/// The vault's frame: a thin accent border with a small diamond at each corner.
class VaultFrame extends StatelessWidget {
  const VaultFrame({super.key, required this.child, this.padding = const EdgeInsets.all(20)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // A frame is a part of the page of its own for screen readers, as a card is.
    return Semantics(
      container: true,
      child: CustomPaint(
        foregroundPainter: _Corners(scheme.primary),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: scheme.surface,
            border: Border.all(color: scheme.primary.withValues(alpha: 0.7)),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

class _Corners extends CustomPainter {
  _Corners(this.colour);
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = colour;
    const r = 4.0;
    for (final c in [Offset.zero, Offset(size.width, 0), Offset(0, size.height), Offset(size.width, size.height)]) {
      canvas.drawPath(
        Path()
          ..moveTo(c.dx, c.dy - r)
          ..lineTo(c.dx + r, c.dy)
          ..lineTo(c.dx, c.dy + r)
          ..lineTo(c.dx - r, c.dy)
          ..close(),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_Corners old) => old.colour != colour;
}

/// A section's heading in the vault's capitals.
class VaultHeading extends StatelessWidget {
  const VaultHeading(this.text, {super.key, this.size = 15});
  final String text;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Text(text, style: vaultHeading(context, size: size)),
  );
}

/// Several values (traits, tags) as outlined chips, as the vault shows a character's traits.
class VaultChips extends StatelessWidget {
  const VaultChips(this.values, {super.key});
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final v in values)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              border: Border.all(color: scheme.primary.withValues(alpha: 0.8)),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(v, style: vaultText(context, size: 16)),
          ),
      ],
    );
  }
}

/// The facts shown at the top of a profile: the first fields of its first section on the Overview tab (its identity,
/// in the built-in layouts), the short kinds only, those with something written first. Read from the record; none is
/// kept anywhere else.
List<({String name, String value})> identityFacts(CastData cast, Entry entry, CharacterProfile profile, {int max = 6}) {
  final first = profile.sections.where((s) => s.tab == ProfileTab.overview && !s.hidden).firstOrNull;
  if (first == null) return const [];
  final byId = {for (final f in entry.fields) f.id: f};
  final facts = <({String name, String value})>[];
  for (final id in first.fieldIds) {
    final f = byId[id];
    if (f == null) continue;
    final def = f.defId == null ? null : cast.characterCategory.fields.where((d) => d.id == f.defId).firstOrNull;
    final type = def?.type ?? f.type ?? FieldType.text;
    if (type == FieldType.longtext || type == FieldType.references || type == FieldType.tags) continue;
    final name = def != null && def.name.isNotEmpty ? def.name : f.key;
    final value = displayValue(type, f.value, cast.nameOf);
    // The symbol has a row of its own on the overview.
    if (name.trim().isEmpty || value.trim().isEmpty || name.trim().toLowerCase() == 'symbol') continue;
    facts.add((name: name, value: value));
    if (facts.length == max) break;
  }
  return facts;
}

/// A fact in the profile's header: its name in small capitals, its value beneath.
class VaultFact extends StatelessWidget {
  const VaultFact({super.key, required this.name, required this.value});
  final String name;
  final String value;

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    label: '$name: $value',
    excludeSemantics: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(name, style: vaultHeading(context, size: 12)),
        const SizedBox(height: 2),
        Text(value, style: vaultText(context, size: 20)),
      ],
    ),
  );
}

/// The value of the character's field called "Symbol", when they have one with something in it.
String? symbolOf(CastData cast, Entry entry) {
  for (final f in entry.fields) {
    final def = f.defId == null ? null : cast.characterCategory.fields.where((d) => d.id == f.defId).firstOrNull;
    final name = def != null && def.name.isNotEmpty ? def.name : f.key;
    if (name.trim().toLowerCase() == 'symbol' && f.value.trim().isNotEmpty) {
      return displayValue(def?.type ?? f.type, f.value, cast.nameOf);
    }
  }
  return null;
}

/// THE CHARACTER'S WEB: the character in the middle and the people they have a relationship with around them, joined
/// by a line; two of those people are joined too when they have a relationship of their own. As things stand at the
/// end of the story. Each name is written under its portrait, and each person can be opened.
class RelationWeb extends StatelessWidget {
  const RelationWeb({super.key, required this.cast, required this.entry, required this.onOpen, this.max = 6});

  final CastData cast;
  final Entry entry;
  final ValueChanged<String> onOpen;
  final int max;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final order = cast.model.order;
    final around = <({Entry other, String role})>[];
    final seen = <String>{};
    for (final r in cast.model.relations.values) {
      if (r.fromId != entry.id && r.toId != entry.id) continue;
      final otherId = r.fromId == entry.id ? r.toId : r.fromId;
      final other = cast.model.entries[otherId];
      if (other == null || !seen.add(otherId)) continue;
      final stage = stageAt(r, null, order);
      around.add((other: other, role: stage == null ? 'Related' : roleOf(stage, r, otherId)));
    }
    around.sort((a, b) => localeCompare(a.other.name, b.other.name));
    if (around.isEmpty) {
      return Text(
        'No relationships recorded yet. Add one on the Relationships tab.',
        style: vaultText(context, size: 16, color: theme.colorScheme.onSurfaceVariant, style: FontStyle.italic),
      );
    }
    final shown = around.take(max).toList();
    final ids = [for (final a in shown) a.other.id];
    // Lines between two people around the character, when they have a relationship of their own.
    final between = <(int, int)>[
      for (final r in cast.model.relations.values)
        if (ids.contains(r.fromId) && ids.contains(r.toId) && r.fromId != r.toId)
          (ids.indexOf(r.fromId), ids.indexOf(r.toId)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, box) {
            final side = math.min(box.maxWidth, 380.0);
            final node = (side * 0.2).clamp(48.0, 76.0);
            final centre = Offset(side / 2, side / 2);
            final radius = side / 2 - node / 2 - 18;
            final at = [
              for (var i = 0; i < shown.length; i++)
                centre + Offset.fromDirection(-math.pi / 2 + 2 * math.pi * i / shown.length, radius),
            ];
            Widget person(Entry e, Offset p, double size, String said, {bool middle = false}) => Positioned(
              left: p.dx - 55,
              top: p.dy - size / 2,
              width: 110,
              child: Semantics(
                container: true,
                button: !middle,
                label: middle ? '${e.name}, in the middle' : '${e.name}: $said. Open their profile',
                excludeSemantics: true,
                child: GestureDetector(
                  onTap: middle ? null : () => onOpen(e.id),
                  child: MouseRegion(
                    cursor: middle ? MouseCursor.defer : SystemMouseCursors.click,
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: theme.colorScheme.surface,
                            border: Border.all(color: theme.colorScheme.primary, width: middle ? 2.5 : 1.5),
                          ),
                          child: ClipOval(
                            child: Portrait(
                              name: e.name,
                              image: e.image,
                              focal: cast.profiles[e.id]?.focal,
                              size: size - 4,
                            ),
                          ),
                        ),
                        if (!middle)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            color: theme.colorScheme.surface,
                            child: Text(
                              e.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: vaultText(context, size: 13),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            );
            return Center(
              child: SizedBox(
                width: side,
                height: side,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: CustomPaint(
                        painter: _WebLines(
                          centre: centre,
                          around: at,
                          between: between,
                          colour: theme.colorScheme.primary.withValues(alpha: 0.75),
                        ),
                      ),
                    ),
                    for (final (i, a) in shown.indexed) person(a.other, at[i], node, a.role),
                    person(entry, centre, node * 1.25, '', middle: true),
                  ],
                ),
              ),
            );
          },
        ),
        if (around.length > shown.length)
          Text(
            'And ${around.length - shown.length} more on the Relationships tab.',
            textAlign: TextAlign.center,
            style: vaultText(context, size: 14, color: theme.colorScheme.onSurfaceVariant),
          ),
      ],
    );
  }
}

class _WebLines extends CustomPainter {
  _WebLines({required this.centre, required this.around, required this.between, required this.colour});
  final Offset centre;
  final List<Offset> around;
  final List<(int, int)> between;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = colour
      ..strokeWidth = 1.5;
    for (final p in around) {
      canvas.drawLine(centre, p, paint);
    }
    for (final (a, b) in between) {
      canvas.drawLine(around[a], around[b], paint);
    }
  }

  @override
  bool shouldRepaint(_WebLines old) => true;
}
