import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/motion/motion.dart';
import 'package:novel_builder/core/widgets/cassette.dart';
import 'package:novel_builder/core/widgets/foil.dart';
import 'package:novel_builder/core/widgets/kbd.dart';
import 'package:novel_builder/core/widgets/scramble_text.dart';
import 'package:novel_builder/core/widgets/signature.dart';
import 'package:novel_builder/core/widgets/stamp.dart';
import 'package:novel_builder/core/widgets/states.dart';
import 'package:novel_builder/core/widgets/ticket.dart';
import 'package:novel_builder/features/workspace/area_switch.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../features/search/search_screen_test.dart' show openSearch, start, type;
import '../helpers/pump_app.dart';

Widget frame(Widget child, {bool reduced = false, double scale = 1, double width = 390}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: reduced, textScaler: TextScaler.linear(scale), size: Size(width, 800)),
    child: Scaffold(
      body: Center(
        child: SizedBox(width: width, child: child),
      ),
    ),
  ),
);

/// The rest of the list after Motion, anime.js, shadcn/ui and dqnamo's Kitchen, each held to what it promises.
void main() {
  testWidgets('a signature signs itself as it comes into view; at once with less motion; read as signed', (
    tester,
  ) async {
    const name = 'Mira Vance';
    await tester.pumpWidget(frame(const Signature(name: name, style: TextStyle(fontSize: 30), ink: Colors.black)));
    expect(find.bySemanticsLabel('Signed, $name'), findsOneWidget);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.hasRunningAnimations, isTrue, reason: 'being signed');
    await tester.pumpAndSettle();
    expect(tester.hasRunningAnimations, isFalse, reason: 'signed, it stays');

    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      frame(const Signature(name: name, style: TextStyle(fontSize: 30), ink: Colors.black), reduced: true),
    );
    await tester.pump();
    expect(tester.hasRunningAnimations, isFalse, reason: 'signed at once');
  });

  testWidgets('the palette: Down chooses a place under Go to, Return goes there; its keys are shown', (tester) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final c = await start(tester);
    await openSearch(tester);
    await type(tester, 'plan');
    expect(find.byType(Kbd), findsWidgets);
    expect(find.byIcon(Icons.keyboard_return), findsOneWidget, reason: 'Return, to open');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    final chosen = tester.widgetList<ListTile>(find.byType(ListTile)).where((t) => t.selected).toList();
    expect(chosen, hasLength(1), reason: 'the first place chosen');
    final where = (chosen.single.title! as Text).data!;
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Search the whole novel'), findsNothing, reason: 'gone to $where');
    expect(currentLocation(c), isNot('/organize'));
  });

  testWidgets('an empty page draws its ring and rules as it is shown; at once with less motion', (tester) async {
    const empty = EmptyState(icon: Icons.inbox, title: 'Nothing yet', message: 'Add the first.');
    await tester.pumpWidget(frame(empty));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(frame(empty, reduced: true));
    await tester.pump();
    expect(tester.hasRunningAnimations, isFalse);
    expect(find.text('Nothing yet'), findsOneWidget);
  });

  testWidgets('the accent glides from the tab shown before to the one shown now', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final novel = c.read(libraryServiceProvider).create({'title': 'Salt Court'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/systems');
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    final gliding = find.descendant(
      of: find.byType(IndexTabs),
      matching: find.byWidgetPredicate((w) => w is Positioned && w.height == 3),
    );
    expect(gliding, findsWidgets, reason: 'the accent on its way');
    await tester.pumpAndSettle();
    expect(gliding, findsNothing, reason: 'landed: the tab’s own edge');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a sheet rises on a spring; with less motion, at once', (tester) async {
    late AnimationStyle moving;
    late AnimationStyle still;
    await tester.pumpWidget(frame(Builder(builder: (context) => Text('${moving = sheetMotion(context)}'))));
    await tester.pumpWidget(
      frame(Builder(builder: (context) => Text('${still = sheetMotion(context)}')), reduced: true),
    );
    expect(moving.curve, Motion.settle);
    expect(still.duration, Duration.zero);
  });

  testWidgets('foil tilts towards the pointer; still with less motion', (tester) async {
    Matrix4 tilt() =>
        tester.widget<Transform>(find.descendant(of: find.byType(Foil), matching: find.byType(Transform))).transform;
    const jacket = Foil(
      child: SizedBox(width: 120, height: 180, child: ColoredBox(color: Colors.brown)),
    );
    await tester.pumpWidget(frame(jacket));
    final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
    await mouse.addPointer(location: tester.getTopLeft(find.byType(Foil)) + const Offset(110, 20));
    await mouse.moveBy(const Offset(1, 1));
    await tester.pumpAndSettle();
    expect(tilt().entry(0, 2), isNot(0), reason: 'turned towards the pointer');
    await mouse.removePointer();

    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(frame(jacket, reduced: true));
    final still = await tester.createGesture(kind: PointerDeviceKind.mouse);
    await still.addPointer(location: tester.getTopLeft(find.byType(Foil)) + const Offset(110, 20));
    await still.moveBy(const Offset(1, 1));
    await tester.pumpAndSettle();
    expect(tilt().entry(0, 2), 0, reason: 'not turned');
    await still.removePointer();
  });

  testWidgets('a stamp holds its picture within its perforated edge; a ticket fits a phone at twice the text', (
    tester,
  ) async {
    await tester.pumpWidget(
      frame(
        const Center(
          child: Stamp(
            paper: Colors.white,
            frame: Colors.brown,
            child: ColoredBox(color: Colors.teal),
          ),
        ),
      ),
    );
    expect(tester.getSize(find.byType(Stamp)), const Size(140, 140));
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(
      frame(
        const Ticket(
          paper: Colors.white,
          main: Text('Sprint complete +1,240 words', style: TextStyle(fontSize: 26)),
          stub: Text('in 25 minutes · 50 words a minute'),
        ),
        scale: 2,
      ),
    );
    expect(tester.takeException(), isNull, reason: 'its words wrap within it');
  });

  testWidgets('the cassette’s reels turn as each sentence begins, and stand still between', (tester) async {
    Widget tape(int at) => frame(Cassette(sentence: at, wound: at / 10, color: Colors.black));
    await tester.pumpWidget(tape(0));
    await tester.pumpWidget(tape(1));
    await tester.pump(const Duration(milliseconds: 200));
    expect(tester.hasRunningAnimations, isTrue, reason: 'turning');
    await tester.pumpAndSettle();
    expect(tester.hasRunningAnimations, isFalse, reason: 'still between sentences');
  });

  testWidgets('a number that changes settles into its new figure; read as itself; at once with less motion', (
    tester,
  ) async {
    await tester.pumpWidget(frame(const ScrambleText('120')));
    expect(find.text('120'), findsOneWidget, reason: 'the first time, simply there');
    await tester.pumpWidget(frame(const ScrambleText('135')));
    await tester.pump(const Duration(milliseconds: 60));
    final midway = tester.widget<Text>(find.byType(Text)).data!;
    expect(midway, isNot('135'));
    expect(midway[0], '1', reason: 'what did not change stays');
    expect(find.bySemanticsLabel('135'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('135'), findsOneWidget);

    await tester.pumpWidget(frame(const ScrambleText('135'), reduced: true));
    await tester.pumpWidget(frame(const ScrambleText('150'), reduced: true));
    await tester.pump();
    expect(find.text('150'), findsOneWidget);
  });
}
