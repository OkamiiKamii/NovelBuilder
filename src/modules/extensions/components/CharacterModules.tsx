import { Link } from 'react-router-dom';
import { useCategories } from '@/modules/codex/categories';
import { viewFields } from '@/modules/codex/schema';
import type { LoreEntry } from '@/modules/codex/types';
import { arrangedTools, useInstalled, useToolData } from '../hooks';
import { resolveCategory } from '../service';

/**
 * ONE CHARACTER, MANY MODULES
 * What the modules that are on record about a character: the spells they
 * know, the case they are a suspect in, the arc they are half of, the office
 * they hold. Every line is a module's record pointing at this one
 * character; nothing here is a copy of them, and nothing is shown for a
 * module that is off.
 */
export function CharacterModules({ projectId, entry }: { projectId: string; entry: LoreEntry }) {
  const installed = useInstalled(projectId);
  const data = useToolData(projectId);
  const categories = useCategories();
  if (!installed || data.loading) return null;
  const base = `/project/${projectId}/modules`;
  const sections = installed.filter((row) => row.enabled).sort((a, b) => a.createdAt - b.createdAt).flatMap((row) => {
    const module = row.definition;
    const tools = arrangedTools(module, row.settings);
    const lines: { key: string; to: string; text: string; detail: string }[] = [];
    // Records in the module's own categories that name this character in a link field.
    for (const incoming of module.schema.categories.filter((c) => !c.builtin)) {
      const category = resolveCategory(incoming.name, categories.list, row.bindings);
      if (!category) continue;
      const tool = tools.find((t) => t.type === 'registry' && resolveCategory(t.category, categories.list, row.bindings)?.key === category.key);
      for (const record of data.entries.filter((e) => e.category === category.key)) {
        const naming = viewFields(record, category).category.filter(({ def, field }) => field && ((def.type === 'reference' && field.value === entry.id) || (def.type === 'references' && field.value.split('\n').includes(entry.id))));
        if (!naming.length) continue;
        lines.push({ key: record.id, to: tool ? `${base}/${module.id}?tool=${tool.id}&record=${record.id}` : `/project/${projectId}/codex/${record.id}`, text: record.name, detail: `${category.singular} · ${naming.map((n) => n.def.name).join(', ')}` });
      }
    }
    // Lines in its logs about them, and cells of its tables in their row or column.
    for (const record of data.records.filter((r) => r.moduleId === module.id)) {
      const tool = tools.find((t) => t.id === record.toolId);
      if (!tool) continue;
      if (record.kind === 'log' && record.entryIds.includes(entry.id)) {
        const node = data.nodes.find((n) => n.id === record.nodeId);
        lines.push({ key: record.id, to: `${base}/${module.id}?tool=${tool.id}`, text: record.title, detail: [tool.title, record.state, node?.title].filter(Boolean).join(' · ') });
      } else if (record.kind === 'cell' && (record.rowId === entry.id || record.colId === entry.id)) {
        const other = data.entries.find((e) => e.id === (record.rowId === entry.id ? record.colId : record.rowId));
        if (other) lines.push({ key: record.id, to: `${base}/${module.id}?tool=${tool.id}`, text: other.name, detail: `${tool.title} · ${record.state}` });
      }
    }
    return lines.length ? [{ row, module, lines }] : [];
  });
  if (!sections.length) return null;
  return (
    <section className="vault-section wide" aria-label="In the modules">
      <header className="vault-section-head">
        <h3>In the modules</h3>
      </header>
      {sections.map(({ row, module, lines }) => (
        <div key={module.id} className="module-on-profile" role="group" aria-label={module.name}>
          <Link to={`${base}/${module.id}`} className="vault-label">
            {row.settings?.nav || module.nav || module.name}
          </Link>
          <ul className="vault-rows">
            {lines.map((line) => (
              <li key={line.key}>
                <Link to={line.to}>{line.text}</Link>
                <span className="muted small">{line.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted small">Each line is a module’s record that points at {entry.name}. They are kept in the modules, not on this profile.</p>
    </section>
  );
}
