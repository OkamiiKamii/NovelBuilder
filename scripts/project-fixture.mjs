// Builds the backup file the data-ownership tests restore (src/modules/projects/fixtures/made-in-the-app.novel.json)
// from the novels an end-to-end run made through the app's own pages. Run the e2e with somewhere to put their files,
//   PROJECT_FILES_OUT=<folder> npm run test:e2e:built
// then:  node scripts/project-fixture.mjs <folder>
// It takes the fewest of those files that hold, between them, every field of every kind of record, and joins them into
// one novel: each novel's id becomes the first one's, so every reference stays inside it. Pictures are made tiny.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const folder = process.argv[2];
if (!folder) throw new Error('Name the folder of .novel.json files: node scripts/project-fixture.mjs <folder>');
const OUT = 'src/modules/projects/fixtures/made-in-the-app.novel.json';
// A novel this large is the speed benchmark's (e2e/bigNovel.mjs), not a shape the others lack.
const MAX_BYTES = 1_000_000;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const files = readdirSync(folder)
  .filter((name) => name.endsWith('.novel.json'))
  .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }))
  .filter((f) => f.text.length <= MAX_BYTES)
  .map((f) => ({ ...f, file: JSON.parse(f.text) }));

// Every field path in a novel's records, at every depth, ids in keys generalised.
const paths = (file) => {
  const out = new Set();
  const walk = (value, path) => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, `${path}[]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${/^[0-9a-f]{8}-/.test(k) ? '{id}' : k}`);
    else out.add(path);
  };
  for (const [table, rows] of Object.entries(file.collections)) for (const row of rows) walk(row, table);
  return out;
};
const shapes = files.map((f) => ({ ...f, paths: paths(f.file) }));
const every = new Set(shapes.flatMap((s) => [...s.paths]));
const chosen = [];
for (const covered = new Set(); covered.size < every.size; ) {
  const best = shapes.filter((s) => !chosen.includes(s)).sort((a, b) => [...b.paths].filter((p) => !covered.has(p)).length - [...a.paths].filter((p) => !covered.has(p)).length)[0];
  chosen.push(best);
  for (const p of best.paths) covered.add(p);
}

// One novel: the first file's, with every record of the others, each novel's id replaced by its id.
const [first] = chosen;
const projectId = first.file.project.id;
const merged = { ...first.file, collections: {} };
for (const { file } of chosen) {
  // Only where the novel's id stands alone (a page address, a key): ids made from it ("<id>-ch1") stay apart.
  const own = new RegExp(`(?<![\\w-])${file.project.id}(?![\\w-])`, 'g');
  const rows = JSON.parse(JSON.stringify(file.collections).replace(own, projectId).replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{200,}/g, PIXEL));
  for (const [table, list] of Object.entries(rows)) merged.collections[table] = [...(merged.collections[table] ?? []), ...list];
}
// Of records shaped alike, one is enough: a record is kept when it has a field the ones kept before it lack, or when a
// kept record points at it (so every reference has something to point at, and a restore has it to rewrite).
const all = merged.collections;
const kept = new Set();
for (const [table, rows] of Object.entries(all)) {
  const seen = new Set();
  for (const row of rows) {
    const mine = [...paths({ collections: { [table]: [row] } })].filter((p) => !seen.has(p));
    for (const p of mine) seen.add(p);
    if (mine.length) kept.add(row);
  }
}
const byId = new Map(Object.values(all).flat().map((row) => [row.id, row]));
// A category is named by its key ("custom-…", "character"), not by its id.
for (const row of all.loreSchemas ?? []) if (!byId.has(row.key)) byId.set(row.key, row);
for (let queue = [...kept]; queue.length; ) {
  const tokens = JSON.stringify(queue.pop()).split(/[^\w-]+/);
  for (const token of tokens) {
    const row = byId.get(token);
    if (row && !kept.has(row)) {
      kept.add(row);
      queue.push(row);
    }
  }
}
for (const table of Object.keys(all)) all[table] = all[table].filter((row) => kept.has(row));
merged.project = { ...merged.project, title: 'Made in the App', cover: null };
writeFileSync(OUT, JSON.stringify(merged));
const counts = Object.entries(merged.collections).filter(([, rows]) => rows.length).map(([t, rows]) => `${t} ${rows.length}`);
console.log(`${OUT}: ${chosen.length} novels (${chosen.map((c) => c.name).join(', ')}), ${every.size} fields, ${counts.length} kinds of record: ${counts.join(', ')}. ${Math.round(JSON.stringify(merged).length / 1000)} KB.`);
