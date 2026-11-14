import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/systems/system_message.dart';

MessageParts m(
  MessageKind kind, {
  String who = 'Wren',
  String track = 'Level',
  int level = 5,
  String name = '',
  String rank = '',
  String stat = '',
  num from = 0,
  num by = 1,
  String detail = '',
}) => (
  kind: kind,
  who: who,
  track: track,
  level: level,
  name: name,
  rank: rank,
  stat: stat,
  from: from,
  by: by,
  detail: detail,
);

void main() {
  test('each kind in the system’s own words, a line each, in the book’s brackets', () {
    expect(messageLines(m(MessageKind.levelUp, detail: '+5 attribute points to assign'), Bracket.square), [
      '[Level up!]',
      '[Wren has reached Level 5.]',
      '[+5 attribute points to assign]',
    ]);
    expect(messageLines(m(MessageKind.levelUp, who: ''), Bracket.square)[1], '[You have reached Level 5.]');
    expect(messageLines(m(MessageKind.skill, name: 'Fireball', rank: 'F'), Bracket.lenticular), [
      '【Skill acquired: Fireball (F)】',
    ]);
    expect(messageLines(m(MessageKind.stat, stat: 'Strength', from: 12, by: 2), Bracket.angle), [
      '<Strength +2 (12 → 14)>',
    ]);
    expect(messageLines(m(MessageKind.stat, stat: 'Luck', from: 3.5, by: -1), Bracket.none), ['Luck −1 (3.5 → 2.5)']);
    expect(messageLines(m(MessageKind.title, name: 'Tidewalker'), Bracket.square), ['[Title earned: Tidewalker]']);
    expect(
      messageLines(
        m(MessageKind.quest, name: 'The Drowned Road', detail: 'Objective: reach the third stone\nReward: ?'),
        Bracket.square,
      ),
      ['[New quest: The Drowned Road]', '[Objective: reach the third stone]', '[Reward: ?]'],
    );
    expect(messageLines(m(MessageKind.questDone, name: 'The Bell'), Bracket.square), ['[Quest complete: The Bell]']);
    expect(messageLines(m(MessageKind.warning, name: 'Mana low'), Bracket.square), ['[Warning: Mana low]']);
  });

  test('a name not given yet is marked, not left as an empty bracket', () {
    expect(messageLines(m(MessageKind.skill), Bracket.square), ['[Skill acquired: …]']);
  });
}
