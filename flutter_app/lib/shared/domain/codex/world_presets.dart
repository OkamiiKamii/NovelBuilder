import '../json.dart';
import 'type_presets.dart';

/// WORLDBUILDING PRESETS (as in the original app)
/// Ready-made starting points for a whole novel: fields added to built-in categories, and kinds of record of their
/// own. Applying one only ever adds categories and fields.

typedef _F = (String name, String type, List<String> options);

_F _f(String name, [String type = 'text', List<String> options = const []]) => (name, type, options);

List<JsonMap> _fields(List<_F> defs) => [
  for (final (i, (name, type, options)) in defs.indexed)
    {'id': 'preset-$i', 'name': name, 'type': type, 'options': options},
];

JsonMap _custom(String name, String singular, String color, List<_F> defs) => {
  'key': '',
  'name': name,
  'singular': singular,
  'color': color,
  'builtin': false,
  'fields': _fields(defs),
};

/// Extra fields for a built-in category, added to whatever it already has.
JsonMap _extend(String key, List<_F> defs) => {
  'key': key,
  'name': '',
  'singular': '',
  'color': '',
  'builtin': true,
  'fields': _fields(defs),
};

final worldPresets = <TypePreset>[
  TypePreset(
    'preset-progression-fantasy',
    'Progression Fantasy Bible',
    'Ranks, elements and affixes on characters, plus Skills, Cultivation Stages and Guilds.',
    [
      // No Class or Level here: those are kept once, on the character's system sheet.
      _extend('character', [
        _f('Power Rank', 'select', ['F', 'E', 'D', 'C', 'B', 'A', 'S']),
        _f('Elements', 'multiselect', ['Fire', 'Water', 'Earth', 'Air', 'Light', 'Dark', 'Void']),
        _f('Affixes', 'longtext'),
        _f('Current stage', 'reference'),
      ]),
      _custom('Skills & Abilities', 'Skill', '#a8436b', [
        _f('Kind', 'select', ['Active', 'Passive', 'Ultimate']),
        _f('Rank', 'select', ['Common', 'Rare', 'Epic', 'Legendary']),
        _f('Cost'),
        _f('Cooldown'),
        _f('Effect', 'longtext'),
        _f('Used by', 'reference'),
      ]),
      _custom('Cultivation Stages', 'Stage', '#2b7a8c', [
        _f('Order', 'number'),
        _f('Requirements', 'longtext'),
        _f('Breakthrough', 'longtext'),
        _f('Lifespan granted'),
      ]),
      _custom('Guilds & Sects', 'Guild', '#4f5fa3', [
        _f('Standing', 'select', ['Minor', 'Rising', 'Major', 'Legendary']),
        _f('Leader', 'reference'),
        _f('Headquarters', 'reference'),
        _f('Members', 'number'),
        _f('Open to recruits', 'toggle'),
      ]),
    ],
  ),
  TypePreset(
    'preset-science-fiction',
    'Science Fiction',
    'Augmentations and affiliations on characters, plus Starships, Planets & Stations and Technologies.',
    [
      _extend('character', [
        _f('Homeworld', 'reference'),
        _f('Augmentations', 'longtext'),
        _f('Affiliation', 'reference'),
        _f('Clearance', 'select', ['None', 'Restricted', 'Secret', 'Black']),
      ]),
      _custom('Starships', 'Starship', '#2b7a8c', [
        _f('Class'),
        _f('Crew', 'number'),
        _f('Captain', 'reference'),
        _f('Armament', 'longtext'),
        _f('FTL capable', 'toggle'),
        _f('Commissioned', 'date'),
      ]),
      _custom('Planets & Stations', 'World', '#6b7a2b', [
        _f('Population', 'number'),
        _f('Government', 'select', ['Corporate', 'Democratic', 'Military', 'Theocratic', 'Anarchic']),
        _f('Atmosphere', 'select', ['Breathable', 'Thin', 'Toxic', 'None']),
        _f('Controlled by', 'reference'),
      ]),
      _custom('Technologies', 'Technology', '#a3622b', [
        _f('Tech level', 'number'),
        _f('Inventor', 'reference'),
        _f('How it works', 'longtext'),
        _f('Limitations', 'longtext'),
      ]),
    ],
  ),
  TypePreset(
    'preset-detective-case',
    'Detective Case',
    'Roles, motives and alibis on characters, plus Clues and Cases.',
    [
      _extend('character', [
        _f('Role', 'select', ['Detective', 'Suspect', 'Victim', 'Witness', 'Other']),
        _f('Motive', 'longtext'),
        _f('Alibi', 'longtext'),
        _f('Alibi holds up', 'toggle'),
        _f('Secret', 'longtext'),
      ]),
      _custom('Clues', 'Clue', '#8c2b5a', [
        _f('Found at', 'reference'),
        _f('Found on', 'date'),
        _f('Points to', 'reference'),
        _f('Red herring', 'toggle'),
        _f('Significance', 'longtext'),
      ]),
      _custom('Cases', 'Case', '#4f5fa3', [
        _f('Status', 'select', ['Open', 'Cold', 'Solved']),
        _f('Victim', 'reference'),
        _f('Culprit', 'reference'),
        _f('Opened', 'date'),
        _f('Method', 'longtext'),
      ]),
    ],
  ),
  TypePreset(
    'preset-urban-fantasy',
    'Urban Fantasy',
    'Supernatural types and mundane covers on characters, plus Supernatural Factions and Hidden Places.',
    [
      _extend('character', [
        _f('Supernatural type', 'select', ['Human', 'Witch', 'Vampire', 'Werewolf', 'Fae', 'Spirit', 'Other']),
        _f('Mundane cover'),
        _f('True name'),
        _f('Weaknesses', 'multiselect', ['Iron', 'Silver', 'Sunlight', 'Salt', 'Running water', 'True name']),
      ]),
      _custom('Supernatural Factions', 'Faction', '#8c2b5a', [
        _f('Territory', 'reference'),
        _f('Leader', 'reference'),
        _f('Stance toward humans', 'select', ['Protective', 'Indifferent', 'Predatory', 'Hidden']),
      ]),
      _custom('Hidden Places', 'Hidden place', '#2b8c6b', [
        _f('Wards', 'longtext'),
        _f('How to get in'),
        _f('Known to mortals', 'toggle'),
      ]),
    ],
  ),
];
