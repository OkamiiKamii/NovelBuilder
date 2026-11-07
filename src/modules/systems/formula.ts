/**
 * A small formula language for an author's own rules.
 *
 *   strength * 1.5            intelligence / 10
 *   100 * level ^ 1.5         max(1, floor(agility / 5))
 *   Class: Void Mage AND level >= 50
 *   NOT (realm < 3) OR Title: Chosen
 *
 * Names are whatever the author defined; nothing is built in except
 * arithmetic, comparisons, AND / OR / NOT, and a few functions. Names are
 * matched without regard to case. `×`, `÷`, `≥`, `≤` and `≠` work too.
 * `Group: Name` asks whether a profile holds something.
 */

export type Value = number | string | boolean;

export type Node =
  | { type: 'number'; value: number }
  | { type: 'text'; value: string }
  | { type: 'name'; name: string }
  | { type: 'holds'; group: string; name: string; source: string }
  | { type: 'unary'; op: '-' | 'not'; operand: Node; source: string }
  | { type: 'binary'; op: string; left: Node; right: Node; source: string }
  | { type: 'call'; name: string; args: Node[] };

export class FormulaError extends Error {}

interface Token {
  type: 'number' | 'name' | 'text' | 'op' | 'holds' | 'end';
  text: string;
  start: number;
  end: number;
  group?: string;
}

const OPERATORS = ['>=', '<=', '==', '!=', '<>', '&&', '||', '+', '-', '*', '/', '^', '%', '(', ')', ',', '>', '<', '=', '!'];
const SYMBOLS: Record<string, string> = { '×': '*', '·': '*', '÷': '/', '≥': '>=', '≤': '<=', '≠': '!=', '−': '-', '–': '-' };
const WORD = /^[\p{L}_][\p{L}\p{N}_]*/u;
/** Where the name after `Group:` stops: at a logical word, a comparison or a bracket. */
const HOLDS_END = /\s+(?:and|or)\s+|&&|\|\||[()<>=!,]|$/iu;

function tokenize(input: string): Token[] {
  const source = [...input].map((c) => SYMBOLS[c] ?? c).join('');
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (/^\s/.test(rest)) { i++; continue; }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(rest);
    if (number) { tokens.push({ type: 'number', text: number[0], start: i, end: i + number[0].length }); i += number[0].length; continue; }
    const quoted = /^"([^"]*)"|^'([^']*)'|^“([^”]*)”/u.exec(rest);
    if (quoted) { tokens.push({ type: 'text', text: quoted[1] ?? quoted[2] ?? quoted[3] ?? '', start: i, end: i + quoted[0].length }); i += quoted[0].length; continue; }
    const bracket = /^\[([^\]]+)\]/.exec(rest);
    if (bracket) { tokens.push({ type: 'name', text: bracket[1].trim(), start: i, end: i + bracket[0].length }); i += bracket[0].length; continue; }
    // "Class: Void Mage", "Cultivation Realm: Core Formation": everything up to the colon names the group.
    const holds = /^([\p{L}_][\p{L}\p{N}_ ]*?)\s*:\s*/u.exec(rest);
    if (holds && !/(?:^|\s)(?:and|or|not)(?:\s|$)/iu.test(holds[1])) {
      const after = rest.slice(holds[0].length);
      const stop = HOLDS_END.exec(after)!.index;
      const name = after.slice(0, stop).trim();
      if (!name) throw new FormulaError(`Say what comes after “${holds[1]}:”.`);
      tokens.push({ type: 'holds', group: holds[1].trim(), text: name, start: i, end: i + holds[0].length + stop });
      i += holds[0].length + stop;
      continue;
    }
    const word = WORD.exec(rest);
    if (word) { tokens.push({ type: 'name', text: word[0], start: i, end: i + word[0].length }); i += word[0].length; continue; }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) { tokens.push({ type: 'op', text: op, start: i, end: i + op.length }); i += op.length; continue; }
    throw new FormulaError(`“${rest[0]}” is not something a formula can use.`);
  }
  tokens.push({ type: 'end', text: '', start: source.length, end: source.length });
  return tokens;
}

/** Reads a formula. Throws `FormulaError` with a message meant for the author. */
export function parse(input: string): Node {
  const source = [...input].map((c) => SYMBOLS[c] ?? c).join('');
  const tokens = tokenize(input);
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (...ops: string[]) => peek().type === 'op' && ops.includes(peek().text);
  const isWord = (word: string) => peek().type === 'name' && peek().text.toLowerCase() === word;
  const slice = (from: number) => source.slice(tokens[from].start, tokens[at - 1].end).trim();

  const binary = (next: () => Node, match: () => string | null): Node => {
    const from = at;
    let left = next();
    for (let op = match(); op; op = match()) {
      at++;
      const right = next();
      left = { type: 'binary', op, left, right, source: slice(from) };
    }
    return left;
  };
  const or = (): Node => binary(and, () => (isWord('or') || isOp('||') ? 'or' : null));
  const and = (): Node => binary(not, () => (isWord('and') || isOp('&&') ? 'and' : null));
  const not = (): Node => {
    if (isWord('not') || isOp('!')) {
      const from = at++;
      const operand = not();
      return { type: 'unary', op: 'not', operand, source: slice(from) };
    }
    return comparison();
  };
  const comparison = (): Node => {
    const from = at;
    const left = sum();
    if (!isOp('>=', '<=', '>', '<', '=', '==', '!=', '<>')) return left;
    const op = { '==': '=', '<>': '!=' }[peek().text] ?? peek().text;
    at++;
    return { type: 'binary', op, left, right: sum(), source: slice(from) };
  };
  const sum = (): Node => binary(product, () => (isOp('+', '-') ? peek().text : null));
  const product = (): Node => binary(unary, () => (isOp('*', '/', '%') ? peek().text : null));
  const unary = (): Node => {
    if (isOp('-')) {
      const from = at++;
      const operand = unary();
      return { type: 'unary', op: '-', operand, source: slice(from) };
    }
    if (isOp('+')) at++;
    return power();
  };
  const power = (): Node => {
    const from = at;
    const base = primary();
    if (!isOp('^')) return base;
    at++;
    return { type: 'binary', op: '^', left: base, right: unary(), source: slice(from) };
  };
  const primary = (): Node => {
    const token = tokens[at++];
    if (token.type === 'number') return { type: 'number', value: Number(token.text) };
    if (token.type === 'text') return { type: 'text', value: token.text };
    if (token.type === 'holds') return { type: 'holds', group: token.group!, name: token.text, source: source.slice(token.start, token.end).trim() };
    if (token.type === 'name') {
      if (!isOp('(')) return { type: 'name', name: token.text };
      at++;
      const args: Node[] = [];
      if (!isOp(')')) {
        do args.push(or());
        while (isOp(',') && ++at);
      }
      if (!isOp(')')) throw new FormulaError(`“${token.text}(” is missing its closing bracket.`);
      at++;
      return { type: 'call', name: token.text.toLowerCase(), args };
    }
    if (token.type === 'op' && token.text === '(') {
      const inner = or();
      if (!isOp(')')) throw new FormulaError('A bracket is not closed.');
      at++;
      return inner;
    }
    throw new FormulaError(token.type === 'end' ? 'The formula stops before it is finished.' : `“${token.text}” is not expected here.`);
  };

  if (peek().type === 'end') throw new FormulaError('The formula is empty.');
  const tree = or();
  if (peek().type !== 'end') throw new FormulaError(`“${peek().text}” is not expected here.`);
  return tree;
}

export interface Scope {
  /** The value of a name, or undefined when nothing has that name. */
  value: (name: string) => Value | undefined;
  /** Whether the profile holds `name` in `group`. Undefined when there is no such group. */
  holds: (group: string, name: string) => boolean | undefined;
}

const FUNCTIONS: Record<string, { args: [number, number]; run: (...n: number[]) => number }> = {
  min: { args: [1, 99], run: Math.min }, max: { args: [1, 99], run: Math.max }, floor: { args: [1, 1], run: Math.floor }, ceil: { args: [1, 1], run: Math.ceil },
  round: { args: [1, 1], run: Math.round }, abs: { args: [1, 1], run: Math.abs }, sqrt: { args: [1, 1], run: Math.sqrt }, clamp: { args: [3, 3], run: (v, lo, hi) => Math.min(Math.max(v, lo), hi) },
};

const truthy = (value: Value): boolean => (typeof value === 'number' ? value !== 0 : typeof value === 'string' ? value !== '' : value);
const num = (value: Value, what: string): number => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  throw new FormulaError(`“${what}” is a label, not a number.`);
};
const same = (a: Value, b: Value): boolean => (typeof a === 'string' || typeof b === 'string' ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : num(a, '') === num(b, ''));

/** Works a formula out. Throws `FormulaError` for an unknown name, a missing group or impossible arithmetic. */
export function evaluate(node: Node, scope: Scope): Value {
  switch (node.type) {
    case 'number':
    case 'text':
      return node.value;
    case 'name': {
      const lower = node.name.toLowerCase();
      if (lower === 'true' || lower === 'yes') return true;
      if (lower === 'false' || lower === 'no') return false;
      const value = scope.value(node.name);
      if (value === undefined) throw new FormulaError(`Nothing here is called “${node.name}”.`);
      return value;
    }
    case 'holds': {
      const held = scope.holds(node.group, node.name);
      if (held === undefined) throw new FormulaError(`There is no “${node.group}” to look in for “${node.name}”.`);
      return held;
    }
    case 'unary':
      return node.op === 'not' ? !truthy(evaluate(node.operand, scope)) : -num(evaluate(node.operand, scope), node.source);
    case 'call': {
      if (node.name === 'if') {
        if (node.args.length !== 3) throw new FormulaError('if needs three parts: if(condition, then, otherwise).');
        return evaluate(truthy(evaluate(node.args[0], scope)) ? node.args[1] : node.args[2], scope);
      }
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new FormulaError(`“${node.name}” is not a function. Available: ${Object.keys(FUNCTIONS).join(', ')}, if.`);
      if (node.args.length < fn.args[0] || node.args.length > fn.args[1]) throw new FormulaError(`${node.name} needs ${fn.args[0] === fn.args[1] ? fn.args[0] : 'at least one'} value${fn.args[0] === 1 && fn.args[1] === 1 ? '' : 's'}.`);
      return fn.run(...node.args.map((arg) => num(evaluate(arg, scope), node.name)));
    }
    case 'binary': {
      if (node.op === 'and') return truthy(evaluate(node.left, scope)) && truthy(evaluate(node.right, scope));
      if (node.op === 'or') return truthy(evaluate(node.left, scope)) || truthy(evaluate(node.right, scope));
      const [left, right] = [evaluate(node.left, scope), evaluate(node.right, scope)];
      if (node.op === '=') return same(left, right);
      if (node.op === '!=') return !same(left, right);
      const [a, b] = [num(left, node.source), num(right, node.source)];
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw new FormulaError('This divides by zero.');
          return a / b;
        case '%':
          if (b === 0) throw new FormulaError('This divides by zero.');
          return a % b;
        case '^': return a ** b;
        case '>': return a > b;
        case '<': return a < b;
        case '>=': return a >= b;
        default: return a <= b;
      }
    }
  }
}

/** Every plain name a formula reads, for working out what depends on what. */
export function namesIn(node: Node): string[] {
  if (node.type === 'name') return [node.name];
  if (node.type === 'unary') return namesIn(node.operand);
  if (node.type === 'binary') return [...namesIn(node.left), ...namesIn(node.right)];
  if (node.type === 'call') return node.args.flatMap(namesIn);
  return [];
}

/**
 * The parts of a condition that are not satisfied, in the author's own
 * words: for `Class: Void Mage AND level >= 50` at level 12 with the class,
 * `["level >= 50"]`. Empty when the whole condition holds.
 */
export function unmet(node: Node, scope: Scope): string[] {
  if (node.type === 'binary' && node.op === 'and') return [...unmet(node.left, scope), ...unmet(node.right, scope)];
  if (truthy(evaluate(node, scope))) return [];
  return ['source' in node ? node.source : node.type === 'name' ? node.name : 'the condition'];
}

/** A number as an author would write it: whole when it is whole, otherwise to two places. */
export const formatNumber = (value: number): string => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '∞');
