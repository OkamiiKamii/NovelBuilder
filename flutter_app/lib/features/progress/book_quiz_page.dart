import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/book_quiz.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';

/// THE BOOK QUIZ on screen (`book_quiz.dart` asks it): how well do you know your own book? A question at a time, the
/// line set large and the choices beneath; a press answers, says whether it was right and where the line is, and
/// **Read it there** opens the chapter at it. At the end, the score as a card: **Share your score** makes a square
/// picture of it, **Play again** asks other lines. Played by the author, or handed to a reader. It only reads.

/// The score card's size, drawn three times over for the picture.
const quizCardSize = Size(360, 360);

/// The key of the [i]th choice of a question.
ValueKey<String> quizChoiceKey(int i) => ValueKey('quiz-choice-$i');

const _night = Color(0xFF0F1622);
const _ink = Color(0xFFF2EDE2);
const _gold = Color(0xFFE8C46A);
const _right = Color(0xFF6FBF8E);
const _wrong = Color(0xFFE07A6F);

/// Opens the quiz on [novelId], full screen. [onRead] opens a chapter at a line (it closes this first).
Future<void> showBookQuiz(
  BuildContext context, {
  required String novelId,
  void Function(String nodeId, String text, int block)? onRead,
}) => Navigator.of(context, rootNavigator: true).push(
  PageRouteBuilder<void>(
    pageBuilder: (_, _, _) =>
        BookQuizScreen(novelId: novelId, seed: DateTime.now().microsecondsSinceEpoch, onRead: onRead),
    transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
  ),
);

class BookQuizScreen extends ConsumerStatefulWidget {
  const BookQuizScreen({super.key, required this.novelId, required this.seed, this.onRead});

  final String novelId;

  /// What picks the first game's questions; each game after takes the next.
  final int seed;
  final void Function(String nodeId, String text, int block)? onRead;

  @override
  ConsumerState<BookQuizScreen> createState() => _BookQuizScreenState();
}

class _BookQuizScreenState extends ConsumerState<BookQuizScreen> {
  List<QuizQuestion>? _quiz;
  late int _seed = widget.seed;
  int _at = 0;
  int? _picked;
  int _score = 0;
  final _card = GlobalKey();
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _ask();
  }

  void _ask() {
    final store = ref.read(novelStoreProvider);
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final entries = [for (final r in store.rowsIn(widget.novelId, 'loreEntries')) Entry(r)];
    final profiles = <String, CharacterProfile>{
      for (final r in [
        ...store.rowsIn(widget.novelId, 'characterProfiles'),
      ]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
        str(r['entryId']): CharacterProfile(r),
    };
    final names = namesToFind(entries, profiles);
    final people = {
      for (final e in entries)
        if (e.category == 'character' && (names[e.id] ?? const []).isNotEmpty) e.id: names[e.id]!,
    };
    final seed = _seed;
    ref
        .read(runAsideProvider)(
          bookQuizJob(
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            [for (final n in nodes) n.id],
            {for (final n in nodes) n.id: n.title},
            people,
            seed: seed,
          ),
        )
        .then(
          (quiz) {
            if (mounted && seed == _seed) setState(() => _quiz = quiz);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progress')),
        );
  }

  void _pick(int i) {
    final q = _quiz![_at];
    setState(() {
      _picked = i;
      if (i == q.answer) _score++;
    });
  }

  void _next() => setState(() {
    _at++;
    _picked = null;
  });

  void _again() => setState(() {
    _seed++;
    _quiz = null;
    _at = 0;
    _picked = null;
    _score = 0;
    _message = null;
    _ask();
  });

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final boundary = _card.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('book-quiz-score.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final novel = ref.watch(novelStoreProvider).novel(widget.novelId);
    final title = (novel?.title.trim().isEmpty ?? true) ? 'your book' : novel!.title.trim();
    final quiz = _quiz;
    return Scaffold(
      backgroundColor: _night,
      body: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                const SizedBox(width: 16),
                Expanded(
                  child: Text('The book quiz', style: vaultHeading(context, size: 18, color: _ink, weight: 700)),
                ),
                IconButton(
                  tooltip: 'Close',
                  color: _ink,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Expanded(
              child: quiz == null
                  ? const Center(child: CircularProgressIndicator())
                  : quiz.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'Not enough to ask about yet. As your chapters grow, the quiz makes its questions from '
                          'them: who said it, which chapter, the missing word.',
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 17, color: _ink.withValues(alpha: 0.8)),
                        ),
                      ),
                    )
                  : _at >= quiz.length
                  ? _End(
                      cardKey: _card,
                      title: title,
                      author: novel?.author.trim() ?? '',
                      score: _score,
                      of: quiz.length,
                      working: _working,
                      message: _message,
                      onShare: _share,
                      onAgain: _again,
                    )
                  : _Question(
                      title: title,
                      question: quiz[_at],
                      number: _at + 1,
                      of: quiz.length,
                      score: _score,
                      picked: _picked,
                      last: _at == quiz.length - 1,
                      onPick: _pick,
                      onNext: _next,
                      onRead: widget.onRead == null
                          ? null
                          : () {
                              final q = quiz[_at];
                              final text = q.kind == QuizKind.whichFirst ? q.options[q.answer] : q.line;
                              Navigator.of(context).pop();
                              widget.onRead!(
                                q.nodeId,
                                q.kind == QuizKind.missingWord
                                    ? text.split(quizGap).reduce((a, b) => a.length >= b.length ? a : b).trim()
                                    : text.replaceAll(RegExp(r'^[“"]|[”"]$'), ''),
                                q.block,
                              );
                            },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Question extends StatelessWidget {
  const _Question({
    required this.title,
    required this.question,
    required this.number,
    required this.of,
    required this.score,
    required this.picked,
    required this.last,
    required this.onPick,
    required this.onNext,
    required this.onRead,
  });

  final String title;
  final QuizQuestion question;
  final int number;
  final int of;
  final int score;
  final int? picked;
  final bool last;
  final ValueChanged<int> onPick;
  final VoidCallback onNext;
  final VoidCallback? onRead;

  String get _ask => switch (question.kind) {
    QuizKind.whoSaid => 'Who says it?',
    QuizKind.whichChapter => 'Which chapter is it in?',
    QuizKind.missingWord => 'Which word is missing?',
    QuizKind.whichFirst => 'Which comes first in the book?',
  };

  @override
  Widget build(BuildContext context) {
    final q = question;
    final answered = picked != null;
    final gotIt = picked == q.answer;
    return _Scroll(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Text(
          'How well do you know $title? Play it yourself, or hand the phone to a reader.',
          style: vaultText(context, size: 14, color: _ink.withValues(alpha: 0.7)),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Text(
              '$number of $of',
              style: vaultHeading(context, size: 12, color: _gold, weight: 700).copyWith(letterSpacing: 1.5),
            ),
            const Spacer(),
            Text('$score right', style: vaultText(context, size: 13, color: _ink.withValues(alpha: 0.7))),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: LinearProgressIndicator(
            value: (number - (answered ? 0 : 1)) / of,
            minHeight: 3,
            color: _gold,
            backgroundColor: _ink.withValues(alpha: 0.12),
          ),
        ),
        const SizedBox(height: 22),
        Text(
          q.kind.kicker,
          style: vaultHeading(context, size: 11, color: _gold, weight: 700).copyWith(letterSpacing: 2.5),
        ),
        const SizedBox(height: 10),
        if (q.line.isNotEmpty) ...[
          Text.rich(
            TextSpan(
              children: [
                for (final (i, part) in q.line.split(quizGap).indexed) ...[
                  // The missing word's place: a gold rule, and once answered, the word itself in gold.
                  if (i > 0)
                    answered
                        ? TextSpan(
                            text: q.options[q.answer],
                            style: const TextStyle(color: _gold),
                          )
                        : WidgetSpan(
                            alignment: PlaceholderAlignment.baseline,
                            baseline: TextBaseline.alphabetic,
                            child: Container(
                              width: 64,
                              height: 2,
                              margin: const EdgeInsets.symmetric(horizontal: 4),
                              color: _gold,
                            ),
                          ),
                  TextSpan(text: part),
                ],
              ],
            ),
            style: vaultText(context, size: 22, color: _ink).copyWith(fontStyle: FontStyle.italic, height: 1.35),
          ),
          const SizedBox(height: 14),
        ],
        Text(_ask, style: vaultText(context, size: 15, color: _ink.withValues(alpha: 0.75))),
        const SizedBox(height: 12),
        for (final (i, option) in q.options.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _Choice(
              key: quizChoiceKey(i),
              text: option,
              long: q.kind == QuizKind.whichFirst,
              state: !answered
                  ? _ChoiceState.open
                  : i == q.answer
                  ? _ChoiceState.right
                  : i == picked
                  ? _ChoiceState.wrong
                  : _ChoiceState.passed,
              onTap: answered ? null : () => onPick(i),
            ),
          ),
        if (answered) ...[
          const SizedBox(height: 6),
          Text(
            gotIt ? 'Right.' : 'Not quite.',
            style: vaultHeading(context, size: 16, color: gotIt ? _right : _wrong, weight: 700),
          ),
          const SizedBox(height: 4),
          Text(q.where, style: vaultText(context, size: 15, color: _ink.withValues(alpha: 0.8))),
          const SizedBox(height: 14),
          OverflowBar(
            alignment: MainAxisAlignment.spaceBetween,
            overflowAlignment: OverflowBarAlignment.end,
            overflowSpacing: 8,
            children: [
              if (onRead != null)
                TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: _ink),
                  onPressed: onRead,
                  icon: const Icon(Icons.menu_book_outlined, size: 18),
                  label: const Text('Read it there'),
                ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _night),
                onPressed: onNext,
                child: Text(last ? 'See your score' : 'Next'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

enum _ChoiceState { open, right, wrong, passed }

class _Choice extends StatelessWidget {
  const _Choice({super.key, required this.text, required this.long, required this.state, required this.onTap});

  final String text;
  final bool long;
  final _ChoiceState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (edge, fill, icon) = switch (state) {
      _ChoiceState.open => (_ink.withValues(alpha: 0.28), Colors.transparent, null),
      _ChoiceState.right => (_right, _right.withValues(alpha: 0.16), Icons.check_circle),
      _ChoiceState.wrong => (_wrong, _wrong.withValues(alpha: 0.14), Icons.cancel),
      _ChoiceState.passed => (_ink.withValues(alpha: 0.12), Colors.transparent, null),
    };
    return Material(
      color: fill,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: edge),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  text,
                  style: vaultText(
                    context,
                    size: long ? 15 : 17,
                    color: _ink.withValues(alpha: state == _ChoiceState.passed ? 0.45 : 1),
                  ).copyWith(fontStyle: long ? FontStyle.italic : null),
                ),
              ),
              if (icon != null) ...[const SizedBox(width: 10), Icon(icon, color: edge, size: 22)],
            ],
          ),
        ),
      ),
    );
  }
}

class _End extends StatelessWidget {
  const _End({
    required this.cardKey,
    required this.title,
    required this.author,
    required this.score,
    required this.of,
    required this.working,
    required this.message,
    required this.onShare,
    required this.onAgain,
  });

  final GlobalKey cardKey;
  final String title;
  final String author;
  final int score;
  final int of;
  final bool working;
  final String? message;
  final VoidCallback onShare;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) => _Scroll(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
    children: [
      Center(
        child: FittedBox(
          child: RepaintBoundary(
            key: cardKey,
            child: QuizScoreCard(title: title, author: author, score: score, of: of),
          ),
        ),
      ),
      const SizedBox(height: 20),
      FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: _gold,
          foregroundColor: _night,
          minimumSize: const Size.fromHeight(48),
        ),
        onPressed: working ? null : onShare,
        icon: working
            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.ios_share),
        label: const Text('Share your score'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        style: OutlinedButton.styleFrom(
          foregroundColor: _ink,
          side: BorderSide(color: _ink.withValues(alpha: 0.4)),
          minimumSize: const Size.fromHeight(48),
        ),
        onPressed: onAgain,
        icon: const Icon(Icons.refresh),
        label: const Text('Play again'),
      ),
      if (message != null)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(
            message!,
            textAlign: TextAlign.center,
            style: vaultText(context, size: 13, color: _ink.withValues(alpha: 0.8)),
          ),
        ),
    ],
  );
}

/// The score as a card to share: how many of how many, of which book, and what that says.
class QuizScoreCard extends StatelessWidget {
  const QuizScoreCard({super.key, required this.title, required this.author, required this.score, required this.of});

  final String title;
  final String author;
  final int score;
  final int of;

  @override
  Widget build(BuildContext context) => Container(
    width: quizCardSize.width,
    height: quizCardSize.height,
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        colors: [Color(0xFF14233A), _night],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
    ),
    padding: const EdgeInsets.fromLTRB(28, 26, 28, 20),
    child: Column(
      children: [
        Text(
          'THE BOOK QUIZ',
          style: vaultHeading(context, size: 11, color: _gold, weight: 700).copyWith(letterSpacing: 3),
        ),
        const Spacer(),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(text: '$score'),
              TextSpan(
                text: ' / $of',
                style: TextStyle(fontSize: 34, color: _ink.withValues(alpha: 0.55)),
              ),
            ],
          ),
          style: vaultHeading(context, size: 84, color: _ink, weight: 700).copyWith(height: 1),
        ),
        const SizedBox(height: 10),
        Text(
          'of $title',
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: vaultText(context, size: 18, color: _ink).copyWith(fontStyle: FontStyle.italic),
        ),
        const SizedBox(height: 14),
        Container(width: 40, height: 1, color: _gold.withValues(alpha: 0.7)),
        const SizedBox(height: 14),
        Text(
          quizVerdict(score, of),
          textAlign: TextAlign.center,
          style: vaultText(context, size: 15, color: _ink.withValues(alpha: 0.85)),
        ),
        const Spacer(),
        Text(
          [
            if (author.isNotEmpty && author.toLowerCase() != 'novel builder') author.toUpperCase(),
            'MADE WITH NOVEL BUILDER',
          ].join(' · '),
          textAlign: TextAlign.center,
          style: vaultHeading(context, size: 8, color: _ink.withValues(alpha: 0.55)).copyWith(letterSpacing: 1.5),
        ),
      ],
    ),
  );
}

/// A page that scrolls, every part of it built (so the buttons at its foot are there to be reached).
class _Scroll extends StatelessWidget {
  const _Scroll({required this.padding, required this.children});

  final EdgeInsets padding;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: padding,
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
  );
}
