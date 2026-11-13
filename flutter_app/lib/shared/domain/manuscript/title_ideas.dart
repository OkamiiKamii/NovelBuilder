/// NAME THIS CHAPTER: a chapter called "Chapter 7" is a chapter its writer has not had a moment to name. Its own pages
/// hold its title already, most of the time: what is most present in it, the thing it has that no other chapter has,
/// the phrase it ends on. These are offered as ideas, each the author's own words; nothing is made up, and nothing is
/// named until the author picks one.
///
/// Reads only.
library;

import 'dart:convert';
import 'dart:math' as math;

import 'prose.dart';

/// Whether [title] is a stand-in rather than a name: nothing, "Untitled…", or a kind and a number ("Chapter 1",
/// "Ch. 12", "Scene iv", "Chapter One").
bool placeholderTitle(String title) {
  final t = title.trim().toLowerCase();
  if (t.isEmpty || t.startsWith('untitled')) return true;
  return RegExp(
    r'^(chapter|ch\.?|chap\.?|scene|part|section)\s*(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|'
    r'eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)?\s*[:.]?$',
  ).hasMatch(t);
}

/// The most ideas offered.
const titleIdeasShown = 5;

/// The fewest words a chapter has before it is offered names: too little written, and there is nothing to name.
const titleIdeasMinWords = 80;

/// A word kept small inside a title.
const _small = {
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'by', 'from', 'with', 'into', 'over', //
  'under', 'upon', 'as', 'off',
};

/// Words too common to name anything: the glue of English and the stock of every story's sentences.
final _common = <String>{
  ...const [
    // Words that describe rather than name: "the sixth day", "the kind of", "the real reason".
    'kind', 'sort', 'sixth', 'second', 'third', 'fourth', 'fifth', 'seventh', 'eighth', 'ninth', 'tenth', 'short', //
    'real', 'small', 'large', 'young', 'whole', 'half', 'full', 'best', 'worst', 'rest', 'only', 'same', 'next', //
    'other', 'first', 'last', 'little', 'big', 'new', 'old', 'own', 'few', 'more', 'most', 'many', 'much', 'such', //
    'very', 'thin', 'dark', 'cold', 'high', 'deep', 'wide', 'empty', 'quiet', 'strange', 'single', 'whole', //
    'about', 'above', 'across', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already', 'also', 'always', //
    'among',
    'another',
    'anyone',
    'anything',
    'around',
    'asked',
    'away',
    'back',
    'because',
    'been',
    'before',
    'began', //
    'behind', 'being', 'below', 'beside', 'better', 'between', 'beyond', 'both', 'cannot', 'could', 'didn', 'doing', //
    'done', 'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever', 'every', 'everyone', 'everything', //
    'eyes', 'face', 'felt', 'first', 'from', 'gave', 'getting', 'give', 'going', 'gone', 'good', 'great', 'hand', //
    'hands', 'have', 'having', 'head', 'heard', 'hers', 'herself', 'himself', 'into', 'just', 'keep', 'kept', 'knew', //
    'know', 'known', 'last', 'later', 'least', 'left', 'less', 'like', 'little', 'long', 'look', 'looked', 'looking', //
    'made', 'make', 'many', 'maybe', 'might', 'more', 'most', 'much', 'must', 'myself', 'need', 'never', 'next', //
    'nothing', 'once', 'only', 'other', 'others', 'over', 'perhaps', 'place', 'quite', 'rather', 'really', 'right', //
    'said', 'same', 'seemed', 'seen', 'should', 'side', 'since', 'some', 'someone', 'something', 'soon', 'still', //
    'such', 'sure', 'take', 'taken', 'tell', 'than', 'that', 'their', 'them', 'themselves', 'then', 'there', 'these', //
    'they', 'thing', 'things', 'think', 'this', 'those', 'though', 'thought', 'through', 'time', 'told', 'took', //
    'toward', 'towards', 'turned', 'under', 'until', 'upon', 'very', 'voice', 'wanted', 'warm', 'well', 'went', //
    'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'whole', 'whom', 'whose', 'will', 'with', 'within', //
    'without', 'word', 'words', 'would', 'year', 'years', 'your', 'yours', 'yourself', 'away', 'came', 'come', //
    'comes', 'does', 'feet', 'find', 'found', 'have', 'here', 'himself', 'it’s', 'it\'s', 'just', 'last', 'let’s', //
    'moment',
    'mind',
    'nobody',
    'none',
    'nowhere',
    'onto',
    'open',
    'part',
    'past',
    'people',
    'point',
    'room',
    'seems', //
    'shall', 'shook', 'smiled', 'speak', 'spoke', 'stood', 'stop', 'tried', 'turn', 'walked', 'walking', 'wasn’t', //
    'watched', 'what’s', 'yes', 'yet', 'answer', 'answered', 'began', 'began', 'called', 'decided', 'enough', //
    'everything', 'least', 'nodded', 'reached', 'replied', 'sound', 'started', 'thank', 'together', 'trying', 'wait', //
  ],
};

final _word = RegExp(r"[\p{L}][\p{L}'’\-]*", unicode: true);

String _titled(String phrase) {
  final words = phrase.trim().split(RegExp(r'\s+'));
  return [
    for (final (i, w) in words.indexed)
      if (i > 0 && _small.contains(w.toLowerCase()))
        w.toLowerCase()
      else if (w.isEmpty)
        w
      else
        '${w[0].toUpperCase()}${w.substring(1)}',
  ].join(' ');
}

final _sentenceEnd = RegExp(r'[.!?…]+["”’»)\]]*(?=\s|$)');

List<String> _sentences(String text) {
  final out = <String>[];
  var from = 0;
  for (final m in _sentenceEnd.allMatches(text)) {
    final s = text.substring(from, m.end).trim();
    if (s.isNotEmpty) out.add(s);
    from = m.end;
  }
  final rest = text.substring(from).trim();
  if (rest.isNotEmpty) out.add(rest);
  return out;
}

/// Words that begin the phrase a sentence can end on ("towards the Inn", "into the dark").
const _lead = {
  'towards', 'toward', 'into', 'across', 'beyond', 'beneath', 'under', 'over', 'through', 'after', 'before', //
  'behind', 'below', 'above', 'among', 'against', 'without', 'within', 'from', 'of', 'to', 'at', 'in', 'on', //
};

/// The phrase [sentence] ends on, from its last leading word ("…walking towards the Inn." → "Towards the Inn"), when
/// it runs two to five words and is not all small words.
String? _endPhrase(String sentence) {
  final words = [for (final m in _word.allMatches(sentence.replaceAll(RegExp(r'["“”‘’]'), ' '))) m[0]!];
  for (var i = words.length - 2; i >= math.max(0, words.length - 5); i--) {
    if (!_lead.contains(words[i].toLowerCase())) continue;
    final phrase = words.sublist(i);
    if (phrase.length < 2) return null;
    // Shaped as a place or a thing: the word after the lead a determiner ("the Inn", "its open crown") or a name.
    final next = phrase[1];
    final named = next[0] != next[0].toLowerCase() && phrase.skip(1).every((w) => w[0] != w[0].toLowerCase());
    if (!_determiners.contains(next.toLowerCase()) && !named) return null;
    if (phrase.skip(1).every((w) => _small.contains(w.toLowerCase()) || _determiners.contains(w.toLowerCase()))) {
      return null;
    }
    return _titled(phrase.join(' '));
  }
  return null;
}

/// The words a thing's name follows: "the bell", "her lamp".
const _determiners = {'the', 'a', 'an', 'his', 'her', 'its', 'their', 'my', 'our', 'your', 'this', 'that'};

/// Ideas for naming a chapter, best first, none twice: [present] are the names of those most present on its pages
/// (`in_chapter.dart`'s order, places and things before people where they tie), [paragraphs] its text, and [others]
/// the other chapters' texts (each joined), against which its own words stand out.
List<String> titleIdeas({
  required List<String> paragraphs,
  required List<String> others,
  List<String> present = const [],
}) {
  final text = paragraphs.join('\n');
  final ideas = <String>[];
  void add(String? idea) {
    final t = idea?.trim() ?? '';
    if (t.isEmpty || t.length > 40) return;
    if (ideas.any((i) => i.toLowerCase() == t.toLowerCase())) return;
    ideas.add(t);
  }

  // What is most present on its pages.
  for (final name in present.take(2)) {
    add(name);
  }

  // The words this chapter has that the others have little of: how often here, against how many chapters have them.
  // Counted only where they follow a determiner ("the bell", "her lamp"), as things are named, so the verbs and the
  // adverbs are left out; and never a word written with a capital mid-sentence anywhere (a name: those come from
  // [present]), nor a word with an apostrophe ("can't").
  final words = [for (final m in _word.allMatches(text)) m];
  final names = <String>{};
  for (final (i, m) in words.indexed) {
    final w = m[0]!;
    final start = i == 0 || RegExp(r'[.!?…"“]\s*$').hasMatch(text.substring(math.max(0, m.start - 3), m.start));
    if (!start && w[0] != w[0].toLowerCase()) names.add(w.toLowerCase());
  }
  final counts = <String, int>{};
  for (final (i, m) in words.indexed) {
    if (i == 0 || !_determiners.contains(words[i - 1][0]!.toLowerCase())) continue;
    final w = m[0]!.toLowerCase();
    if (w.length < 4 || w.contains("'") || w.contains('’') || _common.contains(w) || _small.contains(w)) continue;
    if (names.contains(w)) continue;
    counts[w] = (counts[w] ?? 0) + 1;
  }
  final elsewhere = [for (final o in others) o.toLowerCase()];
  double weight(String w, int n) {
    final pattern = RegExp('(?<![\\p{L}])${RegExp.escape(w)}(?![\\p{L}])', unicode: true);
    final having = elsewhere.where(pattern.hasMatch).length;
    return n * math.log((elsewhere.length + 1) / (having + 1) + 1);
  }

  final standing = [
    for (final MapEntry(key: w, value: n) in counts.entries)
      if (n >= 2) (w, weight(w, n)),
  ]..sort((a, b) => b.$2.compareTo(a.$2));
  for (final (w, _) in standing.take(2)) {
    add('The ${_titled(w)}');
  }

  // The phrase it ends on, then the one it opens on.
  final paragraphsWithText = [
    for (final p in paragraphs)
      if (p.trim().isNotEmpty) p,
  ];
  if (paragraphsWithText.isNotEmpty) {
    final last = _sentences(paragraphsWithText.last);
    if (last.isNotEmpty) add(_endPhrase(last.last));
    final first = _sentences(paragraphsWithText.first);
    if (first.isNotEmpty) add(_endPhrase(first.first));
  }
  return ideas.take(titleIdeasShown).toList();
}

/// [titleIdeas] for the chapter [nodeId], over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads
/// them), as a job for an isolate. Only plain data in and out.
List<String> Function() titleIdeasJob(List<String> storedContents, String nodeId, List<String> present) => () {
  List<String>? mine;
  final others = <String>[];
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map) continue;
      final paragraphs = [
        for (final b in docBlocks(row['doc']))
          if (!b.heading) b.text,
      ];
      if (row['id'] == nodeId) {
        mine = paragraphs;
      } else {
        others.add(paragraphs.join('\n'));
      }
    } on FormatException {
      continue;
    }
  }
  if (mine == null) return const [];
  final words = mine.join(' ').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
  if (words < titleIdeasMinWords) return const [];
  return titleIdeas(paragraphs: mine, others: others, present: present);
};
