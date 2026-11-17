// WORLDBUILDING PRESETS (as in the original app): ready-made starting points for a whole novel, fields added to
// built-in categories and kinds of record of their own. Applying one (CodexChanges.addKinds) only ever adds categories
// and fields. A port of flutter_app/lib/shared/domain/codex/world_presets.dart.

import type { JsonMap } from '../json';
import { TypePreset } from './typePresets';

type F = readonly [name: string, type: string, options: readonly string[]];

const f = (name: string, type = 'text', options: readonly string[] = []): F => [name, type, options];

const fields = (defs: readonly F[]): JsonMap[] =>
  defs.map(([name, type, options], i) => ({ id: `preset-${i}`, name, type, options: [...options] }));

const custom = (name: string, singular: string, color: string, defs: readonly F[]): JsonMap => ({
  key: '',
  name,
  singular,
  color,
  builtin: false,
  fields: fields(defs),
});

/** Extra fields for a built-in category, added to whatever it already has. */
const extend = (key: string, defs: readonly F[]): JsonMap => ({
  key,
  name: '',
  singular: '',
  color: '',
  builtin: true,
  fields: fields(defs),
});

export const worldPresets: readonly TypePreset[] = [
  new TypePreset(
    'preset-progression-fantasy',
    'Progression Fantasy Bible',
    'Ranks, elements and affixes on characters, plus Skills, Cultivation Stages and Guilds.',
    [
      // No Class or Level here: those are kept once, on the character's system sheet.
      extend('character', [
        f('Power Rank', 'select', ['F', 'E', 'D', 'C', 'B', 'A', 'S']),
        f('Elements', 'multiselect', ['Fire', 'Water', 'Earth', 'Air', 'Light', 'Dark', 'Void']),
        f('Affixes', 'longtext'),
        f('Current stage', 'reference'),
      ]),
      custom('Skills & Abilities', 'Skill', '#a8436b', [
        f('Kind', 'select', ['Active', 'Passive', 'Ultimate']),
        f('Rank', 'select', ['Common', 'Rare', 'Epic', 'Legendary']),
        f('Cost'),
        f('Cooldown'),
        f('Effect', 'longtext'),
        f('Used by', 'reference'),
      ]),
      custom('Cultivation Stages', 'Stage', '#2b7a8c', [
        f('Order', 'number'),
        f('Requirements', 'longtext'),
        f('Breakthrough', 'longtext'),
        f('Lifespan granted'),
      ]),
      custom('Guilds & Sects', 'Guild', '#4f5fa3', [
        f('Standing', 'select', ['Minor', 'Rising', 'Major', 'Legendary']),
        f('Leader', 'reference'),
        f('Headquarters', 'reference'),
        f('Members', 'number'),
        f('Open to recruits', 'toggle'),
      ]),
    ],
  ),
  new TypePreset(
    'preset-science-fiction',
    'Science Fiction',
    'Augmentations and affiliations on characters, plus Starships, Planets & Stations and Technologies.',
    [
      extend('character', [
        f('Homeworld', 'reference'),
        f('Augmentations', 'longtext'),
        f('Affiliation', 'reference'),
        f('Clearance', 'select', ['None', 'Restricted', 'Secret', 'Black']),
      ]),
      custom('Starships', 'Starship', '#2b7a8c', [
        f('Class'),
        f('Crew', 'number'),
        f('Captain', 'reference'),
        f('Armament', 'longtext'),
        f('FTL capable', 'toggle'),
        f('Commissioned', 'date'),
      ]),
      custom('Planets & Stations', 'World', '#6b7a2b', [
        f('Population', 'number'),
        f('Government', 'select', ['Corporate', 'Democratic', 'Military', 'Theocratic', 'Anarchic']),
        f('Atmosphere', 'select', ['Breathable', 'Thin', 'Toxic', 'None']),
        f('Controlled by', 'reference'),
      ]),
      custom('Technologies', 'Technology', '#a3622b', [
        f('Tech level', 'number'),
        f('Inventor', 'reference'),
        f('How it works', 'longtext'),
        f('Limitations', 'longtext'),
      ]),
    ],
  ),
  new TypePreset('preset-detective-case', 'Detective Case', 'Roles, motives and alibis on characters, plus Clues and Cases.', [
    extend('character', [
      f('Role', 'select', ['Detective', 'Suspect', 'Victim', 'Witness', 'Other']),
      f('Motive', 'longtext'),
      f('Alibi', 'longtext'),
      f('Alibi holds up', 'toggle'),
      f('Secret', 'longtext'),
    ]),
    custom('Clues', 'Clue', '#8c2b5a', [
      f('Found at', 'reference'),
      f('Found on', 'date'),
      f('Points to', 'reference'),
      f('Red herring', 'toggle'),
      f('Significance', 'longtext'),
    ]),
    custom('Cases', 'Case', '#4f5fa3', [
      f('Status', 'select', ['Open', 'Cold', 'Solved']),
      f('Victim', 'reference'),
      f('Culprit', 'reference'),
      f('Opened', 'date'),
      f('Method', 'longtext'),
    ]),
  ]),
  new TypePreset(
    'preset-urban-fantasy',
    'Urban Fantasy',
    'Supernatural types and mundane covers on characters, plus Supernatural Factions and Hidden Places.',
    [
      extend('character', [
        f('Supernatural type', 'select', ['Human', 'Witch', 'Vampire', 'Werewolf', 'Fae', 'Spirit', 'Other']),
        f('Mundane cover'),
        f('True name'),
        f('Weaknesses', 'multiselect', ['Iron', 'Silver', 'Sunlight', 'Salt', 'Running water', 'True name']),
      ]),
      custom('Supernatural Factions', 'Faction', '#8c2b5a', [
        f('Territory', 'reference'),
        f('Leader', 'reference'),
        f('Stance toward humans', 'select', ['Protective', 'Indifferent', 'Predatory', 'Hidden']),
      ]),
      custom('Hidden Places', 'Hidden place', '#2b8c6b', [
        f('Wards', 'longtext'),
        f('How to get in'),
        f('Known to mortals', 'toggle'),
      ]),
    ],
  ),
];
