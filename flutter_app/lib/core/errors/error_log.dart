import 'package:flutter/foundation.dart';

/// One uncaught error, kept on this device only.
@immutable
class ErrorRecord {
  const ErrorRecord({required this.at, required this.type, required this.context, this.stack});

  final DateTime at;

  /// The error's type, e.g. `StateError`. Messages are not kept: they can quote story text.
  final String type;

  /// Where it was caught: `framework`, `platform`, `zone`, or a widget description.
  final String context;
  final StackTrace? stack;
}

/// In-memory record of the most recent uncaught errors.
///
/// It never writes to disk and never transmits. A later phase can show it in
/// Settings so the author can see that something went wrong.
class ErrorLog extends ChangeNotifier {
  ErrorLog({this.capacity = 50});

  static final ErrorLog instance = ErrorLog();

  final int capacity;
  final List<ErrorRecord> _entries = [];

  List<ErrorRecord> get entries => List.unmodifiable(_entries);

  void record(Object error, StackTrace? stack, {required String context}) {
    _entries.add(ErrorRecord(at: DateTime.now(), type: error.runtimeType.toString(), context: context, stack: stack));
    if (_entries.length > capacity) _entries.removeRange(0, _entries.length - capacity);
    notifyListeners();
  }

  void clear() {
    _entries.clear();
    notifyListeners();
  }
}
