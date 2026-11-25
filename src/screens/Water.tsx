import { useLiveQuery } from 'dexie-react-hooks';
import { Actions, ActionsButton, ActionsGroup, ActionsLabel, Page } from 'konsta/react';
import { useState } from 'react';
import { addWater, today, waterFor } from '../core/store';
import type { WaterEntry } from '../core/types';
import { Btn, Cell, db, FITNESS, fmt, GoalRing, Header, NumberPrompt, Row, Section, useSettings, useToast, EmptyRow } from '../ui/kit';

const QUICK = [8, 16, 24, 32];

export function WaterScreen() {
  const toast = useToast();
  const settings = useSettings();
  const date = today();
  const entries = useLiveQuery(() => waterFor(date, db), [date]) ?? [];
  const [custom, setCustom] = useState(false);
  const [selected, setSelected] = useState<WaterEntry | null>(null);
  const total = entries.reduce((s, e) => s + e.oz, 0);
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const add = async (oz: number) => {
    if (!(oz > 0)) return;
    await addWater(oz, date, db);
  };

  return (
    <Page className="tab-safe">
      <Header title="Water" />

      <Section>
        <Cell className="">
          <GoalRing label="Water" value={total} target={settings.waterTargetOz} unit="OZ" color={FITNESS.distance} />
        </Cell>
        <Row accent title="Other Amount…" onClick={() => setCustom(true)} />
      </Section>
      <div className="mx-4 mt-3 grid grid-cols-4 gap-2">
        {QUICK.map((oz) => (
          <Btn key={oz} className="!w-full !px-0" onClick={() => void add(oz)}>
            +{oz} oz
          </Btn>
        ))}
      </div>

      <Section title="Today">
        {entries.length === 0 && <EmptyRow>No Water Logged</EmptyRow>}
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
