import type { Finding } from "@/lib/intelligence";

/** Structured item extracted from a restaurant-related photo. */
export type VisionItem = {
  type: "dish" | "price" | "allergen" | "hours" | "access" | "signage" | "claim" | "other";
  label: string;
  attributes?: Record<string, string | number | boolean>;
  confidence: "high" | "moderate" | "low";
  text?: string;
};

/** Full result from Gemini multimodal multi-item detection + OCR. */
export type VisionResult = {
  items: VisionItem[];
  fullText: string;
  summary: string;
  unknowns: string[];
  model: string;
  timestamp: string;
};

/**
 * Convert vision results into Finding objects that respect the app philosophy.
 * - provenance is always "user-photo"
 * - layer is never "critical" (user evidence cannot fail-close on its own)
 * - impact is intentionally modest so first-party evidence remains primary
 */
export function visionToFindings(result: VisionResult): Finding[] {
  return result.items.map((item, i) => ({
    id: `user-photo-${Date.now()}-${i}-${item.label.slice(0, 24).replace(/\s+/g, "-")}`,
    layer: item.confidence === "low" ? "unknown" : "watch",
    domain: "user-evidence",
    title: `Photo evidence: ${item.label}`,
    detail:
      item.text ||
      (item.attributes ? JSON.stringify(item.attributes) : "Extracted from user-uploaded photo."),
    action:
      "User-supplied photo evidence (OCR + multi-item detection). Confirm against first-party sources before relying on it for a decision. Never treat as official restaurant statement.",
    impact: item.confidence === "high" ? 32 : item.confidence === "moderate" ? 20 : 12,
    confidence: item.confidence,
    situational: false,
    provenance: "user-photo",
  }));
}

export const VISION_SYSTEM_PROMPT = `You are analyzing a photograph related to a restaurant for a first-party evidence decision tool called Deep Dish Decision / Restaurant Insight Engine.

Perform multi-item detection and OCR with high conservatism.

Extract every distinct, clearly visible item:
- Dishes / menu items (name, description fragments, prices if legible)
- Allergen or dietary notes
- Hours / service times
- Accessibility features (stairs, ramps, step-free entrance, elevator, restroom notes)
- Signage text, claims, printed policies
- Atmosphere or service cues that are explicit in text or obvious visual elements

Return ONLY valid JSON matching this exact schema (no markdown, no commentary):
{
  "items": [
    {
      "type": "dish" | "price" | "allergen" | "hours" | "access" | "signage" | "claim" | "other",
      "label": string,
      "attributes": object (optional),
      "confidence": "high" | "moderate" | "low",
      "text": string (optional)
    }
  ],
  "fullText": string (all readable text concatenated),
  "summary": string (one short paragraph of what the photo shows),
  "unknowns": string[] (things that were illegible, partially obscured, or ambiguous)
}

Rules:
- Prefer low confidence or unknowns over invention.
- Never invent prices, allergens, hours, or access claims that are not clearly visible.
- If the image is not restaurant-related, return empty items and note it in unknowns.
- Be precise and conservative. This output will be labeled as user-photo evidence only.`;
