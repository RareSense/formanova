/**
 * Runs one Ruby call for RubyCallDialog: the engine, recording, tools and panels,
 * screen notes, and saving the call. Rendering stays in the dialog.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CallRecorder } from '@/lib/ruby-call/call-recorder';
import { callerContext, fetchPastCalls } from '@/lib/ruby-call/call-memory';
import { createCallTools, type LastQuote, type ToolHost } from '@/lib/ruby-call/call-tools';
import { linkMessage, linkRecord, uploadClientFile, uploadProblem, uploadedMessage } from '@/lib/ruby-call/client-uploads';
import type { Panel, PanelSpec } from '@/lib/ruby-call/panels';
import { keepLocally, retryUnsavedCalls, saveCallRecord, saveOnPageHide } from '@/lib/ruby-call/post-call-save';
import {
  buildPostCallPayload,
  callAudioUploader,
  startVoiceSession,
  type CallLink,
  type CallPayment,
  type CallUpload,
} from '@/lib/ruby-call/sales-call-api';
import { ScreenNotes } from '@/lib/ruby-call/screen-notes';
import {
  WebRTCCall,
  type CallCallbacks,
  type CallEndReason,
  type CallErrorCode,
  type CallRole,
  type CallTurn,
} from '@/lib/ruby-call/webrtc-call';
import type { UploadOutcome } from './RubyPanelInputs';

export type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

const SPEAKER_HOLD_MS = 1500;
/** Earlier panels kept reachable from a small list (the newest panel replaces them on screen). */
const MAX_EARLIER = 3;
/** A panel that is not on screen by then is reported to Ruby as not shown. */
const RENDER_TIMEOUT_MS = 1500;

export interface UseRubyCallOptions {
  /** Test seam: builds the call engine. */
  createCall?: (callbacks: CallCallbacks) => WebRTCCall;
  /** Test seam: builds the recorder. */
  createRecorder?: () => CallRecorder;
}

export function useRubyCall({ createCall, createRecorder }: UseRubyCallOptions = {}) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [speaker, setSpeaker] = useState<CallRole | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<CallErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [earlier, setEarlier] = useState<Panel[]>([]);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [compact, setCompact] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [textLarge, setTextLarge] = useState(false);

  const callRef = useRef<WebRTCCall | null>(null);
  const recorderRef = useRef<CallRecorder | null>(null);
  const notesRef = useRef<ScreenNotes | null>(null);
  const sessionRef = useRef<{ callSessionId: string | null; workflowId: string | null } | null>(null);
  const leadRef = useRef<Record<string, unknown>>({});
  const uploadsRef = useRef<CallUpload[]>([]);
  const linksRef = useRef<CallLink[]>([]);
  const paymentRef = useRef<CallPayment | null>(null);
  const errorRef = useRef<CallErrorCode | null>(null);
  const speakerTimer = useRef<ReturnType<typeof setTimeout>>();
  const panelSeq = useRef(0);
  const panelRef = useRef<Panel | null>(null);
  const renderWaiters = useRef(new Map<string, (shown: boolean) => void>());
  const quoteRef = useRef<LastQuote | null>(null);
  const owner = String(user?.id ?? user?.email ?? 'anonymous');
  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  const note = useCallback((text: string) => notesRef.current?.note(text), []);

  /** Everything known about the call now; taken before any await, since the window may reset. */
  const snapshot = useCallback(
    () => ({
      callSessionId: sessionRef.current?.callSessionId ?? null,
      sessionWorkflowId: sessionRef.current?.workflowId ?? null,
      lead: { ...leadRef.current },
      uploads: [...uploadsRef.current],
      links: [...linksRef.current],
      payment: paymentRef.current,
      quote: quoteRef.current
        ? { ...quoteRef.current.request, total: quoteRef.current.total, approved: quoteRef.current.approved }
        : null,
    }),
    [],
  );

  // A call record an earlier visit could not save goes up now.
  useEffect(() => {
    void retryUnsavedCalls(owner).catch(() => {});
  }, [owner]);

  // Hanging up when the window unmounts; the save continues in the background.
  useEffect(
    () => () => {
      clearTimeout(speakerTimer.current);
      void callRef.current?.end();
    },
    [],
  );

  // Call clock, like Eva's status line.
  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // The tab closes mid-call: send the newest audio and the call so far with keepalive.
  useEffect(() => {
    const onHide = () => {
      const call = callRef.current;
      if (!call || call.getState() === 'ended' || !sessionRef.current?.callSessionId) return;
      recorderRef.current?.pageHide();
      saveOnPageHide(
        ownerRef.current,
        buildPostCallPayload({
          ...snapshot(),
          turns: call.getTurns(),
          reason: 'user',
          recording: recorderRef.current?.summary() ?? null,
        }),
      );
    };
    const onShow = () => recorderRef.current?.pageShow();
    const onVisibility = () => {
      if (callRef.current?.getState() !== 'live') return;
      note(document.hidden ? 'The client switched to another browser tab.' : 'The client came back to the call tab.');
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [note, snapshot]);

  const reset = useCallback(() => {
    setPhase('idle');
    setTurns([]);
    setSpeaker(null);
    setMuted(false);
    setError(null);
    setBusy(false);
    setReconnecting(false);
    setSeconds(0);
    setPanel(null);
    panelRef.current = null;
    setEarlier([]);
    setPanelsHidden(false);
    setCompact(false);
    renderWaiters.current.forEach((done) => done(false));
    renderWaiters.current.clear();
    quoteRef.current = null;
    setTextLarge(false);
    errorRef.current = null;
    callRef.current = null;
    sessionRef.current = null;
    leadRef.current = {};
    uploadsRef.current = [];
    linksRef.current = [];
    paymentRef.current = null;
  }, []);

  /** Puts a panel on screen in place of the current one (which moves to the earlier list). */
  const putOnScreen = useCallback((next: Panel | null) => {
    const prev = panelRef.current;
    panelRef.current = next;
    setPanel(next);
    setEarlier((list) => {
      const rest = list.filter((p) => p.id !== next?.id && !(prev && p.title === prev.title));
      return (prev && prev.id !== next?.id ? [prev, ...rest] : rest)
        .filter((p) => !(next && p.title === next.title))
        .slice(0, MAX_EARLIER);
    });
  }, []);

  /** Resolves true once the panel has rendered (RubyStage reports it), false after a timeout. */
  const showPanel = useCallback(
    (spec: PanelSpec): Promise<boolean> => {
      const next = { ...spec, id: `p${++panelSeq.current}` } as Panel;
      const shown = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          renderWaiters.current.delete(next.id);
          resolve(false);
        }, RENDER_TIMEOUT_MS);
        renderWaiters.current.set(next.id, (ok) => {
          clearTimeout(timer);
          renderWaiters.current.delete(next.id);
          resolve(ok);
        });
      });
      putOnScreen(next);
      setPanelsHidden(false);
      return shown;
    },
    [putOnScreen],
  );

  const panelRendered = useCallback((id: string) => renderWaiters.current.get(id)?.(true), []);

  /** Saves the call whatever way it ended (error, closed window, empty transcript). */
  const saveCall = useCallback(
    async (turnList: CallTurn[], reason: CallEndReason, recorder: CallRecorder | null) => {
      if (!sessionRef.current) {
        // The session never started, so there is no call to save; just release the audio.
        void recorder?.stop();
        return;
      }
      const who = ownerRef.current;
      const known = snapshot();
      // A copy first, so a tab closed during the final audio upload loses nothing.
      keepLocally(who, buildPostCallPayload({ ...known, turns: turnList, reason, recording: recorder?.summary() ?? null }));
      const recording = recorder ? await recorder.stop() : null;
      await saveCallRecord(who, buildPostCallPayload({ ...known, turns: turnList, reason, recording }));
    },
    [snapshot],
  );

  const startCall = useCallback(
    async (language: string) => {
      reset();
      setPhase('connecting');
      // Created inside the click so the browser lets its audio run.
      const recorder = createRecorder ? createRecorder() : new CallRecorder();
      recorder.prepare();
      recorderRef.current = recorder;
      const pastCalls = fetchPastCalls();
      notesRef.current?.stop();
      // eslint-disable-next-line prefer-const
      let call: WebRTCCall;
      const notes = new ScreenNotes({ send: (content) => void call?.appendInstruction(content) });
      notesRef.current = notes;
      const isCurrent = () => callRef.current === call;

      const host: ToolHost = {
        showPanel: (spec) => (isCurrent() ? showPanel(spec) : false),
        clearPanels: () => {
          if (isCurrent()) putOnScreen(null);
        },
        setLastQuote: (q) => {
          quoteRef.current = q;
        },
        setView: (view) => {
          if (!isCurrent()) return;
          if (view.captions !== undefined) setCaptionsOn(view.captions);
          if (view.textSize) setTextLarge(view.textSize === 'large');
          if (view.panel) setPanelsHidden(view.panel === 'hide');
          if (view.compact) setCompact(true);
        },
        updateLead: (fields) => {
          leadRef.current = { ...leadRef.current, ...fields };
        },
        setPayment: (p) => {
          paymentRef.current = p;
        },
        endAfterGoodbye: () => call?.endAfterGoodbye(),
        callSessionId: () => sessionRef.current?.callSessionId ?? null,
      };

      const callbacks: CallCallbacks = {
        onState: (s) => {
          if (s === 'live' && isCurrent()) setPhase('live');
        },
        onTranscript: (t) => isCurrent() && setTurns(t),
        onActivity: (who) => {
          if (!isCurrent()) return;
          setSpeaker(who);
          clearTimeout(speakerTimer.current);
          speakerTimer.current = setTimeout(() => setSpeaker(null), SPEAKER_HOLD_MS);
        },
        onMuteChange: (m) => {
          if (!isCurrent()) return;
          setMuted(m);
          note(m ? 'The client muted their microphone.' : 'The client unmuted their microphone.');
        },
        onError: (code) => {
          errorRef.current = code;
          if (isCurrent()) setError(code);
        },
        onLocalStream: (mic) => recorder.start(mic),
        onRemoteStream: (remote) => recorder.addRemote(remote),
        onBusy: (b) => isCurrent() && setBusy(b),
        onReconnecting: (r) => isCurrent() && setReconnecting(r),
        onEnded: async (result) => {
          notes.stop();
          if (isCurrent()) {
            clearTimeout(speakerTimer.current);
            setSpeaker(null);
            setBusy(false);
            setReconnecting(false);
            setPhase(errorRef.current ? 'error' : 'ended');
          }
          try {
            await saveCall(result.turns, result.reason, recorder);
          } catch {
            /* best effort: kept locally and retried on the next visit */
          }
        },
      };
      call = createCall ? createCall(callbacks) : new WebRTCCall(callbacks);
      callRef.current = call;
      await call.start({
        language,
        runTool: createCallTools(host),
        rubyLevel: () => recorder.remoteLevel(),
        clientName: user?.full_name ?? null,
        createSession: async ({ sdp, language: lang }) => {
          const session = await startVoiceSession({
            language: lang,
            sdp,
            clientName: user?.full_name ?? null,
            clientEmail: user?.email ?? null,
            caller: callerContext(),
            pastCalls: await pastCalls,
          });
          sessionRef.current = { callSessionId: session.callSessionId, workflowId: session.workflowId };
          recorder.setUploader(callAudioUploader(session.workflowId, session.callSessionId));
          return session;
        },
      });
    },
    [createCall, createRecorder, note, putOnScreen, reset, saveCall, showPanel, user?.email, user?.full_name],
  );

  const end = useCallback(() => void callRef.current?.end(), []);
  const toggleMute = useCallback(() => callRef.current?.toggleMute(), []);

  const toggleCaptions = useCallback(() => {
    note(captionsOn ? 'The client turned captions off.' : 'The client turned captions on.');
    setCaptionsOn(!captionsOn);
  }, [captionsOn, note]);

  const togglePanels = useCallback(() => {
    note(panelsHidden ? 'The client brought the panel back.' : 'The client hid the panel.');
    setPanelsHidden(!panelsHidden);
  }, [note, panelsHidden]);

  const closePanel = useCallback(
    (closed: Panel) => {
      if (panelRef.current?.id === closed.id) putOnScreen(null);
      note(`The client closed the ${closed.title} panel.`);
    },
    [note, putOnScreen],
  );

  const reopenPanel = useCallback(
    (again: Panel) => {
      putOnScreen(again);
      setPanelsHidden(false);
      note(`The client reopened the ${again.title} panel.`);
    },
    [note, putOnScreen],
  );

  const uploadFiles = useCallback(
    async (target: Panel, files: File[]): Promise<UploadOutcome[]> => {
      if (target.kind !== 'upload') return [];
      note(`The client is uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
      const outcomes: UploadOutcome[] = [];
      for (const file of files) {
        try {
          uploadsRef.current = [...uploadsRef.current, await uploadClientFile(file, target.purpose)];
          outcomes.push({ name: file.name, ok: true });
        } catch {
          outcomes.push({ name: file.name, ok: false, error: uploadProblem(file) ?? undefined });
          note(`An upload failed: ${file.name}. Ask if they want to try again.`);
        }
      }
      const names = outcomes.filter((o) => o.ok).map((o) => o.name);
      if (names.length) callRef.current?.appendInstruction(uploadedMessage(target.purpose, names));
      return outcomes;
    },
    [note],
  );

  const shareLink = useCallback((url: string) => {
    linksRef.current = [...linksRef.current, linkRecord(url)];
    callRef.current?.appendInstruction(linkMessage(url));
  }, []);

  const linkTyping = useCallback(() => note('The client opened the link field and is typing.'), [note]);

  const close = useCallback(() => {
    void callRef.current?.end();
    reset();
  }, [reset]);

  return {
    phase,
    turns,
    speaker,
    muted,
    error,
    busy,
    reconnecting,
    seconds,
    panel,
    earlier,
    panelsHidden,
    compact,
    panelRendered,
    reopenPanel,
    captionsOn,
    textLarge,
    startCall,
    end,
    close,
    reset,
    toggleMute,
    toggleCaptions,
    togglePanels,
    closePanel,
    uploadFiles,
    shareLink,
    linkTyping,
  };
}
