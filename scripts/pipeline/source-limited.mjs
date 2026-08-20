export const SOURCE_LIMITED_AUTHORITY = "Operator-managed platform source; no owned domain confirmed";

const PLATFORM_HOSTS = [
  "facebook.com",
  "instagram.com",
  "toasttab.com",
  "fetail.com",
];

export function sourceHost(url) {
  try {
    return new URL(String(url || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isOperatorPlatformUrl(url) {
  const host = sourceHost(url);
  return PLATFORM_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function isSourceLimitedRecord(record) {
  return (
    String(record?.sourceAuthority || "") === SOURCE_LIMITED_AUTHORITY &&
    isOperatorPlatformUrl(record?.officialSource) &&
    !String(record?.website || "").trim()
  );
}

function uniq(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

export function applySourceLimitedRecord(record, task, reviewedAt) {
  if (!record) throw new Error("record required");
  if (!task?.officialSource || !isOperatorPlatformUrl(task.officialSource)) {
    throw new Error(`unsupported operator platform source: ${task?.officialSource || "missing"}`);
  }
  const additional = (task.additionalSources ?? []).filter(isOperatorPlatformUrl);
  const sourceAuthority = task.sourceAuthority || SOURCE_LIMITED_AUTHORITY;
  if (sourceAuthority !== SOURCE_LIMITED_AUTHORITY) {
    throw new Error(`unexpected sourceAuthority: ${sourceAuthority}`);
  }

  record.website = "";
  record.officialSource = task.officialSource;
  record.additionalSources = additional.join("; ");
  record.sources = uniq([...(record.sources ?? []), task.officialSource, ...additional]);
  record.sourceAuthority = SOURCE_LIMITED_AUTHORITY;
  record.confidence = "operator_source_only";
  record.freshnessStatus = "SOURCE_LIMITED_OPERATOR_PLATFORM";
  record.reviewStatus = "listing_only";
  record.reviewedAt = reviewedAt.slice(0, 10);
  record.nextReviewAt = new Date(Date.parse(`${record.reviewedAt}T00:00:00Z`) + 30 * 864e5)
    .toISOString()
    .slice(0, 10);
  record.disclaimer =
    "Operator-managed platform source identified, but no owned domain is confirmed. Treat policy, accessibility, dietary, pricing and hours details as unverified until confirmed directly.";
  record.nextAction =
    "Recheck for an owned restaurant domain or confirm volatile details directly by phone; do not promote platform-hosted directory/menu content into owned-site evidence.";
  record.fieldVolatility =
    "No owned domain confirmed. Operator-platform identity is current, but hours, pricing and policy details remain volatile and unverified.";
  return record;
}

export function sourceLimitedMeta(priorMeta, reviewedAt) {
  return {
    ...(priorMeta ?? {}),
    matchStatus: "source-limited",
    lastEnrichedAt: reviewedAt,
    enrichmentMode: "operator-platform-source",
  };
}
