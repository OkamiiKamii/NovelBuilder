import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bigNovel } from '../../../e2e/bigNovel.mjs';
import { analyticsCharts } from '@/modules/analytics/charts';
import { computeAnalytics } from '@/modules/analytics/compute';
import { abilityTree } from '@/modules/abilities/paths';
import { checkRecords } from '@/modules/canon/checks';
import { canonOverlay } from '@/modules/canon/overlay';
import { reviewCanon } from '@/modules/canon/review';
import type { CanonFact } from '@/modules/canon/types';
import { appearanceMatrix } from '@/modules/characters/appearances';
import type { ContinuityRule } from '@/modules/continuity/types';
import { factionAt, factionsOf } from '@/modules/factions/ties';
import { collapseGraph, knowledgeGraph, limitGraph, queryGraph } from '@/modules/graph/knowledge';
import { brokenReferences, duplicateCandidates } from '@/modules/integrity/rules';
import { deriveConnections } from '@/modules/model/connections';
import { buildModel, type ModelRows } from '@/modules/model/model';
import { detailsOf, relatedIds } from '@/modules/model/navigate';
import { select } from '@/modules/model/query';
import { placeTree } from '@/modules/places/explore';
import { threadLanes } from '@/modules/plot/lanes';
import { layoutNetwork, relationNetwork } from '@/modules/relationships/network';
import { collectWarnings } from '@/modules/review/collect';
import { lengthBars } from '@/modules/structure/pacing';
import { reviewTimeline } from '@/modules/timeline/review';
import { travelProblems } from '@/modules/travel/routes';
import { timelineRows } from '@/modules/visualize/summaries';

/**
 * SPEED WITH A LARGE NOVEL
 * The computations each view runs, timed on the benchmark novel
 * (`e2e/bigNovel.mjs`: 2,000 events, 1,550 codex entries, 4,000 connections,
 * 603 parts, 800 relationships…). Each is the best of three runs, printed as
 * a table, and held to a budget a few times what it takes now, so a change
 * that makes one much slower fails here. The browser side is `npm run test:perf`.
 */

const rows = bigNovel('p', 0, 1);
const input = (): ModelRows => ({ project: { id: 'p', title: 'Large Novel' } as never, nodes: rows.chapters as never, plans: rows.chapterPlans as never, entries: rows.loreEntries as never, schemas: rows.loreSchemas as never, links: rows.loreLinks as never, relations: rows.characterRelations as never, events: rows.timelineEvents as never, threads: rows.plotThreads as never, systems: [], sheets: [], journeys: rows.journeys as never });
const facts = rows.canonFacts as unknown as CanonFact[];
const rules = rows.continuityRules as unknown as ContinuityRule[];

/** The best of three runs, in milliseconds. */
function time<T>(work: () => T): { ms: number; value: T } {
  let best = Infinity;
  let value!: T;
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    value = work();
    best = Math.min(best, performance.now() - started);
  }
  return { ms: Math.round(best * 10) / 10, value };
}

describe('speed with a large novel', () => {
  it('each view’s computation, within its budget', () => {
    const model = buildModel(input());
    const character = { type: 'entry' as const, id: 'p-char5' };
    const results: [string, number, number][] = [];
    const measure = <T,>(name: string, budget: number, work: () => T): T => {
      const { ms, value } = time(work);
      results.push([name, ms, budget]);
      return value;
    };
    measure('build the model from the rows', 1500, () => buildModel(input()));
    measure('derive every connection', 1500, () => deriveConnections(model));
    measure('timeline rows (Timeline, list)', 1500, () => timelineRows(model));
    measure('page filter: involving a character', 1500, () => select(model, { characters: ['p-char5'], types: ['event'] }));
    measure('what is related to a selection', 1500, () => relatedIds(model, character));
    measure('a selection’s details', 1500, () => detailsOf(model, character));
    const network = measure('relationship network', 1500, () => relationNetwork(model, { when: { kind: 'current' } }));
    measure('relationship map layout', 3000, () => layoutNetwork(network.nodes, network.edges));
    const graph = measure('knowledge graph', 1500, () => knowledgeGraph(model));
    measure('knowledge graph: query, fold, limit', 1500, () => limitGraph(collapseGraph(queryGraph(graph, { hiddenNodes: new Set(), hiddenEdges: new Set(), hiddenStatuses: new Set(), isolated: false }), { types: new Set() }, (t, n) => `${n} ${t}`).graph, 150));
    measure('plot lanes', 1500, () => threadLanes(model));
    measure('lengths by chapter', 1500, () => lengthBars(model, { grain: 'chapters', partId: null }));
    measure('appearance matrix', 1500, () => appearanceMatrix(model, { grain: 'chapters' }));
    measure('place tree', 1500, () => placeTree(model));
    measure('ability tree', 1500, () => abilityTree(model));
    measure('journeys: problems', 1500, () => travelProblems(model, model.journeys, null));
    measure('factions: one faction now', 1500, () => factionsOf(model).map((f) => factionAt(model, f.id, 'end')));
    measure('charts', 1500, () => analyticsCharts(model, { from: null, to: null, threadId: null, povId: null, label: null, yearFrom: null, yearTo: null, grain: 'chapters', count: 'any' }));
    const records = measure('record check: canon and continuity rules', 1500, () => checkRecords(model, { facts, rules }));
    const timeline = measure('timeline review', 1500, () => reviewTimeline(model, rules));
    const canon = measure('canon review', 1500, () => reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()]));
    measure('canon and continuity markers', 1500, () => canonOverlay(model, { records, timeline, canon: canon.reviews, continuity: [] }));
    measure('record check: broken references', 1500, () => brokenReferences(model));
    measure('record check: look-alike names', 1500, () => duplicateCandidates([...model.entries.values()]));
    measure('dashboard analytics', 1500, () => computeAnalytics({ targetWordCount: 100_000, nodes: rows.chapters as never, docs: new Map(), plans: rows.chapterPlans as never, entries: rows.loreEntries as never, relations: rows.characterRelations as never, snapshots: [], threads: rows.plotThreads as never, sessions: [], goals: [], now: 0 }));
    measure('continuity review: every warning', 3000, () => collectWarnings('p', { model, facts, rules, markers: [], aliases: new Map(), secrets: [], travel: { settings: null, maps: [], pins: [] }, snapshots: [], manuscript: [] }));

    const table = `\n${'Computation'.padEnd(44)}${'ms'.padStart(9)}${'budget'.padStart(9)}\n${results.map(([name, ms, budget]) => `${name.padEnd(44)}${String(ms).padStart(9)}${String(budget).padStart(9)}`).join('\n')}\n`;
    process.stdout.write(table);
    // PERF_TABLE names a file to keep the table in, to compare runs.
    if (process.env.PERF_TABLE) writeFileSync(process.env.PERF_TABLE, table);
    const over = results.filter(([, ms, budget]) => ms > budget).map(([name, ms, budget]) => `${name}: ${ms} ms (budget ${budget})`);
    expect(over).toEqual([]);
  }, 300_000);
});
