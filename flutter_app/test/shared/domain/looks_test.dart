import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/looks.dart';

List<LookSighting> read(List<String> paragraphs, {List<String> others = const ['Ilse', 'Kai']}) =>
    looksIn({'c1': paragraphs}, ['c1'], ['Wren Hollis', 'Wren'], others: others);

void main() {
  test('colour families: the last colour word, and colours that can be the same', () {
    expect(colourFamily('Steel grey'), 'grey');
    expect(colourFamily('pale blue'), 'blue');
    expect(colourFamily('Raven-black'), 'black');
    expect(colourFamily('like her mother’s'), isNull);
    expect(sameColour('dark', 'black'), isTrue);
    expect(sameColour('silver', 'white'), isTrue);
    expect(sameColour('blue', 'brown'), isFalse);
  });

  test('her own: by her name’s possessive, or her name the subject and “her” after it', () {
    final seen = read([
      'Wren’s grey eyes narrowed.',
      'Wren pushed back her black hair and laughed.',
      'Then Wren closed her eyes.',
    ]);
    expect(
      [for (final s in seen) (s.feature, s.family, s.said)],
      [(Feature.eyes, 'grey', 'grey eyes'), (Feature.hair, 'black', 'her black hair')],
    );
  });

  test('not hers: someone else’s eyes, a pronoun before her name, another person between', () {
    expect(read(['She looked at Wren for a long time with eyes like wet black stones.']), isEmpty);
    expect(read(['Wren looked into Ilse’s blue eyes.']), isEmpty);
    expect(read(['Wren watched Kai push back his red hair.']), isEmpty);
  });

  test('a colour after the word, as in “her eyes were green”; but red eyes are tears', () {
    expect(read(['Wren turned, and her eyes were a hard bright green.']).single.family, 'green');
    expect(read(['Wren had cried until her eyes were red.']), isEmpty);
  });

  group('checkLooks', () {
    const grey = (feature: Feature.eyes, family: 'grey', said: 'grey eyes', nodeId: 'c1', block: 0, sentence: '');
    const blue = (feature: Feature.eyes, family: 'blue', said: 'blue eyes', nodeId: 'c7', block: 3, sentence: '');
    const black = (feature: Feature.hair, family: 'black', said: 'black hair', nodeId: 'c2', block: 1, sentence: '');

    test('the page against the profile: agreeing, at odds, and said only on the page', () {
      final checks = checkLooks([grey, blue, black], {Feature.eyes: 'Grey'});
      final eyes = checks.firstWhere((c) => c.feature == Feature.eyes);
      expect(eyes.verdict, LookVerdict.differs);
      expect(eyes.family, 'blue');
      expect(eyes.sightings.single.nodeId, 'c7');
      final hair = checks.firstWhere((c) => c.feature == Feature.hair);
      expect((hair.verdict, hair.family), (LookVerdict.unrecorded, 'black'));
      expect(checkLooks([grey], {Feature.eyes: 'storm grey'}).single.verdict, LookVerdict.agrees);
    });

    test('a recorded value it cannot read is left be', () {
      expect(checkLooks([grey], {Feature.eyes: 'like her mother’s'}), isEmpty);
    });
  });
}
