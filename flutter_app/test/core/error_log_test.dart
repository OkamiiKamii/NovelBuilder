import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/bootstrap.dart';
import 'package:novel_builder/core/errors/error_log.dart';

void main() {
  test('keeps the error type and where it was caught, never the message', () {
    final log = ErrorLog();
    log.record(const FormatException('Chapter 3: "She opened the door"'), StackTrace.current, context: 'zone');
    expect(log.entries.single.type, 'FormatException');
    expect(log.entries.single.context, 'zone');
  });

  test('keeps only the most recent errors', () {
    final log = ErrorLog(capacity: 3);
    for (var i = 0; i < 5; i++) {
      log.record(StateError('$i'), null, context: 'test $i');
    }
    expect(log.entries.map((e) => e.context), ['test 2', 'test 3', 'test 4']);
  });

  testWidgets('framework errors are recorded by the installed handlers', (tester) async {
    final original = FlutterError.onError;
    final originalPlatform = PlatformDispatcher.instance.onError;
    final log = ErrorLog();
    installErrorHandlers(log);
    final handler = FlutterError.onError!;
    // Put the test framework's own handlers back so its checks keep working.
    FlutterError.onError = original;
    PlatformDispatcher.instance.onError = originalPlatform;

    handler(FlutterErrorDetails(exception: StateError('boom'), context: ErrorDescription('building a test')));
    expect(log.entries.single.type, 'StateError');
    expect(log.entries.single.context, 'building a test');
  });
}
