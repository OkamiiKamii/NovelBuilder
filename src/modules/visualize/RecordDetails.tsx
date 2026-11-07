import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { detailsOf, routeFor } from '@/modules/model/navigate';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { DetailPanel } from '@/modules/viz/components/DetailPanel';

interface RecordDetailsProps {
  projectId: string;
  model: StoryModel;
  selected: EntityRef;
  onSelect: (ref: EntityRef) => void;
  onClose: () => void;
  /** Where the record is opened instead of its usual page: an event of an alternate history is opened there. */
  destination?: { to: string; label: string; state?: unknown };
  /** More for this record, shown under its link: the event editor on the drawn timeline. */
  extra?: ReactNode;
  /** Its canon status and open findings, while the markers are on. */
  marks?: ReactNode;
}

/**
 * The details of whatever is selected, the same for every view: its facts,
 * a link to the page where it is kept, and everything it is connected to,
 * each one selectable in turn. Nobody has to go through a drawing to reach
 * an ordinary record's details.
 */
export function RecordDetails({ projectId, model, selected, onSelect, onClose, destination: override, extra, marks }: RecordDetailsProps) {
  const details = detailsOf(model, selected);
  if (!details) {
    return (
      <DetailPanel title="Record not found" onClose={onClose}>
        <p>This record is no longer in this novel; it may have been deleted. Nothing else has changed.</p>
        <button type="button" className="btn" onClick={onClose}>
          Clear the selection
        </button>
      </DetailPanel>
    );
  }
  const destination = override ?? routeFor(projectId, model, selected);
  return (
    <DetailPanel title={details.view.label} onClose={onClose}>
      <div className="stack viz-record">
        {destination && (
          <Link to={destination.to} state={destination.state} className="btn">
            {destination.label}
          </Link>
        )}
        {extra}
        {marks}
        {details.facts.length > 0 && (
          <dl className="viz-facts">
            {details.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {details.groups.length === 0 && <p className="muted small">Nothing is connected to this yet.</p>}
        {details.groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3>{group.title}</h3>
            <ul className="viz-related">
              {group.items.map((item) => (
                <li key={`${item.ref.type}:${item.ref.id}:${item.note}`}>
                  <button type="button" className="link" onClick={() => onSelect(item.ref)}>
                    {item.label}
                  </button>
                  {item.note && <span className="muted small"> · {item.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DetailPanel>
  );
}
