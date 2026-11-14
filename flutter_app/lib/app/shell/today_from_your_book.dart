import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../features/characters/widgets/vault.dart';
import '../../shared/data/background.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/best_lines.dart';
import '../../shared/domain/manuscript/book_quiz.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';

/// TODAY FROM YOUR BOOK, at the head of the keepsakes under More: a card made from the book that is new each day, so
/// the contents are never the same twice. The days take turns:
///
/// - **A line of the day**: one of the book's best lines (`best_lines.dart`), set on paper; **Read it there**, and
///   **All your best lines**.
/// - **A question of the day**: a question of the book quiz (`book_quiz.dart`), answered here; **Play the whole quiz**.
/// - **The book in numbers**: its words, chapters and people, and how long it takes to read; **See it told as a
///   story**.
///
/// A day with no line or question to give has the numbers. It only reads.

/// What a day's card is.
enum DayCard { line, question, numbers }

/// The day [now] is in, counted, so each has its own card and its own line.
int dayNumber(DateTime now) => DateTime.utc(now.year, now.month, now.day).difference(DateTime.utc(2024)).inDays;

/// The card of day [day].
DayCard dayCardOf(int day) => DayCard.values[day % DayCard.values.length];

/// The reading speed the time to read is told at, in words a minute.
const _readingSpeed = 250;

const _gold = Color(0xFFE8C46A);

class TodayFromYourBook extends ConsumerStatefulWidget {
  const TodayFromYourBook({
    super.key,
    required this.novelId,
    required this.day,
    this.onRead,
    required this.onLines,
    required this.onQuiz,
    required this.onStory,
  });

  final String novelId;

  /// Which day it is ([dayNumber]): it picks the card, and the line or question on it.
  final int day;

  /// Opens a chapter at a line.
  final void Function(String nodeId, String text, int block)? onRead;
  final VoidCallback onLines;
  final VoidCallback onQuiz;
  final VoidCallback onStory;

  @override
  ConsumerState<TodayFromYourBook> createState() => _TodayFromYourBookState();
}

class _TodayFromYourBookState extends ConsumerState<TodayFromYourBook> {
  late DayCard _card = dayCardOf(widget.day);
  BestLine? _line;
  QuizQuestion? _question;
  int? _picked;

  @override
  void initState() {
    super.initState();
    _read();
  }

  void _read() {
    if (_card == DayCard.numbers) return;
    final store = ref.read(novelStoreProvider);
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final stored = store.rawJsonIn(widget.novelId, 'chapterContents');
    final order = [for (final n in nodes) n.id];
    void none() {
      if (mounted) setState(() => _card = DayCard.numbers);
    }

    void failed(Object e, StackTrace s) {
      FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'contents'));
      none();
    }

    if (_card == DayCard.line) {
      ref.read(runAsideProvider)(bestLinesJob(stored, order)).then((lines) {
        if (!mounted) return;
        if (lines.isEmpty) return none();
        setState(() => _line = lines[widget.day % lines.length]);
      }, onError: failed);
      return;
    }
    final entries = [for (final r in store.rowsIn(widget.novelId, 'loreEntries')) Entry(r)];
    final profiles = <String, CharacterProfile>{
      for (final r in [
        ...store.rowsIn(widget.novelId, 'characterProfiles'),
      ]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
        str(r['entryId']): CharacterProfile(r),
    };
    final names = namesToFind(entries, profiles);
    ref
        .read(runAsideProvider)(
          bookQuizJob(
            stored,
            order,
            {for (final n in nodes) n.id: n.title},
            {
              for (final e in entries)
                if (e.category == 'character' && (names[e.id] ?? const []).isNotEmpty) e.id: names[e.id]!,
            },
            seed: widget.day,
          ),
        )
        .then((quiz) {
          if (!mounted) return;
          if (quiz.isEmpty) return none();
          setState(() => _question = quiz.first);
        }, onError: failed);
  }

  @override
  Widget build(BuildContext context) {
    final card = switch (_card) {
      DayCard.line => _line == null ? null : _LineCard(line: _line!, onRead: _readLine, onLines: widget.onLines),
      DayCard.question =>
        _question == null
            ? null
            : _QuestionCard(
                question: _question!,
                picked: _picked,
                onPick: (i) => setState(() => _picked = i),
                onQuiz: widget.onQuiz,
              ),
      DayCard.numbers => _NumbersCard(
        numbers: _numbersOf(ref.read(novelStoreProvider), widget.novelId),
        onStory: widget.onStory,
      ),
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Side by side, or one under the other when the words are large.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            children: [
              Text(
                'TODAY FROM YOUR BOOK',
                style: vaultHeading(
                  context,
                  size: 11,
                  color: Theme.of(context).colorScheme.primary,
                  weight: 700,
                ).copyWith(letterSpacing: 2.5),
              ),
              Text(
                'a new one each day',
                style: vaultText(context, size: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 8),
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            alignment: Alignment.topCenter,
            child: card ?? const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
          ),
        ],
      ),
    );
  }

  void _readLine() {
    final l = _line!;
    widget.onRead?.call(l.nodeId, l.text, l.block);
  }
}

/// The book in numbers: words, chapters with words, characters, and the minutes it takes to read.
typedef BookNumbers = ({int words, int chapters, int characters, int minutes});

BookNumbers _numbersOf(NovelStore store, String novelId) {
  final nodes = [for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)];
  final words = nodes.fold(0, (n, c) => n + c.wordCount);
  return (
    words: words,
    chapters: nodes.where((n) => isDocument(n.kind) && n.wordCount > 0).length,
    characters: store.rowsIn(novelId, 'loreEntries').where((r) => r['category'] == 'character').length,
    minutes: (words / _readingSpeed).ceil(),
  );
}

/// How long [minutes] of reading is, said as a reader would.
String readingTime(int minutes) {
  if (minutes < 60) return '$minutes ${minutes == 1 ? 'minute' : 'minutes'}';
  final hours = minutes / 60;
  final h = hours < 10 ? (hours * 2).round() / 2 : hours.round().toDouble();
  final said = h == h.roundToDouble() ? '${h.round()}' : h.toStringAsFixed(1);
  return '$said ${h == 1 ? 'hour' : 'hours'}';
}

class _Card extends StatelessWidget {
  const _Card({required this.colours, required this.child});

  final List<Color> colours;
  final Widget child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      gradient: LinearGradient(colors: colours, begin: Alignment.topLeft, end: Alignment.bottomRight),
      boxShadow: const [BoxShadow(color: Color(0x1F000000), blurRadius: 12, offset: Offset(0, 4))],
    ),
    child: Padding(padding: const EdgeInsets.fromLTRB(18, 16, 18, 10), child: child),
  );
}

/// A small heading on a card, in gold capitals.
Widget _kicker(BuildContext context, String text, {Color color = _gold}) =>
    Text(text, style: vaultHeading(context, size: 10, color: color, weight: 700).copyWith(letterSpacing: 2));

class _LineCard extends StatelessWidget {
  const _LineCard({required this.line, required this.onRead, required this.onLines});

  final BestLine line;
  final VoidCallback onRead;
  final VoidCallback onLines;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF2A2117);
    const mark = Color(0xFFB0812E);
    return _Card(
      colours: const [Color(0xFFFBF6EA), Color(0xFFF1E6CF)],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker(context, 'A LINE OF THE DAY', color: mark),
          const SizedBox(height: 10),
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(
                  text: '“',
                  style: TextStyle(color: mark, fontSize: 30, fontStyle: FontStyle.normal),
                ),
                TextSpan(text: line.text),
                const TextSpan(
                  text: '”',
                  style: TextStyle(color: mark, fontSize: 30, fontStyle: FontStyle.normal),
                ),
              ],
            ),
            style: vaultText(context, size: 20, color: ink).copyWith(fontStyle: FontStyle.italic, height: 1.35),
          ),
          const SizedBox(height: 8),
          Text('Chapter ${line.chapter}', style: vaultText(context, size: 13, color: ink.withValues(alpha: 0.65))),
          OverflowBar(
            alignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: ink, padding: EdgeInsets.zero),
                onPressed: onRead,
                icon: const Icon(Icons.menu_book_outlined, size: 18),
                label: const Text('Read it there'),
              ),
              TextButton(
                style: TextButton.styleFrom(foregroundColor: mark),
                onPressed: onLines,
                child: const Text('All your best lines'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({required this.question, required this.picked, required this.onPick, required this.onQuiz});

  final QuizQuestion question;
  final int? picked;
  final ValueChanged<int> onPick;
  final VoidCallback onQuiz;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFFF2EDE2);
    const right = Color(0xFF6FBF8E);
    const wrong = Color(0xFFE07A6F);
    final q = question;
    final answered = picked != null;
    return _Card(
      colours: const [Color(0xFF14233A), Color(0xFF2C4A6E)],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker(context, 'A QUESTION OF THE DAY · ${q.kind.kicker}'),
          const SizedBox(height: 8),
          if (q.line.isNotEmpty)
            Text(
              answered ? q.line.replaceFirst(quizGap, q.options[q.answer]) : q.line,
              style: vaultText(context, size: 18, color: ink).copyWith(fontStyle: FontStyle.italic, height: 1.35),
            )
          else
            Text('Which comes first in the book?', style: vaultText(context, size: 17, color: ink)),
          const SizedBox(height: 10),
          // The choices side by side as they fit (the two lines of which comes first, one under the other).
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (i, option) in q.options.indexed)
                Material(
                  key: ValueKey('today-choice-$i'),
                  color: !answered
                      ? Colors.transparent
                      : i == q.answer
                      ? right.withValues(alpha: 0.2)
                      : i == picked
                      ? wrong.withValues(alpha: 0.18)
                      : Colors.transparent,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: BorderSide(
                      color: !answered
                          ? ink.withValues(alpha: 0.3)
                          : i == q.answer
                          ? right
                          : i == picked
                          ? wrong
                          : ink.withValues(alpha: 0.12),
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: answered ? null : () => onPick(i),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      child: Text(
                        option,
                        maxLines: q.kind == QuizKind.whichFirst ? 3 : 1,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(
                          context,
                          size: q.kind == QuizKind.whichFirst ? 14 : 15,
                          color: ink.withValues(alpha: answered && i != q.answer && i != picked ? 0.45 : 1),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          if (answered)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: picked == q.answer ? 'Right. ' : 'Not quite. ',
                      style: TextStyle(color: picked == q.answer ? right : wrong, fontWeight: FontWeight.w700),
                    ),
                    TextSpan(text: q.where),
                  ],
                ),
                style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.85)),
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              style: TextButton.styleFrom(foregroundColor: _gold),
              onPressed: onQuiz,
              child: const Text('Play the whole quiz'),
            ),
          ),
        ],
      ),
    );
  }
}

class _NumbersCard extends StatelessWidget {
  const _NumbersCard({required this.numbers, required this.onStory});

  final BookNumbers numbers;
  final VoidCallback onStory;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFFF7F1E4);
    final n = numbers;
    return _Card(
      colours: const [Color(0xFF2B2350), Color(0xFF7A2E3A), Color(0xFF8A4B1C)],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kicker(context, 'YOUR BOOK IN NUMBERS'),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: formatNumber(n.words)),
                TextSpan(text: n.words == 1 ? ' word' : ' words', style: const TextStyle(fontSize: 18)),
              ],
            ),
            style: vaultHeading(context, size: 40, color: ink, weight: 700),
          ),
          const SizedBox(height: 4),
          Text(
            [
              plural(n.chapters, 'chapter'),
              if (n.characters > 0) plural(n.characters, 'character'),
              '${readingTime(n.minutes)} to read',
            ].join(' · '),
            style: vaultText(context, size: 15, color: ink.withValues(alpha: 0.9)),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              style: TextButton.styleFrom(foregroundColor: _gold),
              onPressed: onStory,
              child: const Text('See it told as a story'),
            ),
          ),
        ],
      ),
    );
  }
}
