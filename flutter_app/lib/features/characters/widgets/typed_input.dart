import 'package:flutter/material.dart';

import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/codex/field_values.dart';
import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/entry.dart';

/// The input a field's type calls for. Values are always text, whatever the type, so a value written before a field
/// changed type is kept as it was and shown as it is. Typing calls [onTyped] (saved through autosave); a choice calls
/// [onChosen] (saved at once).
class TypedInput extends StatelessWidget {
  const TypedInput({
    super.key,
    required this.label,
    required this.type,
    required this.value,
    required this.onTyped,
    required this.onChosen,
    this.options = const [],
    this.entries = const [],
    this.errorText,
    this.helper,
  });

  final String label;
  final FieldType type;
  final String value;
  final ValueChanged<String> onTyped;
  final ValueChanged<String> onChosen;
  final List<String> options;

  /// What a link can point at.
  final List<Entry> entries;
  final String? errorText;
  final String? helper;

  @override
  Widget build(BuildContext context) => switch (type) {
    FieldType.text => SavedTextField(
      label: label,
      value: value,
      onChanged: onTyped,
      errorText: errorText,
      helper: helper,
    ),
    FieldType.longtext => SavedTextField(
      label: label,
      value: value,
      onChanged: onTyped,
      multiline: true,
      minLines: 3,
      errorText: errorText,
      helper: helper,
    ),
    FieldType.number => SavedTextField(
      label: label,
      value: value,
      onChanged: onTyped,
      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
      errorText: errorText,
      helper: helper,
    ),
    FieldType.date => _DateInput(
      label: label,
      value: value,
      onTyped: onTyped,
      onChosen: onChosen,
      errorText: errorText,
    ),
    FieldType.toggle => _Toggle(label: label, value: value, onChosen: onChosen),
    FieldType.select => _Select(label: label, value: value, options: options, onChosen: onChosen, errorText: errorText),
    FieldType.multiselect => _Several(label: label, value: value, options: options, onChosen: onChosen),
    FieldType.tags => _Tags(label: label, value: value, onChosen: onChosen),
    FieldType.reference => _Link(
      label: label,
      value: value,
      entries: entries,
      onChosen: onChosen,
      errorText: errorText,
    ),
    FieldType.references => _Links(label: label, value: value, entries: entries, onChosen: onChosen),
  };
}

class _DateInput extends StatelessWidget {
  const _DateInput({
    required this.label,
    required this.value,
    required this.onTyped,
    required this.onChosen,
    this.errorText,
  });

  final String label;
  final String value;
  final ValueChanged<String> onTyped;
  final ValueChanged<String> onChosen;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    String two(int n) => n.toString().padLeft(2, '0');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: SavedTextField(
            label: label,
            hint: 'yyyy-mm-dd',
            value: value,
            onChanged: onTyped,
            errorText: errorText,
          ),
        ),
        IconButton(
          tooltip: 'Choose a date',
          icon: const Icon(Icons.calendar_month_outlined),
          onPressed: () async {
            final now = DateTime.tryParse(value) ?? DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: now,
              firstDate: DateTime(1),
              lastDate: DateTime(9999, 12, 31),
            );
            if (picked != null) {
              onChosen('${picked.year.toString().padLeft(4, '0')}-${two(picked.month)}-${two(picked.day)}');
            }
          },
        ),
      ],
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({required this.label, required this.value, required this.onChosen});
  final String label;
  final String value;
  final ValueChanged<String> onChosen;

  @override
  Widget build(BuildContext context) => InputDecorator(
    decoration: InputDecoration(labelText: label, border: InputBorder.none, contentPadding: EdgeInsets.zero),
    child: Padding(
      padding: const EdgeInsets.only(top: 8),
      child: SegmentedButton<String>(
        segments: [
          const ButtonSegment(value: 'yes', label: Text('Yes')),
          const ButtonSegment(value: 'no', label: Text('No')),
          ButtonSegment(value: '', label: Text(value == 'yes' || value == 'no' || value.isEmpty ? 'Not set' : value)),
        ],
        selected: {value == 'yes' || value == 'no' ? value : ''},
        showSelectedIcon: false,
        onSelectionChanged: (v) => onChosen(v.first),
      ),
    ),
  );
}

class _Select extends StatelessWidget {
  const _Select({
    required this.label,
    required this.value,
    required this.options,
    required this.onChosen,
    this.errorText,
  });
  final String label;
  final String value;
  final List<String> options;
  final ValueChanged<String> onChosen;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    // A value that is not among the choices (written before they changed) is kept and shown as it is.
    final choices = [...options, if (value.isNotEmpty && !options.contains(value)) value];
    return DropdownButtonFormField<String>(
      // Keyed by the value: a dropdown only reads its starting value, so a new stored value makes a new one.
      key: ValueKey(value),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        errorText: errorText,
        helperText: options.isEmpty ? 'No choices yet: add them under Field settings.' : null,
      ),
      items: [
        const DropdownMenuItem(value: '', child: Text('Not set')),
        for (final c in choices)
          DropdownMenuItem(
            value: c,
            child: Text(c, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) => onChosen(v ?? ''),
    );
  }
}

class _Several extends StatelessWidget {
  const _Several({required this.label, required this.value, required this.options, required this.onChosen});
  final String label;
  final String value;
  final List<String> options;
  final ValueChanged<String> onChosen;

  @override
  Widget build(BuildContext context) {
    final chosen = splitChoices(value);
    final all = [...options, ...chosen.where((c) => !options.contains(c))];
    return InputDecorator(
      decoration: InputDecoration(labelText: label, border: InputBorder.none, contentPadding: EdgeInsets.zero),
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: all.isEmpty
            ? const Text('No choices yet: add them under Field settings.')
            : Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final c in all)
                    FilterChip(
                      label: Text(c),
                      selected: chosen.contains(c),
                      onSelected: (on) => onChosen(
                        (on
                                ? [...chosen, c]
                                : [
                                    for (final x in chosen)
                                      if (x != c) x,
                                  ])
                            .join('\n'),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _Tags extends StatefulWidget {
  const _Tags({required this.label, required this.value, required this.onChosen});
  final String label;
  final String value;
  final ValueChanged<String> onChosen;

  @override
  State<_Tags> createState() => _TagsState();
}

class _TagsState extends State<_Tags> {
  final _adding = TextEditingController();

  @override
  void dispose() {
    _adding.dispose();
    super.dispose();
  }

  void _add() {
    final tag = _adding.text.trim();
    if (tag.isEmpty) return;
    final tags = splitChoices(widget.value);
    if (!tags.contains(tag)) widget.onChosen([...tags, tag].join('\n'));
    _adding.clear();
  }

  @override
  Widget build(BuildContext context) {
    final tags = splitChoices(widget.value);
    return InputDecorator(
      decoration: InputDecoration(labelText: widget.label, border: InputBorder.none, contentPadding: EdgeInsets.zero),
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final t in tags)
              InputChip(
                label: Text(t),
                onDeleted: () => widget.onChosen(
                  [
                    for (final x in tags)
                      if (x != t) x,
                  ].join('\n'),
                ),
                deleteButtonTooltipMessage: 'Remove $t',
              ),
            SizedBox(
              width: 200,
              child: TextField(
                controller: _adding,
                decoration: InputDecoration(hintText: 'Add to ${widget.label}', isDense: true),
                onSubmitted: (_) => _add(),
                textInputAction: TextInputAction.done,
              ),
            ),
            IconButton(tooltip: 'Add', onPressed: _add, icon: const Icon(Icons.add)),
          ],
        ),
      ),
    );
  }
}

class _Link extends StatelessWidget {
  const _Link({
    required this.label,
    required this.value,
    required this.entries,
    required this.onChosen,
    this.errorText,
  });
  final String label;
  final String value;
  final List<Entry> entries;
  final ValueChanged<String> onChosen;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final known = entries.any((e) => e.id == value);
    return DropdownButtonFormField<String>(
      key: ValueKey(value),
      initialValue: value.isEmpty || known ? value : '\u0000gone',
      isExpanded: true,
      decoration: InputDecoration(labelText: label, errorText: errorText),
      items: [
        const DropdownMenuItem(value: '', child: Text('Not linked')),
        // A link to an entry that is gone is kept until the author changes it, and said for what it is.
        if (value.isNotEmpty && !known)
          const DropdownMenuItem(value: '\u0000gone', child: Text('The linked entry was deleted')),
        for (final e in entries)
          DropdownMenuItem(
            value: e.id,
            child: Text(e.name, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) {
        if (v != '\u0000gone') onChosen(v ?? '');
      },
    );
  }
}

class _Links extends StatelessWidget {
  const _Links({required this.label, required this.value, required this.entries, required this.onChosen});
  final String label;
  final String value;
  final List<Entry> entries;
  final ValueChanged<String> onChosen;

  @override
  Widget build(BuildContext context) {
    final chosen = splitChoices(value);
    final names = {for (final e in entries) e.id: e.name};
    return InputDecorator(
      decoration: InputDecoration(labelText: label, border: InputBorder.none, contentPadding: EdgeInsets.zero),
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final id in chosen)
              InputChip(
                label: Text(names[id] ?? 'A deleted entry'),
                onDeleted: () => onChosen(
                  [
                    for (final x in chosen)
                      if (x != id) x,
                  ].join('\n'),
                ),
                deleteButtonTooltipMessage: 'Remove ${names[id] ?? 'the deleted entry'}',
              ),
            PopupMenuButton<String>(
              tooltip: 'Link another entry',
              useRootNavigator: true,
              icon: const Icon(Icons.add_link),
              itemBuilder: (_) => [
                for (final e in entries)
                  if (!chosen.contains(e.id)) PopupMenuItem(value: e.id, child: Text(e.name)),
              ],
              onSelected: (id) => onChosen([...chosen, id].join('\n')),
            ),
          ],
        ),
      ),
    );
  }
}
