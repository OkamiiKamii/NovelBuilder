// Speed with a large novel: `npm run test:perf` builds the app, serves the build and runs this; against a running
// server, `node e2e/perf.mjs`. The novel is `bigNovel.mjs` (2,000 events, 1,550 codex entries, 4,000 connections, 603
// parts of the manuscript…), the same every time. Each page is timed from navigation until it is drawn, with how long
// the browser was busy (long tasks); then a few things an author does: filter, select, switch to the list. Each
// measurement is the median of PERF_RUNS runs (default 3). PERF_OUT names a JSON file to keep the results in.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { bigNovel } from './bigNovel.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const SCALE = Number(process.env.PERF_SCALE ?? 1);
const RUNS = Number(process.env.PERF_RUNS ?? 3);
/** "pages" or "actions" to time only those. */
const ONLY = process.env.PERF_ONLY ?? null;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// Long tasks (over 50 ms on the main thread), from the start of each page.
await context.addInitScript(() => {
  window.__long = [];
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: true });
  } catch {
    /* not supported */
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = { scale: SCALE, runs: RUNS, at: new Date().toISOString(), pages: {}, actions: {} };

async function createProject(title) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  return page.url().split('/').pop();
}

/** Waits for the page to be drawn: the given test passes, and two frames have painted. */
async function drawn(test, timeout = 60_000) {
  await page.waitForFunction(test, null, { timeout, polling: 50 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Time from navigation until drawn, and how long the browser was busy meanwhile. */
async function timePage(url, test) {
  const loads = [];
  const blocked = [];
  const longest = [];
  for (let i = 0; i < RUNS; i++) {
    await page.goto(url);
    await drawn(test);
    const m = await page.evaluate(() => ({ at: performance.now(), long: window.__long ?? [] }));
    loads.push(m.at);
    blocked.push(m.long.reduce((t, d) => t + Math.max(0, d - 50), 0));
    longest.push(Math.max(0, ...m.long));
  }
  return { ms: Math.round(median(loads)), blocked: Math.round(median(blocked)), longestTask: Math.round(median(longest)) };
}

/** Time from an action until its result is drawn; null, and said, when it does not finish. */
async function timeAction(prepare, act, test) {
  const times = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      await prepare();
      const started = Date.now();
      await act();
      await drawn(test, 30_000);
      times.push(Date.now() - started);
    }
  } catch (e) {
    console.log(`  (did not finish: ${e.message.split('\n')[0]})`);
    return null;
  }
  return Math.round(median(times));
}

try {
  const projectId = await createProject('Large Novel');
  const rows = bigNovel(projectId, Date.now(), SCALE);
  await page.evaluate((rows) => new Promise((resolve, reject) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(Object.keys(rows), 'readwrite');
      for (const [table, list] of Object.entries(rows)) for (const row of list) tx.objectStore(table).put(row);
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), rows);
  const counts = Object.fromEntries(Object.entries(rows).map(([t, l]) => [t, l.length]));
  console.log(`A large novel (scale ${SCALE}): ${Object.entries(counts).map(([t, c]) => `${t} ${c}`).join(', ')}. Median of ${RUNS} runs.\n`);
  const base = `${BASE}/project/${projectId}`;

  // Every Visualize view, drawn: from navigation until its view is there and nothing is loading.
  await page.goto(`${base}/visualize`);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link').first().waitFor();
  const views = await page.getByRole('navigation', { name: 'Views' }).getByRole('link').evaluateAll((links) => links.map((a) => ({ label: a.textContent.trim(), key: a.getAttribute('href').split('/visualize/')[1].split('?')[0] })));
  const ready = (label) => `(() => { const h = [...document.querySelectorAll('h2')].some((x) => x.textContent.trim() === ${JSON.stringify(label)}); const root = document.querySelector('.viz-export-root'); return h && root && root.children.length > 0 && !root.querySelector('.viz-state [role=status], .viz-state[role=status]'); })()`;
  for (const view of ONLY === 'actions' ? [] : views) {
    results.pages[`Visualize · ${view.label}`] = await timePage(`${base}/visualize/${view.key}`, ready(view.label));
    console.log(`Visualize · ${view.label.padEnd(26)} ${String(results.pages[`Visualize · ${view.label}`].ms).padStart(6)} ms   busy ${String(results.pages[`Visualize · ${view.label}`].blocked).padStart(5)} ms   longest task ${results.pages[`Visualize · ${view.label}`].longestTask} ms`);
  }
  // The other pages that read the whole novel.
  for (const [path, label, test] of ONLY === 'actions' ? [] : [
    ['timeline', 'Timeline page', `document.querySelectorAll('main h1').length > 0 && document.body.innerText.includes('Event 0')`],
    ['relationships', 'Relationships page', `document.querySelectorAll('main h1').length > 0 && document.querySelectorAll('svg').length > 0`],
    ['board', 'Scene board', `document.querySelectorAll('.board-card').length > 400`],
    ['graph', 'Story graph (laid out)', `document.querySelector('.graph-canvas[data-settled="true"]') !== null`],
    ['integrity', 'Record check', `[...document.querySelectorAll('h2')].some((h) => h.textContent.includes('Canon and continuity rules'))`],
    ['review', 'Continuity review', `document.querySelector('[role=status]')?.textContent.includes('to look at') && !document.body.innerText.includes('Checking the manuscript')`],
    ['dashboard', 'Dashboard', `document.querySelectorAll('main h1').length > 0 && document.body.innerText.includes('Character')`],
  ]) {
    results.pages[label] = await timePage(`${base}/${path}`, test);
    console.log(`${label.padEnd(38)} ${String(results.pages[label].ms).padStart(6)} ms   busy ${String(results.pages[label].blocked).padStart(5)} ms   longest task ${results.pages[label].longestTask} ms`);
  }

  // What an author does in a view.
  if (ONLY === 'pages') throw new Error('skip');
  const listOf = (name) => `document.querySelector('[aria-label=${JSON.stringify(name)}]')`;
  results.actions['Timeline list: search by name (100 of 2,000)'] = await timeAction(
    async () => { await page.goto(`${base}/visualize/timeline?as=list`); await drawn(`${listOf('Events in story order')}?.children.length === 2000`); },
    () => page.getByLabel('Search by name').fill('Event 01'),
    `${listOf('Events in story order')}?.children.length === 100`,
  );
  results.actions['Timeline list: select an event, details shown'] = await timeAction(
    async () => { await page.goto(`${base}/visualize/timeline?as=list`); await drawn(`${listOf('Events in story order')}?.children.length === 2000`); },
    () => page.getByRole('button', { name: 'Event 0000', exact: true }).click(),
    `document.querySelector('aside.viz-detail h2')?.textContent === 'Event 0000'`,
  );
  results.actions['Timeline: drawn to list'] = await timeAction(
    async () => { await page.goto(`${base}/visualize/timeline`); await drawn(`document.querySelectorAll('.tl-mark').length > 0`); },
    () => page.getByRole('button', { name: 'List', exact: true }).click(),
    `${listOf('Events in story order')}?.children.length === 2000`,
  );
  const mapStatus = `[...document.querySelectorAll('[role=status]')].find((s) => s.textContent.startsWith('Showing'))?.textContent`;
  results.actions['Relationship map: filter by type'] = await timeAction(
    async () => { await page.goto(`${base}/visualize/relationships`); await drawn(`document.querySelectorAll('.rel-line').length > 0`); await page.evaluate(`window.__before = ${mapStatus}`); },
    () => page.getByLabel('Relationship type shown').selectOption({ index: 1 }),
    `new URL(location.href).searchParams.has('rtype') && ${mapStatus} !== window.__before`,
  );
  results.actions['Knowledge graph: search, drawn again'] = await timeAction(
    async () => { await page.goto(`${base}/visualize/graph`); await drawn(`document.querySelectorAll('.kg-node').length > 0`); },
    () => page.getByLabel('Search by name').fill('Character 01'),
    `document.body.innerText.includes('Only records named “Character 01”')`,
  );
  results.actions['Charts: a chapter range'] = await timeAction(
    async () => { await page.goto(`${base}/visualize/charts`); await drawn(`document.querySelectorAll('.chart-card').length === 7`); },
    () => page.getByLabel('Charts from chapter', { exact: true }).selectOption({ index: 61 }),
    `new URL(location.href).searchParams.has('cfrom') && document.querySelector('.chart-card').querySelectorAll('.chart-col').length === 60`,
  );
  for (const [name, ms] of Object.entries(results.actions)) console.log(`${name.padEnd(48)} ${ms === null ? 'did not finish' : `${String(ms).padStart(6)} ms`}`);
  if (errors.length) console.log(`\nBrowser errors: ${errors.join(' | ')}`);
} catch (e) {
  if (e.message !== 'skip') {
    console.log(`The benchmark did not finish: ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(results, null, 2));
