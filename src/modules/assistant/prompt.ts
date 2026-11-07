import { createId } from '@/core/id';
import { MODE_BRIEFS, MODE_LABELS, type BrainstormItem, type BrainstormMode, type Fact, type RouteKind } from './types';

export interface AssistantRequest {
  system: string;
  user: string;
}

/** The shape the assistant must answer in. It can name a fact; it cannot write one. */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'The response, in reading order.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['established', 'suggestion', 'assumption'] },
          fact: { type: 'string', description: 'For "established" only: the id of the fact from FACTS, e.g. "F3".' },
          title: { type: 'string', description: 'For "suggestion": three to six words naming the idea.' },
          text: { type: 'string', description: 'For "suggestion" and "assumption": the idea or the premise, in one to three sentences.' },
          based_on: { type: 'array', items: { type: 'string' }, description: 'For "suggestion": ids of the facts it builds on.' },
          fits: { type: 'string', enum: ['plot', 'character', 'worldbuilding', 'notes'], description: 'For "suggestion": where it most naturally belongs.' },
        },
        required: ['type'],
      },
    },
  },
  required: ['items'],
} as const;

/**
 * Builds what is sent. The rules given to the assistant mirror what the app
 * enforces afterwards: an "established" item is only ever a pointer at a
 * numbered fact, so nothing the model writes can be shown as canon.
 */
export function buildRequest(mode: BrainstormMode, prompt: string, facts: Fact[]): AssistantRequest {
  const system = [
    'You are a brainstorming partner for a novelist. You propose ideas; the author decides. You never write manuscript prose and you never state what is true in their story on your own authority.',
    `Mode: ${MODE_LABELS[mode]}. ${MODE_BRIEFS[mode]}`,
    'You are given FACTS from the author\'s own project, each with an id. Answer with a list of items of three kinds:',
    '- "established": point at one fact by its id that your ideas rely on. Give only the id. Never restate, reword or add to a fact, and never mark anything as established that is not in FACTS.',
    '- "suggestion": a new idea of yours. Say which facts it builds on.',
    '- "assumption": anything you are taking for granted that FACTS does not say. If an idea depends on something unstated about the world, the characters or the rules, state it as an assumption instead of treating it as known.',
    'Give four to seven suggestions, each distinct. Put each established fact and assumption just before the first suggestion that depends on it. Do not contradict FACTS. If FACTS is empty, say what you are assuming.',
  ].join('\n');
  const user = [
    `FACTS (${facts.length}):`,
    facts.length ? facts.map((f) => `${f.id} [${f.label}] ${f.text}`).join('\n') : '(none attached)',
    '',
    'THE AUTHOR ASKS:',
    prompt.trim() || `Suggest ideas in ${MODE_LABELS[mode]} mode for what is attached.`,
  ].join('\n');
  return { system, user };
}

const FITS: Record<string, RouteKind> = { plot: 'thread', character: 'character', worldbuilding: 'world', notes: 'ideas' };
const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** Finds the answer in whatever came back: the structured object, or JSON inside text (a pasted reply, a code block). */
export function extractAnswer(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1] ?? raw;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * STRICT EPISTEMIC CLASSIFICATION
 * Turns the assistant's answer into items the app can stand behind:
 *  - an "established" item is replaced by the project's own fact, word for
 *    word. If it names no real fact, it is not established: it is shown as
 *    an assumption, and says why.
 *  - a suggestion keeps only references to facts that exist.
 * Whatever the model does, nothing it wrote can appear under Established.
 */
export function interpret(raw: unknown, facts: Fact[]): BrainstormItem[] {
  const answer = extractAnswer(raw) as { items?: unknown } | null;
  const list = Array.isArray(answer?.items) ? (answer!.items as Record<string, unknown>[]) : [];
  const byId = new Map(facts.map((f) => [f.id.toUpperCase(), f]));
  const lookup = (id: unknown) => byId.get(text(id).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const items: BrainstormItem[] = [];
  const shown = new Set<string>();
  const base = { title: '', factIds: [] as string[], note: '', fits: null, status: 'open' as const, added: null };

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'established') {
      const fact = lookup(entry.fact);
      if (fact) {
        if (shown.has(fact.id)) continue;
        shown.add(fact.id);
        items.push({ ...base, id: createId(), kind: 'established', title: fact.label, text: fact.text, factIds: [fact.id] });
      } else if (text(entry.text)) {
        items.push({ ...base, id: createId(), kind: 'assumption', text: text(entry.text), note: 'The assistant presented this as established, but it is not in your project.' });
      }
    } else if (entry.type === 'suggestion' && text(entry.text)) {
      const basedOn = (Array.isArray(entry.based_on) ? entry.based_on : []).flatMap((id) => lookup(id)?.id ?? []);
      items.push({ ...base, id: createId(), kind: 'suggestion', title: text(entry.title), text: text(entry.text), factIds: [...new Set(basedOn)], fits: FITS[text(entry.fits)] ?? null });
    } else if (entry.type === 'assumption' && text(entry.text)) {
      items.push({ ...base, id: createId(), kind: 'assumption', text: text(entry.text) });
    }
  }
  return items;
}
