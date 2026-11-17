// Real `.novel.json` files written by the Flutter app (its own test fixtures), and Scriptor's sample novel. Scriptor
// must read and write them exactly.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const flutterFixturesDir = join(__dirname, '..', '..', 'flutter_app', 'test', 'fixtures');
export const samplePath = join(__dirname, '..', 'assets', 'sample', 'the-drowned-road.novel.json');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function flutterFixtures(): { name: string; json: unknown }[] {
  return readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((name) => ({ name, json: readJson(join(flutterFixturesDir, name)) }));
}

export function sampleJson(): unknown {
  return readJson(samplePath);
}

let counter = 0;
/** Ids that are distinct and sort in creation order, for tests that compare ids. */
export function testIds(): () => string {
  return () => `id-${String(++counter).padStart(8, '0')}`;
}
