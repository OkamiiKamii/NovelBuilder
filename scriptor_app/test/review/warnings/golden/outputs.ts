// Scriptor's outputs for Review's warnings and record check, keyed and shaped as golden/dump.dart makes the Flutter
// app's (see its header for what each part holds).

import { checkRecords, recordRuleWords } from '../../../../src/domain/canon/checks';
import { CharacterSecret } from '../../../../src/domain/characters/characterRecords';
import { ChangeRefused } from '../../../../src/domain/codex/codexChanges';
import { allIssues, audit } from '../../../../src/domain/continuity/audit';
import { ContinuityRule } from '../../../../src/domain/continuity/rules';
import { type MergePlan, mergeEntries, mergePlan, pointField, removeReference, tableWords } from '../../../../src/domain/integrity/fixes';
import {
  brokenReferences,
  duplicateCandidates,
  fixable,
  flaggedConnections,
  goesWhole,
  normalizeName,
  statusOf,
  unfitEntries,
  unresolvedFields,
  unsuitedKinds,
  withoutReference,
} from '../../../../src/domain/integrity/rules';
import { type JsonMap, str } from '../../../../src/domain/json';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { MapPin, WorldMap } from '../../../../src/domain/places/places';
import { ProgressSnapshot } from '../../../../src/domain/progression/snapshots';
import { CanonFact } from '../../../../src/domain/records/canon';
import { strings } from '../../../../src/domain/records/jsonRecord';
import { ReviewItem } from '../../../../src/domain/records/review';
import { collectWarnings, withStatus } from '../../../../src/domain/review/collect';
import type { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { TravelSettings } from '../../../../src/domain/travel/travel';
import { hashOf } from '../../../characters/golden/outputs';

export function damaged(s: NovelSnapshot): NovelSnapshot {
  const character = s.rows('loreEntries').find((e) => e['category'] === 'character')?.['id'];
  const chapter = s.rows('chapters').find((n) => n['kind'] === 'chapter')?.['id'];
  return s
    .withRows(
      'loreEntries',
      s.rows('loreEntries').filter((r) => r['id'] !== character),
    )
    .withRows(
      'chapters',
      s.rows('chapters').filter((r) => r['id'] !== chapter),
    );
}

function attempt(run: () => unknown): unknown {
  try {
    return run();
  } catch (e) {
    if (e instanceof ChangeRefused) return { refused: e.message };
    throw e;
  }
}

const collectionsOf = (s: NovelSnapshot) => Object.fromEntries(Object.entries(s.collections).map(([k, v]) => [k, hashOf(v)]));

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const facts = s.rows('canonFacts').map((r) => new CanonFact(r));
  const rules = s
    .rows('continuityRules')
    .map((r) => new ContinuityRule(r))
    .sort((a, b) => {
      const c = a.createdAt - b.createdAt;
      return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const decisions = s.rows('continuityResolutions').map((r) => new ReviewItem(r));
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']]));
  const manuscript = audit(model, docs, rules, decisions);
  const aliases = new Map(s.rows('characterProfiles').map((p) => [str(p['entryId']), strings(p['aliases'])]));
  const travel = s.rows('travelSettings')[0];
  const warnings = collectWarnings({
    model,
    facts,
    rules,
    markers: s.rows('structureMarkers'),
    aliases,
    secrets: s.rows('characterSecrets').map((r) => new CharacterSecret(r)),
    travel: travel === undefined ? null : new TravelSettings(travel),
    maps: s.rows('worldMaps').map((r) => new WorldMap(r)),
    pins: s.rows('mapPins').map((r) => new MapPin(r)),
    snapshots: s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r)),
    manuscript: allIssues(manuscript),
  });
  const status = withStatus(warnings, decisions, { manuscriptChecked: true });
  const broken = brokenReferences(model, s.rows('structureMarkers'));
  const unresolved = unresolvedFields(model);
  const duplicates = duplicateCandidates([...model.entries.values()], aliases);
  const planOut = (p: MergePlan) => ({
    keep: p.keep['id'],
    merge: p.merge['id'],
    repointed: p.repointed.map((r) => ({ table: r.table, rows: r.rows, words: tableWords(r.table) })),
    combined: p.combined,
    dropped: p.dropped,
  });
  const entries = [...model.entries.values()];
  const otherKind = entries.length === 0 ? undefined : entries.find((e) => e.category !== entries[0].category);
  return {
    integrity: {
      broken: broken.map((b) => ({
        key: b.key,
        where: b.where,
        table: b.table,
        rowId: b.rowId,
        missing: `${b.missing.type}:${b.missing.id}`,
        says: b.says,
        fixable: fixable.has(b.table),
        whole: goesWhole.has(b.table),
      })),
      unresolved: unresolved.map((u) => ({
        key: u.key,
        entry: u.entry.id,
        fieldId: u.fieldId,
        fieldName: u.fieldName,
        value: u.value,
        suggestions: u.suggestions.map((e) => e.id),
      })),
      duplicates: duplicates.map((d) => ({ key: d.key, a: d.a.id, b: d.b.id, rule: d.rule, because: d.because })),
      unfit: unfitEntries(model).map((u) => ({
        key: u.key,
        entry: u.entry.id,
        issues: u.issues.map((i) => ({ defId: i.defId, field: i.field, problem: i.problem, message: i.message })),
      })),
      unsuited: unsuitedKinds(model).map((u) => ({ key: u.key, category: u.category.key, problems: u.problems })),
      flagged: flaggedConnections(model).map((c) => ({ id: c.id, status: statusOf(c), label: c.label })),
    },
    records: checkRecords(model, { facts, rules }).map((f) => ({
      key: f.key,
      rule: recordRuleWords[f.rule].key,
      severity: f.severity,
      message: f.message,
      because: f.because,
      on: f.on,
      refs: f.refs.map((r) => r.toJson()),
    })),
    warnings: warnings.map((w) => w.toJson()),
    warningRefs: warnings.map((w) => ({
      key: w.key,
      select: w.context?.select == null ? null : `${w.context.select.type}:${w.context.select.id}`,
    })),
    status: {
      items: status.items.map((i) => ({ key: i.warning.key, status: i.status, decision: i.decision?.id ?? null })),
      gone: status.gone.map((d) => d.id),
      goneUnchecked: withStatus(warnings, decisions, { manuscriptChecked: false }).gone.map((d) => d.id),
    },
    removed: broken.map((b) => attempt(() => collectionsOf(removeReference(s, b.table, b.rowId, b.missing.id, { now: 77 })))),
    pointed: unresolved.flatMap((u) => u.suggestions.map((e) => attempt(() => collectionsOf(pointField(s, u.entry.id, u.fieldId, u.value, e.id, { now: 78 }))))),
    plans: duplicates.flatMap((d) => [attempt(() => planOut(mergePlan(s, d.a.id, d.b.id))), attempt(() => planOut(mergePlan(s, d.b.id, d.a.id)))]),
    merged: duplicates.slice(0, 4).map((d) => attempt(() => collectionsOf(mergeEntries(s, d.a.id, d.b.id, { now: 79 })))),
    refusals: [
      attempt(() => removeReference(s, 'chapters', 'x', 'y', { now: 1 })),
      attempt(() => removeReference(s, 'loreLinks', 'no-such-row', 'y', { now: 1 })),
      attempt(() => pointField(s, 'nobody', 'f', 'w', 'nobody-else', { now: 1 })),
      ...(entries.length > 0 ? [attempt(() => mergePlan(s, entries[0].id, entries[0].id))] : []),
      ...(otherKind !== undefined ? [attempt(() => mergePlan(s, entries[0].id, otherKind.id))] : []),
    ],
  };
}

export function misc(): Record<string, unknown> {
  const names = [
    'The Keep',
    'the keep',
    'A Tale',
    'An Apple',
    'Mira-Vance',
    'Mïra  Vance!',
    '  ',
    'Thermopylae',
    'Theodore',
    'ÉLAN, vital',
    'Ångström 1,000',
    'the',
    'The',
  ];
  return {
    names: Object.fromEntries(names.map((n) => [n, normalizeName(n)])),
    without: [
      withoutReference(
        {
          id: 'x',
          nodeIds: ['a', 'b'],
          characters: [{ id: 'b', age: 3 }, { id: 'c' }],
          locationId: 'b',
          value: 'a\nb\nc',
          deep: { a: { b: { c: { d: { e: { f: 'b' } } } } } },
        },
        'b',
      ),
      withoutReference(['b', 'b', 'c', { id: 'b' }, { id: 'c', x: 'b' }], 'b'),
    ],
    tableWords: Object.fromEntries(['loreLinks', 'chapterContents', 'unknownTable', 'journeys'].map((t) => [t, tableWords(t)])),
  };
}

export type { JsonMap };
