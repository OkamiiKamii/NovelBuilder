import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/character_changes.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../write/write_providers.dart';
import 'characters_providers.dart';
import 'data/character_service.dart';

/// Where an entry of the world is: a character's profile, or its page under World.
String entryPath(String entryId, {required bool character}) =>
    character ? characterPath(entryId) : '/organize/world/entry/$entryId';

/// Where a character's profile is.
String characterPath(String entryId, {String? tab}) =>
    '/organize/character/$entryId${tab == null || tab == 'overview' ? '' : '?tab=$tab'}';

/// Changes to the open novel's characters and world (a character change covers the codex too), from a screen. What an
/// action needs after its widget may be gone (the profile of a character just deleted) is taken when it starts.
class CharacterActions {
  CharacterActions(BuildContext context, this.novelId)
    : container = ProviderScope.containerOf(context, listen: false),
      messenger = ScaffoldMessenger.of(context),
      router = GoRouter.of(context);

  final String novelId;
  final ProviderContainer container;
  final ScaffoldMessengerState messenger;
  final GoRouter router;

  CharacterService get service => container.read(characterServiceProvider);

  void tell(String message, {String? actionLabel, VoidCallback? onAction}) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        action: actionLabel == null ? null : SnackBarAction(label: actionLabel, onPressed: onAction!),
        persist: false,
        duration: const Duration(seconds: 6),
      ),
    );

  /// Makes a change now. A change that cannot be made as asked is said, and nothing is changed.
  T? now<T>(T Function(CharacterChanges c) apply) {
    try {
      return service.change(novelId, apply);
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  /// Saves typing through autosave, under [key] (what it changes): the newest text replaces a waiting save, the save
  /// status shows it, and it is written when the app is paused. A change that can never be made (the field was
  /// deleted meanwhile) is said once instead of being retried.
  void later(String key, void Function(CharacterChanges c) apply) {
    final service = this.service;
    container.read(saveControllerProvider).schedule('character:$novelId:$key', () {
      try {
        service.change(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  /// Saves anything typed that is still waiting, before leaving for another screen.
  void flush() => container.read(saveControllerProvider).flush();

  void openCharacter(String entryId, {String? tab}) => router.go(characterPath(entryId, tab: tab));

  /// Opens any entry where it lives: a character's profile, anything else under World.
  void openEntry(String entryId, {required bool character}) => router.go(entryPath(entryId, character: character));

  /// Opens a chapter or scene in the editor.
  void openChapter(String nodeId) {
    flush();
    container.read(selectedNodeProvider.notifier).select(nodeId);
    router.go('/write');
  }
}
