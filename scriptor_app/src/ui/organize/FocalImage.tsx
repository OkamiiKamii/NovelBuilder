// A portrait cropped around its focal point (FEATURES.md #168): the picture fills its frame, as `BoxFit.cover`, placed
// as the Flutter app places it, `Alignment(x / 50 - 1, y / 50 - 1)` (CSS's `object-position: x% y%`), so the point the
// author chose stays in view however the frame crops it. A port of the picture part of
// flutter_app/lib/features/characters/widgets/portrait.dart.

import { useState } from 'react';
import { Image, type ImageStyle, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { jpegSize } from '../../domain/exchange/picturePdf';
import { dartBase64Decode } from '../../domain/exchange/renderBook';

/** Where the point kept in view sits, in percent of the picture's width and height (the profile's `focal`). */
export type FocalPoint = { x: number; y: number };

/** The Flutter app's default: a little above the middle, where a face usually is. */
export const defaultFocal: FocalPoint = { x: 50, y: 30 };

const sizes = new Map<string, { width: number; height: number } | null>();

/** The pixel size of an uploaded picture (a `data:` URL holding a JPEG or a PNG), read from its header once and kept;
 * null when it can't be read (then the picture is centred, as before). */
export function pictureSize(uri: string): { width: number; height: number } | null {
  const known = sizes.get(uri);
  if (known !== undefined) return known;
  let size: { width: number; height: number } | null = null;
  const comma = uri.indexOf(',');
  if (comma >= 0) {
    // The header is near the front: a whole number of base64 groups from there is enough (and never padded mid-way).
    const head = uri.substring(comma + 1, comma + 1 + 131072);
    const bytes = dartBase64Decode(head.substring(0, head.length - (head.length % 4)));
    if (bytes !== null) {
      if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        const width = ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>> 0;
        const height = ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>> 0;
        size = width > 0 && height > 0 ? { width, height } : null;
      } else {
        size = jpegSize(bytes);
      }
    }
  }
  if (sizes.size > 200) sizes.clear();
  sizes.set(uri, size);
  return size;
}

/** Where a picture `natural` sits in a frame `w` × `h`, filling it (cover) around `focal`. */
export function focalPlacement(
  natural: { width: number; height: number },
  w: number,
  h: number,
  focal: FocalPoint,
): { left: number; top: number; width: number; height: number } {
  const scale = Math.max(w / natural.width, h / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const fx = Math.min(100, Math.max(0, focal.x)) / 100;
  const fy = Math.min(100, Math.max(0, focal.y)) / 100;
  return { left: (w - width) * fx, top: (h - height) * fy, width, height };
}

/** The picture `uri` filling the frame `style` (its size, corners and place), kept around `focal`. */
export function FocalImage({
  uri,
  focal,
  style,
  imageStyle,
}: {
  uri: string;
  focal?: FocalPoint | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}) {
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const natural = pictureSize(uri);
  const at = frame !== null && natural !== null ? focalPlacement(natural, frame.w, frame.h, focal ?? defaultFocal) : null;
  return (
    <View
      style={[{ overflow: 'hidden' }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (frame === null || frame.w !== width || frame.h !== height) setFrame({ w: width, h: height });
      }}
      accessibilityIgnoresInvertColors
    >
      {at !== null ? (
        <Image source={{ uri }} style={[{ position: 'absolute', left: at.left, top: at.top, width: at.width, height: at.height }, imageStyle]} />
      ) : (
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, imageStyle]} resizeMode="cover" />
      )}
    </View>
  );
}
