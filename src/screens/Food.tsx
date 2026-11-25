import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { addDays, sumEntries } from '../core/calc';
import { entriesFor, today } from '../core/store';
import type { FoodEntry, Meal } from '../core/types';
import { Cell, db, dim, fmt, Header, IconBtn, MacroSummary, Note, Row, Section, useSettings, useToast } from '../ui/kit';
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

export const amountText = (e: FoodEntry) =>
  e.unit === 'g' ? `${fmt(e.quantity)} ${e.liquid ? 'ml' : 'g'}` : `${fmt(e.quantity, e.quantity % 1 ? 1 : 0)} serving${e.quantity === 1 ? '' : 's'}`;

export function FoodScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [date, setDate] = useState(today());
  const entries = useLiveQuery(() => entriesFor(date, db), [date]) ?? [];
  const [selected, setSelected] = useState<FoodEntry | null>(null);
  const totals = sumEntries(entries);

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
      <Header
        title={dayLabel(date)}
        left={
          <IconBtn label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft className="h-5 w-5" />
          </IconBtn>
        }
        right={
          <IconBtn label="Next day" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight className="h-5 w-5" />
          </IconBtn>
        }
      />

      <Section>
        <Cell>
          <MacroSummary totals={totals} settings={settings} />
        </Cell>
      </Section>

      {MEALS.map((m) => {
        const items = entries.filter((e) => e.meal === m.id);
        const t = sumEntries(items);
        return (
          <Section
            key={m.id}
            title={m.label}
            right={items.length > 0 ? <span className={`tabular text-[13px] ${dim}`}>{fmt(t.kcal)} kcal · {fmt(t.protein)} g protein</span> : undefined}
          >
            {items.map((e) => (
              <Row key={e.id} title={e.name} sub={`${amountText(e)} · ${fmt(e.macros.protein)} g protein`} right={fmt(e.macros.kcal)} onClick={() => setSelected(e)} />
            ))}
            <Row accent title="Add food" onClick={() => nav.push({ name: 'addFood', meal: m.id, date })} />
          </Section>
        );
      })}

      <Note className="mt-4 text-center">Food data from USDA FoodData Central and Open Food Facts (ODbL).</Note>

      <Actions opened={!!selected} onBackdropClick={() => setSelected(null)}>
        <ActionsGroup>
          <ActionsLabel>{selected?.name}</ActionsLabel>
          {selected && selected.date !== today() && <ActionsButton onClick={() => void duplicateToToday()}>Log again today</ActionsButton>}
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
