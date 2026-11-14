import 'package:flutter/material.dart';

import '../../../app/theme/novel_art.dart';
import '../../../core/format.dart';
import '../../../core/widgets/text_prompt.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/characters/stakes.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// THE STAKES BOARD (`stakes.dart` reads it): the cast by what drives them, one card each: what they **want**, what
/// **stands in their way**, what is **at stake**, and where they **end**, each from whichever field of their profile
/// answers it. What no field answers yet is the question, asked of them ("What does Wren want?"): a press, a line,
/// and it is in their profile. Above, **where they collide**: two whose wants name each other, or want the same thing,
/// which is where a story's trouble comes from. And how many of them the author knows the wants of.
class CastStakes extends StatelessWidget {
  const CastStakes({super.key, required this.found, required this.cast});

  final List<Listed> found;
  final CastData cast;

  static Map<String, String> _fields(Entry e) => {for (final f in e.fields) f.key.trim().toLowerCase(): f.value};

  static List<String> _names(Entry e) {
    final name = e.name.trim();
    final first = name.split(RegExp(r'\s+')).first;
    return [name, if (first.length >= 3 && first != name) first];
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final holders = <StakeHolder>[
      for (final l in found)
        (id: l.entry.id, name: l.entry.name.trim(), names: _names(l.entry), stakes: stakesOf(_fields(l.entry))),
    ];
    final byId = {for (final l in found) l.entry.id: l};
    final known = holders.where((h) => h.stakes.containsKey(Stake.wants)).length;
    final clashes = collisions(holders);
    final actions = CharacterActions(context, cast.novelId);

    Future<void> ask(Listed l, Stake stake, String current) async {
      final name = l.entry.name.trim().isEmpty ? 'they' : l.entry.name.trim();
      final text = await showTextPrompt(
        context,
        title: stake.ask(name),
        label: stake.label,
        initial: current,
        hint: switch (stake) {
          Stake.wants => 'To finish the chart her master left blank',
          Stake.needs => 'To trust someone else with the road',
          Stake.inTheWay => 'The Provost, who keeps the true tables',
          Stake.atStake => 'Her place, and her master’s name',
          Stake.ends => 'She walks the road, and comes back',
        },
        confirmLabel: 'Keep',
      );
      if (text == null || text.trim() == current.trim()) return;
      actions.now((c) => recordStake(c, l.entry.id, stake, text.trim()));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // How many of them the author knows the wants of.
        Semantics(
          liveRegion: true,
          child: Text(
            known == holders.length
                ? (holders.length == 1 ? 'You know what they want.' : 'You know what every one of them wants.')
                : known == 0
                ? 'No one’s wants are written yet. A story runs on wants: press a question to answer it.'
                : 'You know what ${formatNumber(known)} of ${plural(holders.length, 'character')} want. '
                      'A story runs on wants: press a question to answer it.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
        ),
        const SizedBox(height: 6),
        ExcludeSemantics(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: holders.isEmpty ? 0 : known / holders.length,
              minHeight: 4,
              color: scheme.primary,
              backgroundColor: scheme.outlineVariant.withValues(alpha: 0.5),
            ),
          ),
        ),
        if (clashes.isNotEmpty) ...[
          const SizedBox(height: 18),
          Semantics(
            header: true,
            child: Text(
              'WHERE THEY COLLIDE',
              style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
            ),
          ),
          const SizedBox(height: 8),
          for (final c in clashes)
            if ((byId[c.a], byId[c.b]) case (final a?, final b?))
              _Collision(
                a: a,
                b: b,
                why: c.why,
                wants: (stakesOf(_fields(a.entry)), stakesOf(_fields(b.entry))),
                onOpen: actions.openCharacter,
              ),
        ],
        const SizedBox(height: 18),
        LayoutBuilder(
          builder: (context, box) {
            final columns = (box.maxWidth / 340).floor().clamp(1, 4);
            final width = (box.maxWidth - (columns - 1) * 12) / columns;
            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final l in found)
                  SizedBox(
                    width: width,
                    child: _StakeCard(
                      listed: l,
                      stakes: stakesOf(_fields(l.entry)),
                      onAsk: (stake, current) => ask(l, stake, current),
                      onOpen: () => actions.openCharacter(l.entry.id),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// A character's small cameo, as their card and the cast photograph draw them.
class _Face extends StatelessWidget {
  const _Face({required this.listed, this.size = 44});
  final Listed listed;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tone = NovelArt.of(context).bound(castTone(listed.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.22),
        child: SizedBox(
          width: size,
          height: size * 1.2,
          child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
        ),
      ),
    );
  }
}

/// One character's card: who they are, and their stakes, each answered or asked.
class _StakeCard extends StatelessWidget {
  const _StakeCard({required this.listed, required this.stakes, required this.onAsk, required this.onOpen});

  final Listed listed;
  final Map<Stake, String> stakes;
  final void Function(Stake stake, String current) onAsk;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final e = listed.entry;
    final name = e.name.trim().isEmpty ? 'Unnamed' : e.name.trim();
    final answered = boardStakes.where(stakes.containsKey).length;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              button: true,
              label: 'Open $name',
              excludeSemantics: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: onOpen,
                child: Row(
                  children: [
                    _Face(listed: listed),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: vaultHeading(context, size: 16, weight: 700)),
                          if (listed.profile.roles.isNotEmpty)
                            Text(
                              listed.profile.roles.join(' · '),
                              style: vaultText(
                                context,
                                size: 14,
                                style: FontStyle.italic,
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                        ],
                      ),
                    ),
                    // How much of what drives them is known: four marks, lit as each is answered.
                    ExcludeSemantics(
                      child: Row(
                        children: [
                          for (var i = 0; i < boardStakes.length; i++)
                            Container(
                              width: 7,
                              height: 7,
                              margin: const EdgeInsets.only(left: 3),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: i < answered ? scheme.primary : scheme.outlineVariant,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            for (final s in [
              ...boardStakes.take(1),
              if (stakes.containsKey(Stake.needs)) Stake.needs,
              ...boardStakes.skip(1),
            ])
              _StakeLine(stake: s, text: stakes[s], name: name, onAsk: () => onAsk(s, stakes[s] ?? '')),
          ],
        ),
      ),
    );
  }
}

/// One stake: its name and the answer, or the question asked; a press answers or changes it.
class _StakeLine extends StatelessWidget {
  const _StakeLine({required this.stake, required this.text, required this.name, required this.onAsk});

  final Stake stake;
  final String? text;
  final String name;
  final VoidCallback onAsk;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = text;
    return Semantics(
      button: true,
      label: t == null ? stake.ask(name) : '${stake.label}: $t. Press to change it.',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onAsk,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 78,
                child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    stake.label.toUpperCase(),
                    style: vaultHeading(
                      context,
                      size: 10,
                      color: t == null ? scheme.onSurfaceVariant : scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 1.2),
                  ),
                ),
              ),
              Expanded(
                child: t == null
                    ? Row(
                        children: [
                          Icon(Icons.add_circle_outline, size: 16, color: scheme.primary),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              stake.ask(name),
                              style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.primary),
                            ),
                          ),
                        ],
                      )
                    : Text(
                        t,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 15.5, color: scheme.onSurface),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Two whose wants collide: their faces either side of a spark, why, and what each wants.
class _Collision extends StatelessWidget {
  const _Collision({required this.a, required this.b, required this.why, required this.wants, required this.onOpen});

  final Listed a;
  final Listed b;
  final String why;
  final (Map<Stake, String>, Map<Stake, String>) wants;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget side(Listed l, Map<Stake, String> s) => Expanded(
      child: Semantics(
        button: true,
        label: 'Open ${l.entry.name}',
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => onOpen(l.entry.id),
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.entry.name.trim(), style: vaultHeading(context, size: 13, weight: 700)),
                Text(
                  s[Stake.wants] ?? '',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.error.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _Face(listed: a, size: 36),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Icon(Icons.bolt, color: scheme.error, size: 22),
              ),
              _Face(listed: b, size: 36),
              const SizedBox(width: 12),
              Flexible(
                child: Text(why, style: vaultHeading(context, size: 13, color: scheme.error, weight: 700)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [side(a, wants.$1), side(b, wants.$2)]),
        ],
      ),
    );
  }
}
