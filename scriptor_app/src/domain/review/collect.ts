// THE CONTINUITY REVIEW, GATHERED (as in the original app). A port of
// flutter_app/lib/shared/domain/review/collect.dart.
//
// Every warning the app's deterministic checks raise, in one shape: its severity, its category, whether it is a
// confirmed data error or a possible inconsistency, its rule, the data it rests on, the records it is about, and where
// to see it in context. Nothing is checked here that a check does not already check: each keeps its own rule, and
// raises a finding only when the records hold what that rule needs. Pure: it reads, and changes nothing.
//
// Paths are the Flutter app's (as the golden keeps them); the screens map them onto Scriptor's routes.

import { abilityTree, pathProblems, type ProblemKind } from '../abilities/paths';
import { checkRecords, type RecordRule, recordRuleWords } from '../canon/checks';
import { factSources } from '../canon/facts';
import { reviewCanon } from '../canon/review';
import type { CharacterSecret } from '../characters/characterRecords';
import { checkKnowledge, knowledgeRuleWords } from '../characters/knowledge';
import { otherChecks } from '../continuity/audit';
import { type ContinuityRule, type Issue, type IssueCategory, type RuleKind, ruleKindHints, type Severity } from '../continuity/rules';
import type { JsonMap } from '../json';
import { EntityRef, type EntityType } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import type { MapPin, WorldMap } from '../places/places';
import type { ProgressSnapshot } from '../progression/snapshots';
import { canonStatusLabel, type CanonFact } from '../records/canon';
import type { ReviewItem } from '../records/review';

import { type ReviewRule, reviewRuleWords, reviewTimeline } from '../timeline/review';
import { travelProblems } from '../travel/routes';
import type { TravelSettings } from '../travel/travel';
import { duplicateCandidates, brokenReferences, kindWords, unfitEntries, unresolvedFields, unsuitedKinds } from '../integrity/rules';
import { dartToLowerCase, dartTrim } from '../text/dartString';


// ----------------------------------------------------------------------------------------------------- sources

export type ReviewSource = 'records' | 'integrity' | 'timeline' | 'canon' | 'knowledge' | 'travel' | 'abilities' | 'continuity';

/** In the Dart enum's order. */
export const reviewSources: readonly ReviewSource[] = ['records', 'integrity', 'timeline', 'canon', 'knowledge', 'travel', 'abilities', 'continuity'];

export const reviewSourceWords: Readonly<Record<ReviewSource, { label: string; page: string; what: string }>> = {
  records: { label: 'Record check: canon and continuity rules', page: '/review/records', what: 'what the structured records say about each other' },
  integrity: {
    label: 'Record check: references, values, duplicates',
    page: '/review/records',
    what: 'references to deleted records, fields that name nothing, values that do not fit, records that look alike',
  },
  timeline: { label: 'Timeline review', page: '/review/timeline', what: 'dates, ages, travel times, being in two places at once' },
  canon: { label: 'Canon', page: '/review/canon', what: 'canon statements that may disagree, with each other or with a codex field' },
  knowledge: {
    label: 'Secrets and knowledge',
    page: '/visualize/knowledge',
    what: 'characters acting on, or learning, what they are recorded as not knowing',
  },
  travel: { label: 'Journeys', page: '/visualize/journeys', what: 'journeys against their dates, speeds and each other' },
  abilities: { label: 'Ability paths', page: '/visualize/abilities', what: 'requirements, exclusions and loops between abilities' },
  continuity: {
    label: 'Continuity check of the manuscript',
    page: '/review/continuity',
    what: 'the text against tracked rules and codex fields, matched by words',
  },
};

/** The difference the review keeps: a confirmed data error, or a possible inconsistency. */
export type Certainty = 'error' | 'possible';
export const certainties: readonly Certainty[] = ['error', 'possible'];
export const certaintyWords: Readonly<Record<Certainty, { label: string; hint: string }>> = {
  error: {
    label: 'Confirmed data error',
    hint:
      'The records, as stored, cannot all be right: a value that is impossible or names nothing, or records that ' +
      'certainly contradict each other. Whether the story should change is still yours to decide.',
  },
  possible: {
    label: 'Possible inconsistency',
    hint: 'Read from wording or likeness, or something that may well be meant. The records may agree after all.',
  },
};

export type ReviewCategory =
  | 'canon'
  | 'characters'
  | 'dates'
  | 'connections'
  | 'places'
  | 'items'
  | 'abilities'
  | 'knowledge'
  | 'references'
  | 'fieldValues'
  | 'duplicates';

/** In the Dart enum's order. */
export const reviewCategories: readonly ReviewCategory[] = [
  'canon',
  'characters',
  'dates',
  'connections',
  'places',
  'items',
  'abilities',
  'knowledge',
  'references',
  'fieldValues',
  'duplicates',
];

export const reviewCategoryLabel: Readonly<Record<ReviewCategory, string>> = {
  canon: 'Canon status and statements',
  characters: 'Characters and their status',
  dates: 'Dates and time',
  connections: 'Connections and relationships',
  places: 'Places and travel',
  items: 'Items and possession',
  abilities: 'Abilities and powers',
  knowledge: 'Secrets and knowledge',
  references: 'References and links',
  fieldValues: 'Values and fields',
  duplicates: 'Records that look alike',
};

/** The original app's name for it (`values` for fieldValues). */
export const reviewCategoryKey = (c: ReviewCategory): string => (c === 'fieldValues' ? 'values' : c);

/** A place to open: a route of the Flutter app (the screens map it). */
export type ReviewLink = { label: string; path: string };

/** Where to see a warning in a visualization, with the canon and continuity marks on and its record selected. */
export type ReviewContext = { label: string; path: string; select: EntityRef | null };

export class Warning {
  constructor(
    /** The finding's own key: its decision is kept under it, and its own page reads the same one. */
    readonly key: string,
    readonly source: ReviewSource,
    readonly severity: Severity,
    readonly certainty: Certainty,
    readonly category: ReviewCategory,
    readonly title: string,
    /** The rule, in words. */
    readonly rule: string,
    readonly message: string,
    /** The data it rests on, in words. */
    readonly because: string,
    /** The records it is about, to open. */
    readonly refs: readonly EntityRef[],
    readonly links: readonly ReviewLink[],
    readonly context: ReviewContext | null,
  ) {}

  toJson(): JsonMap {
    return {
      key: this.key,
      source: this.source,
      severity: this.severity,
      certainty: this.certainty,
      category: reviewCategoryKey(this.category),
      title: this.title,
      rule: this.rule,
      message: this.message,
      because: this.because,
      refs: this.refs.map((r) => r.toJson()),
      links: this.links.map((l) => ({ label: l.label, to: l.path })),
      context: this.context === null ? null : { label: this.context.label, to: this.context.path },
    };
  }
}

export type ReviewInput = {
  model: StoryModel;
  facts?: readonly CanonFact[];
  rules?: readonly ContinuityRule[];
  markers?: readonly JsonMap[];
  /** Aliases from character profiles, for look-alike names. */
  aliases?: ReadonlyMap<string, readonly string[]>;
  secrets?: readonly CharacterSecret[];
  travel?: TravelSettings | null;
  maps?: readonly WorldMap[];
  pins?: readonly MapPin[];
  snapshots?: readonly ProgressSnapshot[];
  /** Every finding of the manuscript check, decided or not; null while it has not run. */
  manuscript?: readonly Issue[] | null;
};

const recordCategory: Readonly<Record<RecordRule, ReviewCategory>> = {
  restsOn: 'canon',
  stillTold: 'canon',
  opposed: 'connections',
  afterDeath: 'characters',
  endsFirst: 'dates',
  calendar: 'dates',
  gone: 'references',
  replacement: 'canon',
};
const timelineCategory: Readonly<Record<ReviewRule, ReviewCategory>> = {
  dates: 'dates',
  follows: 'dates',
  anchor: 'references',
  calendar: 'dates',
  ages: 'characters',
  born: 'characters',
  travel: 'places',
  'two-places': 'places',
};
const issueCategory: Readonly<Record<IssueCategory, ReviewCategory>> = {
  status: 'characters',
  possession: 'items',
  travel: 'places',
  power: 'abilities',
  trait: 'characters',
};

export const travelRules: Readonly<Record<string, { title: string; rule: string }>> = {
  backwards: { title: 'Arrives before leaving', rule: 'A journey cannot arrive before it leaves.' },
  'too-fast': {
    title: 'Too fast for its dates',
    rule: 'At the speed you set for the way they travel, the distance takes at least so long; the dates must allow it.',
  },
  duration: { title: 'A length its dates or speed cannot hold', rule: 'How long a journey is said to take must fit its dates, and its speed.' },
  order: { title: 'Leaves before the journey it comes after', rule: 'A journey set to come after another cannot leave before that one.' },
  'two-journeys': { title: 'Two journeys at once', rule: 'One traveller cannot be on two journeys at the same time.' },
  'event-during': {
    title: 'At an event elsewhere while travelling',
    rule: 'A traveller cannot take part in an event elsewhere (not on the way, or inside a place on it) during a journey.',
  },
  'two-places': {
    title: 'In two places over the same time',
    rule: 'Located in two places over the same time, neither inside the other, needs an explanation the records may not ' + 'give.',
  },
  departure: { title: 'Leaves from somewhere else', rule: 'A traveller usually leaves from where they last arrived; otherwise a journey may be missing.' },
  elsewhere: {
    title: 'At an event elsewhere between journeys',
    rule: 'While staying somewhere between journeys, an event elsewhere suggests a journey may be missing.',
  },
};

export const pathRules: Readonly<Record<ProblemKind, { title: string; rule: string }>> = {
  cycle: {
    title: 'Requirements in a cycle',
    rule: 'An ability cannot require itself, through others or directly; blueprint items cannot branch from each other in ' + 'a loop.',
  },
  loop: {
    title: 'A loop of changes',
    rule:
      'A loop of upgrades, evolutions, fusions or replacements may be meant (a form taken and left again); it is said ' + 'so it is not missed.',
  },
  conflict: { title: 'Requires what is excluded', rule: 'An ability cannot require two things that exclude each other, or something it excludes.' },
  unreachable: {
    title: 'Can never be gained',
    rule: 'An ability whose requirements can never be met, with no alternative that can, can never be gained.',
  },
  fusion: { title: 'A fusion of one thing', rule: 'A fusion joins several abilities into one; one alone may be a slip.' },
  rule: { title: 'A rule that cannot be read', rule: 'A requirement rule must name things the system has.' },
  holder: {
    title: 'A holder without what it requires',
    rule:
      'A holder should hold what an ability requires, or two things that exclude each other, unless it became this ' +
      'one (upgraded, evolved…).',
  },
};

const viewWords: Readonly<Record<string, string>> = {
  timeline: 'timeline',
  relationships: 'relationship map',
  plot: 'plot board',
  graph: 'knowledge graph',
};

/** A canon flag's key, as the canon page and the marks read it (canon/overlay.dart's canonKey). */
export function canonKey(factId: string, flagKey: string): string {
  return ['canon', factId, ...flagKey.split(':')].join('|');
}

/** The rule a codex-field finding of the manuscript check rests on (canon/overlay.dart's traitRule). */
export const traitRule = 'How the text describes a character should match their codex fields (age, eyes, hair).';

export function collectWarnings(input: ReviewInput): Warning[] {
  const model = input.model;
  const facts = input.facts ?? [];
  const rules = input.rules ?? [];
  const out: Warning[] = [];
  const found = (ref: EntityRef) => model.resolve(ref) !== null;
  const refsOf = (refs: readonly EntityRef[]) => {
    const seen = new Set<string>();
    return refs.filter((r) => {
      if (!found(r)) return false;
      const k = `${r.type}:${r.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  /** The view that shows a record best, with its marks on and the record selected. */
  const contextFor = (refs: readonly EntityRef[]): ReviewContext | null => {
    const pick =
      refs.find((r) => r.type === 'event') ??
      refs.find((r) => r.type === 'relation') ??
      refs.find((r) => r.type === 'entry' || r.type === 'node') ??
      refs.find((r) => r.type === 'thread') ??
      null;
    if (pick === null) return null;
    const view = pick.type === 'event' ? 'timeline' : pick.type === 'relation' ? 'relationships' : pick.type === 'thread' ? 'plot' : 'graph';
    return { label: `See it on the ${viewWords[view]}`, path: view === 'relationships' ? '/visualize' : `/visualize/${view}`, select: pick };
  };

  const add = (args: {
    key: string;
    source: ReviewSource;
    severity: Severity;
    certainty: Certainty;
    category: ReviewCategory;
    title: string;
    rule: string;
    message: string;
    because: string;
    refs: readonly EntityRef[];
    links?: readonly ReviewLink[];
    context?: (refs: readonly EntityRef[]) => ReviewContext | null;
  }) => {
    const kept = refsOf(args.refs);
    out.push(
      new Warning(
        args.key,
        args.source,
        args.severity,
        args.certainty,
        args.category,
        args.title,
        args.rule,
        args.message,
        args.because,
        kept,
        args.links ?? [],
        args.context !== undefined ? args.context(kept) : contextFor(kept),
      ),
    );
  };

  // The record check: canon and continuity rules.
  for (const f of checkRecords(model, { facts, rules })) {
    const factIds = f.on.filter((k) => k.startsWith('fact:')).map((k) => k.substring(5));
    add({
      key: f.key,
      source: 'records',
      severity: f.severity,
      certainty: 'error',
      category: recordCategory[f.rule],
      title: recordRuleWords[f.rule].title,
      rule: recordRuleWords[f.rule].rule,
      message: f.message,
      because: f.because,
      refs: f.refs,
      links: [
        ...factIds.map((id) => ({ label: 'Open the canon statement', path: `/review/canon?fact=${id}` })),
        ...(f.rule === 'afterDeath' ? [{ label: 'Open the tracked status', path: '/review/continuity?tab=tracked' }] : []),
      ],
    });
  }

  // The record check: references, values, look-alikes.
  const holder = (table: string, rowId: string): EntityRef[] => {
    switch (table) {
      case 'timelineEvents':
        return [new EntityRef('event', rowId)];
      case 'plotThreads':
        return [new EntityRef('thread', rowId)];
      case 'chapterPlans':
      case 'chapters':
        return [new EntityRef('node', rowId)];
      case 'loreEntries':
        return [new EntityRef('entry', rowId)];
      case 'characterRelations':
        return [new EntityRef('relation', rowId)];
      case 'loreLinks': {
        const link = model.links.find((l) => l.id === rowId);
        return link === undefined ? [] : [link.from, link.to];
      }
      case 'progressChanges': {
        const owner = model.progress.find((c) => c.id === rowId)?.entryId;
        return owner === undefined ? [] : [new EntityRef('entry', owner)];
      }
      case 'journeys':
        return (model.journeys.find((j) => j.id === rowId)?.travellerIds ?? []).map((id) => new EntityRef('entry', id));
    }
    return [];
  };
  for (const b of brokenReferences(model, input.markers ?? [])) {
    add({
      key: b.key,
      source: 'integrity',
      severity: 'warning',
      certainty: 'error',
      category: 'references',
      title: 'A reference to a record that no longer exists',
      rule: 'A reference must name a record that exists.',
      message: `${b.says}.`,
      because: `Kept in ${b.where}; the ${kindWords(b.missing.type as EntityType)} it names has been deleted.`,
      refs: holder(b.table, b.rowId),
      links: b.table === 'structureMarkers' ? [{ label: 'Open the structural markers', path: '/visualize/structure' }] : [],
    });
  }
  for (const u of unresolvedFields(model)) {
    add({
      key: u.key,
      source: 'integrity',
      severity: 'warning',
      certainty: 'error',
      category: 'references',
      title: 'A field that names nothing',
      rule: 'A field that refers to an entry (“Leader”, “Owner”) must hold an entry, not words.',
      message: `${u.entry.name}: “${u.fieldName}” holds the words “${u.value}”, not an entry.`,
      because: u.suggestions.length > 0 ? `Entries with that name: ${u.suggestions.map((s) => s.name).join(', ')}.` : 'No entry has that name.',
      refs: [new EntityRef('entry', u.entry.id)],
    });
  }
  for (const u of unfitEntries(model)) {
    const n = u.issues.length;
    add({
      key: u.key,
      source: 'integrity',
      severity: 'warning',
      certainty: 'error',
      category: 'fieldValues',
      title: 'Values that do not fit their fields',
      rule:
        'Each value fits its field: a required field is filled in, a number is in its range, a date is a date, a ' +
        'choice is one of the choices, a link names an entry of its kind.',
      message: `${u.entry.name}: ${n === 1 ? 'a value does' : `${n} values do`} not fit ` + `${n === 1 ? 'its field' : 'their fields'}.`,
      because: u.issues.map((i) => `${i.field}: ${i.message}`).join(' '),
      refs: [new EntityRef('entry', u.entry.id)],
    });
  }
  for (const u of unsuitedKinds(model)) {
    const n = u.problems.length;
    add({
      key: u.key,
      source: 'integrity',
      severity: 'info',
      certainty: 'error',
      category: 'fieldValues',
      title: 'A view set up on fields that no longer suit',
      rule:
        'A view a kind of record is set up for names fields that can fill it: still there, not archived, of a type ' + 'the view reads.',
      message: `${u.category.name}: ${n === 1 ? 'a view setting no longer suits' : `${n} view settings no longer suit`}.`,
      because: u.problems.join(' '),
      refs: [],
      links: [{ label: 'Open Categories & fields', path: '/organize/world/kinds' }],
      context: () => null,
    });
  }
  for (const d of duplicateCandidates([...model.entries.values()], input.aliases ?? new Map())) {
    add({
      key: d.key,
      source: 'integrity',
      severity: 'info',
      certainty: 'possible',
      category: 'duplicates',
      title: 'Records that look like duplicates',
      rule:
        'Two entries of the same kind whose names are the same once capitals, accents, punctuation and a leading ' +
        '“The” are set aside, or one named as the other’s alias.',
      message: `${d.a.name} and ${d.b.name} may be the same.`,
      because: d.because,
      refs: [new EntityRef('entry', d.a.id), new EntityRef('entry', d.b.id)],
    });
  }

  // The timeline review.
  for (const f of reviewTimeline(
    model,
    rules.map((r) => r.raw),
  )) {
    add({
      key: f.key,
      source: 'timeline',
      severity: 'warning',
      certainty: 'error',
      category: timelineCategory[f.rule],
      title: reviewRuleWords[f.rule].title,
      rule: reviewRuleWords[f.rule].rule,
      message: f.message,
      because: f.because,
      refs: [...f.eventIds.map((id) => new EntityRef('event', id)), ...f.entryIds.map((id) => new EntityRef('entry', id))],
      links: f.ruleId !== null ? [{ label: 'Open the travel time', path: '/review/continuity?tab=tracked' }] : [],
    });
  }

  // Canon statements: as the canon review flags them.
  const canon = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], (k) => model.categories.get(k) ?? null);
  for (const review of canon.reviews) {
    const fact = review.fact;
    const sources: EntityRef[] = [];
    for (const s of factSources(fact)) {
      if (s.refId === null) continue;
      if (s.type === 'chapter') sources.push(new EntityRef('node', s.refId));
      else if (s.type === 'event') sources.push(new EntityRef('event', s.refId));
      else if (s.type === 'entry') sources.push(new EntityRef('entry', s.refId));
    }
    for (const flag of review.flags) {
      // Linked by the author as contradicting, or marked Conflicting with nothing paired: confirmed. Noticed from
      // wording: possible.
      const stated = flag.kind === 'unpaired' || (flag.kind === 'fact' && flag.dismiss === null);
      add({
        key: canonKey(fact.id, flag.key),
        source: 'canon',
        severity: flag.kind === 'unpaired' ? 'info' : 'warning',
        certainty: stated ? 'error' : 'possible',
        category: 'canon',
        title:
          flag.kind === 'unpaired'
            ? 'Conflicting, with nothing paired'
            : flag.kind === 'field'
              ? 'A statement that may differ from a codex field'
              : stated
                ? 'Statements you linked as contradicting'
                : 'Statements that may disagree',
        rule:
          flag.kind === 'unpaired'
            ? 'A statement marked Conflicting contradicts another, so the other one is linked, or noticed.'
            : 'Statements in play about the same subject should agree with each other and with the codex field they ' +
              'name. Only you decide which one stands.',
        message: flag.message,
        because:
          `The ${dartToLowerCase(canonStatusLabel[fact.status])} statement “${dartTrim(fact.subject).length > 0 ? `${dartTrim(fact.subject)}: ` : ''}` +
          `${dartTrim(fact.statement)}”.`,
        refs: [...fact.entryIds.map((id) => new EntityRef('entry', id)), ...sources],
        links: [{ label: 'Open the statement', path: `/review/canon?fact=${fact.id}` }],
      });
    }
  }

  // Secrets and knowledge.
  for (const f of checkKnowledge(input.secrets ?? [], model)) {
    const owner = model.entries.get(f.ownerId);
    add({
      key: f.key,
      source: 'knowledge',
      severity: 'warning',
      certainty: 'error',
      category: 'knowledge',
      title: knowledgeRuleWords[f.rule].title,
      rule: knowledgeRuleWords[f.rule].rule,
      message: f.message,
      because: f.because,
      refs: [new EntityRef('entry', f.ownerId), ...f.characterIds.map((id) => new EntityRef('entry', id))],
      links: owner !== undefined ? [{ label: `Open ${owner.name}’s secrets`, path: `/organize/character/${f.ownerId}?tab=secrets` }] : [],
      context: () => ({ label: 'See it in Secrets and knowledge', path: `/visualize/knowledge?secret=${f.secretId}`, select: null }),
    });
  }

  // Journeys.
  for (const p of travelProblems(model, model.journeys, input.travel ?? null, input.maps ?? [], input.pins ?? [])) {
    const travellers = new Set<string>();
    for (const id of p.journeyIds) for (const t of model.journeys.find((j) => j.id === id)?.travellerIds ?? []) travellers.add(t);
    add({
      key: p.key,
      source: 'travel',
      severity: p.severity === 'problem' ? 'warning' : 'info',
      certainty: p.severity === 'problem' ? 'error' : 'possible',
      category: 'places',
      title: travelRules[p.kind].title,
      rule: travelRules[p.kind].rule,
      message: p.message,
      because:
        p.severity === 'problem'
          ? 'The journeys’ own dates, places and speeds, taken at their most generous reading.'
          : 'The journeys and events as recorded; the story may explain it.',
      refs: [...travellers].map((id) => new EntityRef('entry', id)),
      context: () => ({ label: 'See it in Journeys', path: '/visualize/journeys', select: null }),
    });
  }

  // Ability paths.
  const tree = abilityTree(model, input.snapshots ?? []);
  const nodeRef = new Map(tree.nodes.map((n) => [n.key, n.ref]));
  for (const p of pathProblems(tree, model)) {
    add({
      key: p.key,
      source: 'abilities',
      severity: p.severity === 'problem' ? 'warning' : 'info',
      certainty: p.severity === 'problem' ? 'error' : 'possible',
      category: 'abilities',
      title: pathRules[p.kind].title,
      rule: pathRules[p.kind].rule,
      message: p.message,
      because: 'The paths recorded between these abilities.',
      refs: p.nodes.flatMap((k) => {
        const r = nodeRef.get(k);
        return r === undefined ? [] : [r];
      }),
      context: () => ({ label: 'See it in Ability paths', path: '/visualize/abilities', select: null }),
    });
  }

  // The manuscript, matched by words: always possible, never confirmed.
  for (const issue of input.manuscript ?? []) {
    add({
      key: issue.key,
      source: 'continuity',
      severity: issue.severity,
      certainty: 'possible',
      category: issueCategory[issue.category],
      title:
        issue.category === 'trait'
          ? 'The text and a codex field'
          : `The text and a tracked rule: ${
              issue.category === 'status'
                ? 'character status'
                : issue.category === 'possession'
                  ? 'item possession'
                  : issue.category === 'travel'
                    ? 'travel time'
                    : 'power or magic'
            }`,
      rule: issue.category === 'trait' ? traitRule : ruleKindHints[issue.category as RuleKind],
      message: issue.message,
      because: `${issue.nodeTitle}, paragraph ${issue.block + 1}: “${issue.excerpt}”`,
      refs: [new EntityRef('node', issue.nodeId), ...issue.entryIds.map((id) => new EntityRef('entry', id))],
      links: [{ label: 'Open the passage', path: `/write?node=${issue.nodeId}` }],
    });
  }

  return out;
}

/** The author's decision about a warning, or none (`open`). */
export class ReviewedWarning {
  constructor(
    readonly warning: Warning,
    readonly decision: ReviewItem | null,
  ) {}

  /** `open`, or the decision's own word. */
  get status(): string {
    return this.decision?.decision ?? 'open';
  }
}

/** Each warning with the author's decision about it, and the decisions whose warning is no longer raised (the records
 * changed since). Decisions about the manuscript are judged gone only once the manuscript has been checked. */
export function withStatus(
  warnings: readonly Warning[],
  decisions: readonly ReviewItem[],
  args: { manuscriptChecked: boolean },
): { items: ReviewedWarning[]; gone: ReviewItem[] } {
  const byKey = new Map<string, ReviewItem>();
  for (const d of decisions) byKey.set(d.key, d);
  const keys = new Set(warnings.map((w) => w.key));
  return {
    items: warnings.map((w) => new ReviewedWarning(w, byKey.get(w.key) ?? null)),
    gone: decisions.filter((d) => !keys.has(d.key) && (args.manuscriptChecked || otherChecks.some((p) => d.key.startsWith(p)))),
  };
}
