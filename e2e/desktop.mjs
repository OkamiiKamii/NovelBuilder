// Drives the desktop app itself (not a browser). Build first: npm run build && node scripts/build-desktop.mjs
// It uses a throwaway profile, so it never touches your real projects.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
};
const profile = mkdtempSync(join(tmpdir(), 'nb-desktop-'));
// Some editors' terminals set ELECTRON_RUN_AS_NODE, which makes Electron behave as plain Node: not wanted here.
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
// APP=<path to a packaged app's program> tests that build instead of the source in desktop/.
const launch = () => electron.launch(process.env.APP ? { executablePath: process.env.APP, args: [`--user-data-dir=${profile}`], env } : { args: ['desktop', `--user-data-dir=${profile}`], env });
let app = await launch();
try {
  let page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  check('the desktop app opens on the Library, from its own files', (await page.evaluate(() => location.href)) === 'app://novel-builder/');
  check('it is a secure place for the app to run (what creating and storing projects needs)', await page.evaluate(() => window.isSecureContext && typeof crypto.randomUUID === 'function' && 'indexedDB' in window));
  check('nothing is fetched from the network to start it', await page.evaluate(() => performance.getEntriesByType('resource').every((r) => r.name.startsWith('app://'))));
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Desk Novel');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const projectUrl = page.url();
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.locator('.manuscript-text').click();
  await page.keyboard.type('Written in the desktop app.');
  await page.locator('.save-status.saved').waitFor();
  check('a project can be created and written in', true);
  const chapterUrl = page.url();
  await page.reload();
  await page.locator('.manuscript-text').waitFor();
  check('reloading deep inside the app comes back to the same chapter', page.url() === chapterUrl && (await page.locator('.manuscript-text').innerText()).includes('Written in the desktop app.'));
  await page.goto(`${projectUrl}/read`);
  await page.locator('.reader .title-page h1').waitFor();
  check('the reader preview works', (await page.locator('.reader .title-page h1').innerText()) === 'Desk Novel');
  // A download in the app is saved through the system's Save dialog; here it is sent to the throwaway folder instead.
  const download = app.evaluate(({ session }, dir) => new Promise((resolve) => session.defaultSession.once('will-download', (_event, item) => {
    item.setSavePath(`${dir}/${item.getFilename()}`);
    item.once('done', (_e, state) => resolve({ name: item.getFilename(), state, bytes: item.getReceivedBytes() }));
  })), profile);
  await page.goto('app://novel-builder/');
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await page.locator('summary[aria-label="Actions for Desk Novel"]').click();
  await page.getByRole('button', { name: 'Export backup' }).click();
  const saved = await download;
  check('Export backup saves a file', saved.state === 'completed' && /desk-novel/i.test(saved.name) && saved.bytes > 500, JSON.stringify(saved));
  await app.close();

  // Quit and open again: the work is still there.
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await page.getByText('Desk Novel').first().waitFor();
  await page.goto(chapterUrl);
  await page.locator('.manuscript-text').waitFor();
  check('after quitting and reopening, the project and its text are still there', (await page.locator('.manuscript-text').innerText()).includes('Written in the desktop app.'));
  check('no errors in the app', errors.length === 0, errors.join('\n      '));
} catch (err) {
  check('script completed', false, err.stack);
} finally {
  await app.close().catch(() => {});
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
