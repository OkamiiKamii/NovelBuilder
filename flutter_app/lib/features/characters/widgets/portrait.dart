import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../shared/domain/characters/character_records.dart';

/// The bytes of a picture uploaded into the novel (a `data:image/…;base64,` address), or null for anything else.
Uint8List? uploadedImageBytes(String? image) {
  if (image == null || !image.startsWith('data:image/')) return null;
  final comma = image.indexOf(',');
  if (comma < 0) return null;
  try {
    return base64Decode(image.substring(comma + 1));
  } on FormatException {
    return null;
  }
}

/// A character's portrait, cropped around its focal point; or their initial on a plain ground when they have none.
///
/// Pictures uploaded into the novel are shown. A portrait given as a web address is kept as it is, but not fetched:
/// this app makes no network requests, so the initial shows instead.
class Portrait extends StatelessWidget {
  const Portrait({super.key, required this.name, required this.image, this.focal, this.size = 48, this.label});

  final String name;
  final String? image;
  final Focal? focal;
  final double size;

  /// Said to screen readers. Left out where the name is right beside it.
  final String? label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bytes = uploadedImageBytes(image);
    final f = focal ?? (x: 50.0, y: 30.0);
    final initial = name.trim().isEmpty ? '?' : name.trim().characters.first.toUpperCase();
    final fallback = Container(
      color: scheme.secondaryContainer,
      alignment: Alignment.center,
      child: Text(
        initial,
        style: TextStyle(color: scheme.onSecondaryContainer, fontSize: size * 0.42, fontWeight: FontWeight.w600),
      ),
    );
    final picture = bytes == null
        ? fallback
        : Image.memory(
            bytes,
            fit: BoxFit.cover,
            // object-position x% y% is Alignment(2x/100-1, 2y/100-1).
            alignment: Alignment(f.x / 50 - 1, f.y / 50 - 1),
            gaplessPlayback: true,
            errorBuilder: (_, _, _) => fallback,
          );
    final box = ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.18),
      child: SizedBox.square(dimension: size, child: picture),
    );
    return label == null ? ExcludeSemantics(child: box) : Semantics(image: true, label: label, child: box);
  }
}
