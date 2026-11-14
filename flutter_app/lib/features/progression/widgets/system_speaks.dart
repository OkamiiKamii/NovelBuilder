import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/destinations.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../../shared/domain/systems/system_message.dart';
import '../../characters/widgets/vault.dart';
import '../../write/write_providers.dart';
import 'status_window.dart';

/// Where the book's bracket is kept: on this device, for the novel.
String bracketKey(String novelId) => 'systems.bracket.$novelId';

/// Which window a blueprint wears, from its own words: a cultivation record for realms and qi, an arcane ledger for
/// mana and spells, a threat dossier for powers, else a game's status screen.
String windowKindOf(SystemBlueprint system) {
  final words = [
    system.name,
    for (final g in system.groupList) g.name,
    for (final t in system.tracks) t.name,
    for (final v in system.variables) v.name,
  ].join(' ').toLowerCase();
  if (RegExp(r'\b(realm|qi|cultivat|dao|meridian|dantian)').hasMatch(words)) return 'cultivation';
  if (RegExp(r'\b(threat|power rating|superpower|hero)').hasMatch(words)) return 'superhero';
  if (RegExp(r'\b(arcan|rune|sigil|spell slot|magic)').hasMatch(words)) return 'hard-magic';
  return 'litrpg';
}

/// THE SYSTEM SPEAKS (`system_message.dart` words it): a composer for the messages a progression story's system shows
/// its characters, in front of the blueprint on Systems. Who it is to (a character with a sheet, or "You"), what it
/// says (a level, a skill, a stat, a title, a quest, a warning), filled in from their sheet as it stands (the level on
/// each track, the skills and titles they hold with their ranks, each stat's value), the book's brackets ([ ], 【 】,
/// < >, or none, remembered), and the message as the system's own window shows it, in its kind's dress. **Copy**, or
/// **Write it in the chapter**: the lines at the end of the chapter last written in, each a paragraph, the caret after.
Future<void> showSystemSpeaks(
  BuildContext context, {
  required String novelId,
  required StoryModel model,
  required SystemBlueprint system,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => SystemSpeaks(novelId: novelId, model: model, system: system),
);

class SystemSpeaks extends ConsumerStatefulWidget {
  const SystemSpeaks({super.key, required this.novelId, required this.model, required this.system});

  final String novelId;
  final StoryModel model;
  final SystemBlueprint system;

  @override
  ConsumerState<SystemSpeaks> createState() => _SystemSpeaksState();
}

class _SystemSpeaksState extends ConsumerState<SystemSpeaks> {
  late final List<SystemSheet> _sheets = [
    for (final s in widget.model.sheets)
      if (s.systemId == widget.system.id && widget.model.entries.containsKey(s.entryId)) s,
  ];
  late String? _sheetId = _sheets.firstOrNull?.id;
  var _kind = MessageKind.levelUp;
  late Bracket _bracket =
      Bracket.values
          .where((b) => b.name == ref.read(settingsStoreProvider).read(bracketKey(widget.novelId)))
          .firstOrNull ??
      Bracket.square;
  final _name = TextEditingController();
  final _rank = TextEditingController();
  final _detail = TextEditingController();
  final _level = TextEditingController();
  final _by = TextEditingController(text: '1');
  String? _trackId;
  String? _statId;
  String? _message;

  @override
  void initState() {
    super.initState();
    _fill();
  }

  @override
  void dispose() {
    for (final c in [_name, _rank, _detail, _level, _by]) {
      c.dispose();
    }
    super.dispose();
  }

  SystemSheet? get _sheet => _sheets.where((s) => s.id == _sheetId).firstOrNull;
  ComputedSheet get _computed =>
      computeSheet(widget.system, _sheet == null ? const SheetProfile() : SheetProfile.of(_sheet!));
  String get _who => _sheet == null ? '' : (widget.model.entries[_sheet!.entryId]?.name.trim() ?? '');

  /// What the sheet says, put in the fields for the kind chosen: the first numbered track and its level, the stat
  /// and its value, the latest skill or title held.
  void _fill() {
    final c = _computed;
    final numbered = c.tracks.where((t) => t.level != null).toList();
    _trackId ??= numbered.firstOrNull?.track.id;
    final track = numbered.where((t) => t.track.id == _trackId).firstOrNull;
    if (track != null) _level.text = '${track.level}';
    final stats = [
      for (final r in c.rows)
        if (r.value is double) r,
    ];
    _statId ??= stats.firstOrNull?.variable.id;
    final group = switch (_kind) {
      MessageKind.skill => 'skill',
      MessageKind.title => 'title',
      _ => null,
    };
    if (group != null) {
      final held = c.items.where((i) => i.group != null && groupNamed(i.group!, group)).toList();
      final latest = held.lastOrNull;
      _name.text = latest?.item.name ?? '';
      _rank.text = latest == null ? '' : widget.system.rankName(latest.item);
      _detail.text = latest?.item.description ?? '';
    }
  }

  MessageParts get _parts {
    final c = _computed;
    final stat = c.rows.where((r) => r.variable.id == _statId).firstOrNull;
    final track = c.tracks.where((t) => t.track.id == _trackId).firstOrNull;
    return (
      kind: _kind,
      who: _who,
      track: track?.track.name ?? 'Level',
      level: int.tryParse(_level.text.trim()) ?? track?.level ?? 1,
      name: _name.text,
      rank: _rank.text,
      stat: stat?.variable.name ?? '',
      from: (stat?.value as double?) ?? 0,
      by: num.tryParse(_by.text.trim().replaceFirst('+', '')) ?? 1,
      detail: _detail.text,
    );
  }

  /// The chapter the lines go to: the one open in Write, else the one last written in, else the first.
  ({String id, String title})? _chapter() {
    final store = ref.read(novelStoreProvider);
    final chapters = [
      for (final n in readingOrder(widget.model.nodes.values))
        if (isDocument(n.kind)) n,
    ];
    final selected = ref.read(selectedNodeProvider);
    final last = ref.read(settingsStoreProvider).read('write.lastNode.${widget.novelId}');
    final pick =
        chapters.where((n) => n.id == selected).firstOrNull ??
        chapters.where((n) => n.id == last).firstOrNull ??
        chapters.firstOrNull;
    if (pick == null || store.row(widget.novelId, 'chapters', pick.id) == null) return null;
    return (id: pick.id, title: pick.displayTitle);
  }

  void _setBracket(Bracket b) {
    setState(() => _bracket = b);
    ref.read(settingsStoreProvider).write(bracketKey(widget.novelId), b.name);
  }

  Future<void> _copy(List<String> lines) async {
    await Clipboard.setData(ClipboardData(text: lines.join('\n')));
    if (mounted) setState(() => _message = 'Copied. Paste it where the system speaks.');
  }

  void _write(List<String> lines, String chapterId) {
    ref.read(pendingInsertProvider.notifier).request((nodeId: chapterId, lines: lines));
    ref.read(selectedNodeProvider.notifier).select(chapterId);
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.go(Destination.write.path);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final lines = messageLines(_parts, _bracket);
    final chapter = _chapter();
    final c = _computed;
    final numbered = c.tracks.where((t) => t.level != null).toList();
    final stats = [
      for (final r in c.rows)
        if (r.value is double) r,
    ];
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.fromLTRB(0, 14, 0, 6),
      child: Semantics(
        header: true,
        child: Text(
          text.toUpperCase(),
          style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
        ),
      ),
    );
    Widget field(TextEditingController c, String label, {String? hint, int lines = 1, TextInputType? keys}) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: c,
        minLines: lines,
        maxLines: lines == 1 ? 1 : 4,
        keyboardType: keys,
        decoration: InputDecoration(labelText: label, hintText: hint),
        onChanged: (_) => setState(() {}),
      ),
    );

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('The system speaks', style: vaultHeading(context, size: 20, weight: 700)),
              Text(
                'A message from ${widget.system.name.trim().isEmpty ? 'the system' : widget.system.name.trim()}, '
                'filled in from their sheet, in your book’s brackets.',
                style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
              ),
              heading('To'),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final s in _sheets)
                    ChoiceChip(
                      label: Text(widget.model.entries[s.entryId]!.name),
                      selected: _sheetId == s.id,
                      onSelected: (_) => setState(() {
                        _sheetId = s.id;
                        _trackId = null;
                        _statId = null;
                        _fill();
                      }),
                    ),
                  ChoiceChip(
                    label: const Text('You'),
                    selected: _sheetId == null,
                    onSelected: (_) => setState(() => _sheetId = null),
                  ),
                ],
              ),
              heading('It says'),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final k in MessageKind.values)
                    ChoiceChip(
                      label: Text(k.label),
                      selected: _kind == k,
                      onSelected: (_) => setState(() {
                        _kind = k;
                        if (k == MessageKind.skill || k == MessageKind.title) {
                          _fill();
                        } else if (k != MessageKind.levelUp && k != MessageKind.stat) {
                          _name.clear();
                          _rank.clear();
                          _detail.clear();
                        }
                      }),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              ...switch (_kind) {
                MessageKind.levelUp => [
                  if (numbered.length > 1)
                    Wrap(
                      spacing: 6,
                      children: [
                        for (final t in numbered)
                          ChoiceChip(
                            label: Text(t.track.name),
                            selected: _trackId == t.track.id,
                            onSelected: (_) => setState(() {
                              _trackId = t.track.id;
                              _level.text = '${t.level}';
                            }),
                          ),
                      ],
                    ),
                  field(_level, 'Level reached', keys: TextInputType.number),
                  field(_detail, 'A line more (optional)', hint: '+5 attribute points to assign', lines: 2),
                ],
                MessageKind.stat => [
                  if (stats.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final r in stats)
                          ChoiceChip(
                            label: Text('${r.variable.name} ${r.display}'),
                            selected: _statId == r.variable.id,
                            onSelected: (_) => setState(() => _statId = r.variable.id),
                          ),
                      ],
                    ),
                  const SizedBox(height: 8),
                  field(_by, 'By how much', keys: const TextInputType.numberWithOptions(signed: true, decimal: true)),
                  field(_detail, 'A line more (optional)', lines: 2),
                ],
                MessageKind.skill || MessageKind.title => [
                  field(_name, _kind == MessageKind.skill ? 'Skill' : 'Title'),
                  field(_rank, 'Rank (optional)'),
                  field(_detail, 'What it does (optional)', lines: 2),
                ],
                MessageKind.quest || MessageKind.questDone => [
                  field(_name, 'Quest'),
                  field(
                    _detail,
                    _kind == MessageKind.quest ? 'Objective, reward… (a line each)' : 'Reward (optional)',
                    lines: 2,
                  ),
                ],
                MessageKind.warning => [field(_name, 'Warning'), field(_detail, 'A line more (optional)', lines: 2)],
              },
              heading('Brackets'),
              Wrap(
                spacing: 6,
                children: [
                  for (final b in Bracket.values)
                    ChoiceChip(
                      label: Text(b == Bracket.none ? 'None' : '${b.open} ${b.close}'),
                      tooltip: '${b.label} brackets',
                      selected: _bracket == b,
                      onSelected: (_) => _setBracket(b),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              _Window(kind: windowKindOf(widget.system), lines: lines),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_message!, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
                ),
              const SizedBox(height: 12),
              OverflowBar(
                alignment: MainAxisAlignment.end,
                spacing: 8,
                overflowAlignment: OverflowBarAlignment.end,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _copy(lines),
                    icon: const Icon(Icons.copy),
                    label: const Text('Copy'),
                  ),
                  FilledButton.icon(
                    onPressed: chapter == null ? null : () => _write(lines, chapter.id),
                    icon: const Icon(Icons.edit_note),
                    label: const Text('Write it in the chapter'),
                  ),
                ],
              ),
              if (chapter != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'At the end of “${chapter.title}”.',
                    textAlign: TextAlign.end,
                    style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The message as the system's own window shows it, in its kind's dress.
class _Window extends StatelessWidget {
  const _Window({required this.kind, required this.lines});
  final String kind;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    final look = windowLookOf(kind);
    const ink = Color(0xFFE8F0F6);
    return Semantics(
      label: 'The message: ${lines.join(' ')}',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [look.top, look.bottom],
          ),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: look.accent.withValues(alpha: 0.7)),
          boxShadow: [BoxShadow(color: look.accent.withValues(alpha: 0.25), blurRadius: 14)],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'SYSTEM',
              style: TextStyle(
                fontFamily: look.mono ? 'JetBrains Mono' : null,
                fontSize: 11,
                letterSpacing: 3,
                color: look.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            for (final l in lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(
                  l,
                  style: TextStyle(
                    fontFamily: look.mono ? 'JetBrains Mono' : vaultText(context).fontFamily,
                    fontSize: 15,
                    height: 1.35,
                    color: l == lines.first ? look.accent : ink,
                    fontWeight: l == lines.first ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
