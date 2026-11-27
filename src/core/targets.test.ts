import { describe, expect, it } from 'vitest';
import { ageOn, bmr, bodyFatFromWaist, defaultRate, recommend, timeInBedFor, weeksToGoal } from './targets';

describe('targets', () => {
  it('uses Mifflin–St Jeor for resting energy', () => {
    // 80 kg, 180 cm, 30 y man: 10·80 + 6.25·180 − 5·30 + 5 = 1780
    expect(Math.round(bmr({ sex: 'male', age: 30, heightIn: 180 / 2.54, weightLb: 80 / 0.45359237 }))).toBe(1780);
    expect(Math.round(bmr({ sex: 'female', age: 30, heightIn: 180 / 2.54, weightLb: 80 / 0.45359237 }))).toBe(1614);
  });
  it('sets a deficit on a cut and more protein', () => {
    const p = { sex: 'male' as const, age: 25, heightIn: 70, weightLb: 185, activity: 'moderate' as const };
    const cut = recommend({ ...p, phase: 'cut', ratePerWeek: -1 });
    const keep = recommend({ ...p, phase: 'maintain', ratePerWeek: 0 });
    expect(keep.kcal - cut.kcal).toBeGreaterThan(450);
    expect(cut.protein).toBeGreaterThan(keep.protein);
    expect(cut.carbs).toBeGreaterThan(0);
  });
  it('matches the research worked example', () => {
    // Man, 30 y, 180 cm, 80 kg, lifts most days (ten Haaf), cut at 0.5%/week (0.4 kg = 0.882 lb).
    const r = recommend({ sex: 'male', age: 30, heightIn: 180 / 2.54, weightLb: 80 / 0.45359237, activity: 'moderate', phase: 'cut', ratePerWeek: -0.4 / 0.45359237 });
    expect(r.bmr).toBe(1989);
    expect(r.tdee).toBe(3083);
    expect(r.kcal).toBe(2640);
    expect(r.protein).toBe(176);
    expect(r.fat).toBe(73);
    expect(r.carbs).toBe(320);
    expect(r.fiber).toBe(38);
    expect(r.waterOz).toBe(90);
    expect(r.waterTrainingOz).toBe(20);
    expect(r.sleepMin).toBe(480);
  });
  it('uses ten Haaf only for 18–35-year-olds who train', () => {
    const base = { sex: 'male' as const, heightIn: 180 / 2.54, weightLb: 80 / 0.45359237 };
    expect(Math.round(bmr({ ...base, age: 30, activity: 'moderate' }))).toBe(1989);
    expect(Math.round(bmr({ ...base, age: 30, activity: 'light' }))).toBe(1780);
    expect(Math.round(bmr({ ...base, age: 40, activity: 'moderate' }))).toBe(1730);
  });
  it('keeps protein on a cut by fat-free mass, estimated from the waist', () => {
    // 6'1", 35.25" waist: relative fat mass 64 − 20 × 73/35.25 ≈ 22.6%.
    expect(bodyFatFromWaist('male', 73, 35.25)).toBeCloseTo(0.226, 3);
    const p = { sex: 'male' as const, age: 20, heightIn: 73, activity: 'moderate' as const, phase: 'cut' as const, ratePerWeek: -0.8 };
    const now = recommend({ ...p, weightLb: 195, waistIn: 35.25 });
    expect(now.protein).toBe(185);
    // Leaner and lighter, same fat-free mass: protein holds instead of falling with weight.
    const later = recommend({ ...p, weightLb: 176, bodyFat: 0.14 });
    expect(later.protein).toBeGreaterThanOrEqual(now.protein - 5);
    // Without a waist or body fat: 2.2 g/kg.
    expect(recommend({ ...p, weightLb: 195 }).protein).toBe(195);
  });
  it('trusts measured burn, within a quarter of the formula', () => {
    const p = { sex: 'male' as const, age: 20, heightIn: 73, weightLb: 195, activity: 'moderate' as const, phase: 'cut' as const, ratePerWeek: -0.8 };
    const formula = recommend(p).tdee;
    expect(recommend(p, 2900).tdee).toBe(2900);
    expect(recommend(p, 1000).tdee).toBe(Math.round(formula * 0.75));
    expect(recommend(p, 2900).kcal).toBe(2500);
  });
  it('never goes under the energy-availability floor', () => {
    // A steep cut on a light frame: 25 kcal per kg fat-free plus training is the floor.
    const r = recommend({ sex: 'male', age: 20, heightIn: 70, weightLb: 150, bodyFat: 0.12, activity: 'moderate', phase: 'cut', ratePerWeek: -3 });
    const ffm = 150 * 0.45359237 * 0.88;
    expect(r.kcal).toBeGreaterThanOrEqual(Math.round(25 * ffm));
    expect(r.carbs).toBeGreaterThanOrEqual(129);
  });
  it('sleep and time in bed', () => {
    expect(timeInBedFor(480)).toBe(540);
    expect(timeInBedFor(450)).toBe(510);
  });
  it('uses fat-free mass when body fat is known', () => {
    expect(Math.round(bmr({ sex: 'male', age: 30, heightIn: 70, weightLb: 80 / 0.45359237, bodyFat: 0.15 }))).toBe(1996);
  });
  it('rates, ages and weeks to goal', () => {
    expect(defaultRate('cut', 200)).toBe(-1);
    expect(defaultRate('bulk', 160)).toBe(0.4);
    expect(ageOn('2000-12-01', '2026-11-25')).toBe(25);
    expect(weeksToGoal(190, 180, -1)).toBe(10);
    expect(weeksToGoal(190, 200, -1)).toBeNull();
  });
});
