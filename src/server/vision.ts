import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { VISION_SYSTEM_PROMPT, type VisionResult } from "@/lib/vision";

const VisionSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum([
        "dish",
        "price",
        "allergen",
        "hours",
        "access",
        "signage",
        "claim",
        "other",
      ]),
      label: z.string(),
      attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      confidence: z.enum(["high", "moderate", "low"]),
      text: z.string().optional(),
    }),
  ),
  fullText: z.string(),
  summary: z.string(),
  unknowns: z.array(z.string()),
});

/**
 * Server function: accept a base64 image + mime type, run Gemini multimodal
 * multi-item detection + OCR, return structured VisionResult.
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) in the environment.
 */
export const analyzeRestaurantPhoto = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string; mimeType: string }) => {
    if (!data?.imageBase64 || !data?.mimeType) {
      throw new Error("imageBase64 and mimeType are required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<VisionResult> => {
    const { object } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: VisionSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_SYSTEM_PROMPT },
            {
              type: "image",
              image: data.imageBase64,
              // @ts-expect-error mimeType is accepted by the provider
              mimeType: data.mimeType,
            },
          ],
        },
      ],
    });

    return {
      ...object,
      model: "gemini-2.0-flash",
      timestamp: new Date().toISOString(),
    };
  });
