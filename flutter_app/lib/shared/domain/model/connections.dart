import '../json.dart';
import '../records/category.dart';
import '../records/event.dart';
import '../records/link.dart';
import '../records/progress.dart';
import 'entity_ref.dart';
import 'story_model.dart';
import 'story_order.dart';
import 'validity.dart';

/// The ways records are connected, each read from one place where the author recorded it.
enum ConnectionKind {
  partOf('part-of', (EntityType.node, EntityType.node)),
  link('link', null),
  relationship('relationship', (EntityType.entry, EntityType.entry)),
  field('field', (EntityType.entry, EntityType.entry)),
  mentioned('mentioned', (EntityType.entry, EntityType.node)),
  present('present', (EntityType.entry, EntityType.node)),
  appearance('appearance', (EntityType.entry, EntityType.node)),
  participant('participant', (EntityType.entry, EntityType.event)),
  involved('involved', (EntityType.entry, EntityType.event)),
  occursAt('occurs-at', (EntityType.event, EntityType.entry)),
  toldIn('told-in', (EntityType.event, EntityType.node)),
  follows('follows', (EntityType.event, EntityType.event)),
  datedFrom('dated-from', (EntityType.event, EntityType.event)),
  inThread('in-thread', (EntityType.event, EntityType.thread)),
  threadEntry('thread-entry', (EntityType.thread, EntityType.entry)),
  beat('beat', (EntityType.thread, EntityType.node)),
  resolvesIn('resolves-in', (EntityType.thread, EntityType.node)),
  holds('holds', (EntityType.entry, EntityType.ability)),
  branchesFrom('branches-from', (EntityType.ability, EntityType.ability)),
  progress('progress', null),
  travel('travel', null);

  const ConnectionKind(this.key, this.endpoints);

  final String key;

  /// Which kinds of record it may join, as (from, to). Null: any two.
  final (EntityType, EntityType)? endpoints;

  static ConnectionKind? of(String key) => values.where((k) => k.key == key).firstOrNull;
}

/// Where a connection is stored: the record to open, or to change through its repository.
class ConnectionSource {
  const ConnectionSource(this.collection, this.id, {this.field});
  final String collection;
  final String id;

  /// For a field of an entry: the field's id on the entry.
  final String? field;

  JsonMap toJson() => {'table': collection, 'id': id, 'field': ?field};
}

/// One connection between two records. It holds their ids, never copies of them. from → to is the direction the
/// meaning reads in; [directed] says whether that matters ("Mentor → Student") or it reads the same both ways.
class Connection {
  Connection({
    required this.id,
    required this.kind,
    required this.from,
    required this.to,
    required this.label,
    required this.directed,
    required this.source,
    this.reverseLabel,
    this.type,
    this.notes,
    this.canon,
    this.validity,
    this.validityJson,
  });

  /// Stable while the connection exists: built from where it is stored, so a selection survives a reload.
  final String id;
  final ConnectionKind kind;
  final EntityRef from;
  final EntityRef to;

  /// How the from side describes it.
  final String label;

  /// How the to side describes it, when that differs. Never invented: null when the author gave none.
  final String? reverseLabel;
  final bool directed;
  final ConnectionSource source;

  /// For a stored link: its own kind, notes, canon status and when it holds.
  final String? type;
  final String? notes;
  final String? canon;
  final Validity? validity;
  final JsonMap? validityJson;

  JsonMap toJson() => {
    'id': id,
    'kind': kind.key,
    'from': from.toJson(),
    'to': to.toJson(),
    'label': label,
    'reverseLabel': ?reverseLabel,
    'directed': directed,
    'source': source.toJson(),
    'type': ?type,
    'notes': ?notes,
    'canon': ?canon,
    'validity': ?validityJson,
  };
}

/// A connection one of whose ends no longer exists. Reported, never silently dropped.
class DanglingConnection {
  DanglingConnection(this.connection, this.missing);
  final Connection connection;
  final List<EntityRef> missing;
}

/// What a progression change says, in words: "Level set to 4", "Gained Fire Lance".
String changeWords(ProgressChange change, ProgressCategory? category, StoryModel model) {
  final subject = change.subject.trim();
  final refName = change.refId == null ? '' : (model.entries[change.refId]?.name ?? '');
  final abilityName = change.abilityId == null ? '' : (model.abilities[change.abilityId]?.item.name ?? '');
  final thing = [
    subject,
    refName,
    abilityName,
    category?.name ?? '',
  ].firstWhere((s) => s.isNotEmpty, orElse: () => 'Something');
  final value = change.value.isEmpty ? '—' : change.value;
  return switch (change.action) {
    'set' => category?.shape == 'named' ? '$thing set to $value' : '${category?.name ?? 'Value'} set to $value',
    'gain' => 'Gained $thing',
    'lose' => 'Lost $thing',
    _ => thing,
  };
}

/// Every connection in the novel, read from where each was made, at full detail. Connections whose end no longer
/// exists come back in `dangling` with what is missing, so a view can say so instead of quietly showing less.
({List<Connection> connections, List<DanglingConnection> dangling}) deriveConnections(StoryModel model) {
  final all = <String, Connection>{};
  EntityRef ref(EntityType type, String id) => EntityRef(type, id);
  void add(
    String id,
    ConnectionKind kind,
    EntityRef from,
    EntityRef to,
    String label,
    ConnectionSource source, {
    bool directed = true,
    String? reverseLabel,
  }) {
    if (from.id.isEmpty || to.id.isEmpty || all.containsKey(id)) return;
    all[id] = Connection(
      id: id,
      kind: kind,
      from: from,
      to: to,
      label: label,
      reverseLabel: reverseLabel == null || reverseLabel.isEmpty ? null : reverseLabel,
      directed: directed,
      source: source,
    );
  }

  for (final node in model.nodes.values) {
    final source = ConnectionSource('chapters', node.id);
    if (node.parentId != null) {
      add(
        'part-of:${node.id}',
        ConnectionKind.partOf,
        ref(EntityType.node, node.id),
        ref(EntityType.node, node.parentId!),
        'Part of',
        source,
      );
    }
    for (final entryId in node.mentions) {
      add(
        'mentioned:${node.id}:$entryId',
        ConnectionKind.mentioned,
        ref(EntityType.entry, entryId),
        ref(EntityType.node, node.id),
        'Mentioned in',
        source,
      );
    }
  }
  for (final plan in model.plans.values) {
    final source = ConnectionSource('chapterPlans', plan.id);
    final here = ref(EntityType.node, plan.id);
    for (final e in plan.entityIds) {
      add('present:${plan.id}:$e', ConnectionKind.present, ref(EntityType.entry, e), here, 'Present in', source);
    }
    for (final e in plan.appearIds) {
      add('appearance:${plan.id}:$e', ConnectionKind.appearance, ref(EntityType.entry, e), here, 'Appears in', source);
    }
    for (final e in plan.povIds) {
      add('pov:${plan.id}:$e', ConnectionKind.appearance, ref(EntityType.entry, e), here, 'Point of view in', source);
    }
    for (final e in plan.mentionIds) {
      add(
        'appearance:${plan.id}:$e',
        ConnectionKind.appearance,
        ref(EntityType.entry, e),
        here,
        'Mentioned in, not on the page',
        source,
      );
    }
  }

  // One row serves both directions, each side with its own wording: the author's, or the kind's converse.
  for (final link in model.links) {
    final w = wordingOf(link);
    final validityJson = mapOrNull(link.raw['validity']);
    all['link:${link.id}'] = Connection(
      id: 'link:${link.id}',
      kind: ConnectionKind.link,
      from: link.from,
      to: link.to,
      label: w.forward.isNotEmpty ? w.forward : (link.type != null ? '' : 'Related'),
      reverseLabel: w.backward.isEmpty ? null : w.backward,
      directed: !w.reciprocal,
      source: ConnectionSource('loreLinks', link.id),
      type: link.type,
      notes: (link.notes?.isEmpty ?? true) ? null : link.notes,
      canon: (strOrNull(link.raw['canon'])?.isEmpty ?? true) ? null : link.raw['canon']! as String,
      validity: link.validity,
      validityJson: validityJson,
    );
  }

  // Progression changes: at the chapter, scene or event they happen at, and with the entry they name.
  for (final change in model.progress) {
    final words = changeWords(change, model.progressCategories[change.categoryId], model);
    final source = ConnectionSource('progressChanges', change.id);
    final who = ref(EntityType.entry, change.entryId);
    switch (change.at) {
      case NodeAnchor(:final nodeId):
        add(
          'progress:${change.id}',
          ConnectionKind.progress,
          who,
          ref(EntityType.node, nodeId),
          'Changes ($words) in',
          source,
        );
      case EventAnchor(:final eventId):
        add(
          'progress:${change.id}',
          ConnectionKind.progress,
          who,
          ref(EntityType.event, eventId),
          'Changes ($words) at',
          source,
        );
      default:
    }
    final verb = change.action == 'gain' ? 'Gained' : (change.action == 'lose' ? 'Lost' : 'Changes ($words) with');
    if (change.refId != null) {
      add(
        'progress-ref:${change.id}',
        ConnectionKind.progress,
        who,
        ref(EntityType.entry, change.refId!),
        verb,
        source,
      );
    }
    if (change.abilityId != null) {
      add(
        'progress-ability:${change.id}',
        ConnectionKind.progress,
        who,
        ref(EntityType.ability, change.abilityId!),
        verb,
        source,
      );
    }
  }

  // Journeys: where each traveller leaves from, goes to and by way of; when they set out and arrive; their events.
  for (final journey in model.journeys) {
    final source = ConnectionSource('journeys', journey.id);
    for (final t in journey.travellerIds) {
      final from = ref(EntityType.entry, t);
      if (journey.fromId != null) {
        add(
          'travel-from:${journey.id}:$t',
          ConnectionKind.travel,
          from,
          ref(EntityType.entry, journey.fromId!),
          'Leaves from',
          source,
        );
      }
      if (journey.toId != null) {
        add(
          'travel-to:${journey.id}:$t',
          ConnectionKind.travel,
          from,
          ref(EntityType.entry, journey.toId!),
          'Travels to',
          source,
        );
      }
      for (final (i, v) in journey.via.indexed) {
        add(
          'travel-via:${journey.id}:$t:$i',
          ConnectionKind.travel,
          from,
          ref(EntityType.entry, v),
          'Travels by way of',
          source,
        );
      }
      for (final e in journey.eventIds) {
        add(
          'travel-event:${journey.id}:$t:$e',
          ConnectionKind.travel,
          from,
          ref(EntityType.event, e),
          'Travels as part of',
          source,
        );
      }
      for (final (which, at) in [('leaves', journey.departure), ('arrives', journey.arrival)]) {
        final leaves = which == 'leaves';
        switch (at) {
          case NodeAnchor(:final nodeId):
            add(
              'travel-$which:${journey.id}:$t',
              ConnectionKind.travel,
              from,
              ref(EntityType.node, nodeId),
              leaves ? 'Sets out in' : 'Arrives in',
              source,
            );
          case EventAnchor(:final eventId):
            add(
              'travel-$which:${journey.id}:$t',
              ConnectionKind.travel,
              from,
              ref(EntityType.event, eventId),
              leaves ? 'Sets out at' : 'Arrives at',
              source,
            );
          default:
        }
      }
    }
  }

  for (final relation in model.relations.values) {
    final stage = stageAt(relation, null, model.order);
    final directed = stage?.directional ?? false;
    final candidates = [if (directed) stage!.fromRole, stage?.title ?? '', stage?.label ?? ''];
    final label = candidates.firstWhere((s) => s.isNotEmpty, orElse: () => 'Related');
    add(
      'relationship:${relation.id}',
      ConnectionKind.relationship,
      ref(EntityType.entry, relation.fromId),
      ref(EntityType.entry, relation.toId),
      label,
      ConnectionSource('characterRelations', relation.id),
      directed: directed,
      reverseLabel: directed ? stage!.toRole : null,
    );
  }

  for (final entry in model.entries.values) {
    final defs = {for (final d in model.categoryOf(entry.category).fields) d.id: d};
    for (final field in entry.fields) {
      final def = field.defId == null ? null : defs[field.defId];
      final type = def != null ? def.type : field.type;
      if (type != FieldType.reference && type != FieldType.references) continue;
      final name = [def?.name ?? '', field.key].firstWhere((s) => s.isNotEmpty, orElse: () => 'Linked');
      final targets = type == FieldType.reference ? [field.value] : field.value.split('\n');
      for (final target in targets.map((t) => t.trim()).where((t) => t.isNotEmpty)) {
        add(
          'field:${entry.id}:${field.id}:$target',
          ConnectionKind.field,
          ref(EntityType.entry, entry.id),
          ref(EntityType.entry, target),
          name,
          ConnectionSource('loreEntries', entry.id, field: field.id),
        );
      }
    }
  }

  for (final event in model.events.values) {
    final source = ConnectionSource('timelineEvents', event.id);
    final here = ref(EntityType.event, event.id);
    // The original reads every character row; a row without an id makes no connection (as `add` skips empty ids).
    for (final c in maps(event.raw['characters'])) {
      add(
        'participant:${event.id}:${str(c['id'])}',
        ConnectionKind.participant,
        ref(EntityType.entry, str(c['id'])),
        here,
        'Takes part in',
        source,
      );
    }
    for (final e in event.entryIds) {
      add('involved:${event.id}:$e', ConnectionKind.involved, ref(EntityType.entry, e), here, 'Involved in', source);
    }
    if (event.locationId != null) {
      add(
        'occurs-at:${event.id}',
        ConnectionKind.occursAt,
        here,
        ref(EntityType.entry, event.locationId!),
        'Takes place at',
        source,
      );
    }
    final roles = event.reveals;
    for (final n in event.nodeIds) {
      add(
        'told-in:${event.id}:$n',
        ConnectionKind.toldIn,
        here,
        ref(EntityType.node, n),
        (roles[n] ?? RevealRole.told).label,
        source,
      );
    }
    for (final t in event.threadIds) {
      add('in-thread:${event.id}:$t', ConnectionKind.inThread, here, ref(EntityType.thread, t), 'Part of', source);
    }
    if (event.afterId != null) {
      add(
        'follows:${event.id}',
        ConnectionKind.follows,
        here,
        ref(EntityType.event, event.afterId!),
        'Comes after',
        source,
      );
    }
    // Read from the stored date itself: a relative date with a damaged offset still names its anchor.
    final when = mapOrNull(event.raw['when']);
    final anchorId = idOrNull(when?['anchorId']);
    if (when?['precision'] == 'relative' && anchorId != null) {
      add(
        'dated-from:${event.id}',
        ConnectionKind.datedFrom,
        here,
        ref(EntityType.event, anchorId),
        'Dated from',
        source,
      );
    }
  }

  for (final thread in model.threads.values) {
    final source = ConnectionSource('plotThreads', thread.id);
    final here = ref(EntityType.thread, thread.id);
    for (final e in [...thread.characterIds, ...thread.locationIds]) {
      add(
        'thread-entry:${thread.id}:$e',
        ConnectionKind.threadEntry,
        here,
        ref(EntityType.entry, e),
        'Involves',
        source,
      );
    }
    for (final beat in thread.beats) {
      if (beat.nodeId != null) {
        add(
          'beat:${thread.id}:${beat.id}',
          ConnectionKind.beat,
          here,
          ref(EntityType.node, beat.nodeId!),
          beat.title.isEmpty ? 'Develops in' : beat.title,
          source,
        );
      }
    }
    if (thread.targetNodeId != null) {
      add(
        'resolves-in:${thread.id}',
        ConnectionKind.resolvesIn,
        here,
        ref(EntityType.node, thread.targetNodeId!),
        'Meant to resolve in',
        source,
      );
    }
  }

  for (final sheet in model.sheets) {
    for (final itemId in sheet.itemIds) {
      add(
        'holds:${sheet.id}:$itemId',
        ConnectionKind.holds,
        ref(EntityType.entry, sheet.entryId),
        ref(EntityType.ability, abilityId(sheet.systemId, itemId)),
        'Has',
        ConnectionSource('systemSheets', sheet.id),
      );
    }
  }
  for (final a in model.abilities.values) {
    final parent = a.item.parentId;
    if (parent != null) {
      add(
        'branches-from:${a.system.id}/${a.item.id}',
        ConnectionKind.branchesFrom,
        ref(EntityType.ability, abilityId(a.system.id, a.item.id)),
        ref(EntityType.ability, abilityId(a.system.id, parent)),
        'Branches from',
        ConnectionSource('systems', a.system.id),
      );
    }
  }

  final connections = <Connection>[];
  final dangling = <DanglingConnection>[];
  for (final c in all.values) {
    final missing = [
      for (final end in [c.from, c.to])
        if (!model.exists(end)) end,
    ];
    if (missing.isEmpty) {
      connections.add(c);
    } else {
      dangling.add(DanglingConnection(c, missing));
    }
  }
  return (connections: connections, dangling: dangling);
}

/// A connection as one of its ends sees it. Each side keeps its own wording: one side's label is never shown as the
/// other's, so "Orrin considers Mira a rival" does not read as Mira thinking the same.
class SeenConnection {
  SeenConnection(this.connection, this.other, this.label, this.theirLabel, {required this.outgoing});
  final Connection connection;
  final EntityRef other;
  final String label;
  final String theirLabel;
  final bool outgoing;
}

List<SeenConnection> connectionsOf(List<Connection> connections, EntityRef self) => [
  for (final c in connections) ...[
    if (c.from == self) SeenConnection(c, c.to, c.label, c.reverseLabel ?? '', outgoing: true),
    if (c.to == self) SeenConnection(c, c.from, c.reverseLabel ?? '', c.label, outgoing: false),
  ],
];
