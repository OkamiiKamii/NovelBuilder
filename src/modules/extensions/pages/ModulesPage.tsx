import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { codex, extensions, systems } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { can } from '@/modules/sync/access';
import { useCategories } from '@/modules/codex/categories';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { downloadBlob, fileSlug } from '@/shared/download';
import { BUILTIN_MODULES } from '../builtin';
import { Configure } from '../components/Configure';
import { ViewModules } from '../components/ViewModules';
import { useInstalled, useModuleStatus } from '../hooks';
import { MODULE_STATE_LABELS, type ModuleDefinition, type ModuleStatus } from '../types';

const BUILTIN_CATEGORY_NAMES: Record<string, string> = { character: 'Characters', location: 'Locations', faction: 'Factions & Species', item: 'Items & Artifacts', power: 'Power Systems & Rules', lore: 'Lore & History' };

/**
 * MODULE MANAGER
 * Every module that can be switched on for this project, where each stands
 * (available, enabled, disabled, needing attention), what it shares with the
 * others, and the author's own. Switching one on creates no records;
 * switching one off deletes none.
 */
export function ModulesPage() {
  const project = useCurrentProject();
  const api = extensions.forProject(project.id);
  const installed = useInstalled(project.id);
  const saved = useLiveQuery(() => extensions.saved(), []);
  const status = useModuleStatus(project.id);
  const entries = useLiveQuery(() => codex.forProject(project.id).list(), [project.id]);
  const writes = can(useMe(project.id).role, 'write');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [show, setShow] = useState<'all' | 'on' | 'off'>('all');
  const blueprints = useLiveQuery(() => systems.forProject(project.id).list(), [project.id]);
  const categories = useCategories();
  const file = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [systemId, setSystemId] = useState('');

  const fail = (err: unknown) => setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
  if (!installed || !saved || !blueprints || !status || !entries) return null;
  const standing = (id: string): ModuleStatus | undefined => status.find((s) => s.module.id === id);
  const mine = saved.map((m) => m.definition);
  // Modules installed here whose definition is not in this device's library (the project came from elsewhere).
  const foreign = installed.filter((r) => !r.definition.builtin && !mine.some((m) => m.id === r.moduleId)).map((r) => r.definition);
  const isOn = (id: string) => installed.some((r) => r.moduleId === id && r.enabled);
  const on = installed.filter((r) => r.enabled).length;

  const toggle = (module: ModuleDefinition) => {
    setBusy(module.id);
    const turningOn = !isOn(module.id);
    const sharing = (standing(module.id)?.shares ?? []).filter((x) => x.enabled);
    (turningOn ? api.enable(mine.find((m) => m.id === module.id) ?? module.id).then(() => undefined) : api.disable(module.id))
      .then(
        () =>
          setNotice({
            text: turningOn
              ? `${module.name} is on. Its workspace is in the sidebar and its categories are in the Codex. Nothing was created: its records are yours to make.`
              : `${module.name} is off. Its tools are hidden; everything made with it is kept.${sharing.length ? ` ${sharing.map((x) => `${x.categories.join(', ')} ${x.categories.length === 1 ? 'stays' : 'stay'} in use by ${x.name}`).join('; ')}.` : ''}`,
          }),
        fail,
      )
      .finally(() => setBusy(null));
  };
  const adds = (module: ModuleDefinition) => module.schema.categories.map((c) => (c.builtin ? `${c.fields.length} ${c.fields.length === 1 ? 'field' : 'fields'} on ${BUILTIN_CATEGORY_NAMES[c.key] ?? c.key}` : c.name));
  const card = (listed: ModuleDefinition, owned: boolean) => {
    const at = standing(listed.id);
    // What this project has installed is what its card describes; a module not installed is described as it comes.
    const module = at?.module ?? listed;
    const state = at?.state ?? 'available';
    const on = state === 'enabled' || state === 'attention';
    return (
      <li key={module.id} className={`panel module-card${on ? ' on' : ''}`} aria-label={module.name} data-state={state}>
        <div className="thread-top">
          {module.icon && (
            <span className="module-icon" aria-hidden="true">
              {module.icon}
            </span>
          )}
          <strong className="thread-title as-text">{module.name}</strong>
          {!module.builtin && <span className="badge">Yours</span>}
          <span className={`badge module-state state-${state}`}>{MODULE_STATE_LABELS[state]}</span>
        </div>
        {module.genre && <p className="muted small">{module.genre}</p>}
        <p>{module.description}</p>
        {module.features && module.features.length > 0 && (
          <ul className="chips module-features" aria-label={`What ${module.name} does`}>
            {module.features.map((feature) => (
              <li key={feature} className="badge">
                {feature}
              </li>
            ))}
          </ul>
        )}
        {at?.reasons.map((reason) => (
          <p key={reason} className="notice small" role="note">
            {reason}
          </p>
        ))}
        <details className="module-more">
          <summary>Details</summary>
          {adds(module).length > 0 && <p className="small">Adds to the Codex: {adds(module).join(', ')}.</p>}
          {module.tools.length > 0 && <p className="small">Tools: {module.tools.map((t) => t.title).join(', ')}.</p>}
          {module.integrates && module.integrates.length > 0 && <p className="small">Works with: {module.integrates.join(', ')}.</p>}
          {module.system && <p className="small">Offers an example system, “{module.system.name}”. It is added only if you ask for it.</p>}
          <p className="small" aria-label={`Dependencies of ${module.name}`}>
            {at && at.shares.length > 0 ? `Shares records with: ${at.shares.map((x) => `${x.name} (${x.categories.join(', ')})`).join('; ')}. Switching either off leaves them in place for the other.` : 'Depends on no other module.'}
          </p>
          <p className="muted small">
            Version {module.version}
            {at?.installed && at.installed !== listed.version ? ` installed · version ${listed.version} available` : ''} · {module.builtin ? 'built in' : 'made by an author'} · works with this version of the app
          </p>
        </details>
        {at && (at.usage.entries > 0 || at.usage.records > 0) && (
          <p className="small" aria-label={`${module.name} in use`}>
            In use here: {at.usage.entries} {at.usage.entries === 1 ? 'record' : 'records'} in its categories, {at.usage.records} in its logs and tables.
          </p>
        )}
        {state === 'disabled' && <p className="muted small">Switched off here. What was made with it is kept and comes back when it is enabled.</p>}
        <div className="actions start wrap">
          {on && (
            <Link className="btn primary" to={`/project/${project.id}/modules/${module.id}`}>
              Open Module
            </Link>
          )}
          {on && writes && (
            <button type="button" className="btn" aria-label={`Configure ${module.name}`} onClick={() => setConfiguring(module.id)}>
              Configure
            </button>
          )}
          {at?.updatable && writes && (
            <button type="button" className="btn" aria-label={`Update ${module.name}`} disabled={busy === module.id} onClick={() => void api.enable(module.id).then(() => setNotice({ text: `${module.name} was updated. Only fields and tools were added.` }), fail)}>
              Update
            </button>
          )}
          {writes && (
            <button type="button" className={on ? 'btn ghost' : 'btn primary'} aria-label={`${on ? 'Disable' : 'Enable'} ${module.name}`} disabled={busy === module.id} onClick={() => toggle(module)}>
              {on ? 'Disable' : state === 'disabled' ? 'Enable Module again' : 'Enable Module'}
            </button>
          )}
          {!module.builtin && (
            <button type="button" className="btn" onClick={() => downloadBlob(new Blob([extensions.exportModule(module)], { type: 'application/json' }), `${fileSlug(module.name)}.module.json`)}>
              Export
            </button>
          )}
          {owned && (
            <button type="button" className="btn ghost" aria-label={`Remove ${module.name} from my modules`} onClick={() => void extensions.remove(module.id).then(() => setNotice({ text: `${module.name} was removed from your modules. Projects that use it keep it.` }), fail)}>
              Remove from my modules
            </button>
          )}
          {!module.builtin && !owned && (
            <button type="button" className="btn ghost" onClick={() => void extensions.save(module).then(() => setNotice({ text: `${module.name} was added to your modules.` }), fail)}>
              Add to my modules
            </button>
          )}
        </div>
      </li>
    );
  };
  const visible = (module: ModuleDefinition) => show === 'all' || (show === 'on') === isOn(module.id);
  const configured = installed.find((r) => r.moduleId === configuring);
  const packable = categories.list.filter((c) => !c.archived && c.fields.some((f) => !f.archived));

  return (
    <div className="stack modules-page">
      <header className="page-header">
        <div>
          <h1>Module Manager</h1>
          <p className="muted" role="status">
            {on === 0 ? 'No modules on: just the core' : `${on} ${on === 1 ? 'module' : 'modules'} on in this project`}
          </p>
        </div>
      </header>
      <p className="muted small">
        Modules add tools for a kind of story, and any number can be on together: they all work on the project’s one set of characters, places and events. Each is switched on per project, so a project only has what it uses. Switching one off hides its tools and never deletes anything; writing, the Codex and export work the same with or without them.
      </p>
      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <section className="stack" aria-label="Genre modules">
        <h2>Genre modules</h2>
        <div className="segmented" role="radiogroup" aria-label="Which modules to show">
          {([['all', 'All'], ['on', 'Enabled'], ['off', 'Not enabled']] as const).map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={show === key} className={show === key ? 'active' : ''} onClick={() => setShow(key)}>
              {label}
            </button>
          ))}
        </div>
        <ul className="module-grid">{BUILTIN_MODULES.filter(visible).map((module) => card(module, false))}</ul>
      </section>

      <section className="stack" aria-label="Your modules">
        <h2>Your modules</h2>
        {mine.length + foreign.length === 0 ? <p className="muted">None yet. Make one from this project below, or import one someone has shared.</p> : <ul className="module-grid">{[...mine.map((m) => card(m, true)), ...foreign.map((m) => card(m, false))]}</ul>}
        <div className="actions start">
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Import a module…
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Module file"
            onChange={async (e) => {
              const chosen = e.target.files?.[0];
              e.target.value = '';
              if (!chosen) return;
              try {
                const imported = await extensions.importModule(await chosen.text());
                setNotice({ text: `${imported.definition.name} was added to your modules. Switch it on to use it here.` });
              } catch (err) {
                fail(err);
              }
            }}
          />
        </div>
      </section>

      <ViewModules project={project} writes={writes} />

      <section className="panel" aria-label="Make a module from this project">
        <h2>Make a module from this project</h2>
        <p className="muted small">Packages categories with their fields, and a system's rules, so you can reuse them in another project or share them. Nothing you have written goes into it: no entries, names or text.</p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            api.buildFrom({ name, genre, description, categoryKeys: picked, systemId: systemId || null })
              .then((definition) => extensions.save(definition))
              .then((row) => {
                setNotice({ text: `${row.definition.name} was saved to your modules.` });
                setName('');
                setGenre('');
                setDescription('');
                setPicked([]);
                setSystemId('');
              }, fail);
          }}
        >
          <div className="grid-2 tight">
            <label className="field">
              <span>Name</span>
              <input value={name} aria-label="Module name" placeholder="Superhero / Urban Fantasy" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>For</span>
              <input value={genre} aria-label="Module is for" placeholder="Capes, masks and secret identities" onChange={(e) => setGenre(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <input value={description} aria-label="Module description" onChange={(e) => setDescription(e.target.value)} />
          </label>
          <fieldset className="plan-group" aria-label="Categories to include">
            <legend>Categories and their fields</legend>
            {packable.map((category) => (
              <label key={category.key} className="check wrap">
                <input type="checkbox" checked={picked.includes(category.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, category.key] : picked.filter((key) => key !== category.key))} />
                {category.name}
                <span className="muted small">{category.fields.filter((f) => !f.archived).map((f) => f.name).join(', ')}</span>
              </label>
            ))}
          </fieldset>
          {blueprints.length > 0 && (
            <label className="field">
              <span>System rules</span>
              <select value={systemId} aria-label="System to include" onChange={(e) => setSystemId(e.target.value)}>
                <option value="">No system</option>
                {blueprints.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="actions start">
            <button type="submit" className="btn primary">
              Save as a module
            </button>
          </div>
        </form>
      </section>
      {configured && <Configure row={configured} entries={entries} onClose={() => setConfiguring(null)} onError={fail} />}
    </div>
  );
}
