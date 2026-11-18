// Scriptor's outputs for what dump.dart dumps of the Flutter app's keepsakes, keyed and shaped the same way: what each
// keepsake page gathers (src/domain/keepsakes/inputs.ts) and what each keepsake makes of it (the ported domain), the
// postcards' paintings (src/domain/keepsakes/postcardScene.ts), the jacket's barcode (pages.ts), and the sampler's PDF
// as laid out (src/domain/exchange/renderPdf.ts `layoutPdf`), its numbers as the pdf package writes them. The sampler
// is made with the Flutter app's name at its foot, as the dump's is.

import { bookPrintJob } from '../../../src/domain/analytics/bookPrint';
import { type BookStory, type StoryInputs, bookStoryJob } from '../../../src/domain/analytics/bookStory';
import { dartStringHash } from '../../../src/domain/desk/dartRandom';
import { type Compiled, compiledToJson } from '../../../src/domain/exchange/compile';
import { PdfCannotDraw, type PdfPage, layoutPdf } from '../../../src/domain/exchange/renderPdf';
import { samplerJob } from '../../../src/domain/exchange/sampler';
import {
  bookRead,
  bookWords,
  gazetteCast,
  keptPlaces,
  quizPeople,
  storyInputsOf,
  trailerCast,
} from '../../../src/domain/keepsakes/inputs';
import { barcodeBars, barcodeSeed } from '../../../src/domain/keepsakes/pages';
import { frontColours, postcardScene } from '../../../src/domain/keepsakes/postcardScene';
import { bestLinesJob } from '../../../src/domain/manuscript/bestLines';
import { bookQuizJob } from '../../../src/domain/manuscript/bookQuiz';
import { gazetteJob } from '../../../src/domain/manuscript/gazette';
import { jacketCopyJob } from '../../../src/domain/manuscript/jacketCopy';
import { type Postcard, type Scenery, postcardsJob } from '../../../src/domain/manuscript/postcards';
import { lengthFor, queryLetter, submissionKit } from '../../../src/domain/manuscript/submission';
import { trailerJob } from '../../../src/domain/manuscript/trailer';
import { type NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';

/** A number as the pdf package writes it: five places at most, no trailing zeros. */
const pdfNum = (v: number) => (Number.isInteger(v) ? v : Number(v.toFixed(5)));

function pdfJson(pages: PdfPage[]): unknown {
  return pages.map((p) => ({
    texts: p.texts.map((t) => ({ face: t.face, size: pdfNum(t.size), text: t.text, x: pdfNum(t.x), y: pdfNum(t.y) })),
    lines: p.lines.map((l) => ({ x1: pdfNum(l.x1), y1: pdfNum(l.y1), x2: pdfNum(l.x2), y2: pdfNum(l.y2) })),
  }));
}

function storyJson(s: BookStory): unknown {
  return s;
}

function inputsJson(i: StoryInputs): unknown {
  return i;
}

const painting = (c: Postcard) => ({ card: postcardScene(c, 450, 300), stamp: postcardScene(c, 52, 55), front: frontColours(c) });

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const book = bookRead(s);
  const { novel, order, titles, stored } = book;

  const inputs = storyInputsOf(s);
  out.storyInputs = inputsJson(inputs);
  out.story = storyJson(bookStoryJob(inputs, stored)());
  const print = bookPrintJob(
    inputs.chapters.map((c) => ({ id: c.id, title: c.title })),
    stored,
    new Map(inputs.people.map((p) => [p.id, p.names] as const)),
  )();
  out.print = { chapters: print.chapters, shares: Object.fromEntries(print.shares) };

  out.lines = bestLinesJob(stored, order)();

  const jacket = jacketCopyJob(stored, order, novel.synopsis)();
  const words = bookWords(s);
  const seed = barcodeSeed(novel.id, words);
  out.jacket = { quote: jacket.quote, blurb: jacket.blurb, words, seed, bars: barcodeBars(seed, 64) };

  const people = quizPeople(s);
  out.quizPeople = Object.fromEntries(people);
  out.quiz = Object.fromEntries(
    [1, 42, 1763337600000000].map((seed) => [`${seed}`, bookQuizJob(stored, order, titles, people, { seed })()] as const),
  );

  const cast = gazetteCast(s);
  out.gazetteCast = cast;
  out.gazette = gazetteJob(novel.title, stored, order, titles, cast.people, cast.places)();

  const kept = keptPlaces(s);
  out.keptPlaces = kept;
  const cards = postcardsJob(stored, order, titles, kept)();
  out.postcards = cards;
  out.paintings = cards.map(painting);

  const trailerPeople = trailerCast(s);
  out.trailerCast = trailerPeople;
  out.trailer = trailerJob(stored, order, { title: novel.title, author: novel.author, cast: trailerPeople })();

  const sample: Compiled = samplerJob(stored, order, titles, {
    title: novel.title,
    author: novel.author,
    synopsis: novel.synopsis,
    brand: 'Novel Builder',
  })();
  out.sampler = compiledToJson(sample);
  try {
    out.pdf = pdfJson(layoutPdf(sample));
  } catch (e) {
    if (!(e instanceof PdfCannotDraw)) throw e;
    out.pdf = { error: e.message };
  }

  const length = lengthFor(novel.primaryGenre);
  const kit = (slips: number) =>
    submissionKit({ title: novel.title, author: novel.author, genre: novel.primaryGenre, words, synopsis: novel.synopsis, openingSlips: slips });
  out.submission = {
    length,
    kit0: kit(0),
    kit1: kit(1),
    kit4: kit(4),
    letter: queryLetter({
      title: novel.title,
      author: novel.author,
      genre: novel.primaryGenre,
      more: novel.secondaryGenres,
      words,
      finished: words >= length.low || (novel.targetWordCount !== null && words >= novel.targetWordCount),
      synopsis: novel.synopsis,
    }),
  };
  return out;
}

export function misc(): Record<string, unknown> {
  const places = ['Grey Tower', 'Mimir Forest', 'Port Selwyn', 'the Dunes of Ash', 'Lake Orrin', 'Kestrel Peak', 'Ys'];
  const sceneries: Scenery[] = [];
  for (let b = 0; b < 128; b += 9) {
    sceneries.push({
      water: (b & 1) !== 0,
      trees: (b & 2) !== 0,
      peaks: (b & 4) !== 0,
      roofs: (b & 8) !== 0,
      tower: (b & 16) !== 0,
      beacon: (b & 32) !== 0,
      dunes: (b & 64) !== 0,
    });
  }
  const cards: unknown[] = [];
  sceneries.forEach((scenery, i) => {
    for (let light = 0; light < 5; light++) {
      const place = places[(i + light) % places.length];
      const card: Postcard = { place, line: '', chapter: 1, chapterTitle: '', nodeId: 'n', block: 0, scenery, light, kept: false };
      const made = { scene: postcardScene(card, 450, 300), front: frontColours(card) };
      cards.push({ place, scenery, light, made: hashOf(JSON.parse(JSON.stringify(made))) });
    }
  });
  const ids = ['', 'a', 'novel-1', 'proj_7Hq2', 'Ωmega', '0f3c6c3e-5a4b-4c1e-9d55-6b1e1c0c9f2a'];
  return {
    postcards: cards,
    hashes: Object.fromEntries(ids.map((id) => [id, dartStringHash(id)])),
    bars: Object.fromEntries([0, 1, 12345, 987654321].map((seed) => [`${seed}`, barcodeBars(seed, 64)])),
  };
}
