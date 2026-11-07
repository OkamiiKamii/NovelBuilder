import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/template_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/sharing/template_files.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.hitTestable().first);
  await tester.pumpAndSettle();
}

void main() {
  Future<({ProviderContainer c, FakeBackupFiles files})> start(
    WidgetTester tester, {
    Size size = const Size(1400, 2400),
  }) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: size, files: files, location: '/settings/import-export');
    c.read(novelStoreProvider).putNovel(loadFixture('made-in-the-app'));
    c.read(openNovelProvider.notifier).open(_novel);
    await tester.pumpAndSettle();
    return (c: c, files: files);
  }

  Future<String> share(
    WidgetTester tester,
    FakeBackupFiles files, {
    String? pick,
    String author = 'Test Author',
  }) async {
    await tap(tester, find.text('Share a template…'));
    if (pick != null) {
      await tap(tester, find.byType(DropdownButtonFormField<String>));
      await tap(tester, find.textContaining(pick).last);
    }
    await tester.enterText(find.widgetWithText(TextField, 'Made by'), author);
    await tester.pumpAndSettle();
    expect(find.textContaining('none of your novel’s entries, text, notes or other records'), findsOneWidget);
    await tap(tester, find.text('Save the file…'));
    return utf8.decode(files.savedFiles.last.bytes);
  }

  Future<void> import(WidgetTester tester, FakeBackupFiles files, String text) async {
    files.toPick = (name: 'template.novel-template.json', text: text);
    await tap(tester, find.text('Import a template file…'));
  }

  testWidgets('share categories, take them in, see the same version refused and a newer one added', (tester) async {
    final w = await start(tester);
    final text = await share(tester, w.files);
    final file = w.files.savedFiles.last;
    expect(file.name, 'Made in the App categories & fields.novel-template.json');
    expect(file.kind, FileKind.json);
    final json = jsonDecode(text) as JsonMap;
    expect(
      [json['format'], json['kind'], json['author'], json['templateVersion']],
      [templateFormat, 'categories', 'Test Author', 1],
    );
    expect(text.contains(_novel), isFalse, reason: 'nothing of the novel itself');

    await import(tester, w.files, text);
    expect(find.textContaining('Made by Test Author'), findsOneWidget);
    expect(find.textContaining('Terms: Free to use, change and share'), findsOneWidget);
    expect(find.text('You do not have this template yet.'), findsOneWidget);
    await tap(tester, find.widgetWithText(FilledButton, 'Add it'));
    expect(w.c.read(templatesProvider).map((t) => t.name), ['Made in the App: categories & fields']);

    // The same file again: already here, nothing to add.
    await import(tester, w.files, text);
    expect(find.text('You already have this version of it, or a newer one.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Add it')).onPressed, isNull);
    await tap(tester, find.text('Cancel'));

    // Shared again from the received one: version 2, recognised as newer, added beside the first.
    final second = await share(tester, w.files, pick: 'Categories & fields: Made in the App: categories');
    expect((jsonDecode(second) as JsonMap)['templateVersion'], 2);
    expect((jsonDecode(second) as JsonMap)['id'], json['id']);
    await import(tester, w.files, second);
    expect(find.textContaining('This is a newer version of one you have'), findsOneWidget);
    await tap(tester, find.text('Add the newer version'));
    final saved = w.c.read(templatesProvider);
    expect(saved.length, 2);
    expect([for (final t in saved) t.shared?['version']]..sort((a, b) => (a! as num).compareTo(b! as num)), [1, 2]);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a system and a profile layout go into the open novel; nothing already there changes', (tester) async {
    final w = await start(tester);
    final store = w.c.read(novelStoreProvider);
    final systemsBefore = store.rowsIn(_novel, 'systems');
    final name = systemsBefore.first['name']! as String;
    final text = await share(tester, w.files, pick: 'Progression system: $name');
    expect((jsonDecode(text) as JsonMap)['kind'], 'system');
    await import(tester, w.files, text);
    await tap(tester, find.widgetWithText(FilledButton, 'Add it'));
    final systems = store.rowsIn(_novel, 'systems');
    expect(systems.length, systemsBefore.length + 1);
    expect(jsonEncode(systems.take(systemsBefore.length).toList()), jsonEncode(systemsBefore));
    expect(mapOrNull(systems.last['shared'])?['author'], 'Test Author');

    final layout = jsonEncode({
      'format': templateFormat,
      'version': 1,
      'kind': 'profile-layout',
      'id': 'layout-1',
      'templateVersion': 1,
      'name': 'Duelist',
      'author': 'A friend',
      'license': 'ccBy',
      'content': {
        'sections': [
          {
            'name': 'Combat',
            'tab': 'details',
            'fields': [
              {'name': 'Weapon', 'type': 'text'},
            ],
          },
        ],
      },
    });
    await import(tester, w.files, layout);
    expect(find.textContaining('Combat: Weapon'), findsOneWidget);
    await tap(tester, find.widgetWithText(FilledButton, 'Add it'));
    final layouts = store.rowsIn(_novel, 'characterTemplates');
    expect(layouts.single['name'], 'Duelist');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a file that is not template data, or breaks a rule, is refused and nothing is added', (tester) async {
    final w = await start(tester);
    await import(
      tester,
      w.files,
      jsonEncode({
        'format': templateFormat,
        'version': 1,
        'kind': 'categories',
        'name': 'Bad',
        'content': {
          'categories': [
            {
              'name': 'Spells',
              'fields': [
                {'name': 'Run', 'type': 'script'},
              ],
            },
          ],
        },
      }),
    );
    expect(find.text('This template cannot be imported'), findsOneWidget);
    expect(find.textContaining('a field of a kind this app does not know'), findsOneWidget);
    await tap(tester, find.text('OK'));
    await import(tester, w.files, '{"format": "novel-builder/project"}');
    expect(find.textContaining('not a Novel Builder template file'), findsOneWidget);
    await tap(tester, find.text('OK'));
    expect(w.c.read(templatesProvider), isEmpty);
    expect(w.c.read(templateStoreProvider).list(), isEmpty);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('on a phone at twice the text size, sharing and importing fit', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await start(tester, size: phone);
    final text = await share(tester, w.files);
    expect(tester.takeException(), isNull);
    await import(tester, w.files, text);
    expect(tester.takeException(), isNull);
    await tap(tester, find.widgetWithText(FilledButton, 'Add it'));
    expect(tester.takeException(), isNull);
    w.c.read(routerProvider).go('/organize/world/kinds');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a brand-new novel shares the built-in categories the codex shows', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: const Size(1400, 2400), files: files, location: '/settings/import-export');
    final novel = c.read(libraryServiceProvider).create({'title': 'Fresh'});
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final text = await share(tester, files);
    final categories = maps(mapOrNull((jsonDecode(text) as JsonMap)['content'])?['categories']);
    expect(categories.map((c) => c['key']), ['character', 'location', 'faction', 'item', 'power', 'lore']);
    await tester.pump(const Duration(seconds: 2));
  });
}
