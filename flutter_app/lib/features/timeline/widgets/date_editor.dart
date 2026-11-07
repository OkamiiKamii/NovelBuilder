import 'package:flutter/material.dart';

import '../../../shared/domain/json.dart';
import '../../../shared/domain/records/calendar.dart';
import '../../../shared/domain/records/event.dart';
import '../../../shared/domain/timeline/chronology.dart';
import '../../../shared/domain/timeline/dates.dart';
import 'number_field.dart';

/// A change to a date, worked out from the date as it is stored at the moment it is saved, so typing a year and
/// choosing a month in quick succession can never undo one another.
typedef DateEdit = JsonMap Function(JsonMap stored);

const _unitNames = {
  TimeUnit.minutes: 'minutes',
  TimeUnit.hours: 'hours',
  TimeUnit.days: 'days',
  TimeUnit.weeks: 'weeks',
  TimeUnit.months: 'months',
  TimeUnit.years: 'years',
};

/// A date in the novel's calendar: exact (a year, narrowed to a month, a day, a time), approximate (a year, a season
/// or a month of it), relative to another event, or undated. Months, days and hours are the calendar's. A value the
/// calendar does not have is said, not saved: the date stays as it was.
class DateEditor extends StatelessWidget {
  const DateEditor({
    super.key,
    required this.when,
    required this.calendar,
    required this.others,
    required this.onChange,
    this.legend = 'When',
    this.prefix = '',
    this.offered = precisions,
  });

  /// The date as stored.
  final JsonMap? when;
  final Calendar calendar;

  /// The events a relative date can be given from.
  final List<Placed> others;
  final ValueChanged<DateEdit> onChange;
  final String legend;

  /// Names a second date's fields apart ("End year"), so both can be on screen at once.
  final String prefix;
  final List<String> offered;

  String _named(String text) => prefix.isEmpty ? text : '$prefix ${text.toLowerCase()}';

  void _setPrecision(String precision) => onChange((stored) {
    final year = numOrNull(stored['year']) ?? 1;
    final month = stored['month'];
    return switch (precision) {
      'exact' => {'precision': 'exact', 'year': year, 'month': month, 'day': null, 'hour': null, 'minute': null},
      'approximate' => {'precision': 'approximate', 'year': year, 'month': month, 'season': null},
      'relative' => {
        'precision': 'relative',
        'anchorId': others.firstOrNull?.event.id,
        'amount': 1,
        'unit': 'years',
        'direction': 'before',
      },
      _ => {'precision': 'unknown'},
    };
  });

  void _patch(String precision, JsonMap patch) =>
      onChange((stored) => stored['precision'] == precision ? {...stored, ...patch} : stored);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = EventDate.fromJson(when);
    final precision = date?.precision ?? 'unknown';
    Widget box(Widget child, [double width = 170]) => SizedBox(width: width, child: child);
    String? era(num year) => calendar.eras.isEmpty || year != year.truncate() ? null : calendar.yearName(year.toInt());

    final fields = switch (date) {
      ExactDate(:final year, :final month, :final day, :final hour, :final minute) => [
        box(
          NumberField(
            key: ValueKey('${_named('Year')}:$year'),
            label: _named('Year'),
            value: year,
            allowEmpty: false,
            helper: era(year),
            onCommit: (v) => _patch('exact', {'year': v}),
          ),
        ),
        box(
          DropdownButtonFormField<int>(
            key: ValueKey('${_named('Month')}:$month'),
            initialValue: month ?? 0,
            isExpanded: true,
            decoration: InputDecoration(labelText: _named('Month')),
            items: _monthItems(month),
            onChanged: (v) => _patch('exact', {'month': v == 0 ? null : v}),
          ),
          200,
        ),
        box(
          NumberField(
            key: ValueKey('${_named('Day')}:$day:$month'),
            label: _named('Day'),
            value: day,
            enabled: month != null && month != 0,
            hint: month != null && month != 0 ? '1–${calendar.daysIn(month)}' : null,
            check: (v) => v != null && month != null && (v < 1 || v > calendar.daysIn(month))
                ? '${calendar.monthName(month)} has ${calendar.daysIn(month)} days: day ${v.toInt()} was not saved.'
                : null,
            onCommit: (v) => _patch('exact', {'day': v}),
          ),
          120,
        ),
        box(
          NumberField(
            key: ValueKey('${_named('Hour')}:$hour:$day'),
            label: _named('Hour'),
            value: hour,
            enabled: day != null && day != 0,
            hint: '0–${calendar.hoursPerDay - 1}',
            check: (v) => v != null && (v < 0 || v >= calendar.hoursPerDay)
                ? 'A day has ${calendar.hoursPerDay} hours, from 0 to ${calendar.hoursPerDay - 1}: hour ${v.toInt()} was not saved.'
                : null,
            onCommit: (v) =>
                _patch('exact', v == null ? {'hour': null, 'minute': null} : {'hour': v, 'minute': minute ?? 0}),
          ),
          120,
        ),
        box(
          NumberField(
            key: ValueKey('${_named('Minute')}:$minute:$hour'),
            label: _named('Minute'),
            value: minute,
            enabled: hour != null,
            hint: '0–59',
            check: (v) => v != null && (v < 0 || v > 59) ? 'A minute is from 0 to 59: $v was not saved.' : null,
            onCommit: (v) => _patch('exact', {'minute': v ?? 0}),
          ),
          120,
        ),
      ],
      ApproximateDate(:final year, :final month, :final season) => [
        box(
          NumberField(
            key: ValueKey('${_named('Year')}:$year'),
            label: _named('Year'),
            value: year,
            allowEmpty: false,
            helper: era(year),
            onCommit: (v) => _patch('approximate', {'year': v}),
          ),
        ),
        box(
          DropdownButtonFormField<String>(
            key: ValueKey('${_named('Part of the year')}:$month:$season'),
            initialValue: month != null && month != 0 ? 'm$month' : (season?.name ?? ''),
            isExpanded: true,
            decoration: InputDecoration(labelText: _named('Part of the year')),
            items: [
              const DropdownMenuItem(value: '', child: Text('Sometime that year')),
              for (final s in Season.values) DropdownMenuItem(value: s.name, child: Text(seasonLabels[s]!)),
              for (final (i, name) in calendar.months.indexed)
                DropdownMenuItem(
                  value: 'm${i + 1}',
                  child: Text(name, overflow: TextOverflow.ellipsis),
                ),
              if (month != null && month > calendar.months.length)
                DropdownMenuItem(value: 'm$month', child: Text('${calendar.monthName(month)} (not in this calendar)')),
            ],
            onChanged: (v) => _patch('approximate', {
              'month': v != null && v.startsWith('m') ? int.parse(v.substring(1)) : null,
              'season': seasonOf(v)?.name,
            }),
          ),
          240,
        ),
      ],
      RelativeDate(:final anchorId, :final amount, :final unit, :final before) => [
        box(
          NumberField(
            key: ValueKey('${_named('Amount')}:$amount'),
            label: _named('Amount'),
            value: amount,
            decimals: true,
            allowEmpty: false,
            check: (v) => v != null && v < 0 ? 'Give an amount of 0 or more; it was not changed.' : null,
            onCommit: (v) => _patch('relative', {'amount': v}),
          ),
          120,
        ),
        box(
          DropdownButtonFormField<TimeUnit>(
            key: ValueKey('${_named('Unit')}:$unit'),
            initialValue: unit,
            isExpanded: true,
            decoration: InputDecoration(labelText: _named('Unit')),
            items: [for (final u in TimeUnit.values) DropdownMenuItem(value: u, child: Text(_unitNames[u]!))],
            onChanged: (v) => _patch('relative', {'unit': (v ?? unit).name}),
          ),
          140,
        ),
        box(
          DropdownButtonFormField<bool>(
            key: ValueKey('${_named('Before or after')}:$before'),
            initialValue: before,
            isExpanded: true,
            decoration: InputDecoration(labelText: _named('Before or after')),
            items: const [
              DropdownMenuItem(value: true, child: Text('before')),
              DropdownMenuItem(value: false, child: Text('after')),
            ],
            onChanged: (v) => _patch('relative', {'direction': v ?? before ? 'before' : 'after'}),
          ),
          140,
        ),
        box(
          DropdownButtonFormField<String>(
            key: ValueKey('${_named('Relative to')}:$anchorId'),
            initialValue: others.any((p) => p.event.id == anchorId) ? anchorId : '',
            isExpanded: true,
            decoration: InputDecoration(labelText: _named('Relative to')),
            items: [
              const DropdownMenuItem(value: '', child: Text('Choose an event…')),
              for (final p in others)
                DropdownMenuItem(
                  value: p.event.id,
                  child: Text(p.event.name.isEmpty ? 'Untitled event' : p.event.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => _patch('relative', {'anchorId': v == null || v.isEmpty ? null : v}),
          ),
          320,
        ),
      ],
      _ => [
        Text(
          'No date. Set “Comes after” below to give it a place in the order.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    };

    return InputDecorator(
      decoration: InputDecoration(labelText: legend, border: const OutlineInputBorder()),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final p in offered)
                ChoiceChip(
                  label: Text(precisionLabels[p]!),
                  selected: precision == p,
                  tooltip: '${_named('Date precision')}: ${precisionLabels[p]}',
                  onSelected: (_) {
                    if (precision != p) _setPrecision(p);
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(spacing: 12, runSpacing: 12, children: fields),
        ],
      ),
    );
  }

  List<DropdownMenuItem<int>> _monthItems(int? month) => [
    const DropdownMenuItem(value: 0, child: Text('Not set')),
    for (final (i, name) in calendar.months.indexed)
      DropdownMenuItem(
        value: i + 1,
        child: Text(name, overflow: TextOverflow.ellipsis),
      ),
    if (month != null && month > calendar.months.length)
      DropdownMenuItem(value: month, child: Text('${calendar.monthName(month)} (not in this calendar)')),
  ];
}
