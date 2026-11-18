// The canon review, the marks laid over the views, and the knowledge checks and spread against the original app's own
// golden, as flutter_app/test/shared/domain/canon_review_test.dart replays it: the `canon`, `overlay`, `merged`,
// `knowledge` and `spread` parts of canon.golden.json on qa-sample, made-in-the-app and canon, and the text golden's
// `normalize` (the records, warnings, status and audit parts are the warnings and continuity ports' to replay).

import { join } from 'node:path';

import { checkRecords } from '../../../src/domain/canon/checks';
import { type OverlayMark, badgeOf, canonOverlay, markWords, mergeMarks } from '../../../src/domain/canon/overlay';
import { normalize, reviewCanon } from '../../../src/domain/canon/review';
import { CharacterSecret, awarenessKey } from '../../../src/domain/characters/characterRecords';
import { checkKnowledge, knowledgeAxes, knowledgeSpread } from '../../../src/domain/characters/knowledge';
import { audit } from '../../../src/domain/continuity/audit';
import { ContinuityRule } from '../../../src/domain/continuity/rules';
import { type JsonMap, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { CanonFact } from '../../../src/domain/records/canon';
import { ReviewItem } from '../../../src/domain/records/review';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { reviewTimeline } from '../../../src/domain/timeline/review';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

const golden = readJson(join(flutterFixturesDir, 'golden', 'canon.golden.json')) as Record<string, JsonMap>;
const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);

/** Rules in the order the original's check reads them: oldest first. */
function stableRules(rules: readonly ContinuityRule[]): ContinuityRule[] {
  return [...rules].sort((a, b) => {
    const c = a.createdAt - b.createdAt;
    return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function markOut(m: OverlayMark | null): JsonMap | null {
  if (m === null) return null;
  const badge = badgeOf(m);
  return {
    status: m.status === null ? null : { key: m.status.key, label: m.status.label, hint: m.status.hint, glyph: m.status.glyph },
    warnings: m.warnings.map((w) => w.key),
    badge: badge === null ? null : { glyph: badge.glyph, tone: badge.tone ?? 'status' },
    words: markWords(m),
  };
}

function report(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const facts = s.rows('canonFacts').map((r) => new CanonFact(r));
  const rules = stableRules(s.rows('continuityRules').map((r) => new ContinuityRule(r)));
  const resolutions = s.rows('continuityResolutions').map((r) => new ReviewItem(r));
  const secrets = s.rows('characterSecrets').map((r) => new CharacterSecret(r));
  const records = checkRecords(model, { facts, rules });
  const canon = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], (k) => model.categories.get(k) ?? null);
  const timeline = reviewTimeline(
    model,
    rules.map((r) => r.raw),
  );
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']]));
  const result = audit(model, docs, rules, resolutions);
  const overlay = canonOverlay(model, { records, timeline, canon: canon.reviews, continuity: result.open });
  const spread: JsonMap = {};
  for (const secret of secrets) {
    for (const axis of knowledgeAxes) {
      const sp = knowledgeSpread(secret, model, axis);
      spread[`${secret.id}/${axis}`] = {
        points: sp.points.map((p) => ({ id: p.id, label: p.label, marks: [...p.marks] })),
        rows: sp.rows.map((r) => ({
          characterId: r.characterId,
          name: r.name,
          cells: r.cells.map((c) => ({ record: c.record?.id ?? null, here: c.here.map((h) => h.id), needs: c.needs.map((n) => n.id) })),
          now: { state: r.now.state === null ? null : awarenessKey(r.now.state), record: r.now.record?.id ?? null, source: r.now.source },
          unplaced: r.unplaced.map((u) => u.id),
        })),
        tellings: sp.tellings.map((t) => ({ recordId: t.recordId, fromId: t.fromId, toId: t.toId, point: t.point })),
      };
    }
  }
  return {
    canon: {
      reviews: canon.reviews.map((r) => ({
        fact: r.fact.id,
        flags: r.flags.map((f) => ({
          key: f.key,
          kind: f.kind,
          ...(f.otherId !== null ? { otherId: f.otherId } : {}),
          message: f.message,
          ...(f.dismiss !== null
            ? {
                dismiss: {
                  ...(f.dismiss.factId !== null ? { factId: f.dismiss.factId } : {}),
                  ...(f.dismiss.entryId !== null ? { entryId: f.dismiss.entryId } : {}),
                  ...(f.dismiss.field !== null ? { field: f.dismiss.field } : {}),
                },
              }
            : {}),
        })),
      })),
      pairs: canon.pairs.map((p) => ({ a: p.a.id, b: p.b.id, stated: p.stated })),
    },
    knowledge: checkKnowledge(secrets, model).map((k) => ({
      key: k.key,
      rule: k.rule,
      secretId: k.secretId,
      ownerId: k.ownerId,
      message: k.message,
      because: k.because,
      characterIds: [...k.characterIds],
    })),
    spread,
    overlay: Object.fromEntries([...overlay.entries()].map(([k, v]) => [k, markOut(v)])),
    merged: markOut(mergeMarks([...overlay.values()].slice(0, 5))),
  };
}

for (const name of ['qa-sample', 'made-in-the-app', 'canon']) {
  describe(`${name} agrees with the original`, () => {
    const expected = golden[name];
    const actual = report(fixture(name));
    for (const part of ['canon', 'knowledge', 'spread', 'overlay', 'merged']) {
      test(part, () => expectJson(actual[part], expected[part], `${name}.${part}`));
    }
  });
}

test('the text helpers agree with the original: normalize', () => {
  const texts = ['Réal Café', 'ÉLAN, vital!', '  spaced   out ', 'naïve—ﬁne', 'Ångström 1,000', 'Œuvre'];
  expectJson(
    texts.map((t) => normalize(t)),
    (golden['text'] as JsonMap)['normalize'],
    'text.normalize',
  );
});
