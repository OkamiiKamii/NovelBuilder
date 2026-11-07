import 'package:flutter/material.dart';

import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../../shared/domain/systems/formula.dart';

/// A profile's sheet, worked out from the blueprint as it is now.
class SheetView extends StatelessWidget {
  const SheetView({super.key, required this.system, required this.profile});

  final SystemBlueprint system;
  final SheetProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sheet = computeSheet(system, profile);
    final small = theme.textTheme.bodySmall;
    final error = small?.copyWith(color: theme.colorScheme.error);
    final groups = [
      for (final g in system.groupList)
        if (sheet.items.any((i) => i.item.groupId == g.id)) g,
    ];
    if (sheet.rows.isEmpty && sheet.tracks.isEmpty && sheet.items.isEmpty) {
      return Text('This blueprint has nothing defined yet.', style: small);
    }
    Widget line(String name, List<InlineSpan> value) => Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(text: '$name  ', style: theme.textTheme.labelLarge),
            ...value,
          ],
        ),
      ),
    );
    final points = sheet.points;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final t in sheet.tracks)
          line(t.track.name, [
            TextSpan(
              text: t.label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (t.next != null) TextSpan(text: ' · ${t.next}', style: small),
            if (t.unmet.isNotEmpty) TextSpan(text: '  Not yet: ${t.unmet.join('; ')}', style: error),
            if (t.error != null) TextSpan(text: ' · ${t.error}', style: error),
          ]),
        if (points != null)
          line(points.name, [
            TextSpan(
              text: points.unspent < 0
                  ? '${formatNumber(-points.unspent)} over'
                  : '${formatNumber(points.unspent)} to place',
              style: TextStyle(fontWeight: FontWeight.w600, color: points.unspent < 0 ? theme.colorScheme.error : null),
            ),
            TextSpan(
              text: ' · ${formatNumber(points.spent)} placed of ${formatNumber(points.earned)} earned',
              style: small,
            ),
          ]),
        if (sheet.rows.isNotEmpty) const SizedBox(height: 4),
        for (final row in sheet.rows)
          line(row.variable.name, [
            if (row.error != null) TextSpan(text: row.error, style: error) else TextSpan(text: row.display),
            if ((profile.spent[row.variable.id] ?? 0) != 0)
              TextSpan(text: ' · ${formatNumber(profile.spent[row.variable.id]!)} placed', style: small),
            if (row.sources.isNotEmpty) TextSpan(text: ' · from ${row.sources.join(', ')}', style: small),
          ]),
        for (final group in groups) ...[
          const SizedBox(height: 8),
          Text(group.name, style: theme.textTheme.titleSmall),
          for (final i in sheet.items.where((i) => i.item.groupId == group.id))
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(i.item.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                      if (system.rankName(i.item).isNotEmpty) _Badge(system.rankName(i.item)),
                      if (i.item.affinity.isNotEmpty) _Badge(i.item.affinity),
                    ],
                  ),
                  if ([
                        i.effects.join(', '),
                        if (i.costs.isNotEmpty) 'Costs ${i.costs.map((c) => c.label).join(', ')}',
                        if (i.item.cooldown.isNotEmpty) 'Cooldown: ${i.item.cooldown}',
                      ].where((x) => x.isNotEmpty).join(' · ')
                      case final facts when facts.isNotEmpty)
                    Text(facts, style: small),
                  if (i.requires.isNotEmpty)
                    Text(
                      'Requires ${i.requires}${i.unmet.isNotEmpty ? ' — not met: ${i.unmet.join('; ')}' : ' — met'}',
                      style: i.unmet.isNotEmpty ? error : small,
                    ),
                  if (i.item.evolution.isNotEmpty) Text(i.item.evolution, style: small),
                  if (i.error != null) Text(i.error!, style: error),
                ],
              ),
            ),
        ],
        if (sheet.available.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: 'Now within reach: ', style: theme.textTheme.labelLarge),
                TextSpan(text: sheet.available.map((i) => i.name).join(', ')),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(text, style: Theme.of(context).textTheme.labelSmall),
  );
}

/// A formula or condition field that says, as it is typed, whether it can be worked out and what it comes to with
/// the blueprint's starting values. What the author types is saved even when it cannot be worked out yet.
class FormulaField extends StatefulWidget {
  const FormulaField({
    super.key,
    required this.system,
    required this.label,
    required this.value,
    required this.onChanged,
    this.condition = false,
    this.hint,
    this.extra = const {},
  });

  final SystemBlueprint system;
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final bool condition;
  final String? hint;

  /// Names that stand for something only here, such as the level a curve is being worked out for.
  final Map<String, double> extra;

  @override
  State<FormulaField> createState() => _FormulaFieldState();
}

class _FormulaFieldState extends State<FormulaField> {
  late String _draft = widget.value;

  @override
  void didUpdateWidget(FormulaField old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _draft = widget.value;
  }

  @override
  Widget build(BuildContext context) {
    final check = checkFormula(widget.system, _draft, condition: widget.condition, extra: widget.extra);
    return SavedTextField(
      label: widget.label,
      hint: widget.hint,
      value: widget.value,
      dense: true,
      errorText: check.error,
      helper: check.preview == null ? null : '= ${check.preview} with starting values',
      style: const TextStyle(fontFamily: 'monospace'),
      onChanged: (v) {
        setState(() => _draft = v);
        widget.onChanged(v);
      },
    );
  }
}
