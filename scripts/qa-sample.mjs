// Writes the QA sample novel file (qa/qa-sample.novel.json) again from its builder (qa/sample-novel.ts), through the
// test that otherwise checks the file is current. Run with  npm run qa:sample
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const run = spawnSync(process.execPath, [vitest, 'run', 'qa/sample-novel.test.ts'], { stdio: 'inherit', env: { ...process.env, QA_SAMPLE_WRITE: '1' } });
process.exit(run.status ?? 1);
