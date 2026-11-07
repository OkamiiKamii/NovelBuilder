import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCanonService, registerCanon } from '@/modules/canon/service';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { audit } from '@/modules/continuity/audit';
import { createContinuityService, registerContinuity } from '@/modules/continuity/service';
import type { Issue } from '@/modules/continuity/types';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { routeFor } from '@/modules/model/navigate';
import type { Anchor } from '@/modules/model/validity';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { reviewTimeline, withDecisions } from '@/modules/timeline/review';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { createTravelService, registerTravel } from '@/modules/travel/service';
import { decodeSelection } from '@/modules/viz/params';
import { collectWarnings, withStatus, type ReviewInput } from './collect';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`review-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerCanon(registry);
  registerContinuity(registry);
  registerTravel(registry);
});

const date = (y: number) => ({ precision: 'exact' as const, year: y, month: null, day: null, hour: null, minute: null });
const year = (y: number): Anchor => ({ kind: 'date', when: date(y) });
const e = (id: string) => ({ type: 'entry' as const, id });

async function world() {
  const p = await projects.create({ title: 'Review' });
  const codexService = createCodexService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
    canon: createCanonService(db, projects.contentChanged).forProject(p.id),
    continuity: createContinuityService(db, projects.contentChanged).forProject(p.id),
    travel: createTravelService(db, projects.contentChanged).forProject(p.id),
  };
  const [one, two] = [await s.ms.create('chapter', null, 'One'), await s.ms.create('chapter', null, 'Two')];
  const [mira, orrin] = [await s.characters.create({ name: 'Mira' }), await s.characters.create({ name: 'Orrin' })];
  const [guild, crown] = [await s.codex.create('faction', 'The Guild'), await s.codex.create('faction', 'The Crown')];
  const [docks, keep] = [await s.codex.create('location', 'The Docks'), await s.codex.create('location', 'The Keep')];
  /** The checks' inputs, as the review page gathers them. */
  const input = async (manuscript: Issue[] | null = null): Promise<ReviewInput> => ({
    model: (await loadModel(db, p.id))!,
    facts: await s.canon.list(),
    rules: await s.continuity.rules(),
    markers: [],
    aliases: new Map(),
    secrets: [],
    travel: { settings: await s.travel.settings(), maps: [], pins: [] },
    snapshots: [],
    manuscript,
  });
  const collect = async (manuscript: Issue[] | null = null) => collectWarnings(p.id, await input(manuscript));
  return { p, ...s, one, two, mira, orrin, guild, crown, docks, keep, input, collect };
}
type World = Awaited<ReturnType<typeof world>>;

/** A found passage, as the manuscript check gives it. */
const passage = (w: World): Issue => ({ key: `status|${w.mira.id}|${w.two.id}|0`, severity: 'critical', category: 'status', message: 'Mira appears to act after being recorded as deceased.', nodeId: w.two.id, nodeTitle: 'Two', block: 0, excerpt: 'Mira laughed.', match: 'Mira', entryIds: [w.mira.id], ruleId: null, fix: null, fixSummary: '' });

/** Records each check has something to say about. */
async function troubled(w: World) {
  // Timeline review: an event that ends before it starts.
  const siege = await w.timeline.create('The siege');
  await w.timeline.update(siege.id, { when: date(5), end: date(3) });
  // Record check: allied and at war at once.
  await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'allied-with' });
  await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'at-war-with' });
  // Record check: a reference to a deleted record.
  const ghost = await w.codex.create('location', 'The Old Mill');
  await w.connections.create({ from: e(w.orrin.id), to: e(ghost.id), type: 'located-in' });
  await db.loreEntries.delete(ghost.id);
  // Record check: two records that look alike.
  await w.codex.create('faction', 'the guild');
  // Canon: two statements that may disagree (noticed), and two the author linked as contradicting.
  await w.canon.create({ subject: 'Eyes', statement: 'Green', status: 'canon', entryIds: [w.mira.id] });
  await w.canon.create({ subject: 'Eyes', statement: 'Grey', status: 'provisional', entryIds: [w.mira.id] });
  const a = await w.canon.create({ subject: 'The founding', statement: 'Year 1', status: 'canon' });
  const b = await w.canon.create({ subject: 'Founded', statement: 'Year 900', status: 'provisional' });
  await w.canon.linkConflict(a.id, b.id);
  // Journeys: arrives before it leaves.
  await w.travel.saveJourney(null, { travellerIds: [w.orrin.id], fromId: w.docks.id, toId: w.keep.id, departure: year(8), arrival: year(7) });
  return { siege };
}

describe('the continuity review', () => {
  it('gathers each check’s warnings, keeping a confirmed data error apart from a possible inconsistency', async () => {
    const w = await world();
    const { siege } = await troubled(w);
    const warnings = await w.collect([passage(w)]);
    const by = (title: string) => warnings.filter((x) => x.title === title);
    expect(new Set(warnings.map((x) => x.source))).toEqual(new Set(['records', 'integrity', 'timeline', 'canon', 'travel', 'continuity']));
    for (const x of warnings) {
      expect(x.key.length).toBeGreaterThan(5);
      expect([x.title, x.rule, x.message, x.because].every((t) => t.trim().length > 3), x.key).toBe(true);
    }
    // Confirmed: records that cannot all be right.
    expect(by('Ends before it starts')).toMatchObject([{ source: 'timeline', certainty: 'error', category: 'dates', severity: 'warning' }]);
    expect(by('Allied and at war at once')).toMatchObject([{ source: 'records', certainty: 'error', category: 'connections' }]);
    expect(by('A reference to a record that no longer exists')).toMatchObject([{ source: 'integrity', certainty: 'error', category: 'references' }]);
    expect(by('Statements you linked as contradicting')).toMatchObject([{ source: 'canon', certainty: 'error' }, { source: 'canon', certainty: 'error' }]);
    expect(by('Arrives before leaving')).toMatchObject([{ source: 'travel', certainty: 'error', category: 'places' }]);
    // Possible: read from likeness or wording.
    expect(by('Records that look like duplicates')).toMatchObject([{ source: 'integrity', certainty: 'possible', category: 'duplicates', severity: 'info' }]);
    expect(by('Statements that may disagree').every((x) => x.certainty === 'possible')).toBe(true);
    expect(warnings.filter((x) => x.source === 'continuity')).toMatchObject([{ certainty: 'possible', severity: 'critical', category: 'characters', because: 'Two, paragraph 1: “Mira laughed.”' }]);
    // The same records, the same warnings and keys.
    expect((await w.collect([passage(w)])).map((x) => x.key)).toEqual(warnings.map((x) => x.key));
    // Navigation: the records open where they are kept; the context opens a visualization with the record selected and the markers on.
    const ends = by('Ends before it starts')[0];
    const model = (await w.input()).model;
    expect(ends.refs).toEqual([{ type: 'event', id: siege.id }]);
    expect(routeFor(w.p.id, model, ends.refs[0])!.to).toBe(`/project/${w.p.id}/timeline?event=${siege.id}`);
    const context = new URL(ends.context!.to, 'http://app');
    expect([context.pathname, context.searchParams.get('marks'), decodeSelection(context.searchParams.get('select'))]).toEqual([`/project/${w.p.id}/visualize/timeline`, '1', { type: 'event', id: siege.id }]);
    const text = warnings.find((x) => x.source === 'continuity')!;
    expect(text.links).toEqual([{ label: 'Open the passage', to: `/project/${w.p.id}/manuscript/${w.two.id}`, state: { jump: { term: 'Mira', block: 0 } } }]);
    expect(by('Statements you linked as contradicting')[0].links[0].to).toMatch(new RegExp(`^/project/${w.p.id}/canon\\?fact=`));
  });

  it('raises nothing from absent information: no dates, no times, no tracked rules, nothing to compare', async () => {
    const w = await world();
    // Undated events, one set to come after the other; a journey with no dates; ties with no time that do not oppose each other.
    const first = await w.timeline.create('The first council');
    const second = await w.timeline.create('The second council');
    await w.timeline.update(second.id, { afterId: first.id, characters: [{ id: w.mira.id, age: null }] });
    await w.travel.saveJourney(null, { travellerIds: [w.orrin.id], fromId: w.docks.id, toId: w.keep.id });
    await w.travel.saveJourney(null, { travellerIds: [w.orrin.id], fromId: w.keep.id, toId: w.docks.id });
    await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'allied-with' });
    await w.connections.create({ from: e(w.mira.id), to: e(w.guild.id), type: 'member-of', validity: { from: { kind: 'node', nodeId: w.two.id }, until: year(3) } });
    // A statement with nothing to compare it with; Mira on the page in Chapter 2, with no status tracked for her.
    await w.canon.create({ subject: 'The crown', statement: 'Forged in fire', status: 'canon' });
    await w.ms.updatePlan(w.two.id, { appearIds: [w.mira.id] });
    expect(await w.collect([])).toEqual([]);
  });

  it('changes a warning’s status, with a note, and keeps it: resolved, intentional, ignored, needs review, open again', async () => {
    const w = await world();
    await troubled(w);
    const warnings = await w.collect();
    const ends = warnings.find((x) => x.title === 'Ends before it starts')!;
    const status = async () => withStatus(await w.collect(), await w.continuity.resolutions(), true).items.find((x) => x.key === ends.key)!;
    expect((await status()).status).toBe('open');

    await w.continuity.resolve({ key: ends.key, message: ends.message, nodeId: '' }, 'review', 'Ask my editor');
    expect(await status()).toMatchObject({ status: 'review', decision: { note: 'Ask my editor' } });
    // Needs review keeps it open on its own page too.
    const review = withDecisions(reviewTimeline((await w.input()).model, []), await w.continuity.resolutions());
    expect(review.open.map((f) => f.key)).toContain(ends.key);

    const first = (await w.continuity.resolutions())[0];
    for (const [kind, note] of [['resolved', 'Fixed in the draft'], ['intentional', 'A calendar change'], ['dismissed', '']] as const) {
      await w.continuity.resolve({ key: ends.key, message: ends.message, nodeId: '' }, kind, note);
      expect(await status()).toMatchObject({ status: kind, decision: { note } });
    }
    // One decision per warning, changed in place, with when it changed.
    const stored = await w.continuity.resolutions();
    expect(stored.length).toBe(1);
    expect(stored[0]).toMatchObject({ id: first.id, createdAt: first.createdAt, kind: 'dismissed' });
    expect(stored[0].updatedAt).toBeGreaterThanOrEqual(first.updatedAt!);
    // A closing decision takes it off its own page's open list.
    expect(withDecisions(reviewTimeline((await w.input()).model, []), stored).open.map((f) => f.key)).not.toContain(ends.key);

    // Kept: a fresh service on the same store reads the same decisions.
    const reopened = createContinuityService(db, projects.contentChanged).forProject(w.p.id);
    expect((await reopened.resolutions()).map((d) => [d.key, d.kind])).toEqual([[ends.key, 'dismissed']]);
    await reopened.reopen(stored[0].id);
    expect((await status()).status).toBe('open');
  });

  it('a decision on a manuscript finding: needs review keeps it open; a decision whose warning is gone is listed, but only once the manuscript is checked', async () => {
    const w = await world();
    const issue = passage(w);
    await w.continuity.resolve(issue, 'review', 'Check the draft');
    const resolutions = await w.continuity.resolutions();
    const model = (await w.input()).model;
    // The manuscript check itself: a finding marked "needs review" stays open.
    const result = audit({ nodes: [...model.nodes.values()], docs: new Map(), entries: [...model.entries.values()], rules: [], resolutions });
    expect(result.resolved).toEqual([]);
    expect(withStatus(await w.collect([issue]), resolutions, true).items.find((x) => x.key === issue.key)!.status).toBe('review');
    // Not raised: before the manuscript is checked, its decisions are not called gone; after, they are.
    expect(withStatus(await w.collect(null), resolutions, false).gone).toEqual([]);
    expect(withStatus(await w.collect([]), resolutions, true).gone.map((d) => d.key)).toEqual([issue.key]);
  });
});
