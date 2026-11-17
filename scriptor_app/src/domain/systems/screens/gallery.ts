// THE SYSTEMS GALLERY: an empty Systems page shows every preset as a card to start from: its motif, name and
// description, its ladder of ranks in words, a status window of a sheet in it, and "Begin with" it; a last card begins
// blank. First, when the pages describe one, YOUR BOOK'S OWN SYSTEM. The pure parts of
// flutter_app/lib/features/progression/widgets/system_gallery.dart.
//
// Drawn: "Begin a system" (the vault heading, 18, weight 700), the intro (16, italic, onSurfaceVariant), 14 below;
// cards 14 apart in two columns from 720 wide, else one. A card: the motif in a circle, the name (15, weight 700),
// the description (16), each line "<label>  <value>" (15.5, onSurfaceVariant), the window (compact), the button. The
// book's own system: in the book's frame (padded 18/18/18/16), a 40 circle in the primary colour with the motif (22,
// onPrimary), "Your book’s own system" (15, weight 700), why (16), the window (at most 560 wide), and "Begin with your
// book’s system" across the whole width. It comes in above the presets when read (at once with motion reduced).

import { type JsonMap, str } from '../../json';
import { maps } from '../../records/jsonRecord';
import { dartToLowerCase } from '../../text/dartString';
import { type PagesSystem } from '../fromPages';
import { type SystemPreset, systemPresets } from '../systemPresets';
import { exampleHeld } from './statusWindow';

/** The motif of each preset, by its id (Material icon names; an unknown one has the system mark). */
export function presetIcon(id: string): string {
  switch (id) {
    case 'litrpg':
      return 'sports_esports_outlined';
    case 'cultivation':
      return 'self_improvement';
    case 'hard-magic':
      return 'auto_fix_high';
    case 'superhero':
      return 'bolt';
    default:
      return 'account_tree_outlined';
  }
}

/** What a blueprint holds, said as lines: "Levels & realms: Level", "Ranks: Common → Advanced → …", "Attributes &
 * resources: Strength, Agility, Intelligence and 9 more", "Classes, skills & more: Classes, Skills, Titles". Only what
 * it has. */
export function blueprintLines(content: JsonMap): [string, string][] {
  const names = (key: string): string[] => maps(content[key]).map((m) => str(m['name']));
  const some = (all: string[], shown = 3): string => (all.length <= shown ? all.join(', ') : `${all.slice(0, shown).join(', ')} and ${all.length - shown} more`);
  const tracks = names('tracks');
  const ranks = names('ranks');
  const variables = names('variables');
  const groups = names('groups');
  return [
    ...(tracks.length > 0 ? [['Levels & realms', tracks.join(', ')] as [string, string]] : []),
    ...(ranks.length > 0 ? [['Ranks', ranks.join(' → ')] as [string, string]] : []),
    ...(variables.length > 0 ? [['Attributes & resources', some(variables)] as [string, string]] : []),
    ...(groups.length > 0 ? [['Classes, skills & more', groups.join(', ')] as [string, string]] : []),
  ];
}

export const galleryWords = {
  title: 'Begin a system',
  intro:
    'For a novel with a worked-out system: a game system, cultivation realms, hard magic. Begin from one of these or from nothing; every name, number and rank can be changed after.',
  exampleCaption: 'A sheet in it, for example. Every name and number can be changed.',
  blankName: 'A blank system',
  blankDescription: 'Nothing in it yet: add the attributes, levels, ranks and skills your story needs.',
  blank: 'Begin blank',
  hero: 'Your hero',
  ownTitle: 'Your book’s own system',
  ownBegin: 'Begin with your book’s system',
} as const;

/** How many cards across, for the gallery's width. */
export const galleryColumns = (width: number): number => (width >= 720 ? 2 : 1);

/** A preset's card: its motif, name, description, its ranks in words, the example window's sheet, and its button. */
export function presetCard(p: SystemPreset, holder: string | null): {
  preset: SystemPreset;
  icon: string;
  lines: [string, string][];
  holder: string;
  held: string[];
  caption: string;
  begin: string;
} {
  return {
    preset: p,
    icon: presetIcon(p.id),
    // Its ladder of ranks in words; everything else as a sheet in it would look.
    lines: blueprintLines(p.content).filter((l) => l[0] === 'Ranks'),
    holder: holder ?? galleryWords.hero,
    held: exampleHeld(p.content),
    caption: galleryWords.exampleCaption,
    begin: `Begin with ${p.name}`,
  };
}

/** The gallery's preset cards, in order. */
export const presetCards = (holder: string | null) => systemPresets.map((p) => presetCard(p, holder));

/** The book's own system's card: why the pages read as it, and the hero's window as it begins. */
export function ownSystemCard(s: PagesSystem, holder: string | null): {
  icon: string;
  said: string;
  holder: string;
  held: string[];
  caption: string;
} {
  const why =
    s.signs.length === 0
      ? null
      : `Your chapters speak of ${s.signs
          .slice(0, 3)
          .map((w) => `“${w.word}” ×${w.times}`)
          .join(', ')}: they read as a ${s.preset.name}.`;
  const powers = new Set(s.powers.map(dartToLowerCase));
  return {
    icon: presetIcon(s.preset.id),
    said: `${why ?? `It is a ${s.preset.name}.`} It begins with what your pages already hold.`,
    holder: holder ?? galleryWords.hero,
    held: maps(s.content['items'])
      .filter((i) => powers.has(dartToLowerCase(str(i['name']))))
      .map((i) => str(i['id'])),
    caption:
      holder === null
        ? 'A sheet in it, as it begins.'
        : s.powers.length === 0
          ? `A sheet for ${holder}, as it begins.`
          : `A sheet for ${holder}, holding ${s.powers.length === 1 ? 'it' : `all ${s.powers.length}`}.`,
  };
}
