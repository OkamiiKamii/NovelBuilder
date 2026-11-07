import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/timeline/axis.dart';
import '../../shared/domain/timeline/event_record.dart';
import '../../shared/domain/timeline/histories.dart';
import '../../shared/domain/timeline/overlap.dart';
import '../../shared/domain/timeline/scale.dart';
import '../../shared/domain/timeline/tracks.dart';
import '../characters/widgets/parts.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import '../visualize/widgets/canon_badge.dart';
import 'timeline_providers.dart';
import 'widgets/timeline_chart.dart';

const _unreadable =
    'is not a date this timeline can read. Try a year (10, -500), a year and month (10-6), a day (10-6-14) or a month by name (June 10).';

/// Visualize → Timeline: the novel's events drawn along story time, or listed, through the same filters. Tracks split
/// it by character, place, faction, any kind of record, or plot thread; an event on several tracks is still one event.
/// Arranging and zooming only change how it looks: nothing here moves an event in time or writes anything.
class TimelineViewPage extends ConsumerStatefulWidget {
  const TimelineViewPage({super.key});

  @override
  ConsumerState<TimelineViewPage> createState() => _TimelineViewPageState();
}

class _TimelineViewPageState extends ConsumerState<TimelineViewPage> {
  String? _history;
  bool _list = false;
  String _grouping = 'none';
  TrackPrefs _prefs = const TrackPrefs();
  TimeWindow? _window;
  bool _arranging = false;
  bool _goingTo = false;
  String? _message;
  final _jump = TextEditingController();
  final _from = TextEditingController();
  final _until = TextEditingController();

  @override
  void dispose() {
    _jump.dispose();
    _from.dispose();
    _until.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(timelineProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    JsonMap config() => {
      'mode': _list ? 'list' : 'visual',
      'layout': {
        if (_grouping != 'none') ...{
          'group': _grouping,
          'trackOrder': _prefs.order,
          'hiddenTracks': _prefs.hidden,
          'foldedTracks': _prefs.folded,
          'focusTrack': _prefs.focus,
        },
        'history': ?_history,
      },
    };
    void apply(JsonMap c) {
      final layout = mapOrNull(c['layout']) ?? const {};
      setState(() {
        _list = c['mode'] == 'list';
        _grouping = Grouping.decode(strOrNull(layout['group'])).encoded;
        _prefs = TrackPrefs(
          order: strings(layout['trackOrder']),
          hidden: strings(layout['hiddenTracks']),
          folded: strings(layout['foldedTracks']),
          focus: strOrNull(layout['focusTrack']),
        );
        _history = strOrNull(layout['history']);
        _window = null;
      });
    }

    Widget frame(Widget child, {List<Widget> actions = const []}) => VizFrame(
      view: 'timeline',
      title: 'Timeline',
      subtitle: data?.cast.novelTitle,
      actions: actions,
      config: config,
      onApply: apply,
      child: child,
    );
    if (data == null) return frame(const SizedBox.shrink());
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final cal = data.calendar;
    final history = data.histories.containsKey(_history) ? _history : null;
    final StoryModel model = withHistory(data.model, data.histories, history);
    final all = history == null ? data.records : eventRecords(model);
    // The shared filters, through the same query every view uses.
    final keep = matchingKeys(model, viz.filter, [EntityType.event]);
    final records = [
      for (final r in all)
        if (keep == null || keep.contains('event:${r.id}')) r,
    ];
    final filtered = keep != null;
    void select(String? id) => notifier.select(id == null ? null : EntityRef(EntityType.event, id));
    final selectedId = viz.selection?.type == EntityType.event ? viz.selection!.id : null;
    final grouping = Grouping.decode(_grouping);
    final tracks = tracksFor(model, records, grouping);
    final arranged = arrange(tracks, _prefs);
    final byId = {for (final r in records) r.id: r};
    final domain = domainOf(records, day: cal.minutesPerDay, year: cal.minutesPerYear);
    final fit = domain == null ? null : (from: domain.from, to: domain.to);
    final window = _window ?? fit;
    final selected = byId[selectedId];
    final dated = records.where((r) => r.bounds != null).length;
    void setWindow(TimeWindow w) => setState(() {
      _window = w;
      _message = null;
    });

    void jump() {
      final read = readDate(_jump.text, cal);
      if (read == null || fit == null) {
        setState(() => _message = '“${_jump.text.trim()}” $_unreadable');
        return;
      }
      // Shown with its neighbours: three times the length of what was typed.
      setWindow((from: read.t - read.length, to: read.t + 2 * read.length));
    }

    void showRange() {
      final a = readDate(_from.text, cal);
      final b = readDate(_until.text, cal);
      if (a == null || b == null) {
        setState(() => _message = '“${(a == null ? _from : _until).text.trim()}” $_unreadable');
        return;
      }
      if (b.t + b.length <= a.t) {
        setState(() => _message = 'The stretch ends before it starts, so there is nothing to show.');
        return;
      }
      setWindow((from: a.t, to: b.t + b.length));
    }

    Widget box(double width, Widget child) => SizedBox(width: compact ? double.infinity : width, child: child);
    final ways = groupings(model);
    return frame(
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.view_timeline_outlined), label: Text('Drawing')),
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
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              if (data.historyList.isNotEmpty)
                box(
                  260,
                  DropdownButtonFormField<String>(
                    key: ValueKey('shown:$history'),
                    initialValue: history ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Timeline shown'),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('$mainTimeline (canon)')),
                      for (final h in data.historyList)
                        DropdownMenuItem(
                          value: h.id,
                          child: Text('${h.name} (${h.status.label})', overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) => setState(() {
                      _history = v == null || v.isEmpty ? null : v;
                      _window = null;
                    }),
                  ),
                ),
              box(
                220,
                DropdownButtonFormField<String>(
                  key: ValueKey('group:$_grouping'),
                  initialValue: ways.any((g) => g.value == _grouping) ? _grouping : 'none',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Tracks by'),
                  items: [for (final g in ways) DropdownMenuItem(value: g.value, child: Text(g.label))],
                  onChanged: (v) => setState(() {
                    _grouping = v ?? 'none';
                    _prefs = const TrackPrefs();
                  }),
                ),
              ),
            ],
          ),
          if (grouping is! OneLine && tracks.isNotEmpty) ...[
            const SizedBox(height: 8),
            _TrackPanel(
              tracks: tracks,
              arranged: arranged,
              prefs: _prefs,
              open: _arranging,
              onOpen: (v) => setState(() => _arranging = v),
              onPrefs: (p) => setState(() => _prefs = p),
            ),
          ],
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text(
              'Timeline of ${plural(dated, 'dated event')}, in the order they happen'
              '${grouping is OneLine ? '' : ', on ${plural(arranged.shown.length, 'track')}'}'
              '${filtered ? ' (${records.length} of ${all.length} events match)' : ''}.',
              style: theme.textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: 8),
          if (all.isEmpty)
            EmptyState(
              icon: Icons.view_timeline_outlined,
              title: 'No events yet',
              message: 'Events you add on the timeline are drawn here, in the order they happen.',
              action: FilledButton.icon(
                onPressed: () {
                  final id = actions.edit((x) => x.createEvent());
                  if (id != null) select(id);
                },
                icon: const Icon(Icons.add),
                label: const Text('Add event'),
              ),
            )
          else if (records.isEmpty)
            NoResultsState(onClear: () => notifier.setFilter({}))
          else if (arranged.shown.isEmpty)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Every track is hidden, so there is nothing to show.'),
                TextButton(
                  onPressed: () => setState(() => _prefs = const TrackPrefs()),
                  child: const Text('Show all tracks'),
                ),
              ],
            )
          else if (_list)
            _TrackList(data: data, model: model, tracks: arranged.shown, records: byId, onSelect: select)
          else if (window != null && fit != null) ...[
            Wrap(
              spacing: 4,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                IconButton(
                  tooltip: 'Zoom in',
                  onPressed: () => setWindow(zoomWindow(window, 1.5, (window.from + window.to) / 2, fit)),
                  icon: const Icon(Icons.zoom_in),
                ),
                IconButton(
                  tooltip: 'Zoom out',
                  onPressed: () => setWindow(zoomWindow(window, 1 / 1.5, (window.from + window.to) / 2, fit)),
                  icon: const Icon(Icons.zoom_out),
                ),
                IconButton(
                  tooltip: 'Back in time',
                  onPressed: () => setWindow(panWindow(window, -0.25)),
                  icon: const Icon(Icons.chevron_left),
                ),
                IconButton(
                  tooltip: 'On in time',
                  onPressed: () => setWindow(panWindow(window, 0.25)),
                  icon: const Icon(Icons.chevron_right),
                ),
                TextButton.icon(
                  onPressed: () => setState(() {
                    _window = null;
                    _message = null;
                  }),
                  icon: const Icon(Icons.fit_screen_outlined),
                  label: const Text('Fit all'),
                ),
                Text(
                  'Showing ${() {
                    final s = chooseScale(window, 900, cal);
                    return scaleName(s.unit, s.step);
                  }()}',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
            if (compact)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => setState(() => _goingTo = !_goingTo),
                  icon: Icon(_goingTo ? Icons.expand_less : Icons.event),
                  label: Text(_goingTo ? 'Hide' : 'Go to a date or a stretch'),
                ),
              ),
            if (!compact || _goingTo)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  box(
                    200,
                    TextField(
                      controller: _jump,
                      decoration: const InputDecoration(labelText: 'Jump to date', hintText: '10, 10-6, June 10'),
                      onSubmitted: (_) => jump(),
                    ),
                  ),
                  OutlinedButton(onPressed: jump, child: const Text('Go')),
                  box(
                    140,
                    TextField(
                      controller: _from,
                      decoration: const InputDecoration(labelText: 'Show from'),
                      onSubmitted: (_) => showRange(),
                    ),
                  ),
                  box(
                    140,
                    TextField(
                      controller: _until,
                      decoration: const InputDecoration(labelText: 'until'),
                      onSubmitted: (_) => showRange(),
                    ),
                  ),
                  OutlinedButton(onPressed: showRange, child: const Text('Show')),
                ],
              ),
            if (_message != null) ...[
              const SizedBox(height: 6),
              Semantics(
                liveRegion: true,
                child: Text(_message!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            ],
            const SizedBox(height: 8),
            LayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.maxWidth;
                // Rows are worked out once, for the whole story at this width, so zooming never moves a mark to
                // another row; every track is laid out against the same stretch of time.
                final chartTracks = [
                  for (final t in arranged.shown)
                    ChartTrack(
                      t,
                      layoutAxis(
                        [for (final id in t.eventIds) ?byId[id]],
                        width: width,
                        domain: domain,
                        useDomain: true,
                        day: cal.minutesPerDay,
                        year: cal.minutesPerYear,
                      ),
                    ),
                ];
                return DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border.all(color: theme.colorScheme.outlineVariant),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: TimelineChart(
                      badges: ref.watch(canonBadgesProvider),
                      tracks: chartTracks,
                      window: window,
                      all: fit,
                      calendar: cal,
                      selected: selectedId,
                      onSelect: select,
                      onWindow: setWindow,
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
            const TimelineLegend(),
          ],
          const SizedBox(height: 16),
          // In an alternate history an event may be one only that history has: its own details say so.
          if (selected != null && history != null)
            _Selection(data: data, model: model, all: all, record: selected, history: history, actions: actions),
          _Unplaced(
            records: [
              for (final t in arranged.shown)
                ...t.eventIds.map((id) => byId[id]).nonNulls.where((r) => r.bounds == null),
            ],
            onSelect: select,
          ),
        ],
      ),
    );
  }
}

/// Tracks: which are shown, in what order, folded or alone. Everything is a button or a checkbox, so it all works
/// from a keyboard or a screen reader.
class _TrackPanel extends StatelessWidget {
  const _TrackPanel({
    required this.tracks,
    required this.arranged,
    required this.prefs,
    required this.open,
    required this.onOpen,
    required this.onPrefs,
  });

  final List<Track> tracks;
  final ({List<Track> shown, List<Track> hidden, Track? focused}) arranged;
  final TrackPrefs prefs;
  final bool open;
  final ValueChanged<bool> onOpen;
  final ValueChanged<TrackPrefs> onPrefs;

  @override
  Widget build(BuildContext context) {
    final order = [...arranged.shown.map((t) => t.id), ...arranged.hidden.map((t) => t.id)];
    final byId = {for (final t in tracks) t.id: t};
    final focused = arranged.focused;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (focused != null)
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Showing only “${focused.label}”.'),
              TextButton(
                onPressed: () => onPrefs(prefs.copyWith(focus: () => null)),
                child: const Text('Show all tracks'),
              ),
            ],
          ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () => onOpen(!open),
            icon: Icon(open ? Icons.expand_less : Icons.tune),
            label: Text('Arrange tracks (${arranged.shown.length} of ${tracks.length} shown)'),
          ),
        ),
        if (open)
          for (final (i, id) in order.indexed)
            if (byId[id] case final t?)
              Wrap(
                spacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Checkbox(
                    value: !prefs.hidden.contains(id),
                    semanticLabel: '${t.label}, ${plural(t.eventIds.length, 'event')}',
                    onChanged: (_) => onPrefs(prefs.copyWith(hidden: toggleId(prefs.hidden, id))),
                  ),
                  Text('${t.label} (${t.eventIds.length})'),
                  IconButton(
                    tooltip: 'Move ${t.label} up',
                    onPressed: i == 0 ? null : () => onPrefs(prefs.copyWith(order: moveTrack(order, id, -1))),
                    icon: const Icon(Icons.arrow_upward),
                  ),
                  IconButton(
                    tooltip: 'Move ${t.label} down',
                    onPressed: i == order.length - 1
                        ? null
                        : () => onPrefs(prefs.copyWith(order: moveTrack(order, id, 1))),
                    icon: const Icon(Icons.arrow_downward),
                  ),
                  FilterChip(
                    label: const Text('Fold'),
                    tooltip: 'Fold ${t.label} into one line',
                    selected: prefs.folded.contains(id),
                    onSelected: (_) => onPrefs(prefs.copyWith(folded: toggleId(prefs.folded, id))),
                  ),
                  FilterChip(
                    label: const Text('Only this'),
                    tooltip: 'Show ${t.label} alone',
                    selected: prefs.focus == id,
                    onSelected: (on) => onPrefs(prefs.copyWith(focus: () => on ? id : null)),
                  ),
                ],
              ),
      ],
    );
  }
}

/// The same events as the drawing, as lists: one per track shown, in story order.
class _TrackList extends StatelessWidget {
  const _TrackList({
    required this.data,
    required this.model,
    required this.tracks,
    required this.records,
    required this.onSelect,
  });

  final TimelineData data;
  final StoryModel model;
  final List<Track> tracks;
  final Map<String, EventRecord> records;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    double start(EventRecord r) => r.bounds?.start.lo ?? double.infinity;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final t in tracks) ...[
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: Semantics(header: true, child: Text(t.label, style: theme.textTheme.titleMedium)),
          ),
          if (t.folded)
            NotRecorded('Folded: ${plural(t.eventIds.length, 'event')}.')
          else
            for (final r in [for (final id in t.eventIds) ?records[id]]..sort((a, b) => start(a).compareTo(start(b))))
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(r.title.isEmpty ? 'Untitled event' : r.title),
                subtitle: Text(r.bounds == null ? 'Not placed in time' : r.label),
                onTap: () => onSelect(r.id),
              ),
        ],
      ],
    );
  }
}

/// The selected event: what it is, what shares its time, and where to edit it.
class _Selection extends StatelessWidget {
  const _Selection({
    required this.data,
    required this.model,
    required this.all,
    required this.record,
    required this.history,
    required this.actions,
  });

  final TimelineData data;
  final StoryModel model;
  final List<EventRecord> all;
  final EventRecord record;
  final String? history;
  final TimelineActions actions;

  @override
  Widget build(BuildContext context) {
    final same = atTheSameTime(all, record.id, data.calendar.minutesPerDay);
    final place = model.entries[record.event.locationId]?.name;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ProfileBox(
        title: record.title.isEmpty ? 'Untitled event' : record.title,
        caption: record.bounds == null ? 'Not placed in time' : record.label,
        trailing: history == null && data.model.events.containsKey(record.id)
            ? FilledButton.icon(
                onPressed: () => actions.openEvent(record.id),
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Edit this event'),
              )
            : TextButton(
                onPressed: () => actions.router.go('/plan/histories?history=$history'),
                child: const Text('Change it in its alternate history'),
              ),
        children: [
          if (place != null) Text('At $place'),
          if (record.event.characters.isNotEmpty)
            Text(
              'With ${[for (final c in record.event.characters) model.entries[c.id]?.name ?? 'someone deleted'].join(', ')}',
            ),
          if (same.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('At the same time', style: Theme.of(context).textTheme.titleSmall),
            for (final x in same)
              Text(
                [
                  x.record.title,
                  x.how.words,
                  if (model.entries[x.record.event.locationId]?.name case final p?) 'at $p',
                ].join(' · '),
              ),
          ],
        ],
      ),
    );
  }
}

/// Events with no date that can be worked out: never given an invented place, listed apart with why.
class _Unplaced extends StatelessWidget {
  const _Unplaced({required this.records, required this.onSelect});

  final List<EventRecord> records;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final unplaced = layoutAxis(records).unplaced;
    if (unplaced.isEmpty) return const SizedBox.shrink();
    final seen = <String>{};
    return ProfileBox(
      title: 'Not placed in time (${unplaced.length})',
      children: [
        for (final u in unplaced)
          if (seen.add(u.id))
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => onSelect(u.id),
                child: Text('${u.title.isEmpty ? 'Untitled event' : u.title}: ${u.reason}'),
              ),
            ),
      ],
    );
  }
}
