import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import '../records/story_node.dart';
import '../records/thread.dart';
import '../timeline/event_changes.dart' show cleanLabels;

/// What the plot, board and plan screens read and change.
const plotCollections = {
  'plotThreads',
  'chapters',
  'chapterPlans',
  'loreEntries',
  'loreLinks',
  'timelineEvents',
  'structureMarkers',
};

const threadCategories = [
  'main',
  'subplot',
  'character-arc',
  'mystery',
  'romance',
  'conflict',
  'foreshadowing',
  'political',
  'worldbuilding',
  'villain',
  'personal-goal',
  'custom',
];
const threadCategoryLabels = {
  'main': 'Main Plot',
  'subplot': 'Subplot',
  'character-arc': 'Character Arc',
  'mystery': 'Mystery',
  'romance': 'Romance',
  'conflict': 'Conflict',
  'foreshadowing': 'Foreshadowing',
  'political': 'Political Storyline',
  'worldbuilding': 'Worldbuilding Storyline',
  'villain': 'Villain Storyline',
  'personal-goal': 'Personal Goal',
  'custom': 'Custom',
};
const threadStatuses = ['planned', 'active', 'paused', 'resolved', 'abandoned', 'retconned', 'custom'];

/// The order statuses are shown in: what is in play first.
const threadStatusOrder = ['active', 'paused', 'planned', 'resolved', 'abandoned', 'retconned', 'custom'];

String categoryName(PlotThread t) {
  final custom = str(t.raw['customCategory']).trim();
  return t.category == 'custom' && custom.isNotEmpty ? custom : (threadCategoryLabels[t.category] ?? t.category);
}

/// A chapter's or scene's planning fields, as the original names them.
const planTextFields = [
  'objective',
  'conflict',
  'emotionalArc',
  'dialogue',
  'foreshadowing',
  'reveals',
  'openQuestions',
  'ending',
];
const planLabels = {
  'objective': 'Objective',
  'conflict': 'Main conflict',
  'emotionalArc': 'Emotional arc',
  'dialogue': 'Key dialogue',
  'foreshadowing': 'Foreshadowing',
  'reveals': 'Information revealed',
  'openQuestions': 'Open questions',
  'ending': 'Ending target',
};

JsonMap emptyPlan(String id, String projectId) => {
  'id': id,
  'projectId': projectId,
  'objective': '',
  'beats': <Object?>[],
  'entityIds': <Object?>[],
  'conflict': '',
  'emotionalArc': '',
  'dialogue': '',
  'foreshadowing': '',
  'reveals': '',
  'openQuestions': '',
  'ending': '',
  'updatedAt': 0,
};

/// Changes to plot threads, chapter and scene plans, and a chapter's own planning fields. A thread's status is only ever
/// set by the author; no beat, role or chapter is made up for one.
class PlotChanges extends RecordChanges {
  PlotChanges(super.snapshot, {required super.now, required super.createId});

  PlotThread owned(String threadId) {
    final r = row('plotThreads', threadId);
    if (r == null) throw ChangeRefused('That plot thread is not in this novel.');
    return PlotThread(r);
  }

  /// Ids of this novel's rows: entries of one category, or chapters and scenes (`document`).
  List<String> _existing(String collection, Object? ids, [String? only]) {
    final wanted = {
      for (final id in listOf(ids))
        if (id is String && id.isNotEmpty) id,
    };
    return [
      for (final id in wanted)
        if (row(collection, id) case final r?)
          if (only == null ||
              (only == 'document' ? (r['kind'] == 'chapter' || r['kind'] == 'scene') : r['category'] == only))
            id,
    ];
  }

  String? _document(Object? id) => _existing('chapters', [id], 'document').firstOrNull;

  /// The other threads of this novel an intersection names; never the thread itself.
  List<String> _crossed(String threadId, Object? ids) => [
    for (final id in {
      for (final x in listOf(ids))
        if (x is String && x.isNotEmpty && x != threadId) x,
    })
      if (row('plotThreads', id) != null) id,
  ];

  String? _role(Object? role) =>
      role is String && const ['introduction', 'development', 'intersection', 'resolution', 'appears'].contains(role)
      ? role
      : null;

  String createThread([String? title]) {
    final id = newId();
    put('plotThreads', {
      'id': id,
      'projectId': projectId,
      'title': title?.trim().isNotEmpty == true ? title!.trim() : 'New thread',
      'premise': '',
      'category': 'subplot',
      'customCategory': '',
      'status': 'planned',
      'characterIds': <Object?>[],
      'locationIds': <Object?>[],
      'targetNodeId': null,
      'targetNote': '',
      'beats': <Object?>[],
      'notes': '',
      'muted': false,
      'createdAt': now,
      'updatedAt': now,
    });
    return id;
  }

  /// Updates a thread from what it holds now. This is the only way a thread's status ever changes: by the author.
  void updateThread(String threadId, JsonMap Function(PlotThread stored) edit) {
    final current = owned(threadId);
    final c = edit(current);
    final next = <String, Object?>{'updatedAt': now};
    if (c['title'] is String) {
      final t = (c['title']! as String).trim();
      next['title'] = t.isEmpty ? 'Untitled thread' : t;
    }
    for (final k in ['premise', 'notes', 'targetNote']) {
      if (c[k] is String) next[k] = c[k];
    }
    if (c['customCategory'] is String) {
      final s = c['customCategory']! as String;
      next['customCategory'] = s.length > 60 ? s.substring(0, 60) : s;
    }
    if (c['muted'] is bool) next['muted'] = c['muted'];
    if (threadCategories.contains(c['category'])) next['category'] = c['category'];
    if (threadStatuses.contains(c['status'])) next['status'] = c['status'];
    if (c['customStatus'] is String) {
      final s = c['customStatus']! as String;
      next['customStatus'] = s.length > 40 ? s.substring(0, 40) : s;
    }
    if (c.containsKey('characterIds')) next['characterIds'] = _existing('loreEntries', c['characterIds'], 'character');
    if (c.containsKey('locationIds')) next['locationIds'] = _existing('loreEntries', c['locationIds'], 'location');
    if (c.containsKey('targetNodeId')) next['targetNodeId'] = _existing('chapters', [c['targetNodeId']]).firstOrNull;
    put('plotThreads', current.merged(next));
  }

  void _editBeats(String threadId, List<JsonMap> Function(List<JsonMap> beats) edit) {
    final thread = owned(threadId);
    put('plotThreads', thread.merged({'beats': edit(maps(thread.raw['beats'])), 'updatedAt': now}));
  }

  /// Records a development. A chapter or scene that is not this novel's is left unplaced. One that only marks the
  /// thread as appearing needs no title: none is made up for it.
  String addBeat(String threadId, {String? title, Object? nodeId, String? role, Object? note, Object? withThreadIds}) {
    final r = _role(role);
    final t = title?.trim() ?? '';
    final beat = <String, Object?>{
      'id': newId(),
      'nodeId': _document(nodeId),
      'title': t.isNotEmpty ? t : (r == 'appears' ? '' : 'New development'),
      'note': note is String ? note : '',
      'createdAt': now,
      'role': ?r,
    };
    if (withThreadIds != null) beat['withThreadIds'] = _crossed(threadId, withThreadIds);
    _editBeats(threadId, (beats) => [...beats, beat]);
    return beat['id']! as String;
  }

  /// Changes one development. The others are left exactly as stored, including any whose chapter has since gone.
  void updateBeat(String threadId, String beatId, JsonMap changes) {
    final nodeId = changes.containsKey('nodeId') ? (value: _document(changes['nodeId'])) : null;
    final crossed = changes.containsKey('withThreadIds') ? _crossed(threadId, changes['withThreadIds']) : null;
    final r = _role(changes['role']);
    _editBeats(
      threadId,
      (beats) => [
        for (final b in beats)
          if (b['id'] != beatId)
            b
          else
            {
              ...b,
              if (nodeId != null) 'nodeId': nodeId.value,
              'role': ?r,
              'withThreadIds': ?crossed,
              if (changes['title'] is String)
                'title': () {
                  final t = (changes['title']! as String).trim();
                  return t.isNotEmpty ? t : ((r ?? b['role']) == 'appears' ? '' : 'Untitled development');
                }(),
              if (changes['note'] is String) 'note': changes['note'],
            },
      ],
    );
  }

  void removeBeat(String threadId, String beatId) => _editBeats(
    threadId,
    (beats) => [
      for (final b in beats)
        if (b['id'] != beatId) b,
    ],
  );

  /// The plan of a chapter or scene, or a blank one.
  JsonMap planOf(String nodeId) => row('chapterPlans', nodeId) ?? emptyPlan(nodeId, projectId);

  StoryNode _document_(String nodeId) {
    final r = row('chapters', nodeId);
    if (r == null || (r['kind'] != 'chapter' && r['kind'] != 'scene')) {
      throw ChangeRefused('That chapter or scene is not in this novel.');
    }
    return StoryNode(r);
  }

  /// Updates planning fields. This writes the plan and the node's "last edited" time, and nothing else: manuscript text
  /// is out of reach.
  void updatePlan(String nodeId, JsonMap Function(JsonMap stored) edit) {
    final node = _document_(nodeId);
    final plan = {...planOf(nodeId), 'updatedAt': now};
    final c = edit(plan);
    for (final f in planTextFields) {
      if (c[f] is String) plan[f] = c[f];
    }
    if (c['beats'] is List) {
      plan['beats'] = [
        for (final b in maps(c['beats']))
          if (b['text'] is String && (b['text']! as String).trim().isNotEmpty)
            {'id': b['id'] is String && (b['id']! as String).isNotEmpty ? b['id'] : newId(), 'text': b['text']},
      ];
    }
    if (c['entityIds'] is List) plan['entityIds'] = _existing('loreEntries', c['entityIds']);
    if (c.containsKey('labels')) plan['labels'] = cleanLabels(c['labels']);
    // Who appears and who is only mentioned: only this novel's characters, each in one list; the list changed now wins.
    for (final (field, other) in [('appearIds', 'mentionIds'), ('mentionIds', 'appearIds')]) {
      if (c[field] is! List) continue;
      final ids = _existing('loreEntries', c[field], 'character');
      plan[field] = ids;
      plan[other] = [
        for (final id in strings(plan[other]))
          if (!ids.contains(id)) id,
      ];
    }
    if (c['povIds'] is List) plan['povIds'] = _existing('loreEntries', c['povIds'], 'character');
    put('chapterPlans', plan);
    put('chapters', node.withFields({'updatedAt': now}).toJson());
  }

  /// A chapter's or scene's own planning fields: its summary, notes and status; and, for a web serial, the author's
  /// notes printed before and after the chapter (`noteBefore`, `noteAfter`, as the original app keeps them).
  void updateNode(
    String nodeId, {
    String? summary,
    String? notes,
    NodeStatus? status,
    String? noteBefore,
    String? noteAfter,
  }) {
    final r = row('chapters', nodeId);
    if (r == null) throw ChangeRefused('That chapter or scene is not in this novel.');
    put('chapters', {
      ...r,
      'summary': ?summary,
      'notes': ?notes,
      'status': ?status?.key,
      'noteBefore': ?noteBefore,
      'noteAfter': ?noteAfter,
      'updatedAt': now,
    });
  }
}
