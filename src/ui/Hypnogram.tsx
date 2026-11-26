import { useId } from 'react';
import { hrMin } from '../core/say';
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

/**
 * A night's stages as one timeline strip: a rounded bar from lying down to getting up, each
 * stretch colored by its stage, clock times underneath, then how often and how long you were awake
 * (the stage rings below the strip cover REM, Core and Deep).
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
  // Times you woke for two minutes or more between falling asleep and your last bit of sleep.
  const lastSleep = Math.max(...spans.filter((sp) => sp[2] !== 'awake').map((sp) => sp[1]));
  const wakes = spans.filter(([a, b, st]) => st === 'awake' && a >= 0 && b < lastSleep && b - a >= 2).length;

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
      {/* Time awake, which the rings below don't show: how often and how long in all. */}
      <div className="stage-caption">
        <span>{wakes === 0 ? 'Slept straight through' : `Awake ${wakes === 1 ? 'once' : wakes === 2 ? 'twice' : `${wakes} times`}`}</span>
        <span style={{ color: STAGE_COLORS.awake }}>{hrMin(totals.awake)} awake</span>
      </div>
    </>
  );
}
