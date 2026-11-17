// THE CAMEO (FEATURES.md #169): with no picture, a character's bust drawn from their profile (hair, eyes, skin, age,
// species, marks…) in their own colour. The shapes are src/domain/characters/aids/cameo.ts's, in drawing order; this
// draws them as SVG.

import { useId, useMemo } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  FeColorMatrix,
  Filter,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import type { CharacterProfile } from '../../domain/characters/characterRecords';
import { type CameoFill, type CameoLook, type CameoOp, cameoDrawing, cameoLookOf, greyMatrix } from '../../domain/characters/aids/cameo';
import { boundLook, cssOf, rgbaOf } from '../../domain/characters/aids/colour';
import { castTone } from '../../domain/characters/screens/library';
import type { Entry } from '../../domain/records/entry';

export function Cameo({
  entry,
  profile,
  look,
  width,
  height,
  bare = false,
}: {
  entry: Entry;
  profile: CharacterProfile | null;
  /** A look of its own (the face sketch's, while it is drawn); else read from the profile. */
  look?: CameoLook;
  width: number;
  height: number;
  bare?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const drawing = useMemo(() => {
    const tone = boundLook(rgbaOf(castTone(entry.id)), { lift: 0.1, sink: 0.45, tinted: true });
    return cameoDrawing(look ?? cameoLookOf(entry, profile), {
      width,
      height,
      ground: tone.ground.map(cssOf),
      ink: cssOf(tone.ink),
      frame: cssOf(tone.frame),
      bare,
    });
  }, [entry, profile, look, width, height, bare]);

  const gradients: { key: string; fill: CameoFill }[] = [];
  const paintOf = (fill: CameoFill | undefined, i: number): string => {
    if (!fill) return 'none';
    if (fill.kind === 'color') return fill.color;
    const key = `${id}g${i}`;
    gradients.push({ key, fill });
    return `url(#${key})`;
  };
  const shape = (op: CameoOp, i: number) => {
    const fill = paintOf(op.fill, i);
    const stroke = op.stroke ? { stroke: op.stroke.color, strokeWidth: op.stroke.width, strokeLinecap: op.stroke.cap } : {};
    switch (op.shape) {
      case 'rect':
        return <Rect key={i} x={op.x} y={op.y} width={op.width} height={op.height} fill={fill} {...stroke} />;
      case 'oval':
        return <Ellipse key={i} cx={op.cx} cy={op.cy} rx={op.rx} ry={op.ry} fill={fill} {...stroke} />;
      case 'circle':
        return <Circle key={i} cx={op.cx} cy={op.cy} r={op.r} fill={fill} {...stroke} />;
      case 'line':
        return <Line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} {...stroke} />;
      default:
        return <Path key={i} d={op.d} fill={fill} {...stroke} />;
    }
  };
  const inside = drawing.ops.map((op, i) => ({ op, i })).filter(({ op }) => op.clipped);
  const outside = drawing.ops.map((op, i) => ({ op, i }));
  const firstClipped = drawing.ops.findIndex((op) => op.clipped);
  const before = outside.filter(({ op, i }) => !op.clipped && (firstClipped < 0 || i < firstClipped));
  const after = outside.filter(({ op, i }) => !op.clipped && firstClipped >= 0 && i > firstClipped);
  const shapes = {
    before: before.map(({ op, i }) => shape(op, i)),
    inside: inside.map(({ op, i }) => shape(op, i)),
    after: after.map(({ op, i }) => shape(op, i)),
  };
  const o = drawing.oval;
  return (
    <Svg width={width} height={height} accessibilityIgnoresInvertColors>
      <Defs>
        <ClipPath id={`${id}clip`}>
          <Ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} />
        </ClipPath>
        {drawing.grey && (
          <Filter id={`${id}grey`}>
            <FeColorMatrix type="matrix" values={greyMatrix.join(' ')} />
          </Filter>
        )}
        {gradients.map(({ key, fill }) =>
          fill.kind === 'linear' ? (
            <LinearGradient key={key} id={key} x1={fill.from.x} y1={fill.from.y} x2={fill.to.x} y2={fill.to.y} gradientUnits="userSpaceOnUse">
              {fill.colors.map((c, k) => (
                <Stop key={k} offset={fill.colors.length === 1 ? 0 : k / (fill.colors.length - 1)} stopColor={c} />
              ))}
            </LinearGradient>
          ) : fill.kind === 'radial' ? (
            <RadialGradient key={key} id={key} cx={fill.center.x} cy={fill.center.y} r={fill.radius} gradientUnits="userSpaceOnUse">
              {fill.colors.map((c, k) => (
                <Stop key={k} offset={fill.colors.length === 1 ? 0 : k / (fill.colors.length - 1)} stopColor={c} />
              ))}
            </RadialGradient>
          ) : null,
        )}
      </Defs>
      <G filter={drawing.grey ? `url(#${id}grey)` : undefined}>
        {shapes.before}
        <G clipPath={`url(#${id}clip)`}>{shapes.inside}</G>
        {shapes.after}
      </G>
    </Svg>
  );
}
