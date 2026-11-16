import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/background.dart';
import '../../../shared/data/kept_readings.dart';
import '../../../shared/data/providers.dart';

const _unread = Object();

/// A panel whose content is read from the whole book away from the screen (where a character is in the pages, what
/// they say, how they talk, how they look), the reading kept by what it is made of (`kept_readings.dart`): shown in the
/// panel's first frame when it was read already (for this page before, or for another of the cast where the reading is
/// the same); read again only when what it is made of changes, a chapter written among it.
///
/// A panel says what its reading is made of ([readingInputs], plain values that compare by value: strings, numbers),
/// what it is with nothing to read ([nothingRead]) and how to read it ([runReading]); calls [keepReading] first in its
/// build; and shows [reading] (null while it is being read).
mixin KeptReader<W extends ConsumerStatefulWidget, T extends Object> on ConsumerState<W> {
  /// What was read; null until it is.
  T? reading;
  Object? _readFor = _unread;

  /// The novel read.
  String get readingNovelId;

  /// What the reading is made of, or null when there is nothing to read.
  Object? readingInputs();

  /// The reading when there is nothing to read.
  T get nothingRead;

  /// Reads it, away from the screen with [run].
  Future<T> runReading(RunAside run);

  /// The key it is kept by: its inputs and the store's count of writes to the text.
  Object? _key() {
    final inputs = readingInputs();
    if (inputs == null) return null;
    return (inputs, ref.read(novelStoreProvider).versionOf(readingNovelId, const {'chapterContents'}));
  }

  /// First in the panel's build: a kept reading at once, and after the frame the reading, if what it is made of has
  /// changed (never while the page is being built).
  void keepReading() {
    if (reading == null) {
      final key = _key();
      if (key == null) {
        reading = nothingRead;
        _readFor = null;
      } else if (ref.read(keptReadingsProvider).done<T>(key) case final kept?) {
        reading = kept;
        _readFor = key;
      }
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _read();
    });
  }

  void _read() {
    final key = _key();
    if (key == _readFor) return;
    _readFor = key;
    if (key == null) {
      setState(() => reading = nothingRead);
      return;
    }
    final run = ref.read(runAsideProvider);
    ref.read(keptReadingsProvider).read<T>(key, () => runReading(run)).then(
      (found) {
        if (mounted && _readFor == key) setState(() => reading = found);
      },
      onError: (Object e, StackTrace s) =>
          FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
    );
  }
}
