// CHECKING THE STRUCTURED RECORDS (as in the original app). A port of
// flutter_app/lib/shared/domain/canon/checks.dart.
//
// Deterministic checks of what the author has recorded (events, connections, relationships, appearance records,
// tracked continuity, canon statements, progression changes and journeys) against one another. Each finding comes from
// one stated rule, says what records it rests on, and is raised only when the records hold what the rule needs; the
// same records give the same findings, with the same keys, every time. Nothing here changes a record, a canon status or
// the manuscript: the text is not even read.

import { localeCompare } from '../exchange/collation';
import { whenHeld } from '../factions/ties';
import { connectionStatusLabel } from '../codex/screens/connections';
import { type ContinuityRule, type Severity } from '../continuity/rules';
import { EntityRef } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { subtreeIds } from '../model/storyOrder';
import { type Anchor, DateAnchor, EventAnchor, NodeAnchor, Validity, overlaps, spanOfDate, spanOfEvent } from '../model/validity';
import { isUnknownTime, whenWords } from '../progression/track';
import { stableSorted } from '../reader/stableSort';
import { type CanonFact, type CanonStatus, canonStatusLabel } from '../records/canon';
import { RelativeDate, type TimelineEvent } from '../records/event';
import { type Link, connectionType } from '../records/link';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { formatDate } from '../timeline/dates';
import { nodeLabel } from '../timeline/narrative';
import { factSources, factWords as wordsOf, inPlay, quoted, setAside } from './facts';

export type RecordRule = 'restsOn' | 'stillTold' | 'opposed' | 'afterDeath' | 'endsFirst' | 'calendar' | 'gone' | 'replacement';

/** In the Dart enum's order (findings are sorted by it). */
export const recordRules: readonly RecordRule[] = ['restsOn', 'stillTold', 'opposed', 'afterDeath', 'endsFirst', 'calendar', 'gone', 'replacement'];

export const recordRuleWords: Readonly<Record<RecordRule, { key: string; severity: Severity; title: string; rule: string; needs: string }>> = {
  restsOn: {
    key: 'rests-on',
    severity: 'warning',
    title: 'Rests on a set-aside event',
    rule:
      'What is part of the story as it stands (Canon, Provisional or Conflicting) cannot rest on an event marked Retconned ' +
      'or Non-Canon: come after it, be dated from it, begin or end at it, or cite it as where it was established.',
    needs: 'An event with one of those statuses, and a record in play that points at it.',
  },
  stillTold: {
    key: 'still-told',
    severity: 'info',
    title: 'Set aside, but still told',
    rule:
      'An event marked Retconned or Non-Canon is not part of the story as it stands, so no chapter or scene is recorded ' +
      'as telling it.',
    needs: 'An event with one of those statuses that still lists the chapters or scenes telling it. The text itself is not read.',
  },
  opposed: {
    key: 'opposed',
    severity: 'warning',
    title: 'Allied and at war at once',
    rule: 'Two records cannot be allied with each other and at war with each other at the same time.',
    needs:
      'An “Allied with” and an “At war with” connection between the same two records, both in play, whose times ' +
      'certainly overlap. A connection with no time given holds throughout, as far as the records say.',
  },
  afterDeath: {
    key: 'after-death',
    severity: 'critical',
    title: 'Appears after their recorded death',
    rule:
      'A character tracked as deceased from a chapter on does not appear in a later chapter or scene, take part in an ' +
      'event told only there, or have a relationship change there, until the tracked status says they return.',
    needs:
      'A “Deceased” status under Continuity → Tracked, with its chapter; and an appearance record, an event’s chapters ' +
      'or a relationship stage in a later chapter.',
  },
  endsFirst: {
    key: 'ends-first',
    severity: 'warning',
    title: 'Ends before it begins',
    rule: 'A connection cannot stop holding before it starts.',
    needs: 'A start and an end on the same scale: both chapters or scenes, or both dates or events that can be placed.',
  },
  calendar: {
    key: 'calendar',
    severity: 'warning',
    title: 'Date not in the calendar',
    rule: 'A date must exist in the novel’s calendar: a month it has, a day that month has, an hour its days have.',
    needs:
      'A date with a month, day or hour on a connection, a progression change or a journey. Events’ dates are checked ' +
      'by the timeline review.',
  },
  gone: {
    key: 'gone',
    severity: 'warning',
    title: 'Timed by something that is gone',
    rule: 'When a connection, a progression change or a journey is timed by a chapter, scene or event, that record must exist.',
    needs: 'A time given by a chapter, scene or event that has since been deleted.',
  },
  replacement: {
    key: 'replacement',
    severity: 'info',
    title: 'Retconned with nothing in its place',
    rule:
      'A statement marked Retconned has been officially replaced, so it names the statement that replaced it, and that ' +
      'one is not itself set aside.',
    needs: 'A canon statement marked Retconned.',
  },
};

export class RecordFinding {
  constructor(
    /** The same for the same finding on every run, built from the records' ids, so a decision about it holds. */
    readonly key: string,
    readonly rule: RecordRule,
    readonly message: string,
    readonly because: string,
    /** The records it is about, as views mark them: `event:<id>`, `entry:<id>`, `node:<id>`, `relation:<id>`,
     * `link:<id>` for a stored connection, `fact:<id>` for a canon statement. */
    readonly on: readonly string[],
    /** Records to open to resolve it. */
    readonly refs: readonly EntityRef[],
  ) {}

  get severity(): Severity {
    return recordRuleWords[this.rule].severity;
  }
}

type Timed = { what: string; which: string; anchor: Anchor; on: string[]; refs: EntityRef[]; id: string };

const isSetAside = (s: CanonStatus | null) => setAside.includes(s ?? 'canon');

export function checkRecords(
  model: StoryModel,
  args: { facts: readonly CanonFact[]; rules: readonly ContinuityRule[]; known?: ReadonlySet<string> | null },
): RecordFinding[] {
  const { facts, rules } = args;
  const known = args.known ?? null;
  const findings: RecordFinding[] = [];
  const add = (rule: RecordRule, ids: string[], message: string, because: string, on: string[], refs: EntityRef[]) =>
    findings.push(new RecordFinding(['records', recordRuleWords[rule].key, ...ids].join('|'), rule, message, because, on, refs));
  const context = model.timeContext;
  const events = model.events;
  const calendar = model.calendar;
  const position = (id: string) => model.order.position.get(id) ?? null;
  const nodes = [...model.nodes.values()];
  const name = (ref: EntityRef) => model.resolve(ref)?.label ?? 'a record that is gone';
  const found = (ref: EntityRef) => model.resolve(ref) !== null;
  const ends = (l: Link) => [l.from, l.to];
  const linkWords = (l: Link) => `“${name(l.from)} ${dartToLowerCase(l.type !== null ? connectionType(l.type).label : 'Related to')} ${name(l.to)}”`;
  const linkStatus = (l: Link) => connectionStatusLabel(l.canon ?? 'canon');
  const setAsideEvent = (eventId: string | null): TimelineEvent | null => {
    const event = eventId === null ? null : (events.get(eventId) ?? null);
    return event !== null && isSetAside(event.canon) ? event : null;
  };
  const statusWords = (status: CanonStatus | null) => canonStatusLabel[status ?? 'canon'];
  const travellers = (ids: readonly string[]) => {
    const names = ids.map((id) => model.entries.get(id)?.name ?? 'someone deleted').join(', ');
    return names.length === 0 ? 'nobody named' : names;
  };
  const factQuote = (fact: CanonFact) => quoted(wordsOf(fact));

  // Every time given by a chapter, scene, event or date, with what it times: connections, progression changes,
  // journeys.
  const timed: Timed[] = [];
  for (const l of model.links) {
    for (const [which, anchor] of [
      ['start', l.validity?.from ?? null],
      ['end', l.validity?.until ?? null],
    ] as const) {
      if (anchor !== null) {
        timed.push({ what: `The connection ${linkWords(l)}`, which, anchor, on: [`link:${l.id}`], refs: ends(l).filter(found), id: `link:${l.id}:${which}` });
      }
    }
  }
  for (const c of model.progress) {
    const at = c.at;
    if (at !== null && !isUnknownTime(at)) {
      timed.push({
        what: `A progression change for ${model.entries.get(c.entryId)?.name ?? 'someone deleted'}`,
        which: 'time',
        anchor: at,
        on: [`entry:${c.entryId}`],
        refs: model.entries.has(c.entryId) ? [new EntityRef('entry', c.entryId)] : [],
        id: `progress:${c.id}`,
      });
    }
  }
  for (const j of model.journeys) {
    for (const [which, anchor] of [
      ['departure', j.departure],
      ['arrival', j.arrival],
    ] as const) {
      if (anchor !== null) {
        timed.push({
          what: `The journey of ${travellers(j.travellerIds)}`,
          which,
          anchor,
          on: j.travellerIds.map((id) => `entry:${id}`),
          refs: j.travellerIds.filter((id) => model.entries.has(id)).map((id) => new EntityRef('entry', id)),
          id: `journey:${j.id}:${which}`,
        });
      }
    }
  }

  // Rests on a set-aside event.
  const linkById = new Map(model.links.map((l) => [`link:${l.id}`, l]));
  for (const e of stableSorted(events.values(), (a, b) => localeCompare(a.id, b.id))) {
    if (isSetAside(e.canon)) continue;
    const after = setAsideEvent(e.afterId);
    if (after !== null) {
      add(
        'restsOn',
        [e.id, 'after', after.id],
        `“${e.name}” is set to come after “${after.name}”, which is marked ${statusWords(after.canon)}.`,
        `“${e.name}” is ${statusWords(e.canon)}, and its “Comes after” is “${after.name}”, whose canon status is ` + `${statusWords(after.canon)}.`,
        [`event:${e.id}`, `event:${after.id}`],
        [new EntityRef('event', e.id), new EntityRef('event', after.id)],
      );
    }
    for (const [which, date] of [
      ['start', e.when],
      ['end', e.end],
    ] as const) {
      const from = date instanceof RelativeDate ? setAsideEvent(date.anchorId) : null;
      if (from !== null) {
        add(
          'restsOn',
          [e.id, which, from.id],
          `“${e.name}” is dated from “${from.name}”, which is marked ${statusWords(from.canon)}.`,
          `Its ${which === 'start' ? 'date' : 'end date'} reads “${formatDate(date, (id) => events.get(id)?.name ?? null, calendar)}”; ` +
            `“${from.name}” has the canon status ${statusWords(from.canon)}.`,
          [`event:${e.id}`, `event:${from.id}`],
          [new EntityRef('event', e.id), new EntityRef('event', from.id)],
        );
      }
    }
  }
  for (const t of timed) {
    const anchor = t.anchor;
    if (!(anchor instanceof EventAnchor)) continue;
    const at = setAsideEvent(anchor.eventId);
    const link = t.id.startsWith('link:') ? (linkById.get(t.on[0]) ?? null) : null;
    if (at === null || (link !== null && isSetAside(link.canon))) continue;
    add(
      'restsOn',
      [t.id, at.id],
      `${t.what} has its ${t.which} at “${at.name}”, which is marked ${statusWords(at.canon)}.`,
      `${link !== null ? `The connection is ${linkStatus(link)}; ` : ''}“${at.name}” has the canon status ` + `${statusWords(at.canon)}.`,
      [...t.on, `event:${at.id}`],
      [...t.refs, new EntityRef('event', at.id)],
    );
  }
  for (const fact of facts) {
    if (!inPlay.includes(fact.status)) continue;
    for (const source of factSources(fact)) {
      const at = source.type === 'event' ? setAsideEvent(source.refId) : null;
      if (at === null) continue;
      add(
        'restsOn',
        [`fact:${fact.id}`, source.id],
        `The ${dartToLowerCase(canonStatusLabel[fact.status])} statement ${factQuote(fact)} is established at “${at.name}”, which is ` +
          `marked ${statusWords(at.canon)}.`,
        `One of its sources is the timeline event “${at.name}”, whose canon status is ${statusWords(at.canon)}.`,
        [`fact:${fact.id}`, `event:${at.id}`, ...fact.entryIds.map((id) => `entry:${id}`)],
        [new EntityRef('event', at.id)],
      );
    }
  }

  // Set aside, but still told.
  for (const e of events.values()) {
    if (!isSetAside(e.canon)) continue;
    const told = e.nodeIds.filter((id) => model.nodes.has(id));
    if (told.length === 0) continue;
    add(
      'stillTold',
      [e.id],
      `“${e.name}” is marked ${statusWords(e.canon)}, but is still recorded as told in ` + `${told.map((id) => nodeLabel(model, id)).join(', ')}.`,
      `Its canon status is ${statusWords(e.canon)}, and its chapters and scenes list ` + `${told.length === 1 ? 'one' : told.length}.`,
      [`event:${e.id}`, ...told.map((id) => `node:${id}`)],
      [new EntityRef('event', e.id), ...told.map((id) => new EntityRef('node', id))],
    );
  }

  // Allied and at war at once.
  const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const pairOf = (l: Link) =>
    ends(l)
      .map((r) => `${r.type}:${r.id}`)
      .sort(byCodeUnits)
      .join('~');
  const linkInPlay = (l: Link) => !isSetAside(l.canon);
  const allied = model.links.filter((l) => connectionType(l.type).key === 'allied-with' && linkInPlay(l));
  const atWar = model.links.filter((l) => connectionType(l.type).key === 'at-war-with' && linkInPlay(l));
  // The wars by the pair they are between, worked out once (in their order): each alliance is then set against its
  // own pair's wars only. The same findings, in the same order.
  const warsOf = new Map<string, Link[]>();
  for (const w of atWar) {
    let list = warsOf.get(pairOf(w));
    if (list === undefined) warsOf.set(pairOf(w), (list = []));
    list.push(w);
  }
  for (const a of allied) {
    for (const w of warsOf.get(pairOf(a)) ?? []) {
      if (overlaps(a.validity ?? Validity.always, w.validity ?? Validity.always, context) !== 'yes') continue;
      const [x, y] = ends(a);
      add(
        'opposed',
        [a.id, w.id],
        `${name(x)} and ${name(y)} are recorded as allied and at war at the same time.`,
        `“Allied with”: ${whenHeld(a, model)} (${linkStatus(a)}). “At war with”: ${whenHeld(w, model)} ` + `(${linkStatus(w)}).`,
        [`link:${a.id}`, `link:${w.id}`, `${x.type}:${x.id}`, `${y.type}:${y.id}`],
        [x, y].filter(found),
      );
    }
  }

  // Appears after their recorded death.
  for (const rule of rules) {
    const entryId = rule.entryId;
    if (rule.kind !== 'status' || rule.state !== 'deceased' || entryId === null) continue;
    const who = model.entries.get(entryId);
    if (who === undefined) continue;
    // As the continuity check reads it: from after the last scene of its chapter, until the chapter it ends at.
    const fromNode = rule.fromNodeId;
    const untilNode = rule.untilNodeId;
    const startsAfter =
      fromNode !== null && model.nodes.has(fromNode) ? Math.max(...subtreeIds(nodes, fromNode).map((id) => position(id) ?? -1)) : -1;
    const endsAt = untilNode !== null && model.nodes.has(untilNode) ? (position(untilNode) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    const since = fromNode !== null && model.nodes.has(fromNode) ? `from ${nodeLabel(model, fromNode)}` : 'from the start of the story';
    const after = (nodeId: string | null) => {
      const at = nodeId === null ? null : position(nodeId);
      return at !== null && at > startsAfter && at < endsAt;
    };
    const label = dartTrim(rule.label);
    const status =
      `Continuity → Tracked: ${who.name} is ${label.length > 0 ? `“${label}” (Deceased)` : 'Deceased'} ${since}` +
      `${untilNode !== null && model.nodes.has(untilNode) ? ` until ${nodeLabel(model, untilNode)}` : ''}.`;
    const baseOn = [`entry:${who.id}`];
    const baseRefs = [new EntityRef('entry', who.id)];
    for (const plan of stableSorted(model.plans.values(), (a, b) => (position(a.id) ?? 0) - (position(b.id) ?? 0))) {
      if (!plan.appearIds.includes(who.id) || !after(plan.id)) continue;
      add(
        'afterDeath',
        [rule.id, 'appears', plan.id],
        `${who.name} appears in ${nodeLabel(model, plan.id)}, after their recorded death.`,
        `${status} The appearance record of ${nodeLabel(model, plan.id)} lists them as on the page.`,
        [...baseOn, `node:${plan.id}`],
        [...baseRefs, new EntityRef('node', plan.id)],
      );
    }
    for (const e of events.values()) {
      const told = e.nodeIds.filter((id) => position(id) !== null);
      if (!e.characters.some((c) => c.id === who.id) || told.length === 0 || !told.every(after)) continue;
      add(
        'afterDeath',
        [rule.id, 'event', e.id],
        `${who.name} takes part in “${e.name}”, told only after their recorded death.`,
        `${status} “${e.name}” lists them as taking part, and is told in ` + `${told.map((id) => nodeLabel(model, id)).join(', ')}.`,
        [...baseOn, `event:${e.id}`],
        [...baseRefs, new EntityRef('event', e.id)],
      );
    }
    for (const r of model.relations.values()) {
      if (r.fromId !== who.id && r.toId !== who.id) continue;
      const other = model.entries.get(r.fromId === who.id ? r.toId : r.fromId)?.name ?? 'someone deleted';
      for (const stage of r.stages) {
        if (!after(stage.startNodeId)) continue;
        add(
          'afterDeath',
          [rule.id, 'relation', r.id, stage.id],
          `${who.name}’s relationship with ${other} changes to “${stage.label.length > 0 ? stage.label : 'a new stage'}” ` +
            `in ${nodeLabel(model, stage.startNodeId!)}, after their recorded death.`,
          `${status} That stage of the relationship starts at ${nodeLabel(model, stage.startNodeId!)}.`,
          [...baseOn, `relation:${r.id}`],
          [...baseRefs, new EntityRef('relation', r.id)],
        );
      }
    }
  }

  // Ends before it begins.
  const place = (anchor: Anchor): { axis: string; lo: number; hi: number } | null => {
    if (anchor instanceof NodeAnchor) {
      const at = position(anchor.nodeId);
      return at === null ? null : { axis: 'reading', lo: at, hi: at };
    }
    if (anchor instanceof EventAnchor) {
      const span = spanOfEvent(anchor.eventId, context);
      return span === null ? null : { axis: 'story', lo: span.lo, hi: span.hi };
    }
    if (anchor instanceof DateAnchor) {
      const span = spanOfDate(anchor.when, context);
      return span === null ? null : { axis: 'story', lo: span.lo, hi: span.hi };
    }
    return null;
  };
  for (const l of model.links) {
    const v = l.validity;
    if (v === null || v.from === null || v.until === null) continue;
    const start = place(v.from);
    const end = place(v.until);
    if (start === null || end === null || start.axis !== end.axis) continue;
    const first = start.axis === 'reading' ? end.lo < start.lo : end.hi < start.lo;
    if (first) {
      add(
        'endsFirst',
        [l.id],
        `The connection ${linkWords(l)} stops before it starts.`,
        `It starts ${whenWords(v.from, model)} and stops ${whenWords(v.until, model)}, which comes earlier.`,
        [`link:${l.id}`],
        ends(l).filter(found),
      );
    }
  }

  // Dates not in the calendar, and times given by records that are gone.
  for (const t of timed) {
    const anchor = t.anchor;
    if (anchor instanceof DateAnchor) {
      const problem = anchor.when === null ? null : calendar.dateProblem(anchor.when);
      if (problem !== null) {
        add('calendar', [t.id], `${t.what}: its ${t.which} is not in ${calendar.standard ? 'the calendar' : calendar.name}.`, problem, t.on, t.refs);
      }
    } else if (
      (anchor instanceof NodeAnchor && !model.nodes.has(anchor.nodeId)) ||
      (anchor instanceof EventAnchor && !events.has(anchor.eventId) && !(known?.has(anchor.eventId) ?? false))
    ) {
      const kind = anchor instanceof NodeAnchor ? 'chapter or scene' : 'timeline event';
      add(
        'gone',
        [t.id],
        `${t.what} has its ${t.which} at a ${kind} that no longer exists.`,
        `Its ${t.which} pointed at a ${kind} that has been deleted, so when it holds cannot be worked out.`,
        t.on,
        t.refs,
      );
    }
  }

  // Retconned with nothing in its place.
  const factById = new Map(facts.map((f) => [f.id, f]));
  for (const fact of facts) {
    if (fact.status !== 'retconned') continue;
    const replacedBy = fact.replacedById;
    const by = replacedBy === null ? null : (factById.get(replacedBy) ?? null);
    const why =
      replacedBy === null
        ? 'names no statement that replaced it'
        : by === null
          ? 'names a replacement that no longer exists'
          : setAside.includes(by.status)
            ? `is replaced by ${factQuote(by)}, which is itself marked ${canonStatusLabel[by.status]}`
            : null;
    if (why === null) continue;
    add(
      'replacement',
      [fact.id],
      `The statement ${factQuote(fact)} is marked Retconned, but ${why}.`,
      'Retconned means it was true once and has been officially replaced. Its “Replaced by” is ' +
        `${replacedBy === null ? 'empty' : by !== null ? factQuote(by) : 'a statement that was deleted'}.`,
      [`fact:${fact.id}`, ...fact.entryIds.map((id) => `entry:${id}`)],
      fact.entryIds.filter((id) => model.entries.has(id)).map((id) => new EntityRef('entry', id)),
    );
  }

  return stableSorted(findings, (a, b) => {
    const c = recordRules.indexOf(a.rule) - recordRules.indexOf(b.rule);
    return c !== 0 ? c : localeCompare(a.key, b.key);
  });
}
