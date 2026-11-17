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

/// A change made in the window: a track (a level as a whole number, or a stage by its id) or a variable (a number, or
/// a choice's label), by its id.
typedef SheetEdit = ({String id, bool track, Object value});

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
    this.profile,
    this.captureKey,
    this.onEdit,
    this.onHold,
    this.onNew,
  });

  /// Set: the window changes the sheet it shows, in place (a character's Status, in the vault). Its levels and stages,
  /// what is left of each resource, its attributes and choices become rows to change, each change at once; what
  /// follows from them (the most of a resource, damage…) is worked out again and stays as the system says. A level the
  /// sheet's own experience gives is not changed here (only where it started, on the whole sheet). Null: it only shows.
  final void Function(SheetEdit edit)? onEdit;

  /// Set (with [onEdit]): what the sheet holds is changed in the window too: each group of the system (classes,
  /// skills, titles, powers…) with what is held in it, each to be taken away, and what else the system has to add.
  /// A group that allows one at a time keeps the one chosen last.
  final void Function(String itemId, bool hold)? onHold;

  /// Set (with [onHold]): each group's Add ends with one new to the system: named, made in the group and held, in one
  /// change (a power the story has just given them). Asked of the group by its id and name.
  final void Function(String groupId, String groupName)? onNew;

  /// The blueprint, as it would be begun.
  final JsonMap content;
  final String presetId;
  final String holder;

  /// What the sheet holds, by item id.
  final List<String> held;
  final String caption;
  final bool compact;

  /// A sheet's own values, progress and experience, when the window shows a sheet as it stands (Systems' live
  /// window); else only what it holds, as it would begin.
  final SheetProfile? profile;

  /// Round the window itself (not its caption), for taking its picture.
  final GlobalKey? captureKey;

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
    final sheet = computeSheet(system, widget.profile ?? SheetProfile(itemIds: widget.held));
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

    final edit = widget.onEdit;
    // A level its experience gives: where it started is changed on the whole sheet, not here.
    bool fromXp(String trackId) => widget.profile?.xp.any((e) => e.trackId == trackId) ?? false;
    // Where they stand on a track: a level to step, a stage to choose, or (only shown) as the system says.
    Widget standingRow(SheetTrack t, String name, String value) {
      final change = edit;
      if (change != null && t.level != null && !fromXp(t.track.id)) {
        return _Stepper(
          label: name,
          value: t.level!.toDouble(),
          whole: true,
          min: 1,
          max: t.track.cap > 0 ? t.track.cap.toDouble() : null,
          onSet: (v) => change((id: t.track.id, track: true, value: v.round())),
          style: text,
          accent: look.accent,
        );
      }
      if (change != null && t.level == null && t.track.stages.isNotEmpty) {
        final at = widget.profile?.progress[t.track.id];
        return _Choose(
          label: name,
          options: [for (final st in t.track.stages) (st.id, st.name)],
          current: at is String ? at : t.track.stages.first.id,
          onChoose: (id) => change((id: t.track.id, track: true, value: id)),
          style: text,
          accent: look.accent,
        );
      }
      return _Line(label: name, value: value, style: text, accent: look.accent, strong: true);
    }

    // The sheet's own number for a variable, when it has one.
    double? own(String variableId) => switch (widget.profile?.values[variableId]) {
      final num n => n.toDouble(),
      _ => null,
    };

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
        for (final (i, s) in standing.indexed) ...[
          standingRow(sheet.tracks[i], s.name, s.value),
          if (s.next case final next? when !widget.compact)
            Padding(
              padding: const EdgeInsets.only(top: 1, bottom: 2),
              child: Text(next, style: text(11, color: faint)),
            ),
        ],
        if (resources.isNotEmpty) ...[
          rule(),
          for (final r in resources)
            () {
              final most = maxOf(r);
              final now = r.value is double ? r.value! as double : null;
              final top = most?.value is double ? most!.value! as double : now;
              final part = now == null || top == null || top <= 0 ? 1.0 : (now / top).clamp(0.0, 1.0);
              final unit = r.variable.unit.trim();
              // HP, MP, SP; or the name's first word ("Mana" for Mana Capacity).
              final short = unit.isNotEmpty && unit.length <= 3
                  ? unit
                  : r.variable.name.trim().split(RegExp(r'\s+')).first;
              // What is left of it, changed: up to its most, when it has one.
              if (edit != null) {
                return _Stepper(
                  label: short,
                  value: own(r.variable.id) ?? now ?? 0,
                  min: 0,
                  max: most?.value is double ? most!.value! as double : null,
                  of: most == null ? null : '/ ${plain(most)}${unit.isEmpty ? '' : ' $unit'}',
                  onSet: (v) => edit((id: r.variable.id, track: false, value: v)),
                  style: text,
                  accent: look.accent,
                );
              }
              return _Bar(
                name: short,
                value: most == null
                    ? r.display
                    : '${now == null ? '?' : _number(now)} / ${plain(most)}${unit.isEmpty ? '' : ' $unit'}',
                part: part,
                fill: _fill,
                accent: look.accent,
                style: text,
              );
            }(),
        ],
        if (attributes.isNotEmpty && edit != null) ...[
          rule(),
          for (final r in attributes)
            r.variable.kind == 'choice'
                ? _Choose(
                    label: r.variable.name,
                    options: [for (final o in r.variable.options) (o, o)],
                    current: r.value is String && r.variable.options.contains(r.value)
                        ? r.value! as String
                        : r.variable.options.firstOrNull ?? '',
                    onChoose: (o) => edit((id: r.variable.id, track: false, value: o)),
                    style: text,
                    accent: look.accent,
                  )
                : _Stepper(
                    label: r.variable.name,
                    // Their own number: what a class or skill adds is the blueprint's, and stays out of it.
                    value: own(r.variable.id) ?? r.variable.base,
                    of: r.sources.isNotEmpty ? '→ ${r.display}' : null,
                    onSet: (v) => edit((id: r.variable.id, track: false, value: v)),
                    style: text,
                    accent: look.accent,
                  ),
        ] else if (attributes.isNotEmpty) ...[
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
        if (widget.onHold case final hold?)
          for (final g in [
            for (final g in system.groupList) (id: g.id, name: g.name, single: g.single),
            if (system.items.any((i) => !system.groupList.any((g) => g.id == i.groupId)))
              (id: '', name: 'Held', single: false),
          ])
            ...() {
              bool inGroup(SysItem i) =>
                  g.id.isEmpty ? !system.groupList.any((x) => x.id == i.groupId) : i.groupId == g.id;
              final options = [
                for (final i in system.items)
                  if (inGroup(i)) i,
              ];
              final canMake = widget.onNew != null && g.id.isNotEmpty;
              if (options.isEmpty && !canMake) return const <Widget>[];
              final held = [
                for (final i in sheet.items)
                  if (inGroup(i.item)) i,
              ];
              final heldIds = {for (final i in held) i.item.id};
              final more = [
                for (final o in options)
                  if (!heldIds.contains(o.id)) o,
              ];
              return <Widget>[
                rule(),
                Row(
                  children: [
                    Expanded(child: label(g.single ? '${g.name} · one at a time' : g.name)),
                    if (more.isNotEmpty || canMake)
                      PopupMenuButton<String>(
                        tooltip: 'Add to ${g.name}',
                        onSelected: (id) => id == _newOne ? widget.onNew!(g.id, g.name) : hold(id, true),
                        itemBuilder: (_) => [
                          for (final o in more)
                            PopupMenuItem(
                              value: o.id,
                              child: Text(ranks[o.rankId] == null ? o.name : '${o.name} · ${ranks[o.rankId]}'),
                            ),
                          // One the system does not have yet: named, made in this group and held.
                          if (canMake) ...[
                            if (more.isNotEmpty) const PopupMenuDivider(),
                            PopupMenuItem(value: _newOne, child: Text('New in ${g.name}…')),
                          ],
                        ],
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.add, size: 18, color: look.accent),
                              const SizedBox(width: 4),
                              Text(
                                'Add',
                                style: text(13, color: look.accent, weight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                if (held.isEmpty)
                  Text('None held', style: text(12, color: faint))
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final i in held)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: _Held(
                                name: i.item.name,
                                rank: ranks[i.item.rankId],
                                effects: [...i.effects, for (final c in i.costs) 'costs ${c.label}'],
                                accent: look.accent,
                                style: text,
                                from: i.from,
                              ),
                            ),
                            // What a stage gives goes with the stage, not from here.
                            if (i.from == null)
                              IconButton(
                                tooltip: 'Take away ${i.item.name}',
                                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                                color: _ink.withValues(alpha: 0.7),
                                onPressed: () => hold(i.item.id, false),
                                icon: const Icon(Icons.close, size: 18),
                              ),
                          ],
                        ),
                    ],
                  ),
              ];
            }()
        else
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
                    from: i.from,
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
          child: RepaintBoundary(
            key: widget.captureKey,
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
/// A bar of what is left (HP, MP…): its name, the bar, and the numbers. Built once; as the window opens only the fill
/// is drawn again, frame by frame ([fill]), not the row, its words or the window round it.
class _Bar extends StatelessWidget {
  const _Bar({
    required this.name,
    required this.value,
    required this.part,
    required this.fill,
    required this.accent,
    required this.style,
  });

  final String name;
  final String value;

  /// How full it is (0 to 1), once filled.
  final double part;

  /// How far the filling has come (0 to 1, eased here).
  final Animation<double> fill;
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
          child: RepaintBoundary(
            child: CustomPaint(
              size: const Size.fromHeight(9),
              painter: _BarPainter(part: part, fill: fill, accent: accent),
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

const _ink = Color(0xFFE8F0F6);

/// The Add menu's choice for one new to the system (no item's id is this).
const _newOne = '\u0000new';

/// A number to change in the window: its name (and below it, what it comes to, when more than their own counts), −
/// and + a whole step at a time within [min] and [max], and the number itself, which pressed asks for one typed.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.value,
    required this.onSet,
    required this.style,
    required this.accent,
    this.min,
    this.max,
    this.whole = false,
    this.of,
  });

  final String label;
  final double value;
  final ValueChanged<double> onSet;
  final TextStyle Function(double size, {Color? color, FontWeight? weight, double spacing}) style;
  final Color accent;
  final double? min;
  final double? max;
  final bool whole;

  /// Said beside it: what it is out of ("/ 200 HP"), or what it comes to ("→ 15").
  final String? of;

  double _within(double v) {
    var n = whole ? v.roundToDouble() : v;
    if (min case final low?) n = n < low ? low : n;
    if (max case final high?) n = n > high ? high : n;
    return n;
  }

  String get _shown => whole ? '${value.round()}' : _number(value);

  Future<void> _type(BuildContext context) async {
    final typed = await showDialog<String>(
      context: context,
      builder: (dialog) => _TypeNumber(
        label: label,
        initial: _shown,
        whole: whole,
        signed: (min ?? -1) < 0,
        limits: [if (min != null) 'at least ${_number(min!)}', if (max != null) 'at most ${_number(max!)}'].join(', '),
      ),
    );
    final n = double.tryParse(typed?.trim() ?? '');
    if (n != null && n.isFinite && _within(n) != value) onSet(_within(n));
  }

  @override
  Widget build(BuildContext context) {
    Widget button(IconData icon, String tip, double to) => IconButton(
      tooltip: tip,
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      color: accent,
      disabledColor: _ink.withValues(alpha: 0.25),
      onPressed: _within(to) == value ? null : () => onSet(_within(to)),
      icon: Icon(icon, size: 20),
    );
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: style(13, color: _ink.withValues(alpha: 0.72))),
              if (of case final more?) Text(more, style: style(11.5, color: _ink.withValues(alpha: 0.6))),
            ],
          ),
        ),
        button(Icons.remove, 'Less $label', value - 1),
        ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 56, minHeight: 48),
          child: TextButton(
            onPressed: () => _type(context),
            style: TextButton.styleFrom(foregroundColor: _ink, padding: const EdgeInsets.symmetric(horizontal: 8)),
            child: Text(
              _shown,
              semanticsLabel: '$label: $_shown. Press to type a number.',
              style: style(14, color: _ink, weight: FontWeight.w700),
            ),
          ),
        ),
        button(Icons.add, 'More $label', value + 1),
      ],
    );
  }
}

/// A number typed for [label]: the dialog keeps its field (and lets it go only when it is gone, after it has closed).
class _TypeNumber extends StatefulWidget {
  const _TypeNumber({
    required this.label,
    required this.initial,
    required this.whole,
    required this.signed,
    required this.limits,
  });

  final String label;
  final String initial;
  final bool whole;
  final bool signed;

  /// "at least 1, at most 100".
  final String limits;

  @override
  State<_TypeNumber> createState() => _TypeNumberState();
}

class _TypeNumberState extends State<_TypeNumber> {
  late final _field = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.label),
    content: TextField(
      controller: _field,
      autofocus: true,
      keyboardType: TextInputType.numberWithOptions(decimal: !widget.whole, signed: widget.signed),
      decoration: InputDecoration(helperText: widget.limits.isEmpty ? null : widget.limits),
      onSubmitted: (t) => Navigator.of(context).pop(t),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(onPressed: () => Navigator.of(context).pop(_field.text), child: const Text('Set')),
    ],
  );
}

/// A stage or a choice to change in the window: its name, and the one it is, chosen from all of them.
class _Choose extends StatelessWidget {
  const _Choose({
    required this.label,
    required this.options,
    required this.current,
    required this.onChoose,
    required this.style,
    required this.accent,
  });

  final String label;

  /// Each as its id and its name.
  final List<(String, String)> options;
  final String current;
  final ValueChanged<String> onChoose;
  final TextStyle Function(double size, {Color? color, FontWeight? weight, double spacing}) style;
  final Color accent;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(label, style: style(13, color: _ink.withValues(alpha: 0.72))),
      ),
      const SizedBox(width: 8),
      Flexible(
        flex: 2,
        child: DropdownButton<String>(
          value: options.any((o) => o.$1 == current) ? current : null,
          isExpanded: true,
          dropdownColor: const Color(0xFF0B1626),
          iconEnabledColor: accent,
          underline: Container(height: 1, color: accent.withValues(alpha: 0.5)),
          style: style(14, color: _ink, weight: FontWeight.w700),
          items: [
            for (final (id, name) in options)
              DropdownMenuItem(
                value: id,
                child: Text(name, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (id) {
            if (id != null && id != current) onChoose(id);
          },
        ),
      ),
    ],
  );
}

/// The bar itself: a faint track in a thin border, and inside it the fill (a gradient of the accent, glowing), as wide
/// as [part] of the track times how far [fill] has come. Painted again as [fill] moves, and nothing else is.
class _BarPainter extends CustomPainter {
  _BarPainter({required this.part, required this.fill, required this.accent}) : super(repaint: fill);

  final double part;
  final Animation<double> fill;
  final Color accent;

  static const _border = 0.8;
  static const _radius = Radius.circular(2);

  /// How wide the fill is drawn, as a share of the track: for a test to see it filling.
  @visibleForTesting
  double get drawn => math.max(0.0, part) * Curves.easeOutCubic.transform(fill.value);

  @override
  void paint(Canvas canvas, Size size) {
    final track = RRect.fromRectAndRadius(Offset.zero & size, _radius);
    canvas.drawRRect(track, Paint()..color = Colors.white.withValues(alpha: 0.08));
    canvas.drawRRect(
      track.deflate(_border / 2),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _border
        ..color = accent.withValues(alpha: 0.35),
    );
    // Inside the border, as the box's child was.
    final room = (Offset.zero & size).deflate(_border);
    final width = room.width * drawn;
    if (width <= 0) return;
    final bar = RRect.fromRectAndRadius(Rect.fromLTWH(room.left, room.top, width, room.height), _radius);
    canvas.drawRRect(
      bar,
      Paint()
        ..color = accent.withValues(alpha: 0.5)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, Shadow.convertRadiusToSigma(6)),
    );
    canvas.drawRRect(
      bar,
      Paint()..shader = LinearGradient(colors: [accent.withValues(alpha: 0.65), accent]).createShader(bar.outerRect),
    );
  }

  @override
  bool shouldRepaint(_BarPainter old) => old.part != part || old.accent != accent || old.fill != fill;
}

/// Something held, in brackets as such screens write them: [Smart Atoms], its rank, and what it does.
class _Held extends StatelessWidget {
  const _Held({
    required this.name,
    required this.rank,
    required this.effects,
    required this.accent,
    required this.style,
    this.from,
  });

  final String name;
  final String? rank;

  /// The stage that gives it, when it is held for reaching it: "from C Tier".
  final String? from;
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
        if (from case final f?)
          Text(
            'from $f',
            style: style(10.5, color: accent.withValues(alpha: 0.85), weight: FontWeight.w600),
          ),
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
