import '../../../shared/data/backup_service.dart';
import '../../../shared/data/draft_store.dart';
import '../../../shared/data/novel_store.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/manuscript/prose.dart';
import '../../../shared/domain/model/delete_policy.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../../shared/domain/snapshot/novel_snapshot.dart';

/// The name of the draft a chapter or scene starts with, as the original app names it.
const mainDraft = 'Main draft';

/// A change to drafts that cannot be made as asked (a name missing or already taken). Nothing is changed.
class DraftRefused implements Exception {
  DraftRefused(this.message);
  final String message;
  @override
  String toString() => message;
}

/// A save based on text that has been saved differently since it was opened (in another window). Nothing is saved;
/// the author chooses which text to keep.
class SaveConflict implements Exception {
  @override
  String toString() => 'This chapter was saved somewhere else since it was opened. Nothing was overwritten.';
}

/// A chapter's text as opened for editing, and any unsaved writing a crash left behind.
class OpenedText {
  OpenedText(this.doc, this.rev, this.recovered);

  final JsonMap? doc;
  final int rev;

  /// Writing typed after the last save that the app never got to save. Offered back; never applied on its own.
  final ({JsonMap doc, DateTime at})? recovered;
}

/// How often history keeps an automatic copy while writing, and how many copies a chapter keeps, as before.
const revisionInterval = Duration(minutes: 5);
const maxRevisions = 50;

/// Pauses longer than this, or a new day, start a new writing session.
const sessionGap = Duration(minutes: 30);

String dayKey(DateTime t) =>
    '${t.year.toString().padLeft(4, '0')}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';

/// The Monday on or before the day.
String weekStartKey(DateTime t) => dayKey(DateTime(t.year, t.month, t.day - (t.weekday - 1)));

/// The manuscript of one novel: its structure, its text, its history and the writing logged against it.
///
/// NON-INVASIVE RULE: text is stored exactly as the editor gives it. Nothing here changes prose on its own.
class ManuscriptService {
  ManuscriptService(this.store, this.drafts, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final DraftStore drafts;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  NovelSnapshot _load(String projectId) =>
      store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));

  /// Applies a structural change to the stored novel, in one transaction.
  T _change<T>(String projectId, ({NovelSnapshot snapshot, T result}) Function(NovelSnapshot) change) {
    final before = _load(projectId);
    final after = change(before);
    store.saveChanges(before, after.snapshot);
    return after.result;
  }

  List<StoryNode> nodes(String projectId) => [for (final r in store.rowsIn(projectId, 'chapters')) StoryNode(r)];

  StoryNode create(String projectId, NodeKind kind, {String? parentId, String? title}) => _change(projectId, (s) {
    final r = createNode(s, kind, parentId: parentId, title: title, now: _now, createId: _createId);
    return (snapshot: r.snapshot, result: r.node);
  });

  /// Adds what an imported file holds after everything under [parentId] (null: the top level), in one transaction:
  /// all of it, or (if anything cannot be placed) none of it. Returns the ids created, in reading order.
  List<String> importTree(String projectId, String? parentId, List<ImportItem> items) => _change(projectId, (s) {
    final r = addImportedTree(s, parentId, items, now: _now, createId: _createId);
    return (snapshot: r.snapshot, result: r.created);
  });

  void rename(String projectId, String id, String title) =>
      _change<Null>(projectId, (s) => (snapshot: renameNode(s, id, title, now: _now), result: null));

  void setStatus(String projectId, String id, NodeStatus status) =>
      _change<Null>(projectId, (s) => (snapshot: setNodeStatus(s, id, status, now: _now), result: null));

  void move(String projectId, String id, String? parentId, {String? beforeId}) =>
      _change<Null>(projectId, (s) => (snapshot: placeNode(s, id, parentId, beforeId, now: _now), result: null));

  void nudge(String projectId, String id, int delta) =>
      _change<Null>(projectId, (s) => (snapshot: nudgeNode(s, id, delta, now: _now), result: null));

  String duplicate(String projectId, String id) => _change(projectId, (s) {
    final r = duplicateNode(s, id, now: _now, createId: _createId);
    return (snapshot: r.snapshot, result: r.id);
  });

  /// Splits a chapter or scene: it keeps [head], a new one right after it gets [tail]. Its text before the split is
  /// kept in its history first.
  String split(String projectId, String id, JsonMap head, JsonMap tail) {
    _keepVersion(projectId, id, 'Before splitting');
    return _change(projectId, (s) {
      final r = splitNode(s, id, head, tail, now: _now, createId: _createId);
      return (snapshot: r.snapshot, result: r.id);
    });
  }

  /// Merges the next chapter or scene of the same kind into this one. Both texts are kept in history first.
  void merge(String projectId, String id) {
    final next = mergeCandidate(_load(projectId), id);
    if (next == null) throw OutlineException('There is nothing of the same kind right after this to merge with.');
    _keepVersion(projectId, id, 'Before merging');
    _keepVersion(projectId, next.id, 'Before merging into the one before it');
    _change<Null>(projectId, (s) => (snapshot: mergeWithNext(s, id, now: _now), result: null));
  }

  /// Deletes a node and everything inside it, after keeping a restore point. Returns the restore point, for Undo.
  String delete(String projectId, String id, {required String title}) {
    final kept =
        backups.keepRestorePoint(projectId, 'Before deleting “$title”') ??
        (throw StateError('That novel is no longer in the library.'));
    _change<Null>(projectId, (s) => (snapshot: planDelete(s, EntityRef(EntityType.node, id)).snapshot, result: null));
    return kept;
  }

  void undoDelete(String restorePointId) => backups.restore(restorePointId);

  // ------------------------------------------------------------------------------------------------------- text

  String _draftKey(String nodeId) => 'chapter:$nodeId';

  /// The text to edit. A crash copy typed on top of the saved text comes back as [OpenedText.recovered]; one typed on
  /// top of an older save (the text moved on since) is kept in history rather than guessed about.
  OpenedText open(String projectId, String nodeId) {
    final content = store.row(projectId, 'chapterContents', nodeId);
    final rev = intOrNull(content?['rev']) ?? 0;
    final draft = drafts.get(projectId, _draftKey(nodeId));
    final draftDoc = mapOrNull(draft?.value);
    if (draft != null && draftDoc != null && draft.baseRev != rev) {
      final node = StoryNode(store.row(projectId, 'chapters', nodeId) ?? const {});
      store.writeRows(projectId, [
        RowWrite.put('chapterRevisions', {
          'id': _createId(),
          'projectId': projectId,
          'nodeId': nodeId,
          'doc': draftDoc,
          'wordCount': node.wordCount,
          'charCount': node.charCount,
          'savedAt': draft.updatedAt.millisecondsSinceEpoch,
          'capturedAt': _now,
          'sourceRev': -1,
          'reason': 'recovery',
          'label': 'Unsaved writing from an earlier session',
        }),
      ], touchNovel: false);
      drafts.discard(projectId, _draftKey(nodeId));
      return OpenedText(mapOrNull(content?['doc']), rev, null);
    }
    return OpenedText(
      mapOrNull(content?['doc']),
      rev,
      draft != null && draftDoc != null ? (doc: draftDoc, at: draft.updatedAt) : null,
    );
  }

  /// A quick copy of what is in the editor right now, for crash recovery. Touches nothing else.
  void saveDraft(String projectId, String nodeId, JsonMap doc, int baseRev) =>
      drafts.put(projectId, _draftKey(nodeId), doc, baseRev: baseRev);

  void discardDraft(String projectId, String nodeId) => drafts.discard(projectId, _draftKey(nodeId));

  /// Saves the text exactly as given, with its counts, the entries it links, a history copy of what it replaces (at
  /// most every five minutes unless [reason] is given) and the writing logged — all in one transaction. Returns the
  /// new revision number. Throws [SaveConflict] if the saved text is no longer the one [baseRev] names.
  ///
  /// With [force] (the author chose to keep their own text after a conflict), the check is skipped; the text it
  /// replaces still goes into history.
  int save(
    String projectId,
    String nodeId,
    JsonMap doc, {
    required int baseRev,
    String? reason,
    String label = '',
    bool force = false,
  }) {
    late int rev;
    store.db.transaction(() {
      final nodeRow = store.row(projectId, 'chapters', nodeId) ?? (throw StateError('That chapter no longer exists.'));
      final node = StoryNode(nodeRow);
      final content = store.row(projectId, 'chapterContents', nodeId);
      final current = intOrNull(content?['rev']) ?? 0;
      if (baseRev != current && !force) throw SaveConflict();
      final why = baseRev != current ? 'conflict' : reason;
      final whyLabel = baseRev != current ? 'Replaced by text kept after a conflict' : label;
      final m = measureDoc(doc);
      final now = _now;
      rev = current + 1;
      store.writeRows(projectId, [
        if (content != null) ..._capture(projectId, node, content, reason: why, label: whyLabel),
        ..._recordWriting(projectId, m.words - node.wordCount),
        RowWrite.put('chapterContents', {
          ...?content,
          'id': nodeId,
          'projectId': projectId,
          'doc': doc,
          'rev': rev,
          'savedAt': now,
        }, expect: content),
        RowWrite.put(
          'chapters',
          node.withFields({
            'wordCount': m.words,
            'charCount': m.characters,
            'mentions': mentionsIn(doc),
            'updatedAt': now,
          }).toJson(),
          expect: nodeRow,
        ),
      ]);
      drafts.discard(projectId, _draftKey(nodeId));
    });
    return rev;
  }

  /// Version history of a chapter or scene, newest first.
  List<JsonMap> revisions(String projectId, String nodeId) {
    final all = [
      for (final r in store.rowsIn(projectId, 'chapterRevisions'))
        if (r['nodeId'] == nodeId) r,
    ];
    all.sort(_byCapture);
    return all.reversed.toList();
  }

  static int _byCapture(JsonMap a, JsonMap b) {
    final t = (numOrNull(a['capturedAt']) ?? 0).compareTo(numOrNull(b['capturedAt']) ?? 0);
    if (t != 0) return t;
    final r = (numOrNull(a['sourceRev']) ?? 0).compareTo(numOrNull(b['sourceRev']) ?? 0);
    return r != 0 ? r : str(a['id']).compareTo(str(b['id']));
  }

  /// Keeps any text in a chapter's history (the author's own text set aside in a conflict, say), without changing
  /// what is saved.
  void keepInHistory(String projectId, String nodeId, JsonMap doc, {required String reason, required String label}) {
    final m = measureDoc(doc);
    store.writeRows(projectId, [
      RowWrite.put('chapterRevisions', {
        'id': _createId(),
        'projectId': projectId,
        'nodeId': nodeId,
        'doc': doc,
        'wordCount': m.words,
        'charCount': m.characters,
        'savedAt': _now,
        'capturedAt': _now,
        'sourceRev': -1,
        'reason': reason,
        'label': label,
      }),
    ], touchNovel: false);
  }

  /// Keeps the saved text as a named version.
  void saveVersion(String projectId, String nodeId, {String label = ''}) => _keepVersion(projectId, nodeId, label);

  void _keepVersion(String projectId, String nodeId, String label) {
    final content = store.row(projectId, 'chapterContents', nodeId);
    final nodeRow = store.row(projectId, 'chapters', nodeId);
    if (content == null || nodeRow == null) return;
    store.writeRows(
      projectId,
      _capture(projectId, StoryNode(nodeRow), content, reason: 'manual', label: label),
      touchNovel: false,
    );
  }

  /// Brings back an earlier version. The text it replaces goes into history first, so restoring is undoable.
  int restoreRevision(String projectId, String nodeId, String revisionId, {required int baseRev}) {
    final revision =
        store.row(projectId, 'chapterRevisions', revisionId) ?? (throw StateError('That version no longer exists.'));
    return save(
      projectId,
      nodeId,
      mapOrNull(revision['doc']) ?? emptyDoc(),
      baseRev: baseRev,
      reason: 'restore',
      label: 'Before restoring an earlier version',
    );
  }

  /// A copy of [content] for history, unless it is already there or (for an automatic copy) one was kept moments ago.
  /// The oldest automatic copies make room first, the author's own last.
  List<RowWrite> _capture(String projectId, StoryNode node, JsonMap content, {String? reason, String label = ''}) {
    final history = [
      for (final r in store.rowsIn(projectId, 'chapterRevisions'))
        if (r['nodeId'] == node.id) r,
    ]..sort(_byCapture);
    final latest = history.lastOrNull;
    final sourceRev = intOrNull(content['rev']) ?? 0;
    final now = _now;
    if (latest != null && intOrNull(latest['sourceRev']) == sourceRev) {
      if (reason == null) return const [];
      return [
        RowWrite.put('chapterRevisions', {
          ...latest,
          'reason': reason,
          'label': label.isEmpty ? latest['label'] : label,
        }),
      ];
    }
    if (reason == null &&
        latest != null &&
        now - (numOrNull(latest['capturedAt']) ?? 0) < revisionInterval.inMilliseconds) {
      return const [];
    }
    final revision = {
      'id': _createId(),
      'projectId': projectId,
      'nodeId': node.id,
      'doc': content['doc'],
      'wordCount': node.wordCount,
      'charCount': node.charCount,
      'savedAt': content['savedAt'] ?? node.raw['updatedAt'],
      'capturedAt': now,
      'sourceRev': sourceRev,
      'reason': reason ?? 'auto',
      'label': label,
      'branchName': node.raw['branchName'] ?? mainDraft,
    };
    final all = [...history, revision];
    final excess = all.length - maxRevisions;
    final expendable = [...all.where((r) => r['reason'] == 'auto'), ...all.where((r) => r['reason'] != 'auto')];
    return [
      RowWrite.put('chapterRevisions', revision),
      if (excess > 0)
        for (final r in expendable.take(excess)) RowWrite.delete('chapterRevisions', str(r['id'])),
    ];
  }

  // ------------------------------------------------------------------------------------------ alternate drafts

  /// The name of the draft in the manuscript now.
  String activeDraft(String projectId, String nodeId) => str(_document(projectId, nodeId)['branchName'], mainDraft);

  /// The alternate drafts of a chapter or scene that are not in the manuscript, oldest first.
  List<JsonMap> alternateDrafts(String projectId, String nodeId) {
    _document(projectId, nodeId);
    return [
      for (final r in store.rowsIn(projectId, 'chapterBranches'))
        if (r['nodeId'] == nodeId) r,
    ]..sort((a, b) => (numOrNull(a['createdAt']) ?? 0).compareTo(numOrNull(b['createdAt']) ?? 0));
  }

  JsonMap _document(String projectId, String nodeId) {
    final row = store.row(projectId, 'chapters', nodeId);
    final kind = StoryNode(row ?? const {}).kind;
    if (row == null || (kind != NodeKind.chapter && kind != NodeKind.scene)) {
      throw StateError('That chapter or scene is not in this novel.');
    }
    return row;
  }

  void _nameFree(StoryNode node, String name, {required List<String> taken}) {
    if (name.isEmpty) throw DraftRefused('Give the draft a name.');
    if (taken.any((n) => n.toLowerCase() == name.toLowerCase())) {
      throw DraftRefused('This ${node.kindKey} already has a draft called "$name".');
    }
  }

  /// Sets the text in the manuscript aside as an alternate draft under its own name, and carries on with a copy of it
  /// (or, with [blank], an empty page) as a new draft called [newName]. Nothing is lost: both drafts now exist. A copy
  /// leaves the saved text as it is, so an open editor carries on; a blank page replaces it, so an open editor's next
  /// save is refused as a conflict rather than overwriting it.
  void createDraft(String projectId, String nodeId, String newName, {bool blank = false}) {
    store.db.transaction(() {
      final nodeRow = _document(projectId, nodeId);
      final node = StoryNode(nodeRow);
      final name = newName.trim();
      final current = str(nodeRow['branchName'], mainDraft);
      _nameFree(node, name, taken: [current, for (final b in alternateDrafts(projectId, nodeId)) str(b['name'])]);
      final content = store.row(projectId, 'chapterContents', nodeId);
      final now = _now;
      final renamed = node.withFields({'branchName': name, 'updatedAt': now});
      store.writeRows(projectId, [
        RowWrite.put('chapterBranches', {
          'id': _createId(),
          'projectId': projectId,
          'nodeId': nodeId,
          'name': current,
          'doc': content?['doc'],
          'wordCount': node.wordCount,
          'charCount': node.charCount,
          'createdAt': now,
          'updatedAt': now,
        }, expect: null),
        if (!blank)
          RowWrite.put('chapters', renamed.toJson(), expect: nodeRow)
        else
          ..._writeText(projectId, renamed, _blankDoc(), 0, 0, content, expectNode: nodeRow),
      ]);
      if (blank) drafts.discard(projectId, _draftKey(nodeId));
    });
  }

  /// Makes an alternate draft the one in the manuscript. The outgoing text is kept as an alternate under its own name in
  /// the same transaction, so a swap can always be swapped back. Word counts follow; it is not logged as writing.
  void switchDraft(String projectId, String nodeId, String draftId) {
    store.db.transaction(() {
      final nodeRow = _document(projectId, nodeId);
      final node = StoryNode(nodeRow);
      final incoming = store.row(projectId, 'chapterBranches', draftId);
      if (incoming == null || incoming['nodeId'] != nodeId) throw StateError('That draft is not in this novel.');
      final content = store.row(projectId, 'chapterContents', nodeId);
      store.writeRows(projectId, [
        RowWrite.put('chapterBranches', {
          ...incoming,
          'name': str(nodeRow['branchName'], mainDraft),
          'doc': content?['doc'],
          'wordCount': node.wordCount,
          'charCount': node.charCount,
          'updatedAt': _now,
        }, expect: incoming),
        ..._writeText(
          projectId,
          node.withFields({'branchName': str(incoming['name'])}),
          mapOrNull(incoming['doc']) ?? _blankDoc(),
          intOrNull(incoming['wordCount']) ?? 0,
          intOrNull(incoming['charCount']) ?? 0,
          content,
          expectNode: nodeRow,
        ),
      ]);
      drafts.discard(projectId, _draftKey(nodeId));
    });
  }

  /// Renames a draft: [draftId] for an alternate, or null for the one in the manuscript.
  void renameDraft(String projectId, String nodeId, String? draftId, String newName) {
    store.db.transaction(() {
      final nodeRow = _document(projectId, nodeId);
      final node = StoryNode(nodeRow);
      final name = newName.trim();
      final others = alternateDrafts(projectId, nodeId);
      _nameFree(
        node,
        name,
        taken: [
          if (draftId != null) str(nodeRow['branchName'], mainDraft),
          for (final b in others)
            if (b['id'] != draftId) str(b['name']),
        ],
      );
      if (draftId == null) {
        store.writeRows(projectId, [
          RowWrite.put('chapters', node.withFields({'branchName': name}).toJson(), expect: nodeRow),
        ]);
        return;
      }
      final draft =
          others.where((b) => b['id'] == draftId).firstOrNull ?? (throw StateError('That draft is not in this novel.'));
      store.writeRows(projectId, [
        RowWrite.put('chapterBranches', {...draft, 'name': name}, expect: draft),
      ]);
    });
  }

  /// Deletes an alternate draft for good. The draft in the manuscript cannot be deleted this way.
  void deleteDraft(String projectId, String draftId) {
    final draft =
        store.row(projectId, 'chapterBranches', draftId) ?? (throw StateError('That draft is not in this novel.'));
    store.writeRows(projectId, [RowWrite.delete('chapterBranches', draftId, expect: draft)]);
  }

  /// An empty page, as the original app starts a blank draft.
  static JsonMap _blankDoc() => {
    'type': 'doc',
    'content': [
      {'type': 'paragraph'},
    ],
  };

  /// Puts [doc] in the manuscript as the saved text, with its counts and links: a new revision, so an editor opened on
  /// the old text cannot overwrite it. No history copy and no writing logged: the old text is kept as a draft.
  List<RowWrite> _writeText(
    String projectId,
    StoryNode node,
    JsonMap doc,
    int words,
    int characters,
    JsonMap? content, {
    required JsonMap expectNode,
  }) {
    final now = _now;
    return [
      RowWrite.put('chapterContents', {
        ...?content,
        'id': node.id,
        'projectId': projectId,
        'doc': doc,
        'rev': (intOrNull(content?['rev']) ?? 0) + 1,
        'savedAt': now,
      }, expect: content),
      RowWrite.put(
        'chapters',
        node.withFields({
          'wordCount': words,
          'charCount': characters,
          'mentions': mentionsIn(doc),
          'updatedAt': now,
        }).toJson(),
        expect: expectNode,
      ),
    ];
  }

  // ------------------------------------------------------------------------------------------ writing and goals

  /// Logs a save against today's writing session: words added, removed and the net change.
  List<RowWrite> _recordWriting(String projectId, int delta) {
    final now = _clock();
    final day = dayKey(now);
    final todays = [
      for (final r in store.rowsIn(projectId, 'writingSessions'))
        if (r['day'] == day) r,
    ]..sort((a, b) => (numOrNull(a['lastActiveAt']) ?? 0).compareTo(numOrNull(b['lastActiveAt']) ?? 0));
    final last = todays.lastOrNull;
    final added = delta > 0 ? delta : 0;
    final removed = delta < 0 ? -delta : 0;
    final t = now.millisecondsSinceEpoch;
    if (last != null && t - (numOrNull(last['lastActiveAt']) ?? 0) < sessionGap.inMilliseconds) {
      return [
        RowWrite.put('writingSessions', {
          ...last,
          'lastActiveAt': t,
          'netWords': (intOrNull(last['netWords']) ?? 0) + delta,
          'added': (intOrNull(last['added']) ?? 0) + added,
          'removed': (intOrNull(last['removed']) ?? 0) + removed,
          'saves': (intOrNull(last['saves']) ?? 0) + 1,
        }),
      ];
    }
    return [
      RowWrite.put('writingSessions', {
        'id': _createId(),
        'projectId': projectId,
        'day': day,
        'startedAt': t,
        'lastActiveAt': t,
        'netWords': delta,
        'added': added,
        'removed': removed,
        'saves': 1,
      }),
    ];
  }

  /// Net words written today, and since Monday.
  ({int today, int week}) wordsWritten(String projectId) {
    final now = _clock();
    final today = dayKey(now);
    final monday = weekStartKey(now);
    var day = 0;
    var week = 0;
    for (final s in store.rowsIn(projectId, 'writingSessions')) {
      final d = str(s['day']);
      final n = intOrNull(s['netWords']) ?? 0;
      if (d == today) day += n;
      if (d.compareTo(monday) >= 0 && d.compareTo(today) <= 0) week += n;
    }
    return (today: day, week: week);
  }

  /// The author's daily and weekly word targets, when set.
  ({int? daily, int? weekly}) wordGoals(String projectId) {
    int? target(String kind) =>
        intOrNull(store.rowsIn(projectId, 'goals').where((g) => g['kind'] == kind).firstOrNull?['targetWords']);
    return (daily: target('daily'), weekly: target('weekly'));
  }

  /// Sets (or with null, removes) the daily or weekly word target. One of each per novel, as before.
  void setWordGoal(String projectId, String kind, int? words) {
    assert(kind == 'daily' || kind == 'weekly');
    final existing = store.rowsIn(projectId, 'goals').where((g) => g['kind'] == kind).firstOrNull;
    final now = _now;
    if (words == null || words <= 0) {
      if (existing != null) {
        store.writeRows(projectId, [RowWrite.delete('goals', str(existing['id']))], touchNovel: false);
      }
      return;
    }
    store.writeRows(projectId, [
      RowWrite.put('goals', {
        ...?existing,
        'id': existing?['id'] ?? _createId(),
        'projectId': projectId,
        'kind': kind,
        'title': existing?['title'] ?? '',
        'targetWords': words,
        'dueDate': null,
        'nodeId': null,
        'category': null,
        'done': false,
        'doneAt': null,
        'createdAt': existing?['createdAt'] ?? now,
        'updatedAt': now,
      }),
    ], touchNovel: false);
  }
}
