import { useState } from 'react';
import { codex, extensions } from '@/core';
import { SchemaDialog } from '@/modules/codex/components/SchemaDialog';
import { useCategories } from '@/modules/codex/categories';
import type { LoreEntry } from '@/modules/codex/types';
import { Modal } from '@/shared/Modal';
import { resolveCategory } from '../service';
import type { ModuleSettings, ProjectModule } from '../types';

/**
 * How a module is arranged in this project: what its sidebar entry is
 * called, which tools show and in what order, what each is called, and the
 * stages a log steps through. Its categories and their fields (custom
 * fields, names, choices, order) are shaped where every category is.
 */
export function Configure({ row, entries, onClose, onError }: { row: ProjectModule; entries: LoreEntry[]; onClose: () => void; onError: (err: unknown) => void }) {
  const api = extensions.forProject(row.projectId);
  const categories = useCategories();
  const [shaping, setShaping] = useState<string | null>(null);
  const module = row.definition;
  const settings = row.settings ?? {};
  const save = (change: (current: ModuleSettings) => ModuleSettings) => void api.configure(module.id, change).catch(onError);
  const order = settings.order ?? [];
  const at = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + module.tools.findIndex((t) => t.id === id));
  const tools = [...module.tools].sort((a, b) => at(a.id) - at(b.id));
  const move = (id: string, by: -1 | 1) => {
    const ids = tools.map((t) => t.id);
    const from = ids.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    save((s) => ({ ...s, order: ids }));
  };
  const own = module.schema.categories.flatMap((c) => resolveCategory(c.builtin ? c.key : c.name, categories.list, row.bindings) ?? categories.list.find((x) => c.builtin && x.key === c.key) ?? []);

  return (
    <Modal title={`Configure ${module.name}`} onClose={onClose}>
      <div className="stack module-configure">
        <label className="field">
          <span>Name in the sidebar</span>
          <input defaultValue={settings.nav ?? module.nav ?? module.name} aria-label="Name in the sidebar" onBlur={(e) => save((s) => ({ ...s, nav: e.target.value.trim() === (module.nav ?? module.name) ? '' : e.target.value }))} />
        </label>
        <fieldset className="plan-group" aria-label="Tools">
          <legend>Tools: show, name and order</legend>
          <ol className="configure-tools">
            {tools.map((tool, i) => (
              <li key={tool.id}>
                <input type="checkbox" checked={!settings.hidden?.includes(tool.id)} aria-label={`Show ${tool.title}`} onChange={(e) => {
                    // Read now: by the time the stored settings are in hand, the box has been redrawn.
                    const shown = e.target.checked;
                    save((s) => ({ ...s, hidden: shown ? (s.hidden ?? []).filter((id) => id !== tool.id) : [...(s.hidden ?? []), tool.id] }));
                  }}
                />
                <input defaultValue={settings.titles?.[tool.id] ?? tool.title} aria-label={`Name of ${tool.title}`} onBlur={(e) => save((s) => ({ ...s, titles: { ...(s.titles ?? {}), [tool.id]: e.target.value.trim() === tool.title ? '' : e.target.value } }))} />
                <button type="button" className="tool" aria-label={`Move ${tool.title} up`} disabled={i === 0} onClick={() => move(tool.id, -1)}>
                  ↑
                </button>
                <button type="button" className="tool" aria-label={`Move ${tool.title} down`} disabled={i === tools.length - 1} onClick={() => move(tool.id, 1)}>
                  ↓
                </button>
                {tool.type === 'log' && tool.states && (
                  <input
                    className="configure-states"
                    defaultValue={(settings.states?.[tool.id] ?? tool.states).join(', ')}
                    aria-label={`Stages of ${tool.title}`}
                    placeholder="Stages, separated by commas"
                    onBlur={(e) => {
                      const list = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
                      save((s) => ({ ...s, states: { ...(s.states ?? {}), [tool.id]: list.join('|') === tool.states!.join('|') ? [] : list } }));
                    }}
                  />
                )}
              </li>
            ))}
          </ol>
          <p className="muted small">A hidden tool keeps everything recorded with it. Stages you remove stay on the lines that already use them.</p>
        </fieldset>
        <fieldset className="plan-group" aria-label="Categories and fields">
          <legend>Categories &amp; fields</legend>
          <p className="muted small">Add your own fields, rename or reorder them, and change any list of choices or statuses. Tools keep working when you rename a category or a field.</p>
          <div className="actions start wrap">
            {own.map((category) => (
              <button key={category.key} type="button" className="btn" onClick={() => setShaping(category.key)}>
                {category.name}…
              </button>
            ))}
          </div>
        </fieldset>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      {shaping && <SchemaDialog codex={codex.forProject(row.projectId)} entries={entries} initial={shaping} {...(shaping === 'character' ? { only: 'character' } : { hide: 'character' })} onClose={() => setShaping(null)} />}
    </Modal>
  );
}
