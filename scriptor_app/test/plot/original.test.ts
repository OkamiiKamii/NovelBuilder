// Plot threads and the scene board agree with the original app: the lanes, the threads by chapter, the diagnosis at two
// quiet limits, the board, its filters, every move tried and every undo. Ported from flutter_app/test/shared/domain/
// plot_test.dart: the same report, compared whole with the original app's own golden
// (flutter_app/test/fixtures/golden/plot.golden.json), as the Flutter app compares itself with it. (Its pacing, markers
// and matrices parts are Visualize's: Structure and pacing, Character appearances.)

import { join } from 'node:path';

import type { JsonMap } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { type BoardChange, type BoardPart, type Place, boardChangeWords, boardOf, bulkOf, dropOf, filterBoard, placeOf, undoProblem } from '../../src/domain/plot/board';
import { beatPlace, diagnose } from '../../src/domain/plot/diagnostics';
import { usedLabels } from '../../src/domain/plot/labels';
import { endsOf, gapWords, threadLanes, threadsByNode } from '../../src/domain/plot/lanes';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'plot.golden.json')) as Record<string, Record<string, unknown>>;

const place = (p: Place | null): JsonMap | null => (p === null ? null : { parentId: p.parentId, beforeId: p.beforeId });

const parts = (list: readonly BoardPart[]): JsonMap[] =>
  list.map((p) => ({
    key: p.key,
    parentId: p.parentId,
    path: p.path.map((n) => n.id),
    columns: p.columns.map((c) => ({ chapter: c.chapter.id, words: c.words, scenes: c.scenes.map((s) => [s.node.id, s.words]) })),
    endBeforeId: p.endBeforeId,
  }));

function report(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const nodes = [...model.nodes.values()];
  const lanes = threadLanes(model);
  const threads = [...model.threads.values()];
  const board = boardOf(nodes);
  const firstChapter = nodes.find((n) => n.kind === 'chapter');
  const statusOf = firstChapter?.status ?? 'idea';
  const docs = nodes.filter((n) => n.kind === 'chapter' || n.kind === 'scene');
  const ids = docs.map((n) => n.id);
  const first = docs[0];
  const byNode = threadsByNode(model);
  return {
    lanes: {
      chapters: lanes.chapters,
      lanes: lanes.lanes.map((l) => ({
        thread: l.thread.id,
        cells: l.cells.map((c) => ({
          places: c.places.map((p) => [p.nodeId, p.chapterId, p.beats.map((b) => b.id), p.eventIds]),
          beats: c.beats.map((b) => b.id),
          events: c.eventIds,
          role: c.role,
        })),
        first: l.first,
        last: l.last,
        gaps: l.gaps.map((g) => ({ from: g.from, to: g.to, chapters: g.chapters, words: gapWords(lanes, g) })),
        crossings: l.crossings,
        unplaced: l.unplaced.map((b) => b.id),
        untold: l.untold,
        ends: endsOf(l, lanes),
      })),
    },
    byNode: Object.fromEntries(
      [...byNode].map(([k, v]) => [k, v.map((h) => ({ thread: h.thread.id, roles: h.roles, plain: h.plainIds, events: h.events }))]),
    ),
    diagnosis: Object.fromEntries(
      [5, 20].map((q) => {
        const d = diagnose(threads, nodes, q);
        return [
          `${q}`,
          {
            frontier: d.frontier,
            chapters: d.chapterCount,
            reports: d.reports.map((r) => ({
              thread: r.thread.id,
              beats: r.beats.map((b) => [b.beat.id, b.node?.id ?? null, b.chapter, b.missing, beatPlace(b)]),
              quietFor: r.quietFor,
              issues: r.issues,
              silenced: r.silenced,
            })),
          },
        ];
      }),
    ),
    board: parts(board),
    filters: {
      status: parts(filterBoard(board, { status: statusOf })),
      text: parts(filterBoard(board, { text: 'SCENE 2' })),
      thread: threads.length === 0 ? [] : parts(filterBoard(board, { nodeIds: new Set(byNode.keys()) })),
    },
    moves: docs.slice(0, 12).flatMap((n, i) =>
      (
        [
          { parentId: n.parentId, beforeId: null },
          { parentId: n.parentId, beforeId: ids[(i + 3) % ids.length] },
          { parentId: nodes.find((x) => x.kind !== n.kind && x.kind !== 'scene')?.id ?? null, beforeId: null },
          { parentId: null, beforeId: null },
          { parentId: n.id, beforeId: null },
        ] as Place[]
      ).map((to) => ({
        node: n.id,
        to: place(to),
        drop: place(dropOf(nodes, n.id, to)),
        bulk: bulkOf(nodes, n.id, to),
        place: place(placeOf(nodes, n.id)),
      })),
    ),
    undo:
      first === undefined
        ? []
        : (
            [
              { kind: 'status', nodeId: first.id, title: first.title, from: 'idea', to: first.status },
              { kind: 'status', nodeId: first.id, title: first.title, from: 'idea', to: 'published' },
              { kind: 'move', nodeId: first.id, title: first.title, from: { parentId: null, beforeId: null }, to: placeOf(nodes, first.id)! },
              { kind: 'move', nodeId: first.id, title: first.title, from: { parentId: 'gone', beforeId: null }, to: placeOf(nodes, first.id)! },
              { kind: 'move', nodeId: 'gone', title: 'Gone', from: { parentId: null, beforeId: null }, to: { parentId: null, beforeId: null } },
            ] as BoardChange[]
          ).map((ch) => ({ problem: undoProblem(nodes, ch), words: boardChangeWords(ch, nodes) })),
    used: usedLabels(model),
  };
}

/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const sources: [string, string][] = [
  ['qa-sample', join(flutterFixturesDir, 'qa-sample.novel.json')],
  ['made-in-the-app', join(flutterFixturesDir, 'made-in-the-app.novel.json')],
  ['saga', join(flutterFixturesDir, 'saga.novel.json')],
];

const mine = ['lanes', 'byNode', 'diagnosis', 'board', 'filters', 'moves', 'undo', 'used'];

for (const [name, path] of sources) {
  describe(`${name} agrees with the original`, () => {
    const actual = plain(report(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    for (const part of mine) {
      test(part, () => expect(actual[part]).toEqual(golden[name][part]));
    }
  });
}
