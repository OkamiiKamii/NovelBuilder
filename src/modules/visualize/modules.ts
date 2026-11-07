import { VIEWS, type VisualView } from './views';

/**
 * VISUALIZATION MODULES
 * Each view of the Visualize page is a module a novel can turn off and on
 * (Optional Prompt D). Turning one off hides it: its place in the view
 * picker, its page, and the links other pages make to it. It deletes
 * nothing, and changes no record: the records a view shows belong to the
 * core pages (the Timeline, the Codex, Relationships…), which never depend on
 * a view being on, and every check that reads them goes on reading them.
 * What is turned off is a setting of the novel (`Project.viewsOff`), so it
 * travels with the novel: backups, copies, timelines, sync.
 *
 * Every view needs the shared story model and the Visualize frame (filters,
 * saved views, export, the details panel, canon and continuity markers).
 * Those are part of every view and are never turned off on their own.
 * Between views there is one dependency: Journeys draws its routes on the
 * maps made in Places, so Places stays on while Journeys is on.
 */
export interface ViewModule {
  key: string;
  /** The core pages whose records it shows, by their names in the sidebar. */
  reads: string[];
  /** Records that are added or changed only in this view. They are kept, and still checked, while it is off. */
  editsHere?: string;
  /** Other views it needs on, and why. */
  needs?: { key: string; why: string }[];
  /** Pages that link to it. While it is off, those links are not offered. */
  linkedFrom?: string[];
}

export const VIEW_MODULES: ViewModule[] = [
  { key: 'timeline', reads: ['Timeline', 'Characters', 'Codex', 'Plot threads', 'Manuscript'], linkedFrom: ['Continuity review'] },
  { key: 'order', reads: ['Timeline', 'Manuscript'], linkedFrom: ['Timeline (an event’s chapters)'] },
  { key: 'relationships', reads: ['Relationships', 'Characters', 'Codex'], linkedFrom: ['Continuity review'] },
  { key: 'plot', reads: ['Plot threads', 'Manuscript', 'Timeline'], linkedFrom: ['Plot threads', 'Scene board', 'Continuity review'] },
  { key: 'structure', reads: ['Manuscript', 'Organizer', 'Timeline'], editsHere: 'structural markers', linkedFrom: ['Record check'] },
  { key: 'graph', reads: ['Manuscript', 'Characters', 'Codex', 'Timeline', 'Plot threads', 'Relationships', 'Characters › Systems'], linkedFrom: ['Continuity review'] },
  { key: 'places', reads: ['Codex', 'Timeline', 'Characters'], editsHere: 'place levels, world maps and the places pinned on them' },
  { key: 'progression', reads: ['Character progression', 'Characters › Systems', 'Characters'] },
  { key: 'history', reads: ['Characters', 'Timeline', 'Relationships', 'Codex', 'Manuscript', 'Character progression'], linkedFrom: ['Characters (a profile’s life history)', 'Timeline (a character’s life)'] },
  { key: 'appearances', reads: ['Manuscript', 'Characters', 'Timeline'] },
  { key: 'knowledge', reads: ['Characters (their Secrets tab)', 'Timeline', 'Manuscript'], linkedFrom: ['Characters (a secret)', 'Continuity review'] },
  { key: 'kinds', reads: ['Codex', 'Timeline'] },
  { key: 'abilities', reads: ['Characters › Systems', 'Codex', 'Character progression'], linkedFrom: ['Continuity review'] },
  { key: 'journeys', reads: ['Codex', 'Characters', 'Timeline'], editsHere: 'journeys and the speeds of ways to travel', needs: [{ key: 'places', why: 'its routes are drawn on the maps made in Places, at the places pinned there' }], linkedFrom: ['Record check', 'Continuity review'] },
  { key: 'factions', reads: ['Codex', 'Timeline', 'Characters'] },
  { key: 'ownership', reads: ['Codex', 'Timeline', 'Characters'] },
  { key: 'charts', reads: ['Manuscript', 'Characters', 'Plot threads', 'Timeline'] },
];

export const moduleOf = (key: string): ViewModule | undefined => VIEW_MODULES.find((m) => m.key === key);
export const viewLabel = (key: string): string => VIEWS.find((v) => v.key === key)?.label ?? key;

/** Whether a view is on in a novel: every view is, unless the novel turned it off. */
export const isViewOn = (viewsOff: readonly string[] | undefined, key: string): boolean => !viewsOff?.includes(key);

/** The views that are on, in the order the Visualize page offers them. */
export const viewsOn = (viewsOff: readonly string[] | undefined): VisualView[] => VIEWS.filter((v) => isViewOn(viewsOff, v.key));

/** The views that need this one. */
export const neededBy = (key: string): ViewModule[] => VIEW_MODULES.filter((m) => m.needs?.some((n) => n.key === key));

export interface TurnOff {
  /** The views off afterwards: as before when anything is blocked. */
  off: string[];
  /** Views that cannot go off yet, each with the views that are staying on and need it. */
  blocked: { key: string; by: { key: string; why: string }[] }[];
}

/**
 * Turns views off. A view another view needs cannot go off while that view
 * stays on: nothing changes, and it says which and why. Turned off together
 * (the dependent with it), they both go.
 */
export function turnOff(viewsOff: readonly string[], keys: string[]): TurnOff {
  const next = new Set([...viewsOff, ...keys]);
  const blocked = keys
    .map((key) => ({ key, by: neededBy(key).filter((m) => !next.has(m.key)).map((m) => ({ key: m.key, why: m.needs!.find((n) => n.key === key)!.why })) }))
    .filter((b) => b.by.length > 0);
  return blocked.length ? { off: [...viewsOff], blocked } : { off: [...next].sort(), blocked: [] };
}

/** Turns a view on, and the views it needs, so it never opens without them. */
export function turnOn(viewsOff: readonly string[], key: string): { off: string[]; alsoOn: string[] } {
  const on = new Set<string>();
  const visit = (k: string) => {
    if (on.has(k)) return;
    on.add(k);
    for (const need of moduleOf(k)?.needs ?? []) visit(need.key);
  };
  visit(key);
  return { off: viewsOff.filter((k) => !on.has(k)), alsoOn: [...on].filter((k) => k !== key && viewsOff.includes(k)) };
}

/** The view a page address opens, or null when it is not a view's. */
export function viewOfPath(to: string): string | null {
  const match = /\/visualize\/([\w-]+)/.exec(to);
  return match ? match[1] : null;
}
