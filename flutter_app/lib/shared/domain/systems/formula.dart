import 'dart:math' as math;

/// A SMALL FORMULA LANGUAGE for an author's own rules (as in the original app).
///
///   strength * 1.5            intelligence / 10
///   100 * level ^ 1.5         max(1, floor(agility / 5))
///   Class: Void Mage AND level >= 50
///   NOT (realm < 3) OR Title: Chosen
///
/// Names are whatever the author defined; nothing is built in except arithmetic, comparisons, AND / OR / NOT, and a
/// few functions. Names are matched without regard to case. `×`, `÷`, `≥`, `≤` and `≠` work too. `Group: Name` asks
/// whether a profile holds something. A value is a number, a label (text) or true/false.

class FormulaError implements Exception {
  FormulaError(this.message);
  final String message;

  @override
  String toString() => message;
}

sealed class FNode {
  const FNode();
}

final class NumberNode extends FNode {
  const NumberNode(this.value);
  final double value;
}

final class TextNode extends FNode {
  const TextNode(this.value);
  final String value;
}

final class NameNode extends FNode {
  const NameNode(this.name);
  final String name;
}

final class HoldsNode extends FNode {
  const HoldsNode(this.group, this.name, this.source);
  final String group;
  final String name;
  final String source;
}

final class UnaryNode extends FNode {
  const UnaryNode(this.op, this.operand, this.source);

  /// `-` or `not`.
  final String op;
  final FNode operand;
  final String source;
}

final class BinaryNode extends FNode {
  const BinaryNode(this.op, this.left, this.right, this.source);
  final String op;
  final FNode left;
  final FNode right;
  final String source;
}

final class CallNode extends FNode {
  const CallNode(this.name, this.args);
  final String name;
  final List<FNode> args;
}

class _Token {
  _Token(this.type, this.text, this.start, this.end, [this.group]);

  /// `number`, `name`, `text`, `op`, `holds` or `end`.
  final String type;
  final String text;
  final int start;
  final int end;
  final String? group;
}

const _operators = [
  '>=',
  '<=',
  '==',
  '!=',
  '<>',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '^',
  '%',
  '(',
  ')',
  ',',
  '>',
  '<',
  '=',
  '!',
];
const _symbols = {'×': '*', '·': '*', '÷': '/', '≥': '>=', '≤': '<=', '≠': '!=', '−': '-', '–': '-'};
final _word = RegExp(r'^[\p{L}_][\p{L}\p{N}_]*', unicode: true);
final _number = RegExp(r'^(?:\d+(?:\.\d+)?|\.\d+)');
final _quoted = RegExp(r'''^"([^"]*)"|^'([^']*)'|^“([^”]*)”''', unicode: true);
final _bracket = RegExp(r'^\[([^\]]+)\]');
final _holds = RegExp(r'^([\p{L}_][\p{L}\p{N}_ ]*?)\s*:\s*', unicode: true);
final _logicalWord = RegExp(r'(?:^|\s)(?:and|or|not)(?:\s|$)', caseSensitive: false, unicode: true);

/// Where the name after `Group:` stops: at a logical word, a comparison or a bracket.
final _holdsEnd = RegExp(r'\s+(?:and|or)\s+|&&|\|\||[()<>=!,]|$', caseSensitive: false, unicode: true);
final _space = RegExp(r'^\s');

String _normalise(String input) => input.runes.map((r) {
  final c = String.fromCharCode(r);
  return _symbols[c] ?? c;
}).join();

List<_Token> _tokenize(String input) {
  final source = _normalise(input);
  final tokens = <_Token>[];
  var i = 0;
  while (i < source.length) {
    final rest = source.substring(i);
    if (_space.hasMatch(rest)) {
      i++;
      continue;
    }
    final number = _number.firstMatch(rest);
    if (number != null) {
      tokens.add(_Token('number', number[0]!, i, i + number[0]!.length));
      i += number[0]!.length;
      continue;
    }
    final quoted = _quoted.firstMatch(rest);
    if (quoted != null) {
      tokens.add(_Token('text', quoted[1] ?? quoted[2] ?? quoted[3] ?? '', i, i + quoted[0]!.length));
      i += quoted[0]!.length;
      continue;
    }
    final bracket = _bracket.firstMatch(rest);
    if (bracket != null) {
      tokens.add(_Token('name', bracket[1]!.trim(), i, i + bracket[0]!.length));
      i += bracket[0]!.length;
      continue;
    }
    // "Class: Void Mage", "Cultivation Realm: Core Formation": everything up to the colon names the group.
    final holds = _holds.firstMatch(rest);
    if (holds != null && !_logicalWord.hasMatch(holds[1]!)) {
      final after = rest.substring(holds[0]!.length);
      final stop = _holdsEnd.firstMatch(after)!.start;
      final name = after.substring(0, stop).trim();
      if (name.isEmpty) throw FormulaError('Say what comes after “${holds[1]}:”.');
      tokens.add(_Token('holds', name, i, i + holds[0]!.length + stop, holds[1]!.trim()));
      i += holds[0]!.length + stop;
      continue;
    }
    final word = _word.firstMatch(rest);
    if (word != null) {
      tokens.add(_Token('name', word[0]!, i, i + word[0]!.length));
      i += word[0]!.length;
      continue;
    }
    final op = _operators.where(rest.startsWith).firstOrNull;
    if (op != null) {
      tokens.add(_Token('op', op, i, i + op.length));
      i += op.length;
      continue;
    }
    throw FormulaError('“${String.fromCharCode(rest.runes.first)}” is not something a formula can use.');
  }
  tokens.add(_Token('end', '', source.length, source.length));
  return tokens;
}

/// Reads a formula. Throws [FormulaError] with a message meant for the author.
FNode parseFormula(String input) {
  final source = _normalise(input);
  final tokens = _tokenize(input);
  var at = 0;
  _Token peek() => tokens[at];
  bool isOp(List<String> ops) => peek().type == 'op' && ops.contains(peek().text);
  bool isWord(String word) => peek().type == 'name' && peek().text.toLowerCase() == word;
  String slice(int from) => source.substring(tokens[from].start, tokens[at - 1].end).trim();

  late FNode Function() or;
  FNode binary(FNode Function() next, String? Function() match) {
    final from = at;
    var left = next();
    for (var op = match(); op != null; op = match()) {
      at++;
      final right = next();
      left = BinaryNode(op, left, right, slice(from));
    }
    return left;
  }

  late FNode Function() unary;
  FNode primary() {
    final token = tokens[at++];
    switch (token.type) {
      case 'number':
        return NumberNode(double.parse(token.text));
      case 'text':
        return TextNode(token.text);
      case 'holds':
        return HoldsNode(token.group!, token.text, source.substring(token.start, token.end).trim());
      case 'name':
        if (!isOp(['('])) return NameNode(token.text);
        at++;
        final args = <FNode>[];
        if (!isOp([')'])) {
          do {
            args.add(or());
          } while (isOp([',']) && ++at > 0);
        }
        if (!isOp([')'])) throw FormulaError('“${token.text}(” is missing its closing bracket.');
        at++;
        return CallNode(token.text.toLowerCase(), args);
    }
    if (token.type == 'op' && token.text == '(') {
      final inner = or();
      if (!isOp([')'])) throw FormulaError('A bracket is not closed.');
      at++;
      return inner;
    }
    throw FormulaError(
      token.type == 'end' ? 'The formula stops before it is finished.' : '“${token.text}” is not expected here.',
    );
  }

  FNode power() {
    final from = at;
    final base = primary();
    if (!isOp(['^'])) return base;
    at++;
    return BinaryNode('^', base, unary(), slice(from));
  }

  unary = () {
    if (isOp(['-'])) {
      final from = at++;
      final operand = unary();
      return UnaryNode('-', operand, slice(from));
    }
    if (isOp(['+'])) at++;
    return power();
  };
  FNode product() => binary(unary, () => isOp(['*', '/', '%']) ? peek().text : null);
  FNode sum() => binary(product, () => isOp(['+', '-']) ? peek().text : null);
  FNode comparison() {
    final from = at;
    final left = sum();
    if (!isOp(['>=', '<=', '>', '<', '=', '==', '!=', '<>'])) return left;
    final op = const {'==': '=', '<>': '!='}[peek().text] ?? peek().text;
    at++;
    return BinaryNode(op, left, sum(), slice(from));
  }

  late FNode Function() not;
  not = () {
    if (isWord('not') || isOp(['!'])) {
      final from = at++;
      final operand = not();
      return UnaryNode('not', operand, slice(from));
    }
    return comparison();
  };
  FNode and() => binary(not, () => isWord('and') || isOp(['&&']) ? 'and' : null);
  or = () => binary(and, () => isWord('or') || isOp(['||']) ? 'or' : null);

  if (peek().type == 'end') throw FormulaError('The formula is empty.');
  final tree = or();
  if (peek().type != 'end') throw FormulaError('“${peek().text}” is not expected here.');
  return tree;
}

/// What a formula can read: the value of a name (null when nothing has that name), and whether the profile holds
/// `name` in `group` (null when there is no such group).
class FormulaScope {
  const FormulaScope({required this.value, required this.holds});
  final Object? Function(String name) value;
  final bool? Function(String group, String name) holds;
}

/// JavaScript's `Math.round`: halves go up.
double jsRound(double n) => (n + 0.5).floorToDouble();

/// A value as JavaScript's `String(value)` writes it.
String jsString(Object value) => switch (value) {
  // Dart writes a double as JavaScript does (shortest digits, plain below 1e21), but adds ".0" to a whole one.
  final double d when d.isFinite && d == d.truncateToDouble() => d.toString().replaceFirst(RegExp(r'\.0$'), ''),
  final double d when d.isNaN => 'NaN',
  final double d when d.isInfinite => d > 0 ? 'Infinity' : '-Infinity',
  final num n => '$n',
  _ => '$value',
};

const _functions = <String, (int, int)>{
  'min': (1, 99),
  'max': (1, 99),
  'floor': (1, 1),
  'ceil': (1, 1),
  'round': (1, 1),
  'abs': (1, 1),
  'sqrt': (1, 1),
  'clamp': (3, 3),
};

double _run(String name, List<double> n) => switch (name) {
  'min' => n.reduce((a, b) => a.isNaN || b.isNaN ? double.nan : math.min(a, b)),
  'max' => n.reduce((a, b) => a.isNaN || b.isNaN ? double.nan : math.max(a, b)),
  'floor' => n[0].isFinite ? n[0].floorToDouble() : n[0],
  'ceil' => n[0].isFinite ? n[0].ceilToDouble() : n[0],
  'round' => n[0].isFinite ? jsRound(n[0]) : n[0],
  'abs' => n[0].abs(),
  'sqrt' => math.sqrt(n[0]),
  _ => math.min(math.max(n[0], n[1]), n[2]),
};

bool truthy(Object value) => switch (value) {
  final num n => n != 0,
  final String s => s.isNotEmpty,
  final bool b => b,
  _ => false,
};

double _num(Object value, String what) => switch (value) {
  final bool b => b ? 1 : 0,
  final num n => n.toDouble(),
  _ => throw FormulaError('“$what” is a label, not a number.'),
};

bool _same(Object a, Object b) => a is String || b is String
    ? jsString(a).trim().toLowerCase() == jsString(b).trim().toLowerCase()
    : _num(a, '') == _num(b, '');

double _remainder(double a, double b) => a.isFinite && b.isFinite ? a.remainder(b) : (a.isFinite ? a : double.nan);

/// Works a formula out. Throws [FormulaError] for an unknown name, a missing group or impossible arithmetic.
Object evaluateFormula(FNode node, FormulaScope scope) {
  switch (node) {
    case NumberNode(:final value):
      return value;
    case TextNode(:final value):
      return value;
    case NameNode(:final name):
      final lower = name.toLowerCase();
      if (lower == 'true' || lower == 'yes') return true;
      if (lower == 'false' || lower == 'no') return false;
      return scope.value(name) ?? (throw FormulaError('Nothing here is called “$name”.'));
    case HoldsNode(:final group, :final name):
      return scope.holds(group, name) ?? (throw FormulaError('There is no “$group” to look in for “$name”.'));
    case UnaryNode(:final op, :final operand, :final source):
      return op == 'not' ? !truthy(evaluateFormula(operand, scope)) : -_num(evaluateFormula(operand, scope), source);
    case CallNode(:final name, :final args):
      if (name == 'if') {
        if (args.length != 3) throw FormulaError('if needs three parts: if(condition, then, otherwise).');
        return evaluateFormula(truthy(evaluateFormula(args[0], scope)) ? args[1] : args[2], scope);
      }
      final arity = _functions[name];
      if (arity == null) {
        throw FormulaError('“$name” is not a function. Available: ${_functions.keys.join(', ')}, if.');
      }
      if (args.length < arity.$1 || args.length > arity.$2) {
        throw FormulaError(
          '$name needs ${arity.$1 == arity.$2 ? arity.$1 : 'at least one'} value${arity.$1 == 1 && arity.$2 == 1 ? '' : 's'}.',
        );
      }
      return _run(name, [for (final a in args) _num(evaluateFormula(a, scope), name)]);
    case BinaryNode(:final op, :final left, :final right, :final source):
      if (op == 'and') return truthy(evaluateFormula(left, scope)) && truthy(evaluateFormula(right, scope));
      if (op == 'or') return truthy(evaluateFormula(left, scope)) || truthy(evaluateFormula(right, scope));
      final l = evaluateFormula(left, scope);
      final r = evaluateFormula(right, scope);
      if (op == '=') return _same(l, r);
      if (op == '!=') return !_same(l, r);
      final a = _num(l, source);
      final b = _num(r, source);
      switch (op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b == 0) throw FormulaError('This divides by zero.');
          return a / b;
        case '%':
          if (b == 0) throw FormulaError('This divides by zero.');
          return _remainder(a, b);
        case '^':
          return math.pow(a, b).toDouble();
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

/// Every plain name a formula reads, for working out what depends on what.
List<String> namesIn(FNode node) => switch (node) {
  NameNode(:final name) => [name],
  UnaryNode(:final operand) => namesIn(operand),
  BinaryNode(:final left, :final right) => [...namesIn(left), ...namesIn(right)],
  CallNode(:final args) => [for (final a in args) ...namesIn(a)],
  _ => const [],
};

/// The parts of a condition that are not satisfied, in the author's own words: for `Class: Void Mage AND level >= 50`
/// at level 12 with the class, `["level >= 50"]`. Empty when the whole condition holds.
List<String> unmet(FNode node, FormulaScope scope) {
  if (node is BinaryNode && node.op == 'and') return [...unmet(node.left, scope), ...unmet(node.right, scope)];
  if (truthy(evaluateFormula(node, scope))) return const [];
  return [
    switch (node) {
      HoldsNode(:final source) || UnaryNode(:final source) || BinaryNode(:final source) => source,
      NameNode(:final name) => name,
      _ => 'the condition',
    },
  ];
}

/// A number as an author would write it: whole when it is whole, otherwise to two places.
String formatNumber(double value) => value.isFinite ? jsString(jsRound(value * 100) / 100) : '∞';
