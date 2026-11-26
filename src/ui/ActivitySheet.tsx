import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { activitySteps, KM_PER_MILE } from '../core/activity';
import { addActivity, deleteActivity, stepsOn, today } from '../core/store';
import type { ActivityEntry, ActivityKind } from '../core/types';
import { Btn, db, fmt, GlassSheet, Seg, useSettings, useToast } from './kit';
import type { SFName } from './sf';
import { Sym } from './Sym';

export const STEPS_ORANGE = '#ff9f0a';

const KINDS: [ActivityKind, string][] = [
  ['walk', 'Walk'],
  ['run', 'Run'],
  ['stairs', 'Stairs'],
];
const GLYPH: Record<ActivityKind, SFName> = { walk: 'figure.walk', run: 'figure.run', stairs: 'figure.stair.stepper' };
const KIND_KEY = 'zoro.activity.kind';
const UNIT_KEY = 'zoro.unit.distance';

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* remembered until the app closes */
  }
};
const recall = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** "Run · 3.1 mi · 30 min", in the distance unit you use. */
function describe(a: ActivityEntry, unit: 'mi' | 'km'): string {
  const parts = [KINDS.find(([k]) => k === a.kind)?.[1] ?? 'Activity'];
  if (a.miles) parts.push(`${fmt(unit === 'km' ? a.miles * KM_PER_MILE : a.miles, 1)} ${unit}`);
  if (a.floors) parts.push(`${fmt(a.floors)} floors`);
  if (a.minutes) parts.push(`${fmt(a.minutes)} min`);
  return parts.join(' · ');
}

/**
 * Add a walk, run or stair session to a day's steps (hold Lift's Steps card): one you did on a
 * treadmill, outside without your phone, or on a StairMaster. Give a distance (miles or km),
 * a time, or both (floors or a time for stairs), and it shows the steps that works out to for
 * your height (core/activity.ts) before you add it. The day's added ones are listed under it.
 */
export function ActivitySheet({ opened, date, onClose }: { opened: boolean; date: string; onClose: () => void }) {
  const settings = useSettings();
  const toast = useToast();
  const [kind, setKind] = useState<ActivityKind>(() => (KINDS.some(([k]) => k === recall(KIND_KEY)) ? (recall(KIND_KEY) as ActivityKind) : 'walk'));
  const [unit, setUnit] = useState<'mi' | 'km'>(() => (recall(UNIT_KEY) === 'km' ? 'km' : 'mi'));
  const [dist, setDist] = useState('');
  const [mins, setMins] = useState('');
  const [floors, setFloors] = useState('');
  const day = useLiveQuery(() => stepsOn(date, db), [date]);

  const distance = num(dist);
  const input = {
    kind,
    miles: kind !== 'stairs' && distance ? (unit === 'km' ? distance / KM_PER_MILE : distance) : undefined,
    minutes: num(mins),
    floors: kind === 'stairs' ? num(floors) : undefined,
  };
  const steps = activitySteps(input, { heightIn: settings.heightIn, sex: settings.sex });
  const reset = () => {
    setDist('');
    setMins('');
    setFloors('');
  };
  const add = async () => {
    if (!steps) return;
    await addActivity({ date, ...input });
    toast(`Added ${fmt(steps)} steps`);
    reset();
    onClose();
  };
  const dayLabel = date === today() ? 'Today' : new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <GlassSheet
      opened={opened}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="amt">
        <div className="amt-head">
          <div className="amt-name">Add to Steps</div>
          <div className="amt-brand">{dayLabel}</div>
        </div>
        <Seg
          value={kind}
          onChange={(k) => {
            setKind(k);
            remember(KIND_KEY, k);
          }}
          options={KINDS}
        />

        <div className="amt-card act-rows">
          {kind === 'stairs' ? (
            <label className="amt-row">
              <span>Floors</span>
              <span className="act-field">
                <input inputMode="numeric" aria-label="Floors" placeholder="0" value={floors} onChange={(e) => setFloors(e.target.value.replace(/[^\d]/g, ''))} />
              </span>
            </label>
          ) : (
            <label className="amt-row">
              <span>Distance</span>
              <span className="act-field">
                <input inputMode="decimal" aria-label="Distance" placeholder="0" value={dist} onChange={(e) => setDist(e.target.value.replace(/[^\d.]/g, ''))} />
                <span className="ios-popup">
                  {unit}
                  <Sym name="chevron.up.chevron.down" size={13} />
                  <select
                    aria-label="Distance unit"
                    value={unit}
                    onChange={(e) => {
                      const u = e.target.value === 'km' ? 'km' : 'mi';
                      setUnit(u);
                      remember(UNIT_KEY, u);
                    }}
                  >
                    <option value="mi">mi</option>
                    <option value="km">km</option>
                  </select>
                </span>
              </span>
            </label>
          )}
          <label className="amt-row">
            <span>Time</span>
            <span className="act-field">
              <input inputMode="decimal" aria-label="Minutes" placeholder="0" value={mins} onChange={(e) => setMins(e.target.value.replace(/[^\d.]/g, ''))} />
              <span className="act-unit">min</span>
            </span>
          </label>
        </div>

        {/* What it adds, worked out as you type. */}
        <div className="act-result" aria-live="polite">
          <span className="act-result-value" style={{ color: steps ? STEPS_ORANGE : '#98989f' }}>
            {steps ? fmt(steps) : '—'}
            <small>STEPS</small>
          </span>
          <span className="act-result-note">
            {steps && day ? `${dayLabel === 'Today' ? 'Today' : 'That day'} comes to ${fmt(day.total + steps)}` : kind === 'stairs' ? 'Enter floors or a time' : 'Enter a distance, a time, or both'}
          </span>
        </div>

        <Btn kind="tint" size="lg" disabled={!steps} onClick={() => void add()}>
          Add
        </Btn>

        {!!day?.activities.length && (
          <div className="amt-card act-rows">
            {day.activities.map((a) => (
              <div key={a.id} className="amt-row act-logged">
                <span className="act-logged-what">
                  <Sym name={GLYPH[a.kind]} size={17} />
                  {describe(a, unit)}
                </span>
                <span className="act-logged-steps">{fmt(a.steps)}</span>
                <button
                  type="button"
                  className="act-remove"
                  aria-label={`Remove ${describe(a, unit)}`}
                  onClick={() => {
                    if (a.id === undefined) return;
                    void deleteActivity(a.id).then(() => toast(`Removed ${fmt(a.steps)} steps`));
                  }}
                >
                  <Sym name="xmark.circle.fill" size={20} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassSheet>
  );
}
