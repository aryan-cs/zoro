import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { X } from 'lucide-react';
import { useState } from 'react';
import { addWater, today, waterFor } from '../core/store';
import { Btn, Cell, db, dim, fmt, Header, NumField, Row, Section, useSettings, useToast } from '../ui/kit';

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
  const [custom, setCustom] = useState('');
  const total = entries.reduce((s, e) => s + e.oz, 0);
  const left = Math.max(0, settings.waterTargetOz - total);

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
            <Btn key={oz} className="!px-0" onClick={() => void add(oz)}>
              +{oz}
            </Btn>
          ))}
        </div>
        <div className="mt-2.5 flex w-full items-center justify-center gap-2">
          <NumField value={custom} onChange={setCustom} placeholder="oz" width="w-20" label="Ounces" />
          <Btn
            size="sm"
            onClick={() => {
              const n = parseFloat(custom);
              if (!Number.isFinite(n) || n <= 0 || n > 128) return toast('Enter ounces, up to 128.');
              void add(n);
              setCustom('');
            }}
          >
            Add oz
          </Btn>
        </div>
        </Cell>
      </Section>

      <Section title="Today">
        {entries.length === 0 && <Row title="Tap a button above each time you drink." />}
        {[...entries].reverse().map((e) => (
          <Cell key={e.id} className="flex items-center gap-3 py-1.5">
            <span className="flex-1 text-[17px]">{fmt(e.oz, e.oz % 1 ? 1 : 0)} oz</span>
            <span className={`tabular text-[15px] ${dim}`}>{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            <button
              type="button"
              aria-label="Remove"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 active:bg-white/10"
              onClick={() => e.id !== undefined && void db.water.delete(e.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </Cell>
        ))}
      </Section>
    </Page>
  );
}
