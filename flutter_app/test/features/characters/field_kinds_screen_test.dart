import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart' show CharacterProfile;
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:novel_builder/shared/domain/records/category.dart' show FieldType;
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// Mark, as an older profile has him: Gender written as text ("male"), Age as text; open on his page.
  Future<({ProviderContainer c, String novel, String mark})> mark(WidgetTester tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 3000), location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Doorwalker'}).id;
    final s = c.read(characterServiceProvider);
    final mark = s.change(novel, (x) => x.create(name: 'Mark', templateId: 'general')).id;
    s.change(novel, (x) {
      recordIn(x, mark, 'Age', ['age'], '21', sections: const ['identity'], newSection: 'Core Identity');
      recordIn(x, mark, 'Gender', ['gender'], 'male', sections: const ['identity'], newSection: 'Core Identity');
      for (final f in x.character(mark).fields) {
        x.updateField(mark, f.id, type: FieldType.text, options: const [], value: f.value == 'Male' ? 'male' : null);
      }
    });
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go(characterPath(mark));
    await tester.pumpAndSettle();
    return (c: c, novel: novel, mark: mark);
  }

  EntryField field(ProviderContainer c, String novel, String id, String name) =>
      Entry(c.read(novelStoreProvider).row(novel, 'loreEntries', id)!).fields.firstWhere((f) => f.key == name);

  testWidgets('a Gender is chosen, Male or Female, never typed; what was written before reads as its choice', (
    tester,
  ) async {
    final m = await mark(tester);
    expect(field(m.c, m.novel, m.mark, 'Gender').type, isNot(FieldType.select), reason: 'as an older profile has it');
    expect(find.bySemanticsLabel('Gender: Male'), findsOneWidget, reason: '"male" reads as Male in the header');

    await tester.tap(find.bySemanticsLabel(RegExp('^Edit Gender')));
    await tester.pumpAndSettle();
    final buttons = find.byType(SegmentedButton<String>);
    expect(buttons, findsOneWidget, reason: 'two buttons, no box to type in');
    expect(find.descendant(of: buttons, matching: find.text('Male')), findsOneWidget);
    expect(find.descendant(of: buttons, matching: find.text('Female')), findsOneWidget);
    expect(tester.widget<SegmentedButton<String>>(buttons).selected, {'Male'});

    await tester.tap(find.descendant(of: buttons, matching: find.text('Female')));
    await tester.pumpAndSettle();
    final gender = field(m.c, m.novel, m.mark, 'Gender');
    expect((gender.value, gender.type, gender.options.join('/')), ('Female', FieldType.select, 'Male/Female'));

    // Its settings say what it is, with no type to change it to.
    await tester.tap(find.text('Field settings'));
    await tester.pumpAndSettle();
    expect(find.text('Gender is a choice: Male or Female.'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<FieldType>), findsNothing);
  });

  testWidgets('an Age is a number: the number keys, and kept as one', (tester) async {
    final m = await mark(tester);
    await tester.tap(find.bySemanticsLabel(RegExp('^Edit Age')));
    await tester.pumpAndSettle();
    final input = find.descendant(of: find.byType(TextField).hitTestable(), matching: find.byType(EditableText));
    expect(tester.widget<EditableText>(input.first).keyboardType.index, TextInputType.number.index);
    await tester.enterText(find.byType(TextField).first, '22');
    m.c.read(saveControllerProvider).flush();
    await tester.pumpAndSettle();
    final age = field(m.c, m.novel, m.mark, 'Age');
    expect((age.value, age.type), ('22', FieldType.number));
  });

  testWidgets('Status is chosen, the one set marked; one of the author’s own is kept and shown', (tester) async {
    final m = await mark(tester);
    await tester.tap(find.text('Edit profile'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Deceased'));
    await tester.pumpAndSettle();
    CharacterProfile profile() => m.c.read(castProvider)!.list.firstWhere((l) => l.entry.id == m.mark).profile;
    expect(profile().status, 'Deceased');
    expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Deceased')).selected, isTrue);
    expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Alive')).selected, isFalse);

    await tester.enterText(find.widgetWithText(TextField, 'Your own'), 'Exiled');
    m.c.read(saveControllerProvider).flush();
    await tester.pumpAndSettle();
    expect(profile().status, 'Exiled');
    expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Exiled')).selected, isTrue);

    // Pressed again, cleared.
    await tester.tap(find.widgetWithText(ChoiceChip, 'Exiled'));
    await tester.pumpAndSettle();
    expect(profile().status, isEmpty);
  });
}
