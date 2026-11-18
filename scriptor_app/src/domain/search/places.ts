// WHERE THINGS ARE IN SCRIPTOR. The Flutter app has eight areas with a page at each path (/plan, /review,
// /progress/analytics…); Scriptor has five, with Plan, Visualize and Review as tabs of Organize and Progress,
// Analytics and the Keepsakes as tabs of Analytics (DESIGN.md). Search's "Go to", the tutorial's "Take me there" and
// the lesson for the page in view all speak the Flutter app's paths (they are ported word for word); these turn them
// into Scriptor's places, and Scriptor's place back into the Flutter path a lesson names.

export type OrganizeTab = 'characters' | 'world' | 'systems' | 'modules' | 'plan' | 'visualize' | 'review';
export type PlanPart = 'timeline' | 'threads' | 'board' | 'histories' | 'calendar';
export type ReviewPart = 'warnings' | 'records' | 'timeline' | 'canon' | 'continuity' | 'proof' | 'consequences' | 'team';
export type AnalyticsTab = 'progress' | 'analytics' | 'keepsakes';

/** A place to go: a page (route), a tab of Organize (and a part of Plan or Review), a tab of Analytics, a chapter in
 * Write (at a passage, when `find` is given), or the tutorial. */
export type Place =
  | { kind: 'route'; path: string }
  | { kind: 'organize'; tab: OrganizeTab; part?: PlanPart | ReviewPart }
  | { kind: 'analytics'; tab: AnalyticsTab }
  | { kind: 'chapter'; nodeId: string; find?: { term: string; block: number } }
  | { kind: 'tutorial' };

const planParts: Readonly<Record<string, PlanPart>> = {
  '/plan': 'timeline',
  '/plan/threads': 'threads',
  '/plan/board': 'board',
  '/plan/histories': 'histories',
  '/plan/calendar': 'calendar',
};
const reviewParts: Readonly<Record<string, ReviewPart>> = {
  '/review': 'warnings',
  '/review/records': 'records',
  '/review/timeline': 'timeline',
  '/review/canon': 'canon',
  '/review/continuity': 'continuity',
  '/review/proof': 'proof',
  '/review/consequences': 'consequences',
  '/review/team': 'team',
};

/** The Visualize views Scriptor has as pages (the Flutter app's /visualize/<view>). */
const visualizeViews = new Set([
  'timeline', 'order', 'plot', 'structure', 'appearances', 'graph', 'kinds', 'abilities', 'progression', 'places',
  'knowledge', 'journeys', 'factions', 'ownership', 'charts', 'history',
]);

/** Where the Flutter app's `path` is in Scriptor, or null when Scriptor has no such page. */
export function scriptorPlace(path: string): Place | null {
  const p = path.split('?')[0];
  switch (p) {
    case '/':
    case '/write':
    case '/write/read':
    case '/write/book':
    case '/settings':
    case '/organize/relationships/settings':
      return { kind: 'route', path: p };
    case '/settings/import-export':
      return { kind: 'route', path: '/settings' };
    case '/organize':
      return { kind: 'organize', tab: 'characters' };
    case '/organize/world':
      return { kind: 'organize', tab: 'world' };
    case '/organize/world/kinds':
      return { kind: 'route', path: '/organize/kinds' };
    case '/organize/systems':
      return { kind: 'organize', tab: 'systems' };
    case '/organize/modules':
      return { kind: 'organize', tab: 'modules' };
    case '/visualize':
      return { kind: 'route', path: '/organize/ties' };
    case '/progress':
      return { kind: 'analytics', tab: 'progress' };
    case '/progress/analytics':
      return { kind: 'analytics', tab: 'analytics' };
    case '/keepsakes':
      return { kind: 'analytics', tab: 'keepsakes' };
  }
  if (planParts[p] !== undefined) return { kind: 'organize', tab: 'plan', part: planParts[p] };
  if (reviewParts[p] !== undefined) return { kind: 'organize', tab: 'review', part: reviewParts[p] };
  const view = /^\/visualize\/([a-z]+)$/.exec(p);
  if (view !== null && visualizeViews.has(view[1])) return { kind: 'route', path: p };
  if (/^\/(plan\/(event|thread|chapter)|organize\/(character|relationship|world\/entry|modules)|keepsakes)\/[^/]+$/.test(p)) {
    return { kind: 'route', path: p };
  }
  return null;
}

/** Where someone is, as the Flutter app's path for it: Scriptor's `pathname`, and the tab or part showing there. */
export function flutterPathOf(
  pathname: string,
  showing: { organize: OrganizeTab; plan: PlanPart; review: ReviewPart; analytics: AnalyticsTab },
): string {
  if (pathname === '/organize') {
    switch (showing.organize) {
      case 'characters':
        return '/organize';
      case 'world':
        return '/organize/world';
      case 'systems':
        return '/organize/systems';
      case 'modules':
        return '/organize/modules';
      case 'visualize':
        // The atlas of views: the Flutter app's view picker, of every view.
        return '/visualize/';
      case 'plan':
        return Object.entries(planParts).find(([, part]) => part === showing.plan)?.[0] ?? '/plan';
      case 'review':
        return Object.entries(reviewParts).find(([, part]) => part === showing.review)?.[0] ?? '/review';
    }
  }
  if (pathname === '/analytics') {
    return showing.analytics === 'analytics' ? '/progress/analytics' : showing.analytics === 'keepsakes' ? '/keepsakes' : '/progress';
  }
  if (pathname === '/organize/ties') return '/visualize';
  if (pathname === '/organize/kinds') return '/organize/world/kinds';
  if (pathname.startsWith('/review/')) return pathname;
  return pathname;
}
