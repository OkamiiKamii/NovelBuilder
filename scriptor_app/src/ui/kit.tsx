// The building blocks every screen uses, in the System Monolith look (DESIGN.md): panels, gold buttons, chips, progress
// bars, headings and fields. Colours and fonts come from theme.ts only.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion, useReducedMotion } from './motion';
import { colors, fonts, glow, radius, space, tints } from './theme';
import { useSpot } from './tutorial/spots';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = colors.gold }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/** A panel: dark ground, thin outline, a soft blue glow at the edge. `active` edges it in gold. */
export function Panel({
  children,
  style,
  active = false,
  glow = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  glow?: boolean;
}) {
  return <View style={[styles.panel, glow && styles.glow, active && styles.panelActive, style]}>{children}</View>;
}

/** A section heading: a gold icon and the title in spaced capitals ("LIBRARY OVERVIEW"). */
export function SectionTitle({ icon, title, right }: { icon?: IconName; title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      {icon && <Icon name={icon} size={20} />}
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={styles.flex} />
      {right}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  compact?: boolean;
};

/** The main action: filled with a gold gradient, dark lettering. */
export function GoldButton({ label, onPress, icon, disabled, style, accessibilityLabel, compact }: ButtonProps) {
  // The tutorial's tour finds it by its label (tutorial/spots.ts).
  const spot = useSpot(label);
  return (
    <Pressable
      ref={spot}
      accessibilityRole="button"
      hitSlop={4}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.buttonOuter, compact && styles.compact, { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, pressed && styles.pressed, style]}
    >
      <LinearGradient
        colors={[colors.goldLight, colors.gold, colors.goldDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.buttonFill, compact && styles.compact]}
      >
        {icon && <Icon name={icon} size={compact ? 18 : 20} color={colors.onGold} />}
        <Text style={[styles.buttonText, { color: colors.onGold }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** A secondary action: gold outline, gold lettering. `tone` danger for deleting. */
export function OutlineButton({
  label,
  onPress,
  icon,
  disabled,
  style,
  accessibilityLabel,
  compact,
  tone = 'gold',
}: ButtonProps & { tone?: 'gold' | 'sky' | 'danger' | 'muted' }) {
  const color = { gold: colors.gold, sky: colors.sky, danger: colors.danger, muted: colors.muted }[tone];
  const spot = useSpot(label);
  return (
    <Pressable
      ref={spot}
      accessibilityRole="button"
      hitSlop={4}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outline,
        compact && styles.compact,
        { borderColor: color, opacity: disabled ? 0.45 : 1, backgroundColor: pressed ? colors.elevated : 'transparent' },
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon && <Icon name={icon} size={compact ? 18 : 20} color={color} />}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** A square icon button, at least 44 points, with a name for screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.text,
  bordered = false,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  bordered?: boolean;
  size?: number;
}) {
  const spot = useSpot(label);
  return (
    <Pressable
      ref={spot}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, bordered && styles.iconButtonBordered, pressed && styles.iconPressed]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** A filter chip: gold outline when chosen, filled gold when `strong`. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const spot = useSpot(label);
  return (
    <Pressable
      ref={spot}
      accessibilityRole="button"
      hitSlop={4}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      {icon && <Icon name={icon} size={16} color={selected ? colors.gold : colors.muted} />}
      <Text style={[styles.chipText, { color: selected ? colors.gold : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** A thin progress bar, gold on a dark track (green when whole), with the percentage beside it. */
export function ProgressBar({ value, showPercent = true }: { value: number; showPercent?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const whole = pct >= 100;
  // The fill grows from the left once, when the bar is first shown, so the eye reads how far; later changes just move.
  const reduced = useReducedMotion();
  const [grow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      grow.setValue(1);
      return;
    }
    const run = Animated.timing(grow, { toValue: 1, duration: motion.state, easing: motion.arrive, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [grow, reduced]);
  return (
    <View style={styles.progressRow} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressGrow, { width: `${pct}%`, transform: [{ scaleX: grow }] }]}>
          <LinearGradient
            colors={whole ? [colors.gold, colors.success] : [colors.goldDeep, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressFill}
          />
        </Animated.View>
      </View>
      {showPercent && <Text style={styles.progressText}>{pct}%</Text>}
    </View>
  );
}

/** A labelled text field on a raised ground. */
export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        cursorColor={colors.gold}
        accessibilityLabel={label}
        style={[styles.input, input.multiline && styles.inputMultiline, style]}
        {...input}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Muted({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<import('react-native').TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
  },
  glow: { borderColor: colors.edge, backgroundColor: tints.panel, boxShadow: glow.sky },
  panelActive: { borderColor: colors.gold, boxShadow: glow.gold },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  sectionTitle: { fontFamily: fonts.ui, fontSize: 15, letterSpacing: 1.6, color: colors.text },
  buttonOuter: { borderRadius: radius.field, minHeight: 44, boxShadow: glow.goldSoft },
  buttonFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.field,
  },
  compact: { minHeight: 40, paddingHorizontal: space.md },
  // A touch is acknowledged at once: the control gives a little under the finger.
  pressed: { transform: [{ scale: motion.press }] },
  iconPressed: { backgroundColor: colors.elevated, transform: [{ scale: 0.92 }] },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.field,
    borderWidth: 1,
  },
  buttonText: { fontFamily: fonts.ui, fontSize: 15, letterSpacing: 0.3 },
  iconButton: { width: 44, height: 44, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center' },
  iconButtonBordered: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipSelected: { borderColor: colors.gold, backgroundColor: '#2A2210' },
  chipText: { fontFamily: fonts.ui, fontSize: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressGrow: { height: 6, transformOrigin: 'left' },
  progressFill: { flex: 1, borderRadius: 3 },
  progressText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text, minWidth: 38, textAlign: 'right' },
  field: { marginBottom: space.lg },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold, marginBottom: 6 },
  fieldHint: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 4 },
  input: {
    minHeight: 46,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 110, paddingTop: space.md, textAlignVertical: 'top' },
  muted: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.muted },
});
