import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  programStart: '2026-11-30',
  daysPerWeek: 5,
  benchMax: 195,
  benchBlockStart: '2026-11-30',
  phase: 'cut',
  targetRate: -0.875,
  kcalTarget: 2600,
  proteinTarget: 185,
  fatTarget: 70,
  stepsTarget: 9000,
  sleepTargetMin: 450,
  dumbbellMax: 60,
  barWeight: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  startWeights: {},
};
