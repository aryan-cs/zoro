import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { useEffect, useRef } from 'react';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

export interface Series {
  label: string;
  data: (number | null)[];
  color: string;
  /** Show dots only (raw readings) instead of a line. */
  dots?: boolean;
}

export function LineChart({ labels, series, height = 180, unit = '' }: { labels: string[]; series: Series[]; height?: number; unit?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const dark = document.documentElement.classList.contains('dark');
    const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const text = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
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
          borderWidth: s.dots ? 0 : 2.5,
          pointRadius: s.dots ? 2.5 : 0,
          pointHoverRadius: 4,
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
        plugins: {
          tooltip: {
            enabled: !empty,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)}${unit}` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: text, maxTicksLimit: 5, maxRotation: 0 } },
          y: { grid: { color: grid }, ticks: { color: text, maxTicksLimit: 5, display: !empty } },
        },
      },
    });
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [labels, series, unit]);

  return (
    <div style={{ height }}>
      <canvas ref={canvas} />
    </div>
  );
}
