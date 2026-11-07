import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCanonService, registerCanon } from '@/modules/canon/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { SYSTEM_PRESETS } from '@/modules/systems/presets';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { mentionedIn } from './context';
import { buildRequest, extractAnswer, interpret } from './prompt';
import { AssistantError, askClaude, manualPrompt, parseSettings } from './providers';
import { createAssistantService, registerAssistant } from './service';
import { MODES, type Fact } from './types';

let n = 0;
function setup() {
  const db = new NovelDB(`assistant-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerCanon(registry);
  registerSystems(registry);
  registerAssistant(registry);
  const changed = projects.contentChanged;
  const codex = createCodexService(db, changed);
  const plot = createPlotService(db, changed);
  return {
    db, projects, codex, plot, manuscript: createManuscriptService(db, changed), relationships: createRelationshipService(db, changed), timeline: createTimelineService(db, changed), canon: createCanonService(db, changed),
    systems: createSystemsService(db, changed), assistant: createAssistantService(db, codex, plot, changed),
  };
}
let app: ReturnType<typeof setup>;
beforeEach(() => {
  app = setup();
});

async function world() {
  const { projects, codex, plot, manuscript, relationships, timeline, canon, systems, assistant } = app;
  const p = await projects.create({ title: 'Heroes' });
  const c = codex.forProject(p.id);
  const alex = await c.create('character', 'Alex');
  await c.update(alex.id, { summary: 'A reluctant recruit.', description: 'Possesses Solar Absorption.', notes: 'PRIVATE: maybe kill him off', tags: ['protagonist'], fields: [{ id: 'f', key: 'Age', value: '19' }] });
  const marcus = await c.create('character', 'Marcus');
  const guild = await c.create('faction', 'Hero Association');
  await c.update(guild.id, { summary: 'Licenses heroes in the capital.' });
  const stranger = await c.create('character', 'Unrelated Stranger');
  await c.update(stranger.id, { summary: 'Should never be sent.' });
  const chapter = await manuscript.forProject(p.id).create('chapter', null, 'Chapter 25');
  await manuscript.forProject(p.id).update(chapter.id, { summary: 'Alex is offered a place.' });
  await manuscript.forProject(p.id).saveDoc(chapter.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SECRET MANUSCRIPT TEXT' }] }] }, { words: 3, characters: 22 });
  const bond = await relationships.forProject(p.id).create(alex.id, marcus.id, 'friends');
  await relationships.forProject(p.id).updateStage(bond.id, (await relationships.forProject(p.id).get(bond.id))!.stages[0].id, { title: 'Partners', startNodeId: chapter.id });
  const thread = await plot.forProject(p.id).create('Demon Investigation');
  await plot.forProject(p.id).update(thread.id, { status: 'active', premise: 'Who is opening the gates?', characterIds: [alex.id], category: 'mystery' });
  await plot.forProject(p.id).addBeat(thread.id, { title: 'First report', nodeId: chapter.id });
  const closed = await plot.forProject(p.id).create('Old Debt');
  await plot.forProject(p.id).update(closed.id, { status: 'resolved', characterIds: [alex.id] });
  const event = await timeline.forProject(p.id).create('The Induction');
  await timeline.forProject(p.id).update(event.id, { characters: [{ id: alex.id, age: null }], locationId: null, description: 'Alex is sworn in.' });
  await canon.forProject(p.id).create({ subject: 'Solar Absorption', statement: 'Needs direct sunlight', status: 'canon', entryIds: [alex.id] });
  await canon.forProject(p.id).create({ subject: 'Alex’s father', statement: 'May be the villain', status: 'provisional', entryIds: [alex.id] });
  await canon.forProject(p.id).create({ subject: 'Old idea', statement: 'Alex is a robot', status: 'non-canon', entryIds: [alex.id] });
  const game = await systems.forProject(p.id).create(SYSTEM_PRESETS[0].content);
  const sheet = await systems.forProject(p.id).addSheet(game.id, alex.id);
  await systems.forProject(p.id).updateSheet(sheet.id, () => ({ progress: { [game.tracks[0].id]: 12 }, itemIds: [game.items.find((i) => i.name === 'Mage')!.id] }));
  return { p, a: assistant.forProject(p.id), c, alex, marcus, guild, stranger, chapter, thread, closed };
}

const answer = (facts: Fact[]) => ({
  items: [
    { type: 'established', fact: facts[0].id },
    { type: 'established', fact: 'F999', text: 'Alex is secretly a prince.' },
    { type: 'assumption', text: 'The barrier is vulnerable to energy overloads.' },
    { type: 'suggestion', title: 'Overload the barrier', text: 'Alex overloads his ability to break the barrier.', based_on: [facts[0].id, 'F999'], fits: 'plot' },
    { type: 'suggestion', title: 'A debt to Marcus', text: 'Marcus covers for him and expects it repaid.', fits: 'character' },
    { type: 'suggestion', text: 'The Association keeps a second ledger.', fits: 'worldbuilding' },
    { type: 'suggestion', text: '   ' },
    { type: 'gossip', text: 'ignored' },
  ],
});

describe('what is sent', () => {
  it('builds numbered facts from the project\'s own records about what is attached', async () => {
    const { a, alex, guild, chapter } = await world();
    const { facts } = await a.prepare('plot', 'What next?', { entryIds: [alex.id, guild.id], threadIds: [], nodeIds: [chapter.id] });
    expect(facts.map((f) => f.id)).toEqual(facts.map((_, i) => `F${i + 1}`));
    const all = facts.map((f) => `[${f.label}] ${f.text}`);
    expect(all).toEqual(expect.arrayContaining([
      '[Alex · Character] Alex is a character. A reluctant recruit. Possesses Solar Absorption.',
      '[Alex · Character] Alex — Age: 19',
      '[Alex · Character] Alex is tagged: protagonist.',
      '[Hero Association · Faction / Species] Hero Association is a faction / species. Licenses heroes in the capital.',
      '[Relationship] Alex and Marcus: Partners (neutral), since Chapter 25.',
      '[Plot thread] “Demon Investigation” (Mystery, Active). Who is opening the gates? Involves Alex. Developments so far: Chapter 25: First report.',
      '[Canon] Solar Absorption: Needs direct sunlight',
      "[Provisional (not settled)] Alex’s father: May be the villain (a working idea of the author's, not yet canon)",
      '[Chapter 25 · plan] Chapter 25: Alex is offered a place.',
    ]));
    expect(all.some((line) => line.startsWith('[Timeline] “The Induction”') && line.includes('involving Alex. Alex is sworn in.'))).toBe(true);
    expect(all.some((line) => line.startsWith('[Alex · The System] Alex in The System: Level 12 of 100; Classes: Mage;'))).toBe(true);
  });

  it('leaves out what was not attached, private notes, discarded ideas, finished threads and the manuscript itself', async () => {
    const { a, alex, guild, chapter } = await world();
    const { facts, request } = await a.prepare('plot', 'What next?', { entryIds: [alex.id, guild.id], threadIds: [], nodeIds: [chapter.id] });
    const sent = JSON.stringify([facts, request]);
    for (const secret of ['Unrelated Stranger', 'Should never be sent', 'PRIVATE', 'kill him off', 'robot', 'Old Debt', 'SECRET MANUSCRIPT TEXT']) expect(sent, secret).not.toContain(secret);
    expect((await a.prepare('plot', '', { entryIds: [], threadIds: [], nodeIds: [] })).facts).toEqual([]);
  });

  it('includes a thread the author attaches by hand, and caps how much is sent', async () => {
    const { a, c, closed } = await world();
    expect((await a.prepare('plot', '', { entryIds: [], threadIds: [closed.id], nodeIds: [] })).facts.map((f) => f.text)).toEqual(['“Old Debt” (Subplot, Resolved). Involves Alex. No developments recorded yet.']);
    const many: string[] = [];
    for (let i = 0; i < 40; i++) {
      const entry = await c.create('lore', `Lore ${i}`);
      await c.update(entry.id, { summary: 'x'.repeat(2000), tags: ['a'], fields: [{ id: 'f', key: 'K', value: 'v' }] });
      many.push(entry.id);
    }
    const { facts } = await a.prepare('worldbuilding', '', { entryIds: many, threadIds: [], nodeIds: [] });
    expect(facts.length).toBe(90);
    expect(Math.max(...facts.map((f) => f.text.length))).toBeLessThanOrEqual(600);
  });

  it('writes a request for each mode that carries the facts, the question and the rules', async () => {
    const { a, alex } = await world();
    const { facts } = await a.prepare('plot', '', { entryIds: [alex.id], threadIds: [], nodeIds: [] });
    const briefs = new Set<string>();
    for (const mode of MODES) {
      const { system, user } = buildRequest(mode, 'How does he get past the barrier?', facts);
      briefs.add(system.split('\n')[1]);
      expect(system).toContain('Never restate, reword or add to a fact');
      expect(system).toContain('"assumption"');
      expect(user).toContain(`FACTS (${facts.length}):`);
      expect(user).toContain(`F1 [Alex · Character] Alex is a character.`);
      expect(user).toContain('THE AUTHOR ASKS:\nHow does he get past the barrier?');
    }
    expect(briefs.size).toBe(6);
    expect(buildRequest('what-if', '', []).user).toContain('(none attached)');
    expect(manualPrompt(buildRequest('plot', 'Q', facts))).toContain('Reply with JSON only');
  });

  it('notices which codex entries a question names', async () => {
    const { c } = await world();
    const entries = await c.list();
    expect(mentionedIn('What if Alex and marcus fought the hero association? Alexander stays out.', entries).map((e) => e.name).sort()).toEqual(['Alex', 'Hero Association', 'Marcus']);
    expect(mentionedIn('nothing here', entries)).toEqual([]);
  });
});

describe('classifying the answer', () => {
  const facts: Fact[] = [{ id: 'F1', label: 'Alex · Character', text: 'Alex possesses Solar Absorption.', source: { type: 'entry', id: 'e1' } }, { id: 'F2', label: 'Canon', text: 'Solar Absorption: Needs direct sunlight', source: { type: 'canon', id: 'c1' } }];

  it('shows established items in the project\'s own words, never the assistant\'s', () => {
    const items = interpret({ items: [{ type: 'established', fact: 'f1', text: 'Alex is the strongest hero alive and everyone knows it.' }, { type: 'established', fact: 'F2' }, { type: 'established', fact: 'F1' }] }, facts);
    expect(items.map((i) => [i.kind, i.text, i.factIds])).toEqual([['established', 'Alex possesses Solar Absorption.', ['F1']], ['established', 'Solar Absorption: Needs direct sunlight', ['F2']]]);
  });

  it('moves anything presented as established that the project does not say into assumptions', () => {
    const items = interpret(answer(facts), facts);
    expect(items.map((i) => i.kind)).toEqual(['established', 'assumption', 'assumption', 'suggestion', 'suggestion', 'suggestion']);
    expect(items[1]).toMatchObject({ text: 'Alex is secretly a prince.', note: 'The assistant presented this as established, but it is not in your project.' });
    expect(items[2]).toMatchObject({ text: 'The barrier is vulnerable to energy overloads.', note: '' });
    // A suggestion keeps only the references that are real.
    expect(items[3]).toMatchObject({ title: 'Overload the barrier', factIds: ['F1'], fits: 'thread', status: 'open', added: null });
    expect([items[4].fits, items[5].fits, items[5].title]).toEqual(['character', 'world', '']);
    expect(items.filter((i) => i.kind === 'established').every((i) => facts.some((f) => f.text === i.text))).toBe(true);
  });

  it('reads an answer that arrives as text, in a code block or with chatter around it', () => {
    const json = JSON.stringify({ items: [{ type: 'suggestion', text: 'An idea.' }] });
    for (const raw of [json, `Here you go:\n\`\`\`json\n${json}\n\`\`\`\nHope that helps!`, `Sure! ${json} Let me know.`]) expect(interpret(raw, facts).map((i) => i.text)).toEqual(['An idea.']);
    for (const junk of ['', 'no json here', '{broken', null, 42, { items: 'nope' }, { items: [null, 7, { type: 'suggestion' }] }]) expect(interpret(junk, facts)).toEqual([]);
    expect(extractAnswer({ items: [] })).toEqual({ items: [] });
  });
});

describe('asking Claude', () => {
  const request = { system: 'S', user: 'U' };
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('sends the request with the author\'s key to Anthropic only, asking for the structured shape', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'brainstorm', input: { items: [{ type: 'suggestion', text: 'x' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await askClaude(request, { apiKey: 'sk-test', model: 'claude-opus-5-5' }, fetcher);
    expect(result).toEqual({ items: [{ type: 'suggestion', text: 'x' }] });
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen!.init.headers).toMatchObject({ 'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    const body = JSON.parse(seen!.init.body as string);
    expect(body).toMatchObject({ model: 'claude-opus-5-5', system: 'S', messages: [{ role: 'user', content: 'U' }], tool_choice: { type: 'tool', name: 'brainstorm' } });
    expect(body.tools[0].input_schema.properties.items.items.properties.type.enum).toEqual(['established', 'suggestion', 'assumption']);
  });

  it('falls back to text when no structured answer comes, and explains failures in plain words', async () => {
    expect(await askClaude(request, { apiKey: 'k', model: 'm' }, reply(200, { content: [{ type: 'text', text: '{"items":[]}' }] }))).toBe('{"items":[]}');
    await expect(askClaude(request, { apiKey: '', model: 'm' }, reply(200, {}))).rejects.toThrow('Add your Anthropic API key first.');
    await expect(askClaude(request, { apiKey: 'k', model: 'm' }, reply(401, { error: { message: 'invalid x-api-key' } }))).rejects.toThrow('was not accepted');
    await expect(askClaude(request, { apiKey: 'k', model: 'm' }, reply(429, {}))).rejects.toThrow('too often');
    await expect(askClaude(request, { apiKey: 'k', model: 'm' }, reply(529, {}))).rejects.toThrow('trouble at its end');
    await expect(askClaude(request, { apiKey: 'k', model: 'm' }, reply(400, { error: { message: 'max_tokens too large' } }))).rejects.toThrow('refused the request: max_tokens too large');
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(askClaude(request, { apiKey: 'k', model: 'm' }, offline)).rejects.toBeInstanceOf(AssistantError);
    await expect(askClaude(request, { apiKey: 'k', model: 'm' }, offline)).rejects.toThrow('needs an internet connection');
  });

  it('keeps settings safe: copy-and-paste by default, known models only', () => {
    expect(parseSettings(null)).toEqual({ provider: 'manual', apiKey: '', model: 'claude-opus-5-5' });
    expect(parseSettings(JSON.stringify({ provider: 'claude', apiKey: '  sk-1  ', model: 'claude-haiku-5-5' }))).toEqual({ provider: 'claude', apiKey: 'sk-1', model: 'claude-haiku-5-5' });
    expect(parseSettings(JSON.stringify({ provider: 'other', model: 'gpt' }))).toMatchObject({ provider: 'manual', model: 'claude-opus-5-5' });
    expect(parseSettings('{broken')).toMatchObject({ provider: 'manual' });
  });
});

describe('the approval pipeline', () => {
  async function session() {
    const w = await world();
    const attached = { entryIds: [w.alex.id, w.guild.id], threadIds: [], nodeIds: [] };
    const { facts } = await w.a.prepare('problem', 'How does he get past the barrier?', attached);
    const dump = async () => JSON.stringify(await Promise.all(app.db.tables.filter((t) => !['brainstorms', 'projects', 'projectStats'].includes(t.name)).map((t) => t.toArray())));
    const before = await dump();
    const made = await w.a.record({ mode: 'problem', prompt: ' How does he get past the barrier? ', attached, facts, answer: answer(facts), model: 'claude-opus-5-5' });
    const pick = (title: string) => made.items.find((i) => i.text.includes(title) || i.title === title)!;
    return { ...w, made, pick, dump, before, facts };
  }

  it('keeps an answer as a brainstorm and changes nothing else in the project', async () => {
    const { a, made, dump, before } = await session();
    expect(made).toMatchObject({ mode: 'problem', prompt: 'How does he get past the barrier?', model: 'claude-opus-5-5' });
    expect(made.items.map((i) => i.status)).toEqual(Array(6).fill('open'));
    expect(await dump()).toBe(before);
    expect((await a.list()).length).toBe(1);
    await expect(a.record({ mode: 'plot', prompt: '', attached: { entryIds: [], threadIds: [], nodeIds: [] }, facts: [], answer: 'no json', model: 'm' })).rejects.toThrow('could not be read');
  });

  it('adds a suggestion to ideas, a thread, the worldbuilding or a character only when told to, as a draft note', async () => {
    const { p, a, c, alex, guild, thread, pick } = await session();
    const { plot } = app;
    const sid = (await a.list())[0].id;

    expect(await a.route(sid, pick('Overload the barrier').id, { kind: 'thread', threadId: thread.id })).toEqual({ label: 'the plot thread “Demon Investigation”', to: `/project/${p.id}/plot?thread=${thread.id}` });
    const updated = (await plot.forProject(p.id).get(thread.id))!;
    expect(updated.notes).toBe('Idea: Overload the barrier. Alex overloads his ability to break the barrier.');
    // The thread's own content is not rewritten: only its notes gain a line.
    expect([updated.premise, updated.status, updated.beats.length]).toEqual(['Who is opening the gates?', 'active', 1]);

    await a.route(sid, pick('A debt to Marcus').id, { kind: 'character', entryId: alex.id });
    const bio = (await c.get(alex.id))!;
    // For a character it becomes one of their notes; the record itself is left exactly as it was.
    expect(bio.notes).toBe('PRIVATE: maybe kill him off');
    expect((await app.db.characterNotes.where('entryId').equals(alex.id).toArray()).map((n) => [n.title, n.content, n.tags])).toEqual([['A debt to Marcus', 'Marcus covers for him and expects it repaid.', ['brainstorm']]]);
    expect([bio.summary, bio.description]).toEqual(['A reluctant recruit.', 'Possesses Solar Absorption.']);

    await a.route(sid, pick('second ledger').id, { kind: 'world', entryId: guild.id });
    expect((await c.get(guild.id))!.notes).toBe('Idea: The Association keeps a second ledger.');

    const stored = (await a.list())[0];
    expect(stored.items.filter((i) => i.kind === 'suggestion').map((i) => [i.status, i.added?.label])).toEqual([['added', 'the plot thread “Demon Investigation”'], ['added', 'Alex’s notes'], ['added', 'Hero Association’s notes']]);
    await expect(a.route(sid, pick('second ledger').id, { kind: 'ideas' })).rejects.toThrow('already been dealt with');
  });

  it('can start a new thread or entry for a suggestion, or keep it as an idea', async () => {
    const { p, a, c, pick } = await session();
    const sid = (await a.list())[0].id;
    await a.route(sid, pick('Overload the barrier').id, { kind: 'thread', newTitle: 'The Barrier' });
    const made = (await app.plot.forProject(p.id).list()).find((t) => t.title === 'The Barrier')!;
    expect([made.status, made.notes]).toEqual(['planned', 'Idea: Overload the barrier. Alex overloads his ability to break the barrier.']);
    await a.route(sid, pick('second ledger').id, { kind: 'world', newName: 'The Second Ledger', category: 'item' });
    expect((await c.list()).find((e) => e.name === 'The Second Ledger')).toMatchObject({ category: 'item', notes: 'Idea: The Association keeps a second ledger.', description: '' });
    await a.route(sid, pick('A debt to Marcus').id, { kind: 'ideas' });
    expect((await a.ideas()).map((i) => [i.text, i.brainstormId])).toEqual([['A debt to Marcus. Marcus covers for him and expects it repaid.', sid]]);
  });

  it('only routes suggestions, to the right kind of place, and lets one be discarded and brought back', async () => {
    const { a, alex, guild, made, pick } = await session();
    const sid = made.id;
    const established = made.items.find((i) => i.kind === 'established')!;
    const assumption = made.items.find((i) => i.kind === 'assumption')!;
    await expect(a.route(sid, established.id, { kind: 'ideas' })).rejects.toThrow('Only a suggestion');
    await expect(a.route(sid, assumption.id, { kind: 'ideas' })).rejects.toThrow('Only a suggestion');
    await expect(a.route(sid, pick('second ledger').id, { kind: 'character', entryId: guild.id })).rejects.toThrow('Choose a character');
    await expect(a.route(sid, pick('second ledger').id, { kind: 'world', entryId: alex.id })).rejects.toThrow('not a character');
    await expect(a.route(sid, pick('second ledger').id, { kind: 'thread', threadId: 'nope' })).rejects.toThrow('not in this project');
    // A refused route leaves nothing half done.
    expect((await app.codex.forProject(made.projectId).get(guild.id))!.notes).toBe('');

    await a.discard(sid, pick('second ledger').id);
    expect((await a.list())[0].items.find((i) => i.text.includes('second ledger'))!.status).toBe('discarded');
    await expect(a.route(sid, pick('second ledger').id, { kind: 'ideas' })).rejects.toThrow('already been dealt with');
    await a.restore(sid, pick('second ledger').id);
    await a.route(sid, pick('second ledger').id, { kind: 'ideas' });
    expect((await a.ideas()).length).toBe(1);
  });

  it('keeps ideas the author writes by hand, and everything inside its project through copies', async () => {
    const { p, a, pick, thread } = await session();
    const sid = (await a.list())[0].id;
    const own = await a.addIdea('  A lighthouse that points inland. ');
    await a.updateIdea(own.id, 'A lighthouse that points inland, toward the capital.');
    await a.route(sid, pick('Overload the barrier').id, { kind: 'thread', threadId: thread.id });
    await expect(a.addIdea('  ')).rejects.toThrow('Write the idea');

    const other = app.assistant.forProject((await app.projects.create({ title: 'Other' })).id);
    expect([await other.list(), await other.ideas()]).toEqual([[], []]);
    await expect(other.route(sid, pick('A debt to Marcus').id, { kind: 'ideas' })).rejects.toThrow('not in this project');
    await expect(other.updateIdea(own.id, 'x')).rejects.toThrow('not in this project');
    await expect(other.discard(sid, 'x')).rejects.toThrow('not in this project');

    const copy = await app.projects.duplicate(p.id);
    const [session2] = await app.assistant.forProject(copy.id).list();
    const copiedThread = (await app.plot.forProject(copy.id).list()).find((t) => t.title === 'Demon Investigation')!;
    expect(session2.id).not.toBe(sid);
    expect(session2.items.find((i) => i.status === 'added')!.added!.to).toContain(copiedThread.id);
    expect((await app.assistant.forProject(copy.id).ideas()).map((i) => i.text)).toEqual(['A lighthouse that points inland, toward the capital.']);
    await a.removeIdea(own.id);
    await a.remove(sid);
    expect([await a.list(), await a.ideas()]).toEqual([[], []]);
  });
});
