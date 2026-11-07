import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import type { LoreEntry } from '@/modules/codex/types';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import type { NodeStatus, StoryNode } from '@/modules/manuscript/types';
import type { PlotThread, ThreadStatus } from '@/modules/plot/types';
import { createProgressService, registerProgress } from '@/modules/progress/service';
import type { WritingSession } from '@/modules/progress/types';
import { createProjectService } from '@/modules/projects/service';
import { computeAnalytics, ranges, type AnalyticsInput } from './compute';
import { createAnalyticsService } from './service';

const NOW = new Date(2026, 9, 10, 15, 0).getTime(); // 10 October 2026, a Saturday
const P = 'p';
const node = (id: string, kind: StoryNode['kind'], title: string, order: number, wordCount = 0, more: Partial<StoryNode> = {}): StoryNode => ({ id, projectId: P, parentId: null, kind, title, order, summary: '', notes: '', status: 'drafting', wordCount, charCount: 0, createdAt: 1, updatedAt: 1, ...more });
const entry = (id: string, name: string, category = 'character'): LoreEntry => ({ id, projectId: P, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 1, updatedAt: 1 });
const session = (id: string, day: string, netWords: number, minutes: number): WritingSession => {
  const startedAt = new Date(`${day}T09:00:00`).getTime();
  return { id, projectId: P, day, startedAt, lastActiveAt: startedAt + minutes * 60_000, netWords, added: Math.max(netWords, 0), removed: Math.max(-netWords, 0), saves: 1 };
};
const thread = (id: string, title: string, status: ThreadStatus, category: PlotThread['category'], beatsAt: string[]): PlotThread => ({
  id, projectId: P, title, premise: '', category, customCategory: '', status, characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', notes: '', muted: false, createdAt: 1, updatedAt: 1,
  beats: beatsAt.map((nodeId, i) => ({ id: `${id}-b${i}`, nodeId, title: `Beat ${i + 1}`, note: '', createdAt: i })),
});
const doc = (...paragraphs: string[]) => ({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });

/** Six chapters (one of them holding two scenes), three characters, four threads and a week and a half of sessions. */
function sample(): AnalyticsInput {
  const statuses: NodeStatus[] = ['published', 'final', 'revising', 'drafting', 'planned', 'idea'];
  const words = [1200, 3000, 0, 600, 900, 0];
  const chapters = statuses.map((status, i) => node(`c${i + 1}`, 'chapter', `Chapter ${i + 1}`, i, words[i], { status }));
  const scenes = [node('s1', 'scene', 'Scene A', 0, 400, { parentId: 'c3' }), node('s2', 'scene', 'Scene B', 1, 800, { parentId: 'c3' })];
  chapters[0].mentions = ['marcus'];
  return {
    targetWordCount: 13800, now: NOW,
    nodes: [...chapters, ...scenes],
    docs: new Map<string, unknown>([['c1', doc('Alex woke.')], ['c2', doc('Alex and Marcus argued.', 'Alexander was not there.')], ['s2', doc('Marcus waited.')], ['c5', doc('Only Alex.')]]),
    plans: [{ id: 'c4', projectId: P, objective: '', beats: [], entityIds: ['marcus'], conflict: '' } as never],
    entries: [entry('alex', 'Alex'), entry('marcus', 'Marcus'), entry('vera', 'Vera'), entry('hq', 'Headquarters', 'location')],
    relations: [{ id: 'r1', projectId: P, fromId: 'alex', toId: 'marcus', stages: [], createdAt: 1, updatedAt: 1 }, { id: 'r2', projectId: P, fromId: 'marcus', toId: 'vera', stages: [], createdAt: 1, updatedAt: 1 }],
    snapshots: [{ id: 'n1', entryId: 'alex' }, { id: 'n2', entryId: 'alex' }] as never,
    threads: [thread('t1', 'The Heist', 'active', 'main', ['c1', 'c2', 's1']), thread('t2', 'Who took the ledger', 'active', 'mystery', ['c1']), thread('t3', 'Old Debt', 'resolved', 'character-arc', ['c2']), thread('t4', 'A Rumour', 'paused', 'mystery', []), thread('t5', 'Dropped', 'abandoned', 'subplot', []), thread('t6', 'Rewritten', 'retconned', 'subplot', []), thread('t7', 'Quiet', 'active', 'subplot', [])],
    sessions: [session('a', '2026-10-01', 500, 30), session('b', '2026-10-02', 700, 45), session('c', '2026-10-03', -100, 10), session('d', '2026-10-08', 1500, 120), session('e', '2026-10-09', 300, 20), session('f', '2026-10-10', 400, 25), session('g', '2026-10-10', 200, 15), session('h', '2026-09-01', 2000, 60)],
    goals: [],
  };
}

describe('writing output and sessions', () => {
  it('totals the manuscript and the writing log by day, week and month', () => {
    const { output } = computeAnalytics(sample());
    expect([output.totalWords, output.targetWords, output.percent]).toEqual([6900, 13800, 50]);
    expect([output.today.net, output.week.net, output.month.net]).toEqual([600, 2400, 3500]);
    // 5,500 net words over seven days with writing; 3,500 in the last thirty days.
    expect([output.averagePerWritingDay, output.averagePerDayLast30]).toEqual([786, 117]);
    expect(output.days).toHaveLength(30);
    expect(output.days.at(-1)).toMatchObject({ key: '2026-10-10', net: 600, current: true });
    expect(output.days.find((d) => d.key === '2026-10-03')!.net).toBe(-100);
  });

  it('describes sessions: how many, how long, the longest, and streaks', () => {
    const { sessions } = computeAnalytics(sample());
    expect(sessions).toEqual({
      count: 8, averageWords: 688, averageMinutes: 41, totalMinutes: 325, longestByWords: { words: 2000, day: '2026-09-01' }, longestByTime: { minutes: 120, day: '2026-10-08' },
      currentStreak: 3, longestStreak: 3, writingDays: 7, lastWritingDay: '2026-10-10',
    });
    const empty = computeAnalytics({ ...sample(), sessions: [] });
    expect(empty.sessions).toMatchObject({ count: 0, averageWords: 0, averageMinutes: 0, longestByWords: null, longestByTime: null, currentStreak: 0, longestStreak: 0 });
    expect(empty.output.averagePerWritingDay).toBe(0);
  });
});

describe('manuscript structure', () => {
  it('measures chapters with their scenes, and scenes on their own', () => {
    const { structure } = computeAnalytics(sample());
    expect([structure.chapters, structure.scenes]).toEqual([6, 2]);
    expect(structure.lengths.map((c) => `${c.number}:${c.words}`)).toEqual(['1:1200', '2:3000', '3:1200', '4:600', '5:900', '6:0']);
    // Averages are over what has text: five chapters, two scenes.
    expect([structure.averageChapter, structure.averageScene]).toEqual([1380, 600]);
    expect([structure.longest, structure.shortest]).toMatchObject([{ title: 'Chapter 2', words: 3000, number: 2, nodeId: 'c2' }, { title: 'Chapter 4', words: 600 }]);
  });

  it('sorts chapters into the four lifecycle states', () => {
    expect(computeAnalytics(sample()).structure.pipeline).toEqual([{ key: 'planned', label: 'Planned', count: 2 }, { key: 'drafting', label: 'Drafting', count: 1 }, { key: 'revision', label: 'In Revision', count: 1 }, { key: 'completed', label: 'Completed', count: 2 }]);
    const none = computeAnalytics({ ...sample(), nodes: [], docs: new Map() });
    expect(none.structure).toMatchObject({ chapters: 0, averageChapter: 0, longest: null, shortest: null, lengths: [] });
  });
});

describe('character utilization', () => {
  it('counts a chapter when the character is linked there, planned there or named in its text', () => {
    const { cast } = computeAnalytics(sample());
    expect([cast.total, cast.appearing]).toEqual([3, 2]);
    expect(cast.rows.map((r) => [r.name, r.chapters, r.distribution])).toEqual([['Marcus', [1, 2, 3, 4], '1–4'], ['Alex', [1, 2, 5], '1–2, 5'], ['Vera', [], '']]);
    const marcus = cast.rows[0];
    expect(marcus).toMatchObject({ first: { number: 1, title: 'Chapter 1', nodeId: 'c1' }, latest: { number: 4, title: 'Chapter 4' }, relationships: 2, milestones: 0 });
    expect(marcus.line).toBe('Marcus: appears in 4 chapters, first: Ch. 1, latest: Ch. 4, relationships: 2, progression snapshots: 0');
    expect(cast.rows[1].line).toBe('Alex: appears in 3 chapters, first: Ch. 1, latest: Ch. 5, relationships: 1, progression snapshots: 2');
    expect(cast.rows[2].line).toBe('Vera: no appearances recorded, relationships: 1, progression snapshots: 0');
  });

  it('matches names as whole words and leaves other Codex categories out', () => {
    const { cast } = computeAnalytics(sample());
    // "Alexander" in chapter 2 is not Alex; the location is not a character.
    expect(cast.rows.some((r) => r.name === 'Headquarters')).toBe(false);
    const onlyAlexander = computeAnalytics({ ...sample(), docs: new Map<string, unknown>([['c6', doc('Alexander alone.')]]), plans: [], nodes: sample().nodes.map((n) => ({ ...n, mentions: [] })) });
    expect(onlyAlexander.cast.appearing).toBe(0);
    expect(ranges([1, 2, 3, 5, 8, 9])).toBe('1–3, 5, 8–9');
    expect(ranges([])).toBe('');
  });
});

describe('plot threads', () => {
  it('breaks threads down by status and counts open mysteries and character arcs', () => {
    const { threads } = computeAnalytics(sample());
    expect(threads.total).toBe(7);
    expect(Object.fromEntries(threads.groups.map((g) => [g.label, g.count]))).toEqual({ Active: 3, Resolved: 1, 'Dormant / Paused': 1, Abandoned: 2, Planned: 0 });
    expect([threads.openMysteries, threads.characterArcs]).toEqual([2, 1]);
  });

  it('measures how much of the manuscript each thread touches', () => {
    const { threads } = computeAnalytics(sample());
    const heist = threads.rows.find((t) => t.title === 'The Heist')!;
    expect(heist).toMatchObject({ beats: 3, chapters: [1, 2, 3], density: 0.5, category: 'Main Plot', status: 'active' });
    expect(heist.line).toBe('The Heist: 3 developments in 3 of 6 chapters (50%), chapters 1–3');
    expect(threads.rows.find((t) => t.title === 'A Rumour')!.line).toBe('A Rumour: 0 developments in 0 of 6 chapters (0%)');
    expect(threads.rows[0].title).toBe('The Heist');
  });
});

describe('reporting without judging', () => {
  it('states what the numbers are', () => {
    const { observations } = computeAnalytics(sample());
    expect(observations).toEqual([
      '1 chapter of 6 has no text yet.',
      'The longest chapter with text (“Chapter 2”, 3,000 words) is 5.0 times the length of the shortest (“Chapter 4”, 600 words).',
      '1 character has no appearance recorded in any chapter: Vera.',
      'The active thread “Who took the ledger” has no recorded development across the last 4 written chapters.',
      'The active thread “The Heist” has no recorded development across the last 2 written chapters.',
      '1 active thread has no developments recorded: Quiet.',
    ]);
    const yesterday = computeAnalytics({ ...sample(), sessions: [session('z', '2026-10-07', 100, 5)] });
    expect(yesterday.observations.at(-1)).toBe('The most recent day with writing logged is October 7, 2026.');
  });

  it('never uses a word that passes judgement, whatever the project looks like', () => {
    const extremes: AnalyticsInput[] = [
      sample(),
      { ...sample(), sessions: [], threads: sample().threads.map((t) => ({ ...t, status: 'active' as const, beats: [] })) },
      { ...sample(), nodes: sample().nodes.map((n) => ({ ...n, wordCount: n.kind === 'chapter' && n.id !== 'c2' ? 1 : n.wordCount })), sessions: [session('x', '2025-01-01', -5000, 1)] },
      { ...sample(), nodes: [], docs: new Map(), threads: [], entries: [], sessions: [] },
    ];
    const judgement = /\b(forgot|forgotten|neglect\w*|should|must|too (?:long|short|many|few|slow)|only|just|poor|bad|weak|behind|late|fail\w*|lazy|warning|problem|issue|wrong|mistake|unfortunately|sadly|great|good|well done|impressive|congrat\w*|need to|you)\b/i;
    for (const input of extremes) {
      const report = computeAnalytics(input);
      const sentences = [...report.observations, ...report.cast.rows.map((r) => r.line), ...report.threads.rows.map((r) => r.line)];
      for (const sentence of sentences) expect(sentence, sentence).not.toMatch(judgement);
    }
  });

  it('changes nothing it is given', () => {
    const input = sample();
    const frozen = JSON.stringify({ ...input, docs: [...input.docs] });
    computeAnalytics(input);
    computeAnalytics(input);
    expect(JSON.stringify({ ...input, docs: [...input.docs] })).toBe(frozen);
  });
});

describe('from a live project', () => {
  it('follows writing as it is saved, and reads without writing', async () => {
    const db = new NovelDB('analytics-live');
    const registry = createProjectRegistry();
    const projects = createProjectService(db, registry);
    registerProgress(registry);
    registerManuscript(registry);
    registerCodex(registry);
    const progress = createProgressService(db);
    const manuscript = createManuscriptService(db, projects.contentChanged, progress.recordWriting);
    const codex = createCodexService(db, projects.contentChanged);
    const analytics = createAnalyticsService(db);
    const p = await projects.create({ title: 'Live', targetWordCount: 100 });
    const m = manuscript.forProject(p.id);
    await codex.forProject(p.id).create('character', 'Mira');
    const chapter = await m.create('chapter', null, 'One');
    expect((await analytics.forProject(p.id).report()).output).toMatchObject({ totalWords: 0, percent: 0 });

    await m.saveDoc(chapter.id, doc('Mira ran. Mira ran far.'), { words: 5, characters: 23 });
    let report = await analytics.forProject(p.id).report();
    expect([report.output.totalWords, report.output.today.net, report.sessions.count, report.output.percent]).toEqual([5, 5, 1, 5]);
    expect(report.cast.rows[0].line).toBe('Mira: appears in 1 chapter, first: Ch. 1, latest: Ch. 1, relationships: 0, progression snapshots: 0');

    await m.saveDoc(chapter.id, doc('Mira ran. Mira ran far. And further still, alone.'), { words: 9, characters: 49 });
    report = await analytics.forProject(p.id).report();
    expect([report.output.totalWords, report.output.today.net, report.sessions.count]).toEqual([9, 9, 1]);

    const dump = async () => JSON.stringify(await Promise.all(db.tables.map((t) => t.toArray())));
    const before = await dump();
    for (let i = 0; i < 3; i++) await analytics.forProject(p.id).report();
    expect(await dump()).toBe(before);
    // Another project sees none of it.
    const other = await projects.create({ title: 'Other' });
    expect((await analytics.forProject(other.id).report())).toMatchObject({ output: { totalWords: 0 }, cast: { total: 0 }, sessions: { count: 0 } });
  });
});
