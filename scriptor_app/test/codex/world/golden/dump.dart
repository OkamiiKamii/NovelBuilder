// The Flutter app's own outputs for the world (world.golden.json pins them; outputs.ts makes Scriptor's, keyed and
// shaped the same way). For every novel given: what each chapter names (presentIn), what the pages name that the world
// lacks (worldFinds, and the cards Found in your pages makes of them), the place tree, the chart (what is on it, laid
// out at two widths, its names, its shores), the shelves and the encyclopedia, each entry's page (its kind's fields
// checked, related entries, where it figures, the delete question) and the charter begun on the novel. And `misc`:
// the readings over texts made to test them, and the sea's marks.
//
// What is the widgets' (world_chart.dart's layout and names, encyclopedia.dart's filing, world_page.dart's shelves,
// found_in_pages.dart's cards, entry_page.dart's lines, codex_service.dart's references, world_charter.dart's
// foundWorld) is copied here word for word but for Flutter's types: Offset and Rect as dart:ui defines them, and text
// measured by the same stand-in as outputs.ts (`fakeWidth`), in place of TextPainter.
//
// To make the golden again: dart run dump.dart world.golden.json <novels…> (with the package config the views'
// golden uses), as run.sh in the scratch dir does; FULL=1 writes it whole.

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:characters/characters.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/codex/in_chapter.dart';
import 'package:novel_builder/shared/domain/codex/world_finder.dart';
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/places/explore.dart';
import 'package:novel_builder/shared/domain/places/places.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/text/fold.dart';

// ---------------------------------------------------------------------------------------------------- dart:ui's

class Offset {
  const Offset(this.dx, this.dy);
  final double dx;
  final double dy;
  static const zero = Offset(0, 0);
  double get distance => math.sqrt(dx * dx + dy * dy);
  Offset operator +(Offset o) => Offset(dx + o.dx, dy + o.dy);
  Offset operator -(Offset o) => Offset(dx - o.dx, dy - o.dy);
  Offset operator *(double o) => Offset(dx * o, dy * o);
  Offset operator /(double o) => Offset(dx / o, dy / o);
  static Offset? lerp(Offset a, Offset b, double t) => Offset(a.dx * (1.0 - t) + b.dx * t, a.dy * (1.0 - t) + b.dy * t);
}

class Rect {
  const Rect.fromLTRB(this.left, this.top, this.right, this.bottom);
  factory Rect.fromCircle({required Offset center, required double radius}) => Rect.fromLTRB(
    center.dx - radius * 2 / 2,
    center.dy - radius * 2 / 2,
    center.dx + radius * 2 / 2,
    center.dy + radius * 2 / 2,
  );
  final double left;
  final double top;
  final double right;
  final double bottom;
  double get width => right - left;
  double get height => bottom - top;
  Offset get center => Offset(left + width / 2.0, top + height / 2.0);
  Rect expandToInclude(Rect o) => Rect.fromLTRB(
    math.min(left, o.left),
    math.min(top, o.top),
    math.max(right, o.right),
    math.max(bottom, o.bottom),
  );
}

/// Text measured by a stand-in (the same in outputs.ts): 0.55 of the size a character, plus its letter spacing.
double fakeWidth(String text, double size, double spacing) => text.length * size * 0.55 + text.length * spacing;

class FakeText {
  FakeText(String text, {required double size, required double spacing, required double maxWidth, required int maxLines}) {
    final raw = fakeWidth(text, size, spacing);
    final lines = raw <= maxWidth ? 1 : (raw / maxWidth).ceil();
    didExceedMaxLines = lines > maxLines;
    width = math.min(raw, maxWidth);
    height = math.min(lines, maxLines) * size * 1.1;
  }
  late final bool didExceedMaxLines;
  late final double width;
  late final double height;
}

// ---------------------------------------------------------------------------------------------------- world_chart.dart

class ChartPlace {
  ChartPlace(this.entry, this.depth, this.chapters);
  final Entry entry;
  final int depth;
  final int chapters;
  final children = <ChartPlace>[];
  final seals = <Entry>[];
}

typedef WorldChartData = ({List<ChartPlace> islands, List<Entry> adrift});

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

String belongsWord(String kind) => switch (kind) {
  'faction' => 'holds power in',
  'item' => 'kept in',
  'power' => 'known in',
  'lore' => 'remembered in',
  _ => 'found in',
};

class _Disc {
  _Disc(this.place);
  final ChartPlace place;
  double r = 0;
  Offset at = Offset.zero;
  final kids = <_Disc>[];
}

double _ownRadius(ChartPlace p) => 14 * math.pow(1 + p.chapters, 0.35).toDouble();

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
typedef _Laid = ({double height, double sea, bool compact, List<_Drawn> drawn, List<_Seal> seals, List<_Seal> adrift});

_Laid layOut(double width, WorldChartData data, bool caps) {
  final compact = width < 600;
  final sea = data.adrift.isEmpty ? 0.0 : 84.0;
  const margin = 34.0;
  const cartouche = 40.0;
  final most = (compact ? width * 1.25 : (width * 0.46).clamp(380.0, 580.0)) + sea;
  final roomWidth = width - margin * 2;
  final roomHeight = most - margin * 2 - cartouche - sea;

  final nameWidth = <String, double>{};
  void measure(List<ChartPlace> places) {
    for (final p in places) {
      if (p.children.isNotEmpty) {
        final size = p.depth == 0 ? 10.0 : 9.0;
        nameWidth[p.entry.id] = fakeWidth(
          p.depth == 0 || !caps ? p.entry.name.toUpperCase() : p.entry.name,
          size,
          size * 0.18,
        );
        measure(p.children);
      }
    }
  }

  measure(data.islands);

  var islands = <_Disc>[];
  var bestAspect = roomWidth / roomHeight;
  var bestScale = -1.0;
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
      seals.add((entry: i < shown ? list[i] : list[shown], at: at, r: sealR, more: i < shown ? 0 : list.length - shown));
    }
  }

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
  return (height: height, sea: sea, compact: compact, drawn: drawn, seals: seals, adrift: adrift);
}

/// The painter's names, as it places them (TextPainter replaced by FakeText).
List<Object?> labels(List<_Drawn> drawn, bool caps) {
  final out = <Object?>[];
  for (final d in drawn) {
    final p = d.place;
    if (d.r < 5) continue;
    final top = p.depth == 0;
    final leaf = p.children.isEmpty;
    final words = top || !caps ? p.entry.name.toUpperCase() : p.entry.name;
    var fontSize = (d.r * (top ? 0.2 : 0.24)).clamp(8.0, top ? 17.0 : 13.0);
    FakeText label(double width, int lines) => FakeText(
      words,
      size: fontSize,
      spacing: fontSize * (top ? 0.18 : 0.08),
      maxWidth: width,
      maxLines: lines,
    );
    final room = d.r * 2 * (leaf ? 0.86 : 0.8);
    FakeText text;
    Offset at;
    while (true) {
      text = label(room, leaf ? 2 : 1);
      final fits = !text.didExceedMaxLines && text.height < d.r * 1.5;
      if (fits || fontSize <= 8) break;
      fontSize -= 1;
    }
    final inner = d.r * 0.9;
    final half = text.width / 2 + 6;
    final fits = !text.didExceedMaxLines && text.height < d.r * 1.5 && (leaf || half < inner);
    if (fits && leaf) {
      at = Offset(d.centre.dx - text.width / 2, d.centre.dy - text.height / 2);
    } else if (fits) {
      final down = math.sqrt(inner * inner - half * half);
      at = Offset(d.centre.dx - text.width / 2, d.centre.dy - down + 2);
    } else {
      fontSize = top ? 10 : 9;
      text = label(150, 1);
      at = leaf
          ? Offset(d.centre.dx - text.width / 2, d.centre.dy + d.r + 3)
          : Offset(d.centre.dx - text.width / 2, d.centre.dy - d.r - text.height - (top ? 13 : 3));
    }
    out.add({
      'id': p.entry.id,
      'text': words,
      'size': fontSize,
      'at': pt(at),
      'width': text.width,
      'height': text.height,
    });
  }
  return out;
}

int _seedOf(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return h;
}

/// _shore's points (the path is drawn through them).
List<Offset> shorePoints(Offset centre, double r, int seed, double wear) {
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
  final first = Offset.lerp(points.last, points.first, 0.5)!;
  return [first, ...points, for (var i = 0; i < n; i++) Offset.lerp(points[i], points[(i + 1) % n], 0.5)!];
}

/// The sea's marks: each wave's point and half-width.
List<Object?> seaMarks(double width, double height) {
  final random = math.Random(11);
  final out = <Object?>[];
  for (var i = 0; i < (width * height / 9000).clamp(20, 160); i++) {
    final p = Offset(random.nextDouble() * width, random.nextDouble() * height);
    final w = 5 + random.nextDouble() * 5;
    out.add([p.dx, p.dy, w]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- encyclopedia.dart

String letterOf(String name) {
  final first = foldText(name.trim()).characters.firstOrNull ?? '';
  return RegExp(r'^\p{L}$', unicode: true).hasMatch(first) ? first.toUpperCase() : '#';
}

List<(String, List<Entry>)> fileByLetter(List<Entry> entries) {
  final groups = <String, List<Entry>>{};
  for (final e in entries) {
    (groups[letterOf(e.name)] ??= []).add(e);
  }
  return [for (final g in groups.entries) (g.key, g.value)];
}

Map<String, Set<int>> chaptersMentioning(Iterable<StoryNode> nodes, StoryOrder order) {
  final out = <String, Set<int>>{};
  for (final node in nodes) {
    final n = order.chapterNumber[node.id];
    if (n == null || n < 1) continue;
    for (final id in node.mentions) {
      (out[id] ??= {}).add(n);
    }
  }
  return out;
}

String? articleWhere(Set<int> chapters, int chapterCount) {
  final sorted = chapters.where((n) => n <= chapterCount).toList()..sort();
  return chapterCount == 0
      ? null
      : sorted.isEmpty
      ? 'Not in the manuscript yet'
      : sorted.length == 1
      ? 'In chapter ${sorted.first}'
      : 'In ${fmt(sorted.length)} of ${fmt(chapterCount)} chapters · '
            '${sorted.first}–${sorted.last}';
}

String fmt(int n) {
  final s = '${n.abs()}';
  final b = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

String plural(int n, String one, [String? many]) => '${fmt(n)} ${n == 1 ? one : (many ?? '${one}s')}';

// ---------------------------------------------------------------------------------------------------- codex_service.dart

typedef EntryReferences = ({int links, int chapters, int events, int threads, int fields, int plans});

EntryReferences references(NovelSnapshot s, String entryId) {
  int count(String collection, bool Function(JsonMap row) test) => s.rows(collection).where(test).length;
  return (
    links: count('loreLinks', (l) => l['fromId'] == entryId || l['toId'] == entryId),
    chapters: count('chapters', (n) => strings(n['mentions']).contains(entryId)),
    events: count(
      'timelineEvents',
      (e) =>
          e['locationId'] == entryId ||
          strings(e['entryIds']).contains(entryId) ||
          maps(e['characters']).any((c) => c['id'] == entryId),
    ),
    threads: count(
      'plotThreads',
      (t) => strings(t['characterIds']).contains(entryId) || strings(t['locationIds']).contains(entryId),
    ),
    fields: count(
      'loreEntries',
      (e) => e['id'] != entryId && maps(e['fields']).any((f) => str(f['value']).split('\n').contains(entryId)),
    ),
    plans: count('chapterPlans', (p) => strings(p['entityIds']).contains(entryId)),
  );
}

String deleteMessage(EntryReferences r, Entry entry, Category kind) {
  final said = [
    if (r.links > 0) '${plural(r.links, 'link')} to other records (removed with it)',
    if (r.chapters > 0) '${plural(r.chapters, 'chapter')} linking to it in the text (the words stay)',
    if (r.events > 0) '${plural(r.events, 'timeline event')} naming it (kept; they show it as deleted)',
    if (r.threads > 0) '${plural(r.threads, 'plot thread')} naming it (kept)',
    if (r.fields > 0) '${plural(r.fields, 'other entry', 'other entries')} with a field linking to it (kept)',
    if (r.plans > 0) '${plural(r.plans, 'chapter plan')} listing it (kept)',
  ];
  return [
    'This deletes the ${kind.singular.toLowerCase()} ${entry.name}.',
    if (said.isEmpty) 'Nothing else in the novel refers to it.' else 'It is referred to elsewhere:\n• ${said.join('\n• ')}',
    'A restore point is kept first (Settings → Restore points), so it can be brought back.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------------------------------- world_charter.dart

const charterKinds = ['location', 'faction', 'item', 'power', 'lore'];
const charterLinks = <String?>[null, 'holds power in', 'sought in', 'feared in', 'remembered in'];

int foundWorld(CodexChanges x, Map<String, String> names) {
  final filled = [
    for (var i = 0; i < charterKinds.length; i++)
      if ((names[charterKinds[i]] ?? '').trim().isNotEmpty) i,
  ];
  if (filled.isEmpty) return 0;
  final place = filled.where((i) => charterLinks[i] == null).map((i) => x.createEntry(charterKinds[i], names[charterKinds[i]])).firstOrNull;
  for (final i in filled) {
    if (charterLinks[i] == null) continue;
    final e = x.createEntry(charterKinds[i], names[charterKinds[i]]);
    if (place != null) x.linkEntries(e.id, place.id, charterLinks[i]!);
  }
  return filled.length;
}

// ---------------------------------------------------------------------------------------------------- reads

Object pt(Offset o) => [o.dx, o.dy];

Object? placeJson(ChartPlace p) => {
  'id': p.entry.id,
  'depth': p.depth,
  'chapters': p.chapters,
  'seals': [for (final e in p.seals) e.id],
  'children': [for (final c in p.children) placeJson(c)],
};

Object? laidJson(_Laid l, bool caps) => {
  'height': l.height,
  'sea': l.sea,
  'compact': l.compact,
  'drawn': [
    for (final d in l.drawn) {'id': d.place.entry.id, 'centre': pt(d.centre), 'r': d.r},
  ],
  'seals': [
    for (final s in l.seals) {'id': s.entry.id, 'at': pt(s.at), 'r': s.r, 'more': s.more},
  ],
  'adrift': [
    for (final s in l.adrift) {'id': s.entry.id, 'at': pt(s.at), 'r': s.r, 'more': s.more},
  ],
  'labels': labels(l.drawn, caps),
  'shores': [
    for (final d in l.drawn) [for (final p in shorePoints(d.centre, d.r, _seedOf(d.place.entry.id), d.place.depth == 0 ? 0.06 : 0.035)) pt(p)],
  ],
};

Map<String, Object?> reads(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final entries = [for (final r in s.rows('loreEntries')) Entry(r)]..sort((a, b) => a.id.compareTo(b.id));
  final profiles = {for (final r in s.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r)};
  final names = namesToFind(entries, profiles);
  final contents = {for (final r in s.rows('chapterContents')) str(r['id']): r};

  // What each chapter and scene names.
  final present = <Object?>[];
  for (final node in readingOrder(model.nodes.values)) {
    final row = contents[node.id];
    if (row == null) continue;
    final links = <String, int>{};
    for (final id in node.mentions) {
      links[id] = (links[id] ?? 0) + 1;
    }
    present.add([node.id, [for (final p in presentIn(blockTexts(row['doc']), names, links: links)) [p.id, p.mentions]]]);
  }

  // What the pages name that the world lacks; the cards made of it.
  final known = {
    for (final e in entries) worldKey(e.name),
    for (final p in profiles.values) ...p.aliases.map(worldKey),
  };
  final finds = worldFinds(
    [
      for (final row in s.rows('chapterContents'))
        if (model.order.chapterNumber[str(row['id'])] case final number?) (number, blockTexts(row['doc'])),
    ],
    known: known,
    limit: 40,
  );
  final kinds = model.categories;
  final cards = [
    for (final f in finds)
      if (kinds[f.kind] != null && !kinds[f.kind]!.archived)
        '${kinds[f.kind]!.singular} · ${f.why} · ${f.chapters == 1 ? 'in chapter ${f.first}' : 'in ${fmt(f.chapters)} chapters'}',
  ];

  // The place tree.
  final settingsRows = s.rows('placeSettings');
  final tree = placeTree(
    model,
    settings: settingsRows.isEmpty ? null : PlaceSettings(settingsRows.first),
    pins: [for (final r in s.rows('mapPins')) MapPin(r)],
  );

  // The chart.
  final chapters = chaptersMentioning(model.nodes.values, model.order);
  final chart = worldChartOf(model, chapters);

  // The shelves and the encyclopedia.
  final shelfKinds = [
    for (final c in model.categories.values)
      if (c.key != 'character') c,
  ]..sort((a, b) => a.order != b.order ? a.order.compareTo(b.order) : localeCompare(a.name, b.name));
  final all = stableSorted([
    for (final e in entries)
      if (e.category != 'character') e,
  ], (a, b) => localeCompare(a.name, b.name));
  final tags = {for (final e in all) ...e.tags}.toList()..sort(localeCompare);
  Category kindOf(Entry e) => model.categories[e.category] ?? Category.unknown(e.category);
  final count = model.order.chapters.length;

  // Each entry's page.
  final pages = <Object?>[];
  final categoryNames = {for (final c in model.categories.values) c.key: c.name};
  for (final e in all) {
    final kind = kindOf(e);
    final view = viewFields(e, kind);
    final position = model.order.position;
    pages.add({
      'id': e.id,
      'fields': [
        for (final (def, field) in view.category)
          [
            '${def.name}${def.required ? ' *' : ''}',
            checkValue(def, field?.value ?? '', model.entries, categoryName: (k) => categoryNames[k] ?? k)?.message,
          ],
      ],
      'archived': [for (final (def, field) in view.archived) [def.name, field.value]],
      'own': [for (final f in view.own) str(f.raw['key'])],
      'related': [
        for (final r in relatedTo(e.id, model.entries.values, model.links)) [r.linkId, r.entry.id, r.label, r.theirLabel],
      ],
      'figures': [
        for (final n in stableSorted(
          model.nodes.values.where((n) => n.mentions.contains(e.id)),
          (a, b) => (position[a.id] ?? 0) - (position[b.id] ?? 0),
        ))
          n.id,
      ],
      'events': [
        for (final ev in model.events.values)
          if (ev.locationId == e.id || ev.entryIds.contains(e.id)) ev.name,
      ],
      'threads': [
        for (final t in model.threads.values)
          if (t.locationIds.contains(e.id)) t.title,
      ],
      'delete': deleteMessage(references(s, e.id), e, kind),
    });
  }

  // The charter, begun on the novel.
  var n = 0;
  final x = CodexChanges(s, now: 0, createId: () => 'made-${++n}');
  final made = foundWorld(x, {
    'location': '  Harrowmere ',
    'faction': 'The Salt Court',
    'item': '',
    'power': 'Bloodsong',
    'lore': 'the Long Winter',
  });
  final madeIds = {for (var i = 1; i <= n; i++) 'made-$i'};

  return {
    'present': present,
    'finds': [for (final f in finds) [f.name, f.kind, f.why, f.times, f.chapters, f.first]],
    'cards': cards,
    'tree': [
      for (final r in tree)
        {
          'id': r.entry.id,
          'depth': r.depth,
          'parent': r.parentId,
          'children': r.childIds,
          'level': r.levelWords,
          'events': r.events,
          'within': r.eventsWithin,
          'characters': r.characters,
          'factions': r.factions,
          'chapters': r.chapters,
          'maps': r.maps,
          'notes': r.notes,
        },
    ],
    'chart': {
      'islands': [for (final p in chart.islands) placeJson(p)],
      'adrift': [for (final e in chart.adrift) e.id],
    },
    // A world with no places has no chart.
    'laid': chart.islands.isEmpty ? null : {
      for (final w in [390.0, 1000.0])
        for (final caps in [false, true]) '${w.toInt()}${caps ? 'caps' : ''}': laidJson(layOut(w, chart, caps), caps),
    },
    'shelves': {
      'kinds': [for (final k in shelfKinds) k.key],
      'all': [for (final e in all) e.id],
      'tags': tags,
      'letters': [
        for (final (letter, list) in fileByLetter(all)) [letter, [for (final e in list) e.id]],
      ],
      'where': [for (final e in all) articleWhere(chapters[e.id] ?? const {}, count)],
    },
    'pages': pages,
    'charter': {
      'made': made,
      'entries': [
        for (final r in x.snapshot.rows('loreEntries'))
          if (madeIds.contains(r['id'])) [r['id'], r['name'], r['category']],
      ],
      'links': [
        for (final r in x.snapshot.rows('loreLinks'))
          if (madeIds.contains(r['fromId'])) [r['fromId'], r['toId'], r['fromLabel']],
      ],
    },
  };
}

Map<String, Object?> misc() {
  const names = {
    'wren': ['Wren Hollis', 'Wren'],
    'bird': ['wren'],
    'obrien': ["O'Brien", 'O’Brien'],
    'mj': ['Mary-Jane'],
    'kai': ['Kai'],
    'droid': ['3PO'],
    'cafe': ['Café Noir'],
    'stars': ['***'],
    'empty': ['  ', ''],
    'none': ['Nobody Here'],
  };
  const cases = [
    ['Wren Hollis came. Wren sat; a wren sang.'],
    ["O'Brien and O’Brien met Mary-Jane, not Mary or Jane."],
    ['Kai2 is not Kai, but Kai is; Kaiser is not.'],
    ['3PO spoke. R3PO did not. 3PO.'],
    ['At the Café Noir, the café noir.', 'Then *** and then ***.'],
    ['', 'Nothing here names anyone.'],
  ];
  const texts = [
    'That was James, flying towards the nearest city; he cut through the Mimir Forest to do so.',
    'For now, James was flying by using the Smart Atoms skill.',
    'The Salt Guild sent its factors. House Vane said nothing. She kept the Brass Compass close.',
    'They sailed to the Isle of Skye, past Mount Ash, to the Order of the Rose.',
    'The Forest was dark. The Provost’s power was absolute. They spoke of Vell, Tower and all.',
    'This skill was new. Water spell or not, it held. His Fireball spell burned. She knew the old Frost spell.',
    'Into the Mimir Forest. The Drowned Road rose. Down the Glass River’s banks, to the Iron Gate of Old Merrow.',
    '“The Lantern Guild!” she cried. Mt Doom’s fires. The Sword of Dawn, the Crown of Ash; Castle Grey.',
    'Élan Spire and the Øresund Bridge. ÉCOLE Society. A van der Berg Company. Order of de Rose.',
  ];
  return {
    'present': [
      for (final p in cases) ...[
        [for (final x in presentIn(p, names)) [x.id, x.mentions]],
        [for (final x in presentIn(p, names, links: const {'kai': 5, 'linkedOnly': 2})) [x.id, x.mentions]],
      ],
    ],
    'finds': [
      for (final (i, t) in texts.indexed)
        [for (final f in worldFinds([(i + 1, [t])])) [f.name, f.kind, f.why, f.times, f.chapters, f.first]],
      [for (final f in worldFinds([for (final (i, t) in texts.indexed) (i + 1, [t, t])], limit: 40)) [f.name, f.kind, f.times, f.chapters, f.first]],
    ],
    'keys': [for (final n in ['The Drowned Road', "Merrow's Bell", '  the   Glass  River ', 'Mt’s O’Neil']) worldKey(n)],
    'letters': [for (final n in ['Élan Spire', '7 Bells', '  ash', 'Øresund', '', '#hash', 'ßand']) letterOf(n)],
    'sea': [seaMarks(390, 500), seaMarks(1000, 600)],
    'seeds': [for (final id in ['a', 'place-1', 'f3a9c0de-1234-4abc-9def-0123456789ab']) _seedOf(id)],
  };
}

// ---------------------------------------------------------------------------------------------------- hashing

/// As ../../../characters/golden/dump.dart hashes: canonical JSON (keys sorted, whole numbers without a fraction),
/// FNV-1a over UTF-16 code units. Numbers that are not whole are rounded to nine significant places first (the
/// chart's sines, cosines and powers are the platform's).
String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

Object? rounded(Object? v) => switch (v) {
  double d when d.isFinite && d != d.truncateToDouble() => double.parse(d.toStringAsPrecision(9)),
  List l => [for (final x in l) rounded(x)],
  Map m => {for (final MapEntry(:key, :value) in m.entries) key: rounded(value)},
  _ => v,
};

void main(List<String> args) {
  final full = Platform.environment.containsKey('FULL');
  final out = <String, Object?>{'misc': rounded(misc())};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final r = rounded(reads(s)) as Map;
    out[name] = full ? r : {for (final MapEntry(:key, :value) in r.entries) key as String: hashOf(value)};
  }
  File(args.first).writeAsStringSync(jsonEncode(out));
}
