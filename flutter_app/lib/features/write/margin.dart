import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/prose.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/records/thread.dart';
import '../characters/widgets/cast_card.dart' show castTone, monogram;
import '../characters/widgets/vault.dart';
import '../plot/plot_providers.dart' show chapterPlanPath;

/// THE MARGIN: beside the page, index cards with what the author already knows about the chapter being written, so
/// what comes next is in sight without leaving the page: how the chapter before ends, the chapter's summary and
/// objective, its planned beats, who is on the page (whose point of view first), and the plot threads that develop
/// here. Read from the chapter's plan, its threads and the chapter before; it writes nothing. A chapter with no plan
/// has one card offering to plan it.

/// How wide the margin is beside the page.
const marginWidth = 248.0;

/// Whether the margin is shown beside the page, kept on this device (on unless turned off).
const marginKey = 'write.margin';

class MarginNotifier extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(marginKey) != false;

  void set(bool on) {
    state = on;
    ref.read(settingsStoreProvider).write(marginKey, on);
  }
}

final marginProvider = NotifierProvider<MarginNotifier, bool>(MarginNotifier.new);

/// Someone on the page, by the plan: [pov] when the chapter is told from their point of view.
typedef MarginPerson = ({String id, String name, bool pov});

/// What the margin shows for one chapter or scene.
typedef MarginNotes = ({
  String summary,
  String objective,
  List<String> beats,
  List<MarginPerson> people,
  List<String> mentioned,
  List<({String id, String title, String development})> threads,
  ({String title, String text, bool cut})? before,
});

bool hasPlan(MarginNotes n) =>
    n.summary.isNotEmpty || n.objective.isNotEmpty || n.beats.isNotEmpty || n.people.isNotEmpty || n.threads.isNotEmpty;

/// Gathers [MarginNotes] for [nodeId] from the store: its plan and summary, the threads with a development placed
/// there, and the closing words of the nearest chapter or scene before it (in reading order) that has words.
MarginNotes marginNotesOf(NovelStore store, String novelId, String nodeId) {
  final row = store.row(novelId, 'chapters', nodeId);
  final node = row == null ? null : StoryNode(row);
  final planRow = store.row(novelId, 'chapterPlans', nodeId);
  final plan = planRow == null ? null : ChapterPlan(planRow);
  String nameOf(String id) {
    final e = store.row(novelId, 'loreEntries', id);
    return e == null ? '' : Entry(e).name;
  }

  final povs = plan?.povIds ?? const <String>[];
  final people = <MarginPerson>[
    for (final id in {...povs, ...?plan?.appearIds})
      if (store.row(novelId, 'loreEntries', id) case final e?) (id: id, name: Entry(e).name, pov: povs.contains(id)),
  ]..sort((a, b) => (a.pov == b.pov) ? 0 : (a.pov ? -1 : 1));
  final threads = [
    for (final t in store.rowsIn(novelId, 'plotThreads').map(PlotThread.new))
      for (final b in t.beats)
        if (b.nodeId == nodeId) (id: t.id, title: t.title.isEmpty ? 'Untitled thread' : t.title, development: b.title),
  ];

  ({String title, String text, bool cut})? before;
  final order = readingOrder(store.rowsIn(novelId, 'chapters').map(StoryNode.new));
  final at = order.indexWhere((n) => n.id == nodeId);
  for (var i = at - 1; i >= 0; i--) {
    final n = order[i];
    if ((n.kind != NodeKind.chapter && n.kind != NodeKind.scene) || n.wordCount == 0) continue;
    final closing = closingWords(store.row(novelId, 'chapterContents', n.id)?['doc'], max: 220);
    if (closing.text.isNotEmpty) before = (title: n.displayTitle, text: closing.text, cut: closing.cut);
    break;
  }

  return (
    summary: node?.summary.trim() ?? '',
    objective: plan?.objective.trim() ?? '',
    beats: [
      for (final b in plan?.beats ?? const <PlanBeat>[])
        if (b.text.trim().isNotEmpty) b.text.trim(),
    ],
    people: people,
    mentioned: [
      for (final id in plan?.mentionIds ?? const <String>[])
        if (nameOf(id) case final name when name.isNotEmpty) name,
    ],
    threads: threads,
    before: before,
  );
}

/// The margin's cards for the chapter or scene being written, kept in step with the store.
class ChapterMargin extends ConsumerStatefulWidget {
  const ChapterMargin({super.key, required this.novelId, required this.nodeId, this.onLeave});
  final String novelId;
  final String nodeId;

  /// Before going to the chapter's plan (the editor saves first).
  final VoidCallback? onLeave;

  @override
  ConsumerState<ChapterMargin> createState() => _ChapterMarginState();
}

class _ChapterMarginState extends ConsumerState<ChapterMargin> {
  late final NovelStore _store = ref.read(novelStoreProvider);
  late MarginNotes _notes = marginNotesOf(_store, widget.novelId, widget.nodeId);

  void _refresh() {
    if (!mounted || !_store.exists(widget.novelId)) return;
    final notes = marginNotesOf(_store, widget.novelId, widget.nodeId);
    if (notes != _notes) setState(() => _notes = notes);
  }

  @override
  void initState() {
    super.initState();
    _store.addListener(_refresh);
  }

  @override
  void didUpdateWidget(ChapterMargin old) {
    super.didUpdateWidget(old);
    if (old.nodeId != widget.nodeId || old.novelId != widget.novelId) _refresh();
  }

  @override
  void dispose() {
    _store.removeListener(_refresh);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = _notes;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final body = vaultText(context, size: 15.5);
    void plan() {
      widget.onLeave?.call();
      context.go(chapterPlanPath(widget.nodeId));
    }

    return Semantics(
      container: true,
      label: 'Notes for this chapter',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (n.before case final b?)
            _Card(
              title: 'Last time',
              subtitle: b.title,
              child: Text(
                '${b.cut ? '…' : ''}${b.text}',
                style: body.copyWith(fontStyle: FontStyle.italic, color: scheme.onSurfaceVariant),
              ),
            ),
          if (!hasPlan(n))
            _Card(
              title: 'This chapter',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('No plan yet.', style: body.copyWith(color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  TextButton.icon(
                    onPressed: plan,
                    icon: const Icon(Icons.edit_note, size: 18),
                    label: const Text('Plan this chapter'),
                  ),
                ],
              ),
            )
          else ...[
            if (n.summary.isNotEmpty || n.objective.isNotEmpty)
              _Card(
                title: 'This chapter',
                action: IconButton(
                  tooltip: 'Open the chapter\'s plan',
                  onPressed: plan,
                  icon: const Icon(Icons.open_in_new, size: 18),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (n.summary.isNotEmpty) Text(n.summary, style: body),
                    if (n.objective.isNotEmpty) ...[
                      if (n.summary.isNotEmpty) const SizedBox(height: 6),
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(text: 'Goal  ', style: vaultHeading(context, size: 11, weight: 700)),
                            TextSpan(text: n.objective),
                          ],
                        ),
                        style: body,
                      ),
                    ],
                  ],
                ),
              ),
            if (n.beats.isNotEmpty)
              _Card(
                title: 'Beats',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final (i, beat) in n.beats.indexed)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 22,
                              child: Text('${i + 1}', style: vaultHeading(context, size: 13, weight: 700)),
                            ),
                            Expanded(child: Text(beat, style: body)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            if (n.people.isNotEmpty || n.mentioned.isNotEmpty)
              _Card(
                title: 'On the page',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final p in n.people)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            _Monogram(person: p),
                            const SizedBox(width: 10),
                            Expanded(child: Text(p.name, style: body)),
                            if (p.pov) Text('Point of view', style: vaultHeading(context, size: 10.5, weight: 700)),
                          ],
                        ),
                      ),
                    if (n.mentioned.isNotEmpty)
                      Text(
                        'Mentioned: ${n.mentioned.join(', ')}',
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                  ],
                ),
              ),
            if (n.threads.isNotEmpty)
              _Card(
                title: 'Threads here',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final t in n.threads)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 4,
                              height: 34,
                              margin: const EdgeInsets.only(right: 10, top: 2),
                              decoration: BoxDecoration(color: castTone(t.id), borderRadius: BorderRadius.circular(2)),
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(t.title, style: body.copyWith(fontWeight: FontWeight.w600)),
                                  if (t.development.isNotEmpty)
                                    Text(t.development, style: body.copyWith(color: scheme.onSurfaceVariant)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// An index card: a thin accent edge at the top, its title in the vault's capitals, then what it holds.
class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child, this.subtitle, this.action});
  final String title;
  final String? subtitle;
  final Widget? action;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark ? scheme.surfaceContainerHigh : Color.lerp(scheme.surfaceContainerLowest, Colors.white, 0.6),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: dark ? 0.35 : 0.06),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // The card's accent edge.
              Container(height: 2, color: scheme.primary.withValues(alpha: 0.7)),
              _body(context, scheme),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, ColorScheme scheme) => Padding(
    padding: EdgeInsets.fromLTRB(14, action == null ? 8 : 0, action == null ? 14 : 2, 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(header: true, child: Text(title, style: vaultHeading(context, size: 12, weight: 700))),
            ),
            ?action,
          ],
        ),
        if (subtitle != null) Text(subtitle!, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
        const SizedBox(height: 6),
        child,
      ],
    ),
  );
}

/// A character's initials on their own colour, as on the cast wall.
class _Monogram extends StatelessWidget {
  const _Monogram({required this.person});
  final MarginPerson person;

  @override
  Widget build(BuildContext context) {
    final tone = castTone(person.id);
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    return ExcludeSemantics(
      child: Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: tone,
          shape: BoxShape.circle,
          border: person.pov ? Border.all(color: Theme.of(context).colorScheme.primary, width: 2) : null,
        ),
        child: Text(monogram(person.name), style: vaultHeading(context, size: 10, weight: 700, color: ink)),
      ),
    );
  }
}
