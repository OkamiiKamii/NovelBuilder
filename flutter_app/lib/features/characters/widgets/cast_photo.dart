import 'package:flutter/material.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/domain/characters/cast.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'portrait.dart';
import 'vault.dart';

/// The most stood in each row of the photograph; the rest are named as "and N more".
const photoFront = 7;
const photoBack = 8;

const _rank = {'Protagonist': 0, 'Antagonist': 1, 'Supporting': 2, 'Minor': 4, 'Background': 5};

/// A character's place in the company (0 a protagonist … 5 the background cast): the most important of their roles;
/// with none, between the principals and the minor cast.
int castRank(Listed l) =>
    l.profile.roles.isEmpty ? 3 : l.profile.roles.map((r) => _rank[r] ?? 3).reduce((a, b) => a < b ? a : b);

/// Who stands where in the cast photograph: the principals in front (protagonists, antagonists, the supporting
/// cast), the most important in the middle and the rest out to either side in turn; the minor and background cast
/// behind. With no roles recorded, the five most in the book stand in front. Left to right in each row, and how many
/// more there are than are stood.
({List<Listed> front, List<Listed> back, int more}) castPhotoRows(List<Listed> cast) {
  final ordered = [...cast]
    ..sort((a, b) {
      final r = castRank(a).compareTo(castRank(b));
      if (r != 0) return r;
      final seen = b.seenIn.length.compareTo(a.seenIn.length);
      return seen != 0 ? seen : a.entry.name.compareTo(b.entry.name);
    });
  final anyRoles = ordered.any((l) => castRank(l) != 3);
  final principals = anyRoles ? ordered.where((l) => castRank(l) <= 3).toList() : ordered.take(5).toList();
  final rest = [
    for (final l in ordered)
      if (!principals.contains(l)) l,
  ];
  // From the middle outward: the first in the middle, then left, right, left…
  List<Listed> centred(List<Listed> people) {
    final out = <Listed>[];
    for (final (i, l) in people.indexed) {
      if (i.isOdd) {
        out.insert(0, l);
      } else {
        out.add(l);
      }
    }
    return out;
  }

  final front = centred(principals.take(photoFront).toList());
  final back = centred([...principals.skip(photoFront), ...rest].take(photoBack).toList());
  return (front: front, back: back, more: cast.length - front.length - back.length);
}

/// THE CAST PHOTOGRAPH, at the head of Characters: the whole cast stood together as for a company photograph, each as
/// their portrait or cameo (`cameo.dart`), overlapping a little, on a small stage with a light on the middle; the
/// principals in front, the minor and background cast behind and smaller. Under it, the caption of an old photograph:
/// "Front, from the left: … · Behind: …". A press on anyone opens them. With fewer than two, there is no photograph.
class CastPhoto extends StatelessWidget {
  const CastPhoto({super.key, required this.cast, required this.onOpen});

  final List<Listed> cast;
  final ValueChanged<Listed> onOpen;

  @override
  Widget build(BuildContext context) {
    if (cast.length < 2) return const SizedBox.shrink();
    final rows = castPhotoRows(cast);
    final scheme = Theme.of(context).colorScheme;
    String names(List<Listed> people) => people.map((l) => l.entry.name).join(', ');
    final caption = [
      'Front, from the left: ${names(rows.front)}',
      if (rows.back.isNotEmpty) 'Behind: ${names(rows.back)}',
      if (rows.more > 0) 'and ${rows.more} more',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [scheme.surfaceContainerHigh, scheme.surfaceContainerLow],
                ),
                border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.6)),
                borderRadius: BorderRadius.circular(12),
              ),
              // Its own layer: still while the page scrolls past it.
              child: RepaintBoundary(
                child: LayoutBuilder(
                  builder: (context, box) => _Stage(rows: rows, width: box.maxWidth, onOpen: onOpen),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            caption,
            textAlign: TextAlign.center,
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _Stage extends StatelessWidget {
  const _Stage({required this.rows, required this.width, required this.onOpen});

  final ({List<Listed> front, List<Listed> back, int more}) rows;
  final double width;
  final ValueChanged<Listed> onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const pad = 14.0;
    const overlap = 0.22;
    final room = width - pad * 2;
    double sizeFor(int n, double most) => n == 0 ? 0 : (room / (n * (1 - overlap) + overlap)).clamp(0, most);
    final fw = sizeFor(rows.front.length, 120);
    final bw = rows.back.isEmpty ? 0.0 : sizeFor(rows.back.length, fw * 0.74);
    final fh = fw * 1.26;
    final bh = bw * 1.26;
    final frontTop = rows.back.isEmpty ? pad : pad + bh * 0.5;
    final height = frontTop + fh + pad;

    List<Widget> row(List<Listed> people, double w, double h, double top) {
      final step = w * (1 - overlap);
      final span = w + step * (people.length - 1);
      final left = (width - span) / 2;
      return [
        for (final (i, l) in people.indexed)
          Positioned(
            left: left + step * i,
            top: top,
            width: w,
            height: h,
            child: _Figure(listed: l, onOpen: () => onOpen(l)),
          ),
      ];
    }

    return SizedBox(
      height: height,
      child: Stack(
        children: [
          // A light on the middle of the stage, and its edge.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, 0.15),
                  radius: 0.75,
                  colors: [scheme.primary.withValues(alpha: 0.16), scheme.primary.withValues(alpha: 0)],
                ),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: pad * 0.6,
            child: Container(height: 1.5, color: scheme.outlineVariant),
          ),
          ...row(rows.back, bw, bh, pad),
          ...row(rows.front, fw, fh, frontTop),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.listed, required this.onOpen});

  final Listed listed;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final l = listed;
    final art = NovelArt.of(context);
    final look = art.bound(castTone(l.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    final picture = uploadedImageBytes(l.entry.image) != null
        ? ClipOval(
            child: FittedBox(
              fit: BoxFit.cover,
              child: Portrait(name: l.entry.name, image: l.entry.image, focal: l.profile.focal, size: 126),
            ),
          )
        : Cameo(
            look: cameoLookOf(l.entry, l.profile),
            ground: look.ground,
            ink: look.ink,
            frame: art.system ? look.frame.withValues(alpha: 0.8) : look.ink.withValues(alpha: 0.6),
            bare: true,
          );
    return Semantics(
      button: true,
      label: [l.entry.name, ...l.profile.roles].join(', '),
      excludeSemantics: true,
      child: Tooltip(
        message: l.entry.name,
        child: GestureDetector(
          onTap: onOpen,
          behavior: HitTestBehavior.opaque,
          child: FittedBox(child: SizedBox(width: 100, height: 126, child: picture)),
        ),
      ),
    );
  }
}
