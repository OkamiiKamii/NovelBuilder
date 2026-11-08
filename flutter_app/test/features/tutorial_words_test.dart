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
    const named = [
      'New novel',
      'Begin chapter one',
      'More details',
      'Continue writing',
      'Start writing it',
      'Draw an idea',
      'Raise the curtain',
      'Desk',
      'Ask them',
      'Jot an idea',
      'Branch the story',
      'Sort & filter',
      'Covers',
      'Spines',
      'Search the novel',
      'Sprint',
      'Alternate drafts',
      'Version history',
      'Save a version',
      'Put in the manuscript',
      'New character',
      'Interview',
      'Not a character',
      'Ties',
      'Begin this world',
      'New entry',
      'Categories & fields',
      'Begin blank',
      'Draw it on the map',
      'New event',
      'New thread',
      'In good order',
      'The whole list',
      'How long it is',
      'Show the Tutorial button',
      'Import backup',
      'Export backup',
      'Begin the next chapter',
      'Enable module',
      'New statement',
      'Every connection',
      'Configure',
      'Publish',
      'Add a person',
      'Share a template',
      'Import a template file',
      'Read as a book',
      'Book details',
      'Export manuscript',
      'Record check',
      'Typewriter',
      'Resolved',
      'Intentional',
      'Needs review',
    ];
    for (final label in named) {
      expect(lessons.contains(label), isTrue, reason: 'the lessons mention “$label”');
      expect(app.contains(label), isTrue, reason: '“$label” is named in the tutorial but is not in the app');
    }
  });
}
