// THE NAME FORGE as a sheet (nameForge.ts forges them): a dozen names in a tradition (the book's own names, when it has
// enough of them, or Old English, Norse, Latin, Lyrical, Desert, Steppe), for a person or a place, beginning with
// letters of the author's choosing. A press takes one; More names forges another dozen. Resolves with the name taken,
// or null. The pure parts of flutter_app/lib/features/characters/widgets/name_forge.dart.
//
// What a press changes: nothing in the novel. A name pressed closes the sheet with it (the caller writes it in: the
// new character's name, a place's name); "A person" / "A place", a tradition, the letters typed (at most 3) and More
// names (the seed one on) only change the names shown.

import { forgeMinNames, forgeNames, learnableNames, nameFlavours } from '../nameForge';

/** The key of the book's own names among the traditions. */
export const bookFlavour = 'book';

export const nameForgeWords = {
  title: 'Forge a name',
  intro: 'New names in the shape of old ones: none of them is a name it learned from.',
  person: 'A person',
  place: 'A place',
  book: 'Like your book',
  startsWith: 'Starts with',
  startsHint: 'Any letters',
  startsMax: 3,
  none: 'Nothing came out right. Try other letters.',
  more: 'More names',
  use: (name: string) => `Use “${name}”`,
} as const;

/** The sheet's state: the names it learns from (the book's people and places, as `learnableNames` keeps them), a
 * person or a place, the tradition, the letters to start with, and the seed (from the clock when it opens, as the
 * Flutter app takes `millisecondsSinceEpoch % 100000`). */
export class NameForgeState {
  readonly people: string[];
  readonly places: string[];
  place: boolean;
  flavour: string;
  start = '';
  seed: number;

  constructor(options: { people?: readonly string[]; places?: readonly string[]; place?: boolean; nowMs?: number } = {}) {
    this.people = learnableNames(options.people ?? []);
    this.places = learnableNames(options.places ?? []);
    this.place = options.place ?? false;
    this.flavour = this.bookCanForge(this.place) ? bookFlavour : nameFlavours[0].key;
    this.seed = (options.nowMs ?? Date.now()) % 100000;
  }

  private bookNames(place: boolean): string[] {
    return place ? this.places : this.people;
  }

  /** Whether the book has enough names (of people, or of places) to learn from. */
  bookCanForge(place: boolean): boolean {
    return this.bookNames(place).length >= forgeMinNames;
  }

  /** The names shown now. (As the Flutter sheet does when drawn: the book's names given up for the first tradition
   * when the book has too few of this kind.) */
  names(): string[] {
    if (this.flavour === bookFlavour && !this.bookCanForge(this.place)) this.flavour = nameFlavours[0].key;
    if (this.flavour === bookFlavour) {
      return forgeNames({ source: this.bookNames(this.place), seed: this.seed, start: this.start });
    }
    const f = nameFlavours.find((x) => x.key === this.flavour)!;
    return forgeNames({ source: f.people, seed: this.seed, place: this.place, placeEndings: f.placeEndings, start: this.start });
  }

  /** The traditions as chips: "Like your book" first (pressable only when the book can teach it, with its tooltip),
   * then each tradition. */
  chips(): { key: string; label: string; selected: boolean; enabled: boolean; tooltip: string | null }[] {
    const ready = this.bookCanForge(this.place);
    const kind = this.place ? 'places' : 'people';
    return [
      {
        key: bookFlavour,
        label: nameForgeWords.book,
        selected: this.flavour === bookFlavour,
        enabled: ready,
        tooltip: ready ? `In the shape of the ${kind} in your book` : `Needs ${forgeMinNames} ${kind} in your book to learn from`,
      },
      ...nameFlavours.map((f) => ({ key: f.key, label: f.label, selected: this.flavour === f.key, enabled: true, tooltip: null })),
    ];
  }

  choosePlace(place: boolean): void {
    this.place = place;
  }

  chooseFlavour(key: string): void {
    if (key === bookFlavour && !this.bookCanForge(this.place)) return;
    this.flavour = key;
  }

  /** The letters typed (the field takes at most 3). */
  typeStart(text: string): void {
    this.start = text.substring(0, nameForgeWords.startsMax);
  }

  more(): void {
    this.seed++;
  }
}
