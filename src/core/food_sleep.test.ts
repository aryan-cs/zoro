import { describe, expect, it } from 'vitest';
import { parseFdcFood, parseOffProduct } from './food';
import { parseSleepImport, sleepFromTimes } from './sleep';

describe('Open Food Facts parsing', () => {
  it('reads per-100 g and per-serving macros', () => {
    const f = parseOffProduct({
      code: '0049000006346',
      product_name: 'Greek Yogurt',
      brands: 'Fage, Total',
      serving_size: '170 g',
      serving_quantity: 170,
      nutriments: { 'energy-kcal_100g': 59, proteins_100g: 10.3, carbohydrates_100g: 3.6, fat_100g: 0.4 },
    })!;
    expect(f.brand).toBe('Fage');
    expect(f.per100g?.kcal).toBe(59);
    expect(f.serving?.macros.protein).toBeCloseTo(17.5, 1);
  });

  it('converts kJ when kcal is missing', () => {
    const f = parseOffProduct({ product_name: 'Oats', nutriments: { energy_100g: 1580, proteins_100g: 13 } })!;
    expect(f.per100g?.kcal).toBe(378);
  });

  it('rejects products without a name or nutrition', () => {
    expect(parseOffProduct({ product_name: '', nutriments: { proteins_100g: 3 } })).toBeNull();
    expect(parseOffProduct({ product_name: 'Mystery', nutriments: {} })).toBeNull();
  });
});

describe('USDA parsing', () => {
  it('reads nutrients by id', () => {
    const f = parseFdcFood({
      fdcId: 171477,
      description: 'CHICKEN, BROILERS OR FRYERS, BREAST, MEAT ONLY, COOKED, ROASTED',
      foodNutrients: [
        { nutrientId: 1008, unitName: 'KCAL', value: 165 },
        { nutrientId: 1003, unitName: 'G', value: 31 },
        { nutrientId: 1005, unitName: 'G', value: 0 },
        { nutrientId: 1004, unitName: 'G', value: 3.6 },
      ],
    })!;
    expect(f.name.startsWith('Chicken, broilers')).toBe(true);
    expect(f.per100g).toMatchObject({ kcal: 165, protein: 31, fat: 3.6 });
  });
});

describe('sleep import', () => {
  it('parses the Shortcut text format', () => {
    const s = parseSleepImport('ZORO-SLEEP start=2026-11-24T23:40:00 end=2026-11-25T07:10:00 minutes=412')!;
    expect(s.date).toBe('2026-11-25');
    expect(s.minutes).toBe(412);
  });

  it('parses JSON and falls back to time in bed', () => {
    const s = parseSleepImport('{"start":"2026-11-24T23:00:00","end":"2026-11-25T07:00:00"}')!;
    expect(s.minutes).toBe(480);
  });

  it('rejects junk', () => {
    expect(parseSleepImport('hello')).toBeNull();
    expect(parseSleepImport('start=2026-11-25T07:00 end=2026-11-24T23:00')).toBeNull();
  });

  it('builds an entry from bed and wake times across midnight', () => {
    expect(sleepFromTimes('2026-11-25', '23:30', '07:00')?.minutes).toBe(450);
    expect(sleepFromTimes('2026-11-25', '01:15', '08:00')?.minutes).toBe(405);
  });
});
