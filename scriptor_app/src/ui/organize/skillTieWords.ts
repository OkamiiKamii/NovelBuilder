// The words of the World ⇄ system skill tie (pure, so a test can read them).

import type { AbilityRecord } from '../../domain/model/storyModel';
import type { Entry } from '../../domain/records/entry';
import { tiedAbilityId } from '../../domain/systems/skillTies';
import type { SystemChanges } from '../../domain/systems/systemChanges';

export const tieWords = {
  panelTitle: 'Tie to a system skill',
  chooser: 'Skill',
  chooserHelper: 'The entry takes the skill’s name.',
  none: '—',
  noneYet: 'None yet',
  heldBy: 'Held by',
  untie: 'Untie',
  untieTitle: 'Untie this skill?',
  alsoAdd: (job: string) => `Also add to ${job}`,
  from: (system: string) => `From ${system}`,
  openIn: (system: string) => `Open in ${system}`,
  logIn: (system: string) => `Log in ${system}`,
  pickJob: 'Log in which system?',
  untieMessage: (entry: string, skill: string, system: string) => `${entry} stays in World and ${skill} stays in ${system}; only the tie goes.`,
  tied: (system: string) => `Tied to ${system}.`,
  untied: 'Untied.',
  undo: 'Undo',
  logged: (system: string) => `Added to ${system}.`,
};

/** One untied skill as a choice: "Strike · Skills · The Job" (the system is left out when there is only one). */
export const skillChoiceLabel = (a: AbilityRecord, withSystem: boolean) => [a.item.name, a.group, ...(withSystem ? [a.system.name] : [])].join(' · ');

/** A tied entry's name is saved with its skill's, through the systems service; null for an untied entry (saved as any
 * other) or a blank name (nothing is saved until there is one). */
export function tiedNameSave(entry: Entry, name: string): ((c: SystemChanges) => void) | null {
  if (tiedAbilityId(entry) === null || name.trim().length === 0) return null;
  return (c) => c.renameTiedSkill(entry.id, name);
}

/** Undoing a tie: the tie goes and the entry gets back the name it had. */
export const undoTie = (entryId: string, name: string) => (c: SystemChanges) => {
  c.untieSkill(entryId);
  c.renameTiedSkill(entryId, name);
  return true;
};

/** Whether the skills come from more than one system (then each is labelled by its system). */
export const manySystems = (skills: readonly AbilityRecord[]) => new Set(skills.map((a) => a.system.id)).size > 1;
