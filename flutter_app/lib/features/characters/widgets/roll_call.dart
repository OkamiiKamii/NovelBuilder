import 'package:flutter/material.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/characters/stakes.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// A column of the roll call: what it is called, the fields that hold it (in lower case, the first written read), the
/// field a new answer is written to, where that field goes, and how wide it is.
typedef RollColumn = ({String label, List<String> names, String field, List<String> sections, double width});

/// The roll call's columns: the basics every character is asked first.
final rollColumns = <RollColumn>[
  (label: 'Age', names: const ['age'], field: 'Age', sections: const ['identity'], width: 76),
  (label: 'Gender', names: const ['gender', 'sex'], field: 'Gender', sections: const ['identity'], width: 112),
  (
    label: 'Species',
    names: const ['species', 'race', 'kind'],
    field: 'Species',
    sections: const ['identity'],
    width: 120,
  ),
  (
    label: 'Occupation',
    names: const ['occupation', 'job', 'profession', 'trade'],
    field: 'Occupation',
    sections: const ['identity', 'position'],
    width: 168,
  ),
  (
    label: 'What they want',
    names: Stake.wants.fieldNames,
    field: Stake.wants.field,
    sections: const ['goals', 'stakes', 'opposition', 'role in the story', 'arc'],
    width: 280,
  ),
];

/// [entry]'s answer to [column]: the first field of its names that is written.
String rollValue(Entry entry, RollColumn column) {
  for (final n in column.names) {
    final v = fieldNamed(entry, n);
    if (v.isNotEmpty) return v;
  }
  return '';
}

/// THE ROLL CALL, a view of Characters: the whole cast as a table of the basics (role, age, gender, species,
/// occupation, what they want), every cell written in place and kept in that character's profile (in the field that
/// holds it, else a new one where it belongs). Names stay at the left while the columns scroll; a blank is a cell to
/// fill, and the head says how many are filled. Faster than opening each profile in turn; nothing else changes.
class RollCall extends StatelessWidget {
  const RollCall({super.key, required this.found, required this.cast});

  final List<Listed> found;
  final CastData cast;

  static const _rowHeight = 60.0;
  static const _nameWidth = 150.0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final actions = CharacterActions(context, cast.novelId);
    final cells = found.length * rollColumns.length;
    final filled = [
      for (final l in found)
        for (final c in rollColumns)
          if (rollValue(l.entry, c).isNotEmpty) 1,
    ].length;
    final head = vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.4);
    Widget rule() => Container(height: 1, color: scheme.outlineVariant.withValues(alpha: 0.6));

    final names = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 36,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('CHARACTER', style: head),
          ),
        ),
        rule(),
        for (final l in found) ...[
          SizedBox(
            height: _rowHeight,
            child: InkWell(
              onTap: () => actions.openCharacter(l.entry.id),
              child: Row(
                children: [
                  _Face(listed: l),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l.entry.name.trim().isEmpty ? 'Unnamed' : l.entry.name.trim(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: vaultHeading(context, size: 13.5, weight: 700),
                        ),
                        if (l.profile.roles.isNotEmpty)
                          Text(
                            l.profile.roles.join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: vaultText(
                              context,
                              size: 13,
                              style: FontStyle.italic,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          rule(),
        ],
      ],
    );

    final table = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 36,
          child: Row(
            children: [
              for (final c in rollColumns)
                SizedBox(
                  width: c.width,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(c.label.toUpperCase(), style: head),
                  ),
                ),
            ],
          ),
        ),
        SizedBox(width: rollColumns.fold<double>(0, (n, c) => n + c.width), child: rule()),
        for (final l in found) ...[
          SizedBox(
            height: _rowHeight,
            child: Row(
              children: [
                for (final c in rollColumns)
                  SizedBox(
                    width: c.width,
                    child: _Cell(
                      key: ValueKey('roll:${l.entry.id}:${c.label}'),
                      name: l.entry.name.trim(),
                      column: c,
                      value: rollValue(l.entry, c),
                      onChanged: (text) => actions.later('roll:${l.entry.id}:${c.label}', (x) {
                        final e = x.character(l.entry.id);
                        final has = e.fields.any((f) => c.names.contains(f.key.trim().toLowerCase()));
                        // Nothing written where there was nothing: no empty field made.
                        if (!has && text.trim().isEmpty) return;
                        recordIn(
                          x,
                          l.entry.id,
                          c.field,
                          c.names,
                          text.trim(),
                          sections: c.sections,
                          newSection: c.label == 'What they want' ? 'Goals & Stakes' : 'Core Identity',
                        );
                      }),
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(width: rollColumns.fold<double>(0, (n, c) => n + c.width), child: rule()),
        ],
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          liveRegion: true,
          child: Text(
            filled == cells
                ? 'Every answer is in. Press a name to open their profile.'
                : '$filled of $cells filled. Write in a blank and it is kept in their profile.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
        ),
        const SizedBox(height: 6),
        ExcludeSemantics(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: cells == 0 ? 0 : filled / cells,
              minHeight: 4,
              color: scheme.primary,
              backgroundColor: scheme.outlineVariant.withValues(alpha: 0.5),
            ),
          ),
        ),
        const SizedBox(height: 12),
        DecoratedBox(
          decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 0, 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: _nameWidth, child: names),
                Container(width: 1, height: 36 + 1 + found.length * (_rowHeight + 1), color: scheme.outlineVariant),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Padding(padding: const EdgeInsets.only(right: 12), child: table),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// One answer, written in place. A blank is shown as one; what is typed is kept as it is typed.
class _Cell extends StatefulWidget {
  const _Cell({super.key, required this.name, required this.column, required this.value, required this.onChanged});

  final String name;
  final RollColumn column;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  State<_Cell> createState() => _CellState();
}

class _CellState extends State<_Cell> {
  late final _text = TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void didUpdateWidget(_Cell old) {
    super.didUpdateWidget(old);
    // Changed elsewhere (another device, the profile): shown, unless it is being written in now.
    if (!_focus.hasFocus && widget.value != _text.text) _text.text = widget.value;
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Semantics(
        label: '${widget.name.isEmpty ? 'Unnamed' : widget.name}, ${widget.column.label}',
        child: TextField(
          controller: _text,
          focusNode: _focus,
          maxLines: 1,
          onChanged: widget.onChanged,
          style: vaultText(context, size: 15, color: scheme.onSurface),
          decoration: InputDecoration(
            isDense: true,
            hintText: '—',
            labelText: null,
            semanticCounterText: '',
            contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            filled: widget.value.isEmpty,
            fillColor: scheme.primary.withValues(alpha: 0.06),
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: scheme.primary, width: 2)),
          ).copyWith(hintStyle: TextStyle(color: scheme.onSurfaceVariant.withValues(alpha: 0.6))),
        ),
      ),
    );
  }
}

class _Face extends StatelessWidget {
  const _Face({required this.listed});
  final Listed listed;

  @override
  Widget build(BuildContext context) {
    final tone = NovelArt.of(context).bound(castTone(listed.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: 32,
          height: 40,
          child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
        ),
      ),
    );
  }
}
