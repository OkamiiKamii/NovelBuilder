import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/ids.dart';
import '../domain/json.dart';
import '../domain/modules/module_defs.dart';
import '../domain/stable_sort.dart';
import 'providers.dart';
import 'settings_store.dart';

const _key = 'modules.library';

/// The author's own modules, built from a novel or received as files (as in the original app's module library). They
/// belong to the author, not to a novel, so they are kept with the app's settings on this device. A novel that has one
/// turned on keeps its own copy, so taking it out of the library changes no novel.
class ModuleLibrary {
  ModuleLibrary(this.settings, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final SettingsStore settings;
  final DateTime Function() _clock;

  /// The author's modules, oldest first.
  List<ModuleDefinition> saved() => [
    for (final r in stableSorted(maps(settings.read(_key)), (a, b) => _at(a).compareTo(_at(b))))
      if (mapOrNull(r['definition']) case final d?) ModuleDefinition(d),
  ];

  static num _at(JsonMap r) => numOrNull(r['createdAt']) ?? 0;

  /// Every module that can be turned on: the built-in ones, then the author's.
  List<ModuleDefinition> available() => [...builtinModules, ...saved()];

  /// Keeps a module in the library, replacing an earlier version of the same module.
  ModuleDefinition save(ModuleDefinition definition) {
    final clean = parseDefinition(definition.raw, newId: newId);
    final rows = maps(settings.read(_key));
    final earlier = rows.where((r) => r['id'] == clean.id).firstOrNull;
    settings.write(_key, [
      for (final r in rows)
        if (r['id'] != clean.id) r,
      {'id': clean.id, 'definition': clean.raw, 'createdAt': earlier?['createdAt'] ?? _clock().millisecondsSinceEpoch},
    ]);
    return clean;
  }

  void remove(String moduleId) => settings.write(_key, [
    for (final r in maps(settings.read(_key)))
      if (r['id'] != moduleId) r,
  ]);
}

final moduleLibraryProvider = Provider<ModuleLibrary>((ref) => ModuleLibrary(ref.watch(settingsStoreProvider)));

/// Every module that can be turned on, read again after each change made through [ModulesNotifier].
class ModulesNotifier extends Notifier<List<ModuleDefinition>> {
  @override
  List<ModuleDefinition> build() => ref.watch(moduleLibraryProvider).available();

  ModuleDefinition save(ModuleDefinition definition) {
    final saved = ref.read(moduleLibraryProvider).save(definition);
    state = ref.read(moduleLibraryProvider).available();
    return saved;
  }

  void remove(String moduleId) {
    ref.read(moduleLibraryProvider).remove(moduleId);
    state = ref.read(moduleLibraryProvider).available();
  }
}

final availableModulesProvider = NotifierProvider<ModulesNotifier, List<ModuleDefinition>>(ModulesNotifier.new);
