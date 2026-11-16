import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';

/// READINGS OF THE BOOK, KEPT: what a screen worked out by reading the whole book away from the screen (where each
/// character is named, what they say, how they talk, how they look), kept by everything it was read from. The key
/// holds what the reading is made of (the kind of reading, the novel, its chapters, the names asked for…) and the
/// store's count of writes to the text, so a chapter written is a new key: a reading is never shown for text it was
/// not read from.
///
/// So: a page gone back to, or a character stepped back to, shows what was read at once, in its first frame; a reading
/// all the cast share (how everyone talks, against everyone else) is read once for all of them, not once a character;
/// and two pages asking for the same reading at the same moment share one. The [capacity] most recently used are kept.
class KeptReadings {
  static const capacity = 64;

  // In the order last used (a map literal keeps its order).
  final _done = <Object, Object?>{};
  final _running = <Object, Future<Object?>>{};

  /// How many readings have been run (for a test to see one kept or shared).
  int runs = 0;

  /// Whether a reading for [key] is kept.
  bool has(Object key) => _done.containsKey(key);

  /// The reading kept for [key], or null.
  T? done<T>(Object key) {
    if (!_done.containsKey(key)) return null;
    final value = _done.remove(key);
    _done[key] = value;
    return value as T?;
  }

  /// The reading for [key]: kept, under way, or begun now with [run].
  Future<T> read<T>(Object key, Future<T> Function() run) {
    if (_done.containsKey(key)) return Future.value(done<T>(key) as T);
    final running = _running[key];
    if (running != null) return running.then((v) => v as T);
    runs++;
    final future = run();
    _running[key] = future;
    future.then(
      (value) {
        _running.remove(key);
        _done[key] = value;
        while (_done.length > capacity) {
          _done.remove(_done.keys.first);
        }
      },
      // Not kept: asked again, it is read again. (The one who asked is told by the future returned.)
      onError: (Object _, StackTrace _) {
        _running.remove(key);
      },
    );
    return future;
  }
}

/// Made anew with the store (whose counts of writes start again with it).
final keptReadingsProvider = Provider<KeptReadings>((ref) {
  ref.watch(novelStoreProvider);
  return KeptReadings();
});
