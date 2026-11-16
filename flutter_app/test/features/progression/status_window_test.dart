import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/progression/widgets/status_window.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/compute.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

Future<void> _show(WidgetTester tester, Widget window) => tester.pumpWidget(
  MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(child: SizedBox(width: 360, child: window)),
    ),
  ),
);

void main() {
  test('an example sheet holds the first of each kind of class, skill and the like', () {
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    final held = exampleHeld(litrpg.content);
    final groups = {for (final i in maps(litrpg.content['items'])) str(i['groupId'])};
    expect(held, hasLength(groups.length));
  });

  testWidgets('the window shows the numbers the sheet will: its level, bars of what is left, what is held', (
    tester,
  ) async {
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    final held = exampleHeld(litrpg.content);
    final sheet = computeSheet(SystemBlueprint(litrpg.content), SheetProfile(itemIds: held));
    await _show(
      tester,
      StatusWindow(content: litrpg.content, presetId: 'litrpg', holder: 'James', held: held, caption: 'For example.'),
    );
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel(RegExp('^Status window for James')), findsOneWidget);
    expect(find.text('STATUS'), findsOneWidget);
    expect(find.text('James'), findsOneWidget);
    String shown(String name) => sheet.rows.firstWhere((r) => r.variable.name == name).display;
    // Health, out of the Max Health that follows from Vitality.
    final most = shown('Max Health').replaceAll(' HP', '');
    expect(find.text('100 / $most HP'), findsOneWidget);
    // What a class held raises is marked so.
    final strength = sheet.rows.firstWhere((r) => r.variable.name == 'Strength');
    expect(strength.sources, isNotEmpty);
    expect(find.text('${strength.display} ▲'), findsOneWidget);
    for (final i in sheet.items) {
      expect(find.text(i.item.name), findsOneWidget, reason: i.item.name);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('the bars fill as the window opens, and only the fill is drawn again: no row of it is built again', (
    tester,
  ) async {
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    final held = exampleHeld(litrpg.content);
    await _show(
      tester,
      StatusWindow(content: litrpg.content, presetId: 'litrpg', holder: 'James', held: held, caption: 'For example.'),
    );
    final bars = find.byWidgetPredicate((w) => w is CustomPaint && w.painter.runtimeType.toString() == '_BarPainter');
    expect(bars, findsWidgets, reason: 'HP, MP, SP');
    List<double> drawn() => [
      for (final p in tester.widgetList<CustomPaint>(bars)) (p.painter! as dynamic).drawn as double,
    ];
    expect(drawn().every((d) => d == 0), isTrue, reason: 'empty as the window opens');

    // The filling, frame by frame: the bars grow, and nothing of the window is built again (not the bars' rows, nor
    // the window round them).
    var rebuilt = 0;
    debugOnRebuildDirtyWidget = (e, _) {
      if (e.widget is StatusWindow || e.findAncestorWidgetOfExactType<StatusWindow>() != null) rebuilt++;
    };
    addTearDown(() => debugOnRebuildDirtyWidget = null);
    final seen = <double>[];
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 60));
      seen.add(drawn().first);
    }
    debugOnRebuildDirtyWidget = null;
    expect(rebuilt, 0, reason: 'only the fill is painted again');
    expect(seen.first, greaterThan(0));
    for (var i = 1; i < seen.length; i++) {
      expect(seen[i], greaterThanOrEqualTo(seen[i - 1]), reason: 'filling, never emptying');
    }
    await tester.pumpAndSettle();
    // Filled to what is left: HP 100 of the Max Health that follows from Vitality.
    final sheet = computeSheet(SystemBlueprint(litrpg.content), SheetProfile(itemIds: held));
    final most = double.parse(sheet.rows.firstWhere((r) => r.variable.name == 'Max Health').display.split(' ').first);
    expect(drawn().first, closeTo(100 / most, 1e-9));
    expect(tester.takeException(), isNull);
  });

  testWidgets('every kind of system draws its window on a narrow phone at twice the text size', (tester) async {
    for (final p in systemPresets) {
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: SizedBox(
                  width: 300,
                  child: StatusWindow(
                    content: p.content,
                    presetId: p.id,
                    holder: 'Wren Hollis',
                    held: exampleHeld(p.content),
                    caption: 'For example.',
                    compact: true,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: p.id);
    }
  });
}
