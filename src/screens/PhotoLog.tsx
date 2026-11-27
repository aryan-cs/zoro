import { useLiveQuery } from 'dexie-react-hooks';
import { Preloader } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { PhotoStep } from '../core/photoLog';
import type { PhotoJob } from '../core/photoQueue';
import { Row, Section, SheetPage } from '../ui/kit';
import { useNav } from '../ui/nav';
import { photoDB, photoQueue } from '../ui/photoQueue';
import { Sym } from '../ui/Sym';

const STEPS: { id: PhotoStep; label: (brand?: string) => string }[] = [
  { id: 'read', label: () => 'Read Photo' },
  { id: 'find', label: (b) => (b ? `Find ${b} Nutrition Facts` : 'Find Nutrition Facts') },
  { id: 'check', label: () => 'Copy Official Numbers' },
];

/** Steps as a list, like iOS's setup screens: a spinner on the one running, a check on the ones done. */
function Progress({ step, brand }: { step?: PhotoStep; brand?: string }) {
  const at = step ? STEPS.findIndex((s) => s.id === step) : -1;
  return (
    <>
      {STEPS.map((s, i) => (
        <li key={s.id} className={`pl-step ${i > at ? 'is-pending' : ''}`}>
          <span className="pl-step-icon">{i < at ? <Sym name="checkmark" size={15} /> : i === at ? <Preloader className="pl-spinner" /> : null}</span>
          <span>{s.label(brand)}</span>
        </li>
      ))}
    </>
  );
}

/** What a photo's capsule says while it's being read: the step it's on, as it happens. */
function stepTitle(job: PhotoJob): string {
  if (job.step === 'find') return job.brand ? `Finding ${job.brand} Nutrition Facts` : 'Finding Nutrition Facts';
  if (job.step === 'check') return 'Copying Official Numbers';
  return 'Reading Photo';
}

/**
 * Photos being read, on Food between the rings and Breakfast: each its own capsule (a one-row
 * card, like a Settings toggle row) with the step it's on and Apple's spinner. You can keep using
 * the app meanwhile. Once read, its foods go into Other and the capsule goes; one that couldn't be
 * read stays, with a red alert.
 */
export function PhotoQueue({ onOpen }: { onOpen: (id: number) => void }) {
  const jobs = useLiveQuery(() => photoDB.jobs.orderBy('createdAt').toArray(), []) ?? [];
  return (
    <>
      {jobs.map((job) => {
        const title = job.status === 'failed' ? (job.error?.title ?? 'Couldn’t Read Photo') : job.status === 'working' ? stepTitle(job) : (job.brand ?? 'Photo');
        return (
          <div key={job.id} className="meal-gap">
            <button type="button" className={`meal-row pq-row is-${job.status}`} onClick={() => onOpen(job.id!)} aria-label={title}>
              <img className="pq-thumb" src={job.thumb} alt="" />
              <span className="pq-title">{title}</span>
              {job.status === 'working' && <Preloader className="pq-spinner" />}
              {job.status === 'waiting' && <span className="meal-row-value">{job.offline ? 'Offline' : 'Waiting'}</span>}
              {job.status === 'failed' && <Sym name="exclamationmark.circle.fill" size={20} className="pq-failed" />}
            </button>
          </div>
        );
      })}
    </>
  );
}

/**
 * One photo, opened from its capsule: the photo and its steps while it's being read (close it any
 * time; reading goes on), or what went wrong if it couldn't be read.
 */
export function PhotoJobSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const nav = useNav();
  // Each answer says which photo it's for: right after a tap, useLiveQuery still hands back the
  // last photo's answer (or none), which mustn't read as this one being gone.
  const liveFor = useLiveQuery(async () => ({ id, job: id === null ? null : ((await photoDB.jobs.get(id)) ?? null) }), [id]);
  const imageFor = useLiveQuery(async () => ({ id, image: id === null ? null : ((await photoDB.images.get(id)) ?? null) }), [id]);
  const live = liveFor && liveFor.id === id ? liveFor.job : undefined;
  const image = imageFor && imageFor.id === id ? imageFor.image : undefined;
  // The last one stays shown while the sheet slides away.
  const [shown, setShown] = useState<{ job: PhotoJob; src?: string } | null>(null);
  const src = image ? `data:${image.mimeType};base64,${image.data}` : undefined;
  if (live && (live !== shown?.job || (src && src !== shown?.src))) setShown({ job: live, src: src ?? (shown?.job.id === live.id ? shown?.src : undefined) });
  // Gone: read and added (or deleted).
  useEffect(() => {
    if (id !== null && live === null) onClose();
  }, [id, live, onClose]);

  const job = shown?.job;
  const error = job?.status === 'failed' ? job.error : undefined;
  const remove = async () => {
    if (job?.id === undefined) return;
    await photoQueue.remove(job.id);
    onClose();
  };

  return (
    <SheetPage opened={id !== null && live !== null} onClose={onClose} title={error ? error.title : 'Reading Photo'} closeLabel="Done">
      {shown?.src && (
        <div className="pl-photo">
          <img src={shown.src} alt="" />
        </div>
      )}

      {job && !error && (
        <>
          <Section
            title="Progress"
            footer={
              job.status === 'waiting'
                ? job.offline
                  ? 'Waiting for a connection. Zoro picks up where it left off.'
                  : 'Waiting for the photos before it.'
                : 'You can close this and keep using Zoro. When it’s done, the foods go into Other.'
            }
          >
            <Progress step={job.status === 'working' ? job.step : undefined} brand={job.brand} />
          </Section>
          <div className="mt-6">
            <Section>
              <Row danger title="Stop and Delete Photo" onClick={() => void remove()} />
            </Section>
          </div>
        </>
      )}

      {job && error && (
        <Section footer={error.message}>
          {error.kind === 'key' ? (
            <Row
              accent
              title="Open Settings"
              onClick={() => {
                onClose();
                nav.push({ name: 'settings' });
              }}
            />
          ) : (
            <Row accent title="Try Again" onClick={() => void photoQueue.retry(job.id!)} />
          )}
          <Row danger title="Delete Photo" onClick={() => void remove()} />
        </Section>
      )}
    </SheetPage>
  );
}
