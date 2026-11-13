import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/book_faces.dart';
import '../../shared/data/background.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/storyboard.dart';
import '../workspace/open_novel.dart';
import 'in_chapter.dart';

/// THE STORYBOARD in the contents (`shared/domain/manuscript/storyboard.dart` says what is on each card): under every
/// chapter and scene, the line it opens on, the line it ends on, the faces of those on its pages and a rule as long as
/// it is against the longest. A reverse outline of the book, read from the text, one press from the list and back.

/// The setting that remembers it, on this device.
const storyboardKey = 'write.storyboard';

/// Whether the contents show the storyboard (else the plain list). Remembered on this device; it starts as the list.
class StoryboardOn extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(storyboardKey) == true;

  void set(bool on) {
    state = on;
    ref.read(settingsStoreProvider).write(storyboardKey, on);
  }
}

final storyboardOnProvider = NotifierProvider<StoryboardOn, bool>(StoryboardOn.new);

/// The open novel's cards by chapter or scene, and what the faces are drawn from.
typedef Storyboard = ({Map<String, StoryCard> cards, PageCompany? company});

/// The open novel's storyboard, read away from the screen whenever the text, the entries or the profiles change. Only
/// built while the storyboard is shown.
class StoryboardNotifier extends Notifier<Storyboard> {
  @override
  Storyboard build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return (cards: const {}, company: null);
    final store = ref.watch(novelStoreProvider);
    final run = ref.watch(runAsideProvider);
    var alive = true;
    String? readAt;
    var running = false;
    var again = false;
    var queued = false;

    String stamp() => [
      for (final c in const ['chapterContents', 'loreEntries', 'characterProfiles'])
        if (store.stampOf(novelId, c) case (:final count, :final latest)) '$count:$latest',
    ].join('|');

    void read() {
      if (!alive || !store.exists(novelId)) return;
      if (running) {
        again = true;
        return;
      }
      final now = stamp();
      if (now == readAt) return;
      readAt = now;
      running = true;
      final company = pageCompanyOf(store, novelId);
      run(storyboardJob(store.rawJsonIn(novelId, 'chapterContents'), company.names))
          .then(
            (cards) {
              if (alive && readAt == now) state = (cards: cards, company: company);
            },
            onError: (Object e, StackTrace s) =>
                FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'write')),
          )
          .whenComplete(() {
            running = false;
            if (again) {
              again = false;
              read();
            }
          });
    }

    void changed() {
      if (queued) return;
      queued = true;
      scheduleMicrotask(() {
        queued = false;
        read();
      });
    }

    store.addListener(changed);
    ref.onDispose(() {
      alive = false;
      store.removeListener(changed);
    });
    changed();
    return (cards: const {}, company: null);
  }
}

final storyboardProvider = NotifierProvider<StoryboardNotifier, Storyboard>(StoryboardNotifier.new);

/// A chapter's card under its line in the contents: how it opens, how it ends, who is there, and how long it runs.
class StoryLines extends StatelessWidget {
  const StoryLines({super.key, required this.card, required this.company, required this.share, required this.selected});

  final StoryCard? card;
  final PageCompany? company;

  /// Its length against the longest chapter's, 0 to 1.
  final double share;

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final faces = BookFaces.of(context);
    final card = this.card;
    final line = TextStyle(
      fontFamily: faces.text,
      fontStyle: FontStyle.italic,
      fontSize: 14.5,
      height: 1.3,
      color: scheme.onSurface.withValues(alpha: 0.82),
    );
    final label = TextStyle(
      fontFamily: faces.heading,
      fontSize: 9.5,
      letterSpacing: 1.3,
      fontWeight: FontWeight.w700,
      color: scheme.primary,
    );
    Widget said(String tag, String text) => Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(tag, style: label),
            ),
          ),
          Expanded(
            child: Text(text, style: line, maxLines: 3, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
    final present = [for (final id in card?.present ?? const <String>[]) ?company?.entries[id]];
    final empty = card == null || card.opening.isEmpty;
    return Padding(
      padding: const EdgeInsets.only(top: 2, bottom: 8, right: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (empty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Not begun.', style: line.copyWith(color: scheme.onSurfaceVariant)),
            )
          else ...[
            said('OPENS', card.opening),
            if (card.closing.isNotEmpty) said('ENDS', card.closing),
          ],
          if (present.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                // The faces overlapping, as a cast stands close in a photograph.
                SizedBox(
                  width: 22.0 * present.length + 6,
                  height: 28,
                  child: Stack(
                    children: [
                      for (final (i, e) in present.indexed)
                        Positioned(
                          left: i * 22.0,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: scheme.surface, width: 1.5),
                            ),
                            child: entryFace(
                              context,
                              entry: e,
                              profile: company?.profiles[e.id],
                              kind: company?.kinds[e.category],
                              size: 25,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    present.map((e) => e.name.trim()).join(', '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          // How long it runs, against the longest.
          LayoutBuilder(
            builder: (context, box) => Align(
              alignment: Alignment.centerLeft,
              child: Container(
                height: 3,
                width: (box.maxWidth * share.clamp(0.0, 1.0)).clamp(3.0, box.maxWidth),
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: selected ? 0.75 : 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
