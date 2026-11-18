// CANON AND CONTINUITY, LAID OVER THE VIEWS (as in the original app): for each record a view draws, what to mark on
// it: its canon status when it is not plain canon, and what the checks found about it and the author has not yet
// decided. The findings come from the checks that already exist, each keeping its own rule and its own words. Pure: it
// reads what it is given, and marks nothing as decided or settled. A port of
// flutter_app/lib/shared/domain/canon/overlay.dart.

import { connectionStatusLabel } from '../codex/screens/connections';
import { type Issue, type Severity, issueCategoryLabels, ruleKindHints, severities } from '../continuity/rules';
import { localeCompare } from '../exchange/collation';
import { str } from '../json';
import { type StoryModel } from '../model/storyModel';
import { type CanonStatus, canonStatusHint, canonStatusLabel } from '../records/canon';
import { stableSorted } from '../reader/stableSort';
import { type ReviewFinding, reviewRuleWords } from '../timeline/review';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type RecordFinding, recordRuleWords } from './checks';
import { type FactReview } from './review';

export type OverlaySource = 'records' | 'timeline' | 'canon' | 'continuity';
export const overlaySourceLabel: Readonly<Record<OverlaySource, string>> = {
  records: 'Record check',
  timeline: 'Timeline review',
  canon: 'Canon',
  continuity: 'Continuity check',
};

export type OverlayWarning = {
  /** The finding's own key: the same one its page keeps decisions under. */
  key: string;
  source: OverlaySource;
  severity: Severity;
  title: string;
  rule: string;
  message: string;
  because: string;
};

/** A status drawn on a record: a mark of its own (never colour alone) and its words. `key` is a canon status's key, or
 * `alternate`. */
export type OverlayStatus = { key: string; label: string; hint: string; glyph: string };

export class OverlayMark {
  status: OverlayStatus | null = null;
  readonly warnings: OverlayWarning[] = [];
}

export const statusGlyphs: Readonly<Record<string, string>> = {
  canon: '',
  provisional: '?',
  conflicting: '≠',
  retconned: '↺',
  'non-canon': '✕',
  alternate: 'A',
};
export const warningGlyph = '!';

/** An alternate history being shown: its events that go differently, and those only it has. */
export type ShownHistory = { name: string; status: string; changed: ReadonlySet<string>; added: ReadonlySet<string> };

/** A canon flag's decision key: every id its own segment (`canon|<fact>|fact|<other>`). */
export function canonKey(factId: string, flagKey: string): string {
  return ['canon', factId, ...flagKey.split(':')].join('|');
}

const canonRule =
  'Statements in play about the same subject should agree with each other and with the codex field they name. Only ' +
  'you decide which one stands.';
const unpairedRule = 'A statement marked Conflicting contradicts another, so the other one is linked, or noticed.';
export const traitRule = 'How the text describes a character should match their codex fields (age, eyes, hair).';

const statusOf = (s: CanonStatus, label: string): OverlayStatus => ({ key: s, label, hint: canonStatusHint[s], glyph: statusGlyphs[s] });

const byWorst = (a: OverlayWarning, b: OverlayWarning) => {
  const c = severities.indexOf(a.severity) - severities.indexOf(b.severity);
  return c !== 0 ? c : localeCompare(a.key, b.key);
};

/** The marks, keyed `event:<id>`, `entry:<id>`, `node:<id>`, `thread:<id>`, `relation:<id>`, `link:<id>` (a stored
 * connection) and `fact:<id>`. Each list given holds only what is still open. `continuity` is null while the
 * manuscript has not been checked. */
export function canonOverlay(
  model: StoryModel,
  args: {
    records: readonly RecordFinding[];
    timeline: readonly ReviewFinding[];
    canon: readonly FactReview[];
    continuity: readonly Issue[] | null;
    history?: ShownHistory | null;
  },
): Map<string, OverlayMark> {
  const overlay = new Map<string, OverlayMark>();
  const at = (key: string) => {
    let m = overlay.get(key);
    if (m === undefined) overlay.set(key, (m = new OverlayMark()));
    return m;
  };
  const warn = (keys: Iterable<string>, warning: OverlayWarning) => {
    for (const key of new Set(keys)) {
      const mark = at(key);
      if (!mark.warnings.some((w) => w.key === warning.key)) mark.warnings.push(warning);
    }
  };
  const history = args.history ?? null;

  // Statuses: events and stored connections have one of their own; an alternate history's events say so.
  for (const event of model.events.values()) {
    const status = event.canon ?? 'canon';
    if (status !== 'canon') {
      at(`event:${event.id}`).status = statusOf(status, canonStatusLabel[status]);
    } else if (history !== null && (history.changed.has(event.id) || history.added.has(event.id))) {
      at(`event:${event.id}`).status = {
        key: 'alternate',
        label:
          `Alternate branch: ${history.added.has(event.id) ? 'happens only in' : 'goes differently in'} ` +
          `“${history.name}” (${history.status})`,
        hint: 'An event of the alternate history shown, not of the main timeline.',
        glyph: statusGlyphs['alternate'],
      };
    }
  }
  for (const link of model.links) {
    const status = link.canon ?? 'canon';
    if (status !== 'canon') at(`link:${link.id}`).status = statusOf(status, connectionStatusLabel(status));
  }

  for (const f of args.records) {
    const words = recordRuleWords[f.rule];
    warn(f.on, { key: f.key, source: 'records', severity: f.severity, title: words.title, rule: words.rule, message: f.message, because: f.because });
  }
  for (const f of args.timeline) {
    const words = reviewRuleWords[f.rule];
    warn([...f.eventIds.map((id) => `event:${id}`), ...f.entryIds.map((id) => `entry:${id}`)], {
      key: f.key,
      source: 'timeline',
      severity: 'warning',
      title: words.title,
      rule: words.rule,
      message: f.message,
      because: f.because,
    });
  }
  for (const review of args.canon) {
    const fact = review.fact;
    const keys = [
      `fact:${fact.id}`,
      ...fact.entryIds.map((id) => `entry:${id}`),
      ...fact.sources.flatMap((s) => {
        const refId = str(s['refId']);
        if (refId.length === 0) return [];
        switch (s['type']) {
          case 'chapter':
            return [`node:${refId}`];
          case 'event':
            return [`event:${refId}`];
          case 'entry':
            return [`entry:${refId}`];
          default:
            return [];
        }
      }),
    ];
    for (const flag of review.flags) {
      const subject = dartTrim(fact.subject);
      warn(keys, {
        key: canonKey(fact.id, flag.key),
        source: 'canon',
        severity: flag.kind === 'unpaired' ? 'info' : 'warning',
        title: flag.kind === 'unpaired' ? 'Conflicting, with nothing paired' : 'Statements that may disagree',
        rule: flag.kind === 'unpaired' ? unpairedRule : canonRule,
        message: flag.message,
        because:
          `The ${dartToLowerCase(canonStatusLabel[fact.status])} statement “${subject.length > 0 ? `${subject}: ` : ''}` +
          `${dartTrim(fact.statement)}”.`,
      });
    }
  }
  for (const issue of args.continuity ?? []) {
    warn([`node:${issue.nodeId}`, ...issue.entryIds.map((id) => `entry:${id}`)], {
      key: issue.key,
      source: 'continuity',
      severity: issue.severity,
      title: issueCategoryLabels[issue.category],
      rule: issue.category === 'trait' ? traitRule : ruleKindHints[issue.category],
      message: issue.message,
      because: `${issue.nodeTitle}, paragraph ${issue.block + 1}: “${issue.excerpt}”`,
    });
  }

  // Most serious first, then in a fixed order, so the same records always read the same.
  for (const mark of overlay.values()) {
    const sorted = stableSorted(mark.warnings, byWorst);
    mark.warnings.splice(0, mark.warnings.length, ...sorted);
  }
  return overlay;
}

/** Several records' marks as one: a plot-board cell, a graph line holding several connections. */
export function mergeMarks(marks: Iterable<OverlayMark | null | undefined>): OverlayMark | null {
  const present = [...marks].filter((m): m is OverlayMark => m !== null && m !== undefined && (m.status !== null || m.warnings.length > 0));
  if (present.length === 0) return null;
  const warnings = new Map<string, OverlayWarning>();
  for (const m of present) for (const w of m.warnings) warnings.set(w.key, w);
  // The status that most needs a look: Conflicting first, then set aside, then provisional, then an alternate branch.
  const order = ['conflicting', 'retconned', 'non-canon', 'provisional', 'alternate'];
  const statuses = stableSorted(
    present.flatMap((m) => (m.status === null ? [] : [m.status])),
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );
  const merged = new OverlayMark();
  merged.status = statuses[0] ?? null;
  merged.warnings.push(...stableSorted([...warnings.values()], byWorst));
  return merged;
}

/** The badge on a drawing: its marks and its tone (the worst finding's severity, or null for the status alone). */
export function badgeOf(mark: OverlayMark | null | undefined): { glyph: string; tone: Severity | null } | null {
  if (mark === null || mark === undefined || (mark.status === null && mark.warnings.length === 0)) return null;
  const count = mark.warnings.length;
  return {
    glyph: `${mark.status?.glyph ?? ''}${count > 0 ? `${warningGlyph}${count > 1 ? count : ''}` : ''}`,
    tone: count > 0 ? mark.warnings[0].severity : null,
  };
}

/** The same, in words, for a screen reader and for every list: "Canon status: Provisional. 2 to check, 1 critical." */
export function markWords(mark: OverlayMark | null | undefined): string {
  if (mark === null || mark === undefined || (mark.status === null && mark.warnings.length === 0)) return '';
  const count = mark.warnings.length;
  const critical = mark.warnings.filter((w) => w.severity === 'critical').length;
  return [
    ...(mark.status !== null ? [`Canon status: ${mark.status.label}.`] : []),
    ...(count > 0 ? [`${count} to check${critical > 0 ? `, ${critical} critical` : ''}.`] : []),
  ].join(' ');
}
