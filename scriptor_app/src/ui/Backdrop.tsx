// THE BACKDROP (DESIGN.md, "Shapes and effects"): the ground behind every page, as the owner's mock-ups draw it: deep
// navy rather than flat black, lit by a cold blue glow from the top corner and a fainter one from the foot, as if the
// panels stood in a night lit by the system's own light. One static drawing, under everything; it never moves, so it
// costs nothing while scrolling.

import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop, LinearGradient } from 'react-native-svg';

import { colors } from './theme';

export function Backdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.backdropTop} />
          <Stop offset="1" stopColor={colors.background} />
        </LinearGradient>
        <RadialGradient id="glowTop" cx="0.92" cy="0.04" r="0.75" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={colors.sky} stopOpacity={0.16} />
          <Stop offset="0.45" stopColor="#1E3A8A" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#1E3A8A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glowFoot" cx="0.05" cy="0.98" r="0.7" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor="#3B5BDB" stopOpacity={0.12} />
          <Stop offset="1" stopColor="#3B5BDB" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#ground)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#glowTop)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#glowFoot)" />
    </Svg>
  );
}
