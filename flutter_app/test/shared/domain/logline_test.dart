import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/logline.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';

void main() {
  String said(List<LoglinePiece> pieces) => pieces.map((p) => p.gap ? '[${p.text}]' : p.text).join();

  test('a whole profile reads as one sentence', () {
    final pieces = loglineOf(
      name: 'Mark',
      age: '21',
      gender: 'Male',
      who: 'A locksmith’s apprentice',
      stakes: {Stake.wants: 'To open the last door.', Stake.inTheWay: 'The Architect.', Stake.atStake: 'His sister.'},
    );
    expect(
      loglineText(pieces),
      'Mark, 21, a locksmith’s apprentice, wants to open the last door, but the Architect stands in his way. '
      'If he fails, he loses his sister.',
    );
  });

  test('what the profile does not say is a gap, asked in their pronouns; no age, none said', () {
    expect(
      said(loglineOf(name: 'Mark', age: '21', gender: 'Male', who: '', stakes: {})),
      'Mark, 21, [who he is], wants [what he wants], but [what is in the way] stands in his way. If he fails, he loses '
      '[what is at stake].',
    );
    expect(
      said(loglineOf(name: 'Wren', age: '', gender: 'Female', who: 'the mapmaker', stakes: {Stake.wants: 'out'})),
      'Wren, the mapmaker, wants out, but [what is in the way] stands in her way. If she fails, she loses '
      '[what is at stake].',
    );
    final they = loglineOf(name: 'Sefa', age: '', gender: '', who: '', stakes: {});
    expect(said(they), contains('[who they are], wants [what they want]'));
    expect(said(they), contains('stands in their way. If they fail, they lose'));
    expect(loglineText(they), isNull, reason: 'not a sentence until it is whole');
  });

  test('an answer as it reads in the sentence', () {
    expect(inSentence('To open the last door.'), 'to open the last door');
    expect(inSentence('Revenge on his father'), 'revenge on his father');
    expect(inSentence('The Architect'), 'the Architect');
    expect(inSentence('Kai’s betrayal'), 'Kai’s betrayal', reason: 'a name stays');
    expect(inSentence('Old Tam'), 'Old Tam');
    expect(inSentence('NASA'), 'NASA');
    expect(inSentence('  his   sister;  '), 'his sister');
  });
}
