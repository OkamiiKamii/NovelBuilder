import { jpegSize, picturePdf } from '../../src/domain/exchange/picturePdf';

// A JPEG's start: SOI, an APP0 segment, then a baseline frame header of 300 x 200 pixels.
const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
const jpeg = new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);

describe('picture PDF', () => {
  it('reads the size of a JPEG from its frame header', () => {
    expect(jpegSize(jpeg)).toEqual({ width: 300, height: 200 });
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it('puts the picture on one landscape page, fitted inside the margins, with a correct cross-reference table', () => {
    const pdf = picturePdf(jpeg, { title: 'Timeline: Ember' });
    const text = Array.from(pdf, (b) => String.fromCharCode(b)).join('');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 792 612]');
    expect(text).toContain('/Width 300 /Height 200');
    // 720 x 540 inside the margins: the 3:2 picture is 720 wide and 480 high, centred.
    expect(text).toContain('q 720 0 0 480 36 66 cm /Im1 Do Q');
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...text.matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    offsets.forEach((at, i) => expect(text.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(() => picturePdf(new Uint8Array([1, 2, 3]), { title: 'x' })).toThrow();
  });
});
