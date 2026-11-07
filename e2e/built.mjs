// End-to-end smoke test against a production build: builds the app, serves the
// build, runs smoke.mjs against it, then stops the server. Run with
// `npm run test:e2e:built`; another script of this folder by name (`node e2e/built.mjs a11y.mjs`,
// `npm run test:a11y`). This is the standard e2e run: on long runs the dev
// server stalls while compiling modules on request, and a build serves the
// same app ready-made. `npm run test:e2e` still runs against a dev server.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const root = fileURLToPath(new URL('..', import.meta.url));
const script = process.argv[2] ?? 'smoke.mjs';

await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { port: PORT, strictPort: true } });
const run = spawn(process.execPath, [fileURLToPath(new URL(`./${script}`, import.meta.url))], { stdio: 'inherit', env: { ...process.env, APP_URL: `http://localhost:${PORT}` } });
// Stopping this script stops the server too, so no server is left holding the port.
process.on('SIGINT', () => run.kill());
const code = await new Promise((resolve) => run.on('exit', (status) => resolve(status ?? 1)));
await server.close();
process.exit(code);
