import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { useState } from 'react';
import { addWater, today, waterFor } from '../core/store';
import type { WaterEntry } from '../core/types';
import { Btn, Cell, db, dim, fmt, Header, NumberPrompt, Row, Section, useSettings, useToast } from '../ui/kit';

const QUICK = [8, 16, 24, 32];

function Ring({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="11" className="stroke-white/12" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="11"
        strokeLinecap="round"
        stroke="#64d2ff"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  );
}

export function WaterScreen() {
  const toast = useToast();
  const settings = useSettings();
  const date = today();
  const entries = useLiveQuery(() => waterFor(date, db), [date]) ?? [];
  const [custom, setCustom] = useState(false);
  const [selected, setSelected] = useState<WaterEntry | null>(null);
  const total = entries.reduce((s, e) => s + e.oz, 0);
  const left = Math.max(0, settings.waterTargetOz - total);
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const add = async (oz: number) => {
    if (!(oz > 0)) return;
    await addWater(oz, date, db);
  };

  return (
    <Page className="tab-safe">
      <Header title="Water" />

      <Section>
        <Cell className="flex flex-col items-center pb-4 pt-5">
          <div className="relative">
            <Ring value={total} target={settings.waterTargetOz} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-[30px] font-bold leading-none">{fmt(total)}</span>
              <span className={`text-[13px] ${dim}`}>of {fmt(settings.waterTargetOz)} oz</span>
            </div>
          </div>
          <div className={`mt-2 text-[15px] ${left ? dim : 'font-semibold text-accent'}`}>{left ? `${fmt(left)} oz to go` : 'Goal reached'}</div>
          <div className="mt-4 grid w-full grid-cols-4 gap-2">
            {QUICK.map((oz) => (
              <Btn key={oz} className="!w-full !px-0" onClick={() => void add(oz)}>
                +{oz} oz
              </Btn>
            ))}
          </div>
        </Cell>
        <Row accent title="Other Amount…" onClick={() => setCustom(true)} />
      </Section>

      <Section title="Today">
        {entries.length === 0 && <Row title="Tap an amount above each time you drink." />}
        {[...entries].reverse().map((e) => (
          <Row key={e.id} title={`${fmt(e.oz, e.oz % 1 ? 1 : 0)} oz`} right={time(e.at)} onClick={() => setSelected(e)} />
        ))}
      </Section>

      <NumberPrompt
        opened={custom}
        title="Add Water"
        unit="oz"
        max={128}
        onCancel={() => setCustom(false)}
        onSave={(n) => {
          void add(n);
          setCustom(false);
          toast(`Added ${fmt(n, n % 1 ? 1 : 0)} oz`);
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
