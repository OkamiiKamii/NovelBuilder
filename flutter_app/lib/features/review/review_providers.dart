import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/canon/canon_changes.dart';
import '../../shared/domain/canon/checks.dart';
import '../../shared/domain/canon/overlay.dart';
import '../../shared/domain/canon/review.dart';
import '../../shared/domain/characters/character_records.dart' show CharacterSecret;
import '../../shared/domain/codex/codex_changes.dart' show ChangeRefused;
import '../../shared/domain/continuity/audit.dart';
import '../../shared/domain/continuity/continuity_changes.dart';
import '../../shared/domain/continuity/rules.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/places/places.dart';
import '../../shared/domain/progression/snapshots.dart' show ProgressSnapshot;
import '../../shared/domain/records/canon.dart';
import '../../shared/domain/records/review.dart';
import '../../shared/domain/review/collect.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../../shared/domain/timeline/review.dart';
import '../../shared/domain/travel/travel.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import 'record_check_page.dart' show integrityServiceProvider;

/// Everything the continuity review reads, gathered once for a version of the novel: the shared model, canon
/// statements, tracked rules, the author's decisions, secrets, journeys' settings, and the manuscript check. Reads
/// only.
class ReviewData {
  ReviewData(this.novelId, this.snapshot, this.model, Map<String, Object?> docs)
    : facts = [for (final r in snapshot.rows('canonFacts')) CanonFact(r)],
      rules = [for (final r in snapshot.rows('continuityRules')) ContinuityRule(r)]
        ..sort((a, b) {
          final c = a.createdAt.compareTo(b.createdAt);
          return c != 0 ? c : a.id.compareTo(b.id);
        }),
      decisions = [for (final r in snapshot.rows('continuityResolutions')) ReviewItem(r)],
      secrets = [for (final r in snapshot.rows('characterSecrets')) CharacterSecret(r)] {
    manuscript = audit(model, docs, rules, decisions);
  }

  final String novelId;
  final NovelSnapshot snapshot;
  final StoryModel model;
  final List<CanonFact> facts;
  final List<ContinuityRule> rules;
  final List<ReviewItem> decisions;
  final List<CharacterSecret> secrets;
  late final AuditResult manuscript;

  late final records = checkRecords(model, facts: facts, rules: rules);
  late final canon = reviewCanon(facts, [...model.entries.values], [...model.nodes.values], (k) => model.categories[k]);
  late final timeline = reviewTimeline(model, [for (final r in rules) r.raw]);

  late final List<Warning> warnings = collectWarnings(
    ReviewInput(
      model: model,
      facts: facts,
      rules: rules,
      markers: snapshot.rows('structureMarkers'),
      aliases: {for (final p in snapshot.rows('characterProfiles')) str(p['entryId']): strings(p['aliases'])},
      secrets: secrets,
      travel: snapshot.rows('travelSettings').map(TravelSettings.new).firstOrNull,
      maps: [for (final r in snapshot.rows('worldMaps')) WorldMap(r)],
      pins: [for (final r in snapshot.rows('mapPins')) MapPin(r)],
      snapshots: [for (final r in snapshot.rows('progressSnapshots')) ProgressSnapshot(r)],
      manuscript: manuscript.all,
    ),
  );

  late final status = withStatus(warnings, decisions, manuscriptChecked: true);

  /// The decision about a finding, when there is one.
  ReviewItem? decisionOf(String key) => decisions.where((d) => d.key == key).firstOrNull;

  bool _open(String key) => !(decisionOf(key)?.decision.closes ?? false);

  /// The canon and continuity marks to lay over the views: only what is still open.
  late final Map<String, OverlayMark> overlay = canonOverlay(
    model,
    records: [
      for (final f in records)
        if (_open(f.key)) f,
    ],
    timeline: [
      for (final f in timeline)
        if (_open(f.key)) f,
    ],
    canon: [
      for (final r in canon.reviews)
        FactReview(r.fact, [
          for (final f in r.flags)
            if (_open(canonKey(r.fact.id, f.key))) f,
        ]),
    ],
    continuity: manuscript.open,
  );
}

/// The review of the open novel, read again whenever the novel changes (the cast is re-read on every change, the
/// manuscript text with it).
final reviewDataProvider = Provider.autoDispose<ReviewData?>((ref) {
  final cast = ref.watch(castProvider);
  if (cast == null) return null;
  final store = ref.watch(novelStoreProvider);
  final docs = {for (final r in store.rowsIn(cast.novelId, 'chapterContents')) str(r['id']): r['doc']};
  return ReviewData(cast.novelId, cast.snapshot, cast.model, docs);
});

/// Canon statements and tracked rules: every change one transaction, made on the records as stored at that moment and
/// refused if they changed elsewhere since.
class CanonService {
  CanonService(this.store, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final DateTime Function() _clock;
  final String Function() _createId;

  T _change<C extends Object, T>(
    String projectId,
    C Function(NovelSnapshot s, int now) make,
    NovelSnapshot Function(C c) after,
    T Function(C c) apply,
  ) {
    final before =
        store.loadPart(projectId, canonCollections) ?? (throw StateError('That novel is no longer in the library.'));
    final now = _clock().millisecondsSinceEpoch;
    final changes = make(before, now);
    final result = apply(changes);
    store.saveChanges(before, after(changes).copyWith(project: {...before.project, 'updatedAt': now}));
    return result;
  }

  T canon<T>(String projectId, T Function(CanonChanges c) apply) =>
      _change(projectId, (s, now) => CanonChanges(s, now: now, createId: _createId), (c) => c.snapshot, apply);

  T rules<T>(String projectId, T Function(ContinuityChanges c) apply) =>
      _change(projectId, (s, now) => ContinuityChanges(s, now: now, createId: _createId), (c) => c.snapshot, apply);
}

final canonServiceProvider = Provider<CanonService>((ref) => CanonService(ref.watch(novelStoreProvider)));

/// Changes to canon, tracked rules and decisions from a screen, beside everything a character screen can do.
class ReviewActions extends CharacterActions {
  ReviewActions(super.context, super.novelId);

  CanonService get canonService => container.read(canonServiceProvider);

  T? _try<T>(T Function() run) {
    try {
      return run();
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  T? canon<T>(T Function(CanonChanges c) apply) => _try(() => canonService.canon(novelId, apply));
  T? rules<T>(T Function(ContinuityChanges c) apply) => _try(() => canonService.rules(novelId, apply));

  /// Saves typing through autosave, under [key]: the newest text replaces a waiting save.
  void canonLater(String key, void Function(CanonChanges c) apply) {
    final s = canonService;
    container.read(saveControllerProvider).schedule('canon:$novelId:$key', () {
      try {
        s.canon(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  void rulesLater(String key, void Function(ContinuityChanges c) apply) {
    final s = canonService;
    container.read(saveControllerProvider).schedule('rules:$novelId:$key', () {
      try {
        s.rules(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  /// Keeps the author's decision about a finding, replacing any earlier one. Nothing else changes.
  bool decide(String key, String message, ReviewDecision kind, {String note = '', String? nodeId}) =>
      _try(() {
        container.read(integrityServiceProvider).decide(novelId, key, message, kind, note: note, nodeId: nodeId);
        return true;
      }) ??
      false;

  /// Withdraws a decision, so the finding is raised again if it still applies.
  void reopen(String decisionId) {
    _try(() {
      container.read(integrityServiceProvider).reopen(novelId, decisionId);
      return true;
    });
  }
}
