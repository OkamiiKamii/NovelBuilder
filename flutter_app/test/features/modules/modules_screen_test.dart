import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/modules/module_service.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/module_library.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';

Future<ProviderContainer> start(
  WidgetTester tester,
  String location, {
  Size size = const Size(1400, 2600),
  FakeBackupFiles? files,
  List<String> enabled = const [],
}) async {
  final c = await pumpApp(tester, size: size, location: '/', files: files);
  c.read(novelStoreProvider).putNovel(loadFixture('made-in-the-app'));
  for (final id in enabled) {
    c.read(moduleServiceProvider).change(_novel, (m) => m.enable(builtinModules.firstWhere((d) => d.id == id)));
  }
  c.read(openNovelProvider.notifier).open(_novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return c;
}

NovelSnapshot _saved(ProviderContainer c) => c.read(novelStoreProvider).load(_novel)!;

/// The novel was made in the original app with Science Fiction on: what a test adds is told apart by module.
JsonMap _row(ProviderContainer c, String moduleId) =>
    _saved(c).rows('projectModules').firstWhere((r) => r['moduleId'] == moduleId);

List<JsonMap> _records(ProviderContainer c, String moduleId) => [
  for (final r in _saved(c).rows('moduleRecords'))
    if (r['moduleId'] == moduleId) r,
];

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f.first);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

Finder _inCard(String moduleId, String text) =>
    find.descendant(of: find.byKey(ValueKey('module:$moduleId')), matching: find.text(text));

Future<void> _type(WidgetTester tester, String label, String text) async {
  final field = find.widgetWithText(TextField, label);
  await tester.ensureVisible(field.first);
  await tester.enterText(field.first, text);
  await tester.pump();
}

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the novel’s modules as the original app left them: off keeps everything, on again brings it all back', (
    tester,
  ) async {
    // Made in the original app with all ten on, and Mystery arranged by its author.
    final c = await start(tester, '/organize/modules');
    expect(find.text('Module Manager'), findsOneWidget);
    expect(find.text('10 modules on in this novel'), findsOneWidget);
    final entries = _saved(c).rows('loreEntries').length;
    final records = _saved(c).rows('moduleRecords').length;
    await tap(tester, _inCard('mystery', 'Disable'));
    var s = _saved(c);
    expect(_row(c, 'mystery')['enabled'], false);
    expect(_inCard('mystery', 'Disabled'), findsOneWidget);
    // Its empty categories are tucked away, not deleted; one with an entry in it stays.
    JsonMap kind(String name) => _saved(c).rows('loreSchemas').firstWhere((k) => k['name'] == name);
    expect([kind('Cases')['archived'], kind('Suspects')['archived']], [true, isNot(true)]);
    expect([s.rows('loreEntries').length, s.rows('moduleRecords').length], [entries, records]);
    // Its workspace says it is off, and keeps what it holds.
    c.read(routerProvider).go('/organize/modules/mystery');
    await tester.pumpAndSettle();
    expect(find.textContaining('This module is switched off'), findsOneWidget);
    await tap(tester, find.text('Turn it on'));
    s = _saved(c);
    expect([_row(c, 'mystery')['enabled'], kind('Cases')['archived']], [true, isNot(true)]);
    expect([s.rows('loreEntries').length, s.rows('moduleRecords').length], [entries, records]);
    // As its author arranged it: its own name, a tool renamed and one hidden.
    expect(find.textContaining('Whodunit'), findsWidgets);
    expect(find.widgetWithText(ChoiceChip, 'Casebook'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'Who knows what'), findsNothing);
    expect(find.bySemanticsLabel('1 Suspects: open Suspect board'), findsOneWidget);
    await tester.pump(const Duration(seconds: 7));
  });

  testWidgets('its tools work on the novel’s own records: a registry, a matrix and a log', (tester) async {
    final c = await start(tester, '/organize/modules/mystery?tool=people', enabled: ['mystery']);
    expect(find.text('Suspects, victims & persons of interest'), findsWidgets);
    await _type(tester, 'New suspect', 'The Butler');
    await tap(tester, find.widgetWithText(FilledButton, 'Add'));
    final butler = _saved(c).rows('loreEntries').firstWhere((e) => e['name'] == 'The Butler');
    final suspects = _saved(c).rows('loreSchemas').firstWhere((k) => k['name'] == 'Suspects');
    expect(butler['category'], suspects['key']);
    await tap(tester, find.widgetWithText(ListTile, 'The Butler'));
    expect(currentLocation(c), '/organize/modules/mystery?tool=people&record=${butler['id']}');
    expect(find.text('Open in the Codex'), findsOneWidget);

    // The evidence matrix: a clue against a suspect.
    await tap(tester, find.widgetWithText(ChoiceChip, 'Evidence matrix'));
    await _type(tester, 'New clue', 'A torn glove');
    await tap(tester, find.widgetWithText(FilledButton, 'Add').first);
    await tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'A torn glove and The Butler'));
    await tester.tap(find.text('Implicates').last);
    await tester.pumpAndSettle();
    final cell = _records(c, 'mystery').single;
    expect(
      [cell['kind'], cell['toolId'], cell['state'], cell['colId']],
      ['cell', 'evidence', 'Implicates', butler['id']],
    );

    // A log: a line with its first stage.
    await tap(tester, find.widgetWithText(ChoiceChip, 'Red herrings'));
    await _type(tester, 'New entry in Red herrings', 'The gardener’s boots');
    await tap(tester, find.widgetWithText(FilledButton, 'Add'));
    final line = _records(c, 'mystery').firstWhere((r) => r['kind'] == 'log');
    expect([line['title'], line['state'], line['toolId']], ['The gardener’s boots', 'Planted', 'herrings']);
    await tap(tester, find.byTooltip('Remove The gardener’s boots'));
    expect(_records(c, 'mystery').where((r) => r['kind'] == 'log'), isEmpty);
    await tester.pump(const Duration(seconds: 7));
  });

  testWidgets('a log with values draws its line through the chapters', (tester) async {
    final c = await start(tester, '/organize/modules/romance?tool=arc', enabled: ['romance']);
    final chapters = [
      for (final n in _saved(c).rows('chapters'))
        if (n['kind'] == 'chapter') str(n['id']),
    ];
    c.read(moduleServiceProvider).change(_novel, (m) {
      for (final (i, id) in chapters.take(2).indexed) {
        m.addRecord('romance', 'arc', {'title': 'Beat $i', 'nodeId': id, 'value': 3 + i * 4});
      }
    });
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Intensity through the story'), findsOneWidget);
    expect(find.textContaining('Intensity from 0 to 10'), findsOneWidget);
  });

  testWidgets('Configure hides a tool, keeping how the author arranged the others', (tester) async {
    final c = await start(tester, '/organize/modules/mystery', enabled: ['mystery']);
    await tap(tester, find.widgetWithText(OutlinedButton, 'Configure'));
    await tap(tester, find.bySemanticsLabel('Show Cases'));
    final settings = mapOrNull(_row(c, 'mystery')['settings'])!;
    expect(settings['hidden'], ['knowledge', 'cases']);
    await tap(tester, find.text('Done'));
    expect(find.widgetWithText(ChoiceChip, 'Casebook'), findsNothing);
    expect(find.widgetWithText(ChoiceChip, 'Alibis'), findsOneWidget);
  });

  testWidgets('a module of the author’s own: made from the novel, exported, imported, never replacing a built-in one', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await start(tester, '/organize/modules', files: files);
    expect(find.textContaining('None yet.'), findsOneWidget);
    await _type(tester, 'Module name', 'My rules');
    await tap(tester, find.byType(CheckboxListTile).first);
    await tap(tester, find.text('Save as a module'));
    final mine = c.read(availableModulesProvider).where((m) => !m.builtin).toList();
    expect(mine.map((m) => m.name), ['My rules']);
    // Only the shape of things: no entries, names or text.
    expect(jsonEncode(mine.single.raw), isNot(contains('Bren')));

    await tap(tester, _inCard(mine.single.id, 'Export'));
    final file = files.savedFiles.single;
    expect(file.name, 'My rules.module.json');

    // The same file claiming to be a built-in module comes in as a module of its own.
    final data = jsonDecode(utf8.decode(file.bytes)) as JsonMap;
    files.toPick = (
      name: 'fake.module.json',
      text: jsonEncode({
        ...data,
        'module': {...mapOrNull(data['module'])!, 'id': 'mystery', 'name': 'Not the real one'},
      }),
    );
    await tap(tester, find.text('Import a module…'));
    final now = c.read(availableModulesProvider);
    expect(now.where((m) => m.id == 'mystery').single.name, 'Mystery, Detective & Investigation');
    expect(now.where((m) => m.name == 'Not the real one').single.id, startsWith('custom-'));
    files.toPick = (name: 'notes.json', text: '{"format": "something-else"}');
    await tap(tester, find.text('Import a module…'));
    expect(find.textContaining('is not a module'), findsOneWidget);
    await tester.pump(const Duration(seconds: 7));
  });

  testWidgets('on a phone at twice the text size, the manager and a module’s workspace fit', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = await start(tester, '/organize/modules', size: phone, enabled: ['romance']);
    expect(tester.takeException(), isNull);
    for (final where in [
      '/organize/modules/romance',
      '/organize/modules/romance?tool=arcs',
      '/organize/modules/romance?tool=stages',
      '/organize/modules/romance?tool=transitions',
      '/organize/modules/romance?tool=meters',
    ]) {
      c.read(routerProvider).go(where);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: where);
    }
  });
}
