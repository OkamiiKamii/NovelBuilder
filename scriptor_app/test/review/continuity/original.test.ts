// The continuity check and its text helpers against the original app's own golden, as the Flutter app's
// canon_review_test.dart replays it (flutter_app/test/fixtures/golden/canon.golden.json): the manuscript check of each
// novel (its open findings whole, the decided and the stale, what was read) and the helpers over texts made to test them
// (finding words, acting, being used, durations, numbers, colours, ages, sentences, fingerprints, excerpts). The canon
// parts of that golden (records, canon, marks, knowledge, warnings, normalize) are the canon port's to replay.

import { join } from 'node:path';

import { audit } from '../../../src/domain/continuity/audit';
import { ContinuityRule, issueJson } from '../../../src/domain/continuity/rules';
import { rulesInOrder } from '../../../src/domain/continuity/screens/continuityPage';
import {
  type Found,
  ageOf,
  colourOf,
  coloursIn,
  durationsIn,
  excerptAround,
  findWords,
  fingerprint,
  isActing,
  isUsed,
  sentencesOf,
  toNumber,
} from '../../../src/domain/continuity/text';
import { type JsonMap, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { ReviewItem } from '../../../src/domain/records/review';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

const golden = readJson(join(flutterFixturesDir, 'golden', 'canon.golden.json')) as Record<string, JsonMap>;
const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);

/** A number as the original's report writes it: whole without a point. */
const num = (v: number | null) => v;

function auditReport(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const rules = rulesInOrder(s.rows('continuityRules'), (r) => new ContinuityRule(r));
  const resolutions = s.rows('continuityResolutions').map((r) => new ReviewItem(r));
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']] as const));
  const result = audit(model, docs, rules, resolutions);
  return {
    open: result.open.map(issueJson),
    resolved: result.resolved.map((r) => ({ issue: r.issue.key, resolution: r.resolution.id })),
    stale: result.stale.map((r) => r.id),
    scanned: { ...result.scanned },
  };
}

for (const name of ['qa-sample', 'made-in-the-app', 'canon']) {
  test(`${name}: the manuscript check is the original's`, () => {
    expectJson(auditReport(fixture(name)), (golden[name] as JsonMap)['audit'], `${name}.audit`);
  });
}

const samples = [
  'Mira drew the Sunblade and raised it high.',
  'Mira had said nothing; they spoke of Mira.',
  'said Mira, and Mira quietly smiled.',
  'The Sunblade in her hand gleamed. She pocketed the Sunblade.',
  'They rode for two days, then half an hour, then 3 weeks and a month. Twenty-two minutes later, nothing.',
  'Alex was nineteen years old. Twenty-year-old Alex laughed. Alex, 19, ran. Alex is 21 and tall.',
  'Her grey eyes shone. Alex’s hair was black. His hair is golden-brown. Whose blue-green eyes?',
  '“Run!” she cried. He ran… Then: nothing? Yes. “Done.” And so on.',
  'Ünïcödé names: Zoë met Éric at the Café. Zoë’s eyes were violet.',
];
const found = (f: Found | null) => (f === null ? null : { index: f.index, text: f.text });

const text: Record<string, () => unknown> = {
  find: () =>
    samples.map((s) => [
      findWords(s, ['Mira', 'Sunblade', 'Alex', 'Zoë', 'café']).map(found),
      findWords(s, ['café', 'TWO days', 'nothing'], { loose: true }).map(found),
    ]),
  acting: () => samples.map((s) => findWords(s, ['Mira', 'Alex', 'Zoë']).map((f) => isActing(s, f))),
  used: () => samples.map((s) => findWords(s, ['Sunblade']).map((f) => isUsed(s, f))),
  durations: () =>
    samples.map((s) => durationsIn(s).map((d) => ({ amount: num(d.amount), unit: d.unit, hours: num(d.hours), text: d.text }))),
  numbers: () => ['19', 'nineteen', 'twenty-two', 'a', 'hundred', 'twenty two', 'three point', '2.5', 'xyz'].map(toNumber),
  colours: () => samples.map(coloursIn),
  colourOf: () => samples.map((s) => [found(colourOf(s, 'eyes', ['Alex', 'Zoë'])), found(colourOf(s, 'hair', ['Alex']))]),
  ages: () =>
    samples.map((s) =>
      sentencesOf(s).map((x) => {
        const a = ageOf(x, ['Alex']);
        return a === null ? null : { age: a.age, text: a.text };
      }),
    ),
  sentences: () => samples.map(sentencesOf),
  fingerprints: () => [...samples, '', '  Mixed   CASE  ', 'naïve ☃ 😀'].map(fingerprint),
  excerpts: () => [
    excerptAround('short', 2),
    excerptAround(`${'x'.repeat(300)} MATCH ${'y'.repeat(300)}`, 302),
    excerptAround('a '.repeat(200), 5),
    excerptAround('b '.repeat(200), 390),
  ],
};

for (const [part, make] of Object.entries(text)) {
  test(`the text helpers agree with the original: ${part}`, () => {
    expectJson(make(), (golden['text'] as JsonMap)[part], `text.${part}`);
  });
}
