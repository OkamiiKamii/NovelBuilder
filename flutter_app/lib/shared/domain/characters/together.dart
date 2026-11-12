import '../model/story_order.dart';
import 'cast.dart';

/// Two characters the book puts on the page together: in how many chapters, and which (by number, in order).
typedef Together = ({String a, String b, List<int> chapters});

/// Together this many chapters or more, with no tie recorded, is worth asking about.
const togetherAtLeast = 3;

/// The key of a pair, whichever way round it is given.
String pairKey(String a, String b) => a.compareTo(b) < 0 ? '$a|$b' : '$b|$a';

/// For every pair in [cast], the chapters both are in (linked or named there), when there are any. Read from where
/// each character is ([Listed.seenIn]); chapters, not scenes, so two people in different scenes of one chapter count.
Map<String, List<int>> chaptersTogether(List<Listed> cast, StoryOrder order) {
  final where = <String, Set<int>>{
    for (final l in cast) l.entry.id: <int>{for (final id in l.seenIn) ?order.chapterNumber[id]},
  };
  final people = [
    for (final l in cast)
      if (where[l.entry.id]!.isNotEmpty) l.entry.id,
  ];
  final out = <String, List<int>>{};
  for (var i = 0; i < people.length; i++) {
    final mine = where[people[i]]!;
    for (var j = i + 1; j < people.length; j++) {
      final both = mine.intersection(where[people[j]]!);
      if (both.isNotEmpty) out[pairKey(people[i], people[j])] = both.toList()..sort();
    }
  }
  return out;
}

/// TIES THE BOOK SHOWS: pairs of characters together in [togetherAtLeast] chapters or more who have no relationship
/// recorded and have not been set aside ([setAside], by [pairKey]); the most together first, then by first chapter.
/// It only says what is on the page together; whether they are tied, and how, is the author's to say.
List<Together> untiedTogether(
  List<Listed> cast,
  StoryOrder order, {
  required Set<String> related,
  Set<String> setAside = const {},
}) {
  final out = <Together>[];
  for (final MapEntry(key: key, value: chapters) in chaptersTogether(cast, order).entries) {
    if (chapters.length < togetherAtLeast || related.contains(key) || setAside.contains(key)) continue;
    final [a, b] = key.split('|');
    out.add((a: a, b: b, chapters: chapters));
  }
  out.sort((x, y) {
    final more = y.chapters.length.compareTo(x.chapters.length);
    return more != 0 ? more : x.chapters.first.compareTo(y.chapters.first);
  });
  return out;
}
