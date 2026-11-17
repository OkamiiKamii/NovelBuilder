// THE CHAPTER EDITOR (FEATURES.md section 7): the heading, the formatting toolbar, the page, find and replace, links to
// codex entries, the word meter, and saving: shortly after typing stops and at least every five seconds while it goes
// on, a crash copy on every change, the recovered-writing banner, and the conflict choice when the chapter was saved
// somewhere else meanwhile. A port of flutter_app/lib/features/write/chapter_editor.dart (its core; the writing desk
// tools come in Phase 3b).

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
import { ChapterEditor, type ChapterEditorHandle, emptyUiState, type EditorUiState } from '../../editor/ChapterEditor';
import { type JsonMap, str } from '../../domain/json';
import { type StoryNode } from '../../domain/outline';
import { measureDoc } from '../../domain/prose';
import { ActionSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, type IconName, IconButton, Muted, OutlineButton } from '../kit';
import { useKeyboardVisible } from '../frame';
import { useLibrary } from '../LibraryContext';
import { SavePill } from '../SavePill';
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

/** Save at most this long after typing stops, and at least this often while it goes on. */
const longestUnsavedMs = 5000;

export function EditorPane({
  novelId,
  node,
  kicker,
  onBack,
  onOpenNode,
}: {
  novelId: string;
  node: StoryNode;
  /** "CHAPTER 3" or "CHAPTER 3 · SCENE". */
  kicker: string;
  /** On a phone: back to the contents. */
  onBack?: () => void;
  onOpenNode: (nodeId: string) => void;
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

  const saveNow = useCallback(async () => {
    await editor.current?.flush();
    if (live.current.dirty) lib.saves.saveNow(saveKey, write);
  }, [lib, saveKey, write]);

  const onChange = useCallback(
    (doc: JsonMap) => {
      const l = live.current;
      if (l.conflict) return;
      l.doc = doc;
      l.dirty = true;
      if (!l.firstPendingAt) l.firstPendingAt = Date.now();
      setWords((w) => ({ ...w, now: measureDoc(doc).words }));
      try {
        lib.manuscript.saveDraft(novelId, node.id, doc, l.rev); // The crash copy.
      } catch {
        // The save itself reports any problem.
      }
      if (Date.now() - l.firstPendingAt >= longestUnsavedMs) lib.saves.saveNow(saveKey, write);
      else lib.saves.schedule(saveKey, write);
    },
    [lib, novelId, node.id, saveKey, write],
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
  }, [lib, novelId, node.id]);

  useEffect(() => {
    if (ready > 0) open();
  }, [ready, open]);

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

  const entries = useMemo(
    () =>
      lib.novels
        .rowsIn(novelId, 'loreEntries')
        .map((r) => ({ id: str(r['id']), name: str(r['name']) || 'Unnamed', kind: categoryLabel[str(r['category'])] ?? 'Entry' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lib, novelId, linkOpen], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const linked = ui.linkedEntry ? (entries.find((e) => e.id === ui.linkedEntry) ?? null) : null;

  // ---- layout

  const look = useMemo(
    () => (phone ? { fontSize: 17, lineHeight: 1.6, maxWidth: null, padding: 18 } : { fontSize: 18, lineHeight: 1.7, maxWidth: 720, padding: 28 }),
    [phone],
  );
  const editable = readOnly === null && !conflict;
  const delta = words.now - words.atOpen;

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

  return (
    <View style={styles.pane}>
      <View style={styles.header}>
        {onBack && <IconButton icon="arrow-left" label="Back to the contents" onPress={() => { void saveNow(); onBack(); }} />}
        <View style={styles.flex}>
          <Text style={styles.kicker}>{kicker}</Text>
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
      </View>
      <View style={styles.ornament}>
        <View style={styles.rule} />
        <Icon name="rhombus-outline" size={14} />
        <View style={styles.rule} />
      </View>

      {editable && (
        <ScrollView style={styles.toolbarScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar} keyboardShouldPersistTaps="always">
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
          {tool('call-split', 'Split here', split)}
        </ScrollView>
      )}

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

      {findOpen && (
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

      <View style={styles.page}>
        <ChapterEditor
          ref={editor}
          look={look}
          onReady={() => setReady((n) => n + 1)}
          onLoaded={(ok, reason) => setReadOnly(ok ? null : reason)}
          onChange={onChange}
          onState={setUi}
          onFind={(count, index) => findResult.current?.(count, index)}
          onError={(m) => toast(`The editor reported a problem (${m}).`, { error: true })}
        />
      </View>

      {!keyboardUp || !phone ? (
        <View style={styles.meter}>
          <Text style={styles.meterText}>
            {words.now.toLocaleString('en-US')} words · {Math.max(words.now ? 1 : 0, Math.round(words.now / 250))} min read
          </Text>
          {delta !== 0 && (
            <Text style={[styles.meterText, { color: delta > 0 ? colors.success : colors.muted }]}>
              {delta > 0 ? '+' : '−'}
              {Math.abs(delta).toLocaleString('en-US')} this session
            </Text>
          )}
          <View style={styles.flex} />
          <SavePill />
        </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
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
  meterText: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
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
