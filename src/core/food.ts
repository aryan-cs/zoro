import type { FoodItem, Macros } from './types';

/**
 * Food lookups. Open Food Facts is free with no key (best for barcodes and packaged food).
 * USDA FoodData Central is free with a key (best for plain foods like rice or chicken).
 * Requests carry only the barcode or search words.
 */

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit';
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
  brands?: string;
  serving_size?: string;
  serving_quantity?: Num;
  serving_quantity_unit?: string;
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

export function parseOffProduct(p: OffProduct): FoodItem | null {
  const name = (p.product_name || p.product_name_en || '').trim();
  const n = p.nutriments ?? {};
  const per100g = offMacros(n, '_100g');
  let servingMacros = offMacros(n, '_serving');
  const grams = num(p.serving_quantity);
  if (!servingMacros && per100g && grams) {
    const f = grams / 100;
    servingMacros = {
      kcal: Math.round(per100g.kcal * f),
      protein: r1(per100g.protein * f),
      carbs: r1(per100g.carbs * f),
      fat: r1(per100g.fat * f),
      fiber: r1((per100g.fiber ?? 0) * f),
    };
  }
  if (!name || (!per100g && !servingMacros)) return null;
  return {
    barcode: p.code,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    per100g,
    serving: servingMacros ? { label: p.serving_size || (grams ? `${grams} g` : '1 serving'), grams, macros: servingMacros } : undefined,
    source: 'off',
    sourceId: p.code,
    updatedAt: Date.now(),
  };
}

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Food lookup failed (${res.status}).`);
  return (await res.json()) as T;
}

/** Look up a barcode. Returns null if Open Food Facts doesn't have it. */
export async function lookupBarcode(barcode: string, signal?: AbortSignal): Promise<FoodItem | null> {
  const code = barcode.replace(/\D/g, '');
  if (!code) return null;
  const data = await getJSON<{ status?: number; product?: OffProduct }>(
    `${OFF}/api/v2/product/${code}?fields=${OFF_FIELDS}&${APP_TAG}`,
    signal,
  );
  if (!data.product || data.status === 0) return null;
  return parseOffProduct({ code, ...data.product });
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const data = await getJSON<{ products?: OffProduct[] }>(
    `${OFF}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}&${APP_TAG}`,
    signal,
  );
  return (data.products ?? []).map(parseOffProduct).filter((f): f is FoodItem => f !== null);
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
  const grams = f.servingSize && f.servingSizeUnit?.toLowerCase() === 'g' ? f.servingSize : undefined;
  const name = f.description.charAt(0) + f.description.slice(1).toLowerCase();
  return {
    name,
    brand: f.brandName || f.brandOwner || undefined,
    per100g,
    serving: grams
      ? {
          label: f.householdServingFullText ? `${f.householdServingFullText} (${grams} g)` : `${grams} g`,
          grams,
          macros: {
            kcal: Math.round((per100g.kcal * grams) / 100),
            protein: r1((per100g.protein * grams) / 100),
            carbs: r1((per100g.carbs * grams) / 100),
            fat: r1((per100g.fat * grams) / 100),
          },
        }
      : undefined,
    source: 'usda',
    sourceId: String(f.fdcId),
    updatedAt: Date.now(),
  };
}

export async function searchUsda(query: string, apiKey: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const q = encodeURIComponent(query.trim());
  if (!q || !apiKey) return [];
  const types = encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS)');
  const data = await getJSON<{ foods?: FdcFood[] }>(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${q}&pageSize=20&dataType=${types}`,
    signal,
  );
  return (data.foods ?? []).map(parseFdcFood).filter((f): f is FoodItem => f !== null);
}
