import { useLiveQuery } from 'dexie-react-hooks';
import {
  Block,
  BlockTitle,
  Button,
  List,
  ListInput,
  ListItem,
  Navbar,
  NavbarBackLink,
  Page,
  Popup,
  Preloader,
  Searchbar,
  Segmented,
  SegmentedButton,
  Sheet,
} from 'konsta/react';
import { PenLine, ScanBarcode, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { lookupBarcode, normalizeBarcode, searchOff, searchUsda } from '../core/food';
import { logFood, macrosFor, quickAdd, recentFoods, searchLocalFoods, upsertFood } from '../core/store';
import type { FoodItem, ISODate, Macros, Meal } from '../core/types';
import { db, fmt, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { Scanner } from '../ui/Scanner';
import { MEALS } from './Food';

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function macroLine(m: Macros | undefined) {
  if (!m) return '';
  return `${fmt(m.kcal)} kcal · P ${fmt(m.protein)} · C ${fmt(m.carbs)} · F ${fmt(m.fat)}`;
}

function FoodRow({ food, onPick }: { food: FoodItem; onPick: (f: FoodItem) => void }) {
  const basis = food.serving ? food.serving.macros : food.per100g;
  return (
    <ListItem
      link
      chevron={false}
      title={food.name}
      subtitle={[food.brand, food.serving ? food.serving.label : '100 g'].filter(Boolean).join(' · ')}
      text={macroLine(basis)}
      onClick={() => onPick(food)}
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
  if (!food) return <Sheet opened={false} />;
  const macros = macrosFor(food, num(qty), unit);
  const canServing = !!food.serving;
  const canGrams = !!food.per100g || !!food.serving?.grams;

  const add = async () => {
    if (num(qty) <= 0) return;
    await logFood({ food, quantity: num(qty), unit, meal, date }, db);
    onLogged();
  };

  return (
    <Sheet opened={!!food} onBackdropClick={onClose} className="pb-[env(safe-area-inset-bottom)]">
      <div className="px-4 pt-4">
        <div className="text-[18px] font-semibold leading-snug">{food.name}</div>
        {food.brand && <div className="text-[14px] text-black/50 dark:text-white/55">{food.brand}</div>}
      </div>
      {canServing && canGrams && (
        <Block className="!my-3">
          <Segmented strong rounded>
            <SegmentedButton active={unit === 'serving'} onClick={() => { setUnit('serving'); setQty('1'); }}>
              Servings
            </SegmentedButton>
            <SegmentedButton active={unit === 'g'} onClick={() => { setUnit('g'); setQty(String(food.serving?.grams ?? 100)); }}>
              Grams
            </SegmentedButton>
          </Segmented>
        </Block>
      )}
      <List strong inset className="!my-3">
        <ListInput
          label={unit === 'g' ? 'Grams' : `Servings (${food.serving?.label ?? '1 serving'})`}
          type="text"
          inputMode="decimal"
          value={qty}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
        />
      </List>
      <Block className="!my-3 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['Calories', macros.kcal, ''],
            ['Protein', macros.protein, 'g'],
            ['Carbs', macros.carbs, 'g'],
            ['Fat', macros.fat, 'g'],
          ] as const
        ).map(([label, v, u]) => (
          <div key={label} className="rounded-xl bg-black/5 py-2 dark:bg-white/10">
            <div className="tabular text-[18px] font-semibold">
              {fmt(v)}
              <span className="text-[12px] font-normal">{u}</span>
            </div>
            <div className="text-[11px] text-black/50 dark:text-white/55">{label}</div>
          </div>
        ))}
      </Block>
      <Block className="!mb-6 !mt-2">
        <Button large rounded onClick={() => void add()}>
          Add to {MEALS.find((m) => m.id === meal)?.label.toLowerCase()}
        </Button>
      </Block>
    </Sheet>
  );
}

/** Make your own food (for things without a barcode, or a barcode Open Food Facts doesn't know). */
function CustomFoodSheet({ opened, barcode, onClose, onCreated }: { opened: boolean; barcode?: string; onClose: () => void; onCreated: (f: FoodItem) => void }) {
  const [f, setF] = useState({ name: '', brand: '', serving: '1 serving', grams: '', kcal: '', protein: '', carbs: '', fat: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
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
    setF({ name: '', brand: '', serving: '1 serving', grams: '', kcal: '', protein: '', carbs: '', fat: '' });
    onCreated({ ...food, id });
  };
  const decimal = { type: 'text', inputMode: 'decimal' } as const;
  return (
    <Popup2 opened={opened} onClose={onClose} title="New food">
      {barcode && <Block className="!my-2 text-[13px] text-black/50 dark:text-white/55">Barcode {barcode} isn't in Open Food Facts yet. Enter it from the label.</Block>}
      <List strong inset className="!my-3">
        <ListInput label="Name" type="text" placeholder="Protein bar" value={f.name} onChange={set('name')} />
        <ListInput label="Brand (optional)" type="text" value={f.brand} onChange={set('brand')} />
        <ListInput label="Serving" type="text" placeholder="1 bar" value={f.serving} onChange={set('serving')} />
        <ListInput label="Serving weight in grams (optional)" {...decimal} value={f.grams} onChange={set('grams')} />
      </List>
      <BlockTitle>Per serving</BlockTitle>
      <List strong inset className="!my-2">
        <ListInput label="Calories" {...decimal} value={f.kcal} onChange={set('kcal')} />
        <ListInput label="Protein (g)" {...decimal} value={f.protein} onChange={set('protein')} />
        <ListInput label="Carbs (g)" {...decimal} value={f.carbs} onChange={set('carbs')} />
        <ListInput label="Fat (g)" {...decimal} value={f.fat} onChange={set('fat')} />
      </List>
      <Block>
        <Button large rounded disabled={!f.name.trim() || !f.kcal} onClick={() => void save()}>
          Save food
        </Button>
      </Block>
    </Popup2>
  );
}

function QuickAddSheet({ opened, meal, date, onClose, onDone }: { opened: boolean; meal: Meal; date: ISODate; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.kcal) return;
    await quickAdd(f.name.trim() || 'Quick add', { kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) }, meal, date, db);
    setF({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
    onDone();
  };
  const decimal = { type: 'text', inputMode: 'decimal' } as const;
  return (
    <Popup2 opened={opened} onClose={onClose} title="Quick add">
      <List strong inset className="!my-3">
        <ListInput label="Name (optional)" type="text" placeholder="Mom's chicken curry" value={f.name} onChange={set('name')} />
        <ListInput label="Calories" {...decimal} value={f.kcal} onChange={set('kcal')} />
        <ListInput label="Protein (g)" {...decimal} value={f.protein} onChange={set('protein')} />
        <ListInput label="Carbs (g)" {...decimal} value={f.carbs} onChange={set('carbs')} />
        <ListInput label="Fat (g)" {...decimal} value={f.fat} onChange={set('fat')} />
      </List>
      <Block>
        <Button large rounded disabled={!f.kcal} onClick={() => void save()}>
          Add
        </Button>
      </Block>
    </Popup2>
  );
}

function Popup2({ opened, onClose, title, children }: { opened: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar
          title={title}
          right={
            <Button clear small inline onClick={onClose}>
              Cancel
            </Button>
          }
        />
        {children}
      </Page>
    </Popup>
  );
}

export function AddFoodScreen({ meal, date }: { meal: Meal; date: ISODate }) {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<{ off: FoodItem[]; usda: FoodItem[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [quick, setQuick] = useState(false);
  const [custom, setCustom] = useState<{ barcode?: string } | null>(null);

  const local = useLiveQuery(() => (q.trim() ? searchLocalFoods(q, db) : recentFoods(25, db)), [q]) ?? [];

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    const [off, usda] = await Promise.allSettled([searchOff(q), settings.usdaApiKey ? searchUsda(q, settings.usdaApiKey) : Promise.resolve([])]);
    setOnline({ off: off.status === 'fulfilled' ? off.value : [], usda: usda.status === 'fulfilled' ? usda.value : [] });
    if (off.status === 'rejected') setError('Open Food Facts search failed. Check your connection, or try again in a minute.');
    setLoading(false);
  };

  const onCode = useCallback(
    async (code: string) => {
      setScanning(false);
      setLoading(true);
      try {
        const local = await db.foods.where('barcode').equals(normalizeBarcode(code)).first();
        const food = local ?? (await lookupBarcode(code));
        if (food) setPicked(food);
        else setCustom({ barcode: code });
      } catch {
        toast('Lookup failed. Check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const logged = () => {
    setPicked(null);
    toast('Added');
    nav.pop();
  };

  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? 'Food';

  return (
    <Page className="tab-safe">
      <Navbar
        title={`Add to ${mealLabel.toLowerCase()}`}
        left={<NavbarBackLink onClick={nav.pop} />}
        subnavbar={
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
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
        }
      />

      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        {(
          [
            ['Scan', ScanBarcode, () => setScanning(true)],
            ['Quick add', Zap, () => setQuick(true)],
            ['New food', PenLine, () => setCustom({})],
          ] as const
        ).map(([label, Icon, onClick]) => (
          <button key={label} type="button" onClick={onClick} className="flex flex-col items-center gap-1 rounded-xl bg-white py-3 text-[13px] font-medium text-[#007aff] active:opacity-70 dark:bg-[#1c1c1e]">
            <Icon className="h-6 w-6" />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <Block className="text-center">
          <Preloader />
        </Block>
      )}

      <BlockTitle>{q.trim() ? 'Your foods' : 'Recent'}</BlockTitle>
      {local.length ? (
        <List strong inset dividers className="!my-2">
          {local.map((f) => (
            <FoodRow key={`${f.source}:${f.id ?? f.sourceId}`} food={f} onPick={setPicked} />
          ))}
        </List>
      ) : (
        <Block className="!my-2 text-[14px] text-black/50 dark:text-white/55">
          {q.trim() ? 'No saved matches.' : 'Foods you log show up here.'}
        </Block>
      )}

      {q.trim() && !online && !loading && (
        <Block>
          <Button large rounded tonal onClick={() => void search()}>
            Search online for “{q.trim()}”
          </Button>
        </Block>
      )}
      {error && <Block className="text-[14px] text-[#ff3b30]">{error}</Block>}
      {online && (
        <>
          {settings.usdaApiKey && (
            <>
              <BlockTitle>Basic foods (USDA)</BlockTitle>
              {online.usda.length ? (
                <List strong inset dividers className="!my-2">
                  {online.usda.map((f) => (
                    <FoodRow key={`usda:${f.sourceId}`} food={f} onPick={setPicked} />
                  ))}
                </List>
              ) : (
                <Block className="!my-2 text-[14px] text-black/50 dark:text-white/55">No USDA matches.</Block>
              )}
            </>
          )}
          <BlockTitle>Packaged foods (Open Food Facts)</BlockTitle>
          {online.off.length ? (
            <List strong inset dividers className="!my-2">
              {online.off.map((f) => (
                <FoodRow key={`off:${f.sourceId}`} food={f} onPick={setPicked} />
              ))}
            </List>
          ) : (
            <Block className="!my-2 text-[14px] text-black/50 dark:text-white/55">No matches.</Block>
          )}
          {!settings.usdaApiKey && (
            <Block className="text-[13px] text-black/45 dark:text-white/50">Add a free USDA key in Settings for plain foods like rice or chicken.</Block>
          )}
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
