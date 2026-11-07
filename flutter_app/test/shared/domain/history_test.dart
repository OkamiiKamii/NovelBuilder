import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/records/event.dart';

import 'builder.dart';

StoryModel _model() => StoryModel.fromSnapshot(
  (NovelBuilder()
        ..node('ch1')
        ..node('ch2', order: 1)
        ..node('ch3', order: 2)
        ..entry('mira')
        ..entry('orrin')
        ..event('siege', when: year(10))
        ..event('treaty', when: exact(12, month: 3, day: 1))
        ..relation('r', 'mira', 'orrin', [
          stage('friends', title: 'Friends'),
          stage('rivals', startNodeId: 'ch2', title: 'Rivals', directional: true, fromRole: 'Rival', toRole: 'Friend'),
        ]))
      .build(),
);

void main() {
  group('historical states are kept and retrievable', () {
    test('a relationship is read at any chapter without losing earlier stages', () {
      final model = _model();
      final r = model.relations['r']!;
      expect(stageAt(r, 'ch1', model.order)!.id, 'friends');
      expect(stageAt(r, 'ch2', model.order)!.id, 'rivals');
      expect(stageAt(r, null, model.order)!.id, 'rivals', reason: 'null means the end of the story');
      expect([for (final s in sortedStages(r, model.order)) s.id], ['friends', 'rivals']);
    });

    test('directional roles are each side\'s own: A sees B as a rival while B sees A as a friend', () {
      final stage = _model().relations['r']!.stages.last;
      expect((stage.fromRole, stage.toRole, stage.directional), ('Rival', 'Friend', true));
    });

    test('a fact that holds from one chapter to another', () {
      final model = _model();
      final v = Validity(Anchor.node('ch2'), Anchor.node('ch3'));
      final ctx = model.timeContext;
      expect(
        [
          for (final n in ['ch1', 'ch2', 'ch3']) validAt(v, Anchor.node(n), ctx),
        ],
        [Truth.no, Truth.yes, Truth.no],
      );
    });

    test('reading order and story time are never compared: the answer is unknown', () {
      final model = _model();
      final fromChapter = Validity(Anchor.node('ch2'), null);
      expect(validAt(fromChapter, Anchor.event('siege'), model.timeContext), Truth.unknown);
    });

    test('a date only known to the year cannot settle a question inside that year', () {
      final model = _model();
      final fromSpring = Validity(Anchor.date(exact(10, month: 4)), null);
      expect(validAt(fromSpring, Anchor.event('siege'), model.timeContext), Truth.unknown);
      expect(validAt(fromSpring, Anchor.event('treaty'), model.timeContext), Truth.yes);
      expect(validAt(fromSpring, Anchor.date(year(9)), model.timeContext), Truth.no);
    });

    test('a handover at the same point does not overlap; open-ended ones do', () {
      final ctx = _model().timeContext;
      final first = Validity(null, Anchor.event('treaty'));
      final second = Validity(Anchor.event('treaty'), null);
      expect(overlaps(first, second, ctx), Truth.no);
      expect(overlaps(Validity.always, second, ctx), Truth.yes);
    });

    test('history is ordered: open starts, story time, reading order, then unplaceable, never dropped', () {
      final ctx = _model().timeContext;
      final states = [
        Validity(Anchor.node('ch2'), null),
        Validity(Anchor.date(const {'precision': 'unknown'}), null),
        Validity(Anchor.event('treaty'), null),
        Validity.always,
        Validity(Anchor.event('siege'), null),
      ];
      final ordered = historyOf(states, (v) => v, ctx);
      expect(ordered, [states[3], states[4], states[2], states[0], states[1]]);
    });
  });

  group('fictional time is modelled honestly', () {
    test('approximate dates cover their whole stretch; exact days cover a day', () {
      final c = Calendar.standardCalendar;
      final yearSpan = c.spanOf(EventDate.fromJson(year(10))!)!;
      expect(yearSpan.hi - yearSpan.lo + 1, c.minutesPerYear);
      final day = c.spanOf(EventDate.fromJson(exact(10, month: 1, day: 1))!)!;
      expect(day.hi - day.lo + 1, c.minutesPerDay);
      final summer = c.spanOf(EventDate.fromJson(year(10, season: 'summer'))!)!;
      expect(summer.lo, yearSpan.lo + c.monthStarts[5]);
    });

    test('an unknown date has no place; a relative one is placed from its anchor', () {
      final model = StoryModel.fromSnapshot(
        (NovelBuilder()
              ..event('siege', when: year(10))
              ..event(
                'before',
                when: {
                  'precision': 'relative',
                  'anchorId': 'siege',
                  'amount': 2,
                  'unit': 'years',
                  'direction': 'before',
                },
              )
              ..event(
                'loop',
                when: {'precision': 'relative', 'anchorId': 'loop', 'amount': 1, 'unit': 'days', 'direction': 'after'},
              )
              ..event('never'))
            .build(),
      );
      final ctx = model.timeContext;
      expect(spanOfEvent('never', ctx), isNull);
      expect(
        spanOfEvent('before', ctx)!.lo,
        spanOfEvent('siege', ctx)!.lo - 2 * Calendar.standardCalendar.minutesPerYear,
      );
      expect(spanOfEvent('loop', ctx), isNull, reason: 'an event dated from itself cannot be placed');
    });

    test('a custom calendar with its own months and day length', () {
      final c = Calendar.fromJson({
        'kind': 'custom',
        'name': 'The Reckoning',
        'months': [
          {'name': 'Frost', 'days': 40},
          {'name': 'Thaw', 'days': 30},
        ],
        'hoursPerDay': 20,
        'daysPerWeek': 5,
        'eras': [
          {'name': 'Second Age', 'startYear': 100},
        ],
        'seasons': {'spring': 2, 'summer': 2, 'autumn': 1, 'winter': 1},
      });
      expect(c.standard, isFalse);
      expect(c.minutesPerDay, 1200);
      expect(c.minutesPerYear, 70 * 1200);
      expect(c.yearName(103), 'Second Age 4');
      expect(c.dateProblem(EventDate.fromJson(exact(1, month: 3))!), contains('Month 3 is not in The Reckoning'));
      expect(
        c.spanOf(EventDate.fromJson(exact(1, month: 3))!),
        isNull,
        reason: 'a date that does not fit is not placed',
      );
    });

    test('a calendar that cannot be read falls back to the standard one; stored dates are not touched', () {
      expect(Calendar.fromJson({'kind': 'custom', 'name': '', 'months': []}).standard, isTrue);
      expect(calendarProblems({'kind': 'custom', 'name': '', 'months': []}), contains('Give the calendar a name.'));
    });
  });
}
