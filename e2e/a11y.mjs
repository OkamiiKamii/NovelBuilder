// Accessibility and responsive audit of every Visualize view, on desktop, tablet and phone sizes.
// `npm run test:a11y` builds the app, serves the build and runs this; against a running server, `node e2e/a11y.mjs`.
// Uses only what the project has: Playwright, and Chromium's own accessibility tree (through the DevTools protocol).
// Fails on errors (a control with no name, the page scrolling sideways, a positive tab index, a keyboard trap,
// focus on a hidden element, a dialog that Escape does not close); prints warnings (small touch targets, legends
// whose entries differ by colour alone) for a person to judge.
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 },
];
const INTERACTIVE = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'menuitem', 'tab', 'option']);
const errors = [];
const warnings = [];
const err = (where, what) => errors.push(`${where}: ${what}`);
const warn = (where, what) => warnings.push(`${where}: ${what}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('pageerror', (e) => err('page', `script error: ${e.message}`));

async function createProject(title) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/project\/[\w-]+$/);
  return page.url().split('/').pop();
}

/** A novel with something in most views: characters, factions, places, items, chapters and scenes with words, plans, events, relationships, connections, a plot thread, journeys. */
async function seed(projectId) {
  await page.evaluate(([projectId, at]) => new Promise((resolve) => {
    const open = indexedDB.open('novel-builder');
    open.onsuccess = () => {
      const tx = open.result.transaction(['loreEntries', 'loreLinks', 'timelineEvents', 'chapters', 'chapterPlans', 'characterRelations', 'plotThreads', 'journeys'], 'readwrite');
      const id = (k) => `${projectId}-${k}`;
      const entry = (key, name, category) => tx.objectStore('loreEntries').put({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
      for (const [k, n] of [['mira', 'Mira'], ['orrin', 'Orrin'], ['tam', 'Tam'], ['king', 'The King']]) entry(k, n, 'character');
      entry('guild', 'The Guild', 'faction');
      entry('crown', 'The Crown', 'faction');
      for (const [k, n] of [['realm', 'The Realm'], ['docks', 'The Docks'], ['keep', 'The Keep']]) entry(k, n, 'location');
      entry('blade', 'The Ember Blade', 'item');
      const node = (key, title, kind, parentId, order, wordCount) => tx.objectStore('chapters').put({ id: id(key), projectId, parentId: parentId && id(parentId), kind, title, order, summary: '', notes: '', status: 'drafting', wordCount, charCount: wordCount * 5, mentions: [], createdAt: at, updatedAt: at });
      node('c1', 'The Gate', 'chapter', null, 0, 0);
      node('s1', 'Arrival', 'scene', 'c1', 0, 1200);
      node('s2', 'Night', 'scene', 'c1', 1, 800);
      node('c2', 'The Hall', 'chapter', null, 1, 2600);
      node('c3', 'The Keep', 'chapter', null, 2, 1500);
      const plan = (key, more) => tx.objectStore('chapterPlans').put({ id: id(key), projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', appearIds: [], mentionIds: [], updatedAt: at, ...more });
      plan('s1', { appearIds: [id('mira')], povIds: [id('mira')], labels: ['Action'] });
      plan('c2', { appearIds: [id('mira'), id('orrin')], labels: ['Quiet'] });
      plan('c3', { appearIds: [id('orrin')], povIds: [id('orrin')] });
      const year = (y, month = null) => ({ precision: 'exact', year: y, month, day: null, hour: null, minute: null });
      const ev = (key, name, when, more = {}) => tx.objectStore('timelineEvents').put({ id: id(key), projectId, name, description: '', when, duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, threadIds: [id('quest')], createdAt: at, updatedAt: at, ...more });
      ev('siege', 'The siege', year(10, 3), { nodeIds: [id('c2')], locationId: id('keep'), characters: [{ id: id('mira'), age: 20 }] });
      ev('truce', 'The truce', year(11), { nodeIds: [id('c3')], locationId: id('docks'), characters: [{ id: id('orrin'), age: null }], canon: 'provisional' });
      ev('crowning', 'The crowning', year(12), { nodeIds: [id('s1')], characters: [{ id: id('king'), age: 50 }] });
      let n = 0;
      const link = (from, to, type, validity, more = {}) => tx.objectStore('loreLinks').put({ id: id(`l${++n}`), projectId, fromId: id(from), toId: id(to), fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type, ...(validity ? { validity } : {}), createdAt: at + n, ...more });
      link('docks', 'realm', 'located-in');
      link('keep', 'realm', 'located-in');
      link('mira', 'guild', 'member-of', { from: { kind: 'date', when: year(9) }, until: null });
      link('orrin', 'crown', 'leads');
      link('guild', 'crown', 'allied-with');
      link('guild', 'docks', 'controls');
      link('mira', 'blade', 'owns', { from: { kind: 'date', when: year(8) }, until: null }, { how: 'found' });
      const stage = (sid, startNodeId, preset, label, category = 'social') => ({ id: sid, startNodeId, preset, category, label, fromRole: '', toRole: '', directional: false, title: '', affinity: 'neutral', event: '', notes: '' });
      tx.objectStore('characterRelations').put({ id: id('r1'), projectId, fromId: id('mira'), toId: id('orrin'), stages: [stage('s1', null, 'friends', 'Friends'), stage('s2', id('c3'), 'rivals', 'Rivals')], createdAt: at, updatedAt: at });
      tx.objectStore('characterRelations').put({ id: id('r2'), projectId, fromId: id('king'), toId: id('tam'), stages: [{ ...stage('s3', null, 'parent-child', 'Parent / Child', 'family'), fromRole: 'Parent', toRole: 'Child', directional: true }], createdAt: at, updatedAt: at });
      tx.objectStore('plotThreads').put({ id: id('quest'), projectId, title: 'The quest', premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [{ id: 'b1', nodeId: id('c1'), title: 'A map', note: '', role: 'introduction' }, { id: 'b2', nodeId: id('c3'), title: 'Found', note: '', role: 'resolution' }], notes: '', muted: false, createdAt: at, updatedAt: at });
      tx.objectStore('journeys').put({ id: id('j1'), projectId, travellerIds: [id('mira')], fromId: id('docks'), toId: id('keep'), via: [], departure: { kind: 'date', when: year(10, 1) }, arrival: { kind: 'date', when: year(10, 2) }, afterId: null, method: 'on foot', methodId: null, duration: null, distance: null, distanceUnit: '', eventIds: [], note: '', createdAt: at, updatedAt: at });
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  }), [projectId, Date.now()]);
}

/** Interactive nodes Chromium exposes with no accessible name. */
async function unnamed(cdp) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const out = [];
  for (const node of nodes) {
    const role = node.role?.value;
    if (node.ignored || !INTERACTIVE.has(role) || (node.name?.value ?? '').trim()) continue;
    let what = role;
    if (node.backendDOMNodeId) {
      try {
        const { node: dom } = await cdp.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId });
        const attrs = Object.fromEntries((dom.attributes ?? []).reduce((pairs, v, i, all) => (i % 2 ? pairs : [...pairs, [v, all[i + 1]]]), []));
        what = `${role} <${dom.nodeName.toLowerCase()}${attrs.class ? ` class="${attrs.class}"` : ''}${attrs.type ? ` type="${attrs.type}"` : ''}>`;
      } catch {
        /* the node went away */
      }
    }
    out.push(what);
  }
  return out;
}

/** Tab through the page: what gets focus, in order, whether it shows it, and whether focus gets stuck. */
async function tabWalk(steps) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  const seen = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const inSvg = el instanceof SVGElement;
      const shown = (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none' || inSvg;
      const id = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}:${(el.getAttribute('aria-label') ?? el.labels?.[0]?.textContent ?? el.textContent ?? '').trim().slice(0, 40)}`;
      // Inside a drawing, focus must be on something in the part shown.
      const frame = el.closest('.viz-viewport')?.getBoundingClientRect();
      const outside = Boolean(frame) && (box.right < frame.left || box.left > frame.right || box.bottom < frame.top || box.top > frame.bottom);
      return { id, shown, hidden: box.width === 0 || box.height === 0 || style.visibility === 'hidden' || outside, inDialog: Boolean(el.closest('dialog[open]')) };
    });
    if (!info) continue;
    seen.push(info);
  }
  return seen;
}

/** Legends whose entries are told apart by colour alone: the same swatch once its colours are set aside. */
async function colourOnlyLegends() {
  return page.evaluate(() => {
    const out = [];
    for (const legend of document.querySelectorAll('.legend, .viz-legend, figure .legend')) {
      const shapes = new Map();
      for (const item of legend.querySelectorAll('li')) {
        const svg = item.querySelector('svg');
        if (!svg) continue;
        // A letter code beside the swatch tells entries apart as well as its shape does.
        const shape = svg.innerHTML.replace(/(fill|stroke|style|color|opacity)="[^"]*"/g, '').replace(/\s+/g, ' ') + (item.querySelector('.viz-glyph')?.textContent ?? '');
        const label = item.textContent.trim();
        if (shapes.has(shape)) out.push(`“${shapes.get(shape)}” and “${label}”`);
        else shapes.set(shape, label);
      }
    }
    return out;
  });
}

/** Controls something else sits on top of (a floating button, a panel), each checked once scrolled into the middle of the screen. */
async function covered() {
  return page.evaluate(() => {
    const out = [];
    const controls = [...document.querySelectorAll('main button, main a[href], main input:not([type=hidden]), main select')].filter((el) => !el.closest('dialog') && el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) && el.getBoundingClientRect().width > 0).slice(0, 60);
    for (const el of controls) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const box = el.getBoundingClientRect();
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el.labels && [...el.labels].some((l) => l.contains(top)))) out.push(`${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}” under ${top.tagName.toLowerCase()}.${(top.getAttribute('class') ?? '').split(' ')[0]}`);
    }
    window.scrollTo(0, 0);
    return out;
  });
}

/** What sticks out past the window's right edge, deepest first: where a sideways scroll comes from. */
async function wide() {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const out = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== 'fixed' && !el.parentElement?.closest('.table-scroll, .viz-viewport'));
    return out.filter((el) => !out.some((o) => o !== el && el.contains(o))).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]} (right edge ${Math.round(el.getBoundingClientRect().right)}px)`).join(', ');
  });
}

/**
 * Pointer targets too small for a fingertip. In the views (Optional Prompt A): 44 by 44 pixels, leaving out links in
 * running text and cells of a table or matrix (data in a dense grid, whose list form offers the same records).
 * Elsewhere: 24 by 24, leaving out links inside running text, as before.
 */
async function smallTargets() {
  return page.evaluate(() => {
    const out = { views: [], other: [] };
    for (const el of document.querySelectorAll('main button, main a[href], main input:not([type=hidden]), main select, main [role=button]')) {
      if (el instanceof SVGElement) continue;
      const inView = Boolean(el.closest('.visualize'));
      if (inView ? el.closest('p, dd, li > span, td') : el.closest('p, li > span, td') && el.tagName === 'A') continue;
      const box = (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label') ? el.closest('label') : el).getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const min = inView ? 44 : 24;
      if (box.width < min || box.height < min) (inView ? out.views : out.other).push(`${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}” ${Math.round(box.width)}×${Math.round(box.height)}`);
    }
    return out;
  });
}

try {
  const projectId = await createProject('Audit Book');
  await seed(projectId);
  const base = `${BASE}/project/${projectId}`;
  await page.goto(`${base}/visualize`);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link').first().waitFor();
  const views = await page.getByRole('navigation', { name: 'Views' }).getByRole('link').evaluateAll((links) => links.map((a) => ({ label: a.textContent.trim(), key: a.getAttribute('href').split('/visualize/')[1].split('?')[0] })));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  let audited = 0;

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const view of views) {
      for (const mode of ['visual', 'list']) {
        const where = `${size.name} · ${view.label}${mode === 'list' ? ' (list)' : ''}`;
        await page.goto(`${base}/visualize/${view.key}${mode === 'list' ? '?as=list' : ''}`);
        await page.getByRole('heading', { name: view.label, level: 2 }).waitFor();
        await page.waitForTimeout(250);
        audited++;
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) err(where, `the page scrolls sideways (${await page.evaluate(() => document.documentElement.scrollWidth)}px wide): ${await wide()}`);
        for (const what of await unnamed(cdp)) err(where, `a control with no name: ${what}`);
        const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => el.tabIndex > 0).map((el) => el.tagName));
        if (positive.length) err(where, `${positive.length} elements with a positive tab index`);
        for (const pair of await colourOnlyLegends()) warn(where, `legend entries told apart by colour alone: ${pair}`);
        // A view that draws says what its marks mean (Optional Prompt A). A chart of one series is named by its title instead.
        if (mode === 'visual' && (await page.evaluate(() => {
          const root = document.querySelector('.viz-export-root');
          const draws = root?.querySelector('.viz-viewport, svg[role="group"], .kt-track, .own-chain');
          return Boolean(draws) && !root.querySelector('.viz-legend');
        }))) err(where, 'it draws, but has no legend saying what its marks mean');
        if (size.name !== 'desktop') {
          const small = await smallTargets();
          for (const t of small.views) err(where, `a control smaller than 44px to a fingertip: ${t}`);
          for (const t of small.other) warn(where, `small touch target: ${t}`);
          // Made larger for a fingertip, a control must not then shrink past its own words.
          const clipped = await page.evaluate(() => [...document.querySelectorAll('.visualize button, .visualize a, .visualize label')].filter((el) => el.offsetWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'hidden').map((el) => `${el.tagName.toLowerCase()} “${el.textContent.trim().slice(0, 30)}”`));
          for (const c of clipped) err(where, `the words run past their control: ${c}`);
        }
        if (size.name !== 'desktop') for (const c of await covered()) err(where, `a control is covered: ${c}`);
        // The keyboard: once per view and size, drawn.
        if (mode === 'visual') {
          const walk = await tabWalk(45);
          const counts = new Map();
          for (const step of walk) counts.set(step.id, (counts.get(step.id) ?? 0) + 1);
          for (const [id, n] of counts) if (n > 6 && !id.startsWith('a.') && walk.length > 10) err(where, `focus keeps returning to ${id} (${n} times in 45 presses): a keyboard trap?`);
          for (const step of walk.filter((s) => s.hidden)) err(where, `focus lands on something not visible: ${step.id}`);
          for (const step of walk.filter((s) => !s.shown)) warn(where, `no focus outline or ring on ${step.id} (check by eye)`);
        }
      }
    }
  }

  // With a record's details open beside a drawing, nothing of the drawing (its zoom buttons included) runs under them (Optional Prompt A).
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const view of views) {
    await page.goto(`${base}/visualize/${view.key}`);
    await page.getByRole('heading', { name: view.label, level: 2 }).waitFor();
    await page.waitForTimeout(400);
    const mark = page.locator('.viz-viewport [data-mark][role=button], .viz-viewport .kg-node, .tl-mark').first();
    if (!(await mark.count())) continue;
    await mark.click().catch(() => {});
    const panel = page.locator('aside.viz-detail');
    if (!(await panel.isVisible().catch(() => false))) continue;
    const under = await page.evaluate(() => {
      const p = document.querySelector('aside.viz-detail').getBoundingClientRect();
      const hits = (r) => r.width > 0 && r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top;
      return [...document.querySelectorAll('.viz-viewport, .viz-zoom, .timeline-area')].filter((el) => hits(el.getBoundingClientRect())).map((el) => el.className.split(' ')[0]);
    });
    if (under.length) err(`desktop · ${view.label}`, `the details panel covers part of the view: ${under.join(', ')}`);
  }

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const [path, name] of [['graph', 'Story graph'], ['relationships', 'Relationships'], ['timeline', 'Timeline'], ['board', 'Scene board'], ['dashboard', 'Dashboard'], ['progress', 'Progress']]) {
      const where = `${size.name} · ${name} page`;
      await page.goto(`${base}/${path}`);
      await page.locator('main h1').first().waitFor();
      await page.waitForTimeout(300);
      audited++;
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) err(where, `the page scrolls sideways (${await page.evaluate(() => document.documentElement.scrollWidth)}px wide): ${await wide()}`);
      for (const what of await unnamed(cdp)) err(where, `a control with no name: ${what}`);
      const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => el.tabIndex > 0).length);
      if (positive) err(where, `${positive} elements with a positive tab index`);
      for (const pair of await colourOnlyLegends()) warn(where, `legend entries told apart by colour alone: ${pair}`);
      if (size.name !== 'desktop') for (const c of await covered()) err(where, `a control is covered: ${c}`);
      const walk = await tabWalk(30);
      for (const step of walk.filter((s) => s.hidden)) err(where, `focus lands on something not visible: ${step.id}`);
    }
  }

  // Your dashboard (Optional Prompt B): every kind of widget, at every size, read and then being arranged with the choice
  // of a new widget and one widget's settings open. Its controls and the names in its lists are held to the fingertip size the views are.
  const DASH_KINDS = ['upcoming', 'threads', 'recent', 'words', 'appearances', 'warnings', 'saved'];
  await page.evaluate(([key, kinds]) => localStorage.setItem(key, JSON.stringify({ version: 1, widgets: kinds.map((kind, i) => ({ id: `audit-${kind}`, kind, w: (i % 3) + 1, h: 2, title: '', config: {} })) })), [`novel-builder:dashboard:${projectId}`, DASH_KINDS]);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const arranging of [false, true]) {
      const where = `${size.name} · Your dashboard${arranging ? ' (arranging)' : ''}`;
      await page.goto(`${base}/dashboard`);
      await page.locator('.dash-card').nth(DASH_KINDS.length - 1).waitFor();
      if (arranging) {
        await page.getByRole('button', { name: 'Customize' }).click();
        await page.getByRole('button', { name: 'Add a widget' }).click();
        await page.locator('.dash-card').first().getByRole('button', { name: 'Settings' }).click();
      }
      await page.waitForTimeout(400);
      audited++;
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) err(where, `the page scrolls sideways (${await page.evaluate(() => document.documentElement.scrollWidth)}px wide): ${await wide()}`);
      for (const what of await unnamed(cdp)) err(where, `a control with no name: ${what}`);
      const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => el.tabIndex > 0).length);
      if (positive) err(where, `${positive} elements with a positive tab index`);
      if (size.name !== 'desktop') {
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('.dash button, .dash a[href], .dash input:not([type=hidden]), .dash select')]
            .filter((el) => !(el.tagName === 'A' && el.closest('p')))
            .map((el) => ({ el, box: (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label') ? el.closest('label') : el).getBoundingClientRect() }))
            .filter(({ box }) => box.width && box.height && (box.width < 44 || box.height < 44))
            .map(({ el, box }) => `${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}” ${Math.round(box.width)}×${Math.round(box.height)}`),
        );
        for (const t of small) err(where, `a control smaller than 44px to a fingertip: ${t}`);
        const clipped = await page.evaluate(() => [...document.querySelectorAll('.dash button, .dash a, .dash label')].filter((el) => el.offsetWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'hidden').map((el) => `${el.tagName.toLowerCase()} “${el.textContent.trim().slice(0, 30)}”`));
        for (const c of clipped) err(where, `the words run past their control: ${c}`);
        for (const c of await covered()) err(where, `a control is covered: ${c}`);
      }
      const walk = await tabWalk(45);
      const counts = new Map();
      for (const step of walk) counts.set(step.id, (counts.get(step.id) ?? 0) + 1);
      for (const [id, n] of counts) if (n > 6 && !id.startsWith('a.') && walk.length > 10) err(where, `focus keeps returning to ${id} (${n} times in 45 presses): a keyboard trap?`);
      for (const step of walk.filter((s) => s.hidden)) err(where, `focus lands on something not visible: ${step.id}`);
      for (const step of walk.filter((s) => !s.shown)) warn(where, `no focus outline or ring on ${step.id} (check by eye)`);
    }
  }
  await page.evaluate((key) => localStorage.removeItem(key), `novel-builder:dashboard:${projectId}`);

  // Views as modules (Optional Prompt D): the Module Manager with its views, and a view that is turned off, at every size.
  const setOff = (keys) => page.evaluate(([projectId, viewsOff]) => new Promise((resolve) => { const o = indexedDB.open('novel-builder'); o.onsuccess = () => { const store = o.result.transaction('projects', 'readwrite').objectStore('projects'); store.get(projectId).onsuccess = (e) => { store.put({ ...e.target.result, viewsOff }).onsuccess = () => { o.result.close(); resolve(); }; }; }; }), [projectId, keys]);
  await setOff(['charts']);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const [path, name, ready] of [['modules', 'Module Manager', '#views'], ['visualize/charts', 'a view turned off', '.viz-off']]) {
      const where = `${size.name} · ${name}`;
      await page.goto(`${base}/${path}`);
      await page.locator(ready).waitFor();
      await page.waitForTimeout(300);
      audited++;
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) err(where, `the page scrolls sideways (${await page.evaluate(() => document.documentElement.scrollWidth)}px wide): ${await wide()}`);
      for (const what of await unnamed(cdp)) err(where, `a control with no name: ${what}`);
      const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => el.tabIndex > 0).length);
      if (positive) err(where, `${positive} elements with a positive tab index`);
      if (size.name !== 'desktop') for (const c of await covered()) err(where, `a control is covered: ${c}`);
      const walk = await tabWalk(30);
      for (const step of walk.filter((s) => s.hidden)) err(where, `focus lands on something not visible: ${step.id}`);
      for (const step of walk.filter((s) => !s.shown)) warn(where, `no focus outline or ring on ${step.id} (check by eye)`);
    }
  }
  await setOff([]);

  // Drawings without a mouse: zoomed in, the arrows still keep the focused mark in view; Shift and an arrow move a node as dragging does.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [view, mark] of [['relationships', '.rel-dot'], ['graph', '.kg-node']]) {
    await page.goto(`${base}/visualize/${view}`);
    const first = page.locator(mark).first();
    await first.waitFor();
    await page.locator('.viz-viewport').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('+');
    await page.waitForTimeout(150);
    await page.locator(`${mark}[tabindex="0"]`).focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(60);
      const inView = await page.evaluate(() => {
        const box = document.activeElement.getBoundingClientRect();
        const frame = document.querySelector('.viz-viewport').getBoundingClientRect();
        return box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
      });
      if (!inView) err(`keyboard · ${view}`, `zoomed in, the arrow keys move focus to a mark outside the part shown (step ${i + 1})`);
    }
    const before = await page.evaluate(() => document.activeElement.getAttribute('transform'));
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(80);
    if ((await page.evaluate(() => document.activeElement.getAttribute('transform'))) === before) err(`keyboard · ${view}`, 'Shift and an arrow do not move the focused node');
  }

  // Dialogs: Escape closes them, and focus goes back to what opened them.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [view, opener] of [['factions', 'Record a tie'], ['ownership', 'Record what happens to it'], ['journeys', 'Record a journey']]) {
    await page.goto(`${base}/visualize/${view}`);
    const button = page.getByRole('button', { name: opener }).first();
    if (!(await button.waitFor({ timeout: 8000 }).then(() => true, () => false))) {
      warn(`dialog · ${view}`, `no “${opener}” button found to test`);
      continue;
    }
    await button.focus();
    await page.keyboard.press('Enter');
    await page.locator('dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    const closed = await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false);
    if (!closed) err(`dialog · ${view}`, `Escape does not close “${opener}”`);
    const back = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (closed && !back.includes(opener)) err(`dialog · ${view}`, `after Escape, focus is not back on “${opener}” (it is on “${back.slice(0, 40)}”)`);
  }
  // The details of a selection: Escape closes the panel (desktop) and the sheet (phone), and focus goes back to the selection.
  for (const size of [SIZES[0], SIZES[2]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`${base}/visualize/timeline?as=list`);
    const pickButton = page.getByRole('button', { name: 'The siege', exact: true });
    await pickButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/select=event/);
    const panel = size.name === 'phone' ? page.locator('dialog[open]') : page.locator('aside.viz-detail');
    await panel.waitFor();
    // The panel takes focus as it opens (its heading, or the sheet): Escape is pressed there.
    await page.waitForFunction(() => Boolean(document.activeElement?.closest('aside.viz-detail, dialog[open]')), null, { timeout: 2000 }).catch(() => {});
    await page.keyboard.press('Escape');
    const closed = await panel.waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false);
    if (!closed) err(`details · ${size.name}`, 'Escape does not close the details');
    await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 1000 }).catch(() => {});
    const back = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (closed && back !== 'The siege') err(`details · ${size.name}`, `after Escape, focus is not back on the selection (it is on “${back.slice(0, 40)}”)`);
  }

  // Reduced motion: with the preference set, nothing in Visualize animates or transitions.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const view of views) {
    await page.goto(`${base}/visualize/${view.key}`);
    await page.getByRole('heading', { name: view.label, level: 2 }).waitFor();
    const moving = await page.evaluate(() => [...document.querySelectorAll('.visualize *')].filter((el) => {
      const s = getComputedStyle(el);
      return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) || s.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
    }).map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}`));
    if (moving.length) err(`reduced motion · ${view.label}`, `still moving: ${[...new Set(moving)].slice(0, 5).join(', ')}`);
  }
  // The Story graph lays itself out by a simulation: with reduced motion it is drawn at rest, not seen settling.
  await page.goto(`${base}/graph`);
  await page.locator('.graph-canvas').waitFor();
  if (!(await page.locator('.graph-canvas[data-settled="true"]').waitFor({ timeout: 700 }).then(() => true, () => false))) err('reduced motion · Story graph page', 'the layout is still moving after 0.7 s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  console.log(`Audited ${audited} pages: ${views.length} Visualize views, drawn and as lists, 6 other pages that draw, your dashboard read and being arranged, the Module Manager and a view turned off, at ${SIZES.map((s) => `${s.name} ${s.width}×${s.height}`).join(', ')}.`);
} catch (e) {
  err('audit', `did not finish: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
}

const group = (list) => [...list.reduce((m, line) => m.set(line, (m.get(line) ?? 0) + 1), new Map())].map(([line, n]) => (n > 1 ? `${line} (×${n})` : line));
console.log(`\nErrors: ${errors.length}`);
for (const line of group(errors)) console.log(`ERROR  ${line}`);
console.log(`\nWarnings, for a person to judge: ${warnings.length}`);
for (const line of group(warnings)) console.log(`WARN   ${line}`);
process.exit(errors.length ? 1 : 0);
