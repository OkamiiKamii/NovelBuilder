// Scriptor's outputs for phase 7's continuity check, tracked rules and proofreading, keyed and shaped as dump.dart's, so
// the agreement test can compare them with the Flutter app's (continuity.golden.json). See dump.dart for what is read.

import { ChangeRefused } from '../../../../src/domain/codex/codexChanges';
import { type AuditResult, audit } from '../../../../src/domain/continuity/audit';
import { ContinuityChanges } from '../../../../src/domain/continuity/continuityChanges';
import { type Fix, type Issue, type IssueCategory, type RuleKind, type Severity, ContinuityRule, issueJson, ruleKinds } from '../../../../src/domain/continuity/rules';
import {
  continuityView,
  issueCard,
  ruleCard,
  ruleDraft,
  ruleForm,
  ruleProblem,
  rulesInOrder,
  updateCanonDialog,
} from '../../../../src/domain/continuity/screens/continuityPage';
import {
  type Found,
  ageOf,
  colourOf,
  coloursIn,
  durationsIn,
  excerptAround,
  findWords,
  fingerprint,
  formatRuleDuration,
  isActing,
  isUsed,
  paragraphsOf,
  sentencesOf,
  toNumber,
} from '../../../../src/domain/continuity/text';
import { type JsonMap, str } from '../../../../src/domain/json';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { readingOrder } from '../../../../src/domain/model/storyOrder';
import { isDocument } from '../../../../src/domain/outline';
import { type Proof, type ProofChapter, plainOf, proofsOf } from '../../../../src/domain/proof/proof';
import { proofReading } from '../../../../src/domain/proof/screens/proofPage';
import { type Entry } from '../../../../src/domain/records/entry';
import { type ReviewDecision, ReviewItem } from '../../../../src/domain/records/review';
import { type NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';

// ---------------------------------------------------------------------------------------------------- as JSON

const proofJson = (p: Proof) => ({ ...p });

const auditJson = (r: AuditResult) => ({
  open: r.open.map(issueJson),
  resolved: r.resolved.map((x) => ({ issue: x.issue.key, resolution: x.resolution.id, decision: x.resolution.decision })),
  stale: r.stale.map((x) => x.id),
  scanned: { ...r.scanned },
});

const rulesOf = (s: NovelSnapshot) => rulesInOrder(s.rows('continuityRules'), (r) => new ContinuityRule(r));
const docsOf = (s: NovelSnapshot) => new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']] as const));
const check = (s: NovelSnapshot) =>
  audit(StoryModel.fromSnapshot(s), docsOf(s), rulesOf(s), s.rows('continuityResolutions').map((r) => new ReviewItem(r)));

function viewJson(result: AuditResult, rules: ContinuityRule[], severity: Severity | null, category: string | null, nodeId: string | null) {
  const v = continuityView(result, rules, { severity, category: category as IssueCategory | null, nodeId });
  return {
    header: v.header,
    read: v.read,
    tabs: v.tabs.map((t) => t.label),
    filters:
      v.filters === null
        ? null
        : {
            severity: v.filters.severity.map((c) => c.label),
            category: v.filters.category.map((c) => c.label),
            chapter: v.filters.chapter.map((c) => c.label),
            chosenChapter: v.filters.chosenChapter,
          },
    empty: v.empty === null ? null : { title: v.empty.title, track: v.empty.track },
    noMatch: v.noMatch !== null,
    groups: v.groups.map((g) => ({ heading: g.heading, keys: g.issues.map((i) => i.key) })),
  };
}

function cardJson(issue: Issue, model: StoryModel) {
  const c = issueCard(issue, model);
  return {
    category: c.category,
    where: c.where,
    excerpt: [c.excerpt.before, c.excerpt.match, c.excerpt.after],
    entries: c.entries.map((e) => e.name),
    tracked: c.tracked,
    update: c.canUpdate ? updateCanonDialog(issue).message : null,
  };
}

function formJson(model: StoryModel, kind: RuleKind, entryId: string | null, toEntryId: string | null, state: string) {
  const f = ruleForm(model, kind, { ...ruleDraft(kind, null), entryId, toEntryId, state }, false);
  return {
    subjects: f.subjects.map((s) => s.label),
    holders: f.holders === null ? null : f.holders.map((s) => s.label),
    chapters: f.span === null ? null : f.span.from.map((c) => c.label),
  };
}

function problemOf(
  kind: RuleKind,
  o: { entryId?: string; toEntryId?: string; amountText?: string; state?: string; holderId?: string; words?: string } = {},
) {
  return ruleProblem(kind, {
    ...ruleDraft(kind, null),
    entryId: o.entryId ?? null,
    toEntryId: o.toEntryId ?? null,
    amount: o.amountText ?? '',
    state: o.state ?? 'deceased',
    holderId: o.holderId ?? null,
    words: o.words ?? '',
  });
}

// ---------------------------------------------------------------------------------------------------- a novel

export function novel(s: NovelSnapshot): Record<string, unknown> {
  let ids = 0;
  let clock = 1000;
  const changes = (snap: NovelSnapshot) => new ContinuityChanges(snap, { now: ++clock, createId: () => `id${++ids}` });
  const model = StoryModel.fromSnapshot(s);
  const all = [...model.entries.values()];
  const of = (category: string) => all.filter((e) => e.category === category);
  const pick = (list: Entry[], i: number): string | null => (list.length > i ? list[i].id : all.length > i ? all[i].id : null);
  const characters = of('character');
  const items = of('item');
  const places = of('location');
  const powers = of('power');
  const documents = readingOrder(model.nodes.values()).filter((n) => isDocument(n.kind));
  const doc = (i: number): string | null =>
    documents.length === 0 ? null : documents[i < 0 ? documents.length + i : Math.max(0, Math.min(i, documents.length - 1))].id;

  // A script of tracked rules on a copy.
  let copy = s;
  const steps: unknown[] = [];
  const step = <T>(apply: (c: ContinuityChanges) => T, show: (r: T) => unknown): T | null => {
    const c = changes(copy);
    try {
      const r = apply(c);
      copy = c.snapshot;
      steps.push(show(r));
      return r;
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      steps.push(`refused: ${e.message}`);
      return null;
    }
  };
  const raw = (r: ContinuityRule) => r.raw;

  const first = step((c) => c.createRule('status', { entryId: pick(characters, 0), state: 'deceased', aliases: 'the heir, , The Heir', fromNodeId: doc(0) }), raw);
  step(
    (c) =>
      c.createRule('status', {
        entryId: pick(characters, 1),
        state: 'absent',
        label: '  imprisoned in the Keep ',
        fromNodeId: doc(1),
        untilNodeId: doc(-1),
      }),
    raw,
  );
  step((c) => c.createRule('status', { entryId: pick(characters, 2), state: 'condition', words: 'ran, both hands, ran', fromNodeId: doc(0) }), raw);
  step((c) => c.createRule('possession', { entryId: pick(items, 0), state: 'lost', fromNodeId: doc(0) }), raw);
  step((c) => c.createRule('possession', { entryId: pick(items, 1), state: 'held', holderId: pick(characters, 0), fromNodeId: 'gone' }), raw);
  step((c) => c.createRule('travel', { entryId: pick(places, 0), toEntryId: pick(places, 1), amount: '1.5', unit: 'hours' }), raw);
  step((c) => c.createRule('power', { entryId: pick(powers, 0), words: ['night', 'dark', 'sea', 'dark'], scope: 'paragraph', label: 'needs the sun' }), raw);
  step((c) => c.createRule('weather'), raw);
  if (first !== null) {
    step((c) => {
      c.updateRule(first.id, { state: 'absent', amount: 3, unit: 'weeks', note: 'kept' });
      return c.owned(first.id);
    }, raw);
  }
  step(
    (c) => {
      c.updateRule('nope', {});
      return true;
    },
    (r) => r,
  );

  const copyModel = StoryModel.fromSnapshot(copy);
  const rules = rulesOf(copy);
  const checked = check(copy);
  const before = copy;

  // Each finding's "Update canon", on a copy of its own.
  const fixes: unknown[] = [];
  const extra: Fix[] = [
    { type: 'field', entryId: 'nope', fieldId: 'x', value: '1' },
    { type: 'end-rule', ruleId: 'gone', nodeId: 'x' },
  ];
  for (const fix of [...checked.open.map((i) => i.fix), ...extra]) {
    if (fix === null) continue;
    const c = changes(before);
    try {
      c.applyFix(fix);
      fixes.push({ fix: { ...fix }, rules: c.rows('continuityRules'), entries: c.rows('loreEntries').map((r) => r['fields']) });
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      fixes.push({ fix: { ...fix }, refused: e.message });
    }
  }

  // The author's decisions on the first findings.
  const open = checked.open;
  const d = changes(copy);
  const decide = (key: string, message: string, kind: ReviewDecision, o: { note?: string; nodeId?: string | null } = {}) =>
    d.decide(key, message, kind, o);
  if (open.length > 0) decide(open[0].key, open[0].message, 'intentional', { note: ' Flashback sequence ', nodeId: open[0].nodeId });
  if (open.length > 1) decide(open[1].key, open[1].message, 'dismissed', { nodeId: 'gone' });
  if (open.length > 2) decide(open[2].key, open[2].message, 'review');
  decide('status|gone|x|y', 'An old finding', 'intentional', { note: 'Disguise' });
  decide('timeline|a', 'Elsewhere', 'dismissed');
  if (open.length > 0) decide(open[0].key, open[0].message, 'dismissed', { note: 'changed my mind' });
  copy = d.snapshot;
  const decided = check(copy);
  const r = changes(copy);
  r.reopen(str(r.rows('continuityResolutions')[0]['id']));
  const reopened = check(r.snapshot);

  // The proof of the book.
  const reading = proofReading(
    s.rows('chapterContents').map((row) => JSON.stringify(row)),
    s.rows('chapters'),
    s.rows('loreEntries'),
  );
  const proofs = reading.run();

  return {
    stored: auditJson(check(s)),
    script: steps,
    checked: auditJson(checked),
    resolutions: copy.rows('continuityResolutions'),
    decided: auditJson(decided),
    reopened: auditJson(reopened),
    fixes,
    rules: rules.map((x) => {
      const card = ruleCard(x, copyModel);
      return { subject: card.subject, lines: card.lines, stopMessage: card.stopMessage };
    }),
    view: [
      viewJson(checked, rules, null, null, null),
      viewJson(checked, rules, 'warning', null, null),
      viewJson(checked, rules, null, open.length === 0 ? 'trait' : open[open.length - 1].category, null),
      viewJson(checked, rules, null, null, open.length === 0 ? 'x' : open[open.length - 1].nodeId),
      viewJson(decided, rules, 'info', 'trait', 'gone'),
      viewJson(check(s), rulesOf(s), null, null, null),
    ],
    cards: checked.open.map((i) => cardJson(i, copyModel)),
    form: [
      ...ruleKinds.map((k) => formJson(copyModel, k, pick(characters, 0), pick(places, 1), k === 'possession' ? 'held' : 'deceased')),
      formJson(copyModel, 'travel', null, null, 'deceased'),
    ],
    problems: [
      ...ruleKinds.map((k) => problemOf(k)),
      problemOf('travel', { entryId: 'a', toEntryId: 'a' }),
      problemOf('travel', { entryId: 'a', toEntryId: 'b', amountText: ' 0 ' }),
      problemOf('travel', { entryId: 'a', toEntryId: 'b', amountText: '1e2' }),
      problemOf('possession', { entryId: 'a', state: 'held' }),
      problemOf('possession', { entryId: 'a', state: 'held', holderId: 'h' }),
      problemOf('power', { entryId: 'a', words: '   ' }),
      problemOf('status', { entryId: 'a', state: 'condition', words: 'ran' }),
      problemOf('status', { entryId: 'a', state: 'condition' }),
    ],
    proofs: proofs.map(proofJson),
  };
}

// ---------------------------------------------------------------------------------------------------- misc

const hard = [
  'Mira drew the Sunblade and raised it high.',
  'O’Brien said, and O’Brien laughed. C++ came; Mr. Crane strode in.',
  'They sailed for half a day, then an hour, then 2.5 weeks, ninety-nine minutes and twenty one days.',
  'Her gray eyes. Whose blue-green eyes? Alex’s hair is very golden. His eyes were hazel.',
  'Alex had just turned 17. Alex, aged 30, left. Seventeen-year-old Alex ran. Alex is barely 9!',
  'Hi.  "Yes!" she said… Then? no. “Done.”\nNext line. ',
  'naïve ☃ 😀 Zoë Éric ÅNGSTRÖM',
  'The Sunblade in their grip; he threw the old cracked Sunblade.',
  'Mira, then Mira suddenly smiled; Mira walks.',
];

export function misc(): Record<string, unknown> {
  const found = (f: Found | null) => (f === null ? null : { index: f.index, text: f.text });
  const linkMark = (id: unknown) => ({ type: 'entityLink', attrs: { entryId: id } });
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The ' },
          { type: 'text', text: 'He', marks: [linkMark('mira')] },
          { type: 'text', text: 'ir', marks: [{ type: 'bold' }, linkMark('mira')] },
          { type: 'hardBreak' },
          { type: 'text', text: 'Kai', marks: [linkMark('kai'), linkMark(7)] },
        ],
      },
      {
        type: 'blockquote',
        content: [
          { type: 'heading', content: [{ type: 'text', text: 'Inside' }] },
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'em', content: [{ type: 'text', text: 'nested' }] }] }] }],
          },
        ],
      },
      { type: 'paragraph' },
    ],
  };
  const proofSets: ProofChapter[][] = [
    [
      { id: 'a', title: 'One', paragraphs: ['James ran. James stopped. James looked back.', 'Jmaes and Jaems and Jams.', null] },
      { id: 'b', title: '', paragraphs: ['“Open and not closed', 'still open', '"Straight one'] },
      { id: 'c', title: 'Three', paragraphs: [null, '   '] },
    ],
    [
      {
        id: 'd',
        title: 'Spaces',
        paragraphs: [
          'One  two   three , four ; five. six. Mr. black. Dr. grey. etc. fine. i think i, i. it is.',
          "It was the The best. He didn't walked. They do not needed. She didn’t succeeded. Ran ran RAN.",
          '“Curly” and "straight" and “curly again” and “one more”.',
          `${'Word word, '.repeat(30)} end end.`,
        ],
      },
    ],
    [0, 1, 2].map((i) => ({ id: `m${i}`, title: `Many ${i}`, paragraphs: Array.from({ length: 30 }, (_, j) => `the the ${j} and  so on .`) })),
  ];
  return {
    find: hard.map((s) => [
      findWords(s, ['Mira', 'O’Brien', 'C++', 'Mr. Crane', 'Zoë', 'Sunblade', '']).map(found),
      findWords(s, ['éric', 'ÅNGSTRÖM', 'gray', 'HALF A DAY'], { loose: true }).map(found),
    ]),
    acting: hard.map((s) => findWords(s, ['Mira', 'O’Brien', 'Alex']).map((f) => isActing(s, f))),
    used: hard.map((s) => findWords(s, ['Sunblade']).map((f) => isUsed(s, f))),
    durations: hard.map((s) => durationsIn(s).map((x) => ({ amount: x.amount, unit: x.unit, hours: x.hours, text: x.text }))),
    numbers: ['0', '007', ' 12 ', 'Twenty-One', 'ninety nine', 'hundred-one', '1.50', '-3', 'an', ''].map(toNumber),
    colours: hard.map(coloursIn),
    colourOf: hard.map((s) => [found(colourOf(s, 'eyes', ['Alex', 'Zoë'])), found(colourOf(s, 'hair', ['Alex', 'O’Brien']))]),
    ages: hard.map((s) =>
      sentencesOf(s).map((x) => {
        const a = ageOf(x, ['Alex', 'Mira']);
        return a === null ? null : { age: a.age, text: a.text };
      }),
    ),
    sentences: hard.map(sentencesOf),
    fingerprints: [...hard, '', '\t\n', 'A B', 'İstanbul ΣΑΣ'].map(fingerprint),
    excerpts: [
      excerptAround('x'.repeat(220), 0),
      excerptAround('x'.repeat(221), 0),
      excerptAround('x'.repeat(221), 221),
      excerptAround(`${' '.repeat(100)}${'y'.repeat(200)}${' '.repeat(100)}`, 150, 120),
    ],
    durationWords: [
      formatRuleDuration(1, 'days'),
      formatRuleDuration(1.5, 'hours'),
      formatRuleDuration(0, 'weeks'),
      formatRuleDuration(2, 'months'),
      formatRuleDuration(0.1 + 0.2, 'minutes'),
    ],
    paragraphs: paragraphsOf(doc).map((p) => ({ index: p.index, text: p.text, links: p.links.map((l) => ({ ...l })) })),
    plain: ['looked', 'tried', 'stopped', 'liked', 'hoped', 'filled', 'seemed', 'cried', 'edited', 'ied'].map(plainOf),
    proofs: proofSets.map((chapters) => proofsOf(chapters, { names: new Set(['James Hollis', 'Mira']) }).map(proofJson)),
  };
}

export type { JsonMap };
