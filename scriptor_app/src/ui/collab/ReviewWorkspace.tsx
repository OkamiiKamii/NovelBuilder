// WRITE, IN A REVIEW COPY (FEATURES.md #323): read the book as its owner shared it, and comment (on a paragraph, a
// chapter, an entry or a plot thread), react, fill in the feedback form and (as an editor) suggest changes to the text
// and to entries. Nothing done here changes the author's book: it all goes back in the feedback file, and the author
// accepts or rejects each suggestion. A port of flutter_app/lib/features/collab/review_workspace.dart.

import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shareTextFile } from '../../data/files';
import { can, roleLabel } from '../../domain/collab/access';
import { docWithParagraphs, paragraphTexts } from '../../domain/collab/collabChanges';
import { type FieldChange, feedbackQuestions, reactions, type Suggestion } from '../../domain/collab/records';
import type { ReviewMark } from '../../domain/collab/reviewFiles';
import { displayTitle } from '../../domain/desk/pageAround';
import { type JsonMap, listOf, mapOrNull, str } from '../../domain/json';
import { isDocument, readingOrder, type StoryNode, storyNode } from '../../domain/outline';
import { Entry } from '../../domain/records/entry';
import { PlotThread } from '../../domain/records/thread';
import { PromptSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { SuggestionCard, ThreadCard, plural, useRunCollab } from './CollabParts';
import { type CollabActions, type CollabData, collabProblem, useCollab, useCollabActions } from './useCollab';

type Tab = 'chapters' | 'world' | 'threads' | 'conversations' | 'suggestions';

export function ReviewWorkspace({ mark }: { mark: ReviewMark }) {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const data = useCollab();
  const actions = useCollabActions(data?.novelId ?? null);
  const [tab, setTab] = useState<Tab>('chapters');
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [commenting, setCommenting] = useState<{ target: JsonMap; label: string; what: string } | null>(null);
  const run = useRunCollab();

  const book = useMemo(() => {
    if (data === null) return null;
    const id = data.novelId;
    return {
      nodes: readingOrder(lib.novels.rowsIn(id, 'chapters').map(storyNode)).map((e) => e.node),
      docs: new Map(lib.novels.rowsIn(id, 'chapterContents').map((r) => [str(r['id']), mapOrNull(r['doc']) ?? {}])),
      entries: lib.novels
        .rowsIn(id, 'loreEntries')
        .map((r) => new Entry(r))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
      threads: lib.novels.rowsIn(id, 'plotThreads').map((r) => new PlotThread(r)),
    };
  }, [lib, data?.novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === null || actions === null || book === null) return null;
  const me = data.me;
  const editor = can(me.role, 'readLore');
  const comments = can(me.role, 'comment');
  const doing =
    me.role === 'editor'
      ? 'read everything but the author’s private notes, comment anywhere, and suggest changes'
      : me.role === 'reader'
        ? 'read the manuscript, comment on it, react and fill in the feedback form'
        : 'read the chapters marked final or published';
  const pending = data.mark?.changed.length ?? 0;
  const send = async () => {
    let file: { name: string; text: string };
    try {
      file = actions.feedbackFile();
    } catch (e) {
      toast(collabProblem(e) ?? String(e), { error: true });
      return;
    }
    try {
      await shareTextFile(file.name, file.text);
      toast(`Shared “${file.name}”. Send it to ${mark.ownerName}; nothing is sent by the app.`);
    } catch (e) {
      toast(`The feedback file could not be shared (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  const tabs: Tab[] = [
    'chapters',
    ...(editor ? (['world', 'threads'] as const) : []),
    ...(comments ? (['conversations'] as const) : []),
    ...(can(me.role, 'suggest') ? (['suggestions'] as const) : []),
  ];
  const mine = data.suggestions.filter((s) => s.authorId === me.id);
  const tabLabel: Record<Tab, string> = {
    chapters: 'Chapters',
    world: 'World',
    threads: 'Plot threads',
    conversations: `Conversations (${data.threads().length})`,
    suggestions: `My suggestions (${mine.length})`,
  };
  const documents = book.nodes.filter((n) => isDocument(n.kind) && book.docs.has(n.id));
  const chapter = documents.find((n) => n.id === chapterId) ?? null;
  const entry = book.entries.find((e) => e.id === entryId) ?? null;

  const banner = (
    <Panel style={styles.banner}>
      <Text style={styles.bannerTitle} accessibilityRole="header">{`Review copy of “${mark.title}” from ${mark.ownerName}`}</Text>
      <Text style={styles.body}>
        {`You are ${mark.memberName}, ${roleLabel[me.role]}: you can ${doing}. Nothing you do here changes the author’s book. When you are ready, send your feedback file back to them.`}
      </Text>
      <View style={styles.wrap}>
        {comments && <GoldButton label="Send feedback…" icon="send-outline" compact onPress={() => void send()} />}
        <OutlineButton label="Read as a book" icon="book-open-page-variant-outline" compact onPress={() => router.navigate('/write/read')} />
      </View>
      {comments && <Muted>{pending === 0 ? 'Nothing new to send yet.' : `${plural(pending, 'change')} in your feedback.`}</Muted>}
    </Panel>
  );
  const chips = (
    <View style={styles.wrap}>
      {tabs.map((t) => (
        <Chip key={t} label={tabLabel[t]} selected={tab === t} onPress={() => setTab(t)} />
      ))}
    </View>
  );

  let body: ReactNode;
  if (tab === 'chapters' && chapter !== null) {
    body = (
      <ChapterReview
        key={chapter.id}
        node={chapter}
        doc={book.docs.get(chapter.id)!}
        data={data}
        actions={actions}
        onBack={() => setChapterId(null)}
        onComment={(target, what) => setCommenting({ target, label: displayTitle(chapter), what })}
      />
    );
  } else if (tab === 'chapters') {
    body =
      documents.length === 0 ? (
        <Panel style={styles.gapSm}>
          <Icon name="book-open-outline" size={32} />
          <Text style={styles.heading}>No chapters to read in this copy</Text>
          <Muted>A viewer reads the chapters the author has marked final or published.</Muted>
        </Panel>
      ) : (
        documents.map((n) => (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            onPress={() => setChapterId(n.id)}
            style={({ pressed }) => [styles.row, n.kind === 'scene' && styles.scene, pressed && { backgroundColor: colors.elevated }]}
          >
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{displayTitle(n)}</Text>
              <Muted>{plural(data.threads(`chapter:${n.id}`).length, 'conversation')}</Muted>
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))
      );
  } else if (tab === 'world') {
    body =
      entry !== null ? (
        <EntryReview
          key={entry.id}
          entry={entry}
          data={data}
          actions={actions}
          onBack={() => setEntryId(null)}
          onComment={() => setCommenting({ target: { kind: 'entry', entryId: entry.id }, label: entry.name, what: `“${entry.name}”` })}
        />
      ) : book.entries.length === 0 ? (
        <Muted>World is empty.</Muted>
      ) : (
        book.entries.map((e) => (
          <Pressable key={e.id} accessibilityRole="button" onPress={() => setEntryId(e.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{e.name === '' ? 'Untitled entry' : e.name}</Text>
              {e.summary !== '' && <Muted numberOfLines={2}>{e.summary}</Muted>}
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))
      );
  } else if (tab === 'threads') {
    body =
      book.threads.length === 0 ? (
        <Muted>No plot threads.</Muted>
      ) : (
        book.threads.map((t) => (
          <View key={t.id} style={styles.gapSm}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{t.title === '' ? 'Untitled thread' : t.title}</Text>
                {t.premise !== '' && <Muted>{t.premise}</Muted>}
              </View>
              <IconButton
                icon="comment-plus-outline"
                label={`Comment on ${t.title}`}
                onPress={() => setCommenting({ target: { kind: 'thread', threadId: t.id }, label: t.title, what: `“${t.title}”` })}
              />
            </View>
            {data.threads(`thread:${t.id}`).map((th) => (
              <ThreadCard key={th.root.id} thread={th} me={me} actions={actions} showTarget={false} />
            ))}
          </View>
        ))
      );
  } else if (tab === 'conversations') {
    body =
      data.threads().length === 0 ? (
        <Muted>No conversations yet.</Muted>
      ) : (
        data.threads().map((t) => <ThreadCard key={t.root.id} thread={t} me={me} actions={actions} />)
      );
  } else {
    body =
      mine.length === 0 ? (
        <Muted>No suggestions yet. Open a chapter and choose “Suggest changes”.</Muted>
      ) : (
        mine.map((s) => <SuggestionCard key={s.id} suggestion={s} me={me} actions={actions} />)
      );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.body_} keyboardShouldPersistTaps="handled">
        {banner}
        {chips}
        {body}
      </ScrollView>
      <PromptSheet
        visible={commenting !== null}
        title={commenting === null ? '' : `Comment on ${commenting.what}`}
        label="Comment"
        confirmLabel="Add comment"
        onClose={() => setCommenting(null)}
        onSubmit={(text) => {
          const c = commenting;
          setCommenting(null);
          if (c !== null) run(() => actions.comment(c.target, { targetLabel: c.label, body: text }), 'Comment added.');
        }}
      />
    </View>
  );
}

/** One chapter: its text to read and comment on, reactions and the feedback form, and (for an editor) changes to
 * suggest, paragraph by paragraph. */
function ChapterReview({
  node,
  doc,
  data,
  actions,
  onBack,
  onComment,
}: {
  node: StoryNode;
  doc: JsonMap;
  data: CollabData;
  actions: CollabActions;
  onBack: () => void;
  onComment: (target: JsonMap, what: string) => void;
}) {
  const run = useRunCollab();
  const me = data.me;
  const comments = can(me.role, 'comment');
  const suggests = can(me.role, 'suggest');
  const texts = paragraphTexts(doc);
  const title = displayTitle(node);
  const [editing, setEditing] = useState<{ original: unknown; text: string }[] | null>(null);
  const [feedback, setFeedback] = useState(false);
  const mineOpen: Suggestion | null =
    data.suggestions
      .filter((s) => s.isText && s.targetId === node.id && s.authorId === me.id && s.isOpen)
      .reduce<Suggestion | null>((best, s) => (best === null || s.updatedAt > best.updatedAt ? s : best), null);
  const threads = data.threads(`chapter:${node.id}`);

  const startSuggesting = () => {
    const from = mapOrNull(mineOpen?.proposed) ?? doc;
    const blocks = [...listOf(from['content'])];
    const t = paragraphTexts({ type: 'doc', content: blocks });
    setEditing(blocks.map((b, i) => ({ original: b, text: i < t.length ? t[i] : '' })));
  };
  const save = () => {
    if (editing === null) return;
    const proposed = docWithParagraphs(
      doc,
      editing.map((p) => ({
        original: p.original,
        text: p.original !== null && paragraphTexts({ type: 'doc', content: [p.original] })[0] === p.text ? null : p.text,
      })),
    );
    if (
      run(
        () => actions.saveText({ chapterId: node.id, chapterTitle: title, base: doc, proposed }),
        'Your suggested changes are kept, ready for your feedback file. The chapter itself is unchanged.',
      )
    ) {
      setEditing(null);
    }
  };

  return (
    <View style={styles.gap}>
      <View style={styles.titleRow}>
        <IconButton icon="arrow-left" label="Back to the chapters" onPress={onBack} />
        <Text style={styles.chapterTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.wrap}>
        {comments && (
          <OutlineButton label="Comment on the chapter" icon="comment-plus-outline" compact onPress={() => onComment({ kind: 'chapter', chapterId: node.id }, 'the chapter')} />
        )}
        {comments && <OutlineButton label="Feedback form…" icon="clipboard-text-outline" compact onPress={() => setFeedback(true)} />}
        {suggests && editing === null && (
          <GoldButton label={mineOpen === null ? 'Suggest changes' : 'Go on with my suggested changes'} icon="pencil-outline" compact onPress={startSuggesting} />
        )}
      </View>
      {comments ? (
        <>
          <Text style={styles.label}>React to the chapter</Text>
          <View style={styles.wrap}>
            {reactions.map((r) => (
              <Chip
                key={r}
                label={r}
                selected={false}
                onPress={() =>
                  run(() => actions.comment({ kind: 'chapter', chapterId: node.id }, { targetLabel: title, body: r, kind: 'reaction' }), `Reaction added: ${r}.`)
                }
              />
            ))}
          </View>
        </>
      ) : (
        <Muted>As a viewer you read; you cannot comment.</Muted>
      )}
      <View style={styles.divider} />
      {editing !== null ? (
        <View style={styles.gap}>
          <Muted>
            Suggesting changes: edit any paragraph, remove one or add one after it. Formatting in a paragraph you change is not kept in the
            suggestion. The chapter itself is not changed.
          </Muted>
          {editing.map((p, i) => (
            <View key={i} style={styles.editRow}>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>{`PARAGRAPH ${i + 1}`}</Text>
                <TextInput
                  value={p.text}
                  onChangeText={(v) => setEditing(editing.map((q, k) => (k === i ? { ...q, text: v } : q)))}
                  multiline
                  accessibilityLabel={`Paragraph ${i + 1}`}
                  selectionColor={colors.gold}
                  style={styles.input}
                />
              </View>
              <IconButton icon="delete-outline" label={`Remove paragraph ${i + 1}`} onPress={() => setEditing(editing.filter((_, k) => k !== i))} />
              <IconButton
                icon="plus"
                label={`Add a paragraph after paragraph ${i + 1}`}
                onPress={() => setEditing([...editing.slice(0, i + 1), { original: null, text: '' }, ...editing.slice(i + 1)])}
              />
            </View>
          ))}
          {editing.length === 0 && <OutlineButton label="Add a paragraph" icon="plus" compact onPress={() => setEditing([{ original: null, text: '' }])} style={styles.start} />}
          <View style={styles.wrap}>
            <GoldButton label="Keep my suggested changes" icon="content-save-outline" compact onPress={save} />
            <OutlineButton label="Cancel" compact tone="muted" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : (
        texts.map((text, i) => (
          <View key={i} style={styles.paragraph}>
            <Text selectable style={styles.prose}>
              {text}
            </Text>
            {comments && text.trim() !== '' && (
              <IconButton
                icon="comment-plus-outline"
                label={`Comment on paragraph ${i + 1}`}
                onPress={() =>
                  onComment(
                    { kind: 'text', chapterId: node.id, quote: text.length > 120 ? `${text.substring(0, 120)}…` : text, block: i, offset: 0 },
                    `paragraph ${i + 1}`,
                  )
                }
              />
            )}
          </View>
        ))
      )}
      {threads.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.heading}>Conversations on this chapter</Text>
          {threads.map((t) => (
            <ThreadCard key={t.root.id} thread={t} me={me} actions={actions} showTarget={false} />
          ))}
        </>
      )}
      {feedback && (
        <FeedbackSheet
          onClose={() => setFeedback(false)}
          onAdd={(ratings, note) => {
            setFeedback(false);
            run(
              () => actions.comment({ kind: 'chapter', chapterId: node.id }, { targetLabel: title, body: note, kind: 'feedback', ratings }),
              'Feedback added.',
            );
          }}
        />
      )}
    </View>
  );
}

function FeedbackSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (ratings: Record<string, number>, note: string) => void }) {
  const [ratings, setRatings] = useState<Record<string, number>>(Object.fromEntries(feedbackQuestions.map((q) => [q.key, 3])));
  const [note, setNote] = useState('');
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Feedback on this chapter"
      footer={
        <>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label="Add feedback" icon="check" onPress={() => onAdd(ratings, note)} style={styles.flex} />
        </>
      }
    >
      {feedbackQuestions.map((q) => (
        <View key={q.key} style={styles.gapSm}>
          <Text style={styles.body}>{`${q.label}: ${ratings[q.key]} of 5`}</Text>
          <View style={styles.wrap} accessibilityLabel={`${q.label}: ${ratings[q.key]} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} label={String(n)} selected={ratings[q.key] === n} onPress={() => setRatings({ ...ratings, [q.key]: n })} />
            ))}
          </View>
        </View>
      ))}
      <Field label="Anything else (optional)" value={note} onChangeText={setNote} multiline />
    </Sheet>
  );
}

/** One world entry, read-only, to comment on or to suggest an edit to. */
function EntryReview({
  entry,
  data,
  actions,
  onBack,
  onComment,
}: {
  entry: Entry;
  data: CollabData;
  actions: CollabActions;
  onBack: () => void;
  onComment: () => void;
}) {
  const run = useRunCollab();
  const me = data.me;
  const [suggesting, setSuggesting] = useState(false);
  const rows: { field: string; label: string; from: string }[] = [
    { field: 'name', label: 'Name', from: entry.name },
    { field: 'summary', label: 'Summary', from: entry.summary },
    { field: 'description', label: 'Description', from: entry.description },
    ...entry.fields.filter((f) => f.key !== '').map((f) => ({ field: `field:${f.key}`, label: f.key, from: f.value })),
  ];
  return (
    <View style={styles.gap}>
      <View style={styles.titleRow}>
        <IconButton icon="arrow-left" label="Back to World" onPress={onBack} />
        <Text style={styles.chapterTitle} accessibilityRole="header">
          {entry.name}
        </Text>
      </View>
      {entry.summary !== '' && <Text style={styles.body}>{entry.summary}</Text>}
      {entry.description !== '' && <Text style={styles.body}>{entry.description}</Text>}
      {entry.fields
        .filter((f) => f.key !== '' && f.value !== '')
        .map((f) => (
          <Text key={f.id || f.key} style={styles.body}>{`${f.key}: ${f.value}`}</Text>
        ))}
      <View style={styles.wrap}>
        <OutlineButton label="Comment" icon="comment-plus-outline" compact onPress={onComment} />
        {can(me.role, 'suggest') && <GoldButton label="Suggest an edit…" icon="pencil-outline" compact onPress={() => setSuggesting(true)} />}
      </View>
      {data.threads(`entry:${entry.id}`).map((t) => (
        <ThreadCard key={t.root.id} thread={t} me={me} actions={actions} showTarget={false} />
      ))}
      {suggesting && (
        <EntryEditSheet
          name={entry.name}
          rows={rows}
          onClose={() => setSuggesting(false)}
          onKeep={(values, note) => {
            const changes: FieldChange[] = rows.map((r, i) => ({ field: r.field, label: r.label, from: r.from, to: values[i] }));
            if (
              run(
                () => actions.suggestEntry({ entryId: entry.id, entryName: entry.name, changes, note }),
                'Your suggested edit is kept, ready for your feedback file. The entry itself is unchanged.',
              )
            ) {
              setSuggesting(false);
            }
          }}
        />
      )}
    </View>
  );
}

function EntryEditSheet({
  name,
  rows,
  onClose,
  onKeep,
}: {
  name: string;
  rows: { field: string; label: string; from: string }[];
  onClose: () => void;
  onKeep: (values: string[], note: string) => void;
}) {
  const [values, setValues] = useState(rows.map((r) => r.from));
  const [note, setNote] = useState('');
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Suggest an edit to “${name}”`}
      footer={
        <>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label="Keep my suggested edit" icon="check" onPress={() => onKeep(values, note)} style={styles.flex} />
        </>
      }
    >
      {rows.map((r, i) => (
        <Field
          key={r.field}
          label={r.label}
          value={values[i]}
          onChangeText={(v) => setValues(values.map((x, k) => (k === i ? v : x)))}
          multiline={r.field === 'description'}
        />
      ))}
      <Field label="A note for the author (optional)" value={note} onChangeText={setNote} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  body_: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  banner: { gap: space.sm, borderColor: colors.gold },
  bannerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.gold },
  heading: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', letterSpacing: 1, color: colors.gold },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  prose: { flex: 1, fontFamily: fonts.book, fontSize: 16, lineHeight: 26, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scene: { paddingLeft: space.xl },
  rowTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chapterTitle: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  paragraph: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  editRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.2, color: colors.gold, marginBottom: 4 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontFamily: fonts.book,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
});
