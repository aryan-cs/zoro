import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);
// The system font (SF Pro on iPhone), as in Health's charts; Chart.js otherwise draws Helvetica Neue.
Chart.defaults.font.family = 'system-ui, -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';
Chart.defaults.font.size = 12;

export interface Series {
  label: string;
  data: (number | null)[];
  color: string;
  /** Show dots only (raw readings) instead of a line. */
  dots?: boolean;
}

/** What's under your finger: the date, the main series' value, and any other series (not goal lines). */
interface Selection {
  x: number;
  date: string;
  main: { label: string; value: string };
  others: { label: string; value: string; color: string }[];
}

// Series that are flat reference lines rather than data; they aren't read out in the callout.
const REFERENCE = /^(goal|target)$/i;

/** "10/25" → "Oct 25", as Health writes dates. */
function longLabel(label: string) {
  const m = label.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return label;
  return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2])).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A value with its unit, the way the rest of the app writes it (hours as "7h 20m"). */
function withUnit(v: number, unit: string) {
  const u = unit.trim();
  if (u === 'h') {
    const min = Math.round(v * 60);
    return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
  }
  const digits = u === 'kcal' ? 0 : 1;
  return `${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${u}`.trim();
}

/**
 * A line chart in Health's style. Touch (or hover) and drag to read it: a thin vertical rule
 * marks the day, the point is ringed, and a small rounded callout at the top gives the date, the
 * value and any other series; lifting your finger clears it.
 */
export function LineChart({ labels, series, height = 180, unit = '' }: { labels: string[]; series: Series[]; height?: number; unit?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const shownIndex = useRef(-1);
  // The lines that get a dot (not goal lines).
  const dataSeries = series.filter((s) => !REFERENCE.test(s.label) && !s.dots);

  // The selection (rule, dots, callout) glides between days on a spring, as in Health: it settles
  // in about a third of a second with a slight overshoot, instead of jumping from point to point.
  const wrap = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLDivElement>(null);
  const dots = useRef<(HTMLDivElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const spring = useRef({ live: false, raf: 0, last: 0, x: 0, vx: 0, tx: 0, ys: [] as number[], vys: [] as number[], tys: [] as (number | null)[] });
  const paint = () => {
    const a = spring.current;
    if (rule.current) rule.current.style.transform = `translateX(${a.x}px)`;
    a.tys.forEach((ty, i) => {
      const d = dots.current[i];
      if (!d) return;
      d.style.visibility = ty === null ? 'hidden' : 'visible';
      d.style.transform = `translate(${a.x}px, ${a.ys[i]}px)`;
    });
    const b = box.current;
    if (b) {
      const w = b.offsetWidth;
      const max = (canvas.current?.clientWidth ?? 0) - w;
      b.style.left = `${Math.min(Math.max(a.x - w / 2, 0), Math.max(0, max))}px`;
    }
  };
  const step = (t: number) => {
    const a = spring.current;
    const dt = Math.min(1 / 30, a.last ? (t - a.last) / 1000 : 1 / 60);
    a.last = t;
    // Response 0.3 s, damping 0.72: quick, with a small bounce past the point.
    const k = (2 * Math.PI / 0.3) ** 2;
    const c = (4 * Math.PI * 0.72) / 0.3;
    a.vx += (k * (a.tx - a.x) - c * a.vx) * dt;
    a.x += a.vx * dt;
    let moving = Math.abs(a.tx - a.x) > 0.05 || Math.abs(a.vx) > 0.05;
    a.tys.forEach((ty, i) => {
      if (ty === null) return;
      a.vys[i] += (k * (ty - a.ys[i]) - c * a.vys[i]) * dt;
      a.ys[i] += a.vys[i] * dt;
      if (Math.abs(ty - a.ys[i]) > 0.05 || Math.abs(a.vys[i]) > 0.05) moving = true;
    });
    paint();
    a.raf = moving ? requestAnimationFrame(step) : 0;
    if (!moving) a.last = 0;
  };
  const glideTo = (x: number, ys: (number | null)[], top: number, bottom: number) => {
    const a = spring.current;
    if (rule.current) {
      rule.current.style.top = `${top}px`;
      rule.current.style.height = `${bottom - top}px`;
    }
    a.tx = x;
    a.tys = ys;
    if (!a.live) {
      // First touch: appear right on the day, no glide in from elsewhere.
      a.live = true;
      a.x = x;
      a.vx = 0;
      a.ys = ys.map((y) => y ?? 0);
      a.vys = ys.map(() => 0);
      wrap.current?.classList.add('is-scrubbing');
      requestAnimationFrame(paint);
      return;
    }
    ys.forEach((y, i) => {
      // A line that had no value on the last day starts from this one instead of gliding in.
      if (y !== null && (a.ys[i] === undefined || Number.isNaN(a.ys[i]))) {
        a.ys[i] = y;
        a.vys[i] = 0;
      }
    });
    if (!a.raf) a.raf = requestAnimationFrame(step);
  };
  const release = () => {
    const a = spring.current;
    a.live = false;
    cancelAnimationFrame(a.raf);
    a.raf = 0;
    a.last = 0;
    wrap.current?.classList.remove('is-scrubbing');
  };

  useEffect(() => {
    if (!canvas.current) return;
    const dark = document.documentElement.classList.contains('dark');
    const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const text = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)'; // iOS secondary label
    // No data yet: still draw the chart area (gridlines and dates), just without values.
    const empty = !series.some((s) => s.data.some((v) => v !== null && v !== undefined));
    chart.current?.destroy();
    chart.current = new Chart(canvas.current, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s) => ({
          label: s.label,
          data: s.data,
          borderColor: s.color,
          backgroundColor: s.color,
          borderWidth: s.dots ? 0 : REFERENCE.test(s.label) ? 1.5 : 2.5,
          // Goal and target lines are dashed, so they read as references rather than data.
          borderDash: REFERENCE.test(s.label) ? [6, 5] : undefined,
          pointRadius: s.dots ? 2.5 : 0,
          // The picked point is drawn over the chart (see the glide below), not by Chart.js.
          pointHoverRadius: 0,
          tension: 0.3,
          spanGaps: true,
          showLine: !s.dots,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        events: ['mousemove', 'mouseout', 'touchstart', 'touchmove', 'touchend'],
        plugins: {
          tooltip: {
            enabled: false,
            external: ({ tooltip }) => {
              if (empty || !tooltip.opacity || !tooltip.dataPoints?.length) return setSel(null);
              const pts = tooltip.dataPoints.filter((d) => d.parsed.y !== null && !Number.isNaN(d.parsed.y));
              const data = pts.filter((d) => !REFERENCE.test(d.dataset.label ?? ''));
              if (!data.length) return setSel(null);
              const [first, ...rest] = data;
              // Where the selection should glide to: the day's x, and each line's y there.
              const area = tooltip.chart.chartArea;
              glideTo(
                first.element.x,
                dataSeries.map((ds) => {
                  const p = pts.find((d) => d.dataset.label === ds.label);
                  return p ? p.element.y : null;
                }),
                area.top,
                area.bottom,
              );
              if (first.dataIndex === shownIndex.current) return;
              shownIndex.current = first.dataIndex;
              setSel({
                x: first.element.x,
                date: longLabel(String(first.label)),
                main: { label: first.dataset.label ?? '', value: withUnit(first.parsed.y as number, unit) },
                others: rest.map((d) => ({ label: d.dataset.label ?? '', value: withUnit(d.parsed.y as number, unit), color: String(d.dataset.borderColor) })),
              });
            },
          },
        },
        scales: {
          // No axis lines: just the horizontal gridlines, as in Health.
          x: { grid: { display: false }, border: { display: false }, ticks: { color: text, maxTicksLimit: 5, maxRotation: 0 } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { color: text, maxTicksLimit: 5, display: !empty } },
        },
      },
    });
    // Lifting the finger clears the reading, as in Health.
    const node = canvas.current;
    const clear = () => {
      const c = chart.current;
      if (!c) return;
      c.setActiveElements([]);
      c.tooltip?.setActiveElements([], { x: 0, y: 0 });
      c.update('none');
      setSel(null);
      shownIndex.current = -1;
      release();
    };
    node.addEventListener('touchend', clear);
    node.addEventListener('touchcancel', clear);
    node.addEventListener('mouseleave', clear);
    return () => {
      node.removeEventListener('touchend', clear);
      node.removeEventListener('touchcancel', clear);
      node.removeEventListener('mouseleave', clear);
      chart.current?.destroy();
      chart.current = null;
    };
  }, [labels, series, unit]);

  // A new day's callout can be a different width: re-center it right away.
  useLayoutEffect(() => {
    if (sel) paint();
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className="chart-wrap" style={{ height }}>
      <canvas ref={canvas} />
      <div ref={rule} className="chart-rule" aria-hidden />
      {dataSeries.map((s, i) => (
        <div
          key={s.label}
          ref={(el) => {
            dots.current[i] = el;
          }}
          className="chart-dot"
          style={{ background: s.color }}
          aria-hidden
        />
      ))}
      {sel && (
        <div ref={box} className="chart-callout">
          <div className="chart-callout-label">{sel.date}</div>
          <div className="chart-callout-value">{sel.main.value}</div>
          {sel.others.map((o) => (
            <div key={o.label} className="chart-callout-other">
              <span style={{ background: o.color }} />
              {o.label} {o.value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
