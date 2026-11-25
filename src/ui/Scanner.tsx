import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { Btn, Field, Note, Section, SheetPage } from './kit';

let prepared = false;
function detector(): BarcodeDetector {
  if (!prepared) {
    // Serve the barcode reader from this app (works offline) instead of a CDN.
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    prepared = true;
  }
  return new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e'] });
}

/** Full-screen camera scanner with typed and photo fallbacks. */
export function Scanner({ opened, onClose, onCode }: { opened: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!opened) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const d = detector();
    setError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await d.detect(video.current);
            if (found[0]?.rawValue) {
              stopped = true;
              onCode(found[0].rawValue);
              return;
            }
          } catch {
            // Frame not ready yet.
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setError('Camera unavailable. Allow camera access, take a photo, or type the barcode.');
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [opened, onCode]);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const found = await detector().detect(bitmap);
      if (found[0]?.rawValue) onCode(found[0].rawValue);
      else setError('No barcode found in that photo. Try again closer, or type it.');
    } catch {
      setError('Could not read that photo.');
    }
  };

  return (
    <SheetPage opened={opened} onClose={onClose} title="Scan Barcode" closeLabel="Close">
      <div className="relative mx-4 mt-3 aspect-[4/3] overflow-hidden rounded-[22px] bg-black">
        <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
      </div>
      {error && <Note className="mt-3 !text-[#ff453a]">{error}</Note>}
      <div className="mx-4 mt-3">
        <label className="ios-btn is-lg is-glass">
          Take a Photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
        </label>
      </div>
      <Section title="Enter Manually">
        <Field label="Barcode" inputMode="numeric" placeholder="0123456789012" value={manual} onChange={(v) => setManual(v.replace(/\D/g, ''))} wide />
      </Section>
      <div className="mx-4 mt-3">
        <Btn kind="tint" size="lg" disabled={manual.length < 8} onClick={() => onCode(manual)}>
          Look up
        </Btn>
      </div>
    </SheetPage>
  );
}
