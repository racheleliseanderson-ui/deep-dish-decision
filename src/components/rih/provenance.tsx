import type { RestaurantRecord } from "@/lib/dataset";
import { pageWord, provenanceOf, type Provenance } from "@/lib/provenance";

/**
 * Two provenance surfaces, deliberately not one component with the nouns
 * swapped. The masthead sits under a restaurant's name and has room to say
 * what a blank means. The trace sits in a ranked list, where the reader is
 * scanning eight of them and needs the host, the date and the count of things
 * nobody has answered — nothing else.
 */

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinHosts(hosts: string[]): string {
  if (hosts.length <= 1) return hosts[0] ?? "";
  const last = hosts[hosts.length - 1] ?? "";
  return `${hosts.slice(0, -1).join(", ")} and ${last}`;
}

function pagesLine(p: Provenance): string {
  if (!p.primaryHost) return "No source URL is filed here, which is itself the finding.";
  if (p.primaryIsPlatform) {
    return p.pageCount > 1
      ? `No site of their own turned up, so this is the software they post through — ${pageWord(p.pageCount)} pages of it.`
      : "No site of their own turned up. This is the page they post through.";
  }
  if (p.otherHosts.length === 0) {
    return p.pageCount === 1
      ? "One page, and it is theirs."
      : `${cap(pageWord(p.pageCount))} pages, all on their own domain.`;
  }
  return `${cap(pageWord(p.pageCount))} pages: ${p.ownPageCount} on their own domain, the rest on ${joinHosts(p.otherHosts)}.`;
}

function ageLine(p: Provenance): string {
  if (p.ageDays == null)
    return "No retrieval time is recorded, so treat every line below as undated.";
  if (p.ageDays === 0) return "Read today.";
  if (p.ageDays === 1) return "Yesterday.";
  if (p.band === "recent") {
    return `${p.ageDays} days ago. Recent enough that the hours below are probably still the hours.`;
  }
  if (p.band === "settled") {
    return `${p.ageDays} days ago. A menu can turn over in that time. Hours usually survive it; prices often do not.`;
  }
  const months = Math.round(p.ageDays / 30);
  return `${p.ageDays} days ago — about ${months} months. That is old, and we are not going to round it down for you.`;
}

function unknownsLine(p: Provenance): string | null {
  if (!p.unknowns.length) return null;
  const shown = p.unknowns.slice(0, 3).join("; ");
  const rest = p.unknowns.length - 3;
  if (rest <= 0) return `${shown}.`;
  return rest === 1 ? `${shown}; and one more.` : `${shown}; and ${rest} more.`;
}

/**
 * The record header band. First thing under the name, because the source and
 * the date are the reason to read the rest of the page at all.
 */
export function ProvenanceMasthead({ record }: { record: RestaurantRecord }) {
  const p = provenanceOf(record);
  const openList = unknownsLine(p);

  return (
    <section
      aria-label="Where this record came from"
      className="mt-6 max-w-4xl rounded-xl border border-border-strong bg-surface/70 p-4 sm:p-5"
    >
      <div className="grid gap-5 sm:grid-cols-3 sm:gap-7">
        <div className="min-w-0">
          <p className="text-eyebrow">Read from</p>
          {p.primaryUrl && p.primaryHost ? (
            <a
              href={p.primaryUrl}
              target="_blank"
              rel="noreferrer"
              className="tap mt-1.5 inline-block break-words text-[15px] font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              {p.primaryHost}
            </a>
          ) : (
            <p className="mt-1.5 text-[15px] font-medium text-unknown">no source on file</p>
          )}
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{pagesLine(p)}</p>
        </div>

        <div className="min-w-0">
          <p className="text-eyebrow">Read on</p>
          <p className="text-num mt-1.5 text-[15px] font-medium text-foreground">
            {p.readLong ?? "no date recorded"}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{ageLine(p)}</p>
        </div>

        <div className="min-w-0">
          <p className="text-eyebrow">Never stated</p>
          <p className="mt-1.5 text-[15px] font-medium text-unknown">
            <span className="text-num">{p.unknownCount}</span>{" "}
            {p.unknownCount === 1 ? "thing" : "things"} the restaurant has not put in writing
          </p>
          {openList ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              <a
                href="#never-stated"
                className="underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                {openList}
              </a>
            </p>
          ) : null}
          <p className="mt-1.5 text-[12px] leading-relaxed text-subtle">
            A blank means nobody said it; it never means we filled it in.
          </p>
        </div>
      </div>

      {p.standing ? (
        <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
          {p.standing}
          {p.dueSoon
            ? " It is past its own review date, and the date above is the one to trust."
            : ""}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The line on a ranked result. A star average cannot be written this way,
 * which is the entire point of putting it here.
 */
export function ProvenanceTrace({ record }: { record: RestaurantRecord }) {
  const p = provenanceOf(record);
  if (!p.primaryHost || !p.readShort) return null;

  return (
    <p
      className="mt-2 text-[12px] leading-relaxed text-subtle"
      title="Deep Dish records the page each line was read off and the day it was read. Anything the restaurant has never stated is counted, not guessed."
    >
      Read off{" "}
      <a
        href={p.primaryUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary hover:decoration-primary"
      >
        {p.primaryHost}
      </a>
      , <span className="text-num">{p.readShort}</span>
      {p.band === "recent" ? "." : ` — ${p.ageDays} days back.`}{" "}
      <span className="text-unknown">
        <span className="text-num">{p.unknownCount}</span>{" "}
        {p.unknownCount === 1 ? "thing their pages never say" : "things their pages never say"}.
      </span>
    </p>
  );
}
