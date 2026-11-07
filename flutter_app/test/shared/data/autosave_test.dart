import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/autosave.dart';

void main() {
  test('saves once, shortly after changes stop', () {
    fakeAsync((async) {
      final saves = <String>[];
      final c = SaveController();
      c.schedule('title', () => saves.add('a'));
      async.elapse(const Duration(milliseconds: 300));
      c.schedule('title', () => saves.add('ab'));
      expect(c.status.state, SaveState.pending);
      async.elapse(const Duration(milliseconds: 599));
      expect(saves, isEmpty);
      async.elapse(const Duration(milliseconds: 1));
      expect(saves, ['ab'], reason: 'the newer change replaced the waiting one');
      expect(c.status.state, SaveState.saved);
      expect(c.status.lastSaved, isNotNull);
    });
  });

  test('a failed save is shown as failed, kept, and retried until it succeeds', () {
    fakeAsync((async) {
      var failures = 2;
      var saved = 0;
      final c = SaveController();
      c.schedule('x', () {
        if (failures-- > 0) throw StateError('disk full');
        saved++;
      });
      async.elapse(const Duration(milliseconds: 600));
      expect(c.status.state, SaveState.failed);
      expect(c.status.error, contains('disk full'));
      expect(c.hasUnsaved, isTrue);
      async.elapse(const Duration(seconds: 2));
      expect(c.status.state, SaveState.failed, reason: 'second attempt also failed');
      async.elapse(const Duration(seconds: 5));
      expect(saved, 1);
      expect(c.status.state, SaveState.saved);
      expect(c.hasUnsaved, isFalse);
    });
  });

  test('never reports saved while any write has not completed', () {
    fakeAsync((async) {
      final c = SaveController();
      c.schedule('good', () {});
      c.schedule('bad', () => throw StateError('locked'));
      async.elapse(const Duration(milliseconds: 600));
      expect(c.status.state, SaveState.failed);
      expect(c.flush(), isFalse);
    });
  });

  test('Retry and flush save immediately', () {
    fakeAsync((async) {
      var broken = true;
      var saved = false;
      final c = SaveController();
      expect(
        c.saveNow('x', () {
          if (broken) throw StateError('nope');
          saved = true;
        }),
        isFalse,
      );
      broken = false;
      expect(c.retry(), isTrue);
      expect(saved, isTrue);

      var flushed = false;
      c.schedule('y', () => flushed = true);
      expect(c.flush(), isTrue);
      expect(flushed, isTrue, reason: 'leaving the app saves what was waiting');
    });
  });

  test('disposing saves whatever was waiting', () {
    var saved = false;
    SaveController()
      ..schedule('x', () => saved = true)
      ..dispose();
    expect(saved, isTrue);
  });
}
