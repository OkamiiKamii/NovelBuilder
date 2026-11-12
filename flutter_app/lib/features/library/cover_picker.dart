import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/novel_art.dart';
import '../../shared/data/providers.dart';
import '../characters/data/portrait_image.dart';

/// The picture in a cover kept as a data URL, or null for none, a web address (never fetched: the app stays offline)
/// or text that is not a picture.
Uint8List? coverBytes(String? cover) {
  if (cover == null || !cover.startsWith('data:image/') || !cover.contains(';base64,')) return null;
  try {
    return base64Decode(cover.substring(cover.indexOf(',') + 1));
  } on FormatException {
    return null;
  }
}

/// A novel's cover: its picture, or (when there is none, it is a web address, or it cannot be read) the first letter
/// of its title on its colour, as the original app drew it.
class NovelCover extends StatelessWidget {
  const NovelCover({
    super.key,
    required this.title,
    required this.cover,
    required this.accent,
    this.width = 48,
    this.height = 72,
  });
  final String title;
  final String? cover;
  final String accent;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    Color colour;
    try {
      colour = Color(int.parse(accent.substring(1), radix: 16) | 0xFF000000);
    } on FormatException {
      colour = const Color(0xFFB4532A);
    } on RangeError {
      colour = const Color(0xFFB4532A);
    }
    // The book's colour (the author's) as the theme draws books (`novel_art.dart`): the whole cover, or System Monolith's
    // dark cover framed in gold with the colour down its edge.
    final art = NovelArt.of(context);
    final look = art.bound(colour);
    final letter = Container(
      width: width,
      height: height,
      decoration: art.system
          ? BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: look.ground),
              border: Border(
                left: BorderSide(color: colour, width: width * 0.08),
                top: BorderSide(color: look.frame.withValues(alpha: 0.7)),
                right: BorderSide(color: look.frame.withValues(alpha: 0.7)),
                bottom: BorderSide(color: look.frame.withValues(alpha: 0.7)),
              ),
            )
          : BoxDecoration(color: colour),
      alignment: Alignment.center,
      child: Text(
        title.trim().isEmpty ? '?' : title.trim().characters.first.toUpperCase(),
        style: TextStyle(
          color: art.system
              ? look.ink
              : ThemeData.estimateBrightnessForColor(colour) == Brightness.dark
              ? Colors.white
              : Colors.black,
          fontSize: height * 0.4,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
    final bytes = coverBytes(cover);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: bytes == null
            ? letter
            : Image.memory(
                bytes,
                width: width,
                height: height,
                fit: BoxFit.cover,
                gaplessPlayback: true,
                errorBuilder: (_, _, _) => letter,
              ),
      ),
    );
  }
}

/// Choosing a novel's cover in its details: a picture from the device, kept small enough to live in the library and
/// in backups (at most 800 pixels on its longest side, as a JPEG), or none. Nothing is sent anywhere.
class CoverField extends ConsumerStatefulWidget {
  const CoverField({
    super.key,
    required this.title,
    required this.accent,
    required this.cover,
    required this.onChanged,
  });
  final String title;
  final String accent;
  final String? cover;
  final ValueChanged<String?> onChanged;

  @override
  ConsumerState<CoverField> createState() => _CoverFieldState();
}

class _CoverFieldState extends ConsumerState<CoverField> {
  var _busy = false;
  String? _problem;

  Future<void> _choose() async {
    final picked = await ref.read(backupFilesProvider).pickImage();
    if (picked == null || !mounted) return;
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      final url = await portraitDataUrl(picked.bytes);
      if (url.length > 2000000) throw UnreadableImage();
      widget.onChanged(url);
    } on UnreadableImage {
      if (mounted) {
        setState(() => _problem = 'That picture could not be read. Choose a JPEG, PNG, WebP, GIF or HEIC file.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final cover = widget.cover;
    final isPicture = coverBytes(cover) != null;
    final isAddress = cover != null && cover.startsWith('http');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Cover', style: theme.textTheme.labelLarge),
        const SizedBox(height: 8),
        Wrap(
          spacing: 16,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Semantics(
              image: true,
              label: isPicture ? 'Cover picture of ${widget.title}' : 'No cover picture: the title’s first letter',
              child: NovelCover(title: widget.title, cover: cover, accent: widget.accent, width: 80, height: 120),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _choose,
                      icon: _busy
                          ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.image_outlined),
                      label: Text(cover == null ? 'Choose a picture…' : 'Choose another picture…'),
                    ),
                    if (cover != null)
                      TextButton(onPressed: () => widget.onChanged(null), child: const Text('Remove cover')),
                  ],
                ),
                const SizedBox(height: 4),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 360),
                  child: Text(
                    isAddress
                        ? 'This cover is a web address. It is kept, and used when the book is published, but not '
                              'shown here: the app works offline.'
                        : 'Shown in the library and on the ebook. Kept at most 800 pixels tall or wide.',
                    style: muted,
                  ),
                ),
                if (_problem != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(_problem!, style: TextStyle(color: theme.colorScheme.error)),
                  ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}
