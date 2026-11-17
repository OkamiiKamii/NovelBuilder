// Turns dump.dart's output into the committed golden: whole outputs for the scripted novel's end and the small
// graphs, the refusals of the script, and a SHA-256 of the rest. Digests are of canonical JSON (keys sorted, -0 as 0),
// as agreement.test.ts makes them.
const fs = require('fs');
const crypto = require('crypto');

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  if (typeof v === 'number' && Object.is(v, -0)) return '0';
  return JSON.stringify(v);
}

const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = { full: {}, digests: {} };
// The Dart platform's cosine and sine where they differ from this JavaScript engine's: the layout's start, for the test.
out.full.trig = d.trig.filter(([a, c, s]) => Math.cos(a) !== c || Math.sin(a) !== s);
delete d.trig;
for (const k of Object.keys(d).sort()) {
  if (k === 'graphs' || k === 'script.final' || k.endsWith('.steps') && k !== 'script.steps') out.full[k] = d[k];
  else out.digests[k] = crypto.createHash('sha256').update(canonical(d[k])).digest('hex').slice(0, 32);
}
out.full['script.refusals'] = d['script.steps'].map((s) => s.refused ?? null);
fs.writeFileSync(process.argv[3], JSON.stringify(out) + '\n');
console.log(Object.keys(out.full).length, Object.keys(out.digests).length, fs.statSync(process.argv[3]).size);
