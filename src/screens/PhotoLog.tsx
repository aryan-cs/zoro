import { Dialog, DialogButton, Preloader } from 'konsta/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AiError } from '../core/gemini';
import { geminiDeps, logFromPhoto, toInboxFoods, type PhotoFood, type PhotoLog, type PhotoStep } from '../core/photoLog';
import { logFoods, today } from '../core/store';
import type { ISODate, Meal, Settings } from '../core/types';
import { aiKey } from '../ui/aiKey';
import { carbTarget } from '../core/calc';
import { Btn, db, Field, FITNESS, fmt, RING_GRADIENT, Row, Section, SheetPage, SingleRing, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { shrinkPhoto } from '../ui/photo';
import { Sym } from '../ui/Sym';
import { MEALS } from './Food';

type State =
  | { phase: 'working'; step: PhotoStep; brand?: string }
  | { phase: 'review'; log: PhotoLog }
  | { phase: 'error'; title: string; message: string; kind: AiError['kind'] | 'empty' };

/** A food's calories and macros as four small rings against the day's targets, each with its amount under it. */
function ItemRings({ m, settings }: { m: { kcal: number; protein: number; carbs: number; fat: number }; settings: Settings }) {
  const rings = [
    { label: 'Calories', value: m.kcal, target: settings.kcalTarget, unit: 'kcal', color: FITNESS.move, gradient: RING_GRADIENT.move, glyph: 'flame.fill' },
    { label: 'Protein', value: m.protein, target: settings.proteinTarget, unit: 'g', color: FITNESS.exercise, gradient: RING_GRADIENT.exercise, glyph: 'frying.pan.fill' },
    { label: 'Carbs', value: m.carbs, target: carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget), unit: 'g', color: FITNESS.carbs, gradient: RING_GRADIENT.carbs, glyph: 'carrot.fill' },
    { label: 'Fat', value: m.fat, target: settings.fatTarget, unit: 'g', color: FITNESS.steps, gradient: RING_GRADIENT.steps, glyph: 'circle.hexagongrid.fill' },
  ] as const;
  return (
    <div className="pl-rings">
      {rings.map((r) => (
        <div key={r.label} className="pl-ring" aria-label={`${r.label}: ${fmt(r.value)} ${r.unit}`}>
          <SingleRing value={r.value} target={r.target} colors={r.gradient} glyph={r.glyph} />
          <span className="pl-ring-value" style={{ color: r.color }}>
            {fmt(r.value, r.value > 0 && r.value < 10 && r.unit === 'g' ? 1 : 0)}
            <small>{r.unit}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

const times = (f: PhotoFood) => {
  const m = f.food.serving.macros;
  return { kcal: m.kcal * f.quantity, protein: m.protein * f.quantity, carbs: m.carbs * f.quantity, fat: m.fat * f.quantity };
};

/** One food from the photo: what it is, how many (− 1 +), its rings, and where its numbers came from. */
function FoodCell({ food, settings, onQuantity }: { food: PhotoFood; settings: Settings; onQuantity: (q: number) => void }) {
  const s = food.food.serving;
  const step = food.quantity % 1 ? 0.5 : 1;
  // "1 bowl" and "560 g" stay on one line each when the line wraps.
  const serving = s.label.replace(/^(\d+(?:\.\d+)?)\s/, '$1\u00a0');
  const about = [food.food.brand, food.details, s.grams ? `${serving}, ${fmt(s.grams)}\u00a0g` : serving].filter(Boolean).join(' · ');
  return (
    <li className={`pl-food ${food.quantity ? '' : 'is-off'}`}>
      <div className="pl-food-head">
        <div className="min-w-0">
          <div className="pl-food-name">{food.food.name}</div>
          <div className="pl-food-about">{about}</div>
        </div>
        <div className="pl-qty">
          <button type="button" aria-label={`Fewer ${food.food.name}`} className="pl-qty-btn" disabled={food.quantity <= 0} onClick={() => onQuantity(Math.max(0, food.quantity - step))}>
            <Sym name="minus.medium" size={14} />
          </button>
          <span className="pl-qty-value tabular" aria-label="Quantity">
            {fmt(food.quantity, food.quantity % 1 ? 1 : 0)}
          </span>
          <button type="button" aria-label={`More ${food.food.name}`} className="pl-qty-btn" onClick={() => onQuantity(food.quantity + step)}>
            <Sym name="plus.medium" size={14} />
          </button>
        </div>
      </div>
      <ItemRings m={times(food)} settings={settings} />
      {food.source ? (
        <a className="pl-source" href={food.source.url} target="_blank" rel="noreferrer">
          <span>{food.source.title}</span>
          <Sym name="arrow.up.right" size={11} />
        </a>
      ) : (
        <div className="pl-source is-estimate">{food.basis === 'label' ? 'From the Label' : 'Estimated'}</div>
      )}
    </li>
  );
}

const STEPS: { id: PhotoStep; label: (brand?: string) => string }[] = [
  { id: 'read', label: () => 'Read Photo' },
  { id: 'find', label: (b) => (b ? `Find ${b} Nutrition Facts` : 'Find Nutrition Facts') },
  { id: 'check', label: () => 'Copy Official Numbers' },
];

/** Steps as a list, like iOS's setup screens: a spinner on the one running, a check on the ones done. */
function Progress({ step, brand }: { step: PhotoStep; brand?: string }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <Section title="Progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className={`pl-step ${i > at ? 'is-pending' : ''}`}>
          <span className="pl-step-icon">{i < at ? <Sym name="checkmark" size={15} /> : i === at ? <Preloader className="pl-spinner" /> : null}</span>
          <span>{s.label(brand)}</span>
        </li>
      ))}
    </Section>
  );
}

function explain(err: unknown): State {
  if (err instanceof AiError) {
    if (err.kind === 'key') return { phase: 'error', kind: 'key', title: 'Gemini Key Not Accepted', message: 'Google didn’t accept your Gemini key. Check it in Settings › Photo Logging.' };
    if (err.kind === 'quota') return { phase: 'error', kind: 'quota', title: 'Free Limit Reached', message: 'Your free Gemini quota is used up for now. Try again in a little while.' };
    if (err.kind === 'network') return { phase: 'error', kind: 'network', title: 'Can’t Reach Gemini', message: 'Check your connection and try again.' };
    if (err.kind === 'blocked') return { phase: 'error', kind: 'blocked', title: 'Couldn’t Read Photo', message: 'Gemini wouldn’t look at this photo. Try another one.' };
    return { phase: 'error', kind: err.kind, title: 'Couldn’t Read Photo', message: err.message };
  }
  return { phase: 'error', kind: 'other', title: 'Couldn’t Read Photo', message: err instanceof Error ? err.message : 'Something went wrong.' };
}

/**
 * The sheet for a picked photo: shows the steps while Gemini reads it and looks things up, then
 * the foods it found to check (change how many, the meal or the day) and add in one tap.
 */
export function PhotoLogSheet({ file, date, meal, onClose, onDone }: { file: File | null; date: ISODate; meal?: Meal; onClose: () => void; onDone: (count: number) => void }) {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const [state, setState] = useState<State>({ phase: 'working', step: 'read' });
  const [run, setRun] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  // A new photo starts from the first step straight away, never showing the last one's foods.
  const [shown, setShown] = useState<File | null>(null);
  if (file && file !== shown) {
    setShown(file);
    setPreview(null);
    setState({ phase: 'working', step: 'read' });
  }

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const key = aiKey();
    const abort = new AbortController();
    setState({ phase: 'working', step: 'read' });
    void (async () => {
      try {
        if (!key) throw new AiError('No key.', 'key');
        const image = await shrinkPhoto(file);
        const log = await logFromPhoto(
          image,
          geminiDeps(key, { onStep: (step, brand) => !abort.signal.aborted && setState({ phase: 'working', step, brand }) }),
          abort.signal,
        );
        if (abort.signal.aborted) return;
        if (!log.foods.length) {
          setState({ phase: 'error', kind: 'empty', title: 'No Food Found', message: 'Zoro couldn’t find any food in this photo.' });
          return;
        }
        // Not printed on it: the day you're adding to, and the meal you picked (if you did).
        setState({ phase: 'review', log: { ...log, date: log.dated ? log.date : date, meal: !log.timed && meal && meal !== 'unsorted' ? meal : log.meal } });
      } catch (err) {
        if (!abort.signal.aborted) setState(explain(err));
      }
    })();
    return () => abort.abort();
  }, [file, run, date, meal]);

  const log = state.phase === 'review' ? state.log : null;
  const update = (patch: Partial<PhotoLog>) => log && setState({ phase: 'review', log: { ...log, ...patch } });
  const chosen = log ? log.foods.filter((f) => f.quantity > 0) : [];
  const estimates = log ? log.foods.filter((f) => f.basis === 'estimate').length : 0;
  const note = !estimates
    ? 'Numbers are copied from the source shown under each food.'
    : estimates === log?.foods.length
      ? 'No official nutrition facts turned up, so these are Gemini’s estimates for each dish.'
      : 'Estimated numbers are Gemini’s best guess for the dish. The rest are copied from the source shown.';

  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!log || !chosen.length || saving) return;
    setSaving(true);
    try {
      await logFoods(toInboxFoods(log), db);
      toast(chosen.length === 1 ? `Added ${chosen[0].food.name}` : `Added ${chosen.length} foods`);
      onDone(chosen.length);
    } finally {
      setSaving(false);
    }
  };

  const error = state.phase === 'error' ? state : null;
  const retryable = error && (error.kind === 'network' || error.kind === 'busy' || error.kind === 'other');

  return (
    <SheetPage opened={!!file} onClose={onClose} title={log ? 'Add from Photo' : 'Reading Photo'}>
      {state.phase !== 'review' && (
        <>
          {preview && (
            <div className="pl-photo">
              <img src={preview} alt="" />
            </div>
          )}
          <Progress step={state.phase === 'working' ? state.step : 'read'} brand={state.phase === 'working' ? state.brand : undefined} />
        </>
      )}

      {log && (
        <>
          <Section
            title="Foods"
            footer={note}
          >
            {log.foods.map((f, i) => (
              <FoodCell key={i} food={f} settings={settings} onQuantity={(q) => update({ foods: log.foods.map((g, j) => (j === i ? { ...g, quantity: q } : g)) })} />
            ))}
          </Section>
          <Section title="When">
            <Row
              title="Meal"
              right={
                <label className="ios-popup">
                  {MEALS.find((m) => m.id === log.meal)?.label}
                  <Sym name="chevron.up.chevron.down" size={13} />
                  <select aria-label="Meal" value={log.meal} onChange={(e) => update({ meal: e.target.value as Meal })}>
                    {MEALS.filter((m) => m.id !== 'unsorted').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />
            <Field label="Date" type="date" value={log.date} onChange={(v) => v && v <= today() && update({ date: v })} />
          </Section>
          <div className="mx-4 mt-6">
            <Btn kind="tint" size="lg" disabled={!chosen.length || saving} onClick={() => void add()}>
              {chosen.length === 1 ? 'Add Food' : `Add ${chosen.length} Foods`}
            </Btn>
          </div>
        </>
      )}

      {createPortal(
        <Dialog
          opened={!!error && !!file}
          title={error?.title}
          content={error?.message}
          buttons={
            error?.kind === 'key' ? (
              <>
                <DialogButton onClick={onClose}>Cancel</DialogButton>
                <DialogButton
                  strong
                  onClick={() => {
                    onClose();
                    nav.push({ name: 'settings' });
                  }}
                >
                  Settings
                </DialogButton>
              </>
            ) : retryable ? (
              <>
                <DialogButton onClick={onClose}>Cancel</DialogButton>
                <DialogButton strong onClick={() => setRun((n) => n + 1)}>
                  Try Again
                </DialogButton>
              </>
            ) : (
              <DialogButton strong onClick={onClose}>
                OK
              </DialogButton>
            )
          }
        />,
        document.querySelector('.k-app') ?? document.body,
      )}
    </SheetPage>
  );
}
