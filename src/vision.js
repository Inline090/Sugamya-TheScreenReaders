/**
 * Vision drafting adapter.
 *
 * Drafts alt text for an image and returns a PROVISIONAL value. The caller
 * injects it with a provisional marker and the approver must confirm or edit
 * it before it is treated as final.
 *
 * Two providers are supported:
 *  - A local Ollama vision model (default `moondream`) at SUGAMYA_OLLAMA_URL.
 *  - An OpenAI-compatible endpoint configured with SUGAMYA_VISION_ENDPOINT,
 *    SUGAMYA_VISION_API_KEY and SUGAMYA_VISION_MODEL.
 *
 * If neither is available it returns the explicit placeholder and marks it
 * provisional.
 */
const OLLAMA = process.env.SUGAMYA_OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.SUGAMYA_OLLAMA_MODEL || "moondream";

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
  ollama: OLLAMA,
  ollamaModel: OLLAMA_MODEL,
};

function fallback() {
  return {
    value: "changed via sugamya",
    source: "placeholder (no vision model reachable)",
    provisional: true,
    vision: false,
  };
}

async function imageBase64(imageUrl) {
  const r = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) return null;
  return buf.toString("base64");
}

async function ollamaDraft(imageUrl, context) {
  try {
    const b64 = await imageBase64(imageUrl);
    if (!b64) {
      if (process.env.DEBUG_VISION) console.error("vision: no image bytes");
      return null;
    }
    const r = await fetch(VISION.ollama + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION.ollamaModel,
        stream: false,
        messages: [
          {
            role: "user",
            content:
              "Describe this image in one short sentence for a screen reader alt attribute. " +
              "Page context: " +
              (context || ""),
            images: [b64],
          },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) {
      if (process.env.DEBUG_VISION)
        console.error("vision: ollama status", r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const j = await r.json();
    const text = String(j.message?.content || "").trim();
    if (process.env.DEBUG_VISION)
      console.error("vision: ollama said", JSON.stringify(text.slice(0, 120)));
    if (!text) return null;
    if (/^decorative\.?$/i.test(text))
      return {
        value: "",
        source: "vision model (" + VISION.ollamaModel + ")",
        provisional: true,
        vision: true,
      };
    return {
      value: text.replace(/^["']|["']$/g, "").slice(0, 300),
      source: "vision model (" + VISION.ollamaModel + ")",
      provisional: true,
      vision: true,
    };
  } catch (e) {
    if (process.env.DEBUG_VISION) console.error("vision: ollama error", e.message);
    return null;
  }
}

async function openaiDraft(imageUrl, context) {
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
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    const parsed = JSON.parse(text);
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const inner = JSON.parse(content);
    if (typeof inner.alt !== "string") return null;
    return {
      value: inner.alt.trim().slice(0, 300),
      source: "vision model (" + VISION.model + ")",
      provisional: true,
      vision: true,
      uncertainty: String(inner.uncertainty || "").slice(0, 300),
    };
  } catch {
    return null;
  }
}

/**
 * Draft alt text for one image. Always resolves; never throws into the scan.
 */
export async function draftAlt({ imageUrl, context }) {
  if (!imageUrl) return fallback();
  if (VISION.endpoint && VISION.key) {
    const remote = await openaiDraft(imageUrl, context);
    if (remote) return remote;
  }
  const local = await ollamaDraft(imageUrl, context);
  if (local) return local;
  return fallback();
}
