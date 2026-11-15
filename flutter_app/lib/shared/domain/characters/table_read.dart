/// THE TABLE READ: a chapter as a script, read aloud by the cast. Its paragraphs in order, each split into the
/// narration and the lines said in it, each line given to the one who says it.
///
/// Named, as "In their own words" finds a line (`voice.dart`): a word of speech and their name after it ("Go," Wren
/// said) or before it (Wren said, "Go."), and in a paragraph where only one is named as speaking, its other lines too.
///
/// Then as a reader follows talk, and marked as followed, not named ([ReadPart.likely]): "she said" is the last one
/// named whose gender says she; a paragraph whose narration names one of the cast and no other (an action beat: "Ilse
/// turned from the window. 'Say it.'") is theirs; and in a talk between two, a line with nothing to say whose it is
/// goes to the other one. A line none of this gives anyone is left to no one, and said so: a reader may not know who
/// says it either.
///
/// And a voice for each: a pitch of their own, spread across the cast so no two sound alike (lower for a man, higher
/// for a woman, between for anyone else), which the author may set higher or lower.
///
/// Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';
import 'pov.dart' show EyesPerson;

/// A part of the script: the paragraph it is in (as the editor counts blocks), what is said, and who says it: null for
/// the narration; [line] for a line of dialogue (its [speaker] null when no one can be told saying it, [likely] when it
/// was followed from the talk rather than named).
typedef ReadPart = ({int block, String text, bool line, String? speaker, bool likely});

const _speech = [
  'said',
  'says',
  'asked',
  'asks',
  'whispered',
  'shouted',
  'called',
  'replied',
  'answered',
  'murmured',
  'cried',
  'snapped',
  'muttered',
  'added',
  'told',
  'began',
  'sang',
  'breathed',
  'laughed',
  'sighed',
  'admitted',
  'insisted',
  'demanded',
  'warned',
  'yelled',
  'hissed',
  'growled',
  'went on',
  'agreed',
  'explained',
  'repeated',
  'gasped',
];

final _quote = RegExp(r'“([^”]+)”|"([^"]+)"');
final _word = RegExp(r'[\p{L}\p{N}]', unicode: true);

/// The gender a pronoun of speech says: 'm' for he, 'f' for she.
String? _sex(String gender) => switch (gender.trim().toLowerCase()) {
  'male' || 'man' || 'm' || 'boy' => 'm',
  'female' || 'woman' || 'f' || 'girl' => 'f',
  _ => null,
};

/// The chapter's [blocks] (headings marked) as a script, its lines given to [people] ([genders] by id, for "he said"
/// and "she said").
List<ReadPart> tableRead(
  List<({bool heading, String text})> blocks,
  List<EyesPerson> people, {
  Map<String, String> genders = const {},
}) {
  final verb = '(?:${_speech.join('|')})';
  // Each one's names, longest first, and how they are named after a line and before one, or at all.
  final who = [
    for (final p in people)
      if (_alternation(p.names) case final name?)
        (
          id: p.id,
          after: RegExp(
            r'^\s*(?:(?:' + name + r')\s+' + verb + r'\b|' + verb + r'\s+(?:' + name + r')\b)',
            unicode: true,
          ),
          before: RegExp('(?:$name)\\s+$verb(?:\\s+\\w+)?\\s*[,:]?\\s*\$', unicode: true),
          speaking: RegExp('(?:$name)\\s+$verb\\b|\\b$verb\\s+(?:$name)\\b', unicode: true),
          named: RegExp('(?<![\\p{L}])(?:$name)(?![\\p{L}])', unicode: true),
        ),
  ];
  final pronounAfter = RegExp(r'^\s*(?:(he|she)\s+' + verb + r'\b|' + verb + r'\s+(he|she)\b)', caseSensitive: false);
  final anyoneSpeaking = RegExp('\\b$verb\\b', caseSensitive: false);
  final pronounBefore = RegExp(r'\b(he|she)\s+' + verb + r'(?:\s+\w+)?\s*[,:]?\s*$', caseSensitive: false);

  final out = <ReadPart>[];
  // The cast in the order last named, the latest last; and the two who spoke last, the latest last.
  final lastNamed = <String>[];
  final lastSpeakers = <String>[];

  void narrate(int block, String text) {
    final t = text.trim();
    if (!_word.hasMatch(t)) return;
    out.add((block: block, text: t, line: false, speaker: null, likely: false));
    final found = <(int, String)>[];
    for (final w in who) {
      for (final m in w.named.allMatches(t)) {
        found.add((m.start, w.id));
      }
    }
    found.sort((a, b) => a.$1 - b.$1);
    for (final (_, id) in found) {
      lastNamed
        ..remove(id)
        ..add(id);
    }
  }

  // "She said": the last named whose gender says she; else the last named whose gender is not written (never one
  // whose gender says he).
  String? latestOf(String sex) {
    String? unsaid;
    for (final id in lastNamed.reversed) {
      final theirs = _sex(genders[id] ?? '');
      if (theirs == sex) return id;
      if (theirs == null) unsaid ??= id;
    }
    return unsaid;
  }

  for (final (b, block) in blocks.indexed) {
    if (block.text.trim().isEmpty) continue;
    if (block.heading) {
      narrate(b, block.text);
      continue;
    }
    final text = block.text;
    final quotes = _quote.allMatches(text).toList();
    if (quotes.isEmpty) {
      narrate(b, text);
      continue;
    }
    // Who is named as speaking in the narration of this paragraph, and who is named in it at all.
    final narration = text.replaceAll(_quote, ' ');
    final speakers = {
      for (final w in who)
        if (w.speaking.hasMatch(narration)) w.id,
    };
    final namedHere = {
      for (final w in who)
        if (w.named.hasMatch(narration)) w.id,
    };
    var at = 0;
    for (final (q, m) in quotes.indexed) {
      narrate(b, text.substring(at, m.start));
      final tail = text.substring(m.end, (m.end + 80).clamp(0, text.length));
      final head = text.substring(q == 0 ? 0 : quotes[q - 1].end, m.start);
      String? speaker;
      var likely = false;
      for (final w in who) {
        if (w.after.hasMatch(tail) || w.before.hasMatch(head)) {
          speaker = w.id;
          break;
        }
      }
      speaker ??= speakers.length == 1 ? speakers.single : null;
      if (speaker == null) {
        likely = true;
        final pronoun = pronounAfter.firstMatch(tail) ?? pronounBefore.firstMatch(head);
        if (pronoun != null) {
          // "She said": the last named whose gender says she.
          final p = (pronoun[1] ?? pronoun[2])!.toLowerCase();
          speaker = latestOf(p == 'he' ? 'm' : 'f');
        } else if (namedHere.length == 1) {
          // An action beat: the one the paragraph is about.
          speaker = namedHere.single;
        } else if (namedHere.isEmpty &&
            !anyoneSpeaking.hasMatch(narration) &&
            lastSpeakers.length == 2 &&
            lastSpeakers[0] != lastSpeakers[1]) {
          // A talk between two: the other one's turn (unless the paragraph says someone else speaks: "someone called").
          speaker = lastSpeakers[0];
        }
      }
      out.add((
        block: b,
        text: (m[1] ?? m[2]!).trim(),
        line: true,
        speaker: speaker,
        likely: likely && speaker != null,
      ));
      if (speaker != null) {
        lastSpeakers
          ..add(speaker)
          ..removeRange(0, lastSpeakers.length > 2 ? lastSpeakers.length - 2 : 0);
        lastNamed
          ..remove(speaker)
          ..add(speaker);
      }
      at = m.end;
    }
    narrate(b, text.substring(at));
  }
  return out;
}

String? _alternation(List<String> names) {
  final wanted = {for (final n in names) n.trim()}.where((n) => n.isNotEmpty).toList()
    ..sort((a, b) => b.length - a.length);
  return wanted.isEmpty ? null : wanted.map(RegExp.escape).join('|');
}

/// A speaker's voice: its pitch (1 the device's own) and pace.
typedef CastVoice = ({double pitch, double rate});

/// The narration's voice: the device's own.
const narratorVoice = (pitch: 1.0, rate: 1.0);

/// How far an author's nudge moves a voice, and the bounds a voice is kept in.
const pitchStep = 0.08;
const lowestPitch = 0.6;
const highestPitch = 1.6;

/// A voice for each of [speakers] (their ids, in the order they are first heard, each with their profile's gender),
/// spread so no two sound alike: men from 0.72 to 0.95, women from 1.12 to 1.4, anyone else from 0.86 to 1.18 (wide, so
/// two whose gender is not written still sound apart), each group's voices evenly across its range; then [nudged] (each
/// one's steps higher or lower, as the author set them).
Map<String, CastVoice> castVoices(List<({String id, String gender})> speakers, {Map<String, int> nudged = const {}}) {
  String group(String gender) => switch (gender.trim().toLowerCase()) {
    'male' || 'man' || 'm' || 'boy' => 'm',
    'female' || 'woman' || 'f' || 'girl' => 'f',
    _ => 'x',
  };
  const ranges = {'m': (0.72, 0.95), 'f': (1.12, 1.4), 'x': (0.86, 1.18)};
  final byGroup = <String, List<String>>{};
  for (final s in speakers) {
    byGroup.putIfAbsent(group(s.gender), () => []).add(s.id);
  }
  final out = <String, CastVoice>{};
  for (final MapEntry(key: g, value: ids) in byGroup.entries) {
    final (lo, hi) = ranges[g]!;
    for (final (i, id) in ids.indexed) {
      final base = ids.length == 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (ids.length - 1);
      final pitch = (base + (nudged[id] ?? 0) * pitchStep).clamp(lowestPitch, highestPitch);
      // A little of each one's own pace too, so two voices near in pitch still differ.
      out[id] = (pitch: double.parse(pitch.toStringAsFixed(2)), rate: i.isEven ? 1.0 : 0.94);
    }
  }
  return out;
}

/// How a voice sounds, said in a word.
String voiceWord(CastVoice v) => switch (v.pitch) {
  < 0.8 => 'deep',
  < 0.97 => 'low',
  < 1.11 => 'middle',
  < 1.3 => 'high',
  _ => 'bright',
};

/// [tableRead] over the chapter [nodeId], from the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads
/// them). A job for an isolate.
List<ReadPart> Function() tableReadJob(
  List<String> storedContents,
  String nodeId,
  List<EyesPerson> people, {
  Map<String, String> genders = const {},
}) => () {
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is Map && row['id'] == nodeId) return tableRead(docBlocks(row['doc']), people, genders: genders);
    } on FormatException {
      continue;
    }
  }
  return const [];
};
