import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/widgets/form_dialog.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/factions/ties.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/model/validity.dart';
import '../../shared/domain/progression/track.dart' show whenWords;
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/link.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../relationships/relationship_page.dart' show relate;
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'widgets/when_picker.dart';

/// Each kind of tie by colour and by line.
const _tieStyle = {
  TieRole.ally: (color: 0xff6b7a2b, dash: <double>[]),
  TieRole.rival: (color: 0xffa8436b, dash: [6.0, 4.0]),
  TieRole.influence: (color: 0xff4f5fa3, dash: <double>[]),
  TieRole.territory: (color: 0xff8a8276, dash: [1.0, 4.0]),
  TieRole.other: (color: 0xffa3622b, dash: [4.0, 2.0, 1.0, 2.0]),
};

const _tieKinds = [
  'member-of',
  'leads',
  'allied-with',
  'at-war-with',
  'considers-rival',
  'controls',
  'influences',
  'located-in',
];

/// A point in words: the end of the story, a chapter, an event.
String pointWords(Anchor? at, StoryModel model) => at == null ? 'the end of the story' : whenWords(at, model);

/// FACTIONS
/// Who belongs to each faction and who leads it, its allies and enemies, what it controls and influences, where it is
/// based, as of any point in the story, and how all of that changed: read from the typed connections and when each
/// holds. A map of the factions and their sway when wanted; always a table.
class FactionsPage extends ConsumerStatefulWidget {
  const FactionsPage({super.key});

  @override
  ConsumerState<FactionsPage> createState() => _FactionsPageState();
}

class _FactionsPageState extends ConsumerState<FactionsPage> {
  bool _list = false;
  Anchor? _at;
  String? _faction;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'factions',
      title: 'Factions',
      filters: false,
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {if (_at != null) 'fat': _at!.raw, 'ffaction': ?_faction},
      },
      onApply: (JsonMap c) => setState(() {
        final l = mapOrNull(c['layout']) ?? const {};
        _list = c['mode'] == 'list';
        _at = Anchor.fromJson(l['fat']);
        _faction = strOrNull(l['ffaction']);
      }),
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.hub_outlined), label: Text('Map')),
            ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('Table')),
          ],
          selected: {_list},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _list = v.first),
        ),
      ],
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    final actions = CharacterActions(context, cast.novelId);
    final factions = factionsOf(model);
    final focus = factions.where((f) => f.id == _faction).firstOrNull;
    final at = _at;
    final toolbar = Wrap(
      spacing: 12,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: 260,
          child: AsOfField(model: model, label: 'Factions as of', value: at, onChanged: (v) => setState(() => _at = v)),
        ),
        if (factions.isNotEmpty)
          SizedBox(
            width: 240,
            child: DropdownButtonFormField<String>(
              key: ValueKey('faction:${focus?.id}'),
              initialValue: focus?.id ?? '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Faction looked at', isDense: true),
              items: [
                const DropdownMenuItem(value: '', child: Text('Every faction')),
                for (final f in factions) DropdownMenuItem(value: f.id, child: Text(f.name)),
              ],
              onChanged: (v) => setState(() => _faction = v == null || v.isEmpty ? null : v),
            ),
          ),
        FilledButton.icon(
          onPressed: () => showDialog<void>(
            context: context,
            builder: (_) => TieForm(actions: actions, faction: focus?.id),
          ),
          icon: const Icon(Icons.add_link),
          label: const Text('Record a tie'),
        ),
      ],
    );
    if (factions.isEmpty) {
      return frame(
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            toolbar,
            const SizedBox(height: 12),
            const EmptyState(
              icon: Icons.groups_outlined,
              title: 'No factions yet',
              message:
                  'Add factions under Organize → World, or record that someone is a member of something, or that '
                  'something controls a place.',
            ),
          ],
        ),
      );
    }
    final selected = viz.selection?.type == EntityType.entry ? viz.selection!.id : null;
    final shown = focus == null ? factions : [focus];
    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          toolbar,
          const SizedBox(height: 12),
          if (!_list) ...[
            FactionMap(
              model: model,
              at: at,
              selectedId: selected,
              onPick: (id) => notifier.select(EntityRef(EntityType.entry, id)),
            ),
            const SizedBox(height: 12),
          ],
          for (final f in shown)
            _FactionCard(
              model: model,
              faction: f,
              at: at,
              selected: selected == f.id,
              onPick: () => notifier.select(EntityRef(EntityType.entry, f.id)),
            ),
          Text(
            'As of ${pointWords(at, model)}. A tie with no time given holds as far as anyone has said: nothing here is '
            'assumed to last. “May hold” marks a tie whose time cannot be compared with this point (a chapter against '
            'an event).',
            style: theme.textTheme.bodySmall,
          ),
          if (focus != null) ...[
            const SizedBox(height: 16),
            FactionHistory(model: model, faction: focus, actions: actions),
          ],
        ],
      ),
    );
  }
}

/// One faction at the point: its ties by kind, each a line; a kind with none is left out.
class _FactionCard extends StatelessWidget {
  const _FactionCard({
    required this.model,
    required this.faction,
    required this.at,
    required this.selected,
    required this.onPick,
  });
  final StoryModel model;
  final Entry faction;
  final Anchor? at;
  final bool selected;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (:byRole, :notNow) = factionAt(model, faction.id, at);
    String words(Tie t) => [
      t.role == TieRole.other ? t.words : t.otherName,
      if (t.holds == Truth.unknown) '(may hold)',
      if (t.timeless) '(no time given)',
    ].join(' ');
    return Card(
      color: selected ? theme.colorScheme.secondaryContainer : null,
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onPick,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(header: true, child: Text(faction.name, style: theme.textTheme.titleMedium)),
              if (byRole.isEmpty) Text('No ties hold here.', style: theme.textTheme.bodySmall),
              for (final role in TieRole.values)
                if (byRole[role] case final ties?)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: '${role.label}: ', style: theme.textTheme.labelLarge),
                          TextSpan(text: ties.map(words).join(', ')),
                        ],
                      ),
                    ),
                  ),
              if (notNow > 0)
                Text(
                  '$notNow ${notNow == 1 ? 'tie has' : 'ties have'} ended or not yet begun by then.',
                  style: theme.textTheme.bodySmall,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Every tie of one faction, in order, with when and how each began and ended, and ending one that still holds.
class FactionHistory extends StatefulWidget {
  const FactionHistory({super.key, required this.model, required this.faction, required this.actions});
  final StoryModel model;
  final Entry faction;
  final CharacterActions actions;

  @override
  State<FactionHistory> createState() => _FactionHistoryState();
}

class _FactionHistoryState extends State<FactionHistory> {
  String? _ending;
  JsonMap? _at;
  final _how = TextEditingController();

  @override
  void dispose() {
    _how.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final ties = factionTies(model, widget.faction.id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: Text('How ${widget.faction.name} changed', style: theme.textTheme.titleMedium)),
        if (ties.isEmpty) const Text('No ties recorded.'),
        for (final t in ties) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t.words),
            subtitle: Text('${t.when} · ${t.role.label}'),
            trailing: t.link.validity?.until == null && _ending != t.link.id
                ? TextButton(
                    onPressed: () => setState(() {
                      _ending = t.link.id;
                      _at = null;
                      _how.clear();
                    }),
                    child: Text('End…', semanticsLabel: 'End: ${t.words}'),
                  )
                : null,
          ),
          if (_ending == t.link.id)
            Card.outlined(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    WhenPicker(model: model, label: 'Ends', value: _at, onChanged: (v) => setState(() => _at = v)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _how,
                      decoration: const InputDecoration(
                        labelText: 'How it ends',
                        hintText: 'left, expelled, dissolved, a truce…',
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        FilledButton.tonal(
                          onPressed: () {
                            final at = _at;
                            if (at == null) return widget.actions.tell('Choose when it ends.');
                            final done = relate(widget.actions, (r) {
                              r.endConnection(t.link.id, at, endHow: _how.text);
                              return true;
                            });
                            if (done == true) setState(() => _ending = null);
                          },
                          child: const Text('End it'),
                        ),
                        TextButton(onPressed: () => setState(() => _ending = null), child: const Text('Cancel')),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ],
    );
  }
}

/// Factions on a circle, their territory beyond them, and the ties holding at the point: allies, enemies, influence,
/// control.
class FactionMap extends StatefulWidget {
  const FactionMap({super.key, required this.model, required this.at, required this.selectedId, required this.onPick});
  final StoryModel model;
  final Anchor? at;
  final String? selectedId;
  final ValueChanged<String> onPick;

  @override
  State<FactionMap> createState() => _FactionMapState();
}

class _FactionMapState extends State<FactionMap> {
  final _controller = TransformationController();
  String? _fittedFor;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final (:factions, :edges, :territories) = factionNetwork(model, widget.at);
    final r = math.max(150.0, factions.length * 45.0);
    final pos = <String, Offset>{};
    for (final (i, f) in factions.indexed) {
      final a = (i / factions.length) * math.pi * 2 - math.pi / 2;
      pos[f.id] = Offset(math.cos(a) * r, math.sin(a) * r);
    }
    // Territory just beyond the first faction that controls or influences it.
    for (final (i, t) in territories.indexed) {
      final owner = edges.firstWhere((e) => e.other.id == t.id);
      final from = pos[owner.link.fromId] ?? Offset.zero;
      final len = from.distance == 0 ? 1.0 : from.distance;
      final spread = (i % 3) - 1;
      pos[t.id] = Offset(
        from.dx + (from.dx / len) * 110 - (from.dy / len) * spread * 60,
        from.dy + (from.dy / len) * 110 + (from.dx / len) * spread * 60,
      );
    }
    final xs = [for (final p in pos.values) p.dx];
    final ys = [for (final p in pos.values) p.dy];
    final minX = xs.reduce(math.min) - 120;
    final minY = ys.reduce(math.min) - 60;
    final size = Size(xs.reduce(math.max) + 120 - minX, ys.reduce(math.max) + 70 - minY);
    Offset at(String id) => pos[id]! - Offset(minX, minY);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final roles = [
      for (final role in [TieRole.ally, TieRole.rival, TieRole.influence, TieRole.territory, TieRole.other])
        if (edges.any((e) => e.role == role)) role,
    ];
    final ids = {for (final f in factions) f.id};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: compact ? 380 : 480,
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final box = constraints.biggest;
                  final key = '${pos.length}|${edges.length}|${box.width.round()}';
                  if (_fittedFor != key) {
                    _fittedFor = key;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      final scale = math.min(1.0, math.min(box.width / size.width, box.height / size.height));
                      _controller.value = Matrix4.diagonal3Values(scale, scale, 1)
                        ..setTranslationRaw(
                          (box.width - size.width * scale) / 2,
                          (box.height - size.height * scale) / 2,
                          0,
                        );
                    });
                  }
                  return Semantics(
                    container: true,
                    label:
                        'Faction map: ${factions.length} ${factions.length == 1 ? 'faction' : 'factions'} and '
                        '${edges.length} ${edges.length == 1 ? 'tie' : 'ties'} holding. The cards below give the same '
                        'in words.',
                    child: InteractiveViewer(
                      transformationController: _controller,
                      constrained: false,
                      boundaryMargin: const EdgeInsets.all(300),
                      minScale: 0.2,
                      maxScale: 3,
                      child: SizedBox.fromSize(
                        size: size,
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: CustomPaint(
                                painter: _TiesPainter([
                                  for (final e in edges)
                                    if (pos.containsKey(e.link.fromId) && pos.containsKey(e.link.toId))
                                      (from: at(e.link.fromId), to: at(e.link.toId), role: e.role),
                                ]),
                              ),
                            ),
                            for (final MapEntry(key: id, value: _) in pos.entries)
                              Positioned(
                                left: at(id).dx - 60,
                                top: at(id).dy - 22,
                                width: 120,
                                child: Semantics(
                                  button: true,
                                  selected: widget.selectedId == id,
                                  label: ids.contains(id)
                                      ? '${model.entries[id]?.name}, a faction'
                                      : '${model.entries[id]?.name}, held in sway',
                                  excludeSemantics: true,
                                  child: GestureDetector(
                                    onTap: () => widget.onPick(id),
                                    child: Column(
                                      children: [
                                        Container(
                                          width: ids.contains(id) ? 44 : 24,
                                          height: ids.contains(id) ? 44 : 24,
                                          decoration: BoxDecoration(
                                            shape: ids.contains(id) ? BoxShape.circle : BoxShape.rectangle,
                                            borderRadius: ids.contains(id) ? null : BorderRadius.circular(3),
                                            color: ids.contains(id)
                                                ? theme.colorScheme.primaryContainer
                                                : theme.colorScheme.surfaceContainerHighest,
                                            border: Border.all(
                                              color: widget.selectedId == id
                                                  ? theme.colorScheme.primary
                                                  : theme.colorScheme.outline,
                                              width: widget.selectedId == id ? 3 : 1,
                                            ),
                                          ),
                                        ),
                                        Text(
                                          model.entries[id]?.name ?? '',
                                          textAlign: TextAlign.center,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: theme.textTheme.labelMedium,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            for (final role in roles)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CustomPaint(size: const Size(26, 10), painter: _TiesPainter.swatch(role)),
                  const SizedBox(width: 6),
                  Text(role.label, style: theme.textTheme.bodySmall),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class _TiesPainter extends CustomPainter {
  _TiesPainter(this.lines) : swatchRole = null;
  _TiesPainter.swatch(TieRole role) : lines = const [], swatchRole = role;
  final List<({Offset from, Offset to, TieRole role})> lines;
  final TieRole? swatchRole;

  void _line(Canvas canvas, Offset a, Offset b, TieRole role) {
    final style = _tieStyle[role] ?? _tieStyle[TieRole.other]!;
    final paint = Paint()
      ..color = Color(style.color)
      ..strokeWidth = role == TieRole.territory ? 2 : 3
      ..strokeCap = StrokeCap.round;
    final d = b - a;
    final len = d.distance;
    if (len == 0) return;
    if (style.dash.isEmpty) {
      canvas.drawLine(a, b, paint);
    } else {
      var at = 0.0;
      var i = 0;
      final u = d / len;
      while (at < len) {
        final step = style.dash[i % style.dash.length];
        if (i.isEven) canvas.drawLine(a + u * at, a + u * math.min(at + step, len), paint);
        at += step;
        i++;
      }
    }
    if (role == TieRole.influence && swatchRole == null) {
      final u = d / len;
      final n = Offset(-u.dy, u.dx);
      final tip = b - u * 24;
      canvas.drawPath(
        Path()
          ..moveTo(tip.dx, tip.dy)
          ..lineTo(tip.dx - u.dx * 10 + n.dx * 5, tip.dy - u.dy * 10 + n.dy * 5)
          ..lineTo(tip.dx - u.dx * 10 - n.dx * 5, tip.dy - u.dy * 10 - n.dy * 5)
          ..close(),
        Paint()..color = Color(style.color),
      );
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (swatchRole case final role?) {
      _line(canvas, Offset(0, size.height / 2), Offset(size.width, size.height / 2), role);
      return;
    }
    for (final l in lines) {
      _line(canvas, l.from, l.to, l.role);
    }
  }

  @override
  bool shouldRepaint(_TiesPainter old) => true;
}

/// Recording a tie: who or what, what kind of tie (or the author's own), to what, from when, and how it began.
class TieForm extends ConsumerStatefulWidget {
  const TieForm({super.key, required this.actions, this.faction});
  final CharacterActions actions;
  final String? faction;

  @override
  ConsumerState<TieForm> createState() => _TieFormState();
}

class _TieFormState extends ConsumerState<TieForm> {
  String? _from;
  String _type = 'member-of';
  late String? _to = widget.faction;
  JsonMap? _begins;
  final _own = TextEditingController();
  final _how = TextEditingController();

  @override
  void dispose() {
    _own.dispose();
    _how.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) return const SizedBox.shrink();
    final model = cast.model;
    final entries = stableSorted(model.entries.values, (a, b) => localeCompare(a.name, b.name));
    DropdownButtonFormField<String> pick(String label, String? value, ValueChanged<String?> set) =>
        DropdownButtonFormField<String>(
          initialValue: entries.any((e) => e.id == value) ? value : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label, isDense: true),
          hint: const Text('Choose…'),
          items: [
            for (final e in entries)
              DropdownMenuItem(
                value: e.id,
                child: Text(e.name, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: set,
        );
    return FormDialog(
      title: 'Record a tie',
      width: 480,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          pick('Who or what', _from, (v) => setState(() => _from = v)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _type,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Kind of tie', isDense: true),
            items: [
              for (final k in _tieKinds) DropdownMenuItem(value: k, child: Text(connectionType(k).label)),
              const DropdownMenuItem(value: 'own', child: Text('Your own…')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'member-of'),
          ),
          if (_type == 'own') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _own,
              decoration: const InputDecoration(
                labelText: 'Your own kind of tie',
                hintText: 'Owes a debt to, Sworn to, Pays tribute to…',
                isDense: true,
              ),
            ),
          ],
          const SizedBox(height: 12),
          pick('Tied to', _to, (v) => setState(() => _to = v)),
          const SizedBox(height: 12),
          WhenPicker(model: model, label: 'Begins', value: _begins, onChanged: (v) => setState(() => _begins = v)),
          const SizedBox(height: 12),
          TextField(
            controller: _how,
            decoration: const InputDecoration(
              labelText: 'How it began',
              hintText: 'joined, elected, a treaty… (optional)',
              isDense: true,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final kind = _type == 'own' ? _own.text.trim() : _type;
            final from = _from;
            final to = _to;
            if (from == null || to == null || kind.isEmpty) {
              return widget.actions.tell('Choose both ends, and the kind of tie.');
            }
            final made = relate(
              widget.actions,
              (r) => r.createConnection(
                from: EntityRef(EntityType.entry, from),
                to: EntityRef(EntityType.entry, to),
                type: kind,
                startsAt: _begins,
                how: _how.text,
              ),
            );
            if (made != null && context.mounted) Navigator.of(context).pop();
          },
          child: const Text('Record the tie'),
        ),
      ],
    );
  }
}
