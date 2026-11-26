import { describe, expect, it } from 'vitest';
import { ageOn, bmr, defaultRate, recommend, weeksToGoal } from './targets';

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
    // Man, 30 y, 180 cm, 80 kg, moderate, cut at 0.5%/week (0.4 kg = 0.882 lb).
    const r = recommend({ sex: 'male', age: 30, heightIn: 180 / 2.54, weightLb: 80 / 0.45359237, activity: 'moderate', phase: 'cut', ratePerWeek: -0.4 / 0.45359237 });
    expect(r.tdee).toBe(2759);
    expect(r.kcal).toBe(2320);
    expect(r.protein).toBe(176);
    expect(r.fat).toBe(64);
    expect(r.carbs).toBe(260);
    expect(r.fiber).toBe(32);
    expect(r.waterOz).toBe(120);
    expect(r.sleepMin).toBe(480);
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
