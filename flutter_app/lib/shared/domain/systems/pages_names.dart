/// IN YOUR PAGES, NOT IN THE SYSTEM: the skills, titles, classes and items a progression story's chapters name the
/// system's way, that its blueprint does not hold yet. A system begun from the pages (`from_pages.dart`) is in step
/// with them on the day it begins; every skill written after that had to be added by hand. Read here:
///
/// - the system's messages: "[Skill acquired: Tide Sense (E)]", "Title earned: Giant Slayer", "Class unlocked:
///   Warden", "Item obtained: Tide Glass" (the word before says which kind; a short word in brackets after is its rank);
/// - "New skill: Spark", "Skill: Spark";
/// - and a name in the system's brackets alone, "[Power Strike]", "【Tide Sense】": a skill, unless named otherwise.
///
/// Not the system's own words ("[Status]", "[Level up!]", "[Warning]"), nothing that ends as a cry or a question, and
/// nothing of more than five words. Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// What kind of thing the pages name.
enum PageThing {
  skill('Skill'),
  title('Title'),
  kit('Class'),
  item('Item');

  const PageThing(this.label);
  final String label;
}

/// A name the pages give: as written, its kind, its rank (when one is written), how often, and the first place (the
/// chapter's place from 1, its id, the paragraph, the sentence).
typedef PageName = ({
  String name,
  PageThing thing,
  String rank,
  int times,
  int chapter,
  String nodeId,
  int block,
  String said,
});

const _kinds = {
  'skill': PageThing.skill,
  'spell': PageThing.skill,
  'technique': PageThing.skill,
  'ability': PageThing.skill,
  'power': PageThing.skill,
  'title': PageThing.title,
  'class': PageThing.kit,
  'item': PageThing.item,
};

final _message = RegExp(
  r'\b(skill|spell|technique|ability|power|title|class|item)s?\s+'
  r'(?:acquired|learned|learnt|gained|unlocked|earned|obtained|received|granted|chosen|awarded)\s*:\s*'
  r'([^\]】>\n(:.!?]{2,40}?)\s*(?:\(([^)\n]{1,12})\))?\s*(?=[\]】>\n.!?]|$)',
  caseSensitive: false,
);
final _labelled = RegExp(
  r'\b(?:new\s+)?(skill|spell|technique|title|class|item)\s*:\s*([A-Z][^\]】>\n(:.!?]{1,40}?)\s*(?:\(([^)\n]{1,12})\))?\s*(?=[\]】>\n.!?,;]|$)',
  caseSensitive: false,
);
final _bare = RegExp(r"[\[【]([A-Z][\p{L}'’ \-]{2,40})[\]】]", unicode: true);

/// The system's own words, in its brackets.
const _systemWords = {
  'status', 'system', 'level up', 'warning', 'notice', 'alert', 'error', 'quest', 'new quest', 'quest complete', //
  'quest failed', 'achievement', 'congratulations', 'notification', 'inventory', 'skills', 'titles', 'stats',
};

/// The sentence of [text] around [at].
String _around(String text, int at) {
  final start = text.lastIndexOf(RegExp(r'[.!?…]\s'), at);
  final end = text.indexOf(RegExp(r'[.!?…](\s|$)'), at);
  return text.substring(start < 0 ? 0 : start + 1, end < 0 ? text.length : end + 1).trim();
}

/// The names [chapters] (in reading order, each its id and paragraphs) give the system's way that are not in [known]
/// (names the blueprint holds, any case) nor [setAside]; the most named first.
List<PageName> namesInPages(
  List<({String id, List<String> paragraphs})> chapters, {
  Set<String> known = const {},
  Set<String> setAside = const {},
}) {
  final skip = {
    for (final k in {...known, ...setAside}) k.trim().toLowerCase(),
  };
  final found = <String, PageName>{};
  void add(String raw, PageThing thing, String rank, int c, String id, int b, String text, int at, {bool sure = true}) {
    final name = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
    final key = name.toLowerCase();
    if (name.length < 3 || skip.contains(key) || _systemWords.contains(key)) return;
    if (name.split(' ').length > 5) return;
    final was = found[key];
    if (was == null) {
      found[key] = (
        name: name,
        thing: thing,
        rank: rank.trim(),
        times: 1,
        chapter: c + 1,
        nodeId: id,
        block: b,
        said: _around(text, at),
      );
    } else {
      found[key] = (
        name: was.name,
        // What a message says it is wins over a name in brackets alone.
        thing: sure ? thing : was.thing,
        rank: was.rank.isEmpty ? rank.trim() : was.rank,
        times: was.times + 1,
        chapter: was.chapter,
        nodeId: was.nodeId,
        block: was.block,
        said: was.said,
      );
    }
  }

  for (final (c, chapter) in chapters.indexed) {
    for (final (b, text) in chapter.paragraphs.indexed) {
      final taken = <(int, int)>[];
      for (final re in [_message, _labelled]) {
        for (final m in re.allMatches(text)) {
          if (taken.any((t) => m.start < t.$2 && m.end > t.$1)) continue;
          taken.add((m.start, m.end));
          add(m[2]!, _kinds[m[1]!.toLowerCase()] ?? PageThing.skill, m[3] ?? '', c, chapter.id, b, text, m.start);
        }
      }
      for (final m in _bare.allMatches(text)) {
        if (taken.any((t) => m.start < t.$2 && m.end > t.$1)) continue;
        add(m[1]!, PageThing.skill, '', c, chapter.id, b, text, m.start, sure: false);
      }
    }
  }
  return found.values.toList()..sort((a, b) => b.times != a.times ? b.times - a.times : a.chapter - b.chapter);
}

/// [namesInPages] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
List<PageName> Function() namesInPagesJob(
  List<String> storedContents,
  List<String> order, {
  Set<String> known = const {},
  Set<String> setAside = const {},
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
  return namesInPages(
    [for (final id in order) (id: id, paragraphs: pages[id] ?? const [])],
    known: known,
    setAside: setAside,
  );
};
