import '../records/entry.dart';
import '../records/relation.dart';
import '../relationships/history.dart';
import 'character_records.dart';

/// AT A GLANCE: what a writer stops to look up mid-sentence (her eyes, his age, who she is to him) is on the record
/// already. With the caret on a name on the page, its card: who or what it is, the facts recorded, and the ties.
///
/// Reads only.

/// Where a name is on the page: whose it is, and where it starts and ends.
typedef NameAt = ({String id, int start, int end});

/// The name on [text] that the caret at [caret] is in or touches (the longest, where names overlap), as written:
/// whole words, capitals as recorded.
NameAt? nameAt(String text, int caret, Map<String, List<String>> names) {
  if (text.isEmpty || caret < 0 || caret > text.length) return null;
  // The word (or words) around the caret, so only names that could be there are tried.
  NameAt? best;
  for (final MapEntry(key: id, value: list) in names.entries) {
    for (final name in list) {
      if (name.isEmpty) continue;
      // Every place it could be with the caret in it.
      var from = (caret - name.length).clamp(0, text.length);
      while (true) {
        final at = text.indexOf(name, from);
        if (at < 0 || at > caret) break;
        final end = at + name.length;
        if (end >= caret && _whole(text, at, end) && (best == null || end - at > best.end - best.start)) {
          best = (id: id, start: at, end: end);
        }
        from = at + 1;
      }
    }
  }
  return best;
}

final _letter = RegExp(r'[\p{L}\p{N}]', unicode: true);

bool _whole(String text, int start, int end) =>
    (start == 0 || !_letter.hasMatch(text[start - 1])) && (end == text.length || !_letter.hasMatch(text[end]));

/// One fact on the card: its label, as recorded ("Eyes"), and its value ("Grey").
typedef GlanceFact = ({String label, String value});

/// The card: the name, what it is ("Protagonist", "Location"), the epithet, the facts, the ties ("Kai’s sister"), and
/// the summary's first sentence.
typedef GlanceCard = ({
  String id,
  String name,
  String what,
  String epithet,
  List<GlanceFact> facts,
  List<String> ties,
  String summary,
});

/// The longest a fact's value may be to stand on the card (longer ones are prose, for the profile).
const glanceFactChars = 40;

/// The card for [entry]: [what] says what it is when it is not a character with a role. Facts are its fields with a
/// short value, in the order recorded; ties, a character's relationships as they stand last, each from this side
/// ("Kai’s sister"), named by [names].
GlanceCard glanceOf(
  Entry entry, {
  CharacterProfile? profile,
  String what = '',
  List<CharacterRelation> relations = const [],
  Map<String, String> names = const {},
}) {
  final facts = <GlanceFact>[
    for (final f in entry.fields)
      if (f.key.trim().isNotEmpty &&
          f.value.trim().isNotEmpty &&
          f.value.trim().length <= glanceFactChars &&
          !f.value.contains('\n'))
        (label: f.key.trim(), value: f.value.trim()),
  ];
  final ties = <String>[];
  for (final r in relations) {
    if (r.fromId != entry.id && r.toId != entry.id) continue;
    final other = names[r.fromId == entry.id ? r.toId : r.fromId];
    final stages = r.stages;
    if (other == null || other.isEmpty || stages.isEmpty) continue;
    final role = roleOf(stages.last, r, entry.id);
    ties.add('$other’s ${role.toLowerCase()}');
  }
  final roles = profile?.roles.where((r) => r.trim().isNotEmpty).toList() ?? const <String>[];
  return (
    id: entry.id,
    name: entry.name.trim().isEmpty ? 'Unnamed' : entry.name.trim(),
    what: roles.isNotEmpty ? roles.map(_capital).join(', ') : what,
    epithet: profile?.epithet.trim() ?? '',
    facts: facts,
    ties: ties,
    summary: _firstSentence(entry.summary.trim().isNotEmpty ? entry.summary : entry.description),
  );
}

String _capital(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// The first sentence of [text], cut at about 160 characters.
String _firstSentence(String text) {
  final t = text.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (t.isEmpty) return '';
  final stop = RegExp(r'[.!?…](?=\s|$)').firstMatch(t);
  final s = stop == null ? t : t.substring(0, stop.end);
  if (s.length <= 160) return s;
  final cut = s.lastIndexOf(' ', 157);
  return '${s.substring(0, cut < 0 ? 157 : cut)}…';
}
