import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/gazette.dart';

void main() {
  test('the paper is named for the place named most, else for the book', () {
    expect(gazetteName('Vell', 'The Drowned Road'), 'The Vell Gazette');
    expect(gazetteName('The Mimir Forest', 'x'), 'The Mimir Forest Gazette');
    expect(gazetteName(null, 'The Ash Road'), 'The Ash Road Herald');
    expect(gazetteName('', ''), 'The Morning Herald');
  });

  test('the lead story: the opening, cut at a sentence near its length', () {
    final short = leadOf(['One line here.', '', 'Another line.']);
    expect(short.lead, ['One line here.', 'Another line.']);
    expect(short.continues, isFalse);
    final long = leadOf([
      List.filled(100, 'word').join(' '),
      '${List.filled(15, 'more').join(' ')}. ${List.filled(30, 'gone').join(' ')}.',
    ]);
    expect(long.continues, isTrue);
    expect(long.lead.last, endsWith('more.'), reason: 'cut after the sentence that fits');
    expect(leadOf([List.filled(300, 'word').join(' ')]).lead, hasLength(1), reason: 'one sentence at least');
  });

  test('the weather the words bring: twice is weather, a storm over rain, else fair', () {
    expect(weatherOf('The fog came in. Fog on the quay, fog in the street.'), (
      weather: Weather.fog,
      word: 'fog',
      count: 3,
    ));
    expect(weatherOf('Rain fell. Thunder, then the storm, then rain again.').weather, Weather.storm);
    expect(weatherOf('Rain fell once.').weather, Weather.fair);
  });

  test('an edition a chapter with words: headline, deck, lead, what was said, the news', () {
    final paper = gazette(
      'The Drowned Road',
      [
        (
          id: 'c1',
          title: 'The Bell',
          paragraphs: [
            'The bell in the tower rang across Vell, and nobody in the town slept again that night.',
            '“The water is going,” Wren said.',
            '“So soon, after all,” said Ilse, and the fog came up the street. Fog everywhere.',
            'Wren went down to the quay in Vell. The salt ran white on every stone, but the sea did not care.',
          ],
        ),
        (id: 'c2', title: '', paragraphs: const []),
        (id: 'c3', title: '', paragraphs: ['Wren walked the road alone, and the mist followed her the whole way.']),
      ],
      [
        (name: 'Wren Hollis', names: ['Wren Hollis', 'Wren']),
        (name: 'Ilse Marrow', names: ['Ilse Marrow', 'Ilse']),
        (name: 'Kit Marrow', names: ['Kit Marrow', 'Kit']),
      ],
      places: [
        ['Vell'],
        ['Old Merrow'],
      ],
    );
    expect(paper.name, 'The Vell Gazette');
    expect([for (final e in paper.editions) (e.chapter, e.headline)], [(1, 'The Bell'), (3, 'Chapter 3')]);
    final first = paper.editions.first;
    expect([for (final s in first.said) s.speaker], ['Wren Hollis', 'Ilse Marrow'], reason: 'in the cast’s order');
    expect(first.said.first.words, startsWith('The water is going'));
    expect(first.said.last.words, startsWith('So soon, after all'));
    expect(first.inTheNews, [(name: 'Wren Hollis', count: 2), (name: 'Ilse Marrow', count: 1)]);
    expect((first.weather, first.weatherWord, first.weatherCount), (Weather.fog, 'fog', 2));
    expect(first.deck, isNotEmpty, reason: 'a short chapter, all in the lead: its best line all the same');
    expect(first.continues, isFalse);
  });
}
