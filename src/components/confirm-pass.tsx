import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Eyebrow, Field, Input, LayerBadge, Select, Textarea } from "@/components/ui";
import {
  applyCapture,
  applyItem,
  callScript,
  CHANNEL_LABELS,
  mustOpenCount,
  packetPlaintext,
  passProgress,
} from "@/lib/confirm";
import { track } from "@/lib/storage";
import { useNight } from "@/lib/store";
import type { ConfirmationPass, ConfirmItem, ConfirmStatus, RestaurantRecord } from "@/lib/types";
import { copyText, formatHumanDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const STATUSES: { id: ConfirmStatus; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "denied", label: "Denied — cannot do this" },
  { id: "still-unknown", label: "Still unknown" },
  { id: "not-applicable", label: "Not applicable" },
  { id: "open", label: "Not asked yet" },
];

function ItemCard({
  item,
  index,
  onChange,
}: {
  item: ConfirmItem;
  index: number;
  onChange: (id: string, patch: Partial<ConfirmItem>) => void;
}) {
  const [openWhy, setOpenWhy] = useState(false);
  return (
    <li className="plate break-inside-avoid p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-num text-[11px] text-gilt">{String(index + 1).padStart(2, "0")}</span>
        <LayerBadge layer={item.priority === "must" ? "critical" : item.priority === "should" ? "watch" : "unknown"} />
        <span className="text-eyebrow">{item.category.replace("-", " ")}</span>
        <LayerBadge layer={item.status} />
      </div>
      <p className="mt-3 font-display text-xl leading-snug tracking-tight">“{item.question}”</p>
      <button
        type="button"
        className="tap mt-2 inline-flex items-center text-sm text-primary underline underline-offset-2"
        onClick={() => setOpenWhy((v) => !v)}
      >
        {openWhy ? "Hide why this matters" : "Why this matters"}
      </button>
      {openWhy ? (
        <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          <p>{item.why}</p>
          <p>
            <span className="text-foreground">On the record: </span>
            {item.evidence || "Nothing useful published."}
          </p>
        </div>
      ) : null}

      <fieldset className="mt-4">
        <legend className="sr-only">Status for this question</legend>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <label
              key={s.id}
              className={cn(
                "tap inline-flex items-center rounded-full border px-3 text-xs",
                item.status === s.id
                  ? "border-primary/60 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={`st-${item.id}`}
                checked={item.status === s.id}
                onChange={() => onChange(item.id, { status: s.id })}
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="What they said">
          <Textarea
            value={item.answer}
            onChange={(e) => onChange(item.id, { answer: e.target.value })}
            placeholder="Exact words if you can."
          />
        </Field>
        <Field label="Who answered">
          <Input
            value={item.askedOf}
            onChange={(e) => onChange(item.id, { askedOf: e.target.value })}
            placeholder="Name or station — host, manager, kitchen"
          />
        </Field>
      </div>
    </li>
  );
}

function CopyButton({ label, getText, event }: { label: string; getText: () => string; event: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const ok = await copyText(getText());
        if (ok) {
          setDone(true);
          track(event);
          window.setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

export function ConfirmPassView({
  pass,
  record,
}: {
  pass: ConfirmationPass;
  record: RestaurantRecord;
}) {
  const savePass = useNight((s) => s.savePass);
  const progress = passProgress(pass);
  const openMust = mustOpenCount(pass);

  const onItem = (id: string, patch: Partial<ConfirmItem>) => {
    savePass(applyItem(pass, id, patch));
  };
  const onCapture = (patch: Parameters<typeof applyCapture>[1]) => {
    savePass(applyCapture(pass, patch));
  };

  const mustItems = pass.items.filter((i) => i.priority === "must");
  const other = pass.items.filter((i) => i.priority !== "must");

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Confirmation pass</Eyebrow>
          <h1 className="mt-1 font-display text-4xl tracking-tight">{record.title}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            One call, in this order, before you book. Exact questions. Unresolved restrictions stay
            unresolved until someone at the restaurant answers them. The packet is the record of
            what you actually verified — not a rating.
          </p>
        </div>
        <div className="text-right">
          <LayerBadge layer={pass.status} />
          <p className="text-num mt-2 text-sm text-subtle">
            {progress.done}/{progress.total} must-ask cleared · {openMust} still open
          </p>
        </div>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-label="Must-ask questions cleared"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-valuetext={`${progress.done} of ${progress.total} must-ask questions cleared`}
      >
        <div
          className={cn(
            "h-full transition-[width] duration-300",
            pass.status === "hold" ? "bg-critical" : pass.status === "verified" ? "bg-verified" : "bg-primary",
          )}
          style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
        />
      </div>

      <aside className="plate flex flex-wrap items-start justify-between gap-3 p-4 text-[13px] leading-relaxed text-muted-foreground sm:p-5">
        <p className="max-w-xl">
          Call {record.phone || "the number on the official page"}. Script is written to be read
          aloud. Confirm before you book, not after.
          {record.reservationUrl ? (
            <>
              {" "}
              Booking path:{" "}
              <a
                className="text-primary underline underline-offset-2"
                href={record.reservationUrl}
                target="_blank"
                rel="noreferrer"
              >
                {record.bookingPlatforms[0]}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          ) : null}
        </p>
        <CopyButton label="Copy the call script" getText={() => callScript(pass, record)} event="share_used" />
      </aside>

      <ol className="space-y-4">
        {mustItems.map((item, i) => (
          <ItemCard key={item.id} item={item} index={i} onChange={onItem} />
        ))}
      </ol>

      {other.length ? (
        <details className="plate p-4 sm:p-5">
          <summary className="cursor-pointer font-medium">
            Should-ask and if-relevant ({other.length})
          </summary>
          <ol className="mt-4 space-y-4">
            {other.map((item, i) => (
              <ItemCard key={item.id} item={item} index={mustItems.length + i} onChange={onItem} />
            ))}
          </ol>
        </details>
      ) : null}

      <section className="plate p-5 sm:p-6" aria-labelledby="capture-h">
        <Eyebrow>Reservation record</Eyebrow>
        <h2 id="capture-h" className="mt-1 font-display text-2xl tracking-tight">
          What you actually booked
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Confirmation number, who you spoke to, and the date you confirmed. Without these the
          packet cannot read “verified.”
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Confirmation number">
            <Input
              value={pass.capture.confirmationNumber}
              onChange={(e) => onCapture({ confirmationNumber: e.target.value })}
              placeholder="OT-… / verbal hold / none yet"
            />
          </Field>
          <Field label="Date confirmed">
            <Input
              type="date"
              value={pass.capture.dateConfirmed}
              onChange={(e) => onCapture({ dateConfirmed: e.target.value })}
            />
          </Field>
          <Field label="Contact person">
            <Input
              value={pass.capture.contactPerson}
              onChange={(e) => onCapture({ contactPerson: e.target.value })}
              placeholder="Name or station"
            />
          </Field>
          <Field label="Channel">
            <Select
              value={pass.capture.channel}
              onChange={(e) => onCapture({ channel: e.target.value as typeof pass.capture.channel })}
            >
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reservation date">
            <Input
              type="date"
              value={pass.capture.reservationDate}
              onChange={(e) => onCapture({ reservationDate: e.target.value })}
            />
          </Field>
          <Field label="Reservation time">
            <Input
              type="time"
              value={pass.capture.reservationTime}
              onChange={(e) => onCapture({ reservationTime: e.target.value })}
            />
          </Field>
          <Field label="Party size confirmed">
            <Input
              type="number"
              min={1}
              value={pass.capture.partySizeConfirmed ?? ""}
              onChange={(e) =>
                onCapture({ partySizeConfirmed: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <Field label="Cancellation deadline">
            <Input
              value={pass.capture.cancellationDeadline}
              onChange={(e) => onCapture({ cancellationDeadline: e.target.value })}
              placeholder="48 hours / 3 hours / none stated"
            />
          </Field>
          <Field label="Deposit / card hold">
            <Input
              value={pass.capture.depositAmount}
              onChange={(e) => onCapture({ depositAmount: e.target.value })}
              placeholder="Amount, or none"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={pass.capture.notes}
              onChange={(e) => onCapture({ notes: e.target.value })}
            />
          </Field>
        </div>
      </section>

      {pass.status === "hold" ? (
        <p className="rounded-2xl border border-critical/40 bg-critical-soft px-4 py-3 text-[13px] text-critical">
          Hold. A must-ask was denied. Do not book against inference. The packet will show the
          denial.
        </p>
      ) : null}
      {pass.status === "verified" ? (
        <p className="rounded-2xl border border-verified/40 bg-verified-soft px-4 py-3 text-[13px] text-verified">
          Verified. Every must-ask is confirmed or not applicable, and the reservation is recorded.
        </p>
      ) : null}

      <div className="sticky bottom-20 z-20 flex flex-wrap gap-2">
        <Button asChild>
          <Link
            to="/packet/$id"
            params={{ id: pass.id }}
            onClick={() => track("export_used", { slug: pass.slug })}
          >
            {pass.status === "verified" ? "Open verified packet" : "Open working packet"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/record/$slug" params={{ slug: record.slug }}>
            Back to the file
          </Link>
        </Button>
        <CopyButton label="Copy packet" getText={() => packetPlaintext(pass, record)} event="export_used" />
      </div>
    </div>
  );
}

export function PacketView({ pass, record }: { pass: ConfirmationPass; record: RestaurantRecord }) {
  const open = useMemo(
    () => pass.items.filter((i) => i.status === "open" || i.status === "still-unknown"),
    [pass.items],
  );
  const confirmed = pass.items.filter((i) => i.status === "confirmed" || i.status === "not-applicable");
  const denied = pass.items.filter((i) => i.status === "denied");

  return (
    <article className="plate space-y-6 p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <header className="border-b border-border pb-5">
        <p className="text-eyebrow text-gilt">Salty & Clever · Confirmation & reservation record</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">{record.title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {record.address} · {record.recordId} · {record.phone}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
          <LayerBadge layer={pass.status} />
          <span className="text-subtle">
            Night {formatHumanDate(pass.capture.reservationDate || pass.situation.nightDate)} · generated{" "}
            {pass.updatedAt.slice(0, 16).replace("T", " ")}
          </span>
        </p>
      </header>

      <section>
        <Eyebrow>The night</Eyebrow>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ["Occasion", pass.situation.occasion ?? "not stated"],
            ["Party", pass.capture.partySizeConfirmed ?? pass.situation.partySize ?? "not stated"],
            ["Date", formatHumanDate(pass.capture.reservationDate || pass.situation.nightDate)],
            ["Time", pass.capture.reservationTime || pass.situation.nightTime || "not stated"],
            ["Constraints", pass.situation.constraints.join("; ") || "none stated"],
            ["Region", pass.situation.regionGroup ?? "not stated"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border pb-1.5 text-[13px]">
              <dt className="text-subtle">{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <Eyebrow>Reservation</Eyebrow>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ["Confirmation number", pass.capture.confirmationNumber || "not recorded"],
            ["Date confirmed", formatHumanDate(pass.capture.dateConfirmed) || "not recorded"],
            ["Contact person", pass.capture.contactPerson || "not recorded"],
            ["Channel", CHANNEL_LABELS[pass.capture.channel]],
            ["Cancellation deadline", pass.capture.cancellationDeadline || "not recorded"],
            ["Deposit / hold", pass.capture.depositAmount || "not recorded"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border pb-1.5 text-[13px]">
              <dt className="text-subtle">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {pass.capture.notes ? <p className="mt-3 text-[13px] text-muted-foreground">{pass.capture.notes}</p> : null}
      </section>

      {denied.length ? (
        <section>
          <Eyebrow>Denied — booking held</Eyebrow>
          <ol className="mt-3 space-y-2">
            {denied.map((i) => (
              <li key={i.id} className="text-[13px]">
                <p className="font-medium text-critical">{i.question}</p>
                <p className="text-muted-foreground">{i.answer || "Denied with no note."}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section>
        <Eyebrow>We actually verified</Eyebrow>
        <ol className="mt-3 space-y-3">
          {confirmed.map((i) => (
            <li key={i.id} className="break-inside-avoid text-[13px]">
              <p className="font-medium">
                {i.question} <LayerBadge layer={i.status} />
              </p>
              {i.answer ? <p className="mt-1 text-muted-foreground">{i.answer}</p> : null}
              {i.askedOf ? <p className="text-subtle">Answered by {i.askedOf}</p> : null}
            </li>
          ))}
        </ol>
        {!confirmed.length ? (
          <p className="mt-2 text-[13px] text-watch">Nothing confirmed yet. This is a working packet.</p>
        ) : null}
      </section>

      {open.length ? (
        <section>
          <Eyebrow>Still open — carried forward, not resolved</Eyebrow>
          <ul className="mt-3 space-y-2">
            {open.map((i) => (
              <li key={i.id} className="text-[13px] text-muted-foreground">
                {i.priority === "must" ? <span className="text-critical">Must-ask. </span> : null}
                {i.question}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <Eyebrow>Sources and limits</Eyebrow>
        <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
          {record.sources.map((s) => (
            <li key={s} className="break-all">
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-subtle">
          {record.sourceAuthority} · {record.confidence.replace(/_/g, " ")} · reviewed {record.reviewedAt} ·{" "}
          {record.disclaimer}
        </p>
      </section>
    </article>
  );
}
