import { describe, expect, it } from 'vitest';
import { barcodeVariants, parseFdcFood, parseOffProduct } from './food';
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

  it('handles brands as a list (search results)', () => {
    const f = parseOffProduct({ code: '1', product_name: 'Greek Yogurt 0%', brands: ['fage'], nutriments: { 'energy-kcal_100g': 53, proteins_100g: 10.6 } })!;
    expect(f.brand).toBe('fage');
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

  it('merges Health samples into one night and skips awake time', () => {
    const text = `ZORO-SLEEP [
      {"start":"2026-11-24T14:00:00-06:00","end":"2026-11-24T14:30:00-06:00","value":"Asleep Core"},
      {"start":"2026-11-24T23:30:00-06:00","end":"2026-11-25T02:00:00-06:00","value":"Asleep Core"},
      {"start":"2026-11-25T01:30:00-06:00","end":"2026-11-25T03:00:00-06:00","value":"Asleep Deep"},
      {"start":"2026-11-25T03:00:00-06:00","end":"2026-11-25T03:20:00-06:00","value":"Awake"},
      {"start":"2026-11-25T03:20:00-06:00","end":"2026-11-25T07:00:00-06:00","value":"Asleep REM"},
      {"start":"2026-11-24T23:00:00-06:00","end":"2026-11-25T07:15:00-06:00","value":"In Bed"},
    ]`;
    const s = parseSleepImport(text)!;
    // 23:30–03:00 (210 min) + 03:20–07:00 (220 min); the afternoon nap is a separate cluster.
    expect(s.minutes).toBe(430);
    expect(new Date(s.wakeTime!).toISOString()).toBe('2026-11-25T13:00:00.000Z');
  });

  it('reads the installable shortcut format (three lists)', () => {
    const text = [
      'ZORO-SLEEP2',
      '2026-11-24T23:30:00-06:00',
      '2026-11-25T03:00:00-06:00',
      '2026-11-25T03:20:00-06:00',
      '2026-11-24T23:00:00-06:00',
      '---',
      '2026-11-25T03:00:00-06:00',
      '2026-11-25T03:20:00-06:00',
      '2026-11-25T07:00:00-06:00',
      '2026-11-25T07:15:00-06:00',
      '---',
      'Asleep Core',
      'Awake',
      'Asleep REM',
      'In Bed',
    ].join('\n');
    const s = parseSleepImport(text)!;
    expect(s.minutes).toBe(430);
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

describe('better food data', () => {
  it('reads USDA branded drinks with a real serving in ml', () => {
    const f = parseFdcFood({
      fdcId: 1627840,
      description: 'DIET COKE WITH LIME FLAVOR, LIME',
      brandOwner: 'Coca-Cola USA Operations',
      gtinUpc: '049000039139',
      servingSize: 240,
      servingSizeUnit: 'ml',
      householdServingFullText: '8 OZA',
      foodNutrients: [
        { nutrientId: 1008, unitName: 'KCAL', value: 0 },
        { nutrientId: 1003, unitName: 'G', value: 0 },
      ],
    } as Parameters<typeof parseFdcFood>[0])!;
    expect(f.liquid).toBe(true);
    expect(f.serving?.label).toBe('8 OZA (240 ml)');
    expect(f.serving?.macros.kcal).toBe(0);
  });

  it('scales a branded serving in grams', () => {
    const f = parseFdcFood({
      fdcId: 1,
      description: 'PROTEIN BAR',
      servingSize: 60,
      servingSizeUnit: 'GRM',
      foodNutrients: [
        { nutrientId: 1008, unitName: 'KCAL', value: 400 },
        { nutrientId: 1003, unitName: 'G', value: 33.3 },
      ],
    })!;
    expect(f.serving?.macros).toMatchObject({ kcal: 240, protein: 20 });
  });

  it('tries the 12-digit UPC and the 14-digit GTIN', () => {
    expect(barcodeVariants('0049000050110')).toEqual(['049000050110', '00049000050110']);
    expect(barcodeVariants('049000039139')).toEqual(['049000039139', '00049000039139']);
  });

  it('uses the package as the serving when Open Food Facts has none', () => {
    const f = parseOffProduct({
      code: '1',
      product_name: 'Cola',
      quantity: '355 ml',
      product_quantity: 355,
      product_quantity_unit: 'ml',
      nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 10.6 },
    })!;
    expect(f.liquid).toBe(true);
    expect(f.serving?.label).toBe('1 package (355 ml)');
    expect(f.serving?.macros.kcal).toBe(149);
  });
});
