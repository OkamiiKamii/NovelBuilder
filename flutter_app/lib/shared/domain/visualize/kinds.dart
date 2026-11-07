import 'dart:math' as math;

import '../codex/capabilities.dart';
import '../codex/field_values.dart' show displayValue, jsNumber;
import '../collation.dart';
import '../json.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validity.dart';
import '../records/category.dart';
import '../records/entry.dart';
import '../records/event.dart';
import '../records/link.dart' show connectionType;
import '../stable_sort.dart';
import '../timeline/dates.dart' show formatDate, jsNum;
import '../timeline/narrative.dart' show nodeLabel;

/// RECORDS BY KIND (as in the original app)
/// Any kind of record as a table, or drawn the ways its category is set up for (`Category.uses`): on the story's
/// timeline, on a map, on a ladder of ranks, or by who holds each record over the story. Each reads only the fields
/// the author chose; a record whose value cannot be read is listed with the reason, never guessed at, and nothing is
/// changed.

/// The kinds offered: every category but characters (they have views of their own), with their records counted.
List<({Category category, int count})> kindsOf(StoryModel model) {
  final counts = <String, int>{};
  for (final e in model.entries.values) {
    counts[e.category] = (counts[e.category] ?? 0) + 1;
  }
  return [
    for (final c in model.categories.values)
      if (c.key != 'character' && (!c.archived || (counts[c.key] ?? 0) > 0)) (category: c, count: counts[c.key] ?? 0),
  ];
}

/// Which kind to show: the one asked for, else the first with records, else the first.
String? kindKeyOf(StoryModel model, String? asked) {
  final kinds = kindsOf(model);
  return kinds.where((k) => k.category.key == asked).firstOrNull?.category.key ??
      kinds.where((k) => k.count > 0).firstOrNull?.category.key ??
      kinds.firstOrNull?.category.key;
}

Category _categoryOf(StoryModel model, String key) => model.categories[key] ?? Category.unknown(key);

List<Entry> _recordsOf(StoryModel model, String key) =>
    stableSorted(model.entries.values.where((e) => e.category == key), (a, b) {
      final byName = localeCompare(a.name, b.name);
      return byName != 0 ? byName : localeCompare(a.id, b.id);
    });

String _valueOf(Entry entry, FieldDef def) =>
    entry.fields.where((f) => f.defId == def.id).firstOrNull?.value.trim() ?? '';

/// A record that is not drawn, and why, in words.
typedef Unplaced = ({Entry entry, String reason});

// ---------------------------------------------------------------------------------------------------- table

class KindTable {
  KindTable(this.category, this.columns, this.rows);
  final Category category;

  /// The kind's fields, in order; archived ones are left out.
  final List<FieldDef> columns;
  final List<({Entry entry, List<String> cells})> rows;
}

/// A kind's records as a table: one row a record, one column a field, each value as a reader sees it (a linked record
/// by its name).
KindTable kindTable(StoryModel model, String key) {
  final category = _categoryOf(model, key);
  final columns = [
    for (final f in category.fields)
      if (!f.archived) f,
  ];
  String? nameOf(String id) => model.entries[id]?.name;
  return KindTable(category, columns, [
    for (final entry in _recordsOf(model, key))
      (entry: entry, cells: [for (final def in columns) displayValue(def.type, _valueOf(entry, def), nameOf)]),
  ]);
}

String _csvCell(String text) => RegExp(r'[",\r\n]').hasMatch(text) ? '"${text.replaceAll('"', '""')}"' : text;

/// The table as CSV (RFC 4180): a name column, then one column a field.
String tableCsv(KindTable table) => [
  ['Name', for (final c in table.columns) c.name],
  for (final r in table.rows) [r.entry.name, ...r.cells],
].map((row) => row.map(_csvCell).join(',')).join('\r\n');

// ---------------------------------------------------------------------------------------------------- timeline

class TimedRecord {
  TimedRecord(this.entry, this.start, this.end, this.lo, this.hi, this.label, this.note);
  final Entry entry;
  final ExactDate start;
  final ExactDate? end;

  /// Minutes of story time, as events are placed.
  final double lo;
  final double hi;
  final String label;

  /// Why only part of it is drawn ("drawn at its start only: …"), or null.
  final String? note;
}

typedef KindTimeline = ({List<TimedRecord> placed, List<Unplaced> unplaced, List<String> missing});

final _wholeNumber = RegExp(r'^-?\d+$');
final _dateValue = RegExp(r'^(-?\d+)-(\d{1,2})-(\d{1,2})$');

/// A value as a date of the story's calendar: a Number is a year, a Date a day. The reason it is not one, otherwise.
({ExactDate? when, String? reason}) _storyDate(FieldDef def, String value, StoryModel model) {
  if (value.isEmpty) return (when: null, reason: '${def.name} is empty.');
  if (def.type == FieldType.number) {
    if (!_wholeNumber.hasMatch(value)) {
      return (when: null, reason: '${def.name} holds “$value”, not a year (a whole number).');
    }
    return (when: ExactDate(int.parse(value)), reason: null);
  }
  final m = _dateValue.firstMatch(value);
  if (m == null) return (when: null, reason: '${def.name} holds “$value”, not a date.');
  final when = ExactDate(int.parse(m[1]!), month: int.parse(m[2]!), day: int.parse(m[3]!));
  final problem = model.calendar.dateProblem(when);
  return problem != null ? (when: null, reason: '${def.name}: $problem') : (when: when, reason: null);
}

/// A kind's records on the story's timeline, from the field set as each one's date (and, if set, its end).
KindTimeline kindTimeline(StoryModel model, String key) {
  final category = _categoryOf(model, key);
  final missing = missingFor(category, KindView.timeline);
  final timeline = mapOrNull(category.uses['timeline']) ?? const {};
  final startDef = fieldOf(category, Slot.timelineStart, timeline['start']);
  if (missing.isNotEmpty || startDef == null) return (placed: const [], unplaced: const [], missing: missing);
  final endDef = fieldOf(category, Slot.timelineEnd, timeline['end']);
  final context = model.timeContext;
  String? nameOf(String id) => model.events[id]?.name;
  final placed = <TimedRecord>[];
  final unplaced = <Unplaced>[];
  for (final entry in _recordsOf(model, key)) {
    final start = _storyDate(startDef, _valueOf(entry, startDef), model);
    if (start.when == null) {
      unplaced.add((entry: entry, reason: start.reason!));
      continue;
    }
    final span = spanOfDate(start.when, context);
    if (span == null) {
      unplaced.add((entry: entry, reason: '${startDef.name} cannot be placed in the novel’s calendar.'));
      continue;
    }
    ExactDate? end;
    String? note;
    var hi = span.hi;
    final endValue = endDef == null ? '' : _valueOf(entry, endDef);
    if (endDef != null && endValue.isNotEmpty) {
      final read = _storyDate(endDef, endValue, model);
      final endSpan = read.when == null ? null : spanOfDate(read.when, context);
      if (read.when == null) {
        note = 'drawn at its start only: ${read.reason}';
      } else if (endSpan == null) {
        note = 'drawn at its start only: ${endDef.name} cannot be placed in the novel’s calendar.';
      } else if (endSpan.hi <= span.lo) {
        note = 'drawn at its start only: ${endDef.name} is before ${startDef.name}.';
      } else {
        end = read.when;
        hi = endSpan.hi;
      }
    }
    final label = end != null
        ? '${formatDate(start.when, nameOf, model.calendar)} to ${formatDate(end, nameOf, model.calendar)}'
        : formatDate(start.when, nameOf, model.calendar);
    placed.add(TimedRecord(entry, start.when!, end, span.lo, hi, label, note));
  }
  final sorted = stableSorted(placed, (a, b) {
    final byStart = a.lo.compareTo(b.lo);
    return byStart != 0 ? byStart : localeCompare(a.entry.name, b.entry.name);
  });
  return (placed: sorted, unplaced: unplaced, missing: missing);
}

// ---------------------------------------------------------------------------------------------------- map

typedef MapPoint = ({Entry entry, num x, num y});
typedef KindMap = ({List<MapPoint> points, List<Unplaced> unplaced, ({String x, String y}) axes, List<String> missing});

/// Round numbers between two values, for a map's grid: about [count] of them, at 1, 2 or 5 times a power of ten.
List<num> niceTicks(num lo, num hi, [int count = 5]) {
  if (!(hi > lo)) return [lo];
  final raw = (hi - lo) / count;
  final power = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final step = [1, 2, 5, 10].map((m) => m * power).firstWhere((s) => s >= raw);
  final out = <num>[];
  for (var t = (lo / step).ceil() * step; t <= hi + step * 1e-9; t += step) {
    final rounded = double.parse(t.toStringAsFixed(10));
    out.add(rounded == rounded.truncateToDouble() ? rounded.toInt() : rounded);
  }
  return out;
}

/// A kind's records on a plane, from the two Number fields set as across and up.
KindMap kindMap(StoryModel model, String key) {
  final category = _categoryOf(model, key);
  final missing = missingFor(category, KindView.map);
  final map = mapOrNull(category.uses['map']) ?? const {};
  final xDef = fieldOf(category, Slot.mapX, map['x']);
  final yDef = fieldOf(category, Slot.mapY, map['y']);
  if (missing.isNotEmpty || xDef == null || yDef == null) {
    return (points: const [], unplaced: const [], axes: (x: xDef?.name ?? '', y: yDef?.name ?? ''), missing: missing);
  }
  final points = <MapPoint>[];
  final unplaced = <Unplaced>[];
  for (final entry in _recordsOf(model, key)) {
    final reasons = [
      for (final def in [xDef, yDef])
        if (_valueOf(entry, def) case final v)
          if (v.isEmpty) '${def.name} is empty.' else if (jsNumber(v) == null) '${def.name} holds “$v”, not a number.',
    ];
    if (reasons.isNotEmpty) {
      unplaced.add((entry: entry, reason: reasons.join(' ')));
    } else {
      points.add((entry: entry, x: jsNumber(_valueOf(entry, xDef))!, y: jsNumber(_valueOf(entry, yDef))!));
    }
  }
  return (points: points, unplaced: unplaced, axes: (x: xDef.name, y: yDef.name), missing: missing);
}

// ---------------------------------------------------------------------------------------------------- rank

typedef RankLevel = ({String label, List<Entry> entries});
typedef KindRanks = ({List<RankLevel> levels, List<Unplaced> unplaced, String field, List<String> missing});

/// A kind's records on a ladder, highest first, from the field set as their rank: a Number by its value, a Choice
/// (one) by the order of its choices, lowest first. A Choice field's levels are all its choices, held or not, so the
/// ladder keeps its shape.
KindRanks kindRanks(StoryModel model, String key) {
  final category = _categoryOf(model, key);
  final missing = missingFor(category, KindView.rank);
  final def = fieldOf(category, Slot.rank, category.uses['rank']);
  if (missing.isNotEmpty || def == null) {
    return (levels: const [], unplaced: const [], field: def?.name ?? '', missing: missing);
  }
  final unplaced = <Unplaced>[];
  final at = <String, List<Entry>>{};
  for (final entry in _recordsOf(model, key)) {
    final v = _valueOf(entry, def);
    if (v.isEmpty) {
      unplaced.add((entry: entry, reason: '${def.name} is empty.'));
    } else if (def.type == FieldType.number && jsNumber(v) == null) {
      unplaced.add((entry: entry, reason: '${def.name} holds “$v”, not a number.'));
    } else if (def.type == FieldType.select && !def.options.contains(v)) {
      unplaced.add((entry: entry, reason: '${def.name} holds “$v”, not one of its choices.'));
    } else {
      (at[def.type == FieldType.number ? jsNum(jsNumber(v)!) : v] ??= []).add(entry);
    }
  }
  final labels = def.type == FieldType.select
      ? def.options.reversed.toList()
      : stableSorted(at.keys, (a, b) => num.parse(b).compareTo(num.parse(a)));
  return (
    levels: [for (final l in labels) (label: l, entries: at[l] ?? const <Entry>[])],
    unplaced: unplaced,
    field: def.name,
    missing: missing,
  );
}

// ---------------------------------------------------------------------------------------------------- who holds it

class Holding {
  Holding(this.connection, this.holder, this.holderName, this.when);
  final Connection connection;
  final EntityRef holder;
  final String holderName;

  /// When it holds, in words: "from Ch 2 until “The siege”", or "no time given".
  final String when;
}

class HeldRecord {
  HeldRecord(this.entry, this.history, this.current, this.note);
  final Entry entry;

  /// Every recorded holding, in the order they began.
  final List<Holding> history;

  /// Who the current-holder field names, if it is set and filled in.
  final ({String id, String name})? current;

  /// A difference worth a look between the field and the history, in words, or null. Never fixed for the author.
  final String? note;
}

typedef KindHolders = ({List<HeldRecord> records, String typeLabel, String? field, List<String> missing});

/// Who holds each record over the story: every connection of the chosen type from a holder to the record, in the
/// order they began (a change of holder is recorded as one connection ending where the next begins), beside who the
/// current-holder field names.
KindHolders kindHolders(StoryModel model, String key) {
  final category = _categoryOf(model, key);
  final missing = missingFor(category, KindView.ownership);
  final ownership = mapOrNull(category.uses['ownership']) ?? const {};
  final type = strOrNull(ownership['type']);
  final def = fieldOf(category, Slot.ownershipField, ownership['field']);
  if (missing.isNotEmpty || type == null || type.isEmpty) {
    return (
      records: const [],
      typeLabel: type == null || type.isEmpty ? '' : connectionType(type).label,
      field: def?.name,
      missing: missing,
    );
  }
  final want = connectionType(type).key;
  final context = model.timeContext;
  String nameOf(EntityRef ref) =>
      (ref.type == EntityType.entry ? model.entries[ref.id]?.name : null) ?? 'a record that is gone';
  String words(Anchor a) => switch (a) {
    NodeAnchor(:final nodeId) => nodeLabel(model, nodeId),
    EventAnchor(:final eventId) => '“${model.events[eventId]?.name ?? 'a deleted event'}”',
    DateAnchor(when: final date) => formatDate(date, (id) => model.events[id]?.name, model.calendar),
  };
  final links = [
    for (final c in deriveConnections(model).connections)
      if (c.kind == ConnectionKind.link && connectionType(c.type).key == want && c.to.type == EntityType.entry) c,
  ];
  final records = [
    for (final entry in _recordsOf(model, key))
      () {
        final mine = historyOf(
          [
            for (final c in links)
              if (c.to.id == entry.id) c,
          ],
          (c) => c.validity ?? Validity.always,
          context,
        );
        final history = [
          for (final c in mine)
            () {
              final v = c.validity ?? Validity.always;
              final when = [
                if (v.from != null) 'from ${words(v.from!)}',
                if (v.until != null) 'until ${words(v.until!)}',
              ].join(' ');
              return Holding(c, c.from, nameOf(c.from), when.isEmpty ? 'no time given' : when);
            }(),
        ];
        final id = def == null ? '' : _valueOf(entry, def);
        final current = id.isNotEmpty && model.entries.containsKey(id) ? (id: id, name: model.entries[id]!.name) : null;
        final open = [
          for (final h in history)
            if (h.connection.validity?.until == null) h,
        ];
        final note = current != null && open.isNotEmpty && !open.any((h) => h.holder.id == current.id)
            ? '${def!.name} names ${current.name}, but the holding recorded as still in force is '
                  '${open.map((h) => '${h.holderName}’s').join(' and ')}.'
            : null;
        return HeldRecord(entry, history, current, note);
      }(),
  ];
  return (records: records, typeLabel: connectionType(type).label, field: def?.name, missing: missing);
}
