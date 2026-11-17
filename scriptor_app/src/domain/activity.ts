// RECENT ACTIVITY (new in Scriptor, from the owner's mock-ups): what changed lately across the library, read from when
// each record was last written. Nothing extra is logged: it is worked out from the records themselves.

import { type JsonMap, str } from './json';

export type ActivityRow = { projectId: string; collection: string; json: JsonMap; updatedAt: number };

export type Activity = {
  projectId: string;
  /** "Wrote in Chapter 3", "Updated character: Wren Hollis"… */
  what: string;
  at: number;
};

/** One line per record, for the collections a writer would recognise; the rest (settings, logs) are left out. */
export function describeActivity(row: ActivityRow): string | null {
  const name = str(row.json['name']) || str(row.json['title']);
  switch (row.collection) {
    case 'chapterContents':
      return 'Wrote in a chapter';
    case 'chapters': {
      const kind = str(row.json['kind'], 'chapter');
      const label = kind === 'scene' ? 'scene' : kind === 'chapter' ? 'chapter' : kind;
      return name ? `Updated ${label}: ${name}` : `Updated a ${label}`;
    }
    case 'loreEntries': {
      const isCharacter = row.json['category'] === 'character';
      return `${isCharacter ? 'Updated character' : 'Updated world entry'}${name ? `: ${name}` : ''}`;
    }
    case 'chapterPlans':
      return 'Planned a chapter';
    case 'timelineEvents':
      return `Updated event${name ? `: ${name}` : ''}`;
    case 'plotThreads':
      return `Updated plot thread${name ? `: ${name}` : ''}`;
    case 'characterRelations':
      return 'Changed a relationship';
    case 'systems':
      return `Updated system${name ? `: ${name}` : ''}`;
    case 'canonFacts':
      return 'Updated a canon fact';
    default:
      return null;
  }
}

/** The latest changes, newest first, one per thing (several saves of the same record count once). */
export function recentActivity(rows: readonly ActivityRow[], limit = 8): Activity[] {
  const out: Activity[] = [];
  const seen = new Set<string>();
  for (const row of [...rows].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const what = describeActivity(row);
    if (!what) continue;
    const key = `${row.projectId}\u0000${what}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ projectId: row.projectId, what, at: row.updatedAt });
    if (out.length >= limit) break;
  }
  return out;
}
