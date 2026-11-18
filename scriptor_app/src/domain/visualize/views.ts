// The views of the Visualize workspace, as the original names them. A port of
// flutter_app/lib/shared/domain/visualize/views.dart. `phase` is the Flutter roadmap phase that built each page there.

export class VisualView {
  constructor(
    /** Kept as the original writes it, so saved views and the novel's `viewsOff` setting read the same. */
    readonly key: string,
    readonly label: string,
    readonly description: string,
    readonly phase: number,
  ) {}

  get path(): string {
    return this.key === 'relationships' ? '/visualize' : `/visualize/${this.key}`;
  }
}

/** Every view, in the order the original's Visualize page offers them. */
export const visualViews: readonly VisualView[] = [
  new VisualView('timeline', 'Timeline', 'Events in the order they happen in the story, apart from the order the reader meets them.', 10),
  new VisualView(
    'order',
    'Story vs reading order',
    'When things happen beside when the reader meets them: flashbacks, flash-forwards, foreshadowing and things revealed afterwards. Nothing here moves a chapter.',
    10,
  ),
  new VisualView('relationships', 'Relationship map', 'Who is tied to whom, and how each tie stands.', 9),
  new VisualView('plot', 'Plot board', 'Each plot thread: where it develops across the chapters, as you record it.', 12),
  new VisualView('structure', 'Structure and pacing', 'How long each chapter and scene is, the acts they sit in, and your structural markers.', 12),
  new VisualView('graph', 'Knowledge graph', 'Every record and every connection between them, read from the records; nothing is stored for the graph.', 13),
  new VisualView('places', 'Places', 'Locations, what lies inside what, and what happened where.', 11),
  new VisualView('progression', 'Character progression', 'How characters’ abilities and states change over the story.', 11),
  new VisualView(
    'history',
    'Character history',
    'One character’s life, gathered from every record: events with their age, where they were, what they belonged to, the chapters they appear in, how their relationships change and how they progress.',
    10,
  ),
  new VisualView('appearances', 'Character appearances', 'Characters against chapters and scenes, from your appearance records.', 12),
  new VisualView('knowledge', 'Secrets and knowledge', 'Who knows each secret, and how that spreads.', 17),
  new VisualView('kinds', 'Records by kind', 'Any kind of record, your own kinds included.', 14),
  new VisualView('abilities', 'Ability paths', 'Abilities, skills and classes, and the paths between them.', 15),
  new VisualView('journeys', 'Journeys', 'Who travels from where to where, and when, as far as you say.', 16),
  new VisualView('factions', 'Factions', 'Who belongs to each faction, its allies and enemies, over the story.', 16),
  new VisualView('ownership', 'Ownership', 'Who has held each item, in order.', 16),
  new VisualView('charts', 'Charts', 'Counts and distributions of what you record.', 18),
];

/** The phase the Flutter build had reached: views of later phases are listed as coming. */
export const builtThroughPhase = 18;

export const isBuilt = (v: VisualView): boolean => v.phase <= builtThroughPhase;

export const viewOf = (key: string): VisualView | null => visualViews.find((v) => v.key === key) ?? null;
export const viewLabel = (key: string): string => viewOf(key)?.label ?? key;

/** Where each view opens in Scriptor: its own page under /visualize (Secrets and knowledge too, since phase 7), but
 * the relationship map (Organize's, at /organize/ties). */
export function scriptorPath(key: string): string | null {
  if (key === 'relationships') return '/organize/ties';
  return `/visualize/${key}`;
}
