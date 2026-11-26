import { useId } from 'react';
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
/** 18 → "18m", 412 → "6h 52m" */
const dur = (m: number) => (m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);

/**
 * A night's stages as one timeline strip: a rounded bar from lying down to getting up, each
 * stretch colored by its stage, clock times underneath, then each stage's total with its color.
 */
export function Hypnogram({ spans, onset }: { spans: StageSpan[]; onset: string | undefined }) {
  const clip = `h${useId().replace(/[^\w-]/g, '')}`; // safe inside url(#…)
  const W = 300;
  const H = 30;
  const t0 = spans[0][0];
  const t1 = spans[spans.length - 1][1];
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;

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

  const totals: Record<SleepStage, number> = { awake: 0, rem: 0, core: 0, deep: 0, asleep: 0 };
  for (const [a, b, s] of spans) totals[s] += b - a;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="hypnogram" role="img" aria-label="Sleep stages through the night">
        <clipPath id={clip}>
          <rect x={0} y={0} width={W} height={H} rx={10} />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          {spans.map(([a, b, s], i) => (
            // A hair wider than its time, so neighbors never leave a gap between them.
            <rect key={i} x={x(a)} y={0} width={x(b) - x(a) + 0.6} height={H} fill={STAGE_COLORS[s]} />
          ))}
        </g>
        {ticks.map((t) => (
          <text key={t.x} x={t.x} y={H + 19} className="hypnogram-tick" textAnchor={t.x < 16 ? 'start' : t.x > W - 16 ? 'end' : 'middle'}>
            {t.label}
          </text>
        ))}
      </svg>
      <div className="stage-key">
        {STAGE_ROWS.map(([s, label]) => (
          <div key={s}>
            <div className="stage-key-name">
              <span style={{ background: STAGE_COLORS[s] }} />
              {label}
            </div>
            <div className="stage-key-value" style={{ color: STAGE_COLORS[s] }}>
              {dur(totals[s] + (s === 'core' ? totals.asleep : 0))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
