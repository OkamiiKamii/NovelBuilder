import '../json.dart';
import '../json_record.dart';
import 'access.dart';
import 'hunks.dart';

/// The owner's id on every device: the novel's own author. A review copy's person has the id the owner gave them.
const ownerId = 'owner';

/// Who the person at this device is, in one novel: its owner, or, in a review copy, the person it was made for.
typedef Me = ({String id, String name, Role role});

const reactions = ['Loved this', 'Laughed', 'Tense', 'Moved', 'Confused', 'Lost interest', 'Did not believe it'];
const feedbackQuestions = [
  (key: 'pacing', label: 'Pacing'),
  (key: 'clarity', label: 'Clarity'),
  (key: 'engagement', label: 'Wanted to keep reading'),
];

/// What a conversation is about, as stored (`target` on a comment):
/// `{kind: text, chapterId, quote, block, offset}`, `{kind: chapter, chapterId}`, `{kind: entry, entryId}`,
/// `{kind: thread, threadId}` or `{kind: beat, threadId, beatId}`.
String targetKeyOf(JsonMap target) => switch (target['kind']) {
  'entry' => 'entry:${str(target['entryId'])}',
  'thread' || 'beat' => 'thread:${str(target['threadId'])}',
  _ => 'chapter:${str(target['chapterId'])}',
};

/// Someone on the novel's team, kept by the owner.
class Member extends JsonRecord {
  Member(super.raw);
  String get name => str(raw['name']);
  String get email => str(raw['email']);
  Role get role => Role.of(raw['role']) ?? Role.viewer;

  /// `invited`, `active` or `revoked`.
  String get status => str(raw['status'], 'invited');
  bool get revoked => status == 'revoked';

  /// When feedback from them was last brought in (the original's last sync), or null.
  num? get lastSyncAt => numOrNull(raw['lastSyncAt']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}

/// One message. The first of a conversation has no parent and carries the conversation's state; replies point at it.
class Comment extends JsonRecord {
  Comment(super.raw);
  String get threadId => str(raw['threadId'], id);
  String get threadAuthorId => str(raw['threadAuthorId']);
  String? get parentId => raw['parentId'] as String?;
  bool get isRoot => parentId == null;
  JsonMap get target => mapOrNull(raw['target']) ?? const {};
  String get targetKey => str(raw['targetKey']);
  String get targetLabel => str(raw['targetLabel']);

  /// `comment`, `reaction` or `feedback`.
  String get kind => str(raw['kind'], 'comment');
  String get body => str(raw['body']);
  Map<String, num> get ratings => {
    for (final e in (mapOrNull(raw['ratings']) ?? const {}).entries) e.key: ?numOrNull(e.value),
  };
  String get authorId => str(raw['authorId']);
  String get authorName => str(raw['authorName']);
  Role get authorRole => Role.of(raw['authorRole']) ?? Role.viewer;
  bool get resolved => raw['status'] == 'resolved';
  String? get resolvedBy => raw['resolvedBy'] as String?;
  bool get deleted => raw['deleted'] == true;
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;

  /// The words a comment on a passage was about.
  String get quote => target['kind'] == 'text' ? str(target['quote']) : '';
}

typedef Thread = ({Comment root, List<Comment> replies});

/// Conversations, oldest first, each with its replies; only those about [targetKey] when it is given.
List<Thread> threadsOf(Iterable<Comment> comments, {String? targetKey}) {
  final rows = [
    for (final c in comments)
      if (targetKey == null || c.targetKey == targetKey) c,
  ];
  final roots = rows.where((c) => c.isRoot).toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  return [
    for (final root in roots)
      (
        root: root,
        replies: rows.where((c) => c.threadId == root.id && !c.isRoot).toList()
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt)),
      ),
  ];
}

/// A proposed change to a chapter's text (`kind: text`, with the chapter as found and as its writer would have it) or
/// to a codex entry (`kind: fields`). Neither touches the book: only an author's verdict does, one change at a time.
class Suggestion extends JsonRecord {
  Suggestion(super.raw);
  bool get isText => raw['kind'] == 'text';
  String get targetId => str(raw['targetId']);
  String get targetLabel => str(raw['targetLabel']);
  String get authorId => str(raw['authorId']);
  String get authorName => str(raw['authorName']);
  String get note => str(raw['note']);
  Object? get base => raw['base'];
  Object? get proposed => raw['proposed'];
  List<({String field, String label, String from, String to})> get changes => [
    for (final c in maps(raw['changes']))
      (field: str(c['field']), label: str(c['label']), from: str(c['from']), to: str(c['to'])),
  ];

  /// `pending`, `accepted` or `rejected`.
  String get status => str(raw['status'], 'pending');
  JsonMap get decisions => mapOrNull(raw['decisions']) ?? const {};
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;

  /// The changes of a text suggestion that no author has ruled on yet.
  List<Hunk> get openHunks => isText
      ? [
          for (final h in textHunks(base, proposed))
            if (!decisions.containsKey(h.id)) h,
        ]
      : const [];

  /// Whether anything in it is still waiting for a verdict.
  bool get isOpen => isText ? openHunks.isNotEmpty : status == 'pending';
}

/// One line of the record of who did what.
class Activity extends JsonRecord {
  Activity(super.raw);
  num get at => numOrNull(raw['at']) ?? 0;
  String get actorId => str(raw['actorId']);
  String get actorName => str(raw['actorName']);
  Role get actorRole => Role.of(raw['actorRole']) ?? Role.viewer;
  String get verb => str(raw['verb']);
  String get label => str(raw['label']);
  int get count => (numOrNull(raw['count']) ?? 1).toInt();
  String get table => str(raw['table']);
  String get rowId => str(raw['rowId']);
}
