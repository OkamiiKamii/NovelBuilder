// TEAM AND FEEDBACK (FEATURES.md #321–#328): the owner's side of review by file. Who the novel is shared with and in
// what role, the review copies made for them (each holding only what that role may see), the feedback brought back
// (previewed first, with anything their role does not allow refused), and every conversation and suggested change,
// each to accept or reject; and the record of who did what. Nothing is sent by the app: files go only where the
// author chooses. A port of flutter_app/lib/features/collab/team_page.dart.

import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { pickTextFile, shareTextFile } from '../../data/files';
import { type Role, reviewRoles, roleLabel, roleSummary } from '../../domain/collab/access';
import type { Member } from '../../domain/collab/records';
import type { FeedbackPreview } from '../../domain/collab/reviewFiles';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { ActivityList, SuggestionCard, ThreadCard, plural, useRunCollab, whenWords } from './CollabParts';
import { type CollabActions, collabProblem, useCollab, useCollabActions } from './useCollab';

type Tab = 'people' | 'conversations' | 'suggestions' | 'activity';

export function TeamPane() {
  const data = useCollab();
  const actions = useCollabActions(data?.novelId ?? null);
  const toast = useToast();
  const run = useRunCollab();
  const [tab, setTab] = useState<Tab>('people');
  const [openOnly, setOpenOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<FeedbackPreview | null>(null);
  const [cannot, setCannot] = useState<{ name: string; message: string } | null>(null);

  if (data === null || actions === null) {
    return <Muted>Open a novel from your Library to share it for review.</Muted>;
  }
  if (data.me.role !== 'owner') {
    return (
      <Panel style={styles.gap}>
        <Icon name="account-group-outline" size={32} />
        <Text style={styles.heading}>This is a review copy</Text>
        <Muted>The team is kept by the novel’s owner. Your comments and suggestions go back in your feedback file, from Write.</Muted>
      </Panel>
    );
  }

  const sendCopy = async (m: Member) => {
    let file: { name: string; text: string };
    try {
      file = actions.reviewCopyFile(m);
    } catch (e) {
      toast(collabProblem(e) ?? String(e), { error: true });
      return;
    }
    try {
      await shareTextFile(file.name, file.text);
      if (m.status === 'invited') run(() => actions.updateMember(m, {}));
      toast(`Shared “${file.name}”. It holds only what ${roleLabel[m.role].toLowerCase()} may see.`);
    } catch (e) {
      toast(`The review copy could not be shared (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  const bringIn = async () => {
    let picked: { name: string; text: string } | null;
    try {
      picked = await pickTextFile();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
      return;
    }
    if (picked === null) return;
    try {
      setPreview(actions.previewFeedback(picked.text));
    } catch (e) {
      const problem = collabProblem(e);
      if (problem === null) throw e;
      setCannot({ name: picked.name, message: problem });
    }
  };

  const threads = data.threads().filter((t) => !openOnly || !t.root.resolved);
  const suggestions = openOnly ? data.open : data.suggestions;
  const openThreads = data.threads().filter((t) => !t.root.resolved).length;
  const tabLabel: Record<Tab, string> = {
    people: `People (${data.members.length})`,
    conversations: `Conversations (${openThreads} open)`,
    suggestions: `Suggestions (${data.open.length} waiting)`,
    activity: 'Activity',
  };

  return (
    <View style={styles.gap}>
      <View style={styles.wrap}>
        <OutlineButton label="Add a person…" icon="account-plus-outline" compact onPress={() => setAdding(true)} />
        <GoldButton label="Bring in feedback…" icon="inbox-arrow-down-outline" compact onPress={() => void bringIn()} />
      </View>
      <View style={styles.wrap}>
        {(['people', 'conversations', 'suggestions', 'activity'] as const).map((t) => (
          <Chip key={t} label={tabLabel[t]} selected={tab === t} onPress={() => setTab(t)} />
        ))}
      </View>
      {(tab === 'conversations' || tab === 'suggestions') && (
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{tab === 'conversations' ? 'Open conversations only' : 'Waiting suggestions only'}</Text>
          <Switch
            value={openOnly}
            onValueChange={setOpenOnly}
            trackColor={{ true: colors.gold, false: colors.border }}
            thumbColor={colors.text}
            accessibilityLabel={tab === 'conversations' ? 'Open conversations only' : 'Waiting suggestions only'}
          />
        </View>
      )}
      {tab === 'people' ? (
        data.members.length === 0 ? (
          <Panel style={styles.gapSm}>
            <Icon name="account-plus-outline" size={32} />
            <Text style={styles.heading}>Nobody yet</Text>
            <Muted>
              Add someone, then make a review copy for them. You send it yourself, by email or a drive; their feedback file comes
              back the same way.
            </Muted>
          </Panel>
        ) : (
          data.members.map((m) => <MemberCard key={m.id} member={m} actions={actions} onSend={() => void sendCopy(m)} />)
        )
      ) : tab === 'conversations' ? (
        threads.length === 0 ? (
          <Muted>{openOnly ? 'No open conversations.' : 'No conversations yet.'}</Muted>
        ) : (
          threads.map((t) => <ThreadCard key={t.root.id} thread={t} me={data.me} actions={actions} />)
        )
      ) : tab === 'suggestions' ? (
        suggestions.length === 0 ? (
          <Muted>{openOnly ? 'No suggestions waiting.' : 'No suggestions yet.'}</Muted>
        ) : (
          suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} me={data.me} actions={actions} />)
        )
      ) : (
        <ActivityList activity={data.activity} />
      )}

      {adding && <PersonSheet onClose={() => setAdding(false)} onAdd={(p) => {
        if (run(() => actions.addMember(p), `Added ${p.name.trim()}. Make a review copy for them to send.`)) setAdding(false);
      }} />}
      {preview !== null && (
        <PreviewSheet
          preview={preview}
          onClose={() => setPreview(null)}
          onTake={() => {
            const p = preview;
            setPreview(null);
            run(() => actions.importFeedback(p), `Took in the feedback from ${p.member.name}.`);
          }}
        />
      )}
      {cannot !== null && (
        <Sheet visible onClose={() => setCannot(null)} title="This feedback cannot be brought in" footer={<GoldButton label="OK" onPress={() => setCannot(null)} style={styles.flex} />}>
          <Text style={styles.body}>{`“${cannot.name}”: ${cannot.message}`}</Text>
        </Sheet>
      )}
    </View>
  );
}

function MemberCard({ member: m, actions, onSend }: { member: Member; actions: CollabActions; onSend: () => void }) {
  const run = useRunCollab();
  const [removing, setRemoving] = useState(false);
  const status =
    m.status === 'revoked'
      ? 'Removed: their feedback is not taken in'
      : m.lastSyncAt !== null
        ? `Feedback last brought in ${whenWords(m.lastSyncAt)}`
        : 'No feedback brought in yet';
  const editable = reviewRoles.includes(m.role);
  return (
    <Panel style={styles.gapSm}>
      <Text style={styles.heading}>{m.name}</Text>
      <Muted>{`${roleLabel[m.role]}${m.email === '' ? '' : ` · ${m.email}`}`}</Muted>
      <Muted>{status}</Muted>
      {!editable && (
        <Muted>{`A ${roleLabel[m.role].toLowerCase()} works with the original app’s live sharing, which this app does not do. Their records are kept.`}</Muted>
      )}
      {!m.revoked && editable && (
        <ChooserField
          label="Role"
          value={m.role}
          choices={reviewRoles.map((r) => ({ value: r, label: roleLabel[r] }))}
          onChoose={(r: Role) => {
            if (r !== m.role) run(() => actions.updateMember(m, { role: r }), `${m.name} is now ${roleLabel[r]}. Their next review copy follows it.`);
          }}
        />
      )}
      <View style={styles.wrap}>
        {!m.revoked && editable && <GoldButton label="Make a review copy…" icon="share-variant-outline" compact onPress={onSend} />}
        {m.revoked ? (
          <OutlineButton label="Restore" icon="restore" compact onPress={() => run(() => actions.updateMember(m, { status: 'active' }))} />
        ) : (
          <OutlineButton label="Remove" icon="account-remove-outline" compact tone="danger" onPress={() => setRemoving(true)} />
        )}
      </View>
      <ConfirmDelete
        visible={removing}
        title={`Remove ${m.name}?`}
        message="Feedback files from them will no longer be taken in. What they have already said stays, and you can restore them later."
        confirmLabel="Remove"
        onClose={() => setRemoving(false)}
        onConfirm={() => {
          setRemoving(false);
          run(() => actions.updateMember(m, { status: 'revoked' }));
        }}
      />
    </Panel>
  );
}

function PersonSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (p: { name: string; email: string; role: Role }) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('reader');
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add a person"
      footer={
        <>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton
            label="Add"
            icon="account-plus-outline"
            onPress={() => {
              if (name.trim() === '') {
                setError('Give the person a name.');
                return;
              }
              onAdd({ name, email, role });
            }}
            style={styles.flex}
          />
        </>
      }
    >
      <Field label="Name" value={name} onChangeText={setName} autoFocus hint={error ?? undefined} />
      <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="For your own reference: the app sends nothing." />
      {reviewRoles.map((r) => (
        <Pressable
          key={r}
          accessibilityRole="radio"
          accessibilityState={{ checked: role === r }}
          onPress={() => setRole(r)}
          style={({ pressed }) => [styles.radio, pressed && { backgroundColor: colors.elevated }]}
        >
          <Icon name={role === r ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={role === r ? colors.gold : colors.muted} />
          <View style={styles.flex}>
            <Text style={[styles.body, role === r && { color: colors.gold }]}>{roleLabel[r]}</Text>
            <Muted>{roleSummary[r]}</Muted>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}

function PreviewSheet({ preview, onClose, onTake }: { preview: FeedbackPreview; onClose: () => void; onTake: () => void }) {
  const root = (r: Record<string, unknown>) => r['parentId'] === null || r['parentId'] === undefined;
  const counts: [number, string, string?][] = [
    [preview.count('comments', (r) => root(r) && r['kind'] === 'comment'), 'new comment'],
    [preview.count('comments', (r) => !root(r)), 'reply', 'replies'],
    [preview.count('comments', (r) => r['kind'] === 'reaction'), 'reaction'],
    [preview.count('comments', (r) => r['kind'] === 'feedback'), 'feedback form'],
    [preview.count('suggestions'), 'suggestion'],
    [preview.writes.filter((w) => w.value === null).length, 'deletion'],
  ];
  const lines = counts.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));
  const refused = preview.refused;
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Feedback from ${preview.member.name}`}
      wide
      footer={
        <>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label="Take it in" icon="inbox-arrow-down-outline" disabled={preview.writes.length === 0} onPress={onTake} style={styles.flex} />
        </>
      }
    >
      <Text style={styles.body}>
        {`${roleLabel[preview.member.role]}, sent ${whenWords(preview.sentAt)}. ${lines.length === 0 ? 'Nothing new.' : `It brings ${lines.join(', ')}.`}`}
      </Text>
      {preview.unchanged > 0 && <Muted>{`${plural(preview.unchanged, 'change')} you already have.`}</Muted>}
      <Muted>Nothing in the book changes: suggested changes wait for you to accept or reject each one.</Muted>
      {refused.length > 0 && (
        <>
          <Text style={styles.strong}>
            {`${plural(refused.length, 'change')} in the file ${refused.length === 1 ? 'is' : 'are'} not taken in, because ${preview.member.name}’s role does not allow ${refused.length === 1 ? 'it' : 'them'}:`}
          </Text>
          {refused.slice(0, 8).map((r, i) => (
            <Text key={i} style={styles.body}>{`• ${r.what}: ${r.reason}`}</Text>
          ))}
          {refused.length > 8 && <Muted>{`…and ${refused.length - 8} more.`}</Muted>}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  heading: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  strong: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  radio: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: 8 },
});
