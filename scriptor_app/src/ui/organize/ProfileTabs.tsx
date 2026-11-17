// A character profile's tabs (FEATURES.md #176–#186): Overview (in one sentence, the sections, the relationship web,
// in the manuscript, in their pages, timeline, threads), Relationships, Details (description, sections, linked powers,
// items and affiliations), Secrets, Notes and History. Ports of flutter_app/lib/features/characters/tabs/*; the logic
// is src/domain/characters/screens/*.

import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Listed } from '../../domain/characters/cast';
import type { CharacterNote, CharacterSecret, Knowledge } from '../../domain/characters/characterRecords';
import { sightingsJob } from '../../domain/characters/namedIn';
import { type LoglinePart } from '../../domain/characters/logline';
import { detailsLinks } from '../../domain/characters/screens/details';
import { historyWords, recordLines, storyLines } from '../../domain/characters/screens/history';
import { copyDialog, noteCard, notesWords } from '../../domain/characters/screens/notes';
import { keepAnswer, keptAnswer, oneSentence, oneSentenceWords } from '../../domain/characters/screens/oneSentence';
import { characterThreads, characterTimeline, inTheManuscript, type ChapterLink } from '../../domain/characters/screens/overview';
import type { ProfilePage } from '../../domain/characters/screens/profile';
import { deleteSecretWords, knowledgeChoices, secretCard, secretsWords } from '../../domain/characters/screens/secrets';
import { theirPages, theirPagesInputs } from '../../domain/characters/screens/theirPages';
import { relationWeb, identityFacts } from '../../domain/characters/screens/vault';
import { newId } from '../../domain/ids';
import { addRelationshipDialog, relationshipPath } from '../../domain/relationships/screens/relationshipPage';
import { relationshipsTabView } from '../../domain/relationships/screens/relationshipsTab';
import { RelationChanges } from '../../domain/relationships/relationChanges';
import { relationSettingsOf } from '../../domain/relationships/relationTypes';
import { lastNodeSetting } from '../write/WriteScreen';
import { ConfirmDelete, PromptSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { ProfilePageBoxes } from './CastFound';
import { ConnectionsPanel } from './ConnectionsPanel';
import { EntityRef } from '../../domain/model/entityRef';
import { Face } from './CastPane';
import { ChooserField, SavedText } from './parts';
import { SectionsView } from './SectionsView';
import type { OpenCast } from './useCast';

export function ProfileTab({ page, open, listed }: { page: ProfilePage; open: OpenCast; listed: Listed }) {
  switch (page) {
    case 'relationships':
      return <RelationshipsTab open={open} listed={listed} />;
    case 'details':
      return <DetailsTab open={open} listed={listed} />;
    case 'secrets':
      return <SecretsTab open={open} listed={listed} />;
    case 'notes':
      return <NotesTab open={open} listed={listed} />;
    case 'history':
      return <HistoryTab open={open} listed={listed} />;
    default:
      return <OverviewTab open={open} listed={listed} />;
  }
}

/** Opens a chapter or scene in Write (the place it is remembered is Write's own). */
function useOpenChapter(open: OpenCast) {
  const lib = useLibrary();
  const router = useRouter();
  return (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), nodeId));
    router.navigate('/write');
  };
}

function ChapterChips({ chapters, onOpen }: { chapters: ChapterLink[]; onOpen: (id: string) => void }) {
  return (
    <View style={styles.row}>
      {chapters.map((c) => (
        <Chip key={c.nodeId} label={c.label} selected={false} onPress={() => onOpen(c.nodeId)} />
      ))}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ overview

function OverviewTab({ open, listed }: { open: OpenCast; listed: Listed }) {
  const { cast } = open;
  const router = useRouter();
  const toast = useToast();
  const openChapter = useOpenChapter(open);
  const entry = listed.entry;
  const sentence = oneSentence(cast, entry.id);
  const [asking, setAsking] = useState<LoglinePart | null>(null);
  const [all, setAll] = useState(false);
  const facts = identityFacts(cast, entry, listed.profile);
  const web = relationWeb(cast, entry);
  const manuscript = inTheManuscript(cast, listed);
  const timeline = characterTimeline(cast, entry.id, entry.name);
  const threads = characterThreads(cast, entry.id, entry.name);
  const found = useMemo(() => {
    const inputs = theirPagesInputs(cast, entry.id);
    return inputs ? sightingsJob(open.service.storedChapters(open.novelId), inputs.where, inputs.names)() : null;
  }, [cast, entry.id, open]);
  const pages = theirPages(cast, found, all);
  const ask = asking && sentence ? sentence.ask(asking) : null;
  return (
    <View style={styles.wrap}>
      {sentence && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{oneSentenceWords.title}</Text>
          <Text style={styles.sentence}>
            {sentence.pieces.map((p, i) =>
              p.part === null ? (
                <Text key={i}>{p.text}</Text>
              ) : (
                <Text key={i} accessibilityRole="button" accessibilityLabel={sentence.partLabel(p)} onPress={() => setAsking(p.part)} style={p.gap ? styles.gap : styles.filled}>
                  {p.text}
                </Text>
              ),
            )}
          </Text>
          <Muted>{sentence.caption}</Muted>
          {sentence.whole && (
            <OutlineButton
              label={oneSentenceWords.copy}
              icon="content-copy"
              compact
              tone="muted"
              onPress={() => {
                void Clipboard.setStringAsync(sentence.whole!);
                toast(oneSentenceWords.copied);
              }}
              style={styles.start}
            />
          )}
        </Panel>
      )}
      {facts.length > 0 && (
        <Panel style={styles.panel}>
          {facts.map((f) => (
            <View key={f.name} style={styles.fact}>
              <Text style={styles.factName}>{f.name}</Text>
              <Text style={styles.factValue}>{f.value}</Text>
            </View>
          ))}
        </Panel>
      )}
      <SectionsView open={open} listed={listed} tab="overview" />
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>RELATIONSHIPS</Text>
        {web.empty ? (
          <Muted>{web.empty}</Muted>
        ) : (
          <View style={styles.row}>
            {web.shown.map((s) => (
              <Pressable key={s.other.id} accessibilityRole="button" accessibilityLabel={s.label} onPress={() => router.navigate(`/organize/character/${s.other.id}`)} style={styles.webItem}>
                <Face size={44} image={s.other.image ?? undefined} name={s.other.name} id={s.other.id} />
                <Text style={styles.webName} numberOfLines={1}>
                  {s.other.name}
                </Text>
                <Text style={styles.webRole} numberOfLines={1}>
                  {s.role}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {web.more && <Muted>{web.more}</Muted>}
      </Panel>
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{manuscript.title.toUpperCase()}</Text>
        {manuscript.empty && <Muted>{manuscript.empty}</Muted>}
        {[manuscript.linked, manuscript.named, manuscript.appears, manuscript.mentioned].map((part, i) =>
          part ? (
            <View key={i} style={styles.part}>
              <Text style={styles.text}>{part.text}</Text>
              <ChapterChips chapters={part.chapters} onOpen={openChapter} />
              {(part as { more?: string | null }).more ? <Muted>{(part as { more?: string | null }).more}</Muted> : null}
            </View>
          ) : null,
        )}
      </Panel>
      {pages && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{pages.title.toUpperCase()}</Text>
          <Muted>{pages.caption}</Muted>
          {pages.passages.map((p, i) => (
            <Pressable key={i} accessibilityRole="button" onPress={() => openChapter(p.sighting.nodeId)} style={({ pressed }) => [styles.passage, pressed && { backgroundColor: colors.elevated }]}>
              <Text style={styles.passageWhere}>{p.chapter}</Text>
              <Text style={styles.quote}>
                {p.quote.before}
                <Text style={styles.quoteName}>{p.quote.name}</Text>
                {p.quote.after}
              </Text>
            </Pressable>
          ))}
          {pages.toggle && <OutlineButton label={pages.toggle} compact tone="muted" onPress={() => setAll(!all)} style={styles.start} />}
        </Panel>
      )}
      <ProfilePageBoxes open={open} entry={entry} profile={listed.profile} />
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{timeline.title.toUpperCase()}</Text>
        {timeline.empty ? <Muted>{timeline.empty}</Muted> : timeline.dated.map((t) => <Text key={t.event.id} style={styles.text}>{t.title}{t.age ? ` · ${t.age}` : ''}</Text>)}
        {timeline.undatedTitle && <Muted>{timeline.undatedTitle}</Muted>}
        {timeline.undated.map((t) => (
          <Text key={t.event.id} style={styles.text}>
            {t.title}
          </Text>
        ))}
      </Panel>
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{threads.title.toUpperCase()}</Text>
        {threads.empty ? <Muted>{threads.empty}</Muted> : threads.threads.map((t) => <Text key={t.thread.id} style={styles.text}>{t.title} · {t.status}</Text>)}
      </Panel>
      <ConnectionsPanel open={open} self={new EntityRef('entry', entry.id)} />
      {ask && asking && (
        <PromptSheet
          visible
          title={ask.question}
          label={ask.question}
          initial={ask.value}
          confirmLabel={oneSentenceWords.keep}
          onSubmit={(text) => {
            setAsking(null);
            const answer = keptAnswer(text);
            if (answer) open.now((c) => keepAnswer(c, entry.id, asking, answer));
          }}
          onClose={() => setAsking(null)}
        />
      )}
    </View>
  );
}

// -------------------------------------------------------------------------------------------------- relationships

function RelationshipsTab({ open, listed }: { open: OpenCast; listed: Listed }) {
  const router = useRouter();
  const toast = useToast();
  const { cast } = open;
  const view = relationshipsTabView(cast.model, listed.entry);
  const settings = relationSettingsOf(cast.snapshot.rows('relationSettings'));
  const [adding, setAdding] = useState<{ with: string; type: string } | null>(null);
  const dialog = addRelationshipDialog(cast.model, settings, listed.entry.id);
  const start = () => {
    if ('tell' in dialog) toast(dialog.tell);
    else setAdding({ with: dialog.with.choices[0]?.value ?? '', type: dialog.type.value });
  };
  const create = () => {
    if (!adding) return;
    const made = open.now((c) => {
      const r = new RelationChanges(c.snapshot, { now: Date.now(), createId: newId });
      const rel = r.createRelation(listed.entry.id, adding.with, adding.type);
      c.snapshot = r.snapshot;
      return rel;
    });
    setAdding(null);
    if (made) router.navigate(relationshipPath(made.id));
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <GoldButton label={view.addLabel} icon="plus" compact onPress={start} />
        <OutlineButton label={view.settings.label} icon="cog-outline" compact tone="muted" onPress={() => router.navigate('/organize/relationships/settings')} />
        <OutlineButton label="Relationship map" icon="graph-outline" compact tone="muted" onPress={() => router.navigate('/organize/ties')} />
      </View>
      <Text style={styles.kicker}>{view.title.toUpperCase()}</Text>
      {view.rows.length === 0 ? (
        <Muted>{view.none}</Muted>
      ) : (
        view.rows.map((r) => (
          <Pressable key={r.relation.id} accessibilityRole="button" accessibilityLabel={`${r.title}. ${r.subtitle}. ${view.openLabel}`} onPress={() => router.navigate(r.opens)} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.elevated }]}>
            <Face size={40} image={r.other.image ?? undefined} name={r.other.name} id={r.other.id} />
            <View style={styles.flex}>
              <Text style={styles.text}>{r.title}</Text>
              <Muted>{r.subtitle}</Muted>
            </View>
            <Icon name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ))
      )}
      {adding && !('tell' in dialog) && (
        <Sheet
          visible
          onClose={() => setAdding(null)}
          title={dialog.title}
          footer={
            <>
              <OutlineButton label={dialog.cancel} onPress={() => setAdding(null)} tone="muted" style={styles.flex} />
              <GoldButton label={dialog.confirm} onPress={create} disabled={!adding.with} style={styles.flex} />
            </>
          }
        >
          <ChooserField label={dialog.with.label} value={adding.with} choices={dialog.with.choices} onChoose={(v) => setAdding({ ...adding, with: v })} />
          <ChooserField label={dialog.type.label} value={adding.type} choices={dialog.type.choices} helper={dialog.type.helper} onChoose={(v) => setAdding({ ...adding, type: v })} />
        </Sheet>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- details

function DetailsTab({ open, listed }: { open: OpenCast; listed: Listed }) {
  const { cast } = open;
  const router = useRouter();
  const entry = listed.entry;
  const d = detailsLinks(cast, entry, listed.profile);
  const [link, setLink] = useState({ id: '', role: '' });
  const box = (b: typeof d.powers | typeof d.others, caption?: string) => (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{b.title.toUpperCase()}</Text>
      {caption && <Muted>{caption}</Muted>}
      {b.empty && <Muted>{b.empty}</Muted>}
      {b.rows.map((r) => (
        <View key={r.link.linkId} style={styles.linkRow}>
          <View style={styles.flex}>
            <Text style={styles.text}>{r.link.entry.name}</Text>
            <Muted>{r.kind}</Muted>
            <SavedText label={r.roleLabel} value={r.link.label} onSave={(v) => open.later(`link:${r.link.linkId}:label`, (c) => c.labelLink(r.link.linkId, entry.id, v))} />
            {r.statuses && <ChooserField label="Status" value={r.status} choices={r.statuses} onChoose={(v) => open.now((c) => c.setLinkStatus(entry.id, r.link.linkId, v))} />}
          </View>
          <IconButton icon="link-variant-off" label={r.removeTooltip} color={colors.danger} onPress={() => open.now((c) => c.unlink(r.link.linkId))} />
        </View>
      ))}
    </Panel>
  );
  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <SavedText label={d.description.title} placeholder={d.description.hint} value={entry.description} multiline minLines={5} onSave={(v) => open.later(`entry:${entry.id}:description`, (c) => c.updateEntry(entry.id, { description: v }))} />
      </Panel>
      <SectionsView open={open} listed={listed} tab="details" />
      {box(d.powers)}
      {box(d.items)}
      {box(d.others, d.others.caption)}
      <Panel style={styles.panel}>
        {d.add.empty ? (
          <Muted>{d.add.empty}</Muted>
        ) : (
          <>
            <ChooserField label={d.add.label} value={link.id} choices={[{ value: '', label: 'Choose…' }, ...d.add.linkable.map((l) => ({ value: l.id, label: l.label }))]} onChoose={(v) => setLink({ ...link, id: v })} />
            <Field label={d.add.roleLabel} placeholder={d.add.roleHint} value={link.role} onChangeText={(v) => setLink({ ...link, role: v })} />
            <GoldButton
              label={d.add.button}
              icon="link-variant"
              compact
              disabled={!link.id}
              onPress={() => {
                if (open.now((c) => c.linkEntries(entry.id, link.id, link.role))) setLink({ id: '', role: '' });
              }}
            />
          </>
        )}
        <OutlineButton label="The world" icon="earth" compact tone="muted" onPress={() => router.navigate('/organize')} style={styles.start} />
      </Panel>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- secrets

function SecretsTab({ open, listed }: { open: OpenCast; listed: Listed }) {
  const entry = listed.entry;
  const secrets = open.cast.secrets(entry.id);
  const [title, setTitle] = useState('');
  return (
    <View style={styles.wrap}>
      <Muted>{secretsWords.intro(entry.name)}</Muted>
      <Panel style={styles.panel}>
        <Field label={secretsWords.newSecret} placeholder={secretsWords.newSecretHint} value={title} onChangeText={setTitle} />
        <GoldButton
          label={secretsWords.add}
          icon="plus"
          compact
          disabled={title.trim().length === 0}
          onPress={() => {
            if (open.now((c) => c.saveSecret(entry.id, null, { title }))) setTitle('');
          }}
        />
      </Panel>
      {secrets.length === 0 ? <Muted>{secretsWords.empty}</Muted> : secrets.map((s) => <SecretCard key={s.id} open={open} listed={listed} secret={s} />)}
    </View>
  );
}

function SecretCard({ open, listed, secret }: { open: OpenCast; listed: Listed; secret: CharacterSecret }) {
  const entry = listed.entry;
  const card = secretCard(open.cast, entry, secret);
  const del = deleteSecretWords(secret);
  const [deleting, setDeleting] = useState(false);
  const save = (changes: Record<string, unknown>) => open.now((c) => c.saveSecret(entry.id, secret.id, changes as never));
  const later = (what: string, changes: Record<string, unknown>) =>
    open.later(`secret:${secret.id}:${what}`, (c) => {
      c.saveSecret(entry.id, secret.id, changes as never);
    });
  const doc = (label: string, ch: typeof card.first, key: string) => (
    <ChooserField
      label={label}
      value={ch.selected}
      choices={ch.items}
      onChoose={(v) => {
        const id = ch.pick(v);
        if (id !== undefined) save({ [key]: id });
      }}
    />
  );
  return (
    <Panel style={styles.panel}>
      <View style={styles.head}>
        <Text style={[styles.kicker, styles.flex]}>{secretsWords.secret.toUpperCase()}</Text>
        <IconButton icon="delete-outline" label={del.tooltip} color={colors.danger} onPress={() => setDeleting(true)} />
      </View>
      <SavedText label={secretsWords.secret} value={secret.title} onSave={(v) => later('title', { title: v })} />
      <ChooserField label={secretsWords.status} value={secret.status} choices={card.statuses} onChoose={(v) => save({ status: v })} />
      <SavedText label={secretsWords.truth} hint={secretsWords.truthHint} value={secret.description} multiline minLines={3} onSave={(v) => later('description', { description: v })} />
      <Text style={styles.kicker}>{secretsWords.whoKnows.toUpperCase()}</Text>
      {card.self.menu ? (
        <ChooserField label={card.self.menu.label} value={card.self.menu.value} choices={knowledgeChoices} onChoose={(v: Knowledge) => save({ self: v })} />
      ) : (
        <Muted>{card.self.line}</Muted>
      )}
      {card.lists.map((l) => (
        <View key={l.key}>
          <Text style={styles.label}>{l.label.toUpperCase()}</Text>
          <View style={styles.row}>
            {l.picker.chips.map((chip) => (
              <Pressable key={chip.id} accessibilityRole="button" accessibilityLabel={chip.removeTooltip} onPress={() => save({ [l.key]: chip.without })} style={styles.idChip}>
                <Text style={styles.idChipText}>{chip.name}</Text>
                <Icon name="close" size={14} color={colors.onGold} />
              </Pressable>
            ))}
            {l.picker.addable.length > 0 && (
              <ChooserField label={l.picker.addTooltip} value="" choices={[{ value: '', label: 'Add…' }, ...l.picker.addable]} onChoose={(v) => v && save({ [l.key]: l.picker.add(v) })} />
            )}
          </View>
        </View>
      ))}
      {card.withHistory && <Muted>{card.withHistory}</Muted>}
      {card.now && <Muted>{card.now}</Muted>}
      <Text style={styles.kicker}>{secretsWords.reader.toUpperCase()}</Text>
      <ChooserField label={secretsWords.readerKnows} value={card.reader.value} choices={knowledgeChoices} onChoose={(v: Knowledge) => save({ reader: v })} />
      {doc(secretsWords.readerFrom, card.reader.from, 'readerNodeId')}
      <Text style={styles.kicker}>{secretsWords.inTheStory.toUpperCase()}</Text>
      {doc(secretsWords.firstAppears, card.first, 'firstNodeId')}
      {doc(secretsWords.revealedIn, card.reveal, 'revealNodeId')}
      {card.revealEvent && (
        <ChooserField
          label={secretsWords.revealEvent}
          value={card.revealEvent.selected}
          choices={card.revealEvent.items}
          onChoose={(v) => {
            const changes = card.revealEvent!.pick(v);
            if (changes) save(changes);
          }}
        />
      )}
      <Text style={styles.label}>{secretsWords.relatedChapters.toUpperCase()}</Text>
      <IdChips picker={card.chapters} onSet={(ids) => save({ nodeIds: ids })} />
      {card.threads && (
        <>
          <Text style={styles.label}>{secretsWords.relatedThreads.toUpperCase()}</Text>
          <IdChips picker={card.threads} onSet={(ids) => save({ threadIds: ids })} />
        </>
      )}
      {card.spread && (
        <>
          <Text style={styles.kicker}>{secretsWords.spreads.toUpperCase()}</Text>
          <Muted>{secretsWords.spreadsNote}</Muted>
          {[...card.spread.records, ...card.spread.needs].map((l, i) => (
            <Text key={i} style={styles.text}>
              {l}
            </Text>
          ))}
        </>
      )}
      <SavedText label={secretsWords.notes} value={secret.notes} multiline minLines={2} onSave={(v) => later('notes', { notes: v })} />
      <ConfirmDelete
        visible={deleting}
        title={del.title}
        message={del.message}
        confirmLabel={del.confirm}
        onConfirm={() => {
          setDeleting(false);
          open.now((c) => c.removeSecret(secret.id));
        }}
        onClose={() => setDeleting(false)}
      />
    </Panel>
  );
}

function IdChips({ picker, onSet }: { picker: ReturnType<typeof secretCard>['chapters']; onSet: (ids: string[]) => void }) {
  return (
    <View style={styles.row}>
      {picker.chips.map((chip) => (
        <Pressable key={chip.id} accessibilityRole="button" accessibilityLabel={chip.removeTooltip} onPress={() => onSet(chip.without)} style={styles.idChip}>
          <Text style={styles.idChipText}>{chip.name}</Text>
          <Icon name="close" size={14} color={colors.onGold} />
        </Pressable>
      ))}
      {picker.empty && <Muted>{picker.empty}</Muted>}
      {picker.addable.length > 0 && (
        <View style={styles.flex}>
          <ChooserField label={picker.addTooltip} value="" choices={[{ value: '', label: 'Add…' }, ...picker.addable]} onChoose={(v) => v && onSet(picker.add(v))} />
        </View>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------------------------------------- notes

function NotesTab({ open, listed }: { open: OpenCast; listed: Listed }) {
  const entry = listed.entry;
  const notes = open.cast.notes(entry.id);
  const [text, setText] = useState('');
  return (
    <View style={styles.wrap}>
      <Muted>{notesWords.intro(entry.name)}</Muted>
      <Panel style={styles.panel}>
        <Field label={notesWords.newNote} value={text} onChangeText={setText} multiline />
        <GoldButton
          label={notesWords.add}
          icon="plus"
          compact
          disabled={text.trim().length === 0}
          onPress={() => {
            if (open.now((c) => c.saveNote(entry.id, null, { content: text }))) setText('');
          }}
        />
      </Panel>
      {notes.length === 0 ? <Muted>{notesWords.empty}</Muted> : notes.map((n) => <NoteCard key={n.id} open={open} listed={listed} note={n} />)}
    </View>
  );
}

function NoteCard({ open, listed, note }: { open: OpenCast; listed: Listed; note: CharacterNote }) {
  const toast = useToast();
  const entry = listed.entry;
  const card = noteCard(open.cast, note);
  const copy = copyDialog(listed.profile, note);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState<{ section: string; field: string } | null>(null);
  const later = (what: string, changes: Parameters<typeof open.cast.notes>[0] extends string ? Record<string, unknown> : never) =>
    open.later(`note:${note.id}:${what}`, (c) => {
      c.saveNote(entry.id, note.id, changes);
    });
  return (
    <Panel style={[styles.panel, note.pinned && { borderColor: colors.gold }]}>
      <View style={styles.head}>
        {note.pinned && <Icon name="pin" size={16} />}
        <Muted style={styles.flex}>{card.when}</Muted>
        <IconButton icon={note.pinned ? 'pin-off-outline' : 'pin-outline'} label={card.pinLabel} onPress={() => open.now((c) => c.saveNote(entry.id, note.id, { pinned: !note.pinned }))} />
        <IconButton icon="delete-outline" label={card.deleteTooltip} color={colors.danger} onPress={() => setDeleting(true)} />
      </View>
      <SavedText label={notesWords.title} value={note.title} onSave={(v) => later('title', { title: v })} />
      <SavedText label={notesWords.note} value={note.content} multiline minLines={3} onSave={(v) => later('content', { content: v })} />
      <SavedText label={notesWords.tags} value={card.tags} onSave={(v) => later('tags', { tags: v.split(',') })} />
      <Text style={styles.label}>{notesWords.chapters.toUpperCase()}</Text>
      <IdChips picker={card.chapters} onSet={(ids) => open.now((c) => c.saveNote(entry.id, note.id, { nodeIds: ids }))} />
      <OutlineButton
        label={notesWords.copy}
        icon="content-copy"
        compact
        tone="muted"
        onPress={() => ('noSection' in copy ? toast(copy.noSection) : setCopying({ section: copy.section, field: copy.field }))}
        style={styles.start}
      />
      {copying && !('noSection' in copy) && (
        <Sheet
          visible
          onClose={() => setCopying(null)}
          title={copy.title}
          footer={
            <>
              <OutlineButton label={copy.cancel} onPress={() => setCopying(null)} tone="muted" style={styles.flex} />
              <GoldButton
                label={copy.confirm}
                disabled={!copy.canCopy(copying.field)}
                onPress={() => {
                  const done = open.now((c) => c.promoteNote(note.id, copying.section, copying.field));
                  if (done) toast(copy.copied(copying.section, copying.field));
                  setCopying(null);
                }}
                style={styles.flex}
              />
            </>
          }
        >
          <Muted>{copy.message}</Muted>
          <ChooserField label="Section" value={copying.section} choices={copy.sections} onChoose={(v) => setCopying({ ...copying, section: v })} />
          <Field label={copy.fieldLabel} placeholder={copy.fieldHint} value={copying.field} onChangeText={(v) => setCopying({ ...copying, field: v })} />
        </Sheet>
      )}
      <ConfirmDelete
        visible={deleting}
        title={card.deleteConfirm.title}
        message={card.deleteConfirm.message}
        confirmLabel={card.deleteConfirm.confirm}
        onConfirm={() => {
          setDeleting(false);
          open.now((c) => c.removeNote(note.id));
        }}
        onClose={() => setDeleting(false)}
      />
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------------- history

function HistoryTab({ open, listed }: { open: OpenCast; listed: Listed }) {
  const entry = listed.entry;
  const [text, setText] = useState('');
  const [where, setWhere] = useState<string | null>(null);
  const words = historyWords(open.cast, entry, where);
  const story = storyLines(open.cast, entry);
  const records = recordLines(open.cast, entry);
  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{words.story.title.toUpperCase()}</Text>
        <Muted>{words.story.caption}</Muted>
        {story.length === 0 ? (
          <Muted>{words.story.empty}</Muted>
        ) : (
          story.map((l) => (
            <View key={l.key} style={styles.historyRow}>
              <View style={styles.flex}>
                <Text style={styles.text}>{l.text}</Text>
                <Muted>
                  {l.where} · {l.source}
                </Muted>
              </View>
              {l.removable && l.removeTooltip && <IconButton icon="close" label={l.removeTooltip} color={colors.muted} onPress={() => open.now((c) => c.removeMilestone(l.removable!))} />}
            </View>
          ))
        )}
        <Field label={words.milestone.label} placeholder={words.milestone.hint} value={text} onChangeText={setText} />
        <ChooserField
          label={words.milestone.whereLabel}
          value={words.milestone.where.selected}
          choices={words.milestone.where.items}
          onChoose={(v) => {
            const id = words.milestone.where.pick(v);
            if (id !== undefined) setWhere(id);
          }}
        />
        <GoldButton
          label={words.milestone.add}
          icon="plus"
          compact
          disabled={text.trim().length === 0}
          onPress={() => {
            if (open.now((c) => c.addMilestone(entry.id, text, where))) setText('');
          }}
        />
      </Panel>
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{words.record.title.toUpperCase()}</Text>
        <Muted>{words.record.caption}</Muted>
        {records.length === 0 ? (
          <Muted>{words.record.empty}</Muted>
        ) : (
          records.map((r) => (
            <View key={r.line.id} style={styles.historyRow}>
              <View style={styles.flex}>
                <Text style={styles.text}>{r.text}</Text>
                <Muted>{r.when}</Muted>
              </View>
            </View>
          ))
        )}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  panel: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.muted, marginTop: space.xs },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  start: { alignSelf: 'flex-start' },
  sentence: { fontFamily: fonts.book, fontSize: 18, lineHeight: 28, color: colors.text },
  filled: { color: colors.gold, textDecorationLine: 'underline' },
  part: { gap: space.xs },
  gap: { color: colors.sky, textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
  fact: { flexDirection: 'row', gap: space.md },
  factName: { width: 110, fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  factValue: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  webItem: { width: 84, alignItems: 'center', gap: 2 },
  webName: { fontFamily: fonts.ui, fontSize: 13, color: colors.text, textAlign: 'center' },
  webRole: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted, textAlign: 'center' },
  passage: { padding: space.sm, borderRadius: radius.field, borderLeftWidth: 3, borderLeftColor: colors.gold, gap: 2 },
  passageWhere: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  quote: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 23, color: colors.text },
  quoteName: { color: colors.gold, fontFamily: fonts.book },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.sm, borderRadius: radius.field, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  idChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: space.md, borderRadius: radius.chip, backgroundColor: colors.gold },
  idChipText: { fontFamily: fonts.ui, fontSize: 13, color: colors.onGold },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
});
