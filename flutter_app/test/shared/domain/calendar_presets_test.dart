import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/timeline/calendar_presets.dart';

void main() {
  test('every ready-made calendar is accepted as it is, and its year said plainly', () {
    for (final p in calendarPresets) {
      expect(presetIsValid(p), isTrue, reason: p.name);
      expect(Calendar.fromJson(p.settings).standard, isFalse, reason: '${p.name} reads as its own calendar');
    }
    expect(yearOf(calendarPresets.first.settings), '364 days in 13 months');
  });
}
