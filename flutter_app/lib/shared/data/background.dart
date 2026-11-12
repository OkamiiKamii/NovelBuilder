import 'dart:isolate';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Runs [job] away from the screen: work that reads a whole book (every chapter) must not hold up the thread that
/// draws the app and answers presses, or Android reports the app as not responding. [job] takes and returns only
/// plain data (strings, numbers, lists, maps, records), as a separate isolate needs.
typedef RunAside = Future<R> Function<R>(R Function() job);

/// The app runs such work in its own isolate. Tests may run it in place (it is the same function either way).
final runAsideProvider = Provider<RunAside>(
  (ref) =>
      <R>(R Function() job) => Isolate.run(job),
);
