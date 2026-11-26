import { useMemo, useState } from 'react';
import { EXERCISES } from '../core/program';
import { SearchField } from './bars';
import { EmptyRow, Row, Section, SheetPage } from './kit';
import { Sym } from './Sym';

/** The muscle groups the list is sorted into, by an exercise's main muscle. */
const GROUPS: { title: string; muscles: string[] }[] = [
  { title: 'Chest', muscles: ['chest'] },
  { title: 'Back', muscles: ['back', 'upper back', 'rear delts'] },
  { title: 'Shoulders', muscles: ['shoulders', 'side delts'] },
  { title: 'Arms', muscles: ['triceps', 'biceps'] },
  { title: 'Forearms', muscles: ['forearms', 'grip'] },
  { title: 'Legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { title: 'Core', muscles: ['abs', 'obliques'] },
  { title: 'Mobility', muscles: ['hip flexors', 'neck'] },
];
/** Old ones kept only so past workouts still show their names. */
const RETIRED = new Set(['postureMobility', 'inclineWalk']);
/** Stretches and posture work, listed together whatever muscle they're for. */
const MOBILITY = new Set(['hipFlexorStretch', 'thoracicExtension', 'doorwayChestStretch', 'chinTuck']);
const groupOf = (e: { id: string; muscles: string[] }) => (MOBILITY.has(e.id) ? 'Mobility' : GROUPS.find((g) => g.muscles.includes(e.muscles[0]))?.title);

/**
 * Pick an exercise to add (Lift's + › Add Exercise, or Add Exercise in a workout): every exercise
 * Zoro knows, by muscle group, with a search. Ones already added are checked (in a workout,
 * picking one of those takes it back out).
 */
export function ExercisePicker(props: { opened: boolean; onClose: () => void; added?: string[]; onPick: (exerciseId: string) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const all = Object.values(EXERCISES).filter((e) => !RETIRED.has(e.id));
    const matches = all.filter((e) => words.every((w) => `${e.name} ${e.muscles.join(' ')}`.toLowerCase().includes(w)));
    return GROUPS.map((g) => ({ ...g, list: matches.filter((e) => groupOf(e) === g.title) })).filter((g) => g.list.length);
  }, [q]);
  const close = () => {
    setQ('');
    props.onClose();
  };
  return (
    <SheetPage opened={props.opened} onClose={close} title="Add Exercise">
      <div className="exercise-search">
        <SearchField value={q} onChange={setQ} placeholder="Search exercises" />
      </div>
      {groups.length === 0 && (
        <Section>
          <EmptyRow>No Results</EmptyRow>
        </Section>
      )}
      {groups.map((g) => (
        <Section key={g.title} title={g.title} keep>
          {g.list.map((e) => {
            const on = props.added?.includes(e.id);
            return (
              <Row
                key={e.id}
                title={e.name}
                right={on ? <Sym name="checkmark" size={15} /> : undefined}
                onClick={() => {
                  setQ('');
                  props.onPick(e.id);
                }}
              />
            );
          })}
        </Section>
      ))}
    </SheetPage>
  );
}
