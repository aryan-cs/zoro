import { Page } from 'konsta/react';
import { useState } from 'react';
import { effortTip, GUIDE, videoUrl } from '../core/guide';
import { EXERCISES } from '../core/program';
import { FitText, Header, Section } from '../ui/kit';
import { useNav } from '../ui/nav';
import { Sym } from '../ui/Sym';

const PHOTOS = `${import.meta.env.BASE_URL}exercises/`;

/**
 * How to do an exercise, opened by swiping a set to the left: an animation of it (RepCount's,
 * streamed from their site; the two photos shown in turn when there isn't one or it won't load)
 * and one to three pointers on form and how hard to push.
 */
export function ExerciseScreen({ exerciseId, lastSet = false }: { exerciseId: string; lastSet?: boolean }) {
  const nav = useNav();
  const def = EXERCISES[exerciseId];
  const guide = GUIDE[exerciseId];
  const video = videoUrl(exerciseId);
  // 'blocked': it loaded but wouldn't start on its own (Low Power Mode): tap it to play.
  const [state, setState] = useState<'loading' | 'playing' | 'blocked' | 'failed'>(video ? 'loading' : 'failed');
  const showVideo = !!video && state !== 'failed';
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
          <Section plain title={showVideo ? 'Animation' : 'Photos'}>
            {showVideo ? (
              <div className="ex-video">
                <video
                  src={video}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-label={`${def?.name}, animated`}
                  onPlaying={() => setState('playing')}
                  onError={() => setState('failed')}
                  onCanPlay={(e) => {
                    // Autoplay can be refused (Low Power Mode): then it waits for a tap.
                    const v = e.currentTarget;
                    if (v.paused) v.play().catch(() => setState('blocked'));
                  }}
                  onClick={(e) => void e.currentTarget.play().catch(() => {})}
                />
                {state === 'blocked' && (
                  <span className="ex-video-play" aria-hidden>
                    <Sym name="play.fill" size={22} />
                  </span>
                )}
              </div>
            ) : (
              <div className="ex-photos" role="img" aria-label={`${def?.name}, start and end positions`}>
                <img src={`${PHOTOS}${guide.photo}-0.webp`} alt="" decoding="async" />
                {!guide.still && <img className="ex-photo-end" src={`${PHOTOS}${guide.photo}-1.webp`} alt="" decoding="async" />}
              </div>
            )}
          </Section>
          <Section title="How To">
            {[...guide.tips, effortTip(guide, lastSet)].filter((t): t is string => !!t).map((t) => (
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
