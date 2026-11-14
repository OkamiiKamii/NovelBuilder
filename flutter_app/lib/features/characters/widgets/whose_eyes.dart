import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/characters/pov.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../write/write_providers.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// WHOSE EYES, a view of the cast (`pov.dart` reads it): the book as a ribbon, a band a chapter, as wide as it is
/// long, in the colour of the one it is told through (first person and unclear in their own). A band pressed says the
/// chapter, through whom, and the sentence that shows it, with **Read it there**. Then each one it is told through,
/// with their chapters and their share of the book; and what that means: the longest run through the same eyes, and
/// how long since each was last. It only reads.
class WhoseEyes extends ConsumerStatefulWidget {
  const WhoseEyes({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<WhoseEyes> createState() => _WhoseEyesState();
}

class _WhoseEyesState extends ConsumerState<WhoseEyes> {
  List<ChapterEyes>? _eyes;
  Object? _readFor;
  int? _picked;

  void _read() {
    final store = ref.read(novelStoreProvider);
    final novelId = widget.cast.novelId;
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final names = namesToFind(widget.cast.entries, widget.cast.profiles);
    final people = [
      for (final l in widget.cast.list)
        if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty)
          (id: l.entry.id, names: names[l.entry.id]!),
    ];
    final key = (
      [for (final n in nodes) '${n.id}:${n.wordCount}'].join(','),
      [for (final p in people) '${p.id}:${p.names.join('|')}'].join(','),
    );
    if (key == _readFor) return;
    _readFor = key;
    ref
        .read(runAsideProvider)(
          chapterEyesJob(
            store.rawJsonIn(novelId, 'chapterContents'),
            [for (final n in nodes) n.id],
            {for (final n in nodes) n.id: n.title},
            people,
          ),
        )
        .then(
          (eyes) {
            if (mounted && _readFor == key) setState(() => _eyes = eyes);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
        );
  }

  @override
  Widget build(BuildContext context) {
    _read();
    final scheme = Theme.of(context).colorScheme;
    final eyes = _eyes;
    if (eyes == null) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final byId = {for (final l in widget.cast.list) l.entry.id: l};
    Color colourOf(ChapterEyes e) => switch (e.telling) {
      Telling.through => castTone(e.who!),
      Telling.firstPerson => scheme.onSurface.withValues(alpha: 0.55),
      Telling.unclear => scheme.outlineVariant.withValues(alpha: 0.5),
    };
    String whose(ChapterEyes e) => switch (e.telling) {
      Telling.through => 'through ${byId[e.who]?.entry.name ?? 'someone'}',
      Telling.firstPerson => 'in the first person',
      Telling.unclear => 'through no one clearly',
    };
    if (eyes.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No chapter has words yet. Once there are, each is read for whose eyes it is told through.',
          textAlign: TextAlign.center,
          style: vaultText(context, size: 16, color: scheme.onSurfaceVariant),
        ),
      );
    }
    final summary = eyesSummary(eyes);
    final total = summary.words == 0 ? 1 : summary.words;
    final picked = _picked == null ? null : eyes.where((e) => e.chapter == _picked).firstOrNull;
    final told = summary.each.entries.toList()..sort((a, b) => b.value.words - a.value.words);
    final firsts = eyes.where((e) => e.telling == Telling.firstPerson).toList();
    final unclear = eyes.where((e) => e.telling == Telling.unclear).toList();
    final run = summary.longestRun;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Whose eyes each chapter is told through, read from who thinks, feels and notices in it.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          // The ribbon: a band a chapter, as wide as it is long.
          Semantics(
            label:
                'The book, chapter by chapter: ${[for (final e in eyes) 'chapter ${e.chapter} ${whose(e)}'].join(', ')}',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                height: 44,
                child: Row(
                  children: [
                    for (final e in eyes)
                      Expanded(
                        flex: e.words.clamp(1, 1 << 30),
                        child: GestureDetector(
                          key: ValueKey('eyes-${e.chapter}'),
                          onTap: () => setState(() => _picked = _picked == e.chapter ? null : e.chapter),
                          child: Container(
                            margin: const EdgeInsets.only(right: 1.5),
                            decoration: BoxDecoration(
                              color: colourOf(e),
                              border: _picked == e.chapter ? Border.all(color: scheme.onSurface, width: 2.5) : null,
                            ),
                            alignment: Alignment.center,
                            // Its number, made smaller to fit a narrow band rather than broken over two lines.
                            child: e.words / total > 0.03
                                ? Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 1),
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Text(
                                        '${e.chapter}',
                                        maxLines: 1,
                                        style: vaultHeading(context, size: 11, color: _inkOn(colourOf(e)), weight: 700),
                                      ),
                                    ),
                                  )
                                : null,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            picked == null ? 'Press a chapter to see why.' : '',
            style: vaultText(context, size: 12.5, color: scheme.onSurfaceVariant),
          ),
          if (picked != null) _Picked(eyes: picked, whose: whose(picked), colour: colourOf(picked)),
          const SizedBox(height: 14),
          for (final MapEntry(key: id, value: v) in told)
            if (byId[id] case final l?)
              _Row(
                face: _Face(listed: l),
                name: l.entry.name,
                said:
                    '${v.chapters} ${v.chapters == 1 ? 'chapter' : 'chapters'} · ${(v.words * 100 / total).round()}% of the book',
                share: v.words / total,
                colour: castTone(id),
              ),
          if (firsts.isNotEmpty)
            _Row(
              face: Icon(Icons.person_outline, color: scheme.onSurfaceVariant),
              name: 'In the first person',
              said: 'Chapter${firsts.length == 1 ? '' : 's'} ${firsts.map((e) => e.chapter).join(', ')}',
              share: firsts.fold(0, (n, e) => n + e.words) / total,
              colour: scheme.onSurface.withValues(alpha: 0.55),
            ),
          if (unclear.isNotEmpty)
            _Row(
              face: Icon(Icons.blur_on, color: scheme.onSurfaceVariant),
              name: 'Unclear',
              said:
                  'Chapter${unclear.length == 1 ? '' : 's'} ${unclear.map((e) => e.chapter).join(', ')}: no one thinks or notices clearly',
              share: unclear.fold(0, (n, e) => n + e.words) / total,
              colour: scheme.outlineVariant,
            ),
          const SizedBox(height: 10),
          // What it means.
          if (run != null && run.to - run.from >= 2)
            _Note(
              'Chapters ${run.from} to ${run.to} are all through ${byId[run.who]?.entry.name ?? 'one character'}: '
              '${run.to - run.from + 1} in a row.',
            ),
          for (final MapEntry(key: id, value: since) in summary.since.entries)
            if (since >= 4 && summary.each.length > 1)
              _Note(
                '${byId[id]?.entry.name ?? 'Someone'} has not been seen through for $since chapters, since chapter '
                '${eyes.length - since}.',
              ),
          if (told.length == 1 && firsts.isEmpty)
            _Note('The whole book so far is seen through ${byId[told.single.key]?.entry.name ?? 'one character'}.'),
        ],
      ),
    );
  }
}

/// Dark ink on a light colour, light on a dark one.
Color _inkOn(Color c) => c.computeLuminance() > 0.45 ? const Color(0xFF1B1712) : Colors.white;

/// The chapter pressed: through whom, the sentence that shows it, and the way there.
class _Picked extends ConsumerWidget {
  const _Picked({required this.eyes, required this.whose, required this.colour});

  final ChapterEyes eyes;
  final String whose;
  final Color colour;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final e = eyes;
    final title = e.title.trim().isEmpty ? 'Chapter ${e.chapter}' : 'Chapter ${e.chapter} · ${e.title.trim()}';
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: colour, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$title, $whose', style: vaultHeading(context, size: 14, color: scheme.onSurface, weight: 700)),
          if (e.evidence.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              '“${e.evidence}”',
              style: vaultText(context, size: 14.5, color: scheme.onSurface).copyWith(fontStyle: FontStyle.italic),
            ),
          ],
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () {
                if (e.evidence.isNotEmpty) {
                  ref.read(pendingFindProvider.notifier).request((nodeId: e.nodeId, term: e.evidence, block: 0));
                }
                ref.read(selectedNodeProvider.notifier).select(e.nodeId);
                context.go('/write');
              },
              icon: const Icon(Icons.menu_book_outlined, size: 18),
              label: const Text('Read it there'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.face, required this.name, required this.said, required this.share, required this.colour});

  final Widget face;
  final String name;
  final String said;
  final double share;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(width: 40, height: 48, child: Center(child: face)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: vaultHeading(context, size: 15, color: scheme.onSurface, weight: 700)),
                Text(said, style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant)),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(
                    value: share.clamp(0, 1),
                    minHeight: 6,
                    color: colour,
                    backgroundColor: scheme.onSurface.withValues(alpha: 0.08),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.visibility_outlined, size: 18, color: scheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: vaultText(context, size: 14.5, color: scheme.onSurface)),
          ),
        ],
      ),
    );
  }
}

/// A character's small cameo, as their card draws them.
class _Face extends StatelessWidget {
  const _Face({required this.listed});

  final Listed listed;

  @override
  Widget build(BuildContext context) {
    final tone = NovelArt.of(context).bound(castTone(listed.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: SizedBox(
          width: 40,
          height: 48,
          child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
        ),
      ),
    );
  }
}
