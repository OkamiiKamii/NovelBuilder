import '../collation.dart';
import '../model/story_model.dart';
import '../model/validity.dart';
import '../records/event.dart';
import '../records/progress.dart';
import '../stable_sort.dart';
import '../timeline/dates.dart' show formatDate;
import '../timeline/narrative.dart' show nodeLabel;

/// PROGRESSION, CHANGE BY CHANGE (as in the original app)
/// How a character changes over the novel, recorded as the changes happen: a level reached, a rank, a title won, an
/// ability gained, equipment lost, a transformation, a class taken up, a milestone, a cost paid. Nothing is assumed
/// about a character: the author chooses what the novel tracks (categories, in four shapes), and a character shows
/// only what is recorded for them.
///
/// Each change says when it happens when that is known: at a chapter or scene (reading order), at an event or on a
/// date (story time), before the story, or "when is not known". Reading order and story time are never compared: what
/// a character is like at a point is worked out only from the changes that can be placed against it, and the others
/// are listed as such, never guessed at.

const progressShapes = ['value', 'named', 'held', 'moment'];
const shapeLabels = {
  'value': 'One value at a time',
  'named': 'Several named values',
  'held': 'Things gained and lost',
  'moment': 'Moments',
};
const shapeHints = {
  'value': 'A level, a rank, a class or job: each change sets it.',
  'named': 'Attributes, standings, scores: each change sets one of them, by name.',
  'held': 'Titles, abilities, equipment, transformations, restrictions: each change gains or loses one.',
  'moment': 'Milestones, costs paid: each is something that happened.',
};

/// The changes each shape takes.
const actionsOf = {
  'value': ['set'],
  'named': ['set'],
  'held': ['gain', 'lose'],
  'moment': ['happen'],
};
const actionLabels = {'set': 'Set to', 'gain': 'Gained', 'lose': 'Lost', 'happen': 'Happened'};

/// Categories offered to start from. None is added unless the author chooses it.
const progressPresets = [
  (name: 'Level', shape: 'value'),
  (name: 'Rank', shape: 'value'),
  (name: 'Class or job', shape: 'value'),
  (name: 'Titles', shape: 'held'),
  (name: 'Attributes', shape: 'named'),
  (name: 'Abilities', shape: 'held'),
  (name: 'Equipment', shape: 'held'),
  (name: 'Transformations', shape: 'held'),
  (name: 'Restrictions', shape: 'held'),
  (name: 'Milestones', shape: 'moment'),
  (name: 'Costs paid', shape: 'moment'),
];

/// "When is not known": the change happens, but when is not recorded.
const unknownTime = {
  'kind': 'date',
  'when': {'precision': 'unknown'},
};

bool isUnknownTime(Anchor? at) => at is DateAnchor && at.when is UnknownDate;

/// Whether a category is offered for a character: it is not archived, and applies to every character or names this
/// one.
bool appliesTo(ProgressCategory category, String entryId) =>
    !category.archived && (category.characterIds.isEmpty || category.characterIds.contains(entryId));

// ---------------------------------------------------------------------------------------------------- in words

/// When a change happens, in words.
String whenWords(Anchor? at, StoryModel model) => switch (at) {
  null => 'Before the story',
  _ when isUnknownTime(at) => 'When is not known',
  NodeAnchor(:final nodeId) =>
    model.nodes.containsKey(nodeId) ? nodeLabel(model, nodeId) : 'A chapter that was deleted',
  EventAnchor(:final eventId) => 'At “${model.events[eventId]?.name ?? 'a deleted event'}”',
  DateAnchor(when: final date) => formatDate(date, (id) => model.events[id]?.name, model.calendar),
};

/// The thing a change is about, by name: its own words, else its codex entry's or ability's name, else its category.
String _thing(String subject, String? refId, String? abilityId, ProgressCategory? category, StoryModel model) {
  if (subject.trim().isNotEmpty) return subject.trim();
  final ref = refId == null ? '' : (model.entries[refId]?.name ?? '');
  if (ref.isNotEmpty) return ref;
  final ability = abilityId == null ? '' : (model.abilities[abilityId]?.item.name ?? '');
  if (ability.isNotEmpty) return ability;
  return category?.name ?? 'Something';
}

/// What a change says, in words: "Level set to 4", "Gained Fire Lance", "Strength set to 6", "First kill".
String changeWords(ProgressChange change, ProgressCategory? category, StoryModel model, {String? action}) {
  final thing = _thing(change.subject, change.refId, change.abilityId, category, model);
  final value = change.value.isEmpty ? '—' : change.value;
  return switch (action ?? change.action) {
    'set' => category?.shape == 'named' ? '$thing set to $value' : '${category?.name ?? 'Value'} set to $value',
    'gain' => 'Gained $thing',
    'lose' => 'Lost $thing',
    _ => thing,
  };
}

// ---------------------------------------------------------------------------------------------------- in order

Validity _asValidity(ProgressChange c) => Validity(c.at, null);

/// One entry's changes in order: from before the story first, then those in story time by date, then those in reading
/// order by position, then those whose time is not known or cannot be placed; within each, in the order recorded.
List<ProgressChange> inOrder(StoryModel model, String entryId) {
  final mine = stableSorted(model.progress.where((c) => c.entryId == entryId), (a, b) {
    final byTime = a.createdAt.compareTo(b.createdAt);
    return byTime != 0 ? byTime : localeCompare(a.id, b.id);
  });
  return historyOf(mine, _asValidity, model.timeContext);
}

/// Which of three orders a change sits in: story time, reading order, or none it can be placed in. Before the story is
/// before all of them.
String _axisOf(ProgressChange change, StoryModel model) {
  final at = change.at;
  if (at == null) return 'start';
  if (at is NodeAnchor) return model.order.position.containsKey(at.nodeId) ? 'reading' : 'none';
  final context = model.timeContext;
  final span = switch (at) {
    EventAnchor(:final eventId) => spanOfEvent(eventId, context),
    DateAnchor(when: final date) => spanOfDate(date, context),
    _ => null,
  };
  return span != null ? 'story' : 'none';
}

// ---------------------------------------------------------------------------------------------------- at a point

class ProgressLine {
  ProgressLine(this.subject, this.value, this.change, this.step, this.uncertain);

  /// The named value or the thing held; empty for one value at a time.
  final String subject;

  /// What it is: the value, or for a thing held, its name.
  final String value;
  final ProgressChange change;

  /// For a ladder: where the value sits ("3 of 5"), or that it is not one of its steps.
  final String? step;

  /// Changes in another order that may come later: which is the latest cannot be told.
  final List<ProgressChange> uncertain;
}

class CategoryState {
  CategoryState(this.category, this.lines, this.moments, this.lost);
  final ProgressCategory category;
  final List<ProgressLine> lines;

  /// For moments: those that have happened by then.
  final List<ProgressChange> moments;

  /// Things held once and since lost, for the record.
  final List<String> lost;
}

class ProgressState {
  ProgressState(this.categories, this.unplaced, this.untracked);

  /// Only categories with something recorded for this entry, in the categories' order.
  final List<CategoryState> categories;

  /// At a point: changes that cannot be placed against it (another order, or no time known): listed, never applied.
  final List<ProgressChange> unplaced;

  /// Categories that apply to this entry with nothing recorded for them. Never shown as empty values.
  final List<ProgressCategory> untracked;
}

String _key(String text) => text.trim().toLowerCase();

/// The novel's categories in their order.
List<ProgressCategory> orderedCategories(StoryModel model) => stableSorted(model.progressCategories.values, (a, b) {
  final byOrder = a.order.compareTo(b.order);
  return byOrder != 0 ? byOrder : localeCompare(a.name, b.name);
});

/// What an entry is like at a point: at a chapter or scene, at an event or a date, or at the end of the story ([at]
/// null). At a point, a change counts when it can be placed at or before it; one that cannot be placed against it is
/// listed in `unplaced`. At the end, every change has happened; where the order of a named value's changes cannot be
/// told, the line says so.
ProgressState progressAt(StoryModel model, String entryId, Anchor? at) {
  final context = model.timeContext;
  final ordered = inOrder(model, entryId);
  final counted = <ProgressChange>[];
  final unplaced = <ProgressChange>[];
  for (final c in ordered) {
    if (at == null) {
      counted.add(c);
    } else {
      final holds = isUnknownTime(c.at) ? Truth.unknown : validAt(_asValidity(c), at, context);
      if (holds == Truth.yes) {
        counted.add(c);
      } else if (holds == Truth.unknown) {
        unplaced.add(c);
      }
    }
  }
  final categories = orderedCategories(model);
  final states = <CategoryState>[];
  for (final category in categories) {
    final mine = [
      for (final c in counted)
        if (c.categoryId == category.id) c,
    ];
    if (mine.isEmpty) continue;
    final bySubject = <String, List<ProgressChange>>{};
    for (final c in mine.where((c) => c.action != 'happen')) {
      final k = category.shape == 'value' ? '' : _key(changeWords(c, category, model, action: 'happen'));
      (bySubject[k] ??= []).add(c);
    }
    final lines = <ProgressLine>[];
    final lost = <String>[];
    for (final changes in bySubject.values) {
      final last = changes.last;
      // The latest of each order: if more than one order has changes past the start, which is latest cannot be told.
      final axes = <String, ProgressChange>{};
      for (final c in changes) {
        axes[_axisOf(c, model)] = c;
      }
      axes.remove('start');
      final uncertain = axes.length > 1
          ? [
              for (final c in axes.values)
                if (c != last) c,
            ]
          : <ProgressChange>[];
      final name = changeWords(last, category, model, action: 'happen');
      if (category.shape == 'held') {
        if (last.action == 'gain' || uncertain.any((c) => c.action == 'gain')) {
          lines.add(ProgressLine(name, name, last, null, uncertain));
        } else {
          lost.add(name);
        }
        continue;
      }
      final ladderAt = category.ladder.indexWhere((v) => _key(v) == _key(last.value));
      final step = category.shape == 'value' && category.ladder.isNotEmpty
          ? (ladderAt >= 0 ? '${ladderAt + 1} of ${category.ladder.length}' : 'not one of its steps')
          : null;
      lines.add(ProgressLine(category.shape == 'value' ? '' : name, last.value, last, step, uncertain));
    }
    states.add(
      CategoryState(category, stableSorted(lines, (a, b) => localeCompare(a.subject, b.subject)), [
        for (final c in mine)
          if (c.action == 'happen') c,
      ], lost),
    );
  }
  final recorded = {for (final c in ordered) c.categoryId};
  return ProgressState(states, unplaced, [
    for (final c in categories)
      if (appliesTo(c, entryId) && !recorded.contains(c.id)) c,
  ]);
}

/// An entry's progression in one line: "Level 4 · Rank Lieutenant · Abilities: Fire Lance, Ward". Empty when nothing
/// is recorded.
String progressSummary(ProgressState state) {
  String few(List<String> names) =>
      names.length > 3 ? '${names.take(3).join(', ')} and ${names.length - 3} more' : names.join(', ');
  return [
    for (final s in state.categories)
      () {
        final category = s.category;
        if (category.shape == 'value') return s.lines.isEmpty ? '' : '${category.name} ${s.lines.first.value}';
        final names = category.shape == 'moment'
            ? [for (final m in s.moments) m.subject]
            : category.shape == 'named'
            ? [for (final l in s.lines) '${l.subject} ${l.value}']
            : [for (final l in s.lines) l.value];
        return names.isEmpty ? '' : '${category.name}: ${few(names)}';
      }(),
  ].where((x) => x.isNotEmpty).join(' · ');
}

/// Each change in order, with what it was before for a value set (the previous change of that value in the same order
/// of changes).
List<({ProgressChange change, ProgressCategory? category, String words, String? before, String when})> changeLog(
  StoryModel model,
  String entryId,
) {
  final seen = <String, String>{};
  return [
    for (final change in inOrder(model, entryId))
      () {
        final category = model.progressCategories[change.categoryId];
        final k = '${change.categoryId}|${category?.shape == 'named' ? _key(change.subject) : ''}';
        final before = change.action == 'set' ? seen[k] : null;
        if (change.action == 'set') seen[k] = change.value;
        return (
          change: change,
          category: category,
          words: changeWords(change, category, model),
          before: before,
          when: whenWords(change.at, model),
        );
      }(),
  ];
}
