import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/chapter_spine.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  final long = [
    for (var i = 1; i <= 40; i++) 'Paragraph $i. ${'The river ran on and on under the bridge. ' * 3}',
  ].join('\n');

  testWidgets('a long chapter has its spine; a press on it moves the page there', (tester) async {
    await openWrite(tester, size: phone, text: long);
    final spine = find.descendant(of: find.byType(ChapterSpine), matching: find.byType(CustomPaint));
    expect(spine, findsOneWidget);
    final scroll = tester.widget<CustomScrollView>(find.byType(CustomScrollView).first).controller!;
    expect(scroll.offset, 0);
    final r = tester.getRect(find.byType(ChapterSpine));
    await tester.tapAt(Offset(r.center.dx, r.top + r.height * 0.9));
    await tester.pumpAndSettle();
    expect(scroll.offset, greaterThan(scroll.position.maxScrollExtent * 0.6), reason: 'near the end');
    await tester.tapAt(Offset(r.center.dx, r.top + 2));
    await tester.pumpAndSettle();
    expect(scroll.offset, lessThan(scroll.position.maxScrollExtent * 0.1), reason: 'back to the start');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a few lines spread out with blank lines still have the page to themselves', (tester) async {
    const lines = ['Skill Creator.', 'Can create skills.', 'Have ranks from E to SSS.', 'E 1', 'B 2', 'S 3', 'SSS 4'];
    final spaced = lines.join('\n\n\n');
    await openWrite(tester, size: phone, text: spaced);
    expect(find.descendant(of: find.byType(ChapterSpine), matching: find.byType(CustomPaint)), findsNothing);
  });

  testWidgets('a short chapter has the page to itself', (tester) async {
    await openWrite(tester, size: phone);
    expect(find.descendant(of: find.byType(ChapterSpine), matching: find.byType(CustomPaint)), findsNothing);
  });
}
