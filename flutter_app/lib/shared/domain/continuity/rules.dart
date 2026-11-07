import '../codex/field_values.dart' show displayValue;
import '../json.dart';
import '../json_record.dart';
import '../records/category.dart';
import '../records/entry.dart';

/// CONTINUITY (as in the original app): what the author records as true from a point in the story, which the
/// manuscript can be checked against, and what each check finds.

enum Severity {
  critical('Critical', 'Appears to contradict something recorded as settled, such as a character’s death.'),
  warning('Warning', 'May contradict a recorded rule, state or distance.'),
  info('Info', 'A detail worth a second look.');

  const Severity(this.label, this.hint);
  final String label;
  final String hint;

  static Severity? of(Object? value) => values.where((s) => s.name == value).firstOrNull;
}

const ruleKinds = ['status', 'possession', 'travel', 'power'];
const ruleKindLabels = {
  'status': 'Character status',
  'possession': 'Item possession',
  'travel': 'Travel time',
  'power': 'Power or magic rule',
};
const ruleKindHints = {
  'status': 'A character dies, leaves, or is changed from a chapter onwards.',
  'possession': 'An item is lost, destroyed, or held by someone from a chapter onwards.',
  'travel': 'How long it takes to get from one place to another.',
  'power': 'Conditions under which an ability cannot be used.',
};

/// What an issue is about. `trait` issues come from codex fields rather than from a tracked rule.
const issueCategories = ['status', 'possession', 'travel', 'power', 'trait'];
const issueCategoryLabels = {
  'status': 'Character & status',
  'possession': 'Inventory & possession',
  'travel': 'Geography & travel',
  'power': 'Power & magic rules',
  'trait': 'Character traits',
};

const statusStates = ['deceased', 'absent', 'condition'];
const possessionStates = ['lost', 'destroyed', 'held'];
const stateLabels = {
  'deceased': 'Deceased',
  'absent': 'Away or unable to act',
  'condition': 'Changed (injury, trait…)',
  'lost': 'Lost',
  'destroyed': 'Destroyed',
  'held': 'Held by someone',
};

const ruleTimeUnits = ['minutes', 'hours', 'days', 'weeks', 'months'];
const hoursIn = {'minutes': 1 / 60, 'hours': 1.0, 'days': 24.0, 'weeks': 168.0, 'months': 720.0};

/// Something the author has recorded as true from a point in the story (`continuityRules`). It points at codex entries
/// and chapters by id only. Which fields matter depends on [kind]:
///  status      entryId (character), state, label, words, from/until
///  possession  entryId (item), state, holderId, from/until
///  travel      entryId and toEntryId (locations), amount, unit
///  power       entryId (ability), label (the rule in words), words (what blocks it), scope
class ContinuityRule extends JsonRecord {
  ContinuityRule(super.raw);

  String get kind => str(raw['kind'], 'status');
  String? get entryId => idOrNull(raw['entryId']);

  /// Other ways the subject is written in the text: "the prince", "Dawnbreaker".
  List<String> get aliases => strings(raw['aliases']);
  String? get state => strOrNull(raw['state']);
  String get label => str(raw['label']);
  List<String> get words => strings(raw['words']);

  /// Power rules: look for those words in the same paragraph, or anywhere in the same chapter or scene.
  String get scope => raw['scope'] == 'paragraph' ? 'paragraph' : 'scene';
  String? get holderId => idOrNull(raw['holderId']);
  String? get toEntryId => idOrNull(raw['toEntryId']);
  double? get amount {
    final n = numOrNull(raw['amount']);
    return n == null || !n.isFinite ? null : n.toDouble();
  }

  String get unit => ruleTimeUnits.contains(raw['unit']) ? raw['unit']! as String : 'days';

  /// The chapter or scene where this becomes true. It applies to everything after it. Null: from the start.
  String? get fromNodeId => idOrNull(raw['fromNodeId']);

  /// The chapter or scene from which it stops being true (the character returns, the item is found).
  String? get untilNodeId => idOrNull(raw['untilNodeId']);
  String get note => str(raw['note']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}

/// A change to a recorded rule or codex field that would make it agree with the text. Only ever a proposal: it is
/// applied when the author chooses "Update canon" and confirms.
sealed class Fix {
  const Fix();
  JsonMap toJson();
}

class EndRuleFix extends Fix {
  const EndRuleFix(this.ruleId, this.nodeId);
  final String ruleId;
  final String nodeId;
  @override
  JsonMap toJson() => {'type': 'end-rule', 'ruleId': ruleId, 'nodeId': nodeId};
}

class TravelFix extends Fix {
  const TravelFix(this.ruleId, this.amount, this.unit);
  final String ruleId;
  final double amount;
  final String unit;
  @override
  JsonMap toJson() => {'type': 'travel', 'ruleId': ruleId, 'amount': amount, 'unit': unit};
}

class UnblockFix extends Fix {
  const UnblockFix(this.ruleId, this.word);
  final String ruleId;
  final String word;
  @override
  JsonMap toJson() => {'type': 'unblock', 'ruleId': ruleId, 'word': word};
}

class FieldFix extends Fix {
  const FieldFix(this.entryId, this.fieldId, this.value);
  final String entryId;
  final String fieldId;
  final String value;
  @override
  JsonMap toJson() => {'type': 'field', 'entryId': entryId, 'fieldId': fieldId, 'value': value};
}

/// One finding of the manuscript check.
class Issue {
  Issue({
    required this.key,
    required this.severity,
    required this.category,
    required this.message,
    required this.nodeId,
    required this.nodeTitle,
    required this.block,
    required this.excerpt,
    required this.match,
    required this.entryIds,
    required this.ruleId,
    required this.fix,
    required this.fixSummary,
  });

  /// The same for the same finding in the same passage on every run, so a decision about it holds.
  final String key;
  final Severity severity;
  final String category;
  final String message;
  final String nodeId;
  final String nodeTitle;

  /// Paragraph, counting from 0 as the editor does.
  final int block;
  final String excerpt;

  /// The words in the excerpt the finding rests on.
  final String match;
  final List<String> entryIds;
  final String? ruleId;
  final Fix? fix;

  /// What "Update canon" would do, as a sentence to confirm.
  final String fixSummary;

  JsonMap toJson() => {
    'key': key,
    'severity': severity.name,
    'category': category,
    'message': message,
    'nodeId': nodeId,
    'nodeTitle': nodeTitle,
    'block': block,
    'excerpt': excerpt,
    'match': match,
    'entryIds': entryIds,
    'ruleId': ruleId,
    'fix': fix?.toJson(),
    'fixSummary': fixSummary,
  };
}

/// Reasons often given for something meant.
const intentionalReasons = [
  'Flashback sequence',
  'Disguise',
  'Magic illusion',
  'Dream or vision',
  'Remembered, not present',
  'Unreliable narrator',
];

/// The fields of an entry that have something in them, labelled and readable, in display order.
List<({String id, String label, String text})> filledFields(
  Entry entry,
  Category category,
  String? Function(String entryId) nameOf,
) {
  final view = viewFields(entry, category);
  return [
    for (final (def, field) in view.category)
      if (field != null) (id: field.id, label: def.name, text: displayValue(def.type, field.value, nameOf)),
    for (final field in view.own)
      (
        id: field.id,
        label: field.key.isNotEmpty ? field.key : 'Untitled field',
        text: displayValue(field.type, field.value, nameOf),
      ),
  ].where((f) => f.text.trim().isNotEmpty).toList();
}
