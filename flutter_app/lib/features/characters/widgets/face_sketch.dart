import 'package:flutter/material.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/characters/likeness.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// DRAW THEIR FACE: a character with no picture is a cameo drawn from their profile (`cameo.dart`), and here the author
/// draws it: the colour of their hair and how it is worn, their eyes, their skin, and what marks them (a beard,
/// glasses, a scar, an eyepatch, freckles, a hood, a crown), each a press, the cameo changing as they go. **Keep this
/// face** writes it into their profile as words, in their Appearance fields ("Long, curly black", "Green", "Olive";
/// the marks added to Distinguishing Features), so the face and the profile are one; the cameo then shows it
/// everywhere they are drawn. Nothing already written is taken away, and nothing changes until Keep.
Future<void> showDrawTheirFace(
  BuildContext context, {
  required Entry entry,
  required CharacterProfile profile,
  required CharacterActions actions,
}) {
  // A slip still showing would lie over the sheet's foot, where Keep is.
  ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => FaceSketch(entry: entry, profile: profile, actions: actions),
  );
}

/// The swatches, by family, as they are named in the sheet.
const _hairs = [
  ('black', 'Black'),
  ('brown', 'Brown'),
  ('red', 'Red'),
  ('amber', 'Golden'),
  ('blond', 'Blond'),
  ('grey', 'Grey'),
  ('silver', 'Silver'),
  ('white', 'White'),
  ('blue', 'Blue'),
  ('green', 'Green'),
  ('violet', 'Violet'),
];
const _eyes = [
  ('brown', 'Brown'),
  ('hazel', 'Hazel'),
  ('amber', 'Amber'),
  ('green', 'Green'),
  ('blue', 'Blue'),
  ('grey', 'Grey'),
  ('violet', 'Violet'),
  ('black', 'Black'),
  ('red', 'Red'),
];
const _cuts = [
  (HairCut.bald, 'Bald'),
  (HairCut.cropped, 'Cropped'),
  (HairCut.short, 'Short'),
  (HairCut.shoulder, 'Shoulder-length'),
  (HairCut.long, 'Long'),
  (HairCut.braid, 'Braided'),
];
const _creatureSkins = [('green', 'Green'), ('blue', 'Blue'), ('grey', 'Grey'), ('violet', 'Violet')];

class FaceSketch extends StatefulWidget {
  const FaceSketch({super.key, required this.entry, required this.profile, required this.actions});

  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;

  @override
  State<FaceSketch> createState() => _FaceSketchState();
}

class _FaceSketchState extends State<FaceSketch> {
  late final CameoLook _was = cameoLookOf(widget.entry, widget.profile);
  late Likeness _now = _was.likeness;

  void _set({
    Object? hair = _same,
    Object? cut = _same,
    bool? curly,
    Object? eyes = _same,
    Object? skin = _same,
    Object? skinFamily = _same,
    bool? beard,
    bool? moustache,
    bool? glasses,
    bool? scar,
    bool? eyepatch,
    bool? freckles,
    bool? hood,
    bool? crown,
  }) {
    final l = _now;
    setState(
      () => _now = (
        hair: identical(hair, _same) ? l.hair : hair as String?,
        cut: identical(cut, _same) ? l.cut : cut as HairCut?,
        curly: curly ?? l.curly,
        eyes: identical(eyes, _same) ? l.eyes : eyes as String?,
        skin: identical(skin, _same) ? l.skin : skin as SkinTone?,
        skinFamily: identical(skinFamily, _same) ? l.skinFamily : skinFamily as String?,
        beard: beard ?? l.beard,
        moustache: moustache ?? l.moustache,
        glasses: glasses ?? l.glasses,
        scar: scar ?? l.scar,
        eyepatch: eyepatch ?? l.eyepatch,
        freckles: freckles ?? l.freckles,
        hood: hood ?? l.hood,
        crown: crown ?? l.crown,
        broad: l.broad,
        slight: l.slight,
      ),
    );
  }

  CameoLook get _look => (
    hair: switch (_now.cut) {
      HairCut.long || HairCut.braid => CameoHair.long,
      HairCut.shoulder => CameoHair.shoulder,
      HairCut.short || HairCut.cropped || HairCut.bald => CameoHair.short,
      null => _was.likeness.cut == null ? _was.hair : CameoHair.shoulder,
    },
    silver: _was.silver,
    pointedEars: _was.pointedEars,
    gone: _was.gone,
    seed: _was.seed,
    likeness: _now,
  );

  void _keep() {
    final name = widget.entry.name.trim().isEmpty ? 'This character' : widget.entry.name.trim();
    widget.actions.now((c) => recordFace(c, widget.entry.id, _was.likeness, _now));
    Navigator.of(context).pop();
    widget.actions.tell('$name’s face is in their profile, under Appearance.');
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = NovelArt.of(context).bound(castTone(widget.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    final l = _now;
    final already = wordsFor(_was.likeness).marks;
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
    Widget dot(Color c) => Container(
      width: 16,
      height: 16,
      decoration: BoxDecoration(
        color: c,
        shape: BoxShape.circle,
        border: Border.all(color: scheme.outline.withValues(alpha: 0.6)),
      ),
    );
    Widget swatch(String label, Color colour, bool on, VoidCallback onTap) => ChoiceChip(
      avatar: dot(colour),
      label: Text(label),
      selected: on,
      showCheckmark: false,
      onSelected: (_) => onTap(),
    );
    Widget mark(String label, String word, bool on, ValueChanged<bool> onChanged) {
      // A mark already written stays: the sheet adds to the profile and takes nothing away.
      final written = already.contains(word);
      return Tooltip(
        message: written ? 'Written in their profile' : '',
        child: FilterChip(label: Text(label), selected: on, onSelected: written ? null : onChanged),
      );
    }

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                children: [
                  Semantics(
                    image: true,
                    label: 'Their face as drawn now',
                    child: SizedBox(
                      width: 104,
                      height: 128,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Cameo(look: _look, ground: tone.ground, ink: tone.ink),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Draw their face', style: vaultHeading(context, size: 18, weight: 700)),
                        const SizedBox(height: 4),
                        Text(
                          'Choose what ${widget.entry.name.trim().isEmpty ? 'they' : widget.entry.name.trim()} '
                          'looks like. It is written into their profile, and their cameo shows it wherever they '
                          'appear.',
                          style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    heading('Hair'),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final (family, label) in _hairs)
                          swatch(
                            label,
                            hairColours[family]!,
                            l.hair == family && l.cut != HairCut.bald,
                            () =>
                                _set(hair: l.hair == family ? null : family, cut: l.cut == HairCut.bald ? null : l.cut),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final (cut, label) in _cuts)
                          ChoiceChip(
                            label: Text(label),
                            selected: l.cut == cut,
                            onSelected: (_) => cut == HairCut.bald && l.cut != cut
                                ? _set(cut: cut, hair: null, curly: false)
                                : _set(cut: l.cut == cut ? null : cut),
                          ),
                        FilterChip(
                          label: const Text('Curly'),
                          selected: l.curly,
                          onSelected: (on) => _set(curly: on),
                        ),
                      ],
                    ),
                    heading('Eyes'),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final (family, label) in _eyes)
                          swatch(
                            label,
                            eyeColours[family]!,
                            l.eyes == family,
                            () => _set(eyes: l.eyes == family ? null : family),
                          ),
                      ],
                    ),
                    heading('Skin'),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final t in SkinTone.values)
                          swatch(
                            '${t.name[0].toUpperCase()}${t.name.substring(1)}',
                            skinColours[t]!,
                            l.skin == t,
                            () => _set(skin: l.skin == t ? null : t, skinFamily: null),
                          ),
                        for (final (family, label) in _creatureSkins)
                          swatch(
                            label,
                            creatureSkins[family]!,
                            l.skinFamily == family,
                            () => _set(skinFamily: l.skinFamily == family ? null : family, skin: null),
                          ),
                      ],
                    ),
                    heading('What marks them'),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        mark('Beard', 'beard', l.beard, (on) => _set(beard: on)),
                        mark('Moustache', 'moustache', l.moustache, (on) => _set(moustache: on)),
                        mark('Glasses', 'glasses', l.glasses, (on) => _set(glasses: on)),
                        mark('Scar', 'a scar', l.scar, (on) => _set(scar: on)),
                        mark('Eyepatch', 'an eyepatch', l.eyepatch, (on) => _set(eyepatch: on)),
                        mark('Freckles', 'freckles', l.freckles, (on) => _set(freckles: on)),
                        mark('Hood', 'a hood', l.hood, (on) => _set(hood: on)),
                        mark('Crown', 'a crown', l.crown, (on) => _set(crown: on)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: OverflowBar(
                alignment: MainAxisAlignment.end,
                spacing: 8,
                overflowAlignment: OverflowBarAlignment.end,
                children: [
                  TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
                  FilledButton.icon(
                    onPressed: _now == _was.likeness ? null : _keep,
                    icon: const Icon(Icons.brush_outlined),
                    label: const Text('Keep this face'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const _same = Object();
