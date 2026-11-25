import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { Sym } from '../ui/Sym';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { addDays, sumEntries } from '../core/calc';
import { lookupBarcode, normalizeBarcode } from '../core/food';
import { entriesFor, logFood, today } from '../core/store';
import type { FoodEntry, Meal } from '../core/types';
import { db, fmt, Header, IconGroup, MacroSummary, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { Scanner } from '../ui/Scanner';

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

/**
 * Touch and hold a food row, then drag it onto another meal, like reordering in iOS lists.
 * The row lifts after a short hold; a quick swipe still scrolls the page normally.
 */
function useMealDrag(root: RefObject<HTMLDivElement | null>, onDrop: (entryId: number, meal: Meal) => void) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const page = el.closest<HTMLElement>('.k-page') ?? el;
    let timer = 0;
    let start: { x: number; y: number; row: HTMLElement; id: number; offsetY: number } | null = null;
    let ghost: HTMLElement | null = null;
    let target: HTMLElement | null = null;
    let active = false;
    let suppressClick = false;

    const setTarget = (t: HTMLElement | null) => {
      if (t === target) return;
      target?.classList.remove('meal-drop-target');
      target = t;
      target?.classList.add('meal-drop-target');
    };
    const sectionAt = (y: number) =>
      [...el.querySelectorAll<HTMLElement>('[data-meal]')].find((s) => {
        const b = s.getBoundingClientRect();
        return y >= b.top && y <= b.bottom;
      }) ?? null;
    const finish = () => {
      window.clearTimeout(timer);
      ghost?.remove();
      ghost = null;
      start?.row.classList.remove('meal-drag-source');
      setTarget(null);
      start = null;
      active = false;
    };
    const activate = () => {
      if (!start) return;
      active = true;
      const r = start.row.getBoundingClientRect();
      start.offsetY = start.y - r.top;
      ghost = start.row.cloneNode(true) as HTMLElement;
      ghost.classList.add('meal-drag-ghost');
      Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
      document.body.appendChild(ghost);
      start.row.classList.add('meal-drag-source');
      setTarget(sectionAt(start.y));
    };

    const onStart = (e: TouchEvent) => {
      const row = (e.target as Element).closest<HTMLElement>('[data-entry-id]');
      if (!row || e.touches.length !== 1) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, row, id: Number(row.dataset.entryId), offsetY: 0 };
      timer = window.setTimeout(activate, 380);
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      if (!active) {
        // Moved before the hold finished: it's a scroll, not a drag.
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) finish();
        return;
      }
      e.preventDefault();
      if (ghost) ghost.style.top = `${t.clientY - start.offsetY}px`;
      setTarget(sectionAt(t.clientY));
      // Scroll when dragging near the top or bottom edge.
      if (t.clientY < 140) page.scrollTop -= 10;
      else if (t.clientY > window.innerHeight - 160) page.scrollTop += 10;
    };
    const onEnd = () => {
      if (active && start) {
        const meal = target?.dataset.meal as Meal | undefined;
        if (meal) onDrop(start.id, meal);
        suppressClick = true;
        window.setTimeout(() => (suppressClick = false), 400);
      }
      finish();
    };
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', finish);
    el.addEventListener('click', onClick, true);
    return () => {
      finish();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', finish);
      el.removeEventListener('click', onClick, true);
    };
  }, [root, onDrop]);
}

export function FoodScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [date, setDate] = useState(today());
  const entries = useLiveQuery(() => entriesFor(date, db), [date]) ?? [];
  const [selected, setSelected] = useState<FoodEntry | null>(null);
  const [scanning, setScanning] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const totals = sumEntries(entries);

  const move = useCallback((id: number, meal: Meal) => void db.entries.update(id, { meal }), []);
  useMealDrag(listRef, move);

  // Scan: add one serving straight to Other. Unknown barcodes open New Food with it filled in.
  const onCode = useCallback(
    async (code: string) => {
      setScanning(false);
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
        toast('Lookup failed. Check your connection.');
      }
    },
    [date, nav, settings.usdaApiKey, toast],
  );

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
        title={<DayTitle date={date} onChange={setDate} />}
        right={
          <IconGroup
            items={[
              { label: 'Scan barcode', icon: <Sym name="barcode.viewfinder" size={16.5} />, onClick: () => setScanning(true) },
              { label: 'Add food', icon: <Sym name="plus" size={16.5} />, onClick: () => nav.push({ name: 'addFood', date }) },
            ]}
          />
        }
      />

      <div className="fit-stack">
        <div className="fit-card">
          <MacroSummary totals={totals} settings={settings} />
        </div>
      </div>

      <div ref={listRef}>
        {MEALS.map((m) => {
          const items = entries.filter((e) => e.meal === m.id);
          if (m.id === 'unsorted' && items.length === 0) return null;
          const kcal = sumEntries(items).kcal;
          return (
            <div key={m.id} data-meal={m.id} className="meal-gap">
              <div className="meal-card">
                <div className="meal-row is-head">
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
                {items.length === 0 && <div className="meal-row is-empty">No Items</div>}
                {items.map((e) => (
                  <button type="button" key={e.id} data-entry-id={e.id} className="meal-row is-item meal-entry" onClick={() => setSelected(e)}>
                    <span className="meal-row-text">
                      <span className="meal-row-title">{e.name}</span>
                      <span className="meal-row-sub">
                        {amountText(e)} · {fmt(e.macros.protein)} g protein
                      </span>
                    </span>
                    <span className="meal-row-value tabular">{fmt(e.macros.kcal)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Scanner opened={scanning} onClose={() => setScanning(false)} onCode={(c) => void onCode(c)} />

      <Actions opened={!!selected} onBackdropClick={() => setSelected(null)}>
        <ActionsGroup>
          <ActionsLabel>{selected?.name}</ActionsLabel>
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
