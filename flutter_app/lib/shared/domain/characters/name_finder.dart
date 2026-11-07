/// NAMES IN THE MANUSCRIPT: who the author has been writing about but has not added to the cast, found by a plain rule
/// (no model, nothing sent anywhere, the text never changed): a name is a capitalised word that recurs in the middle of
/// sentences (where capitals are not just the start of a sentence), is not already the name or alias of a character or
/// an entry, is not a common word ("I", days, months, titles), and is not more often written in lower case (so
/// "Rose" the name, not "rose" the flower). The author decides; nothing is added until they press.
library;

/// A recurring name: how often it is written, in how many chapters, and the first chapter it is in.
typedef ManuscriptName = ({String name, int times, int chapters, int first});

/// Words capitalised for reasons other than being someone's name.
const _common = {
  'i',
  'im',
  'ill',
  'ive',
  'id',
  'mr',
  'mrs',
  'ms',
  'dr',
  'sir',
  'madam',
  'lady',
  'lord',
  'miss',
  'master',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'god',
  'oh',
  'ok',
  'okay',
  'yes',
  'no',
  'the',
  'a',
  'an',
  'and',
  'but',
  'or',
  'he',
  'she',
  'it',
  'they',
  'we',
  'you',
  'his',
  'her',
  'their',
  'chapter',
  'part',
  'book',
  'volume',
  'mom',
  'mum',
  'dad',
  'english',
};

final _word = RegExp(r"\p{L}[\p{L}'’]*", unicode: true);
final _upper = RegExp(r'^\p{Lu}', unicode: true);
final _lower = RegExp(r'\p{Ll}', unicode: true);

/// What ends a sentence or opens speech: a capital after one is not evidence of a name.
final _boundary = RegExp(r'''[.!?…:;"“”'‘’—–(\[]$''');

String _plain(String w) => w.replaceAll(RegExp(r"['’]s$"), '').replaceAll(RegExp(r"['’]"), '').toLowerCase();

/// The recurring names in [chapters] (each its number in reading order and its paragraphs), most written first, at
/// most [limit]. [known] are words already taken (every word of every name and alias in the novel, any case);
/// [setAside] are names the author said are not characters.
List<ManuscriptName> manuscriptNames(
  Iterable<(int, List<String>)> chapters, {
  Set<String> known = const {},
  Set<String> setAside = const {},
  int limit = 12,
}) {
  final spelled = <String, String>{};
  final times = <String, int>{};
  final midSentence = <String, int>{};
  final lowerCase = <String, int>{};
  final inChapters = <String, Set<int>>{};
  for (final (number, blocks) in chapters) {
    for (final block in blocks) {
      for (final m in _word.allMatches(block)) {
        final raw = m.group(0)!;
        final key = _plain(raw);
        if (key.length < 2) continue;
        final capital = _upper.hasMatch(raw) && _lower.hasMatch(raw);
        if (!capital) {
          if (!_upper.hasMatch(raw)) lowerCase[key] = (lowerCase[key] ?? 0) + 1;
          continue;
        }
        spelled.putIfAbsent(key, () => raw.replaceAll(RegExp(r"['’]s$"), ''));
        times[key] = (times[key] ?? 0) + 1;
        (inChapters[key] ??= {}).add(number);
        final before = block.substring(0, m.start).trimRight();
        if (before.isNotEmpty && !_boundary.hasMatch(before)) midSentence[key] = (midSentence[key] ?? 0) + 1;
      }
    }
  }
  final found = [
    for (final key in times.keys)
      if ((midSentence[key] ?? 0) >= 2 &&
          !_common.contains(key) &&
          !known.contains(key) &&
          !setAside.contains(key) &&
          (lowerCase[key] ?? 0) < (midSentence[key] ?? 0))
        (
          name: spelled[key]!,
          times: times[key]!,
          chapters: inChapters[key]!.length,
          first: inChapters[key]!.reduce((a, b) => a < b ? a : b),
        ),
  ]..sort((a, b) => b.times != a.times ? b.times - a.times : a.name.compareTo(b.name));
  return found.take(limit).toList();
}

/// Every word of [names], in the finder's plain form, for [manuscriptNames]' `known`.
Set<String> knownWords(Iterable<String> names) => {
  for (final n in names)
    for (final m in _word.allMatches(n)) _plain(m.group(0)!),
};

/// A name in the finder's plain form, for remembering one set aside.
String plainName(String name) => _plain(name);
