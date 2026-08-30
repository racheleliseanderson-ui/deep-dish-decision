import { outgoingRestaurantToDesk } from "@/lib/salty-handoff/apply";
import type { DecisionStatus } from "@/lib/salty-handoff/contract.ts";

export function ReturnToDesk({
  room,
  status = "shortlisted",
  unresolved = [],
}: {
  room: string;
  status?: DecisionStatus;
  unresolved?: string[];
}) {
  const { url } = outgoingRestaurantToDesk({ room, status, unresolved });

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-3.5">
      <p className="text-eyebrow text-gilt">When you are ready</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        Return {room} to the Desk so the decision stays with the night. Rejected rooms and browsing
        stay here.
      </p>
      <a
        href={url}
        className="tap mt-3 inline-flex min-h-11 items-center bg-primary px-4 text-sm text-primary-foreground"
      >
        Return this decision to the Desk
      </a>
    </div>
  );
}
