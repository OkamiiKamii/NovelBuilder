import { abilityTree, pathProblems, type ProblemKind } from '@/modules/abilities/paths';
import { checkRecords, RECORD_RULE_TEXT, type RecordRule } from '@/modules/canon/checks';
import { canonKey } from '@/modules/canon/overlay';
import { reviewCanon } from '@/modules/canon/review';
import { STATUS_LABELS, type CanonFact } from '@/modules/canon/types';
import { checkKnowledge, KNOWLEDGE_RULE_TEXT } from '@/modules/characters/knowledge';
import type { CharacterSecret } from '@/modules/characters/types';
import { OTHER_CHECKS } from '@/modules/continuity/audit';
import { KIND_HINTS, type ContinuityRule, type Issue, type IssueCategory, type Resolution, type Severity } from '@/modules/continuity/types';
import { brokenReferences, duplicateCandidates, unfitEntries, unresolvedFields, unsuitedKinds } from '@/modules/integrity/rules';
import { resolveRef } from '@/modules/model/model';
import type { EntityRef, EntityType, StoryModel } from '@/modules/model/types';
import type { WorldMap, MapPin } from '@/modules/places/types';
import type { ProgressSnapshot } from '@/modules/progression/types';
import type { StructureMarker } from '@/modules/structure/types';
import { RULE_TEXT, reviewTimeline, type ReviewRule } from '@/modules/timeline/review';
import { travelProblems, type TravelProblemKind } from '@/modules/travel/routes';
import type { TravelSettings } from '@/modules/travel/types';
import { encodeSelection } from '@/modules/viz/params';

/**
 * THE CONTINUITY REVIEW, GATHERED
 * Every warning the app's deterministic checks raise, in one shape: its
 * severity, its category, whether it is a confirmed data error or a possible
 * inconsistency, its rule, the data it rests on, the records it is about,
 * and where to see it in context. Nothing is checked here that a check does
 * not already check: each keeps its own rule, and raises a finding only when
 * the records hold what that rule needs. Pure: it reads, and changes nothing.
 */

export const REVIEW_SOURCES = ['records', 'integrity', 'timeline', 'canon', 'knowledge', 'travel', 'abilities', 'continuity'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];
export const SOURCE_TEXT: Record<ReviewSource, { label: string; page: string; what: string }> = {
  records: { label: 'Record check: canon and continuity rules', page: 'integrity', what: 'what the structured records say about each other (Prompt 42)' },
  integrity: { label: 'Record check: references, values, duplicates', page: 'integrity', what: 'references to deleted records, fields that name nothing, values that do not fit, records that look alike' },
  timeline: { label: 'Timeline review', page: 'timeline/review', what: 'dates, ages, travel times, being in two places at once' },
  canon: { label: 'Canon', page: 'canon', what: 'canon statements that may disagree, with each other or with a codex field' },
  knowledge: { label: 'Secrets and knowledge', page: 'visualize/knowledge', what: 'characters acting on, or learning, what they are recorded as not knowing' },
  travel: { label: 'Journeys', page: 'visualize/journeys', what: 'journeys against their dates, speeds and each other' },
  abilities: { label: 'Ability paths', page: 'visualize/abilities', what: 'requirements, exclusions and loops between abilities' },
  continuity: { label: 'Continuity check of the manuscript', page: 'continuity', what: 'the text against tracked rules and codex fields, matched by words' },
};

/** The difference the review keeps: a confirmed data error, or a possible inconsistency. */
export type Certainty = 'error' | 'possible';
export const CERTAINTY_TEXT: Record<Certainty, { label: string; hint: string }> = {
  error: { label: 'Confirmed data error', hint: 'The records, as stored, cannot all be right: a value that is impossible or names nothing, or records that certainly contradict each other. Whether the story should change is still yours to decide.' },
  possible: { label: 'Possible inconsistency', hint: 'Read from wording or likeness, or something that may well be meant. The records may agree after all.' },
};

export const REVIEW_CATEGORIES = ['canon', 'characters', 'dates', 'connections', 'places', 'items', 'abilities', 'knowledge', 'references', 'values', 'duplicates'] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];
export const CATEGORY_TEXT: Record<ReviewCategory, string> = {
  canon: 'Canon status and statements',
  characters: 'Characters and their status',
  dates: 'Dates and time',
  connections: 'Connections and relationships',
  places: 'Places and travel',
  items: 'Items and possession',
  abilities: 'Abilities and powers',
  knowledge: 'Secrets and knowledge',
  references: 'References and links',
  values: 'Values and fields',
  duplicates: 'Records that look alike',
};

export interface Warning {
  /** The finding's own key: its decision is kept under it, and its own page reads the same one. */
  key: string;
  source: ReviewSource;
  severity: Severity;
  certainty: Certainty;
  category: ReviewCategory;
  title: string;
  /** The rule, in words. */
  rule: string;
  message: string;
  /** The data it rests on, in words. */
  because: string;
  /** The records it is about, to open. */
  refs: EntityRef[];
  /** Other places to open it: a canon statement, a passage, a character's secrets. */
  links: { label: string; to: string; state?: unknown }[];
  /** Where to see it in a visualization, with the canon and continuity markers on. */
  context: { label: string; to: string } | null;
}

export interface ReviewInput {
  model: StoryModel;
  facts: CanonFact[];
  rules: ContinuityRule[];
  markers: StructureMarker[];
  /** Aliases from character profiles, for look-alike names. */
  aliases: ReadonlyMap<string, string[]>;
  secrets: CharacterSecret[];
  travel: { settings: TravelSettings | null; maps: WorldMap[]; pins: MapPin[] };
  snapshots: ProgressSnapshot[];
  /** Every finding of the manuscript check, decided or not; null while it has not run. */
  manuscript: Issue[] | null;
}

const RECORD_CATEGORY: Record<RecordRule, ReviewCategory> = { 'rests-on': 'canon', 'still-told': 'canon', opposed: 'connections', 'after-death': 'characters', 'ends-first': 'dates', calendar: 'dates', gone: 'references', replacement: 'canon' };
const TIMELINE_CATEGORY: Record<ReviewRule, ReviewCategory> = { dates: 'dates', follows: 'dates', anchor: 'references', calendar: 'dates', ages: 'characters', born: 'characters', travel: 'places', 'two-places': 'places' };
const ISSUE_CATEGORY: Record<IssueCategory, ReviewCategory> = { status: 'characters', possession: 'items', travel: 'places', power: 'abilities', trait: 'characters' };
const TRAVEL_RULES: Record<TravelProblemKind, { title: string; rule: string }> = {
  backwards: { title: 'Arrives before leaving', rule: 'A journey cannot arrive before it leaves.' },
  'too-fast': { title: 'Too fast for its dates', rule: 'At the speed you set for the way they travel, the distance takes at least so long; the dates must allow it.' },
  duration: { title: 'A length its dates or speed cannot hold', rule: 'How long a journey is said to take must fit its dates, and its speed.' },
  order: { title: 'Leaves before the journey it comes after', rule: 'A journey set to come after another cannot leave before that one.' },
  'two-journeys': { title: 'Two journeys at once', rule: 'One traveller cannot be on two journeys at the same time.' },
  'event-during': { title: 'At an event elsewhere while travelling', rule: 'A traveller cannot take part in an event elsewhere (not on the way, or inside a place on it) during a journey.' },
  'two-places': { title: 'In two places over the same time', rule: 'Located in two places over the same time, neither inside the other, needs an explanation the records may not give.' },
  departure: { title: 'Leaves from somewhere else', rule: 'A traveller usually leaves from where they last arrived; otherwise a journey may be missing.' },
  elsewhere: { title: 'At an event elsewhere between journeys', rule: 'While staying somewhere between journeys, an event elsewhere suggests a journey may be missing.' },
};
const PATH_RULES: Record<ProblemKind, { title: string; rule: string }> = {
  cycle: { title: 'Requirements in a cycle', rule: 'An ability cannot require itself, through others or directly; blueprint items cannot branch from each other in a loop.' },
  loop: { title: 'A loop of changes', rule: 'A loop of upgrades, evolutions, fusions or replacements may be meant (a form taken and left again); it is said so it is not missed.' },
  conflict: { title: 'Requires what is excluded', rule: 'An ability cannot require two things that exclude each other, or something it excludes.' },
  unreachable: { title: 'Can never be gained', rule: 'An ability whose requirements can never be met, with no alternative that can, can never be gained.' },
  fusion: { title: 'A fusion of one thing', rule: 'A fusion joins several abilities into one; one alone may be a slip.' },
  rule: { title: 'A rule that cannot be read', rule: 'A requirement rule must name things the system has.' },
  holder: { title: 'A holder without what it requires', rule: 'A holder should hold what an ability requires, or two things that exclude each other, unless it became this one (upgraded, evolved…).' },
};
const TRAIT_RULE = 'How the text describes a character should match their codex fields (age, eyes, hair).';
const VIEW_WORDS: Record<string, string> = { timeline: 'timeline', relationships: 'relationship map', plot: 'plot board', graph: 'knowledge graph' };

export function collectWarnings(projectId: string, input: ReviewInput): Warning[] {
  const { model } = input;
  const base = `/project/${projectId}`;
  const out: Warning[] = [];
  const found = (ref: EntityRef) => resolveRef(model, ref).found;
  const refsOf = (refs: EntityRef[]) => {
    const seen = new Set<string>();
    return refs.filter((r) => found(r) && !seen.has(`${r.type}:${r.id}`) && Boolean(seen.add(`${r.type}:${r.id}`)));
  };
  /** The view that shows a record best, with its markers on and the record selected. */
  const contextFor = (refs: EntityRef[]): Warning['context'] => {
    const pick = refs.find((r) => r.type === 'event') ?? refs.find((r) => r.type === 'relation') ?? refs.find((r) => r.type === 'entry' || r.type === 'node') ?? refs.find((r) => r.type === 'thread');
    if (!pick) return null;
    const view = pick.type === 'event' ? 'timeline' : pick.type === 'relation' ? 'relationships' : pick.type === 'thread' ? 'plot' : 'graph';
    return { label: `See it on the ${VIEW_WORDS[view]}`, to: `${base}/visualize/${view}?${new URLSearchParams({ marks: '1', select: encodeSelection(pick) })}` };
  };
  const add = (w: Omit<Warning, 'refs' | 'context' | 'links'> & { refs: EntityRef[]; links?: Warning['links']; context?: Warning['context'] }) => {
    const refs = refsOf(w.refs);
    out.push({ ...w, refs, links: w.links ?? [], context: w.context === undefined ? contextFor(refs) : w.context });
  };

  // The record check: canon and continuity rules.
  for (const f of checkRecords(model, { facts: input.facts, rules: input.rules })) {
    const facts = f.on.filter((k) => k.startsWith('fact:')).map((k) => k.slice(5));
    add({ key: f.key, source: 'records', severity: f.severity, certainty: 'error', category: RECORD_CATEGORY[f.rule], title: RECORD_RULE_TEXT[f.rule].title, rule: RECORD_RULE_TEXT[f.rule].rule, message: f.message, because: f.because, refs: f.refs, links: [...facts.map((id) => ({ label: 'Open the canon statement', to: `${base}/canon?fact=${id}` })), ...(f.rule === 'after-death' ? [{ label: 'Open the tracked status', to: `${base}/continuity?tab=tracked` }] : [])] });
  }

  // The record check: references, values, look-alikes.
  const holder = (table: string, rowId: string): EntityRef[] => {
    if (table === 'timelineEvents') return [{ type: 'event', id: rowId }];
    if (table === 'plotThreads') return [{ type: 'thread', id: rowId }];
    if (table === 'chapterPlans' || table === 'chapters') return [{ type: 'node', id: rowId }];
    if (table === 'loreEntries') return [{ type: 'entry', id: rowId }];
    if (table === 'characterRelations') return [{ type: 'relation', id: rowId }];
    if (table === 'loreLinks') {
      const link = model.links.find((l) => l.id === rowId);
      return link ? [{ type: (link.fromType ?? 'entry') as EntityType, id: link.fromId }, { type: (link.toType ?? 'entry') as EntityType, id: link.toId }] : [];
    }
    if (table === 'progressChanges') {
      const owner = model.progress.find((c) => c.id === rowId)?.entryId;
      return owner ? [{ type: 'entry', id: owner }] : [];
    }
    if (table === 'journeys') return (model.journeys.find((j) => j.id === rowId)?.travellerIds ?? []).map((id) => ({ type: 'entry' as const, id }));
    return [];
  };
  for (const b of brokenReferences(model, input.markers)) {
    add({ key: b.key, source: 'integrity', severity: 'warning', certainty: 'error', category: 'references', title: 'A reference to a record that no longer exists', rule: 'A reference must name a record that exists.', message: `${b.says}.`, because: `Kept in ${b.where}; the ${b.missing.type === 'node' ? 'chapter or scene' : b.missing.type === 'entry' ? 'codex entry' : b.missing.type} it names has been deleted.`, refs: holder(b.table, b.rowId), links: b.table === 'structureMarkers' ? [{ label: 'Open the structural markers', to: `${base}/visualize/structure` }] : [] });
  }
  for (const u of unresolvedFields(model)) {
    add({ key: u.key, source: 'integrity', severity: 'warning', certainty: 'error', category: 'references', title: 'A field that names nothing', rule: 'A field that refers to an entry (“Leader”, “Owner”) must hold an entry, not words.', message: `${u.entry.name}: “${u.fieldName}” holds the words “${u.value}”, not an entry.`, because: u.suggestions.length ? `Entries with that name: ${u.suggestions.map((s) => s.name).join(', ')}.` : 'No entry has that name.', refs: [{ type: 'entry', id: u.entry.id }] });
  }
  for (const u of unfitEntries(model)) {
    add({ key: u.key, source: 'integrity', severity: 'warning', certainty: 'error', category: 'values', title: 'Values that do not fit their fields', rule: 'Each value fits its field: a required field is filled in, a number is in its range, a date is a date, a choice is one of the choices, a link names an entry of its kind.', message: `${u.entry.name}: ${u.issues.length === 1 ? 'a value does' : `${u.issues.length} values do`} not fit ${u.issues.length === 1 ? 'its field' : 'their fields'}.`, because: u.issues.map((i) => `${i.field}: ${i.message}`).join(' '), refs: [{ type: 'entry', id: u.entry.id }] });
  }
  for (const u of unsuitedKinds(model)) {
    add({ key: u.key, source: 'integrity', severity: 'info', certainty: 'error', category: 'values', title: 'A view set up on fields that no longer suit', rule: 'A view a kind of record is set up for names fields that can fill it: still there, not archived, of a type the view reads.', message: `${u.category.name}: ${u.problems.length === 1 ? 'a view setting no longer suits' : `${u.problems.length} view settings no longer suit`}.`, because: u.problems.join(' '), refs: [], links: [{ label: 'Open the Codex', to: `${base}/codex` }], context: null });
  }
  for (const d of duplicateCandidates([...model.entries.values()], input.aliases)) {
    add({ key: d.key, source: 'integrity', severity: 'info', certainty: 'possible', category: 'duplicates', title: 'Records that look like duplicates', rule: 'Two entries of the same kind whose names are the same once capitals, accents, punctuation and a leading “The” are set aside, or one named as the other’s alias.', message: `${d.a.name} and ${d.b.name} may be the same.`, because: d.because, refs: [{ type: 'entry', id: d.a.id }, { type: 'entry', id: d.b.id }] });
  }

  // The timeline review.
  for (const f of reviewTimeline(model, input.rules)) {
    add({ key: f.key, source: 'timeline', severity: f.severity, certainty: 'error', category: TIMELINE_CATEGORY[f.rule], title: RULE_TEXT[f.rule].title, rule: RULE_TEXT[f.rule].rule, message: f.message, because: f.because, refs: [...f.eventIds.map((id) => ({ type: 'event' as const, id })), ...f.entryIds.map((id) => ({ type: 'entry' as const, id }))], links: f.ruleId ? [{ label: 'Open the travel time', to: `${base}/continuity?tab=tracked` }] : [] });
  }

  // Canon statements: as the canon review flags them.
  for (const { fact, flags } of reviewCanon(input.facts, [...model.entries.values()], [...model.nodes.values()], (key) => model.categories.get(key)).reviews) {
    const sources = fact.sources.flatMap((s): EntityRef[] => (!s.refId ? [] : s.type === 'chapter' ? [{ type: 'node', id: s.refId }] : s.type === 'event' ? [{ type: 'event', id: s.refId }] : s.type === 'entry' ? [{ type: 'entry', id: s.refId }] : []));
    for (const flag of flags) {
      // Linked by the author as contradicting, or marked Conflicting with nothing paired: confirmed. Noticed from wording: possible.
      const stated = flag.kind === 'unpaired' || (flag.kind === 'fact' && !flag.dismiss);
      add({ key: canonKey(fact.id, flag.key), source: 'canon', severity: flag.kind === 'unpaired' ? 'info' : 'warning', certainty: stated ? 'error' : 'possible', category: 'canon', title: flag.kind === 'unpaired' ? 'Conflicting, with nothing paired' : flag.kind === 'field' ? 'A statement that may differ from a codex field' : stated ? 'Statements you linked as contradicting' : 'Statements that may disagree', rule: flag.kind === 'unpaired' ? 'A statement marked Conflicting contradicts another, so the other one is linked, or noticed.' : 'Statements in play about the same subject should agree with each other and with the codex field they name. Only you decide which one stands.', message: flag.message, because: `The ${STATUS_LABELS[fact.status].toLowerCase()} statement “${fact.subject.trim() ? `${fact.subject.trim()}: ` : ''}${fact.statement.trim()}”.`, refs: [...fact.entryIds.map((id) => ({ type: 'entry' as const, id })), ...sources], links: [{ label: 'Open the statement', to: `${base}/canon?fact=${fact.id}` }] });
    }
  }

  // Secrets and knowledge.
  for (const f of checkKnowledge(input.secrets, model)) {
    add({ key: f.key, source: 'knowledge', severity: 'warning', certainty: 'error', category: 'knowledge', title: KNOWLEDGE_RULE_TEXT[f.rule].title, rule: KNOWLEDGE_RULE_TEXT[f.rule].rule, message: f.message, because: f.because, refs: [{ type: 'entry', id: f.ownerId }, ...f.characterIds.map((id) => ({ type: 'entry' as const, id }))], links: model.entries.has(f.ownerId) ? [{ label: `Open ${model.entries.get(f.ownerId)!.name}’s secrets`, to: `${base}/characters/${f.ownerId}/secrets` }] : [], context: { label: 'See it in Secrets and knowledge', to: `${base}/visualize/knowledge?${new URLSearchParams({ ksecret: f.secretId })}` } });
  }

  // Journeys.
  for (const p of travelProblems(model, model.journeys, input.travel.settings, input.travel.maps, input.travel.pins)) {
    const travellers = [...new Set(p.journeyIds.flatMap((id) => model.journeys.find((j) => j.id === id)?.travellerIds ?? []))];
    add({ key: p.key, source: 'travel', severity: p.severity === 'problem' ? 'warning' : 'info', certainty: p.severity === 'problem' ? 'error' : 'possible', category: 'places', title: TRAVEL_RULES[p.kind].title, rule: TRAVEL_RULES[p.kind].rule, message: p.message, because: p.severity === 'problem' ? 'The journeys’ own dates, places and speeds, taken at their most generous reading.' : 'The journeys and events as recorded; the story may explain it.', refs: travellers.map((id) => ({ type: 'entry' as const, id })), context: { label: 'See it in Journeys', to: `${base}/visualize/journeys` } });
  }

  // Ability paths.
  const tree = abilityTree(model, input.snapshots);
  const nodeRef = new Map(tree.nodes.map((n) => [n.key, n.ref]));
  for (const p of pathProblems(tree, model)) {
    add({ key: p.key, source: 'abilities', severity: p.severity === 'problem' ? 'warning' : 'info', certainty: p.severity === 'problem' ? 'error' : 'possible', category: 'abilities', title: PATH_RULES[p.kind].title, rule: PATH_RULES[p.kind].rule, message: p.message, because: 'The paths recorded between these abilities.', refs: p.nodes.flatMap((k) => (nodeRef.has(k) ? [nodeRef.get(k)!] : [])), context: { label: 'See it in Ability paths', to: `${base}/visualize/abilities` } });
  }

  // The manuscript, matched by words: always possible, never confirmed.
  for (const issue of input.manuscript ?? []) {
    add({ key: issue.key, source: 'continuity', severity: issue.severity, certainty: 'possible', category: ISSUE_CATEGORY[issue.category], title: issue.category === 'trait' ? 'The text and a codex field' : `The text and a tracked rule: ${issue.category === 'status' ? 'character status' : issue.category === 'possession' ? 'item possession' : issue.category === 'travel' ? 'travel time' : 'power or magic'}`, rule: issue.category === 'trait' ? TRAIT_RULE : KIND_HINTS[issue.category], message: issue.message, because: `${issue.nodeTitle}, paragraph ${issue.block + 1}: “${issue.excerpt}”`, refs: [{ type: 'node', id: issue.nodeId }, ...issue.entryIds.map((id) => ({ type: 'entry' as const, id }))], links: [{ label: 'Open the passage', to: `${base}/manuscript/${issue.nodeId}`, state: { jump: { term: issue.match, block: issue.block } } }] });
  }

  return out;
}

export type ReviewStatus = 'open' | Resolution['kind'];

export interface ReviewItem extends Warning {
  decision: Resolution | null;
  status: ReviewStatus;
}

/**
 * Each warning with the author's decision about it, and the decisions whose
 * warning is no longer raised (the records changed since). Decisions about
 * the manuscript are judged gone only once the manuscript has been checked.
 */
export function withStatus(warnings: Warning[], decisions: Resolution[], manuscriptChecked: boolean): { items: ReviewItem[]; gone: Resolution[] } {
  const byKey = new Map(decisions.map((d) => [d.key, d]));
  const keys = new Set(warnings.map((w) => w.key));
  return {
    items: warnings.map((w) => ({ ...w, decision: byKey.get(w.key) ?? null, status: byKey.get(w.key)?.kind ?? 'open' })),
    gone: decisions.filter((d) => !keys.has(d.key) && (manuscriptChecked || OTHER_CHECKS.some((prefix) => d.key.startsWith(prefix)))),
  };
}
