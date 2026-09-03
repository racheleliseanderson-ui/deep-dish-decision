// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md
import { Chip, Eyebrow } from "@/components/rih/bits";
import { GiltRule } from "@/components/rih/gilt";
import {
  PLAYBOOKS,
  applyPlaybook,
  playbookMatches,
  playbooksByChapter,
  type Playbook,
  type PlaybookChapter,
} from "@/lib/playbooks";
import type { Situation } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

const CHAPTER_LABEL: Record<PlaybookChapter, string> = {
  night: "Night",
  format: "Format",
  constraint: "Constraint",
};

function ChapterMark({ chapter }: { chapter: PlaybookChapter }) {
  const glyph =
    chapter === "night" ? "01" : chapter === "format" ? "02" : "03";
  return (
    <span className="text-num text-[11px] tracking-[0.2em] text-gilt">{glyph}</span>
  );
}

function PlaybookCard({
  p,
  active,
  onApply,
}: {
  p: Playbook;
  active: boolean;
  onApply: (p: Playbook) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onApply(p)}
      className={cn(
        "tap rounded-2xl border p-3.5 text-left transition-all duration-300 ease-instrument sm:p-4",
        active
          ? "border-primary/45 bg-primary/8 shadow-lift"
          : "border-border bg-surface hover:border-border-strong hover:shadow-lift",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[15px] leading-tight tracking-tight">{p.title}</h3>
        {active ? <Chip tone="accent">Active</Chip> : null}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{p.lede}</p>
    </button>
  );
}

export function ScenarioPlaybooks({
  situation,
  onApply,
}: {
  situation: Situation;
  onApply: (next: Situation) => void;
}) {
  const by = playbooksByChapter();
  const chapters = (Object.keys(by) as PlaybookChapter[]).filter((c) => by[c].length);

  return (
    <section className="mt-10">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
        <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">PLAY</span>
        <span className="text-eyebrow truncate">Situation playbooks</span>
      </div>
      <GiltRule className="mt-3" />
      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        Starting points only. Each playbook fills situation fields and leaves the evidence alone.
        Fail-closed rules still apply.
      </p>

      <div className="mt-6 space-y-8">
        {chapters.map((ch) => (
          <div key={ch}>
            <div className="mb-3 flex items-center gap-3">
              <ChapterMark chapter={ch} />
              <Eyebrow>{CHAPTER_LABEL[ch]}</Eyebrow>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {by[ch].map((p) => (
                <PlaybookCard
                  key={p.id}
                  p={p}
                  active={playbookMatches(p, situation)}
                  onApply={(pb) => onApply(applyPlaybook(pb, situation))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-subtle">
        {PLAYBOOKS.length} playbooks
      </p>
    </section>
  );
}
