export const ACTIONS = ['search', 'toggle-left', 'toggle-right', 'mode-drafting', 'mode-planning', 'mode-worldbuilding', 'mode-editing', 'next-mode', 'focus', 'snapshot'] as const;
export type ActionId = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<ActionId, string> = {
  search: 'Search the project',
  'toggle-left': 'Show or hide the left panel',
  'toggle-right': 'Show or hide the right panel',
  'mode-drafting': 'Switch to Drafting',
  'mode-planning': 'Switch to Planning & outlining',
  'mode-worldbuilding': 'Switch to Worldbuilding',
  'mode-editing': 'Switch to Editing & continuity',
  'next-mode': 'Switch to the next workspace',
  focus: 'Distraction-free writing on or off',
  snapshot: 'Log a character snapshot',
};

/** `Mod` is ⌘ on a Mac and Ctrl elsewhere. */
export const DEFAULT_SHORTCUTS: Record<ActionId, string> = {
  search: 'Mod+K',
  'toggle-left': 'Mod+Alt+[',
  'toggle-right': 'Mod+Alt+]',
  'mode-drafting': 'Alt+1',
  'mode-planning': 'Alt+2',
  'mode-worldbuilding': 'Alt+3',
  'mode-editing': 'Alt+4',
  'next-mode': 'Alt+`',
  focus: 'Mod+Shift+F',
  snapshot: 'Mod+Alt+S',
};

const CODES: Record<string, string> = { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Space: 'Space', Enter: 'Enter', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };

interface KeyLike {
  code: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The combination a key press stands for, e.g. `Mod+Alt+S`. Read from the
 * physical key, so Alt+1 is `Alt+1` on every keyboard layout rather than
 * whatever symbol Alt turns it into. Null for a modifier pressed on its own.
 */
export function comboOf(event: KeyLike): string | null {
  const { code } = event;
  const key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) ? code : (CODES[code] ?? null);
  if (!key) return null;
  return [event.metaKey || event.ctrlKey ? 'Mod' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
}

/** A shortcut must not be something a writer types: it needs ⌘/Ctrl or Alt, or be a function key. */
export const isUsable = (combo: string): boolean => /^(Mod|Alt)\+/.test(combo) || /^(Shift\+)?F\d{1,2}$/.test(combo);

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** A combination as the author's keyboard shows it. */
export const displayCombo = (combo: string): string => (combo ? combo.split('+').map((part) => (part === 'Mod' ? (mac ? '⌘' : 'Ctrl') : part === 'Alt' ? (mac ? '⌥' : 'Alt') : part === 'Shift' ? (mac ? '⇧' : 'Shift') : part)).join(mac ? '' : '+') : 'Not set');

/** Stored shortcuts made safe: unknown actions dropped, unusable or duplicated combinations cleared, missing ones defaulted. */
export function parseShortcuts(raw: unknown): Record<ActionId, string> {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const taken = new Set<string>();
  const out = {} as Record<ActionId, string>;
  for (const action of ACTIONS) {
    const value = action in given ? given[action] : DEFAULT_SHORTCUTS[action];
    const combo = typeof value === 'string' && value !== '' && isUsable(value) && !taken.has(value) ? value : '';
    if (combo) taken.add(combo);
    out[action] = combo;
  }
  return out;
}

/** Gives `action` a new combination; whatever had that combination before loses it. */
export function rebind(shortcuts: Record<ActionId, string>, action: ActionId, combo: string): Record<ActionId, string> {
  const next = { ...shortcuts };
  if (combo) for (const other of ACTIONS) if (next[other] === combo) next[other] = '';
  next[action] = combo;
  return next;
}

export const actionFor = (shortcuts: Record<ActionId, string>, combo: string | null): ActionId | null => (combo ? (ACTIONS.find((action) => shortcuts[action] === combo) ?? null) : null);
