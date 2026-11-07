import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { audit } from '@/modules/continuity/audit';
import { createContinuityService, registerContinuity } from '@/modules/continuity/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import type { Anchor } from '@/modules/model/validity';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { withHistory } from '@/modules/timeline/histories';
import { createHistoryService, registerHistories } from '@/modules/timeline/historyService';
import { reviewTimeline, withDecisions } from '@/modules/timeline/review';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { checkRecords, RECORD_RULES, RECORD_RULE_TEXT } from './checks';
import { badgeOf, canonOverlay, markWords, mergeMarks } from './overlay';
import { reviewCanon } from './review';
import { createCanonService, registerCanon } from './service';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`checks-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerHistories(registry);
  registerRelationships(registry);
  registerCanon(registry);
  registerContinuity(registry);
});

const year = (y: number, month: number | null = null): Anchor => ({ kind: 'date', when: { precision: 'exact', year: y, month, day: null, hour: null, minute: null } });
const node = (nodeId: string): Anchor => ({ kind: 'node', nodeId });
const e = (id: string) => ({ type: 'entry' as const, id });

async function world() {
  const p = await projects.create({ title: 'Checks' });
  const codexService = createCodexService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
    relationships: createRelationshipService(db, projects.contentChanged).forProject(p.id),
    canon: createCanonService(db, projects.contentChanged).forProject(p.id),
    continuity: createContinuityService(db, projects.contentChanged).forProject(p.id),
    histories: createHistoryService(db, projects.contentChanged).forProject(p.id),
  };
  const [one, two, three] = [await s.ms.create('chapter', null, 'One'), await s.ms.create('chapter', null, 'Two'), await s.ms.create('chapter', null, 'Three')];
  const [mira, orrin] = [await s.characters.create({ name: 'Mira' }), await s.characters.create({ name: 'Orrin' })];
  const [guild, crown] = [await s.codex.create('faction', 'The Guild'), await s.codex.create('faction', 'The Crown')];
  const model = async () => (await loadModel(db, p.id))!;
  const check = async () => checkRecords(await model(), { facts: await s.canon.list(), rules: await s.continuity.rules() });
  return { p, ...s, one, two, three, mira, orrin, guild, crown, model, check };
}
type World = Awaited<ReturnType<typeof world>>;

/** One record breaking each rule, and nothing else. */
async function everyRule(w: World) {
  // A retconned event, still told in Chapter 1; a canon event after it, and one dated from it.
  const fake = await w.timeline.create('The false coronation');
  await w.timeline.update(fake.id, { canon: 'retconned', nodeIds: [w.one.id], when: { precision: 'exact', year: 2, month: null, day: null, hour: null, minute: null } });
  const feast = await w.timeline.create('The feast');
  await w.timeline.update(feast.id, { afterId: fake.id });
  const aftermath = await w.timeline.create('The aftermath');
  await w.timeline.update(aftermath.id, { when: { precision: 'relative', anchorId: fake.id, amount: 2, unit: 'days', direction: 'after' } });
  // Allied throughout, and at war in Years 3 to 5.
  await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'allied-with' });
  await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'at-war-with', validity: { from: year(3), until: year(5) } });
  // Stops (Chapter 1) before it starts (Chapter 3); a month the calendar does not have; timed by an event since deleted; begins at the retconned event.
  await w.connections.create({ from: e(w.mira.id), to: e(w.guild.id), type: 'member-of', validity: { from: node(w.three.id), until: node(w.one.id) } });
  await w.connections.create({ from: e(w.orrin.id), to: e(w.crown.id), type: 'member-of', validity: { from: year(4, 14), until: null } });
  const doomed = await w.timeline.create('A council');
  await w.connections.create({ from: e(w.orrin.id), to: e(w.guild.id), type: 'leads', validity: { from: { kind: 'event', eventId: doomed.id }, until: null } });
  await w.timeline.remove(doomed.id);
  await w.connections.create({ from: e(w.mira.id), to: e(w.crown.id), type: 'leads', validity: { from: { kind: 'event', eventId: fake.id }, until: null } });
  // Mira dies in Chapter 1, yet appears in Chapter 2, takes part in an event told only in Chapter 3, and her relationship changes there.
  await w.continuity.createRule('status', { entryId: w.mira.id, state: 'deceased', fromNodeId: w.one.id, label: 'killed at the gate' });
  await w.ms.updatePlan(w.two.id, { appearIds: [w.mira.id] });
  const haunting = await w.timeline.create('The haunting');
  await w.timeline.update(haunting.id, { characters: [{ id: w.mira.id, age: null }], nodeIds: [w.three.id] });
  const bond = await w.relationships.create(w.mira.id, w.orrin.id, 'friends');
  await w.relationships.recordChange(bond.id, { nodeId: w.three.id }, { preset: 'rivals', label: 'Rivals' });
  // A retconned statement with nothing in its place; a canon one established at the retconned event.
  await w.canon.create({ subject: 'The crown', statement: 'Was forged in Year 1', status: 'retconned' });
  const sworn = await w.canon.create({ subject: 'The oath', statement: 'Sworn at the coronation', status: 'canon' });
  await w.canon.addSource(sworn.id, { type: 'event', refId: fake.id });
  return { fake, feast, aftermath, haunting, bond, sworn };
}

describe('the record check’s canon and continuity rules', () => {
  it('each rule raises a finding that says its rule and the data behind it', async () => {
    const w = await world();
    const { fake, feast, aftermath, haunting, bond, sworn } = await everyRule(w);
    const found = await w.check();
    expect(new Set(found.map((f) => f.rule))).toEqual(new Set(RECORD_RULES));
    for (const f of found) {
      expect(f.key.startsWith(`records|${f.rule}|`)).toBe(true);
      expect(f.message.length).toBeGreaterThan(10);
      expect(f.because.length).toBeGreaterThan(10);
      expect(RECORD_RULE_TEXT[f.rule].rule.length).toBeGreaterThan(10);
    }
    const said = (rule: string) => found.filter((f) => f.rule === rule).map((f) => `${f.message} | ${f.because}`);
    expect(said('rests-on')).toEqual(
      expect.arrayContaining([
        `“The feast” is set to come after “The false coronation”, which is marked Retconned. | “The feast” is Canon, and its “Comes after” is “The false coronation”, whose canon status is Retconned.`,
        expect.stringMatching(/^“The aftermath” is dated from “The false coronation”, which is marked Retconned\. \| Its date reads “.*The false coronation.*”/),
        `The connection “Mira leads The Crown” has its start at “The false coronation”, which is marked Retconned. | The connection is Confirmed; “The false coronation” has the canon status Retconned.`,
        `The canon statement “The oath: Sworn at the coronation” is established at “The false coronation”, which is marked Retconned. | One of its sources is the timeline event “The false coronation”, whose canon status is Retconned.`,
      ]),
    );
    expect(said('still-told')).toEqual([`“The false coronation” is marked Retconned, but is still recorded as told in Ch 1: One. | Its canon status is Retconned, and its chapters and scenes list one.`]);
    expect(said('opposed')).toEqual([`The Guild and The Crown are recorded as allied and at war at the same time. | “Allied with”: no time given (Confirmed). “At war with”: from Year 3 until Year 5 (Confirmed).`]);
    expect(said('after-death')).toEqual(
      expect.arrayContaining([
        `Mira appears in Ch 2: Two, after their recorded death. | Continuity → Tracked: Mira is “killed at the gate” (Deceased) from Ch 1: One. The appearance record of Ch 2: Two lists them as on the page.`,
        `Mira takes part in “The haunting”, told only after their recorded death. | Continuity → Tracked: Mira is “killed at the gate” (Deceased) from Ch 1: One. “The haunting” lists them as taking part, and is told in Ch 3: Three.`,
        `Mira’s relationship with Orrin changes to “Rivals” in Ch 3: Three, after their recorded death. | Continuity → Tracked: Mira is “killed at the gate” (Deceased) from Ch 1: One. That stage of the relationship starts at Ch 3: Three.`,
      ]),
    );
    expect(said('ends-first')).toEqual([`The connection “Mira member of The Guild” stops before it starts. | It starts Ch 3: Three and stops Ch 1: One, which comes earlier.`]);
    expect(said('calendar')).toEqual([expect.stringMatching(/^The connection “Orrin member of The Crown”: its start is not in the calendar\. \| Month 14 is not in the calendar\.$/)]);
    expect(said('gone')).toEqual([`The connection “Orrin leads The Guild” has its start at a timeline event that no longer exists. | Its start pointed at a timeline event that has been deleted, so when it holds cannot be worked out.`]);
    expect(said('replacement')).toEqual([`The statement “The crown: Was forged in Year 1” is marked Retconned, but names no statement that replaced it. | Retconned means it was true once and has been officially replaced. Its “Replaced by” is empty.`]);
    // Each finding points at the records it is about, for the views to mark.
    const on = (rule: string) => found.filter((f) => f.rule === rule).flatMap((f) => f.on);
    expect(on('rests-on')).toEqual(expect.arrayContaining([`event:${feast.id}`, `event:${aftermath.id}`, `event:${fake.id}`, `fact:${sworn.id}`]));
    expect(on('after-death')).toEqual(expect.arrayContaining([`entry:${w.mira.id}`, `node:${w.two.id}`, `event:${haunting.id}`, `relation:${bond.id}`]));
  });

  it('raises nothing when the records do not hold what a rule needs', async () => {
    const w = await world();
    // Allied until Year 3, at war from Year 3: one ends where the other starts. A time on another scale (a chapter against a date) cannot be compared.
    await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'allied-with', validity: { from: null, until: year(3) } });
    await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'at-war-with', validity: { from: year(3), until: null } });
    await w.connections.create({ from: e(w.mira.id), to: e(w.guild.id), type: 'member-of', validity: { from: node(w.three.id), until: year(1) } });
    // Mira dies in Chapter 2 and returns in Chapter 3: an appearance in Chapter 1 and one in Chapter 3 are both fine.
    await w.continuity.createRule('status', { entryId: w.mira.id, state: 'deceased', fromNodeId: w.two.id, untilNodeId: w.three.id });
    await w.ms.updatePlan(w.one.id, { appearIds: [w.mira.id] });
    await w.ms.updatePlan(w.three.id, { appearIds: [w.mira.id] });
    // Told in Chapter 2 and Chapter 3: not only after her death.
    const haunting = await w.timeline.create('The haunting');
    await w.timeline.update(haunting.id, { characters: [{ id: w.mira.id, age: null }], nodeIds: [w.one.id, w.three.id] });
    // A retconned event told nowhere, that nothing rests on; a non-canon connection at it.
    const fake = await w.timeline.create('The false coronation');
    await w.timeline.update(fake.id, { canon: 'non-canon' });
    await w.connections.create({ from: e(w.orrin.id), to: e(w.crown.id), type: 'leads', canon: 'non-canon', validity: { from: { kind: 'event', eventId: fake.id }, until: null } });
    // A retconned statement that names its replacement.
    const now = await w.canon.create({ subject: 'The crown', statement: 'Was forged in Year 3', status: 'canon' });
    const old = await w.canon.create({ subject: 'The crown', statement: 'Was forged in Year 1', status: 'retconned' });
    await w.canon.update(old.id, { replacedById: now.id });
    expect(await w.check()).toEqual([]);
  });

  it('gives the same findings, with the same keys, every time, whatever order the records come in, and changes nothing', async () => {
    const w = await world();
    await everyRule(w);
    const model = await w.model();
    const facts = await w.canon.list();
    const rules = await w.continuity.rules();
    const tables = async () => JSON.stringify(await Promise.all(['timelineEvents', 'loreLinks', 'loreEntries', 'chapters', 'chapterPlans', 'characterRelations', 'canonFacts', 'continuityRules', 'continuityResolutions'].map((t) => db.table(t).toArray())));
    const before = await tables();
    const once = checkRecords(model, { facts, rules });
    const reordered = checkRecords({ ...model, links: [...model.links].reverse(), events: new Map([...model.events].reverse()) }, { facts: [...facts].reverse(), rules: [...rules].reverse() });
    expect(reordered).toEqual(once);
    expect(checkRecords(model, { facts, rules }).map((f) => f.key)).toEqual(once.map((f) => f.key));
    expect(await tables()).toBe(before);
  });

  it('keeps a decision: intentional or dismissed, it leaves the open list and comes back when reopened; the continuity check does not call it stale', async () => {
    const w = await world();
    await everyRule(w);
    const found = await w.check();
    const appears = found.find((f) => f.rule === 'after-death' && f.on.includes(`node:${w.two.id}`))!;
    await w.continuity.resolve({ key: appears.key, message: appears.message, nodeId: '' }, 'intentional', 'Flashback sequence');
    const decisions = await w.continuity.resolutions();
    const split = withDecisions(await w.check(), decisions, 'records|');
    expect(split.open.map((f) => f.key)).not.toContain(appears.key);
    expect(split.decided.map((d) => [d.finding.key, d.decision.note])).toEqual([[appears.key, 'Flashback sequence']]);
    const model = await w.model();
    expect(audit({ nodes: [...model.nodes.values()], docs: new Map(), entries: [...model.entries.values()], rules: await w.continuity.rules(), resolutions: decisions }).stale).toEqual([]);
    await w.continuity.reopen(decisions[0].id);
    expect(withDecisions(await w.check(), await w.continuity.resolutions(), 'records|').open.map((f) => f.key)).toContain(appears.key);
  });

  it('in an alternate history, a time given by an event the history leaves out is that history’s, not a deleted record', async () => {
    const w = await world();
    const council = await w.timeline.create('A council');
    await w.connections.create({ from: e(w.orrin.id), to: e(w.guild.id), type: 'leads', validity: { from: { kind: 'event', eventId: council.id }, until: null } });
    const history = await w.histories.create({ name: 'No council' });
    await w.histories.removeEvent(history.id, council.id);
    const main = await w.model();
    const shown = withHistory(main, new Map((await w.histories.list()).map((h) => [h.id, h])), history.id);
    expect(shown.events.has(council.id)).toBe(false);
    expect(checkRecords(shown, { facts: [], rules: [], known: new Set(main.events.keys()) })).toEqual([]);
    // Deleted from the novel itself, it is gone.
    await w.timeline.remove(council.id);
    expect((await w.check()).map((f) => f.rule)).toEqual(['gone']);
  });
});

describe('canon and continuity markers', () => {
  it('marks statuses, an alternate branch, and the open findings of every check on the records they are about', async () => {
    const w = await world();
    const { fake, feast } = await everyRule(w);
    const unsure = await w.timeline.create('The parley');
    await w.timeline.update(unsure.id, { canon: 'provisional' });
    const disputed = await w.connections.create({ from: e(w.orrin.id), to: e(w.mira.id), type: 'distrusts', canon: 'conflicting' });
    // The timeline review: dated (Year 1) before the event it comes after (Year 2).
    await w.timeline.update(feast.id, { when: { precision: 'exact', year: 1, month: null, day: null, hour: null, minute: null } });
    // The canon review: two statements that may disagree, about Mira.
    await w.canon.create({ subject: 'Eyes', statement: 'Green', status: 'canon', entryIds: [w.mira.id] });
    await w.canon.create({ subject: 'Eyes', statement: 'Grey', status: 'provisional', entryIds: [w.mira.id] });
    const model = await w.model();
    const facts = await w.canon.list();
    const rules = await w.continuity.rules();
    const overlay = canonOverlay(model, {
      records: checkRecords(model, { facts, rules }),
      timeline: reviewTimeline(model, rules),
      canon: reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()]).reviews,
      // The manuscript check's findings, as it gives them.
      continuity: [{ key: 'status|x', severity: 'critical', category: 'status', message: 'Mira appears to act after being recorded as deceased.', nodeId: w.three.id, nodeTitle: 'Three', block: 0, excerpt: 'Mira laughed.', match: 'Mira', entryIds: [w.mira.id], ruleId: null, fix: null, fixSummary: '' }],
      history: { name: 'No feast', status: 'Alternate Canon', changed: new Set([unsure.id, feast.id]), added: new Set() },
    });
    expect(overlay.get(`event:${unsure.id}`)!.status).toMatchObject({ key: 'provisional', label: 'Provisional', glyph: '?' });
    expect(overlay.get(`event:${fake.id}`)!.status).toMatchObject({ key: 'retconned', glyph: '↺' });
    expect(overlay.get(`link:${disputed.id}`)!.status).toMatchObject({ key: 'conflicting', label: 'Disputed' });
    // Changed in the history shown, and plain canon otherwise: an alternate branch.
    expect(overlay.get(`event:${feast.id}`)!.status).toMatchObject({ key: 'alternate', label: 'Alternate branch: goes differently in “No feast” (Alternate Canon)' });
    const sources = (key: string) => new Set(overlay.get(key)!.warnings.map((x) => x.source));
    expect(sources(`event:${feast.id}`)).toEqual(new Set(['records', 'timeline']));
    expect(sources(`entry:${w.mira.id}`)).toEqual(new Set(['records', 'canon', 'continuity']));
    expect(sources(`node:${w.three.id}`)).toEqual(new Set(['continuity']));
    // Every warning carries its rule and the data behind it; the most serious first.
    const mira = overlay.get(`entry:${w.mira.id}`)!;
    for (const x of mira.warnings) expect([x.title, x.rule, x.message, x.because].every((t) => t.length > 3)).toBe(true);
    expect(mira.warnings[0].severity).toBe('critical');
    expect(markWords(mira)).toBe(`${mira.warnings.length} to check, ${mira.warnings.filter((x) => x.severity === 'critical').length} critical.`);
    expect(badgeOf(overlay.get(`event:${unsure.id}`))).toEqual({ glyph: '?', tone: 'status' });
    expect(badgeOf(overlay.get(`event:${feast.id}`))!.glyph).toMatch(/^A!\d+$/);
    // Several records as one (a plot-board cell): the status that most needs a look, and every finding once.
    const cell = mergeMarks([overlay.get(`event:${unsure.id}`), overlay.get(`event:${fake.id}`), overlay.get(`event:${fake.id}`)])!;
    expect(cell.status!.key).toBe('retconned');
    expect(cell.warnings.length).toBe(overlay.get(`event:${fake.id}`)!.warnings.length);
    expect(mergeMarks([undefined, { status: null, warnings: [] }])).toBeNull();
  });
});
