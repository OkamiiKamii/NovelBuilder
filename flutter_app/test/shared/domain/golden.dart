import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';

/// A reference output the original TypeScript app wrote for the agreement tests (see `tool/golden/`).
JsonMap readGolden(String file) => jsonDecode(File('test/fixtures/golden/$file').readAsStringSync()) as JsonMap;

/// Fails with the first difference, so a mismatch says where it is.
void expectJson(Object? actual, Object? expected, String what) {
  String? diff(Object? a, Object? e, String path) {
    if (a is Map && e is Map) {
      for (final k in {...a.keys, ...e.keys}) {
        if (!a.containsKey(k)) return '$path.$k missing (expected ${jsonEncode(e[k])})';
        if (!e.containsKey(k)) return '$path.$k unexpected (${jsonEncode(a[k])})';
        final d = diff(a[k], e[k], '$path.$k');
        if (d != null) return d;
      }
      return null;
    }
    if (a is List && e is List) {
      for (var i = 0; i < a.length && i < e.length; i++) {
        final d = diff(a[i], e[i], '$path[$i]');
        if (d != null) return d;
      }
      return a.length == e.length ? null : '$path has ${a.length} items, expected ${e.length}';
    }
    // A fraction from pow() and the like may differ in its last digit between processors (Windows on Intel, Macs on
    // Apple silicon): agreement is to a part in a trillion there. Whole numbers, text and shapes stay exact.
    if (a is double && e is num && (a - e).abs() <= 1e-12 * (e.abs() > 1 ? e.abs() : 1)) return null;
    if (e is double && a is num && (a - e).abs() <= 1e-12 * (e.abs() > 1 ? e.abs() : 1)) return null;
    return jsonEquals(a, e) ? null : '$path is ${jsonEncode(a)}, expected ${jsonEncode(e)}';
  }

  final d = diff(actual, expected, what);
  if (d != null) fail(d);
}
