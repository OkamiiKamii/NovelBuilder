import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { codex, systems } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { KitsTab, TablesTab, TracksTab, VariablesTab } from '../components/BlueprintTabs';
import { Commit, type Change } from '../components/inputs';
import { SheetsTab } from '../components/SheetsTab';
import { BLANK, SYSTEM_PRESETS } from '../presets';
import type { BlueprintContent } from '../types';

const TABS = { variables: 'Attributes & resources', tracks: 'Levels & realms', kits: 'Classes, skills & more', tables: 'Tables', sheets: 'Sheets' } as const;
type Tab = keyof typeof TABS;

/** Every system of the project and everything on them, reached from the Character Library. */
export function SystemsPage() {
  const project = useCurrentProject();
  return (
    <div className="stack">
      <Link to={`/project/${project.id}/characters`} className="back small">
        ← Character Library
      </Link>
      <SystemsWorkspace projectId={project.id} />
    </div>
  );
}

/**
 * SYSTEMS, INSIDE CHARACTERS
 * The whole systems designer: the rules (attributes, levels, classes and
 * skills, tables) and the sheets that run on them. It has no page of its
 * own in the navigation. With `focus` it is a character's System tab: their
 * sheet is what opens, edited in place, and the rules sit on the tabs beside
 * it. A system's rules are shared by everyone on it, so changing a rule
 * here changes it for all of them; a sheet is one character's alone.
 */
export function SystemsWorkspace({ projectId, focus }: { projectId: string; focus?: LoreEntry }) {
  const project = { id: projectId };
  const api = useMemo(() => systems.forProject(project.id), [project.id]);
  const blueprints = useLiveQuery(() => api.list(), [api]);
  const sheets = useLiveQuery(() => api.sheets(), [api]);
  const entries = useLiveQuery(() => codex.forProject(project.id).list(), [project.id]);
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const go = (next: Record<string, string | null>) =>
    setParams(
      (current) => {
        const merged = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key);
        return merged;
      },
      { replace: true },
    );

  if (!blueprints || !sheets || !entries) return null;
  const system = blueprints.find((b) => b.id === params.get('system')) ?? null;
  // On a character's profile their sheet comes first; in the library, the rules.
  const first: Tab = focus ? 'sheets' : 'variables';
  const tab: Tab = (params.get('tab') as Tab) in TABS ? (params.get('tab') as Tab) : first;
  const TITLE = focus ? 'h2' : 'h1';
  const sheetOf = (systemId: string) => (focus ? sheets.find((s) => s.systemId === systemId && s.entryId === focus.id) : undefined);
  const create = (content: BlueprintContent) => api.create(content).then((made) => go({ system: made.id, tab: null, sheet: null }), fail);
  const notice = error && (
    <p className="notice error" role="alert">
      {error}
      <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
        ✕
      </button>
    </p>
  );

  if (!system) {
    return (
      <div className="stack systems-page" data-scope={focus ? 'character' : undefined}>
        <header className="page-header">
          <div>
            <TITLE>{focus ? `${focus.name}’s systems` : 'Systems'}</TITLE>
            <p className="muted" role="status">
              {blueprints.length === 0 ? 'The rules your world runs on' : focus ? `On ${blueprints.filter((b) => sheetOf(b.id)).length} of ${blueprints.length} ${blueprints.length === 1 ? 'system' : 'systems'}` : `${blueprints.length} ${blueprints.length === 1 ? 'system' : 'systems'}`}
            </p>
          </div>
        </header>
        {notice}
        {blueprints.length > 0 && (
          <ul className="threads" aria-label="Your systems">
            {[...blueprints].sort((a, b) => Number(Boolean(sheetOf(b.id))) * -1 - Number(Boolean(sheetOf(a.id))) * -1 || a.name.localeCompare(b.name)).map((b) => {
              const onIt = sheets.filter((s) => s.systemId === b.id && entries.some((e) => e.id === s.entryId)).length;
              return (
                <li key={b.id} className="thread system-card">
                  <Link to={`?system=${b.id}`} className="thread-title">
                    {b.name}
                  </Link>
                  {focus &&
                    (sheetOf(b.id) ? (
                      <span className="badge">{focus.name} has a sheet</span>
                    ) : (
                      <button type="button" className="btn" onClick={() => void api.addSheet(b.id, focus.id).then((sheet) => go({ system: b.id, tab: null, sheet: sheet.id }), fail)}>
                        Put {focus.name} on {b.name}
                      </button>
                    ))}
                  {b.description.trim() && <p className="thread-premise">{b.description}</p>}
                  <p className="muted small">
                    {[`${b.variables.length} attributes & formulas`, `${b.tracks.length} ${b.tracks.length === 1 ? 'way' : 'ways'} of advancing`, ...b.groups.map((g) => `${b.items.filter((i) => i.groupId === g.id).length} ${g.name.toLowerCase()}`), `${onIt} ${onIt === 1 ? 'sheet' : 'sheets'}`].join(' · ')}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <section className="stack" aria-label="Start a new system">
          <h2>Start a new system</h2>
          <p className="muted small">A preset is only a starting point: every name, number, rank and formula in it can be changed or thrown away.</p>
          <ul className="preset-grid">
            <li className="panel">
              <strong>Blank</strong>
              <p className="muted small">Nothing assumed. Build your own from the first variable.</p>
              <button type="button" className="btn" onClick={() => void create(BLANK)}>
                Start blank
              </button>
            </li>
            {SYSTEM_PRESETS.map((preset) => (
              <li key={preset.id} className="panel">
                <strong>{preset.name}</strong>
                <p className="muted small">{preset.description}</p>
                <button type="button" className="btn" onClick={() => void create(preset.content)}>
                  Use {preset.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const change: Change = (edit) => void api.update(system.id, edit).catch(fail);
  const counts: Record<Tab, number> = { variables: system.variables.length, tracks: system.tracks.length, kits: system.items.length, tables: system.matrices.length, sheets: sheets.filter((s) => s.systemId === system.id && entries.some((e) => e.id === s.entryId)).length };

  return (
    <div className="stack systems-page" data-scope={focus ? 'character' : undefined}>
      <header className="page-header">
        <div className="stack system-head">
          <Link to={{ search: '' }} replace className="back small" onClick={() => setError(null)}>
            ← All systems
          </Link>
          <Commit label="System name" value={system.name} onCommit={(name) => change(() => ({ name }))} className="system-name" />
          <Commit multiline label="What this system is" value={system.description} placeholder="What this system is, in a sentence or two" onCommit={(description) => change(() => ({ description }))} />
        </div>
        <button type="button" className="btn danger" onClick={() => setDeleting(true)}>
          Delete system…
        </button>
      </header>
      {notice}
      <div className="segmented wrap" role="tablist" aria-label="Parts of the system">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => go({ tab: key === first ? null : key })}>
            {focus && key === 'sheets' ? `${focus.name}’s sheet` : `${TABS[key]} (${counts[key]})`}
          </button>
        ))}
      </div>
      {focus && tab !== 'sheets' && <p className="muted small">These are the rules of {system.name}, shared by everyone on it: a change here changes every sheet, {focus.name}’s included.</p>}
      {tab === 'variables' && <VariablesTab system={system} change={change} />}
      {tab === 'tracks' && <TracksTab system={system} change={change} />}
      {tab === 'kits' && <KitsTab system={system} change={change} />}
      {tab === 'tables' && <TablesTab system={system} change={change} />}
      {tab === 'sheets' && <SheetsTab system={system} sheets={sheets} entries={entries} api={api} selectedId={params.get('sheet')} onSelect={(sheet) => go({ sheet })} onError={fail} only={focus} />}

      {deleting && (
        <ConfirmDialog
          title="Delete system"
          confirmLabel="Delete system"
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false);
            void api.remove(system.id).then(() => go({ system: null, tab: null, sheet: null }), fail);
          }}
        >
          <p>
            Delete <strong>{system.name}</strong> and the {counts.sheets} {counts.sheets === 1 ? 'sheet' : 'sheets'} made from it? Codex entries themselves are not changed.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
