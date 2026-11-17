// RELATIONSHIP TYPES AND ATTRIBUTES (FEATURES.md #198): the novel's own types (one-way with a role for each side, or
// the same both ways, in a group), the built-in types it offers, and the attributes it tracks at each stage. A port of
// flutter_app/lib/features/relationships/relation_settings_page.dart (its logic in
// src/domain/relationships/screens/relationSettings.ts).

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RelationType } from '../../domain/relationships/relationTypes';
import { relationSettingsOf } from '../../domain/relationships/relationTypes';
import {
  ownAttributeGiven,
  ownAttributePrompt,
  relationSettingsNoNovel,
  relationSettingsView,
  saveTypeDraft,
  suggestedToggled,
  type TypeDraft,
  typeDialogView,
  typeDraftOf,
} from '../../domain/relationships/screens/relationSettings';
import { ConfirmDelete, PromptSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { ChooserField } from './parts';
import { useRelate } from './RelationshipScreen';
import { useOpenNovel } from './useNovel';

export function RelationSettingsScreen() {
  const novel = useOpenNovel();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const relate = useRelate(novel);
  const [editing, setEditing] = useState<{ type: RelationType | null; draft: TypeDraft } | null>(null);
  const [deleting, setDeleting] = useState<RelationType | null>(null);
  const [own, setOwn] = useState(false);

  if (!novel) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{relationSettingsNoNovel.title}</Text>
        <Muted>{relationSettingsNoNovel.message}</Muted>
        <GoldButton label={relationSettingsNoNovel.action} onPress={() => router.navigate('/')} />
      </View>
    );
  }
  const settings = relationSettingsOf(novel.snapshot.rows('relationSettings'));
  const view = relationSettingsView(novel.model, settings, String(novel.snapshot.project['title'] ?? ''));
  const dialog = editing ? typeDialogView(editing.type, editing.draft) : null;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label={view.backLabel} onPress={() => router.back()} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {view.title}
          </Text>
          <Muted>{view.subtitle}</Muted>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}>
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.ownTitle.toUpperCase()}</Text>
          <Muted>{view.ownCaption}</Muted>
          {view.own.length === 0 ? (
            <Muted>{view.ownNone}</Muted>
          ) : (
            view.own.map((t) => (
              <View key={t.type.id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.text}>{t.title}</Text>
                  <Muted>{t.subtitle}</Muted>
                </View>
                <IconButton icon="pencil-outline" label={t.editTooltip} onPress={() => setEditing({ type: t.type, draft: typeDraftOf(t.type) })} />
                <IconButton icon="delete-outline" label={t.deleteTooltip} color={colors.danger} onPress={() => setDeleting(t.type)} />
              </View>
            ))
          )}
          <OutlineButton label={view.newTypeLabel} icon="plus" compact onPress={() => setEditing({ type: null, draft: typeDraftOf(null) })} style={styles.start} />
        </Panel>

        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.builtInTitle.toUpperCase()}</Text>
          {view.builtIn.map((b) => (
            <View key={b.key} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.text}>{b.title}</Text>
                <Muted>{b.subtitle}</Muted>
              </View>
              <Switch
                value={b.offered}
                onValueChange={(on) => relate.now((c) => c.offerBuiltIn(b.key, { offered: on }))}
                trackColor={{ true: colors.gold, false: colors.border }}
                thumbColor={colors.text}
                accessibilityLabel={`Offer ${b.title}`}
              />
            </View>
          ))}
        </Panel>

        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.attributesTitle.toUpperCase()}</Text>
          <Muted>{view.attributesCaption}</Muted>
          <View style={styles.chips}>
            {view.suggested.map((s) => (
              <Chip key={s.attribute.key} label={s.attribute.label} selected={s.selected} onPress={() => relate.now((c) => suggestedToggled(c, s.attribute.key, !s.selected))} />
            ))}
            {view.ownAttributes.map((a) => (
              <Pressable key={a.attribute.key} accessibilityRole="button" accessibilityLabel={a.deleteTooltip} onPress={() => relate.now((c) => c.untrackAttribute(a.attribute.key))} style={styles.ownChip}>
                <Text style={styles.ownChipText}>{a.attribute.label}</Text>
                <Icon name="close" size={16} color={colors.onGold} />
              </Pressable>
            ))}
            <Chip label={view.ownAttributeLabel} icon="plus" selected={false} onPress={() => setOwn(true)} />
          </View>
        </Panel>
      </ScrollView>

      {editing && dialog && (
        <Sheet
          visible
          onClose={() => setEditing(null)}
          title={dialog.title}
          footer={
            <>
              <OutlineButton label={dialog.cancel} onPress={() => setEditing(null)} tone="muted" style={styles.flex} />
              <GoldButton
                label={dialog.save}
                onPress={() => {
                  if (relate.now((c) => saveTypeDraft(c, editing.type, editing.draft)) !== undefined) setEditing(null);
                }}
                style={styles.flex}
              />
            </>
          }
        >
          <Field label={dialog.nameLabel} value={editing.draft.label} onChangeText={(v) => setEditing({ ...editing, draft: { ...editing.draft, label: v } })} />
          <ChooserField label={dialog.group.label} value={dialog.group.value} choices={dialog.group.choices} onChoose={(v) => setEditing({ ...editing, draft: { ...editing.draft, category: v } })} />
          <View style={styles.row}>
            <Text style={[styles.text, styles.flex]}>{dialog.oneWayLabel}</Text>
            <Switch
              value={editing.draft.oneWay}
              onValueChange={(on) => setEditing({ ...editing, draft: { ...editing.draft, oneWay: on } })}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={dialog.oneWayLabel}
            />
          </View>
          <Field label={dialog.fromLabel} value={editing.draft.fromRole} onChangeText={(v) => setEditing({ ...editing, draft: { ...editing.draft, fromRole: v } })} />
          {dialog.toLabel && (
            <Field label={dialog.toLabel} value={editing.draft.toRole} onChangeText={(v) => setEditing({ ...editing, draft: { ...editing.draft, toRole: v } })} />
          )}
        </Sheet>
      )}
      {deleting && (() => {
        const row = view.own.find((t) => t.type.id === deleting.id);
        return row ? (
          <ConfirmDelete
            visible
            title={row.deleteConfirm.title}
            message={row.deleteConfirm.message}
            confirmLabel={row.deleteConfirm.confirmLabel}
            onConfirm={() => {
              setDeleting(null);
              relate.now((c) => c.removeType(deleting.id));
            }}
            onClose={() => setDeleting(null)}
          />
        ) : null;
      })()}
      <PromptSheet
        visible={own}
        title={ownAttributePrompt.title}
        label={ownAttributePrompt.label}
        confirmLabel={ownAttributePrompt.confirmLabel}
        onSubmit={(name) => {
          setOwn(false);
          relate.now((c) => ownAttributeGiven(c, name));
        }}
        onClose={() => setOwn(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  body: { padding: space.md, gap: space.md, maxWidth: 820, width: '100%', alignSelf: 'center' },
  panel: { gap: space.sm },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  text: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  start: { alignSelf: 'flex-start' },
  ownChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.chip, backgroundColor: colors.gold },
  ownChipText: { fontFamily: fonts.ui, fontSize: 14, color: colors.onGold },
});
