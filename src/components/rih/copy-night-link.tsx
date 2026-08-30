/**
 * Copy night link — encodes the active Situation into a shareable URL.
 * Clipboard + brief "Copied" feedback. Never invents evidence.
 */

import type { Situation } from "@/lib/intelligence";
import { encodeSituation } from "@/lib/situation-url";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function CopyNightLink({
  situation,
  className,
}: {
  situation: Situation;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const q = encodeSituation(situation);
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://deepdish.saltnotes.blog";
    // Canonical share URL: origin root with situation query when present.
    const url = q ? `${origin}/?${q}` : `${origin}/`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — fail closed, no toast noise */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "tap min-h-11 rounded-full border px-4 py-2 text-xs transition-colors sm:min-h-0 sm:px-3 sm:py-1.5",
        copied
          ? "border-verified/45 bg-verified-soft text-verified"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
        className,
      )}
      aria-live="polite"
    >
      {copied ? "Copied" : "Copy night link"}
    </button>
  );
}
