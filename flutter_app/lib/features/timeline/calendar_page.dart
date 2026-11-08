import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/calendar.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/timeline/calendar_presets.dart';
import '../../shared/domain/timeline/dates.dart';
import '../characters/widgets/parts.dart';
import '../workspace/area_switch.dart';
import 'timeline_providers.dart';

/// How this novel counts time: the standard calendar, or one of its own with its own months, days, weeks, eras and
/// seasons. Changes are a draft until saved, so the author sees what they will do first: how dates will read, and which
/// events have dates the calendar does not have. Saving never changes an event.
class CalendarPage extends ConsumerStatefulWidget {
  const CalendarPage({super.key});

  @override
  ConsumerState<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends ConsumerState<CalendarPage> {
  JsonMap? _draft;

  /// Stable keys for the month and era rows, so a field keeps its place while rows move.
  List<int> _monthKeys = [];
  List<int> _eraKeys = [];
  var _nextKey = 0;
  String? _status;

  /// The settings as saved, which a new draft starts from.
  JsonMap _saved = defaultCalendarSettings();

  List<int> _keys(int n) => [for (var i = 0; i < n; i++) _nextKey++];

  void _set(JsonMap patch, {List<int>? months, List<int>? eras}) => setState(() {
    _draft = {...(_draft ?? _saved), ...patch};
    if (months != null) _monthKeys = months;
    if (eras != null) _eraKeys = eras;
    _status = null;
  });

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(timelineProvider);
    if (data == null) {
      return PageScaffold(
        title: 'Calendar',
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'The calendar belongs to one novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => TimelineActions(context, '').router.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final saved = _saved = calendarSettingsOf(data.cast.snapshot.rows('storyCalendars').firstOrNull);
    final current = _draft ?? saved;
    final months = maps(current['months']);
    final eras = maps(current['eras']);
    if (_monthKeys.length != months.length) _monthKeys = _keys(months.length);
    if (_eraKeys.length != eras.length) _eraKeys = _keys(eras.length);
    final changed = _draft != null && !jsonEquals(_draft, saved);
    final problems = calendarProblems(current);
    final preview = Calendar.fromJson(current);
    final custom = current['kind'] == 'custom';
    final away = problems.isNotEmpty
        ? const <({String id, String name, String problem})>[]
        : [
            for (final e in data.model.events.values)
              if ((e.when == null ? null : preview.dateProblem(e.when!)) ??
                      (e.end == null ? null : preview.dateProblem(e.end!))
                  case final problem?)
                (id: e.id, name: e.name, problem: problem),
          ];
    final sampleYear = preview.eras.isNotEmpty ? preview.eras.last.startYear + 3 : 10;
    final sample = formatDate(ExactDate(sampleYear, month: 1, day: 1), null, preview);
    String monthLabel(int i) {
      final name = str(months[i]['name']).trim();
      return name.isEmpty ? 'month ${i + 1}' : name;
    }

    void setMonth(int i, JsonMap patch) => _set({
      'months': [
        for (final (j, m) in months.indexed) j == i ? {...m, ...patch} : m,
      ],
    });
    void moveMonth(int i, int by) {
      final next = [...months];
      final keys = [..._monthKeys];
      next[i] = months[i + by];
      next[i + by] = months[i];
      keys[i] = _monthKeys[i + by];
      keys[i + by] = _monthKeys[i];
      _set({'months': next}, months: keys);
    }

    void removeMonth(int i) {
      final seasons = mapOrNull(current['seasons']) ?? const {};
      _set(
        {
          'months': [
            for (final (j, m) in months.indexed)
              if (j != i) m,
          ],
          'seasons': {
            for (final s in Season.values)
              s.name: () {
                final at = intOrNull(seasons[s.name]) ?? 1;
                final moved = (at > i + 1 ? at - 1 : at).clamp(0, months.length - 1);
                return moved == 0 ? 1 : moved;
              }(),
          },
        },
        months: [
          for (final (j, k) in _monthKeys.indexed)
            if (j != i) k,
        ],
      );
    }

    void setEra(int i, JsonMap patch) => _set({
      'eras': [
        for (final (j, e) in eras.indexed) j == i ? {...e, ...patch} : e,
      ],
    });
    Object? numberOf(String text) =>
        text.trim().isEmpty ? null : (int.tryParse(text.trim()) ?? num.tryParse(text.trim()));
    Widget small(String text) =>
        Text(text, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant));

    void save() {
      final kind = custom;
      final name = str(current['name']).trim();
      final result = actions.edit((x) => x.saveCalendar(current));
      if (result == null) return;
      setState(() {
        _draft = null;
        _status =
            'Calendar saved. Every date in the novel is now read in the ${kind ? '“$name” calendar' : 'standard calendar'}.';
      });
    }

    return PageScaffold(
      title: 'Story calendar',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: planParts, current: '/plan/calendar'),
          const SizedBox(height: 16),
          RadioGroup<bool>(
            groupValue: custom,
            onChanged: (v) => _set({'kind': v == true ? 'custom' : 'standard'}),
            child: const Column(
              children: [
                RadioListTile<bool>(
                  value: false,
                  title: Text('Standard calendar'),
                  subtitle: Text('Twelve months, 24-hour days, years as “Year 10”.'),
                ),
                RadioListTile<bool>(
                  value: true,
                  title: Text('A calendar of this novel’s own'),
                  subtitle: Text('Months, days, weeks and eras of your choosing.'),
                ),
              ],
            ),
          ),
          if (custom) ...[
            const SizedBox(height: 12),
            // BEGIN FROM A CALENDAR: ready-made ones, as cards, that fill in every month at once (then Save).
            Text('Begin from one of these, or build your own below', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final p in calendarPresets)
                    Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: SizedBox(
                        width: 220,
                        child: Card(
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => _set(
                              {...p.settings},
                              months: _keys(maps(p.settings['months']).length),
                              eras: _keys(maps(p.settings['eras']).length),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Icon(Icons.calendar_month_outlined, color: theme.colorScheme.primary),
                                      const SizedBox(width: 8),
                                      Expanded(child: Text(p.name, style: theme.textTheme.titleSmall)),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(p.about, style: theme.textTheme.bodySmall),
                                  const SizedBox(height: 6),
                                  small(yearOf(p.settings)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _DraftField(
              key: const ValueKey('calendar-name'),
              label: 'Calendar name',
              value: str(current['name']),
              onChanged: (v) => _set({'name': v}),
            ),
            const SizedBox(height: 16),
            ProfileBox(
              title: 'Months',
              trailing: TextButton.icon(
                onPressed: months.length >= calendarLimits.months
                    ? null
                    : () => _set(
                        {
                          'months': [
                            ...months,
                            {'name': '', 'days': 30},
                          ],
                        },
                        months: [..._monthKeys, _nextKey++],
                      ),
                icon: const Icon(Icons.add),
                label: const Text('Add a month'),
              ),
              children: [
                for (final (i, m) in months.indexed)
                  Padding(
                    key: ValueKey('month-row:${_monthKeys[i]}'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        SizedBox(
                          width: 200,
                          child: _DraftField(
                            label: 'Name of month ${i + 1}',
                            value: str(m['name']),
                            onChanged: (v) => setMonth(i, {'name': v}),
                          ),
                        ),
                        SizedBox(
                          width: 110,
                          child: _DraftField(
                            label: 'Days in ${monthLabel(i)}',
                            value: m['days'] == null ? '' : '${m['days']}',
                            number: true,
                            onChanged: (v) => setMonth(i, {'days': numberOf(v)}),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Move ${monthLabel(i)} up',
                          onPressed: i == 0 ? null : () => moveMonth(i, -1),
                          icon: const Icon(Icons.arrow_upward),
                        ),
                        IconButton(
                          tooltip: 'Move ${monthLabel(i)} down',
                          onPressed: i == months.length - 1 ? null : () => moveMonth(i, 1),
                          icon: const Icon(Icons.arrow_downward),
                        ),
                        IconButton(
                          tooltip: 'Remove ${monthLabel(i)}',
                          onPressed: months.length == 1 ? null : () => removeMonth(i),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                SizedBox(
                  width: 180,
                  child: _DraftField(
                    key: const ValueKey('hours'),
                    label: 'Hours in a day',
                    value: current['hoursPerDay'] == null ? '' : '${current['hoursPerDay']}',
                    number: true,
                    onChanged: (v) => _set({'hoursPerDay': numberOf(v)}),
                  ),
                ),
                SizedBox(
                  width: 180,
                  child: _DraftField(
                    key: const ValueKey('week'),
                    label: 'Days in a week',
                    value: current['daysPerWeek'] == null ? '' : '${current['daysPerWeek']}',
                    number: true,
                    onChanged: (v) => _set({'daysPerWeek': numberOf(v)}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ProfileBox(
              title: 'Eras',
              caption:
                  'Optional. Years from an era’s first year on are counted in it: an era “Second Age” beginning in year 1000 makes year 1003 “Second Age 4”. Years before the first era stay “Year N”. Dates are still typed as plain years.',
              trailing: TextButton.icon(
                onPressed: eras.length >= calendarLimits.eras
                    ? null
                    : () => _set(
                        {
                          'eras': [
                            ...eras,
                            {
                              'name': '',
                              'startYear': eras.isEmpty
                                  ? 1
                                  : eras.map((e) => intOrNull(e['startYear']) ?? 0).reduce((a, b) => a > b ? a : b) +
                                        1000,
                            },
                          ],
                        },
                        eras: [..._eraKeys, _nextKey++],
                      ),
                icon: const Icon(Icons.add),
                label: const Text('Add an era'),
              ),
              children: [
                if (eras.isEmpty) const NotRecorded('No eras: years read “Year N”.'),
                for (final (i, e) in eras.indexed)
                  Padding(
                    key: ValueKey('era-row:${_eraKeys[i]}'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        SizedBox(
                          width: 200,
                          child: _DraftField(
                            label: 'Name of era ${i + 1}',
                            value: str(e['name']),
                            onChanged: (v) => setEra(i, {'name': v}),
                          ),
                        ),
                        SizedBox(
                          width: 150,
                          child: _DraftField(
                            label: 'From year',
                            value: e['startYear'] == null ? '' : '${e['startYear']}',
                            number: true,
                            onChanged: (v) => setEra(i, {'startYear': numberOf(v)}),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Remove ${str(e['name']).trim().isEmpty ? 'era ${i + 1}' : str(e['name']).trim()}',
                          onPressed: () => _set(
                            {
                              'eras': [
                                for (final (j, x) in eras.indexed)
                                  if (j != i) x,
                              ],
                            },
                            eras: [
                              for (final (j, k) in _eraKeys.indexed)
                                if (j != i) k,
                            ],
                          ),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            ProfileBox(
              title: 'Seasons',
              caption:
                  'The month each season begins in, for dates given as “Summer of Year 10”. A season lasts until the next begins.',
              children: [
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final s in Season.values)
                      SizedBox(
                        width: 200,
                        child: DropdownButtonFormField<int>(
                          key: ValueKey('season:${s.name}:${mapOrNull(current['seasons'])?[s.name]}:${months.length}'),
                          initialValue: () {
                            final at = intOrNull(mapOrNull(current['seasons'])?[s.name]);
                            return at != null && at >= 1 && at <= months.length ? at : null;
                          }(),
                          isExpanded: true,
                          decoration: InputDecoration(labelText: '${seasonLabels[s]} begins in'),
                          items: [
                            for (final (i, m) in months.indexed)
                              DropdownMenuItem(
                                value: i + 1,
                                child: Text(
                                  str(m['name']).trim().isEmpty ? 'Month ${i + 1}' : str(m['name']).trim(),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (v) => _set({
                            'seasons': {...?mapOrNull(current['seasons']), s.name: v},
                          }),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          if (problems.isNotEmpty)
            Semantics(
              liveRegion: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('To fix before saving', style: theme.textTheme.titleSmall),
                  for (final p in problems) Text('• $p', style: TextStyle(color: theme.colorScheme.error)),
                ],
              ),
            )
          else
            Semantics(liveRegion: true, child: Text('${describeCalendar(preview)}. Dates read like “$sample”.')),
          if (away.isNotEmpty) ...[
            const SizedBox(height: 12),
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${away.length} ${away.length == 1 ? 'event has a date' : 'events have dates'} this calendar does not have. '
                      '${changed ? 'Saving keeps them as they are:' : 'They are kept as they are:'} the timeline lists them apart, saying why, until the date or the calendar changes.',
                    ),
                    for (final m in away.take(8))
                      TextButton(
                        onPressed: () => actions.openEvent(m.id),
                        child: Text('${m.name}: ${m.problem}', textAlign: TextAlign.start),
                      ),
                    if (away.length > 8) small('…and ${away.length - 8} more.'),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              FilledButton(onPressed: changed && problems.isEmpty ? save : null, child: const Text('Save calendar')),
              TextButton(
                onPressed: changed ? () => setState(() => _draft = null) : null,
                child: const Text('Discard changes'),
              ),
            ],
          ),
          if (_status != null) ...[const SizedBox(height: 8), Semantics(liveRegion: true, child: Text(_status!))],
        ],
      ),
    );
  }
}

/// A field of the draft: what is typed is the draft, so it never jumps back while the author types.
class _DraftField extends StatefulWidget {
  const _DraftField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.number = false,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final bool number;

  @override
  State<_DraftField> createState() => _DraftFieldState();
}

class _DraftFieldState extends State<_DraftField> {
  late final _controller = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(_DraftField old) {
    super.didUpdateWidget(old);
    // Discarding the draft, or the saved calendar changing, puts the stored value back.
    if (widget.value != _controller.text && widget.value != old.value) _controller.text = widget.value;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _controller,
    keyboardType: widget.number ? const TextInputType.numberWithOptions(signed: true) : null,
    decoration: InputDecoration(labelText: widget.label),
    onChanged: widget.onChanged,
  );
}
