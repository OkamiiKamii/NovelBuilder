import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/day_book.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';

WritingSession _s(String day, int net, {int? added}) =>
    WritingSession({'id': '$day$net', 'day': day, 'netWords': net, 'added': added ?? (net > 0 ? net : 0)});

void main() {
  // Wednesday 11 November 2026.
  final now = DateTime(2026, 11, 11, 18);

  test('five whole weeks from Monday, ending this Sunday; days to come are marked', () {
    final book = dayBookOf(const [], now);
    expect(book.days, hasLength(35));
    expect(book.days.first.key, '2026-10-12');
    expect(parseDay(book.days.first.key).weekday, DateTime.monday);
    expect(book.days.last.key, '2026-11-15');
    expect(book.days.singleWhere((d) => d.today).key, '2026-11-11');
    expect([for (final d in book.days.skip(28)) d.ahead], [false, false, false, true, true, true, true]);
    expect(book.streak, 0);
    expect(book.most, 1, reason: 'never zero, for scaling');
  });

  test('the days in a row reach today when today is written, else yesterday; a day of cutting still counts', () {
    final sessions = [
      _s('2026-11-08', 300),
      _s('2026-11-09', -40, added: 10), // cut more than written
      _s('2026-11-10', 200),
      _s('2026-11-10', 120),
    ];
    final before = dayBookOf(sessions, now);
    expect(before.keptToday, isFalse);
    expect(before.streak, 3);
    expect(before.today, 0);
    final day = before.days.singleWhere((d) => d.key == '2026-11-10');
    expect((day.words, day.written), (320, true));
    final cut = before.days.singleWhere((d) => d.key == '2026-11-09');
    expect((cut.words, cut.written), (0, true));
    expect(before.most, 320);
    expect(before.thisWeek, 0 + 320, reason: 'Monday on: the 9th cut words, the 10th added 320');

    final after = dayBookOf([...sessions, _s('2026-11-11', 50)], now);
    expect((after.keptToday, after.streak, after.today), (true, 4, 50));

    final broken = dayBookOf([_s('2026-11-08', 300)], now);
    expect(broken.streak, 0, reason: 'a day missed since');
  });
}
