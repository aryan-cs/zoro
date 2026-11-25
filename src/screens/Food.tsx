import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Block, BlockTitle, List, ListButton, ListItem, Navbar, Page } from 'konsta/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { addDays, carbTarget, sumEntries } from '../core/calc';
import { entriesFor, today } from '../core/store';
import type { FoodEntry, Meal } from '../core/types';
import { db, fmt, ProgressRow, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snacks' },
];

function dayLabel(date: string): string {
  const t = today();
  if (date === t) return 'Today';
  if (date === addDays(t, -1)) return 'Yesterday';
  return new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function FoodScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [date, setDate] = useState(today());
  const entries = useLiveQuery(() => entriesFor(date, db), [date]) ?? [];
  const [selected, setSelected] = useState<FoodEntry | null>(null);
  const totals = sumEntries(entries);
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const left = settings.kcalTarget - totals.kcal;

  const remove = async () => {
    if (selected?.id !== undefined) await db.entries.delete(selected.id);
    setSelected(null);
    toast('Removed');
  };
  const duplicateToToday = async () => {
    if (!selected) return;
    const { id: _id, ...rest } = selected;
    await db.entries.add({ ...rest, date: today(), loggedAt: Date.now() });
    setSelected(null);
    toast('Added to today');
  };

  return (
    <Page className="tab-safe">
      <Navbar large transparent centerTitle title="Food" />
      <div className="mx-4 mt-1 flex items-center justify-between">
        <button type="button" aria-label="Previous day" className="rounded-full p-2 text-[#007aff] active:opacity-60" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft />
        </button>
        <span className="text-[16px] font-semibold">{dayLabel(date)}</span>
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= today()}
          className="rounded-full p-2 text-[#007aff] active:opacity-60 disabled:opacity-25"
          onClick={() => setDate(addDays(date, 1))}
        >
          <ChevronRight />
        </button>
      </div>

      <Block strong inset className="!my-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[15px] text-black/50 dark:text-white/55">{left >= 0 ? 'Calories left' : 'Over by'}</span>
          <span className={`tabular text-[28px] font-bold ${left < 0 ? 'text-[#ff3b30]' : ''}`}>{fmt(Math.abs(left))}</span>
        </div>
        <ProgressRow label="Calories" value={totals.kcal} target={settings.kcalTarget} color="#ff9500" />
        <ProgressRow label="Protein" value={totals.protein} target={settings.proteinTarget} unit="g" color="#34c759" />
        <ProgressRow label="Carbs" value={totals.carbs} target={carbs} unit="g" color="#007aff" />
        <ProgressRow label="Fat" value={totals.fat} target={settings.fatTarget} unit="g" color="#af52de" />
      </Block>

      {MEALS.map((m) => {
        const items = entries.filter((e) => e.meal === m.id);
        const t = sumEntries(items);
        return (
          <div key={m.id}>
            <BlockTitle className="flex justify-between">
              <span>{m.label}</span>
              {items.length > 0 && (
                <span className="tabular text-[13px] font-normal text-black/50 dark:text-white/55">
                  {fmt(t.kcal)} kcal · {fmt(t.protein)} g protein
                </span>
              )}
            </BlockTitle>
            <List strong inset dividers className="!my-2">
              {items.map((e) => (
                <ListItem
                  key={e.id}
                  link
                  chevron={false}
                  title={e.name}
                  subtitle={`${e.unit === 'g' ? `${fmt(e.quantity)} g` : `${fmt(e.quantity, e.quantity % 1 ? 1 : 0)} serving${e.quantity === 1 ? '' : 's'}`} · ${fmt(e.macros.protein)} g protein`}
                  after={<span className="tabular">{fmt(e.macros.kcal)}</span>}
                  onClick={() => setSelected(e)}
                />
              ))}
              <ListButton onClick={() => nav.push({ name: 'addFood', meal: m.id, date })}>Add food</ListButton>
            </List>
          </div>
        );
      })}

      <Block className="text-[12px] text-black/40 dark:text-white/45">
        Food data from Open Food Facts (ODbL) and USDA FoodData Central.
      </Block>

      <Actions opened={!!selected} onBackdropClick={() => setSelected(null)}>
        <ActionsGroup>
          <ActionsLabel>{selected?.name}</ActionsLabel>
          {selected && selected.date !== today() && <ActionsButton onClick={() => void duplicateToToday()}>Log again today</ActionsButton>}
          <ActionsButton className="!text-[#ff3b30]" onClick={() => void remove()}>
            Remove
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
