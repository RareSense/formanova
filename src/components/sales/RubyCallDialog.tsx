import { useEffect, useState } from 'react';
import { ArrowLeft, Captions, Mic, MicOff, PanelRight, PanelRightClose, Phone, PhoneOff } from 'lucide-react';
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
import type { CallRecorder } from '@/lib/ruby-call/call-recorder';
import { getLanguages, type CallLanguage } from '@/lib/ruby-call/sales-call-api';
import { currentCaption, formatClock } from '@/lib/ruby-call/call-view';
import type { CallCallbacks, CallErrorCode, WebRTCCall } from '@/lib/ruby-call/webrtc-call';
import { RubyOrb } from './RubyOrb';
import { RubyStage } from './RubyPanels';
import { useRubyCall } from './useRubyCall';

const FALLBACK_LANGUAGES: CallLanguage[] = [{ code: 'en', name: 'English' }];

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
  /** Test seam: builds the recorder. */
  createRecorder?: () => CallRecorder;
}

export function RubyCallDialog({ open, onOpenChange, createCall, createRecorder }: RubyCallDialogProps) {
  const [languages, setLanguages] = useState<CallLanguage[]>(FALLBACK_LANGUAGES);
  const [language, setLanguage] = useState('en');
  const call = useRubyCall({ createCall, createRecorder });
  const { phase, muted, busy, reconnecting, seconds, panel, earlier, panelsHidden, captionsOn, textLarge, speaker } = call;

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

  const handleOpenChange = (next: boolean) => {
    if (!next) call.close();
    onOpenChange(next);
  };

  const inCall = phase === 'connecting' || phase === 'live';
  // One panel at a time, in its own card beside the call (Eva's stage).
  const showPanels = phase !== 'idle' && !!panel && !panelsHidden;
  // Eva's status line: the call clock plus what is going on.
  const status =
    phase === 'connecting'
      ? 'Connecting…'
      : formatClock(seconds) +
        (reconnecting ? ' · Reconnecting…' : muted ? ' · Muted' : busy ? ' · Ruby is checking…' : '');
  const caption = currentCaption(call.turns);

  // Ruby looking something up keeps the orb lively, so silence never looks like a drop.
  const orbLevel =
    speaker === 'ruby' ? 0.6 : busy ? 0.3 : speaker === 'client' ? 0.25 : phase === 'connecting' ? 0.15 : 0;
  const orbCalm = muted || phase === 'ended' || phase === 'error';

  // Big centred modal laid out like the Eva call page; panels sit beside the call on
  // wide screens (the modal widens) and below it on phones.
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="bg-background/40 backdrop-blur-md"
        className={`flex max-h-[94dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-y-auto overflow-x-hidden p-0 ${
          showPanels ? 'lg:max-w-6xl' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 pr-12 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="px-3 font-mono text-[10px] uppercase tracking-[0.2em]"
            onClick={() => handleOpenChange(false)}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Back
          </Button>
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            <span className="rounded-sm bg-[hsl(var(--formanova-hero-accent))] px-1.5 py-0.5 font-bold tracking-[0.15em] text-background">
              AI
            </span>
            Ruby · Sales advisor
          </p>
        </div>

        <div className={showPanels ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start' : ''}>
          <div className="flex min-w-0 flex-col items-center px-6 pb-8 pt-4 text-center sm:px-12 sm:pt-6">
            <RubyOrb
              level={orbLevel}
              calm={orbCalm}
              className={showPanels ? 'w-28 sm:w-40 lg:w-52' : 'w-48 sm:w-64'}
            />

            <DialogHeader className="mt-6 space-y-2 text-center sm:text-center">
              <DialogTitle
                role={inCall ? 'status' : undefined}
                className={
                  inCall || phase === 'ended'
                    ? `font-mono text-xs uppercase tracking-[0.25em] ${reconnecting ? 'text-destructive' : 'text-muted-foreground'}`
                    : 'font-display text-4xl uppercase leading-none tracking-wide text-foreground sm:text-5xl'
                }
              >
                {inCall ? status : phase === 'ended' ? `Call ended · ${formatClock(seconds)}` : 'Get your custom price'}
              </DialogTitle>
              <DialogDescription
                className={inCall || phase === 'ended' ? 'sr-only' : 'mx-auto max-w-md text-base leading-relaxed text-muted-foreground'}
              >
                A quick voice call with Ruby, our AI sales advisor. Describe your campaign or bulk order and get a plan and a price on this call.
              </DialogDescription>
            </DialogHeader>

            {phase === 'idle' && (
              <div className="mt-8 flex w-full max-w-[16rem] flex-col items-stretch gap-4">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="ruby-language" aria-label="Language" className="h-11">
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
                <Button size="lg" className="h-14 w-full px-6 text-base" onClick={() => void call.startCall(language)}>
                  <Phone className="mr-2 h-5 w-5" aria-hidden="true" />
                  Start talking
                </Button>
              </div>
            )}

            {inCall && (
              <div className="mt-4 w-full space-y-6">
                {captionsOn && (
                  <div
                    aria-label="Live captions"
                    aria-live="polite"
                    className={`flex h-28 flex-col justify-end overflow-hidden leading-relaxed ${
                      textLarge ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
                    }`}
                    style={{
                      maskImage: 'linear-gradient(to bottom, transparent, #000 45%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 45%)',
                    }}
                  >
                    {caption && (
                      <p
                        key={caption.index}
                        className={`animate-fade-in break-words ${
                          caption.turn.role === 'ruby' ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {caption.turn.text.trim()}
                      </p>
                    )}
                  </div>
                )}
                <div className="mx-auto grid max-w-md grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-16 w-full flex-col gap-1 px-2 text-xs sm:flex-row sm:gap-2 sm:text-sm"
                    disabled={phase !== 'live'}
                    aria-pressed={muted}
                    onClick={call.toggleMute}
                  >
                    {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {muted ? 'Unmute' : 'Mute'}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-16 w-full flex-col gap-1 px-2 text-xs sm:flex-row sm:gap-2 sm:text-sm"
                    disabled={phase !== 'live'}
                    aria-pressed={captionsOn}
                    onClick={call.toggleCaptions}
                  >
                    <Captions className="h-4 w-4" />
                    Captions
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
                    className="h-16 w-full flex-col gap-1 px-2 text-xs sm:flex-row sm:gap-2 sm:text-sm"
                    onClick={call.end}
                  >
                    <PhoneOff className="h-4 w-4" />
                    End call
                  </Button>
                </div>
                {panel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-4 font-mono text-[10px] uppercase tracking-[0.2em]"
                    aria-pressed={!panelsHidden}
                    onClick={call.togglePanels}
                  >
                    {panelsHidden ? (
                      <PanelRight className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <PanelRightClose className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {panelsHidden ? 'Show panel' : 'Hide panel'}
                  </Button>
                )}
              </div>
            )}

            {phase !== 'idle' && earlier.length > 0 && (
              <div className="mt-4 flex w-full min-w-0 flex-wrap items-center justify-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Earlier</span>
                {earlier.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    className="h-8 max-w-[12rem] px-3 text-xs"
                    onClick={() => call.reopenPanel(p)}
                  >
                    <span className="truncate">{p.title}</span>
                  </Button>
                ))}
              </div>
            )}

            {phase === 'ended' && (
              <div className="mt-8 w-full max-w-[16rem] space-y-4">
                <p className="text-sm text-foreground">Thanks for calling.</p>
                <Button size="lg" className="w-full px-6" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}

            {phase === 'error' && (
              <div className="mt-8 w-full max-w-sm space-y-4">
                <p role="alert" className="text-sm text-destructive">
                  {ERROR_COPY[call.error ?? 'start_failed']}
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" size="lg" className="flex-1 px-4" onClick={() => handleOpenChange(false)}>
                    Close
                  </Button>
                  <Button size="lg" className="flex-1 px-4" onClick={call.reset}>
                    Try again
                  </Button>
                </div>
              </div>
            )}
          </div>

          {showPanels && panel && (
            <div className="min-w-0 px-4 pb-6 sm:px-6 lg:py-6 lg:pl-0">
              <RubyStage
                key={panel.id}
                panel={panel}
                compact={call.compact}
                onRendered={call.panelRendered}
                onClose={call.closePanel}
                onUpload={call.uploadFiles}
                onLink={call.shareLink}
                onLinkTyping={call.linkTyping}
                onReach={call.shareReach}
              />
            </div>
          )}
        </div>

        <p className="pb-5 text-center font-mono text-[9px] tracking-wider text-muted-foreground">
          Ruby is an AI
        </p>
      </DialogContent>
    </Dialog>
  );
}
