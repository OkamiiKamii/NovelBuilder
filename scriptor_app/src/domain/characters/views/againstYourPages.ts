// CHECKED AGAINST YOUR PAGES on a character's profile (looks.ts reads the page): their eyes and hair as the chapters
// give them, set beside what the profile records. A slip ("grey" here, "her blue eyes" in chapter 7) is shown with the
// line, a press from the chapter and from putting the profile right; a look the page gives and the profile does not is
// offered to record; agreement is shown in a line. Nothing changes until the author presses.
//
// The pure parts of flutter_app/lib/features/characters/widgets/against_your_pages.dart: what to read (`looksInputs`;
// kept by readingKey(inputs, textVersion) in KeptReadings; read with looksJob(service.storedChapters(novelId),
// cast.documentIds, names, others)), what the box shows, and what a press records.
//
// In a profile box, a row a feature: its icon (20; error_outline in error, auto_awesome_outlined in the accent,
// check_circle_outline in tertiary) and what it says (16); under a slip or an unrecorded look, 26 in, **Read it in
// <chapter>** and **Make it <colour>** / **Record <colour>**.

import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import {
  type Feature,
  type LookCheck,
  type LookSighting,
  checkLooks,
  featureFieldNames,
  featureLabel,
  features,
  recordAs,
} from '../looks';
import { recordLook } from '../recordLook';
import { documentName } from '../screens/parts';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type ReadThere, readThere } from './readings';

/** Their names, every other character's (so a look is not given to whoever stands beside them), and what the reading
 * is made of (null when there is nothing to read). */
export function looksInputs(
  cast: CastData,
  entryId: string,
): { names: string[]; others: string[]; inputs: string | null } {
  const all = cast.findNames;
  const names = all[entryId] ?? [];
  const others = cast.entries
    .filter((e) => e.id !== entryId && e.category === 'character')
    .flatMap((e) => all[e.id] ?? []);
  const chapters = cast.documentIds;
  return {
    names,
    others,
    inputs:
      chapters.length === 0 || names.length === 0
        ? null
        : `looks\u0000${cast.novelId}\u0000${chapters.join(',')}\u0000${names.join('|')}\u0000${others.join('|')}`,
  };
}

/** What the profile records of each feature now (empty when nothing). */
export function recordedLooks(cast: CastData, entryId: string): Map<Feature, string> {
  const entry = cast.entries.find((e) => e.id === entryId);
  const out = new Map<Feature, string>();
  if (entry === undefined) return out;
  for (const f of features) {
    out.set(f, entry.fields.find((x) => featureFieldNames[f].includes(dartToLowerCase(dartTrim(x.key))))?.value ?? '');
  }
  return out;
}

/** A row of the box. */
export type LookRow = {
  check: LookCheck;
  icon: string;
  /** The theme colour of its icon. */
  tint: 'error' | 'primary' | 'tertiary';
  line: string;
  /** For a slip or an unrecorded look: where to read it, and what recording it says. */
  presses: { read: { label: string; there: ReadThere }; record: { label: string; value: string } } | null;
};

/** The box, or null (nothing shown) while it is read, or when the pages give nothing to check. `seen`: what looksJob
 * gave. */
export function againstYourPages(
  cast: CastData,
  entryId: string,
  seen: readonly LookSighting[] | null,
): { title: string; caption: string; rows: LookRow[] } | null {
  if (seen === null || seen.length === 0) return null;
  const checks = checkLooks(seen, recordedLooks(cast, entryId));
  if (checks.length === 0) return null;
  const slips = checks.filter((c) => c.verdict === 'differs').length;
  return {
    title: 'Checked against your pages',
    caption:
      slips === 0
        ? 'Their eyes and hair as your chapters describe them, beside what you recorded.'
        : `${slips === 1 ? 'One look' : `${slips} looks`} in your chapters ${slips === 1 ? 'does' : 'do'} not match the profile.`,
    rows: checks.map((c) => lookRow(cast, c)),
  };
}

function lookRow(cast: CastData, c: LookCheck): LookRow {
  const s = c.sightings[0];
  const chapter = documentName(cast, s.nodeId);
  const value = recordAs(c.family);
  const colour = dartToLowerCase(value);
  const label = featureLabel[c.feature];
  const [icon, tint, line]: [string, LookRow['tint'], string] =
    c.verdict === 'differs'
      ? ['error_outline', 'error', `${label}: the profile says ${c.recorded}; ${chapter} says “${s.said}”.`]
      : c.verdict === 'unrecorded'
        ? ['auto_awesome_outlined', 'primary', `${label}: ${chapter} says “${s.said}”. Not in the profile yet.`]
        : [
            'check_circle_outline',
            'tertiary',
            `${label}: ${c.recorded}, as your pages have it${c.sightings.length > 1 ? ` (${c.sightings.length} times)` : ''}.`,
          ];
  return {
    check: c,
    icon,
    tint,
    line,
    presses:
      c.verdict === 'agrees'
        ? null
        : {
            read: { label: `Read it in ${chapter}`, there: readThere(s.nodeId, s.said, s.block) },
            record: { label: c.verdict === 'differs' ? `Make it ${colour}` : `Record ${colour}`, value },
          },
  };
}

/** **Make it** / **Record**: records the page's colour as the feature (inside CharacterService.change). */
export function recordPageLook(c: CharacterChanges, entryId: string, check: LookCheck): void {
  recordLook(c, entryId, check.feature, recordAs(check.family));
}
