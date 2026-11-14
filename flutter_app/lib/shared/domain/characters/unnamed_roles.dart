/// WAITING FOR A NAME: the people a book's pages keep coming back to without naming them ("the waitress", "the old
/// innkeeper", "the captain"), each a character in all but name. Read where the page says "the" (or "a", "an") and a
/// word that is someone's place in the world, with up to two words before it ("the old guard", "the one-eyed
/// captain"); counted by that word, in every chapter.
///
/// Nobody too general to be anyone ("the man", "the boy"), and not one the cast already is (their title, an alias, or
/// what they do). Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// Someone unnamed: the word for who they are, as the page puts it most ("the waitress"), how often and in how many
/// chapters, and the first place (the chapter's place from 1, its id, the paragraph, the sentence).
typedef UnnamedRole = ({
  String role,
  String phrase,
  int times,
  int chapters,
  int chapter,
  String nodeId,
  int block,
  String said,
});

/// The fewest times someone is mentioned before they are offered a name.
const unnamedAtLeast = 2;

/// Words that are someone's place in the world.
const roleWords = {
  'waitress', 'waiter', 'barmaid', 'bartender', 'barkeep', 'innkeeper', 'landlord', 'landlady', 'cook', 'chef', //
  'maid', 'servant', 'butler', 'steward', 'squire', 'herald', 'messenger', 'courier', 'clerk', 'scribe', //
  'guard', 'guardsman', 'sentry', 'watchman', 'soldier', 'sergeant', 'captain', 'lieutenant', 'commander', //
  'general', 'knight', 'mercenary', 'sellsword', 'archer', 'warrior', 'champion', 'king', 'queen', 'prince', //
  'princess', 'duke', 'duchess', 'lord', 'lady', 'baron', 'baroness', 'countess', 'emperor', 'empress', //
  'priest', 'priestess', 'monk', 'nun', 'abbot', 'bishop', 'cleric', 'healer', 'physician', 'doctor', 'nurse', //
  'apothecary', 'alchemist', 'mage', 'wizard', 'witch', 'sorcerer', 'sorceress', 'necromancer', 'seer', 'oracle', //
  'merchant', 'trader', 'shopkeeper', 'vendor', 'peddler', 'smith', 'blacksmith', 'carpenter', 'tailor', //
  'farmer', 'shepherd', 'hunter', 'fisherman', 'ferryman', 'boatman', 'sailor', 'pirate', 'smuggler', 'thief', //
  'bandit', 'assassin', 'spy', 'beggar', 'stranger', 'traveller', 'traveler', 'pilgrim', 'bard', 'minstrel', //
  'driver', 'coachman', 'teacher', 'professor', 'student', 'detective', 'inspector', 'officer', 'constable', //
  'sheriff', 'judge', 'magistrate', 'mayor', 'governor', 'ambassador', 'envoy', 'boss', 'employer', 'master', //
  'mistress', 'receptionist', 'secretary', 'janitor', 'librarian', 'archivist', 'cartographer', 'navigator', //
  'pilot', 'engineer', 'mechanic', 'scientist', 'agent', 'dealer', 'broker', 'banker', 'executioner', 'jailer', //
  'warden', 'gatekeeper', 'porter', 'stablehand', 'stableboy', 'midwife', 'widow', 'hermit', 'elder', //
  'chieftain', 'shaman', 'druid', 'paladin', 'ranger', 'rogue', 'adventurer', 'guildmaster',
};

// "the", and the three words after it ("the one-eyed old captain"), the first of them that is someone taken.
final _the = RegExp(r"\b(?:the|a|an)\s+([a-z’'\-]+(?:\s+[a-z’'\-]+){0,2})", caseSensitive: false);
final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');

String _around(String text, int at) {
  for (final m in _sentence.allMatches(text)) {
    if (m.start <= at && at < m.end) return m[0]!.trim();
  }
  return text.trim();
}

/// The unnamed people of [chapters] (in reading order, each its id and paragraphs), not those whose role is in
/// [taken] (the cast's titles, aliases and occupations, in lower case) or [setAside]; the most mentioned first.
List<UnnamedRole> unnamedRoles(
  List<({String id, List<String> paragraphs})> chapters, {
  Set<String> taken = const {},
  Set<String> setAside = const {},
}) {
  final skip = {
    for (final t in {...taken, ...setAside}) t.trim().toLowerCase().replaceFirst(RegExp(r'^(the|a|an)\s+'), ''),
  };
  final counts = <String, int>{};
  final inChapters = <String, Set<int>>{};
  final phrases = <String, Map<String, int>>{};
  final first = <String, ({int chapter, String nodeId, int block, String said})>{};
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, text) in chapter.paragraphs.indexed) {
      for (final m in _the.allMatches(text)) {
        // "the guard's" is the guard; "the guards" is not someone.
        final after = [
          for (final w in m[1]!.toLowerCase().split(RegExp(r'\s+'))) w.replaceFirst(RegExp(r"[’']s$"), ''),
        ];
        final i = after.indexWhere(roleWords.contains);
        if (i < 0) continue;
        // "a Warden", written with a capital, is a title the page treats as a name (the names in the manuscript
        // offer it); only the plain word is someone waiting for one.
        final written = m[1]!.split(RegExp(r'\s+'))[i];
        if (written[0] != written[0].toLowerCase()) continue;
        final role = after[i];
        if (skip.contains(role)) continue;
        final words = after.take(i + 1).join(' ');
        if (skip.contains(words)) continue;
        counts[role] = (counts[role] ?? 0) + 1;
        (inChapters[role] ??= {}).add(c);
        final said = 'the $words';
        (phrases[role] ??= {})[said] = ((phrases[role] ?? {})[said] ?? 0) + 1;
        first[role] ??= (chapter: c + 1, nodeId: chapter.id, block: b, said: _around(text, m.start));
      }
    }
  }
  final out = <UnnamedRole>[];
  for (final MapEntry(key: role, value: n) in counts.entries) {
    if (n < unnamedAtLeast) continue;
    // As the page puts it most; the plainest between equals.
    final said = phrases[role]!.entries.toList()
      ..sort((a, b) => b.value != a.value ? b.value - a.value : a.key.length - b.key.length);
    final at = first[role]!;
    out.add((
      role: role,
      phrase: said.first.key,
      times: n,
      chapters: inChapters[role]!.length,
      chapter: at.chapter,
      nodeId: at.nodeId,
      block: at.block,
      said: at.said,
    ));
  }
  out.sort((a, b) => b.times != a.times ? b.times - a.times : a.chapter - b.chapter);
  return out;
}

/// [unnamedRoles] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
List<UnnamedRole> Function() unnamedRolesJob(
  List<String> storedContents,
  List<String> order, {
  Set<String> taken = const {},
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
  return unnamedRoles(
    [for (final id in order) (id: id, paragraphs: pages[id] ?? const [])],
    taken: taken,
    setAside: setAside,
  );
};
