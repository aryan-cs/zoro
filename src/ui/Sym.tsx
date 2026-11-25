import { SF, type SFName } from './sf';

/** Outline units per point at a symbol size of 1pt (1.67 units/pt at 24pt). */
const UNITS_PER_PT = 24 * 1.67;

/**
 * An SF Symbol, drawn at `size` points like UIImage.SymbolConfiguration(pointSize:). Glyphs keep
 * their own proportions, so a wide symbol (dumbbell) is wider than a tall one (drop), as in iOS.
 */
export function Sym({ name, size = 17, className, label }: { name: SFName; size?: number; className?: string; label?: string }) {
  const s = SF[name];
  const k = size / UNITS_PER_PT;
  return (
    <svg
      width={s.w * k}
      height={s.h * k}
      viewBox={`0 0 ${s.w} ${s.h}`}
      fill="currentColor"
      className={`shrink-0 ${className ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path fillRule={s.e ? 'evenodd' : 'nonzero'} d={s.d} />
    </svg>
  );
}
