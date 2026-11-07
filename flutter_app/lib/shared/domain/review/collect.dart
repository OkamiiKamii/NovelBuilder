import '../abilities/paths.dart';
import '../canon/checks.dart';
import '../canon/facts.dart' show FactParts;
import '../canon/overlay.dart' show canonKey, traitRule;
import '../canon/review.dart';
import '../characters/character_records.dart' show CharacterSecret;
import '../characters/knowledge.dart';
import '../continuity/audit.dart' show otherChecks;
import '../continuity/rules.dart';
import '../integrity/rules.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../places/places.dart';
import '../progression/snapshots.dart' show ProgressSnapshot;
import '../records/canon.dart';
import '../records/review.dart';
import '../timeline/review.dart';
import '../travel/routes.dart';
import '../travel/travel.dart';

/// THE CONTINUITY REVIEW, GATHERED (as in the original app)
/// Every warning the app's deterministic checks raise, in one shape: its severity, its category, whether it is a
/// confirmed data error or a possible inconsistency, its rule, the data it rests on, the records it is about, and where
/// to see it in context. Nothing is checked here that a check does not already check: each keeps its own rule, and
/// raises a finding only when the records hold what that rule needs. Pure: it reads, and changes nothing.

enum ReviewSource {
  records(
    'Record check: canon and continuity rules',
    '/review/records',
    'what the structured records say about each other',
  ),
  integrity(
    'Record check: references, values, duplicates',
    '/review/records',
    'references to deleted records, fields that name nothing, values that do not fit, records that look alike',
  ),
  timeline('Timeline review', '/review/timeline', 'dates, ages, travel times, being in two places at once'),
  canon('Canon', '/review/canon', 'canon statements that may disagree, with each other or with a codex field'),
  knowledge(
    'Secrets and knowledge',
    '/visualize/knowledge',
    'characters acting on, or learning, what they are recorded as not knowing',
  ),
  travel('Journeys', '/visualize/journeys', 'journeys against their dates, speeds and each other'),
  abilities('Ability paths', '/visualize/abilities', 'requirements, exclusions and loops between abilities'),
  continuity(
    'Continuity check of the manuscript',
    '/review/continuity',
    'the text against tracked rules and codex fields, matched by words',
  );

  const ReviewSource(this.label, this.page, this.what);
  final String label;
  final String page;
  final String what;
}

/// The difference the review keeps: a confirmed data error, or a possible inconsistency.
enum Certainty {
  error(
    'Confirmed data error',
    'The records, as stored, cannot all be right: a value that is impossible or names nothing, or records that '
        'certainly contradict each other. Whether the story should change is still yours to decide.',
  ),
  possible(
    'Possible inconsistency',
    'Read from wording or likeness, or something that may well be meant. The records may agree after all.',
  );

  const Certainty(this.label, this.hint);
  final String label;
  final String hint;
}

enum ReviewCategory {
  canon('Canon status and statements'),
  characters('Characters and their status'),
  dates('Dates and time'),
  connections('Connections and relationships'),
  places('Places and travel'),
  items('Items and possession'),
  abilities('Abilities and powers'),
  knowledge('Secrets and knowledge'),
  references('References and links'),
  fieldValues('Values and fields'),
  duplicates('Records that look alike');

  const ReviewCategory(this.label);
  final String label;

  /// The original app's name for it (`values` for [fieldValues]).
  String get key => this == fieldValues ? 'values' : name;
}

/// A place to open: a route of this app.
typedef ReviewLink = ({String label, String path});

/// Where to see a warning in a visualization, with the canon and continuity marks on and its record selected.
typedef ReviewContext = ({String label, String path, EntityRef? select});

class Warning {
  Warning({
    required this.key,
    required this.source,
    required this.severity,
    required this.certainty,
    required this.category,
    required this.title,
    required this.rule,
    required this.message,
    required this.because,
    required this.refs,
    required this.links,
    required this.context,
  });

  /// The finding's own key: its decision is kept under it, and its own page reads the same one.
  final String key;
  final ReviewSource source;
  final Severity severity;
  final Certainty certainty;
  final ReviewCategory category;
  final String title;

  /// The rule, in words.
  final String rule;
  final String message;

  /// The data it rests on, in words.
  final String because;

  /// The records it is about, to open.
  final List<EntityRef> refs;
  final List<ReviewLink> links;
  final ReviewContext? context;

  JsonMap toJson() => {
    'key': key,
    'source': source.name,
    'severity': severity.name,
    'certainty': certainty.name,
    'category': category.key,
    'title': title,
    'rule': rule,
    'message': message,
    'because': because,
    'refs': [for (final r in refs) r.toJson()],
    'links': [
      for (final l in links) {'label': l.label, 'to': l.path},
    ],
    'context': context == null ? null : {'label': context!.label, 'to': context!.path},
  };
}

class ReviewInput {
  ReviewInput({
    required this.model,
    this.facts = const [],
    this.rules = const [],
    this.markers = const [],
    this.aliases = const {},
    this.secrets = const [],
    this.travel,
    this.maps = const [],
    this.pins = const [],
    this.snapshots = const [],
    this.manuscript,
  });
  final StoryModel model;
  final List<CanonFact> facts;
  final List<ContinuityRule> rules;
  final List<JsonMap> markers;

  /// Aliases from character profiles, for look-alike names.
  final Map<String, List<String>> aliases;
  final List<CharacterSecret> secrets;
  final TravelSettings? travel;
  final List<WorldMap> maps;
  final List<MapPin> pins;
  final List<ProgressSnapshot> snapshots;

  /// Every finding of the manuscript check, decided or not; null while it has not run.
  final List<Issue>? manuscript;
}

const _recordCategory = {
  RecordRule.restsOn: ReviewCategory.canon,
  RecordRule.stillTold: ReviewCategory.canon,
  RecordRule.opposed: ReviewCategory.connections,
  RecordRule.afterDeath: ReviewCategory.characters,
  RecordRule.endsFirst: ReviewCategory.dates,
  RecordRule.calendar: ReviewCategory.dates,
  RecordRule.gone: ReviewCategory.references,
  RecordRule.replacement: ReviewCategory.canon,
};
const _timelineCategory = {
  ReviewRule.dates: ReviewCategory.dates,
  ReviewRule.follows: ReviewCategory.dates,
  ReviewRule.anchor: ReviewCategory.references,
  ReviewRule.calendar: ReviewCategory.dates,
  ReviewRule.ages: ReviewCategory.characters,
  ReviewRule.born: ReviewCategory.characters,
  ReviewRule.travel: ReviewCategory.places,
  ReviewRule.twoPlaces: ReviewCategory.places,
};
const _issueCategory = {
  'status': ReviewCategory.characters,
  'possession': ReviewCategory.items,
  'travel': ReviewCategory.places,
  'power': ReviewCategory.abilities,
  'trait': ReviewCategory.characters,
};
const travelRules = {
  'backwards': (title: 'Arrives before leaving', rule: 'A journey cannot arrive before it leaves.'),
  'too-fast': (
    title: 'Too fast for its dates',
    rule: 'At the speed you set for the way they travel, the distance takes at least so long; the dates must allow it.',
  ),
  'duration': (
    title: 'A length its dates or speed cannot hold',
    rule: 'How long a journey is said to take must fit its dates, and its speed.',
  ),
  'order': (
    title: 'Leaves before the journey it comes after',
    rule: 'A journey set to come after another cannot leave before that one.',
  ),
  'two-journeys': (title: 'Two journeys at once', rule: 'One traveller cannot be on two journeys at the same time.'),
  'event-during': (
    title: 'At an event elsewhere while travelling',
    rule:
        'A traveller cannot take part in an event elsewhere (not on the way, or inside a place on it) during a journey.',
  ),
  'two-places': (
    title: 'In two places over the same time',
    rule:
        'Located in two places over the same time, neither inside the other, needs an explanation the records may not '
        'give.',
  ),
  'departure': (
    title: 'Leaves from somewhere else',
    rule: 'A traveller usually leaves from where they last arrived; otherwise a journey may be missing.',
  ),
  'elsewhere': (
    title: 'At an event elsewhere between journeys',
    rule: 'While staying somewhere between journeys, an event elsewhere suggests a journey may be missing.',
  ),
};
const pathRules = {
  ProblemKind.cycle: (
    title: 'Requirements in a cycle',
    rule:
        'An ability cannot require itself, through others or directly; blueprint items cannot branch from each other in '
        'a loop.',
  ),
  ProblemKind.loop: (
    title: 'A loop of changes',
    rule:
        'A loop of upgrades, evolutions, fusions or replacements may be meant (a form taken and left again); it is said '
        'so it is not missed.',
  ),
  ProblemKind.conflict: (
    title: 'Requires what is excluded',
    rule: 'An ability cannot require two things that exclude each other, or something it excludes.',
  ),
  ProblemKind.unreachable: (
    title: 'Can never be gained',
    rule: 'An ability whose requirements can never be met, with no alternative that can, can never be gained.',
  ),
  ProblemKind.fusion: (
    title: 'A fusion of one thing',
    rule: 'A fusion joins several abilities into one; one alone may be a slip.',
  ),
  ProblemKind.rule: (title: 'A rule that cannot be read', rule: 'A requirement rule must name things the system has.'),
  ProblemKind.holder: (
    title: 'A holder without what it requires',
    rule:
        'A holder should hold what an ability requires, or two things that exclude each other, unless it became this '
        'one (upgraded, evolved…).',
  ),
};
const _viewWords = {
  'timeline': 'timeline',
  'relationships': 'relationship map',
  'plot': 'plot board',
  'graph': 'knowledge graph',
};

List<Warning> collectWarnings(ReviewInput input) {
  final model = input.model;
  final out = <Warning>[];
  bool found(EntityRef ref) => model.resolve(ref) != null;
  List<EntityRef> refsOf(List<EntityRef> refs) {
    final seen = <String>{};
    return [
      for (final r in refs)
        if (found(r) && seen.add('${r.type.name}:${r.id}')) r,
    ];
  }

  /// The view that shows a record best, with its marks on and the record selected.
  ReviewContext? contextFor(List<EntityRef> refs) {
    final pick =
        refs.where((r) => r.type == EntityType.event).firstOrNull ??
        refs.where((r) => r.type == EntityType.relation).firstOrNull ??
        refs.where((r) => r.type == EntityType.entry || r.type == EntityType.node).firstOrNull ??
        refs.where((r) => r.type == EntityType.thread).firstOrNull;
    if (pick == null) return null;
    final view = switch (pick.type) {
      EntityType.event => 'timeline',
      EntityType.relation => 'relationships',
      EntityType.thread => 'plot',
      _ => 'graph',
    };
    return (
      label: 'See it on the ${_viewWords[view]}',
      path: view == 'relationships' ? '/visualize' : '/visualize/$view',
      select: pick,
    );
  }

  void add({
    required String key,
    required ReviewSource source,
    required Severity severity,
    required Certainty certainty,
    required ReviewCategory category,
    required String title,
    required String rule,
    required String message,
    required String because,
    required List<EntityRef> refs,
    List<ReviewLink> links = const [],
    ReviewContext? Function(List<EntityRef> refs)? context,
  }) {
    final kept = refsOf(refs);
    out.add(
      Warning(
        key: key,
        source: source,
        severity: severity,
        certainty: certainty,
        category: category,
        title: title,
        rule: rule,
        message: message,
        because: because,
        refs: kept,
        links: links,
        context: context != null ? context(kept) : contextFor(kept),
      ),
    );
  }

  // The record check: canon and continuity rules.
  for (final f in checkRecords(model, facts: input.facts, rules: input.rules)) {
    final facts = [
      for (final k in f.on)
        if (k.startsWith('fact:')) k.substring(5),
    ];
    add(
      key: f.key,
      source: ReviewSource.records,
      severity: f.severity,
      certainty: Certainty.error,
      category: _recordCategory[f.rule]!,
      title: f.rule.title,
      rule: f.rule.rule,
      message: f.message,
      because: f.because,
      refs: f.refs,
      links: [
        for (final id in facts) (label: 'Open the canon statement', path: '/review/canon?fact=$id'),
        if (f.rule == RecordRule.afterDeath) (label: 'Open the tracked status', path: '/review/continuity?tab=tracked'),
      ],
    );
  }

  // The record check: references, values, look-alikes.
  List<EntityRef> holder(String table, String rowId) {
    switch (table) {
      case 'timelineEvents':
        return [EntityRef(EntityType.event, rowId)];
      case 'plotThreads':
        return [EntityRef(EntityType.thread, rowId)];
      case 'chapterPlans' || 'chapters':
        return [EntityRef(EntityType.node, rowId)];
      case 'loreEntries':
        return [EntityRef(EntityType.entry, rowId)];
      case 'characterRelations':
        return [EntityRef(EntityType.relation, rowId)];
      case 'loreLinks':
        final link = model.links.where((l) => l.id == rowId).firstOrNull;
        return link == null ? const [] : [link.from, link.to];
      case 'progressChanges':
        final owner = model.progress.where((c) => c.id == rowId).firstOrNull?.entryId;
        return owner == null ? const [] : [EntityRef(EntityType.entry, owner)];
      case 'journeys':
        return [
          for (final id in model.journeys.where((j) => j.id == rowId).firstOrNull?.travellerIds ?? const <String>[])
            EntityRef(EntityType.entry, id),
        ];
    }
    return const [];
  }

  String kindWords(EntityType t) => switch (t) {
    EntityType.node => 'chapter or scene',
    EntityType.entry => 'codex entry',
    _ => t.name,
  };
  for (final b in brokenReferences(model, input.markers)) {
    add(
      key: b.key,
      source: ReviewSource.integrity,
      severity: Severity.warning,
      certainty: Certainty.error,
      category: ReviewCategory.references,
      title: 'A reference to a record that no longer exists',
      rule: 'A reference must name a record that exists.',
      message: '${b.says}.',
      because: 'Kept in ${b.where}; the ${kindWords(b.missing.type)} it names has been deleted.',
      refs: holder(b.table, b.rowId),
      links: [if (b.table == 'structureMarkers') (label: 'Open the structural markers', path: '/visualize/structure')],
    );
  }
  for (final u in unresolvedFields(model)) {
    add(
      key: u.key,
      source: ReviewSource.integrity,
      severity: Severity.warning,
      certainty: Certainty.error,
      category: ReviewCategory.references,
      title: 'A field that names nothing',
      rule: 'A field that refers to an entry (“Leader”, “Owner”) must hold an entry, not words.',
      message: '${u.entry.name}: “${u.fieldName}” holds the words “${u.value}”, not an entry.',
      because: u.suggestions.isNotEmpty
          ? 'Entries with that name: ${u.suggestions.map((s) => s.name).join(', ')}.'
          : 'No entry has that name.',
      refs: [EntityRef(EntityType.entry, u.entry.id)],
    );
  }
  for (final u in unfitEntries(model)) {
    add(
      key: u.key,
      source: ReviewSource.integrity,
      severity: Severity.warning,
      certainty: Certainty.error,
      category: ReviewCategory.fieldValues,
      title: 'Values that do not fit their fields',
      rule:
          'Each value fits its field: a required field is filled in, a number is in its range, a date is a date, a '
          'choice is one of the choices, a link names an entry of its kind.',
      message:
          '${u.entry.name}: ${u.issues.length == 1 ? 'a value does' : '${u.issues.length} values do'} not fit '
          '${u.issues.length == 1 ? 'its field' : 'their fields'}.',
      because: u.issues.map((i) => '${i.field}: ${i.message}').join(' '),
      refs: [EntityRef(EntityType.entry, u.entry.id)],
    );
  }
  for (final u in unsuitedKinds(model)) {
    add(
      key: u.key,
      source: ReviewSource.integrity,
      severity: Severity.info,
      certainty: Certainty.error,
      category: ReviewCategory.fieldValues,
      title: 'A view set up on fields that no longer suit',
      rule:
          'A view a kind of record is set up for names fields that can fill it: still there, not archived, of a type '
          'the view reads.',
      message:
          '${u.category.name}: ${u.problems.length == 1 ? 'a view setting no longer suits' : '${u.problems.length} view settings no longer suit'}.',
      because: u.problems.join(' '),
      refs: const [],
      links: [(label: 'Open Categories & fields', path: '/organize/world/kinds')],
      context: (_) => null,
    );
  }
  for (final d in duplicateCandidates([...model.entries.values], input.aliases)) {
    add(
      key: d.key,
      source: ReviewSource.integrity,
      severity: Severity.info,
      certainty: Certainty.possible,
      category: ReviewCategory.duplicates,
      title: 'Records that look like duplicates',
      rule:
          'Two entries of the same kind whose names are the same once capitals, accents, punctuation and a leading '
          '“The” are set aside, or one named as the other’s alias.',
      message: '${d.a.name} and ${d.b.name} may be the same.',
      because: d.because,
      refs: [EntityRef(EntityType.entry, d.a.id), EntityRef(EntityType.entry, d.b.id)],
    );
  }

  // The timeline review.
  for (final f in reviewTimeline(model, [for (final r in input.rules) r.raw])) {
    add(
      key: f.key,
      source: ReviewSource.timeline,
      severity: Severity.warning,
      certainty: Certainty.error,
      category: _timelineCategory[f.rule]!,
      title: f.rule.title,
      rule: f.rule.rule,
      message: f.message,
      because: f.because,
      refs: [
        for (final id in f.eventIds) EntityRef(EntityType.event, id),
        for (final id in f.entryIds) EntityRef(EntityType.entry, id),
      ],
      links: [if (f.ruleId != null) (label: 'Open the travel time', path: '/review/continuity?tab=tracked')],
    );
  }

  // Canon statements: as the canon review flags them.
  final canon = reviewCanon(
    input.facts,
    [...model.entries.values],
    [...model.nodes.values],
    (k) => model.categories[k],
  );
  for (final review in canon.reviews) {
    final fact = review.fact;
    final sources = [
      for (final s in fact.factSources)
        if (s.refId != null)
          ?switch (s.type) {
            'chapter' => EntityRef(EntityType.node, s.refId!),
            'event' => EntityRef(EntityType.event, s.refId!),
            'entry' => EntityRef(EntityType.entry, s.refId!),
            _ => null,
          },
    ];
    for (final flag in review.flags) {
      // Linked by the author as contradicting, or marked Conflicting with nothing paired: confirmed. Noticed from
      // wording: possible.
      final stated = flag.kind == 'unpaired' || (flag.kind == 'fact' && flag.dismiss == null);
      add(
        key: canonKey(fact.id, flag.key),
        source: ReviewSource.canon,
        severity: flag.kind == 'unpaired' ? Severity.info : Severity.warning,
        certainty: stated ? Certainty.error : Certainty.possible,
        category: ReviewCategory.canon,
        title: flag.kind == 'unpaired'
            ? 'Conflicting, with nothing paired'
            : flag.kind == 'field'
            ? 'A statement that may differ from a codex field'
            : stated
            ? 'Statements you linked as contradicting'
            : 'Statements that may disagree',
        rule: flag.kind == 'unpaired'
            ? 'A statement marked Conflicting contradicts another, so the other one is linked, or noticed.'
            : 'Statements in play about the same subject should agree with each other and with the codex field they '
                  'name. Only you decide which one stands.',
        message: flag.message,
        because:
            'The ${fact.status.label.toLowerCase()} statement “${fact.subject.trim().isNotEmpty ? '${fact.subject.trim()}: ' : ''}'
            '${fact.statement.trim()}”.',
        refs: [for (final id in fact.entryIds) EntityRef(EntityType.entry, id), ...sources],
        links: [(label: 'Open the statement', path: '/review/canon?fact=${fact.id}')],
      );
    }
  }

  // Secrets and knowledge.
  for (final f in checkKnowledge(input.secrets, model)) {
    add(
      key: f.key,
      source: ReviewSource.knowledge,
      severity: Severity.warning,
      certainty: Certainty.error,
      category: ReviewCategory.knowledge,
      title: f.rule.title,
      rule: f.rule.rule,
      message: f.message,
      because: f.because,
      refs: [EntityRef(EntityType.entry, f.ownerId), for (final id in f.characterIds) EntityRef(EntityType.entry, id)],
      links: [
        if (model.entries[f.ownerId] case final owner?)
          (label: 'Open ${owner.name}’s secrets', path: '/organize/character/${f.ownerId}?tab=secrets'),
      ],
      context: (_) =>
          (label: 'See it in Secrets and knowledge', path: '/visualize/knowledge?secret=${f.secretId}', select: null),
    );
  }

  // Journeys.
  for (final p in travelProblems(model, model.journeys, input.travel, input.maps, input.pins)) {
    final travellers = {
      for (final id in p.journeyIds) ...?model.journeys.where((j) => j.id == id).firstOrNull?.travellerIds,
    };
    add(
      key: p.key,
      source: ReviewSource.travel,
      severity: p.severity == 'problem' ? Severity.warning : Severity.info,
      certainty: p.severity == 'problem' ? Certainty.error : Certainty.possible,
      category: ReviewCategory.places,
      title: travelRules[p.kind]!.title,
      rule: travelRules[p.kind]!.rule,
      message: p.message,
      because: p.severity == 'problem'
          ? 'The journeys’ own dates, places and speeds, taken at their most generous reading.'
          : 'The journeys and events as recorded; the story may explain it.',
      refs: [for (final id in travellers) EntityRef(EntityType.entry, id)],
      context: (_) => (label: 'See it in Journeys', path: '/visualize/journeys', select: null),
    );
  }

  // Ability paths.
  final tree = abilityTree(model, input.snapshots);
  final nodeRef = {for (final n in tree.nodes) n.key: n.ref};
  for (final p in pathProblems(tree, model)) {
    add(
      key: p.key,
      source: ReviewSource.abilities,
      severity: p.severity == 'problem' ? Severity.warning : Severity.info,
      certainty: p.severity == 'problem' ? Certainty.error : Certainty.possible,
      category: ReviewCategory.abilities,
      title: pathRules[p.kind]!.title,
      rule: pathRules[p.kind]!.rule,
      message: p.message,
      because: 'The paths recorded between these abilities.',
      refs: [for (final k in p.nodes) ?nodeRef[k]],
      context: (_) => (label: 'See it in Ability paths', path: '/visualize/abilities', select: null),
    );
  }

  // The manuscript, matched by words: always possible, never confirmed.
  for (final issue in input.manuscript ?? const <Issue>[]) {
    add(
      key: issue.key,
      source: ReviewSource.continuity,
      severity: issue.severity,
      certainty: Certainty.possible,
      category: _issueCategory[issue.category]!,
      title: issue.category == 'trait'
          ? 'The text and a codex field'
          : 'The text and a tracked rule: ${switch (issue.category) {
              'status' => 'character status',
              'possession' => 'item possession',
              'travel' => 'travel time',
              _ => 'power or magic',
            }}',
      rule: issue.category == 'trait' ? traitRule : ruleKindHints[issue.category]!,
      message: issue.message,
      because: '${issue.nodeTitle}, paragraph ${issue.block + 1}: “${issue.excerpt}”',
      refs: [
        EntityRef(EntityType.node, issue.nodeId),
        for (final id in issue.entryIds) EntityRef(EntityType.entry, id),
      ],
      links: [(label: 'Open the passage', path: '/write?node=${issue.nodeId}')],
    );
  }

  return out;
}

/// The author's decision about a warning, or none (`open`).
class ReviewedWarning {
  ReviewedWarning(this.warning, this.decision);
  final Warning warning;
  final ReviewItem? decision;

  /// `open`, or the decision's own word.
  String get status => decision?.decision.name ?? 'open';
}

/// Each warning with the author's decision about it, and the decisions whose warning is no longer raised (the records
/// changed since). Decisions about the manuscript are judged gone only once the manuscript has been checked.
({List<ReviewedWarning> items, List<ReviewItem> gone}) withStatus(
  List<Warning> warnings,
  List<ReviewItem> decisions, {
  required bool manuscriptChecked,
}) {
  final byKey = {for (final d in decisions) d.key: d};
  final keys = {for (final w in warnings) w.key};
  return (
    items: [for (final w in warnings) ReviewedWarning(w, byKey[w.key])],
    gone: [
      for (final d in decisions)
        if (!keys.contains(d.key) && (manuscriptChecked || otherChecks.any(d.key.startsWith))) d,
    ],
  );
}
