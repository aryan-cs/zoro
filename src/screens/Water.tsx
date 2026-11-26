import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { useRef, useState } from 'react';
import { addWater, removeWater, today, waterFor } from '../core/store';
import type { WaterEntry } from '../core/types';
import { BigRing, db, fmt, RING_GRADIENT, Header, NumberPrompt, RollingNumber, useSettings } from '../ui/kit';
import { saveSettings } from '../core/db';

const DEFAULT_PRESETS = [8, 16, 24, 32];
const HOLD_MS = 450;

/** How far (pt) a quick vertical swipe has to travel to count as a flick rather than a tap. */
const FLICK = 18;

/**
 * A quick amount. Tap it, or flick it up toward the ring, to add it; flick it down, away from
 * the ring, to take it back off. Touch and hold (the button sinks, then pops like a context menu)
 * opens an editor for its amount.
 */
function PresetButton({ oz, onAdd, onRemove, onEdit }: { oz: number; onAdd: () => void; onRemove: () => void; onEdit: () => void }) {
  const timer = useRef(0);
  const held = useRef(false);
  const startY = useRef<number | null>(null);
  const [state, setState] = useState<'' | 'pressing' | 'popped' | 'up' | 'down'>('');
  const nudge = (dir: 'up' | 'down') => {
    setState(dir);
    window.setTimeout(() => setState(''), 260);
  };
  return (
    <button
      type="button"
      className={`ios-btn is-md is-glass water-preset ${state ? `is-${state}` : ''}`}
      onPointerDown={(e) => {
        // Keep getting the touch when a flick leaves the button.
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* no live pointer (synthetic event): nothing to capture */
        }
        held.current = false;
        startY.current = e.clientY;
        setState('pressing');
        timer.current = window.setTimeout(() => {
          held.current = true;
          setState('popped');
          navigator.vibrate?.(10);
          window.setTimeout(() => {
            setState('');
            onEdit();
          }, 180);
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        // Moving far enough means a flick is coming, not a hold.
        if (startY.current !== null && Math.abs(e.clientY - startY.current) > FLICK / 2) window.clearTimeout(timer.current);
      }}
      onPointerUp={(e) => {
        window.clearTimeout(timer.current);
        const dy = startY.current === null ? 0 : e.clientY - startY.current;
        startY.current = null;
        if (held.current) return;
        if (dy > FLICK) {
          onRemove();
          nudge('down');
        } else {
          onAdd();
          nudge('up');
        }
      }}
      onPointerCancel={() => {
        window.clearTimeout(timer.current);
        startY.current = null;
        setState('');
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      +{fmt(oz, oz % 1 ? 1 : 0)} oz
    </button>
  );
}

export function WaterScreen() {
  const settings = useSettings();
  const date = today();
  const entries = useLiveQuery(() => waterFor(date, db), [date]) ?? [];
  const [editing, setEditing] = useState<number | null>(null);
  const [goal, setGoal] = useState(false);
  const [selected, setSelected] = useState<WaterEntry | null>(null);
  const total = entries.reduce((s, e) => s + e.oz, 0);
  const presets = settings.waterPresets?.length === 4 ? settings.waterPresets : DEFAULT_PRESETS;
  const pct = settings.waterTargetOz > 0 ? Math.round((total / settings.waterTargetOz) * 100) : 0;
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const add = async (oz: number) => {
    if (!(oz > 0)) return;
    await addWater(oz, date, db);
  };
  const remove = async (oz: number) => {
    if (!(oz > 0)) return;
    await removeWater(oz, date, db);
  };

  return (
    <Page className="water-page">
      <Header title="Water" />

      {/* The ring, percent and ounces centered in the space; the quick amounts along the bottom. */}
      <div className="water-body">
        <div className="water-hero">
          <div className="water-ring">
            <BigRing value={total} target={settings.waterTargetOz} colors={RING_GRADIENT.distance} w={30} />
            <div className="water-pct">
              <RollingNumber value={pct} suffix="%" />
            </div>
          </div>
          {/* Tap to change the day's goal. */}
          <button type="button" className="water-oz" onClick={() => setGoal(true)} aria-label={`${fmt(total)} of ${fmt(settings.waterTargetOz)} ounces. Change goal`}>
            <RollingNumber value={total} /> of <RollingNumber value={settings.waterTargetOz} /> oz
          </button>
        </div>
        <div className="water-presets">
          {presets.map((oz, i) => (
            <PresetButton key={i} oz={oz} onAdd={() => void add(oz)} onRemove={() => void remove(oz)} onEdit={() => setEditing(i)} />
          ))}
        </div>
      </div>


      <NumberPrompt
        opened={goal}
        title="Daily Water Goal"
        unit="oz"
        initial={String(settings.waterTargetOz)}
        min={8}
        max={400}
        onCancel={() => setGoal(false)}
        onSave={(n) => {
          void saveSettings({ waterTargetOz: Math.round(n) });
          setGoal(false);
        }}
      />
      <NumberPrompt
        opened={editing !== null}
        title="Edit Amount"
        unit="oz"
        initial={editing !== null ? String(presets[editing]) : undefined}
        max={128}
        onCancel={() => setEditing(null)}
        onSave={(n) => {
          if (editing === null) return;
          const next = presets.map((v, i) => (i === editing ? n : v));
          void saveSettings({ waterPresets: next });
          setEditing(null);
        }}
      />

      <Actions opened={!!selected} onBackdropClick={() => setSelected(null)}>
        <ActionsGroup>
          <ActionsLabel>{selected ? `${fmt(selected.oz)} oz at ${time(selected.at)}` : ''}</ActionsLabel>
          <ActionsButton
            className="!text-[#ff453a]"
            onClick={() => {
              if (selected?.id !== undefined) void db.water.delete(selected.id);
              setSelected(null);
            }}
          >
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
