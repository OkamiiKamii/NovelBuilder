import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/stakes.dart';
import '../../../shared/domain/characters/write_them_in.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/relation.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../plot/plot_providers.dart';
import '../../write/write_providers.dart';
import '../characters_providers.dart';
import 'vault.dart';

/// Opens the way to write the character [entryId] into the book.
Future<void> showWriteThemIn(BuildContext context, CastData cast, String entryId) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (_) => WriteThemInPage(cast: cast, entryId: entryId),
  ),
);

/// WRITE THEM IN (`write_them_in.dart`): from a character straight to the page. Where the scene goes (a chapter still
/// blank, a new chapter at the end, a new scene in the latest chapter), who else is in it (those they are tied to
/// first) and whether it is told through their eyes, and the spark to start from, made of what is written about them
/// (or the author's own). **Start writing** makes the chapter or scene when it is a new one, keeps the spark as its
/// objective and the cast as who appears in its plan, and opens it in the editor. No words of the story are written.
class WriteThemInPage extends ConsumerStatefulWidget {
  const WriteThemInPage({super.key, required this.cast, required this.entryId});

  final CastData cast;
  final String entryId;

  @override
  ConsumerState<WriteThemInPage> createState() => _WriteThemInPageState();
}

class _WriteThemInPageState extends ConsumerState<WriteThemInPage> {
  int _place = 0;
  int _spark = 0;
  bool _eyes = true;
  final Set<String> _with = {};
  final _own = TextEditingController();

  @override
  void dispose() {
    _own.dispose();
    super.dispose();
  }

  List<StoryNode> get _documents => [
    for (final n in readingOrder([for (final r in widget.cast.snapshot.rows('chapters')) StoryNode(r)]))
      if (isDocument(n.kind)) n,
  ];

  /// Those they are tied to, each with what they are to them, the latest stage of the tie.
  List<({String id, String other, String tie})> _ties(Listed me) {
    final byId = {for (final l in widget.cast.list) l.entry.id: l};
    final out = <({String id, String other, String tie})>[];
    for (final r in widget.cast.snapshot.rows('characterRelations').map(CharacterRelation.new)) {
      final other = r.fromId == me.entry.id ? r.toId : (r.toId == me.entry.id ? r.fromId : null);
      final them = other == null ? null : byId[other];
      if (them == null || them.profile.archived || out.any((t) => t.id == other)) continue;
      final stage = r.stages.lastOrNull;
      final tie = stage == null ? '' : (stage.title.trim().isNotEmpty ? stage.title.trim() : stage.label.trim());
      out.add((id: them.entry.id, other: them.entry.name, tie: tie));
    }
    return out;
  }

  void _start(Listed me, List<ScenePlace> places, List<SceneSpark> sparks) {
    final novelId = widget.cast.novelId;
    final place = places[_place.clamp(0, places.length - 1)];
    final spark = _spark == sparks.length ? _own.text.trim() : sparks[_spark].text;
    final m = ref.read(manuscriptServiceProvider);
    final String id;
    switch (place.kind) {
      case PlaceKind.blank:
        id = place.nodeId!;
      case PlaceKind.newChapter:
        final after = _documents.where((n) => n.id == place.nodeId).firstOrNull;
        id = m.create(novelId, NodeKind.chapter, parentId: after?.parentId).id;
      case PlaceKind.newScene:
        id = m.create(novelId, NodeKind.scene, parentId: place.nodeId).id;
    }
    ref
        .read(plotServiceProvider)
        .change(
          novelId,
          (c) => c.updatePlan(
            id,
            (plan) => {
              if (spark.isNotEmpty) 'objective': spark,
              'appearIds': {...strings(plan['appearIds']), me.entry.id, ..._with}.toList(),
              if (_eyes) 'povIds': [me.entry.id],
            },
          ),
        );
    ref.read(selectedNodeProvider.notifier).select(id);
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.go('/write');
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final me = widget.cast.list.where((l) => l.entry.id == widget.entryId).firstOrNull;
    if (me == null) return const Scaffold(body: SizedBox.shrink());
    final name = me.entry.name;
    final docs = _documents;
    final places = placesFor([
      for (final n in docs)
        (
          id: n.id,
          kind: n.kindKey,
          parentId: n.parentId,
          title: n.title,
          words: n.wordCount,
          planned: (widget.cast.model.plans[n.id]?.objective.trim() ?? '').isNotEmpty,
        ),
    ]);
    final ties = _ties(me);
    final fields = {for (final f in me.entry.fields) f.key.trim().toLowerCase(): f.value};
    final sparks = sparksFor(name, stakesOf(fields), [for (final t in ties) (other: t.other, tie: t.tie)]);
    final others = [
      ...ties.map((t) => (id: t.id, name: t.other, tie: t.tie)),
      for (final l in widget.cast.list)
        if (l.entry.id != me.entry.id && !l.profile.archived && !ties.any((t) => t.id == l.entry.id))
          (id: l.entry.id, name: l.entry.name, tie: ''),
    ].take(16).toList();
    final ownChosen = _spark == sparks.length;
    final ready = !ownChosen || _own.text.trim().isNotEmpty;
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 6),
      child: Text(
        text,
        style: vaultHeading(context, size: 12, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.6),
      ),
    );

    return Scaffold(
      appBar: AppBar(title: Text('Write $name in')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: RadioGroup<int>(
              groupValue: _place,
              onChanged: (v) => setState(() => _place = v ?? _place),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'A scene with $name, started from what you know of them. Nothing is written for you: the spark '
                    'is kept as the scene’s objective, and the page is yours.',
                    style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                  ),
                  heading('WHERE IT GOES'),
                  for (final (i, p) in places.indexed)
                    RadioListTile<int>(
                      key: ValueKey('place-${p.kind.name}'),
                      value: i,
                      contentPadding: EdgeInsets.zero,
                      title: Text(p.label),
                    ),
                  heading('WHO ELSE IS THERE'),
                  if (others.isEmpty)
                    Text(
                      'No one else in the cast yet: $name alone.',
                      style: vaultText(context, size: 14.5, color: scheme.onSurfaceVariant),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final o in others)
                          FilterChip(
                            label: Text(o.tie.isEmpty ? o.name : '${o.name} · ${o.tie}'),
                            selected: _with.contains(o.id),
                            onSelected: (on) => setState(() => on ? _with.add(o.id) : _with.remove(o.id)),
                          ),
                      ],
                    ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _eyes,
                    onChanged: (v) => setState(() => _eyes = v),
                    title: Text('Told through $name’s eyes'),
                  ),
                  heading('THE SPARK'),
                  RadioGroup<int>(
                    groupValue: _spark,
                    onChanged: (v) => setState(() => _spark = v ?? _spark),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final (i, s) in sparks.indexed)
                          RadioListTile<int>(
                            value: i,
                            contentPadding: EdgeInsets.zero,
                            title: Text(s.text, style: vaultText(context, size: 16, color: scheme.onSurface)),
                            subtitle: Text(s.from),
                          ),
                        RadioListTile<int>(
                          value: sparks.length,
                          contentPadding: EdgeInsets.zero,
                          title: TextField(
                            controller: _own,
                            onTap: () => setState(() => _spark = sparks.length),
                            onChanged: (_) => setState(() => _spark = sparks.length),
                            decoration: const InputDecoration(labelText: 'Or your own'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Center(
                    child: FilledButton.icon(
                      onPressed: ready ? () => _start(me, places, sparks) : null,
                      icon: const Icon(Icons.edit_note),
                      label: const Text('Start writing'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
