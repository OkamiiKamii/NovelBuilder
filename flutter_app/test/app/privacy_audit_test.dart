// The app stays on the device: no network code, no AI, nothing printed, links in the prose never opened, and the
// release builds asking for no network permission. Reads the source and platform files, so a change that breaks any
// of this fails here.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Iterable<File> _dart(String dir) =>
    Directory(dir).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'));

void main() {
  final lib = {for (final f in _dart('lib')) f.path.replaceAll(r'\', '/'): f.readAsStringSync()};

  test('the app code opens no network connection and launches no web address', () {
    final network = RegExp(
      r'''HttpClient|\bSocket\b|RawSocket|ServerSocket|HttpServer|RawDatagramSocket|WebSocket|'''
      r'''package:http/|package:dio/|package:url_launcher/|launchUrl|package:web_socket''',
    );
    final found = [
      for (final MapEntry(:key, :value) in lib.entries)
        for (final m in network.allMatches(value)) '$key: ${m[0]}',
    ];
    expect(found, isEmpty);
    expect(lib.length, greaterThan(200), reason: 'the whole app is read');
  });

  test('nothing is printed or logged: story text in an error message never reaches a log', () {
    final printing = RegExp(r'''\bprint\(|debugPrint\(|dart:developer|\bstdout\b|\bstderr\b''');
    final found = [
      for (final MapEntry(:key, :value) in lib.entries)
        for (final m in printing.allMatches(value)) '$key: ${m[0]}',
    ];
    expect(found, isEmpty);
  });

  test('no AI or model packages, and no network packages chosen by the app', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final dependencies = RegExp(r'^dependencies:\n((?:  .*\n|\s*\n|#.*\n)*)', multiLine: true).firstMatch(pubspec)![1]!;
    final banned = RegExp(
      r'^\s+(http|dio|url_launcher|web_socket_channel|firebase\w*|sentry\w*|\w*analytics\w*|\w*openai\w*|'
      r'\w*anthropic\w*|\w*gemini\w*|google_generative_ai|\w*genai\w*|\w*llm\w*|tflite\w*|google_mlkit\w*|langchain\w*):',
      multiLine: true,
    );
    expect(dependencies, allOf(contains('go_router'), contains('super_editor')), reason: 'the list is read');
    expect([for (final m in banned.allMatches(dependencies)) m[1]], isEmpty);
  });

  test('links in the prose are never opened: the editor has no link-tap handler', () {
    final editors = [
      for (final MapEntry(:key, :value) in lib.entries)
        if (RegExp(r'\bSuper(Editor|Reader)\(').hasMatch(value)) key,
    ];
    expect(editors, ['lib/features/write/chapter_editor.dart']);
    expect(lib['lib/features/write/chapter_editor.dart'], contains('contentTapDelegateFactories: const []'));
  });

  test('release builds ask for no network permission (Android, Mac)', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest, isNot(contains('android.permission.INTERNET')));
    final entitlements = File('macos/Runner/Release.entitlements').readAsStringSync();
    expect(entitlements, isNot(contains('network.client')));
    expect(entitlements, isNot(contains('network.server')));
  });
}
