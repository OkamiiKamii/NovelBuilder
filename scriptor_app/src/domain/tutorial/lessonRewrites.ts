// THE LESSONS REWRITTEN FOR SCRIPTOR'S SCREENS. Where a lesson's step (or what it is, where it is, its example) describes
// the Flutter app's screen and Scriptor's differs (the Library's tiles and chips instead of shelves by stage, the Desk
// instead of the text and frame buttons, arrows instead of swipes on the keepsakes, a phone's keys instead of a
// keyboard's), it is said Scriptor's way here, whole. Each rewrite names how the Dart's text begins (`was`), so the test
// fails if the Flutter app's lesson changes under it; a step rewritten as null is not shown. Everything not rewritten is
// shown through scriptorLessons.ts's phrases, which the test turns back into the Dart's words, word for word.

/** [how the Flutter app's text begins, Scriptor's text (null: the step is not shown)]. */
export type Rewrite = readonly [was: string, now: string | null];

export type LessonRewrite = {
  what?: Rewrite;
  where?: Rewrite;
  example?: Rewrite;
  /** By the step's place in the Flutter app's lesson (from 0). */
  steps?: Readonly<Record<number, Rewrite>>;
};

const inCast = (view: string): string => `Organize, Characters: Ways to see your cast → ${view}.`;

export const lessonRewrites: Readonly<Record<string, LessonRewrite>> = {
  library: {
    steps: {
      0: [
        'A new library starts with a sample novel',
        'A new library starts with a sample novel, The Drowned Road, to look around in (Settings → Add the sample novel puts another copy on the shelf). Press New Novel: type the title and the author beside the cover, pick a colour, and press Begin chapter one to start writing (Create only makes the book without opening it). More details holds the rest: subtitle, status, genre, tags, a target, a deadline, a synopsis and a cover picture.',
      ],
      1: [
        'Press a book to open it',
        'Press Continue on a book to go straight back to the chapter you left (a finished book says View instead).',
      ],
      2: [
        'Books stand on shelves by stage',
        'The chips across the top show All, Ongoing, Completed, On Hold or Archived. The buttons beside the search choose the order and switch between cards and a list.',
      ],
      3: [
        'The Ideas shelf',
        'The four tiles at the top: New Novel, Import (from a file), Backup (save or restore) and Templates. Further down: your collections, the Library overview and quick actions. What changed lately in a novel is in its Analytics.',
      ],
      4: [
        'Use the ⋯ menu on a book',
        'Use the ⋯ on a book to edit its details (a cover picture too), add it to your Favorites or a collection, duplicate it, archive it, save a backup or delete it.',
      ],
    },
    example: [
      'Create “Ashfall” and give it a cover.',
      'Create “Ashfall” and give it a cover. It stands in the Library as a book; tomorrow, Continue opens the chapter where you stopped.',
    ],
  },
  areas: {
    what: [
      'The Library is the shelf',
      'Inside a novel, five areas along the bottom: Library, Write, Organize (with Plan, Visualize and Review as its tabs), Analytics (with Progress and the Keepsakes) and Settings. The Library itself stands outside every novel, with Settings at its top.',
    ],
    steps: {
      2: ['The ribbon at the right edge', null],
      3: [
        'On a phone, More opens the contents',
        'The magnifier at the top of the Library, Write’s contents, Organize and Analytics searches the book and goes anywhere by name; the question mark beside it opens this tutorial.',
      ],
    },
  },
  write: {
    steps: {
      0: [
        'Add a chapter (or a scene inside one)',
        'In the contents, press Add a part or chapter (or a scene inside one), then press it to write. Its title is typed at the top of the page. The chapter’s name at the top of the page lists every chapter, with Previous and Next.',
      ],
      1: [
        'Beside the page (the panel button',
        'Desk (the toolbox at the top; on a tablet, its buttons sit there) → The margin holds notes: how the chapter before ends, this chapter’s plan and beats, who is on the page and the threads that move here. A chapter with no words yet opens on them, under the first line, with a few ways in (or Plan this chapter); they go with your first word.',
      ],
      3: [
        'Use the text button for font',
        'Desk → Writing settings sets the font, size and spacing; the magnifier above the page is Find and replace. While you type, bold, italic, lists and links wait in the ink tray over the keyboard. Desk → Red pencil marks echoes, long sentences and fillers under the words (nothing is changed); press Echoes, Long sentences or Fillers to go to the next one.',
      ],
      4: [
        'The frame button is focus mode',
        'Desk → Focus mode keeps the line you write in the middle and fades the rest (Exit focus brings it all back; Typewriter, in the writing settings, stops the centring). In a long chapter, the strip down the right edge is the whole chapter: tap or drag it to go anywhere.',
      ],
    },
    example: [
      'Type a scene, then press Ctrl',
      'Type a scene, then press the magnifier above the page to find every “Kael”. Close the app mid-sentence: the words are there when you come back.',
    ],
  },
  namekeys: {
    where: ['In the editor: over the keyboard on a phone', 'In the editor: over the keyboard, in the ink tray.'],
    steps: {
      1: ['On a computer they show', null],
      2: [
        'On a phone, with nothing typed yet',
        'With nothing typed yet, the keys are the names already on this page: press one to write it at the cursor.',
      ],
    },
  },
  glance: {
    where: ['In the editor: over the keyboard on a phone', 'In the editor: just above the keyboard, while you write.'],
  },
  gaps: {
    steps: {
      1: [
        'Or press Leave a gap (on a phone',
        'Or press Desk → Leave a gap: [[ ]] goes in at the caret, ready for your note. With words selected, they become the note.',
      ],
    },
  },
  pagetools: {
    where: ['In the editor: the buttons above the page', 'In the editor: the Desk (the toolbox at the top; on a tablet, its buttons sit there).'],
    steps: {
      1: [
        'Listen: the chapter read aloud',
        'Listen: the chapter read aloud by your device’s own voice, a sentence at a time from the caret, the one being read lit. Back a sentence and Next sentence move it; Stop listening ends it.',
      ],
      4: [
        'Under the chapter’s heading, In this chapter',
        'Under the chapter’s heading, In this chapter shows who and what the page names, most mentioned first; press one to open their page. Today’s ink (in the writing settings) marks each paragraph written or changed today.',
      ],
    },
  },
  atmosphere: {
    where: ['In the writing settings (the text button)', 'In the Desk: Writing settings → Atmosphere.'],
    steps: {
      0: [
        'Open the writing settings (on a phone',
        'Open Desk → Writing settings and pick under Atmosphere: Rain, Snow, Fireflies, Candlelight or Stars.',
      ],
      1: [
        'On a computer or a tablet',
        'On a tablet it fills the desk around the paper, and lies faintly on the paper behind the words. On a phone, where the paper is the whole screen, it stays faint enough to read over.',
      ],
    },
  },
  booksetting: {
    where: ['On every page in Write; the switch', 'On every page in Write; the switch is in Desk → Writing settings.'],
  },
  drafts: {
    where: ['In the editor: the Alternate drafts button', 'In the editor: Desk → Drafts, next to Version history.'],
    steps: {
      0: ['Press Alternate drafts, then', 'Press Desk → Drafts, then Start a new draft.'],
    },
  },
  history: {
    where: ['In the editor: the Version history button', 'In the editor: Desk → Version history.'],
  },
  read: {
    steps: {
      0: [
        'Open Read as a book from',
        'In Write’s contents, press The book (the open book at the top), then Read as a book and publish.',
      ],
      3: ['Turn pages with the arrow keys', 'Turn pages with a swipe, or a tap near either edge; open the contents to jump.'],
    },
  },
  book: {
    steps: {
      0: [
        'Open Book details and fill',
        'In Write’s contents, press The book (the open book at the top), then Book details, and fill in what the book needs.',
      ],
    },
  },
  search: {
    steps: {
      1: [
        'Type a page or a name',
        'Type a page or a name: Go to lists the places that answer it (“plot” is Plot lanes, “stats” Analytics). The search key on the keyboard goes to the first.',
      ],
    },
    example: [
      'Type “trai” and Return',
      'Type “trai” and press the keyboard’s search key: the trailer plays. Type “silver key” for the chapters it is in.',
    ],
  },
  export: {
    steps: {
      0: ['Open Settings → Import & export', 'Open Settings → Your data → Open Import & export.'],
      3: [
        'For a copy of everything, export a backup',
        'For a copy of everything, save a backup from the Library instead (a book’s ⋯ → Save a backup).',
      ],
    },
  },
  characters: {
    steps: {
      4: [
        'To find someone, type in Search the cast',
        'To find someone, type in Search characters and pick a role from the chips. Filters narrows the cast; New adds a character. The ⋯ menu holds the Relationship map, the Cast list for the book, the Group photo and View, which switches between List, Cards, Ties, Orbit and the rest. The list comes first.',
      ],
      3: [
        'Use the profile’s tabs',
        'A profile’s tabs are Status (when the book has systems), Overview, Relationships, Details, Story (progression and history) and Notes (notes and secrets). Press the portrait for its tools.',
      ],
    },
  },
  bookstory: {
    steps: {
      1: [
        'Press the right side of the screen',
        'Press the arrows to turn the page, or to go back: what you have written, the days you wrote it on, your biggest chapter, who your book is about, who talks most, the words you lean on, where it begins and where it stands.',
      ],
    },
  },
  bestlines: {
    steps: {
      0: ['Open More and press Best lines.', 'Open Analytics → Keepsakes and press Best lines: twelve cards, the best first.'],
    },
  },
  beforeareader: {
    steps: {
      2: [
        'Press the card for the list',
        'Below, the list: each in its sentence, the slip marked in red. The chips show one kind at a time.',
      ],
    },
  },
  gazette: {
    steps: {
      0: [
        'Open More and press The Gazette.',
        'Open Analytics → Keepsakes and press The Gazette. It opens on chapter 1’s edition; the arrows go through the others.',
      ],
    },
  },
  postcards: {
    steps: {
      0: [
        'Open More and press Postcards.',
        'Open Analytics → Keepsakes and press Postcards. The arrows go through the places, in the order your book first names them.',
      ],
    },
  },
  sampler: {
    steps: {
      0: ['Open More and press Sampler.', 'Open Analytics → Keepsakes and press Sampler. The arrows turn its pages as they will print.'],
      3: ['The last page says how much more', 'The last page says how much more there is. Make the PDF makes it and opens the share sheet, ready to send.'],
    },
  },
  castcheck: {
    where: [
      'Organize, Characters: under the cast photograph',
      'Organize, Characters: the strip under the cast list, “suggestions from your pages”, once the book has three chapters or more.',
    ],
  },
  fromyourpages: {
    where: ['Organize, Characters: From your pages', 'Organize, Characters: the strip under the cast list, “suggestions from your pages”.'],
    steps: {
      0: [
        'Under the photograph, From your pages',
        'Under the cast list, press “✦ N suggestions from your pages”. It unfolds a note for each kind with something to say, and how many.',
      ],
      2: ['Then the search, the views', 'The cast comes first, on the first screen; the notes are folded into one strip under it.'],
    },
  },
  nameboard: { where: ['Organize, Characters: the Names view', inCast('Names')] },
  whoseeyes: { where: ['Organize, Characters: the Eyes view', inCast('Eyes')] },
  castviews: {
    what: [
      'Eleven ways to see the same cast',
      'Twelve ways to see the same cast, each showing something the others do not, all in one place.',
    ],
    where: ['Organize, Characters: on a phone, the button', 'Organize, Characters: the ⋯ menu beside New, then View.'],
    steps: {
      0: ['On a phone, press the button', 'Press ⋯, then View, and choose one. The list is the view you start in.'],
    },
  },
  compass: { where: ['Organize, Characters: the Compass view', inCast('Compass')] },
  arcs: { where: ['Organize, Characters: the Arcs view', inCast('Arcs')] },
  entrances: { where: ['Organize, Characters: the Entrances view', inCast('Entrances')] },
  rollcall: { where: ['Organize, Characters: the Roll call view', inCast('Roll call')] },
  stakes: { where: ['Organize, Characters: the Stakes view', inCast('Stakes')] },
  dramatis: {
    where: [
      'Organize, Characters: Cast list for the book',
      'Organize, Characters: Cast list for the book, in the ⋯ menu beside New. Book details edits it after.',
    ],
  },
  journal: {
    where: ['A character’s page, at the top: their journal.', 'A character’s page, Overview tab, Quick actions: In their hand.'],
    steps: {
      0: [
        'Open a character and press their journal.',
        'Open a character and press In their hand. A prompt waits at the head of a ruled page, made of what you know of them: a letter they will never send to someone they are tied to, what they want and why.',
      ],
    },
  },
  charactercard: {
    where: ['On every character’s profile, at the top', 'On every character’s profile, Overview tab, Quick actions: Share their card.'],
    steps: {
      3: ['Press Share: on a phone', 'Press Share: the share sheet opens with the card as a picture, 1080 by 1350, the shape of a post.'],
    },
  },
  thisorthat: { where: ['A character’s profile, at the top', 'A character’s profile, Overview tab, Quick actions: This or that.'] },
  drawface: { where: ['A character’s profile, under their portrait', 'A character’s profile: press the portrait, then Draw their face.'] },
  cast: {
    steps: {
      2: [
        'Together on the page, at the top of the cast',
        'Together on the page, one of the suggestions under the cast, names the pairs the book keeps side by side with no tie: How are they tied? records one in a press, Not tied sets it aside. In Ties, a “+” between two does the same.',
      ],
      4: [
        'At the top, the whole cast stands',
        'The whole cast stands for a photograph, the principals in front: press anyone to open them. It sits at the top of a small cast; once the cast is more than three, it is in ⋯ → Group photo.',
      ],
    },
  },
  kinds: {
    steps: {
      0: ['Open World → Categories & fields.', 'Open Organize → World → Categories & fields.'],
    },
  },
  progress: {
    steps: {
      1: [
        'A year of writing has a square',
        'A year of writing has a square for each day, darker the more you wrote. Tap a day to see its words.',
      ],
    },
  },
  backups: {
    where: ['The Library: Import backup', 'The Library: the Backup tile, and a book’s ⋯ → Save a backup.'],
    steps: {
      0: ['From a novel’s menu', 'From a book’s ⋯, choose Save a backup and keep the file safe.'],
      1: ['On another device', 'On another device, press the Backup tile and choose the file; check what it holds.'],
    },
    example: [
      'Export “Ashfall” on the PC',
      'Save a backup of “Ashfall” on your phone every Friday. On the tablet, import it to read and write on the train.',
    ],
  },
  settings: {
    what: [
      'How the app looks and feels',
      'What the app keeps on this device: its look, your writer rank, restore points, the sample novel, and your data with Import & export.',
    ],
    steps: {
      1: [
        'Choose a look',
        'Appearance shows the look: System Monolith, near-black panels with gold for what you choose and sky blue for what informs.',
      ],
      2: ['Set the editor’s', 'Your writer rank: the rank your writing has earned, and how it is earned. The editor’s font, size and spacing are in Write, Desk → Writing settings.'],
      3: [
        'Turn the Tutorial button',
        'Restore points bring a book back as it was. Your data says where the library is kept, and opens Import & export.',
      ],
    },
    example: [
      'Choose midnight for writing',
      'Deleted a chapter you wanted? Settings → Restore points brings the book back as it was before.',
    ],
  },
  devices: {
    steps: {
      0: [
        'On a phone the Library fills',
        'On a phone the bar along the bottom holds Library, Write, Organize, Analytics and Settings.',
      ],
      1: [
        'In Write, the contents page',
        'In Write, the contents page and the editor take turns; the back arrow returns to the contents, and the chapter’s name at the top of the page lists every chapter, with Previous and Next.',
      ],
    },
  },
  tutorial: {
    steps: {
      0: ['Press Tutorial at any time.', 'Press the question mark at any time.'],
      2: [
        'Your path, at the head',
        'Your path, at the head of All topics, ticks each lesson your books show you have used (a character, an event, a thread) and names the next one worth trying: press Show me.',
      ],
    },
    example: [
      'On the World page, press Tutorial',
      'On the World tab, press the question mark: it opens on “The world”, with an example entry to try.',
    ],
  },
};
