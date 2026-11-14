/// THE TUTORIAL'S LESSONS, as in the original app (`src/modules/tutorial/topics.ts`): for each feature, what it is for,
/// three to five things to do in order, and a worked example with made-up names. Written for this app: its areas,
/// buttons and pages. Lessons about what this app does not have (the original's cloud sync, AI assistant and studio
/// layouts) are left out.
library;

/// One short lesson.
class Topic {
  const Topic({
    required this.id,
    required this.title,
    required this.group,
    required this.what,
    required this.steps,
    required this.example,
    this.path,
    this.matches = const [],
    this.where,
  });

  final String id;
  final String title;
  final String group;

  /// One or two sentences: what it is for.
  final String what;

  /// Three to five things to do, in order.
  final List<String> steps;

  /// A concrete case, with made-up names.
  final String example;

  /// The page it lives on, when it has one ("Take me there").
  final String? path;

  /// Other addresses that show this lesson first (besides [path]).
  final List<String> matches;

  /// Where to find it when it is not a page of its own.
  final String? where;
}

const tutorialGroups = [
  'Getting started',
  'Writing',
  'Worldbuilding',
  'Planning the story',
  'Checking your work',
  'Working with others',
  'Making it yours',
];

const tutorialTopics = <Topic>[
  Topic(
    id: 'library',
    title: 'The Library',
    group: 'Getting started',
    path: '/',
    what:
        'Your novels as books on a shelf, each kept apart from the others. The book you were last in waits at the top.',
    steps: [
      'A new library starts with a sample novel, The Drowned Road, to look around in (Settings → Add the sample '
          'novel puts another copy on the shelf). Press New novel: type the title on the cover, the author under it, '
          'pick a colour, and press Begin chapter one to start writing. More details holds everything else.',
      'Press a book to open it, or Continue writing to go straight back to the chapter you left. The last lines you '
          'wrote there wait on the page above the button, and you land with the caret after the last word.',
      'Books stand on shelves by stage: Writing now, Ideas, Set aside, Finished. Choose Covers or Spines; press a '
          'spine to take the book off the shelf. On a phone, swipe a shelf sideways, or press See all.',
      'The Ideas shelf: Jot an idea shelves a new one in a line (“The Glass Road — a courier who cannot lie”). Ideas '
          'with no premise are counted above it, and Begin gives each a line, one card at a time. Start writing it '
          'makes an idea the book being written; with nothing being written, Draw an idea picks one for you.',
      'Use the ⋯ menu on a book to edit details (a cover too), pin, archive, duplicate, export a backup or delete. '
          'Search the shelf, and press Sort & filter for status, genre and order.',
    ],
    example:
        'Create “Ashfall” and give it a cover. It stands on the shelf as a book; tomorrow, Continue writing opens '
        'Chapter 18 where you stopped.',
  ),
  Topic(
    id: 'areas',
    title: 'Finding your way',
    group: 'Getting started',
    where: 'The rail on the left on wide screens; inside a book on a phone, the bar at the bottom (and More).',
    what:
        'The Library is the shelf, with the settings gear beside it. Open a book and its areas appear: Write, '
        'Organize, Plan, Visualize, Review and Progress.',
    steps: [
      'Open a novel from the Library: its areas appear in the rail, or in the bar at the bottom on a phone.',
      'Move between them with the rail or the bar (or Ctrl/⌘ and a number from 1 to 8); the tabs at the top of an '
          'area switch between its pages.',
      'The ribbon at the right edge of every page in the book holds its ribbons: marks in the pages you keep going '
          'back to (see Ribbons).',
      'On a phone, More opens the contents of the rest of the book. Under Search, or go anywhere, Loose ends: what the story is waiting '
          'for (today’s words, a thread gone quiet, a chapter with no plan, someone with no ties), each one press '
          'from its page. Then each area with what it holds now, drawn small: threads along the book, the web of ties, the '
          'last fortnight of writing. Library takes you back to the '
          'shelf.',
      'The gear beside the Library is Settings (or Ctrl/⌘ and comma from anywhere).',
    ],
    example: 'Press Ctrl/⌘+3 to go to Organize, then World to see every place and faction of “Ashfall”.',
  ),
  Topic(
    id: 'ribbons',
    title: 'Ribbons',
    group: 'Getting started',
    where: 'The silk ribbon at the right edge of every page inside a book.',
    what:
        'Silk bookmarks in the pages you keep going back to: a character, a chapter, the map. Kept on this device, not '
        'in the novel.',
    steps: [
      'On the page you want to keep close, press the ribbon at the right edge, then Lay a ribbon in this page.',
      'Give it a name: it offers the page’s own (the character, the chapter, “Calendar”). Press Lay the ribbon.',
      'From any page of the book, press the ribbon and then a ribbon to turn to its page; in Write, to its chapter.',
      'Press × on a ribbon to take it out. A book holds six, each in its own colour.',
    ],
    example:
        'Lay ribbons in Mira’s profile, Chapter 12 and the map of the Northern Reach: writing Chapter 13, each is one '
        'press away.',
  ),
  Topic(
    id: 'write',
    title: 'Writing a chapter',
    group: 'Writing',
    path: '/write',
    what: 'The editor. It saves as you type, never changes your words by itself, and works with no connection.',
    steps: [
      'Add a chapter (or a scene inside one) in the outline, and select it. Write on the page; its title is typed at '
          'the top. On a phone, Ch. 1 at the top lists every chapter, with Previous and Next.',
      'Beside the page (the panel button; on a phone, Desk) are notes: how the chapter before ends, this chapter\'s '
          'plan and beats, who is on the page and the threads that move here. A chapter with no words yet opens on '
          'them, under the first line, with a few ways in (or Plan this chapter); it goes with your first word.',
      'Below the page: today\'s words against your goal (tap it to choose 100, 250, 500 or 1,000 words a day, or '
          'your own number), the chapter\'s length and the save status. Press Sprint for 10 to 45 minutes of writing '
          'against a ring of time, with a card at the end saying what you wrote.',
      'Use the text button for font, size and spacing, and Ctrl/⌘+F to find and replace. While you type on a phone, '
          'bold, italic, lists and links wait in the ink tray on the keyboard. The pencil button (on a phone, in Desk) is the red pencil: '
          'echoes, long sentences and fillers are marked under the words (nothing is changed); press Echoes, Long '
          'sentences or Fillers to go to the next one.',
      'The frame button is focus mode: the line you write stays in the middle and the rest fades back (Typewriter '
          'turns that off). In a long chapter, the strip down the right edge is the whole chapter: tap or drag it to '
          'go anywhere.',
    ],
    example:
        'Type a scene, then press Ctrl/⌘+F to find every “Kael”. Close the app mid-sentence: the words are there when '
        'you come back.',
  ),
  Topic(
    id: 'daybook',
    title: 'The day book',
    group: 'Writing',
    where: 'At the head of the contents in Write (on a phone, Write opens on it).',
    what:
        'Every day you write leaves a mark, and coming back is one press. A note for next time and a nudge when you '
        'stall keep you going; none of it writes a word for you.',
    steps: [
      'At the head of the contents, the day book: five weeks of ink, a mark for each day you wrote (darker the more '
          'words), today ringed until it meets your goal, and the days in a row. Press Carry on to go back to the '
          'chapter with the caret after its last word, or Set a daily goal.',
      'Under it, the road to the draft: the manuscript’s length along a road past the first thousand words, a short '
          'story, a novelette and a novella to the whole draft, the next milestone named with how far it is.',
      'Under a chapter’s last line, press Leave a note for next time and write what happens next (leave the page '
          'after 100 words or more and it is offered). It waits pinned under the last line and in the day book; press '
          'Done with it when you are.',
      'Page gone still for 40 seconds? Stuck? A nudge offers a prompt: from the chapter’s plan, its last line, or a '
          'move writers make. Press Another, or Back to it; Don’t offer nudges turns them off.',
      'Press Share today’s page for the day as a card: the words, the goal and the days in a row. A line of today’s '
          'writing is on it only if you choose Include a line I wrote today.',
    ],
    example:
        'Write 600 words of Chapter 9 and leave the note “Mira finds the letter”. Tomorrow the day book shows two '
        'days in a row, and Carry on opens Chapter 9 with the note under its last line.',
  ),
  Topic(
    id: 'namekeys',
    title: 'Your names at your thumb',
    group: 'Writing',
    where: 'In the editor: over the keyboard on a phone; at the foot of the page on a computer.',
    what:
        'Your keyboard knows English, not your book. While you type, the names of your cast and world are offered as '
        'keys, spelled as you recorded them.',
    steps: [
      'Start a name with its capital: “Il”. The names that complete it come up over the keyboard (Ilse, Ilse '
          'Marrow), this chapter’s people first. Press one and the whole name goes in, in place of what you typed.',
      'On a computer they show at the foot of the page while you type a name; press Tab for the first.',
      'On a phone, with nothing typed yet, the keys are the names already on this page: press one to write it at '
          'the cursor.',
      'Names come from your characters (with their aliases and titles) and every entry in the world.',
    ],
    example:
        'Typing “Mi” in a chapter set in the woods offers Mimir Forest before Mira Vance. One press, and it is '
        'spelled right every time.',
  ),
  Topic(
    id: 'glance',
    title: 'Who was she again?',
    group: 'Writing',
    where: 'In the editor: over the keyboard on a phone; at the foot of the page on a computer.',
    what:
        'Her eyes, his age, who she is to him: put the caret on a name on the page and their card is there, without '
        'leaving the sentence.',
    steps: [
      'Tap into any name on the page: a character’s, a place’s, anything in your world. A strip shows their face, '
          'what they are, their first facts and a tie (“Wren Hollis’s mentor”).',
      'Press the strip for the whole card: the summary, every short fact you recorded (age, eyes, rank) and all '
          'their ties.',
      'Open their page goes to the profile, the chapter saved first. Typing a new name brings the name keys back.',
    ],
    example:
        'Halfway through a scene you forget Mira’s eye colour. Tap “Mira” in the line above: Age 34 · Eyes grey · '
        'Kai’s sister.',
  ),
  Topic(
    id: 'gaps',
    title: 'Write past a gap',
    group: 'Writing',
    where: 'On the page, and in the contents in Write (Gaps to fill, under the day book).',
    what:
        'Don’t stop to look up a name or a date: leave a gap and keep writing. Every gap stands out on the page, and '
        'the contents keep them all a press away.',
    steps: [
      'Type TK where something is missing (printers’ shorthand for “to come”), or a note in double square brackets: '
          '[[the name of the pass]]. Single brackets, as in a status window, are left alone.',
      'Or press Leave a gap (on a phone, in the ink tray over the keyboard): [[ ]] goes in at the caret, ready for '
          'your note. With words selected, they become the note.',
      'Each gap shows on the page as a sticky note. In the contents, Gaps to fill lists every one in the book, with '
          'its note or the words round it, and its chapter.',
      'Press a gap there: its chapter opens with the gap selected, so what you type fills it. Once filled, it leaves '
          'the list.',
    ],
    example:
        'Mid-chase, write “Mira rode to [[the name of the pass]]” and keep going. Tomorrow, Gaps to fill takes you '
        'straight there, and you type “Sorrow Gap” over it.',
  ),
  Topic(
    id: 'pagetools',
    title: 'Ways to see the page',
    group: 'Writing',
    where: 'In the editor: the buttons above the page (on a phone, in Desk).',
    what:
        'Other ways to look at a chapter: who speaks, how it sounds read aloud, how its sentences run and how it '
        'grew. Each one only reads; your words are never changed.',
    steps: [
      'Voices: each line of dialogue in its speaker’s colour from the cast, the telling faded back, and who has the '
          'floor; press a speaker to go to their lines. Put the voices away when you are done.',
      'Listen: the chapter read aloud by your device’s own voice, a sentence at a time from the caret, the one being '
          'read lit. Back a sentence, On a sentence, pause or change the pace; any key stops it.',
      'Rhythm: the chapter as a waveform, a bar for every sentence as tall as it is long, dialogue brighter than the '
          'telling. Runs that keep one beat are marked; press a bar to go to its sentence.',
      'Time-lapse: the chapter writing itself, from its first saved copy to now, each copy’s new paragraphs inked '
          'in. Press Play, or drag through it.',
      'Under the chapter’s heading, In this chapter shows who and what the page names, most mentioned first; press '
          'one to open their page. Today’s ink (in the text settings) marks each paragraph written or changed today.',
    ],
    example:
        'Turn on Voices in Chapter 4: Kael’s lines in blue, Mira’s in gold, and Kael has the floor. Then press Listen '
        'to hear the argument read aloud from where you are.',
  ),
  Topic(
    id: 'outline',
    title: 'The outline',
    group: 'Writing',
    where: 'In Write, the contents page beside the editor (on a phone, Write opens on it).',
    what:
        'The whole book as its contents page: parts, numbered chapters with their length, and scenes, each with a '
        'status. The chapter being written is marked with a ribbon.',
    steps: [
      'Add a part, then chapters inside it, then scenes inside a chapter.',
      'Use a line’s ⋯ menu to rename, move, duplicate, split, merge or delete it.',
      'Set each one’s status, from Idea to Published.',
      'Open a chapter’s plan for its objective, beats and who appears.',
      'Under a chapter’s last line, Continue to the next one; at the end of the book, Begin the next chapter.',
    ],
    example: 'Move “The Bell” from Act 1 to Act 2 and mark it Revising. Its text and notes move with it, untouched.',
  ),
  Topic(
    id: 'atmosphere',
    title: 'Writing weather',
    group: 'Writing',
    where: 'In the writing settings (the text button); on a phone, also in Desk → Atmosphere.',
    what:
        'Write in the room you want: rain, snow, fireflies, candlelight or a night sky around the page. Only the room '
        'changes; your words never do.',
    steps: [
      'Open the writing settings (on a phone, Desk → Atmosphere) and pick under Atmosphere: Rain, Snow, Fireflies, '
          'Candlelight or Stars.',
      'On a computer or a tablet it fills the desk around the paper, and lies faintly on the paper behind the words. '
          'On a phone, where the paper is the whole screen, it stays faint enough to read over.',
      'It holds still when your device asks for less motion, and None turns it off.',
    ],
    example:
        'Writing a storm scene late at night: choose Rain on a dark page, and the streaks run down the desk while the '
        'paper stays clear.',
  ),
  Topic(
    id: 'booksetting',
    title: 'Set like a book',
    group: 'Writing',
    where: 'On every page in Write; the switch is in the writing settings (the text button).',
    what:
        'Write on a page that looks like your printed book: each chapter opens on a raised initial and small '
        'capitals, and every scene break is an ornament.',
    steps: [
      'Open any chapter: its first letter stands large in the book’s heading face, the first few words after it in '
          'small capitals, as a printed chapter begins.',
      'Type a scene break as writers do, *** or * * * or # on a line of its own: it is set centred and spaced, in '
          'the book’s colour.',
      'Only the look changes: the words are saved and exported exactly as you typed them.',
      'Prefer a plain page? In the writing settings, turn off Set like a book.',
    ],
    example:
        'Chapter 4 begins “The bell had not rung in years”: the page shows a tall T and “he bell had not” in small '
        'capitals, and the *** before the second scene becomes a row of spaced stars.',
  ),
  Topic(
    id: 'titles',
    title: 'Name this chapter',
    group: 'Writing',
    where: 'In the editor, under the chapter’s heading, while it is called “Chapter 1” or Untitled.',
    what:
        'A chapter still called “Chapter 7” is offered names from its own pages. Nothing is made up, and nothing is '
        'named until you pick one.',
    steps: [
      'Write a few paragraphs in a chapter that has no name of its own yet.',
      'Under its heading, Name this chapter offers ideas: who or what is most on its pages, the thing this chapter '
          'has that the others have little of (“The Lamp”), and the phrase it ends on (“Towards the Inn”).',
      'Press one to make it the title; you can change it on the heading at any time.',
      'Happy with the number? Keep “Chapter 7”, and no more ideas are offered for it.',
    ],
    example:
        'Chapter 3 keeps returning to a lighthouse and ends “…and rowed out past the Breakers.” It is offered “The '
        'Lighthouse” and “Past the Breakers”.',
  ),
  Topic(
    id: 'storyboard',
    title: 'The storyboard',
    group: 'Writing',
    where: 'In Write, the contents: the storyboard button beside Add.',
    what:
        'The book as you revise it: under every chapter, the line it opens on, the line it ends on, and who is in it, '
        'read from your own text.',
    steps: [
      'In the contents, press Show the storyboard.',
      'Each chapter and scene shows OPENS (its first sentence) and ENDS (its last), the faces of those on its pages, '
          'most present first, and a rule as long as the chapter against the longest.',
      'Read down the openings, then the endings: does each chapter start on something, and stop on something that '
          'pulls the reader on?',
      'Press a chapter to write in it. Show the list puts the plain contents back; your choice is remembered.',
    ],
    example:
        'Three chapters in a row end on someone falling asleep. Seen together on the storyboard, the pattern jumps '
        'out: rewrite one ending as a door opening.',
  ),
  Topic(
    id: 'drafts',
    title: 'Alternate drafts',
    group: 'Writing',
    where: 'In the editor: the Alternate drafts button, next to Version history (on a phone, in Desk).',
    what:
        'Keep another version of a chapter or scene beside the one in the manuscript, and switch between them. Only '
        'the one in the manuscript is counted and exported.',
    steps: [
      'Press Alternate drafts, then Start a new draft.',
      'Name it, and start from a copy of the text or from a blank page.',
      'Write it. The text before is kept as a draft of its own.',
      'Switch back at any time with Put in the manuscript; neither draft is lost.',
    ],
    example:
        'Start “The gate stays shut” on a blank page for Chapter 12. Not convinced? Put “Main draft” back in the '
        'manuscript: both are still there.',
  ),
  Topic(
    id: 'history',
    title: 'Version history',
    group: 'Writing',
    where: 'In the editor: the Version history button (on a phone, in Desk).',
    what:
        'Earlier versions of a chapter are kept, so nothing is lost: compare any of them with the text now, and bring '
        'one back.',
    steps: [
      'Open a chapter and press Version history.',
      'Press Save a version before a big rewrite, and give it a name.',
      'Choose a version to see the paragraphs added, removed and changed since.',
      'Restore it if you want it back; the text now is kept in history first.',
    ],
    example: 'Save “Before the duel rewrite”, rewrite the duel, then compare. Not happy? Restore the old one.',
  ),
  Topic(
    id: 'read',
    title: 'Read as a book',
    group: 'Writing',
    path: '/write/read',
    what:
        'Your manuscript as a reader would meet it: a printed novel, an ebook or a web serial. Nothing can be edited '
        'there.',
    steps: [
      'Open Read as a book from the outline’s menu.',
      'Switch between Standard novel, Ebook and Web serial.',
      'Change the typeface, size, spacing and colours to taste.',
      'Turn pages with the arrow keys, swipes or buttons; open the contents to jump.',
    ],
    example: 'Choose Ebook in a phone’s frame: Chapter 3 runs to 15 pages, and the scene break falls on page 7.',
  ),
  Topic(
    id: 'book',
    title: 'Book details and publishing',
    group: 'Writing',
    path: '/write/book',
    what:
        'The pages around your story (dedication, epigraph, copyright, about the author) and the files a reader gets.',
    steps: [
      'Open Book details and fill in what the book needs.',
      'Choose the mark between scenes.',
      'In Read as a book, press Publish for an EPUB, a serial’s chapters or one chapter as a page.',
      'Check the list of what will be in it before it is made.',
    ],
    example: 'Add the dedication “For the patient.” It appears on its own page in Read as a book and in the EPUB.',
  ),
  Topic(
    id: 'search',
    title: 'Search the whole novel',
    group: 'Writing',
    where: 'Ctrl/⌘+K anywhere, the search button at the top of the rail, or More → Search, or go anywhere on a phone.',
    what:
        'Finds a word across chapters, plans, notes and records, and goes anywhere by name: a page, a chapter, a '
        'character, a thread, a keepsake.',
    steps: [
      'Press Ctrl/⌘+K. Before you type, it lists where you were.',
      'Type a page or a name: Go to lists the places that answer it (“plot” is Plot lanes, “stats” Analytics, '
          '“dark” the look). Return goes to the first.',
      'Below, the words found in the text. Narrow them with the chips: manuscript, plans and notes, or records.',
      'Choose a result: a chapter opens with the words found; a record opens its page.',
    ],
    example: 'Type “trai” and Return: the trailer plays. Type “silver key” for the chapters it is in.',
  ),
  Topic(
    id: 'export',
    title: 'Import and export',
    group: 'Writing',
    path: '/settings/import-export',
    what: 'Bring a manuscript in, and take yours out as Word, PDF, Markdown, text or a web page. Backups are separate.',
    steps: [
      'Open Settings → Import & export (also in the outline’s menu).',
      'Choose Export manuscript, a format, and what to include.',
      'Import a .docx, .rtf, .txt or .md file and check its chapters before adding them.',
      'For a copy of everything, export a backup from the Library instead.',
    ],
    example: 'Export chapters 1 to 5 as Word for a reader, and a backup of the whole novel for yourself once a week.',
  ),
  Topic(
    id: 'characters',
    title: 'Characters',
    group: 'Worldbuilding',
    path: '/organize',
    matches: ['/organize/character'],
    what: 'Your cast: a library to find characters in, and a profile for each with sections you shape yourself.',
    steps: [
      'An empty cast is a playbill: name the hero, who stands against them and who stands by them, and press Raise '
          'the curtain. While the cast is three or fewer, the hero stands on a stage among empty chairs, each a '
          'question (Who taught Wren?): press one and write a name, and they join the cast already tied.',
      'Press New character and write them in a line (“Mira Vance, 34, a smuggler from Glass River, Kai’s sister”). '
          'Age, gender, work, hometown and ties to the cast are recorded from it, and listed before you create them.',
      'On the profile, add sections and fields, or press Interview for questions, one at a time, that fill it in. '
          'Each card says how well you know them (Known 4 of 11). With no picture, they are a cameo drawn from their '
          'profile: gender sets the hair, old age silvers it, an elf has pointed ears.',
      'Use the profile’s tabs for relationships, secrets, notes, history and progression.',
      'To find someone, type in Search the cast (name, alias or tag), pick a role, and switch between Cards, List, '
          'Ties and Orbit. On a phone they are one row under the search; Arrange the cast holds In what order and '
          'Show only.',
    ],
    example:
        'Create “Kaelen Draven”, role Protagonist, with the epithet “The Oathbreaker”. Searching “oathbreaker” finds '
        'him.',
  ),
  Topic(
    id: 'bookstory',
    title: 'Your book so far',
    group: 'Getting started',
    where: 'Under More, at the top: So far.',
    what:
        'Your novel told back to you as a short story in pages, the way a year in music is: your words, your days, '
        'your people and the words you lean on. Each page is a picture to share.',
    steps: [
      'Open More and press So far.',
      'Press the right side of the screen (or swipe) to turn the page, the left to go back: what you have written, '
          'the days you wrote it on, your biggest chapter, who your book is about, who talks most, the words you lean '
          'on, where it begins and where it stands.',
      'Share this page makes a picture of the page you are on, the shape of a story post.',
      'The last page says what comes next on the road to the draft; Keep writing takes you back to your chapter.',
    ],
    example:
        'Forty days in: 31,200 words, 22 days at the desk, a best day of 3,100 words, and your lead named 410 times. '
        'Share the words you lean on and see if your readers guess the book.',
  ),
  Topic(
    id: 'fingerprint',
    title: 'Your book’s fingerprint',
    group: 'Getting started',
    where: 'Under More, at the top: Fingerprint, beside So far.',
    what:
        'Your whole novel as a print: a column a chapter, a thread a paragraph, in the colour of the character it is '
        'about. No two books make the same one.',
    steps: [
      'Open More and press Fingerprint.',
      'Each chapter hangs as a column, as long as the chapter. Each paragraph is a thread in the colour of the character '
          'named most in it, or of whoever the scene was with; bright where someone speaks, softer where it tells.',
      'Under it, whose colour is whose, the most present first. Read it for whose book it is, where each one’s scenes '
          'fall, and how much of it is talk.',
      'Share the print makes a picture of it, 1080 by 1350, to post.',
    ],
    example:
        'Your fingerprint shows the antagonist’s colour vanishing for six chapters in the middle: a sign to bring them '
        'back on the page sooner.',
  ),
  Topic(
    id: 'index',
    title: 'The index',
    group: 'Checking your work',
    where: 'Under More, below Search: The index.',
    what:
        'Every name in your book, A to Z, as the index at the back of a printed book: the chapters each is in, and '
        'names spelled two ways, caught before a reader does.',
    steps: [
      'Open More and press The index.',
      'Names are gathered from your pages: words written with a capital where no sentence begins (“the Mimir Forest”, '
          '“Wren Hollis”). Each shows how often it appears and the chapters it is in; press a chapter to read it there.',
      'Spelled two ways? at the top sets names a letter apart side by side (Tobias and Tobiah). If they are one name, '
          'press See to go to the rarer one and fix it.',
      'Use the letters along the top to jump through it.',
    ],
    example:
        'Chapter 12 says “Tobias” once; the other 53 times it is “Tobiah”. The index flags it, and See “Tobias” opens '
        'Chapter 12 at the word.',
  ),
  Topic(
    id: 'jacket',
    title: 'The full jacket',
    group: 'Getting started',
    where: 'Under More, at the top: swipe the keepsakes to Full jacket.',
    what:
        'See your novel as a printed book: the back, the spine and the front, laid out flat as a printer lays out a '
        'cover, ready to share.',
    steps: [
      'Open More, swipe the row of keepsakes and press Full jacket.',
      'The front is your cover as the Library shows it; the spine is as thick as your pages, your title running down '
          'it; the back sets a line from your book large, then your synopsis (or your opening), the kind of novel, '
          'your name and a barcode.',
      'Fill in the synopsis, the genre and the author in Book details, and the back says them.',
      'Share the jacket makes a picture of it to post.',
    ],
    example:
        'At 90,000 words the spine is thick enough to read across a room; the back quotes “Master, it’s the tide '
        'bell,” over your synopsis.',
  ),
  Topic(
    id: 'bestlines',
    title: 'Your best lines',
    group: 'Getting started',
    where: 'Under More, at the top: the keepsakes, Best lines.',
    what:
        'The sentences of your book most worth quoting, found in your pages, each a card to share the way authors '
        'post their lines.',
    steps: [
      'Open More and press Best lines. Swipe through twelve cards, the best first.',
      'They are chosen for what stays with a reader: a turn (but, yet, a dash), the sound of a truth (never, every), '
          'the senses (salt, stone, bells), an echo; never business like “he walked to the door”.',
      'Dress a card as Paper, Night or The book (your book’s own colour).',
      'Share this line makes a square picture of it; Read it there opens the chapter at the line.',
    ],
    example: '“The sea does not care how excited you are.” Chapter 4, on paper, ready to post.',
  ),
  Topic(
    id: 'todayfromyourbook',
    title: 'Today from your book',
    group: 'Getting started',
    where: 'Under More, above the keepsakes: Today from your book.',
    what: 'A card made from your book that is new each day, so the contents are never the same twice.',
    steps: [
      'One day, a line of the day: one of your best lines, on paper. Read it there, or All your best lines.',
      'The next, a question of the day from the book quiz: press a choice to answer it there. Play the whole quiz '
          'for ten.',
      'The next, your book in numbers: its words, chapters and people, and how long it takes to read. See it told '
          'as a story.',
      'Then round again, with another line and another question.',
    ],
    example: '9,645 words · 15 chapters · 8 characters · 39 minutes to read.',
  ),
  Topic(
    id: 'beforeareader',
    title: 'Before a reader sees it',
    group: 'Getting started',
    where: 'Under More, above the keepsakes: Before a reader sees it.',
    what:
        'The slips a proofreader would mark, over the whole book, so a draft can go to a beta reader or an agent '
        'without them.',
    steps: [
      'Open More: the card says how many there are, and of which kinds, or that the book reads clean.',
      'Name slips (a word a letter off a name), doubled words, a past form after “didn’t”, a line of speech never '
          'closed, straight quotes in a book of curly ones, spacing, a sentence starting small, a chapter with no '
          'title.',
      'Press the card for the list: each in its sentence, the slip marked in red. Show one kind at a time.',
      'Read it there opens the chapter at it. Nothing changes your words: you put each right yourself.',
    ],
    example: '“With that the waitress left and didn’t looked back.” After “didn’t”, the plain verb: “look”?',
  ),
  Topic(
    id: 'contentsparts',
    title: 'More, in parts',
    group: 'Getting started',
    where: 'Under More: the strip of parts under Search, and a heading for each part.',
    what: 'More is laid out as a book’s contents are, in four parts, each a press away.',
    steps: [
      'Part one, Today: the card of the day, and the loose ends the story is waiting for.',
      'Part two, Before it goes out: what a proofreader would mark, and the submission kit.',
      'Part three, Made from the book: the keepsakes, and the shelf.',
      'Part four, The book: Plan, Visualize, Review and Progress, each with what it holds now.',
      'The strip of parts stays at the top as you scroll: press Today, Polish, Keepsakes or The book to go there.',
    ],
    example: 'Press Polish: Before it goes out comes to the top, under the strip.',
  ),
  Topic(
    id: 'submissionkit',
    title: 'The submission kit',
    group: 'Getting started',
    where: 'Under More, under Before a reader sees it: Send it out.',
    what: 'What an agent or a publisher asks for, how far your book has come, and a query letter laid out for it.',
    steps: [
      'Open More: the card says how many of the six are ready, and which is next.',
      'A title, your name, a genre; a length the genre expects (fantasy usually runs 90,000 to 120,000 words); a '
          'synopsis of about a page; opening chapters with nothing a proofreader would mark.',
      'Each that is not ready says how to make it so: Edit the book’s details, or See the slips. Once the opening is '
          'clean, Make the sample pages.',
      'Under the list, the query letter, from your title, genre, length and synopsis. The marked parts (the agent’s '
          'name, books like yours, a few lines about you) are yours to write.',
      'Copy the letter, or Save it as text.',
    ],
    example: 'Submission kit: 4 of 6 ready. Next: a length the genre expects.',
  ),
  Topic(
    id: 'keepsakeshelf',
    title: 'The keepsake shelf',
    group: 'Getting started',
    where: 'Under More, above the keepsakes: See the shelf.',
    what: 'Everything your book can be made into, all at once: each keepsake standing on a wooden shelf.',
    steps: [
      'Open More. The keepsakes row says how many you have not opened yet, and those come first.',
      'One not yet opened wears a gold ribbon, NEW, until you open it.',
      'Press See the shelf for all of them at once, a few to a shelf. Press one to open it.',
    ],
    example: 'KEEPSAKES · 7 new, and on the shelf the quiz, the postcards and the trailer still wear their ribbons.',
  ),
  Topic(
    id: 'gazette',
    title: 'The Gazette',
    group: 'Getting started',
    where: 'Under More, the first of the keepsakes: The Gazette.',
    what: 'Every chapter of your book as the front page of its world’s newspaper, an edition a chapter.',
    steps: [
      'Open More and press The Gazette. It opens on the latest edition; swipe, or the arrows, for earlier ones.',
      'The paper is named for the place your book names most, like The Old Merrow Gazette.',
      'The headline is the chapter’s title, with its best line beneath, and its opening is the lead story.',
      'At the foot: what was said about town and who said it, the weather the chapter’s words bring, and who is in '
          'the news.',
      'Print it makes a picture of the page; Read it there opens the chapter. Under the last edition, tomorrow’s '
          'paper is blank: Keep writing.',
    ],
    example: 'The Old Merrow Gazette, chapter 15 edition: THE FULL MAP. Weather: a long night, and a clear one.',
  ),
  Topic(
    id: 'postcards',
    title: 'Postcards',
    group: 'Getting started',
    where: 'Under More, among the keepsakes: Postcards.',
    what: 'Each place in your book as a vintage postcard: greetings from the front, a line of your book on the back.',
    steps: [
      'Open More and press Postcards. Swipe through the places in the order your book first names them.',
      'The places are your world’s locations, and the places your pages name that are not kept yet, like the Mimir '
          'Forest or the Kingdom of Aldia.',
      'The front is painted from what the place is (the sea, trees, peaks, roofs, a tower, a lighthouse), in its own '
          'light.',
      'Tap a postcard, or Turn it over, for the back: the line your book sets there, its chapter, a stamp and the '
          'postmark.',
      'Send it makes a picture of the side showing; Read it there opens the chapter at the line.',
    ],
    example: 'Greetings from Hollow Light: a lighthouse in a storm, and on the back, chapter 15.',
  ),
  Topic(
    id: 'bookquiz',
    title: 'The book quiz',
    group: 'Getting started',
    where: 'Under More, at the top: the first of the keepsakes, Quiz.',
    what:
        'How well do you know your own book? Ten questions made from your pages. Play it yourself, or hand the phone '
        'to a reader.',
    steps: [
      'Open More and press Quiz.',
      'Who said it? A line someone says, and the cast to choose from. Which chapter? A line, and four chapters.',
      'The missing word: a line with a word taken out. Which comes first? Two lines from far apart in the book.',
      'Press a choice: it says whether you were right and where the line is; Read it there opens the chapter at it.',
      'After the last, See your score: your score as a card. Share your score makes a square picture; Play again '
          'asks other lines.',
    ],
    example: 'At the third stone, they ______. stopped, chapter 6 · First Marker.',
  ),
  Topic(
    id: 'sampler',
    title: 'The sampler',
    group: 'Getting started',
    where: 'Under More, at the top: the keepsakes, Sampler.',
    what:
        'The opening of your book as a reader’s sample, a PDF to send to a beta reader, a writing group or an '
        'agent.',
    steps: [
      'Open More and press Sampler. Swipe through its pages as they will print.',
      'The title page has your title, your name, your best line and your synopsis (from the book’s details).',
      'Then your first chapters, each on a new page, until a reader has enough to judge: about 1,500 words, three '
          'chapters at most.',
      'The last page says how much more there is. Make the PDF saves it, ready to send.',
    ],
    example: 'The Drowned Road: a title page, the first 3 chapters, 1,947 words, about 8 minutes to read.',
  ),
  Topic(
    id: 'trailer',
    title: 'The trailer',
    group: 'Getting started',
    where: 'Under More, at the top: the first of the keepsakes, Trailer.',
    what:
        'Watch your novel cut as a film trailer, from its own lines and the names it is about, and end on a poster '
        'to share.',
    steps: [
      'Open More and press Trailer. It plays between black bars, a shot at a time; press anywhere to cut to the next.',
      'The lines are your own: short ones, questions, cries, things said aloud, never from your last pages. The '
          'names are the people you write about most, and the line that lands hardest comes last, before the title.',
      'It ends on the poster: the names, that line, the title and COMING SOON. Skip to the poster goes straight there.',
      'Share the poster makes a picture of it to post; Play again runs it once more; Keep writing takes you back.',
    ],
    example:
        '“Is the water going?” … WREN HOLLIS … “Wren, what is that?” … THE DROWNED ROAD. Then the poster, ready to '
        'post.',
  ),
  Topic(
    id: 'looks',
    title: 'Checked against your pages',
    group: 'Worldbuilding',
    where: 'On every character’s profile, the Overview tab: Checked against your pages.',
    what:
        'The profile says grey eyes; chapter 7 says “her blue eyes”. Their looks as your chapters describe them are '
        'set beside what you recorded, so a slip is caught before a reader catches it.',
    steps: [
      'Open a character: their eyes and hair as your chapters give them are checked against the profile.',
      'A slip shows the chapter and the words. Read it there to fix the page, or press Make it… to put the profile '
          'right instead.',
      'A look the page gives and the profile lacks is offered to record (Record black): your profile fills itself '
          'from your book.',
      'Only looks that are theirs count: “Wren’s grey eyes”, or Wren the subject (“Wren pushed back her hair”); '
          'never someone else’s in the same sentence.',
    ],
    example:
        'Ilse’s profile says her eyes are brown. Chapter 9 has “Ilse’s grey eyes narrowed.” The profile flags it, '
        'and Read it in Chapter 9 takes you to the line.',
  ),
  Topic(
    id: 'theirvoice',
    title: 'Their voice',
    group: 'Worldbuilding',
    where: 'A character’s profile, under In their own words, once they have five lines or more.',
    what:
        'How a character talks, measured from their lines and set against the rest of the cast: so no two of them '
        'sound the same.',
    steps: [
      'Write dialogue as you do, tied to its speaker (“Go,” Wren said). Their lines are counted from the book.',
      'Meters show words a line, questions, exclamations, contractions and word length, a tick for the cast’s average.',
      'What sets them apart is said (“Asks more than the others”), and the words that are theirs and no one else’s.',
      'It names whom they sound most like, and says so plainly when a reader could not tell the two apart.',
    ],
    example: 'Wren: 6.6 words a line, 8% questions; her words “master”, “bell”, “tide”. Sounds most like Tobiah Fenn.',
  ),
  Topic(
    id: 'thisorthat',
    title: 'This or that',
    group: 'Worldbuilding',
    where: 'A character’s profile, at the top: This or that.',
    what:
        'A character’s temperament a quick choice at a time: quiet or loud, planner or improviser, head or heart. '
        'Sixteen cards, into their Core Traits.',
    steps: [
      'Open a character and press This or that.',
      'Each card asks one thing and holds two answers: swipe the card towards one, or press it. Skip passes; Back '
          'returns.',
      'What their Core Traits already say is chosen when its card comes up; choose again and the other word takes '
          'its place.',
      'At the end, their compass: where they fell on each. Keep these traits writes them in; other traits stay.',
    ],
    example: 'Wren: loud, an improviser, head, bold, honest. Thirty seconds, and her Core Traits are written.',
  ),
  Topic(
    id: 'castcheck',
    title: 'The cast, checked',
    group: 'Worldbuilding',
    path: '/organize',
    where: 'Organize, Characters: under the cast photograph, once the book has three chapters or more.',
    what:
        'What an editor would ask of your cast, read from where each of them is in the book: who the book forgets, '
        'who goes quiet, who is always together, who is light.',
    steps: [
      'A principal the book forgets: a lead or supporting character in a fifth of the chapters or fewer.',
      'Gone quiet: in a stretch of chapters, then gone long before the end. A thread left hanging?',
      'Always together: two (neither a lead) on the same pages every time. Could they be one character?',
      'Light enough to cut: in one chapter and tied to no one. Press a face to open them; Not now sets a note aside.',
    ],
    example: '“Nan Ottilie is in chapters 3 to 8, then gone: 7 chapters without them.” Bring her back, or let her go.',
  ),
  Topic(
    id: 'waitingname',
    title: 'Waiting for a name',
    group: 'Worldbuilding',
    path: '/organize',
    where: 'Organize, Characters: above the names in your manuscript, when your pages have someone without a name.',
    what:
        'The people your pages keep coming back to without naming them (“the waitress”, “the old guard”): a character '
        'in all but name, named in a press.',
    steps: [
      'Write as you do. Someone mentioned twice or more as “the waitress”, “the captain”, “a guard” is listed, with '
          'how often, where, and the sentence.',
      'Name them opens the name forge; Write a name asks for one. Either makes them a character.',
      'They keep “the waitress” as their title and alias, so every mention in your pages is theirs, and “Waitress” '
          'as their Occupation.',
      'Not a character sets one aside. Those the cast already is (their title, occupation, summary) are left out.',
    ],
    example: '“The waitress” 3 times in chapter 1. Name them: Mira, the waitress, and all 3 mentions are hers.',
  ),
  Topic(
    id: 'fromyourpages',
    title: 'The cast first',
    group: 'Getting started',
    where: 'Organize, Characters: From your pages, under the cast photograph.',
    what: 'The cast comes first; what the pages say about it is counted at the top and kept under the cast.',
    steps: [
      'Under the photograph, From your pages: a note for each kind with something to say, and how many.',
      'Pairs often together with no tie, notes on the cast, people waiting for a name, names in your pages not in the '
          'cast yet.',
      'Then the search, the views and the cast itself, on the first screen.',
      'Press a note to go to it, under the cast. Deal with one and its count goes down.',
    ],
    example: '15 pairs often together · 1 note on the cast · 1 waiting for a name · 2 names in your pages',
  ),
  Topic(
    id: 'nameboard',
    title: 'The name board',
    group: 'Getting started',
    where: 'Organize, Characters: the Names view, the last of the views.',
    what:
        'Every name in your book on a board of the alphabet, the names a reader could take for one another, and the '
        'letters still free.',
    steps: [
      'Choose Names. Each letter shows how many names start with it, shaded as it fills, gold when crowded (three or '
          'more).',
      'Press a letter for its names; press a name to open its page.',
      'Look-alikes: two names one letter apart (Marrow and Merrow), beginning and ending alike, or with the same first '
          'three letters. A surname a family shares is left alone.',
      'Free letters: no name begins with them yet. Forge a name for the next character, and they join the cast.',
    ],
    example: 'Bell · Vell, one letter apart: Merrow’s Bell Tower and Vell.',
  ),
  Topic(
    id: 'whoseeyes',
    title: 'Whose eyes',
    group: 'Getting started',
    where: 'Organize, Characters: the Eyes view, beside Roll call.',
    what: 'Whose eyes each chapter is told through, read from who thinks, feels and notices in it.',
    steps: [
      'Choose Eyes. The book is a ribbon, a band a chapter, as wide as it is long, in the colour of the one it is told '
          'through.',
      'Press a band: the chapter, through whom, and the sentence that shows it (“Tobiah saw it first.”). Read it there '
          'opens the chapter.',
      'Under it, each one the book is told through, with their chapters and their share of it; first person and unclear '
          'chapters on their own.',
      'Then what it means: the longest run through the same eyes, and anyone not seen through for a while.',
    ],
    example: 'Tobiah Fenn has not been seen through for 11 chapters, since chapter 4.',
  ),
  Topic(
    id: 'rollcall',
    title: 'The roll call',
    group: 'Worldbuilding',
    path: '/organize',
    where: 'Organize, Characters: the Roll call view (the table), last of the views.',
    what:
        'The whole cast as one table of the basics (age, gender, species, occupation, what they want), written in '
        'place: no profile to open.',
    steps: [
      'Press Roll call. Each character is a row, their name and role pinned at the left; the columns scroll sideways.',
      'A blank is a cell to fill: write in it and it is kept in that character’s profile, in the field that holds it.',
      'What is already written shows, and can be changed in place. The line at the top counts what is filled.',
      'Press a name to open their whole profile.',
    ],
    example: 'Eight characters, forty blanks: two minutes down the Age and Gender columns, and the cast is sketched.',
  ),
  Topic(
    id: 'stakes',
    title: 'The stakes',
    group: 'Worldbuilding',
    path: '/organize',
    where: 'Organize, Characters: the Stakes view (the flag), beside Cards, List, Ties and Orbit.',
    what:
        'The cast by what drives them: what each wants, what stands in the way, what is at stake, and where they '
        'end; and where their wants collide.',
    steps: [
      'Press Stakes. Each character is a card: Wants, In the way, At stake, Ends, from whichever profile field '
          'answers it (What they want, Initial Goals, External Conflict, Intended Resolution…).',
      'What is not answered yet is asked: “What does Wren want?” Press it, write a line, Keep: it is in their profile.',
      'Where they collide: two whose wants name each other, one in the other’s way, or both after the same thing.',
      'The line at the top says how many of them you know the wants of.',
    ],
    example: 'Wren wants to finish the chart; Sefa wants a chart for the Guild: Both want “chart”. That is a scene.',
  ),
  Topic(
    id: 'drawface',
    title: 'Draw their face',
    group: 'Worldbuilding',
    where: 'A character’s profile, under their portrait: Draw their face.',
    what:
        'A character with no picture is a cameo drawn from their profile: their hair, eyes and skin, and what marks '
        'them. Draw it in a few presses.',
    steps: [
      'Open a character and press Draw their face.',
      'Choose their hair (its colour, and bald, cropped, short, shoulder-length, long or braided, curly or not), their '
          'eyes and their skin; and what marks them: a beard, glasses, a scar, an eyepatch, freckles, a hood, a crown.',
      'The cameo changes as you choose. Keep this face writes it into their Appearance fields as words.',
      'Or write it yourself: Hair “Long, curly black”, Eyes “Green”, a scar in Distinguishing Features. The cameo is '
          'drawn from the words, everywhere they appear. Nothing unsaid is guessed.',
    ],
    example: 'Wren: braided red hair, green eyes, freckles. Now she is herself in the cast photograph.',
  ),
  Topic(
    id: 'charactercard',
    title: 'Share their card',
    group: 'Worldbuilding',
    where: 'On every character’s profile, at the top: Share their card.',
    what:
        'Your character as a card to post, the way writers share their people: their face, name, role, facts and '
        'ties, and a line they say in your book.',
    steps: [
      'Open a character and press Share their card.',
      'The card is made from what you recorded: their picture or cameo on their own colour, their epithet and role, '
          'the short facts, a tie or two (“Ilse Marrow’s student”), and the book’s name.',
      'A line they say quotes them from your chapters; turn it off to show their summary instead.',
      'Press Share: on a phone, the share sheet; on a computer, a picture saved where you choose. 1080 by 1350, the '
          'shape of a post.',
    ],
    example:
        'Wren’s card: “the apprentice”, Protagonist, Ilse Marrow’s student, and below, “Master, it’s the tide bell.”',
  ),
  Topic(
    id: 'forge',
    title: 'Forge a name',
    group: 'Worldbuilding',
    where: 'Beside the name when you add a character (New character), and under the name of any World entry.',
    what:
        'New names in the shape of old ones: your book’s own, or a tradition’s. None is a name it learned from, and '
        'nothing is named until you pick one.',
    steps: [
      'Press Forge a name beside a new character’s name, or under a place’s name in the World.',
      'Choose A person or A place, and a tradition: Like your book (once it has six names to learn from), Old '
          'English, Norse, Latin, Lyrical, Desert or Steppe. Places take the tradition’s endings (-ford, -vik, -ium).',
      'Type a letter or two under Starts with, if you like. Press More names for another dozen.',
      'Press a name to use it. You can still change it afterwards.',
    ],
    example:
        'Your cast is Wren, Ilse, Tobiah and Ottilie. Like your book offers Quilis, Ottilse and Marden: new, but they '
        'sound as if they live in the same town.',
  ),
  Topic(
    id: 'cast',
    title: 'The cast in your pages',
    group: 'Worldbuilding',
    where: 'In Organize → Characters, and on every character’s profile.',
    what:
        'Your chapters already know your cast: each character is found in them by name, with nothing to link, and what '
        'the book says of them is a press away.',
    steps: [
      'Characters are found by their name, a part of it that is theirs alone, an alias or a title (“the Provost”). '
          'The line under each card ticks every chapter, lit where they are. Names you keep writing that are nobody '
          'yet wait at the top: Add them, or Not a character.',
      'On a profile, In their pages quotes the sentence each chapter first names them in; In their own words, the '
          'lines they say (“…,” Wren said). A press on either opens the chapter there.',
      'Together on the page, at the top of the cast, names the pairs the book keeps side by side with no tie: How '
          'are they tied? records one in a press, Not tied sets it aside. In Ties, a “+” between two does the same.',
      'Orbit sets the cast round the protagonist like planets: principals close in, the minor cast further out, those '
          'not on the page yet in the wings. The larger, the more chapters; the ring round each, how well you know '
          'them. Under it, the one to interview next.',
      'At the top, the whole cast stands for a photograph, the principals in front: press anyone to open them.',
    ],
    example:
        'Write “the Provost” through Chapter 6 and give Aldous Crane that title: his card lights Chapter 6, and In '
        'their pages quotes the line.',
  ),
  Topic(
    id: 'world',
    title: 'The world',
    group: 'Worldbuilding',
    path: '/organize/world',
    matches: ['/organize/world/entry'],
    what:
        'Your world’s encyclopedia: places, factions, items, powers, lore and kinds of your own, each with its fields.',
    steps: [
      'An empty world opens on its first page: name a place, who holds power, what everyone wants, fears and '
          'remembers, and press Begin this world. Later, press New entry and choose a category.',
      'Found in your pages, at the top, offers what your chapters name but the world does not hold yet (“the Mimir '
          'Forest”, “the Smart Atoms skill”): add it as a place, a power or whatever it is in a press, or set it '
          'aside with Not an entry.',
      'Fill in an entry’s summary and fields, and connect it to other records (“seated in”, “member of”) under Every '
          'connection. In the editor, select a name and link it to its entry.',
      'Each category is a volume on the shelf: press one to read only its entries, and a letter to jump to it. The '
          'line under an entry lights the chapters it is in, linked or named.',
      'The whole world opens on its chart: each place an island (the larger, the more chapters it is in), the places '
          'inside it within its shore, and what is linked to it as seals on the shore. What belongs to no place floats '
          'adrift below; press one to say where it belongs.',
    ],
    example: 'Create the faction “Ash Guild” and connect it to the place “Emberfall” as “seated in”.',
  ),
  Topic(
    id: 'kinds',
    title: 'Categories & fields',
    group: 'Worldbuilding',
    path: '/organize/world/kinds',
    what: 'The kinds of record your world has and the fields each one holds. Add your own, or start from a preset.',
    steps: [
      'Open World → Categories & fields.',
      'Add a category, or one from a preset.',
      'Add fields: text, number, date, a choice, a link to another record, and more.',
      'Say which fields the views read: a date for the timeline, a rank, a place on a map.',
    ],
    example: 'Add the category “Spells” with the fields School (a choice), Cost (a number) and Taught by (a link).',
  ),
  Topic(
    id: 'systems',
    title: 'Systems',
    group: 'Worldbuilding',
    path: '/organize/systems',
    what: 'Design the rules of a magic, levelling or power system: attributes, formulas, levels, classes and skills.',
    steps: [
      'Pick a card: LitRPG, Cultivation, Hard magic or Superhero. Each shows a sheet in it as it would look (a '
          'status window, a cultivation record, an arcane ledger, a threat dossier, its numbers worked out by the '
          'system itself) and its ranks; press Begin with it, or Begin blank. When your chapters already speak of '
          'one (levels, skills, stats), your book’s own system comes first, your hero’s status window holding the '
          'skills you wrote: press Begin with your book’s system.',
      'A system has two halves, switched at the top: In the story (its window, the climb, the face-off, the ledger, '
          'what the pages name) and The blueprint (its rules and sheets). A system just begun opens on its blueprint.',
      'In The blueprint, define attributes and resources, then levels or named stages.',
      'Add groups such as classes and skills, with what they need.',
      'Give a character a sheet, and record what changes chapter by chapter.',
    ],
    example: 'Set Health = Vitality × 10. Give Kael Vitality 14: his sheet shows Health 140. At 15, it is 150.',
  ),
  Topic(
    id: 'livewindow',
    title: 'The window',
    group: 'Worldbuilding',
    path: '/organize/systems',
    where: 'Organize, Systems: under the system’s name, first.',
    what:
        'Your system’s status window as the story would show it: a character’s sheet as it stands, live, in its own '
        'dress. Share it as a picture.',
    steps: [
      'Open Systems: the window shows the first character with a sheet (choose another above it), or, with none yet, '
          'a hero as a sheet would begin.',
      'It is worked out as it is drawn: their level from the experience logged, their stats, what their class and '
          'skills add, what they hold.',
      'Change the system in the tabs below (a stat renamed, a formula, a starting value) and the window changes at once.',
      'Share the window makes a picture of it to post.',
    ],
    example: 'A cultivation system shows a jade record: Qi Condensation, 100 qi, [Azure Breathing] MORTAL.',
  ),
  Topic(
    id: 'faceoff',
    title: 'The face-off',
    group: 'Worldbuilding',
    path: '/organize/systems',
    where: 'Organize, Systems: under the climb, once two characters have sheets in the system.',
    what:
        'Two characters’ sheets side by side, stat by stat: who would win? Is your antagonist still ahead, is the '
        'rival keeping pace?',
    steps: [
      'Give two characters sheets in a system. The face-off sets them either side of VS, in the system’s own dress.',
      'Each number both have is a bar out to each side, the leader’s lit: levels, stats, resources, what follows.',
      'Beneath: who leads in how many, the widest gap, and what each holds that the other does not.',
      'Swap sides, or choose others when there are more. Share the face-off makes a picture of it.',
    ],
    example: 'Aldous Crane leads in 5 of 13; Wren Hollis only in Agility. The widest gap: Strength, 25 to 10.',
  ),
  Topic(
    id: 'climb',
    title: 'The climb',
    group: 'Worldbuilding',
    path: '/organize/systems',
    where: 'Organize, Systems: under the window, once a sheet has experience logged against chapters.',
    what:
        'How fast a character rises: their level chapter by chapter, by your system’s own curve, and where the pace '
        'leads. Too fast, nothing is earned; too slow, nothing happens.',
    steps: [
      'Log experience on a character’s sheet (Sheets, Levelling), each with the chapter it was earned in.',
      'The climb draws their level at the end of each chapter, solid, and carries it on dashed at the pace so far, '
          'the cap ruled across the top.',
      'It says where the pace leads: their level when the chapters written end, the next round level, the cap.',
      'A chapter that gives far more than the others is named. Choose another character above the chart.',
    ],
    example: 'At this pace (158 XP a chapter), Level 24 by the end of chapter 15. The cap, Level 50, in chapter 31.',
  ),
  Topic(
    id: 'systemspeaks',
    title: 'The system speaks',
    group: 'Worldbuilding',
    path: '/organize/systems',
    where: 'Organize, Systems: The system speaks, under the system’s name.',
    what:
        'Write the messages your system shows its characters (a level up, a new skill, a stat, a title, a quest, a '
        'warning), filled in from their sheet.',
    steps: [
      'Press The system speaks. Choose who it is to (a character with a sheet, or You) and what it says.',
      'It fills in from their sheet: the level they have reached, their stats, the skills and titles they hold with '
          'their ranks. Change anything; add a line more.',
      'Choose your book’s brackets: [ ], 【 】, < > or none. They are remembered for the book.',
      'Copy it, or Write it in the chapter: it goes at the end of the chapter you were writing, a line each.',
    ],
    example: '[Level up!] [Wren Hollis has reached Level 5.] [+5 attribute points to assign]',
  ),
  Topic(
    id: 'ledger',
    title: 'The ledger',
    group: 'Worldbuilding',
    path: '/organize/systems',
    where: 'Organize, Systems: the ledger, under The system speaks.',
    what:
        'Every number your pages give for the system (its stats and levels), in order, and where they do not add up, '
        'as a sharp-eyed reader would find it.',
    steps: [
      'Write numbers as you do: “Strength 14”, “Level 5”, or the system’s own “[Strength +2 (12 → 14)]”.',
      'Open Systems: each stat and level is a line of what it was, chapter by chapter.',
      'The slips come first: a sum that does not come out, a rise from the wrong number, a level that goes down, the '
          'pages ending on a number the sheet does not hold.',
      'Read it in chapter N opens the chapter on that sentence.',
    ],
    example: '“Strength rises from 12 in chapter 5, but it was 13 in chapter 4.” Fix one, and the ledger is clean.',
  ),
  Topic(
    id: 'levelsinpages',
    title: 'Levels in your pages',
    group: 'Getting started',
    where:
        'A character’s page, Overview: their levels. Organize, Systems: In the story (or under the systems), for what '
        'is no one’s and who holds the rest.',
    what:
        'Everything your chapters give a level to (an armor and its versions, a skill, a weapon, a character), kept '
        'as you write, never by hand, and kept with the character it belongs to.',
    steps: [
      'Write the level in the chapter: “the Hunter Armor reached Level 100”, “Hunter Armor Lv. 2”, “a Level 3 Hunter '
          'Armor”, “the Hunter Armor’s level rose to 4”, or “the Hunter Armor leveled up”. From that chapter on it is '
          'at that level, until your pages say it changed.',
      'Whose it is comes from the pages: “Kade’s Hunter Armor”, then who is in the sentence, then whose eyes the '
          'chapter is seen through. “Kade reached Level 5” is Kade’s own level.',
      'Open the character: their levels are on the Overview. Systems shows who holds what and what is no one’s.',
      'Things that share their last word are versions of one thing: Archer Armor and Hunter Armor under Armor. Press '
          'one for every step: its chapter, its level, the sentence, and Read it there.',
      'Wrong person? Not theirs sends it back to Systems, and Give to… hands it to someone. Not a level sets a wrong '
          'one aside. A level lower than before, where the page does not say it fell, is marked.',
    ],
    example: 'On Kade’s page: Hunter Armor, Level 100, since chapter 100. Archer Armor, Level 2, since chapter 2.',
  ),
  Topic(
    id: 'pagesnames',
    title: 'In your pages, not in the system',
    group: 'Worldbuilding',
    path: '/organize/systems',
    where: 'Organize, Systems: under the ledger, when your chapters name something the system does not hold.',
    what:
        'The skills, titles, classes and items your chapters name the system’s way, and the system does not hold '
        'yet. Add them in a press.',
    steps: [
      'Write as you do: “[Skill acquired: Tide Sense (E)]”, “Title earned: Giant Slayer”, or just “[Power Strike]”.',
      'Open Systems: each name it does not hold is listed, with its kind, its rank and where it is.',
      'Add to Skills (or Titles, Classes, Items) puts it in the system, and on the sheet when it has one; a group is '
          'made if there is none.',
      'Not part of it sets a name aside. Add all takes them all at once.',
    ],
    example: '[Tide Sense] Skill · rank E, 2 times from chapter 1. Add to Skills: it is on Wren’s sheet.',
  ),
  Topic(
    id: 'progression',
    title: 'Character progression',
    group: 'Worldbuilding',
    path: '/visualize/progression',
    matches: ['/visualize/abilities'],
    where: 'On every character’s profile, the Progression tab.',
    what:
        'How a character stands at a point in the story (level, stats, gear, status), looked up at any point and '
        'compared.',
    steps: [
      'Open a profile’s Progression tab.',
      'Log a snapshot at a chapter, with what is true then.',
      'Choose any point to see the state there.',
      'Compare two snapshots to see what changed.',
    ],
    example:
        'Kael is Level 3 in Chapter 2 and Level 9 in Chapter 20. Compared: six levels, a new sword, no longer injured.',
  ),
  Topic(
    id: 'modules',
    title: 'Genre modules',
    group: 'Worldbuilding',
    path: '/organize/modules',
    what:
        'Ten optional tool sets, each for a kind of story, from fantasy to politics. Any number can be on; they all '
        'work on the same characters, places and events.',
    steps: [
      'Open Organize → Modules: Made for your story names the ones your book’s words call for, with Turn on. Or '
          'press Enable module on any. On a phone they stand as a shelf of tiles: Turn on from the tile, or press '
          'it for its full card, and Back to the shelf.',
      'Open a module for its dashboard and tools.',
      'Add records in its lists: nothing is made for you.',
      'Press Configure to rename, hide or reorder its tools.',
      'Disable a module to hide it; everything made with it is kept.',
    ],
    example:
        'Enable Mystery. Add Kai as a suspect and mark a clue as implicating him. Kai is still one record, the same '
        'everywhere.',
  ),
  Topic(
    id: 'relationships',
    title: 'Relationships',
    group: 'Worldbuilding',
    path: '/visualize',
    matches: ['/organize/relationship'],
    what: 'Who is what to whom, and how that changes over the story, drawn as a map.',
    steps: [
      'Add a relationship from a character’s profile, from Characters → Ties, or on the empty map: name two people, '
          'say what they are, and press Draw it on the map.',
      'Choose its type and roles, and where the reader meets it.',
      'Add a stage when it changes, at the chapter where it does.',
      'Open Visualize → Relationship map to see it at any point in the story.',
    ],
    example:
        'Mira and Kael are Rivals in Chapter 1 and Allies from Chapter 14. The map shows the turn as you move along.',
  ),
  Topic(
    id: 'places',
    title: 'Places, journeys and factions',
    group: 'Worldbuilding',
    path: '/visualize/places',
    matches: ['/visualize/journeys', '/visualize/factions', '/visualize/ownership'],
    what: 'Where things are, who travels where and when, which factions are tied to which, and who holds what.',
    steps: [
      'Open Visualize → Places to see what lies inside what, and pin places on a map.',
      'Record journeys with who travels, from where to where, and when.',
      'See factions’ ties as of any point, and items passing from hand to hand.',
    ],
    example: 'The Ashen Keep lies inside the Northern Reach; Mira’s journey there takes nine days by horse.',
  ),
  Topic(
    id: 'timeline',
    title: 'Timeline',
    group: 'Planning the story',
    path: '/plan',
    matches: ['/plan/event', '/plan/calendar', '/visualize/timeline', '/visualize/order', '/visualize/history'],
    what: 'Events in the order they happen in the story’s world, however your chapters are arranged.',
    steps: [
      'Press New event and give it a date, exact or approximate, or none. An empty timeline offers to make an event '
          'from each chapter, in the order told, waiting for their dates.',
      'Link the characters and places involved, and the chapter that tells it.',
      'Read it down the line: each year a mark, each event on a node sized by its importance, and the years '
          'between said where time jumps.',
      'Set the novel’s own calendar if it has one (Plan → Calendar): begin from Thirteen moons, The long year and '
          'others, then rename anything.',
      'See it drawn in Visualize → Timeline, with tracks by character.',
    ],
    example: 'Add “The Fall of Emberhold”, ten years before Chapter 1, linked to Mira. Her life path shows it.',
  ),
  Topic(
    id: 'threads',
    title: 'Plot threads',
    group: 'Planning the story',
    path: '/plan/threads',
    matches: ['/plan/thread', '/visualize/plot'],
    what: 'Follow each storyline from setup to payoff, and be reminded when one has gone quiet.',
    steps: [
      'An empty list asks the questions your story raises (what the book answers, a mystery, a romance, a secret): '
          'write them and press Ask them. Or press New thread and name it.',
      'Add development each time it moves, in the chapter where it does.',
      'Set its status: planned, active, paused, resolved.',
      'Read the reminders for threads untouched for many chapters.',
      'Each thread is a strand across the chapters: a knot where it develops, a tied knot when it is resolved, a '
          'frayed end when it has gone quiet, and a bracket over a long gap. The upright line is how far you have '
          'written.',
    ],
    example:
        'Thread “The Missing Prince”: a clue in Chapter 2, a false lead in 9. By Chapter 30, it says it has been quiet.',
  ),
  Topic(
    id: 'board',
    title: 'Scene board',
    group: 'Planning the story',
    path: '/plan/board',
    matches: ['/plan/chapter', '/visualize/structure'],
    what: 'Chapters as columns or lanes and scenes as cards. Moving a card here moves it in the manuscript.',
    steps: [
      'Open Plan → Scene board.',
      'Drag a scene to another place or chapter, or use its buttons.',
      'Undo a move if you change your mind.',
      'Open a card to plan the scene, or to write it.',
    ],
    example: 'Drag “The vault” above “The inn”: it moves in the outline and the editor too. Undo puts it back.',
  ),
  Topic(
    id: 'histories',
    title: 'Alternate histories',
    group: 'Planning the story',
    path: '/plan/histories',
    what:
        'Try another course of events without touching the timeline: an alternate history keeps only its differences.',
    steps: [
      'Open Plan → Alternate histories: ask What if…? (or take a question from your own story) and press Branch '
          'the story.',
      'Change, add or remove events in it.',
      'Compare it with the timeline it branches from.',
    ],
    example:
        '“What if Mira refuses?”: the coronation never happens and two events move. The timeline is as you left it.',
  ),
  Topic(
    id: 'consequences',
    title: 'What depends on this',
    group: 'Planning the story',
    path: '/review/consequences',
    what:
        'Before you change a chapter, an event or a plot development, see what is recorded there and what may rest on '
        'it. It only reads.',
    steps: [
      'Open it from a chapter’s plan, an event or a plot development, or from Review.',
      'Read what is recorded at that point, and what later may be affected.',
      'Leave out or add who it involves.',
      'Tick off what you have looked at.',
    ],
    example:
        'Thinking of cutting the Chapter 4 duel? It lists two later chapters that mention it and a relationship change.',
  ),
  Topic(
    id: 'graph',
    title: 'Knowledge graph and views',
    group: 'Planning the story',
    path: '/visualize/graph',
    matches: ['/visualize/'],
    what:
        'Every view of the novel, read live from your records: graph, maps, charts, appearances and more. Each has a '
        'list form too.',
    steps: [
      'Open Visualize and press View: every view is a card, gathered by subject, saying what it shows. Choose one.',
      'Filter, focus and zoom; select something to see what it touches.',
      'Save a view you want to come back to.',
      'Use its list form for the same content in words.',
    ],
    example: 'In the knowledge graph, select “Ash Guild” to light up its six members and the chapters they appear in.',
  ),
  Topic(
    id: 'review',
    title: 'All warnings',
    group: 'Checking your work',
    path: '/review',
    matches: ['/review/timeline'],
    what:
        'Every warning the checks raise, in one place: confirmed errors apart from possible inconsistencies, each with '
        'its rule and data.',
    steps: [
      'Open Review: the most serious warning is in front, one at a time.',
      'Read it: its rule, what it rests on, and its records; open one, or see it in a view.',
      'Press Resolved, Intentional, Needs review or Ignored (with a note if you like); the next one comes up.',
      'Use the arrows to skip, or The whole list to filter and group every warning.',
      'When no check raises anything, Review says In good order, with every check that ran and what it read.',
    ],
    example: 'A character appears after being tracked as dead: it is a flashback, so mark it intentional, noting why.',
  ),
  Topic(
    id: 'records',
    title: 'Record check',
    group: 'Checking your work',
    path: '/review/records',
    what:
        'Finds references to deleted records, fields naming nothing, and records that look like duplicates. Nothing '
        'changes until you choose.',
    steps: [
      'Open Review → Record check.',
      'For a broken reference, open where it is, or take it out.',
      'For look-alikes, merge them (after seeing all that changes) or mark them not duplicates.',
    ],
    example: 'After deleting a chapter, a plot development still names it: take the reference out and place it again.',
  ),
  Topic(
    id: 'canon',
    title: 'Canon',
    group: 'Checking your work',
    path: '/review/canon',
    what: 'The facts of your world, each settled, provisional or changed, with where it is stated and its history.',
    steps: [
      'Press New statement and say what it is about.',
      'Mark it canon once settled.',
      'To change a settled fact, retcon it: the earlier wording is kept.',
      'Pin the paragraph that states it.',
    ],
    example: '“The city was founded 1,000 years ago” is canon. You choose 800: retcon it, and the history shows both.',
  ),
  Topic(
    id: 'continuity',
    title: 'Continuity check',
    group: 'Checking your work',
    path: '/review/continuity',
    what:
        'Reads the manuscript against what you track: a dead character speaking, a lost item back, an impossible '
        'journey.',
    steps: [
      'Choose what to track: deaths, absences, who holds an item, travel times.',
      'Read the issues found, each with its paragraph.',
      'Fix the manuscript, update canon, mark it intentional, or dismiss it.',
    ],
    example: 'Track “Old Tam dies in Chapter 8”. His line in Chapter 11 is found, with a link to the paragraph.',
  ),
  Topic(
    id: 'progress',
    title: 'Goals and progress',
    group: 'Checking your work',
    path: '/progress',
    what: 'Your writing journal: days in a row, a year of writing, milestones, targets, deadlines and tasks.',
    steps: [
      'At the top: the days you have written in a row, the manuscript against its target, and when you would finish '
          'at your pace of the last 30 days.',
      'A year of writing has a square for each day, darker the more you wrote. Point at or tap a day to see its words.',
      'How long it is: the manuscript among the lengths of fiction, from flash fiction to a long novel, its pages, '
          'and the words to the next length.',
      'Milestones fill in as you pass them; the next one says how far it is.',
      'Set daily and weekly word targets (or from the goal under the page in Write); add deadlines and tasks.',
    ],
    example: 'Target: 1,000 words a day. Today shows 640, and the deadline says 820 a day will finish on time.',
  ),
  Topic(
    id: 'analytics',
    title: 'Analytics and charts',
    group: 'Checking your work',
    path: '/progress/analytics',
    matches: ['/visualize/charts', '/visualize/appearances'],
    what: 'The numbers behind the book: output over time, chapter lengths, who appears where, how threads develop.',
    steps: [
      'Open Progress → Analytics.',
      'Read output, sessions and structure.',
      'See where each character appears and each thread develops.',
      'The observations describe; they do not judge.',
    ],
    example:
        'It notes that Vera has not appeared since Chapter 3, and that Chapter 7 is three times the average length.',
  ),
  Topic(
    id: 'team',
    title: 'Review by file',
    group: 'Working with others',
    path: '/review/team',
    what:
        'Give an editor or a beta reader a review copy as a file; their comments and suggested changes come back as a '
        'file. Nothing goes online.',
    steps: [
      'Open Review → Team and feedback and press Add a person.',
      'Choose their role, and make them a review copy.',
      'They open it, comment, react and (as an editor) suggest changes.',
      'Open their feedback file, reply, and accept or reject each suggestion.',
    ],
    example:
        'Add David as Editor. He suggests “…in ash and silence.”; you accept that one change and it lands in the text.',
  ),
  Topic(
    id: 'templates',
    title: 'Template files',
    group: 'Working with others',
    where: 'Settings → Import & export → Share a template… and Import a template file…',
    what:
        'Share categories and fields, profile layouts or systems as a file, with who made it, its terms and a version.',
    steps: [
      'Choose Share a template and pick what to share.',
      'Check what the file will hold, then save it.',
      'Someone else imports it: they see its contents, maker, terms and version first.',
    ],
    example:
        'Share your “Hard magic” system with a friend. Change it and share again: they get version 2 beside version 1.',
  ),
  Topic(
    id: 'backups',
    title: 'Backups',
    group: 'Working with others',
    where: 'The Library: Import backup, and a novel’s ⋯ menu → Export backup.',
    what:
        'A backup holds a whole novel. It is how a novel moves to another device: the app keeps everything on this one '
        'and sends nothing anywhere.',
    steps: [
      'From a novel’s menu, choose Export backup and keep the file safe.',
      'On another device, choose Import backup and check what it holds.',
      'Importing over a novel that is already there asks first, and keeps a restore point.',
    ],
    example: 'Export “Ashfall” on the PC every Friday. On the tablet, import it to read and write on the train.',
  ),
  Topic(
    id: 'settings',
    title: 'Settings',
    group: 'Making it yours',
    path: '/settings',
    what: 'How the app looks and feels on this device: theme, writing settings, the tutorial, and import and export.',
    steps: [
      'Open Settings with the gear beside the Library (or Ctrl/⌘+comma).',
      'Choose a look: each is a small page in its own colours. Match this device follows the phone or computer; '
          'Light (parchment) and Dark (midnight) are the book by day and by lamplight; System Monolith is a dark '
          'gold-and-teal system interface on a grid. The look dresses the books too: covers, spines, shelves and frames; '
          'a book’s own colour and cover picture stay as you chose them.',
      'Set the editor’s font, size and spacing.',
      'Turn the Tutorial button on or off.',
    ],
    example: 'Choose midnight for writing at night; your phone keeps its own choice.',
  ),
  Topic(
    id: 'wearbook',
    title: 'The app wears your book',
    group: 'Making it yours',
    path: '/settings',
    what:
        'While a novel is open, the whole app takes on its cover colour: buttons, tabs, links and rules, and a breath '
        'of it in the paper.',
    steps: [
      'Open a novel: the app changes to its colour, slowly, in any look. Open another, and it changes with it.',
      'Change the colour in the book’s details (Settings, Edit details) and the app follows at once.',
      'The colour is made readable: only how light it is moves, never its hue. A grey cover is not worn, since grey '
          'buttons read as turned off; Settings says so.',
      'Turn it off in Settings, under Appearance: Wear each book’s colour.',
    ],
    example: 'A green fantasy makes a green room, a crimson thriller a crimson one: you know which book you are in.',
  ),
  Topic(
    id: 'trail',
    title: 'Where you were',
    group: 'Making it yours',
    where: 'At the top of More, inside a book.',
    what:
        'The places you have just been in this book (a character, a place, a thread, a chapter’s plan, a view) by '
        'name, newest first, each a press from going back.',
    steps: [
      'Go about the book as usual: every page past the bar’s own is remembered as you leave it.',
      'Open More: Where you were shows the last six, each with what kind of place it is and when.',
      'Press one to go straight back. The page you are on is left out.',
      'Names are read fresh: a character renamed shows the new name, one deleted drops off. The trail is this '
          'device’s, a trail for each book.',
    ],
    example: 'From Wren’s page to the tide bell thread and on to Plot lanes, then back to Wren in a single press.',
  ),
  Topic(
    id: 'pinbar',
    title: 'Keep an area on the bar',
    group: 'Making it yours',
    where: 'On a phone, inside a book: under More, the pin at the end of an area’s line.',
    what:
        'Put the area you use most (Plan, Visualize, Review or Progress) on the phone’s bottom bar, one press away '
        'instead of two.',
    steps: [
      'Open More and press the pin beside an area: it takes a place on the bar, between Organize and More.',
      'One area at a time: pinning another puts it in the first one’s place. The filled pin takes it off again.',
      'More notices too: open an area from it four times in a week and it offers, “Keep it on the bar”. Not now '
          'and it does not ask about that area again.',
      'Only this device changes; on a computer every area is already in the rail.',
    ],
    example: 'Plotting all week? Keep Plan on the bar, and the board is a press away from the chapter.',
  ),
  Topic(
    id: 'devices',
    title: 'Phone and tablet',
    group: 'Making it yours',
    where: 'The same app on a phone or a tablet.',
    what: 'The app adapts: one column and a bar at the bottom on a phone, the rail on wider screens.',
    steps: [
      'On a phone the Library fills the screen; open a book and the bar appears: Library, Write, Organize and More.',
      'In Write, the contents page and the editor take turns; Back returns to the contents, and Ch. 1 at the top lists '
          'every chapter, with Previous and Next.',
      'Panels open as sheets from the bottom.',
      'While you type, bold, italic, lists and links sit on the keyboard; put it away and the page has the screen.',
    ],
    example: 'On the bus, open Write, choose Chapter 18 and add a paragraph. It is saved before the next stop.',
  ),
  Topic(
    id: 'tutorial',
    title: 'This tutorial',
    group: 'Making it yours',
    where:
        'The Tutorial button in the rail; on a phone, beside the gear in the Library and in More inside a book; and in '
        'Settings.',
    what: 'A short guide to each feature. It opens on the page you are looking at.',
    steps: [
      'Press Tutorial at any time.',
      'Use Next and Back to walk through, or press All topics and type in Find a lesson.',
      'Your path, at the head of All topics, ticks each lesson your books show you have used (a character, an '
          'event, a ribbon) and names the next one worth trying: press Show me.',
      'On the lesson for the page you are on, Show me on this page dims the page and lights each button the lesson '
          'names, one step at a time.',
      'When you no longer need it, switch off “Show the Tutorial button”; bring it back, or open it once, from '
          'Settings.',
    ],
    example: 'On the World page, press Tutorial: it opens on “The world”, with an example entry to try.',
  ),
];

/// The lesson for where someone is in the app: the one whose page or addresses match the location most closely. Falls
/// back to finding your way around.
Topic topicFor(String location) {
  final path = Uri.parse(location).path;
  Topic? best;
  var length = -1;
  for (final t in tutorialTopics) {
    for (final p in [?t.path, ...t.matches]) {
      final hit = p == '/'
          ? path == '/'
          : (path == p || path.startsWith(p.endsWith('/') ? p : '$p/') || (p.endsWith('/') && path.startsWith(p)));
      if (hit && p.length > length) {
        best = t;
        length = p.length;
      }
    }
  }
  return best ?? tutorialTopics.firstWhere((t) => t.id == 'areas');
}

/// The buttons and pages the lessons name, as the app writes them: the tutorial points them out on the page
/// (`spotlight.dart`), and a test checks each is still both in a lesson and in the app.
const tutorialButtonNames = [
  'New novel',
  'Begin chapter one',
  'More details',
  'Continue writing',
  'Start writing it',
  'Draw an idea',
  'Raise the curtain',
  'Desk',
  'Ask them',
  'Jot an idea',
  'Branch the story',
  'Lay a ribbon in this page',
  'Lay the ribbon',
  'Find a lesson',
  'Show me',
  'Show me on this page',
  'Sort & filter',
  'Covers',
  'Spines',
  'Search, or go anywhere',
  'Sprint',
  'Plan this chapter',
  'Carry on',
  'The index',
  'Share the jacket',
  'Share the poster',
  'Keep it on the bar',
  'Not now',
  'Skip to the poster',
  'Play again',
  'Share the print',
  'Share this page',
  'Keep writing',
  'Share their card',
  'Draw their face',
  'Keep this face',
  'This or that',
  'Keep these traits',
  'The system speaks',
  'Write it in the chapter',
  'Not part of it',
  'Share the window',
  'Share the face-off',
  'Swap sides',
  'In the story',
  'Name them',
  'Write a name',
  'Share this line',
  'Read it there',
  'Not a level',
  'Not theirs',
  'Give to…',
  'Make the PDF',
  'See your score',
  'Share your score',
  'All your best lines',
  'Turn it over',
  'Send it',
  'Print it',
  'See the shelf',
  'Edit the book’s details',
  'See the slips',
  'Make the sample pages',
  'Copy the letter',
  'Save it',
  'Play the whole quiz',
  'See it told as a story',
  'The blueprint',
  'A line they say',
  'Forge a name',
  'More names',
  'Like your book',
  'Atmosphere',
  'Candlelight',
  'Set like a book',
  'Show the storyboard',
  'Show the list',
  'Open their page',
  'Leave a gap',
  'Set a daily goal',
  'Leave a note for next time',
  'Done with it',
  'Stuck? A nudge',
  'Back to it',
  'Don’t offer nudges',
  'Share today’s page',
  'Include a line I wrote today',
  'Put the voices away',
  'Back a sentence',
  'On a sentence',
  'Today’s ink',
  'Search the cast',
  'Arrange the cast',
  'In what order',
  'Show only',
  'Orbit',
  'Found in your pages',
  'In their pages',
  'In their own words',
  'Together on the page',
  'Begin with your book’s system',
  'Add the sample novel',
  'How are they tied?',
  'Not tied',
  'Not an entry',
  'Alternate drafts',
  'Version history',
  'Save a version',
  'Put in the manuscript',
  'New character',
  'Interview',
  'Not a character',
  'Ties',
  'Begin this world',
  'New entry',
  'Categories & fields',
  'Begin blank',
  'Draw it on the map',
  'New event',
  'New thread',
  'In good order',
  'The whole list',
  'How long it is',
  'Show the Tutorial button',
  'Import backup',
  'Export backup',
  'Begin the next chapter',
  'Enable module',
  'New statement',
  'Every connection',
  'Configure',
  'Publish',
  'Add a person',
  'Share a template',
  'Import a template file',
  'Read as a book',
  'Book details',
  'Export manuscript',
  'Record check',
  'Typewriter',
  'Resolved',
  'Intentional',
  'Needs review',
];
