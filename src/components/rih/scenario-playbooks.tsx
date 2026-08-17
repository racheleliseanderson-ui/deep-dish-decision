import { Chip, Eyebrow } from "@/components/rih/bits";
import { GiltRule } from "@/components/rih/gilt";
import { CHAPTERS, PLAYBOOKS, applyPlaybook, playbookMatches, type Playbook } from "@/lib/playbooks";
import type { Situation } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

function ChapterMark({ chapter }: { chapter: string }) {
  const map: Record<string, string> = {
    night: "N",
    format: "F",
    constraint: "C",
  };
  return (
    <span className="text-num flex size-7 items-center justify-center rounded-full border border-gilt/40 text-[11px] text-gilt">
      {map[chapter] ?? "·"}
    </span>
  );
}

export function ScenarioPlaybooks({
  situation,
  onApply,
}: {
  situation: Situation;
  onApply: (next: Situation) => void;
}) {
  return (
    <div className="space-y-10">
      {CHAPTERS.map((ch) => {
        const items = PLAYBOOKS.filter((p) => p.chapter === ch.id);
        return (
          <section key={ch.id}>
            <div className="flex items-center gap-3">
              <ChapterMark chapter={ch.id} />
              <div className="min-w-0">
                <Eyebrow>{ch.label}</Eyebrow>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{ch.lede}</p>
              </div>
            </div>
            <GiltRule className="mt-3 max-w-md" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((pb) => (
                <PlaybookCard
                  key={pb.id}
                  pb={pb}
                  active={playbookMatches(situation, pb)}
                  onApply={() => onApply(applyPlaybook(pb, situation))}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlaybookCard({
  pb,
  active,
  onApply,
}: {
  pb: Playbook;
  active: boolean;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      className={cn(
        "tap rounded-xl border p-4 text-left transition-all duration-300 ease-instrument",
        active
          ? "border-primary/45 bg-primary/10"
          : "border-border bg-surface hover:border-border-strong hover:shadow-lift",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[15px] leading-snug tracking-tight">{pb.title}</h3>
        {active ? <Chip tone="accent">Active</Chip> : null}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{pb.lede}</p>
    </button>
  );
}
