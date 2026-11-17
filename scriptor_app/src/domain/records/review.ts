// The author's decisions about continuity and canon findings (`continuityResolutions`). A port of
// flutter_app/lib/shared/domain/records/review.dart.

import { idOrNull, str } from '../json';
import { JsonRecord } from './jsonRecord';

/** What the author decided about a finding. Stored in the row's `kind`. */
export type ReviewDecision = 'review' | 'resolved' | 'intentional' | 'dismissed';
export const reviewDecisions: readonly ReviewDecision[] = ['review', 'resolved', 'intentional', 'dismissed'];

export const reviewDecisionLabel: Readonly<Record<ReviewDecision, string>> = {
  review: 'Needs review',
  resolved: 'Resolved',
  intentional: 'Intentional',
  dismissed: 'Ignored',
};

/** A decision takes its finding off the open lists, except "needs review", which keeps it there, flagged. */
export function decisionCloses(decision: ReviewDecision): boolean {
  return decision !== 'review';
}

/** A review item: the author's decision about a finding, kept under the finding's own key so it holds on every run.
 * Removing it brings the finding back. Nothing here changes prose or canon. */
export class ReviewItem extends JsonRecord {
  /** The key of the finding it answers. */
  get key(): string {
    return str(this.raw['key']);
  }
  get decision(): ReviewDecision {
    return reviewDecisions.find((d) => d === this.raw['kind']) ?? 'review';
  }
  /** Why, in the author's words ("Flashback sequence", "Disguise"). */
  get note(): string {
    return str(this.raw['note']);
  }
  /** What the finding said when it was decided, so the decision can be read if the text moves on. */
  get message(): string {
    return str(this.raw['message']);
  }
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
}
