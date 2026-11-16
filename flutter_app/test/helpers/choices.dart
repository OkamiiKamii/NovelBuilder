import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/core/widgets/choice_field.dart';

/// A choice field of a form (`ChoiceField`, of any kind), by the words in it: its label, or what is chosen.
Finder choiceField(String words) =>
    find.ancestor(of: find.text(words), matching: find.byWidgetPredicate((w) => w is ChoiceField));

/// Every choice field, in the order of the page.
final anyChoiceField = find.byWidgetPredicate((w) => w is ChoiceField);

/// Opens [field] and chooses [option], as a writer would: from the dropdown of a short list, or, in the list a long
/// one opens, by typing it first (only the rows on the screen are built) and pressing its row. [containing]: the row
/// only holds [option].
Future<void> chooseIn(WidgetTester tester, Finder field, String option, {bool containing = false}) async {
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.tap(field);
  await tester.pumpAndSettle();
  final typing = find.byWidgetPredicate(
    (w) => w is TextField && (w.decoration?.hintText ?? '').startsWith('Type to find one of'),
  );
  if (typing.evaluate().isNotEmpty) {
    await tester.enterText(typing, option);
    await tester.pumpAndSettle();
  }
  await tester.tap((containing ? find.textContaining(option) : find.text(option)).last);
  await tester.pumpAndSettle();
}
