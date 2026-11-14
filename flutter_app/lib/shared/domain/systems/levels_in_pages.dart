/// LEVELS IN YOUR PAGES: everything a book's chapters give a level to, kept as the book is written and never by hand:
/// an armor and its versions ("Archer Armor", "Hunter Armor"), a skill, a weapon, a spell, a character. Where it is
/// now, and every step it took, each with its chapter and the sentence that says so. It changes only when the pages
/// say it changed: write in chapter 100 that the Hunter Armor reached Level 100, and from chapter 100 it is at 100.
///
/// Read the ways these books write a level:
///
/// - "the Hunter Armor reached Level 100" (and rose to, hit, climbed to, is now, became, evolved to, dropped to…);
/// - "Hunter Armor Level 2", "Hunter Armor Lv. 2", "Hunter Armor (Lv 2)", "[Hunter Armor: Level 2]";
/// - "a Level 3 Hunter Armor";
/// - "the Hunter Armor's level rose to 4";
/// - "the Hunter Armor leveled up", "[Hunter Armor Level Up!]": one level up from where it was.
///
/// The name is what comes before (or after) the level, capitalised, up to four words ("of" and "the" between them
/// allowed): the words that open a sentence ("Then", "Now"…), "the", "his" and the like are left off, and an owner
/// too ("James's Hunter Armor" is the Hunter Armor). Names that share their last word are versions of one thing
/// (Archer Armor and Hunter Armor are both Armor). A level lower than one the pages already gave, where the sentence
/// does not say it fell, is marked.
///
/// **Whose it is**, so it is kept on that character's page: a character's own level when the name is theirs ("Kade
/// reached Level 5"); else the owner the pages name ("Kade's Hunter Armor", weighing most), the characters named in the
/// sentence that gives the level, else in its paragraph, else the one the chapter is seen through (`pov.dart`: "his
/// Hunter Armor reached Level 2" is the wearer's), clearly ahead. The author's word over all of it: a thing given to
/// someone, or to no one.
///
/// Reads only.
library;

import 'dart:convert';

import '../characters/pov.dart';
import '../manuscript/prose.dart';

/// A step a thing took: the chapter (1 first) and its id, the paragraph, the level, and the sentence that says so;
/// [up] when the page said only that it leveled up; [backwards] when it is lower than before and the page does not
/// say it fell.
typedef LevelStep = ({int chapter, String nodeId, int block, int level, String sentence, bool up, bool backwards});

/// A thing the pages give a level to: its name, what it is a version of ('' when it stands alone), its steps (the
/// first mention and every change, in the book's order), how often the pages give it a level, whose it is (a
/// character's id; null when no one's), and whether it is that character's own level.
typedef Levelled = ({String name, String family, List<LevelStep> steps, int mentions, String? owner, bool self});

/// The weight of an owner the pages name ("Kade's Hunter Armor"), of a character named in the same sentence, in the
/// same paragraph, and of the one the chapter is seen through, toward whose a thing is.
const _ownerWeights = (named: 5, sentence: 2, paragraph: 1, eyes: 1);

/// A chapter for the reading: its id and paragraphs.
typedef LevelChapter = ({String id, List<String> paragraphs});

const _word = r"[\p{Lu}][\p{L}\p{N}’'\-]*";
const _name = '($_word(?:\\s+(?:of\\s+the\\s+|of\\s+|the\\s+)?$_word){0,3})';
const _level = r'(?:[Ll][Ee][Vv][Ee][Ll]|[Ll][Vv][Ll]?[.․]?|LVL[.․]?)';

/// Stands for the stop of "Lv." while sentences are found (one character for one, so nothing moves), and is put back.
const _stop = '․';
const _verbs =
    r'(?:is\s+now\s+at|was\s+now\s+at|reached|reaches|reach|hit|hits|rose\s+to|rises\s+to|rise\s+to|climbed\s+to|'
    r'climbs\s+to|climb\s+to|grew\s+to|grows\s+to|grow\s+to|advance\s+to|'
    r'(?:leveled|levelled)\s+up\s+to|advanced\s+to|advances\s+to|is\s+now|was\s+now|is\s+at|was\s+at|became|becomes|'
    r'evolved\s+to|evolved\s+into|upgraded\s+to|went\s+up\s+to|jumped\s+to|dropped\s+to|fell\s+to|'
    r'went\s+down\s+to|is|was|at)';

final _patterns = <({RegExp re, bool up})>[
  // "the Hunter Armor reached Level 100"
  (
    re: RegExp(
      '$_name(?:’s|\'s)?\\s+(?:(?:has|had|have|just|finally|now|already)\\s+)*$_verbs\\s+(?:the\\s+)?$_level\\s*(\\d{1,5})\\b',
      unicode: true,
    ),
    up: false,
  ),
  // "the Hunter Armor's level rose to 4"
  (
    re: RegExp(
      '$_name(?:’s|\'s)\\s+level\\s+(?:had\\s+|has\\s+)?(?:rose|went\\s+up|increased|reached|is\\s+now|was\\s+now|jumped|'
      'climbed|grew|dropped|fell|went\\s+down|is|was)(?:\\s+to)?\\s+(\\d{1,5})\\b',
      unicode: true,
    ),
    up: false,
  ),
  // "a Level 3 Hunter Armor"
  (
    re: RegExp('\\b(?:a|an|the|his|her|their|its|my|your|our)\\s+$_level\\s*(\\d{1,5})\\s+$_name', unicode: true),
    up: false,
  ),
  // "Hunter Armor Level 2", "Hunter Armor (Lv. 2)", "[Hunter Armor: Level 2]"
  (re: RegExp('$_name\\s*[\\(\\[:—–\\-]?\\s*$_level\\s*(\\d{1,5})\\b', unicode: true), up: false),
  // "the Hunter Armor leveled up", "[Hunter Armor Level Up!]"
  (
    re: RegExp(
      '$_name(?:’s|\'s)?\\s+(?:(?:has|had|just|finally)\\s+)*(?:(?:leveled|levelled)\\s+up(?!\\s+to)|[Ll]evel\\s+[Uu]p)',
      unicode: true,
    ),
    up: true,
  ),
];

const _openers = {
  'then',
  'now',
  'finally',
  'when',
  'after',
  'suddenly',
  'at',
  'with',
  'as',
  'and',
  'but',
  'so',
  'once',
  'soon',
  'the',
  'his',
  'her',
  'their',
  'its',
  'my',
  'your',
  'our',
  'a',
  'an',
  'this',
  'that',
  'by',
  'in',
  'on',
  'if',
  'while',
  'before',
  'still',
  'yet',
  'even',
  'only',
  'just',
  'there',
  'here',
  'meanwhile',
  'later',
  'today',
  'tonight',
};
const _notNames = {
  'he',
  'she',
  'it',
  'i',
  'you',
  'they',
  'we',
  'level',
  'lv',
  'lvl',
  'status',
  'system',
  'warning',
  'notice',
  'congratulations',
};
final _fell = RegExp(
  r'\b(dropped|drops|fell|falls|lost|loses|reduced|down|decreased|weakened|regressed|downgraded)\b',
  caseSensitive: false,
);
final _sentence = RegExp(r'[^.!?…\]]+[.!?…\]]+["”’]*|[^.!?…\]]+$');

/// The name a match gives, cleaned: the opening words and an owner left off; null when nothing is left.
String? cleanLevelName(String raw) {
  final words = raw.trim().split(RegExp(r'\s+')).toList();
  while (words.isNotEmpty && _openers.contains(words.first.toLowerCase())) {
    words.removeAt(0);
  }
  // An owner: "James's Hunter Armor" is the Hunter Armor.
  final owner = words.lastIndexWhere((w) => RegExp(r'(’s|\x27s)$').hasMatch(w));
  if (owner >= 0 && owner < words.length - 1) words.removeRange(0, owner + 1);
  while (words.isNotEmpty && const {'of', 'the'}.contains(words.last.toLowerCase())) {
    words.removeLast();
  }
  if (words.isEmpty) return null;
  final name = words.join(' ').replaceAll(RegExp(r'(’s|\x27s)$'), '');
  if (_notNames.contains(name.toLowerCase())) return null;
  return name;
}

/// The owner a match names, if any: the word before "'s" ("James's Hunter Armor" is James's).
String? ownerIn(String raw) {
  final words = raw.trim().split(RegExp(r'\s+'));
  final at = words.lastIndexWhere((w) => RegExp(r'(’s|\x27s)$').hasMatch(w));
  if (at < 0 || at == words.length - 1) return null;
  return words[at].replaceAll(RegExp(r'(’s|\x27s)$'), '');
}

/// What a thing is a version of: its last word, when another name the pages level shares it.
String _head(String name) => name.split(' ').last;

RegExp _named(String name) => RegExp('(?<![\\p{L}])${RegExp.escape(name)}(?![\\p{L}])', unicode: true);

/// Everything [chapters] (in reading order) give a level to, in the order the book first does, but those set aside
/// ([setAside], by name in lower case); whose each is, among [people], unless [assigned] says (by name in lower case:
/// a character's id, or '' for no one's).
List<Levelled> levelsInPages(
  List<LevelChapter> chapters, {
  Set<String> setAside = const {},
  List<EyesPerson> people = const [],
  Map<String, String> assigned = const {},
}) {
  final steps = <String, List<LevelStep>>{};
  final names = <String, String>{};
  final mentions = <String, int>{};
  // Whose each thing is: a score for each character.
  final scores = <String, Map<String, int>>{};
  final finds = {
    for (final p in people) p.id: [for (final n in p.names) _named(n)],
  };
  bool namedIn(String text, String id) => finds[id]!.any((f) => f.hasMatch(text));
  // Whose eyes each chapter is seen through, only when there is someone to give a thing to.
  final eyes = people.isEmpty
      ? const <String, String?>{}
      : {
          for (final e in chapterEyes([
            for (final c in chapters) (id: c.id, title: '', paragraphs: c.paragraphs),
          ], people))
            e.nodeId: e.who,
        };
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, paragraph) in chapter.paragraphs.indexed) {
      // "Lv. 2" is not the end of a sentence: the stop before a number is left off, so the sentence is read whole.
      final text = paragraph.replaceAllMapped(RegExp(r'\b([Ll][Vv][Ll]?|LVL)\.(?=\s*\d)'), (m) => '${m[1]}$_stop');
      for (final s in _sentence.allMatches(text)) {
        final sentence = s[0]!.trim();
        if (sentence.isEmpty) continue;
        // Each place in the sentence read once, by the first way of writing that finds it.
        final taken = <(int, int)>[];
        final found = <({int at, String name, int? level, bool up, String? owner})>[];
        for (final p in _patterns) {
          for (final m in p.re.allMatches(sentence)) {
            if (taken.any((t) => m.start < t.$2 && t.$1 < m.end)) continue;
            // Which group is the name and which the number depends on the way of writing.
            final g = [for (var i = 1; i <= m.groupCount; i++) m[i]];
            final number = g.where((x) => x != null && RegExp(r'^\d+$').hasMatch(x)).firstOrNull;
            final raw = g.where((x) => x != null && !RegExp(r'^\d+$').hasMatch(x)).firstOrNull;
            final name = raw == null ? null : cleanLevelName(raw);
            if (name == null) continue;
            taken.add((m.start, m.end));
            found.add((
              at: m.start,
              name: name,
              level: number == null ? null : int.parse(number),
              up: p.up,
              owner: ownerIn(raw!),
            ));
          }
        }
        found.sort((a, b) => a.at - b.at);
        for (final f in found) {
          final key = f.name.toLowerCase();
          if (setAside.contains(key)) continue;
          final list = steps.putIfAbsent(key, () => []);
          names.putIfAbsent(key, () => f.name);
          final last = list.lastOrNull;
          final level = f.level ?? (last == null ? null : last.level + 1);
          if (level == null) continue;
          mentions.update(key, (n) => n + 1, ifAbsent: () => 1);
          // Whose it is, from this mention: the owner named, else who is in the sentence, else in the paragraph,
          // else whose eyes the chapter is seen through. The thing's own name is not someone in the sentence.
          if (people.isNotEmpty) {
            final score = scores.putIfAbsent(key, () => {});
            void add(String id, int by) => score.update(id, (n) => n + by, ifAbsent: () => by);
            final around = sentence.replaceAll(_named(f.name), ' ');
            var anyone = false;
            for (final p in people) {
              if (f.owner != null && p.names.any((n) => n.toLowerCase() == f.owner!.toLowerCase())) {
                add(p.id, _ownerWeights.named);
                anyone = true;
              } else if (namedIn(around, p.id)) {
                add(p.id, _ownerWeights.sentence);
                anyone = true;
              }
            }
            if (!anyone) {
              final whole = paragraph.replaceAll(_named(f.name), ' ');
              for (final p in people) {
                if (namedIn(whole, p.id)) {
                  add(p.id, _ownerWeights.paragraph);
                  anyone = true;
                }
              }
            }
            final who = anyone ? null : eyes[chapter.id];
            if (who != null) add(who, _ownerWeights.eyes);
          }
          // A step only when the level changes: saying it again is not a step.
          if (last != null && last.level == level) continue;
          list.add((
            chapter: c + 1,
            nodeId: chapter.id,
            block: b,
            level: level,
            sentence: sentence.replaceAll(_stop, '.'),
            up: f.level == null,
            backwards: last != null && level < last.level && !_fell.hasMatch(sentence),
          ));
        }
      }
    }
  }
  final keys = [
    for (final MapEntry(key: k, value: v) in steps.entries)
      if (v.isNotEmpty) k,
  ];
  final heads = <String, int>{};
  for (final k in keys) {
    final name = names[k]!;
    if (name.contains(' ')) heads.update(_head(name).toLowerCase(), (n) => n + 1, ifAbsent: () => 1);
  }
  ({String? owner, bool self}) whose(String key) {
    // A character's own level: the name is theirs.
    final self = people.where((p) => p.names.any((n) => n.toLowerCase() == key)).firstOrNull;
    // The author's word first.
    if (assigned[key] case final id?) return (owner: id.isEmpty ? null : id, self: self != null && self.id == id);
    if (self != null) return (owner: self.id, self: true);
    final ranked = (scores[key] ?? const <String, int>{}).entries.toList()..sort((a, b) => b.value - a.value);
    final top = ranked.firstOrNull;
    if (top == null) return (owner: null, self: false);
    final second = ranked.length > 1 ? ranked[1].value : 0;
    return top.value * 2 >= second * 3 && top.value > second
        ? (owner: top.key, self: false)
        : (owner: null, self: false);
  }

  return [
    for (final k in keys)
      if (whose(k) case final w)
        (
          name: names[k]!,
          family: (heads[_head(names[k]!).toLowerCase()] ?? 0) >= 2 ? _head(names[k]!) : '',
          steps: steps[k]!,
          mentions: mentions[k] ?? 0,
          owner: w.owner,
          self: w.self,
        ),
  ];
}

/// [levelsInPages] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], among [people], with [assigned]. A job for an isolate.
List<Levelled> Function() levelsInPagesJob(
  List<String> storedContents,
  List<String> order,
  Set<String> setAside, {
  List<EyesPerson> people = const [],
  Map<String, String> assigned = const {},
}) => () {
  final wanted = order.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = [
        for (final b in docBlocks(row['doc']))
          if (!b.heading) b.text,
      ];
    } on FormatException {
      continue;
    }
  }
  return levelsInPages(
    [for (final id in order) (id: id, paragraphs: pages[id] ?? const <String>[])],
    setAside: setAside,
    people: people,
    assigned: assigned,
  );
};
