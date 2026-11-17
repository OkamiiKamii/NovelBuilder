// VISUALIZATION MODULES. Each view is a module a novel can turn off and on. Turning one off hides it: its place in the
// view picker, its page, and the links other pages make to it. It deletes nothing and changes no record: the records a
// view shows belong to the core pages, which never depend on a view being on. What is turned off is a setting of the
// novel (`viewsOff` on the project), so it travels with the novel. Between views there is one dependency: Journeys
// draws its routes on the maps made in Places, so Places stays on while Journeys is on. A port of
// flutter_app/lib/shared/domain/visualize/modules.dart (its page names say World where the Flutter app says Codex).

import { type VisualView, visualViews } from './views';

export type ViewNeed = { key: string; why: string };

export class ViewModule {
  constructor(
    readonly key: string,
    /** The core pages whose records it shows. */
    readonly reads: readonly string[],
    readonly options: {
      /** Records added or changed only in this view. They are kept, and still checked, while it is off. */
      editsHere?: string;
      /** Other views it needs on, and why. */
      needs?: readonly ViewNeed[];
      /** Pages that link to it. While it is off, those links are not offered. */
      linkedFrom?: readonly string[];
    } = {},
  ) {}

  get editsHere(): string | null {
    return this.options.editsHere ?? null;
  }
  get needs(): readonly ViewNeed[] {
    return this.options.needs ?? [];
  }
  get linkedFrom(): readonly string[] {
    return this.options.linkedFrom ?? [];
  }
}

export const viewModules: readonly ViewModule[] = [
  new ViewModule('timeline', ['Timeline', 'Characters', 'World', 'Plot threads', 'Manuscript'], { linkedFrom: ['Continuity review'] }),
  new ViewModule('order', ['Timeline', 'Manuscript'], { linkedFrom: ['Timeline (an event’s chapters)'] }),
  new ViewModule('relationships', ['Relationships', 'Characters', 'World'], { linkedFrom: ['Continuity review'] }),
  new ViewModule('plot', ['Plot threads', 'Manuscript', 'Timeline'], { linkedFrom: ['Plot threads', 'Scene board', 'Continuity review'] }),
  new ViewModule('structure', ['Manuscript', 'Organizer', 'Timeline'], { editsHere: 'structural markers', linkedFrom: ['Record check'] }),
  new ViewModule('graph', ['Manuscript', 'Characters', 'World', 'Timeline', 'Plot threads', 'Relationships', 'Characters › Systems'], {
    linkedFrom: ['Continuity review'],
  }),
  new ViewModule('places', ['World', 'Timeline', 'Characters'], { editsHere: 'place levels, world maps and the places pinned on them' }),
  new ViewModule('progression', ['Character progression', 'Characters › Systems', 'Characters']),
  new ViewModule('history', ['Characters', 'Timeline', 'Relationships', 'World', 'Manuscript', 'Character progression'], {
    linkedFrom: ['Characters (a profile’s life history)', 'Timeline (a character’s life)'],
  }),
  new ViewModule('appearances', ['Manuscript', 'Characters', 'Timeline']),
  new ViewModule('knowledge', ['Characters (their Secrets tab)', 'Timeline', 'Manuscript'], {
    linkedFrom: ['Characters (a secret)', 'Continuity review'],
  }),
  new ViewModule('kinds', ['World', 'Timeline']),
  new ViewModule('abilities', ['Characters › Systems', 'World', 'Character progression'], { linkedFrom: ['Continuity review'] }),
  new ViewModule('journeys', ['World', 'Characters', 'Timeline'], {
    editsHere: 'journeys and the speeds of ways to travel',
    needs: [{ key: 'places', why: 'its routes are drawn on the maps made in Places, at the places pinned there' }],
    linkedFrom: ['Record check', 'Continuity review'],
  }),
  new ViewModule('factions', ['World', 'Timeline', 'Characters']),
  new ViewModule('ownership', ['World', 'Timeline', 'Characters']),
  new ViewModule('charts', ['Manuscript', 'Characters', 'Plot threads', 'Timeline']),
];

export const moduleOf = (key: string): ViewModule | null => viewModules.find((m) => m.key === key) ?? null;

/** Whether a view is on in a novel: every view is, unless the novel turned it off. */
export const isViewOn = (viewsOff: readonly string[], key: string): boolean => !viewsOff.includes(key);

/** The views that are on, in the order the workspace offers them. */
export const viewsOn = (viewsOff: readonly string[]): VisualView[] => visualViews.filter((v) => isViewOn(viewsOff, v.key));

/** The views that need this one. */
export const neededBy = (key: string): ViewModule[] => viewModules.filter((m) => m.needs.some((n) => n.key === key));

export type Blocked = { key: string; by: ViewNeed[] };

/** Dart's default String compareTo: by UTF-16 code units. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Turns views off. A view another view needs cannot go off while that view stays on: nothing changes, and it says
 * which and why. Turned off together (the dependent with it), they both go. */
export function turnOff(viewsOff: readonly string[], keys: readonly string[]): { off: string[]; blocked: Blocked[] } {
  const next = new Set([...viewsOff, ...keys]);
  const blocked = keys
    .map((key) => ({
      key,
      by: neededBy(key)
        .filter((m) => !next.has(m.key))
        .map((m) => ({ key: m.key, why: m.needs.find((n) => n.key === key)!.why })),
    }))
    .filter((b) => b.by.length > 0);
  return blocked.length > 0 ? { off: [...viewsOff], blocked } : { off: [...next].sort(byCodeUnits), blocked };
}

/** Turns a view on, and the views it needs, so it never opens without them. */
export function turnOn(viewsOff: readonly string[], key: string): { off: string[]; alsoOn: string[] } {
  // Dart visits depth first and keeps a set in that order; the needs are a short list, walked a bounded number of times.
  const on: string[] = [];
  const visit = (k: string, depth: number) => {
    if (on.includes(k) || depth > 50) return;
    on.push(k);
    for (const need of moduleOf(k)?.needs ?? []) visit(need.key, depth + 1);
  };
  visit(key, 0);
  return {
    off: viewsOff.filter((k) => !on.includes(k)),
    alsoOn: on.filter((k) => k !== key && viewsOff.includes(k)),
  };
}
