import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/tutorial/topics.dart';
import 'package:novel_builder/features/tutorial/tutorial.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';
import '../perf/large_project_test.dart' show screens;

void main() {
  group('the lessons', () {
    test('each has steps, an example, and a page or a place to find it, as the original app requires', () {
      expect({for (final t in tutorialTopics) t.id}.length, tutorialTopics.length);
      for (final t in tutorialTopics) {
        expect(tutorialGroups, contains(t.group), reason: t.id);
        expect(t.steps.length, inInclusiveRange(3, 5), reason: t.id);
        expect(t.what.length, lessThanOrEqualTo(190), reason: t.id);
        expect(t.example.trim().length, greaterThan(30), reason: t.id);
        expect(t.path != null || t.where != null, isTrue, reason: t.id);
      }
      // Every group has lessons.
      for (final g in tutorialGroups) {
        expect(tutorialTopics.where((t) => t.group == g), isNotEmpty, reason: g);
      }
    });

    test('nothing in them is about what this app does not have', () {
      final all = [
        for (final t in tutorialTopics) [t.title, t.what, ...t.steps, t.example, t.where ?? ''].join(' '),
      ].join(' ').toLowerCase();
      for (final word in ['cloud', 'sync', 'relay', 'assistant', 'ai', 'invitation link', 'studio']) {
        expect(RegExp('\\b$word\\b').hasMatch(all), isFalse, reason: word);
      }
    });

    test('every screen of the app opens on a lesson of its own', () {
      for (final screen in screens) {
        if (screen == '/write/book') continue;
        final t = topicFor(screen);
        expect(t.id, isNot('areas'), reason: '$screen has no lesson');
      }
      expect(topicFor('/').id, 'library');
      expect(topicFor('/organize/world').id, 'world');
      expect(topicFor('/organize/world/entry/abc').id, 'world');
      expect(topicFor('/organize/world/kinds?kind=x').id, 'kinds');
      expect(topicFor('/organize/character/abc?tab=history').id, 'characters');
      expect(topicFor('/organize/modules/mystery?tool=cases').id, 'modules');
      expect(topicFor('/visualize').id, 'relationships');
      expect(topicFor('/visualize/kinds').id, 'graph');
      expect(topicFor('/plan/thread/t1').id, 'threads');
      expect(topicFor('/review/consequences?node=n').id, 'consequences');
      expect(topicFor('/somewhere-new').id, 'areas');
    });

    test('every lesson’s page is a page of the app', () {
      final known = {...screens, '/organize/world/kinds'};
      for (final t in tutorialTopics) {
        if (t.path case final path?) expect(known, contains(path), reason: t.id);
      }
    });
  });

  testWidgets('opens on the lesson for the page in view; walks on; takes you there', (tester) async {
    final c = await pumpApp(tester, location: '/');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'});
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(routerProvider).go('/organize/world');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Tutorial'));
    await tester.pumpAndSettle();
    expect(find.text('The world'), findsWidgets);
    expect(find.text('How to use it'), findsOneWidget);
    expect(find.text('Take me there'), findsNothing, reason: 'already there');

    await tester.tap(find.text('Next →'));
    await tester.pumpAndSettle();
    expect(find.text('Categories & fields'), findsWidgets);
    await tester.tap(find.text('All topics'));
    await tester.pumpAndSettle();
    final list = find
        .descendant(of: find.byKey(const ValueKey('tutorial-topics')), matching: find.byType(Scrollable))
        .first;
    await tester.scrollUntilVisible(find.text('This page'), 100, scrollable: list);
    expect(find.text('This page'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Canon'), 100, scrollable: list);
    await tester.ensureVisible(find.text('Canon'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Canon'));
    await tester.pumpAndSettle();
    final page = find
        .descendant(of: find.byKey(const ValueKey('tutorial-lesson')), matching: find.byType(Scrollable))
        .first;
    await tester.scrollUntilVisible(find.text('Take me there'), 100, scrollable: page);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take me there'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/review/canon');
    expect(find.text('How to use it'), findsNothing, reason: 'it closes on the way');
  });

  testWidgets('switched off, the button goes and stays gone; Settings opens it and brings it back', (tester) async {
    final c = await pumpApp(tester, location: '/settings');
    await tester.tap(find.byTooltip('Tutorial'));
    await tester.pumpAndSettle();
    expect(find.text('Settings'), findsWidgets);
    await tester.tap(find.widgetWithText(SwitchListTile, 'Show the Tutorial button').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('The button is gone'), findsOneWidget);
    await tester.tap(find.byTooltip('Close the tutorial'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Tutorial'), findsNothing);
    expect(c.read(settingsStoreProvider).read('tutorial.shown'), false);

    await tester.ensureVisible(find.text('Open the tutorial'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open the tutorial'));
    await tester.pumpAndSettle();
    expect(find.text('How to use it'), findsOneWidget);
    await tester.tap(find.byTooltip('Close the tutorial'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(SwitchListTile, 'Show the Tutorial button'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SwitchListTile, 'Show the Tutorial button'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Tutorial'), findsOneWidget);
  });

  testWidgets('on a phone the Library has the Tutorial beside its gear; a lesson is found by any word in it', (
    tester,
  ) async {
    await pumpApp(tester, size: phone, location: '/');
    await tester.tap(find.byTooltip('Tutorial'));
    await tester.pumpAndSettle();
    expect(find.text('The Library'), findsWidgets, reason: 'the lesson for the shelf');
    expect(find.text('Next: Finding your way'), findsOneWidget);
    await tester.tap(find.text('All topics'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Find a lesson'), 'ribbon');
    await tester.pumpAndSettle();
    expect(find.text('Ribbons'), findsOneWidget);
    expect(find.text('Canon'), findsNothing);
    await tester.tap(find.text('Ribbons'));
    await tester.pumpAndSettle();
    expect(find.text('How to use it'), findsOneWidget);
    expect(find.textContaining('Lay a ribbon in this page'), findsWidgets);

    await tester.tap(find.text('All topics'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Find a lesson'), 'zeppelin');
    await tester.pumpAndSettle();
    expect(find.text('No lesson mentions “zeppelin”.'), findsOneWidget);
  });

  testWidgets('on a phone at twice the text size: under More, and the lesson fits', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = await pumpApp(tester, size: phone, location: '/');
    // More is inside a book.
    c.read(openNovelProvider.notifier).open(c.read(libraryServiceProvider).create({'title': 'A'}).id);
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final sheet = find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.text('Tutorial'), 100, scrollable: sheet);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tutorial'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Characters'), findsWidgets, reason: 'the lesson for Organize');
    await tester.tap(find.text('All topics'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(TutorialSwitch), findsOneWidget);
  });
}
