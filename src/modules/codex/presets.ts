import type { FieldType, TemplateData } from './types';

type F = [name: string, type?: FieldType, options?: string[]];
const fields = (...defs: F[]) => defs.map(([name, type = 'text', options = []], i) => ({ id: `preset-${i}`, name, type, options }));
const custom = (name: string, singular: string, color: string, ...defs: F[]) => ({ key: '', name, singular, color, builtin: false, fields: fields(...defs) });
/** Extra fields for a built-in category, added to whatever it already has. */
const extend = (key: string, ...defs: F[]) => ({ key, name: '', singular: '', color: '', builtin: true, fields: fields(...defs) });

export interface Preset extends TemplateData {
  id: string;
  name: string;
  description: string;
}

/** Ready-made starting points. Applying one only ever adds categories and fields. */
export const PRESETS: Preset[] = [
  {
    id: 'preset-progression-fantasy',
    name: 'Progression Fantasy Bible',
    description: 'Ranks, elements and affixes on characters, plus Skills, Cultivation Stages and Guilds.',
    categories: [
      // No Class or Level here: those are kept once, on the character's system sheet.
      extend('character', ['Power Rank', 'select', ['F', 'E', 'D', 'C', 'B', 'A', 'S']], ['Elements', 'multiselect', ['Fire', 'Water', 'Earth', 'Air', 'Light', 'Dark', 'Void']], ['Affixes', 'longtext'], ['Current stage', 'reference']),
      custom('Skills & Abilities', 'Skill', '#a8436b', ['Kind', 'select', ['Active', 'Passive', 'Ultimate']], ['Rank', 'select', ['Common', 'Rare', 'Epic', 'Legendary']], ['Cost'], ['Cooldown'], ['Effect', 'longtext'], ['Used by', 'reference']),
      custom('Cultivation Stages', 'Stage', '#2b7a8c', ['Order', 'number'], ['Requirements', 'longtext'], ['Breakthrough', 'longtext'], ['Lifespan granted']),
      custom('Guilds & Sects', 'Guild', '#4f5fa3', ['Standing', 'select', ['Minor', 'Rising', 'Major', 'Legendary']], ['Leader', 'reference'], ['Headquarters', 'reference'], ['Members', 'number'], ['Open to recruits', 'toggle']),
    ],
  },
  {
    id: 'preset-science-fiction',
    name: 'Science Fiction',
    description: 'Augmentations and affiliations on characters, plus Starships, Planets & Stations and Technologies.',
    categories: [
      extend('character', ['Homeworld', 'reference'], ['Augmentations', 'longtext'], ['Affiliation', 'reference'], ['Clearance', 'select', ['None', 'Restricted', 'Secret', 'Black']]),
      custom('Starships', 'Starship', '#2b7a8c', ['Class'], ['Crew', 'number'], ['Captain', 'reference'], ['Armament', 'longtext'], ['FTL capable', 'toggle'], ['Commissioned', 'date']),
      custom('Planets & Stations', 'World', '#6b7a2b', ['Population', 'number'], ['Government', 'select', ['Corporate', 'Democratic', 'Military', 'Theocratic', 'Anarchic']], ['Atmosphere', 'select', ['Breathable', 'Thin', 'Toxic', 'None']], ['Controlled by', 'reference']),
      custom('Technologies', 'Technology', '#a3622b', ['Tech level', 'number'], ['Inventor', 'reference'], ['How it works', 'longtext'], ['Limitations', 'longtext']),
    ],
  },
  {
    id: 'preset-detective-case',
    name: 'Detective Case',
    description: 'Roles, motives and alibis on characters, plus Clues and Cases.',
    categories: [
      extend('character', ['Role', 'select', ['Detective', 'Suspect', 'Victim', 'Witness', 'Other']], ['Motive', 'longtext'], ['Alibi', 'longtext'], ['Alibi holds up', 'toggle'], ['Secret', 'longtext']),
      custom('Clues', 'Clue', '#8c2b5a', ['Found at', 'reference'], ['Found on', 'date'], ['Points to', 'reference'], ['Red herring', 'toggle'], ['Significance', 'longtext']),
      custom('Cases', 'Case', '#4f5fa3', ['Status', 'select', ['Open', 'Cold', 'Solved']], ['Victim', 'reference'], ['Culprit', 'reference'], ['Opened', 'date'], ['Method', 'longtext']),
    ],
  },
  {
    id: 'preset-urban-fantasy',
    name: 'Urban Fantasy',
    description: 'Supernatural types and mundane covers on characters, plus Supernatural Factions and Hidden Places.',
    categories: [
      extend('character', ['Supernatural type', 'select', ['Human', 'Witch', 'Vampire', 'Werewolf', 'Fae', 'Spirit', 'Other']], ['Mundane cover'], ['True name'], ['Weaknesses', 'multiselect', ['Iron', 'Silver', 'Sunlight', 'Salt', 'Running water', 'True name']]),
      custom('Supernatural Factions', 'Faction', '#8c2b5a', ['Territory', 'reference'], ['Leader', 'reference'], ['Stance toward humans', 'select', ['Protective', 'Indifferent', 'Predatory', 'Hidden']]),
      custom('Hidden Places', 'Hidden place', '#2b8c6b', ['Wards', 'longtext'], ['How to get in'], ['Known to mortals', 'toggle']),
    ],
  },
];
