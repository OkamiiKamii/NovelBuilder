// TOASTS (FEATURES.md #362): short messages at the foot of the page, at most three, each gone after 4 seconds (6 with an
// action such as Undo). Errors carry an error mark. Screen readers hear them.

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './kit';
import { colors, fonts, radius, space } from './theme';

type Toast = { id: number; message: string; error: boolean; action?: { label: string; run: () => void } };

type ShowToast = (message: string, options?: { error?: boolean; action?: { label: string; run: () => void } }) => void;

const ToastContext = createContext<ShowToast>(() => {});

export const useToast = () => useContext(ToastContext);

/** `bottomOffset`: room for the bottom bar under the toasts. */
export function ToastProvider({ children, bottomOffset = 0 }: { children: ReactNode; bottomOffset?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, options = {}) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, message, error: options.error ?? false, action: options.action }]);
      AccessibilityInfo.announceForAccessibility(message);
      setTimeout(() => dismiss(id), options.action ? 6000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset + space.md }]}>
        {toasts.map((t) => (
          <View key={t.id} style={[styles.toast, t.error && styles.toastError]} accessibilityLiveRegion="polite">
            {t.error && <Icon name="alert-circle-outline" size={20} color={colors.danger} />}
            <Text style={styles.message}>{t.message}</Text>
            {t.action && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  dismiss(t.id);
                  t.action?.run();
                }}
                style={styles.action}
              >
                <Text style={styles.actionText}>{t.action.label}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center', gap: space.sm },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
    maxWidth: 560,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.elevated,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  toastError: { borderColor: colors.danger },
  message: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  action: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.sm },
  actionText: { fontFamily: fonts.ui, fontSize: 15, color: colors.gold, letterSpacing: 0.5 },
});
