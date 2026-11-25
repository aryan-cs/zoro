import { useLiveQuery } from 'dexie-react-hooks';
import { Block, List, ListItem, Page, Preloader, Searchbar, Stepper } from 'konsta/react';
import { PenLine, ScanBarcode, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { lookupBarcode, normalizeBarcode, searchOff, searchUsda, USDA_DEMO_KEY } from '../core/food';
import { logFood, macrosFor, quickAdd, recentFoods, searchLocalFoods, upsertFood } from '../core/store';
import type { FoodItem, ISODate, Macros, Meal } from '../core/types';
import { Btn, db, dim, Field, fmt, GlassSheet, Header, Row, Section, Seg, SheetPage, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { Scanner } from '../ui/Scanner';
import { MEALS } from './Food';
const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function FoodRow({ food, onPick }: { food: FoodItem; onPick: (f: FoodItem) => void }) {
  const basis = food.serving ? food.serving.macros : food.per100g;
  return (
    <ListItem
      link
      chevron={false}
      title={<span className="block break-words">{food.name}</span>}
      subtitle={[food.brand, food.serving ? food.serving.label : `100 ${food.liquid ? 'ml' : 'g'}`].filter(Boolean).join(' · ')}
      after={
        basis && (
          <div className="text-right">
            <div className="tabular">{fmt(basis.kcal)} kcal</div>
            <div className="tabular text-[13px]">
              P {fmt(basis.protein)} · C {fmt(basis.carbs)} · F {fmt(basis.fat)}
            </div>
          </div>
        )
      }
      onClick={() => onPick(food)}
      innerClassName="!py-2 [&>.text-sm]:text-[15px] [&>.text-sm]:text-[rgba(235,235,245,0.6)]"
      titleWrapClassName="min-w-0 gap-3 [&>div:first-child]:min-w-0"
      strongTitle={false}
    />
  );
}

/** Pick an amount and log it. */
function AmountSheet({ food, meal, date, onClose, onLogged }: { food: FoodItem | null; meal: Meal; date: ISODate; onClose: () => void; onLogged: () => void }) {
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

  return (
    <GlassSheet opened={!!food} onClose={onClose}>
      {food && macros && (
        <div className="px-4 pt-3">
          <div className="text-[17px] font-semibold leading-snug">{food.name}</div>
          {food.brand && <div className={`text-[13px] ${dim}`}>{food.brand}</div>}
          {canServing && canGrams && (
            <Seg
              className="mt-3"
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
          <List strong className="!my-3">
            <ListItem
              contentClassName="!ps-0"
              innerClassName="!pe-0"
              title={unit === 'g' ? (g === 'ml' ? 'Milliliters' : 'Grams') : 'Servings'}
              subtitle={unit === 'serving' ? (food.serving?.label ?? `100 ${g}`) : undefined}
              titleWrapClassName="min-w-0 flex-1 overflow-hidden"
              after={
                <Stepper
                  rounded
                  colors={{ fillBgIos: 'bg-[rgba(118,118,128,0.24)] active:bg-white/20', fillTextIos: 'text-white' }}
                  input
                  inputType="number"
                  value={qty as unknown as number}
                  onInput={(e: React.ChangeEvent<HTMLInputElement>) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
                  onMinus={() => setQty(String(Math.max(0, Math.round((num(qty) - step) * 10) / 10)))}
                  onPlus={() => setQty(String(Math.round((num(qty) + step) * 10) / 10))}
                />
              }
            />
          </List>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {(
              [
                ['Calories', macros.kcal, ''],
                ['Protein', macros.protein, 'g'],
                ['Carbs', macros.carbs, 'g'],
                ['Fat', macros.fat, 'g'],
              ] as const
            ).map(([label, v, u]) => (
              <div key={label} className="surface rounded-2xl py-2">
                <div className="tabular text-[17px] font-semibold">
                  {fmt(v, v > 0 && v < 10 && u ? 1 : 0)}
                  <span className="text-[13px] font-normal">{u}</span>
                </div>
                <div className={`text-[13px] ${dim}`}>{label}</div>
              </div>
            ))}
          </div>
          <Btn kind="tint" size="lg" className="mt-4" disabled={!(num(qty) > 0)} onClick={() => void add()}>
            Add to {MEALS.find((m) => m.id === meal)?.label}
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
        <Field label="Serving weight (g)" inputMode="decimal" placeholder="Optional" value={f.grams} onChange={set('grams')} />
      </Section>
      <Section title="Per serving">
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

function QuickAddSheet({ opened, meal, date, onClose, onDone }: { opened: boolean; meal: Meal; date: ISODate; onClose: () => void; onDone: () => void }) {
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
      <div className="mx-4 mt-4">
        <Btn kind="tint" size="lg" disabled={!f.kcal} onClick={() => void save()}>
          Add
        </Btn>
      </div>
    </SheetPage>
  );
}

export function AddFoodScreen({ meal, date }: { meal: Meal; date: ISODate }) {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<{ off: FoodItem[]; usda: FoodItem[]; branded: FoodItem[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [quick, setQuick] = useState(false);
  const [custom, setCustom] = useState<{ barcode?: string } | null>(null);

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

  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? 'Food';
  const list = (foods: FoodItem[], prefix: string) => foods.map((f) => <FoodRow key={`${prefix}:${f.id ?? f.sourceId ?? f.name}`} food={f} onPick={setPicked} />);

  return (
    <Page className="tab-safe">
      <Header title={`Add to ${mealLabel}`} onBack={nav.pop}>
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
            void search();
          }}
        >
          <Searchbar
            placeholder="Search foods"
            value={q}
            onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQ(e.target.value);
              setOnline(null);
            }}
            onClear={() => {
              setQ('');
              setOnline(null);
            }}
            disableButton
            onDisable={() => {
              setQ('');
              setOnline(null);
            }}
          />
        </form>
      </Header>

      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ['Scan', ScanBarcode, () => setScanning(true)],
            ['Quick Add', Zap, () => setQuick(true)],
            ['New Food', PenLine, () => setCustom({})],
          ] as const
        ).map(([label, Icon, onClick]) => (
          <Btn key={label} className="!px-2 !text-[15px]" onClick={onClick}>
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Btn>
        ))}
      </div>

      {loading && (
        <div className="mt-4 text-center">
          <Preloader />
        </div>
      )}

      <Section title={q.trim() ? 'Your foods' : 'Recent'}>
        {local.length ? list(local, 'local') : <Row title={q.trim() ? 'No saved matches' : 'No recent foods'} />}
        {q.trim() && !online && !loading && <Row accent title="Search Online" onClick={() => void search()} />}
      </Section>

      {error && <Block role="status" className="!my-3 text-[#ff453a]">{error}</Block>}
      {online && (
        <>
          <Section title="Basic foods · USDA">{online.usda.length ? list(online.usda, 'usda') : <Row title="No matches" />}</Section>
          <Section title="Packaged foods">
            {online.branded.length || online.off.length ? (
              <>
                {list(online.branded, 'usdab')}
                {list(online.off, 'off')}
              </>
            ) : (
              <Row title="No matches" />
            )}
          </Section>
        </>
      )}

      <AmountSheet food={picked} meal={meal} date={date} onClose={() => setPicked(null)} onLogged={logged} />
      <Scanner opened={scanning} onClose={() => setScanning(false)} onCode={onCode} />
      <QuickAddSheet
        opened={quick}
        meal={meal}
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
