import 'dart:math' as math;

import '../characters/appearances.dart';
import '../collation.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validity.dart' show spanOfEvent;
import '../plot/lanes.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import 'progress.dart' show grouped;

/// CHARTS OF WHAT IS RECORDED (as in the original app)
/// Counts and distributions read straight off the novel's records: words saved in each chapter and scene, the author's
/// appearance records and other records tying characters to chapters, plot-thread developments and events, event
/// dates, points of view and the author's own labels. Nothing is scored or judged: no quality, impact or genre is
/// inferred, and every chart says what it uses and what it leaves out. Pure: it reads, and changes nothing.

class ChartFilter {
  const ChartFilter({
    this.from,
    this.to,
    this.threadId,
    this.povId,
    this.label,
    this.yearFrom,
    this.yearTo,
    this.grain = 'chapters',
    this.count = 'any',
  });

  /// The filter as a saved view keeps it (the original's page-address keys); ids naming nothing here are dropped.
  factory ChartFilter.of(JsonMap layout, StoryModel model) {
    String? node(String key) => model.nodes.containsKey(layout[key]) ? layout[key]! as String : null;
    int? whole(String key) => int.tryParse(str(layout[key]).trim());
    final label = str(layout['clabel']).trim();
    return ChartFilter(
      from: node('cfrom'),
      to: node('cto'),
      threadId: model.threads.containsKey(layout['cthread']) ? layout['cthread']! as String : null,
      povId: model.entries.containsKey(layout['cpov']) ? layout['cpov']! as String : null,
      label: label.isEmpty ? null : label,
      yearFrom: whole('cyfrom'),
      yearTo: whole('cyto'),
      grain: layout['cgrain'] == 'scenes' ? 'scenes' : 'chapters',
      count: layout['ccount'] == 'page' ? 'page' : 'any',
    );
  }

  /// A range of chapters, by id, both included; either end may be open.
  final String? from;
  final String? to;

  /// Only the chapters and scenes this thread is recorded in, and its events.
  final String? threadId;

  /// Only the chapters and scenes told from this character's point of view.
  final String? povId;

  /// Only the chapters and scenes with this label.
  final String? label;

  /// Story years, both included: for the events chart (chapters have no dates of their own).
  final int? yearFrom;
  final int? yearTo;

  /// `chapters` or `scenes`: words per chapter, or per scene.
  final String grain;

  /// `any` or `page`: appearances counted from any record, or only from appearance records.
  final String count;

  JsonMap toLayout() => {
    'cfrom': ?from,
    'cto': ?to,
    'cthread': ?threadId,
    'cpov': ?povId,
    'clabel': ?label,
    if (yearFrom != null) 'cyfrom': '$yearFrom',
    if (yearTo != null) 'cyto': '$yearTo',
    if (grain == 'scenes') 'cgrain': 'scenes',
    if (count == 'page') 'ccount': 'page',
  };

  bool get filtered =>
      from != null ||
      to != null ||
      threadId != null ||
      povId != null ||
      label != null ||
      yearFrom != null ||
      yearTo != null;
}

class ChartBar {
  ChartBar(this.key, this.short, this.label, this.value, this.ref, this.detail);
  final String key;

  /// On the axis: short ("3", "Mira", "10–19").
  final String short;

  /// In full, for the tooltip and the table.
  final String label;
  final int value;

  /// The record it is, to select; null when it is not one (a range of years).
  final EntityRef? ref;
  final String detail;
}

class Chart {
  Chart({
    required this.key,
    required this.title,
    required this.uses,
    required this.measure,
    required this.units,
    required this.shape,
    required this.bars,
    required this.empty,
    required this.summary,
    required this.notes,
    required this.columns,
    required this.rows,
  });

  /// words, lengths, appearances, threads, events, pov or labels.
  final String key;
  final String title;

  /// What it counts, and from which records.
  final String uses;
  final String measure;
  final (String, String) units;

  /// `columns` along the story, or `bars` for things that have names.
  final String shape;
  final List<ChartBar> bars;

  /// Why there is nothing to draw, when there is not.
  final String? empty;
  final String summary;

  /// What is left out, or not recorded: said, never filled in.
  final List<String> notes;

  /// The same data as a table, and as a downloadable file.
  final List<String> columns;
  final List<List<Object>> rows;
}

String _plural(int n, String one, [String? many]) => '${grouped(n)} ${n == 1 ? one : (many ?? '${one}s')}';
int _jsRound(num n) => (n + 0.5).floor();

/// A step that keeps at most [most] groups across a stretch: 1, 2, 5, 10, 20, 25, 50, 100…
int niceStep(num stretch, int most) {
  for (var scale = 1; ; scale *= 10) {
    for (final step in [1, 2, 2.5, 5]) {
      final s = step * scale;
      if (s >= 1 && s == s.roundToDouble() && (stretch / s).ceil() <= most) return s.round();
    }
  }
}

String _num(num n) => n == n.roundToDouble() ? '${n.round()}' : '$n';

/// Every chart, for the novel as filtered.
List<Chart> analyticsCharts(StoryModel model, ChartFilter filter) {
  final chapters = model.order.chapters;
  int index(String? id) =>
      id == null ? -1 : chapters.indexWhere((c) => c.id == id || model.nodes[id]?.parentId == c.id);
  final lo = filter.from != null ? math.max(0, index(filter.from)) : 0;
  final hi = filter.to != null && index(filter.to) >= 0 ? index(filter.to) : chapters.length - 1;
  int position(String id) => model.order.position[id] ?? 0;
  List<StoryNode> scenesOf(String chapterId) => stableSorted(
    model.nodes.values.where((n) => n.parentId == chapterId && n.kind == NodeKind.scene),
    (a, b) => position(a.id).compareTo(position(b.id)),
  );
  final thread = filter.threadId == null ? null : model.threads[filter.threadId];
  final threadNodes = thread == null ? null : {for (final p in placesOf(thread, model)) p.nodeId};
  // A scene with no point of view of its own is told from its chapter's.
  List<String> povOf(String nodeId) {
    final own = [
      for (final id in model.plans[nodeId]?.povIds ?? const <String>[])
        if (model.entries.containsKey(id)) id,
    ];
    final parent = model.nodes[nodeId]?.parentId;
    if (own.isNotEmpty || parent == null || model.nodes[parent]?.kind != NodeKind.chapter) return own;
    return [
      for (final id in model.plans[parent]?.povIds ?? const <String>[])
        if (model.entries.containsKey(id)) id,
    ];
  }

  final spelling = <String, String>{};
  for (final node in stableSorted(model.nodes.values, (a, b) => position(a.id).compareTo(position(b.id)))) {
    for (final l in model.plans[node.id]?.labels ?? const <String>[]) {
      spelling.putIfAbsent(l.toLowerCase(), () => l);
    }
  }
  List<String> labelsOf(String nodeId) =>
      {for (final l in model.plans[nodeId]?.labels ?? const <String>[]) spelling[l.toLowerCase()]!}.toList();
  String? chapterOf(String nodeId) =>
      model.nodes[nodeId]?.kind == NodeKind.scene ? model.nodes[nodeId]!.parentId : nodeId;
  bool passes(String nodeId, [String? skip]) =>
      (threadNodes == null || threadNodes.contains(nodeId) || threadNodes.contains(chapterOf(nodeId) ?? '')) &&
      (skip == 'pov' || filter.povId == null || povOf(nodeId).contains(filter.povId)) &&
      (skip == 'label' ||
          filter.label == null ||
          labelsOf(nodeId).any((l) => l.toLowerCase() == filter.label!.toLowerCase()));
  final narrowed = threadNodes != null || filter.povId != null || filter.label != null;
  String title(StoryNode n) =>
      n.title.trim().isNotEmpty ? n.title.trim() : (n.kind == NodeKind.scene ? 'Untitled scene' : 'Untitled chapter');

  /// Each chapter in range, with its parts: its own text (when it has scenes, only if it holds words) and its scenes.
  final inRange = [
    for (var k = lo; k <= hi && k < chapters.length; k++)
      () {
        final chapter = chapters[k];
        final number = k + 1;
        final scenes = scenesOf(chapter.id);
        final parts = [
          if (scenes.isEmpty || chapter.wordCount > 0)
            (
              node: chapter,
              label: scenes.isNotEmpty
                  ? 'Ch $number: ${title(chapter)} (chapter text)'
                  : 'Ch $number: ${title(chapter)}',
              short: '$number',
            ),
          for (final (i, s) in scenes.indexed)
            (node: s, label: 'Ch $number, scene: ${title(s)}', short: '$number.${i + 1}'),
        ];
        return (chapter: chapter, number: number, label: 'Ch $number: ${title(chapter)}', parts: parts);
      }(),
  ];
  List<({StoryNode node, String label, String short, int chapterNumber})> documents([String? skip]) => [
    for (final c in inRange)
      for (final p in c.parts)
        if (passes(p.node.id, skip)) (node: p.node, label: p.label, short: p.short, chapterNumber: c.number),
  ];
  int chapterWords(String chapterId) =>
      (model.nodes[chapterId]?.wordCount ?? 0) + scenesOf(chapterId).fold(0, (n, x) => n + x.wordCount);
  final filterWords = narrowed ? ' Only what passes the filters is counted.' : '';
  final charts = <Chart>[];
  final byChapters = filter.grain == 'chapters';

  // 1. Words per chapter, or per scene.
  {
    final bars = byChapters
        ? [
            for (final c in inRange)
              if (!(narrowed && !c.parts.any((p) => passes(p.node.id))))
                () {
                  final parts = [
                    for (final p in c.parts)
                      if (passes(p.node.id)) p,
                  ];
                  final words = narrowed ? parts.fold(0, (n, p) => n + p.node.wordCount) : chapterWords(c.chapter.id);
                  return ChartBar(
                    c.chapter.id,
                    '${c.number}',
                    c.label,
                    words,
                    EntityRef(EntityType.node, c.chapter.id),
                    '${_plural(words, 'word')}${c.parts.length > 1 ? ', in ${_plural(c.parts.length, 'part')}' : ''}',
                  );
                }(),
          ]
        : [
            for (final d in documents())
              ChartBar(
                d.node.id,
                d.short,
                d.label,
                d.node.wordCount,
                EntityRef(EntityType.node, d.node.id),
                _plural(d.node.wordCount, 'word'),
              ),
          ];
    final total = bars.fold(0, (n, b) => n + b.value);
    ChartBar? longest;
    for (final b in bars) {
      if (longest == null || b.value > longest.value) longest = b;
    }
    final unwritten = bars.where((b) => b.value == 0).length;
    charts.add(
      Chart(
        key: 'words',
        title: 'Words per ${byChapters ? 'chapter' : 'chapter and scene'}',
        uses:
            'The word count saved with each chapter and scene in the manuscript, in reading order.'
            '${byChapters ? ' A chapter counts its own text and its scenes’.' : ' A chapter with scenes shows its own text apart, when it holds any.'}'
            '$filterWords',
        measure: 'Words',
        units: ('word', 'words'),
        shape: 'columns',
        bars: bars,
        empty: chapters.isEmpty
            ? 'No chapters yet. Add them in the Organizer.'
            : bars.isEmpty
            ? 'No chapters or scenes match these filters.'
            : total == 0
            ? 'Nothing is written yet in these chapters, so there are no words to count.'
            : null,
        summary: bars.isNotEmpty
            ? '${_plural(bars.length, byChapters ? 'chapter' : 'chapter or scene', byChapters ? 'chapters' : 'chapters and scenes')}, '
                  '${_plural(total, 'word')} in all'
                  '${longest != null && longest.value != 0 ? '; the most words: ${longest.label} (${grouped(longest.value)})' : ''}.'
            : '',
        notes: [
          if (unwritten > 0)
            '${_plural(unwritten, byChapters ? 'chapter has' : 'chapter or scene has', byChapters ? 'chapters have' : 'chapters and scenes have')} '
                'no words yet; shown at zero, not as short.',
        ],
        columns: [byChapters ? 'Chapter' : 'Chapter or scene', 'Words'],
        rows: [
          for (final b in bars) [b.label, b.value],
        ],
      ),
    );

    // 2. How long chapters are: how many fall in each band of lengths.
    final chapterLengths = [
      for (final c in inRange)
        if (!(narrowed && !c.parts.any((p) => passes(p.node.id))))
          (
            label: c.label,
            words: narrowed
                ? c.parts.where((p) => passes(p.node.id)).fold(0, (n, p) => n + p.node.wordCount)
                : chapterWords(c.chapter.id),
          ),
    ];
    final written = [
      for (final c in chapterLengths)
        if (c.words > 0) c,
    ];
    final most = written.isEmpty ? 0 : written.map((c) => c.words).reduce(math.max);
    final step = written.isEmpty ? 1 : niceStep(most + 1, 12);
    final bands = written.isEmpty ? <int>[] : [for (var i = 0; i <= most ~/ step; i++) i];
    final lengthBars = [
      for (final i in bands)
        () {
          final from = i * step;
          final to = (i + 1) * step - 1;
          final here = [
            for (final c in written)
              if (c.words >= from && c.words <= to) c,
          ];
          return ChartBar(
            'band-$i',
            from >= 1000 ? '${_num(from / 1000)}K' : '$from',
            '${grouped(from)}–${grouped(to)} words',
            here.length,
            null,
            here.isNotEmpty ? here.map((c) => c.label).join('; ') : 'No chapter',
          );
        }(),
    ];
    charts.add(
      Chart(
        key: 'lengths',
        title: 'How long chapters are',
        uses:
            'Each chapter’s words (its own text and its scenes’), counted into bands of ${grouped(step)} words: how '
            'many chapters fall in each. Chapters with no words yet are left out, as not written.$filterWords',
        measure: 'Chapters',
        units: ('chapter', 'chapters'),
        shape: 'columns',
        bars: lengthBars,
        empty: written.length < 2
            ? 'Needs at least two chapters with words${written.isNotEmpty ? ': only one has any so far' : ''}.'
            : null,
        summary: written.isNotEmpty
            ? '${_plural(written.length, 'chapter')} with words, in bands of ${grouped(step)} words; the most chapters in '
                  'one band: ${lengthBars.map((b) => b.value).reduce(math.max)}.'
            : '',
        notes: [
          if (chapterLengths.length > written.length)
            '${_plural(chapterLengths.length - written.length, 'chapter has', 'chapters have')} no words yet, and '
                '${chapterLengths.length - written.length == 1 ? 'is' : 'are'} not counted.',
        ],
        columns: ['Length', 'Chapters', 'Which'],
        rows: [
          for (final b in lengthBars) [b.label, b.value, if (b.value > 0) b.detail else ''],
        ],
      ),
    );
  }

  // 3. Character appearances: in how many chapters each character is recorded.
  {
    final matrix = appearanceMatrix(model, MatrixFilter(from: filter.from, to: filter.to, threadId: filter.threadId));
    final kept = [
      for (final col in matrix.columns)
        if (filter.povId == null && filter.label == null)
          true
        else
          inRange.where((x) => x.chapter.id == col.chapterId).firstOrNull?.parts.any((p) => passes(p.node.id)) ?? false,
    ];
    final rows = [
      for (final r in matrix.rows)
        () {
          final cells = [
            for (final (i, c) in r.cells.indexed)
              if (kept[i]) c,
          ];
          final page = cells.where((c) => c.state == CellState.appears).length;
          final mentioned = cells.where((c) => c.state == CellState.mentioned).length;
          final other = cells.where((c) => c.state == CellState.other).length;
          return (r: r, page: page, mentioned: mentioned, other: other, any: page + mentioned + other);
        }(),
    ];
    final counted = stableSorted(
      [
        for (final x in rows)
          if ((filter.count == 'page' ? x.page : x.any) > 0) (x: x, value: filter.count == 'page' ? x.page : x.any),
      ],
      (a, b) {
        final c = b.value.compareTo(a.value);
        return c != 0 ? c : localeCompare(a.x.r.name, b.x.r.name);
      },
    );
    final columns = kept.where((k) => k).length;
    final characters = model.entries.values.where((e) => e.category == 'character').length;
    charts.add(
      Chart(
        key: 'appearances',
        title: 'Character appearances',
        uses: filter.count == 'page'
            ? 'Your appearance records only: the chapters in which you record a character as on the page (a chapter '
                  'counts its scenes’ records).'
            : 'Every record tying a character to a chapter or its scenes: your appearance records (on the page, or '
                  'mentioned), links in the text, “Entities involved” in a plan, and events told there that they take '
                  'part in. No text is searched for names.',
        measure: 'Chapters',
        units: ('chapter', 'chapters'),
        shape: 'bars',
        bars: [
          for (final c in counted)
            ChartBar(
              c.x.r.characterId,
              c.x.r.name,
              c.x.r.name,
              c.value,
              EntityRef(EntityType.entry, c.x.r.characterId),
              '${_plural(c.value, 'chapter')} of $columns: on the page ${c.x.page}, mentioned ${c.x.mentioned}, other '
              'records ${c.x.other}',
            ),
        ],
        empty: characters == 0
            ? 'No characters yet. Add them on the Characters page.'
            : columns == 0
            ? 'No chapters match these filters.'
            : counted.isEmpty
            ? (filter.count == 'page'
                  ? 'No appearance records in these chapters. Record who appears on a chapter’s or scene’s plan, under '
                        '“Who appears here”.'
                  : 'Nothing ties a character to these chapters yet: no appearance records, links in the text, plans or '
                        'events told there.')
            : null,
        summary: counted.isNotEmpty
            ? '${_plural(counted.length, 'character')} recorded in ${_plural(columns, 'chapter')}; the most: '
                  '${counted.first.x.r.name}, in ${_plural(counted.first.value, 'chapter')}.'
            : '',
        notes: [
          if (characters > counted.length && counted.isNotEmpty)
            '${_plural(characters - counted.length, 'character has', 'characters have')} nothing recorded in these '
                'chapters, and ${characters - counted.length == 1 ? 'is' : 'are'} not shown: not recorded, which is not '
                'the same as absent.',
        ],
        columns: ['Character', 'Chapters with any record', 'On the page', 'Mentioned', 'Other records'],
        rows: [
          for (final x in stableSorted(rows.where((x) => x.any > 0), (a, b) {
            final c = b.any.compareTo(a.any);
            return c != 0 ? c : localeCompare(a.r.name, b.r.name);
          }))
            [x.r.name, x.any, x.page, x.mentioned, x.other],
        ],
      ),
    );
  }

  // 4. Plot-thread presence: in how many chapters each thread has something recorded.
  {
    final lanes = threadLanes(model, filter.threadId != null ? [filter.threadId!] : null);
    final shown = [for (final c in inRange) c.number - 1];
    final rows = [
      for (final lane in lanes.lanes)
        (
          lane: lane,
          present: [
            for (final col in shown)
              if (col < lane.cells.length && lane.cells[col].places.any((p) => passes(p.nodeId))) col,
          ],
        ),
    ];
    final counted = stableSorted(
      [
        for (final r in rows)
          if (r.present.isNotEmpty) r,
      ],
      (a, b) {
        final c = b.present.length.compareTo(a.present.length);
        return c != 0 ? c : localeCompare(a.lane.thread.title, b.lane.thread.title);
      },
    );
    final span = shown.length;
    int pct(int n) => _jsRound(n / math.max(span, 1) * 100);
    charts.add(
      Chart(
        key: 'threads',
        title: 'Plot-thread presence',
        uses:
            'The chapters in which each plot thread has a development you placed (introduced, develops, crosses, '
            'resolved, appears) or one of its events is told. Chapters with nothing recorded for a thread are counted as '
            'just that.',
        measure: 'Chapters',
        units: ('chapter', 'chapters'),
        shape: 'bars',
        bars: [
          for (final r in counted)
            ChartBar(
              r.lane.thread.id,
              r.lane.thread.title,
              r.lane.thread.title,
              r.present.length,
              EntityRef(EntityType.thread, r.lane.thread.id),
              'in ${r.present.length} of $span ${span == 1 ? 'chapter' : 'chapters'} (${pct(r.present.length)}%): Ch '
              '${r.present.map((col) => col + 1).join(', ')}',
            ),
        ],
        empty: model.threads.isEmpty
            ? 'No plot threads yet. Start one on the Plot threads page.'
            : span == 0
            ? 'No chapters match these filters.'
            : counted.isEmpty
            ? 'No thread has anything placed in these chapters yet.'
            : null,
        summary: counted.isNotEmpty
            ? '${_plural(counted.length, 'thread')} across ${_plural(span, 'chapter')}; the most present: '
                  '${counted.first.lane.thread.title}, in ${_plural(counted.first.present.length, 'chapter')}.'
            : '',
        notes: [
          if (rows.length > counted.length && counted.isNotEmpty)
            '${_plural(rows.length - counted.length, 'thread has', 'threads have')} nothing placed in these chapters.',
        ],
        columns: ['Thread', 'Chapters', 'Share of chapters shown', 'Which'],
        rows: [
          for (final r in rows)
            [
              r.lane.thread.title,
              r.present.length,
              '${pct(r.present.length)}%',
              r.present.map((col) => 'Ch ${col + 1}').join(', '),
            ],
        ],
      ),
    );
  }

  // 5. Events over story time.
  {
    final context = model.timeContext;
    final perYear = model.calendar.minutesPerYear;
    bool told(List<String> nodeIds) => nodeIds.any((id) {
      final c = inRange.where((x) => x.chapter.id == id || x.parts.any((p) => p.node.id == id)).firstOrNull;
      return c != null && (filter.povId == null && filter.label == null ? true : passes(id));
    });
    final ranged = filter.from != null || filter.to != null || filter.povId != null || filter.label != null;
    final events = [
      for (final e in model.events.values)
        if ((filter.threadId == null || e.threadIds.contains(filter.threadId)) && (!ranged || told(e.nodeIds))) e,
    ];
    final placed = <({String name, int year})>[];
    var undated = 0;
    for (final e in events) {
      final span = spanOfEvent(e.id, context);
      if (span == null) {
        undated++;
        continue;
      }
      // The year it starts: the first its date allows ("some time in Year 10" is Year 10).
      final year = (span.lo / perYear).floor();
      if ((filter.yearFrom != null && year < filter.yearFrom!) || (filter.yearTo != null && year > filter.yearTo!)) {
        continue;
      }
      placed.add((name: e.name, year: year));
    }
    final years = [for (final p in placed) p.year];
    final min = years.isEmpty ? 0 : (filter.yearFrom ?? years.reduce(math.min));
    final max = years.isEmpty ? 0 : (filter.yearTo ?? years.reduce(math.max));
    final step = years.isEmpty ? 1 : niceStep(max - min + 1, 30);
    final start = (min / step).floor() * step;
    final count = years.isEmpty ? 0 : ((max - start) / step).floor() + 1;
    String name(int y) => model.calendar.yearName(y);
    final bars = [
      for (var i = 0; i < count; i++)
        () {
          final a = start + i * step;
          final b = start + (i + 1) * step - 1;
          final here = [
            for (final p in placed)
              if (p.year >= a && p.year <= b) p,
          ];
          return ChartBar(
            'y$a',
            step == 1 ? '$a' : '$a–$b',
            step == 1 ? name(a) : '${name(a)} to ${name(b)}',
            here.length,
            null,
            here.isNotEmpty
                ? '${here.map((p) => p.name).take(8).join('; ')}${here.length > 8 ? '; and ${here.length - 8} more' : ''}'
                : 'No event',
          );
        }(),
    ];
    ChartBar? busiest;
    for (final b in bars) {
      if (busiest == null || b.value > busiest.value) busiest = b;
    }
    charts.add(
      Chart(
        key: 'events',
        title: 'Events per ${step == 1 ? 'year' : '${grouped(step)} years'} of story time',
        uses:
            'The timeline’s events placed by the year they start, in the novel’s calendar (an approximate date counts at '
            'the first year it allows; a relative date, from the event it leans on).'
            '${ranged ? ' Only events told in the chapters that pass the filters.' : ''}'
            '${filter.threadId != null ? ' Only the thread’s events.' : ''}',
        measure: 'Events',
        units: ('event', 'events'),
        shape: 'columns',
        bars: bars,
        empty: model.events.isEmpty
            ? 'No events yet. Add them on the Timeline.'
            : events.isEmpty
            ? 'No events match these filters.'
            : placed.isEmpty
            ? 'None of the ${_plural(events.length, 'event')} has a date that can be placed'
                  '${filter.yearFrom != null || filter.yearTo != null ? ' in these years' : ''}.'
            : null,
        summary: placed.isNotEmpty
            ? '${_plural(placed.length, 'event')} from ${name(min)} to ${name(max)}, in groups of ${_plural(step, 'year')}; '
                  'the busiest: ${busiest!.label}.'
            : '',
        notes: [
          if (undated > 0)
            '${_plural(undated, 'event has', 'events have')} no date that can be placed, and '
                '${undated == 1 ? 'is' : 'are'} not counted.',
        ],
        columns: ['Story time', 'Events', 'Which'],
        rows: [
          for (final b in bars) [b.label, b.value, if (b.value > 0) b.detail else ''],
        ],
      ),
    );
  }

  // 6. Point of view.
  {
    final docs = documents('pov');
    final by = <String, ({int count, int words})>{};
    var none = 0;
    for (final d in docs) {
      final all = povOf(d.node.id);
      if (all.isEmpty) none++;
      for (final id in all.where((id) => filter.povId == null || id == filter.povId)) {
        final was = by[id] ?? (count: 0, words: 0);
        by[id] = (count: was.count + 1, words: was.words + d.node.wordCount);
      }
    }
    final rows = stableSorted(
      [
        for (final MapEntry(:key, :value) in by.entries)
          (id: key, name: model.entries[key]!.name, count: value.count, words: value.words),
      ],
      (a, b) {
        final c = b.count.compareTo(a.count);
        return c != 0 ? c : localeCompare(a.name, b.name);
      },
    );
    final recordedAnywhere = model.plans.values.any((p) => p.povIds.isNotEmpty);
    charts.add(
      Chart(
        key: 'pov',
        title: 'Point of view',
        uses:
            'Whose point of view each chapter and scene is told from, as you record it on its plan (“Who appears here” → '
            'Point of view). A scene with none recorded is told from its chapter’s. Counted by chapter and scene; a part '
            'with two points of view counts for both.',
        measure: 'Chapters and scenes',
        units: ('chapter or scene', 'chapters and scenes'),
        shape: 'bars',
        bars: [
          for (final r in rows)
            ChartBar(
              r.id,
              r.name,
              r.name,
              r.count,
              EntityRef(EntityType.entry, r.id),
              '${_plural(r.count, 'chapter or scene', 'chapters and scenes')}, ${_plural(r.words, 'word')}',
            ),
        ],
        empty: !recordedAnywhere
            ? 'No point of view is recorded. Record it on a chapter’s or scene’s plan, under “Who appears here”, and '
                  'this chart counts it.'
            : rows.isEmpty
            ? 'No point of view is recorded in the chapters and scenes that match these filters.'
            : null,
        summary: rows.isNotEmpty
            ? '${_plural(rows.length, 'point of view', 'points of view')} across '
                  '${_plural(docs.length, 'chapter or scene', 'chapters and scenes')}; the most: ${rows.first.name}, '
                  '${_plural(rows.first.count, 'chapter or scene', 'chapters and scenes')}.'
            : '',
        notes: [
          if (none > 0 && recordedAnywhere)
            '${_plural(none, 'chapter or scene has', 'chapters and scenes have')} no point of view recorded, and '
                '${none == 1 ? 'is' : 'are'} not counted.',
        ],
        columns: ['Point of view', 'Chapters and scenes', 'Words'],
        rows: [
          for (final r in rows) [r.name, r.count, r.words],
        ],
      ),
    );
  }

  // 7. The author's own categories: labels on chapters and scenes.
  {
    final docs = documents('label');
    final by = <String, ({int count, int words})>{};
    var none = 0;
    for (final d in docs) {
      final labels = labelsOf(d.node.id);
      if (labels.isEmpty) none++;
      for (final l in labels.where((x) => filter.label == null || x.toLowerCase() == filter.label!.toLowerCase())) {
        final was = by[l] ?? (count: 0, words: 0);
        by[l] = (count: was.count + 1, words: was.words + d.node.wordCount);
      }
    }
    final rows = stableSorted(
      [for (final MapEntry(:key, :value) in by.entries) (label: key, count: value.count, words: value.words)],
      (a, b) {
        final c = b.count.compareTo(a.count);
        return c != 0 ? c : localeCompare(a.label, b.label);
      },
    );
    final recordedAnywhere = model.plans.values.any((p) => p.labels.isNotEmpty);
    charts.add(
      Chart(
        key: 'labels',
        title: 'Your scene categories',
        uses:
            'The labels you give chapters and scenes on their plans (action, dialogue, a quiet moment…), as you spell '
            'them. Counted by chapter and scene, each under its own labels; one with two labels counts for both.',
        measure: 'Chapters and scenes',
        units: ('chapter or scene', 'chapters and scenes'),
        shape: 'bars',
        bars: [
          for (final r in rows)
            ChartBar(
              r.label,
              r.label,
              r.label,
              r.count,
              null,
              '${_plural(r.count, 'chapter or scene', 'chapters and scenes')}, ${_plural(r.words, 'word')}',
            ),
        ],
        empty: !recordedAnywhere
            ? 'No labels yet. Give a chapter or scene labels on its plan, and this chart counts them.'
            : rows.isEmpty
            ? 'No labelled chapters or scenes match these filters.'
            : null,
        summary: rows.isNotEmpty
            ? '${_plural(rows.length, 'label')} on ${_plural(docs.length - none, 'chapter or scene', 'chapters and scenes')}; '
                  'the most used: ${rows.first.label}, on ${_plural(rows.first.count, 'chapter or scene', 'chapters and scenes')}.'
            : '',
        notes: [
          if (none > 0 && recordedAnywhere)
            '${_plural(none, 'chapter or scene has', 'chapters and scenes have')} no label, and '
                '${none == 1 ? 'is' : 'are'} not counted.',
        ],
        columns: ['Label', 'Chapters and scenes', 'Words'],
        rows: [
          for (final r in rows) [r.label, r.count, r.words],
        ],
      ),
    );
  }

  return charts;
}

/// A table as a CSV file. A cell that a spreadsheet would read as a formula (=, +, -, @) is kept as text.
String toCsv(List<String> columns, List<List<Object>> rows) {
  String cell(Object v) {
    final text = v is num ? '$v' : (RegExp(r'^[=+\-@\t\r]').hasMatch('$v') ? "'$v" : '$v');
    return RegExp(r'[",\n\r]').hasMatch(text) ? '"${text.replaceAll('"', '""')}"' : text;
  }

  return [
    for (final r in [columns, ...rows]) r.map(cell).join(','),
  ].join('\r\n');
}
