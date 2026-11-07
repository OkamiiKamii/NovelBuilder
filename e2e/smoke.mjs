// End-to-end smoke test. `npm run test:e2e:built` builds the app, serves the build and runs this.
// Against a running dev server (`npm run dev`), run `npm run test:e2e`.
// Uses a throwaway browser profile, so it never touches your real projects.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { chromium, devices } from 'playwright';
import { bigNovel } from './bigNovel.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS_DIR;
const results = [];
let relay = null;
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
};
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}\n      received ${JSON.stringify(actual)}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// The dev server's own hot-reload socket dropping as a page is left is not an error of the app.
page.on('console', (m) => m.type() === 'error' && !m.text().startsWith("WebSocket connection to 'ws://localhost:5173/?token") && errors.push(m.text()));
// Kept for the failure report below: what the page was still waiting on when a step timed out.
const pending = new Set();
page.on('request', (r) => pending.add(r.url()));
for (const done of ['requestfinished', 'requestfailed']) page.on(done, (r) => pending.delete(r.url()));

const text = '.manuscript-text';
const paragraphs = () => page.$$eval(`${text} > *`, (els) => els.map((el) => el.textContent));
const stat = async (label) => (await page.locator('.ms-stats span', { hasText: label }).first().innerText()).replace(/\s+/g, ' ');
const saved = () => page.locator('.save-status.saved').waitFor({ timeout: 5000 });
const shot = (name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

async function createProject(title) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Primary genre').fill('Fantasy');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  return page.url().split('/').pop();
}

try {
  // --- Phase 1: project + workspace ---
  const p1 = await createProject('Ashfall');
  check('project opens at /project/:id', /\/project\/[\w-]{36}$/.test(page.url()));

  // --- Writing ---
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const chapter1 = page.url().split('/').pop();
  await page.locator(text).click();
  await page.keyboard.type('"Wait."  She turned.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Indented   line -- with "straight" quotes...');
  const typed = ['"Wait."  She turned.', '', '\tIndented   line -- with "straight" quotes...'];
  eq('typed text is kept exactly (spaces, tab, blank line, no smart quotes)', await paragraphs(), typed);

  await page.waitForTimeout(300);
  check('live word count', (await stat('words')) === '8 words', await stat('words'));
  check('live character count', (await stat('characters')).startsWith('65 '), await stat('characters'));
  check('paragraph count ignores blank lines', (await stat('paragraphs')) === '2 paragraphs', await stat('paragraphs'));
  check('reading time shown', (await stat('min read')) === '1 min read', await stat('min read'));

  // Markdown-style input must not be auto-converted
  await page.keyboard.press('Enter');
  await page.keyboard.type('# not a heading');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> not a quote **nor bold**');
  check('no automatic Markdown transforms', (await page.locator(`${text} :is(h1,blockquote,strong)`).count()) === 0);

  // --- Formatting + shortcuts ---
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type('ital');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.press('ControlOrMeta+u');
  await page.keyboard.type('under');
  await page.keyboard.press('ControlOrMeta+u');
  eq('Cmd/Ctrl+B, I, U', await page.$$eval(`${text} :is(strong,em,u)`, (els) => els.map((e) => `${e.tagName}:${e.textContent}`)), ['STRONG:bold', 'EM:ital', 'U:under']);

  await page.getByRole('button', { name: 'Strikethrough' }).click();
  await page.keyboard.type('gone');
  await page.getByRole('button', { name: 'Strikethrough' }).click();
  check('strikethrough button', (await page.locator(`${text} s`).innerText()) === 'gone');
  check('toolbar press keeps focus in the editor', await page.evaluate(() => document.activeElement?.classList.contains('manuscript-text')));

  await page.keyboard.press('Enter');
  await page.keyboard.type('Centered');
  await page.getByRole('button', { name: 'Align centre' }).click();
  check('alignment', (await page.locator(`${text} > *`).last().getAttribute('style'))?.includes('center') ?? false);
  await page.getByRole('button', { name: 'Justify' }).click();
  check('justify', (await page.locator(`${text} > *`).last().getAttribute('style'))?.includes('justify') ?? false);
  await page.getByLabel('Text style').selectOption('2');
  check('heading', (await page.locator(`${text} h2`).innerText()) === 'Centered');
  await page.keyboard.press('Enter');
  await page.getByLabel('Text style').selectOption('0');
  await page.getByRole('button', { name: 'Align left' }).click();
  await page.getByRole('button', { name: 'Blockquote' }).click();
  await page.keyboard.type('Quoted');
  check('blockquote', (await page.locator(`${text} blockquote`).innerText()).trim() === 'Quoted');

  // --- Undo / redo ---
  const before = await paragraphs();
  await page.waitForTimeout(700); // typing bursts are grouped into one undo step
  await page.keyboard.type(' extra');
  await page.keyboard.press('ControlOrMeta+z');
  eq('undo (Cmd/Ctrl+Z)', await paragraphs(), before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  check('redo (Cmd/Ctrl+Shift+Z)', (await paragraphs()).at(-1) === 'Quoted extra');
  await page.getByRole('button', { name: 'Undo' }).click();
  eq('undo button', await paragraphs(), before);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  check('select all', (await page.evaluate(() => getSelection().toString())).includes('Wait') && (await page.evaluate(() => getSelection().toString())).includes('Quoted'));

  // --- Paste keeps raw text ---
  await page.locator(`${text} blockquote p`).click();
  await page.waitForTimeout(100); // let the editor register the click before the next key
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Blockquote' }).click();
  await page.evaluate(() => navigator.clipboard.writeText('Line one  two spaces\n\n\n    four-space indent\n"Dialogue," he said.'));
  await page.keyboard.press('ControlOrMeta+v');
  eq('paste preserves blank lines, indents and spacing', (await paragraphs()).slice(-5), ['Line one  two spaces', '', '', '    four-space indent', '"Dialogue," he said.']);

  // --- Autosave + reload ---
  await page.getByLabel('Title', { exact: true }).fill('The Gate');
  await page.locator(text).click();
  await saved();
  const beforeReload = await page.locator(text).innerHTML();
  const wordsBefore = await stat('words');
  await page.reload();
  await page.locator(text).waitFor();
  check('content identical after reload', (await page.locator(text).innerHTML()) === beforeReload);
  check('title saved', (await page.getByLabel('Title', { exact: true }).inputValue()) === 'The Gate');
  check('stats restored after reload', (await stat('words')) === wordsBefore, `${await stat('words')} vs ${wordsBefore}`);
  check('chapter list shows title and count', (await page.locator('.toc li.active').innerText()).includes('The Gate'));
  await shot('desktop-editor');

  // --- Find and replace ---
  // A new search starts at the first match after the cursor: put the cursor at the start, wherever the click lands.
  await page.locator(text).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByLabel('Find', { exact: true }).fill('line');
  await page.waitForTimeout(100);
  check('find counts matches case-insensitively', (await page.locator('.find-count').innerText()) === '1 of 2', await page.locator('.find-count').innerText());
  check('matches highlighted without changing text', (await page.locator('.find-match').count()) === 2 && (await page.locator('.find-current').count()) === 1);
  await page.getByLabel('Find', { exact: true }).press('Enter');
  check('next result', (await page.locator('.find-count').innerText()) === '2 of 2');
  await page.getByLabel('Replace with').fill('LINE');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  check('replace one', (await paragraphs()).includes('LINE one  two spaces') && (await paragraphs()).some((p) => p.includes('Indented   line')));
  await page.getByRole('button', { name: 'Match case' }).click();
  await page.getByLabel('Find', { exact: true }).fill('"');
  await page.getByLabel('Replace with').fill("'");
  await page.getByRole('button', { name: 'Replace all' }).click();
  check('replace all', !(await paragraphs()).join('').includes('"') && (await paragraphs())[0] === "'Wait.'  She turned.");
  await page.getByRole('button', { name: 'Close find' }).click();
  await page.locator(`${text}.ProseMirror-focused`).waitFor();
  await page.keyboard.press('ControlOrMeta+z');
  check('replace all is one undo step', (await paragraphs())[0] === '"Wait."  She turned.');
  check('highlights cleared on close', (await page.locator('.find-match').count()) === 0);
  await saved();

  // --- Second chapter, notes, reference, reorder ---
  await page.getByRole('button', { name: '+ Chapter' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith(chapter1));
  await page.locator(text).click();
  await page.keyboard.type('Second chapter text here.');
  check('undo history does not cross chapters', await page.getByRole('button', { name: 'Undo' }).isEnabled());
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  eq('undo stops at the empty chapter', await paragraphs(), ['']);
  await page.keyboard.type('Second chapter text here.');
  await saved();
  await page.getByRole('button', { name: 'Plan and reference' }).click();
  await page.getByLabel('Private notes').fill('Fix the pacing.');
  await page.getByRole('tab', { name: 'Chapters' }).click();
  await page.getByLabel('Chapter or scene to reference').selectOption({ label: 'The Gate' });
  await page.locator('.reference-doc .ProseMirror').waitFor();
  check('reference panel shows another chapter read-only', (await page.locator('.reference-doc').innerText()).includes('She turned') && (await page.locator('.reference-doc .ProseMirror').getAttribute('contenteditable')) === 'false');
  await shot('desktop-reference');
  await page.getByRole('tab', { name: 'Plan' }).click();
  check('notes kept', (await page.getByLabel('Private notes').inputValue()) === 'Fix the pacing.');


  // --- Phase 3: organizer ---
  const chapter2 = page.url().split('/').pop();
  const outline = () => page.$$eval('.outline-row', (els) => els.map((e) => `${'  '.repeat(Number(e.style.getPropertyValue('--depth')))}${e.querySelector('strong').textContent} [${e.querySelector('.outline-words').textContent}]`));
  const row = (title) => page.locator('.outline-row', { has: page.locator('strong', { hasText: new RegExp(`^${title.replace(/[()]/g, '\\$&')}$`) }) });
  const menu = async (title, item) => {
    await row(title).first().getByLabel(`Actions for ${title}`).click();
    await row(title).first().locator('.menu-items').getByText(item, { exact: true }).click();
  };
  const drag = async (from, to, where) => {
    const box = await row(to).first().boundingBox();
    const y = where === 'before' ? 3 : where === 'after' ? box.height - 3 : box.height / 2;
    await row(from).first().dragTo(row(to).first(), { targetPosition: { x: 200, y } });
    await page.waitForTimeout(150);
  };
  const gateText = async () => (await db(`chapterContents`, chapter1)).doc;
  const db = (table, id) => page.evaluate(([t, key]) => new Promise((resolve, reject) => {
    const open = indexedDB.open('novel-builder');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction(t).objectStore(t).get(key);
      request.onsuccess = () => { open.result.close(); resolve(request.result); };
    };
  }), [table, id]);

  await page.goto(`${BASE}/project/${p1}/organizer`);
  await row('The Gate').waitFor();
  eq('organizer lists existing chapters with word counts', await outline(), ['The Gate [30]', 'Chapter 2 [4]']);
  const gateBefore = JSON.stringify(await gateText());

  await page.getByText('+ Volume / Act / Arc').click();
  await page.getByRole('button', { name: 'New volume' }).click();
  await row('Volume 1').waitFor();
  await drag('The Gate', 'Volume 1', 'inside');
  eq('drag a chapter into a volume', await outline(), ['Chapter 2 [4]', 'Volume 1 [30]', '  The Gate [30]']);

  await menu('The Gate', 'Add scene');
  await row('Scene 1').waitFor();
  await menu('The Gate', 'Add scene');
  await row('Scene 2').waitFor();
  eq('nested Volume › Chapter › Scenes', await outline(), ['Chapter 2 [4]', 'Volume 1 [30]', '  The Gate [30]', '    Scene 1 [0]', '    Scene 2 [0]']);

  // Write in a scene, then check the totals roll up.
  await menu('Scene 2', 'Open in editor');
  await page.locator(text).waitFor();
  const scene2 = page.url().split('/').pop();
  check('editor shows where the scene lives', (await page.locator('.ms-location').innerText()) === 'Volume 1 › The Gate › Scene');
  await page.locator(text).click();
  await page.keyboard.type('Rain fell on the  black gate.');
  await saved();
  check('contents sidebar shows the nested tree with rolled-up counts', (await page.locator('.toc li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ') === 'Chapter 2 4 | ▾ VOLUME 1 36 | ▾ The Gate 36 | Scene 1 0 | Scene 2 6', (await page.locator('.toc li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '));
  await page.goBack();
  await row('Scene 2').waitFor();
  eq('word counts aggregate scene → chapter → volume', await outline(), ['Chapter 2 [4]', 'Volume 1 [36]', '  The Gate [36]', '    Scene 1 [0]', '    Scene 2 [6]']);
  check('whole-novel total', (await page.locator('.organizer .page-header .muted').innerText()) === '40 words · 2 chapters · 2 scenes', await page.locator('.organizer .page-header .muted').innerText());

  // Metadata
  await row('Scene 2').click();
  await page.getByLabel('Summary').fill('Mira reaches the gate in the rain.');
  await page.getByLabel('Private notes').fill('Foreshadow the key.');
  await row('Scene 2').getByLabel('Status of Scene 2').selectOption('revising');
  await row('The Gate').getByLabel('Status of The Gate').selectOption('published');
  await page.waitForTimeout(900);
  await page.reload();
  await row('Scene 2').waitFor();
  check('status, summary and notes persist', (await row('Scene 2').getByLabel('Status of Scene 2').inputValue()) === 'revising' && (await row('The Gate').getByLabel('Status of The Gate').inputValue()) === 'published' && (await row('Scene 2').innerText()).includes('Mira reaches the gate'));
  await row('Scene 2').click();
  check('details panel reloads notes', (await page.getByLabel('Private notes').inputValue()) === 'Foreshadow the key.');

  // Reordering by drag, by id
  await drag('Scene 2', 'Scene 1', 'before');
  eq('drag to reorder scenes', (await outline()).slice(3, 5), ['    Scene 2 [6]', '    Scene 1 [0]']);
  await drag('Scene 2', 'Chapter 2', 'inside');
  eq('drag a scene to another chapter; totals follow', await outline(), ['Chapter 2 [10]', '  Scene 2 [6]', 'Volume 1 [30]', '  The Gate [30]', '    Scene 1 [0]']);
  await drag('Volume 1', 'Scene 2', 'inside');
  await drag('Scene 1', 'Volume 1', 'before');
  eq('impossible drops are refused', await outline(), ['Chapter 2 [10]', '  Scene 2 [6]', 'Volume 1 [30]', '  The Gate [30]', '    Scene 1 [0]']);
  await drag('Volume 1', 'Chapter 2', 'before');
  eq('drag a volume (with everything in it) above a chapter', await outline(), ['Volume 1 [30]', '  The Gate [30]', '    Scene 1 [0]', 'Chapter 2 [10]', '  Scene 2 [6]']);
  const moved = await db('chapters', scene2);
  check('moved scene kept its id, parent link, notes and status', moved.parentId === chapter2 && moved.notes === 'Foreshadow the key.' && moved.status === 'revising' && moved.title === 'Scene 2');
  check('moved scene kept its text exactly', JSON.stringify((await db('chapterContents', scene2)).doc).includes('Rain fell on the  black gate.'));
  check('untouched chapter text is byte-identical after all moves', JSON.stringify(await gateText()) === gateBefore);

  // Menu fallbacks, duplicate, delete
  await menu('Volume 1', 'Move down');
  await page.waitForTimeout(150);
  eq('move down (touch-friendly fallback)', (await outline())[0], 'Chapter 2 [10]');
  await menu('Volume 1', 'Move up');
  await page.waitForTimeout(150);
  eq('move up', (await outline())[0], 'Volume 1 [30]');
  await menu('Chapter 2', 'Duplicate');
  await row('Chapter 2 (Copy)').waitFor();
  eq('duplicate copies the chapter with its scene and text', await outline(), ['Volume 1 [30]', '  The Gate [30]', '    Scene 1 [0]', 'Chapter 2 [10]', '  Scene 2 [6]', 'Chapter 2 (Copy) [10]', '  Scene 2 [6]']);
  await menu('Chapter 2 (Copy)', 'Delete…');
  check('delete warns about what is inside', (await page.locator('dialog').innerText()).includes('1 item inside it') && (await page.locator('dialog').innerText()).includes('10 words'));
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await row('Chapter 2 (Copy)').waitFor({ state: 'detached' });
  check('delete removes the copy only', (await outline()).length === 5 && JSON.stringify((await db('chapterContents', scene2)).doc).includes('Rain fell'));
  await row('The Gate').getByLabel('Collapse The Gate').click();
  check('collapse hides children', (await outline()).length === 4);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await shot('organizer');

  // Contents sidebar: jump + add scene
  await page.goto(`${BASE}/project/${p1}/manuscript/${chapter1}`);
  await page.locator(text).waitFor();
  check('chapter text still opens after reorganising', (await page.locator(text).innerText()).includes('She turned'));
  await page.getByLabel('Jump to chapter or scene').fill('scene 2');
  await page.locator('.toc a', { hasText: 'Scene 2' }).click();
  await page.getByText('Rain fell on the').waitFor();
  check('jump-to filter opens the scene', page.url().endsWith(scene2));
  await page.getByLabel('Jump to chapter or scene').fill('');
  await shot('editor-toc');
  await page.locator('.toc a', { hasText: 'Chapter 2' }).click();
  await page.getByText('Second chapter').waitFor();

  // --- Preferences ---
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('button', { name: 'Sepia' }).click();
  await page.getByRole('button', { name: 'Mono' }).click();
  await page.getByRole('button', { name: 'Wide', exact: true }).click();
  await page.getByLabel(/Font size/).fill('22');
  await page.getByLabel(/Line spacing/).fill('2');
  await shot('desktop-sepia-appearance');
  await page.keyboard.press('Escape');
  const look = () => page.evaluate(() => {
    const root = document.querySelector('.ms');
    const el = document.querySelector('.manuscript-text');
    const cs = getComputedStyle(el);
    return { theme: root.dataset.theme, size: cs.fontSize, mono: /mono|Menlo/i.test(cs.fontFamily), leading: Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 10) / 10, width: getComputedStyle(document.querySelector('.ms-canvas')).maxWidth, bg: getComputedStyle(root).backgroundColor };
  });
  const applied = await look();
  eq('theme and typography apply', { ...applied, bg: undefined }, { theme: 'sepia', size: '22px', mono: true, leading: 2, width: '840px', bg: undefined });
  await page.keyboard.press('ControlOrMeta+Shift+f');
  check('focus mode hides all chrome', !(await page.locator('.ms-bar').isVisible()) && !(await page.locator('.ms-nav').isVisible()) && !(await page.locator('.ms-stats').isVisible()) && !(await page.locator('.ms-panel').isVisible()) && (await page.locator(text).isVisible()));
  await shot('desktop-focus');
  await page.reload();
  await page.locator(text).waitFor();
  eq('preferences persist across reload', await look(), applied);
  check('focus mode persists', !(await page.locator('.ms-bar').isVisible()));
  await page.keyboard.press('Escape');
  check('Escape leaves focus mode', await page.locator('.ms-bar').isVisible());
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.keyboard.press('Escape');
  await shot('desktop-dark');
  check('dark theme', (await look()).bg === 'rgb(25, 23, 20)', (await look()).bg);

  // --- Stats flow back to the library ---
  await page.goto(BASE);
  await page.locator('.card', { hasText: 'Ashfall' }).getByText(/[1-9]\d* words/).waitFor();
  const card = await page.locator('.card', { hasText: 'Ashfall' }).innerText();
  check('library card shows real word and chapter counts', /\b40 words · 2 chapters/.test(card), card.replace(/\n/g, ' | '));
  await shot('library');

  // --- Isolation ---
  const p2 = await createProject('Other Novel');
  await page.goto(`${BASE}/project/${p2}/manuscript`);
  await page.getByRole('button', { name: 'Create the first chapter' }).waitFor();
  check('new project starts with an empty manuscript', (await page.locator('.toc li').count()) === 0);
  await page.goto(`${BASE}/project/${p2}/manuscript/${chapter1}`);
  await page.getByText('Chapter not found').waitFor();
  check("another project's chapter cannot be opened", (await page.locator(text).count()) === 0);
  await page.goto(`${BASE}/project/${p1}/manuscript`);
  await page.locator(text).waitFor();
  check('reopens the last chapter you were in', (await page.locator(text).innerText()).includes('Second chapter'));

  // --- Duplicate carries the manuscript ---
  await page.goto(`${BASE}/project/${p1}/settings`);
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await page.waitForURL((u) => /\/project\/[\w-]+$/.test(u.pathname) && !u.pathname.endsWith(p1));
  await page.getByRole('link', { name: 'Continue writing' }).click();
  await page.locator(text).waitFor();
  check('duplicated project has its own copy of the chapters', (await page.locator('.toc li').count()) === 5 && !page.url().includes(chapter1));

  // --- Mobile ---
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p1}/manuscript/${chapter1}`);
  await page.locator(text).waitFor();
  const box = await page.locator('.ms-center').boundingBox();
  check('mobile: editor uses the full width', box.width === 390 && !(await page.locator('.ms-nav').isVisible()) && !(await page.locator('.ms-panel').isVisible()));
  check('mobile: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('mobile-editor');
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  check('mobile: contents open as a drawer', (await page.locator('.ms-nav').isVisible()) && (await page.locator('.ms-backdrop').isVisible()));
  await shot('mobile-drawer');
  await page.locator('.toc a', { hasText: 'Chapter 2' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith(chapter1));
  await page.getByText('Second chapter').waitFor();
  check('mobile: picking a chapter closes the drawer', !(await page.locator('.ms-nav').isVisible()) && (await page.locator(text).innerText()).includes('Second chapter'));
  await page.locator(text).click();
  // Where a click lands depends on the platform's fonts; the words go at the end of the chapter, whatever the system.
  await page.locator(text).evaluate((el) => getSelection().collapse(el, el.childNodes.length));
  await page.keyboard.type(' More.');
  await saved();
  check('mobile: typing saves', (await page.locator(text).innerText()).includes('More.'));


  // Mobile organizer: details open as a sheet; "Location" moves without dragging
  await page.goto(`${BASE}/project/${p1}/organizer`);
  await row('Scene 1').click();
  await page.locator('dialog').getByLabel('Move Scene 1 to').selectOption({ label: 'Chapter 2' });
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Close' }).click();
  eq('mobile: move a scene with the Location picker', await outline(), ['Volume 1 [30]', '  The Gate [30]', 'Chapter 2 [11]', '  Scene 2 [6]', '  Scene 1 [0]']);
  check('mobile: organizer has no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`).join(' ; ')));
  await shot('mobile-organizer');

  // --- Phase 4: autosave, recovery, conflicts, history, backups ---
  await page.setViewportSize({ width: 1280, height: 800 });
  const p4 = await createProject('Safety Net');
  await page.goto(`${BASE}/project/${p4}/manuscript`);
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const safeUrl = page.url();
  const safeId = safeUrl.split('/').pop();
  const savedText = async () => JSON.stringify((await db('chapterContents', safeId))?.doc ?? null);
  const statusOf = async (pg) => (await pg.locator('.save-status').innerText()).trim();
  const typeAtEnd = async (pg, words) => {
    await pg.locator('.ms-scroll').click({ position: { x: 12, y: 500 } });
    await pg.locator(`${text}.ProseMirror-focused`).waitFor();
    await pg.keyboard.type(words);
  };
  const openTab = async () => {
    const tab = await context.newPage();
    await tab.goto(safeUrl);
    await tab.locator(text).waitFor();
    return tab;
  };

  await page.locator(text).click();
  await page.keyboard.type('First draft of the opening.');
  check('status shows "Unsaved changes" while typing', (await statusOf(page)) === 'Unsaved changes', await statusOf(page));
  await saved();
  check('status returns to "Saved"', (await statusOf(page)) === 'Saved');
  check('saved text is on disk with a revision number', (await db('chapterContents', safeId)).rev >= 1 && (await savedText()).includes('First draft of the opening.'));
  await page.goto(`${BASE}/project/${p4}`);

  // Crash mid-sentence: kill the tab before the save timer fires.
  const crash = async (words) => {
    const victim = await openTab();
    await typeAtEnd(victim, words);
    await victim.waitForTimeout(450);
    const cdp = await context.newCDPSession(victim);
    await Promise.race([cdp.send('Page.crash').catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
    await victim.close().catch(() => {});
  };
  await crash(' Lost words?');
  let tab = await openTab();
  check('the crash happened before the normal save', !(await savedText()).includes('Lost words?'));
  check('unsaved writing is recovered after a crash', (await tab.getByText('Unsaved writing was recovered').isVisible()) && (await tab.locator(text).innerText()).includes('First draft of the opening. Lost words?'));
  await tab.getByRole('button', { name: 'Keep it' }).click();
  await tab.locator('.save-status.saved').waitFor();
  await tab.reload();
  await tab.locator(text).waitFor();
  check('kept recovery is saved for good', (await tab.locator(text).innerText()).includes('Lost words?') && (await tab.getByText('Unsaved writing was recovered').count()) === 0 && (await savedText()).includes('Lost words?'));
  await tab.close();

  await crash(' Unwanted.');
  tab = await openTab();
  await tab.getByRole('button', { name: 'Discard it' }).click();
  await tab.getByText('Unsaved writing was recovered').waitFor({ state: 'detached' });
  check('discarding a recovery returns to the saved text', !(await tab.locator(text).innerText()).includes('Unwanted') && (await tab.locator(text).innerText()).includes('Lost words?'));
  await tab.close();

  // Closing a tab normally saves immediately (no recovery needed).
  tab = await openTab();
  await typeAtEnd(tab, ' Closed fast.');
  await tab.close({ runBeforeUnload: true }); // does not wait for the page to finish closing
  await page.waitForTimeout(500);
  tab = await openTab();
  check('closing the tab straight after typing loses nothing', (await tab.locator(text).innerText()).includes('Closed fast.'));
  if (await tab.getByRole('button', { name: 'Keep it' }).count()) await tab.getByRole('button', { name: 'Keep it' }).click();
  await tab.locator('.save-status.saved').waitFor();
  check('and it ends up saved', (await savedText()).includes('Closed fast.'));
  await tab.close();

  // Two tabs on the same chapter: the stale one must not overwrite the other.
  const tabA = await openTab();
  const tabB = await openTab();
  await typeAtEnd(tabA, ' From A.');
  await tabA.locator('.save-status.saved').waitFor();
  await typeAtEnd(tabB, ' From B.');
  await tabB.getByText('was changed in another tab or window').waitFor();
  check('stale tab is stopped from overwriting newer text', (await statusOf(tabB)) === 'Changed elsewhere' && (await savedText()).includes('From A.') && !(await savedText()).includes('From B.'));
  await tabB.getByRole('button', { name: "Keep what's here" }).click();
  await tabB.locator('.save-status.saved').waitFor();
  check('"Keep what\'s here" saves this tab\'s text', (await savedText()).includes('From B.') && !(await savedText()).includes('From A.'));
  if (!(await tabB.locator('.ms-panel').isVisible())) await tabB.getByRole('button', { name: 'Plan and reference' }).click();
  await tabB.getByRole('tab', { name: 'History' }).click();
  await tabB.getByText('Set aside in a conflict').waitFor();
  check('the overwritten version is kept in History', true);

  await typeAtEnd(tabA, ' A again.');
  await tabA.getByText('was changed in another tab or window').waitFor();
  await tabA.getByRole('button', { name: 'Load the other version' }).click();
  await tabA.getByText('was changed in another tab or window').waitFor({ state: 'detached' });
  check('"Load the other version" shows the newer text', (await tabA.locator(text).innerText()).includes('From B.') && !(await tabA.locator(text).innerText()).includes('A again.'));
  await tabB.getByText('My version, set aside for the other one').waitFor();
  check('and files this tab\'s text in History', true);
  await tabA.close();

  // Version history: name a version, rewrite, restore.
  await tabB.getByLabel('Version name').fill('Before rewrite');
  await tabB.getByRole('button', { name: 'Save version' }).click();
  await tabB.locator('.history-list', { hasText: 'Before rewrite' }).waitFor();
  await tabB.locator(text).click();
  await tabB.keyboard.press('ControlOrMeta+a');
  await tabB.keyboard.type('Completely rewritten.');
  await tabB.locator('.save-status.saved').waitFor();
  await tabB.locator('.history-list button', { hasText: 'Before rewrite' }).click();
  check('a version can be previewed', (await tabB.locator('.reference-doc').innerText()).includes('From B.'));
  await tabB.getByRole('button', { name: 'Restore this version' }).click();
  await tabB.locator(text, { hasText: 'From B.' }).waitFor();
  check('restoring a version brings the text back', !(await tabB.locator(text).innerText()).includes('Completely rewritten.') && (await savedText()).includes('From B.'));
  await tabB.locator('.history-list', { hasText: 'Replaced by a restore' }).waitFor();
  check('the replaced text stays in History, so a restore can be undone', true);
  check('word count follows the restore', (await tabB.locator('.ms-stats').innerText()).includes(`${(await db('chapters', safeId)).wordCount} words`));
  if (SHOTS) await tabB.screenshot({ path: `${SHOTS}/history.png` });
  const finalText = await tabB.locator(text).innerHTML();
  await tabB.close();

  // Manual backup file → restore as an independent project.
  await page.goto(`${BASE}/project/${p4}/settings`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()]);
  const backup = readFileSync(await download.path());
  check('backup is a standalone JSON file', download.suggestedFilename() === 'Safety-Net.novel.json' && JSON.parse(backup).format === 'novel-builder/project');
  check('backup includes version history but not crash drafts or the search index', 'chapterRevisions' in JSON.parse(backup).collections && !('chapterDrafts' in JSON.parse(backup).collections) && !('searchBlocks' in JSON.parse(backup).collections));
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByLabel(/to confirm/).fill('Safety Net');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await page.waitForURL(BASE + '/');
  check('project deleted', (await page.locator('.card', { hasText: 'Safety Net' }).count()) === 0);
  await page.locator('input[type=file]').setInputFiles({ name: 'Safety-Net.novel.json', mimeType: 'application/json', buffer: backup });
  await page.getByText('Imported "Safety Net"').waitFor();
  await page.locator('.card', { hasText: 'Safety Net' }).locator('.card-link').click();
  await page.getByRole('link', { name: 'Continue writing' }).click();
  await page.locator(text).waitFor();
  check('restoring a backup brings back the manuscript exactly', (await page.locator(text).innerHTML()) === finalText);
  await page.locator('input[type=file]').count();
  await page.goto(BASE);
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"something-else"}') });
  await page.getByText('Not a valid Novel Builder project file').waitFor();
  check('a bad backup file is rejected with a clear message', (await page.locator('.card', { hasText: 'Safety Net' }).count()) === 1);

  // --- Phase 5: codex ---
  const gateBeforeCodex = JSON.stringify(await db('chapterContents', chapter1));
  const codexUrl = `${BASE}/project/${p1}/codex`;
  await page.goto(codexUrl);
  await page.getByText('Build your world').waitFor();
  const field = (label) => page.locator('.codex-entry').getByLabel(label, { exact: true });
  const listed = () => page.$$eval('.entry-list strong', (els) => els.map((e) => e.textContent));
  const relatedNames = () => page.$$eval('.related .related-name', (els) => els.map((e) => e.textContent));
  const newEntry = async (kind, name) => {
    await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
    await page.locator('.codex-list .menu-items').getByText(kind, { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.entry-name input')?.value.startsWith('New '));
    await field('Name').fill(name);
    await field('Name').blur();
    await page.locator('.entry-list', { hasText: name }).waitFor();
  };
  // Characters are made in the Character Library, never in the Codex. Creates one there, fills in what is asked, and comes back to where the test was.
  const newCharacter = async (name, { summary = '', description = '', tags = '', fields = {}, stay = false, on = page } = {}) => {
    const back = on.url();
    const root = back.match(/^(.*\/project\/[\w-]+)/)[1];
    await on.goto(`${root}/characters`);
    await on.locator('.vault-library').getByRole('button', { name: /New Character|Create Character/ }).first().click();
    const dialog = on.getByRole('dialog').filter({ hasText: 'New character' });
    await dialog.getByLabel('Character name').fill(name);
    if (summary) await dialog.getByLabel('Summary').fill(summary);
    await dialog.getByRole('button', { name: 'Create character' }).click();
    await on.waitForURL(/\/characters\/[\w-]+$/);
    const id = on.url().split('/').pop();
    const profile = on.locator('.vault-profile');
    await profile.getByRole('heading', { name, exact: true }).waitFor();
    const identity = profile.getByRole('region', { name: 'Core Identity', exact: true });
    for (const [key, value] of Object.entries(fields)) {
      const opener = identity.getByRole('button', { name: 'Add a field to Core Identity' });
      if (await opener.count()) await opener.click();
      await identity.getByLabel('Name of a new field in Core Identity').fill(key);
      await identity.getByRole('button', { name: 'Add', exact: true }).click();
      const editing = identity.getByRole('group', { name: `Editing ${key}` });
      await identity.getByRole('button', { name: `Edit ${key}`, exact: true }).or(editing).first().waitFor();
      if (!(await editing.count())) await identity.getByRole('button', { name: `Edit ${key}`, exact: true }).click();
      await editing.getByLabel(key, { exact: true }).fill(value);
      await editing.getByRole('button', { name: 'Done' }).click();
      await editing.waitFor({ state: 'detached' });
    }
    if (tags) {
      const header = profile.getByRole('group', { name: 'Character', exact: true });
      await header.getByRole('button', { name: 'Edit profile' }).click();
      await header.getByLabel('Tags', { exact: true }).fill(tags);
      await header.getByLabel('Tags', { exact: true }).blur();
      await header.getByRole('button', { name: 'Done', exact: true }).click();
    }
    if (description) {
      await on.goto(`${root}/characters/${id}/details`);
      await profile.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
      await profile.getByRole('textbox', { name: 'Description', exact: true }).blur();
    }
    if (summary || tags || description || Object.keys(fields).length) await on.waitForTimeout(500);
    if (!stay) await on.goto(back);
    return id;
  };
  const openCharacter = async (name, tab = '') => {
    const root = page.url().match(/^(.*\/project\/[\w-]+)/)[1];
    await page.goto(`${root}/characters`);
    await page.locator('.vault-library').getByRole('link', { name: new RegExp(`^${name}`) }).first().click();
    await page.locator('.vault-profile').getByRole('heading', { name, exact: true }).waitFor();
    if (tab) await page.locator('.vault-profile').getByRole('link', { name: tab, exact: true }).click();
    return page.url().match(/characters\/([\w-]+)/)[1];
  };
  const deleteCharacter = async (name) => {
    await openCharacter(name);
    await page.locator(`.vault-profile summary[aria-label="More options for ${name}"]`).click();
    await page.locator('.vault-profile .vault-crumbs .menu-items').getByRole('button', { name: 'Delete…' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: `Delete ${name}` });
    await dialog.getByRole('textbox').fill(name);
    await dialog.getByRole('button', { name: 'Delete forever' }).click();
    await page.waitForURL(/\/characters$/);
  };
  const openEntry = async (name) => {
    await page.locator('.entry-list a', { hasText: name }).click();
    await page.waitForFunction((n) => document.querySelector('.entry-name input')?.value === n, name);
  };

  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  eq('the Codex is for the world: its categories do not include Character', (await page.locator('.codex-list .menu-items button').allInnerTexts()).slice(0, -1), ['Location', 'Faction / Species', 'Item / Artifact', 'Power System / Rule', 'Lore / History']);
  await page.keyboard.press('Escape');
  const mira5 = await newCharacter('Mira Vale', { summary: 'A runaway fire-mage.', description: 'Raised in the ash wastes.\n\n  Trusts no one.', tags: 'protagonist, mage', fields: { Appearance: 'Copper hair, burn scars', 'Power Rank': 'B+' } });
  await page.getByText('Build your world').waitFor();
  check('a character made in the Character Library is not listed in the Codex', (await listed()).length === 0 && (await page.locator('.codex-list .page-header .muted').innerText()) === '0 entries');

  await newEntry('Faction / Species', 'Ash Guild');
  await field('Tags (comma separated)').fill('mage');
  await field('Tags (comma separated)').blur();
  check('an entry cannot be turned into a character from the Codex', !(await field('Category').locator('option').allInnerTexts()).includes('Characters'));
  await field('Entry to link').selectOption({ label: 'Mira Vale' });
  await field('Relationship').fill('home of');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.locator('.related-name', { hasText: 'Mira Vale' }).waitFor();
  check('a character can still be linked from an entry, and the link opens their profile', (await page.locator('.related-name', { hasText: 'Mira Vale' }).getAttribute('href')) === `/project/${p1}/characters/${mira5}`);

  await newEntry('Item / Artifact', 'Emberfang');
  eq('a new entry shows its category\'s fields, ready to fill in', await page.locator('.typed-fields .field > span').allInnerTexts(), ['Type', 'Owner', 'Abilities']);
  await field('Short summary').fill('A fang-shaped dagger.');
  await field('Detailed description').fill('Forged in the ash wastes.\n\n  Cuts what it is told to.');
  await field('Abilities').fill('Burns on a word,\nnever dulls');
  await page.getByRole('button', { name: '+ Add field' }).click();
  await field('Field 1 name').fill('Grade');
  await field('Grade value').fill('B+');
  await field('Tags (comma separated)').fill('blade, mage');
  await field('Author notes (private)').fill('Lost in book 3?');
  await field('Author notes (private)').blur();
  await field('Entry to link').selectOption({ label: 'Mira Vale' });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.locator('.related-name', { hasText: 'Mira Vale' }).waitFor();
  await field('Entry to link').selectOption({ label: 'Ash Guild' });
  await field('Relationship').fill('forged by');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.locator('.related-name', { hasText: 'Ash Guild' }).click();
  await page.waitForFunction(() => document.querySelector('.entry-name input')?.value === 'Ash Guild');
  eq('links are bidirectional: the guild lists both the character and the item that linked to it', (await relatedNames()).sort(), ['Emberfang', 'Mira Vale']);
  check("each side sees the other's wording as a hint", (await field('Relationship to Emberfang').getAttribute('placeholder')) === 'They say: forged by');
  await field('Relationship to Emberfang').fill('forged');
  await field('Relationship to Emberfang').blur();
  await page.waitForTimeout(900);

  await page.reload();
  await openEntry('Emberfang');
  eq('entry fields, custom fields, tags and notes survive a restart', {
    summary: await field('Short summary').inputValue(),
    description: await field('Detailed description').inputValue(),
    abilities: await field('Abilities').inputValue(),
    grade: await field('Grade value').inputValue(),
    tags: await field('Tags (comma separated)').inputValue(),
    notes: await field('Author notes (private)').inputValue(),
    relationship: await field('Relationship to Ash Guild').inputValue(),
    related: (await relatedNames()).sort(),
  }, {
    summary: 'A fang-shaped dagger.',
    description: 'Forged in the ash wastes.\n\n  Cuts what it is told to.',
    abilities: 'Burns on a word,\nnever dulls',
    grade: 'B+',
    tags: 'blade, mage',
    notes: 'Lost in book 3?',
    relationship: 'forged by',
    related: ['Ash Guild', 'Mira Vale'],
  });
  await shot('codex');

  await page.getByLabel('Search the codex').fill('guild');
  eq('search by name', await listed(), ['Ash Guild']);
  await page.getByLabel('Search the codex').fill('b+');
  eq('search reaches custom field values', await listed(), ['Emberfang']);
  await page.getByLabel('Search the codex').fill('');
  await page.getByLabel('Filter by category').selectOption('item');
  eq('filter by category', await listed(), ['Emberfang']);
  await page.getByLabel('Filter by category').selectOption('all');
  await page.getByLabel('Filter by tag').selectOption('mage');
  eq('filter by tag: the character with the same tag is not a Codex entry', await listed(), ['Ash Guild', 'Emberfang']);
  await page.getByLabel('Filter by tag').selectOption('all');

  // Quick reference while writing
  await page.goto(`${BASE}/project/${p1}/manuscript/${chapter1}`);
  await page.locator(text).waitFor();
  const manuscriptBefore = await page.locator(text).innerHTML();
  if (!(await page.locator('.ms-panel').isVisible())) await page.getByRole('button', { name: 'Plan and reference' }).click();
  await page.getByRole('tab', { name: 'Codex' }).click();
  await page.locator('.ms-panel').getByLabel('Search the codex').fill('mira');
  await page.locator('.quick-list button', { hasText: 'Mira Vale' }).click();
  const quick = await page.locator('.quick-entry').innerText();
  check('codex entry opens beside the editor', quick.includes('A runaway fire-mage.') && quick.includes('Copper hair') && quick.includes('B+') && quick.includes('Ash Guild') && quick.includes('Emberfang'), quick);
  await shot('editor-codex');
  await page.locator('.quick-list button', { hasText: 'Ash Guild' }).click();
  check('related entries can be followed in the panel', (await page.locator('.quick-entry').innerText()).includes('Mira Vale'));
  check('the panel offers no way to insert text into the manuscript', (await page.locator('.ms-panel button, .ms-panel a').allInnerTexts()).every((t) => !/insert|add to|paste/i.test(t)));
  check('looking things up leaves the manuscript untouched', (await page.locator(text).innerHTML()) === manuscriptBefore && (await statusOf(page)) === 'Saved');

  // Deleting an entry removes its links, nothing else
  await page.goto(codexUrl);
  await openEntry('Ash Guild');
  await page.getByRole('button', { name: 'Delete entry…' }).click();
  check('delete names what will go', (await page.locator('dialog').innerText()).includes('its 2 links'));
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.locator('.entry-list a', { hasText: 'Ash Guild' }).waitFor({ state: 'detached' });
  await openEntry('Emberfang');
  eq('deleting an entry drops only its links', await relatedNames(), ['Mira Vale']);
  check('the entry it was linked to is intact', (await field('Grade value').inputValue()) === 'B+' && (await field('Tags (comma separated)').inputValue()) === 'blade, mage');
  await page.getByRole('button', { name: 'Remove field Grade' }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await openEntry('Emberfang');
  check('a removed custom field stays removed, and the rest is untouched', (await field('Grade value').count()) === 0 && (await field('Abilities').inputValue()) === 'Burns on a word,\nnever dulls' && (await relatedNames()).join() === 'Mira Vale');
  await page.goto(`${codexUrl}/${mira5}`);
  await page.waitForURL(new RegExp(`/characters/${mira5}$`));
  await page.locator('.vault-profile').getByRole('heading', { name: 'Mira Vale', exact: true }).waitFor();
  check('an old Codex address for a character opens their profile, with what was written there', (await page.locator('.vault-profile .vault-summary').innerText()) === 'A runaway fire-mage.');
  check('no codex action changed any manuscript text', JSON.stringify(await db('chapterContents', chapter1)) === gateBeforeCodex);

  const p5 = await createProject('Empty World');
  await page.goto(`${BASE}/project/${p5}/codex`);
  await page.getByText('Build your world').waitFor();
  check("another project's codex is empty", (await listed()).length === 0);
  await page.goto(`${BASE}/project/${p5}/codex/${(await page.evaluate(() => 0), 'x')}`);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(codexUrl);
  await page.locator('.entry-list a', { hasText: 'Emberfang' }).click();
  await page.locator('.codex-back').waitFor();
  check('mobile: entry opens full-width with a way back', !(await page.locator('.codex-list').isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-codex');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 6: project-wide search ---
  const dlg = page.locator('.search-dialog');
  const searchBox = dlg.getByLabel('Search this project');
  const groupNames = () => dlg.locator('.search-group > h3').evaluateAll((els) => els.map((e) => e.firstChild.textContent));
  const titlesIn = (group) => dlg.locator(`.search-group[aria-label="${group}"] .search-entity strong`).allInnerTexts();
  const searchFor = async (words) => {
    await searchBox.fill(words);
    await dlg.getByRole('status').filter({ hasText: /match|^$/ }).waitFor();
    await page.waitForTimeout(250); // debounce
  };
  const gateDoc = JSON.stringify(await db('chapterContents', chapter1));

  await page.goto(`${BASE}/project/${p1}`);
  await page.locator('h1', { hasText: 'Ashfall' }).waitFor();
  await page.keyboard.press('ControlOrMeta+k');
  await dlg.waitFor();
  check('Ctrl/Cmd+K opens search from anywhere in the project', await searchBox.evaluate((el) => el === document.activeElement));
  await searchFor('gate');
  eq('one query searches manuscript and notes together, in groups', await groupNames(), ['Manuscript', 'Notes & summaries']);
  eq('manuscript group lists the chapter (title) and the scene (text)', (await titlesIn('Manuscript')).sort(), ['Scene 2', 'The Gate']);
  check('every highlighted fragment is the search term', (await dlg.locator('mark').allInnerTexts()).every((t) => /^gate$/i.test(t)) && (await dlg.locator('mark').count()) >= 3);
  check('text matches show the term inside its sentence', (await dlg.locator('.search-snippet', { hasText: 'Rain fell on the' }).innerText()).includes('black gate.'));
  await shot('search');

  await dlg.getByRole('button', { name: 'Notes', exact: true }).click();
  eq('scope: notes only', await groupNames(), ['Notes & summaries']);
  await dlg.getByRole('button', { name: 'Manuscript', exact: true }).click();
  eq('scope: manuscript only', await groupNames(), ['Manuscript']);
  await dlg.getByRole('button', { name: 'Codex', exact: true }).click();
  check('scope: codex only (no lore mentions a gate)', (await dlg.locator('.search-empty').innerText()).includes('Nothing matches “gate” in codex'));
  await dlg.getByRole('button', { name: 'Everything' }).click();

  await searchFor('mira');
  eq('characters and the notes that mention them appear side by side', await groupNames(), ['Characters', 'Notes & summaries']);
  await searchFor('copper');
  check('custom attributes are searchable and labelled', (await dlg.locator('.search-snippet').innerText()).replace(/\s+/g, ' ').includes('Appearance Appearance: Copper hair'));
  await dlg.locator('.search-snippet').click();
  // A character opens in their profile (a later feature); it is the same record the Codex shows.
  await page.locator('.vault-header h1', { hasText: 'Mira Vale' }).waitFor();
  check('clicking a result for a character opens that character', /\/characters\/[\w-]+$/.test(page.url()) && !(await dlg.isVisible()));

  // Jump to the exact paragraph in the manuscript
  await page.getByRole('button', { name: 'Search project…' }).click();
  await searchFor('four-space');
  await dlg.locator('.search-snippet', { hasText: 'four-space' }).click();
  await page.locator('.find-current').waitFor();
  const landed = await page.evaluate(() => {
    const hit = document.querySelector('.find-current');
    const box = hit.getBoundingClientRect();
    return { url: location.pathname.split('/').pop(), hit: hit.textContent, paragraph: hit.closest('p').textContent, visible: box.top >= 0 && box.bottom <= innerHeight, find: document.querySelector('.find-bar input').value };
  });
  eq('clicking a manuscript match opens the chapter at that paragraph, highlighted', landed, { url: chapter1, hit: 'four-space', paragraph: '    four-space indent', visible: true, find: 'four-space' });
  check('jumping changes nothing in the text', JSON.stringify(await db('chapterContents', chapter1)) === gateDoc && (await statusOf(page)) === 'Saved');
  await shot('search-jump');

  // Notes result → the notes panel of that scene; arrow keys + Enter work
  await page.keyboard.press('ControlOrMeta+k');
  await searchFor('foreshadow');
  eq('private notes are found under Notes', await groupNames(), ['Notes & summaries']);
  await searchBox.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check('arrow keys move through results', await page.evaluate(() => document.activeElement.classList.contains('search-snippet')));
  await page.keyboard.press('Enter');
  await page.getByLabel('Private notes').waitFor();
  check('a notes result opens the scene with its notes showing', (await page.getByLabel('Private notes').inputValue()) === 'Foreshadow the key.' && (await page.getByLabel('Title', { exact: true }).inputValue()) === 'Scene 2');

  // New writing is searchable straight away
  await typeAtEnd(page, ' Quillon arrives.');
  await saved();
  await page.keyboard.press('ControlOrMeta+k');
  await searchFor('quillon');
  eq('text typed a moment ago is found', await titlesIn('Manuscript'), ['Scene 2']);
  const timing = await dlg.getByRole('status').innerText();
  check('search reports its speed', /^1 match · (<1|\d+) ms$/.test(timing), timing);
  await searchFor('volume 1');
  await dlg.locator('.search-entity', { hasText: 'Volume 1' }).click();
  await page.locator('.outline-row.selected', { hasText: 'Volume 1' }).waitFor();
  check('a volume result opens the organizer with it selected', page.url().endsWith('/organizer'));

  // Typing quickly never searches per keystroke
  await page.keyboard.press('ControlOrMeta+k');
  await searchBox.pressSequentially('second chapter', { delay: 15 });
  await page.waitForTimeout(300);
  eq('multi-word query', await titlesIn('Manuscript'), ['Chapter 2']);
  await page.keyboard.press('Escape');
  check('Escape closes search', !(await dlg.isVisible()));

  // Isolation
  await page.goto(`${BASE}/project/${p5}`);
  await page.locator('.search-open').waitFor(); // the shortcut is only listening once the workspace has loaded
  await page.keyboard.press('ControlOrMeta+k');
  await searchFor('gate');
  check("another project's search finds nothing from this one", (await dlg.locator('.search-empty').innerText()).includes('Nothing matches'));
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p1}`);
  await page.locator('.app-bar').getByRole('button', { name: 'Search project' }).click();
  await searchFor('gate');
  const size = await dlg.boundingBox();
  check('mobile: search is full-screen and fits', size.width === 390 && size.height === 780 && (await dlg.evaluate((el) => el.querySelector('.search-results').scrollWidth <= 390)));
  await shot('mobile-search');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 7: planning workspace ---
  const scene2Doc = JSON.stringify(await db('chapterContents', scene2));
  const scene2Url = `${BASE}/project/${p1}/manuscript/${scene2}`;
  const openPlan = async () => {
    await page.goto(scene2Url);
    await page.locator(text).waitFor();
    if (!(await page.locator('.ms-panel').isVisible())) await page.getByRole('button', { name: 'Plan and reference' }).click();
    await page.getByRole('tab', { name: 'Plan' }).click();
    await plan.getByLabel('Objective').waitFor();
  };
  const plan = page.locator('.ms-panel');
  const beats = () => plan.locator('.beats textarea').evaluateAll((els) => els.map((e) => e.value));
  await openPlan();
  const proseBefore = await page.locator(text).innerHTML();
  eq('status picker shows the seven-step pipeline', await plan.getByRole('radio').allInnerTexts(), ['Idea', 'Planned', 'Drafting', 'Draft Complete', 'Revising', 'Final', 'Published']);
  check('an old "Editing" status was carried over as "Revising"', (await plan.getByRole('radio', { name: 'Revising' }).getAttribute('aria-checked')) === 'true');
  await plan.getByRole('radio', { name: 'Drafting', exact: true }).click();
  await page.locator('.toc li.active .status-dot.status-drafting').waitFor();
  check('changing status updates the contents tree at once', (await plan.getByRole('radio', { name: 'Drafting', exact: true }).getAttribute('aria-checked')) === 'true');

  await plan.getByLabel('Objective').fill('Get Mira to the gate before nightfall.');
  await plan.getByRole('button', { name: '+ Add beat' }).click();
  await page.keyboard.type('Storm breaks');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Gate is sealed');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The key hums');
  eq('beats are added in sequence with Enter', await beats(), ['Storm breaks', 'Gate is sealed', 'The key hums']);
  await plan.getByRole('button', { name: 'Move beat 3 up' }).click();
  await plan.getByLabel('Add an entity').selectOption({ label: 'Mira Vale' });
  await plan.locator('.entity-chips', { hasText: 'Mira Vale' }).waitFor();
  await plan.getByLabel('Add an entity').selectOption({ label: 'Emberfang' });
  await plan.getByLabel('Main conflict').fill('The gatekeeper demands a toll.');
  await plan.getByLabel('Emotional arc').fill('Dread to defiance');
  await plan.getByLabel('Open questions').fill('Who sealed it?');
  await plan.getByLabel('Ending target').fill('The gate opens from inside.');
  await plan.getByLabel('Ending target').blur();
  await page.waitForTimeout(900);
  check('filling in the plan leaves the manuscript untouched', (await page.locator(text).innerHTML()) === proseBefore && JSON.stringify(await db('chapterContents', scene2)) === scene2Doc && (await statusOf(page)) === 'Saved');
  check('the plan is stored apart from the text', (await db('chapterPlans', scene2)).objective === 'Get Mira to the gate before nightfall.' && !JSON.stringify(await db('chapterContents', scene2)).includes('nightfall'));
  await shot('plan-panel');

  await openPlan();
  eq('the whole plan survives a restart', {
    status: await plan.getByRole('radio', { name: 'Drafting', exact: true }).getAttribute('aria-checked'),
    objective: await plan.getByLabel('Objective').inputValue(),
    summary: await plan.getByLabel('Summary').inputValue(),
    beats: await beats(),
    entities: await plan.locator('.entity-chips .chip-name').allInnerTexts(),
    conflict: await plan.getByLabel('Main conflict').inputValue(),
    arc: await plan.getByLabel('Emotional arc').inputValue(),
    questions: await plan.getByLabel('Open questions').inputValue(),
    ending: await plan.getByLabel('Ending target').inputValue(),
    notes: await plan.getByLabel('Private notes').inputValue(),
  }, {
    status: 'true',
    objective: 'Get Mira to the gate before nightfall.',
    summary: 'Mira reaches the gate in the rain.',
    beats: ['Storm breaks', 'The key hums', 'Gate is sealed'],
    entities: ['Mira Vale', 'Emberfang'],
    conflict: 'The gatekeeper demands a toll.',
    arc: 'Dread to defiance',
    questions: 'Who sealed it?',
    ending: 'The gate opens from inside.',
    notes: 'Foreshadow the key.',
  });
  check('plan and manuscript are visible side by side', (await page.locator(text).isVisible()) && (await plan.getByLabel('Objective').isVisible()));
  check('the plan offers no way to insert itself into the text', (await plan.locator('button, a').allInnerTexts()).every((t) => !/insert|add to manuscript|paste|send to/i.test(t)));
  await plan.locator('.chip-name', { hasText: 'Mira Vale' }).click();
  check('an attached character opens in the Codex tab', (await page.locator('.quick-entry').innerText()).includes('A runaway fire-mage.'));

  // Writing while a plan exists changes only the text
  await typeAtEnd(page, ' Thunder.');
  await saved();
  check('writing does not alter the plan', (await db('chapterPlans', scene2)).beats.length === 3 && (await db('chapterPlans', scene2)).ending === 'The gate opens from inside.');

  // Organizer: pipeline counts, filter, and the same plan in the details panel
  await page.goto(`${BASE}/project/${p1}/organizer`);
  await row('Scene 2').waitFor();
  const pipeline = () => page.locator('.pipeline button[class*="status-"]').evaluateAll((els) => els.map((e) => e.textContent.trim()).filter((t) => !t.startsWith('0')));
  eq('organizer counts chapters and scenes at each stage', await pipeline(), ['2 Idea', '1 Drafting', '1 Published']);
  await page.locator('.pipeline button', { hasText: 'Drafting' }).click();
  eq('filtering by status shows matching scenes with the path to them', await page.locator('.outline-row strong').allInnerTexts(), ['Chapter 2', 'Scene 2']);
  await row('Scene 2').click();
  check('the same plan opens in the organizer', (await page.locator('.organizer-details').getByLabel('Objective').inputValue()) === 'Get Mira to the gate before nightfall.' && (await page.locator('.organizer-details .beats textarea').count()) === 3);
  await shot('organizer-plan');
  await page.getByRole('button', { name: 'Show all' }).click();
  await row('The Gate').getByLabel('Status of The Gate').selectOption('final');
  await page.locator('.pipeline button', { hasText: '1 Final' }).waitFor();
  eq('a status change moves the item along the pipeline', await pipeline(), ['2 Idea', '1 Drafting', '1 Final']);

  // Plan text is searchable and leads back to the plan
  await page.keyboard.press('ControlOrMeta+k');
  await searchFor('nightfall');
  eq('planning text is found under Notes, not Manuscript', await groupNames(), ['Notes & summaries']);
  await dlg.locator('.search-snippet', { hasText: 'nightfall' }).click();
  await plan.getByLabel('Objective').waitFor();
  check('and the result opens the scene with its plan showing', page.url() === scene2Url && (await page.locator('.toc li', { hasText: 'The Gate' }).first().locator('.status-dot.status-final').count()) === 1);

  // Removing a codex entry detaches it from the plan and nothing else
  await deleteCharacter('Mira Vale');
  await openPlan();
  eq('a deleted character drops off the plan; the rest is intact', { entities: await plan.locator('.entity-chips .chip-name').allInnerTexts(), objective: await plan.getByLabel('Objective').inputValue(), beats: (await beats()).length }, { entities: ['Emberfang'], objective: 'Get Mira to the gate before nightfall.', beats: 3 });

  await page.setViewportSize({ width: 390, height: 780 });
  await openPlan();
  check('mobile: the plan opens as a drawer over the editor and fits', (await plan.isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await plan.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)));
  await shot('mobile-plan');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 8: goals & progress ---
  const dbAll = async (table) => (await page.evaluate((t) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(t).objectStore(t).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result); };
    };
  }), table)).filter((r) => r.projectId === p1);
  const fmt = (n) => n.toLocaleString('en-US');
  const tile = (label) => page.locator('.progress .tile', { has: page.locator('span:first-child', { hasText: new RegExp(`^${label}$`) }) });
  const progressUrl = `${BASE}/project/${p1}/progress`;
  const totalWords = async () => (await dbAll('chapters')).reduce((n, x) => n + x.wordCount, 0);

  await page.goto(progressUrl);
  await page.locator('.health').waitFor();
  let total = await totalWords();
  const logged = await dbAll('writingSessions');
  check('every word in the manuscript is accounted for in the session log', logged.reduce((n, x) => n + x.netWords, 0) === total && logged.length >= 1, `${logged.reduce((n, x) => n + x.netWords, 0)} vs ${total}`);
  eq('health summary', await page.locator('.health').innerText(), `${fmt(total)} words • 1 / 2 chapters complete • ${fmt(total)} words this week`);
  check('today, this week and this month match the log', [await tile('Today').innerText(), await tile('This week').innerText(), await tile('This month').innerText()].every((t) => t.includes(`+${fmt(total)}`)));
  eq('structural metrics', [await tile('Chapters complete').locator('strong').innerText(), await tile('Scenes complete').locator('strong').innerText(), await tile('Average chapter').locator('strong').innerText(), await tile('Writing sessions').locator('strong').innerText()], ['1 / 2', '0 / 2', fmt(Math.round(total / 2)), String(logged.length)]);
  check('days written is counted, with no streak pressure', (await tile('Days written').innerText()).replace(/\s+/g, ' ').includes('1 of the last 30'));

  // Charts
  check('two trend charts with the current period highlighted', (await page.locator('.chart').count()) === 2 && (await page.locator('.chart .column.current').count()) === 2);
  const todayColumn = page.locator('.chart').nth(1).locator('.chart-col').last();
  await todayColumn.hover();
  check('hovering a bar shows its value', (await todayColumn.locator('.chart-tip').innerText()).includes(`${fmt(total)} words`) && (await todayColumn.locator('.chart-tip').isVisible()));
  await page.locator('.chart').nth(1).getByText('Show as table').click();
  check('each chart has a table view', (await page.locator('.chart').nth(1).locator('tbody tr').count()) === 14 && (await page.locator('.chart').nth(1).locator('tbody tr').last().innerText()).includes(fmt(total)));

  // Word targets
  await page.getByRole('spinbutton', { name: 'Words per day' }).fill('100');
  await page.getByRole('spinbutton', { name: 'Words per day' }).blur();
  await tile('Today').getByRole('progressbar').waitFor();
  check('daily target shows progress', (await tile('Today').innerText()).includes(total >= 100 ? 'Target reached' : `${total}% of 100`), await tile('Today').innerText());
  await page.getByRole('spinbutton', { name: 'Words per week' }).fill('5000');
  await page.getByRole('spinbutton', { name: 'Words per week' }).blur();
  await tile('This week').getByRole('progressbar').waitFor();
  check('weekly target shows progress', (await tile('This week').innerText()).includes(`${Math.round(total / 50)}% of 5,000`), await tile('This week').innerText());

  // Deadline for one part of the book
  const due = new Date();
  due.setDate(due.getDate() + 10);
  const dueKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Deadline name').fill('Finish Volume 1');
  await page.getByLabel('Deadline word target').fill('300');
  await page.getByLabel('Deadline covers').selectOption({ label: 'Volume 1' });
  await page.getByLabel('Deadline date').fill(dueKey);
  await page.getByRole('button', { name: 'Add deadline' }).click();
  const deadline = page.locator('.goal', { hasText: 'Finish Volume 1' });
  await deadline.waitFor();
  check('a deadline tracks its own part of the manuscript and the pace to reach it', (await deadline.innerText()).replace(/\s+/g, ' ').includes('30 / 300 words · 10 days to go · about 27 a day gets there') && (await deadline.innerText()).includes('Volume 1'), await deadline.innerText());

  // Tasks
  await page.getByLabel('Task name').fill('Complete magic system lore');
  await page.getByLabel('Task type').selectOption('worldbuilding');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByLabel('Task name').fill('Throwaway');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.locator('.goal', { hasText: 'Throwaway' }).waitFor();
  await page.getByLabel('Complete magic system lore done').click(); // saved, then reflected
  await page.getByText('1 of 2 done').waitFor();
  await page.getByRole('button', { name: 'Edit Complete magic system lore' }).click();
  await page.locator('.goal .goal-form').getByLabel('Task name').fill('Finish the magic system');
  await page.locator('.goal .goal-form').getByLabel('Task type').selectOption('editing');
  await page.locator('.goal .goal-form').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Delete Throwaway' }).click();
  await page.locator('.goal', { hasText: 'Throwaway' }).waitFor({ state: 'detached' });
  await page.reload();
  await page.locator('.health').waitFor();
  const task = page.locator('.goal', { hasText: 'Finish the magic system' });
  check('tasks can be added, checked off, edited and deleted, and persist', (await task.getByRole('checkbox').isChecked()) && (await task.innerText()).includes('Editing') && (await page.getByText('1 of 1 done').isVisible()) && (await page.getByRole('spinbutton', { name: 'Words per day' }).inputValue()) === '100' && (await page.locator('.goal', { hasText: 'Finish Volume 1' }).count()) === 1);
  await task.getByRole('checkbox').click();
  await page.getByText('0 of 1 done').waitFor();
  check('a task can be un-checked', true);
  await shot('progress');

  // Manuscript target → completion percentage
  await page.goto(`${BASE}/project/${p1}/settings`);
  await page.getByLabel('Target word count').fill('1000');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Changes saved.').waitFor();

  // Writing updates the numbers
  await page.goto(scene2Url);
  await page.locator(text).waitFor();
  await typeAtEnd(page, ' Five more words right here.');
  await saved();
  total += 5;
  check('the editor footer shows today\'s words', (await page.locator('.ms-stats').innerText()).replace(/\s+/g, ' ').includes(`Today +${fmt(total)}`), await page.locator('.ms-stats').innerText());
  await page.goto(progressUrl);
  await page.locator('.health').waitFor();
  eq('dashboard follows new writing and the manuscript target', await page.locator('.health').innerText(), `${fmt(total)} / 1,000 words • ${Math.round(total / 10)}% complete • 1 / 2 chapters complete • ${fmt(total)} words this week`);
  check('recent sessions are listed', (await page.locator('.sessions tbody tr').count()) >= 1 && (await page.locator('.sessions tbody').innerText()).includes('+'));
  const wording = await page.locator('.progress').innerText();
  check('wording is neutral: no penalties, warnings or streak-loss language', !/missed|fail|behind|lost|lose|broke|penalt|lazy|shame|overdue|warning|streak/i.test(wording), wording.match(/missed|fail|behind|lost|lose|broke|penalt|lazy|shame|overdue|warning|streak/i)?.[0]);

  await page.goto(`${BASE}/project/${p5}/progress`);
  await page.locator('.health').waitFor();
  check("another project's progress is its own", (await page.locator('.health').innerText()).startsWith('0 words') && (await page.getByText('Sessions are logged automatically').isVisible()) && (await page.locator('.goal').count()) === 0);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(progressUrl);
  await page.locator('.health').waitFor();
  check('mobile: dashboard fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('mobile-progress');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 9: versions, comparison and alternate drafts ---
  const p9 = await createProject('Rewrites');
  await page.goto(`${BASE}/project/${p9}/manuscript`);
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const n9 = page.url().split('/').pop();
  const row9 = async (table) => page.evaluate(([t, key]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(t).objectStore(t).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((r) => r.nodeId === key || r.id === key)); };
    };
  }), [table, n9]);
  const writeAll = async (...lines) => {
    await page.locator(text).click();
    await page.keyboard.press('ControlOrMeta+a');
    for (const [i, line] of lines.entries()) {
      if (i) await page.keyboard.press('Enter');
      await page.keyboard.type(line);
    }
    await saved();
  };
  const cmp = page.locator('.compare-dialog');
  const hist = page.locator('.ms-panel');
  const draftsShown = async () => ({ active: await hist.locator('.draft-list li.active strong').innerText(), others: await hist.locator('.draft-list li:not(.active) strong').allInnerTexts() });
  const draftMenu = async (name, item) => {
    await hist.getByLabel(`Actions for ${name}`).click();
    await hist.locator('.draft-list .menu-items').getByRole('button', { name: item }).click();
  };

  await writeAll('The road ended at a wall.', 'Mira touched the gate.', 'Nobody answered.');
  if (!(await hist.isVisible())) await page.getByRole('button', { name: 'Plan and reference' }).click();
  await page.getByRole('tab', { name: 'History' }).click();
  await hist.getByLabel('Version name').fill('Original First Draft');
  await hist.getByRole('button', { name: 'Save version' }).click();
  await hist.locator('.history-list', { hasText: 'Original First Draft' }).waitFor();
  await writeAll('The road ended at a wall.', 'A crow watched.', 'Mira touched the cold gate twice.');

  // Compare a named snapshot with the current text
  await hist.getByRole('button', { name: 'Compare Original First Draft with current' }).click();
  await cmp.locator('ins').first().waitFor();
  const statsText = async () => (await cmp.locator('.compare-stats').innerText()).replace(/\s+/g, ' ');
  check('comparison reports word and character changes', (await statsText()).includes('12 → 15 words (+3)') && (await statsText()).includes('63 → 73 characters (+10)') && (await statsText()).includes('5 added · 2 removed') && (await statsText()).includes('3 paragraphs changed'), await statsText());
  eq('added text is marked', (await cmp.locator('.compare-body ins').allInnerTexts()).map((t) => t.trim()), ['A crow watched.', 'cold', 'twice']);
  eq('removed text is marked', (await cmp.locator('.compare-body del').allInnerTexts()).map((t) => t.trim()), ['Nobody answered.']);
  eq('each changed paragraph says what happened to it', await cmp.locator('.diff-tag').allInnerTexts(), ['ADDED', 'EDITED', 'REMOVED']);
  const marks = await cmp.evaluate((el) => {
    const ins = getComputedStyle(el.querySelector('.compare-body ins'));
    const del = getComputedStyle(el.querySelector('.compare-body del'));
    const [r, g, b] = ins.backgroundColor.match(/\d+/g).map(Number);
    const [r2, g2] = del.backgroundColor.match(/\d+/g).map(Number);
    return { addedIsGreen: g > r && g > b, addedUnderlined: ins.textDecorationLine.includes('underline'), removedIsRed: r2 > g2, removedStruck: del.textDecorationLine.includes('line-through') };
  });
  eq('additions are green and underlined, removals red and struck through', marks, { addedIsGreen: true, addedUnderlined: true, removedIsRed: true, removedStruck: true });
  check('the unchanged paragraph is shown for context', (await cmp.locator('.compare-body p').first().innerText()) === 'The road ended at a wall.');
  await shot('compare');
  await cmp.getByRole('button', { name: 'Swap sides' }).click();
  await cmp.locator('.compare-stats', { hasText: '15 → 12 words' }).waitFor();
  check('any two versions can be compared in either direction', (await statsText()).includes('(−3)') && (await statsText()).includes('2 added · 5 removed'));
  await cmp.getByLabel('Newer version').selectOption({ index: 0 });
  await cmp.getByLabel('Older version').selectOption({ index: 0 });
  await cmp.getByText('These two versions have the same text.').waitFor();
  check('identical versions are reported as identical', true);
  await cmp.getByRole('button', { name: 'Close' }).click();
  check('comparing changes nothing', (await paragraphs()).join('|') === 'The road ended at a wall.|A crow watched.|Mira touched the cold gate twice.' && (await statusOf(page)) === 'Saved');

  // Restore keeps the text it replaces as a named version
  await hist.locator('.history-list li', { hasText: 'Original First Draft' }).locator('button').first().click();
  await hist.getByRole('button', { name: 'Restore this version' }).click();
  await page.locator(text, { hasText: 'Nobody answered.' }).waitFor();
  eq('restore brings the old text back', await paragraphs(), ['The road ended at a wall.', 'Mira touched the gate.', 'Nobody answered.']);
  const safety = hist.locator('.history-list li', { hasText: 'Before restoring the version from' });
  await safety.waitFor();
  await safety.locator('button').first().click();
  check('the replaced text was saved as its own named version first', (await hist.locator('.reference-doc').innerText()).includes('A crow watched.'));
  await hist.getByRole('button', { name: '← All versions' }).click();

  // Alternate drafts
  eq('a chapter starts with one draft', await draftsShown(), { active: 'Main draft', others: [] });
  await hist.getByLabel('New draft name').fill('Alternate Ending A');
  await hist.getByRole('button', { name: 'Create draft' }).click();
  await hist.locator('.draft-list li.active', { hasText: 'Alternate Ending A' }).waitFor();
  eq('creating a draft sets the current text aside under its own name', await draftsShown(), { active: 'Alternate Ending A', others: ['Main draft'] });
  check('the editor shows which draft is open, starting from a copy', (await page.locator('.draft-tag').innerText()) === 'Draft: Alternate Ending A' && (await paragraphs()).join('|').endsWith('Nobody answered.'));
  await page.locator(text).waitFor();
  await typeAtEnd(page, ' Then the wall fell.');
  await saved();
  check('project totals count the draft in the manuscript', (await row9('chapters'))[0].wordCount === 16, String((await row9('chapters'))[0].wordCount));

  await draftMenu('Main draft', 'Compare with current');
  await cmp.locator('ins').first().waitFor();
  check('drafts can be compared with each other', (await cmp.locator('.compare-body ins').innerText()).trim() === 'Then the wall fell.' && (await statsText()).includes('12 → 16 words (+4)'), await statsText());
  await cmp.getByRole('button', { name: 'Close' }).click();

  await draftMenu('Main draft', 'Use in manuscript');
  await hist.locator('.draft-list li.active', { hasText: 'Main draft' }).waitFor();
  await page.locator('.draft-tag', { hasText: 'Main draft' }).waitFor();
  eq('switching puts the other draft in the manuscript', { ...(await draftsShown()), text: (await paragraphs()).at(-1) }, { active: 'Main draft', others: ['Alternate Ending A'], text: 'Nobody answered.' });
  const set = await row9('chapterBranches');
  check('the draft that was swapped out is kept whole', set.length === 1 && set[0].name === 'Alternate Ending A' && JSON.stringify(set[0].doc).includes('Then the wall fell.') && set[0].wordCount === 16);
  check('word counts follow the active draft', (await row9('chapters'))[0].wordCount === 12 && (await page.locator('.ms-stats').innerText()).includes('12 words'));
  await draftMenu('Alternate Ending A', 'Use in manuscript');
  await page.locator(text, { hasText: 'Then the wall fell.' }).waitFor();
  check('and switching back restores it exactly', (await paragraphs()).at(-1) === 'Nobody answered. Then the wall fell.' && (await row9('chapters'))[0].wordCount === 16);

  await hist.getByRole('button', { name: 'Rename Alternate Ending A' }).click();
  await hist.getByLabel('Draft name', { exact: true }).fill('Bleak ending');
  await hist.getByRole('button', { name: 'Rename', exact: true }).click();
  await hist.locator('.draft-list li.active', { hasText: 'Bleak ending' }).waitFor();
  await draftMenu('Main draft', 'Delete…');
  check('deleting a draft asks first and names it', (await page.locator('dialog[open]').last().innerText()).includes('Delete the draft Main draft (12 words)?'));
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await hist.locator('.draft-list li:not(.active)').waitFor({ state: 'detached' });
  eq('drafts can be renamed and deleted; the manuscript text is untouched', { ...(await draftsShown()), text: (await paragraphs()).at(-1) }, { active: 'Bleak ending', others: [], text: 'Nobody answered. Then the wall fell.' });
  check('versions show which draft they came from', (await hist.locator('.history-list').innerText()).includes('Main draft'));
  await shot('drafts');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.reload();
  await page.locator(text).waitFor();
  await page.getByRole('button', { name: 'Plan and reference' }).click();
  // The phone keeps its own panel state: the tab chosen on the desktop is not imposed on it.
  await page.locator('.ms-panel').getByRole('tab', { name: 'History' }).click();
  await hist.getByRole('button', { name: 'Compare Original First Draft with current' }).click();
  await cmp.locator('ins').first().waitFor();
  const cmpBox = await cmp.boundingBox();
  check('mobile: comparison is full-screen and fits', cmpBox.width === 390 && (await cmp.evaluate((el) => el.querySelector('.compare-body').scrollWidth <= 390)));
  await shot('mobile-compare');
  await cmp.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 10: import, export and data ownership ---
  const p10 = await createProject('Portable');
  const exportUrl = `${BASE}/project/${p10}/export`;
  await page.goto(exportUrl);
  const importFile = async (name, content) => {
    await page.getByLabel('Manuscript file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
  };
  const found = () => page.locator('dialog[open] [role=status]').first().innerText();
  const tree10 = async () => {
    await page.goto(`${BASE}/project/${p10}/organizer`);
    await page.locator('.outline-row').first().waitFor();
    return page.$$eval('.outline-row', (els) => els.map((e) => `${'  '.repeat(Number(e.style.getPropertyValue('--depth')))}${e.querySelector('.kind').textContent}: ${e.querySelector('strong').textContent} [${e.querySelector('.outline-words').textContent}]`));
  };

  // Import a plain-text manuscript
  await importFile('story.txt', 'PART ONE\nChapter 1\nThe road ended.\n***\nMira waited.\nChapter 2: The Gate\n\tIndented  line.\n\nPart Two\nEpilogue\nDone.\n');
  await page.locator('.import-preview .import-row').first().waitFor();
  check('import previews the detected structure before adding anything', (await found()) === 'Found 2 volumes, 3 chapters, 2 scenes · 8 words.', await found());
  await page.getByLabel(/Split scenes at scene breaks/).uncheck();
  check('scene splitting can be turned off', (await found()) === 'Found 2 volumes, 3 chapters · 8 words.', await found());
  await page.getByLabel(/Split scenes at scene breaks/).check();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByText('Imported story.txt: 7 items added.').waitFor();
  eq('a .txt manuscript lands in the organizer as volumes, chapters and scenes', await tree10(), [
    'Volume: PART ONE [7]', '  Chapter: Chapter 1 [5]', '    Scene: Scene 1 [3]', '    Scene: Scene 2 [2]', '  Chapter: Chapter 2: The Gate [2]', 'Volume: Part Two [1]', '  Chapter: Epilogue [1]',
  ]);
  await row('Chapter 2: The Gate').click();
  await page.locator('.organizer-details').getByRole('link', { name: 'Open in editor' }).click();
  await page.locator(text).waitFor();
  eq('imported text keeps its tab and double space exactly', await paragraphs(), ['\tIndented  line.']);

  // Import Markdown with formatting, into a chosen volume
  await page.goto(exportUrl);
  await importFile('bonus.md', '# Interlude\n\nExtra **bold** and *slanted* text.\n\n> A quoted line.\n');
  await page.locator('.import-preview .import-row').first().waitFor();
  await page.locator('dialog[open]').getByLabel('Add to').selectOption({ label: 'Part Two' });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByText('Imported bonus.md: 1 item added.').waitFor();
  await page.getByRole('link', { name: 'Open it' }).click();
  await page.locator(text).waitFor();
  check('a .md import keeps bold, italic and quotes', (await page.locator(`${text} strong`).innerText()) === 'bold' && (await page.locator(`${text} em`).innerText()) === 'slanted' && (await page.locator(`${text} blockquote`).innerText()).trim() === 'A quoted line.');
  check('and went where it was told to', (await page.locator('.ms-location').innerText()).startsWith('Part Two'));

  // Give the project private material, so the export filters have something to filter
  await page.goto(`${BASE}/project/${p10}/organizer`);
  await row('Chapter 1').click();
  await page.locator('.organizer-details').getByLabel('Objective').fill('SECRET-PLAN-OBJECTIVE');
  await page.locator('.organizer-details').getByLabel('Private notes').fill('SECRET-PRIVATE-NOTE');
  await page.locator('.organizer-details').getByLabel('Private notes').blur();
  await page.waitForTimeout(500); // let the note reach the disk before leaving the page
  await page.goto(`${BASE}/project/${p10}/codex`);
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByText('Location', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.entry-name input')?.value.startsWith('New '));
  await page.locator('.codex-entry').getByLabel('Name', { exact: true }).fill('SECRET-LORE-NAME');
  await page.locator('.codex-entry').getByLabel('Name', { exact: true }).blur();
  await page.waitForTimeout(900);

  // Export in every format
  await page.goto(exportUrl);
  await page.getByRole('button', { name: 'Export manuscript…' }).click();
  const dialog10 = page.locator('dialog[open]');
  await dialog10.getByText(/4 chapters · 16 words of manuscript/).waitFor();
  const exportAs = async (formatLabel) => {
    await dialog10.getByRole('radio', { name: formatLabel }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog10.getByRole('button', { name: /^Export / }).click()]);
    return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
  };
  check('the export starts on the clean reader preset', (await dialog10.getByRole('button', { name: 'Clean reader manuscript' }).getAttribute('aria-pressed')) === 'true' && (await dialog10.getByLabel(/Author private notes/).isChecked()) === false);

  const txt = await exportAs('Plain text (.txt)');
  const txtBody = txt.bytes.toString('utf8');
  check('plain text keeps the hierarchy and the exact text', txt.name === 'Portable.txt' && txtBody.startsWith('PORTABLE\n========') && txtBody.includes('PART ONE\n--------') && txtBody.includes('CHAPTER 2: THE GATE\n\n\tIndented  line.') && txtBody.includes('The road ended.\n\n* * *\n\nMira waited.'), txtBody.slice(0, 300));
  const secrets = ['SECRET-PLAN-OBJECTIVE', 'SECRET-PRIVATE-NOTE', 'SECRET-LORE-NAME'];
  eq('a clean manuscript leaves out notes, planning and lore', secrets.filter((x) => txtBody.includes(x)), []);

  const md = await exportAs('Markdown (.md)');
  const mdBody = md.bytes.toString('utf8');
  check('markdown uses heading levels for the hierarchy', md.name === 'Portable.md' && mdBody.startsWith('# Portable') && mdBody.includes('## PART ONE') && mdBody.includes('### Chapter 1') && mdBody.includes('Extra **bold** and *slanted* text.') && mdBody.includes('> A quoted line.'));

  const docx = await exportAs('Word (.docx)');
  const docxXml = strFromU8(unzipSync(new Uint8Array(docx.bytes))['word/document.xml']);
  check('Word export is a real .docx with heading styles and page breaks', docx.name === 'Portable.docx' && docx.bytes.subarray(0, 2).toString() === 'PK' && docxXml.includes('<w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t xml:space="preserve">PART ONE</w:t>') && docxXml.includes('<w:pStyle w:val="Heading2"/><w:pageBreakBefore/>') && docxXml.includes('<w:tab/><w:t xml:space="preserve">Indented  line.</w:t>') && docxXml.includes('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">bold</w:t>'));
  eq('and it too is clean', secrets.filter((x) => docxXml.includes(x)), []);

  const pdf = await exportAs('PDF (.pdf)');
  const pdfBody = pdf.bytes.toString('latin1');
  check('PDF export is a paginated PDF with the text in it', pdf.name === 'Portable.pdf' && pdfBody.startsWith('%PDF-') && Number(/\/Count (\d+)/.exec(pdfBody)[1]) >= 6 && pdfBody.includes('(PART ONE) Tj') && pdfBody.includes('(The road ended.) Tj'), /\/Count (\d+)/.exec(pdfBody)?.[0]);
  eq('and clean', secrets.filter((x) => pdfBody.includes(x)), []);

  const html = await exportAs('Web page (.html)');
  check('web page export is self-contained HTML', html.bytes.toString('utf8').includes('<h1 class="title">Portable</h1>') && html.bytes.toString('utf8').includes('<h2 class="part new-page">PART ONE</h2>'));

  // Presets and individual switches
  await dialog10.getByRole('button', { name: 'Complete bible' }).click();
  const bible = (await exportAs('Plain text (.txt)')).bytes.toString('utf8');
  eq('the complete bible adds planning, notes and lore', secrets.filter((x) => bible.includes(x)), secrets);
  check('with the manuscript still in it', bible.includes('The road ended.') && bible.includes('WORLDBUILDING') && bible.includes('Planning: Chapter 1'));
  await dialog10.getByLabel(/Author private notes/).uncheck();
  await dialog10.getByLabel(/Worldbuilding & lore profiles/).uncheck();
  const custom = (await exportAs('Plain text (.txt)')).bytes.toString('utf8');
  eq('unticking a box removes exactly that content', secrets.filter((x) => custom.includes(x)), ['SECRET-PLAN-OBJECTIVE']);
  await dialog10.getByRole('button', { name: 'Clean reader manuscript' }).click();
  await dialog10.getByLabel(/Chapter titles/).uncheck();
  const bare = (await exportAs('Plain text (.txt)')).bytes.toString('utf8');
  check('titles and scene dividers can be left out', !bare.includes('PART ONE') && !bare.includes('* * *') && bare.includes('The road ended.\n\nMira waited.'));
  await dialog10.getByRole('button', { name: 'Clean reader manuscript' }).click();
  await dialog10.getByLabel('Which part').selectOption({ label: 'Part Two' });
  const part = await exportAs('Plain text (.txt)');
  check('one part of the book can be exported on its own', part.name === 'Portable-Part-Two.txt' && part.bytes.toString('utf8').includes('EPILOGUE') && !part.bytes.toString('utf8').includes('CHAPTER 1'));
  for (const { key } of [{ key: /Manuscript content/ }, { key: /Chapter titles/ }]) await dialog10.getByLabel(key).uncheck();
  check('with nothing selected, export is disabled', (await dialog10.getByRole('button', { name: /^Export / }).isDisabled()) && (await dialog10.getByText('Nothing is selected to export.').isVisible()));
  await shot('export-dialog');
  await dialog10.getByRole('button', { name: 'Close' }).last().click();

  // One-click full archive
  const [archiveDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export entire project data' }).click()]);
  const archive = JSON.parse(readFileSync(await archiveDownload.path(), 'utf8'));
  const archiveText = JSON.stringify(archive);
  check('the full archive is one readable JSON file with everything in it', archiveDownload.suggestedFilename() === 'Portable.novel.json' && archive.project.title === 'Portable' && archive.collections.chapters.length === 8 && archive.collections.chapterContents.length === 5 && 'chapterRevisions' in archive.collections && archive.collections.loreEntries.length === 1 && archive.collections.chapterPlans.length === 1 && secrets.every((x) => archiveText.includes(x)) && archiveText.includes('Indented  line.'));

  // A Word file exported here imports back with the same structure
  const p10b = await createProject('Round Trip');
  await page.goto(`${BASE}/project/${p10b}/export`);
  await importFile('Portable.docx', docx.bytes);
  await page.locator('.import-preview .import-row').first().waitFor();
  eq('a .docx import detects headings as volumes and chapters', await page.locator('.import-preview .import-row').evaluateAll((els) => els.map((e) => `${e.querySelector('.kind').textContent}: ${e.querySelector('.import-title').textContent}`)), [
    'Volume: PART ONE', 'Chapter: Chapter 1', 'Scene: Scene 1', 'Scene: Scene 2', 'Chapter: Chapter 2: The Gate', 'Volume: Part Two', 'Chapter: Epilogue', 'Chapter: Interlude',
  ]);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByText('Imported Portable.docx: 8 items added.').waitFor();
  await page.goto(`${BASE}/project/${p10b}/organizer`);
  await row('Interlude').click();
  await page.locator('.organizer-details').getByRole('link', { name: 'Open in editor' }).click();
  await page.locator(text).waitFor();
  check('and its formatting comes back', (await page.locator(`${text} strong`).innerText()) === 'bold' && (await page.locator(`${text} em`).innerText()) === 'slanted');

  // Files that cannot be read say why, and add nothing
  await page.goto(`${BASE}/project/${p10b}/export`);
  await importFile('broken.docx', 'this is not a word file');
  await page.getByText('This file could not be opened as a Word document.').waitFor();
  check('a damaged file is refused with a reason', await page.getByRole('button', { name: 'Import', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Cancel' }).click();
  await importFile('old.doc', 'x');
  await page.getByText(/save it as \.docx/).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await importFile('notes.rtf', '{\\rtf1\\ansi Chapter 1\\par {\\b Bold} start.\\par}');
  await page.locator('.import-preview .import-row').first().waitFor();
  check('.rtf files are read too', (await found()) === 'Found 1 chapter · 2 words.', await found());
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(exportUrl);
  await page.getByRole('button', { name: 'Export manuscript…' }).click();
  await dialog10.getByText(/words of manuscript/).waitFor();
  check('mobile: the export dialog fits', (await dialog10.evaluate((el) => el.scrollWidth <= window.innerWidth)) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-export');
  await dialog10.getByRole('button', { name: 'Close' }).last().click();
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 11: character relationships ---
  const p11 = await createProject('Court');
  await page.goto(`${BASE}/project/${p11}/organizer`);
  await page.getByRole('button', { name: 'Add the first chapter' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '+ Chapter', exact: true }).click();
    await row(`Chapter ${i + 2}`).waitFor();
  }
  await page.goto(`${BASE}/project/${p11}/codex`);
  for (const who of ['Mira', 'Bren', 'Orrin']) await newCharacter(who);
  const relUrl = `${BASE}/project/${p11}/relationships`;
  await page.goto(relUrl);
  const drawer = page.locator('.rel-drawer');
  const edgeInfo = () => page.locator('.rel-edge').evaluateAll((els) => els.map((g) => `${g.querySelector('text').textContent} [${[...g.querySelector('.aff-stroke').classList].find((c) => c.startsWith('aff-') && c !== 'aff-stroke')}]${g.querySelector('.aff-stroke').getAttribute('marker-end') ? ' →' : ''}`).sort());
  const nodeNames = () => page.locator('.rel-node .name').allTextContents();
  const link = async (first, type, second) => {
    await page.getByLabel('First character').selectOption({ label: first });
    await page.getByLabel('Relationship type').selectOption({ label: type });
    await page.getByLabel('Second character').selectOption({ label: second });
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await drawer.locator('h2', { hasText: first }).waitFor();
  };
  const stageCard = (index) => drawer.locator('.rel-timeline > li').nth(index);
  const ranges = () => drawer.locator('.rel-stage-head strong').allInnerTexts();
  check('starts with characters and no relationships', (await page.locator('.relationships .page-header .muted').innerText()) === '0 relationships between 3 characters');

  await link('Mira', 'Enemies', 'Bren');
  eq('a new relationship appears on the map', { nodes: await nodeNames(), edges: await edgeInfo() }, { nodes: ['Bren', 'Mira'], edges: ['Enemies [aff-neutral]'] });
  await stageCard(0).getByLabel(/affinity$/).selectOption('hostile');
  await stageCard(0).getByLabel('Relationship title').fill('Rivalry over the Royal Tournament');
  await stageCard(0).getByLabel('Origin: what brought this about').fill('Bren cheats in the final.');
  await stageCard(0).getByLabel('Reason / notes').fill('Keep it petty at first.');
  await stageCard(0).getByLabel('Reason / notes').blur();
  await page.locator('.rel-edge .aff-hostile').waitFor({ state: 'attached' }); // a vertical line has no box, so 'visible' never holds

  // The relationship changes over the story
  await drawer.getByLabel('New stage starts at').selectOption({ label: '3. Chapter 3' });
  await drawer.getByRole('button', { name: 'Add stage' }).click();
  await stageCard(1).waitFor();
  await stageCard(1).getByLabel(/type$/).selectOption({ label: 'Allies' });
  await stageCard(1).getByLabel(/affinity$/).selectOption('reluctant');
  await stageCard(1).getByLabel('Relationship title').fill('Shared threat in the Underground Lab');
  await stageCard(1).getByLabel('Relationship title').blur();
  await drawer.getByLabel('New stage starts at').selectOption({ label: '4. Chapter 4' });
  await drawer.getByRole('button', { name: 'Add stage' }).click();
  await stageCard(2).waitFor();
  await stageCard(2).getByLabel(/type$/).selectOption({ label: 'Friends' });
  await stageCard(2).getByLabel(/affinity$/).selectOption('trusting');
  await page.locator('.rel-edge .aff-trusting').waitFor({ state: 'attached' });
  await page.waitForTimeout(800);
  eq('the history reads as chapter ranges', await ranges(), ['Chapters 1–2', 'Chapter 3', 'Chapter 4+']);
  eq('the table summarises the whole arc', (await page.locator('.rel-table tbody tr').first().locator('td').allInnerTexts()).map((t) => t.trim()), ['Mira & Bren', 'Friends', 'Trusting', 'Chapters 1–2: Enemies → Chapter 3: Allies → Chapter 4+: Friends']);

  // Inspect the network at any point in the story
  const asOf = async (label) => {
    await page.getByLabel('As of').selectOption({ label });
    await page.waitForTimeout(100);
    return edgeInfo();
  };
  eq('as of chapter 1 they are enemies', await asOf('Chapter 1: Chapter 1'), ['Rivalry over the Royal Tourna… [aff-hostile]']);
  eq('by chapter 3, reluctant allies', await asOf('Chapter 3: Chapter 3'), ['Shared threat in the Undergro… [aff-reluctant]']);
  eq('by the end, trusted friends', await asOf('End of the story'), ['Friends [aff-trusting]']);

  // A directional relationship that begins mid-story
  await link('Orrin', 'Mentor / Student', 'Mira');
  await stageCard(0).getByLabel(/starts at$/).selectOption({ label: '3. Chapter 3' });
  await drawer.locator('.rel-stage-head strong', { hasText: 'Chapters 3+' }).waitFor();
  eq('directional links are drawn with an arrow', await edgeInfo(), ['Friends [aff-trusting]', 'Mentor / Student [aff-neutral] →']);
  check('and say who is who', (await drawer.innerText()).includes('Orrin is the Mentor; Mira is the Student.'));
  eq('a relationship that has not begun yet is not drawn', await asOf('Chapter 2: Chapter 2'), ['Rivalry over the Royal Tourna… [aff-hostile]']);
  check('and the table says so', (await page.locator('.rel-table tbody tr', { hasText: 'Orrin' }).innerText()).includes('Not yet'));
  await asOf('End of the story');
  await shot('relationships');

  // Centre the map on one character; open a link without leaving the map
  await drawer.getByRole('button', { name: 'Close details' }).click();
  await page.locator('.rel-node', { hasText: 'Bren' }).click();
  await page.locator('.rel-node.focus', { hasText: 'Bren' }).waitFor();
  eq('clicking a character centres the map on them and their connections', await nodeNames(), ['Bren', 'Mira']);
  check('with a note about what is hidden', (await page.getByText('1 relationship does not involve Bren.').isVisible()) && page.url().includes('focus='));
  await page.locator('.rel-edge').click();
  await drawer.locator('h2', { hasText: 'Mira' }).waitFor();
  check('clicking a link opens its full history beside the map', new URL(page.url()).pathname.endsWith('/relationships') && (await ranges()).length === 3 && (await stageCard(0).getByLabel('Reason / notes').inputValue()) === 'Keep it petty at first.' && (await page.locator('.rel-map').isVisible()));
  await page.keyboard.press('Tab');
  check('map links work from the keyboard', (await page.locator('.rel-edge').getAttribute('aria-label')).includes('Mira and Bren: Friends, trusting'));

  // The character's profile shows the same relationships
  await openCharacter('Mira', 'Relationships');
  await page.locator('.vault-relations li').nth(1).waitFor();
  const onProfile11 = (await page.locator('.vault-relations li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check("relationships appear on the character's profile", onProfile11.length === 2 && /Bren .*Trusting · 3 stages over the story/.test(onProfile11[0]) && /Orrin .*Neutral/.test(onProfile11[1]), onProfile11.join(' | '));
  await page.getByRole('button', { name: 'Relationship with Orrin: details' }).click();
  await page.locator('.vault-relations li.selected').waitFor();
  check('and each opens its full history beside the list', page.url().includes('rel=') && (await page.locator('.vault-relations li.selected strong').innerText()) === 'Orrin');

  // Deleting a character removes their relationships and leaves the rest standing
  await deleteCharacter('Bren');
  await page.goto(relUrl);
  await page.locator('.rel-node').first().waitFor();
  eq('deleting a character removes only their relationships', { summary: await page.locator('.relationships .page-header .muted').innerText(), nodes: await nodeNames(), edges: await edgeInfo() }, { summary: '1 relationship between 2 characters', nodes: ['Mira', 'Orrin'], edges: ['Mentor / Student [aff-neutral] →'] });

  // Custom type, swap, and the lore export
  await page.locator('.rel-edge').click();
  await stageCard(0).getByLabel(/type$/).selectOption({ label: 'Custom' });
  await stageCard(0).getByLabel('Custom type').fill('Blood oath');
  await stageCard(0).getByLabel('Orrin is the…').fill('Oath-holder');
  await stageCard(0).getByLabel('Mira is the…').fill('Sworn');
  await stageCard(0).getByLabel('Mira is the…').blur();
  await page.locator('.rel-edge text', { hasText: 'Blood oath' }).waitFor({ state: 'attached' });
  check('custom relationship types can be defined', (await edgeInfo())[0].startsWith('Blood oath'));
  await drawer.getByRole('button', { name: 'Swap who is who' }).click();
  await drawer.locator('h2', { hasText: /^Mira & Orrin$/ }).waitFor();
  check('who-is-who can be swapped', (await stageCard(0).getByLabel('Mira is the…').inputValue()) === 'Oath-holder');
  await page.goto(`${BASE}/project/${p11}/export`);
  await page.getByRole('button', { name: 'Export manuscript…' }).click();
  await dialog10.getByRole('button', { name: 'Complete bible' }).click();
  const courtBible = (await exportAs('Plain text (.txt)')).bytes.toString('utf8');
  check('the bible export lists each character\'s relationships', courtBible.includes('Relationships: Orrin (Sworn, neutral)') && courtBible.includes('Relationships: Mira (Oath-holder, neutral)'), courtBible.slice(courtBible.indexOf('WORLDBUILDING')));
  await dialog10.getByRole('button', { name: 'Close' }).last().click();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(relUrl);
  await page.locator('.rel-table tbody tr button').first().click();
  await page.locator('dialog[open] .rel-timeline').waitFor();
  check('mobile: the map fits and details open as a sheet', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await page.locator('dialog[open]').evaluate((el) => el.scrollWidth <= window.innerWidth)));
  await shot('mobile-relationships');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 12: story timeline ---
  const p12 = await createProject('Chronicle');
  await page.goto(`${BASE}/project/${p12}/organizer`);
  await page.getByRole('button', { name: 'Add the first chapter' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '+ Chapter', exact: true }).click();
    await row(`Chapter ${i + 2}`).waitFor();
  }
  await page.goto(`${BASE}/project/${p12}/codex`);
  await newCharacter('Mira');
  await newCharacter('Bren');
  await newEntry('Location', 'The Academy');
  await newEntry('Faction / Species', 'Ash Guild');
  const timeUrl = `${BASE}/project/${p12}/timeline`;
  await page.goto(timeUrl);
  await page.getByText('What happened, and when').waitFor();
  const ev = page.locator('.rel-drawer');
  const eventCard = (name) => page.locator('.event-card').filter({ has: page.locator('.event-name', { hasText: name }) });
  const cards = () => page.locator('.event-card').evaluateAll((els) => els.map((el) => `${el.querySelector('.event-when').textContent.trim()} | ${el.querySelector('.event-name').firstChild.textContent}`));
  const eventNames = () => page.locator('.event-card .event-name').evaluateAll((els) => els.map((el) => el.firstChild.textContent));
  const newEvent = async (name) => {
    await page.getByRole('button', { name: 'New event' }).click();
    await ev.getByLabel('Event name').waitFor();
    await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'New event');
    await ev.getByLabel('Event name').fill(name);
    await ev.getByLabel('Event name').blur();
    await eventCard(name).waitFor();
  };
  const precision = (label) => ev.getByRole('radio', { name: label, exact: true }).click();
  const setYear = async (year) => {
    await ev.getByLabel('Year', { exact: true }).fill(String(year));
    await ev.getByLabel('Year', { exact: true }).blur();
  };
  const events12 = async () => (await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction('timelineEvents').objectStore('timelineEvents').getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((e) => e.projectId === projectId)); };
    };
  }), p12)).sort((a, b) => a.id.localeCompare(b.id));

  // Exact: down to the minute
  await newEvent('The Siege');
  await precision('Exact');
  await setYear(1026);
  await ev.getByLabel('Month').selectOption('10');
  await ev.getByLabel('Day').fill('14');
  await ev.getByLabel('Day').blur();
  await ev.getByLabel('Time').fill('20:30');
  await ev.getByLabel('Importance').selectOption('climax');
  await ev.getByLabel('Location').selectOption({ label: 'The Academy' });
  await ev.getByLabel('Lasts').fill('3');
  await ev.getByLabel('Lasts').blur();
  await ev.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await ev.getByLabel('Link a chapter or scene').selectOption({ label: 'Chapter 2' });
  await ev.getByLabel('Link a codex entry').selectOption({ label: 'Ash Guild' });
  await ev.getByLabel('Description').fill('The walls fall at dusk.');
  await ev.getByLabel('Description').blur();
  await page.locator('.event-card', { hasText: 'Told in Chapter 2' }).waitFor();
  check('an exact event shows date, time, duration, place, people and where it is told', (await page.locator('.event-card').innerText()).replace(/\s+/g, ' ') === 'Year 1026, October 14 — 8:30 PM · lasts 3 days The Siege CLIMAX The Academy · Mira · Told in Chapter 2', (await page.locator('.event-card').innerText()).replace(/\s+/g, ' '));

  await newEvent('Mira is born');
  await precision('Exact');
  await setYear(1000);
  await ev.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await ev.getByLabel("Mira's age at this event").fill('0');
  await ev.getByLabel("Mira's age at this event").blur();

  // Approximate: a season
  await newEvent('Parents disappear');
  await precision('Approximate');
  await setYear(1008);
  await ev.getByLabel('Part of the year').selectOption('summer');
  await ev.getByLabel('Add a character').selectOption({ label: 'Mira' });

  // Relative: an offset from another event
  await newEvent('The Burning');
  await precision('Relative');
  await ev.getByLabel('Amount').fill('20');
  await ev.getByLabel('Amount').blur();
  await ev.getByLabel('Relative to').selectOption({ label: 'The Siege' });
  await ev.getByLabel('Importance').selectOption('major');

  // Undated: placed by what it follows
  await newEvent('Aftermath');
  await ev.getByLabel('Comes after').selectOption({ label: 'The Siege' });
  await page.waitForTimeout(400);
  eq('events sit in chronological order at every precision', await cards(), [
    'Year 1000 | Mira is born',
    'About 20 years before The Siege | The Burning',
    'Summer of Year 1008 | Parents disappear',
    'Year 1026, October 14 — 8:30 PM · lasts 3 days | The Siege',
    'Undated | Aftermath',
  ]);
  eq('grouped under the year they fall in', await page.locator('.chronology > li > h2').allInnerTexts(), ['YEAR 1000', 'YEAR 1006', 'YEAR 1008', 'YEAR 1026']);
  await eventCard('The Siege').click();
  await ev.getByText('Followed by: Aftermath').waitFor();
  check('previous and subsequent events are shown', true);
  await shot('timeline');

  // Filters
  await page.locator('.toolbar').getByLabel('Importance').selectOption('major');
  eq('filter by importance', await eventNames(), ['The Burning', 'The Siege']);
  await page.locator('.toolbar').getByLabel('Importance').selectOption('minor');
  await page.locator('.toolbar').getByLabel('Date precision').selectOption('relative');
  eq('filter by date precision', await eventNames(), ['The Burning']);
  await page.locator('.toolbar').getByLabel('Date precision').selectOption('');
  await page.locator('.toolbar').getByLabel('Location').selectOption({ label: 'The Academy' });
  eq('filter by location', await eventNames(), ['The Siege']);
  await page.locator('.toolbar').getByLabel('Location').selectOption('');
  await page.getByLabel('Search events').fill('parents');
  eq('search events', await eventNames(), ['Parents disappear']);
  await page.getByLabel('Search events').fill('');

  // A character's life path
  await page.getByLabel('Life path of').selectOption({ label: "Mira's life" });
  await page.locator('.life-summary').waitFor();
  // Born some time in Year 1000: in the summer of 1008 she is 7 or 8, on 14 October 1026 25 or 26. The dates allow no closer, so none is invented (Prompt 21).
  eq('a character gets a life path with ages worked out from the dates, as exactly as they allow', await page.locator('.life-summary').innerText(), 'Age 0: Mira is born → Age 7–8: Parents disappear → Age 25–26: The Siege');
  eq('and only their events are listed, each with their age', await page.locator('.event-card .event-age').allInnerTexts(), ['Age 0', 'Age 7–8', 'Age 25–26']);
  await ev.getByLabel("Mira's age at this event").fill('40');
  await ev.getByLabel("Mira's age at this event").blur();
  await ev.locator('.event-issues').waitFor();
  check('a stated age that contradicts the dates is flagged, not changed', (await ev.locator('.event-issues').innerText()).includes('Mira is stated as age 40, but the dates make it 25–26') && (await eventCard('The Siege').innerText()).includes('1 thing to check'));
  await ev.getByLabel("Mira's age at this event").fill('');
  await ev.getByLabel("Mira's age at this event").blur();
  await ev.locator('.event-issues').waitFor({ state: 'detached' });
  await shot('timeline-life');
  await page.getByLabel('Life path of').selectOption('');

  // Links are visible from the other side
  await page.goto(`${BASE}/project/${p12}/codex`);
  await openCharacter('Mira');
  const onProfile12 = page.locator('.vault-profile').getByRole('region', { name: 'Timeline', exact: true }).locator('.vault-rows li');
  await onProfile12.first().waitFor();
  const lines12 = (await onProfile12.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check("a character's profile lists their events in the order they happen, with their dates", lines12.length === 3 && lines12[0].startsWith('Mira is born Year 1000') && lines12[1].startsWith('Parents disappear Summer of Year 1008') && lines12[2].startsWith('The Siege Year 1026, October 14 — 8:30 PM'), lines12.join(' | '));
  await page.goto(`${BASE}/project/${p12}/codex`);
  await openEntry('The Academy');
  // The list fills in once the timeline has loaded; wait for it (a missing event still fails after the wait).
  check('a location lists what happened there', await page.locator('.linked-events li', { hasText: 'The Siege' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  await openEntry('Ash Guild');
  await page.locator('.linked-events a', { hasText: 'The Siege' }).click();
  await ev.getByLabel('Event name').waitFor();
  check('and each links back to the event', (await ev.getByLabel('Event name').inputValue()) === 'The Siege' && new URL(page.url()).pathname.endsWith('/timeline'));
  await page.goto(`${BASE}/project/${p12}/organizer`);
  await row('Chapter 2').click();
  check('a chapter lists the events told in it', await page.locator('.organizer-details .linked-events li', { hasText: 'The Siege' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false));

  // Reordering the manuscript does not move anything in time
  const whenBefore = JSON.stringify(await events12());
  await menu('Chapter 2', 'Move up');
  await page.waitForTimeout(200);
  await menu('Chapter 3', 'Move up');
  await page.waitForTimeout(200);
  eq('chapters were reordered', await page.locator('.outline-row strong').allInnerTexts(), ['Chapter 2', 'Chapter 3', 'Chapter 1']);
  check('reordering chapters changes no event', JSON.stringify(await events12()) === whenBefore);
  await page.goto(timeUrl);
  await page.locator('.event-card').first().waitFor();
  eq('and the chronology is exactly as it was', await eventNames(), ['Mira is born', 'The Burning', 'Parents disappear', 'The Siege', 'Aftermath']);
  check('creating events left the manuscript order alone until the author changed it', (await eventCard('The Siege').innerText()).includes('Told in Chapter 2'));

  // Deleting an event flags what depended on it
  await eventCard('The Siege').click();
  await ev.getByRole('button', { name: 'Delete event…' }).click();
  await page.getByRole('button', { name: 'Delete event', exact: true }).click();
  await eventCard('The Siege').waitFor({ state: 'detached' });
  check('events that depended on a deleted one are kept and flagged', (await page.locator('.timeline-page .page-header .muted').innerText()) === '4 events in the order they happened · 2 to check' && (await page.locator('.chronology > li > h2').last().innerText()) === 'NOT YET PLACED IN TIME', await page.locator('.timeline-page .page-header .muted').innerText());
  await eventCard('The Burning').click();
  check('with the reason spelled out', (await ev.locator('.event-issues').innerText()).includes('Its date is relative to an event that no longer exists.'));

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(timeUrl);
  await page.locator('.event-card').first().click();
  await page.locator('dialog[open]').getByLabel('Event name').waitFor();
  check('mobile: the timeline fits and details open as a sheet', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await page.locator('dialog[open]').evaluate((el) => el.scrollWidth <= window.innerWidth)));
  await shot('mobile-timeline');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 13: cross-references ---
  const p13 = await createProject('Linked');
  await page.goto(`${BASE}/project/${p13}/codex`);
  await newCharacter('Mira', { summary: 'A runaway fire-mage.' });
  await newEntry('Location', 'Royal Academy');
  await field('Short summary').fill('Where mages are trained.');
  await field('Short summary').blur();
  await page.waitForTimeout(800);
  await newCharacter('Will');
  await page.goto(`${BASE}/project/${p13}/manuscript`);
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const linkedUrl = page.url();
  const n13 = linkedUrl.split('/').pop();
  const prose = 'Mira reached the Royal Academy. She will wait for Will.';
  await page.locator(text).click();
  await page.keyboard.type(prose);
  await saved();
  const liveLinks = () => page.locator(`${text} .ref-live`).allInnerTexts();
  const suggested = () => page.locator(`${text} .ref-suggest`).allInnerTexts();
  const selectChars = async (skip, length) => {
    await page.locator(text).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < skip; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < length; i++) await page.keyboard.press('Shift+ArrowRight');
  };
  const node13 = async () => (await page.evaluate((id) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction('chapters').objectStore('chapters').get(id);
      request.onsuccess = () => { open.result.close(); resolve(request.result); };
    };
  }), n13));

  // Bind selected words to a codex entry
  await selectChars(17, 13);
  await page.getByRole('button', { name: 'Link to a codex entry' }).click();
  const linkBar = page.locator('.link-bar');
  check('the link bar offers the entry the selected words name', (await linkBar.locator('.link-what').innerText()) === 'Link “Royal Academy” to…' && (await linkBar.locator('.link-results li').first().innerText()).startsWith('Royal Academy'));
  await linkBar.locator('.link-results button', { hasText: 'Royal Academy' }).click();
  await page.locator(`${text} .ref-live`).waitFor();
  await saved();
  eq('selected words become a link; the text itself is unchanged', { links: await liveLinks(), text: await paragraphs() }, { links: ['Royal Academy'], text: [prose] });
  check('the chapter records which entries its text links to', (await node13()).mentions.length === 1);

  // Inspect without leaving the editor
  await page.locator(`${text} .ref-live`).hover();
  await page.locator('.ref-card[role=tooltip]').waitFor();
  check('hovering a link shows a quick card', (await page.locator('.ref-card[role=tooltip]').innerText()).includes('Royal Academy') && (await page.locator('.ref-card[role=tooltip]').innerText()).includes('Where mages are trained.'));
  await page.locator(`${text} .ref-live`).click();
  await page.locator('.quick-entry').waitFor();
  check('clicking a link opens the entry beside the text, in place', (await page.locator('.quick-entry').innerText()).includes('Where mages are trained.') && page.url() === linkedUrl && (await page.locator(text).isVisible()));

  // Opt-in suggestions
  eq('no suggestions unless the author asks for them', await suggested(), []);
  await page.getByRole('button', { name: /^Suggest links/ }).click();
  await page.locator(`${text} .ref-suggest`).first().waitFor();
  eq('with detection on, exact names are underlined ("Will" but not "will"); linked text is skipped', await suggested(), ['Mira', 'Will']);
  check('suggestions are only overlays: no link was made and the text is the same', (await liveLinks()).length === 1 && (await page.locator(`${text} [data-entity]`).count()) === 1 && (await paragraphs())[0] === prose && (await page.getByRole('button', { name: 'Suggest links (2)' }).isVisible()));
  await page.locator(`${text} .ref-suggest`, { hasText: 'Mira' }).click();
  await page.getByRole('dialog', { name: 'Link suggestion' }).waitFor();
  await page.getByRole('button', { name: 'Not now' }).click();
  eq('declining a suggestion links nothing', { links: await liveLinks(), suggestions: await suggested() }, { links: ['Royal Academy'], suggestions: ['Mira', 'Will'] });
  await page.locator(`${text} .ref-suggest`, { hasText: 'Will' }).click();
  check('a suggestion names the entry it would link to', (await page.getByRole('dialog', { name: 'Link suggestion' }).innerText()).replace(/\s+/g, ' ').includes('Link “Will” to Will CHARACTER?'));
  await page.getByRole('button', { name: 'Link this one' }).click();
  await page.locator(`${text} .ref-live`, { hasText: 'Will' }).waitFor();
  await saved();
  eq('accepting one links exactly that occurrence', { links: await liveLinks(), suggestions: await suggested(), text: await paragraphs() }, { links: ['Royal Academy', 'Will'], suggestions: ['Mira'], text: [prose] });
  await page.keyboard.press('ControlOrMeta+z');
  eq('and it is one undo step', await liveLinks(), ['Royal Academy']);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.getByRole('button', { name: /^Suggest links/ }).click();
  eq('turning detection off removes the underlines and keeps real links', { links: await liveLinks(), suggestions: await suggested() }, { links: ['Royal Academy', 'Will'], suggestions: [] });
  await saved();
  await shot('links');

  // Remove a link
  await page.locator(`${text} .ref-live`, { hasText: 'Will' }).click();
  await page.getByRole('button', { name: 'Link to a codex entry' }).click();
  check('the link bar shows what the cursor is linked to', (await linkBar.locator('.link-what').innerText()) === 'Linked to Will');
  await linkBar.getByRole('button', { name: 'Remove link' }).click();
  await saved();
  eq('removing a link leaves the words', { links: await liveLinks(), text: await paragraphs() }, { links: ['Royal Academy'], text: [prose] });

  // The plan lists what the text links to
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.locator('.ms-panel .linked-in-text').waitFor();
  check('the planning sheet shows what the text links to', (await page.locator('.ms-panel .linked-in-text').innerText()).includes('Royal Academy'));

  // Backlinks on the entry, the trail back, and jumping to the exact place
  await page.locator(`${text} .ref-live`).click(); // inspect the Academy again
  await page.locator('.quick-entry', { hasText: 'Where mages are trained.' }).waitFor();
  await page.locator('.quick-entry').getByRole('link', { name: 'Edit in Codex' }).click();
  await page.locator('.mentioned-in').waitFor();
  check('the entry lists where it is mentioned', (await page.locator('.mentioned-in li').innerText()).replace(/\s+/g, ' ') === 'Chapter 1 Chapter · linked in the text', await page.locator('.mentioned-in li').innerText());
  check('a breadcrumb leads back to the chapter', (await page.locator('.trail .trail-back').innerText()) === '← Back to Chapter 1');
  await page.locator('.mentioned-in a').click();
  await page.locator(`${text} .ref-live`).waitFor();
  await page.waitForTimeout(200);
  check('following a backlink lands on the linked words', page.url() === linkedUrl && (await page.evaluate(() => getSelection().toString())) === 'Royal Academy');
  await page.goBack();
  await page.locator('.trail .trail-back').click();
  await page.locator(text).waitFor();
  check('the breadcrumb returns to the writing', page.url() === linkedUrl);

  // Renaming an entry keeps the link and never rewrites the manuscript
  await page.goto(`${BASE}/project/${p13}/codex`);
  await openEntry('Royal Academy');
  await field('Name').fill('The Grand Academy');
  await field('Name').blur();
  await page.locator('.entry-list', { hasText: 'The Grand Academy' }).waitFor();
  await page.goto(linkedUrl);
  await page.locator(`${text} .ref-live`).waitFor();
  await page.locator(`${text} .ref-live`).hover();
  await page.locator('.ref-card[role=tooltip]').waitFor();
  check('after a rename the link follows the entry and the prose is untouched', (await page.locator('.ref-card[role=tooltip]').innerText()).includes('The Grand Academy') && (await paragraphs())[0] === prose && (await statusOf(page)) === 'Saved');

  // Deleting the entry unbinds the link gracefully
  await page.goto(`${BASE}/project/${p13}/codex`);
  await openEntry('The Grand Academy');
  await page.getByRole('button', { name: 'Delete entry…' }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.locator('.entry-list a', { hasText: 'The Grand Academy' }).waitFor({ state: 'detached' });
  await page.goto(linkedUrl);
  await page.locator(text).waitFor();
  await page.waitForTimeout(300);
  eq('deleting an entry leaves plain, intact text where its links were', { links: await liveLinks(), text: await paragraphs(), status: await statusOf(page) }, { links: [], text: [prose], status: 'Saved' });
  await page.locator(text).click();
  await typeAtEnd(page, ' Onward.');
  await saved();
  check('and the chapter keeps saving normally', (await paragraphs())[0] === `${prose} Onward.`);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(linkedUrl);
  await page.locator(text).waitFor();
  await selectChars(0, 4);
  // On a phone the formatting row is one tap away, behind Format in the quick bar.
  await page.getByRole('button', { name: 'Format' }).click();
  await page.getByRole('button', { name: 'Link to a codex entry' }).click();
  await linkBar.locator('.link-results button', { hasText: 'Mira' }).click();
  await page.locator(`${text} .ref-live`).waitFor();
  await page.locator(`${text} .ref-live`).click();
  await page.locator('.quick-entry').waitFor();
  check('mobile: tapping a link opens the entry in the drawer', (await page.locator('.ms-panel').isVisible()) && (await page.locator('.quick-entry').innerText()).includes('A runaway fire-mage.') && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-links');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 14: custom fields, categories and templates ---
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Ascension');
  await page.getByLabel('Worldbuilding template').selectOption({ label: 'Progression Fantasy Bible' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p14 = page.url().split('/').pop();
  await page.goto(`${BASE}/project/${p14}/codex`);
  await page.getByText('Build your world').waitFor();
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  eq('a template sets up its categories when the project is created', (await page.locator('.codex-list .menu-items button').allInnerTexts()).slice(0, -1), ['Location', 'Faction / Species', 'Item / Artifact', 'Power System / Rule', 'Lore / History', 'Skill', 'Stage', 'Guild']);
  await page.keyboard.press('Escape');
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await newEntry('Stage', 'Core Formation');
  await field('Order').fill('3');
  await field('Order').blur();
  // What a template gives every character is offered on a profile, never forced onto it.
  const kai14 = await newCharacter('Kai', { stay: true });
  await page.goto(`${BASE}/project/${p14}/characters/${kai14}/details`);
  const loose14 = page.locator('.vault-profile').getByRole('region', { name: 'Fields without a section' });
  await loose14.getByRole('button', { name: '+ Power Rank' }).waitFor();
  eq('the fields the template gives every character are offered on their profile', await loose14.getByRole('group', { name: 'Shared fields to add' }).getByRole('button').allInnerTexts(), ['+ Power Rank', '+ Elements', '+ Affixes', '+ Current stage']);
  await loose14.getByRole('button', { name: '+ Power Rank' }).click();
  await loose14.getByRole('button', { name: 'Edit Power Rank', exact: true }).click();
  const ed14 = loose14.getByRole('group', { name: 'Editing Power Rank' });
  await ed14.getByLabel('Power Rank', { exact: true }).selectOption('S');
  await ed14.getByRole('button', { name: 'Done' }).click();
  await ed14.waitFor({ state: 'detached' });
  await loose14.getByRole('button', { name: '+ Current stage' }).click();
  await loose14.getByRole('button', { name: 'Edit Current stage', exact: true }).click();
  const stage14 = loose14.getByRole('group', { name: 'Editing Current stage' });
  await stage14.getByLabel('Current stage', { exact: true }).selectOption({ label: 'Core Formation' });
  await stage14.getByRole('button', { name: 'Done' }).click();
  await stage14.waitFor({ state: 'detached' });
  eq('shared fields are filled in with the type and choices the template set (a choice, a link to an entry), leaving the ones still to add', { cards: (await loose14.locator('.vault-field .vault-field-open').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).map((t) => t.split(' Open ')[0]), left: await loose14.getByRole('group', { name: 'Shared fields to add' }).getByRole('button').allInnerTexts() }, { cards: ['POWER RANK S', 'CURRENT STAGE Core Formation'], left: ['+ Elements', '+ Affixes'] });
  await page.goto(`${BASE}/project/${p14}/codex`);
  await newEntry('Guild', 'Ash Sect');
  eq('and the fields the template gives its own categories', await page.locator('.typed-fields .field > span').allInnerTexts(), ['Standing', 'Leader', 'Headquarters', 'Members', 'Open to recruits']);

  // One value of each kind
  const entryPane = page.locator('.codex-entry');
  await field('Standing').selectOption('Major');
  await field('Leader').selectOption({ label: 'Kai' });
  await field('Headquarters').selectOption({ label: 'Core Formation' });
  await field('Members').fill('42');
  await field('Members').blur();
  await field('Open to recruits').selectOption('yes');
  await entryPane.getByRole('button', { name: '+ Add field' }).click();
  await field('Field 1 name').fill('Motto');
  await field('Motto value').fill('Void Mage');
  await entryPane.getByRole('button', { name: '+ Add field' }).click();
  await field('Field 2 name').fill('Creed');
  await field('Field 2 type').selectOption('longtext');
  await field('Creed value').fill('Burning\nSwift');
  await entryPane.getByRole('button', { name: '+ Add field' }).click();
  await field('Field 3 name').fill('Founded');
  await field('Field 3 type').selectOption('date');
  await field('Founded value').fill('1000-03-01');
  await page.waitForTimeout(900);
  await page.reload();
  await openEntry('Ash Sect');
  const sectValues = async () => ({
    standing: await field('Standing').inputValue(), leader: await field('Leader').locator('option:checked').innerText(), hq: await field('Headquarters').locator('option:checked').innerText(),
    members: await field('Members').inputValue(), open: await field('Open to recruits').inputValue(), motto: await field('Motto value').inputValue(), creed: await field('Creed value').inputValue(), founded: await field('Founded value').inputValue(),
  });
  eq('choice, entry links (to a character and to an entry), number, yes/no, text, long text and date all save and reload', await sectValues(), { standing: 'Major', leader: 'Kai', hq: 'Core Formation', members: '42', open: 'yes', motto: 'Void Mage', creed: 'Burning\nSwift', founded: '1000-03-01' });
  check('number and date fields use the right controls', (await field('Members').getAttribute('type')) === 'number' && (await field('Founded value').getAttribute('type')) === 'date');
  await shot('typed-fields');

  // Typed values read properly elsewhere
  await page.keyboard.press('ControlOrMeta+k');
  await searchFor('core formation');
  eq('a linked entry is searchable by name, under both categories', (await groupNames()).sort(), ['Characters', 'Cultivation Stages', 'Guilds & Sects']);
  check('with the field it sits in named', (await dlg.locator('.search-snippet', { hasText: 'Headquarters' }).innerText()).replace(/\s+/g, ' ').includes('Headquarters: Core Formation'));
  await page.keyboard.press('Escape');

  // Reshape the category: add, rename, reorder, retype, remove, restore
  await entryPane.getByRole('button', { name: 'Edit these fields…' }).click();
  const sd = page.locator('dialog[open]');
  const defNames = () => sd.locator('.schema-fields > li > input:first-child').evaluateAll((els) => els.map((e) => e.value));
  check('the Codex shapes world categories only: Characters is not among them', !(await sd.locator('.schema-nav button').allInnerTexts()).some((t) => t.includes('Characters')));
  await sd.getByRole('button', { name: '+ Add field' }).click();
  await sd.getByLabel('Field 6 name').fill('Motive');
  await sd.getByLabel('Field 6 name').blur();
  await sd.getByRole('button', { name: 'Move Motive up' }).waitFor();
  await sd.getByRole('button', { name: 'Move Motive up' }).click();
  await sd.getByLabel('Field 2 name').fill('Master');
  await sd.getByLabel('Field 2 name').blur();
  await sd.getByLabel('Standing choices').fill('Minor, Rising, Major, Legendary, Mythic');
  await sd.getByLabel('Standing choices').blur();
  await sd.getByRole('button', { name: 'Remove Members' }).click();
  await sd.locator('.schema-archived', { hasText: 'Members' }).waitFor();
  eq('fields can be added, renamed and reordered', await defNames(), ['Standing', 'Master', 'Headquarters', 'Motive', 'Open to recruits']);
  check('a removed field is archived, and says its values are kept', (await sd.locator('.schema-archived', { hasText: 'Members' }).innerText()).includes('still filled in on 1 entry'));
  await sd.getByRole('button', { name: 'Close' }).click();
  eq('the entry follows the new shape without losing anything', { master: await field('Master').locator('option:checked').innerText(), hq: await field('Headquarters').locator('option:checked').innerText(), labels: await page.locator('.typed-fields .field > span').allInnerTexts() }, {
    master: 'Kai', hq: 'Core Formation', labels: ['Standing', 'Master', 'Headquarters', 'Motive', 'Open to recruits'],
  });
  check('new choices are offered', (await field('Standing').locator('option').allInnerTexts()).includes('Mythic') && (await field('Standing').inputValue()) === 'Major');
  check('the value of the removed field is still there, set aside', (await entryPane.locator('.archived-values').innerText()).includes('1 archived field with something written'));
  await entryPane.locator('.archived-values summary').click();
  check('and readable', (await entryPane.locator('.archived-values dl').innerText()).replace(/\s+/g, ' ') === 'MEMBERS 42');
  await entryPane.getByRole('button', { name: 'Edit these fields…' }).click();
  await sd.getByRole('button', { name: 'Restore Members' }).click();
  await sd.getByLabel('Members type').selectOption('text');
  await sd.getByRole('button', { name: 'Close' }).click();
  check('restoring the field brings its value back, even under a new type', (await field('Members').inputValue()) === '42' && (await field('Members').getAttribute('type')) !== 'number' && (await entryPane.locator('.archived-values').count()) === 0);

  // A category of the author's own
  await entryPane.getByRole('button', { name: 'Edit these fields…' }).click();
  await sd.getByLabel('New category name').fill('Kingdoms');
  await sd.getByRole('button', { name: 'Add', exact: true }).click();
  await sd.locator('.schema-nav button.active', { hasText: 'Kingdoms' }).waitFor();
  await sd.getByLabel('Singular name').fill('Kingdom');
  await sd.getByLabel('Singular name').blur();
  for (const [index, name, type] of [[1, 'Population', 'number'], [2, 'Government Type', 'select'], [3, 'Monarch', 'reference']]) {
    await sd.getByRole('button', { name: '+ Add field' }).click();
    await sd.getByLabel(`Field ${index} name`).fill(name);
    await sd.getByLabel(`Field ${index} name`).blur();
    await sd.getByLabel(`${name} type`).selectOption(type);
  }
  await sd.getByLabel('Government Type choices').fill('Monarchy, Republic, Theocracy');
  await sd.getByLabel('Government Type choices').blur();
  await page.waitForTimeout(300);
  await sd.getByRole('button', { name: 'Close' }).click();
  await newEntry('Kingdom', 'Aldmoor');
  eq('a custom category has its own field set', await page.locator('.typed-fields .field > span').allInnerTexts(), ['Population', 'Government Type', 'Monarch']);
  await field('Population').fill('120000');
  await field('Population').blur();
  await field('Government Type').selectOption('Monarchy');
  await field('Monarch').selectOption({ label: 'Kai' });
  await page.waitForTimeout(300);
  await page.getByLabel('Filter by category').selectOption({ label: 'Kingdoms (1)' });
  eq('and its own place in the codex', await listed(), ['Aldmoor']);
  check('with its own badge', (await page.locator('.entry-list .cat').innerText()) === 'KINGDOM');
  await page.getByLabel('Filter by category').selectOption('all');

  // Save the structure as a template; archive the category; start another project from the template
  await entryPane.getByRole('button', { name: 'Edit these fields…' }).click();
  await sd.getByLabel('Template name').fill('My Fantasy Bible');
  await sd.getByRole('button', { name: 'Save template' }).click();
  await sd.getByText('Saved “My Fantasy Bible”.').waitFor();
  await sd.getByRole('button', { name: 'Archive category' }).click();
  await sd.getByRole('button', { name: 'Restore category' }).waitFor();
  await shot('schema-dialog');
  await sd.getByRole('button', { name: 'Close' }).click();
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  check('an archived category takes no new entries but keeps the ones it has', !(await page.locator('.codex-list .menu-items button').allInnerTexts()).includes('Kingdom') && (await listed()).includes('Aldmoor'));
  await page.keyboard.press('Escape');

  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Book Two');
  await page.getByLabel('Worldbuilding template').selectOption({ label: 'My Fantasy Bible' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p14b = page.url().split('/').pop();
  await page.goto(`${BASE}/project/${p14b}/codex`);
  await page.getByText('Build your world').waitFor();
  await newEntry('Kingdom', 'Vesk');
  eq('a saved template sets up a new project with the same categories and fields', await page.locator('.typed-fields .field > span').allInnerTexts(), ['Population', 'Government Type', 'Monarch']);
  check('with the choices, and none of the first project\'s entries', (await field('Government Type').locator('option').allInnerTexts()).includes('Theocracy') && (await listed()).join() === 'Vesk');
  await newEntry('Guild', 'Vesk Sect');
  const labels14 = await page.locator('.typed-fields .field > span').allInnerTexts();
  check('including renamed and added fields on the template\'s categories', ['Master', 'Members', 'Motive'].every((name) => labels14.includes(name)) && !labels14.includes('Leader'), (await page.locator('.typed-fields .field > span').allInnerTexts()).join());

  // Projects without a template, and existing ones, are untouched
  await page.goto(`${BASE}/project/${p13}/codex`);
  await page.getByText('Build your world').waitFor(); // its two characters are not Codex entries
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  eq('other projects keep the standard categories', (await page.locator('.codex-list .menu-items button').allInnerTexts()).slice(0, -1), ['Location', 'Faction / Species', 'Item / Artifact', 'Power System / Rule', 'Lore / History']);
  await page.keyboard.press('Escape');

  // The sect has served its purpose; without it the project is the one the story graph is drawn from below.
  await page.goto(`${BASE}/project/${p14}/codex`);
  await openEntry('Ash Sect');
  await page.getByRole('button', { name: 'Delete entry…' }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.locator('.entry-list a', { hasText: 'Ash Sect' }).waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p14}/codex`);
  await page.locator('.entry-list a', { hasText: 'Aldmoor' }).click();
  await page.locator('.codex-entry').getByRole('button', { name: 'Edit these fields…' }).click();
  await sd.locator('.schema-fields').waitFor();
  check('mobile: the category editor fits', (await sd.evaluate((el) => el.scrollWidth <= window.innerWidth)) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-schema');
  await sd.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 15: story graph ---
  // Give the Ascension project a small, known network: a rival, a chapter, an event and a loner.
  await page.goto(`${BASE}/project/${p14}/codex`);
  await page.locator('.entry-list a').first().waitFor();
  await newCharacter('Ren');
  await newCharacter('Hermit');
  await page.waitForTimeout(700);
  await page.goto(`${BASE}/project/${p14}/relationships`);
  await link('Kai', 'Rivals', 'Ren');
  await page.goto(`${BASE}/project/${p14}/organizer`);
  await page.getByRole('button', { name: 'Add the first chapter' }).click();
  await row('Chapter 1').click();
  await page.locator('.organizer-details').getByLabel('Add an entity').selectOption({ label: 'Kai' });
  await page.locator('.organizer-details .entity-chips', { hasText: 'Kai' }).waitFor();
  await page.goto(`${BASE}/project/${p14}/timeline`);
  await newEvent('Awakening');
  await ev.getByLabel('Add a character').selectOption({ label: 'Kai' });
  await page.locator('.event-card', { hasText: 'Kai' }).waitFor();

  const graphUrl = `${BASE}/project/${p14}/graph`;
  await page.goto(graphUrl);
  const gc = page.locator('.graph-canvas');
  const inspector = page.locator('.graph-inspector');
  const settled = () => page.locator('.graph-canvas[data-settled="true"]').waitFor({ timeout: 20000 });
  const graphStatus = () => page.locator('.graph-page .page-header [role=status]').innerText();
  const layout = async () => JSON.parse(await gc.getAttribute('data-layout'));
  const idOf = async (label) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'chapters', 'timelineEvents']);
      const found = [];
      for (const [store, key] of [['loreEntries', 'name'], ['chapters', 'title'], ['timelineEvents', 'name']]) {
        tx.objectStore(store).getAll().onsuccess = (e) => found.push(...e.target.result.filter((r) => r.projectId === projectId && r[key] === name));
      }
      tx.oncomplete = () => { open.result.close(); resolve(found[0]?.id); };
    };
  }), [p14, label]);
  const at = async (label) => {
    const [x, y] = (await layout())[await idOf(label)];
    const box = await gc.boundingBox();
    return { x: box.x + x, y: box.y + y };
  };
  const clickNode = async (label) => {
    const point = await at(label);
    await page.mouse.click(point.x, point.y);
  };
  await settled();
  eq('the graph shows every entity and link in the project', await graphStatus(), '7 nodes · 5 links · 1 not linked to anything');
  eq('with a toggle for each kind of thing, custom categories included', (await page.locator('.graph-filters .chip-toggle').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['Characters 3', 'Cultivation Stages 1', 'Kingdoms 1', 'Events 1', 'Chapters & arcs 1', 'Relationships 1']);
  check('the overview names the most connected and the isolated', (await inspector.locator('.graph-list').first().locator('li').first().innerText()).replace(/\s+/g, ' ') === 'Kai Character · 5 connections' && (await inspector.locator('.graph-list').last().innerText()).replace(/\s+/g, ' ') === 'Hermit Character');
  await shot('graph');

  // Focus a node from the canvas
  await clickNode('Kai');
  await inspector.locator('h2', { hasText: 'Kai' }).waitFor();
  eq('clicking a node opens it in the inspector with everything it is linked to, and why', (await inspector.locator('.graph-list li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).sort(), ['Aldmoor Monarch', 'Awakening Involved in', 'Chapter 1 Planned in', 'Core Formation Current stage', 'Ren Rivals']);
  check('with its own details and a link to edit it', (await inspector.innerText()).includes('5 connections') && (await inspector.getByRole('link', { name: 'Open character profile' }).isVisible()));
  await shot('graph-focus');

  // Click the line between two nodes
  const [kai, ren] = [await at('Kai'), await at('Ren')];
  await page.mouse.click((kai.x + ren.x) / 2, (kai.y + ren.y) / 2);
  await inspector.locator('h2', { hasText: 'Ren' }).waitFor();
  check('clicking a link explains it', (await inspector.innerText()).replace(/\s+/g, ' ').includes('Rivals Character relationship · Neutral') && (await inspector.getByRole('link', { name: "Open the relationship's history" }).isVisible()));
  await inspector.getByRole('button', { name: 'Go to Ren' }).click();
  await inspector.locator('h2', { hasText: /^Ren$/ }).waitFor();
  check('and leads to either end', (await inspector.innerText()).includes('1 connection'));

  // Filters redraw the graph; the links underneath are untouched
  await page.locator('.chip-toggle', { hasText: 'Relationships' }).click();
  await page.locator('.graph-page [role=status]', { hasText: '4 links' }).waitFor();
  await page.locator('.chip-toggle', { hasText: 'Events' }).click();
  await page.locator('.graph-page [role=status]', { hasText: '6 nodes · 3 links' }).waitFor();
  await page.locator('.chip-toggle', { hasText: 'Characters' }).click();
  await page.locator('.graph-page [role=status]', { hasText: '3 nodes · 0 links' }).waitFor();
  for (const name of ['Characters', 'Events', 'Relationships']) await page.locator('.chip-toggle', { hasText: name }).click();
  await page.locator('.graph-page [role=status]', { hasText: '7 nodes · 5 links' }).waitFor();
  check('category toggles add and remove nodes and their links, and restore them exactly', true);

  // Find, zoom, pan, drag
  await page.getByLabel('Find in the graph').selectOption({ label: 'Hermit' });
  await inspector.locator('h2', { hasText: 'Hermit' }).waitFor();
  check('an isolated character is easy to find and says so', (await inspector.innerText()).includes('0 connections') && (await inspector.innerText()).includes('joins the network'));
  await settled();
  const zoomBefore = Number(await gc.getAttribute('data-zoom'));
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForFunction((z) => Number(document.querySelector('.graph-canvas').dataset.zoom) > z, zoomBefore);
  const box15 = await gc.boundingBox();
  await page.mouse.move(box15.x + box15.width / 2, box15.y + box15.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForFunction((z) => Number(document.querySelector('.graph-canvas').dataset.zoom) < z, zoomBefore * 1.3);
  check('zoom works from the buttons and the wheel', true);
  // Fit once everything has come to rest, so the node to drag is certain to be on screen.
  await settled();
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(300);
  await clickNode('Ren');
  await settled();
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(300);
  const before15 = await layout();
  const renId = await idOf('Ren');
  const kaiId = await idOf('Kai');
  const start15 = await at('Ren');
  await page.mouse.move(start15.x, start15.y);
  await page.mouse.down();
  await page.mouse.move(start15.x + 60, start15.y - 50, { steps: 8 });
  await page.mouse.move(start15.x + 120, start15.y - 90, { steps: 8 });
  await page.mouse.up();
  await settled(); // the rest of the graph makes room, then comes to rest
  const dragged = await layout();
  check('a node can be dragged to a new place', Math.hypot(dragged[renId][0] - before15[renId][0], dragged[renId][1] - before15[renId][1]) > 90, `${before15[renId]} → ${dragged[renId]}`);
  const corner = { x: box15.x + 14, y: box15.y + 14 };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 70, corner.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const panned = await layout();
  check('dragging the background pans everything together', Math.abs(panned[kaiId][0] - dragged[kaiId][0] - 70) <= 12 && Math.abs(panned[renId][0] - dragged[renId][0] - 70) <= 12, `${dragged[kaiId]} → ${panned[kaiId]}`);

  // Leave to edit, come back: same view
  await clickNode('Kai');
  await inspector.locator('h2', { hasText: 'Kai' }).waitFor();
  const zoomKept = await gc.getAttribute('data-zoom');
  await inspector.getByRole('link', { name: 'Open character profile' }).click();
  await page.locator('.vault-header h1', { hasText: 'Kai' }).waitFor();
  check('the trail offers the way back to the graph', (await page.locator('.trail .trail-back').innerText()) === '← Back to Story graph');
  await page.locator('.trail .trail-back').click();
  await inspector.locator('h2', { hasText: 'Kai' }).waitFor();
  await settled();
  const returned = await layout();
  check('coming back from an edit restores the selection, zoom and positions', (await gc.getAttribute('data-zoom')) === zoomKept && Math.abs(returned[renId][0] - panned[renId][0]) <= 25 && Math.abs(returned[renId][1] - panned[renId][1]) <= 25, `${panned[renId]} → ${returned[renId]}`);

  // A large project: folding and frame rate
  const pBig = await createProject('Big Web');
  await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks'], 'readwrite');
      const entry = (i, category) => ({ id: `big-${i}`, projectId, category, name: `${category} ${i}`, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 });
      let made = 0;
      // 30 hubs, each with 12 minor entries hanging off it, and the hubs joined to each other: 390 nodes.
      for (let h = 0; h < 30; h++) {
        tx.objectStore('loreEntries').add(entry(made, 'character'));
        const hub = made++;
        if (h) tx.objectStore('loreLinks').add({ id: `bl-h${h}`, projectId, fromId: `big-${hub}`, toId: `big-${(h - 1) * 13}`, fromLabel: 'ally', toLabel: '', createdAt: 0 });
        if (h > 4) tx.objectStore('loreLinks').add({ id: `bl-x${h}`, projectId, fromId: `big-${hub}`, toId: `big-${(h - 5) * 13}`, fromLabel: 'knows', toLabel: '', createdAt: 0 });
        for (let l = 0; l < 12; l++) {
          tx.objectStore('loreEntries').add(entry(made, l % 2 ? 'item' : 'location'));
          tx.objectStore('loreLinks').add({ id: `bl-${made}`, projectId, fromId: `big-${made}`, toId: `big-${hub}`, fromLabel: '', toLabel: '', createdAt: 0 });
          made++;
        }
      }
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), pBig);
  await page.goto(`${BASE}/project/${pBig}/graph`);
  await settled();
  check('a large graph folds minor nodes around their hubs', (await graphStatus()) === '90 nodes · 114 links · minor nodes folded', await graphStatus());
  const frames = async (interact) => {
    await page.evaluate(() => {
      window.__frames = [];
      let last = performance.now();
      const tick = (now) => { window.__frames.push(now - last); last = now; window.__raf = requestAnimationFrame(tick); };
      window.__raf = requestAnimationFrame(tick);
    });
    await interact();
    return page.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      const f = window.__frames.slice(2).sort((a, b) => a - b);
      return { average: f.reduce((n, x) => n + x, 0) / f.length, worst: f[Math.floor(f.length * 0.95)], count: f.length };
    });
  };
  const bigBox = await gc.boundingBox();
  const sweep = async () => {
    await page.mouse.move(bigBox.x + 20, bigBox.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 60; i++) await page.mouse.move(bigBox.x + 20 + i * 5, bigBox.y + 20 + Math.sin(i / 6) * 60);
    await page.mouse.up();
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, i % 2 ? 120 : -120);
  };
  const foldedFps = await frames(sweep);
  // Open every hub: all 390 nodes on the canvas at once.
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Fit' }).click();
    await settled();
    await page.waitForTimeout(250);
    const positions = await layout();
    // A folded group can sit under another node; try the ones on screen until one opens.
    const candidates = Object.keys(positions).filter((id) => id.startsWith('cluster:') && positions[id][0] > 20 && positions[id][0] < bigBox.width - 20 && positions[id][1] > 20 && positions[id][1] < bigBox.height - 20);
    if (!candidates.length) break;
    const shown = Number((await graphStatus()).split(' ')[0]);
    for (const id of candidates.slice(0, 6)) {
      await page.mouse.click(bigBox.x + positions[id][0], bigBox.y + positions[id][1]);
      await page.waitForTimeout(200);
      if (Number((await graphStatus()).split(' ')[0]) > shown) break;
    }
  }
  await settled();
  check('a folded group opens when clicked', Number((await graphStatus()).split(' ')[0]) > 90, await graphStatus());
  const openFps = await frames(sweep);
  console.log(`      graph frame times while panning and zooming (headless, software-rendered): folded avg ${foldedFps.average.toFixed(1)}ms / 95th ${foldedFps.worst.toFixed(1)}ms; partly opened avg ${openFps.average.toFixed(1)}ms / 95th ${openFps.worst.toFixed(1)}ms`);
  check('panning and zooming a large graph stays smooth', foldedFps.average < 25 && openFps.average < 25, `${foldedFps.average.toFixed(1)}ms, ${openFps.average.toFixed(1)}ms`);
  await shot('graph-large');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(graphUrl);
  await settled();
  check('mobile: the graph and its inspector fit the screen', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await gc.boundingBox()).width <= 390 && (await inspector.isVisible()));
  await shot('mobile-graph');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 16: plot threads ---
  const p16 = await createProject('Threadbare');
  await page.goto(`${BASE}/project/${p16}/codex`);
  await newCharacter('Mira');
  await newEntry('Location', 'The Palace');
  // Forty chapters, the first thirty of them written.
  await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction('chapters', 'readwrite');
      for (let i = 0; i < 40; i++) {
        tx.objectStore('chapters').add({ id: `${projectId}-c${String(i + 1).padStart(2, '0')}`, projectId, parentId: null, kind: 'chapter', title: `Chapter ${i + 1}`, order: i, summary: '', notes: '', status: 'drafting', wordCount: i < 30 ? 120 : 0, charCount: 0, createdAt: 1, updatedAt: 1 });
      }
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p16);
  const stored16 = (store) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === projectId)); };
    };
  }), [p16, store]);
  const manuscript16 = JSON.stringify([await stored16('chapters'), await stored16('chapterContents')]);

  const plotUrl = `${BASE}/project/${p16}/plot`;
  await page.goto(plotUrl);
  await page.getByText('Keep every promise you make').waitFor();
  check('plot threads has its own page in the sidebar', await page.locator('.sidebar nav a', { hasText: 'Plot threads' }).isVisible());
  const td = page.locator('.rel-drawer');
  const threadCard = (title) => page.locator('.thread').filter({ has: page.locator('.thread-title', { hasText: new RegExp(`^${title}$`) }) });
  const plotStatus = async () => (await page.locator('.plot-page .page-header [role=status]').innerText()).replace(/\s+/g, ' ');
  const alerts = () => page.locator('.plot-alerts li').evaluateAll((els) => els.map((el) => el.textContent));
  const newThread = async (title) => {
    await page.getByRole('button', { name: 'New thread' }).click();
    await td.getByLabel('Thread title').waitFor();
    await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'New thread');
    await td.getByLabel('Thread title').fill(title);
    await td.getByLabel('Thread title').blur();
    await threadCard(title).waitFor();
  };
  const develop = async (chapter, title) => {
    const count = await td.locator('.beat-list > li').count();
    await td.getByLabel('Chapter for the new development').selectOption({ label: chapter });
    await td.getByLabel('New development', { exact: true }).fill(title);
    await td.getByRole('button', { name: 'Add development' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.rel-drawer .beat-list > li').length === n + 1, count);
  };
  const track = (title) => threadCard(title).locator('.thread-track li').evaluateAll((els) => els.map((el) => el.textContent.replace(/^(Ch \d+)/, '$1: ')));

  await newThread('The Missing Prince');
  check('a new thread starts as Planned', (await td.getByLabel('Status').inputValue()) === 'planned' && (await plotStatus()) === '1 thread · 0 active', await plotStatus());
  eq('every category and status from the brief is offered', [
    await td.getByLabel('Category').locator('option').allInnerTexts(),
    await td.getByLabel('Status').locator('option').allInnerTexts(),
  ], [
    ['Main Plot', 'Subplot', 'Character Arc', 'Mystery', 'Romance', 'Conflict', 'Foreshadowing', 'Political Storyline', 'Worldbuilding Storyline', 'Villain Storyline', 'Personal Goal', 'Custom'],
    ['Planned', 'Active', 'Paused', 'Resolved', 'Abandoned', 'Retconned', 'Custom'],
  ]);
  await td.getByLabel('Category').selectOption('mystery');
  await td.getByLabel('Objective or premise').fill('The heir vanished on the eve of the coronation. Who took him?');
  await td.getByLabel('Objective or premise').blur();
  await td.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await td.getByLabel('Add a location').selectOption({ label: 'The Palace' });
  await td.getByLabel('Meant to resolve in').selectOption({ label: 'Chapter 36' });
  // Added out of order on purpose: they are shown in reading order.
  await develop('Chapter 18', 'Organization linked');
  await develop('Chapter 3', 'Disappearance');
  await develop('Chapter 35', 'Prince returns');
  await develop('Chapter 10', 'Symbol discovered');
  eq('developments are mapped to chapters and shown in reading order', await track('The Missing Prince'), ['Ch 3: Disappearance', 'Ch 10: Symbol discovered', 'Ch 18: Organization linked', 'Ch 35: Prince returns']);
  const princeCard = (await threadCard('The Missing Prince').innerText()).replace(/\s+/g, ' ');
  check('the card shows category, status, premise, cast and target', ['MYSTERY', 'PLANNED', 'The heir vanished', 'Mira · Resolves: Chapter 36'].every((part) => princeCard.toUpperCase().includes(part.toUpperCase())), princeCard);
  eq('a planned thread with developments in written chapters is pointed out', await alerts(), ['The Missing PrinceMarked Planned, and it already has 3 developments in chapters that are written.']);
  await td.getByLabel('Status').selectOption('active');
  await page.locator('.plot-alerts').waitFor({ state: 'detached' });
  check('choosing Active clears that note', (await plotStatus()) === '1 thread · 1 active', await plotStatus());

  await td.getByLabel('Note for development 2').fill('Carved under the windowsill.');
  await td.getByLabel('Note for development 2').blur();
  await td.getByLabel('Title of development 2').fill('Symbol found');
  await td.getByLabel('Title of development 2').blur();
  await threadCard('The Missing Prince').locator('.thread-track li', { hasText: 'Symbol found' }).waitFor();
  await td.getByLabel('Chapter for development 2').selectOption({ label: 'Chapter 12' });
  await threadCard('The Missing Prince').locator('.thread-track li', { hasText: 'Ch 12' }).waitFor();
  eq('a development can be renamed and moved to another chapter', await track('The Missing Prince'), ['Ch 3: Disappearance', 'Ch 12: Symbol found', 'Ch 18: Organization linked', 'Ch 35: Prince returns']);

  await threadCard('The Missing Prince').locator('.thread-track a', { hasText: 'Symbol found' }).click();
  await page.waitForURL(new RegExp(`/manuscript/${p16}-c12$`));
  await page.locator('.manuscript-text').waitFor();
  check('a development opens its chapter in the manuscript', page.url().endsWith(`${p16}-c12`) && (await page.locator('.manuscript-text').isVisible()));
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.locator('.linked-threads li').waitFor();
  check('the chapter\'s plan lists the threads that develop in it', (await page.locator('.linked-threads li').innerText()).replace(/\s+/g, ' ') === 'The Missing Prince Mystery · Active · Symbol found', await page.locator('.linked-threads li').innerText());
  await page.locator('.linked-threads li a').click();
  await td.getByLabel('Thread title').waitFor();
  check('…and leads back to the thread', (await td.getByLabel('Thread title').inputValue()) === 'The Missing Prince' && (await td.locator('.beat-list a', { hasText: 'Open ' }).nth(1).innerText()) === 'Open Chapter 12 →', await td.locator('.beat-list a', { hasText: 'Open ' }).nth(1).innerText());

  // A storyline that was set up and then left alone.
  await newThread('Old Grudge');
  await td.getByLabel('Status').selectOption('active');
  await develop('Chapter 5', 'The insult');
  await page.locator('.plot-alerts li').waitFor();
  eq('an active thread quiet for 20+ chapters is flagged', await alerts(), ['Old GrudgeActive, with no development recorded for 25 chapters: the last was “The insult” in chapter 5, and the manuscript has reached chapter 30.']);
  check('the header counts what there is to check', (await plotStatus()) === '2 threads · 2 active · 1 to check', await plotStatus());
  check('the flag is on the card and in the details too', (await threadCard('Old Grudge').locator('.event-flag').count()) === 1 && (await td.locator('.event-issues li').count()) === 1 && (await threadCard('The Missing Prince').locator('.event-flag').count()) === 0);
  await shot('plot');
  const statuses = async () => Object.fromEntries((await stored16('plotThreads')).map((t) => [t.title, t.status]).sort((a, b) => a[0].localeCompare(b[0])));
  eq('flagging a thread leaves its status as the author set it', await statuses(), { 'Old Grudge': 'active', 'The Missing Prince': 'active' });

  await page.getByLabel('Flag quiet threads after').selectOption('30');
  await page.locator('.plot-alerts').waitFor({ state: 'detached' });
  await page.getByLabel('Flag quiet threads after').selectOption('15');
  await page.locator('.plot-alerts li').nth(1).waitFor();
  eq('the author chooses how long is too long', (await alerts()).map((a) => a.split(',')[0]), ['Old GrudgeActive', 'The Missing PrinceGoes 17 chapters without a development']);
  await page.getByLabel('Flag quiet threads after').selectOption('20');
  await page.waitForFunction(() => document.querySelectorAll('.plot-alerts li').length === 1);

  await td.getByLabel("Don't flag this thread").click();
  await page.locator('.plot-alerts').waitFor({ state: 'detached' });
  check('a thread can be told to stay quiet', (await td.locator('label.check').innerText()).includes('1 held back') && (await plotStatus()) === '2 threads · 2 active', await plotStatus());
  await td.getByLabel("Don't flag this thread").click();
  await page.locator('.plot-alerts li').waitFor();

  await newThread('Slow Burn');
  await td.getByLabel('Category').selectOption('romance');
  await td.getByLabel('Status').selectOption('paused');
  await td.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await newThread('Dead End');
  await td.getByLabel('Status').selectOption('abandoned');
  await td.getByLabel('Category').selectOption('custom');
  await td.getByLabel('Category name').fill('Prophecy');
  await td.getByLabel('Category name').blur();
  await threadCard('Dead End').locator('.badge', { hasText: 'Prophecy' }).waitFor();
  const sections = () => page.locator('.thread-group').evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label')}: ${[...el.querySelectorAll('.thread-title')].map((t) => t.textContent).join(', ')}`));
  eq('the dashboard groups threads by status', await sections(), ['Active: Old Grudge, The Missing Prince', 'Paused: Slow Burn', 'Abandoned: Dead End']);
  await page.getByRole('radio', { name: 'Category', exact: true }).click();
  eq('…or by category, with custom names', await sections(), ['Subplot: Old Grudge', 'Mystery: The Missing Prince', 'Romance: Slow Burn', 'Prophecy: Dead End']);
  await page.getByRole('radio', { name: 'Character', exact: true }).click();
  eq('…or by character', await sections(), ['Mira: Slow Burn, The Missing Prince', 'No character attached: Dead End, Old Grudge']);
  await page.getByRole('radio', { name: 'Status', exact: true }).click();

  await page.getByLabel('Filter by status').selectOption('paused');
  eq('threads filter by status', await sections(), ['Paused: Slow Burn']);
  await page.getByLabel('Filter by status').selectOption('');
  await page.getByLabel('Search threads').fill('symbol');
  eq('search reaches into developments', await sections(), ['Active: The Missing Prince']);
  await page.getByLabel('Search threads').fill('');
  await page.getByLabel('To check only').check();
  eq('the list can be narrowed to flagged threads', await sections(), ['Active: Old Grudge']);
  await page.getByLabel('To check only').uncheck();

  await threadCard('Old Grudge').locator('.thread-title').click();
  await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'Old Grudge');
  await td.getByLabel('Status').selectOption('resolved');
  await page.locator('.plot-alerts').waitFor({ state: 'detached' });
  eq('resolving it is the author\'s decision, and ends the flag', [await sections(), (await statuses())['Old Grudge']], [['Active: The Missing Prince', 'Paused: Slow Burn', 'Resolved: Old Grudge', 'Abandoned: Dead End'], 'resolved']);

  await page.reload();
  await threadCard('Slow Burn').waitFor();
  eq('threads, developments and the open thread survive a reload', [await sections(), await track('The Missing Prince'), await td.getByLabel('Thread title').inputValue()], [
    ['Active: The Missing Prince', 'Paused: Slow Burn', 'Resolved: Old Grudge', 'Abandoned: Dead End'],
    ['Ch 3: Disappearance', 'Ch 12: Symbol found', 'Ch 18: Organization linked', 'Ch 35: Prince returns'],
    'Old Grudge',
  ]);

  await page.goto(`${BASE}/project/${p16}/characters`);
  await openCharacter('Mira');
  const threads16 = page.locator('.vault-profile').getByRole('region', { name: 'Plot threads', exact: true });
  await threads16.locator('.vault-rows li').first().waitFor();
  eq('a character lists the threads they are part of, with their status', (await threads16.locator('.vault-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim().toLowerCase()).sort(), ['slow burn paused', 'the missing prince active']);
  await threads16.getByRole('link', { name: 'Slow Burn' }).click();
  await page.waitForURL(/\/plot\?thread=/);
  await td.getByLabel('Thread title').waitFor();
  check('…and opens them', (await td.getByLabel('Thread title').inputValue()) === 'Slow Burn');

  await threadCard('Dead End').locator('.thread-title').click();
  await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'Dead End');
  await td.getByRole('button', { name: 'Delete thread…' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Delete thread', exact: true }).click();
  await threadCard('Dead End').waitFor({ state: 'detached' });
  check('a thread can be deleted', (await plotStatus()) === '3 threads · 1 active' && (await td.count()) === 0, await plotStatus());
  check('nothing on this page ever touched the manuscript', JSON.stringify([await stored16('chapters'), await stored16('chapterContents')]) === manuscript16);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(plotUrl);
  await threadCard('Slow Burn').waitFor();
  const fits16 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await threadCard('The Missing Prince').locator('.thread-title').click();
  await page.locator('dialog').getByLabel('Thread title').waitFor();
  check('mobile: the dashboard fits and a thread opens as a sheet', fits16 && (await page.locator('dialog .beat-list > li').count()) === 4 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-plot');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 17: canon ---
  const p17 = await createProject('Truthbook');
  await page.goto(`${BASE}/project/${p17}/codex`);
  await newCharacter('Alex');
  await newEntry('Location', 'Royal Academy');
  // Two chapters with saved text, so a source can be pinned to a paragraph.
  await page.evaluate((projectId) => new Promise((resolve) => {
    const para = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents'], 'readwrite');
      [['Chapter 3', ['Rain fell on the quad.']], ['Chapter 4', ['The gates stood open.', '', 'The Academy had stood for five centuries, the porter said.', 'Nobody believed him.']]].forEach(([title, lines], i) => {
        const id = `${projectId}-k${i}`;
        tx.objectStore('chapters').add({ id, projectId, parentId: null, kind: 'chapter', title, order: i, summary: '', notes: '', status: 'drafting', wordCount: 12, charCount: 60, createdAt: 1, updatedAt: 1 });
        tx.objectStore('chapterContents').add({ id, projectId, doc: { type: 'doc', content: lines.map(para) }, rev: 1, savedAt: 1 });
      });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p17);
  const stored17 = (store) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === projectId)); };
    };
  }), [p17, store]);
  const untouched17 = async () => JSON.stringify([await stored17('chapters'), await stored17('chapterContents'), (await stored17('loreEntries')).map((e) => [e.id, e.name, e.fields, e.description])]);
  const worldBefore = await untouched17();
  const factNamed = async (subject, statement) => (await stored17('canonFacts')).find((f) => f.subject === subject && (statement === undefined || f.statement === statement));

  const canonUrl = `${BASE}/project/${p17}/canon`;
  await page.goto(canonUrl);
  await page.getByText('What is true in your world').waitFor();
  check('canon has its own page in the sidebar', await page.locator('.sidebar nav a', { hasText: /^Canon$/ }).isVisible());
  const fd = page.locator('.rel-drawer');
  const factCard = (statement) => page.locator('.fact').filter({ has: page.locator('.fact-statement', { hasText: statement }) });
  const canonStatus = async () => (await page.locator('.canon-page .page-header [role=status]').innerText()).replace(/\s+/g, ' ');
  const canonGroups = () => page.locator('.thread-group').evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label')}: ${[...el.querySelectorAll('.fact-statement')].map((t) => t.textContent).join(' | ')}`));
  const historySteps = () => fd.locator('.canon-history li').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).join(' ')));
  const setStatus17 = async (label) => {
    await fd.getByRole('radio', { name: label, exact: true }).click();
    await fd.locator('.details-head .thread-status', { hasText: new RegExp(`^${label}$`, 'i') }).waitFor();
  };
  const newFact = async (subject, statement) => {
    await page.getByRole('button', { name: 'New fact' }).click();
    await fd.getByLabel('Subject').waitFor();
    await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'New fact');
    await fd.getByLabel('Subject').fill(subject);
    await fd.getByLabel('Subject').blur();
    await fd.getByLabel('Statement', { exact: true }).fill(statement);
    await fd.getByLabel('Statement', { exact: true }).blur();
    await factCard(statement).waitFor();
  };

  await newFact('Royal Academy foundation', 'Founded 500 years ago');
  eq('every canon status is offered, and a new fact starts as Provisional', [await fd.getByRole('radio').allInnerTexts(), await fd.getByRole('radio', { checked: true }).innerText()], [['Canon', 'Provisional', 'Non-Canon', 'Retconned', 'Conflicting'], 'Provisional']);
  await fd.getByLabel('Kind', { exact: true }).selectOption('lore');
  await fd.getByLabel('Add a codex entry this is about').selectOption({ label: 'Royal Academy' });
  await setStatus17('Canon');
  check('a canon statement is on the record: it is revised, not typed over', (await fd.getByLabel('Statement', { exact: true }).count()) === 0 && (await fd.locator('.canon-statement').innerText()) === 'Founded 500 years ago' && (await fd.getByRole('button', { name: 'Revise this statement…' }).isVisible()));

  // Sources: a paragraph of the manuscript, a codex profile, and a note
  await fd.getByLabel('Kind of source').selectOption('chapter');
  await fd.getByLabel('Source', { exact: true }).selectOption({ label: 'Chapter 4' });
  await fd.getByLabel('Quote').fill('stood for five centuries');
  await fd.getByRole('button', { name: 'Add source' }).click();
  await fd.locator('.source-list li').first().waitFor();
  await fd.getByLabel('Kind of source').selectOption('entry');
  await fd.getByLabel('Source', { exact: true }).selectOption({ label: 'Royal Academy' });
  await fd.getByRole('button', { name: 'Add source' }).click();
  await fd.locator('.source-list li').nth(1).waitFor();
  await fd.getByLabel('Kind of source').selectOption('note');
  await fd.getByLabel('Source description').fill('Series bible, p. 12');
  await fd.getByRole('button', { name: 'Add source' }).click();
  await fd.locator('.source-list li').nth(2).waitFor();
  const sourcesOf = (statement) => factCard(statement).locator('.fact-sources li').allInnerTexts();
  eq('a fact shows where it was established, down to the paragraph', await sourcesOf('Founded 500 years ago'), ['Chapter 4 (paragraph 3)', 'Royal Academy (Location profile)', 'Series bible, p. 12']);
  await fd.getByLabel('Kind of source').selectOption('chapter');
  await fd.getByLabel('Source', { exact: true }).selectOption({ label: 'Chapter 3' });
  await fd.getByLabel('Quote').fill('words that are not there');
  await fd.getByRole('button', { name: 'Add source' }).click();
  await fd.locator('.source-list li').nth(3).waitFor();
  check('a quote that is not in the chapter is said so, and the chapter is linked as a whole', (await fd.locator('.plan-group [role=status]').innerText()).includes('were not found in Chapter 3') && (await sourcesOf('Founded 500 years ago'))[3] === 'Chapter 3');
  await fd.getByRole('button', { name: 'Remove source Chapter 3' }).click();
  await fd.locator('.source-list li').nth(3).waitFor({ state: 'detached' });

  await factCard('Founded 500 years ago').locator('.fact-sources a', { hasText: 'Chapter 4' }).click();
  await page.waitForURL(new RegExp(`/manuscript/${p17}-k1$`));
  await page.locator('.find-match').first().waitFor();
  check('the manuscript source opens the chapter at the quoted words', (await page.locator('.find-match').first().innerText()) === 'stood for five centuries' && (await paragraphs())[2] === 'The Academy had stood for five centuries, the porter said.', await page.locator('.find-match').first().innerText());
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.locator('.linked-facts li').waitFor();
  check('the chapter lists the canon it establishes', (await page.locator('.linked-facts li').innerText()).replace(/\s+/g, ' ') === 'Royal Academy foundation CANON Founded 500 years ago', (await page.locator('.linked-facts li').innerText()).replace(/\s+/g, ' '));
  await page.locator('.linked-facts li a').click();
  await fd.getByLabel('Subject').waitFor();
  await factCard('Founded 500 years ago').locator('.fact-sources a', { hasText: 'Royal Academy' }).click();
  await page.waitForURL(/\/codex\/[\w-]+$/);
  check('the profile source opens the codex entry', (await field('Name').inputValue()) === 'Royal Academy');
  await page.goBack();
  await fd.getByLabel('Subject').waitFor();

  // Retcon: 500 years becomes 1,000, and the old statement is archived
  await fd.getByRole('button', { name: 'Revise this statement…' }).click();
  await fd.getByLabel('New statement').fill('Founded 1,000 years ago');
  await fd.getByLabel('Reason for the change', { exact: true }).fill('It has to predate the First Empire');
  check('the author is told the old statement will be kept', (await fd.locator('form.plan-group').innerText()).includes('archived as Retconned'));
  await fd.getByRole('button', { name: 'Archive and replace' }).click();
  await factCard('Founded 1,000 years ago').waitFor();
  eq('the canon history shows how the fact evolved', await historySteps(), [
    'Recorded as Provisional',
    'Moved from Provisional to Canon',
    'Retconned “Founded 500 years ago” → “Founded 1,000 years ago”',
  ]);
  const academyFact = await factNamed('Royal Academy foundation');
  const retcon17 = academyFact.history[2];
  check('the prior statement is archived as retconned with a time and the reason', academyFact.statement === 'Founded 1,000 years ago' && academyFact.status === 'canon' && retcon17.kind === 'retcon' && retcon17.statement === 'Founded 500 years ago' && retcon17.reason === 'It has to predate the First Empire' && Date.now() - retcon17.at < 60000 && (await fd.locator('.canon-history li').nth(2).locator('time').innerText()).length > 8, JSON.stringify(retcon17));
  check('the card says it was revised', (await factCard('Founded 1,000 years ago').innerText()).includes('About Royal Academy · Revised once'), await factCard('Founded 1,000 years ago').innerText());

  const stepNote = fd.locator('.canon-history li').nth(1).locator('input');
  await stepNote.fill('Confirmed after the outline review');
  await stepNote.blur();
  await page.waitForTimeout(300);
  await fd.getByRole('button', { name: 'Revise this statement…' }).click();
  await fd.getByLabel('New statement').fill('Founded one thousand years ago');
  await fd.getByLabel('Only correcting the wording').check();
  await fd.getByRole('button', { name: 'Save rewording' }).click();
  await factCard('Founded one thousand years ago').waitFor();
  const reworded = await factNamed('Royal Academy foundation');
  eq('a reason can be added later, and a rewording is kept apart from a retcon', reworded.history.map((c) => `${c.kind}|${c.statement}|${c.reason}`), [
    'created||',
    'status|Founded 500 years ago|Confirmed after the outline review',
    'retcon|Founded 500 years ago|It has to predate the First Empire',
    'reworded|Founded 1,000 years ago|',
  ]);

  // A second statement that disagrees
  await newFact('Royal Academy foundation', 'Founded 300 years ago');
  await fd.getByLabel('Add a codex entry this is about').selectOption({ label: 'Royal Academy' });
  check('two drafts-versus-canon statements are compared', (await page.locator('.plot-alerts li').count()) === 1);
  await setStatus17('Canon');
  await fd.locator('.canon-flags li').waitFor();
  eq('a possible contradiction is described neutrally, naming where canon was established', await fd.locator('.canon-flags li > span:first-child').allInnerTexts(), ['This statement appears to conflict with established canon in Chapter 4: “Founded one thousand years ago”.']);
  check('the review panel lists the pair once and leaves the decision to the author', (await page.locator('.plot-alerts li').count()) === 1 && (await page.locator('.plot-alerts li').innerText()).includes('appear to conflict') && (await page.locator('.plot-alerts').innerText()).includes('observations, not rulings') && (await canonStatus()) === '2 facts · 2 canon · 2 to review', await canonStatus());
  eq('noticing a contradiction changes neither statement nor status', (await stored17('canonFacts')).map((f) => `${f.statement}:${f.status}`).sort(), ['Founded 300 years ago:canon', 'Founded one thousand years ago:canon']);
  await shot('canon');

  await fd.getByRole('button', { name: 'Not a conflict' }).click();
  await page.locator('.plot-alerts').waitFor({ state: 'detached' });
  check('the author can set an observation aside', (await canonStatus()) === '2 facts · 2 canon' && (await fd.getByText('1 possible contradiction set aside.').isVisible()));
  await fd.getByRole('button', { name: 'Show again' }).click();
  await page.locator('.plot-alerts li').waitFor();
  await fd.getByRole('button', { name: 'Open the other statement' }).click();
  await page.waitForFunction(() => document.querySelector('.rel-drawer .canon-statement')?.textContent === 'Founded one thousand years ago');
  check('…or open the other statement to compare', (await fd.locator('.canon-flags li > span:first-child').innerText()) === 'This statement appears to conflict with another statement marked Canon: “Founded 300 years ago”.', await fd.locator('.canon-flags li > span:first-child').innerText());

  // The author rules: the newer claim is the mistake
  await factCard('Founded 300 years ago').locator('.thread-title').click();
  await page.waitForFunction(() => document.querySelector('.rel-drawer .canon-statement')?.textContent === 'Founded 300 years ago');
  await setStatus17('Conflicting');
  check('marking it Conflicting is the author\'s call, and it stays under review', (await page.locator('.plot-alerts li').count()) === 1 && (await canonStatus()) === '2 facts · 1 canon · 2 to review', await canonStatus());
  await setStatus17('Retconned');
  await page.locator('.plot-alerts').waitFor({ state: 'detached' });
  await fd.getByLabel('Replaced by').selectOption({ index: 1 });
  await page.waitForTimeout(300);
  const replaced = await factNamed('Royal Academy foundation', 'Founded 300 years ago');
  check('retconning one of them resolves it, and it can name its replacement', replaced.status === 'retconned' && replaced.replacedById === reworded.id && (await canonStatus()) === '2 facts · 1 canon', JSON.stringify([replaced.status, replaced.replacedById]));

  await newFact('Magic price', 'Every spell costs a memory');
  await fd.getByLabel('Kind', { exact: true }).selectOption('rule');
  await fd.getByLabel('Statement', { exact: true }).fill('Every spell costs a memory of joy');
  await fd.getByLabel('Statement', { exact: true }).blur();
  await factCard('Every spell costs a memory of joy').waitFor();
  check('a provisional idea can be rewritten freely', (await factNamed('Magic price')).history.length === 1);
  await newFact('Alex is the lost heir', 'Alex is secretly the heir');
  await fd.getByLabel('Add a codex entry this is about').selectOption({ label: 'Alex' });
  await setStatus17('Non-Canon');
  eq('facts are grouped by canon status', await canonGroups(), ['Canon: Founded one thousand years ago', 'Provisional: Every spell costs a memory of joy', 'Retconned: Founded 300 years ago', 'Non-Canon: Alex is secretly the heir']);
  eq('the status filter counts each kind', await page.getByLabel('Filter by canon status').locator('option').allInnerTexts(), ['Every status (4)', 'Conflicting (0)', 'Canon (1)', 'Provisional (1)', 'Retconned (1)', 'Non-Canon (1)']);
  await page.getByLabel('Filter by canon status').selectOption('provisional');
  eq('facts filter by status', await canonGroups(), ['Provisional: Every spell costs a memory of joy']);
  await page.getByLabel('Filter by canon status').selectOption('');
  await page.getByLabel('Filter by kind').selectOption('rule');
  eq('…by kind', await canonGroups(), ['Provisional: Every spell costs a memory of joy']);
  await page.getByLabel('Filter by kind').selectOption('');
  await page.getByLabel('Filter by codex entry').selectOption({ label: 'Alex' });
  eq('…and by what they are about', await canonGroups(), ['Non-Canon: Alex is secretly the heir']);
  await page.getByLabel('Filter by codex entry').selectOption('');
  await page.getByLabel('Search facts').fill('500 years');
  eq('search finds a fact by wording it no longer has', await canonGroups(), ['Canon: Founded one thousand years ago']);
  await page.getByLabel('Search facts').fill('');

  await page.reload();
  await factCard('Founded one thousand years ago').waitFor();
  await factCard('Founded one thousand years ago').locator('.thread-title').click();
  await fd.locator('.canon-history li').nth(3).waitFor();
  check('facts, sources and history survive a reload', (await canonGroups()).length === 4 && (await historySteps()).length === 4 && (await sourcesOf('Founded one thousand years ago')).length === 3);

  // The entry's profile carries its canon and the history of it
  await page.goto(`${BASE}/project/${p17}/codex`);
  await page.locator('.entry-list a', { hasText: 'Royal Academy' }).click();
  await page.locator('.entry-canon .char-relations li').first().waitFor();
  eq('an entry profile lists the facts about it with their status', await page.locator('.entry-canon .char-relations li').evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim())), ['Royal Academy foundation CanonFounded one thousand years ago', 'Royal Academy foundation RetconnedFounded 300 years ago']);
  const profileHistory = await page.locator('.entry-canon .canon-history li').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).join(' / ')));
  check('…and a canon history timeline with the retcon and its reason', profileHistory.includes('Retconned “Founded 500 years ago” → “Founded 1,000 years ago” / It has to predate the First Empire') && profileHistory.includes('Moved from Conflicting to Retconned') && (await page.locator('.entry-canon h4').innerText()) === 'Canon history', profileHistory.join('\n      '));
  await page.getByRole('button', { name: 'Record a fact about Royal Academy' }).click();
  await page.waitForURL(/\/canon\?fact=/);
  await fd.getByLabel('Subject').waitFor();
  check('a fact can be recorded from the profile, already linked and sourced', (await fd.locator('.entity-chips').innerText()).includes('Royal Academy') && (await fd.locator('.source-list li').innerText()).includes('Royal Academy (Location profile)'));
  await fd.getByRole('button', { name: 'Delete fact…' }).click();
  check('deleting warns that the history goes too', (await page.locator('dialog').innerText()).includes('mark it Non-Canon or Retconned instead'));
  await page.locator('dialog').getByRole('button', { name: 'Delete fact and history' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.fact').length === 4);
  check('a fact can be deleted', (await canonStatus()) === '4 facts · 1 canon' && (await fd.count()) === 0, await canonStatus());
  check('nothing on the canon page touched the manuscript or the codex', (await untouched17()) === worldBefore);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(canonUrl);
  await factCard('Founded one thousand years ago').waitFor();
  const fits17 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await factCard('Founded one thousand years ago').locator('.thread-title').click();
  await page.locator('dialog .canon-history li').nth(3).waitFor();
  check('mobile: canon fits and a fact opens as a sheet', fits17 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await page.locator('dialog [role=radio]').count()) === 5);
  await shot('mobile-canon');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 18: continuity checker ---
  const p18 = await createProject('Ledger of Errors');
  await page.evaluate((projectId) => new Promise((resolve) => {
    const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const text = [
      ['They left the Capital at noon.', 'Two hours later the Academy gates rose ahead.'],
      ['Mira fell and did not rise.', 'The Sunblade sank into the lake.'],
      ['The lab was sealed, far underground.', 'Bren called on Solar Absorption.'],
      ['They spoke of Mira often.'],
      ['"You came," said Mira.', 'Bren drew the Sunblade.', 'Mira was nineteen years old.'],
      ['Nothing happened.'],
    ];
    const lore = [['mira', 'character', 'Mira', [{ id: 'age', key: 'Age', value: '17' }]], ['bren', 'character', 'Bren', []], ['sunblade', 'item', 'Sunblade', []], ['capital', 'location', 'Capital', []], ['academy', 'location', 'Academy', []], ['solar', 'power', 'Solar Absorption', []]];
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'loreEntries'], 'readwrite');
      text.forEach((lines, i) => {
        const id = `${projectId}-c${i + 1}`;
        tx.objectStore('chapters').add({ id, projectId, parentId: null, kind: 'chapter', title: `Chapter ${i + 1}`, order: i, summary: '', notes: '', status: 'drafting', wordCount: 10, charCount: 50, createdAt: 1, updatedAt: 1 });
        tx.objectStore('chapterContents').add({ id, projectId, doc: { type: 'doc', content: lines.map(para) }, rev: 1, savedAt: 1 });
      });
      for (const [key, category, name, fields] of lore) {
        tx.objectStore('loreEntries').add({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields, createdAt: 1, updatedAt: 1 });
      }
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p18);
  const stored18 = (store) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === projectId)); };
    };
  }), [p18, store]);
  const text18 = async () => JSON.stringify([await stored18('chapters'), await stored18('chapterContents')]);
  const canon18 = async () => JSON.stringify([await stored18('loreEntries'), (await stored18('continuityRules')).map(({ updatedAt, ...rule }) => rule)]);
  const textBefore = await text18();

  const continuityUrl = `${BASE}/project/${p18}/continuity`;
  const cp = page.locator('.continuity-page');
  /** Does something, then waits for the check it sets off to finish. */
  const afterCheck = async (action) => {
    const runs = Number(await cp.getAttribute('data-runs'));
    await action();
    await page.waitForFunction((n) => Number(document.querySelector('.continuity-page')?.dataset.runs) > n && document.querySelector('.continuity-page [role=status]')?.getAttribute('aria-busy') === 'false', runs);
    await page.waitForTimeout(150);
  };
  const tally = async () => (await cp.locator('.page-header [role=status]').innerText()).replace(/\s+/g, ' ');
  const findings = () => cp.locator('.issue').evaluateAll((els) => els.map((el) => `${el.querySelector('.thread-status').textContent.toUpperCase()} | ${el.querySelector('.issue-where').textContent.replace(/\s+/g, ' ').trim()} | ${el.querySelector('.issue-message').textContent}`));
  const issueCard = (words) => cp.locator('.issue', { hasText: words });
  const tabTo = async (name) => {
    await cp.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
    await cp.locator('[role=tab][aria-selected=true]', { hasText: name }).waitFor();
    await page.waitForTimeout(150);
  };
  const trackRule = async (kind, fill) => {
    await cp.getByRole('button', { name: `+ ${kind}`, exact: true }).click();
    const form = page.locator('dialog form');
    await form.waitFor();
    await fill(form);
    await afterCheck(() => form.getByRole('button', { name: 'Start tracking' }).click());
    await page.locator('dialog').waitFor({ state: 'detached' });
  };

  await page.goto(continuityUrl);
  await cp.locator('.page-header [role=status]').waitFor();
  check('continuity has its own page in the sidebar', await page.locator('.sidebar nav a', { hasText: /^Continuity$/ }).isVisible());
  eq('character profiles are checked with no setup at all', [await tally(), await findings()], ['1 open issue · 0 critical · 0 warnings · 1 info', ["INFO | Chapter 5 · paragraph 3 | Mira's age is 17 on their profile; Chapter 5 gives it as 19."]]);

  await tabTo('What is tracked');
  await trackRule('Character status', async (form) => {
    await form.getByLabel('Character', { exact: true }).selectOption({ label: 'Mira' });
    await form.getByLabel('What is true').selectOption('deceased');
    await form.getByLabel('Happens in').selectOption({ label: 'Chapter 2' });
  });
  await trackRule('Item possession', async (form) => {
    await form.getByLabel('Item', { exact: true }).selectOption({ label: 'Sunblade' });
    await form.getByLabel('What is true').selectOption('lost');
    await form.getByLabel('Happens in').selectOption({ label: 'Chapter 2' });
  });
  await cp.getByRole('button', { name: '+ Travel time', exact: true }).click();
  await page.locator('dialog form').getByRole('button', { name: 'Start tracking' }).click();
  check('a rule that cannot be checked is not accepted', (await page.locator('dialog [role=alert]').innerText()) === 'Choose where the journey starts.');
  await page.locator('dialog form').getByRole('button', { name: 'Cancel' }).click();
  await trackRule('Travel time', async (form) => {
    await form.getByLabel('From', { exact: true }).selectOption({ label: 'Capital' });
    await form.getByLabel('To', { exact: true }).selectOption({ label: 'Academy' });
    await form.getByLabel('The journey takes').fill('3');
    await form.getByLabel('Unit').selectOption('days');
  });
  await trackRule('Power or magic rule', async (form) => {
    await form.getByLabel('Ability or power').selectOption({ label: 'Solar Absorption' });
    await form.getByLabel('The rule, in your words').fill('Needs direct sunlight');
    await form.getByLabel('Cannot be used where the text mentions').fill('underground, night');
  });
  eq('the four kinds of rule are tracked', await cp.locator('.thread.tracked').evaluateAll((els) => els.map((el) => `${el.querySelector('.thread-title').textContent}: ${el.querySelector('p').textContent}`)), [
    'Mira: deceased from Chapter 2',
    'Sunblade: lost from Chapter 2',
    'Capital ↔ Academy: 3 days',
    'Solar Absorption: Needs direct sunlight · blocked by: underground, night (anywhere in the scene)',
  ]);

  await tabTo('Issues');
  eq('a check finds each kind of conflict and ranks it by severity', [await tally(), await findings()], ['6 open issues · 1 critical · 3 warnings · 2 info', [
    'CRITICAL | Chapter 5 · paragraph 1 | Mira is recorded as deceased from Chapter 2, and appears to speak or act in Chapter 5.',
    'WARNING | Chapter 1 · paragraph 2 | Travel between Capital and Academy is recorded as 3 days; Chapter 1 appears to cover it in 2 hours.',
    'WARNING | Chapter 3 · paragraph 2 | Solar Absorption has the rule “Needs direct sunlight”. It appears to be used in Chapter 3, where “underground” is mentioned (paragraph 1).',
    'WARNING | Chapter 5 · paragraph 2 | Sunblade is recorded as lost from Chapter 2, and appears to be used in Chapter 5.',
    'INFO | Chapter 4 · paragraph 1 | Mira is recorded as deceased from Chapter 2, and is mentioned in Chapter 4. Nothing to do if they are being remembered.',
    "INFO | Chapter 5 · paragraph 3 | Mira's age is 17 on their profile; Chapter 5 gives it as 19.",
  ]]);
  const critical = issueCard('appears to speak or act');
  check('an issue quotes the passage and links to the lore entry', (await critical.locator('.issue-excerpt').innerText()) === '"You came," said Mira.' && (await critical.locator('mark').innerText()) === 'Mira' && (await critical.locator('.issue-links a').getAttribute('href')) === `/project/${p18}/characters/${p18}-mira`);
  eq('every issue offers the four resolution choices', await critical.locator('.actions').first().locator('a, button').allInnerTexts(), ['Fix manuscript', 'Update canon…', 'Mark as intentional…', 'Dismiss']);
  await shot('continuity');
  check('running a check changed nothing in the manuscript', (await text18()) === textBefore);
  const canonBefore = await canon18();

  // Fix manuscript: straight to the line
  await critical.getByRole('link', { name: 'Fix manuscript' }).click();
  await page.waitForURL(new RegExp(`/manuscript/${p18}-c5$`));
  await page.locator('.find-match').first().waitFor();
  check('Fix manuscript opens the chapter at the passage', (await page.locator('.find-current').innerText()) === 'Mira' && (await paragraphs())[0] === '"You came," said Mira.');
  await page.goBack();
  await cp.locator('.issue').first().waitFor();

  // Mark as intentional
  await critical.getByRole('button', { name: 'Mark as intentional…' }).click();
  await critical.getByRole('button', { name: 'Flashback sequence' }).click();
  check('a reason can be picked or typed', (await critical.getByLabel('Why is this intentional?').inputValue()) === 'Flashback sequence');
  await afterCheck(() => critical.getByRole('button', { name: 'Save as intentional' }).click());
  check('marking an issue intentional clears it', (await tally()) === '5 open issues · 0 critical · 3 warnings · 2 info', await tally());
  await afterCheck(() => issueCard('is mentioned in Chapter 4').getByRole('button', { name: 'Dismiss' }).click());
  check('dismissing an issue clears it', (await tally()) === '4 open issues · 0 critical · 3 warnings · 1 info', await tally());
  await afterCheck(() => cp.getByRole('button', { name: 'Run continuity check' }).click());
  const afterRerun = await tally();
  await page.reload();
  await cp.locator('.issue').first().waitFor();
  check('both stay cleared in later checks and after a reload', afterRerun === '4 open issues · 0 critical · 3 warnings · 1 info' && (await tally()) === afterRerun, `${afterRerun} / ${await tally()}`);
  eq('the decisions are stored with their note', (await stored18('continuityResolutions')).map((r) => `${r.kind}:${r.note}`).sort(), ['dismissed:', 'intentional:Flashback sequence']);
  check('resolving issues left the manuscript and the canon exactly as they were', (await text18()) === textBefore && (await canon18()) === canonBefore);

  await tabTo('Reviewed');
  eq('reviewed issues are kept, with the reason', await cp.locator('.issue.reviewed').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('.thread-status, p.small')].map((x) => x.textContent).join(' | '))), ['Intentional | Your note: Flashback sequence', 'Dismissed']);
  await afterCheck(() => cp.locator('.issue.reviewed', { hasText: 'Flashback' }).getByRole('button', { name: 'Reopen' }).click());
  await tabTo('Issues');
  check('a decision can be withdrawn', (await tally()) === '5 open issues · 1 critical · 3 warnings · 1 info', await tally());

  // Update canon: proposed, confirmed, then applied
  const travelCard = issueCard('Travel between Capital and Academy');
  await travelCard.getByRole('button', { name: 'Update canon…' }).click();
  check('Update canon spells out the change and asks first', (await page.locator('dialog').innerText()).includes('Change the recorded travel time between Capital and Academy from 3 days to 2 hours.') && (await page.locator('dialog').innerText()).includes('Your manuscript is not touched'));
  await page.locator('dialog').getByRole('button', { name: 'Cancel' }).click();
  check('cancelling changes nothing', (await canon18()) === canonBefore && (await travelCard.count()) === 1);
  await travelCard.getByRole('button', { name: 'Update canon…' }).click();
  await afterCheck(() => page.locator('dialog').getByRole('button', { name: 'Update canon', exact: true }).click());
  const road = (await stored18('continuityRules')).find((r) => r.kind === 'travel');
  check('confirming updates the recorded travel time and settles the issue', road.amount === 2 && road.unit === 'hours' && (await travelCard.count()) === 0, JSON.stringify([road.amount, road.unit]));
  const ageCard = issueCard("Mira's age is 17");
  await ageCard.getByRole('button', { name: 'Update canon…' }).click();
  check('for a profile field it names the field and both values', (await page.locator('dialog').innerText()).includes("Change Mira's Age on their profile from “17” to “19”."));
  await afterCheck(() => page.locator('dialog').getByRole('button', { name: 'Update canon', exact: true }).click());
  check('…and updates only that field', (await stored18('loreEntries')).find((e) => e.name === 'Mira').fields[0].value === '19' && (await ageCard.count()) === 0 && (await tally()) === '3 open issues · 1 critical · 2 warnings · 0 info', await tally());

  await cp.getByLabel('Filter by severity').selectOption('critical');
  eq('issues filter by severity', (await findings()).length, 1);
  await cp.getByLabel('Filter by severity').selectOption('');
  await cp.getByLabel('Filter by kind of check').selectOption('power');
  eq('…by kind of check', (await findings()).map((f) => f.split(' | ')[1]), ['Chapter 3 · paragraph 2']);
  await cp.getByLabel('Filter by kind of check').selectOption('');
  await cp.getByLabel('Filter by chapter').selectOption({ label: 'Chapter 5' });
  eq('…and by chapter', (await findings()).map((f) => f.split(' | ')[0]), ['CRITICAL', 'WARNING']);
  await cp.getByLabel('Filter by chapter').selectOption('');

  // The author changes what is tracked: Mira returns in chapter 5
  await critical.getByRole('button', { name: 'What is tracked' }).click();
  await page.locator('dialog form').getByLabel('Stops being true from').selectOption({ label: 'Chapter 5' });
  await afterCheck(() => page.locator('dialog form').getByRole('button', { name: 'Save changes' }).click());
  check('editing a tracked rule re-checks the manuscript', (await tally()) === '2 open issues · 0 critical · 2 warnings · 0 info', await tally());
  await tabTo('What is tracked');
  check('the rule shows its new span', (await cp.locator('.thread.tracked').first().innerText()).includes('deceased from Chapter 2 until Chapter 5'));
  await cp.getByRole('button', { name: 'Stop tracking Sunblade' }).click();
  await afterCheck(() => page.locator('dialog').getByRole('button', { name: 'Stop tracking', exact: true }).click());
  check('a rule can be removed', (await cp.locator('.thread.tracked').count()) === 3 && (await tally()) === '1 open issue · 0 critical · 1 warning · 0 info', await tally());
  check('through all of it, not one character of the manuscript changed', (await text18()) === textBefore);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(continuityUrl);
  await cp.locator('.issue').first().waitFor();
  check('mobile: the continuity dashboard fits the screen', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await cp.locator('.issue .actions').first().isVisible()));
  await shot('mobile-continuity');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 19: fictional systems designer ---
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Ascendant');
  eq('a new project can start with a system preset', await page.getByLabel('Fictional system').locator('option').allInnerTexts(), ['None for now', 'LitRPG / Game System', 'Progression / Cultivation', 'Hard Magic / Elemental', 'Superhero / Mutant']);
  await page.getByLabel('Fictional system').selectOption({ label: 'LitRPG / Game System' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p19 = page.url().split('/').pop();
  const systemsUrl = `${BASE}/project/${p19}/systems`;
  const sp = page.locator('.systems-page');
  // On a character's own System tab the last tab is "<Name>’s sheet"; among all systems it is "Sheets".
  const sysTab = async (name) => {
    const wanted = name === 'Sheets' ? /^Sheets|’s sheet$/ : new RegExp(`^${name}`);
    await sp.getByRole('tab', { name: wanted }).click();
    await sp.locator('[role=tab][aria-selected=true]', { hasText: wanted }).waitFor();
  };
  /** Types into a field that saves when left. */
  const commit = async (scope, label, value) => {
    const input = scope.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.blur();
    await page.waitForTimeout(120);
  };
  const sheetRows = (scope) => scope.locator('.sheet-stats tr').evaluateAll((rows) => Object.fromEntries(rows.map((row) => [row.querySelector('th').textContent, row.querySelector('td').textContent])));
  const formulaErrors = () => sp.locator('.formula-note.error').count();

  await page.goto(systemsUrl);
  await sp.locator('.system-card').waitFor();
  check('SYSTEMS LIVE IN CHARACTERS: there is no Systems page in the sidebar, and its old address opens where it lives now', (await page.locator('.sidebar nav a', { hasText: /^Systems$/ }).count()) === 0 && /\/characters\/systems$/.test(page.url()) && (await page.getByRole('link', { name: '← Character Library' }).count()) === 1, page.url());
  await page.goto(`${BASE}/project/${p19}/characters`);
  await page.locator('.vault-library').getByRole('link', { name: 'Systems', exact: true }).click();
  await sp.locator('.system-card').waitFor();
  check('…reached from the Character Library', /\/characters\/systems$/.test(page.url()));
  check('the preset chosen for the new project is there, complete', (await sp.locator('.system-card').innerText()).replace(/\s+/g, ' ').includes('The System') && (await sp.locator('.system-card').innerText()).includes('12 attributes & formulas · 1 way of advancing · 3 classes · 3 skills · 1 titles · 0 sheets'), await sp.locator('.system-card').innerText());

  // A character is put on the system from their profile
  await page.goto(`${BASE}/project/${p19}/codex`);
  await newCharacter('Kai', { stay: true });
  await page.locator('.vault-profile').getByLabel('Add to a system').selectOption({ label: 'The System' });
  await page.waitForURL(/\/characters\/[\w-]+\/system\?system=.*sheet=/);
  const own = sp.getByRole('group', { name: "Kai's own values" });
  const card19 = sp.locator('.sheet-card');
  await card19.locator('.sheet-stats tr').first().waitFor();
  eq('a new sheet is filled in from the blueprint', [await sheetRows(card19), await card19.locator('.sheet-tracks').innerText()], [
    { Strength: '10', Agility: '10', Intelligence: '10', Vitality: '10', Health: '100 HP', Mana: '50 MP', Stamina: '100 SP', 'Max Health': '200 HP', 'Max Mana': '100 MP', Damage: '15', 'Mana Regen': '1 per minute', 'Skill Slots': '3 slots' },
    'Level\n1 of 100 · Next level: 100 XP',
  ]);
  await commit(own, "Kai's Level", '30');
  await commit(own, "Kai's Strength", '14');
  await own.getByLabel("Kai's Classes").selectOption({ label: 'Void Mage' });
  await own.getByRole('group', { name: "Kai's Skills" }).getByLabel('Void Step').click();
  await own.getByRole('group', { name: "Kai's Titles" }).getByLabel('Giant Slayer').click();
  await card19.locator('.sheet-group li', { hasText: 'Giant Slayer' }).waitFor();
  const kaiRows = await sheetRows(card19);
  eq('a class, a skill and a title bring their effects with them', [kaiRows.Intelligence, kaiRows.Mana, kaiRows['Max Mana'], kaiRows.Damage, kaiRows['Skill Slots']], ['22 · from Void Mage', '100 MP · from Void Mage', '210 MP', '23.1 · from Giant Slayer', '6 slots']);
  const voidStep = card19.locator('.sheet-group li', { hasText: 'Void Step' });
  check('a skill inherits its rank, cost and prerequisite, and says what is not met', (await voidStep.innerText()).replace(/\s+/g, ' ') === 'Void Step Unique Void Costs 70 Mana · Cooldown: 30 seconds Requires Class: Void Mage AND level >= 50 — not met: level >= 50', (await voidStep.innerText()).replace(/\s+/g, ' '));
  check('the class says what its own prerequisite still needs', (await card19.locator('.sheet-group li', { hasText: 'Void Mage' }).first().innerText()).includes('not met: Class: Mage'));
  await commit(own, "Kai's Level", '50');
  await voidStep.getByText('— met').waitFor();
  check('raising the level satisfies the condition and raises the cost formula', (await voidStep.innerText()).includes('Costs 90 Mana') && (await card19.locator('.sheet-tracks').innerText()).includes('50 of 100'));
  await shot('systems-sheet');

  // The profile shows the same sheet
  check('the sheet was worked on inside the character’s profile the whole time: on their System tab, with the rules on the tabs beside it', new RegExp(`/characters/[\\w-]+/system\\?`).test(page.url()) && (await page.locator('.vault-profile .vault-tabs a.active').innerText()) === 'System' && (await sp.getByRole('tab').allInnerTexts()).map((t) => t.replace(/ \(\d+\)$/, '')).join() === 'Attributes & resources,Levels & realms,Classes, skills & more,Tables,Kai’s sheet' && (await sp.getAttribute('data-scope')) === 'character');
  await page.locator('.vault-profile .vault-tabs').getByRole('link', { name: 'Overview', exact: true }).click();
  await page.locator('.vault-profile').getByRole('region', { name: 'Character progression' }).waitFor();
  check('the character profile summarises the sheet and leads to the tracker', (await page.locator('.vault-profile').getByRole('region', { name: 'Character progression' }).getByRole('link', { name: 'Open Progression Tracker' }).count()) === 1);
  // The profile shows a summary read from the sheet; the sheet itself is kept in one place, a click away.
  const prog19 = page.locator('.vault-profile').getByRole('region', { name: 'Character progression' });
  const summary19 = (await prog19.locator('.vault-progress').innerText()).replace(/\s+/g, ' ');
  check('the profile summarises the sheet (system, level, what they hold) and links to it, without copying it', /SYSTEM The System/i.test(summary19) && /LEVEL 50 of 100/i.test(summary19) && (await prog19.getByRole('link', { name: 'Open Kai’s sheet' }).getAttribute('href')).includes('/system?system=') && (await prog19.locator('.sheet-stats').count()) === 0, summary19);
  const storedSheet = (await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction('systemSheets').objectStore('systemSheets').getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === projectId)); };
    };
  }), p19))[0];
  check('the sheet stores only what is Kai\'s own: nothing is copied from the blueprint', Object.keys(storedSheet.values).length === 1 && storedSheet.itemIds.length === 3 && !JSON.stringify(storedSheet).includes('Void Step'), JSON.stringify(storedSheet));

  // Formulas: checked as they are typed, and they reach every sheet
  await prog19.getByRole('link', { name: 'Open Kai’s sheet' }).click();
  await sp.waitFor();
  await sysTab('Attributes');
  const damage = sp.getByLabel('Formula for Damage');
  await damage.fill('strenght * 2');
  check('a misspelt name in a formula is explained while typing', (await sp.locator('.formula', { has: page.getByLabel('Formula for Damage') }).locator('.formula-note').innerText()) === 'Nothing here is called “strenght”.');
  await damage.fill('strength × 2');
  check('a working formula shows what it comes to', (await sp.locator('.formula', { has: page.getByLabel('Formula for Damage') }).locator('.formula-note').innerText()) === '= 20 with starting values');
  await damage.blur();
  await page.waitForTimeout(150);
  await sysTab('Sheets');
  await card19.locator('.sheet-stats tr').first().waitFor();
  check('changing the blueprint changes the character sheet', (await sheetRows(card19)).Damage === '30.8 · from Giant Slayer', (await sheetRows(card19)).Damage);

  // Nothing is fixed: the author's own variables, units, ladders, groups and tables
  await sysTab('Attributes');
  await sp.getByRole('button', { name: '+ Attribute', exact: true }).click();
  await sp.getByLabel('Name of New attribute', { exact: true }).waitFor();
  await commit(sp, 'Name of New attribute', 'Moxie');
  await commit(sp, 'Unit of Moxie', 'sparks');
  await commit(sp, 'Starting value of Moxie', '7');
  await sp.getByRole('button', { name: '+ Formula', exact: true }).click();
  await sp.getByLabel('Name of New formula', { exact: true }).waitFor();
  await commit(sp, 'Name of New formula', 'Swagger');
  await commit(sp, 'Formula for Swagger', 'if(moxie > 5, moxie ^ 2, 0)');
  await commit(sp, 'Unit of Swagger', '% of a grin');
  const swaggerNote = () => sp.locator('.formula', { has: page.getByLabel('Formula for Swagger') }).locator('.formula-note').innerText();
  check('a custom variable with its own unit feeds a custom formula', (await sp.getByLabel('Short name of Moxie').inputValue()) === 'moxie' && (await swaggerNote()) === '= 49 with starting values', await swaggerNote());
  await commit(sp, 'Name of Moxie', 'Nerve');
  check('renaming a variable does not break the formulas that use it', (await sp.getByLabel('Short name of Nerve').inputValue()) === 'moxie' && (await swaggerNote()) === '= 49 with starting values');

  await sysTab('Levels');
  check('a level track shows its cap and its curve', (await sp.getByLabel('Cap of Level').inputValue()) === '100' && (await sp.locator('.curve').innerText()).startsWith('Level 1 → 2: 100 XP · Level 2 → 3: 282.84 XP'), await sp.locator('.curve').innerText());
  await sp.getByRole('button', { name: '+ Ladder of named stages' }).click();
  await commit(sp, 'Name of New ladder', 'Standing');
  for (const stage of ['Kettle-Carrier', 'Pourer of the Third Cup']) {
    const before = await sp.locator('.sys-stages > li').count();
    await sp.getByRole('button', { name: '+ Stage in Standing' }).click();
    await sp.getByLabel(`Name of stage ${before + 1} of Standing`).waitFor();
    await commit(sp, `Name of stage ${before + 1} of Standing`, stage);
  }
  await commit(sp, 'What Pourer of the Third Cup requires', 'level >= 10 AND Class: Mage');
  await sp.getByRole('button', { name: 'Move Pourer of the Third Cup up' }).click();
  await page.waitForTimeout(150);
  await sp.getByRole('button', { name: 'Move Pourer of the Third Cup down' }).click();
  await page.waitForTimeout(150);
  eq('a ladder of named stages can be built and reordered', [await sp.locator('.sys-stages > li input.grow').evaluateAll((els) => els.map((el) => el.value)), await formulaErrors()], [['Kettle-Carrier', 'Pourer of the Third Cup'], 0]);

  await sysTab('Classes');
  const rankNames = () => sp.getByRole('group', { name: 'Ranks' }).locator('input.grow').evaluateAll((els) => els.map((el) => el.value));
  eq('ranks are the author\'s list', await rankNames(), ['Common', 'Advanced', 'Unique', 'Legendary']);
  await sp.getByRole('button', { name: 'Remove the rank Legendary' }).click();
  await sp.getByRole('button', { name: 'Remove the rank Unique' }).click();
  await commit(sp, 'Name of rank 1', 'Lukewarm');
  await commit(sp, 'Name of rank 2', 'Scalding');
  eq('…each one renamed or removed on its own', await rankNames(), ['Lukewarm', 'Scalding']);
  await sp.getByRole('button', { name: '+ Group (classes, skills, titles…)' }).click();
  await commit(sp, 'Name of the group New group', 'Vows');
  await sp.getByRole('button', { name: '+ Add to Vows' }).click();
  const vow = sp.locator('.sys-item', { hasText: 'New entry' });
  await vow.locator('summary').click();
  await commit(sp, 'Name of New entry', 'Vow of Silence');
  const silence = sp.locator('.sys-item', { hasText: 'Vow of Silence' });
  await silence.getByLabel('Rank of Vow of Silence').selectOption('Scalding');
  const requires = silence.getByLabel('What Vow of Silence requires');
  await requires.fill('Guild: Ravens');
  check('a condition naming a group that does not exist is explained', (await silence.locator('.formula-note.error').innerText()) === 'There is no “Guild” to look in for “Ravens”.');
  await requires.fill('Standing: Pourer of the Third Cup AND level >= 20');
  await requires.blur();
  await silence.getByRole('button', { name: '+ Effect on Vow of Silence' }).click();
  await silence.getByLabel('What Vow of Silence changes').selectOption({ label: 'Nerve' });
  await commit(silence, 'Amount Vow of Silence gives', '3');
  await silence.getByRole('button', { name: '+ Cost of Vow of Silence' }).click();
  await commit(silence, 'Amount Vow of Silence costs', 'level / 2');
  await commit(silence, 'Cooldown of Vow of Silence', 'until dawn');
  check('a conditional rule can combine a stage and a level', (await formulaErrors()) === 0 && (await silence.locator('summary').innerText()).replace(/\s+/g, ' ') === 'Vow of Silence Scalding requires Standing: Pourer of the Third Cup AND level >= 20', (await silence.locator('summary').innerText()).replace(/\s+/g, ' '));

  await sysTab('Tables');
  await sp.getByRole('button', { name: '+ Table' }).click();
  await commit(sp, 'Name of the table New table', 'Pairings');
  for (const [noun, names] of [['Row', ['Smoke', 'Jasmine']], ['Column', ['Rain', 'Frost']]]) {
    for (const [i, name] of names.entries()) {
      await sp.getByRole('button', { name: `+ ${noun} in Pairings` }).click();
      await commit(sp, `Name of ${noun.toLowerCase()} ${i + 1} of Pairings`, name);
    }
  }
  await commit(sp, 'Smoke against Frost', 'Melancholy');
  check('a table of anything against anything can be filled in', (await sp.locator('.matrix tbody tr').count()) === 2 && (await sp.locator('.matrix thead th').allInnerTexts()).join() === 'Rain,Frost');
  await commit(sp, 'Name of row 1 of Pairings', 'Ash');
  check('renaming a row keeps what is written in it', (await sp.getByLabel('Ash against Frost').inputValue()) === 'Melancholy');
  await commit(sp, 'Name of row 1 of Pairings', 'Smoke');

  await sysTab('Sheets');
  await own.getByLabel("Kai's Standing").selectOption({ label: 'Pourer of the Third Cup' });
  await own.getByRole('group', { name: "Kai's Vows" }).getByLabel('Vow of Silence').click();
  await card19.locator('.sheet-group li', { hasText: 'Vow of Silence' }).waitFor();
  const custom19 = await sheetRows(card19);
  check('the custom parts reach the sheet like any other', custom19.Nerve === '10 sparks · from Vow of Silence' && custom19.Swagger === '100 % of a grin' && (await card19.locator('.sheet-group li', { hasText: 'Vow of Silence' }).innerText()).replace(/\s+/g, ' ') === 'Vow of Silence Scalding Nerve +3 · Costs 25 Health · Cooldown: until dawn Requires Standing: Pourer of the Third Cup AND level >= 20 — met', `${custom19.Nerve} | ${custom19.Swagger} | ${(await card19.locator('.sheet-group li', { hasText: 'Vow of Silence' }).innerText()).replace(/\s+/g, ' ')}`);

  await page.reload();
  await card19.locator('.sheet-stats tr').first().waitFor();
  check('the blueprint and the sheet survive a reload', (await sheetRows(card19)).Swagger === '100 % of a grin' && (await sp.getByLabel('System name').inputValue()) === 'The System');
  await sysTab('Tables');
  check('…and so does the table', (await sp.getByLabel('Smoke against Frost').inputValue()) === 'Melancholy');

  // Presets go cleanly into an existing project
  for (const [preset, name, expected] of [
    ['Progression / Cultivation', 'The Path of Cultivation', { tab: 'Levels', text: 'Foundation Establishment' }],
    ['Hard Magic / Elemental', 'The Elemental Art', { tab: 'Tables', text: 'Quenched' }],
    ['Superhero / Mutant', 'The Gifted', { tab: 'Classes', text: 'Kinetic Absorption' }],
  ]) {
    await page.goto(systemsUrl);
    await sp.getByRole('button', { name: `Use ${preset}` }).click();
    await page.waitForURL(/systems\?system=/);
    await page.waitForFunction((wanted) => document.querySelector('.system-name')?.value === wanted, name);
    let errors19 = await formulaErrors();
    for (const tab of ['Levels', 'Classes', 'Tables']) {
      await sysTab(tab);
      await sp.locator('.sys-item > summary').evaluateAll((els) => els.forEach((el) => el.parentElement.setAttribute('open', '')));
      errors19 += await formulaErrors();
    }
    await sysTab(expected.tab);
    const found = (await sp.locator('input, textarea').evaluateAll((els, wanted) => els.some((el) => el.value === wanted), expected.text)) || (await sp.innerText()).includes(expected.text);
    check(`the ${preset} preset instantiates into an existing project with no broken formula`, errors19 === 0 && found, `${errors19} errors, found: ${found}`);
  }
  await page.goto(systemsUrl);
  await sp.getByRole('button', { name: 'Start blank' }).click();
  await page.waitForFunction(() => document.querySelector('.system-name')?.value === 'New system');
  check('a blank system assumes nothing', (await sp.getByRole('tab').allInnerTexts()).join(' | ') === 'Attributes & resources (0) | Levels & realms (0) | Classes, skills & more (0) | Tables (0) | Sheets (0)', (await sp.getByRole('tab').allInnerTexts()).join(' | '));
  await sp.getByRole('button', { name: 'Delete system…' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Delete system', exact: true }).click();
  await sp.locator('.system-card').first().waitFor();
  eq('systems are listed, and one can be deleted', await sp.locator('.system-card .thread-title').allInnerTexts(), ['The Elemental Art', 'The Gifted', 'The Path of Cultivation', 'The System']);

  // A second system for the same character: cultivation stages
  await sp.locator('.system-card .thread-title', { hasText: 'The Path of Cultivation' }).click();
  await sysTab('Sheets');
  await sp.getByLabel('Add a codex entry to this system').selectOption({ label: 'Kai' });
  await card19.locator('.sheet-tracks').waitFor();
  check('a realm shows its next stage and what the breakthrough still needs', (await card19.locator('.sheet-tracks').innerText()).replace(/\s+/g, ' ') === 'Cultivation Realm Qi Condensation · Next: Foundation Establishment (needs qi >= 1000 AND Pill: Foundation Pill) Not yet: qi >= 1000; Pill: Foundation Pill', (await card19.locator('.sheet-tracks').innerText()).replace(/\s+/g, ' '));
  await commit(own, "Kai's Qi", '1500');
  await own.getByRole('group', { name: "Kai's Pills" }).getByLabel('Foundation Pill').click();
  await page.waitForFunction(() => !document.querySelector('.sheet-card .sheet-tracks')?.textContent.includes('Not yet'));
  await own.getByLabel("Kai's Cultivation Realm").selectOption({ label: 'Core Formation' });
  await page.waitForFunction(() => document.querySelector('.sheet-card .sheet-tracks strong')?.textContent === 'Core Formation');
  check('advancing a realm moves the formulas that depend on it', (await sheetRows(card19)).Lifespan === '320 years' && (await sheetRows(card19))['Qi Capacity'] === '13500 qi', JSON.stringify(await sheetRows(card19)));
  await page.goto(`${BASE}/project/${p19}/characters`);
  await page.locator('.vault-library').getByRole('link', { name: /^Kai/ }).first().click();
  await page.locator('.vault-profile .vault-progress').nth(1).waitFor();
  eq('the profile summarises a sheet for each system the character is on', await page.locator('.vault-profile .vault-progress').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), ['The Path of Cultivation', 'The System']);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(systemsUrl);
  await sp.locator('.system-card .thread-title', { hasText: 'The System' }).click();
  await sp.locator('.sys-row').first().waitFor();
  const fits19 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await sysTab('Sheets');
  await sp.getByRole('button', { name: 'Kai', exact: true }).click();
  await card19.locator('.sheet-stats tr').first().waitFor();
  check('mobile: the designer and a sheet fit the screen', fits19 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-systems');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 20: character progression ---
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Chronicle of Alex');
  await page.getByLabel('Fictional system').selectOption({ label: 'LitRPG / Game System' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p20 = page.url().split('/').pop();
  await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction('chapters', 'readwrite');
      for (let i = 0; i < 50; i++) tx.objectStore('chapters').add({ id: `${projectId}-c${String(i + 1).padStart(2, '0')}`, projectId, parentId: null, kind: 'chapter', title: `Chapter ${i + 1}`, order: i, summary: '', notes: '', status: 'drafting', wordCount: 0, charCount: 0, createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p20);
  const stored20 = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction('progressSnapshots').objectStore('progressSnapshots').getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt)); };
    };
  }), p20);
  await page.goto(`${BASE}/project/${p20}/codex`);
  await newCharacter('Bren');
  await newCharacter('Alex', { stay: true });
  await page.locator('.vault-profile').getByLabel('Add to a system').selectOption({ label: 'The System' });
  await page.waitForURL(/\/characters\/[\w-]+\/system\?system=.*sheet=/);
  await page.locator('.systems-page .sheet-card .sheet-stats tr').first().waitFor();

  const progressionUrl = `${BASE}/project/${p20}/progression`;
  const pp = page.locator('.progression-page');
  const ed = pp.locator('.snapshot-editor');
  const stateCard = pp.locator('.sheet-card').first();
  const stateRows = (scope) => scope.locator('.sheet-stats tr').evaluateAll((rows) => Object.fromEntries(rows.map((row) => [row.querySelector('th').textContent, row.querySelector('td').textContent])));
  const setField = async (scope, label, value) => {
    const input = scope.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.blur();
    await page.waitForTimeout(150);
  };
  const tick = (group, name) => ed.getByRole('group', { name: `${group} in this snapshot` }).getByLabel(name).click();
  const logSnapshot = async (chapter, label) => {
    const count = await pp.locator('.snapshot-line li').count();
    await pp.getByLabel('Snapshot is true from').selectOption({ label: chapter });
    await pp.getByLabel('Label for the new snapshot').fill(label);
    await pp.getByRole('button', { name: 'Log snapshot' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.snapshot-line li').length === n + 1, count);
    await pp.locator('.snapshot-line li.selected', { hasText: label }).waitFor();
    await page.waitForFunction((wanted) => document.querySelector('.snapshot-editor [aria-label="Snapshot label"]')?.value === wanted, label);
  };
  const addGear = async (name, kind) => {
    const count = await ed.locator('[aria-label="Inventory and gear"] .sys-row').count();
    await ed.getByLabel('New gear').fill(name);
    await ed.getByLabel('How it is held').fill(kind);
    await ed.getByRole('button', { name: 'Add gear' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.snapshot-editor [aria-label="Inventory and gear"] .sys-row').length === n + 1, count);
  };
  const viewTab = async (name) => {
    await pp.getByRole('tab', { name }).click();
    await pp.locator('[role=tab][aria-selected=true]', { hasText: name }).waitFor();
    await page.waitForTimeout(150);
  };

  await page.goto(`${progressionUrl}?entry=${await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction('loreEntries').objectStore('loreEntries').getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.find((row) => row.projectId === projectId && row.name === 'Alex').id); };
    };
  }), p20)}`);
  await pp.getByRole('button', { name: 'Log snapshot' }).waitFor();
  check('character progression has its own page, starting empty', (await page.locator('.sidebar nav a', { hasText: /^Character progression$/ }).isVisible()) && (await pp.locator('.page-header [role=status]').innerText()) === 'No snapshots of Alex yet');

  await logSnapshot('Chapter 1', 'Arrival');
  check('the first snapshot starts from the character\'s system sheet', (await ed.getByLabel('True from').locator('option:checked').innerText()).trim() === 'Chapter 1' && (await stateRows(stateCard)).Damage === '15' && (await stateCard.getByRole('heading', { level: 3 }).innerText()) === 'Chapter 1: Arrival');
  await setField(ed, 'Level in this snapshot', '5');
  await setField(ed, 'Strength in this snapshot', '12');
  await ed.getByLabel('Classes in this snapshot').selectOption({ label: 'Warrior' });
  await addGear('Rusty Sword', 'Weapon');
  await ed.getByLabel('Personal goals').fill('Find her brother');
  await ed.getByLabel('Personal goals').blur();
  await stateCard.locator('[aria-label="Personal goals"] li').waitFor();
  const arrival = await stateRows(stateCard);
  check('stats, class, gear and status are recorded, and formulas follow', arrival.Strength === '17 · from Warrior' && arrival.Damage === '25.5' && (await stateCard.locator('.sheet-tracks').innerText()).replace(/\s+/g, ' ') === 'Level 5 of 100' && (await stateCard.locator('[aria-label="Inventory and gear"] li').innerText()).replace(/\s+/g, ' ') === 'Rusty Sword Weapon', JSON.stringify(arrival));

  await logSnapshot('Chapter 20', 'Before Evolution');
  check('a later snapshot starts as a copy of the state before it', (await ed.getByLabel('Level in this snapshot').inputValue()) === '5' && (await ed.getByLabel('Name of Rusty Sword').inputValue()) === 'Rusty Sword' && (await ed.getByLabel('Personal goals').inputValue()) === 'Find her brother');
  await setField(ed, 'Level in this snapshot', '24');
  await setField(ed, 'Intelligence in this snapshot', '12');
  await ed.getByLabel('Classes in this snapshot').selectOption({ label: 'Mage' });
  await tick('Skills', 'Power Strike');
  await addGear('Ember Ring', 'Equipped');
  await ed.getByLabel('Physical condition & injuries').fill('Broken left arm\nExhausted');
  await ed.getByLabel('Physical condition & injuries').blur();
  await ed.locator('.state-available').waitFor();
  check('the calculator points out what has come within reach', (await ed.locator('.state-available').innerText()) === 'Now within reach: Fireball', await ed.locator('.state-available').innerText());

  await logSnapshot('Chapter 21', 'After Evolution');
  await setField(ed, 'Level in this snapshot', '25');
  await page.waitForFunction(() => document.querySelector('.snapshot-editor .state-available')?.textContent === 'Now within reach: Void Mage, Fireball');
  await ed.getByLabel('Classes in this snapshot').selectOption({ label: 'Void Mage' });
  await tick('Skills', 'Fireball');
  await tick('Skills', 'Power Strike');
  await tick('Titles', 'Giant Slayer');
  await ed.getByRole('button', { name: 'Remove Rusty Sword' }).click();
  await ed.getByLabel('Name of Rusty Sword').waitFor({ state: 'detached' });
  await addGear('Sunblade', 'Weapon');
  await ed.getByLabel('Physical condition & injuries').fill('Exhausted');
  await ed.getByLabel('Physical condition & injuries').blur();
  await page.waitForTimeout(800);

  // The author has the last word
  await setField(ed, 'Set Max Health by hand', '5000');
  await page.waitForFunction(() => [...document.querySelectorAll('.progression-page .sheet-card .sheet-stats tr')].some((row) => row.textContent.includes('5000 HP')));
  check('a value set by hand replaces what the system works out, and says so', (await stateRows(stateCard))['Max Health'] === '5000 HP · set by hand (the system works out 200 HP)' && (await ed.locator('.snap-values tr', { hasText: 'Max Health' }).locator('td.worked').innerText()) === '200 HP', (await stateRows(stateCard))['Max Health']);
  await ed.getByLabel('Work out formulas and class effects from the system').click();
  await stateCard.locator('.state-system .badge', { hasText: 'entered by hand' }).waitFor();
  const manual = await stateRows(stateCard);
  check('with the calculator off nothing is worked out: values are exactly what was entered', manual.Intelligence === '12' && manual['Max Health'] === '5000 HP' && manual.Damage === '—' && (await ed.locator('.state-available').count()) === 0 && (await ed.locator('.snap-values thead th').allInnerTexts()).join('|') === 'Value|Entered', JSON.stringify(manual));
  await setField(ed, 'Damage in this snapshot', '77');
  check('…and any value, formulas included, can simply be typed in', (await stateRows(stateCard)).Damage === '77');
  await ed.getByLabel('Work out formulas and class effects from the system').click();
  await page.waitForFunction(() => !document.querySelector('.progression-page .sheet-card .state-system .badge'));
  const restored = await stateRows(stateCard);
  check('turning it back on keeps what was typed', restored.Damage.startsWith('77 · set by hand') && restored.Intelligence === '24 · from Void Mage' && restored['Max Health'].startsWith('5000 HP'), JSON.stringify(restored));
  await setField(ed, 'Set Damage by hand', '');
  await page.waitForFunction(() => [...document.querySelectorAll('.progression-page .sheet-card .sheet-stats tr')].some((row) => row.textContent === 'Damage19.8 · from Giant Slayer'));

  await logSnapshot('Chapter 50', 'Endgame');
  await setField(ed, 'Level in this snapshot', '60');
  eq('snapshots line up in story order', await pp.locator('.snapshot-line li').evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim())), ['Chapter 1ArrivalLevel 5', 'Chapter 20Before EvolutionLevel 24', 'Chapter 21After EvolutionLevel 25', 'Chapter 50EndgameLevel 60']);
  await shot('progression-edit');

  // Point in time
  await viewTab('State at a chapter');
  const asOf20 = async (label) => {
    await pp.getByLabel('As of', { exact: true }).selectOption({ label });
    await page.waitForTimeout(200);
    return (await pp.locator('.state-source').innerText()).replace(/\s+/g, ' ').replace(' Edit it', '');
  };
  check('by default the state at the end of the story is shown', (await pp.locator('.state-source').innerText()).includes('as of the end of the story, from the snapshot at Chapter 50: Endgame'));
  eq('asking for a chapter returns the state valid at that point', [await asOf20('As of Chapter 35'), await asOf20('As of Chapter 20'), await asOf20('As of Chapter 19'), await asOf20('As of Chapter 1')], [
    'Alex as of Chapter 35, from the snapshot at Chapter 21: After Evolution.',
    'Alex as of Chapter 20, from the snapshot at Chapter 20: Before Evolution.',
    'Alex as of Chapter 19, from the snapshot at Chapter 1: Arrival.',
    'Alex as of Chapter 1, from the snapshot at Chapter 1: Arrival.',
  ]);
  await asOf20('As of Chapter 35');
  const at35 = pp.locator('.sheet-card');
  check('"what level and abilities did Alex have in Chapter 35?" is answered in full', (await at35.locator('.sheet-tracks').innerText()).replace(/\s+/g, ' ') === 'Level 25 of 100' && ['Void Mage', 'Fireball', 'Giant Slayer', 'Ember Ring', 'Sunblade', 'Exhausted', 'Find her brother'].every((x) => at35.innerText().then((t) => t.includes(x))) && (await at35.innerText()).includes('Sunblade') && !(await at35.innerText()).includes('Rusty Sword') && !(await at35.innerText()).includes('Power Strike'), (await at35.innerText()).replace(/\s+/g, ' '));

  // Side by side
  await viewTab('Compare');
  check('the last two snapshots are compared by default', (await pp.getByLabel('Compare from').locator('option:checked').innerText()) === 'Chapter 21: After Evolution' && (await pp.getByLabel('Compare to').locator('option:checked').innerText()) === 'Chapter 50: Endgame');
  await pp.getByLabel('Compare from').selectOption({ label: 'Chapter 20: Before Evolution' });
  await pp.getByLabel('Compare to').selectOption({ label: 'Chapter 21: After Evolution' });
  await page.waitForTimeout(250);
  const changes = (await pp.locator('.compare-changes li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const expected20 = ['Level 24 of 100 → 25 of 100', 'Intelligence 18 → 24 (+6)', 'Max Health 200 HP → 5000 HP (+4800)', 'Gained Void Mage (Classes)', 'Gained Fireball (Skills)', 'Gained Giant Slayer (Titles)', 'Lost Mage (Classes)', 'Lost Power Strike (Skills)', 'Gear gained: Sunblade (Weapon)', 'Gear lost: Rusty Sword (Weapon)', 'Physical condition & injuries: no longer Broken left arm'];
  check('the comparison picks out stat deltas, new abilities and titles, and changed gear', expected20.every((line) => changes.includes(line)), `missing: ${expected20.filter((line) => !changes.includes(line)).join(' | ')}\n      got: ${changes.join(' | ')}`);
  check('unchanged values are left out, and both snapshots are shown side by side', !changes.some((c) => c.startsWith('Agility') || c.includes('Ember Ring') || c.includes('Find her brother')) && (await pp.locator('.compare-sides .sheet-card h3').allInnerTexts()).join(' | ') === 'Chapter 20: Before Evolution | Chapter 21: After Evolution', changes.join(' | '));
  await shot('progression-compare');
  await pp.getByLabel('Compare to').selectOption({ label: 'Chapter 20: Before Evolution' });
  await pp.locator('.compare-changes', { hasText: 'Nothing differs' }).waitFor();
  check('comparing a snapshot with itself finds nothing', true);

  // Editing history one point at a time
  await pp.locator('.snapshot-line button', { hasText: 'Arrival' }).click();
  await page.waitForFunction(() => document.querySelector('.snapshot-editor [aria-label="Snapshot label"]')?.value === 'Arrival');
  await setField(ed, 'Level in this snapshot', '6');
  await setField(ed, 'Snapshot label', 'Arrival in the tower');
  const levels20 = (await stored20()).map((s) => `${s.label}:${Object.values(Object.values(s.systems)[0].progress)[0]}`);
  eq('editing one snapshot leaves the others exactly as they were', levels20, ['Arrival in the tower:6', 'Before Evolution:24', 'After Evolution:25', 'Endgame:60']);
  const evolved = (await stored20())[2];
  check('what the author set by hand is stored as theirs', Object.values(Object.values(evolved.systems)[0].overrides).join() === '5000' && Object.values(evolved.systems)[0].auto === true);

  await pp.getByLabel('Character').selectOption({ label: 'Bren' });
  await page.waitForFunction(() => document.querySelector('.progression-page .page-header [role=status]')?.textContent === 'No snapshots of Bren yet');
  await logSnapshot('Before the story', 'Origin');
  await ed.getByLabel('Knowledge & secrets known').fill('Knows the prince is alive');
  await ed.getByLabel('Knowledge & secrets known').blur();
  await pp.locator('.sheet-card [aria-label="Knowledge & secrets known"] li').waitFor();
  check('a character with no system can still be tracked', (await ed.locator('fieldset[aria-label*=" in The System"]').count()) === 0 && (await pp.locator('.snapshot-line li').innerText()).replace(/\s+/g, ' ').startsWith('Before the story Origin'));

  // On the character's profile
  await page.goto(`${BASE}/project/${p20}/characters`);
  await page.locator('.vault-library').getByRole('link', { name: /^Alex/ }).first().click();
  await page.locator('.vault-profile').getByRole('link', { name: 'Details', exact: true }).click();
  const profile20 = page.locator('.entry-progression');
  await profile20.locator('.state-source').waitFor();
  await profile20.getByLabel('Alex as of').selectOption({ label: 'As of Chapter 35' });
  await page.waitForFunction(() => document.querySelector('.entry-progression .state-source')?.textContent.includes('Chapter 21'));
  check('the character profile answers the same question at any chapter', (await profile20.locator('.state-source').innerText()) === 'From the snapshot at Chapter 21: After Evolution' && (await profile20.locator('.sheet-tracks').innerText()).replace(/\s+/g, ' ') === 'Level 25 of 100' && (await profile20.locator('.toolbar a').innerText()) === '4 snapshots');
  await profile20.locator('.toolbar a').click();
  await pp.locator('.snapshot-line li').nth(3).waitFor();

  await page.reload();
  await pp.locator('.snapshot-line li').nth(3).waitFor();
  await pp.locator('.snapshot-line button', { hasText: 'Endgame' }).click();
  await page.waitForFunction(() => document.querySelector('.snapshot-editor [aria-label="Snapshot label"]')?.value === 'Endgame');
  await ed.getByRole('button', { name: 'Delete snapshot…' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Delete snapshot', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.snapshot-line li').length === 3);
  await viewTab('State at a chapter');
  check('snapshots survive a reload, and deleting one hands the later chapters to the one before', (await pp.locator('.page-header [role=status]').innerText()) === '3 snapshots of Alex' && (await pp.locator('.state-source').innerText()).includes('from the snapshot at Chapter 21: After Evolution'), await pp.locator('.state-source').innerText());

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(progressionUrl);
  await pp.locator('.snapshot-line li').first().waitFor();
  // Without a character in the address the page opens on whichever tracked one comes first.
  await pp.getByLabel('Character').selectOption({ label: 'Alex' });
  await pp.locator('.snapshot-line li').nth(2).waitFor();
  const fits20 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await viewTab('Compare');
  await pp.locator('.compare-sides').waitFor();
  check('mobile: the tracker and the comparison fit the screen', fits20 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await shot('mobile-progression');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 21: alternate timelines ---
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Ashfall Saga');
  await page.getByLabel('Fictional system').selectOption({ label: 'LitRPG / Game System' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p21 = page.url().split('/').pop();
  const rows21 = (projectId, store) => page.evaluate(([id, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === id).sort((a, b) => String(a.id).localeCompare(String(b.id)))); };
    };
  }), [projectId, store]);
  const words21 = (doc) => JSON.stringify(doc).match(/"text":"([^"]*)"/g)?.map((m) => m.slice(8, -1)).join(' ') ?? '';
  await page.goto(`${BASE}/project/${p21}/codex`);
  await newCharacter('Alex', { stay: true });
  await page.locator('.vault-profile').getByLabel('Add to a system').selectOption({ label: 'The System' });
  await page.waitForURL(/\/characters\/[\w-]+\/system\?system=.*sheet=/);
  await page.locator('.systems-page .sheet-card .sheet-stats tr').first().waitFor();
  const alex21 = (await rows21(p21, 'loreEntries'))[0].id;
  await page.evaluate(([projectId, alexId]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'plotThreads'], 'readwrite');
      for (let i = 1; i <= 5; i++) {
        const id = `${projectId}-c${i}`;
        tx.objectStore('chapters').add({ id, projectId, parentId: null, kind: 'chapter', title: `Chapter ${i}`, order: i, summary: '', notes: '', status: 'drafting', wordCount: 6, charCount: 30, createdAt: i, updatedAt: i });
        tx.objectStore('chapterContents').add({ id, projectId, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `The main story, chapter ${i}.` }] }] }, rev: 1, savedAt: 1 });
      }
      const beat = (n) => ({ id: `${projectId}-b${n}`, nodeId: `${projectId}-c${n}`, title: `Beat in ${n}`, note: '', createdAt: n });
      tx.objectStore('plotThreads').add({ id: `${projectId}-thread`, projectId, title: 'The Siege', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [alexId], locationIds: [], targetNodeId: `${projectId}-c5`, targetNote: '', beats: [beat(1), beat(4)], notes: '', muted: false, createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [p21, alex21]);
  await page.goto(`${BASE}/project/${p21}/progression?entry=${alex21}`);
  await pp.getByRole('button', { name: 'Log snapshot' }).waitFor();
  await logSnapshot('Chapter 2', 'Early');
  await setField(ed, 'Level in this snapshot', '10');
  await logSnapshot('Chapter 5', 'Late');
  await setField(ed, 'Level in this snapshot', '50');
  const parentData = async () => JSON.stringify(await Promise.all(['chapters', 'chapterContents', 'loreEntries', 'plotThreads', 'progressSnapshots', 'systems', 'systemSheets'].map((store) => rows21(p21, store))));
  const parentBefore = await parentData();

  const bp = page.locator('.branches-page');
  const branchStatus = async () => (await bp.locator('.page-header [role=status]').innerText()).replace(/\s+/g, ' ');
  const treeOf21 = () => bp.locator('.tl-tree [role=treeitem]').evaluateAll((items) => items.map((item) => {
    let depth = 0;
    for (let el = item.parentElement; el && !el.classList.contains('tl-tree'); el = el.parentElement) if (el.tagName === 'UL') depth++;
    const node = item.querySelector(':scope > .tl-node');
    return `${'> '.repeat(depth)}${node.querySelector('.tl-node-head a, .tl-node-head strong').textContent} [${node.querySelector('.tl-tag').textContent}]${item.getAttribute('aria-current') ? ' *' : ''}`;
  }));
  const fork21 = async (after, name, status, note = '') => {
    await bp.getByLabel('Diverges').selectOption({ label: after });
    await bp.getByLabel('Name of the new timeline').fill(name);
    await bp.getByLabel('Canon status of the new timeline').selectOption({ label: status });
    await bp.getByLabel('What the new timeline is for').fill(note);
    const from = page.url();
    await bp.getByRole('button', { name: 'Fork timeline' }).click();
    await page.waitForURL((url) => url.href !== from && url.pathname.endsWith('/branches'));
    await bp.locator('.tl-node.current', { hasText: name }).waitFor();
    return page.url().split('/').at(-2);
  };
  const sidebarTag = () => page.locator('.sidebar-title .tl-tag');

  await page.goto(`${BASE}/project/${p21}/branches`);
  await bp.locator('.tl-node').first().waitFor();
  check('a story starts as one timeline, main canon, with no tag in the way', (await branchStatus()) === 'One timeline so far · this one is Main Canon' && (await sidebarTag().count()) === 0 && (await page.locator('.sidebar nav a', { hasText: /^Branches$/ }).isVisible()));
  eq('a fork can start after any chapter, with any status but main', [await bp.getByLabel('Diverges').locator('option').allInnerTexts(), await bp.getByLabel('Canon status of the new timeline').locator('option').allInnerTexts()], [['Before the story begins', 'After Chapter 1', 'After Chapter 2', 'After Chapter 3', 'After Chapter 4', 'After Chapter 5'], ['Alternate Canon', 'Non-Canon', 'Experimental', 'Abandoned']]);

  const villain = await fork21('After Chapter 3', 'Villain Victory', 'Non-Canon', 'What if the gate falls?');
  check('forking opens the new timeline, tagged wherever you are in it', villain !== p21 && (await sidebarTag().innerText()) === 'NON-CANON' && (await page.locator('.sidebar-title strong').innerText()) === 'Villain Victory' && (await branchStatus()) === '2 timelines · this one is Non-Canon · main canon is “Ashfall Saga”', await branchStatus());
  eq('the tree shows parent and child', await treeOf21(), ['Ashfall Saga [Main Canon]', '> Villain Victory [Non-Canon] *']);
  check('…with where it forked and what it is for', (await bp.locator('.tl-node.current').innerText()).replace(/\s+/g, ' ').includes('Forked after Chapter 3 · 18 words What if the gate falls?'), (await bp.locator('.tl-node.current').innerText()).replace(/\s+/g, ' '));

  // Point-in-time inheritance
  const inherited = { chapters: await rows21(villain, 'chapters'), contents: await rows21(villain, 'chapterContents'), entries: await rows21(villain, 'loreEntries'), threads: await rows21(villain, 'plotThreads'), snapshots: await rows21(villain, 'progressSnapshots'), systems: await rows21(villain, 'systems'), sheets: await rows21(villain, 'systemSheets') };
  eq('the new timeline has the manuscript up to the fork, with its text', [inherited.chapters.map((c) => c.title).sort(), inherited.contents.map((c) => words21(c.doc)).sort()], [['Chapter 1', 'Chapter 2', 'Chapter 3'], ['The main story, chapter 1.', 'The main story, chapter 2.', 'The main story, chapter 3.']]);
  check('…the codex, the system and the character\'s sheet', inherited.entries.map((e) => e.name).join() === 'Alex' && inherited.systems.map((s) => s.name).join() === 'The System' && inherited.sheets.length === 1 && inherited.entries[0].id !== alex21);
  check('…plot threads with the developments so far, and characters as they were by then', inherited.threads[0].beats.map((b) => b.title).join() === 'Beat in 1' && inherited.threads[0].status === 'active' && inherited.threads[0].characterIds[0] === inherited.entries[0].id && inherited.snapshots.map((s) => s.label).join() === 'Early');
  await page.goto(`${BASE}/project/${villain}/progression`);
  await pp.locator('.state-source').waitFor();
  check('in the new timeline the character is who they were at the fork', (await pp.locator('.sheet-card .sheet-tracks').innerText()).replace(/\s+/g, ' ') === 'Level 10 of 100' && (await pp.locator('.page-header [role=status]').innerText()) === '1 snapshot of Alex');
  check('forking changed nothing in the parent', (await parentData()) === parentBefore);

  // Evolving independently
  const villainCh3 = inherited.chapters.find((c) => c.title === 'Chapter 3').id;
  await page.goto(`${BASE}/project/${villain}/manuscript/${villainCh3}`);
  await page.locator(text).waitFor();
  check('the tag follows into the writing screen', (await page.locator('.ms-nav-head .tl-tag').innerText()) === 'NON-CANON');
  await page.locator(text).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('The gate falls. The villain walks in.');
  await saved();
  await page.getByRole('button', { name: '+ Chapter', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith(villainCh3));
  await page.locator(text).click();
  await page.keyboard.type('A reign of ash.');
  await saved();
  await page.goto(`${BASE}/project/${villain}/characters`);
  await openCharacter('Alex');
  const head21 = page.locator('.vault-profile').getByRole('group', { name: 'Character', exact: true });
  await head21.getByRole('button', { name: 'Edit profile' }).click();
  await head21.getByLabel('Name', { exact: true }).fill('Alex the Fallen');
  await head21.getByLabel('Name', { exact: true }).blur();
  await head21.getByRole('button', { name: 'Done', exact: true }).click();
  await head21.getByRole('heading', { name: 'Alex the Fallen' }).waitFor();
  await page.goto(`${BASE}/project/${villain}/progression`);
  await pp.getByRole('button', { name: 'Log snapshot' }).waitFor();
  await logSnapshot('Chapter 3', 'Broken');
  await setField(ed, 'Level in this snapshot', '1');
  const villainNow = { text: (await rows21(villain, 'chapterContents')).map((c) => words21(c.doc)).sort(), names: (await rows21(villain, 'loreEntries')).map((e) => e.name), snapshots: (await rows21(villain, 'progressSnapshots')).length };
  eq('the timeline changes freely', villainNow, { text: ['A reign of ash.', 'The gate falls. The villain walks in.', 'The main story, chapter 1.', 'The main story, chapter 2.'], names: ['Alex the Fallen'], snapshots: 2 });
  check('…and not one byte of the parent changes with it', (await parentData()) === parentBefore);

  // More timelines, nested
  await page.goto(`${BASE}/project/${p21}/branches`);
  await bp.locator('.tl-node.current', { hasText: 'Ashfall Saga' }).waitFor();
  const timelineB = await fork21('After Chapter 3', 'Alternative Timeline B', 'Experimental');
  const darker = await fork21('After Chapter 1', 'B, darker', 'Abandoned');
  eq('several timelines can fork from one chapter, and timelines can fork from timelines', await treeOf21(), ['Ashfall Saga [Main Canon]', '> Villain Victory [Non-Canon]', '> Alternative Timeline B [Experimental]', '> > B, darker [Abandoned] *']);
  check('a sibling forked from the same chapter got the parent\'s text, not the other timeline\'s', (await rows21(timelineB, 'chapterContents')).map((c) => words21(c.doc)).sort().join('|') === 'The main story, chapter 1.|The main story, chapter 2.|The main story, chapter 3.' && (await rows21(darker, 'chapters')).length === 1);
  await bp.locator('.tl-tree a', { hasText: 'Alternative Timeline B' }).click();
  await bp.locator('.tl-node.current', { hasText: 'Alternative Timeline B' }).waitFor();
  await bp.getByLabel('Canon status of this timeline').selectOption({ label: 'Alternate Canon' });
  await page.locator('.sidebar-title .tl-tag', { hasText: 'Alternate Canon' }).waitFor();
  eq('a timeline can be reclassified, and every status has its own tag', await bp.locator('.tl-tree .tl-tag').evaluateAll((els) => els.map((el) => el.className.replace('tl-tag ', ''))), ['tl-main', 'tl-non-canon', 'tl-alternate', 'tl-abandoned']);
  await shot('branches');

  // Compare with the parent, and merge one chapter on request
  await bp.locator('.tl-tree a', { hasText: 'Villain Victory' }).click();
  await bp.locator('.tl-node.current', { hasText: 'Villain Victory' }).waitFor();
  await bp.locator('.tl-diff li').nth(3).waitFor();
  eq('a timeline shows which chapters it has changed or added', await bp.locator('.tl-diff li').evaluateAll((els) => els.map((el) => `${el.querySelector('a').textContent}: ${el.querySelector('.badge').textContent}${el.querySelector('button') ? ' (can merge)' : ''}`)), ['Chapter 1: Same as the parent', 'Chapter 2: Same as the parent', 'Chapter 3: Changed here (can merge)', 'Chapter 4: Written here (can merge)']);
  await bp.locator('.tl-diff li', { hasText: 'Chapter 3' }).getByRole('button').click();
  check('merging says exactly what it will do, and asks', (await page.locator('dialog').innerText()).includes('Replace the text of Chapter 3 in Ashfall Saga') && (await page.locator('dialog').innerText()).includes('kept in that chapter\'s version history'));
  await page.locator('dialog').getByRole('button', { name: 'Cancel' }).click();
  check('cancelling a merge leaves the parent untouched', (await parentData()) === parentBefore);
  await bp.locator('.tl-diff li', { hasText: 'Chapter 3' }).getByRole('button').click();
  await page.locator('dialog').getByRole('button', { name: 'Merge this chapter' }).click();
  await bp.locator('.notice', { hasText: 'now has this timeline' }).waitFor();
  const parentAfterMerge = await rows21(p21, 'chapterContents');
  const mergeHistory = (await rows21(p21, 'chapterRevisions')).filter((r) => r.nodeId === `${p21}-c3`);
  check('the chosen chapter, and only that chapter, is copied into the parent', parentAfterMerge.map((c) => words21(c.doc)).join('|') === 'The main story, chapter 1.|The main story, chapter 2.|The gate falls. The villain walks in.|The main story, chapter 4.|The main story, chapter 5.' && (await rows21(p21, 'chapters')).length === 5 && (await rows21(p21, 'loreEntries'))[0].name === 'Alex', parentAfterMerge.map((c) => words21(c.doc)).join('|'));
  check('what the parent said before is kept in its version history', mergeHistory.some((r) => r.label === 'Before merging from “Villain Victory”' && words21(r.doc) === 'The main story, chapter 3.'), JSON.stringify(mergeHistory.map((r) => r.label)));
  await bp.locator('.tl-diff li', { hasText: 'Chapter 3' }).locator('.badge', { hasText: 'Same as the parent' }).waitFor();

  // Promotion changes labels only
  const beforePromotion = JSON.stringify([await rows21(p21, 'chapterContents'), await rows21(villain, 'chapterContents'), await rows21(timelineB, 'chapterContents')]);
  await bp.getByRole('button', { name: 'Promote to Main Canon…' }).click();
  check('promotion names what becomes of the old main canon', (await page.locator('dialog').innerText()).includes('“Ashfall Saga” becomes Alternate Canon') && (await page.locator('dialog').innerText()).includes('No text or data moves'));
  await page.locator('dialog').getByRole('button', { name: 'Promote', exact: true }).click();
  await page.locator('.sidebar-title .tl-tag', { hasText: 'Main Canon' }).waitFor();
  eq('a promoted timeline becomes the one main canon', await treeOf21(), ['Ashfall Saga [Alternate Canon]', '> Villain Victory [Main Canon] *', '> Alternative Timeline B [Alternate Canon]', '> > B, darker [Abandoned]']);
  check('…and no text moved', JSON.stringify([await rows21(p21, 'chapterContents'), await rows21(villain, 'chapterContents'), await rows21(timelineB, 'chapterContents')]) === beforePromotion);

  // The library lists the story once
  await page.goto(BASE);
  await page.locator('.card', { hasText: 'Ashfall Saga' }).waitFor();
  const titles21 = await page.locator('.card h3').allInnerTexts();
  check('the library shows the story once, with its timelines counted', titles21.includes('Ashfall Saga') && !titles21.some((t) => ['Villain Victory', 'Alternative Timeline B', 'B, darker'].includes(t)) && (await page.locator('.card', { hasText: 'Ashfall Saga' }).locator('.card-timelines').innerText()) === '4 timelines', titles21.join(' | '));
  await page.locator('.card', { hasText: 'Ashfall Saga' }).locator('.card-timelines').click();
  await bp.locator('.tl-tree a', { hasText: 'B, darker' }).click();
  await bp.locator('.tl-node.current', { hasText: 'B, darker' }).waitFor();
  await bp.getByRole('button', { name: 'Delete this timeline…' }).click();
  await page.locator('dialog input').fill('B, darker');
  await page.locator('dialog').getByRole('button', { name: 'Delete forever' }).click();
  await bp.locator('.tl-node.current', { hasText: 'Alternative Timeline B' }).waitFor();
  eq('a timeline can be deleted without touching the others', [await treeOf21(), (await rows21(darker, 'chapters')).length, (await rows21(timelineB, 'chapters')).length], [['Ashfall Saga [Alternate Canon]', '> Villain Victory [Main Canon]', '> Alternative Timeline B [Alternate Canon] *'], 0, 3]);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${villain}/branches`);
  await bp.locator('.tl-diff li').first().waitFor();
  check('mobile: the branches page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('mobile-branches');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 22: consequence analysis ---
  const p22 = await createProject('Heroes of Ash');
  await page.evaluate((projectId) => new Promise((resolve) => {
    const id = (key) => `${projectId}-${key}`;
    const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const entry = (key, category, name) => ({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 1, updatedAt: 1 });
    const chapters = [[20, ['Alex trained alone.']], [25, ['The offer came at dawn.', 'Alex signed, and Marcus handed him the Silver Badge at Association HQ.']], [26, ['Rain all day. Nobody came.']], [30, ['Vera watched the harbour.']], [32, ['The first report arrived.', 'Alex met Marcus on the roof to talk about the demons.']], [40, ['He showed the Silver Badge at the gate of Association HQ.']]];
    const stage = (key, node, title, event) => ({ id: id(key), startNodeId: id(`c${node}`), preset: 'friends', category: 'social', label: 'Friends', fromRole: 'Friend', toRole: 'Friend', directional: false, title, affinity: 'friendly', event, notes: '' });
    const status = { condition: '', transformations: '', reputation: '', knowledge: '', goals: '' };
    const snapshot = (key, node, label, gear, more = {}) => ({ id: id(key), projectId, entryId: id('alex'), nodeId: id(`c${node}`), label, systems: {}, gear, status: { ...status, ...more }, notes: '', createdAt: node, updatedAt: node });
    const thread = (key, title, state, characters, beats) => ({ id: id(key), projectId, title, premise: '', category: 'subplot', customCategory: '', status: state, characterIds: characters.map(id), locationIds: [], targetNodeId: null, targetNote: '', beats: beats.map(([node, name]) => ({ id: id(`${key}-b${node}`), nodeId: id(`c${node}`), title: name, note: '', createdAt: node })), notes: '', muted: false, createdAt: 1, updatedAt: 1 });
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'loreEntries', 'plotThreads', 'characterRelations', 'progressSnapshots', 'canonFacts'], 'readwrite');
      chapters.forEach(([number, lines], i) => {
        tx.objectStore('chapters').add({ id: id(`c${number}`), projectId, parentId: null, kind: 'chapter', title: `Chapter ${number}`, order: i, summary: '', notes: '', status: 'drafting', wordCount: 8, charCount: 40, createdAt: 1, updatedAt: 1 });
        tx.objectStore('chapterContents').add({ id: id(`c${number}`), projectId, doc: { type: 'doc', content: lines.map(para) }, rev: 1, savedAt: 1 });
      });
      for (const row of [entry('alex', 'character', 'Alex'), entry('marcus', 'character', 'Marcus'), entry('vera', 'character', 'Vera'), entry('hq', 'location', 'Association HQ'), entry('badge', 'item', 'Silver Badge')]) tx.objectStore('loreEntries').add(row);
      tx.objectStore('plotThreads').add(thread('demons', 'Demon Investigation', 'active', ['alex'], [[25, 'Alex is recruited'], [32, 'First demon report']]));
      tx.objectStore('plotThreads').add(thread('light', 'Lighthouse Mystery', 'active', ['vera'], [[30, 'A light']]));
      tx.objectStore('characterRelations').add({ id: id('bond'), projectId, fromId: id('alex'), toId: id('marcus'), stages: [stage('s1', 25, 'Partners', 'paired by the Association'), stage('s2', 40, 'Sworn brothers', '')], createdAt: 1, updatedAt: 1 });
      tx.objectStore('progressSnapshots').add(snapshot('n20', 20, 'Unaffiliated', []));
      tx.objectStore('progressSnapshots').add(snapshot('n25', 25, 'Recruit', [{ id: id('g1'), name: 'Silver Badge', kind: 'Key item', entryId: id('badge'), note: '' }], { reputation: 'Hero Association: member' }));
      tx.objectStore('progressSnapshots').add(snapshot('n40', 40, 'Veteran', [{ id: id('g2'), name: 'Silver Badge', kind: 'Key item', entryId: id('badge'), note: '' }], { reputation: 'Hero Association: member' }));
      tx.objectStore('canonFacts').add({ id: id('fact'), projectId, subject: 'HQ access', statement: 'Only badge holders may enter', kind: 'rule', status: 'canon', entryIds: [id('hq')], sources: [{ id: id('src'), type: 'chapter', refId: id('c25'), block: 1, quote: '', note: '', createdAt: 1 }], conflictsWith: [], replacedById: null, dismissed: [], history: [], notes: '', createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p22);
  const everything22 = () => page.evaluate((projectId) => new Promise((resolve) => {
    const stores = ['chapters', 'chapterContents', 'loreEntries', 'plotThreads', 'characterRelations', 'progressSnapshots', 'canonFacts', 'continuityRules', 'timelineEvents'];
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(stores);
      const out = {};
      for (const store of stores) tx.objectStore(store).getAll().onsuccess = (e) => { out[store] = e.target.result.filter((row) => row.projectId === projectId).sort((a, b) => String(a.id).localeCompare(String(b.id))); };
      tx.oncomplete = () => { open.result.close(); resolve(JSON.stringify(out)); };
    };
  }), p22);
  const before22 = await everything22();

  const qp = page.locator('.consequences-page');
  const tierLines = (tier) => qp.locator(`section.cq-${tier} .consequence .issue-message`).allInnerTexts();
  const consequence = (words) => qp.locator('.consequence', { hasText: words });
  await page.goto(`${BASE}/project/${p22}/consequences`);
  await qp.getByText('Pick the point you are thinking of changing').waitFor();
  check('consequence analysis has its own page in the sidebar', await page.locator('.sidebar nav a', { hasText: /^Consequences$/ }).isVisible());
  await qp.getByLabel('Chapter or scene to analyse').selectOption({ label: 'Chapter 25' });
  await qp.getByLabel('What would change').fill('Alex decides NOT to join the Hero Association');
  await qp.locator('.cq-line').waitFor();
  // The heading takes up the typed change a moment after the summary line appears.
  await qp.locator('.cq-summary h2', { hasText: 'Alex decides NOT' }).waitFor({ timeout: 10000 }).catch(() => {});
  check('the analysis names the point and the change, and sums up what is affected', (await qp.locator('.cq-summary h2').innerText()) === 'If Chapter 25 changes: Alex decides NOT to join the Hero Association' && (await qp.locator('.cq-line').innerText()) === 'Impact summary: 2 Characters, 1 Location, 1 Lore Entry, 1 Plot Thread, 2 Chapters, 1 Relationship, 1 Canon Fact', await qp.locator('.cq-line').innerText());
  eq('established consequences are the records tied to that exact point', await tierLines('established'), [
    'The thread “Demon Investigation” has its development “Alex is recruited” recorded in Chapter 25.',
    'Alex and Marcus become “Partners” starting in Chapter 25 (paired by the Association).',
    'Alex’s state “Recruit” is logged at Chapter 25: receives Silver Badge; now “Hero Association: member”.',
    'The canon fact “HQ access: Only badge holders may enter” cites Chapter 25 as its only source.',
    'Association HQ first appears in Chapter 25, and is named in 1 later chapter or scene.',
    'Marcus first appears in Chapter 25, and is named in 1 later chapter or scene.',
    'Silver Badge first appears in Chapter 25, and is named in 1 later chapter or scene.',
  ]);
  const potential22 = await tierLines('potential');
  eq('potential consequences are later things that involve the same people, places and threads', potential22, [
    'Chapter 32 involves Alex and Marcus and may need to account for the change.',
    'Chapter 40 involves Association HQ and Silver Badge and may need to account for the change.',
    'The thread “Demon Investigation” continues in Chapter 32; that development may lack what set it in motion.',
    'Alex and Marcus become “Sworn brothers” in Chapter 40; that turn may rest on what happens here.',
    'Alex has 1 later snapshot (Chapter 40) that carry forward from this point and may need revisiting.',
  ]);
  check('the two tiers are kept apart and labelled for what they are', (await qp.locator('section.cq-established > h2').innerText()).startsWith('Established consequences') && (await qp.locator('section.cq-potential > h2').innerText()).startsWith('Potential consequences') && (await qp.locator('section.cq-potential > p').first().innerText()).startsWith('Possibilities, not facts') && potential22.every((line) => /\b(may|could|might|check)\b/.test(line)));
  check('each consequence says what it rests on', (await consequence('Alex is recruited').first().locator('.cq-basis').innerText()) === 'A development placed in this chapter' && (await consequence('Chapter 32 involves').locator('.cq-basis').innerText()) === 'Named in the text after this point');
  check('unrelated chapters and threads are left out', ![...(await tierLines('established')), ...potential22].some((line) => ['Chapter 26', 'Lighthouse Mystery', 'Chapter 20 involves', 'Vera'].some((x) => line.includes(x))));
  eq('the inspector lists every affected chapter and profile', [await qp.locator('[aria-label="Affected chapters and profiles"] .cq-where').first().locator('a').allInnerTexts(), await qp.locator('[aria-label="Affected chapters and profiles"] .cq-where').nth(1).locator('a').allInnerTexts()], [['Chapter 32', 'Chapter 40'], ['Alex', 'Association HQ', 'Marcus', 'Silver Badge']]);
  await shot('consequences');

  // Jump links
  const ch32 = consequence('Chapter 32 involves');
  check('a later chapter is quoted at the line that picks the matter up', (await ch32.locator('.issue-excerpt').innerText()) === 'Alex met Marcus on the roof to talk about the demons.' && (await ch32.locator('mark').innerText()) === 'Alex');
  await ch32.getByRole('link', { name: 'Open at this line' }).click();
  await page.waitForURL(new RegExp(`/manuscript/${p22}-c32$`));
  await page.locator('.find-match').first().waitFor();
  check('…and its link lands on that line in the manuscript', (await page.locator('.find-current').innerText()) === 'Alex' && (await paragraphs())[1] === 'Alex met Marcus on the roof to talk about the demons.');
  await page.goBack();
  await qp.locator('.cq-line').waitFor();
  check('coming back, the analysis is still there', (await tierLines('established')).length === 7 && (await qp.getByLabel('What would change').inputValue()) === 'Alex decides NOT to join the Hero Association');
  eq('each kind of record links to where it is edited', await Promise.all(['Alex is recruited', 'become “Partners”', 'state “Recruit”', 'HQ access', 'Marcus first appears'].map(async (words) => (await consequence(words).first().locator('.issue-links a').first().getAttribute('href')).replace(`/project/${p22}`, ''))), [
    `/plot?thread=${p22}-demons`, `/relationships?rel=${p22}-bond`, `/progression?entry=${p22}-alex&snap=${p22}-n25&view=edit`, `/canon?fact=${p22}-fact`, `/characters/${p22}-marcus`,
  ]);
  await consequence('Marcus first appears').locator('.issue-links a').first().click();
  await page.waitForURL(new RegExp(`/characters/${p22}-marcus$`));
  await page.locator('.vault-profile').getByRole('heading', { name: 'Marcus', exact: true }).waitFor();
  check('a character’s profile opens for updating in context', (await page.locator('.vault-profile h1').innerText()) === 'Marcus');
  await page.goBack();
  await qp.locator('.cq-line').waitFor();

  // The author decides who the change touches
  eq('the analysis says who it takes the change to involve', await qp.locator('[aria-label="Taken to involve"] .chip-name').allInnerTexts(), ['Alex', 'Association HQ', 'Marcus', 'Silver Badge']);
  await qp.getByLabel('Also involves').selectOption({ label: 'Vera' });
  await consequence('Lighthouse Mystery').waitFor();
  check('adding someone widens the potential consequences only', (await tierLines('potential')).includes('Chapter 30 involves Vera and may need to account for the change.') && (await tierLines('potential')).includes('The open thread “Lighthouse Mystery” involves Vera and develops in Chapter 30; it could be affected.') && (await tierLines('established')).length === 7);
  await qp.getByRole('button', { name: 'Leave out Marcus' }).click();
  await consequence('Chapter 32 involves Alex and may').waitFor();
  check('leaving someone out narrows them', (await qp.getByText('Left out: Marcus').isVisible()) && !(await tierLines('potential')).some((line) => line.includes('Alex and Marcus and may')) && !(await qp.locator('[aria-label="Taken to involve"] .chip-name').allInnerTexts()).includes('Marcus'));

  // Ticking things off
  await consequence('Chapter 40 involves').getByLabel(/^Looked at/).check();
  await consequence('state “Recruit”').getByLabel(/^Looked at/).check();
  await page.reload();
  await qp.locator('.cq-line').waitFor();
  check('what has been looked at stays ticked', (await qp.locator('.consequence.looked').count()) === 2 && (await consequence('Chapter 40 involves').getByLabel(/^Looked at/).isChecked()));

  // From a thread's development, and from a chapter's plan
  await page.goto(`${BASE}/project/${p22}/plot?thread=${p22}-demons`);
  await page.locator('.rel-drawer .beat-list > li').first().waitFor();
  await page.locator('.rel-drawer .beat-list > li').first().getByRole('link', { name: 'What depends on this?' }).click();
  await qp.locator('.cq-line').waitFor();
  check('a single development can be analysed from its thread', (await qp.locator('.cq-summary h2').innerText()) === 'If “Alex is recruited” in the thread “Demon Investigation” changes' && (await tierLines('established')).join() === '“First demon report” in Chapter 32 is the thread’s next recorded step after this one.' && (await qp.getByRole('radio', { name: 'A thread development' }).getAttribute('aria-checked')) === 'true', (await tierLines('established')).join(' | '));
  await page.goto(`${BASE}/project/${p22}/manuscript/${p22}-c25`);
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByRole('link', { name: 'What depends on this chapter?' }).click();
  await qp.locator('.cq-line').waitFor();
  check('a chapter can be analysed from its plan', page.url().endsWith(`/consequences?node=${p22}-c25`) && (await tierLines('established')).length === 7);
  await qp.getByLabel('Chapter or scene to analyse').selectOption({ label: 'Chapter 26' });
  await qp.getByText('Nothing is recorded at this exact point.').waitFor();
  check('a chapter nothing hangs on says so', (await qp.locator('.cq-line').innerText()) === 'Impact summary: Nothing recorded depends on this');
  check('all of that analysis changed nothing in the project', (await everything22()) === before22);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p22}/consequences?node=${p22}-c25`);
  await qp.locator('.cq-line').waitFor();
  check('mobile: the analysis fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('mobile-consequences');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 23: workspace layout ---
  const p23 = await createProject('Studio Test');
  await page.evaluate((projectId) => new Promise((resolve) => {
    const id = (key) => `${projectId}-${key}`;
    const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const entry = (key, category, name) => ({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 1, updatedAt: 1 });
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'loreEntries', 'plotThreads', 'timelineEvents', 'characterRelations'], 'readwrite');
      [['c1', 'The Long Chapter', Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1} of a long chapter, long enough to need scrolling.`)], ['c2', 'The Short Chapter', ['Brief.']]].forEach(([key, title, lines], i) => {
        tx.objectStore('chapters').add({ id: id(key), projectId, parentId: null, kind: 'chapter', title, order: i, summary: '', notes: '', status: 'drafting', wordCount: lines.length * 9, charCount: 100, createdAt: 1, updatedAt: 1 });
        tx.objectStore('chapterContents').add({ id: id(key), projectId, doc: { type: 'doc', content: lines.map(para) }, rev: 1, savedAt: 1 });
      });
      for (const row of [entry('kai', 'character', 'Kai'), entry('ren', 'character', 'Ren'), entry('tower', 'location', 'The Tower')]) tx.objectStore('loreEntries').add(row);
      tx.objectStore('plotThreads').add({ id: id('thread'), projectId, title: 'The Heist', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [], notes: '', muted: false, createdAt: 1, updatedAt: 1 });
      tx.objectStore('timelineEvents').add({ id: id('event'), projectId, name: 'The Fall of the Tower', description: '', when: { precision: 'unknown' }, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 1, updatedAt: 1 });
      tx.objectStore('characterRelations').add({ id: id('bond'), projectId, fromId: id('kai'), toId: id('ren'), stages: [{ id: id('s1'), startNodeId: null, preset: 'friends', category: 'social', label: 'Friends', fromRole: 'Friend', toRole: 'Friend', directional: false, title: 'Old friends', affinity: 'friendly', event: '', notes: '' }], createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p23);
  const base23 = `${BASE}/project/${p23}`;
  const modeIs = (name) => page.locator('.studio-bar').getByRole('radio', { name, exact: true }).getAttribute('aria-checked');
  const goMode = async (name, urlPart) => {
    await page.locator('.studio-bar').getByRole('radio', { name, exact: true }).click();
    await page.waitForURL(urlPart);
    await page.locator('.studio-bar').getByRole('radio', { name, exact: true, checked: true, includeHidden: true }).waitFor({ state: 'attached' });
  };
  const leftDock = page.locator('.workspace > .dock-left');
  const rightDock = page.locator('.workspace > .dock-right');
  const widthOf = async (locator) => Math.round((await locator.boundingBox()).width);
  const stored23 = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
  const dragEdge = async (handle, dx) => {
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + 200, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + 200, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };

  await page.goto(base23);
  // Earlier sections opened and closed panels; this one starts from the standard layout.
  await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('novel-builder:studio')).forEach((key) => localStorage.removeItem(key)));
  await page.reload();
  await page.locator('.studio-bar').waitFor();
  eq('every page offers the four workspaces, starting in Drafting with the usual layout', [await page.locator('.studio-bar [role=radio]').allInnerTexts(), await modeIs('Drafting'), await leftDock.getAttribute('data-panel'), await rightDock.count(), await widthOf(leftDock)], [['Drafting', 'Planning', 'Worldbuilding', 'Editing'], 'true', 'auto', 0, 232]);

  // Switching workspaces
  await goMode('Planning', /\/organizer$/);
  await goMode('Worldbuilding', /\/codex$/);
  await goMode('Editing', new RegExp(`/manuscript/${p23}-c1$`));
  await page.locator('.ms-panel[data-panel="continuity"]').waitFor();
  check('each workspace opens its own centre and panels', (await page.locator('.ms-panel').getByText('No open issues').isVisible()) && (await page.locator('.ms-nav .toc').isVisible()));
  await goMode('Drafting', new RegExp(`/manuscript/${p23}-c1$`));
  check('drafting shows the manuscript with its tools closed and a word-count bar', (await page.locator('.ms-panel').count()) === 0 && (await page.locator('.ms-nav .toc').isVisible()) && (await page.locator('.goal-bar').innerText()).startsWith('Today'), await page.locator('.goal-bar').innerText());

  // The manuscript survives a round trip through the other workspaces
  await page.locator(text).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('A new first line. ');
  await saved();
  await page.locator('.ms-scroll').evaluate((el) => { el.scrollTop = 900; });
  await page.waitForTimeout(200);
  await goMode('Planning', /\/organizer$/);
  await goMode('Drafting', new RegExp(`/manuscript/${p23}-c1$`));
  await page.locator(text).waitFor();
  await page.waitForFunction(() => document.querySelector('.ms-scroll')?.scrollTop > 800);
  check('switching away and back keeps the chapter, the text and the place in it', (await paragraphs()).some((p) => p.includes('A new first line.')) && (await paragraphs()).length === 80 && Math.abs((await page.locator('.ms-scroll').evaluate((el) => el.scrollTop)) - 900) < 40);
  await page.reload();
  await page.locator(text).waitFor();
  await page.waitForFunction(() => document.querySelector('.ms-scroll')?.scrollTop > 800);
  check('the scroll position survives a reload', Math.abs((await page.locator('.ms-scroll').evaluate((el) => el.scrollTop)) - 900) < 40);

  // Panels beside the manuscript: what they show, how wide, which side
  await page.locator('.ms-nav').getByLabel('Contents shows').selectOption('threads');
  await page.locator('.ms-nav [aria-label="Plot threads"]').waitFor();
  check('the left panel can show plot threads instead of chapters', (await page.locator('.ms-nav [aria-label="Plot threads"]').innerText()).includes('The Heist') && (await page.locator('.ms-nav .toc').count()) === 0);
  await page.locator('.ms-nav').getByLabel('Contents shows').selectOption('codex');
  check('…or the worldbuilding tree', (await page.locator('.ms-nav [aria-label="Worldbuilding tree"]').innerText()).replace(/\s+/g, ' ').includes('Characters 2 Kai Ren'));
  await page.locator('.ms-nav').getByLabel('Contents shows').selectOption('auto');
  await page.locator('.ms-nav .toc').waitFor();
  await page.getByRole('button', { name: 'Plan and reference', exact: true }).click();
  await page.locator('.ms-panel').getByRole('tab', { name: 'Plan' }).waitFor();
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('timeline');
  await page.locator('.ms-panel [aria-label="Timeline"]').waitFor();
  check('the right panel can be a quick reference: timeline', (await page.locator('.ms-panel [aria-label="Timeline"]').innerText()).includes('The Fall of the Tower'));
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('relationships');
  await page.locator('.ms-panel [aria-label="Relationships of Kai"] li').waitFor();
  check('…the relationship inspector', (await page.locator('.ms-panel').getByLabel('Relationships of', { exact: true }).locator('option').allInnerTexts()).join() === 'Kai,Ren' && (await page.locator('.ms-panel [aria-label="Relationships of Kai"]').innerText()).replace(/\s+/g, ' ').trim() === 'Ren Old friends', `${(await page.locator('.ms-panel').getByLabel('Relationships of', { exact: true }).locator('option').allInnerTexts()).join()} | ${(await page.locator('.ms-panel [aria-label="Relationships of Kai"]').innerText()).replace(/\s+/g, ' ')}`);
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('reference');
  check('…or character bios', (await page.locator('.ms-panel').getByPlaceholder('Search the codex…').isVisible()) && (await page.locator('.ms-panel').innerText()).includes('Kai'));
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('notes');
  await page.locator('.ms-panel').getByLabel('Notes', { exact: true }).fill('Remember the ladder.');
  const panelBefore = await widthOf(page.locator('.ms-panel'));
  await dragEdge(page.locator('.ms-panel .dock-resize'), -80);
  const panelAfter = await widthOf(page.locator('.ms-panel'));
  check('a panel is resized by dragging its edge', panelBefore === 340 && Math.abs(panelAfter - 420) <= 2, `${panelBefore} → ${panelAfter}`);
  await page.locator('.ms-panel .dock-resize').focus();
  await page.keyboard.press('ArrowRight');
  check('…or with the arrow keys', Math.abs((await widthOf(page.locator('.ms-panel'))) - (panelAfter - 16)) <= 2);
  await page.locator('.ms-panel').getByRole('button', { name: 'Move the right panel to the other side' }).click();
  await page.locator('.ms-nav[data-panel="notes"]').waitFor();
  await page.locator('.ms-panel [aria-label="Chapters and scenes"]').waitFor();
  check('panels swap sides', (await page.locator('.ms-panel [aria-label="Chapters and scenes"]').isVisible()) && (await page.locator('.ms-nav').getByLabel('Notes', { exact: true }).inputValue()) === 'Remember the ladder.', `${await page.locator('.ms-panel').getAttribute('data-panel')} | ${await page.locator('.ms-panel [aria-label="Chapters and scenes"]').count()} | ${await page.locator('.ms-nav').getByLabel('Notes', { exact: true }).inputValue()}`);
  await page.locator('.ms-panel .dock-grip').dragTo(page.locator('.ms-nav .dock-body'));
  await page.locator('.ms-panel[data-panel="notes"]').waitFor();
  check('…by dragging one onto the other, too', await page.locator('.ms-nav .toc').isVisible());
  await page.reload();
  await page.locator(text).waitFor();
  check('what each panel shows, its width and whether it is open all survive a reload', (await page.locator('.ms-panel').getAttribute('data-panel')) === 'notes' && Math.abs((await widthOf(page.locator('.ms-panel'))) - (panelAfter - 16)) <= 2 && (await page.locator('.ms-panel').getByLabel('Notes', { exact: true }).inputValue()) === 'Remember the ladder.' && (await modeIs('Drafting')) === 'true');
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('auto');
  await page.locator('.ms-panel').getByRole('button', { name: 'Hide panel' }).click();

  // Panels beside the other pages are a separate pair
  await page.goto(`${base23}/codex`);
  await page.locator('.studio-bar').waitFor();
  check('the manuscript\'s panels do not follow you to other pages', (await rightDock.count()) === 0 && (await leftDock.getAttribute('data-panel')) === 'auto' && (await page.locator('.sidebar nav a').count()) > 15);
  await page.locator('.studio-bar').getByRole('button', { name: 'Right panel' }).click();
  await rightDock.waitFor();
  await rightDock.getByLabel('Right panel shows').selectOption('threads');
  check('a reference drawer can be opened beside any page', (await rightDock.locator('[aria-label="Plot threads"]').innerText()).includes('The Heist'));
  await leftDock.getByLabel('Left panel shows').selectOption('chapters');
  check('the left panel can show chapters while the centre shows something else', (await leftDock.locator('[aria-label="Chapters and scenes"] a').allInnerTexts()).join() === 'The Long Chapter,The Short Chapter' && (await page.locator('.sidebar-title strong').innerText()) === 'Studio Test');
  await dragEdge(leftDock.locator('.dock-resize'), 60);
  check('the sidebar is resizable too', Math.abs((await widthOf(leftDock)) - 292) <= 2, String(await widthOf(leftDock)));
  await leftDock.getByRole('button', { name: 'Hide the left panel' }).click();
  await leftDock.waitFor({ state: 'detached' });
  check('a panel can be hidden, and brought back from the bar', (await page.locator('.studio-bar').getByRole('button', { name: 'Left panel' }).getAttribute('aria-pressed')) === 'false');
  await page.locator('.studio-bar').getByRole('button', { name: 'Left panel' }).click();
  await leftDock.getByLabel('Left panel shows').selectOption('auto');
  await page.locator('.sidebar nav a').first().waitFor();
  const layout23 = await stored23('novel-builder:studio:layout');
  check('all of it is saved as it is changed', layout23.drafting.left.width === 292 && layout23.drafting.right.kind === 'threads' && layout23.drafting.right.open === true && layout23.drafting.writeRight.kind === 'auto' && (await stored23(`novel-builder:studio:session:${p23}`)).mode === 'drafting', JSON.stringify(layout23.drafting));

  // Presets
  await page.locator('.sidebar nav a', { hasText: /^Workspace$/ }).click();
  const sp23 = page.locator('.studio-page');
  await sp23.getByRole('button', { name: 'Use Pure Writer' }).waitFor();
  eq('the five workflow presets are offered', await sp23.locator('[aria-label="Presets"] strong').allInnerTexts(), ['Pure Writer', 'Worldbuilder', 'Outliner', 'Revision Editor', 'Progression Fantasy', 'Standard']);
  await sp23.getByRole('button', { name: 'Use Pure Writer' }).click();
  await goMode('Planning', /\/organizer$/);
  await goMode('Drafting', /\/manuscript\//);
  await page.locator('.ms[data-focus]').waitFor();
  check('Pure Writer drafts with nothing but the page', (await page.locator('.ms-nav').count()) === 0 && (await page.locator('.ms-panel').count()) === 0 && !(await page.locator('.ms-bar').isVisible()));
  await page.getByRole('button', { name: 'Exit focus' }).click();
  await page.goto(`${base23}/studio`);
  await sp23.getByRole('button', { name: 'Use Worldbuilder' }).click();
  check('a preset says which workspace it opens in', (await sp23.locator('.notice').innerText()).includes('opens in the Worldbuilding workspace') && (await modeIs('Worldbuilding')) === 'true');
  await sp23.getByRole('button', { name: 'Open Drafting' }).click();
  await page.waitForURL(/\/manuscript\//);
  await goMode('Worldbuilding', /\/codex$/);
  check('Worldbuilder puts the lore tree on the left and relationships on the right', (await leftDock.getAttribute('data-panel')) === 'codex' && (await rightDock.getAttribute('data-panel')) === 'relationships' && (await rightDock.locator('[aria-label="Relationships of Kai"]').isVisible()));

  // A layout of the project's own, export and import
  await page.goto(`${base23}/studio`);
  await sp23.getByLabel('Give “Studio Test” a layout of its own').check();
  await sp23.getByLabel('Planning: centre shows').selectOption('plot');
  check('a project can have a layout of its own', (await sp23.locator('.page-header [role=status]').innerText()).includes("a layout of this project's own") && (await stored23(`novel-builder:studio:layout:${p23}`)).planning.center === 'plot' && (await stored23('novel-builder:studio:layout')).planning.center === 'organizer');
  await page.goto(`${BASE}/project/${p22}/studio`);
  await sp23.getByLabel('Planning: centre shows').waitFor();
  check('…which other projects do not share', (await sp23.getByLabel('Planning: centre shows').inputValue()) === 'organizer' && (await sp23.locator('.page-header [role=status]').innerText()).includes('your layout for every project'));
  await page.goto(`${base23}/studio`);
  const [download23] = await Promise.all([page.waitForEvent('download'), sp23.getByRole('button', { name: 'Export layout' }).click()]);
  const exported23 = JSON.parse(readFileSync(await download23.path(), 'utf8'));
  check('the layout exports as a file', exported23.format === 'novel-builder-workspace' && exported23.layout.planning.center === 'plot' && exported23.layout.worldbuilding.left.kind === 'codex' && exported23.shortcuts.search === 'Mod+K' && download23.suggestedFilename() === 'Studio-Test-workspace.json', download23.suggestedFilename());
  exported23.layout.editing.center = 'canon';
  await sp23.getByLabel('Layout file').setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported23)) });
  await sp23.locator('.notice', { hasText: 'Layout imported.' }).waitFor();
  check('…and imports again', (await sp23.getByLabel('Editing: centre shows').inputValue()) === 'canon');
  await sp23.getByLabel('Layout file').setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await sp23.locator('.notice.error').waitFor();
  check('a file that is not a layout is refused', (await sp23.locator('.notice.error').innerText()).includes('not a workspace layout') && (await sp23.getByLabel('Editing: centre shows').inputValue()) === 'canon');
  await sp23.getByLabel('Give “Studio Test” a layout of its own').uncheck();
  await sp23.getByRole('button', { name: 'Reset to Standard' }).click();
  check('going back to the shared layout and the standard preset undoes all of it', (await sp23.getByLabel('Editing: centre shows').inputValue()) === 'manuscript' && (await stored23(`novel-builder:studio:layout:${p23}`)) === null);

  // Shortcuts
  await page.keyboard.press('Alt+Digit2');
  await page.waitForURL(/\/organizer$/);
  await page.keyboard.press('Alt+Digit3');
  await page.waitForURL(/\/codex$/);
  await page.keyboard.press('Alt+Backquote');
  await page.waitForURL(/\/manuscript\//);
  check('shortcuts switch workspaces', (await modeIs('Editing')) === 'true');
  await page.keyboard.press('Alt+Digit1');
  await page.locator('.studio-bar').getByRole('radio', { name: 'Drafting', exact: true, checked: true }).waitFor();
  await page.locator('.ms-nav').waitFor();
  await page.keyboard.press('ControlOrMeta+Alt+BracketLeft');
  await page.locator('.ms-nav').waitFor({ state: 'detached' });
  await page.keyboard.press('ControlOrMeta+Alt+BracketRight');
  await page.locator('.ms-panel').waitFor();
  await page.keyboard.press('ControlOrMeta+Alt+BracketLeft');
  await page.keyboard.press('ControlOrMeta+Alt+BracketRight');
  await page.locator('.ms-panel').waitFor({ state: 'detached' });
  check('…and show or hide the panels', await page.locator('.ms-nav').isVisible());
  await page.keyboard.press('ControlOrMeta+Shift+KeyF');
  await page.locator('.ms[data-focus]').waitFor();
  await page.keyboard.press('ControlOrMeta+Shift+KeyF');
  await page.locator('.ms:not([data-focus])').waitFor();
  await page.goto(`${base23}/studio`);
  const shortcutRow = (label) => sp23.locator('.shortcut-table tr', { hasText: label });
  await sp23.getByRole('button', { name: 'Change the shortcut for Search the project' }).click();
  await page.keyboard.press('KeyK');
  check('a shortcut that would get in the way of typing is refused', (await sp23.locator('.notice.error').innerText()).includes('would get in the way of typing'));
  await page.keyboard.press('ControlOrMeta+Shift+KeyP');
  await shortcutRow('Search the project').locator('kbd').waitFor();
  await page.keyboard.press('ControlOrMeta+KeyK');
  await page.waitForTimeout(250);
  const oldOpens = await page.locator('.search-dialog').isVisible();
  await page.keyboard.press('ControlOrMeta+Shift+KeyP');
  await page.locator('.search-dialog').waitFor();
  await page.keyboard.press('Escape');
  check('a shortcut can be rebound: the new keys work and the old ones stop', !oldOpens && (await stored23('novel-builder:studio:shortcuts')).search === 'Mod+Shift+P' && (await page.locator('.search-open kbd').innerText()).includes('P'));
  await sp23.getByRole('button', { name: 'Change the shortcut for Log a character snapshot' }).click();
  await page.keyboard.press('Alt+Digit1');
  check('taking a combination from another action says so and unbinds it', (await sp23.locator('.notice').innerText()).includes('“Switch to Drafting” has no shortcut') && (await shortcutRow('Switch to Drafting').locator('kbd').innerText()) === 'Not set');
  await page.keyboard.press('Alt+Digit1');
  await page.waitForURL(/\/progression$/);
  check('the rebound shortcut does its new job', true);
  await page.reload();
  await page.locator('.studio-bar').waitFor();
  await page.keyboard.press('ControlOrMeta+Shift+KeyP');
  await page.locator('.search-dialog').waitFor();
  await page.keyboard.press('Escape');
  check('shortcuts survive a reload', true);
  await page.goto(`${base23}/studio`);
  await sp23.getByRole('button', { name: 'Reset shortcuts' }).click();
  await page.keyboard.press('ControlOrMeta+KeyK');
  await page.locator('.search-dialog').waitFor();
  await page.keyboard.press('Escape');
  check('and can be reset', (await shortcutRow('Switch to Drafting').locator('kbd').innerText()) !== 'Not set');

  // Editor appearance
  await sp23.locator('[aria-label="Editor appearance"]').getByRole('button', { name: 'Focus', exact: true }).click();
  await sp23.locator('[aria-label="Editor appearance"] input[type=range]').nth(2).fill('1');
  await page.goto(`${base23}/manuscript/${p23}-c2`);
  await page.locator(text).waitFor();
  check('the Focus theme and paragraph spacing reach the editor', (await page.locator('.ms').getAttribute('data-theme')) === 'focus' && (await page.locator('.ms').evaluate((el) => el.style.getPropertyValue('--write-gap'))) === '1em');
  await page.reload();
  await page.locator(text).waitFor();
  check('…and are still there after a reload', (await page.locator('.ms').getAttribute('data-theme')) === 'focus');
  await shot('studio-writing');
  await page.goto(`${base23}/studio`);
  await sp23.locator('[aria-label="Editor appearance"]').getByRole('button', { name: 'Light', exact: true }).click();
  await sp23.locator('[aria-label="Editor appearance"] input[type=range]').nth(2).fill('0');
  await shot('studio');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${base23}/studio`);
  await sp23.getByRole('button', { name: 'Use Pure Writer' }).waitFor();
  const fits23 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.goto(`${base23}/codex`);
  await page.locator('.app-bar').waitFor();
  check('mobile: the app bar and workspace settings fit the screen', fits23 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 24: genre modules ---
  const p24 = await createProject('Module Test');
  await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'loreEntries'], 'readwrite');
      ['One', 'Two', 'Three'].forEach((title, i) => {
        const id = `${projectId}-c${i + 1}`;
        tx.objectStore('chapters').add({ id, projectId, parentId: null, kind: 'chapter', title, order: i, summary: '', notes: '', status: 'drafting', wordCount: 3, charCount: 12, createdAt: 1, updatedAt: 1 });
        tx.objectStore('chapterContents').add({ id, projectId, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Chapter ${title}.` }] }] }, rev: 1, savedAt: 1 });
      });
      for (const name of ['Kai', 'Ren']) tx.objectStore('loreEntries').add({ id: `${projectId}-${name.toLowerCase()}`, projectId, category: 'character', name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p24);
  const rows24 = (projectId, store) => page.evaluate(([id, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === id)); };
    };
  }), [projectId, store]);
  const base24 = `${BASE}/project/${p24}`;
  const mp = page.locator('.modules-page');
  const tp = page.locator('.module-page');
  const navLabels = () => page.locator('.sidebar nav a').allInnerTexts();
  const moduleCard = (name) => mp.locator('.module-card', { has: page.locator('.thread-title', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/&,]/g, '\\$&')}$`) }) });
  const switchModule = async (name, on) => {
    await moduleCard(name).getByRole('button', { name: `${on ? 'Enable' : 'Disable'} ${name}`, exact: true }).click();
    await mp.locator('.notice', { hasText: `${name} is ${on ? 'on' : 'off'}` }).waitFor();
  };
  const openTool = async (title) => {
    await tp.getByRole('tab', { name: title, exact: true }).click();
    await tp.locator(`section[aria-label="${title}"]`).waitFor();
  };
  const addEntry24 = async (label, name) => {
    await tp.getByLabel(label, { exact: true }).fill(name);
    await tp.getByLabel(label, { exact: true }).press('Enter');
    await tp.getByRole('link', { name, exact: true }).first().waitFor();
  };
  // In a registry a new record joins the list; opening it shows every field of its category.
  const addRecord24 = async (label, name) => {
    await tp.getByLabel(label, { exact: true }).fill(name);
    await tp.getByLabel(label, { exact: true }).press('Enter');
    await tp.locator('.registry-rows button', { hasText: name }).first().waitFor();
    await tp.locator('.registry-rows button', { hasText: name }).first().click();
    await tp.locator(`.registry-record[aria-label="${name}"]`).waitFor();
    return tp.locator('.registry-record');
  };
  const typeIn = async (label, value, scope = tp) => {
    const input = scope.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.blur();
    await page.waitForTimeout(450);
  };
  const entry24 = async (name, projectId = p24) => (await rows24(projectId, 'loreEntries')).find((e) => e.name === name);
  const until24 = async (test, what) => {
    for (let i = 0; i < 80; i++) { if (await test()) return; await page.waitForTimeout(100); }
    throw new Error(`Timed out waiting for ${what}`);
  };
  const TEN = ['Fantasy Worldbuilding', 'Progression Fantasy & LitRPG', 'Science Fiction & Space Exploration', 'Mystery, Detective & Investigation', 'Romance & Relationship Development', 'Horror & Suspense', 'Superhero & Superpower', 'Historical Fiction', 'Contemporary Fiction & Social Dynamics', 'Political Intrigue, Factions & Power Structures'];
  const MYSTERY = 'Mystery, Detective & Investigation';

  // The Module Manager
  await page.goto(`${base24}/settings`);
  await page.getByRole('link', { name: 'Open the Module Manager' }).click();
  await mp.locator('.module-card').first().waitFor();
  eq('the Module Manager is reached from the novel’s settings and lists exactly the ten genre modules, all available', [await mp.locator('[aria-label="Genre modules"] .thread-title').allInnerTexts(), await mp.locator('.page-header [role=status]').innerText(), await mp.locator('[aria-label="Genre modules"] .module-state').allInnerTexts().then((all) => [...new Set(all.map((t) => t.toLowerCase()))])], [TEN, 'No modules on: just the core', ['available']]);
  const card24 = moduleCard('Progression Fantasy & LitRPG');
  await card24.locator('summary', { hasText: 'Details' }).click();
  const cardText24 = (await card24.innerText()).replace(/\s+/g, ' ');
  check('a card says what the module is: its icon, description, what it does, its version and what it shares', cardText24.includes('Track levels, XP, attributes, Jobs, classes, skills, ranks, evolutions, and progression-based character development.') && cardText24.includes('Classes and Jobs') && cardText24.includes('Version 2 · built in · works with this version of the app') && cardText24.includes('Works with: Systems, Character progression, Characters') && cardText24.includes('It is added only if you ask for it') && (await card24.locator('.module-icon').count()) === 1 && (await card24.getByRole('button', { name: 'Enable Progression Fantasy & LitRPG', exact: true }).innerText()) === 'Enable Module', cardText24);
  const coreNav = await navLabels();
  check('with no modules the sidebar is just the core', !coreNav.includes('Systems') && !coreNav.includes('Character progression') && coreNav.includes('Modules') && coreNav.includes('Manuscript') && (await page.locator('.nav-modules').count()) === 0, coreNav.join(', '));

  // Mystery: on, used, off, on again
  const before24 = { entries: (await rows24(p24, 'loreEntries')).length, systems: (await rows24(p24, 'systems')).length, records: (await rows24(p24, 'moduleRecords')).length };
  await switchModule(MYSTERY, true);
  check('enabling a module adds its workspace to the sidebar under its own name, and its categories to the Codex', (await page.locator('.nav-modules a').allInnerTexts()).join() === 'Mystery & Investigation' && (await rows24(p24, 'loreSchemas')).map((c) => c.name).sort().join() === 'Alibis,Cases,Clues & Evidence,Suspects' && (await mp.locator('.page-header [role=status]').innerText()) === '1 module on in this project' && (await moduleCard(MYSTERY).locator('.module-state').innerText()).toLowerCase() === 'enabled');
  eq('…and creates nothing: no suspect, clue or case exists until the author makes one', { entries: (await rows24(p24, 'loreEntries')).length, systems: (await rows24(p24, 'systems')).length, records: (await rows24(p24, 'moduleRecords')).length }, before24);
  eq('an enabled module offers Open Module, Configure and Disable', await moduleCard(MYSTERY).locator('.actions').locator('a, button').allInnerTexts(), ['Open Module', 'Configure', 'Disable']);
  await moduleCard(MYSTERY).getByRole('link', { name: 'Open Module' }).click();
  await tp.getByRole('tab').first().waitFor();
  eq('the mystery workspace opens on its dashboard, with its tools beside it', await tp.getByRole('tab').allInnerTexts(), ['Dashboard', 'Cases', 'Suspect board', 'Suspects, victims & persons of interest', 'Clues & evidence', 'Evidence matrix', 'Motive, means & opportunity', 'Alibis', 'Who knows what', 'Red herrings', 'Revelations', 'Investigation timeline']);
  check('an empty dashboard says so, and counts nothing it was not given', (await tp.locator('.module-dashboard .tile strong').allInnerTexts()).join() === '0,0,0,0' && (await tp.locator('.module-dashboard').innerText()).includes('Turning the module on creates no records'));

  await openTool('Cases');
  const case24 = await addRecord24('New case', 'The Vale Inheritance');
  await case24.getByLabel('Status', { exact: true }).selectOption('Active');
  await typeIn('Central question', 'Who forged the will?', case24);
  await case24.getByLabel('Add to Suspects').selectOption({ label: 'Kai' });
  await case24.getByRole('group', { name: 'Suspects' }).locator('.chip', { hasText: 'Kai' }).waitFor();
  await until24(async () => (await entry24('The Vale Inheritance')).fields.length === 3, 'the case to be saved');
  const stored24 = await entry24('The Vale Inheritance');
  check('a case is a record in the Codex with typed fields: a status the author sets, text, and links to the project’s own characters', stored24.category.startsWith('custom-') && stored24.fields.map((f) => `${f.key}=${f.value}`).sort().join('; ') === `Central question=Who forged the will?; Status=Active; Suspects=${p24}-kai` && (await case24.getByRole('link', { name: 'Open in the Codex' }).getAttribute('href')) === `/project/${p24}/codex/${stored24.id}`, JSON.stringify(stored24.fields));
  check('the list filters by the status and shows what each record says at a glance', (await tp.getByLabel('Filter by Status').locator('option').allInnerTexts()).join() === 'Any status,Planned,Active,Partially resolved,Resolved,Abandoned,Not set' && (await tp.locator('.registry-rows button').innerText()).replace(/\s+/g, ' ').includes('The Vale Inheritance Active Central question: Who forged the will?'));

  await openTool('Suspects, victims & persons of interest');
  const butler24 = await addRecord24('New suspect', 'The Butler');
  await butler24.getByLabel('Character', { exact: true }).selectOption({ label: 'Kai' });
  await addRecord24('New suspect', 'The Heiress');
  await openTool('Suspect board');
  await tp.getByLabel('Status of The Butler').selectOption('Suspect');
  await tp.getByLabel('Status of The Heiress').selectOption('Cleared');
  await tp.locator('.board-column[aria-label="Cleared"] .board-card').waitFor();
  eq('the suspect board groups suspects by status; a suspect need not be guilty', await tp.locator('.board-column').evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label')}: ${[...el.querySelectorAll('.board-card > a')].map((a) => a.textContent).join(', ')}`)), ['Suspect: The Butler', 'Person of interest: ', 'Witness: ', 'Victim: ', 'Cleared: The Heiress', 'Culprit: ']);
  const butler = await entry24('The Butler');
  check('a suspect is a Codex entry that points at a character; no second Kai was made', (await tp.locator('.board-card > a', { hasText: 'The Butler' }).getAttribute('href')) === `/project/${p24}/codex/${butler.id}` && butler.fields.find((f) => f.key === 'Character').value === `${p24}-kai` && (await rows24(p24, 'loreEntries')).filter((e) => e.category === 'character').length === 2);
  await openTool('Motive, means & opportunity');
  await typeIn('Motive of The Butler', 'Gambling debts');
  await typeIn('Alibi of The Butler', 'Polishing silver, alone');
  check('motive against alibi is a table over the same suspects, writing to their records', (await entry24('The Butler')).fields.map((f) => `${f.key}=${f.value}`).sort().join('; ') === `Alibi=Polishing silver, alone; Character=${p24}-kai; Motive=Gambling debts; Status=Suspect`);
  await openTool('Clues & evidence');
  const glove24 = await addRecord24('New clue', 'A torn glove');
  await typeIn('What it is', 'A torn piece of fabric was found at the scene.', glove24);
  await typeIn('What it seems to show', 'The fabric may belong to the butler.', glove24);
  await glove24.getByLabel('Standing', { exact: true }).selectOption('An interpretation');
  await until24(async () => (await entry24('A torn glove')).fields.length === 3, 'the clue to be saved');
  check('evidence, its interpretation and what is confirmed are kept apart: an interpretation is not made a fact', (await entry24('A torn glove')).fields.map((f) => `${f.key}=${f.value}`).sort().join('; ') === 'Standing=An interpretation; What it is=A torn piece of fabric was found at the scene.; What it seems to show=The fabric may belong to the butler.' && (await glove24.getByLabel('What it really means', { exact: true }).inputValue()) === '' && (await rows24(p24, 'canonFacts').catch(() => [])).length === 0);
  await openTool('Evidence matrix');
  await tp.getByLabel('A torn glove and The Butler').selectOption('Implicates');
  await tp.getByLabel('A torn glove and The Heiress').selectOption('Clears');
  await page.waitForTimeout(200);
  eq('the evidence matrix records what each clue says about each suspect', (await rows24(p24, 'moduleRecords')).filter((r) => r.kind === 'cell').map((r) => r.state).sort(), ['Clears', 'Implicates']);
  await openTool('Red herrings');
  await tp.getByLabel('New entry in Red herrings').fill('The gardener’s muddy boots');
  await tp.getByLabel('Chapter for the new entry').selectOption({ label: 'One' });
  await tp.getByRole('button', { name: 'Add', exact: true }).click();
  await tp.locator('.tool-log > li').waitFor();
  await tp.getByLabel('State of The gardener’s muddy boots').selectOption('Debunked');
  await tp.getByLabel('Debunked in: The gardener’s muddy boots').selectOption({ label: 'Three' });
  await tp.getByLabel('The gardener’s muddy boots is about').selectOption({ label: 'The Heiress' });
  await tp.locator('.tool-log-links a', { hasText: 'The Heiress' }).waitFor();
  await typeIn('Notes on The gardener’s muddy boots', 'Points at the gardener until the frost date is checked.');
  const herring = (await rows24(p24, 'moduleRecords')).find((r) => r.kind === 'log');
  check('a red herring is tied to where it is laid, where it is cleared up and who it points at, with the author’s notes', herring.state === 'Debunked' && herring.nodeId === `${p24}-c1` && herring.endNodeId === `${p24}-c3` && herring.entryIds.length === 1 && herring.note === 'Points at the gardener until the frost date is checked.' && (await tp.locator('.tool-log-links a').first().getAttribute('href')) === `/project/${p24}/manuscript/${p24}-c1`);
  await shot('module-mystery');
  await tp.getByRole('tab', { name: 'Dashboard', exact: true }).click();
  await tp.locator('.module-dashboard .tile').first().waitFor();
  eq('the dashboard counts what the module now holds, and lists what changed last', { tiles: (await tp.locator('.module-dashboard .tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), recent: (await tp.getByRole('region', { name: 'Recently changed' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())[0], empty: (await tp.getByRole('region', { name: 'Still empty' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()) }, { tiles: ['1 Cases', '2 Suspects', '1 Clues & Evidence', '0 Alibis', '2 Evidence matrix', '1 Red herrings'], recent: 'A torn glove Clue', empty: [] });
  await tp.getByRole('button', { name: '2 Suspects: open Suspect board' }).click();
  await tp.locator('section[aria-label="Suspect board"]').waitFor();
  check('a count on the dashboard opens the list it counts', (await tp.locator('.board-card').count()) === 2);

  const dataBefore24 = JSON.stringify([await rows24(p24, 'loreEntries'), await rows24(p24, 'moduleRecords'), await rows24(p24, 'chapterContents')]);
  await page.goto(`${base24}/modules`);
  await switchModule(MYSTERY, false);
  check('disabling a module takes its workspace out of the sidebar and marks it disabled', (await page.locator('.nav-modules').count()) === 0 && (await mp.locator('.page-header [role=status]').innerText()) === 'No modules on: just the core' && (await moduleCard(MYSTERY).locator('.module-state').innerText()).toLowerCase() === 'disabled' && (await moduleCard(MYSTERY).innerText()).includes('In use here: 4 records in its categories, 3 in its logs and tables.'));
  check('…and deletes nothing: only its one empty category is tucked away', JSON.stringify([await rows24(p24, 'loreEntries'), await rows24(p24, 'moduleRecords'), await rows24(p24, 'chapterContents')]) === dataBefore24 && (await rows24(p24, 'projectModules'))[0].enabled === false && (await rows24(p24, 'loreSchemas')).filter((c) => c.archived).map((c) => c.name).join() === 'Alibis');
  await page.goto(`${base24}/modules/mystery`);
  await tp.getByText('This module is switched off').waitFor();
  check('its page says it is off rather than showing stale tools', (await tp.getByRole('tab').count()) === 0);
  await page.goto(`${base24}/codex`);
  await page.locator('.entry-list a', { hasText: 'The Butler' }).click();
  check('what was written with it is still in the Codex', (await field('Name').inputValue()) === 'The Butler' && (await page.locator('.codex-entry textarea, .codex-entry input').evaluateAll((els) => els.some((el) => el.value === 'Gambling debts'))));
  await page.goto(`${base24}/manuscript/${p24}-c1`);
  await page.locator(text).click();
  await page.keyboard.type(' Still writing.');
  await saved();
  await page.goto(`${base24}/export`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  check('the core carries on regardless: writing saves and export opens', (await rows24(p24, 'chapterContents')).some((c) => JSON.stringify(c.doc).includes('Still writing.')) && (await page.getByRole('heading', { level: 1 }).innerText()).length > 0);
  await page.goto(`${base24}/modules/mystery`);
  await tp.getByRole('button', { name: 'Turn it on' }).click();
  await tp.getByRole('tab').first().waitFor();
  await openTool('Evidence matrix');
  check('enabling it again brings everything back', (await tp.getByLabel('A torn glove and The Butler').inputValue()) === 'Implicates' && (await page.locator('.nav-modules a').count()) === 1 && (await rows24(p24, 'loreSchemas')).every((c) => !c.archived));

  // Configure: the author's own names, order and stages
  await tp.getByRole('button', { name: 'Configure', exact: true }).click();
  const cfg24 = page.getByRole('dialog').filter({ hasText: `Configure ${MYSTERY}` });
  await typeIn('Name in the sidebar', 'Whodunit', cfg24);
  await typeIn('Name of Cases', 'Casebook', cfg24);
  await cfg24.getByLabel('Show Who knows what').click();
  await until24(async () => (await rows24(p24, 'projectModules'))[0].settings?.hidden?.includes('knowledge'), 'the tool to be hidden');
  await cfg24.getByRole('button', { name: 'Move Revelations up' }).click();
  await typeIn('Stages of Revelations', 'Buried, Whispered, Out', cfg24);
  await until24(async () => (await rows24(p24, 'projectModules'))[0].settings?.states?.reveals?.length === 3, 'the settings to be saved');
  check('a module’s categories can be opened for custom fields from its settings', (await cfg24.getByRole('group', { name: 'Categories and fields' }).getByRole('button').allInnerTexts()).join() === 'Cases…,Suspects…,Clues & Evidence…,Alibis…');
  await cfg24.getByRole('button', { name: 'Done' }).click();
  const tabs24 = await tp.getByRole('tab').allInnerTexts();
  check('configuring a module renames its sidebar entry and tools, hides and reorders them', (await page.locator('.nav-modules a').allInnerTexts()).join() === 'Whodunit' && (await tp.locator('h1').innerText()).includes('Whodunit') && tabs24.includes('Casebook') && !tabs24.includes('Cases') && !tabs24.includes('Who knows what') && tabs24.indexOf('Revelations') < tabs24.indexOf('Red herrings'), tabs24.join(' | '));
  await openTool('Revelations');
  await tp.getByLabel('New entry in Revelations').fill('The will was forged');
  await tp.getByRole('button', { name: 'Add', exact: true }).click();
  await tp.getByLabel('State of The will was forged').waitFor();
  eq('…and a log steps through the author’s own stages', await tp.getByLabel('State of The will was forged').locator('option').allInnerTexts(), ['Buried', 'Whispered', 'Out']);

  // Several modules at once, on the same characters
  await page.goto(`${base24}/modules`);
  for (const name of ['Fantasy Worldbuilding', 'Romance & Relationship Development', 'Political Intrigue, Factions & Power Structures']) await switchModule(name, true);
  eq('several modules are on together, each with its own entry in the sidebar', await page.locator('.nav-modules a').allInnerTexts(), ['Whodunit', 'Fantasy', 'Romance', 'Politics & Factions']);
  await page.locator('.nav-modules a', { hasText: 'Fantasy' }).click();
  await openTool('Spells & techniques');
  const spell24 = await addRecord24('New spell', 'Fireball');
  await spell24.getByLabel('Add to Known users').selectOption({ label: 'Kai' });
  await spell24.getByRole('group', { name: 'Known users' }).locator('.chip', { hasText: 'Kai' }).waitFor();
  await spell24.getByLabel('Add to Known users').selectOption({ label: 'Ren' });
  await spell24.getByRole('group', { name: 'Known users' }).locator('.chip', { hasText: 'Ren' }).waitFor();
  await openTool('Magic systems');
  const magic24 = await addRecord24('New magic system', 'Emberbinding');
  check('a magic system assumes nothing: every rule is an empty field of the author’s to fill or remove', (await magic24.locator('.typed-fields .field > span').allInnerTexts()).slice(0, 8).join() === 'Category,Origin,Known users,Related cultures,Related locations,History,How it is accessed,How it is activated' && (await magic24.locator('.typed-fields textarea').evaluateAll((els) => els.every((el) => el.value === ''))));
  await page.locator('.nav-modules a', { hasText: 'Romance' }).click();
  await openTool('Romantic arcs');
  const arc24 = await addRecord24('New romantic arc', 'Kai & Ren');
  for (const who of ['Kai', 'Ren']) {
    await arc24.getByLabel('Add to Partners').selectOption({ label: who });
    await arc24.getByRole('group', { name: 'Partners' }).locator('.chip', { hasText: who }).waitFor();
  }
  await typeIn('Attraction', '7', arc24);
  await typeIn('Tension', '9', arc24);
  await openTool('Attraction & tension');
  check('meters show an arc’s attraction and tension, from the numbers the author gave', (await tp.getByRole('meter', { name: 'Attraction meter for Kai & Ren' }).getAttribute('aria-valuenow')) === '7' && (await tp.getByRole('meter', { name: 'Tension meter for Kai & Ren' }).getAttribute('aria-valuenow')) === '9');
  await openTool('Emotional intensity');
  for (const [title, chapter, value] of [['First glance', 'One', '2'], ['The quarrel', 'Two', '8'], ['Quiet after', 'Three', '5']]) {
    await tp.getByLabel('New entry in Emotional intensity').fill(title);
    await tp.getByLabel('Chapter for the new entry').selectOption({ label: chapter });
    await tp.getByRole('button', { name: 'Add', exact: true }).click();
    await tp.getByLabel(`Intensity of ${title}`).waitFor();
    await typeIn(`Intensity of ${title}`, value);
  }
  await tp.locator('.arc-chart svg polyline').waitFor();
  check('the emotional arc is drawn through the chapters', (await tp.locator('.arc-chart circle').count()) === 3 && (await tp.locator('.arc-chart svg').getAttribute('aria-label')) === 'Intensity through the story' && (await tp.locator('.arc-chart polyline').getAttribute('points')).split(' ').length === 3);
  await openTool('Emotional milestones');
  await tp.getByRole('button', { name: '+ First kiss' }).click();
  await tp.getByLabel('First kiss done').waitFor();
  await tp.getByLabel('First kiss is about').selectOption({ label: 'Kai & Ren' });
  await tp.getByLabel('First kiss done').click();
  await tp.locator('.tool-log > li.done').waitFor();
  check('milestones are a checklist, with suggestions that may be skipped', (await tp.getByRole('button', { name: '+ First kiss' }).count()) === 0 && (await tp.getByRole('button', { name: '+ Confession' }).count()) === 1);
  await page.locator('.nav-modules a', { hasText: 'Politics & Factions' }).click();
  await openTool('Leaders & offices');
  const office24 = await addRecord24('New office', 'Guildmaster');
  await office24.getByLabel('Current holder', { exact: true }).selectOption({ label: 'Kai' });
  await until24(async () => (await entry24('Guildmaster')).fields.some((f) => f.key === 'Current holder'), 'the office holder to be saved');

  await page.goto(`${base24}/characters/${p24}-kai`);
  const inModules = page.locator('.vault-profile').getByRole('region', { name: 'In the modules' });
  await inModules.waitFor();
  const lines24 = async (module) => (await inModules.getByRole('group', { name: module, exact: true }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).sort();
  eq('ONE CHARACTER, MANY MODULES: Kai is a suspect, a spell’s user, half of a romance and an office-holder, and is still one record', { mystery: await lines24(MYSTERY), fantasy: await lines24('Fantasy Worldbuilding'), romance: await lines24('Romance & Relationship Development'), politics: await lines24('Political Intrigue, Factions & Power Structures'), characters: (await rows24(p24, 'loreEntries')).filter((e) => e.category === 'character').map((e) => e.name).sort() }, {
    mystery: ['The Butler Suspect · Character', 'The Vale Inheritance Case · Suspects'],
    fantasy: ['Fireball Spell · Known users'],
    romance: ['Kai & Ren Romantic Arc · Partners'],
    politics: ['Guildmaster Office · Current holder'],
    characters: ['Kai', 'Ren'],
  });
  check('each line leads to the record in its module, and the panel takes the module’s own name', (await inModules.getByRole('link', { name: 'Fireball' }).getAttribute('href')) === `/project/${p24}/modules/high-fantasy?tool=spells&record=${(await entry24('Fireball')).id}` && (await inModules.getByRole('group', { name: MYSTERY, exact: true }).locator('.vault-label').innerText()).toLowerCase() === 'whodunit' && (await entry24('Kai')).fields.length === 0);
  await shot('module-character');
  await inModules.getByRole('link', { name: 'Fireball' }).click();
  await tp.locator('.registry-record[aria-label="Fireball"]').waitFor();
  check('…opening on that record', (await tp.locator('.registry-record').getByRole('group', { name: 'Known users' }).locator('.chip').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace('✕', '').trim()).join() === 'Kai,Ren');

  // Shared search and story graph
  await page.keyboard.press('ControlOrMeta+k');
  await searchFor('fireball');
  check('SHARED SEARCH: a module’s record is found from anywhere, and says what it is and which module it belongs to', (await dlg.locator('.search-group', { has: page.locator('h3', { hasText: 'Spells & Techniques' }) }).locator('.search-module').innerText()).toLowerCase() === 'fantasy' && (await dlg.locator('.search-entity strong').allInnerTexts()).includes('Fireball'), `${await dlg.locator('.search-group > h3').allInnerTexts()} / ${await dlg.locator('.search-entity strong').allInnerTexts()}`);
  await dlg.locator('.search-entity').first().click();
  await page.waitForURL(new RegExp(`/codex/${(await entry24('Fireball')).id}$`));
  check('…and opens that record', (await field('Name').inputValue()) === 'Fireball');
  await page.goto(`${base24}/graph`);
  await page.locator('.graph-filters .chip-toggle').first().waitFor();
  const kinds24 = (await page.locator('.graph-filters .chip-toggle').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check('SHARED STORY GRAPH: module records are in the story graph, linked to the characters they name', ['Spells & Techniques 1', 'Romantic Arcs 1', 'Offices 1', 'Suspects 2', 'Characters 2'].every((kind) => kinds24.includes(kind)), kinds24.join(' | '));

  // Science fiction: the calculator works only from what it is given
  await page.goto(`${base24}/modules`);
  await switchModule('Science Fiction & Space Exploration', true);
  await page.goto(`${base24}/modules/scifi?tool=travel`);
  await tp.locator('.calculator').waitFor();
  const results24 = () => tp.locator('.calculator dd').allInnerTexts();
  const first24 = await results24();
  await tp.getByLabel('Speed', { exact: true }).fill('2');
  await tp.getByLabel('Distance', { exact: true }).fill('730.5');
  check('the travel calculator works out a journey from the author’s own distance and speed, and from nothing else', first24.join(' | ') === '1 days | 0 years' && (await results24()).join(' | ') === '365.25 days | 1 years' && (await tp.locator('section[aria-label="Travel-time calculator"]').innerText()).includes('It assumes nothing about physics'), `${first24.join(' | ')} → ${(await results24()).join(' | ')}`);

  // Progression: the system pages, and an example system only on request
  await page.goto(`${base24}/modules`);
  await switchModule('Progression Fantasy & LitRPG', true);
  const litNav = await navLabels();
  check('the progression module brings Character progression into the sidebar (systems live in Characters), and adds no system of its own', !litNav.includes('Systems') && litNav.includes('Character progression') && litNav.includes('Progression Systems') && (await rows24(p24, 'systems')).length === 0);
  await page.goto(`${base24}/modules/progression`);
  await tp.getByRole('button', { name: 'Add the example system' }).click();
  await tp.getByRole('button', { name: 'Add the example system' }).waitFor({ state: 'detached' });
  check('its example system is added only when the author asks for it', (await rows24(p24, 'systems')).map((s) => s.name).join() === 'The System');
  await openTool('System registry');
  await tp.getByRole('link', { name: 'Open System registry' }).click();
  await page.waitForURL(/\/characters\/systems$/);
  await page.locator('.systems-page .system-card', { hasText: 'The System' }).waitFor();
  check('its system registry is the Systems designer, not a second one', true);
  await page.goto(`${base24}/modules/progression?tool=ranks`);
  await tp.getByText('No progression snapshots yet.').waitFor();
  await page.goto(`${base24}/modules/progression?tool=classes`);
  const class24 = await addRecord24('New class or job', 'Arcane Knight');
  check('whether something is a class or a Job is a label the author chooses', (await class24.getByLabel('Kind', { exact: true }).locator('option').allInnerTexts()).join() === 'Not set,Class,Job');
  await page.goto(`${base24}/modules`);
  await switchModule('Progression Fantasy & LitRPG', false);
  await switchModule('Progression Fantasy & LitRPG', true);
  check('switching it off and on again does not add the system twice', (await rows24(p24, 'systems')).length === 1);

  // Family trees come from the Relationship Manager
  await page.goto(`${base24}/relationships`);
  await link('Kai', 'Parent / Child', 'Ren');
  await page.goto(`${base24}/modules`);
  for (const name of ['Horror & Suspense', 'Superhero & Superpower', 'Historical Fiction', 'Contemporary Fiction & Social Dynamics']) await switchModule(name, true);
  check('all ten modules can be on in one novel', (await mp.locator('.page-header [role=status]').innerText()) === '10 modules on in this project' && (await page.locator('.nav-modules a').count()) === 10);
  await page.goto(`${base24}/modules/historical?tool=lineage`);
  await tp.locator('.lineage').waitFor();
  eq('a family tree is drawn from the relationships already recorded, a generation to a row', await tp.locator('.lineage > li').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim())), ['Generation 1 Kai Parent of Ren', 'Generation 2 Ren Child of Kai']);
  check('…and keeps no relationships of its own', (await rows24(p24, 'moduleRecords')).every((r) => r.moduleId !== 'historical') && (await rows24(p24, 'characterRelations')).length === 1);

  // Every tool of every module draws
  const broken24 = [];
  let drawn24 = 0;
  for (const row of await rows24(p24, 'projectModules')) {
    await page.goto(`${base24}/modules/${row.moduleId}`);
    await tp.getByRole('tab').first().waitFor();
    for (const tool of row.definition.tools.filter((t) => !(row.settings?.hidden ?? []).includes(t.id))) {
      await openTool(row.settings?.titles?.[tool.id] || tool.title);
      drawn24 += 1;
      if (await tp.getByText('This tool needs').count()) broken24.push(`${row.definition.name} › ${tool.title}`);
    }
  }
  eq('every tool of all ten modules finds the categories and fields it needs', [broken24, drawn24 > 95], [[], true]);
  check('two modules that add to the same built-in category share one field, not one each', (await rows24(p24, 'loreSchemas')).find((c) => c.key === 'faction').fields.filter((f) => f.name === 'Members').length === 1 && (await rows24(p24, 'loreSchemas')).find((c) => c.key === 'character').fields.filter((f) => f.name === 'Species').length === 1);
  await page.goto(`${base24}/modules/horror?tool=states`);
  await tp.getByLabel('State of Kai').selectOption('Hunted');
  await tp.locator('.board-column[aria-label="Hunted"] .board-card').waitFor();
  check('a module can work on core records: the project’s characters by state, opening their profile', (await tp.locator('.board-column[aria-label="Hunted"] .board-card > a').innerText()) === 'Kai' && (await tp.locator('.board-column[aria-label="Hunted"] .board-card > a').getAttribute('href')) === `/project/${p24}/characters/${p24}-kai`);
  await shot('module-board');
  await page.goto(`${base24}/modules/horror?tool=tension`);
  await tp.getByLabel('New entry in Fear & tension').fill('The cellar door is open');
  await tp.getByLabel('Chapter for the new entry').selectOption({ label: 'Two' });
  await tp.getByRole('button', { name: 'Add', exact: true }).click();
  await tp.getByLabel('State of The cellar door is open').selectOption('Tense');
  await typeIn('Tension of The cellar door is open', '6');
  check('tension is what the author says it is for a chapter; nothing reads it off the text', (await rows24(p24, 'moduleRecords')).some((r) => r.toolId === 'tension' && r.state === 'Tense' && r.value === 6 && r.nodeId === `${p24}-c2`) && (await tp.locator('section[aria-label="Fear & tension"]').innerText()).includes('It is never read off the text'));

  // A module of the author's own
  await page.goto(`${base24}/modules`);
  await mp.getByLabel('Module name').fill('Cape & Cowl');
  await mp.getByLabel('Module is for').fill('Capes and secret identities');
  await mp.getByLabel('Module description').fill('Masks and what they cost.');
  await mp.getByRole('group', { name: 'Categories to include' }).getByLabel(/^Romantic Arcs/).check();
  await mp.getByRole('group', { name: 'Categories to include' }).getByLabel(/^Unknown Phenomena/).check();
  await mp.getByLabel('System to include').selectOption({ label: 'The System' });
  await mp.getByRole('button', { name: 'Save as a module' }).click();
  await moduleCard('Cape & Cowl').waitFor();
  await moduleCard('Cape & Cowl').locator('summary', { hasText: 'Details' }).click();
  const customText = (await moduleCard('Cape & Cowl').innerText()).replace(/\s+/g, ' ');
  check('a custom module packages chosen categories and a system, with tools worked out for it', customText.includes('Adds to the Codex: Romantic Arcs, Unknown Phenomena.') && customText.includes('Offers an example system, “The System”') && customText.includes('Romantic Arcs by stage') && customText.includes('Yours') && customText.includes('Shares records with: Romance & Relationship Development (Romantic Arcs); Horror & Suspense (Unknown Phenomena)'), customText);
  const [download24] = await Promise.all([page.waitForEvent('download'), moduleCard('Cape & Cowl').getByRole('button', { name: 'Export' }).click()]);
  const file24 = readFileSync(await download24.path(), 'utf8');
  const exported24 = JSON.parse(file24);
  check('it exports as a shareable file with no story content in it', exported24.format === 'novel-builder-module' && exported24.module.name === 'Cape & Cowl' && exported24.module.system.name === 'The System' && !file24.includes('Kai') && !file24.includes('Butler') && !file24.includes('Emberbinding') && !file24.includes('Kai & Ren') && download24.suggestedFilename() === 'Cape-Cowl.module.json', download24.suggestedFilename());
  await moduleCard('Cape & Cowl').getByRole('button', { name: 'Remove Cape & Cowl from my modules' }).click();
  await moduleCard('Cape & Cowl').waitFor({ state: 'detached' });
  await mp.getByLabel('Module file').setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"something"}') });
  await mp.locator('.notice.error').waitFor();
  check('a file that is not a module is refused', (await mp.locator('.notice.error').innerText()).includes('not a module'));
  await mp.getByLabel('Module file').setInputFiles({ name: 'hero.module.json', mimeType: 'application/json', buffer: Buffer.from(file24) });
  await moduleCard('Cape & Cowl').waitFor();
  check('…and the exported file imports again', (await mp.locator('.notice').innerText()).includes('was added to your modules'));

  // In another project: clean until switched on
  const p24b = await createProject('Module Target');
  await page.goto(`${BASE}/project/${p24b}/modules`);
  await moduleCard('Cape & Cowl').waitFor();
  check('a new project starts with just the core, however many modules other projects use', (await page.locator('.nav-modules').count()) === 0 && (await rows24(p24b, 'loreSchemas')).length === 0 && (await rows24(p24b, 'systems')).length === 0 && !(await navLabels()).includes('Systems') && (await mp.locator('.module-state').allInnerTexts()).every((t) => t.toLowerCase() === 'available'));
  await switchModule('Cape & Cowl', true);
  const target = { categories: (await rows24(p24b, 'loreSchemas')).map((c) => `${c.name}: ${c.fields.length} fields`).sort(), systems: (await rows24(p24b, 'systems')).length, entries: (await rows24(p24b, 'loreEntries')).length };
  eq('the imported module sets up its categories and fields in another project, and no records', target, { categories: ['Romantic Arcs: 19 fields', 'Unknown Phenomena: 5 fields'], systems: 0, entries: 0 });
  await page.locator('.nav-modules a', { hasText: 'Cape & Cowl' }).click();
  await tp.getByRole('tab').first().waitFor();
  check('…with working tools and the system pages', (await tp.getByRole('tab').allInnerTexts()).includes('Romantic Arcs by stage') && (await navLabels()).includes('Character progression'));
  await openTool('Romantic Arcs by stage');
  await addEntry24('New romantic arc', 'Mask & Shadow');
  await tp.getByLabel('Stage of Mask & Shadow').selectOption('Attraction');
  await tp.locator('.board-column[aria-label="Attraction"] .board-card').waitFor();
  check('…that are usable straight away', true);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${base24}/modules`);
  await mp.locator('.module-card').first().waitFor();
  const fits24 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.goto(`${base24}/modules/mystery?tool=cases`);
  await tp.locator('.registry-rows button').first().click();
  await tp.locator('.registry-record').waitFor();
  check('mobile: the Module Manager fits, and a registry shows one record at a time with a way back', fits24 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && !(await tp.locator('.registry-list').isVisible()) && (await tp.locator('.registry-back').isVisible()));
  await shot('module-mobile');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 25: AI brainstorming assistant ---
  const p25 = await createProject('Brainstorm Test');
  await page.evaluate((projectId) => new Promise((resolve) => {
    const id = (key) => `${projectId}-${key}`;
    const entry = (key, category, name, more = {}) => ({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 1, updatedAt: 1, ...more });
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'loreEntries', 'plotThreads'], 'readwrite');
      tx.objectStore('chapters').add({ id: id('c1'), projectId, parentId: null, kind: 'chapter', title: 'The Barrier', order: 0, summary: 'Alex reaches the barrier.', notes: '', status: 'drafting', wordCount: 4, charCount: 20, createdAt: 1, updatedAt: 1 });
      tx.objectStore('chapterContents').add({ id: id('c1'), projectId, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'UNSENT MANUSCRIPT PROSE.' }] }] }, rev: 1, savedAt: 1 });
      tx.objectStore('loreEntries').add(entry('alex', 'character', 'Alex', { summary: 'A reluctant recruit.', description: 'Possesses Solar Absorption.', notes: 'PRIVATE NOTE TO SELF' }));
      tx.objectStore('loreEntries').add(entry('marcus', 'character', 'Marcus', { summary: 'His handler.' }));
      tx.objectStore('loreEntries').add(entry('guild', 'faction', 'Hero Association', { summary: 'Licenses heroes.' }));
      tx.objectStore('loreEntries').add(entry('other', 'character', 'Bystander', { summary: 'NOT ATTACHED.' }));
      tx.objectStore('plotThreads').add({ id: id('thread'), projectId, title: 'Demon Investigation', premise: 'Who is opening the gates?', category: 'mystery', customCategory: '', status: 'active', characterIds: [id('alex')], locationIds: [], targetNodeId: null, targetNote: '', beats: [], notes: '', muted: false, createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p25);
  const all25 = (stores) => page.evaluate(([projectId, names]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(names);
      const out = {};
      for (const name of names) tx.objectStore(name).getAll().onsuccess = (e) => { out[name] = e.target.result.filter((row) => row.projectId === projectId).sort((a, b) => String(a.id).localeCompare(String(b.id))); };
      tx.oncomplete = () => { open.result.close(); resolve(out); };
    };
  }), [p25, stores]);
  const story25 = async () => JSON.stringify(await all25(['chapters', 'chapterContents', 'loreEntries', 'plotThreads', 'canonFacts', 'ideas']));
  const base25 = `${BASE}/project/${p25}`;
  const ap = page.locator('.assistant-page');
  const bs = ap.locator('.brainstorm');
  const kinds25 = () => bs.locator('.brainstorm-items > li').evaluateAll((els) => els.map((el) => `${el.dataset.kind}: ${el.querySelector('p').textContent.trim()}`));
  const suggestion = (words) => bs.locator('.bi-suggestion', { hasText: words });
  // The assistant's reply, written against whatever fact numbers the app sent.
  const reply25 = (sent) => {
    const fact = (label) => /^(F\d+) /m.exec(sent.split('\n').find((line) => line.includes(label)) ?? '')?.[1] ?? 'F1';
    return { items: [
      { type: 'established', fact: fact('[Alex · Character] Alex is a character'), text: 'Alex is the most powerful hero who ever lived.' },
      { type: 'established', fact: 'F999', text: 'Marcus is secretly Alex’s brother.' },
      { type: 'assumption', text: 'The barrier is vulnerable to extreme energy overloads.' },
      { type: 'suggestion', title: 'Overload the barrier', text: 'Alex overloads his ability to break the barrier.', based_on: [fact('[Alex · Character] Alex is a character'), 'F999'], fits: 'plot' },
      { type: 'suggestion', title: 'A debt to Marcus', text: 'Marcus looks away, and expects the favour repaid.', based_on: [fact('[Marcus · Character]')], fits: 'character' },
      { type: 'suggestion', title: 'The second ledger', text: 'The Association keeps a second, unofficial ledger of gate breaches.', fits: 'worldbuilding' },
      { type: 'suggestion', title: 'Wait for dusk', text: 'The barrier thins when the light goes.', fits: 'notes' },
    ] };
  };

  await page.goto(`${base25}/assistant`);
  await bs.getByLabel('Brainstorm question').waitFor();
  check('the assistant has a real page now, with six modes', (await page.locator('.sidebar nav a', { hasText: /^Assistant$/ }).isVisible()) && (await bs.getByRole('radiogroup', { name: 'Brainstorming mode' }).getByRole('radio').allInnerTexts()).join() === 'Plot,Character,Worldbuilding,Conflict,What-if,Problem-solving');
  await bs.getByRole('radio', { name: 'Problem-solving' }).click();
  await bs.getByLabel('Brainstorm question').fill('How does Alex get past the barrier without Marcus stopping him?');
  await bs.getByRole('button', { name: '+ Alex' }).waitFor();
  check('entries named in the question are offered as attachments', (await bs.locator('.badge.reason').allInnerTexts()).join() === '+ Alex,+ Marcus');
  await bs.getByRole('button', { name: '+ Alex' }).click();
  await bs.getByRole('button', { name: '+ Marcus' }).click();
  await bs.getByLabel('Attach a codex entry').selectOption({ label: 'Hero Association' });
  await bs.getByLabel("Attach a chapter's plan").selectOption({ label: 'The Barrier' });
  eq('the author chooses exactly what is attached', await bs.locator('[aria-label="Attached"] .chip-name').allInnerTexts(), ['Alex', 'Marcus', 'Hero Association', 'Plan: The Barrier']);
  await bs.locator('.sent-preview summary').click();
  await page.waitForFunction(() => document.querySelectorAll('.fact-list li').length >= 5);
  const facts25 = (await bs.locator('.fact-list li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const request25 = await bs.locator('.sent-text').innerText();
  check('what will be given is shown first: the attached entries and what the project records about them', facts25.some((f) => f.includes('Alex · Character Alex is a character. A reluctant recruit. Possesses Solar Absorption.')) && facts25.some((f) => f.includes('Plot thread “Demon Investigation” (Mystery, Active). Who is opening the gates?')) && facts25.some((f) => f.includes('The Barrier · plan The Barrier: Alex reaches the barrier.')) && facts25.every((f) => /^F\d+/.test(f)), facts25.join('\n      '));
  check('…with the full request readable, and nothing that was not attached', request25.includes('Mode: Problem-solving.') && request25.includes('THE AUTHOR ASKS:\nHow does Alex get past the barrier without Marcus stopping him?') && !['PRIVATE NOTE', 'UNSENT MANUSCRIPT', 'Bystander', 'NOT ATTACHED'].some((secret) => request25.includes(secret)));
  await bs.locator('.sent-preview summary').click();
  const before25 = await story25();

  // Without a connected assistant: copy the question, paste the answer
  check('by default no assistant is connected and the app sends nothing', (await bs.getByRole('button', { name: 'Copy the question' }).isVisible()) && (await bs.getByRole('button', { name: 'Brainstorm', exact: true }).count()) === 0);
  await bs.getByRole('button', { name: 'Copy the question' }).click();
  const copied25 = await page.evaluate(() => navigator.clipboard.readText());
  check('the question can be copied whole, with the shape the answer must take', copied25.includes('THE AUTHOR ASKS:') && copied25.includes('Reply with JSON only'));
  await bs.getByLabel('Pasted answer').fill(`Sure! Here are some ideas:\n\`\`\`json\n${JSON.stringify(reply25(copied25))}\n\`\`\``);
  await bs.getByRole('button', { name: 'Read the answer' }).click();
  await bs.locator('.brainstorm-items > li').first().waitFor();
  eq('the answer is sorted into established, assumption and suggestion', await kinds25(), [
    'established: A reluctant recruit. Possesses Solar Absorption. Alex · Character'.replace('A reluctant', 'Alex is a character. A reluctant'),
    'assumption: Marcus is secretly Alex’s brother.',
    'assumption: The barrier is vulnerable to extreme energy overloads.',
    'suggestion: Overload the barrier. Alex overloads his ability to break the barrier.',
    'suggestion: A debt to Marcus. Marcus looks away, and expects the favour repaid.',
    'suggestion: The second ledger. The Association keeps a second, unofficial ledger of gate breaches.',
    'suggestion: Wait for dusk. The barrier thins when the light goes.',
  ]);
  check('an established item is the project’s own words, not the assistant’s', !(await bs.locator('.brainstorm-items').innerText()).includes('most powerful hero') && (await bs.locator('.bi-established a').getAttribute('href')) === `/project/${p25}/codex/${p25}-alex`);
  check('a claim of canon the project does not make is shown as an assumption, and says why', (await bs.locator('.bi-assumption').first().innerText()).includes('The assistant presented this as established, but it is not in your project.'));
  check('each kind is marked and explained', (await bs.locator('.brainstorm-items .bi-tag').allInnerTexts()).join() === 'ESTABLISHED,ASSUMPTION,ASSUMPTION,SUGGESTED,SUGGESTED,SUGGESTED,SUGGESTED' && (await bs.locator('.epistemic-key li').allInnerTexts()).map((t) => t.split(' ')[0]).join() === 'Established,Suggested,Assumption', (await bs.locator('.brainstorm-items .bi-tag').allInnerTexts()).join());
  check('a suggestion says which facts it builds on, dropping references that are not real', (await suggestion('Overload the barrier').locator('.bi-fact').allInnerTexts()).join() === 'Alex · Character');
  eq('every suggestion carries the approval buttons', await suggestion('Overload the barrier').getByRole('group').locator('button').allInnerTexts(), ['+ Add to Plot Thread', '+ Add to Notes / Ideas', '+ Add to Worldbuilding', '+ Add to Character Notes', 'Discard']);
  check('receiving an answer changes nothing in the project', (await story25()) === before25);
  await shot('assistant');

  // The approval pipeline
  await suggestion('Overload the barrier').getByRole('button', { name: '+ Add to Plot Thread' }).click();
  check('adding asks where, and says it goes in as a note', (await suggestion('Overload the barrier').getByLabel('Where to add it').locator('option').allInnerTexts()).join() === 'Demon Investigation,A new plot thread…' && (await suggestion('Overload the barrier').locator('form').innerText()).includes('added to the thread’s notes as an idea'));
  check('…and nothing is written until it is confirmed', (await story25()) === before25);
  await suggestion('Overload the barrier').getByRole('button', { name: 'Add it' }).click();
  await suggestion('Overload the barrier').locator('.bi-where').waitFor();
  const thread25 = (await all25(['plotThreads'])).plotThreads[0];
  check('an approved idea lands in the thread’s notes, leaving the thread itself as it was', thread25.notes === 'Idea: Overload the barrier. Alex overloads his ability to break the barrier.' && thread25.premise === 'Who is opening the gates?' && thread25.beats.length === 0 && (await suggestion('Overload the barrier').locator('.bi-where a').getAttribute('href')) === `/project/${p25}/plot?thread=${p25}-thread`);
  await suggestion('A debt to Marcus').getByRole('button', { name: '+ Add to Character Notes' }).click();
  await suggestion('A debt to Marcus').getByLabel('Where to add it').selectOption({ label: 'Marcus' });
  await suggestion('A debt to Marcus').getByRole('button', { name: 'Add it' }).click();
  await suggestion('A debt to Marcus').locator('.bi-where').waitFor();
  const marcus25 = (await all25(['loreEntries'])).loreEntries.find((e) => e.name === 'Marcus');
  const notes25 = (await all25(['characterNotes'])).characterNotes.filter((n) => n.entryId === marcus25.id);
  check('…or among a character’s notes, leaving their record as it was', notes25.length === 1 && notes25[0].title === 'A debt to Marcus' && notes25[0].content === 'Marcus looks away, and expects the favour repaid.' && marcus25.notes === '' && marcus25.summary === 'His handler.' && marcus25.description === '' && (await suggestion('A debt to Marcus').locator('.bi-where a').getAttribute('href')) === `/project/${p25}/characters/${marcus25.id}/notes`, JSON.stringify(notes25));
  await suggestion('The second ledger').getByRole('button', { name: '+ Add to Worldbuilding' }).click();
  await suggestion('The second ledger').getByLabel('Where to add it').selectOption('new');
  await suggestion('The second ledger').getByLabel('Name for the new one').fill('The Second Ledger');
  await suggestion('The second ledger').getByLabel('Category for the new entry').selectOption({ label: 'Items & Artifacts' });
  await suggestion('The second ledger').getByRole('button', { name: 'Add it' }).click();
  await suggestion('The second ledger').locator('.bi-where').waitFor();
  const ledger25 = (await all25(['loreEntries'])).loreEntries.find((e) => e.name === 'The Second Ledger');
  check('…or starts a new worldbuilding entry', ledger25?.category === 'item' && ledger25.notes.startsWith('Idea: The second ledger.'));
  await suggestion('Wait for dusk').getByRole('button', { name: 'Discard' }).click();
  await bs.locator('.bi-discarded').waitFor();
  await bs.locator('.bi-discarded').getByRole('button', { name: 'Bring back' }).click();
  await suggestion('Wait for dusk').getByRole('button', { name: '+ Add to Notes / Ideas' }).click();
  await suggestion('Wait for dusk').locator('.bi-where').waitFor();
  await ap.getByRole('tab', { name: /Notes & ideas/ }).click();
  await ap.locator('.idea').waitFor();
  check('a discarded idea can be brought back, and kept as a note', (await ap.locator('.idea textarea').inputValue()) === 'Wait for dusk. The barrier thins when the light goes.' && (await ap.getByRole('tab', { name: /Notes & ideas/ }).innerText()) === 'Notes & ideas (1)');
  await ap.getByLabel('New idea').fill('A lighthouse that points inland.');
  await ap.getByRole('button', { name: 'Keep' }).click();
  await ap.locator('.idea').nth(1).waitFor();
  const manuscript25 = JSON.stringify((await all25(['chapters', 'chapterContents'])));
  check('through all of that the manuscript was never written to', manuscript25 === JSON.stringify(JSON.parse(before25).chapters ? { chapters: JSON.parse(before25).chapters, chapterContents: JSON.parse(before25).chapterContents } : {}));

  // Connecting Claude with the author's own key
  await ap.getByRole('tab', { name: 'Settings' }).click();
  await ap.getByLabel(/^Claude, with your own/).check();
  await ap.getByLabel('Anthropic API key', { exact: true }).fill('sk-ant-test-key-123');
  eq('the newest Claude models are offered, most capable first', await ap.getByLabel('Model').locator('option').evaluateAll((els) => els.map((el) => el.value)), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
  const everywhere25 = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const names = [...open.result.objectStoreNames];
      const tx = open.result.transaction(names);
      let dump = '';
      for (const name of names) tx.objectStore(name).getAll().onsuccess = (e) => { dump += JSON.stringify(e.target.result); };
      tx.oncomplete = () => { open.result.close(); resolve(dump); };
    };
  }));
  check('the key stays in this browser’s settings and is in no project data', !everywhere25.includes('sk-ant-test-key-123') && (await page.evaluate(() => localStorage.getItem('novel-builder:assistant'))).includes('sk-ant-test-key-123'));

  let asked25 = null;
  let status25 = 200;
  const cors25 = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await context.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors25 });
    asked25 = { url: request.url(), headers: request.headers(), body: JSON.parse(request.postData()) };
    if (status25 !== 200) return route.fulfill({ status: status25, headers: cors25, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
    return route.fulfill({ status: 200, headers: cors25, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', id: 'toolu_1', name: 'brainstorm', input: reply25(asked25.body.messages[0].content) }] }) });
  });
  await ap.getByRole('tab', { name: 'Brainstorm' }).click();
  await bs.getByRole('radio', { name: 'What-if' }).click();
  await bs.getByLabel('Brainstorm question').fill('What if Alex refuses the Hero Association?');
  await bs.getByRole('button', { name: '+ Alex' }).click();
  await bs.getByRole('button', { name: '+ Hero Association' }).click();
  await bs.getByRole('button', { name: 'Brainstorm', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.brainstorm-result select')?.selectedOptions[0]?.textContent.includes('What-if'));
  check('asking Claude sends the request to Anthropic with the author’s key and chosen model', asked25.url === 'https://api.anthropic.com/v1/messages' && asked25.headers['x-api-key'] === 'sk-ant-test-key-123' && asked25.headers['anthropic-version'] === '2023-06-01' && asked25.body.model === 'claude-opus-5-5' && asked25.body.tool_choice.name === 'brainstorm', JSON.stringify(asked25.headers));
  const sent25 = JSON.stringify(asked25.body);
  check('what is sent is the question and the attached facts, and nothing private', sent25.includes('Mode: What-if.') && sent25.includes('What if Alex refuses the Hero Association?') && sent25.includes('Possesses Solar Absorption.') && sent25.includes('Licenses heroes.') && !['PRIVATE NOTE', 'UNSENT MANUSCRIPT', 'NOT ATTACHED', 'His handler'].some((secret) => sent25.includes(secret)));
  check('Claude’s answer is classified the same way', (await kinds25()).map((k) => k.split(':')[0]).join() === 'established,assumption,assumption,suggestion,suggestion,suggestion,suggestion' && (await bs.locator('.brainstorm-result > p').last().innerText()).includes('claude-opus-5-5'));
  status25 = 401;
  const sessions25 = (await all25(['brainstorms'])).brainstorms.length;
  await bs.getByRole('button', { name: 'Brainstorm', exact: true }).click();
  await bs.locator('.notice.error').waitFor();
  check('a refused key is explained, and nothing is saved', (await bs.locator('.notice.error').innerText()).includes('That API key was not accepted') && (await all25(['brainstorms'])).brainstorms.length === sessions25);
  status25 = 200;
  // The browser logs the refused request itself; that one is expected.
  for (let i = errors.length - 1; i >= 0; i--) if (errors[i].includes('401')) errors.splice(i, 1);
  await context.unroute('https://api.anthropic.com/**');
  await page.reload();
  await bs.locator('.brainstorm-items > li').first().waitFor();
  check('brainstorms are kept: earlier ones can be reopened after a reload', (await bs.getByLabel('Earlier brainstorms').locator('option').count()) === 2);
  await bs.getByLabel('Earlier brainstorms').selectOption({ index: 1 });
  await suggestion('Overload the barrier').locator('.bi-where').waitFor();
  check('…with what was done with each suggestion', (await bs.locator('.bi-where').count()) === 4);

  // Beside the manuscript
  await page.goto(`${base25}/manuscript/${p25}-c1`);
  await page.locator(text).waitFor();
  if (!(await page.locator('.ms-panel').count())) await page.getByRole('button', { name: 'Plan and reference', exact: true }).click();
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('assistant');
  await page.locator('.ms-panel .brainstorm').getByLabel('Brainstorm question').waitFor();
  check('the assistant can sit in a drawer beside the manuscript, and stays there', (await page.locator('.ms-panel .brainstorm .bi-suggestion').count()) > 0 && (await paragraphs()).join() === 'UNSENT MANUSCRIPT PROSE.');
  await page.locator('.ms-panel').getByLabel('Plan and reference shows').selectOption('auto');
  await page.evaluate(() => localStorage.removeItem('novel-builder:assistant'));

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${base25}/assistant`);
  await bs.locator('.brainstorm-items > li').first().waitFor();
  check('mobile: the assistant fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Phase 26: analytics dashboard ---
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Dashboard Test');
  await page.getByLabel('Target word count').fill('9600');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p26 = page.url().split('/').pop();
  await page.evaluate((projectId) => new Promise((resolve) => {
    const id = (key) => `${projectId}-${key}`;
    const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const pad = (n) => String(n).padStart(2, '0');
    const day = (ago) => { const d = new Date(); d.setDate(d.getDate() - ago); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const session = (key, ago, words, minutes) => { const startedAt = Date.now() - ago * 86400000 - 4 * 3600000; return { id: id(key), projectId, day: day(ago), startedAt, lastActiveAt: startedAt + minutes * 60000, netWords: words, added: words, removed: 0, saves: 1 }; };
    const entry = (key, name) => ({ id: id(key), projectId, category: 'character', name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 1, updatedAt: 1 });
    const thread = (key, title, status, category, beats) => ({ id: id(key), projectId, title, premise: '', category, customCategory: '', status, characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: beats.map((n) => ({ id: id(`${key}-b${n}`), nodeId: id(`c${n}`), title: `Beat ${n}`, note: '', createdAt: n })), notes: '', muted: false, createdAt: 1, updatedAt: 1 });
    const chapters = [[1200, 'published', 'Marcus and Alex met.'], [3000, 'revising', 'Marcus waited.'], [0, 'planned', ''], [600, 'drafting', 'Alex alone.'], [0, 'idea', '']];
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents', 'loreEntries', 'characterRelations', 'plotThreads', 'writingSessions'], 'readwrite');
      chapters.forEach(([words, status, text], i) => {
        tx.objectStore('chapters').add({ id: id(`c${i + 1}`), projectId, parentId: null, kind: 'chapter', title: `Chapter ${i + 1}`, order: i, summary: '', notes: '', status, wordCount: words, charCount: words * 5, createdAt: 1, updatedAt: 1 });
        if (text) tx.objectStore('chapterContents').add({ id: id(`c${i + 1}`), projectId, doc: { type: 'doc', content: [para(text)] }, rev: 1, savedAt: 1 });
      });
      for (const row of [entry('marcus', 'Marcus'), entry('alex', 'Alex'), entry('vera', 'Vera')]) tx.objectStore('loreEntries').add(row);
      tx.objectStore('characterRelations').add({ id: id('bond'), projectId, fromId: id('alex'), toId: id('marcus'), stages: [], createdAt: 1, updatedAt: 1 });
      for (const row of [thread('heist', 'The Heist', 'active', 'main', [1, 2]), thread('ledger', 'Ledger', 'active', 'mystery', [1]), thread('debt', 'Old Debt', 'resolved', 'character-arc', [2])]) tx.objectStore('plotThreads').add(row);
      for (const row of [session('s0', 0, 300, 30), session('s1', 1, 500, 45), session('s2', 2, 200, 20), session('s3', 10, 1000, 90)]) tx.objectStore('writingSessions').add(row);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p26);
  const snapshot26 = () => page.evaluate((projectId) => new Promise((resolve) => {
    const stores = ['chapters', 'chapterContents', 'loreEntries', 'characterRelations', 'plotThreads', 'writingSessions'];
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(stores);
      const out = {};
      for (const store of stores) tx.objectStore(store).getAll().onsuccess = (e) => { out[store] = e.target.result.filter((row) => row.projectId === projectId).sort((a, b) => String(a.id).localeCompare(String(b.id))); };
      tx.oncomplete = () => { open.result.close(); resolve(JSON.stringify(out)); };
    };
  }), p26);
  const before26 = await snapshot26();
  const dp = page.locator('.dashboard-page');
  const tile26 = async (label) => (await dp.getByRole('group', { name: label, exact: true }).locator('strong').first().innerText()).replace(/\s+/g, ' ');
  const detail26 = async (label) => (await dp.getByRole('group', { name: label, exact: true }).locator('.muted').innerText()).replace(/\s+/g, ' ');

  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await dp.getByRole('group', { name: 'Words in the manuscript' }).waitFor();
  check('the dashboard has its own page, summarising the whole project', (await page.locator('.sidebar nav a', { hasText: /^Dashboard$/ }).isVisible()) && (await dp.locator('.page-header [role=status]').innerText()).replace(/\s+/g, ' ') === '4,800 words · 50% of 9,600 · 5 chapters · 3 characters · 3 plot threads', await dp.locator('.page-header [role=status]').innerText());
  eq('writing output is totalled from the manuscript and the writing log', [await tile26('Words in the manuscript'), await detail26('Words in the manuscript'), await tile26('Words today'), await tile26('Average per writing day'), await detail26('Average per writing day')], ['4,800', '50% of the 9,600 target', '300', '500', 'over 4 days']);
  eq('sessions are counted, timed and their streaks worked out', [await tile26('Writing sessions'), await detail26('Writing sessions'), await tile26('Words per session'), await tile26('Average session length'), await tile26('Most words in a session'), await tile26('Longest session'), await tile26('Current streak'), await detail26('Current streak')], ['4', '3 h 5 min in all', '500', '46 min', '1,000', '1 h 30 min', '3 days', 'longest: 3 days']);
  eq('the manuscript is measured: counts, averages, the longest and the shortest', [await tile26('Chapters'), await tile26('Scenes'), await tile26('Average chapter length'), await tile26('Longest chapter'), await tile26('Shortest chapter with text')], ['5', '0', '1,600', 'Chapter 2 (3,000)', 'Chapter 4 (600)']);
  eq('chapters are sorted into the four stages', await dp.locator('.pipeline .parts-key li').evaluateAll((els) => els.map((el) => el.textContent.trim())), ['Planned 2', 'Drafting 1', 'In Revision 1', 'Completed 1']);
  check('the longest chapter links to the manuscript', (await dp.getByRole('group', { name: 'Longest chapter' }).locator('a').getAttribute('href')) === `/project/${p26}/manuscript/${p26}-c2`);

  const castRows = await dp.getByRole('table', { name: 'Character appearances' }).locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.getAttribute('title')));
  eq('each character’s appearances come from the manuscript and their links', castRows, [
    'Alex: appears in 2 chapters, first: Ch. 1, latest: Ch. 4, relationships: 1, progression snapshots: 0',
    'Marcus: appears in 2 chapters, first: Ch. 1, latest: Ch. 2, relationships: 1, progression snapshots: 0',
    'Vera: no appearances recorded, relationships: 0, progression snapshots: 0',
  ]);
  const alexRow = dp.getByRole('table', { name: 'Character appearances' }).locator('tbody tr', { hasText: 'Alex' });
  check('…with where in the book they are, and links to the chapters', (await alexRow.locator('.strip').getAttribute('aria-label')) === 'Alex appears in chapters 1, 4' && (await alexRow.locator('.strip .on').count()) === 2 && (await alexRow.locator('.strip > span').count()) === 5 && (await alexRow.getByRole('link', { name: 'Ch. 4' }).getAttribute('href')) === `/project/${p26}/manuscript/${p26}-c4` && (await alexRow.locator('th a').getAttribute('href')) === `/project/${p26}/characters/${p26}-alex`);
  eq('threads are broken down by status, with mysteries and arcs counted', [await dp.locator('.thread-parts .parts-key li').evaluateAll((els) => els.map((el) => el.textContent.trim())), await tile26('Open mysteries'), await tile26('Character arcs')], [['Active 2', 'Resolved 1', 'Dormant / Paused 0', 'Abandoned 0', 'Planned 0'], '1', '1']);
  eq('each thread shows how much of the manuscript it touches', await dp.getByRole('table', { name: 'Thread activity' }).locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.getAttribute('title'))), [
    'The Heist: 2 developments in 2 of 5 chapters (40%), chapters 1–2',
    'Ledger: 1 development in 1 of 5 chapters (20%), chapters 1',
    'Old Debt: 1 development in 1 of 5 chapters (20%), chapters 2',
  ]);
  const observed = await dp.locator('.observations li').allInnerTexts();
  eq('observations state what the numbers are', observed, [
    '2 chapters of 5 have no text yet.',
    'The longest chapter with text (“Chapter 2”, 3,000 words) is 5.0 times the length of the shortest (“Chapter 4”, 600 words).',
    '1 character has no appearance recorded in any chapter: Vera.',
    'The active thread “Ledger” has no recorded development across the last 3 written chapters.',
    'The active thread “The Heist” has no recorded development across the last 2 written chapters.',
  ]);
  check('…in neutral words, leaving the judgement to the author', !/\b(forgot|neglect|should|must|too|poor|bad|behind|fail|warning|problem|wrong|great|good)\b/i.test(observed.join(' ')) && (await dp.locator('[aria-label="Observations"]').innerText()).includes('yours to say'));
  check('the charts have their numbers as tables too', (await dp.locator('figure.chart').count()) === 3 && (await dp.locator('figure.chart figcaption').allInnerTexts()).join(' | ') === 'Net words per day, last 30 days | Net words per week, last 8 weeks | Words per chapter, in reading order' && (await dp.locator('figure.chart details.chart-table').count()) === 3);
  check('looking at the dashboard changes nothing', (await snapshot26()) === before26);
  await shot('dashboard');

  // Writing updates the numbers
  await page.goto(`${BASE}/project/${p26}/manuscript/${p26}-c4`);
  await page.locator(text).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Then Vera came in.');
  await saved();
  const written26 = (await paragraphs()).join('|');
  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await dp.getByRole('group', { name: 'Words today' }).waitFor();
  const afterWriting = { today: await tile26('Words today'), sessions: await tile26('Writing sessions'), cast: await dp.getByRole('table', { name: 'Character appearances' }).locator('tbody tr', { hasText: 'Vera' }).getAttribute('title') };
  check('a writing session shows up at once: today’s words, the session count and who appears', Number(afterWriting.today.replace(/,/g, '')) !== 300 && afterWriting.sessions === '5' && afterWriting.cast === 'Vera: appears in 1 chapter, first: Ch. 4, latest: Ch. 4, relationships: 0, progression snapshots: 0', JSON.stringify(afterWriting));
  check('…and the text that was written is exactly what was typed', written26.includes('Then Vera came in.') && (await page.evaluate((id) => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const r = open.result.transaction('chapterContents').objectStore('chapterContents').get(id); r.onsuccess = () => { open.result.close(); resolve(JSON.stringify(r.result.doc)); }; }; }), `${p26}-c4`)).includes('Then Vera came in.'));
  check('the observation about Vera is gone now that she appears', !(await dp.locator('.observations li').allInnerTexts()).some((line) => line.includes('Vera')));

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await dp.getByRole('group', { name: 'Words today' }).waitFor();
  check('mobile: the dashboard fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Your dashboard (Optional Prompt B) ---
  // Widgets the author places, sizes, orders and sets up, each reading this novel's records as they are. The arrangement
  // is a setting of this browser: it names records by id, and arranging it writes nothing to the novel.
  await page.evaluate((projectId) => new Promise((resolve) => {
    const id = (key) => `${projectId}-${key}`;
    const when = (year) => ({ precision: 'exact', year, month: null, day: null, hour: null, minute: null });
    const event = (key, name, year, nodes, more = {}) => ({ id: id(key), projectId, name, description: '', when: when(year), duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: nodes.map((n) => id(`c${n}`)), afterId: null, createdAt: 1, updatedAt: 1, ...more });
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['timelineEvents', 'chapterPlans', 'savedViews'], 'readwrite');
      tx.objectStore('timelineEvents').add(event('meeting', 'Meeting', 1, [1]));
      tx.objectStore('timelineEvents').add(event('vault', 'The vault', 3, [3], { threadIds: [id('heist')], characters: [{ id: id('alex'), age: null }] }));
      tx.objectStore('timelineEvents').add(event('escape', 'The escape', 4, [5]));
      tx.objectStore('timelineEvents').add(event('debt', 'Old debt incurred', -5, [5], { reveals: [{ nodeId: id('c5'), role: 'flashback' }] }));
      tx.objectStore('chapterPlans').put({ id: id('c1'), projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', appearIds: [id('alex')], updatedAt: 1 });
      tx.objectStore('savedViews').add({ id: id('lanes'), projectId, view: 'plot', name: 'Heist lanes', filter: { threads: [id('heist')] }, mode: 'visual', layers: [], scale: null, layout: {}, createdAt: 1, updatedAt: 1 });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p26);
  const dashKey = `novel-builder:dashboard:${p26}`;
  const storedDash = () => page.evaluate((key) => localStorage.getItem(key), dashKey);
  // Every row of this novel, in every table: what "nothing written" is checked against. Opening any page of a novel already
  // notes when it was last opened and refreshes its cached counts (before this work too): those two stamps are left out.
  const novelRows26 = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const db = open.result;
      const names = [...db.objectStoreNames];
      const tx = db.transaction(names);
      const out = {};
      for (const name of names) tx.objectStore(name).getAll().onsuccess = (e) => { const rows = e.target.result.filter((r) => r && typeof r === 'object' && (r.projectId === projectId || r.id === projectId)); if (rows.length) out[name] = rows.map(({ lastOpenedAt, computedAt, ...row }) => row).sort((a, b) => String(a.id).localeCompare(String(b.id))); };
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(out)); };
    };
  }), p26);
  const dash = page.getByRole('region', { name: 'Your dashboard' });
  const cardDash = (title) => dash.locator('.dash-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const titles = (title) => cardDash(title).locator('.dash-list > li > a, .dash-list > li > span > a').allInnerTexts();
  const headings = () => dash.locator('.dash-card h3').allInnerTexts();
  const dashStatus = () => dash.locator('.dash-status [role=status]').innerText();
  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await dash.waitFor();
  const rowsBefore26 = await novelRows26();
  check('a new dashboard is empty and says so: no widgets, no example content, nothing stored', (await dash.locator('.dash-card').count()) === 0 && (await dash.innerText()).includes('Nothing on your dashboard yet.') && (await storedDash()) === null && (await dp.getByRole('group', { name: 'Words in the manuscript' }).isVisible()));

  await dash.getByRole('button', { name: 'Add a widget' }).click();
  check('“Add a widget” offers the seven kinds, each described, and takes the focus there', (await page.evaluate(() => document.activeElement?.id)) === 'dash-add-title' && (await dash.getByRole('radio').count()) === 7 && (await dash.getByRole('radio', { name: /^Upcoming events/ }).isChecked()));
  await dash.getByRole('button', { name: 'Add widget', exact: true }).click();
  await cardDash('Upcoming events').waitFor();
  eq('the first widget is placed, said so, and lists events told in chapters with no words yet, in reading order', { status: await dashStatus(), titles: await titles('Upcoming events'), first: (await cardDash('Upcoming events').locator('.dash-list > li').first().innerText()).replace(/\s+/g, ' ').includes('Told in Ch 3: Chapter 3'), focus: await page.evaluate(() => document.activeElement?.tagName) }, { status: 'Added “Upcoming events” at position 1 of 1.', titles: ['The vault', 'Old debt incurred', 'The escape'], first: true, focus: 'H3' });
  for (const kind of ['Plot threads', 'Words per chapter', 'Character appearances', 'Warnings to look at', 'Saved views', 'Recently changed']) {
    await dash.getByRole('radio', { name: new RegExp(`^${kind}`) }).check();
    await dash.getByRole('button', { name: 'Add widget', exact: true }).click();
    await cardDash(kind).waitFor();
  }
  eq('each kind is placed where asked: here, one after another at the end', await headings(), ['Upcoming events', 'Plot threads', 'Words per chapter', 'Character appearances', 'Warnings to look at', 'Saved views', 'Recently changed']);

  // What each shows is this novel's own records, as stored.
  eq('plot threads: the statuses the author gave, counted, in play first', { counts: (await cardDash('Plot threads').locator('.dash-counts li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), titles: await titles('Plot threads') }, { counts: ['ACTIVE 2', 'RESOLVED 1'], titles: ['Ledger', 'The Heist', 'Old Debt'] });
  const chapterWords26 = await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => { const r = open.result.transaction('chapters').objectStore('chapters').getAll(); r.onsuccess = () => { open.result.close(); resolve(r.result.filter((c) => c.projectId === projectId && c.kind === 'chapter').sort((a, b) => a.order - b.order).map((c) => c.wordCount)); }; };
  }), p26);
  eq('words per chapter: the editor’s own counts, chapter by chapter', { labels: await titles('Words per chapter'), words: await cardDash('Words per chapter').locator('.dash-num').allInnerTexts() }, { labels: ['Ch 1: Chapter 1', 'Ch 2: Chapter 2', 'Ch 3: Chapter 3', 'Ch 4: Chapter 4', 'Ch 5: Chapter 5'], words: chapterWords26.map(fmt) });
  eq('character appearances: from the records only, the author’s appearance record kept apart from the rest', (await cardDash('Character appearances').locator('.dash-list > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['Alex Appears in 1 of 5 chapters, other records in 1']);
  check('recently changed: the chapter just written in comes first', (await cardDash('Recently changed').locator('.dash-list > li').first().innerText()).replace(/\s+/g, ' ').startsWith('Chapter 4 Chapter Changed'));
  const savedLink26 = cardDash('Saved views').getByRole('link', { name: 'Heist lanes' });
  const savedHref = await savedLink26.getAttribute('href');
  check('saved views: listed by name, each opening the view as it was saved', savedHref.startsWith(`/project/${p26}/visualize/plot?`) && savedHref.includes(`saved=${p26}-lanes`) && savedHref.includes(encodeURIComponent(`${p26}-heist`)), savedHref);
  await cardDash('Warnings to look at').locator('.dash-counts').waitFor();
  await page.waitForFunction(() => !document.querySelector('.dash-cardDash .dash-note')?.textContent.includes('still being checked'));
  const warned = (await cardDash('Warnings to look at').locator('.dash-counts li').allInnerTexts()).map((t) => Number(t.replace(/\D/g, '')));
  await savedLink26.click();
  await page.waitForURL(/\/visualize\/plot\?/);
  check('…and opening one shows it chosen in its own Saved views bar', (await page.getByLabel('Saved views of this kind').inputValue()) === `${p26}-lanes`);
  await page.goto(`${BASE}/project/${p26}/review`);
  // Its count line, once every check has been gathered (before that it says it is gathering them).
  const countLine = page.getByRole('status').filter({ hasText: /to look at/ }).first();
  await countLine.waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('Checking the manuscript…'));
  const reviewLine = await countLine.innerText();
  const toLook = reviewLine.startsWith('Nothing to look at') ? 0 : Number(reviewLine.split(' ')[0]);
  check('warnings: the same number still to look at as the review counts', warned.length === 3 && warned.reduce((a, b) => a + b, 0) === toLook, `${warned} vs “${reviewLine}”`);

  // Setting a widget up.
  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await dash.getByRole('button', { name: 'Customize' }).click();
  const addClosed = (await dash.locator('#dash-add').count()) === 0;
  await dash.getByRole('button', { name: 'Add a widget' }).click();
  check('while arranging, the choice of a new widget opens only when asked for', addClosed && (await dash.locator('#dash-add').isVisible()) && (await dash.getByRole('button', { name: 'Add a widget' }).getAttribute('aria-expanded')) === 'true' && (await page.evaluate(() => document.activeElement?.id)) === 'dash-add-title');
  await dash.getByRole('button', { name: 'Add a widget' }).click();
  await cardDash('Upcoming events').getByRole('button', { name: 'Settings' }).click();
  await cardDash('Upcoming events').getByLabel('Upcoming by').selectOption('story');
  eq('upcoming by story order: later than the latest event told so far, by date', { titles: await titles('Upcoming events'), caption: (await cardDash('Upcoming events').locator('.dash-body > p.muted').first().innerText()).startsWith('Later in story time than “Meeting”') }, { titles: ['The vault', 'The escape'], caption: true });
  await cardDash('Upcoming events').getByLabel('Plot thread').selectOption({ label: 'Ledger' });
  check('kept to a thread with no events, it says so rather than showing others', (await cardDash('Upcoming events').innerText()).includes('No event matches the thread and character chosen.') && (await titles('Upcoming events')).length === 0);
  await cardDash('Upcoming events').getByLabel('Plot thread').selectOption({ label: 'The Heist' });
  await cardDash('Upcoming events').getByLabel('How many to show').fill('1');
  await cardDash('Upcoming events').getByLabel('Title', { exact: true }).fill('Next up');
  eq('settings take effect at once: thread, how many, and the author’s own title', { titles: await titles('Next up'), more: await cardDash('Next up').locator('.dash-more').count() }, { titles: ['The vault'], more: 0 });
  await cardDash('Next up').getByLabel('Plot thread').selectOption({ label: 'Any thread, or none' });
  check('…with a count of how many more there are', (await cardDash('Next up').locator('.dash-more').innerText()) === 'Showing 1 of 2. Show more in its settings.');
  await cardDash('Next up').getByRole('button', { name: 'Settings' }).click();

  // Size and order.
  await cardDash('Words per chapter').getByLabel('Width of “Words per chapter”').selectOption('3');
  await cardDash('Words per chapter').getByLabel('Height of “Words per chapter”').selectOption('3');
  const sized = await page.evaluate(() => {
    const grid = document.querySelector('.dash-grid').getBoundingClientRect();
    const words = [...document.querySelectorAll('.dash-card')].find((c) => c.querySelector('h3').textContent === 'Words per chapter');
    return { full: Math.abs(words.getBoundingClientRect().width - grid.width) < 2, tall: getComputedStyle(words.querySelector('.dash-body')).maxHeight };
  });
  eq('resized: full width, and tall', sized, { full: true, tall: '600px' });
  await cardDash('Plot threads').getByRole('button', { name: 'Move “Plot threads” earlier' }).focus();
  await page.keyboard.press('Enter');
  eq('moved from the keyboard: the order changes, it is said, and the focus stays on the widget’s controls', { order: (await headings()).slice(0, 2), status: await dashStatus(), focus: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) }, { order: ['Plot threads', 'Next up'], status: 'Moved “Plot threads” to position 1 of 7.', focus: 'Move “Plot threads” later' });
  // Dragged as a hand does it: pressed on the handle, moved over the widget before it in steps, let go. Both are the first
  // two on the board, on screen together (the choice of a new widget is put away).
  if (await dash.locator('#dash-add').count()) await dash.getByRole('button', { name: 'Add a widget' }).click();
  await cardDash('Next up').locator('.dash-grip').scrollIntoViewIfNeeded();
  const grip = await cardDash('Next up').locator('.dash-grip').boundingBox();
  const onto = await cardDash('Plot threads').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(grip.x + (onto.x + onto.width / 2 - grip.x) * (i / 6), grip.y + (onto.y + onto.height / 2 - grip.y) * (i / 6));
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.dash-card h3')?.textContent === 'Next up', null, { timeout: 5000 }).catch(() => {});
  eq('moved by dragging, too', (await headings()).slice(0, 3), ['Next up', 'Plot threads', 'Words per chapter']);
  await cardDash('Saved views').getByRole('button', { name: 'Remove “Saved views”' }).click();
  const removedOrder = await headings();
  check('removed: gone from the dashboard, said so, with nothing in the novel changed, and Undo at hand', !removedOrder.includes('Saved views') && (await dashStatus()) === 'Removed “Saved views”. Nothing in the novel was changed.' && (await page.evaluate(() => document.activeElement?.id)) === 'dash-undo');
  await page.keyboard.press('Enter');
  eq('…and Undo puts it back where it was', await headings(), ['Next up', 'Plot threads', 'Words per chapter', 'Character appearances', 'Warnings to look at', 'Saved views', 'Recently changed']);
  await dash.getByRole('button', { name: 'Done' }).click();
  check('“Done” puts the arranging away', (await dash.getByRole('button', { name: /^Remove/ }).count()) === 0 && (await dash.locator('#dash-add').count()) === 0);

  // Kept, and kept apart from the records.
  const layoutText = await storedDash();
  await page.reload();
  await cardDash('Next up').waitFor();
  eq('the arrangement survives a reload: order, sizes, titles and settings', { order: await headings(), words: await cardDash('Words per chapter').getAttribute('class'), titles: await titles('Next up') }, { order: ['Next up', 'Plot threads', 'Words per chapter', 'Character appearances', 'Warnings to look at', 'Saved views', 'Recently changed'], words: 'dash-card dash-w3 dash-h3', titles: ['The vault'] });
  const layout26 = JSON.parse(layoutText);
  const idsOut = layoutText.replaceAll(new RegExp(`${p26}-[\\w-]+`, 'g'), '');
  check('the stored arrangement holds widget settings and record ids, never a copy of a record', layout26.widgets.every((w) => JSON.stringify(Object.keys(w)) === '["id","kind","w","h","title","config"]') && !/The Heist|Ledger|Alex|Chapter|The vault|Meeting|Heist lanes|1,200|3,000/.test(idsOut), idsOut);
  check('arranging, setting up and reading the dashboard wrote nothing to the novel', (await novelRows26()) === rowsBefore26);

  // Read live: the records change, the widgets follow, the arrangement does not.
  await page.evaluate((key) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => { const store = open.result.transaction('plotThreads', 'readwrite').objectStore('plotThreads'); store.get(key).onsuccess = (e) => { store.put({ ...e.target.result, title: 'The Ledger' }).onsuccess = () => { open.result.close(); resolve(); }; }; };
  }), `${p26}-ledger`);
  await page.reload();
  await cardDash('Plot threads').getByRole('link', { name: 'The Ledger' }).waitFor({ timeout: 10000 }).catch(() => {});
  check('a record renamed elsewhere shows its new name, and the stored arrangement is untouched', (await titles('Plot threads')).includes('The Ledger') && (await storedDash()) === layoutText);
  await dash.getByRole('button', { name: 'Customize' }).click();
  await cardDash('Character appearances').getByRole('button', { name: 'Settings' }).click();
  await cardDash('Character appearances').getByRole('combobox', { name: /^Character/ }).selectOption({ label: 'Vera' });
  await page.evaluate((key) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => { open.result.transaction('loreEntries', 'readwrite').objectStore('loreEntries').delete(key).onsuccess = () => { open.result.close(); resolve(); }; };
  }), `${p26}-vera`);
  await page.reload();
  await cardDash('Character appearances').getByText('The character this widget follows no longer exists', { exact: false }).waitFor({ timeout: 10000 }).catch(() => {});
  check('a record a widget follows is deleted: the widget says so, and keeps the setting for the author to change', (await cardDash('Character appearances').innerText()).includes('The character this widget follows no longer exists') && (await storedDash()).includes(`${p26}-vera`));

  // Damaged storage is an empty dashboard, not a broken page.
  const kept = await storedDash();
  await page.evaluate((key) => localStorage.setItem(key, '{not json'), dashKey);
  await page.reload();
  await dash.waitFor();
  check('a damaged stored arrangement shows an empty dashboard, and the page still works', (await dash.innerText()).includes('Nothing on your dashboard yet.') && (await dp.getByRole('group', { name: 'Words in the manuscript' }).isVisible()));
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [dashKey, kept]);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await cardDash('Next up').waitFor();
  await dash.getByRole('button', { name: 'Customize' }).click();
  const phoneDash = await page.evaluate(() => {
    const grid = document.querySelector('.dash-grid').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.dash-card')].map((c) => c.getBoundingClientRect());
    const small = [...document.querySelectorAll('.dash-tools button, .dash-tools select')].filter((el) => el.getBoundingClientRect().height < 44).length;
    return { oneColumn: cards.every((c) => Math.abs(c.width - grid.width) < 2 && Math.abs(c.left - grid.left) < 2), fits: document.documentElement.scrollWidth <= window.innerWidth, small };
  });
  eq('mobile: one column, nothing sideways, controls big enough for a fingertip', phoneDash, { oneColumn: true, fits: true, small: 0 });
  await shot('dashboard-widgets-phone');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/project/${p26}/dashboard`);
  await cardDash('Next up').waitFor();
  await shot('dashboard-widgets');

  // --- Phase 27: cloud sync ---
  // A real relay on a spare port, and two separate browser profiles standing in for two devices.
  const RELAY = 'http://localhost:8799';
  relay = spawn(process.execPath, ['server/relay.ts'], { env: { ...process.env, PORT: '8799', DATA: mkdtempSync(join(tmpdir(), 'nb-relay-')) }, stdio: 'ignore' });
  const until = async (fn, what, ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  await until(() => fetch(`${RELAY}/v1/health`).then((r) => r.ok, () => false), 'the relay to start', 10000);
  const dbAll27x = (pg, table) => pg.evaluate((t) => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const r = open.result.transaction(t).objectStore(t).getAll(); r.onsuccess = () => { open.result.close(); resolve(r.result); }; }; }), table);

  const p27 = await createProject('Skyfall');
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const ch27 = page.url().split('/').pop();
  const chapterUrl27 = `${BASE}/project/${p27}/manuscript/${ch27}`;
  const syncUrl27 = `${BASE}/project/${p27}/sync`;
  const docOn = async (pg) => JSON.stringify((await dbAll27x(pg, 'chapterContents')).find((row) => row.nodeId === ch27 || row.id === ch27)?.doc ?? null);
  const kaelOn = async (pg) => (await dbAll27x(pg, 'loreEntries')).find((entry) => entry.projectId === p27 && entry.name === 'Kael');
  const levelOn = async (pg) => (await kaelOn(pg))?.fields.find((f) => f.key === 'Level')?.value;
  const conflictsOn = async (pg) => (await dbAll27x(pg, 'syncConflicts')).filter((c) => c.projectId === p27);
  const typeAt = async (pg, addition) => {
    await pg.locator(text).click();
    await pg.keyboard.press('End');
    await pg.keyboard.type(addition);
    await until(async () => (await docOn(pg)).includes(addition.trim()), `"${addition}" to be saved`);
  };
  const syncOn = async (pg) => {
    await pg.goto(syncUrl27);
    await pg.getByRole('button', { name: 'Sync now' }).click();
    await pg.locator('.sync-page > .notice').waitFor();
    return pg.locator('.sync-page > .notice').innerText();
  };
  await typeAt(page, 'The sky fell on a Tuesday.');
  await page.goto(`${BASE}/project/${p27}/codex`);
  await page.getByText('Build your world').waitFor();
  // Any codex entry will do for structured data; the sync of a character and their profile is exercised with the three devices further on.
  await newEntry('Item / Artifact', 'Kael');
  await page.getByRole('button', { name: '+ Add field' }).click();
  await field('Field 1 name').fill('Level');
  await field('Level value').fill('30');
  await field('Level value').blur();
  await until(async () => (await levelOn(page)) === '30', 'the Level field to be saved');

  await page.goto(syncUrl27);
  const sp27 = page.locator('.sync-page');
  await sp27.getByLabel('Relay address').waitFor();
  check('until a project is set to sync there is no status badge and nothing leaves the device', (await page.locator('.sync-badge').count()) === 0 && (await sp27.getByRole('button', { name: 'Sync this project' }).isDisabled()));
  await sp27.getByLabel('Relay address').fill(RELAY);
  await sp27.getByLabel('Device name').fill('Desktop');
  await sp27.getByRole('button', { name: 'Create a new key' }).click();
  const key27 = await sp27.getByLabel('Sync key').inputValue();
  check('a sync key is created on the device', key27.length >= 32, key27);
  await sp27.getByRole('button', { name: 'Sync this project' }).click();
  await sp27.locator('.notice').first().waitFor();
  const first27 = await sp27.locator('.notice').first().innerText();
  check('the first sync sends the whole project', /^Synced: \d+ sent, 0 received\./.test(first27) && Number(first27.match(/(\d+) sent/)[1]) >= 5, first27);
  await page.locator('.sync-badge.sync-synced').waitFor();
  eq('the status badge reads Synced', (await page.locator('.sync-badge').innerText()).trim(), 'Synced');
  check('the page says when it last synced', /^Synced · last synced /.test(await sp27.locator('[data-status]').innerText()), await sp27.locator('[data-status]').innerText());
  await shot('27-sync-page');

  // The second device.
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  const errorsB = [];
  const expectedOffline = /ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to fetch|WebSocket|\[vite\]/;
  pageB.on('pageerror', (e) => errorsB.push(e.message));
  pageB.on('console', (m) => m.type() === 'error' && !expectedOffline.test(m.text()) && errorsB.push(m.text()));
  await pageB.goto(`${BASE}/cloud`);
  const cp27 = pageB.locator('.cloud-page');
  await cp27.getByLabel('Device name').fill('Laptop');
  await cp27.getByLabel('Relay address').fill('http://localhost:8798');
  await cp27.getByLabel('Sync key').fill('not-the-key-not-the-key-not-the-key');
  await cp27.getByRole('button', { name: 'Connect' }).click();
  await cp27.getByRole('alert').waitFor();
  check('an unreachable relay is reported, not swallowed', (await cp27.getByRole('alert').innerText()).length > 0);
  await cp27.getByLabel('Relay address').fill(RELAY);
  await cp27.getByRole('button', { name: 'Connect' }).click();
  await cp27.getByText('Connected. 0 projects in this account.').waitFor();
  check('a different key is a different account: it sees none of the projects', true);
  await cp27.getByLabel('Sync key').fill(key27);
  await cp27.getByRole('button', { name: 'Connect' }).click();
  await cp27.getByText('Connected. 1 project in this account.').waitFor();
  await cp27.getByRole('button', { name: 'Show projects' }).click();
  await cp27.getByRole('list', { name: 'Cloud projects' }).getByText('Skyfall').waitFor();
  await cp27.getByRole('button', { name: 'Download to this device' }).click();
  await pageB.waitForURL(new RegExp(`/project/${p27}$`));
  await pageB.getByText('Skyfall').first().waitFor();
  await pageB.locator('.sync-badge.sync-synced').waitFor();
  check('the second device downloads the project from the cloud', (await dbAll27x(pageB, 'projects')).some((p) => p.id === p27 && p.title === 'Skyfall'));
  await pageB.goto(chapterUrl27);
  await pageB.locator(text).waitFor();
  eq('…with the manuscript text exactly as written', await pageB.$$eval(`${text} > *`, (els) => els.map((el) => el.textContent)), ['The sky fell on a Tuesday.']);
  check('…its lore and custom fields', (await levelOn(pageB)) === '30');
  await pageB.locator('.sync-badge.sync-synced').waitFor();
  check('the second device shows the project as synced', (await pageB.locator('.sync-badge').innerText()).trim() === 'Synced');

  // Offline: work goes on, waits, and is sent when the connection returns.
  await page.goto(chapterUrl27);
  await page.locator(text).waitFor();
  await context.setOffline(true);
  await typeAt(page, ' Nobody looked up.');
  await page.locator('.sync-badge.sync-offline').waitFor();
  await until(async () => /waiting/.test(await page.locator('.sync-badge').innerText()), 'the badge to count what is waiting');
  const offline27 = (await page.locator('.sync-badge').innerText()).trim();
  check('offline, writing is saved on the device and the badge reads Offline with what is waiting', /^Offline · \d+ waiting$/.test(offline27) && (await docOn(page)).includes('Nobody looked up.'), offline27);
  await shot('27-offline');
  const before27 = (await dbAll27x(page, 'syncState')).find((s) => s.projectId === p27).lastSyncAt;
  await context.setOffline(false);
  await until(async () => { const s = (await dbAll27x(page, 'syncState')).find((row) => row.projectId === p27); return s.lastSyncAt > before27 && s.pending === 0; }, 'the queued changes to be sent on reconnection');
  check('back online, the queued changes are sent without being asked', (await page.locator('.sync-badge').innerText()).trim() === 'Synced');
  await syncOn(pageB);
  check('…and reach the other device', (await docOn(pageB)).includes('Nobody looked up.'));

  // The same chapter changed on both devices.
  const clash = async (laptop, desktop) => {
    await syncOn(pageB);
    await pageB.goto(chapterUrl27);
    await pageB.locator(text).waitFor();
    await contextB.setOffline(true);
    await typeAt(pageB, laptop);
    await page.goto(chapterUrl27);
    await page.locator(text).waitFor();
    await typeAt(page, desktop);
    await syncOn(page);
    await pageB.locator('.sync-badge').click();
    await pageB.locator('.sync-page').waitFor();
    await contextB.setOffline(false);
    await until(async () => (await conflictsOn(pageB)).length > 0, 'the conflict to be noticed');
  };
  const cardB = pageB.getByRole('listitem', { name: /^Conflict: The text of/ });
  await clash(' [laptop-1]', ' [desktop-1]');
  await cardB.waitFor();
  const held27 = await conflictsOn(pageB);
  check('a text conflict is detected, once, and nothing is merged automatically', held27.length === 1 && held27[0].kind === 'text', JSON.stringify(held27.map((c) => [c.kind, c.label])));
  check('ZERO SILENT OVERWRITE: this device still has its own text, untouched', (await docOn(pageB)).includes('[laptop-1]') && !(await docOn(pageB)).includes('[desktop-1]'));
  check('…and the cloud’s version is held beside it as a recovery copy', JSON.stringify(held27[0].remote.doc).includes('[desktop-1]') && JSON.stringify(held27[0].local.doc).includes('[laptop-1]'));
  check('the badge reads Conflict detected', (await pageB.locator('.sync-badge').innerText()).trim() === 'Conflict detected');
  eq('the four choices are offered', await cardB.getByRole('button').allInnerTexts(), ['Compare versions', 'Keep local version', 'Keep cloud version', 'Resolve manually']);
  await pageB.screenshot({ path: SHOTS ? `${SHOTS}/27-conflict.png` : undefined });
  await pageB.reload();
  await cardB.waitFor();
  check('an unresolved conflict survives a reload', (await conflictsOn(pageB)).length === 1 && (await docOn(pageB)).includes('[laptop-1]'));
  await syncOn(pageB);
  check('…and further syncs leave it alone until the author decides', (await conflictsOn(pageB)).length === 1 && (await docOn(pageB)).includes('[laptop-1]') && !(await docOn(pageB)).includes('[desktop-1]') && !(await docOn(page)).includes('[laptop-1]'));

  await cardB.getByRole('button', { name: 'Compare versions' }).click();
  const compare27 = pageB.getByRole('dialog', { name: 'Compare versions' });
  await compare27.waitFor();
  const compared27 = await compare27.innerText();
  check('Compare versions shows both side by side', compared27.includes('laptop-1') && compared27.includes('desktop-1') && compared27.includes('This device') && compared27.includes('Cloud (Desktop)'), compared27.slice(0, 300));
  await pageB.screenshot({ path: SHOTS ? `${SHOTS}/27-compare.png` : undefined });
  await pageB.keyboard.press('Escape');
  check('…and comparing decides nothing', (await conflictsOn(pageB)).length === 1);

  await cardB.getByRole('button', { name: 'Resolve manually' }).click();
  const merge27 = pageB.locator('.merge-editor');
  await merge27.waitFor();
  check('Resolve manually opens an editor with this device’s text and the cloud’s beside it', (await merge27.getByRole('textbox', { name: 'Merged text' }).innerText()).includes('[laptop-1]') && (await merge27.getByRole('region', { name: 'Cloud version' }).innerText()).includes('[desktop-1]'));
  await merge27.getByRole('button', { name: 'Add the cloud’s text below' }).click();
  await merge27.getByRole('textbox', { name: 'Merged text' }).click();
  await pageB.keyboard.press('ControlOrMeta+End');
  await pageB.keyboard.type(' [by-hand]');
  await pageB.screenshot({ path: SHOTS ? `${SHOTS}/27-merge.png` : undefined });
  await merge27.getByRole('button', { name: 'Save the merged version' }).click();
  await until(async () => (await conflictsOn(pageB)).length === 0, 'the conflict to be settled');
  const merged27 = await docOn(pageB);
  check('the merged version keeps what both devices wrote, plus the author’s edit', ['[laptop-1]', '[desktop-1]', '[by-hand]'].every((tag) => merged27.includes(tag)), merged27);
  await syncOn(pageB);
  await syncOn(page);
  eq('…and it reaches the other device identically', await docOn(page), merged27);

  await clash(' [laptop-2]', ' [desktop-2]');
  await cardB.getByRole('button', { name: 'Keep cloud version' }).click();
  await until(async () => (await conflictsOn(pageB)).length === 0, 'the conflict to be settled');
  check('Keep cloud version takes the cloud’s text', (await docOn(pageB)).includes('[desktop-2]') && !(await docOn(pageB)).includes('[laptop-2]'));
  const kept27 = (await dbAll27x(pageB, 'chapterRevisions')).filter((r) => r.reason === 'conflict' && JSON.stringify(r.doc).includes('[laptop-2]'));
  check('…and this device’s text is in the chapter’s version history, not gone', kept27.length === 1, String(kept27.length));

  await clash(' [laptop-3]', ' [desktop-3]');
  await cardB.getByRole('button', { name: 'Keep local version' }).click();
  await until(async () => (await conflictsOn(pageB)).length === 0, 'the conflict to be settled');
  await syncOn(pageB);
  await syncOn(page);
  check('Keep local version makes this device’s text the one both devices have', (await docOn(pageB)).includes('[laptop-3]') && (await docOn(page)) === (await docOn(pageB)) && !(await docOn(page)).includes('[desktop-3]'));

  // Structured data: Level 35 on the desktop, 37 on the laptop; and unrelated edits to the same entry.
  const openKael = async (pg) => {
    await pg.goto(`${BASE}/project/${p27}/codex`);
    await pg.locator('.entry-list a', { hasText: 'Kael' }).click();
    await pg.locator('.codex-entry').getByLabel('Level value', { exact: true }).waitFor();
    return pg.locator('.codex-entry');
  };
  await syncOn(pageB);
  const kaelB = await openKael(pageB);
  await contextB.setOffline(true);
  await kaelB.getByLabel('Level value', { exact: true }).fill('37');
  await kaelB.getByLabel('Tags (comma separated)', { exact: true }).fill('laptop-tag');
  await kaelB.getByLabel('Tags (comma separated)', { exact: true }).blur();
  await until(async () => (await levelOn(pageB)) === '37' && (await kaelOn(pageB)).tags.includes('laptop-tag'), 'the laptop’s edits to be saved');
  const kaelA = await openKael(page);
  await kaelA.getByLabel('Level value', { exact: true }).fill('35');
  await kaelA.getByLabel('Short summary', { exact: true }).fill('Desktop summary');
  await kaelA.getByLabel('Short summary', { exact: true }).blur();
  await until(async () => (await levelOn(page)) === '35' && (await kaelOn(page)).summary === 'Desktop summary', 'the desktop’s edits to be saved');
  await syncOn(page);
  await pageB.locator('.sync-badge').click();
  await pageB.locator('.sync-page').waitFor();
  await contextB.setOffline(false);
  await until(async () => (await conflictsOn(pageB)).length > 0, 'the field conflict to be noticed');
  const fieldCard = pageB.getByRole('listitem', { name: /^Conflict: .*Kael/ });
  await fieldCard.waitFor();
  const fields27 = await conflictsOn(pageB);
  check('a field conflict is detected for the entry, and only for the field both changed', fields27.length === 1 && fields27[0].kind === 'fields' && fields27[0].fields.map((f) => f.field).join() === 'fields', JSON.stringify(fields27.map((c) => [c.kind, c.fields.map((f) => f.field)])));
  eq('it reads: Level, this device 37, cloud (Desktop) 35', (await fieldCard.locator('tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim()), ['Level 37 35']);
  check('…under headings naming each side', (await fieldCard.locator('thead').innerText()).replace(/\s+/g, ' ').includes('This device Cloud (Desktop)'));
  check('until a choice is made the local value stands', (await levelOn(pageB)) === '37');
  await pageB.screenshot({ path: SHOTS ? `${SHOTS}/27-field-conflict.png` : undefined });
  await fieldCard.getByRole('radio', { name: 'Keep the cloud\'s Level' }).click();
  await fieldCard.getByRole('button', { name: 'Use the chosen values' }).click();
  await until(async () => (await conflictsOn(pageB)).length === 0, 'the field conflict to be settled');
  const settled27 = await kaelOn(pageB);
  check('the chosen value is used, and what only one device changed is kept from both', settled27.fields.find((f) => f.key === 'Level').value === '35' && settled27.summary === 'Desktop summary' && settled27.tags.includes('laptop-tag'), JSON.stringify(settled27));
  await syncOn(pageB);
  await syncOn(page);
  const settledA = await kaelOn(page);
  check('…on both devices', settledA.fields.find((f) => f.key === 'Level').value === '35' && settledA.summary === 'Desktop summary' && settledA.tags.includes('laptop-tag'), JSON.stringify(settledA));

  const revisionsOn = async (pg) => (await dbAll27x(pg, 'chapterRevisions')).filter((r) => r.projectId === p27).map((r) => r.id).sort();
  const historyA = await revisionsOn(page);
  eq(`the chapter’s version history is the same on both devices (${historyA.length} versions)`, await revisionsOn(pageB), historyA);
  check('…and is not empty', historyA.length > 0);

  // Devices, history, backups.
  await pageB.goto(syncUrl27);
  const logB = await pageB.locator('.sync-log').innerText();
  check('the sync history records each conflict and how it was settled', (logB.match(/Both versions are kept until you choose/g) ?? []).length === 4 && (logB.match(/^.*“The text of .*”: /gm) ?? []).length === 3, logB.slice(0, 600));
  await page.goto(syncUrl27);
  await sp27.getByRole('button', { name: 'Connect' }).click();
  const devices27 = sp27.getByRole('table', { name: 'Devices on this account' });
  await devices27.waitFor();
  eq('both devices are listed with when each last synced', (await devices27.locator('tbody th').allInnerTexts()).map((t) => t.trim()).sort(), ['Desktop (this device)', 'Laptop']);
  check('…each with a time', (await devices27.locator('tbody td:nth-child(2)').allInnerTexts()).every((t) => /\d/.test(t)));
  await sp27.getByRole('button', { name: 'Show backups' }).click();
  const backups27 = sp27.getByRole('list', { name: 'Backups' });
  await backups27.waitFor();
  const had27 = await backups27.locator('li').count();
  check('the cloud took a backup by itself', had27 >= 1, String(had27));
  await sp27.getByRole('button', { name: 'Back up now' }).click();
  await until(async () => (await backups27.locator('li').count()) === had27 + 1, 'the new backup to be listed');
  check('Back up now adds one', true);
  await shot('27-backups');
  const projectsBefore = (await dbAll27x(page, 'projects')).length;
  const textBefore27x = await docOn(page);
  await backups27.locator('li').last().getByRole('button', { name: 'Restore as a copy' }).click();
  await page.waitForURL((url) => /\/project\/[\w-]+$/.test(url.pathname) && !url.pathname.endsWith(p27));
  const restoredId = page.url().split('/').pop();
  const restored27 = (await dbAll27x(page, 'projects')).find((p) => p.id === restoredId);
  const restoredDoc = JSON.stringify((await dbAll27x(page, 'chapterContents')).filter((row) => row.projectId === restoredId).map((row) => row.doc));
  check('one click restores a cloud backup as a separate project, with its text', restored27.title.includes('Skyfall') && (await dbAll27x(page, 'projects')).length === projectsBefore + 1 && restoredDoc.includes('The sky fell on a Tuesday.') && !restoredDoc.includes('[laptop-3]'), `${restored27.title} ${restoredDoc.slice(0, 200)}`);
  check('…and the project it came from is exactly as it was', (await docOn(page)) === textBefore27x);
  check('…and the restored copy is not itself syncing', !(await dbAll27x(page, 'syncState')).some((s) => s.projectId === restoredId && s.enabled));

  await page.goto(syncUrl27);
  await sp27.getByRole('button', { name: 'Stop syncing this project' }).click();
  await sp27.getByRole('button', { name: 'Sync this project' }).waitFor();
  check('syncing can be stopped: the badge goes and nothing on the device is removed', (await page.locator('.sync-badge').count()) === 0 && (await docOn(page)) === textBefore27x);
  await sp27.getByRole('button', { name: 'Sync this project' }).click();
  await page.locator('.sync-badge.sync-synced').waitFor();

  await pageB.setViewportSize({ width: 390, height: 780 });
  await pageB.goto(syncUrl27);
  await pageB.locator('.sync-page').waitFor();
  check('mobile: the sync page fits the screen', await pageB.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no browser errors on the second device', errorsB.length === 0, errorsB.join('\n      '));
  await contextB.close();
  for (let i = errors.length - 1; i >= 0; i--) if (expectedOffline.test(errors[i])) errors.splice(i, 1);

  // --- Phase 28: one app on desktop, tablet and phone ---
  // Three browser profiles stand in for three devices: this one (a desktop with a mouse), a phone and a tablet with touch.
  relay?.kill();
  const RELAY28 = 'http://localhost:8796';
  relay = spawn(process.execPath, ['server/relay.ts'], { env: { ...process.env, PORT: '8796', DATA: mkdtempSync(join(tmpdir(), 'nb-relay28-')) }, stdio: 'ignore' });
  const until28 = async (fn, what, ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  await until28(() => fetch(`${RELAY28}/v1/health`).then((r) => r.ok, () => false), 'the relay to start', 10000);
  const rows28 = (pg, table) => pg.evaluate((t) => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const r = open.result.transaction(t).objectStore(t).getAll(); r.onsuccess = () => { open.result.close(); resolve(r.result); }; }; }), table);
  const stored28 = (pg, key) => pg.evaluate((k) => localStorage.getItem(k), key);
  const marks28 = (pg) => pg.evaluate(() => ({ form: document.documentElement.dataset.form, input: document.documentElement.dataset.input }));
  const fits28 = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const shotOf = (pg, name) => (SHOTS ? pg.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
  const quiet28 = /ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to fetch|WebSocket|\[vite\]/;
  const watch28 = (pg) => {
    const found = [];
    pg.on('pageerror', (e) => found.push(e.message));
    pg.on('console', (m) => m.type() === 'error' && !quiet28.test(m.text()) && found.push(m.text()));
    return found;
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  const p28 = await createProject('Platform');
  eq('a desktop window with a mouse is recognised as one', await marks28(page), { form: 'desktop', input: 'mouse' });
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const ch28 = page.url().split('/').pop();
  const base28 = `${BASE}/project/${p28}`;
  const textOn28 = async (pg) => JSON.stringify((await rows28(pg, 'chapterContents')).find((row) => row.id === ch28)?.doc ?? null);
  await page.locator(text).click();
  await page.keyboard.type('Kael walked into the hall.');
  await until28(async () => (await textOn28(page)).includes('Kael walked into the hall.'), 'the text to be saved');
  // A second chapter, a character with a custom field, and a link from the text to the character.
  await page.goto(`${base28}/organizer`);
  await page.getByRole('button', { name: '+ Chapter' }).click();
  await until28(async () => (await rows28(page, 'chapters')).filter((c) => c.projectId === p28).length === 2, 'the second chapter');
  await page.goto(`${base28}/codex`);
  await page.getByText('Build your world').waitFor();
  const kaelId28 = await newCharacter('Kael', { summary: 'A reluctant heir.', fields: { Level: '5' } });
  const kael28 = async (pg) => (await rows28(pg, 'loreEntries')).find((e) => e.projectId === p28 && e.name === 'Kael');
  await until28(async () => (await kael28(page))?.fields.find((f) => f.key === 'Level')?.value === '5', 'the character to be saved');
  await page.goto(`${base28}/manuscript/${ch28}`);
  await page.locator(text).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Link to a codex entry' }).click();
  await page.locator('.link-bar .link-results button', { hasText: 'Kael' }).click();
  await page.locator(`${text} .ref-live`).waitFor();
  await until28(async () => (await textOn28(page)).includes('entityLink'), 'the link to be saved');

  // The desktop's own studio: contents on the left, the manuscript, plan and reference on the right.
  if (!(await page.locator('.ms-panel').isVisible())) await page.getByRole('button', { name: 'Plan and reference' }).click();
  await page.locator('.ms-panel').waitFor();
  const columns28 = async (pg) => {
    const box = async (selector) => ((await pg.locator(selector).isVisible()) ? pg.locator(selector).boundingBox() : null);
    const [nav, center, panel] = [await box('.ms-nav'), await box('.ms-center'), await box('.ms-panel')];
    return { nav: Boolean(nav), panel: Boolean(panel), inOrder: Boolean(nav && center && panel && nav.x + nav.width <= center.x + 1 && center.x + center.width <= panel.x + 1) };
  };
  eq('desktop: a three-column studio, contents, manuscript and reference side by side', await columns28(page), { nav: true, panel: true, inOrder: true });
  const DESKTOP_LAYOUT = 'novel-builder:studio:layout';
  const desktopLayout = await stored28(page, DESKTOP_LAYOUT);
  check('…saved as the desktop layout, with the right panel open', JSON.parse(desktopLayout).drafting.writeRight.open === true);
  check('desktop: mouse-sized controls', (await page.locator('.ms-bar .tool').first().boundingBox()).height < 40);
  await shotOf(page, '28-desktop');

  // The account, and the project sent to the cloud.
  await page.goto(`${base28}/sync`);
  const sync28 = page.locator('.sync-page');
  await sync28.getByLabel('Relay address').fill(RELAY28);
  await sync28.getByLabel('Device name').fill('Desktop');
  await sync28.getByRole('button', { name: 'Create a new key' }).click();
  const key28 = await sync28.getByLabel('Sync key').inputValue();
  if (await sync28.getByRole('button', { name: 'Sync this project' }).count()) await sync28.getByRole('button', { name: 'Sync this project' }).click();
  await page.locator('.sync-badge.sync-synced').waitFor();
  const syncOn28 = async (pg) => {
    await pg.goto(`${base28}/sync`);
    await (pg === page ? pg.getByRole('button', { name: 'Sync now' }).click() : pg.getByRole('button', { name: 'Sync now' }).tap());
    await pg.locator('.sync-page > .notice').waitFor();
    const said = await pg.locator('.sync-page > .notice').innerText();
    if (!said.startsWith('Synced')) throw new Error(`sync said: ${said}`);
  };
  await syncOn28(page);
  const join28 = async (pg, name, touch = true) => {
    await pg.goto(`${BASE}/cloud`);
    const cloud = pg.locator('.cloud-page');
    await cloud.getByLabel('Relay address').fill(RELAY28);
    await cloud.getByLabel('Device name').fill(name);
    await cloud.getByLabel('Sync key').fill(key28);
    // On a touch device everything is done by tapping, as a person would.
    const press = (target) => (touch ? target.tap() : target.click());
    await press(cloud.getByRole('button', { name: 'Show projects' }));
    await press(cloud.getByRole('button', { name: 'Download to this device' }));
    await pg.waitForURL(new RegExp(`/project/${p28}$`));
  };

  // ---- The phone ----
  const phoneCtx = await browser.newContext({ ...devices['iPhone 13'] });
  // A stand-in for the browser's speech recognition, which a test cannot speak to: it "hears" one phrase and stops.
  await phoneCtx.addInitScript(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'the lamps were already lit' }], { isFinal: true })] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    };
  });
  const phone = await phoneCtx.newPage();
  const phoneErrors = watch28(phone);
  await phone.goto(BASE);
  await phone.getByRole('heading', { name: 'Library' }).waitFor();
  eq('a phone is recognised as a phone, with touch', await marks28(phone), { form: 'phone', input: 'touch' });
  check('phone: the library fits the screen', await fits28(phone));
  await join28(phone, 'Phone');
  check('web: a fresh browser signs in with the key and loads the project straight from the cloud', (await rows28(phone, 'projects')).some((p) => p.id === p28 && p.title === 'Platform'));
  await phone.locator('.tab-bar').waitFor();
  eq('phone: one column, with a tab bar for what is done on the go', { tabs: await phone.locator('.tab-bar .tab').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ').trim().split(' ').pop())), sidebar: await phone.locator('.sidebar').isVisible(), studioBar: await phone.locator('.studio-bar').count(), appBar: await phone.locator('.app-bar').isVisible() }, { tabs: ['Write', 'Lore', 'Note', 'Goals', 'More'], sidebar: false, studioBar: 0, appBar: true });
  check('phone: the project home fits the screen', await fits28(phone));
  const tall = async (pg, selector) => Math.min(...(await pg.locator(selector).evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => Math.min(el.getBoundingClientRect().height, 999)))));
  check('phone: tabs and app-bar buttons are finger-sized (44px or more)', (await tall(phone, '.tab-bar .tab')) >= 44 && (await tall(phone, '.app-bar .tool')) >= 44, `${await tall(phone, '.tab-bar .tab')} ${await tall(phone, '.app-bar .tool')}`);
  await shotOf(phone, '28-phone-home');

  // DEVICE-AWARE LAYOUT ISOLATION: the desktop's three columns arrived with the sync, and the phone does not use them.
  eq('the desktop layout reached the phone through sync, as the desktop’s', await stored28(phone, DESKTOP_LAYOUT), desktopLayout);
  await phone.locator('.tab-bar').getByRole('link', { name: 'Write' }).tap();
  await phone.locator(text).waitFor();
  eq('ISOLATION: the phone opens the manuscript as a single column, not the desktop’s three', await columns28(phone), { nav: false, panel: false, inOrder: false });
  check('phone: the writing screen fits, and the page is as wide as the screen', (await fits28(phone)) && Math.round((await phone.locator('.ms-center').boundingBox()).width) === phone.viewportSize().width);
  eq('phone: the quick28x-action toolbar is at the thumb', await phone.getByRole('toolbar', { name: 'Quick actions' }).getByRole('button').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ').trim().split(' ').pop())), ['Format', 'Search', 'Lore', 'Note', 'Dictate']);
  check('…at the bottom of the screen, with finger-sized buttons', (await tall(phone, '.quick-bar .quick')) >= 44 && (await phone.locator('.quick-bar').boundingBox()).y > phone.viewportSize().height - 80);
  check('phone: the formatting row is put away until asked for', !(await phone.getByRole('button', { name: 'Bold' }).isVisible()));
  await shotOf(phone, '28-phone-writing');

  // Drafting on the phone.
  await phone.locator(text).tap();
  await phone.keyboard.press('ControlOrMeta+End');
  await phone.keyboard.type(' Nobody rose.');
  await until28(async () => (await textOn28(phone)).includes('Nobody rose.'), 'the phone’s writing to be saved');
  check('phone: drafting saves as it does everywhere', true);
  const quick28x = phone.getByRole('toolbar', { name: 'Quick actions' });
  await quick28x.getByRole('button', { name: 'Dictate' }).tap();
  await until28(async () => (await textOn28(phone)).includes('Nobody rose. the lamps were already lit'), 'the dictated words to be saved');
  check('phone: dictation puts the words in at the cursor exactly as heard', true);
  await quick28x.getByRole('button', { name: 'Format' }).tap();
  await phone.getByRole('button', { name: 'Bold' }).waitFor();
  check('phone: Format brings the formatting tools one tap away', (await phone.getByRole('button', { name: 'Italic' }).isVisible()) && (await fits28(phone)));
  await quick28x.getByRole('button', { name: 'Format' }).tap();

  await quick28x.getByRole('button', { name: 'Search' }).tap();
  const find28 = phone.locator('.search-dialog');
  await find28.getByLabel('Search this project').fill('reluctant');
  await find28.getByText('Kael').first().waitFor();
  check('phone: cross-reference search from the toolbar finds lore by its contents', true);
  await phone.keyboard.press('Escape');
  await find28.waitFor({ state: 'hidden' });

  await quick28x.getByRole('button', { name: 'Lore' }).tap();
  await phone.locator('.ms-panel').waitFor();
  await phone.locator('.ms-panel .quick-list').getByText('Kael').first().tap();
  await phone.locator('.quick-entry').waitFor();
  const looked = await phone.locator('.quick-entry').innerText();
  check('phone: a character is looked up without leaving the page', looked.includes('A reluctant heir.') && /level\s+5/i.test(looked), looked.slice(0, 200));
  await shotOf(phone, '28-phone-lore');
  await phone.locator('.ms-backdrop').tap({ position: { x: 10, y: 300 } });
  await phone.locator('.ms-panel').waitFor({ state: 'hidden' });

  await quick28x.getByRole('button', { name: 'Note' }).tap();
  const note28 = phone.getByRole('dialog').filter({ hasText: 'Quick note' });
  await note28.getByLabel('Note').fill('Kael should hesitate at the door.');
  const sheet = await note28.boundingBox();
  check('phone: dialogs come up as a sheet from the bottom, full width', Math.round(sheet.width) === phone.viewportSize().width && Math.round(sheet.y + sheet.height) === phone.viewportSize().height, JSON.stringify(sheet));
  await shotOf(phone, '28-phone-note');
  await note28.getByRole('button', { name: 'Save note' }).tap();
  await note28.getByRole('status').waitFor();
  await note28.getByRole('button', { name: 'Done' }).tap();
  check('phone: a quick28x note is saved to the project’s Notes / Ideas', (await rows28(phone, 'ideas')).some((i) => i.projectId === p28 && i.text === 'Kael should hesitate at the door.'));

  // Chapter navigation, and getting around.
  await phone.getByRole('button', { name: 'Contents', exact: true }).tap();
  await phone.locator('.ms-nav').waitFor();
  check('phone: chapters open from a drawer', (await phone.locator('.ms-nav .toc a').count()) === 2);
  await phone.locator('.ms-nav .toc a').nth(1).tap();
  await phone.waitForURL((url) => /manuscript\/[\w-]+$/.test(url.pathname) && !url.pathname.endsWith(ch28));
  check('…and choosing one goes to it and puts the drawer away', !(await phone.locator('.ms-nav').isVisible()));
  await phone.goto(base28);
  await phone.locator('.tab-bar').getByRole('link', { name: 'Goals' }).tap();
  await phone.getByRole('heading', { name: 'Progress' }).waitFor();
  check('phone: goal tracking is a tab away, and fits', await fits28(phone));
  await phone.locator('.tab-bar').getByRole('button', { name: 'More' }).tap();
  await phone.locator('.sidebar').waitFor();
  check('phone: everything else is behind More, including the workspace switch', (await phone.locator('.sidebar').getByRole('link', { name: 'Timeline' }).isVisible()) && (await phone.locator('.sidebar').getByLabel('Workspace').inputValue()) === 'drafting');
  await shotOf(phone, '28-phone-menu');
  await phone.locator('.sidebar').getByRole('link', { name: 'Organizer' }).tap();
  await phone.waitForURL(/organizer$/);
  await phone.locator('.sidebar').waitFor({ state: 'hidden' });
  check('…and the menu closes on arrival', !(await phone.locator('.ms-backdrop').count()));

  // Swipes, sent as real touch input.
  const touch28 = async (pg, from, to, y = 400) => {
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * i) / 4, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
  await touch28(phone, 6, 220);
  await phone.locator('.sidebar').waitFor();
  check('touch: swiping in from the left edge opens the menu', true);
  await touch28(phone, 260, 60);
  await phone.locator('.sidebar').waitFor({ state: 'hidden' });
  check('…and swiping it back puts it away', true);
  await touch28(phone, 150, 330);
  await phone.waitForTimeout(300);
  check('…while a swipe across the middle of the page does nothing', !(await phone.locator('.sidebar').isVisible()));
  // Chromium (headless shell v1248) swallows the first tap after touches sent straight through the protocol:
  // the tap's touch events arrive but no click follows. A tap on the heading takes that first tap.
  await phone.locator('.page-header h1').tap();

  // Structure and lore changed on the phone.
  const orderOn = async (pg) => (await rows28(pg, 'chapters')).filter((c) => c.projectId === p28).sort((a, b) => a.order - b.order).map((c) => c.id);
  const orderBefore = await orderOn(phone);
  await phone.locator('summary[aria-label^="Actions for"]').first().tap();
  const menu28 = phone.locator('details[open] > .menu-items');
  const menuBox = await menu28.boundingBox();
  check('phone: a context menu comes up as a sheet at the bottom, with finger-sized rows', menuBox.y + menuBox.height > phone.viewportSize().height - 40 && menuBox.width > phone.viewportSize().width - 40 && (await tall(phone, 'details[open] > .menu-items button')) >= 44, JSON.stringify(menuBox));
  await shotOf(phone, '28-phone-sheet');
  await menu28.getByRole('button', { name: 'Move down' }).tap();
  await until28(async () => JSON.stringify(await orderOn(phone)) === JSON.stringify([...orderBefore].reverse()), 'the chapters to change places');
  check('phone: chapters are reordered without dragging', true);
  await phone.locator('.tab-bar').getByRole('link', { name: 'Lore' }).tap();
  await phone.getByRole('heading', { name: 'Codex' }).waitFor();
  await phone.locator('.codex-list summary', { hasText: 'New entry' }).tap();
  await phone.locator('.codex-list .menu-items').getByText('Location', { exact: true }).tap();
  await phone.waitForFunction(() => document.querySelector('.entry-name input')?.value.startsWith('New '));
  const entryB = phone.locator('.codex-entry');
  await entryB.getByLabel('Name', { exact: true }).fill('Sera');
  await entryB.getByLabel('Short summary', { exact: true }).fill('Made on the phone.');
  await entryB.getByRole('button', { name: '+ Add field' }).tap();
  await entryB.getByLabel('Field 1 name', { exact: true }).fill('Level');
  await entryB.getByLabel('Level value', { exact: true }).fill('9');
  await entryB.getByLabel('Level value', { exact: true }).blur();
  const sera = async (pg) => (await rows28(pg, 'loreEntries')).find((e) => e.projectId === p28 && e.name === 'Sera');
  await until28(async () => (await sera(phone))?.fields.find((f) => f.key === 'Level')?.value === '9', 'the phone’s entry to be saved');
  check('phone: a codex entry with a custom field is created on the phone, and the page fits', await fits28(phone));
  check('phone: text fields are 16px or more, so the browser does not zoom in on them', (await entryB.getByLabel('Short summary', { exact: true }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 16);

  // The phone arranges its own workspace.
  await phone.goto(`${base28}/studio`);
  const studio28 = phone.locator('.studio-page');
  await studio28.getByRole('button', { name: 'Use Outliner' }).waitFor();
  check('phone: the workspace page says it is the phone layout being changed', (await studio28.locator('.page-header [role=status]').innerText()).includes('Phone layout') && (await studio28.locator('.device-facts').innerText()).replace(/\s+/g, ' ').includes('Interface Phone (detected) Input Touch'), await studio28.locator('.device-facts').innerText());
  await studio28.getByRole('button', { name: 'Use Outliner' }).tap();
  await until28(async () => (await stored28(phone, 'novel-builder:studio:phone:layout')) !== null, 'the phone layout to be saved');
  eq('ISOLATION: rearranging on the phone writes the phone layout and leaves the desktop’s exactly as it was', await stored28(phone, DESKTOP_LAYOUT), desktopLayout);
  await syncOn28(phone);

  // ---- Back on the desktop ----
  await syncOn28(page);
  eq('ISOLATION: after syncing with the phone, the desktop layout is byte for byte what it was', await stored28(page, DESKTOP_LAYOUT), desktopLayout);
  check('…the phone’s layout arrived beside it, under its own name', JSON.parse(await stored28(page, 'novel-builder:studio:phone:layout')).planning.left.kind === 'threads');
  await page.goto(`${base28}/manuscript/${ch28}`);
  await page.locator(text).waitFor();
  eq('…and the desktop still opens its three-column studio', await columns28(page), { nav: true, panel: true, inOrder: true });
  const same = (a, b, skip = []) => { const strip = (row) => JSON.stringify(Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !['updatedAt', ...skip].includes(k)).sort(([x], [y]) => x.localeCompare(y)))); return strip(a) === strip(b); };
  check('CONSISTENCY: the entry made on the phone is the same record on the desktop, field for field', same(await sera(page), await sera(phone)) && (await sera(page)).fields[0].key === 'Level', JSON.stringify(await sera(page)));
  eq('…the chapters are in the order the phone put them', await orderOn(page), await orderOn(phone));
  eq('…the text written and dictated on the phone is the desktop’s text', await textOn28(page), await textOn28(phone));
  check('…and the quick28x note is in Notes / Ideas', (await rows28(page, 'ideas')).some((i) => i.text === 'Kael should hesitate at the door.'));
  await page.goto(`${base28}/codex`);
  await page.locator('.entry-list a', { hasText: 'Sera' }).click();
  await page.waitForFunction(() => document.querySelector('.entry-name input')?.value === 'Sera');
  check('…and it opens on the desktop in the same form, with its field', (await field('Level value').inputValue()) === '9' && (await field('Short summary').inputValue()) === 'Made on the phone.');

  // ---- The tablet ----
  const tabletCtx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const tablet = await tabletCtx.newPage();
  const tabletErrors = watch28(tablet);
  await join28(tablet, 'Tablet');
  await tablet.locator('.app-bar').waitFor();
  check('a tablet-sized screen is recognised as a tablet', (await marks28(tablet)).form === 'tablet');
  await tablet.touchscreen.tap(400, 600);
  eq('…and switches to touch the moment it is touched', await marks28(tablet), { form: 'tablet', input: 'touch' });
  eq('tablet (portrait): panels are put away, the workspace switch stays, no phone tab bar', { sidebar: await tablet.locator('.sidebar').isVisible(), modes: await tablet.getByRole('radiogroup', { name: 'Workspace' }).isVisible(), tabBar: await tablet.locator('.tab-bar').count(), fits: await fits28(tablet) }, { sidebar: false, modes: true, tabBar: 0, fits: true });
  await touch28(tablet, 6, 260, 600);
  await tablet.locator('.sidebar').waitFor();
  check('tablet: a swipe from the left edge brings the navigation over the page', (await tall(tablet, '.sidebar .nav-link')) >= 44, String(await tall(tablet, '.sidebar .nav-link')));
  await shotOf(tablet, '28-tablet-nav');
  await touch28(tablet, 300, 60, 600);
  await tablet.locator('.sidebar').waitFor({ state: 'hidden' });
  await touch28(tablet, 814, 560, 600);
  await tablet.locator('.dock-shell-right').waitFor();
  check('…and one from the right edge brings the reference panel', true);
  // As on the phone: the first tap after the swipes is swallowed, so it goes to the panel's search box, where it does no harm.
  await tablet.locator('.dock-shell-right input[type="search"]').tap();
  await tablet.locator('.ms-backdrop').tap({ position: { x: 20, y: 600 } });
  await tablet.locator('.dock-shell-right').waitFor({ state: 'hidden' });

  await tablet.goto(`${base28}/manuscript/${ch28}`);
  await tablet.locator(text).waitFor();
  eq('ISOLATION: the tablet does not inherit the desktop’s three columns either', await columns28(tablet), { nav: false, panel: false, inOrder: false });
  await tablet.locator(`${text} .ref-live`).tap();
  const card28 = tablet.getByRole('dialog', { name: 'Reference card' });
  await card28.waitFor();
  await card28.getByText('A reluctant heir.').waitFor();
  check('tablet: tapping a name in the text opens a floating reference card, not a panel', (await card28.innerText()).includes('A reluctant heir.') && !(await tablet.locator('.ms-panel').isVisible()));
  const cardAt = await card28.boundingBox();
  const handle = await card28.locator('.float-card-head strong').boundingBox();
  await tablet.mouse.move(handle.x + 10, handle.y + 8);
  await tablet.mouse.down();
  await tablet.mouse.move(handle.x - 240, handle.y + 300, { steps: 6 });
  await tablet.mouse.up();
  const cardMoved = await card28.boundingBox();
  check('…the card can be dragged anywhere over the page', Math.abs(cardMoved.x - (cardAt.x - 250)) < 4 && Math.abs(cardMoved.y - (cardAt.y + 292)) < 4, JSON.stringify([cardAt, cardMoved]));
  await tablet.mouse.move(handle.x - 240, handle.y + 300);
  await tablet.mouse.down();
  await tablet.mouse.move(-500, -500, { steps: 4 });
  await tablet.mouse.up();
  const cardEdge = await card28.boundingBox();
  check('…but never off the screen', cardEdge.x >= 0 && cardEdge.y >= 0, JSON.stringify(cardEdge));
  await tablet.mouse.move(cardEdge.x + 120, cardEdge.y + 16);
  await tablet.mouse.down();
  await tablet.mouse.move(360, 420, { steps: 4 });
  await tablet.mouse.up();
  await shotOf(tablet, '28-tablet-card');
  check('…the text stays readable beside it, and is not changed by looking', (await textOn28(tablet)) === (await textOn28(page)));
  await card28.getByRole('button', { name: 'Open in the side panel' }).tap();
  await tablet.locator('.ms-panel .quick-entry').waitFor();
  check('…and it can be sent to the side panel instead', (await card28.count()) === 0 && (await tablet.locator('.ms-panel .quick-entry').innerText()).includes('A reluctant heir.'));
  await tablet.locator('.ms-backdrop').tap({ position: { x: 20, y: 600 } });

  // A pen is picked up.
  await tablet.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', bubbles: true })));
  const penSize = await tall(tablet, '.ms-bar .tool');
  eq('picking up a stylus is noticed', await marks28(tablet), { form: 'tablet', input: 'stylus' });
  await tablet.touchscreen.tap(400, 900);
  const fingerSize = await tall(tablet, '.ms-bar .tool');
  check('controls resize to the tool in hand: stylus 38px, finger 44px, mouse 34px', penSize === 38 && fingerSize === 44 && (await tall(page, '.btn')) < 44, `${penSize} ${fingerSize}`);

  // Landscape: there is room for a panel beside the page, and the tablet has its own say about which.
  await tablet.setViewportSize({ width: 1024, height: 768 });
  await tablet.goto(`${base28}/codex`);
  await tablet.getByRole('heading', { name: 'Codex' }).waitFor();
  eq('tablet (landscape): the navigation sits beside the page and can be collapsed', { form: (await marks28(tablet)).form, sidebar: await tablet.locator('.sidebar').isVisible(), right: await tablet.locator('.dock-shell-right').isVisible(), appBar: await tablet.locator('.app-bar').count(), fits: await fits28(tablet) }, { form: 'tablet', sidebar: true, right: false, appBar: 0, fits: true });
  await tablet.getByRole('button', { name: 'Left panel', exact: true }).tap();
  await tablet.locator('.sidebar').waitFor({ state: 'hidden' });
  check('…and the page takes the room it leaves', Math.round((await tablet.locator('.workspace-main').boundingBox()).width) === 1024, String((await tablet.locator('.workspace-main').boundingBox()).width));
  check('…collapsing it is saved as the tablet’s layout only', JSON.parse(await stored28(tablet, 'novel-builder:studio:tablet:layout')).drafting.left.open === false && (await stored28(tablet, DESKTOP_LAYOUT)) === desktopLayout);
  await shotOf(tablet, '28-tablet-landscape');
  // An edit on the tablet reaches the other two.
  check('tablet: the character made on the desktop is not a Codex entry here either', !(await tablet.locator('.entry-list a').allInnerTexts()).some((t) => t.includes('Kael')));
  await tablet.goto(`${base28}/characters/${kaelId28}`);
  const identityT = tablet.locator('.vault-profile').getByRole('region', { name: 'Core Identity', exact: true });
  await identityT.getByRole('button', { name: 'Edit Level', exact: true }).tap();
  const editT = identityT.getByRole('group', { name: 'Editing Level' });
  await editT.getByLabel('Level', { exact: true }).fill('6');
  await editT.getByRole('button', { name: 'Done' }).tap();
  await until28(async () => (await kael28(tablet))?.fields.find((f) => f.key === 'Level')?.value === '6', 'the tablet’s edit to be saved');
  await syncOn28(tablet);
  await syncOn28(phone);
  await syncOn28(page);
  const [kd, kp, kt] = [await kael28(page), await kael28(phone), await kael28(tablet)];
  check('CONSISTENCY: an edit made on the tablet is the same record on the phone and the desktop', same(kd, kt) && same(kp, kt) && kd.fields.find((f) => f.key === 'Level').value === '6', JSON.stringify([kd, kp, kt]));
  const tables28 = ['chapters', 'chapterContents', 'loreEntries', 'loreSchemas', 'ideas', 'characterProfiles'];
  const census = async (pg) => { const out = {}; for (const t of tables28) out[t] = (await rows28(pg, t)).filter((r) => r.projectId === p28).map((r) => Object.keys(r).sort().join()).sort().join('|'); return out; };
  eq('CONSISTENCY: every record has the same shape on all three devices', [await census(phone), await census(tablet)], [await census(page), await census(page)]);
  eq('ISOLATION: three devices, three layouts, and the desktop’s is still untouched', await stored28(page, DESKTOP_LAYOUT), desktopLayout);

  // One browser, pretending: the interface can be chosen, and choosing it changes no layout.
  await page.goto(`${base28}/studio`);
  await page.getByLabel('Interface on this device').selectOption('phone');
  await page.locator('.tab-bar').waitFor();
  check('the interface can be chosen by hand: the phone interface on a desktop screen', (await marks28(page)).form === 'phone' && (await page.locator('.studio-page .device-facts').innerText()).includes('chosen; detected Desktop'));
  await page.getByLabel('Interface on this device').selectOption('');
  await page.locator('.tab-bar').waitFor({ state: 'detached' });
  await page.goto(`${base28}/manuscript/${ch28}`);
  await page.locator(text).waitFor();
  eq('…and going back finds the desktop studio as it was left', [await columns28(page), await stored28(page, DESKTOP_LAYOUT)], [{ nav: true, panel: true, inOrder: true }, desktopLayout]);
  // A window dragged narrow and wide again.
  await page.setViewportSize({ width: 800, height: 800 });
  await page.locator('.ms-panel').waitFor({ state: 'hidden' });
  const narrow = await columns28(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.ms-panel').waitFor();
  eq('web: a browser window made narrow adapts, and widened again gets its studio back', [narrow, await columns28(page), await stored28(page, DESKTOP_LAYOUT)], [{ nav: false, panel: false, inOrder: false }, { nav: true, panel: true, inOrder: true }, desktopLayout]);

  check('no browser errors on the phone', phoneErrors.length === 0, phoneErrors.join('\n      '));
  check('no browser errors on the tablet', tabletErrors.length === 0, tabletErrors.join('\n      '));
  await phoneCtx.close();
  await tabletCtx.close();
  for (let i = errors.length - 1; i >= 0; i--) if (quiet28.test(errors[i])) errors.splice(i, 1);

  // --- Phase 29: collaboration ---
  // Five browser profiles are five people: the owner here, and a co-author, an editor, a beta reader and a viewer who join by link.
  relay?.kill();
  const RELAY29 = 'http://localhost:8794';
  relay = spawn(process.execPath, ['server/relay.ts'], { env: { ...process.env, PORT: '8794', DATA: mkdtempSync(join(tmpdir(), 'nb-relay29-')) }, stdio: 'ignore' });
  const until29 = async (fn, what, ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  await until29(() => fetch(`${RELAY29}/v1/health`).then((r) => r.ok, () => false), 'the relay to start', 10000);
  const rows29 = (pg, table) => pg.evaluate((t) => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const r = open.result.transaction(t).objectStore(t).getAll(); r.onsuccess = () => { open.result.close(); resolve(r.result); }; }; }), table);
  const quiet29 = /ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to fetch|WebSocket|\[vite\]|403/;
  const watch29 = (pg) => {
    const found = [];
    pg.on('pageerror', (e) => found.push(e.message));
    pg.on('console', (m) => m.type() === 'error' && !quiet29.test(m.text()) && found.push(m.text()));
    return found;
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  const p29 = await createProject('Guild');
  const base29 = `${BASE}/project/${p29}`;
  const mine29 = async (pg, table) => (await rows29(pg, table)).filter((row) => row.projectId === p29);
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const one29 = page.url().split('/').pop();
  const textIn = async (pg, chapterId) => ((await rows29(pg, 'chapterContents')).find((row) => row.id === chapterId)?.doc?.content ?? []).map((block) => (block.content ?? []).map((n) => n.text ?? '').join(''));
  await page.locator(text).click();
  await page.keyboard.type('It began in ash.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Nobody ran.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The bell rang.');
  await until29(async () => (await textIn(page, one29)).length === 3, 'chapter one to be saved');
  check('working alone, the only sign of collaboration on the page is a Comment button', (await page.locator('.collab-bar').getByRole('button').allInnerTexts()).join() === 'Comment' && (await page.locator('.collab-mode').count()) === 0);
  await page.goto(`${base29}/organizer`);
  await page.getByRole('button', { name: '+ Chapter' }).click();
  await until29(async () => (await mine29(page, 'chapters')).length === 2, 'the second chapter');
  await page.getByLabel('Status of Chapter 1').first().selectOption('published');
  await until29(async () => (await mine29(page, 'chapters')).some((c) => c.id === one29 && c.status === 'published'), 'chapter one to be published');
  const two29 = (await mine29(page, 'chapters')).find((c) => c.id !== one29).id;
  await page.goto(`${base29}/manuscript/${two29}`);
  await page.locator(text).click();
  await page.keyboard.type('The second day.');
  await until29(async () => (await textIn(page, two29)).join() === 'The second day.', 'chapter two to be saved');
  await page.goto(`${base29}/codex`);
  await page.getByText('Build your world').waitFor();
  // The lore card the team works on is a Codex entry (characters have their own page, and are not made here).
  await newEntry('Lore / History', 'Marcus');
  await field('Short summary').fill('A smith.');
  await page.getByRole('button', { name: '+ Add field' }).click();
  await field('Field 1 name').fill('Level');
  await field('Level value').fill('35');
  await field('Author notes (private)').fill('Dies in book three.');
  await field('Author notes (private)').blur();
  const marcus = async (pg) => (await mine29(pg, 'loreEntries')).find((e) => e.name === 'Marcus');
  const levelOf = async (pg) => (await marcus(pg))?.fields.find((f) => f.key === 'Level')?.value;
  await until29(async () => (await levelOf(page)) === '35' && (await marcus(page)).notes === 'Dies in book three.', 'Marcus to be saved');
  await page.goto(`${base29}/plot`);
  const drawer29 = page.locator('.rel-drawer');
  await page.getByRole('button', { name: 'New thread' }).click();
  await drawer29.getByLabel('Thread title').waitFor();
  await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'New thread');
  await drawer29.getByLabel('Thread title').fill('The Heist');
  await drawer29.getByLabel('Thread title').blur();
  await drawer29.getByLabel('New development', { exact: true }).fill('The plan is made');
  await drawer29.getByRole('button', { name: 'Add development' }).click();
  await until29(async () => (await mine29(page, 'plotThreads'))[0]?.beats.length === 1, 'the plot thread to be saved');

  // The team.
  await page.goto(`${base29}/team`);
  const team29 = page.locator('.team-page');
  check('a project has to be in the cloud before anyone can be invited to it', (await team29.getByRole('region', { name: 'Invite someone' }).innerText()).includes('Set up cloud sync'));
  await page.goto(`${base29}/sync`);
  const sp29 = page.locator('.sync-page');
  await sp29.getByLabel('Relay address').fill(RELAY29);
  await sp29.getByLabel('Device name').fill('Desktop');
  await sp29.getByRole('button', { name: 'Create a new key' }).click();
  if (await sp29.getByRole('button', { name: 'Sync this project' }).count()) await sp29.getByRole('button', { name: 'Sync this project' }).click();
  await page.locator('.sync-badge.sync-synced').waitFor();
  await page.goto(`${base29}/team`);
  await team29.getByRole('textbox', { name: 'Your name' }).fill('Raciel');
  check('the owner is told what they are', (await team29.locator('.page-header [role=status]').innerText()).startsWith('You are Raciel, Owner.'));
  eq('the five roles are described', (await team29.locator('.roles dt').allTextContents()), ['Owner', 'Co-Author', 'Editor', 'Beta Reader / Proofreader', 'Viewer']);
  const invite29 = async (name, role, email = '') => {
    const form = team29.getByRole('region', { name: 'Invite someone' });
    await form.getByLabel('Name of the person to invite').fill(name);
    await form.getByLabel('Email of the person to invite').fill(email);
    await form.getByLabel('Role for the person to invite').selectOption(role);
    await form.getByRole('button', { name: 'Create the invitation' }).click();
    await form.locator('.invite-made', { hasText: `${name} is invited` }).waitFor();
    return { link: await form.getByLabel('Invitation link').inputValue(), mail: await form.getByRole('link', { name: 'Write them an email' }).getAttribute('href') };
  };
  const sarahInvite = await invite29('Sarah', 'coauthor', 'sarah@example.com');
  check('an invitation is a link, shown once', /\/join#relay=http%3A%2F%2Flocalhost%3A8794&token=m_[0-9a-f]{64}_[\w-]+_[0-9a-f]{48}$/.test(sarahInvite.link), sarahInvite.link);
  check('…and can be sent by email from the owner’s own mail program, addressed and written', sarahInvite.mail.startsWith('mailto:sarah%40example.com?subject=') && decodeURIComponent(sarahInvite.mail).includes(sarahInvite.link) && decodeURIComponent(sarahInvite.mail).includes('as Co-Author'), sarahInvite.mail.slice(0, 120));
  const davidInvite = await invite29('David', 'editor');
  const danaInvite = await invite29('Dana', 'reader');
  const vicInvite = await invite29('Vic', 'viewer');
  const roster29 = team29.getByRole('region', { name: 'People on this project' });
  eq('everyone invited is listed with their role, not yet joined', await roster29.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.querySelector('th').textContent.trim().split(' ')[0], tr.querySelector('select').value, tr.children[2].textContent])), [['Sarah', 'coauthor', 'Invited, not joined yet'], ['David', 'editor', 'Invited, not joined yet'], ['Dana', 'reader', 'Invited, not joined yet'], ['Vic', 'viewer', 'Invited, not joined yet']]);
  await shot('29-team');

  const syncState29 = async (pg) => (await rows29(pg, 'syncState')).find((s) => s.projectId === p29);
  /** Lets what was just done be noted, then runs two rounds of sync (the app syncs whenever the connection "returns"). */
  const sync29 = async (pg) => {
    await pg.waitForTimeout(400);
    for (let round = 0; round < 2; round++) {
      const before = (await syncState29(pg))?.lastSyncAt ?? 0;
      await pg.waitForTimeout(5);
      await pg.evaluate(() => window.dispatchEvent(new Event('online')));
      await until29(async () => { const s = await syncState29(pg); return s && s.lastSyncAt > before && !s.syncing; }, 'a sync to finish');
    }
  };
  const settle29 = async (...pages) => { for (const pg of pages) await sync29(pg); };
  await sync29(page);
  const join29 = async (invite, name, role) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    const errs = watch29(pg);
    await pg.goto(invite.link);
    const card = pg.getByRole('region', { name: 'Invitation' });
    await card.getByText('You are invited to').waitFor();
    const said = (await card.innerText()).replace(/\s+/g, ' ');
    await card.getByLabel('Your name').fill(name);
    await card.getByRole('button', { name: 'Join the project' }).click();
    await pg.waitForURL(new RegExp(`/project/${p29}$`));
    await pg.locator('.sidebar nav').waitFor();
    return { pg, ctx, errs, said, nav: await pg.locator('.sidebar nav a').allInnerTexts(), badge: await pg.locator('.role-badge').innerText(), role };
  };
  const sarah = await join29(sarahInvite, 'Sarah', 'coauthor');
  const david = await join29(davidInvite, 'David', 'editor');
  const dana = await join29(danaInvite, 'Dana', 'reader');
  const vic = await join29(vicInvite, 'Vic', 'viewer');
  check('the link says what it is an invitation to, and as what', sarah.said.includes('You are invited to Guild as Co-Author.') && vic.said.includes('You are invited to Guild as Viewer.'), sarah.said);
  eq('each person is told their role in the project', [sarah.badge, david.badge, dana.badge, vic.badge], ['Shared with you · Co-Author', 'Shared with you · Editor', 'Shared with you · Beta Reader / Proofreader', 'Shared with you · Viewer']);
  check('a co-author is shown every page', ['Manuscript', 'Codex', 'Plot threads', 'Progress', 'Team', 'Settings'].every((name) => sarah.nav.includes(name)), sarah.nav.join());
  eq('an editor is shown the manuscript, the lore and the plot, to review', david.nav, ['Overview', 'Manuscript', 'Reader preview', 'Organizer', 'Scene board', 'Characters', 'Codex', 'Relationships', 'Timeline', 'Plot threads', 'Canon', 'Story graph', 'Visualize', 'Modules', 'Team', 'Workspace']);
  eq('a beta reader is shown the manuscript, its reader preview and their conversations', dana.nav, ['Overview', 'Manuscript', 'Reader preview', 'Team', 'Workspace']);
  eq('a viewer is shown the manuscript and its reader preview', vic.nav, ['Overview', 'Manuscript', 'Reader preview', 'Workspace']);
  const has = async (pg) => ({ chapters: (await mine29(pg, 'chapters')).length, text: (await mine29(pg, 'chapterContents')).length, lore: (await mine29(pg, 'loreEntries')).length, plot: (await mine29(pg, 'plotThreads')).length });
  eq('each device holds only what its role may see', [await has(sarah.pg), await has(david.pg), await has(dana.pg), await has(vic.pg)], [{ chapters: 2, text: 2, lore: 1, plot: 1 }, { chapters: 2, text: 2, lore: 1, plot: 1 }, { chapters: 2, text: 2, lore: 0, plot: 0 }, { chapters: 1, text: 1, lore: 0, plot: 0 }]);
  check('the author’s private notes on a character do not reach an editor; they do reach a co-author', (await marcus(david.pg)).notes === '' && (await marcus(sarah.pg)).notes === 'Dies in book three.');
  await dana.pg.goto(`${base29}/codex`);
  await dana.pg.waitForURL(/\/manuscript/);
  check('a page outside a role leads back to the manuscript', true);

  // ---- The beta reader: reads, comments, reacts, gives feedback.
  await dana.pg.goto(`${base29}/manuscript/${one29}`);
  await dana.pg.locator(text).waitFor();
  const bar = (who) => who.pg.locator('.collab-bar');
  eq('a reader’s manuscript is for reading: no toolbar, no plan panel, and it says so', { mode: await bar(dana).locator('.collab-mode').innerText(), editable: await dana.pg.locator(text).getAttribute('contenteditable'), bold: await dana.pg.getByRole('button', { name: 'Bold' }).count(), plan: await dana.pg.getByRole('button', { name: 'Plan and reference' }).count() }, { mode: 'Reading as Beta Reader / Proofreader.', editable: 'false', bold: 0, plan: 0 });
  await dana.pg.locator(`${text} p`).nth(1).click();
  await dana.pg.keyboard.type('I was here.');
  await dana.pg.waitForTimeout(400);
  eq('…typing changes nothing', await dana.pg.$$eval(`${text} > *`, (els) => els.map((el) => el.textContent)), ['It began in ash.', 'Nobody ran.', 'The bell rang.']);
  await dana.pg.locator(`${text} p`).nth(1).dblclick({ position: { x: 30, y: 10 } });
  await bar(dana).getByRole('button', { name: 'Comment', exact: true }).click();
  const talk = (pg) => pg.locator('.cmt-dialog');
  await talk(dana.pg).getByLabel('New comment').fill('Would nobody run at all?');
  const quoted = await talk(dana.pg).locator('.cmt-quote').first().innerText();
  await talk(dana.pg).getByRole('button', { name: 'Comment', exact: true }).click();
  await talk(dana.pg).getByRole('listitem', { name: /^Conversation: Would nobody run/ }).waitFor();
  await dana.pg.keyboard.press('Escape');
  check('a comment attaches to the words that were selected', quoted.length > 0 && 'Nobody ran.'.includes(quoted) && (await dana.pg.locator(`${text} .cmt`).innerText()) === quoted, quoted);
  await bar(dana).getByLabel('React to the selection or the chapter').selectOption('Loved this');
  await bar(dana).getByText(/^Noted: “Loved this”/).waitFor();
  await bar(dana).getByRole('button', { name: 'Feedback form' }).click();
  const form29 = dana.pg.getByRole('dialog').filter({ hasText: 'Feedback on' });
  await form29.getByLabel('Pacing').selectOption('2');
  await form29.getByLabel('Wanted to keep reading').selectOption('5');
  await form29.getByLabel('Feedback', { exact: true }).fill('Slow start, strong end.');
  await form29.getByRole('button', { name: 'Send feedback' }).click();
  await until29(async () => (await mine29(dana.pg, 'comments')).length === 3, 'the reader’s three notes');
  eq('a reader leaves comments, reactions and a feedback form, all signed', (await mine29(dana.pg, 'comments')).map((c) => [c.kind, c.authorName, c.authorRole]).sort(), [['comment', 'Dana', 'reader'], ['feedback', 'Dana', 'reader'], ['reaction', 'Dana', 'reader']]);
  if (SHOTS) await dana.pg.screenshot({ path: `${SHOTS}/29-reader.png` });

  // ---- The viewer: the published chapter, and nothing to do but read it.
  await vic.pg.goto(`${base29}/manuscript`);
  await vic.pg.locator(text).waitFor();
  eq('a viewer has the published chapter only, cannot type and cannot comment', { toc: await vic.pg.locator('.toc a').count(), url: vic.pg.url().endsWith(one29), editable: await vic.pg.locator(text).getAttribute('contenteditable'), buttons: await bar(vic).getByRole('button').count(), mode: await bar(vic).locator('.collab-mode').innerText() }, { toc: 1, url: true, editable: 'false', buttons: 0, mode: 'Reading as Viewer.' });

  // ---- The editor: tracked changes to the text, a suggested edit to the lore, comments.
  await david.pg.goto(`${base29}/manuscript/${one29}`);
  await david.pg.locator(text).waitFor();
  check('an editor’s manuscript opens in suggesting mode', (await bar(david).locator('.collab-mode').innerText()).startsWith('Suggesting.'));
  await david.pg.locator(`${text} p`).first().click();
  await david.pg.keyboard.press('End');
  await david.pg.keyboard.press('ArrowLeft');
  await david.pg.keyboard.type(' and silence');
  // Then to the end of the chapter, as a click there would: the editor's own command, once the words above have reached it.
  // (Arrow keys reach the editor a moment late, and on a busy machine later than any fixed pause.)
  await david.pg.waitForFunction((sel) => document.querySelector(sel)?.editor?.state.doc.textContent.includes('ash and silence'), text);
  await david.pg.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), text);
  await david.pg.waitForFunction((sel) => {
    const state = document.querySelector(sel)?.editor?.state;
    const { empty, $head } = state?.selection ?? {};
    return Boolean(empty && $head.index(0) === state.doc.childCount - 1 && $head.parentOffset === $head.parent.content.size);
  }, text);
  await david.pg.keyboard.press('Enter');
  await david.pg.keyboard.type('A dog barked.');
  await until29(async () => JSON.stringify((await mine29(david.pg, 'suggestions'))[0]?.proposed ?? '').includes('A dog barked.'), 'the editor’s changes to be kept as a suggestion');
  eq('OWNER FINAL AUTHORITY: the editor’s typing is a proposal; the manuscript on their own device is untouched', await textIn(david.pg, one29), ['It began in ash.', 'Nobody ran.', 'The bell rang.']);
  await david.pg.reload();
  await david.pg.locator(text).waitFor();
  eq('…and the editor carries on with their proposal when they come back', await david.pg.$$eval(`${text} > *`, (els) => els.map((el) => el.textContent)), ['It began in ash and silence.', 'Nobody ran.', 'The bell rang.', 'A dog barked.']);
  await david.pg.goto(`${base29}/codex`);
  await david.pg.locator('.entry-list a', { hasText: 'Marcus' }).click();
  const entryD = david.pg.locator('.codex-entry');
  await entryD.getByLabel('Short summary', { exact: true }).waitFor();
  check('lore is shown to an editor for reading: the fields are switched off, and the page says why', (await entryD.getByLabel('Short summary', { exact: true }).isDisabled()) && (await entryD.getByLabel('Level value', { exact: true }).isDisabled()) && (await david.pg.locator('.readonly-note').innerText()).includes('You are here as Editor'));
  await entryD.getByRole('button', { name: 'Suggest an edit' }).click();
  const suggestD = david.pg.getByRole('dialog').filter({ hasText: 'Suggest an edit to Marcus' });
  await suggestD.getByLabel('Suggested Level').fill('37');
  await suggestD.getByLabel('Reason for the suggestion').fill('He levels up in chapter nine.');
  await suggestD.getByRole('button', { name: 'Send the suggestion' }).click();
  await entryD.getByRole('list', { name: 'Suggested edits' }).getByText('Waiting for an author. The entry is unchanged.').waitFor();
  check('“Level 35 → 37” is a suggestion: Marcus is still Level 35', (await levelOf(david.pg)) === '35' && (await entryD.getByRole('list', { name: 'Suggested edits' }).innerText()).replace(/\s+/g, ' ').includes('Level: 35 → 37'));
  if (SHOTS) await david.pg.screenshot({ path: `${SHOTS}/29-editor-lore.png` });
  await entryD.getByRole('button', { name: /^Comments on Marcus/ }).click();
  await talk(david.pg).getByLabel('New comment').fill('Give him a limp after the forge fire?');
  await talk(david.pg).getByRole('button', { name: 'Comment', exact: true }).click();
  await talk(david.pg).getByRole('listitem', { name: /^Conversation: Give him a limp/ }).waitFor();
  await david.pg.keyboard.press('Escape');
  await david.pg.goto(`${base29}/plot`);
  await david.pg.locator('.thread-title', { hasText: 'The Heist' }).first().click();
  await david.pg.locator('.rel-drawer .beat-list').getByRole('button', { name: /^Comments on/ }).click();
  await talk(david.pg).getByLabel('New comment').fill('The guards vanish after this.');
  await talk(david.pg).getByRole('button', { name: 'Comment', exact: true }).click();
  await talk(david.pg).getByRole('listitem', { name: /^Conversation: The guards vanish/ }).waitFor();
  await david.pg.keyboard.press('Escape');
  eq('comments attach to a worldbuilding card and to a plot development', (await mine29(david.pg, 'comments')).map((c) => [c.target.kind, c.targetLabel]).sort(), [['beat', 'The Heist: The plan is made'], ['entry', 'Marcus']]);

  // ---- The co-author: writes directly.
  await sarah.pg.goto(`${base29}/manuscript/${two29}`);
  await sarah.pg.locator(text).click();
  await sarah.pg.keyboard.press('End');
  await sarah.pg.keyboard.type(' Sarah was here.');
  await until29(async () => (await textIn(sarah.pg, two29)).join() === 'The second day. Sarah was here.', 'the co-author’s writing to be saved');
  await sarah.pg.goto(`${base29}/codex`);
  await sarah.pg.locator('.entry-list a', { hasText: 'Marcus' }).click();
  await sarah.pg.locator('.codex-entry').getByLabel('Short summary', { exact: true }).fill('A master smith.');
  await sarah.pg.locator('.codex-entry').getByLabel('Short summary', { exact: true }).blur();
  await until29(async () => (await marcus(sarah.pg)).summary === 'A master smith.', 'the co-author’s lore edit');
  check('a co-author writes the manuscript and the lore directly', true);

  await settle29(dana.pg, david.pg, sarah.pg, page, dana.pg, david.pg, sarah.pg);

  // ---- The owner: reviews, answers, converts, decides.
  eq('who sees whose comments: the editor sees all, the reader only their own, the viewer none', [(await mine29(david.pg, 'comments')).length, (await mine29(dana.pg, 'comments')).length, (await mine29(vic.pg, 'comments')).length, (await mine29(page, 'comments')).length], [5, 3, 0, 5]);
  await page.goto(`${base29}/manuscript/${one29}`);
  await page.locator(text).waitFor();
  await page.locator(`${text} .cmt`).first().waitFor();
  eq('the owner’s manuscript is as they wrote it, with the reader’s comment marked on it', await paragraphs(), ['It began in ash.', 'Nobody ran.', 'The bell rang.']);
  await page.locator('.collab-bar').getByRole('button', { name: 'Review suggestions (1)' }).click();
  const review29 = page.locator('.review');
  const byDavid = review29.getByRole('region', { name: 'Changes suggested by David' });
  await byDavid.waitFor();
  eq('the editor’s changes are shown one by one, under their name, words in and words out', await byDavid.locator('.hunk').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('ins')].map((i) => i.textContent.trim()).join('|'))), ['and silence', 'A dog barked.']);
  await shot('29-review');
  await byDavid.getByRole('listitem', { name: 'Change 1 by David' }).getByRole('button', { name: 'Accept' }).click();
  await until29(async () => (await textIn(page, one29))[0] === 'It began in ash and silence.', 'the accepted change to reach the manuscript');
  await byDavid.getByRole('listitem', { name: 'Change 2 by David' }).getByRole('button', { name: 'Reject' }).click();
  await byDavid.getByText('Rejected by Raciel.').waitFor();
  await page.keyboard.press('Escape');
  await page.locator(text).waitFor();
  eq('accepting one change and rejecting another makes exactly the accepted one', [await textIn(page, one29), await paragraphs()], [['It began in ash and silence.', 'Nobody ran.', 'The bell rang.'], ['It began in ash and silence.', 'Nobody ran.', 'The bell rang.']]);
  await page.locator(`${text} .cmt`).first().click();
  await talk(page).getByLabel('Reply').fill('They are too tired to.');
  await talk(page).getByRole('button', { name: 'Reply', exact: true }).click();
  await talk(page).getByText('They are too tired to.').waitFor();
  await talk(page).getByRole('button', { name: 'Resolve' }).click();
  await talk(page).getByText('Resolved by Raciel.').waitFor();
  await page.keyboard.press('Escape');
  await page.locator(`${text} .cmt-resolved`).waitFor();
  check('the owner replies in the reader’s thread and resolves it', true);

  await page.goto(`${base29}/codex`);
  await page.locator('.entry-list a', { hasText: 'Marcus' }).click();
  const edits29 = page.locator('.codex-entry').getByRole('list', { name: 'Suggested edits' });
  await edits29.getByRole('button', { name: 'Accept' }).click();
  await until29(async () => (await levelOf(page)) === '37', 'the accepted edit to reach the entry');
  check('the owner accepts the suggested edit, and only then is Marcus Level 37', (await marcus(page)).summary === 'A master smith.' && (await marcus(page)).notes === 'Dies in book three.');

  await page.goto(`${base29}/team`);
  await team29.getByLabel('Which conversations to show').selectOption('all');
  const limp = team29.getByRole('listitem', { name: /^Conversation: Give him a limp/ });
  await limp.getByRole('button', { name: 'Turn into…' }).click();
  await limp.getByLabel('A development on a plot thread').selectOption({ label: 'The Heist' });
  await limp.getByText('Turned into').waitFor();
  const guards = team29.getByRole('listitem', { name: /^Conversation: The guards vanish/ });
  await guards.getByRole('button', { name: 'Turn into…' }).click();
  await guards.getByRole('button', { name: 'A task' }).click();
  await until29(async () => (await mine29(page, 'goals')).length === 1, 'the task to be made');
  const beats29 = (await mine29(page, 'plotThreads'))[0].beats;
  check('an editor’s comment becomes a plot-thread development, signed with where it came from', beats29.length === 2 && beats29[1].note === 'Give him a limp after the forge fire? (David, on Marcus)', JSON.stringify(beats29));
  check('…and another becomes a task', (await mine29(page, 'goals'))[0].title === 'The guards vanish after this. (David, on The Heist: The plan is made)' && (await mine29(page, 'goals'))[0].kind === 'task');
  check('…and both conversations say what they became, and are resolved', (await mine29(page, 'comments')).filter((c) => c.converted).map((c) => [c.converted.kind, c.status]).sort().join() === 'beat,resolved,task,resolved');
  await page.waitForTimeout(500);
  const record29 = (await team29.locator('.activity-log li').allInnerTexts()).map((line) => line.replace(/\s+/g, ' ').replace(/ \(\d+ times\)| [A-Z][a-z]{2} \d+, .*$/g, '').trim());
  const expected29 = ['Sarah edited Chapter 2', 'Sarah updated Marcus', 'David commented on Marcus', 'David commented on The Heist: The plan is made', 'David suggested changes to Chapter 1', 'David suggested an edit to Marcus', 'Dana commented on Chapter 1', 'Dana gave feedback on Chapter 1', 'Raciel accepted a change suggested by David in Chapter 1', 'Raciel rejected a change suggested by David in Chapter 1', 'Raciel accepted an edit suggested by David to Marcus', "Raciel updated Marcus", 'Raciel invited David as Editor', 'Raciel edited Chapter 1'];
  check('the record names who did what: writing, lore, comments, suggestions and verdicts', expected29.every((line) => record29.includes(line)), `missing: ${expected29.filter((line) => !record29.includes(line)).join(' / ')}\n      have: ${record29.join(' / ')}`);
  await team29.getByLabel('Whose activity to show').selectOption({ label: 'Sarah' });
  check('…and can be read one person at a time', (await team29.locator('.activity-log li strong').allInnerTexts()).every((name) => name === 'Sarah'));
  await shot('29-activity');

  await settle29(page, sarah.pg, david.pg, dana.pg, page);
  eq('the accepted change is everyone’s text now; the rejected one is nobody’s', [await textIn(sarah.pg, one29), await textIn(david.pg, one29), await textIn(dana.pg, one29)], Array(3).fill(['It began in ash and silence.', 'Nobody ran.', 'The bell rang.']));
  check('the co-author’s chapter reached the owner, signed', (await textIn(page, two29)).join() === 'The second day. Sarah was here.' && (await rows29(page, 'chapterContents')).find((r) => r.id === two29).by.name === 'Sarah');
  await david.pg.goto(`${base29}/manuscript/${one29}`);
  await david.pg.locator(text).waitFor();
  await until29(async () => Object.keys((await mine29(david.pg, 'suggestions')).find((s) => s.kind === 'text')?.decisions ?? {}).length === 2, 'the verdicts to reach the editor');
  await bar(david).getByRole('button', { name: 'My suggested changes' }).click();
  await david.pg.locator('.review .hunk').first().waitFor();
  const mineD = (await david.pg.locator('.review .hunk').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check('the editor sees what became of each change', mineD.length === 2 && mineD[0].includes('Accepted by Raciel.') && mineD[1].includes('Rejected by Raciel.'), mineD.join(' / '));
  await david.pg.keyboard.press('Escape');
  await dana.pg.goto(`${base29}/team`);
  await dana.pg.locator('.team-page').getByLabel('Which conversations to show').selectOption('resolved');
  const danaThread = (await dana.pg.locator('.team-page .cmt-thread').first().innerText()).replace(/\s+/g, ' ');
  check('the reader sees the owner’s reply, and that it was resolved', danaThread.includes('Raciel') && danaThread.includes('They are too tired to.') && danaThread.includes('Resolved by Raciel.'), danaThread);
  check('…but is shown no activity record, holds nobody’s activity but their own, and no roster beyond themselves', (await dana.pg.locator('.activity-log').count()) === 0 && (await mine29(dana.pg, 'activity')).every((a) => a.actorName === 'Dana') && (await mine29(dana.pg, 'members')).map((m) => m.name).join() === 'Dana');
  check('the editor sees the team, without anyone’s email address', (await mine29(david.pg, 'members')).length === 4 && (await mine29(david.pg, 'members')).every((m) => m.email === '') && (await mine29(page, 'members')).some((m) => m.email === 'sarah@example.com'));

  // ---- The relay holds the line whatever a device sends.
  const tokenOf = (invite) => decodeURIComponent(invite.link.split('token=')[1]);
  const cloudRow = async (key) => (await (await fetch(`${RELAY29}/v1/sync`, { method: 'POST', headers: { authorization: `Bearer ${tokenOf(sarahInvite)}`, 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: 'probe', deviceName: 'probe', projectId: p29, cursor: 0, changes: [], resync: true }) })).json()).remote.find((r) => r.key === key);
  const marcusKey = `loreEntries:${(await marcus(page)).id}`;
  const held = await cloudRow(marcusKey);
  // Each forged change is made against the row as it stands, so that it is judged on permission alone.
  const heldText = await cloudRow(`chapterContents:${one29}`);
  const forged = [];
  for (const invite of [davidInvite, danaInvite, vicInvite]) {
    const reply = await (await fetch(`${RELAY29}/v1/sync`, { method: 'POST', headers: { authorization: `Bearer ${tokenOf(invite)}`, 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: 'forged', deviceName: 'forged', projectId: p29, cursor: 0, changes: [{ key: marcusKey, row: { ...held.row, name: 'Hacked' }, baseSeq: held.seq }, { key: `chapterContents:${one29}`, row: { id: one29, projectId: p29, doc: { type: 'doc', content: [] } }, baseSeq: heldText.seq }] }) })).json();
    forged.push([reply.accepted.length, reply.denied.length]);
  }
  check('requests forged with an editor’s, a reader’s and a viewer’s invitation are refused by the relay itself', forged.join('|') === '0,2|0,2|0,2' && (await cloudRow(marcusKey)).row.name === 'Marcus', forged.join('|'));
  const peek = await (await fetch(`${RELAY29}/v1/projects`, { headers: { authorization: `Bearer ${tokenOf(danaInvite)}` } })).json();
  check('…and an invitation opens nothing but its own project', peek.error === 'Only the owner can do that.', JSON.stringify(peek));

  // ---- Roles change, and access ends.
  await page.goto(`${base29}/team`);
  await roster29.waitFor();
  eq('the roster shows who has joined', await roster29.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => tr.children[2].textContent)), Array(4).fill('Active'));
  await roster29.getByLabel('Role of Dana').selectOption('viewer');
  await until29(async () => (await mine29(page, 'members')).find((m) => m.name === 'Dana')?.role === 'viewer', 'the role change');
  await sync29(page);
  await sync29(dana.pg);
  await dana.pg.goto(`${base29}/manuscript/${one29}`);
  await dana.pg.locator(text).waitFor();
  check('a changed role takes effect at the next sync: Dana, now a Viewer, can no longer comment, and her copy of the conversations is gone', (await bar(dana).getByRole('button').count()) === 0 && (await bar(dana).locator('.collab-mode').innerText()) === 'Reading as Viewer.' && (await mine29(dana.pg, 'comments')).length === 0);
  check('…and has lost the unpublished chapter', (await mine29(dana.pg, 'chapters')).length === 1 && (await mine29(page, 'comments')).length === 6);
  await roster29.getByRole('button', { name: 'Remove Vic' }).click();
  await roster29.getByRole('button', { name: 'Restore access' }).waitFor();
  await vic.pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await until29(async () => /access has been removed/.test((await syncState29(vic.pg))?.lastError ?? ''), 'the removed viewer to be refused');
  check('someone removed is refused at their next sync', (await roster29.locator('tbody tr', { hasText: 'Vic' }).innerText()).includes('Access removed'));

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${base29}/team`);
  await team29.waitFor();
  check('mobile: the team page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const who of [sarah, david, dana, vic]) check(`no browser errors for the ${who.role}`, who.errs.length === 0, who.errs.join('\n      '));
  for (const who of [sarah, david, dana, vic]) await who.ctx.close();
  for (let i = errors.length - 1; i >= 0; i--) if (quiet29.test(errors[i])) errors.splice(i, 1);

  // --- Phase 30: reader preview ---
  await page.setViewportSize({ width: 1280, height: 800 });
  const p30 = await createProject('Lantern');
  const base30 = `${BASE}/project/${p30}`;
  // A small book: a volume holding a long first chapter and a second chapter in two scenes, then an empty third.
  await page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'chapterContents'], 'readwrite');
      const para = (text, marks) => ({ type: 'paragraph', content: text ? [{ type: 'text', text, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) }] : [] });
      const node = (id, kind, title, parentId, order, extra = {}) => tx.objectStore('chapters').add({ id: `${projectId}-${id}`, projectId, parentId: parentId ? `${projectId}-${parentId}` : null, kind, title, order, summary: '', notes: '', status: 'drafting', wordCount: 0, charCount: 0, createdAt: 1, updatedAt: 1, ...extra });
      const text = (id, content) => tx.objectStore('chapterContents').add({ id: `${projectId}-${id}`, projectId, doc: { type: 'doc', content }, rev: 1, savedAt: 1 });
      node('v1', 'volume', 'The Ash', null, 0);
      node('c1', 'chapter', 'Chapter 1', 'v1', 0);
      node('c2', 'chapter', 'The Bell', 'v1', 1, { noteBefore: 'Thank you for reading this far.\nThis one is short.', noteAfter: 'Next chapter on Friday.' });
      node('s1', 'scene', 'Morning', 'c2', 0);
      node('s2', 'scene', 'Night', 'c2', 1);
      node('c3', 'chapter', 'After', null, 1);
      const long = [];
      for (let i = 1; i <= 70; i++) long.push(para(`Paragraph ${i}. The lamp burned low and the keeper counted the hours by its guttering, as her mother had, and her mother before her.`));
      long.splice(35, 0, para('***'));
      text('c1', [para('"Wait," she said.'), ...long]);
      text('c2', [para('The bell rang once.')]);
      text('s1', [para(''), para('Morning came '), para('slowly', ['italic']), para('')]);
      text('s2', [para('Night fell.'), { type: 'horizontalRule' }, para('It stayed.', ['bold'])]);
      text('c3', []);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), p30);
  await page.goto(`${base30}/settings`);
  await page.getByLabel('Author / pen name').fill('R. G. Almonte');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Changes saved.').waitFor();
  const matter30 = page.getByRole('region', { name: 'Front and back matter' });
  for (const [label, value] of [['Dedication', 'For the patient.'], ['Epigraph', 'All is ash.'], ['Epigraph source', 'An old song'], ['Copyright page', 'Copyright © 2026 R. G. Almonte'], ['About the author', 'Writes at night.']]) {
    await matter30.getByLabel(label, { exact: true }).fill(value);
    await matter30.getByLabel(label, { exact: true }).blur();
  }
  await matter30.getByLabel('Scene break').selectOption('⁂');
  const all30 = (pg) => pg.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = async () => {
      const out = {};
      for (const name of [...open.result.objectStoreNames].sort()) out[name] = await new Promise((done) => { const r = open.result.transaction(name).objectStore(name).getAll(); r.onsuccess = () => done(r.result); });
      open.result.close();
      resolve(JSON.stringify(out));
    };
  }));
  await page.waitForFunction(() => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const r = open.result.transaction('bookMatter').objectStore('bookMatter').getAll(); r.onsuccess = () => { open.result.close(); resolve(r.result.some((m) => m.sceneBreak === '⁂' && m.aboutAuthor === 'Writes at night.')); }; }; }));
  check('the sidebar offers the reader preview', await page.locator('.sidebar nav a', { hasText: 'Reader preview' }).isVisible());

  await page.goto(`${base30}/read`);
  const rd = page.locator('.reader');
  const stage = rd.getByRole('main', { name: 'Reader preview' });
  await stage.locator('.title-page h1').waitFor();
  await page.waitForTimeout(600);
  const stored30 = await all30(page);
  eq('the reader is a full screen of its own: no sidebar, no workspace bar, no editor, nothing that can be typed into', await page.evaluate(() => ({ sidebar: document.querySelectorAll('.sidebar, .studio-bar, .ms-bar, .dock, .tab-bar').length, editors: document.querySelectorAll('[contenteditable="true"], .ProseMirror, textarea, input[type="text"]').length, covers: (() => { const r = document.querySelector('.reader').getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; })() })), { sidebar: 0, editors: 0, covers: true });
  eq('standard novel: it opens on the title page', { title: await stage.locator('.title-page h1').innerText(), author: await stage.locator('.title-author').innerText(), format: await rd.getByRole('radiogroup', { name: 'Format' }).getByRole('radio', { checked: true }).innerText() }, { title: 'Lantern', author: 'R. G. ALMONTE', format: 'Standard novel' });
  const onPage = (n) => page.waitForFunction((want) => document.querySelector('.folio')?.textContent.trim().startsWith(`Page ${want} of`), n, { timeout: 5000 }).catch(() => {});
  const folio = async () => (await stage.getByRole('status', { name: 'Page' }).innerText()).trim();
  const where = async () => (await rd.getByRole('status', { name: 'Where you are' }).innerText()).replace(/\s+/g, ' ').trim();
  const toc = rd.getByRole('complementary', { name: 'Table of contents' });
  const jumpTo = async (name) => {
    await rd.getByRole('button', { name: '☰ Contents' }).click();
    await toc.locator('.reader-toc button').filter({ hasText: name }).first().click();
    await toc.waitFor({ state: 'hidden' });
  };
  await rd.getByRole('button', { name: '☰ Contents' }).click();
  eq('the contents list the book as a reader meets it: front matter, the volume, chapters, back matter', (await toc.locator('.reader-toc li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ \d+%$/, '').trim()), ['Title page', 'Copyright', 'Dedication', 'Epigraph', 'VOLUME 1 The Ash', 'Chapter 1', 'CHAPTER 2 The Bell', 'CHAPTER 3 After', 'About the author']);
  check('…with progress through the book at the top', (await toc.getByRole('status', { name: 'Reading progress' }).innerText()).replace(/\s+/g, ' ').startsWith('0% read 0 of 1,'));
  await toc.locator('.reader-toc button').filter({ hasText: 'Dedication' }).click();
  check('front matter is set as its own pages: the dedication…', (await stage.locator('.dedication').innerText()).trim() === 'For the patient.');
  await page.keyboard.press('ArrowRight');
  await stage.locator('.epigraph').waitFor();
  check('…the epigraph with its source, reached by turning the page', (await stage.locator('.epigraph').innerText()).replace(/\s+/g, ' ').trim() === 'All is ash. — An old song');
  await page.keyboard.press('ArrowRight');
  await stage.locator('.part-page').waitFor();
  eq('a volume is a divider page', (await stage.locator('.part-page').innerText()).replace(/\s+/g, ' ').trim(), 'VOLUME 1 The Ash');
  await page.keyboard.press('ArrowRight');
  await stage.locator('.chapter .opener').waitFor();
  await page.waitForFunction(() => Number(document.querySelector('.folio')?.textContent.match(/of (\d+)/)?.[1]) > 1);
  const pages30 = Number((await folio()).match(/of (\d+)/)[1]);
  check('a chapter opens on its own page, titled once, and runs to several pages', (await stage.locator('.opener').innerText()).trim() === 'Chapter 1' && (await folio()).startsWith('Page 1 of ') && pages30 >= 4, await folio());
  eq('the running head carries the author and the chapter', (await stage.locator('.running-head').innerText()).replace(/\s+/g, ' ').trim(), 'R. G. ALMONTE CHAPTER 1');
  check('a typed *** is set as the book’s scene break', (await stage.getByRole('separator', { name: 'Scene break' }).allInnerTexts()).join() === '⁂' && !(await stage.locator('.prose').innerText()).includes('***'));
  const visibleFirst = () => stage.locator('.prose p').evaluateAll((ps) => { const box = document.querySelector('.pager').getBoundingClientRect(); return ps.find((p) => { const r = p.getBoundingClientRect(); return r.left >= box.left - 1 && r.left < box.right - 1 && r.width > 0; })?.textContent.slice(0, 14) ?? null; });
  const firstOnPage1 = await visibleFirst();
  await shot('30-novel');
  await stage.getByRole('button', { name: 'Next page' }).click();
  await page.waitForFunction(() => document.querySelector('.folio')?.textContent.trim().startsWith('Page 2 of'));
  const firstOnPage2 = await visibleFirst();
  check('turning the page shows the next page of text', firstOnPage1 === '"Wait," she sa' && firstOnPage2 !== firstOnPage1 && /^Paragraph \d+/.test(firstOnPage2), `${firstOnPage1} / ${firstOnPage2}`);
  await page.keyboard.press('PageDown');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press(' ');
  await onPage(4);
  check('…by button, PageDown or the space bar', (await folio()).startsWith('Page 4 of '), await folio());
  await page.keyboard.press('ArrowLeft');
  await onPage(3);
  check('…and back with the left arrow', (await folio()).startsWith('Page 3 of '), await folio());
  const sheetBox = await stage.locator('.sheet').boundingBox();
  await page.mouse.click(sheetBox.x + sheetBox.width * 0.9, sheetBox.y + sheetBox.height * 0.5);
  await onPage(4);
  check('a click on the right of the page turns it', (await folio()).startsWith('Page 4 of '), await folio());
  // Pressed as fast as they can be: every press turns a page.
  for (let i = 4; i < pages30; i++) await page.keyboard.press('ArrowRight');
  await onPage(pages30);
  check('the last page of the chapter', (await folio()) === `Page ${pages30} of ${pages30}`, await folio());
  await page.keyboard.press('ArrowRight');
  await stage.locator('.opener', { hasText: 'The Bell' }).waitFor();
  eq('turning past it opens the next chapter, numbered above its title', (await stage.locator('.opener').innerText()).replace(/\s+/g, ' ').trim(), 'CHAPTER 2 The Bell');
  eq('its scenes run together with a break between; blank lines at their edges are not printed', await stage.locator('.prose > *').evaluateAll((els) => els.map((el) => `${el.className || 'p'}:${el.textContent}`)), ['first:The bell rang once.', 'scene-break:⁂', 'first:Morning came ', 'p:slowly', 'scene-break:⁂', 'first:Night fell.', 'scene-break:⁂', 'first:It stayed.']);
  check('formatting is the author’s: italic and bold as saved', (await stage.locator('.prose em').innerText()) === 'slowly' && (await stage.locator('.prose strong').innerText()) === 'It stayed.');
  await page.keyboard.press('ArrowLeft');
  await stage.locator('.opener', { hasText: 'Chapter 1' }).waitFor();
  await onPage(pages30);
  check('turning back from a chapter’s first page lands on the last page of the one before', (await folio()) === `Page ${pages30} of ${pages30}`, await folio());
  check('progress is tracked along the top', Number(await rd.getByRole('progressbar', { name: 'Progress through the book' }).getAttribute('aria-valuenow')) > 90 && /· 9\d%$/.test(await where()), await where());

  // Appearance.
  await rd.getByRole('button', { name: 'Appearance' }).click();
  const look30x = rd.getByRole('complementary', { name: 'Appearance' });
  const styleOf = (selector, props) => page.evaluate(([sel, names]) => { const cs = getComputedStyle(document.querySelector(sel)); return Object.fromEntries(names.map((n) => [n, cs[n]])); }, [selector, props]);
  await look30x.getByLabel('Font size').fill('24');
  await page.waitForFunction((n) => Number(document.querySelector('.folio')?.textContent.match(/of (\d+)/)?.[1]) > n, pages30);
  check('a larger font size re-flows the chapter onto more pages', (await styleOf('.sheet', ['fontSize'])).fontSize === '24px');
  await look30x.getByLabel('Typeface').selectOption('humanist');
  await look30x.getByLabel('Line height').fill('1.9');
  const wide30 = parseFloat((await styleOf('.sheet', ['width'])).width);
  await look30x.getByLabel('Reading width').fill('50');
  const set30 = await styleOf('.sheet', ['fontFamily', 'lineHeight', 'width']);
  check('typeface, line height and reading width apply to the page', set30.fontFamily.startsWith('Optima') && Math.abs(parseFloat(set30.lineHeight) - 45.6) < 0.5 && parseFloat(set30.width) < wide30 - 100, JSON.stringify([wide30, set30]));
  eq('paragraphs are indented like print, first one flush', [(await styleOf('.prose p:not(.first):not(.scene-break)', ['textIndent', 'textAlign'])), (await styleOf('.prose p.first', ['textIndent']))], [{ textIndent: '36px', textAlign: 'justify' }, { textIndent: '0px' }]);
  await look30x.getByLabel('Paragraph style').selectOption('spaced');
  await look30x.getByLabel('Paragraph spacing').fill('1');
  const spaced30 = await styleOf('.prose p:not(.first):not(.scene-break)', ['textIndent', 'marginTop']);
  check('…or spaced apart, with the spacing set', spaced30.textIndent === '0px' && parseFloat(spaced30.marginTop) > 30, JSON.stringify(spaced30));
  const schemes = look30x.getByRole('radiogroup', { name: 'Colour scheme' });
  const colours = async () => styleOf('.sheet', ['backgroundColor', 'color']);
  const seen = {};
  for (const name of ['Sepia', 'Dark / OLED', 'Clean white']) {
    await schemes.getByRole('radio', { name }).click();
    seen[name] = await colours();
  }
  eq('colour schemes: clean white, sepia and true-black dark', seen, { Sepia: { backgroundColor: 'rgb(244, 236, 216)', color: 'rgb(59, 47, 32)' }, 'Dark / OLED': { backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(214, 214, 214)' }, 'Clean white': { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(27, 27, 27)' } });
  await schemes.getByRole('radio', { name: 'Custom contrast' }).click();
  await look30x.getByLabel('Custom page colour').fill('#102030');
  await look30x.getByLabel('Custom text colour').fill('#f0e0c0');
  check('a custom pair of colours is applied, with its contrast measured', JSON.stringify(await colours()) === JSON.stringify({ backgroundColor: 'rgb(16, 32, 48)', color: 'rgb(240, 224, 192)' }) && /^Contrast 1[0-9](\.\d)?:1, comfortable for long reading\.$/.test((await look30x.getByRole('status', { name: 'Contrast' }).innerText()).trim()), await look30x.getByRole('status', { name: 'Contrast' }).innerText());
  await look30x.getByLabel('Custom text colour').fill('#203040');
  check('…and a pair too faint to read is called that', (await look30x.getByRole('status', { name: 'Contrast' }).innerText()).includes('too faint'));
  await shot('30-appearance');
  await schemes.getByRole('radio', { name: 'Sepia' }).click();
  await look30x.getByLabel('Paragraph style').selectOption('auto');
  await look30x.getByLabel('Font size').fill('18');
  await look30x.getByLabel('Typeface').selectOption('book');
  await look30x.getByLabel('Line height').fill('1.55');
  await look30x.getByLabel('Reading width').fill('66');
  await look30x.getByRole('radio', { name: 'Continuous scroll' }).click();
  await stage.locator('.reader-scroll').waitFor();
  eq('continuous scroll: the whole book in one column, no page numbers', { sections: await stage.locator('[data-section]').count(), folio: await stage.locator('.folio').count(), pager: await stage.locator('.pager').count() }, { sections: 9, folio: 0, pager: 0 });
  await stage.locator('.reader-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForFunction(() => document.querySelector('.reader-progress').getAttribute('aria-valuenow') === '100');
  check('…and scrolling to the end reads 100%', (await where()).endsWith('About the author · 100%'), await where());
  await look30x.getByRole('radio', { name: 'Page turn' }).click();
  await look30x.getByRole('button', { name: 'Close appearance' }).click();

  // Ebook.
  await rd.getByRole('radiogroup', { name: 'Format' }).getByRole('radio', { name: 'Ebook' }).click();
  await jumpTo('Cover');
  await stage.locator('.device .book-cover').waitFor();
  eq('ebook: a device, opening on the cover', { cover: (await stage.locator('.book-cover').innerText()).replace(/\s+/g, ' ').trim(), sheet: await stage.locator('.sheet').count() }, { cover: 'Lantern R. G. ALMONTE', sheet: 0 });
  await shot('30-ebook-cover');
  await jumpTo('Contents');
  const contents30 = stage.getByRole('navigation', { name: 'Contents page' });
  eq('…with a contents page', await contents30.getByRole('button').allInnerTexts(), ['Volume 1: The Ash', 'Chapter 1', 'Chapter 2: The Bell', 'Chapter 3: After', 'About the author']);
  await contents30.getByRole('button', { name: 'Chapter 2: The Bell' }).click();
  await stage.locator('.opener', { hasText: 'The Bell' }).waitFor();
  check('…whose entries jump to their chapters', (await where()).startsWith('Lantern · Chapter 2: The Bell'));
  await jumpTo('Chapter 1');
  await stage.locator('.opener', { hasText: 'Chapter 1' }).waitFor();
  const onReader = { pages: Number((await folio()).match(/of (\d+)/)[1]), width: (await stage.locator('.device').boundingBox()).width };
  await rd.getByRole('button', { name: 'Appearance' }).click();
  await look30x.getByRole('radiogroup', { name: 'Device to simulate' }).getByRole('radio', { name: 'Phone' }).click();
  await page.waitForFunction((n) => Number(document.querySelector('.folio')?.textContent.match(/of (\d+)/)?.[1]) > n, onReader.pages);
  const onPhone = { pages: Number((await folio()).match(/of (\d+)/)[1]), width: (await stage.locator('.device').boundingBox()).width };
  check('the text reflows to the device: a phone is narrower and takes more pages than an e-reader', onPhone.width < onReader.width && onPhone.pages > onReader.pages, JSON.stringify([onReader, onPhone]));
  await shot('30-ebook-phone');
  await look30x.getByRole('radiogroup', { name: 'Device to simulate' }).getByRole('radio', { name: 'E-reader' }).click();

  // Web serial.
  await rd.getByRole('radiogroup', { name: 'Format' }).getByRole('radio', { name: 'Web serial' }).click();
  await stage.locator('.serial-page').waitFor();
  check('web serial: reading is by scrolling, and the page-turn choice says so', (await look30x.getByRole('radio', { name: 'Page turn' }).isDisabled()) && (await look30x.innerText()).includes('A web serial is read by scrolling.'));
  await look30x.getByRole('button', { name: 'Close appearance' }).click();
  await stage.getByRole('navigation', { name: 'Chapter navigation, top' }).getByRole('button', { name: 'Next →' }).click();
  await stage.locator('.serial-head h1', { hasText: 'The Bell' }).waitFor();
  const serial = stage.locator('.serial-page');
  eq('a chapter is posted with its number and title, word count, and the author’s notes before and after it', { number: await serial.locator('.serial-number').innerText(), title: await serial.locator('.serial-head h1').innerText(), meta: await serial.locator('.serial-meta').innerText(), before: (await serial.getByRole('complementary', { name: 'Author’s note before the chapter' }).innerText()).replace(/\s+/g, ' '), after: (await serial.getByRole('complementary', { name: 'Author’s note after the chapter' }).innerText()).replace(/\s+/g, ' ') }, { number: 'CHAPTER 2', title: 'The Bell', meta: '11 words · 1 min read', before: 'AUTHOR’S NOTE Thank you for reading this far. This one is short.', after: 'AUTHOR’S NOTE Next chapter on Friday.' });
  eq('…in that order: header, note, chapter, note, navigation', await serial.locator(':scope > *').evaluateAll((els) => els.map((el) => el.className.split(' ')[0])), ['serial-site', 'serial-nav', 'serial-head', 'author-note', 'prose', 'author-note', 'serial-nav']);
  check('…as spaced paragraphs, not indented', (await styleOf('.serial .prose p:not(.first):not(.scene-break)', ['textIndent'])).textIndent === '0px');
  await shot('30-serial');
  const bottom = stage.getByRole('navigation', { name: 'Chapter navigation, bottom' });
  await bottom.getByRole('button', { name: 'Next →' }).click();
  await stage.locator('.serial-head h1', { hasText: 'After' }).waitFor();
  check('Next goes to the next chapter; at the last one there is no further Next', (await bottom.getByRole('button', { name: 'Next →' }).isDisabled()) && (await serial.locator('.nothing-yet').innerText()) === 'This chapter has no text yet.' && (await serial.locator('.author-note').count()) === 0);
  await bottom.getByRole('button', { name: '← Previous' }).click();
  await stage.locator('.serial-head h1', { hasText: 'The Bell' }).waitFor();
  await bottom.getByLabel('Jump to a chapter, bottom').selectOption({ label: 'Chapter 1' });
  await stage.locator('.serial-head h1', { hasText: 'Chapter 1' }).waitFor();
  check('Previous and the chapter list work, and the first chapter has no Previous', (await bottom.getByRole('button', { name: '← Previous' }).isDisabled()) && (await serial.locator('.serial-number').innerText()) === 'CHAPTER 1');
  await rd.getByRole('button', { name: '☰ Contents' }).click();
  eq('a serial’s contents are its chapters: no cover, title page or dividers', (await toc.locator('.reader-toc li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ \d+%$/, '').trim()), ['Chapter 1', 'CHAPTER 2 The Bell', 'CHAPTER 3 After']);
  await toc.getByRole('button', { name: 'Close contents' }).click();

  // READ-ONLY RENDERING RULE: everything a reader might do with the page.
  await stage.locator('.prose p').first().dblclick({ position: { x: 30, y: 12 } });
  const picked = await page.evaluate(() => getSelection().toString().trim());
  await page.keyboard.type('vandal');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+x');
  await page.keyboard.press('ControlOrMeta+v');
  await page.keyboard.press('ControlOrMeta+z');
  const from30 = await stage.locator('.prose p').nth(1).boundingBox();
  await page.mouse.move(from30.x + 10, from30.y + 8);
  await page.mouse.down();
  await page.mouse.move(from30.x + 200, from30.y + 60, { steps: 5 });
  await page.mouse.up();
  await stage.locator('.serial').evaluate((el) => el.scrollTo(0, 900));
  await stage.locator('.serial-head h1').click({ clickCount: 3 });
  await page.keyboard.type('New title');
  await page.waitForTimeout(700);
  check('words can be selected to see how they sit on the page', picked.length > 0, picked);
  check('READ-ONLY: selecting, typing, deleting, cutting, pasting, dragging, clicking and scrolling changed what is shown not at all', (await serial.locator('.serial-head h1').innerText()) === 'Chapter 1' && (await stage.locator('.prose p').first().innerText()) === '"Wait," she said.');
  check('READ-ONLY: and through all of it (three formats, every setting, every page turned) not one byte of the stored project changed', (await all30(page)) === stored30);
  check('…the reader’s settings and place are kept on this device instead', (await page.evaluate((id) => [JSON.parse(localStorage.getItem('novel-builder:reader')).format, JSON.parse(localStorage.getItem(`novel-builder:reader:at:${id}`)).sectionId], p30)).join() === `serial,${p30}-c1`);

  // Controls out of the way; a place remembered; in from the editor and back.
  await rd.getByRole('radiogroup', { name: 'Format' }).getByRole('radio', { name: 'Standard novel' }).click();
  await stage.locator('.sheet').waitFor();
  await rd.getByRole('button', { name: 'Hide the controls' }).click();
  check('the controls can be put away, leaving the page', (await rd.locator('.reader-bar-top').count()) === 0 && (await stage.locator('.sheet').isVisible()));
  await page.keyboard.press('Escape');
  await rd.locator('.reader-bar-top').waitFor();
  await jumpTo('The Bell');
  await stage.locator('.opener', { hasText: 'The Bell' }).waitFor();
  await page.reload();
  await stage.locator('.opener').waitFor();
  check('the reader comes back to where it was left', (await stage.locator('.opener').innerText()).includes('The Bell') && (await where()).startsWith('Lantern · Chapter 2: The Bell'));
  await rd.getByRole('link', { name: 'Exit the reader preview' }).click();
  await page.waitForURL(new RegExp(`/manuscript/${p30}-c2$`));
  await page.locator(text).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Twice, then.');
  await saved();
  await page.getByRole('button', { name: 'Reader preview' }).click();
  await page.waitForURL(/\/read\?at=/);
  await stage.locator('.opener', { hasText: 'The Bell' }).waitFor();
  check('Exit returns to the chapter in the editor, and Reader preview from the editor opens on that chapter with what was just written', (await stage.locator('.prose p').first().innerText()) === 'The bell rang once. Twice, then.');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.reload();
  await stage.locator('.opener').waitFor();
  const phone30 = await stage.locator('.sheet').boundingBox();
  check('mobile: the page fills the screen, fits it, and still turns', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && phone30.width > 370 && (await folio()).startsWith('Page 1 of '), JSON.stringify(phone30));
  await page.mouse.click(phone30.x + phone30.width * 0.9, phone30.y + phone30.height * 0.5);
  await page.waitForTimeout(200);
  check('…with a tap on the right edge', (await folio()).startsWith('Page 2 of ') || (await stage.locator('.opener', { hasText: 'After' }).count()) === 1, await folio());
  await shot('30-mobile');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.removeItem('novel-builder:reader'));

  // --- Tutorial button ---
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('novel-builder:tutorial'));
  await page.reload();
  const tutButton = page.getByRole('button', { name: 'Tutorial', exact: true });
  const tut = page.getByRole('dialog', { name: 'Tutorial' });
  await tutButton.waitFor();
  check('the Tutorial button is on the first screen of the app', await tutButton.isVisible());
  await tutButton.click();
  const lesson = async () => ({ title: await tut.locator('article h2').innerText(), steps: await tut.locator('article ol li').count(), example: (await tut.locator('.tutorial-example').innerText()).length > 30, at: (await tut.locator('.tutorial-head .small').innerText()).trim() });
  const total31 = Number((await lesson()).at.split(' of ')[1]);
  eq('it opens on the lesson for the screen in view, with steps and an example', await lesson(), { title: 'The Library', steps: 4, example: true, at: `1 of ${total31}` });
  check('there is a lesson for each feature', total31 >= 25, String(total31));
  await tut.getByRole('button', { name: 'Next →' }).click();
  eq('Next walks through the features in order', (await lesson()).title, 'Project overview');
  check('a lesson for a project page says to open a project first, when none is open', (await tut.locator('article').innerText()).includes('Open a project to try this.'));
  await tut.getByRole('button', { name: '← Back' }).click();
  check('…and Back returns', (await lesson()).title === 'The Library' && (await tut.getByRole('button', { name: '← Back' }).isDisabled()));
  await tut.getByRole('button', { name: 'All topics' }).click();
  const topics31 = tut.getByRole('navigation', { name: 'Tutorial topics' });
  eq('All topics lists them by what they are for', await topics31.locator('h3').allInnerTexts().then((names) => names.map((n) => n.toUpperCase())), ['GETTING STARTED', 'WRITING', 'WORLDBUILDING', 'PLANNING THE STORY', 'CHECKING YOUR WORK', 'WORKING WITH OTHERS', 'MAKING IT YOURS']);
  check('…and marks the one for this page', (await topics31.locator('li', { hasText: 'This page' }).innerText()).startsWith('The Library'));
  await shot('31-tutorial-topics');
  await topics31.getByRole('button', { name: 'Plot threads' }).click();
  check('any topic can be opened directly', (await lesson()).title === 'Plot threads' && (await tut.locator('.tutorial-example').innerText()).includes('The Missing Prince'));
  await page.keyboard.press('Escape');
  await tut.waitFor({ state: 'hidden' });
  check('Escape closes it, and the button is still there', await tutButton.isVisible());

  const p31 = await createProject('Tutored');
  const dump31 = () => page.evaluate(() => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = async () => { const out = {}; for (const name of [...open.result.objectStoreNames].sort()) out[name] = await new Promise((done) => { const r = open.result.transaction(name).objectStore(name).getAll(); r.onsuccess = () => done(r.result); }); open.result.close(); resolve(JSON.stringify(out)); }; }));
  await page.goto(`${BASE}/project/${p31}/codex`);
  await page.getByText('Build your world').waitFor();
  await page.waitForTimeout(500);
  const before31 = await dump31();
  await tutButton.click();
  check('inside a project it opens on the page being looked at', (await lesson()).title === 'The Codex' && (await tut.getByRole('link', { name: 'Take me there' }).count()) === 0);
  await shot('31-tutorial');
  await tut.getByRole('button', { name: 'All topics' }).click();
  await topics31.getByRole('button', { name: 'Plot threads' }).click();
  await tut.getByRole('button', { name: 'Next →' }).click();
  await tut.getByRole('button', { name: '← Back' }).click();
  check('the tutorial only explains: reading it, stepping through it and browsing its topics changed nothing in the project', (await dump31()) === before31);
  await tut.getByRole('link', { name: 'Take me there' }).click();
  await page.waitForURL(/\/plot$/);
  await page.locator('.plot-page').waitFor();
  check('“Take me there” goes to the feature, with the lesson still open beside it', (await tut.isVisible()) && (await lesson()).title === 'Plot threads' && (await page.locator('.plot-page h1').innerText()).toLowerCase().includes('plot'));
  await tut.getByRole('button', { name: 'Close the tutorial' }).click();
  await page.goto(`${BASE}/project/${p31}/manuscript`);
  await page.getByRole('button', { name: 'Create the first chapter' }).waitFor();
  const onWriting = await tutButton.isVisible();
  await page.goto(`${BASE}/project/${p31}/read`);
  await page.locator('.reader').waitFor();
  check('the button stays on every screen: the writing screen and the reader preview too', onWriting && (await tutButton.isVisible()));
  await tutButton.click();
  check('…and knows where it is', (await lesson()).title === 'Reader preview');

  // Switching the button off, and on again.
  const switch31 = tut.getByRole('switch', { name: 'Show the Tutorial button' });
  check('the panel has the switch for the button, on to begin with', await switch31.isChecked());
  await switch31.click({ force: true });
  check('switching it off says how to bring it back', !(await switch31.isChecked()) && (await tut.locator('.tutorial-foot').innerText()).includes('Bring it back with the Tutorial switch on the Library or in Project settings.'));
  await tut.getByRole('button', { name: 'Close the tutorial' }).click();
  await tut.waitFor({ state: 'hidden' });
  check('with the switch off the button is gone', (await tutButton.count()) === 0);
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  const librarySwitch = page.getByRole('switch', { name: 'Tutorial button' });
  check('…and stays gone after a reload, on every screen', (await tutButton.count()) === 0 && !(await librarySwitch.isChecked()));
  await page.goto(`${BASE}/project/${p31}/settings`);
  const settingsSwitch = page.getByRole('region', { name: 'Tutorial' }).getByRole('switch', { name: 'Show the Tutorial button' });
  await settingsSwitch.waitFor();
  check('Project settings has the same switch, showing off', !(await settingsSwitch.isChecked()) && (await tutButton.count()) === 0);
  await settingsSwitch.click({ force: true });
  await tutButton.waitFor();
  check('switching it on there brings the button back at once', await tutButton.isVisible());
  await page.goto(BASE);
  await librarySwitch.waitFor();
  check('…and the Library’s switch agrees', (await librarySwitch.isChecked()) && (await tutButton.isVisible()));
  await librarySwitch.click({ force: true });
  await tutButton.waitFor({ state: 'detached' });
  await librarySwitch.click({ force: true });
  await tutButton.waitFor();
  check('the Library’s switch turns it off and on as well', true);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${BASE}/project/${p31}`);
  await page.locator('.tab-bar').waitFor();
  const [btnBox, barBox] = [await tutButton.boundingBox(), await page.locator('.tab-bar').boundingBox()];
  check('phone: the button sits clear of the tab bar', btnBox.y + btnBox.height <= barBox.y && btnBox.x + btnBox.width <= 390, JSON.stringify([btnBox, barBox]));
  await tutButton.click();
  const panelBox = await tut.boundingBox();
  check('phone: the lesson fits the screen', panelBox.x >= 0 && panelBox.x + panelBox.width <= 390 && panelBox.y >= 0 && panelBox.y + panelBox.height <= 780 && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify(panelBox));
  await shot('31-tutorial-phone');
  await tut.getByRole('button', { name: 'Close the tutorial' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- Character Management ---
  await page.setViewportSize({ width: 1280, height: 800 });
  const p32 = await createProject('Vault');
  const base32 = `${BASE}/project/${p32}`;
  const rows32 = async (table) => (await page.evaluate((t) => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const r = open.result.transaction(t).objectStore(t).getAll(); r.onsuccess = () => { open.result.close(); resolve(r.result); }; }; }), table)).filter((row) => row.projectId === p32);
  const until32 = async (fn, what, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  await page.getByRole('link', { name: 'Start writing' }).click();
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  const ch3232x = page.url().split('/').pop();
  await page.locator(text).click();
  const prose32 = 'Kaelen drew his sword. Seraphina watched. The Oathbreaker did not turn. "Kaelen!"';
  await page.keyboard.type(prose32);
  await saved();
  await page.goto(`${base32}/codex`);
  await page.getByText('Build your world').waitFor();
  await newEntry('Faction / Species', 'Ash Guild');
  await newEntry('Item / Artifact', 'Emberfang');

  // The library, empty.
  await page.locator('.sidebar nav a', { hasText: /^Characters$/ }).click();
  await page.waitForURL(/\/characters$/);
  const lib = page.locator('.vault-library');
  await lib.getByRole('heading', { name: 'Characters', level: 1 }).waitFor();
  eq('Characters is in the sidebar and opens the library; with no characters it says so and offers the three ways on', { empty: await lib.locator('.vault-empty-state h2').innerText(), actions: await lib.locator('.vault-empty-state .actions > *').allInnerTexts(), invented: (await rows32('loreEntries')).filter((e) => e.category === 'character').length }, { empty: 'Your character library is empty.', actions: ['Create Character', 'Import a project or backup', 'Back to the Overview'], invented: 0 });
  const create32 = async (name, { epithet = '', role = '', summary = '' } = {}) => {
    await page.goto(`${base32}/characters`);
    await lib.getByRole('button', { name: /New Character|Create Character/ }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'New character' });
    await dialog.getByLabel('Character name').fill(name);
    if (epithet) await dialog.getByLabel('Title or epithet').fill(epithet);
    if (role) await dialog.getByLabel('Narrative role').fill(role);
    if (summary) await dialog.getByLabel('Summary').fill(summary);
    await dialog.getByRole('button', { name: 'Create character' }).click();
    await page.waitForURL(/\/characters\/[\w-]+$/);
    return page.url().split('/').pop();
  };
  const kael = await create32('Kaelen Draven', { epithet: 'The Oathbreaker', role: 'Protagonist', summary: 'A disgraced knight of the old guard.' });
  const prof = page.locator('.vault-profile');
  const head = prof.getByRole('group', { name: 'Character', exact: true });
  await head.getByRole('heading', { name: 'Kaelen Draven' }).waitFor();
  eq('creating a character needs only a name; it opens on their profile, with name, title, role and summary in the header', { name: await head.locator('h1').innerText(), epithet: await head.locator('.vault-epithet').innerText(), roles: await head.locator('.role-badge-vault').allInnerTexts(), summary: await head.locator('.vault-summary').innerText() }, { name: 'Kaelen Draven', epithet: 'The Oathbreaker', roles: ['PROTAGONIST'], summary: 'A disgraced knight of the old guard.' });
  eq('the profile has its eight tabs, in order', await prof.getByRole('navigation', { name: 'Profile sections' }).getByRole('link').allInnerTexts(), ['Overview', 'System', 'Progression', 'Relationships', 'Details', 'Secrets', 'Notes', 'History']);
  const entry32 = async (name) => (await rows32('loreEntries')).find((e) => e.name === name);
  check('ONE RECORD: the character is a codex entry of the Characters category, with the id in the address', (await entry32('Kaelen Draven')).id === kael && (await entry32('Kaelen Draven')).category === 'character' && (await rows32('loreEntries')).filter((e) => e.category === 'character').length === 1);
  await page.waitForFunction(() => /\d/.test(document.querySelector('.vault-stats div:nth-child(2) dd')?.textContent ?? ''));
  eq('the header says where they stand in the manuscript: no chapter links yet, and one mention by title', (await head.locator('.vault-stats').innerText()).replace(/\s+/g, ' ').trim(), 'LINKED IN 0 Chapters NAME MENTIONS 1');

  // Overview: sections, and fields of every kind.
  eq('the Overview starts with the four default sections, each empty and offering its usual fields', await prof.locator('.vault-sections > .vault-section').evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label')}:${el.querySelectorAll('.vault-field').length}:${el.querySelectorAll('.suggest').length > 0}`)), ['Core Identity:0:true', 'Personality & Psychology:0:true', 'Character Arc:0:true', 'Resources & Position:0:true']);
  const sec = (name) => prof.getByRole('region', { name, exact: true });
  const setField32x = async (section, name, fill) => {
    const editing = sec(section).getByRole('group', { name: `Editing ${name}` });
    if (!(await editing.count())) await sec(section).getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    await fill(editing);
    await editing.getByRole('button', { name: 'Done' }).click();
    await editing.waitFor({ state: 'detached' });
  };
  await sec('Core Identity').getByRole('button', { name: '+ Age', exact: true }).click();
  await setField32x('Core Identity', 'Age', (e) => e.getByLabel('Age', { exact: true }).fill('27'));
  await sec('Core Identity').getByRole('button', { name: 'Add a field to Core Identity' }).click();
  await sec('Core Identity').getByRole('button', { name: '+ Loyalty', exact: true }).click();
  await setField32x('Core Identity', 'Loyalty', (e) => e.getByLabel('Loyalty', { exact: true }).fill('8'));
  await sec('Core Identity').getByLabel('Name of a new field in Core Identity').fill('Bloodline');
  await sec('Core Identity').getByRole('button', { name: 'Add', exact: true }).click();
  await setField32x('Core Identity', 'Bloodline', (e) => e.getByLabel('Bloodline', { exact: true }).fill('House Draven'));
  await sec('Personality & Psychology').getByRole('button', { name: '+ Core Traits', exact: true }).click();
  await setField32x('Personality & Psychology', 'Core Traits', async (e) => {
    for (const trait of ['Brooding', 'Loyal', 'Guarded']) {
      await e.getByLabel('Add to Core Traits').fill(trait);
      await e.getByLabel('Add to Core Traits').press('Enter');
    }
  });
  check('a section never offers what the profile shows elsewhere: affiliations and possessions are links under Details, not fields here', !(await sec('Resources & Position').locator('.suggest').allInnerTexts()).some((t) => /Faction|Equipment|Possessions|Occupation/.test(t)));
  await sec('Resources & Position').getByRole('button', { name: 'Add a field to Resources & Position' }).click();
  await sec('Resources & Position').getByLabel('Name of a new field in Resources & Position').fill('Faction');
  await sec('Resources & Position').getByLabel('Type of the new field').selectOption('reference');
  await sec('Resources & Position').getByRole('button', { name: 'Add', exact: true }).click();
  await setField32x('Resources & Position', 'Faction', (e) => e.getByLabel('Faction', { exact: true }).selectOption({ label: 'Ash Guild' }));
  await until32(async () => (await entry32('Kaelen Draven')).fields.length === 5, 'the five fields to be saved');
  eq('fields are added from a section’s suggestions or by name, and shown as cards32x by their type: text, a number, traits as chips, a link', {
    identity: await sec('Core Identity').locator('.vault-field').evaluateAll((els) => els.map((el) => el.querySelector('.vault-field-open').innerText.replace(/\s+/g, ' ').trim())),
    number: await sec('Core Identity').locator('.vault-field.is-number').count(),
    traits: await sec('Personality & Psychology').locator('.trait').allInnerTexts(),
    faction: (await sec('Resources & Position').locator('.vault-field').innerText()).replace(/\s+/g, ' ').trim(),
  }, { identity: ['AGE 27', 'LOYALTY 8', 'BLOODLINE House Draven'], number: 1, traits: ['Brooding', 'Loyal', 'Guarded'], faction: 'FACTION Ash Guild Open Ash Guild →' });
  const guild32 = (await entry32('Ash Guild')).id;
  check('a link field opens the record it points to', (await sec('Resources & Position').getByRole('link', { name: 'Open Ash Guild →' }).getAttribute('href')) === `/project/${p32}/codex/${guild32}`);
  check('ONE RECORD: the fields are stored on the character’s codex entry, by type', JSON.stringify((await entry32('Kaelen Draven')).fields.map((f) => [f.key, f.value, f.type ?? 'text'])) === JSON.stringify([['Age', '27', 'text'], ['Loyalty', '8', 'number'], ['Bloodline', 'House Draven', 'text'], ['Core Traits', 'Brooding\nLoyal\nGuarded', 'tags'], ['Faction', guild32, 'reference']]), JSON.stringify((await entry32('Kaelen Draven')).fields));
  await shot('32-profile');

  // A field's own settings.
  await sec('Core Identity').getByRole('button', { name: 'Edit Age', exact: true }).click();
  const ageEdit = sec('Core Identity').getByRole('group', { name: /^Editing Age/ });
  await ageEdit.locator('summary', { hasText: 'Field settings' }).click();
  await ageEdit.getByLabel('Name of the field Age').fill('Age in years');
  await ageEdit.getByLabel('Name of the field Age').blur();
  const renamed = sec('Core Identity').getByRole('group', { name: 'Editing Age in years' });
  await renamed.getByLabel('Type of Age in years').selectOption('number');
  await renamed.getByRole('button', { name: 'Move later' }).click();
  await renamed.getByRole('button', { name: 'Done' }).click();
  await until32(async () => (await rows32('characterProfiles'))[0]?.sections[0].fieldIds.length === 3, 'the profile to be saved');
  eq('a field can be renamed, given another type and moved; its value is kept', await sec('Core Identity').locator('.vault-field').evaluateAll((els) => els.map((el) => `${el.querySelector('.vault-field-open').innerText.replace(/\s+/g, ' ').trim()}|${el.className.match(/is-(\w+)/)[1]}`)), ['LOYALTY 8|number', 'AGE IN YEARS 27|number', 'BLOODLINE House Draven|text']);
  await sec('Core Identity').getByRole('button', { name: 'Edit Bloodline', exact: true }).click();
  const bloodEdit = sec('Core Identity').getByRole('group', { name: 'Editing Bloodline' });
  await bloodEdit.locator('summary', { hasText: 'Field settings' }).click();
  await bloodEdit.getByLabel('Section of Bloodline').selectOption({ label: 'Character Arc' });
  await sec('Character Arc').getByRole('button', { name: 'Edit Bloodline', exact: true }).waitFor();
  check('…or moved to another section', (await sec('Core Identity').locator('.vault-field').count()) === 2 && (await sec('Character Arc').locator('.vault-field').count()) === 1);

  // Sections of the author's own.
  const sectionNames = () => prof.locator('.vault-sections > .vault-section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  const sectionMenu = async (name, item) => {
    await sec(name).locator('summary[aria-label^="Options for the section"]').click();
    await sec(name).locator('.menu-items').getByRole('button', { name: item, exact: true }).click();
  };
  await prof.getByRole('button', { name: '+ Add New Section' }).click();
  await prof.getByLabel('Name of the new section').fill('Magic');
  await prof.getByRole('button', { name: 'Add section' }).click();
  await sec('Magic').waitFor();
  await sectionMenu('Magic', 'Rename');
  await prof.getByLabel('New name for Magic').fill('Lineage & Magic');
  await prof.getByLabel('New name for Magic').press('Enter');
  await sec('Lineage & Magic').waitFor();
  await sectionMenu('Lineage & Magic', 'Move up');
  await sectionMenu('Lineage & Magic', 'Move up');
  await page.waitForFunction(() => [...document.querySelectorAll('.vault-sections > .vault-section')].map((el) => el.getAttribute('aria-label')).indexOf('Lineage & Magic') === 2);
  eq('a section can be added, renamed and moved', await sectionNames(), ['Core Identity', 'Personality & Psychology', 'Lineage & Magic', 'Character Arc', 'Resources & Position']);
  await sectionMenu('Personality & Psychology', 'Duplicate');
  await sec('Personality & Psychology (copy)').waitFor();
  check('…duplicated, with the same fields left empty', (await sec('Personality & Psychology (copy)').locator('.vault-field.is-empty').count()) === 1 && (await sec('Personality & Psychology').locator('.trait').count()) === 3);
  await sectionMenu('Lineage & Magic', 'Hide');
  await prof.locator('.vault-hidden summary').waitFor();
  const hiddenNames = await sectionNames();
  await prof.locator('.vault-hidden summary').click();
  await prof.getByRole('button', { name: 'Show the section Lineage & Magic' }).click();
  await sec('Lineage & Magic').waitFor();
  check('…hidden and shown again', !hiddenNames.includes('Lineage & Magic') && (await sectionNames()).includes('Lineage & Magic'));
  await sectionMenu('Personality & Psychology (copy)', 'Delete…');
  const delSection = page.getByRole('dialog').filter({ hasText: 'Delete the section' });
  check('deleting a section says its fields stay on the character unless told otherwise', (await delSection.innerText()).includes('they stay on the character'));
  await delSection.getByRole('checkbox').click();
  await delSection.getByRole('button', { name: 'Delete section' }).click();
  await sec('Personality & Psychology (copy)').waitFor({ state: 'detached' });
  await until32(async () => (await entry32('Kaelen Draven')).fields.length === 5, 'the copied field to be deleted');
  check('…and deletes them too when asked', (await entry32('Kaelen Draven')).fields.filter((f) => f.key === 'Core Traits').length === 1);

  // Who they are.
  await head.getByRole('button', { name: 'Edit profile' }).click();
  await head.getByLabel('Aliases').fill('Kaelen, Kael');
  await head.getByLabel('Aliases').blur();
  await head.getByLabel('Status', { exact: true }).fill('Alive');
  await head.getByLabel('Status', { exact: true }).blur();
  await head.getByRole('group', { name: 'Narrative roles' }).getByRole('button', { name: 'Antagonist' }).click();
  await head.getByLabel('Tags').fill('knight, oathless');
  await head.getByLabel('Tags').blur();
  await until32(async () => { const p = (await rows32('characterProfiles'))[0]; return p?.aliases.length === 2 && p.roles.length === 2 && p.status === 'Alive' && (await entry32('Kaelen Draven')).tags.length === 2; }, 'the identity to be saved');
  await head.getByRole('button', { name: 'Done' }).click();
  await page.waitForFunction(() => document.querySelector('.vault-stats div:nth-child(2) dd')?.textContent.trim() === '3');
  eq('Edit profile turns the header into fields: aliases, status, tags, and more than one role', { roles: await head.locator('.role-badge-vault').allInnerTexts(), status: await head.locator('.status-badge-vault').allInnerTexts(), ids: (await head.locator('.vault-ids').innerText()).replace(/\s+/g, ' ').trim(), mentions: (await head.locator('.vault-stats div').nth(1).innerText()).replace(/\s+/g, ' ') }, { roles: ['PROTAGONIST', 'ANTAGONIST'], status: ['ALIVE'], ids: 'ALSO KNOWN AS Kaelen, Kael TAGS knight, oathless', mentions: 'NAME MENTIONS 3' });

  // Portrait.
  const png32 = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#334'; g.fillRect(0, 0, 120, 160); g.fillStyle = '#c96'; g.fillRect(70, 10, 40, 40); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  check('with no portrait there is a placeholder, said aloud as such', (await head.getByRole('img', { name: 'Kaelen Draven has no portrait' }).count()) === 1);
  await head.locator('.vault-portrait-tools input[type=file]').setInputFiles({ name: 'kael.png', mimeType: 'image/png', buffer: png32 });
  await head.getByRole('img', { name: 'Portrait of Kaelen Draven' }).waitFor();
  check('a portrait can be uploaded and is stored with the character', String((await entry32('Kaelen Draven')).image).startsWith('data:image/jpeg'));
  await head.getByRole('button', { name: 'Adjust crop' }).click();
  const crop = page.getByRole('dialog').filter({ hasText: 'Adjust the portrait’s crop' });
  const pick = await crop.getByRole('button', { name: 'Choose the point of the portrait to keep in view' }).boundingBox();
  await page.mouse.click(pick.x + pick.width * 0.8, pick.y + pick.height * 0.2);
  await until32(async () => { const f = (await rows32('characterProfiles'))[0].focal; return Math.abs(f.x - 80) < 6 && Math.abs(f.y - 20) < 6; }, 'the focal point to be saved');
  await crop.getByRole('button', { name: 'Done' }).click();
  check('…its crop chosen by picking the point to keep in view', (await head.locator('.vault-portrait img').evaluate((img) => img.style.objectPosition)).startsWith('8'));
  await head.getByRole('button', { name: 'Remove', exact: true }).click();
  await head.getByRole('img', { name: 'Kaelen Draven has no portrait' }).waitFor();
  await head.getByRole('button', { name: 'Upload portrait' }).waitFor();
  check('…and removed', (await entry32('Kaelen Draven')).image === null);

  // From a chapter to the character, and back.
  await page.goto(`${base32}/manuscript/${ch3232x}`);
  await page.locator(text).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Link to a codex entry' }).click();
  await page.locator('.link-bar .link-results button', { hasText: 'Kaelen Draven' }).click();
  await page.locator(`${text} .ref-live`).waitFor();
  await saved();
  await page.locator(`${text} .ref-live`).click();
  await page.locator('.quick-entry').getByRole('link', { name: 'Open character profile' }).click();
  await page.waitForURL(new RegExp(`/characters/${kael}$`));
  await head.getByRole('heading', { name: 'Kaelen Draven' }).waitFor();
  eq('ENTRY POINT: a linked name in a chapter opens the same profile, and the way back to the chapter is offered', { same: page.url().endsWith(`/characters/${kael}`), back: await page.locator('.trail .trail-back').innerText(), stats: (await head.locator('.vault-stats div').first().innerText()).replace(/\s+/g, ' ') }, { same: true, back: '← Back to Chapter 1', stats: 'LINKED IN 1 Chapter' });
  check('the Overview lists the linked chapter, and says plainly that mentions are only words on the page', (await prof.getByRole('region', { name: 'In the manuscript' }).getByRole('list', { name: 'Linked chapters and scenes' }).innerText()).trim() === 'Chapter 1' && (await prof.getByRole('region', { name: 'In the manuscript' }).innerText()).includes('only links say where a character is actually present'));
  await page.locator('.trail .trail-back').click();
  await page.waitForURL(new RegExp(`/manuscript/${ch3232x}$`));
  await page.locator(`${text} .ref-live`).waitFor();
  check('…and going back returns to the chapter, its text unchanged', (await paragraphs()).join('|') === prose32);

  // The Codex no longer shows characters.
  await page.goto(`${base32}/codex/${kael}`);
  await page.waitForURL(new RegExp(`/characters/${kael}$`));
  await head.getByRole('heading', { name: 'Kaelen Draven' }).waitFor();
  check('ONE RECORD, ONE PLACE: the Codex has no page for a character; its old address opens the profile', page.url().endsWith(`/characters/${kael}`) && (await page.locator('.codex-entry').count()) === 0);

  // A cast, and the library's tools.
  const sera32x = await create32('Seraphina Valdris', { role: 'Antagonist', summary: 'First daughter of House Valdris.' });
  const tam = await create32('Old Tam', { role: 'Minor' });
  await page.goto(`${base32}/characters`);
  const cards32x = () => lib.getByRole('list', { name: 'Characters' }).locator('.vault-name').allInnerTexts();
  await lib.getByRole('list', { name: 'Characters' }).waitFor();
  eq('the library shows a card for each character', (await cards32x()).sort(), ['Kaelen Draven', 'Old Tam', 'Seraphina Valdris']);
  eq('a card carries the name, title, roles, summary, tags and linked-chapter count', (await lib.getByRole('link', { name: 'Kaelen Draven, The Oathbreaker' }).innerText()).replace(/\s+/g, ' ').trim(), 'K Kaelen Draven The Oathbreaker PROTAGONIST ANTAGONIST A disgraced knight of the old guard. knight · oathless 1 linked chapter');
  await shot('32-library');
  const search32 = async (q) => { await lib.getByLabel('Search characters').fill(q); await page.waitForTimeout(150); return lib.getByRole('list', { name: 'Characters' }).count().then((n) => (n ? cards32x() : [])); };
  eq('search finds a character by their title', await search32('The Oathbreaker'), ['Kaelen Draven']);
  eq('…by an alias', await search32('kael'), ['Kaelen Draven']);
  eq('…by a tag, a faction or a field', [await search32('oathless'), await search32('ash guild'), await search32('house draven')], [['Kaelen Draven'], ['Kaelen Draven'], ['Kaelen Draven']]);
  eq('…by part of a summary', await search32('valdris'), ['Seraphina Valdris']);
  check('a search with no match says so, and makes nothing up', (await search32('zzz')).length === 0 && (await lib.locator('.empty').innerText()).includes('does not create or suggest any') && (await rows32('loreEntries')).filter((e) => e.category === 'character').length === 3);
  await search32('');
  eq('role tabs are the roles in use', (await lib.getByRole('tablist', { name: 'Narrative role' }).getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['All 3', 'Protagonists', 'Antagonists', 'Minor']);
  await lib.getByRole('tab', { name: 'Antagonists' }).click();
  eq('a character with two roles is under both', (await cards32x()).sort(), ['Kaelen Draven', 'Seraphina Valdris']);
  await lib.getByRole('tab', { name: /^All/ }).click();
  await lib.getByLabel('Sort characters by').selectOption('appearances');
  eq('sorting by appearances puts the linked character first', (await cards32x())[0], 'Kaelen Draven');
  await lib.getByRole('button', { name: /^Filters/ }).click();
  await lib.getByLabel('Filter by faction').selectOption('Ash Guild');
  eq('filters narrow by faction, status, tag and first appearance', await cards32x(), ['Kaelen Draven']);
  await lib.getByRole('button', { name: 'Clear filters' }).click();
  await lib.getByLabel('Filter by status').selectOption('Alive');
  const byStatus = await cards32x();
  await lib.getByRole('button', { name: 'Clear filters' }).click();
  await lib.getByLabel('Filter by first appearance').selectOption({ label: 'Chapter 1' });
  eq('…', [byStatus, await cards32x()], [['Kaelen Draven'], ['Kaelen Draven']]);
  await lib.getByRole('button', { name: 'Clear filters' }).click();
  await lib.getByRole('radio', { name: 'List' }).click();
  const listRows = () => lib.getByRole('table', { name: 'Characters' }).locator('tbody th').evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim().replace(/^[A-Z](?=[A-Z])/, '')));
  await lib.getByLabel('Sort characters by').selectOption('custom');
  await page.waitForFunction(() => document.querySelectorAll('.vault-list tbody th')[1]?.textContent.includes('Seraphina'));
  eq('a compact list view, in the author’s own order', await listRows(), ['Kaelen Draven · The Oathbreaker', 'Seraphina Valdris', 'Old Tam']);
  await lib.getByRole('button', { name: 'Move Old Tam up' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.vault-list tbody th')[1]?.textContent.includes('Old Tam'));
  eq('…which can be rearranged', await listRows(), ['Kaelen Draven · The Oathbreaker', 'Old Tam', 'Seraphina Valdris']);
  await lib.getByRole('table', { name: 'Characters' }).getByRole('link', { name: /Seraphina Valdris/ }).click();
  await page.waitForURL(new RegExp(`/characters/${sera32x}$`));
  check('selecting a row opens that character', (await head.locator('h1').innerText()) === 'Seraphina Valdris');
  await page.goto(`${base32}/characters`);
  await lib.getByRole('radio', { name: 'Cards' }).click();
  await lib.getByLabel('Sort characters by').selectOption('name');

  // Archive and restore.
  await page.goto(`${base32}/characters/${tam}`);
  await prof.locator('summary[aria-label="More options for Old Tam"]').click();
  await prof.locator('.vault-crumbs .menu-items').getByRole('button', { name: 'Archive', exact: true }).click();
  await prof.getByText('This character is archived').waitFor();
  await page.goto(`${base32}/characters`);
  await lib.getByRole('list', { name: 'Characters' }).waitFor();
  const afterArchive = (await cards32x()).sort();
  await lib.getByRole('tab', { name: /^Archived/ }).click();
  eq('an archived character leaves the library but is kept, under Archived', [afterArchive, await cards32x()], [['Kaelen Draven', 'Seraphina Valdris'], ['Old Tam']]);
  await lib.getByRole('link', { name: 'Old Tam' }).click();
  await prof.getByRole('button', { name: 'Restore' }).click();
  await prof.getByText('This character is archived').waitFor({ state: 'detached' });
  check('…and can be restored', (await rows32('characterProfiles')).find((p) => p.entryId === tam).archived === false);

  // Relationships.
  await page.goto(`${base32}/characters/${kael}/relationships`);
  const relTab = prof.getByRole('region', { name: 'Relationships', exact: true });
  await relTab.getByLabel('Character to relate to').selectOption({ label: 'Seraphina Valdris' });
  await relTab.getByLabel('Kind of relationship').selectOption('rivals');
  await relTab.getByRole('button', { name: 'Add', exact: true }).click();
  const map32 = relTab.getByRole('group', { name: 'Relationship map of Kaelen Draven' });
  await map32.locator('.vault-edge').waitFor();
  eq('the Relationships tab opens by address, and maps the character with the people they are tied to', { url: page.url().includes(`/characters/${kael}/relationships`), nodes: await map32.locator('.vault-node .name').allTextContents(), edge: await map32.locator('.vault-edge text').allTextContents(), legend: (await relTab.locator('.vault-legend span').allInnerTexts()).slice(0, 6) }, { url: true, nodes: ['Kaelen Draven', 'Seraphina Valdris'], edge: ['Rivals'], legend: ['Family', 'Social', 'Mentorship', 'Romance', 'Hierarchy', 'Custom'] });
  check('each kind of relationship has its own line, not only its own colour', new Set(await relTab.locator('.vault-legend line').evaluateAll((els) => els.map((el) => el.getAttribute('stroke-dasharray') ?? 'solid'))).size === 6);
  const relList = relTab.getByRole('region', { name: 'Relationship list' });
  eq('the list under the map says the same', (await relList.locator('.vault-relations li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['S Seraphina Valdris Rival · Social · Neutral Details']);
  check('the relationship is the one record the Relationships page uses, and its details open here for editing', (await rows32('characterRelations')).length === 1 && (await relTab.getByRole('heading', { name: 'Kaelen Draven & Seraphina Valdris' }).count()) === 1);
  await shot('32-relationships');
  await relTab.getByRole('button', { name: 'Zoom in' }).click();
  const zoomed = await map32.getAttribute('data-zoom');
  await relTab.getByRole('button', { name: 'Reset view' }).click();
  check('the map zooms and resets', zoomed === '1.25' && (await map32.getAttribute('data-zoom')) === '1');
  await relTab.getByRole('group', { name: 'Kinds of relationship to show' }).getByRole('button', { name: 'Social' }).click();
  const filtered = { edges: await map32.locator('.vault-edge').count(), rows: await relList.locator('.vault-relations li').count() };
  await relTab.getByRole('group', { name: 'Kinds of relationship to show' }).getByRole('button', { name: 'Social' }).click();
  eq('…and filters by kind, map and list together', [filtered, { edges: await map32.locator('.vault-edge').count(), rows: await relList.locator('.vault-relations li').count() }], [{ edges: 0, rows: 0 }, { edges: 1, rows: 1 }]);
  await map32.getByRole('button', { name: /^Seraphina Valdris/ }).click();
  await page.waitForURL(new RegExp(`/characters/${sera32x}/relationships`));
  await head.getByRole('heading', { name: 'Seraphina Valdris' }).waitFor();
  await prof.getByRole('group', { name: 'Relationship map of Seraphina Valdris' }).locator('.vault-edge').waitFor();
  check('selecting a connected character opens their profile, the same record', (await head.locator('h1').innerText()) === 'Seraphina Valdris' && (await prof.getByRole('group', { name: 'Relationship map of Seraphina Valdris' }).locator('.vault-node .name').allTextContents()).join() === 'Seraphina Valdris,Kaelen Draven');

  // Details: affiliations and possessions are links to records.
  await page.goto(`${base32}/characters/${kael}/details`);
  const det = prof.getByRole('region', { name: 'Details', exact: true });
  await det.getByRole('region', { name: 'Appearance', exact: true }).waitFor();
  eq('the Details tab has the biography and appearance sections', await det.locator('.vault-sections > .vault-section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), ['Biography & History', 'Appearance']);
  const aff = det.getByRole('region', { name: 'Affiliations' });
  await aff.getByLabel('Entry to link to').selectOption({ label: 'Ash Guild' });
  await aff.getByLabel('Role or position there').fill('Captain');
  await aff.getByRole('button', { name: 'Link', exact: true }).click();
  await aff.getByRole('link', { name: 'Ash Guild' }).waitFor();
  await aff.getByLabel('Status of the tie to Ash Guild').selectOption('Former');
  await aff.getByLabel('Entry to link to').selectOption({ label: 'Emberfang' });
  await aff.getByRole('button', { name: 'Link', exact: true }).click();
  const gear = det.getByRole('region', { name: 'Equipment and possessions' });
  await gear.getByRole('link', { name: 'Emberfang' }).waitFor();
  await until32(async () => (await rows32('loreLinks')).length === 2 && Object.values((await rows32('characterProfiles')).find((p) => p.entryId === kael).linkStatus).includes('Former'), 'the links to be saved');
  check('an affiliation has a role and a status, and opens the faction’s own record', (await aff.getByLabel('Kaelen Draven’s role or position in Ash Guild').inputValue()) === 'Captain' && (await aff.getByRole('link', { name: 'Ash Guild' }).getAttribute('href')) === `/project/${p32}/codex/${guild32}`);
  check('a possession is a link to the item’s record, not a copy of it', (await gear.getByRole('link', { name: 'Emberfang' }).getAttribute('href')).includes('/codex/') && (await rows32('loreEntries')).filter((e) => e.name === 'Emberfang').length === 1);
  await page.goto(`${base32}/codex/${guild32}`);
  await page.locator('.related .related-name', { hasText: 'Kaelen Draven' }).waitFor();
  check('…and the link shows from the faction’s side too', true);

  // Secrets.
  await page.goto(`${base32}/characters/${kael}/secrets`);
  const secTab = prof.getByRole('region', { name: 'Secrets', exact: true });
  await secTab.getByLabel('Title of a new secret').fill('True heir');
  await secTab.getByRole('button', { name: 'Add secret' }).click();
  const secret32 = secTab.getByRole('listitem', { name: 'Secret: True heir' });
  await secret32.getByLabel('What is true').fill('Kaelen is the old king’s son.');
  await secret32.getByLabel('What is true').blur();
  await secret32.getByLabel('Does Kaelen Draven know?').selectOption('unaware');
  await secret32.getByLabel('Add to Characters who suspect').selectOption({ label: 'Seraphina Valdris' });
  await secret32.getByLabel('What the reader knows').selectOption('suspects');
  await secret32.getByLabel('…from this chapter on').selectOption({ label: 'Chapter 1' });
  await until32(async () => { const s = (await rows32('characterSecrets'))[0]; return s?.suspects.length === 1 && s.reader === 'suspects' && s.readerNodeId === ch3232x && s.self === 'unaware' && s.description.includes('king'); }, 'the secret to be saved');
  await secret32.getByLabel('Add to Characters who know').selectOption({ label: 'Seraphina Valdris' });
  await until32(async () => (await rows32('characterSecrets'))[0].knows.length === 1, 'who knows to be saved');
  const s32 = (await rows32('characterSecrets'))[0];
  eq('a secret keeps four things apart: what is true, whether the character knows, who else knows or suspects, and what the reader knows', { truth: s32.description, self: s32.self, knows: s32.knows, suspects: s32.suspects, reader: [s32.reader, s32.readerNodeId === ch3232x], status: s32.status }, { truth: 'Kaelen is the old king’s son.', self: 'unaware', knows: [sera32x], suspects: [], reader: ['suspects', true], status: 'Hidden' });
  check('the Secrets tab says it organises the story and is not a lock', (await secTab.innerText()).includes('it is not a lock'));

  // Notes.
  await page.goto(`${base32}/characters/${kael}/notes`);
  const noteTab = prof.getByRole('region', { name: 'Notes', exact: true });
  const fieldsBefore = JSON.stringify((await entry32('Kaelen Draven')).fields);
  await noteTab.getByLabel('New note').fill('Maybe make Kaelen the prince’s brother');
  await noteTab.getByRole('button', { name: 'Add note' }).click();
  const note32 = noteTab.getByRole('listitem', { name: /^Note: Maybe make Kaelen/ });
  await note32.waitFor();
  await note32.getByLabel('Note tags').fill('idea, family');
  await note32.getByLabel('Note tags').blur();
  await note32.getByRole('button', { name: 'Pin' }).click();
  await until32(async () => { const n = (await rows32('characterNotes'))[0]; return n?.pinned && n.tags.length === 2; }, 'the note to be saved');
  check('a note has a title, tags, dates and can be pinned', (await note32.innerText()).includes('Written ') && (await note32.getByRole('button', { name: 'Unpin' }).count()) === 1);
  check('NO AUTOMATIC CANON CHANGE: writing the note changed nothing about the character', JSON.stringify((await entry32('Kaelen Draven')).fields) === fieldsBefore && (await rows32('characterRelations')).length === 1);
  await note32.getByRole('button', { name: 'Copy into the profile…' }).click();
  await note32.getByLabel('Section to copy the note into').selectOption({ label: 'Character Arc' });
  await note32.getByLabel('Name of the field to make').fill('Family');
  await note32.getByRole('button', { name: 'Yes, add it to the profile' }).click();
  await note32.getByText('Copied into the profile as the field “Family”. The note is kept.').waitFor();
  check('…it becomes part of the record only when the author copies it there, and the note is kept', (await entry32('Kaelen Draven')).fields.some((f) => f.key === 'Family' && f.value === 'Maybe make Kaelen the prince’s brother') && (await rows32('characterNotes')).length === 1);

  // History.
  await page.goto(`${base32}/characters/${kael}/history`);
  const histTab = prof.getByRole('region', { name: 'History', exact: true });
  await histTab.getByLabel('A milestone in the story').fill('Broke his oath to the king.');
  await histTab.getByLabel('Chapter of the milestone').selectOption({ label: 'Chapter 1' });
  await histTab.getByRole('button', { name: 'Add milestone' }).click();
  const storyLines = histTab.getByRole('list', { name: 'Story events' });
  await storyLines.getByText('Broke his oath to the king.').waitFor();
  eq('History keeps story events (the author’s milestones, and what relationships, the timeline and progression already record)…', (await storyLines.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ✕', '').trim()), ['Before the story Relationship with Seraphina Valdris: Rivals (neutral) Relationship', 'Chapter 1 Broke his oath to the king. Milestone']);
  const recordLines = (await histTab.getByRole('list', { name: 'Record changes' }).locator('li span:last-child').allInnerTexts()).map((t) => t.trim());
  const wanted32 = ['Created the character “Kaelen Draven”.', 'Set Age to “27”.', 'Set Loyalty to “8”.', 'Set Faction to “Ash Guild”.', 'Set Aliases to “Kaelen, Kael”.', 'Changed Role from “Protagonist” to “Protagonist, Antagonist”.', 'Set Status to “Alive”.', 'Portrait added.', 'Portrait removed.', 'Section “Magic” added.', 'Added the field Family, copied from the note “Maybe make Kaelen the prince’s brother”.'];
  check('…apart from changes to the record, each in words', wanted32.every((line) => recordLines.includes(line)), `missing: ${wanted32.filter((l) => !recordLines.includes(l)).join(' / ')}\n      have: ${recordLines.join(' / ')}`);
  check('…and says it reconstructs nothing', (await histTab.innerText()).includes('nothing here is reconstructed'));

  // Other ways in.
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('.search-dialog').getByLabel('Search this project').fill('Seraphina');
  await page.locator('.search-dialog .search-entity', { hasText: 'Seraphina Valdris' }).first().click();
  await page.waitForURL(new RegExp(`/characters/${sera32x}`));
  await head.getByRole('heading', { name: 'Seraphina Valdris' }).waitFor();
  check('ENTRY POINT: a search result for a character opens their profile', (await head.locator('h1').innerText()) === 'Seraphina Valdris');
  await page.goto(`${base32}/relationships?rel=${(await rows32('characterRelations'))[0].id}`);
  await page.getByRole('heading', { name: 'Kaelen Draven & Seraphina Valdris' }).getByRole('link', { name: 'Kaelen Draven' }).click();
  await page.waitForURL(new RegExp(`/characters/${kael}$`));
  check('ENTRY POINT: so does a character on the Relationships page, with no second record made on the way', (await rows32('loreEntries')).filter((e) => e.category === 'character').length === 3 && (await rows32('characterProfiles')).length === 3);

  // The two themes.
  const vaultColours = () => page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.vault')); return [cs.backgroundColor, cs.color]; });
  await page.goto(`${base32}/settings`);
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.goto(`${base32}/characters/${kael}`);
  await head.waitFor();
  const dark32 = await vaultColours();
  await shot('32-profile-dark');
  await page.goto(`${base32}/settings`);
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.goto(`${base32}/characters/${kael}`);
  await head.waitFor();
  eq('one design in two themes, chosen in Settings: midnight blue with warm text, and warm parchment with dark text', [dark32, await vaultColours()], [['rgb(12, 17, 28)', 'rgb(236, 227, 207)'], ['rgb(241, 226, 196)', 'rgb(53, 39, 26)']]);
  await page.goto(`${base32}/settings`);
  await page.getByLabel('Theme', { exact: true }).selectOption('auto');
  check('…or left to follow the device', (await page.evaluate(() => document.documentElement.dataset.theme)) === undefined);
  const everything32 = [];
  for (const path of ['characters', `characters/${kael}`, `characters/${kael}/relationships`, `characters/${kael}/details`, `characters/${kael}/secrets`, `characters/${kael}/notes`, `characters/${kael}/history`]) {
    await page.goto(`${base32}/${path}`);
    await page.locator('.vault').waitFor();
    everything32.push(await page.locator('.vault').innerText());
  }
  check('NO AI: nothing in the library or the profile generates, suggests text or writes for the author', !/\bAI\b|generat|suggest a|write for/i.test(everything32.join('\n').replace(/does not create or suggest any/g, '')));

  // After a reload everything is still there; then on a phone.
  await page.goto(`${base32}/characters/${kael}`);
  await page.reload();
  await head.getByRole('heading', { name: 'Kaelen Draven' }).waitFor();
  check('the character and their profile persist', (await sec('Core Identity').locator('.vault-field').count()) === 2 && (await head.locator('.role-badge-vault').count()) === 2);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${base32}/characters`);
  await lib.getByRole('list', { name: 'Characters' }).waitFor();
  const fitsLib = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.goto(`${base32}/characters/${kael}`);
  await head.waitFor();
  const order32 = await head.evaluate((el) => [...el.children].map((c) => c.className.split(' ')[0]));
  check('mobile: the library and the profile fit the screen, in one column: portrait, then name and summary, then the counts', fitsLib && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && order32.join() === 'vault-portrait-col,vault-identity,vault-stats' && (await sec('Core Identity').locator('.vault-field').first().boundingBox()).width > 300, order32.join());
  await shot('32-profile-phone');
  await page.goto(`${base32}/characters/${kael}/relationships`);
  await prof.getByRole('group', { name: 'Relationship map of Kaelen Draven' }).waitFor();
  check('mobile: the relationship map fits, with the list beneath it', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) && (await prof.getByRole('region', { name: 'Relationship list' }).locator('.vault-relations li').count()) === 1);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Deleting.
  await page.goto(`${base32}/characters/${kael}`);
  await prof.locator('summary[aria-label="More options for Kaelen Draven"]').click();
  await prof.locator('.vault-crumbs .menu-items').getByRole('button', { name: 'Delete…' }).click();
  const del32 = page.getByRole('dialog').filter({ hasText: 'Delete Kaelen Draven' });
  await del32.getByRole('button', { name: 'Archive Kaelen Draven' }).waitFor();
  eq('deleting says what refers to the character, and offers to archive instead', { refs: await del32.getByRole('list', { name: 'What refers to this character' }).locator('li').allInnerTexts(), archive: await del32.getByRole('button', { name: 'Archive Kaelen Draven' }).count() }, { refs: ['1 chapter or scene links to them', '1 relationship', '2 links to factions, items and other entries', '1 secret of their own', '1 note'], archive: 1 });
  await del32.getByRole('textbox').fill('Kaelen Draven');
  await del32.getByRole('button', { name: 'Delete forever' }).click();
  await page.waitForURL(/\/characters$/);
  await lib.getByRole('list', { name: 'Characters' }).waitFor();
  eq('after deleting: the character and what was theirs are gone; the manuscript’s words, the faction, the item and the other characters are untouched', { cast: (await cards32x()).sort(), relations: (await rows32('characterRelations')).length, secrets: (await rows32('characterSecrets')).length, notes: (await rows32('characterNotes')).length, others: (await rows32('loreEntries')).map((e) => e.name).sort(), words: JSON.stringify((await rows32('chapterContents'))[0].doc).includes('Kaelen') && (await rows32('chapterContents'))[0].doc.content.map((b) => (b.content ?? []).map((n) => n.text).join('')).join('|') === prose32 }, { cast: ['Old Tam', 'Seraphina Valdris'], relations: 0, secrets: 0, notes: 0, others: ['Ash Guild', 'Emberfang', 'Old Tam', 'Seraphina Valdris'], words: true });

  // --- Phase 33: levelling (experience, levels, points), and where a character's numbers live ---
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Levelled');
  await page.getByLabel('Fictional system').selectOption({ label: 'LitRPG / Game System' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  const p33 = page.url().split('/').pop();
  const base33 = `${BASE}/project/${p33}`;
  const rows33 = (table) => page.evaluate(([t, projectId]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const request = open.result.transaction(t).objectStore(t).getAll();
      request.onsuccess = () => { open.result.close(); resolve(request.result.filter((row) => row.projectId === projectId)); };
    };
  }), [table, p33]);
  const until33 = async (test, what) => {
    for (let i = 0; i < 80; i++) { if (await test()) return; await page.waitForTimeout(100); }
    throw new Error(`Timed out waiting for ${what}`);
  };
  await page.goto(`${base33}/manuscript`);
  await page.getByRole('button', { name: 'Create the first chapter' }).click();
  await page.waitForURL(/manuscript\/[\w-]+$/);
  await page.goto(`${base33}/characters`);
  const rook = await newCharacter('Rook', { stay: true });
  const prof33 = page.locator('.vault-profile');
  const prog33 = prof33.getByRole('region', { name: 'Character progression' });
  await prog33.waitFor();
  check('a profile offers the project’s system before the character is on it', (await prog33.innerText()).includes('Rook is not on a system yet') && (await prog33.getByLabel('Add to a system').locator('option').allInnerTexts()).includes('The System'));
  await prog33.getByLabel('Add to a system').selectOption({ label: 'The System' });
  await page.waitForURL(/\/characters\/[\w-]+\/system\?system=.*sheet=/);
  const sp33 = page.locator('.systems-page');
  const own33 = sp33.getByRole('group', { name: "Rook's own values" });
  const card33 = sp33.locator('.sheet-card');
  await card33.locator('.sheet-stats tr').first().waitFor();
  const tracks33 = async () => (await card33.locator('.sheet-tracks').innerText()).replace(/\s+/g, ' ').trim();
  const stats33 = () => card33.locator('.sheet-stats tr').evaluateAll((rows) => Object.fromEntries(rows.map((row) => [row.querySelector('th').textContent, row.querySelector('td').textContent])));
  eq('with nothing logged, the level is the number on the sheet', await tracks33(), 'Level 1 of 100 · Next level: 100 XP');
  const xp33 = own33.getByRole('group', { name: "Rook's experience" });
  eq('experience is logged against the sources the blueprint names', await xp33.locator('datalist option').evaluateAll((els) => els.map((e) => e.value)), ['Combat', 'Quest', 'Discovery', 'Training']);
  const log33 = async (amount, source, where, note = '') => {
    await xp33.getByLabel('XP gained').fill(String(amount));
    await xp33.getByLabel('Where it came from').fill(source);
    await xp33.getByLabel('Where in the story').selectOption({ label: where });
    await xp33.getByLabel('Note on this experience').fill(note);
    await xp33.getByRole('button', { name: 'Log', exact: true }).click();
    await xp33.getByRole('list', { name: "Rook's experience log" }).locator('li', { hasText: source }).waitFor();
  };
  const xpLog33 = () => xp33.getByRole('list', { name: "Rook's experience log" }).locator('li').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()));
  await log33(300, 'Quest', 'Chapter 1', 'The cellar rats');
  await log33(100, 'Training', 'Before the story');
  await until33(async () => (await tracks33()).startsWith('Level 3 of 100'), 'the level to be worked out');
  eq('LEVELS: 400 XP on the curve (100 to pass level 1, 283 to pass level 2) makes level 3, with the rest counted towards the next', await tracks33(), 'Level 3 of 100 · 17.16 of 519.62 XP to the next Points 6 to place · 0 placed of 6 earned');
  eq('the log reads in story order, whatever order it was entered in, and shows the level each gain reached', await xpLog33(), ['+100 XP Training · Before the story Level 2 ✕', '+300 XP Quest · The cellar rats · Chapter 1 Level 3 ✕']);
  check('a formula that reads the level sees the level reached', (await stats33())['Skill Slots'] === '3 slots');

  // Points: each level brings three; placing them is by hand, and adds to the attribute.
  const pts33 = own33.getByRole('group', { name: "Rook's points" });
  const place33 = async (name, times, verb = 'Place a point on') => {
    for (let i = 0; i < times; i++) {
      const before = await pts33.getByLabel(`Points placed on ${name}`).innerText();
      await pts33.getByRole('button', { name: `${verb} ${name}`, exact: true }).click();
      await until33(async () => (await pts33.getByLabel(`Points placed on ${name}`).innerText()) !== before, `a point on ${name}`);
    }
  };
  await place33('Strength', 4);
  await place33('Vitality', 1);
  const placed33 = await stats33();
  eq('POINTS: placed points add to the attribute, and the formulas built on it follow', { legend: await pts33.locator('legend').innerText(), strength: placed33.Strength, vitality: placed33.Vitality, damage: placed33.Damage, health: placed33['Max Health'] }, { legend: 'Points: 1 to place', strength: '14 · 4 placed', vitality: '11 · 1 placed', damage: '21', health: '210 HP' });
  await place33('Agility', 3);
  check('placing more than the levels gave is shown, not refused', (await pts33.locator('legend').innerText()) === 'Points: 2 more placed than earned' && (await stats33()).Agility === '13 · 3 placed' && (await tracks33()).includes('Points 2 over'));
  await place33('Agility', 3, 'Take a point from');
  await shot('33-levelling');

  // Skills: what the level and attributes open up is pointed out, never granted.
  await own33.getByLabel("Rook's Classes", { exact: true }).selectOption({ label: 'Mage' });
  await card33.locator('.sheet-available').waitFor();
  check('SKILLS: a skill whose requirement is now met is pointed out as within reach, and is not given', (await card33.locator('.sheet-available').innerText()) === 'Now within reach: Fireball' && !(await rows33('systemSheets'))[0].itemIds.some((id) => id.includes('fireball')) && (await rows33('systemSheets'))[0].itemIds.length === 1);

  // A loss lowers the level; what was placed stays, and the sheet says it no longer adds up.
  await log33(-350, 'Curse', 'Chapter 1');
  await until33(async () => (await tracks33()).startsWith('Level 1 of 100'), 'the level to fall');
  check('a loss lowers the level, and takes nothing back: the points placed are kept and flagged', (await tracks33()).includes('50 of 100 XP to the next') && (await pts33.locator('legend').innerText()) === 'Points: 5 more placed than earned' && (await stats33()).Strength === '14 · 4 placed');
  await xp33.getByRole('list', { name: "Rook's experience log" }).locator('li', { hasText: 'Curse' }).getByRole('button').click();
  await until33(async () => (await tracks33()).startsWith('Level 3 of 100'), 'the level to return');

  // What is stored: the log and the placements. No level, and nothing on the character's record.
  const sheet33 = (await rows33('systemSheets'))[0];
  const rook33 = (await rows33('loreEntries')).find((e) => e.id === rook);
  eq('STORED ONCE: the sheet keeps the experience log and the points placed; the level is not stored anywhere, and nothing is copied onto the character', { xp: sheet33.xp.map((e) => [e.amount, e.source, e.nodeId === null]), spent: Object.values(sheet33.spent).sort(), level: Object.keys(sheet33.progress).length, fields: rook33.fields.length }, { xp: [[300, 'Quest', false], [100, 'Training', true]], spent: [1, 4], level: 0, fields: 0 });

  // The blueprint decides what a level brings.
  await sp33.getByRole('tab', { name: /^Levels/ }).click();
  const points33 = sp33.getByLabel('Points per level of Level', { exact: true });
  check('the blueprint says how many points a level brings and what experience comes from', (await points33.inputValue()) === '3' && (await sp33.getByLabel('Sources of XP for Level', { exact: true }).inputValue()) === 'Combat, Quest, Discovery, Training');
  await points33.fill('5');
  await points33.blur();
  await until33(async () => (await rows33('systems'))[0].tracks[0].points === 5, 'the blueprint to be saved');

  // The profile shows a summary, read from the sheet.
  await page.goto(`${base33}/characters/${rook}`);
  await prog33.locator('.vault-progress').waitFor();
  const summary33 = (await prog33.locator('.vault-progress').innerText()).replace(/\s+/g, ' ').trim();
  check('PROFILE: the character’s profile shows system, level with progress, points to place and what they hold, and follows the blueprint', /SYSTEM The System LEVEL 3 of 100 · 17\.16 of 519\.62 XP to the next POINTS 5 unspent CLASSES 1/i.test(summary33), summary33);
  await shot('33-profile');
  check('…with a link to the sheet rather than a second copy of it', (await prog33.getByRole('link', { name: 'Open Rook’s sheet' }).count()) === 1 && (await prog33.getByLabel('Add to a system').count()) === 0);
  await page.goto(`${base33}/characters`);
  await page.locator('.vault-library').getByRole('button', { name: /New Character/ }).first().click();
  const new33 = page.getByRole('dialog').filter({ hasText: 'New character' });
  await new33.locator('select').selectOption({ label: 'Progression Fantasy Character' });
  check('the progression layout says where level, class and attributes are kept, instead of offering fields for them', (await new33.innerText()).includes('Level, class, attributes and skills live on their system sheet.'));
  await new33.getByRole('button', { name: 'Cancel' }).click();
  // Fields every character shares are shaped from the Character Library, not the Codex.
  await page.locator('.vault-library').getByRole('button', { name: 'Shared fields…' }).click();
  const shared33 = page.locator('dialog[open]');
  await shared33.getByRole('button', { name: '+ Add field' }).click();
  await shared33.getByLabel('Field 1 name').fill('Sanity');
  await shared33.getByLabel('Field 1 name').blur();
  await shared33.getByLabel('Sanity type').selectOption('number');
  check('the shared-fields dialog is about characters only: no other category, no category settings', (await shared33.locator('h2').first().innerText()) === 'Fields every character shares' && !(await shared33.locator('.schema-nav').isVisible()) && !(await shared33.getByLabel('Category name', { exact: true }).isVisible()));
  await shared33.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${base33}/characters/${rook}/details`);
  const loose33 = prof33.getByRole('region', { name: 'Fields without a section' });
  await loose33.getByRole('button', { name: '+ Sanity' }).click();
  await loose33.getByRole('button', { name: 'Edit Sanity', exact: true }).click();
  const sanity33 = loose33.getByRole('group', { name: 'Editing Sanity' });
  await sanity33.getByLabel('Sanity', { exact: true }).fill('7');
  await sanity33.getByRole('button', { name: 'Done' }).click();
  await sanity33.waitFor({ state: 'detached' });
  await until33(async () => (await rows33('loreEntries')).find((e) => e.id === rook).fields[0]?.value === '7', 'the shared field to be saved');
  check('a shared field is offered on each profile and filled in there as a number', (await loose33.locator('.vault-field.is-number').count()) === 1 && (await rows33('loreEntries')).find((e) => e.id === rook).fields[0].defId !== undefined);

  // A note written on the record before characters had notes of their own is kept, and can be made one of them.
  await page.evaluate(([id]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const store = open.result.transaction('loreEntries', 'readwrite').objectStore('loreEntries');
      const get = store.get(id);
      get.onsuccess = () => { store.put({ ...get.result, notes: 'Dies in book three?' }).onsuccess = () => { open.result.close(); resolve(); }; };
    };
  }), [rook]);
  await page.goto(`${base33}/characters/${rook}/notes`);
  const earlier33 = prof33.getByRole('group', { name: 'Earlier note' });
  await earlier33.getByText('Dies in book three?').waitFor();
  await earlier33.getByRole('button', { name: 'Keep as a note' }).click();
  await earlier33.waitFor({ state: 'detached' });
  const kept33 = (await rows33('characterNotes')).filter((n) => n.entryId === rook);
  check('an earlier note on the record becomes one of the character’s notes, and is kept in one place only', kept33.length === 1 && kept33[0].content === 'Dies in book three?' && (await rows33('loreEntries')).find((e) => e.id === rook).notes === '', JSON.stringify(kept33));
  await page.goto(base33);
  await page.locator('.tiles').waitFor();
  const tiles33 = (await page.locator('.tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim().toLowerCase());
  check('the Overview counts the cast and the Codex separately', tiles33.includes('1 characters') && tiles33.includes('0 codex entries'), tiles33.join(' | '));

  // --- Visualize: every view of the novel in one place (visualization Prompt 13) ---
  await page.setViewportSize({ width: 1280, height: 800 });
  const pV = await createProject('Visible World');
  const baseV = `${BASE}/project/${pV}`;
  await page.locator('.sidebar nav a', { hasText: /^Visualize$/ }).click();
  await page.waitForURL(/\/visualize$/);
  const viewTabs = page.getByRole('navigation', { name: 'Views' }).getByRole('link');
  await viewTabs.first().waitFor();
  eq('Visualize is in the navigation, with its seventeen views', await viewTabs.allInnerTexts(), ['Timeline', 'Story vs reading order', 'Relationship map', 'Plot board', 'Structure and pacing', 'Knowledge graph', 'Places', 'Character progression', 'Character history', 'Character appearances', 'Secrets and knowledge', 'Records by kind', 'Ability paths', 'Journeys', 'Factions', 'Ownership', 'Charts']);
  check('it opens on the timeline, marked as the current view', (await page.getByRole('heading', { level: 2 }).first().innerText()) === 'Timeline' && (await viewTabs.first().getAttribute('aria-current')) === 'page');
  const emptiesV = [];
  for (const label of ['Timeline', 'Story vs reading order', 'Relationship map', 'Plot board', 'Structure and pacing', 'Knowledge graph', 'Places', 'Character progression', 'Character history', 'Character appearances', 'Secrets and knowledge', 'Records by kind', 'Ability paths', 'Journeys', 'Factions', 'Ownership', 'Charts']) {
    await viewTabs.filter({ hasText: label }).click();
    await page.getByRole('heading', { name: label, level: 2 }).waitFor();
    emptiesV.push(await page.locator('.viz-state.empty').first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  }
  check('a new novel has a clear empty state in every view', emptiesV.every(Boolean), JSON.stringify(emptiesV));
  await page.goBack();
  await page.getByRole('heading', { name: 'Ownership', level: 2 }).waitFor();
  check('Back returns to the view before', new URL(page.url()).pathname.endsWith('/visualize/ownership'));
  await page.goto(`${baseV}/visualize/no-such-view`);
  check('an address naming no view shows the first one', (await page.getByRole('heading', { level: 2 }).first().innerText()) === 'Timeline');
  await viewTabs.filter({ hasText: 'Places' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/visualize\/places$/);
  check('the views are reached with the keyboard', true);

  // Records made elsewhere show here, read from the novel itself: nothing is copied.
  const now = Date.now();
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'timelineEvents'], 'readwrite');
      tx.objectStore('loreEntries').put({ id: `${projectId}-keep`, projectId, category: 'location', name: 'Ashen Keep', summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      tx.objectStore('loreEntries').put({ id: `${projectId}-mira`, projectId, category: 'character', name: 'Mira', summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      tx.objectStore('timelineEvents').put({ id: `${projectId}-feast`, projectId, name: 'The feast', description: '', when: { precision: 'exact', year: 12, month: null, day: null, hour: null, minute: null }, duration: null, importance: 'minor', locationId: null, characters: [{ id: `${projectId}-mira`, age: null }], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at });
      tx.objectStore('timelineEvents').put({ id: `${projectId}-siege`, projectId, name: 'The long siege', description: '', when: { precision: 'exact', year: 10, month: null, day: null, hour: null, minute: null }, duration: null, importance: 'major', locationId: `${projectId}-keep`, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, now]);
  // Read as a list here; the view tabs carry the choice along.
  await page.goto(`${baseV}/visualize/timeline?as=list`);
  const listedV = page.getByRole('list', { name: 'Events in story order' });
  await listedV.waitFor();
  check('an event appears in the timeline view, with its date and where it is told', (await listedV.innerText()).replace(/\s+/g, ' ').includes('The long siege Year 10 Not told in any chapter yet'));
  check('only this novel’s events: none from the other novels', !(await listedV.innerText()).includes('The Siege'));
  await viewTabs.filter({ hasText: 'Places' }).click();
  check('a place appears with what happened there', (await page.getByRole('list', { name: 'Places' }).innerText()).replace(/\s+/g, ' ').includes('Ashen Keep 1 event here'));
  check('each view links to the page where its records are edited', (await page.locator('.visualize section').getByRole('link', { name: 'Codex', exact: true }).getAttribute('href')) === `/project/${pV}/codex`);

  // Selecting a record shows its details, in any view, and other views mark it (visualization Prompt 15).
  await viewTabs.filter({ hasText: 'Timeline' }).click();
  await page.getByRole('heading', { name: 'Timeline', level: 2 }).waitFor();
  await page.getByRole('button', { name: 'The long siege', exact: true }).click();
  const detailV = (name) => page.getByRole('complementary', { name });
  await detailV('The long siege').waitFor();
  check('selecting an event shows where it happened, and its date', (await detailV('The long siege').getByRole('region', { name: 'Takes place at' }).innerText()).includes('Ashen Keep') && (await detailV('The long siege').innerText()).includes('Year 10'));
  await detailV('The long siege').getByRole('button', { name: 'Ashen Keep' }).click();
  await detailV('Ashen Keep').waitFor();
  check('selecting a connected record moves the details to it', (await detailV('Ashen Keep').getByRole('region', { name: 'Events here' }).innerText()).includes('The long siege'));
  await page.goBack();
  await detailV('The long siege').waitFor();
  check('Back returns to the record selected before', new URL(page.url()).searchParams.get('select') === `event:${pV}-siege`);
  await viewTabs.filter({ hasText: 'Places' }).click();
  await page.getByRole('heading', { name: 'Places', level: 2 }).waitFor();
  check('another view keeps the selection and marks what is connected to it', (await page.getByRole('list', { name: 'Places' }).locator('li', { hasText: 'Ashen Keep' }).innerText()).includes('Connected to the selection') && (await detailV('The long siege').isVisible()));
  await detailV('The long siege').getByRole('link', { name: 'Open on the Timeline' }).click();
  await page.waitForURL(/\/timeline\?event=/);
  check('the details link to the record where it is kept', new URL(page.url()).searchParams.get('event') === `${pV}-siege`);
  await page.goBack();
  await detailV('The long siege').waitFor();
  await detailV('The long siege').getByRole('button', { name: 'Close The long siege' }).click();
  await detailV('The long siege').waitFor({ state: 'detached' });
  check('closing the details clears the selection', !new URL(page.url()).searchParams.has('select'));

  // The timeline drawn along story time (visualization Prompt 16).
  await page.goto(`${baseV}/visualize/timeline`);
  const chartV = page.getByRole('group', { name: /^Timeline of 2 dated events/ });
  await chartV.waitFor();
  const marksV = chartV.getByRole('button');
  eq('the timeline is drawn by default, each dated event a mark named with its date', await marksV.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), ['The long siege, Year 10, somewhere in that stretch of time', 'The feast, Year 12, somewhere in that stretch of time']);
  check('the marks are explained by shape and words, not colour alone', (await page.getByRole('figure').innerText()).includes('Somewhere in this stretch'));
  await marksV.first().focus();
  await page.keyboard.press('ArrowRight');
  check('the arrow keys move along the timeline', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'The feast, Year 12, somewhere in that stretch of time');
  await page.keyboard.press('Enter');
  await detailV('The feast').waitFor();
  check('Enter on a mark shows its details', new URL(page.url()).searchParams.get('select') === `event:${pV}-feast`);
  await detailV('The feast').getByRole('button', { name: 'Close The feast' }).click();

  // Zoom, scales, jump and range (visualization Prompt 17).
  const scaleV = () => page.getByRole('group', { name: 'Zoom the timeline' }).locator('[aria-live]').innerText();
  // How far apart the two events are drawn: zooming in spreads them, fitting brings them back.
  const gapV = async () => {
    const [siege, feast] = await marksV.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
    return feast - siege;
  };
  // Closing the details panel widens the drawing a moment later: measure once its width has settled.
  await detailV('The feast').waitFor({ state: 'detached' });
  for (let last = -1, i = 0; i < 20; i++) {
    const now = await gapV();
    if (Math.abs(now - last) < 0.5) break;
    last = now;
    await page.waitForTimeout(150);
  }
  const fitScale = await scaleV();
  const fitGap = await gapV();
  // The drawing redraws a moment after a click or a key: look again for up to two seconds.
  const settles = async (test) => {
    for (let i = 0; i < 20; i++) {
      if (await test()) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  const fitted = async () => (await scaleV()) === fitScale && Math.abs((await gapV()) - fitGap) < 1;
  check('the scale is said, and the events are in order along the line', /^Showing (months|weeks|years)$/.test(fitScale) && fitGap > 0, `${fitScale} ${fitGap}`);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomedGap = await gapV();
  check('zooming in spreads the events out, keeping their order', zoomedGap > fitGap * 3 || (await settles(async () => (await gapV()) > fitGap * 3)), `${fitGap} → ${zoomedGap}`);
  await page.getByRole('button', { name: 'Fit all' }).click();
  check('Fit all shows everything again, at the same places', await settles(fitted));
  await page.getByLabel('Jump to date').fill('12-3');
  await page.getByRole('button', { name: 'Go' }).click();
  check('jumping to a month shows it with its neighbours, week by week', (await scaleV()) === 'Showing weeks', await scaleV());
  await page.getByLabel('Jump to date').fill('Octember 12');
  await page.getByRole('button', { name: 'Go' }).click();
  check('a date it cannot read is explained, not guessed at', (await page.getByRole('alert').innerText()).includes('is not a date this timeline can read'));
  await page.getByLabel('Show from').fill('9');
  await page.getByLabel('Show until').fill('10');
  await page.getByRole('button', { name: 'Show range' }).click();
  check('a range shows just that stretch', (await scaleV()) === 'Showing months' && !(await page.getByRole('alert').count()), await scaleV());
  await page.getByRole('button', { name: 'Fit all' }).click();
  await page.locator('.timeline-area').focus();
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  check('the keyboard zooms the focused drawing', await settles(async () => (await gapV()) > fitGap * 2));
  await page.keyboard.press('0');
  check('…and 0 shows everything', await settles(fitted));

  await page.getByRole('button', { name: '+ Add event' }).click();
  await detailV('New event').waitFor();
  const unplacedV = page.getByRole('region', { name: /^Not placed in time/ });
  check('a new event is made, selected, and listed apart until it has a date', (await unplacedV.innerText()).replace(/\s+/g, ' ').includes('New event No date yet') && (await marksV.count()) === 2);
  // The same record on the Timeline page: renamed there, renamed here.
  await detailV('New event').getByRole('link', { name: 'Open on the Timeline' }).click();
  await ev.getByLabel('Event name').waitFor();
  await ev.getByLabel('Event name').fill('An omen');
  await ev.getByLabel('Event name').blur();
  await page.waitForTimeout(300);
  await page.goBack();
  await detailV('An omen').waitFor();
  check('an event edited on the Timeline page is the same event here', (await unplacedV.innerText()).includes('An omen'));
  await detailV('An omen').getByRole('button', { name: 'Close An omen' }).click();

  // Tracks: the timeline split by character, place, faction or plot thread (visualization Prompt 18).
  await detailV('An omen').waitFor({ state: 'detached' });
  // Bren was at the siege and shares the feast with Mira: one feast, on two tracks.
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'timelineEvents'], 'readwrite');
      tx.objectStore('loreEntries').put({ id: `${projectId}-bren`, projectId, category: 'character', name: 'Bren', summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      const store = tx.objectStore('timelineEvents');
      for (const [id, cast] of [['feast', ['mira', 'bren']], ['siege', ['bren']]]) {
        store.get(`${projectId}-${id}`).onsuccess = (e) => store.put({ ...e.target.result, characters: cast.map((c) => ({ id: `${projectId}-${c}`, age: null })), updatedAt: at });
      }
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, Date.now()]);
  await page.goto(`${baseV}/visualize/timeline`);
  const tracksBy = page.getByLabel('Tracks by');
  await tracksBy.waitFor();
  eq('the timeline can be split by each kind of record its events link to, or by plot thread', await tracksBy.locator('option').allInnerTexts(), ['One line', 'Characters', 'Places', 'Plot threads']);
  await tracksBy.selectOption({ label: 'Characters' });
  const trackedV = page.getByRole('group', { name: /^Timeline of \d+ dated/ });
  await page.getByRole('group', { name: /^Timeline of 2 dated events, in the order they happen, on 3 tracks/ }).waitFor();
  const bandsV = () => trackedV.locator('g[role="group"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  eq('each character is a track, named with how many events it holds, and events with no character have one too', await bandsV(), ['Bren: 2 events', 'Mira: 1 event', 'Not linked to any character: 1 event']);
  const feastMarks = trackedV.getByRole('button', { name: /^The feast,/ });
  eq('the feast is drawn on both its characters’ tracks, each mark naming its track', await feastMarks.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), ['The feast, Year 12, somewhere in that stretch of time, on the Bren track', 'The feast, Year 12, somewhere in that stretch of time, on the Mira track']);
  // Where the feast is drawn on each track, once the drawing's width has settled.
  const feastAt = async () => {
    let last = '';
    for (let i = 0; i < 20; i++) {
      const now = JSON.stringify(await feastMarks.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left))));
      if (now === last) break;
      last = now;
      await page.waitForTimeout(150);
    }
    return JSON.parse(last);
  };
  const feastX = await feastAt();
  check('…at the same moment on both', feastX.length === 2 && feastX[0] === feastX[1], JSON.stringify(feastX));
  await feastMarks.nth(1).locator('.tl-shape').click();
  await detailV('The feast').waitFor();
  check('selecting it on one track selects the one event, marked on every track', new URL(page.url()).searchParams.get('select') === `event:${pV}-feast` && (await feastMarks.evaluateAll((els) => els.every((el) => el.getAttribute('aria-pressed') === 'true'))));
  await detailV('The feast').getByRole('button', { name: 'Close The feast' }).click();
  await detailV('The feast').waitFor({ state: 'detached' });
  await trackedV.getByRole('button', { name: /^The long siege,.*Bren track$/ }).focus();
  await page.keyboard.press('ArrowDown');
  check('down moves to the nearest event on the next track', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'The feast, Year 12, somewhere in that stretch of time, on the Mira track');

  await page.getByText(/^Arrange tracks/).click();
  const trackList = page.getByRole('list', { name: 'Tracks, in the order they are drawn' });
  await trackList.waitFor();
  const steadyX = await feastAt();
  await trackList.getByRole('button', { name: 'Move Mira up' }).click();
  check('moving a track up draws it higher', await settles(async () => (await bandsV())[0] === 'Mira: 1 event'), JSON.stringify(await bandsV()));
  check('…and moves no event in time', JSON.stringify(await feastAt()) === JSON.stringify(steadyX), `${JSON.stringify(steadyX)} → ${JSON.stringify(await feastAt())}`);
  check('the first track cannot move further up', await trackList.getByRole('button', { name: 'Move Mira up' }).isDisabled());
  await trackList.getByRole('checkbox', { name: /^Bren/ }).uncheck();
  check('hiding a track takes it off the drawing', await settles(async () => JSON.stringify(await bandsV()) === JSON.stringify(['Mira: 1 event', 'Not linked to any character: 1 event'])), JSON.stringify(await bandsV()));
  check('…the panel says how many are shown, and stays open', (await page.getByText(/^Arrange tracks/).innerText()) === 'Arrange tracks (2 of 3 shown)' && (await trackList.isVisible()));
  await trackList.getByRole('checkbox', { name: /^Bren/ }).check();
  check('…and it can be shown again, the panel still open', await settles(async () => (await bandsV()).length === 3) && (await trackList.isVisible()));
  await trackList.getByRole('button', { name: 'Fold Bren' }).click();
  check('folding a track draws it as one line, its events counted', await settles(async () => (await bandsV()).includes('Bren: 2 events, folded')) && (await trackedV.getByRole('button', { name: /Bren track$/ }).count()) === 0 && (await trackList.getByRole('button', { name: 'Unfold Bren' }).getAttribute('aria-pressed')) === 'true');
  await trackList.getByRole('button', { name: 'Unfold Bren' }).click();
  await trackList.getByRole('button', { name: 'Show only Mira' }).click();
  check('“Only this” shows one track alone', await settles(async () => JSON.stringify(await bandsV()) === JSON.stringify(['Mira: 1 event'])), JSON.stringify(await bandsV()));
  check('…says so, with a way back, and lists no undated events from the other tracks', (await page.getByText('Showing only “Mira”.').isVisible()) && (await page.getByRole('region', { name: /^Not placed in time/ }).count()) === 0);
  await page.getByRole('button', { name: 'Show all tracks' }).click();
  await settles(async () => (await bandsV()).length === 3);
  for (const name of [/^Mira/, /^Bren/, /^Not linked/]) await trackList.getByRole('checkbox', { name }).uncheck();
  await page.getByText('Every track is hidden, so there is nothing to show.').waitFor();
  await page.getByRole('button', { name: 'Show all tracks' }).click();
  check('hiding every track says so, and offers to show them all', await settles(async () => (await bandsV()).length === 3));

  // As a list, and together with the filters.
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  await page.getByRole('region', { name: 'Mira track' }).waitFor();
  eq('as a list, each track is a heading, in the order they were arranged', await page.locator('.tl-list-track h3').allInnerTexts(), ['Mira', 'Bren', 'Not linked to any character']);
  eq('…each with its events in story order, the feast under both its characters', [await page.getByRole('list', { name: 'Events on the Bren track, in story order' }).locator('li strong').allInnerTexts(), await page.getByRole('list', { name: 'Events on the Mira track, in story order' }).locator('li strong').allInnerTexts()], [['The long siege', 'The feast'], ['The feast']]);
  await page.getByLabel('Search by name').fill('siege');
  await page.getByRole('region', { name: 'Mira track' }).waitFor({ state: 'detached' });
  eq('filters narrow the tracks: only those holding a matching event remain', await page.locator('.tl-list-track h3').allInnerTexts(), ['Bren']);
  await page.getByLabel('Search by name').fill('');
  await page.getByRole('region', { name: 'Mira track' }).waitFor();

  // A saved view keeps the tracks and their arrangement.
  await page.getByRole('button', { name: 'Save view as…' }).click();
  await page.getByLabel('Name for this view').fill('By character');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/[?&]saved=/);
  await tracksBy.selectOption({ label: 'One line' });
  await page.getByRole('list', { name: 'Events in story order' }).waitFor();
  check('changing the tracks of a saved view offers to save the change', await page.getByRole('button', { name: 'Save changes to “By character”' }).isVisible());
  await page.goto(`${baseV}/visualize/timeline`);
  await page.getByLabel('Saved views of this kind').selectOption({ label: 'By character' });
  await page.getByRole('region', { name: 'Mira track' }).waitFor();
  check('opening the saved view brings back its tracks, in their order', JSON.stringify(await page.locator('.tl-list-track h3').allInnerTexts()) === JSON.stringify(['Mira', 'Bren', 'Not linked to any character']) && (await tracksBy.locator('option:checked').innerText()) === 'Characters');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Timeline' }).click();
  await trackedV.waitFor();
  check('mobile: the tracks and their controls fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete view' }).click();
  await page.getByLabel('Saved views of this kind').locator('option', { hasText: 'By character' }).waitFor({ state: 'detached' });
  await page.goto(`${baseV}/visualize/timeline`);
  await page.getByRole('group', { name: /^Timeline of 2 dated events, in the order they happen\. / }).waitFor();
  check('the plain timeline is one line again: tracks were only a way of looking', (await page.getByRole('group', { name: /^Timeline of 2 dated/ }).getByRole('button').count()) === 2);

  // Parallel, overlapping and lasting events (visualization Prompt 19).
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction('timelineEvents', 'readwrite');
      const day = (year, month, d) => ({ precision: 'exact', year, month, day: d, hour: null, minute: null });
      const base = { projectId, description: '', duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at };
      const store = tx.objectStore('timelineEvents');
      store.put({ ...base, id: `${projectId}-war`, name: 'The long war', when: day(9, 3, 1), end: day(11, 1, 1) });
      store.put({ ...base, id: `${projectId}-voyage`, name: 'The voyage', when: day(10, 6, 1), end: { precision: 'unknown' } });
      store.put({ ...base, id: `${projectId}-curse`, name: 'The curse', when: day(11, 1, 1), ongoing: true });
      store.put({ ...base, id: `${projectId}-reign`, name: 'The rough reign', when: { precision: 'approximate', year: 8, month: null, season: null }, end: { precision: 'approximate', year: 9, month: null, season: 'spring' } });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, Date.now()]);
  await page.goto(`${baseV}/visualize/timeline`);
  const spansV = page.getByRole('group', { name: /^Timeline of 6 dated events/ });
  await spansV.waitFor();
  const markV = (name) => spansV.getByRole('button', { name: new RegExp(`^${name},`) });
  eq('each kind of event is said apart: one with dates, one with no end given, one still going on, one with rough ends', await Promise.all(['The long war', 'The voyage', 'The curse', 'The rough reign'].map((n) => markV(n).getAttribute('aria-label'))), [
    'The long war, Year 9, March 1 to Year 11, January 1, lasting a while',
    'The voyage, Year 10, June 1, end not known, lasting a while',
    'The curse, Year 11, January 1, still going on',
    'The rough reign, Around Year 8 to Spring of Year 9, lasting a while; its start and end are known only roughly',
  ]);
  check('…and drawn apart: hatched rough ends, a fading tail with no end claimed, an arrow for still going on', (await markV('The rough reign').locator('.tl-fuzz').count()) === 2 && (await markV('The voyage').locator('.tl-tail').count()) === 4 && (await markV('The voyage').locator('.tl-unknown').count()) === 1 && (await markV('The curse').locator('.tl-arrow').count()) === 1 && (await markV('The long war').locator('.tl-fuzz').count()) === 0);
  const legendV = await page.getByRole('figure').innerText();
  check('the legend explains each, in words as well as shapes', ['Exact moment', 'Somewhere in this stretch', 'Lasts a while', 'Start or end known only roughly', 'Still going on', 'Lasts, but its end is not given'].every((w) => legendV.includes(w)), legendV);
  const rowsOf = async (names) => {
    const boxes = await Promise.all(names.map((n) => markV(n).evaluate((el) => { const r = el.getBoundingClientRect(); return [r.top, r.bottom]; })));
    return boxes.every(([top, bottom], i) => boxes.every(([t, b], j) => i === j || bottom <= t || b <= top));
  };
  check('events that share time are drawn on separate rows, none covering another', await rowsOf(['The long war', 'The voyage', 'The long siege']));
  await markV('The long war').focus();
  await page.keyboard.press('Enter');
  await detailV('The long war').waitFor();
  const sameTimeV = detailV('The long war').getByRole('region', { name: 'At the same time' });
  const sameTime = (await sameTimeV.innerText()).replace(/\s+/g, ' ');
  check('the details list what happens at the same time, how, and where, as words', sameTime.includes('The long siege · while this is going on · at Ashen Keep') && sameTime.includes('The voyage · overlaps with this') && !sameTime.includes('The feast'), sameTime);
  check('sharing time is never flagged as a mistake', (await detailV('The long war').getByText(/problem|conflict|warning/i).count()) === 0);
  await detailV('The long war').getByRole('button', { name: 'Close The long war' }).click();
  // How an event ends, set on the Timeline page.
  await page.goto(`${baseV}/timeline?event=${pV}-voyage`);
  const endsV = ev.getByLabel('Ends', { exact: true });
  await endsV.waitFor();
  check('an event whose end is not given says so where it is edited', (await endsV.inputValue()) === 'unknown' && (await page.locator('.event-card', { hasText: 'The voyage' }).innerText()).includes('end not known') && (await ev.getByLabel('Lasts').isDisabled()));
  await endsV.selectOption('date');
  await ev.getByLabel('End year').waitFor();
  await ev.getByLabel('End year').fill('12');
  await ev.getByLabel('End year').blur();
  await page.locator('.event-card', { hasText: 'The voyage' }).getByText(/until Year 12, June 1/).waitFor();
  check('giving it an end date shows it, the end editable like any date', true);
  await endsV.selectOption('ongoing');
  await page.locator('.event-card', { hasText: 'The voyage' }).getByText(/still going on/).waitFor();
  check('…or it can be still going on, one way at a time', (await ev.getByLabel('End year').count()) === 0 && (await ev.getByLabel('Lasts').isDisabled()));

  // A calendar of the novel's own, and back to the standard one.
  await page.goto(`${baseV}/settings`);
  const calV = page.locator('#calendar');
  await calV.waitFor();
  check('a novel starts on the standard calendar', await calV.getByRole('radio', { name: /^Standard calendar/ }).isChecked());
  await calV.getByRole('radio', { name: /A calendar of this novel’s own/ }).check();
  await calV.getByLabel('Calendar name').fill('The Reckoning');
  await calV.getByLabel('Name of month 1', { exact: true }).fill('Thaw');
  await calV.getByLabel('Days in Thaw').fill('30');
  await calV.getByRole('button', { name: '+ Add an era' }).click();
  await calV.getByLabel('Name of era 1').fill('Second Age');
  await calV.getByLabel('First year of Second Age').fill('11');
  check('the calendar is described before it is saved, with how dates will read', (await calV.innerText()).includes('The Reckoning: 12 months, 364 days a year, 1 era. Dates read like “Second Age 4, Thaw 1”.'), await calV.innerText());
  await calV.getByLabel('Calendar name').fill('');
  check('a calendar with a problem says what it is, and cannot be saved', (await calV.getByRole('alert').innerText()).includes('Give the calendar a name.') && (await calV.getByRole('button', { name: 'Save calendar' }).isDisabled()));
  await calV.getByLabel('Calendar name').fill('The Reckoning');
  await page.setViewportSize({ width: 390, height: 780 });
  check('mobile: the calendar editor fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await calV.getByRole('button', { name: 'Save calendar' }).click();
  await calV.getByText(/^Calendar saved\./).waitFor();
  await page.goto(`${baseV}/visualize/timeline`);
  await page.getByRole('button', { name: /^The feast, Second Age 2,/ }).waitFor();
  check('the drawn timeline reads dates in the novel’s calendar, eras included', (await page.getByRole('button', { name: /^The long siege, Year 10,/ }).count()) === 1 && (await page.locator('.axis-label').allTextContents()).some((t) => t.startsWith('Second Age')));
  await page.goto(`${baseV}/timeline`);
  await page.getByText(/^Dates use The Reckoning/).waitFor();
  const yearsV = await page.locator('.chronology h2').allTextContents();
  check('the Timeline page heads its years in the calendar, and says which calendar it is', yearsV.includes('Second Age 2') && yearsV.includes('Year 10') && (await page.getByText('Dates use The Reckoning: 12 months, 364 days a year, 1 era.').count()) === 1, JSON.stringify(yearsV));
  await page.goto(`${baseV}/timeline?event=${pV}-feast`);
  await ev.getByLabel('Month', { exact: true }).waitFor();
  check('dates are edited in the calendar’s own months, the era said beside the year', (await ev.getByLabel('Month', { exact: true }).locator('option').allInnerTexts())[1] === 'Thaw' && (await ev.locator('.date-era').innerText()) === 'Second Age 2');
  await page.getByRole('link', { name: 'Change the calendar' }).click();
  await calV.waitFor();
  await calV.getByRole('radio', { name: /^Standard calendar/ }).check();
  await calV.getByRole('button', { name: 'Save calendar' }).click();
  await calV.getByText(/^Calendar saved\./).waitFor();
  await calV.getByRole('radio', { name: /A calendar of this novel’s own/ }).check();
  check('switching back keeps the novel’s own calendar for later', (await calV.getByLabel('Calendar name').inputValue()) === 'The Reckoning');
  await calV.getByRole('button', { name: 'Discard changes' }).click();
  await page.goto(`${baseV}/visualize/timeline`);
  await page.getByRole('button', { name: /^The feast, Year 12,/ }).waitFor();
  check('…and every date reads as before: nothing was changed', (await page.getByRole('button', { name: /^The feast, Year 12, somewhere in that stretch of time$/ }).count()) === 1);

  // Story order beside reading order, in a book told out of order on purpose (visualization Prompt 20).
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'timelineEvents'], 'readwrite');
      ['Prologue', 'The Reign', 'The War', 'The Well', 'The Feast'].forEach((title, order) => tx.objectStore('chapters').put({ id: `${projectId}-c${order + 1}`, projectId, parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at }));
      const store = tx.objectStore('timelineEvents');
      // The prologue shows the curse ahead of time; the war foreshadows the feast.
      const tell = { curse: [['c1', 'flashforward']], reign: [['c2', 'told']], war: [['c3', 'told']], feast: [['c3', 'foreshadowed'], ['c5', 'told']], voyage: [['c4', 'told']] };
      for (const [id, tellings] of Object.entries(tell)) {
        store.get(`${projectId}-${id}`).onsuccess = (e) => store.put({ ...e.target.result, nodeIds: tellings.map(([c]) => `${projectId}-${c}`), reveals: tellings.filter(([, role]) => role !== 'told').map(([c, role]) => ({ nodeId: `${projectId}-${c}`, role })), updatedAt: at });
      }
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, Date.now()]);
  const chapterOrderV = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('chapters').objectStore('chapters').getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((c) => c.projectId === projectId).map((c) => `${c.order}:${c.title}:${c.updatedAt}`).sort()); };
    };
  }), pV);
  const chaptersBefore = await chapterOrderV();
  // The siege is revealed afterwards in the Well: set where the author sets it, on the Timeline page.
  await page.goto(`${baseV}/timeline?event=${pV}-siege`);
  await ev.getByLabel('Link a chapter or scene').selectOption({ label: 'The Well' });
  await ev.getByLabel('How The Well tells it').waitFor();
  check('a linked chapter is told plainly until the author says otherwise', (await ev.getByLabel('How The Well tells it').inputValue()) === 'told');
  await ev.getByLabel('How The Well tells it').selectOption('revealed');
  await page.locator('.event-card', { hasText: 'The long siege' }).getByText('Told in The Well (revealed afterwards)').waitFor();
  check('how a chapter tells an event is set beside it, and shown on the timeline', true);

  await page.goto(`${baseV}/visualize/order`);
  const readingV = page.getByRole('list', { name: 'Chapters and scenes, in reading order' });
  await readingV.waitFor();
  check('the comparison says, in words, how the book is told', (await page.getByRole('status').filter({ hasText: 'story order' }).innerText()) === 'Not told in story order: 1 telling goes back in time, and 2 go ahead.', await page.getByRole('status').filter({ hasText: 'story order' }).innerText());
  eq('chapters are in reading order', (await readingV.locator('.to-name').allInnerTexts()), ['Ch 1: Prologue', 'Ch 2: The Reign', 'Ch 3: The War', 'Ch 4: The Well', 'Ch 5: The Feast']);
  eq('…events in story order, with what is not placed in time last', (await page.getByRole('list', { name: 'Events, in story order' }).locator('.to-name').allInnerTexts()), ['The rough reign', 'The long war', 'The long siege', 'The voyage', 'The curse', 'The feast', 'An omen']);
  check('a line joins each chapter to each event it tells, styled by how', (await page.locator('.to-line').count()) === 7 && (await page.locator('.to-line.role-flashforward').count()) === 1 && (await page.locator('.to-line.role-revealed').count()) === 1);
  check('each chapter says what it tells, and how, without the drawing', (await readingV.getByRole('button', { name: /^Ch 1: Prologue/ }).textContent()).includes('tells The curse (as a flash-forward, goes ahead in time)'));
  const orderLegendV = await page.getByRole('figure').innerText();
  check('the legend names each way of telling', ['Told here', 'As a flash-forward', 'Foreshadowed', 'Revealed afterwards', 'Lines that cross'].every((w) => orderLegendV.includes(w)), orderLegendV);
  check('nothing is flagged when every telling is marked as what it is', (await page.getByRole('region', { name: 'Worth a look' }).count()) === 0);
  await readingV.getByRole('button', { name: /^Ch 4: The Well/ }).click();
  await detailV('The Well').waitFor();
  check('selecting a chapter shows its details, and picks out its lines', (await page.locator('.to-line.on').count()) === 2 && (await page.locator('.to-line.dim').count()) === 5 && (await detailV('The Well').innerText()).includes('The long siege'));
  await detailV('The Well').getByRole('button', { name: 'Close The Well' }).click();
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const tellingsTableV = page.getByRole('table', { name: 'Every telling, in reading order' });
  await tellingsTableV.waitFor();
  const firstRow = (await tellingsTableV.locator('tbody tr').first().innerText()).replace(/\s+/g, ' ');
  check('as a list, every telling in reading order, with how and where it falls in story time', firstRow.includes('Ch 1: Prologue') && firstRow.includes('The curse') && firstRow.includes('As a flash-forward') && firstRow.includes('5th · goes ahead in time'), firstRow);
  check('…and every event in story order, with where the reader meets it', (await page.getByRole('list', { name: 'Events in story order, with where the reader meets them' }).innerText()).includes('The reader meets it in Ch 3: The War (foreshadowed), Ch 5: The Feast') && (await page.getByRole('list', { name: 'Events in story order, with where the reader meets them' }).innerText()).includes('Not told in any chapter yet'));
  // Unmarked, the prologue reads as the story's start, and the app asks rather than assumes.
  await page.goto(`${baseV}/timeline?event=${pV}-curse`);
  await ev.getByLabel('How Prologue tells it').selectOption('told');
  await page.locator('.event-card', { hasText: 'The curse' }).getByText(/Told in Prologue$/).waitFor();
  await page.goto(`${baseV}/visualize/order?as=list`);
  await page.getByRole('region', { name: 'Worth a look' }).waitFor();
  check('a chapter told plainly out of order gets a question, not a correction', (await page.getByRole('region', { name: 'Worth a look' }).innerText()).includes('“The rough reign” is told in Ch 2: The Reign, after “The curse” (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?'));
  check('reading, marking and comparing never reorder or touch a chapter', JSON.stringify(await chapterOrderV()) === JSON.stringify(chaptersBefore));
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseV}/visualize/order`);
  await readingV.waitFor();
  check('mobile: both orders fit side by side', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // Ages and a character's life history (visualization Prompt 21).
  // Changes records directly, as data: each patch merges fields into a stored row; each row is put whole.
  const putV = (patches, rows = []) => page.evaluate(([projectId, at, patches, rows]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'timelineEvents', 'loreLinks', 'chapters'], 'readwrite');
      for (const { store, id, changes } of patches) {
        const s = tx.objectStore(store);
        s.get(projectId + id).onsuccess = (e) => s.put({ ...e.target.result, ...changes, updatedAt: at });
      }
      for (const { store, row } of rows) tx.objectStore(store).put({ ...row, projectId, createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, Date.now(), patches, rows]);
  const historyV = page.getByRole('region', { name: 'In story time' });
  await page.goto(`${baseV}/visualize/history?who=${pV}-mira`);
  await historyV.waitFor();
  check('with no birth date or age recorded, the history says so and invents no age', (await page.getByText(/^When they were born is not recorded\./).count()) === 1 && (await historyV.locator('li', { hasText: 'The feast' }).innerText()).includes('age unknown'));
  await putV([{ store: 'loreEntries', id: '-mira', changes: { fields: [{ id: 'dob', key: 'Date of Birth', value: 'the year of the comet' }] } }]);
  await page.reload();
  await page.getByRole('region', { name: 'Worth a look' }).waitFor();
  check('a date of birth that cannot be read is pointed out, not guessed at', (await page.getByRole('region', { name: 'Worth a look' }).innerText()).includes('“the year of the comet”, could not be read as a date'));
  // Born on 1 June, Year 1; Bren is 30 at the siege; Bren is in Ashen Keep from the siege on; Mira appears in the last chapter.
  await putV(
    [
      { store: 'loreEntries', id: '-mira', changes: { fields: [{ id: 'dob', key: 'Date of Birth', value: '1-6-1' }] } },
      { store: 'timelineEvents', id: '-siege', changes: { characters: [{ id: `${pV}-bren`, age: 30 }] } },
      { store: 'chapters', id: '-c5', changes: { mentions: [`${pV}-mira`] } },
    ],
    [{ store: 'loreLinks', row: { id: `${pV}-lk1`, fromId: `${pV}-bren`, toId: `${pV}-keep`, fromLabel: '', toLabel: '', fromType: 'entry', toType: 'entry', type: 'located-in', validity: { from: { kind: 'event', eventId: `${pV}-siege` }, until: null } } }],
  );
  await page.reload();
  await page.getByText(/^Born on Year 1, June 1/).waitFor();
  check('a date of birth on the profile gives the birth, and says where it comes from', (await page.getByText(/^Born on Year 1, June 1/).innerText()) === 'Born on Year 1, June 1, worked out from the date of birth on their profile (1-6-1).');
  check('an event dated only to the year gives an age range, not a guess', (await historyV.locator('li', { hasText: 'The feast' }).innerText()).includes('Age 10–11'));
  check('appearances are listed apart, as the reader meets them', (await page.getByRole('region', { name: 'As the reader meets them' }).innerText()).includes('Appears in Ch 5: The Feast'));
  await historyV.getByRole('button', { name: 'The feast', exact: true }).click();
  await detailV('The feast').waitFor();
  check('each line is the shared record itself: selecting it shows that record', new URL(page.url()).searchParams.get('select') === `event:${pV}-feast`);
  await detailV('The feast').getByRole('button', { name: 'Close The feast' }).click();
  await page.getByLabel('Whose history').selectOption({ label: 'Bren' });
  await page.getByText(/^Born between/).waitFor();
  check('an age stated at one event gives the birth as a range, and every other age from it', (await page.getByText(/^Born between/).innerText()) === 'Born between Year -21, January 2 and Year -20, December 31, worked out from age 30 at “The long siege”.' && (await historyV.locator('li', { hasText: 'The long siege' }).first().innerText()).includes('Age 30') && (await historyV.locator('li', { hasText: 'The feast' }).innerText()).includes('Age 31–33'));
  check('places and affiliations dated by an event come after it in story time', (await historyV.locator('li').allInnerTexts()).findIndex((t) => t.includes('Located in Ashen Keep')) > (await historyV.locator('li').allInnerTexts()).findIndex((t) => t.startsWith('Year 10') && t.includes('The long siege')));
  await page.goto(`${baseV}/timeline?character=${pV}-mira`);
  await page.locator('.life-summary').waitFor();
  check('the Timeline page’s life path uses the same ages', (await page.locator('.life-summary').innerText()) === 'Age 10–11: The feast');
  await page.getByRole('link', { name: 'Mira\'s whole life history' }).click();
  await page.waitForURL(/\/visualize\/history\?who=/);
  check('…and leads to the whole life history', new URL(page.url()).searchParams.get('who') === `${pV}-mira`);
  await page.setViewportSize({ width: 390, height: 780 });
  await historyV.waitFor();
  check('mobile: the life history fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // Alternate histories, kept apart from the main timeline (visualization Prompt 22).
  const mainEventsV = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('timelineEvents').objectStore('timelineEvents').getAll();
      req.onsuccess = () => { open.result.close(); resolve(JSON.stringify(req.result.filter((e) => e.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)))); };
    };
  }), pV);
  const mainBefore = await mainEventsV();
  await page.goto(`${baseV}/timeline`);
  await page.getByRole('link', { name: 'Alternate histories' }).click();
  await page.getByRole('heading', { name: 'Alternate histories', level: 1 }).waitFor();
  check('alternate histories are reached from the timeline, and start empty', (await page.getByText(/^No alternate histories yet\./).count()) === 1);
  await page.getByLabel('Name of the alternate history').fill('If the Keep held');
  await page.getByLabel('Kind of history').selectOption({ label: 'What if' });
  await page.getByLabel('Canon status of the history').selectOption({ label: 'Non-Canon' });
  await page.getByLabel('Departs at').selectOption({ label: 'The long siege (Year 10)' });
  await page.getByRole('button', { name: 'Start the history' }).click();
  const thisHistory = page.getByRole('region', { name: 'This alternate history' });
  await thisHistory.waitFor();
  check('a new history says its canon status, its kind, and where it branches from', (await thisHistory.getByRole('status').innerText()).startsWith('Non-Canon · What if. Not canon. The main timeline is the novel’s canon') && (await thisHistory.innerText()).includes('Branches from the main timeline at “The long siege” (Year 10).'));
  await thisHistory.getByRole('button', { name: 'Change how “The long siege” goes here' }).click();
  const siegeForm = thisHistory.getByRole('form', { name: 'How “The long siege” goes in this history' });
  await siegeForm.getByLabel('Year').fill('13');
  await siegeForm.getByRole('button', { name: 'Save for this history' }).click();
  const historyEventsV = thisHistory.getByRole('list', { name: 'Events in this history, in story order' });
  await historyEventsV.locator('li', { hasText: 'The long siege' }).getByText('Changed here: date').waitFor();
  check('an event can go differently in the history, and only what differs is marked', true);
  await thisHistory.getByRole('button', { name: '“The feast” does not happen here' }).click();
  await thisHistory.getByRole('list', { name: 'Events that do not happen in this history' }).getByText('The feast').waitFor();
  await thisHistory.getByLabel('Name of an event only in this history').fill('The parley');
  await thisHistory.getByRole('button', { name: 'Add an event only here' }).click();
  const parleyForm = thisHistory.getByRole('form', { name: 'How “The parley” goes in this history' });
  await parleyForm.getByLabel('How exact the date is').selectOption('exact');
  await parleyForm.getByLabel('Year').fill('14');
  await parleyForm.getByRole('button', { name: 'Save for this history' }).click();
  await historyEventsV.locator('li', { hasText: 'The parley' }).getByText('Only in this history').waitFor();
  eq('the history’s events, in its own story order', (await historyEventsV.locator('li strong').allInnerTexts()).filter((n) => ['The long siege', 'The parley', 'The curse'].includes(n)), ['The curse', 'The long siege', 'The parley']);
  check('ISOLATION: nothing in the main timeline changed', (await mainEventsV()) === mainBefore);
  const compareV = page.getByRole('region', { name: 'Compare timelines' });
  check('comparison with the main timeline, in a sentence', (await compareV.getByRole('status').innerText()) === '3 events differ: 1 changed, 1 only in “If the Keep held”, 1 only in The main timeline.', await compareV.getByRole('status').innerText());
  const diffRows = (await compareV.getByRole('table', { name: 'Differences between the two timelines' }).locator('tbody tr').allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim());
  check('…and event by event, saying what differs', diffRows.some((r) => r.startsWith('The long siege Year 10 Year 13 Changed: date')) && diffRows.some((r) => r.includes('The feast') && r.includes('Does not happen')) && diffRows.some((r) => r.startsWith('The parley Does not happen Year 14')), JSON.stringify(diffRows));

  // Drawn: the history stands in for the timeline, saying so; the main timeline is still there as it was.
  await page.goto(`${baseV}/visualize/timeline`);
  await page.getByLabel('Timeline shown').selectOption({ label: 'If the Keep held (Non-Canon)' });
  await page.getByText(/^Showing the alternate history “If the Keep held” \(Non-Canon\), not the main timeline\./).waitFor();
  const drawnV = page.getByRole('group', { name: /^Timeline of \d+ dated/ });
  const drawnNames = async () => (await drawnV.getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).map((l) => l.split(',')[0]);
  check('the drawn timeline can show a history: its own events, at their own dates', await settles(async () => { const n = await drawnNames(); return n.includes('The parley') && !n.includes('The feast'); }) && (await drawnV.getByRole('button', { name: /^The long siege, Year 13,/ }).count()) === 1);
  check('…with no way to add to the main timeline from it', (await page.getByRole('button', { name: '+ Add event' }).count()) === 0);
  await drawnV.getByRole('button', { name: /^The parley,/ }).focus();
  await page.keyboard.press('Enter');
  await detailV('The parley').waitFor();
  check('an event only in the history opens in its history, not on the main timeline', (await detailV('The parley').getByRole('link', { name: 'Open in its alternate history' }).count()) === 1);
  await detailV('The parley').getByRole('button', { name: 'Close The parley' }).click();
  await page.getByLabel('Timeline shown').selectOption({ label: 'The main timeline (canon)' });
  check('back on the main timeline, everything is as it was', await settles(async () => { const n = await drawnNames(); return n.includes('The feast') && !n.includes('The parley'); }) && (await drawnV.getByRole('button', { name: /^The long siege, Year 10,/ }).count()) === 1);

  // A history of a history; comparing two histories; canon status set by hand only; deleting.
  await page.goto(`${baseV}/histories`);
  await page.getByLabel('Name of the alternate history').fill('And the crown');
  await page.getByLabel('Branches from').selectOption({ label: 'If the Keep held (Non-Canon)' });
  await page.getByRole('button', { name: 'Start the history' }).click();
  await thisHistory.getByRole('heading', { name: 'And the crown' }).waitFor();
  check('a history can branch from another, and inherits its differences', (await thisHistory.innerText()).includes('Branches from “If the Keep held”, across the whole timeline.') && (await historyEventsV.locator('li strong').allInnerTexts()).includes('The parley'));
  check('…comparing it with its base: the same events', (await compareV.getByRole('status').innerText()) === '“If the Keep held” and “And the crown” have the same events.');
  await page.getByRole('list').getByRole('button', { name: 'If the Keep held', exact: true }).click();
  // Choosing a history goes through the page address, a moment later: wait until its panel is showing.
  await thisHistory.getByRole('heading', { name: 'If the Keep held' }).waitFor();
  await thisHistory.getByLabel('Canon status of this history').selectOption({ label: 'Alternate Canon' });
  await thisHistory.getByRole('status').getByText(/^Alternate Canon/).waitFor();
  check('canon status is set by the author, and says what it means; the main timeline is still untouched', (await thisHistory.getByRole('status').innerText()).includes('Alternate canon: an official second course of events. The main timeline stays as it is.') && (await mainEventsV()) === mainBefore);
  await thisHistory.getByRole('button', { name: 'Delete this history…' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete history' }).click();
  await page.getByRole('list').getByRole('button', { name: 'If the Keep held', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('list').getByRole('button', { name: 'And the crown', exact: true }).click();
  await thisHistory.getByRole('heading', { name: 'And the crown' }).waitFor();
  check('deleting a history moves those based on it to its base, keeping their own; the main timeline is untouched', (await thisHistory.innerText()).includes('Branches from the main timeline, across the whole timeline.') && (await mainEventsV()) === mainBefore);
  await page.setViewportSize({ width: 390, height: 780 });
  check('mobile: alternate histories fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // The event editor and the timeline's review (visualization Prompt 23).
  // The Docks, five days' ride from the Keep; Bren at both on 3 March; Kai at the Keep on the 4th and the Docks on the 5th.
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'timelineEvents', 'continuityRules'], 'readwrite');
      tx.objectStore('loreEntries').put({ id: `${projectId}-kai`, projectId, category: 'character', name: 'Kai', summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      tx.objectStore('loreEntries').put({ id: `${projectId}-docks`, projectId, category: 'location', name: 'The Docks', summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      tx.objectStore('continuityRules').put({ id: `${projectId}-ride`, projectId, kind: 'travel', entryId: `${projectId}-keep`, toEntryId: `${projectId}-docks`, amount: 5, unit: 'days', aliases: [], state: null, label: '', words: [], scope: 'paragraph', holderId: null, fromNodeId: null, untilNodeId: null, note: '', createdAt: at, updatedAt: at });
      const day = (d) => ({ precision: 'exact', year: 10, month: 3, day: d, hour: null, minute: null });
      const base = { projectId, description: '', duration: null, importance: 'minor', entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at };
      const who = (c) => [{ id: `${projectId}-${c}`, age: null }];
      const store = tx.objectStore('timelineEvents');
      store.put({ ...base, id: `${projectId}-ball`, name: 'The ball', when: day(3), locationId: `${projectId}-keep`, characters: who('bren') });
      store.put({ ...base, id: `${projectId}-raid`, name: 'The raid', when: day(3), locationId: `${projectId}-docks`, characters: who('bren') });
      store.put({ ...base, id: `${projectId}-council`, name: 'The council', when: day(4), locationId: `${projectId}-keep`, characters: who('kai') });
      store.put({ ...base, id: `${projectId}-gallop`, name: 'The ride', when: day(5), locationId: `${projectId}-docks`, characters: who('kai') });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, Date.now()]);
  const eventsBeforeReview = await mainEventsV();
  await page.goto(`${baseV}/timeline`);
  await page.getByRole('link', { name: 'Review: 2 to look at' }).click();
  await page.getByRole('heading', { name: 'Timeline review', level: 1 }).waitFor();
  const twoPlacesV = page.getByRole('region', { name: 'In two places at once' });
  const travelV = page.getByRole('region', { name: 'Too little time to travel' });
  check('a character in two distant places at once is found, with the rule behind it', (await twoPlacesV.innerText()).includes('The rule: A character cannot be at two events at the same time in two different places, unless one place lies inside the other.') && (await twoPlacesV.innerText()).includes('Bren is at Ashen Keep and at The Docks at the same time.'));
  check('an impossible journey is found only because a travel time is recorded, and says so', (await travelV.innerText()).includes('Kai cannot get from Ashen Keep to The Docks in time for “The ride”.') && (await travelV.innerText()).includes('at most 2 days later. The travel time recorded between them is 5 days.'));
  check('each finding names the records to open to resolve it', (await travelV.getByRole('link', { name: 'Open “The ride”' }).count()) === 1 && (await travelV.getByRole('link', { name: 'the travel time' }).count()) === 1);
  await twoPlacesV.getByRole('button', { name: /^Mark as intentional/ }).click();
  await page.getByLabel('Why is this intentional?').fill('A double or impostor');
  await page.getByRole('button', { name: 'Save as intentional' }).click();
  const decidedV = page.getByRole('region', { name: 'Decided' });
  await decidedV.getByText('Your note: A double or impostor').waitFor();
  check('marking a finding intentional keeps the reason, and takes it out of the open list', (await page.getByRole('status').first().innerText()).startsWith('1 to look at · 1 decided') && (await twoPlacesV.count()) === 0);
  await travelV.getByRole('button', { name: /^Dismiss/ }).click();
  await page.getByText('Nothing to look at', { exact: false }).first().waitFor();
  check('dismissing a finding is a decision too, and changes no record', (await page.getByRole('status').first().innerText()).startsWith('Nothing to look at') && (await mainEventsV()) === eventsBeforeReview);
  await decidedV.getByRole('button', { name: /^Reopen: Kai cannot get/ }).click();
  await travelV.waitFor();
  check('a decision can be reopened', (await page.getByRole('status').first().innerText()).startsWith('1 to look at'));
  // Resolving it is fixing the record: the ride is later than she could make it.
  await travelV.getByRole('link', { name: 'Open “The ride”' }).click();
  await ev.getByLabel('Day', { exact: true }).waitFor();
  check('the event shows its finding where it is edited, with the way to the rule', (await ev.locator('.event-issues').innerText()).includes('Kai cannot get from Ashen Keep to The Docks in time for “The ride”.') && (await ev.getByRole('link', { name: /Timeline review$/ }).count()) === 1);
  await ev.getByLabel('Day', { exact: true }).fill('40');
  await ev.getByLabel('Day', { exact: true }).blur();
  await ev.getByRole('alert').getByText('March has 31 days: day 40 was not saved.').waitFor();
  check('an edit the calendar cannot hold is explained, not saved', JSON.parse(await mainEventsV()).find((e) => e.id === `${pV}-gallop`).when.day === 5);
  await ev.getByLabel('Day', { exact: true }).fill('10');
  await ev.getByLabel('Day', { exact: true }).blur();
  await ev.locator('.event-issues').waitFor({ state: 'detached' });
  check('fixing the record resolves the finding: it is simply no longer raised', (await page.getByRole('link', { name: /^Review/ }).innerText()) === 'Review');
  await ev.getByLabel('Canon status of this event').selectOption('provisional');
  check('canon status is edited with the event, through the same record', await settles(async () => JSON.parse(await mainEventsV()).find((e) => e.id === `${pV}-gallop`).canon === 'provisional'));
  // Editing from the drawn timeline: the same editor, the same record.
  await page.goto(`${baseV}/visualize/timeline`);
  await page.getByRole('group', { name: /^Timeline of \d+ dated/ }).getByRole('button', { name: /^The ride,/ }).focus();
  await page.keyboard.press('Enter');
  await detailV('The ride').waitFor();
  await detailV('The ride').getByRole('button', { name: 'Edit this event here' }).click();
  await detailV('The ride').getByLabel('Event name').fill('The long ride');
  await detailV('The ride').getByLabel('Event name').blur();
  await page.getByRole('group', { name: /^Timeline of \d+ dated/ }).getByRole('button', { name: /^The long ride,/ }).waitFor();
  check('an event can be edited from the drawn timeline, and the drawing follows', JSON.parse(await mainEventsV()).find((e) => e.id === `${pV}-gallop`).name === 'The long ride');

  // The relationship manager: types of the novel's own, attributes only when chosen (visualization Prompt 24).
  const relationsV = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('characterRelations').objectStore('characterRelations').getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), pV);
  await page.goto(`${baseV}/relationships`);
  await page.getByText('Relationship types and attributes').click();
  const typesV = page.getByRole('region', { name: 'Types of your own' });
  await typesV.getByLabel('Name of the type').fill('Rivals');
  await typesV.getByRole('button', { name: 'Add the type' }).click();
  await page.getByRole('alert').getByText('There is already a type called “Rivals”.').waitFor();
  check('a type of the novel’s own must have a name of its own', true);
  await typesV.getByLabel('Name of the type').fill('Blood oath');
  await typesV.getByRole('checkbox', { name: /One-way/ }).check();
  await typesV.getByLabel('First role').fill('Oath-holder');
  await typesV.getByLabel('Second role').fill('Sworn');
  await typesV.getByRole('button', { name: 'Add the type' }).click();
  await typesV.getByText('one-way: Oath-holder → Sworn').waitFor();
  check('the author can make a relationship type, one-way with a role for each side', true);
  const attributesV = page.getByRole('region', { name: 'Attributes to track' });
  check('no attribute is tracked until the author chooses one', (await attributesV.getByRole('checkbox', { checked: true }).count()) === 0);
  await attributesV.getByLabel('Trust').check();
  await attributesV.getByLabel('Fear').check();
  await page.getByRole('region', { name: 'Built-in types offered' }).getByLabel('Exes').uncheck();
  await page.getByLabel('Relationship type').locator('option', { hasText: 'Exes' }).waitFor({ state: 'detached' });
  check('built-in types the novel does not use can be left out of the choices', (await page.getByLabel('Relationship type').locator('option', { hasText: 'Blood oath' }).count()) === 1);
  await page.getByLabel('First character').selectOption({ label: 'Kai' });
  await page.getByLabel('Relationship type').selectOption({ label: 'Blood oath' });
  await page.getByLabel('Second character').selectOption({ label: 'Bren' });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  const relDetailsV = page.getByRole('complementary', { name: 'Relationship details' });
  await relDetailsV.getByLabel('Kai’s trust toward Bren').fill('9');
  await relDetailsV.getByLabel('Kai’s trust toward Bren').blur();
  await relDetailsV.getByLabel('Bren’s fear toward Kai').fill('4');
  await relDetailsV.getByLabel('Bren’s fear toward Kai').blur();
  check('a relationship links the actual characters, in the type’s roles, with its tracked attributes each way', await settles(async () => {
    const [r] = await relationsV();
    return r?.fromId === `${pV}-kai` && r.toId === `${pV}-bren` && r.stages[0].label === 'Blood oath' && r.stages[0].fromRole === 'Oath-holder' && JSON.stringify(r.stages[0].attributes) === JSON.stringify({ trust: { from: 9, to: null }, fear: { from: null, to: 4 } });
  }));
  await relDetailsV.getByLabel('Kai’s fear toward Bren').fill('11');
  await relDetailsV.getByLabel('Kai’s fear toward Bren').blur();
  await page.getByRole('alert').getByText('Fear is given as a whole number from 0 to 10.').waitFor();
  check('an attribute off the scale is refused, and says why', !('from' in ((await relationsV())[0].stages[0].attributes.fear ?? {})) || (await relationsV())[0].stages[0].attributes.fear.from === null);
  // Another connection recorded between the two shows beside the relationship; it stays its own record.
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction('loreLinks', 'readwrite');
      tx.objectStore('loreLinks').put({ id: `${projectId}-lk2`, projectId, fromId: `${projectId}-bren`, toId: `${projectId}-kai`, fromLabel: '', toLabel: '', fromType: 'entry', toType: 'entry', type: 'distrusts', createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pV, Date.now()]);
  await page.reload();
  await relDetailsV.getByRole('region', { name: 'Also recorded between them' }).waitFor();
  check('other connections between the same two characters are shown with the relationship', (await relDetailsV.getByRole('region', { name: 'Also recorded between them' }).innerText()).includes('Bren — distrusts — Kai'));
  await page.getByText('Relationship types and attributes').click();
  await typesV.getByRole('button', { name: 'Edit the type Blood oath' }).click();
  await typesV.getByLabel('Name of the type').fill('Life-debt');
  await typesV.getByRole('button', { name: 'Save the type' }).click();
  check('changing a type changes the relationships that use it', await settles(async () => (await relationsV())[0]?.stages[0].label === 'Life-debt'));
  await typesV.getByRole('button', { name: 'Delete the type Life-debt' }).click();
  check('deleting a type keeps the relationships’ wording, as Custom', await settles(async () => { const s = (await relationsV())[0]?.stages[0]; return s?.preset === 'custom' && s.label === 'Life-debt' && s.toRole === 'Sworn'; }));
  await relDetailsV.getByRole('button', { name: 'Delete relationship…' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete relationship' }).click();
  check('deleting a relationship removes it, and only it: both characters stay', await settles(async () => (await relationsV()).length === 0) && (await page.getByLabel('First character').locator('option', { hasText: 'Kai' }).count()) === 1);
  await page.setViewportSize({ width: 390, height: 780 });
  check('mobile: the relationship settings fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // A relationship's history: changes at a chapter, in story time, with what brought them about (visualization Prompt 25).
  await page.getByLabel('First character').selectOption({ label: 'Bren' });
  await page.getByLabel('Relationship type').selectOption({ label: 'Friends' });
  await page.getByLabel('Second character').selectOption({ label: 'Kai' });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await relDetailsV.getByLabel('Relationship title').fill('Sworn brothers');
  await relDetailsV.getByLabel('Relationship title').blur();
  await settles(async () => (await relationsV())[0]?.stages[0].title === 'Sworn brothers');
  const firstState = JSON.stringify((await relationsV())[0].stages[0]);
  await relDetailsV.getByLabel('New stage starts at').selectOption({ label: '3. The War' });
  await relDetailsV.getByRole('button', { name: 'Add stage' }).click();
  await relDetailsV.getByLabel('Chapters 3+ type').selectOption({ label: 'Enemies' });
  await relDetailsV.getByLabel('Chapters 3+ affinity').selectOption({ label: 'Hostile' });
  await relDetailsV.getByLabel('Chapters 3+ in story time').selectOption({ label: 'The ball' });
  await relDetailsV.getByLabel('Chapters 3+ brought about by').selectOption({ label: 'The raid' });
  await relDetailsV.getByLabel('Chapters 3+ shown in').selectOption({ label: 'The War' });
  const evolvedV = relDetailsV.getByRole('region', { name: 'How it evolved' });
  await evolvedV.getByText(/brought about by “The raid”, shown in The War/).waitFor();
  const evolvedText = (await evolvedV.innerText()).replace(/\s+/g, ' ');
  check('the history shows each state, what changed, when in story time, and what brought it about', evolvedText.includes('Chapters 1–2: Friends · Neutral · “Sworn brothers”') && evolvedText.includes('Chapters 3+ · in story time at “The ball” (Year 10, March 3): Enemies · Hostile') && evolvedText.includes('changed type: Friends → Enemies; feeling: Neutral → Hostile'), evolvedText);
  check('recording a change kept the earlier state exactly as it was', JSON.stringify((await relationsV())[0].stages[0]) === firstState);
  await relDetailsV.getByLabel('New stage starts at').selectOption({ label: 'Not said' });
  await relDetailsV.getByRole('button', { name: 'Add stage' }).click();
  await relDetailsV.getByLabel('Stage 3, chapter not said in story time').selectOption({ label: 'On a date…' });
  await relDetailsV.getByLabel('Year', { exact: true }).fill('11');
  await evolvedV.getByText(/Stage 3, chapter not said · in story time Around Year 11/).waitFor();
  check('a change can be at a chapter not said, and at an approximate date, without claiming more', (await evolvedV.innerText()).includes('From chapter 3') && (await relDetailsV.locator('.rel-timeline > li').nth(2).innerText()).includes('No cause recorded. None is assumed from when it happened.'));
  check('…and both earlier states are still there as they were', JSON.stringify((await relationsV())[0].stages[0]) === firstState && (await relationsV())[0].stages[1].label === 'Enemies' && (await relationsV())[0].stages.length === 3);

  // The relationship map, on a crowded court: 150 characters, 300 relationships (visualization Prompt 26).
  // A crowded map takes a moment to lay out again: look for up to ten seconds.
  const settlesSlow = async (test) => {
    for (let i = 0; i < 50; i++) {
      if (await test()) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };
  const pCourt = await createProject('Crowded Court');
  const baseCourt = `${BASE}/project/${pCourt}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'characterRelations', 'chapters'], 'readwrite');
      const entry = (id, name, category) => ({ id, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      for (let i = 0; i < 150; i++) tx.objectStore('loreEntries').put(entry(`${projectId}-c${i}`, `Courtier ${String(i).padStart(3, '0')}`, 'character'));
      for (let h = 0; h < 5; h++) tx.objectStore('loreEntries').put(entry(`${projectId}-h${h}`, `House ${h}`, 'faction'));
      for (let i = 0; i < 150; i++) tx.objectStore('loreLinks').put({ id: `${projectId}-m${i}`, projectId, fromId: `${projectId}-c${i}`, toId: `${projectId}-h${i % 5}`, fromLabel: '', toLabel: '', fromType: 'entry', toType: 'entry', type: 'member-of', createdAt: at, updatedAt: at });
      for (let i = 0; i < 10; i++) tx.objectStore('loreLinks').put({ id: `${projectId}-d${i}`, projectId, fromId: `${projectId}-c${i}`, toId: `${projectId}-c${i + 75}`, fromLabel: '', toLabel: '', fromType: 'entry', toType: 'entry', type: 'distrusts', createdAt: at, updatedAt: at });
      for (let n = 0; n < 4; n++) tx.objectStore('chapters').put({ id: `${projectId}-ch${n + 1}`, projectId, parentId: null, kind: 'chapter', title: `Act ${n + 1}`, order: n, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at });
      const kinds = [['parent-child', 'family', 'Parent / Child', 'Parent', 'Child', true], ['friends', 'social', 'Friends', 'Friend', 'Friend', false], ['rivals', 'social', 'Rivals', 'Rival', 'Rival', false], ['mentor-student', 'mentorship', 'Mentor / Student', 'Mentor', 'Student', true], ['romantic-interest', 'romance', 'Romantic interest', 'Romantic interest', 'Romantic interest', false], ['employer-employee', 'hierarchy', 'Employer / Employee', 'Employer', 'Employee', true]];
      const stage = (id, k, startNodeId) => ({ id, startNodeId, preset: k[0], category: k[1], label: k[2], fromRole: k[3], toRole: k[4], directional: k[5], title: '', affinity: 'neutral', event: '', notes: '' });
      for (let i = 0; i < 300; i++) {
        const a = i % 150;
        const b = (a + (i < 150 ? 1 : 6) + ((i * 7 + (i < 150 ? 0 : 10)) % 13)) % 150;
        const stages = [stage(`s${i}a`, kinds[i % 6], null)];
        // Thirty of them turn hostile at Act 3.
        if (i < 30) stages.push({ ...stage(`s${i}b`, ['enemies', 'social', 'Enemies', 'Enemy', 'Enemy', false], `${projectId}-ch3`), affinity: 'hostile' });
        tx.objectStore('characterRelations').put({ id: `${projectId}-r${i}`, projectId, fromId: `${projectId}-c${a}`, toId: `${projectId}-c${b}`, stages, createdAt: at, updatedAt: at });
      }
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pCourt, Date.now()]);
  const mapStarted = Date.now();
  await page.goto(`${baseCourt}/visualize/relationships`);
  const courtMap = page.getByRole('group', { name: /^Relationship map of \d+ characters/ });
  await courtMap.waitFor();
  const mapTook = Date.now() - mapStarted;
  const courtStatus = () => page.getByRole('status').filter({ hasText: /^Showing/ }).innerText();
  check('a crowded network is drawn whole: every character, relationship and connection, in good time', (await courtStatus()) === 'Showing 150 characters and 300 of 300 relationships, with 10 other connections.' && (await page.locator('.rel-dot').count()) === 150 && mapTook < 20000, `${await courtStatus()} in ${mapTook} ms`);
  const legendCourt = await page.getByRole('figure').innerText();
  check('each kind of relationship has its own line, named in the legend', ['Family', 'Social', 'Mentorship', 'Romance', 'Work and rank', 'Other connections'].every((w) => legendCourt.includes(w)) && (await page.locator('.rel-line.rel-cat-mentorship').count()) === 45, `${legendCourt} / ${await page.locator('.rel-line.rel-cat-mentorship').count()}`);
  check('a one-way relationship says which way it reads', (await page.locator('.rel-line.rel-cat-mentorship').first().getAttribute('aria-label')).includes('(Mentor) to') && (await page.locator('.rel-line.rel-cat-mentorship .stroke').first().getAttribute('marker-end')) === 'url(#rel-arrow)');
  // Selection by keyboard: one stop in the tab order, arrows between characters, Enter selects.
  await page.locator('.rel-dot[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForURL(/select=entry/);
  check('the keyboard moves between characters and selects one, out of 150', new URL(page.url()).searchParams.get('select') === `entry:${pCourt}-c1`);
  await detailV('Courtier 001').waitFor();
  check('selecting a character lights up their ties and dims the rest', (await page.locator('.rel-line.dim').count()) > 250 && (await page.locator('.rel-line:not(.dim)').count()) < 20);
  await detailV('Courtier 001').getByRole('button', { name: 'Focus the map on Courtier 001' }).click();
  await page.waitForURL(/rfocus=/);
  // The address changes first; the map follows a moment later.
  await settlesSlow(async () => (await courtStatus()).endsWith('around Courtier 001.'));
  const focusedStatus = await courtStatus();
  const focusedCount = Number(focusedStatus.match(/^Showing (\d+)/)[1]);
  check('focusing shows one character’s neighbourhood, not the hairball', focusedStatus.endsWith('around Courtier 001.') && focusedCount > 1 && focusedCount < 12 && (await page.locator('.rel-dot').count()) === focusedCount, focusedStatus);
  await page.getByLabel('Steps out from the focus').selectOption('2');
  await settlesSlow(async () => Number((await courtStatus()).match(/^Showing (\d+)/)[1]) > focusedCount);
  check('…and reaches one step further when asked', Number((await courtStatus()).match(/^Showing (\d+)/)[1]) > focusedCount);
  // Dragging a character moves them, and can be undone.
  const dot = page.locator('.rel-dot').first();
  const dotBefore = await dot.getAttribute('transform');
  const dotBox = await dot.boundingBox();
  await page.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dotBox.x + dotBox.width / 2 + 80, dotBox.y + dotBox.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  check('a character can be dragged to a new place, and put back', (await dot.getAttribute('transform')) !== dotBefore && (await page.getByRole('button', { name: 'Put everyone back where the layout placed them' }).count()) === 1);
  // Filters over the whole court.
  await page.goto(`${baseCourt}/visualize/relationships`);
  await courtMap.waitFor();
  await page.getByLabel('Relationship type shown').selectOption({ label: 'Enemies' });
  await settlesSlow(async () => (await courtStatus()).includes('30 of 300'));
  check('filtering by type: only the 30 who are enemies now, and no other connections', (await courtStatus()).includes('and 30 of 300 relationships.') && (await page.locator('.rel-line').count()) === 30, await courtStatus());
  await page.getByLabel('Relationships as they stand').selectOption('at');
  await page.getByLabel('As of chapter').selectOption({ label: '2. Act 2' });
  await page.getByText('Nothing matches these filters.').waitFor();
  check('as of an earlier chapter, nobody is an enemy yet: the map says nothing matches, and offers to clear', await page.getByRole('button', { name: 'Clear filters', exact: true }).isVisible());
  await page.getByLabel('Relationships as they stand').selectOption('range');
  await page.getByLabel('From chapter').selectOption({ label: '3. Act 3' });
  await settlesSlow(async () => (await courtStatus()).includes('30 of 300'));
  check('across chapters, the stages in force then', (await courtStatus()).includes('30 of 300 relationships'), await courtStatus());
  await page.getByLabel('Relationships as they stand').selectOption('ever');
  await page.getByLabel('Relationship type shown').selectOption({ label: 'Rivals' });
  await settlesSlow(async () => (await courtStatus()).includes('50 of 300'));
  check('over the whole history: every rival, including those who later became enemies', (await courtStatus()).includes('50 of 300 relationships'), await courtStatus());
  await page.getByLabel('Relationship type shown').selectOption({ label: 'Every type' });
  await settlesSlow(async () => (await courtStatus()).includes('300 of 300'));
  // One change at a time, each waited for: the map follows the address a moment later, so the faction alone already reads "not 300 of 300".
  const shownOf300 = async () => Number((await courtStatus()).match(/and (\d+) of 300/)[1]);
  await page.getByLabel('Faction').selectOption({ label: 'House 2' });
  await settlesSlow(async () => (await shownOf300()) < 300);
  const byFaction = await shownOf300();
  await page.getByRole('group', { name: 'Layers' }).getByLabel('Family').uncheck();
  await settlesSlow(async () => (await shownOf300()) < byFaction);
  const factionCount = await shownOf300();
  check('by faction and with a layer hidden, fewer still, and no family lines drawn', byFaction < 200 && factionCount > 0 && factionCount < byFaction && (await page.locator('.rel-line.rel-cat-family').count()) === 0, `${byFaction} by faction; then ${await courtStatus()}`);
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const courtTable = page.getByRole('table', { name: 'Relationships and connections shown' });
  await courtTable.waitFor();
  check('the list shows the same relationships as text', (await courtTable.locator('tbody tr').count()) >= factionCount && (await courtTable.locator('tbody tr').first().innerText()).includes('Courtier'));
  await courtTable.getByRole('button', { name: /^(Friends|Rivals|Enemies|Romantic interest|Mentor \/ Student →|Employer \/ Employee →)$/ }).first().click();
  await page.waitForURL(/select=relation/);
  const courtFacts = await page.locator('.viz-facts').innerText();
  check('selecting a relationship shows its details: which way it reads, and how they feel', courtFacts.includes('Direction') && courtFacts.includes('Feeling'), courtFacts);
  // On a phone the details open over the page; the map is checked on its own.
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseCourt}/visualize/relationships`);
  await courtMap.waitFor();
  check('mobile: the map and its filters fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Secrets and knowledge: who knows, who suspects, who believes something false, and how it spreads (visualization Prompt 27).
  const pH = await createProject('Heir Apparent');
  const baseH = `${BASE}/project/${pH}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'chapters', 'timelineEvents'], 'readwrite');
      for (const name of ['Kaelen', 'Mira', 'Tam', 'Oren', 'Bren']) tx.objectStore('loreEntries').put({ id: `${projectId}-${name.toLowerCase()}`, projectId, category: 'character', name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      ['The Ring', 'The Feast', 'The Seal', 'The Steward', 'The Well', 'The Crown'].forEach((title, n) => tx.objectStore('chapters').put({ id: `${projectId}-ch${n + 1}`, projectId, parentId: null, kind: 'chapter', title, order: n, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at }));
      [['feast', 'The feast', 1], ['duel', 'The duel', 4], ['coronation', 'The coronation', 9]].forEach(([id, name, day]) => tx.objectStore('timelineEvents').put({ id: `${projectId}-${id}`, projectId, name, description: '', when: { precision: 'exact', year: 10, month: 3, day, hour: null, minute: null }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at }));
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pH, Date.now()]);
  const secretsH = () => page.evaluate(([projectId, table]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(table).objectStore(table).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pH, 'characterSecrets']);
  const decisionsH = () => page.evaluate(([projectId, table]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(table).objectStore(table).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pH, 'continuityResolutions']);
  await page.goto(`${baseH}/characters/${pH}-kaelen/secrets`);
  const secTabH = page.getByRole('region', { name: 'Secrets', exact: true });
  await secTabH.getByLabel('Title of a new secret').fill('True heir');
  await secTabH.getByRole('button', { name: 'Add secret' }).click();
  const secretH = secTabH.getByRole('listitem', { name: 'Secret: True heir' });
  await secretH.getByLabel('What is true').fill('Kaelen is the old king’s son.');
  await secretH.getByLabel('What is true').blur();
  await secretH.getByLabel('Does Kaelen know?').selectOption('unaware');
  await secretH.getByLabel('Add to Characters who know').selectOption({ label: 'Tam' });
  await settles(async () => (await secretsH())[0]?.knows.length === 1);
  await secretH.getByLabel('Add to Characters who suspect').selectOption({ label: 'Bren' });
  await settles(async () => (await secretsH())[0]?.suspects.length === 1 && (await secretsH())[0].description.includes('king'));
  await secretH.locator('details.secret-knowledge > summary').click();
  const recordFormH = secretH.getByRole('form', { name: 'Record what someone knows' });
  const recordH = async (who, state, more = {}) => {
    const before = (await secretsH())[0].records?.length ?? 0;
    await recordFormH.getByLabel('Character', { exact: true }).selectOption({ label: who });
    await recordFormH.getByLabel('What they hold').selectOption({ label: state });
    if (more.version) await recordFormH.getByLabel(/^(The part they know|What they believe instead|What they think)$/).fill(more.version);
    if (more.chapter) await recordFormH.getByLabel('Chapter or scene').selectOption({ label: more.chapter });
    if (more.event) await recordFormH.getByLabel('Event').selectOption({ label: more.event });
    if (more.how) await recordFormH.getByLabel('How they came by it').fill(more.how);
    if (more.from) await recordFormH.getByLabel('From whom').selectOption({ label: more.from });
    await recordFormH.getByRole('button', { name: 'Record it' }).click();
    await settles(async () => ((await secretsH())[0].records?.length ?? 0) > before);
  };
  await recordH('Mira', 'Unaware', { chapter: 'The Ring' });
  await recordH('Mira', 'Suspects', { version: 'someone’s bastard', chapter: 'The Seal', how: 'sees the signet ring' });
  await recordH('Mira', 'Knows', { chapter: 'The Well', how: 'a confession', from: 'Tam' });
  await recordH('Oren', 'Knows part of it', { version: 'that he is noble-born', chapter: 'The Feast' });
  await recordH('Bren', 'Believes something false', { version: 'a foundling from the docks', chapter: 'The Feast', event: 'The feast' });
  const heirH = (await secretsH())[0];
  const ofH = (name) => heirH.records.filter((r) => r.characterId === `${pH}-${name}`).map((r) => [r.state, r.belief, r.nodeId ? r.nodeId.split('-').pop() : null, r.how, r.fromId ? r.fromId.split('-').pop() : null]);
  eq('changed knowledge is a new record each time: Mira’s earlier states are all kept, in order, with how and from whom', ofH('mira'), [['unaware', '', 'ch1', '', null], ['suspects', 'someone’s bastard', 'ch3', 'sees the signet ring', null], ['knows', '', 'ch5', 'a confession', 'tam']]);
  eq('partial and false knowledge keep their own version, apart from what is true', { oren: ofH('oren'), bren: ofH('bren').at(-1), truth: heirH.description }, { oren: [['partial', 'that he is noble-born', 'ch2', '', null]], bren: ['false', 'a foundling from the docks', 'ch2', '', null], truth: 'Kaelen is the old king’s son.' });
  check('Bren’s place in the “suspect” list was kept as an earlier record with no chapter, and he left the list; Tam, with no records, stays in it', JSON.stringify(ofH('bren')[0]) === JSON.stringify(['suspects', '', null, '', null]) && heirH.suspects.length === 0 && heirH.knows.length === 1 && heirH.self === 'unaware');
  const knowPicker = await secretH.getByLabel('Add to Characters who know').locator('option').allInnerTexts();
  check('someone with a recorded history is no longer offered in the simple lists, and the card says where they are', !knowPicker.includes('Mira') && knowPicker.includes('Oren') === false && (await secretH.innerText()).includes('Bren, Mira, Oren have a recorded history'), knowPicker.join(','));
  const miraCard = (await secretH.getByRole('region', { name: 'What Mira holds' }).innerText()).replace(/\s+/g, ' ');
  check('the card lists Mira’s records in order, saying where, how and from whom', miraCard.includes('now: Knows') && /Unaware.*The Ring.*Suspects “someone’s bastard”.*The Seal · sees the signet ring.*Knows.*The Well · a confession · from Tam/.test(miraCard), miraCard);
  await secretH.getByRole('button', { name: 'Change Mira’s record 2' }).click();
  const changeFormH = secretH.getByRole('form', { name: 'Change Mira’s record 2' });
  await changeFormH.getByLabel('How they came by it').fill('sees the signet ring on his hand');
  await changeFormH.getByRole('button', { name: 'Save' }).click();
  await settles(async () => (await secretsH())[0].records.some((r) => r.how === 'sees the signet ring on his hand'));
  const afterEditH = (await secretsH())[0].records;
  check('changing a record changes only that record', afterEditH.length === heirH.records.length && afterEditH.every((r, i) => (i === 1 ? r.how === 'sees the signet ring on his hand' && r.state === 'suspects' : JSON.stringify(r) === JSON.stringify(heirH.records[i]))));
  const needFormH = secretH.getByRole('form', { name: 'Mark where someone acts on it' });
  await needFormH.getByLabel('Character', { exact: true }).selectOption({ label: 'Mira' });
  await needFormH.getByLabel('Chapter or scene').selectOption({ label: 'The Feast' });
  await needFormH.getByLabel('What they do with it').fill('blackmails the steward');
  await needFormH.getByRole('button', { name: 'Mark it' }).click();
  await settles(async () => (await secretsH())[0].needs?.length === 1);
  const recordsBeforeChecks = JSON.stringify((await secretsH())[0].records);
  await secretH.getByRole('link', { name: 'See how it spreads, and the checks →' }).click();
  await page.waitForURL(/\/visualize\/knowledge\?ksecret=/);
  await page.getByRole('heading', { name: 'Secrets and knowledge', level: 2 }).waitFor();
  const nowH = (await page.getByRole('list', { name: 'Who knows what now' }).innerText()).replace(/\s+/g, ' ');
  check('who knows what now: knowing, knowing part, a false belief and unaware, each with their version, and the simple answers marked as having no history', ['Knows Mira, Tam (no history)', 'Knows part of it Oren (“that he is noble-born”)', 'Believes something false Bren (“a foundling from the docks”)', 'Unaware Kaelen (no history)'].every((w) => nowH.includes(w)), nowH);
  const chartH = page.getByRole('group', { name: /^Who holds what of the secret/ });
  await chartH.waitFor();
  const cellH = (start) => page.locator(`.kn-cell-g[aria-label^="${start}"]`).getAttribute('aria-label');
  check('the chart: a row for each of five characters, a column for each of four chapters and now', (await page.locator('.kn-cell-g').count()) === 25 && (await chartH.getAttribute('aria-label')).includes('5 characters across 4 chapters and scenes'));
  eq('each cell says the record in force there: unknown before any record, partial, false and changed states', [await cellH('Oren, Ch 1'), await cellH('Oren, Ch 2'), await cellH('Bren, Ch 3'), await cellH('Mira, Ch 2'), await cellH('Mira, Ch 3'), await cellH('Mira, Ch 5'), await cellH('Tam, now')], [
    'Oren, Ch 1: The Ring: nothing recorded yet',
    'Oren, Ch 2: The Feast: knows part of it (“that he is noble-born”); a record made here',
    'Bren, Ch 3: The Seal: believes something false (“a foundling from the docks”)',
    'Mira, Ch 2: The Feast: is unaware; acts on it here',
    'Mira, Ch 3: The Seal: suspects (“someone’s bastard”); a record made here',
    'Mira, Ch 5: The Well: knows; a record made here; learns it from Tam here',
    'Tam, now: knows, from the simple lists, with no recorded history',
  ]);
  const legendTextH = await page.getByRole('figure').innerText();
  check('records, the author’s mark and who told whom are drawn, and named in the legend', (await page.locator('.kn-here').count()) === 5 && (await page.locator('.kn-need').count()) === 1 && (await page.locator('.kn-told').count()) === 1 && ['Knows part of it', 'Believes something false', 'Nothing recorded yet', 'Told by'].every((w) => legendTextH.includes(w)), legendTextH);
  await page.locator('.kn-cell-g[tabindex="0"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const detailH = page.locator('.kn-detail');
  await detailH.getByText('In force from').waitFor();
  check('the keyboard reaches a cell, and it shows the record it rests on', (await detailH.innerText()).includes('Mira, Ch 3: The Seal: Suspects (“someone’s bastard”)') && (await detailH.innerText()).includes('In force from: Mira suspects (“someone’s bastard”) in Ch 3: The Seal: sees the signet ring on his hand.'), await detailH.innerText());
  await detailH.getByRole('button', { name: 'Show Mira' }).click();
  await page.waitForURL(/select=entry/);
  check('…and opens the character’s details from there', new URL(page.url()).searchParams.get('select') === `entry:${pH}-mira`);
  const checksH = page.getByRole('region', { name: 'Checks' });
  const findingH = 'Mira acts on “True heir” in Ch 2: The Feast, but is recorded as unaware of it there.';
  check('one check, from the author’s mark and a record that settles it; nothing else is flagged', (await checksH.getByRole('status').innerText()) === '1 to look at' && (await checksH.getByRole('list', { name: 'To look at' }).innerText()).includes(findingH) && (await checksH.innerText()).includes('Your mark: “blackmails the steward”, in Ch 2: The Feast. Their record: Mira is unaware in Ch 1: The Ring.'));
  await checksH.getByRole('button', { name: `Mark as intentional: ${findingH}` }).click();
  await checksH.getByLabel('Why is this intentional?').fill('She is bluffing');
  await checksH.getByRole('button', { name: 'Save as intentional' }).click();
  await checksH.getByRole('status').filter({ hasText: 'Nothing to look at · 1 decided' }).waitFor();
  const decidedH = await decisionsH();
  check('a decision is kept with the others, under its own key, and the records are untouched by checking or deciding', decidedH.length === 1 && decidedH[0].key.startsWith('knowledge|needs|') && decidedH[0].note === 'She is bluffing' && JSON.stringify((await secretsH())[0].records) === recordsBeforeChecks);
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const listH = page.getByRole('list', { name: 'Who holds what, chapter by chapter' });
  await listH.waitFor();
  const listTextH = await listH.innerText();
  check('the list says the same, point by point, without the chart', listTextH.includes('Oren, Ch 2: The Feast: knows part of it (“that he is noble-born”); a record made here') && listTextH.includes('Bren, Ch 2: The Feast: believes something false (“a foundling from the docks”); a record made here') && listTextH.includes('Kaelen, now: unaware, from the simple lists'), listTextH);
  await page.getByLabel('Along').selectOption('story');
  await page.waitForURL(/kaxis=story/);
  const storyListH = page.getByRole('list', { name: 'Who holds what, event by event' });
  await storyListH.waitFor();
  check('in story time, only what is placed at an event, and the rest said to be unplaced', (await storyListH.innerText()).includes('Bren, The feast: believes something false (“a foundling from the docks”); a record made here') && (await page.getByRole('region', { name: 'How it spreads' }).innerText()).includes('With no event, so in each history but at no point here: Mira is unaware in Ch 1: The Ring'));
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Chart' }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByLabel('Along').selectOption('reading');
  await chartH.waitFor();
  check('mobile: the chart scrolls inside its box; the page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // The scene board: chapters and scenes as cards, moved through the manuscript's own order (visualization Prompt 28).
  const pB = await createProject('Board Book');
  const baseB = `${BASE}/project/${pB}`;
  await page.goto(`${baseB}/board`);
  await page.getByText('No chapters yet').waitFor();
  check('an empty novel says the board fills with its chapters and scenes', (await page.getByRole('button', { name: 'Add the first chapter' }).count()) === 1);
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters'], 'readwrite');
      const put = (id, kind, parentId, title, order, wordCount = 0, more = {}) => tx.objectStore('chapters').put({ id: `${projectId}-${id}`, projectId, parentId: parentId && `${projectId}-${parentId}`, kind, title, order, summary: '', notes: '', status: 'idea', wordCount, charCount: wordCount * 5, createdAt: at, updatedAt: at, ...more });
      put('prologue', 'chapter', null, 'Prologue', 0, 30);
      put('act1', 'act', null, 'Act I', 1);
      put('arrival', 'chapter', 'act1', 'Arrival', 0, 10);
      put('betrayal', 'chapter', 'act1', 'Betrayal', 1);
      put('act2', 'act', null, 'Act II', 2);
      put('epilogue', 'chapter', null, 'Epilogue', 3);
      put('gate', 'scene', 'arrival', 'The gate', 0, 0);
      put('inn', 'scene', 'arrival', 'The inn', 1, 80, { status: 'drafting', summary: 'A stranger at the inn' });
      put('vault', 'scene', 'betrayal', 'The vault', 0, 200);
      put('road', 'scene', 'epilogue', 'The road', 0, 50);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pB, Date.now()]);
  const nodesB = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('chapters').objectStore('chapters').getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), pB);
  /** The book's shape as stored: each chapter's place, then its scenes in order. */
  const shapeB = async () => {
    const all = await nodesB();
    const kids = (parentId) => all.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order);
    const walk = (parentId) => kids(parentId).map((n) => (n.kind === 'scene' ? n.title : `${n.title}[${walk(n.id).join(', ')}]`));
    return walk(null).join(' ');
  };
  const original = 'Prologue[] Act I[Arrival[The gate, The inn], Betrayal[The vault]] Act II[] Epilogue[The road]';
  await page.goto(baseB);
  await page.locator('.sidebar nav a', { hasText: /^Scene board$/ }).click();
  await page.waitForURL(/\/board$/);
  const boardStatus = () => page.locator('.scene-board .page-header [role=status]').innerText();
  await page.locator('.scene-board .page-header [role=status]', { hasText: '4 chapters' }).waitFor();
  const columnsB = () => page.locator('.board-col').evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label').replace('Chapter: ', '')}[${[...el.querySelectorAll('.board-card')].map((c) => c.getAttribute('aria-label').replace('Scene: ', '')).join(', ')}]`).join(' '));
  check('the board has its own page in the sidebar, and counts what is in the book', (await boardStatus()) === '4 chapters · 4 scenes · 370 words', await boardStatus());
  eq('a column per chapter with its scenes as cards, grouped by act, in reading order', { parts: await page.locator('.board-part').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), columns: await columnsB() }, { parts: ['Not in a volume, act or arc', 'Act I', 'Act II', 'Not in a volume, act or arc'], columns: 'Prologue[] Arrival[The gate, The inn] Betrayal[The vault] Epilogue[The road]' });
  const innCard = page.getByRole('listitem', { name: 'Scene: The inn' });
  const innText = (await innCard.innerText()).replace(/\s+/g, ' ');
  check('a card shows its status, its words and its summary, and opens in the manuscript', innText.includes('A stranger at the inn') && innText.includes('80 words') && (await innCard.getByLabel('Status of The inn').inputValue()) === 'drafting' && (await innCard.getByRole('link', { name: 'The inn' }).getAttribute('href')) === `/project/${pB}/manuscript/${pB}-inn`, innText);
  check('a chapter’s column counts its scenes’ words with its own', (await page.getByRole('region', { name: 'Chapter: Arrival' }).locator('.board-col-head').innerText()).includes('90 words · 2 scenes'));
  // Drag a card onto the top half of another: it lands before it, through the manuscript's own move.
  await page.getByRole('listitem', { name: 'Scene: The vault' }).dragTo(innCard, { sourcePosition: { x: 8, y: 10 }, targetPosition: { x: 40, y: 4 } });
  await page.getByText('Moved “The vault” in “Arrival”, before “The inn”.').waitFor();
  check('dragging a scene into another chapter moves it there, and says so', (await shapeB()) === 'Prologue[] Act I[Arrival[The gate, The vault, The inn], Betrayal[]] Act II[] Epilogue[The road]' && (await columnsB()).includes('Arrival[The gate, The vault, The inn]'), await shapeB());
  await page.getByRole('button', { name: 'Undo move of “The vault”' }).click();
  await page.getByText('Undone: Moved “The vault”').waitFor();
  check('undo puts it back exactly where it was', (await shapeB()) === original, await shapeB());
  // The buttons on each card do the same without a mouse; Ctrl+Z undoes.
  await innCard.getByRole('button', { name: 'Move The inn earlier' }).click();
  await page.getByText('Moved “The inn” in “Arrival”, before “The gate”.').waitFor();
  const afterButton = await shapeB();
  await page.locator('.scene-board h1').click();
  await page.keyboard.press('Control+z');
  await page.getByText('Undone: Moved “The inn”').waitFor();
  check('a card moves with the keyboard-reachable buttons, and Ctrl+Z undoes it', afterButton.includes('Arrival[The inn, The gate]') && (await shapeB()) === original, afterButton);
  await page.getByRole('listitem', { name: 'Scene: The road' }).getByLabel('Move The road to chapter').selectOption({ label: 'Betrayal' });
  await page.getByText('Moved “The road” in “Betrayal”, at the end.').waitFor();
  check('“Move to…” sends a scene to the end of another chapter', (await shapeB()).includes('Betrayal[The vault, The road]'));
  await page.getByRole('button', { name: 'Undo move of “The road”' }).click();
  await page.getByText('Undone: Moved “The road”').waitFor();
  // A chapter with its scenes into another act: asked first.
  await page.getByRole('region', { name: 'Chapter: Arrival' }).getByLabel('Move Arrival into').selectOption({ label: 'Act: Act II' });
  const askB = page.locator('dialog[open]');
  await askB.waitFor();
  check('moving a chapter with its scenes into another act is asked about first, saying what goes with it', (await askB.innerText()).includes('Move Arrival and its 2 scenes (90 words) into “Act II”?'), await askB.innerText());
  await askB.getByRole('button', { name: 'Cancel' }).click();
  check('…and cancelling changes nothing', (await shapeB()) === original);
  await page.getByRole('region', { name: 'Chapter: Arrival' }).getByLabel('Move Arrival into').selectOption({ label: 'Act: Act II' });
  await page.locator('dialog[open]').getByRole('button', { name: 'Move them' }).click();
  await page.getByText('Moved “Arrival” in “Act II”, at the end.').waitFor();
  check('confirmed, the chapter moves with its scenes', (await shapeB()) === 'Prologue[] Act I[Betrayal[The vault]] Act II[Arrival[The gate, The inn]] Epilogue[The road]');
  await page.getByRole('button', { name: 'Undo move of “Arrival”' }).click();
  await page.getByText('Undone: Moved “Arrival”').waitFor();
  // Chapters drag too: the Epilogue onto the left half of the Prologue's column (a tall window, so both are in view without scrolling mid-drag).
  await page.setViewportSize({ width: 1280, height: 1700 });
  await page.getByRole('region', { name: 'Chapter: Epilogue' }).locator('.board-col-head').dragTo(page.getByRole('region', { name: 'Chapter: Prologue' }), { sourcePosition: { x: 8, y: 10 }, targetPosition: { x: 10, y: 40 } });
  await page.getByText('Moved “Epilogue” at the top level, before “Prologue”.').waitFor();
  check('dragging a chapter reorders the chapters', (await shapeB()).startsWith('Epilogue[The road] Prologue[]') && (await columnsB()).startsWith('Epilogue[The road] Prologue[]'), await shapeB());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press('Control+z');
  await page.getByText('Undone: Moved “Epilogue”').waitFor();
  check('…and back', (await shapeB()) === original);
  await page.getByRole('listitem', { name: 'Scene: The gate' }).getByLabel('Status of The gate').selectOption('revising');
  await page.getByText('“The gate” set to Revising.').waitFor();
  check('a status set on a card is the scene’s own status everywhere', (await nodesB()).find((n) => n.title === 'The gate').status === 'revising');
  await page.getByRole('button', { name: 'Undo status of “The gate”' }).click();
  await page.getByText('Undone: “The gate” set to Revising.').waitFor();
  check('…and undoing a status puts the old one back', (await nodesB()).find((n) => n.title === 'The gate').status === 'idea');
  // Filtering: only what matches, and no moving while filtered.
  await page.getByLabel('Show status').selectOption('drafting');
  await page.getByText('Moving is off while the board is filtered').waitFor();
  check('a status filter shows only what matches, and turns moving off', (await columnsB()) === 'Arrival[The inn]' && (await innCard.getAttribute('draggable')) === 'false' && (await innCard.getByRole('button', { name: 'Move The inn earlier' }).count()) === 0, await columnsB());
  await page.getByRole('button', { name: 'Clear filter' }).first().click();
  await page.getByLabel('Search cards').fill('stranger');
  await page.locator('.board-col').first().waitFor();
  check('searching finds a card by its summary', (await columnsB()) === 'Arrival[The inn]');
  await page.getByLabel('Search cards').fill('');
  // Kept in step with the Organizer, even in another tab: a move there shows here, and the board will not undo over it.
  await page.getByRole('listitem', { name: 'Scene: The gate' }).getByRole('button', { name: 'Move The gate later' }).click();
  await page.getByText('Moved “The gate” in “Arrival”, at the end.').waitFor();
  const organizerTab = await context.newPage();
  await organizerTab.goto(`${baseB}/organizer`);
  const gateRow = organizerTab.locator('.outline-row', { hasText: 'The gate' });
  await gateRow.waitFor();
  eq('the Organizer shows the order the board made', await organizerTab.locator('.outline-row.row-scene .outline-title strong').allInnerTexts(), ['The inn', 'The gate', 'The vault', 'The road']);
  await gateRow.getByLabel('Actions for The gate').click();
  await gateRow.getByRole('button', { name: 'Move up' }).click();
  await page.getByRole('region', { name: 'Chapter: Arrival' }).locator('.board-card').first().filter({ hasText: 'The gate' }).waitFor();
  check('a move in the Organizer shows on the board at once', (await columnsB()).includes('Arrival[The gate, The inn]'));
  await page.getByRole('button', { name: 'Undo move of “The gate”' }).click();
  await page.getByRole('alert').filter({ hasText: 'That cannot be undone' }).waitFor();
  check('undo will not put back a card that has been moved since: it says why, and changes nothing', (await page.getByRole('alert').innerText()).includes('“The gate” has been moved since.') && (await shapeB()) === original);
  await organizerTab.close();
  await page.getByRole('alert').getByRole('button', { name: 'Dismiss' }).click();
  // Kept in step with the editor: writing in a scene changes its words on the board.
  await page.getByRole('link', { name: 'The gate', exact: true }).click();
  await page.waitForURL(new RegExp(`/manuscript/${pB}-gate$`));
  await page.locator(text).click();
  await page.keyboard.type('The gate stood open in the rain.');
  await settlesSlow(async () => (await nodesB()).find((n) => n.title === 'The gate').wordCount === 7);
  await page.goBack();
  await page.waitForURL(/\/board$/);
  await page.locator('.scene-board .page-header [role=status]', { hasText: '377 words' }).waitFor();
  check('words written in the editor show on the card and in the totals', (await page.getByRole('listitem', { name: 'Scene: The gate' }).innerText()).includes('7 words') && (await boardStatus()) === '4 chapters · 4 scenes · 377 words');
  await page.getByRole('button', { name: 'Add a scene to Betrayal' }).click();
  await page.getByRole('region', { name: 'Chapter: Betrayal' }).locator('.board-card').nth(1).waitFor();
  check('a scene added on the board is a scene in the manuscript', (await nodesB()).filter((n) => n.kind === 'scene').length === 5 && (await columnsB()).includes('Betrayal[The vault, Scene 2]'), await columnsB());
  await page.getByRole('group', { name: 'Lay out as' }).getByRole('button', { name: 'Lanes' }).click();
  await page.waitForURL(/layout=lanes/);
  await page.locator('.board-cols.lanes').first().waitFor();
  check('the board can be laid out in lanes instead of columns', (await page.locator('.board-cols.lanes').count()) === 4 && (await page.locator('.board-cols.columns').count()) === 0);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(200);
  const lanesFit = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.getByRole('group', { name: 'Lay out as' }).getByRole('button', { name: 'Columns' }).click();
  await page.waitForURL(/layout=columns/);
  check('mobile: lanes and columns both fit the screen (columns scroll inside their row)', lanesFit && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Plot-thread lanes: each thread across the chapters, from what the author recorded (visualization Prompt 29).
  const pT = await createProject('Heist Book');
  const baseT = `${BASE}/project/${pT}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'plotThreads', 'timelineEvents'], 'readwrite');
      const id = (x) => `${projectId}-${x}`;
      ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'].forEach((title, n) => tx.objectStore('chapters').put({ id: id(`ch${n + 1}`), projectId, parentId: null, kind: 'chapter', title, order: n, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at }));
      ['The tavern', 'The vault'].forEach((title, n) => tx.objectStore('chapters').put({ id: id(n ? 'vault' : 'tavern'), projectId, parentId: id('ch3'), kind: 'scene', title, order: n, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at }));
      const thread = (key, title, status, beats) => ({ id: id(key), projectId, title, premise: '', category: 'subplot', customCategory: '', status, characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats, notes: '', muted: false, createdAt: at, updatedAt: at });
      const beat = (key, nodeId, title, role) => ({ id: id(key), nodeId: id(nodeId), title, note: '', createdAt: at, ...(role ? { role } : {}) });
      tx.objectStore('plotThreads').put(thread('heist', 'The heist', 'active', [beat('b1', 'ch1', 'The job is offered', 'introduction'), beat('b2', 'vault', 'Casing the vault'), beat('b3', 'ch8', 'The vault is empty', 'resolution')]));
      tx.objectStore('plotThreads').put(thread('romance', 'Romance', 'planned', []));
      tx.objectStore('timelineEvents').put({ id: id('kiss'), projectId, name: 'The kiss', description: '', when: { precision: 'unknown' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [id('ch5')], threadIds: [id('romance')], afterId: null, createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pT, Date.now()]);
  const threadsT = () => page.evaluate((projectId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('plotThreads').objectStore('plotThreads').getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), pT);
  const threadT = async (title) => (await threadsT()).find((t) => t.title === title);
  // On the Plot threads page: an intersection, recorded by the author, and a status of the author's own.
  await page.goto(`${baseT}/plot?thread=${pT}-heist`);
  const drawerT = page.getByRole('complementary', { name: 'Thread details' });
  await drawerT.getByLabel('New development', { exact: true }).waitFor();
  check('a status of the author’s own is offered, and every role a beat can have', (await drawerT.getByLabel('Status', { exact: true }).locator('option').allInnerTexts()).at(-1) === 'Custom' && (await drawerT.getByLabel('Role of the new development').locator('option').allInnerTexts()).join() === 'Introduction,Development,Intersection,Resolution,Appears (no development)');
  eq('a beat stored before roles is a development; the others keep the role recorded', await drawerT.locator('select[aria-label^="Role of development"]').evaluateAll((els) => els.map((el) => el.value)), ['introduction', 'development', 'resolution']);
  await drawerT.getByLabel('Chapter for the new development').selectOption({ label: 'Five' });
  await drawerT.getByLabel('Role of the new development').selectOption('intersection');
  await drawerT.getByLabel('New development', { exact: true }).fill('Mira joins the crew');
  await drawerT.getByRole('button', { name: 'Add development' }).click();
  await drawerT.getByLabel('Thread development 3 crosses').selectOption({ label: 'Romance' });
  await settles(async () => ((await threadT('The heist')).beats.find((b) => b.title === 'Mira joins the crew')?.withThreadIds ?? []).length === 1);
  const crossing = (await threadT('The heist')).beats.find((b) => b.title === 'Mira joins the crew');
  check('an intersection is a beat the author records, naming the thread it crosses', crossing.role === 'intersection' && crossing.nodeId === `${pT}-ch5` && crossing.withThreadIds[0] === `${pT}-romance`);
  await page.goto(`${baseT}/plot?thread=${pT}-romance`);
  await drawerT.getByLabel('Status', { exact: true }).selectOption('custom');
  await drawerT.getByLabel('Status name').fill('Simmering');
  await drawerT.getByLabel('Status name').blur();
  await settles(async () => (await threadT('Romance')).customStatus === 'Simmering');
  await page.locator('.thread', { hasText: 'Romance' }).locator('.thread-status', { hasText: 'Simmering' }).waitFor();
  check('a custom status is saved with its name, and shown by it', (await threadT('Romance')).status === 'custom');
  const beatsBefore = JSON.stringify((await threadsT()).map((t) => t.beats));
  // The lanes.
  await page.goto(`${baseT}/visualize/plot`);
  const lanesT = page.getByRole('group', { name: /^Plot-thread lanes/ });
  await lanesT.waitFor();
  const cellT = (start) => page.locator(`.pl-cell[aria-label^="${start}"]`).getAttribute('aria-label');
  check('a lane for each thread across the eight chapters', (await lanesT.getAttribute('aria-label')).startsWith('Plot-thread lanes: 2 threads across 8 chapters') && (await page.locator('.pl-cell').count()) === 16);
  eq('each mark is what the author recorded there: introduction, development in a scene, intersection, resolution, and an event', [await cellT('The heist, Ch 1'), await cellT('The heist, Ch 3'), await cellT('The heist, Ch 5'), await cellT('The heist, Ch 8'), await cellT('Romance, Ch 5')], [
    'The heist, Ch 1: introduction “The job is offered”',
    'The heist, Ch 3: development “Casing the vault” in “The vault”',
    'The heist, Ch 5: intersection “Mira joins the crew”',
    'The heist, Ch 8: resolution “The vault is empty”',
    'Romance, Ch 5: event “The kiss”; crossed by The heist',
  ]);
  check('the role is in the shape of the mark, and the intersection is drawn to the other lane', (await page.locator('.pl-introduction').count()) === 1 && (await page.locator('.pl-development').count()) === 1 && (await page.locator('.pl-intersection').count()) === 1 && (await page.locator('.pl-resolution').count()) === 1 && (await page.locator('.pl-event').count()) === 1 && (await page.locator('.pl-cross').count()) === 1);
  eq('gaps are counted where nothing is recorded, between recorded chapters only', { labels: await page.locator('.pl-gap-label').allTextContents(), cell: await cellT('The heist, Ch 6'), before: await cellT('Romance, Ch 1') }, { labels: ['1 ch.', '1 ch.', '2 ch.'], cell: 'The heist, Ch 6: nothing recorded (Ch 6–7: 2 chapters with nothing recorded)', before: 'Romance, Ch 1: nothing recorded' });
  const legendT = await page.getByRole('figure').innerText();
  check('the legend names every role, events, and gaps', ['Introduction', 'Development', 'Intersection', 'Resolution', 'Appears (no development)', 'An event of the thread', 'with nothing recorded'].every((w) => legendT.includes(w)), legendT);
  await page.locator('.pl-name-g[tabindex="0"]').focus();
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const detailT = page.locator('.kn-detail');
  await detailT.getByRole('link', { name: 'Ch 3, scene: The vault' }).waitFor();
  check('the keyboard reaches a chapter of a lane, which shows its scene, to open in the manuscript', (await detailT.getByRole('link', { name: 'Ch 3, scene: The vault' }).getAttribute('href')) === `/project/${pT}/manuscript/${pT}-vault`);
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await page.waitForURL(/select=thread/);
  const sequenceT = page.getByRole('region', { name: 'Thread: The heist' });
  await sequenceT.waitFor();
  const sequenceText = (await sequenceT.innerText()).replace(/\s+/g, ' ');
  check('selecting a thread shows its sequence: introduced and resolved where recorded, with the gaps', sequenceText.includes('Introduced: Ch 1 · Resolved: Ch 8') && sequenceText.includes('Nothing recorded in Ch 6–7 (2 chapters)'), sequenceText);
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const romanceList = page.getByRole('region', { name: 'Thread: Romance' });
  await romanceList.waitFor();
  const romanceText = (await romanceList.innerText()).replace(/\s+/g, ' ');
  check('the list says the same: a thread with no introduction or resolution recorded says so, with its custom status', romanceText.includes('Introduced: not recorded · Resolved: not recorded') && (await romanceList.locator('.thread-status').innerText()).toLowerCase() === 'simmering', romanceText);
  check('looking at the lanes made up nothing: every thread’s beats are as recorded', JSON.stringify((await threadsT()).map((t) => t.beats)) === beatsBefore);
  // From a thread to its scenes, on the scene board.
  await page.getByRole('region', { name: 'Thread: The heist' }).getByRole('link', { name: 'Its chapters and scenes on the scene board →' }).click();
  await page.waitForURL(/\/board\?thread=/);
  const noteT = page.locator('.board-thread-note');
  await noteT.waitFor();
  const columnsT = () => page.locator('.board-col').evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label').replace('Chapter: ', '')}[${[...el.querySelectorAll('.board-card')].map((c) => c.getAttribute('aria-label').replace('Scene: ', '')).join(', ')}]`).join(' '));
  check('the board, filtered by a thread, shows just where it is recorded, and says so', (await noteT.innerText()).startsWith('Showing where “The heist” is recorded: 4 chapters and scenes') && (await columnsT()) === 'One[] Three[The vault] Five[] Eight[]' && (await page.getByText('Moving is off while the board is filtered').count()) === 1, await columnsT());
  check('cards carry their threads, with what is recorded there', (await page.getByRole('list', { name: 'Plot threads in The vault' }).innerText()).replace(/\s+/g, ' ') === 'The heist · develops' && (await page.getByRole('list', { name: 'Plot threads in Five' }).innerText()).replace(/\s+/g, ' ') === 'Romance · 1 event The heist · crosses');
  await page.getByLabel('Show thread').selectOption({ label: 'Romance' });
  await page.locator('.board-thread-note', { hasText: '“Romance”' }).waitFor();
  check('another thread: only the chapter that tells its event', (await columnsT()) === 'Five[]');
  await page.getByRole('button', { name: 'Clear filter' }).first().click();
  await page.locator('.board-thread-note').waitFor({ state: 'detached' });
  await page.getByLabel('Add The tavern to a plot thread').selectOption({ label: 'Romance' });
  await page.getByRole('list', { name: 'Plot threads in The tavern' }).waitFor();
  const romanceBeats = (await threadT('Romance')).beats;
  check('a scene added to a thread from its card only records that the thread appears there: no development is made up', romanceBeats.length === 1 && romanceBeats[0].role === 'appears' && romanceBeats[0].title === '' && romanceBeats[0].nodeId === `${pT}-tavern`, JSON.stringify(romanceBeats));
  await page.getByRole('button', { name: 'Take The tavern out of Romance' }).click();
  await page.getByRole('list', { name: 'Plot threads in The tavern' }).waitFor({ state: 'detached' });
  check('…and that can be taken off again', (await threadT('Romance')).beats.length === 0);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseT}/visualize/plot`);
  await lanesT.waitFor();
  check('mobile: the lanes scroll inside their box; the page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Structure and pacing: lengths, parts, labels and markers, from what is recorded (visualization Prompt 30).
  const pP = await createProject('Paced Book');
  const baseP = `${BASE}/project/${pP}`;
  await page.goto(`${baseP}/visualize/structure`);
  await page.getByText('No chapters yet. Add chapters in the Organizer').waitFor();
  check('an empty manuscript has nothing to chart, and says where chapters come from', (await page.locator('.ps-chart').count()) === 0);
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['chapters', 'timelineEvents'], 'readwrite');
      const id = (x) => `${projectId}-${x}`;
      const put = (key, kind, parent, title, order, wordCount) => tx.objectStore('chapters').put({ id: id(key), projectId, parentId: parent && id(parent), kind, title, order, summary: '', notes: '', status: 'idea', wordCount, charCount: wordCount * 5, createdAt: at, updatedAt: at });
      put('act1', 'act', null, 'Act I', 0, 0);
      put('act2', 'act', null, 'Act II', 1, 0);
      put('ch1', 'chapter', 'act1', 'Arrival', 0, 1000);
      put('ch2', 'chapter', 'act1', 'The inn', 1, 0);
      put('talk', 'scene', 'ch2', 'Talk', 0, 300);
      put('quiet', 'scene', 'ch2', 'Quiet', 1, 0);
      put('ch3', 'chapter', 'act2', 'Ambush', 0, 2000);
      put('ch4', 'chapter', null, 'Epilogue', 2, 0);
      tx.objectStore('timelineEvents').put({ id: id('ambush'), projectId, name: 'The ambush', description: '', when: { precision: 'unknown' }, duration: null, importance: 'climax', locationId: null, characters: [], entryIds: [], nodeIds: [id('ch3')], afterId: null, createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pP, Date.now()]);
  const rowsP = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pP, table]);
  await page.goto(`${baseP}/visualize/structure`);
  const chartP = page.getByRole('group', { name: /^Length chart/ });
  await chartP.waitFor();
  const factsP = () => page.locator('.ps-facts').innerText();
  check('what the charts are is said plainly: recorded data, not a measure of quality, and no formula assumed', (await page.locator('.ps-about').innerText()).includes('They do not measure quality') && (await page.locator('.ps-about').innerText()).includes('no storytelling formula is assumed'));
  check('the facts, as facts: an unwritten chapter is unwritten, not short', (await factsP()) === '4 chapters · 3,300 words · average 1,100 and median 1,000 words, over the 3 chapters with words · longest Ch 3: Ambush (2,000), shortest Ch 2: The inn (300) · 1 chapter has no words yet · 0 of 4 labelled', await factsP());
  const barP = (start) => page.locator(`.ps-bar-g[aria-label^="${start}"]`).getAttribute('aria-label');
  check('a bar for each chapter, the acts behind them, and an empty bar for the chapter not written yet', (await page.locator('.ps-bar-g').count()) === 4 && (await page.locator('.ps-band').count()) === 2 && (await page.locator('.ps-bar.empty').count()) === 1 && (await barP('Ch 4')) === 'Ch 4: Epilogue: no words yet' && (await barP('Ch 1')) === 'Ch 1: Arrival: 1,000 words; in Act I');
  check('with no labels yet, the words-by-label chart says how to add them', await page.getByText('No chapter or scene has a label yet.').isVisible());
  // Labels, given in the chapter's and scene's own plan, and on an event.
  await page.goto(`${baseP}/organizer`);
  await page.locator('.outline-row', { hasText: 'Arrival' }).click();
  await page.locator('.organizer-details').getByRole('button', { name: 'Label this chapter Action' }).click();
  await settles(async () => (await rowsP('chapterPlans')).some((p) => p.id === `${pP}-ch1` && p.labels?.[0] === 'Action'));
  await page.locator('.outline-row', { hasText: 'Talk' }).click();
  const talkLabels = page.locator('.organizer-details').getByRole('group', { name: 'Labels on this scene' });
  await talkLabels.getByLabel('A label for this scene').fill('banter ');
  await talkLabels.getByLabel('A label for this scene').press('Enter');
  await talkLabels.getByRole('button', { name: 'Label this scene Dialogue' }).click();
  await settles(async () => (await rowsP('chapterPlans')).find((p) => p.id === `${pP}-talk`)?.labels?.length === 2);
  eq('labels are the author’s own, kept on the scene’s plan as written (trimmed)', (await rowsP('chapterPlans')).find((p) => p.id === `${pP}-talk`).labels, ['banter', 'Dialogue']);
  await page.goto(`${baseP}/timeline?event=${pP}-ambush`);
  await page.getByRole('button', { name: 'Label this event Mystery clue' }).click();
  await settles(async () => (await rowsP('timelineEvents'))[0].labels?.[0] === 'Mystery clue');
  check('an event can carry labels too', (await rowsP('timelineEvents'))[0].labels.join() === 'Mystery clue');
  const shapeBeforeP = JSON.stringify((await rowsP('chapters')).map(({ id, parentId, order, wordCount }) => [id, parentId, order, wordCount]).sort());
  await page.goto(`${baseP}/visualize/structure`);
  await chartP.waitFor();
  const gridP = page.getByRole('table', { name: 'Words by label for each chapter' });
  await gridP.waitFor();
  eq('words by label, chapter by chapter: each label’s words where they are, unlabelled words apart', await gridP.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.children].map((c) => c.textContent.trim()).join('|'))), ['Action|1,000||||1,000', 'Dialogue||300|||300', 'banter||300|||300', 'No label|||2,000||2,000']);
  check('the facts now count what is labelled', (await factsP()).endsWith('· 2 of 4 labelled'), await factsP());
  await page.getByLabel('Pick out a label').selectOption('Dialogue');
  await page.waitForURL(/slabel=Dialogue/);
  await page.locator('.ps-bar-g.dim').nth(2).waitFor();
  check('picking out a label dims the bars without it, and counts those with it', (await page.locator('.ps-bar-g.dim').count()) === 3 && (await factsP()).endsWith('· 1 with “Dialogue”'));
  await page.getByRole('group', { name: 'Bars for' }).getByRole('button', { name: 'Scenes' }).click();
  await page.waitForURL(/sgrain=scenes/);
  await page.locator('.ps-bar-g').nth(4).waitFor();
  eq('by scene: each scene a bar, a chapter without scenes as itself', await page.locator('.ps-x').allTextContents(), ['1', '2.1', '2.2', '3', '4']);
  await page.getByLabel('Part of the book').selectOption({ label: 'Act II' });
  await page.waitForURL(/spart=/);
  await page.locator('.ps-bar-g').nth(1).waitFor({ state: 'detached' });
  check('kept to one act', (await page.locator('.ps-bar-g').count()) === 1 && (await barP('Ch 3')).startsWith('Ch 3: Ambush: 2,000 words'));
  await page.goto(`${baseP}/visualize/structure`);
  await chartP.waitFor();
  // Structural markers: any the author names, where they say.
  const markerForm = page.getByRole('form', { name: 'Add a structural marker' });
  const addMarker = async (kind, more = {}) => {
    await markerForm.getByLabel('Kind of marker').fill(kind);
    if (more.title) await markerForm.getByLabel('Marker title').fill(more.title);
    if (more.node) await markerForm.getByLabel('Marker chapter or scene').selectOption(`${pP}-${more.node}`);
    if (more.event) await markerForm.getByLabel('Marker event').selectOption(`${pP}-${more.event}`);
    await markerForm.getByRole('button', { name: 'Add marker' }).click();
    await page.locator('.ps-markers li', { hasText: kind }).waitFor();
  };
  await addMarker('Turning point', { title: 'The road turns', node: 'talk' });
  await addMarker('Climax', { event: 'ambush' });
  await addMarker('The prophecy is spoken');
  eq('markers in reading order, each where the author put it; one with no place says so', await page.locator('.ps-markers li').evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').replace('✕', '').trim())), ['Turning point — The road turns · Ch 2, scene: Talk', 'Climax · Ch 3: Ambush (where “The ambush” is told)', 'The prophecy is spoken · Not placed']);
  check('markers show as flags on the chart, and on the bars they fall on', (await page.locator('.ps-marker').count()) === 2 && (await barP('Ch 2')).endsWith('markers: Turning point') && (await barP('Ch 3')).endsWith('markers: Climax'));
  await page.getByRole('button', { name: 'Remove the marker The prophecy is spoken' }).click();
  await page.locator('.ps-markers li', { hasText: 'The prophecy' }).waitFor({ state: 'detached' });
  check('a marker can be taken away; none is required', (await rowsP('structureMarkers')).length === 2);
  await page.locator('.ps-bar-g[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForURL(/select=node/);
  check('the keyboard moves between bars and selects a chapter', new URL(page.url()).searchParams.get('select') === `node:${pP}-ch2`);
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const lengthsTable = page.getByRole('table', { name: 'Lengths in reading order' });
  await lengthsTable.waitFor();
  eq('the list gives the same as text', await lengthsTable.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.children].map((c) => c.textContent.trim()).join('|'))), ['Ch 1: Arrival|Act I|1,000|Action|—', 'Ch 2: The inn|Act I|300|Dialogue, banter|Turning point', 'Ch 3: Ambush|Act II|2,000|—|Climax', 'Ch 4: Epilogue|—|No words yet|—|—']);
  check('charting and labelling changed no chapter’s place or words', JSON.stringify((await rowsP('chapters')).map(({ id, parentId, order, wordCount }) => [id, parentId, order, wordCount]).sort()) === shapeBeforeP);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseP}/visualize/structure`);
  await chartP.waitFor();
  check('mobile: the charts scroll inside their boxes; the page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Character appearances: characters against chapters, from recorded associations only (visualization Prompt 31).
  const pA = await createProject('Cast Book');
  const baseA = `${BASE}/project/${pA}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'chapters', 'chapterPlans', 'timelineEvents', 'plotThreads'], 'readwrite');
      const id = (x) => `${projectId}-${x}`;
      for (const [key, name, category] of [['mira', 'Mira', 'character'], ['kai', 'Kai', 'character'], ['bren', 'Bren', 'character'], ['keep', 'The Keep', 'location']]) tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      const put = (key, kind, parent, title, order, more = {}) => tx.objectStore('chapters').put({ id: id(key), projectId, parentId: parent && id(parent), kind, title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at, ...more });
      put('ch1', 'chapter', null, 'Arrival', 0);
      put('ch2', 'chapter', null, 'The inn', 1);
      put('talk', 'scene', 'ch2', 'Talk', 0);
      put('quiet', 'scene', 'ch2', 'Quiet', 1);
      put('ch3', 'chapter', null, 'The road', 2, { mentions: [id('mira'), id('keep')] });
      put('ch4', 'chapter', null, 'The duel', 3, { status: 'drafting' });
      tx.objectStore('chapterPlans').put({ id: id('ch1'), projectId, objective: '', beats: [], entityIds: [id('kai')], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', updatedAt: at });
      tx.objectStore('timelineEvents').put({ id: id('duel'), projectId, name: 'The duel', description: '', when: { precision: 'unknown' }, duration: null, importance: 'major', locationId: id('keep'), characters: [{ id: id('kai'), age: null }], entryIds: [], nodeIds: [id('ch4')], afterId: null, createdAt: at, updatedAt: at });
      tx.objectStore('plotThreads').put({ id: id('quest'), projectId, title: 'The quest', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [{ id: id('q1'), nodeId: id('ch1'), title: 'Setting out', note: '', createdAt: at }, { id: id('q2'), nodeId: id('ch3'), title: 'On the road', note: '', createdAt: at }], notes: '', muted: false, createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pA, Date.now()]);
  const planA = (key) => page.evaluate((planId) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('chapterPlans').objectStore('chapterPlans').get(planId);
      req.onsuccess = () => { open.result.close(); resolve(req.result ?? null); };
    };
  }), `${pA}-${key}`);
  // The manual workflow: who appears, recorded in each chapter's or scene's plan.
  await page.goto(`${baseA}/organizer`);
  await page.locator('.outline-row', { hasText: 'Arrival' }).click();
  await page.locator('.organizer-details').getByLabel('Add a character who appears').selectOption({ label: 'Mira' });
  await settles(async () => (await planA('ch1'))?.appearIds?.length === 1);
  await page.locator('.outline-row', { hasText: 'Talk' }).click();
  await page.locator('.organizer-details').getByLabel('Add a character who is mentioned').selectOption({ label: 'Mira' });
  await settles(async () => (await planA('talk'))?.mentionIds?.length === 1);
  check('who appears, and who is only mentioned, is recorded by the author in the plan', (await planA('ch1')).appearIds[0] === `${pA}-mira` && (await planA('ch1')).entityIds[0] === `${pA}-kai` && (await planA('talk')).mentionIds[0] === `${pA}-mira`);
  await page.locator('.outline-row', { hasText: 'The road' }).click();
  await page.locator('.organizer-details').getByRole('button', { name: 'Record Mira as appearing in this chapter' }).waitFor();
  check('a character linked in the text is offered to record, not recorded for the author', (await page.locator('.organizer-details').getByRole('button', { name: 'Record Mira as mentioned in this chapter' }).count()) === 1 && (await planA('ch3')) === null, JSON.stringify(await planA('ch3')));
  // The matrix.
  await page.goto(`${baseA}/visualize/appearances`);
  const matrixA = page.getByRole('table', { name: /^Characters by chapter/ });
  await matrixA.waitFor();
  const statesA = () => matrixA.locator('tbody tr').evaluateAll((rows) => rows.map((r) => `${r.querySelector('th').textContent}: ${[...r.querySelectorAll('td')].map((td) => ({ 'ap-appears': 'A', 'ap-mentioned': 'M', 'ap-other': 'o', 'ap-none': '.' })[td.classList[0]]).join('')}`));
  const headsA = () => matrixA.locator('thead th').evaluateAll((ths) => ths.slice(1).map((th) => th.textContent));
  const factsA = () => page.locator('.ap-facts').innerText();
  check('it says plainly that a blank cell is nothing recorded, not absence, and that no text is read', (await page.locator('.ap-about').innerText()).includes('A blank cell means nothing is recorded, not that the character is absent.') && (await page.locator('.ap-about').innerText()).includes('Nothing is read from the text itself.'));
  eq('the author’s records first, other records apart, nothing invented: Bren, with nothing recorded, is left out and counted', { states: await statesA(), facts: await factsA() }, { states: ['Kai: o..o', 'Mira: AMo.'], facts: '2 characters × 4 chapters · 5 cells with a record · 1 character with nothing recorded here not shown' });
  check('each cell says what is recorded and where', (await matrixA.getByRole('button', { name: /^Mira, Ch 2/ }).getAttribute('aria-label')) === 'Mira, Ch 2: The inn: mentioned (Mentioned, not on the page (your appearance record) (in “Talk”))' && (await matrixA.getByRole('button', { name: /^Kai, Ch 4/ }).getAttribute('aria-label')) === 'Kai, Ch 4: The duel: other records (Takes part in “The duel”, told here)');
  await page.getByLabel('Show characters with nothing recorded here').check();
  await page.waitForURL(/aall=1/);
  await matrixA.locator('tbody tr').nth(2).waitFor();
  check('asked for, everyone is shown, and nothing recorded reads as just that', (await statesA())[0] === 'Bren: ....' && (await matrixA.getByRole('button', { name: /^Bren, Ch 1/ }).getAttribute('aria-label')) === 'Bren, Ch 1: Arrival: not recorded');
  await page.getByLabel('Show characters with nothing recorded here').uncheck();
  await page.waitForURL((u) => !u.searchParams.has('aall'));
  // Filters: a chapter range, a plot thread, a place, a status, a character, a name.
  await page.getByLabel('From chapter').selectOption({ label: '2. The inn' });
  await page.getByLabel('To chapter').selectOption({ label: '3. The road' });
  await page.waitForURL(/to=/);
  await settles(async () => (await headsA()).join() === '2,3');
  check('a range of chapters', (await headsA()).join() === '2,3' && (await statesA()).join('|') === 'Mira: Mo', (await statesA()).join('|'));
  await page.getByLabel('From chapter').selectOption({ label: 'The first' });
  await page.getByLabel('To chapter').selectOption({ label: 'The last' });
  await page.getByLabel('Only where a plot thread is').selectOption({ label: 'The quest' });
  await settles(async () => (await headsA()).join() === '1,3');
  check('only where a plot thread is recorded', (await headsA()).join() === '1,3');
  await page.getByLabel('Only where a plot thread is').selectOption({ label: 'Any' });
  await page.getByLabel('Only where a place is').selectOption({ label: 'The Keep' });
  await settles(async () => (await headsA()).join() === '3,4');
  check('only where a place is recorded: linked in the text, or where an event told there happens', (await headsA()).join() === '3,4');
  await page.getByLabel('Only where a place is').selectOption({ label: 'Any' });
  await page.getByLabel('Chapter status').selectOption('drafting');
  await settles(async () => (await headsA()).join() === '4');
  check('only chapters with a status', (await headsA()).join() === '4' && (await statesA()).join('|') === 'Kai: o');
  await page.getByLabel('Chapter status').selectOption('published');
  await page.getByText('No chapters match these filters.').waitFor();
  await page.locator('.appearances-view').getByRole('button', { name: 'Clear filters' }).click();
  await matrixA.waitFor();
  await page.getByLabel('Involving character').selectOption({ label: 'Mira' });
  await settles(async () => (await statesA()).length === 1);
  check('one character, through the page’s own character filter', (await statesA()).join() === 'Mira: AMo.');
  await page.getByLabel('Involving character').selectOption({ label: 'Any character' });
  await page.getByLabel('Search by name').fill('ka');
  await settles(async () => (await statesA()).join() === 'Kai: o..o');
  check('by name', (await statesA()).join() === 'Kai: o..o');
  await page.getByLabel('Search by name').fill('');
  await page.getByRole('group', { name: 'Columns for' }).getByRole('button', { name: 'Scenes' }).click();
  await settles(async () => (await headsA()).join() === '1,2.1,2.2,3,4');
  check('by scene: each scene its own column', (await headsA()).join() === '1,2.1,2.2,3,4' && (await statesA()).includes('Mira: AM.o.'));
  await page.getByRole('group', { name: 'Columns for' }).getByRole('button', { name: 'Chapters' }).click();
  await settles(async () => (await headsA()).join() === '1,2,3,4');
  // Navigation to an intersection: by keyboard, with an address that can be returned to.
  await matrixA.locator('td button[tabindex="0"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForURL(/acell=/);
  const detailA = page.getByRole('region', { name: 'Selected: Mira in Ch 3: The road' });
  await detailA.waitFor();
  check('the keyboard reaches an intersection, which says what is recorded there', (await detailA.innerText()).includes('Other records.') && (await detailA.innerText()).includes('Linked in the text'));
  await page.reload();
  await detailA.waitFor();
  check('the chosen intersection is in the address: a reload, or a shared link, opens it again', (await detailA.getByRole('link', { name: 'Open Ch 3: The road in the manuscript →' }).getAttribute('href')) === `/project/${pA}/manuscript/${pA}-ch3` && (await detailA.getByRole('link', { name: 'Open Mira →' }).getAttribute('href')) === `/project/${pA}/characters/${pA}-mira`);
  await detailA.getByRole('button', { name: 'Record: appears here' }).click();
  await settles(async () => (await planA('ch3'))?.appearIds?.[0] === `${pA}-mira`);
  await detailA.getByText('Appears.').waitFor();
  check('recording from the intersection writes the chapter’s plan, and the cell follows', (await statesA()).includes('Mira: AMA.'));
  await detailA.getByRole('button', { name: 'Remove my record' }).click();
  await detailA.getByText('Other records.').waitFor();
  check('…and the record can be taken back, leaving the other records as they were', (await planA('ch3')).appearIds.length === 0 && (await statesA()).includes('Mira: AMo.'));
  await detailA.getByRole('link', { name: 'Open Ch 3: The road in the manuscript →' }).click();
  await page.waitForURL(new RegExp(`/manuscript/${pA}-ch3$`));
  check('…and opens the chapter in the manuscript', true);
  await page.goBack();
  await matrixA.waitFor();
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const listA = page.getByRole('list', { name: 'Where each character is recorded' });
  await listA.waitFor();
  const miraList = (await listA.locator('li', { hasText: 'Mira' }).innerText()).replace(/\s+/g, ' ');
  check('the list gives the same, character by character, with nothing recorded said as such', miraList.includes('Appears: Ch 1: Arrival') && miraList.includes('Mentioned: Ch 2: The inn') && miraList.includes('Other records: Ch 3: The road') && miraList.includes('Nothing recorded: Ch 4: The duel'), miraList);
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Matrix' }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseA}/visualize/appearances`);
  await matrixA.waitFor();
  check('mobile: the matrix scrolls inside its box; the page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // The knowledge graph: every record and every connection, typed, from the shared records (visualization Prompt 32).
  const pG = await createProject('Graph Book');
  const baseG = `${BASE}/project/${pG}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreSchemas', 'loreLinks', 'chapters', 'timelineEvents', 'plotThreads', 'systems', 'systemSheets'], 'readwrite');
      const id = (x) => `${projectId}-${x}`;
      tx.objectStore('loreSchemas').put({ id: id('species'), projectId, key: 'species', name: 'Species & Races', singular: 'Species', color: '#a3622b', builtin: false, order: 20, fields: [], createdAt: at, updatedAt: at });
      for (const [key, name, category] of [['mira', 'Mira', 'character'], ['orrin', 'Orrin', 'character'], ['elf', 'Elves', 'species'], ['blade', 'The Ember Blade', 'item'], ['keep', 'The Keep', 'location'], ['prophecy', 'The prophecy', 'lore'], ['hermit', 'The Hermit', 'character']]) tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      const link = (key, from, to, type, more = {}) => tx.objectStore('loreLinks').put({ id: id(key), projectId, fromId: id(from), toId: id(to), fromLabel: '', toLabel: '', type, createdAt: at, ...more });
      link('l1', 'mira', 'blade', 'owns');
      link('l2', 'blade', 'orrin', 'created-by');
      link('l3', 'orrin', 'prophecy', 'knows-about');
      link('l4', 'mira', 'elf', 'member-of');
      link('l5', 'siege', 'exile', 'caused', { fromType: 'event', toType: 'event' });
      link('l6', 'siege', 'exile', 'set off', { fromType: 'event', toType: 'event' });
      const put = (key, kind, parent, title, order, more = {}) => tx.objectStore('chapters').put({ id: id(key), projectId, parentId: parent && id(parent), kind, title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: at, updatedAt: at, ...more });
      put('act', 'act', null, 'Act I', 0);
      put('c1', 'chapter', 'act', 'Chapter 1', 0);
      put('walls', 'scene', 'c1', 'Walls', 0);
      put('c2', 'chapter', 'act', 'Chapter 2', 1, { mentions: [id('mira')] });
      const event = (key, name, more = {}) => tx.objectStore('timelineEvents').put({ id: id(key), projectId, name, description: '', when: { precision: 'unknown' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at, ...more });
      event('siege', 'The siege', { locationId: id('keep'), characters: [{ id: id('mira'), age: null }], nodeIds: [id('walls')] });
      event('exile', 'The exile');
      tx.objectStore('plotThreads').put({ id: id('quest'), projectId, title: 'The quest', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [id('mira')], locationIds: [], targetNodeId: null, targetNote: '', beats: [{ id: id('b1'), nodeId: id('c2'), title: 'Setting out', note: '', createdAt: at }], notes: '', muted: false, createdAt: at, updatedAt: at });
      tx.objectStore('systems').put({ id: id('magic'), projectId, name: 'Magic', description: '', variables: [], tracks: [], ranks: [], groups: [{ id: 'g', name: 'Spells', single: false }], items: [{ id: 'spark', groupId: 'g', name: 'Spark', description: '', parentId: null, rankId: null, requires: '' }, { id: 'flame', groupId: 'g', name: 'Flame', description: '', parentId: 'spark', rankId: null, requires: '' }], matrices: [], createdAt: at, updatedAt: at });
      tx.objectStore('systemSheets').put({ id: id('sheet'), projectId, systemId: id('magic'), entryId: id('mira'), values: {}, progress: {}, itemIds: ['spark'], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pG, Date.now()]);
  const countG = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId).length); };
    };
  }), [pG, table]);
  const tablesBeforeG = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => { const names = [...open.result.objectStoreNames]; open.result.close(); resolve(names.join()); };
  }));
  await page.goto(`${baseG}/visualize/graph`);
  const graphG = page.getByRole('group', { name: /^Knowledge graph of/ });
  await graphG.waitFor();
  const statusG = () => page.locator('.kg-status').innerText();
  check('every record a node and every connection an edge; a record with no connection is counted, not drawn', (await statusG()) === 'Showing 15 of 16 records and 17 of 17 connections.' && (await page.locator('.kg-node').count()) === 15 && (await page.locator('.kg-line').count()) === 16, await statusG());
  const legendsG = (await page.locator('.kg-legends').innerText()).replace(/\s+/g, ' ');
  check('the legends name each kind of record, the author’s own category among them, and each kind of connection', ['Characters', 'Species & Races', 'Items', 'Locations', 'Events', 'Chapters', 'Scenes', 'Plot threads', 'Abilities', 'Connections you recorded', 'Timeline', 'Manuscript', 'Plot threads', 'Abilities'].every((w) => legendsG.includes(w)), legendsG);
  check('typed connections read as recorded: owns, created by, knows about, caused, and the author’s own', (await page.locator('.kg-line[aria-label^="Mira owns The Ember Blade"]').count()) === 1 && (await page.locator('.kg-line[aria-label^="The Ember Blade created by Orrin"]').count()) === 1 && (await page.locator('.kg-line[aria-label^="Orrin knows about The prophecy"]').count()) === 1 && (await page.locator('.kg-line[aria-label="The siege caused The exile (from the other side: caused by); The siege set off The exile"]').count()) === 1);
  await page.locator('.kg-line[aria-label^="The siege caused"]').dispatchEvent('click');
  const pairG = page.getByRole('region', { name: 'Connections between The exile and The siege' });
  await pairG.waitFor();
  check('a line opens the connections it stands for, each saying where it is kept', (await pairG.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ') === 'The siege caused The exile (from the other side: caused by) · Caused, kept in a connection you recorded | The siege set off The exile · set off, kept in a connection you recorded', (await pairG.locator('li').allInnerTexts()).join(' | '));
  // Keyboard selection, the detail panel, focus.
  await page.locator('.kg-node[tabindex="0"]').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForURL(/select=entry/);
  check('the keyboard moves between records and selects one', new URL(page.url()).searchParams.get('select') === `entry:${pG}-mira`);
  await detailV('Mira').waitFor();
  await detailV('Mira').getByRole('button', { name: 'Focus the graph on this' }).click();
  await page.waitForURL(/gfocus=/);
  await page.locator('.kg-status', { hasText: 'around Mira' }).waitFor();
  check('focusing shows one record’s neighbourhood', (await statusG()) === 'Showing 7 of 16 records and 7 of 17 connections, around Mira.', await statusG());
  await page.getByLabel('Steps out from the focus').selectOption('2');
  await page.locator('.kg-status', { hasText: /^Showing 1[0-9] of 16/ }).waitFor();
  check('…and two steps out', Number((await statusG()).match(/^Showing (\d+)/)[1]) > 7, await statusG());
  await page.getByRole('button', { name: 'Show the whole graph' }).click();
  await page.locator('.kg-status', { hasText: 'Showing 15 of 16 records' }).waitFor();
  // How two records are connected.
  await page.getByLabel('A record to connect Mira to').selectOption({ label: 'Orrin (Characters)' });
  const chainG = page.getByRole('list', { name: 'The chain of connections' });
  await chainG.waitFor();
  eq('how two records are connected: the shortest chain, drawn and listed', { chain: await chainG.locator('li').allInnerTexts(), lit: await page.locator('.kg-line.on-path').count() }, { chain: ['Mira owns The Ember Blade (from the other side: owned by)', 'The Ember Blade created by Orrin (from the other side: created)'], lit: 2 });
  await page.getByLabel('A record to connect Mira to').selectOption({ label: 'The Hermit (Characters)' });
  await page.getByText('Not connected within eight steps').waitFor();
  check('…and says when they are not connected at all', true);
  // Layers and filters.
  await page.locator('.kg-layers > summary').click();
  for (const layer of ['Chapters', 'Scenes', 'Volumes, acts and arcs']) await page.getByRole('group', { name: 'Records', exact: true }).getByRole('checkbox', { name: layer }).uncheck();
  await page.waitForURL(/ghide=/);
  await page.locator('.kg-status', { hasText: 'Showing 11 of 16 records' }).waitFor();
  check('hiding kinds of record: the manuscript’s chapters, scenes and acts go, with their connections', (await statusG()).startsWith('Showing 11 of 16 records and 11 of 17 connections'), await statusG());
  await page.getByRole('group', { name: 'Connections', exact: true }).getByLabel('Owns').uncheck();
  await page.waitForURL(/gedges=/);
  await page.locator('.kg-line[aria-label^="Mira owns"]').waitFor({ state: 'detached' });
  check('hiding a kind of connection', (await page.locator('.kg-line[aria-label^="Mira owns"]').count()) === 0 && (await statusG()).includes('and 10 of 17 connections'), await statusG());
  await page.getByRole('group', { name: 'Connections', exact: true }).getByLabel('Owns').check();
  for (const layer of ['Chapters', 'Scenes', 'Volumes, acts and arcs']) await page.getByRole('group', { name: 'Records', exact: true }).getByRole('checkbox', { name: layer }).check();
  await page.locator('.kg-status', { hasText: 'Showing 15 of 16 records' }).waitFor();
  await page.getByLabel('Search by name').fill('blade');
  await page.locator('.kg-status', { hasText: 'Showing 3 of 16' }).waitFor();
  check('searching keeps what matches and what it is connected to', (await page.locator('.kg-node').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label').split(',')[0]).sort())).join() === 'Mira,Orrin,The Ember Blade');
  await page.getByLabel('Search by name').fill('');
  await page.getByLabel('Show records with no connection shown').check();
  await page.locator('.kg-node[aria-label^="The Hermit"]').waitFor();
  check('records with no connection can be shown too', (await statusG()).startsWith('Showing 16 of 16 records'));
  await page.getByLabel('Show records with no connection shown').uncheck();
  // The list.
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const tableG = page.getByRole('table', { name: 'Connections shown' });
  await tableG.waitFor();
  const rowsG = await tableG.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.children].map((c) => c.textContent.trim()).join('|')));
  check('the list gives every connection shown, typed, with where it is kept', rowsG.length === 17 && rowsG.includes('Mira|Owns →|The Ember Blade|a connection you recorded') && rowsG.includes('The siege|Takes place at →|The Keep|a timeline event') && rowsG.includes('Mira|Has · Has the ability →|Spark|a system sheet'), rowsG.join('\n      '));
  check('nothing is stored for the graph: no new table, and the records are as they were', (await page.evaluate(() => new Promise((resolve) => { const open = indexedDB.open('novel-builder'); open.onsuccess = () => { const names = [...open.result.objectStoreNames]; open.result.close(); resolve(names.join()); }; }))) === tablesBeforeG && (await countG('loreLinks')) === 6 && (await countG('loreEntries')) === 7);
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Graph' }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseG}/visualize/graph`);
  await graphG.waitFor();
  check('mobile: the graph and its layers fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // A crowded graph: limits that say so, folding, restoring, paths (visualization Prompt 33).
  const pC = await createProject('Crowded World');
  const baseC = `${BASE}/project/${pC}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks'], 'readwrite');
      const id = (x) => `${projectId}-${x}`;
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      for (let i = 0; i < 300; i++) entry(`c${i}`, `Person ${String(i).padStart(3, '0')}`, 'character');
      for (let i = 0; i < 100; i++) entry(`l${i}`, `Place ${String(i).padStart(3, '0')}`, 'location');
      entry('a', 'Anchor A', 'character');
      entry('b', 'Anchor B', 'character');
      entry('relic', 'The Relic', 'item');
      const link = (key, from, to, type) => tx.objectStore('loreLinks').put({ id: id(key), projectId, fromId: id(from), toId: id(to), fromLabel: '', toLabel: '', type, createdAt: at });
      for (let i = 0; i < 1000; i++) link(`k${i}`, `c${i % 300}`, i % 3 === 0 ? `l${i % 100}` : `c${(i * 7 + 3) % 300}`, ['located-in', 'knows-about', 'member-of'][i % 3]);
      link('own', 'a', 'relic', 'owns');
      link('made', 'relic', 'b', 'created-by');
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pC, Date.now()]);
  const crowdStarted = Date.now();
  await page.goto(`${baseC}/visualize/graph`);
  const graphC = page.getByRole('group', { name: /^Knowledge graph of/ });
  await graphC.waitFor();
  const crowdTook = Date.now() - crowdStarted;
  const partialC = page.getByRole('region', { name: 'What this view leaves out' });
  const statusC = () => page.locator('.kg-status').innerText();
  check('a crowded graph draws the 200 most connected, quickly, and says plainly it is part of the story', (await page.locator('.kg-node').count()) === 200 && /^Showing 200 of 403 records and [\d,]+ of 1,002 connections\.$/.test(await statusC()) && (await partialC.innerText()).includes('This is part of the story, not all of it.') && (await partialC.innerText()).includes('Only the 200 most connected of 403 records and groups are drawn') && crowdTook < 20000, `${await statusC()} in ${crowdTook} ms`);
  await partialC.getByRole('button', { name: 'Draw 100 more' }).click();
  await page.waitForURL(/glimit=300/);
  await page.locator('.kg-node').nth(299).waitFor();
  check('progressive expansion: 100 more at a time', (await page.locator('.kg-node').count()) === 300 && (await statusC()).startsWith('Showing 300 of 403'), await statusC());
  // Folding a kind of record together.
  await page.locator('.kg-layers > summary').click();
  await page.getByRole('button', { name: 'Fold together Locations' }).click();
  await page.waitForURL(/gcollapse=/);
  const groupNode = page.locator('.kg-node.group');
  await groupNode.waitFor();
  check('a kind of record folds into one node, its connections drawn on it, and the view says so', (await groupNode.getAttribute('aria-label')).startsWith('100 locations, folded together') && (await statusC()).includes('1 group folded together') && (await partialC.innerText()).includes('Folded together, one node each: Locations.'), await statusC());
  await groupNode.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.searchParams.has('gcollapse'));
  await groupNode.waitFor({ state: 'detached' });
  check('…and opens again from the group itself', (await page.getByRole('button', { name: 'Fold together Locations' }).getAttribute('aria-pressed')) === 'false');
  // A path through what is hidden, found in the full story, with the way back.
  await page.getByRole('group', { name: 'Connections', exact: true }).getByLabel('Owns').uncheck();
  await page.waitForURL(/gedges=/);
  await page.goto(`${baseC}/visualize/graph?${new URL(page.url()).searchParams.toString()}&select=entry:${pC}-a&gpath=entry:${pC}-b`);
  const pathC = page.getByRole('region', { name: 'How they are connected' });
  await pathC.getByText('Connected only through what this view hides (2 steps).').waitFor();
  check('a path that exists only through hidden connections is reported, not denied', (await partialC.innerText()).includes('Hidden kinds of connection: Owns.'));
  await pathC.getByRole('button', { name: 'Restore the full view to see it' }).click();
  const chainC = pathC.getByRole('list', { name: 'The chain of connections' });
  await chainC.waitFor();
  eq('…and restoring shows it, lit on the graph, even though those records are not among the most connected', { chain: await chainC.locator('li').allInnerTexts(), lit: await page.locator('.kg-line.on-path').count(), drawn: await page.locator('.kg-node[aria-label^="Anchor A"], .kg-node[aria-label^="The Relic"], .kg-node[aria-label^="Anchor B"]').count() }, { chain: ['Anchor A owns The Relic (from the other side: owned by)', 'The Relic created by Anchor B (from the other side: created)'], lit: 2, drawn: 3 });
  check('restoring the full view clears every setting but the selection and the path', ['gedges', 'glimit', 'gcollapse', 'ghide', 'gfocus'].every((k) => !new URL(page.url()).searchParams.has(k)) && new URL(page.url()).searchParams.get('gpath') === `entry:${pC}-b`);
  // Choosing a path target on the graph itself, with the keyboard.
  await page.goto(`${baseC}/visualize/graph?select=entry:${pC}-a`);
  await graphC.waitFor();
  await page.locator('.kg-node[aria-label^="Anchor A"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('p');
  await page.waitForURL(/gpath=/);
  const pathPicked = await settles(async () => (await pathC.getByLabel('A record to connect Anchor A to').inputValue()) === new URL(page.url()).searchParams.get('gpath'));
  check('P on a record shows the path to it from the one selected', pathPicked && new URL(page.url()).searchParams.get('gpath') !== `entry:${pC}-a`);
  // Focus, and a full restore from several settings at once.
  await page.goto(`${baseC}/visualize/graph?gfocus=entry:${pC}-c1&gdepth=2&ghide=entry:location&gfold=1`);
  await graphC.waitFor();
  const partialText = await partialC.innerText();
  check('every setting that leaves part of the story out is listed, each with its own way back', ['Hidden kinds of record: Locations.', 'Only what is within two steps of Person 001.', 'Scenes are folded into their chapters'].every((w) => partialText.includes(w)) && (await partialC.getByRole('button', { name: 'Drop the focus' }).count()) === 1, partialText);
  await partialC.getByRole('button', { name: 'Restore the full view' }).click();
  await page.waitForURL((u) => !u.searchParams.has('gfocus') && !u.searchParams.has('ghide') && !u.searchParams.has('gfold'));
  await page.locator('.kg-status', { hasText: /^Showing 200 of 403/ }).waitFor();
  check('restore the full view: back to the whole story (drawn 200 at a time, as it says)', (await partialC.innerText()).includes('Only the 200 most connected') && !(await partialC.innerText()).includes('Hidden kinds'));
  await page.goto(`${baseV}/visualize/timeline`);

  // Cross-references both ways, connection statuses, and the record check (visualization Prompt 34).
  const pL = await createProject('Linked Book');
  const baseL = `${BASE}/project/${pL}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'chapters', 'chapterContents', 'chapterPlans', 'timelineEvents', 'plotThreads', 'structureMarkers'], 'readwrite');
      const id = (x) => `${projectId}-${x}`;
      const entry = (key, name, category, more = {}) => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at, ...more });
      entry('mira', 'Mira', 'character');
      entry('orrin', 'Orrin', 'character');
      entry('mira2', 'mira', 'character');
      entry('keep', 'The Keep', 'location');
      entry('keep2', 'Keep', 'location');
      entry('blade', 'The Ember Blade', 'item', { fields: [{ id: 'owner', key: 'Owner', value: 'orrin', type: 'reference' }] });
      const link = (key, from, to, type, more = {}) => tx.objectStore('loreLinks').put({ id: id(key), projectId, fromId: id(from), toId: id(to), fromLabel: '', toLabel: '', type, createdAt: at, ...more });
      link('owns', 'orrin', 'keep', 'owns', { canon: 'provisional' });
      link('knows', 'mira', 'keep', 'knows-about', { canon: 'conflicting' });
      link('twin', 'mira2', 'keep', 'related');
      const chapter = (key, title, order, mentions = []) => tx.objectStore('chapters').put({ id: id(key), projectId, parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 1, charCount: 4, mentions: mentions.map(id), createdAt: at, updatedAt: at });
      chapter('ch1', 'Chapter 1', 0, ['mira2']);
      chapter('ch2', 'Chapter 2', 1);
      tx.objectStore('chapterContents').put({ id: id('ch1'), projectId, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'mira', marks: [{ type: 'entityLink', attrs: { entryId: id('mira2') } }] }] }] }, rev: 1, savedAt: at });
      tx.objectStore('chapterPlans').put({ id: id('ch1'), projectId, objective: '', beats: [], entityIds: [], appearIds: [id('mira')], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', updatedAt: at });
      tx.objectStore('timelineEvents').put({ id: id('siege'), projectId, name: 'The siege', description: '', when: { precision: 'unknown' }, duration: null, importance: 'major', locationId: id('keep'), characters: [{ id: id('mira'), age: null }], entryIds: [], nodeIds: [id('ch1'), id('ch2')], afterId: null, createdAt: at, updatedAt: at });
      tx.objectStore('plotThreads').put({ id: id('quest'), projectId, title: 'The quest', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [{ id: id('b1'), nodeId: id('ch2'), title: 'The gates open', note: '', createdAt: at }], notes: '', muted: false, createdAt: at, updatedAt: at });
      tx.objectStore('structureMarkers').put({ id: id('climax'), projectId, kind: 'Climax', title: '', nodeId: id('ch2'), eventId: null, note: '', createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pL, Date.now()]);
  const rowsL = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pL, table]);
  // Both ways: from a place to what points at it, and back.
  await page.goto(`${baseL}/codex/${pL}-keep`);
  const keepConnections = page.locator('.all-connections');
  await keepConnections.locator('summary').click();
  const keepList = (await keepConnections.getByRole('list', { name: 'Every connection' }).innerText()).replace(/\s+/g, ' ');
  check('a record lists what points at it, each with where it is kept and, for a recorded connection, its status', keepList.includes('Orrin owns this Provisional') && keepList.includes('Mira knows about this Disputed') && keepList.includes('The siege takes place at this · kept in a timeline event'), keepList);
  await keepConnections.getByRole('link', { name: 'The siege' }).click();
  await page.waitForURL(/\/timeline\?event=/);
  const eventConnections = page.locator('.all-connections');
  await eventConnections.locator('summary').click();
  await eventConnections.getByRole('link', { name: 'The Keep' }).click();
  await page.waitForURL(new RegExp(`/codex/${pL}-keep`));
  check('…and following one there, and back again', true);
  await page.goto(`${baseL}/characters/${pL}-mira`);
  const appearanceLinks = page.getByLabel('Your appearance records');
  await appearanceLinks.waitFor();
  check('a character lists the chapters their appearance records name, the other way round from each chapter’s plan', (await appearanceLinks.innerText()).includes('Appears in (your record): Chapter 1') && (await appearanceLinks.getByRole('link', { name: 'Chapter 1' }).getAttribute('href')) === `/project/${pL}/manuscript/${pL}-ch1`);
  // Statuses: edited on the connection, shown and filtered in the graph.
  await page.goto(`${baseL}/codex/${pL}-keep`);
  await page.getByLabel('Status of the link to Orrin').selectOption('canon');
  await settles(async () => (await rowsL('loreLinks')).find((l) => l.id === `${pL}-owns`).canon === 'canon');
  check('a connection’s status is set where the connection is: confirmed, provisional, disputed or invalid', (await page.getByLabel('Status of the link to Orrin').locator('option').allInnerTexts()).join() === 'Confirmed,Provisional,Invalid: not canon,Invalid: retconned,Disputed');
  await page.goto(`${baseL}/visualize/graph`);
  await page.getByRole('group', { name: /^Knowledge graph of/ }).waitFor();
  check('the graph marks a disputed connection on its line, and names it in the legend', (await page.locator('.kg-line.st-disputed').count()) === 1 && (await page.locator('.kg-legends').innerText()).includes('Disputed'));
  await page.locator('.kg-layers > summary').click();
  await page.getByRole('group', { name: 'Connection status', exact: true }).getByRole('checkbox', { name: /^Disputed/ }).uncheck();
  await page.waitForURL(/gstatus=disputed/);
  await page.locator('.kg-line.st-disputed').waitFor({ state: 'detached' });
  check('…and connections can be hidden by status, which the view says', (await page.getByRole('region', { name: 'What this view leaves out' }).innerText()).includes('Connections hidden by status: Disputed.'));
  // The record check.
  await page.goto(baseL);
  await page.locator('.sidebar nav a', { hasText: /^Record check$/ }).click();
  await page.waitForURL(/\/integrity$/);
  const checkStatus = () => page.locator('.integrity-page .page-header [role=status]').innerText();
  await page.locator('.integrity-page .page-header [role=status]').waitFor();
  const unresolvedL = page.getByRole('region', { name: 'References that name nothing' });
  const duplicatesL = page.getByRole('region', { name: 'Records that look like duplicates' });
  check('the record check finds a field holding words and two pairs of look-alike records, and nothing broken', (await checkStatus()).startsWith('3 to look at') && (await unresolvedL.innerText()).includes('“Owner” holds “orrin”, which names no entry.') && (await duplicatesL.locator('.thread.issue').count()) === 2 && (await page.getByRole('region', { name: 'References to records that no longer exist' }).innerText()).includes('None.'), await checkStatus());
  check('disputed and invalid connections are listed, kept as marked', (await page.getByRole('region', { name: 'Connections marked disputed or invalid' }).innerText()).replace(/\s+/g, ' ').includes('Mira knows about The Keep Disputed'));
  await unresolvedL.getByRole('button', { name: 'Point it at Orrin' }).click();
  await unresolvedL.getByText('None.').waitFor();
  check('a field is pointed at an entry only when the author chooses it', (await rowsL('loreEntries')).find((e) => e.id === `${pL}-blade`).fields[0].value === `${pL}-orrin`);
  await duplicatesL.getByRole('button', { name: 'Not duplicates: The Keep and Keep' }).click();
  await duplicatesL.getByText('Decided: not duplicates').waitFor();
  check('look-alike records can be marked not duplicates, and that decision is kept (and can be reopened)', (await duplicatesL.locator('.thread.issue:not(.reviewed)').count()) === 1 && (await duplicatesL.getByRole('button', { name: 'Reopen' }).count()) === 1);
  // A merge: shown in full, typed to confirm, every reference kept.
  await duplicatesL.getByRole('button', { name: 'Merge…' }).click();
  const mergeDialog = page.locator('dialog[open]');
  await mergeDialog.getByRole('radio', { name: 'Keep “Mira”', exact: true }).check();
  await mergeDialog.getByLabel('What merging would do').getByText('“mira” is merged into “Mira”').waitFor();
  const planText = (await mergeDialog.getByLabel('What merging would do').innerText()).replace(/\s+/g, ' ');
  check('merging is shown in full first: what will point at the one kept, and what is added', planText.includes('chapters and scenes linking it in their text: 1') && planText.includes('chapters’ and scenes’ text: 1') && planText.includes('connections: 1') && planText.includes('a note on “Mira” saying “mira” was merged into it'), planText);
  check('…and needs the merged name typed before it can go ahead', await mergeDialog.getByRole('button', { name: 'Merge them' }).isDisabled());
  await mergeDialog.getByRole('textbox').fill('mira');
  await mergeDialog.getByRole('button', { name: 'Merge them' }).click();
  await duplicatesL.locator('.thread.issue:not(.reviewed)').waitFor({ state: 'detached' });
  const allRowsL = JSON.stringify(await Promise.all(['loreEntries', 'loreLinks', 'chapters', 'chapterContents', 'chapterPlans', 'timelineEvents', 'plotThreads', 'structureMarkers'].map(rowsL)));
  check('after merging nothing points at the merged entry: its link in the text, its connection and its mention all follow to the one kept', !allRowsL.includes(`${pL}-mira2`) && JSON.stringify((await rowsL('chapterContents'))[0].doc).includes(`${pL}-mira"`) && (await rowsL('loreLinks')).some((l) => l.fromId === `${pL}-mira` && l.type === 'related'));
  // Deleting a chapter: what pointed at it is found, and each reference taken out, keeping what held it.
  await page.goto(`${baseL}/organizer`);
  const ch2Row = page.locator('.outline-row', { hasText: 'Chapter 2' });
  await ch2Row.getByLabel('Actions for Chapter 2').click();
  await ch2Row.getByRole('button', { name: 'Delete…' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
  await ch2Row.waitFor({ state: 'detached' });
  await page.goto(`${baseL}/integrity`);
  const brokenL = page.getByRole('region', { name: 'References to records that no longer exist' });
  await brokenL.locator('.thread.issue').nth(2).waitFor();
  check('a deleted chapter leaves three references behind, each found and said for what it is', (await brokenL.locator('.thread.issue').count()) === 3 && (await brokenL.innerText()).includes('The marker “Climax” is placed at a chapter or scene that no longer exists') && (await brokenL.innerText()).includes('Kept in a plot thread') && (await brokenL.innerText()).includes('Kept in a timeline event'), await brokenL.innerText());
  for (let i = 0; i < 3; i++) {
    await brokenL.getByRole('button', { name: 'Take this reference out' }).first().click();
    await brokenL.locator('.thread.issue').nth(2 - i).waitFor({ state: 'detached' });
  }
  check('taking each out keeps what held it: the beat (unplaced), the event (with its other chapter) and the marker', (await rowsL('plotThreads'))[0].beats[0].nodeId === null && (await rowsL('plotThreads'))[0].beats[0].title === 'The gates open' && JSON.stringify((await rowsL('timelineEvents'))[0].nodeIds) === JSON.stringify([`${pL}-ch1`]) && (await rowsL('structureMarkers'))[0].nodeId === null && (await brokenL.innerText()).includes('None.'));
  // Renaming breaks nothing.
  await page.goto(`${baseL}/codex/${pL}-keep`);
  await page.getByLabel('Name', { exact: true }).fill('The Old Keep');
  await page.getByLabel('Name', { exact: true }).blur();
  await settles(async () => (await rowsL('loreEntries')).find((e) => e.id === `${pL}-keep`).name === 'The Old Keep');
  await page.goto(`${baseL}/integrity`);
  await page.locator('.integrity-page .page-header [role=status]').waitFor();
  check('renaming a record breaks no reference: the check stays clean', (await checkStatus()).startsWith('Nothing to look at'), await checkStatus());
  await page.goto(`${baseV}/visualize/timeline`);

  // Kinds of record of the author's own: presets, field rules, checks, links, graph, search and templates (visualization Prompt 35).
  const pR = await createProject('Record Kinds');
  const baseR = `${BASE}/project/${pR}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries'], 'readwrite');
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira', 'character');
      entry('keep', 'The Keep', 'location');
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pR, Date.now()]);
  const rowsR = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pR, table]);
  const fieldR = (label) => page.locator('.codex-entry').getByLabel(label, { exact: true });
  const sdR = page.locator('dialog[open]');
  const defNamesR = () => sdR.locator('.schema-fields > li > input:first-child').evaluateAll((els) => els.map((e) => e.value));
  await page.goto(`${baseR}/codex/${pR}-keep`);
  await page.locator('.codex-entry').getByRole('button', { name: 'Edit these fields…' }).click();
  const presetOptions = await sdR.getByLabel('Start a kind of record from a preset').locator('option').allInnerTexts();
  check('a kind of record can start from a preset: spells, planets, investigations, techniques, organizations, species, technologies, relics', ['Spells', 'Planets', 'Investigations', 'Techniques', 'Organizations', 'Species', 'Technologies', 'Relics'].every((name) => presetOptions.some((o) => o.startsWith(`${name}:`))), presetOptions.join('|'));
  await sdR.getByLabel('Start a kind of record from a preset').selectOption('spells');
  await sdR.locator('.schema-nav button.active', { hasText: 'Spells' }).waitFor();
  eq('…which adds the kind, with its fields', await defNamesR(), ['Effect', 'School', 'Rank', 'Cost', 'Known by']);
  check('…and their rules: required, a range, a kind to link to, help', (await sdR.getByLabel('Effect required').isChecked()) && !(await sdR.getByLabel('Cost required').isChecked()) && (await sdR.getByLabel('Rank lowest').inputValue()) === '0' && (await sdR.getByLabel('Rank highest').inputValue()) === '10' && (await sdR.getByLabel('Known by links to').inputValue()) === 'character' && (await sdR.getByLabel('Rank help').inputValue()).startsWith('0 for a cantrip'));
  // The rules are the author's to change.
  await sdR.getByLabel('Cost required').check();
  await sdR.getByLabel('Rank highest').fill('9');
  await sdR.getByLabel('Rank highest').blur();
  await sdR.getByLabel('Show Spells in the knowledge graph').uncheck();
  const spellsKind = async () => (await rowsR('loreSchemas')).find((c) => c.name === 'Spells');
  await settles(async () => { const kind = await spellsKind(); return kind?.graph === false && kind.fields.find((f) => f.name === 'Cost').required === true && kind.fields.find((f) => f.name === 'Rank').max === 9; });
  check('a field can be made required, given a range, and the kind kept out of the graph: all saved with the kind', true);
  await sdR.getByRole('button', { name: 'Save Spells as a template' }).click();
  await sdR.getByText('Saved “Spells” as a template, to add to any novel.').waitFor();
  check('one kind can be saved as a template of its own', (await sdR.getByLabel('Add from a template').locator('optgroup[label="Yours"] option').allInnerTexts()).includes('Spells'));
  await page.setViewportSize({ width: 390, height: 780 });
  await sdR.locator('.schema-rules').first().waitFor();
  check('mobile: the field rules fit', (await sdR.evaluate((el) => el.scrollWidth <= window.innerWidth)) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await sdR.getByRole('button', { name: 'Close' }).click();
  // A record of that kind: checked as it is filled in, never stopped.
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByText('Spell', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.entry-name input')?.value.startsWith('New '));
  await fieldR('Name').fill('Emberfall');
  await fieldR('Name').blur();
  await page.locator('.entry-list', { hasText: 'Emberfall' }).waitFor();
  const typedR = page.locator('.codex-entry .typed-fields');
  const issuesR = () => typedR.locator('.field-issue').allInnerTexts();
  check('required fields are marked, with their help shown', (await typedR.locator('.required-mark').count()) === 2 && (await typedR.innerText()).includes('What happens when it is cast.'));
  eq('an empty required field says so', await issuesR(), ['Effect is required.', 'Cost is required.']);
  await fieldR('Effect').fill('Rains fire on the unworthy');
  await fieldR('Effect').blur();
  await fieldR('Rank').fill('12');
  await fieldR('Rank').blur();
  await typedR.getByText('Rank should be at most 9; it is 12.').waitFor();
  const knownBy = page.locator('.codex-entry').getByLabel('Add to Known by');
  const knownByOptions = await knownBy.locator('option').allInnerTexts();
  check('a link limited to characters offers characters only', knownByOptions.includes('Mira') && !knownByOptions.some((o) => o.includes('Keep')), knownByOptions.join('|'));
  await knownBy.selectOption({ label: 'Mira' });
  await settles(async () => { const spell = (await rowsR('loreEntries')).find((e) => e.name === 'Emberfall'); return spell?.fields.length === 3 && spell.fields.some((f) => f.value === `${pR}-mira`); });
  eq('a value out of range is said at its field, and kept as typed', { issues: await issuesR(), rank: await fieldR('Rank').inputValue() }, { issues: ['Rank should be at most 9; it is 12.', 'Cost is required.'], rank: '12' });
  const spellConnections = page.locator('.codex-entry .all-connections');
  await spellConnections.locator('summary').click();
  check('a custom record is linked like any other: its field is a connection to the character', (await spellConnections.getByRole('list', { name: 'Every connection' }).innerText()).replace(/\s+/g, ' ').includes('Known by'));
  await spellConnections.getByRole('link', { name: 'Mira' }).click();
  await page.waitForURL(new RegExp(`/characters/${pR}-mira`));
  check('…which leads to the character', true);
  // The record check lists what does not fit.
  await page.goto(`${baseR}/integrity`);
  const unfitR = page.getByRole('region', { name: 'Values that do not fit their fields' });
  await unfitR.locator('.thread.issue').waitFor();
  const unfitText = (await unfitR.innerText()).replace(/\s+/g, ' ');
  check('the record check lists the values that do not fit their fields, by record', unfitText.includes('Emberfall') && unfitText.includes('Rank should be at most 9; it is 12.') && unfitText.includes('Cost is required.'), unfitText);
  // Shown in the graph, or not, as the kind says.
  await page.goto(`${baseR}/visualize/graph`);
  const leftOutR = page.getByRole('region', { name: 'What this view leaves out' });
  await leftOutR.waitFor();
  check('a kind set not to appear in the graph is left out, and the view says so', (await leftOutR.innerText()).includes('Set, in the Codex, not to appear in the graph: Spells (1), 1 record in all.') && (await page.locator('.kg-node', { hasText: 'Emberfall' }).count()) === 0, await leftOutR.innerText());
  await leftOutR.getByRole('link', { name: 'Change it in the Codex' }).click();
  await page.waitForURL(/\/codex/);
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByRole('button', { name: 'Categories & fields…' }).click();
  await sdR.locator('.schema-nav button', { hasText: 'Spells' }).click();
  await sdR.getByLabel('Show Spells in the knowledge graph').check();
  await settles(async () => (await spellsKind()).graph !== false);
  await sdR.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${baseR}/visualize/graph`);
  await page.locator('.kg-node', { hasText: 'Emberfall' }).waitFor();
  check('…and shown again when the kind is set to appear', !(await page.getByRole('region', { name: 'What this view leaves out' }).innerText()).includes('Set, in the Codex'));
  // Found by what its fields hold.
  await page.keyboard.press('ControlOrMeta+k');
  const dlgR = page.locator('.search-dialog');
  await dlgR.getByLabel('Search this project').fill('unworthy');
  await dlgR.locator('.search-group[aria-label="Spells"]', { hasText: 'Emberfall' }).waitFor();
  check('search finds a custom record by its fields, under its kind', (await dlgR.locator('.search-snippet', { hasText: 'Effect' }).innerText()).includes('unworthy'));
  await page.keyboard.press('Escape');
  // The saved kind, rules and all, in another novel.
  const pR2 = await createProject('Record Kinds Two');
  await page.goto(`${BASE}/project/${pR2}/codex`);
  await page.getByText('Build your world').waitFor();
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByRole('button', { name: 'Categories & fields…' }).click();
  await sdR.getByLabel('Add from a template').selectOption({ label: 'Spells' });
  await sdR.locator('.schema-nav button', { hasText: 'Spells' }).click();
  await sdR.locator('.schema-nav button.active', { hasText: 'Spells' }).waitFor();
  check('a kind saved as a template brings its fields and rules into another novel', (await defNamesR()).join() === 'Effect,School,Rank,Cost,Known by' && (await sdR.getByLabel('Cost required').isChecked()) && (await sdR.getByLabel('Rank highest').inputValue()) === '9');
  await sdR.getByRole('button', { name: 'Close' }).click();
  // The same rules on the fields every character shares, said on the profile.
  await page.goto(`${baseR}/characters`);
  await page.locator('.vault-library').getByRole('button', { name: 'Shared fields…' }).click();
  await sdR.getByRole('button', { name: '+ Add field' }).click();
  await sdR.getByLabel('Field 1 name').fill('Oath');
  await sdR.getByLabel('Field 1 name').blur();
  await sdR.getByLabel('Oath required').check();
  await settles(async () => (await rowsR('loreSchemas')).find((c) => c.key === 'character')?.fields.some((f) => f.name === 'Oath' && f.required));
  await sdR.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${baseR}/characters/${pR}-mira/details`);
  const looseR = page.getByRole('region', { name: 'Fields without a section' });
  await looseR.getByRole('button', { name: '+ Oath' }).click();
  const oathCard = looseR.locator('.vault-field', { hasText: 'Oath' });
  await oathCard.locator('.field-issue').waitFor();
  check('a required field every character shares is marked on the profile, and says when it is empty', (await oathCard.locator('.required-mark').count()) === 1 && (await oathCard.locator('.field-issue').innerText()) === 'Oath is required.');
  await page.goto(`${baseV}/visualize/timeline`);

  // Kinds of record set up for views, field by field: a table always, a timeline, a map, a rank, who holds them, and the graph (visualization Prompt 36).
  const pK = await createProject('Kinds Book');
  const baseK = `${BASE}/project/${pK}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreSchemas', 'loreEntries', 'chapters'], 'readwrite');
      const def = (id, name, type, options = []) => ({ id, name, type, options });
      tx.objectStore('loreSchemas').put({ id: `${projectId}-art`, projectId, key: `custom-${projectId}`, name: 'Artifacts', singular: 'Artifact', color: '#2b8c6b', builtin: false, order: 10, fields: [def('found', 'Found', 'number'), def('lost', 'Lost', 'date'), def('east', 'East', 'number'), def('north', 'North', 'number'), def('tier', 'Tier', 'select', ['Low', 'Mid', 'High']), def('keeper', 'Keeper', 'reference'), def('code', 'Code', 'text')], createdAt: at, updatedAt: at });
      const entry = (key, name, category, values = {}) => tx.objectStore('loreEntries').put({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: Object.entries(values).map(([defId, value]) => ({ id: `${key}-${defId}`, key: '', value, defId })), createdAt: at, updatedAt: at });
      const kind = `custom-${projectId}`;
      entry('mira', 'Mira', 'character');
      entry('orrin', 'Orrin', 'character');
      entry('crown', 'Ember Crown', kind, { found: '1020', lost: '1024-05-01', east: '3', north: '4', tier: 'High', keeper: `${projectId}-mira`, code: 'EC-1' });
      entry('blade', 'Ash Blade', kind, { found: '1022', east: 'far', north: '1', tier: 'Low', keeper: `${projectId}-orrin` });
      entry('cup', 'Dull Cup', kind, { found: 'long ago', tier: 'Rusty' });
      tx.objectStore('chapters').put({ id: `${projectId}-ch1`, projectId, parentId: null, kind: 'chapter', title: 'The Theft', order: 0, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pK, Date.now()]);
  const kindK = `custom-${pK}`;
  const rowsK = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pK, table]);
  // Set up for nothing: still a table, and every other way says what it needs.
  await viewTabs.first().waitFor({ state: 'detached' }).catch(() => {});
  await page.goto(`${baseK}/visualize/kinds`);
  const kindTableK = page.locator('.kind-table');
  await kindTableK.waitFor();
  check('Records by kind opens on a kind with records, as a table: a column a field, links by name', (await page.getByLabel('Kind of record', { exact: true }).inputValue()) === kindK && JSON.stringify(await kindTableK.locator('thead th').allInnerTexts()) === JSON.stringify(['Name', 'Found', 'Lost', 'East', 'North', 'Tier', 'Keeper', 'Code']) && (await kindTableK.locator('tbody tr', { hasText: 'Ember Crown' }).innerText()).includes('Mira'));
  const showAs = page.getByRole('group', { name: 'Ways to show it' });
  check('a way of showing it that is not set up says so', (await showAs.getByRole('button').allInnerTexts()).filter((t) => t.includes('not set up')).length === 4);
  await showAs.getByRole('button', { name: /^On a map/ }).click();
  const missingK = page.locator('.kind-missing');
  await missingK.waitFor();
  check('…and, chosen, explains what is missing and shows the table instead', (await missingK.innerText()).includes('Artifacts can’t be shown on a map yet:') && (await missingK.innerText()).includes('Across on the map is not set: choose a Number field.') && (await kindTableK.count()) === 1);
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the table (CSV)' }).click()]);
  const csvK = readFileSync(await csvDownload.path(), 'utf8').split('\r\n');
  check('the table downloads as CSV, with every field', csvDownload.suggestedFilename() === 'Artifacts.csv' && csvK[0] === 'Name,Found,Lost,East,North,Tier,Keeper,Code' && csvK.includes('Ember Crown,1020,1024-05-01,3,4,High,Mira,EC-1'), csvK.join(' | '));
  // Set it up in the Codex, field by field.
  await missingK.getByRole('link', { name: 'Open the Codex' }).click();
  await page.waitForURL(/\/codex$/);
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByRole('button', { name: 'Categories & fields…' }).click();
  const sdK = page.locator('dialog[open]');
  await sdK.locator('.schema-nav button', { hasText: /^Artifacts/ }).click();
  await sdK.locator('.schema-nav button.active', { hasText: /^Artifacts/ }).waitFor();
  const usesK = sdK.locator('.kind-uses');
  check('the field menus offer only fields of a type the view reads', JSON.stringify(await usesK.getByLabel('Across on the map', { exact: true }).locator('option').allInnerTexts()) === JSON.stringify(['Not set', 'Found (Number)', 'East (Number)', 'North (Number)']) && JSON.stringify(await usesK.getByLabel('Rank', { exact: true }).locator('option').allInnerTexts()) === JSON.stringify(['Not ranked', 'Found (Number)', 'East (Number)', 'North (Number)', 'Tier (Choice (one))']));
  await usesK.getByLabel('Across on the map', { exact: true }).selectOption('east');
  const mapGroup = usesK.getByRole('group', { name: 'On a map' });
  await mapGroup.getByText('Up on the map is not set: choose a Number field.').waitFor();
  check('partly set up, it says what is still missing', true);
  await usesK.getByLabel('Up on the map', { exact: true }).selectOption('north');
  await usesK.getByLabel('Date on the timeline', { exact: true }).selectOption('found');
  await usesK.getByLabel('End on the timeline (optional)', { exact: true }).selectOption('lost');
  await usesK.getByLabel('Rank', { exact: true }).selectOption('tier');
  await usesK.getByLabel('Connection that means holding it', { exact: true }).selectOption('owns');
  await usesK.getByLabel('Current holder field (optional)', { exact: true }).selectOption('keeper');
  await usesK.getByLabel('Label in the knowledge graph', { exact: true }).selectOption('code');
  const kindRow = async () => (await rowsK('loreSchemas')).find((c) => c.key === kindK);
  await settles(async () => JSON.stringify((await kindRow())?.uses) === JSON.stringify({ timeline: { start: 'found', end: 'lost' }, map: { x: 'east', y: 'north' }, rank: 'tier', ownership: { type: 'owns', field: 'keeper' }, graphLabel: 'code' }));
  check('every setting is saved with the kind, by field', JSON.stringify((await kindRow())?.uses) === JSON.stringify({ timeline: { start: 'found', end: 'lost' }, map: { x: 'east', y: 'north' }, rank: 'tier', ownership: { type: 'owns', field: 'keeper' }, graphLabel: 'code' }), JSON.stringify((await kindRow())?.uses));
  check('fully set up, each view says so', (await usesK.getByText('Set up: shown under Visualize → Records by kind.').count()) === 4);
  await sdK.getByRole('button', { name: 'Close' }).click();
  // Each way of showing it.
  await page.goto(`${baseK}/visualize/kinds?kind=${kindK}&kshow=timeline`);
  const ktRows = page.getByRole('list', { name: 'Artifacts on the story’s timeline, in story order' });
  await ktRows.waitFor();
  check('on a timeline: in story order, a bar for a record with an end, a dot for one without', JSON.stringify(await ktRows.locator('.viz-pick').allInnerTexts()) === JSON.stringify(['Ember Crown', 'Ash Blade']) && (await ktRows.locator('.kt-bar').count()) === 1 && (await ktRows.locator('.kt-dot').count()) === 1);
  check('…and what it cannot place is listed, with why', (await page.getByRole('region', { name: 'Not on the timeline' }).innerText()).includes('Dull Cup: Found holds “long ago”, not a year (a whole number).'));
  await showAs.getByRole('button', { name: /^On a map/ }).click();
  const mapK = page.getByRole('group', { name: /^Map of 1 artifact/ });
  await mapK.waitFor();
  check('on a map: by the two numbers, with what has no place listed', (await mapK.locator('.km-point').count()) === 1 && (await page.getByRole('region', { name: 'Not on the map' }).innerText()).includes('Ash Blade: East holds “far”, not a number.'));
  await mapK.locator('.km-point').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/select=entry/);
  check('…its points are reached and selected with the keyboard', decodeURIComponent(page.url()).includes(`select=entry:${pK}-crown`));
  await showAs.getByRole('button', { name: /^By rank/ }).click();
  const ladder = page.getByRole('list', { name: 'Artifacts by Tier, highest first' });
  await ladder.waitFor();
  check('by rank: every rung of the choices, highest first, even an empty one', JSON.stringify(await ladder.locator('.kl-label').allInnerTexts()) === JSON.stringify(['High', 'Mid', 'Low']) && (await ladder.locator('.kl-level', { hasText: 'Mid' }).locator('.kl-records li').count()) === 0 && (await page.getByRole('region', { name: 'Not ranked' }).innerText()).includes('Dull Cup'));
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.kind-ladder').waitFor({ state: 'detached' });
  check('…and as a list', (await page.getByRole('list', { name: 'Artifacts by Tier, highest first' }).innerText()).replace(/\s+/g, ' ').includes('Mid: none'));
  // Who holds it: recorded beside the view, kept as history.
  await page.goto(`${baseK}/visualize/kinds?kind=${kindK}&kshow=ownership&select=entry:${pK}-crown`);
  const holderForm = page.getByRole('form', { name: 'Record who holds Ember Crown' });
  await holderForm.waitFor();
  await holderForm.getByLabel('Holder', { exact: true }).selectOption({ label: 'Mira' });
  await holderForm.getByRole('button', { name: 'Record it' }).click();
  await holderForm.getByText('Recorded: Mira holds Ember Crown.').waitFor();
  await holderForm.getByLabel('Holder', { exact: true }).selectOption({ label: 'Orrin' });
  await holderForm.getByLabel('From when', { exact: true }).selectOption(`n:${pK}-ch1`);
  await holderForm.getByRole('button', { name: 'Record it' }).click();
  await holderForm.getByText('Recorded: Orrin holds Ember Crown from then on.').waitFor();
  const owned = (await rowsK('loreLinks')).filter((l) => l.type === 'owns');
  check('a new holder from a chapter ends the holding before there, which is kept', owned.length === 2 && owned.some((l) => l.fromId === `${pK}-mira` && l.validity?.until?.nodeId === `${pK}-ch1`) && owned.some((l) => l.fromId === `${pK}-orrin` && l.validity?.from?.nodeId === `${pK}-ch1`), JSON.stringify(owned.map((l) => [l.fromId, l.validity])));
  const chain = page.getByRole('list', { name: 'Who has held Ember Crown, in order' });
  await chain.locator('.kh-holding').nth(2).waitFor();
  const chainText = (await chain.innerText()).replace(/\s+/g, ' ');
  check('by who holds it: each holder in order, then who the field names, and a difference said, not fixed', chainText.startsWith('Mira until') && chainText.includes('Orrin from') && chainText.includes('Keeper: Mira') && (await page.locator('.kind-holders .field-issue').first().innerText()) === 'Keeper names Mira, but the holding recorded as still in force is Orrin’s.', chainText);
  // The knowledge graph reads the label it was given, and only the link fields chosen.
  await page.goto(`${baseK}/codex`);
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByRole('button', { name: 'Categories & fields…' }).click();
  await sdK.locator('.schema-nav button', { hasText: /^Artifacts/ }).click();
  await sdK.getByLabel('Draw Keeper in the knowledge graph', { exact: true }).uncheck();
  await settles(async () => JSON.stringify((await kindRow())?.uses?.graphLinks) === '[]');
  await sdK.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${baseK}/visualize/graph`);
  await page.getByRole('group', { name: /^Knowledge graph of/ }).waitFor();
  const leftOutK = page.getByRole('region', { name: 'What this view leaves out' });
  check('in the knowledge graph: labelled by its field, and link fields not chosen are left out and counted', (await page.locator('.kg-node', { hasText: 'EC-1' }).count()) === 1 && (await leftOutK.innerText()).includes('Link fields set, in the Codex, not to be drawn: Artifacts: Keeper (2), 2 connections in all.'), await leftOutK.innerText());
  // A field retyped later: the setting is kept, and said, until it suits again.
  await page.goto(`${baseK}/codex`);
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByRole('button', { name: 'Categories & fields…' }).click();
  await sdK.locator('.schema-nav button', { hasText: /^Artifacts/ }).click();
  await sdK.getByLabel('Found type', { exact: true }).selectOption('text');
  await usesK.getByText('Found, chosen for the date on the timeline, is now Short text; it needs to be a Number or Date field.').waitFor();
  check('a field retyped afterwards: the setting stays, and the dialog says what no longer suits', (await usesK.getByLabel('Date on the timeline', { exact: true }).inputValue()) === 'found');
  await sdK.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${baseK}/integrity`);
  const unsuitedK = page.getByRole('region', { name: 'Views set up on fields that no longer suit' });
  await unsuitedK.locator('.thread.issue').waitFor();
  check('…and so does the record check', (await unsuitedK.innerText()).includes('Artifacts') && (await unsuitedK.innerText()).includes('Found, chosen for the date on the timeline, is now Short text'));
  await page.goto(`${baseK}/visualize/kinds?kind=${kindK}&kshow=timeline`);
  await missingK.waitFor();
  check('…and the view explains it, showing the table', (await missingK.innerText()).includes('is now Short text') && (await kindTableK.count()) === 1);
  await page.goto(`${baseK}/codex`);
  await page.locator('.codex-list summary', { hasText: 'New entry' }).click();
  await page.locator('.codex-list .menu-items').getByRole('button', { name: 'Categories & fields…' }).click();
  await sdK.locator('.schema-nav button', { hasText: /^Artifacts/ }).click();
  await sdK.getByLabel('Found type', { exact: true }).selectOption('number');
  await settles(async () => (await kindRow())?.fields.find((d) => d.id === 'found').type === 'number');
  await sdK.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${baseK}/visualize/kinds?kind=${kindK}&kshow=timeline`);
  await ktRows.waitFor();
  check('retyped back, the timeline works again: nothing was lost', (await ktRows.locator('.viz-pick').count()) === 2);
  await page.setViewportSize({ width: 390, height: 780 });
  await ktRows.waitFor();
  const fitsK = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const fitTimeline = await fitsK();
  await showAs.getByRole('button', { name: /^By rank/ }).click();
  await page.locator('.kind-ladder').waitFor();
  check('mobile: the timeline and the ladder fit the screen', fitTimeline && (await fitsK()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Progression change by change: what is tracked, chosen; changes at chapters, events, or no time known; a character with none (visualization Prompt 37).
  const pPg = await createProject('Tracked Book');
  const basePg = `${BASE}/project/${pPg}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'chapters', 'timelineEvents'], 'readwrite');
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira', 'character');
      entry('pell', 'Pell', 'character');
      entry('crown', 'Ember Crown', 'item');
      const chapter = (key, title, order) => tx.objectStore('chapters').put({ id: `${projectId}-${key}`, projectId, parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at });
      chapter('ch1', 'The Gate', 0);
      chapter('ch2', 'The Vault', 1);
      chapter('ch3', 'The Flight', 2);
      const event = (key, name, year) => tx.objectStore('timelineEvents').put({ id: `${projectId}-${key}`, projectId, name, description: '', when: { precision: 'exact', year, month: null, day: null, hour: null, minute: null }, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at });
      event('coronation', 'The coronation', 10);
      event('siege', 'The siege', 12);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pPg, Date.now()]);
  const rowsT = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pPg, table]);
  const trackerT = page.locator('.progress-tracker');
  // Nothing is tracked until the author chooses it.
  await page.goto(`${basePg}/characters/${pPg}-pell/progression`);
  await trackerT.getByText('This novel tracks nothing about how characters change yet.').waitFor();
  check('a novel tracks nothing until the author chooses: no levels, no statistics, nothing assumed', (await trackerT.locator('.progress-now').count()) === 0);
  await trackerT.getByRole('button', { name: 'Choose what to track…' }).click();
  const trackedT = page.locator('dialog[open]');
  for (const preset of ['Level', 'Rank', 'Abilities', 'Equipment']) {
    await trackedT.getByRole('button', { name: `+ ${preset}` }).click();
    await trackedT.getByRole('button', { name: `+ ${preset}` }).waitFor({ state: 'detached' });
  }
  await trackedT.getByLabel('Steps of Rank, lowest first', { exact: true }).fill('Squire, Knight, Captain');
  await trackedT.getByLabel('Steps of Rank, lowest first', { exact: true }).blur();
  const rankRow = trackedT.getByRole('list', { name: 'Tracked categories' }).locator('li').filter({ has: page.getByLabel('Steps of Rank, lowest first', { exact: true }) });
  await rankRow.locator('details summary').click();
  await trackedT.getByLabel('Rank applies to Mira', { exact: true }).check();
  const catsT = async () => (await rowsT('progressCategories')).sort((a, b) => a.order - b.order);
  await settles(async () => (await catsT()).find((c) => c.name === 'Rank')?.characterIds.length === 1 && (await catsT()).find((c) => c.name === 'Rank').ladder.length === 3);
  eq('the author chooses what is tracked, its shape, its steps, and whom it applies to', (await catsT()).map((c) => [c.name, c.shape, c.ladder.join('/'), c.characterIds.length]), [['Level', 'value', '', 0], ['Rank', 'value', 'Squire/Knight/Captain', 1], ['Abilities', 'held', '', 0], ['Equipment', 'held', '', 0]]);
  await trackedT.getByRole('button', { name: 'Close' }).click();
  await trackerT.getByText('Nothing recorded for Pell yet.').waitFor();
  check('a character with nothing recorded shows no values, only what could be recorded for them', (await trackerT.innerText()).includes('Also tracked in this novel, nothing recorded for Pell: Level, Abilities, Equipment.') && (await trackerT.locator('.progress-now').count()) === 0);
  check('…and a category set for someone else is not offered for them', JSON.stringify(await page.getByRole('form', { name: 'Record a change' }).getByLabel('What changes', { exact: true }).locator('option').allInnerTexts()) === JSON.stringify(['Level', 'Abilities', 'Equipment']));
  // Changes, each when it happens.
  await page.goto(`${basePg}/characters/${pPg}-mira/progression`);
  const formT = page.getByRole('form', { name: 'Record a change' });
  await formT.waitFor();
  const recordT = async ({ what, when = '', set, action, thing, entry, cost, says }) => {
    await formT.getByLabel('What changes', { exact: true }).selectOption({ label: what });
    await formT.getByLabel('When', { exact: true }).selectOption(when);
    if (action) await formT.getByLabel('Gained or lost', { exact: true }).selectOption(action);
    if (thing) await formT.getByLabel('What', { exact: true }).fill(thing);
    if (entry) await formT.getByLabel('Its codex entry', { exact: true }).selectOption({ label: entry });
    if (set) await formT.getByLabel('Set to', { exact: true }).fill(set);
    if (cost) await formT.getByLabel('Cost', { exact: true }).fill(cost);
    await formT.getByRole('button', { name: 'Record the change' }).click();
    await trackerT.getByText(`Recorded: ${says}.`).waitFor();
  };
  await recordT({ what: 'Level', when: 'start', set: '1', says: 'Level set to 1' });
  await recordT({ what: 'Abilities', when: `n:${pPg}-ch1`, action: 'gain', thing: 'Fire Lance', says: 'Gained Fire Lance' });
  await recordT({ what: 'Level', when: `n:${pPg}-ch2`, set: '3', cost: 'A scar', says: 'Level set to 3' });
  await recordT({ what: 'Rank', when: `e:${pPg}-coronation`, set: 'Knight', says: 'Rank set to Knight' });
  await recordT({ what: 'Equipment', when: `n:${pPg}-ch2`, action: 'gain', entry: 'Ember Crown', says: 'Gained Ember Crown' });
  await recordT({ what: 'Abilities', when: `n:${pPg}-ch3`, action: 'lose', thing: 'Fire Lance', says: 'Lost Fire Lance' });
  await formT.getByLabel('What changes', { exact: true }).selectOption({ label: 'Abilities' });
  await formT.getByLabel('When', { exact: true }).selectOption('');
  await formT.getByLabel('Gained or lost', { exact: true }).selectOption('gain');
  await formT.getByLabel('What', { exact: true }).fill('Ward of Ash');
  await formT.getByRole('button', { name: 'Record the change' }).click();
  await trackerT.getByText('Recorded: Gained Ward of Ash.').waitFor();
  const logT = page.getByRole('region', { name: 'Changes in order' }).locator('ol > li');
  const logTexts = (await logT.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ Edit Delete$/, ''));
  eq('the changes in order: before the story, story time, reading order, then those with no time known', logTexts.map((t) => t.replace(/ (Level|Rank|Abilities|Equipment)( · cost: .*)?$/, '')), ['Before the story Level set to 1', 'At “The coronation” Rank set to Knight', 'Ch 1: The Gate Gained Fire Lance', 'Ch 2: The Vault Level set to 3 (was 1)', 'Ch 2: The Vault Gained Ember Crown', 'Ch 3: The Flight Lost Fire Lance', 'When is not known Gained Ward of Ash']);
  check('…each with its category and what it cost', logTexts[3].endsWith('Level · cost: A scar'), logTexts[3]);
  const changesT = await rowsT('progressChanges');
  check('each change is kept with when it happens: a chapter, an event, before the story, or not known', changesT.length === 7 && changesT.some((c) => c.at?.kind === 'event' && c.value === 'Knight') && changesT.some((c) => c.at === null) && changesT.some((c) => c.at?.kind === 'date' && c.at.when.precision === 'unknown' && c.subject === 'Ward of Ash') && changesT.find((c) => c.refId === `${pPg}-crown`)?.subject === 'Ember Crown');
  // What she is like at a point.
  const nowT = trackerT.locator('.progress-now');
  const nowText = async () => (await nowT.innerText()).replace(/\s+/g, ' ');
  check('as of the end: her level, her rank on its ladder, what she holds and once held', (await nowText()).includes('Level 3') && (await nowText()).includes('Rank Knight (2 of 3)') && (await nowText()).includes('Abilities Ward of Ash Once held: Fire Lance') && (await nowText()).includes('Equipment Ember Crown'), await nowText());
  await trackerT.getByLabel('Progression as of', { exact: true }).selectOption(`n:${pPg}-ch1`);
  await nowT.filter({ hasText: 'Fire Lance' }).filter({ hasNotText: 'Once held' }).waitFor();
  const atCh1 = (await trackerT.locator('.progress-state').innerText()).replace(/\s+/g, ' ');
  check('as of a chapter: only what is placed by then; a change at an event is listed apart, never compared with a chapter', (await nowText()).includes('Level 1') && !(await nowText()).includes('Rank') && atCh1.includes('Not placed against Ch 1: The Gate') && atCh1.includes('Rank set to Knight (At “The coronation”)') && atCh1.includes('Gained Ward of Ash (When is not known)'), atCh1);
  await trackerT.getByLabel('Progression as of', { exact: true }).selectOption(`e:${pPg}-siege`);
  await nowT.filter({ hasText: 'Rank' }).waitFor();
  check('as of an event: what is placed in story time by then', (await nowText()).includes('Rank Knight') && (await nowText()).includes('Level 1') && !(await nowText()).includes('Level 3'), await nowText());
  await trackerT.getByLabel('Progression as of', { exact: true }).selectOption('end');
  // Changed and deleted, one at a time.
  await trackerT.getByRole('button', { name: 'Edit “Level set to 3”' }).click();
  const editPg = page.getByRole('form', { name: 'Change the recorded change' });
  await editPg.getByLabel('Set to', { exact: true }).fill('4');
  await editPg.getByRole('button', { name: 'Save the change' }).click();
  await logT.filter({ hasText: 'Level set to 4' }).waitFor();
  check('a change is edited where it is listed, and keeps its place', (await logT.nth(3).innerText()).includes('Level set to 4 (was 1)'));
  // Connected to the story: the codex entry it names, and the chapter it is at.
  await page.goto(`${basePg}/codex/${pPg}-crown`);
  const crownConnections = page.locator('.all-connections');
  await crownConnections.locator('summary').click();
  const crownList = (await crownConnections.getByRole('list', { name: 'Every connection' }).innerText()).replace(/\s+/g, ' ');
  check('a change is a connection: the codex entry it names lists it, and where it is kept', crownList.includes('Mira gained this') && crownList.includes('a progression change'), crownList);
  await page.goto(`${basePg}/visualize/progression`);
  const progTable = page.locator('table.sessions');
  await progTable.waitFor();
  const miraRow = (await progTable.locator('tbody tr', { hasText: 'Mira' }).innerText()).replace(/\s+/g, ' ');
  check('the Character progression view lists who has something recorded, as of the end; nobody else', miraRow.includes('Level 4 · Rank Knight · Abilities: Ward of Ash · Equipment: Ember Crown') && (await progTable.locator('tbody tr', { hasText: 'Pell' }).count()) === 0, miraRow);
  await page.goto(`${basePg}/visualize/history?who=${pPg}-mira`);
  await page.getByRole('region', { name: 'In story time' }).or(page.locator('.history-list').first()).first().waitFor();
  const historyT = (await page.locator('.visualize').innerText()).replace(/\s+/g, ' ');
  check('her history has each change where it happens, marked as progression', historyT.includes('Rank set to Knight Progression') && historyT.includes('Level set to 4 Progression') && historyT.includes('Gained Ward of Ash Progression'), historyT.slice(0, 600));
  await page.goto(`${basePg}/characters/${pPg}-mira/history`);
  const inStoryPg = page.getByRole('region', { name: 'In the story' });
  await inStoryPg.getByText('Gained Ember Crown').waitFor();
  check('…and so does the History tab on her profile, each line opening her progression', (await inStoryPg.getByRole('link', { name: 'Level set to 4' }).getAttribute('href')) === `/project/${pPg}/characters/${pPg}-mira/progression`);
  // A chapter deleted: the change is found, and keeps what it says.
  await page.goto(`${basePg}/organizer`);
  const flightRow = page.locator('.outline-row', { hasText: 'The Flight' });
  await flightRow.getByLabel('Actions for The Flight').click();
  await flightRow.getByRole('button', { name: 'Delete…' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
  await flightRow.waitFor({ state: 'detached' });
  await page.goto(`${basePg}/integrity`);
  const brokenT = page.getByRole('region', { name: 'References to records that no longer exist' });
  await brokenT.locator('.thread.issue').first().waitFor();
  check('a change at a deleted chapter is found by the record check, with where it is kept', (await brokenT.innerText()).includes('Lost Fire Lance') && (await brokenT.innerText()).includes('Kept in a progression change'), await brokenT.innerText());
  await brokenT.locator('.thread.issue', { hasText: 'Lost Fire Lance' }).getByRole('button', { name: 'Take this reference out' }).click();
  await brokenT.getByText('None.').waitFor();
  check('…and taking the reference out keeps the change, with its time no longer known', (await rowsT('progressChanges')).find((c) => c.subject === 'Fire Lance' && c.action === 'lose')?.at?.when?.precision === 'unknown');
  await page.goto(`${basePg}/characters/${pPg}-mira/progression`);
  await trackerT.getByRole('button', { name: 'Delete “Lost Fire Lance”' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete the change' }).click();
  await trackerT.getByText('Deleted: Lost Fire Lance.').waitFor();
  check('a change is deleted after asking, and nothing else is', (await rowsT('progressChanges')).length === 6 && /Abilities Fire Lance,? Ward of Ash/.test(await nowText()), await nowText());
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${basePg}/characters/${pPg}-mira/progression`);
  await formT.waitFor();
  check('mobile: the progression tab fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Ability paths: two systems and a kind of the author's own, the paths between them as recorded, and what does not add up (visualization Prompt 38).
  const pAb = await createProject('Paths Book');
  const baseAb = `${BASE}/project/${pAb}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['systems', 'systemSheets', 'loreSchemas', 'loreEntries', 'loreLinks', 'chapters'], 'readwrite');
      const item = (id, name, groupId, more = {}) => ({ id, groupId, name, description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '', ...more });
      const system = (id, name, more) => tx.objectStore('systems').put({ id: `${projectId}-${id}`, projectId, name, description: '', variables: [], tracks: [], ranks: [], groups: [], items: [], matrices: [], createdAt: at, updatedAt: at, ...more });
      system('ember', 'Ember Arts', { variables: [{ id: 'v', name: 'Mana', key: 'mana', kind: 'resource', unit: '', base: 10, formula: '', options: [], note: '' }], ranks: [{ id: 'r1', name: 'Novice' }], groups: [{ id: 'g', name: 'Skills', single: false }], items: [item('spark', 'Spark', 'g', { rankId: 'r1' }), item('lance', 'Fire Lance', 'g', { parentId: 'spark', costs: [{ id: 'c', target: 'mana', amount: '5' }], cooldown: '1 turn' }), item('wall', 'Flame Wall', 'g', { requires: 'Skill: Fire Lance' }), item('nova', 'Nova', 'g', { requires: 'levl >= 5' })] });
      system('court', 'Court Ranks', { groups: [{ id: 'cl', name: 'Classes', single: true }], items: [item('squire', 'Squire', 'cl'), item('knight', 'Knight', 'cl')] });
      tx.objectStore('systemSheets').put({ id: `${projectId}-sheet`, projectId, systemId: `${projectId}-ember`, entryId: `${projectId}-mira`, values: {}, progress: {}, itemIds: ['spark', 'wall'], note: '', createdAt: at, updatedAt: at });
      tx.objectStore('loreSchemas').put({ id: `${projectId}-tech`, projectId, key: `custom-${projectId}`, name: 'Techniques', singular: 'Technique', color: '#6b7a2b', builtin: false, order: 10, fields: [], uses: { tree: true }, createdAt: at, updatedAt: at });
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira', 'character');
      for (const [key, name] of [['stance', 'Iron Stance'], ['ember', 'Ember Stance'], ['fortress', 'Iron Fortress'], ['ouro', 'Ouro'], ['boros', 'Boros']]) entry(key, name, `custom-${projectId}`);
      entry('rusty', 'Rusty Blade', 'item');
      entry('ashen', 'Ashen Blade', 'item');
      const link = (key, from, to, type, ends = {}) => tx.objectStore('loreLinks').put({ id: `${projectId}-${key}`, projectId, fromId: ends.fromType === 'ability' ? from : `${projectId}-${from}`, toId: ends.toType === 'ability' ? to : `${projectId}-${to}`, fromLabel: '', toLabel: '', type, createdAt: at, ...ends });
      link('l1', 'stance', 'fortress', 'prerequisite-for');
      link('l2', 'ember', 'fortress', 'prerequisite-for');
      link('l3', 'stance', 'ember', 'excludes');
      link('l4', 'rusty', 'ashen', 'upgrades-to');
      link('l5', `${projectId}-court/squire`, `${projectId}-court/knight`, 'evolves-into', { fromType: 'ability', toType: 'ability' });
      link('l6', 'ouro', 'boros', 'prerequisite-for');
      link('l7', 'boros', 'ouro', 'prerequisite-for');
      tx.objectStore('chapters').put({ id: `${projectId}-c1`, projectId, parentId: null, kind: 'chapter', title: 'The Gate', order: 0, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pAb, Date.now()]);
  const rowsAb = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pAb, table]);
  // A change of Mira's that names one of the techniques, recorded on her Progression tab.
  await page.goto(`${baseAb}/characters/${pAb}-mira/progression`);
  await page.locator('.progress-tracker').getByRole('button', { name: 'Choose what to track…' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: '+ Abilities' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: '+ Abilities' }).waitFor({ state: 'detached' });
  await page.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
  const formAb = page.getByRole('form', { name: 'Record a change' });
  await formAb.getByLabel('When', { exact: true }).selectOption(`n:${pAb}-c1`);
  await formAb.getByLabel('Its codex entry', { exact: true }).selectOption({ label: 'Iron Stance' });
  await formAb.getByRole('button', { name: 'Record the change' }).click();
  await page.locator('.progress-tracker').getByText('Recorded: Gained Iron Stance.').waitFor();
  // The tree.
  await page.goto(`${baseAb}/visualize/abilities`);
  const treeAb = page.getByRole('group', { name: /^Ability paths:/ });
  await treeAb.waitFor();
  const nodeAb = (name) => treeAb.locator('.ap-node', { has: page.locator('title', { hasText: new RegExp(`^${name} \\(`) }) });
  const drawnAb = async () => (await treeAb.locator('.ap-node > title').allTextContents()).map((t) => t.replace(/ \(.*$/, '')).sort();
  eq('abilities from both systems and the kind set to show, and the items an upgrade joins, each drawn with its paths; the one with none set aside', await drawnAb(), ['Ashen Blade', 'Boros', 'Ember Stance', 'Fire Lance', 'Flame Wall', 'Iron Fortress', 'Iron Stance', 'Knight', 'Ouro', 'Rusty Blade', 'Spark', 'Squire']);
  check('…each kind of path drawn and named as what it is', (await page.locator('.viz-legend').innerText()).includes('Mutually exclusive') && (await page.locator('.viz-legend').innerText()).includes('Evolutions') && (await page.locator('.viz-legend').innerText()).includes('Branches (in a blueprint)') && (await treeAb.locator('.ap-edge.role-prerequisite').count()) === 4 && (await treeAb.locator('.ap-edge.role-evolution').count()) === 1);
  const problemsAb = page.getByRole('region', { name: 'What does not add up' });
  const problemsText = (await problemsAb.innerText()).replace(/\s+/g, ' ');
  check('what does not add up is said: a cycle, a clash with an exclusion, a rule that names nothing, a holder without a prerequisite', problemsText.includes('A cycle of requirements') && /Iron Fortress requires both (Iron|Ember) Stance and (Ember|Iron) Stance, which are mutually exclusive/.test(problemsText) && problemsText.includes('Nova’s requirement rule “levl >= 5” cannot be read') && problemsText.includes('Mira holds Flame Wall without Fire Lance, which it requires.'), problemsText);
  check('…and the records it rests on are marked in the tree', (await nodeAb('Iron Fortress').getAttribute('class')).includes('flag-problem') && (await nodeAb('Rusty Blade').getAttribute('class')) === 'ap-node');
  // An ability's details, and a path added and removed beside the tree.
  await nodeAb('Iron Stance').click();
  const detailsAb = page.getByRole('region', { name: 'Paths of Iron Stance' });
  await detailsAb.waitFor();
  const detailsText = (await detailsAb.innerText()).replace(/\s+/g, ' ');
  check('an ability’s details: who holds it and when they gained it, from her progression, and every path', detailsText.includes('Held by Mira (as of the end, by their progression)') && detailsText.includes('Mira: gained (Ch 1: The Gate)') && detailsText.includes('Prerequisite for Iron Fortress') && detailsText.includes('Mutually exclusive with Ember Stance'), detailsText);
  const addAb = page.getByRole('form', { name: 'Add a path to or from Iron Stance' });
  await addAb.getByLabel('Kind of path', { exact: true }).selectOption('own');
  await addAb.getByLabel('Your own kind of path', { exact: true }).fill('Teaches');
  await addAb.getByLabel('The other ability', { exact: true }).selectOption({ label: 'Ouro (Techniques)' });
  await addAb.getByRole('button', { name: 'Add the path' }).click();
  await detailsAb.getByText('Teaches Ouro').waitFor();
  check('a path of the author’s own kind is added, as a connection like any other', (await rowsAb('loreLinks')).some((l) => l.type === 'Teaches' && l.fromId === `${pAb}-stance` && l.toId === `${pAb}-ouro`) && (await treeAb.locator('.ap-edge.role-other').count()) === 1);
  await detailsAb.getByRole('button', { name: 'Remove the path: Teaches Ouro' }).click();
  await treeAb.locator('.ap-edge.role-other').waitFor({ state: 'detached' });
  check('…and removed from there', !(await rowsAb('loreLinks')).some((l) => l.type === 'Teaches'));
  // Breaking the cycle, beside the tree.
  await nodeAb('Boros').click();
  const borosAb = page.getByRole('region', { name: 'Paths of Boros' });
  await borosAb.getByRole('button', { name: 'Remove the path: Prerequisite for Ouro' }).click();
  await problemsAb.locator('.thread.issue', { hasText: 'A cycle of requirements' }).waitFor({ state: 'detached' });
  check('removing one path of the cycle clears it: nothing else is changed', (await rowsAb('loreLinks')).length === 6);
  // Linked to the actual records: a change naming a system ability makes its holder, and the holder note goes.
  await page.goto(`${baseAb}/characters/${pAb}-mira/progression`);
  await formAb.getByLabel('Its codex entry', { exact: true }).selectOption('');
  await formAb.getByLabel('Its ability in a system', { exact: true }).selectOption({ label: 'Fire Lance' });
  await formAb.getByRole('button', { name: 'Record the change' }).click();
  await page.locator('.progress-tracker').getByText('Recorded: Gained Fire Lance.').waitFor();
  check('a progression change names the system’s own ability', (await rowsAb('progressChanges')).some((c) => c.abilityId === `${pAb}-ember/lance` && c.subject === 'Fire Lance'));
  await page.goto(`${baseAb}/visualize/abilities`);
  await treeAb.waitFor();
  check('…so the tree shows her holding it, and no longer says she holds Flame Wall without it', !(await problemsAb.innerText()).includes('Mira holds Flame Wall without Fire Lance'));
  // Seen around one ability, by keyboard; by source; held by someone; as a list.
  await nodeAb('Iron Fortress').focus();
  await page.keyboard.press('f');
  await page.waitForURL(/afocus=/);
  await treeAb.locator('.ap-node').nth(3).waitFor({ state: 'detached' });
  eq('F shows only one ability’s paths: what leads to it, and what it excludes', await drawnAb(), ['Ember Stance', 'Iron Fortress', 'Iron Stance']);
  await page.getByRole('button', { name: 'Show every path again' }).click();
  await treeAb.locator('.ap-node').nth(5).waitFor();
  await page.getByRole('group', { name: 'Sources' }).getByLabel('Court Ranks · Classes').uncheck();
  await page.waitForURL(/asrc=/);
  await nodeAb('Squire').waitFor({ state: 'detached' });
  check('a source can be set aside, and the view says so', (await page.locator('.ap-controls [role=status]').innerText()).includes('Sources hidden: Court Ranks · Classes.'));
  await page.getByLabel('Involving character', { exact: true }).selectOption({ label: 'Mira' });
  await treeAb.locator('.ap-node.held').nth(2).waitFor();
  check('what one character holds is marked', (await treeAb.locator('.ap-node.held').count()) === 4);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.ap-list').first().waitFor();
  const listAb = (await page.locator('.visualize').innerText()).replace(/\s+/g, ' ');
  check('as a list: every ability with its paths in words, and who holds it', listAb.includes('Prerequisite for Iron Fortress') && listAb.includes('Branches from Spark') && listAb.includes('Its requirement rule names Fire Lance') && listAb.includes('Held by Mira (on their system sheet)'), listAb.slice(0, 500));
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseAb}/visualize/abilities`);
  await treeAb.waitFor();
  check('mobile: the tree fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // The place explorer: nested places at the novel's own levels, what each is tied to, and optional maps (visualization Prompt 39).
  const pPl = await createProject('Places Book');
  const basePl = `${BASE}/project/${pPl}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'timelineEvents', 'chapters'], 'readwrite');
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      for (const [key, name] of [['universe', 'Known Universe'], ['galaxy', 'Milky Way'], ['earth', 'Earth'], ['paris', 'Paris'], ['louvre', 'Louvre'], ['gallery', 'Gallery 7'], ['atlantis', 'Atlantis']]) entry(key, name, 'location');
      entry('mira', 'Mira', 'character');
      entry('guild', 'Thieves Guild', 'faction');
      const inside = (key, from, to) => tx.objectStore('loreLinks').put({ id: `${projectId}-${key}`, projectId, fromId: `${projectId}-${from}`, toId: `${projectId}-${to}`, fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type: 'located-in', createdAt: at });
      inside('l1', 'galaxy', 'universe');
      inside('l2', 'earth', 'galaxy');
      inside('l3', 'paris', 'earth');
      const event = (key, name, more) => tx.objectStore('timelineEvents').put({ id: `${projectId}-${key}`, projectId, name, description: '', when: { precision: 'unknown' }, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at, ...more });
      event('heist', 'The heist', { locationId: `${projectId}-gallery`, characters: [{ id: `${projectId}-mira`, age: null }], nodeIds: [`${projectId}-c1`] });
      event('flood', 'The flood', {});
      tx.objectStore('chapters').put({ id: `${projectId}-c1`, projectId, parentId: null, kind: 'chapter', title: 'The Job', order: 0, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pPl, Date.now()]);
  const rowsPl = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pPl, table]);
  await page.goto(`${basePl}/visualize/places`);
  const treePl = page.getByRole('list', { name: 'Places' });
  await treePl.waitFor();
  const indents = async () => treePl.locator('li').evaluateAll((els) => els.map((el) => `${el.querySelector('.viz-pick').textContent}@${el.style.paddingLeft}`));
  eq('the tree works with no map: what lies inside what, as recorded', await indents(), ['Atlantis@0rem', 'Gallery 7@0rem', 'Known Universe@0rem', 'Milky Way@1.25rem', 'Earth@2.5rem', 'Paris@3.75rem', 'Louvre@0rem']);
  // The novel's levels, from a set to start with.
  await page.getByRole('button', { name: 'Levels of place…' }).click();
  const levelsPl = page.locator('dialog[open]');
  await levelsPl.getByRole('button', { name: 'Start from “Across space”' }).click();
  await levelsPl.getByRole('list', { name: 'Levels, largest first' }).locator('li').nth(8).waitFor();
  check('levels of place come from a set to start with, as the author’s own to change', (await levelsPl.getByLabel('Level 4 name', { exact: true }).inputValue()) === 'Planet');
  await levelsPl.getByLabel('New level', { exact: true }).fill('Vault');
  await levelsPl.getByRole('button', { name: 'Add', exact: true }).click();
  await levelsPl.getByLabel('Level 10 name', { exact: true }).waitFor();
  await levelsPl.getByRole('button', { name: 'Close' }).click();
  // Nesting places and giving each its level, beside the tree.
  const placeIt = async (name, { level, inside }) => {
    await treePl.getByRole('button', { name, exact: true }).click();
    const details = page.getByRole('region', { name: `Place: ${name}` });
    await details.waitFor();
    if (inside) {
      await details.getByLabel('Located in', { exact: true }).selectOption({ label: inside });
      await details.getByText('Saved.').waitFor();
    }
    if (level) {
      await details.getByLabel('Level of place', { exact: true }).selectOption({ label: level });
      await details.getByText('Level saved.').waitFor();
    }
    return details;
  };
  await placeIt('Louvre', { inside: 'Paris', level: 'Building' });
  await placeIt('Gallery 7', { inside: 'Louvre', level: 'Room' });
  await placeIt('Paris', { level: 'City' });
  await treePl.locator('li', { hasText: 'Gallery 7' }).filter({ hasText: 'Room' }).waitFor();
  eq('places nest as deep as the story needs: from the universe to one room', await indents(), ['Atlantis@0rem', 'Known Universe@0rem', 'Milky Way@1.25rem', 'Earth@2.5rem', 'Paris@3.75rem', 'Louvre@5rem', 'Gallery 7@6.25rem']);
  const rowPl = async (name) => (await treePl.locator('li', { has: page.getByRole('button', { name, exact: true }) }).innerText()).replace(/\s+/g, ' ');
  check('each place says what happens there and within, at its level', (await rowPl('Gallery 7')).startsWith('Gallery 7 1 event here') && (await rowPl('Gallery 7')).includes('Room') && (await rowPl('Paris')).includes('no events here yet · 1 event within') && (await rowPl('Paris')).includes('City'), await rowPl('Paris'));
  const earthPl = await placeIt('Earth', {});
  check('a place cannot be put inside what is inside it: those are not offered', !(await earthPl.getByLabel('Located in', { exact: true }).locator('option').allInnerTexts()).some((o) => o.trim() === 'Paris'));
  // Tied to characters, factions, events and chapters.
  const parisPl = await placeIt('Paris', {});
  await parisPl.locator('details.place-tie summary').click();
  for (const record of ['Mira', 'Thieves Guild']) {
    await parisPl.getByLabel('Record to tie', { exact: true }).selectOption({ label: record });
    await parisPl.getByRole('button', { name: 'Tie it' }).click();
    await parisPl.getByText(new RegExp(`^${record}: Located in this$`)).waitFor();
  }
  check('characters and factions are tied to a place, through connections like any other', (await rowsPl('loreLinks')).filter((l) => l.toId === `${pPl}-paris` && l.type === 'located-in' && [`${pPl}-mira`, `${pPl}-guild`].includes(l.fromId)).length === 2);
  const galleryPl = await placeIt('Gallery 7', {});
  const galleryText = (await galleryPl.innerText()).replace(/\s+/g, ' ');
  check('a place lists who takes part in what happens there, the events, and the chapters that tell them', galleryText.includes('Mira: takes part in “The heist”, here') && galleryText.includes('Events here The heist') && galleryText.includes('Ch 1: The Job: tells “The heist”, here'), galleryText);
  const atlantisPl = await placeIt('Atlantis', {});
  await atlantisPl.locator('details.place-tie summary').click();
  await atlantisPl.getByLabel('Event that takes place here', { exact: true }).selectOption({ label: 'The flood' });
  await atlantisPl.getByRole('button', { name: 'Set', exact: true }).click();
  await atlantisPl.getByText('The event now takes place here.').waitFor();
  await atlantisPl.getByLabel('Chapter or scene set here', { exact: true }).selectOption({ label: 'Ch 1: The Job' });
  await atlantisPl.getByRole('button', { name: 'Add', exact: true }).click();
  await atlantisPl.getByText('Added to the chapter’s plan.').waitFor();
  check('an event is set to take place there, and a chapter’s plan includes it, from the place itself', (await rowsPl('timelineEvents')).find((e) => e.name === 'The flood').locationId === `${pPl}-atlantis` && (await rowsPl('chapterPlans')).some((p) => p.entityIds.includes(`${pPl}-atlantis`)));
  // An optional map: places by typed coordinates and by a click; the rest still in the tree.
  await page.getByRole('button', { name: 'Maps…' }).click();
  const mapsPl = page.locator('dialog[open]');
  await mapsPl.getByLabel('New map name', { exact: true }).fill('The Known World');
  await mapsPl.getByRole('button', { name: 'Make the map' }).click();
  await mapsPl.getByLabel('Name of the map The Known World', { exact: true }).waitFor();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await mapsPl.getByLabel('Background image for The Known World', { exact: true }).setInputFiles({ name: 'world.png', mimeType: 'image/png', buffer: png });
  await mapsPl.getByText('Background image set. It stays in this novel, on this device.').waitFor();
  check('a map’s background is an image chosen from this device, kept in the novel', (await rowsPl('worldMaps'))[0].image.startsWith('data:image/png;base64,'));
  await mapsPl.getByRole('button', { name: 'Close' }).click();
  const mapPl = page.getByRole('group', { name: /^The Known World: / });
  await mapPl.waitFor();
  check('the map is drawn over its image, with nothing on it yet; every place is listed as not on it, and stays in the tree', (await mapPl.locator('image').count()) === 1 && (await mapPl.locator('.pm-pin').count()) === 0 && (await page.getByRole('note').filter({ hasText: 'Not on this map (7)' }).count()) === 1 && (await treePl.locator('li').count()) === 7);
  const parisAgain = await placeIt('Paris', {});
  await parisAgain.getByLabel('The Known World: across', { exact: true }).fill('40');
  await parisAgain.getByLabel('The Known World: down', { exact: true }).fill('30');
  await parisAgain.getByRole('button', { name: 'Place', exact: true }).click();
  await mapPl.locator('.pm-pin').waitFor();
  check('a place is put on the map at the coordinates the author types', JSON.stringify((await rowsPl('mapPins')).map((p) => [p.x, p.y])) === '[[40,30]]' && (await mapPl.locator('.pm-pin').getAttribute('aria-label')) === 'Paris: 40 across, 30 down');
  const louvrePl = await placeIt('Louvre', {});
  await louvrePl.getByRole('button', { name: 'by clicking the map' }).click();
  await page.getByText('Click where Louvre is on The Known World.').waitFor();
  await page.locator('.viz-viewport').first().click({ position: { x: 120, y: 90 } });
  await mapPl.locator('.pm-pin').nth(1).waitFor();
  const louvrePin = (await rowsPl('mapPins')).find((p) => p.entryId === `${pPl}-louvre`);
  check('…or where the author clicks on it', Number.isFinite(louvrePin?.x) && Number.isFinite(louvrePin?.y) && (await page.getByText('Click where Louvre is').count()) === 0, JSON.stringify(louvrePin));
  check('places with no coordinates are said, and still listed in the tree', (await rowPl('Atlantis')).includes('no coordinates') && (await rowPl('Paris')).includes('on The Known World') && (await page.getByRole('note').filter({ hasText: 'Not on this map (5)' }).count()) === 1);
  await mapPl.locator('.pm-pin', { hasText: 'Paris' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region', { name: 'Place: Paris' }).waitFor();
  check('a place on the map is reached and selected with the keyboard', decodeURIComponent(page.url()).includes(`select=entry:${pPl}-paris`));
  // A map of one place covers what lies inside it.
  await page.getByRole('button', { name: 'Maps…' }).click();
  await mapsPl.getByLabel('New map name', { exact: true }).fill('Paris streets');
  await mapsPl.getByRole('button', { name: 'Make the map' }).click();
  await mapsPl.getByLabel('What Paris streets is a map of', { exact: true }).selectOption({ label: 'Paris' });
  await settles(async () => (await rowsPl('worldMaps')).find((m) => m.name === 'Paris streets')?.placeId === `${pPl}-paris`);
  await mapsPl.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Map shown', { exact: true }).selectOption({ label: 'Paris streets' });
  await page.getByRole('group', { name: /^Paris streets: / }).waitFor();
  check('a map of one place lists only the places inside it as not on it', (await page.getByRole('note').filter({ hasText: 'Not on this map' }).innerText()).replace(/\s+/g, ' ').includes('Not on this map (2), still in the tree: Louvre, Gallery 7'));
  // Exploring inside one place; the tree as a list alone.
  const parisLast = await placeIt('Paris', {});
  await parisLast.getByRole('button', { name: 'Explore what is inside Paris' }).click();
  await page.getByRole('navigation', { name: 'Exploring inside' }).waitFor();
  check('exploring inside a place: where it is, and only what lies inside it', (await page.getByRole('navigation', { name: 'Exploring inside' }).innerText()).replace(/\s+/g, ' ').startsWith('Known Universe › Milky Way › Earth › Paris') && JSON.stringify(await indents()) === JSON.stringify(['Paris@0rem', 'Louvre@1.25rem', 'Gallery 7@2.5rem']));
  await page.getByRole('button', { name: 'Show every place' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.place-map').waitFor({ state: 'detached' });
  check('as a list, the tree alone', (await treePl.locator('li').count()) === 7);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${basePl}/visualize/places`);
  await treePl.waitFor();
  check('mobile: the explorer and its map fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Journeys: routes and where everyone was; missing times, approximate journeys, and conflicts only when the records settle them (visualization Prompt 40).
  const pJy = await createProject('Journeys Book');
  const baseJy = `${BASE}/project/${pJy}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'timelineEvents', 'worldMaps', 'mapPins'], 'readwrite');
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: `${projectId}-${key}`, projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira', 'character');
      entry('orrin', 'Orrin', 'character');
      for (const [key, name] of [['paris', 'Paris'], ['lyon', 'Lyon'], ['marseille', 'Marseille']]) entry(key, name, 'location');
      tx.objectStore('timelineEvents').put({ id: `${projectId}-feast`, projectId, name: 'The feast', description: '', when: { precision: 'exact', year: 10, month: 3, day: 12, hour: null, minute: null }, duration: null, importance: 'major', locationId: `${projectId}-marseille`, characters: [{ id: `${projectId}-mira`, age: null }], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at });
      tx.objectStore('worldMaps').put({ id: `${projectId}-realm`, projectId, name: 'Realm', placeId: null, width: 100, height: 100, unit: 'leagues', grid: 10, image: null, createdAt: at, updatedAt: at });
      const pin = (key, x, y) => tx.objectStore('mapPins').put({ id: `${projectId}-pin-${key}`, projectId, mapId: `${projectId}-realm`, entryId: `${projectId}-${key}`, x, y, createdAt: at, updatedAt: at });
      pin('paris', 10, 10);
      pin('lyon', 40, 50);
      pin('marseille', 70, 90);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pJy, Date.now()]);
  const rowsJy = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pJy, table]);
  await page.goto(`${baseJy}/visualize/journeys`);
  await page.getByText('No journeys yet.').waitFor();
  check('a novel with no journeys says so', true);
  // A speed only where the author gives one.
  await page.getByRole('button', { name: 'Travel methods…' }).click();
  const methodsJy = page.locator('dialog[open]');
  await methodsJy.getByLabel('New travel method', { exact: true }).fill('By horse');
  await methodsJy.getByRole('button', { name: 'Add', exact: true }).click();
  await methodsJy.getByLabel('Speed of By horse', { exact: true }).fill('30');
  await methodsJy.getByLabel('Speed of By horse', { exact: true }).blur();
  await settles(async () => (await rowsJy('travelSettings'))[0]?.methods[0]?.speed === 30);
  await methodsJy.getByLabel('Distance unit of By horse', { exact: true }).fill('leagues');
  await methodsJy.getByLabel('Distance unit of By horse', { exact: true }).blur();
  await settles(async () => (await rowsJy('travelSettings'))[0]?.methods[0]?.distanceUnit === 'leagues');
  check('a travel method has a speed only when the author gives one', JSON.stringify((await rowsJy('travelSettings'))[0].methods.map((m) => [m.name, m.speed, m.distanceUnit, m.per])) === JSON.stringify([['By horse', 30, 'leagues', 'days']]));
  await methodsJy.getByRole('button', { name: 'Close' }).click();
  // Recording journeys: with dates, with none, approximate.
  const formJy = page.locator('dialog[open]');
  const dateJy = async (which, year, month, day, approx = false) => {
    await formJy.getByLabel(`${which}: when`, { exact: true }).selectOption('date');
    await formJy.getByLabel(`${which}: year`, { exact: true }).fill(String(year));
    await formJy.getByLabel(`${which}: year`, { exact: true }).blur();
    if (approx) await formJy.getByLabel(`${which}: approximately`, { exact: true }).check();
    if (month) {
      await formJy.getByLabel(`${which}: month`, { exact: true }).fill(String(month));
      await formJy.getByLabel(`${which}: month`, { exact: true }).blur();
    }
    if (day) {
      await formJy.getByLabel(`${which}: day`, { exact: true }).fill(String(day));
      await formJy.getByLabel(`${which}: day`, { exact: true }).blur();
    }
  };
  const journeyJy = async ({ who, from, to, leaves, arrives, method, own, after }) => {
    await page.getByRole('button', { name: 'Record a journey' }).click();
    await formJy.getByLabel(`${who} travels`, { exact: true }).check();
    if (from) await formJy.getByLabel('From', { exact: true }).selectOption({ label: from });
    if (to) await formJy.getByLabel('To', { exact: true }).selectOption({ label: to });
    if (leaves) await dateJy('Leaves', ...leaves);
    if (arrives) await dateJy('Arrives', ...arrives);
    if (method) await formJy.getByLabel('Travel method', { exact: true }).selectOption({ label: method });
    if (own) {
      await formJy.getByLabel('Travel method', { exact: true }).selectOption('own');
      await formJy.getByLabel('Travel method, in your own words', { exact: true }).fill(own);
    }
    if (after) await formJy.getByLabel('Comes after', { exact: true }).selectOption({ label: after });
    await formJy.getByRole('button', { name: 'Save the journey' }).click();
    await formJy.waitFor({ state: 'detached' });
  };
  await journeyJy({ who: 'Mira', from: 'Paris', to: 'Lyon', leaves: [10, 3, 1], arrives: [10, 3, 1], method: 'By horse (30 leagues a day)' });
  const conflictsJy = page.getByRole('region', { name: 'Possible conflicts' });
  await conflictsJy.locator('.thread.issue').waitFor();
  check('too fast for its dates, at the author’s speed, over the distance between its places on the map', (await conflictsJy.innerText()).replace(/\s+/g, ' ').includes('Mira, Paris to Lyon: 50 leagues By horse at 30 leagues a day takes at least 1.7 days, but leaving Year 10, March 1 and arriving Year 10, March 1 allows at most 1 day.'), await conflictsJy.innerText());
  await journeyJy({ who: 'Mira', from: 'Lyon', to: 'Marseille', own: 'on foot', after: 'Mira: Paris to Lyon, By horse' });
  await journeyJy({ who: 'Orrin', from: 'Paris', to: 'Marseille', leaves: [10, null, null, true], arrives: [11, null, null, true], method: 'By horse (30 leagues a day)' });
  await journeyJy({ who: 'Mira', from: 'Lyon', to: 'Paris', leaves: [10, 3, 5], arrives: [10, 3, 25] });
  const issuesJy = async () => (await conflictsJy.locator('.thread.issue').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  await settles(async () => (await issuesJy()).length === 2);
  const issues = await issuesJy();
  check('a journey with no times, and an approximate one, flag nothing; an event elsewhere during a journey does', issues.length === 2 && issues[1] === 'Conflict Mira takes part in “The feast” at Marseille while on the journey Lyon to Paris (Year 10, March 5 to Year 10, March 25).', issues.join(' | '));
  check('journeys are kept as recorded: no time, approximate times, the order', (await rowsJy('journeys')).some((j) => j.departure === null && j.arrival === null && j.afterId && j.method === 'on foot') && (await rowsJy('journeys')).some((j) => j.departure?.when?.precision === 'approximate' && j.arrival?.when?.year === 11));
  // A traveller's route, and the map.
  await page.getByLabel('Whose journeys', { exact: true }).selectOption({ label: 'Mira' });
  const storyJy = page.getByRole('list', { name: 'In story time' });
  await storyJy.waitFor();
  eq('her route in story time: each journey, the stay between, the event she is at', (await storyJy.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ Edit Delete$/, '').replace(/ · .*$/, '')), ['leaves Year 10, March 1, arrives Year 10, March 1 Paris to Lyon', 'from Year 10, March 1 until Year 10, March 5 At Lyon', 'leaves Year 10, March 5, arrives Year 10, March 25 Lyon to Paris', 'Year 10, March 12 At Marseille']);
  check('…and the journey with no time, apart, in the order given', (await page.getByRole('list', { name: 'When not known' }).innerText()).replace(/\s+/g, ' ').includes('when is not known; after the journey to Lyon Lyon to Marseille'));
  const routeMapJy = page.getByRole('group', { name: /^Realm: / });
  await routeMapJy.waitFor();
  eq('her routes are drawn on the map, numbered in story order', await routeMapJy.locator('.route-line').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), ['1. Mira: Paris to Lyon, By horse', '2. Mira: Lyon to Paris', '3. Mira: Lyon to Marseille, on foot']);
  // Changing a journey: the conflict goes when the dates allow it.
  await page.getByRole('button', { name: 'Edit the journey Mira: Paris to Lyon, By horse' }).click();
  await formJy.getByLabel('Arrives: day', { exact: true }).fill('3');
  await formJy.getByLabel('Arrives: day', { exact: true }).blur();
  await formJy.getByRole('button', { name: 'Save the journey' }).click();
  await formJy.waitFor({ state: 'detached' });
  await settles(async () => (await issuesJy()).length === 1);
  check('with two more days, the ride fits its dates, and is no longer flagged', (await issuesJy()).length === 1 && !(await issuesJy())[0].includes('By horse'));
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await routeMapJy.waitFor({ state: 'detached' });
  check('as a list: the route alone', (await storyJy.locator('li').count()) === 4);
  // Journeys are connections: the place explorer and the character's history have them.
  await page.goto(`${baseJy}/visualize/places?select=entry:${pJy}-lyon`);
  const lyonJy = page.getByRole('region', { name: 'Place: Lyon' });
  await lyonJy.waitFor();
  const lyonText = await lyonJy.innerText();
  check('a place lists who travels to it and leaves from it', lyonText.includes('Travels to this') && lyonText.includes('Leaves from this'), lyonText);
  await page.goto(`${baseJy}/visualize/history?who=${pJy}-mira`);
  await page.locator('.history-list').first().waitFor();
  check('her life history has each journey', (await page.locator('.visualize').innerText()).replace(/\s+/g, ' ').includes('Travels from Paris to Lyon Journey'));
  await page.goto(`${baseJy}/visualize/journeys`);
  await page.getByRole('button', { name: 'Delete the journey Orrin: Paris to Marseille, By horse' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete the journey' }).click();
  await settles(async () => (await rowsJy('journeys')).length === 3);
  check('a journey is deleted after asking; nothing else is', (await rowsJy('journeys')).length === 3 && (await rowsJy('loreEntries')).length === 5);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.reload();
  await conflictsJy.waitFor();
  check('mobile: journeys fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Factions, influence and item ownership over time, in the main timeline and an alternate history (visualization Prompt 41).
  const pFo = await createProject('Factions Book');
  const baseFo = `${BASE}/project/${pFo}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'timelineEvents', 'alternateHistories', 'chapters'], 'readwrite');
      const id = (k) => `${projectId}-${k}`;
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      for (const [k, n] of [['mira', 'Mira'], ['orrin', 'Orrin'], ['king', 'The King'], ['smith', 'The Smith']]) entry(k, n, 'character');
      entry('guild', 'The Guild', 'faction');
      entry('crown', 'The Crown', 'faction');
      entry('docks', 'The Docks', 'location');
      entry('regalia', 'The Ember Crown', 'item');
      entry('cup', 'A plain cup', 'item');
      const year = (y) => ({ kind: 'date', when: { precision: 'exact', year: y, month: null, day: null, hour: null, minute: null } });
      const ev = (key, name, when) => tx.objectStore('timelineEvents').put({ id: id(key), projectId, name, description: '', when, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at });
      ev('founding', 'The founding', { precision: 'exact', year: 4, month: null, day: null, hour: null, minute: null });
      ev('theft', 'The theft', { precision: 'exact', year: 10, month: 6, day: 1, hour: null, minute: null });
      const theft = { kind: 'event', eventId: id('theft') };
      let n = 0;
      const link = (from, to, type, validity, more = {}) => tx.objectStore('loreLinks').put({ id: id(`l${++n}`), projectId, fromId: id(from), toId: id(to), fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type, ...(validity ? { validity } : {}), createdAt: at + n, ...more });
      link('regalia', 'smith', 'created-by', { from: year(1), until: null });
      link('smith', 'regalia', 'owns', { from: year(1), until: year(5) }, { how: 'made' });
      link('king', 'regalia', 'owns', { from: year(5), until: theft }, { how: 'given' });
      link('mira', 'regalia', 'owns', { from: theft, until: year(12) }, { how: 'stolen', endHow: 'lost' });
      link('orrin', 'regalia', 'owns', { from: year(15), until: null }, { how: 'found' });
      link('mira', 'guild', 'member-of', { from: year(3), until: year(8) }, { endHow: 'expelled' });
      link('mira', 'crown', 'member-of', { from: year(8), until: null }, { how: 'recruited' });
      link('guild', 'crown', 'allied-with', { from: null, until: year(9) });
      link('guild', 'crown', 'at-war-with', { from: year(9), until: null });
      link('guild', 'docks', 'controls', { from: year(2), until: null });
      link('orrin', 'guild', 'leads', null);
      tx.objectStore('alternateHistories').put({ id: id('mercy'), projectId, name: 'Mercy', baseId: null, kind: 'alternate', status: 'alternate', originEventId: null, causeEventId: null, note: '', changed: {}, removed: [id('theft')], added: [], createdAt: at, updatedAt: at });
      tx.objectStore('chapters').put({ id: id('c1'), projectId, parentId: null, kind: 'chapter', title: 'The Fire', order: 0, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pFo, Date.now()]);
  const rowsFo = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pFo, table]);
  // Factions.
  await page.goto(`${baseFo}/visualize/factions`);
  const factionTableFo = page.locator('table.faction-table');
  await factionTableFo.waitFor();
  const factionRow = async (name) => (await factionTableFo.locator('tbody tr', { has: page.getByRole('button', { name, exact: true }) }).innerText()).replace(/\s+/g, ' ');
  const guildEnd = await factionRow('The Guild');
  check('each faction as of the end: its leader (no time given, so nothing assumed), its enemies and territory; members who left are not counted', guildEnd.includes('Orrin (no time given)') && guildEnd.includes('The Crown') && guildEnd.includes('The Docks') && !guildEnd.includes('Mira'), guildEnd);
  check('…and the faction map draws the ties holding then', (await page.getByRole('group', { name: /^Faction map: 2 factions and 2 ties holding/ }).count()) === 1 && (await page.locator('.fm-node').count()) === 3);
  await page.getByLabel('Factions as of', { exact: true }).selectOption({ label: 'The founding' });
  await page.getByRole('group', { name: /^Faction map: 2 factions and 2 ties holding/ }).waitFor();
  const guildFounding = await factionRow('The Guild');
  check('as of an earlier event, the faction as it was: Mira a member, the Crown an ally', guildFounding.includes('Mira') && /The Crown.*The Docks/.test(guildFounding) && (await page.locator('.fm-edge title').allTextContents()).some((t) => t.includes('Allied with')), guildFounding);
  await page.getByLabel('Factions as of', { exact: true }).selectOption('');
  await page.getByLabel('Faction looked at', { exact: true }).selectOption({ label: 'The Guild' });
  const historyFo = page.getByRole('region', { name: 'History of The Guild' });
  await historyFo.waitFor();
  const historyText = (await historyFo.innerText()).replace(/\s+/g, ' ');
  check('how a faction changed: each tie with when and how it began and ended', historyText.includes('Mira is a member from Year 3 until Year 8 (expelled)') && historyText.includes('Orrin leads it no time given') && historyText.includes('At war with The Crown from Year 9'), historyText);
  await historyFo.getByRole('button', { name: 'End: Orrin leads it' }).click();
  const endFo = historyFo.getByRole('form', { name: 'When Orrin leads it ends' });
  await endFo.getByLabel('Ends: when', { exact: true }).selectOption('event');
  await endFo.getByLabel('Ends: event', { exact: true }).selectOption({ label: 'The theft' });
  await endFo.getByLabel('How it ends', { exact: true }).fill('deposed');
  await endFo.getByRole('button', { name: 'End it' }).click();
  await endFo.waitFor({ state: 'detached' });
  check('a tie is ended at a point, with how, and kept as history', (await rowsFo('loreLinks')).some((l) => l.type === 'leads' && l.validity?.until?.eventId === `${pFo}-theft` && l.endHow === 'deposed') && !(await factionRow('The Guild')).includes('Orrin'));
  await page.getByLabel('Faction looked at', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Record a tie' }).click();
  const tieFo = page.locator('dialog[open]');
  await tieFo.getByLabel('Who or what', { exact: true }).selectOption({ label: 'Orrin' });
  await tieFo.getByLabel('Kind of tie', { exact: true }).selectOption('own');
  await tieFo.getByLabel('Your own kind of tie', { exact: true }).fill('Owes a debt to');
  await tieFo.getByLabel('Tied to', { exact: true }).selectOption({ label: 'The Crown' });
  await tieFo.getByRole('button', { name: 'Record the tie' }).click();
  await tieFo.waitFor({ state: 'detached' });
  await factionTableFo.locator('tbody tr', { hasText: 'owes a debt to this' }).waitFor();
  check('a tie of the author’s own kind is listed in its own words', (await factionRow('The Crown')).includes('Orrin owes a debt to this (no time given)'));
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.faction-map').waitFor({ state: 'detached' });
  check('as a list: the table alone', (await factionTableFo.locator('tbody tr').count()) === 2);
  // Ownership.
  await page.goto(`${baseFo}/visualize/ownership`);
  const nowFo = page.locator('.own-now');
  await nowFo.waitFor();
  const chainFo = page.getByRole('list', { name: 'Who has held The Ember Crown, in order' });
  check('an item’s ownership: who holds it now, who made it, each holding in order with how it passed on', (await nowFo.innerText()).includes('Held by Orrin.') && (await page.getByText('Made by The Smith (Year 1).').count()) === 1 && (await chainFo.locator('.own-card').count()) === 4 && (await chainFo.locator('.own-card').nth(1).innerText()).replace(/\s+/g, ' ').includes('until At “The theft” (stolen by Mira)'), await chainFo.innerText());
  check('a stretch with no owner known is said', (await page.getByRole('list', { name: 'Stretches with no owner known' }).innerText()).includes('Not known between Year 12 (lost) and Year 15.'));
  await page.getByLabel('Ownership as of', { exact: true }).selectOption({ label: 'The theft' });
  await nowFo.filter({ hasText: 'Perhaps held by' }).waitFor();
  check('as of the theft itself, it changes hands: either may hold it, and it says so', (await nowFo.innerText()).includes('Perhaps held by The King and Mira (it changes hands at this point, or a time cannot be compared with it).'), await nowFo.innerText());
  await page.getByLabel('Ownership as of', { exact: true }).selectOption('');
  await page.getByLabel('Timeline shown', { exact: true }).selectOption({ label: 'Mercy' });
  await nowFo.filter({ hasText: 'Held by The King and Orrin.' }).waitFor();
  check('in an alternate history without the theft, the King keeps it, and the theft’s holding does not happen there', (await chainFo.locator('.own-holding.not-here').innerText()).includes('Mira') && (await page.getByText('Showing the alternate history “Mercy”').count()) === 1);
  await page.getByLabel('Timeline shown', { exact: true }).selectOption('');
  await page.getByLabel('Item', { exact: true }).selectOption({ label: 'A plain cup' });
  await nowFo.filter({ hasText: 'No owner recorded.' }).waitFor();
  check('an item nobody is recorded as holding says so', true);
  const recordOwn = async (what, who, when) => {
    await page.getByRole('button', { name: 'Record what happens to it' }).click();
    const form = page.locator('dialog[open]');
    await form.getByLabel('What happens', { exact: true }).selectOption(what);
    if (who) await form.getByLabel('Who has it next', { exact: true }).selectOption({ label: who });
    if (when) {
      await form.getByLabel('When: when', { exact: true }).selectOption('node');
      await form.getByLabel('When: chapter or scene', { exact: true }).selectOption(when);
    }
    await form.getByRole('button', { name: 'Record it' }).click();
    await form.waitFor({ state: 'detached' });
  };
  await recordOwn('found', 'Mira');
  await nowFo.filter({ hasText: 'Held by Mira.' }).waitFor();
  check('found by someone, with no time known: held, and said to have no time', (await page.locator('.own-card').innerText()).includes('(no time given)'));
  await recordOwn('destroyed', null, `${pFo}-c1`);
  await nowFo.filter({ hasText: 'Destroyed (Ch 1: The Fire, by Mira).' }).waitFor();
  check('destroyed at a chapter: the holding ends there, and the item says how it ended', (await rowsFo('loreLinks')).some((l) => l.toId === `${pFo}-cup` && l.endHow === 'destroyed' && l.validity?.until?.nodeId === `${pFo}-c1`));
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('table.sessions caption', { hasText: 'Who has held A plain cup' }).waitFor({ state: 'attached' });
  check('as a list: a table of holdings', (await page.locator('table.sessions tbody tr').count()) === 1);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseFo}/visualize/factions`);
  await factionTableFo.waitFor();
  const fitsFo = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.goto(`${baseFo}/visualize/ownership`);
  await nowFo.waitFor();
  check('mobile: both views fit the screen', fitsFo && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Canon and continuity markers on the timeline, the graph, the relationship map and the plot board; the record check's rules (visualization Prompt 42).
  const pCo = await createProject('Canon Book');
  const baseCo = `${BASE}/project/${pCo}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'timelineEvents', 'alternateHistories', 'chapters', 'chapterPlans', 'characterRelations', 'continuityRules', 'canonFacts', 'plotThreads'], 'readwrite');
      const id = (k) => `${projectId}-${k}`;
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira', 'character');
      entry('orrin', 'Orrin', 'character');
      entry('guild', 'The Guild', 'faction');
      entry('crown', 'The Crown', 'faction');
      ['The Gate', 'The Hall', 'The Tomb'].forEach((title, i) => tx.objectStore('chapters').put({ id: id(`c${i + 1}`), projectId, parentId: null, kind: 'chapter', title, order: i, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at }));
      const year = (y) => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });
      const ev = (key, name, when, more = {}) => tx.objectStore('timelineEvents').put({ id: id(key), projectId, name, description: '', when, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, threadIds: [id('t1')], createdAt: at, updatedAt: at, ...more });
      ev('fake', 'The false coronation', year(2), { canon: 'retconned', nodeIds: [id('c1')] });
      ev('feast', 'The feast', year(3), { afterId: id('fake') });
      ev('parley', 'The parley', year(4), { canon: 'provisional' });
      ev('haunting', 'The haunting', year(5), { characters: [{ id: id('mira'), age: null }], nodeIds: [id('c3')] });
      let n = 0;
      const link = (from, to, type, validity, more = {}) => tx.objectStore('loreLinks').put({ id: id(`l${++n}`), projectId, fromId: id(from), toId: id(to), fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type, ...(validity ? { validity } : {}), createdAt: at + n, ...more });
      link('guild', 'crown', 'allied-with', null);
      link('guild', 'crown', 'at-war-with', { from: { kind: 'date', when: year(3) }, until: { kind: 'date', when: year(5) } });
      link('orrin', 'mira', 'distrusts', null, { canon: 'conflicting' });
      tx.objectStore('continuityRules').put({ id: id('dead'), projectId, kind: 'status', entryId: id('mira'), aliases: [], state: 'deceased', label: 'killed at the gate', words: [], scope: 'paragraph', holderId: null, toEntryId: null, amount: null, unit: 'hours', fromNodeId: id('c1'), untilNodeId: null, note: '', createdAt: at, updatedAt: at });
      tx.objectStore('chapterPlans').put({ id: id('c2'), projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', appearIds: [id('mira')], mentionIds: [], updatedAt: at });
      const stage = (sid, startNodeId, preset, label) => ({ id: sid, startNodeId, preset, category: 'social', label, fromRole: '', toRole: '', directional: false, title: '', affinity: 'neutral', event: '', notes: '' });
      tx.objectStore('characterRelations').put({ id: id('r1'), projectId, fromId: id('mira'), toId: id('orrin'), stages: [stage('s1', null, 'friends', 'Friends'), stage('s2', id('c3'), 'rivals', 'Rivals')], createdAt: at, updatedAt: at });
      tx.objectStore('canonFacts').put({ id: id('f1'), projectId, subject: 'The crown', statement: 'Was forged in Year 1', kind: 'lore', status: 'retconned', entryIds: [id('mira')], sources: [], conflictsWith: [], replacedById: null, dismissed: [], history: [], notes: '', createdAt: at, updatedAt: at });
      tx.objectStore('plotThreads').put({ id: id('t1'), projectId, title: 'The succession', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [], notes: '', muted: false, createdAt: at, updatedAt: at });
      tx.objectStore('alternateHistories').put({ id: id('restore'), projectId, name: 'Restoration', baseId: null, kind: 'alternate', status: 'alternate', originEventId: null, causeEventId: null, note: '', changed: { [id('feast')]: { when: year(6) } }, removed: [], added: [], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pCo, Date.now()]);
  const rowsCo = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pCo, table]);
  const recordsCo = async () => JSON.stringify(await Promise.all(['timelineEvents', 'loreLinks', 'chapterPlans', 'characterRelations', 'canonFacts', 'continuityRules', 'chapters'].map(rowsCo)));
  const untouchedCo = await recordsCo();
  await page.goto(`${baseCo}/visualize/timeline`);
  const markCo = (name) => page.getByRole('button', { name: new RegExp(`^${name}, `) });
  await markCo('The feast').waitFor();
  const badgesOff = await page.locator('.mk-badge').count();
  await page.getByRole('checkbox', { name: 'Canon and continuity markers' }).check();
  const barCo = page.getByRole('region', { name: 'Canon and continuity markers' });
  await barCo.getByText(/records marked here/).waitFor();
  await barCo.getByText(/Manuscript checked at/).waitFor();
  const fakeLabel = await markCo('The false coronation').getAttribute('aria-label');
  check('markers are off until asked for; on, each event shows its canon status, in its name too, and the manuscript is checked', badgesOff === 0 && new URL(page.url()).searchParams.get('marks') === '1' && fakeLabel.includes('Canon status: Retconned') && (await markCo('The false coronation').locator('.mk-badge text').textContent()).startsWith('↺') && (await markCo('The parley').getAttribute('aria-label')).includes('Canon status: Provisional'), fakeLabel);
  check('what to check is counted on each event, the most serious named', (await markCo('The haunting').getAttribute('aria-label')).includes('1 to check, 1 critical') && (await markCo('The haunting').locator('.mk-badge.mk-critical').count()) === 1);
  await markCo('The feast').click();
  const detailCo = page.getByRole('region', { name: 'Canon and continuity', exact: true });
  await detailCo.waitFor();
  const feastWhy = (await detailCo.innerText()).replace(/\s+/g, ' ');
  check('a selected record explains each finding: the rule, the data behind it, and where to decide about it', feastWhy.includes('Rests on a set-aside event.') && feastWhy.includes('The rule: What is part of the story as it stands') && feastWhy.includes('Because: “The feast” is Canon, and its “Comes after” is “The false coronation”, whose canon status is Retconned.') && (await detailCo.getByRole('link', { name: 'Decide about it: Record check' }).count()) === 1, feastWhy);
  await barCo.getByText('Every marker in words').click();
  const wordsCo = (await barCo.getByRole('list', { name: 'Every marker in words' }).innerText()).replace(/\s+/g, ' ');
  check('every marker in words, with its rule and what it rests on: the alternative to the drawing', wordsCo.includes('The haunting') && wordsCo.includes('Appears after their recorded death: Mira takes part in “The haunting”, told only after their recorded death.') && wordsCo.includes('Set aside, but still told') && wordsCo.includes('Because:'), wordsCo);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const listCo = page.getByRole('list', { name: 'Events in story order' });
  await listCo.waitFor();
  check('as a list, the same markers in words', (await listCo.locator('li', { hasText: 'The parley' }).innerText()).includes('Canon status: Provisional.'));
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByLabel('Timeline shown', { exact: true }).selectOption({ label: 'Restoration (Alternate Canon)' });
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="The feast, "]')].some((el) => el.getAttribute('aria-label').includes('Alternate branch')));
  check('in an alternate history, an event that goes differently there is marked as an alternate branch', (await markCo('The feast').getAttribute('aria-label')).includes('Canon status: Alternate branch: goes differently in “Restoration” (Alternate Canon).') && (await markCo('The feast').locator('.mk-badge text').textContent()).startsWith('A'));
  await page.getByLabel('Timeline shown', { exact: true }).selectOption('');
  // The knowledge graph: the markers come along, through the address.
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Knowledge graph', exact: true }).click();
  await page.locator('.kg-node[aria-label^="Mira,"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.kg-node[aria-label^="Mira,"]')?.getAttribute('aria-label').includes('to check'));
  const miraNode = await page.locator('.kg-node[aria-label^="Mira,"]').getAttribute('aria-label');
  const distrustLine = await page.locator('.kg-line[aria-label*="distrusts" i]').getAttribute('aria-label');
  check('the knowledge graph marks records and the connections between them', new URL(page.url()).searchParams.get('marks') === '1' && miraNode.includes('critical') && distrustLine.includes('Canon status: Disputed') && (await page.locator('.kg-node .mk-badge').count()) >= 3, `${miraNode} / ${distrustLine}`);
  // The relationship map.
  await page.goto(`${baseCo}/visualize/relationships?marks=1`);
  await page.waitForFunction(() => [...document.querySelectorAll('.rel-line')].some((el) => el.getAttribute('aria-label').includes('to check')));
  const rivalLine = await page.locator('.rel-line[aria-label*="Rivals"]').getAttribute('aria-label');
  check('the relationship map marks a relationship and a connection', rivalLine.includes('1 to check, 1 critical') && (await page.locator('.rel-line[aria-label*="distrusts"]').getAttribute('aria-label')).includes('Canon status: Disputed'), rivalLine);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const relTableCo = page.getByRole('table', { name: 'Relationships and connections shown' });
  await relTableCo.waitFor();
  check('…and its list has a column saying the same', (await relTableCo.locator('th', { hasText: 'Canon and checks' }).count()) === 1 && (await relTableCo.locator('tr', { hasText: 'Rivals' }).innerText()).includes('changes to “Rivals” in Ch 3: The Tomb, after their recorded death'));
  // The plot board.
  await page.goto(`${baseCo}/visualize/plot?marks=1`);
  await page.waitForFunction(() => [...document.querySelectorAll('.pl-cell')].some((el) => el.getAttribute('aria-label').includes('to check')));
  const hauntCell = await page.locator('.pl-cell[aria-label*="The haunting"]').getAttribute('aria-label');
  check('the plot board marks a cell by what is in it: its events and its chapters', hauntCell.includes('critical') && (await page.locator('.pl-cell[aria-label*="The false coronation"]').getAttribute('aria-label')).includes('Canon status: Retconned') && (await page.locator('.pl-cell .mk-badge').count()) >= 2, hauntCell);
  // The record check: each rule, its findings, and decisions about them.
  await page.goto(`${baseCo}/integrity`);
  const rulesCo = page.getByRole('region', { name: 'Canon and continuity rules' });
  await rulesCo.getByRole('heading', { name: 'Allied and at war at once' }).waitFor();
  const rulesText = (await rulesCo.innerText()).replace(/\s+/g, ' ');
  check('the record check lists each rule with its findings and the data behind them', ['Rests on a set-aside event', 'Set aside, but still told', 'Appears after their recorded death', 'Retconned with nothing in its place'].every((t) => rulesText.includes(t)) && rulesText.includes('The rule: Two records cannot be allied with each other and at war with each other at the same time.') && rulesText.includes('Because: “Allied with”: no time given (Confirmed). “At war with”: from Year 3 until Year 5 (Confirmed).'), rulesText.slice(0, 600));
  const appearsCo = 'Mira appears in Ch 2: The Hall, after their recorded death.';
  await rulesCo.getByRole('button', { name: `Mark as intentional: ${appearsCo}` }).click();
  await rulesCo.getByLabel('Why is this intentional?', { exact: true }).fill('Flashback sequence');
  await rulesCo.getByRole('button', { name: 'Save as intentional' }).click();
  await rulesCo.getByRole('button', { name: `Mark as intentional: ${appearsCo}` }).waitFor({ state: 'detached' });
  check('marking a finding intentional keeps the decision, with why, and nothing else changes', (await rowsCo('continuityResolutions')).some((r) => r.key.startsWith('records|after-death|') && r.kind === 'intentional' && r.note === 'Flashback sequence') && (await recordsCo()) === untouchedCo);
  await page.goto(`${baseCo}/visualize/graph?marks=1`);
  await page.locator('.kg-node[aria-label^="Mira,"]').waitFor();
  await barCo.getByText(/records marked here/).waitFor();
  await barCo.getByText('Every marker in words').click();
  const afterDecision = await barCo.getByRole('list', { name: 'Every marker in words' }).innerText();
  check('…and its marker goes, while the others stay', !afterDecision.includes(appearsCo) && afterDecision.includes('Mira takes part in “The haunting”'));
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseCo}/visualize/timeline?marks=1`);
  await barCo.getByText(/records marked here/).waitFor();
  check('mobile: the markers and their bar fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // The continuity review: every check's warnings in one place, by severity and category, with statuses (visualization Prompt 43).
  const pRv = await createProject('Review Book');
  const baseRv = `${BASE}/project/${pRv}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'timelineEvents', 'chapters', 'chapterPlans', 'continuityRules', 'canonFacts'], 'readwrite');
      const id = (k) => `${projectId}-${k}`;
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira', 'character');
      entry('guild', 'The Guild', 'faction');
      entry('guild2', 'the guild', 'faction');
      entry('crown', 'The Crown', 'faction');
      ['The Gate', 'The Hall'].forEach((title, i) => tx.objectStore('chapters').put({ id: id(`c${i + 1}`), projectId, parentId: null, kind: 'chapter', title, order: i, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at }));
      const year = (y) => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });
      tx.objectStore('timelineEvents').put({ id: id('siege'), projectId, name: 'The siege', description: '', when: year(5), end: year(3), duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at });
      let n = 0;
      const link = (from, to, type) => tx.objectStore('loreLinks').put({ id: id(`l${++n}`), projectId, fromId: id(from), toId: id(to), fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type, createdAt: at + n });
      link('guild', 'crown', 'allied-with');
      link('guild', 'crown', 'at-war-with');
      tx.objectStore('continuityRules').put({ id: id('dead'), projectId, kind: 'status', entryId: id('mira'), aliases: [], state: 'deceased', label: '', words: [], scope: 'paragraph', holderId: null, toEntryId: null, amount: null, unit: 'hours', fromNodeId: id('c1'), untilNodeId: null, note: '', createdAt: at, updatedAt: at });
      tx.objectStore('chapterPlans').put({ id: id('c2'), projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', appearIds: [id('mira')], mentionIds: [], updatedAt: at });
      const fact = (key, statement, status) => tx.objectStore('canonFacts').put({ id: id(key), projectId, subject: 'Eyes', statement, kind: 'attribute', status, entryIds: [id('mira')], sources: [], conflictsWith: [], replacedById: null, dismissed: [], history: [], notes: '', createdAt: at + (status === 'canon' ? 0 : 1), updatedAt: at });
      fact('green', 'Green', 'canon');
      fact('grey', 'Grey', 'provisional');
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pRv, Date.now()]);
  const rowsRv = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pRv, table]);
  const recordsRv = async () => JSON.stringify(await Promise.all(['timelineEvents', 'loreLinks', 'loreEntries', 'chapterPlans', 'canonFacts', 'continuityRules', 'chapters'].map(rowsRv)));
  const untouchedRv = await recordsRv();
  await page.goto(baseRv);
  await page.getByRole('link', { name: 'Continuity review', exact: true }).first().click();
  await page.waitForURL(/\/review$/);
  const statusRv = page.getByRole('status').filter({ hasText: /to look at|Nothing to look at/ });
  await statusRv.filter({ hasText: 'to look at:' }).waitFor();
  const deathRv = 'Mira appears in Ch 2: The Hall, after their recorded death.';
  const siegeRv = '“The siege” ends before it starts.';
  const itemRv = (text) => page.locator('.rv-item', { hasText: text });
  const firstStatus = await statusRv.innerText();
  check('the review opens from the sidebar and counts what is to look at, confirmed errors apart from possible inconsistencies', /^\d+ to look at: \d+ confirmed data errors?, \d+ possible inconsistenc(y|ies)/.test(firstStatus), firstStatus);
  const sectionsRv = await page.locator('.review-page > section.panel > h2').allInnerTexts();
  check('organised by severity, most serious first, and by category within', sectionsRv.map((t) => t.split(' (')[0]).join(',') === 'Critical,Warning,Info' && (await page.getByRole('region', { name: 'Critical: Characters and their status' }).locator('.rv-item', { hasText: deathRv }).count()) === 1 && (await page.getByRole('region', { name: 'Warning: Dates and time' }).locator('.rv-item', { hasText: siegeRv }).count()) === 1, sectionsRv.join(' | '));
  const siegeText = (await itemRv(siegeRv).innerText()).replace(/\s+/g, ' ');
  const dupText = (await itemRv('may be the same').innerText()).replace(/\s+/g, ' ');
  check('each warning says whether it is a confirmed data error or a possible inconsistency, with its rule and the data behind it', /CONFIRMED DATA ERROR|Confirmed data error/.test(siegeText) && siegeText.includes('The rule: An event cannot end before it begins.') && siegeText.includes('Because: It starts Year 5 and ends Year 3.') && /POSSIBLE INCONSISTENCY|Possible inconsistency/.test(dupText) && (await itemRv('appears to').first().locator('.rv-possible').count()) === 1, `${siegeText} / ${dupText}`);
  await page.getByLabel('Group by', { exact: true }).selectOption('category');
  await page.getByRole('heading', { name: /^Dates and time/, level: 2 }).waitFor();
  check('…or by category first, then severity', new URL(page.url()).searchParams.get('by') === 'category' && (await page.getByRole('region', { name: 'Records that look alike: Info' }).count()) === 1);
  await page.getByLabel('Group by', { exact: true }).selectOption('severity');
  await page.getByLabel('Certainty', { exact: true }).selectOption('possible');
  await itemRv(siegeRv).waitFor({ state: 'detached' });
  check('filtered to possible inconsistencies, only those are listed', (await page.locator('.rv-item .rv-error').count()) === 0 && (await page.locator('.rv-item .rv-possible').count()) >= 2);
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await itemRv(siegeRv).waitFor();
  // Statuses, with notes.
  const setStatusRv = async (message, status, note) => {
    // By part of the warning's words: the button and the form are named with the whole message.
    await page.locator(`button[aria-label^="Set the status of: "][aria-label*=${JSON.stringify(message)}]`).click();
    const form = page.locator(`form[aria-label^="Status of: "][aria-label*=${JSON.stringify(message)}]`);
    await form.getByRole('radio', { name: status, exact: true }).check();
    if (note !== null) await form.getByLabel('Note (optional)', { exact: true }).fill(note);
    await form.getByRole('button', { name: 'Save the status' }).click();
    await form.waitFor({ state: 'detached' });
  };
  await setStatusRv(siegeRv, 'Needs review', 'Ask my editor');
  await itemRv(siegeRv).locator('.rv-status').waitFor();
  check('needs review: kept on the list to look at, marked, with the note, and stored', (await itemRv(siegeRv).innerText()).includes('Your note: Ask my editor') && /needs review/i.test(await itemRv(siegeRv).locator('.rv-status').innerText()) && (await rowsRv('continuityResolutions')).some((r) => r.key.startsWith('timeline|dates|') && r.kind === 'review' && r.note === 'Ask my editor'));
  await setStatusRv(deathRv, 'Intentional', 'Flashback');
  await itemRv(deathRv).waitFor({ state: 'detached' });
  await setStatusRv('may be the same', 'Ignored', null);
  await itemRv('may be the same').waitFor({ state: 'detached' });
  await setStatusRv('The Guild and The Crown are recorded as allied and at war at the same time.', 'Resolved', 'Fixed in the draft');
  await itemRv('allied and at war').waitFor({ state: 'detached' });
  const storedRv = (await rowsRv('continuityResolutions')).map((r) => `${r.key.split('|')[0]}:${r.kind}:${r.note}`).sort();
  check('intentional, ignored and resolved: each leaves the list to look at, kept with its note', JSON.stringify(storedRv) === JSON.stringify(['integrity:dismissed:', 'records:intentional:Flashback', 'records:resolved:Fixed in the draft', 'timeline:review:Ask my editor']), JSON.stringify(storedRv));
  await page.reload();
  await statusRv.filter({ hasText: 'need review' }).waitFor();
  await page.getByRole('radio', { name: /^Decided/ }).click();
  await itemRv(deathRv).waitFor();
  check('kept: after a reload, the decided warnings are listed with their status and note', (await itemRv(deathRv).innerText()).includes('Your note: Flashback') && /intentional/i.test(await itemRv(deathRv).locator('.rv-status').innerText()) && /ignored/i.test(await itemRv('may be the same').locator('.rv-status').innerText()));
  await setStatusRv('may be the same', 'Open', null);
  await itemRv('may be the same').waitFor({ state: 'detached' });
  check('set back to open: the decision is withdrawn, and the warning is to look at again', !(await rowsRv('continuityResolutions')).some((r) => r.key.startsWith('integrity|')));
  // The checks' own pages read the same decisions.
  await page.goto(`${baseRv}/integrity`);
  // The page draws once its records are read: wait for it before reading what the decisions leave on it.
  await page.getByRole('region', { name: 'Canon and continuity rules' }).waitFor();
  await page.getByRole('button', { name: /^Not duplicates/ }).waitFor();
  check('the record check’s own page reads the same decisions: decided ones are off its open list', (await page.getByRole('button', { name: `Mark as intentional: ${deathRv}` }).count()) === 0 && (await page.getByRole('button', { name: /^Not duplicates/ }).count()) === 1);
  // From a warning to its record, and to its context.
  await page.goto(`${baseRv}/review`);
  await itemRv(siegeRv).waitFor();
  await itemRv(siegeRv).getByRole('link', { name: 'The siege', exact: true }).click();
  await page.waitForURL(/\/timeline\?event=/);
  check('a warning opens its record where it is kept', new URL(page.url()).searchParams.get('event') === `${pRv}-siege`);
  await page.goBack();
  await itemRv(siegeRv).getByRole('link', { name: 'See it on the timeline' }).click();
  await page.waitForURL(/\/visualize\/timeline\?/);
  await page.getByRole('region', { name: 'Canon and continuity', exact: true }).waitFor();
  check('…and in context: the timeline, with the markers on and the event selected and explained', new URL(page.url()).searchParams.get('marks') === '1' && new URL(page.url()).searchParams.get('select') === `event:${pRv}-siege` && (await page.getByRole('region', { name: 'Canon and continuity', exact: true }).innerText()).includes('Ends before it starts.'));
  await page.goBack();
  await itemRv(siegeRv).getByRole('link', { name: 'Where it is checked: Timeline review' }).click();
  await page.waitForURL(/\/timeline\/review$/);
  await page.getByRole('heading', { name: 'Timeline review', level: 1 }).waitFor();
  check('…and the page of the check that raised it, where it is listed too', (await page.getByText(siegeRv).count()) === 1);
  check('only the decisions were written: every record is as it was', (await recordsRv()) === untouchedRv);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseRv}/review`);
  await itemRv(siegeRv).waitFor();
  check('mobile: the review fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Charts of what is recorded: words, lengths, appearances, threads, events, points of view, categories (visualization Prompt 44).
  const pCh = await createProject('Charts Book');
  const baseCh = `${BASE}/project/${pCh}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'timelineEvents', 'chapters', 'chapterPlans', 'plotThreads'], 'readwrite');
      const id = (k) => `${projectId}-${k}`;
      for (const [k, name] of [['mira', 'Mira'], ['orrin', 'Orrin'], ['tam', 'Tam']]) tx.objectStore('loreEntries').put({ id: id(k), projectId, category: 'character', name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      const node = (key, title, kind, parentId, order, wordCount) => tx.objectStore('chapters').put({ id: id(key), projectId, parentId: parentId && id(parentId), kind, title, order, summary: '', notes: '', status: 'idea', wordCount, charCount: wordCount * 5, mentions: [], createdAt: at, updatedAt: at });
      node('c1', 'The Gate', 'chapter', null, 0, 0);
      node('s1', 'Arrival', 'scene', 'c1', 0, 1200);
      node('s2', 'Night', 'scene', 'c1', 1, 800);
      node('c2', 'The Hall', 'chapter', null, 1, 2600);
      node('c3', 'The Tomb', 'chapter', null, 2, 0);
      node('c4', 'The Keep', 'chapter', null, 3, 1500);
      const plan = (key, more) => tx.objectStore('chapterPlans').put({ id: id(key), projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', appearIds: [], mentionIds: [], updatedAt: at, ...more });
      plan('s1', { appearIds: [id('mira')], mentionIds: [id('orrin')] });
      plan('c2', { appearIds: [id('mira')], povIds: [id('mira')], labels: ['Action'] });
      plan('c4', { appearIds: [id('orrin')], povIds: [id('orrin')] });
      const year = (y) => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });
      const ev = (key, name, when, more = {}) => tx.objectStore('timelineEvents').put({ id: id(key), projectId, name, description: '', when, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at, ...more });
      ev('siege', 'The siege', year(10), { nodeIds: [id('c2')], threadIds: [id('quest')] });
      ev('truce', 'The truce', year(10), { nodeIds: [id('c4')] });
      ev('duel', 'The duel', year(13), { nodeIds: [id('c4')] });
      ev('rumour', 'A rumour', { precision: 'unknown' });
      tx.objectStore('plotThreads').put({ id: id('quest'), projectId, title: 'The quest', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [{ id: 'b1', nodeId: id('c1'), title: 'A map', note: '', role: 'introduction' }, { id: 'b2', nodeId: id('c2'), title: 'The siege', note: '', role: 'development' }], notes: '', muted: false, createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pCh, Date.now()]);
  const rowsCh = (table) => page.evaluate(([projectId, name]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { open.result.close(); resolve(req.result.filter((r) => r.projectId === projectId)); };
    };
  }), [pCh, table]);
  const recordsCh = async () => JSON.stringify(await Promise.all(['chapters', 'chapterPlans', 'timelineEvents', 'plotThreads', 'loreEntries'].map(rowsCh)));
  await page.goto(`${baseCh}/visualize`);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Charts', exact: true }).click();
  const cardCh = (title) => page.locator('.chart-card').filter({ has: page.getByRole('heading', { name: title, level: 3 }) });
  await cardCh('Words per chapter').waitFor();
  const untouchedCh = await recordsCh();
  const titlesCh = await page.locator('.chart-card h3').allInnerTexts();
  check('seven charts, each saying what data it uses', JSON.stringify(titlesCh) === JSON.stringify(['Words per chapter', 'How long chapters are', 'Character appearances', 'Plot-thread presence', 'Events per year of story time', 'Point of view', 'Your scene categories']) && (await page.locator('.chart-card', { hasText: 'Uses:' }).count()) === 7, JSON.stringify(titlesCh));
  const columnsCh = cardCh('Words per chapter').getByRole('listitem');
  check('words per chapter: one column a chapter, a chapter counting its scenes, named with its value for a screen reader', (await columnsCh.count()) === 4 && (await columnsCh.nth(0).getAttribute('aria-label')).startsWith('Ch 1: The Gate: 2,000 words.') && (await cardCh('Words per chapter').innerText()).includes('4 chapters, 6,100 words in all; the most words: Ch 2: The Hall (2,600).'));
  await columnsCh.nth(1).hover();
  check('a column’s value shows on hover', await columnsCh.nth(1).locator('.chart-tip').isVisible() && (await columnsCh.nth(1).locator('.chart-tip').innerText()).includes('2,600 words'));
  await columnsCh.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForURL(/select=node/);
  await cardCh('Words per chapter').locator('.chart-col.selected').waitFor();
  check('one stop in the tab order: arrows move between columns, Enter selects the chapter', new URL(page.url()).searchParams.get('select') === `node:${pCh}-c2` && (await columnsCh.nth(1).getAttribute('class')).includes('selected'));
  check('a chapter not written yet is shown at zero and said, not called short', (await cardCh('Words per chapter').innerText()).includes('1 chapter has no words yet; shown at zero, not as short.'));
  const appearCh = cardCh('Character appearances');
  check('character appearances from any record: names as buttons, values at the tip, the unrecorded said', (await appearCh.getByRole('button', { name: /^Mira: 2 chapters\./ }).count()) === 1 && (await appearCh.getByRole('button', { name: /^Orrin: 2 chapters\./ }).count()) === 1 && (await appearCh.innerText()).includes('1 character has nothing recorded in these chapters'));
  await page.getByLabel('Appearances counted from', { exact: true }).selectOption('page');
  await appearCh.getByRole('button', { name: /^Orrin: 1 chapter\./ }).waitFor();
  check('…or only from appearance records, as the author chooses', new URL(page.url()).searchParams.get('ccount') === 'page' && (await appearCh.innerText()).includes('Your appearance records only'));
  const eventsCh = cardCh('Events per year of story time');
  check('events over story time: every year in the stretch, empty ones too, and the undated said', (await eventsCh.getByRole('listitem').count()) === 4 && (await eventsCh.innerText()).includes('1 event has no date that can be placed, and is not counted.'));
  check('points of view and the author’s categories, as recorded on the plans', (await cardCh('Point of view').getByRole('button', { name: /^Mira: 1 chapter or scene\. 1 chapter or scene, 2,600 words/ }).count()) === 1 && (await cardCh('Your scene categories').innerText()).includes('Action'));
  // Filters, in one row, scoping every chart.
  await page.getByLabel('Charts from chapter', { exact: true }).selectOption({ label: '2. The Hall' });
  await page.getByLabel('Charts to chapter', { exact: true }).selectOption({ label: '3. The Tomb' });
  await columnsCh.nth(2).waitFor({ state: 'detached' });
  check('a chapter range scopes every chart: words, appearances, events', (await columnsCh.count()) === 2 && (await eventsCh.getByRole('listitem').count()) === 1 && (await appearCh.locator('.viz-barlist').getByRole('button').count()) === 1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await columnsCh.nth(3).waitFor();
  await page.getByLabel('Charts for point of view', { exact: true }).selectOption({ label: 'Orrin' });
  await columnsCh.nth(1).waitFor({ state: 'detached' });
  check('a point of view scopes them: only the chapters told from it', (await columnsCh.count()) === 1 && (await columnsCh.first().getAttribute('aria-label')).startsWith('Ch 4: The Keep: 1,500 words.'));
  await page.getByLabel('Charts for point of view', { exact: true }).selectOption({ label: 'Tam' });
  await cardCh('Words per chapter').locator('.viz-state.empty').waitFor();
  check('when nothing is recorded for what is asked, each chart says so in an empty state of its own', (await cardCh('Words per chapter').innerText()).includes('No chapters or scenes match these filters.') && (await cardCh('Point of view').innerText()).includes('No point of view is recorded in the chapters and scenes that match these filters.') && (await page.locator('.chart-card .viz-state.empty').count()) === 7);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  // The charts draw again without the filter first: every year of the stretch is back.
  await eventsCh.getByRole('listitem').nth(3).waitFor();
  await page.getByLabel('Story years from', { exact: true }).fill('12');
  await eventsCh.getByRole('listitem').nth(2).waitFor({ state: 'detached' });
  check('story years scope the events chart, from the year asked', (await eventsCh.getByRole('listitem').count()) === 2 && new URL(page.url()).searchParams.get('cyfrom') === '12' && (await eventsCh.getByRole('listitem').first().getAttribute('aria-label')).startsWith('Year 12: 0 events'));
  await page.getByRole('button', { name: 'Clear filters' }).click();
  // The table twin, and the data as a file.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('table', { name: 'Words per chapter, as a table' }).waitFor();
  check('as a list, every chart is a table', (await page.locator('.chart-card table').count()) === 7 && (await page.getByRole('table', { name: 'Point of view, as a table' }).innerText()).includes('Orrin'));
  const [csvCh] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the data of “Words per chapter” as a CSV file' }).click()]);
  const csvText = readFileSync(await csvCh.path(), 'utf8');
  check('the data downloads as a CSV file, marked as UTF-8 for spreadsheets', csvCh.suggestedFilename() === 'charts-book-words.csv' && csvText.startsWith('﻿Chapter,Words\r\nCh 1: The Gate,2000\r\n'), `${csvCh.suggestedFilename()} ${JSON.stringify(csvText.slice(0, 60))}`);
  check('looking, filtering and downloading changed no record', (await recordsCh()) === untouchedCh);
  // A point of view recorded on a plan, through the plan itself, is counted.
  await page.goto(`${baseCh}/organizer`);
  await page.locator('.outline-row', { hasText: 'Night' }).click();
  await page.locator('.organizer-details').getByLabel('Add whose point of view it is told from').selectOption({ label: 'Tam' });
  await settles(async () => (await rowsCh('chapterPlans')).some((p) => p.id === `${pCh}-s2` && p.povIds?.[0] === `${pCh}-tam`));
  await page.goto(`${baseCh}/visualize/charts`);
  await cardCh('Point of view').getByRole('button', { name: /^Tam: 1 chapter or scene\./ }).waitFor();
  check('a point of view recorded on a scene’s plan is counted, with its words', (await cardCh('Point of view').getByRole('button', { name: /^Tam: 1 chapter or scene\. 1 chapter or scene, 800 words/ }).count()) === 1);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.reload();
  await cardCh('Words per chapter').waitFor();
  check('mobile: the charts fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // Exporting a view: print or PDF, pictures, records and tables; names in any script, long ones, a large view, an empty one, offline (visualization Prompt 46).
  const pEx = await createProject('Le Château — 東京');
  const baseEx = `${BASE}/project/${pEx}`;
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'timelineEvents', 'chapters', 'characterRelations'], 'readwrite');
      const id = (k) => `${projectId}-${k}`;
      const entry = (key, name, category, notes = '') => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes, tags: [], fields: [], createdAt: at, updatedAt: at });
      entry('mira', 'Mira Ångström', 'character', 'She is the traitor.');
      entry('orrin', 'Орин', 'character');
      entry('guild', 'The Guild of the Very Long Name That Goes On and On Beyond Any Reasonable Width For a Label', 'faction');
      entry('tokyo', '東京', 'location');
      tx.objectStore('chapters').put({ id: id('c1'), projectId, parentId: null, kind: 'chapter', title: 'Глава первая', order: 0, summary: '', notes: 'Cut this chapter?', status: 'idea', wordCount: 900, charCount: 4000, mentions: [], createdAt: at, updatedAt: at });
      const year = (y) => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });
      const ev = (key, name, when, more = {}) => tx.objectStore('timelineEvents').put({ id: id(key), projectId, name, description: '', when, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: at, updatedAt: at, ...more });
      ev('siege', 'Le siège de Ærøskøbing', year(10), { characters: [{ id: id('mira'), age: null }], locationId: id('tokyo'), nodeIds: [id('c1')] });
      ev('omega', 'Ωμέγα: the last war', year(12));
      tx.objectStore('loreLinks').put({ id: id('l1'), projectId, fromId: id('mira'), toId: id('guild'), fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type: 'member-of', createdAt: at });
      tx.objectStore('characterRelations').put({ id: id('r1'), projectId, fromId: id('mira'), toId: id('orrin'), stages: [{ id: 's1', startNodeId: null, preset: 'rivals', category: 'social', label: 'Rivals', fromRole: '', toRole: '', directional: false, title: '', affinity: 'neutral', event: '', notes: '' }], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pEx, Date.now()]);
  const downloadEx = async (format) => {
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('radio', { name: format }).check();
    const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
    return { name: file.suggestedFilename(), bytes: readFileSync(await file.path()) };
  };
  const openExport = async () => {
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.locator('dialog[open]').waitFor();
  };
  // The timeline, drawn, filtered to Mira.
  await page.goto(`${baseEx}/visualize/timeline?chars=${pEx}-mira`);
  await page.getByRole('button', { name: /^Le siège de Ærøskøbing, / }).waitFor();
  await openExport();
  const dialogEx = page.locator('dialog[open]');
  check('the export says what comes with it: title, novel, date, and the filters in words', (await dialogEx.getByRole('list', { name: 'Filters and settings exported with it' }).innerText()).includes('Involving: Mira Ångström') && (await dialogEx.innerText()).includes('not a backup'));
  const jsonEx = await downloadEx(/^Records \(JSON\)/);
  const envelopeEx = JSON.parse(jsonEx.bytes.toString('utf8'));
  check('records: the events as kept, with their ids, the names they point at, the filters, the date, and that it is not a backup', jsonEx.name === `Le-Château-東京-timeline-${new Date().toISOString().slice(0, 10)}.json` && envelopeEx.format === 'novel-builder/view-export' && envelopeEx.records.events.length === 1 && envelopeEx.records.events[0].name === 'Le siège de Ærøskøbing' && envelopeEx.records.events[0].id === `${pEx}-siege` && envelopeEx.names[`${pEx}-tokyo`] === '東京' && envelopeEx.filters.includes('Involving: Mira Ångström') && !Number.isNaN(Date.parse(envelopeEx.exportedAt)) && envelopeEx.notABackup.includes('not a backup'), `${jsonEx.name} ${JSON.stringify(envelopeEx).slice(0, 300)}`);
  const svgEx = await downloadEx(/^Picture \(SVG\)/);
  const svgText = svgEx.bytes.toString('utf8');
  check('a picture (SVG): the drawing, framed with its title, the novel, the filters and its legend, in any script', svgText.startsWith('<?xml') && svgText.includes('Timeline: Le Château — 東京') && svgText.includes('Involving: Mira Ångström') && svgText.includes('Exact moment') && svgText.includes('Le siège de Ærøskøbing'), svgText.slice(0, 200));
  const pngEx = await downloadEx(/^Picture \(PNG\)/);
  check('a picture (PNG): a real image, sized to the framed drawing', pngEx.bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && pngEx.bytes.readUInt32BE(16) > 500 && pngEx.bytes.readUInt32BE(20) > 100, `${pngEx.bytes.length} bytes`);
  await dialogEx.getByRole('radio', { name: /^Print, or save as PDF/ }).check();
  await dialogEx.getByRole('button', { name: 'Export', exact: true }).click();
  const printEx = page.locator('iframe.viz-print-frame').last();
  await printEx.waitFor({ state: 'attached' });
  const printHtmlEx = await printEx.getAttribute('srcdoc');
  check('print: a page laid out for paper, with the title, the filters, the drawing and its legend, the records in words, and that it is not a backup', printHtmlEx.includes('<meta charset="utf-8">') && printHtmlEx.includes('<h1>Timeline: Le Château — 東京</h1>') && printHtmlEx.includes('Involving: Mira Ångström') && printHtmlEx.includes('<svg') && printHtmlEx.includes('Exact moment') && /<main class="data">[\s\S]*Le siège de Ærøskøbing/.test(printHtmlEx) && printHtmlEx.includes('not a backup') && !printHtmlEx.includes('<button'), printHtmlEx.slice(0, 300));
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  await dialogEx.waitFor({ state: 'detached' });
  // As a list: a table file; and no picture of a drawing that is not shown.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('list', { name: 'Events in story order' }).waitFor();
  await openExport();
  check('as a list, a picture is not offered, and it says why', (await dialogEx.getByRole('radio', { name: /^Picture \(PNG\)/ }).isDisabled()) && (await dialogEx.innerText()).includes('Show the view drawn to make a picture of it.'));
  const csvEx = await downloadEx(/^Table \(CSV\)/);
  const csvTextEx = csvEx.bytes.toString('utf8');
  check('a table (CSV): marked UTF-8, with the export’s date and filters, then the view’s list', csvTextEx.startsWith('﻿') && csvTextEx.includes('Involving: Mira Ångström') && csvTextEx.includes('Events in story order') && csvTextEx.includes('Le siège de Ærøskøbing'), JSON.stringify(csvTextEx.slice(0, 200)));
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  // Private notes: left out of the knowledge graph's records unless the author asks.
  await page.goto(`${baseEx}/visualize/graph`);
  await page.locator('.kg-node').first().waitFor();
  await openExport();
  const plainGraph = JSON.parse((await downloadEx(/^Records \(JSON\)/)).bytes.toString('utf8'));
  await dialogEx.getByLabel('Include private notes (on codex entries, chapters and scenes)').check();
  const privateGraph = JSON.parse((await downloadEx(/^Records \(JSON\)/)).bytes.toString('utf8'));
  check('private notes are left out unless asked for, and the file says so', !JSON.stringify(plainGraph).includes('She is the traitor.') && !JSON.stringify(plainGraph).includes('Cut this chapter?') && plainGraph.leftOut.some((l) => l.startsWith('Private notes')) && JSON.stringify(privateGraph).includes('She is the traitor.') && plainGraph.records.entries.some((e) => e.name.startsWith('The Guild of the Very Long Name')));
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  // An empty view: secrets and knowledge, with no secrets.
  await page.goto(`${baseEx}/visualize/knowledge`);
  await page.locator('.viz-state.empty').waitFor();
  await openExport();
  const emptyEx = JSON.parse((await downloadEx(/^Records \(JSON\)/)).bytes.toString('utf8'));
  check('an empty view exports what it says, and that secrets are left out', emptyEx.empty.startsWith('No secrets yet.') && emptyEx.leftOut.some((l) => l.startsWith('Secrets')) && !emptyEx.records.secrets);
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  // Offline: everything is made in the browser.
  await page.goto(`${baseEx}/visualize/relationships`);
  await page.locator('.rel-line').first().waitFor();
  // A novel synced by the earlier tests keeps trying to reach its server in the background; while offline that fails, as it should, and is not the export's.
  const errorsBeforeOffline = typeof errors === 'undefined' ? 0 : errors.length;
  await context.setOffline(true);
  await openExport();
  const offlineSvg = (await downloadEx(/^Picture \(SVG\)/)).bytes.toString('utf8');
  const offlineJson = JSON.parse((await downloadEx(/^Records \(JSON\)/)).bytes.toString('utf8'));
  await context.setOffline(false);
  if (typeof errors !== 'undefined') errors.splice(errorsBeforeOffline, errors.length - errorsBeforeOffline, ...errors.slice(errorsBeforeOffline).filter((e) => !e.includes('net::ERR_INTERNET_DISCONNECTED')));
  check('offline, a picture and the records are still made', offlineSvg.includes('Relationship map: Le Château — 東京') && offlineJson.records.relations.length === 1);
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  // A large view: 150 characters and 300 relationships.
  const pExBig = await createProject('Export Court');
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'characterRelations'], 'readwrite');
      for (let i = 0; i < 150; i++) tx.objectStore('loreEntries').put({ id: `${projectId}-c${i}`, projectId, category: 'character', name: `Courtier ${String(i).padStart(3, '0')} 宮廷`, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      for (let i = 0; i < 300; i++) tx.objectStore('characterRelations').put({ id: `${projectId}-r${i}`, projectId, fromId: `${projectId}-c${i % 150}`, toId: `${projectId}-c${(i * 7 + 1) % 150}`, stages: [{ id: `s${i}`, startNodeId: null, preset: 'friends', category: 'social', label: 'Friends', fromRole: '', toRole: '', directional: false, title: '', affinity: 'neutral', event: '', notes: '' }], createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [pExBig, Date.now()]);
  await page.goto(`${BASE}/project/${pExBig}/visualize/relationships`);
  await page.getByRole('group', { name: /^Relationship map of 150 characters/ }).waitFor();
  await openExport();
  const bigStartedEx = Date.now();
  const bigPngEx = await downloadEx(/^Picture \(PNG\)/);
  const bigJsonEx = JSON.parse((await downloadEx(/^Records \(JSON\)/)).bytes.toString('utf8'));
  check('a large view: the picture and all 300 relationships with their 150 characters, in good time', bigPngEx.bytes.subarray(0, 4).toString('hex') === '89504e47' && bigJsonEx.records.relations.length === 300 && bigJsonEx.records.characters.length === 150 && Date.now() - bigStartedEx < 20000, `${Date.now() - bigStartedEx} ms`);
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseEx}/visualize/timeline`);
  await openExport();
  check('mobile: the export dialog fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('dialog[open]').getBoundingClientRect().right <= window.innerWidth + 1));
  await dialogEx.getByRole('button', { name: 'Done' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseV}/visualize/timeline`);

  // A large novel: the views stay usable, and nothing chosen is lost (visualization Prompt 47). Times are measured by `npm run test:perf`.
  const pLarge = await createProject('Large Novel Check');
  const baseLarge = `${BASE}/project/${pLarge}`;
  const rowsLarge = bigNovel(pLarge, Date.now(), 1);
  await page.evaluate((rows) => new Promise((resolve, reject) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(Object.keys(rows), 'readwrite');
      for (const [table, list] of Object.entries(rows)) for (const row of list) tx.objectStore(table).put(row);
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), rowsLarge);
  const parentLarge = (id) => page.evaluate((id) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const req = open.result.transaction('chapters').objectStore('chapters').get(id);
      req.onsuccess = () => { open.result.close(); resolve(req.result?.parentId); };
    };
  }), id);
  // Character appearances: 120 chapters and hundreds of characters, drawn in steps.
  await page.goto(`${baseLarge}/visualize/appearances`);
  const matrixLarge = page.locator('table.ap-matrix tbody tr');
  await matrixLarge.first().waitFor();
  const moreLarge = page.locator('.ap-more');
  const recordedLarge = Number((await page.locator('.ap-facts').innerText()).match(/^(\d+) characters/)[1]);
  check('a large appearance matrix is drawn in steps: the first 50 characters, and how many there are', (await matrixLarge.count()) === 50 && recordedLarge > 100 && (await moreLarge.innerText()).includes(`Showing the first 50 of ${recordedLarge} characters`), `${await matrixLarge.count()} rows; ${await moreLarge.innerText()}`);
  await moreLarge.getByRole('button', { name: 'Show 50 more' }).click();
  await matrixLarge.nth(99).waitFor();
  check('…and more when asked', (await matrixLarge.count()) === 100 && (await moreLarge.innerText()).includes(`Showing the first 100 of ${recordedLarge}`));
  // A cell chosen far down the list (in the address, as after a reload or from a link) has its row drawn, and stays chosen.
  const farLarge = Math.max(...rowsLarge.chapterPlans.flatMap((p) => p.appearIds).map((id) => Number(id.split('-char').pop())));
  await page.goto(`${baseLarge}/visualize/appearances?acell=${pLarge}-char${farLarge}~${pLarge}-ch0`);
  await page.locator('table.ap-matrix td.chosen').waitFor();
  check('a chosen cell beyond the first rows is drawn and still chosen, not lost', (await page.locator('table.ap-matrix tbody tr', { has: page.locator('td.chosen') }).innerText()).includes(`Character ${String(farLarge).padStart(4, '0')}`) && (await matrixLarge.count()) > 100, `Character ${farLarge}, ${await matrixLarge.count()} rows`);
  // The scene board: on a large board, a card's "Move to…" menu is filled when it is opened, and still moves the scene.
  await page.goto(`${baseLarge}/board`);
  const moveLarge = page.getByLabel('Move Scene 1.1 to chapter', { exact: true });
  await moveLarge.waitFor();
  const optionsBefore = await moveLarge.locator('option').count();
  await moveLarge.focus();
  const optionsAfter = await moveLarge.locator('option').count();
  await moveLarge.selectOption({ label: 'Chapter 120' });
  await settles(async () => (await parentLarge(`${pLarge}-sc0-0`)) === `${pLarge}-ch119`);
  const movedLarge = await parentLarge(`${pLarge}-sc0-0`);
  check('a large board’s “Move to…” menu is filled when it is opened, and moves the scene', optionsBefore === 1 && optionsAfter === 120 && movedLarge === `${pLarge}-ch119`, `${optionsBefore} → ${optionsAfter} options, moved to ${movedLarge}`);
  // The dashboard reads 800 characters against the whole manuscript.
  await page.goto(`${baseLarge}/dashboard`);
  const castLarge = page.getByText(/^800 characters · \d+ appears? in the manuscript/);
  await castLarge.waitFor({ timeout: 15000 });
  check('the dashboard opens on a large novel, with its cast counted', await castLarge.isVisible());
  await page.goto(`${baseV}/visualize/timeline`);

  // Persistence and data ownership (visualization Prompt 48). Every kind of record the run has made so far, through
  // the pages that make them, must come through a backup file, a restore, a deletion and a restart of the browser whole.
  // Every row a project owns, by table, read from the browser's database.
  const rowsOf48 = (pg, projectId) => pg.evaluate((projectId) => new Promise((resolve, reject) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const idb = open.result;
      const tx = idb.transaction([...idb.objectStoreNames], 'readonly');
      const out = {};
      for (const name of idb.objectStoreNames) {
        const store = tx.objectStore(name);
        if (!store.indexNames.contains('projectId')) continue;
        const req = store.index('projectId').getAll(projectId);
        req.onsuccess = () => { if (req.result.length) out[name] = req.result; };
      }
      tx.oncomplete = () => { idb.close(); resolve(out); };
      tx.onerror = () => reject(tx.error);
    };
  }), projectId);
  const projectsIn48 = (pg) => pg.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => { const req = open.result.transaction('projects').objectStore('projects').getAll(); req.onsuccess = () => { open.result.close(); resolve(req.result.map((p) => ({ id: p.id, title: p.title }))); }; };
  }));
  // The device's own working data, never in a backup file: crash copies, the search index, sync bookkeeping.
  const deviceOnly48 = new Set(['chapterDrafts', 'searchBlocks', 'searchState', 'syncState', 'syncBase', 'syncConflicts', 'syncLog']);
  const counts48 = (rows) => Object.fromEntries(Object.entries(rows).filter(([t]) => !deviceOnly48.has(t)).map(([t, list]) => [t, list.length]).sort(([a], [b]) => a.localeCompare(b)));
  // A copy holding the id of one of the original's records, or of the original itself, still points at the original:
  // as a whole value, or as a part of one (a page address, "chapter:<id>").
  const leftovers48 = (rows, originalRows, originalId) => {
    // The ids of its records, as backed up: the device's own search index still names records deleted since, and a
    // reference to a deleted record has nothing to follow, so it is rightly kept as it was.
    const old = new Set([originalId, ...Object.entries(originalRows).filter(([t]) => !deviceOnly48.has(t)).flatMap(([, list]) => list.map((r) => r.id))]);
    const found = [];
    const hit = (s) => s.split(/[:|/?=&~,\s]/).some((part) => old.has(part));
    const walk = (value, path) => {
      if (typeof value === 'string') { if (hit(value)) found.push(`${path} = ${value.slice(0, 80)}`); }
      else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (hit(k)) found.push(`${path} key ${k}`); walk(v, `${path}.${k}`); }
    };
    for (const [table, list] of Object.entries(rows)) if (!deviceOnly48.has(table)) list.forEach((row, i) => walk(row, `${table}[${i}]`));
    return found;
  };
  // What each project's records hold: every table and field, at every depth, ids in keys generalised.
  const shapes48 = await page.evaluate((deviceOnly) => new Promise((resolve, reject) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const idb = open.result;
      const tx = idb.transaction([...idb.objectStoreNames], 'readonly');
      const out = {};
      const add = (projectId, path) => { const list = (out[projectId] ??= []); if (!list.includes(path)) list.push(path); };
      const walk = (projectId, value, path) => {
        if (Array.isArray(value)) value.forEach((v) => walk(projectId, v, path + '[]'));
        else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(projectId, v, path + '.' + (/^[0-9a-f]{8}-/.test(k) ? '{id}' : k));
        else add(projectId, path);
      };
      for (const name of idb.objectStoreNames) {
        if (!tx.objectStore(name).indexNames.contains('projectId') || deviceOnly.includes(name)) continue;
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => { for (const row of req.result) walk(row.projectId, row, name); };
      }
      tx.oncomplete = () => { idb.close(); resolve(out); };
      tx.onerror = () => reject(tx.error);
    };
  }), [...deviceOnly48]);
  const titles48 = Object.fromEntries((await projectsIn48(page)).map((p) => [p.id, p.title]));
  for (const id of Object.keys(shapes48)) if (!titles48[id]) delete shapes48[id];
  // The fewest projects that between them hold every one of those fields.
  const everyField48 = new Set(Object.values(shapes48).flat());
  const chosen48 = [];
  for (const covered = new Set(); covered.size < everyField48.size; ) {
    const [best] = Object.entries(shapes48).filter(([id]) => !chosen48.includes(id)).map(([id, paths]) => [id, paths.filter((p) => !covered.has(p)).length]).sort((a, b) => b[1] - a[1]);
    chosen48.push(best[0]);
    for (const p of shapes48[best[0]]) covered.add(p);
  }
  if (!chosen48.includes(pV)) chosen48.push(pV);
  const kinds48 = new Set([...everyField48].map((p) => p.split(/[.[]/)[0]));
  check(`the run has made records of ${kinds48.size} kinds, in ${chosen48.length} of its ${Object.keys(titles48).length} projects between them`, kinds48.size >= 40, [...kinds48].sort().join(', '));
  // Each of those projects: its backup file, restored, then deleted.
  const problems48 = [];
  const files48 = {};
  for (const id of chosen48) {
    const title = titles48[id];
    try {
      const original = await rowsOf48(page, id);
      await page.goto(`${BASE}/project/${id}/export`);
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export entire project data' }).click()]);
      const buffer = readFileSync(await download.path());
      files48[id] = buffer;
      const file = JSON.parse(buffer);
      const inFile = Object.fromEntries(Object.entries(file.collections).filter(([, list]) => list.length).map(([t, list]) => [t, list.length]).sort(([a], [b]) => a.localeCompare(b)));
      if (JSON.stringify(inFile) !== JSON.stringify(counts48(original))) problems48.push(`${title}: the file holds ${JSON.stringify(inFile)}, the novel ${JSON.stringify(counts48(original))}`);
      const known = (await projectsIn48(page)).map((p) => p.id);
      await page.goto(BASE);
      await page.locator('input[type=file]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer });
      await page.getByText(/^Imported "/).waitFor();
      const copy = (await projectsIn48(page)).find((p) => !known.includes(p.id));
      const restored = await rowsOf48(page, copy.id);
      if (JSON.stringify(counts48(restored)) !== JSON.stringify(counts48(original))) problems48.push(`${title}: restored ${JSON.stringify(counts48(restored))}, original ${JSON.stringify(counts48(original))}`);
      for (const stale of leftovers48(restored, original, id).slice(0, 5)) problems48.push(`${title}: still points at the original: ${stale}`);
      // Restored again later in the run; this copy goes.
      await page.goto(`${BASE}/project/${copy.id}/settings`);
      await page.getByRole('button', { name: 'Delete…' }).click();
      await page.getByLabel(/to confirm/).fill(copy.title);
      await page.getByRole('button', { name: 'Delete forever' }).click();
      await page.waitForURL(BASE + '/');
      const left = await rowsOf48(page, copy.id);
      if (Object.keys(left).length) problems48.push(`${title}: deleting its copy left ${JSON.stringify(counts48(left))}`);
      if (JSON.stringify(counts48(await rowsOf48(page, id))) !== JSON.stringify(counts48(original))) problems48.push(`${title}: changed by restoring or deleting its copy`);
    } catch (e) {
      problems48.push(`${title}: ${e.message.split('\n')[0]}`);
    }
  }
  check(`every one of them comes through its backup file and a restore whole (every record, every reference pointing inside the copy), and deleting the copy removes all of it and nothing else`, problems48.length === 0, problems48.slice(0, 15).join('\n      '));
  if (process.env.PROJECT_FILES_OUT) for (const [id, buffer] of Object.entries(files48)) writeFileSync(join(process.env.PROJECT_FILES_OUT, `${titles48[id].replace(/[^\w]+/g, '-')}.novel.json`), buffer);
  // The views read a restored novel exactly as the original: names, never ids, so a copy whose references all followed reads the same.
  const viewsIn48 = (pg) => pg.getByRole('navigation', { name: 'Views' }).getByRole('link').evaluateAll((links) => links.map((a) => ({ label: a.textContent.trim(), key: a.getAttribute('href').split('/visualize/')[1].split('?')[0] })));
  const viewTexts48 = async (pg, base, views) => {
    const texts = {};
    for (const view of views) {
      await pg.goto(`${base}/visualize/${view.key}?as=list`);
      await pg.waitForFunction((label) => {
        const h = [...document.querySelectorAll('h2')].some((x) => x.textContent.trim() === label);
        const root = document.querySelector('.viz-export-root');
        return h && root && root.children.length > 0 && !root.querySelector('.viz-state [role=status], .viz-state[role=status]');
      }, view.label);
      await pg.waitForTimeout(150);
      texts[view.label] = await pg.locator('.viz-export-root').innerText();
    }
    return texts;
  };
  const differing48 = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => {
    const x = a[k].split('\n');
    const y = (b[k] ?? '').split('\n');
    const i = x.findIndex((line, n) => line !== y[n]);
    return `${k}: line ${i + 1} “${x[i]}” / “${y[i]}”`;
  });
  await page.goto(`${baseV}/visualize`);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link').first().waitFor();
  const views48 = await viewsIn48(page);
  const originalTexts48 = await viewTexts48(page, baseV, views48);
  // A browser closed and opened again: a novel restored there is still there after, and reads as the original.
  const profile48 = mkdtempSync(join(tmpdir(), 'nb-restart-'));
  const errors48 = [];
  const launch48 = async () => {
    const ctx = await chromium.launchPersistentContext(profile48, { viewport: { width: 1280, height: 800 } });
    const pg = ctx.pages()[0] ?? (await ctx.newPage());
    pg.on('pageerror', (e) => errors48.push(e.message));
    return { ctx, pg };
  };
  let restart48 = await launch48();
  await restart48.pg.goto(BASE);
  await restart48.pg.locator('input[type=file]').setInputFiles({ name: 'Visible-World.novel.json', mimeType: 'application/json', buffer: files48[pV] });
  await restart48.pg.getByText('Imported "Visible World"').waitFor();
  const restartId48 = (await projectsIn48(restart48.pg)).find((p) => p.title === 'Visible World').id;
  const restartBase48 = `${BASE}/project/${restartId48}`;
  const restoredTexts48 = await viewTexts48(restart48.pg, restartBase48, views48);
  const restoredDiff48 = differing48(originalTexts48, restoredTexts48);
  check(`every view (${views48.length}) shows a restored novel exactly as the original, as a list`, views48.length === 17 && restoredDiff48.length === 0, restoredDiff48.join('\n      '));
  const beforeRestart48 = counts48(await rowsOf48(restart48.pg, restartId48));
  // Renamed just before closing: the new name is kept too.
  await restart48.pg.goto(`${restartBase48}/settings`);
  await restart48.pg.getByLabel('Title', { exact: true }).fill('Visible World, kept');
  await restart48.pg.getByRole('button', { name: 'Save changes' }).click();
  await restart48.pg.getByText('Changes saved.').waitFor();
  await restart48.ctx.close();
  restart48 = await launch48();
  await restart48.pg.goto(BASE);
  await restart48.pg.locator('.card', { hasText: 'Visible World, kept' }).waitFor();
  eq('after the browser is closed and opened again, every record is still there, renamed as it was last', counts48(await rowsOf48(restart48.pg, restartId48)), beforeRestart48);
  const restartDiff48 = differing48(originalTexts48, await viewTexts48(restart48.pg, restartBase48, views48));
  check('…and every view shows it as before', views48.length === 17 && restartDiff48.length === 0 && errors48.length === 0, [...restartDiff48, ...errors48].join('\n      '));
  await restart48.ctx.close();
  await page.goto(`${baseV}/visualize/timeline`);

  // The system as a connected whole (visualization Prompt 49). One novel made through the pages, each record reached from
  // every place it belongs; then a rename, a branch, a backup restored and a module switched off and on, each checked
  // against the whole; and warnings on incomplete and contradictory records that explain themselves and change nothing.
  const p49 = await createProject('Connected Whole');
  const base49 = `${BASE}/project/${p49}`;
  // The novel's records, without the device's own working data and the record of who did what (which logs these very edits).
  const stored49 = async (projectId = p49) => {
    const rows = await rowsOf48(page, projectId);
    for (const table of [...deviceOnly48, 'activity']) delete rows[table];
    return rows;
  };
  const same49 = async (rows, projectId = p49) => JSON.stringify(await stored49(projectId)) === JSON.stringify(rows);
  const views49 = [['timeline', 'Timeline'], ['order', 'Story vs reading order'], ['relationships', 'Relationship map'], ['plot', 'Plot board'], ['graph', 'Knowledge graph']].map(([key, label]) => ({ key, label }));
  const lists49 = (base = base49) => viewTexts48(page, base, views49);
  const flat49 = (text) => text.replace(/\s+/g, ' ');
  // Which records differ between two readings, and in what: to say exactly what changed when something did.
  const changed49 = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((table) => {
    const was = new Map((a[table] ?? []).map((r) => [r.id, JSON.stringify(r)]));
    const now = new Map((b[table] ?? []).map((r) => [r.id, JSON.stringify(r)]));
    return [...new Set([...was.keys(), ...now.keys()])].filter((id) => was.get(id) !== now.get(id)).map((id) => {
      const [x, y] = [JSON.parse(was.get(id) ?? '{}'), JSON.parse(now.get(id) ?? '{}')];
      return `${table} ${id}: ${[...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(', ') || (was.has(id) ? 'removed' : 'added')}`;
    });
  });

  // 1. Each record made on its own page: three chapters and a scene, two characters, two places, an ability, a plot thread, events.
  await page.goto(`${base49}/organizer`);
  await page.getByRole('button', { name: 'Add the first chapter' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '+ Chapter', exact: true }).click();
    await row(`Chapter ${i + 2}`).waitFor();
  }
  await menu('Chapter 1', 'Add scene');
  await row('Scene 1').waitFor();
  // An ability is a record of the kind the Progression module brings.
  await page.goto(`${base49}/modules`);
  await switchModule('Progression Fantasy & LitRPG', true);
  await page.goto(`${base49}/codex`);
  await newCharacter('Mira');
  await newCharacter('Bren');
  await newEntry('Location', 'Emberfall');
  await newEntry('Location', 'The Ashen Keep');
  await newEntry('Skill', 'Ember Sight');

  // 2. Connected through the shared records. The ability to the one who wields it: a link each side lists.
  await field('Entry to link').selectOption({ label: 'Mira' });
  await field('Relationship').fill('wields');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.locator('.related-name', { hasText: 'Mira' }).waitFor();
  // A character to a place, from the place explorer: a typed connection.
  await page.goto(`${base49}/visualize/places`);
  await page.getByRole('list', { name: 'Places' }).getByRole('button', { name: 'Emberfall', exact: true }).click();
  const emberfall49 = page.getByRole('region', { name: 'Place: Emberfall' });
  await emberfall49.locator('details.place-tie summary').click();
  await emberfall49.getByLabel('Record to tie', { exact: true }).selectOption({ label: 'Mira' });
  await emberfall49.getByRole('button', { name: 'Tie it' }).click();
  await emberfall49.getByText(/^Mira: Located in this$/).waitFor();
  // A plot thread with its cast, its place, and developments in chapters.
  await page.goto(`${base49}/plot`);
  const td49 = page.locator('.rel-drawer');
  await page.getByRole('button', { name: 'New thread' }).click();
  await td49.getByLabel('Thread title').waitFor();
  await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'New thread');
  await td49.getByLabel('Thread title').fill('The Ember Oath');
  await td49.getByLabel('Thread title').blur();
  await page.locator('.thread .thread-title', { hasText: 'The Ember Oath' }).waitFor();
  await td49.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await td49.getByLabel('Add a location').selectOption({ label: 'Emberfall' });
  for (const [chapter, title] of [['Chapter 1', 'The oath is sworn'], ['Chapter 3', 'The oath is broken']]) {
    const count = await td49.locator('.beat-list > li').count();
    await td49.getByLabel('Chapter for the new development').selectOption({ label: chapter });
    await td49.getByLabel('New development', { exact: true }).fill(title);
    await td49.getByRole('button', { name: 'Add development' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.rel-drawer .beat-list > li').length === n + 1, count);
  }
  // Events: who, where, which thread, and which chapters tell them.
  await page.goto(`${base49}/timeline`);
  await page.getByText('What happened, and when').waitFor();
  const event49 = async (name) => (await stored49()).timelineEvents?.find((e) => e.name === name);
  const newEvent49 = async (name) => {
    await page.getByRole('button', { name: 'New event' }).click();
    await ev.getByLabel('Event name').waitFor();
    await page.waitForFunction(() => document.querySelector('.rel-drawer input')?.value === 'New event');
    await ev.getByLabel('Event name').fill(name);
    await ev.getByLabel('Event name').blur();
    await page.locator('.event-card .event-name', { hasText: name }).waitFor();
  };
  const date49 = async (year, month, day) => {
    await ev.getByRole('radio', { name: 'Exact', exact: true }).click();
    await ev.getByLabel('Year', { exact: true }).fill(String(year));
    await ev.getByLabel('Year', { exact: true }).blur();
    await ev.getByLabel('Month').selectOption(String(month));
    await ev.getByLabel('Day').fill(String(day));
    await ev.getByLabel('Day').blur();
  };
  await newEvent49('The Return');
  await date49(1000, 3, 3);
  await ev.getByLabel('Location').selectOption({ label: 'Emberfall' });
  await ev.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await ev.getByLabel('Link a chapter or scene').selectOption({ label: 'Scene 1' });
  await settles(async () => (await event49('The Return'))?.nodeIds.length === 1);
  // 3. In the story's own chronology the burning comes first, ten years before; the reader meets it later, in Chapter 2, looking back.
  await newEvent49('The Burning');
  await date49(990, 6, 1);
  await ev.getByLabel('Location').selectOption({ label: 'Emberfall' });
  await ev.getByLabel('Add a character').selectOption({ label: 'Mira' });
  await ev.getByLabel('Add a character').selectOption({ label: 'Bren' });
  await ev.getByLabel('Link a chapter or scene').selectOption({ label: 'Chapter 2' });
  await ev.getByLabel('How Chapter 2 tells it').selectOption('flashback');
  await ev.getByLabel('Add to a plot thread').selectOption({ label: 'The Ember Oath' });
  await settles(async () => (await event49('The Burning'))?.threadIds?.length === 1);
  const made49 = await stored49();
  const id49 = (table, name) => made49[table].find((r) => (r.name ?? r.title) === name).id;
  const [mira49, bren49, ember49, sight49, thread49, burning49, ch2_49, scene49] = [id49('loreEntries', 'Mira'), id49('loreEntries', 'Bren'), id49('loreEntries', 'Emberfall'), id49('loreEntries', 'Ember Sight'), id49('plotThreads', 'The Ember Oath'), id49('timelineEvents', 'The Burning'), id49('chapters', 'Chapter 2'), id49('chapters', 'Scene 1')];
  const burningRow49 = made49.timelineEvents.find((e) => e.id === burning49);
  check('each record is made once, on its own page, and the others point at it by id: the event at its people, place, chapter and thread; the thread at its cast and place; the place and the ability at the character', [
    burningRow49.characters.map((c) => c.id).join() === `${mira49},${bren49}`,
    burningRow49.locationId === ember49,
    burningRow49.nodeIds.join() === ch2_49 && burningRow49.reveals?.some((r) => r.nodeId === ch2_49 && r.role === 'flashback'),
    burningRow49.threadIds.join() === thread49,
    made49.timelineEvents.find((e) => e.name === 'The Return').nodeIds.join() === scene49,
    made49.plotThreads[0].characterIds.join() === mira49 && made49.plotThreads[0].locationIds.join() === ember49 && made49.plotThreads[0].beats.length === 2,
    made49.loreLinks.some((l) => l.fromId === mira49 && l.toId === ember49 && l.type === 'located-in'),
    made49.loreLinks.some((l) => [l.fromId, l.toId].sort().join() === [sight49, mira49].sort().join()),
  ].every(Boolean), JSON.stringify({ events: made49.timelineEvents, links: made49.loreLinks }).slice(0, 600));

  // 4. A relationship that changes: friends from the start, enemies from Chapter 2. The earlier state stays as it was.
  await page.goto(`${base49}/relationships`);
  await page.getByLabel('First character').selectOption({ label: 'Mira' });
  await page.getByLabel('Relationship type').selectOption({ label: 'Friends' });
  await page.getByLabel('Second character').selectOption({ label: 'Bren' });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  const drawer49 = page.locator('.rel-drawer');
  await drawer49.locator('h2', { hasText: 'Mira' }).waitFor();
  const relation49 = async () => (await stored49()).characterRelations?.[0];
  await settles(async () => (await relation49())?.stages.length === 1);
  const firstStage49 = JSON.stringify((await relation49()).stages[0]);
  await drawer49.getByLabel('New stage starts at').selectOption({ label: '2. Chapter 2' });
  await drawer49.getByRole('button', { name: 'Add stage' }).click();
  await drawer49.locator('.rel-timeline > li').nth(1).waitFor();
  await drawer49.locator('.rel-timeline > li').nth(1).getByLabel(/type$/).selectOption({ label: 'Enemies' });
  await settles(async () => (await relation49()).stages[1]?.label === 'Enemies');
  const history49 = flat49(await drawer49.locator('.rel-timeline').innerText());
  check('a relationship changed at a chapter keeps its earlier state exactly as it was, and its history shows both', JSON.stringify((await relation49()).stages[0]) === firstStage49 && /Friends/.test(history49) && /Enemies/.test(history49), history49);
  await drawer49.getByRole('button', { name: 'Close details' }).click();
  const edge49 = async (asOf) => {
    await page.getByLabel('As of').selectOption({ label: asOf });
    await page.waitForTimeout(150);
    return page.locator('.rel-edge text').allTextContents();
  };
  eq('…and the map shows it as it stood at any point: friends in Chapter 1, enemies by the end', [await edge49('Chapter 1: Chapter 1'), await edge49('End of the story')], [['Friends'], ['Enemies']]);

  // 5. The same records in the timeline, story order beside reading order, the relationship map, the plot board and the knowledge graph.
  const texts49 = await lists49();
  const has49 = (view, ...names) => names.filter((n) => !texts49[view].includes(n));
  const missing49 = {
    timeline: has49('Timeline', 'The Burning', 'The Return', 'Ch 2: Chapter 2 (flashback)', 'Scene 1'),
    order: has49('Story vs reading order', 'The Burning', 'The Return', 'Chapter 2', 'Scene 1'),
    map: has49('Relationship map', 'Mira', 'Bren', 'Enemies'),
    plot: has49('Plot board', 'The Ember Oath', 'The oath is sworn', 'The oath is broken', 'Chapter 1', 'Chapter 3'),
    graph: has49('Knowledge graph', 'Mira', 'Bren', 'Emberfall', 'Ember Sight', 'The Burning', 'The Return', 'The Ember Oath', 'Chapter 2', 'Scene 1'),
  };
  check('the same records are in every view: the timeline, story order beside reading order, the relationship map, the plot board and the knowledge graph', Object.values(missing49).every((m) => m.length === 0), JSON.stringify(missing49));
  check('the timeline is in story order: the burning first, though the reader meets it second', texts49.Timeline.indexOf('The Burning') < texts49.Timeline.indexOf('The Return'));
  const order49 = flat49(texts49['Story vs reading order']);
  check('…and story order beside reading order says so: Chapter 2 goes back in time, as a flashback, to what happens first', order49.includes('Not told in story order: 1 telling goes back in time.') && order49.includes('Ch 2: Chapter 2 The Burning As a flashback Year 990, June 1 1st · goes back in time'), order49);
  // The timeline drawn by character, and by place: each track is one of the same records, with its events.
  await page.goto(`${base49}/visualize/timeline?as=list`);
  const tracks49 = async (by) => {
    await page.locator('label.tl-group', { hasText: 'Tracks by' }).locator('select').selectOption({ label: by });
    const list = page.getByRole('list', { name: 'Tracks, in the order they are drawn' });
    if (!(await list.isVisible())) await page.locator('.tl-track-list summary').click();
    await list.locator('li').first().waitFor();
    return (await list.locator('li > label').allInnerTexts()).map((t) => flat49(t).trim());
  };
  eq('…drawn by character or by place, its tracks are the same characters and places, each with its events', [await tracks49('Characters'), await tracks49('Places')], [['Bren (1)', 'Mira (2)'], ['Emberfall (2)']]);
  if (process.env.SHOW49) for (const [k, v] of Object.entries(texts49)) console.log(`---- ${k}\n${v}`);

  // 6. A record renamed: every view follows, and nothing else in the novel changes, because everything points at it by id.
  const beforeRename49 = await stored49();
  await openCharacter('Mira');
  const head49 = page.locator('.vault-profile').getByRole('group', { name: 'Character', exact: true });
  await head49.getByRole('button', { name: 'Edit profile' }).click();
  await head49.getByLabel('Name', { exact: true }).fill('Mira Ashborn');
  await head49.getByLabel('Name', { exact: true }).blur();
  await head49.getByRole('button', { name: 'Done', exact: true }).click();
  await head49.getByRole('heading', { name: 'Mira Ashborn' }).waitFor();
  const afterRename49 = await stored49();
  // Besides the record itself, only the character's own history gains a line saying so, and her profile notes when it was edited.
  const historyLine49 = (afterRename49.characterHistory ?? []).find((h) => !(beforeRename49.characterHistory ?? []).some((b) => b.id === h.id));
  const profile49 = afterRename49.characterProfiles.find((p) => p.entryId === mira49);
  const renameChanges49 = changed49(beforeRename49, afterRename49);
  check('renaming changes that one record; no reference to it is rewritten, and only her own history notes the change', renameChanges49.filter((c) => !c.startsWith(`characterHistory ${historyLine49?.id}:`)).sort().join('|') === [`characterProfiles ${profile49.id}: updatedAt`, `loreEntries ${mira49}: name, updatedAt`].sort().join('|') && historyLine49?.entryId === mira49 && JSON.stringify(historyLine49).includes('Mira Ashborn') && afterRename49.loreEntries.find((e) => e.id === mira49).name === 'Mira Ashborn', [...renameChanges49, JSON.stringify(historyLine49)].join('\n      '));
  const renamed49 = await lists49();
  const renameDiff49 = differing48(Object.fromEntries(Object.entries(texts49).map(([k, v]) => [k, v.replaceAll('Mira', 'Mira Ashborn')])), renamed49);
  check('every view shows the new name wherever it showed the old one, and is otherwise the same: every link intact', renameDiff49.length === 0, renameDiff49.join('\n      '));

  // 7. An alternate timeline forked after Chapter 1, and changed: the main canon is not touched.
  const main49 = await stored49();
  await page.goto(`${base49}/branches`);
  const bp49 = page.locator('.branches-page');
  await bp49.locator('.tl-node').first().waitFor();
  await bp49.getByLabel('Diverges').selectOption({ label: 'After Chapter 1' });
  await bp49.getByLabel('Name of the new timeline').fill('If Bren had stayed');
  await bp49.getByLabel('Canon status of the new timeline').selectOption({ label: 'Non-Canon' });
  const from49 = page.url();
  await bp49.getByRole('button', { name: 'Fork timeline' }).click();
  await page.waitForURL((url) => url.href !== from49 && url.pathname.endsWith('/branches'));
  await bp49.locator('.tl-node.current', { hasText: 'If Bren had stayed' }).waitFor();
  const branch49 = page.url().split('/').at(-2);
  const branchReturn49 = (await stored49(branch49)).timelineEvents.find((e) => e.name === 'The Return').id;
  await page.goto(`${BASE}/project/${branch49}/timeline?event=${branchReturn49}`);
  await ev.getByLabel('Event name').fill('The Return, alone');
  await ev.getByLabel('Event name').blur();
  await settles(async () => (await stored49(branch49)).timelineEvents.some((e) => e.name === 'The Return, alone'));
  const branchRows49 = await stored49(branch49);
  check('the branch starts from the story as it stood after Chapter 1, and takes its own changes', branchRows49.chapters.map((c) => c.title).sort().join() === 'Chapter 1,Scene 1' && branchRows49.characterRelations[0].stages.length === 1 && branchRows49.timelineEvents.some((e) => e.name === 'The Return, alone') && (await page.locator('.sidebar-title .tl-tag').innerText()) === 'NON-CANON');
  const mainDiff49 = differing48(renamed49, await lists49());
  check('the main canon is exactly as it was: every record, and every view', (await same49(main49)) && mainDiff49.length === 0, mainDiff49.join('\n      '));

  // 8. Exported and imported again: every record, every reference pointing inside the copy, and the views read it as the original.
  await page.goto(`${base49}/export`);
  const [download49] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export entire project data' }).click()]);
  const file49 = readFileSync(await download49.path());
  const known49 = (await projectsIn48(page)).map((p) => p.id);
  await page.goto(BASE);
  await page.locator('input[type=file]').setInputFiles({ name: download49.suggestedFilename(), mimeType: 'application/json', buffer: file49 });
  await page.getByText(/^Imported "Connected Whole/).waitFor();
  const copy49 = (await projectsIn48(page)).find((p) => !known49.includes(p.id));
  const original49 = await rowsOf48(page, p49);
  const restored49 = await rowsOf48(page, copy49.id);
  const stale49 = leftovers48(restored49, original49, p49);
  check('re-imported: the same records, every reference pointing inside the copy', JSON.stringify(counts48(restored49)) === JSON.stringify(counts48(original49)) && stale49.length === 0, stale49.slice(0, 5).join('\n      '));
  const copyDiff49 = differing48(renamed49, await lists49(`${BASE}/project/${copy49.id}`));
  check('…and every one of those views reads it exactly as the original', copyDiff49.length === 0, copyDiff49.join('\n      '));

  // 9. The Progression module, which brings the kind the ability is, switched off and on again: no record changes, and the views read the same.
  const beforeOff49 = await stored49();
  const records49 = (rows) => JSON.stringify({ ...rows, loreSchemas: [], projectModules: [] });
  await page.goto(`${base49}/modules`);
  await switchModule('Progression Fantasy & LitRPG', false);
  const off49 = await stored49();
  const holds49 = (c) => off49.loreEntries.some((e) => e.category === c.key);
  check('switched off: no record is changed or removed; only the module’s empty kinds are put away, and the kind holding the ability stays', records49(off49) === records49(beforeOff49) && off49.loreEntries.some((e) => e.id === sight49) && off49.loreSchemas.some((c) => c.archived) && off49.loreSchemas.filter((c) => c.archived).every((c) => !holds49(c)) && off49.loreSchemas.some((c) => c.name === 'Skills & Abilities' && !c.archived), [...changed49(beforeOff49, off49), JSON.stringify(off49.loreSchemas.map((c) => [c.name, c.archived]))].join('\n      '));
  const offDiff49 = differing48(renamed49, await lists49());
  check('…so while it is off, every view still reads the same: the ability included', offDiff49.length === 0, offDiff49.join('\n      '));
  await page.goto(`${base49}/modules`);
  await switchModule('Progression Fantasy & LitRPG', true);
  const onDiff49 = differing48(renamed49, await lists49());
  check('switched on again: every record as it was, and every view as it was', records49(await stored49()) === records49(beforeOff49) && onDiff49.length === 0, onDiff49.join('\n      '));

  // 10. Incomplete and contradictory records: an event with no date yet, and Mira at two places at the same moment.
  await page.goto(`${base49}/timeline`);
  await page.locator('.event-card').first().waitFor();
  await newEvent49('The Lost Year');
  await newEvent49('The Duel');
  await date49(1000, 3, 3);
  await ev.getByLabel('Location').selectOption({ label: 'The Ashen Keep' });
  await ev.getByLabel('Add a character').selectOption({ label: 'Mira Ashborn' });
  await settles(async () => (await event49('The Duel'))?.characters.length === 1);
  const untouched49 = await stored49();
  // The undated event is not drawn at a made-up time: it is listed apart, saying why.
  await page.goto(`${base49}/visualize/timeline`);
  const unplaced49 = page.locator('.tl-unplaced');
  await unplaced49.waitFor();
  const unplacedText49 = flat49(await unplaced49.innerText());
  check('an event with no date is listed apart from the line, saying why, not placed at a made-up time', unplacedText49.includes('The Lost Year') && unplacedText49.includes('No date yet'), unplacedText49);
  // The timeline review: the contradiction, with the rule behind it and the records to open.
  await page.goto(`${base49}/timeline`);
  await page.getByRole('link', { name: /^Review: \d+ to look at/ }).click();
  await page.getByRole('heading', { name: 'Timeline review', level: 1 }).waitFor();
  const twoPlaces49 = flat49(await page.getByRole('region', { name: 'In two places at once' }).innerText());
  check('Mira at two places at once is found: it names her, both events and both places, and the rule', ['Mira Ashborn', 'The Duel', 'The Return', 'The Ashen Keep', 'Emberfall', 'The rule:'].every((s) => twoPlaces49.includes(s)), twoPlaces49);
  // The continuity review gathers it with every other check's warnings, explained the same way.
  await page.goto(`${base49}/review`);
  const status49 = page.getByRole('status').filter({ hasText: /to look at|Nothing to look at/ });
  await status49.filter({ hasText: 'to look at:' }).waitFor();
  const reviewItem49 = flat49(await page.locator('.rv-item', { hasText: 'The Duel' }).first().innerText());
  check('the continuity review lists it too: how sure it is, the rule, and the records behind it', reviewItem49.includes('The rule:') && reviewItem49.includes('Mira Ashborn') && /confirmed data error|possible inconsistency/i.test(reviewItem49), reviewItem49);
  await page.goto(`${base49}/integrity`);
  await page.locator('main h1').first().waitFor();
  await page.waitForTimeout(300);
  check('looking at every warning, on every page, changed no record', await same49(untouched49));
  await page.goto(`${baseV}/visualize/timeline`);

  // Filters, and saved views of them (visualization Prompt 14).
  await viewTabs.filter({ hasText: 'Timeline' }).click();
  await page.getByRole('heading', { name: 'Timeline', level: 2 }).waitFor();
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'List' }).click();
  const eventsV = () => page.getByRole('list', { name: 'Events in story order' }).locator('li strong').allInnerTexts();
  await page.getByRole('list', { name: 'Events in story order' }).waitFor();
  await page.getByLabel('Search by name').fill('siege');
  // Wait for the list as the search leaves it: the siege there, the feast gone.
  await page.getByRole('list', { name: 'Events in story order' }).locator('li', { hasText: 'The long siege' }).waitFor();
  await page.getByRole('list', { name: 'Events in story order' }).locator('li', { hasText: 'The feast' }).waitFor({ state: 'detached' });
  eq('searching narrows the view to what matches', await eventsV(), ['The long siege']);
  await page.getByLabel('Search by name').fill('dragon');
  await page.getByText('Nothing matches these filters.').waitFor();
  check('a search that matches nothing says so, and offers to clear it', await page.getByRole('button', { name: 'Clear filters', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('list', { name: 'Events in story order' }).waitFor();
  await page.getByLabel('Involving character').selectOption({ label: 'Mira' });
  await page.getByRole('list', { name: 'Events in story order' }).locator('li', { hasText: 'The long siege' }).waitFor({ state: 'detached' });
  eq('filtering by character keeps only the events they are part of', await eventsV(), ['The feast']);
  await page.getByRole('button', { name: 'Save view as…' }).click();
  await page.getByLabel('Name for this view').fill('Mira’s year');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/[?&]saved=/);
  const savedSelect = page.getByLabel('Saved views of this kind');
  await page.reload();
  await page.getByRole('list', { name: 'Events in story order' }).waitFor();
  check('a saved view survives a reload, with its filter', (await savedSelect.locator('option:checked').innerText()) === 'Mira’s year' && (await page.getByLabel('Involving character').locator('option:checked').innerText()) === 'Mira' && JSON.stringify(await eventsV()) === JSON.stringify(['The feast']));
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('New name for this view').fill('Mira’s story');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await savedSelect.locator('option', { hasText: 'Mira’s story' }).waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await savedSelect.locator('option', { hasText: 'Mira’s story (copy)' }).waitFor({ state: 'attached' });
  eq('a saved view can be renamed and duplicated', (await savedSelect.locator('option').allInnerTexts()).slice(1), ['Mira’s story', 'Mira’s story (copy)']);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete view' }).click();
  await savedSelect.locator('option', { hasText: 'Mira’s story (copy)' }).waitFor({ state: 'detached' });
  check('deleting a saved view asks first, and removes only the view', (await savedSelect.locator('option').count()) === 2 && (await page.getByRole('list', { name: 'Events in story order' }).isVisible()));
  await savedSelect.selectOption({ label: 'Mira’s story' });
  await page.waitForURL(/[?&]saved=/);
  const savedUrl = page.url();
  // The character the view names is deleted: the view still opens, and says so.
  await page.evaluate(([id]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction('loreEntries', 'readwrite');
      tx.objectStore('loreEntries').delete(id);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [`${pV}-mira`]);
  await page.goto(savedUrl);
  await page.getByText('1 record this saved view names no longer exists; it shows the rest.').waitFor();
  check('a saved view naming a deleted record opens without it, and says so', (await page.getByRole('list', { name: 'Events in story order' }).isVisible()));
  await viewTabs.filter({ hasText: 'Places' }).click();
  await page.getByRole('heading', { name: 'Places', level: 2 }).waitFor();

  // A selection whose record is deleted (a stale link, another tab) says so instead of breaking.
  await page.getByRole('button', { name: 'Ashen Keep', exact: true }).click();
  await detailV('Ashen Keep').waitFor();
  await page.evaluate(([id]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction('loreEntries', 'readwrite');
      tx.objectStore('loreEntries').delete(id);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [`${pV}-keep`]);
  await page.reload();
  await detailV('Record not found').waitFor();
  check('a selection of a deleted record says it is gone', (await detailV('Record not found').innerText()).includes('no longer in this novel'));
  await detailV('Record not found').getByRole('button', { name: 'Clear the selection' }).click();
  await detailV('Record not found').waitFor({ state: 'detached' });
  check('…and the selection can be cleared', !new URL(page.url()).searchParams.has('select'));

  await page.setViewportSize({ width: 390, height: 780 });
  await page.reload();
  await page.getByRole('heading', { name: 'Places', level: 2 }).waitFor();
  check('mobile: Visualize fits the screen, its views wrap', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- The QA sample novel (Optional Prompt C) ---
  // Test data kept apart in qa/, never part of the app: a new browser has no novels, and nothing the app serves holds it.
  // Imported on purpose, its pages agree on its records; deleted, it leaves nothing behind and no other novel changes.
  const titleQA = 'QA Sample: The Glass Meridian (test data)';
  const freshQA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const freshPageQA = await freshQA.newPage();
  await freshPageQA.goto(BASE);
  await freshPageQA.getByRole('button', { name: 'Import' }).waitFor();
  const novelsQA = await freshPageQA.evaluate(() => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction('projects').objectStore('projects').count(); r.onsuccess = () => { o.result.close(); resolve(r.result); }; }; }));
  const libraryQA = await freshPageQA.locator('body').innerText();
  await freshQA.close();
  // The app as served: the page, every script and style it loads, and the sample's own path.
  const shellQA = await (await fetch(BASE)).text();
  const assetsQA = [...shellQA.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|tsx?))"/g)].map((m) => m[1]);
  const servedQA = [shellQA, ...(await Promise.all(assetsQA.map(async (a) => (await fetch(`${BASE}${a}`)).text())))].join('\n');
  const pathQA = await (await fetch(`${BASE}/qa/qa-sample.novel.json`)).text();
  check('the QA sample is not part of the app: a new browser starts with no novels, and nothing the app serves holds it', novelsQA === 0 && !libraryQA.includes('Glass Meridian') && assetsQA.length > 0 && !/Glass Meridian|qa-sample/.test(servedQA) && !pathQA.includes('Glass Meridian'), `${novelsQA} novels, ${assetsQA.length} files`);

  const otherBeforeQA = await novelRows26();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Import' }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'qa-sample.novel.json', mimeType: 'application/json', buffer: readFileSync('qa/qa-sample.novel.json') });
  await page.getByText(`Imported "${titleQA}".`).waitFor();
  const idQA = await page.evaluate((title) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => { o.result.close(); resolve(r.result.find((p) => p.title === title).id); }; }; }), titleQA);
  const rowsQA = (store) => page.evaluate(([name, projectId]) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction(name).objectStore(name).getAll(); r.onsuccess = () => { o.result.close(); resolve(r.result.filter((x) => x.projectId === projectId)); }; }; }), [store, idQA]);
  const entryQA = async (name) => (await rowsQA('loreEntries')).find((e) => e.name === name).id;
  check('imported on purpose, it is a novel of its own in the library, labelled as test data', (await page.locator('.card', { hasText: titleQA }).innerText()).includes('Test data for checking the app’s views'));
  const baseQA = `${BASE}/project/${idQA}`;
  const mainQA = async (path, ready) => {
    await page.goto(`${baseQA}/${path}`);
    await page.getByText(ready, { exact: false }).first().waitFor();
    return page.locator('main').innerText();
  };
  const tableQA = async (path, rows) => {
    await page.goto(`${baseQA}/${path}`);
    await page.locator('main table tbody tr').nth(rows - 1).waitFor();
    return (await page.locator('main table tbody tr').allInnerTexts()).map((r) => r.split('\t').map((c) => c.trim()));
  };
  const historyQA = async (who) => {
    await page.goto(`${baseQA}/visualize/history?who=${who}&as=list`);
    const region = page.getByRole('region', { name: 'As the reader meets them' });
    await region.getByText(/^Appears in /).first().waitFor();
    return region.innerText();
  };
  const eventsQA = ['The fire at Ashe House', 'Ilse joins the Guild', 'The heist at the Glass Archive', 'The council vote', 'Flight inland', 'Return to Ashe House', 'The ledger is read'];
  const orderOfQA = (text) => eventsQA.map((name) => [name, text.indexOf(name)]).filter(([, at]) => at >= 0).sort((a, b) => a[1] - b[1]).map(([name]) => name);
  // The two events at one moment may come in either order; every view must put them at that moment.
  const tieQA = (list) => list.map((n) => (n === 'The council vote' ? 'The heist at the Glass Archive' : n)).join(' | ');
  const timelineListQA = await page.goto(`${baseQA}/visualize/timeline?as=list`).then(() => page.getByRole('list', { name: 'Events in story order' }).innerText());
  const orderTextQA = await mainQA('visualize/order?as=list', 'As it happens');
  const asItHappensQA = orderTextQA.slice(orderTextQA.indexOf('As it happens'));
  const timelinePageQA = await mainQA('timeline', 'in the order they happened');
  eq('the Timeline page, the Visualize timeline and story vs reading order list the same seven events, in the same story order', [orderOfQA(timelineListQA).length, tieQA(orderOfQA(timelineListQA)), tieQA(orderOfQA(asItHappensQA)), tieQA(orderOfQA(timelinePageQA))], [7, tieQA(eventsQA), tieQA(eventsQA), tieQA(eventsQA)]);
  const readerRowsQA = await tableQA('visualize/order?as=list', 8);
  eq('the flashback: first in story time on the timeline, met last in reading order, foreshadowed early', { first: orderOfQA(timelineListQA)[0], told: readerRowsQA.filter((r) => r[1] === 'The fire at Ashe House').map((r) => [r[0], r[2], r[4]]), listed: timelineListQA.includes('Told in Ch 2: The Guild Mark (foreshadowed), Ch 6: What the Fire Kept (flashback)') }, { first: 'The fire at Ashe House', told: [['Ch 2: The Guild Mark', 'Foreshadowed', '1st · goes back in time'], ['Ch 6: What the Fire Kept', 'As a flashback', '1st · goes back in time']], listed: true });
  eq('the parallel events: the same moment in every view, each told in its own scene', readerRowsQA.filter((r) => r[1] === 'The heist at the Glass Archive' || r[1] === 'The council vote').map((r) => [r[0], r[3], r[4]]), [['Ch 3, scene: At the Archive', 'Year 812, April 9', '3rd · in story order'], ['Ch 3, scene: At the Council', 'Year 812, April 9', '3rd · in story order']]);
  // Places: the events the Places view counts at each place are the ones the Timeline page shows there.
  const placesTextQA = await mainQA('visualize/places?as=list', 'events within');
  const placeNamesQA = ['The Hill Country', 'Ashe House', 'Port Calder', 'Council Hall', 'The Glass Archive'];
  const hereQA = (name) => Number((placesTextQA.match(new RegExp(`^${name} (\\d+) events? here`, 'm')) ?? [])[1] ?? 0);
  const onTimelineQA = (name) => timelinePageQA.split('\n').filter((line) => line.startsWith(`${name} · `)).length;
  eq('places: the events counted at each place are the ones the Timeline page shows there', placeNamesQA.map((n) => [n, hereQA(n)]), placeNamesQA.map((n) => [n, onTimelineQA(n)]));
  // Appearances: the appearances view and Corin's history name the same chapters, on the page and only mentioned.
  const corinQA = await entryQA('Corin Ashe');
  await page.goto(`${baseQA}/visualize/appearances?as=list`);
  await page.getByText(/^Appears: /).nth(4).waitFor();
  const appearsQA = await page.locator('main').innerText();
  const corinBlockQA = appearsQA.slice(appearsQA.indexOf('Corin Ashe\nAppears'), appearsQA.indexOf('Ilse Varn\nAppears'));
  const listedQA = (label) => (corinBlockQA.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1] ?? '').split(', ');
  const readingQA = await historyQA(corinQA);
  const saidQA = (verb) => readingQA.split('\n').filter((l) => l.startsWith(`${verb} `)).map((l) => l.slice(verb.length + 1).trim());
  eq('appearances: the appearances view and the character’s history name the same chapters', [saidQA('Appears in'), saidQA('Mentioned in')], [listedQA('Appears'), listedQA('Mentioned')]);
  // Relationships and abilities: the relationship list, the ability paths and Ilse's history say the same, at the same chapter.
  const ilseQA = await entryQA('Ilse Varn');
  const relationRowsQA = await tableQA('visualize/relationships?as=list', 4);
  const abilitiesQA = await mainQA('visualize/abilities?as=list', 'Held by');
  const ilseReadingQA = await historyQA(ilseQA);
  check('relationships and abilities: the relationship list, the ability paths and the character’s history agree on when', relationRowsQA.some((r) => r[0] === 'Ilse Varn' && r[1] === 'Friends' && r[2] === 'Tamsin Roe' && r[4] === 'Chapters 4+') && /Ch 4: Roads Inland\s+Relationship changes with Tamsin Roe: Friends on the salt road/.test(ilseReadingQA) && abilitiesQA.includes('Mirror Walk · Master') && /Mirror Walk · Master[\s\S]*?Held by Ilse Varn/.test(abilitiesQA) && /Ch 6: What the Fire Kept\s+Gained Mirror Walk/.test(ilseReadingQA), ilseReadingQA);
  // The dashboard: upcoming events are the ones told in the chapters with no words yet, in the order the reader meets them.
  await page.goto(`${baseQA}/dashboard`);
  await page.getByRole('region', { name: 'Your dashboard' }).getByRole('button', { name: 'Add a widget' }).click();
  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  const upcomingQA = page.locator('.dash-card').filter({ has: page.getByRole('heading', { name: 'Upcoming events', exact: true }) });
  await upcomingQA.locator('.dash-list').waitFor();
  const unwrittenQA = readerRowsQA.filter((r) => r[0].startsWith('Ch 5') || r[0].startsWith('Ch 6')).map((r) => r[1]);
  eq('the dashboard’s upcoming events are the ones story vs reading order shows in the chapters not written yet', await upcomingQA.locator('.dash-list > li > a').allInnerTexts(), unwrittenQA);

  // Deleted: nothing of it is left, in the database or in this browser's settings, and no other novel changed.
  await page.goto(`${baseQA}/manuscript/${(await rowsQA('chapters')).find((c) => c.title === 'Salt and Glass').id}`);
  await page.locator(text).waitFor();
  const idsQA = [idQA, ...(await page.evaluate((projectId) => new Promise((resolve) => {
    const o = indexedDB.open('novel-builder');
    o.onsuccess = () => {
      const db = o.result;
      const tx = db.transaction([...db.objectStoreNames]);
      const ids = [];
      for (const name of db.objectStoreNames) tx.objectStore(name).getAll().onsuccess = (e) => { for (const r of e.target.result) if (r && r.projectId === projectId && typeof r.id === 'string') ids.push(r.id); };
      tx.oncomplete = () => { db.close(); resolve(ids); };
    };
  }), idQA))];
  const keysQA = () => page.evaluate((ids) => Object.keys(localStorage).filter((k) => k.startsWith('novel-builder:') && ids.includes(k.slice(k.lastIndexOf(':') + 1))), idsQA);
  const keptQA = await keysQA();
  await page.goto(`${baseQA}/settings`);
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByLabel(/to confirm/).fill(titleQA);
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await page.waitForURL(BASE + '/');
  const leftQA = await page.evaluate((ids) => new Promise((resolve) => {
    const o = indexedDB.open('novel-builder');
    o.onsuccess = () => {
      const db = o.result;
      const tx = db.transaction([...db.objectStoreNames]);
      const found = new Set();
      for (const name of db.objectStoreNames) tx.objectStore(name).getAll().onsuccess = (e) => { const text = JSON.stringify(e.target.result); for (const id of ids) if (text.includes(id)) found.add(`${name}: ${id}`); };
      tx.oncomplete = () => { db.close(); resolve([...found]); };
    };
  }), idsQA);
  check('deleted, it leaves no record and no reference behind, in any table', idsQA.length > 50 && leftQA.length === 0 && (await page.locator('.card', { hasText: titleQA }).count()) === 0, leftQA.join(', '));
  eq('…nor any setting this browser kept for it (its dashboard, its last chapter…)', { before: keptQA.length > 1, after: await keysQA() }, { before: true, after: [] });
  check('…and no other novel changed', (await novelRows26()) === otherBeforeQA);

  // --- Views as modules (Optional Prompt D) ---
  // Each view of Visualize turned off and on for one novel: gone from the picker, from its own address and from the links
  // to it, never its records. A view another needs stays on while that one is on, with the reason and a safe way through.
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Import' }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'qa-sample.novel.json', mimeType: 'application/json', buffer: readFileSync('qa/qa-sample.novel.json') });
  await page.getByText(`Imported "${titleQA}".`).waitFor();
  const idD = await page.evaluate((title) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => { o.result.close(); resolve(r.result.find((p) => p.title === title).id); }; }; }), titleQA);
  const baseD = `${BASE}/project/${idD}`;
  // Every row of the novel, in every table, beside its own setting (and the stamps any page opened refreshes).
  const rowsD = () => page.evaluate((projectId) => new Promise((resolve) => {
    const o = indexedDB.open('novel-builder');
    o.onsuccess = () => {
      const db = o.result;
      const tx = db.transaction([...db.objectStoreNames]);
      const out = {};
      for (const name of db.objectStoreNames) tx.objectStore(name).getAll().onsuccess = (e) => { const rows = e.target.result.filter((r) => r && (r.projectId === projectId || r.id === projectId)).map(({ viewsOff, updatedAt, lastOpenedAt, computedAt, ...r }) => (r.id === projectId ? r : { ...r, updatedAt })); if (rows.length) out[name] = rows.sort((a, b) => String(a.id).localeCompare(String(b.id))); };
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(out)); };
    };
  }), idD);
  const offD = () => page.evaluate((projectId) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction('projects').objectStore('projects').get(projectId); r.onsuccess = () => { o.result.close(); resolve(r.result.viewsOff ?? []); }; }; }), idD);
  const viewsSection = page.locator('#views');
  const viewCard = (label) => viewsSection.getByRole('listitem', { name: `${label} view`, exact: true });
  const pickerD = () => page.getByRole('navigation', { name: 'Views' }).getByRole('link').allInnerTexts();
  const rowsBeforeD = await rowsD();

  await page.goto(`${baseD}/modules`);
  await viewsSection.waitFor();
  eq('the Module Manager lists every view as a module, all on, each saying what it reads and needs', {
    views: (await viewsSection.locator('.view-module strong').allInnerTexts()).length,
    status: await viewsSection.getByRole('status', { name: 'Views on' }).innerText(),
    journeys: (await viewCard('Journeys').locator('dl').innerText()).replace(/\s+/g, ' ').includes('Needs Places: its routes are drawn on the maps made in Places'),
    places: (await viewCard('Places').locator('dl').innerText()).replace(/\s+/g, ' ').includes('Needed by Journeys: it stays on while that view is on'),
    madeHere: (await viewCard('Places').locator('dl').innerText()).includes('Place levels, world maps and the places pinned on them: kept, and still checked, while it is off'),
  }, { views: 17, status: 'All 17 views are on.', journeys: true, places: true, madeHere: true });

  await viewCard('Places').getByRole('button', { name: 'Turn off the Places view' }).click();
  const blockedD = viewCard('Places').getByRole('alert');
  await blockedD.waitFor();
  check('a view another view needs is not turned off: it says which, and why, and nothing changes', (await blockedD.innerText()).startsWith('Places stays on while Journeys is on: Journeys needs it, because its routes are drawn on the maps made in Places') && JSON.stringify(await offD()) === '[]' && (await viewCard('Places').locator('.view-state').innerText()) === 'On');
  await blockedD.getByRole('button', { name: 'Turn off Journeys and Places' }).click();
  await viewCard('Places').locator('.view-state', { hasText: 'Off' }).waitFor();
  eq('…and offers the safe way: both off together, nothing deleted', { off: await offD(), notice: (await viewsSection.locator('.notice[role=status]').innerText()).startsWith('Journeys and Places are off. Nothing was deleted'), status: await viewsSection.getByRole('status', { name: 'Views on' }).innerText() }, { off: ['journeys', 'places'], notice: true, status: '15 of 17 views are on.' });
  for (const label of ['Character history', 'Plot board']) await viewCard(label).getByRole('button', { name: `Turn off the ${label} view` }).click();
  await viewCard('Plot board').locator('.view-state', { hasText: 'Off' }).waitFor();

  // Off: gone from the picker, its own address says so, and the links to it are not offered.
  await page.goto(`${baseD}/visualize`);
  await page.getByRole('navigation', { name: 'Views' }).waitFor();
  const pickedD = await pickerD();
  check('turned off, a view is gone from the Visualize picker; the others are all there', pickedD.length === 13 && !pickedD.some((l) => ['Places', 'Journeys', 'Character history', 'Plot board'].includes(l)) && pickedD[0] === 'Timeline', pickedD.join(', '));
  await page.goto(`${baseD}/visualize/places`);
  await page.getByRole('heading', { name: 'Places is turned off' }).waitFor();
  check('its own address says it is off, that nothing was deleted, and what is made only there', (await page.locator('.viz-off').innerText()).includes('Nothing of it was deleted') && (await page.locator('.viz-off').innerText()).includes('Its place levels, world maps and the places pinned on them are made only in this view: they are kept'));
  const ilseD = (await page.evaluate((projectId) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction('loreEntries').objectStore('loreEntries').getAll(); r.onsuccess = () => { o.result.close(); resolve(r.result.filter((e) => e.projectId === projectId && e.name === 'Ilse Varn')); }; }; }), idD))[0].id;
  const threadD = (await page.evaluate((projectId) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const r = o.result.transaction('plotThreads').objectStore('plotThreads').getAll(); r.onsuccess = () => { o.result.close(); resolve(r.result.filter((t) => t.projectId === projectId)); }; }; }), idD))[0].id;
  await page.goto(`${baseD}/characters/${ilseD}/history`);
  await page.locator('.vault-history').waitFor();
  const historyLinkD = await page.getByRole('link', { name: 'Ilse Varn’s whole life history' }).count();
  await page.goto(`${baseD}/plot?thread=${threadD}`);
  await page.getByRole('link', { name: 'Its chapters and scenes on the scene board →' }).waitFor();
  const lanesLinkD = await page.getByRole('link', { name: 'See it in the plot lanes →' }).count();
  await page.goto(`${baseD}/review`);
  await page.getByRole('status').filter({ hasText: /to look at/ }).first().waitFor();
  const checkedD = (await page.locator('.rv-sources').textContent()).replace(/\s+/g, ' ');
  check('the links to an off view are not offered; where a check lives in one, it says the view is off', historyLinkD === 0 && lanesLinkD === 0 && checkedD.includes('Journeys (the Journeys view is turned off in this novel): journeys against their dates'), `${historyLinkD} ${lanesLinkD} ${checkedD.slice(0, 200)}`);
  check('turning views off wrote nothing but the novel’s own setting', (await rowsD()) === rowsBeforeD);

  // On again, from the view's own page: Journeys brings Places with it.
  await page.goto(`${baseD}/visualize/journeys`);
  await page.getByRole('button', { name: 'Turn the Journeys view on (with Places, which it needs)' }).click();
  await page.getByRole('heading', { name: 'Journeys', level: 2 }).waitFor();
  eq('turned on from its own page, a view comes back with the view it needs', { off: await offD(), picker: (await pickerD()).filter((l) => l === 'Places' || l === 'Journeys') }, { off: ['history', 'plot'], picker: ['Places', 'Journeys'] });
  await page.goto(`${baseD}/modules`);
  await viewsSection.getByRole('button', { name: 'Turn every view on' }).click();
  await viewsSection.getByRole('status', { name: 'Views on' }).filter({ hasText: 'All 17 views are on.' }).waitFor();
  await page.goto(`${baseD}/characters/${ilseD}/history`);
  await page.getByRole('link', { name: 'Ilse Varn’s whole life history' }).waitFor();
  check('every view on again: the links are back, and every record is as it was', (await page.getByRole('link', { name: 'Ilse Varn’s whole life history' }).count()) === 1 && (await rowsD()) === rowsBeforeD && JSON.stringify(await offD()) === '[]');

  // Off and on, again and again, from the Module Manager.
  await page.goto(`${baseD}/modules`);
  await viewsSection.waitFor();
  for (let round = 0; round < 3; round++) {
    for (const label of ['Timeline', 'Knowledge graph', 'Charts']) {
      await viewCard(label).getByRole('button', { name: `Turn off the ${label} view` }).click();
      await viewCard(label).getByRole('button', { name: `Turn on the ${label} view` }).click();
      await viewCard(label).locator('.view-state', { hasText: 'On' }).waitFor();
    }
  }
  check('three rounds of off and on leave every record as it was', (await rowsD()) === rowsBeforeD && JSON.stringify(await offD()) === '[]');

  // With every view off, Visualize leaves the sidebar, and its page says why.
  await page.evaluate((projectId) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const store = o.result.transaction('projects', 'readwrite').objectStore('projects'); store.get(projectId).onsuccess = (e) => { store.put({ ...e.target.result, viewsOff: ['abilities', 'appearances', 'charts', 'factions', 'graph', 'history', 'journeys', 'kinds', 'knowledge', 'order', 'ownership', 'places', 'plot', 'progression', 'relationships', 'structure', 'timeline'] }).onsuccess = () => { o.result.close(); resolve(); }; }; }; }), idD);
  await page.goto(`${baseD}/visualize`);
  await page.getByRole('heading', { name: 'Every view is turned off' }).waitFor();
  await page.locator('.sidebar nav a', { hasText: /^Visualize$/ }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  check('every view off: Visualize leaves the sidebar, and its page says so and how to turn views on', (await page.locator('.sidebar nav a', { hasText: /^Visualize$/ }).count()) === 0 && (await page.getByRole('link', { name: 'Views in the Module Manager' }).count()) === 1);
  await page.getByRole('link', { name: 'Views in the Module Manager' }).click();
  await viewsSection.getByRole('button', { name: 'Turn every view on' }).click();
  await page.locator('.sidebar nav a', { hasText: /^Visualize$/ }).waitFor();
  check('…and on again, all of it is back', (await rowsD()) === rowsBeforeD && JSON.stringify(await offD()) === '[]');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${baseD}/modules#views`);
  await viewsSection.waitFor();
  check('mobile: the views in the Module Manager fit the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseD}/settings`);
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByLabel(/to confirm/).fill(titleQA);
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await page.waitForURL(BASE + '/');

  check('no browser errors', errors.length === 0, errors.join('\n      '));
} catch (err) {
  check(`script completed`, false, err.stack);
  const alive = await Promise.race([page.evaluate(() => 'responding').catch((e) => `evaluate failed: ${e.message}`), new Promise((resolve) => setTimeout(() => resolve('NOT RESPONDING after 5s'), 5000))]);
  console.log(`      at ${page.url()}\n      page: ${alive}\n      requests still open: ${[...pending].slice(0, 8).join(', ') || 'none'}\n      browser errors so far: ${errors.join(' | ') || 'none'}`);
  await shot('failure');
} finally {
  relay?.kill();
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
