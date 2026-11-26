import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { useRef, useState, type ReactNode } from 'react';
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

/** The barcode in a photo, or null. Tries a 2000px copy first (quick), then the full photo. */
async function readPhoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const d = detector();
  const k = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  if (k < 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * k);
    c.height = Math.round(bitmap.height * k);
    c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height);
    const small = await d.detect(c);
    if (small[0]?.rawValue) return small[0].rawValue;
  }
  return (await d.detect(bitmap))[0]?.rawValue ?? null;
}

/**
 * Barcode scanning with the iPhone's own camera. A Home Screen web app can't keep camera access
 * (iOS forgets it when the app restarts, and soon after the camera stops), so a live viewfinder
 * asked permission nearly every time; the system camera never asks. Call `scan` straight from a
 * tap. When a photo has no readable barcode, the scanner screen opens with that message, a
 * shutter to try again, and a search button to type the number.
 */
export function useScanner(onCode: (code: string) => void): [scan: () => void, element: ReactNode] {
  const input = useRef<HTMLInputElement>(null);
  const handler = useRef(onCode);
  handler.current = onCode;
  const [message, setMessage] = useState<string | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    try {
      const code = await readPhoto(file);
      if (code) {
        setMessage(null);
        handler.current(code);
      } else setMessage('No Barcode Found');
    } catch {
      setMessage('Couldn’t Read That Photo');
    }
  };
  const scan = () => {
    const el = input.current;
    if (!el) return;
    el.value = '';
    el.click();
  };
  const element = (
    <>
      {/* Visually hidden rather than display:none, which iOS won't open from a script. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        aria-hidden
        tabIndex={-1}
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }}
        onChange={(e) => void read(e.target.files?.[0])}
      />
      <Scanner
        message={message}
        onClose={() => setMessage(null)}
        onPhoto={(f) => void read(f)}
        onCode={(c) => {
          setMessage(null);
          handler.current(c);
        }}
      />
    </>
  );
  return [scan, element];
}

/**
 * The scanner screen, shown when a photo didn't scan, laid out like the Camera app: X to close
 * (top left), a search button that opens a field to type the barcode (top right), the message in
 * the middle, and a round shutter at the bottom to take another photo.
 */
function Scanner({ message, onClose, onCode, onPhoto }: { message: string | null; onClose: () => void; onCode: (code: string) => void; onPhoto: (f: File | undefined) => void }) {
  const [typing, setTyping] = useState(false);
  const [manual, setManual] = useState('');

  return (
    <Popup opened={message !== null} onBackdropClick={onClose} className="scanner">
      <header className="scanner-bar">
        <NavButton
          label="Close"
          onClick={() => {
            setTyping(false);
            onClose();
          }}
        >
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
            onSubmit={() => {
              if (manual.length < 8) return;
              setTyping(false);
              setManual('');
              onCode(manual);
            }}
            onCancel={() => setTyping(false)}
          />
        </div>
      )}

      {message && <div className="scanner-message">{message}</div>}

      <label className="scanner-shutter" aria-label="Take another photo">
        <span />
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </Popup>
  );
}
