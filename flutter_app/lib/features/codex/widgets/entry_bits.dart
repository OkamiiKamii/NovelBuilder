import 'package:flutter/material.dart';

import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/entry.dart';
import '../../characters/widgets/portrait.dart';

/// A kind's colour, from its stored `#rrggbb` (a grey when it cannot be read).
Color kindColor(Category kind) {
  final hex = kind.color.startsWith('#') ? kind.color.substring(1) : kind.color;
  final value = hex.length == 6 ? int.tryParse(hex, radix: 16) : null;
  return Color(0xFF000000 | (value ?? 0x5c6370));
}

/// An entry's picture (uploaded ones; web addresses are kept, not fetched), or its initial on its kind's colour.
class EntryThumb extends StatelessWidget {
  const EntryThumb({super.key, required this.entry, required this.color, this.size = 48, this.label});

  final Entry entry;
  final Color color;
  final double size;
  final String? label;

  @override
  Widget build(BuildContext context) {
    if (uploadedImageBytes(entry.image) != null) {
      return Portrait(name: entry.name, image: entry.image, size: size, label: label);
    }
    final initial = entry.name.trim().isEmpty ? '?' : entry.name.trim().characters.first.toUpperCase();
    final light = ThemeData.estimateBrightnessForColor(color) == Brightness.light;
    final box = ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.18),
      child: Container(
        width: size,
        height: size,
        color: color,
        alignment: Alignment.center,
        child: Text(
          initial,
          style: TextStyle(
            color: light ? Colors.black87 : Colors.white,
            fontSize: size * 0.42,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
    return label == null ? ExcludeSemantics(child: box) : Semantics(image: true, label: label, child: box);
  }
}

/// The kind of an entry, in words, with its colour beside them (never the colour alone).
class KindBadge extends StatelessWidget {
  const KindBadge({super.key, required this.kind});
  final Category kind;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: kindColor(kind), shape: BoxShape.circle),
      ),
      const SizedBox(width: 6),
      Flexible(
        child: Text(kind.singular, style: Theme.of(context).textTheme.labelMedium, overflow: TextOverflow.ellipsis),
      ),
    ],
  );
}
