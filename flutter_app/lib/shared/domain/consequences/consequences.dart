import 'dart:math' as math;

import '../collation.dart';
import '../continuity/text.dart' show Paragraph, excerptAround, findWords, paragraphsOf;
import '../json.dart';
import '../manuscript/outline.dart' show isDocument;
import '../model/story_order.dart';
import '../plot/diagnostics.dart' show openStatuses;
import '../progression/snapshots.dart' show ProgressSnapshot, compareSnapshots, inStoryOrder;
import '../records/story_node.dart';
import '../records/system.dart' show SystemBlueprint;

/// WHAT DEPENDS ON THIS, as the original app's `src/modules/consequences`: before changing a chapter, an event or a
/// development of a plot thread, what is recorded that hangs on it and what later in the story may. A pure reading of
/// the novel as saved: it changes nothing, proposes no edit, and never rewrites text.

/// What the author is thinking of changing: a chapter or scene, an event, or a development of a plot thread.
sealed class Subject {
  const Subject();
}

class NodeSubject extends Subject {
  const NodeSubject(this.nodeId);
  final String nodeId;
}

class EventSubject extends Subject {
  const EventSubject(this.eventId);
  final String eventId;
}

class BeatSubject extends Subject {
  const BeatSubject(this.threadId, this.beatId);
  final String threadId;
  final String beatId;
}

/// Everything the analysis reads, as saved.
class World {
  World({
    required this.nodes,
    required this.docs,
    required this.plans,
    required this.entries,
    required this.relations,
    required this.threads,
    required this.events,
    required this.facts,
    required this.rules,
    required this.snapshots,
    required this.systems,
  });

  final List<StoryNode> nodes;
  final Map<String, Object?> docs;
  final List<JsonMap> plans;
  final List<JsonMap> entries;
  final List<JsonMap> relations;
  final List<JsonMap> threads;
  final List<JsonMap> events;
  final List<JsonMap> facts;
  final List<JsonMap> rules;
  final List<ProgressSnapshot> snapshots;
  final List<SystemBlueprint> systems;
}

enum ConsequenceKind {
  appearance('Later appearance'),
  thread('Plot thread'),
  relationship('Relationship'),
  characterState('Character state'),
  possession('Tracked rule'),
  canon('Canon'),
  chronology('Chronology'),
  introduction('First appearance');

  const ConsequenceKind(this.label);
  final String label;
}

/// SPECULATION CONTROL RULE. `established`: recorded and tied to this exact point; if it changes, that record hangs
/// on something no longer there. `potential`: later things involving the same people, places or threads; it may
/// depend on this point or not at all, and is worded as a possibility, never treated as fact.
enum Tier { established, potential }

/// Where a consequence can be looked at: `{type: node, nodeId, block?, term?}`, `{type: entry, entryId}`,
/// `{type: thread, threadId}`, `{type: relation, relationId}`, `{type: snapshot, snapshotId, entryId}`,
/// `{type: rule}`, `{type: fact, factId}` or `{type: event, eventId}`.
typedef Target = JsonMap;

class Consequence {
  const Consequence({
    required this.key,
    required this.tier,
    required this.kind,
    required this.message,
    required this.basis,
    required this.target,
    this.excerpt,
    this.match,
    this.nodeId,
    this.entryIds = const [],
    this.threadId,
    this.relationId,
    this.eventId,
    this.factId,
  });

  /// The same for the same finding, so ticks the author gives it hold.
  final String key;
  final Tier tier;
  final ConsequenceKind kind;
  final String message;
  final String basis;
  final Target target;
  final String? excerpt;
  final String? match;
  final String? nodeId;
  final List<String> entryIds;
  final String? threadId;
  final String? relationId;
  final String? eventId;
  final String? factId;
}

class Report {
  const Report({
    required this.title,
    required this.found,
    required this.anchorIds,
    required this.seeds,
    required this.suggested,
    required this.established,
    required this.potential,
    required this.summary,
    required this.summaryLine,
    required this.downstream,
  });

  /// The subject in words.
  final String title;

  /// False when the subject no longer exists.
  final bool found;

  /// The chapters and scenes the change is in.
  final List<String> anchorIds;

  /// The codex entries the change is taken to involve (after the author's additions and removals).
  final List<JsonMap> seeds;

  /// The ones worked out from the subject, before the author's choices.
  final List<JsonMap> suggested;
  final List<Consequence> established;
  final List<Consequence> potential;
  final List<({String label, int count})> summary;
  final String summaryLine;
  final int downstream;
}

String _plural(int n, String one, [String? many]) => '$n ${n == 1 ? one : (many ?? '${one}s')}';
String _list(List<String> names) =>
    names.length <= 2 ? names.join(' and ') : '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';

List<String> _ids(Object? v) => [for (final x in listOf(v)) ?strOrNull(x)];
String? _idOf(Object? v) => v is String && v.isNotEmpty ? v : null;

/// Works out what hangs on a point in the story. Reads what it is given and returns a report; changes nothing.
Report analyze(World world, Subject subject, {List<String> include = const [], List<String> exclude = const []}) {
  final nodes = world.nodes;
  final order = StoryOrder.of(nodes);
  int position(String? id) => order.position[id] ?? -1;
  final nodeById = {for (final n in nodes) n.id: n};
  final entryById = {for (final e in world.entries) str(e['id']): e};
  String? name(String? id) => id == null ? null : (entryById[id] == null ? null : str(entryById[id]!['name']));
  String? title(String? id) => id == null ? null : nodeById[id]?.title;
  final documents = [
    for (final n in nodes)
      if (isDocument(n.kind)) n,
  ];
  _stableSort(documents, (a, b) => position(a.id) - position(b.id));
  final text = <String, List<Paragraph>>{
    for (final d in documents)
      d.id: [
        for (final p in paragraphsOf(world.docs[d.id]))
          if (p.text.trim().isNotEmpty) p,
      ],
  };
  final planOf = {for (final p in world.plans) str(p['id']): p};
  List<String> subtree(String id) => subtreeIds(nodes, id);

  // ---- What the change is, and where it sits.
  var label = '';
  var found = true;
  var anchor = <String>[];
  final auto = <String>{};
  final event = switch (subject) {
    EventSubject(:final eventId) => world.events.where((e) => e['id'] == eventId).firstOrNull,
    _ => null,
  };
  final thread = switch (subject) {
    BeatSubject(:final threadId) => world.threads.where((t) => t['id'] == threadId).firstOrNull,
    _ => null,
  };
  final beat = switch (subject) {
    BeatSubject(:final beatId) => maps(thread?['beats']).where((b) => b['id'] == beatId).firstOrNull,
    _ => null,
  };

  switch (subject) {
    case NodeSubject(:final nodeId):
      final node = nodeById[nodeId];
      found = node != null;
      label = node?.title ?? 'A chapter that was removed';
      anchor = node == null
          ? []
          : [
              for (final id in subtree(node.id))
                if (isDocument(nodeById[id]?.kind)) id,
            ];
    case EventSubject():
      found = event != null;
      label = event != null ? 'the event “${str(event['name'])}”' : 'An event that was removed';
      anchor = [
        for (final id in _ids(event?['nodeIds']))
          if (nodeById.containsKey(id)) id,
      ];
      for (final id in [
        for (final c in maps(event?['characters'])) str(c['id']),
        ?_idOf(event?['locationId']),
        ..._ids(event?['entryIds']),
      ]) {
        if (id.isNotEmpty && entryById.containsKey(id)) auto.add(id);
      }
    case BeatSubject():
      found = thread != null && beat != null;
      label = beat != null
          ? '“${str(beat['title'])}” in the thread “${str(thread!['title'])}”'
          : 'A development that was removed';
      final at = _idOf(beat?['nodeId']);
      anchor = at != null && nodeById.containsKey(at) ? [at] : [];
      for (final id in [..._ids(thread?['characterIds']), ..._ids(thread?['locationIds'])]) {
        if (entryById.containsKey(id)) auto.add(id);
      }
  }
  final inAnchor = anchor.toSet();
  // Group nodes count too: a relationship stage can start at a volume.
  final anchorNodes = subject is NodeSubject && found ? subtree(subject.nodeId).toSet() : inAnchor;
  final from = anchor.isEmpty ? -1 : anchor.map(position).reduce(math.min);
  final downstream = [
    for (final d in documents)
      if (!inAnchor.contains(d.id) && (anchor.isEmpty ? subject is! NodeSubject : position(d.id) > from)) d,
  ];
  final downIds = {for (final d in downstream) d.id};
  bool isLater(String? nodeId) =>
      nodeId != null &&
      nodeId.isNotEmpty &&
      (downIds.contains(nodeId) || subtree(nodeId).any(downIds.contains)) &&
      !anchorNodes.contains(nodeId);

  /// Whether a chapter or scene names an entry: by a link, in its plan, or in its words.
  bool namedIn(String nodeId, JsonMap entry) {
    final id = str(entry['id']);
    final node = nodeById[nodeId];
    if (_ids(node?.raw['mentions']).contains(id) || _ids(planOf[nodeId]?['entityIds']).contains(id)) return true;
    return (text[nodeId] ?? const []).any(
      (p) => p.links.any((l) => l.entryId == id) || findWords(p.text, [str(entry['name'])]).isNotEmpty,
    );
  }

  if (subject is NodeSubject) {
    for (final id in anchor) {
      for (final entry in world.entries) {
        if (namedIn(id, entry)) auto.add(str(entry['id']));
      }
    }
  }

  final established = <Consequence>[];
  final potential = <Consequence>[];

  // ---- Established: records tied to this exact point. For a chapter, that is everything recorded at it; an event or
  // a single development is narrower: only what hangs on that one record.
  final recordedAt = subject is NodeSubject ? anchorNodes : <String>{};
  if (subject is! BeatSubject) {
    for (final t in world.threads) {
      final cast = [..._ids(t['characterIds']), ..._ids(t['locationIds'])];
      for (final b in maps(t['beats'])) {
        final at = _idOf(b['nodeId']);
        if (at == null || !recordedAt.contains(at)) continue;
        established.add(
          Consequence(
            key: 'beat:${str(b['id'])}',
            tier: Tier.established,
            kind: ConsequenceKind.thread,
            message:
                'The thread “${str(t['title'])}” has its development “${str(b['title'])}” recorded in ${title(at)}.',
            basis: 'A development placed in this chapter',
            target: {'type': 'thread', 'threadId': str(t['id'])},
            entryIds: cast,
            threadId: str(t['id']),
            nodeId: at,
          ),
        );
        for (final id in cast) {
          if (entryById.containsKey(id)) auto.add(id);
        }
      }
      final target = _idOf(t['targetNodeId']);
      if (target != null && recordedAt.contains(target)) {
        established.add(
          Consequence(
            key: 'target:${str(t['id'])}',
            tier: Tier.established,
            kind: ConsequenceKind.thread,
            message: 'The thread “${str(t['title'])}” is meant to resolve in ${title(target)}.',
            basis: 'The thread’s target resolution',
            target: {'type': 'thread', 'threadId': str(t['id'])},
            threadId: str(t['id']),
          ),
        );
      }
    }
  }
  if (thread != null && beat != null) {
    for (final b in maps(thread['beats'])) {
      if (b['id'] == beat['id'] || !isLater(_idOf(b['nodeId']))) continue;
      established.add(
        Consequence(
          key: 'beat:${str(b['id'])}',
          tier: Tier.established,
          kind: ConsequenceKind.thread,
          message:
              '“${str(b['title'])}” in ${title(_idOf(b['nodeId']))} is the thread’s next recorded step after this one.',
          basis: 'A later development of the same thread',
          target: {'type': 'thread', 'threadId': str(thread['id'])},
          threadId: str(thread['id']),
          nodeId: _idOf(b['nodeId']),
        ),
      );
    }
  }
  for (final relation in world.relations) {
    final fromId = str(relation['fromId']);
    final toId = str(relation['toId']);
    for (final stage in maps(relation['stages'])) {
      final at = _idOf(stage['startNodeId']);
      if (at == null || !recordedAt.contains(at)) continue;
      final pair = '${name(fromId) ?? 'Someone'} and ${name(toId) ?? 'someone'}';
      final event = str(stage['event']).trim();
      established.add(
        Consequence(
          key: 'stage:${str(stage['id'])}',
          tier: Tier.established,
          kind: ConsequenceKind.relationship,
          message:
              '$pair become “${str(stage['title']).trim().isNotEmpty ? str(stage['title']).trim() : str(stage['label'])}” '
              'starting in ${title(at)}${event.isNotEmpty ? ' ($event)' : ''}.',
          basis: 'A relationship stage that starts here',
          target: {'type': 'relation', 'relationId': str(relation['id'])},
          entryIds: [fromId, toId],
          relationId: str(relation['id']),
        ),
      );
      for (final id in [fromId, toId]) {
        if (entryById.containsKey(id)) auto.add(id);
      }
    }
  }
  for (final entry in world.entries) {
    final id = str(entry['id']);
    final mine = inStoryOrder(world.snapshots, nodes, id);
    for (final (i, snapshot) in mine.indexed) {
      final at = snapshot.nodeId;
      if (at == null || !recordedAt.contains(at)) continue;
      final previous = i > 0 ? mine[i - 1] : null;
      final diff = previous == null ? null : compareSnapshots(previous, snapshot, world.systems);
      final gains = diff == null
          ? const <String>[]
          : [
              for (final x in diff.advancement) '${x.name} ${x.from} → ${x.to}',
              for (final x in diff.gained) 'gains ${x.name}',
              for (final g in diff.gear)
                if (g.change == 'gained') 'receives ${g.name}',
              for (final g in diff.gear)
                if (g.change == 'lost') 'loses ${g.name}',
              for (final s in diff.status)
                for (final line in s.added) 'now “$line”',
            ];
      established.add(
        Consequence(
          key: 'snapshot:${snapshot.id}',
          tier: Tier.established,
          kind: ConsequenceKind.characterState,
          message:
              '${str(entry['name'])}’s state${snapshot.label.isNotEmpty ? ' “${snapshot.label}”' : ''} is logged at '
              '${title(at)}${gains.isNotEmpty ? ': ${gains.take(6).join('; ')}${gains.length > 6 ? '; and more' : ''}.' : '.'}',
          basis: 'A progression snapshot logged here',
          target: {'type': 'snapshot', 'snapshotId': snapshot.id, 'entryId': id},
          entryIds: [
            id,
            for (final g in snapshot.gear)
              if (g.entryId != null && entryById.containsKey(g.entryId)) g.entryId!,
          ],
        ),
      );
      auto.add(id);
    }
  }
  for (final rule in world.rules) {
    final fromNode = _idOf(rule['fromNodeId']);
    final untilNode = _idOf(rule['untilNodeId']);
    final starts = fromNode != null && recordedAt.contains(fromNode);
    final ends = untilNode != null && recordedAt.contains(untilNode);
    if (!starts && !ends) continue;
    final who = name(_idOf(rule['entryId'])) ?? 'Something';
    final state = rule['state'] as String?;
    final what = rule['kind'] == 'status'
        ? (state == 'deceased' ? 'deceased' : (str(rule['label']).isNotEmpty ? str(rule['label']) : 'changed'))
        : (state == 'held' ? 'held by ${name(_idOf(rule['holderId'])) ?? 'someone'}' : (state ?? 'changed'));
    established.add(
      Consequence(
        key: 'rule:${str(rule['id'])}:${starts ? 'from' : 'until'}',
        tier: Tier.established,
        kind: ConsequenceKind.possession,
        message: starts
            ? '$who is tracked as $what from ${title(fromNode)}.'
            : '$who stops being $what from ${title(untilNode)}.',
        basis: 'A tracked continuity rule',
        target: {'type': 'rule'},
        entryIds: [?_idOf(rule['entryId']), ?_idOf(rule['holderId'])],
      ),
    );
    final entryId = _idOf(rule['entryId']);
    if (entryId != null && entryById.containsKey(entryId)) auto.add(entryId);
  }
  for (final fact in world.facts) {
    final sources = maps(fact['sources']);
    final here = [
      for (final s in sources)
        if (s['type'] == 'chapter' && _idOf(s['refId']) != null && recordedAt.contains(s['refId'])) s,
    ];
    if (here.isEmpty) continue;
    final others = sources.length - here.length;
    established.add(
      Consequence(
        key: 'fact:${str(fact['id'])}',
        tier: Tier.established,
        kind: ConsequenceKind.canon,
        message:
            'The ${fact['status'] == 'canon' ? 'canon ' : ''}fact “${str(fact['subject'])}: ${str(fact['statement'])}” cites '
            '${title(_idOf(here.first['refId']))} as ${others > 0 ? 'one of its sources' : 'its only source'}.',
        basis: 'A canon fact’s source',
        target: {'type': 'fact', 'factId': str(fact['id'])},
        entryIds: _ids(fact['entryIds']),
        factId: str(fact['id']),
      ),
    );
  }
  for (final e in world.events) {
    if (event != null && e['id'] == event['id']) continue;
    final told = _ids(e['nodeIds']);
    final characters = [for (final c in maps(e['characters'])) str(c['id'])];
    if (told.any(recordedAt.contains)) {
      established.add(
        Consequence(
          key: 'told:${str(e['id'])}',
          tier: Tier.established,
          kind: ConsequenceKind.chronology,
          message: 'The event “${str(e['name'])}” is told in ${title(told.firstWhere(recordedAt.contains))}.',
          basis: 'A timeline event linked to this chapter',
          target: {'type': 'event', 'eventId': str(e['id'])},
          entryIds: characters,
          eventId: str(e['id']),
        ),
      );
    }
    final when = mapOrNull(e['when']) ?? const {};
    if (event != null &&
        (e['afterId'] == event['id'] || (when['precision'] == 'relative' && when['anchorId'] == event['id']))) {
      established.add(
        Consequence(
          key: 'follows:${str(e['id'])}',
          tier: Tier.established,
          kind: ConsequenceKind.chronology,
          message:
              'The event “${str(e['name'])}” is ${e['afterId'] == event['id'] ? 'set to come after' : 'dated relative to'} this one.',
          basis: 'A chronological dependency',
          target: {'type': 'event', 'eventId': str(e['id'])},
          entryIds: characters,
          eventId: str(e['id']),
        ),
      );
    }
  }
  if (event != null) {
    for (final id in anchor) {
      established.add(
        Consequence(
          key: 'telling:$id',
          tier: Tier.established,
          kind: ConsequenceKind.chronology,
          message: '${title(id)} is where this event is told.',
          basis: 'A chapter linked to this event',
          target: {'type': 'node', 'nodeId': id},
          nodeId: id,
        ),
      );
    }
  }

  // ---- Who the change involves: worked out, then adjusted by the author.
  int byName(JsonMap a, JsonMap b) => localeCompare(str(a['name']), str(b['name']));
  final suggested = [for (final id in auto) ?entryById[id]];
  _stableSort(suggested, byName);
  final chosen = {
    for (final id in auto)
      if (!exclude.contains(id)) id,
    for (final id in include)
      if (entryById.containsKey(id)) id,
  };
  final seeds = [for (final id in chosen) ?entryById[id]];
  _stableSort(seeds, byName);
  List<JsonMap> involves(List<String?> ids) => [
    for (final s in seeds)
      if (ids.contains(str(s['id']))) s,
  ];

  // An entry met for the first time here is a recorded fact about the manuscript, not a guess.
  if (subject is NodeSubject) {
    for (final entry in seeds) {
      final firstSeen = documents.where((d) => namedIn(d.id, entry)).firstOrNull;
      final laterCount = downstream.where((d) => namedIn(d.id, entry)).length;
      if (firstSeen != null && inAnchor.contains(firstSeen.id) && laterCount > 0) {
        established.add(
          Consequence(
            key: 'intro:${str(entry['id'])}',
            tier: Tier.established,
            kind: ConsequenceKind.introduction,
            message:
                '${str(entry['name'])} first appears in ${firstSeen.title}, and is named in '
                '${_plural(laterCount, 'later chapter or scene', 'later chapters and scenes')}.',
            basis: 'The first place this entry is named',
            target: {'type': 'entry', 'entryId': str(entry['id'])},
            entryIds: [str(entry['id'])],
          ),
        );
      }
    }
  }

  // ---- Potential: later things that involve the same people, places and threads.
  for (final doc in downstream) {
    final named = [
      for (final s in seeds)
        if (namedIn(doc.id, s)) s,
    ];
    if (named.isEmpty) continue;
    // Point at the first passage that names one of them, so the link lands on the line.
    ({int block, String term, String excerpt})? where;
    for (final paragraph in text[doc.id] ?? const <Paragraph>[]) {
      final terms = [
        for (final s in named) ...[
          str(s['name']),
          for (final l in paragraph.links)
            if (l.entryId == s['id']) l.text,
        ],
      ];
      final hit = findWords(paragraph.text, terms).firstOrNull;
      if (hit != null) {
        where = (block: paragraph.index, term: hit.text, excerpt: excerptAround(paragraph.text, hit.index, 180));
        break;
      }
    }
    potential.add(
      Consequence(
        key: 'appearance:${doc.id}',
        tier: Tier.potential,
        kind: ConsequenceKind.appearance,
        message:
            '${doc.title} involves ${_list([for (final s in named) str(s['name'])])} and may need to account for the change.',
        basis: where != null ? 'Named in the text after this point' : 'Listed in this chapter’s plan',
        target: {'type': 'node', 'nodeId': doc.id, 'block': ?where?.block, 'term': ?where?.term},
        excerpt: where?.excerpt,
        match: where?.term,
        nodeId: doc.id,
        entryIds: [for (final s in named) str(s['id'])],
      ),
    );
  }
  final touched = {for (final c in established) ?c.threadId};
  for (final t in world.threads) {
    if (thread != null && t['id'] == thread['id']) continue;
    final later = [
      for (final b in maps(t['beats']))
        if (isLater(_idOf(b['nodeId']))) b,
    ];
    final cast = involves([..._ids(t['characterIds']), ..._ids(t['locationIds'])]);
    final laterTitles = [for (final b in later.take(3)) title(_idOf(b['nodeId']))!];
    if (touched.contains(t['id']) && later.isNotEmpty) {
      potential.add(
        Consequence(
          key: 'thread-later:${str(t['id'])}',
          tier: Tier.potential,
          kind: ConsequenceKind.thread,
          message:
              'The thread “${str(t['title'])}” continues in ${_list(laterTitles)}${later.length > 3 ? ' and beyond' : ''}; '
              '${later.length == 1 ? 'that development' : 'those developments'} may lack what set '
              '${later.length == 1 ? 'it' : 'them'} in motion.',
          basis: 'Later developments of a thread that develops here',
          target: {'type': 'thread', 'threadId': str(t['id'])},
          entryIds: [for (final s in cast) str(s['id'])],
          threadId: str(t['id']),
        ),
      );
    } else if (!touched.contains(t['id']) &&
        cast.isNotEmpty &&
        openStatuses.contains(str(t['status'])) &&
        (later.isNotEmpty || maps(t['beats']).isEmpty)) {
      potential.add(
        Consequence(
          key: 'thread-open:${str(t['id'])}',
          tier: Tier.potential,
          kind: ConsequenceKind.thread,
          message:
              'The open thread “${str(t['title'])}” involves ${_list([for (final s in cast) str(s['name'])])}'
              '${later.isNotEmpty ? ' and develops in ${_list(laterTitles)}' : ''}; it could be affected.',
          basis: 'An open thread with the same people or places',
          target: {'type': 'thread', 'threadId': str(t['id'])},
          entryIds: [for (final s in cast) str(s['id'])],
          threadId: str(t['id']),
        ),
      );
    }
  }
  for (final relation in world.relations) {
    final fromId = str(relation['fromId']);
    final toId = str(relation['toId']);
    if (involves([fromId, toId]).isEmpty) continue;
    for (final stage in maps(relation['stages'])) {
      final at = _idOf(stage['startNodeId']);
      if (!isLater(at)) continue;
      potential.add(
        Consequence(
          key: 'stage-later:${str(stage['id'])}',
          tier: Tier.potential,
          kind: ConsequenceKind.relationship,
          message:
              '${name(fromId) ?? 'Someone'} and ${name(toId) ?? 'someone'} become '
              '“${str(stage['title']).trim().isNotEmpty ? str(stage['title']).trim() : str(stage['label'])}” in ${title(at)}; '
              'that turn may rest on what happens here.',
          basis: 'A later stage of a relationship involving them',
          target: {'type': 'relation', 'relationId': str(relation['id'])},
          entryIds: [fromId, toId],
          relationId: str(relation['id']),
        ),
      );
    }
  }
  for (final entry in seeds) {
    final id = str(entry['id']);
    final later = [
      for (final s in inStoryOrder(world.snapshots, nodes, id))
        if (isLater(s.nodeId)) s,
    ];
    if (later.isEmpty) continue;
    potential.add(
      Consequence(
        key: 'snapshots-later:$id',
        tier: Tier.potential,
        kind: ConsequenceKind.characterState,
        message:
            '${str(entry['name'])} has ${_plural(later.length, 'later snapshot')} '
            '(${_list([for (final s in later.take(3)) title(s.nodeId)!])}${later.length > 3 ? ', …' : ''}) that carry forward '
            'from this point and may need revisiting.',
        basis: 'Later progression snapshots of the same character',
        target: {'type': 'snapshot', 'snapshotId': later.first.id, 'entryId': id},
        entryIds: [id],
      ),
    );
  }
  for (final rule in world.rules) {
    final about = involves([_idOf(rule['entryId']), _idOf(rule['holderId']), _idOf(rule['toEntryId'])]);
    final at = _idOf(rule['fromNodeId']);
    if (about.isEmpty || !isLater(at)) continue;
    potential.add(
      Consequence(
        key: 'rule-later:${str(rule['id'])}',
        tier: Tier.potential,
        kind: ConsequenceKind.possession,
        message:
            'A tracked rule about ${_list([for (final s in about) str(s['name'])])} takes effect in ${title(at)}; '
            'it may assume what happens here.',
        basis: 'A later continuity rule about them',
        target: {'type': 'rule'},
        entryIds: [for (final s in about) str(s['id'])],
      ),
    );
  }
  final cited = {for (final c in established) ?c.factId};
  for (final fact in world.facts) {
    final about = involves(_ids(fact['entryIds']));
    final status = str(fact['status']);
    if (about.isEmpty || cited.contains(fact['id']) || (status != 'canon' && status != 'provisional')) continue;
    potential.add(
      Consequence(
        key: 'fact-about:${str(fact['id'])}',
        tier: Tier.potential,
        kind: ConsequenceKind.canon,
        message:
            'The $status fact “${str(fact['subject'])}: ${str(fact['statement'])}” is about '
            '${_list([for (final s in about) str(s['name'])])}; check that it still holds.',
        basis: 'A fact about the same entry',
        target: {'type': 'fact', 'factId': str(fact['id'])},
        entryIds: [for (final s in about) str(s['id'])],
        factId: str(fact['id']),
      ),
    );
  }
  final tied = {for (final c in established) ?c.eventId};
  for (final e in world.events) {
    if ((event != null && e['id'] == event['id']) || tied.contains(e['id'])) continue;
    final about = involves([
      for (final c in maps(e['characters'])) str(c['id']),
      _idOf(e['locationId']),
      ..._ids(e['entryIds']),
    ]);
    final told = _ids(e['nodeIds']);
    if (about.isEmpty || !told.any(isLater)) continue;
    potential.add(
      Consequence(
        key: 'event-later:${str(e['id'])}',
        tier: Tier.potential,
        kind: ConsequenceKind.chronology,
        message:
            'The event “${str(e['name'])}”, told in ${title(told.firstWhere(isLater))}, involves '
            '${_list([for (final s in about) str(s['name'])])} and might play out differently.',
        basis: 'A later-told event with the same people or places',
        target: {'type': 'event', 'eventId': str(e['id'])},
        entryIds: [for (final s in about) str(s['id'])],
        eventId: str(e['id']),
      ),
    );
  }

  // The same novel always gives the same report in the same order: by kind, then by where in the book, then wording.
  const kindOrder = [
    ConsequenceKind.appearance,
    ConsequenceKind.thread,
    ConsequenceKind.relationship,
    ConsequenceKind.characterState,
    ConsequenceKind.possession,
    ConsequenceKind.canon,
    ConsequenceKind.chronology,
    ConsequenceKind.introduction,
  ];
  const far = 9007199254740991;
  int byOrder(Consequence a, Consequence b) {
    final k = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (k != 0) return k;
    final p = (a.nodeId != null ? position(a.nodeId) : far).compareTo(b.nodeId != null ? position(b.nodeId) : far);
    return p != 0 ? p : localeCompare(a.message, b.message);
  }

  _stableSort(established, byOrder);
  _stableSort(potential, byOrder);

  // ---- The size of it.
  final all = [...established, ...potential];
  final affected = {
    for (final s in seeds) str(s['id']),
    for (final c in all) ...c.entryIds,
  }.where(entryById.containsKey).toSet();
  int inCategory(bool Function(String category) test) =>
      affected.where((id) => test(str(entryById[id]!['category']))).length;
  int distinct(String? Function(Consequence c) pick) => {for (final c in all) ?pick(c)}.length;
  final summary = [
    (label: 'Characters', count: inCategory((c) => c == 'character')),
    (label: 'Locations', count: inCategory((c) => c == 'location')),
    (label: 'Lore Entries', count: inCategory((c) => c != 'character' && c != 'location')),
    (label: 'Plot Threads', count: distinct((c) => c.threadId)),
    (
      label: 'Chapters',
      count: {
        for (final c in all)
          if (c.nodeId != null && !inAnchor.contains(c.nodeId)) c.nodeId,
      }.length,
    ),
    (label: 'Relationships', count: distinct((c) => c.relationId)),
    (label: 'Events', count: distinct((c) => c.eventId)),
    (label: 'Canon Facts', count: distinct((c) => c.factId)),
  ].where((p) => p.count > 0).toList();
  const one = {
    'Characters': 'Character',
    'Locations': 'Location',
    'Lore Entries': 'Lore Entry',
    'Plot Threads': 'Plot Thread',
    'Chapters': 'Chapter',
    'Relationships': 'Relationship',
    'Events': 'Event',
    'Canon Facts': 'Canon Fact',
  };
  return Report(
    title: label,
    found: found,
    anchorIds: anchor,
    seeds: seeds,
    suggested: suggested,
    established: established,
    potential: potential,
    summary: summary,
    summaryLine: summary.isNotEmpty
        ? summary.map((p) => '${p.count} ${p.count == 1 ? one[p.label] : p.label}').join(', ')
        : 'Nothing recorded depends on this',
    downstream: downstream.length,
  );
}

/// JavaScript's sort is stable; ties keep their order here too.
void _stableSort<T>(List<T> list, int Function(T a, T b) compare) {
  final indexed = [for (final (i, v) in list.indexed) (i, v)];
  indexed.sort((a, b) {
    final c = compare(a.$2, b.$2);
    return c != 0 ? c : a.$1.compareTo(b.$1);
  });
  for (final (i, e) in indexed.indexed) {
    list[i] = e.$2;
  }
}
