import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/backup_files.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collab/access.dart';
import '../../shared/domain/collab/collab_changes.dart' hide reply;
import '../../shared/domain/collab/collab_changes.dart' as changes show reply;
import '../../shared/domain/collab/records.dart';
import '../../shared/domain/collab/review_files.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../workspace/open_novel.dart';
import '../write/write_providers.dart';

/// The open novel's review mark, when it is a review copy; null for the person's own novel.
final reviewMarkProvider = Provider<ReviewMark?>((ref) {
  final id = ref.watch(openNovelProvider);
  if (id == null) return null;
  final store = ref.watch(novelStoreProvider);
  ReviewMark? read() => switch (store.novel(id)) {
    final novel? => ReviewMark.of(novel.raw),
    null => null,
  };
  void update() => ref.invalidateSelf();
  // Only whether it is a review copy, and of what, matters here: a new mark object each save is not a change.
  var last = read();
  void listener() {
    final next = read();
    if ((next == null) != (last == null) || next?.memberId != last?.memberId || next?.madeAt != last?.madeAt) {
      last = next;
      update();
    }
  }

  store.addListener(listener);
  ref.onDispose(() => store.removeListener(listener));
  return last;
});

/// Who the person at this device is in the open novel: the person a review copy was made for, or the novel's owner.
Me meIn(Novel novel) {
  final mark = ReviewMark.of(novel.raw);
  if (mark != null) return mark.me;
  return (id: ownerId, name: novel.author.trim().isEmpty ? 'The author' : novel.author.trim(), role: Role.owner);
}

/// The team's records of the open novel, read from storage and refreshed after every change.
class CollabData {
  const CollabData({
    required this.novelId,
    required this.novel,
    required this.me,
    required this.members,
    required this.comments,
    required this.suggestions,
    required this.activity,
  });

  final String novelId;
  final Novel novel;
  final Me me;
  final List<Member> members;
  final List<Comment> comments;
  final List<Suggestion> suggestions;
  final List<Activity> activity;

  List<Thread> threads({String? targetKey}) => threadsOf(comments, targetKey: targetKey);
  List<Suggestion> get open => [
    for (final s in suggestions)
      if (s.isOpen) s,
  ];
}

class CollabNotifier extends Notifier<CollabData?> {
  @override
  CollabData? build() {
    final id = ref.watch(openNovelProvider);
    if (id == null) return null;
    final store = ref.watch(novelStoreProvider);
    CollabData? read() {
      final novel = store.novel(id);
      if (novel == null) return null;
      return CollabData(
        novelId: id,
        novel: novel,
        me: meIn(novel),
        members: [for (final r in store.rowsIn(id, 'members')) Member(r)]
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt)),
        comments: [for (final r in store.rowsIn(id, 'comments')) Comment(r)],
        suggestions: [for (final r in store.rowsIn(id, 'suggestions')) Suggestion(r)]
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt)),
        activity: [for (final r in store.rowsIn(id, 'activity')) Activity(r)]..sort((a, b) => b.at.compareTo(a.at)),
      );
    }

    void update() {
      if (store.exists(id)) state = read();
    }

    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return read();
  }
}

final collabProvider = NotifierProvider.autoDispose<CollabNotifier, CollabData?>(CollabNotifier.new);

String _safe(String s) => s.trim().replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '').replaceAll(RegExp(r'\s+'), ' ');

/// Everything people do with conversations, suggestions, the team and the files that carry them. Each change is
/// saved whole or not at all, and only if the records it changes are still as they were read.
class CollabActions {
  CollabActions(this.ref);
  final Ref ref;

  NovelStore get _store => ref.read(novelStoreProvider);
  num get _now => DateTime.now().millisecondsSinceEpoch;

  CollabData _data() => ref.read(collabProvider) ?? (throw const CollabException('Open a novel first.'));

  void _write(String novelId, List<CollabWrite> writes) {
    if (writes.isEmpty) return;
    _store.writeRows(novelId, [
      for (final w in writes)
        w.value == null
            ? RowWrite.delete(w.collection, w.id, expect: w.before)
            : RowWrite.put(w.collection, w.value!, expect: w.before),
    ]);
  }

  /// A comment, a reaction or a feedback form about [target].
  void comment(
    JsonMap target, {
    required String targetLabel,
    required String body,
    String kind = 'comment',
    Map<String, num>? ratings,
  }) {
    final d = _data();
    _write(
      d.novelId,
      newComment(
        d.me,
        projectId: d.novelId,
        target: target,
        targetLabel: targetLabel,
        body: body,
        kind: kind,
        ratings: ratings,
        now: _now,
        newId: newId,
        activity: d.activity,
      ),
    );
  }

  void reply(Comment root, String body) {
    final d = _data();
    _write(d.novelId, changes.reply(d.me, root, body: body, now: _now, newId: newId, activity: d.activity));
  }

  void setResolved(Comment root, bool resolved) {
    final d = _data();
    _write(d.novelId, setThreadStatus(d.me, root, resolved: resolved, now: _now, newId: newId, activity: d.activity));
  }

  void remove(Comment row) {
    final d = _data();
    _write(d.novelId, removeComment(d.me, row, d.comments, now: _now));
  }

  /// Keeps this person's suggested text for a chapter (or withdraws it, when the text is back as it was found).
  void saveText({
    required String chapterId,
    required String chapterTitle,
    required JsonMap base,
    required JsonMap proposed,
  }) {
    final d = _data();
    _write(
      d.novelId,
      saveTextSuggestion(
        d.me,
        projectId: d.novelId,
        chapterId: chapterId,
        chapterTitle: chapterTitle,
        base: base,
        proposed: proposed,
        existing: [
          for (final s in d.suggestions)
            if (s.targetId == chapterId) s,
        ],
        now: _now,
        newId: newId,
        activity: d.activity,
      ),
    );
  }

  void suggestEntry({
    required String entryId,
    required String entryName,
    required List<({String field, String label, String from, String to})> changes,
    String note = '',
  }) {
    final d = _data();
    _write(
      d.novelId,
      suggestFields(
        d.me,
        projectId: d.novelId,
        entryId: entryId,
        entryName: entryName,
        changes: changes,
        note: note,
        now: _now,
        newId: newId,
        activity: d.activity,
      ),
    );
  }

  void withdraw(Suggestion s) {
    final d = _data();
    _write(d.novelId, [withdrawSuggestion(d.me, s)]);
  }

  /// Accepts or rejects one change of a text suggestion. An accepted change is saved through the ordinary save, so
  /// the text it replaces goes to version history; the change and its verdict are saved together, or neither.
  void decideText(Suggestion s, String hunkId, {required bool accept}) {
    final d = _data();
    final content = _store.row(d.novelId, 'chapterContents', s.targetId);
    final result = decideHunk(
      d.me,
      s,
      hunkId,
      accept: accept,
      currentDoc: content?['doc'],
      now: _now,
      newId: newId,
      activity: d.activity,
    );
    _store.db.transaction(() {
      if (result.doc case final doc?) {
        ref
            .read(manuscriptServiceProvider)
            .save(
              d.novelId,
              s.targetId,
              doc,
              baseRev: intOrNull(content?['rev']) ?? 0,
              reason: 'suggestion',
              label: 'Before accepting a change suggested by ${s.authorName}',
            );
      }
      _write(d.novelId, result.writes);
    });
  }

  void decideEntry(Suggestion s, {required bool accept}) {
    final d = _data();
    _write(
      d.novelId,
      decideFields(
        d.me,
        s,
        accept: accept,
        entry: _store.row(d.novelId, 'loreEntries', s.targetId),
        now: _now,
        newId: newId,
        activity: d.activity,
      ),
    );
  }

  // ---------------------------------------------------------------- the team (the owner)

  Member addMember({required String name, required String email, required Role role}) {
    final d = _data();
    if (d.me.role != Role.owner) throw const PermissionException('Only the owner manages who is on the project.');
    final row = newMember(projectId: d.novelId, name: name, email: email, role: role, now: _now, id: newId());
    _store.writeRows(d.novelId, [RowWrite.put('members', row, expect: null)]);
    return Member(row);
  }

  void updateMember(Member m, JsonMap changes) {
    final d = _data();
    _store.writeRows(d.novelId, [
      RowWrite.put('members', {...m.toJson(), ...changes, 'updatedAt': _now}, expect: m.toJson()),
    ]);
  }

  /// Makes a review copy for [m] and hands it to the place the author picks. Returns what happened, or null when they
  /// cancel.
  Future<String?> sendReviewCopy(Member m, {Rect? origin}) async {
    final d = _data();
    final novel = _store.load(d.novelId) ?? (throw const CollabException('The novel is no longer in the library.'));
    final copy = makeReviewCopy(novel, m, ownerName: d.me.name, now: _now);
    final title = _safe(d.novel.title).isEmpty ? 'Untitled novel' : _safe(d.novel.title);
    final text = const JsonEncoder.withIndent('  ').convert(copy.toJson(exportedAt: _now));
    final result = await ref
        .read(backupFilesProvider)
        .saveFile(
          '$title - review copy for ${_safe(m.name)}.novel.json',
          Uint8List.fromList(utf8.encode(text)),
          kind: FileKind.json,
          origin: origin,
        );
    if (result != null && m.status == 'invited') updateMember(m, {});
    return result;
  }

  /// Reads a feedback file against the open novel. Nothing is written.
  FeedbackPreview previewFeedback(String text) {
    final d = _data();
    if (d.me.role != Role.owner) {
      throw const CollabException('Feedback comes back to the novel’s owner. This is a review copy.');
    }
    return readFeedback(
      text,
      novelId: d.novelId,
      members: d.members,
      stored: (collection, id) => _store.row(d.novelId, collection, id),
    );
  }

  /// Takes in what a previewed feedback file holds, and notes when feedback last came from that person.
  void importFeedback(FeedbackPreview preview) {
    final d = _data();
    final member = d.members.where((m) => m.id == preview.member.id).first;
    _store.db.transaction(() {
      _write(d.novelId, preview.writes);
      _store.writeRows(d.novelId, [
        RowWrite.put('members', {
          ...member.toJson(),
          'status': 'active',
          'joinedAt': member.raw['joinedAt'] ?? _now,
          'lastSyncAt': _now,
          'updatedAt': _now,
        }, expect: member.toJson()),
      ]);
    });
  }

  // ---------------------------------------------------------------- a review copy (the person reviewing)

  /// Makes this review copy's feedback file and hands it to the place the person picks.
  Future<String?> sendFeedback({Rect? origin}) async {
    final d = _data();
    final copy = _store.load(d.novelId) ?? (throw const CollabException('The review copy is no longer here.'));
    final mark = ReviewMark.of(copy.project) ?? (throw const CollabException('This novel is not a review copy.'));
    final feedback = makeFeedback(copy, now: _now);
    final title = _safe(mark.title).isEmpty ? 'Untitled novel' : _safe(mark.title);
    return ref
        .read(backupFilesProvider)
        .saveFile(
          '$title - feedback from ${_safe(mark.memberName)}.json',
          Uint8List.fromList(utf8.encode(feedbackFileText(feedback))),
          kind: FileKind.json,
          origin: origin,
        );
  }
}

final collabActionsProvider = Provider<CollabActions>(CollabActions.new);

/// Brings a review copy into the library: a first one as it is; a newer one in place of the one held, keeping the
/// person's own changes not yet sent. Returns the review copy's id.
String openReviewCopy(NovelStore store, NovelSnapshot incoming) {
  final held = store.load(incoming.projectId);
  store.putNovel(mergeReviewCopy(incoming, held));
  return incoming.projectId;
}
