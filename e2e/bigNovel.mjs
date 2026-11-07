// A large novel for measuring speed: the same records every time (a seeded random number generator),
// shaped as the app stores them. Used by `e2e/perf.mjs` in the browser and by `src/modules/perf/perf.test.ts` in Node.
//
// At scale 1: 3 acts, 120 chapters with 4 scenes each (603 parts), 1,550 codex entries (800 characters,
// 200 places, 50 factions, 200 items, 300 records of the author's own kind), 2,000 events, 4,000 connections,
// 800 relationships, 480 scene plans, 40 plot threads with 600 developments, 200 journeys,
// 300 canon statements and 50 tracked statuses.

/** Mulberry32: small, fast, and the same numbers for the same seed. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bigNovel(projectId, at, scale = 1) {
  const r = random(47);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(r() * list.length)];
  const some = (list, lo, hi) => [...new Set(Array.from({ length: int(lo, hi) }, () => pick(list)))];
  const id = (k) => `${projectId}-${k}`;
  const n = (count) => Math.round(count * scale);
  const rows = { chapters: [], chapterPlans: [], loreEntries: [], loreSchemas: [], loreLinks: [], characterRelations: [], timelineEvents: [], plotThreads: [], journeys: [], canonFacts: [], continuityRules: [] };

  // The manuscript: acts, chapters, scenes, with words.
  const acts = [0, 1, 2].map((i) => id(`act${i}`));
  acts.forEach((a, i) => rows.chapters.push({ id: a, projectId, parentId: null, kind: 'act', title: `Act ${i + 1}`, order: i, summary: '', notes: '', status: 'drafting', wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at }));
  const chapters = [];
  const scenes = [];
  for (let c = 0; c < n(120); c++) {
    const cid = id(`ch${c}`);
    chapters.push(cid);
    rows.chapters.push({ id: cid, projectId, parentId: acts[Math.min(2, Math.floor((c / n(120)) * 3))], kind: 'chapter', title: `Chapter ${c + 1}`, order: c, summary: '', notes: '', status: pick(['idea', 'drafting', 'final']), wordCount: 0, charCount: 0, mentions: [], createdAt: at, updatedAt: at });
    for (let s = 0; s < 4; s++) {
      const sid = id(`sc${c}-${s}`);
      scenes.push(sid);
      const words = int(400, 2600);
      rows.chapters.push({ id: sid, projectId, parentId: cid, kind: 'scene', title: `Scene ${c + 1}.${s + 1}`, order: s, summary: '', notes: '', status: 'drafting', wordCount: words, charCount: words * 5, mentions: [], createdAt: at, updatedAt: at });
    }
  }

  // The codex.
  const entry = (key, name, category) => {
    rows.loreEntries.push({ id: id(key), projectId, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: at, updatedAt: at });
    return id(key);
  };
  const characters = Array.from({ length: n(800) }, (_, i) => entry(`char${i}`, `Character ${String(i).padStart(4, '0')}`, 'character'));
  const places = Array.from({ length: n(200) }, (_, i) => entry(`place${i}`, `Place ${String(i).padStart(3, '0')}`, 'location'));
  const factions = Array.from({ length: n(50) }, (_, i) => entry(`faction${i}`, `Faction ${String(i).padStart(2, '0')}`, 'faction'));
  const items = Array.from({ length: n(200) }, (_, i) => entry(`item${i}`, `Item ${String(i).padStart(3, '0')}`, 'item'));
  rows.loreSchemas.push({ id: id('schema-artifact'), projectId, key: 'artifact', name: 'Artifacts', singular: 'Artifact', color: '#7a4fa3', builtin: false, order: 30, fields: [], createdAt: at, updatedAt: at });
  Array.from({ length: n(300) }, (_, i) => entry(`artifact${i}`, `Artifact ${String(i).padStart(3, '0')}`, 'artifact'));

  // Connections.
  let k = 0;
  const link = (from, to, type, more = {}) => rows.loreLinks.push({ id: id(`l${k++}`), projectId, fromId: from, toId: to, fromType: 'entry', toType: 'entry', fromLabel: '', toLabel: '', type, createdAt: at + k, ...more });
  places.forEach((p, i) => i > 9 && link(p, places[i % 10], 'located-in'));
  characters.forEach((c) => link(c, pick(factions), 'member-of'));
  for (let i = 0; i < n(300); i++) link(pick(characters), pick(items), 'owns');
  for (let i = 0; i < n(60); i++) link(pick(factions), pick(factions), pick(['allied-with', 'at-war-with']));
  const year = (y, month = null) => ({ precision: 'exact', year: y, month, day: null, hour: null, minute: null });
  while (rows.loreLinks.length < n(4000)) link(pick(characters), pick([...characters, ...places, ...items]), pick(['knows-about', 'related', 'distrusts', 'considers-a-rival']), r() < 0.3 ? { validity: { from: { kind: 'date', when: year(int(1, 300)) }, until: null } } : {});

  // Events.
  const events = [];
  for (let i = 0; i < n(2000); i++) {
    const eid = id(`ev${i}`);
    events.push(eid);
    rows.timelineEvents.push({ id: eid, projectId, name: `Event ${String(i).padStart(4, '0')}`, description: '', when: year(int(1, 400), r() < 0.7 ? int(1, 12) : null), duration: null, importance: pick(['major', 'minor']), locationId: pick(places), characters: some(characters, 1, 4).map((c) => ({ id: c, age: null })), entryIds: [], nodeIds: r() < 0.6 ? [pick(scenes)] : [], afterId: i > 0 && r() < 0.1 ? events[int(0, i - 1)] : null, threadIds: [], canon: r() < 0.05 ? 'provisional' : undefined, createdAt: at, updatedAt: at });
  }

  // Relationships, with stages through the book.
  for (let i = 0; i < n(800); i++) {
    const stages = Array.from({ length: int(1, 3) }, (_, s) => ({ id: `s${s}`, startNodeId: s === 0 ? null : pick(chapters), preset: pick(['friends', 'rivals', 'enemies', 'mentor-student', 'romantic-interest']), category: 'social', label: 'Related', fromRole: '', toRole: '', directional: false, title: '', affinity: 'neutral', event: '', notes: '' }));
    rows.characterRelations.push({ id: id(`rel${i}`), projectId, fromId: pick(characters), toId: pick(characters), stages, createdAt: at, updatedAt: at });
  }

  // Plans: who appears where, points of view, labels.
  for (const s of scenes) {
    rows.chapterPlans.push({ id: s, projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', appearIds: some(characters, 2, 6), mentionIds: [], povIds: [pick(characters.slice(0, 20))], labels: r() < 0.5 ? [pick(['Action', 'Quiet', 'Dialogue', 'Reveal'])] : [], updatedAt: at });
  }

  // Plot threads with developments, and their events.
  for (let t = 0; t < n(40); t++) {
    const tid = id(`thread${t}`);
    rows.plotThreads.push({ id: tid, projectId, title: `Thread ${String(t).padStart(2, '0')}`, premise: '', category: 'subplot', customCategory: '', status: 'active', characterIds: some(characters, 1, 3), locationIds: [], targetNodeId: null, targetNote: '', beats: Array.from({ length: 15 }, (_, b) => ({ id: `b${b}`, nodeId: pick(scenes), title: `Beat ${b + 1}`, note: '', role: pick(['introduction', 'development', 'development', 'resolution']) })), notes: '', muted: false, createdAt: at, updatedAt: at });
    for (let e = 0; e < 10; e++) pick(rows.timelineEvents).threadIds.push(tid);
  }

  // Journeys.
  for (let j = 0; j < n(200); j++) {
    const y = int(1, 400);
    rows.journeys.push({ id: id(`j${j}`), projectId, travellerIds: some(characters, 1, 2), fromId: pick(places), toId: pick(places), via: [], departure: { kind: 'date', when: year(y, 1) }, arrival: { kind: 'date', when: year(y, 3) }, afterId: null, method: '', methodId: null, duration: null, distance: null, distanceUnit: '', eventIds: [], note: '', createdAt: at, updatedAt: at });
  }

  // Canon and continuity, for the markers and the review.
  for (let f = 0; f < n(300); f++) {
    rows.canonFacts.push({ id: id(`fact${f}`), projectId, subject: `Subject ${f % 120}`, statement: `Statement ${f}`, kind: 'lore', status: pick(['canon', 'canon', 'provisional', 'conflicting']), entryIds: [pick(characters)], sources: [], conflictsWith: [], replacedById: null, dismissed: [], history: [], notes: '', createdAt: at + f, updatedAt: at });
  }
  for (let d = 0; d < n(50); d++) {
    rows.continuityRules.push({ id: id(`rule${d}`), projectId, kind: 'status', entryId: characters[d], aliases: [], state: 'deceased', label: '', words: [], scope: 'paragraph', holderId: null, toEntryId: null, amount: null, unit: 'hours', fromNodeId: pick(chapters), untilNodeId: null, note: '', createdAt: at, updatedAt: at });
  }
  return rows;
}
