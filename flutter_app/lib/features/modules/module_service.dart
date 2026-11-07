import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/codex/field_values.dart';
import '../../shared/domain/collab/access.dart' show PermissionException;
import '../../shared/domain/collation.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/outline.dart' show isDocument;
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/modules/module_changes.dart';
import '../../shared/domain/modules/module_defs.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/snapshot/collections.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../collab/collab_providers.dart' show reviewMarkProvider;

/// Everything but the chapters' text: what modules read and change.
final _collections = {
  ...novelCollections.keys,
}.difference(const {'chapterContents', 'chapterRevisions', 'chapterBranches'});

/// Modules in a novel: every change one transaction, made on the records as stored at that moment.
class ModuleService {
  ModuleService(this.store, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  NovelSnapshot? read(String novelId) => store.loadPart(novelId, _collections);

  T change<T>(String novelId, T Function(ModuleChanges m) apply) {
    final before = read(novelId) ?? (throw StateError('That novel is no longer in the library.'));
    final changes = ModuleChanges(before, now: _now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }
}

final moduleServiceProvider = Provider<ModuleService>((ref) => ModuleService(ref.watch(novelStoreProvider)));

/// Makes a module change from a screen. A change that cannot be made as asked is said, and nothing is changed.
T? moduleChange<T>(BuildContext context, WidgetRef ref, String novelId, T Function(ModuleChanges m) apply) {
  final messenger = ScaffoldMessenger.of(context);
  void tell(String message) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
  try {
    return ref.read(moduleServiceProvider).change(novelId, apply);
  } on ChangeRefused catch (e) {
    tell(e.message);
  } on PermissionException catch (e) {
    tell(e.message);
  } on StaleWriteException catch (e) {
    tell('$e');
  }
  return null;
}

/// Whether the open novel can be changed here: a review copy is only read and commented on.
bool canChangeModules(WidgetRef ref) => ref.watch(reviewMarkProvider) == null;

/// Where a core page a module points at is in this app.
String? corePagePath(String to) => switch (to) {
  'systems' => '/organize/systems',
  'progression' => '/visualize/progression',
  'graph' => '/visualize/graph',
  'timeline' => '/plan',
  'relationships' => '/visualize',
  'plot' => '/plan/threads',
  'canon' => '/review/canon',
  'characters' => '/organize',
  'branches' => '/plan/histories',
  'continuity' => '/review/continuity',
  _ => null,
};

/// The address of the Module Manager, and of one module's workspace (its dashboard, or one of its tools).
const modulesPath = '/organize/modules';
String modulePath(String moduleId, {String? tool, String? record}) => Uri(
  path: '$modulesPath/${Uri.encodeComponent(moduleId)}',
  queryParameters: {'tool': ?tool, 'record': ?record},
).toString().replaceFirst(RegExp(r'\?$'), '');

/// Everything a module's tools read, in the terms modules use: categories and fields by name.
class ToolData {
  ToolData(this.novelId, this.snapshot, this.bindings) : model = StoryModel.fromSnapshot(snapshot) {
    final reading = readingOrder(model.nodes.values);
    final depth = <String, int>{};
    for (final n in reading) {
      depth[n.id] = n.parentId != null && depth.containsKey(n.parentId) ? depth[n.parentId]! + 1 : 0;
    }
    documents = [
      for (final n in reading)
        if (isDocument(n.kind)) (node: n, depth: depth[n.id]!),
    ];
    _position = {for (final (i, d) in documents.indexed) d.node.id: i};
  }

  final String novelId;
  final NovelSnapshot snapshot;
  final StoryModel model;
  final Bindings? bindings;

  /// Chapters and scenes in reading order.
  late final List<({StoryNode node, int depth})> documents;
  late final Map<String, int> _position;

  List<Category> get categories => [...model.categories.values];
  List<Entry> get entries => [...model.entries.values];
  List<JsonMap> get records => snapshot.rows('moduleRecords');

  /// A category by the name a module uses for it.
  Category? category(String name) => resolveCategory(name, categories, bindings);

  List<Entry> entriesOf(Category? category) => category == null
      ? const []
      : ([
          for (final e in model.entries.values)
            if (e.category == category.key) e,
        ]..sort((a, b) => localeCompare(a.name, b.name)));

  /// A field by the name a module uses for it. [as] is the module's name for the category.
  FieldDef? field(Category? category, String name, [String? as]) =>
      resolveField(as ?? category?.name ?? '', category, name, bindings);

  /// An entry's stored value for a field, as text.
  String raw(Entry entry, Category category, FieldDef def) =>
      viewFields(entry, category).category.where((slot) => slot.$1.id == def.id).firstOrNull?.$2?.value ?? '';

  /// The same, as a reader should see it.
  String shown(Entry entry, Category category, FieldDef def) =>
      displayValue(def.type, raw(entry, category, def), (id) => model.entries[id]?.name);

  /// Where a chapter or scene is in reading order: before everything when there is none, after everything when it is
  /// not a chapter or scene of this novel.
  int position(String? nodeId) => nodeId == null ? -1 : (_position[nodeId] ?? 1 << 52);
}
