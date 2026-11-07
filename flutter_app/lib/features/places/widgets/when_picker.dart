import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../shared/domain/json.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/model/validity.dart';
import '../../../shared/domain/visualize/summaries.dart' show timelineRows;
import '../../progression/widgets/tracker.dart' show anchorOfValue, whenItems;

/// When something happens: not known, at a chapter or scene, at an event, or on a date (exact, or approximately a
/// year), as the original's picker offers. [value] is the stored point, or null when not known.
class WhenPicker extends StatefulWidget {
  const WhenPicker({super.key, required this.model, required this.label, required this.value, required this.onChanged});
  final StoryModel model;
  final String label;
  final JsonMap? value;
  final ValueChanged<JsonMap?> onChanged;

  @override
  State<WhenPicker> createState() => _WhenPickerState();
}

class _WhenPickerState extends State<WhenPicker> {
  late final _year = TextEditingController(text: _part('year'));
  late final _month = TextEditingController(text: _part('month'));
  late final _day = TextEditingController(text: _part('day'));

  JsonMap? get _date => widget.value?['kind'] == 'date' ? mapOrNull(widget.value!['when']) : null;
  bool get _approx => _date?['precision'] == 'approximate';
  String _part(String key) => switch (_date?[key]) {
    final num n => '$n',
    _ => '',
  };

  @override
  void dispose() {
    _year.dispose();
    _month.dispose();
    _day.dispose();
    super.dispose();
  }

  void _setDate({bool? approx}) {
    final year = int.tryParse(_year.text.trim()) ?? 1;
    final month = int.tryParse(_month.text.trim());
    final day = int.tryParse(_day.text.trim());
    final a = approx ?? _approx;
    widget.onChanged({
      'kind': 'date',
      'when': a
          ? {'precision': 'approximate', 'year': year, 'month': month, 'season': null}
          : {
              'precision': 'exact',
              'year': year,
              'month': month,
              'day': month == null ? null : day,
              'hour': null,
              'minute': null,
            },
    });
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.value;
    final model = widget.model;
    final points = whenItems(model);
    final kind = switch (value?['kind']) {
      'node' => 'n:${value!['nodeId']}',
      'event' => 'e:${value!['eventId']}',
      'date' => 'date',
      _ => '',
    };
    final known = kind.isEmpty || kind == 'date' || points.any((p) => p.value == kind);
    final digits = [FilteringTextInputFormatter.allow(RegExp(r'-?\d*'))];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          key: ValueKey('${widget.label}:$kind'),
          initialValue: known ? kind : '',
          isExpanded: true,
          decoration: InputDecoration(labelText: widget.label, isDense: true),
          items: [
            const DropdownMenuItem(value: '', child: Text('When is not known')),
            const DropdownMenuItem(value: 'date', child: Text('On a date')),
            ...points,
          ],
          onChanged: (v) {
            if (v == null || v.isEmpty) return widget.onChanged(null);
            if (v == 'date') {
              if (_year.text.trim().isEmpty) _year.text = '1';
              return _setDate();
            }
            widget.onChanged(anchorOfValue(v));
          },
        ),
        if (kind == 'date')
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final (c, label) in [(_year, 'Year'), (_month, 'Month'), if (!_approx) (_day, 'Day')])
                  SizedBox(
                    width: 90,
                    child: TextField(
                      controller: c,
                      keyboardType: const TextInputType.numberWithOptions(signed: true),
                      inputFormatters: digits,
                      decoration: InputDecoration(labelText: '${widget.label}: ${label.toLowerCase()}', isDense: true),
                      onChanged: (_) => _setDate(),
                    ),
                  ),
                FilterChip(
                  label: const Text('approximately'),
                  selected: _approx,
                  onSelected: (on) => _setDate(approx: on),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// A point to look at the story from: the end of the story (null), a chapter or scene, or an event.
class AsOfField extends StatelessWidget {
  const AsOfField({super.key, required this.model, required this.label, required this.value, required this.onChanged});
  final StoryModel model;
  final String label;
  final Anchor? value;
  final ValueChanged<Anchor?> onChanged;

  @override
  Widget build(BuildContext context) {
    final points = whenItems(model);
    final current = switch (value) {
      NodeAnchor(:final nodeId) => 'n:$nodeId',
      EventAnchor(:final eventId) => 'e:$eventId',
      _ => '',
    };
    return DropdownButtonFormField<String>(
      key: ValueKey('asOf:$label:$current'),
      initialValue: points.any((p) => p.value == current) ? current : '',
      isExpanded: true,
      decoration: InputDecoration(labelText: label, isDense: true),
      items: [
        const DropdownMenuItem(value: '', child: Text('The end of the story')),
        ...points,
      ],
      onChanged: (v) => onChanged(v == null || v.isEmpty ? null : Anchor.fromJson(anchorOfValue(v))),
    );
  }
}

/// Every event, in story order, for a menu.
List<({String id, String title})> eventChoices(StoryModel model) => [
  for (final e in timelineRows(model)) (id: e.id, title: e.title),
];
