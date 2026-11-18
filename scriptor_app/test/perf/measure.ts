// How long each whole-book reading takes on the large novel (largeNovel.ts: 600 scenes, 300,000 words, 1,000 entries),
// run the way the screens run it. budget.test.ts holds them to their budgets; with PERF_TABLE=1 it prints the table
// (`PERF_TABLE=1 npx jest test/perf/budget`). Node's engine is faster than the phone's (Hermes): read the numbers
// for what is slow relative to the rest and for what grows faster than the book does.

import { bookPrintJob } from '../../src/domain/analytics/bookPrint';
import { bookStoryJob } from '../../src/domain/analytics/bookStory';
import { computeAnalytics } from '../../src/domain/analytics/analytics';
import { computeProgress, Goal, WritingSession } from '../../src/domain/analytics/progress';
import { CastData } from '../../src/domain/characters/castData';
import { CharacterService } from '../../src/domain/characters/characterService';
import { entrancesJob } from '../../src/domain/characters/entrances';
import { feelingArcsJob } from '../../src/domain/characters/feelingArcs';
import { looksJob } from '../../src/domain/characters/looks';
import { NamedInReader, namedInJob } from '../../src/domain/characters/namedIn';
import { chapterEyesJob } from '../../src/domain/characters/pov';
import { tableReadJob } from '../../src/domain/characters/tableRead';
import { unnamedRolesJob } from '../../src/domain/characters/unnamedRoles';
import { spokenJob } from '../../src/domain/characters/voice';
import { voicePrintsJob } from '../../src/domain/characters/voicePrint';
import { arcsReading } from '../../src/domain/characters/views/castArcs';
import { castCheckNotes } from '../../src/domain/characters/views/castCheck';
import { entrancesReading } from '../../src/domain/characters/views/entrancesView';
import { looksInputs } from '../../src/domain/characters/views/againstYourPages';
import { namesInManuscript } from '../../src/domain/characters/views/manuscriptNames';
import { tableReadChapters, tableReadReading } from '../../src/domain/characters/views/tableReadView';
import { voiceInputs } from '../../src/domain/characters/views/theirVoice';
import { togetherOnPage } from '../../src/domain/characters/views/togetherOnPage';
import { waitingInputs } from '../../src/domain/characters/views/waitingForAName';
import { eyesReading } from '../../src/domain/characters/views/whoseEyes';
import { worldFindsFor } from '../../src/domain/codex/screens/foundInPages';
import { samplerJob } from '../../src/domain/exchange/sampler';
import { layoutPdf } from '../../src/domain/exchange/renderPdf';
import { knowledgeGraph } from '../../src/domain/graph/knowledge';
import { str } from '../../src/domain/json';
import { bookRead, gazetteCast, keptPlaces, quizPeople, storyInputsOf, trailerCast } from '../../src/domain/keepsakes/inputs';
import { bestLinesJob } from '../../src/domain/manuscript/bestLines';
import { bookQuizJob } from '../../src/domain/manuscript/bookQuiz';
import { gazetteJob } from '../../src/domain/manuscript/gazette';
import { jacketCopyJob } from '../../src/domain/manuscript/jacketCopy';
import { postcardsJob } from '../../src/domain/manuscript/postcards';
import { trailerJob } from '../../src/domain/manuscript/trailer';
import { proofReading } from '../../src/domain/proof/screens/proofPage';
import { levelsInputs } from '../../src/domain/progression/screens/levelsView';
import { layoutGraph, relationNetwork } from '../../src/domain/relationships/network';
import { mapDrawing } from '../../src/domain/relationships/screens/relationshipMap';
import { ReviewData } from '../../src/domain/review/reviewData';
import { levelsInPagesJob } from '../../src/domain/systems/levelsInPages';
import { namesInPagesJob } from '../../src/domain/systems/pagesNames';
import { gapsJob } from '../../src/domain/text/gaps';
import type { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { largeNovelId } from './largeNovel';

export type Timed = { name: string; ms: number };

/** A store over one snapshot, as CharacterService reads it (rowsIn gives each row parsed afresh, as SQLite does). */
export function storeOf(s: NovelSnapshot) {
  const json = new Map(Object.keys(s.collections).map((c) => [c, s.rows(c).map((r) => JSON.stringify(r))] as const));
  return {
    load: () => s,
    loadPart: () => s,
    saveChanges: () => undefined,
    rowsIn: (_: string, c: string) => (json.get(c) ?? []).map((t) => JSON.parse(t)),
    rowsJsonIn: (_: string, c: string) => json.get(c) ?? [],
  };
}

/** Every main reading, timed once each after a warm-up run, in the order a writer meets them. */
export function measureReadings(s: NovelSnapshot, rounds = 1): Timed[] {
  const out: Timed[] = [];
  const time = (name: string, run: () => unknown) => {
    run();
    let best = Infinity;
    for (let i = 0; i < rounds; i++) {
      const t = performance.now();
      run();
      best = Math.min(best, performance.now() - t);
    }
    out.push({ name, ms: best });
  };
  const id = largeNovelId;
  const store = storeOf(s);
  const service = new CharacterService(store as never, { save: () => '', list: () => [] } as never);
  const stored = () => service.storedChapters(id);

  time('stored chapters (rowsIn + stringify)', () => stored());
  const plain = new CastData(id, s);
  time('CastData + findNames', () => new CastData(id, s).findNames);
  time('namedIn (every change, useCast)', () => namedInJob(stored(), plain.findNames)());
  const named = namedInJob(stored(), plain.findNames)();
  const reader = new NamedInReader();
  reader.read(stored(), plain.findNames);
  const edited = stored();
  edited[5] = edited[5].replace('walked', 'strolled');
  time('namedIn after one page changed (NamedInReader)', () => {
    reader.read(stored(), plain.findNames);
    reader.read(edited, plain.findNames);
  });
  const cast = new CastData(id, s, { named });
  void cast.list;

  const e = eyesReading(cast);
  time('cast view: whose eyes', () => chapterEyesJob(stored(), e.order, e.titles, e.people)());
  const en = entrancesReading(cast);
  time('cast view: entrances', () => entrancesJob(stored(), en.order, en.people)());
  const ar = arcsReading(cast);
  time('cast view: arcs', () => feelingArcsJob(stored(), ar.order, ar.people)());
  const chapter = tableReadChapters(cast)[0].id;
  const tr = tableReadReading(cast, chapter);
  time('cast view: table read (1 chapter)', () => tableReadJob(stored(), chapter, tr.people, { genders: tr.genders })());
  time('panel: together on the page', () => togetherOnPage(cast, null, true));
  time('panel: the cast checked', () => castCheckNotes(cast, null));
  const w = waitingInputs(cast, null, 1);
  time('panel: waiting for a name', () => unnamedRolesJob(stored(), w.order, { taken: w.taken, setAside: w.setAside })());
  time('panel: names in your manuscript', () => namesInManuscript(cast, store.rowsIn(id, 'chapterContents')));
  const who = cast.list[0].entry.id;
  const v = voiceInputs(cast, who);
  time('profile: their voice (all prints)', () => voicePrintsJob(stored(), cast.documentIds, v.people)());
  time('profile: in their words', () => spokenJob(stored(), cast.documentIds, cast.findNames[who] ?? [])());
  const lk = looksInputs(cast, who);
  time('profile: against your pages', () => looksJob(stored(), cast.documentIds, lk.names, lk.others)());

  time('world: found in your pages', () => worldFindsFor(cast, store.rowsIn(id, 'chapterContents')));
  const lv = levelsInputs(cast);
  time('systems: levels in your pages', () => levelsInPagesJob(stored(), lv.order, new Set(), { people: lv.people })());
  time('systems: names in your pages', () => namesInPagesJob(stored(), lv.order, { known: [] })());

  const docs = () => new Map(store.rowsIn(id, 'chapterContents').map((r) => [str(r['id']), r['doc']]));
  time('review: all warnings (audit + checks)', () => new ReviewData(id, cast.snapshot, cast.model, docs()).warnings);
  time('review: proofreading', () => proofReading(stored(), s.rows('chapters'), s.rows('loreEntries')));
  time('write: gaps', () => gapsJob(stored(), cast.documentIds)());

  const b = bookRead(s);
  time('keepsake: best lines', () => bestLinesJob(stored(), b.order)());
  time('keepsake: quiz', () => bookQuizJob(stored(), b.order, b.titles, quizPeople(s), { seed: 7 })());
  const g = gazetteCast(s);
  time('keepsake: gazette', () => gazetteJob('T', stored(), b.order, b.titles, g.people, g.places)());
  time('keepsake: jacket', () => jacketCopyJob(stored(), b.order, '')());
  time('keepsake: postcards', () => postcardsJob(stored(), b.order, b.titles, keptPlaces(s))());
  time('keepsake: trailer', () => trailerJob(stored(), b.order, { title: 'T', author: 'A', cast: trailerCast(s) })());
  time('keepsake: sampler + PDF layout', () => layoutPdf(samplerJob(stored(), b.order, b.titles, { title: 'T', author: 'A', synopsis: '' })()));
  const si = storyInputsOf(s);
  time('keepsake: book print', () => bookPrintJob(si.chapters.map((c) => ({ id: c.id, title: c.title })), stored(), new Map(si.people.map((p) => [p.id, p.names] as const)))());
  time('keepsake: your book so far', () => bookStoryJob(si, stored())());

  time('analytics', () =>
    computeAnalytics(cast.model, {
      targetWordCount: 400000,
      docs: docs(),
      snapshots: [],
      sessions: s.rows('writingSessions').map((r) => new WritingSession(r)),
      goals: s.rows('goals').map((r) => new Goal(r)),
      now: 1792710000000,
      names: cast.findNames,
    }),
  );
  time('progress', () =>
    computeProgress({
      targetWordCount: 400000,
      nodes: [...cast.model.nodes.values()],
      sessions: s.rows('writingSessions').map((r) => new WritingSession(r)),
      goals: [],
      now: 1792710000000,
    }),
  );
  time('knowledge graph', () => knowledgeGraph(cast.model));
  const graph = knowledgeGraph(cast.model);
  const top = graph.nodes.slice(0, 200);
  const keep = new Set(top.map((n) => n.key));
  time('graph layout (200 drawn)', () =>
    layoutGraph(
      top.map((n) => ({ id: n.key, degree: n.degree })),
      graph.edges.filter((x) => keep.has(x.from) && keep.has(x.to)).map((x) => ({ from: x.from, to: x.to })),
    ),
  );
  const net = relationNetwork(cast.model);
  time(`relationship map (${net.nodes.length} characters)`, () => mapDrawing(net));
  return out;
}

