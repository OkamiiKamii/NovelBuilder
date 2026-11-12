import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../shared/domain/json.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../characters/widgets/vault.dart';

/// How a kind of system's window is dressed: what it is headed, its light, its glass, and its face.
typedef WindowLook = ({String heading, Color accent, Color top, Color bottom, bool mono});

/// The window of each kind of system: the blue status screen of a game system, a jade record of cultivation, a
/// violet ledger of hard magic, a red dossier for the gifted.
WindowLook windowLookOf(String presetId) => switch (presetId) {
  'litrpg' => (
    heading: 'Status',
    accent: const Color(0xFF5CD6FF),
    top: const Color(0xFF0C1C33),
    bottom: const Color(0xFF07111F),
    mono: true,
  ),
  'cultivation' => (
    heading: 'Cultivation record',
    accent: const Color(0xFF6FDDA8),
    top: const Color(0xFF0E2A22),
    bottom: const Color(0xFF081812),
    mono: false,
  ),
  'hard-magic' => (
    heading: 'Arcane ledger',
    accent: const Color(0xFFC3A2FF),
    top: const Color(0xFF1D1535),
    bottom: const Color(0xFF110C21),
    mono: false,
  ),
  'superhero' => (
    heading: 'Threat dossier',
    accent: const Color(0xFFFF7A70),
    top: const Color(0xFF2B1316),
    bottom: const Color(0xFF180A0C),
    mono: true,
  ),
  _ => (
    heading: 'Character sheet',
    accent: const Color(0xFFE0B36A),
    top: const Color(0xFF241C12),
    bottom: const Color(0xFF15100A),
    mono: false,
  ),
};

/// For a preset shown as an example, what its example sheet holds: the first of each of its kinds of class, skill
/// and the like.
List<String> exampleHeld(JsonMap content) {
  final seen = <String>{};
  return [
    for (final i in maps(content['items']))
      if (seen.add(str(i['groupId']))) str(i['id']),
  ];
}

/// THE STATUS WINDOW: a character's sheet as it would begin in a system, worked out by the system itself
/// (`compute.dart`) and drawn as the story's own screen would be: the heading in brackets, who it is and where they
/// stand (Level 1 of 100, Qi Condensation), each resource as a bar of what is left of its most (Health 100 / 230 HP),
/// the attributes, what follows from them, and what they hold ([Smart Atoms]) with what it does. In each kind's own
/// dress (`windowLookOf`). Nothing is stored by drawing it; the numbers are the ones the sheet will show.
///
/// [compact] leaves out what follows from the attributes, for the gallery's smaller cards.
class StatusWindow extends StatefulWidget {
  const StatusWindow({
    super.key,
    required this.content,
    required this.presetId,
    required this.holder,
    required this.held,
    required this.caption,
    this.compact = false,
  });

  /// The blueprint, as it would be begun.
  final JsonMap content;
  final String presetId;
  final String holder;

  /// What the sheet holds, by item id.
  final List<String> held;
  final String caption;
  final bool compact;

  @override
  State<StatusWindow> createState() => _StatusWindowState();
}

class _StatusWindowState extends State<StatusWindow> with SingleTickerProviderStateMixin {
  // The bars fill once, as the window opens.
  late final _fill = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_fill.status == AnimationStatus.dismissed) {
      if (MediaQuery.of(context).disableAnimations) {
        _fill.value = 1;
      } else {
        _fill.forward();
      }
    }
  }

  @override
  void dispose() {
    _fill.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final look = windowLookOf(widget.presetId);
    final system = SystemBlueprint(widget.content);
    final sheet = computeSheet(system, SheetProfile(itemIds: widget.held));
    final rows = sheet.rows;
    final face = look.mono ? 'JetBrains Mono' : null;
    const ink = Color(0xFFE8F0F6);
    final faint = ink.withValues(alpha: 0.62);
    TextStyle text(double size, {Color? color, FontWeight? weight, double spacing = 0}) => TextStyle(
      fontFamily: face ?? vaultText(context).fontFamily,
      fontSize: size,
      color: color ?? ink,
      fontWeight: weight,
      letterSpacing: spacing,
      height: 1.3,
    );

    // A resource's most is the "Max …" that follows from the attributes, when there is one.
    SheetRow? maxOf(SheetRow r) => rows
        .where(
          (m) =>
              m.variable.kind == 'derived' && m.variable.name.toLowerCase() == 'max ${r.variable.name}'.toLowerCase(),
        )
        .firstOrNull;
    final resources = [
      for (final r in rows)
        if (r.variable.kind == 'resource') r,
    ];
    final usedAsMost = {for (final r in resources) ?maxOf(r)?.variable.id};
    final attributes = [
      for (final r in rows)
        if (r.variable.kind == 'number' || r.variable.kind == 'choice') r,
    ];
    final follows = [
      for (final r in rows)
        if (r.variable.kind == 'derived' && !usedAsMost.contains(r.variable.id)) r,
    ];
    final byGroup = <String, List<SheetItem>>{};
    for (final i in sheet.items) {
      (byGroup[i.group?.name ?? 'Held'] ??= []).add(i);
    }
    final ranks = {for (final r in system.ranks) r.id: r.name};

    Widget rule() => Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Container(height: 1, color: look.accent.withValues(alpha: 0.28)),
    );

    Widget label(String words) => Text(
      words.toUpperCase(),
      style: text(10.5, color: look.accent, weight: FontWeight.w700, spacing: 1.6),
    );

    String plain(SheetRow r) => r.value is double ? _number(r.value! as double) : r.display;

    final standing = [
      for (final t in sheet.tracks)
        (
          name: t.track.name,
          value: t.level != null ? '${t.level}${t.track.cap > 0 ? ' / ${t.track.cap}' : ''}' : t.label,
          next: t.next,
        ),
    ];

    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // [ STATUS ]
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '[',
              style: text(15, color: look.accent, weight: FontWeight.w700),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                look.heading.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: text(13.5, color: ink, weight: FontWeight.w700, spacing: 3),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              ']',
              style: text(15, color: look.accent, weight: FontWeight.w700),
            ),
          ],
        ),
        rule(),
        _Line(label: 'Name', value: widget.holder, style: text, accent: look.accent, strong: true),
        for (final s in standing) ...[
          _Line(label: s.name, value: s.value, style: text, accent: look.accent, strong: true),
          if (s.next case final next? when !widget.compact)
            Padding(
              padding: const EdgeInsets.only(top: 1, bottom: 2),
              child: Text(next, style: text(11, color: faint)),
            ),
        ],
        if (resources.isNotEmpty) ...[
          rule(),
          for (final r in resources)
            AnimatedBuilder(
              animation: _fill,
              builder: (context, _) {
                final most = maxOf(r);
                final now = r.value is double ? r.value! as double : null;
                final top = most?.value is double ? most!.value! as double : now;
                final part = now == null || top == null || top <= 0 ? 1.0 : (now / top).clamp(0.0, 1.0);
                final unit = r.variable.unit.trim();
                return _Bar(
                  // HP, MP, SP; or the name's first word ("Mana" for Mana Capacity).
                  name: unit.isNotEmpty && unit.length <= 3 ? unit : r.variable.name.trim().split(RegExp(r'\s+')).first,
                  value: most == null
                      ? r.display
                      : '${now == null ? '?' : _number(now)} / ${plain(most)}${unit.isEmpty ? '' : ' $unit'}',
                  part: part * Curves.easeOutCubic.transform(_fill.value),
                  accent: look.accent,
                  style: text,
                );
              },
            ),
        ],
        if (attributes.isNotEmpty) ...[
          rule(),
          LayoutBuilder(
            builder: (context, box) {
              final columns = box.maxWidth >= 420 ? 2 : 1;
              final width = (box.maxWidth - 16 * (columns - 1)) / columns;
              return Wrap(
                spacing: 16,
                runSpacing: 2,
                children: [
                  for (final r in attributes)
                    SizedBox(
                      width: width,
                      child: _Line(
                        label: r.variable.name,
                        value: r.display,
                        style: text,
                        accent: look.accent,
                        raised: r.sources.isNotEmpty,
                      ),
                    ),
                ],
              );
            },
          ),
        ],
        if (follows.isNotEmpty && !widget.compact) ...[
          rule(),
          for (final r in follows) _Line(label: r.variable.name, value: r.display, style: text, accent: look.accent),
        ],
        for (final MapEntry(key: group, value: items) in byGroup.entries) ...[
          rule(),
          label(group),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final i in items)
                _Held(
                  name: i.item.name,
                  rank: ranks[i.item.rankId],
                  effects: [...i.effects, for (final c in i.costs) 'costs ${c.label}'],
                  accent: look.accent,
                  style: text,
                ),
            ],
          ),
        ],
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          container: true,
          label: '${look.heading} window for ${widget.holder}',
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [look.top, look.bottom],
              ),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: look.accent.withValues(alpha: 0.55), width: 1.2),
              boxShadow: [BoxShadow(color: look.accent.withValues(alpha: 0.22), blurRadius: 18, spreadRadius: 1)],
            ),
            child: CustomPaint(
              foregroundPainter: _Corners(look.accent),
              child: Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 14), child: body),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          widget.caption,
          style: vaultText(
            context,
            size: 14.5,
            style: FontStyle.italic,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

String _number(double n) {
  if (n == n.roundToDouble()) return n.toInt().toString();
  return n.toStringAsFixed(n.abs() < 10 ? 1 : 0);
}

/// A name and its value across a row, the value to the right; [raised] when something held changed it.
class _Line extends StatelessWidget {
  const _Line({
    required this.label,
    required this.value,
    required this.style,
    required this.accent,
    this.strong = false,
    this.raised = false,
  });

  final String label;
  final String value;
  final TextStyle Function(double size, {Color? color, FontWeight? weight, double spacing}) style;
  final Color accent;
  final bool strong;
  final bool raised;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: style(13, color: const Color(0xFFE8F0F6).withValues(alpha: 0.72))),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            raised ? '$value ▲' : value,
            textAlign: TextAlign.right,
            style: style(13.5, color: raised ? accent : null, weight: strong || raised ? FontWeight.w700 : null),
          ),
        ),
      ],
    ),
  );
}

/// A resource: its short name, a bar lit for what is left of its most, and the numbers.
class _Bar extends StatelessWidget {
  const _Bar({required this.name, required this.value, required this.part, required this.accent, required this.style});

  final String name;
  final String value;
  final double part;
  final Color accent;
  final TextStyle Function(double size, {Color? color, FontWeight? weight, double spacing}) style;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        SizedBox(
          width: 76,
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: style(12, color: accent, weight: FontWeight.w700),
          ),
        ),
        Expanded(
          child: Container(
            height: 9,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(2),
              border: Border.all(color: accent.withValues(alpha: 0.35), width: 0.8),
            ),
            alignment: Alignment.centerLeft,
            child: FractionallySizedBox(
              widthFactor: math.max(0.0, part),
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(2),
                  gradient: LinearGradient(colors: [accent.withValues(alpha: 0.65), accent]),
                  boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.5), blurRadius: 6)],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Text(value, textAlign: TextAlign.right, style: style(12.5)),
        ),
      ],
    ),
  );
}

/// Something held, in brackets as such screens write them: [Smart Atoms], its rank, and what it does.
class _Held extends StatelessWidget {
  const _Held({
    required this.name,
    required this.rank,
    required this.effects,
    required this.accent,
    required this.style,
  });

  final String name;
  final String? rank;
  final List<String> effects;
  final Color accent;
  final TextStyle Function(double size, {Color? color, FontWeight? weight, double spacing}) style;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
    decoration: BoxDecoration(
      color: accent.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(3),
      border: Border.all(color: accent.withValues(alpha: 0.45)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '[',
              style: style(13.5, color: accent, weight: FontWeight.w700),
            ),
            Flexible(
              child: Text(name, style: style(13.5, weight: FontWeight.w700)),
            ),
            Text(
              ']',
              style: style(13.5, color: accent, weight: FontWeight.w700),
            ),
            if (rank case final r?) ...[
              const SizedBox(width: 8),
              Text(
                r.toUpperCase(),
                style: style(9.5, color: accent, weight: FontWeight.w700, spacing: 1.2),
              ),
            ],
          ],
        ),
        if (effects.isNotEmpty)
          Text(effects.join(' · '), style: style(11, color: const Color(0xFFE8F0F6).withValues(alpha: 0.65))),
      ],
    ),
  );
}

/// Brackets at the window's four corners, in its light.
class _Corners extends CustomPainter {
  _Corners(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const arm = 14.0;
    const inset = 3.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;
    for (final (x, y, dx, dy) in [
      (inset, inset, 1.0, 1.0),
      (size.width - inset, inset, -1.0, 1.0),
      (inset, size.height - inset, 1.0, -1.0),
      (size.width - inset, size.height - inset, -1.0, -1.0),
    ]) {
      canvas.drawPath(
        Path()
          ..moveTo(x + arm * dx, y)
          ..lineTo(x, y)
          ..lineTo(x, y + arm * dy),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_Corners old) => old.color != color;
}
