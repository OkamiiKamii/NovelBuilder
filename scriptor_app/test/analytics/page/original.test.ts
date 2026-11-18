// The project analytics against the original app's own golden, as flutter_app/test/shared/domain/analytics_test.dart
// replays it: qa-sample, made-in-the-app and the analytics fixture, read at noon on October 25, 2026.

import { join } from 'node:path';

import { type JsonMap } from '../../../src/domain/json';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';
import { analyticsJson, analyticsOf } from './json';

/** Noon on October 25, 2026, in the author's own time: the day the reports are read on. */
const now = new Date(2026, 9, 25, 12).getTime();
const golden = readJson(join(flutterFixturesDir, 'golden', 'analytics.golden.json')) as Record<string, JsonMap>;

for (const name of ['qa-sample', 'made-in-the-app', 'analytics']) {
  test(`${name}: the analytics agree with the original app`, () => {
    const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);
    expectJson(analyticsJson(analyticsOf(s, now)), golden[name]['analytics'], `${name}.analytics`);
  });
}
