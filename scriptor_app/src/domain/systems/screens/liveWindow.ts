// THE WINDOW, on Systems: the system's status window as the story would show it, live, in the kind's own dress. It
// shows a sheet as it stands, chosen in a row of names; with no sheet yet, a hero holding the system's first things,
// as it would begin. Worked out from the blueprint as it is drawn, so a change in the tabs is in the window at once.
// "Share the window" makes a picture of it (status-window.png, three times over). It only reads. The pure parts of
// flutter_app/lib/features/progression/widgets/live_window.dart.
//
// Drawn: a web-asset icon (18, primary), "THE WINDOW" (11, weight 700, primary, letter spacing 2), the caption 4 below
// (14.5, italic, onSurfaceVariant), the names as chips 6 apart when more than one, then the window centred at most
// 480 wide, then what sharing said (14), then "Share the window" at the right.

import { type StoryModel } from '../../model/storyModel';
import { type SystemBlueprint, type SystemSheet } from '../../records/system';
import { dartTrim } from '../../text/dartString';
import { SheetProfile } from '../compute';
import { exampleHeld } from './statusWindow';
import { windowKindOf } from './systemSpeaks';

export const liveWindowWords = {
  heading: 'THE WINDOW',
  share: 'Share the window',
  file: 'status-window.png',
  failed: (e: unknown) => `The picture could not be made: ${String(e)}`,
} as const;

/** Where the system is changed, as the window says it: "below" (in the story), "beside" (the blueprint on a wide
 * screen) or "here" (the blueprint on a phone, the window folded above it). */
export type WindowWhere = 'below' | 'beside' | 'here';

/** What the live window shows for the sheet chosen (`chosen`; else the first). */
export function liveWindow(
  model: StoryModel,
  system: SystemBlueprint,
  chosen: string | null,
  where: WindowWhere = 'below',
): {
  caption: string;
  chips: { id: string; label: string; selected: boolean }[];
  sheet: SystemSheet | null;
  presetId: string;
  holder: string;
  held: string[];
  profile: SheetProfile | null;
} {
  const sheets = model.sheets.filter((s) => s.systemId === system.id && model.entries.has(s.entryId));
  const sheet = sheets.find((s) => s.id === chosen) ?? sheets[0] ?? null;
  const holder = sheet === null ? 'Your hero' : dartTrim(model.entries.get(sheet.entryId)!.name);
  return {
    caption:
      sheet === null
        ? `How a sheet in it will look as it begins. Change the system ${where}, and it changes here.`
        : `Their sheet as it stands, as the story shows it. Change the system ${where}, and it changes here.`,
    chips: sheets.length > 1 ? sheets.map((s) => ({ id: s.id, label: model.entries.get(s.entryId)!.name, selected: s.id === sheet?.id })) : [],
    sheet,
    presetId: windowKindOf(system),
    holder: holder.length === 0 ? 'Unnamed' : holder,
    held: sheet?.itemIds ?? exampleHeld(system.raw),
    profile: sheet === null ? null : SheetProfile.of(sheet),
  };
}
