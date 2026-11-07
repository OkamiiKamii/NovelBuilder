import type { FieldType, TemplateData } from '@/modules/codex/types';
import { SYSTEM_PRESETS } from '@/modules/systems/presets';
import type { ModuleDefinition, ToolDef } from './types';

type F = [name: string, type?: FieldType, options?: string[]];
const fields = (...defs: F[]) => defs.map(([name, type = 'text', options = []], i) => ({ id: `module-${i}`, name, type, options }));
const custom = (name: string, singular: string, color: string, ...defs: F[]): TemplateData['categories'][number] => ({ key: '', name, singular, color, builtin: false, fields: fields(...defs) });
/** Extra fields for a built-in category, added to whatever it already has. */
const extend = (key: string, ...defs: F[]): TemplateData['categories'][number] => ({ key, name: '', singular: '', color: '', builtin: true, fields: fields(...defs) });

// Field shorthands. Every field is optional to fill in, and the author can rename, retype, reorder or remove any of them under "Categories & fields".
const long = (name: string): F => [name, 'longtext'];
const one = (name: string): F => [name, 'reference'];
const many = (name: string): F => [name, 'references'];
const pick = (name: string, ...options: string[]): F => [name, 'select', options];
const num = (name: string): F => [name, 'number'];

// Tool shorthands.
const registry = (id: string, title: string, category: string, more: { groupBy?: string; summary?: string[]; hint?: string } = {}): ToolDef => ({ id, type: 'registry', title, category, ...more });
const page = (id: string, title: string, to: Extract<ToolDef, { type: 'page' }>['to'], hint: string): ToolDef => ({ id, type: 'page', title, to, hint });

interface Card {
  nav: string;
  icon: string;
  genre: string;
  description: string;
  features: string[];
  integrates: string[];
}
const define = (id: string, name: string, card: Card, categories: TemplateData['categories'], tools: ToolDef[], more: Partial<ModuleDefinition> = {}): ModuleDefinition => ({ id, name, ...card, version: 2, builtin: true, schema: { categories }, system: null, tools, unlocks: [], ...more });

// The built-in categories by the names tools use for them.
const CHARACTERS = 'Characters';
const LOCATIONS = 'Locations';
const FACTIONS = 'Factions & Species';
const ITEMS = 'Items & Artifacts';
const LORE = 'Lore & History';

/**
 * The ten genre modules that ship with the app. Each is only data: the
 * categories and fields it adds to the worldbuilding database, and
 * descriptions of the tools that work on them. None of them holds a
 * character, a place or an event of its own: their records point at the
 * project's one set of those, so several modules can describe the same
 * person from different sides.
 */
export const BUILTIN_MODULES: ModuleDefinition[] = [
  // ------------------------------------------------------------------------------------------------ 1. Fantasy
  define(
    'high-fantasy', 'Fantasy Worldbuilding',
    {
      nav: 'Fantasy', icon: '✦', genre: 'Epic, high, low and dark fantasy',
      description: 'Design magic systems and their rules, and keep spells, creatures, species, realms, mythology, artifacts and magical materials as linked records.',
      features: ['Magic system designer', 'Spell and technique registry', 'Species and creatures', 'Realms and territories', 'Mythology and deities', 'Artifacts and materials'],
      integrates: ['Codex', 'Characters', 'Systems', 'Timeline', 'Canon', 'Story graph', 'Search'],
    },
    [
      custom('Magic Systems', 'Magic System', '#7a4fa3',
        ['Category'], long('Origin'), many('Known users'), many('Related cultures'), many('Related locations'), long('History'),
        long('How it is accessed'), long('How it is activated'), long('Sources of power'), long('Requirements'), long('Costs'), long('Limitations'), long('Risks'), long('Restrictions'), long('Failure conditions'), long('Exceptional cases'),
        long('Stages or levels'), long('Learning and advancement'), long('Specializations'), long('Transformations'),
        long('Interactions with other systems'), long('Conflicts'), long('Countermeasures'), long('Immunities')),
      custom('Spells & Techniques', 'Spell', '#a8436b',
        one('Magic system'), ['Category'], long('Effects'), ['Activation method'], long('Requirements'), ['Cost'], ['Range'], ['Duration'], long('Limitations'), long('Risks'), many('Known users'), many('Related artifacts'), many('Related locations'), long('Acquisition history')),
      custom('Creatures', 'Creature', '#6b7a2b',
        ['Classification'], long('Physical characteristics'), ['Lifespan'], long('Natural abilities'), long('Weaknesses'), many('Habitat'), long('Behavior'), ['Intelligence'], long('Magical properties'), long('Historical significance')),
      custom('Species & Races', 'Species', '#a3622b',
        ['Classification'], long('Physical characteristics'), ['Lifespan'], long('Natural abilities'), long('Weaknesses'), many('Homelands'), ['Reproduction'], long('Culture'), long('Social structure'), long('Magical properties'), long('Historical significance')),
      custom('Realms & Territories', 'Realm', '#3d5fa8',
        pick('Kind', 'Kingdom', 'Empire', 'Duchy', 'Province', 'City', 'Village', 'Territory'), one('Part of'), one('Capital'), ['Political system'], one('Ruler'), many('Noble houses'), long('Military forces'), long('Borders'), long('Trade'), many('Allies'), many('Rivals'), long('Conflicts')),
      custom('Mythology & Deities', 'Myth', '#8a6d1f',
        pick('Kind', 'Deity', 'Pantheon', 'Creation myth', 'Religious tradition', 'Religious organization', 'Legendary event', 'Mythological creature'), ['Domains'], many('Sacred places'), many('Followers'), many('Belongs to'), long('Beliefs and practices'), long('Conflicts')),
      custom('Magical Materials', 'Material', '#2b8c6b', ['Kind'], long('Properties'), many('Where it is found'), ['Rarity'], long('Uses'), long('Dangers')),
      extend('item', ['Origin'], one('Creator'), one('Current holder'), long('Known effects'), long('Limitations'), pick('Bound', 'Unbound', 'Bound', 'Cursed'), long('History')),
      extend('character', one('Species')),
    ],
    [
      registry('magic', 'Magic systems', 'Magic Systems', { summary: ['Category', 'Sources of power'], hint: 'The rules of each kind of magic: how it is reached, what it costs, where it stops. Every field is optional; a setting need not have mana, schools or levels.' }),
      registry('spells', 'Spells & techniques', 'Spells & Techniques', { groupBy: 'Magic system', summary: ['Cost', 'Range'] }),
      { id: 'casters', type: 'matrix', title: 'Who can cast what', rows: 'Spells & Techniques', columns: CHARACTERS, values: ['Knows', 'Learning', 'Forbidden'], hint: 'What each character can do, kept apart from what the spell is.' },
      registry('creatures', 'Magical creatures', 'Creatures', { groupBy: 'Classification', summary: ['Weaknesses'] }),
      registry('species', 'Species & races', 'Species & Races', { summary: ['Lifespan'], hint: 'A character points at their species from their profile (the shared field “Species”) instead of repeating its description.' }),
      registry('realms', 'Kingdoms & territories', 'Realms & Territories', { groupBy: 'Kind', summary: ['Ruler', 'Capital'] }),
      registry('myths', 'Mythology & deities', 'Mythology & Deities', { groupBy: 'Kind', summary: ['Domains'], hint: 'Gods, pantheons, myths and faiths. A religion here need not have gods or a hierarchy.' }),
      registry('artifacts', 'Artifacts & relics', ITEMS, { groupBy: 'Bound', summary: ['Current holder', 'Origin'], hint: 'These are the project’s items: the same records the Codex and a character’s possessions use.' }),
      { id: 'artifact-log', type: 'log', title: 'Artifact history', about: ITEMS, states: ['Made', 'Found', 'Given', 'Stolen', 'Lost', 'Destroyed'], hint: 'Where each artifact changes hands, chapter by chapter.' },
      registry('materials', 'Magical materials', 'Magical Materials', { summary: ['Rarity', 'Uses'] }),
      registry('lore', 'Fantasy lore', LORE, { summary: ['When'] }),
      page('systems', 'Systems designer', 'systems', 'Give a magic system working rules: attributes, costs, ranks and what each ability requires.'),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 2. Progression
  define(
    'progression', 'Progression Fantasy & LitRPG',
    {
      nav: 'Progression Systems', icon: '▲', genre: 'Progression fantasy, LitRPG, cultivation',
      description: 'Track levels, XP, attributes, Jobs, classes, skills, ranks, evolutions, and progression-based character development.',
      features: ['Levels and experience', 'Attributes and stats', 'Classes and Jobs', 'Skills and abilities', 'Ranks and tiers', 'Evolutions and titles', 'Inventories', 'Progression history'],
      integrates: ['Systems', 'Character progression', 'Characters', 'Canon', 'Timeline', 'Story graph', 'Codex'],
    },
    [
      custom('Classes & Jobs', 'Class or Job', '#4f5fa3',
        pick('Kind', 'Class', 'Job'), ['Category'], ['Rank'], long('Prerequisites'), long('Acquisition method'), long('Restrictions'), many('Skills granted'), long('Attribute modifiers'), long('Advancement paths'), one('Evolves into'), ['Compatible systems'], long('Related transformations'), many('Held by')),
      custom('Skills & Abilities', 'Skill', '#a8436b',
        pick('Kind', 'Active', 'Passive', 'Ultimate'), pick('Rank', 'Common', 'Extra', 'Unique', 'Ultimate'), ['Level'], long('Effects'), long('Requirements'), ['Cost'], ['Cooldown'], long('Restrictions'), long('Prerequisites'), one('Evolves into'), long('Evolution condition'), many('Known users'), long('Acquisition history')),
      custom('Ranks & Tiers', 'Rank', '#8a6d1f',
        num('Order'), ['Ladder'], pick('What it measures', 'Raw power', 'Mastery', 'Rarity', 'Social status', 'Something else'), long('Advancement conditions'), long('Known limitations'), ['Sub-ranks'], long('Rank-specific rules')),
      custom('Titles & Achievements', 'Title', '#2b7a8c', long('How it is earned'), long('Effect'), many('Holders')),
      extend('character', pick('Power Rank', 'F', 'E', 'D', 'C', 'B', 'A', 'S')),
    ],
    [
      page('sheets', 'System registry', 'systems', 'Each progression system’s working rules live in the Systems designer: its attributes and resources, what a level costs and brings, classes and skills with their requirements, and every character’s sheet. Nothing is awarded on its own: you log experience and place points.'),
      registry('classes', 'Classes & Jobs', 'Classes & Jobs', { groupBy: 'Kind', summary: ['Rank', 'Evolves into'], hint: 'Whether a class and a Job are the same thing is yours to decide: “Kind” is only a label you can rename or empty.' }),
      registry('skill-list', 'Skills & abilities', 'Skills & Abilities', { groupBy: 'Rank', summary: ['Kind', 'Cost'], hint: 'Notes on a skill as the story knows it. A skill with working rules (costs worked out, requirements checked) is defined once, in Systems.' }),
      { id: 'skills', type: 'board', title: 'Skills by rank', category: 'Skills & Abilities', groupBy: 'Rank', show: ['Kind', 'Cost'] },
      { id: 'evolution', type: 'table', title: 'Skill evolution', category: 'Skills & Abilities', fields: ['Rank', 'Evolves into', 'Evolution condition'], hint: 'Which skill grows into which, and what it takes.' },
      registry('tiers', 'Ranks & tiers', 'Ranks & Tiers', { groupBy: 'Ladder', summary: ['Order', 'What it measures'], hint: 'Any ladder, in your words: F to SSS, realms, circles. Say what a rank measures; power, mastery, rarity and standing are not assumed to be the same.' }),
      { id: 'ranks', type: 'ranks', title: 'Rank progression', hint: 'How each character’s level or realm climbs chapter by chapter, from their progression snapshots.' },
      { id: 'evolutions', type: 'log', title: 'Evolutions & transformations', about: CHARACTERS, states: ['Class evolution', 'Job advancement', 'Species evolution', 'Skill evolution', 'Transformation', 'Awakening', 'Breakthrough', 'Title acquired'], hint: 'Each change with where it happens. Write the state before and after in its notes; earlier states are never overwritten.' },
      registry('titles', 'Titles & achievements', 'Titles & Achievements', { summary: ['Effect'] }),
      { id: 'inventory', type: 'inventory', title: 'Inventories & equipment', hint: 'What each character carries at a point in the story.' },
      page('snapshots', 'Progression history', 'progression', 'Log and compare a character’s whole state at any chapter.'),
    ],
    { system: SYSTEM_PRESETS.find((p) => p.id === 'litrpg')!.content, unlocks: ['systems', 'progression'] },
  ),

  // ------------------------------------------------------------------------------------------------ 3. Science fiction
  define(
    'scifi', 'Science Fiction & Space Exploration',
    {
      nav: 'Science Fiction', icon: '◎', genre: 'Space opera, hard SF, cyberpunk, post-apocalyptic',
      description: 'Manage planets and star systems, spacecraft, technologies, alien species and civilizations, colonies and the journeys between them.',
      features: ['Planets and celestial bodies', 'Spatial hierarchy', 'Spacecraft registry', 'Technology registry', 'Alien species and civilizations', 'Journeys and travel time', 'Interstellar politics'],
      integrates: ['Codex', 'Timeline', 'Characters', 'Story graph', 'Systems', 'Canon', 'Search'],
    },
    [
      custom('Regions of Space', 'Region', '#4f5fa3', pick('Kind', 'Galaxy', 'Sector', 'Region', 'Star system', 'Territory'), one('Part of'), one('Controlled by'), long('Notes on travel')),
      custom('Planets & Celestial Bodies', 'World', '#3f7d4e',
        pick('Type', 'Planet', 'Moon', 'Star', 'Asteroid', 'Space station', 'Artificial habitat', 'Other'), one('Part of'), ['Classification'], ['Gravity'], ['Atmosphere'], ['Climate'], long('Surface conditions'), long('Native life'), ['Population'], long('Resources'), many('Settlements'), one('Controlled by'), long('History')),
      custom('Colonies & Settlements', 'Settlement', '#a3622b', one('Located on'), ['Population'], ['Founded'], one('Governed by'), long('Resources'), long('Living conditions')),
      custom('Spacecraft', 'Ship', '#6b7a2b',
        ['Class'], one('Owner'), one('Manufacturer'), many('Crew'), ['Capacity'], ['Propulsion'], ['Range'], ['Speed'], long('Armament'), long('Defensive systems'), ['Cargo capacity'], long('Special equipment'), one('Current location'), pick('Status', 'Operational', 'Damaged', 'Docked', 'Lost', 'Destroyed'), long('History')),
      custom('Technologies', 'Technology', '#2b8c6b',
        ['Field'], long('Function'), long('Requirements'), long('Limitations'), long('Risks'), ['Origin'], long('Development history'), many('Known users'), many('Related technologies'), many('Related organizations'), pick('Status', 'Theoretical', 'Prototype', 'In use', 'Common', 'Lost')),
      custom('Alien Species', 'Alien Species', '#7a4fa3',
        long('Biology'), long('Physiology'), ['Lifespan'], ['Reproduction'], ['Communication'], ['Senses'], long('Environmental requirements'), one('Homeworld'), long('Culture'), ['Government'], long('Social structure'), ['Technology level'], long('Interstellar relations')),
      custom('Civilizations', 'Civilization', '#8c2b5a', many('Species'), ['Government'], many('Territory'), ['Technology level'], long('Relations with others'), long('History')),
      custom('Scientific Concepts', 'Concept', '#5c6370', long('What it is'), long('Rules in this setting'), long('Limits'), many('Where it matters')),
      custom('Journeys', 'Journey', '#2b7a8c',
        one('From'), one('To'), ['Departure'], ['Arrival'], one('Vessel'), ['Travel method'], ['Duration'], long('Route'), many('Stops'), many('Crew'), many('Passengers'), long('Cargo'), long('Restrictions'), long('Incidents')),
      extend('character', one('Species')),
    ],
    [
      registry('worlds', 'Planets & celestial bodies', 'Planets & Celestial Bodies', { groupBy: 'Type', summary: ['Part of', 'Population'], hint: 'Nothing here assumes real astronomy: leave out or rename whatever your setting does not use.' }),
      registry('regions', 'Star systems & regions', 'Regions of Space', { groupBy: 'Kind', summary: ['Part of'], hint: '“Part of” builds any hierarchy you like, such as galaxy, sector, star system, planet, settlement. None of its levels is required.' }),
      registry('ships', 'Spacecraft', 'Spacecraft', { groupBy: 'Status', summary: ['Class', 'Current location'] }),
      registry('tech', 'Technologies', 'Technologies', { groupBy: 'Status', summary: ['Field'], hint: 'The setting’s own technologies, artificial minds included, as things in the story.' }),
      registry('aliens', 'Alien species', 'Alien Species', { summary: ['Homeworld', 'Lifespan'], hint: 'A species is defined once here; a character points at it from their profile (the shared field “Species”).' }),
      registry('civilizations', 'Civilizations', 'Civilizations', { summary: ['Government', 'Technology level'] }),
      registry('concepts', 'Scientific concepts', 'Scientific Concepts'),
      registry('journeys', 'Space travel', 'Journeys', { summary: ['From', 'To', 'Duration'], hint: 'Each journey as you decide it. Link one to its event in the Timeline from that event’s page.' }),
      {
        id: 'travel', type: 'calculator', title: 'Travel-time calculator', hint: 'Works only from the two numbers you give it, in whatever units your setting uses. It assumes nothing about physics and saves nothing.',
        inputs: [{ key: 'distance', label: 'Distance', unit: 'in your units', value: 1 }, { key: 'speed', label: 'Speed', unit: 'units per day', value: 1 }],
        outputs: [{ label: 'Journey', formula: 'distance / speed', unit: 'days' }, { label: 'The same', formula: 'distance / speed / 365.25', unit: 'years' }],
      },
      registry('colonies', 'Colonies & settlements', 'Colonies & Settlements', { summary: ['Located on', 'Population'] }),
      { id: 'politics', type: 'matrix', title: 'Interstellar politics', rows: 'Civilizations', columns: 'Civilizations', values: ['Allied', 'Trading', 'Neutral', 'Rival', 'At war'], hint: 'How each civilization stands with each other.' },
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 4. Mystery
  define(
    'mystery', 'Mystery, Detective & Investigation',
    {
      nav: 'Mystery & Investigation', icon: '⌕', genre: 'Detective fiction, murder mystery, thriller',
      description: 'Plan cases, suspects, clues, evidence, motives and alibis, and keep what happened apart from what is believed and what the reader has been shown.',
      features: ['Case management', 'Suspect registry', 'Clues and evidence', 'Motive, means, opportunity', 'Alibis', 'Red herrings', 'Reveal order'],
      integrates: ['Characters', 'Timeline', 'Plot threads', 'Canon', 'Story graph', 'Manuscript', 'Continuity'],
    },
    [
      custom('Cases', 'Case', '#5c6370',
        long('Central question'), pick('Status', 'Planned', 'Active', 'Partially resolved', 'Resolved', 'Abandoned'), long('Known facts'), long('Unknown facts'), many('Suspects'), many('Victims'), many('Investigators'), many('Important locations'), ['Plot thread'], long('Resolution')),
      custom('Suspects', 'Suspect', '#8c2b5a',
        one('Character'), one('Case'), pick('Status', 'Suspect', 'Person of interest', 'Witness', 'Victim', 'Cleared', 'Culprit'), long('Motive'), long('Means'), long('Opportunity'), long('Alibi'), long('Secret'), long('Contradictory statements'), pick('Reveal status', 'Hidden', 'Hinted', 'Revealed')),
      custom('Clues & Evidence', 'Clue', '#2b7a8c',
        pick('Kind', 'Physical', 'Testimonial', 'Documentary', 'Digital', 'Behavioral', 'Circumstantial', 'Misleading', 'Red herring'), one('Case'), one('Found at'), one('Found by'), many('Related suspects'), many('Supports'),
        long('What it is'), long('What it seems to show'), long('What it really means'), pick('Standing', 'An observation', 'An interpretation', 'Confirmed', 'Disproved'), pick('Reader has seen it', 'Not yet', 'Shown', 'Explained'), ['Found']),
      custom('Alibis', 'Alibi', '#6b7a2b',
        one('Character'), one('Case'), one('Claimed location'), ['Claimed activity'], ['Time period'], many('Supporting evidence'), many('Contradicting evidence'), many('Witnesses'), pick('Standing', 'Claimed', 'Supported', 'Contradicted', 'Broken')),
    ],
    [
      registry('cases', 'Cases', 'Cases', { groupBy: 'Status', summary: ['Central question'], hint: 'A case’s status is yours to set; nothing here decides that a mystery is solved.' }),
      { id: 'suspects', type: 'board', title: 'Suspect board', category: 'Suspects', groupBy: 'Status', show: ['Motive', 'Alibi'] },
      registry('people', 'Suspects, victims & persons of interest', 'Suspects', { groupBy: 'Status', summary: ['Character', 'Case'], hint: 'Each points at a character; a suspect need not be guilty. Their secrets proper are kept on the character’s Secrets tab.' }),
      registry('clues', 'Clues & evidence', 'Clues & Evidence', { groupBy: 'Kind', summary: ['Standing', 'Reader has seen it'], hint: 'What a clue is, what it seems to show and what it really means are three fields: an interpretation is never treated as established.' }),
      { id: 'evidence', type: 'matrix', title: 'Evidence matrix', rows: 'Clues & Evidence', columns: 'Suspects', values: ['Implicates', 'Clears', 'Unclear'], hint: 'What each clue says about each suspect.' },
      { id: 'motive', type: 'table', title: 'Motive, means & opportunity', category: 'Suspects', fields: ['Motive', 'Means', 'Opportunity', 'Alibi'] },
      registry('alibis', 'Alibis', 'Alibis', { groupBy: 'Standing', summary: ['Character', 'Time period'], hint: 'An alibi is a claim. “Contradicted” records that evidence disagrees with it, not that the character lied.' }),
      { id: 'knowledge', type: 'matrix', title: 'Who knows what', rows: 'Clues & Evidence', columns: CHARACTERS, values: ['Knows', 'Suspects', 'Unaware', 'Misled'], hint: 'What each investigator and suspect knows of each clue. What the reader has been shown is the clue’s own “Reader has seen it”.' },
      { id: 'herrings', type: 'log', title: 'Red herrings', states: ['Planted', 'Reader suspects', 'Debunked'], about: 'Suspects', second: 'Debunked in', hint: 'False trails: where each is laid and where it is cleared up.' },
      { id: 'reveals', type: 'log', title: 'Revelations', states: ['Hidden', 'Hinted', 'Revealed'], second: 'Revealed in', hint: 'What the reader learns and when, in the order of the manuscript: the reveal order at a glance.' },
      page('timeline', 'Investigation timeline', 'timeline', 'What actually happened, and when, is the Story Timeline’s to keep. A claim that disagrees with it can be checked in Continuity.'),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 5. Romance
  define(
    'romance', 'Romance & Relationship Development',
    {
      nav: 'Romance', icon: '♥', genre: 'Romance, and stories with a romantic subplot',
      description: 'Plan romantic arcs: the stages a relationship moves through, its milestones and conflicts, and why the two belong together or do not.',
      features: ['Romantic arcs', 'Custom relationship stages', 'Emotional milestones', 'Romantic conflicts', 'Chemistry and compatibility notes', 'Relationship history'],
      integrates: ['Characters', 'Relationships', 'Timeline', 'Plot threads', 'Story graph', 'Organizer'],
    },
    [
      custom('Romantic Arcs', 'Romantic Arc', '#a8436b',
        many('Partners'), pick('Stage', 'Strangers', 'Acquaintances', 'Friends', 'Attraction', 'Courtship', 'Commitment'), ['Initial relationship'], long('Central conflict'), long('Emotional goals'), long('External obstacles'), long('Internal obstacles'), long('Current state'), long('Intended outcome'), ['Plot thread'],
        long('Shared interests'), long('Differences'), long('Sources of attraction'), long('Sources of conflict'), long('Communication patterns'), long('Trust'), long('Long-term goals'), num('Attraction'), num('Tension')),
    ],
    [
      registry('arcs', 'Romantic arcs', 'Romantic Arcs', { groupBy: 'Stage', summary: ['Partners', 'Central conflict'], hint: 'An arc points at its characters; the relationship itself (what they are to each other, chapter by chapter) stays in Relationships.' }),
      { id: 'stages', type: 'board', title: 'Arcs by stage', category: 'Romantic Arcs', groupBy: 'Stage', show: ['Partners', 'Current state'], hint: 'The stages are a choice list you can rename, reorder, add to or cut under Categories & fields.' },
      { id: 'transitions', type: 'log', title: 'Relationship stages', about: 'Romantic Arcs', states: ['Strangers', 'Acquaintances', 'Friends', 'Attraction', 'Courtship', 'Commitment'], hint: 'When an arc enters a stage, and the chapter that marks it. Set your own stages under Configure.' },
      { id: 'milestones', type: 'log', title: 'Emotional milestones', about: 'Romantic Arcs', checklist: true, suggestions: ['First meeting', 'First impression', 'First meaningful conversation', 'Growing trust', 'Vulnerability', 'Confession', 'First kiss', 'Misunderstanding', 'Separation', 'Reconciliation', 'Commitment'], hint: 'Only suggestions: a story may skip or reorder any of them.' },
      { id: 'conflicts', type: 'log', title: 'Romantic conflicts', about: 'Romantic Arcs', states: ['Brewing', 'Open', 'Resolved'], second: 'Resolved in', hint: 'What comes between them: its cause and consequences in the notes, where it starts and where it ends.' },
      { id: 'arc', type: 'log', title: 'Emotional intensity', about: 'Romantic Arcs', value: { label: 'Intensity', min: 0, max: 10 }, hint: 'How strongly it runs at each turn, as you judge it. The points are drawn as a line through the story.' },
      { id: 'meters', type: 'meters', title: 'Attraction & tension', category: 'Romantic Arcs', fields: ['Attraction', 'Tension'], max: 10, hint: 'Optional numbers for planning. They measure nothing but your intent.' },
      page('relationships', 'Relationship history', 'relationships', 'The full history of what two characters are to each other lives in Relationships.'),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 6. Horror
  define(
    'horror', 'Horror & Suspense',
    {
      nav: 'Horror & Suspense', icon: '☾', genre: 'Supernatural, psychological, cosmic, survival and gothic horror',
      description: 'Organize threats and the rules they follow, the rise of fear across the book, incidents and their cost, and what the survivors have left.',
      features: ['Threat registry', 'Entity rules', 'Fear and tension tracking', 'Incidents and consequences', 'Victims and survivors', 'Unknown phenomena', 'Survival resources'],
      integrates: ['Characters', 'Codex', 'Timeline', 'Plot threads', 'Canon', 'Character progression', 'Story graph'],
    },
    [
      custom('Threats & Entities', 'Threat', '#8c2b5a',
        pick('Classification', 'Human', 'Supernatural', 'Psychological', 'Environmental', 'Technological', 'Unknown'), long('Origin'), long('Behavior'), long('Goals'), long('Capabilities'), long('Limitations'), long('Weaknesses'),
        long('Conditions of appearance'), long('Triggers'), ['Range'], long('Containment'), long('Interaction rules'), long('Known exceptions'), long('Consequences of contact'), long('Unknown properties'),
        many('Associated locations'), many('Associated characters'), pick('Status', 'Dormant', 'Active', 'Contained', 'Destroyed', 'Unknown')),
      custom('Unknown Phenomena', 'Phenomenon', '#5c6370', long('What is observed'), many('Where'), long('Theories'), long('What is actually true'), pick('Status', 'Unexplained', 'Partly understood', 'Explained')),
      extend('character', ['Greatest fear'], pick('State', 'Unaware', 'Suspicious', 'Hunted', 'Broken', 'Dead', 'Survivor')),
      extend('item', pick('Resource', 'Food', 'Water', 'Medicine', 'Ammunition', 'Shelter', 'Energy', 'Equipment', 'Transportation'), ['Quantity left']),
    ],
    [
      registry('threats', 'Threats & entities', 'Threats & Entities', { groupBy: 'Classification', summary: ['Status', 'Weaknesses'], hint: 'A threat need not be a creature. Only the rules you write here exist; none is assumed.' }),
      { id: 'rules', type: 'table', title: 'Threat rules', category: 'Threats & Entities', fields: ['Conditions of appearance', 'Triggers', 'Limitations', 'Weaknesses', 'Containment'], hint: 'To make a rule binding, establish it as a fact in Canon from the threat’s Codex page.' },
      { id: 'tension', type: 'log', title: 'Fear & tension', states: ['Calm', 'Uneasy', 'Suspicious', 'Tense', 'Frightening', 'Terrifying', 'Crisis', 'Aftermath'], value: { label: 'Tension', min: 0, max: 10 }, hint: 'The intensity you intend for a chapter or scene, drawn as a line through the book. It is never read off the text.' },
      { id: 'threat', type: 'log', title: 'Escalation', about: 'Threats & Entities', value: { label: 'Threat', min: 0, max: 10 }, hint: 'How close each danger is at each turn.' },
      { id: 'incidents', type: 'log', title: 'Incidents', states: ['Disappearance', 'Attack', 'Discovery', 'Possession', 'Escape', 'Death', 'Injury', 'Breakdown', 'Change in the place'], hint: 'What happens, where in the book, and to whom. Its consequences go in the notes.' },
      { id: 'states', type: 'board', title: 'Victims & survivors', category: CHARACTERS, groupBy: 'State', show: ['Greatest fear'] },
      { id: 'fates', type: 'log', title: 'What becomes of them', about: CHARACTERS, states: ['Unharmed', 'Injured', 'Missing', 'Dead', 'Survived'], hint: 'What becomes of each person, and in which chapter.' },
      registry('phenomena', 'Unknown phenomena', 'Unknown Phenomena', { groupBy: 'Status', summary: ['What is observed'] }),
      registry('resources', 'Survival resources', ITEMS, { groupBy: 'Resource', summary: ['Quantity left', 'Owner'], hint: 'The project’s items, sorted by what they are good for. Leave “Resource” empty on anything that is not a supply.' }),
      page('timeline', 'Escalation timeline', 'timeline', 'The order things actually happen in is the Story Timeline’s to keep.'),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 7. Superhero
  define(
    'superhero', 'Superhero & Superpower',
    {
      nav: 'Superpowers', icon: '⚡', genre: 'Superhero fiction, powered urban fantasy, superhuman SF',
      description: 'Define powers with their limits and counters, who has them and how well, secret identities, hero and villain organizations, and the battles between them.',
      features: ['Power registry', 'Character powers and mastery', 'Limitations and weaknesses', 'Power interactions', 'Secret identities', 'Organizations', 'Battles and incidents'],
      integrates: ['Characters', 'Systems', 'Character progression', 'Codex', 'Timeline', 'Plot threads', 'Canon', 'Story graph'],
    },
    [
      custom('Powers', 'Power', '#a3622b',
        pick('Category', 'Physical enhancement', 'Energy manipulation', 'Matter manipulation', 'Space manipulation', 'Time manipulation', 'Mental', 'Biological adaptation', 'Transformation', 'Reality manipulation'), ['Classification'], ['Origin'], long('Effects'), ['Activation method'], ['Range'], ['Duration'],
        long('Requirements'), long('Costs'), long('Limitations'), long('Weaknesses'), long('Counters'), long('Recovery'), long('Known exceptions'), many('Related powers'), long('Evolution history')),
      custom('Power Interactions', 'Interaction', '#7a4fa3', pick('Kind', 'Counters', 'Amplifies', 'Interferes with', 'Combines with', 'Bypasses'), many('Powers'), long('Conditions'), long('Result'), long('Limitations')),
      custom('Identities', 'Identity', '#4f5fa3', one('Character'), ['Hero or villain name'], ['Public identity'], ['Civilian identity'], many('Known by'), many('Suspected by'), many('Organizations'), pick('Status', 'Secret', 'Suspected', 'Partly known', 'Public')),
      custom('Battles & Incidents', 'Battle', '#8c2b5a', many('Participants'), one('Location'), long('Objective'), many('Powers used'), long('Injuries'), long('Property damage'), long('Outcome'), long('Consequences'), ['Plot thread']),
      extend('faction', pick('Alignment', 'Heroes', 'Villains', 'Neutral', 'Government', 'Other'), many('Members'), long('Rules'), long('Recruitment'), long('Reputation')),
    ],
    [
      registry('powers', 'Power registry', 'Powers', { groupBy: 'Category', summary: ['Classification', 'Limitations'], hint: 'What a power is, defined once. How well a given character commands it is kept apart, under Character powers.' }),
      { id: 'holders', type: 'matrix', title: 'Character powers', rows: 'Powers', columns: CHARACTERS, values: ['Novice', 'Controlled', 'Mastered', 'Unstable', 'Lost'], hint: 'Who has which power, and their command of it. Two characters can share a power and differ here.' },
      { id: 'limits', type: 'table', title: 'Limitations & weaknesses', category: 'Powers', fields: ['Requirements', 'Costs', 'Limitations', 'Weaknesses', 'Counters', 'Recovery'], hint: 'To make a limit binding, establish it as a fact in Canon from the power’s Codex page; Continuity can then check the manuscript against it.' },
      registry('interactions', 'Power interactions', 'Power Interactions', { groupBy: 'Kind', summary: ['Powers', 'Result'], hint: 'Only what you record: powers are never combined or ruled on for you.' }),
      registry('identities', 'Secret identities', 'Identities', { groupBy: 'Status', summary: ['Character', 'Hero or villain name'], hint: 'Who is behind the mask, and who knows. The secret’s reveal and what each character believes belong on the character’s Secrets tab.' }),
      registry('organizations', 'Hero & villain organizations', FACTIONS, { groupBy: 'Alignment', summary: ['Leader', 'Members'], hint: 'The project’s factions: the same records the Codex and a character’s affiliations use.' }),
      { id: 'evolution', type: 'log', title: 'Power evolution', about: CHARACTERS, states: ['Awakened', 'Grew', 'Evolved', 'Lost', 'Regained'], hint: 'How a character’s powers change, and in which chapter.' },
      registry('battles', 'Battles & incidents', 'Battles & Incidents', { summary: ['Participants', 'Outcome'], hint: 'One record a battle, pointed at by every character who was in it.' }),
      page('systems', 'Systems designer', 'systems', 'Give powers working rules: ranks, costs worked out by formula, requirements that are checked.'),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 8. Historical
  define(
    'historical', 'Historical Fiction',
    {
      nav: 'Historical Fiction', icon: '⌛', genre: 'Historical novels, period drama, alternate history',
      description: 'Organize periods and events, real and invented figures, family lines, the details of daily life, points of divergence and the research behind them.',
      features: ['Historical periods', 'Event registry', 'Historical and fictional figures', 'Family lineages', 'Period details', 'Alternate history', 'Research notes'],
      integrates: ['Characters', 'Timeline', 'Codex', 'Relationships', 'Story graph', 'Alternate timelines', 'Canon'],
    },
    [
      custom('Historical Periods', 'Period', '#8a6d1f', ['Start'], ['End'], pick('Dates are', 'Exact', 'Approximate', 'Uncertain'), ['Geographic scope'], long('Political context'), long('Cultural context'), long('Technological context'), many('Major events'), many('Important figures')),
      custom('Historical Events', 'Historical Event', '#3d5fa8',
        ['Date or range'], pick('Basis', 'Recorded history', 'Fictionalized', 'Invented'), one('Period'), one('Location'), many('Participants'), many('Related factions'), long('Causes'), long('Consequences'), long('Historical significance'), long('Source notes')),
      custom('Period Details', 'Period Detail', '#6b7a2b',
        pick('Topic', 'Clothing', 'Architecture', 'Transportation', 'Food', 'Social customs', 'Political institutions', 'Military organization', 'Communication', 'Medicine', 'Currency', 'Education', 'Everyday life'), one('Period'), many('Where'), many('Related characters'), long('Notes')),
      custom('Alternate History', 'Divergence', '#7a4fa3', long('Real-world baseline'), long('Fictional divergence'), ['Divergence date'], long('Changes introduced'), many('Resulting events'), many('Affected figures'), many('Affected locations'), ['Plot thread']),
      custom('Research Notes', 'Reference', '#5c6370', ['Source'], long('Notes'), long('Relevant claims'), pick('Verification', 'Not checked', 'Partly checked', 'Checked by me'), many('About')),
      extend('character', pick('Historical basis', 'Historical figure', 'Fictional', 'Composite', 'Alternate-history version')),
    ],
    [
      registry('periods', 'Historical periods', 'Historical Periods', { summary: ['Start', 'End', 'Dates are'], hint: 'Dates are text, so “c. 1340” or “late in the reign” are as welcome as a day.' }),
      registry('events', 'Events', 'Historical Events', { groupBy: 'Basis', summary: ['Date or range', 'Period'], hint: '“Basis” keeps what you take from the record apart from what you invent. To place an event in the story’s chronology, link it from its Timeline event.' }),
      { id: 'figures', type: 'board', title: 'Historical figures', category: CHARACTERS, groupBy: 'Historical basis', hint: 'The project’s characters, by their relation to the historical record.' },
      { id: 'lineage', type: 'lineage', title: 'Family lineages', hint: 'Drawn from the family relationships in Relationships: parents and children, siblings, spouses. Add or change them there.' },
      registry('details', 'Period details', 'Period Details', { groupBy: 'Topic', summary: ['Period'] }),
      registry('divergences', 'Alternate history changes', 'Alternate History', { summary: ['Divergence date'], hint: 'What you change and what follows from it, as you record it; consequences are never worked out for you. A divergence can also be written as a branch of the story.' }),
      registry('research', 'Historical references', 'Research Notes', { groupBy: 'Verification', summary: ['Source'], hint: '“Verification” is your own note of what you have checked. Nothing here vouches for a source.' }),
      page('chronology', 'Chronology', 'timeline', 'The story’s chronology is the Timeline.'),
      page('branches', 'Alternate timelines', 'branches', 'Write a divergence as its own branch of the story.'),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 9. Contemporary
  define(
    'contemporary', 'Contemporary Fiction & Social Dynamics',
    {
      nav: 'Contemporary Life', icon: '⌂', genre: 'Contemporary drama, slice of life, coming of age, family drama',
      description: 'Keep the practical side of modern lives: social circles and family, work and school, routines, goals, money and the places people actually spend their days.',
      features: ['Social circles', 'Family structures', 'Work and education', 'Daily routines', 'Personal goals', 'Finances and resources', 'Life events', 'Modern locations'],
      integrates: ['Characters', 'Codex', 'Timeline', 'Relationships', 'Plot threads', 'Progress'],
    },
    [
      custom('Work & Education', 'Position', '#3d5fa8', one('Character'), pick('Kind', 'Job', 'Course of study', 'Volunteer role', 'Other'), one('Organization'), ['Role or course'], ['Schedule'], one('Supervisor or teacher'), many('Colleagues or classmates'), pick('Status', 'Current', 'Past', 'Planned'), long('Progress')),
      custom('Routines', 'Routine', '#6b7a2b', one('Character'), pick('Kind', 'Work', 'School', 'Commute', 'Hobby', 'Household', 'Social', 'Sleep', 'Other'), ['When'], one('Where'), many('With'), long('Notes')),
      custom('Goals & Circumstances', 'Goal', '#a3622b', one('Character'), pick('Kind', 'Career', 'Education', 'Family obligation', 'Financial', 'Personal project', 'Deadline', 'Life change', 'Challenge'), pick('Status', 'Wanted', 'Under way', 'Achieved', 'Given up'), ['Deadline'], long('What stands in the way'), ['Plot thread']),
      custom('Finances & Resources', 'Finances', '#2b8c6b', one('Character'), ['Income'], ['Expenses'], ['Savings'], ['Debt'], long('Assets'), ['Housing'], ['Employment status'], long('Obligations')),
      extend('faction', pick('Kind of group', 'Friend group', 'Family', 'Work team', 'School group', 'Neighborhood', 'Club', 'Online community', 'Professional network', 'Employer', 'School or university', 'Organization'), many('Members')),
      extend('location', pick('Kind of place', 'Home', 'Apartment', 'Office', 'School', 'Hospital', 'Restaurant', 'Shop', 'Park', 'Transport hub', 'Community space'), many('Who is found here')),
      extend('item', one('Important to')),
    ],
    [
      registry('circles', 'Social circles', FACTIONS, { groupBy: 'Kind of group', summary: ['Members'], hint: 'The project’s groups and organizations, the same records a character’s affiliations use.' }),
      { id: 'membership', type: 'matrix', title: 'Who belongs where', rows: FACTIONS, columns: CHARACTERS, values: ['At the centre', 'Member', 'On the edge', 'Former'], hint: 'How each character stands in each circle.' },
      { id: 'family', type: 'lineage', title: 'Family structures', hint: 'Drawn from the family relationships in Relationships. Add or change them there.' },
      registry('work', 'Work & education', 'Work & Education', { groupBy: 'Kind', summary: ['Character', 'Organization', 'Status'] }),
      registry('routines', 'Daily routines', 'Routines', { groupBy: 'Kind', summary: ['Character', 'When'], hint: 'For your reference when placing scenes. A routine never creates a scene or an event.' }),
      { id: 'goals', type: 'board', title: 'Personal goals', category: 'Goals & Circumstances', groupBy: 'Status', show: ['Character', 'Kind'], hint: 'A goal that carries a storyline can name its plot thread.' },
      registry('finances', 'Finances & resources', 'Finances & Resources', { summary: ['Character', 'Income', 'Debt'], hint: 'Free text, in any currency or none. No model of money is imposed.' }),
      registry('possessions', 'Important possessions', ITEMS, { summary: ['Important to', 'Owner'] }),
      { id: 'life', type: 'log', title: 'Life events', about: CHARACTERS, states: ['Birth', 'Move', 'Graduation', 'New job', 'Job lost', 'Wedding', 'Breakup', 'Illness', 'Loss'], hint: 'The turns in a life, with the chapter each falls in.' },
      registry('places', 'Modern locations', LOCATIONS, { groupBy: 'Kind of place', summary: ['Region'] }),
    ],
  ),

  // ------------------------------------------------------------------------------------------------ 10. Politics
  define(
    'politics', 'Political Intrigue, Factions & Power Structures',
    {
      nav: 'Politics & Factions', icon: '♜', genre: 'Court intrigue, political fantasy and SF, political thrillers',
      description: 'Design factions and governments, the offices and who holds them, alliances and rivalries as they shift, conspiracies, laws and the events that change who rules.',
      features: ['Faction registry', 'Political systems', 'Leaders and offices', 'Alliances and rivalries', 'Influence network', 'Conspiracies', 'Laws and policies', 'Political events'],
      integrates: ['Codex', 'Characters', 'Relationships', 'Timeline', 'Plot threads', 'Story graph', 'Canon', 'Alternate timelines'],
    },
    [
      extend('faction',
        pick('Faction type', 'Noble house', 'Political party', 'Kingdom', 'Empire', 'Guild', 'Religious organization', 'Secret society', 'Military organization', 'Corporation', 'Revolutionary movement'), long('Ideology'), many('Leadership'), many('Members'), long('Resources'), many('Territory'), ['Influence'], long('Internal divisions'), long('Public reputation'), long('Secret objectives')),
      custom('Political Systems', 'Political System', '#3d5fa8',
        pick('Form', 'Monarchy', 'Republic', 'Empire', 'Oligarchy', 'Theocracy', 'Federation', 'Tribal confederation', 'Corporate government', 'Military government'), many('Governs'), long('Leadership structure'), long('Selection or succession'), long('Legislative authority'), long('Judicial authority'), long('Military authority'), long('Local government'), long('Political customs'), long('Limits on power')),
      custom('Offices', 'Office', '#8a6d1f', one('Belongs to'), long('Responsibilities'), long('Authority'), ['Selection method'], ['Term or tenure'], long('Restrictions'), one('Current holder'), many('Previous holders'), long('Succession rules')),
      custom('Conspiracies', 'Conspiracy', '#8c2b5a', many('Participants'), long('Objectives'), long('Resources'), long('Required conditions'), pick('Status', 'Planned', 'In motion', 'Exposed', 'Succeeded', 'Failed'), long('What is known'), long('What is unknown'), ['Discovery risk'], ['Plot thread']),
      custom('Laws & Policies', 'Law', '#5c6370', pick('Kind', 'Law', 'Regulation', 'Decree', 'Custom', 'Succession rule', 'Citizenship rule', 'Trade policy', 'Military policy'), ['Scope'], one('Issued by'), ['In effect from'], ['In effect until'], long('Restrictions'), long('Exceptions'), long('History')),
    ],
    [
      registry('factions', 'Factions', FACTIONS, { groupBy: 'Faction type', summary: ['Leader', 'Influence'], hint: 'The project’s factions: the same records the Codex and a character’s affiliations use.' }),
      registry('systems', 'Political systems', 'Political Systems', { groupBy: 'Form', summary: ['Governs'], hint: '“Form” is a label you can change or leave empty; no government has to fit a real-world kind.' }),
      registry('offices', 'Leaders & offices', 'Offices', { summary: ['Current holder', 'Belongs to'], hint: 'Naming a holder here changes nothing on the character’s own profile.' }),
      { id: 'relations', type: 'matrix', title: 'Alliances & rivalries', rows: FACTIONS, columns: FACTIONS, values: ['Alliance', 'Trade agreement', 'Military pact', 'Vassalage', 'Dependence', 'Neutrality', 'Rivalry', 'Cold war', 'Hostility'], hint: 'How each faction stands with each other now. How that changed belongs in the log beside it.' },
      { id: 'shifts', type: 'log', title: 'Shifting relations', about: FACTIONS, states: ['Alliance', 'Trade agreement', 'Military pact', 'Vassalage', 'Dependence', 'Neutrality', 'Rivalry', 'Cold war', 'Hostility', 'Ended'], second: 'Ends in', hint: 'Each change between factions, with its terms and disputes in the notes and the chapters it runs from and to.' },
      page('network', 'Influence network', 'graph', 'Characters, factions, offices and territories as one network, drawn by the Story graph from the links on their records. Filter it there by kind.'),
      registry('conspiracies', 'Conspiracies', 'Conspiracies', { groupBy: 'Status', summary: ['Participants'], hint: 'A plot’s secret proper, and who knows it, belongs on its characters’ Secrets tabs.' }),
      registry('laws', 'Laws & policies', 'Laws & Policies', { groupBy: 'Kind', summary: ['Scope', 'Issued by'], hint: 'When a law changes, write the earlier one into its History rather than over it.' }),
      { id: 'events', type: 'log', title: 'Political events', states: ['Election', 'Coronation', 'Coup', 'Rebellion', 'Treaty', 'Assassination', 'Civil war', 'Succession crisis', 'Diplomatic meeting', 'Scandal'], hint: 'What happens, in which chapter, and to whom.' },
      { id: 'transitions', type: 'log', title: 'Power transitions', about: 'Offices', states: ['Appointed', 'Elected', 'Inherited', 'Seized', 'Resigned', 'Removed', 'Died in office'], hint: 'Each change of hands of an office.' },
    ],
  ),
];
