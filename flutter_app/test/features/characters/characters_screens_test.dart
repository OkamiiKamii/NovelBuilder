import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/cast_card.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';
import '../write/manuscript_service_test.dart' show linked;

/// The app at Organize with one novel open.
Future<({ProviderContainer c, String novel})> openOrganize(WidgetTester tester, {Size size = desktop}) async {
  final c = await pumpApp(tester, size: size, location: '/organize');
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id);
}

String make(ProviderContainer c, String novel, String name, {List<String> roles = const [], String epithet = ''}) =>
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: name, roles: roles, epithet: epithet)).id;

JsonMap row(ProviderContainer c, String novel, String collection, String id) =>
    c.read(novelStoreProvider).row(novel, collection, id)!;

CharacterProfile profileOf(ProviderContainer c, String novel, String entryId) => CharacterProfile(
  c.read(novelStoreProvider).rowsIn(novel, 'characterProfiles').firstWhere((r) => r['entryId'] == entryId),
);

Future<void> settleSaves(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('an empty cast says what a character is; creating one opens its profile', (tester) async {
    final w = await openOrganize(tester);
    expect(find.text('No characters yet'), findsOneWidget);
    await tester.tap(find.text('Create a character'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create character'));
    await tester.pumpAndSettle();
    expect(find.text('Give the character a name.'), findsOneWidget, reason: 'only a name is needed, and it is');
    await tester.enterText(find.widgetWithText(TextField, 'Name *'), 'Kaelen Draven');
    await tester.tap(find.widgetWithText(FilterChip, 'Protagonist'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create character'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), startsWith('/organize/character/'));
    expect(find.text('Kaelen Draven'), findsWidgets);
    final entries = w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreEntries');
    expect([for (final e in entries) (e['name'], e['category'])], [('Kaelen Draven', 'character')]);
    expect(profileOf(w.c, w.novel, str(entries.single['id'])).roles, ['Protagonist']);
    // Empty fields say so, rather than looking like values.
    expect(find.text('Core Identity (0)'), findsOneWidget);
  });

  testWidgets('editing who the character is saves as it is typed, and is noted in their history', (tester) async {
    final w = await openOrganize(tester);
    final id = make(w.c, w.novel, 'Marcus');
    w.c.read(routerProvider).go('/organize/character/$id');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit profile'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Title or epithet'), 'The Oathbreaker');
    await settleSaves(tester);
    expect(profileOf(w.c, w.novel, id).epithet, 'The Oathbreaker');
    // A blank name is not saved: the name stays until a new one is given.
    await tester.enterText(find.widgetWithText(TextField, 'Name'), '  ');
    await settleSaves(tester);
    expect(row(w.c, w.novel, 'loreEntries', id)['name'], 'Marcus');
    expect(find.textContaining('A character needs a name'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Marcus Vell');
    await settleSaves(tester);
    expect(row(w.c, w.novel, 'loreEntries', id)['name'], 'Marcus Vell');
    await tester.tap(find.widgetWithText(FilledButton, 'Done'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('History'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(find.text('Set Title to “The Oathbreaker”.'), findsOneWidget);
    expect(find.text('Changed Name from “Marcus” to “Marcus Vell”.'), findsOneWidget);
    expect(find.text('Created the character “Marcus”.'), findsOneWidget);
  });

  testWidgets('a section offers its usual fields; one added is edited in place and stored on the entry', (
    tester,
  ) async {
    final w = await openOrganize(tester);
    final id = make(w.c, w.novel, 'Kael');
    w.c.read(routerProvider).go('/organize/character/$id');
    await tester.pumpAndSettle();
    expect(row(w.c, w.novel, 'loreEntries', id)['fields'], isEmpty, reason: 'suggestions store nothing');
    await tester.tap(find.widgetWithText(ActionChip, 'Age').first);
    await tester.pumpAndSettle();
    expect(find.text('Core Identity (1)'), findsOneWidget);
    expect(find.text('Not recorded'), findsOneWidget);
    await tester.tap(find.text('Not recorded'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Age'), '27');
    await settleSaves(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Done'));
    await tester.pumpAndSettle();
    // Shown in its section, and among the facts at the top of the profile.
    expect(find.text('27'), findsNWidgets(2));
    expect([for (final f in Entry(row(w.c, w.novel, 'loreEntries', id)).fields) (f.key, f.value)], [('Age', '27')]);
  });

  testWidgets('the library searches, filters by role, archives and remembers cards or list', (tester) async {
    final w = await openOrganize(tester);
    make(w.c, w.novel, 'Kaelen Draven', roles: ['Protagonist'], epithet: 'The Oathbreaker');
    final sera = make(w.c, w.novel, 'Seraphina Valdris', roles: ['Antagonist']);
    final tam = make(w.c, w.novel, 'Old Tam', roles: ['Minor']);
    await tester.pumpAndSettle();
    expect(find.text('3 characters'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Search characters'), 'oathbreaker');
    await tester.pumpAndSettle();
    expect(find.text('Kaelen Draven'), findsOneWidget);
    expect(find.text('Seraphina Valdris'), findsNothing);
    expect(find.text('1 of 3 characters'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Search characters'), 'zzz');
    await tester.pumpAndSettle();
    expect(find.text('Nothing matches “zzz”'), findsOneWidget);
    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Antagonists'));
    await tester.pumpAndSettle();
    expect(find.text('Seraphina Valdris'), findsOneWidget);
    expect(find.text('Old Tam'), findsNothing);

    w.c.read(characterServiceProvider).change(w.novel, (x) => x.setArchived(tam, true));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Archived (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Old Tam'), findsOneWidget);
    expect(find.text('Seraphina Valdris'), findsNothing);

    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    expect(w.c.read(settingsStoreProvider).read('characters.view'), 'list');
    await tester.tap(find.widgetWithText(ChoiceChip, 'All (2)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Seraphina Valdris'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize/character/$sera');
  });

  testWidgets('secrets keep apart what is true and who knows it', (tester) async {
    final w = await openOrganize(tester);
    final kael = make(w.c, w.novel, 'Kael');
    make(w.c, w.novel, 'Mira');
    w.c.read(routerProvider).go('/organize/character/$kael?tab=secrets');
    await tester.pumpAndSettle();
    expect(find.text('No secrets recorded.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'A new secret'), 'True heir');
    await tester.tap(find.text('Add secret'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'What is true'), 'Kael is the king’s son.');
    await tester.tap(find.byTooltip('Add to Characters who know'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira').last);
    await tester.pumpAndSettle();
    await settleSaves(tester);
    final secret = CharacterSecret(w.c.read(novelStoreProvider).rowsIn(w.novel, 'characterSecrets').single);
    expect((secret.title, secret.description, secret.knows.length), ('True heir', 'Kael is the king’s son.', 1));
    expect(find.textContaining('Now: Knows:'), findsOneWidget);
  });

  testWidgets('a note changes nothing on the profile until it is copied in, and copying keeps it', (tester) async {
    final w = await openOrganize(tester);
    final id = make(w.c, w.novel, 'Marcus');
    w.c.read(routerProvider).go('/organize/character/$id?tab=notes');
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'A new note'), 'Maybe the prince’s brother');
    await tester.tap(find.text('Add note'));
    await tester.pumpAndSettle();
    expect(row(w.c, w.novel, 'loreEntries', id)['fields'], isEmpty);
    await tester.ensureVisible(find.text('Copy into the profile…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Copy into the profile…'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Field name'), 'Family');
    await tester.tap(find.widgetWithText(FilledButton, 'Copy into the profile'));
    await tester.pumpAndSettle();
    expect(
      [for (final f in Entry(row(w.c, w.novel, 'loreEntries', id)).fields) (f.key, f.value)],
      [('Family', 'Maybe the prince’s brother')],
    );
    expect(w.c.read(novelStoreProvider).rowsIn(w.novel, 'characterNotes'), hasLength(1));
  });

  testWidgets('deleting lists what refers to the character, keeps a restore point, and Undo brings it back', (
    tester,
  ) async {
    final w = await openOrganize(tester);
    final kael = make(w.c, w.novel, 'Kael');
    final mira = make(w.c, w.novel, 'Mira');
    w.c
        .read(characterServiceProvider)
        .change(
          w.novel,
          (x) => x.saveSecret(mira, null, {
            'title': 'Spy',
            'knows': [kael],
          }),
        );
    w.c.read(routerProvider).go('/organize/character/$kael');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More options for Kael'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete…'));
    await tester.pumpAndSettle();
    expect(find.text('•  1 other character’s secret names them'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize');
    expect(w.c.read(novelStoreProvider).row(w.novel, 'loreEntries', kael), isNull);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(w.c.read(novelStoreProvider).row(w.novel, 'loreEntries', kael), isNotNull);
    expect(currentLocation(w.c), '/organize/character/$kael');
  });

  testWidgets('a profile works on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await openOrganize(tester, size: phone);
    final id = make(w.c, w.novel, 'Seraphina Valdris', roles: ['Protagonist', 'Antagonist'], epithet: 'The Last Heir');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    w.c.read(routerProvider).go('/organize/character/$id');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    for (final tab in ['details', 'secrets', 'notes', 'history', 'relationships']) {
      w.c.read(routerProvider).go('/organize/character/$id?tab=$tab');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: tab);
    }
  });

  test('a character keeps their colour and monogram whatever the list around them', () {
    expect(castTone('kael-1'), castTone('kael-1'));
    expect([monogram('Kai & Ren'), monogram('Mira'), monogram('  '), monogram('Old Tam')], ['KR', 'M', '?', 'OT']);
  });

  testWidgets('the cast wall: each card shows their thread through the book, and opens their profile', (tester) async {
    final w = await openOrganize(tester);
    final kael = make(w.c, w.novel, 'Kael', roles: ['Protagonist'], epithet: 'The Oathbreaker');
    make(w.c, w.novel, 'Mira');
    final m = w.c.read(manuscriptServiceProvider);
    for (final (i, title) in ['One', 'Two', 'Three'].indexed) {
      final ch = m.create(w.novel, NodeKind.chapter, title: title);
      if (i != 1) m.save(w.novel, ch.id, linked('Kael', kael), baseRev: 0);
    }
    await tester.pumpAndSettle();
    expect(find.text('In 2 of 3 chapters · 1–3'), findsOneWidget);
    expect(find.text('Not in the manuscript yet'), findsOneWidget, reason: 'Mira');
    expect(find.text('KA'), findsNothing, reason: 'one word, one initial');
    expect(
      find.bySemanticsLabel('Kael, The Oathbreaker, Protagonist, In 2 of 3 chapters · 1–3'),
      findsOneWidget,
      reason: 'the card says all of it to a screen reader',
    );
    await tester.tap(find.text('Kael'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize/character/$kael');
  });

  testWidgets('in the editor, a linked name says what it links to and opens the character’s profile', (tester) async {
    final c = await pumpApp(tester, location: '/write');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'});
    final kael = make(c, novel.id, 'Kael');
    final m = c.read(manuscriptServiceProvider);
    final chapter = m.create(novel.id, NodeKind.chapter, title: 'One');
    m.save(novel.id, chapter.id, linked('Kael', kael), baseRev: 0);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(selectedNodeProvider.notifier).select(chapter.id);
    await tester.pumpAndSettle();
    final paragraph = SuperEditorInspector.findDocument()!.first;
    await tester.placeCaretInParagraph(paragraph.id, 2);
    await tester.pumpAndSettle();
    expect(find.text('Linked to Kael (Character)'), findsOneWidget);
    await tester.tap(find.text('Open Kael’s profile'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/character/$kael');
  });

  testWidgets('a novel made in the original app: its cast shows, and looking at it writes nothing', (tester) async {
    final c = await pumpApp(tester, location: '/organize');
    final store = c.read(novelStoreProvider)..putNovel(loadFixture('made-in-the-app'));
    final novelId = loadFixture('made-in-the-app').projectId;
    final before = store.load(novelId)!.toJson();
    c.read(openNovelProvider.notifier).open(novelId);
    await tester.pumpAndSettle();
    expect(find.text('Seraphina Valdris'), findsOneWidget);
    const kaelen = 'a1bc3bba-f37e-47d8-90de-0198e8d61bb3-kaelen';
    for (final tab in ['overview', 'details', 'secrets', 'notes', 'history', 'relationships']) {
      c.read(routerProvider).go('/organize/character/$kaelen?tab=$tab');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: tab);
    }
    c.read(routerProvider).go('/organize/character/$kaelen?tab=secrets');
    await tester.pumpAndSettle();
    expect(find.text('How knowledge spreads (recorded)'), findsOneWidget);
    final after = store.load(novelId)!.toJson();
    // Opening it marks the novel as opened; nothing in the novel's records changes.
    expect(jsonEquals(after['collections'], before['collections']), isTrue);
  });

  testWidgets('a portrait is uploaded from a picture the author chooses, shrunk as the original kept them', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, location: '/organize', files: files);
    final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
    c.read(openNovelProvider.notifier).open(novel.id);
    final id = make(c, novel.id, 'Mira');
    c.read(routerProvider).go('/organize/character/$id');
    await tester.pumpAndSettle();
    final picture = img.Image(width: 1600, height: 1000)..clear(img.ColorRgb8(30, 90, 160));
    files.imageToPick = (name: 'mira.png', bytes: Uint8List.fromList(img.encodePng(picture)));
    await tester.runAsync(() async {
      await tester.tap(find.text('Upload portrait'));
      for (var i = 0; i < 50 && !str(row(c, novel.id, 'loreEntries', id)['image']).startsWith('data:'); i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
    });
    await tester.pumpAndSettle();
    expect(str(row(c, novel.id, 'loreEntries', id)['image']), startsWith('data:image/jpeg;base64,'));
    expect(find.text('Replace portrait'), findsOneWidget);
    expect(find.text('Adjust crop'), findsOneWidget);
  });
}
