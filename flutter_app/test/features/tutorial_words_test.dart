import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/tutorial/topics.dart';

/// The tutorial names buttons and pages; each must still be in the app, so a lesson never sends someone to look for
/// something that is gone or renamed.
void main() {
  test('every button a lesson names is still in the app', () {
    final app = [
      for (final f in Directory('lib').listSync(recursive: true))
        if (f is File && f.path.endsWith('.dart') && !f.path.endsWith('topics.dart')) f.readAsStringSync(),
    ].join('\n');
    final lessons = [
      for (final t in tutorialTopics) [t.what, ...t.steps, t.example, ?t.where].join(' '),
    ].join(' ');
    for (final label in tutorialButtonNames) {
      expect(lessons.contains(label), isTrue, reason: 'the lessons mention “$label”');
      expect(app.contains(label), isTrue, reason: '“$label” is named in the tutorial but is not in the app');
    }
  });
}
