import type { Undecided } from '@/modules/model/query';
import type { EntityType } from '@/modules/model/types';

const NOUNS: Record<EntityType, [string, string]> = {
  node: ['chapter or scene', 'chapters and scenes'],
  entry: ['entry', 'entries'],
  event: ['event', 'events'],
  thread: ['plot thread', 'plot threads'],
  relation: ['relationship', 'relationships'],
  ability: ['ability', 'abilities'],
};

/**
 * What a view says about records a filter could not decide on, one line per
 * reason: "3 events not shown: no date that can be worked out." Nothing a
 * view leaves out for want of data goes unmentioned.
 */
export function undecidedLines(undecided: Undecided[]): string[] {
  return undecided.map(({ reason, refs }) => {
    const types = [...new Set(refs.map((r) => r.type))];
    const one = refs.length === 1;
    const what = types.length === 1 ? NOUNS[types[0]][one ? 0 : 1] : one ? 'record' : 'records';
    return `${refs.length.toLocaleString()} ${what} not shown: ${reason}.`;
  });
}

/** "Showing 40 of 1,200" when a view shows part of what there is; null when it shows everything. */
export function limitedLine(shown: number, total: number): string | null {
  return shown < total ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()}` : null;
}
