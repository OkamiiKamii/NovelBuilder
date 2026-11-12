import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A voice that reads text aloud: the device's own (Android's text-to-speech, Windows' SAPI), or a stand-in in tests.
abstract class Speaker {
  /// Whether there is a voice to read with here.
  Future<bool> available();

  /// Says [text] at [rate] (1 the voice's own pace) and completes once it has been said, or as soon as [stop] is
  /// called. False when it could not be said.
  Future<bool> say(String text, {double rate = 1});

  /// Silence, at once.
  Future<void> stop();
}

/// The device's own voice, over `novel_builder/speech` (`MainActivity.kt`, `windows/runner/speech.cpp`). Elsewhere
/// (a Mac, the web) there is none, and it says so.
class PlatformSpeaker implements Speaker {
  PlatformSpeaker() {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'done') _pending.remove(call.arguments)?.complete(true);
    });
  }

  static const _channel = MethodChannel('novel_builder/speech');
  final _pending = <Object?, Completer<bool>>{};

  @override
  Future<bool> available() async {
    try {
      return await _channel.invokeMethod<bool>('available') ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<bool> say(String text, {double rate = 1}) async {
    final String? id;
    try {
      id = await _channel.invokeMethod<String>('speak', {'text': text, 'rate': rate});
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
    if (id == null) return false;
    return (_pending[id] = Completer<bool>()).future;
  }

  @override
  Future<void> stop() async {
    for (final c in _pending.values) {
      if (!c.isCompleted) c.complete(true);
    }
    _pending.clear();
    try {
      await _channel.invokeMethod<void>('stop');
    } on MissingPluginException {
      return;
    } on PlatformException {
      return;
    }
  }
}

final speakerProvider = Provider<Speaker>((ref) => PlatformSpeaker());
