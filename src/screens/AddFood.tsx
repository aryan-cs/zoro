import { useLiveQuery } from 'dexie-react-hooks';
import { ListItem, Page, Preloader, Searchbar } from 'konsta/react';
import { Minus, PenLine, Plus, ScanBarcode, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { lookupBarcode, normalizeBarcode, searchOff, searchUsda, USDA_DEMO_KEY } from '../core/food';
import { logFood, macrosFor, quickAdd, recentFoods, searchLocalFoods, upsertFood } from '../core/store';
import type { FoodItem, ISODate, Macros, Meal } from '../core/types';
import { Btn, db, dim, Field, fmt, GlassSheet, Header, Note, Row, Section, Seg, SheetPage, useSettings, useToast } from '../ui/kit';
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
      title={food.name}
      subtitle={[food.brand, food.serving ? food.serving.label : `100 ${food.liquid ? 'ml' : 'g'}`].filter(Boolean).join(' · ')}
      after={
        basis && (
          <div className="text-right">
            <div className="tabular">{fmt(basis.kcal)} kcal</div>
            <div className="tabular text-[12px]">
              P {fmt(basis.protein)} · C {fmt(basis.carbs)} · F {fmt(basis.fat)}
            </div>
          </div>
        )
      }
      onClick={() => onPick(food)}
      innerClassName="!py-2"
      titleWrapClassName="min-w-0"
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
  const allZero = !!food && [food.per100g, food.serving?.macros].every((m) => !m || (m.kcal === 0 && m.protein === 0 && m.carbs === 0 && m.fat === 0));

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
          <div className={`text-[13px] ${dim}`}>
            {[food.brand, food.source === 'usda' ? 'USDA' : food.source === 'off' ? 'Open Food Facts' : null].filter(Boolean).join(' · ')}
          </div>
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
          <div className="surface mt-3 flex items-center gap-2 rounded-2xl px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className={`text-[12px] ${dim}`}>{unit === 'g' ? (g === 'ml' ? 'Milliliters' : 'Grams') : 'Servings'}</div>
              <div className="truncate text-[12px]">{unit === 'serving' ? (food.serving?.label ?? `100 ${g}`) : `per 100 ${g}: ${fmt(food.per100g?.kcal ?? 0)} kcal`}</div>
            </div>
            <Btn size="sm" className="!w-8 !px-0" onClick={() => setQty(String(Math.max(0, Math.round((num(qty) - step) * 10) / 10)))}>
              <Minus className="h-4 w-4" />
            </Btn>
            <input
              aria-label="Amount"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
              onFocus={(e) => e.target.select()}
              className="tabular w-16 rounded-lg bg-[rgba(118,118,128,0.24)] py-1 text-center font-semibold outline-none"
            />
            <Btn size="sm" className="!w-8 !px-0" onClick={() => setQty(String(Math.round((num(qty) + step) * 10) / 10))}>
              <Plus className="h-4 w-4" />
            </Btn>
          </div>
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
                  <span className="text-[11px] font-normal">{u}</span>
                </div>
                <div className={`text-[11px] ${dim}`}>{label}</div>
              </div>
            ))}
          </div>
          {allZero && <div className={`mt-2 text-center text-[12px] ${dim}`}>The label lists no calories or macros (diet drinks, water, coffee).</div>}
          <Btn kind="tint" size="lg" className="mt-4" onClick={() => void add()}>
            Add to {MEALS.find((m) => m.id === meal)?.label.toLowerCase()}
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
    <SheetPage opened={opened} onClose={onClose} title="New food">
      {barcode && <Note className="mt-3">Barcode {barcode} isn't in USDA or Open Food Facts. Copy it from the label once and it's saved for next time.</Note>}
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
          Save food
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
    <SheetPage opened={opened} onClose={onClose} title="Quick add">
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
    if (usda.status === 'rejected' && String(usda.reason).includes('USDA_LIMIT')) setError("USDA's shared hourly limit is used up. Add your free key in Settings.");
    else if (off.status === 'rejected' && usda.status === 'rejected') setError('Search failed. Check your connection, or try again in a minute.');
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
      <Header title={`Add to ${mealLabel.toLowerCase()}`} onBack={nav.pop}>
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
            disableButton={false}
          />
        </form>
      </Header>

      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ['Scan', ScanBarcode, () => setScanning(true)],
            ['Quick add', Zap, () => setQuick(true)],
            ['New food', PenLine, () => setCustom({})],
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
        {local.length ? list(local, 'local') : <Row title={q.trim() ? 'No saved matches.' : 'Foods you log show up here.'} />}
        {q.trim() && !online && !loading && <Row accent title={`Search online for “${q.trim()}”`} onClick={() => void search()} />}
      </Section>

      {error && <Note className="mt-3 !text-[#ff453a]">{error}</Note>}
      {online && (
        <>
          <Section title="Basic foods · USDA">{online.usda.length ? list(online.usda, 'usda') : <Row title="No matches." />}</Section>
          <Section title="Packaged foods">
            {online.branded.length || online.off.length ? (
              <>
                {list(online.branded, 'usdab')}
                {list(online.off, 'off')}
              </>
            ) : (
              <Row title="No matches." />
            )}
          </Section>
          {!settings.usdaApiKey && <Note>Add your free USDA key in Settings to search US brands too.</Note>}
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
