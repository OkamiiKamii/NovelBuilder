// Dialogs and sheets: a sheet from the foot of the screen on a phone, a centred card on a tablet. Also the
// hold-to-confirm button every destructive action uses (FEATURES.md #361), a list of actions, and a one-line prompt.

import { type ComponentRef, type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, GoldButton, Icon, type IconName, OutlineButton } from './kit';
import { colors, fonts, radius, sizeClassOf, space } from './theme';

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  wide = false,
  onShow,
  scrollRef,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** The sheet has appeared: the moment to focus a field (autoFocus on mount does not open the keyboard in a sliding Modal). */
  onShow?: () => void;
  /** The body's scroll view, for a sheet that scrolls itself (the interview, to its newest question). */
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}) {
  const { width } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType={sizeClassOf(width) === 'compact' ? 'slide' : 'fade'} onRequestClose={onClose} onShow={onShow} statusBarTranslucent navigationBarTranslucent>
      {/* The app's one KeyboardProvider hears the Modal's keyboard too: a second one here would leave the app's own
          listener paused after the sheet closes. */}
      <SheetCard onClose={onClose} title={title} footer={footer} wide={wide} scrollRef={scrollRef}>
        {children}
      </SheetCard>
    </Modal>
  );
}

/** A box to focus once its sheet has appeared: autoFocus on mount does not open the keyboard in a sliding Modal.
 * Give `ref` to the box and `onShow` to the Sheet. */
export function useFocusOnShow() {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  // A moment after the window is shown, so it has focus and Android opens the keyboard.
  const onShow = () => {
    timer.current = setTimeout(() => ref.current?.focus(), 80);
  };
  return { ref, onShow };
}

/** The sheet itself. The backdrop is padded by the keyboard's height as it moves, so the card always fits between the
 * status bar and the keyboard (it shrinks, and its body scrolls); the footer stays in view. The body is a plain scroll
 * view: the card already sits above the keyboard, and Android keeps the focused box in view as the body shrinks. */
function SheetCard({ onClose, title, children, footer, wide, scrollRef }: { onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide: boolean; scrollRef?: Ref<ComponentRef<typeof ScrollView>> }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const phone = sizeClassOf(width) === 'compact';
  const { height: keyboard, progress } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -keyboard.value) }));
  // The bottom inset is the keyboard's job while it is up: no dead band above it.
  const rest = useAnimatedStyle(() => ({ paddingBottom: space.lg + (phone ? insets.bottom * (1 - progress.value) : 0) }));
  return (
    <Reanimated.View style={[styles.backdrop, phone ? styles.backdropPhone : styles.backdropWide, { paddingTop: insets.top }, lift]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Reanimated.View
        style={[
          styles.card,
          phone ? [styles.cardPhone, { maxHeight: height * 0.92 }] : [styles.cardWide, { width: Math.min(width - 64, wide ? 760 : 560), maxHeight: height * 0.88 }],
          rest,
        ]}
        accessibilityViewIsModal
      >
        {phone && <View style={styles.handle} />}
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.close}>
            <Icon name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {children}
        </ScrollView>
        {footer && <View style={styles.footer}>{footer}</View>}
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** A destructive button that must be held for 900 ms: it fills from the left, and letting go early drains it. With a
 * screen reader on, a single tap does it. */
export function HoldToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const [holding, setHolding] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
  }, []);

  const start = () => {
    done.current = false;
    setHolding(true);
    Animated.timing(fill, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: false }).start(
      ({ finished }) => {
        if (finished && !done.current) {
          done.current = true;
          Vibration.vibrate(20);
          onConfirm();
        }
      },
    );
  };
  const stop = () => {
    setHolding(false);
    if (done.current) return;
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={screenReader ? undefined : 'Hold to confirm'}
      onPress={screenReader ? onConfirm : undefined}
      onPressIn={screenReader ? undefined : start}
      onPressOut={screenReader ? undefined : stop}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={styles.hold}
    >
      <Animated.View
        style={[styles.holdFill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]}
      />
      <Icon name="delete-outline" size={20} color={colors.text} />
      <Text style={styles.holdText}>{holding || screenReader ? label : `Hold to ${label.toLowerCase()}`}</Text>
    </Pressable>
  );
}

export function ConfirmDelete({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <>
          <OutlineButton label="Cancel" onPress={onClose} tone="muted" style={styles.flex} />
          <View style={styles.flex}>
            <HoldToConfirm label={confirmLabel} onConfirm={onConfirm} />
          </View>
        </>
      }
    >
      <Text style={styles.message}>{message}</Text>
    </Sheet>
  );
}

export type SheetAction = { label: string; icon: IconName; onPress: () => void; tone?: 'danger'; hidden?: boolean };

/** A list of actions (a book's "…" menu). */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions
        .filter((a) => !a.hidden)
        .map((a) => {
          const color = a.tone === 'danger' ? colors.danger : colors.text;
          return (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.elevated }]}
            >
              <Icon name={a.icon} size={22} color={a.tone === 'danger' ? colors.danger : colors.gold} />
              <Text style={[styles.actionText, { color }]}>{a.label}</Text>
            </Pressable>
          );
        })}
    </Sheet>
  );
}

/** Asks for one line (a collection's name). */
export function PromptSheet({
  visible,
  title,
  label,
  initial = '',
  confirmLabel,
  onSubmit,
  onClose,
  allowEmpty = false,
}: {
  visible: boolean;
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
  /** The answer may be left empty (an optional name). */
  allowEmpty?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const { ref: focusRef, onShow: focusOnShow } = useFocusOnShow();
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  const submit = () => {
    if (value.trim() || allowEmpty) onSubmit(value.trim());
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      onShow={focusOnShow}
      footer={
        <>
          <OutlineButton label="Cancel" onPress={onClose} tone="muted" style={styles.flex} />
          <GoldButton label={confirmLabel} onPress={submit} disabled={!value.trim() && !allowEmpty} style={styles.flex} />
        </>
      }
    >
      <Field ref={focusRef} label={label} value={value} onChangeText={setValue} returnKeyType="done" onSubmitEditing={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  backdropPhone: { justifyContent: 'flex-end' },
  backdropWide: { justifyContent: 'center', alignItems: 'center' },
  // It shrinks to fit between the status bar and the keyboard; its body scrolls.
  card: { flexShrink: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  cardPhone: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: space.sm },
  cardWide: { borderRadius: radius.panel, paddingTop: space.md, shadowColor: colors.sky, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  title: { flex: 1, fontFamily: fonts.ui, fontSize: 18, letterSpacing: 1.2, color: colors.gold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  footer: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm },
  message: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 24, color: colors.text },
  hold: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.danger,
    overflow: 'hidden',
  },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.danger, opacity: 0.55 },
  holdText: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.sm, borderRadius: radius.field },
  actionText: { fontFamily: fonts.ui, fontSize: 16 },
});
