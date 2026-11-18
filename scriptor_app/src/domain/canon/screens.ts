// The pure parts of the timeline review, canon and secrets-and-knowledge pages: what each shows, in the Flutter app's
// words (flutter_app/lib/features/timeline/timeline_review_page.dart, features/review/canon_page.dart and
// features/review/knowledge_page.dart). The screens draw these; the changes are CanonChanges' and the decisions
// CanonService's.

import { type Awareness, type KnowledgeRecord, awarenessLabel } from '../characters/characterRecords';
import { type KnowledgeAxis, type Spread } from '../characters/knowledge';
import { localeCompare } from '../exchange/collation';
import { str } from '../json';
import { type CanonFact, type CanonStatus, canonStatusLabel, canonStatusOf } from '../records/canon';
import { type ReviewDecision, reviewDecisionLabel } from '../records/review';
import { stableSorted } from '../reader/stableSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type FactReview } from './review';
import { factKindLabels, factSources, notesOf, statusOrder } from './facts';

// ------------------------------------------------------------------------------------------------- the World's words

/** The Flutter app calls the world's records "the Codex"; Scriptor calls that part World. The canon pages' words were
 * ported as they are and are shown with Scriptor's name in these exact phrases. */
const worldPhrases: readonly (readonly [string, string])[] = [
  ['codex profile', 'World profile'],
  ['A codex entry that was removed', 'A World entry that was removed'],
  ['Codex entry', 'World entry'],
  ['codex entry', 'World entry'],
];

/** Text as Scriptor says it (World, not the Codex). */
export function inScriptorWords(text: string): string {
  let s = text;
  for (const [flutter, scriptor] of worldPhrases) s = s.split(flutter).join(scriptor);
  return s;
}

// ------------------------------------------------------------------------------------------------ timeline review

/** Reasons offered when a finding is marked intentional; the author's own words are just as welcome. */
export const intentionalReasons: readonly string[] = [
  'A double or impostor',
  'Magic or a portal',
  'Time travel',
  'The record is wrong in the story itself',
  'Flashback sequence',
  'Disguise',
  'Magic illusion',
  'Dream or vision',
  'Remembered, not present',
  'Unreliable narrator',
];

export function decisionWord(d: ReviewDecision): string {
  return d === 'dismissed' ? 'Dismissed' : reviewDecisionLabel[d];
}

export function timelineReviewSubtitle(open: number, findings: number, events: number): string {
  return (
    `${open === 0 ? 'Nothing to look at' : `${open} to look at`} · ${findings - open} decided · checked ` +
    `${events} ${events === 1 ? 'event' : 'events'}`
  );
}

export const timelineReviewWords = {
  title: 'Timeline review',
  allClear: 'Nothing to look at',
  allClearMessage:
    'The dates, ages and places in the timeline agree with each other and with the travel times you have recorded.',
  toResolve: 'To resolve, fix the record:',
  intentional: 'Mark as intentional…',
  dismiss: 'Dismiss',
  decided: 'Decided',
  decidedCaption: 'Findings you have marked intentional or dismissed. They stay decided while the records stay the same.',
  reopen: 'Reopen',
  gone: 'No longer raised: the records have changed since',
  removeDecision: 'Remove this decision',
  reasonTitle: 'Why is this intentional?',
  reasonHint: 'A double, a portal, a lie in the record…',
  saveIntentional: 'Save as intentional',
} as const;

// ----------------------------------------------------------------------------------------------------------- canon

export type CanonFilters = { query: string; status: CanonStatus | null; kind: string | null; about: string | null };

/** Whether a statement shows under the filters: the search reads its subject, wording, notes, past wordings and
 * quotes. */
export function canonMatches(f: CanonFact, filters: CanonFilters): boolean {
  const query = dartToLowerCase(dartTrim(filters.query));
  const text = [
    f.subject,
    f.statement,
    notesOf(f),
    ...f.history.map((h) => str(h['statement'])),
    ...factSources(f).map((s) => s.quote),
  ].join(' ');
  return (
    (query.length === 0 || dartToLowerCase(text).includes(query)) &&
    (filters.status === null || f.status === filters.status) &&
    (filters.kind === null || f.kind === filters.kind) &&
    (filters.about === null || f.entryIds.includes(filters.about))
  );
}

/** The entries some statement is about, by name: the "About" filter's choices. */
export function aboutChoices(facts: readonly CanonFact[], names: ReadonlyMap<string, string>): string[] {
  const ids = [...new Set(facts.flatMap((f) => f.entryIds))].filter((id) => names.has(id));
  return stableSorted(ids, (a, b) => localeCompare(names.get(a)!, names.get(b)!));
}

/** The statements shown, under each status in turn (only statuses with something). */
export function canonGroups(shown: readonly FactReview[]): { status: CanonStatus; heading: string; reviews: FactReview[] }[] {
  return statusOrder
    .map((s) => ({ status: s, reviews: shown.filter((r) => r.fact.status === s) }))
    .filter((g) => g.reviews.length > 0)
    .map((g) => ({ ...g, heading: `${canonStatusLabel[g.status]} (${g.reviews.length})` }));
}

/** A statement's card: its wording, then its kind, its sources (or that a canon one has none) and its flags. */
export function canonCardLines(r: FactReview): { title: string; statement: string; details: string } {
  const sources = factSources(r.fact).length;
  return {
    title: r.fact.subject,
    statement: dartTrim(r.fact.statement).length === 0 ? 'No statement yet' : r.fact.statement,
    details: [
      factKindLabels[r.fact.kind] ?? r.fact.kind,
      ...(sources > 0
        ? [`${sources} ${sources === 1 ? 'source' : 'sources'}`]
        : r.fact.status === 'canon'
          ? ['No source recorded yet']
          : []),
      ...(r.flags.length > 0
        ? [`${r.flags.length} possible ${r.flags.length === 1 ? 'contradiction' : 'contradictions'}`]
        : []),
    ].join(' · '),
  };
}

/** A pair of statements that may disagree, in words. */
export function pairWords(p: { a: CanonFact; b: CanonFact; stated: boolean }): string {
  return (
    `“${p.a.statement}” (${canonStatusLabel[p.a.status]}) and “${p.b.statement}” (${canonStatusLabel[p.b.status]}) ` +
    `${p.stated ? 'are linked by you as contradicting' : 'appear to conflict'}.`
  );
}

/** A step of a statement's history, in words. */
export function historyStepWords(step: Record<string, unknown>): string {
  const label = (v: unknown, fallback: string) => {
    const s = canonStatusOf(v);
    return s === null ? fallback : canonStatusLabel[s];
  };
  switch (step['kind']) {
    case 'created':
      return `Recorded as ${label(step['toStatus'], 'Provisional')}`;
    case 'status':
      return `${label(step['fromStatus'], '?')} → ${label(step['toStatus'], '?')}`;
    case 'retcon':
      return `Retconned: “${str(step['statement'])}” became “${str(step['newStatement'])}”`;
    default:
      return `Reworded: “${str(step['statement'])}” became “${str(step['newStatement'])}”`;
  }
}

export const canonWords = {
  title: 'Canon',
  newStatement: 'New statement',
  contradictions: 'Possible contradictions',
  observations:
    'These are observations, not rulings. Confirm, retcon, mark as Conflicting, set aside or ignore them: nothing ' +
    'changes until you change it.',
  search: 'Search facts',
  searchHint: 'Facts, past wordings and quotes…',
  emptyTitle: 'What is true in your world',
  emptyMessage:
    'Record the statements your story relies on (a founding date, a rule of magic, who is whose heir) and where each ' +
    'is established. Then the checks can tell you when something seems to disagree.',
  noMatch: 'No facts match these filters.',
  fact: 'Canon fact',
  close: 'Close details',
  openOther: 'Open the other',
  setAside: 'Set aside',
  onlyObservation:
    'This is only an observation. Whether to confirm one, retcon the other, mark them Conflicting or leave both as ' +
    'they are is yours to decide.',
  bringBack: (n: number) => `Bring back what was set aside (${n})`,
  subject: 'Subject',
  subjectHint: 'What this is about',
  statement: 'Statement',
  statementHint: 'What is claimed, as one clear sentence.',
  revise: 'Revise the statement…',
  status: 'Canon status',
  replacedBy: 'Replaced by',
  notReplaced: 'Not linked to a replacement',
  kind: 'Kind',
  about: 'About',
  addAbout: 'Add a character or entry this is about…',
  sources: 'Sources: where this is established',
  noSources: 'Link the chapter, scene or World entry that makes this true, so you can always check it.',
  sourceKind: 'Kind of source',
  source: 'Source',
  quote: 'Quote',
  quoteHint: 'The words that establish it (finds the paragraph)',
  sourceNote: 'Source description',
  sourceNoteHint: 'e.g. Series bible, p. 12',
  addSource: 'Add the source',
  contradicts: 'Contradicts (your own links)',
  linkConflict: 'Link a statement this contradicts…',
  history: 'Canon history',
  notes: 'Notes',
  notesHint: 'Open questions, implications, things to check.',
  authority: 'You are the authority here. Nothing changes a status but you.',
  delete: 'Delete…',
  deleteTitle: 'Delete fact',
  deleteMessage: (subject: string) =>
    `Delete “${subject}” and its whole history? To keep the record, mark it Non-Canon or Retconned instead.`,
  deleteConfirm: 'Delete fact and history',
  reviseTitle: 'Revise the statement',
  reviseNote: (status: CanonStatus) =>
    `It is on the record as ${canonStatusLabel[status]}: the wording it has now is kept in its history.`,
  newWording: 'New statement',
  reason: 'Reason for the change',
  reasonHint: 'Why is this changing?',
  minor: 'Only a correction of wording (a typo, a clearer phrase), not a retcon',
  correct: 'Correct the wording',
  retcon: 'Retcon it',
} as const;

// -------------------------------------------------------------------------------------------- secrets and knowledge

/** A state in two letters as well as words, so a cell never says it by colour alone. */
export const knowledgeCodes: Readonly<Record<Awareness, string>> = {
  knows: 'K',
  partial: 'P',
  believes: 'B',
  suspects: 'S',
  falseBelief: 'F',
  unaware: 'U',
};

/** A state in words, with what is believed. */
export function awarenessWords(s: Awareness | null | undefined, belief = ''): string {
  return s === null || s === undefined
    ? 'Not recorded'
    : `${awarenessLabel[s]}${dartTrim(belief).length > 0 ? ` (“${dartTrim(belief)}”)` : ''}`;
}

/** A point's heading in the spread: its label and what happens there. */
export function pointHeading(p: Spread['points'][number]): string {
  return `${p.label}${p.marks.includes('first') ? ' · first figures' : ''}${p.marks.includes('reveal') ? ' · comes out' : ''}`;
}

/** A cell, in words and in its two letters (with ! where they act on it). */
export function cellWords(
  name: string,
  pointLabel: string,
  cell: { record: KnowledgeRecord | null; needs: readonly unknown[] },
): { code: string; label: string } {
  const state = cell.record?.state ?? null;
  return {
    code: `${state === null ? '—' : knowledgeCodes[state]}${cell.needs.length > 0 ? ' !' : ''}`,
    label:
      `${name} at ${pointLabel}: ${awarenessWords(state, cell.record?.belief ?? '')}` +
      `${cell.needs.length > 0 ? ', acts on it here' : ''}`,
  };
}

export const knowledgeWords = {
  title: 'Secrets and knowledge',
  emptyTitle: 'No secrets yet',
  emptyMessage: 'Add one on a character’s Secrets tab, then record there who knows it, where and how.',
  which: 'Which secret',
  along: 'Along',
  whatIsTrue: 'What is true: ',
  notWritten: 'Not written yet.',
  recordOn: (owner: string) => `Record who knows it on ${owner}’s Secrets tab`,
  whoKnows: 'Who knows what now',
  spreads: (axis: KnowledgeAxis) => `How it spreads, ${axis === 'reading' ? 'as the reader goes' : 'in story time'}`,
  nothingPlaced: (axis: KnowledgeAxis) =>
    `Nothing about this secret is placed at a ${axis === 'reading' ? 'chapter or scene' : 'event'} yet, so there is ` +
    'nothing to draw along this axis. Who knows what now is above.',
  who: 'Who',
  now: 'Now',
  legend:
    'In each cell, the record in force there: K knows, P knows part of it, B believes it, S suspects, F believes ' +
    'something false, U unaware, — nothing recorded yet. An outline marks a record placed at that very point; ! marks ' +
    'that they act on it there. Tap a cell for the record it rests on.',
  inForce: (words: string) => `In force from: ${words}.`,
  noneInForce: 'No record of theirs is in force here.',
  recordedHere: (words: string) => `Recorded here: ${words}.`,
  actsOn: (note: string) => `Acts on it here${dartTrim(note).length > 0 ? `: “${dartTrim(note)}”` : ''}.`,
  toldWhom: 'Who told whom',
  unplaced: (name: string, axis: KnowledgeAxis, words: string) =>
    `${name}: also in their history, with no ${axis === 'reading' ? 'chapter or scene' : 'event'}: ${words}.`,
  checks: 'Checks',
  nothing: 'Nothing to look at.',
  reasonHint: 'A bluff, a lucky guess, a lie in the record…',
} as const;
