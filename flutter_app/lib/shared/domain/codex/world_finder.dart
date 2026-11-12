/// FOUND IN YOUR PAGES: the places, groups, powers and things the manuscript names that the world does not hold yet,
/// found by what the words themselves say, never guessed:
///
/// - a run of capitalised words whose last word says what it is: a place ("Mimir Forest", "Lantern Street",
///   "Glass River"; or begun with Mount, Lake, Isle, Port, Fort, Cape: "Mount Ash"), a group ("the Salt Guild",
///   "House Vane", "Order of the Rose"), a thing ("the Brass Compass", "Sword of Dawn");
/// - a run of capitalised words followed by a word that says it is a power ("the Smart Atoms skill", "a Fireball
///   spell", "his Empathic Mimicry ability").
///
/// "of" and "the" may join the words of a name ("Isle of Skye", "Order of the Rose"); a leading "The" is not part of
/// it. A name of one word alone ("Forest") names nothing in particular and is left out, unless it is called a power.
library;

/// A name found, the kind of entry it reads as (a category key), why, and where.
typedef WorldFind = ({String name, String kind, String why, int times, int chapters, int first});

const _places = {
  'forest',
  'woods',
  'wood',
  'city',
  'town',
  'village',
  'hamlet',
  'river',
  'lake',
  'sea',
  'ocean',
  'bay',
  'harbour',
  'harbor',
  'port',
  'mountain',
  'mountains',
  'hill',
  'hills',
  'valley',
  'vale',
  'plain',
  'plains',
  'desert',
  'island',
  'islands',
  'isle',
  'kingdom',
  'empire',
  'realm',
  'republic',
  'duchy',
  'province',
  'region',
  'district',
  'quarter',
  'street',
  'road',
  'lane',
  'avenue',
  'square',
  'bridge',
  'gate',
  'gates',
  'tower',
  'castle',
  'keep',
  'fort',
  'fortress',
  'citadel',
  'palace',
  'temple',
  'cathedral',
  'abbey',
  'monastery',
  'shrine',
  'inn',
  'tavern',
  'cave',
  'caves',
  'cavern',
  'caverns',
  'marsh',
  'swamp',
  'fen',
  'moor',
  'coast',
  'cliffs',
  'peak',
  'peaks',
  'pass',
  'falls',
  'springs',
  'garden',
  'gardens',
  'park',
  'hall',
  'halls',
  'lands',
  'land',
  'shire',
  'reach',
  'ford',
  'crossing',
  'canyon',
  'gorge',
  'glacier',
  'tundra',
  'jungle',
  'grove',
  'meadow',
  'field',
  'fields',
  'mine',
  'mines',
  'ruins',
  'wastes',
  'wasteland',
  'highlands',
  'lowlands',
  'station',
  'base',
  'colony',
  'planet',
  'moon',
  'galaxy',
  'sector',
};
const _placeFirst = {'mount', 'lake', 'isle', 'port', 'fort', 'cape', 'castle', 'mt'};

const _groups = {
  'guild',
  'order',
  'company',
  'council',
  'clan',
  'tribe',
  'army',
  'legion',
  'brotherhood',
  'sisterhood',
  'circle',
  'church',
  'cult',
  'society',
  'alliance',
  'league',
  'knights',
  'academy',
  'court',
  'senate',
  'syndicate',
  'gang',
  'empire',
  'federation',
  'union',
  'coalition',
  'covenant',
  'conclave',
  'watch',
  'guard',
  'wardens',
  'rangers',
  'family',
  'dynasty',
  'house',
  'corporation',
  'corps',
  'collective',
  'faction',
  'party',
  'band',
  'crew',
};
const _groupFirst = {'house', 'clan', 'order'};

const _things = {
  'sword',
  'blade',
  'dagger',
  'axe',
  'spear',
  'bow',
  'shield',
  'armour',
  'armor',
  'helm',
  'crown',
  'ring',
  'amulet',
  'pendant',
  'necklace',
  'staff',
  'wand',
  'orb',
  'stone',
  'gem',
  'crystal',
  'book',
  'tome',
  'grimoire',
  'scroll',
  'map',
  'compass',
  'key',
  'chalice',
  'cup',
  'grail',
  'cloak',
  'mask',
  'mirror',
  'lantern',
  'bell',
  'horn',
  'chart',
  'codex',
  'relic',
  'idol',
  'engine',
  'device',
};

const _powers = {
  'skill',
  'skills',
  'ability',
  'abilities',
  'spell',
  'spells',
  'power',
  'powers',
  'technique',
  'techniques',
  'magic',
  'curse',
  'blessing',
  'talent',
  'rune',
  'runes',
  'incantation',
  'ritual',
};

/// Joining words inside a name.
const _joins = {'of', 'de', 'du', 'von', 'van'};

/// What ends a sentence or opens speech: a capital after one is the sentence's.
final _boundary = RegExp(r'''[.!?…:;"“”'‘’—–([]$''');

/// Words that point at something and name nothing.
const _determiners = {
  'this',
  'that',
  'these',
  'those',
  'his',
  'her',
  'its',
  'my',
  'your',
  'our',
  'their',
  'each',
  'every',
  'any',
  'some',
  'no',
  'one',
  'another',
  'such',
  'which',
  'what',
  'whose',
  'i',
  'he',
  'she',
  'we',
  'they',
  'it',
};

final _word = RegExp(r"\p{L}[\p{L}'’-]*", unicode: true);
final _upper = RegExp(r'^\p{Lu}', unicode: true);
final _lower = RegExp(r'\p{Ll}', unicode: true);

/// A name's form for comparing: lower case, without a leading "the", a possessive or apostrophes.
String worldKey(String name) => name
    .trim()
    .toLowerCase()
    .replaceFirst(RegExp(r'^the\s+'), '')
    .replaceAll(RegExp(r"['’]s\b"), '')
    .replaceAll(RegExp(r"['’]"), '')
    .replaceAll(RegExp(r'\s+'), ' ');

/// The names in [chapters] (each its number in reading order and its paragraphs) that read as a place, a group, a
/// power or a thing, most written first, at most [limit]. [known] are the world's names and aliases already (as
/// [worldKey] gives them); [setAside] are names the author said are not entries, in the same form.
List<WorldFind> worldFinds(
  Iterable<(int, List<String>)> chapters, {
  Set<String> known = const {},
  Set<String> setAside = const {},
  int limit = 12,
}) {
  final spelled = <String, String>{};
  final kinds = <String, (String, String)>{};
  final times = <String, int>{};
  final inChapters = <String, Set<int>>{};
  for (final (number, blocks) in chapters) {
    for (final block in blocks) {
      final words = [for (final m in _word.allMatches(block)) (text: m[0]!, start: m.start, end: m.end)];
      var i = 0;
      while (i < words.length) {
        if (!_isCapital(words[i].text)) {
          i++;
          continue;
        }
        // The run: capitalised words, joined by "of", "de"… (never ending on one), with nothing but spaces between.
        // "the" joins only after "of" ("Order of the Rose"): "Into the Mimir Forest" is not a name.
        var end = i;
        var j = i + 1;
        while (j < words.length && _gap(block, words[j - 1].end, words[j].start)) {
          final w = words[j].text;
          if (_isCapital(w)) {
            end = j;
          } else if (w.toLowerCase() == 'the' && words[j - 1].text.toLowerCase() == 'of') {
            // joined
          } else if (!_joins.contains(w.toLowerCase())) {
            break;
          }
          j++;
        }
        var from = i;
        // "The", "A", or a pointing word ("His Fireball spell", "This Glass River") is not part of the name.
        final lead = words[from].text.toLowerCase();
        if (from < end && (lead == 'the' || lead == 'a' || lead == 'an' || _determiners.contains(lead))) from++;
        final run = [for (var k = from; k <= end; k++) words[k].text];
        final next = end + 1 < words.length && _gap(block, words[end].end, words[end + 1].start)
            ? words[end + 1].text
            : null;
        i = end + 1;
        if (run.isEmpty) continue;
        // A single word is a name only where its capital is not the sentence's ("This skill…", "His power…").
        if (run.length == 1) {
          final before = block.substring(0, words[from].start).trimRight();
          if (before.isEmpty || _boundary.hasMatch(before) || _determiners.contains(run.single.toLowerCase())) continue;
        }
        final kind = _kindOf(run, next);
        if (kind == null) continue;
        final name = block.substring(words[from].start, words[end].end).replaceAll(RegExp(r"['’]s$"), '');
        final key = worldKey(name);
        if (key.length < 3 || known.contains(key) || setAside.contains(key)) continue;
        spelled.putIfAbsent(key, () => name);
        kinds.putIfAbsent(key, () => kind);
        times[key] = (times[key] ?? 0) + 1;
        (inChapters[key] ??= {}).add(number);
      }
    }
  }
  final found = [
    for (final key in times.keys)
      (
        name: spelled[key]!,
        kind: kinds[key]!.$1,
        why: kinds[key]!.$2,
        times: times[key]!,
        chapters: inChapters[key]!.length,
        first: inChapters[key]!.reduce((a, b) => a < b ? a : b),
      ),
  ]..sort((a, b) => b.times != a.times ? b.times - a.times : a.name.compareTo(b.name));
  return found.take(limit).toList();
}

bool _isCapital(String w) => _upper.hasMatch(w) && (_lower.hasMatch(w) || w.length > 1);

/// Only spaces between two words: a comma or a full stop ends a name.
bool _gap(String text, int from, int to) => text.substring(from, to).trim().isEmpty;

/// The kind a run reads as, and why, from its last word, its first, or the word after it.
(String, String)? _kindOf(List<String> run, String? next) {
  final after = next?.toLowerCase();
  // Called a power, and not someone's ("the Provost's power" is not a power called Provost).
  final possessive = RegExp(r"['’]s$").hasMatch(run.last);
  if (after != null && !_isCapital(next!) && _powers.contains(after) && !possessive) {
    return ('power', 'called a $after');
  }
  if (run.length < 2) return null;
  final head = run.last.toLowerCase().replaceAll(RegExp(r"['’]s$"), '');
  final first = run.first.toLowerCase();
  if (_groupFirst.contains(first) || _groups.contains(head)) return ('faction', 'reads as a group');
  if (_placeFirst.contains(first) || _places.contains(head)) return ('location', 'reads as a place');
  if (_things.contains(head)) return ('item', 'reads as a thing');
  return null;
}
