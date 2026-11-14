import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/voice_print.dart';

void main() {
  final lines = {
    // Short, asking, loose.
    'wren': [
      'Is it going?',
      'Can’t we wait?',
      'Where’s the chart?',
      'We’re late, aren’t we?',
      'Go on, then.',
      'Tide’s turning?',
      'What’s that, there?',
      'I’ll go.',
    ],
    // Long, formal, plain statements.
    'crane': [
      'The road has been closed for thirty-one years and it shall remain closed for as long as I am Provost.',
      'Fear is cheaper than walls, apprentice, and considerably more reliable than any chart.',
      'You will return the chart to the archive before the evening bell, and we shall say no more of it.',
      'The tables are kept for the protection of the town, not for the amusement of cartographers.',
      'I have watched this harbour for longer than you have been alive, and the archive remembers.',
      'Nothing that the archive keeps is lost; it is merely kept from those who would misuse it.',
    ],
    'nan': ['Too few.', 'Lines.'],
  };

  test('each voice in numbers, only with enough lines; their own words', () {
    final prints = voicePrints(lines);
    expect([for (final p in prints) p.id], ['wren', 'crane'], reason: 'Nan has two lines');
    final wren = prints.first;
    expect(wren.questions, closeTo(6 / 8, 1e-9));
    expect(wren.wordsPerLine, lessThan(4));
    final crane = prints.last;
    expect(crane.contractions, 0);
    expect(crane.signature, contains('archive'));
    expect(crane.signature, contains('shall'));
  });

  test('what sets a voice apart, against the others; whom it sounds most like', () {
    final prints = voicePrints(lines);
    final names = {'wren': 'Wren', 'crane': 'Crane'};
    final wren = readVoice('wren', prints, names)!;
    expect(wren.traits, contains(startsWith('Shorter lines than the others')));
    expect(wren.traits, contains(startsWith('Asks more than the others (75%, the others 0%)')));
    expect(wren.traits, contains(startsWith('Speaks loosely: more contractions')));
    expect(wren.soundsLike, 'Crane');
    expect(wren.alike, isFalse);
    expect(readVoice('nan', prints, names), isNull, reason: 'too few lines');
  });

  test('two who talk the same: alike', () {
    final same = [for (var i = 0; i < 9; i++) 'We should go to the harbour before it is dark tonight.'];
    final prints = voicePrints({
      'a': same,
      'b': [...same],
    });
    final reading = readVoice('a', prints, {'a': 'Ann', 'b': 'Bea'})!;
    expect(reading.traits, isEmpty);
    expect((reading.soundsLike, reading.alike), ('Bea', true));
  });
}
