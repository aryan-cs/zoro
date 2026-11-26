import { Page } from 'konsta/react';
import { GUIDE } from '../core/guide';
import { EXERCISES } from '../core/program';
import { FitText, Header, Section } from '../ui/kit';
import { useNav } from '../ui/nav';

const PHOTOS = `${import.meta.env.BASE_URL}exercises/`;

/**
 * How to do an exercise, opened by swiping a set to the left: its two photos shown in turn (start
 * and end, like a GIF) and one to three pointers on form and how hard to push.
 */
export function ExerciseScreen({ exerciseId }: { exerciseId: string }) {
  const nav = useNav();
  const def = EXERCISES[exerciseId];
  const guide = GUIDE[exerciseId];
  return (
    <Page className="tab-safe">
      <Header
        title={
          // The whole name, always: a long one steps down in size instead of being cut off.
          <FitText className="ex-title" min={12}>
            {def?.name ?? 'Exercise'}
          </FitText>
        }
        onBack={nav.pop}
      />
      {guide && (
        <>
          <Section plain title="Photos">
            <div className="ex-photos" role="img" aria-label={`${def?.name}, start and end positions`}>
              <img src={`${PHOTOS}${guide.photo}-0.webp`} alt="" decoding="async" />
              {!guide.still && <img className="ex-photo-end" src={`${PHOTOS}${guide.photo}-1.webp`} alt="" decoding="async" />}
            </div>
          </Section>
          <Section title="How To" footer="Photos from Free Exercise DB, in the public domain.">
            {guide.tips.map((t) => (
              <li key={t} className="ex-tip">
                {t}
              </li>
            ))}
          </Section>
        </>
      )}
    </Page>
  );
}
