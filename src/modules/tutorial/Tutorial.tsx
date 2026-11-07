import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GROUPS, TOPICS, topicFor } from './topics';

const KEY = 'novel-builder:tutorial';

/** Whether the Tutorial button is showing. Kept on this device; it is a preference, not part of any project. */
export function createTutorialStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
  const listeners = new Set<() => void>();
  let shown: boolean | null = null;
  const read = (): boolean => {
    try {
      return storage?.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  };
  return {
    shown: (): boolean => (shown ??= read()),
    setShown(next: boolean) {
      shown = next;
      try {
        storage?.setItem(KEY, next ? 'on' : 'off');
      } catch {
        // kept for this visit only
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
const local = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};
export const tutorial = createTutorialStore(local());
export const useTutorialShown = (): boolean => useSyncExternalStore(tutorial.subscribe, tutorial.shown);

/** The switch that shows or hides the Tutorial button. It appears in the tutorial itself, on the Library and in Project settings. */
export function TutorialToggle({ label = 'Show the Tutorial button' }: { label?: string }) {
  const shown = useTutorialShown();
  return (
    <label className="tutorial-toggle">
      <input type="checkbox" role="switch" checked={shown} aria-label={label} onChange={(e) => tutorial.setShown(e.target.checked)} />
      <span className="tutorial-switch" aria-hidden="true" />
      {label}
    </label>
  );
}

/**
 * The Tutorial button and its panel. The button stays on every screen for
 * as long as it is wanted. The panel opens on the lesson for the page in
 * view, and can be walked through from the start or dipped into by topic.
 * It only explains: nothing in it changes a project.
 */
export function Tutorial() {
  const shown = useTutorialShown();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [listing, setListing] = useState(false);
  const projectId = pathname.startsWith('/project/') ? pathname.split('/')[2] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!shown && !open) return null;
  const index = Math.max(0, TOPICS.findIndex((t) => t.id === topicId));
  const topic = TOPICS[index];
  const here = topicFor(pathname);
  const show = (id: string) => {
    setTopicId(id);
    setListing(false);
  };

  return (
    <>
      {shown && !open && (
        <button
          type="button"
          className="tutorial-button"
          aria-haspopup="dialog"
          onClick={() => {
            // Open on what is in front of the reader.
            show(here.id);
            setOpen(true);
          }}
        >
          <span aria-hidden="true">?</span> Tutorial
        </button>
      )}
      {open && (
        <aside className="tutorial-panel" role="dialog" aria-label="Tutorial">
          <header className="tutorial-head">
            <strong>Tutorial</strong>
            <span className="muted small">
              {index + 1} of {TOPICS.length}
            </span>
            <button type="button" className="btn ghost" aria-expanded={listing} onClick={() => setListing(!listing)}>
              {listing ? 'Back to the lesson' : 'All topics'}
            </button>
            <button type="button" className="btn ghost icon" aria-label="Close the tutorial" onClick={() => setOpen(false)}>
              ✕
            </button>
          </header>

          {listing ? (
            <nav className="tutorial-body" aria-label="Tutorial topics">
              {GROUPS.map((group) => (
                <section key={group}>
                  <h3>{group}</h3>
                  <ul>
                    {TOPICS.filter((t) => t.group === group).map((t) => (
                      <li key={t.id}>
                        <button type="button" className={t.id === topic.id ? 'current' : ''} onClick={() => show(t.id)}>
                          {t.title}
                          {t.id === here.id && <span className="badge">This page</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          ) : (
            <article className="tutorial-body" aria-label={topic.title}>
              <p className="tutorial-group">{topic.group}</p>
              <h2>{topic.title}</h2>
              <p>{topic.what}</p>
              <h3>How to use it</h3>
              <ol>
                {topic.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <h3>Example</h3>
              <p className="tutorial-example">{topic.example}</p>
              {topic.where && <p className="muted small">Where: {topic.where}</p>}
              {topic.page !== undefined &&
                (projectId ? (
                  topicFor(pathname).id !== topic.id && (
                    <Link className="btn" to={`/project/${projectId}${topic.page ? `/${topic.page}` : ''}`}>
                      Take me there
                    </Link>
                  )
                ) : (
                  <p className="muted small">Open a project to try this.</p>
                ))}
            </article>
          )}

          <footer className="tutorial-foot">
            <div className="actions">
              <button type="button" className="btn" disabled={index === 0} onClick={() => show(TOPICS[index - 1].id)}>
                ← Back
              </button>
              <button type="button" className="btn primary" disabled={index === TOPICS.length - 1} onClick={() => show(TOPICS[index + 1].id)}>
                Next →
              </button>
            </div>
            <TutorialToggle />
            {!shown && <p className="muted small">The button will be gone when you close this. Bring it back with the Tutorial switch on the Library or in Project settings.</p>}
          </footer>
        </aside>
      )}
    </>
  );
}
