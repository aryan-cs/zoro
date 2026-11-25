import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { useRef, useState } from 'react';
import { addWater, today, waterFor } from '../core/store';
import type { WaterEntry } from '../core/types';
import { BigRing, db, fmt, RING_GRADIENT, Header, NumberPrompt, useSettings } from '../ui/kit';
import { saveSettings } from '../core/db';

const DEFAULT_PRESETS = [8, 16, 24, 32];
const HOLD_MS = 450;

/**
 * A quick-add amount. Tap adds it; touch and hold (the button sinks, then pops like a context
 * menu) opens an editor for its amount.
 */
function PresetButton({ oz, onAdd, onEdit }: { oz: number; onAdd: () => void; onEdit: () => void }) {
  const timer = useRef(0);
  const held = useRef(false);
  const [state, setState] = useState<'' | 'pressing' | 'popped'>('');
  const cancel = () => {
    window.clearTimeout(timer.current);
    setState('');
  };
  return (
    <button
      type="button"
      className={`ios-btn is-md is-glass water-preset ${state ? `is-${state}` : ''}`}
      onPointerDown={() => {
        held.current = false;
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
      onPointerUp={() => {
        window.clearTimeout(timer.current);
        if (!held.current) setState('');
      }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (held.current) return;
        onAdd();
      }}
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
  const [selected, setSelected] = useState<WaterEntry | null>(null);
  const total = entries.reduce((s, e) => s + e.oz, 0);
  const presets = settings.waterPresets?.length === 4 ? settings.waterPresets : DEFAULT_PRESETS;
  const pct = settings.waterTargetOz > 0 ? Math.round((total / settings.waterTargetOz) * 100) : 0;
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const add = async (oz: number) => {
    if (!(oz > 0)) return;
    await addWater(oz, date, db);
  };

  return (
    <Page className="tab-safe">
      <Header title="Water" />

      {/* The ring, percent and ounces centered in the space; the quick amounts along the bottom. */}
      <div className="water-body">
        <div className="water-hero">
          <BigRing value={total} target={settings.waterTargetOz} colors={RING_GRADIENT.distance} />
          <div className="water-pct">{pct}%</div>
          <div className="water-oz">
            {fmt(total)} of {fmt(settings.waterTargetOz)} oz
          </div>
        </div>
        <div className="water-presets">
          {presets.map((oz, i) => (
            <PresetButton key={i} oz={oz} onAdd={() => void add(oz)} onEdit={() => setEditing(i)} />
          ))}
        </div>
      </div>


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
