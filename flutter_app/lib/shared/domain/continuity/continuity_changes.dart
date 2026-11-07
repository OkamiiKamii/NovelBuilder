import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import 'rules.dart';

List<String> _words(Object? value) {
  final list = value is List ? [for (final v in value) '$v'] : '${value ?? ''}'.split(',');
  return {
    for (final w in list)
      if (w.trim().isNotEmpty) w.trim(),
  }.take(40).toList();
}

/// Tracked continuity rules, as in the original's continuity service: what the manuscript check reads the text
/// against. Changing one changes nothing else; the text is never written to from here.
class ContinuityChanges extends RecordChanges {
  ContinuityChanges(super.snapshot, {required super.now, required super.createId});

  List<ContinuityRule> rules() => [for (final r in rows('continuityRules')) ContinuityRule(r)];

  ContinuityRule owned(String ruleId) => ContinuityRule(
    row('continuityRules', ruleId) ?? (throw ChangeRefused('That tracked rule is not in this novel.')),
  );

  String? _mine(String table, Object? id) => id is String && id.isNotEmpty && row(table, id) != null ? id : null;

  /// A rule's values, keeping only references to this novel's entries and chapters.
  JsonMap _clean(String kind, JsonMap? current, JsonMap input) {
    final given = {...?current, ...input};
    final states = kind == 'status' ? statusStates : (kind == 'possession' ? possessionStates : const <String>[]);
    final amount = num.tryParse('${given['amount'] ?? ''}');
    final label = '${given['label'] ?? ''}'.trim();
    return {
      'kind': kind,
      'entryId': _mine('loreEntries', given['entryId']),
      'aliases': _words(given['aliases']),
      'state': states.contains(given['state']) ? given['state'] : states.firstOrNull,
      'label': label.length > 200 ? label.substring(0, 200) : label,
      'words': _words(given['words']),
      'scope': given['scope'] == 'paragraph' ? 'paragraph' : 'scene',
      'holderId': kind == 'possession' ? _mine('loreEntries', given['holderId']) : null,
      'toEntryId': kind == 'travel' ? _mine('loreEntries', given['toEntryId']) : null,
      'amount': kind == 'travel' && amount != null && amount.isFinite && amount > 0 ? amount : null,
      'unit': ruleTimeUnits.contains(given['unit']) ? given['unit'] : 'days',
      'fromNodeId': kind == 'status' || kind == 'possession' ? _mine('chapters', given['fromNodeId']) : null,
      'untilNodeId': kind == 'status' || kind == 'possession' ? _mine('chapters', given['untilNodeId']) : null,
      'note': '${given['note'] ?? ''}',
    };
  }

  ContinuityRule createRule(String kind, [JsonMap input = const {}]) {
    if (!ruleKinds.contains(kind)) throw ChangeRefused('Unknown kind of rule.');
    final rule = {
      'id': newId(),
      'projectId': projectId,
      ..._clean(kind, null, input),
      'createdAt': now,
      'updatedAt': now,
    };
    put('continuityRules', rule);
    return ContinuityRule(rule);
  }

  void updateRule(String ruleId, JsonMap input) {
    final current = owned(ruleId);
    put('continuityRules', {...current.toJson(), ..._clean(current.kind, current.raw, input), 'updatedAt': now});
  }

  /// Deletes a tracked rule. Decisions made about its findings are kept, and simply stop applying.
  void removeRule(String ruleId) {
    owned(ruleId);
    remove('continuityRules', ruleId);
  }

  /// "Update canon": changes a tracked rule or a codex field so that it agrees with the text. Called only after the
  /// author has chosen the action and confirmed the exact change. The manuscript is never written to from here.
  void applyFix(Fix fix) {
    switch (fix) {
      case FieldFix(:final entryId, :final fieldId, :final value):
        final entry = row('loreEntries', entryId);
        final fields = maps(entry?['fields']).toList();
        if (entry == null || !fields.any((f) => f['id'] == fieldId)) {
          throw ChangeRefused('That codex field no longer exists.');
        }
        put('loreEntries', {
          ...entry,
          'fields': [
            for (final f in fields) f['id'] == fieldId ? {...f, 'value': value} : f,
          ],
          'updatedAt': now,
        });
      case EndRuleFix(:final ruleId, :final nodeId):
        final rule = owned(ruleId);
        put('continuityRules', {...rule.toJson(), 'untilNodeId': _mine('chapters', nodeId), 'updatedAt': now});
      case TravelFix(:final ruleId, :final amount, :final unit):
        final rule = owned(ruleId);
        if (amount > 0 && ruleTimeUnits.contains(unit)) {
          put('continuityRules', {...rule.toJson(), 'amount': amount, 'unit': unit, 'updatedAt': now});
        }
      case UnblockFix(:final ruleId, :final word):
        final rule = owned(ruleId);
        put('continuityRules', {
          ...rule.toJson(),
          'words': [
            for (final w in rule.words)
              if (w.toLowerCase() != word.toLowerCase()) w,
          ],
          'updatedAt': now,
        });
    }
  }
}
