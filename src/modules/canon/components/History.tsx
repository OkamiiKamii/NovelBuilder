import { SavedText } from '@/shared/SavedText';
import { STATUS_LABELS, type CanonFact, type FactChange } from '../types';

export const when = (at: number): string => new Date(at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export interface HistoryItem {
  fact: CanonFact;
  change: FactChange;
}

/** Every step of the given facts' histories, oldest first. */
export const historyOf = (facts: CanonFact[]): HistoryItem[] =>
  facts
    .flatMap((fact) => fact.history.map((change, index) => ({ fact, change, index })))
    .sort((a, b) => a.change.at - b.change.at || a.index - b.index)
    .map(({ fact, change }) => ({ fact, change }));

function Step({ change }: { change: FactChange }) {
  if (change.kind === 'created') {
    return (
      <p>
        Recorded as <strong>{STATUS_LABELS[change.toStatus ?? 'provisional']}</strong>
        {change.statement.trim() && <>: “{change.statement}”</>}
      </p>
    );
  }
  if (change.kind === 'status') {
    return (
      <p>
        Moved from <strong>{STATUS_LABELS[change.fromStatus!]}</strong> to <strong>{STATUS_LABELS[change.toStatus!]}</strong>
      </p>
    );
  }
  return (
    <p>
      {change.kind === 'retcon' ? <span className="thread-status cs-retconned">Retconned</span> : <span className="muted">Reworded</span>} <s>“{change.statement}”</s> → “{change.newStatement}”
    </p>
  );
}

interface HistoryProps {
  items: HistoryItem[];
  /** Name the fact on each step: for a timeline covering several facts. */
  showSubject?: boolean;
  /** When given, the reason on each step can be added to. */
  onAnnotate?: (item: HistoryItem, reason: string) => void;
}

/** How facts changed while the book was written. Steps are never removed. */
export function History({ items, showSubject, onAnnotate }: HistoryProps) {
  return (
    <ol className="canon-history" aria-label="Canon history">
      {items.map((item) => (
        <li key={item.change.id} className={`ch-${item.change.kind}`}>
          <time dateTime={new Date(item.change.at).toISOString()} className="muted small">
            {when(item.change.at)}
            {showSubject && <strong> · {item.fact.subject}</strong>}
          </time>
          <Step change={item.change} />
          {onAnnotate ? (
            <SavedText key={item.change.id} hideLabel label={`Reason for the change on ${when(item.change.at)}`} value={item.change.reason} placeholder="Why? Add a note…" onSave={(reason) => onAnnotate(item, reason)} />
          ) : (
            item.change.reason.trim() && <p className="muted small">{item.change.reason}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
