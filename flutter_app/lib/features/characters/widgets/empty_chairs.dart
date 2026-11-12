import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/empty_chairs.dart';
import '../../../shared/domain/records/relation.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'portrait.dart';
import 'vault.dart';

/// Where "Not now" on the empty chairs is kept, per novel.
String emptyChairsKey(String novelId) => 'cast.emptyChairs.hidden.$novelId';

/// The most in the cast for the chairs still to be set out: past this, the cast stands for its own photograph.
const chairsUntil = 3;

/// The lead and their empty chairs, when the chairs are to be set out: a cast of [chairsUntil] or fewer, a lead, a
/// chair still empty, and not put away for this novel. Null otherwise.
({Listed lead, List<EmptyChair> chairs})? chairsFor(
  WidgetRef ref,
  String novelId,
  List<Listed> cast,
  Iterable<CharacterRelation> relations,
) {
  if (cast.length > chairsUntil || ref.read(settingsStoreProvider).read(emptyChairsKey(novelId)) == true) return null;
  final lead = chairsLead(cast);
  if (lead == null) return null;
  final chairs = emptyChairs(lead, cast, relations);
  return chairs.isEmpty ? null : (lead: lead, chairs: chairs);
}

/// THE EMPTY CHAIRS, at the head of a small cast in place of its photograph: the lead on a lit stage, and round them,
/// dashed and empty, the places a story usually has that this one has not filled (`empty_chairs.dart`). Each asks its
/// question by name ("Who taught Wren?"); a press opens the new character's card with the line begun (", Wren's
/// mentor"), so only a name is left to write, and they join the cast already tied to the lead. A filled chair is gone
/// from the stage. **Not now** puts the chairs away for this novel ([chairsFor] says when they are set out).
class EmptyChairs extends StatelessWidget {
  const EmptyChairs({super.key, required this.lead, required this.chairs, required this.onFill, required this.onHide});

  final Listed lead;
  final List<EmptyChair> chairs;
  final void Function(EmptyChair chair) onFill;
  final VoidCallback onHide;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final first = lead.entry.name.trim().split(RegExp(r'\s+')).first;

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Semantics(
        container: true,
        label: 'Who else is in $first’s story',
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [scheme.surfaceContainerHigh, scheme.surfaceContainerLow],
              ),
              border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.6)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text(
                            'Who else is in $first’s story?',
                            style: vaultHeading(context, size: 16, weight: 700, color: scheme.onSurface),
                          ),
                        ),
                      ),
                      TextButton(onPressed: onHide, child: const Text('Not now')),
                    ],
                  ),
                  Text(
                    'Each empty place is a question. Answer one with a name, and they join the cast already tied to '
                    '$first.',
                    style: vaultText(context, size: 15.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 14),
                  LayoutBuilder(
                    builder: (context, box) => _Stage(lead: lead, chairs: chairs, width: box.maxWidth, onFill: onFill),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Stage extends StatelessWidget {
  const _Stage({required this.lead, required this.chairs, required this.width, required this.onFill});

  final Listed lead;
  final List<EmptyChair> chairs;
  final double width;
  final void Function(EmptyChair chair) onFill;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const chairWidth = 104.0;
    final wide = width >= chairWidth * (chairs.length + 1.4) + 12 * chairs.length;
    final leadFigure = _Lead(listed: lead);
    Widget chair(EmptyChair c) => SizedBox(
      width: wide ? chairWidth : math.min(chairWidth, (width - 24) / 3),
      child: _Chair(chair: c, onTap: () => onFill(c)),
    );
    final stage = wide
        ? Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final c in chairs.take(chairs.length ~/ 2)) ...[chair(c), const SizedBox(width: 12)],
              leadFigure,
              for (final c in chairs.skip(chairs.length ~/ 2)) ...[const SizedBox(width: 12), chair(c)],
            ],
          )
        : Column(
            children: [
              leadFigure,
              const SizedBox(height: 14),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                runSpacing: 14,
                children: [for (final c in chairs) chair(c)],
              ),
            ],
          );
    return DecoratedBox(
      // A light on the lead, as on a stage.
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: wide ? Alignment.center : const Alignment(0, -0.6),
          radius: wide ? 0.6 : 0.9,
          colors: [castTone(lead.entry.id).withValues(alpha: 0.2), castTone(lead.entry.id).withValues(alpha: 0)],
        ),
      ),
      child: Column(
        children: [
          stage,
          const SizedBox(height: 8),
          Container(height: 1.5, color: scheme.outlineVariant),
        ],
      ),
    );
  }
}

/// The lead, as they stand in the cast photograph, their name on a plate under them.
class _Lead extends StatelessWidget {
  const _Lead({required this.listed});

  final Listed listed;

  @override
  Widget build(BuildContext context) {
    final l = listed;
    final scheme = Theme.of(context).colorScheme;
    final art = NovelArt.of(context);
    final look = art.bound(castTone(l.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    final picture = uploadedImageBytes(l.entry.image) != null
        ? ClipOval(
            child: FittedBox(
              fit: BoxFit.cover,
              child: Portrait(name: l.entry.name, image: l.entry.image, focal: l.profile.focal, size: 126),
            ),
          )
        : Cameo(
            look: cameoLookOf(l.entry, l.profile),
            ground: look.ground,
            ink: look.ink,
            frame: art.system ? look.frame.withValues(alpha: 0.8) : look.ink.withValues(alpha: 0.6),
            bare: true,
          );
    return ExcludeSemantics(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(width: 104, height: 131, child: picture),
          const SizedBox(height: 6),
          DecoratedBox(
            decoration: BoxDecoration(
              color: scheme.surface.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              child: Text(l.entry.name, style: vaultHeading(context, size: 13, weight: 700, color: scheme.onSurface)),
            ),
          ),
        ],
      ),
    );
  }
}

/// An empty chair: a dashed outline where someone would stand, a faint bust in it and a "+", and its question.
class _Chair extends StatelessWidget {
  const _Chair({required this.chair, required this.onTap});

  final EmptyChair chair;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label: chair.question,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 72,
                height: 90,
                child: CustomPaint(
                  painter: _ChairPainter(line: scheme.primary, faint: scheme.onSurfaceVariant),
                  child: Align(
                    alignment: const Alignment(0, 0.9),
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: scheme.primary),
                      child: Icon(Icons.add, size: 18, color: scheme.onPrimary),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                chair.question,
                textAlign: TextAlign.center,
                maxLines: 3,
                style: vaultText(context, size: 14.5, color: scheme.onSurface),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChairPainter extends CustomPainter {
  _ChairPainter({required this.line, required this.faint});

  final Color line;
  final Color faint;

  @override
  void paint(Canvas canvas, Size size) {
    final oval = Rect.fromLTWH(2, 2, size.width - 4, size.height - 4);
    final dash = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..color = line.withValues(alpha: 0.8);
    for (final metric in (Path()..addOval(oval)).computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += 9) {
        canvas.drawPath(metric.extractPath(d, math.min(d + 5, metric.length)), dash);
      }
    }
    // Where someone would stand: a faint bust.
    final bust = Paint()..color = faint.withValues(alpha: 0.22);
    final c = oval.center;
    canvas.drawCircle(Offset(c.dx, oval.top + oval.height * 0.36), oval.width * 0.19, bust);
    canvas.save();
    canvas.clipPath(Path()..addOval(oval));
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(c.dx, oval.bottom + oval.height * 0.02),
        width: oval.width * 0.86,
        height: oval.height * 0.62,
      ),
      bust,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ChairPainter old) => old.line != line || old.faint != faint;
}
