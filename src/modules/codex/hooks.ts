import { useLiveQuery } from 'dexie-react-hooks';
import type { ProjectCodex } from './service';
import type { LoreEntry, LoreLink } from './types';

/** Live view of a project's codex. Both are undefined while loading. */
export function useCodex(codex: ProjectCodex): { entries: LoreEntry[] | undefined; links: LoreLink[] | undefined } {
  const entries = useLiveQuery(() => codex.list(), [codex]);
  const links = useLiveQuery(() => codex.links(), [codex]);
  return { entries, links };
}

/** Case-insensitive match against everything an author might search an entry by. */
export function matchesEntry(entry: LoreEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.name, entry.summary, entry.description, ...entry.tags, ...entry.fields.flatMap((f) => [f.key, f.value])].some((text) =>
    text.toLowerCase().includes(needle),
  );
}
