import 'dart:convert';

import '../json.dart';
import '../snapshot/novel_snapshot.dart';
import 'access.dart';
import 'collab_changes.dart' show CollabException, CollabWrite;
import 'records.dart';

/// REVIEW BY FILE. Collaboration without the app ever touching a network: the owner makes a review copy for one
/// person and role, sends it however they like, and brings back the person's feedback file. Nothing in the novel
/// changes until the owner accepts it.
///
/// A review copy is an ordinary `.novel.json` file holding only what the role may see ([visible]). It is marked on the
/// novel's details (`review`, below), and the mark travels with it through every export and import: wherever it is
/// opened, the store refuses any change its role may not make ([refusal]).

/// The mark on a review copy's details: whose novel, for whom, in what role, and what the person has changed since.
class ReviewMark {
  const ReviewMark({
    required this.novelId,
    required this.memberId,
    required this.memberName,
    required this.role,
    required this.ownerName,
    required this.title,
    required this.madeAt,
    required this.changed,
  });

  static ReviewMark? of(JsonMap project) {
    final m = mapOrNull(project['review']);
    final role = Role.of(m?['role']);
    if (m == null || role == null || role == Role.owner || role == Role.coauthor) return null;
    return ReviewMark(
      novelId: str(m['novelId']),
      memberId: str(m['memberId']),
      memberName: str(m['memberName']),
      role: role,
      ownerName: str(m['ownerName']),
      title: str(m['title']),
      madeAt: numOrNull(m['madeAt']) ?? 0,
      changed: [for (final k in (m['changed'] as List? ?? const [])) str(k)],
    );
  }

  /// The owner's novel this is a copy of.
  final String novelId;
  final String memberId;
  final String memberName;
  final Role role;
  final String ownerName;

  /// The novel's title when the copy was made.
  final String title;
  final num madeAt;

  /// `<collection>:<id>` of each record the person has added, changed or deleted in this copy: what their feedback
  /// file carries back.
  final List<String> changed;

  Me get me => (id: memberId, name: memberName, role: role);

  JsonMap toJson() => {
    'novelId': novelId,
    'memberId': memberId,
    'memberName': memberName,
    'role': role.name,
    'ownerName': ownerName,
    'title': title,
    'madeAt': madeAt,
    'changed': changed,
  };
}

/// The review copy's own id in a library: one per novel and person, so a newer copy replaces the older.
String reviewCopyId(String novelId, String memberId) => '$novelId-review-$memberId';

/// A review copy of [novel] for [member]: every record their role may see, as it may see it, and nothing else.
NovelSnapshot makeReviewCopy(NovelSnapshot novel, Member member, {required String ownerName, required num now}) {
  if (member.revoked) throw const PermissionException('This person has been removed from the novel.');
  if (!reviewRoles.contains(member.role)) {
    throw PermissionException(
      'A review copy is made for an editor, a beta reader or a viewer, not a ${member.role.label}.',
    );
  }
  final localId = reviewCopyId(novel.projectId, member.id);
  JsonMap? lookup(String key) {
    final at = key.indexOf(':');
    final table = key.substring(0, at);
    final id = key.substring(at + 1);
    return novel.rows(table).where((r) => r['id'] == id).firstOrNull;
  }

  final project = visible(member.role, member.id, 'projects:${novel.projectId}', novel.project, lookup)!;
  final collections = <String, List<JsonMap>>{};
  for (final e in novel.collections.entries) {
    final rows = [
      for (final row in e.value)
        if (visible(member.role, member.id, '${e.key}:${str(row['id'])}', row, lookup) case final seen?)
          {...seen, if (seen.containsKey('projectId')) 'projectId': localId},
    ];
    if (rows.isNotEmpty) collections[e.key] = rows;
  }
  final mark = ReviewMark(
    novelId: novel.projectId,
    memberId: member.id,
    memberName: member.name,
    role: member.role,
    ownerName: ownerName,
    title: str(novel.project['title']),
    madeAt: now,
    changed: const [],
  );
  return NovelSnapshot(
    project: {...project, 'id': localId, 'pinned': false, 'archived': false, 'review': mark.toJson()},
    collections: collections,
  );
}

/// A newer review copy taking the place of the one held: what the owner sends wins, except the person's own changes
/// not yet in it (written after their last feedback, or since changed again), which are kept with their mark.
NovelSnapshot mergeReviewCopy(NovelSnapshot incoming, NovelSnapshot? held) {
  final next = ReviewMark.of(incoming.project);
  if (next == null) throw SnapshotException('it is not a review copy');
  final was = held == null ? null : ReviewMark.of(held.project);
  if (held == null || was == null) return incoming;
  if (was.novelId != next.novelId || was.memberId != next.memberId) return incoming;
  if (next.madeAt < was.madeAt) {
    throw SnapshotException('it is an older review copy than the one already here, so nothing was changed');
  }
  var result = incoming;
  final stillChanged = <String>[];
  for (final key in was.changed) {
    final at = key.indexOf(':');
    final table = key.substring(0, at);
    final id = key.substring(at + 1);
    final mine = held.rows(table).where((r) => r['id'] == id).firstOrNull;
    final theirs = incoming.rows(table).where((r) => r['id'] == id).firstOrNull;
    if (mine == null) {
      // Deleted here: stays deleted while the owner still has it.
      if (theirs != null) {
        result = result.withRows(table, [
          for (final r in result.rows(table))
            if (r['id'] != id) r,
        ]);
        stillChanged.add(key);
      }
      continue;
    }
    final newer =
        theirs == null ||
        (numOrNull(mine['updatedAt'] ?? mine['at']) ?? 0) > (numOrNull(theirs['updatedAt'] ?? theirs['at']) ?? 0);
    if (newer && !jsonEquals(mine, theirs)) {
      result = result.putRow(table, {...mine, 'projectId': incoming.projectId});
      stillChanged.add(key);
    }
  }
  return result.copyWith(
    project: {
      ...result.project,
      'review': ReviewMark(
        novelId: next.novelId,
        memberId: next.memberId,
        memberName: next.memberName,
        role: next.role,
        ownerName: next.ownerName,
        title: next.title,
        madeAt: next.madeAt,
        changed: stillChanged,
      ).toJson(),
    },
  );
}

const feedbackFormat = 'novel-builder/review-feedback';

/// The feedback file of a review copy: each record the person added, changed or deleted, nothing else.
JsonMap makeFeedback(NovelSnapshot copy, {required num now}) {
  final mark = ReviewMark.of(copy.project);
  if (mark == null) throw const CollabException('This novel is not a review copy.');
  return {
    'format': feedbackFormat,
    'version': 1,
    'novelId': mark.novelId,
    'title': mark.title,
    'memberId': mark.memberId,
    'memberName': mark.memberName,
    'role': mark.role.name,
    'copyMadeAt': mark.madeAt,
    'sentAt': now,
    'changes': [
      for (final key in mark.changed)
        () {
          final at = key.indexOf(':');
          final table = key.substring(0, at);
          final id = key.substring(at + 1);
          final row = copy.rows(table).where((r) => r['id'] == id).firstOrNull;
          return {
            'collection': table,
            'id': id,
            'row': row == null ? null : {...row, if (row.containsKey('projectId')) 'projectId': mark.novelId},
          };
        }(),
    ],
  };
}

String feedbackFileText(JsonMap feedback) => const JsonEncoder.withIndent('  ').convert(feedback);

/// What a feedback file would do, worked out before anything is written.
class FeedbackPreview {
  const FeedbackPreview({
    required this.novelId,
    required this.member,
    required this.sentAt,
    required this.writes,
    required this.refused,
    required this.unchanged,
  });

  final String novelId;
  final Member member;
  final num sentAt;

  /// The records to write, each only if the stored record is still as read.
  final List<CollabWrite> writes;

  /// Changes the person's role may not make, with the reason; none of them is written.
  final List<({String what, String reason})> refused;

  /// Changes the novel already holds.
  final int unchanged;

  int count(String collection, {bool Function(JsonMap row)? where}) =>
      writes.where((w) => w.collection == collection && w.value != null && (where == null || where(w.value!))).length;
}

/// Reads a feedback file against the owner's novel. Every change is judged by the role the OWNER gave the person (not
/// what the file says), with the rule the original app's relay applied; only conversations, suggestions and the
/// activity record ever come back. Nothing is written here.
FeedbackPreview readFeedback(
  String text, {
  required String novelId,
  required List<Member> members,
  required JsonMap? Function(String collection, String id) stored,
}) {
  final Object? data;
  try {
    data = jsonDecode(text);
  } on FormatException {
    throw const CollabException('This file is not a feedback file: it could not be read. Nothing was changed.');
  }
  final file = mapOrNull(data);
  if (file == null || file['format'] != feedbackFormat) {
    throw const CollabException('This file is not a feedback file from a review copy. Nothing was changed.');
  }
  if ((numOrNull(file['version']) ?? 0) > 1) {
    throw const CollabException(
      'This feedback file was made by a newer version of Novel Builder. Nothing was changed.',
    );
  }
  if (file['novelId'] != novelId) {
    throw CollabException(
      'This feedback is about another novel (“${str(file['title'], 'untitled')}”). Open that novel to bring it in. Nothing was changed.',
    );
  }
  final member = members.where((m) => m.id == file['memberId']).firstOrNull;
  if (member == null) {
    throw CollabException(
      'This feedback is from ${str(file['memberName'], 'someone')}, who is not on this novel’s team. Nothing was changed.',
    );
  }
  if (member.revoked) {
    throw CollabException(
      '${member.name} has been removed from this novel, so their feedback is not taken in. Nothing was changed.',
    );
  }
  const kinds = {'comments': 'A comment', 'suggestions': 'A suggestion', 'activity': 'A line of the activity record'};
  final writes = <CollabWrite>[];
  final refused = <({String what, String reason})>[];
  var unchanged = 0;
  for (final change in maps(file['changes'])) {
    final collection = str(change['collection']);
    final id = str(change['id']);
    final row = mapOrNull(change['row']);
    final what = kinds[collection] ?? 'A record in $collection';
    if (!kinds.containsKey(collection)) {
      refused.add((
        what: what,
        reason: 'Only conversations, suggestions and the activity record come back in feedback.',
      ));
      continue;
    }
    if (row != null && (row['id'] != id || (row.containsKey('projectId') && row['projectId'] != novelId))) {
      refused.add((what: what, reason: 'It does not belong to this novel.'));
      continue;
    }
    final before = stored(collection, id);
    if (jsonEquals(before, row) || (before == null && row == null)) {
      unchanged++;
      continue;
    }
    final reason = refusal(member.role, member.id, '$collection:$id', before, row);
    if (reason != null) {
      refused.add((what: what, reason: reason));
      continue;
    }
    writes.add((collection: collection, id: id, value: row, before: before));
  }
  return FeedbackPreview(
    novelId: novelId,
    member: member,
    sentAt: numOrNull(file['sentAt']) ?? 0,
    writes: writes,
    refused: refused,
    unchanged: unchanged,
  );
}

/// A new person on the team.
JsonMap newMember({
  required String projectId,
  required String name,
  required String email,
  required Role role,
  required num now,
  required String id,
}) {
  if (name.trim().isEmpty) throw const CollabException('Give the person a name.');
  if (!reviewRoles.contains(role)) throw const CollabException('Choose Editor, Beta reader or Viewer.');
  return {
    'id': id,
    'projectId': projectId,
    'name': name.trim(),
    'email': email.trim(),
    'role': role.name,
    'status': 'invited',
    'createdAt': now,
    'joinedAt': null,
    'lastSyncAt': null,
    'updatedAt': now,
  };
}
