/// IN THEIR HAND: a character's journal, the exercise writers use to find a voice: writing as them, in the first person,
/// to a prompt. The prompts are made of what the book already holds about them (who they are tied to, what they want),
/// and fall back to ones that fit anyone; each page the author writes is kept as one of the character's notes, tagged
/// [journalTag], with the prompt as its title, so it is there in their Notes too.
///
/// Makes prompts and reads notes only; the notes are written through `CharacterChanges.saveNote`.
library;

import 'character_records.dart';

/// The tag a journal page is kept under.
const journalTag = 'journal';

/// What a journal page's title begins with, before its prompt.
const journalTitlePrefix = 'Journal · ';

/// A prompt: an id (so the same one is not dealt twice in a row), and what it asks, written to the character.
typedef JournalPrompt = ({String id, String ask});

/// The prompts for [name], in the order they are dealt: those made of what is known of them first (a tie, [others]
/// by name, each with what they are to them; what they [wants]), then those that fit anyone.
List<JournalPrompt> journalPrompts(
  String name, {
  List<({String name, String tie})> others = const [],
  String wants = '',
}) {
  final first = others.firstOrNull;
  final second = others.length > 1 ? others[1] : null;
  String who(({String name, String tie}) o) => o.tie.trim().isEmpty ? o.name : '${o.name} (${o.tie.trim()})';
  return [
    (id: 'night-before', ask: 'The night before everything changes. Write it as $name, tonight.'),
    if (first != null) (id: 'unsent', ask: 'A letter $name will never send, to ${who(first)}.'),
    if (wants.trim().isNotEmpty)
      (id: 'want', ask: '$name on what they want (“${_short(wants)}”), and the real reason, last.')
    else
      (id: 'want', ask: 'Everything $name wants, in a list. The real reason goes last.'),
    (id: 'never-tell', ask: 'What $name would never tell anyone. Not even here, at first.'),
    if (second != null) (id: 'describe', ask: '$name describes ${second.name} to a stranger.'),
    (id: 'pockets', ask: 'What is in $name’s pockets right now, and why each thing is there.'),
    (id: 'afraid', ask: 'What $name is most afraid of, and why it is not foolish.'),
    (id: 'earliest', ask: '$name’s earliest memory, and who is in it.'),
    (id: 'worst-day', ask: 'The worst day $name ever had, told as if it were nothing.'),
    (id: 'younger', ask: 'What $name would say to themselves ten years ago.'),
    (id: 'home', ask: 'The place $name grew up, the way only they would describe it.'),
    (id: 'complaint', ask: '$name’s complaint about how this story is going.'),
  ];
}

String _short(String text) {
  final t = text.trim().replaceAll(RegExp(r'\s+'), ' ').replaceFirst(RegExp(r'[.;!]+$'), '');
  return t.length <= 60 ? t : '${t.substring(0, t.lastIndexOf(' ', 60).clamp(30, 60))}…';
}

/// The journal pages among [notes], the newest first.
List<CharacterNote> journalPages(List<CharacterNote> notes) => [
  for (final n in notes)
    if (n.tags.contains(journalTag)) n,
]..sort((a, b) => b.createdAt.compareTo(a.createdAt));

/// The prompt a page was written to, from its title.
String promptOf(CharacterNote page) =>
    page.title.startsWith(journalTitlePrefix) ? page.title.substring(journalTitlePrefix.length) : page.title;

/// How many words are written in [text].
int wordsIn(String text) => RegExp(r"[\p{L}\p{N}][\p{L}\p{N}’'\-]*", unicode: true).allMatches(text).length;
