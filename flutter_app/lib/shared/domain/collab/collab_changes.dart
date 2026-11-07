import '../json.dart';
import '../manuscript/prose.dart' show docBlocks;
import 'access.dart';
import 'hunks.dart';
import 'records.dart';

/// One record to write: [value] (null to delete), written only if the stored record is still [before].
typedef CollabWrite = ({String collection, String id, JsonMap? value, JsonMap? before});

CollabWrite _put(String collection, JsonMap value, JsonMap? before) =>
    (collection: collection, id: str(value['id']), value: value, before: before);
CollabWrite _delete(String collection, JsonMap before) =>
    (collection: collection, id: str(before['id']), value: null, before: before);

/// A change the person's role does not allow, or a request that cannot be met. The message is fit to show them.
class CollabException implements Exception {
  const CollabException(this.message);
  final String message;
  @override
  String toString() => message;
}

void _need(Me me, Capability capability, String message) {
  if (!can(me.role, capability)) throw PermissionException(message);
}

/// Saves of the same thing by the same person within this long are one line of the record.
const _coalesceMs = 15 * 60 * 1000;

/// The line a person's action leaves in the record of who did what: a new one, or their last line about the same
/// thing, counted once more, when it was within a quarter of an hour (as the original folds repeated saves).
CollabWrite activityLine(
  Me me, {
  required String projectId,
  required String verb,
  required String table,
  required String rowId,
  required String label,
  required num now,
  required String Function() newId,
  Iterable<Activity> existing = const [],
}) {
  final last = existing
      .where((a) => a.actorId == me.id && a.verb == verb && a.table == table && a.rowId == rowId)
      .fold<Activity?>(null, (best, a) => best == null || a.at > best.at ? a : best);
  if (last != null && now - last.at < _coalesceMs) {
    return _put('activity', {...last.toJson(), 'at': now, 'count': last.count + 1}, last.toJson());
  }
  return _put('activity', {
    'id': newId(),
    'projectId': projectId,
    'at': now,
    'actorId': me.id,
    'actorName': me.name,
    'actorRole': me.role.name,
    'verb': verb,
    'table': table,
    'rowId': rowId,
    'label': label.trim(),
    'count': 1,
  }, null);
}

/// Starts a conversation about a stretch of text, a chapter, a codex entry or a plot thread: the comment, and the line
/// it leaves in the record.
List<CollabWrite> newComment(
  Me me, {
  required String projectId,
  required JsonMap target,
  required String targetLabel,
  required String body,
  String kind = 'comment',
  Map<String, num>? ratings,
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) {
  _need(me, Capability.comment, 'Viewers cannot comment.');
  if (body.trim().isEmpty && kind != 'feedback') throw const CollabException('Write the comment first.');
  final id = newId();
  final key = targetKeyOf(target);
  final row = <String, Object?>{
    'id': id,
    'projectId': projectId,
    'threadId': id,
    'threadAuthorId': me.id,
    'parentId': null,
    'target': target,
    'targetKey': key,
    'targetLabel': targetLabel,
    'kind': kind,
    'body': body.trim(),
    'ratings': ?ratings,
    'authorId': me.id,
    'authorName': me.name,
    'authorRole': me.role.name,
    'status': 'open',
    'resolvedBy': null,
    'resolvedAt': null,
    'createdAt': now,
    'updatedAt': now,
  };
  final verb = kind == 'feedback' ? 'gave feedback on' : (kind == 'reaction' ? 'reacted to' : 'commented on');
  return [
    _put('comments', row, null),
    activityLine(
      me,
      projectId: projectId,
      verb: verb,
      table: 'comments',
      rowId: key,
      label: targetLabel,
      now: now,
      newId: newId,
      existing: activity,
    ),
  ];
}

List<CollabWrite> reply(
  Me me,
  Comment root, {
  required String body,
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) {
  _need(me, Capability.comment, 'Viewers cannot comment.');
  if (body.trim().isEmpty) throw const CollabException('Write the reply first.');
  final row = <String, Object?>{
    'id': newId(),
    'projectId': root.projectId,
    'threadId': root.id,
    'threadAuthorId': root.threadAuthorId,
    'parentId': root.id,
    'target': root.target,
    'targetKey': root.targetKey,
    'targetLabel': root.targetLabel,
    'kind': 'comment',
    'body': body.trim(),
    'authorId': me.id,
    'authorName': me.name,
    'authorRole': me.role.name,
    'status': 'open',
    'resolvedBy': null,
    'resolvedAt': null,
    'createdAt': now,
    'updatedAt': now,
  };
  return [
    _put('comments', row, null),
    activityLine(
      me,
      projectId: root.projectId,
      verb: 'replied on',
      table: 'comments',
      rowId: root.targetKey,
      label: root.targetLabel,
      now: now,
      newId: newId,
      existing: activity,
    ),
  ];
}

CollabWrite editComment(Me me, Comment row, String body, {required num now}) {
  if (row.authorId != me.id) throw const PermissionException('Only its writer can reword a comment.');
  if (body.trim().isEmpty) throw const CollabException('A comment cannot be empty. Delete it instead.');
  return _put('comments', {...row.toJson(), 'body': body.trim(), 'updatedAt': now}, row.toJson());
}

/// Resolves a conversation, or opens it again.
List<CollabWrite> setThreadStatus(
  Me me,
  Comment root, {
  required bool resolved,
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) => [
  _put('comments', {
    ...root.toJson(),
    'status': resolved ? 'resolved' : 'open',
    'resolvedBy': resolved ? me.name : null,
    'resolvedAt': resolved ? now : null,
    'updatedAt': now,
  }, root.toJson()),
  activityLine(
    me,
    projectId: root.projectId,
    verb: resolved ? 'resolved a comment on' : 're-opened a comment on',
    table: 'comments',
    rowId: root.targetKey,
    label: root.targetLabel,
    now: now,
    newId: newId,
    existing: activity,
  ),
];

/// Deletes a message. A reply simply goes. The first message of a conversation takes the conversation with it if
/// nobody else has replied; if they have, its words are removed and theirs stay (unless an author deletes it).
List<CollabWrite> removeComment(Me me, Comment row, Iterable<Comment> all, {required num now}) {
  if (row.authorId != me.id && !can(me.role, Capability.decide)) {
    throw const PermissionException('Only its writer or an author can delete a comment.');
  }
  if (!row.isRoot) return [_delete('comments', row.toJson())];
  final replies = all.where((r) => r.threadId == row.id && !r.isRoot).toList();
  final others = replies.where((r) => r.authorId != me.id);
  if (others.isNotEmpty && !can(me.role, Capability.decide)) {
    return [
      _put('comments', {...row.toJson(), 'body': '', 'deleted': true, 'updatedAt': now}, row.toJson()),
    ];
  }
  return [_delete('comments', row.toJson()), for (final r in replies) _delete('comments', r.toJson())];
}

/// TRACK CHANGES. Keeps the chapter as this person would have it, beside the text as they found it. The manuscript is
/// not touched. Saving the text back to how it was found withdraws the suggestion. [existing] are the suggestions about
/// this chapter.
List<CollabWrite> saveTextSuggestion(
  Me me, {
  required String projectId,
  required String chapterId,
  required String chapterTitle,
  required JsonMap base,
  required JsonMap proposed,
  required Iterable<Suggestion> existing,
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) {
  _need(me, Capability.suggest, 'Your role comments; it does not suggest changes.');
  final mine = existing.where((s) => s.isText && s.authorId == me.id && s.status == 'pending').toList()
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  final current = mine.firstOrNull;
  final from = current?.base ?? base;
  if (textHunks(from, proposed).isEmpty) {
    return current != null && current.decisions.isEmpty ? [_delete('suggestions', current.toJson())] : const [];
  }
  if (current != null) {
    return [
      _put('suggestions', {...current.toJson(), 'proposed': proposed, 'updatedAt': now}, current.toJson()),
    ];
  }
  return [
    _put('suggestions', {
      'id': newId(),
      'projectId': projectId,
      'kind': 'text',
      'targetId': chapterId,
      'targetLabel': chapterTitle,
      'authorId': me.id,
      'authorName': me.name,
      'authorRole': me.role.name,
      'note': '',
      'base': base,
      'proposed': proposed,
      'status': 'pending',
      'decisions': <String, Object?>{},
      'decidedBy': null,
      'decidedAt': null,
      'createdAt': now,
      'updatedAt': now,
    }, null),
    activityLine(
      me,
      projectId: projectId,
      verb: 'suggested changes to',
      table: 'suggestions',
      rowId: chapterId,
      label: chapterTitle,
      now: now,
      newId: newId,
      existing: activity,
    ),
  ];
}

/// Proposes new values for a codex entry. The entry is not changed.
List<CollabWrite> suggestFields(
  Me me, {
  required String projectId,
  required String entryId,
  required String entryName,
  required List<({String field, String label, String from, String to})> changes,
  String note = '',
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) {
  _need(me, Capability.suggest, 'Your role comments; it does not suggest changes.');
  final real = [
    for (final c in changes)
      if (c.from != c.to) c,
  ];
  if (real.isEmpty) throw const CollabException('Change something first.');
  return [
    _put('suggestions', {
      'id': newId(),
      'projectId': projectId,
      'kind': 'fields',
      'targetId': entryId,
      'targetLabel': entryName,
      'authorId': me.id,
      'authorName': me.name,
      'authorRole': me.role.name,
      'note': note.trim(),
      'changes': [
        for (final c in real) {'field': c.field, 'label': c.label, 'from': c.from, 'to': c.to},
      ],
      'status': 'pending',
      'decisions': <String, Object?>{},
      'decidedBy': null,
      'decidedAt': null,
      'createdAt': now,
      'updatedAt': now,
    }, null),
    activityLine(
      me,
      projectId: projectId,
      verb: 'suggested an edit to',
      table: 'suggestions',
      rowId: entryId,
      label: entryName,
      now: now,
      newId: newId,
      existing: activity,
    ),
  ];
}

/// Takes back a suggestion of one's own.
CollabWrite withdrawSuggestion(Me me, Suggestion row) {
  if (row.authorId != me.id) throw const PermissionException('Only its writer can withdraw a suggestion.');
  return _delete('suggestions', row.toJson());
}

/// An author's verdict on one change of a text suggestion. Accepting makes that change, and only that change, to the
/// chapter as it stands now ([currentDoc]); the new text is returned for the ordinary save (so the earlier text goes
/// to version history). If the passage has been rewritten since, nothing is changed and this says so. Rejecting
/// changes nothing but the record.
({JsonMap? doc, List<CollabWrite> writes}) decideHunk(
  Me me,
  Suggestion row,
  String hunkId, {
  required bool accept,
  required Object? currentDoc,
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) {
  _need(me, Capability.decide, 'Only an author accepts or rejects a suggestion.');
  final all = textHunks(row.base, row.proposed);
  final hunk = all.where((h) => h.id == hunkId).firstOrNull;
  if (!row.isText || hunk == null) throw const CollabException('That change is no longer part of the suggestion.');
  JsonMap? doc;
  if (accept) {
    switch (applyHunk(currentDoc, hunk)) {
      case AppliedTo(doc: final next):
        doc = next;
      case AlreadyThere():
        break;
      case Rewritten():
        throw const CollabException(
          'The text here has been rewritten since this was suggested, so it cannot be applied as it stands. '
          'Reject it, or make the change by hand.',
        );
    }
  }
  final verdict = accept ? 'accepted' : 'rejected';
  final decisions = {
    ...row.decisions,
    hunkId: {'verdict': verdict, 'by': me.id, 'byName': me.name, 'at': now},
  };
  final left = all.where((h) => !decisions.containsKey(h.id)).length;
  final status = left > 0
      ? 'pending'
      : (decisions.values.any((d) => mapOrNull(d)?['verdict'] == 'accepted') ? 'accepted' : 'rejected');
  return (
    doc: doc,
    writes: [
      _put('suggestions', {
        ...row.toJson(),
        'decisions': decisions,
        'status': status,
        'decidedBy': left > 0 ? null : me.name,
        'decidedAt': left > 0 ? null : now,
        'updatedAt': now,
      }, row.toJson()),
      activityLine(
        me,
        projectId: row.projectId,
        verb: '$verdict a change suggested by ${row.authorName} in',
        table: 'suggestions',
        rowId: '${row.id}:$hunkId',
        label: row.targetLabel,
        now: now,
        newId: newId,
        existing: activity,
      ),
    ],
  );
}

/// An author's verdict on a proposed edit to a codex entry. Accepting writes the proposed values to the entry (every
/// field the edit does not name is kept); rejecting changes nothing but the record.
List<CollabWrite> decideFields(
  Me me,
  Suggestion row, {
  required bool accept,
  required JsonMap? entry,
  required num now,
  required String Function() newId,
  Iterable<Activity> activity = const [],
}) {
  _need(me, Capability.decide, 'Only an author accepts or rejects a suggestion.');
  if (row.isText || row.status != 'pending') throw const CollabException('That suggestion has already been settled.');
  final writes = <CollabWrite>[];
  if (accept) {
    if (entry == null) throw const CollabException('That entry is no longer in the novel.');
    final next = {...entry};
    var fields = [for (final f in maps(entry['fields'])) f];
    for (final c in row.changes) {
      if (c.field == 'name' || c.field == 'summary' || c.field == 'description') {
        next[c.field] = c.to;
      } else if (c.field.startsWith('field:')) {
        final key = c.field.substring(6);
        fields = fields.any((f) => f['key'] == key)
            ? [
                for (final f in fields) f['key'] == key ? {...f, 'value': c.to} : f,
              ]
            : [
                ...fields,
                {'id': newId(), 'key': key, 'value': c.to},
              ];
        next['fields'] = fields;
      }
    }
    next['updatedAt'] = now;
    writes.add(_put('loreEntries', next, entry));
  }
  final verdict = accept ? 'accepted' : 'rejected';
  writes
    ..add(
      _put('suggestions', {
        ...row.toJson(),
        'status': verdict,
        'decisions': {
          'all': {'verdict': verdict, 'by': me.id, 'byName': me.name, 'at': now},
        },
        'decidedBy': me.name,
        'decidedAt': now,
        'updatedAt': now,
      }, row.toJson()),
    )
    ..add(
      activityLine(
        me,
        projectId: row.projectId,
        verb: '$verdict an edit suggested by ${row.authorName} to',
        table: 'suggestions',
        rowId: row.id,
        label: row.targetLabel,
        now: now,
        newId: newId,
        existing: activity,
      ),
    );
  return writes;
}

/// A suggested text as the person edits it, paragraph by paragraph: unchanged paragraphs are kept exactly as stored
/// (formatting and all); a changed paragraph keeps its kind and alignment and holds the new words as plain text.
JsonMap docWithParagraphs(Object? base, List<({Object? original, String? text})> paragraphs) {
  final doc = mapOrNull(base) ?? const <String, Object?>{'type': 'doc'};
  JsonMap plain(Object? like, String text) {
    final m = mapOrNull(like);
    return {
      'type': m?['type'] == 'heading' ? 'heading' : 'paragraph',
      if (m?['attrs'] != null) 'attrs': m!['attrs'] else 'attrs': {'textAlign': null},
      'content': [
        if (text.isNotEmpty) {'type': 'text', 'text': text},
      ],
    };
  }

  return {
    ...doc,
    'content': [for (final p in paragraphs) p.text == null ? p.original : plain(p.original, p.text!)],
  };
}

/// The words of each paragraph of a document, in order (as the editor numbers them).
List<String> paragraphTexts(Object? doc) => [for (final b in docBlocks(doc)) b.text];
