import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { projects, savedViews } from '@/core';
import type { Project } from '@/modules/projects/types';
import { isViewOn, neededBy, turnOff, turnOn, VIEW_MODULES, viewLabel, type TurnOff } from '@/modules/visualize/modules';
import { VIEWS } from '@/modules/visualize/views';

const names = (keys: string[]) => (keys.length > 1 ? `${keys.slice(0, -1).map(viewLabel).join(', ')} and ${viewLabel(keys[keys.length - 1])}` : keys.map(viewLabel).join(''));
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * VIEWS AS MODULES (Optional Prompt D)
 * Each view of the Visualize page, turned off and on for this novel. Off,
 * it is gone from Visualize and from the links other pages make to it; its
 * records stay where they are kept, its saved views stay, and the checks
 * that read them go on. A view that another view needs stays on while that
 * one is on, and the page says why and offers to turn both off.
 */
export function ViewModules({ project, writes }: { project: Project; writes: boolean }) {
  const off = project.viewsOff ?? [];
  const saved = useLiveQuery(() => savedViews.forProject(project.id).list(), [project.id]);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [blocked, setBlocked] = useState<TurnOff['blocked'][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const section = useRef<HTMLElement>(null);
  const location = useLocation();
  // Reached from a view that is off ("Views in the Module Manager"): brought into sight.
  useEffect(() => {
    if (location.hash === '#views') section.current?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  const save = (next: string[], text: string) => {
    setBusy(true);
    setBlocked(null);
    projects
      .setViewsOff(project.id, next)
      .then(
        () => setNotice({ text }),
        (e) => setNotice({ text: e instanceof Error ? e.message : String(e), error: true }),
      )
      .finally(() => setBusy(false));
  };
  const kept = (keys: string[]) => {
    const here = keys.map((k) => VIEW_MODULES.find((m) => m.key === k)?.editsHere).filter(Boolean);
    if (!here.length) return '';
    return keys.length === 1 ? ` Its ${here[0]} are kept, and can be changed again once it is on.` : ` What is made only in them (${here.join('; ')}) is kept, and can be changed again once they are on.`;
  };
  const off_ = (key: string) => {
    const plan = turnOff(off, [key]);
    if (plan.blocked.length) {
      setNotice(null);
      setBlocked(plan.blocked[0]);
      return;
    }
    save(plan.off, `${viewLabel(key)} is off. It is gone from Visualize and from the links to it. Nothing was deleted, its saved views are kept, and every check still runs.${kept([key])}`);
  };
  const together = (key: string, by: string[]) => {
    const keys = [...by, key];
    save(turnOff(off, keys).off, `${names(keys)} are off. Nothing was deleted, their saved views are kept, and every check still runs.${kept(keys)}`);
  };
  const on_ = (key: string) => {
    const plan = turnOn(off, key);
    save(plan.off, `${viewLabel(key)} is on again, as it was.${plan.alsoOn.length ? ` ${names(plan.alsoOn)} came on too: ${viewLabel(key)} needs ${plan.alsoOn.length === 1 ? 'it' : 'them'}.` : ''}`);
  };
  const onCount = VIEWS.filter((v) => isViewOn(off, v.key)).length;

  return (
    <section ref={section} id="views" className="stack" aria-labelledby="views-title">
      <h2 id="views-title">Views</h2>
      <p className="muted small">
        Each view of the Visualize page can be turned off for this novel, and on again. Off, a view is gone from Visualize and from the links other pages make to it. Nothing is deleted: the records it shows stay on their own pages, its saved views stay, and the checks that read its records still run. Every view reads the novel’s shared records and uses the Visualize frame (filters, saved views, export, markers), which are always there.
      </p>
      <p className="small" role="status" aria-label="Views on">
        {onCount === VIEWS.length ? `All ${VIEWS.length} views are on.` : `${onCount} of ${VIEWS.length} views are on.`}
      </p>
      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      <ul className="module-grid view-modules">
        {VIEW_MODULES.map((m) => {
          const view = VIEWS.find((v) => v.key === m.key)!;
          const on = isViewOn(off, m.key);
          const dependents = neededBy(m.key);
          const count = saved?.filter((s) => s.view === m.key).length ?? 0;
          return (
            <li key={m.key} className={`panel view-module${on ? ' on' : ''}`} aria-label={`${view.label} view`} data-view={m.key}>
              <div className="thread-top">
                <strong className="as-text">{view.label}</strong>
                <span className={`badge view-state state-${on ? 'enabled' : 'disabled'}`}>{on ? 'On' : 'Off'}</span>
              </div>
              <p className="small">{view.description}</p>
              <dl className="view-deps small" aria-label={`What ${view.label} depends on`}>
                <dt>Reads</dt>
                <dd>{m.reads.join(', ')}</dd>
                <dt>Needs</dt>
                <dd>{m.needs?.length ? m.needs.map((n) => `${viewLabel(n.key)}: ${n.why}`).join('; ') : 'No other view'}</dd>
                {dependents.length > 0 && (
                  <>
                    <dt>Needed by</dt>
                    <dd>{dependents.map((d) => viewLabel(d.key)).join(', ')}: it stays on while {dependents.length === 1 ? 'that view is' : 'they are'} on</dd>
                  </>
                )}
                {m.editsHere && (
                  <>
                    <dt>Made only here</dt>
                    <dd>{upper(m.editsHere)}: kept, and still checked, while it is off</dd>
                  </>
                )}
                {m.linkedFrom && (
                  <>
                    <dt>Linked from</dt>
                    <dd>{m.linkedFrom.join(', ')}</dd>
                  </>
                )}
                {count > 0 && (
                  <>
                    <dt>Your saved views of it</dt>
                    <dd>{count}, kept while it is off</dd>
                  </>
                )}
              </dl>
              {blocked?.key === m.key && (
                <div className="notice" role="alert">
                  <p>
                    {view.label} stays on while {names(blocked.by.map((b) => b.key))} {blocked.by.length === 1 ? 'is' : 'are'} on: {blocked.by.map((b) => `${viewLabel(b.key)} needs it, because ${b.why}`).join('; ')}.
                  </p>
                  <div className="actions start wrap">
                    <button type="button" className="btn" disabled={busy} onClick={() => together(m.key, blocked.by.map((b) => b.key))}>
                      Turn off {names([...blocked.by.map((b) => b.key), m.key])}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setBlocked(null)}>
                      Keep {view.label} on
                    </button>
                  </div>
                </div>
              )}
              {writes && (
                <div className="actions start">
                  <button type="button" className={on ? 'btn ghost' : 'btn primary'} disabled={busy} aria-label={`${on ? 'Turn off' : 'Turn on'} the ${view.label} view`} onClick={() => (on ? off_(m.key) : on_(m.key))}>
                    {on ? 'Turn off' : 'Turn on'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {writes && onCount < VIEWS.length && (
        <div className="actions start">
          <button type="button" className="btn" disabled={busy} onClick={() => save(off.filter((k) => !VIEWS.some((v) => v.key === k)), 'Every view is on again, as each was.')}>
            Turn every view on
          </button>
        </div>
      )}
    </section>
  );
}
