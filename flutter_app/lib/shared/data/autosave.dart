import 'dart:async';

import 'package:flutter/foundation.dart';

enum SaveState {
  /// Everything is saved on this device.
  saved,

  /// A change is waiting to be saved (the author is still typing).
  pending,

  /// A save is being written.
  saving,

  /// A save failed. It is kept and tried again; nothing is reported as saved until it is.
  failed,
}

@immutable
class SaveStatus {
  const SaveStatus(this.state, {this.lastSaved, this.error, this.nextRetry});

  final SaveState state;
  final DateTime? lastSaved;

  /// Why the last attempt failed, in words.
  final String? error;

  /// When the failed save will be tried again on its own.
  final DateTime? nextRetry;

  String get label => switch (state) {
    SaveState.saved => 'Saved on this device',
    SaveState.pending => 'Unsaved changes',
    SaveState.saving => 'Saving…',
    SaveState.failed => 'Not saved',
  };
}

/// AUTOSAVE: changes are saved shortly after they stop, without a Save button to forget.
///
/// Each change is scheduled under a key (what it changes); a newer change to the same key replaces the waiting one.
/// A write that throws is kept and tried again after 2, 5, 15 and then every 30 seconds, and [status] says so. The
/// status is [SaveState.saved] only when every write has actually completed. Saving is local; sync is something else.
class SaveController extends ChangeNotifier {
  SaveController({
    this.delay = const Duration(milliseconds: 600),
    this.retryDelays = const [Duration(seconds: 2), Duration(seconds: 5), Duration(seconds: 15), Duration(seconds: 30)],
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final Duration delay;
  final List<Duration> retryDelays;
  final DateTime Function() _clock;

  final Map<String, void Function()> _waiting = {};
  final Map<String, Timer> _timers = {};
  final Map<String, int> _attempts = {};
  final Map<String, String> _errors = {};
  bool _writing = false;
  DateTime? _lastSaved;
  DateTime? _nextRetry;

  SaveStatus get status {
    if (_errors.isNotEmpty) {
      return SaveStatus(SaveState.failed, lastSaved: _lastSaved, error: _errors.values.last, nextRetry: _nextRetry);
    }
    if (_writing) return SaveStatus(SaveState.saving, lastSaved: _lastSaved);
    if (_waiting.isNotEmpty) return SaveStatus(SaveState.pending, lastSaved: _lastSaved);
    return SaveStatus(SaveState.saved, lastSaved: _lastSaved);
  }

  bool get hasUnsaved => _waiting.isNotEmpty;

  /// Saves [write] after [delay] without further changes to [key].
  void schedule(String key, void Function() write) {
    _waiting[key] = write;
    _errors.remove(key);
    _attempts.remove(key);
    _timers.remove(key)?.cancel();
    _timers[key] = Timer(delay, () => _run(key));
    notifyListeners();
  }

  /// Saves [write] now. Returns whether it was saved; if not, it stays queued and is retried.
  bool saveNow(String key, void Function() write) {
    _waiting[key] = write;
    _timers.remove(key)?.cancel();
    return _run(key);
  }

  /// Tries every waiting or failed save now (on leaving a screen, or when the app is paused). Returns whether
  /// everything is saved.
  bool flush() {
    for (final key in [..._waiting.keys]) {
      _timers.remove(key)?.cancel();
      _run(key);
    }
    return _waiting.isEmpty;
  }

  /// "Retry" on a failed save.
  bool retry() => flush();

  bool _run(String key) {
    final write = _waiting[key];
    if (write == null) return true;
    _writing = true;
    notifyListeners();
    try {
      write();
      if (identical(_waiting[key], write)) _waiting.remove(key);
      _errors.remove(key);
      _attempts.remove(key);
      _lastSaved = _clock();
      if (_errors.isEmpty) _nextRetry = null;
      return true;
    } on Object catch (e) {
      final attempt = _attempts[key] = (_attempts[key] ?? 0) + 1;
      _errors[key] = _describe(e);
      final wait = retryDelays[(attempt - 1).clamp(0, retryDelays.length - 1)];
      _nextRetry = _clock().add(wait);
      _timers.remove(key)?.cancel();
      _timers[key] = Timer(wait, () => _run(key));
      return false;
    } finally {
      _writing = false;
      notifyListeners();
    }
  }

  static String _describe(Object e) {
    final text = e.toString();
    // Messages can quote story text; keep the reason short and never log it.
    return text.length > 200 ? '${text.substring(0, 200)}…' : text;
  }

  @override
  void dispose() {
    flush();
    for (final t in _timers.values) {
      t.cancel();
    }
    super.dispose();
  }
}
