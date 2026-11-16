import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/kept_readings.dart';

/// Readings of the book kept by what they were read from: kept, shared while under way, the oldest let go, and a
/// reading that failed not kept.
void main() {
  test('a reading is kept by its key, and asked again is not read again', () async {
    final kept = KeptReadings();
    var reads = 0;
    Future<int> read() async => ++reads;
    expect(kept.done<int>('a'), isNull);
    expect(await kept.read('a', read), 1);
    expect(await kept.read('a', read), 1, reason: 'kept');
    expect(kept.done<int>('a'), 1);
    expect(await kept.read(('a', 2), read), 2, reason: 'another key: read');
    expect(kept.runs, 2);
  });

  test('two asking at once share one reading', () async {
    final kept = KeptReadings();
    final gate = Completer<String>();
    var reads = 0;
    Future<String> read() {
      reads++;
      return gate.future;
    }

    final one = kept.read('voices', read);
    final two = kept.read('voices', read);
    expect(reads, 1, reason: 'the second joins the first');
    gate.complete('everyone');
    expect(await one, 'everyone');
    expect(await two, 'everyone');
    expect(kept.done<String>('voices'), 'everyone');
  });

  test('the most recently used are kept; the oldest go', () async {
    final kept = KeptReadings();
    for (var i = 0; i < KeptReadings.capacity; i++) {
      await kept.read(i, () async => i);
    }
    expect(kept.done<int>(0), 0, reason: 'used again: now the most recent');
    await kept.read('one more', () async => -1);
    expect(kept.has(0), isTrue);
    expect(kept.has(1), isFalse, reason: 'the least recently used, let go');
    expect(kept.has('one more'), isTrue);
  });

  test('a reading that failed is not kept: asked again, it is read again', () async {
    final kept = KeptReadings();
    var reads = 0;
    Future<int> read() async {
      reads++;
      if (reads == 1) throw StateError('the book could not be read');
      return reads;
    }

    await expectLater(kept.read('a', read), throwsStateError);
    expect(kept.has('a'), isFalse);
    expect(await kept.read('a', read), 2);
  });
}
