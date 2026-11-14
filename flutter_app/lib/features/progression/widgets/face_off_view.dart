import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/backup_files.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../../shared/domain/systems/face_off.dart';
import '../../../shared/domain/systems/formula.dart' show formatNumber;
import '../../characters/widgets/cameo.dart';
import '../../characters/widgets/cast_card.dart' show castTone;
import '../../characters/widgets/vault.dart';
import 'status_window.dart';
import 'system_speaks.dart' show windowKindOf;

/// THE FACE-OFF, on Systems (`face_off.dart` sets them against each other): two of the system's sheets side by side,
/// the genre's "who would win". Their cameos either side of VS (each a row of names to choose from), and for every
/// number both have, a bar out to each side, the longer lit; what it says beneath (who leads in how many, the widest
/// gap, what each alone holds). In the system's own window dress. **Share the face-off** makes a picture of it. It
/// only reads; with fewer than two sheets it is not shown.
class FaceOffView extends ConsumerStatefulWidget {
  const FaceOffView({super.key, required this.model, required this.system});

  final StoryModel model;
  final SystemBlueprint system;

  @override
  ConsumerState<FaceOffView> createState() => _FaceOffViewState();
}

class _FaceOffViewState extends ConsumerState<FaceOffView> {
  String? _a;
  String? _b;
  final _capture = GlobalKey();
  bool _working = false;
  String? _message;

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final boundary = _capture.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('face-off.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final model = widget.model;
    final sheets = [
      for (final s in model.sheets)
        if (s.systemId == widget.system.id && model.entries.containsKey(s.entryId)) s,
    ];
    if (sheets.length < 2) return const SizedBox.shrink();
    final a = sheets.where((s) => s.id == _a).firstOrNull ?? sheets[0];
    final b = sheets.where((s) => s.id == _b && s.id != a.id).firstOrNull ?? sheets.firstWhere((s) => s.id != a.id);
    String nameOf(SystemSheet s) => model.entries[s.entryId]!.name.trim();
    final f = faceOff(
      computeSheet(widget.system, SheetProfile.of(a)),
      computeSheet(widget.system, SheetProfile.of(b)),
      aName: nameOf(a),
      bName: nameOf(b),
    );
    final scheme = Theme.of(context).colorScheme;
    final look = windowLookOf(windowKindOf(widget.system));
    const ink = Color(0xFFE8F0F6);
    final face = look.mono ? 'JetBrains Mono' : vaultText(context).fontFamily;

    Widget picker(SystemSheet chosen, SystemSheet other, ValueChanged<String> onPick) => Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final s in sheets)
          if (s.id != other.id)
            ChoiceChip(label: Text(nameOf(s)), selected: s.id == chosen.id, onSelected: (_) => onPick(s.id)),
      ],
    );

    Widget cameo(SystemSheet s) {
      final entry = model.entries[s.entryId]!;
      final tone = NovelArt.of(context).bound(castTone(entry.id), lift: 0.1, sink: 0.45, tinted: true);
      return Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 64,
              height: 78,
              child: Cameo(look: cameoLookOf(entry, null), ground: tone.ground, ink: tone.ink),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            nameOf(s),
            textAlign: TextAlign.center,
            maxLines: 2,
            style: TextStyle(fontFamily: face, color: ink, fontWeight: FontWeight.w700, fontSize: 14),
          ),
        ],
      );
    }

    final card = Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [look.top, look.bottom],
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: look.accent.withValues(alpha: 0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: cameo(a)),
              Padding(
                padding: const EdgeInsets.only(top: 22),
                child: Text(
                  'VS',
                  style: TextStyle(
                    fontFamily: face,
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: look.accent,
                    letterSpacing: 2,
                    shadows: [Shadow(color: look.accent.withValues(alpha: 0.6), blurRadius: 12)],
                  ),
                ),
              ),
              Expanded(child: cameo(b)),
            ],
          ),
          const SizedBox(height: 12),
          for (final r in f.rows) _Bars(row: r, accent: look.accent, ink: ink, face: face),
          if (f.says.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(height: 1, color: look.accent.withValues(alpha: 0.28)),
            const SizedBox(height: 8),
            for (final s in f.says)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  s,
                  style: TextStyle(fontFamily: face, color: ink, fontSize: 13.5, height: 1.35),
                ),
              ),
          ],
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.sports_kabaddi, size: 18, color: scheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  'THE FACE-OFF',
                  style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Two of them, side by side, as they stand. Who would win?',
          style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        if (sheets.length > 2) ...[
          picker(a, b, (id) => setState(() => _a = id)),
          const SizedBox(height: 4),
          Text(
            'against',
            style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          picker(b, a, (id) => setState(() => _b = id)),
          const SizedBox(height: 8),
        ] else
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() {
                _a = b.id;
                _b = a.id;
              }),
              icon: const Icon(Icons.swap_horiz, size: 18),
              label: const Text('Swap sides'),
            ),
          ),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Semantics(
              container: true,
              label: '${nameOf(a)} against ${nameOf(b)}. ${f.says.join(' ')}',
              child: RepaintBoundary(key: _capture, child: card),
            ),
          ),
        ),
        if (_message != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(_message!, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
          ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _working ? null : _share,
            icon: const Icon(Icons.ios_share, size: 18),
            label: const Text('Share the face-off'),
          ),
        ),
      ],
    );
  }
}

/// One number: its name in the middle, a bar out to each side as long as each value against the larger, the
/// leader's lit, the values at the ends.
class _Bars extends StatelessWidget {
  const _Bars({required this.row, required this.accent, required this.ink, required this.face});
  final FaceOffRow row;
  final Color accent;
  final Color ink;
  final String? face;

  @override
  Widget build(BuildContext context) {
    final top = row.a > row.b ? row.a : row.b;
    double part(double v) => top <= 0 ? 0 : (v / top).clamp(0.0, 1.0);
    final unit = row.unit.isEmpty || row.unit.length > 4 ? '' : ' ${row.unit}';
    TextStyle value(bool lead) => TextStyle(
      fontFamily: face,
      fontSize: 13,
      color: lead ? accent : ink.withValues(alpha: 0.7),
      fontWeight: lead ? FontWeight.w700 : FontWeight.w400,
    );
    Widget bar(double p, bool lead, {required bool right}) => Expanded(
      child: Align(
        alignment: right ? Alignment.centerLeft : Alignment.centerRight,
        child: FractionallySizedBox(
          widthFactor: p,
          child: Container(
            height: 8,
            decoration: BoxDecoration(
              color: lead ? accent : ink.withValues(alpha: 0.28),
              borderRadius: BorderRadius.circular(4),
              boxShadow: lead ? [BoxShadow(color: accent.withValues(alpha: 0.5), blurRadius: 6)] : null,
            ),
          ),
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        children: [
          Text(
            row.name.toUpperCase(),
            style: TextStyle(fontFamily: face, fontSize: 10.5, letterSpacing: 1.4, color: ink.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              SizedBox(
                width: 54,
                child: Text('${formatNumber(row.a)}$unit', textAlign: TextAlign.start, style: value(row.a > row.b)),
              ),
              bar(part(row.a), row.a > row.b, right: false),
              const SizedBox(width: 6),
              bar(part(row.b), row.b > row.a, right: true),
              SizedBox(
                width: 54,
                child: Text('${formatNumber(row.b)}$unit', textAlign: TextAlign.end, style: value(row.b > row.a)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
