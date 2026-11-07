import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { extensions, systems } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { can } from '@/modules/sync/access';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { Configure } from '../components/Configure';
import { Dashboard } from '../components/Dashboard';
import { ToolView } from '../components/Tools';
import { arrangedTools, useInstalled, useToolData } from '../hooks';

/** One module's workspace: its dashboard and its tools. Only reachable usefully while the module is on; when it is off, it says so and keeps its data. */
export function ModulePage() {
  const project = useCurrentProject();
  const { moduleId = '' } = useParams();
  const installed = useInstalled(project.id);
  const row = installed?.find((r) => r.moduleId === moduleId);
  const data = useToolData(project.id, row?.bindings);
  const blueprints = useLiveQuery(() => systems.forProject(project.id).list(), [project.id]);
  const writes = can(useMe(project.id).role, 'write');
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  if (!installed || data.loading || !blueprints) return null;
  const back = <Link to={`/project/${project.id}/modules`}>All modules</Link>;
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');

  if (!row) {
    return (
      <div className="stack">
        <h1>Module not installed</h1>
        <p className="muted">This project does not use that module. {back}</p>
      </div>
    );
  }
  const module = row.definition;
  if (!row.enabled) {
    return (
      <div className="stack module-page">
        <h1>{module.name}</h1>
        <p className="notice" role="status">
          This module is switched off, so its tools are hidden. Everything made with it is still stored.
          <button type="button" className="btn" onClick={() => void extensions.forProject(project.id).enable(module.id).catch(fail)}>
            Turn it on
          </button>
        </p>
        <p>{back}</p>
      </div>
    );
  }
  const tools = arrangedTools(module, row.settings);
  const tool = tools.find((t) => t.id === params.get('tool')) ?? null;
  const open = (toolId: string | null, recordId?: string) => setParams({ ...(toolId ? { tool: toolId } : {}), ...(recordId ? { record: recordId } : {}) }, { replace: true });
  const starter = module.system && !blueprints.some((b) => b.id === row.systemId);
  return (
    <div className="stack module-page">
      <header className="page-header">
        <div>
          <h1>
            {module.icon && (
              <span className="module-icon" aria-hidden="true">
                {module.icon}
              </span>
            )}
            {row.settings?.nav || module.nav || module.name}
          </h1>
          <p className="muted">{module.description}</p>
        </div>
        <div className="actions wrap">
          {writes && (
            <button type="button" className="btn" onClick={() => setConfiguring(true)}>
              Configure
            </button>
          )}
          {back}
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      {starter && writes && (
        <p className="notice" role="note">
          <span>
            This module comes with an example system, “{module.system!.name}”, to reshape or learn from. It is not added unless you ask: it contains sample classes and skills, and your story may want none of them.
          </span>
          <button type="button" className="btn" onClick={() => void extensions.forProject(project.id).addStarterSystem(module.id).catch(fail)}>
            Add the example system
          </button>
        </p>
      )}
      <div className="segmented wrap" role="tablist" aria-label={`${module.name} tools`}>
        <button type="button" role="tab" aria-selected={!tool} className={!tool ? 'active' : ''} onClick={() => open(null)}>
          Dashboard
        </button>
        {tools.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tool?.id} className={t.id === tool?.id ? 'active' : ''} onClick={() => open(t.id)}>
            {t.title}
          </button>
        ))}
      </div>
      {tool ? (
        <section className="stack" aria-label={tool.title}>
          {tool.hint && <p className="muted small">{tool.hint}</p>}
          <ToolView key={`${module.id}:${tool.id}`} tool={tool} moduleId={module.id} data={data} onError={fail} />
        </section>
      ) : (
        <section className="stack" aria-label="Dashboard">
          <Dashboard module={module} tools={tools} data={data} onOpen={open} />
        </section>
      )}
      {configuring && <Configure row={row} entries={data.entries} onClose={() => setConfiguring(false)} onError={fail} />}
    </div>
  );
}
