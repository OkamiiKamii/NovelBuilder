// Review by file, end to end at the level of the library: the owner makes a review copy for a person and role, the
// person comments and suggests in it (and cannot change the book), their feedback file comes back, every change in
// it is judged by the role the owner gave them, and an accepted change lands on the chapter as it is now.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/collab/access.dart';
import 'package:novel_builder/shared/domain/collab/collab_changes.dart';
import 'package:novel_builder/shared/domain/collab/records.dart';
import 'package:novel_builder/shared/domain/collab/review_files.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';
const _chapter = '4fee0c33-10ac-413e-a828-941049a681a0';

void main() {
  late NovelStore owner;
  late NovelStore reviewer;
  var clock = 1800000000000;
  var ids = 0;
  String id() => 'id-${ids++}';
  num now() => clock += 1000;

  setUp(() {
    owner = NovelStore(AppDatabase.inMemory());
    reviewer = NovelStore(AppDatabase.inMemory());
    owner.putNovel(loadFixture('made-in-the-app'));
  });
  tearDown(() {
    owner.db.close();
    reviewer.db.close();
  });

  void write(NovelStore store, String novelId, List<CollabWrite> writes) => store.writeRows(novelId, [
    for (final w in writes)
      w.value == null
          ? RowWrite.delete(w.collection, w.id, expect: w.before)
          : RowWrite.put(w.collection, w.value!, expect: w.before),
  ]);

  Member addMember(String name, Role role) {
    final row = newMember(projectId: _novel, name: name, email: '', role: role, now: now(), id: id());
    owner.writeRows(_novel, [RowWrite.put('members', row, expect: null)]);
    return Member(row);
  }

  NovelSnapshot copyFor(Member m) => makeReviewCopy(owner.load(_novel)!, m, ownerName: 'The author', now: now());

  test('a review copy holds only what the role may see', () {
    final full = owner.load(_novel)!;
    final reader = copyFor(addMember('Ria', Role.reader));
    final editor = copyFor(addMember('Sam', Role.editor));
    final viewer = copyFor(addMember('Vic', Role.viewer));
    // A beta reader gets the manuscript only: no codex, plans, secrets, team emails or private history.
    expect(reader.rows('chapters').length, full.rows('chapters').length);
    expect(reader.rows('chapterContents').length, full.rows('chapterContents').length);
    for (final c in ['loreEntries', 'chapterPlans', 'plotThreads', 'characterSecrets', 'chapterRevisions', 'goals']) {
      expect(reader.rows(c), isEmpty, reason: c);
    }
    expect(reader.rows('chapters').every((r) => str(r['summary']).isEmpty && str(r['notes']).isEmpty), isTrue);
    expect(reader.rows('members').map((m) => m['name']), ['Ria'], reason: 'a reader sees only themselves on the team');
    // An editor sees the codex and plans, but never an entry's private notes or the secrets.
    expect(editor.rows('loreEntries').length, full.rows('loreEntries').length);
    expect(editor.rows('loreEntries').every((e) => str(e['notes']).isEmpty), isTrue);
    expect(full.rows('loreEntries').any((e) => str(e['notes']).isNotEmpty), isTrue);
    expect(editor.rows('characterSecrets'), isEmpty);
    expect(editor.rows('chapterPlans'), isNotEmpty);
    expect(editor.rows('members').every((m) => str(m['email']).isEmpty), isTrue);
    // A viewer reads only what is marked final or published: this novel has none yet.
    expect(viewer.rows('chapterContents'), isEmpty);
    // Each is marked, has its own id, and is the standard backup format.
    expect(ReviewMark.of(reader.project)!.role, Role.reader);
    expect(reader.projectId, isNot(_novel));
    expect(reader.toJson()['format'], NovelSnapshot.format);
    expect(NovelSnapshot.fromJson(jsonDecode(jsonEncode(reader.toJson()))).project['review'], isNotNull);
  });

  test('in a review copy the book cannot be changed; comments and (for an editor) suggestions can', () {
    final ria = addMember('Ria', Role.reader);
    final copy = copyFor(ria);
    reviewer.putNovel(copy);
    final local = copy.projectId;
    final text = reviewer.row(local, 'chapterContents', _chapter)!;
    expect(
      () => reviewer.writeRows(local, [
        RowWrite.put('chapterContents', {...text, 'doc': textToDoc('Mine now.')}),
      ]),
      throwsA(isA<PermissionException>()),
    );
    expect(reviewer.row(local, 'chapterContents', _chapter), text, reason: 'nothing was written');
    final chapter = reviewer.row(local, 'chapters', _chapter)!;
    expect(
      () => reviewer.writeRows(local, [
        RowWrite.put('chapters', {...chapter, 'title': 'Renamed'}),
      ]),
      throwsA(isA<PermissionException>()),
    );
    final me = ReviewMark.of(copy.project)!.me;
    write(
      reviewer,
      local,
      newComment(
        me,
        projectId: local,
        target: {'kind': 'text', 'chapterId': _chapter, 'quote': 'x', 'block': 0, 'offset': 0},
        targetLabel: 'One',
        body: 'Lovely.',
        now: now(),
        newId: id,
      ),
    );
    expect(ReviewMark.of(reviewer.novel(local)!.raw)!.changed.length, 2, reason: 'the comment and its activity line');
    // A reader does not suggest.
    expect(
      () => saveTextSuggestion(
        me,
        projectId: local,
        chapterId: _chapter,
        chapterTitle: 'One',
        base: textToDoc('a'),
        proposed: textToDoc('b'),
        existing: const [],
        now: now(),
        newId: id,
      ),
      throwsA(isA<PermissionException>()),
    );
    // The novel's own details cannot be changed either.
    expect(
      () => reviewer.putNovelDetails(reviewer.novel(local)!.withFields({'title': 'Mine'})),
      throwsA(isA<PermissionException>()),
    );
    reviewer.putNovelDetails(reviewer.novel(local)!.withFields({'pinned': true}));
  });

  test('feedback comes back: the person\'s changes are taken in, anything their role may not do is refused', () {
    final sam = addMember('Sam', Role.editor);
    final copy = copyFor(sam);
    reviewer.putNovel(copy);
    final local = copy.projectId;
    final me = ReviewMark.of(copy.project)!.me;
    final base = reviewer.row(local, 'chapterContents', _chapter)!['doc']! as JsonMap;
    final paragraphs = maps(base['content']);
    final proposed = {
      ...base,
      'content': [paragraphs[0], maps(textToDoc('A better middle.')['content']).first, ...paragraphs.sublist(2)],
    };
    write(
      reviewer,
      local,
      saveTextSuggestion(
        me,
        projectId: local,
        chapterId: _chapter,
        chapterTitle: 'The chapter',
        base: base,
        proposed: proposed,
        existing: const [],
        now: now(),
        newId: id,
      ),
    );
    write(
      reviewer,
      local,
      newComment(
        me,
        projectId: local,
        target: {'kind': 'chapter', 'chapterId': _chapter},
        targetLabel: 'The chapter',
        body: 'Strong ending.',
        now: now(),
        newId: id,
      ),
    );
    final feedback = makeFeedback(reviewer.load(local)!, now: now());
    // Tampering with the file by hand: a change to the text itself, a comment signed as the owner, and a suggestion
    // already marked accepted. Each is refused; the honest changes still come in.
    final changes = maps(feedback['changes']).toList();
    final text = owner.row(_novel, 'chapterContents', _chapter)!;
    changes
      ..add({
        'collection': 'chapterContents',
        'id': _chapter,
        'row': {...text, 'doc': textToDoc('Hacked.')},
      })
      ..add({
        'collection': 'comments',
        'id': 'forged',
        'row': {
          ...mapOrNull(changes.firstWhere((c) => c['collection'] == 'comments')['row'])!,
          'id': 'forged',
          'threadId': 'forged',
          'authorId': ownerId,
          'threadAuthorId': ownerId,
        },
      })
      ..add({
        'collection': 'suggestions',
        'id': 'pre-accepted',
        'row': {
          ...mapOrNull(changes.firstWhere((c) => c['collection'] == 'suggestions')['row'])!,
          'id': 'pre-accepted',
          'status': 'accepted',
        },
      });
    final preview = readFeedback(
      jsonEncode({...feedback, 'changes': changes}),
      novelId: _novel,
      members: [for (final r in owner.rowsIn(_novel, 'members')) Member(r)],
      stored: (c, i) => owner.row(_novel, c, i),
    );
    expect(preview.member.name, 'Sam');
    expect(preview.count('comments'), 1);
    expect(preview.count('suggestions'), 1);
    expect(preview.refused.map((r) => r.reason), [
      'Only conversations, suggestions and the activity record come back in feedback.',
      'A comment is signed by whoever wrote it.',
      'A suggestion starts out pending, in its writer’s name.',
    ]);
    expect(owner.row(_novel, 'chapterContents', _chapter), text, reason: 'reading the file changes nothing');
    write(owner, _novel, preview.writes);
    expect(owner.row(_novel, 'chapterContents', _chapter), text, reason: 'taking it in changes nothing in the book');

    // The owner accepts the change: it lands on the chapter as it is now.
    const owned = (id: ownerId, name: 'The author', role: Role.owner);
    final suggestion = Suggestion(owner.rowsIn(_novel, 'suggestions').firstWhere((s) => s['authorId'] == sam.id));
    final hunk = suggestion.openHunks.single;
    final decided = decideHunk(
      owned,
      suggestion,
      hunk.id,
      accept: true,
      currentDoc: owner.row(_novel, 'chapterContents', _chapter)!['doc'],
      now: now(),
      newId: id,
    );
    expect(blockTexts(decided.doc)[1], 'A better middle.');
    expect(Suggestion(decided.writes.first.value!).status, 'accepted');
  });

  test('a change to a passage rewritten since is not applied, and says so', () {
    final sam = addMember('Sam', Role.editor);
    final me = (id: sam.id, name: 'Sam', role: Role.editor);
    final base = owner.row(_novel, 'chapterContents', _chapter)!['doc']! as JsonMap;
    final proposed = {
      ...base,
      'content': [maps(textToDoc('Changed first.')['content']).first, ...maps(base['content']).skip(1)],
    };
    final s = Suggestion(
      saveTextSuggestion(
        me,
        projectId: _novel,
        chapterId: _chapter,
        chapterTitle: 'X',
        base: base,
        proposed: proposed,
        existing: const [],
        now: now(),
        newId: id,
      ).first.value!,
    );
    final rewritten = {
      ...base,
      'content': [maps(textToDoc('The author rewrote this.')['content']).first, ...maps(base['content']).skip(1)],
    };
    expect(
      () => decideHunk(
        (id: ownerId, name: 'A', role: Role.owner),
        s,
        s.openHunks.single.id,
        accept: true,
        currentDoc: rewritten,
        now: now(),
        newId: id,
      ),
      throwsA(isA<CollabException>().having((e) => e.message, 'message', contains('rewritten since'))),
    );
    // Rejecting is always possible.
    final rejected = decideHunk(
      (id: ownerId, name: 'A', role: Role.owner),
      s,
      s.openHunks.single.id,
      accept: false,
      currentDoc: rewritten,
      now: now(),
      newId: id,
    );
    expect(rejected.doc, isNull);
    expect(Suggestion(rejected.writes.first.value!).status, 'rejected');
  });

  test('feedback from someone removed from the team, or about another novel, changes nothing', () {
    final ria = addMember('Ria', Role.reader);
    final copy = copyFor(ria);
    reviewer.putNovel(copy);
    final feedback = jsonEncode(makeFeedback(copy, now: now()));
    final row = owner.row(_novel, 'members', ria.id)!;
    owner.writeRows(_novel, [
      RowWrite.put('members', {...row, 'status': 'revoked'}, expect: row),
    ]);
    final members = [for (final r in owner.rowsIn(_novel, 'members')) Member(r)];
    expect(
      () => readFeedback(feedback, novelId: _novel, members: members, stored: (c, i) => owner.row(_novel, c, i)),
      throwsA(isA<CollabException>().having((e) => e.message, 'message', contains('removed'))),
    );
    expect(
      () => readFeedback(feedback, novelId: 'another', members: members, stored: (c, i) => null),
      throwsA(isA<CollabException>().having((e) => e.message, 'message', contains('another novel'))),
    );
    expect(
      () =>
          readFeedback('{"format":"novel-builder/project"}', novelId: _novel, members: members, stored: (c, i) => null),
      throwsA(isA<CollabException>()),
    );
    expect(
      () => makeReviewCopy(owner.load(_novel)!, Member({...row, 'status': 'revoked'}), ownerName: 'A', now: 1),
      throwsA(isA<PermissionException>()),
    );
  });

  test('a newer review copy keeps the person\'s unsent work; an older one is refused', () {
    final ria = addMember('Ria', Role.reader);
    final first = copyFor(ria);
    reviewer.putNovel(first);
    final local = first.projectId;
    final me = ReviewMark.of(first.project)!.me;
    write(
      reviewer,
      local,
      newComment(
        me,
        projectId: local,
        target: {'kind': 'chapter', 'chapterId': _chapter},
        targetLabel: 'One',
        body: 'Not sent yet.',
        now: now(),
        newId: id,
      ),
    );
    final second = copyFor(ria);
    final merged = mergeReviewCopy(second, reviewer.load(local));
    expect(merged.rows('comments').map((c) => c['body']), contains('Not sent yet.'));
    expect(ReviewMark.of(merged.project)!.changed, hasLength(2));
    expect(() => mergeReviewCopy(first, merged), throwsA(isA<SnapshotException>()));
  });
}
