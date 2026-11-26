import { clockOf } from '../core/sleepStats';
import type { SleepStage, StageSpan } from '../core/types';

/** Health's sleep stage colors (dark mode). Unlabeled sleep sits with Core. */
export const STAGE_COLORS: Record<SleepStage, string> = {
  awake: '#ff7f5c',
  rem: '#5ac8fa',
  core: '#3a82f7',
  deep: '#5e5ce6',
  asleep: '#3a82f7',
};
export const STAGE_ROWS: [SleepStage, string][] = [
  ['awake', 'Awake'],
  ['rem', 'REM'],
  ['core', 'Core'],
  ['deep', 'Deep'],
];
const rowOf = (s: SleepStage) => (s === 'asleep' ? 2 : STAGE_ROWS.findIndex((r) => r[0] === s));

/**
 * A night's stages over time, like Health's Sleep › Stages chart: one row per stage (Awake on
 * top, Deep at the bottom), rounded bars joined by thin lines where the stage changes, stage
 * names on the right and clock times underneath.
 */
export function Hypnogram({ spans, onset }: { spans: StageSpan[]; onset: string | undefined }) {
  const W = 290;
  const LABEL = 50;
  const ROW = 30;
  const BAR = 18;
  const H = STAGE_ROWS.length * ROW;
  const t0 = spans[0][0];
  const t1 = spans[spans.length - 1][1];
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (s: SleepStage) => rowOf(s) * ROW + (ROW - BAR) / 2;

  // Clock times along the bottom, every two hours (three on a long night).
  const ticks: { x: number; label: string }[] = [];
  const start = clockOf(onset);
  if (start !== null) {
    const step = t1 - t0 > 600 ? 180 : 120;
    for (let m = Math.ceil((start + t0) / step) * step; m <= start + t1; m += step) {
      const h = (((m / 60) % 24) + 24) % 24;
      ticks.push({ x: x(m - start), label: `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` });
    }
  }

  return (
    <svg viewBox={`0 0 ${W + LABEL} ${H + 24}`} className="hypnogram" role="img" aria-label="Sleep stages through the night">
      {STAGE_ROWS.map(([s, label], i) => (
        <text key={s} x={W + 10} y={i * ROW + ROW / 2 + 4.5} className="hypnogram-label">
          {label}
        </text>
      ))}
      {spans.slice(1).map((sp, i) => {
        const prev = spans[i];
        if (rowOf(prev[2]) === rowOf(sp[2])) return null;
        const at = x(sp[0]);
        return <line key={`j${i}`} x1={at} x2={at} y1={y(prev[2]) + BAR / 2} y2={y(sp[2]) + BAR / 2} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />;
      })}
      {spans.map(([a, b, s], i) => {
        const w = Math.max(2, x(b) - x(a));
        return <rect key={i} x={x(a)} y={y(s)} width={w} height={BAR} rx={Math.min(4, w / 2)} fill={STAGE_COLORS[s]} />;
      })}
      {ticks.map((t) => (
        <text key={t.x} x={t.x} y={H + 18} className="hypnogram-tick" textAnchor={t.x < 16 ? 'start' : t.x > W - 16 ? 'end' : 'middle'}>
          {t.label}
        </text>
      ))}
    </svg>
  );
}
