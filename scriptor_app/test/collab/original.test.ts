// The collaboration rules and suggested-edit changes agree with the original app on every case it produced (the
// Flutter app's own golden, flutter_app/test/fixtures/golden/collab.golden.json, which flutter_app/test/shared/domain/
// collab_test.dart replays the same way): what each role may see of each record, which changes each role may make
// (and the reason given when not), how a suggestion splits into changes, and how a change lands on a chapter as it is.

import { join } from 'node:path';

import { refusal, roleOf, visible } from '../../src/domain/collab/access';
import { applyHunk, textHunks, textOf } from '../../src/domain/collab/hunks';
import { type JsonMap, jsonEquals, mapOrNull, str } from '../../src/domain/json';
import { maps } from '../../src/domain/records/jsonRecord';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'collab.golden.json')) as JsonMap;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

test('what each role may see, and which changes it may make, agree with the original on every case', () => {
  const cases = maps(golden['access']);
  expect(cases.length).toBeGreaterThan(10000);
  let visibleCases = 0;
  let refusals = 0;
  let allowed = 0;
  for (const c of cases) {
    const role = roleOf(c['role'])!;
    const memberId = str(c['memberId']);
    const key = str(c['key']);
    const where = `${String(c['novel'])} ${role} ${String(c['memberId'])} ${key}`;
    if (c['kind'] === 'visible') {
      const row = mapOrNull(c['row'])!;
      const chapter = mapOrNull(c['chapter']);
      const seen = visible(role, memberId, key, row, (k) => (k.startsWith('chapters:') ? chapter : null));
      const expected = c['expected'];
      if (expected === 'same') {
        expect([where, seen === row || jsonEquals(seen, row)]).toEqual([where, true]);
      } else {
        expect([where, plain(seen)]).toEqual([where, expected]);
      }
      visibleCases++;
    } else {
      const reason = refusal(role, memberId, key, mapOrNull(c['before']), mapOrNull(c['after']));
      expect([where, reason]).toEqual([where, c['expected'] ?? null]);
      if (reason === null) allowed++;
      else refusals++;
    }
  }
  // Both outcomes are exercised many times over.
  expect([visibleCases, allowed, refusals].every((n) => n > 1000)).toBe(true);
});

test('suggestions split into the same changes, with the same names, as the original', () => {
  const cases = maps(golden['hunks']);
  expect(cases.length).toBeGreaterThan(50);
  for (const c of cases) {
    const where = `${String(c['novel'])} ${String(c['chapter'])} ${String(c['edit'])}`;
    const found = textHunks(c['base'], c['proposed']);
    expect([
      where,
      plain(
        found.map((h) => ({
          id: h.id,
          at: h.at,
          remove: h.remove,
          insert: h.insert,
          before: h.before,
          text: [textOf(h.remove), textOf(h.insert)],
        })),
      ),
    ]).toEqual([where, c['hunks']]);
  }
  // The cases include real changes, not only unchanged chapters.
  expect(cases.filter((c) => (c['hunks'] as unknown[]).length > 0).length).toBeGreaterThan(40);
});

test('an accepted change lands on the chapter as it is now, or is refused when the passage was rewritten', () => {
  let applied = 0;
  let rewritten = 0;
  for (const c of maps(golden['hunks'])) {
    const found = textHunks(c['base'], c['proposed']);
    const nows = maps(c['nows']);
    (c['applied'] as unknown[]).forEach((results, n) => {
      maps(results).forEach((r, h) => {
        const where = `${String(c['novel'])} ${String(c['chapter'])} ${String(c['edit'])} / ${String(r['now'])}`;
        const result = applyHunk(nows[n]['doc'], found[h]);
        const expected = r['result'];
        if (result.kind === 'appliedTo') {
          expect([where, plain(result.doc)]).toEqual([where, expected]);
          applied++;
        } else if (result.kind === 'alreadyThere') {
          expect([where, expected]).toEqual([where, 'same']);
        } else {
          expect([where, expected ?? null]).toEqual([where, null]);
          rewritten++;
        }
      });
    });
  }
  expect([applied, rewritten].every((n) => n > 20)).toBe(true);
});
