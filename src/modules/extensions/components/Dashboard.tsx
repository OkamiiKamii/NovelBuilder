import { Link } from 'react-router-dom';
import { entryPath } from '@/modules/characters/hooks';
import type { Category, LoreEntry } from '@/modules/codex/types';
import type { ToolData } from '../hooks';
import type { ModuleDefinition, ToolDef } from '../types';

const categoryOf = (tool: ToolDef): string | null => (tool.type === 'registry' || tool.type === 'board' || tool.type === 'table' || tool.type === 'meters' ? tool.category : null);

/**
 * A module's front page: how much there is of each kind of record, what was
 * touched last, and which records are still empty. Every number is counted
 * from the project as it is; each one opens the list it counts.
 */
export function Dashboard({ module, tools, data, onOpen }: { module: ModuleDefinition; tools: ToolDef[]; data: ToolData; onOpen: (toolId: string, recordId?: string) => void }) {
  // One tile per category the module works on: the first tool that lists it is where the tile leads.
  const lists: { tool: ToolDef; category: Category; entries: LoreEntry[] }[] = [];
  for (const tool of tools) {
    const category = data.category(categoryOf(tool) ?? '');
    if (category && !lists.some((l) => l.category.key === category.key)) lists.push({ tool, category, entries: data.entriesOf(category) });
  }
  const logs = tools.filter((tool) => tool.type === 'log' || tool.type === 'matrix').map((tool) => ({ tool, count: data.records.filter((r) => r.moduleId === module.id && r.toolId === tool.id).length }));
  // "Its own" records: those in categories the module brings, not the built-in ones it only adds fields to.
  const own = new Set(module.schema.categories.filter((c) => !c.builtin).flatMap((c) => data.category(c.name)?.key ?? []));
  const mine = lists.filter((l) => own.has(l.category.key));
  const recent = mine.flatMap((l) => l.entries.map((entry) => ({ entry, list: l }))).sort((a, b) => b.entry.updatedAt - a.entry.updatedAt).slice(0, 6);
  const empty = mine.flatMap((l) => l.entries.filter((entry) => !entry.summary.trim() && !entry.description.trim() && !entry.fields.some((f) => f.value.trim())).map((entry) => ({ entry, list: l })));
  const where = (entry: LoreEntry, tool: ToolDef) => (tool.type === 'registry' ? null : entryPath(data.projectId, entry));
  const row = ({ entry, list }: { entry: LoreEntry; list: (typeof lists)[number] }) => (
    <li key={entry.id}>
      {where(entry, list.tool) ? (
        <Link to={where(entry, list.tool)!}>{entry.name}</Link>
      ) : (
        <button type="button" className="link" onClick={() => onOpen(list.tool.id, entry.id)}>
          {entry.name}
        </button>
      )}
      <span className="muted small">{list.category.singular}</span>
    </li>
  );
  return (
    <div className="stack module-dashboard">
      <ul className="tiles" aria-label="What this module holds">
        {lists.map(({ tool, category, entries }) => (
          <li key={category.key} className="tile">
            <button type="button" aria-label={`${entries.length} ${category.name}: open ${tool.title}`} onClick={() => onOpen(tool.id)}>
              <strong>{entries.length}</strong>
              <span>{category.name}</span>
            </button>
          </li>
        ))}
        {logs.filter((l) => l.count > 0).map(({ tool, count }) => (
          <li key={tool.id} className="tile">
            <button type="button" aria-label={`${count} in ${tool.title}: open it`} onClick={() => onOpen(tool.id)}>
              <strong>{count}</strong>
              <span>{tool.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {lists.every((l) => l.entries.length === 0) && logs.every((l) => l.count === 0) && (
        <p className="muted">Nothing here yet. Turning the module on creates no records: your world is yours to make. Open any of its tools above to add the first one.</p>
      )}
      <div className="grid-2">
        {recent.length > 0 && (
          <section className="panel stack" aria-label="Recently changed">
            <h2>Recently changed</h2>
            <ul className="vault-rows">{recent.map(row)}</ul>
          </section>
        )}
        {empty.length > 0 && (
          <section className="panel stack" aria-label="Still empty">
            <h2>
              Still empty <span className="muted">{empty.length}</span>
            </h2>
            <p className="muted small">Records with a name and nothing else written.</p>
            <ul className="vault-rows">{empty.slice(0, 8).map(row)}</ul>
          </section>
        )}
      </div>
      {module.integrates && module.integrates.length > 0 && <p className="muted small">Its records are the project’s own, shared with: {module.integrates.join(', ')}.</p>}
    </div>
  );
}
