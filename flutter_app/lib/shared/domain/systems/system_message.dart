/// THE SYSTEM SPEAKS: the messages a progression story's system puts in front of its characters, the lines its
/// readers watch for ("[Level up!]", "[Skill acquired: Fireball (F)]", "[Strength +2 (12 → 14)]"), written for the
/// author in the book's own brackets. Pure: it turns what is chosen into lines of text.
library;

/// How the book brackets its system's words.
enum Bracket {
  square('[', ']', 'Square'),
  lenticular('【', '】', 'Lenticular'),
  angle('<', '>', 'Angle'),
  none('', '', 'None');

  const Bracket(this.open, this.close, this.label);
  final String open;
  final String close;
  final String label;
}

/// What the system is saying.
enum MessageKind {
  levelUp('Level up'),
  skill('New skill'),
  stat('Stat up'),
  title('Title earned'),
  quest('New quest'),
  questDone('Quest complete'),
  warning('Warning');

  const MessageKind(this.label);
  final String label;
}

/// What a message is made of: what kind it is, who it is to, and the rest as the kind needs it (a track and the
/// level reached; the name of a skill, title or quest, and its rank; a stat, where it was and by how much; a line
/// more, the detail).
typedef MessageParts = ({
  MessageKind kind,
  String who,
  String track,
  int level,
  String name,
  String rank,
  String stat,
  num from,
  num by,
  String detail,
});

String _number(num n) => n == n.roundToDouble() ? n.round().toString() : n.toStringAsFixed(1);

/// The lines the system says for [m], each in the book's [bracket]; the detail, when there is one, its own line or
/// lines.
List<String> messageLines(MessageParts m, Bracket bracket) {
  String said(String line) => '${bracket.open}${line.trim()}${bracket.close}';
  final rank = m.rank.trim().isEmpty ? '' : ' (${m.rank.trim()})';
  final name = m.name.trim();
  final who = m.who.trim();
  final head = switch (m.kind) {
    MessageKind.levelUp => [
      'Level up!',
      '${who.isEmpty ? 'You have' : '$who has'} reached ${m.track.trim().isEmpty ? 'Level' : m.track.trim()} ${m.level}.',
    ],
    MessageKind.skill => ['Skill acquired: ${name.isEmpty ? '…' : name}$rank'],
    MessageKind.stat => [
      '${m.stat.trim().isEmpty ? '…' : m.stat.trim()} ${m.by < 0 ? '−' : '+'}${_number(m.by.abs())} '
          '(${_number(m.from)} → ${_number(m.from + m.by)})',
    ],
    MessageKind.title => ['Title earned: ${name.isEmpty ? '…' : name}$rank'],
    MessageKind.quest => ['New quest: ${name.isEmpty ? '…' : name}'],
    MessageKind.questDone => ['Quest complete: ${name.isEmpty ? '…' : name}'],
    MessageKind.warning => ['Warning: ${name.isEmpty ? '…' : name}'],
  };
  return [
    for (final l in head) said(l),
    for (final l in m.detail.split('\n'))
      if (l.trim().isNotEmpty) said(l),
  ];
}
