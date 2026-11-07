import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { canon, codex, manuscript, plot, timeline } from '@/core';

/** Where the author has been in each project, oldest first. Kept for the session. */
const visited = new Map<string, string[]>();
const MAX = 12;

const STATIC: Record<string, string> = { '': 'Overview', manuscript: 'Manuscript', organizer: 'Organizer', board: 'Scene board', codex: 'Codex', relationships: 'Relationships', timeline: 'Timeline', plot: 'Plot threads', canon: 'Canon', continuity: 'Continuity', integrity: 'Record check', review: 'Continuity review', systems: 'Systems', progression: 'Character progression', branches: 'Branches', consequences: 'Consequences', studio: 'Workspace', modules: 'Modules', assistant: 'Assistant', dashboard: 'Dashboard', sync: 'Cloud sync', team: 'Team', read: 'Reader preview', characters: 'Characters', graph: 'Story graph', progress: 'Progress', export: 'Import & Export', settings: 'Settings' };

/** Records each place visited in a project. Call it once from the workspace layout. */
export function useTrailRecorder(projectId: string): void {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const place = pathname + search;
    const trail = visited.get(projectId) ?? [];
    if (trail[trail.length - 1] === place) return;
    // Revisiting a place moves it to the end rather than listing it twice.
    visited.set(projectId, [...trail.filter((p) => p !== place), place].slice(-MAX));
  }, [projectId, pathname, search]);
}

/**
 * A breadcrumb trail back to where the author came from: "← Back to Chapter 3"
 * after following a link out of the manuscript, with earlier stops beside it.
 */
export function Trail({ projectId }: { projectId: string }) {
  const { pathname, search } = useLocation();
  const [, refresh] = useState(0);
  useEffect(() => refresh((n) => n + 1), [pathname, search]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const events = useLiveQuery(() => timeline.forProject(projectId).list(), [projectId]);
  const threads = useLiveQuery(() => plot.forProject(projectId).list(), [projectId]);
  const facts = useLiveQuery(() => canon.forProject(projectId).list(), [projectId]);
  if (!nodes || !entries || !events || !threads || !facts) return null;

  const base = `/project/${projectId}`;
  const label = (place: string): string | null => {
    const [path, query = ''] = place.split('?');
    const [section = '', id] = path.slice(base.length).split('/').filter(Boolean);
    const params = new URLSearchParams(query);
    if (section === 'manuscript' && id) return nodes.find((n) => n.id === id)?.title ?? null;
    if (section === 'codex' && id) return entries.find((e) => e.id === id)?.name ?? null;
    if (section === 'characters' && id) return entries.find((e) => e.id === id)?.name ?? null;
    if (section === 'timeline' && params.get('event')) return events.find((e) => e.id === params.get('event'))?.name ?? 'Timeline';
    if (section === 'plot' && params.get('thread')) return threads.find((t) => t.id === params.get('thread'))?.title ?? 'Plot threads';
    if (section === 'canon' && params.get('fact')) return facts.find((f) => f.id === params.get('fact'))?.subject ?? 'Canon';
    return STATIC[section] ?? null;
  };

  const here = pathname + search;
  // Most recent first; places that no longer exist (a deleted chapter or entry) drop out of the trail.
  const stops = (visited.get(projectId) ?? [])
    .filter((place) => place !== here)
    .map((place) => ({ place, label: label(place) }))
    .filter((stop): stop is { place: string; label: string } => stop.label !== null)
    .reverse()
    .filter((stop, i, all) => all.findIndex((s) => s.label === stop.label) === i)
    .slice(0, 4);
  if (!stops.length) return null;

  return (
    <nav className="trail" aria-label="Recently visited">
      <Link to={stops[0].place} className="trail-back">
        ← Back to {stops[0].label}
      </Link>
      {stops.slice(1).map((stop) => (
        <Link key={stop.place} to={stop.place}>
          {stop.label}
        </Link>
      ))}
    </nav>
  );
}
