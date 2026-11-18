// THE CHAPTER EDITOR (FEATURES.md section 7): the heading, the formatting toolbar, the page, find and replace, links to
// codex entries, the word meter, and saving: shortly after typing stops and at least every five seconds while it goes
// on, a crash copy on every change, the recovered-writing banner, and the conflict choice when the chapter was saved
// somewhere else meanwhile. A port of flutter_app/lib/features/write/chapter_editor.dart (its core; the writing desk
// tools come in Phase 3b).

import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { SaveConflict } from '../../data/manuscriptService';
import { DeviceSpeaker } from '../../data/speech';
import { maxWidthOf, pageColours } from '../../domain/writingPrefs';
import {
  ChapterEditor,
  type ChapterEditorHandle,
  emptyUiState,
  type EditorUiState,
  type Lens,
  type LensSummary,
  type Sentence,
  type ChapterEndAction,
} from '../../editor/ChapterEditor';
import { type AtmosphereKey, atmospheres, type DeskTool, DeskSheet, LensBar, ListenBar, WritingSettingsSheet } from './DeskSheets';
import { setFocusMode, useDeskChoice, useDeskSetting, useFocusMode, useWritingPrefs } from './deskState';
import { DraftsSheet, VersionHistorySheet } from './HistorySheets';
import { ChapterSwitcher } from './ChapterSwitcher';
import {
  chapterEndOf,
  documentIsEmpty,
  firstPageView,
  marginCards,
  marginKey,
  marginNotesOf,
  nextNoteSlip,
  nextNotesKey,
  offersNoteOnLeaving,
  readNextNotes,
  storedNextNotes,
  withNextNote,
} from '../../domain/desk/pageAround';
import { nudgeLine, nudgeSeed, nudgesFor, nudgesKey, stuckAfterMs } from '../../domain/desk/nudges';
import { timeLapse } from '../../domain/manuscript/timeLapse';
import { RhythmReport, rhythmOf } from '../../domain/text/rhythm';
import { FirstPage, MarginCards, NextNoteSheet, NudgeChip, RhythmSheet, TimeLapseSheet } from './DeskViews';
import { type JsonMap, numOrNull, str } from '../../domain/json';
import { type StoryNode } from '../../domain/outline';
import { namesToFind } from '../../domain/characters/namedIn';
import { blockTexts, docBlocks, measureDoc } from '../../domain/prose';
import { ActionSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, type IconName, IconButton, Muted, OutlineButton } from '../kit';
import { useKeyboardVisible } from '../frame';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { nameAt } from '../../domain/characters/glance';
import { dayStartOf, freshInkKey, textAtDayStart } from '../../domain/desk/freshInk';
import { presentIn } from '../../domain/manuscript/inChapter';
import { placeholderTitle, titleIdeas, titleIdeasMinWords } from '../../domain/manuscript/titleIdeas';
import { completionsFor, type NameKey, pageKeys, wordAt } from '../../domain/text/nameKeys';
import { cardOf, GlanceSheet, GlanceStrip, InChapterStrip, linksIn, NameKeysRow, TitleIdeas, usePageCompany } from './PageCompany';
import { WordMeter } from './WordMeter';
import { findIn, onFind, takeFind } from './pendingFind';
import { GoalPledgeSheet } from './GoalPledgeSheet';
import { reportSprintWords, SprintBar, SprintButton, SprintCard, sprintRunning, useSprint } from './Sprint';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';

const categoryLabel: Record<string, string> = {
  character: 'Character',
  location: 'Place',
  faction: 'Faction',
  item: 'Item',
  power: 'Power',
  lore: 'Lore',
};

/** Where the caret goes when a chapter is opened from the contents' cards. */
export type Jump = 'end' | { block: number; start: number; end: number };

/** Save at most this long after typing stops, and at least this often while it goes on. */
const longestUnsavedMs = 5000;

export function EditorPane({
  novelId,
  node,
  kicker,
  onBack,
  onOpenNode,
  nodes,
  author,
  jumpTo = null,
  onJumped,
}: {
  novelId: string;
  node: StoryNode;
  /** "CHAPTER 3" or "CHAPTER 3 · SCENE". */
  kicker: string;
  /** On a phone: back to the contents. */
  onBack?: () => void;
  onOpenNode: (nodeId: string) => void;
  /** The novel's outline, for the chapter switcher and what follows this chapter. */
  nodes: readonly StoryNode[];
  /** The novel's author, who signs the end of the manuscript. */
  author: string;
  /** Where to put the caret once the chapter is open: a stretch of a paragraph (a gap), or the end. */
  jumpTo?: Jump | null;
  onJumped?: () => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const editor = useRef<ChapterEditorHandle>(null);
  const keyboardUp = useKeyboardVisible();

  // How many times the editor page has started: again after Android restarts a crashed page, which reopens the chapter.
  const [ready, setReady] = useState(0);
  const [ui, setUi] = useState<EditorUiState>(emptyUiState);
  const [readOnly, setReadOnly] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<{ doc: JsonMap; at: number } | null>(null);
  const [conflict, setConflict] = useState<JsonMap | null>(null);
  const [words, setWords] = useState({ now: node.wordCount, atOpen: node.wordCount });
  const [title, setTitle] = useState(node.title);
  const [findOpen, setFindOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, changePrefs] = useWritingPrefs();
  const focus = useFocusMode();
  const [typewriterOn, setTypewriterOn] = useDeskSetting('write.typewriter', true);
  const speaker = useRef(new DeviceSpeaker());
  const [listen, setListen] = useState<{ sentences: Sentence[]; index: number; playing: boolean } | null>(null);
  const [listenRate, setListenRate] = useState(1);
  const [lens, setLens] = useState<Lens>('none');
  const [lensSummary, setLensSummary] = useState<LensSummary | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [freshInk, setFreshInk] = useDeskSetting(freshInkKey, true);
  const [atmosphere, setAtmosphere] = useDeskChoice<AtmosphereKey>('write.atmosphere', atmospheres.map((a) => a.key), 'none');
  const [glanceOpen, setGlanceOpen] = useState<string | null>(null);
  const revision = useLibraryRevision();
  // Read when the chapter opens (the codex changes in Organize, not while writing).
  const company = usePageCompany(lib, novelId, ready);
  // Today's and this week's words, and the goals: read again after every save.
  const written = useMemo(() => lib.manuscript.wordsWritten(novelId), [lib, novelId, revision]);
  const goals = useMemo(() => lib.manuscript.wordGoals(novelId), [lib, novelId, revision]);
  const [goalsOpen, setGoalsOpen] = useState(false);

  // A sprint counts this chapter from its words when the sprint starts (or the chapter opens during one), and again a
  // moment after each change.
  const sprint = useSprint();
  const sprintOn = sprint.sprint !== null;
  const sprintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportSoon = useCallback(
    (n: number) => {
      if (!sprintRunning()) return;
      if (sprintTimer.current) clearTimeout(sprintTimer.current);
      sprintTimer.current = setTimeout(() => reportSprintWords(node.id, n), 300);
    },
    [node.id],
  );
  useEffect(() => {
    if (sprintOn) reportSprintWords(node.id, measureDoc(live.current.doc).words);
  }, [sprintOn, node.id]);
  // The page's text, read again a moment after typing stops: for who is on it and for title ideas.
  const [pageText, setPageText] = useState<{ read: boolean; all: string[]; prose: string[]; links: Record<string, number> }>({ read: false, all: [], prose: [], links: {} });
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readPage = useCallback((doc: JsonMap | null, later: boolean) => {
    if (pageTimer.current) clearTimeout(pageTimer.current);
    const read = () => {
      pageTimer.current = null;
      const blocks = docBlocks(doc);
      setPageText({ read: true, all: blocks.map((b) => b.text), prose: blocks.filter((b) => !b.heading).map((b) => b.text), links: linksIn(doc) });
    };
    if (later) pageTimer.current = setTimeout(read, 600);
    else read();
  }, []);
  useEffect(() => () => {
    if (pageTimer.current) clearTimeout(pageTimer.current);
  }, []);
  const listeningRef = useRef(false);
  listeningRef.current = listen !== null;

  // What is being edited, kept outside React's state so saving always sees the latest.
  const live = useRef({ rev: 0, doc: null as JsonMap | null, dirty: false, firstPendingAt: 0, conflict: false });
  const saveKey = `chapter:${novelId}:${node.id}`;

  // ---- saving

  const write = useCallback(() => {
    const l = live.current;
    if (!l.dirty || !l.doc || l.conflict) return;
    const doc = l.doc;
    try {
      l.rev = lib.manuscript.save(novelId, node.id, doc, { baseRev: l.rev });
      l.dirty = l.doc !== doc; // Typing that arrived during the save waits for the next one.
      l.firstPendingAt = l.dirty ? Date.now() : 0;
    } catch (e) {
      if (e instanceof SaveConflict) {
        // Nothing is overwritten and nothing is retried: the writer chooses.
        l.conflict = true;
        setConflict(doc);
        return;
      }
      throw e; // Kept and retried by the save controller, which says "Not saved" with the reason.
    }
  }, [lib, novelId, node.id]);

  const router = useRouter();
  const saveNow = useCallback(async () => {
    await editor.current?.flush();
    if (live.current.dirty) lib.saves.saveNow(saveKey, write);
  }, [lib, saveKey, write]);

  const onChange = useCallback(
    (doc: JsonMap) => {
      const l = live.current;
      if (l.conflict) return;
      // Typing stops Listen.
      if (listeningRef.current) {
        listeningRef.current = false;
        void speaker.current.stop();
        editor.current?.speaking(null);
        setListen(null);
      }
      l.doc = doc;
      l.dirty = true;
      if (!l.firstPendingAt) l.firstPendingAt = Date.now();
      setWords((w) => ({ ...w, now: measureDoc(doc).words }));
      readPage(doc, true);
      reportSoon(measureDoc(doc).words);
      try {
        lib.manuscript.saveDraft(novelId, node.id, doc, l.rev); // The crash copy.
      } catch {
        // The save itself reports any problem.
      }
      if (Date.now() - l.firstPendingAt >= longestUnsavedMs) lib.saves.saveNow(saveKey, write);
      else lib.saves.schedule(saveKey, write);
    },
    [lib, novelId, node.id, saveKey, write, readPage],
  );

  // ---- opening the chapter

  const open = useCallback(() => {
    const opened = lib.manuscript.open(novelId, node.id);
    live.current = { rev: opened.rev, doc: opened.doc, dirty: false, firstPendingAt: 0, conflict: false };
    setRecovered(opened.recovered);
    setConflict(null);
    const w = measureDoc(opened.doc).words;
    setWords({ now: w, atOpen: w });
    editor.current?.load(opened.doc);
    readPage(opened.doc, false);
    reportSprintWords(node.id, w);
    // Today's ink: the chapter as it stood when the day began.
    const before = textAtDayStart({
      node: lib.novels.row(novelId, 'chapters', node.id),
      saved: lib.novels.row(novelId, 'chapterContents', node.id),
      revisions: lib.novels.rowsForNode(novelId, 'chapterRevisions', node.id),
      dayStart: dayStartOf(Date.now()),
    });
    editor.current?.ink(freshInkRef.current, before);
  }, [lib, novelId, node.id, readPage]);
  const freshInkRef = useRef(freshInk);
  freshInkRef.current = freshInk;
  useEffect(() => {
    if (ready > 0) editor.current?.ink(freshInk);
  }, [ready, freshInk]);
  useEffect(() => {
    if (ready > 0) editor.current?.atmosphere(atmosphere);
  }, [ready, atmosphere]);

  useEffect(() => {
    if (ready > 0) open();
  }, [ready, open]);

  // A gap to fill, or the end to carry on from: after the chapter has opened.
  useEffect(() => {
    if (ready === 0 || !jumpTo) return;
    if (jumpTo === 'end') editor.current?.focus(true);
    else editor.current?.select(jumpTo.block, jumpTo.start, jumpTo.end);
    onJumped?.();
  }, [ready, jumpTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // A passage asked for (search, the index, "Read it there"): its words selected once the chapter is in, and again
  // whenever one is asked for while this chapter is open (pendingFind.ts).
  useEffect(() => {
    if (ready === 0) return;
    const land = () => {
      const f = takeFind(node.id);
      if (f === null) return;
      const at = findIn(blockTexts(live.current.doc), f.term, f.block);
      if (at !== null) editor.current?.select(at.block, at.start, at.end);
    };
    land();
    return onFind((f) => {
      if (f.nodeId === node.id) land();
    });
  }, [ready, node.id]);

  useEffect(() => setTitle(node.title), [node.title]);

  // Leaving the chapter, or the app going to the background, saves what is typed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void saveNow();
    });
    return () => {
      sub.remove();
      if (live.current.dirty && !live.current.conflict) lib.saves.saveNow(saveKey, write);
    };
  }, [lib, saveKey, write, saveNow]);

  // ---- recovery and conflicts

  const keepRecovered = () => {
    if (!recovered) return;
    editor.current?.load(recovered.doc);
    live.current = { ...live.current, doc: recovered.doc, dirty: true, firstPendingAt: Date.now() };
    lib.saves.saveNow(saveKey, write);
    setRecovered(null);
    setWords((w) => ({ ...w, now: measureDoc(recovered.doc).words }));
  };

  const keepSaved = () => {
    lib.manuscript.discardDraft(novelId, node.id);
    setRecovered(null);
  };

  const keepMine = () => {
    const mine = conflict;
    if (!mine) return;
    try {
      live.current.rev = lib.manuscript.save(novelId, node.id, mine, { baseRev: live.current.rev, force: true });
      live.current = { ...live.current, conflict: false, dirty: false, firstPendingAt: 0 };
      setConflict(null);
      toast('Your text is saved. The other one is kept in version history.');
    } catch (e) {
      toast(`It could not be saved (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  const useSaved = () => {
    const mine = conflict;
    if (mine) lib.manuscript.keepInHistory(novelId, node.id, mine, 'conflict', 'Set aside in a conflict');
    setConflict(null);
    open();
    toast('Your text is kept in version history.');
  };

  // ---- version history and drafts

  /** Saves what is typed before history or a draft changes the text; the revision it is saved at. */
  const beforeChange = useCallback(async () => {
    await editor.current?.flush();
    if (live.current.conflict) throw new Error('settle the save conflict first');
    if (live.current.dirty) lib.saves.saveNow(saveKey, write);
    if (live.current.dirty) throw new Error('what you typed could not be saved yet');
    return live.current.rev;
  }, [lib, saveKey, write]);

  const drafts = useMemo(
    () => ({ active: lib.manuscript.activeDraft(novelId, node.id), others: lib.manuscript.alternateDrafts(novelId, node.id).length }),
    [lib, novelId, node.id, draftsOpen, ready], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- what follows the chapter

  /** Opens another page, what is typed here saved first. */
  const openOther = useCallback(
    async (id: string) => {
      await saveNow();
      onOpenNode(id);
    },
    [saveNow, onOpenNode],
  );

  // A note for next time (#116), kept on this device: one to a chapter.
  const notesKey = nextNotesKey(novelId);
  const [notesTick, setNotesTick] = useState(0);
  const notes = useMemo(() => readNextNotes(lib.settings.read(notesKey)), [lib, notesKey, notesTick]);
  const note = notes.get(node.id);
  const [noteSheet, setNoteSheet] = useState<{ leaving: boolean } | null>(null);
  const keepNote = (text: string) => {
    const next = withNextNote(notes, node.id, text, Date.now());
    lib.saves.saveNow(`setting:${notesKey}`, () => {
      lib.settings.write(notesKey, storedNextNotes(next));
      lib.novels.touchSettings();
    });
    setNotesTick((t) => t + 1);
  };
  /** Back to the contents: what is typed saved first, and after a real sitting, a note offered. */
  const leave = async () => {
    await saveNow();
    if (offersNoteOnLeaving(words.now - words.atOpen, note !== undefined)) setNoteSheet({ leaving: true });
    else onBack?.();
  };

  const end = useMemo(() => chapterEndOf(nodes, node, author), [nodes, node, author]);
  const slip = nextNoteSlip(note, !focus);
  useEffect(() => {
    if (ready === 0) return;
    editor.current?.chapterEnd({
      kicker: end.heading,
      title: end.title,
      note: end.detail ?? '',
      button: end.action,
      author: end.signature,
      slip: slip === 'pinned' && note ? { kind: 'pinned', text: note.text } : slip === 'offer' ? { kind: 'offer' } : null,
    });
  }, [ready, end, slip, note?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChapterEnd = async (action: ChapterEndAction) => {
    if (action === 'note') {
      setNoteSheet({ leaving: false });
      return;
    }
    if (action === 'noteDone') {
      keepNote('');
      toast('The note is put away.');
      return;
    }
    if (end.next) {
      await openOther(end.next.id);
      return;
    }
    try {
      await saveNow();
      onOpenNode(lib.manuscript.create(novelId, 'chapter', end.beginIn).id);
    } catch (e) {
      toast(`The next chapter could not be made (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  // ---- the plan around the page: the margin (#102), the first page (#114), nudges (#113)

  const planNotes = useMemo(() => marginNotesOf((c) => lib.novels.rowsIn(novelId, c), node.id), [lib, novelId, node.id, ready]);
  const cards = useMemo(() => marginCards(planNotes), [planNotes]);
  const [marginBeside, setMarginBeside] = useDeskSetting(marginKey, true);
  const [marginOpen, setMarginOpen] = useState(false);
  const roomForMargin = width >= 1100;
  const marginShown = roomForMargin && marginBeside && !focus;
  // The chapter's plan (Plan › Scene board): the page is kept first, then its plan opens.
  const openPlan = () => {
    void saveNow().then(() => router.navigate(`/plan/chapter/${encodeURIComponent(node.id)}` as never));
  };

  const [nudgesOn, setNudgesOn] = useDeskSetting(nudgesKey, true);
  const [stuck, setStuck] = useState(false);
  const [nudgeRound, setNudgeRound] = useState(0);
  useEffect(() => {
    setStuck(false);
    if (!nudgesOn || readOnly !== null || !ui.focused) return;
    const t = setTimeout(() => setStuck(true), stuckAfterMs);
    return () => clearTimeout(t);
  }, [nudgesOn, readOnly, ui.focused, ui.caret?.offset, ui.caret?.block, words.now, nudgeRound]);

  // ---- rhythm (#107) and time-lapse (#108)

  const [rhythmOpen, setRhythmOpen] = useState(false);
  const [lapseOpen, setLapseOpen] = useState(false);
  const rhythm = useMemo(
    () => (rhythmOpen ? rhythmOf(docBlocks(live.current.doc).map((b) => b.text)) : RhythmReport.empty),
    [rhythmOpen],
  );
  const frames = useMemo(() => {
    if (!lapseOpen) return [];
    const draft = str(lib.novels.row(novelId, 'chapters', node.id)?.['branchName'], 'Main draft');
    const saved = lib.novels.row(novelId, 'chapterContents', node.id);
    return timeLapse([
      ...lib.manuscript
        .revisions(novelId, node.id)
        .filter((r) => str(r['branchName'], 'Main draft') === draft)
        .map((r) => ({ at: Math.trunc(numOrNull(r['savedAt']) ?? numOrNull(r['capturedAt']) ?? 0), paragraphs: blockTexts(r['doc']) })),
      ...(saved ? [{ at: Math.trunc(numOrNull(saved['savedAt']) ?? Date.now()), paragraphs: blockTexts(saved['doc']) }] : []),
    ]);
  }, [lapseOpen, lib, novelId, node.id]);

  // ---- the title

  const saveTitle = () => {
    const next = title.trim();
    if (!next || next === node.title) {
      setTitle(node.title);
      return;
    }
    try {
      lib.manuscript.rename(novelId, node.id, next);
    } catch (e) {
      toast(`It could not be renamed (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  // ---- split

  const split = async () => {
    await saveNow();
    const r = await editor.current?.split();
    if (!r) return;
    if (!r.ok || !r.head || !r.tail) {
      toast(r.reason ?? 'It could not be split.', { error: true });
      return;
    }
    try {
      const newId = lib.manuscript.split(novelId, node.id, r.head, r.tail);
      toast(`Split: the rest is now “${node.title} (continued)”`, { action: { label: 'Open', run: () => onOpenNode(newId) } });
      open();
    } catch (e) {
      toast(`It could not be split (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  // ---- links to entries

  // The cast, for Voices: each character's names (name and aliases), and a colour that is always theirs.
  const cast = useMemo(() => {
    const characters = lib.novels
      .rowsIn(novelId, 'loreEntries')
      .filter((r) => r['category'] === 'character')
      .map((r) => ({ id: str(r['id']), name: str(r['name']), category: 'character' }));
    const profiles = new Map(
      lib.novels.rowsIn(novelId, 'characterProfiles').map((p) => [
        str(p['entryId']),
        {
          aliases: Array.isArray(p['aliases']) ? p['aliases'].filter((a): a is string => typeof a === 'string') : [],
          epithet: str(p['epithet']),
        },
      ]),
    );
    const names = namesToFind(characters, profiles);
    const colours: Record<string, string> = {};
    for (const c of characters) colours[c.id] = castColour(c.id);
    // The name each is shown by: their name as written.
    const shown: Record<string, string> = {};
    for (const c of characters) shown[c.id] = c.name.trim();
    return { names, colours, shown };
  }, [lib, novelId]);

  useEffect(() => {
    if (ready > 0) editor.current?.lens(lens, cast.names, cast.colours);
  }, [ready, lens, cast]);

  const entries = useMemo(
    () =>
      lib.novels
        .rowsIn(novelId, 'loreEntries')
        .map((r) => ({ id: str(r['id']), name: str(r['name']) || 'Unnamed', kind: categoryLabel[str(r['category'])] ?? 'Entry' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lib, novelId, linkOpen], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const linked = ui.linkedEntry ? (entries.find((e) => e.id === ui.linkedEntry) ?? null) : null;

  // ---- who and what the page names

  const present = useMemo(() => presentIn(pageText.all, company.names, pageText.links), [pageText, company]);
  const presentIds = useMemo(() => present.map((p) => p.id), [present]);

  // Title ideas while the chapter has a stand-in title: its words against the other chapters'.
  const stoodIn = placeholderTitle(node.title);
  const others = useMemo(
    () =>
      stoodIn
        ? lib.novels
            .rowsIn(novelId, 'chapterContents')
            .filter((r) => str(r['id']) !== node.id)
            .map((r) =>
              docBlocks(r['doc'])
                .filter((b) => !b.heading)
                .map((b) => b.text)
                .join('\n'),
            )
        : [],
    [lib, novelId, node.id, stoodIn],
  );
  const ideas = useMemo(() => {
    if (!stoodIn) return [];
    if (pageText.prose.join(' ').split(/\s+/).filter((w) => w !== '').length < titleIdeasMinWords) return [];
    // Places and things before people where they are named as often.
    const isPerson = (id: string) => company.entries.get(id)?.['category'] === 'character';
    const names = [...present]
      .sort((a, b) => b.mentions - a.mentions || Number(isPerson(a.id)) - Number(isPerson(b.id)))
      .map((p) => str(company.entries.get(p.id)?.['name']).trim())
      .filter(Boolean);
    return titleIdeas({ paragraphs: pageText.prose, others, present: names });
  }, [stoodIn, pageText, others, present, company]);
  const pickTitle = (t: string) => {
    try {
      lib.manuscript.rename(novelId, node.id, t);
      setTitle(t);
      toast(`Renamed “${t}”`);
    } catch (e) {
      toast(`It could not be renamed (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  // The caret: the name being typed, or the name it is on.
  const caret = ui.focused ? ui.caret : null;
  const typing = caret ? wordAt(caret.text, caret.offset) : null;
  const completions = typing ? completionsFor(typing.word, company.names, presentIds) : [];
  const nameKeys = completions.length > 0 ? completions : phone && caret ? pageKeys(company.names, presentIds) : [];
  const onName = caret && completions.length === 0 ? nameAt(caret.text, caret.offset, company.names) : null;
  const glance = onName ? cardOf(company, onName.id) : null;
  const pressKey = (k: NameKey) => {
    if (completions.length > 0 && typing) {
      editor.current?.insert(typing.word.length, k.name);
      return;
    }
    const before = caret && caret.offset > 0 ? caret.text[caret.offset - 1] : ' ';
    const lead = before.trim() === '' || '(“"‘\'—–-'.includes(before) ? '' : ' ';
    editor.current?.insert(0, `${lead}${k.name}`);
  };
  const glanceCard = glanceOpen ? cardOf(company, glanceOpen) : null;

  // ---- layout

  const page = pageColours(prefs.page);
  const look = useMemo(
    () => ({
      font: prefs.font,
      fontSize: prefs.fontSize,
      lineHeight: prefs.lineHeight,
      paragraphSpacing: prefs.paragraphSpacing,
      maxWidth: maxWidthOf(prefs.width),
      padding: phone ? 18 : 28,
      page: { background: page.background, text: page.text, muted: page.muted },
    }),
    [prefs, page, phone],
  );
  const editable = readOnly === null && !conflict;
  const delta = words.now - words.atOpen;

  // Focus mode's typewriter and "set like a book" go to the page whenever they change, and when it (re)starts.
  useEffect(() => {
    if (ready > 0) editor.current?.modes(focus && typewriterOn, prefs.setLikeABook);
  }, [ready, focus, typewriterOn, prefs.setLikeABook]);
  // Leaving the chapter ends focus mode.
  // (A sprint keeps its focus mode across chapters.)
  useEffect(() => () => {
    if (!sprintRunning()) setFocusMode(false);
  }, []);

  // ---- listen

  const startListening = async () => {
    if (!(await speaker.current.available())) {
      toast('This device has no voice to read with.', { error: true });
      return;
    }
    Keyboard.dismiss();
    editor.current?.blur();
    const sentences = (await editor.current?.sentences()) ?? [];
    if (sentences.length === 0) {
      toast('There is nothing to read from here.');
      return;
    }
    setListen({ sentences, index: 0, playing: true });
  };

  // Reads the current sentence; when it has been said, moves on to the next.
  useEffect(() => {
    if (!listen?.playing) return;
    const s = listen.sentences[listen.index];
    if (!s) {
      editor.current?.speaking(null);
      setListen(null);
      return;
    }
    let cancelled = false;
    editor.current?.speaking({ from: s.from, to: s.to });
    void speaker.current.say(s.text, { rate: listenRate }).then((said) => {
      if (cancelled) return;
      if (!said) {
        setListen((l) => (l ? { ...l, playing: false } : l));
        return;
      }
      setListen((l) => (l && l.playing && l.index === listen.index ? { ...l, index: l.index + 1 } : l));
    });
    return () => {
      cancelled = true;
    };
  }, [listen?.playing, listen?.index, listenRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = () => {
    void speaker.current.stop();
    editor.current?.speaking(null);
    setListen(null);
  };

  const deskTools: DeskTool[] = [
    { key: 'settings', label: 'Writing settings', note: 'Font, size, spacing, width and page colour.', icon: 'format-size', onPress: () => setSettingsOpen(true) },
    { key: 'focus', label: 'Focus mode', note: 'Only the page; the typewriter keeps your line steady.', icon: 'target', on: focus, onPress: () => setFocusMode(!focus) },
    { key: 'listen', label: 'Listen', note: 'The chapter read aloud by this phone’s voice, from the caret.', icon: 'headphones', on: listen !== null, onPress: () => (listen ? stopListening() : void startListening()) },
    { key: 'pencil', label: 'Red pencil', note: 'Echoes, long sentences and fillers, marked: never changed.', icon: 'pencil', on: lens === 'pencil', onPress: () => setLens(lens === 'pencil' ? 'none' : 'pencil') },
    { key: 'voices', label: 'Voices', note: 'Each line of dialogue in its speaker’s colour; narration dimmed.', icon: 'account-voice', on: lens === 'voices', onPress: () => { Keyboard.dismiss(); setLens(lens === 'voices' ? 'none' : 'voices'); } },
    { key: 'gap', label: 'Leave a gap', note: 'Mark a place to come back to: [[ ]] at the caret, or around your words.', icon: 'note-text-outline', onPress: () => editor.current?.gap() },
    { key: 'history', label: 'Version history', note: 'Earlier versions of this chapter: compare, restore, or save one now.', icon: 'history', onPress: () => setHistoryOpen(true) },
    { key: 'drafts', label: 'Drafts', note: 'Other drafts of this chapter: only the one in use counts.', icon: 'file-multiple-outline', onPress: () => setDraftsOpen(true) },
    { key: 'find', label: 'Find and replace', note: 'Every match, with Replace and Replace all.', icon: 'magnify', onPress: () => setFindOpen(true) },
    {
      key: 'margin',
      label: 'The margin',
      note: 'Index cards: last time, this chapter’s plan, its beats, who is on the page, threads here.',
      icon: 'cards-outline',
      on: roomForMargin ? marginBeside : undefined,
      onPress: () => (roomForMargin ? setMarginBeside(!marginBeside) : setMarginOpen(true)),
    },
    { key: 'rhythm', label: 'Rhythm', note: 'The chapter’s sentence lengths as a waveform; runs of one beat marked.', icon: 'waveform', onPress: () => void saveNow().then(() => setRhythmOpen(true)) },
    { key: 'lapse', label: 'Time-lapse', note: 'Watch the chapter grow across its saved copies.', icon: 'movie-open-outline', onPress: () => void saveNow().then(() => setLapseOpen(true)) },
    {
      key: 'note',
      label: 'A note for next time',
      note: note ? `Pinned: ${note.text}` : 'One line for when you come back: what happens next.',
      icon: 'pin-outline',
      on: note !== undefined,
      onPress: () => setNoteSheet({ leaving: false }),
    },
    { key: 'nudges', label: 'Stuck? nudges', note: 'After 40 seconds still, one prompt from your plan or the last line. Never writes.', icon: 'lightbulb-on-outline', on: nudgesOn, onPress: () => setNudgesOn(!nudgesOn) },
  ];

  const tool = (icon: IconName, label: string, onPress: () => void, active = false, disabled = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tool, active && styles.toolOn, disabled && styles.toolOff]}
    >
      <Icon name={icon} size={22} color={active ? colors.onGold : colors.text} />
    </Pressable>
  );

  // On a phone with the keyboard up, the formatting and the name keys ride above it: the ink tray (#89).
  const tray = phone && keyboardUp && editable && !focus;
  const toolbarButtons = (
    <>
      {tool('undo', 'Undo', () => editor.current?.command('undo'), false, !ui.canUndo)}
      {tool('redo', 'Redo', () => editor.current?.command('redo'), false, !ui.canRedo)}
      <View style={styles.sep} />
      {tool('format-bold', 'Bold', () => editor.current?.command('bold'), ui.bold)}
      {tool('format-italic', 'Italic', () => editor.current?.command('italic'), ui.italic)}
      {tool('format-underline', 'Underline', () => editor.current?.command('underline'), ui.underline)}
      {tool('format-strikethrough', 'Strikethrough', () => editor.current?.command('strike'), ui.strike)}
      <View style={styles.sep} />
      {tool(blockIcon(ui.block), 'Paragraph style', () => setBlockOpen(true), ui.block !== 'paragraph')}
      {tool('format-list-bulleted', 'Bulleted list', () => editor.current?.command('bullet'), ui.bullet)}
      {tool('format-list-numbered', 'Numbered list', () => editor.current?.command('ordered'), ui.ordered)}
      {tool(alignIcon(ui.align), 'Alignment', () => setAlignOpen(true), ui.align !== 'left')}
      <View style={styles.sep} />
      {tool('link-variant', 'Link to a character or entry', () => setLinkOpen(true), false, ui.selectionEmpty)}
      {ui.linkedEntry && tool('link-variant-off', 'Unlink', () => editor.current?.unlink())}
      {tool('note-text-outline', 'Leave a gap', () => editor.current?.gap())}
      {tool('call-split', 'Split here', split)}
    </>
  );

  return (
    <View style={styles.pane}>
      {focus && (
        <View style={styles.focusBar}>
          <Chip label="Typewriter" icon="typewriter" selected={typewriterOn} onPress={() => setTypewriterOn(!typewriterOn)} />
          <View style={styles.flex} />
          <OutlineButton label="Exit focus" icon="fullscreen-exit" compact onPress={() => setFocusMode(false)} />
        </View>
      )}
      <View style={[styles.header, focus && styles.hidden]}>
        {onBack && <IconButton icon="arrow-left" label="Back to the contents" onPress={() => void leave()} />}
        <View style={styles.flex}>
          {phone ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${kicker}. The chapters`} onPress={() => setSwitcherOpen(true)} style={styles.kickerButton} hitSlop={8}>
              <Text style={styles.kicker}>{kicker}</Text>
              <Icon name="chevron-down" size={16} color={colors.gold} />
            </Pressable>
          ) : (
            <Text style={styles.kicker}>{kicker}</Text>
          )}
          {drafts.others > 0 && (
            <Pressable accessibilityRole="button" onPress={() => setDraftsOpen(true)} style={styles.draftChip} hitSlop={6}>
              <Icon name="file-multiple-outline" size={14} color={colors.sky} />
              <Text style={styles.draftText} numberOfLines={1}>
                {drafts.active} · {drafts.others} {drafts.others === 1 ? 'other' : 'others'}
              </Text>
            </Pressable>
          )}
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            onSubmitEditing={saveTitle}
            placeholder={`Untitled ${node.kind ?? 'chapter'}`}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Title"
            style={styles.title}
            selectionColor={colors.gold}
            returnKeyType="done"
          />
        </View>
        <IconButton icon="magnify" label="Find and replace" onPress={() => setFindOpen((v) => !v)} color={findOpen ? colors.gold : colors.text} />
        {phone ? (
          <IconButton icon="toolbox-outline" label="Desk: the writing tools" onPress={() => setDeskOpen(true)} color={colors.gold} />
        ) : (
          // The desk's tools as icons on a wide screen (#100).
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deskIcons}>
            {deskTools
              .filter((t) => t.key !== 'find')
              .map((t) => (
                <IconButton key={t.key} icon={t.icon} label={t.label} onPress={t.onPress} color={t.on ? colors.gold : colors.text} />
              ))}
          </ScrollView>
        )}
      </View>
      <View style={[styles.ornament, focus && styles.hidden]}>
        <View style={styles.rule} />
        <Icon name="rhombus-outline" size={14} />
        <View style={styles.rule} />
      </View>

      {!focus && !tray && <TitleIdeas ideas={ideas} onPick={pickTitle} />}
      {!focus && !tray && <InChapterStrip present={present} company={company} colourOf={castColour} onOpen={setGlanceOpen} />}
      {editable && !focus && !tray && (
        <ScrollView style={styles.toolbarScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar} keyboardShouldPersistTaps="always">
          {toolbarButtons}
        </ScrollView>
      )}
      {editable && !focus && !phone && completions.length > 0 && <NameKeysRow keys={completions} completing onPress={pressKey} />}

      {recovered && (
        <Banner icon="lifebuoy" tone={colors.sky}>
          <Text style={styles.bannerText}>
            Unsaved writing from {new Date(recovered.at).toLocaleString()} was recovered. Keep it, or keep the saved text?
          </Text>
          <View style={styles.bannerButtons}>
            <GoldButton label="Keep the recovered writing" onPress={keepRecovered} compact />
            <OutlineButton label="Keep the saved text" onPress={keepSaved} compact tone="muted" />
          </View>
        </Banner>
      )}
      {readOnly && (
        <Banner icon="lock-outline" tone={colors.gold}>
          <Text style={styles.bannerText}>Read only: {readOnly} Nothing in it is changed by opening it.</Text>
        </Banner>
      )}
      {linked && editable && (
        <View style={styles.linkBar}>
          <Icon name="link-variant" size={18} color={colors.gold} />
          <Text style={styles.linkText} numberOfLines={1}>
            Linked to {linked.name} ({linked.kind})
          </Text>
        </View>
      )}
      {ui.linkedEntry && !linked && editable && (
        <View style={styles.linkBar}>
          <Icon name="link-variant-off" size={18} color={colors.muted} />
          <Text style={styles.linkText}>Linked to an entry that was deleted. The words are kept.</Text>
        </View>
      )}

      {findOpen && !focus && (
        <FindBar
          onFind={(q, c, w) => (q ? editor.current?.find(q, c, w) : editor.current?.clearFind())}
          onStep={(d) => editor.current?.findStep(d)}
          onReplace={(t) => editor.current?.replace(t)}
          onReplaceAll={(t, n) => {
            editor.current?.replaceAll(t);
            toast(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}`, { action: { label: 'Undo', run: () => editor.current?.command('undo') } });
          }}
          onClose={() => {
            editor.current?.clearFind();
            setFindOpen(false);
          }}
          editable={editable}
          registerResult={(fn) => (findResult.current = fn)}
        />
      )}

      {lens !== 'none' && lensSummary && lensSummary.lens === lens && !focus && (
        <LensBar
          summary={lensSummary}
          speakerName={(id) => (id ? (cast.shown[id] ?? 'Someone') : 'Nobody named')}
          speakerColour={(id) => (id ? (cast.colours[id] ?? colors.muted) : colors.muted)}
          onNext={(key) => editor.current?.lensNext(key)}
          onClose={() => setLens('none')}
        />
      )}
      {listen && (
        <ListenBar
          index={listen.index}
          total={listen.sentences.length}
          playing={listen.playing}
          rate={listenRate}
          onToggle={() => {
            if (listen.playing) void speaker.current.stop();
            setListen({ ...listen, playing: !listen.playing });
          }}
          onStep={(d) => {
            void speaker.current.stop();
            setListen({ ...listen, index: Math.max(0, Math.min(listen.sentences.length - 1, listen.index + d)) });
          }}
          onRate={() => {
            void speaker.current.stop();
            setListenRate(listenRate === 1 ? 1.25 : listenRate === 1.25 ? 0.8 : 1);
          }}
          onClose={stopListening}
        />
      )}

      {editable && !focus && !tray && pageText.read && documentIsEmpty(pageText.all) && (
        <FirstPage view={firstPageView(planNotes, marginShown)} onPlan={openPlan} />
      )}
      <View style={styles.deskRow}>
        <View style={[styles.page, !phone && !focus && styles.paper, { backgroundColor: page.background }, focus && styles.pageFocus]}>
        <ChapterEditor
          ref={editor}
          look={look}
          onReady={() => setReady((n) => n + 1)}
          onLoaded={(ok, reason) => setReadOnly(ok ? null : reason)}
          onChange={onChange}
          onState={setUi}
          onFind={(count, index) => findResult.current?.(count, index)}
          onError={(m) => toast(`The editor reported a problem (${m}).`, { error: true })}
          onLens={setLensSummary}
          onChapterEnd={(a) => void onChapterEnd(a)}
        />
        {stuck && editable && (
          <View style={styles.nudgeSpot} pointerEvents="box-none">
            <NudgeChip
              key={nudgeRound}
              nudges={nudgesFor(planNotes, {
                lastLine: nudgeLine(pageText.all, ui.caret && ui.caret.block >= 0 ? ui.caret.block : null),
                seed: nudgeSeed(Date.now(), node.id),
              })}
              onDismiss={() => setNudgeRound((r) => r + 1)}
            />
          </View>
        )}
        </View>
        {marginShown && (
          <ScrollView style={styles.margin} contentContainerStyle={styles.marginBody}>
            <MarginCards cards={cards} onPlan={openPlan} />
          </ScrollView>
        )}
      </View>

      {!focus && !tray && !phone && glance && <GlanceStrip card={glance} colour={castColour(glance.id)} onOpen={() => setGlanceOpen(glance.id)} />}
      {sprint.sprint ? (
        <SprintBar sprint={sprint.sprint} />
      ) : sprint.result ? (
        <SprintCard lib={lib} result={sprint.result} />
      ) : focus ? null : tray ? (
        <View style={styles.tray}>
          {glance ? (
            <GlanceStrip card={glance} colour={castColour(glance.id)} onOpen={() => setGlanceOpen(glance.id)} />
          ) : (
            <NameKeysRow keys={nameKeys} completing={completions.length > 0} onPress={pressKey} />
          )}
          <View style={styles.trayRow}>
            <ScrollView style={styles.flex} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar} keyboardShouldPersistTaps="always">
              {toolbarButtons}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="Done: put the keyboard away" onPress={() => Keyboard.dismiss()} style={styles.doneKey}>
              <Icon name="keyboard-close" size={20} color={colors.gold} />
            </Pressable>
          </View>
        </View>
      ) : !keyboardUp || !phone ? (
        <WordMeter
          words={words.now}
          minutes={Math.max(words.now ? 1 : 0, Math.round(words.now / 250))}
          session={delta}
          today={written.today}
          week={written.week}
          daily={goals.daily}
          weekly={goals.weekly}
          onGoals={() => setGoalsOpen(true)}
          sprint={<SprintButton lib={lib} />}
        />
      ) : (
        <View style={styles.keyboardBar}>
          <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} style={styles.doneKey}>
            <Icon name="keyboard-close" size={20} color={colors.gold} />
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      )}

      <ActionSheet
        visible={blockOpen}
        title="Paragraph style"
        onClose={() => setBlockOpen(false)}
        actions={[
          { label: 'Paragraph', icon: 'format-paragraph', onPress: () => editor.current?.command('paragraph') },
          { label: 'Heading 1', icon: 'format-header-1', onPress: () => editor.current?.command('h1') },
          { label: 'Heading 2', icon: 'format-header-2', onPress: () => editor.current?.command('h2') },
          { label: 'Heading 3', icon: 'format-header-3', onPress: () => editor.current?.command('h3') },
          { label: 'Quotation', icon: 'format-quote-close', onPress: () => editor.current?.command('quote') },
        ]}
      />
      <ActionSheet
        visible={alignOpen}
        title="Alignment"
        onClose={() => setAlignOpen(false)}
        actions={(['left', 'center', 'right', 'justify'] as const).map((a) => ({
          label: a[0].toUpperCase() + a.slice(1),
          icon: alignIcon(a),
          onPress: () => editor.current?.command('align', a),
        }))}
      />
      <DeskSheet visible={deskOpen} tools={deskTools} onClose={() => setDeskOpen(false)} />
      <ChapterSwitcher visible={switcherOpen} nodes={nodes} currentId={node.id} onOpen={openOther} onClose={() => setSwitcherOpen(false)} />
      <VersionHistorySheet
        visible={historyOpen}
        novelId={novelId}
        nodeId={node.id}
        currentDoc={() => live.current.doc}
        onBeforeChange={beforeChange}
        onRestored={open}
        onClose={() => setHistoryOpen(false)}
      />
      <DraftsSheet
        visible={draftsOpen}
        novelId={novelId}
        nodeId={node.id}
        onBeforeChange={beforeChange}
        onTextReplaced={open}
        onClose={() => setDraftsOpen(false)}
      />
      <WritingSettingsSheet
        visible={settingsOpen}
        prefs={prefs}
        onChange={changePrefs}
        onClose={() => setSettingsOpen(false)}
        atmosphere={atmosphere}
        onAtmosphere={setAtmosphere}
        freshInk={freshInk}
        onFreshInk={setFreshInk}
      />
      <Sheet visible={marginOpen} onClose={() => setMarginOpen(false)} title="The margin">
        <MarginCards cards={cards} onPlan={openPlan} />
      </Sheet>
      <RhythmSheet
        visible={rhythmOpen}
        title={node.title || 'Untitled'}
        report={rhythm}
        onPick={(sentence) => {
          setRhythmOpen(false);
          editor.current?.select(sentence.block, sentence.start, sentence.end);
        }}
        onClose={() => setRhythmOpen(false)}
      />
      <TimeLapseSheet visible={lapseOpen} title={node.title || 'Untitled'} frames={frames} onClose={() => setLapseOpen(false)} />
      <NextNoteSheet
        visible={noteSheet !== null}
        title={node.title || 'Untitled'}
        leaving={noteSheet?.leaving ?? false}
        initial={note?.text ?? ''}
        onPin={(text) => {
          const leaving = noteSheet?.leaving;
          keepNote(text);
          setNoteSheet(null);
          toast('Pinned. It waits under your last line.');
          if (leaving) onBack?.();
        }}
        onDismiss={() => {
          const leaving = noteSheet?.leaving;
          setNoteSheet(null);
          if (leaving) onBack?.();
        }}
      />
      <GoalPledgeSheet
        visible={goalsOpen}
        novelId={novelId}
        words={nodes.reduce((t, n) => t + (n.kind === 'chapter' || n.kind === 'scene' ? n.wordCount : 0), 0)}
        target={lib.library.novel(novelId)?.targetWordCount ?? null}
        onClose={() => setGoalsOpen(false)}
      />
      <GlanceSheet card={glanceCard} colour={glanceOpen ? castColour(glanceOpen) : colors.gold} onClose={() => setGlanceOpen(null)} />
      <EntityPicker
        visible={linkOpen}
        entries={entries}
        onPick={(id) => {
          setLinkOpen(false);
          editor.current?.link(id);
        }}
        onClose={() => setLinkOpen(false)}
      />
      <Sheet
        visible={conflict !== null}
        onClose={() => {}}
        title="Saved somewhere else"
        footer={
          <>
            <OutlineButton label="Use the saved text" onPress={useSaved} style={styles.flex} />
            <GoldButton label="Keep my text" onPress={keepMine} style={styles.flex} />
          </>
        }
      >
        <Text style={styles.message}>
          This chapter was saved somewhere else since you opened it. Nothing was overwritten. Whichever you choose, the
          other text is kept in version history.
        </Text>
      </Sheet>
    </View>
  );
}

// The find bar reports results through this, set by the bar.
const findResult: { current: ((count: number, index: number) => void) | null } = { current: null };

function blockIcon(block: EditorUiState['block']): IconName {
  return ({ paragraph: 'format-paragraph', h1: 'format-header-1', h2: 'format-header-2', h3: 'format-header-3', quote: 'format-quote-close' } as const)[block];
}

function alignIcon(align: EditorUiState['align']): IconName {
  return ({ left: 'format-align-left', center: 'format-align-center', right: 'format-align-right', justify: 'format-align-justify' } as const)[align];
}

function Banner({ icon, tone, children }: { icon: IconName; tone: string; children: ReactNode }) {
  return (
    <View style={[styles.banner, { borderColor: tone }]} accessibilityRole="alert">
      <Icon name={icon} size={20} color={tone} />
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

/** FIND AND REPLACE (#91): live count, previous and next, match case, whole words; Replace and Replace all keep each
 * match's formatting, and Replace all can be undone in one step. */
function FindBar({
  onFind,
  onStep,
  onReplace,
  onReplaceAll,
  onClose,
  editable,
  registerResult,
}: {
  onFind: (query: string, matchCase: boolean, wholeWords: boolean) => void;
  onStep: (delta: number) => void;
  onReplace: (text: string) => void;
  onReplaceAll: (text: string, count: number) => void;
  onClose: () => void;
  editable: boolean;
  registerResult: (fn: (count: number, index: number) => void) => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const [result, setResult] = useState({ count: 0, index: 0 });

  useEffect(() => {
    registerResult((count, index) => setResult({ count, index }));
  }, [registerResult]);
  useEffect(() => {
    const t = setTimeout(() => onFind(query, matchCase, wholeWords), 150);
    return () => clearTimeout(t);
  }, [query, matchCase, wholeWords]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.find}>
      <View style={styles.findRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find"
          placeholderTextColor={colors.muted}
          selectionColor={colors.gold}
          style={styles.findInput}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => onStep(1)}
          accessibilityLabel="Find"
        />
        <Text style={styles.findCount}>{query ? (result.count ? `${result.index + 1} of ${result.count}` : 'No matches') : ''}</Text>
        <IconButton icon="chevron-up" label="Previous" onPress={() => onStep(-1)} />
        <IconButton icon="chevron-down" label="Next" onPress={() => onStep(1)} />
        <IconButton icon="close" label="Close find" onPress={onClose} color={colors.muted} />
      </View>
      <View style={styles.findRow}>
        <Chip label="Match case" selected={matchCase} onPress={() => setMatchCase((v) => !v)} />
        <Chip label="Whole words" selected={wholeWords} onPress={() => setWholeWords((v) => !v)} />
      </View>
      {editable && (
        <View style={styles.findRow}>
          <TextInput
            value={replacement}
            onChangeText={setReplacement}
            placeholder="Replace with"
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            style={styles.findInput}
            accessibilityLabel="Replace with"
          />
          <OutlineButton label="Replace" onPress={() => onReplace(replacement)} compact disabled={!result.count} />
          <OutlineButton label="All" onPress={() => onReplaceAll(replacement, result.count)} compact disabled={!result.count} />
        </View>
      )}
    </View>
  );
}

/** Choose the character, place or other entry the selected words link to (#92). */
function EntityPicker({
  visible,
  entries,
  onPick,
  onClose,
}: {
  visible: boolean;
  entries: { id: string; name: string; kind: string }[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (visible) setQ('');
  }, [visible]);
  const shown = entries.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <Sheet visible={visible} onClose={onClose} title="Link to…">
      <Field label="Search" value={q} onChangeText={setQ} placeholder="A character, place, item…" autoFocus />
      {entries.length === 0 ? (
        <Muted>This novel has no characters or world entries yet. They come with Organize.</Muted>
      ) : (
        shown.map((e) => (
          <Pressable key={e.id} accessibilityRole="button" onPress={() => onPick(e.id)} style={({ pressed }) => [styles.entry, pressed && { backgroundColor: colors.elevated }]}>
            <Text style={styles.entryName}>{e.name}</Text>
            <Muted>{e.kind}</Muted>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pane: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  focusBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  pageFocus: { marginHorizontal: 0, borderWidth: 0, borderRadius: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  kickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  draftChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center', marginTop: 2, maxWidth: '100%' },
  draftText: { fontFamily: fonts.ui, fontSize: 12, color: colors.sky },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 2, color: colors.gold, textAlign: 'center' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textAlign: 'center', paddingVertical: 2 },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xxl, marginBottom: space.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.gold, opacity: 0.6 },
  toolbarScroll: { flexGrow: 0, flexShrink: 0 },
  toolbar: {
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  tool: { width: 42, height: 42, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: colors.gold },
  toolOff: { opacity: 0.35 },
  sep: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 4 },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  bannerText: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  bannerButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  linkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.chip,
    backgroundColor: colors.elevated,
  },
  linkText: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  deskRow: { flex: 1, flexDirection: 'row' },
  deskIcons: { flexGrow: 0, maxWidth: '55%' },
  paper: { marginHorizontal: space.xl, marginTop: space.xs, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  margin: { width: 300, flexGrow: 0, marginRight: space.md },
  marginBody: { paddingBottom: space.xl },
  nudgeSpot: { position: 'absolute', right: space.md, bottom: space.md, left: space.xl, alignItems: 'flex-end' },
  page: {
    flex: 1,
    marginHorizontal: space.sm,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  meterText: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  tray: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, paddingTop: 4, gap: 2 },
  trayRow: { flexDirection: 'row', alignItems: 'center' },
  keyboardBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.md, paddingVertical: 4 },
  doneKey: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md },
  doneText: { fontFamily: fonts.ui, fontSize: 15, color: colors.gold },
  message: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 24, color: colors.text },
  find: {
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.sm,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  findRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  findInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  findCount: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, minWidth: 64, textAlign: 'right' },
  entry: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  entryName: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
});

/** A character's colour on the page: always the same for them, chosen from their id, readable on a dark page. */
const castPalette = ['#F3B63A', '#38BDF8', '#F472B6', '#4ADE80', '#C084FC', '#FB923C', '#2DD4BF', '#FACC15', '#60A5FA', '#F87171'];
function castColour(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return castPalette[h % castPalette.length];
}
