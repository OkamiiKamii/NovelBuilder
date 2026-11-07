import 'package:uuid/uuid.dart';

const _uuid = Uuid();

/// A new permanent id for a record.
///
/// STABLE ID RULE (as in the original app): an id is assigned once and never changed or reused. Renaming changes a
/// name, reordering changes an `order`, moving changes a `parentId`; nothing changes an id. Copies (duplicate, import,
/// fork) give every row a fresh id through one id map, so no two projects ever share one.
String newId() => _uuid.v4();

/// Whether a value can be an id: a non-empty string. Ids from the original app are UUIDs, but some are built from
/// other ids (`profile-<entryId>`, ability ids `<systemId>/<itemId>`), so the shape is not checked further.
bool isId(Object? value) => value is String && value.trim().isNotEmpty;
