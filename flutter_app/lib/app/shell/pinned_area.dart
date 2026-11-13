import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/characters/widgets/vault.dart';
import '../../shared/data/providers.dart';
import '../destinations.dart';

/// THE BAR LEARNS: a phone's bottom bar holds the Library, Write and Organize, and every other area of the book is a
/// press on More and another on the area. For a writer who lives in Plan or Progress that is two presses, every time.
/// So any area under More can be kept on the bar, as a fifth place between Organize and More (the pin on its line in
/// More; the same pin takes it off), and More watches which area is opened from it: one opened four times or more in
/// a week is offered ("You often open Plan. Keep it on the bar?") each time More opens, until it is kept or Not now is
/// pressed (remembered for that area).
///
/// One area at a time: keeping another puts it in the first one's place. All of it is this device's (a phone's habits
/// are not a computer's, whose rail shows every area anyway), and nothing is stored in the novel.

const pinnedAreaSettingKey = 'shell.pinnedArea';
const moreVisitsSettingKey = 'shell.moreVisits';
const pinDeclinedSettingKey = 'shell.pinDeclined';

/// The areas that can be kept on the bar: those of a book that only More holds.
const pinnableAreas = [Destination.plan, Destination.visualize, Destination.review, Destination.progress];

/// How often an area is opened from More in a week before the bar offers to keep it.
const pinOfferVisits = 4;

const _week = Duration(days: 7);

/// When each area was opened from More (milliseconds), as stored: within the last week of [now].
Map<String, List<int>> visitsIn(Object? stored, int now) {
  final out = <String, List<int>>{};
  if (stored is! Map) return out;
  for (final MapEntry(:key, :value) in stored.entries) {
    if (value is! List) continue;
    final recent = [
      for (final v in value)
        if (v is int && now - v <= _week.inMilliseconds && v <= now) v,
    ];
    if (recent.isNotEmpty) out['$key'] = recent;
  }
  return out;
}

/// The area to offer for the bar: the one opened from More most this week, at least [pinOfferVisits] times, not
/// already kept and not declined; or none.
Destination? pinOffer(Map<String, List<int>> visits, {required Destination? pinned, required Set<String> declined}) {
  Destination? best;
  var most = pinOfferVisits - 1;
  for (final d in pinnableAreas) {
    final n = visits[d.name]?.length ?? 0;
    if (d == pinned || declined.contains(d.name) || n <= most) continue;
    best = d;
    most = n;
  }
  return best;
}

/// The area kept on the phone's bar, if any.
class PinnedAreaNotifier extends Notifier<Destination?> {
  @override
  Destination? build() {
    final stored = ref.watch(settingsStoreProvider).read(pinnedAreaSettingKey);
    return pinnableAreas.where((d) => d.name == stored).firstOrNull;
  }

  void pin(Destination? area) {
    state = area;
    _write(pinnedAreaSettingKey, area?.name);
  }

  /// Remembers that [area] was opened from More just now.
  void opened(Destination area, {DateTime? at}) {
    if (!pinnableAreas.contains(area)) return;
    final now = (at ?? DateTime.now()).millisecondsSinceEpoch;
    final visits = visitsIn(ref.read(settingsStoreProvider).read(moreVisitsSettingKey), now);
    (visits[area.name] ??= []).add(now);
    _write(moreVisitsSettingKey, visits);
  }

  /// Not now: [area] is not offered again.
  void decline(Destination area) {
    final declined = {...declinedAreas(), area.name};
    _write(pinDeclinedSettingKey, declined.toList()..sort());
  }

  Set<String> declinedAreas() {
    final stored = ref.read(settingsStoreProvider).read(pinDeclinedSettingKey);
    return {if (stored is List) ...stored.whereType<String>()};
  }

  /// The area to offer now, if any.
  Destination? offer({DateTime? at}) {
    final now = (at ?? DateTime.now()).millisecondsSinceEpoch;
    return pinOffer(
      visitsIn(ref.read(settingsStoreProvider).read(moreVisitsSettingKey), now),
      pinned: state,
      declined: declinedAreas(),
    );
  }

  void _write(String key, Object? value) {
    final settings = ref.read(settingsStoreProvider);
    ref.read(saveControllerProvider).saveNow('setting:$key', () => settings.write(key, value));
  }
}

final pinnedAreaProvider = NotifierProvider<PinnedAreaNotifier, Destination?>(PinnedAreaNotifier.new);

/// Where More makes its offer: worked out as More opens, and gone once answered (kept, or Not now).
class PinOfferSlot extends ConsumerStatefulWidget {
  const PinOfferSlot({super.key, this.at});

  /// The moment to judge the week from (now, unless a test says otherwise).
  final DateTime? at;

  @override
  ConsumerState<PinOfferSlot> createState() => _PinOfferSlotState();
}

class _PinOfferSlotState extends ConsumerState<PinOfferSlot> {
  late Destination? _area = ref.read(pinnedAreaProvider.notifier).offer(at: widget.at);

  @override
  Widget build(BuildContext context) {
    final area = _area;
    if (area == null) return const SizedBox.shrink();
    return PinOffer(
      area: area,
      onKeep: () {
        ref.read(pinnedAreaProvider.notifier).pin(area);
        setState(() => _area = null);
      },
      onNotNow: () {
        ref.read(pinnedAreaProvider.notifier).decline(area);
        setState(() => _area = null);
      },
    );
  }
}

/// The offer at the top of More: the area opened often, and a press to keep it on the bar.
class PinOffer extends StatelessWidget {
  const PinOffer({super.key, required this.area, required this.onKeep, required this.onNotNow});

  final Destination area;
  final VoidCallback onKeep;
  final VoidCallback onNotNow;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.primary.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.primary.withValues(alpha: 0.45)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  _BarPicture(area: area),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'You often open ${area.label}. Keep it on the bar, one press away?',
                      style: vaultText(context, size: 16, color: scheme.onSurface),
                    ),
                  ),
                ],
              ),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 4,
                children: [
                  TextButton(onPressed: onNotNow, child: const Text('Not now')),
                  FilledButton.tonalIcon(
                    onPressed: onKeep,
                    icon: const Icon(Icons.push_pin_outlined),
                    label: const Text('Keep it on the bar'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The bar as it would be, small: four places, the offered one lit among them.
class _BarPicture extends StatelessWidget {
  const _BarPicture({required this.area});
  final Destination area;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget slot(IconData icon, {bool lit = false}) => Container(
      width: 20,
      height: 20,
      decoration: lit ? BoxDecoration(color: scheme.primary, borderRadius: BorderRadius.circular(6)) : null,
      child: Icon(icon, size: 14, color: lit ? scheme.onPrimary : scheme.onSurfaceVariant),
    );
    return ExcludeSemantics(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            slot(Destination.write.icon),
            slot(Destination.organize.icon),
            slot(area.icon, lit: true),
            slot(Icons.more_horiz),
          ],
        ),
      ),
    );
  }
}
