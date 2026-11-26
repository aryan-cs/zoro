import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { pageSlide } from './nav';

/**
 * Pages side by side that slide sideways when you pick another one, like scrolling through
 * screens in iOS: picking Sleep from Body slides Body off, past Food, onto Sleep. Every page stays
 * mounted (so the ones in between show as they pass); at rest the others fold away so the page
 * scrolls only as far as the one you're on. Timing from pageSlide: longer trips take a bit longer.
 */
export function Pager({ index, pages }: { index: number; pages: ReactNode[] }) {
  const [moving, setMoving] = useState(false);
  const last = useRef(index);
  // The timing has to be on the track in the same render as the move (a transition already
  // running ignores later changes): work it out from the distance as the index changes.
  const slide = useRef(pageSlide(1));
  if (last.current !== index) slide.current = pageSlide(index - last.current);
  useLayoutEffect(() => {
    if (last.current === index) return;
    last.current = index;
    setMoving(true);
  }, [index]);
  return (
    <div className="pager">
      <div
        className="pager-track"
        style={{ transform: `translateX(${-index * 100}%)`, transition: `transform ${slide.current.ms}ms ${slide.current.ease}` }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) setMoving(false);
        }}
      >
        {pages.map((p, i) => (
          <div key={i} className={`pager-page ${!moving && i !== index ? 'is-away' : ''}`} aria-hidden={i !== index}>
            {p}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Slides a list sideways when what it shows changes (Food's meals, from one day to the next): the
 * old content, copied, slides out one way while the new slides in from the other. Call `slide`
 * with the direction just before changing what the list shows (+1: the next day, from the right).
 */
export function useSlideSwap(ref: RefObject<HTMLElement | null>, key: unknown) {
  const pending = useRef<{ copy: HTMLElement; dir: 1 | -1 } | null>(null);
  const slide = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const copy = el.cloneNode(true) as HTMLElement;
    // The copy is only a picture of the old day: nothing in it can be touched or found.
    copy.querySelectorAll('[data-entry-id], [data-flip], [data-meal]').forEach((n) => {
      n.removeAttribute('data-entry-id');
      n.removeAttribute('data-flip');
      n.removeAttribute('data-meal');
    });
    copy.removeAttribute('data-flip');
    copy.classList.add('slide-copy');
    copy.setAttribute('aria-hidden', 'true');
    pending.current = { copy, dir };
  };
  useLayoutEffect(() => {
    const p = pending.current;
    const el = ref.current;
    if (!p || !el?.parentElement) return;
    pending.current = null;
    const { ms, ease } = pageSlide(1);
    const timing = { duration: ms, easing: ease };
    el.parentElement.appendChild(p.copy);
    p.copy.style.top = `${el.offsetTop}px`;
    p.copy.animate([{ transform: 'none' }, { transform: `translateX(${-p.dir * 100}%)` }], { ...timing, fill: 'forwards' }).finished.finally(() => p.copy.remove());
    el.animate([{ transform: `translateX(${p.dir * 100}%)` }, { transform: 'none' }], timing);
  }, [key, ref]);
  return slide;
}
