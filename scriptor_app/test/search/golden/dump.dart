// The golden for search, the index of names, "Go to" and the tutorial's lesson for a page, made by the Flutter app's
// own Dart (plain dart.exe over the package; see run.sh in the scratchpad). For every novel given: its blocks, the
// results of its queries in every scope, and its index of names. `misc`: how "Go to" scores and picks places, the
// lesson for each address, and the buttons each lesson names. jumps.dart and spotlight.dart need Flutter, so their
// scoring and naming are copied here word for word; search.dart, book_index.dart and topics.dart are the package's.

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/features/tutorial/topics.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show categoriesOf;
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/search/search.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/text/book_index.dart';

// ---------------------------------------------------------------------------------------------------- jumps.dart

typedef J = ({String title, String kind, List<String> words});

List<String> _wordsOf(String text) => [
  for (final m in RegExp(r'[\p{L}\p{N}]+', unicode: true).allMatches(text.toLowerCase())) m[0]!,
];

int jumpScore(J jump, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return 0;
  final title = jump.title.toLowerCase();
  if (title == q) return 100;
  if (title.startsWith(q)) return 80;
  final asked = _wordsOf(q);
  if (asked.isEmpty) return 0;
  final named = _wordsOf(jump.title);
  bool begins(List<String> words) => asked.every((a) => words.any((w) => w.startsWith(a)));
  if (begins(named)) return 60;
  if (begins([...named, ..._wordsOf(jump.kind), for (final w in jump.words) ..._wordsOf(w)])) return 40;
  final letters = q.replaceAll(RegExp(r'\s'), '');
  if (letters.length >= 3) {
    var at = 0;
    for (final ch in title.split('')) {
      if (at < letters.length && ch == letters[at]) at++;
    }
    if (at == letters.length) return 10;
  }
  return 0;
}

const jumpsShown = 6;

List<J> jumpsFor(String query, List<J> jumps) {
  final scored = [
    for (final (i, j) in jumps.indexed)
      if (jumpScore(j, query) case final s when s > 0) (jump: j, score: s, at: i),
  ]..sort((a, b) => b.score != a.score ? b.score - a.score : a.at - b.at);
  return [for (final s in scored.take(jumpsShown)) s.jump];
}

// ---------------------------------------------------------------------------------------------------- spotlight.dart

List<List<String>> namesIn(Topic topic) => [
  for (final step in topic.steps)
    [
      for (final n in tutorialButtonNames)
        if (step.contains(n)) n,
    ],
];

// ---------------------------------------------------------------------------------------------------- as JSON

JsonMap blockJson(SearchBlock b) => {
  'id': b.id,
  'entityType': b.entityType.name,
  'entityId': b.entityId,
  'entityTitle': b.entityTitle,
  'entityKind': b.entityKind,
  'group': b.group,
  'field': b.field.name,
  'label': b.label,
  'index': b.index,
  'text': b.text,
};

JsonMap resultJson(GroupResult g) => {
  'group': g.group,
  'matchCount': g.matchCount,
  'items': [
    for (final e in g.items)
      {
        'entityType': e.entityType.name,
        'entityId': e.entityId,
        'title': e.title,
        'kind': e.kind,
        'group': e.group,
        'matchCount': e.matchCount,
        'snippets': [
          for (final s in e.snippets)
            {
              'blockId': s.blockId,
              'field': s.field.name,
              'label': s.label,
              'index': s.index,
              'before': s.before,
              'parts': [
                for (final p in s.parts) {'text': p.text, 'hit': p.hit},
              ],
              'after': s.after,
              'term': s.term,
            },
        ],
      },
  ],
};

JsonMap indexJson(BookIndex i) {
  Object entry(IndexEntry e) => {
    'term': e.term,
    'count': e.count,
    'places': [
      for (final p in e.places) {'number': p.number, 'nodeId': p.nodeId, 'block': p.block, 'count': p.count},
    ],
  };
  return {
    'entries': [for (final e in i.entries) entry(e)],
    'lookAlikes': [
      for (final l in i.lookAlikes) [l.a.term, l.b.term],
    ],
  };
}

/// The queries asked of a novel: fixed ones, and words and pairs taken from its own blocks (every fifth block's first
/// word of four letters or more, and its first two words), so every novel is searched for what it holds.
List<String> queriesOf(List<SearchBlock> blocks) {
  final out = <String>['a', 'the', 'road wall', 'zzzz nothing', '  ', 'ink', 'bell', 'Wren', 'WREN hollis', 'of the'];
  for (var i = 0; i < blocks.length && out.length < 40; i += 5) {
    final words = [for (final m in RegExp(r'[A-Za-z’]{4,}').allMatches(blocks[i].text)) m[0]!];
    if (words.isEmpty) continue;
    if (!out.contains(words.first)) out.add(words.first);
    if (words.length > 1) {
      final pair = '${words[0]} ${words[1]}'.toLowerCase();
      if (!out.contains(pair)) out.add(pair);
    }
  }
  return out;
}

JsonMap reads(NovelSnapshot s) {
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final plans = {for (final r in s.rows('chapterPlans')) str(r['id']): r};
  final categories = categoriesOf(s);
  final names = {for (final r in s.rows('loreEntries')) str(r['id']): str(r['name'])};
  final blocks = [
    for (final r in s.rows('chapters')) ...nodeBlocks(StoryNode(r), docs[r['id']], plans[r['id']]),
    for (final r in s.rows('loreEntries'))
      ...entryBlocks(Entry(r), categories[r['category']] ?? Category.unknown(str(r['category'])), (id) => names[id]),
  ];
  final index = SearchIndex(blocks);
  final results = <String, Object?>{};
  for (final q in queriesOf(blocks)) {
    for (final scope in SearchScope.values) {
      results['${scope.name}|$q'] = [for (final g in index.search(q, scope)) resultJson(g)];
    }
  }
  final nodes = [for (final r in s.rows('chapters')) StoryNode(r)];
  final order = [
    for (final n in readingOrder(nodes))
      if (isDocument(n.kind)) n.id,
  ];
  final pages = {for (final r in s.rows('chapterContents')) str(r['id']): blockTexts(r['doc'])};
  final bookIdx = bookIndex([for (final id in order) (id: id, paragraphs: pages[id] ?? const <String>[])]);
  return {
    'blocks': [for (final b in blocks) blockJson(b)],
    'results': results,
    'index': indexJson(bookIdx),
  };
}

JsonMap misc() {
  J j(String title, String kind, List<String> words) => (title: title, kind: kind, words: words);
  final jumps = <J>[
    j('Library', 'Area', []),
    j('Write', 'Area', []),
    j('Organize', 'Area', []),
    j('Plan', 'Organize', []),
    j('Places', 'Visualize', ['map', 'locations']),
    j('Plot lanes', 'Visualize', ['threads', 'arcs', 'lanes']),
    j('Analytics', 'Analytics', ['stats', 'statistics', 'streak', 'numbers']),
    j('Trailer', 'Keepsake', ['film', 'movie', 'poster']),
    j('The book quiz', 'Keepsake', ['quiz', 'game', 'test', 'who said it', 'trivia', 'play']),
    j('Wren Hollis', 'Character', []),
    j('Chapter 12: Ünder the Sea', 'Chapter 12', ['chapter', '12']),
    j('Ilse Marrow', 'Character', []),
    j('The Provost’s Table', 'Chapter 10', ['chapter', '10']),
  ];
  final queries = [
    'p', 'pl', 'plan', 'Plo', 'plot lanes', 'lan', 'arcs', 'pltln', 'pz', '   ', 'movie', 'stats', 'wren', 'w h',
    'hollis', 'chapter 12', 'under', 'ünder', 'provost', 'the', 'quiz game', 'mrrw', 'ilse marrow', 'x', 'ana',
  ];
  return {
    'scores': [
      for (final q in queries) [for (final x in jumps) jumpScore(x, q)],
    ],
    'picked': [
      for (final q in queries) [for (final x in jumpsFor(q, jumps)) x.title],
    ],
    'topicFor': {
      for (final p in [
        '/', '/write', '/write/read', '/write/book', '/organize', '/organize/world', '/organize/world/entry/abc',
        '/organize/world/kinds?kind=x', '/organize/character/abc?tab=history', '/organize/modules/mystery?tool=cases',
        '/organize/systems', '/organize/relationship/r1', '/visualize', '/visualize/', '/visualize/kinds',
        '/visualize/timeline', '/visualize/places', '/visualize/journeys', '/plan', '/plan/threads', '/plan/thread/t1',
        '/plan/board', '/plan/chapter/c1', '/plan/event/e1', '/plan/calendar', '/plan/histories', '/review',
        '/review/records', '/review/timeline', '/review/canon', '/review/continuity', '/review/consequences?node=n',
        '/review/team', '/review/proof', '/progress', '/progress/analytics', '/keepsakes', '/settings',
        '/settings/import-export', '/somewhere-new', '/write/names',
      ])
        p: topicFor(p).id,
    },
    'names': {for (final t in tutorialTopics) t.id: namesIn(t)},
    'queryTerms': [
      for (final q in ['', 'A a  b', 'Wren wren WREN', 'one two three four five six seven eight nine ten eleven twelve thirteen'])
        queryTerms(q),
    ],
  };
}

/// As ../../characters/golden: canonical JSON (keys sorted, whole numbers without a fraction), FNV-1a over UTF-16
/// code units.
String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

/// With FULL set in the environment, everything is written whole (to compare with SEARCH_DART); else as hashes.
void main(List<String> args) {
  final full = Platform.environment.containsKey('FULL');
  final out = <String, Object?>{'misc': misc()};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final r = reads(s);
    out[name] = full ? r : {for (final MapEntry(:key, :value) in r.entries) key: hashOf(value)};
  }
  File(args.first).writeAsStringSync(jsonEncode(out));
}
