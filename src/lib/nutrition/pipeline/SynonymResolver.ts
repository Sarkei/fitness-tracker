const SYNONYM_MAP: Record<string, string[]> = {
  'hähnchen gegrillt': ['hühnerbrust gebraten', 'chicken grilled', 'geflügel gebraten'],
  fladenbrot: ['pitabrot', 'naan', 'turkish bread', 'pide'],
  knoblauchsauce: ['tzatziki', 'garlic dip', 'knoblauch dressing'],
  weißkohl: ['spitzkohl', 'chinakohl', 'cabbage white shredded'],
  'döner hähnchen': ['chicken kebab', 'hähnchenspieß', 'shawarma chicken'],
  dönerbrot: ['fladenbrot', 'pide', 'pita bread'],
  haferflocken: ['oats', 'oat flakes', 'rolled oats'],
  banane: ['banana'],
  vollmilch: ['whole milk', 'milk 3.5%'],
  parmesan: ['parmigiano reggiano', 'hard cheese parmesan'],
  mandeln: ['almonds'],
  rührei: ['scrambled eggs'],
  speck: ['bacon'],
  toast: ['toastbrot', 'white bread toast'],
  whey: ['whey protein', 'protein powder'],
  cola: ['coca cola', 'soft drink cola'],
  schnitzel: ['breaded pork cutlet', 'wiener schnitzel'],
  porridge: ['oatmeal'],
  müsli: ['muesli'],
  latte: ['latte macchiato', 'cafe latte'],
  käsekuchen: ['cheesecake'],
  currywurst: ['sausage curry'],
  pommes: ['french fries', 'chips'],
  spaghettibolognese: ['spaghetti bolognese'],
};

export function resolveSynonyms(baseTerms: string[]): string[] {
  const out = new Set<string>();
  for (const term of baseTerms) {
    const t = term.trim();
    if (!t) continue;
    out.add(t);
    const key = t.toLowerCase().replace(/\s+/g, ' ');
    const withoutSlash = key.replace(/[/-]/g, ' ');
    const list = [...(SYNONYM_MAP[key] ?? []), ...(SYNONYM_MAP[withoutSlash] ?? [])];
    for (const candidate of list) out.add(candidate);
  }
  return [...out];
}
