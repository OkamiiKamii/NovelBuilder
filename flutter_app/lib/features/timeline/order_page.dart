import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/timeline/narrative.dart';
import '../characters/widgets/parts.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'event_page.dart' show revealChoices;
import 'timeline_providers.dart';

/// Each way of telling has a line of its own, named in the legend: never colour alone.
const _dashes = {
  RevealRole.told: <double>[],
  RevealRole.flashback: [6.0, 4.0],
  RevealRole.flashforward: [10.0, 4.0],
  RevealRole.foreshadowed: [1.5, 4.0],
  RevealRole.mentioned: <double>[],
  RevealRole.revealed: [7.0, 3.0, 1.5, 3.0],
};

const _row = 48.0;

/// Visualize → Story and reading order: when things happen beside when the reader meets them. Linking a chapter, or
/// marking how it tells an event, never moves the event in time and never reorders a chapter.
class OrderPage extends ConsumerStatefulWidget {
  const OrderPage({super.key});

  @override
  ConsumerState<OrderPage> createState() => _OrderPageState();
}

class _OrderPageState extends ConsumerState<OrderPage> {
  bool _list = false;
  bool _allNotes = false;

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(timelineProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child, {List<Widget> actions = const []}) => VizFrame(
      view: 'order',
      title: 'Story and reading order',
      subtitle: data?.cast.novelTitle,
      actions: actions,
      config: () => {'mode': _list ? 'list' : 'visual'},
      onApply: (c) => setState(() => _list = c['mode'] == 'list'),
      child: child,
    );
    if (data == null) return frame(const SizedBox.shrink());
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final model = data.model;
    // Back and ahead are always worked out against the whole book; filtering only narrows what is shown.
    final orders = twoOrders(model);
    final notes = tellingNotes(orders, model);
    // The shared filters narrow the events; the chapters shown are those that tell one of them.
    final keep = matchingKeys(model, viz.filter, [EntityType.event]);
    final events = [
      for (final e in orders.events)
        if (keep == null || keep.contains('event:${e.id}')) e,
    ];
    final selected = viz.selection?.type == EntityType.event || viz.selection?.type == EntityType.node
        ? viz.selection!.id
        : null;
    void select(String id) {
      if (selected == id) return notifier.select(null);
      notifier.select(EntityRef(model.events.containsKey(id) ? EntityType.event : EntityType.node, id));
    }

    final shownEvents = {for (final e in events) e.id};
    final tellings = [
      for (final t in orders.tellings)
        if (shownEvents.contains(t.eventId)) t,
    ];
    final nodes = [
      for (final n in orders.nodes)
        if (n.tellings.any((t) => shownEvents.contains(t.eventId))) n,
    ];
    String eventName(String id) => model.events[id]?.name ?? 'An event';
    String rank(int? r) => r == null ? 'not placed in time' : '${ordinal(r + 1)} in story order';

    return frame(
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.compare_arrows), label: Text('Side by side')),
            ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('List')),
          ],
          selected: {_list},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _list = v.first),
        ),
      ],
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(liveRegion: true, child: Text(orderSummary(orders), style: theme.textTheme.titleSmall)),
          const SizedBox(height: 16),
          if (notes.isNotEmpty) ...[
            ProfileBox(
              title: 'Worth a look',
              children: [
                for (final n in _allNotes ? notes : notes.take(5))
                  Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(n.note)),
                if (notes.length > 5)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      onPressed: () => setState(() => _allNotes = !_allNotes),
                      child: Text(_allNotes ? 'Show fewer' : 'Show all ${notes.length}'),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
          ],
          if (orders.events.isEmpty)
            const EmptyState(
              icon: Icons.compare_arrows,
              title: 'No events yet',
              message: 'Add events on the timeline and link them to the chapters that tell them.',
            )
          else if (_list)
            _Lists(
              model: data,
              events: events,
              tellings: tellings,
              eventName: eventName,
              rank: rank,
              onEvent: actions.openEvent,
            )
          else
            _SideBySide(
              nodes: nodes,
              events: events,
              tellings: tellings,
              selected: selected,
              eventName: eventName,
              onSelect: select,
              onOpenEvent: actions.openEvent,
            ),
          if (!_list) ...[const SizedBox(height: 12), const _Legend()],
        ],
      ),
    );
  }
}

class _SideBySide extends StatelessWidget {
  const _SideBySide({
    required this.nodes,
    required this.events,
    required this.tellings,
    required this.selected,
    required this.eventName,
    required this.onSelect,
    required this.onOpenEvent,
  });

  final List<OrderedNode> nodes;
  final List<OrderedEvent> events;
  final List<StoryTelling> tellings;
  final String? selected;
  final String Function(String id) eventName;
  final ValueChanged<String> onSelect;
  final ValueChanged<String> onOpenEvent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final rows = math.max(1, math.max(nodes.length, events.length));
    final nodeRow = {for (final (i, n) in nodes.indexed) n.id: i};
    final eventRow = {for (final (i, e) in events.indexed) e.id: i};
    bool touches(StoryTelling t) => t.nodeId == selected || t.eventId == selected;
    final related = {
      for (final t in tellings)
        if (touches(t)) ...[t.nodeId, t.eventId],
    };
    Widget item(String id, String label, String said, {VoidCallback? onLong}) {
      final isSelected = id == selected;
      return SizedBox(
        height: _row,
        child: Semantics(
          button: true,
          selected: isSelected,
          label: said,
          excludeSemantics: true,
          child: InkWell(
            onTap: () => onSelect(id),
            onLongPress: onLong,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              alignment: AlignmentDirectional.centerStart,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                color: isSelected
                    ? theme.colorScheme.secondaryContainer
                    : (related.contains(id) ? theme.colorScheme.surfaceContainerHighest : null),
              ),
              child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('As the reader meets it', style: theme.textTheme.labelLarge)),
            SizedBox(width: compact ? 72 : 120),
            Expanded(child: Text('As it happens', style: theme.textTheme.labelLarge)),
          ],
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: rows * _row,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  children: [
                    for (final n in nodes)
                      item(
                        n.id,
                        n.label,
                        '${n.label} tells ${n.tellings.map((t) => '${eventName(t.eventId)} (${revealChoices[t.role]!.toLowerCase()}, ${orderWords(t)})').join('; ')}',
                      ),
                  ],
                ),
              ),
              SizedBox(
                width: compact ? 72 : 120,
                child: CustomPaint(
                  size: Size(compact ? 72 : 120, rows * _row),
                  painter: _Lines(
                    lines: [
                      for (final t in tellings)
                        if (nodeRow[t.nodeId] case final a?)
                          if (eventRow[t.eventId] case final b?)
                            (
                              a: a,
                              b: b,
                              role: t.role,
                              out: t.back || t.ahead,
                              on: selected == null ? null : touches(t),
                            ),
                    ],
                    color: theme.colorScheme.primary,
                    muted: theme.colorScheme.outlineVariant,
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  children: [
                    for (final e in events)
                      item(
                        e.id,
                        e.title.isEmpty ? 'Untitled event' : e.title,
                        '${e.title}, ${e.storyRank == null ? 'not placed in time' : e.when}: '
                        '${e.tellings.isEmpty ? 'not told in any chapter yet' : 'told in ${e.tellings.length} ${e.tellings.length == 1 ? 'place' : 'places'}'}',
                        onLong: () => onOpenEvent(e.id),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (selected != null && events.any((e) => e.id == selected))
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(onPressed: () => onOpenEvent(selected!), child: Text('Open “${eventName(selected!)}”')),
          ),
      ],
    );
  }
}

class _Lines extends CustomPainter {
  _Lines({required this.lines, required this.color, required this.muted});

  final List<({int a, int b, RevealRole role, bool out, bool? on})> lines;
  final Color color;
  final Color muted;

  @override
  void paint(Canvas canvas, Size size) {
    double y(int i) => i * _row + _row / 2;
    for (final l in lines) {
      final paint = Paint()
        ..color = l.on == false ? muted : color
        ..style = PaintingStyle.stroke
        ..strokeWidth = l.role == RevealRole.mentioned ? 1 : (l.on == true ? 3 : (l.out ? 2.2 : 1.6));
      final path = Path()
        ..moveTo(0, y(l.a))
        ..cubicTo(size.width / 2, y(l.a), size.width / 2, y(l.b), size.width, y(l.b));
      final dash = _dashes[l.role]!;
      if (dash.isEmpty) {
        canvas.drawPath(path, paint);
        continue;
      }
      for (final metric in path.computeMetrics()) {
        var d = 0.0;
        var i = 0;
        while (d < metric.length) {
          final len = dash[i % dash.length];
          if (i.isEven) canvas.drawPath(metric.extractPath(d, math.min(d + len, metric.length)), paint);
          d += len;
          i++;
        }
      }
    }
  }

  @override
  bool shouldRepaint(_Lines old) => true;
}

class _Legend extends StatelessWidget {
  const _Legend();

  static const _words = {
    RevealRole.told: 'Told here (solid)',
    RevealRole.flashback: 'As a flashback (dashed)',
    RevealRole.flashforward: 'As a flash-forward (long dashes)',
    RevealRole.foreshadowed: 'Foreshadowed (dotted)',
    RevealRole.mentioned: 'Only mentioned (thin)',
    RevealRole.revealed: 'Revealed afterwards (dash-dot)',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 6,
          children: [
            for (final MapEntry(key: role, value: words) in _words.entries)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CustomPaint(
                    size: const Size(36, 12),
                    painter: _Lines(
                      lines: [(a: 0, b: 0, role: role, out: false, on: null)],
                      color: theme.colorScheme.primary,
                      muted: theme.colorScheme.outlineVariant,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Flexible(child: Text(words, style: theme.textTheme.bodySmall)),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class _Lists extends StatelessWidget {
  const _Lists({
    required this.model,
    required this.events,
    required this.tellings,
    required this.eventName,
    required this.rank,
    required this.onEvent,
  });

  final TimelineData model;
  final List<OrderedEvent> events;
  final List<StoryTelling> tellings;
  final String Function(String id) eventName;
  final String Function(int? rank) rank;
  final ValueChanged<String> onEvent;

  @override
  Widget build(BuildContext context) {
    final whenOf = {for (final e in events) e.id: e.when};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfileBox(
          title: 'As the reader meets it',
          children: [
            if (tellings.isEmpty) const NotRecorded('No event is linked to a chapter or scene yet.'),
            for (final t in tellings)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${nodeLabel(model.model, t.nodeId)}: ${eventName(t.eventId)}'),
                subtitle: Text(
                  '${revealChoices[t.role]} · ${t.storyRank == null ? 'not placed in time' : whenOf[t.eventId]} · ${rank(t.storyRank)} · ${orderWords(t)}',
                ),
                onTap: () => onEvent(t.eventId),
              ),
          ],
        ),
        const SizedBox(height: 16),
        ProfileBox(
          title: 'As it happens',
          children: [
            for (final e in events)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(e.title.isEmpty ? 'Untitled event' : e.title),
                subtitle: Text(
                  '${e.storyRank == null ? 'Not placed in time' : e.when} · '
                  '${e.tellings.isEmpty ? 'Not told in any chapter yet' : e.tellings.map((t) => tellingWords(t, model.model)).join('; ')}',
                ),
                onTap: () => onEvent(e.id),
              ),
          ],
        ),
      ],
    );
  }
}
