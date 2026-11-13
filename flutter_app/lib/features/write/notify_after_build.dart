import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

/// For the editor's helpers that follow the caret (`name_keys.dart`, `glance.dart`): the caret can move while the
/// screen is being built (the editor laying itself out again), and a widget cannot be told to rebuild then. So the news
/// waits for the frame to finish; at any other time it goes at once. Once disposed, nothing more is said.
mixin NotifyAfterBuild on ChangeNotifier {
  bool _waiting = false;
  bool _gone = false;

  /// Tells the listeners now, or as soon as the frame being built is done.
  void notifyWhenSafe() {
    if (_gone) return;
    final phase = SchedulerBinding.instance.schedulerPhase;
    final building = phase == SchedulerPhase.persistentCallbacks || phase == SchedulerPhase.midFrameMicrotasks;
    if (!building) {
      notifyListeners();
      return;
    }
    if (_waiting) return;
    _waiting = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _waiting = false;
      if (!_gone) notifyListeners();
    });
  }

  /// Call first in `dispose`.
  void stopNotifying() => _gone = true;
}
