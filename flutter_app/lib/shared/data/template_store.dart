import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/collation.dart';
import '../domain/ids.dart';
import '../domain/json.dart';
import '../domain/stable_sort.dart';
import 'providers.dart';
import 'settings_store.dart';

/// A set of categories and fields the author saved to start other novels from (as in the original app): one kind of
/// record, or every category of a novel. Templates belong to the author, not to a novel, so they are kept with the
/// app's settings on this device, not in any novel's file.
class SavedTemplate {
  SavedTemplate(this.raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get name => str(raw['name']);
  String get description => str(raw['description']);

  /// The categories it adds, as stored (fields, rules and view settings).
  List<JsonMap> get categories => [for (final c in maps(raw['categories'])) c];

  /// For one received as a file: whose it is, under what terms, which version (`{id, version, author, license,
  /// madeAt}`). Null for the author's own.
  JsonMap? get shared => mapOrNull(raw['shared']);
}

const _key = 'codex.templates';

class TemplateStore {
  TemplateStore(this.settings, {String Function()? createId, DateTime Function()? clock})
    : _createId = createId ?? newId,
      _clock = clock ?? DateTime.now;

  final SettingsStore settings;
  final String Function() _createId;
  final DateTime Function() _clock;

  /// Every template, by name.
  List<SavedTemplate> list() => stableSorted([
    for (final t in maps(settings.read(_key)))
      if (str(t['name']).isNotEmpty) SavedTemplate(t),
  ], (a, b) => localeCompare(a.name, b.name));

  SavedTemplate save(String name, String description, List<JsonMap> categories) {
    if (name.trim().isEmpty) throw ArgumentError('Give the template a name.');
    final template = {
      'id': _createId(),
      'name': name.trim(),
      'description': description.trim(),
      'categories': categories,
      'createdAt': _clock().millisecondsSinceEpoch,
    };
    settings.write(_key, [...maps(settings.read(_key)), template]);
    return SavedTemplate(template);
  }

  /// Keeps a template received as a file, with whose it is, its terms and its version. Any earlier version stays.
  SavedTemplate saveShared({
    required String name,
    required String description,
    required List<JsonMap> categories,
    required JsonMap shared,
  }) {
    final template = {
      'id': _createId(),
      'name': name.trim().isEmpty ? 'Untitled template' : name.trim(),
      'description': description.trim(),
      'categories': categories,
      'createdAt': _clock().millisecondsSinceEpoch,
      'shared': shared,
    };
    settings.write(_key, [...maps(settings.read(_key)), template]);
    return SavedTemplate(template);
  }

  void remove(String id) => settings.write(_key, [
    for (final t in maps(settings.read(_key)))
      if (t['id'] != id) t,
  ]);
}

final templateStoreProvider = Provider<TemplateStore>((ref) => TemplateStore(ref.watch(settingsStoreProvider)));

/// The author's templates, read again after each change made through [TemplatesNotifier].
class TemplatesNotifier extends Notifier<List<SavedTemplate>> {
  @override
  List<SavedTemplate> build() => ref.watch(templateStoreProvider).list();

  SavedTemplate save(String name, String description, List<JsonMap> categories) {
    final saved = ref.read(templateStoreProvider).save(name, description, categories);
    state = ref.read(templateStoreProvider).list();
    return saved;
  }

  SavedTemplate saveShared({
    required String name,
    required String description,
    required List<JsonMap> categories,
    required JsonMap shared,
  }) {
    final saved = ref
        .read(templateStoreProvider)
        .saveShared(name: name, description: description, categories: categories, shared: shared);
    state = ref.read(templateStoreProvider).list();
    return saved;
  }

  void remove(String id) {
    ref.read(templateStoreProvider).remove(id);
    state = ref.read(templateStoreProvider).list();
  }
}

final templatesProvider = NotifierProvider<TemplatesNotifier, List<SavedTemplate>>(TemplatesNotifier.new);
