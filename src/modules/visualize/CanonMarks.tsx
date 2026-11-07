import { Link } from 'react-router-dom';
import { Check } from '@/modules/codex/components/Check';
import { connectionType } from '@/modules/connections/types';
import { badgeOf, markWords, SOURCE_LABELS, SOURCE_PAGES, STATUS_GLYPHS, WARNING_GLYPH, type Overlay, type OverlayMark } from '@/modules/canon/overlay';
import type { OverlayState } from '@/modules/canon/useOverlay';
import { STATUS_LABELS as BRANCH_LABELS } from '@/modules/branching/types';
import { resolveRef } from '@/modules/model/model';
import { ENTITY_TYPES, type EntityRef, type EntityType, type StoryModel } from '@/modules/model/types';

/** The views that can show canon and continuity markers, and the kinds of record each one draws. */
export const MARKED_VIEWS: Record<string, string[]> = {
  timeline: ['event'],
  graph: ['entry', 'event', 'node', 'thread', 'link', 'relation'],
  relationships: ['entry', 'relation', 'link'],
  plot: ['event', 'node', 'thread'],
};

/** A record's key as marks use it, read back: an ordinary record, a stored connection, or something not drawn. */
function keyRef(key: string): { ref: EntityRef | null; type: string; id: string } {
  const at = key.indexOf(':');
  const [type, id] = [key.slice(0, at), key.slice(at + 1)];
  return { ref: ENTITY_TYPES.includes(type as EntityType) ? { type: type as EntityType, id } : null, type, id };
}

/** What a marked record is called: its name, or for a connection who it joins and how. */
export function markedName(model: StoryModel, key: string): string | null {
  const { ref, type, id } = keyRef(key);
  if (ref) {
    const found = resolveRef(model, ref);
    return found.found ? found.view.label : null;
  }
  if (type !== 'link') return null;
  const link = model.links.find((l) => l.id === id);
  if (!link) return null;
  const end = (t: string | undefined, i: string) => {
    const found = resolveRef(model, { type: (t ?? 'entry') as EntityType, id: i });
    return found.found ? found.view.label : 'something deleted';
  };
  return `${end(link.fromType, link.fromId)} ${(link.type ? connectionType(link.type).label : 'Related to').toLowerCase()} ${end(link.toType, link.toId)}`;
}

/** The same marks as text, in a list or a table cell. */
export function MarkText({ mark }: { mark: OverlayMark | null | undefined }) {
  const words = markWords(mark);
  if (!words) return null;
  const badge = badgeOf(mark)!;
  return (
    <span className="mk-words small">
      <span className={`mk-chip mk-${badge.tone}`} aria-hidden="true">
        {badge.glyph}
      </span>{' '}
      {words} {mark!.warnings.map((w) => `${w.title}: ${w.message}`).join(' ')}
    </span>
  );
}

const TONE_WORDS = [
  { tone: 'critical', words: 'Critical: contradicts something recorded as settled' },
  { tone: 'warning', words: 'Warning: the records may disagree' },
  { tone: 'info', words: 'Info: worth a second look' },
] as const;

interface MarksBarProps {
  view: string;
  on: boolean;
  onChange: (on: boolean) => void;
  state: OverlayState;
  model: StoryModel;
  projectId: string;
  pick: (ref: EntityRef) => void;
}

/**
 * The switch for the markers, and while they are on: what they mean, how
 * many there are, how fresh the manuscript check is, and every marker of
 * this view in words, each with its rule and what it rests on.
 */
export function MarksBar({ view, on, onChange, state, model, projectId, pick }: MarksBarProps) {
  const base = `/project/${projectId}`;
  const types = MARKED_VIEWS[view] ?? [];
  const marked = on && state.overlay ? [...state.overlay].filter(([key, mark]) => types.includes(keyRef(key).type) && (mark.status || mark.warnings.length) && markedName(model, key) !== null && (view !== 'relationships' || keyRef(key).type !== 'entry' || model.entries.get(keyRef(key).id)?.category === 'character')) : [];
  marked.sort((a, b) => markedName(model, a[0])!.localeCompare(markedName(model, b[0])!) || a[0].localeCompare(b[0]));
  const withStatus = marked.filter(([, m]) => m.status).length;
  const toCheck = marked.filter(([, m]) => m.warnings.length).length;
  const forked = model.timeline && model.timeline.status !== 'main' ? model.timeline.status : null;
  const { manuscript } = state;

  return (
    <section className={`stack tight mk-bar${on ? ' on' : ''}`} aria-label="Canon and continuity markers">
      <Check label="Canon and continuity markers" name="Canon and continuity markers" checked={on} onChange={onChange} />
      {on && (
        <>
          <p className="small" role="status">
            {!state.overlay ? 'Reading canon, tracked continuity and your decisions…' : marked.length ? `${marked.length} ${marked.length === 1 ? 'record' : 'records'} marked here: ${withStatus} with a canon status other than Canon, ${toCheck} with something to check.` : 'Nothing to mark here: every record is plain canon, and no check has anything open about it.'}{' '}
            <span className="muted">
              {manuscript.state === 'checking' ? 'Checking the manuscript…' : manuscript.state === 'failed' ? `The manuscript could not be checked (${manuscript.error}); markers from it are left out.` : `Manuscript checked at ${new Date(manuscript.at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
            </span>{' '}
            {manuscript.state !== 'checking' && (
              <button type="button" className="btn ghost small" onClick={state.recheck}>
                Check the manuscript again
              </button>
            )}
          </p>
          {forked && <p className="small notice">This novel is a forked timeline ({BRANCH_LABELS[forked]}). Every marker is about this timeline only.</p>}
          <details className="mk-legend">
            <summary>What the markers mean</summary>
            <ul className="small">
              {(['provisional', 'conflicting', 'retconned', 'non-canon'] as const).map((s) => (
                <li key={s}>
                  <span className="mk-chip mk-status" aria-hidden="true">
                    {STATUS_GLYPHS[s]}
                  </span>{' '}
                  {STATUS_LABELS_FOR[s]}
                </li>
              ))}
              <li>
                <span className="mk-chip mk-status" aria-hidden="true">
                  {STATUS_GLYPHS.alternate}
                </span>{' '}
                Alternate branch: an event of the alternate history shown that goes differently there, or happens only there
              </li>
              {TONE_WORDS.map((t) => (
                <li key={t.tone}>
                  <span className={`mk-chip mk-${t.tone}`} aria-hidden="true">
                    {WARNING_GLYPH}
                  </span>{' '}
                  Something to check. {t.words}. A number counts them.
                </li>
              ))}
            </ul>
            <p className="muted small">Markers show what is recorded; they change nothing. A check’s finding goes when the records change, or when you decide about it on its own page: the record check, the timeline review, canon, or continuity.</p>
          </details>
          {marked.length > 0 && (
            <details className="mk-list">
              <summary>Every marker in words ({marked.length})</summary>
              <ul aria-label="Every marker in words">
                {marked.map(([key, mark]) => {
                  const { ref } = keyRef(key);
                  return (
                    <li key={key}>
                      {ref ? (
                        <button type="button" className="link" onClick={() => pick(ref)}>
                          {markedName(model, key)}
                        </button>
                      ) : (
                        <strong>{markedName(model, key)}</strong>
                      )}{' '}
                      <span className="small">{markWords(mark)}</span>
                      {mark.warnings.length > 0 && (
                        <ul>
                          {mark.warnings.map((w) => (
                            <li key={w.key} className="small">
                              <strong>{w.title}:</strong> {w.message} <span className="muted">The rule: {w.rule} Because: {w.because}</span> <Link to={`${base}/${SOURCE_PAGES[w.source]}`}>{SOURCE_LABELS[w.source]}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

const STATUS_LABELS_FOR = {
  provisional: 'Provisional: a working idea, not settled yet',
  conflicting: 'Conflicting (a connection: Disputed): contradicts something, and waits for your decision',
  retconned: 'Retconned (a connection: Invalid): was true once, and has been replaced',
  'non-canon': 'Non-Canon (a connection: Invalid): deliberately left out of the story',
} as const;

/** In a record's details: its canon status and each open finding, with the rule, what it rests on, and where to decide about it. */
export function MarkSection({ mark, projectId }: { mark: OverlayMark | null | undefined; projectId: string }) {
  if (!mark || (!mark.status && !mark.warnings.length)) return null;
  const base = `/project/${projectId}`;
  return (
    <section className="stack tight mk-section" aria-label="Canon and continuity">
      <h3>Canon and continuity</h3>
      {mark.status && (
        <p className="small">
          <span className="mk-chip mk-status" aria-hidden="true">
            {mark.status.glyph}
          </span>{' '}
          <strong>Canon status: {mark.status.label}.</strong> <span className="muted">{mark.status.hint}</span>
        </p>
      )}
      {mark.warnings.length > 0 && (
        <ul className="mk-findings">
          {mark.warnings.map((w) => (
            <li key={w.key} className="small">
              <p>
                <span className={`thread-status sev-${w.severity}`}>{w.severity === 'critical' ? 'Critical' : w.severity === 'warning' ? 'Warning' : 'Info'}</span> <strong>{w.title}.</strong> {w.message}
              </p>
              <p className="muted">The rule: {w.rule}</p>
              <p className="muted">Because: {w.because}</p>
              <Link to={`${base}/${SOURCE_PAGES[w.source]}`}>Decide about it: {SOURCE_LABELS[w.source]}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A record's mark, by the key marks use. */
export const markOf = (overlay: Overlay | null | undefined, key: string): OverlayMark | undefined => overlay?.get(key);
