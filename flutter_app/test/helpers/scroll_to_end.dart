import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Scrolls the page that [inside] is in to its end, again and again as what is built there grows (`Gradually` builds
/// on as the page nears the end of what is built), until [done] or the end stays where it is. Returns the scrolls
/// it took.
Future<int> scrollToEnd(WidgetTester tester, Finder inside, {bool Function()? done}) async {
  var scrolls = 0;
  for (var i = 0; i < 400; i++) {
    if (done?.call() ?? false) break;
    final position = Scrollable.of(tester.element(inside.first), axis: Axis.vertical).position;
    final before = position.maxScrollExtent;
    position.jumpTo(before);
    scrolls++;
    await tester.pump();
    await tester.pump();
    if (done == null && position.maxScrollExtent == before) break;
  }
  await tester.pumpAndSettle();
  return scrolls;
}
