import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Listening for speech with the browser's own recognizer (Safari's is Apple's dictation), when it
 * has one. Starts on a tap, hears you out, then hands back what you said.
 */
interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognizerClass = new () => Recognizer;

const recognizerClass = (): RecognizerClass | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function useListen() {
  const rec = useRef<Recognizer | null>(null);
  // Refused once (no microphone permission, or not allowed in this app): don't keep asking.
  const blocked = useRef(false);
  const [listening, setListening] = useState(false);

  const stop = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (r) {
      r.onend = null;
      r.abort();
    }
    setListening(false);
  }, []);

  /**
   * Starts listening; call it straight from a tap (browsers only allow the microphone then).
   * `onText` gets what's been heard so far, as you talk; `onDone` all of it once you stop (empty
   * if nothing was heard). Returns false if it can't listen here, so the caller can offer typing.
   */
  const start = useCallback(
    (onText: (text: string) => void, onDone: (text: string) => void): boolean => {
      const Rec = recognizerClass();
      if (!Rec || blocked.current) return false;
      stop();
      try {
        const r = new Rec();
        r.lang = navigator.language || 'en-US';
        r.interimResults = true;
        r.continuous = false;
        r.maxAlternatives = 1;
        let heard = '';
        r.onresult = (e) => {
          let text = '';
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          heard = text;
          onText(text);
        };
        r.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') blocked.current = true;
        };
        r.onend = () => {
          if (rec.current !== r) return;
          rec.current = null;
          setListening(false);
          onDone(heard.trim());
        };
        r.start();
        rec.current = r;
        setListening(true);
        return true;
      } catch {
        return false;
      }
    },
    [stop],
  );

  useEffect(() => () => rec.current?.abort(), []);
  return { start, stop, listening };
}
