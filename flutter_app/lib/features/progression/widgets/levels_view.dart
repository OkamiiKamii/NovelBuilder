import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/systems/levels_in_pages.dart';
import '../../characters/character_actions.dart' show characterPath;
import '../../characters/characters_providers.dart';
import '../../characters/widgets/vault.dart';
import '../../write/write_providers.dart';

/// LEVELS IN YOUR PAGES (`levels_in_pages.dart` reads them): everything the chapters give a level to, kept as the book
/// is written, never by hand, and kept with whose it is. A character's levels (their own, and those of what they
/// carry) are on their page (`TheirLevels`, `features/characters/tabs/overview_tab.dart`); on Systems (`LevelsView`),
/// what is no one's, and who holds the rest. Each thing with the level it is at now and since when, a line of its
/// steps, and, pressed, every step: its chapter, its level, the sentence, and **Read it there**. A level lower than
/// before, where the page does not say it fell, is marked. The author's word over the reading: **Not theirs**, **Give
/// to…** and **Not a level**, kept on this device. It only reads the book.

/// Where the names set aside ("Not a level") are kept, for a novel: on this device.
String levelsAsideKey(String novelId) => 'levels.aside.$novelId';

/// Where the author's word on whose a thing is ("Not theirs", "Give to…") is kept, for a novel: on this device. A map
/// of names (in lower case) to a character's id, or '' for no one's.
String levelsOwnersKey(String novelId) => 'levels.owners.$novelId';

/// The levels of the open book, read with its cast and the author's word. [cast] gives who can hold them.
mixin LevelsReader<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  List<Levelled>? levels;
  Object? _readFor;

  Set<String> aside(String novelId) {
    final stored = ref.read(settingsStoreProvider).read(levelsAsideKey(novelId));
    return {if (stored is List) ...stored.whereType<String>()};
  }

  Map<String, String> assigned(String novelId) {
    final stored = ref.read(settingsStoreProvider).read(levelsOwnersKey(novelId));
    return {
      if (stored is Map)
        for (final MapEntry(:key, :value) in stored.entries)
          if (value is String) '$key': value,
    };
  }

  void readLevels(CastData cast) {
    final store = ref.read(novelStoreProvider);
    final order = [
      for (final n in readingOrder(cast.model.nodes.values))
        if (isDocument(n.kind)) n.id,
    ];
    final names = namesToFind(cast.entries, cast.profiles);
    final people = [
      for (final l in cast.list)
        if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty)
          (id: l.entry.id, names: names[l.entry.id]!),
    ];
    final setAside = aside(cast.novelId);
    final given = assigned(cast.novelId);
    final key = (
      [for (final id in order) '$id:${cast.model.nodes[id]?.wordCount}'].join(','),
      [for (final p in people) '${p.id}:${p.names.join('|')}'].join(','),
      setAside.join('|'),
      given.entries.map((e) => '${e.key}=${e.value}').join('|'),
      store.rowsIn(cast.novelId, 'chapterContents').length,
    );
    if (key == _readFor) return;
    _readFor = key;
    ref
        .read(runAsideProvider)(
          levelsInPagesJob(
            store.rawJsonIn(cast.novelId, 'chapterContents'),
            order,
            setAside,
            people: people,
            assigned: given,
          ),
        )
        .then(
          (found) {
            if (mounted && _readFor == key) setState(() => levels = found);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progression')),
        );
  }

  /// Read again on the next build (after the author's word changed).
  void readAgain() => setState(() => _readFor = null);

  void setAsideLevel(String novelId, Levelled l) {
    ref.read(settingsStoreProvider).write(levelsAsideKey(novelId), [...aside(novelId), l.name.toLowerCase()]);
    readAgain();
    _tell('${l.name} is set aside: not a level.');
  }

  void giveLevel(String novelId, Levelled l, String? to, {required String said}) {
    ref.read(settingsStoreProvider).write(levelsOwnersKey(novelId), {
      ...assigned(novelId),
      l.name.toLowerCase(): to ?? '',
    });
    readAgain();
    _tell(said);
  }

  void _tell(String text) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(SnackBar(content: Text(text)));
  }
}

/// On Systems: what is no one's, each to give to a character or set aside; and who holds the rest, a press from their
/// page.
class LevelsView extends ConsumerStatefulWidget {
  const LevelsView({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<LevelsView> createState() => _LevelsViewState();
}

class _LevelsViewState extends ConsumerState<LevelsView> with LevelsReader {
  Future<void> _give(Levelled l) async {
    final cast = widget.cast;
    final people = [
      for (final x in cast.list)
        if (!x.profile.archived) x,
    ];
    final id = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text('Whose is ${l.name}?'),
        children: [
          for (final p in people)
            SimpleDialogOption(onPressed: () => Navigator.of(context).pop(p.entry.id), child: Text(p.entry.name)),
        ],
      ),
    );
    if (id == null || !mounted) return;
    final name = people.firstWhere((p) => p.entry.id == id).entry.name;
    giveLevel(cast.novelId, l, id, said: '${l.name} is $name’s now: on their page.');
  }

  @override
  Widget build(BuildContext context) {
    readLevels(widget.cast);
    final scheme = Theme.of(context).colorScheme;
    final all = levels;
    final mine = [
      for (final l in all ?? const <Levelled>[])
        if (l.owner == null) l,
    ];
    // Who holds the rest, the most first.
    final held = <String, List<Levelled>>{};
    for (final l in all ?? const <Levelled>[]) {
      if (l.owner case final id?) held.putIfAbsent(id, () => []).add(l);
    }
    final holders = held.entries.toList()..sort((a, b) => b.value.length - a.value.length);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Heading(
          line:
              'Everything your chapters give a level to, kept as you write. A character’s levels, and those of what '
              'they carry, are on their page.',
        ),
        if (all == null)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (all.isEmpty)
          Text(
            'Nothing in your chapters has a level yet. Write “the Hunter Armor reached Level 2”, or “Hunter Armor '
            'Lv. 2”, and it is kept from that chapter on, on the page of whoever it is.',
            style: vaultText(context, size: 14.5, color: scheme.onSurface).copyWith(fontStyle: FontStyle.italic),
          )
        else ...[
          if (holders.isNotEmpty) ...[
            Text(
              'ON THEIR PAGES',
              style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.6),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final MapEntry(key: id, value: things) in holders)
                  ActionChip(
                    key: ValueKey('holder-$id'),
                    avatar: const Icon(Icons.person_outline, size: 18),
                    label: Text(
                      '${widget.cast.nameOf(id) ?? 'Someone'}: ${things.map((t) => t.self ? 'their level' : t.name).join(', ')}',
                    ),
                    onPressed: () => context.go(characterPath(id)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
          ],
          if (mine.isNotEmpty) ...[
            Text(
              'NO ONE’S',
              style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.6),
            ),
            const SizedBox(height: 6),
            LevelsList(
              levels: mine,
              actions: (l) => [
                TextButton(onPressed: () => _give(l), child: const Text('Give to…')),
                TextButton(onPressed: () => setAsideLevel(widget.cast.novelId, l), child: const Text('Not a level')),
              ],
            ),
          ],
        ],
      ],
    );
  }
}

/// On a character's page: their own level, and those of what they carry, kept as the book is written.
class TheirLevels extends ConsumerStatefulWidget {
  const TheirLevels({super.key, required this.cast, required this.entryId});

  final CastData cast;
  final String entryId;

  @override
  ConsumerState<TheirLevels> createState() => _TheirLevelsState();
}

class _TheirLevelsState extends ConsumerState<TheirLevels> with LevelsReader {
  @override
  Widget build(BuildContext context) {
    readLevels(widget.cast);
    final name = widget.cast.nameOf(widget.entryId) ?? 'They';
    final theirs = [
      for (final l in levels ?? const <Levelled>[])
        if (l.owner == widget.entryId) l,
    ]..sort((a, b) => (a.self ? 0 : 1) - (b.self ? 0 : 1));
    if (theirs.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: VaultFrame(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Heading(line: '$name’s level and those of what they carry, kept as you write: where each is now.'),
            LevelsList(
              levels: theirs,
              titleOf: (l) => l.self ? '$name’s level' : l.name,
              actions: (l) => [
                if (!l.self)
                  TextButton(
                    onPressed: () =>
                        giveLevel(widget.cast.novelId, l, null, said: '${l.name} is no one’s now: on Systems.'),
                    child: const Text('Not theirs'),
                  ),
                TextButton(onPressed: () => setAsideLevel(widget.cast.novelId, l), child: const Text('Not a level')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading({required this.line});

  final String line;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.stairs_outlined, size: 20, color: scheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'LEVELS',
                  style: vaultHeading(context, size: 12, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(line, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Things with levels: versions of one thing together, each the rest on its own; a slip counted at the top.
class LevelsList extends StatefulWidget {
  const LevelsList({super.key, required this.levels, required this.actions, this.titleOf});

  final List<Levelled> levels;

  /// What can be done with a thing, under its steps.
  final List<Widget> Function(Levelled) actions;

  /// What a thing is called on the card (its name, unless given).
  final String Function(Levelled)? titleOf;

  @override
  State<LevelsList> createState() => _LevelsListState();
}

class _LevelsListState extends State<LevelsList> {
  final _open = <String>{};

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final groups = <String, List<Levelled>>{};
    for (final l in widget.levels) {
      groups.putIfAbsent(l.family.isEmpty ? '\u0000${l.name}' : l.family, () => []).add(l);
    }
    final slips = widget.levels.where((l) => l.steps.any((s) => s.backwards)).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (slips > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '${slips == 1 ? 'One goes' : '$slips go'} back down where the page does not say it fell: marked below.',
              style: vaultText(context, size: 14, color: scheme.error),
            ),
          ),
        for (final MapEntry(key: family, value: things) in groups.entries)
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!family.startsWith('\u0000'))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '${family.toUpperCase()} · ${things.length} versions',
                        style: vaultHeading(
                          context,
                          size: 11,
                          color: scheme.primary,
                          weight: 700,
                        ).copyWith(letterSpacing: 1.6),
                      ),
                    ),
                  for (final (i, l) in things.indexed) ...[
                    if (i > 0) Divider(height: 14, color: scheme.outlineVariant.withValues(alpha: 0.5)),
                    LevelledThing(
                      levelled: l,
                      title: widget.titleOf?.call(l) ?? l.name,
                      open: _open.contains(l.name),
                      onToggle: () => setState(() => _open.contains(l.name) ? _open.remove(l.name) : _open.add(l.name)),
                      actions: widget.actions(l),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// One thing: its name, the level it is at now and since when, a line of its steps; pressed, every step and what can
/// be done with it.
class LevelledThing extends ConsumerWidget {
  const LevelledThing({
    super.key,
    required this.levelled,
    required this.title,
    required this.open,
    required this.onToggle,
    required this.actions,
  });

  final Levelled levelled;
  final String title;
  final bool open;
  final VoidCallback onToggle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final l = levelled;
    final now = l.steps.last;
    final changes = l.steps.length - 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          key: ValueKey('level-${l.name}'),
          borderRadius: BorderRadius.circular(8),
          onTap: onToggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: vaultHeading(context, size: 16, color: scheme.onSurface, weight: 700)),
                      Text(
                        [
                          'since chapter ${now.chapter}',
                          if (changes > 0)
                            '${changes == 1 ? '1 step' : '$changes steps'} from Level ${l.steps.first.level}',
                        ].join(' · '),
                        style: vaultText(context, size: 13, color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                if (l.steps.length > 1)
                  SizedBox(
                    width: 70,
                    height: 28,
                    child: CustomPaint(
                      painter: _Steps(steps: l.steps, colour: scheme.primary),
                    ),
                  ),
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(10)),
                  child: Column(
                    children: [
                      Text(
                        'LEVEL',
                        style: vaultHeading(context, size: 8, color: scheme.onPrimaryContainer, weight: 700),
                      ),
                      Text(
                        '${now.level}',
                        style: vaultHeading(context, size: 20, color: scheme.onPrimaryContainer, weight: 800),
                      ),
                    ],
                  ),
                ),
                Icon(open ? Icons.expand_less : Icons.expand_more, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
        if (open) ...[
          for (final s in l.steps.reversed)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 74,
                    child: Text(
                      'Ch. ${s.chapter}\nLevel ${s.level}',
                      style: vaultText(context, size: 12.5, color: s.backwards ? scheme.error : scheme.onSurface),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '“${s.sentence}”',
                          style: vaultText(
                            context,
                            size: 13.5,
                            color: scheme.onSurface,
                          ).copyWith(fontStyle: FontStyle.italic),
                        ),
                        if (s.up)
                          Text(
                            'Leveled up: one more than before.',
                            style: vaultText(context, size: 12, color: scheme.onSurfaceVariant),
                          ),
                        if (s.backwards)
                          Text(
                            'Lower than before, and the page does not say it fell.',
                            style: vaultText(context, size: 12, color: scheme.error),
                          ),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            style: TextButton.styleFrom(visualDensity: VisualDensity.compact, padding: EdgeInsets.zero),
                            onPressed: () {
                              ref.read(pendingFindProvider.notifier).request((
                                nodeId: s.nodeId,
                                term: s.sentence,
                                block: s.block,
                              ));
                              ref.read(selectedNodeProvider.notifier).select(s.nodeId);
                              context.go('/write');
                            },
                            icon: const Icon(Icons.menu_book_outlined, size: 16),
                            label: const Text('Read it there'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: Wrap(spacing: 4, children: actions),
          ),
        ],
      ],
    );
  }
}

/// A thing's steps as a line, low to high, left to right through the book.
class _Steps extends CustomPainter {
  _Steps({required this.steps, required this.colour});

  final List<LevelStep> steps;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final low = steps.map((s) => s.level).reduce(min);
    final high = steps.map((s) => s.level).reduce(max);
    final first = steps.first.chapter;
    final last = max(steps.last.chapter, first + 1);
    Offset at(LevelStep s) => Offset(
      (s.chapter - first) / (last - first) * size.width,
      high == low ? size.height / 2 : size.height - (s.level - low) / (high - low) * size.height,
    );
    final line = Paint()
      ..color = colour
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    // A level holds until the next step: flat, then up (or down).
    var before = at(steps.first);
    final path = Path()..moveTo(before.dx, before.dy);
    for (final s in steps.skip(1)) {
      final p = at(s);
      path
        ..lineTo(p.dx, before.dy)
        ..lineTo(p.dx, p.dy);
      before = p;
    }
    canvas.drawPath(path, line);
    for (final s in steps) {
      canvas.drawCircle(at(s), 2.5, Paint()..color = s.backwards ? const Color(0xFFC0392B) : colour);
    }
  }

  @override
  bool shouldRepaint(_Steps old) => old.steps != steps || old.colour != colour;
}
