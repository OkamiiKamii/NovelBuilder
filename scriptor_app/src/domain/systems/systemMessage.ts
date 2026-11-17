// THE SYSTEM SPEAKS: the messages a progression story's system puts in front of its characters, the lines its
// readers watch for ("[Level up!]", "[Skill acquired: Fireball (F)]", "[Strength +2 (12 → 14)]"), written for the
// author in the book's own brackets. Pure: it turns what is chosen into lines of text. A port of
// flutter_app/lib/shared/domain/systems/system_message.dart.

import { dartTrim } from '../text/dartString';

/** How the book brackets its system's words. */
export type Bracket = 'square' | 'lenticular' | 'angle' | 'none';
export const brackets: readonly Bracket[] = ['square', 'lenticular', 'angle', 'none'];
export const bracketMarks: Readonly<Record<Bracket, { open: string; close: string; label: string }>> = {
  square: { open: '[', close: ']', label: 'Square' },
  lenticular: { open: '【', close: '】', label: 'Lenticular' },
  angle: { open: '<', close: '>', label: 'Angle' },
  none: { open: '', close: '', label: 'None' },
};

/** What the system is saying. */
export type MessageKind = 'levelUp' | 'skill' | 'stat' | 'title' | 'quest' | 'questDone' | 'warning';
export const messageKinds: readonly MessageKind[] = ['levelUp', 'skill', 'stat', 'title', 'quest', 'questDone', 'warning'];
export const messageKindLabel: Readonly<Record<MessageKind, string>> = {
  levelUp: 'Level up',
  skill: 'New skill',
  stat: 'Stat up',
  title: 'Title earned',
  quest: 'New quest',
  questDone: 'Quest complete',
  warning: 'Warning',
};

/** What a message is made of: what kind it is, who it is to, and the rest as the kind needs it (a track and the
 * level reached; the name of a skill, title or quest, and its rank; a stat, where it was and by how much; a line
 * more, the detail). */
export type MessageParts = {
  kind: MessageKind;
  who: string;
  track: string;
  level: number;
  name: string;
  rank: string;
  stat: string;
  from: number;
  by: number;
  detail: string;
};

/** Dart's `_number`: a whole number as a whole, else to one place (`toStringAsFixed(1)`, which rounds as `toFixed`
 * does for these). */
export function messageNumber(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  const whole = n < 0 ? -Math.round(-n) : Math.round(n);
  if (n === whole) return String(whole);
  return Math.abs(n) >= 1e21 ? String(n) : n.toFixed(1);
}

/** The lines the system says for `m`, each in the book's `bracket`; the detail, when there is one, its own line or
 * lines. */
export function messageLines(m: MessageParts, bracket: Bracket): string[] {
  const marks = bracketMarks[bracket];
  const said = (line: string): string => `${marks.open}${dartTrim(line)}${marks.close}`;
  const rank = dartTrim(m.rank).length === 0 ? '' : ` (${dartTrim(m.rank)})`;
  const name = dartTrim(m.name);
  const who = dartTrim(m.who);
  const named = name.length === 0 ? '…' : name;
  let head: string[];
  switch (m.kind) {
    case 'levelUp':
      head = [
        'Level up!',
        `${who.length === 0 ? 'You have' : `${who} has`} reached ${dartTrim(m.track).length === 0 ? 'Level' : dartTrim(m.track)} ${m.level}.`,
      ];
      break;
    case 'skill':
      head = [`Skill acquired: ${named}${rank}`];
      break;
    case 'stat':
      head = [
        `${dartTrim(m.stat).length === 0 ? '…' : dartTrim(m.stat)} ${m.by < 0 ? '−' : '+'}${messageNumber(Math.abs(m.by))} ` +
          `(${messageNumber(m.from)} → ${messageNumber(m.from + m.by)})`,
      ];
      break;
    case 'title':
      head = [`Title earned: ${named}${rank}`];
      break;
    case 'quest':
      head = [`New quest: ${named}`];
      break;
    case 'questDone':
      head = [`Quest complete: ${named}`];
      break;
    default:
      head = [`Warning: ${named}`];
  }
  return [...head.map(said), ...m.detail.split('\n').filter((l) => dartTrim(l).length > 0).map(said)];
}
