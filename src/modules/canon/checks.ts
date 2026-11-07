import type { LoreLink } from '@/modules/codex/types';
import { connectionType } from '@/modules/connections/types';
import type { ContinuityRule, Severity } from '@/modules/continuity/types';
import { whenHeld } from '@/modules/factions/ties';
import { subtreeIds } from '@/modules/manuscript/tree';
import { resolveRef } from '@/modules/model/model';
import type { EntityRef, EntityType, StoryModel } from '@/modules/model/types';
import { overlaps, spanOfDate, spanOfEvent, timeContext, type Anchor, type Validity } from '@/modules/model/validity';
import { isUnknownTime, whenWords } from '@/modules/progression/track';
import { dateProblem } from '@/modules/timeline/calendar';
import { formatDate } from '@/modules/timeline/chronology';
import { nodeLabel } from '@/modules/timeline/narrative';
import { CONNECTION_STATUS_LABELS } from '@/modules/integrity/rules';
import { IN_PLAY, STATUS_LABELS, type CanonFact, type CanonStatus } from './types';

/**
 * CHECKING THE STRUCTURED RECORDS
 * Deterministic checks of what the author has recorded (events, connections,
 * relationships, appearance records, tracked continuity, canon statements,
 * progression changes and journeys) against one another. Each finding comes
 * from one stated rule, says what records it rests on, and is raised only
 * when the records hold what the rule needs; the same records give the same
 * findings, with the same keys, every time.
 *
 * Nothing here changes a record, a canon status or the manuscript: the text
 * is not even read. The author fixes a record (and the finding goes), or
 * keeps a decision about it with the continuity decisions, under a key that
 * starts "records|".
 */
export const RECORD_RULES = ['rests-on', 'still-told', 'opposed', 'after-death', 'ends-first', 'calendar', 'gone', 'replacement'] as const;
export type RecordRule = (typeof RECORD_RULES)[number];

export const RECORD_RULE_TEXT: Record<RecordRule, { title: string; rule: string; needs: string }> = {
  'rests-on': { title: 'Rests on a set-aside event', rule: 'What is part of the story as it stands (Canon, Provisional or Conflicting) cannot rest on an event marked Retconned or Non-Canon: come after it, be dated from it, begin or end at it, or cite it as where it was established.', needs: 'An event with one of those statuses, and a record in play that points at it.' },
  'still-told': { title: 'Set aside, but still told', rule: 'An event marked Retconned or Non-Canon is not part of the story as it stands, so no chapter or scene is recorded as telling it.', needs: 'An event with one of those statuses that still lists the chapters or scenes telling it. The text itself is not read.' },
  opposed: { title: 'Allied and at war at once', rule: 'Two records cannot be allied with each other and at war with each other at the same time.', needs: 'An “Allied with” and an “At war with” connection between the same two records, both in play, whose times certainly overlap. A connection with no time given holds throughout, as far as the records say.' },
  'after-death': { title: 'Appears after their recorded death', rule: 'A character tracked as deceased from a chapter on does not appear in a later chapter or scene, take part in an event told only there, or have a relationship change there, until the tracked status says they return.', needs: 'A “Deceased” status under Continuity → Tracked, with its chapter; and an appearance record, an event’s chapters or a relationship stage in a later chapter.' },
  'ends-first': { title: 'Ends before it begins', rule: 'A connection cannot stop holding before it starts.', needs: 'A start and an end on the same scale: both chapters or scenes, or both dates or events that can be placed.' },
  calendar: { title: 'Date not in the calendar', rule: 'A date must exist in the novel’s calendar: a month it has, a day that month has, an hour its days have.', needs: 'A date with a month, day or hour on a connection, a progression change or a journey. Events’ dates are checked by the timeline review.' },
  gone: { title: 'Timed by something that is gone', rule: 'When a connection, a progression change or a journey is timed by a chapter, scene or event, that record must exist.', needs: 'A time given by a chapter, scene or event that has since been deleted.' },
  replacement: { title: 'Retconned with nothing in its place', rule: 'A statement marked Retconned has been officially replaced, so it names the statement that replaced it, and that one is not itself set aside.', needs: 'A canon statement marked Retconned.' },
};

const SEVERITY: Record<RecordRule, Severity> = { 'rests-on': 'warning', 'still-told': 'info', opposed: 'warning', 'after-death': 'critical', 'ends-first': 'warning', calendar: 'warning', gone: 'warning', replacement: 'info' };

export interface RecordFinding {
  /** The same for the same finding on every run, built from the records' ids, so a decision about it holds. */
  key: string;
  rule: RecordRule;
  severity: Severity;
  /** What was found, in a sentence. */
  message: string;
  /** The data it rests on, in words. */
  because: string;
  /**
   * The records it is about, as views mark them: `event:<id>`, `entry:<id>`,
   * `node:<id>`, `relation:<id>`, `link:<id>` for a stored connection,
   * `fact:<id>` for a canon statement.
   */
  on: string[];
  /** Records to open to resolve it. */
  refs: EntityRef[];
}

export interface RecordInput {
  facts: CanonFact[];
  /** Tracked continuity: only "Deceased" statuses are read. */
  rules: ContinuityRule[];
  /**
   * Events that exist somewhere in the novel. When an alternate history is
   * shown, an event it leaves out is not "gone": a time given by it is that
   * history's business, not a deleted record.
   */
  known?: ReadonlySet<string>;
}

const SET_ASIDE: CanonStatus[] = ['retconned', 'non-canon'];
const keyOf = (rule: RecordRule, ...ids: string[]) => ['records', rule, ...ids].join('|');
const quoted = (text: string) => `“${text.trim().length > 90 ? `${text.trim().slice(0, 88)}…` : text.trim()}”`;

type Placed = { axis: 'reading'; at: number } | { axis: 'story'; lo: number; hi: number } | null;

export function checkRecords(model: StoryModel, { facts, rules, known }: RecordInput): RecordFinding[] {
  const findings: RecordFinding[] = [];
  const add = (rule: RecordRule, ids: string[], f: Omit<RecordFinding, 'key' | 'rule' | 'severity'>) => findings.push({ key: keyOf(rule, ...ids), rule, severity: SEVERITY[rule], ...f });
  const context = timeContext(model);
  const { events, calendar } = model;
  const position = (id: string) => model.order.position.get(id);
  const nodes = [...model.nodes.values()];
  const name = (ref: EntityRef) => {
    const found = resolveRef(model, ref);
    return found.found ? found.view.label : 'a record that is gone';
  };
  const ends = (l: LoreLink): [EntityRef, EntityRef] => [
    { type: (l.fromType ?? 'entry') as EntityType, id: l.fromId },
    { type: (l.toType ?? 'entry') as EntityType, id: l.toId },
  ];
  const linkWords = (l: LoreLink) => {
    const [a, b] = ends(l);
    return `“${name(a)} ${(l.type ? connectionType(l.type).label : 'Related to').toLowerCase()} ${name(b)}”`;
  };
  const linkStatus = (l: LoreLink) => CONNECTION_STATUS_LABELS[l.canon ?? 'canon'];
  const setAside = (eventId: string | null | undefined) => {
    const event = eventId ? events.get(eventId) : undefined;
    return event && SET_ASIDE.includes(event.canon ?? 'canon') ? event : null;
  };
  const statusWords = (status: CanonStatus | undefined) => STATUS_LABELS[status ?? 'canon'];
  const travellers = (ids: string[]) => ids.map((id) => model.entries.get(id)?.name ?? 'someone deleted').join(', ') || 'nobody named';
  const factWords = (fact: CanonFact) => quoted(`${fact.subject.trim() ? `${fact.subject.trim()}: ` : ''}${fact.statement}`);

  // Every time given by a chapter, scene, event or date, with what it times: connections, progression changes, journeys.
  const timed: { what: string; which: string; anchor: Anchor; on: string[]; refs: EntityRef[]; id: string }[] = [];
  for (const l of model.links) {
    for (const [which, anchor] of [['start', l.validity?.from], ['end', l.validity?.until]] as const) if (anchor) timed.push({ what: `The connection ${linkWords(l)}`, which, anchor, on: [`link:${l.id}`], refs: ends(l).filter((r) => resolveRef(model, r).found), id: `link:${l.id}:${which}` });
  }
  for (const c of model.progress) {
    if (c.at && !isUnknownTime(c.at)) timed.push({ what: `A progression change for ${model.entries.get(c.entryId)?.name ?? 'someone deleted'}`, which: 'time', anchor: c.at, on: [`entry:${c.entryId}`], refs: model.entries.has(c.entryId) ? [{ type: 'entry', id: c.entryId }] : [], id: `progress:${c.id}` });
  }
  for (const j of model.journeys) {
    for (const [which, anchor] of [['departure', j.departure], ['arrival', j.arrival]] as const) if (anchor) timed.push({ what: `The journey of ${travellers(j.travellerIds)}`, which, anchor, on: j.travellerIds.map((id) => `entry:${id}`), refs: j.travellerIds.filter((id) => model.entries.has(id)).map((id) => ({ type: 'entry', id })), id: `journey:${j.id}:${which}` });
  }

  // Rests on a set-aside event.
  const linkById = new Map(model.links.map((l) => [`link:${l.id}`, l]));
  for (const e of [...events.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (SET_ASIDE.includes(e.canon ?? 'canon')) continue;
    const after = setAside(e.afterId);
    if (after) add('rests-on', [e.id, 'after', after.id], { message: `“${e.name}” is set to come after “${after.name}”, which is marked ${statusWords(after.canon)}.`, because: `“${e.name}” is ${statusWords(e.canon)}, and its “Comes after” is “${after.name}”, whose canon status is ${statusWords(after.canon)}.`, on: [`event:${e.id}`, `event:${after.id}`], refs: [{ type: 'event', id: e.id }, { type: 'event', id: after.id }] });
    for (const [which, when] of [['start', e.when], ['end', e.end]] as const) {
      const from = when?.precision === 'relative' ? setAside(when.anchorId) : null;
      if (from) add('rests-on', [e.id, which, from.id], { message: `“${e.name}” is dated from “${from.name}”, which is marked ${statusWords(from.canon)}.`, because: `Its ${which === 'start' ? 'date' : 'end date'} reads “${formatDate(when!, (id) => events.get(id)?.name, calendar)}”; “${from.name}” has the canon status ${statusWords(from.canon)}.`, on: [`event:${e.id}`, `event:${from.id}`], refs: [{ type: 'event', id: e.id }, { type: 'event', id: from.id }] });
    }
  }
  for (const t of timed) {
    if (t.anchor.kind !== 'event') continue;
    const at = setAside(t.anchor.eventId);
    const link = t.id.startsWith('link:') ? linkById.get(t.on[0]) : null;
    if (!at || (link && SET_ASIDE.includes(link.canon ?? 'canon'))) continue;
    add('rests-on', [t.id, at.id], { message: `${t.what} has its ${t.which} at “${at.name}”, which is marked ${statusWords(at.canon)}.`, because: `${link ? `The connection is ${linkStatus(link)}; ` : ''}“${at.name}” has the canon status ${statusWords(at.canon)}.`, on: [...t.on, `event:${at.id}`], refs: [...t.refs, { type: 'event', id: at.id }] });
  }
  for (const fact of facts) {
    if (!IN_PLAY.includes(fact.status)) continue;
    for (const source of fact.sources) {
      const at = source.type === 'event' ? setAside(source.refId) : null;
      if (at) add('rests-on', [`fact:${fact.id}`, source.id], { message: `The ${STATUS_LABELS[fact.status].toLowerCase()} statement ${factWords(fact)} is established at “${at.name}”, which is marked ${statusWords(at.canon)}.`, because: `One of its sources is the timeline event “${at.name}”, whose canon status is ${statusWords(at.canon)}.`, on: [`fact:${fact.id}`, `event:${at.id}`, ...fact.entryIds.map((id) => `entry:${id}`)], refs: [{ type: 'event', id: at.id }] });
    }
  }

  // Set aside, but still told.
  for (const e of events.values()) {
    if (!SET_ASIDE.includes(e.canon ?? 'canon')) continue;
    const told = e.nodeIds.filter((id) => model.nodes.has(id));
    if (told.length) add('still-told', [e.id], { message: `“${e.name}” is marked ${statusWords(e.canon)}, but is still recorded as told in ${told.map((id) => nodeLabel(model, id)).join(', ')}.`, because: `Its canon status is ${statusWords(e.canon)}, and its chapters and scenes list ${told.length === 1 ? 'one' : told.length}.`, on: [`event:${e.id}`, ...told.map((id) => `node:${id}`)], refs: [{ type: 'event', id: e.id }, ...told.map((id) => ({ type: 'node' as const, id }))] });
  }

  // Allied and at war at once.
  const pairOf = (l: LoreLink) => ends(l).map((r) => `${r.type}:${r.id}`).sort().join('~');
  const inPlay = (l: LoreLink) => !SET_ASIDE.includes(l.canon ?? 'canon');
  const allied = model.links.filter((l) => connectionType(l.type).key === 'allied-with' && inPlay(l));
  const atWar = model.links.filter((l) => connectionType(l.type).key === 'at-war-with' && inPlay(l));
  for (const a of allied) {
    for (const w of atWar) {
      if (pairOf(a) !== pairOf(w) || overlaps(a.validity ?? { from: null, until: null }, w.validity ?? { from: null, until: null }, context) !== true) continue;
      const [x, y] = ends(a);
      add('opposed', [a.id, w.id], { message: `${name(x)} and ${name(y)} are recorded as allied and at war at the same time.`, because: `“Allied with”: ${whenHeld(a, model)} (${linkStatus(a)}). “At war with”: ${whenHeld(w, model)} (${linkStatus(w)}).`, on: [`link:${a.id}`, `link:${w.id}`, `${x.type}:${x.id}`, `${y.type}:${y.id}`], refs: [x, y].filter((r) => resolveRef(model, r).found) });
    }
  }

  // Appears after their recorded death.
  for (const rule of rules) {
    if (rule.kind !== 'status' || rule.state !== 'deceased' || !rule.entryId) continue;
    const who = model.entries.get(rule.entryId);
    if (!who) continue;
    // As the continuity check reads it: from after the last scene of its chapter, until the chapter it ends at.
    const startsAfter = rule.fromNodeId && model.nodes.has(rule.fromNodeId) ? Math.max(...subtreeIds(nodes, rule.fromNodeId).map((id) => position(id) ?? -1)) : -1;
    const endsAt = rule.untilNodeId && model.nodes.has(rule.untilNodeId) ? (position(rule.untilNodeId) ?? Infinity) : Infinity;
    const since = rule.fromNodeId && model.nodes.has(rule.fromNodeId) ? `from ${nodeLabel(model, rule.fromNodeId)}` : 'from the start of the story';
    const after = (nodeId: string | null | undefined) => {
      const at = nodeId ? position(nodeId) : undefined;
      return at !== undefined && at > startsAfter && at < endsAt;
    };
    const status = `Continuity → Tracked: ${who.name} is ${rule.label.trim() ? `“${rule.label.trim()}” (Deceased)` : 'Deceased'} ${since}${rule.untilNodeId && model.nodes.has(rule.untilNodeId) ? ` until ${nodeLabel(model, rule.untilNodeId)}` : ''}.`;
    const base = { on: [`entry:${who.id}`], refs: [{ type: 'entry' as const, id: who.id }] };
    for (const plan of [...model.plans.values()].sort((a, b) => (position(a.id) ?? 0) - (position(b.id) ?? 0))) {
      if (!(plan.appearIds ?? []).includes(who.id) || !after(plan.id)) continue;
      add('after-death', [rule.id, 'appears', plan.id], { message: `${who.name} appears in ${nodeLabel(model, plan.id)}, after their recorded death.`, because: `${status} The appearance record of ${nodeLabel(model, plan.id)} lists them as on the page.`, on: [...base.on, `node:${plan.id}`], refs: [...base.refs, { type: 'node', id: plan.id }] });
    }
    for (const e of events.values()) {
      const told = e.nodeIds.filter((id) => position(id) !== undefined);
      if (!e.characters.some((c) => c.id === who.id) || !told.length || !told.every(after)) continue;
      add('after-death', [rule.id, 'event', e.id], { message: `${who.name} takes part in “${e.name}”, told only after their recorded death.`, because: `${status} “${e.name}” lists them as taking part, and is told in ${told.map((id) => nodeLabel(model, id)).join(', ')}.`, on: [...base.on, `event:${e.id}`], refs: [...base.refs, { type: 'event', id: e.id }] });
    }
    for (const r of model.relations.values()) {
      if (r.fromId !== who.id && r.toId !== who.id) continue;
      const other = model.entries.get(r.fromId === who.id ? r.toId : r.fromId)?.name ?? 'someone deleted';
      for (const stage of r.stages) {
        if (!after(stage.startNodeId)) continue;
        add('after-death', [rule.id, 'relation', r.id, stage.id], { message: `${who.name}’s relationship with ${other} changes to “${stage.label || 'a new stage'}” in ${nodeLabel(model, stage.startNodeId!)}, after their recorded death.`, because: `${status} That stage of the relationship starts at ${nodeLabel(model, stage.startNodeId!)}.`, on: [...base.on, `relation:${r.id}`], refs: [...base.refs, { type: 'relation', id: r.id }] });
      }
    }
  }

  // Ends before it begins.
  const place = (anchor: Anchor): Placed => {
    if (anchor.kind === 'node') {
      const at = position(anchor.nodeId);
      return at === undefined ? null : { axis: 'reading', at };
    }
    const span = anchor.kind === 'event' ? spanOfEvent(anchor.eventId, context) : spanOfDate(anchor.when, context);
    return span ? { axis: 'story', ...span } : null;
  };
  for (const l of model.links) {
    const v: Validity | undefined = l.validity;
    if (!v?.from || !v.until) continue;
    const [start, end] = [place(v.from), place(v.until)];
    if (!start || !end || start.axis !== end.axis) continue;
    const first = start.axis === 'reading' && end.axis === 'reading' ? end.at < start.at : start.axis === 'story' && end.axis === 'story' ? end.hi < start.lo : false;
    if (first) add('ends-first', [l.id], { message: `The connection ${linkWords(l)} stops before it starts.`, because: `It starts ${whenWords(v.from, model)} and stops ${whenWords(v.until, model)}, which comes earlier.`, on: [`link:${l.id}`], refs: ends(l).filter((r) => resolveRef(model, r).found) });
  }

  // Dates not in the calendar, and times given by records that are gone.
  for (const t of timed) {
    if (t.anchor.kind === 'date') {
      const problem = dateProblem(t.anchor.when, calendar);
      if (problem) add('calendar', [t.id], { message: `${t.what}: its ${t.which} is not in ${calendar.standard ? 'the calendar' : calendar.name}.`, because: problem, on: t.on, refs: t.refs });
      continue;
    }
    const gone = t.anchor.kind === 'node' ? !model.nodes.has(t.anchor.nodeId) : !events.has(t.anchor.eventId) && !known?.has(t.anchor.eventId);
    if (gone) add('gone', [t.id], { message: `${t.what} has its ${t.which} at a ${t.anchor.kind === 'node' ? 'chapter or scene' : 'timeline event'} that no longer exists.`, because: `Its ${t.which} pointed at a ${t.anchor.kind === 'node' ? 'chapter or scene' : 'timeline event'} that has been deleted, so when it holds cannot be worked out.`, on: t.on, refs: t.refs });
  }

  // Retconned with nothing in its place.
  const factById = new Map(facts.map((f) => [f.id, f]));
  for (const fact of facts) {
    if (fact.status !== 'retconned') continue;
    const by = fact.replacedById ? factById.get(fact.replacedById) : undefined;
    const why = !fact.replacedById ? 'names no statement that replaced it' : !by ? 'names a replacement that no longer exists' : SET_ASIDE.includes(by.status) ? `is replaced by ${factWords(by)}, which is itself marked ${STATUS_LABELS[by.status]}` : null;
    if (why) add('replacement', [fact.id], { message: `The statement ${factWords(fact)} is marked Retconned, but ${why}.`, because: `Retconned means it was true once and has been officially replaced. Its “Replaced by” is ${!fact.replacedById ? 'empty' : by ? factWords(by) : 'a statement that was deleted'}.`, on: [`fact:${fact.id}`, ...fact.entryIds.map((id) => `entry:${id}`)], refs: fact.entryIds.filter((id) => model.entries.has(id)).map((id) => ({ type: 'entry' as const, id })) });
  }

  return findings.sort((a, b) => RECORD_RULES.indexOf(a.rule) - RECORD_RULES.indexOf(b.rule) || a.key.localeCompare(b.key));
}
