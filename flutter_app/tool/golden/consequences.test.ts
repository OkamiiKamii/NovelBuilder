// Reference outputs of the original app's "What depends on this" (consequence analysis), for the Flutter rebuild: the
// report for every chapter, scene and group, every event and every plot development of each fixture novel, and some
// with entries the author added or removed.
// Run as the other golden scripts: GOLDEN_OUT=<dir> FIXTURES=<flutter_app/test/fixtures> npx vitest run golden/consequences.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { analyze, type Subject, type World } from '@/modules/consequences/analyze';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES = process.env.FIXTURES!;
const NOVELS = ['qa-sample', 'made-in-the-app', 'analytics', 'canon', 'book'];
type Row = Record<string, unknown>;

test('consequence goldens', () => {
  const out: Record<string, unknown> = {};
  for (const name of NOVELS) {
    const c = JSON.parse(readFileSync(join(FIXTURES, `${name}.novel.json`), 'utf8')).collections;
    const rows = (k: string): Row[] => c[k] ?? [];
    // As the original stores them: list fields present, even when empty.
    const world: World = {
      nodes: rows('chapters').map((n) => ({ title: '', mentions: [], ...n })) as never,
      docs: new Map(rows('chapterContents').map((r) => [r.id as string, r.doc])),
      plans: rows('chapterPlans').map((p) => ({ entityIds: [], ...p })) as never,
      entries: rows('loreEntries').map((e) => ({ name: '', ...e })) as never,
      relations: rows('characterRelations').map((r) => ({ stages: [], ...r, stages: ((r.stages as Row[]) ?? []).map((s) => ({ title: '', label: '', event: '', ...s })) })) as never,
      threads: rows('plotThreads').map((t) => ({ beats: [], characterIds: [], locationIds: [], ...t })) as never,
      events: rows('timelineEvents').map((e) => ({ nodeIds: [], characters: [], entryIds: [], when: {}, ...e })) as never,
      facts: rows('canonFacts').map((f) => ({ sources: [], entryIds: [], ...f })) as never,
      rules: rows('continuityRules') as never,
      snapshots: rows('progressSnapshots').map((s) => ({ gear: [], status: {}, systems: {}, ...s })) as never,
      systems: rows('systems') as never,
    };
    const subjects: { label: string; subject: Subject; include?: string[]; exclude?: string[] }[] = [
      ...rows('chapters').map((n) => ({ label: `node ${n.id}`, subject: { type: 'node', nodeId: n.id } as Subject })),
      ...rows('timelineEvents').map((e) => ({ label: `event ${e.id}`, subject: { type: 'event', eventId: e.id } as Subject })),
      ...rows('plotThreads').flatMap((t) => ((t.beats as Row[]) ?? []).map((b) => ({ label: `beat ${t.id}/${b.id}`, subject: { type: 'beat', threadId: t.id, beatId: b.id } as Subject }))),
      { label: 'a removed chapter', subject: { type: 'node', nodeId: 'gone' } },
    ];
    // The author's own choices: one entry added to the first chapter's analysis, one worked-out entry removed.
    const first = rows('chapters').find((n) => n.kind === 'chapter');
    const entryIds = rows('loreEntries').map((e) => e.id as string);
    if (first && entryIds.length) {
      const base = analyze(world, { type: 'node', nodeId: first.id as string });
      subjects.push({ label: 'with an entry added', subject: { type: 'node', nodeId: first.id as string }, include: [entryIds[entryIds.length - 1]] });
      if (base.suggested.length) subjects.push({ label: 'with an entry removed', subject: { type: 'node', nodeId: first.id as string }, exclude: [base.suggested[0].id] });
    }
    out[name] = subjects.map(({ label, subject, include, exclude }) => {
      const r = analyze(world, subject, { include, exclude });
      return {
        label,
        subject,
        include: include ?? [],
        exclude: exclude ?? [],
        report: {
          title: r.title,
          found: r.found,
          anchorIds: r.anchorIds,
          seeds: r.seeds.map((e) => e.id),
          suggested: r.suggested.map((e) => e.id),
          established: r.established,
          potential: r.potential,
          summary: r.summary,
          summaryLine: r.summaryLine,
          downstream: r.downstream,
        },
      };
    });
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'consequences.golden.json'), JSON.stringify(out));
});
