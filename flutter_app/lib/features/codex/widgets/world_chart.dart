import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app/theme/book_faces.dart';
import '../../../core/format.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/places/explore.dart';
import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/entry.dart';
import '../../characters/character_actions.dart';
import '../../characters/widgets/cast_card.dart' show castTone, monogram;
import 'entry_bits.dart';

/// One place on the chart: the places inside it, and the world's entries tied to it (its seals).
class ChartPlace {
  ChartPlace(this.entry, this.depth, this.chapters);

  final Entry entry;
  final int depth;

  /// How many chapters it figures in (linked or named there).
  final int chapters;
  final children = <ChartPlace>[];
  final seals = <Entry>[];
}

typedef WorldChartData = ({List<ChartPlace> islands, List<Entry> adrift});

/// What the chart shows, read from the records and nothing else. Every place, inside what it is "Located in" (the
/// place tree, `explore.dart`); the world's other entries (not places, not characters) each set on the shore of the
/// place it is linked to (the first of them in the tree, when several); and those linked to no place, adrift.
WorldChartData worldChartOf(StoryModel model, Map<String, Set<int>> chapters) {
  final rows = placeTree(model);
  final byId = <String, ChartPlace>{};
  final order = <String, int>{};
  final islands = <ChartPlace>[];
  for (final (i, row) in rows.indexed) {
    final p = ChartPlace(row.entry, row.depth, chapters[row.entry.id]?.length ?? 0);
    byId[row.entry.id] = p;
    order[row.entry.id] = i;
    final up = row.parentId == null ? null : byId[row.parentId];
    if (up == null) {
      islands.add(p);
    } else {
      up.children.add(p);
    }
  }
  bool worldly(Entry? e) => e != null && e.category != 'character' && e.category != 'location';
  final tiedTo = <String, String>{};
  for (final l in model.links) {
    if (!l.isEntryLink) continue;
    for (final (a, b) in [(l.fromId, l.toId), (l.toId, l.fromId)]) {
      if (!worldly(model.entries[a]) || !byId.containsKey(b)) continue;
      final was = tiedTo[a];
      if (was == null || order[b]! < order[was]!) tiedTo[a] = b;
    }
  }
  final adrift = <Entry>[];
  final others = [
    for (final e in model.entries.values)
      if (worldly(e)) e,
  ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  for (final e in others) {
    if (tiedTo[e.id] case final at?) {
      byId[at]!.seals.add(e);
    } else {
      adrift.add(e);
    }
  }
  return (islands: islands, adrift: adrift);
}

/// The words a link from an entry to the place it belongs in is recorded with, by its kind.
String belongsWord(String kind) => switch (kind) {
  'faction' => 'holds power in',
  'item' => 'kept in',
  'power' => 'known in',
  'lore' => 'remembered in',
  _ => 'found in',
};

// ------------------------------------------------------------------------------------------------------------- layout

class _Disc {
  _Disc(this.place);

  final ChartPlace place;
  double r = 0;

  /// From the centre of what it is inside (or of the chart).
  Offset at = Offset.zero;
  final kids = <_Disc>[];
}

double _ownRadius(ChartPlace p) => 14 * math.pow(1 + p.chapters, 0.35).toDouble();

/// A place's disc: its own size, or round the places inside it with a band above them for its name.
_Disc _discOf(ChartPlace p, double Function(ChartPlace p) least) {
  final d = _Disc(p)..kids.addAll(p.children.map((c) => _discOf(c, least)));
  if (d.kids.isEmpty) return d..r = _ownRadius(p);
  _pack(d.kids, gap: 4);
  final enclose = d.kids.fold(0.0, (m, k) => math.max(m, k.at.distance + k.r));
  final band = 10 + enclose * 0.12;
  for (final k in d.kids) {
    k.at += Offset(0, band * 0.55);
  }
  return d..r = math.max(math.max(_ownRadius(p) * 1.15, enclose + band), least(p));
}

/// Packs [discs] round the middle, largest first, each where it touches those already set and lies nearest the middle
/// ([aspect] wider than tall reads "nearest" across an ellipse, to fill a wide chart). Then centres them.
void _pack(List<_Disc> discs, {required double gap, double aspect = 1}) {
  if (discs.isEmpty) return;
  discs.sort((a, b) => b.r.compareTo(a.r));
  double score(Offset p) => (p.dx / aspect) * (p.dx / aspect) + p.dy * p.dy;
  final placed = <_Disc>[];
  bool free(Offset p, double r) {
    for (final o in placed) {
      if ((o.at - p).distance < o.r + r + gap - 1e-6) return false;
    }
    return true;
  }

  final many = discs.length > 40;
  var turn = 1;
  for (final d in discs) {
    if (placed.isEmpty) {
      d.at = Offset.zero;
      placed.add(d);
      continue;
    }
    if (many) {
      // A great many: out along a sunflower's spiral, to the first free spot.
      final step = discs.first.r * 0.9 + gap;
      while (true) {
        final a = turn * 2.399963;
        final p = Offset(math.cos(a) * aspect, math.sin(a)) * step * math.sqrt(turn.toDouble());
        turn++;
        if (free(p, d.r)) {
          d.at = p;
          break;
        }
      }
      placed.add(d);
      continue;
    }
    Offset? best;
    var bestScore = double.infinity;
    void consider(Offset p) {
      final s = score(p);
      if (s < bestScore && free(p, d.r)) {
        bestScore = s;
        best = p;
      }
    }

    for (final a in placed) {
      for (var k = 0; k < 12; k++) {
        final t = k * math.pi / 6;
        consider(a.at + Offset(math.cos(t), math.sin(t)) * (a.r + d.r + gap));
      }
    }
    for (var i = 0; i < placed.length; i++) {
      for (var j = i + 1; j < placed.length; j++) {
        final a = placed[i];
        final b = placed[j];
        final ra = a.r + d.r + gap;
        final rb = b.r + d.r + gap;
        final between = b.at - a.at;
        final dist = between.distance;
        if (dist == 0 || dist > ra + rb || dist < (ra - rb).abs()) continue;
        final along = (ra * ra - rb * rb + dist * dist) / (2 * dist);
        final h = math.sqrt(math.max(0, ra * ra - along * along));
        final unit = between / dist;
        final mid = a.at + unit * along;
        final across = Offset(-unit.dy, unit.dx) * h;
        consider(mid + across);
        consider(mid - across);
      }
    }
    d.at = best ?? Offset(placed.fold(0.0, (m, o) => math.max(m, o.at.dx + o.r)) + d.r + gap, 0);
    placed.add(d);
  }
  final box = _boundsOf(discs);
  for (final d in discs) {
    d.at -= box.center;
  }
}

Rect _boundsOf(List<_Disc> discs) =>
    discs.map((d) => Rect.fromCircle(center: d.at, radius: d.r)).reduce((a, b) => a.expandToInclude(b));

class _Drawn {
  _Drawn(this.place, this.centre, this.r);

  final ChartPlace place;
  final Offset centre;
  final double r;
}

typedef _Seal = ({Entry entry, Offset at, double r, int more});

// ------------------------------------------------------------------------------------------------------------- widget

/// THE CHART OF THE WORLD, at the head of "The whole world": the world as the book holds it, drawn as an old sea
/// chart. Each place at the top of the world is an island; the places inside it lie within its shore, their borders
/// dashed as a map draws a border, however deep; the more chapters a place figures in, the larger it is. On each
/// shore, as seals, the factions, items, powers and lore linked to it. The world's entries linked to no place float
/// **adrift** in the sea below; a press on one asks where it belongs, and records it in a press.
///
/// Nothing is placed by guesswork: where a place lies on the chart says only what it is inside, never a direction or
/// a distance (a map with coordinates is the Journeys map's). A press on any place or seal opens it.
class WorldChart extends StatefulWidget {
  const WorldChart({
    super.key,
    required this.model,
    required this.chapters,
    required this.kindOf,
    required this.title,
    required this.novelId,
    required this.onOpen,
  });

  final StoryModel model;
  final Map<String, Set<int>> chapters;
  final Category Function(Entry e) kindOf;
  final String title;
  final String novelId;
  final ValueChanged<Entry> onOpen;

  @override
  State<WorldChart> createState() => _WorldChartState();
}

class _WorldChartState extends State<WorldChart> {
  String? _lit;

  @override
  Widget build(BuildContext context) {
    final data = worldChartOf(widget.model, widget.chapters);
    if (data.islands.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    final placesCount = _count(data.islands);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            container: true,
            label:
                'Chart of the world: ${plural(placesCount, 'place')}'
                '${data.adrift.isEmpty ? '' : ', ${formatNumber(data.adrift.length)} adrift'}',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: LayoutBuilder(builder: (context, box) => _chart(context, box.maxWidth, data)),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            [
              'Each place an island, the places inside it within its shore; the larger, the more chapters it is in. '
                  'On each shore, what is linked to it.',
              if (data.adrift.isNotEmpty)
                '${formatNumber(data.adrift.length)} adrift, linked to no place: press one to say where it belongs.',
            ].join(' '),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant, fontStyle: FontStyle.italic),
          ),
        ],
      ),
    );
  }

  int _count(List<ChartPlace> places) => places.fold(0, (n, p) => n + 1 + _count(p.children));

  Widget _chart(BuildContext context, double width, WorldChartData data) {
    final scheme = Theme.of(context).colorScheme;
    final compact = width < 600;
    final sea = data.adrift.isEmpty ? 0.0 : 84.0;
    const margin = 34.0;
    const cartouche = 40.0;
    final most = (compact ? width * 1.25 : (width * 0.46).clamp(380.0, 580.0)) + sea;
    final roomWidth = width - margin * 2;
    final roomHeight = most - margin * 2 - cartouche - sea;

    // How wide each name with places inside it is, at the least size it is written (on the chart, in pixels).
    final faces = BookFaces.of(context);
    final nameWidth = <String, double>{};
    void measure(List<ChartPlace> places) {
      for (final p in places) {
        if (p.children.isNotEmpty) {
          final size = p.depth == 0 ? 10.0 : 9.0;
          nameWidth[p.entry.id] = (TextPainter(
            text: TextSpan(
              text: p.depth == 0 || !faces.headingCaps ? p.entry.name.toUpperCase() : p.entry.name,
              style: TextStyle(fontFamily: faces.heading, fontSize: size, letterSpacing: size * 0.18),
            ),
            textDirection: TextDirection.ltr,
            maxLines: 1,
          )..layout()).width;
          measure(p.children);
        }
      }
    }

    measure(data.islands);

    // Lay the world out: the islands packed wide, square or tall, whichever draws the world largest in the chart;
    // then again with each place made large enough to hold its own name inside its shore, at the size it is drawn.
    var islands = <_Disc>[];
    var bestAspect = roomWidth / roomHeight;
    var bestScale = -1.0;
    // Never more than half as large again as it would be: how much the book is there still decides its size.
    final natural = <String, double>{};
    double least(ChartPlace p) {
      if (bestScale <= 0) return 0;
      final own = natural[p.entry.id] ?? double.infinity;
      return math.min(((nameWidth[p.entry.id] ?? 0) / 2 + 8) / 0.82 / bestScale, own * 1.5);
    }

    void remember(_Disc d) {
      natural[d.place.entry.id] = d.r;
      d.kids.forEach(remember);
    }

    for (var round = 0; round < 3; round++) {
      islands = [for (final p in data.islands) _discOf(p, least)];
      if (round == 0) islands.forEach(remember);
      var roundAspect = bestAspect;
      var roundScale = -1.0;
      for (final aspect in islands.length > 40 ? [bestAspect] : [roomWidth / roomHeight, 0.5, 0.75, 1.0, 1.5, 2.2]) {
        _pack(islands, gap: 18, aspect: aspect);
        final b = _boundsOf(islands);
        final s = math.min(roomWidth / b.width, roomHeight / b.height);
        if (s > roundScale + 1e-9) {
          roundScale = s;
          roundAspect = aspect;
        }
      }
      bestAspect = roundAspect;
      bestScale = roundScale;
      if (nameWidth.isEmpty) break;
    }
    _pack(islands, gap: 18, aspect: bestAspect);
    final bounds = _boundsOf(islands);
    final scale = bestScale;
    // No taller than what is drawn needs.
    final height = math.min(most, bounds.height * scale + margin * 2 + cartouche + sea + 8);
    final room = Rect.fromLTRB(margin, margin + cartouche, width - margin, height - margin - sea);
    final drawn = <_Drawn>[];
    void lay(_Disc d, Offset parent) {
      final centre = parent + d.at * scale;
      drawn.add(_Drawn(d.place, centre, d.r * scale));
      for (final k in d.kids) {
        lay(k, centre);
      }
    }

    for (final d in islands) {
      lay(d, room.center - bounds.center * scale);
    }

    // The seals: along the foot of each shore, six at most and "+N".
    final seals = <_Seal>[];
    for (final d in drawn) {
      final list = d.place.seals;
      if (list.isEmpty || d.r < 14) continue;
      final shown = list.length > 6 ? 5 : list.length;
      final sealR = (d.r * 0.13).clamp(7.0, 11.0);
      final spread = math.min(0.32, (sealR * 2.6) / d.r);
      final total = shown + (list.length > shown ? 1 : 0);
      for (var i = 0; i < total; i++) {
        final a = math.pi / 2 + (i - (total - 1) / 2) * spread;
        final at = d.centre + Offset(math.cos(a), math.sin(a)) * (d.r * 0.97);
        seals.add((
          entry: i < shown ? list[i] : list[shown],
          at: at,
          r: sealR,
          more: i < shown ? 0 : list.length - shown,
        ));
      }
    }

    // Adrift: in a row across the sea at the foot, as many as there is room for, then "+N".
    final adrift = <_Seal>[];
    if (data.adrift.isNotEmpty) {
      const slot = 86.0;
      final startX = compact ? margin + 18 : margin + 120;
      final fits = math.max(1, ((width - startX - margin) / slot).floor());
      final shown = data.adrift.length > fits ? fits - 1 : data.adrift.length;
      final y = height - sea / 2 - 6;
      for (var i = 0; i < shown; i++) {
        adrift.add((entry: data.adrift[i], at: Offset(startX + slot * (i + 0.5), y), r: 12, more: 0));
      }
      if (shown < data.adrift.length) {
        adrift.add((
          entry: data.adrift[shown],
          at: Offset(startX + slot * (shown + 0.5), y),
          r: 12,
          more: data.adrift.length - shown,
        ));
      }
    }

    Color sealColor(Entry e) => kindColor(widget.kindOf(e));

    Widget hit(Offset at, double r, String label, String tip, VoidCallback onTap, {String? id}) {
      final h = math.max(r, 24.0);
      return Positioned(
        left: at.dx - h,
        top: at.dy - h,
        width: h * 2,
        height: h * 2,
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: Tooltip(
            message: tip,
            child: ClipOval(
              child: MouseRegion(
                cursor: SystemMouseCursors.click,
                onEnter: id == null ? null : (_) => setState(() => _lit = id),
                onExit: id == null ? null : (_) => setState(() => _lit = _lit == id ? null : _lit),
                child: GestureDetector(onTap: onTap, behavior: HitTestBehavior.opaque),
              ),
            ),
          ),
        ),
      );
    }

    String where(ChartPlace p) {
      final inside = p.children.length;
      return [
        if (widget.model.order.chapters.isNotEmpty)
          p.chapters == 0 ? 'not in the manuscript yet' : 'in ${plural(p.chapters, 'chapter')}',
        if (inside > 0) '${plural(inside, 'place')} inside',
        if (p.seals.isNotEmpty) '${formatNumber(p.seals.length)} on its shore',
      ].join(', ');
    }

    return SizedBox(
      height: height,
      child: Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _ChartPainter(
                drawn: drawn,
                seals: seals,
                adrift: adrift,
                seaHeight: sea,
                compact: compact,
                title: widget.title,
                lit: _lit,
                sealColor: sealColor,
                face: BookFaces.of(context).heading,
                book: BookFaces.of(context).text,
                caps: BookFaces.of(context).headingCaps,
                brightness: Theme.of(context).brightness,
                scheme: scheme,
              ),
            ),
          ),
          for (final d in drawn)
            if (d.r >= 6)
              hit(
                d.centre,
                d.r,
                '${d.place.entry.name}, a place on the chart, ${where(d.place)}',
                [d.place.entry.name, where(d.place)].where((s) => s.isNotEmpty).join(' · '),
                () => widget.onOpen(d.place.entry),
                id: d.place.entry.id,
              ),
          for (final s in seals)
            s.more > 0
                ? hit(
                    s.at,
                    s.r,
                    '${s.more} more on this shore',
                    '${s.more} more',
                    () => _list(context, 'On this shore', [
                      for (final d in drawn)
                        if (d.place.seals.contains(s.entry)) ...d.place.seals,
                    ], place: false),
                  )
                : hit(
                    s.at,
                    s.r,
                    '${s.entry.name}, ${widget.kindOf(s.entry).singular}, on the shore',
                    '${s.entry.name} · ${widget.kindOf(s.entry).singular}',
                    () => widget.onOpen(s.entry),
                    id: s.entry.id,
                  ),
          for (final s in adrift)
            s.more > 0
                ? hit(
                    s.at,
                    s.r,
                    '${s.more} more adrift. Say where they belong',
                    '${s.more} more adrift',
                    () => _list(context, 'Adrift', data.adrift, place: true),
                  )
                : hit(
                    s.at,
                    s.r,
                    '${s.entry.name}, adrift: linked to no place. Say where it belongs',
                    '${s.entry.name} · adrift: where does it belong?',
                    () => _belong(context, s.entry, data),
                    id: s.entry.id,
                  ),
        ],
      ),
    );
  }

  /// Several entries in a sheet: a press opens one, or (adrift) asks where it belongs.
  Future<void> _list(BuildContext context, String heading, List<Entry> entries, {required bool place}) =>
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (sheet) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(heading, style: Theme.of(sheet).textTheme.titleMedium),
              ),
              for (final e in entries)
                ListTile(
                  leading: EntryThumb(entry: e, color: kindColor(widget.kindOf(e)), size: 32),
                  title: Text(e.name),
                  subtitle: Text(widget.kindOf(e).singular),
                  trailing: place ? const Text('Place it') : null,
                  onTap: () {
                    Navigator.of(sheet).pop();
                    if (place) {
                      _belong(context, e, worldChartOf(widget.model, widget.chapters));
                    } else {
                      widget.onOpen(e);
                    }
                  },
                ),
            ],
          ),
        ),
      );

  /// WHERE DOES IT BELONG? Every place in the world, as the tree has them, and a press links the entry to the one
  /// chosen ("The Lantern Guild holds power in Old Merrow"). It then stands on that place's shore.
  Future<void> _belong(BuildContext context, Entry entry, WorldChartData data) {
    final places = <(ChartPlace, int)>[];
    void walk(List<ChartPlace> list) {
      for (final p in list) {
        places.add((p, p.depth));
        walk(p.children);
      }
    }

    walk(data.islands);
    final word = belongsWord(entry.category);
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheet).height * 0.7),
          child: ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                child: Text('Where does ${entry.name} belong?', style: Theme.of(sheet).textTheme.titleMedium),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(
                  'It is linked to the place you choose (“$word”), and stands on its shore.',
                  style: Theme.of(sheet).textTheme.bodySmall,
                ),
              ),
              for (final (p, depth) in places)
                ListTile(
                  contentPadding: EdgeInsets.only(left: 20.0 + depth * 20, right: 20),
                  leading: Icon(depth == 0 ? Icons.landscape_outlined : Icons.subdirectory_arrow_right, size: 20),
                  title: Text(p.entry.name),
                  onTap: () {
                    Navigator.of(sheet).pop();
                    final actions = CharacterActions(context, widget.novelId);
                    final made = actions.now((c) => c.linkEntries(entry.id, p.entry.id, word));
                    if (made != null) {
                      actions.tell(
                        '${entry.name} $word ${p.entry.name}.',
                        actionLabel: 'Open',
                        onAction: () => widget.onOpen(entry),
                      );
                    }
                  },
                ),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                leading: const Icon(Icons.open_in_new, size: 20),
                title: Text('Open ${entry.name}'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  widget.onOpen(entry);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------------------------- drawing

int _seedOf(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return h;
}

/// A shore round [centre]: a circle of radius [r] worn irregular, the same for the same place every time.
Path _shore(Offset centre, double r, int seed, double wear) {
  final random = math.Random(seed);
  final waves = [
    for (var k = 0; k < 4; k++)
      (f: (2 + k * 2 + random.nextInt(2)).toDouble(), phase: random.nextDouble() * 2 * math.pi, w: 1 / (k + 1)),
  ];
  const n = 72;
  final points = <Offset>[];
  for (var i = 0; i < n; i++) {
    final t = i / n * 2 * math.pi;
    var bump = 0.0;
    for (final w in waves) {
      bump += w.w * math.sin(w.f * t + w.phase);
    }
    final rr = r * (1 + wear * bump / 2.08);
    points.add(centre + Offset(math.cos(t), math.sin(t)) * rr);
  }
  final path = Path();
  final first = Offset.lerp(points.last, points.first, 0.5)!;
  path.moveTo(first.dx, first.dy);
  for (var i = 0; i < n; i++) {
    final p = points[i];
    final next = Offset.lerp(p, points[(i + 1) % n], 0.5)!;
    path.quadraticBezierTo(p.dx, p.dy, next.dx, next.dy);
  }
  return path..close();
}

void _dashed(Canvas canvas, Path path, Paint paint, {double on = 5, double off = 4}) {
  for (final metric in path.computeMetrics()) {
    for (var d = 0.0; d < metric.length; d += on + off) {
      canvas.drawPath(metric.extractPath(d, math.min(d + on, metric.length)), paint);
    }
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({
    required this.drawn,
    required this.seals,
    required this.adrift,
    required this.seaHeight,
    required this.compact,
    required this.title,
    required this.lit,
    required this.sealColor,
    required this.face,
    required this.book,
    required this.caps,
    required this.brightness,
    required this.scheme,
  });

  final List<_Drawn> drawn;
  final List<_Seal> seals;
  final List<_Seal> adrift;
  final double seaHeight;
  final bool compact;
  final String title;
  final String? lit;
  final Color Function(Entry e) sealColor;
  final String face;

  /// The book face, for everything else written on the chart.
  final String book;
  final bool caps;
  final Brightness brightness;
  final ColorScheme scheme;

  static const _seaTone = Color(0xFF2F6F8A);
  static const _landTone = Color(0xFFB59A62);

  bool get _dark => brightness == Brightness.dark;

  @override
  void paint(Canvas canvas, Size size) {
    final ink = scheme.onSurface;
    final seaColor = Color.alphaBlend(_seaTone.withValues(alpha: _dark ? 0.22 : 0.13), scheme.surfaceContainerLow);
    canvas.drawRect(Offset.zero & size, Paint()..color = seaColor);

    // The sea's marks: small waves, the same each time.
    final random = math.Random(11);
    final wave = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..strokeCap = StrokeCap.round
      ..color = _seaTone.withValues(alpha: _dark ? 0.45 : 0.28);
    for (var i = 0; i < (size.width * size.height / 9000).clamp(20, 160); i++) {
      final p = Offset(random.nextDouble() * size.width, random.nextDouble() * size.height);
      final w = 5 + random.nextDouble() * 5;
      canvas.drawPath(
        Path()
          ..moveTo(p.dx - w, p.dy)
          ..quadraticBezierTo(p.dx - w / 2, p.dy - 3, p.dx, p.dy)
          ..quadraticBezierTo(p.dx + w / 2, p.dy - 3, p.dx + w, p.dy),
        wave,
      );
    }

    // A frame inside the edge, as a chart's neat line.
    canvas.drawRect(
      (Offset.zero & size).deflate(8),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = ink.withValues(alpha: 0.25),
    );

    _cartouche(canvas, size, ink);

    // Shores: first the ripples off each island's coast, then the land and every border inside it.
    for (final d in drawn) {
      if (d.place.depth != 0) continue;
      final seed = _seedOf(d.place.entry.id);
      for (final (gap, alpha) in [(5.0, 0.35), (11.0, 0.18)]) {
        canvas.drawPath(
          _shore(d.centre, d.r + gap, seed, 0.06),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1
            ..color = _seaTone.withValues(alpha: alpha * (_dark ? 1.4 : 1)),
        );
      }
    }
    for (final d in drawn) {
      final depth = d.place.depth;
      final seed = _seedOf(d.place.entry.id);
      final shore = _shore(d.centre, d.r, seed, depth == 0 ? 0.06 : 0.035);
      final Color fill;
      if (depth == 0) {
        fill = Color.alphaBlend(_landTone.withValues(alpha: _dark ? 0.30 : 0.26), scheme.surfaceContainerHigh);
      } else {
        // Inside, each place in its own faint colour, as a map colours its regions.
        fill = Color.alphaBlend(castTone(d.place.entry.id).withValues(alpha: _dark ? 0.20 : 0.16), Colors.transparent);
      }
      canvas.drawPath(shore, Paint()..color = fill);
      final isLit = lit == d.place.entry.id;
      final edge = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = isLit ? 2.4 : (depth == 0 ? 1.6 : 1.1)
        ..color = isLit ? scheme.primary : ink.withValues(alpha: depth == 0 ? 0.6 : 0.42);
      if (depth == 0 || isLit) {
        canvas.drawPath(shore, edge);
      } else {
        _dashed(canvas, shore, edge);
      }
    }

    // Names: over everything. A place with places inside is named across its shore's top, where the shore is wide
    // enough for the name; any other in its middle, on two lines if need be; one too small for its name, just under
    // its shore.
    for (final d in drawn) {
      final p = d.place;
      if (d.r < 5) continue;
      final top = p.depth == 0;
      final leaf = p.children.isEmpty;
      final words = top || !caps ? p.entry.name.toUpperCase() : p.entry.name;
      var fontSize = (d.r * (top ? 0.2 : 0.24)).clamp(8.0, top ? 17.0 : 13.0);
      TextPainter label(double width, int lines) => TextPainter(
        text: TextSpan(
          text: words,
          style: TextStyle(
            fontFamily: face,
            fontSize: fontSize,
            fontWeight: top ? FontWeight.w700 : FontWeight.w600,
            letterSpacing: fontSize * (top ? 0.18 : 0.08),
            height: 1.1,
            color: ink.withValues(alpha: top ? 0.88 : 0.8),
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
        maxLines: lines,
        ellipsis: '…',
      )..layout(maxWidth: width);
      final room = d.r * 2 * (leaf ? 0.86 : 0.8);
      TextPainter text;
      Offset at;
      while (true) {
        text = label(room, leaf ? 2 : 1);
        final fits = !text.didExceedMaxLines && text.height < d.r * 1.5;
        if (fits || fontSize <= 8) break;
        fontSize -= 1;
      }
      // Inside the shore however worn it is: measured on a circle a little smaller than the place.
      final inner = d.r * 0.9;
      final half = text.width / 2 + 6;
      final fits = !text.didExceedMaxLines && text.height < d.r * 1.5 && (leaf || half < inner);
      if (fits && leaf) {
        at = Offset(d.centre.dx - text.width / 2, d.centre.dy - text.height / 2);
      } else if (fits) {
        final down = math.sqrt(inner * inner - half * half);
        at = Offset(d.centre.dx - text.width / 2, d.centre.dy - down + 2);
      } else {
        // Too small for its name: a place with places inside is named above its shore (clear of an island's
        // ripples), any other below, so the two never meet.
        fontSize = top ? 10 : 9;
        text = label(150, 1);
        at = leaf
            ? Offset(d.centre.dx - text.width / 2, d.centre.dy + d.r + 3)
            : Offset(d.centre.dx - text.width / 2, d.centre.dy - d.r - text.height - (top ? 13 : 3));
      }
      // A wash of the land under the name, so a border never runs through it.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(at.dx - 4, at.dy - 1, text.width + 8, text.height + 2),
          const Radius.circular(4),
        ),
        Paint()..color = scheme.surfaceContainerHigh.withValues(alpha: 0.55),
      );
      text.paint(canvas, at);
    }

    for (final s in seals) {
      _seal(canvas, s, ink);
    }

    if (adrift.isNotEmpty) {
      final top = size.height - seaHeight - 4;
      _dashed(
        canvas,
        Path()
          ..moveTo(22, top)
          ..lineTo(size.width - 22, top),
        Paint()
          ..strokeWidth = 1
          ..color = ink.withValues(alpha: 0.25),
        on: 3,
        off: 5,
      );
      if (!compact) {
        final word = TextPainter(
          text: TextSpan(
            text: 'ADRIFT',
            style: TextStyle(
              fontFamily: face,
              fontSize: 13,
              fontWeight: FontWeight.w700,
              letterSpacing: 3,
              color: ink.withValues(alpha: 0.72),
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        word.paint(canvas, Offset(30, size.height - seaHeight / 2 - word.height / 2 - 8));
        final note = TextPainter(
          text: TextSpan(
            text: 'linked to no place',
            style: TextStyle(
              fontFamily: book,
              fontSize: 12,
              fontStyle: FontStyle.italic,
              color: ink.withValues(alpha: 0.6),
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        note.paint(canvas, Offset(30, size.height - seaHeight / 2 + 4));
      }
      for (final s in adrift) {
        // Each bobs on a little swell.
        canvas.drawPath(
          Path()
            ..moveTo(s.at.dx - 20, s.at.dy + s.r + 3)
            ..quadraticBezierTo(s.at.dx - 10, s.at.dy + s.r - 1, s.at.dx, s.at.dy + s.r + 3)
            ..quadraticBezierTo(s.at.dx + 10, s.at.dy + s.r + 7, s.at.dx + 20, s.at.dy + s.r + 3),
          wave..strokeWidth = 1.4,
        );
        _seal(canvas, s, ink);
        final name = TextPainter(
          text: TextSpan(
            text: s.more > 0 ? '${s.more} more' : s.entry.name,
            style: TextStyle(fontFamily: book, fontSize: 12, color: ink.withValues(alpha: 0.82)),
          ),
          textDirection: TextDirection.ltr,
          maxLines: 1,
          ellipsis: '…',
        )..layout(maxWidth: 80);
        name.paint(canvas, Offset(s.at.dx - name.width / 2, s.at.dy + s.r + 8));
      }
    }
  }

  /// A wax seal: a disc of the entry's kind's colour, its rim pressed a little darker, its initials on it.
  void _seal(Canvas canvas, _Seal s, Color ink) {
    final color = s.more > 0 ? scheme.outline : sealColor(s.entry);
    final isLit = lit == s.entry.id && s.more == 0;
    canvas.drawCircle(s.at + const Offset(0, 1.5), s.r, Paint()..color = Colors.black.withValues(alpha: 0.18));
    canvas.drawCircle(s.at, s.r * (isLit ? 1.2 : 1), Paint()..color = color);
    canvas.drawCircle(
      s.at,
      s.r * (isLit ? 1.2 : 1) - 1.6,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: 0.45),
    );
    final light = ThemeData.estimateBrightnessForColor(color) == Brightness.light;
    final mark = TextPainter(
      text: TextSpan(
        text: s.more > 0 ? '+${s.more}' : monogram(s.entry.name),
        style: TextStyle(
          fontFamily: book,
          fontSize: s.r * (s.more > 0 ? 0.8 : 0.9),
          fontWeight: FontWeight.w700,
          color: light ? Colors.black87 : Colors.white,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    mark.paint(canvas, s.at - Offset(mark.width / 2, mark.height / 2));
  }

  /// The chart's title in the top left, on a scroll of paper: "The world of Ashfall".
  void _cartouche(Canvas canvas, Size size, Color ink) {
    final name = TextPainter(
      text: TextSpan(
        children: [
          TextSpan(
            text: 'The world of ',
            style: TextStyle(
              fontFamily: book,
              fontSize: compact ? 12 : 13,
              fontStyle: FontStyle.italic,
              color: ink.withValues(alpha: 0.7),
            ),
          ),
          TextSpan(
            text: caps ? title : title.toUpperCase(),
            style: TextStyle(
              fontFamily: face,
              fontSize: compact ? 13 : 15,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.6,
              color: ink.withValues(alpha: 0.9),
            ),
          ),
        ],
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: size.width - (compact ? 110 : 160));
    final box = Rect.fromLTWH(20, 20, name.width + 28, name.height + 14);
    canvas.drawRRect(
      RRect.fromRectAndRadius(box, const Radius.circular(3)),
      Paint()..color = Color.alphaBlend(_landTone.withValues(alpha: 0.2), scheme.surfaceContainerHigh),
    );
    final edge = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = ink.withValues(alpha: 0.45);
    canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(3)), edge);
    canvas.drawRRect(RRect.fromRectAndRadius(box.deflate(3), const Radius.circular(2)), edge..strokeWidth = 0.6);
    name.paint(canvas, Offset(box.left + 14, box.top + 7));
  }

  @override
  bool shouldRepaint(_ChartPainter old) =>
      old.drawn != drawn || old.lit != lit || old.scheme != scheme || old.title != title || old.face != face;
}
