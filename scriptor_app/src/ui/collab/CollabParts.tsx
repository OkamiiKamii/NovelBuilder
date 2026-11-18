// The pieces of review by file both sides use: one conversation (what it is about, the first message, its replies,
// and what the person here may do with it), one suggestion (each change of a text suggestion, removed words struck
// through and added words shown, or the field changes of an entry edit; an author accepts or rejects each, its
// writer may withdraw it), and the record of who did what. A port of flutter_app/lib/features/collab/collab_widgets.dart.

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { can, roleLabel } from '../../domain/collab/access';
import { textHunks, textOf } from '../../domain/collab/hunks';
import { type Activity, type Comment, feedbackQuestions, type Me, type Suggestion, type Thread } from '../../domain/collab/records';
import { mapOrNull, str } from '../../domain/json';
import { ConfirmDelete } from '../dialogs';
import { GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { type CollabActions, collabProblem } from './useCollab';

/** Runs a change, saying why when it cannot be made. Nothing is changed when it fails. Returns whether it was made. */
export function useRunCollab(): (change: () => void, done?: string) => boolean {
  const toast = useToast();
  return (change, done) => {
    try {
      change();
    } catch (e) {
      const problem = collabProblem(e);
      if (problem === null) throw e;
      toast(problem, { error: true });
      return false;
    }
    if (done) toast(done);
    return true;
  };
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Nov 2026, 4:05 pm", as the Flutter app writes a time. */
export function whenWords(millis: number): string {
  const d = new Date(millis);
  const hour = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hour}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/** "3 changes", "1 change". */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

function Message({ c, me, actions }: { c: Comment; me: Me; actions: CollabActions }) {
  const run = useRunCollab();
  const [asking, setAsking] = useState(false);
  const mine = c.authorId === me.id;
  const mayDelete = mine || can(me.role, 'decide');
  const ratings = c.ratings;
  return (
    <View style={styles.message}>
      <View style={styles.wrap}>
        <Text style={styles.author}>{c.authorName === '' ? 'Someone' : c.authorName}</Text>
        <Muted>{`${roleLabel[c.authorRole]} · ${whenWords(c.createdAt)}`}</Muted>
      </View>
      {c.deleted ? (
        <Muted>(Deleted by its writer.)</Muted>
      ) : c.kind === 'reaction' ? (
        <Text style={styles.body}>{`Reaction: ${c.body}`}</Text>
      ) : c.kind === 'feedback' ? (
        <>
          <Text style={styles.body}>
            {`Feedback: ${feedbackQuestions
              .filter((q) => ratings.has(q.key))
              .map((q) => `${q.label} ${Math.trunc(ratings.get(q.key)!)} of 5`)
              .join(' · ')}`}
          </Text>
          {c.body !== '' && <Text style={styles.body}>{c.body}</Text>}
        </>
      ) : (
        <Text style={styles.body}>{c.body}</Text>
      )}
      {mayDelete && !c.deleted && (
        <OutlineButton label="Delete" icon="delete-outline" compact tone="muted" onPress={() => setAsking(true)} style={styles.start} />
      )}
      <ConfirmDelete
        visible={asking}
        title="Delete this message?"
        message={c.isRoot ? 'The conversation goes with it, unless others have replied: then only these words go.' : 'Only this reply goes.'}
        confirmLabel="Delete"
        onClose={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          run(() => actions.remove(c));
        }}
      />
    </View>
  );
}

/** One conversation: what it is about, the first message, its replies, and what the person here may do with it. */
export function ThreadCard({ thread, me, actions, showTarget = true }: { thread: Thread; me: Me; actions: CollabActions; showTarget?: boolean }) {
  const run = useRunCollab();
  const [text, setText] = useState('');
  const { root, replies } = thread;
  const mayResolve = can(me.role, 'decide') || me.role === 'editor';
  const mayReply = can(me.role, 'comment');
  return (
    <Panel style={styles.card}>
      <View style={styles.wrap}>
        {showTarget && <Text style={styles.label}>{`On “${root.targetLabel}”`}</Text>}
        {root.resolved && (
          <View style={styles.resolved}>
            <Icon name="check-circle-outline" size={16} color={colors.success} />
            <Text style={styles.resolvedText}>{`Resolved${root.resolvedBy === null ? '' : ` by ${root.resolvedBy}`}`}</Text>
          </View>
        )}
      </View>
      {root.quote !== '' && (
        <View style={styles.quote}>
          <Text style={styles.quoteText}>{`“${root.quote}”`}</Text>
        </View>
      )}
      <Message c={root} me={me} actions={actions} />
      {replies.map((r) => (
        <View key={r.id} style={styles.replyIndent}>
          <Message c={r} me={me} actions={actions} />
        </View>
      ))}
      {mayReply && (
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Reply"
          placeholderTextColor={colors.muted}
          selectionColor={colors.gold}
          multiline
          accessibilityLabel="Reply"
          style={styles.input}
        />
      )}
      <View style={styles.wrap}>
        {mayReply && (
          <OutlineButton
            label="Send reply"
            icon="send-outline"
            compact
            onPress={() => {
              if (run(() => actions.reply(root, text))) setText('');
            }}
          />
        )}
        {mayResolve && (
          <OutlineButton
            label={root.resolved ? 'Re-open' : 'Resolve'}
            icon={root.resolved ? 'restore' : 'check'}
            compact
            tone="muted"
            onPress={() => run(() => actions.setResolved(root, !root.resolved))}
          />
        )}
      </View>
    </Panel>
  );
}

function Change({ label, removed, added }: { label: string; removed: string; added: string }) {
  return (
    <View style={styles.change}>
      <Text style={styles.label}>{label}</Text>
      {removed !== '' && (
        <Text style={styles.body}>
          <Text style={styles.outIn}>Out: </Text>
          <Text style={styles.removed}>{removed}</Text>
        </Text>
      )}
      {added !== '' && (
        <Text style={styles.body}>
          <Text style={styles.outIn}>In: </Text>
          <Text style={styles.added}>{added}</Text>
        </Text>
      )}
    </View>
  );
}

/** One suggestion: each change, accepted or rejected by an author; its writer may withdraw it. */
export function SuggestionCard({ suggestion: s, me, actions }: { suggestion: Suggestion; me: Me; actions: CollabActions }) {
  const run = useRunCollab();
  const decides = can(me.role, 'decide');
  const mine = s.authorId === me.id;
  const hunks = s.isText ? textHunks(s.base, s.proposed) : [];
  const verdictOf = (id: string): string => {
    const d = mapOrNull(s.decisions[id]);
    return d === null ? '' : ` (${str(d['verdict'])} by ${str(d['byName'])})`;
  };
  return (
    <Panel style={styles.card}>
      <Text style={styles.title}>{s.isText ? `Changes to “${s.targetLabel}”` : `An edit to “${s.targetLabel}”`}</Text>
      <Muted>{`Suggested by ${s.authorName} · ${whenWords(s.createdAt)} · ${s.status}`}</Muted>
      {s.note !== '' && <Text style={styles.body}>{`Note: ${s.note}`}</Text>}
      {s.isText
        ? hunks.map((h, i) => (
            <View key={h.id} style={styles.gapSm}>
              <Change
                label={`Change ${i + 1} of ${hunks.length}, at paragraph ${h.at + 1}${verdictOf(h.id)}`}
                removed={textOf(h.remove)}
                added={textOf(h.insert)}
              />
              {decides && !Object.prototype.hasOwnProperty.call(s.decisions, h.id) && (
                <View style={styles.wrap}>
                  <GoldButton
                    label="Accept"
                    icon="check"
                    compact
                    onPress={() =>
                      run(
                        () => actions.decideText(s, h.id, true),
                        'Accepted. The text it replaced is in the chapter’s version history.',
                      )
                    }
                  />
                  <OutlineButton label="Reject" icon="close" compact tone="muted" onPress={() => run(() => actions.decideText(s, h.id, false))} />
                </View>
              )}
            </View>
          ))
        : (
          <>
            {s.changes.map((c, i) => (
              <Change key={`${c.field}-${i}`} label={c.label} removed={c.from} added={c.to} />
            ))}
            {decides && s.status === 'pending' && (
              <View style={styles.wrap}>
                <GoldButton label="Accept" icon="check" compact onPress={() => run(() => actions.decideEntry(s, true), 'Accepted.')} />
                <OutlineButton label="Reject" icon="close" compact tone="muted" onPress={() => run(() => actions.decideEntry(s, false))} />
              </View>
            )}
          </>
        )}
      {mine && s.isOpen && Object.keys(s.decisions).length === 0 && (
        <OutlineButton label="Withdraw" icon="undo" compact tone="muted" onPress={() => run(() => actions.withdraw(s), 'Withdrawn.')} style={styles.start} />
      )}
    </Panel>
  );
}

/** The record of who did what, newest first. */
export function ActivityList({ activity }: { activity: readonly Activity[] }) {
  if (activity.length === 0) return <Muted>Nothing recorded yet.</Muted>;
  return (
    <View style={styles.gapSm}>
      {activity.slice(0, 200).map((a) => (
        <View key={a.id} style={styles.activity}>
          <Text style={styles.body}>{`${a.actorName} ${a.verb} ${a.label}${a.count > 1 ? ` (${plural(a.count, 'time')})` : ''}`}</Text>
          <Muted>{`${roleLabel[a.actorRole]} · ${whenWords(a.at)}`}</Muted>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  title: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.gold },
  author: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  message: { gap: 4, marginTop: 4 },
  replyIndent: { paddingLeft: space.lg, borderLeftWidth: 2, borderLeftColor: colors.border },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.muted, paddingLeft: space.sm, paddingVertical: 2 },
  quoteText: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  resolved: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border },
  resolvedText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
    backgroundColor: colors.background,
  },
  change: { gap: 2 },
  outIn: { fontWeight: '700', color: colors.muted },
  removed: { textDecorationLine: 'line-through', color: colors.danger },
  added: { textDecorationLine: 'underline', color: colors.gold },
  activity: { gap: 2, paddingVertical: 4 },
});
