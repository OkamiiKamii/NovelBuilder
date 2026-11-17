// The Flutter app's own outputs for phase 6a's timeline (timeline.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: its event records and their problems, events at the same
// time, ages and life paths, life histories, the timeline review, the chronicle (groups and rows, wide and narrow) and
// each event's card, each event page's issues and lines, the alternate histories (events, comparisons, the open
// history's view), the calendar page with each ready-made calendar as its draft, the What if…? starters, the chapter
// seed, and a script of timeline changes run on a copy (each step's rows or refusal). And `misc`: dates in every form,
// typed dates and the axis's marks in every calendar preset, and the date editor's fields.
//
// What is the widgets' (timeline_page.dart's grouping and card, chronicle.dart's rows, event_page.dart's issues and
// lines, histories_page.dart's lines, calendar_page.dart's preview, date_editor.dart's fields, chapter_seed.dart,
// what_if.dart) is copied here word for word, but for the ids (handed out in turn, as the tests' are).
//
// To make the golden again: run.sh in the scratchpad's `timeline` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/records/review.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/timeline/ages.dart';
import 'package:novel_builder/shared/domain/timeline/axis.dart';
import 'package:novel_builder/shared/domain/timeline/calendar_presets.dart';
import 'package:novel_builder/shared/domain/timeline/chronology.dart';
import 'package:novel_builder/shared/domain/timeline/dates.dart';
import 'package:novel_builder/shared/domain/timeline/event_changes.dart';
import 'package:novel_builder/shared/domain/timeline/event_record.dart';
import 'package:novel_builder/shared/domain/timeline/histories.dart';
import 'package:novel_builder/shared/domain/timeline/life_history.dart';
import 'package:novel_builder/shared/domain/timeline/narrative.dart';
import 'package:novel_builder/shared/domain/timeline/overlap.dart';
import 'package:novel_builder/shared/domain/timeline/review.dart';
import 'package:novel_builder/shared/domain/timeline/scale.dart';

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

const importanceLabels = {'minor': 'Minor', 'major': 'Major', 'climax': 'Climax'};
const revealChoices = {
  RevealRole.told: 'Told here',
  RevealRole.flashback: 'As a flashback',
  RevealRole.flashforward: 'As a flash-forward',
  RevealRole.foreshadowed: 'Foreshadowed',
  RevealRole.mentioned: 'Only mentioned',
  RevealRole.revealed: 'Revealed afterwards',
};
const _together = {
  Together.sameTime: 'same-time',
  Together.during: 'during',
  Together.contains: 'contains',
  Together.overlaps: 'overlaps',
  Together.maybe: 'maybe',
};
const _differences = {
  Difference.same: 'same',
  Difference.changed: 'changed',
  Difference.moved: 'moved',
  Difference.onlyA: 'only-a',
  Difference.onlyB: 'only-b',
};

Object? span(Span? s) => s == null ? null : [s.lo, s.hi];

Object age(AgeAt a) => switch (a) {
  StatedAge(:final age) => {'kind': 'stated', 'age': age},
  KnownAge(:final age) => {'kind': 'known', 'age': age},
  AgeRange(:final min, :final max) => {'kind': 'range', 'min': min, 'max': max},
  Unborn() => {'kind': 'unborn'},
  UnknownAge(:final reason) => {'kind': 'unknown', 'reason': reason},
};

List<Entry> charactersOf(StoryModel model) => stableSorted([
  for (final e in model.entries.values)
    if (e.category == 'character') e,
], (a, b) => localeCompare(a.name, b.name));

// ---------------------------------------------------------------------------------------------------- one novel

Map<String, Object?> novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final cal = model.calendar;
  final placed = resolveChronology(model.events.values, cal);
  final records = eventRecords(model);
  final out = <String, Object?>{};

  out['records'] = [
    for (final r in records)
      {
        'id': r.id,
        'label': r.label,
        'shape': r.shape.name,
        'precision': r.precision,
        'span': span(r.span),
        'bounds': r.bounds == null ? null : [span(r.bounds!.start), span(r.bounds!.end), r.bounds!.open],
        'dateProblem': r.dateProblem,
        'told': [
          for (final t in r.told) [t.nodeId, t.role.name, t.position],
        ],
        'problems': validateEvent(model, r.event),
      },
  ];
  out['sameTime'] = {
    for (final r in records)
      r.id: [
        for (final x in atTheSameTime(records, r.id, cal.minutesPerDay)) [x.record.id, _together[x.how], x.how.words],
      ],
  };
  final characters = charactersOf(model);
  out['ages'] = {
    for (final c in characters)
      c.id: () {
        final a = agesOf(c.id, model.events, calendar: cal, birthDate: birthDateOf(c));
        return {
          'birth': [span(a.birth.span), a.birth.basis, a.birth.unread, a.birth.conflict],
          'at': {for (final e in a.at.entries) e.key: age(e.value)},
          'issues': a.issues,
          'labels': {for (final e in a.at.entries) e.key: [ageLabel(e.value), ageWords(e.value)]},
        };
      }(),
  };
  out['lifePaths'] = {
    for (final c in characters)
      c.id: () {
        final steps = lifePath(placed, c.id, calendar: cal, birthDate: birthDateOf(c));
        return {
          'steps': [
            for (final st in steps) [st.placed.event.id, st.label, st.age, st.stated, st.issue],
          ],
          'summary': lifeSummary(steps),
        };
      }(),
  };
  final milestones = [for (final r in s.rows('characterHistory')) CharacterHistoryLine(r)];
  out['lives'] = {
    for (final c in characters)
      c.id: () {
        final life = lifeHistory(model, c.id, snapshots: s.rows('progressSnapshots'), milestones: milestones)!;
        Object item(HistoryItem i) => [
          i.key,
          i.kind.name,
          i.ref?.toJson(),
          i.to == null ? null : [i.to!.page, i.to!.id],
          i.title,
          i.detail,
          i.when,
          i.age == null ? null : age(i.age!),
        ];
        return {
          'born': life.born,
          'story': [for (final i in life.story) item(i)],
          'reading': [for (final i in life.reading) item(i)],
          'throughout': [for (final i in life.throughout) item(i)],
          'issues': life.issues,
        };
      }(),
  };
  final findings = reviewTimeline(model, s.rows('continuityRules'));
  final decisions = [for (final r in s.rows('continuityResolutions')) ReviewItem(r)];
  final review = withDecisions(findings, decisions);
  out['review'] = {
    'findings': [for (final f in findings) f.toJson()],
    'open': [for (final f in review.open) f.key],
    'decided': [for (final d in review.decided) [d.finding.key, d.decision.key]],
    'gone': [for (final d in review.gone) d.key],
  };
  List<ReviewFinding> findingsOf(String eventId) => [
    for (final f in review.open)
      if (f.eventIds.contains(eventId) &&
          (f.rule == ReviewRule.dates || f.rule == ReviewRule.travel || f.rule == ReviewRule.twoPlaces))
        f,
  ];

  // The chronicle: grouped as timeline_page.dart groups it, with no filter and then each character's life.
  List<({String key, String heading, List<Placed> items})> groupsOf(List<Placed> visible) {
    final groups = <({String key, String heading, List<Placed> items})>[];
    for (final item in visible) {
      final last = groups.lastOrNull;
      final key = item.year != null ? '${item.year}' : (item.anchored && last != null ? last.key : 'undated');
      if (last?.key == key) {
        last!.items.add(item);
      } else {
        groups.add((
          key: key,
          heading: key == 'undated' ? 'Not yet placed in time' : cal.yearName(int.parse(key)),
          items: [item],
        ));
      }
    }
    return groups;
  }

  List<Object> rowsOf(List<({String key, String heading, List<Placed> items})> groups, bool wide) {
    final rows = <Object>[];
    var side = 0;
    int? lastYear;
    for (final g in groups) {
      final year = int.tryParse(g.key);
      final undated = year == null;
      if (year != null && lastYear != null && year - lastYear > 1) rows.add(['gap', '${year - lastYear} years later']);
      rows.add(['year', g.heading, undated, rows.isEmpty]);
      for (final p in g.items) {
        rows.add(['event', p.event.id, wide && side.isEven, p.event.importanceKey, undated]);
        side++;
      }
      if (year != null) lastYear = year;
    }
    return rows;
  }

  final groups = groupsOf(placed);
  out['chronicle'] = {
    'groups': [
      for (final g in groups) [g.key, g.heading, [for (final p in g.items) p.event.id]],
    ],
    'wide': rowsOf(groups, true),
    'narrow': rowsOf(groups, false),
    'lives': {
      for (final c in characters)
        c.id: [
          for (final g in groupsOf([
            for (final p in placed)
              if (p.event.characters.any((x) => x.id == c.id)) p,
          ]))
            [g.key, g.heading, g.items.length],
        ],
    },
  };
  String? eventName(String id) => model.events[id]?.name;

  // Each event's card (timeline_page.dart's _EventCard), with no life chosen.
  out['cards'] = {
    for (final p in placed)
      p.event.id: () {
        final event = p.event;
        final cast = [for (final c in event.characters) ?model.entries[c.id]?.name];
        final told = [
          for (final id in event.nodeIds)
            if (model.nodes.containsKey(id))
              event.reveals[id] == null || event.reveals[id] == RevealRole.told
                  ? nodeLabel(model, id)
                  : '${nodeLabel(model, id)} (${revealChoices[event.reveals[id]]!.toLowerCase()})',
        ];
        final place = model.entries[event.locationId]?.name;
        final when = [
          p.label,
          if (event.duration != null) 'lasts ${formatDuration(event.duration)}',
          if (event.ongoing) 'still going on',
          if (event.raw['end'] != null)
            event.end is UnknownDate ? 'end not known' : 'until ${formatDate(event.end, eventName, cal)}',
        ].join(' · ');
        final details = [
          ?place,
          if (cast.isNotEmpty) cast.join(', '),
          if (told.isNotEmpty) 'Told in ${told.join(', ')}',
        ].join(' · ');
        final problems = p.issues.length + findingsOf(event.id).length;
        return [
          when,
          event.name.isEmpty ? 'Untitled event' : event.name,
          event.importanceKey == 'minor' ? null : importanceLabels[event.importanceKey] ?? event.importanceKey,
          details,
          problems > 0 ? '$problems ${problems == 1 ? 'thing' : 'things'} to check' : null,
        ];
      }(),
  };

  // Each event's page (event_page.dart): its issues, end mode, who is in it, followers and what is at the same time.
  out['pages'] = {
    for (final p in placed)
      p.event.id: () {
        final event = p.event;
        final id = event.id;
        final others = [
          for (final x in placed)
            if (x.event.id != id) x,
        ];
        final cast = [
          for (final c in event.characters)
            if (model.entries[c.id] case final entry?) (id: c.id, age: c.age, entry: entry),
        ];
        final steps = {
          for (final c in cast)
            c.id: lifePath(
              placed,
              c.id,
              calendar: cal,
              birthDate: birthDateOf(c.entry),
            ).where((st) => st.placed.event.id == id).firstOrNull,
        };
        final issues = [
          ...p.issues,
          for (final c in cast)
            if (steps[c.id]?.issue case final issue?)
              issue
                  .replaceFirst(RegExp('^Stated'), '${c.entry.name} is stated')
                  .replaceFirst(RegExp('^Takes part'), '${c.entry.name} takes part'),
          for (final f in findingsOf(id)) f.message,
        ];
        final record = records.firstWhere((r) => r.id == id);
        final followers = [
          for (final x in others)
            if (x.event.afterId == id) x.event.name,
        ];
        final endMode = event.ongoing
            ? 'ongoing'
            : event.raw['end'] == null
            ? ''
            : (event.end is UnknownDate ? 'unknown' : 'date');
        final sameTime = atTheSameTime(records, id, cal.minutesPerDay);
        String hint(AgeAt? a) => switch (a) {
          final KnownAge a => '≈ ${ageWords(a)}',
          final AgeRange a => '≈ ${a.min}–${a.max}',
          _ => 'Age',
        };
        return {
          'subtitle': '${importanceLabels[event.importanceKey] ?? 'Minor'} · ${record.label}',
          'issues': issues,
          'endMode': endMode,
          'cast': [
            for (final c in cast) [c.id, c.age, hint(steps[c.id]?.ageAt)],
          ],
          'followers': followers.isEmpty ? null : 'Followed by: ${followers.join(', ')}',
          'sameTime': [
            for (final x in sameTime)
              '${x.record.title} · ${x.how.words}'
                  '${x.record.event.locationId != null && model.entries[x.record.event.locationId] != null ? ' · at ${model.entries[x.record.event.locationId]!.name}' : ''}',
          ],
          'told': [
            for (final t in record.told)
              if (model.nodes.containsKey(t.nodeId)) [t.nodeId, nodeLabel(model, t.nodeId), t.role.name],
          ],
        };
      }(),
  };

  // Alternate histories (histories_page.dart): each against the main timeline and its base, and as it is opened.
  final histories = {for (final r in s.rows('alternateHistories')) str(r['id']): AlternateHistory(r)};
  final list = stableSorted(histories.values, (a, b) => a.createdAt.compareTo(b.createdAt));
  String timelineName(String? id) => id == null ? mainTimeline : '“${histories[id]?.name ?? 'a deleted history'}”';
  List<Object> lines(List<EventDifference> diffs, String? a, String? b) => [
    for (final d in diffs)
      [
        (d.b ?? d.a)!.name,
        'In ${timelineName(a)}: ${d.a == null ? 'Does not happen' : '${d.a!.name == (d.b ?? d.a)!.name ? '' : '${d.a!.name}: '}${d.whenA}'}',
        'In ${timelineName(b)}: ${d.b == null ? 'Does not happen' : d.whenB}',
        switch (d.difference) {
          Difference.same => 'The same',
          Difference.changed => 'Changed: ${d.fields.join(', ')}',
          Difference.moved => 'Moved ${d.direction ?? ''}: its date depends on one that changed'.replaceAll('  ', ' '),
          Difference.onlyA => 'Only in ${timelineName(a)}',
          Difference.onlyB => 'Only in ${timelineName(b)}',
        },
        _differences[d.difference],
      ],
  ];
  out['histories'] = {
    for (final h in list)
      h.id: () {
        final base = historyEvents(model.events, histories, h.baseId);
        final mine = historyEvents(model.events, histories, h.id);
        final diffs = compareTimelines(base, mine, cal);
        final baseOrder = resolveChronology(base.values, cal);
        final origin = h.originEventId == null
            ? null
            : baseOrder.where((p) => p.event.id == h.originEventId).firstOrNull;
        final before = origin?.value == null
            ? const <String>[]
            : [
                for (final id in h.changed.keys)
                  if (baseOrder.where((p) => p.event.id == id).firstOrNull?.value case final v? when v < origin!.value!)
                    id,
              ];
        final counts = [
          if (h.changed.isNotEmpty) '${h.changed.length} changed',
          if (h.removed.isNotEmpty) '${h.removed.length} not happening',
          if (h.added.isNotEmpty) '${h.added.length} only here',
        ];
        return {
          'name': h.name,
          'kind': h.kind.key,
          'status': h.status.key,
          'events': [for (final p in resolveChronology(mine.values, cal)) [p.event.id, p.label, p.event.name]],
          'summary': comparisonSummary(diffs, timelineName(h.baseId), timelineName(h.id)),
          'lines': lines(diffs, h.baseId, h.id),
          'origin': originWords(h, base, histories, cal),
          'stale': staleChanges(model.events, histories, h),
          'before': before.isEmpty
              ? null
              : '${before.map((id) => '“${base[id]?.name}”').join(', ')} ${before.length == 1 ? 'is' : 'are'} changed, though ${before.length == 1 ? 'it comes' : 'they come'} before where this history departs. That may be what you mean (a time-travel branch reaches back), or a slip.',
          'counts': counts.isEmpty ? 'No differences yet' : counts.join(' · '),
        };
      }(),
  };

  // The calendar page with each ready-made calendar as its draft: its problems or what it is, and the events it lacks.
  out['calendars'] = [
    for (final draft in [calendarSettingsOf(s.rows('storyCalendars').firstOrNull), for (final p in calendarPresets) p.settings])
      () {
        final problems = calendarProblems(draft);
        final preview = Calendar.fromJson(draft);
        final away = problems.isNotEmpty
            ? const <List<String>>[]
            : [
                for (final e in model.events.values)
                  if ((e.when == null ? null : preview.dateProblem(e.when!)) ??
                          (e.end == null ? null : preview.dateProblem(e.end!))
                      case final problem?)
                    [e.id, e.name, problem],
              ];
        final sampleYear = preview.eras.isNotEmpty ? preview.eras.last.startYear + 3 : 10;
        final sample = formatDate(ExactDate(sampleYear, month: 1, day: 1), null, preview);
        return {
          'problems': problems,
          'summary': problems.isNotEmpty ? null : '${describeCalendar(preview)}. Dates read like “$sample”.',
          'away': [for (final m in away.take(8)) [m[0], '${m[1]}: ${m[2]}']],
          'awayTotal': away.length,
          'labels': [for (final p in placed) formatDate(p.event.when, eventName, preview)],
        };
      }(),
  ];

  // What if…? (what_if.dart), from the novel's events in story order and its people.
  out['whatIf'] = () {
    final events = [for (final p in placed) (id: p.event.id, name: p.event.name)];
    final people = [for (final c in characters) c.name];
    final starters = <List<Object?>>[
      for (final e in events.take(3))
        if (e.name.trim().isNotEmpty) ['What if ${e.name.trim()} never happened?', e.id],
      for (final p in people.take(2))
        if (p.trim().isNotEmpty) ['What if ${p.trim()} chose otherwise?', null],
      ['What if the hero failed?', null],
      ['What if it all happened ten years earlier?', null],
    ];
    return starters.take(6).toList();
  }();

  // The chapter seed (chapter_seed.dart) and the events it makes, on a copy with no events.
  out['seed'] = () {
    final chapters = model.order.chapters;
    final more = chapters.length - 5;
    final empty = s.withRows('timelineEvents', const []);
    var n = 0;
    final c = EventChanges(empty, now: 1000, createId: () => 'id${++n}');
    Object? made;
    try {
      final ids = c.eventsFromChapters([for (final ch in chapters) ch.id]);
      made = [
        for (final id in ids)
          () {
            final r = c.snapshot.rows('timelineEvents').firstWhere((x) => x['id'] == id);
            return [r['name'], r['description'], r['nodeIds'], r['afterId'], r['createdAt']];
          }(),
      ];
    } on ChangeRefused catch (e) {
      made = 'refused: ${e.message}';
    }
    return {
      'rows': [
        for (final (i, ch) in chapters.take(5).indexed)
          [ch.displayTitle, i > 0, i < chapters.length - 1 && i < 4 || more > 0],
      ],
      'more': more > 0 ? 'and ${plural(more, 'more chapter')}' : null,
      'button': chapters.length == 1 ? 'Make an event from the chapter' : 'Make ${chapters.length} events from the chapters',
      'made': made,
      'message': made is List
          ? '${plural(made.length, 'event')} made from your chapters, in the order they are told. Give each a date to place it in time.'
          : null,
    };
  }();

  out['script'] = script(s);
  return out;
}

/// A script of timeline changes run on a copy: each step's events, calendar and histories after it, or its refusal.
List<Object?> script(NovelSnapshot s) {
  var snapshot = s;
  var n = 0;
  final model = StoryModel.fromSnapshot(s);
  final firstEvent = model.events.keys.firstOrNull;
  final firstPlace = [
    for (final e in model.entries.values)
      if (e.category == 'location') e.id,
  ].firstOrNull;
  final firstCharacter = charactersOf(model).firstOrNull?.id;
  final firstChapter = model.order.chapters.firstOrNull?.id;
  final firstThread = model.threads.keys.firstOrNull;
  final out = <Object?>[];
  String? made;
  String? history;
  void step(String what, Object? Function(EventChanges c) apply) {
    final c = EventChanges(snapshot, now: 5000 + out.length, createId: () => 'new${++n}');
    try {
      final result = apply(c);
      snapshot = c.snapshot;
      out.add([
        what,
        result is String || result is List || result is Map || result == null ? result : '$result',
        snapshot.rows('timelineEvents'),
        snapshot.rows('storyCalendars'),
        snapshot.rows('alternateHistories'),
      ]);
    } on ChangeRefused catch (e) {
      out.add([what, 'refused: ${e.message}']);
    }
  }

  step('create', (c) => made = c.createEvent('  The siege  '));
  step('create blank', (c) => c.createEvent('   '));
  step(
    'update all',
    (c) => c.updateEvent(made!, (_) => {
      'name': '   ',
      'description': 'At the gate.',
      'when': {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 30},
      'locationId': firstPlace ?? 'gone',
      'characters': [
        {'id': firstCharacter ?? 'gone', 'age': '17.4'},
        {'id': firstCharacter ?? 'gone', 'age': 3},
        {'id': 'gone', 'age': 1},
      ],
      'entryIds': [firstPlace ?? 'gone', 'gone', firstPlace ?? 'gone'],
      'nodeIds': [firstChapter ?? 'gone', 'nowhere'],
      'afterId': made,
      'threadIds': [firstThread ?? 'gone', 'other'],
      'labels': ['  quiet   MOMENT ', 'Quiet moment', '', 'mine', 'x' * 50],
      'status': 'planned',
      'canon': 'provisional',
      'importance': 'climax',
      'reveals': [
        {'nodeId': firstChapter ?? 'gone', 'role': 'flashback'},
        {'nodeId': firstChapter ?? 'gone', 'role': 'mentioned'},
      ],
    }),
  );
  step('duration', (c) => c.updateEvent(made!, (_) => {'duration': {'amount': '2.5', 'unit': 'weeks'}}));
  step('duration zero', (c) => c.updateEvent(made!, (_) => {'duration': {'amount': 0, 'unit': 'days'}}));
  step('end', (c) => c.updateEvent(made!, (_) => {'end': {'precision': 'approximate', 'year': 1021, 'season': 'winter'}}));
  step('ongoing', (c) => c.updateEvent(made!, (_) => {'ongoing': true}));
  step(
    'relative',
    (c) => c.updateEvent(made!, (_) => {
      'when': {'precision': 'relative', 'anchorId': firstEvent ?? made, 'amount': -3, 'unit': 'fortnights', 'direction': 'x'},
    }),
  );
  step('after', (c) => c.updateEvent(made!, (_) => {'afterId': firstEvent}));
  step('unknown event', (c) => c.updateEvent('nobody', (_) => {'name': 'x'}));
  step('from chapters', (c) => c.eventsFromChapters([for (final ch in model.order.chapters) ch.id]));
  step('bad calendar', (c) => c.saveCalendar({'kind': 'custom', 'name': '', 'months': [], 'hoursPerDay': 0}));
  step('preset calendar', (c) => c.saveCalendar(calendarPresets[1].settings));
  step('standard calendar', (c) => c.saveCalendar({'kind': 'standard'}));
  step('history', (c) => history = c.createHistory(name: '  If the Keep fell  ', originEventId: made, kind: 'time-travel', status: 'alternate'));
  step('history change same', (c) => c.changeHistoryEvent(history!, made!, {'name': 'The siege'}));
  step(
    'history change',
    (c) => c.changeHistoryEvent(history!, made!, {
      'name': 'The fall',
      'when': {'precision': 'exact', 'year': 1030},
      'locationId': firstCharacter,
      'characters': [
        {'id': firstCharacter ?? 'gone', 'age': 4},
        {'id': firstCharacter ?? 'gone', 'age': 5},
      ],
      'duration': {'amount': 3, 'unit': 'months'},
    }),
  );
  if (firstEvent != null) step('history remove', (c) => c.removeHistoryEvent(history!, firstEvent));
  step('history remove unknown', (c) => c.removeHistoryEvent(history!, 'nobody'));
  String? added;
  step('history add', (c) => added = c.addHistoryEvent(history!, 'The parley'));
  step('history update added', (c) => c.updateAddedEvent(history!, added!, {'name': '  ', 'ongoing': true}));
  step('history update added unknown', (c) => c.updateAddedEvent(history!, made!, {'name': 'x'}));
  step('history update', (c) => c.updateHistory(history!, {'name': ' ', 'kind': 'nope', 'status': 'non-canon', 'note': ' why ', 'originEventId': 'gone'}));
  String? child;
  step('child history', (c) => child = c.createHistory(name: 'Further', baseId: history));
  step('loops', (c) => [c.loops(history!, child!), c.loops(child!, history!)]);
  if (firstEvent != null) step('history restore', (c) => c.restoreHistoryEvent(history!, firstEvent));
  step('forget stale', (c) => c.forgetStale(history!));
  step('remove history', (c) => c.removeHistory(history!));
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

Map<String, Object?> misc() {
  final calendars = <String, Calendar>{
    'standard': Calendar.standardCalendar,
    for (final p in calendarPresets) p.name: Calendar.fromJson(p.settings),
  };
  final dates = <Object?>[
    {'precision': 'exact', 'year': 10, 'month': 2, 'day': 31, 'hour': 25, 'minute': 70},
    {'precision': 'exact', 'year': 1020, 'month': 13, 'day': 3, 'hour': 5, 'minute': 7},
    {'precision': 'exact', 'year': -3, 'month': 1, 'day': 1},
    {'precision': 'approximate', 'year': 7, 'month': 0, 'season': 'winter'},
    {'precision': 'approximate', 'year': 7, 'month': 3},
    {'precision': 'approximate', 'year': 1, 'season': 'summer'},
    {'precision': 'relative', 'anchorId': 'x', 'amount': '2.5', 'unit': 'weeks', 'direction': 'after'},
    {'precision': 'unknown'},
  ];
  const typed = ['10', 'Year -500', '1020-5', '1020-5-4', '1020-13', 'Frostmoon 4', 'Cycle 3 12', 'Age of Kings 4', 'Ashen Age of Kings 2', 'First Turning 1', ' 7 / 3 / 1 '];
  return {
    'presets': [
      for (final p in calendarPresets) [p.name, p.about, yearOf(p.settings), presetIsValid(p), describeCalendar(Calendar.fromJson(p.settings))],
    ],
    'calendars': {
      for (final MapEntry(key: name, value: c) in calendars.entries)
        name: {
          'normalized': [for (final d in dates) normalizeDate(d, c)],
          'formatted': [for (final d in dates) formatDate(EventDate.fromJson(normalizeDate(d, c)), (_) => 'The Siege', c)],
          'problems': [
            for (final d in dates)
              if (EventDate.fromJson(d) case final date?) c.dateProblem(date),
          ],
          'typed': {
            for (final t in typed)
              t: switch (readDate(t, c)) {
                final r? => [r.t, r.length],
                null => null,
              },
          },
          'ticks': [
            for (final w in [
              (from: 0.0, to: c.minutesPerYear * 3),
              (from: c.minutesPerYear * 10, to: c.minutesPerYear * 10 + c.minutesPerDay * 40),
              (from: -c.minutesPerYear * 2000, to: c.minutesPerYear * 3000),
              (from: c.minutesPerYear * 5 + 100, to: c.minutesPerYear * 5 + c.minutesPerDay * 2),
            ])
              [
                for (final width in [1200.0, 320.0])
                  () {
                    final sc = chooseScale(w, width, c);
                    return [sc.unit.name, sc.step, scaleName(sc.unit, sc.step), [for (final t in ticksFor(w, width, c)) [t.t, t.label]]];
                  }(),
              ],
          ],
          'parts': [for (final t in [0.0, 12345.0, c.minutesPerYear * 3.5, -c.minutesPerDay * 3]) () {
            final p = partsOf(t, c);
            return [p.year, p.month, p.day, p.minute];
          }()],
          'ages': [
            for (final (b, a) in [
              (Span(0, 1439), Span(c.minutesPerYear * 17, c.minutesPerYear * 17 + 10)),
              (Span(0, c.minutesPerYear - 1), Span(c.minutesPerYear * 26, c.minutesPerYear * 27 - 1)),
              (Span(c.minutesPerYear * 5, c.minutesPerYear * 5 + 100), Span(0, 10)),
            ])
              age(ageAt(b, a, c)),
          ],
        },
    },
    'labels': [
      for (final raw in [['  mystery   CLUE ', 'Mystery clue', '', 'mine'], 'x', [1, 'Action', 'ACTION', 'a' * 41]]) cleanLabels(raw),
    ],
    'together': [
      for (final (a, b) in [
        (EventBounds(Span(0, 1439), Span(0, 1439), null), EventBounds(Span(0, 1439), Span(0, 1439), null)),
        (EventBounds(Span(0, 525599), null, 'ongoing'), EventBounds(Span(1440, 2879), Span(1440, 2879), null)),
        (EventBounds(Span(0, 43199), Span(0, 43199), null), EventBounds(Span(1440, 2879), Span(1440, 2879), null)),
        (EventBounds(Span(0, 100), Span(5000, 6000), null), EventBounds(Span(3000, 4000), Span(9000, 9999), null)),
        (EventBounds(Span(0, 100), Span(0, 100), null), EventBounds(Span(9000, 9999), Span(9000, 9999), null)),
      ])
        [_together[together(a, b)], _together[together(b, a)]],
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
