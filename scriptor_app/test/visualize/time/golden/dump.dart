// The Flutter app's own outputs for phase 6b's time views (time.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given, on the main timeline and on each alternate history: every
// way of splitting into tracks, each track's marks laid out at 390 and 1000 wide, and the drawing as the chart's
// painter draws it (bands, every mark's shapes and name, where taps land) for the whole story, zoomed in and moved on;
// the list form, the line over it, the events not placed in time, the marks in story order. The story and reading
// order (what is shown, the rows said aloud, the lines with nothing selected and with a chapter or an event selected,
// the lists). Each character's history (born, the three readings' lines, what is worth a look). And `misc`: "Jump to
// date" and "Show from … until" on typed dates.
//
// What is the widgets' (timeline_chart.dart's painter, timeline_view_page.dart's line, list and unplaced,
// order_page.dart's rows, lines and lists, life_history_page.dart's lines) is copied here word for word.
//
// To make the golden again: run.sh in the scratchpad's `vtime` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/timeline/ages.dart';
import 'package:novel_builder/shared/domain/timeline/axis.dart';
import 'package:novel_builder/shared/domain/timeline/event_record.dart';
import 'package:novel_builder/shared/domain/timeline/histories.dart';
import 'package:novel_builder/shared/domain/timeline/life_history.dart';
import 'package:novel_builder/shared/domain/timeline/narrative.dart';
import 'package:novel_builder/shared/domain/timeline/scale.dart';
import 'package:novel_builder/shared/domain/timeline/tracks.dart';

// ---------------------------------------------------------------------------------------------------- copied helpers

String formatNumber(num n) {
  final digits = n.round().abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

String plural(int n, String one, [String? many]) => '${formatNumber(n)} ${n == 1 ? one : (many ?? '${one}s')}';

const revealChoices = {
  RevealRole.told: 'Told here',
  RevealRole.flashback: 'As a flashback',
  RevealRole.flashforward: 'As a flash-forward',
  RevealRole.foreshadowed: 'Foreshadowed',
  RevealRole.mentioned: 'Only mentioned',
  RevealRole.revealed: 'Revealed afterwards',
};

// ------------------------------------------------------------------------------------------- timeline_chart.dart

typedef ChartTrack = ({Track track, TimeAxis axis});

const _laneHeight = 36.0;
const _header = 28.0;
const _folded = 30.0;
const _ticks = 28.0;
const _labelWidth = 150.0;

String markWords(AxisMark m) {
  final rough = m.startFuzz != null || m.endFuzz != null;
  return switch (m.kind) {
    MarkKind.moment => '${m.title}, ${m.when}, an exact moment',
    MarkKind.uncertain => '${m.title}, ${m.when}, somewhere in that stretch of time',
    MarkKind.lasting =>
      '${m.title}, ${m.when}, lasting a while${rough ? '; its start and end are known only roughly' : ''}',
    MarkKind.ongoing => '${m.title}, ${m.when}',
    MarkKind.unended => '${m.title}, ${m.when}, lasting a while',
  };
}

double chartHeight(List<ChartTrack> tracks) =>
    _ticks +
    tracks.fold(
      0.0,
      (sum, t) => sum + (t.track.folded ? _folded : _header + math.max(1, t.axis.lanes) * _laneHeight + 8),
    );

String heading(Track t) => t.folded
    ? '${t.label} — folded, ${t.eventIds.length} ${t.eventIds.length == 1 ? 'event' : 'events'}'
    : t.label;

double _x(TimeWindow window, double t, double width) => (t - window.from) / (window.to - window.from) * width;

List<Map<String, Object?>> hits(List<ChartTrack> tracks, TimeWindow window, double width) {
  final out = <Map<String, Object?>>[];
  var top = _ticks;
  for (final t in tracks) {
    if (t.track.folded) {
      top += _folded;
      continue;
    }
    for (final m in t.axis.marks) {
      final left = _x(window, m.start, width);
      final right = m.kind == MarkKind.ongoing ? width : math.max(_x(window, m.end, width), left);
      final y = top + _header + m.lane * _laneHeight;
      out.add({
        'rect': [left - 6, y + 2, math.max(right, left + _labelWidth), y + _laneHeight - 2],
        'mark': m.id,
        'track': t.track.label,
        'words': markWords(m),
      });
    }
    top += _header + math.max(1, t.axis.lanes) * _laneHeight + 8;
  }
  return out;
}

Map<String, Object?>? _hatched(double left, double top, double right, double bottom) {
  if (right - left <= 0) return null;
  final h = bottom - top;
  final lines = <List<double>>[];
  for (var x = left - h; x < right; x += 5) {
    lines.add([x, bottom, x + h, top]);
  }
  return {'kind': 'hatch', 'rect': [left, top, right, bottom], 'lines': lines};
}

Map<String, Object?> markDrawing(AxisMark m, double centre, TimeWindow window, double width, String? selected) {
  var y = centre;
  final left = _x(window, m.start, width);
  final right = m.kind == MarkKind.ongoing ? width : math.max(_x(window, m.end, width), left);
  final isSelected = m.id == selected;
  const h = 10.0;
  var labelAt = left + 8;
  final bar =
      m.kind == MarkKind.lasting ||
      m.kind == MarkKind.ongoing ||
      (m.kind == MarkKind.uncertain && math.max(_x(window, m.end, width), left) - left >= 14);
  if (bar) y += 8;
  final shapes = <Map<String, Object?>>[];
  switch (m.kind) {
    case MarkKind.moment:
      shapes.add({'kind': 'circle', 'c': [left, y], 'r': 5, 'paint': 'fill'});
      if (isSelected) shapes.add({'kind': 'circle', 'c': [left, y], 'r': 8, 'paint': 'ring'});
    case MarkKind.uncertain:
      final middle = (left + right) / 2;
      final List<double> rect;
      final double radius;
      if (right - left < 14) {
        final c = Rect.fromCircle(middle, y, 7);
        rect = c;
        radius = 7;
      } else {
        rect = [left, y - h / 2, right, y + h / 2];
        radius = 5;
      }
      shapes.add({'kind': 'rrect', 'rect': rect, 'radius': radius, 'paint': 'tint'});
      shapes.add({'kind': 'rrect', 'rect': rect, 'radius': radius, 'paint': 'dashed'});
      shapes.add({'kind': 'circle', 'c': [middle, y], 'r': 3.5, 'paint': 'fill'});
      if (isSelected) {
        shapes.add({
          'kind': 'rrect',
          'rect': [rect[0] - 3, rect[1] - 3, rect[2] + 3, rect[3] + 3],
          'radius': radius + 3,
          'paint': 'ring',
        });
      }
      labelAt = math.max(right, middle + 7) + 6;
    case MarkKind.lasting || MarkKind.ongoing:
      final solidFrom = m.startFuzz == null ? left : _x(window, m.startFuzz!.hi, width);
      final solidTo = m.endFuzz == null ? right : _x(window, m.endFuzz!.lo, width);
      if (m.startFuzz != null) {
        final s = _hatched(left, y - h / 2, math.max(left, solidFrom), y + h / 2);
        if (s != null) shapes.add(s);
      }
      if (m.endFuzz != null) {
        final s = _hatched(math.min(right, solidTo), y - h / 2, right, y + h / 2);
        if (s != null) shapes.add(s);
      }
      shapes.add({
        'kind': 'rrect',
        'rect': [solidFrom, y - h / 2, math.max(solidTo, solidFrom + 2), y + h / 2],
        'radius': 3,
        'paint': 'fill',
      });
      if (m.kind == MarkKind.ongoing) {
        shapes.add({
          'kind': 'arrow',
          'points': [
            [width - 10, y - 8],
            [width, y],
            [width - 10, y + 8],
          ],
        });
      }
      if (isSelected) {
        shapes.add({
          'kind': 'rrect',
          'rect': [left - 3, y - h / 2 - 3, right + 3, y + h / 2 + 3],
          'radius': 0,
          'paint': 'ring',
        });
      }
    case MarkKind.unended:
      shapes.add({'kind': 'fade', 'rect': [left, y - h / 2, left + 48, y + h / 2]});
      shapes.add({'kind': 'question', 'at': [left + 50, y - 9]});
      if (isSelected) {
        shapes.add({
          'kind': 'rrect',
          'rect': [left - 3, y - h / 2 - 3, left + 51, y + h / 2 + 3],
          'radius': 0,
          'paint': 'ring',
        });
      }
      labelAt = left + 62;
  }
  return {
    'id': m.id,
    'selected': isSelected,
    'shapes': shapes,
    'label': {
      'text': m.title.isEmpty ? 'Untitled event' : m.title,
      'x': bar ? math.max(2.0, left + 2) : labelAt,
      'y': bar ? y - h / 2 - 1 : y,
      'above': bar,
    },
  };
}

abstract final class Rect {
  static List<double> fromCircle(double cx, double cy, double r) => [cx - r, cy - r, cx + r, cy + r];
}

Map<String, Object?> drawing(List<ChartTrack> tracks, TimeWindow window, double width, String? selected) {
  var top = _ticks;
  final bands = <Map<String, Object?>>[];
  for (final t in tracks) {
    final band = t.track.folded ? _folded : _header + math.max(1, t.axis.lanes) * _laneHeight + 8;
    bands.add({
      'top': top,
      'height': band,
      'heading': heading(t.track),
      'marks': t.track.folded
          ? []
          : [
              for (final m in t.axis.marks)
                markDrawing(m, top + _header + m.lane * _laneHeight + _laneHeight / 2, window, width, selected),
            ],
    });
    top += band;
  }
  return {'height': chartHeight(tracks), 'bands': bands, 'hits': hits(tracks, window, width)};
}

// --------------------------------------------------------------------------------------- timeline_view_page.dart

String summary(int dated, Grouping grouping, int shown, bool filtered, int matching, int all) =>
    'Timeline of ${plural(dated, 'dated event')}, in the order they happen'
    '${grouping is OneLine ? '' : ', on ${plural(shown, 'track')}'}'
    '${filtered ? ' ($matching of $all events match)' : ''}.';

const _unreadable =
    'is not a date this timeline can read. Try a year (10, -500), a year and month (10-6), a day (10-6-14) or a month by name (June 10).';

Map<String, Object?> jump(String text, Calendar cal, bool hasDates) {
  final read = readDate(text, cal);
  if (read == null || !hasDates) return {'message': '“${text.trim()}” $_unreadable'};
  return {
    'window': {'from': read.t - read.length, 'to': read.t + 2 * read.length},
  };
}

Map<String, Object?> range(String from, String until, Calendar cal) {
  final a = readDate(from, cal);
  final b = readDate(until, cal);
  if (a == null || b == null) return {'message': '“${(a == null ? from : until).trim()}” $_unreadable'};
  if (b.t + b.length <= a.t) return {'message': 'The stretch ends before it starts, so there is nothing to show.'};
  return {
    'window': {'from': a.t, 'to': b.t + b.length},
  };
}

List<Map<String, Object?>> trackRows(Track t, Map<String, EventRecord> records) {
  double start(EventRecord r) => r.bounds?.start.lo ?? double.infinity;
  final rows = [for (final id in t.eventIds) ?records[id]];
  // A stable sort by start (the page's List.sort keeps no promised order for ties; Scriptor's keeps them in turn).
  final indexed = [for (final (i, r) in rows.indexed) (i, r)]
    ..sort((a, b) {
      final c = start(a.$2).compareTo(start(b.$2));
      return c != 0 ? c : a.$1.compareTo(b.$1);
    });
  return [
    for (final (_, r) in indexed)
      {
        'id': r.id,
        'title': r.title.isEmpty ? 'Untitled event' : r.title,
        'subtitle': r.bounds == null ? 'Not placed in time' : r.label,
      },
  ];
}

List<String> marksInOrder(List<ChartTrack> tracks) {
  final marks = <String, AxisMark>{};
  for (final t in tracks) {
    if (t.track.folded) continue;
    for (final m in t.axis.marks) {
      marks.putIfAbsent(m.id, () => m);
    }
  }
  final ordered = marks.values.toList()
    ..sort((a, b) {
      final byStart = a.start.compareTo(b.start);
      return byStart != 0 ? byStart : a.title.compareTo(b.title);
    });
  return [for (final m in ordered) m.id];
}

Map<String, Object?> timelineOf(StoryModel model, List<EventRecord> records, Calendar cal) {
  final out = <String, Object?>{};
  final byId = {for (final r in records) r.id: r};
  final domain = domainOf(records, day: cal.minutesPerDay, year: cal.minutesPerYear);
  final fit = domain == null ? null : (from: domain.from, to: domain.to);
  final dated = records.where((r) => r.bounds != null).length;
  for (final g in groupings(model)) {
    final grouping = Grouping.decode(g.value);
    final tracks = tracksFor(model, records, grouping);
    // Arranged as the author might: as they come, then with the first folded and the last hidden.
    final prefs = <String, TrackPrefs>{
      'plain': const TrackPrefs(),
      if (tracks.length > 1)
        'arranged': TrackPrefs(
          folded: [tracks.first.id],
          hidden: [tracks.last.id],
          order: [for (final t in tracks.reversed) t.id],
        ),
    };
    final part = <String, Object?>{'label': g.label};
    for (final MapEntry(key: how, value: p) in prefs.entries) {
      final arranged = arrange(tracks, p);
      final shown = arranged.shown;
      final at = <String, Object?>{
        'summary': summary(dated, grouping, shown.length, false, records.length, records.length),
        'filtered': summary(dated, grouping, shown.length, true, 1, records.length),
        'lists': [for (final t in shown) t.folded ? 'folded:${t.eventIds.length}' : trackRows(t, byId)],
        'unplaced': () {
          // As _Unplaced lists them: each once.
          final seen = <String>{};
          return [
            for (final u in layoutAxis([
              for (final t in shown) ...t.eventIds.map((id) => byId[id]).nonNulls.where((r) => r.bounds == null),
            ]).unplaced)
              if (seen.add(u.id)) '${u.id}|${u.title.isEmpty ? 'Untitled event' : u.title}: ${u.reason}',
          ];
        }(),
      };
      if (fit != null) {
        for (final width in [390.0, 1000.0]) {
          final chart = [
            for (final t in shown)
              (
                track: t,
                axis: layoutAxis(
                  [for (final id in t.eventIds) ?byId[id]],
                  width: width,
                  domain: domain,
                  useDomain: true,
                  day: cal.minutesPerDay,
                  year: cal.minutesPerYear,
                ),
              ),
          ];
          final order = marksInOrder(chart);
          final selected = order.isEmpty ? null : order[order.length ~/ 2];
          final zoomed = zoomWindow(fit, 1.5, (fit.from + fit.to) / 2, fit);
          final moved = panWindow(zoomWindow(zoomed, 3, (zoomed.from + zoomed.to) / 2, fit), 0.25);
          at['w$width'] = {
            'order': order,
            'all': drawing(chart, fit, width, selected),
            'zoomed': drawing(chart, zoomed, width, null),
            'moved': drawing(chart, moved, width, selected),
            'showing': [
              for (final w in [fit, zoomed, moved])
                'Showing ${() {
                  final s = chooseScale(w, 900, cal);
                  return scaleName(s.unit, s.step);
                }()}',
            ],
          };
        }
      }
      part[how] = at;
    }
    out[g.value] = part;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ order_page.dart

const _row = 48.0;

Map<String, Object?> orderOf(StoryModel model) {
  final orders = twoOrders(model);
  String eventName(String id) => model.events[id]?.name ?? 'An event';
  String rank(int? r) => r == null ? 'not placed in time' : '${ordinal(r + 1)} in story order';
  final events = orders.events;
  final tellings = orders.tellings;
  final nodes = orders.nodes;
  Map<String, Object?> lines(String? selected, double width) {
    bool touches(StoryTelling t) => t.nodeId == selected || t.eventId == selected;
    final nodeRow = {for (final (i, n) in nodes.indexed) n.id: i};
    final eventRow = {for (final (i, e) in events.indexed) e.id: i};
    double y(int i) => i * _row + _row / 2;
    return {
      'related': [
        for (final t in tellings)
          if (touches(t)) ...[t.nodeId, t.eventId],
      ],
      'lines': [
        for (final t in tellings)
          if (nodeRow[t.nodeId] case final a?)
            if (eventRow[t.eventId] case final b?)
              {
                'd': 'M0 ${_n(y(a))} C${_n(width / 2)} ${_n(y(a))} ${_n(width / 2)} ${_n(y(b))} ${_n(width)} ${_n(y(b))}',
                'width': t.role == RevealRole.mentioned
                    ? 1
                    : (selected != null && touches(t) ? 3 : (t.back || t.ahead ? 2.2 : 1.6)),
                'role': t.role.name,
                'muted': selected != null && !touches(t),
              },
      ],
    };
  }

  final whenOf = {for (final e in events) e.id: e.when};
  return {
    'nodes': [
      for (final n in nodes)
        '${n.id}|${n.label} tells ${n.tellings.map((t) => '${eventName(t.eventId)} (${revealChoices[t.role]!.toLowerCase()}, ${orderWords(t)})').join('; ')}',
    ],
    'events': [
      for (final e in events)
        '${e.id}|${e.title}, ${e.storyRank == null ? 'not placed in time' : e.when}: '
            '${e.tellings.isEmpty ? 'not told in any chapter yet' : 'told in ${e.tellings.length} ${e.tellings.length == 1 ? 'place' : 'places'}'}',
    ],
    'none': lines(null, 120),
    if (nodes.isNotEmpty) 'node': lines(nodes.first.id, 72),
    if (events.isNotEmpty) 'event': lines(events.last.id, 120),
    'reading': [
      for (final t in tellings)
        '${nodeLabel(model, t.nodeId)}: ${eventName(t.eventId)}|${revealChoices[t.role]} · ${t.storyRank == null ? 'not placed in time' : whenOf[t.eventId]} · ${rank(t.storyRank)} · ${orderWords(t)}',
    ],
    'story': [
      for (final e in events)
        '${e.title.isEmpty ? 'Untitled event' : e.title}|${e.storyRank == null ? 'Not placed in time' : e.when} · '
            '${e.tellings.isEmpty ? 'Not told in any chapter yet' : e.tellings.map((t) => tellingWords(t, model)).join('; ')}',
    ],
  };
}

/// A number as JavaScript writes it in a path (whole numbers without ".0").
String _n(double v) => v == v.truncateToDouble() && v.abs() < 1e15 ? '${v.toInt()}' : '$v';

// ------------------------------------------------------------------------------------------ life_history_page.dart

Map<String, Object?> historiesOf(StoryModel model, NovelSnapshot s) {
  final out = <String, Object?>{};
  final ids = [
    for (final e in model.entries.values)
      if (e.category == 'character') e.id,
  ]..sort();
  for (final id in ids) {
    final life = lifeHistory(
      model,
      id,
      snapshots: s.rows('progressSnapshots'),
      milestones: [for (final r in s.rows('characterHistory')) CharacterHistoryLine(r)],
    );
    if (life == null) continue;
    List<String> lines(List<HistoryItem> items) => [
      for (final i in items)
        '${i.kind.label}|${i.title}|${[
          i.when,
          if (i.age != null && ageLabel(i.age!).isNotEmpty) ageLabel(i.age!),
          if (i.detail.isNotEmpty) i.detail,
        ].join(' · ')}|${i.ref != null || i.to?.page == 'history'}',
    ];
    out[id] = {
      'born': life.born,
      'issues': life.issues,
      'story': lines(life.story),
      'reading': lines(life.reading),
      'throughout': lines(life.throughout),
    };
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------- the dump

Map<String, Object?> novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final cal = model.calendar;
  final histories = {for (final r in s.rows('alternateHistories')) str(r['id']): AlternateHistory(r)};
  final ids = histories.keys.toList()..sort();
  return {
    'timeline': timelineOf(model, eventRecords(model), cal),
    for (final h in ids)
      'history:$h': () {
        final m = withHistory(model, histories, h);
        return timelineOf(m, eventRecords(m), cal);
      }(),
    'order': orderOf(model),
    'lives': historiesOf(model, s),
  };
}

Map<String, Object?> misc() {
  final cal = Calendar.standardCalendar;
  return {
    'jump': [
      for (final t in ['10', '-500', '10-6', '10-6-14', 'June 10', 'nonsense', '', ' 1026 '])
        [t, jump(t, cal, true), jump(t, cal, false)],
    ],
    'range': [
      for (final (a, b) in [('10', '12'), ('12', '10'), ('10-6', '10-6'), ('x', '10'), ('10', 'y'), ('June 10', '11')])
        [a, b, range(a, b, cal)],
    ],
  };
}

/// The test's canonical JSON and its FNV-1a hash (as test/characters/golden/dump.dart).
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

/// Infinity has no JSON: written as a word.
Object? plainJson(Object? v) => switch (v) {
  double() when v.isInfinite => v > 0 ? 'Infinity' : '-Infinity',
  double() when v.isNaN => 'NaN',
  Map() => {for (final e in v.entries) '${e.key}': plainJson(e.value)},
  List() => [for (final x in v) plainJson(x)],
  _ => v,
};

/// With FULL set, every part whole; else each part of each novel as its hash (`misc` is always whole).
void main(List<String> args) {
  final full = Platform.environment['FULL'] != null;
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final parts = plainJson(novel(s))! as Map;
    out[name] = full ? parts : {for (final e in parts.entries) e.key: hashOf(e.value)};
  }
  out['misc'] = plainJson(misc());
  File(args.first).writeAsStringSync(jsonEncode(out));
}
