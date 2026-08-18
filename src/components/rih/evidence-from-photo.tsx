import { useState } from "react";
import { analyzeRestaurantPhoto } from "@/server/vision";
import { visionToFindings, type VisionResult } from "@/lib/vision";
import type { Finding } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

type Props = {
  onFindings: (findings: Finding[]) => void;
  className?: string;
};

/**
 * Minimal photo evidence uploader for multi-item detection + OCR.
 * Results are converted to user-photo Findings and passed upward.
 * Never stores the image; only the structured extraction is kept in memory.
 */
export function EvidenceFromPhoto({ onFindings, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const res = await analyzeRestaurantPhoto({
        data: { imageBase64: base64, mimeType: file.type },
      });
      setResult(res);
      onFindings(visionToFindings(res));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Vision analysis failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-surface/40 p-4 space-y-3",
        className,
      )}
      aria-label="Evidence from photo"
    >
      <div>
        <p className="text-sm font-medium tracking-tight">Evidence from photo</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Upload a menu, printed claim, signage, or restaurant photo. Gemini performs multi-item
          detection + OCR. Results become labeled user-photo findings only — they never overwrite
          first-party evidence and cannot fail-close a decision on their own.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-start gap-2">
        <span className="text-xs text-muted-foreground">Choose image</span>
        <input
          type="file"
          accept="image/*"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
        />
      </label>

      {loading && (
        <p className="text-xs text-muted-foreground animate-pulse">Analyzing with multimodal vision…</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-md border border-border/60 bg-background/50 p-3 text-xs">
          <p className="font-medium">{result.summary}</p>
          {result.items.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4">
              {result.items.slice(0, 12).map((item, i) => (
                <li key={i}>
                  <span className="uppercase tracking-wider text-[10px] text-muted-foreground">
                    [{item.confidence}] {item.type}
                  </span>{" "}
                  {item.label}
                  {item.text ? ` — ${item.text.slice(0, 80)}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No high-confidence items extracted.</p>
          )}
          {result.unknowns.length > 0 && (
            <p className="text-muted-foreground">
              Unknowns: {result.unknowns.slice(0, 4).join("; ")}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            model {result.model} · {new Date(result.timestamp).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}
