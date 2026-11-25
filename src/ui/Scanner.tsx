import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { Block, Button, List, ListInput, Navbar, Popup, Page } from 'konsta/react';
import { Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

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
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar
          title="Scan barcode"
          right={
            <Button clear small inline onClick={onClose}>
              Close
            </Button>
          }
        />
        <div className="relative mx-4 mt-4 aspect-[3/4] overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-white/80" />
        </div>
        {error && <Block className="!my-3 text-[14px] text-[#ff3b30]">{error}</Block>}
        <Block className="!my-3">
          <label className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#007aff]/10 py-3 text-[16px] font-medium text-[#007aff]">
            <Camera className="h-5 w-5" /> Take a photo instead
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
          </label>
        </Block>
        <List strong inset className="!my-3">
          <ListInput
            label="Type the barcode"
            type="text"
            inputMode="numeric"
            placeholder="0123456789012"
            value={manual}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManual(e.target.value.replace(/\D/g, ''))}
          />
        </List>
        <Block>
          <Button large rounded disabled={manual.length < 8} onClick={() => onCode(manual)}>
            Look up
          </Button>
        </Block>
      </Page>
    </Popup>
  );
}
