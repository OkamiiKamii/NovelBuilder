import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format.dart';
import '../../shared/domain/analytics/progress.dart' show addDays, dayOf, mediumDay;
import '../characters/widgets/vault.dart';
import '../progress/widgets/length_shelf.dart' show wordsPerManuscriptPage;
import 'data/manuscript_service.dart';

/// The daily goals offered with one press, from a paragraph or two a day to four pages.
const dailyChoices = [100, 250, 500, 1000];

/// "About a page", "About 4 pages", "Less than half a page", from words at 250 a page.
String pagesOf(int words) {
  final pages = words / wordsPerManuscriptPage;
  if (pages < 0.75) return 'A paragraph or two';
  final whole = pages.round();
  return whole == 1 ? 'About a page' : 'About $whole pages';
}

/// When the draft reaches [target] at [perDay] words a day from [words] today ([today] a day key, "2026-11-07"):
/// "The draft by Mar 3, 2027", or null when there is no target or it is reached.
String? finishAt(int perDay, {required int words, required int? target, required String today}) {
  if (target == null || target <= words || perDay <= 0) return null;
  final days = ((target - words) / perDay).ceil();
  return 'The draft by ${mediumDay(addDays(today, days))}';
}

/// HOW MUCH A DAY: setting a writing goal from the page is a choice of four cards, not two empty boxes and a keyboard:
/// each a number of words a day in the vault's capitals, what it is in manuscript pages, and (when the novel has a
/// target) the day the draft would be done at that pace. One press chooses; the chosen card is framed in the accent.
/// "No daily goal" and the author's own numbers (a day, a week) stay beneath. Goals are the author's; none is assumed.
class GoalPledge extends StatefulWidget {
  const GoalPledge({
    super.key,
    required this.service,
    required this.novelId,
    required this.words,
    required this.target,
    this.today,
  });

  final ManuscriptService service;
  final String novelId;

  /// The manuscript's words now, and its target, for the day each pace would finish the draft.
  final int words;
  final int? target;

  /// Today's day key; a test sets its own.
  final String? today;

  @override
  State<GoalPledge> createState() => _GoalPledgeState();
}

class _GoalPledgeState extends State<GoalPledge> {
  late final _goals = widget.service.wordGoals(widget.novelId);
  late int? _daily = _goals.daily;
  late final _own = TextEditingController(
    text: _goals.daily != null && !dailyChoices.contains(_goals.daily) ? '${_goals.daily}' : '',
  );
  late final _weekly = TextEditingController(text: _goals.weekly?.toString() ?? '');
  late bool _ownOpen = _own.text.isNotEmpty || _weekly.text.isNotEmpty;

  @override
  void dispose() {
    _own.dispose();
    _weekly.dispose();
    super.dispose();
  }

  void _save() {
    final own = int.tryParse(_own.text);
    widget.service.setWordGoal(widget.novelId, 'daily', own ?? _daily);
    widget.service.setWordGoal(widget.novelId, 'weekly', int.tryParse(_weekly.text));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final today = widget.today ?? dayOf(DateTime.now());
    final ownSet = _own.text.trim().isNotEmpty;

    Widget card(int words) {
      final chosen = !ownSet && _daily == words;
      final finish = finishAt(words, words: widget.words, target: widget.target, today: today);
      return Semantics(
        inMutuallyExclusiveGroup: true,
        checked: chosen,
        label: '${formatNumber(words)} words a day. ${pagesOf(words)}.${finish == null ? '' : ' $finish.'}',
        onTap: () => setState(() => _daily = words),
        excludeSemantics: true,
        child: InkWell(
          onTap: () => setState(() {
            _daily = words;
            _own.clear();
          }),
          borderRadius: BorderRadius.circular(8),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: chosen ? scheme.primary.withValues(alpha: 0.1) : null,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: chosen ? scheme.primary : scheme.outlineVariant, width: chosen ? 2 : 1),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      formatNumber(words),
                      style: vaultHeading(
                        context,
                        size: 24,
                        weight: 700,
                        color: chosen ? scheme.primary : scheme.onSurface,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text('words a day', style: vaultText(context, size: 15, color: scheme.onSurfaceVariant)),
                    ),
                  ],
                ),
                Text(pagesOf(words), style: vaultText(context, size: 15.5, style: FontStyle.italic)),
                if (finish != null)
                  Text(finish, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      );
    }

    return AlertDialog(
      title: Text('How much a day?', style: vaultHeading(context, size: 20, weight: 700)),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Goals are yours to set; none is assumed. Words count net of cuts.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, box) {
                  final two = box.maxWidth >= 300;
                  final width = two ? (box.maxWidth - 10) / 2 : box.maxWidth;
                  return Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [for (final w in dailyChoices) SizedBox(width: width, child: card(w))],
                  );
                },
              ),
              const SizedBox(height: 6),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Wrap(
                  spacing: 4,
                  children: [
                    TextButton(
                      onPressed: () => setState(() {
                        _daily = null;
                        _own.clear();
                      }),
                      child: Text(_daily == null && !ownSet ? 'No daily goal ✓' : 'No daily goal'),
                    ),
                    TextButton.icon(
                      onPressed: () => setState(() => _ownOpen = !_ownOpen),
                      icon: Icon(_ownOpen ? Icons.expand_less : Icons.edit_outlined, size: 18),
                      label: const Text('Your own numbers'),
                    ),
                  ],
                ),
              ),
              if (_ownOpen) ...[
                const SizedBox(height: 4),
                TextField(
                  controller: _own,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Each day', hintText: 'Another number of words'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _weekly,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(labelText: 'Each week', hintText: 'No goal'),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Save goals')),
      ],
    );
  }
}
