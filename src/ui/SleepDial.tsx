import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { SF, type SFName } from './sf';
import { Sym } from './Sym';

/**
 * Bedtime / wake-up dial, drawn like the Health and Clock apps' sleep schedule: a 24-hour
 * clock face (12 AM at the top), a capsule from bedtime to wake-up in the black track around
 * it, and handles at each end to drag. Dragging the capsule itself moves both times.
 */
const DAY = 1440;
const SNAP = 5;
// Proportions measured from Health's sleep schedule dial (iOS 27), in a 300-unit drawing.
const C = 150; // center
const FACE_R = 102.5; // clock face
const TRACK_R = 126; // middle of the black track and of the capsule
const TRACK_W = 47; // black track, face edge to 149.5
const ARC_W = 36; // capsule
const LABEL_R = 79; // hour numbers
const SIDE_R = 74.5; // 6AM / 6PM sit a little further in (they're wide)
const ICON_R = 57.5; // moon and sun

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60 + m) % DAY;
};
const toHHMM = (min: number) => {
  const m = ((Math.round(min / SNAP) * SNAP) % DAY + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** Point at `min` minutes past midnight, `r` from the center (12 AM at the top, clockwise). */
const at = (min: number, r: number) => {
  const t = (min / DAY) * 2 * Math.PI - Math.PI / 2;
  return [C + r * Math.cos(t), C + r * Math.sin(t)];
};
export const clock12 = (hhmm: string) => {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** An SF Symbol placed inside the SVG, centered on (x, y). */
function Glyph({ name, x, y, size, color }: { name: SFName; x: number; y: number; size: number; color: string }) {
  const s = SF[name];
  const k = size / 40.08;
  const w = s.w * k;
  const h = s.h * k;
  return (
    <svg x={x - w / 2} y={y - h / 2} width={w} height={h} viewBox={`0 0 ${s.w} ${s.h}`} overflow="visible">
      <path fill={color} fillRule={s.e ? 'evenodd' : 'nonzero'} d={s.d} />
    </svg>
  );
}

export function SleepDial({ bed, wake, onChange }: { bed: string; wake: string; onChange: (bed: string, wake: string) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ part: 'bed' | 'wake' | 'both'; start: number; bed: number; wake: number } | null>(null);
  const b = toMin(bed);
  const w = toMin(wake);
  const span = (w - b + DAY) % DAY || DAY;

  // Minutes past midnight under the pointer.
  const minuteAt = (e: ReactPointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 300 - C;
    const y = ((e.clientY - r.top) / r.height) * 300 - C;
    const a = Math.atan2(y, x) + Math.PI / 2;
    return ((a / (2 * Math.PI)) * DAY + DAY) % DAY;
  };
  const down = (part: 'bed' | 'wake' | 'both') => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { part, start: minuteAt(e), bed: b, wake: w };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const m = minuteAt(e);
    if (d.part === 'bed') onChange(toHHMM(m), wake);
    else if (d.part === 'wake') onChange(bed, toHHMM(m));
    else {
      const delta = m - d.start;
      onChange(toHHMM(d.bed + delta), toHHMM(d.wake + delta));
    }
  };
  const up = () => {
    drag.current = null;
  };

  // The capsule from bedtime to wake-up, as one arc with round ends.
  const [x0, y0] = at(b, TRACK_R);
  const [x1, y1] = at(b + span, TRACK_R);
  const arc = `M${x0} ${y0}A${TRACK_R} ${TRACK_R} 0 ${span > DAY / 2 ? 1 : 0} 1 ${x1} ${y1}`;
  // Grip lines across the capsule, every 10 minutes between the handles.
  const grips: number[] = [];
  for (let m = 25; m < span - 20; m += 10) grips.push(b + m);

  // Clock face: a tick each 15 minutes (longer on the hour), labels every 2 hours.
  const ticks = Array.from({ length: 96 }, (_, i) => i * 15);
  const labels: [number, string, boolean][] = [
    [0, '12AM', true],
    [120, '2', false],
    [240, '4', false],
    [360, '6AM', true],
    [480, '8', false],
    [600, '10', false],
    [720, '12PM', true],
    [840, '2', false],
    [960, '4', false],
    [1080, '6PM', true],
    [1200, '8', false],
    [1320, '10', false],
  ];

  return (
    <svg
      ref={svg}
      viewBox="0 0 300 300"
      className="sleep-dial"
      data-no-swipe
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="group"
      aria-label={`Bedtime ${clock12(bed)}, wake up ${clock12(wake)}`}
    >
      <circle cx={C} cy={C} r={TRACK_R} fill="none" stroke="#000" strokeWidth={TRACK_W} />
      <circle cx={C} cy={C} r={FACE_R} fill="var(--ios-cell)" />
      {ticks.map((m) => {
        const hour = m % 60 === 0;
        const [ax, ay] = at(m, FACE_R - 6.5);
        const [bx, by] = at(m, FACE_R - (hour ? 11.2 : 8.5));
        return <line key={m} x1={ax} y1={ay} x2={bx} y2={by} stroke={hour ? '#8d8d93' : '#48484a'} strokeWidth={hour ? 1.4 : 1} strokeLinecap="round" />;
      })}
      {labels.map(([m, text, major]) => {
        const unit = text.match(/[AP]M$/)?.[0];
        const [x, y] = at(m, m === 360 || m === 1080 ? SIDE_R : LABEL_R);
        // AM/PM share the number's baseline (small caps, as in Health). The baseline sits half a cap
        // height below the point; dominant-baseline isn't used because Safari applies it per tspan.
        return (
          <text key={m} x={x} y={y} dy="0.36em" textAnchor="middle" className={`sleep-dial-label ${major ? 'is-major' : ''}`}>
            {unit ? text.slice(0, -2) : text}
            {unit && <tspan className="sleep-dial-unit">{unit}</tspan>}
          </text>
        );
      })}
      <Glyph name="moon.fill" x={C} y={C - ICON_R} size={13.1} color="#7d7aff" />
      <Glyph name="sun.max.fill" x={C} y={C + ICON_R} size={12.75} color="#ffd60a" />

      <path d={arc} fill="none" stroke="#3a3a3c" strokeWidth={ARC_W} strokeLinecap="round" onPointerDown={down('both')} style={{ cursor: 'grab' }} />
      {grips.map((m) => {
        const [ax, ay] = at(m, TRACK_R - 8);
        const [bx, by] = at(m, TRACK_R + 8);
        return <line key={m} x1={ax} y1={ay} x2={bx} y2={by} stroke="#1c1c1e" strokeWidth={2.2} strokeLinecap="round" pointerEvents="none" />;
      })}
      <g onPointerDown={down('bed')} style={{ cursor: 'grab' }}>
        <circle cx={x0} cy={y0} r={ARC_W / 2} fill="#3a3a3c" />
        <Glyph name="bed.double.fill" x={x0} y={y0} size={10.8} color="#98989f" />
      </g>
      <g onPointerDown={down('wake')} style={{ cursor: 'grab' }}>
        <circle cx={x1} cy={y1} r={ARC_W / 2} fill="#3a3a3c" />
        <Glyph name="alarm.waves.left.and.right.fill" x={x1} y={y1} size={11} color="#98989f" />
      </g>
    </svg>
  );
}

/** "BEDTIME / 11:00 PM / Last Night" over the dial. */
export function SleepTime({ icon, label, time, day }: { icon: SFName; label: string; time: string; day: string }) {
  return (
    <div className="sleep-time">
      <div className="sleep-time-label">
        <Sym name={icon} size={8} />
        {label}
      </div>
      <div className="sleep-time-value">{clock12(time)}</div>
      <div className="sleep-time-day">{day}</div>
    </div>
  );
}
