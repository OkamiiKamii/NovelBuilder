// DRAW THEIR FACE: a character with no picture is a cameo drawn from their profile (cameo.ts), and here the author
// draws it: the colour of their hair and how it is worn, their eyes, their skin, and what marks them (a beard,
// glasses, a scar, an eyepatch, freckles, a hood, a crown), each a press, the cameo changing as they go. **Keep this
// face** writes it into their profile as words, in their Appearance fields ("Long, curly black", "Green", "Olive"; the
// marks added to Distinguishing Features), so the face and the profile are one; the cameo then shows it everywhere
// they are drawn. Nothing already written is taken away, and nothing changes until Keep. The pure parts of
// flutter_app/lib/features/characters/widgets/face_sketch.dart (a sheet; any message showing is put away first, so
// it does not lie over Keep).
//
// What a press changes: each swatch, cut, Curly and mark changes only the face drawn (`now`). A swatch or cut pressed
// again takes it off; Bald takes the hair's colour and the curls off; a hair colour pressed on a bald head leaves the
// cut unsaid; a skin tone and a creature's skin take each other's place. A mark already written in the profile is
// shown chosen and cannot be pressed. "Keep this face" (pressable once the face differs from the one read) calls
// `recordFace(c, entryId, was.likeness, now)` in one change (CharacterChanges), closes, and says `keptMessage`.

import { type Entry } from '../../records/entry';
import { dartTrim } from '../../text/dartString';
import { type CharacterChanges } from '../characterChanges';
import { type CharacterProfile } from '../characterRecords';
import { recordFace } from '../recordLook';
import { type CameoLook, cameoLookOf, creatureSkins, eyeColours, hairColours, lookWith, skinColours } from './cameo';
import { type HairCut, type Likeness, type SkinTone, sameLikeness, skinTones, wordsFor } from './likeness';

/** The swatches, by family, as they are named in the sheet. */
export const faceHairs: readonly [string, string][] = [
  ['black', 'Black'],
  ['brown', 'Brown'],
  ['red', 'Red'],
  ['amber', 'Golden'],
  ['blond', 'Blond'],
  ['grey', 'Grey'],
  ['silver', 'Silver'],
  ['white', 'White'],
  ['blue', 'Blue'],
  ['green', 'Green'],
  ['violet', 'Violet'],
];

export const faceEyes: readonly [string, string][] = [
  ['brown', 'Brown'],
  ['hazel', 'Hazel'],
  ['amber', 'Amber'],
  ['green', 'Green'],
  ['blue', 'Blue'],
  ['grey', 'Grey'],
  ['violet', 'Violet'],
  ['black', 'Black'],
  ['red', 'Red'],
];

export const faceCuts: readonly [HairCut, string][] = [
  ['bald', 'Bald'],
  ['cropped', 'Cropped'],
  ['short', 'Short'],
  ['shoulder', 'Shoulder-length'],
  ['long', 'Long'],
  ['braid', 'Braided'],
];

export const faceCreatureSkins: readonly [string, string][] = [
  ['green', 'Green'],
  ['blue', 'Blue'],
  ['grey', 'Grey'],
  ['violet', 'Violet'],
];

/** The marks, as pressed: the label, the word recordFace writes, and the likeness's flag. */
export const faceMarks: readonly [string, string, MarkKey][] = [
  ['Beard', 'beard', 'beard'],
  ['Moustache', 'moustache', 'moustache'],
  ['Glasses', 'glasses', 'glasses'],
  ['Scar', 'a scar', 'scar'],
  ['Eyepatch', 'an eyepatch', 'eyepatch'],
  ['Freckles', 'freckles', 'freckles'],
  ['Hood', 'a hood', 'hood'],
  ['Crown', 'a crown', 'crown'],
];

export type MarkKey = 'beard' | 'moustache' | 'glasses' | 'scar' | 'eyepatch' | 'freckles' | 'hood' | 'crown';

export const faceWords = {
  title: 'Draw their face',
  intro: (name: string) =>
    `Choose what ${name} looks like. It is written into their profile, and their cameo shows it wherever they appear.`,
  faceLabel: 'Their face as drawn now',
  hair: 'HAIR',
  eyes: 'EYES',
  skin: 'SKIN',
  marks: 'WHAT MARKS THEM',
  curly: 'Curly',
  written: 'Written in their profile',
  cancel: 'Cancel',
  keep: 'Keep this face',
} as const;

/** A swatch: its label, its colour (`#rrggbb`), whether it is chosen. */
export type FaceSwatch = { key: string; label: string; colour: string; on: boolean };

/** The sheet's state: the look read from the profile (`was`), and the face as drawn now. */
export class FaceSketchState {
  readonly was: CameoLook;
  now: Likeness;

  constructor(
    readonly entryId: string,
    readonly entryName: string,
    was: CameoLook,
  ) {
    this.was = was;
    this.now = was.likeness;
  }

  static of(entry: Entry, profile: CharacterProfile | null): FaceSketchState {
    return new FaceSketchState(entry.id, entry.name, cameoLookOf(entry, profile));
  }

  /** The cameo in the sheet (104 × 128, rounded 14, on the character's colour), as drawn now. */
  get look(): CameoLook {
    return lookWith(this.was, this.now);
  }

  private set(changes: Partial<Likeness>): void {
    this.now = { ...this.now, ...changes };
  }

  hairSwatches(): FaceSwatch[] {
    const l = this.now;
    return faceHairs.map(([key, label]) => ({ key, label, colour: hairColours[key], on: l.hair === key && l.cut !== 'bald' }));
  }

  pressHair(family: string): void {
    const l = this.now;
    this.set({ hair: l.hair === family ? null : family, cut: l.cut === 'bald' ? null : l.cut });
  }

  cuts(): { cut: HairCut; label: string; on: boolean }[] {
    return faceCuts.map(([cut, label]) => ({ cut, label, on: this.now.cut === cut }));
  }

  pressCut(cut: HairCut): void {
    const l = this.now;
    if (cut === 'bald' && l.cut !== cut) this.set({ cut, hair: null, curly: false });
    else this.set({ cut: l.cut === cut ? null : cut });
  }

  setCurly(on: boolean): void {
    this.set({ curly: on });
  }

  eyeSwatches(): FaceSwatch[] {
    return faceEyes.map(([key, label]) => ({ key, label, colour: eyeColours[key], on: this.now.eyes === key }));
  }

  pressEyes(family: string): void {
    this.set({ eyes: this.now.eyes === family ? null : family });
  }

  /** The skin tones ("Fair" … "Deep"), then a creature's skins. */
  skinSwatches(): (FaceSwatch & { creature: boolean })[] {
    const l = this.now;
    return [
      ...skinTones.map((t) => ({
        key: t,
        label: `${t[0].toUpperCase()}${t.substring(1)}`,
        colour: skinColours[t],
        on: l.skin === t,
        creature: false,
      })),
      ...faceCreatureSkins.map(([key, label]) => ({
        key,
        label,
        colour: creatureSkins[key],
        on: l.skinFamily === key,
        creature: true,
      })),
    ];
  }

  pressSkin(tone: SkinTone): void {
    this.set({ skin: this.now.skin === tone ? null : tone, skinFamily: null });
  }

  pressCreatureSkin(family: string): void {
    this.set({ skinFamily: this.now.skinFamily === family ? null : family, skin: null });
  }

  /** The marks: chosen or not, and whether they can be pressed (a mark already written stays). */
  marks(): { key: MarkKey; label: string; on: boolean; written: boolean; tooltip: string }[] {
    const already = wordsFor(this.was.likeness).marks;
    return faceMarks.map(([label, word, key]) => {
      const written = already.includes(word);
      return { key, label, on: this.now[key], written, tooltip: written ? faceWords.written : '' };
    });
  }

  setMark(key: MarkKey, on: boolean): void {
    if (wordsFor(this.was.likeness).marks.includes(faceMarks.find((m) => m[2] === key)![1])) return;
    this.set({ [key]: on } as Partial<Likeness>);
  }

  /** Whether Keep can be pressed. */
  get changed(): boolean {
    return !sameLikeness(this.now, this.was.likeness);
  }

  get name(): string {
    return dartTrim(this.entryName).length === 0 ? 'they' : dartTrim(this.entryName);
  }

  keep(c: CharacterChanges): void {
    recordFace(c, this.entryId, this.was.likeness, this.now);
  }

  get keptMessage(): string {
    const name = dartTrim(this.entryName).length === 0 ? 'This character' : dartTrim(this.entryName);
    return `${name}’s face is in their profile, under Appearance.`;
  }
}
