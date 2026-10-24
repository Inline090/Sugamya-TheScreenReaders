/**
 * Vision drafting adapter.
 *
 * Optional and bounded. It drafts alt text for an image and returns a
 * PROVISIONAL value: the caller injects it with a provisional marker and the
 * approver must confirm or edit it before it is treated as final.
 *
 * The provider is configured with:
 *   SUGAMYA_VISION_ENDPOINT  (OpenAI-compatible chat-completions URL)
 *   SUGAMYA_VISION_API_KEY   (falls back to SUGAMYA_MODEL_API_KEY)
 *   SUGAMYA_VISION_MODEL     (default xiaomi/mimo-v2.5)
 *
 * The Command Code API base is https://api.commandcode.ai, but its public chat
 * route is not confirmed. When no endpoint/key is present this returns a
 * contextual provisional draft and clearly states that vision was not used.
 */
export const VISION = {
  endpoint:
    process.env.SUGAMYA_VISION_ENDPOINT ||
    process.env.SUGAMYA_MODEL_ENDPOINT ||
    "",
  key:
    process.env.SUGAMYA_VISION_API_KEY ||
    process.env.SUGAMYA_MODEL_API_KEY ||
    "",
  model: process.env.SUGAMYA_VISION_MODEL || "xiaomi/mimo-v2.5",
};

function fallback() {
  // The user asked for this exact placeholder when no vision route is
  // configured. It is clearly provisional and goes to the approver.
  return {
    value: "changed via sugamya",
    source: "placeholder (vision route pending)",
    provisional: true,
    vision: false,
  };
}

/**
 * Draft alt text for one image. Always resolves; never throws into the scan.
 */
export async function draftAlt({ imageUrl, context }) {
  if (!VISION.endpoint || !VISION.key) return fallback(context, imageUrl);
  try {
    const r = await fetch(VISION.endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + VISION.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION.model,
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "You write concise alt text for a screen reader. Return ONLY JSON: {\"alt\": string, \"uncertainty\": string}. Do not invent details you cannot see. If the image is decorative, return an empty alt.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Describe this image for a screen reader. Page context: " +
                  JSON.stringify(context || ""),
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return fallback(context, imageUrl);
    const text = await r.text();
    const parsed = JSON.parse(text);
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallback(context, imageUrl);
    const inner = JSON.parse(content);
    if (typeof inner.alt !== "string") return fallback(context, imageUrl);
    return {
      value: inner.alt.trim().slice(0, 300) || "Image pending description",
      source: "vision model (" + VISION.model + ")",
      provisional: true,
      vision: true,
      uncertainty: String(inner.uncertainty || "").slice(0, 300),
    };
  } catch {
    return fallback(context, imageUrl);
  }
}
