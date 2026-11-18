// A picture of a view on one page, ready to print or keep: a landscape US Letter page, 36 pt margins, the picture
// centred and fitted (as the original's `pw.Image(fit: BoxFit.contain)`). The original embeds a PNG through its pdf
// package; here the picture is captured as a JPEG, which a PDF holds as it is (DCTDecode), so nothing is re-encoded.

/** The pixel size of a JPEG, read from its first frame header; null when the bytes are not a JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  // Each step moves forward by at least two bytes, so the walk ends within the file.
  for (let step = 0; step < bytes.length && at + 9 < bytes.length; step++) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const height = (bytes[at + 5]! << 8) | bytes[at + 6]!;
      const width = (bytes[at + 7]! << 8) | bytes[at + 8]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

/** Text for the document's information, as UTF-16 so every script survives. */
function infoText(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
}

const ascii = (text: string) => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0x7f;
  return out;
};

const num = (n: number) => String(Math.round(n * 100) / 100);

/** The one-page PDF of a JPEG picture. Throws when the bytes are not a JPEG. */
export function picturePdf(jpeg: Uint8Array, options: { title: string; creator?: string }): Uint8Array {
  const size = jpegSize(jpeg);
  if (size === null) throw new Error('The picture could not be read.');
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 36;
  const boxWidth = pageWidth - margin * 2;
  const boxHeight = pageHeight - margin * 2;
  const scale = Math.min(boxWidth / size.width, boxHeight / size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  const x = margin + (boxWidth - w) / 2;
  const y = margin + (boxHeight - h) / 2;
  const content = `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im1 Do Q\n`;
  const creator = options.creator ?? 'Scriptor';

  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const add = (p: Uint8Array) => {
    parts.push(p);
    length += p.length;
  };
  const object = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n - 1] = length;
    if (stream === undefined) {
      add(ascii(`${n} 0 obj\n${body}\nendobj\n`));
      return;
    }
    add(ascii(`${n} 0 obj\n${body}\nstream\n`));
    add(stream);
    add(ascii('\nendstream\nendobj\n'));
  };
  add(ascii('%PDF-1.4\n'));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`);
  object(4, `<< /Length ${content.length} >>`, ascii(content));
  object(
    5,
    `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  object(6, `<< /Title ${infoText(options.title)} /Creator ${infoText(creator)} /Producer ${infoText(creator)} >>`);
  const xref = length;
  let tail = `xref\n0 7\n0000000000 65535 f \n`;
  for (const at of offsets) tail += `${String(at).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  add(ascii(tail));

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
