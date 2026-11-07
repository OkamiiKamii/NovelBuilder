import { useNavigate } from 'react-router-dom';
import { ChapterCollab } from '@/modules/collab/components/ChapterCollab';
import type { Suggestion as Proposal } from '@/modules/collab/types';
import { QuickBar } from '@/modules/platform/components/Shell';
import { useDevice } from '@/modules/platform/device';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useLiveQuery } from 'dexie-react-hooks';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { codex, collab, progress } from '@/core';
import { ensurePersistence } from '@/core/storage';
import { useCategories } from '@/modules/codex/categories';
import { CategoryBadge } from '@/modules/codex/components/EntryBits';
import { filledFields } from '@/modules/codex/schema';
import type { LoreEntry } from '@/modules/codex/types';
import { formatNumber } from '@/shared/format';
import { useOnline } from '@/shared/useOnline';
import { createAutosaver, type SaveState } from '../autosave';
import { blockTexts, createExtensions, plainTextParser } from '../editor/extensions';
import { firstLinkTo, getReferences, linkRanges, setReferences, type Suggestion } from '../editor/references';
import { setSearch } from '../editor/search';
import { clearEmergencyDraft, readEmergencyDraft, writeEmergencyDraft } from '../emergencyDraft';
import { measure } from '../metrics';
import { setPrefs, type WritingPrefs } from '../preferences';
import { SaveConflictError, type OpenedDoc, type ProjectManuscript } from '../service';
import { KIND_LABELS, type DocJSON, type StoryNode, type TextMetrics } from '../types';
import { AppearanceMenu } from './AppearanceMenu';
import { FindBar } from './FindBar';
import { LinkBar } from './LinkBar';
import { Toolbar, ToolButton } from './Toolbar';

const STATS_DELAY = 150;

const STATUS_TEXT: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Changed elsewhere',
};

/** A request to show a passage: highlight `term` in paragraph number `block`. `key` identifies the request. */
export interface EditorJump {
  term: string;
  block: number;
  key: string;
}

// The last request acted on, so a reload of the editor does not repeat it.
let lastJump = '';

/** Lets the side panel ask the open editor to save or to reload from the database. */
export interface EditorControl {
  flush: () => Promise<void>;
  reload: () => void;
}

interface ChromeProps {
  panelOpen: boolean;
  onToggleNav: () => void;
  onTogglePanel: () => void;
  /** Brings up the Codex beside (or over) the text. */
  onLore?: () => void;
  /** For a role that has no plan or reference to look at: the panel's button is left out. */
  noPanel?: boolean;
}

interface ChapterEditorProps extends ChromeProps {
  chapterId: string;
  ms: ProjectManuscript;
  prefs: WritingPrefs;
  /** Where this chapter or scene sits, e.g. "Volume 1 › Chapter 3". */
  location: string;
  /** Name of the draft in the manuscript, when this chapter or scene has alternates. */
  draft: string | null;
  control: RefObject<EditorControl | null>;
  jump: EditorJump | null;
  /** Scroll to the first link to this codex entry. `key` identifies the request. */
  mention: { entryId: string; key: string } | null;
  /** Show a codex entry beside the text. */
  onInspect: (entryId: string) => void;
  /**
   * What this person's role lets them do with the text. `write` is the
   * author's editor. In `suggest` the same editor works on a proposal: what
   * is typed is kept as a suggestion and the manuscript is not touched. In
   * `read` nothing can be typed at all.
   */
  mode?: EditorMode;
}

export type EditorMode = 'write' | 'suggest' | 'read';

/** Top bar shared by the editor and its empty states. */
export function EditorBar({ onToggleNav, onTogglePanel, panelOpen, noPanel, children, trailing }: Omit<ChromeProps, 'onLore'> & { children?: ReactNode; trailing?: ReactNode }) {
  return (
    <header className="ms-bar">
      <ToolButton label="Contents" onClick={onToggleNav}>
        ☰
      </ToolButton>
      <div className="ms-bar-tools">{children}</div>
      {trailing}
      {!noPanel && (
        <ToolButton label="Plan and reference" active={panelOpen} onClick={onTogglePanel}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </svg>
        </ToolButton>
      )}
    </header>
  );
}

export function ChapterEditor({ chapterId, ms, ...rest }: ChapterEditorProps) {
  // Bumping `generation` re-reads the database and remounts the editor (after a restore, for example).
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<{ chapter: StoryNode; opened: OpenedDoc; generation: number; proposal: Proposal | null } | 'missing' | null>(null);
  const mode = rest.mode ?? 'write';
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const chapter = await ms.get(chapterId);
      // Text written synchronously while a page was closing goes into the regular draft store first.
      const emergency = mode === 'write' && chapter && readEmergencyDraft(chapterId, chapter.projectId);
      if (emergency) {
        const current = await ms.openDoc(chapterId);
        const alreadySaved = JSON.stringify(emergency.doc) === JSON.stringify(current.doc);
        const newest = !current.recovered || emergency.updatedAt >= current.recovered.updatedAt;
        if (!alreadySaved && newest) await ms.saveDraft(chapterId, emergency.doc, emergency.baseRev);
        clearEmergencyDraft(chapterId);
      }
      const opened = chapter ? await ms.openDoc(chapterId) : null;
      // Someone suggesting carries on with the proposal they have under way, if they have one.
      const proposal = chapter && mode === 'suggest' ? await collab.forProject(chapter.projectId).myTextSuggestion(chapterId) : null;
      if (alive) setLoaded(chapter && opened ? { chapter, opened, generation, proposal } : 'missing');
    })().catch(() => alive && setLoaded('missing'));
    return () => {
      alive = false;
    };
  }, [chapterId, ms, generation, mode]);

  if (loaded === null) return <section className="ms-center" />;
  if (loaded === 'missing') {
    return (
      <section className="ms-center">
        <EditorBar {...rest} />
        <div className="ms-empty">
          <h2>Chapter not found</h2>
          <p className="muted">It may have been deleted. Pick another from the contents.</p>
        </div>
      </section>
    );
  }
  return <Surface key={`${loaded.generation}-${mode}`} chapter={loaded.chapter} opened={loaded.opened} proposal={loaded.proposal} ms={ms} reload={reload} {...rest} mode={mode} />;
}

interface SurfaceProps extends ChromeProps {
  chapter: StoryNode;
  opened: OpenedDoc;
  proposal: Proposal | null;
  mode: EditorMode;
  ms: ProjectManuscript;
  prefs: WritingPrefs;
  location: string;
  draft: string | null;
  control: RefObject<EditorControl | null>;
  reload: () => void;
  jump: EditorJump | null;
  mention: { entryId: string; key: string } | null;
  onInspect: (entryId: string) => void;
}

function Surface({ chapter, opened, proposal, mode, ms, prefs, location, draft, control, reload, jump, mention, onInspect, onLore, ...chrome }: SurfaceProps) {
  const online = useOnline();
  const navigate = useNavigate();
  const phone = useDevice().form === 'phone';
  // On a phone the formatting row is put away until asked for.
  const [formatting, setFormatting] = useState(false);
  const categories = useCategories();
  const todayWords = useLiveQuery(() => progress.forProject(chapter.projectId).todayWords(), [chapter.projectId]);
  const [title, setTitle] = useState(chapter.title);
  const [metrics, setMetrics] = useState<TextMetrics>(() => measure([]));
  const [status, setStatus] = useState<SaveState>('saved');
  const [recovered, setRecovered] = useState(mode === 'write' ? opened.recovered : null);
  // What a proposal is measured against: the text as its writer first found it.
  const found = useRef<DocJSON>(proposal?.base ?? opened.doc ?? ({ type: 'doc', content: [{ type: 'paragraph' }] } as DocJSON));
  const [finding, setFinding] = useState(false);
  const [findKey, setFindKey] = useState(0);
  const [linking, setLinking] = useState(false);
  const [hover, setHover] = useState<{ entry: LoreEntry; x: number; y: number } | null>(null);
  const [offer, setOffer] = useState<{ suggestion: Suggestion; x: number; y: number } | null>(null);
  const entries = useLiveQuery(() => codex.forProject(chapter.projectId).list(), [chapter.projectId]);
  const [appearance, setAppearance] = useState(false);
  const [busy, setBusy] = useState(false);

  const latest = useRef<PMNode | null>(null);
  const baseRev = useRef(opened.rev);
  const forceNext = useRef(false);
  const recovering = useRef(opened.recovered !== null);
  const statsTimer = useRef<number | undefined>(undefined);

  const saver = useMemo(
    () =>
      createAutosaver<PMNode>({
        // Writes the document exactly as it is in the editor, based on the revision we loaded.
        save: async (node) => {
          if (mode === 'read') return;
          if (mode === 'suggest') {
            // OWNER FINAL AUTHORITY RULE: a reviewer's typing is kept as a proposal. The manuscript is not written to.
            await collab.forProject(chapter.projectId).saveTextSuggestion(chapter.id, found.current, node.toJSON() as DocJSON);
            return;
          }
          const reason = forceNext.current ? 'conflict' : recovering.current ? 'recovery' : undefined;
          baseRev.current = await ms.saveDoc(chapter.id, node.toJSON() as DocJSON, measure(blockTexts(node)), {
            baseRev: baseRev.current,
            force: forceNext.current,
            reason,
          });
          forceNext.current = false;
          recovering.current = false;
          clearEmergencyDraft(chapter.id);
          void ensurePersistence();
        },
        stash: (node) => (mode === 'write' ? ms.saveDraft(chapter.id, node.toJSON() as DocJSON, baseRev.current) : Promise.resolve()),
        isConflict: (error) => error instanceof SaveConflictError,
        onState: setStatus,
      }),
    [chapter.id, ms, mode],
  );

  const onEdit = useRef((_: Editor) => {});
  onEdit.current = (editor) => {
    latest.current = editor.state.doc;
    saver.changed(() => latest.current!);
    if (recovered) setRecovered(null);
    clearTimeout(statsTimer.current);
    statsTimer.current = window.setTimeout(() => setMetrics(measure(blockTexts(editor.state.doc))), STATS_DELAY);
  };

  const extensions = useMemo(createExtensions, []);
  const editor = useEditor({
    extensions,
    content: (mode === 'write' ? opened.recovered?.doc : proposal?.proposed) ?? opened.doc ?? '',
    editable: mode !== 'read',
    // Non-invasive editing rule: no automatic text transforms of any kind.
    enableInputRules: false,
    enablePasteRules: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'manuscript-text', 'aria-label': 'Chapter text', role: 'textbox', 'aria-multiline': 'true' },
      clipboardTextParser: plainTextParser,
    },
    onUpdate: ({ editor: e }) => onEdit.current(e),
  });

  useEffect(() => {
    latest.current = editor.state.doc;
    setMetrics(measure(blockTexts(editor.state.doc)));
  }, [editor]);

  // Where the author was in this chapter is kept on this device, and returned to the next time it is opened.
  const scroller = useRef<HTMLDivElement>(null);
  const scrollKey = `novel-builder:scroll:${chapter.id}`;
  const restoring = useRef(false);
  const rememberScroll = () => {
    // While the remembered place is being returned to, the scrolling is ours, not the author's.
    if (restoring.current) return;
    try {
      localStorage.setItem(scrollKey, String(Math.round(scroller.current?.scrollTop ?? 0)));
    } catch {
      // not essential
    }
  };
  useEffect(() => {
    // Arriving at a particular line takes precedence over the remembered place.
    if (jump || mention) return;
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(scrollKey)) || 0;
    } catch {
      // not essential
    }
    if (saved <= 0) return;
    restoring.current = true;
    let tries = 0;
    let frame = 0;
    // The text may still be laying out: keep trying for a moment until the page is tall enough to scroll there.
    const attempt = () => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTop = saved;
      if (Math.abs(el.scrollTop - saved) > 2 && tries++ < 60) frame = requestAnimationFrame(attempt);
      else restoring.current = false;
    };
    frame = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  // Arriving from project search: put the cursor at the paragraph, highlight the term there and scroll to it.
  // This only moves the selection and draws highlights; the text is not touched.
  useEffect(() => {
    if (!jump || jump.key === lastJump) return;
    lastJump = jump.key;
    let position = 0;
    let ordinal = 0;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      if (ordinal++ === jump.block) position = pos;
      return false;
    });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position))));
    setSearch(editor, { query: jump.term });
    setFindKey((k) => k + 1);
    setFinding(true);
  }, [jump, editor]);

  // Tell the editor which codex entries exist (so only live links are drawn) and whether to suggest links.
  useEffect(() => {
    if (entries) setReferences(editor, { entities: entries.map((e) => ({ id: e.id, name: e.name })), detect: prefs.suggestLinks });
  }, [editor, entries, prefs.suggestLinks]);

  // Arriving from a codex entry's "Mentioned in": select its first link here and bring it into view.
  useEffect(() => {
    if (!mention || mention.key === lastJump) return;
    lastJump = mention.key;
    const range = firstLinkTo(editor.state.doc, mention.entryId, editor.schema.marks.entityLink);
    if (!range) return;
    // Selecting the words (with focus) is what makes them visibly highlighted on arrival.
    editor.chain().setTextSelection(range).focus(undefined, { scrollIntoView: false }).run();
    requestAnimationFrame(() => editor.view.dom.querySelector(`[data-entity="${mention.entryId}"]`)?.scrollIntoView({ block: 'center' }));
  }, [mention, editor]);

  /** A click on a live link opens its entry beside the text; a click on a suggestion asks whether to link it. */
  const onCanvasClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const live = target.closest('.ref-live');
    const suggested = target.closest<HTMLElement>('.ref-suggest');
    setOffer(null);
    if (live) {
      const id = (live.closest('[data-entity]') ?? live.querySelector('[data-entity]'))?.getAttribute('data-entity');
      if (id) onInspect(id);
    } else if (suggested) {
      const at = editor.view.posAtDOM(suggested, 0);
      const suggestion = getReferences(editor.state).suggestions.find((s) => s.from <= at && at < s.to);
      const box = suggested.getBoundingClientRect();
      if (suggestion) setOffer({ suggestion, x: box.left, y: box.bottom + 6 });
    }
  };
  const onCanvasHover = (e: React.MouseEvent) => {
    const live = (e.target as HTMLElement).closest('.ref-live');
    const id = live && (live.closest('[data-entity]') ?? live.querySelector('[data-entity]'))?.getAttribute('data-entity');
    const entry = id ? entries?.find((x) => x.id === id) : undefined;
    if (!entry || !live) return setHover(null);
    const box = live.getBoundingClientRect();
    setHover({ entry, x: box.left, y: box.bottom + 6 });
  };
  const offered = offer && entries?.find((e) => e.id === offer.suggestion.entryId);
  const sameName = offer ? getReferences(editor.state).suggestions.filter((s) => s.entryId === offer.suggestion.entryId) : [];

  useEffect(() => {
    control.current = { flush: () => saver.flush(), reload };
    return () => {
      control.current = null;
    };
  }, [control, saver, reload]);

  // Never lose text: save when leaving the chapter, hiding the tab or closing the page.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    const onLeave = (e: Event) => {
      // The page may be gone before the database commits, so keep a synchronous copy too.
      if (saver.state !== 'saved' && latest.current) {
        writeEmergencyDraft(chapter.id, { projectId: chapter.projectId, doc: latest.current.toJSON() as DocJSON, baseRev: baseRev.current, updatedAt: Date.now() });
      }
      void saver.flush();
      // If saving is failing, make the browser ask before the page goes away.
      if (e.type === 'beforeunload' && (saver.state === 'error' || saver.state === 'conflict')) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      clearTimeout(statsTimer.current);
      // Flush, but do not dispose: React may re-run this effect, and a save that
      // fails here should keep retrying after the editor is gone.
      void saver.flush();
    };
  }, [saver, chapter.id, chapter.projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;
      if (modKey && !e.altKey && e.key.toLowerCase() === 'f') {
        // With Shift it is the focus-mode shortcut, which the author can rebind: the workspace handles it.
        if (e.shiftKey) return;
        e.preventDefault();
        setFinding(true);
      } else if (modKey && e.key.toLowerCase() === 's') {
        e.preventDefault(); // "save" habit: save now instead of opening the browser's dialog
        void saver.flush();
      } else if (e.key === 'Escape' && !e.defaultPrevented && prefs.focus) {
        setPrefs({ focus: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.focus, saver]);

  const savedTitle = useRef(chapter.title);
  const saveTitle = () => {
    const next = title.trim() || `Untitled ${chapter.kind}`;
    if (next === savedTitle.current) return;
    savedTitle.current = next;
    setTitle(next);
    void ms.update(chapter.id, { title: next }).catch(() => setStatus('error'));
  };

  /** Runs a recovery/conflict choice once, then reloads the editor from the database. */
  const resolve = (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    saver.dispose();
    void task()
      .catch(() => {})
      .finally(reload);
  };

  const keepRecovered = () => {
    setRecovered(null);
    saver.changed(() => latest.current!);
    void saver.flush();
  };
  const discardRecovered = () => resolve(() => ms.discardDraft(chapter.id));
  const keepMine = () => {
    forceNext.current = true;
    void saver.resume();
  };
  const loadOther = () =>
    resolve(async () => {
      const node = latest.current;
      if (node) await ms.keepInHistory(chapter.id, node.toJSON() as DocJSON, measure(blockTexts(node)), 'conflict', 'My version, set aside for the other one');
      await ms.discardDraft(chapter.id);
    });

  return (
    <section className="ms-center" data-formatting={formatting || undefined}>
      <EditorBar
        {...chrome}
        trailing={
          <>
            <ToolButton label="Reader preview" onClick={() => void saver.flush().finally(() => navigate(`/project/${chapter.projectId}/read?at=${chapter.id}`))}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14" />
              </svg>
            </ToolButton>
            <div className="popover-anchor">
              <ToolButton label="Appearance" active={appearance} onClick={() => setAppearance((v) => !v)}>
                <span className="aa">Aa</span>
              </ToolButton>
              {appearance && <AppearanceMenu prefs={prefs} onClose={() => setAppearance(false)} />}
            </div>
            <ToolButton label="Focus mode" shortcut="Ctrl/⌘+Shift+F" onClick={() => setPrefs({ focus: true })}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </ToolButton>
          </>
        }
      >
        {mode !== 'read' && <Toolbar editor={editor} onFind={() => setFinding(true)} onLink={() => setLinking((v) => !v)} suggesting={prefs.suggestLinks} onToggleSuggestions={() => setPrefs({ suggestLinks: !prefs.suggestLinks })} />}
      </EditorBar>
      <ChapterCollab projectId={chapter.projectId} chapterId={chapter.id} title={title} editor={editor} mode={mode} flush={() => saver.flush()} reload={reload} />

      {status === 'conflict' ? (
        <div className="save-banner danger" role="alert">
          <p>
            <strong>This {chapter.kind} was changed in another tab or window.</strong> Saving is paused so nothing is overwritten. Whichever you
            choose, the other version is kept in History.
          </p>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={loadOther}>
              Load the other version
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={keepMine}>
              Keep what's here
            </button>
          </div>
        </div>
      ) : (
        recovered && (
          <div className="save-banner" role="status">
            <p>
              <strong>Unsaved writing was recovered</strong> from {new Date(recovered.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              , when the app closed before it could save.
            </p>
            <div className="actions">
              <button type="button" className="btn" disabled={busy} onClick={discardRecovered}>
                Discard it
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={keepRecovered}>
                Keep it
              </button>
            </div>
          </div>
        )
      )}

      {finding && <FindBar key={findKey} editor={editor} onClose={() => setFinding(false)} />}
      {linking && <LinkBar editor={editor} entries={entries ?? []} onClose={() => setLinking(false)} />}

      {prefs.focus && (
        <button type="button" className="focus-exit" onClick={() => setPrefs({ focus: false })}>
          Exit focus
        </button>
      )}

      <div className="ms-scroll" ref={scroller} onScroll={rememberScroll} onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <div className="ms-canvas" onClick={onCanvasClick} onMouseOver={onCanvasHover} onMouseLeave={() => setHover(null)}>
          <p className="ms-location muted small">
            {[location, KIND_LABELS[chapter.kind]].filter(Boolean).join(' › ')}
            {draft && <span className="draft-tag">Draft: {draft}</span>}
          </p>
          <input
            className="chapter-title"
            readOnly={mode !== 'write'}
            value={title}
            aria-label="Title"
            placeholder={`${KIND_LABELS[chapter.kind]} title`}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editor.commands.focus('start');
              }
            }}
          />
          <EditorContent editor={editor} />
        </div>
      </div>

      {hover && !offer && (
        <div className="ref-card" role="tooltip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.entry.name}</strong> <CategoryBadge category={hover.entry.category} />
          {hover.entry.summary && <p>{hover.entry.summary}</p>}
          {filledFields(hover.entry, categories.get(hover.entry.category), (id) => entries?.find((e) => e.id === id)?.name).slice(0, 3).map((f) => (
            <p key={f.id} className="small">
              <span className="muted">{f.label}:</span> {f.text}
            </p>
          ))}
          <p className="muted small">Click to open beside the text</p>
        </div>
      )}
      {offer && offered && (
        <div className="ref-card ref-offer" role="dialog" aria-label="Link suggestion" style={{ left: offer.x, top: offer.y }}>
          <p>
            Link “{offer.suggestion.text}” to <strong>{offered.name}</strong> <CategoryBadge category={offered.category} />?
          </p>
          <div className="actions start">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                linkRanges(editor, [offer.suggestion], offered.id);
                setOffer(null);
                editor.commands.focus(); // so Undo applies to the editor straight away
              }}
            >
              Link this one
            </button>
            {sameName.length > 1 && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  linkRanges(editor, sameName, offered.id);
                  setOffer(null);
                  editor.commands.focus(); // so Undo applies to the editor straight away
                }}
              >
                Link all {sameName.length} in this {chapter.kind}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => setOffer(null)}>
              Not now
            </button>
          </div>
        </div>
      )}

      <footer className="ms-stats" aria-label="Chapter statistics">
        <span>
          <strong>{formatNumber(metrics.words)}</strong> {metrics.words === 1 ? 'word' : 'words'}
        </span>
        <span>
          <strong>{formatNumber(metrics.characters)}</strong> {metrics.characters === 1 ? 'character' : 'characters'}
        </span>
        <span>
          <strong>{formatNumber(metrics.paragraphs)}</strong> {metrics.paragraphs === 1 ? 'paragraph' : 'paragraphs'}
        </span>
        <span>
          <strong>{metrics.readingMinutes}</strong> min read
        </span>
        {todayWords !== undefined && todayWords !== 0 && (
          <span title="Net words across the project today">
            Today <strong>{todayWords > 0 ? '+' : '−'}{formatNumber(Math.abs(todayWords))}</strong>
          </span>
        )}
        <span className={`save-status ${status}`} role="status" title="Saved on this device">
          {!online && <span className="offline-tag">Offline</span>}
          <span className="dot" aria-hidden="true" />
          {recovered && status === 'saved' ? 'Recovered, not yet saved' : STATUS_TEXT[status]}
          {status === 'error' && (
            <button type="button" className="btn" onClick={() => void saver.flush()}>
              Retry
            </button>
          )}
        </span>
      </footer>
      {phone && !prefs.focus && (
        <QuickBar
          formatting={formatting}
          editing={mode !== 'read'}
          lore={!chrome.noPanel}
          notes={mode === 'write'}
          onFormatting={() => setFormatting((v) => !v)}
          onLore={() => onLore?.()}
          // Dictated words go in at the cursor exactly as recognised, with a space only where one is needed to keep words apart.
          onDictated={(heard) => {
            const { from } = editor.state.selection;
            const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, '\n') : '';
            editor.chain().focus().insertContent({ type: 'text', text: `${before && !/\s/.test(before) ? ' ' : ''}${heard.trim()}` }).run();
          }}
        />
      )}
    </section>
  );
}
