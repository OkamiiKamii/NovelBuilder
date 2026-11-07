import { useSyncExternalStore } from 'react';
import { RESPONSE_SCHEMA, type AssistantRequest } from './prompt';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
] as const;

export interface AssistantSettings {
  /** `claude`: ask Claude directly with the author's own key. `manual`: copy the question to any assistant and paste the answer back. */
  provider: 'claude' | 'manual';
  apiKey: string;
  model: string;
}

const KEY = 'novel-builder:assistant';
const defaults: AssistantSettings = { provider: 'manual', apiKey: '', model: CLAUDE_MODELS[0].id };

export function parseSettings(raw: string | null): AssistantSettings {
  try {
    const stored = raw ? (JSON.parse(raw) as Partial<AssistantSettings>) : {};
    return {
      provider: stored.provider === 'claude' ? 'claude' : 'manual',
      apiKey: typeof stored.apiKey === 'string' ? stored.apiKey.trim() : '',
      model: CLAUDE_MODELS.some((m) => m.id === stored.model) ? stored.model! : defaults.model,
    };
  } catch {
    return defaults;
  }
}

let current: AssistantSettings | null = null;
const listeners = new Set<() => void>();
const snapshot = (): AssistantSettings => {
  if (current) return current;
  try {
    current = parseSettings(localStorage.getItem(KEY));
  } catch {
    current = defaults;
  }
  return current;
};

/** The assistant's settings belong to the author and stay on this device. The key in particular is never stored in a project or a backup. */
export function setAssistantSettings(changes: Partial<AssistantSettings>): void {
  current = parseSettings(JSON.stringify({ ...snapshot(), ...changes }));
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // kept for this visit only
  }
  listeners.forEach((listener) => listener());
}
export const getAssistantSettings = (): AssistantSettings => snapshot();
export const useAssistantSettings = (): AssistantSettings =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, snapshot);

export class AssistantError extends Error {}

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/**
 * Asks Claude, from this browser, with the author's own key. Exactly two
 * things leave the device: the request built by `buildRequest` (which the
 * author can read in full beforehand) and the key, to Anthropic's API and
 * nowhere else. The answer is returned as data; nothing is written anywhere.
 */
export async function askClaude(request: AssistantRequest, settings: Pick<AssistantSettings, 'apiKey' | 'model'>, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<unknown> {
  if (!settings.apiKey) throw new AssistantError('Add your Anthropic API key first.');
  let response: Response;
  try {
    response = await fetcher(ENDPOINT, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 2500,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        // The answer has to arrive in the three-kind shape, so it is asked for as a tool call.
        tools: [{ name: 'brainstorm', description: 'Give the brainstorm as a list of established facts (by id), suggestions and assumptions.', input_schema: RESPONSE_SCHEMA }],
        tool_choice: { type: 'tool', name: 'brainstorm' },
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new AssistantError('Stopped.');
    throw new AssistantError('The assistant could not be reached. Brainstorming needs an internet connection; everything else in the app works without one.');
  }
  if (!response.ok) {
    const detail = await response.json().then((body: { error?: { message?: string } }) => body?.error?.message ?? '', () => '');
    if (response.status === 401 || response.status === 403) throw new AssistantError('That API key was not accepted. Check it in the assistant’s settings.');
    if (response.status === 429) throw new AssistantError('The assistant is being asked too often just now, or the account has reached its limit. Try again in a moment.');
    if (response.status >= 500) throw new AssistantError('The assistant is having trouble at its end. Try again in a moment.');
    throw new AssistantError(`The assistant refused the request${detail ? `: ${detail}` : '.'}`);
  }
  const body = (await response.json()) as { content?: { type: string; input?: unknown; text?: string }[] };
  const call = body.content?.find((block) => block.type === 'tool_use');
  if (call?.input) return call.input;
  // No tool call: fall back to whatever text there is, which the classifier will try to read.
  return body.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') ?? '';
}

/** The whole question as one piece of text, for pasting into any assistant, with the shape the answer must take. */
export function manualPrompt(request: AssistantRequest): string {
  return [
    request.system,
    '',
    request.user,
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"items":[{"type":"established","fact":"F1"},{"type":"assumption","text":"…"},{"type":"suggestion","title":"…","text":"…","based_on":["F1"],"fits":"plot | character | worldbuilding | notes"}]}',
  ].join('\n');
}
