import 'package:flutter/foundation.dart';

import '../json.dart';
import '../json_record.dart';
import '../model/entity_ref.dart';
import '../model/validity.dart';
import 'canon.dart';

/// How a kind of connection reads from the other end.
///
///  - [ConnectionType.same]: it reads the same both ways (allies are allied with each other).
///  - a phrase: the other side is the plain converse of a fact (the Keep contains the vault, so the vault is located
///    in the Keep). Nobody's opinion is guessed.
///  - null: it says nothing about the other side. That Mira considers Orrin a rival does not make her his rival.
///
/// Kinds the author makes up are kept exactly as written and read as one-sided.
@immutable
class ConnectionType {
  const ConnectionType(this.key, this.label, this.inverse);

  static const same = '\u0000same';

  final String key;
  final String label;
  final String? inverse;

  bool get reciprocal => inverse == same;
}

const connectionTypes = [
  ConnectionType('related', 'Related to', ConnectionType.same),
  ConnectionType('allied-with', 'Allied with', ConnectionType.same),
  ConnectionType('member-of', 'Member of', 'Has member'),
  ConnectionType('leads', 'Leads', 'Led by'),
  ConnectionType('owns', 'Owns', 'Owned by'),
  ConnectionType('located-in', 'Located in', 'Contains'),
  ConnectionType('created-by', 'Created by', 'Created'),
  ConnectionType('caused', 'Caused', 'Caused by'),
  ConnectionType('occurred-at', 'Took place at', 'Scene of'),
  ConnectionType('appears-in', 'Appears in', 'Features'),
  ConnectionType('knows-about', 'Knows about', 'Known to'),
  ConnectionType('considers-rival', 'Considers a rival', null),
  ConnectionType('considers-friend', 'Considers a friend', null),
  ConnectionType('distrusts', 'Distrusts', null),
  ConnectionType('at-war-with', 'At war with', ConnectionType.same),
  ConnectionType('controls', 'Controls', 'Controlled by'),
  ConnectionType('influences', 'Influences', 'Influenced by'),
  ConnectionType('prerequisite-for', 'Prerequisite for', 'Requires'),
  ConnectionType('alternative-for', 'Alternative prerequisite for', 'Can be reached through'),
  ConnectionType('upgrades-to', 'Upgrades to', 'Upgraded from'),
  ConnectionType('evolves-into', 'Evolves into', 'Evolves from'),
  ConnectionType('fuses-into', 'Fuses into', 'Fused from'),
  ConnectionType('replaced-by', 'Replaced by', 'Replaces'),
  ConnectionType('excludes', 'Mutually exclusive with', ConnectionType.same),
];

final _typesByKey = {for (final t in connectionTypes) t.key: t};

/// A connection kind, known or the author's own. An unknown key is shown as written and treated as one-sided.
ConnectionType connectionType(String? key) {
  final name = (key ?? '').trim().isEmpty ? 'related' : key!.trim();
  return _typesByKey[name] ?? ConnectionType(name, name, null);
}

/// A stored connection between two records (`loreLinks`). One row serves both directions, each side with its own
/// optional wording. Records never store their connections themselves, so removing one cannot leave the other broken.
///
/// Without a [type] it is a plain "related entries" link between two codex entries. A typed one says what kind it is
/// ("member-of", "owns", or the author's own word), may join any two kinds of record, and reads from → to.
class Link extends JsonRecord {
  Link(super.raw);

  String get fromId => str(raw['fromId']);
  String get toId => str(raw['toId']);

  /// What each end is; `entry` when absent (and when the stored value is not a known type).
  EntityType get fromType => entityTypeOf(raw['fromType']) ?? EntityType.entry;
  EntityType get toType => entityTypeOf(raw['toType']) ?? EntityType.entry;
  EntityRef get from => EntityRef(fromType, fromId);
  EntityRef get to => EntityRef(toType, toId);

  /// How the from side describes it, and the to side.
  String get fromLabel => str(raw['fromLabel']);
  String get toLabel => str(raw['toLabel']);

  /// A known key or the author's own word, kept as written. Null: a plain related-entries link.
  String? get type {
    final t = strOrNull(raw['type']);
    return t == null || t.isEmpty ? null : t;
  }

  String? get notes => strOrNull(raw['notes']);
  CanonStatus? get canon => CanonStatus.of(raw['canon']);

  /// When in the story it holds. Null: always, as far as anyone has said.
  Validity? get validity => Validity.fromJson(raw['validity']);

  /// How it began and ended, in the author's words ("stolen", "inherited"; "lost", "destroyed").
  String? get how => strOrNull(raw['how']);
  String? get endHow => strOrNull(raw['endHow']);

  /// Whether this is a link between two codex entries: what the codex lists as related entries.
  bool get isEntryLink => fromType == EntityType.entry && toType == EntityType.entry;

  Link withFields(JsonMap changes) => Link(merged(changes));
}

/// The words each side of a stored connection reads, from its type and the author's own wording.
({String forward, String backward, bool reciprocal}) wordingOf(Link link) {
  final type = link.type;
  // An untyped related-entries link has only what the author wrote on each side.
  if (type == null) return (forward: link.fromLabel, backward: link.toLabel, reciprocal: true);
  final kind = connectionType(type);
  final forward = link.fromLabel.isNotEmpty ? link.fromLabel : kind.label;
  final backward = link.toLabel.isNotEmpty ? link.toLabel : (kind.reciprocal ? forward : (kind.inverse ?? ''));
  return (forward: forward, backward: backward, reciprocal: kind.reciprocal);
}
