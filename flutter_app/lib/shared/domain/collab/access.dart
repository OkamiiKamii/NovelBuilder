import '../json.dart';

/// WHO MAY SEE AND CHANGE WHAT. The one statement of the roles' permissions, as the original app's
/// `src/modules/sync/access.ts` states it. A review copy holds only what its role may see ([visible]); a feedback file
/// is accepted row by row only where its role may make the change ([refusal]); and the store refuses, under every
/// write, a change a review copy's role may not make.
///
/// OWNER FINAL AUTHORITY RULE: editors, readers and viewers cannot write to the manuscript, the worldbuilding, systems
/// or character sheets at all: what they propose travels as a suggestion or a comment, and only an author's acceptance
/// turns it into a change.
enum Role {
  owner('Owner', 'Everything, including the team, deleting the project and the last word on canon.'),
  coauthor('Co-Author', 'Writes the manuscript, plans and worldbuilding. Accepts or rejects suggestions.'),
  editor(
    'Editor',
    'Reads everything but private notes. Suggests changes to the text and the lore, and comments anywhere.',
  ),
  reader(
    'Beta Reader / Proofreader',
    'Reads the manuscript only. Comments, reacts and fills in feedback. Sees no plans or lore.',
  ),
  viewer('Viewer', 'Reads chapters marked Final or Published. Cannot comment.');

  const Role(this.label, this.summary);
  final String label;
  final String summary;

  static Role? of(Object? value) => Role.values.where((r) => r.name == value).firstOrNull;
}

/// The roles a review copy can be made for. A co-author writes freely, which exchanging files cannot carry without
/// syncing whole manuscripts; their work comes back as an editor's suggestions instead.
const reviewRoles = [Role.editor, Role.reader, Role.viewer];

enum Capability {
  /// Invite people, change roles, remove people.
  manage,

  /// Change the manuscript, plans and worldbuilding directly.
  write,

  /// Accept or reject what others propose, and turn comments into tasks.
  decide,

  /// Propose changes to the text and the lore.
  suggest,
  comment,
  readLore,
  readPlanning,

  /// See what other people have commented. A reader sees only their own conversations.
  seeAllComments,

  /// See the record of who did what.
  seeActivity,
}

const _can = <Role, List<Capability>>{
  Role.owner: Capability.values,
  Role.coauthor: [
    Capability.write,
    Capability.decide,
    Capability.suggest,
    Capability.comment,
    Capability.readLore,
    Capability.readPlanning,
    Capability.seeAllComments,
    Capability.seeActivity,
  ],
  Role.editor: [
    Capability.suggest,
    Capability.comment,
    Capability.readLore,
    Capability.readPlanning,
    Capability.seeAllComments,
    Capability.seeActivity,
  ],
  Role.reader: [Capability.comment],
  Role.viewer: [],
};

bool can(Role role, Capability capability) => _can[role]!.contains(capability);

const _lore = [
  'characterProfiles',
  'characterTemplates',
  'loreEntries',
  'loreLinks',
  'loreSchemas',
  'characterRelations',
  'relationSettings',
  'timelineEvents',
  'storyCalendars',
  'alternateHistories',
  'systems',
  'systemSheets',
  'progressSnapshots',
  'progressCategories',
  'progressChanges',
  'placeSettings',
  'worldMaps',
  'mapPins',
  'journeys',
  'travelSettings',
  'canonFacts',
  'projectModules',
  'moduleRecords',
];
const _planning = [
  'chapterPlans',
  'structureMarkers',
  'plotThreads',
  'continuityRules',
  'continuityResolutions',
  'savedViews',
];

/// What only the people writing the book see: its history, alternate drafts, goals, sessions and loose ideas.
const _authorsOnly = [
  'characterSecrets',
  'characterNotes',
  'characterHistory',
  'chapterRevisions',
  'chapterBranches',
  'goals',
  'writingSessions',
  'brainstorms',
  'ideas',
];

/// The collections of the team: who is on it, and what they have said, proposed and done.
const collabCollections = ['members', 'comments', 'suggestions', 'activity'];

/// Chapter statuses a viewer may read.
const publishedStatuses = ['final', 'published'];

String _tableOf(String key) => key.substring(0, key.indexOf(':'));
String _idOf(String key) => key.substring(key.indexOf(':') + 1);
bool _isText(Object? kind) => kind == 'chapter' || kind == 'scene';

typedef Lookup = JsonMap? Function(String key);

/// A row as someone in this role is allowed to see it: the row, a copy with its private parts blanked, or null when it
/// is not theirs to see. [key] is `<collection>:<id>` (`projects:<id>` for the novel's details).
JsonMap? visible(Role role, String memberId, String key, JsonMap? row, Lookup lookup) {
  if (row == null) return null;
  if (role == Role.owner) return row;
  final table = _tableOf(key);
  if (table == 'settings') return null;
  if (table == 'timelines') return role == Role.coauthor ? row : null;
  if (table == 'projects') {
    return can(role, Capability.readPlanning)
        ? row
        : {...row, 'synopsis': '', 'tags': <Object?>[], 'targetWordCount': null, 'deadline': null};
  }
  if (table == 'members') {
    if (can(role, Capability.seeActivity)) return role == Role.coauthor ? row : {...row, 'email': ''};
    return row['id'] == memberId ? {...row, 'email': ''} : null;
  }
  if (table == 'comments') {
    if (!can(role, Capability.comment)) return null;
    return can(role, Capability.seeAllComments) || row['threadAuthorId'] == memberId ? row : null;
  }
  if (table == 'suggestions') return can(role, Capability.suggest) ? row : null;
  if (table == 'activity') return can(role, Capability.seeActivity) ? row : null;
  // Front and back matter is published with the book: whoever may read the book may read it.
  if (role == Role.coauthor || table == 'bookMatter') return row;
  if (_authorsOnly.contains(table)) return null;
  if (_lore.contains(table)) {
    if (!can(role, Capability.readLore)) return null;
    // A connection to a chapter or a plot thread is part of the plan.
    if (table == 'loreLinks' &&
        [row['fromType'], row['toType']].any((t) => t == 'node' || t == 'thread') &&
        !can(role, Capability.readPlanning)) {
      return null;
    }
    // An entry's notes are marked private to the author.
    return table == 'loreEntries' ? {...row, 'notes': ''} : row;
  }
  if (_planning.contains(table)) return can(role, Capability.readPlanning) ? row : null;
  if (table == 'chapters') {
    if (role == Role.editor) return row;
    if (role == Role.viewer && _isText(row['kind']) && !publishedStatuses.contains(str(row['status']))) return null;
    // Summaries and notes are planning.
    return {...row, 'summary': '', 'notes': '', 'mentions': <Object?>[]};
  }
  if (table == 'chapterContents') {
    if (role != Role.viewer) return row;
    final chapter = lookup('chapters:${_idOf(key)}');
    return chapter != null && publishedStatuses.contains(str(chapter['status'])) ? row : null;
  }
  return null;
}

bool _same(Object? a, Object? b) => jsonEquals(a, b);
JsonMap _without(JsonMap row, List<String> fields) => {
  for (final e in row.entries)
    if (!fields.contains(e.key)) e.key: e.value,
};

/// Whether someone in this role may make this change: null when they may, and otherwise the reason, in words fit to
/// show them. [before] is the row as it stands (null for a new one), [after] the row proposed (null to delete it).
String? refusal(Role role, String memberId, String key, JsonMap? before, JsonMap? after) {
  if (role == Role.owner) return null;
  final table = _tableOf(key);
  if (table == 'settings') return 'Settings are personal and are not shared.';
  if (table == 'members') return 'Only the owner manages who is on the project.';
  if (table == 'projects' || table == 'timelines') return 'Only the owner changes the project itself.';
  bool mine(JsonMap? row, String field) => row?[field] == memberId;

  if (table == 'activity') {
    // The record of who did what is written once, by the person who did it.
    if (role == Role.viewer) return 'Viewers read only.';
    return after != null && mine(after, 'actorId') && (before == null || mine(before, 'actorId'))
        ? null
        : 'The activity record cannot be rewritten.';
  }
  if (table == 'comments') {
    if (!can(role, Capability.comment)) return 'Viewers cannot comment.';
    if (role == Role.coauthor) return null;
    if (before == null) {
      if (!mine(after, 'authorId')) return 'A comment is signed by whoever wrote it.';
      return can(role, Capability.seeAllComments) || mine(after, 'threadAuthorId')
          ? null
          : 'Readers reply in their own conversations.';
    }
    if (mine(before, 'authorId')) {
      return after == null || mine(after, 'authorId') ? null : 'A comment is signed by whoever wrote it.';
    }
    // Someone else's comment: an editor may resolve or re-open the thread, and nothing more.
    const marks = ['status', 'resolvedBy', 'resolvedAt', 'updatedAt'];
    return role == Role.editor && after != null && _same(_without(before, marks), _without(after, marks))
        ? null
        : 'Only its writer or an author can change a comment.';
  }
  if (table == 'suggestions') {
    if (role == Role.coauthor) return null;
    if (!can(role, Capability.suggest)) return 'Your role comments; it does not suggest changes.';
    if (before == null) {
      return mine(after, 'authorId') &&
              after?['status'] == 'pending' &&
              _same(after?['decisions'] ?? <String, Object?>{}, <String, Object?>{})
          ? null
          : 'A suggestion starts out pending, in its writer’s name.';
    }
    if (!mine(before, 'authorId')) return 'Only its writer can change a suggestion.';
    if (after == null) return null;
    // The verdict belongs to the authors.
    const verdict = ['status', 'decisions', 'decidedBy', 'decidedAt'];
    return mine(after, 'authorId') && verdict.every((field) => _same(before[field], after[field]))
        ? null
        : 'Only an author accepts or rejects a suggestion.';
  }
  if (role == Role.coauthor) {
    if (table == 'canonFacts' && (before?['status'] == 'canon' || after?['status'] == 'canon')) {
      return 'Established canon is the owner’s to set and change.';
    }
    return null;
  }
  if (role == Role.editor) return 'Editors propose changes as suggestions and comments; an author accepts them.';
  if (role == Role.reader) return 'Readers comment and give feedback; they do not change the project.';
  return 'Viewers read only.';
}

/// A change a review copy's role does not allow. The message is fit to show the person.
class PermissionException implements Exception {
  const PermissionException(this.message);
  final String message;
  @override
  String toString() => message;
}
