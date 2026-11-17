// A profile's sheet, worked out from the blueprint as it is now, as lines; and the formula field's check as it is
// typed. The pure parts of flutter_app/lib/features/progression/widgets/sheet_view.dart.
//
// Drawn: each line "<name>  " (labelLarge) then its parts (`strong`: weight 600; `small`: bodySmall; `error`: bodySmall
// in the error colour), 4 below; a group's name (titleSmall) 8 above its things; a thing's name (weight 600) with its
// badges (rank, affinity: labelSmall on surfaceContainerHighest, radius 6, padded 6/1), then its facts and its
// requirement (bodySmall; in the error colour when not met) and its evolution; "Now within reach: …" last.

import { type SystemBlueprint } from '../../records/system';
import { type FormulaCheck, SheetProfile, checkFormula, computeSheet } from '../compute';
import { formatNumber } from '../formula';

export type SheetPart = { text: string; style: 'plain' | 'strong' | 'small' | 'error' | 'strongError' };
export type SheetLine = { name: string; parts: SheetPart[] };
export type SheetThing = {
  name: string;
  badges: string[];
  facts: string | null;
  requires: { text: string; met: boolean } | null;
  evolution: string | null;
  error: string | null;
};

/** The sheet as lines: each track, the points, each value; then each group with what is held in it; then what is
 * within reach. `empty` when the blueprint defines nothing yet. */
export function sheetView(
  system: SystemBlueprint,
  profile: SheetProfile,
): { empty: string } | { tracks: SheetLine[]; points: SheetLine | null; rows: SheetLine[]; groups: { name: string; things: SheetThing[] }[]; reach: string | null } {
  const sheet = computeSheet(system, profile);
  if (sheet.rows.length === 0 && sheet.tracks.length === 0 && sheet.items.length === 0) return { empty: 'This blueprint has nothing defined yet.' };
  const tracks: SheetLine[] = sheet.tracks.map((t) => ({
    name: t.track.name,
    parts: [
      { text: t.label, style: 'strong' },
      ...(t.next !== null ? [{ text: ` · ${t.next}`, style: 'small' as const }] : []),
      ...(t.unmet.length > 0 ? [{ text: `  Not yet: ${t.unmet.join('; ')}`, style: 'error' as const }] : []),
      ...(t.error !== null ? [{ text: ` · ${t.error}`, style: 'error' as const }] : []),
    ],
  }));
  const p = sheet.points;
  const points: SheetLine | null =
    p === null
      ? null
      : {
          name: p.name,
          parts: [
            { text: p.unspent < 0 ? `${formatNumber(-p.unspent)} over` : `${formatNumber(p.unspent)} to place`, style: p.unspent < 0 ? 'strongError' : 'strong' },
            { text: ` · ${formatNumber(p.spent)} placed of ${formatNumber(p.earned)} earned`, style: 'small' },
          ],
        };
  const rows: SheetLine[] = sheet.rows.map((row) => {
    const spent = profile.spent.get(row.variable.id) ?? 0;
    return {
      name: row.variable.name,
      parts: [
        row.error !== null ? { text: row.error, style: 'error' } : { text: row.display, style: 'plain' },
        ...(spent !== 0 ? [{ text: ` · ${formatNumber(spent)} placed`, style: 'small' as const }] : []),
        ...(row.sources.length > 0 ? [{ text: ` · from ${row.sources.join(', ')}`, style: 'small' as const }] : []),
      ],
    };
  });
  const groups = system.groupList
    .filter((g) => sheet.items.some((i) => i.item.groupId === g.id))
    .map((group) => ({
      name: group.name,
      things: sheet.items
        .filter((i) => i.item.groupId === group.id)
        .map((i): SheetThing => {
          const facts = [
            i.effects.join(', '),
            ...(i.costs.length > 0 ? [`Costs ${i.costs.map((c) => c.label).join(', ')}`] : []),
            ...(i.item.cooldown.length > 0 ? [`Cooldown: ${i.item.cooldown}`] : []),
          ]
            .filter((x) => x.length > 0)
            .join(' · ');
          return {
            name: i.item.name,
            badges: [system.rankName(i.item), i.item.affinity].filter((b) => b.length > 0),
            facts: facts.length > 0 ? facts : null,
            requires:
              i.requires.length > 0
                ? { text: `Requires ${i.requires}${i.unmet.length > 0 ? ` — not met: ${i.unmet.join('; ')}` : ' — met'}`, met: i.unmet.length === 0 }
                : null,
            evolution: i.item.evolution.length > 0 ? i.item.evolution : null,
            error: i.error,
          };
        }),
    }));
  return {
    tracks,
    points,
    rows,
    groups,
    reach: sheet.available.length > 0 ? sheet.available.map((i) => i.name).join(', ') : null,
  };
}

/** "Now within reach: " before the names. */
export const reachLabel = 'Now within reach: ';

/** The formula field as it is typed: its error, or what it comes to ("= 15 with starting values"). What is typed is
 * saved even when it cannot be worked out yet. */
export function formulaField(
  system: SystemBlueprint,
  draft: string,
  options: { condition?: boolean; extra?: ReadonlyMap<string, number> } = {},
): { check: FormulaCheck; error: string | null; helper: string | null } {
  const check = checkFormula(system, draft, { condition: options.condition ?? false, extra: options.extra });
  return { check, error: check.error, helper: check.preview === null ? null : `= ${check.preview} with starting values` };
}
