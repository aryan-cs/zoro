import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, Block, ListItem, Page, Preloader } from 'konsta/react';
import { SearchField } from '../ui/bars';
import { Sym } from '../ui/Sym';
import { useCallback, useEffect, useState } from 'react';
import { BUILTIN_FOODS } from '../core/builtinFoods';
import { lookupBarcode, normalizeBarcode, searchOff, searchUsda, USDA_DEMO_KEY } from '../core/food';
import { logFood, macrosFor, quickAdd, recentFoods, searchLocalFoods, upsertFood } from '../core/store';
import type { FoodItem, ISODate, Macros, Meal } from '../core/types';
import { Btn, db, Field, FITNESS, fmt, GlassSheet, Header, IconGroup, Row, Section, Seg, SheetPage, useSettings, useToast, EmptyRow } from '../ui/kit';
import { useNav } from '../ui/nav';
import { Scanner } from '../ui/Scanner';
import { MEALS } from './Food';
const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/** "Meal  Other ⌃⌄": optional; food without a meal goes to Other. */
function MealRow({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <ListItem
      title="Meal"
      innerClassName="zoro-row-inner"
      titleWrapClassName="zoro-row-title"
      after={
        <label className="ios-popup">
          {MEALS.find((m) => m.id === value)?.label}
          <Sym name="chevron.up.chevron.down" size={13} />
          <select aria-label="Meal" value={value} onChange={(e) => onChange(e.target.value as Meal)}>
            {MEALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}

/** Serving labels as stored, without the EU estimated-quantity mark ("400 g e", "400 g ℮"). */
const cleanServing = (label: string) => label.replace(/\s*(℮|\be)(?=\)|$)/gu, '');

/** One line per food, like Apple's lists: the name, and its calories on the right. */
function FoodRow({ food, onPick }: { food: FoodItem; onPick: (f: FoodItem) => void }) {
  const basis = food.serving ? food.serving.macros : food.per100g;
  return (
    <li className="food-li">
      <button type="button" className="food-row" onClick={() => onPick(food)}>
        <span className="food-row-name">{food.name}</span>
        {basis && <span className="food-row-kcal tabular">{fmt(basis.kcal)} kcal</span>}
      </button>
    </li>
  );
}

/** Pick an amount and log it. */
function AmountSheet({ food, meal, onMeal, date, onClose, onLogged }: { food: FoodItem | null; meal: Meal; onMeal: (m: Meal) => void; date: ISODate; onClose: () => void; onLogged: () => void }) {
  const [unit, setUnit] = useState<'serving' | 'g'>('serving');
  const [qty, setQty] = useState('1');
  useEffect(() => {
    if (!food) return;
    const u = food.serving ? 'serving' : 'g';
    setUnit(u);
    setQty(u === 'g' ? '100' : '1');
  }, [food]);
  const macros = food ? macrosFor(food, num(qty), unit) : null;
  const canServing = !!food?.serving;
  const canGrams = !!food?.per100g || !!food?.serving?.grams;
  const g = food?.liquid ? 'ml' : 'g';
  const step = unit === 'g' ? 10 : 0.5;

  const add = async () => {
    if (!food || num(qty) <= 0) return;
    await logFood({ food, quantity: num(qty), unit, meal, date }, db);
    onLogged();
  };

  const nudge = (d: number) => setQty(String(Math.max(0, Math.round((num(qty) + d) * 10) / 10)));
  const unitLabel = unit === 'g' ? g : num(qty) === 1 ? 'serving' : 'servings';

  return (
    <GlassSheet opened={!!food} onClose={onClose}>
      {food && macros && (
        <div className="amt">
          <div className="amt-head">
            <div className="amt-name">{food.name}</div>
            {food.brand && <div className="amt-brand">{food.brand}</div>}
          </div>
          {canServing && canGrams && (
            <Seg
              value={unit}
              onChange={(u) => {
                setUnit(u);
                setQty(u === 'g' ? String(food.serving?.grams ?? 100) : '1');
              }}
              options={[
                ['serving', 'Servings'],
                ['g', g === 'ml' ? 'Milliliters' : 'Grams'],
              ]}
            />
          )}

          {/* Amount: the number itself is the field (tap to type), with round glass − and + beside it. */}
          <div className="amt-dial">
            <button type="button" aria-label="Less" className="amt-step" onClick={() => nudge(-step)}>
              <Sym name="minus.medium" size={18} />
            </button>
            <label className="amt-value">
              <input
                inputMode="decimal"
                aria-label={unit === 'g' ? (g === 'ml' ? 'Milliliters' : 'Grams') : 'Servings'}
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
                onFocus={(e) => e.target.select()}
              />
              <span>{unitLabel}</span>
            </label>
            <button type="button" aria-label="More" className="amt-step" onClick={() => nudge(step)}>
              <Sym name="plus.medium" size={18} />
            </button>
          </div>
          {unit === 'serving' && food.serving && <div className="amt-serving">{cleanServing(food.serving.label)}</div>}

          <div className="amt-macros">
            {(
              [
                ['Calories', macros.kcal, 'KCAL', FITNESS.move],
                ['Protein', macros.protein, 'G', FITNESS.exercise],
                ['Carbs', macros.carbs, 'G', FITNESS.carbs],
                ['Fat', macros.fat, 'G', FITNESS.steps],
              ] as const
            ).map(([label, v, u, color]) => (
              <div key={label}>
                <div className="amt-macro-label">{label}</div>
                <div className="amt-macro-value" style={{ color }}>
                  {fmt(v, v > 0 && v < 10 && u === 'G' ? 1 : 0)}
                  <small>{u}</small>
                </div>
              </div>
            ))}
          </div>

          <label className="amt-card amt-row">
            <span>Meal</span>
            <span className="ios-popup">
              {MEALS.find((m) => m.id === meal)?.label}
              <Sym name="chevron.up.chevron.down" size={13} />
              <select aria-label="Meal" value={meal} onChange={(e) => onMeal(e.target.value as Meal)}>
                {MEALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <Btn kind="tint" size="lg" className="mt-4" disabled={!(num(qty) > 0)} onClick={() => void add()}>
            Add
          </Btn>
        </div>
      )}
    </GlassSheet>
  );
}

/** Make your own food (for things without a barcode, or a barcode neither database knows). */
function CustomFoodSheet({ opened, barcode, onClose, onCreated }: { opened: boolean; barcode?: string; onClose: () => void; onCreated: (f: FoodItem) => void }) {
  const blank = { name: '', brand: '', serving: '1 serving', grams: '', kcal: '', protein: '', carbs: '', fat: '' };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    if (!f.name.trim() || !f.kcal) return;
    const macros: Macros = { kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) };
    const grams = num(f.grams) || undefined;
    const food: FoodItem = {
      name: f.name.trim(),
      brand: f.brand.trim() || undefined,
      barcode: barcode ? normalizeBarcode(barcode) : undefined,
      serving: { label: f.serving || '1 serving', grams, macros },
      per100g: grams ? { kcal: (macros.kcal * 100) / grams, protein: (macros.protein * 100) / grams, carbs: (macros.carbs * 100) / grams, fat: (macros.fat * 100) / grams } : undefined,
      source: 'custom',
      sourceId: `custom:${Date.now()}`,
      updatedAt: Date.now(),
    };
    const id = await upsertFood(food, db);
    setF(blank);
    onCreated({ ...food, id });
  };
  return (
    <SheetPage opened={opened} onClose={onClose} title="New Food">
      {barcode && <Section><Row title="Barcode" right={barcode} /></Section>}
      <Section>
        <Field label="Name" placeholder="Protein bar" value={f.name} onChange={set('name')} wide />
        <Field label="Brand" placeholder="Optional" value={f.brand} onChange={set('brand')} wide />
        <Field label="Serving" placeholder="1 bar" value={f.serving} onChange={set('serving')} />
        <Field label="Serving Weight (g)" inputMode="decimal" placeholder="Optional" value={f.grams} onChange={set('grams')} />
      </Section>
      <Section title="Per Serving">
        <Field label="Calories" inputMode="decimal" value={f.kcal} onChange={set('kcal')} />
        <Field label="Protein (g)" inputMode="decimal" value={f.protein} onChange={set('protein')} />
        <Field label="Carbs (g)" inputMode="decimal" value={f.carbs} onChange={set('carbs')} />
        <Field label="Fat (g)" inputMode="decimal" value={f.fat} onChange={set('fat')} />
      </Section>
      <div className="mx-4 mt-4">
        <Btn kind="tint" size="lg" disabled={!f.name.trim() || !f.kcal} onClick={() => void save()}>
          Save Food
        </Btn>
      </div>
    </SheetPage>
  );
}

function QuickAddSheet({ opened, meal, onMeal, date, onClose, onDone }: { opened: boolean; meal: Meal; onMeal: (m: Meal) => void; date: ISODate; onClose: () => void; onDone: () => void }) {
  const blank = { name: '', kcal: '', protein: '', carbs: '', fat: '' };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    if (!f.kcal) return;
    await quickAdd(f.name.trim() || 'Quick add', { kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) }, meal, date, db);
    setF(blank);
    onDone();
  };
  return (
    <SheetPage opened={opened} onClose={onClose} title="Quick Add">
      <Section>
        <Field label="Name" placeholder="Optional" value={f.name} onChange={set('name')} wide />
        <Field label="Calories" inputMode="decimal" value={f.kcal} onChange={set('kcal')} />
        <Field label="Protein (g)" inputMode="decimal" value={f.protein} onChange={set('protein')} />
        <Field label="Carbs (g)" inputMode="decimal" value={f.carbs} onChange={set('carbs')} />
        <Field label="Fat (g)" inputMode="decimal" value={f.fat} onChange={set('fat')} />
      </Section>
      <Section>
        <MealRow value={meal} onChange={onMeal} />
      </Section>
      <div className="mx-4 mt-4">
        <Btn kind="tint" size="lg" disabled={!f.kcal} onClick={() => void save()}>
          Add
        </Btn>
      </div>
    </SheetPage>
  );
}

export function AddFoodScreen({ meal: initialMeal, date, barcode }: { meal?: Meal; date: ISODate; barcode?: string }) {
  const nav = useNav();
  const [meal, setMeal] = useState<Meal>(initialMeal ?? 'unsorted');
  const toast = useToast();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<{ off: FoodItem[]; usda: FoodItem[]; branded: FoodItem[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [quick, setQuick] = useState(false);
  // Two bar buttons (scan, +) keep the title centered; + opens the other ways to add.
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState<{ barcode?: string } | null>(null);
  // Arrived from a scan that found nothing: go straight to entering it from the label.
  useEffect(() => {
    if (barcode) setCustom({ barcode });
  }, [barcode]);

  const local = useLiveQuery(() => (q.trim() ? searchLocalFoods(q, db) : recentFoods(25, db)), [q]) ?? [];
  const key = settings.usdaApiKey || USDA_DEMO_KEY;

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    const [off, usda, branded] = await Promise.allSettled([
      searchOff(q),
      searchUsda(q, key),
      settings.usdaApiKey ? searchUsda(q, settings.usdaApiKey, undefined, true) : Promise.resolve([]),
    ]);
    const ok = <T,>(r: PromiseSettledResult<T[]>) => (r.status === 'fulfilled' ? r.value : []);
    setOnline({ off: ok(off), usda: ok(usda), branded: ok(branded) });
    if (usda.status === 'rejected' && String(usda.reason).includes('USDA_LIMIT')) setError("USDA limit reached. Add a key in Settings.");
    else if (off.status === 'rejected' && usda.status === 'rejected') setError('Search failed. Try again.');
    setLoading(false);
  };

  const onCode = useCallback(
    async (code: string) => {
      setScanning(false);
      setLoading(true);
      try {
        const saved = await db.foods.where('barcode').equals(normalizeBarcode(code)).first();
        const food = saved ?? (await lookupBarcode(code, settings.usdaApiKey));
        if (food) setPicked(food);
        else setCustom({ barcode: code });
      } catch {
        toast('Lookup failed. Check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [toast, settings.usdaApiKey],
  );

  const logged = () => {
    setPicked(null);
    toast('Added');
    nav.pop();
  };

  const list = (foods: FoodItem[], prefix: string) => foods.map((f) => <FoodRow key={`${prefix}:${f.id ?? f.sourceId ?? f.name}`} food={f} onPick={setPicked} />);

  return (
    <Page className="tab-safe">
      <Header
        title="Add Food"
        onBack={nav.pop}
        right={
          <IconGroup
            items={[
              { label: 'Scan barcode', icon: <Sym name="barcode.viewfinder" size={16.5} />, onClick: () => setScanning(true) },
              { label: 'More ways to add', icon: <Sym name="plus" size={18.3} />, onClick: () => setMenu(true) },
            ]}
          />
        }
      >
        <SearchField
          value={q}
          placeholder="Search foods"
          onChange={(v) => {
            setQ(v);
            setOnline(null);
          }}
          onSubmit={() => void search()}
        />
      </Header>

      {loading && (
        <div className="mt-4 text-center">
          <Preloader />
        </div>
      )}

      <Section title={q.trim() ? 'Your Foods' : 'Recent'}>
        {local.length ? list(local, 'local') : <EmptyRow>{q.trim() ? 'No Saved Matches' : 'No Recent Foods'}</EmptyRow>}
        {q.trim() && !online && !loading && <Row accent title="Search Online" onClick={() => void search()} />}
      </Section>
      {!q.trim() && <Section title="Common Foods">{list(BUILTIN_FOODS, 'builtin')}</Section>}

      {error && <Block role="status" className="!my-3 text-[#ff453a]">{error}</Block>}
      {online && (
        <>
          <Section title="Basic Foods · USDA">{online.usda.length ? list(online.usda, 'usda') : <EmptyRow>No Matches</EmptyRow>}</Section>
          <Section title="Packaged Foods">
            {online.branded.length || online.off.length ? (
              <>
                {list(online.branded, 'usdab')}
                {list(online.off, 'off')}
              </>
            ) : (
              <EmptyRow>No Matches</EmptyRow>
            )}
          </Section>
        </>
      )}

      <AmountSheet food={picked} meal={meal} onMeal={setMeal} date={date} onClose={() => setPicked(null)} onLogged={logged} />
      <Scanner opened={scanning} onClose={() => setScanning(false)} onCode={onCode} />
      <Actions opened={menu} onBackdropClick={() => setMenu(false)}>
        <ActionsGroup>
          <ActionsButton
            onClick={() => {
              setMenu(false);
              setQuick(true);
            }}
          >
            Quick Add Calories
          </ActionsButton>
          <ActionsButton
            onClick={() => {
              setMenu(false);
              setCustom({});
            }}
          >
            New Food
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton bold onClick={() => setMenu(false)}>
            Cancel
          </ActionsButton>
        </ActionsGroup>
      </Actions>
      <QuickAddSheet
        opened={quick}
        meal={meal}
        onMeal={setMeal}
        date={date}
        onClose={() => setQuick(false)}
        onDone={() => {
          setQuick(false);
          toast('Added');
          nav.pop();
        }}
      />
      <CustomFoodSheet
        opened={!!custom}
        barcode={custom?.barcode}
        onClose={() => setCustom(null)}
        onCreated={(f) => {
          setCustom(null);
          setPicked(f);
        }}
      />
    </Page>
  );
}
