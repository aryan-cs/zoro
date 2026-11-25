import { describe, expect, it } from 'vitest';
import {
  addDays,
  carbTarget,
  e1rm,
  estimateEnergy,
  nextMonday,
  platesPerSide,
  programWeek,
  sevenDayAverage,
  weeklyRate,
  weightTrend,
} from './calc';

describe('dates and program weeks', () => {
  it('finds the next Monday', () => {
    expect(nextMonday('2026-11-25')).toBe('2026-11-30'); // Wednesday → Monday
    expect(nextMonday('2026-11-30')).toBe('2026-11-30');
  });

  it('marks weeks 6 and 12 of each block as easy', () => {
    expect(programWeek('2026-11-30', '2026-11-30', [6, 12])).toMatchObject({ week: 1, blockWeek: 1, deload: false });
    expect(programWeek('2026-11-30', '2027-01-04', [6, 12])).toMatchObject({ week: 6, deload: true });
    expect(programWeek('2026-11-30', '2027-02-22', [6, 12])).toMatchObject({ week: 13, blockWeek: 1, block: 2 });
  });
});

describe('lifting math', () => {
  it('estimates a one-rep max', () => {
    expect(e1rm(195, 1)).toBe(195);
    expect(Math.round(e1rm(165, 5))).toBe(193);
  });

  it('loads plates per side', () => {
    expect(platesPerSide(225, 45, [45, 35, 25, 10, 5, 2.5]).plates).toEqual([45, 45]);
    expect(platesPerSide(185, 45, [45, 35, 25, 10, 5, 2.5]).plates).toEqual([45, 25]);
    expect(platesPerSide(160, 45, [45, 35, 25, 10, 5, 2.5])).toEqual({ plates: [45, 10, 2.5], leftover: 0 });
    // 157.5 can't be made with 2.5s; 2.5 lb is left over.
    expect(platesPerSide(157.5, 45, [45, 35, 25, 10, 5, 2.5]).leftover).toBe(2.5);
  });
});

describe('weight trend and energy', () => {
  const days = Array.from({ length: 28 }, (_, i) => addDays('2026-12-01', i));
  // Losing 1 lb/week with ±1 lb daily noise.
  const weights = days.map((date, i) => ({ date, value: 195 - i / 7 + (i % 2 ? 1 : -1) }));

  it('smooths daily noise', () => {
    const t = weightTrend(weights);
    expect(t).toHaveLength(28);
    expect(Math.abs(t[27].trend - t[26].trend)).toBeLessThan(0.5);
  });

  it('averages the last 7 days', () => {
    expect(sevenDayAverage(weights, days[6])).toBeCloseTo(195 - 3 / 7 - 1 / 7, 1);
  });

  it('measures the weekly rate', () => {
    const rate = weeklyRate(weightTrend(weights, 0.3), 14)!;
    expect(rate).toBeLessThan(-0.6);
    expect(rate).toBeGreaterThan(-1.4);
  });

  it('estimates calories burned from intake and weight change', () => {
    const intake = days.map((date) => ({ date, kcal: 2600 }));
    const est = estimateEnergy(intake, weightTrend(weights, 0.3), -1)!;
    // Losing ~1 lb/week at 2,600 → burning ~3,100.
    expect(est.tdee).toBeGreaterThan(2850);
    expect(est.tdee).toBeLessThan(3350);
    expect(est.recommended).toBeLessThan(est.tdee);
  });

  it('needs two weeks of food logs', () => {
    const intake = days.slice(0, 5).map((date) => ({ date, kcal: 2600 }));
    expect(estimateEnergy(intake, weightTrend(weights), -1)).toBeNull();
  });

  it('fills remaining calories with carbs', () => {
    expect(carbTarget(2600, 185, 70)).toBe(308);
  });
});
