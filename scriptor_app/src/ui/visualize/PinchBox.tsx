// A map that zooms: two fingers zoom in on it (up to `max` times) and move it, one finger moves it once it is zoomed
// (at its whole size one finger is left to the page, so the page still scrolls over it), and a button takes it back to
// the whole map. What is drawn inside keeps its own size and places; it is moved and scaled as a whole
// (usePinchPan.ts), so a tap on a pin, or on the map to put one, still lands where it is drawn.

import { type ReactNode, useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { IconButton } from '../kit';
import { colors } from '../theme';
import { type PanZoom, liveTransform, usePinchPan } from './usePinchPan';

const whole: PanZoom = { k: 1, tx: 0, ty: 0 };

export function PinchBox({
  width,
  height,
  max = 6,
  style,
  accessibilityLabel,
  children,
}: {
  width: number;
  height: number;
  max?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  const [v, setV] = useState<PanZoom>(whole);
  const zoomed = v.k > 1.01;
  // The map always fills the box: it is never moved off an edge, nor made smaller than it.
  const clamp = (n: PanZoom): PanZoom => ({
    k: n.k,
    tx: Math.min(0, Math.max(width - width * n.k, n.tx)),
    ty: Math.min(0, Math.max(height - height * n.k, n.ty)),
  });
  const gesture = usePinchPan({ view: v, onChange: setV, min: 1, max, pan: zoomed, takeBare: zoomed, clamp });
  return (
    <View
      ref={gesture.ref}
      onLayout={gesture.onLayout}
      style={[style, { width, height, overflow: 'hidden' }]}
      accessibilityLabel={accessibilityLabel}
      {...gesture.panHandlers}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, transform: liveTransform(v, 1, width, height) }}>{children}</View>
      {zoomed && (
        <View style={styles.back}>
          <IconButton icon="fit-to-screen-outline" label="Back to the whole map" onPress={() => setV(whole)} bordered />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', right: 6, top: 6, borderRadius: 24, backgroundColor: colors.surface },
});
