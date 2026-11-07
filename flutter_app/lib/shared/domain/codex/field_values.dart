import '../records/category.dart';
import '../records/entry.dart';

/// Several choices, tags or links are stored one per line. Blank lines and surrounding spaces are not values.
List<String> splitChoices(String value) => [
  for (final v in value.split('\n'))
    if (v.trim().isNotEmpty) v.trim(),
];

/// A value as a reader should see it: "Yes", "Fire, Ash", the linked entry's name… A link to an entry that is gone
/// reads as nothing, so a deleted record is never shown as if it were there.
String displayValue(FieldType? type, String value, String? Function(String entryId) nameOf) {
  if (value.trim().isEmpty) return '';
  return switch (type) {
    FieldType.toggle => value == 'yes' ? 'Yes' : (value == 'no' ? 'No' : value),
    FieldType.multiselect || FieldType.tags => splitChoices(value).join(', '),
    FieldType.reference => nameOf(value) ?? '',
    FieldType.references => [for (final id in splitChoices(value)) ?nameOf(id)].join(', '),
    _ => value,
  };
}

enum FieldProblem {
  required('required'),
  notANumber('not-a-number'),
  tooSmall('too-small'),
  tooLarge('too-large'),
  notADate('not-a-date'),
  notAChoice('not-a-choice'),
  notYesNo('not-yes-no'),
  notAnEntry('not-an-entry'),
  wrongKind('wrong-kind');

  const FieldProblem(this.key);

  /// The original app's name for it.
  final String key;
}

/// Where a value does not fit its field. Said, never enforced: the value is kept as written.
class FieldIssue {
  const FieldIssue(this.defId, this.field, this.problem, this.message);

  final String defId;
  final String field;
  final FieldProblem problem;
  final String message;
}

final _date = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

bool _isDate(String value) {
  final m = _date.firstMatch(value);
  if (m == null) return false;
  final (y, mo, d) = (int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  final date = DateTime.utc(y, mo, d);
  return date.year == y && date.month == mo && date.day == d;
}

/// A number as JavaScript's `Number(text)` reads one (after trimming): decimal, exponent, `0x…`, `0o…`, `0b…`.
/// `Infinity` reads as a number there too, but not a finite one, so it is not a number here.
num? jsNumber(String text) {
  if (text.isEmpty) return 0;
  for (final (prefix, radix, digits) in [('0x', 16, '[0-9a-f]'), ('0o', 8, '[0-7]'), ('0b', 2, '[01]')]) {
    if (RegExp('^$prefix$digits+\$', caseSensitive: false).hasMatch(text)) {
      return int.tryParse(text.substring(2), radix: radix);
    }
  }
  if (!RegExp(r'^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$').hasMatch(text)) return null;
  return double.parse(text);
}

String _n(num n) => n == n.roundToDouble() && n.abs() < 1e21 ? n.toInt().toString() : n.toString();

/// What is wrong with one value against its field's definition, if anything. As the original app's `checkValue`.
FieldIssue? checkValue(
  FieldDef def,
  String value,
  Map<String, Entry> entries, {
  String Function(String key) categoryName = _same,
}) {
  FieldIssue issue(FieldProblem problem, String message) => FieldIssue(def.id, def.name, problem, message);
  final text = value.trim();
  if (text.isEmpty) return def.required ? issue(FieldProblem.required, '${def.name} is required.') : null;
  switch (def.type) {
    case FieldType.number:
      final n = jsNumber(text);
      if (n == null || !n.isFinite) {
        return issue(FieldProblem.notANumber, '${def.name} should be a number; it holds “$text”.');
      }
      if (def.min != null && n < def.min!) {
        return issue(FieldProblem.tooSmall, '${def.name} should be at least ${_n(def.min!)}; it is ${_n(n)}.');
      }
      if (def.max != null && n > def.max!) {
        return issue(FieldProblem.tooLarge, '${def.name} should be at most ${_n(def.max!)}; it is ${_n(n)}.');
      }
      return null;
    case FieldType.date:
      return _isDate(text) ? null : issue(FieldProblem.notADate, '${def.name} should be a date; it holds “$text”.');
    case FieldType.toggle:
      return text == 'yes' || text == 'no'
          ? null
          : issue(FieldProblem.notYesNo, '${def.name} should be yes or no; it holds “$text”.');
    case FieldType.select:
      return def.options.isEmpty || def.options.contains(text)
          ? null
          : issue(FieldProblem.notAChoice, '${def.name} should be one of ${def.options.join(', ')}; it holds “$text”.');
    case FieldType.multiselect:
      final off = [
        for (final v in splitChoices(text))
          if (!def.options.contains(v)) v,
      ];
      return def.options.isEmpty || off.isEmpty
          ? null
          : issue(
              FieldProblem.notAChoice,
              '${def.name} holds ${off.map((v) => '“$v”').join(', ')}, not among its choices.',
            );
    case FieldType.reference || FieldType.references:
      final ids = def.type == FieldType.reference ? [text] : splitChoices(text);
      final missing = [
        for (final id in ids)
          if (!entries.containsKey(id)) id,
      ];
      if (missing.isNotEmpty) {
        return issue(
          FieldProblem.notAnEntry,
          '${def.name} holds ${missing.map((v) => '“$v”').join(', ')}, which ${missing.length == 1 ? 'is' : 'are'} '
          'not an entry.',
        );
      }
      final target = def.target;
      final wrong = target == null
          ? const <String>[]
          : [
              for (final id in ids)
                if (entries[id]!.category != target) id,
            ];
      if (wrong.isNotEmpty) {
        return issue(
          FieldProblem.wrongKind,
          '${def.name} should link to ${categoryName(target!)}; ${wrong.map((id) => entries[id]!.name).join(', ')} '
          '${wrong.length == 1 ? 'is' : 'are'} not.',
        );
      }
      return null;
    default:
      return null;
  }
}

String _same(String key) => key;

/// Every value of an entry that does not fit its category's fields (archived fields are not checked).
List<FieldIssue> entryIssues(
  Entry entry,
  Category category,
  Map<String, Entry> entries, {
  String Function(String key) categoryName = _same,
}) => [
  for (final def in category.fields)
    if (!def.archived)
      ?checkValue(
        def,
        entry.fields.where((f) => f.defId == def.id).firstOrNull?.value ?? '',
        entries,
        categoryName: categoryName,
      ),
];
