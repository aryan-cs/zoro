import type { FoodItem, Macros } from './types';

/**
 * Food lookups. USDA FoodData Central has US label data (barcodes, serving sizes) and plain foods
 * like rice or chicken; it needs a free key, or the shared DEMO_KEY with a low hourly limit.
 * Open Food Facts is free with no key and covers products sold worldwide.
 * Requests carry only the barcode or search words.
 */

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,quantity,product_quantity,product_quantity_unit';
/** Zoro's own key, added at build time from a GitHub secret; DEMO_KEY (a few lookups an hour) otherwise. */
export const USDA_DEMO_KEY: string = (import.meta.env?.VITE_USDA_KEY as string | undefined) || 'DEMO_KEY';
const APP_TAG = 'app_name=Zoro&app_version=0.1';

type Num = number | string | undefined;
const num = (v: Num): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: Num;
  serving_quantity_unit?: string;
  quantity?: string;
  product_quantity?: Num;
  product_quantity_unit?: string;
  nutriments?: Record<string, Num>;
}

function offMacros(n: Record<string, Num>, suffix: '_100g' | '_serving'): Macros | undefined {
  let kcal = num(n[`energy-kcal${suffix}`]);
  if (kcal === undefined) {
    const kj = num(n[`energy-kj${suffix}`]) ?? num(n[`energy${suffix}`]);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  const protein = num(n[`proteins${suffix}`]);
  const carbs = num(n[`carbohydrates${suffix}`]);
  const fat = num(n[`fat${suffix}`]);
  if (kcal === undefined && protein === undefined && carbs === undefined && fat === undefined) return undefined;
  return {
    kcal: Math.round(kcal ?? 0),
    protein: r1(protein ?? 0),
    carbs: r1(carbs ?? 0),
    fat: r1(fat ?? 0),
    fiber: r1(num(n[`fiber${suffix}`]) ?? 0),
  };
}

const isMl = (unit?: string, text?: string) => /^(ml|mlt|l|cl|fl ?oz)$/i.test(unit ?? '') || /\b(ml|fl\.? ?oz|l)\b/i.test(text ?? '');

function scaled(m: Macros, grams: number): Macros {
  const f = grams / 100;
  return { kcal: Math.round(m.kcal * f), protein: r1(m.protein * f), carbs: r1(m.carbs * f), fat: r1(m.fat * f), fiber: r1((m.fiber ?? 0) * f) };
}

export function parseOffProduct(p: OffProduct): FoodItem | null {
  const name = (p.product_name || p.product_name_en || '').trim();
  const n = p.nutriments ?? {};
  const per100g = offMacros(n, '_100g');
  let servingMacros = offMacros(n, '_serving');
  let grams = num(p.serving_quantity);
  let label = p.serving_size;
  const liquid = isMl(p.serving_quantity_unit ?? p.product_quantity_unit, p.serving_size ?? p.quantity);
  // No serving on file: use the whole package if it's a single item (a can, a bar).
  const pkg = num(p.product_quantity);
  if (!servingMacros && !grams && pkg && pkg <= 1000) {
    grams = pkg;
    label = `1 package (${p.quantity?.trim() || `${pkg} ${liquid ? 'ml' : 'g'}`})`;
  }
  if (!servingMacros && per100g && grams) servingMacros = scaled(per100g, grams);
  if (!name || (!per100g && !servingMacros)) return null;
  return {
    barcode: p.code,
    name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || undefined,
    per100g,
    serving: servingMacros ? { label: label || (grams ? `${grams} ${liquid ? 'ml' : 'g'}` : '1 serving'), grams, macros: servingMacros } : undefined,
    source: 'off',
    sourceId: p.code,
    updatedAt: Date.now(),
    liquid: liquid || undefined,
  };
}

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 429) throw new Error('USDA_LIMIT');
  if (!res.ok) throw new Error(`Food lookup failed (${res.status}).`);
  return (await res.json()) as T;
}

/** 12-digit UPC-A codes are stored by Open Food Facts as 13-digit EAN with a leading 0. */
export function normalizeBarcode(raw: string): string {
  const code = raw.replace(/\D/g, '');
  return code.length === 12 ? `0${code}` : code;
}

/** Open Food Facts barcode lookup. Returns null if it doesn't have the product. */
export async function lookupOffBarcode(barcode: string, signal?: AbortSignal): Promise<FoodItem | null> {
  const code = normalizeBarcode(barcode);
  if (!code) return null;
  const res = await fetch(`${OFF}/api/v3/product/${code}.json?fields=${OFF_FIELDS}`, { signal, headers: { Accept: 'application/json' } });
  // v3 answers 404 with a JSON body when the product isn't in the database.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Food lookup failed (${res.status}).`);
  const data = (await res.json()) as { status?: string; product?: OffProduct };
  if (!data.product || data.status === 'failure') return null;
  return parseOffProduct({ code, ...data.product });
}

/** USDA stores label barcodes as 12-digit UPCs or 14-digit GTINs and only matches the exact string. */
export function barcodeVariants(barcode: string): string[] {
  const digits = barcode.replace(/\D/g, '');
  const bare = digits.replace(/^0+/, '');
  if (!bare) return [];
  const out = [bare.length <= 12 ? bare.padStart(12, '0') : bare, bare.padStart(14, '0')];
  return [...new Set(out)];
}

/** USDA branded-food lookup by barcode. Returns null if USDA doesn't have it. */
export async function lookupUsdaBarcode(barcode: string, apiKey: string, signal?: AbortSignal): Promise<FoodItem | null> {
  const want = barcode.replace(/\D/g, '').replace(/^0+/, '');
  for (const v of barcodeVariants(barcode)) {
    const data = await getJSON<{ foods?: FdcFood[] }>(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${v}&dataType=Branded&pageSize=5`,
      signal,
    );
    const hit = (data.foods ?? []).find((f) => (f.gtinUpc ?? '').replace(/^0+/, '') === want);
    const food = hit ? parseFdcFood(hit) : null;
    if (food) return { ...food, barcode: normalizeBarcode(barcode) };
  }
  return null;
}

/**
 * Look up a barcode in both databases at once. USDA wins when it has the product
 * (it's copied from the US label, with real serving sizes); Open Food Facts fills the gaps.
 */
export async function lookupBarcode(barcode: string, usdaKey?: string, signal?: AbortSignal): Promise<FoodItem | null> {
  const [usda, off] = await Promise.allSettled([lookupUsdaBarcode(barcode, usdaKey || USDA_DEMO_KEY, signal), lookupOffBarcode(barcode, signal)]);
  if (usda.status === 'fulfilled' && usda.value) return usda.value;
  if (off.status === 'fulfilled' && off.value) return off.value;
  if (usda.status === 'rejected' && off.status === 'rejected') throw off.reason;
  return null;
}

/**
 * Text search. Search-a-licious is fast and allows browser requests; the older search
 * endpoint is a fallback (it's often overloaded). Only search on submit: there are rate limits.
 */
export async function searchOff(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const parse = (list: OffProduct[] | undefined) => (list ?? []).map(parseOffProduct).filter((f): f is FoodItem => f !== null);
  try {
    const data = await getJSON<{ hits?: OffProduct[] }>(`https://search.openfoodfacts.org/search?q=${q}&page_size=25&fields=${OFF_FIELDS}`, signal);
    return parse(data.hits);
  } catch (err) {
    if (signal?.aborted) throw err;
    const data = await getJSON<{ products?: OffProduct[] }>(
      `${OFF}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}&${APP_TAG}`,
      signal,
    );
    return parse(data.products);
  }
}

// ---------- USDA FoodData Central ----------

interface FdcNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  gtinUpc?: string;
  brandOwner?: string;
  brandName?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
}

function fdcValue(list: FdcNutrient[], ids: number[], numbers: string[]): number | undefined {
  for (const n of list) {
    if ((n.nutrientId !== undefined && ids.includes(n.nutrientId)) || (n.nutrientNumber && numbers.includes(n.nutrientNumber))) {
      if (n.unitName && n.unitName.toLowerCase() === 'kj') continue;
      if (typeof n.value === 'number') return n.value;
    }
  }
  return undefined;
}

export function parseFdcFood(f: FdcFood): FoodItem | null {
  const list = f.foodNutrients ?? [];
  // Search results give nutrients per 100 g for every data type.
  const kcal = fdcValue(list, [1008, 2047, 2048], ['208', '957', '958']);
  const protein = fdcValue(list, [1003], ['203']);
  const carbs = fdcValue(list, [1005], ['205']);
  const fat = fdcValue(list, [1004], ['204']);
  if (kcal === undefined && protein === undefined) return null;
  const per100g: Macros = {
    kcal: Math.round(kcal ?? 0),
    protein: r1(protein ?? 0),
    carbs: r1(carbs ?? 0),
    fat: r1(fat ?? 0),
    fiber: r1(fdcValue(list, [1079], ['291']) ?? 0),
  };
  const unit = (f.servingSizeUnit ?? '').toLowerCase();
  const liquid = unit === 'ml' || unit === 'mlt';
  const grams = f.servingSize && (liquid || unit === 'g' || unit === 'grm') ? Math.round(f.servingSize * 10) / 10 : undefined;
  const amount = grams ? `${fmtNum(grams)} ${liquid ? 'ml' : 'g'}` : '';
  const household = f.householdServingFullText?.trim();
  const name = f.description.charAt(0) + f.description.slice(1).toLowerCase();
  return {
    name,
    brand: f.brandName || f.brandOwner || undefined,
    per100g,
    serving: grams ? { label: household && household !== amount ? `${household} (${amount})` : amount, grams, macros: scaled(per100g, grams) } : undefined,
    source: 'usda',
    sourceId: String(f.fdcId),
    updatedAt: Date.now(),
    liquid: liquid || undefined,
  };
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10);

/** Plain foods (Foundation, SR Legacy, survey foods). Add `branded` for packaged foods too. */
export async function searchUsda(query: string, apiKey: string, signal?: AbortSignal, branded = false): Promise<FoodItem[]> {
  const q = encodeURIComponent(query.trim());
  if (!q || !apiKey) return [];
  const types = encodeURIComponent(branded ? 'Branded' : 'Foundation,SR Legacy,Survey (FNDDS)');
  const data = await getJSON<{ foods?: FdcFood[] }>(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${q}&pageSize=20&dataType=${types}`,
    signal,
  );
  return (data.foods ?? []).map(parseFdcFood).filter((f): f is FoodItem => f !== null);
}
