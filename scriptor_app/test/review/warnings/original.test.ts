// The record-to-record rules and the gathered review against the original app's own golden, as the Flutter app's
// flutter_app/test/shared/domain/canon_review_test.dart replays it: the `records`, `warnings` and `status` parts of
// canon.golden.json on qa-sample, made-in-the-app and canon (the other parts belong to the canon, knowledge and
// continuity pages). Routes are the Flutter app's, so links and "see it in context" are compared by their words, as
// there. Also opposed_ties_test.dart: every alliance set against each war of its own pair.

import { join } from 'node:path';

import { checkRecords } from '../../../src/domain/canon/checks';
import { CharacterSecret } from '../../../src/domain/characters/characterRecords';
import { allIssues, audit } from '../../../src/domain/continuity/audit';
import { ContinuityRule } from '../../../src/domain/continuity/rules';
import { type JsonMap, listOf, mapOrNull, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { ProgressSnapshot } from '../../../src/domain/progression/snapshots';
import { CanonFact } from '../../../src/domain/records/canon';
import { maps, strings } from '../../../src/domain/records/jsonRecord';
import { ReviewItem } from '../../../src/domain/records/review';
import { type Warning, collectWarnings, withStatus } from '../../../src/domain/review/collect';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

const golden = readJson(join(flutterFixturesDir, 'golden', 'canon.golden.json')) as Record<string, JsonMap>;
const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);

/** Rules in the order the original's check reads them: oldest first. */
export function stableRules(rules: readonly ContinuityRule[]): ContinuityRule[] {
  return [...rules].sort((a, b) => {
    const c = a.createdAt - b.createdAt;
    return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

const warningOut = (w: Warning): JsonMap => ({ ...w.toJson(), links: w.links.map((l) => l.label), context: w.context?.label ?? null });

/** The golden's warning with its routes reduced to their words. */
const goldenWarning = (w: unknown): JsonMap => {
  const m = w as JsonMap;
  return { ...m, links: maps(m['links']).map((l) => l['label']), context: mapOrNull(m['context'])?.['label'] ?? null };
};

export function reviewReport(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const facts = s.rows('canonFacts').map((r) => new CanonFact(r));
  const rules = stableRules(s.rows('continuityRules').map((r) => new ContinuityRule(r)));
  const resolutions = s.rows('continuityResolutions').map((r) => new ReviewItem(r));
  const secrets = s.rows('characterSecrets').map((r) => new CharacterSecret(r));
  const records = checkRecords(model, { facts, rules });
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']]));
  const result = audit(model, docs, rules, resolutions);
  const warnings = collectWarnings({
    model,
    facts,
    rules,
    markers: s.rows('structureMarkers'),
    aliases: new Map(s.rows('characterProfiles').map((p) => [str(p['entryId']), strings(p['aliases'])])),
    secrets,
    snapshots: s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r)),
    manuscript: allIssues(result),
  });
  const status = withStatus(warnings, resolutions, { manuscriptChecked: true });
  const unchecked = withStatus(warnings, resolutions, { manuscriptChecked: false });
  return {
    records: records.map((f) => ({
      key: f.key,
      rule: f.key.split('|')[1],
      severity: f.severity,
      message: f.message,
      because: f.because,
      on: [...f.on],
      refs: f.refs.map((r) => r.toJson()),
    })),
    warnings: warnings.map(warningOut),
    status: {
      items: status.items.map((i) => ({ key: i.warning.key, status: i.status, decision: i.decision?.id ?? null })),
      gone: status.gone.map((d) => d.id),
      goneUnchecked: unchecked.gone.map((d) => d.id),
    },
  };
}

for (const name of ['qa-sample', 'made-in-the-app', 'canon']) {
  describe(`${name} agrees with the original`, () => {
    const expected = golden[name];
    const actual = reviewReport(fixture(name));
    for (const part of ['records', 'warnings', 'status']) {
      test(part, () => {
        const want = part === 'warnings' ? listOf(expected[part]).map(goldenWarning) : expected[part];
        expectJson(actual[part], want, `${name}.${part}`);
      });
    }
  });
}

test('every alliance is set against each war of its own pair, both ways round, in the order recorded', () => {
  const base = fixture('canon');
  // Ties among six parties, in both directions, mixed with ties of other kinds; none dated (always in play).
  const parties = ['guild', 'crown', 'mira', 'p4', 'p5', 'p6'];
  const links: JsonMap[] = [];
  let n = 0;
  for (let i = 0; i < parties.length; i++) {
    for (let j = 0; j < parties.length; j++) {
      if (i === j) continue;
      for (const type of ['allied-with', 'at-war-with', 'related-to']) {
        if ((i * 7 + j * 3 + type.length) % 4 === 0) continue;
        links.push({ id: `t${n++}`, projectId: 'canon', fromId: parties[i], toId: parties[j], type });
      }
    }
  }
  const snapshot = base.withRows('loreLinks', links);
  const opposed = checkRecords(StoryModel.fromSnapshot(snapshot), { facts: [], rules: [] })
    .filter((f) => f.rule === 'opposed')
    .map((f) => f.key);
  const pair = (l: JsonMap) =>
    [String(l['fromId']), String(l['toId'])]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .join('~');
  const expected = links
    .filter((l) => l['type'] === 'allied-with')
    .flatMap((a) =>
      links.filter((l) => l['type'] === 'at-war-with' && pair(a) === pair(l)).map((w) => `records|opposed|${String(a['id'])}|${String(w['id'])}`),
    );
  expect(expected.length).toBeGreaterThan(0);
  expect([...opposed].sort()).toEqual([...expected].sort());
  expect(new Set(opposed).size).toBe(opposed.length);
});
