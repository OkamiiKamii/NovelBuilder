import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/stage_shelves.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';

/// THE SHELVES SEE WHAT YOU WRITE: an idea written in lately stands with the books being written, says when, and
/// counts as in progress; one press gives it the label Drafting (Undo puts it back). Its label is never changed alone.
void main() {
  final now = DateTime(2026, 11, 15, 15);
  NovelStats written(Duration ago) => NovelStats(lastWrittenAt: now.subtract(ago).millisecondsSinceEpoch);
  Novel novel(String status) => Novel({'id': 'n', 'title': 'Projection', 'status': status});

  test('an idea written in within two weeks is being written; an older one, or any other label, is as labelled', () {
    expect(shelfOf(novel('planning'), written(const Duration(hours: 1)), now), ShelfStage.writing);
    expect(shelfOf(novel('planning'), written(const Duration(days: 14)), now), ShelfStage.writing);
    expect(shelfOf(novel('planning'), written(const Duration(days: 15)), now), ShelfStage.ideas);
    expect(shelfOf(novel('planning'), null, now), ShelfStage.ideas, reason: 'never written in');
    expect(shelfOf(novel('planning'), const NovelStats(), now), ShelfStage.ideas);
    expect(shelfOf(novel('on-hold'), written(const Duration(hours: 1)), now), ShelfStage.aside, reason: 'set aside');
    expect(shelfOf(novel('complete'), written(const Duration(hours: 1)), now), ShelfStage.finished);
    expect(shelfOf(novel('drafting'), null, now), ShelfStage.writing);
  });

  test('when, in words, and the line under the book', () {
    int at(Duration ago) => now.subtract(ago).millisecondsSinceEpoch;
    expect(lastWritten(at(const Duration(hours: 3)), now), 'Written today');
    expect(lastWritten(at(const Duration(hours: 20)), now), 'Written yesterday');
    expect(lastWritten(at(const Duration(days: 5)), now), 'Written 5 days ago');
    final fantasy = Novel({'id': 'n', 'title': 'P', 'status': 'planning', 'primaryGenre': 'Fantasy'});
    expect(shelfLine(fantasy, written(const Duration(hours: 1)), now), 'Written today · Planning · Fantasy');
    expect(shelfLine(fantasy, written(const Duration(days: 30)), now), 'Planning · Fantasy', reason: 'not lately');
    expect(shelfLine(novel('drafting'), written(const Duration(hours: 1)), now), 'Drafting', reason: 'labelled');
  });

  testWidgets('on a phone: the book written in today stands on Writing now, not as an idea; Mark it Drafting; Undo', (
    tester,
  ) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final c = await pumpApp(tester, size: phone);
    final library = c.read(libraryServiceProvider);
    final store = c.read(novelStoreProvider);
    final projection = library.create({'title': 'Projection', 'status': 'planning'}).id;
    final harrow = library.create({'title': 'Harrowmere', 'status': 'planning'}).id;
    final old = library.create({'title': 'Ember', 'status': 'planning'}).id;
    final today = DateTime.now();
    JsonSession session(String novel, String id, DateTime at, {int words = 733}) => {
      'id': id,
      'projectId': novel,
      'day': '${at.year}-${'${at.month}'.padLeft(2, '0')}-${'${at.day}'.padLeft(2, '0')}',
      'startedAt': at.subtract(const Duration(minutes: 30)).millisecondsSinceEpoch,
      'lastActiveAt': at.millisecondsSinceEpoch,
      'netWords': words,
      'added': words,
      'removed': 0,
      'saves': 3,
    };
    store.writeRows(projection, [RowWrite.put('writingSessions', session(projection, 'w1', today))]);
    // Saved today without a word changed (a format, a link): not writing.
    store.writeRows(harrow, [RowWrite.put('writingSessions', session(harrow, 'w3', today, words: 0))]);
    store.writeRows(old, [
      RowWrite.put('writingSessions', session(old, 'w2', today.subtract(const Duration(days: 40)))),
    ]);
    await tester.pumpAndSettle();

    // No more "Nothing being written" on the day it was written in, nor "0 In progress".
    expect(find.text('Nothing being written'), findsNothing);
    expect(find.bySemanticsLabel(RegExp('Writing now')), findsWidgets);
    final inProgress = find.ancestor(of: find.text('In progress'), matching: find.byType(Row)).first;
    expect(
      find.descendant(of: inProgress, matching: find.text('1')),
      findsOneWidget,
      reason: '1 In progress',
    );
    expect(find.text('Written today · Planning'), findsOneWidget, reason: 'why it is there, under the book');
    expect(find.text('Planning'), findsNWidgets(2), reason: 'Harrowmere, no word changed; Ember, not lately');

    // Why it stands there, and one press to label it.
    final note = find.textContaining('You have been writing “Projection”');
    expect(note, findsOneWidget);
    expect(find.textContaining('It is still marked Planning.'), findsOneWidget);
    expect(store.novel(projection)!.status, NovelStatus.planning, reason: 'nothing changed by showing it');
    await tester.ensureVisible(find.text('Mark it Drafting'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark it Drafting'));
    await tester.pumpAndSettle();
    expect(store.novel(projection)!.status, NovelStatus.drafting);
    expect(find.text('“Projection” is marked Drafting.'), findsOneWidget);
    expect(note, findsNothing, reason: 'labelled now: nothing left to say');
    expect(find.text('Drafting'), findsOneWidget);

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(store.novel(projection)!.status, NovelStatus.planning, reason: 'back as it was');
    expect(find.textContaining('You have been writing “Projection”'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}

typedef JsonSession = Map<String, Object?>;
