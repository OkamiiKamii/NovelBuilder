import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/form_dialog.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/places/places.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/records/journey.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/travel/routes.dart';
import '../../shared/domain/travel/travel.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/portrait.dart' show uploadedImageBytes;
import '../visualize/viz_frame.dart';
import 'places_providers.dart';
import 'widgets/when_picker.dart';

/// One colour a traveller; everyone after the seventh shares the neutral one. Colours are never the only sign: each
/// route is numbered, and listed in words.
const _colors = [0xff2b7a8c, 0xffa8436b, 0xff6b7a2b, 0xffa3622b, 0xff4f5fa3, 0xff8c2b5a, 0xff2b8c6b];
const _other = 0xff8a8276;

/// JOURNEYS
/// Who travels from where to where, and when; each traveller's route and where they were between journeys; drawn on a
/// map where the places have coordinates on it, and always listed in order. Possible conflicts are flagged by stated
/// rules, only when the records give enough to settle them, and never changed.
class JourneysPage extends ConsumerStatefulWidget {
  const JourneysPage({super.key});

  @override
  ConsumerState<JourneysPage> createState() => _JourneysPageState();
}

class _JourneysPageState extends ConsumerState<JourneysPage> {
  bool _list = false;
  String? _who;
  String? _mapId;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final data = cast == null ? null : PlaceData(cast.snapshot);
    final model = cast?.model;
    final usable = data == null
        ? const <WorldMap>[]
        : [
            for (final m in data.maps)
              if ((_who == null ? data.journeys : data.journeys.where((j) => j.travellerIds.contains(_who))).any(
                (j) => [
                  j.fromId,
                  j.toId,
                ].every((id) => id != null && data.pins.any((p) => p.mapId == m.id && p.entryId == id)),
              ))
                m,
          ];
    final map = usable.where((m) => m.id == _mapId).firstOrNull ?? usable.firstOrNull;
    Widget frame(Widget child) => VizFrame(
      view: 'journeys',
      title: 'Journeys',
      filters: false,
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {'jwho': ?_who, 'jmap': ?_mapId},
      },
      onApply: (JsonMap c) => setState(() {
        final l = mapOrNull(c['layout']) ?? const {};
        _list = c['mode'] == 'list';
        _who = strOrNull(l['jwho']);
        _mapId = strOrNull(l['jmap']);
      }),
      actions: [
        if (map != null)
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, icon: Icon(Icons.map_outlined), label: Text('Map')),
              ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('List')),
            ],
            selected: {_list},
            showSelectedIcon: false,
            onSelectionChanged: (v) => setState(() => _list = v.first),
          ),
      ],
      child: child,
    );
    if (cast == null || data == null || model == null) return frame(const SizedBox.shrink());
    final theme = Theme.of(context);
    final actions = PlaceActions(context, cast.novelId);
    final journeys = data.journeys;
    final travellerIds = stableSorted(
      {for (final j in journeys) ...j.travellerIds}.where(model.entries.containsKey),
      (a, b) => localeCompare(model.entries[a]!.name, model.entries[b]!.name),
    );
    final who = _who != null && model.entries.containsKey(_who) ? _who : null;
    final theirs = who == null
        ? journeys
        : [
            for (final j in journeys)
              if (j.travellerIds.contains(who)) j,
          ];
    JourneyRecord record(Journey j) => journeyRecord(model, j, data.travel, data.maps, data.pins);
    final problems = [
      for (final p in travelProblems(model, journeys, data.travel, data.maps, data.pins))
        if (who == null ||
            p.journeyIds.isEmpty ||
            p.journeyIds.any((id) => theirs.any((j) => j.id == id)) ||
            p.message.startsWith(model.entries[who]!.name))
          p,
    ];
    double dated(Journey j) {
      final r = record(j);
      return r.leaves?.lo ?? r.arrives?.lo ?? double.infinity;
    }

    List<Journey> inOrder(List<Journey> list) => stableSorted(list, (a, b) {
      final c = dated(a).compareTo(dated(b));
      if (c != 0) return c;
      final t = a.createdAt.compareTo(b.createdAt);
      return t != 0 ? t : localeCompare(a.id, b.id);
    });

    final toolbar = Wrap(
      spacing: 12,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: 240,
          child: DropdownButtonFormField<String>(
            key: ValueKey('who:$who'),
            initialValue: who ?? '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Whose journeys', isDense: true),
            items: [
              const DropdownMenuItem(value: '', child: Text('Everyone’s')),
              for (final id in travellerIds) DropdownMenuItem(value: id, child: Text(model.entries[id]!.name)),
            ],
            onChanged: (v) => setState(() => _who = v == null || v.isEmpty ? null : v),
          ),
        ),
        if (map != null && usable.length > 1 && !_list)
          SizedBox(
            width: 220,
            child: DropdownButtonFormField<String>(
              key: ValueKey('jmap:${map.id}'),
              initialValue: map.id,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Map shown', isDense: true),
              items: [for (final m in usable) DropdownMenuItem(value: m.id, child: Text(m.name))],
              onChanged: (v) => setState(() => _mapId = v),
            ),
          ),
        FilledButton.icon(
          onPressed: () => _openForm(context, actions, null, who),
          icon: const Icon(Icons.add),
          label: const Text('Record a journey'),
        ),
        OutlinedButton(
          onPressed: () => showDialog<void>(
            context: context,
            builder: (_) => MethodsDialog(actions: actions),
          ),
          child: const Text('Travel methods…'),
        ),
      ],
    );
    if (journeys.isEmpty) {
      return frame(
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            toolbar,
            const SizedBox(height: 12),
            const EmptyState(
              icon: Icons.route_outlined,
              title: 'No journeys yet',
              message: 'Record who travels from where to where, and when, as far as you know it.',
            ),
          ],
        ),
      );
    }

    Widget journeyActions(Journey j) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: 'Edit the journey ${record(j).words}',
          onPressed: () => _openForm(context, actions, j, who),
          icon: const Icon(Icons.edit_outlined),
        ),
        IconButton(
          tooltip: 'Delete the journey ${record(j).words}',
          onPressed: () async {
            final ok = await showConfirmDialog(
              context,
              title: 'Delete this journey?',
              message: 'Delete the journey “${record(j).words}”? The travellers, places and events are not changed.',
              confirmLabel: 'Delete the journey',
              destructive: true,
            );
            if (ok) {
              actions.places((c) {
                c.removeJourney(j.id);
                return true;
              });
            }
          },
          icon: const Icon(Icons.delete_outline),
        ),
      ],
    );
    Widget line(RouteItem item) {
      final j = item.journeyId == null ? null : journeys.where((x) => x.id == item.journeyId).firstOrNull;
      return ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(item.title),
        subtitle: Text([item.when, if (item.detail.isNotEmpty) item.detail].join(' · ')),
        trailing: j == null ? null : journeyActions(j),
      );
    }

    final route = who == null ? null : routeOf(model, who, journeys, data.travel, data.maps, data.pins);
    Widget part(String title, List<RouteItem> items) => items.isEmpty
        ? const SizedBox.shrink()
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Semantics(header: true, child: Text(title, style: theme.textTheme.titleSmall)),
              for (final i in items) line(i),
            ],
          );

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          toolbar,
          const SizedBox(height: 12),
          Semantics(header: true, child: Text('Possible conflicts', style: theme.textTheme.titleMedium)),
          const SizedBox(height: 6),
          if (problems.isEmpty) const Text('None.'),
          for (final p in problems)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Wrap(
                spacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text(p.severity == 'problem' ? 'Conflict' : 'Note'),
                    backgroundColor: p.severity == 'problem' ? theme.colorScheme.errorContainer : null,
                    labelStyle: p.severity == 'problem' ? TextStyle(color: theme.colorScheme.onErrorContainer) : null,
                  ),
                  Text(p.message),
                ],
              ),
            ),
          const SizedBox(height: 12),
          if (!_list && map != null) ...[
            RouteMap(model: model, journeys: inOrder(theirs), map: map, pins: data.pins, words: (j) => record(j).words),
            const SizedBox(height: 12),
          ],
          if (route != null) ...[
            Semantics(
              header: true,
              child: Text('${model.entries[who]!.name}’s route', style: theme.textTheme.titleMedium),
            ),
            part('In story time', route.story),
            part('As the reader meets them', route.reading),
            part('When not known', route.unknown),
          ] else ...[
            Semantics(header: true, child: Text('Every journey', style: theme.textTheme.titleMedium)),
            for (final j in inOrder(journeys))
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(record(j).words),
                subtitle: Text('leaves ${record(j).leavesWords}, arrives ${record(j).arrivesWords}'),
                trailing: journeyActions(j),
              ),
          ],
        ],
      ),
    );
  }

  Future<void> _openForm(BuildContext context, PlaceActions actions, Journey? journey, String? who) => showDialog<void>(
    context: context,
    builder: (_) => JourneyForm(actions: actions, initial: journey, defaultTraveller: who),
  );
}

/// Routes on a map: a line through each journey's places, numbered in order, one colour a traveller. What cannot be
/// drawn on it is listed.
class RouteMap extends StatefulWidget {
  const RouteMap({
    super.key,
    required this.model,
    required this.journeys,
    required this.map,
    required this.pins,
    required this.words,
  });
  final StoryModel model;
  final List<Journey> journeys;
  final WorldMap map;
  final List<MapPin> pins;
  final String Function(Journey j) words;

  @override
  State<RouteMap> createState() => _RouteMapState();
}

class _RouteMapState extends State<RouteMap> {
  final _controller = TransformationController();
  String? _fittedFor;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final map = widget.map;
    final s = 800 / math.max(map.width, map.height);
    const pad = 40.0;
    final size = Size(map.width * s + pad * 2, map.height * s + pad * 2);
    Offset? at(String? id) {
      final pin = id == null ? null : widget.pins.where((p) => p.mapId == map.id && p.entryId == id).firstOrNull;
      return pin == null ? null : Offset(pad + pin.x * s, pad + pin.y * s);
    }

    final travellers = <String>[];
    for (final j in widget.journeys) {
      for (final t in j.travellerIds) {
        if (!travellers.contains(t)) travellers.add(t);
      }
    }
    Color colour(Journey j) {
      final i = travellers.indexOf(j.travellerIds.firstOrNull ?? '');
      return Color(i >= 0 && i < _colors.length ? _colors[i] : _other);
    }

    final drawable = [
      for (final j in widget.journeys)
        if ([j.fromId, ...j.via, j.toId].every((id) => at(id) != null)) j,
    ];
    final missing = [
      for (final j in widget.journeys)
        if (!drawable.contains(j)) j,
    ];
    final stops = {
      for (final j in drawable) ...[j.fromId!, ...j.via, j.toId!],
    };
    final image = uploadedImageBytes(map.image);
    final compact = WindowSize.of(context) == WindowSize.compact;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: compact ? 380 : 520,
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final box = constraints.biggest;
                  final key = '${map.id}|${drawable.length}|${box.width.round()}';
                  if (_fittedFor != key) {
                    _fittedFor = key;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      final scale = math.min(box.width / size.width, box.height / size.height).clamp(0.05, 4.0);
                      _controller.value = Matrix4.diagonal3Values(scale, scale, 1)
                        ..setTranslationRaw(
                          (box.width - size.width * scale) / 2,
                          (box.height - size.height * scale) / 2,
                          0,
                        );
                    });
                  }
                  return Semantics(
                    container: true,
                    label:
                        '${map.name}: ${drawable.length} ${drawable.length == 1 ? 'journey' : 'journeys'} drawn. The '
                        'list below gives every journey in words.',
                    child: InteractiveViewer(
                      transformationController: _controller,
                      constrained: false,
                      boundaryMargin: const EdgeInsets.all(400),
                      minScale: 0.05,
                      maxScale: 6,
                      child: SizedBox.fromSize(
                        size: size,
                        child: Stack(
                          children: [
                            Positioned(
                              left: pad,
                              top: pad,
                              width: map.width * s,
                              height: map.height * s,
                              child: image != null
                                  ? Image.memory(image, fit: BoxFit.fill, gaplessPlayback: true)
                                  : DecoratedBox(
                                      decoration: BoxDecoration(
                                        color: theme.colorScheme.surfaceContainerLow,
                                        border: Border.all(color: theme.colorScheme.outline, width: 2),
                                      ),
                                    ),
                            ),
                            Positioned.fill(
                              child: CustomPaint(
                                painter: _RoutesPainter(
                                  legs: [
                                    for (final j in drawable)
                                      (
                                        points: [
                                          for (final id in [j.fromId, ...j.via, j.toId]) at(id)!,
                                        ],
                                        color: colour(j),
                                      ),
                                  ],
                                  ink: theme.colorScheme.onSurface,
                                  ground: theme.colorScheme.surface,
                                ),
                              ),
                            ),
                            for (final id in stops)
                              Positioned(
                                left: at(id)!.dx - 7,
                                top: at(id)!.dy - 7,
                                child: ExcludeSemantics(
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                        width: 14,
                                        height: 14,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: theme.colorScheme.primary,
                                          border: Border.all(color: theme.colorScheme.surface, width: 2),
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 3),
                                        color: theme.colorScheme.surface.withValues(alpha: 0.75),
                                        child: Text(
                                          widget.model.entries[id]?.name ?? '',
                                          style: theme.textTheme.labelSmall,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton.icon(
            onPressed: () => setState(() => _fittedFor = null),
            icon: const Icon(Icons.fit_screen_outlined),
            label: const Text('Fit to view'),
          ),
        ),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            for (final (i, id) in travellers.take(_colors.length).indexed)
              _Key(color: Color(_colors[i]), label: widget.model.entries[id]?.name ?? 'Someone'),
            if (travellers.length > _colors.length)
              _Key(color: const Color(_other), label: 'Everyone else (${travellers.length - _colors.length})'),
          ],
        ),
        Text(
          'An arrow shows the way a journey goes; its number is its place in the list below.',
          style: theme.textTheme.bodySmall,
        ),
        if (missing.isNotEmpty)
          Text(
            'Not drawn on ${map.name} (a place on the way has no coordinates on it): '
            '${missing.map(widget.words).join('; ')}.',
            style: theme.textTheme.bodySmall,
          ),
      ],
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(width: 22, height: 4, color: color),
      const SizedBox(width: 6),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class _RoutesPainter extends CustomPainter {
  _RoutesPainter({required this.legs, required this.ink, required this.ground});
  final List<({List<Offset> points, Color color})> legs;
  final Color ink;
  final Color ground;

  @override
  void paint(Canvas canvas, Size size) {
    for (final (i, leg) in legs.indexed) {
      final p = leg.points;
      final paint = Paint()
        ..color = leg.color
        ..strokeWidth = 3
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round;
      final path = Path()..moveTo(p.first.dx, p.first.dy);
      for (final q in p.skip(1)) {
        path.lineTo(q.dx, q.dy);
      }
      canvas.drawPath(path, paint);
      // The arrow at its end.
      final a = p[p.length - 2];
      final b = p.last;
      final d = b - a;
      if (d.distance > 0) {
        final u = d / d.distance;
        final n = Offset(-u.dy, u.dx);
        final tip = b - u * 9;
        canvas.drawPath(
          Path()
            ..moveTo(tip.dx, tip.dy)
            ..lineTo(tip.dx - u.dx * 11 + n.dx * 6, tip.dy - u.dy * 11 + n.dy * 6)
            ..lineTo(tip.dx - u.dx * 11 - n.dx * 6, tip.dy - u.dy * 11 - n.dy * 6)
            ..close(),
          Paint()..color = leg.color,
        );
      }
      // Its number, on the first leg.
      final mid = Offset((p[0].dx + p[1].dx) / 2, (p[0].dy + p[1].dy) / 2);
      canvas.drawCircle(mid, 10, Paint()..color = ground);
      canvas.drawCircle(
        mid,
        10,
        Paint()
          ..color = leg.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      final tp = TextPainter(
        text: TextSpan(
          text: '${i + 1}',
          style: TextStyle(fontSize: 11, color: ink, fontWeight: FontWeight.w600),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, mid - Offset(tp.width / 2, tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(_RoutesPainter old) => true;
}

// ---------------------------------------------------------------------------------------------------- the forms

/// Recording a journey, or changing one: only who travels is needed; everything else as far as the author knows it.
class JourneyForm extends ConsumerStatefulWidget {
  const JourneyForm({super.key, required this.actions, this.initial, this.defaultTraveller});
  final PlaceActions actions;
  final Journey? initial;
  final String? defaultTraveller;

  @override
  ConsumerState<JourneyForm> createState() => _JourneyFormState();
}

class _JourneyFormState extends ConsumerState<JourneyForm> {
  late final JsonMap _draft =
      widget.initial?.toJson() ??
      {
        'travellerIds': [?widget.defaultTraveller],
        'fromId': null,
        'toId': null,
        'via': <String>[],
        'departure': null,
        'arrival': null,
        'afterId': null,
        'method': '',
        'methodId': null,
        'duration': null,
        'distance': null,
        'distanceUnit': '',
        'eventIds': <String>[],
        'note': '',
      };
  late bool _own = (widget.initial?.method ?? '').isNotEmpty && widget.initial?.methodId == null;
  late final _method = TextEditingController(text: str(_draft['method']));
  late final _duration = TextEditingController(text: '${mapOrNull(_draft['duration'])?['amount'] ?? ''}');
  late final _distance = TextEditingController(text: '${_draft['distance'] ?? ''}');
  late final _unit = TextEditingController(text: str(_draft['distanceUnit']));
  late final _note = TextEditingController(text: str(_draft['note']));
  late TimeUnit _durationUnit = timeUnitOf(mapOrNull(_draft['duration'])?['unit']) ?? TimeUnit.days;

  @override
  void dispose() {
    for (final c in [_method, _duration, _distance, _unit, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  void _set(JsonMap patch) => setState(() => _draft.addAll(patch));

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) return const SizedBox.shrink();
    final model = cast.model;
    final data = PlaceData(cast.snapshot);
    final theme = Theme.of(context);
    final travellers = stableSorted(
      model.entries.values.where((e) => e.category != 'location'),
      (a, b) => localeCompare(a.name, b.name),
    );
    final places = stableSorted(
      model.entries.values.where((e) => e.category == 'location'),
      (a, b) => localeCompare(a.name, b.name),
    );
    final others = [
      for (final j in data.journeys)
        if (j.id != widget.initial?.id) j,
    ];
    final methods = data.travel?.methods ?? const <TravelMethod>[];
    final chosen = strings(_draft['travellerIds']);
    final via = strings(_draft['via']);
    final events = eventChoices(model);
    final unit = _durationUnit;
    Widget placeMenu(String label, String key) => SizedBox(
      width: 240,
      child: DropdownButtonFormField<String>(
        initialValue: places.any((p) => p.id == _draft[key]) ? _draft[key]! as String : '',
        isExpanded: true,
        decoration: InputDecoration(labelText: label, isDense: true),
        items: [
          const DropdownMenuItem(value: '', child: Text('Not recorded')),
          for (final p in places)
            DropdownMenuItem(
              value: p.id,
              child: Text(p.name, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => _set({key: v == null || v.isEmpty ? null : v}),
      ),
    );
    final numbers = [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))];
    return FormDialog(
      title: widget.initial == null ? 'Record a journey' : 'Change the journey',
      width: 560,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Who travels', style: theme.textTheme.labelLarge),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final t in travellers)
                FilterChip(
                  label: Text(t.name),
                  selected: chosen.contains(t.id),
                  onSelected: (on) => _set({
                    'travellerIds': on
                        ? [...chosen, t.id]
                        : [
                            for (final id in chosen)
                              if (id != t.id) id,
                          ],
                  }),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(spacing: 12, runSpacing: 12, children: [placeMenu('From', 'fromId'), placeMenu('To', 'toId')]),
          const SizedBox(height: 12),
          Text('By way of', style: theme.textTheme.labelLarge),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final (i, id) in via.indexed)
                InputChip(
                  label: Text(model.entries[id]?.name ?? 'a place that is gone'),
                  onDeleted: () => _set({
                    'via': [
                      for (final (k, v) in via.indexed)
                        if (k != i) v,
                    ],
                  }),
                  deleteButtonTooltipMessage: 'Remove ${model.entries[id]?.name} from the way',
                ),
              PopupMenuButton<String>(
                tooltip: 'Add a place on the way',
                onSelected: (id) => _set({
                  'via': [...via, id],
                }),
                itemBuilder: (_) => [for (final p in places) PopupMenuItem(value: p.id, child: Text(p.name))],
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text('Add a place on the way…', style: TextStyle(color: theme.colorScheme.primary)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          WhenPicker(
            model: model,
            label: 'Leaves',
            value: mapOrNull(_draft['departure']),
            onChanged: (v) => _set({'departure': v}),
          ),
          const SizedBox(height: 12),
          WhenPicker(
            model: model,
            label: 'Arrives',
            value: mapOrNull(_draft['arrival']),
            onChanged: (v) => _set({'arrival': v}),
          ),
          if (others.isNotEmpty) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: others.any((j) => j.id == _draft['afterId']) ? _draft['afterId']! as String : '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Comes after (when only the order is known)', isDense: true),
              items: [
                const DropdownMenuItem(value: '', child: Text('No journey in particular')),
                for (final j in others)
                  DropdownMenuItem(
                    value: j.id,
                    child: Text(journeyRecord(model, j, data.travel).words, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => _set({'afterId': v == null || v.isEmpty ? null : v}),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 240,
                child: DropdownButtonFormField<String>(
                  initialValue: _own
                      ? 'own'
                      : (methods.any((m) => m.id == _draft['methodId']) ? _draft['methodId']! as String : ''),
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Travel method', isDense: true),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('Not said')),
                    for (final m in methods)
                      DropdownMenuItem(
                        value: m.id,
                        child: Text(
                          '${m.name}${m.speed != null ? ' (${jsNumber(m.speed!)} ${m.distanceUnit} ${perLabels[m.per]})' : ''}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    const DropdownMenuItem(value: 'own', child: Text('In your own words…')),
                  ],
                  onChanged: (v) => setState(() {
                    _own = v == 'own';
                    _draft['methodId'] = v != null && v.isNotEmpty && v != 'own' ? v : null;
                  }),
                ),
              ),
              if (_own)
                SizedBox(
                  width: 220,
                  child: TextField(
                    controller: _method,
                    decoration: const InputDecoration(
                      labelText: 'Travel method, in your own words',
                      hintText: 'on foot, by airship…',
                      isDense: true,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 120,
                child: TextField(
                  controller: _duration,
                  inputFormatters: numbers,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Duration (optional)', isDense: true),
                  onChanged: (t) => _draft['duration'] = t.trim().isEmpty
                      ? null
                      : {'amount': num.tryParse(t.trim()) ?? t.trim(), 'unit': unit.name},
                ),
              ),
              SizedBox(
                width: 130,
                child: DropdownButtonFormField<TimeUnit>(
                  initialValue: unit,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Duration unit', isDense: true),
                  items: [for (final u in TimeUnit.values) DropdownMenuItem(value: u, child: Text(u.name))],
                  onChanged: (u) {
                    if (u == null) return;
                    _durationUnit = u;
                    final d = mapOrNull(_draft['duration']);
                    _set({
                      if (d != null) 'duration': {...d, 'unit': u.name},
                    });
                  },
                ),
              ),
              SizedBox(
                width: 120,
                child: TextField(
                  controller: _distance,
                  inputFormatters: numbers,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Distance (optional)', isDense: true),
                ),
              ),
              SizedBox(
                width: 140,
                child: TextField(
                  controller: _unit,
                  decoration: const InputDecoration(
                    labelText: 'Distance unit',
                    hintText: 'leagues, km…',
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
          if (events.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Part of these events (optional)', style: theme.textTheme.labelLarge),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final e in events)
                  FilterChip(
                    label: Text(e.title),
                    selected: strings(_draft['eventIds']).contains(e.id),
                    onSelected: (on) {
                      final ids = strings(_draft['eventIds']);
                      _set({
                        'eventIds': on
                            ? [...ids, e.id]
                            : [
                                for (final id in ids)
                                  if (id != e.id) id,
                              ],
                      });
                    },
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Note (optional)', isDense: true),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final distance = _distance.text.trim();
            final input = {
              ..._draft,
              'method': _own ? _method.text : '',
              'methodId': _own ? null : _draft['methodId'],
              'distance': distance.isEmpty ? null : (num.tryParse(distance) ?? distance),
              'distanceUnit': _unit.text,
              'note': _note.text,
            };
            final saved = widget.actions.places((c) => c.saveJourney(widget.initial?.id, input));
            if (saved != null && context.mounted) Navigator.of(context).pop();
          },
          child: const Text('Save the journey'),
        ),
      ],
    );
  }
}

/// The novel's ways of travelling. A speed is only ever the author's: none is assumed, and a method with none is never
/// used to judge a journey.
class MethodsDialog extends ConsumerStatefulWidget {
  const MethodsDialog({super.key, required this.actions});
  final PlaceActions actions;

  @override
  ConsumerState<MethodsDialog> createState() => _MethodsDialogState();
}

class _MethodsDialogState extends ConsumerState<MethodsDialog> {
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final actions = widget.actions;
    final methods = cast == null ? const <TravelMethod>[] : PlaceData(cast.snapshot).travel?.methods ?? const [];
    void save(String id, TravelMethod Function(TravelMethod m) change, {bool later = false}) {
      List<TravelMethod> next(List<TravelMethod> all) => [for (final m in all) m.id == id ? change(m) : m];
      if (later) {
        actions.placesLater('method:$id', (c) => c.setMethods(next(c.travelSettings()?.methods ?? const [])));
      } else {
        actions.places((c) => c.setMethods(next(c.travelSettings()?.methods ?? const [])));
      }
    }

    TravelMethod copy(TravelMethod m, {String? name, ({double? value})? speed, String? unit, TimeUnit? per}) =>
        TravelMethod(
          id: m.id,
          name: name ?? m.name,
          speed: speed != null ? speed.value : m.speed,
          distanceUnit: unit ?? m.distanceUnit,
          per: per ?? m.per,
        );
    return FormDialog(
      title: 'Travel methods',
      width: 600,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          if (methods.isEmpty) const Text('No travel methods yet.'),
          for (final m in methods)
            Card.outlined(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 180,
                      child: SavedTextField(
                        key: ValueKey('${m.id}:name'),
                        label: 'Name of ${m.name}',
                        value: m.name,
                        dense: true,
                        onChanged: (t) {
                          if (t.trim().isNotEmpty) save(m.id, (x) => copy(x, name: t), later: true);
                        },
                      ),
                    ),
                    SizedBox(
                      width: 110,
                      child: SavedTextField(
                        key: ValueKey('${m.id}:speed'),
                        label: 'Speed of ${m.name}',
                        hint: 'No speed',
                        value: m.speed == null ? '' : jsNumber(m.speed!),
                        dense: true,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (t) =>
                            save(m.id, (x) => copy(x, speed: (value: double.tryParse(t.trim()))), later: true),
                      ),
                    ),
                    SizedBox(
                      width: 120,
                      child: SavedTextField(
                        key: ValueKey('${m.id}:unit'),
                        label: 'Distance unit',
                        hint: 'leagues',
                        value: m.distanceUnit,
                        dense: true,
                        onChanged: (t) => save(m.id, (x) => copy(x, unit: t), later: true),
                      ),
                    ),
                    SizedBox(
                      width: 130,
                      child: DropdownButtonFormField<TimeUnit>(
                        initialValue: m.per,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: '${m.name}: per', isDense: true),
                        items: [
                          for (final u in TimeUnit.values) DropdownMenuItem(value: u, child: Text(perLabels[u]!)),
                        ],
                        onChanged: (u) => save(m.id, (x) => copy(x, per: u)),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Remove ${m.name}',
                      onPressed: () => actions.places(
                        (c) => c.setMethods([
                          for (final x in methods)
                            if (x.id != m.id) x,
                        ]),
                      ),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _name,
                  decoration: const InputDecoration(
                    labelText: 'New travel method',
                    hintText: 'A way of travelling, e.g. By horse',
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.tonal(
                onPressed: _name.text.trim().isEmpty
                    ? null
                    : () {
                        final done = actions.places(
                          (c) =>
                              c.setMethods([...?c.travelSettings()?.methods, TravelMethod(id: '', name: _name.text)]),
                        );
                        if (done != null) setState(_name.clear);
                      },
                child: const Text('Add'),
              ),
            ],
          ),
        ],
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done'))],
    );
  }
}

String jsNumber(double v) => v == v.roundToDouble() ? v.round().toString() : '$v';
