// Offline test. Builds the app, serves the build, then cuts the network.
// Run with `npm run test:offline`. Uses a throwaway browser profile.
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
};

const build = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(1);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  if (await fetch(BASE).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (m) => process.env.DEBUG && console.log('  [console]', m.type(), m.text()));
page.on('requestfailed', (r) => process.env.DEBUG && console.log('  [failed]', r.url(), r.failure()?.errorText));
const text = '.manuscript-text';

try {
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  check('app is stored on the device for offline use', true);

  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Offline Novel');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.locator(text).click();
  await page.keyboard.type('Written online.');
  await page.locator('.save-status.saved').waitFor();
  const url = page.url();

  // Cut the network completely, including the server the app came from.
  await context.setOffline(true);
  server.kill();
  await page.reload();
  await page.locator(text).waitFor();
  check('app opens with no network, straight to the chapter', (await page.locator(text).innerText()).includes('Written online.'));
  check('editor shows it is offline', (await page.locator('.offline-tag').innerText()) === 'Offline');

  await page.locator('.ms-scroll').click({ position: { x: 12, y: 500 } });
  await page.locator(`${text}.ProseMirror-focused`).waitFor();
  await page.keyboard.type(' Written offline.');
  await page.locator('.save-status.saved').waitFor();
  check('writing saves while offline', (await page.locator('.save-status').innerText()).includes('Saved'));

  await page.goto(BASE);
  await page.locator('.card', { hasText: 'Offline Novel' }).waitFor();
  check('library works offline', (await page.locator('.card').innerText()).includes('4 words'), await page.locator('.card').innerText());
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Started Offline');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  // The library's own heading is still on screen for an instant while the new workspace loads.
  const offlineTitle = await page.locator('h1', { hasText: 'Started Offline' }).waitFor({ timeout: 10000 }).then(() => 'Started Offline', async () => page.locator('h1').first().innerText());
  check('new projects can be created offline', offlineTitle === 'Started Offline', offlineTitle);

  // Close everything and come back, still offline.
  await page.close();
  const again = await context.newPage();
  await again.goto(url);
  await again.locator(text).waitFor();
  check('after closing and reopening offline, the text is all there', (await again.locator(text).innerText()).trim() === 'Written online. Written offline.', await again.locator(text).innerText());
  await again.goto(`${BASE}/project/does-not-exist/organizer`);
  check('any page of the app loads offline', await again.getByText('Project not found').isVisible());
} catch (err) {
  check('script completed', false, err.stack);
  if (process.env.DEBUG) console.log('  [page]', page.url(), (await page.content().catch(() => '')).slice(0, 600));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
