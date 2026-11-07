import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/page_scaffold.dart';
import '../../shared/domain/analytics/analytics.dart';
import '../../shared/domain/analytics/progress.dart';
import '../workspace/area_switch.dart';
import 'progress_page.dart';
import 'progress_providers.dart';
import 'widgets/bars.dart';

String _days(int n) => '$n ${n == 1 ? 'day' : 'days'}';
String _count(int n, String one, String many) => '$n ${n == 1 ? one : many}';

/// PROJECT ANALYTICS
/// Counts taken from the novel and stated as they are: writing output, sessions, the manuscript's structure, where
/// each character appears and where each plot thread develops, and plain statements of fact drawn from those numbers.
/// Nothing is scored or judged; whether any of it is as intended is the author's to say. It is worked out only while
/// this page is open, from what is already saved.
class AnalyticsPage extends ConsumerStatefulWidget {
  const AnalyticsPage({super.key});

  @override
  ConsumerState<AnalyticsPage> createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends ConsumerState<AnalyticsPage> {
  bool _allCast = false;

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(progressDataProvider);
    if (data == null) return const NoNovelProgress();
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final small = theme.textTheme.bodySmall;
    final a = data.analytics;
    final (:output, :sessions, :structure, :cast, :threads) = (
      output: a.output,
      sessions: a.sessions,
      structure: a.structure,
      cast: a.cast,
      threads: a.threads,
    );
    final actions = ProgressActions(context, data.novelId);
    String day(String key) => mediumDay(key);
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleLarge)),
    );
    Widget tiles(List<Widget> children) => Tiles(children: children);
    Widget chapterTile(String label, PlaceWords? place) => Tile(
      label: label,
      value: place == null ? '—' : grouped(place.words),
      detail: place?.title,
      extra: [
        if (place != null)
          TextButton(
            style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
            onPressed: () => actions.openChapter(place.nodeId),
            child: Text('Open Ch. ${place.number}'),
          ),
      ],
    );
    final most = cast.rows.fold(1, (m, r) => r.chapters.length > m ? r.chapters.length : m);
    final shown = _allCast ? cast.rows : cast.rows.take(12).toList();

    return PageScaffold(
      title: 'Analytics',
      subtitle:
          '${grouped(output.totalWords)} ${output.totalWords == 1 ? 'word' : 'words'}'
          '${output.targetWords != null ? ' · ${output.percent}% of ${grouped(output.targetWords!)}' : ''}'
          ' · ${_count(structure.chapters, 'chapter', 'chapters')} · ${_count(cast.total, 'character', 'characters')}'
          ' · ${_count(threads.total, 'plot thread', 'plot threads')}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: progressParts, current: '/progress/analytics'),
          const SizedBox(height: 16),
          section(context, 'Observations', [
            if (a.observations.isEmpty)
              const Text('Nothing stands out in the numbers below.')
            else
              for (final line in a.observations)
                Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Text('• $line')),
          ]),
          heading('Writing output'),
          tiles([
            Tile(
              label: 'Words in the manuscript',
              value: grouped(output.totalWords),
              detail: output.targetWords != null
                  ? '${output.percent}% of the ${grouped(output.targetWords!)} target'
                  : 'No target set',
            ),
            Tile(
              label: 'Words today',
              value: signed(output.today.net),
              detail: _count(output.today.sessions, 'session', 'sessions'),
            ),
            Tile(
              label: 'This week',
              value: signed(output.week.net),
              detail: '${_days(output.week.activeDays)} with writing',
            ),
            Tile(
              label: 'This month',
              value: signed(output.month.net),
              detail: '${_days(output.month.activeDays)} with writing',
            ),
            Tile(
              label: 'Average per writing day',
              value: signed(output.averagePerWritingDay),
              detail: 'over ${_days(sessions.writingDays)}',
            ),
            Tile(label: 'Average per day, last 30 days', value: signed(output.averagePerDayLast30)),
          ]),
          const SizedBox(height: 12),
          TrendChart(title: 'Net words per day, last 30 days', periodLabel: 'On', points: output.days, labelEvery: 5),
          const SizedBox(height: 12),
          TrendChart(title: 'Net words per week, last 8 weeks', periodLabel: 'Week of', points: output.weeks),
          heading('Sessions'),
          tiles([
            Tile(
              label: 'Writing sessions',
              value: '${sessions.count}',
              detail: '${duration(sessions.totalMinutes)} in all',
            ),
            Tile(label: 'Words per session', value: signed(sessions.averageWords)),
            Tile(label: 'Average session length', value: duration(sessions.averageMinutes)),
            Tile(
              label: 'Most words in a session',
              value: sessions.longestByWords == null ? '—' : grouped(sessions.longestByWords!.words),
              detail: sessions.longestByWords == null ? null : day(sessions.longestByWords!.day),
            ),
            Tile(
              label: 'Longest session',
              value: sessions.longestByTime == null ? '—' : duration(sessions.longestByTime!.minutes),
              detail: sessions.longestByTime == null ? null : day(sessions.longestByTime!.day),
            ),
            Tile(
              label: 'Current streak',
              value: _days(sessions.currentStreak),
              detail: 'longest: ${_days(sessions.longestStreak)}',
            ),
          ]),
          heading('Manuscript structure'),
          tiles([
            Tile(label: 'Chapters', value: '${structure.chapters}'),
            Tile(label: 'Scenes', value: '${structure.scenes}'),
            Tile(
              label: 'Average chapter length',
              value: grouped(structure.averageChapter),
              detail: 'words, chapters with text',
            ),
            Tile(
              label: 'Average scene length',
              value: grouped(structure.averageScene),
              detail: 'words, scenes with text',
            ),
            chapterTile('Longest chapter', structure.longest),
            chapterTile('Shortest chapter with text', structure.shortest),
          ]),
          const SizedBox(height: 12),
          section(context, 'Chapters by stage', [
            PartsBar(
              label: 'Chapters by stage',
              parts: structure.pipeline,
              // Stages run in order, so one hue, light to dark.
              colors: [
                for (final o in [0.3, 0.5, 0.75, 1.0]) scheme.primary.withValues(alpha: o),
              ],
            ),
          ]),
          if (structure.lengths.isNotEmpty) ...[
            const SizedBox(height: 12),
            Card.outlined(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Semantics(
                      header: true,
                      child: Text('Words per chapter, in reading order', style: theme.textTheme.titleSmall),
                    ),
                    ColumnChart(
                      label: 'Words per chapter, in reading order',
                      words: (n) => '${grouped(n)} ${n == 1 ? 'word' : 'words'}',
                      labelEvery: (structure.lengths.length / 12).ceil().clamp(1, 1000),
                      bars: [
                        for (final c in structure.lengths)
                          BarDatum(
                            key: c.nodeId,
                            short: '${c.number}',
                            label: 'Chapter ${c.number}: ${c.title.trim().isEmpty ? 'Untitled chapter' : c.title}',
                            value: c.words,
                          ),
                      ],
                    ),
                    TableFold(
                      child: NumbersTable(
                        label: 'Words per chapter, as a table',
                        columns: const ['Chapter', 'Words'],
                        rows: [
                          for (final c in structure.lengths) ['${c.number}. ${c.title}', c.words],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          heading('Characters'),
          Text(
            '${_count(cast.total, 'character', 'characters')} · ${cast.appearing} '
            '${cast.appearing == 1 ? 'appears' : 'appear'} in the manuscript. A chapter counts when the character is '
            'linked in it, listed in its plan or named in its text.',
            style: small,
          ),
          const SizedBox(height: 8),
          for (final row in shown)
            _Row(
              title: row.name,
              line: row.line,
              onOpen: () => actions.openEntry(row.id, character: true),
              children: [
                Row(
                  children: [
                    SizedBox(width: 80, child: Gauge(value: row.chapters.length / most)),
                    const SizedBox(width: 8),
                    Flexible(child: Text(_count(row.chapters.length, 'chapter', 'chapters'))),
                  ],
                ),
                const SizedBox(height: 6),
                ChapterStrip(
                  total: structure.chapters,
                  chapters: row.chapters,
                  label: row.chapters.isNotEmpty
                      ? '${row.name} appears in chapters ${row.distribution}'
                      : '${row.name} appears in no chapter',
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    row.distribution.isEmpty ? 'No appearances recorded' : 'Chapters ${row.distribution}',
                    if (row.first != null) 'first Ch. ${row.first!.number}',
                    if (row.latest != null) 'latest Ch. ${row.latest!.number}',
                    _count(row.relationships, 'relationship', 'relationships'),
                    _count(row.milestones, 'snapshot', 'snapshots'),
                  ].join(' · '),
                  style: small,
                ),
              ],
            ),
          if (cast.rows.length > 12)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: OutlinedButton(
                onPressed: () => setState(() => _allCast = !_allCast),
                child: Text(_allCast ? 'Show the twelve who appear most' : 'Show all ${cast.rows.length}'),
              ),
            ),
          heading('Plot threads'),
          tiles([
            Tile(label: 'Plot threads', value: '${threads.total}'),
            Tile(label: 'Open mysteries', value: '${threads.openMysteries}'),
            Tile(label: 'Character arcs', value: '${threads.characterArcs}'),
          ]),
          const SizedBox(height: 12),
          section(context, 'Threads by status', [
            PartsBar(label: 'Threads by status', parts: threads.groups, colors: seriesColors(theme.brightness)),
          ]),
          const SizedBox(height: 8),
          for (final row in threads.rows)
            _Row(
              title: row.title,
              subtitle: '${row.category} · ${row.statusLabel}',
              line: row.line,
              onOpen: () => actions.router.go('/plan/threads/${row.id}'),
              children: [
                ChapterStrip(
                  total: structure.chapters,
                  chapters: row.chapters,
                  label: row.chapters.isNotEmpty
                      ? '${row.title} develops in chapters ${row.chapters.join(', ')}'
                      : '${row.title} has no placed developments',
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    _count(row.beats, 'development', 'developments'),
                    '${row.chapters.length} of ${structure.chapters} chapters (${(row.density * 100 + 0.5).floor()}%)',
                    'written chapters since the latest: ${row.quietFor ?? '—'}',
                  ].join(' · '),
                  style: small,
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// A character's or thread's row: its name opens it; the whole row is said in one sentence to a screen reader.
class _Row extends StatelessWidget {
  const _Row({required this.title, required this.line, required this.onOpen, required this.children, this.subtitle});
  final String title;
  final String? subtitle;
  final String line;
  final VoidCallback onOpen;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
              onPressed: onOpen,
              child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            if (subtitle != null) Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        Semantics(
          container: true,
          label: line,
          excludeSemantics: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
        const Divider(height: 16),
      ],
    ),
  );
}
