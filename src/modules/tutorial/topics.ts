/** One short lesson: what a feature is for, how to use it in a few steps, and a worked example. */
export interface Topic {
  id: string;
  title: string;
  group: (typeof GROUPS)[number];
  /** One or two sentences: what it is for. */
  what: string;
  /** Three to five things to do, in order. */
  steps: string[];
  /** A concrete case, with made-up names. */
  example: string;
  /** The page of a project it lives on (`''` is the overview), when it has one. */
  page?: string;
  /** Where to find it when it is not a page of its own. */
  where?: string;
}

export const GROUPS = ['Getting started', 'Writing', 'Worldbuilding', 'Planning the story', 'Checking your work', 'Working with others', 'Making it yours'] as const;

export const TOPICS: Topic[] = [
  {
    id: 'library', title: 'The Library', group: 'Getting started', where: 'The first screen of the app.',
    what: 'Every novel is its own project, kept apart from the others. The Library lists them all.',
    steps: ['Press New project and give it a title.', 'Pick a worldbuilding template and a fictional system if you want a head start (both optional).', 'Use the ⋯ menu on a card to duplicate, pin, archive, export or delete a project.', 'Search and filter by status or genre when the shelf fills up.'],
    example: 'Create “Ashfall”, genre Fantasy, with the LitRPG system preset. Its card shows the word count against your 90,000-word target.',
  },
  {
    id: 'overview', title: 'Project overview', group: 'Getting started', page: '',
    what: 'The front page of a project: its totals, synopsis and a button to carry on writing.',
    steps: ['Open a project from the Library.', 'Read the totals: words, chapters, scenes, codex entries, days to deadline.', 'Press Continue writing to go straight back to your last chapter.'],
    example: 'After a week away, open “Ashfall”: 41,200 words, 18 chapters, deadline in 60 days. One click puts you back in Chapter 18.',
  },
  {
    id: 'manuscript', title: 'Writing a chapter', group: 'Writing', page: 'manuscript',
    what: 'The editor. It saves as you type, never changes your words by itself, and works with no connection.',
    steps: ['Press + Chapter in the contents list on the left, or + Scene inside a chapter.', 'Write. The word count and “Saved” mark sit at the bottom.', 'Use Aa for font, size and theme, and the frame icon for focus mode.', 'Open the panel on the right for the chapter’s plan, other chapters, version history and the Codex.'],
    example: 'Type a scene, then press Ctrl/⌘+F to find every “Kael” in the chapter. Close the tab mid-sentence: the text is there when you come back.',
  },
  {
    id: 'history', title: 'Drafts and version history', group: 'Writing', where: 'In the editor: right panel → History.',
    what: 'Earlier versions of a chapter are kept so nothing is lost, and you can keep alternate drafts side by side.',
    steps: ['Open a chapter and choose History in the right panel.', 'Press Save a version before a big rewrite and give it a name.', 'Compare any version with the current text to see words added and removed.', 'Restore a version, or start a new draft such as “Alternate ending”.'],
    example: 'Save “Before the duel rewrite”, rewrite the duel, then compare: 212 words added, 340 removed. Not happy? Restore the old one.',
  },
  {
    id: 'read', title: 'Reader preview', group: 'Writing', page: 'read',
    what: 'Your manuscript as a reader would meet it: a printed page, an e-reader, or a web serial chapter. Nothing can be edited there.',
    steps: ['Press the book icon in the editor, or Reader preview in the sidebar.', 'Switch between Standard novel, Ebook and Web serial at the top.', 'Use Aa to change typeface, size, spacing and colours.', 'Turn pages with the arrow keys; open Contents to jump and see your progress.'],
    example: 'Check how Chapter 3 paces on a phone: choose Ebook, then Aa → Device → Phone. It runs to 15 pages; the scene break falls on page 7.',
  },
  {
    id: 'organizer', title: 'Organizer', group: 'Writing', page: 'organizer',
    what: 'The whole book as an outline: volumes, acts, arcs, chapters and scenes, with a status on each.',
    steps: ['Add a volume, act or arc, then chapters under it.', 'Drag a chapter to move it, or use Move up / Move down in its ⋯ menu.', 'Set each chapter’s status from Idea to Published.', 'Click a chapter to plan it: objective, conflict, who appears.'],
    example: 'Move “The Bell” from Act 1 to Act 2 and mark it Revising. Its text, notes and links move with it untouched.',
  },
  {
    id: 'board', title: 'Scene board', group: 'Writing', page: 'board',
    what: 'Your chapters as columns (or lanes) and their scenes as cards, with status and words. Moving a card here moves it in the manuscript.',
    steps: ['Drag a scene card to another place or chapter, or use its ↑ ↓ and “Move to…”.', 'Drag a chapter’s header to reorder chapters.', 'Undo a move with the Undo button or Ctrl/⌘+Z.', 'Click a card’s title to write it.'],
    example: 'Drag “The vault” above “The inn”: it moves into that chapter in the Organizer and the editor too. Undo puts it back.',
  },
  {
    id: 'search', title: 'Search the project', group: 'Writing', where: 'Ctrl/⌘+K anywhere in a project, or “Search project…” in the sidebar.',
    what: 'Finds a word or phrase across chapters, notes, plans and the Codex, and jumps to the exact line.',
    steps: ['Press Ctrl/⌘+K.', 'Type what you are looking for.', 'Results are grouped: Manuscript, Notes, Codex. Click one to go there.'],
    example: 'Search “silver key”. Three hits in the manuscript, one in a plan, one codex item. Click the chapter hit and you land on that paragraph.',
  },
  {
    id: 'export', title: 'Import and export', group: 'Writing', page: 'export',
    what: 'Bring a manuscript in, and take yours out as a document, an ebook, a PDF or a complete backup.',
    steps: ['Choose Export manuscript and pick a format.', 'Choose which chapters to include.', 'Use Full archive for a backup of everything, including history.', 'Import a text or document file to add chapters.'],
    example: 'Export chapters 1–5 as a document for a beta reader, and a Full archive for your own safekeeping once a week.',
  },
  {
    id: 'characters', title: 'Characters', group: 'Worldbuilding', page: 'characters',
    what: 'Your cast: a library to find characters in, and a full profile for each with sections you shape yourself.',
    steps: ['Press + New Character; only a name is needed.', 'On the profile, add fields to a section from its suggestions, or add a section of your own.', 'Use the tabs: Relationships (with a map), Details, Secrets, Notes and History.', 'Search the library by name, alias, title, tag or faction; filter by role; switch between cards and a list.'],
    example: 'Create “Kaelen Draven”, title “The Oathbreaker”, role Protagonist. Add Core Traits: Brooding, Loyal. Searching “oathbreaker” finds him.',
  },
  {
    id: 'codex', title: 'The Codex', group: 'Worldbuilding', page: 'codex',
    what: 'Your world’s encyclopedia: places, factions, items, powers and lore. Each entry has fields you define. (Your cast has its own page: Characters.)',
    steps: ['Press New entry and choose a category.', 'Fill in the summary and the category’s fields; add your own with + Add field.', 'Link related entries (“mentor of”, “home of”).', 'In the editor, select a name and link it to its entry; click the link later to look it up.'],
    example: 'Create the faction “Ash Guild” with a custom field “Standing: Rising”, and link it to the location “Emberfall” as “seated in”.',
  },
  {
    id: 'systems', title: 'Fictional systems', group: 'Worldbuilding', where: 'On every character’s profile, under the System tab. All systems together: Characters, then Systems.',
    what: 'Design the rules of a magic, levelling or power system: stats, levels, classes, skills and formulas.',
    steps: ['Start from a preset (LitRPG, Cultivation, Hard magic, Superhero) or a blank system.', 'Define attributes and resources, then levels: what each costs, what experience comes from, and how many points a level brings.', 'Add classes and skills with requirements.', 'Give a character a sheet, then log the experience they earn chapter by chapter: their level is worked out from it, and the points it brings are yours to place.'],
    example: 'Set Health = Vitality × 10. Give Kael Vitality 14 and his sheet shows Health 140. Raise it to 15 and it becomes 150.',
  },
  {
    id: 'progression', title: 'Character progression', group: 'Worldbuilding', page: 'progression', where: 'Appears once the project has a system or a snapshot.',
    what: 'Record how a character stands at a point in the story, and look up or compare any two points.',
    steps: ['Choose a character and a chapter, and take a snapshot.', 'Set level, stats, gear and status as of that chapter.', 'Ask “what was true in Chapter 12?” to see the nearest snapshot before it.', 'Compare two snapshots to see what changed.'],
    example: 'Kael is Level 3 in Chapter 2 and Level 9 in Chapter 20. Compare them: +6 levels, a new sword, and “Injured” gone.',
  },
  {
    id: 'relationships', title: 'Relationships', group: 'Worldbuilding', page: 'relationships',
    what: 'Who is what to whom, and how that changes over the story.',
    steps: ['Pick two characters and the kind of bond (ally, rival, family…).', 'Set how strong it is and whether it is known.', 'Add changes over time, tied to chapters.'],
    example: 'Mira and Kael start as Rivals in Chapter 1 and become Allies in Chapter 14. The table and the graph both show the turn.',
  },
  {
    id: 'timeline', title: 'Timeline', group: 'Worldbuilding', page: 'timeline',
    what: 'Events in story-time order, however your chapters are arranged.',
    steps: ['Add an event with a date or a place in the sequence.', 'Link the characters and places involved, and the chapter where it is shown.', 'Filter by character to follow one person’s path.'],
    example: 'Add “The Fall of Emberhold”, ten years before Chapter 1, linked to Mira. Filter by Mira to see her life in order.',
  },
  {
    id: 'graph', title: 'Story graph', group: 'Worldbuilding', page: 'graph',
    what: 'A map of how everything connects: characters, places, chapters and threads.',
    steps: ['Open Story graph.', 'Drag to pan, scroll to zoom; click a node to see what it touches.', 'Open or fold a cluster to manage the clutter.'],
    example: 'Click “Ash Guild” to light up its six members and the four chapters they appear in.',
  },
  {
    id: 'visualize', title: 'Visualize', group: 'Planning the story', page: 'visualize',
    what: 'Every view of the novel in one place: timeline, relationships, plot board, graph, places and progression, read live from your records.',
    steps: ['Open Visualize.', 'Pick a view along the top.', 'Read what it shows; each view says what it is drawn from.', 'Follow the link under it to add or change those records.'],
    example: 'Pick Places: the Ashen Keep sits inside the Northern Reach, with the three events that happened there.',
  },
  {
    id: 'modules', title: 'Genre modules', group: 'Worldbuilding', page: 'modules',
    what: 'Ten optional tool sets, each for a kind of story, from fantasy to politics. Any number can be on together; they all work on the same characters, places and events.',
    steps: ['Open the Module Manager and press Enable Module on the ones this novel uses.', 'Each appears in the sidebar; open it for a dashboard and its tools.', 'Create records in its lists: nothing is made for you, and every field is optional.', 'Press Configure to rename or hide tools, set your own stages, and add your own fields.', 'Disable a module to hide it; everything made with it is kept.'],
    example: 'Enable Mystery and Romance. Make the case “The Vale Inheritance”, add Kai as a suspect, and start the arc “Kai & Ren”. Kai’s profile now lists both, under “In the modules”, and there is still one Kai.',
  },
  {
    id: 'plot', title: 'Plot threads', group: 'Planning the story', page: 'plot',
    what: 'Follow each storyline from setup to payoff, and get told when one has gone quiet.',
    steps: ['Press New thread and name it.', 'Add a development each time the thread moves, and the chapter it happens in.', 'Set the status: Planned, Active, Paused, Resolved.', 'Watch the alerts for threads untouched for many chapters.'],
    example: 'Thread “The Missing Prince”: a clue in Chapter 2, a false lead in 9. By Chapter 30 the page warns it has been quiet for 21 chapters.',
  },
  {
    id: 'canon', title: 'Canon', group: 'Planning the story', page: 'canon',
    what: 'The facts of your world, each marked as settled, provisional or changed, with where it is stated.',
    steps: ['Record a fact and its subject.', 'Mark it Canon once it is settled, or leave it Provisional.', 'To change a settled fact, retcon it with a reason: the old version is kept in its history.', 'Link the passage that states it.'],
    example: '“The city was founded 1,000 years ago” is Canon. You decide on 800: retcon it with the reason, and the history shows both.',
  },
  {
    id: 'branches', title: 'Alternate timelines', group: 'Planning the story', page: 'branches',
    what: 'Fork the story at any chapter to try another direction, without touching the original.',
    steps: ['Choose the chapter to fork from.', 'Write the alternate version in its own timeline.', 'Mark it Alternate, Experimental or Abandoned.', 'Merge one chapter back, or promote the whole branch to be the main story.'],
    example: 'Fork at Chapter 12, “What if Mira refuses?”. Write three chapters there. The main story is exactly as you left it.',
  },
  {
    id: 'consequences', title: 'Consequences', group: 'Planning the story', page: 'consequences',
    what: 'Before you change something, see what depends on it.',
    steps: ['Pick a chapter, event, character or plot development.', 'Read what is established as depending on it, and what might be affected.', 'Tick items off as you deal with them.'],
    example: 'Thinking of cutting the Chapter 4 duel? It shows two later chapters that mention it, one relationship change and a canon fact.',
  },
  {
    id: 'assistant', title: 'Brainstorming assistant', group: 'Planning the story', page: 'assistant',
    what: 'Ideas on request, built from your own world’s facts. Nothing it suggests is added unless you add it.',
    steps: ['Choose what it may read (characters, lore, plot) and a mode such as “What if?”.', 'Ask your question.', 'Each idea is marked Established, Suggested or Assumption.', 'Use the + buttons to keep one as a note, a plot development or lore; discard the rest.'],
    example: 'Ask “What could go wrong at the coronation?” Keep idea 2 with + Add to Plot Thread; the other four are discarded.',
  },
  {
    id: 'continuity', title: 'Continuity checker', group: 'Checking your work', page: 'continuity',
    what: 'Looks for contradictions: a dead character speaking, a lost item reappearing, an impossible journey.',
    steps: ['Add what to track: a character’s status, who holds an item, travel times.', 'Run the check.', 'For each issue choose: fix the manuscript, update the canon, mark as intentional, or ignore.'],
    example: 'Track “Old Tam dies in Chapter 8”. The check flags his line of dialogue in Chapter 11 as Critical, with a link to the paragraph.',
  },
  {
    id: 'integrity', title: 'Record check', group: 'Checking your work', page: 'integrity',
    what: 'Finds references to deleted records, fields that name nothing, and records that look like duplicates. Nothing changes until you choose a fix.',
    steps: ['Open Record check.', 'For a broken reference, open where it is kept, or take the reference out.', 'Point a field holding words at the entry it means.', 'For look-alike records, merge them (after seeing everything that will change) or mark them not duplicates.'],
    example: 'After deleting a chapter, a plot beat still names it. Taking the reference out keeps the beat, unplaced, for you to place again.',
  },
  {
    id: 'review', title: 'Continuity review', group: 'Checking your work', page: 'review',
    what: 'Every warning the checks raise, in one place, by severity and category: confirmed data errors apart from possible inconsistencies, each with its rule and the data behind it.',
    steps: ['Open Continuity review.', 'Read a warning: its rule, what it rests on, and the records it is about.', 'Open the record, or see it in context in a visualization.', 'Set its status: resolved, intentional, ignored or needs review, with a note if you like.'],
    example: 'A character appears in Chapter 7 after being tracked as dead in Chapter 5. It is a flashback, so you mark it intentional with the note “Flashback”.',
  },
  {
    id: 'progress', title: 'Goals and progress', group: 'Checking your work', page: 'progress',
    what: 'Daily and weekly word goals, deadlines, tasks, and a record of your writing sessions.',
    steps: ['Set a daily or weekly word goal.', 'Add a deadline for the book or a part of it.', 'Add tasks that are not word counts (“Outline Act 3”).', 'Watch the streak and the pace needed to finish on time.'],
    example: 'Goal: 1,000 words a day. Today shows 640 / 1,000, and the deadline panel says 820 a day will finish on time.',
  },
  {
    id: 'dashboard', title: 'Dashboard', group: 'Checking your work', page: 'dashboard',
    what: 'The numbers behind the book: output over time, chapter lengths, who appears where, thread health.',
    steps: ['Open Dashboard.', 'Read output by day and by session.', 'Check the structure: chapter lengths and statuses.', 'Look through the observations at the bottom; they describe, they do not judge.'],
    example: 'It notes that Vera has not appeared since Chapter 3, and that Chapter 7 is three times the average length.',
  },
  {
    id: 'team', title: 'Team, comments and suggestions', group: 'Working with others', page: 'team',
    what: 'Invite co-authors, editors, beta readers and viewers. Each role sees and changes only what it should.',
    steps: ['Set up Cloud sync for the project first.', 'On Team, enter a name, choose a role and create the invitation link; send it to them.', 'They comment on selected text, lore or plot; editors suggest changes instead of making them.', 'You accept or reject each suggestion, and can turn a comment into a task or note.'],
    example: 'Invite David as Editor. He suggests “…in ash and silence.” You press Review suggestions on the chapter and accept that one change.',
  },
  {
    id: 'sync', title: 'Cloud sync and backups', group: 'Working with others', page: 'sync',
    what: 'Keep a project in step across your devices through a relay you run, with cloud backups to restore from.',
    steps: ['Enter the relay address, name this device and create a sync key.', 'Press Sync this project.', 'On another device, open Cloud from the Library, enter the same key and download the project.', 'If two devices changed the same thing, choose which version stands; nothing is overwritten for you.'],
    example: 'Write on the laptop offline on a train. Back online, it syncs by itself. The desktop edited the same chapter: you compare and keep both paragraphs.',
  },
  {
    id: 'studio', title: 'Workspaces and layout', group: 'Making it yours', page: 'studio',
    what: 'Four workspaces (Drafting, Planning, Worldbuilding, Editing), each with its own panels. Arrange them your way.',
    steps: ['Switch workspace with the buttons at the top.', 'Open and close the side panels, and choose what each shows.', 'Start from a preset such as Pure Writer or Worldbuilder.', 'Change keyboard shortcuts at the bottom of the page.'],
    example: 'In Editing, put Continuity alerts in the right panel. Your phone keeps its own simpler layout; changing one never changes the other.',
  },
  {
    id: 'devices', title: 'Phone and tablet', group: 'Making it yours', where: 'Open the app in a phone or tablet browser.',
    what: 'The same app adapts: one column and a tab bar on a phone, slide-over panels on a tablet.',
    steps: ['On a phone, use the tabs at the bottom: Write, Lore, Note, Goals, More.', 'While writing, the bar above the keyboard has Format, Search, Lore, Note and Dictate.', 'Swipe in from the left or right edge to open a panel.', 'Press Note to save a thought in two taps.'],
    example: 'On the bus: tap Note, type “Kael should hesitate at the door”, Save. It is in Notes / Ideas on your desktop after the next sync.',
  },
  {
    id: 'settings', title: 'Project settings and book details', group: 'Making it yours', page: 'settings',
    what: 'Title, author, cover, target and deadline; and the pages around your story.',
    steps: ['Edit the details and press Save changes.', 'Fill in Front and back matter: dedication, epigraph, copyright, about the author.', 'Choose the scene-break symbol.', 'Export a backup or delete the project from here.'],
    example: 'Add the dedication “For the patient.” It appears on its own page in the Reader preview.',
  },
  {
    id: 'tutorial', title: 'This tutorial', group: 'Making it yours', where: 'The Tutorial button, bottom right of every screen.',
    what: 'A short guide to each feature. It opens on the page you are looking at.',
    steps: ['Press Tutorial at any time.', 'Use Next and Back to walk through, or pick a topic from the list.', 'When you no longer need it, switch off “Show the Tutorial button” at the bottom of this panel.', 'To bring it back, use the Tutorial switch on the Library or in Project settings.'],
    example: 'On the Codex page, press Tutorial: it opens on “The Codex” with an example entry to try.',
  },
];

/** The lesson for where someone is in the app. Falls back to the first one. */
export function topicFor(pathname: string): Topic {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'project') return TOPICS.find((t) => t.id === (parts[0] === 'cloud' ? 'sync' : parts[0] === 'join' ? 'team' : 'library'))!;
  const page = parts[2] ?? '';
  return TOPICS.find((t) => t.page === page) ?? TOPICS.find((t) => t.id === 'overview')!;
}
