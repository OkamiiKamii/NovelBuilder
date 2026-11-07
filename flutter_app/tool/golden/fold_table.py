"""Regenerates lib/shared/domain/text/fold.dart: Unicode NFD with accents U+0300-U+036F dropped, as the original
app's search folds text (`text.normalize('NFD').replace(/[̀-ͯ]/g, '')`). Run: python3 -I tool/golden/fold_table.py"""
import pathlib
import unicodedata

RANGES = [(0x00C0, 0x1FFF), (0x2000, 0x2BFF), (0x3000, 0x30FF), (0xFB00, 0xFB4F)]


def esc(s):
    out = []
    for ch in s:
        o = ord(ch)
        if ch in "\\'$":
            out.append('\\' + ch)
        elif o < 0x20 or 0x7F <= o < 0xA0:
            out.append('\\u{%x}' % o)
        else:
            out.append(ch)
    return ''.join(out)


def chunk(s, n=70):
    return [s[i:i + n] for i in range(0, len(s), n)]


pairs = []
for lo, hi in RANGES:
    for cp in range(lo, hi + 1):
        c = chr(cp)
        s = ''.join(ch for ch in unicodedata.normalize('NFD', c) if not 0x300 <= ord(ch) <= 0x36F)
        if s != c:
            pairs.append((c, s))

target = pathlib.Path(__file__).resolve().parents[2] / 'lib/shared/domain/text/fold.dart'
head = target.read_text().split('\nconst _from =')[0]
body = '\nconst _from =\n' + '\n'.join("    '%s'" % esc(c) for c in chunk(''.join(a for a, _ in pairs))) + ';\n'
body += '\nconst _to =\n' + '\n'.join("    '%s'" % esc(c) for c in chunk('|'.join(b for _, b in pairs))) + ';\n'
target.write_text(head + body)
print(f'{len(pairs)} decompositions from Unicode {unicodedata.unidata_version}')
