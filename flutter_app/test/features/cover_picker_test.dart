import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/library/bookshelf.dart';
import 'package:novel_builder/features/library/cover_picker.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

Future<void> _details(WidgetTester tester, String title) async {
  await tester.tap(find.byTooltip('More for $title'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Edit details').last);
  await tester.pumpAndSettle();
}

Future<void> _press(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a cover chosen from the device is kept small, shown in the library, and can be removed', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, files: files);
    c.read(libraryServiceProvider).create({'title': 'Ash'});
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byType(BookJacket), matching: find.byType(Image)), findsNothing);

    await _details(tester, 'Ash');
    final picture = img.Image(width: 1200, height: 1800)..clear(img.ColorRgb8(150, 40, 30));
    files.imageToPick = (name: 'cover.png', bytes: Uint8List.fromList(img.encodePng(picture)));
    await tester.ensureVisible(find.text('Choose a picture…'));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('Choose a picture…'));
      for (var i = 0; i < 50 && find.text('Remove cover').evaluate().isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    expect(find.text('Remove cover'), findsOneWidget);
    await _press(tester, find.text('Save details'));
    final cover = c.read(libraryProvider).single.cover!;
    expect(cover, startsWith('data:image/jpeg;base64,'));
    final stored = img.decodeJpg(coverBytes(cover)!)!;
    expect([stored.width, stored.height], [533, 800]);
    // Its jacket on the shelf shows it.
    expect(find.descendant(of: find.byType(BookJacket), matching: find.byType(Image)), findsOneWidget);

    // Saving other details keeps it; removing it takes it away.
    await _details(tester, 'Ash');
    await tester.enterText(find.widgetWithText(TextFormField, 'Subtitle'), 'A tale');
    await _press(tester, find.text('Save details'));
    expect(c.read(libraryProvider).single.cover, cover);
    await _details(tester, 'Ash');
    await _press(tester, find.text('Remove cover'));
    await _press(tester, find.text('Save details'));
    expect(c.read(libraryProvider).single.cover, isNull);
    expect(find.descendant(of: find.byType(BookJacket), matching: find.byType(Image)), findsNothing);
  });

  testWidgets('a picture that cannot be read is said, and nothing changes', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, files: files);
    c.read(libraryServiceProvider).create({'title': 'Ash'});
    await tester.pumpAndSettle();
    await _details(tester, 'Ash');
    files.imageToPick = (name: 'notes.txt', bytes: Uint8List.fromList('not a picture'.codeUnits));
    await tester.ensureVisible(find.text('Choose a picture…'));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('Choose a picture…'));
      for (var i = 0; i < 50 && find.textContaining('could not be read').evaluate().isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    expect(find.textContaining('could not be read'), findsOneWidget);
    await _press(tester, find.text('Save details'));
    expect(c.read(libraryProvider).single.cover, isNull);
  });

  testWidgets('a cover kept as a web address is kept, said, and never fetched', (tester) async {
    final c = await pumpApp(tester);
    c.read(libraryServiceProvider).create({'title': 'Ash', 'cover': 'https://example.com/cover.jpg'});
    await tester.pumpAndSettle();
    await _details(tester, 'Ash');
    expect(find.textContaining('This cover is a web address'), findsOneWidget);
    await _press(tester, find.text('Save details'));
    expect(c.read(libraryProvider).single.cover, 'https://example.com/cover.jpg');
  });

  testWidgets('the novel form with its cover fits a phone at twice the text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpApp(tester, size: phone);
    await tester.ensureVisible(find.text('More details'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('More details'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Choose a picture…'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
