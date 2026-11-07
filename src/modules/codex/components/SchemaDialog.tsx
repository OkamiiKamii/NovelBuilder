import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { templates } from '@/core';
import { createId } from '@/core/id';
import { Modal } from '@/shared/Modal';
import { useCategories } from '../categories';
import { PRESETS } from '../presets';
import { TYPE_PRESETS } from '../typePresets';
import { Check } from './Check';
import { KindUsesEditor } from './KindUsesEditor';
import type { CategoryChanges, ProjectCodex } from '../service';
import { CUSTOM_COLORS, FIELD_TYPE_LABELS, FIELD_TYPES, type Category, type FieldDef, type FieldType, type LoreEntry, type TemplateData } from '../types';

interface SchemaDialogProps {
  codex: ProjectCodex;
  entries: LoreEntry[];
  /** The category to open on. */
  initial: string;
  /** A category this dialog leaves out: the Codex does not shape characters. */
  hide?: string;
  /** Show one category's field set and nothing else: the fields every character shares. */
  only?: string;
  onClose: () => void;
}

/**
 * Where a project's categories and their field sets are shaped. Every change
 * here is to structure only: no entry and no value an author wrote is ever
 * deleted. A removed field is archived and can be brought back.
 */
export function SchemaDialog({ codex, entries, initial, hide, only, onClose }: SchemaDialogProps) {
  const all = useCategories().list;
  const list = all.filter((c) => (only ? c.key === only : c.key !== hide));
  const saved = useLiveQuery(() => templates.list(), []) ?? [];
  const [key, setKey] = useState(initial);
  const [newName, setNewName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const category = list.find((c) => c.key === key) ?? list[0];
  const fail = (err: unknown) => setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
  const save = (changes: CategoryChanges | ((stored: Category) => CategoryChanges)) => void codex.saveCategory(category.key, changes).then(() => setNotice(null), fail);
  const active = category.fields.filter((f) => !f.archived);
  const archived = category.fields.filter((f) => f.archived);
  const count = (c: Category) => entries.filter((e) => e.category === c.key).length;
  const usedBy = (def: FieldDef) => entries.filter((e) => e.category === category.key && e.fields.some((f) => f.defId === def.id && f.value.trim())).length;

  // Every change to the field set is made against the category as stored, not as last drawn,
  // so renaming one field and moving another in quick succession cannot undo each other.
  const editField = (id: string, patch: Partial<FieldDef>) => save((stored) => ({ fields: stored.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const addField = () => save((stored) => ({ fields: [...stored.fields.filter((f) => !f.archived), { id: createId(), name: 'New field', type: 'text', options: [] }, ...stored.fields.filter((f) => f.archived)] }));
  const moveField = (id: string, delta: -1 | 1) =>
    save((stored) => {
      const live = stored.fields.filter((f) => !f.archived);
      const from = live.findIndex((f) => f.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= live.length) return {};
      [live[from], live[to]] = [live[to], live[from]];
      return { fields: [...live, ...stored.fields.filter((f) => f.archived)] };
    });
  const apply = (name: string, data: TemplateData) =>
    void codex.applyTemplate(data).then(() => setNotice({ text: `Added what was missing from “${name}”. Nothing existing was changed.` }), fail);

  return (
    <Modal title={only ? `Fields every ${category.singular.toLowerCase()} shares` : 'Categories & fields'} onClose={onClose}>
      <div className={only ? 'schema single' : 'schema'}>
        <nav className="schema-nav" aria-label="Categories" hidden={Boolean(only)}>
          {list.map((c) => (
            <button key={c.key} type="button" className={c.key === category.key ? 'active' : ''} aria-current={c.key === category.key} onClick={() => setKey(c.key)}>
              <span className="swatch-dot" style={{ background: c.color }} />
              <span>{c.name}</span>
              <span className="muted small">{c.archived ? 'archived' : count(c)}</span>
            </button>
          ))}
          <form
            className="history-save"
            onSubmit={(e) => {
              e.preventDefault();
              void codex.saveCategory(null, { name: newName }).then((created) => {
                setNewName('');
                setKey(created.key);
                setNotice(null);
              }, fail);
            }}
          >
            <input value={newName} placeholder="New category, e.g. Kingdoms" aria-label="New category name" onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn" disabled={!newName.trim()}>
              Add
            </button>
          </form>
          <select
            value=""
            aria-label="Start a kind of record from a preset"
            onChange={(e) => {
              const chosen = TYPE_PRESETS.find((t) => t.id === e.target.value);
              if (!chosen) return;
              void codex.applyTemplate(chosen).then((after) => {
                const made = after.find((c) => c.name.trim().toLowerCase() === chosen.categories[0].name.toLowerCase());
                if (made) setKey(made.key);
                setNotice({ text: `Added “${chosen.name}” with its fields. Rename, retype or remove any of them.` });
              }, fail);
            }}
          >
            <option value="">Or start from a preset…</option>
            {TYPE_PRESETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}: {t.description}
              </option>
            ))}
          </select>
        </nav>

        <div className="stack schema-body" key={category.key}>
          {notice && (
            <p className={notice.error ? 'error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
              {notice.text}
            </p>
          )}
          {only && <p className="muted small">A field added here is offered on every {category.singular.toLowerCase()}’s profile, under Details. Fields for one {category.singular.toLowerCase()} alone are added on their profile.</p>}
          <div className="grid-2 tight" hidden={Boolean(only)}>
            <label className="field">
              <span>Category name</span>
              <input defaultValue={category.name} aria-label="Category name" onBlur={(e) => e.target.value.trim() !== category.name && save({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>One of them is a…</span>
              <input defaultValue={category.singular} aria-label="Singular name" onBlur={(e) => e.target.value.trim() !== category.singular && save({ singular: e.target.value })} />
            </label>
          </div>
          <div className="field swatches" hidden={Boolean(only)}>
            <span>Colour</span>
            {[...new Set([category.color, ...CUSTOM_COLORS])].map((color) => (
              <label key={color} className="swatch" style={{ background: color }} title={color}>
                <input type="radio" name="category-color" checked={category.color === color} onChange={() => save({ color })} />
              </label>
            ))}
          </div>

          {!only && (
            <div className="schema-type-actions">
              <Check label="Show in the knowledge graph" name={`Show ${category.name} in the knowledge graph`} checked={category.graph !== false} onChange={(graph) => save({ graph })} />
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  void templates
                    .save(category.name, `One kind of record: ${category.name}`, { categories: [{ key: category.key, name: category.name, singular: category.singular, color: category.color, builtin: category.builtin, fields: category.fields.filter((f) => !f.archived), ...(category.uses ? { uses: category.uses } : {}) }] })
                    .then((t) => setNotice({ text: `Saved “${t.name}” as a template, to add to any novel.` }), fail)
                }
              >
                Save {category.name} as a template
              </button>
            </div>
          )}

          <div className="field">
            <span>Fields every {category.singular.toLowerCase()} has</span>
            <ol className="schema-fields">
              {active.map((def, index) => (
                <li key={def.id}>
                  <input defaultValue={def.name} aria-label={`Field ${index + 1} name`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== def.name && editField(def.id, { name: e.target.value })} />
                  <select value={def.type} aria-label={`${def.name} type`} onChange={(e) => editField(def.id, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <span className="schema-actions">
                    <button type="button" className="tool" aria-label={`Move ${def.name} up`} disabled={index === 0} onClick={() => moveField(def.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="tool" aria-label={`Move ${def.name} down`} disabled={index === active.length - 1} onClick={() => moveField(def.id, 1)}>
                      ↓
                    </button>
                    <button type="button" className="tool" aria-label={`Remove ${def.name}`} title="Archive this field. Values already written are kept." onClick={() => editField(def.id, { archived: true })}>
                      ✕
                    </button>
                  </span>
                  {(def.type === 'select' || def.type === 'multiselect') && (
                    <input
                      key={def.options.join('|')}
                      className="schema-options"
                      defaultValue={def.options.join(', ')}
                      placeholder="Choices, separated by commas"
                      aria-label={`${def.name} choices`}
                      onBlur={(e) => editField(def.id, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                    />
                  )}
                  <div className="schema-rules">
                    <Check label="Required" name={`${def.name} required`} checked={Boolean(def.required)} onChange={(required) => editField(def.id, { required })} />
                    {def.type === 'number' && (
                      <>
                        <input key={`min-${def.min ?? ''}`} type="number" step="any" className="schema-range" defaultValue={def.min ?? ''} placeholder="Lowest" aria-label={`${def.name} lowest`} onBlur={(e) => editField(def.id, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                        <input key={`max-${def.max ?? ''}`} type="number" step="any" className="schema-range" defaultValue={def.max ?? ''} placeholder="Highest" aria-label={`${def.name} highest`} onBlur={(e) => editField(def.id, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </>
                    )}
                    {(def.type === 'reference' || def.type === 'references') && (
                      <select value={def.target ?? ''} aria-label={`${def.name} links to`} onChange={(e) => editField(def.id, { target: e.target.value || undefined })}>
                        <option value="">Links to any kind of entry</option>
                        {all.map((c) => (
                          <option key={c.key} value={c.key}>
                            Links to {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input key={`help-${def.help ?? ''}`} className="schema-help" defaultValue={def.help ?? ''} placeholder="Help shown with the field (optional)" aria-label={`${def.name} help`} onBlur={(e) => e.target.value.trim() !== (def.help ?? '') && editField(def.id, { help: e.target.value })} />
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" className="btn" onClick={addField}>
              + Add field
            </button>
          </div>

          {!only && <KindUsesEditor codex={codex} category={category} save={save} />}

          {archived.length > 0 && (
            <div className="field">
              <span>Archived fields</span>
              <ul className="schema-archived">
                {archived.map((def) => (
                  <li key={def.id}>
                    <span>
                      {def.name} <span className="muted small">· {FIELD_TYPE_LABELS[def.type]} · {usedBy(def) ? `still filled in on ${usedBy(def)} ${usedBy(def) === 1 ? 'entry' : 'entries'}` : 'no values'}</span>
                    </span>
                    <button type="button" className="btn" aria-label={`Restore ${def.name}`} onClick={() => editField(def.id, { archived: false })}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted small">Removing a field only hides it. What you wrote in it is kept, and comes back if you restore the field.</p>
            </div>
          )}

          {!category.builtin && (
            <div className="entry-foot">
              <span className="muted small">
                {category.archived ? 'Archived: no new entries can be added, existing ones are kept.' : `Archiving hides this category from “New entry”. Its ${count(category)} ${count(category) === 1 ? 'entry is' : 'entries are'} kept.`}
              </span>
              <button type="button" className="btn" onClick={() => save({ archived: !category.archived })}>
                {category.archived ? 'Restore category' : 'Archive category'}
              </button>
            </div>
          )}

          <fieldset className="plan-group" hidden={Boolean(only)}>
            <legend>Templates</legend>
            <form
              className="history-save"
              onSubmit={(e) => {
                e.preventDefault();
                void codex
                  .schemaSnapshot()
                  .then((data) => templates.save(templateName, `${data.categories.length} categories`, data))
                  .then((template) => {
                    setTemplateName('');
                    setNotice({ text: `Saved “${template.name}”. Pick it when you create a new project.` });
                  }, fail);
              }}
            >
              <input value={templateName} placeholder="Save all categories & fields as a template…" aria-label="Template name" onChange={(e) => setTemplateName(e.target.value)} />
              <button type="submit" className="btn" disabled={!templateName.trim()}>
                Save template
              </button>
            </form>
            <label className="field">
              <span>Add categories and fields from a template</span>
              <select
                value=""
                aria-label="Add from a template"
                onChange={(e) => {
                  const chosen = [...PRESETS, ...saved].find((t) => t.id === e.target.value);
                  if (chosen) apply(chosen.name, chosen);
                }}
              >
                <option value="">Choose a template…</option>
                <optgroup label="Built in">
                  {PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
                {saved.length > 0 && (
                  <optgroup label="Yours">
                    {saved.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {saved.length > 0 && (
              <ul className="schema-archived">
                {saved.map((template) => (
                  <li key={template.id}>
                    <span>
                      {template.name} <span className="muted small">· {template.description}</span>
                    </span>
                    <button type="button" className="btn ghost" aria-label={`Delete template ${template.name}`} onClick={() => void templates.remove(template.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>
      </div>
    </Modal>
  );
}
