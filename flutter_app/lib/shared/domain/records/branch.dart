import '../json.dart';
import '../json_record.dart';

enum BranchStatus {
  main('Main Canon', 'The primary, official story.'),
  alternate('Alternate Canon', 'An official alternate universe or second canon path.'),
  nonCanon('Non-Canon', 'A divergent outcome deliberately kept out of the main story.', key: 'non-canon'),
  experimental('Experimental', 'A what-if, an alternate ending, a drafting trial.'),
  abandoned('Abandoned', 'An experiment that has been set down.');

  const BranchStatus(this.label, this.hint, {String? key}) : _key = key;
  final String label;
  final String hint;
  final String? _key;
  String get key => _key ?? name;

  static BranchStatus of(Object? value) => values.where((s) => s.key == value).firstOrNull ?? main;
}

/// Timeline/branch metadata: how a novel relates to the novel it was forked from.
///
/// ZERO CROSS-CONTAMINATION RULE: a branch is a project in its own right, a complete copy with its own ids. This
/// record is the only tie between the two, and it holds no story data. [id] is the project it describes.
class BranchRecord extends JsonRecord {
  BranchRecord(super.raw);

  /// The project it was forked from. Null for the original.
  String? get parentId => idOrNull(raw['parentId']);

  /// The chapter, scene or group it was forked after. Null: before the story begins.
  String? get forkNodeId => idOrNull(raw['forkNodeId']);

  /// That node's title when the fork was made, kept for when the parent moves on.
  String get forkLabel => str(raw['forkLabel']);
  BranchStatus get status => BranchStatus.of(raw['status']);
  String get note => str(raw['note']);
}
