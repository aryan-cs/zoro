import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { useSlideSwap } from '../ui/pager';
import { Sym } from '../ui/Sym';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { addDays, sumEntries } from '../core/calc';
import { lookupBarcode, normalizeBarcode } from '../core/food';
import { entriesFor, logFood, today } from '../core/store';
import type { FoodEntry, Meal } from '../core/types';
import { db, fmt, Header, IconGroup, MacroSummary, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useScanner } from '../ui/Scanner';

/** Meals in the order they're shown. Food added without a meal goes to Other ('unsorted' in the data). */
export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snacks' },
  { id: 'unsorted', label: 'Other' },
];

function dayLabel(date: string): string {
  const t = today();
  if (date === t) return 'Today';
  if (date === addDays(t, -1)) return 'Yesterday';
  return new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export const amountText = (e: FoodEntry) =>
  e.unit === 'g' ? `${fmt(e.quantity)} ${e.liquid ? 'ml' : 'g'}` : `${fmt(e.quantity, e.quantity % 1 ? 1 : 0)} serving${e.quantity === 1 ? '' : 's'}`;

/** "‹ Today ›": the day switcher lives in the title, like Calendar and Health. */
function DayTitle({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  return (
    <span className="flex items-center justify-center">
      <button type="button" aria-label="Previous day" className="ios-title-chevron" onClick={() => onChange(addDays(date, -1))}>
        <Sym name="chevron.left" size={15} />
      </button>
      <span className="truncate px-1">{dayLabel(date)}</span>
      <button type="button" aria-label="Next day" className="ios-title-chevron" disabled={date >= today()} onClick={() => onChange(addDays(date, 1))}>
        <Sym name="chevron.right" size={15} />
      </button>
    </span>
  );
}

/** Where a dragged food would land: a meal, and its place among that meal's other foods. */
interface Drop {
  id: number;
  meal: Meal;
  index: number;
  height: number;
}

/** Order within a meal: where you dragged it, otherwise when you logged it. */
const sortKey = (e: FoodEntry) => e.order ?? e.loggedAt;

const SLIDE = '0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Vertical translation an element currently has from a transform (FLIP or otherwise). */
const shiftY = (el: Element | null) => (el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 || 0 : 0);

/**
 * Touch and hold a food row, then drag it, as in iOS's reorderable lists (Settings, the share
 * sheet): the row lifts and follows your finger, the other rows slide apart to open a gap where
 * it would land, in its meal or another one, and it settles into that gap when you let go.
 * A quick swipe still scrolls the page.
 */
function useMealDrag(root: RefObject<HTMLDivElement | null>, entries: FoodEntry[], onDrop: (d: Drop) => void) {
  const [drop, setDrop] = useState<Drop | null>(null);
  // Latest values for the touch handlers, which stay attached for the whole drag.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const before = useRef<Map<string, DOMRect> | null>(null);

  /** Remember where everything is, so the next render can slide it from there (FLIP). */
  const snapshot = useCallback(() => {
    const m = new Map<string, DOMRect>();
    root.current?.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => m.set(el.dataset.flip!, el.getBoundingClientRect()));
    before.current = m;
  }, [root]);

  // After each change of drop spot: rows slide to their new places, cards grow and shrink.
  useLayoutEffect(() => {
    const old = before.current;
    before.current = null;
    const box = root.current;
    if (!old || !box) return;
    const els = [...box.querySelectorAll<HTMLElement>('[data-flip]')];
    const now = new Map(els.map((el) => [el.dataset.flip!, el.getBoundingClientRect()]));
    for (const el of els) {
      const key = el.dataset.flip!;
      const o = old.get(key);
      const n = now.get(key)!;
      if (!o) continue;
      if (key.startsWith('c')) {
        const dy = o.top - n.top;
        el.style.transition = 'none';
        el.style.transform = dy ? `translateY(${dy}px)` : '';
        el.style.height = `${o.height}px`;
        void el.offsetHeight;
        el.style.transition = `transform ${SLIDE}, height ${SLIDE}`;
        el.style.transform = '';
        el.style.height = `${n.height}px`;
        window.setTimeout(() => {
          el.style.height = '';
          el.style.transition = '';
        }, 320);
      } else {
        // Rows move within their card; the card's own move is animated on the card.
        const card = el.closest<HTMLElement>('[data-flip^="c"]')?.dataset.flip;
        const oc = card ? old.get(card) : undefined;
        const nc = card ? now.get(card) : undefined;
        const dy = o.top - (oc?.top ?? 0) - (n.top - (nc?.top ?? 0));
        if (!dy) continue;
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        void el.offsetHeight;
        el.style.transition = `transform ${SLIDE}`;
        el.style.transform = '';
      }
    }
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const page = el.closest<HTMLElement>('.k-page') ?? el;
    let timer = 0;
    let start: { x: number; y: number; row: HTMLElement; id: number; offsetY: number } | null = null;
    let ghost: HTMLElement | null = null;
    let active = false;
    let current: Drop | null = null;
    let suppressClick = false;

    const move = (next: Drop) => {
      if (current && next.meal === current.meal && next.index === current.index) return;
      current = next;
      snapshot();
      setDrop(next);
    };
    /** The meal and place under the finger, from where rows sit (ignoring their slide animations). */
    const spotAt = (y: number, id: number, height: number): Drop | null => {
      let best: { meal: Meal; section: HTMLElement } | null = null;
      let bestD = Infinity;
      for (const section of el.querySelectorAll<HTMLElement>('[data-meal]')) {
        const card = section.querySelector<HTMLElement>('[data-flip^="c"]');
        if (!card) continue;
        const r = card.getBoundingClientRect();
        const top = r.top - shiftY(card);
        const d = y < top ? top - y : y > top + r.height ? y - top - r.height : 0;
        if (d < bestD) {
          bestD = d;
          best = { meal: section.dataset.meal as Meal, section };
        }
      }
      if (!best) return null;
      const card = best.section.querySelector<HTMLElement>('[data-flip^="c"]');
      const rows = [...best.section.querySelectorAll<HTMLElement>('[data-entry-id]')].filter((r) => Number(r.dataset.entryId) !== id);
      const index = rows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top - shiftY(r) - shiftY(card) + b.height / 2 < y;
      }).length;
      return { id, meal: best.meal, index, height };
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      start = null;
      active = false;
    };
    const activate = () => {
      if (!start) return;
      const entry = entriesRef.current.find((e) => e.id === start!.id);
      if (!entry) return;
      active = true;
      navigator.vibrate?.(10);
      const r = start.row.getBoundingClientRect();
      start.offsetY = start.y - r.top;
      ghost = start.row.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-flip');
      ghost.classList.add('meal-drag-ghost');
      Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, transform: '' });
      document.body.appendChild(ghost);
      // Its slot becomes the gap, right where it was.
      const same = entriesRef.current.filter((e) => e.meal === entry.meal && e.id !== entry.id).sort((a, b) => sortKey(a) - sortKey(b));
      const index = same.filter((e) => sortKey(e) < sortKey(entry)).length;
      current = null;
      move({ id: entry.id!, meal: entry.meal, index, height: r.height });
    };

    const onStart = (e: TouchEvent) => {
      const row = (e.target as Element).closest<HTMLElement>('[data-entry-id]');
      if (!row || e.touches.length !== 1 || ghost) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, row, id: Number(row.dataset.entryId), offsetY: 0 };
      timer = window.setTimeout(activate, 380);
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      if (!active) {
        // Moved before the hold finished: it's a scroll, not a drag.
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cleanup();
        return;
      }
      e.preventDefault();
      if (ghost) ghost.style.top = `${t.clientY - start.offsetY}px`;
      const spot = spotAt(t.clientY, start.id, current?.height ?? 52);
      if (spot) move(spot);
      // Scroll when dragging near the top or bottom edge.
      if (t.clientY < 140) page.scrollTop -= 10;
      else if (t.clientY > window.innerHeight - 160) page.scrollTop += 10;
    };
    const onEnd = () => {
      if (active && current && ghost) {
        const d = current;
        const g = ghost;
        ghost = null;
        suppressClick = true;
        window.setTimeout(() => (suppressClick = false), 400);
        // Settle into the gap, then put the food there for real.
        const gap = el.querySelector<HTMLElement>('[data-placeholder]')?.getBoundingClientRect();
        g.classList.add('is-dropping');
        if (gap) g.style.top = `${gap.top}px`;
        window.setTimeout(() => {
          g.remove();
          dropRef.current(d);
          before.current = null;
          setDrop(null);
        }, 200);
      } else if (ghost) {
        ghost.remove();
        ghost = null;
        setDrop(null);
      }
      current = null;
      cleanup();
    };
    const onCancel = () => {
      ghost?.remove();
      ghost = null;
      current = null;
      setDrop(null);
      cleanup();
    };
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    el.addEventListener('click', onClick, true);
    return () => {
      onCancel();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      el.removeEventListener('click', onClick, true);
    };
  }, [root, snapshot]);

  return drop;
}

export function FoodScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [date, setDate] = useState(today());
  const entries = useLiveQuery(() => entriesFor(date, db), [date]) ?? [];
  const [selected, setSelected] = useState<FoodEntry | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const slideMeals = useSlideSwap(listRef, date);
  const totals = sumEntries(entries);

  // A dropped food shows in its new place straight away, before the database catches up.
  const [moved, setMoved] = useState<{ id: number; meal: Meal; order: number } | null>(null);
  const shown = entries
    .map((e) => (moved && e.id === moved.id ? { ...e, meal: moved.meal, order: moved.order } : e))
    .sort((a, b) => sortKey(a) - sortKey(b));
  useEffect(() => {
    if (moved && entries.some((e) => e.id === moved.id && e.meal === moved.meal && e.order === moved.order)) setMoved(null);
  }, [entries, moved]);
  const place = useCallback(
    (d: Drop) => {
      // Between its new neighbours: halfway between their sort keys.
      const others = shown.filter((e) => e.meal === d.meal && e.id !== d.id);
      const prev = others[d.index - 1];
      const next = others[d.index];
      const order = prev && next ? (sortKey(prev) + sortKey(next)) / 2 : prev ? sortKey(prev) + 1 : next ? sortKey(next) - 1 : Date.now();
      setMoved({ id: d.id, meal: d.meal, order });
      void db.entries.update(d.id, { meal: d.meal, order });
    },
    [shown],
  );
  const drop = useMealDrag(listRef, shown, place);

  // Scan: add one serving straight to Other. Unknown barcodes open New Food with it filled in.
  const onCode = useCallback(
    async (code: string) => {
      try {
        const saved = await db.foods.where('barcode').equals(normalizeBarcode(code)).first();
        const food = saved ?? (await lookupBarcode(code, settings.usdaApiKey));
        if (!food) {
          nav.push({ name: 'addFood', date, barcode: code });
          return;
        }
        await logFood({ food, quantity: food.serving ? 1 : 100, unit: food.serving ? 'serving' : 'g', meal: 'unsorted', date }, db);
        toast(`Added ${food.name}`);
      } catch {
        toast('Couldn’t look that up. Check your connection.');
      }
    },
    [date, nav, settings.usdaApiKey, toast],
  );
  const [scan, scanner] = useScanner((c) => void onCode(c));

  const remove = async () => {
    if (selected?.id !== undefined) await db.entries.delete(selected.id);
    setSelected(null);
  };
  const duplicateToToday = async () => {
    if (!selected) return;
    const { id: _id, ...rest } = selected;
    await db.entries.add({ ...rest, date: today(), loggedAt: Date.now() });
    setSelected(null);
    toast('Added to today');
  };
  const moveSelected = async (meal: Meal) => {
    if (selected?.id !== undefined) await db.entries.update(selected.id, { meal });
    setSelected(null);
  };

  return (
    <Page className="tab-safe">
      <Header
        title={
          <DayTitle
            date={date}
            onChange={(d) => {
              // The meals slide: a later day comes in from the right, an earlier one from the left.
              slideMeals(d > date ? 1 : -1);
              setDate(d);
            }}
          />
        }
        right={
          <IconGroup
            items={[
              { label: 'Scan barcode', icon: <Sym name="barcode.viewfinder" size={16.5} />, onClick: scan },
              { label: 'Add food', icon: <Sym name="plus" size={18.3} />, onClick: () => nav.push({ name: 'addFood', date }) },
            ]}
          />
        }
      />

      <div className="fit-stack">
        <div className="fit-card is-plain">
          <MacroSummary totals={totals} settings={settings} />
        </div>
      </div>

      <div className="slide-clip">
      <div ref={listRef}>
        {MEALS.map((m) => {
          const items = shown.filter((e) => e.meal === m.id && e.id !== drop?.id);
          const gapHere = drop?.meal === m.id;
          if (m.id === 'unsorted' && items.length === 0 && !gapHere) return null;
          const kcal = sumEntries(items).kcal;
          const row = (e: FoodEntry, hidden = false) => (
            <button
              type="button"
              key={e.id}
              data-entry-id={hidden ? undefined : e.id}
              data-flip={hidden ? undefined : `e${e.id}`}
              className={`meal-row is-item meal-entry ${hidden ? 'is-dragged' : ''}`}
              onClick={() => setSelected(e)}
            >
              <span className="meal-row-name">{e.name}</span>
              <span className="meal-row-value tabular">{fmt(e.macros.kcal)} kcal</span>
            </button>
          );
          const rows: ReactNode[] = items.map((e) => row(e));
          // The gap where the dragged food would land.
          if (drop && gapHere) rows.splice(drop.index, 0, <div key="gap" data-placeholder className="meal-row is-gap" style={{ height: drop.height }} />);
          // The dragged row itself stays in the page, hidden: iOS keeps sending the touch to the
          // element you first touched, and a removed one would end the drag.
          const dragged = drop ? shown.find((e) => e.id === drop.id && e.meal === m.id) : undefined;
          if (dragged) rows.push(row(dragged, true));
          return (
            <div key={m.id} data-meal={m.id} className="meal-gap">
              <div className="meal-card" data-flip={`c${m.id}`}>
                <div className="meal-row is-head" data-flip={`h${m.id}`}>
                  <span className="meal-row-title">{m.label}</span>
                  {items.length > 0 && <span className="meal-row-value tabular">{fmt(kcal)} kcal</span>}
                  <button
                    type="button"
                    aria-label={`Add to ${m.label}`}
                    className="meal-add"
                    onClick={() => nav.push({ name: 'addFood', date, meal: m.id })}
                  >
                    <Sym name="plus" size={17} />
                  </button>
                </div>
                {items.length === 0 && !gapHere && (
                  <div className="meal-row is-empty" data-flip={`n${m.id}`}>
                    No Items
                  </div>
                )}
                {rows}
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {scanner}

      <Actions opened={!!selected} onBackdropClick={() => setSelected(null)}>
        <ActionsGroup>
          <ActionsLabel>{selected ? `${selected.name} · ${amountText(selected)} · ${fmt(selected.macros.protein)} g protein` : ''}</ActionsLabel>
          {MEALS.filter((m) => m.id !== selected?.meal).map((m) => (
            <ActionsButton key={m.id} onClick={() => void moveSelected(m.id)}>
              Move to {m.label}
            </ActionsButton>
          ))}
          {selected && selected.date !== today() && <ActionsButton onClick={() => void duplicateToToday()}>Log Again Today</ActionsButton>}
          <ActionsButton className="!text-[#ff453a]" onClick={() => void remove()}>
            Delete
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton bold onClick={() => setSelected(null)}>
            Cancel
          </ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
