import '../json.dart';
import '../records/calendar.dart' show calendarProblems;

/// A ready-made calendar to begin from: its name, a line on what it is like, and its settings (as a custom calendar's
/// are stored). Every name and number can be changed after.
typedef CalendarPreset = ({String name, String about, JsonMap settings});

JsonMap _calendar(
  String name,
  List<(String, int)> months, {
  int daysPerWeek = 7,
  int hoursPerDay = 24,
  List<(String, int)> eras = const [],
  required Map<String, int> seasons,
}) => {
  'kind': 'custom',
  'name': name,
  'months': [
    for (final (n, d) in months) {'name': n, 'days': d},
  ],
  'hoursPerDay': hoursPerDay,
  'daysPerWeek': daysPerWeek,
  'eras': [
    for (final (n, y) in eras) {'name': n, 'startYear': y},
  ],
  'seasons': seasons,
};

final calendarPresets = <CalendarPreset>[
  (
    name: 'Thirteen moons',
    about: 'Thirteen months of 28 days, one to each moon; weeks of seven.',
    settings: _calendar(
      'The Moon Reckoning',
      [
        for (final n in [
          'Frostmoon',
          'Wolfmoon',
          'Thawmoon',
          'Seedmoon',
          'Bloommoon',
          'Longmoon',
          'Highmoon',
          'Hayemoon',
          'Harvestmoon',
          'Huntermoon',
          'Fallmoon',
          'Darkmoon',
          'Deepmoon',
        ])
          (n, 28),
      ],
      eras: [('Before the Moons', -1000), ('of the Moons', 1)],
      seasons: {'spring': 3, 'summer': 6, 'autumn': 9, 'winter': 12},
    ),
  ),
  (
    name: 'The long year',
    about: 'Ten months of 36 days and a five-day festival; weeks of six.',
    settings: _calendar(
      'The Long Count',
      [
        for (final n in ['Ashen', 'Rain', 'Sowing', 'Green', 'Sun', 'Gold', 'Reaping', 'Smoke', 'Iron', 'Silence'])
          (n, 36),
        ('The Festival', 5),
      ],
      daysPerWeek: 6,
      eras: [('Age of Kings', 1)],
      seasons: {'spring': 2, 'summer': 5, 'autumn': 7, 'winter': 9},
    ),
  ),
  (
    name: 'The four turns',
    about: 'Four long months, one to a season, of 91 days, and a day of turning; weeks of seven.',
    settings: _calendar(
      'The Turning',
      [('Bloom', 91), ('Blaze', 91), ('Fall', 91), ('Frost', 91), ('Turnday', 1)],
      eras: [('First Turning', 1)],
      seasons: {'spring': 1, 'summer': 2, 'autumn': 3, 'winter': 4},
    ),
  ),
  (
    name: 'A ship’s cycles',
    about: 'Twenty cycles of 20 days, 20-hour days, ten-day watches: for a world with no sun to count by.',
    settings: _calendar(
      'Ship Standard',
      [for (var i = 1; i <= 20; i++) ('Cycle $i', 20)],
      daysPerWeek: 10,
      hoursPerDay: 20,
      eras: [('After Launch', 1)],
      seasons: {'spring': 1, 'summer': 6, 'autumn': 11, 'winter': 16},
    ),
  ),
];

/// How long a preset's year is, said plainly: "364 days in 13 months".
String yearOf(JsonMap settings) {
  final months = maps(settings['months']);
  final days = months.fold<int>(0, (a, m) => a + (intOrNull(m['days']) ?? 0));
  return '$days days in ${months.length} months';
}

/// Every preset is a calendar the app accepts as it is.
bool presetIsValid(CalendarPreset p) => calendarProblems(p.settings).isEmpty;
