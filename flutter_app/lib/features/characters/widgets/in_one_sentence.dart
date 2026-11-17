import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/widgets/toast.dart';
import '../../../shared/domain/characters/logline.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/characters/stakes.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'vault.dart';

/// IN ONE SENTENCE (`logline.dart`): the character pitched in a sentence, at the top of their page, made from their
/// profile. What the profile does not say yet is a blank in the sentence; a press on a blank (or on any part, to change
/// it) asks for it, and the answer is kept in their profile, in the field it belongs to (Occupation; what they want,
/// what is in the way, what they could lose, as the stakes board keeps them), so the sentence, the stakes and the
/// sparks to write them in all have it. Whole, it can be copied.
class InOneSentence extends StatelessWidget {
  const InOneSentence({super.key, required this.cast, required this.entryId, required this.actions});

  final CastData cast;
  final String entryId;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final listed = cast.list.where((l) => l.entry.id == entryId).firstOrNull;
    if (listed == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final entry = listed.entry;
    final fields = {for (final f in entry.fields) f.key.trim().toLowerCase(): f.value};
    final occupation = [
      for (final n in whoFields) fields[n]?.trim() ?? '',
    ].firstWhere((v) => v.isNotEmpty, orElse: () => '');
    final pieces = loglineOf(
      name: entry.name,
      age: fields['age'] ?? '',
      gender: fields['gender'] ?? fields['sex'] ?? '',
      who: occupation.isNotEmpty ? occupation : listed.profile.epithet,
      stakes: stakesOf(fields),
    );
    final whole = loglineText(pieces);
    final gaps = pieces.where((p) => p.gap).length;
    final base = vaultText(context, size: 21, color: scheme.onSurface).copyWith(height: 1.55);

    Future<void> ask(LoglinePart part, String now) async {
      final question = switch (part) {
        LoglinePart.who => 'Who is ${entry.name}, in a few words?',
        LoglinePart.wants => Stake.wants.ask(entry.name),
        LoglinePart.inTheWay => Stake.inTheWay.ask(entry.name),
        LoglinePart.atStake => Stake.atStake.ask(entry.name),
      };
      final hint = switch (part) {
        LoglinePart.who => 'A locksmith’s apprentice, the queen’s spy…',
        LoglinePart.wants => 'To open the last door',
        LoglinePart.inTheWay => 'The Architect, his own fear…',
        LoglinePart.atStake => 'His sister, the city, his name…',
      };
      final answer = await showDialog<String>(
        context: context,
        builder: (context) => _Ask(question: question, hint: hint, value: now),
      );
      if (answer == null) return;
      actions.now(
        (c) => part == LoglinePart.who
            ? recordIn(
                c,
                entryId,
                'Occupation',
                whoFields,
                answer,
                sections: const ['identity', 'position'],
                newSection: 'Core Identity',
              )
            : recordStake(c, entryId, switch (part) {
                LoglinePart.wants => Stake.wants,
                LoglinePart.inTheWay => Stake.inTheWay,
                _ => Stake.atStake,
              }, answer),
      );
    }

    String stored(LoglinePart part) => switch (part) {
      LoglinePart.who => occupation,
      LoglinePart.wants => stakesOf(fields)[Stake.wants] ?? '',
      LoglinePart.inTheWay => stakesOf(fields)[Stake.inTheWay] ?? '',
      LoglinePart.atStake => stakesOf(fields)[Stake.atStake] ?? '',
    };

    return VaultFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'IN ONE SENTENCE',
                  style: vaultHeading(
                    context,
                    size: 12,
                    color: scheme.primary,
                    weight: 700,
                  ).copyWith(letterSpacing: 1.6),
                ),
              ),
              if (whole != null)
                IconButton(
                  tooltip: 'Copy the sentence',
                  icon: const Icon(Icons.copy_outlined, size: 20),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: whole));
                    showToast(context, 'The sentence is copied.');
                  },
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text.rich(
            key: const ValueKey('one-sentence'),
            TextSpan(
              children: [
                for (final p in pieces)
                  if (p.part case final part?)
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: Semantics(
                        link: true,
                        label: p.gap ? 'Fill in: ${p.text}' : 'Change: ${p.text}',
                        excludeSemantics: true,
                        child: GestureDetector(
                          key: ValueKey('sentence-${part.name}'),
                          behavior: HitTestBehavior.opaque,
                          onTap: () => ask(part, stored(part)),
                          child: p.gap
                              ? Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6),
                                  decoration: BoxDecoration(
                                    color: scheme.primary.withValues(alpha: 0.1),
                                    border: Border(bottom: BorderSide(color: scheme.primary, width: 1.5)),
                                  ),
                                  child: Text(
                                    p.text,
                                    style: base.copyWith(color: scheme.primary, fontStyle: FontStyle.italic),
                                  ),
                                )
                              : Text(
                                  p.text,
                                  style: base.copyWith(
                                    fontWeight: FontWeight.w600,
                                    decoration: TextDecoration.underline,
                                    decorationStyle: TextDecorationStyle.dotted,
                                    decorationColor: scheme.primary.withValues(alpha: 0.6),
                                  ),
                                ),
                        ),
                      ),
                    )
                  else
                    TextSpan(text: p.text),
              ],
            ),
            style: base,
          ),
          const SizedBox(height: 8),
          Text(
            whole != null
                ? '${entry.name} in one sentence: the pitch, the stakes board and the sparks to write them in all '
                      'read from it. Press any part to change it.'
                : '${gaps == 1 ? 'One blank' : '$gaps blanks'} to fill. Press one: what you write is kept in '
                      '${entry.name}’s profile.',
            style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// The question for one part of the sentence, answered in a line.
class _Ask extends StatefulWidget {
  const _Ask({required this.question, required this.hint, required this.value});

  final String question;
  final String hint;
  final String value;

  @override
  State<_Ask> createState() => _AskState();
}

class _AskState extends State<_Ask> {
  late final _text = TextEditingController(text: widget.value);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _done() {
    if (_text.text.trim().isEmpty) return;
    Navigator.of(context).pop(_text.text.trim());
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.question),
    content: TextField(
      controller: _text,
      autofocus: true,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(hintText: widget.hint),
      onSubmitted: (_) => _done(),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      ListenableBuilder(
        listenable: _text,
        builder: (context, _) =>
            FilledButton(onPressed: _text.text.trim().isEmpty ? null : _done, child: const Text('Keep it')),
      ),
    ],
  );
}
