import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import 'data/codex_service.dart';

final codexServiceProvider = Provider<CodexService>(
  (ref) => CodexService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);
