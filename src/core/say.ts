/**
 * Plain-English pieces for footnotes and messages, so sentences built from numbers read like a
 * person wrote them: no trailing zeros (34.5, not 34.50), sensible rounding (about 0.9 lb, not
 * 0.875), plurals, and long spans in months rather than dozens of weeks.
 */

/** Units written the same for one or many. */
const INVARIANT = new Set(['lb', 'kg', 'in', 'cm', 'oz', 'ml', 'L', 'g', 'kcal', '%', 'hr', 'min']);

/** 34.50 → "34.5", 2840.4 → "2,840", 0.875 → "0.88" (to `digits` places, trailing zeros dropped). */
export function num(n: number, digits = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** 1 week, 3 weeks, 2.5 in, 18% */
export function amount(n: number, unit: string, digits = 1): string {
  const v = num(n, digits);
  if (unit === '%') return `${v}%`;
  return `${v} ${INVARIANT.has(unit) || v === '1' ? unit : `${unit}s`}`;
}

/** A rate or small quantity to the precision people use: 0.875 → 0.9, 12.4 → 12. */
export function rough(n: number, unit: string): string {
  const a = Math.abs(n);
  return amount(a, unit, a < 10 ? 1 : 0);
}

/** 30 → "30 min", 450 → "7 hr 30 min", 480 → "8 hr" (as Health writes them). */
export function hrMin(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** How long something will take: "about a week", "about 9 weeks", "about 4 months", "over a year". */
export function span(weeks: number): string {
  if (weeks <= 1) return 'about a week';
  if (weeks < 13) return `about ${weeks} weeks`;
  const months = Math.round(weeks / 4.35);
  if (months < 12) return `about ${months} months`;
  return months < 18 ? 'about a year' : 'over a year';
}

/** ["a", "b", "c"] → "a, b, and c" */
export function list(items: string[]): string {
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(items);
}

/** Joins sentences, skipping empty ones. */
export function sentences(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
