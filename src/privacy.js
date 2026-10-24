// Never serialize a document for remote processing. Extract first, redact second.
export function redact(s) {
  return String(s)
    .slice(0, 600)
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[NATIONAL-ID]")
    .replace(/(?:\+91[ -]?)?\b[6-9]\d{9}\b/g, "[PHONE]")
    .replace(/\b(?:Bearer|token|password)\s*[:=]?\s*\S+/gi, "[SECRET]")
    .slice(0, 600);
}
export function remotePayload({ signedIn, consent, context }) {
  if (signedIn) throw Error("Signed-in evidence is local-only");
  if (!consent) throw Error("Explicit remote consent required");
  return { purpose: "accessibility-review", text: redact(context) };
}
