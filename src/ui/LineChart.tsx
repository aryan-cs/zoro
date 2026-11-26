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
          // The picked point: filled in its color with a ring in the card's color.
          pointHoverRadius: REFERENCE.test(s.label) ? 0 : 5,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: '#1c1c1e',
          pointHoverBackgroundColor: s.color,
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
      plugins: [
        {
          // The vertical rule at the picked day, from the top of the plot to its bottom.
          id: 'rule',
          afterDatasetsDraw(c) {
            const active = c.tooltip?.getActiveElements();
            if (!active?.length) return;
            const x = active[0].element.x;
            const { top, bottom } = c.chartArea;
            const ctx = c.ctx;
            ctx.save();
            ctx.strokeStyle = 'rgba(235,235,245,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();
            ctx.restore();
          },
        },
      ],
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

  // Keep the callout inside the chart: centered on the rule, pushed in at the edges.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => setWidth(box.current?.offsetWidth ?? 0), [sel]);
  const left = sel ? Math.min(Math.max(sel.x - width / 2, 0), (canvas.current?.clientWidth ?? 0) - width) : 0;

  return (
    <div className="chart-wrap" style={{ height }}>
      <canvas ref={canvas} />
      {sel && (
        <div ref={box} className="chart-callout" style={{ left }}>
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
