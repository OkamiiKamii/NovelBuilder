import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart' show ChangeRefused;
import '../../shared/domain/ids.dart';
import '../../shared/domain/places/place_changes.dart';
import '../../shared/domain/places/places.dart';
import '../../shared/domain/records/journey.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../../shared/domain/travel/travel.dart';
import '../characters/character_actions.dart';

/// Levels of place, maps and pins, journeys and travel methods: every change one transaction, made on the records as
/// stored at that moment and refused if they changed elsewhere since.
class PlacesService {
  PlacesService(this.store, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final DateTime Function() _clock;
  final String Function() _createId;

  T change<T>(String projectId, T Function(PlaceChanges c) apply) {
    final before =
        store.loadPart(projectId, placeCollections) ?? (throw StateError('That novel is no longer in the library.'));
    final now = _clock().millisecondsSinceEpoch;
    final changes = PlaceChanges(before, now: now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': now}));
    return result;
  }
}

final placesServiceProvider = Provider<PlacesService>((ref) => PlacesService(ref.watch(novelStoreProvider)));

/// What the place and travel views read from the open novel, beside the shared model.
class PlaceData {
  PlaceData(NovelSnapshot s)
    : settings = s.rows('placeSettings').map(PlaceSettings.new).firstOrNull,
      maps = [for (final r in s.rows('worldMaps')) WorldMap(r)],
      pins = [for (final r in s.rows('mapPins')) MapPin(r)],
      travel = s.rows('travelSettings').map(TravelSettings.new).firstOrNull,
      journeys = [for (final r in s.rows('journeys')) Journey(r)];

  final PlaceSettings? settings;
  final List<WorldMap> maps;
  final List<MapPin> pins;
  final TravelSettings? travel;
  final List<Journey> journeys;
}

/// Changes to places and journeys from a screen, beside everything a character screen can do.
class PlaceActions extends CharacterActions {
  PlaceActions(super.context, super.novelId);

  PlacesService get placesService => container.read(placesServiceProvider);

  T? places<T>(T Function(PlaceChanges c) apply) {
    try {
      return placesService.change(novelId, apply);
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  /// Saves typing through autosave, under [key]: the newest text replaces a waiting save.
  void placesLater(String key, void Function(PlaceChanges c) apply) {
    final s = placesService;
    container.read(saveControllerProvider).schedule('places:$novelId:$key', () {
      try {
        s.change(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }
}
