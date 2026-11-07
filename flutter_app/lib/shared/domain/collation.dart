/// Text ordering that matches the original app's `localeCompare` (ICU root collation) for the text novels hold:
/// case and accents are ignored first (so "émile" sorts with "emile" and "Bran" with "bran"), punctuation and spaces
/// come before digits, digits before letters; ties are then broken by accents, then lowercase before uppercase, then
/// code units, so the order is total and deterministic.
int localeCompare(String a, String b) {
  final primary = _compareKeys(a, b, _primary);
  if (primary != 0) return primary;
  final secondary = _compareKeys(a, b, _secondary);
  if (secondary != 0) return secondary;
  final tertiary = _compareKeys(a, b, _tertiary);
  if (tertiary != 0) return tertiary;
  return a.compareTo(b);
}

int _compareKeys(String a, String b, int Function(int rune) key) {
  final ra = a.runes.toList();
  final rb = b.runes.toList();
  final n = ra.length < rb.length ? ra.length : rb.length;
  for (var i = 0; i < n; i++) {
    final d = key(ra[i]) - key(rb[i]);
    if (d != 0) return d;
  }
  return ra.length - rb.length;
}

const _accented = {
  'àáâãäåāăą': 'a',
  'çćĉċč': 'c',
  'ďđ': 'd',
  'èéêëēĕėęě': 'e',
  'ĝğġģ': 'g',
  'ĥħ': 'h',
  'ìíîïĩīĭįı': 'i',
  'ĵ': 'j',
  'ķ': 'k',
  'ĺļľŀł': 'l',
  'ñńņňŉ': 'n',
  'òóôõöøōŏő': 'o',
  'ŕŗř': 'r',
  'śŝşšß': 's',
  'ţťŧ': 't',
  'ùúûüũūŭůűų': 'u',
  'ŵ': 'w',
  'ýÿŷ': 'y',
  'źżž': 'z',
};

final Map<int, int> _base = {
  for (final e in _accented.entries)
    for (final r in e.key.runes) r: e.value.codeUnitAt(0),
};

int _fold(int rune) {
  final lower = String.fromCharCode(rune).toLowerCase();
  final r = lower.runes.first;
  return _base[r] ?? r;
}

bool _isDigit(int r) => r >= 0x30 && r <= 0x39;
bool _isLetter(int r) {
  final s = String.fromCharCode(r);
  return s.toLowerCase() != s.toUpperCase() || _base.containsKey(_fold(r));
}

/// Groups: 0 spaces and punctuation, 1 digits, 2 letters (folded), 3 anything else.
int _primary(int rune) {
  if (_isDigit(rune)) return 0x100000 + rune;
  if (_isLetter(rune)) return 0x200000 + _fold(rune);
  if (rune < 0x80) return rune;
  return 0x300000 + rune;
}

int _secondary(int rune) {
  final lower = String.fromCharCode(rune).toLowerCase().runes.first;
  return _base.containsKey(lower) ? 1 : 0;
}

int _tertiary(int rune) {
  final s = String.fromCharCode(rune);
  return s != s.toLowerCase() ? 1 : 0;
}
