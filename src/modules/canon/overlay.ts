import { CATEGORY_LABELS, KIND_HINTS, SEVERITIES, type Issue, type Severity } from '@/modules/continuity/types';
import { CONNECTION_STATUS_LABELS } from '@/modules/integrity/rules';
import type { StoryModel } from '@/modules/model/types';
import { RULE_TEXT, type ReviewFinding } from '@/modules/timeline/review';
import { RECORD_RULE_TEXT, type RecordFinding } from './checks';
import type { FactReview } from './review';
import { STATUS_HINTS, STATUS_LABELS, type CanonStatus } from './types';

/**
 * CANON AND CONTINUITY, LAID OVER THE VIEWS
 * For each record a view draws, what to mark on it: its canon status when it
 * is not plain canon, and what the checks found about it and the author has
 * not yet decided. The findings come from the checks that already exist,
 * each keeping its own rule and its own words:
 *  - the record check's rules for structured records (`checks.ts`);
 *  - the timeline review (dates, ages, travel, two places at once);
 *  - the canon review (statements that may disagree);
 *  - the continuity check of the manuscript against tracked rules.
 * Pure: it reads what it is given, and marks nothing as decided or settled.
 */

export type OverlaySource = 'records' | 'timeline' | 'canon' | 'continuity';
export const SOURCE_LABELS: Record<OverlaySource, string> = { records: 'Record check', timeline: 'Timeline review', canon: 'Canon', continuity: 'Continuity check' };
/** Where each kind of finding is decided about: kept intentional, dismissed, or reopened. */
export const SOURCE_PAGES: Record<OverlaySource, string> = { records: 'integrity', timeline: 'timeline/review', canon: 'canon', continuity: 'continuity' };

export interface OverlayWarning {
  /** The finding's own key: the same one its page keeps decisions under. */
  key: string;
  source: OverlaySource;
  severity: Severity;
  title: string;
  /** The rule, in words. */
  rule: string;
  message: string;
  /** The data it rests on, in words. */
  because: string;
}

/** A status drawn on a record: a mark of its own (never colour alone) and its words. */
export interface OverlayStatus {
  key: CanonStatus | 'alternate';
  label: string;
  hint: string;
  glyph: string;
}

export interface OverlayMark {
  status: OverlayStatus | null;
  warnings: OverlayWarning[];
}

/** Keyed `event:<id>`, `entry:<id>`, `node:<id>`, `thread:<id>`, `relation:<id>`, `link:<id>` (a stored connection) and `fact:<id>`. */
export type Overlay = Map<string, OverlayMark>;

export const STATUS_GLYPHS: Record<CanonStatus | 'alternate', string> = { canon: '', provisional: '?', conflicting: '≠', retconned: '↺', 'non-canon': '✕', alternate: 'A' };
export const WARNING_GLYPH = '!';

/** An alternate history being shown: its events that go differently, and those only it has. */
export interface ShownHistory {
  name: string;
  status: string;
  changed: ReadonlySet<string>;
  added: ReadonlySet<string>;
}

/** A canon flag's decision key: every id its own segment, so a copy of the novel re-points it (`canon|<fact>|fact|<other>`). */
export const canonKey = (factId: string, flagKey: string): string => ['canon', factId, ...flagKey.split(':')].join('|');

export interface OverlayInput {
  /** Each list holds only what is still open: decided findings are left out before they come here. */
  records: RecordFinding[];
  timeline: ReviewFinding[];
  canon: FactReview[];
  /** Null while the manuscript has not been checked. */
  continuity: Issue[] | null;
  history?: ShownHistory | null;
}

const CANON_RULE = 'Statements in play about the same subject should agree with each other and with the codex field they name. Only you decide which one stands.';
const UNPAIRED_RULE = 'A statement marked Conflicting contradicts another, so the other one is linked, or noticed.';
const TRAIT_RULE = 'How the text describes a character should match their codex fields (age, eyes, hair).';
const statusOf = (key: CanonStatus, label: string): OverlayStatus => ({ key, label, hint: STATUS_HINTS[key], glyph: STATUS_GLYPHS[key] });

export function canonOverlay(model: StoryModel, { records, timeline, canon, continuity, history }: OverlayInput): Overlay {
  const overlay: Overlay = new Map();
  const at = (key: string) => {
    if (!overlay.has(key)) overlay.set(key, { status: null, warnings: [] });
    return overlay.get(key)!;
  };
  const warn = (keys: string[], warning: OverlayWarning) => {
    for (const key of new Set(keys)) {
      const mark = at(key);
      if (!mark.warnings.some((w) => w.key === warning.key)) mark.warnings.push(warning);
    }
  };

  // Statuses: events and stored connections have one of their own; an alternate history's events say so.
  for (const event of model.events.values()) {
    const canonStatus = event.canon ?? 'canon';
    if (canonStatus !== 'canon') at(`event:${event.id}`).status = statusOf(canonStatus, STATUS_LABELS[canonStatus]);
    else if (history && (history.changed.has(event.id) || history.added.has(event.id))) at(`event:${event.id}`).status = { key: 'alternate', label: `Alternate branch: ${history.added.has(event.id) ? 'happens only in' : 'goes differently in'} “${history.name}” (${history.status})`, hint: 'An event of the alternate history shown, not of the main timeline.', glyph: STATUS_GLYPHS.alternate };
  }
  for (const link of model.links) {
    const canonStatus = link.canon ?? 'canon';
    if (canonStatus !== 'canon') at(`link:${link.id}`).status = statusOf(canonStatus, CONNECTION_STATUS_LABELS[canonStatus]);
  }

  for (const f of records) warn(f.on, { key: f.key, source: 'records', severity: f.severity, title: RECORD_RULE_TEXT[f.rule].title, rule: RECORD_RULE_TEXT[f.rule].rule, message: f.message, because: f.because });
  for (const f of timeline) warn([...f.eventIds.map((id) => `event:${id}`), ...f.entryIds.map((id) => `entry:${id}`)], { key: f.key, source: 'timeline', severity: f.severity, title: RULE_TEXT[f.rule].title, rule: RULE_TEXT[f.rule].rule, message: f.message, because: f.because });
  for (const { fact, flags } of canon) {
    const keys = [`fact:${fact.id}`, ...fact.entryIds.map((id) => `entry:${id}`), ...fact.sources.flatMap((s) => (s.refId && s.type === 'chapter' ? [`node:${s.refId}`] : s.refId && s.type === 'event' ? [`event:${s.refId}`] : s.refId && s.type === 'entry' ? [`entry:${s.refId}`] : []))];
    for (const flag of flags) {
      warn(keys, {
        key: canonKey(fact.id, flag.key),
        source: 'canon',
        severity: flag.kind === 'unpaired' ? 'info' : 'warning',
        title: flag.kind === 'unpaired' ? 'Conflicting, with nothing paired' : 'Statements that may disagree',
        rule: flag.kind === 'unpaired' ? UNPAIRED_RULE : CANON_RULE,
        message: flag.message,
        because: `The ${STATUS_LABELS[fact.status].toLowerCase()} statement “${fact.subject.trim() ? `${fact.subject.trim()}: ` : ''}${fact.statement.trim()}”.`,
      });
    }
  }
  for (const issue of continuity ?? []) {
    warn([`node:${issue.nodeId}`, ...issue.entryIds.map((id) => `entry:${id}`)], {
      key: issue.key,
      source: 'continuity',
      severity: issue.severity,
      title: CATEGORY_LABELS[issue.category],
      rule: issue.category === 'trait' ? TRAIT_RULE : KIND_HINTS[issue.category],
      message: issue.message,
      because: `${issue.nodeTitle}, paragraph ${issue.block + 1}: “${issue.excerpt}”`,
    });
  }

  // Most serious first, then in a fixed order, so the same records always read the same.
  for (const mark of overlay.values()) mark.warnings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.key.localeCompare(b.key));
  return overlay;
}

/** Several records' marks as one: a plot-board cell, a graph line holding several connections. */
export function mergeMarks(marks: (OverlayMark | undefined)[]): OverlayMark | null {
  const present = marks.filter((m): m is OverlayMark => Boolean(m && (m.status || m.warnings.length)));
  if (!present.length) return null;
  const warnings = new Map<string, OverlayWarning>();
  for (const m of present) for (const w of m.warnings) warnings.set(w.key, w);
  // The status that most needs a look: Conflicting first, then set aside, then provisional, then an alternate branch.
  const order: OverlayStatus['key'][] = ['conflicting', 'retconned', 'non-canon', 'provisional', 'alternate'];
  const statuses = present.flatMap((m) => (m.status ? [m.status] : [])).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { status: statuses[0] ?? null, warnings: [...warnings.values()].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.key.localeCompare(b.key)) };
}

/** The badge on a drawing: its marks and its tone, the worst finding, or the status alone. */
export function badgeOf(mark: OverlayMark | null | undefined): { glyph: string; tone: Severity | 'status' } | null {
  if (!mark || (!mark.status && !mark.warnings.length)) return null;
  const count = mark.warnings.length;
  return { glyph: `${mark.status?.glyph ?? ''}${count ? `${WARNING_GLYPH}${count > 1 ? count : ''}` : ''}`, tone: count ? mark.warnings[0].severity : 'status' };
}

/** The same, in words, for a screen reader and for every list: "Canon status: Provisional. 2 to check, 1 critical." */
export function markWords(mark: OverlayMark | null | undefined): string {
  if (!mark || (!mark.status && !mark.warnings.length)) return '';
  const count = mark.warnings.length;
  const critical = mark.warnings.filter((w) => w.severity === 'critical').length;
  return [mark.status ? `Canon status: ${mark.status.label}.` : '', count ? `${count} to check${critical ? `, ${critical} critical` : ''}.` : ''].filter(Boolean).join(' ');
}
