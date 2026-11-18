// The Flutter app's own outputs for review by file (collab.golden.json pins them; outputs.ts makes Scriptor's, keyed
// and shaped the same way). For every novel given, a script run on it with a fixed clock and ids: the team added, a
// review copy made for each role (and refused for a removed person and for a co-author), an editor's, a reader's and a
// viewer's work in their copies (comments, replies, reactions, feedback forms, resolving, rewording, deleting, text
// and entry suggestions, withdrawing, and the changes their role is refused), each write judged as the store judges a
// review copy's writes and kept in its mark; the feedback files made, tampered with and read back by the owner; the
// owner taking them in and deciding every suggested change; a newer copy merged over a held one (and an older one
// refused); and every chapter's paragraphs. The domain runs as it is (access, hunks, records, collab_changes,
// review_files); only the store's guard is copied here (novel_store.dart's _guarded and _marked), since the store
// needs Flutter's sqlite.
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart collab.golden.json <the Flutter fixtures>/*.novel.json ../../model/edge.novel.json \
//        ../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/collab/access.dart';
import 'package:novel_builder/shared/domain/collab/collab_changes.dart';
import 'package:novel_builder/shared/domain/collab/hunks.dart';
import 'package:novel_builder/shared/domain/collab/records.dart';
import 'package:novel_builder/shared/domain/collab/review_files.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

Object? writeJson(CollabWrite w) => {'collection': w.collection, 'id': w.id, 'value': w.value, 'before': w.before};

/// The writes applied to a snapshot, as the store applies them (no checks).
NovelSnapshot applied(NovelSnapshot s, List<CollabWrite> writes) {
  var out = s;
  for (final w in writes) {
    out = w.value == null
        ? out.withRows(w.collection, [
            for (final r in out.rows(w.collection))
              if (r['id'] != w.id) r,
          ])
        : out.putRow(w.collection, w.value!);
  }
  return out;
}

/// The writes applied to a review copy as the store guards them: each judged by the role's rule against the row as it
/// stands (any refusal and nothing is written), the keys of what is allowed kept in the copy's mark.
({NovelSnapshot s, String? refused}) guarded(NovelSnapshot copy, List<CollabWrite> writes) {
  final mark = ReviewMark.of(copy.project)!;
  var out = copy;
  final keys = <String>[];
  for (final w in writes) {
    final before = out.rows(w.collection).where((r) => r['id'] == w.id).firstOrNull;
    final reason = refusal(mark.role, mark.memberId, '${w.collection}:${w.id}', before, w.value);
    if (reason != null) return (s: copy, refused: reason);
    keys.add('${w.collection}:${w.id}');
    out = applied(out, [w]);
  }
  if (keys.isEmpty) return (s: out, refused: null);
  return (
    s: out.copyWith(
      project: {
        ...out.project,
        'review': {
          ...mark.toJson(),
          'changed': {...mark.changed, ...keys}.toList(),
        },
      },
    ),
    refused: null,
  );
}

String errorOf(Object e) => switch (e) {
  PermissionException(:final message) => 'permission: $message',
  CollabException(:final message) => 'collab: $message',
  SnapshotException(:final reason) => 'snapshot: $reason',
  _ => 'other: $e',
};

Object? team(NovelSnapshot s) => {
  'comments': s.rows('comments'),
  'suggestions': s.rows('suggestions'),
  'activity': s.rows('activity'),
  'review': s.project['review'],
};

Map<String, Object?> novel(NovelSnapshot input) {
  var clock = 1800000000000;
  var ids = 0;
  String id() => 'id-${ids++}';
  num now() => clock += 1000;
  final parts = <String, Object?>{};
  final novelId = input.projectId;
  var owner = input;
  const ownerMe = (id: ownerId, name: 'The author', role: Role.owner);

  // ---- the team
  Member add(String name, Role role) {
    final row = newMember(projectId: novelId, name: name, email: '$name@example.org', role: role, now: now(), id: id());
    owner = applied(owner, [(collection: 'members', id: str(row['id']), value: row, before: null)]);
    return Member(row);
  }

  final sam = add('Sam', Role.editor);
  final ria = add('Ria', Role.reader);
  final vic = add('Vic', Role.viewer);
  final rex = add('Rex', Role.reader);
  final refusedMembers = <Object?>[];
  for (final (name, email, role) in [('', 'x', Role.reader), ('Cora', '', Role.coauthor), ('Olly', '', Role.owner)]) {
    try {
      newMember(projectId: novelId, name: name, email: email, role: role, now: 1, id: 'x');
      refusedMembers.add('made');
    } on Object catch (e) {
      refusedMembers.add(errorOf(e));
    }
  }
  parts['members'] = {'rows': owner.rows('members'), 'refused': refusedMembers};

  // ---- review copies
  NovelSnapshot copyFor(Member m) => makeReviewCopy(owner, m, ownerName: 'The author', now: now());
  var samCopy = copyFor(sam);
  var riaCopy = copyFor(ria);
  final riaFirst = riaCopy;
  var vicCopy = copyFor(vic);
  var rexCopy = copyFor(rex);
  final rexRow = owner.rows('members').firstWhere((r) => r['id'] == rex.id);
  owner = owner.putRow('members', {...rexRow, 'status': 'revoked'});
  final copyErrors = <Object?>[];
  for (final m in [
    Member({...rexRow, 'status': 'revoked'}),
    Member({...rexRow, 'role': 'coauthor'}),
    Member({...rexRow, 'role': 'owner'}),
  ]) {
    try {
      copyFor(m);
      copyErrors.add('made');
    } on Object catch (e) {
      copyErrors.add(errorOf(e));
    }
  }
  for (final (role, copy) in [('editor', samCopy), ('reader', riaCopy), ('viewer', vicCopy)]) {
    parts['copy:$role'] = {'project': copy.project, 'collections': copy.collections};
  }
  parts['copy:errors'] = copyErrors;

  // What the scripts work on: the first chapters with text, the first entry and plot thread (as stored).
  final docs = [
    for (final r in input.rows('chapterContents'))
      if (paragraphTexts(r['doc']).isNotEmpty) r,
  ].take(2).toList();
  final entry = input.rows('loreEntries').firstOrNull;
  final thread = input.rows('plotThreads').firstOrNull;
  final chapterTitle = <String, String>{
    for (final r in input.rows('chapters')) str(r['id']): str(r['title'], 'Untitled'),
  };

  // ---- an editor's work in their copy
  final steps = <Object?>[];
  void step(String op, NovelSnapshot Function(NovelSnapshot) Function() run, {required String who}) {
    // `run` makes the writes (or throws); they are then applied under the store's guard.
    String outcome;
    switch (who) {
      case 'sam':
        try {
          final next = run()(samCopy);
          outcome = 'ok';
          samCopy = next;
        } on _Refused catch (r) {
          outcome = 'refused: ${r.reason}';
        } on Object catch (e) {
          outcome = errorOf(e);
        }
        steps.add({'who': who, 'op': op, 'outcome': outcome, 'state': team(samCopy)});
      case 'ria':
        try {
          final next = run()(riaCopy);
          outcome = 'ok';
          riaCopy = next;
        } on _Refused catch (r) {
          outcome = 'refused: ${r.reason}';
        } on Object catch (e) {
          outcome = errorOf(e);
        }
        steps.add({'who': who, 'op': op, 'outcome': outcome, 'state': team(riaCopy)});
      case 'vic':
        try {
          final next = run()(vicCopy);
          outcome = 'ok';
          vicCopy = next;
        } on _Refused catch (r) {
          outcome = 'refused: ${r.reason}';
        } on Object catch (e) {
          outcome = errorOf(e);
        }
        steps.add({'who': who, 'op': op, 'outcome': outcome, 'state': team(vicCopy)});
      case 'rex':
        try {
          final next = run()(rexCopy);
          outcome = 'ok';
          rexCopy = next;
        } on _Refused catch (r) {
          outcome = 'refused: ${r.reason}';
        } on Object catch (e) {
          outcome = errorOf(e);
        }
        steps.add({'who': who, 'op': op, 'outcome': outcome, 'state': team(rexCopy)});
    }
  }

  NovelSnapshot Function(NovelSnapshot) writing(List<CollabWrite> writes) => (copy) {
    final g = guarded(copy, writes);
    if (g.refused != null) throw _Refused(g.refused!);
    return g.s;
  };

  List<Activity> activityOf(NovelSnapshot s) => [for (final r in s.rows('activity')) Activity(r)];
  List<Comment> commentsOf(NovelSnapshot s) => [for (final r in s.rows('comments')) Comment(r)];
  List<Suggestion> suggestionsOf(NovelSnapshot s) => [for (final r in s.rows('suggestions')) Suggestion(r)];
  Me meOf(NovelSnapshot copy) => ReviewMark.of(copy.project)!.me;

  NovelSnapshot Function(NovelSnapshot) Function() comment(
    NovelSnapshot Function() copy,
    JsonMap target,
    String label,
    String body, {
    String kind = 'comment',
    Map<String, num>? ratings,
  }) => () {
    final c = copy();
    return writing(
      newComment(
        meOf(c),
        projectId: c.projectId,
        target: target,
        targetLabel: label,
        body: body,
        kind: kind,
        ratings: ratings,
        now: now(),
        newId: id,
        activity: activityOf(c),
      ),
    );
  };

  for (final doc in docs) {
    final cid = str(doc['id']);
    final title = chapterTitle[cid] ?? 'Untitled';
    final texts = paragraphTexts(doc['doc']);
    step('comment on text', comment(() => samCopy, {
      'kind': 'text',
      'chapterId': cid,
      'quote': texts.first.length > 120 ? '${texts.first.substring(0, 120)}…' : texts.first,
      'block': 0,
      'offset': 0,
    }, title, '  This line sings.  '), who: 'sam');
    step('comment on chapter', comment(() => samCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'Strong ending.'), who: 'sam');
    step('comment again soon', comment(() => samCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'And the middle.'), who: 'sam');
    step('reaction', comment(() => samCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'Loved this', kind: 'reaction'), who: 'sam');
    step(
      'feedback form',
      comment(() => samCopy, {'kind': 'chapter', 'chapterId': cid}, title, '', kind: 'feedback', ratings: {'pacing': 4, 'clarity': 3, 'engagement': 5}),
      who: 'sam',
    );
    step('empty comment', comment(() => samCopy, {'kind': 'chapter', 'chapterId': cid}, title, '   '), who: 'sam');
    // A suggestion: the first paragraph reworded, the last removed, a new one after the first.
    final blocks = maps(mapOrNull(doc['doc'])?['content']);
    NovelSnapshot Function(NovelSnapshot) Function() suggest(List<({Object? original, String? text})> paragraphs) => () {
      final c = samCopy;
      final base = mapOrNull(doc['doc'])!;
      return writing(
        saveTextSuggestion(
          meOf(c),
          projectId: c.projectId,
          chapterId: cid,
          chapterTitle: title,
          base: base,
          proposed: docWithParagraphs(base, paragraphs),
          existing: [
            for (final s in suggestionsOf(c))
              if (s.targetId == cid) s,
          ],
          now: now(),
          newId: id,
          activity: activityOf(c),
        ),
      );
    };
    final edited = <({Object? original, String? text})>[
      for (final (i, b) in blocks.indexed)
        if (i == 0) (original: b, text: 'A sharper opening.') else if (!(i == blocks.length - 1 && blocks.length > 2)) (original: b, text: null),
    ]..insert(1, (original: null, text: 'A new paragraph.'));
    step('suggest text', suggest(edited), who: 'sam');
    step('suggest text again', suggest([...edited, (original: null, text: 'One more at the end.')]), who: 'sam');
    step('suggest back to as found', suggest([for (final b in blocks) (original: b, text: null)]), who: 'sam');
    step('suggest text once more', suggest(edited), who: 'sam');
  }
  if (entry != null) {
    final eid = str(entry['id']);
    final name = str(entry['name']);
    step('comment on entry', comment(() => samCopy, {'kind': 'entry', 'entryId': eid}, name, 'Who is this?'), who: 'sam');
    NovelSnapshot Function(NovelSnapshot) Function() fields(List<({String field, String label, String from, String to})> changes, String note) =>
        () {
          final c = samCopy;
          return writing(
            suggestFields(
              meOf(c),
              projectId: c.projectId,
              entryId: eid,
              entryName: name,
              changes: changes,
              note: note,
              now: now(),
              newId: id,
              activity: activityOf(c),
            ),
          );
        };
    final firstField = maps(entry['fields']).firstOrNull;
    step('suggest an edit', fields([
      (field: 'name', label: 'Name', from: name, to: '$name the Second'),
      (field: 'summary', label: 'Summary', from: str(entry['summary']), to: str(entry['summary'])),
      if (firstField != null)
        (field: 'field:${str(firstField['key'])}', label: str(firstField['key']), from: str(firstField['value']), to: 'Changed'),
      (field: 'field:Brand new', label: 'Brand new', from: '', to: 'A value'),
    ], '  A note.  '), who: 'sam');
    step('suggest nothing', fields([(field: 'name', label: 'Name', from: name, to: name)], ''), who: 'sam');
    step('suggest another edit', fields([(field: 'description', label: 'Description', from: '', to: 'Words.')], ''), who: 'sam');
    step('withdraw it', () {
      final s = suggestionsOf(samCopy).lastWhere((s) => !s.isText);
      return writing([withdrawSuggestion(meOf(samCopy), s)]);
    }, who: 'sam');
  }
  if (thread != null) {
    step('comment on thread', comment(() => samCopy, {'kind': 'thread', 'threadId': str(thread['id'])}, str(thread['title']), 'Where does this go?'), who: 'sam');
  }
  // Sam's own conversations first (rewording and deleting them is allowed), then anyone else's (refused).
  final samRoots = [
    for (final c in commentsOf(samCopy))
      if (c.isRoot && c.kind == 'comment' && c.authorId == sam.id) c,
    for (final c in commentsOf(samCopy))
      if (c.isRoot && c.kind == 'comment' && c.authorId != sam.id) c,
  ];
  if (samRoots.isNotEmpty) {
    final root = samRoots.first;
    step('reply', () => writing(reply(meOf(samCopy), root, body: 'Agreed, on reflection.', now: now(), newId: id, activity: activityOf(samCopy))), who: 'sam');
    step('empty reply', () => writing(reply(meOf(samCopy), root, body: '', now: now(), newId: id)), who: 'sam');
    step('resolve', () {
      final r = commentsOf(samCopy).firstWhere((c) => c.id == root.id);
      return writing(setThreadStatus(meOf(samCopy), r, resolved: true, now: now(), newId: id, activity: activityOf(samCopy)));
    }, who: 'sam');
    step('re-open', () {
      final r = commentsOf(samCopy).firstWhere((c) => c.id == root.id);
      return writing(setThreadStatus(meOf(samCopy), r, resolved: false, now: now(), newId: id, activity: activityOf(samCopy)));
    }, who: 'sam');
    step('reword', () {
      final r = commentsOf(samCopy).firstWhere((c) => c.id == root.id);
      return writing([editComment(meOf(samCopy), r, ' Reworded. ', now: now())]);
    }, who: 'sam');
    step('reword empty', () {
      final r = commentsOf(samCopy).firstWhere((c) => c.id == root.id);
      return writing([editComment(meOf(samCopy), r, '  ', now: now())]);
    }, who: 'sam');
    for (final other in samRoots.skip(1).take(2)) {
      step('delete a conversation', () {
        final r = commentsOf(samCopy).firstWhere((c) => c.id == other.id);
        return writing(removeComment(meOf(samCopy), r, commentsOf(samCopy), now: now()));
      }, who: 'sam');
    }
    final others = [
      for (final c in commentsOf(samCopy))
        if (c.isRoot && c.authorId != sam.id) c,
    ];
    if (others.isNotEmpty) {
      step('reword someone else’s', () => writing([editComment(meOf(samCopy), others.first, 'Mine.', now: now())]), who: 'sam');
      step('resolve someone else’s', () => writing(setThreadStatus(meOf(samCopy), others.first, resolved: true, now: now(), newId: id, activity: activityOf(samCopy))), who: 'sam');
    }
  }
  // Writes an editor's role may not make, offered straight to the guarded store.
  final firstChapter = samCopy.rows('chapters').firstOrNull;
  if (firstChapter != null) {
    step('rename a chapter', () => writing([(collection: 'chapters', id: str(firstChapter['id']), value: {...firstChapter, 'title': 'Mine'}, before: firstChapter)]), who: 'sam');
  }
  final firstText = samCopy.rows('chapterContents').firstOrNull;
  if (firstText != null) {
    step('change the text', () => writing([(collection: 'chapterContents', id: str(firstText['id']), value: {...firstText, 'doc': textToDoc('Mine now.')}, before: firstText)]), who: 'sam');
  }
  step('add to the team', () => writing([(collection: 'members', id: 'm-new', value: {'id': 'm-new', 'name': 'X'}, before: null)]), who: 'sam');
  step('a comment in the owner’s name', () {
    final rows = newComment(
      (id: ownerId, name: 'The author', role: Role.owner),
      projectId: samCopy.projectId,
      target: {'kind': 'chapter', 'chapterId': 'c'},
      targetLabel: 'C',
      body: 'Forged.',
      now: now(),
      newId: id,
    );
    return writing(rows);
  }, who: 'sam');

  // ---- a reader's and a viewer's
  for (final doc in docs.take(1)) {
    final cid = str(doc['id']);
    final title = chapterTitle[cid] ?? 'Untitled';
    step('reader comments', comment(() => riaCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'I was lost here.'), who: 'ria');
    step('reader reacts', comment(() => riaCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'Confused', kind: 'reaction'), who: 'ria');
    step('reader suggests', () {
      final base = mapOrNull(doc['doc'])!;
      return writing(
        saveTextSuggestion(meOf(riaCopy), projectId: riaCopy.projectId, chapterId: cid, chapterTitle: title, base: base, proposed: textToDoc('Other.'), existing: const [], now: now(), newId: id),
      );
    }, who: 'ria');
    final mine = commentsOf(riaCopy).where((c) => c.isRoot).firstOrNull;
    if (mine != null) {
      step('reader replies to themselves', () => writing(reply(meOf(riaCopy), mine, body: 'Still lost.', now: now(), newId: id, activity: activityOf(riaCopy))), who: 'ria');
      step('reader resolves', () => writing(setThreadStatus(meOf(riaCopy), mine, resolved: true, now: now(), newId: id, activity: activityOf(riaCopy))), who: 'ria');
    }
    step('viewer comments', comment(() => vicCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'Hello.'), who: 'vic');
    step('removed person comments', comment(() => rexCopy, {'kind': 'chapter', 'chapterId': cid}, title, 'Still here.'), who: 'rex');
  }
  parts['steps'] = steps;

  // ---- feedback, back with the owner
  final feedback = makeFeedback(samCopy, now: now());
  parts['feedback:editor'] = feedback;
  parts['feedback:text'] = feedbackFileText(makeFeedback(riaCopy, now: 1));
  final members = [for (final r in owner.rows('members')) Member(r)];
  JsonMap? stored(String c, String i) => owner.rows(c).where((r) => r['id'] == i).firstOrNull;
  Object? previewOf(String text, String forNovel) {
    try {
      final p = readFeedback(text, novelId: forNovel, members: members, stored: stored);
      return {
        'member': p.member.id,
        'sentAt': p.sentAt,
        'writes': [for (final w in p.writes) writeJson(w)],
        'refused': [for (final r in p.refused) {'what': r.what, 'reason': r.reason}],
        'unchanged': p.unchanged,
        'counts': [p.count('comments'), p.count('suggestions'), p.count('activity'), p.count('comments', where: (r) => r['kind'] == 'reaction')],
      };
    } on Object catch (e) {
      return errorOf(e);
    }
  }

  final tampered = [
    ...maps(feedback['changes']),
    {'collection': 'chapterContents', 'id': 'x', 'row': {'id': 'x', 'doc': textToDoc('Hacked.')}},
    {'collection': 'comments', 'id': 'other', 'row': {'id': 'wrong'}},
    {'collection': 'comments', 'id': 'proj', 'row': {'id': 'proj', 'projectId': 'elsewhere'}},
    {'collection': 'activity', 'id': 'a1', 'row': {'id': 'a1', 'actorId': ownerId}},
    {'collection': 'suggestions', 'id': 'gone', 'row': null},
  ];
  parts['preview'] = {
    'honest': previewOf(jsonEncode(feedback), novelId),
    'tampered': previewOf(jsonEncode({...feedback, 'changes': tampered}), novelId),
    'reader': previewOf(jsonEncode(makeFeedback(riaCopy, now: now())), novelId),
    'removed': previewOf(jsonEncode(makeFeedback(rexCopy, now: now())), novelId),
    'another novel': previewOf(jsonEncode(feedback), 'another'),
    'not a file': previewOf('{not json', novelId),
    'not feedback': previewOf('{"format":"novel-builder/project"}', novelId),
    'newer': previewOf(jsonEncode({...feedback, 'version': 2}), novelId),
    'stranger': previewOf(jsonEncode({...feedback, 'memberId': 'nobody', 'memberName': 'Nemo'}), novelId),
  };
  try {
    makeFeedback(owner, now: 1);
  } on Object catch (e) {
    parts['feedback:owner'] = errorOf(e);
  }

  // The owner takes the honest feedback in, then decides every suggested change.
  final honest = readFeedback(jsonEncode(feedback), novelId: novelId, members: members, stored: stored);
  owner = applied(owner, honest.writes);
  final decisions = <Object?>[];
  var turn = 0;
  for (final row in owner.rows('suggestions').toList()) {
    final s = Suggestion(row);
    if (s.isText) {
      for (final h in textHunks(s.base, s.proposed)) {
        final current = Suggestion(owner.rows('suggestions').firstWhere((r) => r['id'] == s.id));
        final content = owner.rows('chapterContents').where((r) => r['id'] == s.targetId).firstOrNull;
        final accept = turn++ % 2 == 0;
        try {
          final d = decideHunk(ownerMe, current, h.id, accept: accept, currentDoc: content?['doc'], now: now(), newId: id, activity: [for (final r in owner.rows('activity')) Activity(r)]);
          if (d.doc case final doc?) owner = owner.putRow('chapterContents', {...?content, 'doc': doc});
          owner = applied(owner, d.writes);
          decisions.add({'hunk': h.id, 'accept': accept, 'doc': d.doc, 'writes': [for (final w in d.writes) writeJson(w)]});
        } on Object catch (e) {
          decisions.add({'hunk': h.id, 'accept': accept, 'error': errorOf(e)});
        }
      }
      try {
        decideHunk(ownerMe, s, 'no-such', accept: true, currentDoc: null, now: now(), newId: id);
      } on Object catch (e) {
        decisions.add(errorOf(e));
      }
    } else {
      final accept = turn++ % 2 == 0;
      final e = owner.rows('loreEntries').where((r) => r['id'] == s.targetId).firstOrNull;
      try {
        final writes = decideFields(ownerMe, s, accept: accept, entry: e, now: now(), newId: id);
        owner = applied(owner, writes);
        decisions.add({'suggestion': s.id, 'accept': accept, 'writes': [for (final w in writes) writeJson(w)]});
      } on Object catch (err) {
        decisions.add({'suggestion': s.id, 'error': errorOf(err)});
      }
      try {
        decideFields(ownerMe, Suggestion(owner.rows('suggestions').firstWhere((r) => r['id'] == s.id)), accept: true, entry: e, now: now(), newId: id);
      } on Object catch (err) {
        decisions.add(errorOf(err));
      }
    }
  }
  // An editor may not decide; nor accept on an entry that is gone.
  for (final row in owner.rows('suggestions')) {
    try {
      decideFields((id: sam.id, name: 'Sam', role: Role.editor), Suggestion(row), accept: true, entry: null, now: now(), newId: id);
    } on Object catch (e) {
      decisions.add(errorOf(e));
    }
  }
  parts['decisions'] = decisions;

  // The owner deletes a conversation with replies; an editor rewording someone else's comment is refused.
  final ownerComments = [for (final r in owner.rows('comments')) Comment(r)];
  final withReplies = ownerComments.where((c) => c.isRoot && ownerComments.any((r) => r.threadId == c.id && !r.isRoot)).firstOrNull;
  final ownerSide = <Object?>[];
  if (withReplies != null) {
    ownerSide.add([for (final w in removeComment(ownerMe, withReplies, ownerComments, now: now())) writeJson(w)]);
  }
  for (final c in ownerComments.take(3)) {
    try {
      ownerSide.add(writeJson(editComment(ownerMe, c, 'Mine.', now: 5)));
    } on Object catch (e) {
      ownerSide.add(errorOf(e));
    }
    try {
      ownerSide.add([for (final w in removeComment((id: 'stranger', name: 'X', role: Role.reader), c, ownerComments, now: 5)) writeJson(w)]);
    } on Object catch (e) {
      ownerSide.add(errorOf(e));
    }
  }
  ownerSide.add({'threads': [for (final t in threadsOf(ownerComments)) [t.root.id, for (final r in t.replies) r.id]]});
  ownerSide.add({
    'open': [for (final r in owner.rows('suggestions')) Suggestion(r).isOpen],
    'openHunks': [for (final r in owner.rows('suggestions')) [for (final h in Suggestion(r).openHunks) h.id]],
  });
  parts['owner'] = {'side': ownerSide, 'book': {'chapterContents': owner.rows('chapterContents'), 'loreEntries': owner.rows('loreEntries')}, 'team': team(owner)};

  // ---- a newer copy over the one held, keeping the reader's unsent work; an older one refused
  final merges = <Object?>[];
  final newer = copyFor(ria);
  try {
    final merged = mergeReviewCopy(newer, riaCopy);
    merges.add({'project': merged.project, 'collections': merged.collections});
    try {
      mergeReviewCopy(riaFirst, merged);
      merges.add('merged');
    } on Object catch (e) {
      merges.add(errorOf(e));
    }
  } on Object catch (e) {
    merges.add(errorOf(e));
  }
  merges.add(identical(mergeReviewCopy(newer, null), newer));
  merges.add(identical(mergeReviewCopy(newer, owner), newer));
  merges.add(identical(mergeReviewCopy(newer, samCopy), newer));
  try {
    mergeReviewCopy(owner, null);
  } on Object catch (e) {
    merges.add(errorOf(e));
  }
  parts['merge'] = merges;

  // ---- every chapter's paragraphs, and every pair of chapters as a suggestion
  parts['paragraphs'] = {for (final r in input.rows('chapterContents')) str(r['id']): paragraphTexts(r['doc'])};
  final contents = input.rows('chapterContents').take(6).toList();
  parts['hunks'] = [
    for (var i = 0; i + 1 < contents.length; i++)
      [
        for (final h in textHunks(contents[i]['doc'], contents[i + 1]['doc']))
          {'id': h.id, 'at': h.at, 'remove': h.remove.length, 'insert': h.insert.length, 'text': [textOf(h.remove), textOf(h.insert)]},
      ],
  ];
  return parts;
}

class _Refused implements Exception {
  const _Refused(this.reason);
  final String reason;
}

Map<String, Object?> misc() => {
  'roles': [for (final r in Role.values) [r.name, r.label, r.summary, for (final c in Capability.values) can(r, c)]],
  'reviewRoles': [for (final r in reviewRoles) r.name],
  'targets': [
    for (final t in [
      {'kind': 'text', 'chapterId': 'c1'},
      {'kind': 'chapter', 'chapterId': 'c2'},
      {'kind': 'entry', 'entryId': 'e1'},
      {'kind': 'thread', 'threadId': 't1'},
      {'kind': 'beat', 'threadId': 't2', 'beatId': 'b'},
      <String, Object?>{},
    ])
      targetKeyOf(t),
  ],
  'docWithParagraphs': [
    docWithParagraphs(null, [(original: null, text: 'One'), (original: null, text: '')]),
    docWithParagraphs(
      {'type': 'doc', 'extra': 1, 'content': []},
      [
        (original: {'type': 'heading', 'attrs': {'level': 2}, 'content': []}, text: 'Head'),
        (original: {'type': 'paragraph', 'attrs': null}, text: 'Plain'),
        (original: {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Kept'}]}, text: null),
      ],
    ),
  ],
  'reviewCopyId': reviewCopyId('n', 'm'),
  'marks': [
    for (final p in [
      {'review': {'role': 'editor', 'novelId': 'n', 'memberId': 'm', 'changed': ['a:b', 3]}},
      {'review': {'role': 'owner'}},
      {'review': {'role': 'coauthor'}},
      {'review': {'role': 'nobody'}},
      {'review': 'x'},
      <String, Object?>{},
    ])
      ReviewMark.of(p)?.toJson(),
  ],
};

String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

/// With FULL set, every part whole; else each part of each novel as its hash (`misc` is always whole).
void main(List<String> args) {
  final full = Platform.environment['FULL'] != null;
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final parts = novel(s);
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
  }
  out['misc'] = misc();
  File(args.first).writeAsStringSync(jsonEncode(out));
}
