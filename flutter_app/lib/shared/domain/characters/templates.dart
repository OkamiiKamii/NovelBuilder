import '../json.dart';
import '../records/category.dart';
import 'character_records.dart';

FieldSuggestion _f(String name, [FieldType type = FieldType.text, List<String> options = const []]) =>
    FieldSuggestion(name, type, options);
FieldSuggestion _long(String name) => _f(name, FieldType.longtext);
FieldSuggestion _tags(String name) => _f(name, FieldType.tags);
FieldSuggestion _num(String name) => _f(name, FieldType.number);
FieldSuggestion _ref(String name) => _f(name, FieldType.reference);
TemplateSection _section(String name, ProfileTab tab, List<FieldSuggestion> fields) =>
    TemplateSection(name, tab, fields);

const _o = ProfileTab.overview;
const _d = ProfileTab.details;

final _identity = _section('Core Identity', _o, [
  _f('Full Name'),
  _f('Age'),
  _f('Date of Birth'),
  _f('Gender'),
  _f('Pronouns'),
  _f('Species'),
  _f('Nationality'),
  _ref('Place of Origin'),
  _f('Occupation'),
  _f('Alignment'),
  _num('Loyalty'),
  _num('Ambition'),
  _long('Physical Appearance'),
]);
final _psychology = _section('Personality & Psychology', _o, [
  _tags('Core Traits'),
  _tags('Secondary Traits'),
  _tags('Strengths'),
  _tags('Weaknesses'),
  _tags('Fears'),
  _long('Motivations'),
  _tags('Values'),
  _long('Beliefs'),
  _tags('Habits'),
  _long('Behavioral Patterns'),
  _long('Emotional Triggers'),
  _long('Coping Mechanisms'),
  _long('Internal Conflicts'),
]);
final _arc = _section('Character Arc', _o, [
  _long('Starting Point'),
  _long('Initial Beliefs'),
  _long('Initial Goals'),
  _long('Internal Conflict'),
  _long('External Conflict'),
  _long('Major Turning Points'),
  _long('Development Milestones'),
  _long('Current State'),
  _long('Intended Resolution'),
]);
final _position = _section('Resources & Position', _o, [
  _f('Rank'),
  _f('Organization'),
  _num('Political Influence'),
  _f('Wealth'),
  _long('Resources'),
  _f('Social Standing'),
  _long('Reputation'),
]);
final _biography = _section('Biography & History', _d, [
  _long('Childhood'),
  _long('Family Background'),
  _long('Education'),
  _long('Important Past Events'),
  _long('Previous Occupations'),
  _long('Personal History'),
  _long('Cultural Background'),
  _long('Major Life Experiences'),
]);
final _appearance = _section('Appearance', _d, [
  _f('Height'),
  _f('Build'),
  _f('Hair'),
  _f('Eyes'),
  _f('Skin'),
  _long('Distinguishing Features'),
  _long('Scars'),
  _long('Tattoos'),
  _long('Clothing'),
  _f('Voice'),
  _long('Mannerisms'),
]);

CharacterTemplate _make(String id, String name, String description, List<TemplateSection> sections) =>
    CharacterTemplate(id: id, projectId: null, name: name, description: description, sections: sections);

/// The layouts that come with the app, the same as the original's. Each is only a starting point: every section and
/// field can be renamed, moved, added to or removed.
final builtinTemplates = <CharacterTemplate>[
  _make('general', 'General Character', 'Identity, personality, arc, position, biography and appearance.', [
    _identity,
    _psychology,
    _arc,
    _position,
    _biography,
    _appearance,
  ]),
  _make(
    'protagonist',
    'Protagonist',
    'The general layout with room for the want, the need and what stands in the way.',
    [
      _identity,
      _psychology,
      _section('Goals & Stakes', _o, [
        _long('What they want'),
        _long('What they need'),
        _long('What stands in the way'),
        _long('What they stand to lose'),
        _long('The lie they believe'),
      ]),
      _arc,
      _position,
      _biography,
      _appearance,
    ],
  ),
  _make('antagonist', 'Antagonist', 'Why they oppose the protagonist, how, and what would make them stop.', [
    _identity,
    _psychology,
    _section('Opposition', _o, [
      _long('What they want'),
      _long('Why they believe they are right'),
      _long('Methods'),
      _long('Resources and reach'),
      _long('Lines they will not cross'),
      _long('What would make them stop'),
    ]),
    _arc,
    _position,
    _biography,
    _appearance,
  ]),
  _make('supporting', 'Supporting Character', 'A lighter layout: who they are, and what they are to the story.', [
    _section('Core Identity', _o, [_f('Age'), _f('Occupation'), _f('Species'), _long('Physical Appearance')]),
    _section('Role in the Story', _o, [
      _long('What they are to the protagonist'),
      _long('What they want'),
      _long('How they change, if they do'),
    ]),
    _section('Personality', _o, [_tags('Core Traits'), _tags('Strengths'), _tags('Weaknesses')]),
    _biography,
  ]),
  _make('fantasy', 'Fantasy Character', 'Adds lineage, magic and allegiances.', [
    _identity,
    _section('Lineage & Magic', _o, [
      _f('Bloodline'),
      _f('Magical Lineage'),
      _f('School of Magic'),
      _long('Gifts'),
      _long('Limits and cost'),
      _ref('Patron or Deity'),
    ]),
    _psychology,
    _arc,
    _section('Allegiances', _o, [_ref('Faction'), _f('Rank'), _ref('Sworn to'), _long('Oaths')]),
    _biography,
    _appearance,
  ]),
  // Level, class, attributes, skills and gear are not here on purpose: they are kept once, on the character's system
  // sheet and progression snapshots, and shown on the profile from there.
  _make(
    'progression',
    'Progression Fantasy Character',
    'Goals, path and growth. Level, class, attributes and skills live on their system sheet.',
    [
      _identity,
      _psychology,
      _section('Goals', _o, [_long('Immediate goal'), _long('Long-term goal'), _long('What drives the climb')]),
      _section('Path', _o, [
        _f('Path or Realm'),
        _long('How they fight'),
        _long('Signature technique'),
        _long('Limits and cost'),
      ]),
      _section('Evolution History', _d, [_long('Breakthroughs'), _long('Evolutions'), _long('Setbacks')]),
      _arc,
    ],
  ),
  _make('suspect', 'Mystery Suspect', 'Motive, means, opportunity and alibi, and what is yet to come out.', [
    _section('Identity', _o, [
      _f('Age'),
      _f('Occupation'),
      _long('Connection to the victim'),
      _long('Physical Appearance'),
    ]),
    _section('The Case', _o, [
      _long('Motive'),
      _long('Means'),
      _long('Opportunity'),
      _long('Alibi'),
      _f('Alibi holds?', FieldType.toggle),
      _long('Evidence for'),
      _long('Evidence against'),
    ]),
    _section('Reveal', _o, [
      _f('Reveal status', FieldType.select, ['Unsuspected', 'Suspected', 'Cleared', 'Exposed']),
      _long('What they are hiding'),
      _long('How it comes out'),
    ]),
    _psychology,
    _biography,
  ]),
  _make(
    'romance',
    'Romance Character',
    'What they want from love, what they fear from it, and what keeps them apart.',
    [
      _identity,
      _psychology,
      _section('Heart', _o, [
        _long('What they want from love'),
        _long('What they fear from it'),
        _long('Past relationships'),
        _long('Wound'),
        _tags('What attracts them'),
        _long('What keeps them apart'),
      ]),
      _arc,
      _biography,
      _appearance,
    ],
  ),
  _make('scifi', 'Science Fiction Character', 'Origin, augmentation, affiliation and clearance.', [
    _identity,
    _section('Origin & Body', _o, [
      _ref('Homeworld or Habitat'),
      _f('Species or Strain'),
      _long('Augmentations'),
      _long('Implants'),
      _f('Lifespan'),
    ]),
    _section('Affiliation', _o, [
      _ref('Faction'),
      _f('Rank'),
      _f('Clearance'),
      _ref('Ship or Posting'),
      _long('Specialisation'),
    ]),
    _psychology,
    _arc,
    _biography,
    _appearance,
  ]),
];

String slug(String text) {
  final s = text.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
  return s.isEmpty ? 'section' : s;
}

/// The sections a template gives a new profile, all empty. Ids are worked out from the names, so they are the same
/// every time.
List<JsonMap> sectionsOf(CharacterTemplate template) => [
  for (final (i, s) in template.sections.indexed)
    {
      'id': '${template.id}-${slug(s.name)}-$i',
      'name': s.name,
      'tab': s.tab.name,
      'hidden': false,
      'fieldIds': <String>[],
    },
];

/// What a section offers to add: the fields its name has in any template the novel can use, less any the character
/// already has (in this section or another: a field is kept once).
List<FieldSuggestion> suggestionsFor(String sectionName, List<CharacterTemplate> templates, List<String> have) {
  final taken = {for (final name in have) name.trim().toLowerCase()};
  final seen = <String>{};
  final wanted = sectionName.trim().toLowerCase();
  return [
    for (final template in templates)
      for (final section in template.sections)
        if (section.name.trim().toLowerCase() == wanted)
          for (final field in section.fields)
            if (!taken.contains(field.name.toLowerCase()) && seen.add(field.name.toLowerCase())) field,
  ];
}
