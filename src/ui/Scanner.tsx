import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { Popup } from 'konsta/react';
import { NavButton, SearchField } from './bars';
import { Sym } from './Sym';

let prepared = false;
function detector(): BarcodeDetector {
  if (!prepared) {
    // Serve the barcode reader from this app (works offline) instead of a CDN.
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    prepared = true;
  }
  return new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e'] });
}

/**
 * Full-screen camera scanner, laid out like the Camera app: X to close (top left), a search
 * button that opens a field to type the barcode (top right), the viewfinder in the middle while
 * the camera runs, and a round shutter at the bottom to scan from a photo instead.
 */
export function Scanner({ opened, onClose, onCode }: { opened: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [typing, setTyping] = useState(false);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!opened) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const d = detector();
    setError(null);
    setLive(false);
    setTyping(false);
    setManual('');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setLive(true);
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
        setError('Camera Unavailable');
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
      else setError('No Barcode Found');
    } catch {
      setError('Couldn’t Read That Photo');
    }
  };

  return (
    <Popup opened={opened} onBackdropClick={onClose} className="scanner">
      <video ref={video} playsInline muted autoPlay className={`scanner-video ${live ? '' : 'is-off'}`} />

      <header className="scanner-bar">
        <NavButton label="Close" onClick={onClose}>
          <Sym name="xmark" size={16.5} />
        </NavButton>
        <h1 className="ios-navbar-title">Scan Barcode</h1>
        <NavButton label="Type a barcode" onClick={() => setTyping((t) => !t)}>
          <Sym name="magnifyingglass" size={16.5} />
        </NavButton>
      </header>
      {typing && (
        <div className="scanner-search">
          <SearchField
            value={manual}
            placeholder="Barcode"
            inputMode="numeric"
            autoFocus
            onChange={(v) => setManual(v.replace(/\D/g, ''))}
            onSubmit={() => manual.length >= 8 && onCode(manual)}
            onCancel={() => setTyping(false)}
          />
        </div>
      )}

      {/* The viewfinder only while the camera is running; otherwise the message, centered. */}
      {live && !error && <div className="scanner-frame" aria-hidden />}
      {error && <div className="scanner-message">{error}</div>}

      <label className="scanner-shutter" aria-label="Scan a photo">
        <span />
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
      </label>
    </Popup>
  );
}
