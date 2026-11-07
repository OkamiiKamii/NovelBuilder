/**
 * The views the Visualize page offers, in order. Each reads the project's
 * own records through the shared model and links to the page where those
 * records are edited. A view added later gets an entry here and a panel.
 */
export interface VisualView {
  key: string;
  label: string;
  /** What it shows and what it is drawn from, in one line. */
  description: string;
  /** The project page where its records are made and edited. */
  page: string;
  pageLabel: string;
}

export const VIEWS: VisualView[] = [
  { key: 'timeline', label: 'Timeline', description: 'Events in the order they happen in the story, apart from the order the reader meets them.', page: 'timeline', pageLabel: 'Timeline' },
  { key: 'order', label: 'Story vs reading order', description: 'When things happen beside when the reader meets them: flashbacks, flash-forwards, foreshadowing and things revealed afterwards. Nothing here moves a chapter.', page: 'timeline', pageLabel: 'Timeline' },
  { key: 'relationships', label: 'Relationship map', description: 'Who is tied to whom, and how each tie stands.', page: 'relationships', pageLabel: 'Relationships' },
  { key: 'plot', label: 'Plot board', description: 'Each plot thread as a lane across the chapters: where it is introduced, develops, crosses another thread and is resolved, as you record them, and the chapters in between with nothing recorded.', page: 'plot', pageLabel: 'Plot threads' },
  { key: 'structure', label: 'Structure and pacing', description: 'How long each chapter and scene is, the acts they sit in, your structural markers, and words by the labels you give them: a description of what is recorded, not a measure of quality.', page: 'organizer', pageLabel: 'Organizer' },
  { key: 'graph', label: 'Knowledge graph', description: 'Every record (characters, places, factions, items, species, abilities, events, chapters, scenes, plot threads, your own categories) and every connection between them, typed: owns, created by, took place at, appears in, knows about, caused, your own. Read from the records; nothing is stored for the graph.', page: 'graph', pageLabel: 'Story graph' },
  { key: 'places', label: 'Places', description: 'Locations, what lies inside what, and what happened where.', page: 'codex', pageLabel: 'Codex' },
  { key: 'progression', label: 'Character progression', description: 'How characters’ abilities and states change over the story.', page: 'progression', pageLabel: 'Character progression' },
  { key: 'history', label: 'Character history', description: 'One character’s life, gathered from every record: events with their age, where they were, what they belonged to, the chapters they appear in, how their relationships change and how they progress.', page: 'characters', pageLabel: 'Characters' },
  { key: 'appearances', label: 'Character appearances', description: 'Characters against chapters and scenes, from your appearance records and the other records that tie a character to a chapter. A blank cell is nothing recorded, not proof of absence.', page: 'characters', pageLabel: 'Characters' },
  { key: 'knowledge', label: 'Secrets and knowledge', description: 'Who knows each secret, who only suspects or knows part of it, who believes something false instead, and how that spreads across chapters and events: read from what you record on each character’s Secrets tab, never worked out for you.', page: 'characters', pageLabel: 'Characters' },
  { key: 'kinds', label: 'Records by kind', description: 'Any kind of Codex record, your own kinds included, as a table, or drawn the ways you set it up for in the Codex: on the story’s timeline, on a map, by rank, or by who holds each one. Nothing is worked out from field names.', page: 'codex', pageLabel: 'Codex' },
  { key: 'abilities', label: 'Ability paths', description: 'Abilities, skills, classes, techniques and the like, from every system and every kind of record you set to show here, and the paths you record between them: prerequisites, alternatives, upgrades, evolutions, fusions, replacements, exclusions, your own. Each is drawn as what it is; who holds each and when they gained it come from their sheets and progression.', page: 'systems', pageLabel: 'Systems' },
  { key: 'journeys', label: 'Journeys', description: 'Who travels from where to where, and when, as far as you say: each traveller’s route and where they were between journeys, drawn on a map where the places have coordinates and always listed in order, with possible conflicts flagged only when the records settle them.', page: 'codex', pageLabel: 'Codex' },
  { key: 'factions', label: 'Factions', description: 'Who belongs to each faction and who leads it, its allies and enemies, what it controls and influences, as of any point in the story, and how that changed: read from the ties you record and when each holds. Nothing is assumed to last.', page: 'codex', pageLabel: 'Codex' },
  { key: 'ownership', label: 'Ownership', description: 'Who has held each item, in order: made, found, given, sold, stolen, inherited, lost, destroyed, as you record it; where it stands at any point; the stretches nobody is recorded as holding it.', page: 'codex', pageLabel: 'Codex' },
  { key: 'charts', label: 'Charts', description: 'Counts and distributions of what you record: words per chapter and scene, how long chapters are, character appearances, plot-thread presence, events over story time, points of view and your own scene categories. Each says what it uses; nothing judges quality.', page: 'manuscript', pageLabel: 'Manuscript' },
];

export const viewFor = (key: string | undefined): VisualView => VIEWS.find((v) => v.key === key) ?? VIEWS[0];
