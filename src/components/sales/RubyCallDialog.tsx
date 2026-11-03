import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  endCall,
  getLanguages,
  startVoiceSession,
  type CallLanguage,
} from '@/lib/ruby-call/sales-call-api';
import {
  WebRTCCall,
  type CallCallbacks,
  type CallErrorCode,
  type CallRole,
  type CallTurn,
} from '@/lib/ruby-call/webrtc-call';
import { RubyOrb } from './RubyOrb';

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

const FALLBACK_LANGUAGES: CallLanguage[] = [{ code: 'en', name: 'English' }];
const CAPTION_LINES = 2;
const SPEAKER_HOLD_MS = 1500;

const ERROR_COPY: Record<CallErrorCode, string> = {
  mic_denied:
    'Microphone access is blocked. Click the lock icon in your browser address bar, allow the microphone for this site, then try again.',
  mic_missing: 'We could not find a microphone. Connect one and try again.',
  unsupported: 'This browser cannot make the call. Please use a recent version of Chrome, Safari or Firefox.',
  connection_lost: 'The connection was lost. Please check your internet and try again.',
  no_answer: 'Ruby did not pick up. Please try again in a moment.',
  start_failed: 'We could not start the call. Please try again in a moment.',
};

export function pickDefaultLanguage(languages: CallLanguage[], browserLang?: string): string {
  const base = (browserLang || '').toLowerCase().split('-')[0];
  const match = languages.find((l) => l.code.toLowerCase() === base);
  if (match) return match.code;
  return languages.find((l) => l.code === 'en')?.code ?? languages[0]?.code ?? 'en';
}

interface RubyCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Test seam: builds the call engine. */
  createCall?: (callbacks: CallCallbacks) => WebRTCCall;
}

export function RubyCallDialog({ open, onOpenChange, createCall }: RubyCallDialogProps) {
  const { user } = useAuth();
  const [languages, setLanguages] = useState<CallLanguage[]>(FALLBACK_LANGUAGES);
  const [language, setLanguage] = useState('en');
  const [phase, setPhase] = useState<Phase>('idle');
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [speaker, setSpeaker] = useState<CallRole | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<CallErrorCode | null>(null);
  const [saved, setSaved] = useState(false);

  const callRef = useRef<WebRTCCall | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const speakerTimer = useRef<ReturnType<typeof setTimeout>>();
  const errorRef = useRef<CallErrorCode | null>(null);

  // Load languages each time the window opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getLanguages()
      .then((list) => {
        if (cancelled || !list.length) return;
        setLanguages(list);
        setLanguage(pickDefaultLanguage(list, navigator.language));
      })
      .catch(() => {
        if (!cancelled) setLanguage(pickDefaultLanguage(FALLBACK_LANGUAGES, navigator.language));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Closing the window or leaving the page hangs up.
  useEffect(
    () => () => {
      clearTimeout(speakerTimer.current);
      void callRef.current?.end();
    },
    [],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setTurns([]);
    setSpeaker(null);
    setMuted(false);
    setError(null);
    setSaved(false);
    errorRef.current = null;
    callRef.current = null;
    sessionIdRef.current = null;
  }, []);

  const startCall = useCallback(async () => {
    reset();
    setPhase('connecting');
    // eslint-disable-next-line prefer-const
    let call: WebRTCCall;
    const isCurrent = () => callRef.current === call;
    const callbacks: CallCallbacks = {
      onState: (s) => {
        if (s === 'live') setPhase('live');
      },
      onTranscript: setTurns,
      onActivity: (who) => {
        setSpeaker(who);
        clearTimeout(speakerTimer.current);
        speakerTimer.current = setTimeout(() => setSpeaker(null), SPEAKER_HOLD_MS);
      },
      onMuteChange: setMuted,
      onError: (code) => {
        errorRef.current = code;
        setError(code);
      },
      onEnded: async (result) => {
        const sessionId = sessionIdRef.current;
        if (isCurrent()) {
          clearTimeout(speakerTimer.current);
          setSpeaker(null);
          if (errorRef.current) {
            setPhase('error');
            return;
          }
          setPhase('ended');
        }
        if (!result.turns.length) return;
        // Saved even if the window was closed mid-call.
        try {
          await endCall({ callSessionId: sessionId, turns: result.turns, reason: result.reason });
          if (isCurrent()) setSaved(true);
        } catch {
          /* the friendly fallback text is shown */
        }
      },
    };
    call = createCall ? createCall(callbacks) : new WebRTCCall(callbacks);
    callRef.current = call;
    await call.start({
      language,
      createSession: async ({ sdp, language: lang }) => {
        const session = await startVoiceSession({
          language: lang,
          sdp,
          clientName: user?.full_name ?? null,
        });
        sessionIdRef.current = session.callSessionId;
        return session;
      },
    });
  }, [createCall, language, reset, user?.full_name]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      void callRef.current?.end();
      reset();
    }
    onOpenChange(next);
  };

  const inCall = phase === 'connecting' || phase === 'live';
  const captions = turns.slice(-CAPTION_LINES);
  const status =
    phase === 'connecting'
      ? 'Connecting to Ruby'
      : speaker === 'ruby'
        ? 'Ruby is speaking'
        : 'Ruby is listening';

  const orbLevel = speaker === 'ruby' ? 0.6 : speaker === 'client' ? 0.25 : phase === 'connecting' ? 0.15 : 0;
  const orbCalm = muted || phase === 'ended' || phase === 'error';

  // Full-screen call, laid out like the Eva call page: the orb carries the
  // screen, copy stays to one line. Colours follow the active theme.
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none data-[state=closed]:slide-out-to-top-[50%] data-[state=open]:slide-in-from-top-[50%]">
        <div className="flex items-center px-6 py-5 pr-14 md:px-10">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Ruby · AI sales advisor
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
          <RubyOrb level={orbLevel} calm={orbCalm} className="w-[min(62vw,44vh,420px)]" />

          <DialogHeader className="mt-8 space-y-3 text-center sm:text-center">
            <DialogTitle className="font-display text-4xl uppercase leading-none tracking-wide text-foreground md:text-6xl">
              {inCall ? status : 'Tell Ruby what you need'}
            </DialogTitle>
            <DialogDescription className={inCall ? 'sr-only' : 'font-mono text-sm text-muted-foreground'}>
              Your custom package and price, on the call.
            </DialogDescription>
          </DialogHeader>

          {phase === 'idle' && (
            <div className="mt-10 flex w-full max-w-[16rem] flex-col items-stretch gap-4">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="ruby-language" aria-label="Language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="lg" className="w-full px-6" onClick={startCall}>
                <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
                Start talking
              </Button>
            </div>
          )}

          {inCall && (
            <div className="mt-8 w-full max-w-2xl space-y-8">
              <div aria-label="Live captions" className="min-h-[4rem] space-y-2 text-base md:text-lg">
                {captions.map((t, i) => (
                  <p
                    key={`${turns.length - captions.length + i}`}
                    className={i === captions.length - 1 ? 'text-foreground' : 'text-muted-foreground'}
                  >
                    <span className="mr-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[hsl(var(--formanova-hero-accent))]">
                      {t.role === 'ruby' ? 'Ruby' : 'You'}
                    </span>
                    {t.text}
                  </p>
                ))}
              </div>
              <div className="mx-auto flex max-w-sm gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 px-4"
                  disabled={phase !== 'live'}
                  aria-pressed={muted}
                  onClick={() => callRef.current?.toggleMute()}
                >
                  {muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="flex-1 px-4"
                  onClick={() => void callRef.current?.end()}
                >
                  <PhoneOff className="mr-2 h-4 w-4" />
                  End call
                </Button>
              </div>
            </div>
          )}

          {phase === 'ended' && (
            <div className="mt-8 w-full max-w-[16rem] space-y-4">
              <p className="text-sm text-foreground">
                {saved ? 'Thanks — your call is saved.' : 'Thanks for calling.'}
              </p>
              <Button size="lg" className="w-full px-6" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-8 w-full max-w-sm space-y-4">
              <p role="alert" className="text-sm text-destructive">
                {ERROR_COPY[error ?? 'start_failed']}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="lg" className="flex-1 px-4" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
                <Button size="lg" className="flex-1 px-4" onClick={reset}>
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="pb-6 text-center font-mono text-[9px] tracking-wider text-muted-foreground">
          Ruby is an AI · calls are saved
        </p>
      </DialogContent>
    </Dialog>
  );
}
