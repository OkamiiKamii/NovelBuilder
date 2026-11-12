import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app/theme/novel_art.dart';
import '../../../core/format.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/model/story_order.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone, presenceOf;
import 'cast_photo.dart' show castRank;
import 'portrait.dart';
import 'vault.dart';

/// The rings of the orbit, from the middle out.
enum OrbitRing {
  principals('Principals'),
  cast('The cast'),
  minor('Minor & background'),
  wings('In the wings');

  const OrbitRing(this.label);
  final String label;
}

typedef OrbitPlan = ({List<Listed> heart, Map<OrbitRing, List<Listed>> rings});

/// Who goes where in the orbit. At the heart, the protagonists (up to three, the most in the book first); with none,
/// the one character most in the book. Round them: the antagonists and supporting cast (and any more protagonists),
/// then those with no role, then the minor and background cast. While the book has chapters, anyone not on the page
/// yet waits in the wings, outermost. Each ring in reading order of where they first appear, then by name.
OrbitPlan orbitPlan(List<Listed> cast, {required bool hasChapters}) {
  int bySeen(Listed a, Listed b) {
    final s = b.seenIn.length.compareTo(a.seenIn.length);
    return s != 0 ? s : a.entry.name.compareTo(b.entry.name);
  }

  final leads = [
    for (final l in cast)
      if (castRank(l) == 0) l,
  ]..sort(bySeen);
  final heart = leads.isNotEmpty ? leads.take(3).toList() : ([...cast]..sort(bySeen)).take(1).toList();
  final rings = <OrbitRing, List<Listed>>{};
  for (final l in cast) {
    if (heart.contains(l)) continue;
    final rank = castRank(l);
    final ring = hasChapters && l.seenIn.isEmpty
        ? OrbitRing.wings
        : rank <= 2
        ? OrbitRing.principals
        : rank == 3
        ? OrbitRing.cast
        : OrbitRing.minor;
    (rings[ring] ??= []).add(l);
  }
  int firstOf(Listed l) => l.first < 0 ? 1 << 30 : l.first;
  for (final people in rings.values) {
    people.sort((a, b) {
      final f = firstOf(a).compareTo(firstOf(b));
      return f != 0 ? f : a.entry.name.compareTo(b.entry.name);
    });
  }
  return (
    heart: heart,
    rings: {
      for (final r in OrbitRing.values)
        if (rings.containsKey(r)) r: rings[r]!,
    },
  );
}

/// Of the heart and the principals, the one known least (and not yet well); with every one of them known well, the
/// least known of the rest. Null when the whole cast is known well.
Listed? nextToKnow(OrbitPlan plan, ({int known, int of}) Function(Listed l) known) {
  double part(Listed l) {
    final k = known(l);
    return k.of == 0 ? 1 : k.known / k.of;
  }

  Listed? least(Iterable<Listed> people) {
    Listed? best;
    for (final l in people) {
      final k = known(l);
      if (k.of == 0 || k.known >= k.of) continue;
      if (best == null || part(l) < part(best) || (part(l) == part(best) && l.seenIn.length > best.seenIn.length)) {
        best = l;
      }
    }
    return best;
  }

  return least([...plan.heart, ...?plan.rings[OrbitRing.principals]]) ??
      least([
        for (final r in OrbitRing.values)
          if (r != OrbitRing.principals) ...?plan.rings[r],
      ]);
}

/// ORBIT: the cast as an orrery round the heart of the book. The protagonists burn in the middle; round them, on
/// rings seen a little from above, the principals, the rest of the cast, the minor and background cast, and in the
/// wings (a broken ring, faint) those not on the page yet. Each ring runs clockwise from the top in the order they
/// enter the book. The more chapters a character is in, the larger they are; the more of those they share with the
/// heart, the brighter the line between them. The thin ring round each is how well the author knows them: of the
/// interview's questions, how many their profile answers. Under the orrery, the one to know next, with **Interview**.
///
/// It draws what is recorded and read from the text, and nothing else. A press on anyone opens them; a hover lights
/// their line to the heart.
class CastOrbit extends StatefulWidget {
  const CastOrbit({
    super.key,
    required this.found,
    required this.order,
    required this.onOpen,
    this.known,
    this.onInterview,
  });

  final List<Listed> found;
  final StoryOrder order;
  final void Function(Listed l) onOpen;
  final ({int known, int of}) Function(Listed l)? known;
  final void Function(Listed l)? onInterview;

  @override
  State<CastOrbit> createState() => _CastOrbitState();
}

class _CastOrbitState extends State<CastOrbit> with SingleTickerProviderStateMixin {
  // The cast rises into place once, ring after ring, as the view opens.
  late final _rise = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  String? _lit;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_rise.status == AnimationStatus.dismissed) {
      if (MediaQuery.of(context).disableAnimations) {
        _rise.value = 1;
      } else {
        _rise.forward();
      }
    }
  }

  @override
  void dispose() {
    _rise.dispose();
    super.dispose();
  }

  ({int known, int of}) _known(Listed l) => widget.known?.call(l) ?? (known: 0, of: 0);

  @override
  Widget build(BuildContext context) {
    final found = widget.found;
    if (found.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final order = widget.order;
    final chapters = order.chapters.length;
    final plan = orbitPlan(found, hasChapters: chapters > 0);
    final presence = {for (final l in found) l.entry.id: presenceOf(l, order)};
    final heartMarks = List.generate(chapters, (i) => plan.heart.any((h) => presence[h.entry.id]!.chapters[i]));
    double share(Listed l) {
      final p = presence[l.entry.id]!;
      if (p.count == 0) return 0;
      var together = 0;
      for (var i = 0; i < chapters; i++) {
        if (p.chapters[i] && heartMarks[i]) together++;
      }
      return together / p.count;
    }

    final most = presence.values.fold(0, (m, p) => math.max(m, p.count));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          container: true,
          label: 'Orbit of the cast',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  radius: 0.9,
                  colors: [
                    Color.alphaBlend(scheme.primary.withValues(alpha: 0.08), scheme.surfaceContainerHigh),
                    scheme.surfaceContainerLow,
                  ],
                ),
                border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.6)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: LayoutBuilder(
                builder: (context, box) => AnimatedBuilder(
                  animation: _rise,
                  builder: (context, _) => _sky(context, box.maxWidth, plan, presence, share, most),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _legend(context, plan, chapters > 0),
      ],
    );
  }

  Widget _sky(
    BuildContext context,
    double width,
    OrbitPlan plan,
    Map<String, ({List<bool> chapters, int count, int? first, int? last})> presence,
    double Function(Listed l) share,
    int most,
  ) {
    final scheme = Theme.of(context).colorScheme;
    final compact = width < 600;
    final height = compact ? width * 1.2 : (width * 0.56).clamp(440.0, 640.0);
    final unit = math.min(width, height);
    final big = (unit * (compact ? 0.13 : 0.15)).clamp(42.0, 84.0);
    final small = big * 0.6;
    final sun = (unit * 0.2).clamp(64.0, 112.0) * (plan.heart.length > 1 ? 0.8 : 1);
    final centre = Offset(width / 2, height / 2);
    final rx0 = width / 2 - big / 2 - 14;
    final ry0 = height / 2 - big / 2 - 22;
    final rings = plan.rings.entries.toList();
    final k = rings.length;
    final inner = math.max(0.4, (sun / 2 + big / 2 + 34) / ry0).clamp(0.0, 0.8);
    double reach(int i) => k == 1 ? (inner + 1) / 2 : inner + (0.98 - inner) * i / (k - 1);
    double rise(double from) => Curves.easeOutCubic.transform(((_rise.value - from) / 0.6).clamp(0.0, 1.0));
    // Where each ring is turned: so that no one sits straight behind someone on a ring further in (their line to the
    // heart would run through them), nor under the heart's name.
    // Measured on the page, so that where two rings run close (at their sides) they are kept apart as well.
    Offset onRing(double theta, double rx, double ry) => centre + Offset(rx * math.sin(theta), -ry * math.cos(theta));
    final taken = <Offset>[centre + Offset(0, sun / 2 + 10)];
    double turn(int n, double rx, double ry) {
      final step = 2 * math.pi / n;
      var best = 0.0;
      var widest = -1.0;
      for (var c = 0; c < 36; c++) {
        final offset = step * c / 36;
        var gap = double.infinity;
        for (var j = 0; j < n; j++) {
          final p = onRing(offset + step * j, rx, ry);
          for (final t in taken) {
            gap = math.min(gap, (p - t).distance);
          }
        }
        if (gap > widest + 1e-6) {
          widest = gap;
          best = offset;
        }
      }
      taken.addAll([for (var j = 0; j < n; j++) onRing(best + step * j, rx, ry)]);
      return best;
    }

    // The heart, side by side when there are two or three.
    final heartStep = sun * 0.62;
    final heartT = Curves.easeOutBack.transform((_rise.value / 0.45).clamp(0.0, 1.0));
    final hearts = [
      for (final (j, l) in plan.heart.indexed)
        (listed: l, at: centre + Offset((j - (plan.heart.length - 1) / 2) * heartStep, -8), size: sun * heartT),
    ];

    final orbits = <_Orbit>[];
    final bodies = <_Placed>[];
    for (final (i, MapEntry(key: ring, value: people)) in rings.indexed) {
      final f = reach(i);
      final rx = rx0 * f;
      final ry = ry0 * f;
      final t = rise(0.12 + i * 0.1);
      orbits.add(_Orbit(rx: rx, ry: ry, dashed: ring == OrbitRing.wings, shown: t));
      final n = people.length;
      final step = 2 * math.pi / n;
      final offset = turn(n, rx, ry);
      // Never so large as to touch the next on the ring, where the ring is tightest.
      final room = n == 1 ? big : ry * step * 0.9;
      for (final (j, l) in people.indexed) {
        final theta = offset + step * j - (1 - t) * 1.1;
        final r = 0.25 + 0.75 * t;
        final count = presence[l.entry.id]!.count;
        final grown = most == 0 ? 0.6 : math.sqrt(count / most);
        // Further back (the top of the ring), a little smaller.
        final depth = 0.86 + 0.14 * (1 - math.cos(theta)) / 2;
        final size = (math.min(small + (big - small) * grown, room) * depth).clamp(8.0, big);
        bodies.add(
          _Placed(
            listed: l,
            ring: ring,
            at: centre + Offset(rx * r * math.sin(theta), -ry * r * math.cos(theta)),
            size: size,
            share: share(l),
            shown: t,
            named: n <= (compact ? 8 : 12) && size >= 26,
          ),
        );
      }
    }
    bodies.sort((a, b) => a.at.dy.compareTo(b.at.dy));
    final heartAt = hearts.isEmpty
        ? centre
        : Offset(hearts.map((h) => h.at.dx).reduce((a, b) => a + b) / hearts.length, hearts.first.at.dy);
    final glow = hearts.isEmpty ? scheme.primary : castTone(hearts.first.listed.entry.id);

    Widget place(Listed l, Offset at, double size, {required bool heart, double shown = 1}) {
      final hit = math.max(size, 48.0);
      return Positioned(
        left: at.dx - hit / 2,
        top: at.dy - hit / 2,
        width: hit,
        height: hit,
        child: Opacity(
          opacity: shown.clamp(0.0, 1.0),
          child: _Body(
            listed: l,
            size: size,
            known: widget.known == null ? null : _known(l),
            heart: heart,
            lit: _lit == l.entry.id,
            faint: !heart && l.seenIn.isEmpty && widget.order.chapters.isNotEmpty,
            where: _where(presence[l.entry.id]!),
            onOpen: () => widget.onOpen(l),
            onHover: (on) => setState(() => _lit = on ? l.entry.id : (_lit == l.entry.id ? null : _lit)),
          ),
        ),
      );
    }

    // A name on a small plate over the lines; on a phone, the first name only (the whole on a press or a hover).
    Widget name(Listed l, Offset at, double size, {required bool heart, double shown = 1}) => Positioned(
      left: at.dx - 70,
      top: at.dy + size / 2 + (heart ? 6 : 2),
      width: 140,
      child: IgnorePointer(
        child: Opacity(
          opacity: shown.clamp(0.0, 1.0),
          child: ExcludeSemantics(
            child: Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerLow.withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  child: Text(
                    compact && !heart ? l.entry.name.trim().split(RegExp(r'\s+')).first : l.entry.name,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: heart
                        ? vaultHeading(context, size: 14, weight: 700, color: scheme.onSurface)
                        : Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurface),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    return SizedBox(
      height: height,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _SkyPainter(
                centre: centre,
                heartAt: heartAt,
                heartSize: sun,
                glow: glow,
                orbits: orbits,
                tethers: [
                  for (final b in bodies)
                    if (b.share > 0 || _lit == b.listed.entry.id)
                      (
                        to: b.at,
                        strength: b.share * b.shown,
                        tone: castTone(b.listed.entry.id),
                        lit: _lit == b.listed.entry.id,
                      ),
                ],
                star: scheme.onSurfaceVariant,
                line: scheme.outlineVariant,
              ),
            ),
          ),
          for (final b in bodies) ...[
            place(b.listed, b.at, b.size, heart: false, shown: b.shown),
            if (b.named) name(b.listed, b.at, b.size, heart: false, shown: b.shown),
          ],
          for (final h in hearts) place(h.listed, h.at, math.max(h.size, 1), heart: true, shown: heartT),
          for (final h in hearts) name(h.listed, h.at, sun, heart: true, shown: heartT),
        ],
      ),
    );
  }

  String? _where(({List<bool> chapters, int count, int? first, int? last}) p) {
    final chapters = widget.order.chapters.length;
    if (chapters == 0) return null;
    if (p.count == 0) return 'not on the page yet';
    return 'in ${formatNumber(p.count)} of ${plural(chapters, 'chapter')}';
  }

  Widget _legend(BuildContext context, OrbitPlan plan, bool hasChapters) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    String first(Listed l) => l.entry.name.trim().split(RegExp(r'\s+')).first;
    String and(List<String> names) =>
        names.length <= 1 ? names.join() : '${names.take(names.length - 1).join(', ')} and ${names.last}';
    final heartNames = and([for (final l in plan.heart) l.entry.name]);
    final lead = plan.heart.length == 1 ? first(plan.heart.single) : 'the heart';
    final caption = [
      'At the heart, $heartNames; round them, clockwise from the top in the order they enter the book.',
      if (hasChapters)
        'The larger, the more chapters they are in; the brighter the line, the more they share the page with $lead.',
      if (widget.known != null) 'The ring round each is how well you know them.',
    ].join(' ');
    final next = widget.known == null ? null : nextToKnow(plan, _known);
    final wings = plan.rings[OrbitRing.wings] ?? const <Listed>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 6,
          alignment: WrapAlignment.center,
          children: [
            for (final MapEntry(key: ring, value: people) in plan.rings.entries)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ExcludeSemantics(
                    child: CustomPaint(
                      size: const Size(22, 10),
                      painter: _RingSample(color: scheme.outline, dashed: ring == OrbitRing.wings),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${ring.label} · ${formatNumber(people.length)}',
                    style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          caption,
          textAlign: TextAlign.center,
          style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
        ),
        if (next != null && widget.onInterview != null) ...[
          const SizedBox(height: 14),
          _NextToKnow(
            listed: next,
            known: _known(next),
            standing: plan.heart.contains(next)
                ? 'at the heart of the book'
                : (plan.rings[OrbitRing.principals]?.contains(next) ?? false)
                ? 'one of your principals'
                : 'in the cast',
            onInterview: () => widget.onInterview!(next),
          ),
        ],
        if (wings.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            'In the wings, not on the page yet: ${and([for (final l in wings.take(6)) l.entry.name])}'
            '${wings.length > 6 ? ' and ${formatNumber(wings.length - 6)} more' : ''}.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}

class _Placed {
  _Placed({
    required this.listed,
    required this.ring,
    required this.at,
    required this.size,
    required this.share,
    required this.shown,
    required this.named,
  });

  final Listed listed;
  final OrbitRing ring;
  final Offset at;
  final double size;
  final double share;
  final double shown;
  final bool named;
}

class _Orbit {
  const _Orbit({required this.rx, required this.ry, required this.dashed, required this.shown});

  final double rx;
  final double ry;
  final bool dashed;
  final double shown;
}

typedef _Tether = ({Offset to, double strength, Color tone, bool lit});

/// One body of the orbit: the character's picture or cameo in a circle, the ring of how well they are known round
/// it; the heart with a corona in their colour.
class _Body extends StatelessWidget {
  const _Body({
    required this.listed,
    required this.size,
    required this.known,
    required this.heart,
    required this.lit,
    required this.faint,
    required this.where,
    required this.onOpen,
    required this.onHover,
  });

  final Listed listed;
  final double size;
  final ({int known, int of})? known;
  final bool heart;
  final bool lit;
  final bool faint;
  final String? where;
  final VoidCallback onOpen;
  final ValueChanged<bool> onHover;

  @override
  Widget build(BuildContext context) {
    final l = listed;
    final scheme = Theme.of(context).colorScheme;
    final tone = castTone(l.entry.id);
    final band = size < 22 ? 0.0 : (size * 0.06).clamp(2.0, 4.0);
    final face = size < 22
        ? DecoratedBox(
            decoration: BoxDecoration(shape: BoxShape.circle, color: tone),
          )
        : _Face(listed: l);
    final k = known;
    final visual = SizedBox.square(
      dimension: size,
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.surfaceContainerLowest,
              boxShadow: [
                if (heart || lit)
                  BoxShadow(
                    color: tone.withValues(alpha: heart ? 0.55 : 0.45),
                    blurRadius: heart ? size * 0.45 : size * 0.35,
                    spreadRadius: heart ? size * 0.04 : 1,
                  ),
              ],
            ),
          ),
          Padding(padding: EdgeInsets.all(band == 0 ? 0 : band + 1.5), child: face),
          if (k != null && k.of > 0 && band > 0)
            CustomPaint(
              painter: _KnownRing(
                part: k.known / k.of,
                width: band,
                track: scheme.outlineVariant.withValues(alpha: 0.7),
                lit: scheme.primary,
              ),
            ),
        ],
      ),
    );
    final label = [
      l.entry.name,
      ...l.profile.roles,
      if (heart) 'at the heart',
      ?where,
      if (k != null && k.of > 0) k.known >= k.of ? 'known well' : 'known ${k.known} of ${k.of}',
    ].join(', ');
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: [
          l.entry.name,
          if (l.profile.roles.isNotEmpty) l.profile.roles.join(', '),
          if (where != null) '${where![0].toUpperCase()}${where!.substring(1)}',
          if (k != null && k.of > 0) k.known >= k.of ? 'Known well' : 'Known ${k.known} of ${k.of}',
        ].join(' · '),
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => onHover(true),
          onExit: (_) => onHover(false),
          child: GestureDetector(
            onTap: onOpen,
            behavior: HitTestBehavior.opaque,
            child: Center(
              child: AnimatedScale(
                scale: lit ? 1.12 : 1,
                duration: const Duration(milliseconds: 160),
                child: Opacity(opacity: faint ? 0.6 : 1, child: visual),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A character's face in a circle: their picture, or their cameo on their own colour (`cameo.dart`).
class _Face extends StatelessWidget {
  const _Face({required this.listed});

  final Listed listed;

  @override
  Widget build(BuildContext context) {
    final l = listed;
    final tone = castTone(l.entry.id);
    final bytes = uploadedImageBytes(l.entry.image);
    if (bytes != null) {
      final f = l.profile.focal;
      return ClipOval(
        child: Image.memory(
          bytes,
          fit: BoxFit.cover,
          alignment: Alignment(f.x / 50 - 1, f.y / 50 - 1),
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => ColoredBox(color: tone),
        ),
      );
    }
    final art = NovelArt.of(context);
    final look = art.bound(tone, lift: 0.1, sink: 0.45, tinted: true);
    return Cameo(
      look: cameoLookOf(l.entry, l.profile),
      ground: look.ground,
      ink: look.ink,
      frame: art.system ? look.frame.withValues(alpha: 0.8) : look.ink.withValues(alpha: 0.6),
      bare: true,
    );
  }
}

/// THE ONE TO KNOW NEXT, under the orbit: their small portrait, "Ilse is one of your principals, and you know them
/// 3 of 12", and **Interview Ilse**.
class _NextToKnow extends StatelessWidget {
  const _NextToKnow({required this.listed, required this.known, required this.standing, required this.onInterview});

  final Listed listed;
  final ({int known, int of}) known;
  final String standing;
  final VoidCallback onInterview;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = listed;
    final firstName = l.entry.name.trim().split(RegExp(r'\s+')).first;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Material(
          color: scheme.primaryContainer.withValues(alpha: 0.45),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: scheme.primary.withValues(alpha: 0.35)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Wrap(
              spacing: 14,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox.square(dimension: 40, child: _Face(listed: l)),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: l.entry.name,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            TextSpan(text: ' is $standing, and you know them ${known.known} of ${known.of}.'),
                          ],
                        ),
                        style: vaultText(context, size: 16, color: scheme.onSurface),
                      ),
                    ),
                  ],
                ),
                FilledButton.icon(
                  onPressed: onInterview,
                  icon: const Icon(Icons.record_voice_over_outlined),
                  label: Text('Interview $firstName'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _KnownRing extends CustomPainter {
  _KnownRing({required this.part, required this.width, required this.track, required this.lit});

  final double part;
  final double width;
  final Color track;
  final Color lit;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = (Offset.zero & size).deflate(width / 2);
    canvas.drawOval(
      rect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..color = track,
    );
    if (part <= 0) return;
    canvas.drawArc(
      rect,
      -math.pi / 2,
      2 * math.pi * part.clamp(0.0, 1.0),
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..strokeCap = StrokeCap.round
        ..color = lit,
    );
  }

  @override
  bool shouldRepaint(_KnownRing old) => old.part != part || old.width != width || old.track != track || old.lit != lit;
}

/// The sky behind the orbit: a scatter of faint stars, the heart's glow, the rings (the wings' broken), and the lines
/// from the heart to each who shares the page with it.
class _SkyPainter extends CustomPainter {
  _SkyPainter({
    required this.centre,
    required this.heartAt,
    required this.heartSize,
    required this.glow,
    required this.orbits,
    required this.tethers,
    required this.star,
    required this.line,
  });

  final Offset centre;
  final Offset heartAt;
  final double heartSize;
  final Color glow;
  final List<_Orbit> orbits;
  final List<_Tether> tethers;
  final Color star;
  final Color line;

  @override
  void paint(Canvas canvas, Size size) {
    // The same stars every time: a fixed seed.
    final random = math.Random(7);
    final dot = Paint();
    for (var i = 0; i < 90; i++) {
      final p = Offset(random.nextDouble() * size.width, random.nextDouble() * size.height);
      dot.color = star.withValues(alpha: 0.08 + random.nextDouble() * 0.22);
      canvas.drawCircle(p, 0.4 + random.nextDouble() * 1.0, dot);
    }
    canvas.drawCircle(
      heartAt,
      heartSize * 1.9,
      Paint()
        ..shader = RadialGradient(
          colors: [glow.withValues(alpha: 0.28), glow.withValues(alpha: 0)],
        ).createShader(Rect.fromCircle(center: heartAt, radius: heartSize * 1.9)),
    );
    for (final o in orbits) {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = line.withValues(alpha: (o.dashed ? 0.6 : 0.85) * o.shown);
      final rect = Rect.fromCenter(center: centre, width: o.rx * 2, height: o.ry * 2);
      if (!o.dashed) {
        canvas.drawOval(rect, paint);
        continue;
      }
      final path = Path()..addOval(rect);
      for (final metric in path.computeMetrics()) {
        for (var d = 0.0; d < metric.length; d += 12) {
          canvas.drawPath(metric.extractPath(d, math.min(d + 6, metric.length)), paint);
        }
      }
    }
    for (final t in tethers) {
      final strength = t.lit ? 1.0 : t.strength;
      // A gentle arc, every one bent the same way round, as if the cast were turning about the heart.
      final mid = Offset.lerp(heartAt, t.to, 0.5)!;
      final along = t.to - heartAt;
      final bend = mid + Offset(-along.dy, along.dx) * 0.16;
      canvas.drawPath(
        Path()
          ..moveTo(heartAt.dx, heartAt.dy)
          ..quadraticBezierTo(bend.dx, bend.dy, t.to.dx, t.to.dy),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = t.lit ? 2.4 : 0.8 + 1.6 * strength
          ..strokeCap = StrokeCap.round
          ..color = Color.lerp(line, t.tone, 0.4 + 0.6 * strength)!.withValues(alpha: 0.12 + 0.55 * strength),
      );
    }
  }

  @override
  bool shouldRepaint(_SkyPainter old) => true;
}

class _RingSample extends CustomPainter {
  _RingSample({required this.color, required this.dashed});

  final Color color;
  final bool dashed;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.6;
    final y = size.height / 2;
    if (!dashed) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      return;
    }
    for (var x = 0.0; x < size.width; x += 7) {
      canvas.drawLine(Offset(x, y), Offset(math.min(x + 4, size.width), y), paint);
    }
  }

  @override
  bool shouldRepaint(_RingSample old) => old.color != color || old.dashed != dashed;
}
