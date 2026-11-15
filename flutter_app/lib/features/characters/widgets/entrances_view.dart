import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/novel_art.dart';
import '../../../core/format.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/entrances.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../write/write_providers.dart';
import '../character_actions.dart' show characterPath;
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// ENTRANCES, a view of the cast (`entrances.dart` reads it): the book as a row of doors, a door a chapter, with who
/// first comes through each; then the cast IN ORDER OF APPEARANCE, as a playbill: each one's entrance, the sentence
/// they enter in, and what that first moment gives the reader (seen, speaks, acts, in their head, or nothing but a
/// name), with **Read it there**. Under it, what an editor would say: a crowded door, those who enter with only a
/// name, a lead who comes late, those talked of before they appear, and who is not on the page yet. It only reads.
class CastEntrances extends ConsumerStatefulWidget {
  const CastEntrances({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<CastEntrances> createState() => _CastEntrancesState();
}

class _CastEntrancesState extends ConsumerState<CastEntrances> {
  Entrances? _read;
  Object? _readFor;
  int? _door;

  void _readBook() {
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
          entrancesJob(store.rawJsonIn(novelId, 'chapterContents'), [for (final n in nodes) n.id], people),
        )
        .then(
          (read) {
            if (mounted && _readFor == key) setState(() => _read = read);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
        );
  }

  @override
  Widget build(BuildContext context) {
    _readBook();
    final scheme = Theme.of(context).colorScheme;
    final read = _read;
    if (read == null) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final byId = {for (final l in widget.cast.list) l.entry.id: l};
    String nameOf(String id) => byId[id]?.entry.name ?? 'Someone';
    if (read.order.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          read.perChapter.isEmpty
              ? 'No chapter has words yet. Once there are, the cast is read in the order a reader meets them.'
              : 'No one in the cast is named in the chapters yet. Write one of them onto the page, and their '
                    'entrance is here.',
          textAlign: TextAlign.center,
          style: vaultText(context, size: 16, color: scheme.onSurfaceVariant),
        ),
      );
    }

    final shown = _door == null
        ? read.order
        : [
            for (final e in read.order)
              if (e.at.chapter == _door) e,
          ];
    final bare = [
      for (final e in read.order)
        if (e.onStage && e.gives.isEmpty) e.id,
    ];
    final chapters = read.perChapter.length;
    final lateFrom = chapters >= 4 ? (chapters / 4).ceil() + 1 : 1 << 30;
    final late = [
      for (final e in read.order)
        if (e.at.chapter >= lateFrom && _isLead(byId[e.id]?.profile.roles ?? const [])) e,
    ];
    final promised = [
      for (final e in read.order)
        if (e.onStage && e.talkedOf != null && e.talkedOf!.chapter < e.at.chapter) e,
    ];
    final crowdedChapters = [
      for (final (i, n) in read.perChapter.indexed)
        if (n >= crowdedChapter) (chapter: i + 1, count: n),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'The cast in the order a reader meets them: where each first steps onto the page, and what that first '
            'moment gives the reader to hold on to.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          _Doors(read: read, picked: _door, onPick: (c) => setState(() => _door = _door == c ? null : c)),
          const SizedBox(height: 4),
          Text(
            _door == null
                ? 'A door a chapter, and who first comes through it. Press one to see only them.'
                : 'Chapter $_door: ${plural(shown.length, 'entrance')}. Press it again for the whole cast.',
            style: vaultText(context, size: 12.5, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          VaultFrame(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'IN ORDER OF APPEARANCE',
                  textAlign: TextAlign.center,
                  style: vaultHeading(
                    context,
                    size: 15,
                    color: scheme.primary,
                    weight: 700,
                  ).copyWith(letterSpacing: 2.4),
                ),
                const SizedBox(height: 4),
                Center(child: Container(width: 64, height: 1.5, color: scheme.primary.withValues(alpha: 0.6))),
                const SizedBox(height: 12),
                if (shown.isEmpty)
                  Text(
                    'No one first comes on in chapter $_door.',
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                  ),
                for (final e in shown)
                  if (byId[e.id] case final l?) _Billing(entrance: e, listed: l, number: read.order.indexOf(e) + 1),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (read.crowds.isNotEmpty ||
              crowdedChapters.isNotEmpty ||
              bare.isNotEmpty ||
              late.isNotEmpty ||
              promised.isNotEmpty ||
              read.unseen.isNotEmpty)
            Text(
              'WHAT AN EDITOR WOULD SAY',
              style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.6),
            ),
          const SizedBox(height: 8),
          for (final c in read.crowds)
            _Note(
              icon: Icons.groups_outlined,
              text:
                  'Chapter ${c.chapter}, one paragraph: ${_list(c.ids.map(nameOf))} all enter at once. '
                  'A reader meets ${c.ids.length} new people in a breath; one at a time, each is remembered.',
            ),
          for (final c in crowdedChapters)
            _Note(
              icon: Icons.door_front_door_outlined,
              text: 'Chapter ${c.chapter} brings on ${c.count} new people. A crowded door: could some wait a chapter?',
            ),
          if (bare.isNotEmpty)
            _Note(
              icon: Icons.label_outline,
              text:
                  '${_list(bare.map(nameOf))} ${bare.length == 1 ? 'enters' : 'enter'} with nothing but a name. '
                  'A look, a line or something done gives the reader someone to hold.',
            ),
          for (final e in late)
            _Note(
              icon: Icons.schedule,
              text:
                  '${nameOf(e.id)} (${byId[e.id]!.profile.roles.firstWhere((r) => _isLead([r]))}) first steps on in '
                  'chapter ${e.at.chapter} of $chapters.',
            ),
          if (promised.isNotEmpty)
            _Note(
              icon: Icons.record_voice_over_outlined,
              text:
                  'Talked of before they appear: ${_list([for (final e in promised) '${nameOf(e.id)} (chapter ${e.talkedOf!.chapter}, on the page in ${e.at.chapter})'])}. '
                  'A promise the reader waits for.',
            ),
          if (read.unseen.isNotEmpty)
            _Note(
              icon: Icons.theater_comedy_outlined,
              text: 'Waiting in the wings, not on the page yet: ${_list(read.unseen.map(nameOf))}.',
            ),
        ],
      ),
    );
  }

  static bool _isLead(List<String> roles) => roles.any((r) {
    final role = r.toLowerCase();
    return role.contains('protagonist') || role.contains('antagonist') || role == 'lead' || role == 'main character';
  });
}

String _list(Iterable<String> names) {
  final all = names.toList();
  if (all.length <= 1) return all.join();
  return '${all.take(all.length - 1).join(', ')} and ${all.last}';
}

/// The book as a row of doors, a door a chapter, with a bead for each one who first comes through it.
class _Doors extends StatelessWidget {
  const _Doors({required this.read, required this.picked, required this.onPick});

  final Entrances read;
  final int? picked;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final byChapter = <int, List<String>>{};
    for (final e in read.order) {
      byChapter.putIfAbsent(e.at.chapter, () => []).add(e.id);
    }
    final count = read.perChapter.length;
    return Semantics(
      container: true,
      label:
          'Entrances by chapter: ${[for (final MapEntry(key: c, value: ids) in byChapter.entries) 'chapter $c, ${ids.length}'].join('; ')}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 74,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var c = 1; c <= count; c++)
                  Expanded(
                    child: GestureDetector(
                      key: ValueKey('door-$c'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => onPick(c),
                      child: _Door(
                        ids: byChapter[c] ?? const [],
                        picked: picked == c,
                        crowded: (read.perChapter[c - 1]) >= crowdedChapter,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Container(height: 2, color: scheme.outline.withValues(alpha: 0.6)),
          const SizedBox(height: 3),
          Row(
            children: [
              Text('Chapter 1', style: vaultText(context, size: 11.5, color: scheme.onSurfaceVariant)),
              const Spacer(),
              if (count > 1)
                Text('Chapter $count', style: vaultText(context, size: 11.5, color: scheme.onSurfaceVariant)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Door extends StatelessWidget {
  const _Door({required this.ids, required this.picked, required this.crowded});

  final List<String> ids;
  final bool picked;
  final bool crowded;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const most = 5;
    final frame = picked
        ? scheme.primary
        : (ids.isEmpty ? scheme.outlineVariant.withValues(alpha: 0.35) : scheme.outline);
    return LayoutBuilder(
      builder: (context, box) {
        final bead = (box.maxWidth - 4).clamp(3.0, 11.0);
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 1),
          decoration: BoxDecoration(
            color: crowded
                ? scheme.tertiaryContainer.withValues(alpha: 0.7)
                : (picked ? scheme.primary.withValues(alpha: 0.12) : null),
            border: Border(
              left: BorderSide(color: frame, width: picked ? 2 : 1),
              right: BorderSide(color: frame, width: picked ? 2 : 1),
              top: BorderSide(color: frame, width: picked ? 2 : 1),
            ),
            borderRadius: BorderRadius.vertical(top: Radius.circular(box.maxWidth / 2)),
          ),
          padding: const EdgeInsets.only(bottom: 3),
          alignment: Alignment.bottomCenter,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (ids.length > most)
                FittedBox(
                  child: Text(
                    '+${ids.length - most + 1}',
                    style: vaultHeading(context, size: 10, color: scheme.onSurface, weight: 700),
                  ),
                ),
              for (final id in ids.take(ids.length > most ? most - 1 : most).toList().reversed)
                Container(
                  width: bead,
                  height: bead,
                  margin: const EdgeInsets.only(top: 2),
                  decoration: BoxDecoration(
                    color: castTone(id),
                    shape: BoxShape.circle,
                    border: Border.all(color: scheme.surface, width: 0.8),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// One line of the playbill: the number they come on at, their face and name, the chapter, what the moment gives, and
/// the sentence, with the way to it.
class _Billing extends ConsumerWidget {
  const _Billing({required this.entrance, required this.listed, required this.number});

  final Entrance entrance;
  final Listed listed;
  final int number;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final e = entrance;
    final tone = NovelArt.of(context).bound(castTone(e.id), lift: 0.1, sink: 0.45, tinted: true);
    final chips = <(IconData, String, bool)>[
      if (!e.onStage) (Icons.record_voice_over_outlined, 'Only talked of', true),
      if (e.onStage && e.gives.isEmpty) (Icons.label_outline, 'Only named', true),
      if (e.gives.contains(Gives.seen)) (Icons.face_outlined, 'Seen', false),
      if (e.gives.contains(Gives.speaks)) (Icons.chat_bubble_outline, 'Speaks', false),
      if (e.gives.contains(Gives.acts)) (Icons.directions_run, 'Acts', false),
      if (e.gives.contains(Gives.thinks)) (Icons.psychology_outlined, 'In their head', false),
    ];
    return Padding(
      key: ValueKey('entrance-${e.id}'),
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '$number.',
              textAlign: TextAlign.right,
              style: vaultHeading(context, size: 16, color: scheme.primary, weight: 700),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => context.go(characterPath(e.id)),
            child: ExcludeSemantics(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: SizedBox(
                  width: 40,
                  height: 48,
                  child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Expanded(
                      child: Text(
                        listed.entry.name.toUpperCase(),
                        style: vaultHeading(
                          context,
                          size: 15,
                          color: scheme.onSurface,
                          weight: 700,
                        ).copyWith(letterSpacing: 1.2),
                      ),
                    ),
                    Text('Ch. ${e.at.chapter}', style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant)),
                  ],
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final (icon, label, warn) in chips)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: warn ? scheme.tertiaryContainer : scheme.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(icon, size: 13, color: warn ? scheme.onTertiaryContainer : scheme.primary),
                            const SizedBox(width: 4),
                            Text(
                              label,
                              style: vaultText(
                                context,
                                size: 12.5,
                                color: warn ? scheme.onTertiaryContainer : scheme.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${e.onStage ? 'Enters' : 'Spoken of'}: “${e.at.sentence}”',
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 14.5, color: scheme.onSurface).copyWith(fontStyle: FontStyle.italic),
                ),
                if (e.onStage && e.talkedOf != null && e.talkedOf!.chapter < e.at.chapter)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'Talked of first in chapter ${e.talkedOf!.chapter}.',
                      style: vaultText(context, size: 13, color: scheme.onSurfaceVariant),
                    ),
                  ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    style: TextButton.styleFrom(visualDensity: VisualDensity.compact, padding: EdgeInsets.zero),
                    onPressed: () {
                      ref.read(pendingFindProvider.notifier).request((
                        nodeId: e.at.nodeId,
                        term: e.at.sentence,
                        block: e.at.block,
                      ));
                      ref.read(selectedNodeProvider.notifier).select(e.at.nodeId);
                      context.go('/write');
                    },
                    icon: const Icon(Icons.menu_book_outlined, size: 18),
                    label: const Text('Read it there'),
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
  const _Note({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: scheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: vaultText(context, size: 14.5, color: scheme.onSurface)),
          ),
        ],
      ),
    );
  }
}
