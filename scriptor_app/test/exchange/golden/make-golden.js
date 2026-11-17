// Turns dump.dart's output into the committed golden: whole outputs for the `book` and `edge` novels' book, ebook and
// serial, and a few of edge's compiles; a SHA-256 of the rest. Compiles with the history switch are left out (their
// dates are in local time).
const fs = require('fs');
const crypto = require('crypto');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = { full: {}, digests: {} };
for (const k of Object.keys(d).sort()) {
  const m = /\.compile\.(\d+)\./.exec(k);
  if (m && (+m[1] & 16) !== 0) continue;
  const name = k.split(/[.+]/)[0];
  const whole = (name === 'book' || name === 'edge') && !k.includes('+') && (!k.includes('.compile.') || /^edge\.compile\.(15|3)\./.test(k));
  if (whole) out.full[k] = d[k];
  else out.digests[k] = crypto.createHash('sha256').update(JSON.stringify(d[k])).digest('hex').slice(0, 32);
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out.full).length, Object.keys(out.digests).length, fs.statSync(process.argv[3]).size);
