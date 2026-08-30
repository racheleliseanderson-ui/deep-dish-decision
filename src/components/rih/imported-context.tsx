import { describeHandoff, summarizeHandoff } from "@/lib/salty-handoff/codec.ts";
import type { ImportSession } from "@/lib/salty-handoff/import-session.ts";

export function ImportedContext({
  session,
  onApply,
  onIgnore,
  applyLabel = "Use this context",
}: {
  session: ImportSession;
  onApply: () => void;
  onIgnore: () => void;
  applyLabel?: string;
}) {
  if (session.phase === "failed") {
    return (
      <div role="status" className="mx-auto mt-6 max-w-7xl min-w-0 px-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised/60 p-4">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
            {session.message}
          </p>
          <button
            type="button"
            onClick={onIgnore}
            className="tap inline-flex min-h-11 items-center px-3 text-xs uppercase tracking-widest text-subtle"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (session.phase !== "offered" || !session.handoff) return null;

  const rows = summarizeHandoff(session.handoff);

  return (
    <aside
      aria-label="Context from another tool"
      className="mx-auto mt-6 max-w-7xl min-w-0 px-4 sm:px-6"
    >
      <div className="overflow-hidden rounded-xl border border-gilt/40 bg-surface-raised/60">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <p className="text-eyebrow text-gilt">Brought with you</p>
          <p className="mt-2 text-pretty font-display text-xl leading-snug tracking-tight">
            {describeHandoff(session.handoff)}
          </p>
        </div>
        <dl className="grid min-w-0 grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-eyebrow">{row.label}</dt>
              <dd className="mt-1 break-words text-[13px] leading-snug text-muted-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {(session.overwrites || session.stale) && (
          <div className="border-t border-border px-4 py-3 text-[13px] leading-relaxed text-muted-foreground sm:px-5">
            {session.overwrites && (
              <p>You already have a situation open. Using this will replace the current night.</p>
            )}
            {session.stale && (
              <p className="mt-1">This is more than a week old — check the date still holds.</p>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap gap-2 border-t border-border px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onApply}
            className="tap inline-flex min-h-11 flex-1 items-center justify-center bg-primary px-4 text-sm text-primary-foreground sm:flex-none"
          >
            {applyLabel}
          </button>
          <button
            type="button"
            onClick={onIgnore}
            className="tap inline-flex min-h-11 flex-1 items-center justify-center border border-border px-4 text-sm text-subtle sm:flex-none"
          >
            Ignore
          </button>
        </div>
      </div>
    </aside>
  );
}
