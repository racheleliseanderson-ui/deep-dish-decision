import { outgoingRestaurantToDesk, type UnresolvedItem } from "@/lib/salty-handoff/apply";
import { APP_ORIGINS, type DecisionStatus } from "@/lib/salty-handoff/contract.ts";

/**
 * Hand this decision back to the Desk.
 *
 * The handoff payload is stamped with the moment it was created, so building
 * it during render made the server's href and the client's href disagree and
 * broke hydration for the whole route. The link now carries a stable, plain
 * Desk URL — which still works with JavaScript disabled — and mints the
 * timestamped handoff at the moment of the click, which is also when the
 * timestamp is actually true.
 */
export function ReturnToDesk({
  room,
  status = "shortlisted",
  unresolved = [],
}: {
  room: string;
  status?: DecisionStatus;
  /**
   * Findings, not sentences. outgoingRestaurantToDesk reduces each one to a
   * category label before it leaves the app; passing the finding lets it read
   * the label off `domain` instead of guessing from prose.
   */
  unresolved?: readonly UnresolvedItem[];
}) {
  const fallbackUrl = `${APP_ORIGINS.desk}/`;

  const handoffNow = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (new tab, download, etc.).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const { url } = outgoingRestaurantToDesk({ room, status, unresolved });
    window.location.href = url;
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-3.5">
      <p className="text-eyebrow text-gilt">When you are ready</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        Return {room} to the Desk so the decision stays with the night. Rejected rooms and browsing
        stay here.
      </p>
      <a
        href={fallbackUrl}
        onClick={handoffNow}
        className="tap mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm text-primary-foreground transition-opacity hover:opacity-90"
      >
        Return this decision to the Desk
      </a>
    </div>
  );
}
