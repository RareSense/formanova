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

  // Eva's layout (owner, 2026-11-06): a phone-shaped call card; prices and uploads in their own card beside it.
  // On a phone, once a card is up, the call shrinks to a bar at the top and the card fills the screen below.
  const staged = showPanels;
  const roundBtn = staged ? 'h-11 w-11 lg:h-12 lg:w-12' : 'h-[60px] w-[60px]';
  const endBtn = staged ? 'h-11 w-14 lg:h-12' : 'h-[60px] w-[72px]';
  // FormaNova look: square corners and a plain black border, no shadow (owner, 2026-11-06).
  const frame = 'border-2 border-foreground bg-background';
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="bg-background/70 backdrop-blur-2xl"
        className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 overflow-y-auto overflow-x-hidden border-0 bg-transparent p-0 shadow-none sm:rounded-none lg:flex-row lg:items-center lg:justify-center lg:gap-6 lg:p-4"
      >
        <section
          data-testid="ruby-phone"
          aria-label="Call with Ruby"
          className={`${frame} relative flex min-w-0 flex-col overflow-hidden ${
            staged
              ? 'sticky top-0 z-10 w-full lg:static lg:h-[min(900px,94dvh)] lg:w-[340px] lg:shrink-0'
              : 'mx-auto my-auto w-[calc(100%-2rem)] max-w-[400px] lg:h-[min(900px,94dvh)]'
          }`}
        >
          {/* Owner, 2026-11-06: no title-bar text; only a way back. */}
          <Button
            variant="ghost"
            size="sm"
            className={`absolute left-2 top-2 z-10 h-8 rounded-none px-2 font-mono text-[10px] uppercase tracking-[0.2em] ${staged ? 'hidden lg:inline-flex' : ''}`}
            onClick={() => handleOpenChange(false)}
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:mr-1" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Back</span>
          </Button>

          <div
            className={`flex min-w-0 flex-1 ${
              staged
                ? 'flex-row items-center gap-3 px-4 py-3 lg:flex-col lg:justify-center lg:gap-0 lg:px-8 lg:py-6'
                : 'flex-col items-center justify-center px-6 py-8 text-center sm:px-8'
            }`}
          >
            <RubyOrb
              level={orbLevel}
              calm={orbCalm}
              voice={call.voiceLevel}
              className={staged ? 'w-12 shrink-0 lg:w-40' : 'w-44 sm:w-52'}
            />

            <DialogHeader className={`space-y-2 ${staged ? 'min-w-0 flex-1 text-left lg:mt-6 lg:flex-none lg:text-center' : 'mt-6 text-center sm:text-center'}`}>
              {staged && <p className="font-display text-lg uppercase leading-none tracking-wide lg:hidden">Ruby · AI</p>}
              <DialogTitle
                role={inCall ? 'status' : undefined}
                className={
                  inCall || phase === 'ended'
                    ? `font-mono text-xs uppercase tracking-[0.25em] ${reconnecting ? 'text-destructive' : 'text-muted-foreground'}`
                    : 'font-display text-4xl uppercase leading-none tracking-wide text-foreground'
                }
              >
                {inCall ? status : phase === 'ended' ? `Call ended · ${formatClock(seconds)}` : 'Call our AI now'}
              </DialogTitle>
              <DialogDescription
                className={inCall || phase === 'ended' ? 'sr-only' : 'mx-auto max-w-xs text-base leading-relaxed text-muted-foreground'}
              >
                Get your custom price.
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
                  Start call
                </Button>
              </div>
            )}

            {inCall && (
              <div className={staged ? 'shrink-0 lg:mt-4 lg:w-full lg:space-y-6' : 'mt-4 w-full space-y-6'}>
                {captionsOn && (
                  <div
                    aria-label="Live captions"
                    aria-live="polite"
                    className={`${staged ? 'hidden lg:flex' : 'flex'} h-28 flex-col justify-end overflow-hidden leading-relaxed ${
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
                {/* Eva's controls: round icon buttons, the end button a little wider. */}
                <div className={`flex items-center justify-center ${staged ? 'gap-2' : 'gap-5'}`}>
                  <Button
                    variant="outline"
                    title={muted ? 'Unmute' : 'Mute'}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    className={`${roundBtn} shrink-0 rounded-none p-0`}
                    disabled={phase !== 'live'}
                    aria-pressed={muted}
                    onClick={call.toggleMute}
                  >
                    {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </Button>
                  <Button
                    variant="outline"
                    title="Captions"
                    aria-label="Captions"
                    className={`${roundBtn} shrink-0 rounded-none p-0 ${staged ? 'hidden lg:inline-flex' : ''}`}
                    disabled={phase !== 'live'}
                    aria-pressed={captionsOn}
                    onClick={call.toggleCaptions}
                  >
                    <Captions className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="destructive"
                    title="End call"
                    aria-label="End call"
                    className={`${endBtn} shrink-0 rounded-none p-0`}
                    onClick={call.end}
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </div>
                {panel && (
                  <div className={`justify-center ${staged ? 'hidden lg:flex' : 'flex'}`}>
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
                  </div>
                )}
              </div>
            )}

            {phase !== 'idle' && earlier.length > 0 && (
              <div className={`mt-4 w-full min-w-0 flex-wrap items-center justify-center gap-2 ${staged ? 'hidden lg:flex' : 'flex'}`}>
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
        </section>

        {staged && panel && (
          <section
            data-testid="ruby-stage"
            className={`${frame} m-4 min-w-0 p-4 sm:p-6 lg:m-0 lg:h-[min(900px,94dvh)] lg:w-[min(1040px,calc(100vw-340px-5rem))] lg:overflow-y-auto lg:p-4`}
          >
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
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
