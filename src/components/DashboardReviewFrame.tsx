import { useEffect, useRef } from "react";

type Props = { onLaunch: (id: string) => void };

export default function DashboardReviewFrame({ onLaunch }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "formanova-review-launch" && typeof event.data.id === "string") onLaunch(event.data.id);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onLaunch]);
  return <iframe ref={frame} title="Dashboard design review" src="/dashboard-review/index.html?embedded"
    className="block h-[calc(100dvh-5rem)] w-full border-0" />;
}
