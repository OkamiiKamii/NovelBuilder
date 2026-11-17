// A SMALL FORMULA LANGUAGE for an author's own rules (as in the original app). A port of
// flutter_app/lib/shared/domain/systems/formula.dart (the genre modules' calculator reads it; the Systems phase builds
// on it).
//
//   strength * 1.5            intelligence / 10
//   100 * level ^ 1.5         max(1, floor(agility / 5))
//   Class: Void Mage AND level >= 50
//   NOT (realm < 3) OR Title: Chosen
//
// Names are whatever the author defined; nothing is built in except arithmetic, comparisons, AND / OR / NOT, and a
// few functions. Names are matched without regard to case. `×`, `÷`, `≥`, `≤` and `≠` work too. `Group: Name` asks
// whether a profile holds something. A value is a number, a label (text) or true/false.
//
// Every loop here is counted (the Hermes lesson): the tokenizer moves at least one character a turn, so it stops by
// the end of the text.

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }

  override toString(): string {
    return this.message;
  }
}

export type FNode =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'name'; name: string }
  | { kind: 'holds'; group: string; name: string; source: string }
  /** `op` is `-` or `not`. */
  | { kind: 'unary'; op: string; operand: FNode; source: string }
  | { kind: 'binary'; op: string; left: FNode; right: FNode; source: string }
  | { kind: 'call'; name: string; args: FNode[] };

/** A value a formula works out: a number, a label or true/false. */
export type FValue = number | string | boolean;

type Token = { type: 'number' | 'name' | 'text' | 'op' | 'holds' | 'end'; text: string; start: number; end: number; group?: string };

const operators = ['>=', '<=', '==', '!=', '<>', '&&', '||', '+', '-', '*', '/', '^', '%', '(', ')', ',', '>', '<', '=', '!'];
const symbols: Record<string, string> = { '×': '*', '·': '*', '÷': '/', '≥': '>=', '≤': '<=', '≠': '!=', '−': '-', '–': '-' };
const word = /^[\p{L}_][\p{L}\p{N}_]*/u;
const numberPattern = /^(?:\d+(?:\.\d+)?|\.\d+)/;
const quoted = /^"([^"]*)"|^'([^']*)'|^“([^”]*)”/u;
const bracket = /^\[([^\]]+)\]/;
const holdsPattern = /^([\p{L}_][\p{L}\p{N}_ ]*?)\s*:\s*/u;
const logicalWord = /(?:^|\s)(?:and|or|not)(?:\s|$)/iu;
/** Where the name after `Group:` stops: at a logical word, a comparison or a bracket. */
const holdsEnd = /\s+(?:and|or)\s+|&&|\|\||[()<>=!,]|$/iu;
const space = /^\s/;

function normalise(input: string): string {
  let out = '';
  for (const c of input) out += symbols[c] ?? c;
  return out;
}

function tokenize(input: string): Token[] {
  const source = normalise(input);
  const tokens: Token[] = [];
  let i = 0;
  for (let turns = 0; i < source.length && turns <= source.length; turns++) {
    const rest = source.substring(i);
    if (space.test(rest)) {
      i++;
      continue;
    }
    const n = numberPattern.exec(rest);
    if (n !== null) {
      tokens.push({ type: 'number', text: n[0], start: i, end: i + n[0].length });
      i += n[0].length;
      continue;
    }
    const q = quoted.exec(rest);
    if (q !== null) {
      tokens.push({ type: 'text', text: q[1] ?? q[2] ?? q[3] ?? '', start: i, end: i + q[0].length });
      i += q[0].length;
      continue;
    }
    const b = bracket.exec(rest);
    if (b !== null) {
      tokens.push({ type: 'name', text: b[1].trim(), start: i, end: i + b[0].length });
      i += b[0].length;
      continue;
    }
    // "Class: Void Mage", "Cultivation Realm: Core Formation": everything up to the colon names the group.
    const h = holdsPattern.exec(rest);
    if (h !== null && !logicalWord.test(h[1])) {
      const after = rest.substring(h[0].length);
      const stop = holdsEnd.exec(after)!.index;
      const name = after.substring(0, stop).trim();
      if (name.length === 0) throw new FormulaError(`Say what comes after “${h[1]}:”.`);
      tokens.push({ type: 'holds', text: name, start: i, end: i + h[0].length + stop, group: h[1].trim() });
      i += h[0].length + stop;
      continue;
    }
    const w = word.exec(rest);
    if (w !== null) {
      tokens.push({ type: 'name', text: w[0], start: i, end: i + w[0].length });
      i += w[0].length;
      continue;
    }
    const op = operators.find((o) => rest.startsWith(o));
    if (op !== undefined) {
      tokens.push({ type: 'op', text: op, start: i, end: i + op.length });
      i += op.length;
      continue;
    }
    throw new FormulaError(`“${String.fromCodePoint(rest.codePointAt(0)!)}” is not something a formula can use.`);
  }
  tokens.push({ type: 'end', text: '', start: source.length, end: source.length });
  return tokens;
}

/** Reads a formula. Throws FormulaError with a message meant for the author. */
export function parseFormula(input: string): FNode {
  const source = normalise(input);
  const tokens = tokenize(input);
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (ops: string[]) => peek().type === 'op' && ops.includes(peek().text);
  const isWord = (w: string) => peek().type === 'name' && peek().text.toLowerCase() === w;
  const slice = (from: number) => source.substring(tokens[from].start, tokens[at - 1].end).trim();

  const binary = (next: () => FNode, match: () => string | null): FNode => {
    const from = at;
    let left = next();
    for (let op = match(); op !== null; op = match()) {
      at++;
      const right = next();
      left = { kind: 'binary', op, left, right, source: slice(from) };
    }
    return left;
  };

  const primary = (): FNode => {
    const token = tokens[at++];
    switch (token.type) {
      case 'number':
        return { kind: 'number', value: Number(token.text) };
      case 'text':
        return { kind: 'text', value: token.text };
      case 'holds':
        return { kind: 'holds', group: token.group!, name: token.text, source: source.substring(token.start, token.end).trim() };
      case 'name': {
        if (!isOp(['('])) return { kind: 'name', name: token.text };
        at++;
        const args: FNode[] = [];
        if (!isOp([')'])) {
          do {
            args.push(or());
          } while (isOp([',']) && ++at > 0);
        }
        if (!isOp([')'])) throw new FormulaError(`“${token.text}(” is missing its closing bracket.`);
        at++;
        return { kind: 'call', name: token.text.toLowerCase(), args };
      }
    }
    if (token.type === 'op' && token.text === '(') {
      const inner = or();
      if (!isOp([')'])) throw new FormulaError('A bracket is not closed.');
      at++;
      return inner;
    }
    throw new FormulaError(token.type === 'end' ? 'The formula stops before it is finished.' : `“${token.text}” is not expected here.`);
  };

  const power = (): FNode => {
    const from = at;
    const base = primary();
    if (!isOp(['^'])) return base;
    at++;
    return { kind: 'binary', op: '^', left: base, right: unary(), source: slice(from) };
  };

  const unary = (): FNode => {
    if (isOp(['-'])) {
      const from = at++;
      const operand = unary();
      return { kind: 'unary', op: '-', operand, source: slice(from) };
    }
    if (isOp(['+'])) at++;
    return power();
  };
  const product = () => binary(unary, () => (isOp(['*', '/', '%']) ? peek().text : null));
  const sum = () => binary(product, () => (isOp(['+', '-']) ? peek().text : null));
  const comparison = (): FNode => {
    const from = at;
    const left = sum();
    if (!isOp(['>=', '<=', '>', '<', '=', '==', '!=', '<>'])) return left;
    const op = ({ '==': '=', '<>': '!=' } as Record<string, string>)[peek().text] ?? peek().text;
    at++;
    return { kind: 'binary', op, left, right: sum(), source: slice(from) };
  };
  const not = (): FNode => {
    if (isWord('not') || isOp(['!'])) {
      const from = at++;
      const operand = not();
      return { kind: 'unary', op: 'not', operand, source: slice(from) };
    }
    return comparison();
  };
  const and = () => binary(not, () => (isWord('and') || isOp(['&&']) ? 'and' : null));
  const or = (): FNode => binary(and, () => (isWord('or') || isOp(['||']) ? 'or' : null));

  if (peek().type === 'end') throw new FormulaError('The formula is empty.');
  const tree = or();
  if (peek().type !== 'end') throw new FormulaError(`“${peek().text}” is not expected here.`);
  return tree;
}

/** What a formula can read: the value of a name (null when nothing has that name), and whether the profile holds
 * `name` in `group` (null when there is no such group). */
export type FormulaScope = {
  value: (name: string) => FValue | null;
  holds: (group: string, name: string) => boolean | null;
};

/** JavaScript's `Math.round`: halves go up. */
export const jsRound = (n: number): number => Math.floor(n + 0.5);

/** A value as JavaScript's `String(value)` writes it. */
export const jsString = (value: FValue): string => String(value);

const functions: Record<string, [number, number]> = {
  min: [1, 99],
  max: [1, 99],
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  abs: [1, 1],
  sqrt: [1, 1],
  clamp: [3, 3],
};

function run(name: string, n: number[]): number {
  switch (name) {
    case 'min':
      return n.reduce((a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b)));
    case 'max':
      return n.reduce((a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b)));
    case 'floor':
      return Number.isFinite(n[0]) ? Math.floor(n[0]) : n[0];
    case 'ceil':
      return Number.isFinite(n[0]) ? Math.ceil(n[0]) : n[0];
    case 'round':
      return Number.isFinite(n[0]) ? jsRound(n[0]) : n[0];
    case 'abs':
      return Math.abs(n[0]);
    case 'sqrt':
      return Math.sqrt(n[0]);
    default:
      return Math.min(Math.max(n[0], n[1]), n[2]);
  }
}

export function truthy(value: FValue): boolean {
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return value;
}

function num(value: FValue, what: string): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  throw new FormulaError(`“${what}” is a label, not a number.`);
}

const same = (a: FValue, b: FValue): boolean =>
  typeof a === 'string' || typeof b === 'string'
    ? jsString(a).trim().toLowerCase() === jsString(b).trim().toLowerCase()
    : num(a, '') === num(b, '');

const remainder = (a: number, b: number): number => (Number.isFinite(a) && Number.isFinite(b) ? a % b : Number.isFinite(a) ? a : NaN);

/** Works a formula out. Throws FormulaError for an unknown name, a missing group or impossible arithmetic. */
export function evaluateFormula(node: FNode, scope: FormulaScope): FValue {
  switch (node.kind) {
    case 'number':
    case 'text':
      return node.value;
    case 'name': {
      const lower = node.name.toLowerCase();
      if (lower === 'true' || lower === 'yes') return true;
      if (lower === 'false' || lower === 'no') return false;
      const v = scope.value(node.name);
      if (v === null) throw new FormulaError(`Nothing here is called “${node.name}”.`);
      return v;
    }
    case 'holds': {
      const v = scope.holds(node.group, node.name);
      if (v === null) throw new FormulaError(`There is no “${node.group}” to look in for “${node.name}”.`);
      return v;
    }
    case 'unary':
      return node.op === 'not' ? !truthy(evaluateFormula(node.operand, scope)) : -num(evaluateFormula(node.operand, scope), node.source);
    case 'call': {
      const { name, args } = node;
      if (name === 'if') {
        if (args.length !== 3) throw new FormulaError('if needs three parts: if(condition, then, otherwise).');
        return evaluateFormula(truthy(evaluateFormula(args[0], scope)) ? args[1] : args[2], scope);
      }
      const arity = functions[name];
      if (arity === undefined) {
        throw new FormulaError(`“${name}” is not a function. Available: ${Object.keys(functions).join(', ')}, if.`);
      }
      if (args.length < arity[0] || args.length > arity[1]) {
        throw new FormulaError(
          `${name} needs ${arity[0] === arity[1] ? arity[0] : 'at least one'} value${arity[0] === 1 && arity[1] === 1 ? '' : 's'}.`,
        );
      }
      return run(
        name,
        args.map((a) => num(evaluateFormula(a, scope), name)),
      );
    }
    case 'binary': {
      const { op, left, right, source } = node;
      if (op === 'and') return truthy(evaluateFormula(left, scope)) && truthy(evaluateFormula(right, scope));
      if (op === 'or') return truthy(evaluateFormula(left, scope)) || truthy(evaluateFormula(right, scope));
      const l = evaluateFormula(left, scope);
      const r = evaluateFormula(right, scope);
      if (op === '=') return same(l, r);
      if (op === '!=') return !same(l, r);
      const a = num(l, source);
      const b = num(r, source);
      switch (op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new FormulaError('This divides by zero.');
          return a / b;
        case '%':
          if (b === 0) throw new FormulaError('This divides by zero.');
          return remainder(a, b);
        case '^':
          return Math.pow(a, b);
        case '>':
          return a > b;
        case '<':
          return a < b;
        case '>=':
          return a >= b;
        default:
          return a <= b;
      }
    }
  }
}

/** Every plain name a formula reads, for working out what depends on what. */
export function namesIn(node: FNode): string[] {
  switch (node.kind) {
    case 'name':
      return [node.name];
    case 'unary':
      return namesIn(node.operand);
    case 'binary':
      return [...namesIn(node.left), ...namesIn(node.right)];
    case 'call':
      return node.args.flatMap(namesIn);
    default:
      return [];
  }
}

/** The parts of a condition that are not satisfied, in the author's own words: for `Class: Void Mage AND level >= 50`
 * at level 12 with the class, `["level >= 50"]`. Empty when the whole condition holds. */
export function unmet(node: FNode, scope: FormulaScope): string[] {
  if (node.kind === 'binary' && node.op === 'and') return [...unmet(node.left, scope), ...unmet(node.right, scope)];
  if (truthy(evaluateFormula(node, scope))) return [];
  switch (node.kind) {
    case 'holds':
    case 'unary':
    case 'binary':
      return [node.source];
    case 'name':
      return [node.name];
    default:
      return ['the condition'];
  }
}

/** A number as an author would write it: whole when it is whole, otherwise to two places. */
export const formatNumber = (value: number): string => (Number.isFinite(value) ? jsString(jsRound(value * 100) / 100) : '∞');
