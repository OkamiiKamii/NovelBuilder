import 'package:flutter/material.dart';

import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../../shared/domain/systems/formula.dart';
import '../../characters/widgets/parts.dart';
import '../progression_providers.dart';
import 'sheet_view.dart';

/// One codex entry's sheet on one blueprint: where it stands on each track, experience and points, its own values,
/// and what it holds. A sheet keeps only what is its own; everything a class or skill brings is read from the
/// blueprint.
class SheetEditor extends StatelessWidget {
  const SheetEditor({
    super.key,
    required this.model,
    required this.system,
    required this.sheet,
    required this.name,
    required this.actions,
  });

  final StoryModel model;
  final SystemBlueprint system;
  final SystemSheet sheet;
  final String name;
  final ProgressionActions actions;

  void _edit(JsonMap Function(SystemSheet current) change) => actions.systems((x) => x.updateSheet(sheet.id, change));
  void _later(String key, JsonMap Function(SystemSheet current) change) =>
      actions.systemsLater('${sheet.id}:$key', (x) => x.updateSheet(sheet.id, change));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = system.items;
    Widget box(double w, Widget child) => SizedBox(width: w, child: child);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final track in system.tracks)
              box(
                240,
                track.kind == 'levels'
                    ? SavedTextField(
                        key: ValueKey('${sheet.id}:${track.id}'),
                        label:
                            '${track.name}${sheet.xp.any((e) => e.trackId == track.id) ? ' (where they started)' : ''}',
                        value: formatNumber(_level(sheet.progress[track.id])),
                        keyboardType: TextInputType.number,
                        dense: true,
                        onChanged: (text) => _later(track.id, (c) {
                          final n = double.tryParse(text.trim()) ?? 1;
                          return {
                            'progress': {...?mapOrNull(c.raw['progress']), track.id: n < 1 ? 1 : (n + 0.5).floor()},
                          };
                        }),
                      )
                    : DropdownButtonFormField<String>(
                        key: ValueKey('${sheet.id}:${track.id}:${sheet.progress[track.id]}'),
                        initialValue: track.stages.any((s) => s.id == sheet.progress[track.id])
                            ? sheet.progress[track.id]! as String
                            : track.stages.firstOrNull?.id,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: track.name, isDense: true),
                        items: [for (final s in track.stages) DropdownMenuItem(value: s.id, child: Text(s.name))],
                        onChanged: (v) => _edit(
                          (c) => {
                            'progress': {...?mapOrNull(c.raw['progress']), track.id: v},
                          },
                        ),
                      ),
              ),
            for (final v in system.variables.where((v) => v.kind != 'derived'))
              box(
                200,
                v.kind == 'choice'
                    ? DropdownButtonFormField<String>(
                        key: ValueKey('${sheet.id}:${v.id}:${sheet.values[v.id]}'),
                        initialValue: v.options.contains(sheet.values[v.id])
                            ? sheet.values[v.id]! as String
                            : v.options.firstOrNull,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: v.name, isDense: true),
                        items: [for (final o in v.options) DropdownMenuItem(value: o, child: Text(o))],
                        onChanged: (chosen) => _edit(
                          (c) => {
                            'values': {...?mapOrNull(c.raw['values']), v.id: chosen},
                          },
                        ),
                      )
                    : SavedTextField(
                        key: ValueKey('${sheet.id}:${v.id}'),
                        label: '${v.name}${v.unit.isNotEmpty ? ' (${v.unit})' : ''}',
                        hint: '${formatNumber(v.base)} (the system’s starting value)',
                        value: sheet.values[v.id] is double ? formatNumber(sheet.values[v.id]! as double) : '',
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        dense: true,
                        onChanged: (text) => _later(v.id, (c) {
                          final values = {...?mapOrNull(c.raw['values'])}..remove(v.id);
                          final n = double.tryParse(text.trim());
                          return {
                            'values': {...values, if (text.trim().isNotEmpty && n != null && n.isFinite) v.id: n},
                          };
                        }),
                      ),
              ),
          ],
        ),
        _Leveling(model: model, system: system, sheet: sheet, name: name, edit: _edit),
        for (final group in system.groupList)
          if (items.where((i) => i.groupId == group.id).toList() case final options when options.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: group.single
                  ? SizedBox(
                      width: 300,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('${sheet.id}:${group.id}:${sheet.itemIds.join(',')}'),
                        initialValue: options.where((o) => sheet.itemIds.contains(o.id)).lastOrNull?.id ?? '',
                        isExpanded: true,
                        decoration: InputDecoration(labelText: group.name, isDense: true),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('None')),
                          for (final o in options) DropdownMenuItem(value: o.id, child: Text(o.name)),
                        ],
                        onChanged: (chosen) => _edit((c) {
                          final others = [
                            for (final id in c.itemIds)
                              if (!options.any((o) => o.id == id)) id,
                          ];
                          return {
                            'itemIds': [...others, if (chosen != null && chosen.isNotEmpty) chosen],
                          };
                        }),
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(group.name, style: theme.textTheme.labelLarge),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            for (final item in options)
                              FilterChip(
                                label: Text(
                                  system.rankName(item).isEmpty ? item.name : '${item.name} · ${system.rankName(item)}',
                                ),
                                selected: sheet.itemIds.contains(item.id),
                                onSelected: (held) => _edit(
                                  (c) => {
                                    'itemIds': held
                                        ? [...c.itemIds, item.id]
                                        : [
                                            for (final id in c.itemIds)
                                              if (id != item.id) id,
                                          ],
                                  },
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
            ),
        const SizedBox(height: 16),
        ProfileBox(
          title: '$name’s sheet',
          children: [SheetView(system: system, profile: SheetProfile.of(sheet))],
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: () => actions.systems((x) => x.removeSheet(sheet.id)),
            child: Text('Take $name off ${system.name}'),
          ),
        ),
      ],
    );
  }

  static double _level(Object? raw) {
    final n = raw is double ? raw : (raw is String ? double.tryParse(raw) : null);
    return n == null || n == 0 ? 1 : n;
  }
}

/// LEVELLING: experience and points for one sheet. Nothing here stores a level: the author logs what was earned and
/// where, and the level is read off the track's curve. Points a level brings are placed by hand; placing more than
/// were earned is shown, never refused.
class _Leveling extends StatefulWidget {
  const _Leveling({
    required this.model,
    required this.system,
    required this.sheet,
    required this.name,
    required this.edit,
  });
  final StoryModel model;
  final SystemBlueprint system;
  final SystemSheet sheet;
  final String name;
  final void Function(JsonMap Function(SystemSheet current) change) edit;

  @override
  State<_Leveling> createState() => _LevelingState();
}

class _LevelingState extends State<_Leveling> {
  final _amount = TextEditingController();
  final _source = TextEditingController();
  final _note = TextEditingController();
  String? _trackId;
  String _nodeId = '';

  @override
  void dispose() {
    _amount.dispose();
    _source.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final system = widget.system;
    final sheet = widget.sheet;
    final tracks = [
      for (final t in system.tracks)
        if (t.kind == 'levels' && t.curve.trim().isNotEmpty) t,
    ];
    final points = computeSheet(system, SheetProfile.of(sheet)).points;
    if (tracks.isEmpty && points == null) return const SizedBox.shrink();
    final track = tracks.where((t) => t.id == _trackId).firstOrNull ?? tracks.firstOrNull;
    final nodes = [...widget.model.nodes.values];
    final position = StoryOrder.of(nodes).position;
    final documents = [
      for (final n in nodes)
        if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene) n,
    ]..sort((a, b) => (position[a.id] ?? 0).compareTo(position[b.id] ?? 0));
    final history = xpHistory(
      system,
      SheetProfile.of(sheet),
      (id) => id == null ? -1 : (position[id] ?? 9007199254740991),
    );
    String place(String? id) => id == null
        ? 'Before the story'
        : (nodes.where((n) => n.id == id).firstOrNull?.title ?? 'A chapter that was removed');
    final amount = double.tryParse(_amount.text.trim());
    void log() {
      if (track == null || amount == null || !amount.isFinite || amount == 0) return;
      final entry = {
        'id': newId(),
        'trackId': track.id,
        'amount': amount,
        'source': _source.text,
        'nodeId': _nodeId.isEmpty ? null : _nodeId,
        'note': _note.text,
      };
      widget.edit(
        (c) => {
          'xp': [...maps(c.raw['xp']), entry],
        },
      );
      setState(() {
        _amount.clear();
        _note.clear();
      });
    }

    void give(String variableId, double by) => widget.edit((c) {
      final spent = {...?mapOrNull(c.raw['spent'])};
      final next = ((spent[variableId] as num?)?.toDouble() ?? 0) + by;
      if (next <= 0) {
        spent.remove(variableId);
      } else {
        spent[variableId] = next;
      }
      return {'spent': spent};
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (track != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: ProfileBox(
              title: 'Experience',
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (tracks.length > 1)
                      SizedBox(
                        width: 180,
                        child: DropdownButtonFormField<String>(
                          initialValue: track.id,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Counts towards', isDense: true),
                          items: [for (final t in tracks) DropdownMenuItem(value: t.id, child: Text(t.name))],
                          onChanged: (v) => setState(() => _trackId = v),
                        ),
                      ),
                    SizedBox(
                      width: 140,
                      child: TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        decoration: InputDecoration(
                          labelText: '${track.curveUnit.isEmpty ? 'Experience' : track.curveUnit} gained',
                          hintText: '− for a loss',
                          isDense: true,
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    SizedBox(
                      width: 160,
                      child: TextField(
                        controller: _source,
                        decoration: InputDecoration(
                          labelText: 'Where it came from',
                          hintText: track.sources.isEmpty ? 'Source' : track.sources.join(', '),
                          isDense: true,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 200,
                      child: DropdownButtonFormField<String>(
                        initialValue: _nodeId,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Where in the story', isDense: true),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('Before the story')),
                          for (final n in documents)
                            DropdownMenuItem(
                              value: n.id,
                              child: Text(
                                '${n.kind == NodeKind.scene ? '  ' : ''}${n.title}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (v) => setState(() => _nodeId = v ?? ''),
                      ),
                    ),
                    SizedBox(
                      width: 200,
                      child: TextField(
                        controller: _note,
                        decoration: const InputDecoration(labelText: 'What happened (optional)', isDense: true),
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: amount == null || !amount.isFinite || amount == 0 ? null : log,
                      child: const Text('Log'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (history.isEmpty)
                  Text(
                    'Nothing logged: ${widget.name}’s ${track.name.toLowerCase()} is the number set above. Log what '
                    'they earn and the level is worked out from the curve, starting from that number.',
                    style: theme.textTheme.bodySmall,
                  )
                else
                  for (final (i, h) in history.indexed)
                    () {
                      final earlier = history.take(i).where((x) => x.track.id == h.track.id).lastOrNull?.level;
                      final rose = h.level > (earlier ?? SheetEditor._level(sheet.progress[h.track.id]).round());
                      final e = h.entry;
                      final what = [e.source, e.note].where((x) => x.isNotEmpty).join(' · ');
                      return ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          '${e.amount > 0 ? '+' : '−'}${formatNumber(e.amount.abs())} ${h.track.curveUnit}  '
                          '${what.isEmpty ? 'Unlabelled' : what} · ${place(e.nodeId)}',
                        ),
                        subtitle: Text(
                          '${h.track.name} ${h.level}${rose ? ' (up)' : ''}',
                          style: rose ? TextStyle(color: theme.colorScheme.primary) : null,
                        ),
                        trailing: IconButton(
                          tooltip:
                              'Remove ${formatNumber(e.amount)} ${h.track.curveUnit} from ${e.source.isEmpty ? place(e.nodeId) : e.source}',
                          icon: const Icon(Icons.close),
                          onPressed: () => widget.edit(
                            (c) => {
                              'xp': [
                                for (final x in maps(c.raw['xp']))
                                  if (x['id'] != e.id) x,
                              ],
                            },
                          ),
                        ),
                      );
                    }(),
              ],
            ),
          ),
        if (points != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: ProfileBox(
              title: points.unspent >= 0
                  ? 'Points: ${formatNumber(points.unspent)} to place'
                  : 'Points: ${formatNumber(-points.unspent)} more placed than earned',
              caption:
                  '${formatNumber(points.earned)} earned from levels, ${formatNumber(points.spent)} placed. ${points.unspent < 0 ? 'Nothing stops you: this is only a note that the sheet has more than the levels gave.' : 'A point placed adds one to the attribute.'}',
              children: [
                for (final v in system.variables.where(takesPoints))
                  Row(
                    children: [
                      Expanded(child: Text(v.name)),
                      IconButton(
                        tooltip: 'Take a point from ${v.name}',
                        onPressed: (sheet.spent[v.id] ?? 0) <= 0 ? null : () => give(v.id, -1),
                        icon: const Icon(Icons.remove),
                      ),
                      SizedBox(
                        width: 36,
                        child: Text(
                          formatNumber(sheet.spent[v.id] ?? 0),
                          textAlign: TextAlign.center,
                          semanticsLabel: 'Points placed on ${v.name}: ${formatNumber(sheet.spent[v.id] ?? 0)}',
                        ),
                      ),
                      IconButton(
                        tooltip: 'Place a point on ${v.name}',
                        onPressed: () => give(v.id, 1),
                        icon: const Icon(Icons.add),
                      ),
                    ],
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
