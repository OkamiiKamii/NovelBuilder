import 'dart:convert';

import '../continuity/text.dart';
import '../json.dart';
import '../manuscript/prose.dart';
import '../records/entry.dart';
import 'character_records.dart';

/// NAMED IN THE TEXT: where the cast and the world are found in the manuscript by their names, as written, without
/// anyone having linked them. A link in the text says for certain that a passage is about an entry; this says that the
/// entry's name is on the page. Both together are where it is in the book.
///
/// The names looked for, per entry ([namesToFind]):
///
/// - its name ("Ilse Marrow", "The Drowned Road"), and without a leading "The" ("Drowned Road");
/// - a character's aliases, as recorded in the profile;
/// - each part of a character's name that is the character's alone ("Ilse", "Crane"; not "Marrow" when Kit Marrow is
///   in the cast too), three letters or more and not an everyday word;
/// - the capitalised words of a character's epithet ("the Provost" gives "Provost"), when no one else has them.
///
/// Names are matched as whole words, capitals as written, so "Wren" is a person and "wren" a bird.
Map<String, List<String>> namesToFind(List<Entry> entries, Map<String, CharacterProfile> profiles) {
  final out = <String, Set<String>>{};
  final parts = <String, Set<String>>{}; // part → the characters it belongs to
  for (final e in entries) {
    final name = e.name.trim();
    if (name.isEmpty) continue;
    final names = out.putIfAbsent(e.id, () => {})..add(name);
    final noThe = name.replaceFirst(RegExp(r'^The\s+'), '');
    if (noThe != name && noThe.length >= 3) names.add(noThe);
    if (e.category != 'character') continue;
    final profile = profiles[e.id];
    for (final a in profile?.aliases ?? const <String>[]) {
      if (a.trim().length >= 2) names.add(a.trim());
    }
    final words = [
      ..._words(name),
      for (final w in _words(profile?.epithet ?? ''))
        if (w[0] != w[0].toLowerCase()) w,
    ];
    if (words.length < 2 && profile?.epithet.trim().isEmpty != false) continue;
    for (final w in words) {
      if (w.length >= 3 && w[0] != w[0].toLowerCase() && !_everyday.contains(w.toLowerCase())) {
        parts.putIfAbsent(w, () => {}).add(e.id);
      }
    }
  }
  for (final p in parts.entries) {
    if (p.value.length == 1) out[p.value.single]!.add(p.key);
  }
  return {for (final e in out.entries) e.key: e.value.toList()};
}

List<String> _words(String text) => [for (final m in RegExp(r'[\p{L}\p{N}]+', unicode: true).allMatches(text)) m[0]!];

/// For each entry in [names], the chapters and scenes (by id) whose text has one of its names, in [texts]' order.
Map<String, List<String>> namedIn(Map<String, String> texts, Map<String, List<String>> names) {
  final out = <String, List<String>>{};
  // Each name read once: a single word is looked up among the page's words; a name of several words is looked for in
  // the text only where every one of its words is on the page.
  final prepared = {
    for (final MapEntry(key: id, value: wanted) in names.entries)
      id: [
        for (final n in wanted)
          if (_words(n) case final parts when parts.isNotEmpty)
            (name: n, parts: parts, single: parts.length == 1 && parts.first == n),
      ],
  };
  for (final MapEntry(key: nodeId, value: text) in texts.entries) {
    if (text.isEmpty) continue;
    final words = {for (final m in _wordRun.allMatches(text)) m[0]!};
    WordIndex? index;
    for (final MapEntry(key: entryId, value: wanted) in prepared.entries) {
      if (wanted.any((n) => n.parts.every(words.contains) && (n.single || (index ??= WordIndex(text)).has(n.name)))) {
        (out[entryId] ??= []).add(nodeId);
      }
    }
  }
  return out;
}

final _wordRun = RegExp(r'[\p{L}\p{N}]+', unicode: true);

/// [namedIn] over the chapters as stored (each record as JSON text, as `NovelStore.rawJsonIn` reads them), as a job for
/// an isolate (`background.dart`): the book is decoded and read there, away from the screen. Made at the top level and
/// holding only plain data, so it can be sent. A record that cannot be read is an empty page.
Map<String, List<String>> Function() namedInJob(List<String> storedContents, Map<String, List<String>> names) => () {
  final texts = <String, String>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map) continue;
      texts[str(row['id'])] = blockTexts(row['doc']).join('\n');
    } on FormatException {
      continue;
    }
  }
  return namedIn(texts, names);
};

/// Words that begin sentences and name nobody, so a name made of them is only looked for whole.
const _everyday = {
  'the',
  'and',
  'but',
  'for',
  'not',
  'you',
  'all',
  'one',
  'two',
  'old',
  'new',
  'young',
  'lady',
  'lord',
  'sir',
  'mrs',
  'miss',
  'master',
  'mister',
  'captain',
  'king',
  'queen',
  'prince',
  'princess',
  'father',
  'mother',
  'brother',
  'sister',
  'uncle',
  'aunt',
  'doctor',
  'saint',
  'grand',
  'great',
  'little',
  'big',
  'black',
  'white',
  'red',
  'green',
  'grey',
  'gray',
  'blue',
  'gold',
  'silver',
  'iron',
  'stone',
  'hope',
  'will',
  'may',
  'june',
  'april',
  'august',
  'grace',
  'faith',
  'joy',
  'rose',
  'lily',
  'dawn',
  'sky',
  'star',
  'storm',
  'rain',
  'snow',
  'winter',
  'summer',
  'autumn',
  'spring',
  'north',
  'south',
  'east',
  'west',
  'son',
  'daughter',
  'van',
  'von',
  'der',
  'del',
  'des',
};

/// One place an entry is on the page: the chapter or scene, the paragraph (its index in the text), and the sentence
/// it is in, cut around [name] as found ([before], [name], [after]).
typedef Sighting = ({String nodeId, int block, String before, String name, String after});

/// The longest a sentence is shown; a longer one is cut around the name.
const sightingChars = 220;

/// IN THEIR PAGES: for each of [nodeIds] (in reading order) with one of [names] on its page, the first sentence the
/// name is in. [pages] are each chapter's paragraphs. Names are whole words, capitals as written, the longest first
/// where two start together ("Ilse Marrow" before "Ilse").
List<Sighting> sightings(Map<String, List<String>> pages, List<String> nodeIds, List<String> names) {
  final wanted = {for (final n in names) n.trim()}.where((n) => n.isNotEmpty).toList()
    ..sort((a, b) => b.length - a.length);
  if (wanted.isEmpty) return const [];
  final pattern = RegExp(
    r'(?<![\p{L}\p{N}])(?:' + wanted.map(RegExp.escape).join('|') + r')(?![\p{L}\p{N}])',
    unicode: true,
  );
  final out = <Sighting>[];
  for (final id in nodeIds) {
    final blocks = pages[id];
    if (blocks == null) continue;
    for (final (i, text) in blocks.indexed) {
      final m = pattern.firstMatch(text);
      if (m == null) continue;
      out.add(_around(id, i, text, m.start, m.end));
      break;
    }
  }
  return out;
}

final _stop = RegExp(r'[.!?…]["”’)]*\s');

Sighting _around(String nodeId, int block, String text, int start, int end) {
  // The sentence: from just after the last full stop before the name to just after the first one after it.
  var from = 0;
  for (final m in _stop.allMatches(text)) {
    if (m.end <= start) from = m.end;
  }
  final next = _stop.firstMatch(text.substring(end));
  var to = next == null ? text.length : end + next.end - 1;
  // Too long to show whole: as much either side of the name as fits, cut at a space.
  var lead = '';
  var tail = '';
  if (to - from > sightingChars) {
    final side = (sightingChars - (end - start)) ~/ 2;
    if (start - from > side) {
      final cut = text.lastIndexOf(' ', start - side);
      from = cut < from ? start - side : cut + 1;
      lead = '…';
    }
    if (to - end > side) {
      final cut = text.indexOf(' ', end + side);
      to = cut < 0 || cut > to ? end + side : cut;
      tail = '…';
    }
  }
  return (
    nodeId: nodeId,
    block: block,
    before: '$lead${text.substring(from, start).trimLeft()}',
    name: text.substring(start, end),
    after: '${text.substring(end, to).trimRight()}$tail',
  );
}

/// [sightings] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), as a job for an
/// isolate: decoded and read away from the screen. Only plain data in and out, so it can be sent.
List<Sighting> Function() sightingsJob(List<String> storedContents, List<String> nodeIds, List<String> names) => () {
  final wanted = nodeIds.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages[str(row['id'])] = blockTexts(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return sightings(pages, nodeIds, names);
};
