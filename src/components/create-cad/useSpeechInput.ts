import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Speak instead of typing: the browser's speech recognition turns what was
 * said into text the customer can still edit before sending. Unsupported
 * browsers (Firefox) get supported = false and no mic is shown.
 */
export function useSpeechInput(onText: (text: string) => void) {
  const Ctor = typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (!Ctor) return;
    if (recRef.current) { recRef.current.stop(); return; }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
      if (text) onTextRef.current(text);
    };
    rec.onend = rec.onerror = () => { recRef.current = null; setListening(false); };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [Ctor]);

  return { supported: !!Ctor, listening, toggle };
}
