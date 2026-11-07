// Every link in the app, followed (Prompt 50). Restores the novel the data-ownership tests use (made through the app's own
// pages, every kind of record), opens every page and every Visualize view drawn and as a list, collects every link on them
// and opens each. Fails on a link the app cannot open (it falls back to the Library), on any request to another host, and
// on any browser error. Run with  npm run test:links  (a production build; see built.mjs).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
const outside = new Set();
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()}: console: ${m.text()}`); });
page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) outside.add(r.url()); });

await page.goto(BASE);
await page.getByRole('button', { name: 'Import' }).waitFor();
await page.locator('input[type=file]').setInputFiles({ name: 'made-in-the-app.novel.json', mimeType: 'application/json', buffer: readFileSync('src/modules/projects/fixtures/made-in-the-app.novel.json') });
await page.getByText(/^Imported "/).waitFor();
const projectId = await page.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('novel-builder');
  open.onsuccess = () => { const req = open.result.transaction('projects').objectStore('projects').getAllKeys(); req.onsuccess = () => resolve(req.result[0]); };
}));
const base = `${BASE}/project/${projectId}`;
// Every kind of widget on the dashboard (Optional Prompt B), so the links they make are followed too.
await page.evaluate(([key, kinds]) => localStorage.setItem(key, JSON.stringify({ version: 1, widgets: kinds.map((kind) => ({ id: `links-${kind}`, kind, w: 1, h: 3, title: '', config: { count: 50 } })) })), [`novel-builder:dashboard:${projectId}`, ['upcoming', 'threads', 'recent', 'words', 'appearances', 'warnings', 'saved']]);
const pages = ['', 'manuscript', 'organizer', 'board', 'characters', 'characters/systems', 'codex', 'relationships', 'timeline', 'histories', 'timeline/review', 'plot', 'canon', 'continuity', 'integrity', 'review', 'progression', 'branches', 'consequences', 'graph', 'progress', 'export', 'dashboard', 'modules', 'read', 'team', 'sync', 'studio', 'settings', 'assistant'].map((p) => `${base}${p ? `/${p}` : ''}`);
await page.goto(`${base}/visualize`);
await page.getByRole('navigation', { name: 'Views' }).getByRole('link').first().waitFor();
const views = await page.getByRole('navigation', { name: 'Views' }).getByRole('link').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
for (const v of views) pages.push(`${BASE}${v}`, `${BASE}${v}${v.includes('?') ? '&' : '?'}as=list`);

const links = new Map();
const external = new Set();
for (const url of pages) {
  await page.goto(url);
  await page.waitForTimeout(500);
  if (new URL(page.url()).pathname === '/' && new URL(url).pathname !== '/') console.log(`PAGE REDIRECTED TO THE LIBRARY: ${url}`);
  for (const href of await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.href))) {
    const u = new URL(href);
    if (u.origin !== new URL(BASE).origin) external.add(href);
    else if (!links.has(u.pathname + u.search)) links.set(u.pathname + u.search, url);
  }
}
console.log(`${pages.length} pages and views opened; ${links.size} distinct internal links found on them.`);
const broken = [];
const notes = [];
let n = 0;
for (const [link, from] of links) {
  if (++n > 700) break;
  await page.goto(`${BASE}${link}`);
  await page.waitForTimeout(250);
  const now = new URL(page.url());
  if (now.pathname === '/' && link.split('?')[0] !== '/') broken.push(`${link} (found on ${from.replace(BASE, '')}) → the Library`);
  const text = await page.locator('main').innerText().catch(() => '');
  const said = text.match(/[^\n]*(not found|no longer exists|was deleted|does not exist|doesn't exist|is gone)[^\n]*/i);
  if (said) notes.push(`${link}: “${said[0].trim().slice(0, 140)}”`);
}
console.log(`${Math.min(n, links.size)} links followed.`);
console.log(`Broken (sent to the Library): ${broken.length}`);
for (const b of broken) console.log(`  ${b}`);
console.log(`Pages saying something is missing: ${notes.length}`);
for (const x of notes.slice(0, 40)) console.log(`  ${x}`);
console.log(`External links on pages: ${external.size}`);
for (const x of [...external].slice(0, 20)) console.log(`  ${x}`);
console.log(`Requests to other hosts: ${outside.size}`);
for (const x of [...outside].slice(0, 20)) console.log(`  ${x}`);
console.log(`Browser errors: ${errors.length}`);
for (const x of errors.slice(0, 20)) console.log(`  ${x}`);
await browser.close();
// Pages that explain a missing record (a dated event whose anchor was deleted) are the app doing its job, not a failure.
process.exit(broken.length || outside.size || errors.length ? 1 : 0);
