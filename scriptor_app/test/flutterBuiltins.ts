// The goldens the Flutter app made know six built-in categories, with the merged names. Scriptor has ten (see
// src/domain/records/category.ts), so a suite that compares with those goldens starts with `import '../flutterBuiltins'`
// (before anything from src) and sees the Flutter app's six. Everything else is the real code.
jest.mock('../src/domain/records/category', () => {
  const actual = jest.requireActual('../src/domain/records/category');
  const { localeCompare } = jest.requireActual('../src/domain/collation');
  const { compareNum, dartSort } = jest.requireActual('../src/domain/manuscript/dartSort');
  const keys = ['character', 'location', 'faction', 'item', 'power', 'lore'];
  const rows: Record<string, [string, string, string, string[]]> = {
    character: ['Characters', 'Character', '#b4532a', []],
    location: ['Locations', 'Location', '#3f7d4e', ['Type', 'Region', 'Notable features']],
    faction: ['Factions & Species', 'Faction / Species', '#3d5fa8', ['Type', 'Leader', 'Goals']],
    item: ['Items & Artifacts', 'Item / Artifact', '#8a6d1f', ['Type', 'Owner', 'Abilities']],
    power: ['Power Systems & Rules', 'Power System / Rule', '#7a4fa3', ['Rules', 'Costs & limits', 'Tiers']],
    lore: ['Lore & History', 'Lore / History', '#5c6370', ['When', 'Who was involved', 'Consequences']],
  };
  actual.Category.builtin = (key: string) => {
    if (!Object.prototype.hasOwnProperty.call(rows, key)) throw new TypeError(`Not a built-in category: ${key}`);
    const [name, singular, color, fields] = rows[key];
    return new actual.Category({
      key,
      name,
      singular,
      color,
      builtin: true,
      order: keys.indexOf(key),
      fields: fields.map((f, i) => ({ id: `builtin-${key}-${i}`, name: f, type: 'longtext', options: [] })),
    });
  };
  const resolveCategories = (stored: { key: string; order: number; name: string }[]) => {
    const byKey = new Map(stored.map((c) => [c.key, c]));
    const builtins = keys.map((k) => byKey.get(k) ?? actual.Category.builtin(k));
    const custom = stored.filter((c) => !keys.includes(c.key));
    return dartSort([...builtins, ...custom], (a: typeof builtins[0], b: typeof builtins[0]) => {
      const byOrder = compareNum(a.order, b.order);
      return byOrder !== 0 ? byOrder : localeCompare(a.name, b.name);
    });
  };
  return { ...actual, builtinCategoryKeys: keys, typePartners: new Map(), resolveCategories };
});
