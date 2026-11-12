import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/background.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/consequences/consequences.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/outline.dart' show isDocument;
import '../../shared/domain/model/story_order.dart';
import '../characters/character_actions.dart' show characterPath, entryPath;
import '../workspace/area_switch.dart';
import '../workspace/open_novel.dart';
import '../workspace/section_page.dart';
import '../write/write_providers.dart';
import 'consequences_job.dart';

/// The address of "What depends on this" for a chapter or scene, an event, or a development of a plot thread.
String consequencesPath({String? nodeId, String? eventId, String? threadId, String? beatId}) => Uri(
  path: '/review/consequences',
  queryParameters: {'node': ?nodeId, 'event': ?eventId, 'thread': ?threadId, 'beat': ?beatId},
).toString();

enum _Kind {
  node('A chapter or scene'),
  event('An event'),
  beat('A plot development');

  const _Kind(this.label);
  final String label;
}

/// WHAT DEPENDS ON THIS: before changing a chapter, an event or a development of a plot thread, what is recorded at
/// that point, and what later in the story may rest on it. Reads only; changes nothing and proposes no edit.
class ConsequencesPage extends ConsumerStatefulWidget {
  const ConsequencesPage({super.key, this.nodeId, this.eventId, this.threadId, this.beatId});
  final String? nodeId;
  final String? eventId;
  final String? threadId;
  final String? beatId;

  @override
  ConsumerState<ConsequencesPage> createState() => _ConsequencesPageState();
}

/// How many times the analysis has been started (for the test that it is not on every rebuild).
@visibleForTesting
int consequenceRuns = 0;

class _ConsequencesPageState extends ConsumerState<ConsequencesPage> {
  late var _kind = widget.eventId != null ? _Kind.event : (widget.beatId != null ? _Kind.beat : _Kind.node);
  final _include = <String>[];
  final _exclude = <String>[];
  late final NovelStore _store = ref.read(novelStoreProvider);

  // THE NOVEL AND THE REPORT ARE WORKED OUT ONLY WHEN WHAT THEY ARE MADE FROM CHANGES. This page used to read eleven
  // collections (every chapter's text among them) and run the whole analysis in every build: on every save anywhere in
  // the novel while it was open, and on every "Looked at" ticked. Now each build asks only when those collections last
  // changed (`NovelStore.stampOf`, from the index). The novel (for the pickers) is read again when that changes; the
  // analysis runs in the background (`background.dart`) when the data, the point or the people taken to be involved
  // change, and only the answer to the latest of those is ever shown.
  String? _worldFrom;
  World? _world;
  Report? _report;
  String? _reportFrom;
  String? _reportPoint;
  String? _working;

  /// When the collections the page reads last changed, as one key.
  String _dataKey(String novelId) => [
    novelId,
    for (final c in consequenceCollections)
      if (_store.stampOf(novelId, c) case (:final count, :final latest)) ...[count, latest],
  ].join(':');

  World _worldFor(String novelId, String data) {
    if (_world != null && _worldFrom == data) return _world!;
    final s = _store.loadPart(novelId, consequenceCollections)!;
    _worldFrom = data;
    return _world = worldFromRows(s.rows);
  }

  /// The report for [subject] (null while the first one for this point is being worked out), and whether a newer one
  /// is on its way (the novel changed since).
  ({Report? report, bool updating}) _reportFor(String novelId, String data, Subject subject) {
    final point = [_subjectKey, ..._include, '|', ..._exclude].join(',');
    final key = '$data#$point';
    if (key != _reportFrom && key != _working) {
      _working = key;
      consequenceRuns++;
      final stored = {for (final c in consequenceCollections) c: _store.rawJsonIn(novelId, c)};
      final job = consequencesJob(stored: stored, subject: subject, include: [..._include], exclude: [..._exclude]);
      ref
          .read(runAsideProvider)(job)
          .then(
            (report) {
              if (!mounted || _working != key) return;
              setState(() {
                _report = report;
                _reportFrom = key;
                _reportPoint = point;
                _working = null;
              });
            },
            onError: (Object e, StackTrace s) {
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'consequences'));
              if (mounted && _working == key) setState(() => _working = null);
            },
          );
    }
    // The last answer is shown only for the same point (the novel may have changed since: it is said to be updating).
    if (_reportPoint != point) return (report: null, updating: true);
    return (report: _report, updating: _reportFrom != key);
  }

  @override
  void initState() {
    super.initState();
    _store.addListener(_changed);
  }

  @override
  void didUpdateWidget(ConsequencesPage old) {
    super.didUpdateWidget(old);
    if (old.nodeId != widget.nodeId || old.eventId != widget.eventId || old.beatId != widget.beatId) {
      _include.clear();
      _exclude.clear();
    }
  }

  @override
  void dispose() {
    _store.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Subject? get _subject => switch (_kind) {
    _Kind.node when widget.nodeId != null => NodeSubject(widget.nodeId!),
    _Kind.event when widget.eventId != null => EventSubject(widget.eventId!),
    _Kind.beat when widget.threadId != null && widget.beatId != null => BeatSubject(widget.threadId!, widget.beatId!),
    _ => null,
  };

  String get _subjectKey => switch (_subject) {
    NodeSubject(:final nodeId) => 'node:$nodeId',
    EventSubject(:final eventId) => 'event:$eventId',
    BeatSubject(:final threadId, :final beatId) => 'beat:$threadId/$beatId',
    null => '',
  };

  String _lookedKey(String novelId) => 'consequences.looked.$novelId.$_subjectKey';

  void _go(String path) => context.go(path);

  void _open(JsonMap target) {
    switch (target['type']) {
      case 'node':
        final nodeId = str(target['nodeId']);
        final term = strOrNull(target['term']);
        ref
            .read(pendingFindProvider.notifier)
            .request(term == null ? null : (nodeId: nodeId, term: term, block: intOrNull(target['block']) ?? 0));
        ref.read(selectedNodeProvider.notifier).select(nodeId);
        _go(Destination.write.path);
      case 'entry':
        final id = str(target['entryId']);
        final entry = _store.row(ref.read(openNovelProvider)!, 'loreEntries', id);
        _go(entryPath(id, character: entry?['category'] == 'character'));
      case 'thread':
        _go('/plan/thread/${str(target['threadId'])}');
      case 'relation':
        _go('/organize/relationship/${str(target['relationId'])}');
      case 'snapshot':
        _go(characterPath(str(target['entryId']), tab: 'progression'));
      case 'rule':
        _go('/review/continuity');
      case 'fact':
        _go('/review/canon');
      case 'event':
        _go('/plan/event/${str(target['eventId'])}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.review);
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final data = _dataKey(novelId);
    final world = _worldFor(novelId, data);
    final order = StoryOrder.of(world.nodes);
    final documents = [
      for (final n in world.nodes)
        if (isDocument(n.kind) || n.kind?.isGroup == true) n,
    ]..sort((a, b) => (order.position[a.id] ?? 0).compareTo(order.position[b.id] ?? 0));
    final events = [...world.events]..sort((a, b) => localeCompare(str(a['name']), str(b['name'])));
    final beats = [
      for (final t in world.threads)
        for (final b in maps(t['beats'])) (thread: t, beat: b),
    ];
    final subject = _subject;
    final answer = subject == null ? null : _reportFor(novelId, data, subject);
    final report = answer?.report;
    final settings = ref.read(settingsStoreProvider);
    final looked = {for (final k in listOf(settings.read(_lookedKey(novelId)))) str(k)};
    void setLooked(String key, bool on) {
      final next = {...looked};
      on ? next.add(key) : next.remove(key);
      settings.write(_lookedKey(novelId), next.toList());
      setState(() {});
    }

    Widget picker() => switch (_kind) {
      _Kind.node => DropdownButtonFormField<String>(
        key: ValueKey('node:${widget.nodeId}'),
        initialValue: documents.any((n) => n.id == widget.nodeId) ? widget.nodeId : null,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Chapter or scene'),
        items: [
          for (final n in documents)
            DropdownMenuItem(
              value: n.id,
              child: Text(n.displayTitle, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (id) => _go(consequencesPath(nodeId: id)),
      ),
      _Kind.event => DropdownButtonFormField<String>(
        key: ValueKey('event:${widget.eventId}'),
        initialValue: events.any((e) => e['id'] == widget.eventId) ? widget.eventId : null,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Event'),
        items: [
          for (final e in events)
            DropdownMenuItem(
              value: str(e['id']),
              child: Text(str(e['name'], 'Untitled event'), overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (id) => _go(consequencesPath(eventId: id)),
      ),
      _Kind.beat => DropdownButtonFormField<String>(
        key: ValueKey('beat:${widget.threadId}/${widget.beatId}'),
        initialValue: beats.any((b) => b.thread['id'] == widget.threadId && b.beat['id'] == widget.beatId)
            ? '${widget.threadId}/${widget.beatId}'
            : null,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Plot development'),
        items: [
          for (final b in beats)
            DropdownMenuItem(
              value: '${str(b.thread['id'])}/${str(b.beat['id'])}',
              child: Text(
                '${str(b.thread['title'])}: ${str(b.beat['title'], 'a development')}',
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
        onChanged: (v) {
          if (v == null) return;
          final at = v.indexOf('/');
          _go(consequencesPath(threadId: v.substring(0, at), beatId: v.substring(at + 1)));
        },
      ),
    };

    Widget card(Consequence c) {
      final done = looked.contains(c.key);
      return Card.outlined(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 12, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox(
                value: done,
                semanticLabel: 'Looked at: ${c.message}',
                onChanged: (v) => setLooked(c.key, v ?? false),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.kind.label, style: theme.textTheme.labelMedium),
                    Text(c.message, style: done ? TextStyle(color: theme.colorScheme.onSurfaceVariant) : null),
                    Text(c.basis, style: muted),
                    if (c.excerpt case final excerpt?)
                      Container(
                        margin: const EdgeInsets.only(top: 6),
                        padding: const EdgeInsets.fromLTRB(10, 4, 4, 4),
                        decoration: BoxDecoration(
                          border: Border(left: BorderSide(color: theme.colorScheme.outline, width: 3)),
                        ),
                        child: Text('“$excerpt”', style: muted?.copyWith(fontStyle: FontStyle.italic)),
                      ),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(onPressed: () => _open(c.target), child: const Text('Open')),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final entries = [...world.entries]..sort((a, b) => localeCompare(str(a['name']), str(b['name'])));
    return PageScaffold(
      title: 'What depends on this',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review/consequences'),
          const SizedBox(height: 12),
          Text('Read only: nothing here changes the novel or suggests an edit.', style: muted),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final k in _Kind.values)
                ChoiceChip(label: Text(k.label), selected: _kind == k, onSelected: (_) => setState(() => _kind = k)),
            ],
          ),
          const SizedBox(height: 12),
          picker(),
          const SizedBox(height: 16),
          if (subject == null)
            const EmptyState(
              icon: Icons.account_tree_outlined,
              title: 'Pick the point you are thinking of changing',
              message: 'A chapter or scene, an event, or a development of a plot thread.',
            )
          else if (report == null)
            // Worked out in the background: the page stays usable while it reads the novel.
            Semantics(
              liveRegion: true,
              child: Row(
                children: [
                  const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5)),
                  const SizedBox(width: 12),
                  Expanded(child: Text('Reading what may depend on it…', style: theme.textTheme.bodyLarge)),
                ],
              ),
            )
          else if (!report.found)
            EmptyState(icon: Icons.search_off, title: report.title, message: 'It is no longer in the novel.')
          else ...[
            if (answer?.updating ?? false)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text('Updating with your latest changes…', style: muted),
              ),
            Semantics(header: true, child: Text('If ${report.title} changes', style: theme.textTheme.titleLarge)),
            Text(
              '${report.summaryLine}. ${report.downstream} chapters and scenes come after it.',
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 12),
            Text('Taken to involve', style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (report.seeds.isEmpty) Text('No one in particular.', style: muted),
                for (final e in report.seeds)
                  InputChip(
                    label: Text(str(e['name'])),
                    onPressed: () => _go(entryPath(str(e['id']), character: e['category'] == 'character')),
                    deleteButtonTooltipMessage: 'Leave out ${str(e['name'])}',
                    onDeleted: () => setState(() {
                      final id = str(e['id']);
                      _include.contains(id) ? _include.remove(id) : _exclude.add(id);
                    }),
                  ),
                SizedBox(
                  width: 240,
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('also:${_include.length}:${_exclude.length}'),
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Also involves…', isDense: true),
                    items: [
                      for (final e in entries)
                        if (!report.seeds.any((s) => s['id'] == e['id']))
                          DropdownMenuItem(
                            value: str(e['id']),
                            child: Text(str(e['name']), overflow: TextOverflow.ellipsis),
                          ),
                    ],
                    onChanged: (id) => setState(() {
                      if (id == null) return;
                      _exclude.remove(id);
                      if (!report.suggested.any((s) => s['id'] == id)) _include.add(id);
                    }),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Semantics(
              header: true,
              child: Text('Recorded at this point (${report.established.length})', style: theme.textTheme.titleMedium),
            ),
            Text(
              'Things you have recorded that are tied to exactly this point: if it changes, they hang on something no '
              'longer there.',
              style: muted,
            ),
            const SizedBox(height: 8),
            if (report.established.isEmpty) Text('Nothing is recorded at this point.', style: muted),
            for (final c in report.established) card(c),
            const SizedBox(height: 16),
            Semantics(
              header: true,
              child: Text('May be affected later (${report.potential.length})', style: theme.textTheme.titleMedium),
            ),
            Text(
              'Later things that involve the same people, places or threads. They may rest on this point, or not at '
              'all: nothing in the novel says, so these are possibilities to look at, not facts.',
              style: muted,
            ),
            const SizedBox(height: 8),
            if (report.potential.isEmpty) Text('Nothing later involves them.', style: muted),
            for (final c in report.potential) card(c),
          ],
        ],
      ),
    );
  }
}
