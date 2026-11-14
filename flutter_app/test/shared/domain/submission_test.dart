import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/submission.dart';

void main() {
  test('a genre’s usual length; most adult fiction when it says nothing', () {
    expect(lengthFor('Fantasy'), (genre: 'Fantasy and science fiction', low: 90000, high: 120000));
    expect(lengthFor('Cozy Mystery').low, 70000);
    expect(lengthFor('Young Adult Fantasy').genre, 'Young adult', reason: 'the reader first');
    expect(lengthFor('LitRPG').high, 120000);
    expect(lengthFor(''), (genre: 'Most adult fiction', low: 70000, high: 100000));
  });

  test('the kit: each thing ready or not, and what is said of it', () {
    final kit = submissionKit(
      title: 'The Drowned Road',
      author: '',
      genre: 'Fantasy',
      words: 9645,
      synopsis: List.filled(71, 'word').join(' '),
      openingSlips: 2,
    );
    expect(
      [for (final k in kit) (k.item, k.ready)],
      [
        (KitItem.title, true),
        (KitItem.author, false),
        (KitItem.genre, true),
        (KitItem.length, false),
        (KitItem.synopsis, false),
        (KitItem.opening, false),
      ],
    );
    expect(
      kit[3].said,
      '9,645 words. Fantasy and science fiction usually runs 90,000 to 120,000, when the draft is done.',
    );
    expect(kit[4].said, '71 words. A page is about 300 to 600, the ending told.');
    expect(kit[5].said, '2 slips to put right in the first 3 chapters.');

    final ready = submissionKit(
      title: 'A',
      author: 'R. Hollis',
      genre: 'Thriller',
      words: 82000,
      synopsis: List.filled(450, 'word').join(' '),
      openingSlips: 0,
    );
    expect(ready.every((k) => k.ready), isTrue);
    expect(
      submissionKit(title: 'Untitled', author: 'x', genre: 'x', words: 0, synopsis: '', openingSlips: 0).first.ready,
      isFalse,
    );
  });

  test('the query letter: the book’s own details in the shape agents ask for, the rest left as gaps', () {
    final letter = queryLetter(
      title: 'The Drowned Road',
      author: 'R. Hollis',
      genre: 'Fantasy',
      more: ['Adventure', 'Mystery'],
      words: 104321,
      finished: true,
      synopsis: 'Once in a generation the sea goes out. Wren means to finish the chart.',
    );
    expect(letter, startsWith('Dear [[the agent’s name]],'));
    expect(
      letter,
      contains(
        'I am seeking representation for THE DROWNED ROAD, a fantasy novel with elements of adventure and mystery, '
        'complete at 104,000 words. It will appeal to readers of [[two or three recent books like it]].',
      ),
    );
    expect(letter, contains('Once in a generation the sea goes out. Wren means to finish the chart.'));
    expect(letter, endsWith('With best wishes,\nR. Hollis'));

    final draft = queryLetter(title: '', author: '', genre: 'Epic fantasy', words: 9000, finished: false, synopsis: '');
    expect(draft, contains('[[the title]], an epic fantasy novel, complete at [[its length]] words'));
    expect(draft, contains('[[the story in two short paragraphs'));
    expect(draft, endsWith('[[your name]]'));
  });
}
