import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/pages_names.dart';
import '../../characters/widgets/vault.dart';
import '../progression_providers.dart';

/// Where the names set aside ("Not part of it") are kept, for a system: on this device.
String setAsideKey(String systemId) => 'systems.notPart.$systemId';

/// The group a kind of thing goes in, of [system]'s: one named for it ("Skills", "Spells", "Techniques", "Powers";
/// "Titles"; "Classes"; "Items", "Equipment"), else none (and one is made, named [groupNameOf]).
SysGroup? groupFor(SystemBlueprint system, PageThing thing) {
  final words = switch (thing) {
    PageThing.skill => ['skill', 'spell', 'technique', 'power', 'abilit', 'art'],
    PageThing.title => ['title'],
    PageThing.kit => ['class', 'path', 'calling'],
    PageThing.item => ['item', 'equipment', 'gear', 'inventory', 'artifact', 'relic'],
  };
  return system.groupList.where((g) => words.any((w) => g.name.toLowerCase().contains(w))).firstOrNull;
}

/// The name a new group for [thing] is given.
String groupNameOf(PageThing thing) => switch (thing) {
  PageThing.skill => 'Skills',
  PageThing.title => 'Titles',
  PageThing.kit => 'Classes',
  PageThing.item => 'Items',
};

/// IN YOUR PAGES, NOT IN THE SYSTEM, on Systems (`pages_names.dart` reads them): the skills, titles, classes and
/// items the chapters name the system's way that the blueprint does not hold yet, the most named first, each with its
/// kind, rank, how often and where, and the sentence. **Add to Skills** (or Titles…) puts it in the blueprint (its rank
/// when the system has a rank of that name), and on the sheet when the system has one; **Not part of it** sets it
/// aside on this device; **Add all** when there are several.
class PagesNamesView extends ConsumerStatefulWidget {
  const PagesNamesView({super.key, required this.novelId, required this.model, required this.system});

  final String novelId;
  final StoryModel model;
  final SystemBlueprint system;

  @override
  ConsumerState<PagesNamesView> createState() => _PagesNamesViewState();
}

class _PagesNamesViewState extends ConsumerState<PagesNamesView> {
  List<PageName>? _names;
  final _done = <String>{};

  Set<String> _aside() {
    final stored = ref.read(settingsStoreProvider).read(setAsideKey(widget.system.id));
    return {if (stored is List) ...stored.whereType<String>()};
  }

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final order = [
      for (final n in readingOrder(widget.model.nodes.values))
        if (isDocument(n.kind)) n.id,
    ];
    ref
        .read(runAsideProvider)(
          namesInPagesJob(
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            order,
            known: {for (final i in widget.system.items) i.name},
            setAside: _aside(),
          ),
        )
        .then(
          (n) {
            if (mounted) setState(() => _names = n);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progression')),
        );
  }

  void _notPart(PageName n) {
    final key = setAsideKey(widget.system.id);
    ref.read(settingsStoreProvider).write(key, [..._aside(), n.name]);
    setState(() => _done.add(n.name.toLowerCase()));
  }

  void _add(List<PageName> names) {
    final actions = ProgressionActions(context, widget.novelId);
    final systemId = widget.system.id;
    final sheets = [
      for (final s in widget.model.sheets)
        if (s.systemId == systemId) s,
    ];
    final made = actions.systems((x) {
      final ids = <String>[];
      x.updateSystem(systemId, (current) {
        final groups = [for (final g in current.raw['groups'] as List? ?? const []) g];
        final items = [for (final i in current.raw['items'] as List? ?? const []) i];
        String groupId(PageThing thing) {
          final found =
              groupFor(SystemBlueprint({...current.raw, 'groups': groups}), thing) ?? SysGroup(<String, Object?>{});
          if (found.id.isNotEmpty) return found.id;
          final id = newId();
          groups.add({'id': id, 'name': groupNameOf(thing), 'single': thing == PageThing.kit});
          return id;
        }

        for (final n in names) {
          final id = newId();
          ids.add(id);
          final rank = current.ranks.where((r) => r.name.toLowerCase() == n.rank.toLowerCase()).firstOrNull;
          items.add({
            'id': id,
            'groupId': groupId(n.thing),
            'name': n.name,
            'rankId': ?rank?.id,
            'description': rank == null && n.rank.isNotEmpty ? 'Rank ${n.rank}, as the pages say.' : '',
          });
        }
        return {'groups': groups, 'items': items};
      });
      // On the one sheet, held.
      if (sheets.length == 1) {
        x.updateSheet(
          sheets.single.id,
          (current) => {
            'itemIds': [...current.itemIds, ...ids],
          },
        );
      }
      return ids;
    });
    if (made == null) return;
    setState(() => _done.addAll([for (final n in names) n.name.toLowerCase()]));
    final where = sheets.length == 1
        ? ' and on ${widget.model.entries[sheets.single.entryId]?.name.trim() ?? 'the sheet'}’s sheet'
        : '';
    actions.tell(
      names.length == 1 ? '${names.single.name} is in the system$where.' : '${names.length} are in the system$where.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final names = [
      for (final n in _names ?? const <PageName>[])
        if (!_done.contains(n.name.toLowerCase())) n,
    ];
    if (names.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final shown = names.take(8).toList();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.auto_fix_high, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    'IN YOUR PAGES, NOT IN THE SYSTEM',
                    style: vaultHeading(
                      context,
                      size: 11,
                      color: scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 2),
                  ),
                ),
              ),
              if (names.length > 1) TextButton(onPressed: () => _add(names), child: Text('Add all ${names.length}')),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Named in your chapters the system’s way, and not in it yet.',
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 6),
          for (final n in shown)
            _Name(
              name: n,
              group: groupFor(widget.system, n.thing)?.name ?? groupNameOf(n.thing),
              onAdd: () => _add([n]),
              onNotPart: () => _notPart(n),
            ),
          if (names.length > shown.length)
            Text(
              'And ${names.length - shown.length} more.',
              style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
            ),
        ],
      ),
    );
  }
}

class _Name extends StatelessWidget {
  const _Name({required this.name, required this.group, required this.onAdd, required this.onNotPart});

  final PageName name;
  final String group;
  final VoidCallback onAdd;
  final VoidCallback onNotPart;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final n = name;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                '[${n.name}]',
                style: TextStyle(
                  fontFamily: 'JetBrains Mono',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: scheme.onSurface,
                ),
              ),
              Text(
                [n.thing.label, if (n.rank.isNotEmpty) 'rank ${n.rank}'].join(' · '),
                style: vaultText(context, size: 14, color: scheme.primary),
              ),
            ],
          ),
          Text(
            '${n.times == 1 ? 'Once' : '${n.times} times'}, from chapter ${n.chapter}: “${n.said}”',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          Wrap(
            spacing: 4,
            children: [
              FilledButton.tonal(onPressed: onAdd, child: Text('Add to $group')),
              TextButton(onPressed: onNotPart, child: const Text('Not part of it')),
            ],
          ),
        ],
      ),
    );
  }
}
