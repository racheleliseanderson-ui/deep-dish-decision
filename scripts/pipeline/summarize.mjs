/**
 * Short summary generated ONLY from fields already retrieved. The prompt is
 * given an explicit field list and the stored record keeps `basedOnFields`
 * so any sentence can be audited back to its evidence.
 */

const MODEL = "google/gemini-2.5-flash";

function evidenceFor(record, entry) {
  const g = entry.google ?? {};
  const s = entry.site ?? {};
  const fields = {};
  const put = (key, value) => {
    if (value === null || value === undefined || value === "" ) return;
    if (Array.isArray(value) && !value.length) return;
    fields[key] = value;
  };

  put("name", record.title);
  put("city", g.address?.locality || record.city);
  put("state", g.address?.state || record.stateProvince);
  put("neighborhood", g.address?.neighborhood);
  put("googleCategories", g.categories?.slice(0, 6));
  put("primaryCategory", g.primaryCategory);
  put("recordedCuisine", record.cuisineTags?.slice(0, 5));
  put("priceBand", g.priceBand);
  put("rating", g.rating);
  put("reviewCount", g.reviewCount);
  put(
    "amenities",
    Object.entries(g.amenities ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .slice(0, 10),
  );
  put(
    "accessibility",
    Object.entries(g.accessibility ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k),
  );
  put("servesDaysCount", g.hours?.filter((d) => d.intervals.length).length);
  put("reservationPlatform", s.reservationPlatform);
  put("dressCodeQuote", s.dressCode);
  put("groupPolicyQuote", s.groupPolicy);
  put("dietaryQuotes", s.dietaryLanguage?.map((d) => d.quote).slice(0, 2));
  return fields;
}

export async function summarize(record, entry) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const fields = evidenceFor(record, entry);
  if (Object.keys(fields).length < 4) return null;

  const prompt = [
    "Write a 2 to 3 sentence factual summary of this restaurant for a planning brief.",
    "Use ONLY the JSON fields provided. Do not add cuisine, atmosphere, quality, history, chef names, or any claim not present in the fields.",
    "If something is not in the fields, leave it out rather than hedging about it. No marketing language, no adjectives you cannot source.",
    "Plain prose, no headings, no bullet points, no quotation of the field names.",
    "",
    JSON.stringify(fields),
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 220,
    }),
  });

  if (!res.ok) {
    console.warn(`  summary failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) return null;

  return {
    text,
    model: MODEL,
    basedOnFields: Object.keys(fields),
    generatedAt: new Date().toISOString(),
  };
}
