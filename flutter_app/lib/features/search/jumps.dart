import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../app/shell/trail.dart';
import '../../app/theme/theme_choice.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/character_actions.dart' show entryPath;
import '../progress/best_lines_page.dart';
import '../progress/book_print_page.dart';
import '../progress/book_quiz_page.dart';
import '../progress/book_story.dart';
import '../progress/full_jacket.dart';
import '../progress/gazette_page.dart';
import '../progress/postcards_page.dart';
import '../progress/sampler_page.dart';
import '../progress/trailer.dart';
import '../write/write_providers.dart';
import 'book_index_page.dart';

/// GO ANYWHERE: search is not only for words. Typed into it, a place in the app or a thing to do comes first, under
/// "Go to": an area ("Plan"), a view ("Plot lanes", "Canon", "Analytics"), a chapter, a character, a place, a thread
/// or an event by its name, a keepsake ("Trailer", "Fingerprint"), the index, or a look ("Dark", "System Monolith").
/// A word the page is known by finds it too ("stats" is Analytics, "movie" the trailer, "theme" the looks). With
/// nothing typed yet, it offers where the author has just been (`trail.dart`). One press, or Return, goes there.
///
/// Read when search opens; nothing is changed but the look, when one is chosen.

/// A place to go or a thing to do: its name, what kind it is, its sign, other words it is known by, and the going.
typedef Jump = ({String title, String kind, IconData icon, List<String> words, JumpGo go});

/// Goes: from [context] (the page search was opened over), with [ref].
typedef JumpGo = void Function(BuildContext context, WidgetRef ref);

/// How many places "Go to" shows.
const jumpsShown = 6;

JumpGo _path(String path) =>
    (context, _) => GoRouter.of(context).go(path);

/// Words some pages are known by besides their names.
const _knownAs = {
  '/progress/analytics': ['stats', 'statistics', 'streak', 'numbers'],
  '/visualize/plot': ['threads', 'arcs', 'lanes'],
  '/visualize/places': ['map', 'locations'],
  '/visualize/knowledge': ['secrets', 'knows'],
  '/review/canon': ['facts', 'lore'],
  '/review/continuity': ['rules', 'mistakes', 'errors'],
  '/write/read': ['read', 'preview', 'book', 'pages'],
  '/write/book': ['details', 'dedication', 'blurb', 'synopsis', 'title'],
  '/plan/board': ['corkboard', 'cards', 'scenes'],
  '/settings': ['preferences', 'options', 'font', 'appearance', 'theme', 'export', 'import', 'backup'],
  '/progress': ['goals', 'words', 'target', 'deadline'],
};

/// Every place and thing to do in [novelId], in the order "Go to" prefers them: the areas and their views, the
/// keepsakes, the chapters, the cast and the world, threads, events, and the looks.
List<Jump> bookJumps(NovelStore store, String novelId, {VoidCallback? onKeepWriting}) {
  final jumps = <Jump>[
    for (final d in Destination.values)
      (title: d.label, kind: 'Area', icon: d.icon, words: _knownAs[d.path] ?? const [], go: _path(d.path)),
    for (final MapEntry(key: path, value: (name, kind)) in namedPages.entries)
      (
        title: name,
        kind: kind,
        icon: Destination.forLocation(path)?.icon ?? Icons.bookmark_outline,
        words: _knownAs[path] ?? const [],
        go: _path(path),
      ),
    (
      title: 'Trailer',
      kind: 'Keepsake',
      icon: Icons.play_circle_outline,
      words: const ['film', 'movie', 'poster'],
      go: (context, _) => showTrailer(context, novelId: novelId, onKeepWriting: onKeepWriting),
    ),
    (
      title: 'Best lines',
      kind: 'Keepsake',
      icon: Icons.format_quote,
      words: const ['quotes', 'quote', 'lines', 'share'],
      go: (context, _) => showBestLines(context, novelId: novelId),
    ),
    (
      title: 'The book quiz',
      kind: 'Keepsake',
      icon: Icons.quiz_outlined,
      words: const ['quiz', 'game', 'test', 'who said it', 'trivia', 'play'],
      go: (context, _) => showBookQuiz(context, novelId: novelId),
    ),
    (
      title: 'The Gazette',
      kind: 'Keepsake',
      icon: Icons.newspaper,
      words: const ['newspaper', 'gazette', 'front page', 'news', 'headline', 'paper'],
      go: (context, _) => showGazette(context, novelId: novelId),
    ),
    (
      title: 'Postcards',
      kind: 'Keepsake',
      icon: Icons.local_post_office_outlined,
      words: const ['postcard', 'places', 'greetings', 'world', 'travel'],
      go: (context, _) => showPostcards(context, novelId: novelId),
    ),
    (
      title: 'The sampler',
      kind: 'Keepsake',
      icon: Icons.picture_as_pdf_outlined,
      words: const ['sample', 'pdf', 'beta reader', 'agent', 'query', 'send', 'opening'],
      go: (context, _) => showSampler(context, novelId: novelId),
    ),
    (
      title: 'Your book so far',
      kind: 'Keepsake',
      icon: Icons.auto_stories_outlined,
      words: const ['story', 'recap', 'wrapped'],
      go: (context, _) => showBookStory(context, novelId: novelId, onKeepWriting: onKeepWriting),
    ),
    (
      title: 'Fingerprint',
      kind: 'Keepsake',
      icon: Icons.fingerprint,
      words: const ['print', 'colours'],
      go: (context, _) => showBookPrint(context, novelId: novelId),
    ),
    (
      title: 'Full jacket',
      kind: 'Keepsake',
      icon: Icons.menu_book_outlined,
      words: const ['cover', 'spine', 'back'],
      go: (context, _) => showFullJacket(context, novelId: novelId),
    ),
    (
      title: 'The index',
      kind: 'Every name, A to Z',
      icon: Icons.format_list_bulleted,
      words: const ['names', 'spelling'],
      go: (context, ref) => showBookIndex(
        context,
        novelId: novelId,
        onOpen: (nodeId, term, block) {
          ref.read(pendingFindProvider.notifier).request((nodeId: nodeId, term: term, block: block));
          ref.read(selectedNodeProvider.notifier).select(nodeId);
          GoRouter.of(context).go(Destination.write.path);
        },
      ),
    ),
  ];
  final nodes = [for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)];
  for (final (i, n) in [
    for (final n in readingOrder(nodes))
      if (isDocument(n.kind)) n,
  ].indexed) {
    jumps.add((
      title: n.displayTitle,
      kind: 'Chapter ${i + 1}',
      icon: Icons.edit_note,
      words: ['chapter', '${i + 1}'],
      go: (context, ref) {
        ref.read(selectedNodeProvider.notifier).select(n.id);
        GoRouter.of(context).go(Destination.write.path);
      },
    ));
  }
  for (final r in store.rowsIn(novelId, 'loreEntries')) {
    final name = str(r['name']).trim();
    if (name.isEmpty) continue;
    final character = r['category'] == 'character';
    final category = str(r['category']);
    jumps.add((
      title: name,
      kind: character
          ? 'Character'
          : category.isEmpty
          ? 'Entry'
          : '${category[0].toUpperCase()}${category.substring(1)}',
      icon: character ? Icons.person_outline : Icons.public,
      words: const [],
      go: _path(entryPath(str(r['id']), character: character)),
    ));
  }
  for (final r in store.rowsIn(novelId, 'plotThreads')) {
    final title = str(r['title']).trim();
    if (title.isEmpty) continue;
    jumps.add((
      title: title,
      kind: 'Thread',
      icon: Icons.timeline,
      words: const ['thread'],
      go: _path('/plan/thread/${str(r['id'])}'),
    ));
  }
  for (final r in store.rowsIn(novelId, 'timelineEvents')) {
    final title = str(r['title']).trim();
    if (title.isEmpty) continue;
    jumps.add((
      title: title,
      kind: 'Event',
      icon: Icons.event_outlined,
      words: const ['event'],
      go: _path('/plan/event/${str(r['id'])}'),
    ));
  }
  for (final t in ThemeChoice.values) {
    jumps.add((
      title: t.label,
      kind: 'Look',
      icon: Icons.palette_outlined,
      words: const ['theme', 'look', 'appearance', 'colours', 'mode'],
      go: (context, ref) => ref.read(themeChoiceProvider.notifier).choose(t),
    ));
  }
  return jumps;
}

List<String> _wordsOf(String text) => [
  for (final m in RegExp(r'[\p{L}\p{N}]+', unicode: true).allMatches(text.toLowerCase())) m[0]!,
];

/// How well [jump] answers [query] (0: not at all): the name begun with it, every word of it beginning a word of the
/// name, or of what the page is known by, or its letters in order through the name.
int jumpScore(Jump jump, String query) {
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
  // Its letters in order through the name ("pltln" is Plot lanes), from three letters.
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

/// The places that answer [query], the best first (in [jumps]' order between equals), at most [jumpsShown].
List<Jump> jumpsFor(String query, List<Jump> jumps) {
  final scored = [
    for (final (i, j) in jumps.indexed)
      if (jumpScore(j, query) case final s when s > 0) (jump: j, score: s, at: i),
  ]..sort((a, b) => b.score != a.score ? b.score - a.score : a.at - b.at);
  return [for (final s in scored.take(jumpsShown)) s.jump];
}

/// The places of [novelId]'s trail, newest first, as jumps (for search with nothing typed yet).
List<Jump> trailJumps(List<TrailStep> trail, NovelStore store, String novelId, {String? here}) => [
  for (final s in trail)
    if (Uri.parse(s.location).path != here)
      if (placeAt(s.location, store, novelId) case final p?)
        (title: p.name, kind: p.kind, icon: p.icon, words: const <String>[], go: _path(s.location)),
].take(jumpsShown).toList();
