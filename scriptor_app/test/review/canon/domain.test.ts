// Canon statements and "What depends on this", ported from flutter_app/test/shared/domain/canon_changes_test.dart (the
// canon part: the tracked rules' part is the continuity port's) and consequences_test.dart (every report of the
// original app's consequences.golden.json, replayed whole).

import { join } from 'node:path';

import { CanonChanges } from '../../../src/domain/canon/canonChanges';
import { dismissedOf, factSources } from '../../../src/domain/canon/facts';
import { ChangeRefused } from '../../../src/domain/codex/codexChanges';
import { type Consequence, type Subject, analyze, worldFromRows } from '../../../src/domain/consequences/consequences';
import { type JsonMap, listOf, mapOrNull, str } from '../../../src/domain/json';
import { textToDoc } from '../../../src/domain/prose';
import { CanonFact } from '../../../src/domain/records/canon';
import { maps } from '../../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

class Novel {
  snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'Canon' }, collections: {} });
  clock = 1000;
  private ids = 0;

  canon<T>(change: (c: CanonChanges) => T): T {
    const c = new CanonChanges(this.snapshot, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const result = change(c);
    this.snapshot = c.snapshot;
    return result;
  }

  fact(id: string): CanonFact {
    return new CanonFact(this.snapshot.rows('canonFacts').find((f) => f['id'] === id)!);
  }
}

test('a statement starts Provisional; an established one is revised, never overwritten, and its history kept', () => {
  const n = new Novel();
  const f = n.canon((c) => c.create({ subject: 'Royal Academy', statement: 'Founded 1,000 years ago' }));
  expect(f.status).toBe('provisional');
  n.canon((c) => c.update(f.id, { statement: 'Founded 900 years ago' }));
  n.canon((c) => c.setStatus(f.id, 'canon', 'Decided'));
  expect(() => n.canon((c) => c.update(f.id, { statement: 'Founded 500 years ago' }))).toThrow(ChangeRefused);
  n.canon((c) => c.revise(f.id, 'Founded 500 years ago', { reason: 'Book two' }));
  const history = n.fact(f.id).history;
  expect(history.map((h) => h['kind'])).toEqual(['created', 'status', 'retcon']);
  const last = history[history.length - 1];
  expect([last['statement'], last['newStatement'], last['reason']]).toEqual(['Founded 900 years ago', 'Founded 500 years ago', 'Book two']);
  n.canon((c) => c.annotate(f.id, str(history[1]['id']), 'Settled in the outline'));
  expect(n.fact(f.id).history[1]['reason']).toBe('Settled in the outline');
  // The step itself is unchanged.
  expect(n.fact(f.id).history[1]['toStatus']).toBe('canon');
});

test('a source in a chapter is pinned to the paragraph its quote is in; one pointing nowhere is a note', () => {
  const n = new Novel();
  n.snapshot = n.snapshot
    .putRow('chapters', { id: 'c1', projectId: 'novel', kind: 'chapter', title: 'Chapter 1', order: 0 })
    .putRow('chapterContents', { id: 'c1', projectId: 'novel', doc: textToDoc('First.\nThe Academy was founded long ago.') });
  const f = n.canon((c) => c.create({ statement: 'Old' }));
  const s = n.canon((c) => c.addSource(f.id, { type: 'chapter', refId: 'c1', quote: 'founded LONG ago' }));
  expect([s.type, s.block]).toEqual(['chapter', 1]);
  const lost = n.canon((c) => c.addSource(f.id, { type: 'event', refId: 'gone', note: 'my notebook' }));
  expect([lost.type, lost.refId, lost.note]).toEqual(['note', null, 'my notebook']);
  n.canon((c) => c.removeSource(f.id, s.id));
  expect(factSources(n.fact(f.id)).map((x) => x.id)).toEqual([lost.id]);
});

test('contradictions are linked and unlinked from either side; set aside and brought back', () => {
  const n = new Novel();
  const a = n.canon((c) => c.create({ statement: 'Two moons' }));
  const b = n.canon((c) => c.create({ statement: 'One moon' }));
  n.canon((c) => c.linkConflict(a.id, b.id));
  n.canon((c) => c.linkConflict(a.id, a.id));
  expect(n.fact(a.id).conflictsWith).toEqual([b.id]);
  n.canon((c) => c.unlinkConflict(b.id, a.id));
  expect(n.fact(a.id).conflictsWith).toEqual([]);
  n.canon((c) => c.dismiss(b.id, { factId: a.id, entryId: null, field: null }));
  n.canon((c) => c.dismiss(b.id, { factId: a.id, entryId: null, field: null }));
  expect(dismissedOf(n.fact(b.id))).toHaveLength(1);
  n.canon((c) => c.undismiss(a.id));
  // What was set aside from the other side comes back too.
  expect(dismissedOf(n.fact(b.id))).toEqual([]);
  n.canon((c) => c.removeFact(a.id));
  expect(n.snapshot.rows('canonFacts').map((f) => f['id'])).toEqual([b.id]);
});

// ---------------------------------------------------------------------------------------------- what depends on this

const golden = readJson(join(flutterFixturesDir, 'golden', 'consequences.golden.json')) as Record<string, unknown>;

const subjectOf = (s: JsonMap): Subject =>
  s['type'] === 'node'
    ? { kind: 'node', nodeId: str(s['nodeId']) }
    : s['type'] === 'event'
      ? { kind: 'event', eventId: str(s['eventId']) }
      : { kind: 'beat', threadId: str(s['threadId']), beatId: str(s['beatId']) };

const consequenceOut = (c: Consequence): JsonMap => ({
  key: c.key,
  tier: c.tier,
  kind: c.kind === 'characterState' ? 'character-state' : c.kind,
  message: c.message,
  basis: c.basis,
  target: c.target,
  ...(c.excerpt !== null ? { excerpt: c.excerpt } : {}),
  ...(c.match !== null ? { match: c.match } : {}),
  ...(c.nodeId !== null ? { nodeId: c.nodeId } : {}),
  entryIds: c.entryIds,
  ...(c.threadId !== null ? { threadId: c.threadId } : {}),
  ...(c.relationId !== null ? { relationId: c.relationId } : {}),
  ...(c.eventId !== null ? { eventId: c.eventId } : {}),
  ...(c.factId !== null ? { factId: c.factId } : {}),
});

for (const name of Object.keys(golden)) {
  test(`${name}: every report agrees with the original`, () => {
    const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);
    const world = worldFromRows((c) => s.rows(c));
    for (const c of maps(golden[name])) {
      const r = analyze(world, subjectOf(mapOrNull(c['subject'])!), {
        include: listOf(c['include']).map((x) => str(x)),
        exclude: listOf(c['exclude']).map((x) => str(x)),
      });
      expectJson(
        {
          title: r.title,
          found: r.found,
          anchorIds: r.anchorIds,
          seeds: r.seeds.map((e) => e['id']),
          suggested: r.suggested.map((e) => e['id']),
          established: r.established.map(consequenceOut),
          potential: r.potential.map(consequenceOut),
          summary: r.summary.map((p) => ({ label: p.label, count: p.count })),
          summaryLine: r.summaryLine,
          downstream: r.downstream,
        },
        c['report'],
        `${name} ${String(c['label'])}`,
      );
    }
  });
}
