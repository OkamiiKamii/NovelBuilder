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
      'Press New novel: type the title on the cover, the author under it, pick a colour, and press Begin chapter '
          'one to start writing. More details holds everything else.',
      'Press a book to open it, or Continue writing to go straight back to the chapter you left. The last lines you '
          'wrote there wait on the page above the button, and you land with the caret after the last word.',
      'Use the ⋯ menu on a book to edit details (a cover too), pin, archive, duplicate, export a backup or delete.',
      'Books stand on shelves by stage: Writing now, Ideas, Set aside, Finished. Choose Covers or Spines beside the '
          'search; press a spine to take the book off the shelf. On an idea, Start writing it moves it to the top '
          'shelf and opens it. With nothing being written, Draw an idea picks one of your ideas for you. On a phone, '
          'swipe a shelf sideways, or press See all. Ideas with no premise are counted above the shelf: Begin gives each '
          'a line, one card at a time. Jot an idea, at the head of the shelf, shelves a new one in a line.',
      'Search the shelf, and press Sort & filter for status, genre and order. On a phone it stays folded until you '
          'press it, and counts what is set.',
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
      'The ribbon at the right edge of every page in the book holds its ribbons: press it, then Lay a ribbon in this '
          'page to mark a page you keep going back to. Press a ribbon to turn back to its page.',
      'On a phone, More opens the contents of the rest of the book: Search the novel, then each area with what it '
          'holds now. Library takes you back to the shelf.',
      'The gear beside the Library is Settings (or Ctrl/⌘ and comma from anywhere).',
    ],
    example: 'Press Ctrl/⌘+3 to go to Organize, then World to see every place and faction of “Ashfall”.',
  ),
  Topic(
    id: 'write',
    title: 'Writing a chapter',
    group: 'Writing',
    path: '/write',
    what: 'The editor. It saves as you type, never changes your words by itself, and works with no connection.',
    steps: [
      'Add a chapter (or a scene inside one) in the outline, and select it.',
      'Write on the page; its title is typed at the top. Beside it (the panel button; on a phone, Desk) are notes: how the chapter '
          'before ends, this chapter\'s plan and beats, who is on the page and the threads that move here.',
      'Below the page: today\'s words against your goal (tap it to choose 100, 250, 500 or 1,000 words a day, or '
          'your own number), the words added this session, the chapter\'s length and the save status.',
      'Use the text button for font, size and spacing, and Ctrl/⌘+F to find and replace. The frame button is focus '
          'mode: the line you write stays in the middle and the rest fades back (Typewriter turns that off). In a long '
          'chapter, the strip down the right edge is the whole chapter: tap or drag it to go anywhere.',
      'Press Sprint below the page and choose 10, 15, 25 or 45 minutes: the desk clears, a ring shows the time left '
          'beside the words you add, and at the end a card says what you wrote. Stop ends it early.',
    ],
    example:
        'Type a scene, then press Ctrl/⌘+F to find every “Kael”. Close the app mid-sentence: the words are there when '
        'you come back.',
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
    where: 'Ctrl/⌘+K anywhere, the search button at the top of the rail, or More → Search the novel on a phone.',
    what: 'Finds a word or phrase across chapters, plans, notes and every record, and goes to the exact place.',
    steps: [
      'Press Ctrl/⌘+K.',
      'Type what you are looking for.',
      'Narrow it with the chips: the manuscript, plans and notes, or records.',
      'Choose a result: a chapter opens with the words found; a record opens its page.',
    ],
    example: 'Search “silver key”: three chapters, a plan and an item. Choose the chapter and the find bar is on it.',
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
      'An empty cast is a playbill: name the hero, who stands against them and by them, and press Raise the '
          'curtain. Or press New character; only a name is needed. Names you keep writing wait at the top: Add one '
          'in a press, or set it aside with Not a character.',
      'On the profile, add sections and fields, or press Interview: questions, one at a time, that fill it in. Each '
          'card says how well you know them (Known 4 of 11); a press there asks the next.',
      'Use the tabs for relationships, secrets, notes, history and progression.',
      'Search by name, alias or tag; filter by role; switch between Cards, List and Ties, where a “+” between two '
          'characters says who they are to each other.',
      'Under each card, a line runs through the book: a tick for every chapter, lit where the character appears.',
    ],
    example:
        'Create “Kaelen Draven”, role Protagonist, with the epithet “The Oathbreaker”. Searching “oathbreaker” finds '
        'him.',
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
      'Fill in its summary and fields.',
      'Connect it to other records (“seated in”, “member of”) under Every connection.',
      'In the editor, select a name and link it to its entry.',
      'Each category is a volume on the shelf: press one to read only its entries, and a letter to jump to it. The '
          'line under an entry lights the chapters it is linked in.',
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
      'Pick a card: LitRPG, Cultivation, Hard magic or Superhero (each shows its levels, ranks and attributes) and '
          'press Begin with it, or Begin blank.',
      'Define attributes and resources, then levels or named stages.',
      'Add groups such as classes and skills, with what they need.',
      'Give a character a sheet, and record what changes chapter by chapter.',
    ],
    example: 'Set Health = Vitality × 10. Give Kael Vitality 14: his sheet shows Health 140. At 15, it is 150.',
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
          'press Enable module on any.',
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
      'Choose a look: each is a small page in its own colours (parchment, midnight, match this device, or System '
          'Monolith, a dark gold-and-teal system interface).',
      'Set the editor’s font, size and spacing.',
      'Turn the Tutorial button on or off.',
    ],
    example: 'Choose midnight for writing at night; your phone keeps its own choice.',
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
    where: 'The Tutorial button in the rail, in More inside a book on a phone, and in Settings.',
    what: 'A short guide to each feature. It opens on the page you are looking at.',
    steps: [
      'Press Tutorial at any time.',
      'Use Next and Back to walk through, or pick a topic from the list.',
      'When you no longer need it, switch off “Show the Tutorial button”.',
      'Bring it back, or open it once, from Settings.',
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
