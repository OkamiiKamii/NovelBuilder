// UTF-8 bytes to text the way Dart's `Utf8Decoder(allowMalformed: true)` reads them: every malformed sequence becomes
// one U+FFFD (the WHATWG "maximal subpart" rule Dart follows). Pure TypeScript, a counted loop over the bytes.

/** The text of `bytes`, malformed sequences replaced. */
export function decodeUtf8Lenient(bytes: Uint8Array): string {
  const out: string[] = [];
  let chunk = '';
  const push = (code: number) => {
    chunk += String.fromCodePoint(code);
    if (chunk.length > 4096) {
      out.push(chunk);
      chunk = '';
    }
  };
  let i = 0;
  const n = bytes.length;
  // Each turn takes at least one byte, so this ends after at most n turns.
  for (let turns = 0; i < n && turns <= n; turns++) {
    const b = bytes[i];
    if (b < 0x80) {
      push(b);
      i++;
      continue;
    }
    let need = 0;
    let code = 0;
    let lower = 0x80;
    let upper = 0xbf;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      code = b & 0x1f;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      code = b & 0x0f;
      if (b === 0xe0) lower = 0xa0;
      if (b === 0xed) upper = 0x9f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      code = b & 0x07;
      if (b === 0xf0) lower = 0x90;
      if (b === 0xf4) upper = 0x8f;
    } else {
      push(0xfffd);
      i++;
      continue;
    }
    let j = i + 1;
    let ok = true;
    for (let k = 0; k < need; k++) {
      const c = j < n ? bytes[j] : -1;
      const lo = k === 0 ? lower : 0x80;
      const hi = k === 0 ? upper : 0xbf;
      if (c < lo || c > hi) {
        ok = false;
        break;
      }
      code = (code << 6) | (c & 0x3f);
      j++;
    }
    push(ok ? code : 0xfffd);
    i = j;
  }
  out.push(chunk);
  return out.join('');
}
