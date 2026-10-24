import * as cheerio from "cheerio";
import { Manifest } from "./contracts.js";
import { hash } from "./store.js";
export function approvalsComplete(version) {
  const m = Manifest.parse(version.manifest);
  return m.operations
    .filter((o) => o.semantic)
    .every((o) =>
      version.approvals.some(
        (a) =>
          a.action !== "reject" &&
          a.operation === o.id &&
          a.operationHash === hash(o) &&
          a.manifestHash === hash(m),
      ),
    );
}
export function transform(html, version, target, path) {
  try {
    const m = Manifest.parse(version.manifest);
    if (!approvalsComplete(version))
      return { html, applied: false, reason: "semantic-approval-missing" };
    if (m.target !== target.id || m.path !== path)
      return { html, applied: false, reason: "scope-mismatch" };
    if (hash(html) !== m.baselineHash)
      return { html, applied: false, reason: "document-precondition-mismatch" };
    const $ = cheerio.load(html);
    if ($("html").attr("lang") !== m.locale)
      return { html, applied: false, reason: "locale-mismatch" };
    for (const o of m.operations) {
      const el = $(o.selector);
      if (el.length !== 1 || (el.attr(o.attribute) ?? null) !== o.before)
        return {
          html,
          applied: false,
          reason: "element-precondition-mismatch",
        };
      if (
        o.attribute === "class" &&
        !$("style").text().includes(".sugamya-contrast")
      )
        return { html, applied: false, reason: "approved-class-unavailable" };
    }
    for (const o of m.operations) $(o.selector).attr(o.attribute, o.value);
    return { html: $.html(), applied: true, reason: "approved-manifest" };
  } catch {
    return { html, applied: false, reason: "manifest-invalid" };
  }
}
