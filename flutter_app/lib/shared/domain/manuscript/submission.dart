/// THE SUBMISSION KIT: what an agent or a publisher asks a novelist for, and how far the book has come: its title, the
/// author's name, its genre, a length the genre expects, a synopsis of about a page, and opening chapters without the
/// slips a proofreader marks (`text/proof.dart`). And the query letter that goes with them, laid out from the book's
/// own details in the shape agents ask for, with the parts only the author can write left as gaps ("[[ ]]", as the
/// editor marks a gap). Nothing is written for the author.
///
/// Reads only.
library;

/// A genre's usual length, in words, for a first novel sent to agents (adult fiction unless it says otherwise).
typedef GenreLength = ({String genre, int low, int high});

const _lengths = <(List<String>, GenreLength)>[
  (['middle grade'], (genre: 'Middle grade', low: 30000, high: 55000)),
  (['young adult', 'ya'], (genre: 'Young adult', low: 60000, high: 90000)),
  (
    ['fantasy', 'science fiction', 'sci-fi', 'scifi', 'litrpg', 'progression', 'space opera'],
    (genre: 'Fantasy and science fiction', low: 90000, high: 120000),
  ),
  (['romance'], (genre: 'Romance', low: 70000, high: 100000)),
  (['mystery', 'thriller', 'crime', 'suspense'], (genre: 'Mystery and thriller', low: 70000, high: 90000)),
  (['horror'], (genre: 'Horror', low: 80000, high: 100000)),
  (['literary'], (genre: 'Literary fiction', low: 80000, high: 100000)),
  (['historical'], (genre: 'Historical fiction', low: 80000, high: 100000)),
];

/// What [genre] usually runs to; most adult fiction when the genre says nothing.
GenreLength lengthFor(String genre) {
  final g = genre.toLowerCase();
  for (final (words, length) in _lengths) {
    if (words.any((w) => RegExp('\\b${RegExp.escape(w)}\\b').hasMatch(g))) return length;
  }
  return (genre: 'Most adult fiction', low: 70000, high: 100000);
}

/// What the kit holds.
enum KitItem {
  title('A title'),
  author('Your name'),
  genre('A genre'),
  length('A length the genre expects'),
  synopsis('A synopsis of about a page'),
  opening('Clean opening chapters');

  const KitItem(this.label);

  final String label;
}

/// One thing in the kit: what it is, whether it is ready, and what is said of it.
typedef KitCheck = ({KitItem item, bool ready, String said});

/// The words a one-page synopsis runs to, about.
const synopsisLow = 300;
const synopsisHigh = 600;

/// The chapters an agent asks to see first.
const openingChapters = 3;

final _word = RegExp(r"[\p{L}\p{N}][\p{L}\p{N}’'\-]*", unicode: true);
int _count(String text) => _word.allMatches(text).length;

String _thousands(int n) => n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

/// The kit of a book called [title] by [author], of [genre], [words] long, its [synopsis], with [openingSlips] slips in
/// its first chapters.
List<KitCheck> submissionKit({
  required String title,
  required String author,
  required String genre,
  required int words,
  required String synopsis,
  required int openingSlips,
}) {
  final length = lengthFor(genre);
  final s = _count(synopsis);
  final named = title.trim().isNotEmpty && title.trim().toLowerCase() != 'untitled';
  return [
    (item: KitItem.title, ready: named, said: named ? title.trim() : 'The book has no title yet.'),
    (
      item: KitItem.author,
      ready: author.trim().isNotEmpty,
      said: author.trim().isEmpty ? 'The name the book goes out under.' : author.trim(),
    ),
    (
      item: KitItem.genre,
      ready: genre.trim().isNotEmpty,
      said: genre.trim().isEmpty ? 'Agents look for books in the genres they sell.' : genre.trim(),
    ),
    (
      item: KitItem.length,
      ready: words >= length.low && words <= length.high,
      said:
          '${_thousands(words)} words. ${length.genre} usually runs ${_thousands(length.low)} to '
          '${_thousands(length.high)}${words > length.high
              ? ': some cutting first'
              : words < length.low
              ? ', when the draft is done'
              : ''}.',
    ),
    (
      item: KitItem.synopsis,
      ready: s >= synopsisLow && s <= synopsisHigh + 200,
      said: s == 0
          ? 'None yet. Agents ask for the whole story, ending and all, in about $synopsisLow to $synopsisHigh words.'
          : '$s words. ${s < synopsisLow
                ? 'A page is about $synopsisLow to $synopsisHigh, the ending told.'
                : s > synopsisHigh + 200
                ? 'Longer than a page: about $synopsisLow to $synopsisHigh.'
                : 'About a page.'}',
    ),
    (
      item: KitItem.opening,
      ready: openingSlips == 0,
      said: openingSlips == 0
          ? 'Nothing a proofreader would mark in the first $openingChapters chapters.'
          : '${openingSlips == 1 ? 'One slip' : '$openingSlips slips'} to put right in the first $openingChapters chapters.',
    ),
  ];
}

/// The query letter of a book called [title] by [author] of [genre] (and [more] genres), [words] long ([finished]
/// when the draft is done), told by its [synopsis]. The parts only the author can write are gaps.
String queryLetter({
  required String title,
  required String author,
  required String genre,
  List<String> more = const [],
  required int words,
  required bool finished,
  required String synopsis,
}) {
  final name = title.trim().isEmpty ? '[[the title]]' : title.trim().toUpperCase();
  final kind = genre.trim().isEmpty ? '[[genre]]' : genre.trim().toLowerCase();
  final also = [
    for (final g in more)
      if (g.trim().isNotEmpty && g.trim().toLowerCase() != kind) g.trim().toLowerCase(),
  ];
  final article = RegExp('^[aeiou]').hasMatch(kind) ? 'an' : 'a';
  final elements = also.isEmpty
      ? ''
      : ' with elements of ${also.length == 1 ? also.single : '${also.sublist(0, also.length - 1).join(', ')} and ${also.last}'}';
  final length = finished
      ? 'complete at ${_thousands(((words / 1000).round()) * 1000)} words'
      : 'complete at [[its length]] words';
  // The pitch: the synopsis, cut at a sentence near the length a query gives it.
  final pitch = StringBuffer();
  var count = 0;
  for (final m in RegExp(r'[^.!?…]+[.!?…]+["”’]*\s*|[^.!?…]+$').allMatches(synopsis.trim())) {
    final n = _count(m[0]!);
    if (count > 0 && count + n > 220) break;
    pitch.write(m[0]);
    count += n;
  }
  final story = pitch.isEmpty
      ? '[[the story in two short paragraphs: who it is about, what they want, what stands in the way, and what is '
            'at stake]]'
      : pitch.toString().trim();
  return [
    'Dear [[the agent’s name]],',
    'I am seeking representation for $name, $article $kind novel$elements, $length. It will appeal to readers of '
        '[[two or three recent books like it]].',
    story,
    '[[a few lines about you: what you have written, and why you are the one to write this book]]',
    'Thank you for your time. The opening chapters and a synopsis are ready to send.',
    'With best wishes,\n${author.trim().isEmpty ? '[[your name]]' : author.trim()}',
  ].join('\n\n');
}
