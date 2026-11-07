import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../shared/data/providers.dart';
import '../../shared/data/template_store.dart';
import '../../shared/domain/codex/world_presets.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/characters_providers.dart';
import '../workspace/open_novel.dart';
import '../write/write_providers.dart';
import 'novel_form.dart';

/// What an action needs after its own widget may be gone (a deleted novel's card): the app's providers, its
/// navigator and its messages, taken when the action starts.
class _Scope {
  _Scope(BuildContext context)
    : container = ProviderScope.containerOf(context, listen: false),
      router = GoRouter.of(context),
      messenger = ScaffoldMessenger.of(context);

  final ProviderContainer container;
  final GoRouter router;
  final ScaffoldMessengerState messenger;

  void tell(String message, {String? actionLabel, VoidCallback? onAction}) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        action: actionLabel == null ? null : SnackBarAction(label: actionLabel, onPressed: onAction!),
        // A message with Undo or Open still goes away on its own, so it never sits over the page.
        persist: false,
        duration: const Duration(seconds: 6),
      ),
    );

  /// Runs a library change; a failure is said plainly and nothing is reported as done.
  bool attempt(String what, void Function() change) {
    try {
      change();
      return true;
    } on Object catch (e) {
      tell('$what failed, and nothing was changed: $e');
      return false;
    }
  }

  void open(Novel novel) {
    container.read(openNovelProvider.notifier).open(novel.id);
    router.go(Destination.write.path);
  }
}

void openNovel(BuildContext context, WidgetRef ref, Novel novel) => _Scope(context).open(novel);

/// "Start writing it": an idea (planning, or on hold) becomes the book being written. Its status is set to Drafting
/// (Undo puts it back), and it opens on the page: at its first chapter or scene in reading order, or a first chapter
/// made for it when it has none, with the caret after the last word.
void startWritingFlow(BuildContext context, WidgetRef ref, Novel novel) {
  final scope = _Scope(context);
  final library = scope.container.read(libraryServiceProvider);
  final before = novel.status;
  if (!scope.attempt('Starting the book', () => library.setStatus(novel.id, NovelStatus.drafting))) return;
  final manuscript = scope.container.read(manuscriptServiceProvider);
  StoryNode? chapter = readingOrder(
    manuscript.nodes(novel.id),
  ).where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene).firstOrNull;
  if (chapter == null) {
    scope.attempt('Adding the first chapter', () => chapter = manuscript.create(novel.id, NodeKind.chapter));
  }
  scope.container.read(openNovelProvider.notifier).open(novel.id);
  if (chapter case final c?) {
    scope.container.read(selectedNodeProvider.notifier).select(c.id);
    scope.container.read(pendingCaretEndProvider.notifier).request(c.id);
  }
  scope.router.go(Destination.write.path);
  final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
  scope.tell(
    '“$title” is now being written (Drafting).',
    actionLabel: 'Undo',
    onAction: () => scope.attempt('Undoing', () => library.setStatus(novel.id, before)),
  );
}

/// "Continue writing": the novel open at the chapter it was left at, with the caret after the last word written.
void continueWritingFlow(BuildContext context, WidgetRef ref, Novel novel, StoryNode chapter) {
  final scope = _Scope(context);
  scope.container.read(openNovelProvider.notifier).open(novel.id);
  scope.container.read(selectedNodeProvider.notifier).select(chapter.id);
  scope.container.read(pendingCaretEndProvider.notifier).request(chapter.id);
  scope.router.go(Destination.write.path);
}

/// What the title page holds before anything is created.
typedef TitleDraft = ({String title, String author, String accent});

/// From the title page: the novel and its first chapter, created, and the chapter open to write in.
void beginNovelFlow(BuildContext context, WidgetRef ref, TitleDraft draft) {
  final scope = _Scope(context);
  late Novel created;
  if (!scope.attempt('Creating the novel', () {
    created = scope.container.read(libraryServiceProvider).create({
      'title': draft.title,
      'author': draft.author,
      'accent': draft.accent,
    });
  })) {
    return;
  }
  StoryNode? chapter;
  scope.attempt('Adding the first chapter', () {
    chapter = scope.container.read(manuscriptServiceProvider).create(created.id, NodeKind.chapter);
  });
  scope.container.read(openNovelProvider.notifier).open(created.id);
  if (chapter != null) scope.container.read(selectedNodeProvider.notifier).select(chapter!.id);
  scope.router.go(Destination.write.path);
}

/// The full form, for every detail; [draft] is what was already typed on the title page.
Future<void> createNovelFlow(BuildContext context, WidgetRef ref, {TitleDraft? draft}) async {
  final scope = _Scope(context);
  final saved = ref.read(templatesProvider);
  final templates = {
    for (final p in worldPresets) p.id: (name: p.name, builtin: true, categories: p.categories),
    for (final t in saved) t.id: (name: t.name, builtin: false, categories: t.categories),
  };
  final result = await showNovelForm(
    context,
    draft: draft == null ? null : Novel({'title': draft.title, 'author': draft.author, 'accent': draft.accent}),
    others: ref.read(libraryProvider),
    templates: [
      for (final MapEntry(:key, :value) in templates.entries) (id: key, name: value.name, builtin: value.builtin),
    ],
  );
  if (result == null) return;
  late Novel created;
  if (scope.attempt('Creating the novel', () {
    created = scope.container.read(libraryServiceProvider).create(result.details, setupFrom: result.setupFrom);
    // A template only ever adds categories and fields, after any setup copied from another novel.
    if (templates[result.templateId] case final t?) {
      scope.container.read(characterServiceProvider).change(created.id, (x) => x.addKinds(t.categories));
    }
  })) {
    scope.tell('Created “${created.title}”.', actionLabel: 'Open', onAction: () => scope.open(created));
  }
}

Future<void> editNovelFlow(BuildContext context, WidgetRef ref, Novel novel) async {
  final scope = _Scope(context);
  final result = await showNovelForm(context, editing: novel);
  if (result == null) return;
  final library = scope.container.read(libraryServiceProvider);
  // Saved through autosave, so a failure shows in the save status and is retried.
  scope.container
      .read(saveControllerProvider)
      .saveNow('novel:${novel.id}:details', () => library.updateDetails(novel.id, result.details));
}

void togglePinFlow(BuildContext context, WidgetRef ref, Novel novel) {
  final scope = _Scope(context);
  scope.attempt('Pinning', () => scope.container.read(libraryServiceProvider).setPinned(novel.id, !novel.pinned));
}

void toggleArchiveFlow(BuildContext context, WidgetRef ref, Novel novel) {
  final scope = _Scope(context);
  final library = scope.container.read(libraryServiceProvider);
  final archiving = !novel.archived;
  if (scope.attempt(archiving ? 'Archiving' : 'Restoring', () => library.setArchived(novel.id, archiving))) {
    scope.tell(
      archiving ? 'Archived “${novel.title}”. Nothing in it changed.' : 'Restored “${novel.title}” to the library.',
      actionLabel: 'Undo',
      onAction: () => scope.attempt('Undoing', () => library.setArchived(novel.id, !archiving)),
    );
  }
}

void duplicateNovelFlow(BuildContext context, WidgetRef ref, Novel novel) {
  final scope = _Scope(context);
  late Novel copy;
  if (scope.attempt('Duplicating', () => copy = scope.container.read(libraryServiceProvider).duplicate(novel.id))) {
    scope.tell('Made “${copy.title}”, a separate copy.', actionLabel: 'Open', onAction: () => scope.open(copy));
  }
}

Future<void> deleteNovelFlow(BuildContext context, WidgetRef ref, Novel novel) async {
  final scope = _Scope(context);
  final ok = await showConfirmDialog(
    context,
    title: 'Delete “${novel.title}”?',
    message:
        'The novel and everything in it are removed from the library. A restore point is kept first '
        '(Settings → Restore points), so it can be brought back.',
    confirmLabel: 'Delete',
    destructive: true,
  );
  if (!ok) return;
  final library = scope.container.read(libraryServiceProvider);
  late String kept;
  if (scope.attempt('Deleting', () => kept = library.delete(novel.id))) {
    scope.tell(
      'Deleted “${novel.title}”.',
      actionLabel: 'Undo',
      onAction: () => scope.attempt('Undoing', () => library.undoDelete(kept)),
    );
  }
}
