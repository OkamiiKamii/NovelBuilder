import 'dart:math' as math;

import '../collation.dart';
import '../continuity/rules.dart';
import '../factions/ties.dart' show whenHeld;
import '../integrity/rules.dart' show connectionStatusLabel;
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/story_order.dart' show subtreeIds;
import '../model/validity.dart';
import '../progression/track.dart' show isUnknownTime, whenWords;
import '../records/canon.dart';
import '../records/event.dart';
import '../records/link.dart';
import '../stable_sort.dart';
import '../timeline/dates.dart' show formatDate;
import '../timeline/narrative.dart' show nodeLabel;
import 'facts.dart';

/// CHECKING THE STRUCTURED RECORDS (as in the original app)
/// Deterministic checks of what the author has recorded (events, connections, relationships, appearance records,
/// tracked continuity, canon statements, progression changes and journeys) against one another. Each finding comes
/// from one stated rule, says what records it rests on, and is raised only when the records hold what the rule needs;
/// the same records give the same findings, with the same keys, every time. Nothing here changes a record, a canon
/// status or the manuscript: the text is not even read.

enum RecordRule {
  restsOn(
    'rests-on',
    Severity.warning,
    'Rests on a set-aside event',
    'What is part of the story as it stands (Canon, Provisional or Conflicting) cannot rest on an event marked Retconned '
        'or Non-Canon: come after it, be dated from it, begin or end at it, or cite it as where it was established.',
    'An event with one of those statuses, and a record in play that points at it.',
  ),
  stillTold(
    'still-told',
    Severity.info,
    'Set aside, but still told',
    'An event marked Retconned or Non-Canon is not part of the story as it stands, so no chapter or scene is recorded '
        'as telling it.',
    'An event with one of those statuses that still lists the chapters or scenes telling it. The text itself is not '
        'read.',
  ),
  opposed(
    'opposed',
    Severity.warning,
    'Allied and at war at once',
    'Two records cannot be allied with each other and at war with each other at the same time.',
    'An “Allied with” and an “At war with” connection between the same two records, both in play, whose times '
        'certainly overlap. A connection with no time given holds throughout, as far as the records say.',
  ),
  afterDeath(
    'after-death',
    Severity.critical,
    'Appears after their recorded death',
    'A character tracked as deceased from a chapter on does not appear in a later chapter or scene, take part in an '
        'event told only there, or have a relationship change there, until the tracked status says they return.',
    'A “Deceased” status under Continuity → Tracked, with its chapter; and an appearance record, an event’s chapters '
        'or a relationship stage in a later chapter.',
  ),
  endsFirst(
    'ends-first',
    Severity.warning,
    'Ends before it begins',
    'A connection cannot stop holding before it starts.',
    'A start and an end on the same scale: both chapters or scenes, or both dates or events that can be placed.',
  ),
  calendar(
    'calendar',
    Severity.warning,
    'Date not in the calendar',
    'A date must exist in the novel’s calendar: a month it has, a day that month has, an hour its days have.',
    'A date with a month, day or hour on a connection, a progression change or a journey. Events’ dates are checked '
        'by the timeline review.',
  ),
  gone(
    'gone',
    Severity.warning,
    'Timed by something that is gone',
    'When a connection, a progression change or a journey is timed by a chapter, scene or event, that record must '
        'exist.',
    'A time given by a chapter, scene or event that has since been deleted.',
  ),
  replacement(
    'replacement',
    Severity.info,
    'Retconned with nothing in its place',
    'A statement marked Retconned has been officially replaced, so it names the statement that replaced it, and that '
        'one is not itself set aside.',
    'A canon statement marked Retconned.',
  );

  const RecordRule(this.key, this.severity, this.title, this.rule, this.needs);
  final String key;
  final Severity severity;
  final String title;
  final String rule;
  final String needs;
}

class RecordFinding {
  RecordFinding(this.key, this.rule, this.message, this.because, this.on, this.refs);

  /// The same for the same finding on every run, built from the records' ids, so a decision about it holds.
  final String key;
  final RecordRule rule;
  Severity get severity => rule.severity;
  final String message;
  final String because;

  /// The records it is about, as views mark them: `event:<id>`, `entry:<id>`, `node:<id>`, `relation:<id>`,
  /// `link:<id>` for a stored connection, `fact:<id>` for a canon statement.
  final List<String> on;

  /// Records to open to resolve it.
  final List<EntityRef> refs;
}

List<RecordFinding> checkRecords(
  StoryModel model, {
  required List<CanonFact> facts,
  required List<ContinuityRule> rules,
  Set<String>? known,
}) {
  final findings = <RecordFinding>[];
  void add(RecordRule rule, List<String> ids, String message, String because, List<String> on, List<EntityRef> refs) =>
      findings.add(RecordFinding(['records', rule.key, ...ids].join('|'), rule, message, because, on, refs));
  final context = model.timeContext;
  final events = model.events;
  final calendar = model.calendar;
  int? position(String id) => model.order.position[id];
  final nodes = [...model.nodes.values];
  String name(EntityRef ref) => model.resolve(ref)?.label ?? 'a record that is gone';
  bool found(EntityRef ref) => model.resolve(ref) != null;
  List<EntityRef> ends(Link l) => [l.from, l.to];
  String linkWords(Link l) =>
      '“${name(l.from)} ${(l.type != null ? connectionType(l.type).label : 'Related to').toLowerCase()} ${name(l.to)}”';
  String linkStatus(Link l) => connectionStatusLabel(l.canon ?? CanonStatus.canon);
  TimelineEvent? setAsideEvent(String? eventId) {
    final event = eventId == null ? null : events[eventId];
    return event != null && setAside.contains(event.canon ?? CanonStatus.canon) ? event : null;
  }

  String statusWords(CanonStatus? status) => (status ?? CanonStatus.canon).label;
  String travellers(List<String> ids) {
    final names = ids.map((id) => model.entries[id]?.name ?? 'someone deleted').join(', ');
    return names.isEmpty ? 'nobody named' : names;
  }

  String factWords(CanonFact fact) => quoted(fact.words);

  // Every time given by a chapter, scene, event or date, with what it times: connections, progression changes,
  // journeys.
  final timed = <({String what, String which, Anchor anchor, List<String> on, List<EntityRef> refs, String id})>[];
  for (final l in model.links) {
    for (final (which, anchor) in [('start', l.validity?.from), ('end', l.validity?.until)]) {
      if (anchor != null) {
        timed.add((
          what: 'The connection ${linkWords(l)}',
          which: which,
          anchor: anchor,
          on: ['link:${l.id}'],
          refs: ends(l).where(found).toList(),
          id: 'link:${l.id}:$which',
        ));
      }
    }
  }
  for (final c in model.progress) {
    final at = c.at;
    if (at != null && !isUnknownTime(at)) {
      timed.add((
        what: 'A progression change for ${model.entries[c.entryId]?.name ?? 'someone deleted'}',
        which: 'time',
        anchor: at,
        on: ['entry:${c.entryId}'],
        refs: [if (model.entries.containsKey(c.entryId)) EntityRef(EntityType.entry, c.entryId)],
        id: 'progress:${c.id}',
      ));
    }
  }
  for (final j in model.journeys) {
    for (final (which, anchor) in [('departure', j.departure), ('arrival', j.arrival)]) {
      if (anchor != null) {
        timed.add((
          what: 'The journey of ${travellers(j.travellerIds)}',
          which: which,
          anchor: anchor,
          on: [for (final id in j.travellerIds) 'entry:$id'],
          refs: [
            for (final id in j.travellerIds)
              if (model.entries.containsKey(id)) EntityRef(EntityType.entry, id),
          ],
          id: 'journey:${j.id}:$which',
        ));
      }
    }
  }

  // Rests on a set-aside event.
  final linkById = {for (final l in model.links) 'link:${l.id}': l};
  for (final e in stableSorted(events.values, (a, b) => localeCompare(a.id, b.id))) {
    if (setAside.contains(e.canon ?? CanonStatus.canon)) continue;
    final after = setAsideEvent(e.afterId);
    if (after != null) {
      add(
        RecordRule.restsOn,
        [e.id, 'after', after.id],
        '“${e.name}” is set to come after “${after.name}”, which is marked ${statusWords(after.canon)}.',
        '“${e.name}” is ${statusWords(e.canon)}, and its “Comes after” is “${after.name}”, whose canon status is '
            '${statusWords(after.canon)}.',
        ['event:${e.id}', 'event:${after.id}'],
        [EntityRef(EntityType.event, e.id), EntityRef(EntityType.event, after.id)],
      );
    }
    for (final (which, date) in [('start', e.when), ('end', e.end)]) {
      final from = date is RelativeDate ? setAsideEvent(date.anchorId) : null;
      if (from != null) {
        add(
          RecordRule.restsOn,
          [e.id, which, from.id],
          '“${e.name}” is dated from “${from.name}”, which is marked ${statusWords(from.canon)}.',
          'Its ${which == 'start' ? 'date' : 'end date'} reads “${formatDate(date, (id) => events[id]?.name, calendar)}”; '
              '“${from.name}” has the canon status ${statusWords(from.canon)}.',
          ['event:${e.id}', 'event:${from.id}'],
          [EntityRef(EntityType.event, e.id), EntityRef(EntityType.event, from.id)],
        );
      }
    }
  }
  for (final t in timed) {
    final anchor = t.anchor;
    if (anchor is! EventAnchor) continue;
    final at = setAsideEvent(anchor.eventId);
    final link = t.id.startsWith('link:') ? linkById[t.on.first] : null;
    if (at == null || (link != null && setAside.contains(link.canon ?? CanonStatus.canon))) continue;
    add(
      RecordRule.restsOn,
      [t.id, at.id],
      '${t.what} has its ${t.which} at “${at.name}”, which is marked ${statusWords(at.canon)}.',
      '${link != null ? 'The connection is ${linkStatus(link)}; ' : ''}“${at.name}” has the canon status '
          '${statusWords(at.canon)}.',
      [...t.on, 'event:${at.id}'],
      [...t.refs, EntityRef(EntityType.event, at.id)],
    );
  }
  for (final fact in facts) {
    if (!inPlay.contains(fact.status)) continue;
    for (final source in fact.factSources) {
      final at = source.type == 'event' ? setAsideEvent(source.refId) : null;
      if (at == null) continue;
      add(
        RecordRule.restsOn,
        ['fact:${fact.id}', source.id],
        'The ${fact.status.label.toLowerCase()} statement ${factWords(fact)} is established at “${at.name}”, which is '
            'marked ${statusWords(at.canon)}.',
        'One of its sources is the timeline event “${at.name}”, whose canon status is ${statusWords(at.canon)}.',
        ['fact:${fact.id}', 'event:${at.id}', for (final id in fact.entryIds) 'entry:$id'],
        [EntityRef(EntityType.event, at.id)],
      );
    }
  }

  // Set aside, but still told.
  for (final e in events.values) {
    if (!setAside.contains(e.canon ?? CanonStatus.canon)) continue;
    final told = [
      for (final id in e.nodeIds)
        if (model.nodes.containsKey(id)) id,
    ];
    if (told.isEmpty) continue;
    add(
      RecordRule.stillTold,
      [e.id],
      '“${e.name}” is marked ${statusWords(e.canon)}, but is still recorded as told in '
          '${told.map((id) => nodeLabel(model, id)).join(', ')}.',
      'Its canon status is ${statusWords(e.canon)}, and its chapters and scenes list '
          '${told.length == 1 ? 'one' : told.length}.',
      ['event:${e.id}', for (final id in told) 'node:$id'],
      [EntityRef(EntityType.event, e.id), for (final id in told) EntityRef(EntityType.node, id)],
    );
  }

  // Allied and at war at once.
  String pairOf(Link l) => ([for (final r in ends(l)) '${r.type.name}:${r.id}']..sort()).join('~');
  bool linkInPlay(Link l) => !setAside.contains(l.canon ?? CanonStatus.canon);
  final allied = [
    for (final l in model.links)
      if (connectionType(l.type).key == 'allied-with' && linkInPlay(l)) l,
  ];
  final atWar = [
    for (final l in model.links)
      if (connectionType(l.type).key == 'at-war-with' && linkInPlay(l)) l,
  ];
  for (final a in allied) {
    for (final w in atWar) {
      if (pairOf(a) != pairOf(w) ||
          overlaps(a.validity ?? Validity.always, w.validity ?? Validity.always, context) != Truth.yes) {
        continue;
      }
      final [x, y] = ends(a);
      add(
        RecordRule.opposed,
        [a.id, w.id],
        '${name(x)} and ${name(y)} are recorded as allied and at war at the same time.',
        '“Allied with”: ${whenHeld(a, model)} (${linkStatus(a)}). “At war with”: ${whenHeld(w, model)} '
            '(${linkStatus(w)}).',
        ['link:${a.id}', 'link:${w.id}', '${x.type.name}:${x.id}', '${y.type.name}:${y.id}'],
        [x, y].where(found).toList(),
      );
    }
  }

  // Appears after their recorded death.
  for (final rule in rules) {
    final entryId = rule.entryId;
    if (rule.kind != 'status' || rule.state != 'deceased' || entryId == null) continue;
    final who = model.entries[entryId];
    if (who == null) continue;
    // As the continuity check reads it: from after the last scene of its chapter, until the chapter it ends at.
    final fromNode = rule.fromNodeId;
    final untilNode = rule.untilNodeId;
    final startsAfter = fromNode != null && model.nodes.containsKey(fromNode)
        ? subtreeIds(nodes, fromNode).map((id) => position(id) ?? -1).reduce(math.max)
        : -1;
    final endsAt = untilNode != null && model.nodes.containsKey(untilNode)
        ? (position(untilNode)?.toDouble() ?? double.infinity)
        : double.infinity;
    final since = fromNode != null && model.nodes.containsKey(fromNode)
        ? 'from ${nodeLabel(model, fromNode)}'
        : 'from the start of the story';
    bool after(String? nodeId) {
      final at = nodeId == null ? null : position(nodeId);
      return at != null && at > startsAfter && at < endsAt;
    }

    final label = rule.label.trim();
    final status =
        'Continuity → Tracked: ${who.name} is ${label.isNotEmpty ? '“$label” (Deceased)' : 'Deceased'} $since'
        '${untilNode != null && model.nodes.containsKey(untilNode) ? ' until ${nodeLabel(model, untilNode)}' : ''}.';
    final baseOn = ['entry:${who.id}'];
    final baseRefs = [EntityRef(EntityType.entry, who.id)];
    for (final plan in stableSorted(
      model.plans.values,
      (a, b) => (position(a.id) ?? 0).compareTo(position(b.id) ?? 0),
    )) {
      if (!plan.appearIds.contains(who.id) || !after(plan.id)) continue;
      add(
        RecordRule.afterDeath,
        [rule.id, 'appears', plan.id],
        '${who.name} appears in ${nodeLabel(model, plan.id)}, after their recorded death.',
        '$status The appearance record of ${nodeLabel(model, plan.id)} lists them as on the page.',
        [...baseOn, 'node:${plan.id}'],
        [...baseRefs, EntityRef(EntityType.node, plan.id)],
      );
    }
    for (final e in events.values) {
      final told = [
        for (final id in e.nodeIds)
          if (position(id) != null) id,
      ];
      if (!e.characters.any((c) => c.id == who.id) || told.isEmpty || !told.every(after)) continue;
      add(
        RecordRule.afterDeath,
        [rule.id, 'event', e.id],
        '${who.name} takes part in “${e.name}”, told only after their recorded death.',
        '$status “${e.name}” lists them as taking part, and is told in '
            '${told.map((id) => nodeLabel(model, id)).join(', ')}.',
        [...baseOn, 'event:${e.id}'],
        [...baseRefs, EntityRef(EntityType.event, e.id)],
      );
    }
    for (final r in model.relations.values) {
      if (r.fromId != who.id && r.toId != who.id) continue;
      final other = model.entries[r.fromId == who.id ? r.toId : r.fromId]?.name ?? 'someone deleted';
      for (final stage in r.stages) {
        if (!after(stage.startNodeId)) continue;
        add(
          RecordRule.afterDeath,
          [rule.id, 'relation', r.id, stage.id],
          '${who.name}’s relationship with $other changes to “${stage.label.isNotEmpty ? stage.label : 'a new stage'}” '
              'in ${nodeLabel(model, stage.startNodeId!)}, after their recorded death.',
          '$status That stage of the relationship starts at ${nodeLabel(model, stage.startNodeId!)}.',
          [...baseOn, 'relation:${r.id}'],
          [...baseRefs, EntityRef(EntityType.relation, r.id)],
        );
      }
    }
  }

  // Ends before it begins.
  ({String axis, double lo, double hi})? place(Anchor anchor) {
    switch (anchor) {
      case NodeAnchor(:final nodeId):
        final at = position(nodeId);
        return at == null ? null : (axis: 'reading', lo: at.toDouble(), hi: at.toDouble());
      case EventAnchor(:final eventId):
        final span = spanOfEvent(eventId, context);
        return span == null ? null : (axis: 'story', lo: span.lo, hi: span.hi);
      case DateAnchor(when: final date):
        final span = spanOfDate(date, context);
        return span == null ? null : (axis: 'story', lo: span.lo, hi: span.hi);
    }
  }

  for (final l in model.links) {
    final v = l.validity;
    if (v?.from == null || v?.until == null) continue;
    final start = place(v!.from!);
    final end = place(v.until!);
    if (start == null || end == null || start.axis != end.axis) continue;
    final first = start.axis == 'reading' ? end.lo < start.lo : end.hi < start.lo;
    if (first) {
      add(
        RecordRule.endsFirst,
        [l.id],
        'The connection ${linkWords(l)} stops before it starts.',
        'It starts ${whenWords(v.from, model)} and stops ${whenWords(v.until, model)}, which comes earlier.',
        ['link:${l.id}'],
        ends(l).where(found).toList(),
      );
    }
  }

  // Dates not in the calendar, and times given by records that are gone.
  for (final t in timed) {
    switch (t.anchor) {
      case DateAnchor(when: final date):
        final problem = date == null ? null : calendar.dateProblem(date);
        if (problem != null) {
          add(
            RecordRule.calendar,
            [t.id],
            '${t.what}: its ${t.which} is not in ${calendar.standard ? 'the calendar' : calendar.name}.',
            problem,
            t.on,
            t.refs,
          );
        }
      case NodeAnchor(:final nodeId) when !model.nodes.containsKey(nodeId):
      case EventAnchor(:final eventId) when !events.containsKey(eventId) && !(known?.contains(eventId) ?? false):
        final kind = t.anchor is NodeAnchor ? 'chapter or scene' : 'timeline event';
        add(
          RecordRule.gone,
          [t.id],
          '${t.what} has its ${t.which} at a $kind that no longer exists.',
          'Its ${t.which} pointed at a $kind that has been deleted, so when it holds cannot be worked out.',
          t.on,
          t.refs,
        );
      default:
        break;
    }
  }

  // Retconned with nothing in its place.
  final factById = {for (final f in facts) f.id: f};
  for (final fact in facts) {
    if (fact.status != CanonStatus.retconned) continue;
    final replacedBy = fact.replacedById;
    final by = replacedBy == null ? null : factById[replacedBy];
    final why = replacedBy == null
        ? 'names no statement that replaced it'
        : by == null
        ? 'names a replacement that no longer exists'
        : setAside.contains(by.status)
        ? 'is replaced by ${factWords(by)}, which is itself marked ${by.status.label}'
        : null;
    if (why == null) continue;
    add(
      RecordRule.replacement,
      [fact.id],
      'The statement ${factWords(fact)} is marked Retconned, but $why.',
      'Retconned means it was true once and has been officially replaced. Its “Replaced by” is '
          '${replacedBy == null ? 'empty' : (by != null ? factWords(by) : 'a statement that was deleted')}.',
      ['fact:${fact.id}', for (final id in fact.entryIds) 'entry:$id'],
      [
        for (final id in fact.entryIds)
          if (model.entries.containsKey(id)) EntityRef(EntityType.entry, id),
      ],
    );
  }

  return stableSorted(findings, (a, b) {
    final c = a.rule.index.compareTo(b.rule.index);
    return c != 0 ? c : localeCompare(a.key, b.key);
  });
}
