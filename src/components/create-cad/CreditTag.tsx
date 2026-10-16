import type { ReactNode } from "react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";

/**
 * The price inside a paid button, after a thin divider: our standard for
 * every button that spends credits. `tone="line"` for outlined buttons.
 */
export default function CreditTag({ value, tone = "solid" }: { value: ReactNode; tone?: "solid" | "line" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 border-l pl-3 ${tone === "solid" ? "border-background/30" : "border-border"}`}>
      <img src={creditCoinIcon} alt="" className="h-4 w-4" />
      <span className="font-mono text-sm">{value}</span>
    </span>
  );
}
