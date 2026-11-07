import { useEffect, useState, type FormEvent } from 'react';
import type { ProjectRelationships } from '../service';
import { RELATION_CATEGORIES, RELATION_CATEGORY_LABELS, RELATION_PRESETS, SUGGESTED_ATTRIBUTES, TYPE_PREFIX, type RelationCategory, type RelationSettings, type RelationType } from '../types';

/** The type choices for a relationship: each group's built-in types (unless hidden) and the novel's own, plus whatever `current` is. */
export function TypeOptions({ settings, current }: { settings: RelationSettings; current?: string }) {
  return (
    <>
      {RELATION_CATEGORIES.map((category) => {
        const builtIn = RELATION_PRESETS.filter((p) => p.category === category && (!settings.hidden.includes(p.key) || p.key === current));
        const own = settings.types.filter((t) => t.category === category);
        if (!builtIn.length && !own.length) return null;
        return (
          <optgroup key={category} label={RELATION_CATEGORY_LABELS[category]}>
            {own.map((t) => (
              <option key={t.id} value={`${TYPE_PREFIX}${t.id}`}>
                {t.label}
              </option>
            ))}
            {builtIn.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

const EMPTY = { label: '', category: 'custom' as RelationCategory, directional: false, fromRole: '', toRole: '' };

/**
 * The novel's own settings for relationships: types of its own, which
 * built-in types are offered, and which attributes are tracked. Nothing is
 * tracked until the author chooses it.
 */
export function RelationSettingsPanel({ settings, api, onError }: { settings: RelationSettings; api: ProjectRelationships; onError: (error: unknown) => void }) {
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const run = (task: Promise<unknown>, then?: () => void) => void task.then(then, onError);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(api.saveType(draft, editing ?? undefined), () => {
      setDraft(EMPTY);
      setEditing(null);
    });
  };
  const edit = (t: RelationType) => {
    setEditing(t.id);
    setDraft({ label: t.label, category: t.category, directional: t.directional, fromRole: t.fromRole, toRole: t.toRole });
  };
  const tracked = new Set(settings.attributes.map((a) => a.key));
  // A box shows its new state at once, while the change is saved; it follows the stored settings as soon as they catch up, or go back if the change fails.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const actual = (key: string) => (key.startsWith('offer:') ? !settings.hidden.includes(key.slice(6)) : tracked.has(key));
  useEffect(() => setPending((p) => Object.fromEntries(Object.entries(p).filter(([key, value]) => actual(key) !== value))), [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const checked = (key: string) => pending[key] ?? actual(key);
  const toggle = (key: string, on: boolean, task: Promise<unknown>) => {
    setPending((p) => ({ ...p, [key]: on }));
    void task.catch((error) => {
      setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)));
      onError(error);
    });
  };

  return (
    <details className="panel rel-settings">
      <summary>Relationship types and attributes</summary>
      <div className="stack">
        <section className="stack" aria-label="Types of your own">
          <h3>Your own types</h3>
          <p className="muted small">Types for this novel’s own kinds of tie, offered beside the built-in ones. Changing one changes every relationship that uses it; deleting one keeps those relationships’ wording.</p>
          {settings.types.length > 0 && (
            <ul className="rel-type-list">
              {settings.types.map((t) => (
                <li key={t.id}>
                  <strong>{t.label}</strong> <span className="muted small">{RELATION_CATEGORY_LABELS[t.category]} · {t.directional ? `one-way: ${t.fromRole} → ${t.toRole}` : 'mutual'}</span>{' '}
                  <button type="button" className="btn ghost" aria-label={`Edit the type ${t.label}`} onClick={() => edit(t)}>
                    Edit
                  </button>
                  <button type="button" className="btn ghost danger" aria-label={`Delete the type ${t.label}`} onClick={() => run(api.removeType(t.id))}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="stack" onSubmit={submit} aria-label={editing ? 'Change the type' : 'Make a type'}>
            <div className="grid-2 tight">
              <label className="field">
                <span>Name</span>
                <input value={draft.label} aria-label="Name of the type" placeholder="Blood oath" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </label>
              <label className="field">
                <span>Group</span>
                <select value={draft.category} aria-label="Group of the type" onChange={(e) => setDraft({ ...draft, category: e.target.value as RelationCategory })}>
                  {RELATION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {RELATION_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check wrap">
              <input type="checkbox" checked={draft.directional} onChange={(e) => setDraft({ ...draft, directional: e.target.checked })} /> One-way: each side has its own role (Mentor and Student, not Friends)
            </label>
            {draft.directional && (
              <div className="grid-2 tight">
                <label className="field">
                  <span>The one named first is the…</span>
                  <input value={draft.fromRole} aria-label="First role" placeholder="Oath-holder" onChange={(e) => setDraft({ ...draft, fromRole: e.target.value })} />
                </label>
                <label className="field">
                  <span>The one named second is the…</span>
                  <input value={draft.toRole} aria-label="Second role" placeholder="Sworn" onChange={(e) => setDraft({ ...draft, toRole: e.target.value })} />
                </label>
              </div>
            )}
            <div className="actions start">
              <button type="submit" className="btn primary">
                {editing ? 'Save the type' : 'Add the type'}
              </button>
              {editing && (
                <button type="button" className="btn ghost" onClick={() => (setEditing(null), setDraft(EMPTY))}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="stack" aria-label="Built-in types offered">
          <h3>Built-in types offered</h3>
          <p className="muted small">Leave out the ones this novel does not use. Relationships already using one keep it.</p>
          <div className="rel-offered">
            {RELATION_CATEGORIES.filter((c) => c !== 'custom').map((category) => (
              <fieldset key={category} className="plan-group">
                <legend>{RELATION_CATEGORY_LABELS[category]}</legend>
                {RELATION_PRESETS.filter((p) => p.category === category).map((p) => (
                  <label key={p.key} className="check wrap">
                    <input type="checkbox" checked={checked(`offer:${p.key}`)} onChange={(e) => toggle(`offer:${p.key}`, e.target.checked, api.offerBuiltIn(p.key, e.target.checked))} /> {p.label}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </section>

        <section className="stack" aria-label="Attributes to track">
          <h3>Attributes to track</h3>
          <p className="muted small">Measure relationships by these, each way, from 0 to 10, only if you want to. Nothing is tracked until you choose it, and untracking one keeps what you gave.</p>
          <div className="rel-offered">
            {SUGGESTED_ATTRIBUTES.map((a) => (
              <label key={a.key} className="check wrap">
                <input type="checkbox" checked={checked(a.key)} onChange={(e) => toggle(a.key, e.target.checked, e.target.checked ? api.trackAttribute(a.key) : api.untrackAttribute(a.key))} /> {a.label}
              </label>
            ))}
          </div>
          {settings.attributes.filter((a) => !SUGGESTED_ATTRIBUTES.some((s) => s.key === a.key)).map((a) => (
            <p key={a.key} className="small">
              {a.label}{' '}
              <button type="button" className="btn ghost" aria-label={`Stop tracking ${a.label}`} onClick={() => run(api.untrackAttribute(a.key))}>
                Stop tracking
              </button>
            </p>
          ))}
          <form className="actions start wrap" onSubmit={(e) => (e.preventDefault(), run(api.trackAttribute(own), () => setOwn('')))}>
            <input value={own} aria-label="An attribute of your own" placeholder="Debt, Jealousy…" onChange={(e) => setOwn(e.target.value)} />
            <button type="submit" className="btn">
              Track it
            </button>
          </form>
        </section>
      </div>
    </details>
  );
}
